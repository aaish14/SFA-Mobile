/**
 * Convert an angle in degrees to radians for the distance formula.
 */
const rad = (v: number) => (v * Math.PI) / 180;
/**
 * Calculate the great-circle distance between two GPS coordinates using the Haversine formula
 * and return rounded metres.
 */
export function distanceInMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = 6371000,
    dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude),
    x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}
