/** Read one position, then release the browser's location subscription on every exit. */
export function requestLocationOnce(
  geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'>,
  onPosition: PositionCallback,
  onError: (code: number) => void,
) {
  let watchId: number | undefined;
  let finished = false;
  const release = () => {
    if (watchId !== undefined) {
      geolocation.clearWatch(watchId);
      watchId = undefined;
    }
  };
  const stop = () => {
    finished = true;
    clearTimeout(timer);
    release();
  };
  const fail = (code: number) => {
    if (finished) return;
    stop();
    onError(code);
  };
  // Also limit permission waits, which are outside the provider's own timeout.
  const timer = setTimeout(() => fail(3), 15000);
  try {
    watchId = geolocation.watchPosition(
      (position) => {
        if (finished) return;
        stop();
        onPosition(position);
      },
      (error) => fail(error.code),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
    // Test providers or embedded browsers can deliver a callback before returning the ID.
    if (finished) release();
  } catch {
    fail(2);
  }
  return stop;
}
