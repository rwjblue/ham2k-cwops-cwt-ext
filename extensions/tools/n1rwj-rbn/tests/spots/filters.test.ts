import { expect, it, vi } from 'vitest'
import { createRbnTransport } from '../../src/data/transport.ts'
import { discoverFilters, matchFilter } from '../../src/spots/filters.ts'
import { createRbnSpots } from '../../src/spots/index.ts'
import { maxAgeMs, parseReports, selectSpots } from '../../src/spots/model.ts'
import { readPreferences, validation } from '../../src/spots/preferences.ts'

const now = Date.parse('2026-09-23T13:10:00Z')
const row = (overrides = {}) => ({
  callsign: 'K1ABC',
  frequency: 14032,
  mode: 'CW',
  timestamp: new Date(now - 1000).toISOString(),
  spotter: 'K1TTT',
  spotter_grid: 'FN42',
  ...overrides,
})

it('filters receiver IDs and directory grid regions before deduplicating; keeps modes and WARC bands', () => {
  const reports = parseReports(
    [
      row(),
      row({
        frequency: 14035,
        spotter: 'DL1ABC',
        spotter_grid: 'JO31',
        timestamp: new Date(now).toISOString(),
      }),
      row({ frequency: 10120 }),
      row({ frequency: 14074, mode: 'FT8' }),
      row({ callsign: 'W9NEW', spotter_grid: '' }),
    ],
    'rbn',
    now,
  )
  const spots = selectSpots(
    reports,
    undefined,
    { skimmers: [], grids: ['FN'] },
    () => undefined,
    now,
  )
  expect(spots.map((spot) => spot.freq)).toEqual([14032, 10120, 14074])
  expect(
    selectSpots(reports, new Set(['W9NEW']), { skimmers: [], grids: [] }, () => undefined, now),
  ).toHaveLength(1)
  expect(
    selectSpots(reports, undefined, { skimmers: ['K1TTT-5'], grids: [] }, () => undefined, now),
  ).toEqual([])
  expect(
    selectSpots(reports, undefined, { skimmers: [], grids: ['JO'] }, () => ({ grid: 'FN31' }), now),
  ).toEqual([])
  expect(
    selectSpots(
      reports,
      undefined,
      { skimmers: [], grids: [] },
      () => undefined,
      now + maxAgeMs + 1,
    ),
  ).toEqual([])
})

it('batches membership and rejects unknown calls, unavailable and failed providers', async () => {
  const invokeOne = vi.fn(async (_cat, key, _method, args) => [
    { key, ok: true, value: { version: 1, available: true, calls: args.calls.slice(0, 1) } },
  ])
  const bridge = { invokeOne, invokeAll: vi.fn(async () => []) }
  expect(
    (
      await matchFilter(
        'cwt',
        Array.from({ length: 4001 }, (_, i) => `K${i}ABC`),
        true,
        bridge,
      )
    ).size,
  ).toBe(3)
  expect(invokeOne.mock.calls.map((call) => call[3].calls.length)).toEqual([2000, 2000, 1])
  for (const replies of [
    [],
    [{ key: 'cwt', ok: false }],
    [{ key: 'cwt', ok: true, value: { version: 1, available: true, calls: ['W9NEW'] } }],
    [{ key: 'cwt', ok: true, value: { version: 1, available: false, calls: [] } }],
  ]) {
    await expect(
      matchFilter('cwt', ['K1ABC'], true, { ...bridge, invokeOne: async () => replies }),
    ).rejects.toThrow()
  }
  expect(
    await discoverFilters(true, {
      ...bridge,
      invokeAll: async () => [{ key: 'broken', ok: true, value: { version: 2 } }],
    }),
  ).toEqual({ providers: [], failed: true })
})

it('validates saved and edited filters without silently treating bad settings as all receivers', () => {
  expect(validation('spotSkimmers', 'km3t-5, K1TTT')).toBeNull()
  expect(validation('spotGrids', 'FN, em, JO31')).toBeNull()
  expect(validation('spotGrids', 'USA')).toBeTruthy()
  expect(validation('spotSkimmers', '***')).toBeTruthy()
  expect(() => readPreferences({ spotGrids: 'USA' })).toThrow()
  expect(readPreferences({ spotGrids: 'fn, FN' }).grids).toEqual(['FN'])
})

