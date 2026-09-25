import type { FetchResponse, JSONValue } from '@ham2k/extension-sdk'
import { describe, expect, it, vi } from 'vitest'
import { createReportStore } from '../src/data/store.ts'
import { createHistoryClient, type HistoryHost } from '../src/history/client.ts'
import { historyLimit, parseHistoryXml } from '../src/history/parser.ts'

const initial = Date.UTC(2026, 8, 24, 18)
const row = (attrs = '') =>
  `<receptionReport senderCallsign="N1RWJ" receiverCallsign="CU3AT" senderLocator="FN42" receiverLocator="HM68" frequency="14074000" mode="FT8" sNR="-12" flowStartSeconds="${initial / 1000 - 30}" ${attrs}/>`
const xml = (rows = row()) =>
  `<?xml version="1.0"?><pskreporter><status code="0"/>${rows}</pskreporter>`
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup(storage = new Map<string, JSONValue>()) {
  let time = initial
  const host = {
    fetch: vi.fn<HistoryHost['fetch']>(async () => ({ status: 200, body: xml() })),
    kvGet: vi.fn<HistoryHost['kvGet']>(async (key) => storage.get(key) ?? null),
    kvSet: vi.fn<HistoryHost['kvSet']>(async (key, value) => {
      storage.set(key, value)
    }),
  }
  const store = createReportStore()
  const ingest = vi.fn((reports: ReturnType<typeof parseHistoryXml>['reports']) => {
    for (const report of reports) store.ingestReport(report, time)
  })
  const client = createHistoryClient(host, ingest, () => time)
  const observe = (call = 'N1RWJ', window = 15, connected = true, online = true) =>
    client.observe(call, 'outgoing', window, connected, online)
  const advance = (ms: number) => {
    time += ms
  }
  return { host, client, observe, advance, store, ingest, storage, now: () => time }
}

describe('PSK history XML', () => {
  it('reads metadata, entities, single quotes, both roots and missing optional fields', () => {
    const result = parseHistoryXml(xml(row('senderCountry="A &amp; B"')))
    expect(result).toMatchObject({
      incomplete: false,
      reports: [
        {
          band: '20m',
          mode: 'FT8',
          snrDb: -12,
          timeMs: initial - 30_000,
          receiver: { call: 'CU3AT', location: { grid: 'HM68' } },
        },
      ],
    })
    const minimal = `<receptionReports><receptionReport senderCallsign='N1RW&#74;' receiverCallsign='W1AW' frequency='7074000' flowStartSeconds='${initial / 1000}'></receptionReport></receptionReports>`
    expect(parseHistoryXml(minimal).reports[0]).toMatchObject({
      band: '40m',
      mode: 'UNKNOWN',
      transmitter: { call: 'N1RWJ' },
    })
    expect(parseHistoryXml(minimal).reports[0].receiver.location).toBeUndefined()
    expect(parseHistoryXml('<pskreporter/>').reports).toEqual([])
  })
  it.each([
    '<html><body>Just a moment...</body></html>',
    '<pskreporter><error message="busy"/></pskreporter>',
    '<pskreporter><status></pskreporter>',
    '<pskreporter/><pskreporter/>',
    '<pskreporter><',
    '<!DOCTYPE pskreporter><pskreporter/>',
    xml(row('country="&external;"')),
    xml(row('mode="FT4"')),
    ' '.repeat(2_000_001),
  ])('rejects errors, challenges and malformed documents', (body) => {
    expect(() => parseHistoryXml(body)).toThrow('History unavailable')
  })
  it('flags truncated or unsupported rows without inventing reports', () => {
    expect(parseHistoryXml(xml('<receptionReport bad="yes"/>'))).toEqual({
      reports: [],
      incomplete: true,
    })
    expect(parseHistoryXml(xml(row().repeat(historyLimit))).incomplete).toBe(true)
  })
})

