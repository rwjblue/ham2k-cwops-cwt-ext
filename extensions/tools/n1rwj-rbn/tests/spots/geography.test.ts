import { expect, it } from 'vitest'
import { receiverLocation } from '../../src/data/parser.ts'
import { distanceKm } from '../../src/model.ts'
import { parseReports, type ReceiverLookup, selectSpots } from '../../src/spots/model.ts'
import { readPreferences, validateEdit, validation } from '../../src/spots/preferences.ts'

const now = Date.parse('2026-09-23T13:10:00Z')
const row = (spotter: string, grid: string, age = 1000, callsign = 'K1ABC') => ({
  callsign,
  spotter,
  spotter_grid: grid,
  frequency: 14032,
  mode: 'CW',
  timestamp: new Date(now - age).toISOString(),
})
const lookup: ReceiverLookup = (call) =>
  ({
    K1NEAR: { grid: 'FN42', continent: 'NA' as const },
    DL1FAR: { grid: 'JO31', continent: 'EU' as const },
    W1NOGRID: { grid: null, continent: 'NA' as const },
  })[call]

it('combines receiver continents with other filters before deduplication, independent of DX calls', () => {
  const reports = parseReports(
    [
      row('K1NEAR', 'JO31', 2000, 'JA1DX'), // Directory overrides wrong report grid.
      row('DL1FAR', 'FN42', 1000, 'JA1DX'), // Newer but outside requested region.
      row('W1UNKNOWN', 'FN42', 1000, 'W9NEW'),
    ],
    'rbn',
    now,
  )
  const select = (raw: Record<string, unknown>) =>
    selectSpots(reports, undefined, readPreferences(raw), lookup, now)
  expect(select({ spotContinents: ['NA'], spotGrids: 'FN' })).toMatchObject([
    { their: { call: 'JA1DX' }, spot: { sourceInfo: { spotter: 'K1NEAR' } } },
  ])
  expect(select({ spotContinents: ['NA'], spotSkimmers: 'DL1FAR' })).toEqual([])
  expect(select({ spotContinents: ['NA', 'EU'] })[0].spot.sourceInfo?.spotter).toBe('DL1FAR')
  expect(select({})).toHaveLength(2) // No filter: unknown receiver stays visible.
})

it('uses directory grid then report fallback, excludes unknown positions only with radius enabled', () => {
  const reports = parseReports(
    [
      row('K1NEAR', 'JO31'),
      row('DL1FAR', 'FN42', 0),
      row('W1NOGRID', 'FN42', 1000, 'N2ABC'),
      row('W1UNKNOWN', '', 1000, 'N3ABC'),
    ],
    'rbn',
    now,
  )
  const prefs = readPreferences({
    spotRadiusGrid: 'FN42',
    spotRadiusMiles: 1,
    spotContinents: ['NA'],
  })
  expect(selectSpots(reports, undefined, prefs, lookup, now).map((s) => s.their.call)).toEqual([
    'K1ABC',
    'N2ABC',
  ])
  expect(selectSpots(reports, undefined, readPreferences({}), lookup, now)).toHaveLength(3)
  expect(selectSpots(reports, new Set(['N2ABC']), prefs, lookup, now)).toHaveLength(1)
})

it('uses great-circle miles across the date line and includes the exact distance boundary', () => {
  const reports = parseReports([row('W1RX', 'RJ90')], 'rbn', now)
  const prefs = readPreferences({ spotRadiusGrid: 'AJ00', spotRadiusMiles: 150 })
  expect(selectSpots(reports, undefined, prefs, () => undefined, now)).toHaveLength(1)
  expect(
    selectSpots(
      reports,
      undefined,
      readPreferences({ spotRadiusGrid: 'AJ00', spotRadiusMiles: 100 }),
      () => undefined,
      now,
    ),
  ).toEqual([])
  const [latitude, longitude] = receiverLocation('RJ90')
  const radius = prefs.radius
  if (!radius || latitude === null || longitude === null) throw new Error('Invalid grid fixture')
  const boundary = distanceKm(radius.origin, { latitude, longitude }) / 1.609344
  expect(
    selectSpots(
      reports,
      undefined,
      { ...prefs, radius: { ...radius, miles: boundary } },
      () => undefined,
      now,
    ),
  ).toHaveLength(1)
  expect(
    selectSpots(
      reports,
      undefined,
      { ...prefs, radius: { ...radius, miles: boundary - 0.001 } },
      () => undefined,
      now,
    ),
  ).toEqual([])
})

it('validates continents, grids and radius without broadening invalid saved preferences', () => {
  for (const value of [['XX'], 'NA', null, [null], ['toString'], ['na']])
    expect(validation('spotContinents', value)).toBeTruthy()
  expect(validation('spotContinents', ['NA', 'AN'])).toBeNull()
  for (const value of [0, -1, Infinity, NaN, true, 'lots', 25001])
    expect(validation('spotRadiusMiles', value)).toBeTruthy()
  expect(validation('spotRadiusMiles', '125.5')).toBeNull()
  expect(readPreferences({ spotRadiusMiles: '', spotRadiusGrid: '' }).radius).toBeUndefined()
  expect(readPreferences({ spotRadiusMiles: null }).radius).toBeUndefined()
  expect(validation('spotRadiusGrid', 'FN')).toBeTruthy()
  expect(validation('spotRadiusGrid', 'fn42fk')).toBeNull()
  expect(() => readPreferences({ spotContinents: ['XX'] })).toThrow()
  expect(() => readPreferences({ spotRadiusMiles: 100 })).toThrow('origin')
  expect(validateEdit('spotRadiusGrid', '', { spotRadiusMiles: 100 })).toContain('origin')
  expect(validateEdit('spotRadiusMiles', '', { spotRadiusGrid: '' })).toBeNull()
})
