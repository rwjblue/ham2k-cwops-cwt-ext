import { normalizeCall } from './callsign.ts'
import { bearingDegrees, type Coordinates, distanceKm } from './geography.ts'
import type { MapStation } from './map/types.ts'
import type { UiReport } from './ui/types.ts'

export interface ReceptionStation {
  call: string
  country?: string
  location?: Coordinates & {
    grid?: string
    source: 'reported-grid' | 'provider'
  }
}

/** A directed observation. SNR is always measured at the receiver. */
export interface ReceptionReport {
  id: string
  transmitter: ReceptionStation
  receiver: ReceptionStation
  frequencyHz: number
  band: string
  mode: string
  timeMs: number
  snrDb?: number
  wpm?: number
}

export type ReceptionDirection = 'outgoing' | 'incoming'

/** Newest observation wins, never strongest SNR; ties are deterministic. */
export function latestBy<T extends { id: string; timeMs: number }>(
  reports: readonly T[],
  key: (report: T) => string,
): T[] {
  const latest = new Map<string, T>()
  for (const report of reports) {
    const previous = latest.get(key(report))
    if (
      !previous ||
      report.timeMs > previous.timeMs ||
      (report.timeMs === previous.timeMs && report.id.localeCompare(previous.id) > 0)
    ) {
      latest.set(key(report), report)
    }
  }
  return [...latest.values()]
}

export function receptionKey(report: ReceptionReport): string {
  return JSON.stringify([report.transmitter.call, report.receiver.call, report.band, report.mode])
}

export function ageLabel(time: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  return minutes === 0 ? '<1 min ago' : `${minutes} min ago`
}

export function utcLabel(time: number): string {
  return `${new Date(time).toISOString().slice(11, 19)} UTC`
}

export function receptionView(
  reports: readonly ReceptionReport[],
  call: string,
  direction: ReceptionDirection,
  now: number,
  origin?: Coordinates,
): { rows: UiReport[]; stations: MapStation[] } {
  const watched = normalizeCall(call)
  const remote = (report: ReceptionReport) =>
    direction === 'outgoing' ? report.receiver : report.transmitter
  const selected = latestBy(
    reports.filter(
      (report) =>
        (direction === 'outgoing' ? report.transmitter : report.receiver).call === watched,
    ),
    receptionKey,
  ).sort((a, b) => b.timeMs - a.timeMs || remote(a).call.localeCompare(remote(b).call))
  const rows = selected.map((report): UiReport => {
    const station = remote(report)
    return {
      call: station.call,
      country: station.country,
      band: report.band,
      mode: report.mode,
      frequencyKhz: report.frequencyHz / 1000,
      snrDb: report.snrDb,
      wpm: report.wpm,
      timeMs: report.timeMs,
      age: ageLabel(report.timeMs, now),
      ageMinutes: Math.max(0, (now - report.timeMs) / 60_000),
      distanceKm: origin && station.location ? distanceKm(origin, station.location) : undefined,
      bearingDeg: origin && station.location ? bearingDegrees(origin, station.location) : undefined,
    }
  })
  const stations = new Map<string, MapStation>()
  const seen = new Set<string>()
  for (const report of selected) {
    const station = remote(report)
    // Preserve the newest station observation, including an unknown location.
    // An older report on another band must not silently restore stale coordinates.
    if (seen.has(station.call)) continue
    seen.add(station.call)
    if (station.location)
      stations.set(station.call, {
        ...station.location,
        key: station.call,
        label: station.call,
        ageMinutes: Math.max(0, (now - report.timeMs) / 60_000),
      })
  }
  return { rows, stations: [...stations.values()] }
}
