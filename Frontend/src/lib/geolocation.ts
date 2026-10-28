const DEFAULT_LOCATION = { lat: 6.9271, lng: 79.8612 };

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export async function getCurrentPositionWithFallback(): Promise<{ lat: number; lng: number }> {
  try {
    return await getCurrentPosition();
  } catch {
    return DEFAULT_LOCATION;
  }
}

export { DEFAULT_LOCATION };
