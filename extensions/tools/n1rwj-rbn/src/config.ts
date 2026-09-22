import type { JSONValue, SettingsField } from '@ham2k/extension-sdk'
import { gridToLocation } from '@ham2k/lib-geo-tools'

export type SortKey = 'age' | 'call' | 'snr' | 'distance' | 'frequency' | 'wpm'
export type View = 'both' | 'map' | 'list'
export interface PanelConfig {
  watchCall: string
  gridOverride: string
  windowMinutes: number
  projection: 'regional' | 'azimuthal'
  view: View
  sort: SortKey
  direction: 'asc' | 'desc'
  band: string
}

export const rbnBands = [
  'all',
  '160m',
  '80m',
  '60m',
  '40m',
  '30m',
  '20m',
  '17m',
  '15m',
  '12m',
  '10m',
  '6m',
]
const sorts: SortKey[] = ['age', 'call', 'snr', 'distance', 'frequency', 'wpm']

export function readConfig(config: Record<string, JSONValue> = {}): PanelConfig {
  return {
    watchCall: typeof config.watchCall === 'string' ? config.watchCall.trim().toUpperCase() : '',
    gridOverride: typeof config.grid === 'string' ? config.grid.trim().toUpperCase() : '',
    windowMinutes: [15, 30, 60].includes(Number(config.windowMinutes))
      ? Number(config.windowMinutes)
      : 15,
    projection: config.projection === 'azimuthal' ? 'azimuthal' : 'regional',
    view: config.view === 'map' || config.view === 'list' ? config.view : 'both',
    sort: sorts.includes(config.sort as SortKey) ? (config.sort as SortKey) : 'age',
    direction: config.direction === 'asc' ? 'asc' : 'desc',
    band: typeof config.band === 'string' && rbnBands.includes(config.band) ? config.band : 'all',
  }
}

export interface Origin {
  latitude: number
  longitude: number
  label: string
}

function gridOrigin(grid: string): Origin | undefined {
  if (!/^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/.test(grid)) return undefined
  const [latitude, longitude] = gridToLocation(grid)
  return { latitude, longitude, label: grid }
}

/** Respect the operation's actual location; a callsign-prefix guess is not a QTH. */
export function operationOrigin(
  operation: Record<string, JSONValue> | undefined,
  override: string,
): Origin | undefined {
  if (override) return gridOrigin(override)
  const { lat, lon } = operation ?? {}
  if (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    typeof lon === 'number' &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180
  ) {
    return {
      latitude: lat,
      longitude: lon,
      label: typeof operation?.grid === 'string' ? operation.grid : 'Operation location',
    }
  }
  return typeof operation?.grid === 'string'
    ? gridOrigin(operation.grid.trim().toUpperCase())
    : undefined
}

/** A test operation keeps its /TEST marker; watching a real call is an explicit override. */
export function watchedCall(
  operation: Record<string, JSONValue> | undefined,
  override: string,
): string {
  if (override) return override
  return typeof operation?.stationCall === 'string'
    ? operation.stationCall.split(',')[0].trim().toUpperCase()
    : ''
}

export const configFields: SettingsField[] = [
  {
    type: 'field',
    fieldType: 'text',
    key: 'watchCall',
    label: 'Watch callsign',
    value: '',
    uppercase: true,
    placeholder: 'Follow this operation',
    description:
      'Leave blank to use the operation station callsign. For a test operation, enter the real callsign to observe.',
    pattern: '^$|^[A-Za-z0-9/]{3,24}$',
    patternError: 'Use a callsign with letters, numbers and optional slashes.',
  },
  {
    type: 'field',
    fieldType: 'text',
    key: 'grid',
    label: 'Map origin grid',
    value: '',
    uppercase: true,
    placeholder: 'Use operation location',
    description:
      'Optional 4, 6 or 8 character locator. Otherwise use the operation location, never a callsign lookup location.',
    pattern: '^$|^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$',
    patternError: 'Use a valid 4, 6 or 8 character Maidenhead locator.',
  },
  {
    type: 'field',
    fieldType: 'select',
    key: 'windowMinutes',
    label: 'Report window',
    value: 15,
    options: [15, 30, 60].map((value) => ({ label: `Last ${value} minutes`, value })),
  },
  {
    type: 'field',
    fieldType: 'select',
    key: 'projection',
    label: 'Map projection',
    value: 'regional',
    options: [
      { label: 'Fit reporting receivers', value: 'regional' },
      { label: 'From my station · distance rings', value: 'azimuthal' },
    ],
  },
  {
    type: 'field',
    fieldType: 'select',
    key: 'view',
    label: 'View',
    value: 'both',
    options: [
      { label: 'Map and receivers', value: 'both' },
      { label: 'Map', value: 'map' },
      { label: 'Receivers', value: 'list' },
    ],
  },
  {
    type: 'field',
    fieldType: 'select',
    key: 'band',
    label: 'Band',
    value: 'all',
    options: rbnBands.map((value) => ({ label: value === 'all' ? 'All bands' : value, value })),
  },
  {
    type: 'field',
    fieldType: 'select',
    key: 'sort',
    label: 'Default sort',
    value: 'age',
    options: [
      { label: 'Report time', value: 'age' },
      { label: 'Receiver', value: 'call' },
      { label: 'SNR', value: 'snr' },
      { label: 'Distance', value: 'distance' },
      { label: 'Frequency', value: 'frequency' },
      { label: 'CW speed', value: 'wpm' },
    ],
  },
  {
    type: 'field',
    fieldType: 'select',
    key: 'direction',
    label: 'Default sort direction',
    value: 'desc',
    options: [
      { label: 'Descending · newest / highest first', value: 'desc' },
      { label: 'Ascending · lowest / A–Z first', value: 'asc' },
    ],
  },
]
