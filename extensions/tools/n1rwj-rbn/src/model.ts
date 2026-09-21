export interface RbnReport {
  id: string
  call: string
  receiver: string
  frequencyKhz: number
  band: string
  mode: string
  snrDb: number | null
  wpm: number | null
  timeMs: number
  receiverLatitude: number | null
  receiverLongitude: number | null
  country: string | null
}

export interface RbnSnapshot {
  call: string
  windowMinutes: number
  reports: RbnReport[]
  status: 'ready' | 'empty' | 'stale' | 'error'
  lastAttemptMs: number | null
  lastSuccessMs: number | null
  error: string | null
  /** The server returned the full row limit; there may be additional reports. */
  capped: boolean
}

export interface Coordinates {
  latitude: number
  longitude: number
}

export type ReportSort = 'age' | 'receiver' | 'snr' | 'distance' | 'frequency' | 'wpm'

export function normalizeCall(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidCall(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 24 &&
    /^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value)
  )
}

/** Keep a receiver's latest report on each band and mode, never its maximum SNR. */
export function latestReports(reports: readonly RbnReport[]): RbnReport[] {
  const latest = new Map<string, RbnReport>()
  for (const report of reports) {
    const key = `${report.receiver}|${report.band}|${report.mode}`
    const previous = latest.get(key)
    if (
      !previous ||
      report.timeMs > previous.timeMs ||
      (report.timeMs === previous.timeMs && report.id.localeCompare(previous.id) > 0)
    ) {
      latest.set(key, report)
    }
  }
  return [...latest.values()].sort(
    (a, b) => b.timeMs - a.timeMs || a.receiver.localeCompare(b.receiver),
  )
}

export function receiverCoordinates(report: RbnReport): Coordinates | null {
  return report.receiverLatitude !== null && report.receiverLongitude !== null
    ? { latitude: report.receiverLatitude, longitude: report.receiverLongitude }
    : null
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

/** Numeric sorts put missing measurements last, in either direction. */
export function sortReports(
  reports: readonly RbnReport[],
  sort: ReportSort,
  origin?: Coordinates | null,
  descending = sort === 'snr' || sort === 'distance' || sort === 'wpm',
): RbnReport[] {
  const value = (report: RbnReport): number | null => {
    if (sort === 'age') return -report.timeMs
    if (sort === 'snr') return report.snrDb
    if (sort === 'wpm') return report.wpm
    if (sort === 'frequency') return report.frequencyKhz
    const receiver = receiverCoordinates(report)
    return origin && receiver ? distanceKm(origin, receiver) : null
  }
  return [...reports].sort((a, b) => {
    let order = 0
    if (sort === 'receiver') {
      order = a.receiver.localeCompare(b.receiver)
    } else {
      const av = value(a)
      const bv = value(b)
      if (av === null && bv !== null) return 1
      if (bv === null && av !== null) return -1
      order = av !== null && bv !== null ? av - bv : 0
    }
    return (
      (descending ? -order : order) || b.timeMs - a.timeMs || a.receiver.localeCompare(b.receiver)
    )
  })
}