it('shares rate limits and simultaneous requests between panel and spot callers', async () => {
  let clock = now
  const fetch = vi.fn(async () => ({
    status: 429,
    body: JSON.stringify({ error: { retryAfter: 120 } }),
  }))
  const transport = createRbnTransport(fetch, () => clock)
  await Promise.all([
    transport('https://vailrerbn.com/api/v1/spots?call=K1ABC'),
    transport('https://vailrerbn.com/api/v1/spots?call=K1ABC'),
  ])
  expect(fetch).toHaveBeenCalledTimes(1)
  clock += 61_000
  await expect(transport('https://vailrerbn.com/api/v1/spots?mode=CW')).rejects.toThrow(
    'rate limit',
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  clock += 60_000
  await transport('https://vailrerbn.com/api/v1/spots?mode=CW')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('invalidates results when preferences change during fetch and ages cached reports offline', async () => {
  let clock = now
  let preferences = { spotCallFilter: 'none' }
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const fetch = vi.fn(async () => {
    await waiting
    return { status: 200, body: JSON.stringify({ spots: [row()] }) }
  })
  const runtime = createRbnSpots({
    fetch,
    lookup: () => undefined,
    now: () => clock,
    bridge: { invokeAll: async () => [], invokeOne: async () => [] },
    getSettings: async () => ({ extensions: { 'extension_n1rwj-rbn': preferences } }),
    setSettings: async (values) => {
      preferences = { ...preferences, ...values }
    },
  })
  const pending = runtime.spots.fetchSpots({}, { online: true })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(9))
  await runtime.settings.onChangeField(
    { panelKey: 'n1rwj-rbn', fieldKey: 'spotGrids', value: 'FN', state: {} },
    { online: true },
  )
  release?.()
  expect(await pending).toEqual([])
  expect(await runtime.spots.fetchSpots({}, { online: false })).toHaveLength(1)
  clock += maxAgeMs
  expect(await runtime.spots.fetchSpots({}, { online: false })).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(9)
})

it('rechecks the selected provider after the network and does not leak removed file matches', async () => {
  let available = true
  const runtime = createRbnSpots({
    now: () => now,
    lookup: () => undefined,
    getSettings: async () => ({ extensions: { 'extension_n1rwj-rbn': { spotCallFilter: 'cwt' } } }),
    setSettings: async () => {},
    bridge: {
      invokeAll: async () => [
        {
          key: 'cwt',
          ok: true,
          value: { version: 1, label: 'CWT', available, defaultSelected: true },
        },
      ],
      invokeOne: async () => [
        { key: 'cwt', ok: true, value: { version: 1, available, calls: [] } },
      ],
    },
    fetch: async () => {
      available = false
      return { status: 200, body: JSON.stringify({ spots: [row()] }) }
    },
  })
  expect(await runtime.spots.fetchSpots({}, { online: true })).toEqual([])
})

it('keeps settings repairable during failed discovery, and honors an explicit all-calls choice', async () => {
  let preferences = {}
  const runtime = createRbnSpots({
    now: () => now,
    lookup: () => undefined,
    getSettings: async () => ({ extensions: { 'extension_n1rwj-rbn': preferences } }),
    setSettings: async (values) => {
      preferences = { ...preferences, ...values }
    },
    bridge: {
      invokeAll: async () => {
        throw new Error('Unavailable bridge')
      },
      invokeOne: async () => [],
    },
    fetch: async () => ({ status: 200, body: JSON.stringify({ spots: [row()] }) }),
  })
  expect(await runtime.spots.fetchSpots({}, { online: true })).toEqual([])
  expect(
    (await runtime.settings.getDefinition({ panelKey: 'n1rwj-rbn' }, { online: true })).elements
      .length,
  ).toBeGreaterThan(0)
  await runtime.settings.onChangeField(
    { panelKey: 'n1rwj-rbn', fieldKey: 'spotCallFilter', value: 'none', state: {} },
    { online: true },
  )
  expect(await runtime.spots.fetchSpots({}, { online: true })).toHaveLength(1)
})
