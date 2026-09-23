import type { JSONValue } from '@ham2k/extension-sdk'
import { isValidReceiver } from '../data/parser.ts'
import { type ReceiverSelection, record } from './model.ts'

export const spotModes = ['CW', 'RTTY', 'FT8', 'FT4']
export interface SpotPreferences extends ReceiverSelection {
  callFilter?: string
  mode: string
}
export function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .trim()
        .toUpperCase()
        .split(/[\s,;]+/)
        .filter(Boolean),
    ),
  ]
}
export function validation(key: string, value: unknown): string | null {
  if (key === 'spotCallFilter')
    return typeof value === 'string' && value.length > 0 && value.length <= 200
      ? null
      : 'Choose a call filter.'
  if (key === 'spotMode')
    return spotModes.includes(String(value)) ? null : 'Choose a supported RBN mode.'
  if (key !== 'spotSkimmers' && key !== 'spotGrids') return 'Unknown spot setting.'
  if (typeof value !== 'string' || value.length > 1000 || tokens(value).length > 50)
    return 'Enter up to 50 entries.'
  const valid = tokens(value).every(
    key === 'spotSkimmers'
      ? isValidReceiver
      : (grid) => /^[A-R]{2}(?:\d{2}(?:[A-X]{2})?)?$/.test(grid),
  )
  return valid
    ? null
    : key === 'spotSkimmers'
      ? 'Use exact receiver callsigns, including suffixes such as KM3T-5.'
      : 'Use Maidenhead regions such as FN, EM, JO, or FN42.'
}
export function readPreferences(raw: Record<string, unknown>): SpotPreferences {
  for (const key of ['spotCallFilter', 'spotMode', 'spotSkimmers', 'spotGrids']) {
    if (raw[key] !== undefined && validation(key, raw[key]))
      throw new Error(`Invalid saved RBN setting: ${key}. Correct it in RBN settings.`)
  }
  return {
    callFilter: typeof raw.spotCallFilter === 'string' ? raw.spotCallFilter : undefined,
    mode: String(raw.spotMode ?? 'CW'),
    skimmers: tokens(String(raw.spotSkimmers ?? '')),
    grids: tokens(String(raw.spotGrids ?? '')),
  }
}
export function ownSettings(settings: Record<string, JSONValue>): Record<string, unknown> {
  return record(record(settings.extensions)['extension_n1rwj-rbn'])
}
