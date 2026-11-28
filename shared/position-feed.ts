import { validTrainPositions, type TrainPositionsSnapshot } from './train-positions.ts';
import type { PositionEstimate } from './position-estimate.ts';

export const FEED_MAX_IDS = 64;
export const FEED_TTL = 20000;
export type FeedRow = {
  id: string;
  direct?: TrainPositionsSnapshot['trains'][number];
  collected?: NonNullable<TrainPositionsSnapshot['collected']>['trains'][number];
  estimate?: PositionEstimate;
};
export interface FeedFrame {
  type: 'snapshot' | 'patch';
  sequence: number;
  generatedAt: number;
  validUntil: number;
  fetchedAt: string;
  collectedAt: string | null;
  upserts: FeedRow[];
  removed: string[];
}
export function parseFeedIds(url: URL): string[] | undefined {
  const ids = [...new Set(url.searchParams.getAll('id'))].sort();
  if (
    !ids.length ||
    ids.length > FEED_MAX_IDS ||
    ids.some(
      (id) =>
        id.length > 180 ||
        !/^odpt\.Train:Toei\.(Asakusa|Mita|Shinjuku|Oedo)\.[A-Za-z0-9_.:-]+$/.test(id),
    )
  )
    return;
  return ids;
}
export function filterPositions(
  snapshot: TrainPositionsSnapshot,
  ids: readonly string[],
): TrainPositionsSnapshot {
  const selected = new Set(ids);
  return {
    ...snapshot,
    trains: snapshot.trains.filter((p) => selected.has(p.id)),
    ...(snapshot.serverEstimates && {
      serverEstimates: {
        ...snapshot.serverEstimates,
        trains: snapshot.serverEstimates.trains.filter((p) => selected.has(p.id)),
      },
    }),
    ...(snapshot.collected === undefined
      ? {}
      : {
          collected: snapshot.collected && {
            ...snapshot.collected,
            trains: snapshot.collected.trains.filter((p) => selected.has(p.id)),
          },
        }),
  };
}
export class FeedReceiver {
  sequence = 0;
  generatedAt = 0;
  rows = new Map<string, FeedRow>();
  readonly ids: readonly string[];
  constructor(ids: readonly string[]) {
    this.ids = ids;
  }
  accept(value: unknown, now: number): TrainPositionsSnapshot {
    const f = value as FeedFrame;
    if (
      !f ||
      !['snapshot', 'patch'].includes(f.type) ||
      !Number.isSafeInteger(f.sequence) ||
      f.sequence < 1 ||
      (f.type === 'patch' && (this.sequence === 0 || f.sequence !== this.sequence + 1)) ||
      (f.type === 'snapshot' && this.sequence !== 0) ||
      !Number.isFinite(f.generatedAt) ||
      f.generatedAt < this.generatedAt ||
      f.generatedAt > now + 60000 ||
      !Number.isFinite(f.validUntil) ||
      f.validUntil <= now ||
      f.validUntil > f.generatedAt + FEED_TTL ||
      !Array.isArray(f.upserts) ||
      !Array.isArray(f.removed) ||
      f.upserts.length > FEED_MAX_IDS ||
      f.removed.length > FEED_MAX_IDS ||
      new Set(f.upserts.map((r) => r?.id)).size !== f.upserts.length ||
      f.removed.some((id) => !this.ids.includes(id))
    )
      throw Error('Invalid position feed');
    const rows = f.type === 'snapshot' ? new Map<string, FeedRow>() : new Map(this.rows);
    for (const id of f.removed) rows.delete(id);
    for (const row of f.upserts) {
      if (
        !row ||
        !this.ids.includes(row.id) ||
        (row.direct && row.direct.id !== row.id) ||
        (row.collected && row.collected.id !== row.id)
      )
        throw Error('Unexpected train');
      const e = row.estimate;
      if (
        e &&
        (!row.collected?.model ||
          e.runId !== row.collected.model.runId ||
          !Number.isFinite(e.visit) ||
          (e.observation !== undefined &&
            (!e.observation ||
              !Number.isSafeInteger(e.observation.at) ||
              !Number.isFinite(e.observation.visit) ||
              e.observation.visit > e.visit ||
              (e.observation.lowerDecileAt !== undefined &&
                (!Number.isSafeInteger(e.observation.lowerDecileAt) ||
                  e.observation.lowerDecileAt <= e.observation.at)))) ||
          !Number.isFinite(e.delaySeconds) ||
          e.delaySeconds < 0 ||
          typeof e.fromStation !== 'string' ||
          (e.toStation !== null && typeof e.toStation !== 'string'))
      )
        throw Error('Invalid estimate');
      rows.set(row.id, row);
    }
    const all = [...rows.values()];
    const result: TrainPositionsSnapshot = {
      fetchedAt: f.fetchedAt,
      trains: all.flatMap((r) => (r.direct ? [r.direct] : [])),
      collected:
        f.collectedAt === null
          ? null
          : {
              fetchedAt: f.collectedAt,
              trains: all.flatMap((r) => (r.collected ? [r.collected] : [])),
            },
      serverEstimates: {
        validUntil: f.validUntil,
        trains: all.flatMap((r) => (r.estimate ? [{ id: r.id, ...r.estimate }] : [])),
      },
    };
    if (!validTrainPositions(result)) throw Error('Invalid observations');
    this.sequence = f.sequence;
    this.generatedAt = f.generatedAt;
    this.rows = rows;
    return result;
  }
}
