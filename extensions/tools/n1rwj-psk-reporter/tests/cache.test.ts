import type { JSONValue } from '@ham2k/extension-sdk'
import { expect, it, vi } from 'vitest'
import { createReportCache, reportCacheKey } from '../src/data/cache.ts'
import { createReportStore } from '../src/data/store.ts'
import { createHistoryClient } from '../src/history/client.ts'
import { createPersistentStorage } from '../src/storage.ts'

const initial = Date.UTC(2026, 8, 24, 18)
const key = 'n1rwj-psk-reporter'
const payload = (overrides = {}) =>
  JSON.stringify({
    sc: 'EA8/N1RWJ/P',
    rc: 'CU3AT/P',
    sl: 'FN42',
    rl: 'HM68',
    f: 14074000,
    md: 'FT8',
    b: '20m',
    t: initial / 1000,
    sq: 42,
    rp: -12,
    ...overrides,
  })
const flush = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve()
}
function setup() {
  let now = initial
  let values: Record<string, JSONValue> = { unrelated: 'preserved' }
  const host = {
    getSettings: vi.fn(async () => ({ extensions: { [`extension_${key}`]: { ...values } } })),
    setSettings: vi.fn(async (changes: Record<string, JSONValue>) => {
      values = { ...values, ...changes }
    }),
  }
  const storage = createPersistentStorage(host, key)
  const store = createReportStore()
  const cache = createReportCache(storage, store, () => now)
  return {
    host,
    storage,
    store,
    cache,
    values: () => values,
    advance: (ms: number) => {
      now += ms
    },
    now: () => now,
  }
}

it('restores a full-hour checkpoint with original age, identity and exact portable calls', async () => {
  const s = setup()
  await s.cache.ready()
  s.store.ingest(payload(), initial)
  s.store.ingest(payload({ rc: 'W1AW', t: initial / 1000 - 1800 }), initial)
  s.store.restoreCapacityLoss(initial - 1000, initial)
  s.cache.tick()
  await flush()
  expect(s.host.setSettings).toHaveBeenCalledTimes(1)
  expect(s.values().unrelated).toBe('preserved')
  const fresh = createReportStore()
  const cache = createReportCache(
    createPersistentStorage(s.host, key),
    fresh,
    () => initial + 60_000,
  )
  await cache.ready()
  expect(fresh.snapshot(initial + 60_000, 15)).toMatchObject({
    capped: true,
    reports: [
      {
        id: '42',
        timeMs: initial,
        transmitter: { call: 'EA8/N1RWJ/P' },
        receiver: { call: 'CU3AT/P' },
      },
    ],
  })
  expect(fresh.snapshot(initial + 60_000, 60).reports).toHaveLength(2)
  cache.tick()
  await flush()
  expect(s.host.setSettings).toHaveBeenCalledTimes(1)
  expect(fresh.snapshot(initial + 3601_000, 60)).toEqual({ reports: [], capped: false })
})

it('batches writes, saves changes during an in-flight write and retries failures', async () => {
  const s = setup()
  await s.cache.ready()
  let finish!: () => void
  s.host.setSettings.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  s.store.ingest(payload(), initial)
  s.cache.tick()
  await flush()
  s.store.ingest(payload({ rc: 'W1AW' }), initial)
  s.advance(30_000)
  s.cache.tick()
  await flush()
  expect(s.host.setSettings).toHaveBeenCalledTimes(1)
  finish()
  await flush()
  s.host.setSettings.mockRejectedValueOnce(new Error('disk full'))
  s.cache.tick()
  await flush()
  expect(s.cache.warning).toContain('could not be saved')
  for (let i = 0; i < 5; i++) {
    s.advance(5000)
    s.cache.tick()
    await flush()
  }
  expect(s.host.setSettings).toHaveBeenCalledTimes(2)
  s.advance(5000)
  s.cache.tick()
  await flush()
  expect(s.cache.warning).toBeUndefined()
  expect(JSON.parse(String(s.values()[reportCacheKey])).reports).toHaveLength(2)
})

