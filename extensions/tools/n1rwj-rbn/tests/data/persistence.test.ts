import type { JSONValue } from '@ham2k/extension-sdk'
import { expect, it, vi } from 'vitest'
import { createPersistentStorage } from '../../../../../packages/reception/src/storage.ts'
import { backoffKey, decodeSnapshots, snapshotKey } from '../../src/data/cache.ts'
import { createRbnClient } from '../../src/data/client.ts'
import { createRbnTransport } from '../../src/data/transport.ts'
import { NOW, payload } from './fixtures.ts'

const query = { call: 'N1RWJ', windowMinutes: 30 }
function setup() {
  let clock = NOW
  let values: Record<string, JSONValue> = { spotMode: 'CW' }
  const host = {
    getSettings: vi.fn(async () => ({ extensions: { 'extension_n1rwj-rbn': { ...values } } })),
    setSettings: vi.fn(async (changes: Record<string, JSONValue>) => {
      values = { ...values, ...changes }
    }),
  }
  const fetch = vi.fn(async (_url: string) => ({ status: 200, body: JSON.stringify(payload()) }))
  const restart = () => {
    const storage = createPersistentStorage(host, 'n1rwj-rbn')
    const transport = createRbnTransport(fetch, () => clock, storage)
    return { transport, client: createRbnClient({ fetch: transport, now: () => clock, storage }) }
  }
  return {
    host,
    fetch,
    restart,
    values: () => values,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

it('restores reports offline with their timestamps and locations, then catches up once on resume', async () => {
  const s = setup()
  const first = await s.restart().client.getSnapshot(query)
  expect(first.status).toBe('ready')
  expect(s.values().spotMode).toBe('CW')
  s.advance(10_000)
  const { client } = s.restart()
  const offline = await client.getSnapshot(query, { online: false })
  expect(offline).toMatchObject({ status: 'stale', lastSuccessMs: NOW, lastAttemptMs: NOW })
  expect(offline.reports).toEqual(first.reports)
  const recent = await client.getSnapshot(query)
  expect(recent).toMatchObject({
    status: 'stale',
    refresh: { state: 'cooldown' },
    lastSuccessMs: NOW,
  })
  expect(s.fetch).toHaveBeenCalledTimes(1)
  s.advance(5 * 60_000)
  await Promise.all([client.getSnapshot(query), client.getSnapshot(query)])
  expect(s.fetch).toHaveBeenCalledTimes(2)
  expect(s.fetch.mock.calls[1][0]).toContain(`since=${(NOW + 310_000) / 1000 - 1800}`)
  await client.getSnapshot(query)
  expect(s.fetch).toHaveBeenCalledTimes(2)
})

it('bypasses a restored cooldown manually and anchors the next automatic request to that attempt', async () => {
  const s = setup()
  await s.restart().client.getSnapshot(query)
  s.advance(1)
  const { client } = s.restart()
  await Promise.all([
    client.getSnapshot(query, { force: true }),
    client.getSnapshot(query, { force: true }),
  ])
  expect(s.fetch).toHaveBeenCalledTimes(2)
  await s.restart().client.getSnapshot(query)
  expect(s.fetch).toHaveBeenCalledTimes(2)
  s.advance(60_000)
  await client.getSnapshot(query)
  expect(s.fetch).toHaveBeenCalledTimes(3)
})

it('persists failed attempt timing without replacing the last successful snapshot', async () => {
  const s = setup()
  const { client } = s.restart()
  const first = await client.getSnapshot(query)
  s.advance(60_000)
  s.fetch.mockRejectedValueOnce(new Error('TimeoutException'))
  await client.getSnapshot(query)
  const { client: restarted } = s.restart()
  const cached = await restarted.getSnapshot(query)
  expect(cached).toMatchObject({ lastSuccessMs: NOW, lastAttemptMs: NOW + 60_000, status: 'stale' })
  expect(cached.reports).toEqual(first.reports)
  expect(s.fetch).toHaveBeenCalledTimes(2)
  expect((await restarted.getSnapshot(query, { force: true })).status).toBe('ready')
  expect(s.fetch).toHaveBeenCalledTimes(3)
})

it('writes request timing before HTTP starts, including when the runtime exits mid-request', async () => {
  const s = setup()
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  s.fetch.mockImplementationOnce(async () => {
    expect(JSON.parse(String(s.values()[snapshotKey])).snapshots[0].lastAttemptMs).toBe(NOW)
    await pending
    return { status: 200, body: JSON.stringify(payload()) }
  })
  const { client } = s.restart()
  const request = client.getSnapshot(query)
  for (let i = 0; i < 50; i++) await Promise.resolve()
  // Another panel's completed request must not erase the pending attempt.
  await client.getSnapshot({ ...query, call: 'W1AW' })
  await s.restart().client.getSnapshot(query)
  expect(s.fetch).toHaveBeenCalledTimes(2)
  finish()
  await request
})

it('restores shared server backoff from Spots and never bypasses it manually or across callsigns', async () => {
  const s = setup()
  await s.restart().client.getSnapshot(query)
  s.fetch.mockResolvedValueOnce({
    status: 429,
    body: JSON.stringify({ error: { retryAfter: 120 } }),
  })
  await s.restart().transport('https://vailrerbn.com/api/v1/spots?mode=CW')
  expect(s.values()[backoffKey]).toBe(NOW + 120_000)
  const { client, transport } = s.restart()
  for (const call of ['N1RWJ', 'W1AW']) {
    expect(await client.getSnapshot({ ...query, call }, { force: true })).toMatchObject({
      failureKind: 'rate-limit',
    })
  }
  await expect(transport('https://vailrerbn.com/api/v1/spots?mode=RTTY')).rejects.toThrow(
    'rate limit',
  )
  expect(s.fetch).toHaveBeenCalledTimes(2)
  s.advance(120_000)
  await client.getSnapshot(query, { force: true })
  expect(s.fetch).toHaveBeenCalledTimes(3)
})

it('bounds and validates persisted queries, expires reports, and preserves successful empty results', async () => {
  const s = setup()
  const first = await s.restart().client.getSnapshot(query)
  const encoded = JSON.parse(String(s.values()[snapshotKey]))
  encoded.snapshots[0].reports.push({ ...first.reports[0], call: 'N1RWJ/P', id: '999' })
  encoded.snapshots[0].reports.push({ ...first.reports[0], timeMs: NOW + 301_000, id: '998' })
  encoded.snapshots[0].reports[0].receiverLatitude = 1000
  expect(decodeSnapshots(JSON.stringify(encoded), NOW).snapshots[0].reports).toHaveLength(1)
  expect(
    decodeSnapshots(JSON.stringify(encoded), NOW).snapshots[0].reports[0].receiverLatitude,
  ).toBeNull()
  expect(decodeSnapshots(JSON.stringify(encoded), NOW + 31 * 60_000).snapshots[0].reports).toEqual(
    [],
  )
  expect(decodeSnapshots(JSON.stringify(encoded), NOW + 121 * 60_000).snapshots).toEqual([])
  s.fetch.mockResolvedValue({ status: 200, body: JSON.stringify(payload({ spots: [], total: 0 })) })
  await s.restart().client.getSnapshot(query, { force: true })
  expect(await s.restart().client.getSnapshot(query, { online: false })).toMatchObject({
    reports: [],
    lastSuccessMs: NOW,
  })
  for (const invalid of [
    'bad JSON',
    ' '.repeat(2_000_001),
    JSON.stringify({ ...encoded, snapshots: Array(9).fill(encoded.snapshots[0]) }),
  ]) {
    expect(() => decodeSnapshots(invalid, NOW)).toThrow()
  }
})

it('bounds persisted cache entries and keeps query windows and calls distinct', async () => {
  const s = setup()
  const { client } = s.restart()
  for (let i = 0; i < 9; i++) await client.getSnapshot({ ...query, call: `K${i}ABC` })
  const restored = decodeSnapshots(s.values()[snapshotKey], NOW)
  expect(restored.snapshots).toHaveLength(8)
  expect(restored.snapshots.some((item) => item.call === 'K0ABC')).toBe(false)
  await s.restart().client.getSnapshot({ ...query, call: 'K8ABC' })
  expect(s.fetch).toHaveBeenCalledTimes(9)
  await s.restart().client.getSnapshot({ ...query, call: 'K8ABC', windowMinutes: 60 })
  expect(s.fetch).toHaveBeenCalledTimes(10)
})

it('retains live results on storage failures and retries reads without overwriting unread data', async () => {
  const s = setup()
  const { client } = s.restart()
  s.host.getSettings.mockRejectedValue(new Error('unavailable'))
  const first = await client.getSnapshot(query)
  expect(first.reports).toHaveLength(1)
  expect(first.storageWarning).toContain('unavailable')
  expect(s.host.setSettings).not.toHaveBeenCalled()
  s.host.getSettings.mockResolvedValue({ extensions: { 'extension_n1rwj-rbn': s.values() } })
  s.advance(60_000)
  s.host.setSettings.mockRejectedValue(new Error('disk full'))
  expect((await client.getSnapshot(query)).storageWarning).toContain('could not be saved')
  s.host.setSettings.mockImplementation(async (changes) => {
    Object.assign(s.values(), changes)
  })
  expect((await client.getSnapshot(query, { force: true })).storageWarning).toBeUndefined()
})

it('recovers from malformed saved reports without stopping live fetching', async () => {
  const s = setup()
  s.values()[snapshotKey] = 'invalid'
  const { client } = s.restart()
  expect((await client.getSnapshot(query, { online: false })).storageWarning).toContain(
    'could not be restored',
  )
  expect((await client.getSnapshot(query)).reports).toHaveLength(1)
  expect(s.fetch).toHaveBeenCalledTimes(1)
})
