/** Storage is optional: blocked access, corrupt JSON and quota failures must not break the app. */
export function clearLegacyTransitData(): void {
  try {
    const storage = localStorage;
    const keys = ['kanto:operations:v1'];
    // Use the Storage API: enumeration of named properties differs across browsers.
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith('kanto:station:v1:')) keys.push(key);
    }
    for (const key of keys) {
      try {
        storage.removeItem(key);
      } catch {
        // A failure for one legacy item must not prevent cleanup of the others.
      }
    }
  } catch {
    /* Storage may be disabled. */
  }
}

export function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Continue using the current in-memory data when persistence is unavailable.
  }
}

export function readStoredJson<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const value: unknown = JSON.parse(readStoredValue(key) || 'null');
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  try {
    writeStoredValue(key, JSON.stringify(value));
  } catch {
    // Serialization can fail independently of browser storage.
  }
}