it('merges a late restore without overwriting newer reports received while reading', async () => {
  let finish!: (value: JSONValue) => void
  const write = vi.fn(async () => {})
  const store = createReportStore()
  const cache = createReportCache(
    {
      read: () =>
        new Promise<JSONValue>((resolve) => {
          finish = resolve
        }),
      write,
    },
    store,
    () => initial,
  )
  const loading = cache.ready()
  store.ingest(payload({ t: initial / 1000 + 15, rp: -20 }), initial)
  finish(JSON.stringify({ version: 1, reports: [{ ...JSON.parse(payload()), id: '42' }] }))
  await loading
  expect(store.snapshot(initial, 15).reports[0].snrDb).toBe(-20)
  cache.tick()
  await flush()
  expect(write).toHaveBeenCalledTimes(1)
})

it('does not overwrite unread storage and recovers on a later render tick', async () => {
  const s = setup()
  s.host.getSettings.mockRejectedValueOnce(new Error('unavailable'))
  await s.cache.ready()
  s.store.ingest(payload(), initial)
  s.cache.tick()
  await flush()
  expect(s.cache.warning).toContain('unavailable')
  expect(s.host.setSettings).not.toHaveBeenCalled()
  s.advance(30_000)
  s.cache.tick()
  await flush()
  expect(s.host.getSettings).toHaveBeenCalledTimes(2)
  expect(s.host.setSettings).toHaveBeenCalledTimes(1)
})

it.each([
  'bad JSON',
  JSON.stringify({ version: 2, reports: [] }),
  JSON.stringify({ version: 1, reports: Array(1001).fill(null) }),
  ' '.repeat(1_000_001),
])('discards an invalid or oversized cache safely', async (value) => {
  const store = createReportStore()
  const cache = createReportCache(
    { read: async () => value, write: async () => {} },
    store,
    () => initial,
  )
  await cache.ready()
  expect(store.snapshot(initial, 60).reports).toEqual([])
  expect(cache.warning).toContain('could not be restored')
})

it('validates cached records and reconstructs locations rather than trusting stored coordinates', async () => {
  const reports = [
    null,
    { id: 'bad' },
    ...[-3601, 61, 0].map((age) => ({
      ...JSON.parse(payload({ t: initial / 1000 + age })),
      id: '42',
      latitude: 1234,
    })),
  ]
  const store = createReportStore()
  const cache = createReportCache(
    {
      read: async () => JSON.stringify({ version: 1, reports, droppedAt: initial + 60_000 }),
      write: async () => {},
    },
    store,
    () => initial,
  )
  await cache.ready()
  expect(store.snapshot(initial, 60)).toMatchObject({
    capped: false,
    reports: [{ id: '42', transmitter: { location: { source: 'reported-grid' } } }],
  })
  expect(store.snapshot(initial, 60).reports).toHaveLength(1)
})

it('persists the HTTP cooldown through settings and serializes it with report writes', async () => {
  const s = setup()
  let writing = false
  s.host.setSettings.mockImplementation(async (changes) => {
    expect(writing).toBe(false)
    writing = true
    await Promise.resolve()
    Object.assign(s.values(), changes)
    writing = false
  })
  const fetch = vi.fn(async () => ({ status: 200, body: '<pskreporter/>' }))
  const history = createHistoryClient({ ...s.storage, fetch }, () => {}, s.now)
  await s.cache.ready()
  s.store.ingest(payload(), initial)
  s.cache.tick()
  history.observe('EA8/N1RWJ/P', 'outgoing', 15, true, true)
  await flush()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(s.host.getSettings).toHaveBeenCalledTimes(1)
  expect(Object.keys(s.values())).toEqual(
    expect.arrayContaining([reportCacheKey, 'psk-history-next-request-v1', 'unrelated']),
  )
  const restarted = createHistoryClient(
    { ...createPersistentStorage(s.host, key), fetch },
    () => {},
    s.now,
  )
  restarted.observe('EA8/N1RWJ/P', 'outgoing', 15, true, true)
  await flush()
  expect(fetch).toHaveBeenCalledTimes(1)
  await restarted.force('EA8/N1RWJ/P', 'outgoing', 15, true)
  expect(fetch).toHaveBeenCalledTimes(2)
})
