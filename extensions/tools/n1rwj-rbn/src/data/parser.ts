import { gridToLocation } from '@ham2k/lib-geo-tools'
import { bandForExactFrequencyInMHz } from '@ham2k/lib-operation-data'
import type { RbnReport } from '../model.ts'
import { isValidCall, normalizeCall } from '../model.ts'

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function bounded(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function isCount(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

/** RBN receiver IDs can append a skimmer suffix, such as KM3T-5. */
export function isValidReceiver(value: string): boolean {
  const separator = value.indexOf('-')
  if (separator < 0) return isValidCall(value)
  return (
    isValidCall(value.slice(0, separator)) && /^[A-Z0-9]{1,8}$/.test(value.slice(separator + 1))
  )
}

export function receiverLocation(value: unknown): [number | null, number | null] {
  const grid = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/.test(grid)) return [null, null]
  // Use the grid center; neither source guarantees an exact receiver position.
  return gridToLocation(grid)
}

export function parseRbnPayload(
  value: unknown,
  call: string,
  windowMinutes: number,
  now: number,
  limit = 500,
): { reports: RbnReport[]; capped: boolean } {
  const data = record(value)
  if (
    !data ||
    data.error !== undefined ||
    !Array.isArray(data.spots) ||
    !isCount(data.total) ||
    !isCount(data.offset) ||
    !isCount(data.limit, 1)
  ) {
    throw new Error('Vail ReRBN returned an unsupported data format.')
  }
  const reports: RbnReport[] = []
  const cutoff = now - windowMinutes * 60_000
  const watchedCall = normalizeCall(call)
  const rowLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 500
  const entries = data.spots.slice(0, rowLimit)
  let recognizable = false
  for (const value of entries) {
    const row = record(value)
    if (
      !row ||
      !('callsign' in row && 'spotter' in row && 'frequency' in row && 'timestamp' in row)
    )
      continue
    recognizable = true
    const spotCall = typeof row.callsign === 'string' ? normalizeCall(row.callsign) : ''
    const receiver = typeof row.spotter === 'string' ? normalizeCall(row.spotter) : ''
    // The API call filter is a partial match: keep portable suffixes distinct.
    if (spotCall !== watchedCall || !isValidCall(spotCall) || !isValidReceiver(receiver)) continue
    const id =
      isCount(row.id, 1) || (typeof row.id === 'string' && /^[1-9]\d{0,19}$/.test(row.id))
        ? String(row.id)
        : null
    const frequencyKhz = bounded(row.frequency, 100, 1_000_000)
    const timestamp =
      typeof row.timestamp === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.timestamp)
        ? Date.parse(row.timestamp)
        : Number.NaN
    if (!id || !frequencyKhz || !Number.isFinite(timestamp)) continue
    // Despite its name, the shared library's exact helper takes kHz. Its general
    // helper also tries MHz, which would misclassify an invalid 144 kHz as 2m.
    const band = bandForExactFrequencyInMHz(frequencyKhz)
    if (!band) continue
    if (timestamp < cutoff || timestamp > now + 300_000) continue
    const mode =
      typeof row.mode === 'string' && row.mode.trim() && row.mode.length <= 32
        ? row.mode.trim().toUpperCase()
        : 'Unknown'
    const [receiverLatitude, receiverLongitude] = receiverLocation(row.spotter_grid)
    reports.push({
      id,
      call: spotCall,
      receiver,
      frequencyKhz,
      band,
      mode,
      snrDb: bounded(row.snr, -100, 150),
      wpm: mode === 'CW' ? bounded(row.wpm, 1, 100) : null,
      timeMs: timestamp,
      receiverLatitude,
      receiverLongitude,
      country: null,
    })
  }
  // A changed row schema must not look like a successful search with no reports.
  if (entries.length && !recognizable) {
    throw new Error('Vail ReRBN returned an unsupported data format.')
  }
  reports.sort((a, b) => b.timeMs - a.timeMs || a.id.localeCompare(b.id))
  return {
    reports,
    capped: data.spots.length > rowLimit || data.total > data.offset + data.spots.length,
  }
}
