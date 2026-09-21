import type { RbnReport } from '../model.ts'
import { isValidCall, normalizeCall } from '../model.ts'

const requiredSpotFields = ['de', 'freq', 'dx', 'db', 'wpm', 'band', 'mode', 'epoch'] as const
const requiredCallFields = ['country', 'lat', 'long'] as const

export interface RbnMetadata {
  spotFields: Record<(typeof requiredSpotFields)[number], number>
  callFields: Record<(typeof requiredCallFields)[number], number>
  bands: Record<string, string>
  modes: Record<string, string>
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finite(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function bounded(value: unknown, min: number, max: number): number | null {
  const number = finite(value)
  return number !== null && number >= min && number <= max ? number : null
}

/** RBN receiver IDs can append a skimmer suffix, such as KM3T-5. */
function isValidReceiver(value: string): boolean {
  const separator = value.indexOf('-')
  if (separator < 0) return isValidCall(value)
  return (
    isValidCall(value.slice(0, separator)) && /^[A-Z0-9]{1,8}$/.test(value.slice(separator + 1))
  )
}

function fieldIndexes<T extends string>(value: unknown, required: readonly T[]): Record<T, number> {
  if (!Array.isArray(value)) throw new Error('RBN returned an unsupported data format.')
  const result = {} as Record<T, number>
  for (const field of required) {
    const index = value.indexOf(field)
    if (index < 0) throw new Error('RBN returned an unsupported data format.')
    result[field] = index
  }
  return result
}

export function parseRbnMetadata(value: unknown): RbnMetadata {
  const data = record(value)
  if (!data || !Array.isArray(data.bands) || !record(data.modes)) {
    throw new Error('RBN returned an unsupported data format.')
  }
  const bands: Record<string, string> = {}
  for (const item of data.bands) {
    const band = record(item)
    const code = finite(band?.code)
    const meters = bounded(band?.meters, 1, 1000)
    if (code !== null && meters !== null) bands[String(code)] = `${meters}m`
  }
  const modes: Record<string, string> = {}
  for (const [code, item] of Object.entries(record(data.modes) ?? {})) {
    const mode = record(item)?.mode
    if (typeof mode === 'string' && mode.trim() && mode.length <= 32)
      modes[code] = mode.trim().toUpperCase()
  }
  if (!Object.keys(bands).length) {
    throw new Error('RBN returned an unsupported data format.')
  }
  return {
    spotFields: fieldIndexes(data.spot_fields, requiredSpotFields),
    callFields: fieldIndexes(data.call_info_fields, requiredCallFields),
    bands,
    modes,
  }
}

export function parseRbnPayload(
  value: unknown,
  metadata: RbnMetadata,
  call: string,
  windowMinutes: number,
  now: number,
  limit = 500,
): { reports: RbnReport[]; capped: boolean } {
  const data = record(value)
  if (!data || data.error !== undefined || bounded(data.now, 1, 1e12) === null) {
    throw new Error('RBN returned an unsupported data format.')
  }
  const spots = data.spots === undefined ? {} : record(data.spots)
  if (!spots) throw new Error('RBN returned an unsupported data format.')
  const callInfo = record(data.call_info) ?? {}
  const fields = metadata.spotFields
  const reports: RbnReport[] = []
  const entries = Object.entries(spots)
  const cutoff = now - windowMinutes * 60_000
  for (const [id, row] of entries.slice(0, limit)) {
    if (!Array.isArray(row)) continue
    const spotCall = typeof row[fields.dx] === 'string' ? normalizeCall(row[fields.dx]) : ''
    const receiver = typeof row[fields.de] === 'string' ? normalizeCall(row[fields.de]) : ''
    // Even if the site's undocumented filter changes, never show a global feed.
    if (spotCall !== call || !isValidReceiver(receiver)) continue
    const frequencyKhz = bounded(row[fields.freq], 100, 1_000_000)
    const epoch = bounded(row[fields.epoch], 1, 1e12)
    const band = metadata.bands[String(row[fields.band])]
    const modeCode = finite(row[fields.mode])
    const mode =
      metadata.modes[String(modeCode)] ?? (modeCode === null ? 'Unknown' : `Mode ${modeCode}`)
    if (!frequencyKhz || !epoch || !band) continue
    const timeMs = epoch * 1000
    if (timeMs < cutoff || timeMs > now + 300_000) continue
    const info = callInfo[receiver]
    const coordinates = Array.isArray(info) ? info : []
    const latitude = bounded(coordinates[metadata.callFields.lat], -90, 90)
    const longitude = bounded(coordinates[metadata.callFields.long], -180, 180)
    const country = coordinates[metadata.callFields.country]
    reports.push({
      id,
      call: spotCall,
      receiver,
      frequencyKhz,
      band,
      mode,
      snrDb: bounded(row[fields.db], -100, 150),
      // RBN reuses this field for digital speeds; only CW measurements are WPM.
      wpm: mode === 'CW' ? bounded(row[fields.wpm], 1, 100) : null,
      timeMs,
      receiverLatitude: latitude !== null && longitude !== null ? latitude : null,
      receiverLongitude: latitude !== null && longitude !== null ? longitude : null,
      country: typeof country === 'string' && country.length <= 100 ? country : null,
    })
  }
  // A nonempty response with no recognizable row structure must not look like silence.
  if (
    entries.length &&
    !entries.some(([, row]) => Array.isArray(row) && row.length > fields.epoch)
  ) {
    throw new Error('RBN returned an unsupported data format.')
  }
  reports.sort((a, b) => b.timeMs - a.timeMs || a.id.localeCompare(b.id))
  return { reports, capped: entries.length >= limit }
}
