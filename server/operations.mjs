import { OPERATIONS_INTERVAL, OPERATIONS_SOURCE } from '../shared/railways.ts';
import { parseOperations } from './toei-operations-source.mjs';

export { parseOperations } from './toei-operations-source.mjs';

export function createOperationsProvider({ fetchImpl = fetch, now = Date.now } = {}) {
  let lastSuccess = null;
  let pending = null;
  async function request() {
    try {
      const response = await fetchImpl(OPERATIONS_SOURCE, {
        signal: AbortSignal.timeout(8000),
        // Workers supports follow/manual; reject redirects through response.ok.
        redirect: 'manual',
      });
      if (!response.ok)
        throw new Error(`運行情報の取得に失敗しました（HTTP ${response.status}）。`);
      const snapshot = parseOperations(await response.json(), new Date(now()).toISOString());
      lastSuccess = snapshot;
      return snapshot;
    } catch (error) {
      if (lastSuccess) return { ...lastSuccess, cached: true };
      throw error;
    } finally {
      pending = null;
    }
  }
  return {
    get() {
      if (lastSuccess && now() - Date.parse(lastSuccess.fetchedAt) < OPERATIONS_INTERVAL)
        return Promise.resolve(lastSuccess);
      // Coalesce concurrent page loads; upstream is fetched at most once per five minutes.
      if (!pending) pending = request();
      return pending;
    },
  };
}
