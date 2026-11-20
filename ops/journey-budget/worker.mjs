import { DurableObject } from 'cloudflare:workers';

// Multiple Pages instances reserve against the same rolling window.
const day = 24 * 60 * 60_000;
const planLimit = 600;
const fareReplayLifetime = 30 * 60_000;

export class JourneyBudget extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS plan_requests (at INTEGER NOT NULL)');
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS fare_requests (id TEXT PRIMARY KEY, at INTEGER NOT NULL)',
    );
  }

  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const now = Date.now();
    const path = new URL(request.url).pathname;
    if (path === '/plan') {
      const status = this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM plan_requests WHERE at <= ?', now - day);
        if (this.sql.exec('SELECT COUNT(*) AS count FROM plan_requests').one().count >= planLimit)
          return 429;
        this.sql.exec('INSERT INTO plan_requests (at) VALUES (?)', now);
        return 204;
      });
      return new Response(null, { status });
    }
    if (path === '/fare') {
      const id = await request.text();
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(id)) {
        return new Response(null, { status: 400 });
      }
      const status = this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM fare_requests WHERE at <= ?', now - fareReplayLifetime);
        if (this.sql.exec('SELECT id FROM fare_requests WHERE id = ?', id).toArray().length)
          return 409;
        // RapidAPI Basic enforces the billing-period cap. This table only prevents duplicate requests.
        this.sql.exec('INSERT INTO fare_requests (id, at) VALUES (?, ?)', id, now);
        return 204;
      });
      return new Response(null, { status });
    }
    return new Response(null, { status: 404 });
  }
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};
