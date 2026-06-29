export function getPreciseLocation(
  onAccuracyUpdate?: (accuracy: number) => void
): Promise<{ coords: GeolocationCoordinates; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    let watchId: number;

    const done = (timedOut: boolean) => {
      navigator.geolocation.clearWatch(watchId);
      if (best) resolve({ coords: best.coords, timedOut });
      else reject(new Error("Could not get location"));
    };

    const timeout = setTimeout(() => done(true), 20000);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        best = pos;
        onAccuracyUpdate?.(pos.coords.accuracy);
        if (pos.coords.accuracy <= 20) {
          clearTimeout(timeout);
          done(false);
        }
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  });
}
