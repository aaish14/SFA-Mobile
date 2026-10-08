const radians = (value: number) => (value * Math.PI) / 180;
export function distanceInMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radius = 6371000,
    dLat = radians(b.latitude - a.latitude),
    dLon = radians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(
    radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
  );
}
