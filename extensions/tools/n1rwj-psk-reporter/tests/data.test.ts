import { describe, expect, it } from 'vitest'
import { parsePskPayload } from '../src/data/parser.ts'
import { createReportStore } from '../src/data/store.ts'
import { pskTopic } from '../src/data/subscriptions.ts'

const now = Date.UTC(2026, 8, 23, 18)
const payload = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({
    sq: 73046586991,
    f: 14074653,
    md: 'FT8',
    rp: -14,
    t: now / 1000,
    t_tx: now / 1000 - 15,
    sc: 'N1RWJ',
    sl: 'FN42fk',
    rc: 'CU3AT',
    rl: 'HM68jp36',
    b: '20m',
    ...changes,
  })

describe('PSK Reporter payloads and subscriptions', () => {
  it('preserves direction, normalized transmission time, frequency and receiver SNR', () => {
    expect(parsePskPayload(payload({ sc: ' n1rwj/p ', rp: 0 }))).toMatchObject({
      id: '73046586991',
      transmitter: { call: 'N1RWJ/P', location: { grid: 'FN42FK', source: 'reported-grid' } },
      receiver: { call: 'CU3AT', location: { grid: 'HM68JP36', source: 'reported-grid' } },
      frequencyHz: 14074653,
      timeMs: now - 15_000,
      snrDb: 0,
      mode: 'FT8',
      band: '20m',
    })
  })
  it('decodes dotted portable calls without removing prefixes or suffixes', () => {
    expect(parsePskPayload(payload({ sc: 'ea8.n1rwj.p', rc: 'cu3at.p' }))).toMatchObject({
      transmitter: { call: 'EA8/N1RWJ/P' },
      receiver: { call: 'CU3AT/P' },
    })
  })
  it('keeps unlocated stations without manufacturing positions or measurements', () => {
    const report = parsePskPayload(payload({ sl: 'ZZ99', rl: null, rp: null, t_tx: undefined }))
    expect(report?.transmitter.location).toBeUndefined()
    expect(report?.receiver.location).toBeUndefined()
    expect(report?.snrDb).toBeUndefined()
    expect(report?.timeMs).toBe(now)
    expect(report?.wpm).toBeUndefined()
  })
  it.each(['not JSON', '[]', 'null', ' '.repeat(16_385)])(
    'rejects unsupported payload %s',
    (raw) => {
      expect(parsePskPayload(raw)).toBeUndefined()
    },
  )
  it.each([
    { f: '14074000' },
    { f: -1 },
    { t: null, t_tx: null },
    { sc: '+' },
    { sc: 'N1RWJ..P' },
    { rc: '.N1RWJ' },
    { rc: 'N1RWJ/#' },
    { md: '' },
    { b: 'garbage' },
    { t_tx: 1e15 },
  ])('rejects malformed essential fields %j', (changes) => {
    expect(parsePskPayload(payload(changes))).toBeUndefined()
  })
  it('builds exact directional subscriptions and refuses wildcards and malformed callsigns', () => {
    expect(pskTopic(' n1rwj ', 'outgoing')).toBe('pskr/filter/v2/+/+/N1RWJ/#')
    expect(pskTopic('N1RWJ', 'incoming')).toBe('pskr/filter/v2/+/+/+/N1RWJ/#')
    expect(pskTopic('ea8/n1rwj/p', 'outgoing')).toBe('pskr/filter/v2/+/+/EA8.N1RWJ.P/#')
    expect(pskTopic('N1RWJ/P', 'incoming')).toBe('pskr/filter/v2/+/+/+/N1RWJ.P/#')
    for (const call of ['', '+', '#', 'N1RWJ/#', 'N1RWJ.P', 'N1RWJ//P'])
      expect(pskTopic(call, 'outgoing')).toBeUndefined()
  })
})

describe('bounded live report store', () => {
  it('keeps separate transmitters, receivers, bands and modes; newest wins over stronger SNR', () => {
    const store = createReportStore()
    store.ingest(payload({ rp: 10 }), now)
    store.ingest(payload({ sq: 2, rp: -20, t_tx: now / 1000 }), now)
    expect(store.ingest(payload({ sq: 3, rp: 30, t_tx: now / 1000 - 30 }), now)).toBe(false)
    for (const changes of [{ sc: 'W1AW' }, { rc: 'W1AW' }, { b: '40m' }, { md: 'FT4' }]) {
      expect(store.ingest(payload(changes), now)).toBe(true)
    }
    const snapshot = store.snapshot(now, 15)
    expect(snapshot.reports).toHaveLength(5)
    expect(snapshot.reports.find((report) => report.id === '2')?.snrDb).toBe(-20)
    expect(snapshot.capped).toBe(false)
  })
  it('expires reports without traffic, rejects stale/future input and bounds memory', () => {
    const store = createReportStore(2)
    for (const [index, rc] of ['W1AW', 'W1NT', 'CU3AT'].entries()) {
      store.ingest(payload({ rc, t_tx: now / 1000 - 100 + index }), now)
    }
    expect(store.snapshot(now, 15)).toMatchObject({ capped: true })
    expect(store.snapshot(now, 15).reports.map((report) => report.receiver.call)).toEqual([
      'W1NT',
      'CU3AT',
    ])
    expect(store.ingest(payload({ t_tx: now / 1000 - 3601 }), now)).toBe(false)
    expect(store.ingest(payload({ t_tx: now / 1000 + 61 }), now)).toBe(false)
    expect(store.snapshot(now + 3601_000, 60)).toEqual({ reports: [], capped: false })
    store.ingest(payload(), now)
    store.clear()
    expect(store.snapshot(now, 15)).toEqual({ reports: [], capped: false })
  })
})
