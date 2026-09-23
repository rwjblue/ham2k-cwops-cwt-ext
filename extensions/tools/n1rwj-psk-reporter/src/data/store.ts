import {
  type ReceptionReport,
  receptionKey,
} from '../../../../../packages/reception/src/reports.ts'
import { parsePskPayload } from './parser.ts'

/** Transport-independent, bounded live window. Nothing here opens a socket. */
export function createReportStore(capacity = 1000) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000)
    throw new Error('Invalid report capacity')
  const reports = new Map<string, ReceptionReport>()
  let droppedAt: number | undefined
  const maxAgeMs = 60 * 60_000
  function prune(now: number) {
    for (const [key, report] of reports) if (report.timeMs < now - maxAgeMs) reports.delete(key)
    if (droppedAt !== undefined && droppedAt < now - maxAgeMs) droppedAt = undefined
  }
  return {
    ingest(payload: string, now: number): boolean {
      prune(now)
      const report = parsePskPayload(payload)
      if (!report || report.timeMs < now - maxAgeMs || report.timeMs > now + 60_000) return false
      const key = receptionKey(report)
      const previous = reports.get(key)
      if (
        previous &&
        (previous.timeMs > report.timeMs ||
          (previous.timeMs === report.timeMs && previous.id.localeCompare(report.id) >= 0))
      )
        return false
      reports.set(key, report)
      if (reports.size > capacity) {
        const oldest = [...reports.entries()].sort(
          (a, b) => a[1].timeMs - b[1].timeMs || a[0].localeCompare(b[0]),
        )[0]
        reports.delete(oldest[0])
        droppedAt = now
      }
      return true
    },
    snapshot(now: number, windowMinutes: number) {
      prune(now)
      const window = [15, 30, 60].includes(windowMinutes) ? windowMinutes : 15
      return {
        reports: [...reports.values()].filter((report) => report.timeMs >= now - window * 60_000),
        capped: droppedAt !== undefined,
      }
    },
    clear() {
      reports.clear()
      droppedAt = undefined
    },
  }
}
