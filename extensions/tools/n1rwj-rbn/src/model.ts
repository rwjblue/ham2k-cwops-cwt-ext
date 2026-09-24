import type { Coordinates } from '../../../../packages/reception/src/geography.ts'
import { distanceKm } from '../../../../packages/reception/src/geography.ts'
import { latestBy } from '../../../../packages/reception/src/reports.ts'
import type { RbnFailureKind } from './data/errors.ts'

export { isValidCall, normalizeCall } from '../../../../packages/reception/src/callsign.ts'
export type { Coordinates } from '../../../../packages/reception/src/geography.ts'
export { bearingDegrees, distanceKm } from '../../../../packages/reception/src/geography.ts'
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
  failureKind?: RbnFailureKind
  refresh?: {
    state: 'attempted' | 'cooldown' | 'rate-limit' | 'offline'
    manualAtMs: number | null
    automaticAtMs: number | null
  }
  /** The response omitted matching rows, or exceeded the defensive row limit. */
  capped: boolean
}

export type ReportSort = 'age' | 'receiver' | 'snr' | 'distance' | 'frequency' | 'wpm'

/** Keep a receiver's latest report on each band and mode, never its maximum SNR. */
export function latestReports(reports: readonly RbnReport[]): RbnReport[] {
  return latestBy(
    reports,
    (report) => `${report.call}|${report.receiver}|${report.band}|${report.mode}`,
  ).sort((a, b) => b.timeMs - a.timeMs || a.receiver.localeCompare(b.receiver))
}

export function receiverCoordinates(report: RbnReport): Coordinates | null {
  return report.receiverLatitude !== null && report.receiverLongitude !== null
    ? { latitude: report.receiverLatitude, longitude: report.receiverLongitude }
    : null
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
