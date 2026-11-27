import { readStoredValue } from './storage.ts';

export type DeparturePolicy = 'hybrid' | 'legacy';
export const DEFAULT_DEPARTURE_POLICY: DeparturePolicy = 'hybrid';
export const DEPARTURE_POLICY_KEY = 'rairio:departure-policy';
export const DEPARTURE_DIAGNOSTICS_KEY = 'rairio:departure-diagnostics';
export const DEPARTURE_DISPLAY_DIAGNOSTICS_KEY = 'rairio:departure-display-diagnostics';
export const EARLY_APPROACH_END_KEY = 'rairio:early-approach-end';

/** Internal per-tab override; no new UI, network requests or persisted observations. */
export function readDeparturePolicy(): DeparturePolicy {
  try {
    const selected =
      sessionStorage.getItem(DEPARTURE_POLICY_KEY) ?? localStorage.getItem(DEPARTURE_POLICY_KEY);
    if (selected === 'hybrid' || selected === 'legacy') {
      sessionStorage.setItem(DEPARTURE_POLICY_KEY, selected);
      return selected;
    }
  } catch {
    /* unavailable storage uses the shipped default */
  }
  return DEFAULT_DEPARTURE_POLICY;
}

export function departureDiagnosticsEnabled() {
  try {
    return sessionStorage.getItem(DEPARTURE_DIAGNOSTICS_KEY) === '1';
  } catch {
    return false;
  }
}

export function departureDisplayDiagnosticsEnabled() {
  try {
    return sessionStorage.getItem(DEPARTURE_DISPLAY_DIAGNOSTICS_KEY) === '1';
  } catch {
    return false;
  }
}

export function earlyApproachEndEnabled() {
  return readStoredValue(EARLY_APPROACH_END_KEY) !== 'off';
}
