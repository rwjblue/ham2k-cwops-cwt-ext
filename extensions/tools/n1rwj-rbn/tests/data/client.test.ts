import { describe, expect, it, vi } from 'vitest'
import { createRbnClient } from '../../src/data/client.ts'
import { metadata, NOW, payload } from './fixtures.ts'

const query = { call: ' n1rwj ', windowMinutes: 30 }
const response = (data: unknown, status = 200) => ({ status, body: JSON.stringify(data) })

describe('RBN client', () => {
  it('uses the supplied real wall clock for live reports, cooldowns, and expiry during developer time travel', async () => {
    let developerTime = NOW + 7 * 24 * 60 * 60_000
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : payload()),
    )
    const client = createRbnClient({ fetch, now: () => developerTime })
    const initial = await client.getSnapshot(query, { realNowMillis: NOW })
    expect(initial).toMatchObject({ status: 'ready', lastSuccessMs: NOW, lastAttemptMs: NOW })
    expect(initial.reports).toHaveLength(1)

    // Accelerating the app clock must not accelerate requests to RBN.
    developerTime += 365 * 24 * 60 * 60_000
    await client.getSnapshot(query, { realNowMillis: NOW + 10_000 })
    expect(fetch).toHaveBeenCalledTimes(2)

    // A frozen app clock must not stop ordinary real-time refresh and expiry.
    developerTime = NOW - 7 * 24 * 60 * 60_000
    const refreshed = await client.getSnapshot(query, { realNowMillis: NOW + 60_000 })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(refreshed.lastSuccessMs).toBe(NOW + 60_000)
    const expired = await client.getSnapshot(query, {
      online: false,
      realNowMillis: NOW + 31 * 60_000,
    })
    expect(expired).toMatchObject({ status: 'stale', reports: [] })
  })

  it('retains the injected clock fallback for older hosts and invalid optional clock values', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : payload()),
    )
    const client = createRbnClient({ fetch, now: () => NOW })
    expect(await client.getSnapshot(query, { realNowMillis: Number.NaN })).toMatchObject({
      status: 'ready',
      lastSuccessMs: NOW,
    })
  })

  it('discovers metadata and retries the dynamic version handshake exactly once', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('meta=1')) return response(metadata)
      if (!url.includes('&h=')) return response({ error: 888, ver_h: 'new123' }, 400)
      expect(url).toContain('&h=new123')
      return response(payload())
    })
    const client = createRbnClient({ fetch, now: () => NOW })
    expect(await client.getSnapshot(query)).toMatchObject({
      status: 'ready',
      call: 'N1RWJ',
      lastSuccessMs: NOW,
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch).toHaveBeenNthCalledWith(1, expect.any(String), { timeout: 1200 })
    expect(fetch).toHaveBeenNthCalledWith(2, expect.any(String), { timeout: 1200 })
    expect(fetch).toHaveBeenNthCalledWith(3, expect.any(String), { timeout: 1200 })
    expect(fetch.mock.calls.some(([url]) => url.includes('cdx=N1RWJ&ma=1800&m=1&r=500'))).toBe(true)
  })

  it('does not loop on repeated or malicious version challenges', async () => {
    for (const hash of ['abc123', '../untrusted?x=y']) {
      const fetch = vi.fn(async (url: string) =>
        response(url.includes('meta=1') ? metadata : { error: 888, ver_h: hash }),
      )
      expect(await createRbnClient({ fetch, now: () => NOW }).getSnapshot(query)).toMatchObject({
        status: 'error',
      })
      expect(fetch.mock.calls.length).toBe(hash === 'abc123' ? 3 : 2)
    }
  })

  it('deduplicates in-flight queries and enforces a 30-second minimum even for forced refreshes', async () => {
    let clock = NOW
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : payload()),
    )
    const client = createRbnClient({ fetch, now: () => clock })
    const [a, b] = await Promise.all([client.getSnapshot(query), client.getSnapshot(query)])
    expect(a).toEqual(b)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 29_999
    await client.getSnapshot(query, { force: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 1
    await client.getSnapshot(query)
    expect(fetch).toHaveBeenCalledTimes(2)
    await client.getSnapshot(query, { force: true })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('keeps cached reports and success time on a refresh failure; retries wait for cooldown', async () => {
    let clock = NOW
    let online = true
    const fetch = vi.fn(async (url: string) => {
      if (!online) throw new Error('socket failed')
      return response(url.includes('meta=1') ? metadata : payload())
    })
    const client = createRbnClient({ fetch, now: () => clock })
    await client.getSnapshot(query)
    online = false
    clock += 60_000
    const stale = await client.getSnapshot(query)
    expect(stale).toMatchObject({ status: 'stale', lastSuccessMs: NOW, lastAttemptMs: clock })
    expect(stale.reports).toHaveLength(1)
    await client.getSnapshot(query)
    expect(fetch).toHaveBeenCalledTimes(3)
    clock += 30 * 60_000
    expect((await client.getSnapshot(query)).reports).toEqual([])
  })

  it('honors host offline state without making requests', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : payload()),
    )
    const client = createRbnClient({ fetch, now: () => NOW })
    expect(await client.getSnapshot(query, { online: false })).toMatchObject({
      status: 'error',
      lastAttemptMs: null,
    })
    expect(fetch).not.toHaveBeenCalled()
    await client.getSnapshot(query)
    const offline = await client.getSnapshot(query, { online: false, force: true })
    expect(offline).toMatchObject({ status: 'stale', lastSuccessMs: NOW })
    expect(offline.reports).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('separates stations and time windows and rejects invalid calls without fetching', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : payload()),
    )
    const client = createRbnClient({ fetch, now: () => NOW })
    await client.getSnapshot(query)
    expect((await client.getSnapshot({ ...query, call: 'K1ABC' })).reports).toEqual([])
    await client.getSnapshot({ ...query, windowMinutes: 60 })
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(await client.getSnapshot({ ...query, call: '*&bad=1' })).toMatchObject({
      status: 'error',
    })
    expect(await client.getSnapshot({ ...query, call: 'N1RWJ-5' })).toMatchObject({
      status: 'error',
    })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('marks a successful empty response separately from HTTP and malformed JSON failures', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : { now: NOW / 1000 }),
    )
    expect(await createRbnClient({ fetch, now: () => NOW }).getSnapshot(query)).toMatchObject({
      status: 'empty',
      error: null,
    })
    for (const result of [
      { status: 400, body: JSON.stringify({ error: 'unexpected failure' }) },
      { status: 503, body: '' },
      { status: 200, body: '<html>oops</html>' },
    ]) {
      const failing = async (url: string) => (url.includes('meta=1') ? response(metadata) : result)
      expect(
        await createRbnClient({ fetch: failing, now: () => NOW }).getSnapshot(query),
      ).toMatchObject({ status: 'error' })
    }
  })

  it('evicts old queries to bound the cache', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(url.includes('meta=1') ? metadata : { now: NOW / 1000 }),
    )
    const client = createRbnClient({ fetch, now: () => NOW })
    for (let i = 0; i < 9; i++) await client.getSnapshot({ ...query, call: `K${i}ABC` })
    expect(fetch).toHaveBeenCalledTimes(10)
    await client.getSnapshot({ ...query, call: 'K0ABC' })
    expect(fetch).toHaveBeenCalledTimes(11)
  })
})