describe('shared backfill scheduling', () => {
  it('fetches startup history once across placements and merges without overwriting newer live reports', async () => {
    const s = setup()
    const live = parseHistoryXml(xml()).reports[0]
    s.store.ingestReport({ ...live, timeMs: initial, snrDb: -25 }, initial)
    s.observe()
    s.observe()
    await flush()
    expect(s.host.fetch).toHaveBeenCalledTimes(1)
    expect(s.host.fetch.mock.calls[0][0]).toContain(
      'senderCallsign=N1RWJ&flowStartSeconds=-900&rptlimit=1000',
    )
    expect(s.store.snapshot(initial, 15).reports).toHaveLength(1)
    expect(s.store.snapshot(initial, 15).reports[0].snrDb).toBe(-25)
    for (let i = 0; i < 100; i++) {
      s.advance(5000)
      s.observe()
      await flush()
    }
    expect(s.host.fetch).toHaveBeenCalledTimes(1)
  })
  it('queues other calls globally, cancels hidden work, and retries after a resume or larger window', async () => {
    const s = setup()
    s.observe()
    await flush()
    s.observe('W1AW')
    await flush()
    expect(s.host.fetch).toHaveBeenCalledTimes(1)
    s.advance(300_000)
    s.observe('N1RWJ', 60)
    await flush()
    expect(s.host.fetch).toHaveBeenCalledTimes(2)
    expect(s.host.fetch.mock.calls[1][0]).toContain('flowStartSeconds=-3600')
    s.advance(5000)
    s.observe('N1RWJ', 60, false)
    s.advance(5000)
    expect(s.observe('N1RWJ', 60).message).toContain('gap')
    await flush()
    expect(s.host.fetch).toHaveBeenCalledTimes(2)
  })
  it('restores cooldown across extension reloads but force reload bypasses it', async () => {
    const s = setup()
    s.observe()
    await flush()
    const reloaded = setup(s.storage)
    reloaded.observe()
    await flush()
    expect(reloaded.host.fetch).not.toHaveBeenCalled()
    await reloaded.client.force('N1RWJ', 'outgoing', 15, true)
    expect(reloaded.host.fetch).toHaveBeenCalledTimes(1)
    reloaded.observe()
    await flush()
    expect(reloaded.host.fetch).toHaveBeenCalledTimes(1)
  })
  it('coalesces repeated force clicks and serializes a different callsign', async () => {
    const s = setup()
    const response = deferred<FetchResponse>()
    s.host.fetch.mockReturnValueOnce(response.promise)
    s.observe()
    s.observe('W1AW')
    await flush()
    const first = s.client.force('N1RWJ', 'outgoing', 15, true)
    const duplicate = s.client.force('N1RWJ', 'outgoing', 15, true)
    const other = s.client.force('W1AW', 'outgoing', 15, true)
    expect(s.host.fetch).toHaveBeenCalledTimes(1)
    response.resolve({ status: 200, body: xml() })
    await Promise.all([first, duplicate, other])
    expect(s.host.fetch).toHaveBeenCalledTimes(2)
    expect(s.host.fetch.mock.calls[1][0]).toContain('senderCallsign=W1AW')
  })
  it('filters exact calls, direction, stale/future reports and retains unlocated stations', async () => {
    const s = setup()
    const mixed =
      row() +
      row().replace('N1RWJ', 'N1RWJ/P') +
      row().replace('N1RWJ', 'W1AW') +
      row().replace(String(initial / 1000 - 30), String(initial / 1000 - 901)) +
      row().replace(String(initial / 1000 - 30), String(initial / 1000 + 90))
    s.host.fetch.mockResolvedValue({ status: 200, body: xml(mixed) })
    s.client.observe('CU3AT', 'incoming', 15, true, true)
    await flush()
    expect(s.host.fetch.mock.calls[0][0]).toContain('receiverCallsign=CU3AT')
    expect(s.ingest.mock.calls[0][0]).toHaveLength(3)
    s.observe()
    await s.client.force('N1RWJ', 'outgoing', 15, true)
    expect(s.ingest.mock.calls[1][0]).toHaveLength(1)
  })
  it('backs off errors, preserves reports and lets force retry without resetting automatic limits', async () => {
    const s = setup()
    s.observe()
    await flush()
    s.host.fetch.mockResolvedValue({ status: 429, body: 'slow down' })
    await s.client.force('N1RWJ', 'outgoing', 15, true)
    expect(s.observe().warning).toContain('429')
    expect(s.store.snapshot(initial, 15).reports).toHaveLength(1)
    s.advance(300_000)
    s.observe()
    await flush()
    expect(s.host.fetch).toHaveBeenCalledTimes(3)
    s.advance(300_000)
    s.observe()
    await flush()
    expect(s.host.fetch).toHaveBeenCalledTimes(3)
    s.host.fetch.mockResolvedValue({ status: 200, body: '<html>challenge</html>' })
    await s.client.force('N1RWJ', 'outgoing', 15, true)
    expect(s.observe().warning).toContain('unsupported XML')
  })
  it('does not send while offline or without durable cooldown storage', async () => {
    const s = setup()
    s.observe('N1RWJ', 15, false, false)
    await s.client.force('N1RWJ', 'outgoing', 15, false)
    expect(s.host.fetch).not.toHaveBeenCalled()
    s.host.kvSet.mockRejectedValue(new Error('storage failed'))
    s.observe()
    await flush()
    expect(s.host.fetch).not.toHaveBeenCalled()
    expect(s.observe().warning).toContain('storage')
  })
  it('ignores results after stop, loss of visibility, or offline transition', async () => {
    for (const action of ['stop', 'hidden', 'offline']) {
      const s = setup()
      const response = deferred<FetchResponse>()
      s.host.fetch.mockReturnValueOnce(response.promise)
      s.observe()
      await flush()
      if (action === 'stop') s.client.stop()
      if (action === 'hidden') s.advance(31_000)
      if (action === 'offline') s.observe('N1RWJ', 15, false, false)
      response.resolve({ status: 200, body: xml() })
      await flush()
      expect(s.ingest).not.toHaveBeenCalled()
    }
  })
  it('keeps a larger-window request pending if settings change during a fetch', async () => {
    const s = setup()
    const response = deferred<FetchResponse>()
    s.host.fetch.mockReturnValueOnce(response.promise)
    s.observe()
    await flush()
    s.observe('N1RWJ', 60)
    response.resolve({ status: 200, body: xml() })
    await flush()
    expect(s.observe('N1RWJ', 60).message).toContain('gap')
    s.advance(300_000)
    s.observe('N1RWJ', 60)
    await flush()
    expect(s.host.fetch.mock.calls[1][0]).toContain('flowStartSeconds=-3600')
  })
})
