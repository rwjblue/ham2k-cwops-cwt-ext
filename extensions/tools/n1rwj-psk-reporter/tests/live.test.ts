import type { FetchResponse } from '@ham2k/extension-sdk'
import { expect, it, vi } from 'vitest'
import { environment } from '../../../../packages/reception/tests/environment.ts'
import { createLiveReception } from '../src/live.ts'
import { createPskPanel } from '../src/panel.ts'
import { fakeSocket, publication } from './socket-fixture.ts'

const initialNow = Date.UTC(2026, 8, 23, 18)
const topic = 'pskr/filter/v2/20m/FT8/N1RWJ/CU3AT/FN42/HM68/291/149'
const payload = (overrides = {}) =>
  JSON.stringify({
    sc: 'N1RWJ',
    rc: 'CU3AT',
    sl: 'FN42',
    rl: 'HM68',
    t: initialNow / 1000,
    f: 14074000,
    md: 'FT8',
    b: '20m',
    rp: -12,
    ...overrides,
  })

function setup() {
  let now = initialNow
  const sockets: ReturnType<typeof fakeSocket>[] = []
  const live = createLiveReception(
    () => {
      const f = fakeSocket()
      sockets.push(f)
      return f.socket
    },
    () => now,
    () => 0,
  )
  const snapshot = (id = 'one', call = 'N1RWJ', incoming = false, online = true) =>
    live.snapshot(id, call, incoming ? 'incoming' : 'outgoing', 15, online)
  const connected = () => {
    snapshot()
    sockets[0].socket.onopen?.()
    sockets[0].receive([0x20, 2, 0, 0])
    sockets[0].receive([0x90, 3, 0, 1, 0])
  }
  return {
    live,
    sockets,
    snapshot,
    connected,
    advance: (ms: number) => {
      now += ms
    },
  }
}

it('shares a socket and subscriptions, isolates directions and rejects unrelated or mismatched payloads', () => {
  const s = setup()
  s.connected()
  s.snapshot('two')
  s.snapshot('three', 'CU3AT', true)
  expect(s.sockets).toHaveLength(1)
  expect(s.sockets[0].sent.filter((p) => p[0] === 0x82)).toHaveLength(2)
  s.sockets[0].receive(publication(topic, payload()))
  expect(s.snapshot().reports).toHaveLength(1)
  expect(s.snapshot('three', 'CU3AT', true).reports).toHaveLength(1)
  expect(s.snapshot('four', 'CU3AT').reports).toEqual([])
  s.sockets[0].receive(publication(topic, payload({ sc: 'W1AW', rc: 'W1NT' })))
  expect(s.snapshot().reports).toHaveLength(1)
  expect(s.snapshot('one', 'W1AW').reports).toEqual([])
})

it('refuses malformed/wildcard subscriptions and bounds active placements/topics', () => {
  const s = setup()
  for (const call of ['N1RWJ.P', '#', '']) expect(s.snapshot('bad', call).state).toBe('invalid')
  expect(s.sockets).toHaveLength(0)
  for (let n = 0; n < 8; n++) expect(s.snapshot(String(n), `W${n}AA`).state).not.toBe('limit')
  expect(s.snapshot('excess', 'W9ZZ').state).toBe('limit')
  expect(s.sockets).toHaveLength(1)
})

it('expires leases and stored reports; hidden traffic cannot keep the socket alive', () => {
  const s = setup()
  s.connected()
  const message = s.sockets[0].socket.onmessage
  s.advance(31_000)
  message?.({ data: new Uint8Array(publication(topic, payload())).buffer })
  expect(s.sockets[0].closed).toBe(1)
  expect(s.snapshot().reports).toEqual([])
  expect(s.sockets).toHaveLength(2)
  s.advance(61 * 60_000)
  expect(s.snapshot().reports).toEqual([])
  s.live.stop()
  expect(s.sockets[s.sockets.length - 1]?.closed).toBe(1)
})

it('stops offline and updates a native panel on a five-second cadence without claiming old reports are new', async () => {
  const s = setup()
  s.connected()
  s.sockets[0].receive(publication(topic, payload()))
  const panel = createPskPanel(s.live)
  expect((await panel.getPanels({}, { online: true }))[0].on).toEqual(['operation', 'tick:5'])
  const args = {
    panelKey: 'psk-reporter',
    instanceId: 'one',
    environment: environment(),
    operation: { stationCall: 'N1RWJ', grid: 'FN42' },
    config: {},
    reason: 'operation' as const,
    qsoCount: 0,
    clock: { nowMillis: initialNow, realNowMillis: initialNow },
  }
  const live = await panel.render(args, { online: true })
  expect(JSON.stringify(live)).toContain('Live reception')
  expect(JSON.stringify(live)).toContain('CU3AT')
  const offline = await panel.render(args, { online: false })
  expect(JSON.stringify(offline)).toContain('Offline · reception paused')
  expect(s.sockets[0].closed).toBe(1)
})

it('discards backfill for a replaced callsign while live reception remains independent', async () => {
  let finish!: (response: FetchResponse) => void
  const response = new Promise<FetchResponse>((resolve) => {
    finish = resolve
  })
  const fetch = vi.fn(async () => response)
  const socket = fakeSocket()
  const live = createLiveReception(
    () => socket.socket,
    () => initialNow,
    () => 0,
    {
      fetch,
      read: async () => null,
      write: async () => {},
    },
  )
  live.snapshot('one', 'N1RWJ', 'outgoing', 15, true)
  for (let n = 0; n < 30; n++) await Promise.resolve()
  expect(fetch).toHaveBeenCalledTimes(1)
  live.snapshot('one', 'W1AW', 'outgoing', 15, true)
  finish({
    status: 200,
    body: `<pskreporter><receptionReport senderCallsign="N1RWJ" receiverCallsign="CU3AT" frequency="14074000" mode="FT8" flowStartSeconds="${initialNow / 1000}"/></pskreporter>`,
  })
  for (let n = 0; n < 30; n++) await Promise.resolve()
  expect(live.snapshot('one', 'W1AW', 'outgoing', 15, true).reports).toEqual([])
  expect(live.snapshot('one', 'N1RWJ', 'outgoing', 15, true).reports).toEqual([])
})

it('matches exact portable topics and payloads in both directions', () => {
  const s = setup()
  s.snapshot('one', 'EA8/N1RWJ/P')
  s.sockets[0].socket.onopen?.()
  s.sockets[0].receive([0x20, 2, 0, 0])
  s.sockets[0].receive([0x90, 3, 0, 1, 0])
  s.snapshot('two', 'CU3AT/P', true)
  const portableTopic = topic.replace('N1RWJ/CU3AT', 'EA8.N1RWJ.P/CU3AT.P')
  s.sockets[0].receive(publication(portableTopic, payload({ sc: 'EA8.N1RWJ.P', rc: 'CU3AT.P' })))
  expect(s.snapshot('one', 'EA8/N1RWJ/P').reports).toHaveLength(1)
  expect(s.snapshot('two', 'CU3AT/P', true).reports).toHaveLength(1)
  expect(s.snapshot('base', 'N1RWJ').reports).toHaveLength(0)
  s.sockets[0].receive(publication(portableTopic, payload({ sc: 'EA8/N1RWJ', rc: 'CU3AT/P' })))
  expect(s.snapshot('two', 'CU3AT/P', true).reports).toHaveLength(1)
})
