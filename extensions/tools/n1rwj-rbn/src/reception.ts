import type { ReceptionReport } from '../../../../packages/reception/src/reports.ts'
import { type RbnReport, receiverCoordinates } from './model.ts'

export function toReceptionReport(report: RbnReport): ReceptionReport {
  const location = receiverCoordinates(report)
  return {
    id: report.id,
    transmitter: { call: report.call },
    receiver: {
      call: report.receiver,
      country: report.country ?? undefined,
      location: location ? { ...location, source: 'provider' } : undefined,
    },
    frequencyHz: report.frequencyKhz * 1000,
    band: report.band,
    mode: report.mode,
    timeMs: report.timeMs,
    snrDb: report.snrDb ?? undefined,
    wpm: report.wpm ?? undefined,
  }
}
