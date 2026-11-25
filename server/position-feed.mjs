import { estimatePosition } from '../shared/position-estimate.ts';
import { trainPositionIsFresh } from '../shared/train-positions.ts';
import { FEED_TTL } from '../shared/position-feed.ts';

// Shared by the production reader and the entirely local preview. No mutation
// of observations, projection models, or collector storage.
export class PositionFeedEngine {
  previous = new Map();
  calculate(snapshot, ids, now) {
    const direct = new Map(snapshot.trains.map((p) => [p.id, p]));
    const collected = new Map((snapshot.collected?.trains ?? []).map((p) => [p.id, p]));
    const rows = new Map();
    for (const [id, p] of this.previous) if (now - p.at >= 90000) this.previous.delete(id);
    for (const id of ids) {
      const d = direct.get(id),
        c = collected.get(id);
      const raw = d && trainPositionIsFresh(d, now) ? d : undefined;
      const observed = c && trainPositionIsFresh(c, now) ? c : undefined;
      if (!raw && !observed) continue;
      const estimate =
        observed && estimatePosition(observed, raw, now, this.previous.get(id)?.estimate);
      if (estimate) this.previous.set(id, { at: now, estimate });
      rows.set(id, { id, direct: raw, collected: observed, estimate });
    }
    return rows;
  }
}
export function feedFrame(snapshot, rows, previous, sequence, now) {
  const upserts = [...rows.values()].filter(
    (r) => JSON.stringify(r) !== JSON.stringify(previous?.get(r.id)),
  );
  return {
    type: previous ? 'patch' : 'snapshot',
    sequence,
    generatedAt: now,
    validUntil: now + FEED_TTL,
    fetchedAt: snapshot.fetchedAt,
    collectedAt: snapshot.collected?.fetchedAt ?? null,
    upserts,
    removed: previous ? [...previous.keys()].filter((id) => !rows.has(id)) : [],
  };
}
export const FEED_LIMITS = Object.freeze({
  clients: 20,
  unionIds: 256,
  sessionMs: 600000,
});
const FEED_INTERVAL_MS = 2000;

// A single reader already exists for this four-line collector. Reuse it, rather
// than creating an always-active Durable Object per station or per viewer.
export class PositionFeedHub {
  clients = new Set();
  engine = new PositionFeedEngine();
  timer;
  ticking = false;
  constructor(read, clock = Date.now) {
    this.read = read;
    this.clock = clock;
  }
  open(ids) {
    const union = new Set([...this.clients].flatMap((c) => c.ids).concat(ids));
    if (this.clients.size >= FEED_LIMITS.clients || union.size > FEED_LIMITS.unionIds)
      return new Response(null, { status: 429, headers: { 'Retry-After': '300' } });
    const client = { ids, started: this.clock(), sequence: 0 };
    const stream = new ReadableStream(
      {
        start: (controller) => {
          client.controller = controller;
          this.clients.add(client);
        },
        cancel: () => this.remove(client),
      },
      { highWaterMark: 2 },
    );
    // New subscribers join the next shared tick. A burst of
    // connections must not accelerate computation or overflow existing clients.
    if (this.clients.size === 1) void this.tick();
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
    });
  }
  remove(c) {
    this.clients.delete(c);
    try {
      c.controller.close();
    } catch {
      /* canceled by consumer */
    }
    if (!this.clients.size) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
  async tick() {
    if (this.ticking || !this.clients.size) return;
    clearTimeout(this.timer);
    this.ticking = true;
    try {
      const now = this.clock();
      for (const c of this.clients)
        if (now - c.started >= FEED_LIMITS.sessionMs || c.controller.desiredSize <= 0)
          this.remove(c);
      if (!this.clients.size) return;
      const snapshot = await this.read();
      if (!snapshot) throw Error('Unavailable');
      const at = this.clock();
      const union = [...new Set([...this.clients].flatMap((c) => c.ids))];
      const rows = this.engine.calculate(snapshot, union, at);
      for (const c of this.clients) {
        const selected = new Map(c.ids.flatMap((id) => (rows.has(id) ? [[id, rows.get(id)]] : [])));
        const frame = feedFrame(snapshot, selected, c.previous, ++c.sequence, at);
        c.controller.enqueue(
          new TextEncoder().encode(`event: positions\ndata: ${JSON.stringify(frame)}\n\n`),
        );
        c.previous = selected;
      }
    } catch {
      for (const c of this.clients) this.remove(c);
    } finally {
      this.ticking = false;
      if (this.clients.size) this.timer = setTimeout(() => void this.tick(), FEED_INTERVAL_MS);
    }
  }
}
