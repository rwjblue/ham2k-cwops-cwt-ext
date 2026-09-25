import { describe, expect, it, vi } from 'vitest'
import { createRbnClient } from '../../src/data/client.ts'
import { createRbnTransport } from '../../src/data/transport.ts'
import { NOW, payload, spotPayload } from './fixtures.ts'

const query = { call: ' n1rwj ', windowMinutes: 30 }
const response = (data: unknown, status = 200) => ({ status, body: JSON.stringify(data) })

describe('Vail ReRBN client', () => {
  it.each([
    [
      new Error('TimeoutException after 0:00:03.000000: Future not completed'),
      'timeout',
      'TimeoutException',
    ],
    [new Error('SocketException: Failed host lookup'), 'request', 'Failed host lookup'],
    ['TLS handshake failed', 'request', 'TLS handshake failed'],
    [{ message: 'fetch blocked: undeclared domain' }, 'request', 'undeclared domain'],
    [null, 'request', 'host supplied no error detail'],
  ])('preserves rejected host fetch diagnostics: %j', async (error, kind, detail) => {
    const client = createRbnClient({
      fetch: async () => {
        throw error
      },
      now: () => NOW,
    })
    const failed = await client.getSnapshot(query)
    expect(failed).toMatchObject({ failureKind: kind, lastAttemptMs: NOW, lastSuccessMs: null })
    expect(failed.error).toContain(detail)
    expect(failed.error).toContain('no HTTP response was available')
    expect(failed.error).not.toContain('Check your connection')
  })

  it('bounds and normalizes host error messages without exposing stacks', async () => {
    const client = createRbnClient({
      fetch: async () => {
        throw new Error(`SocketException:\n\t${'x'.repeat(1000)}`)
      },
      now: () => NOW,
    })
    const failed = await client.getSnapshot(query)
    expect(failed.error).toContain('Host detail: SocketException: xxx')
    expect(failed.error).toMatch(/…$/)
    expect(failed.error?.length).toBeLessThan(450)
    expect(failed.error).not.toContain('\n')
  })

  it.each([
    [{ status: 503, body: 'private response body' }, 'http', 'HTTP 503'],
    [{ status: 200, body: '<html>oops</html>' }, 'response', 'invalid JSON (HTTP 200)'],
    [response({ spots: 'changed schema' }), 'response', 'unsupported data format (HTTP 200)'],
    [{ status: 200, body: ' '.repeat(1_000_001) }, 'response', 'too large (HTTP 200'],
  ])('preserves HTTP status and response failure kind %#', async (result, kind, detail) => {
    const failed = await createRbnClient({ fetch: async () => result, now: () => NOW }).getSnapshot(
      query,
    )
    expect(failed.failureKind).toBe(kind)
    expect(failed.error).toContain(detail)
    expect(failed.error).not.toContain('private response body')
  })

  it('reports cooldown eligibility without changing the last actual attempt and clears failures after recovery', async () => {
    let clock = NOW
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket failed'))
      .mockResolvedValue(response(payload()))
    const client = createRbnClient({ fetch, now: () => clock })
    await client.getSnapshot(query)
    clock += 10_000
    const deferred = await client.getSnapshot(query)
    expect(deferred).toMatchObject({
      lastAttemptMs: NOW,
      failureKind: 'request',
      refresh: { state: 'cooldown', manualAtMs: 0, automaticAtMs: NOW + 60_000 },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    clock += 20_000
    const recovered = await client.getSnapshot(query, { force: true })
    expect(recovered).toMatchObject({ status: 'ready', error: null, lastAttemptMs: clock })
    expect(recovered.failureKind).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shows shared transport backoff without recording an unsent request as an attempt', async () => {
    let clock = NOW
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(payload()))
      .mockResolvedValueOnce(response({ error: { retryAfter: 120 } }, 429))
      .mockResolvedValue(response(payload()))
    const transport = createRbnTransport(fetch, () => clock)
    const client = createRbnClient({ fetch: transport, now: () => clock })
    await client.getSnapshot(query)
    clock += 60_000
    await transport('https://vailrerbn.com/api/v1/spots?mode=CW')
    const blocked = await client.getSnapshot(query)
    expect(blocked).toMatchObject({
      status: 'stale',
      failureKind: 'rate-limit',
      lastAttemptMs: NOW,
      lastSuccessMs: NOW,
      refresh: { state: 'rate-limit', manualAtMs: NOW + 180_000, automaticAtMs: NOW + 180_000 },
    })
    expect(blocked.error).toContain('HTTP 429')
    expect(blocked.error).toContain('another RBN request')
    expect(await client.getSnapshot({ ...query, call: 'K1ABC' })).toMatchObject({
      lastAttemptMs: null,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 120_000
    expect(await client.getSnapshot(query)).toMatchObject({ status: 'ready', error: null })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('uses one bounded HTTP snapshot across modes and preserves exact portable calls', async () => {
    const fetch = vi.fn(async (_url: string) =>
      response(
        payload({
          spots: [
            spotPayload({ callsign: 'N1RWJ/P', mode: 'FT8' }),
            spotPayload({ callsign: 'N1RWJ/P', mode: 'FT4', id: 124 }),
            spotPayload({ callsign: 'N1RWJ/P2', id: 125 }),
          ],
          total: 3,
        }),
      ),
    )
    const client = createRbnClient({ fetch, now: () => NOW })
    const snapshot = await client.getSnapshot({ ...query, call: ' n1rwj/p ' })
    expect(snapshot).toMatchObject({ status: 'ready', call: 'N1RWJ/P', lastSuccessMs: NOW })
    expect(snapshot.reports.map((report) => report.mode).sort()).toEqual(['FT4', 'FT8'])
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://vailrerbn.com/api/v1/spots?call=N1RWJ%2FP&since=${NOW / 1000 - 1800}&limit=500`,
      { timeout: 3000 },
    )
  })

  it('uses the supplied real clock for report windows, cooldowns, and expiry during time travel', async () => {
    let developerTime = NOW + 7 * 24 * 60 * 60_000
    const fetch = vi.fn(async (_url: string) => response(payload()))
    const client = createRbnClient({ fetch, now: () => developerTime })
    const initial = await client.getSnapshot(query, { realNowMillis: NOW })
    expect(initial).toMatchObject({ status: 'ready', lastSuccessMs: NOW, lastAttemptMs: NOW })
    expect(initial.reports).toHaveLength(1)
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('since')).toBe(
      String(NOW / 1000 - 1800),
    )
    developerTime += 365 * 24 * 60 * 60_000
    await client.getSnapshot(query, { realNowMillis: NOW + 10_000 })
    expect(fetch).toHaveBeenCalledTimes(1)
    developerTime = NOW - 7 * 24 * 60 * 60_000
    const refreshed = await client.getSnapshot(query, { realNowMillis: NOW + 60_000 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(refreshed.lastSuccessMs).toBe(NOW + 60_000)
    expect(
      await client.getSnapshot(query, { online: false, realNowMillis: NOW + 31 * 60_000 }),
    ).toMatchObject({ status: 'stale', reports: [] })
  })

  it('retains the injected clock fallback for older hosts and invalid optional clock values', async () => {
    const client = createRbnClient({ fetch: async () => response(payload()), now: () => NOW })
    expect(await client.getSnapshot(query, { realNowMillis: Number.NaN })).toMatchObject({
      status: 'ready',
      lastSuccessMs: NOW,
    })
  })

  it('deduplicates requests and bypasses only the local cooldown for forced refreshes', async () => {
    let clock = NOW
    const fetch = vi.fn(async () => response(payload()))
    const client = createRbnClient({ fetch, now: () => clock })
    const [a, b] = await Promise.all([client.getSnapshot(query), client.getSnapshot(query)])
    expect(a).toEqual(b)
    expect(fetch).toHaveBeenCalledTimes(1)
    clock += 1
    await client.getSnapshot(query)
    expect(fetch).toHaveBeenCalledTimes(1)
    await Promise.all([
      client.getSnapshot(query, { force: true }),
      client.getSnapshot(query, { force: true }),
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 59_999
    await client.getSnapshot(query)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 1
    await client.getSnapshot(query)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('keeps cached reports and success time on failure; expires old reports and waits to retry', async () => {
    let clock = NOW
    let online = true
    const fetch = vi.fn(async () => {
      if (!online) throw new Error('socket failed')
      return response(payload())
    })
    const client = createRbnClient({ fetch, now: () => clock })
    await client.getSnapshot(query)
    online = false
    clock += 60_000
    const stale = await client.getSnapshot(query)
    expect(stale).toMatchObject({ status: 'stale', lastSuccessMs: NOW, lastAttemptMs: clock })
    expect(stale.reports).toHaveLength(1)
    await client.getSnapshot(query)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 30 * 60_000
    expect((await client.getSnapshot(query)).reports).toEqual([])
  })

  it('honors host offline state without making requests', async () => {
    const fetch = vi.fn(async () => response(payload()))
    const client = createRbnClient({ fetch, now: () => NOW })
    expect(await client.getSnapshot(query, { online: false })).toMatchObject({
      status: 'error',
      lastAttemptMs: null,
    })
    expect(fetch).not.toHaveBeenCalled()
    await client.getSnapshot(query)
    const offline = await client.getSnapshot(query, { online: false, force: true })
    expect(offline).toMatchObject({ status: 'stale', lastSuccessMs: NOW })
    expect(offline).toMatchObject({
      failureKind: 'offline',
      refresh: { state: 'offline', manualAtMs: null, automaticAtMs: null },
    })
    expect(offline.reports).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('separates stations and time windows and rejects invalid calls without fetching', async () => {
    const fetch = vi.fn(async () => response(payload()))
    const client = createRbnClient({ fetch, now: () => NOW })
    await client.getSnapshot(query)
    expect((await client.getSnapshot({ ...query, call: 'K1ABC' })).reports).toEqual([])
    await client.getSnapshot({ ...query, windowMinutes: 60 })
    expect(fetch).toHaveBeenCalledTimes(3)
    for (const call of ['*&bad=1', 'N1RWJ-5']) {
      expect(await client.getSnapshot({ ...query, call })).toMatchObject({ status: 'error' })
    }
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('distinguishes empty results from HTTP, malformed, and oversized failures', async () => {
    const fetch = async () => response(payload({ spots: [], total: 0 }))
    expect(await createRbnClient({ fetch, now: () => NOW }).getSnapshot(query)).toMatchObject({
      status: 'empty',
      error: null,
    })
    for (const result of [
      response({ error: 'unexpected failure' }, 400),
      { status: 503, body: '' },
      { status: 200, body: '<html>oops</html>' },
      { status: 200, body: ' '.repeat(1_000_001) },
      response({ spots: 'changed schema' }),
    ]) {
      const failing = vi.fn(async () => result)
      expect(
        await createRbnClient({ fetch: failing, now: () => NOW }).getSnapshot(query),
      ).toMatchObject({ status: 'error', lastSuccessMs: null, reports: [] })
      expect(failing).toHaveBeenCalledTimes(1)
    }
  })

  it('replaces snapshots and detects server truncation before filtering partial calls', async () => {
    let clock = NOW
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(payload({ total: 700 })))
      .mockResolvedValueOnce(response(payload({ spots: [spotPayload({ callsign: 'N1RWJ/P' })] })))
    const client = createRbnClient({ fetch, now: () => clock })
    expect(await client.getSnapshot(query)).toMatchObject({ status: 'ready', capped: true })
    clock += 60_000
    expect(await client.getSnapshot(query)).toMatchObject({
      status: 'empty',
      capped: false,
      reports: [],
    })
  })

  it('honors Vail retryAfter across queries and forced refreshes while retaining cached data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(payload()))
      .mockResolvedValueOnce(
        response({ error: { code: 'RATE_LIMIT_EXCEEDED', retryAfter: 120 } }, 429),
      )
      .mockResolvedValue(response(payload()))
    const client = createRbnClient({ fetch, now: () => NOW + 365 * 24 * 60 * 60_000 })
    await client.getSnapshot(query, { realNowMillis: NOW })
    const limited = await client.getSnapshot(query, { realNowMillis: NOW + 60_000 })
    expect(limited).toMatchObject({ status: 'stale', lastSuccessMs: NOW })
    expect(limited).toMatchObject({
      failureKind: 'rate-limit',
      refresh: { manualAtMs: NOW + 183_000, automaticAtMs: NOW + 183_000 },
    })
    expect(limited.error).toContain('rate limit')
    expect(limited.reports).toHaveLength(1)
    for (const call of ['N1RWJ', 'K1ABC']) {
      const waiting = await client.getSnapshot(
        { ...query, call },
        { force: true, realNowMillis: NOW + 182_999 },
      )
      expect(waiting.error).toContain('rate limit')
    }
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(await client.getSnapshot(query, { realNowMillis: NOW + 183_000 })).toMatchObject({
      status: 'ready',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('backs off even when a 429 has no usable JSON retryAfter', async () => {
    for (const body of [
      '<html>Too many requests</html>',
      JSON.stringify({ error: { retryAfter: -1 } }),
    ]) {
      let clock = NOW
      const fetch = vi.fn(async () => ({ status: 429, body }))
      const client = createRbnClient({ fetch, now: () => clock })
      expect((await client.getSnapshot(query)).error).toContain('rate limit')
      clock += 62_999
      await client.getSnapshot({ ...query, call: 'K1ABC' }, { force: true })
      expect(fetch).toHaveBeenCalledTimes(1)
      clock += 1
      await client.getSnapshot(query)
      expect(fetch).toHaveBeenCalledTimes(2)
    }
  })

  it('keeps rate-limit diagnostics consistent for concurrent callers', async () => {
    const fetch = vi.fn(async () => response({ error: { retryAfter: 120 } }, 429))
    const client = createRbnClient({ fetch, now: () => NOW })
    const [first, second] = await Promise.all([
      client.getSnapshot(query),
      client.getSnapshot(query),
    ])
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      failureKind: 'rate-limit',
      refresh: { state: 'rate-limit', manualAtMs: NOW + 123_000 },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('evicts old queries to bound the cache', async () => {
    const fetch = vi.fn(async () => response(payload({ spots: [], total: 0 })))
    const client = createRbnClient({ fetch, now: () => NOW })
    for (let i = 0; i < 9; i++) await client.getSnapshot({ ...query, call: `K${i}ABC` })
    expect(fetch).toHaveBeenCalledTimes(9)
    await client.getSnapshot({ ...query, call: 'K0ABC' })
    expect(fetch).toHaveBeenCalledTimes(10)
  })
})
