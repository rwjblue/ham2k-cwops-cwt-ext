import type { HookContext } from '@ham2k/extension-sdk'
import { createHistoryAdapter } from '../../contest-history/src/index.ts'
import { callLookupKeys, normalizeCall } from '../../n1mm/src/callsign.ts'
import { parseN1mm } from '../../n1mm/src/parse.ts'
import { firstName, LOCATIONS, location } from './exchange.ts'
import { type ContestConfig, object, type Qson, refOf, text } from './model.ts'

export interface HistoryEntry {
  call: string
  name?: string
  location?: string
  timestamp?: number
}
export interface HistoryFile {
  records: Record<string, HistoryEntry>
  count: number
  warnings: number
  updatedAt?: string
}
export function parseHistory(config: ContestConfig, body: string): HistoryFile {
  if (body.length > 5_000_000 || /<(?:!doctype|html|body|script|form)\b/i.test(body))
    throw new Error('Invalid call-history text. Previous data retained.')
  const parsed = parseN1mm(body)
  if (!parsed.usable || parsed.issues.some((issue) => issue.code === 'invalid-row'))
    throw new Error('Invalid call-history file. Previous data retained.')
  if (parsed.associations.some((association) => !config.historyAliases.includes(association)))
    throw new Error(
      `This call-history file is for another contest, not ${config.shortName}. Previous data retained.`,
    )
  const records: Record<string, HistoryEntry> = {}
  for (const row of parsed.rows) {
    const name = firstName(row.fields.name)
    const rawLocation = location(row.fields.exch1 || row.fields.state)
    // AK/HI from generic history become the actual SST exchange, DX. An
    // unrelated numeric exchange must never be interpreted as a location.
    const qth = ['AK', 'HI', 'PR'].includes(rawLocation) ? 'DX' : rawLocation
    if (config.exchange === 'name-location' && qth && !LOCATIONS.includes(qth))
      throw new Error(`Invalid SST location on line ${row.line}. Previous data retained.`)
    records[row.call] = {
      ...records[row.call],
      call: row.call,
      ...(name ? { name } : {}),
      ...(config.exchange === 'name-location' && qth ? { location: qth } : {}),
    }
  }
  return {
    records,
    count: Object.keys(records).length,
    warnings: parsed.issues.length,
    updatedAt: parsed.sourceUpdatedAt,
  }
}
function compatibleEntry(config: ContestConfig, qso: Qson): HistoryEntry | undefined {
  const ref = refOf(qso, config.type)
  if (!ref || qso.deleted || qso.band === 'event') return undefined
  const call = normalizeCall(text(object(qso.their).call))
  return call
    ? {
        call,
        name: firstName(ref.name),
        location: config.exchange === 'name-location' ? location(ref.location) : undefined,
        timestamp: typeof qso.startAtMillis === 'number' ? qso.startAtMillis : undefined,
      }
    : undefined
}
/** Shared operation membership keeps current edits ahead of selected files,
 * with bounded refreshes after resumed scoring and no per-key full-log read. */
export function createHistory(config: ContestConfig) {
  const adapter = createHistoryAdapter({
    refType: config.type,
    toContact: (qso) => compatibleEntry(config, qso),
  })
  return {
    update: adapter.update,
    async suggestions(
      operation: Qson,
      qso: Qson,
      ctx: HookContext,
      file?: HistoryFile,
    ): Promise<{ name?: string; location?: string }> {
      const keys = callLookupKeys(text(object(qso.their).call))
      if (!keys.length) return {}
      const { currentOperation, olderHistory } = await adapter.find(operation, qso, ctx)
      const recentFirst = (entries: HistoryEntry[]) =>
        entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      const result: { name?: string; location?: string } = {}
      // Source precedence is per field. Within each source exact portable
      // calls win over base calls, and the latest contact wins over older ones.
      const fileEntries = keys
        .map((key) => file?.records[key])
        .filter((entry): entry is HistoryEntry => !!entry)
      for (const group of [recentFirst(currentOperation), fileEntries, recentFirst(olderHistory)]) {
        for (const key of keys) {
          for (const entry of group) {
            if (entry.call !== key) continue
            if (!result.name && entry.name) result.name = entry.name
            // A portable suffix can mean a different state; only names may
            // fall back from an exact portable callsign to its base call.
            if (
              key === keys[0] &&
              !result.location &&
              entry.location &&
              LOCATIONS.includes(entry.location)
            )
              result.location = entry.location
          }
        }
      }
      return result
    },
  }
}
