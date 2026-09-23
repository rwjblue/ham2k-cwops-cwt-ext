export interface Coordinates {
  latitude: number
  longitude: number
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180

export function distanceKm(from: Coordinates, to: Coordinates): number {
  const lat1 = radians(from.latitude)
  const lat2 = radians(to.latitude)
  const deltaLat = lat2 - lat1
  const deltaLon = radians(to.longitude - from.longitude)
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)))
}

export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const lat1 = radians(from.latitude)
  const lat2 = radians(to.latitude)
  const deltaLon = radians(to.longitude - from.longitude)
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
