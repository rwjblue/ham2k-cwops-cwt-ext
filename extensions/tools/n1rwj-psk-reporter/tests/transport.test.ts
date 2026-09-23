import { describe, expect, it } from 'vitest'
import { createMqttClient } from '../src/transport/client.ts'
import { connectPacket, createMqttDecoder, subscriptionPacket } from '../src/transport/mqtt.ts'
import { fakeSocket, publication } from './socket-fixture.ts'

describe('MQTT framing without browser or Node globals', () => {
  it('encodes clean MQTT 3.1.1 CONNECT, QoS-0 SUBSCRIBE and UNSUBSCRIBE', () => {
    expect([...connectPacket('test')]).toEqual([
      16, 16, 0, 4, 77, 81, 84, 84, 4, 2, 0, 30, 0, 4, 116, 101, 115, 116,
    ])
    expect([...subscriptionPacket(42, 'a/#')]).toEqual([130, 8, 0, 42, 0, 3, 97, 47, 35, 0])
    expect([...subscriptionPacket(42, 'a/#', true)]).toEqual([162, 7, 0, 42, 0, 3, 97, 47, 35])
  })
  it('reassembles every possible split, coalesced packets and multi-byte UTF-8', () => {
    const bytes = [...publication('test/topic', `{"text":"é🌎${'x'.repeat(130)}"}`), 0xd0, 0]
    for (let split = 0; split <= bytes.length; split++) {
      const decoder = createMqttDecoder()
      const result = [
        ...decoder.feed(new Uint8Array(bytes.slice(0, split)).buffer),
        ...decoder.feed(new Uint8Array(bytes.slice(split)).buffer),
      ]
      expect(result).toEqual([
        {
          kind: 'publish',
          topic: 'test/topic',
          payload: `{"text":"é🌎${'x'.repeat(130)}"}`,
          retained: false,
        },
        { kind: 'pingresp' },
      ])
    }
  })
  it.each([
    [0x30, 0xff, 0xff, 0xff, 0xff],
    [0x30, 0x80, 0],
    [0x30, 0x81, 0x80, 2],
    [0x32, 0],
    [0x30, 4, 0, 1, 97, 0xff],
    [0x30, 4, 0, 8, 97, 1],
    [0x20, 2, 1, 0],
    [0x90, 3, 0, 0, 0],
    [0xd1, 0],
  ])('rejects malformed, oversized, or unsupported packets: %j', (...bytes) => {
    expect(() => createMqttDecoder().feed(new Uint8Array(bytes).buffer)).toThrow()
  })
  it('caps work per callback and retained-frame memory', () => {
    expect(() => createMqttDecoder().feed(new Uint8Array(65537).buffer)).toThrow()
    expect(() =>
      createMqttDecoder().feed(
        new Uint8Array(Array.from({ length: 257 }, () => [0xd0, 0]).flat()).buffer,
      ),
    ).toThrow()
  })
})

describe('MQTT session lifecycle', () => {
  function setup() {
    let now = 1000
    const sockets: ReturnType<typeof fakeSocket>[] = []
    const reports: string[] = []
    const client = createMqttClient({
      now: () => now,
      random: () => 0,
      onReport: (_, data) => reports.push(data),
      open: (url, options) => {
        expect(url).toBe('wss://mqtt.pskreporter.info:1886')
        expect(options?.protocols).toEqual(['mqtt'])
        const fake = fakeSocket()
        sockets.push(fake)
        return fake.socket
      },
    })
    const tick = (delta = 0, topics = ['test/#']) => {
      now += delta
      client.tick(topics)
    }
    const connect = () => {
      tick()
      sockets[sockets.length - 1]?.socket.onopen?.()
      sockets[sockets.length - 1]?.receive([0x20, 2, 0, 0])
      sockets[sockets.length - 1]?.receive([0x90, 3, 0, 1, 0])
    }
    return { client, sockets, reports, tick, connect }
  }
  it('waits for acknowledgments, receives QoS 0, and ignores retained reports', () => {
    const s = setup()
    s.tick()
    const f = s.sockets[0]
    f.socket.onopen?.()
    expect(s.client.status().state).toBe('connecting')
    f.receive([0x20, 2, 0, 0])
    expect(s.client.status().state).toBe('subscribing')
    f.receive([0x90, 3, 0, 1, 0])
    expect(s.client.status().state).toBe('live')
    f.receive(publication('test/x', '{}'))
    f.receive([0x31, ...publication('test/x', '{}').slice(1)])
    expect(s.reports).toEqual(['{}'])
  })
  it('unsubscribes before considering a changed subscription settled', () => {
    const s = setup()
    s.connect()
    s.tick(0, ['other/#'])
    expect(s.sockets[0].sent.slice(-2).map((p) => p[0])).toEqual([0xa2, 0x82])
    s.sockets[0].receive([0xb0, 2, 0, 2, 0x90, 3, 0, 3, 0])
    expect(s.client.status().state).toBe('live')
  })
  it('keeps alive without traffic, accepts PINGRESP, and times out a missing reply', () => {
    const s = setup()
    s.connect()
    s.tick(15_000)
    expect(s.sockets[0].sent[s.sockets[0].sent.length - 1]).toEqual([0xc0, 0])
    s.sockets[0].receive([0xd0, 0])
    s.tick(15_000)
    s.tick(15_000)
    expect(s.client.status()).toMatchObject({
      state: 'retrying',
      message: 'Feed heartbeat timed out',
    })
  })
  it('backs off on errors, does not reconnect in callbacks, and ignores late callbacks', () => {
    const s = setup()
    s.connect()
    const late = s.sockets[0].socket.onclose
    s.sockets[0].socket.onerror?.({ message: 'failed' })
    expect(s.sockets).toHaveLength(1)
    s.tick(4999)
    expect(s.sockets).toHaveLength(1)
    s.tick(1)
    expect(s.sockets).toHaveLength(2)
    late?.({ code: 1006, reason: '', wasClean: false })
    expect(s.client.status().state).toBe('connecting')
    s.sockets[1].socket.onerror?.({ message: 'failed' })
    s.tick(9999)
    expect(s.sockets).toHaveLength(2)
    s.tick(1)
    expect(s.sockets).toHaveLength(3)
  })
  it('times out handshakes and rejected subscriptions', () => {
    const s = setup()
    s.tick()
    s.tick(10_000)
    expect(s.client.status().state).toBe('retrying')
    s.tick(5000)
    s.sockets[1].socket.onopen?.()
    s.sockets[1].receive([0x20, 2, 0, 0])
    s.sockets[1].receive([0x90, 3, 0, 1, 128])
    expect(s.client.status().state).toBe('retrying')
  })
  it('closes on hidden-panel traffic, starts fresh on resume, and closes on stop', () => {
    const s = setup()
    s.connect()
    s.tick(31_000)
    expect(s.sockets[0].closed).toBe(1)
    expect(s.sockets).toHaveLength(2)
    s.client.stop()
    expect(s.sockets[1].closed).toBe(1)
    expect(s.sockets[1].socket.onmessage).toBeNull()
  })
})
