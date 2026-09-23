import type { JSONValue } from '@ham2k/extension-sdk'
import { continentCode } from '../data/continents.ts'
import { isValidReceiver, receiverLocation } from '../data/parser.ts'
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
  if (key === 'spotContinents')
    return Array.isArray(value) &&
      value.length <= 7 &&
      value.every((code) => typeof code === 'string' && continentCode(code) === code)
      ? null
      : 'Choose receiver continents from the list.'
  if (key === 'spotRadiusGrid')
    return typeof value === 'string' && (!value.trim() || receiverLocation(value)[0] !== null)
      ? null
      : 'Use a 4, 6 or 8 character Maidenhead origin grid, such as FN42 or FN42FK.'
  if (key === 'spotRadiusMiles') {
    if (value === null || (typeof value === 'string' && !value.trim())) return null
    return (typeof value === 'number' || typeof value === 'string') &&
      Number.isFinite(Number(value)) &&
      Number(value) > 0 &&
      Number(value) <= 25000
      ? null
      : 'Enter a distance greater than 0 and up to 25,000 miles, or leave blank for no limit.'
  }
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
function hasRadius(raw: Record<string, unknown>): boolean {
  return (
    raw.spotRadiusMiles !== undefined &&
    raw.spotRadiusMiles !== null &&
    String(raw.spotRadiusMiles).trim() !== ''
  )
}

/** A missing origin must never silently turn an enabled radius into all receivers. */
export function radiusIssue(raw: Record<string, unknown>): string | null {
  return hasRadius(raw) && receiverLocation(raw.spotRadiusGrid)[0] === null
    ? 'Set a distance origin grid first. Clear the maximum distance before clearing its origin.'
    : null
}

export function validateEdit(
  key: string,
  value: unknown,
  raw: Record<string, unknown>,
): string | null {
  return (
    validation(key, value) ||
    (key === 'spotRadiusMiles' || key === 'spotRadiusGrid'
      ? radiusIssue({ ...raw, [key]: value })
      : null)
  )
}

export function readPreferences(raw: Record<string, unknown>): SpotPreferences {
  for (const key of [
    'spotCallFilter',
    'spotMode',
    'spotSkimmers',
    'spotGrids',
    'spotContinents',
    'spotRadiusGrid',
    'spotRadiusMiles',
  ]) {
    if (raw[key] !== undefined && validation(key, raw[key]))
      throw new Error(`Invalid saved RBN setting: ${key}. Correct it in RBN settings.`)
  }
  const issue = radiusIssue(raw)
  if (issue) throw new Error(issue)
  const [latitude, longitude] = receiverLocation(raw.spotRadiusGrid)
  return {
    callFilter: typeof raw.spotCallFilter === 'string' ? raw.spotCallFilter : undefined,
    mode: String(raw.spotMode ?? 'CW'),
    skimmers: tokens(String(raw.spotSkimmers ?? '')),
    grids: tokens(String(raw.spotGrids ?? '')),
    continents: [
      ...new Set((raw.spotContinents as NonNullable<ReceiverSelection['continents']>) ?? []),
    ],
    ...(hasRadius(raw) && latitude !== null && longitude !== null
      ? {
          radius: { origin: { latitude, longitude }, miles: Number(raw.spotRadiusMiles) },
        }
      : {}),
  }
}
export function ownSettings(settings: Record<string, JSONValue>): Record<string, unknown> {
  return record(record(settings.extensions)['extension_n1rwj-rbn'])
}
