import {
  resolveHybridDepartures,
  turnoverAwaitsObservation,
} from '../src/lib/hybrid-departures.ts';
import { TRAIN_POSITION_MAX_AGE } from '../shared/train-positions.ts';

const STEP_MS = 1000;
const PUSH_INTERVAL_MS = 2000;
const FORECAST_MS = 40000;
const REPLAY_LIMIT_MS = 16 * 60000;

function displayFrom({
  board,
  presentation,
  presentations,
  position,
  estimatedDiagram,
  livePhase,
}) {
  return { board, presentation, presentations, position: estimatedDiagram ?? position, livePhase };
}

export function departureBoardPlanner(route, startedAt, observe) {
  let replayedAt = startedAt - STEP_MS;
  let replayed;
  let publishedDepartures = [];

  return (wallTime) => {
    const generatedAt = Math.max(wallTime, startedAt, replayedAt);
    if (replayedAt < generatedAt - REPLAY_LIMIT_MS) {
      const elapsed = Math.floor((generatedAt - startedAt) / STEP_MS) * STEP_MS;
      replayedAt = startedAt + elapsed - REPLAY_LIMIT_MS;
      replayed = undefined;
    }

    // Advance the shared history on a fixed grid. Opening another browser
    // must not change which observations have already been applied.
    for (let at = replayedAt + STEP_MS; at <= generatedAt; at += STEP_MS) {
      let session = replayed?.session;
      const published = publishedDepartures.find(({ turnover }) => turnover.at === at);
      const train = session?.trains.get(published?.turnover.train);
      if (train && train.retirement?.reason !== 'observed') {
        // The displayed switch took effect on this tick. A missing snapshot
        // cannot revoke its observed departure. Recompute the other trains.
        const trains = new Map(session.trains);
        trains.set(published.turnover.train, {
          ...train,
          cleared: true,
          retirement: published.retirement,
        });
        session = { ...session, trains, lastTurnover: published.turnover };
      }
      replayed = resolveHybridDepartures(route, new Date(at), observe(at), session);
      replayedAt = at;
    }
    const positions = observe(generatedAt);
    const current =
      replayed && replayedAt === generatedAt
        ? replayed
        : resolveHybridDepartures(route, new Date(generatedAt), positions, replayed?.session);
    const frames = [{ at: generatedAt, display: displayFrom(current) }];

    // Forecast from the observations we already have. Source expiry and
    // projected clearance can change the lead train when a new sample arrives.
    const leaseEnd = generatedAt + FORECAST_MS;
    let forecastUntil = leaseEnd;
    for (const p of [...(positions?.trains ?? []), ...(positions?.collected?.trains ?? [])]) {
      const sourceExpiry = Math.min(
        Date.parse(p.updatedAt) + TRAIN_POSITION_MAX_AGE,
        Date.parse(p.validUntil),
      );
      if (sourceExpiry > generatedAt) forecastUntil = Math.min(forecastUntil, sourceExpiry);
    }
    let forecast = current;
    let previousDisplay = JSON.stringify(frames[0].display);
    publishedDepartures = [];
    // Use the same grid across refreshes so an upcoming frame's time does not
    // drift by a fraction of a second each time a client receives a new plan.
    for (let at = replayedAt + STEP_MS; at < forecastUntil; at += STEP_MS) {
      const next = resolveHybridDepartures(route, new Date(at), positions, forecast.session);
      if (turnoverAwaitsObservation(current.session, forecast.session, next.session)) break;
      const turnover = next.session.lastTurnover;
      const retirement = next.session.trains.get(turnover?.train)?.retirement;
      if (turnover?.at === at && retirement?.reason === 'observed')
        publishedDepartures.push({ turnover, retirement });
      forecast = next;
      const display = displayFrom(next);
      const serialized = JSON.stringify(display);
      if (serialized !== previousDisplay) {
        frames.push({ at, display });
        previousDisplay = serialized;
      }
    }
    const lastDisplay = frames.at(-1).display;
    const liveApproach = lastDisplay.presentation?.kind === 'approaching' && lastDisplay.position;
    const validUntil = liveApproach ? forecastUntil : leaseEnd;
    return { version: 1, generatedAt, validUntil, frames };
  };
}

export function departureBoardTransport(getPlan, enabled) {
  const clients = new Set();
  let interval;

  function remove(res) {
    clients.delete(res);
    if (!clients.size) clearInterval(interval);
  }

  function send(res, body) {
    if (res.writableNeedDrain) {
      remove(res);
      res.end();
      return;
    }
    res.write(`event: board\ndata: ${body}\n\n`);
  }

  function broadcast() {
    const body = JSON.stringify(getPlan());
    for (const client of clients) send(client, body);
  }

  return {
    close() {
      for (const client of clients) {
        remove(client);
        client.end();
      }
    },
    serve(req, res) {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' }).end();
        return;
      }
      const stream = req.headers.accept?.includes('text/event-stream');
      if (!enabled(stream ? 'sse' : 'http')) {
        res.writeHead(503).end();
        return;
      }
      const body = JSON.stringify(getPlan());
      if (!stream) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(body);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.once('close', () => remove(res));
      clients.add(res);
      if (clients.size === 1) interval = setInterval(broadcast, PUSH_INTERVAL_MS);
      send(res, body);
    },
  };
}
