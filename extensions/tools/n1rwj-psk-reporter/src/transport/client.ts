import { pskEndpoint, pskProtocols } from '../data/subscriptions.ts'
import {
  connectPacket,
  createMqttDecoder,
  disconnectPacket,
  pingPacket,
  subscriptionPacket,
} from './mqtt.ts'
import type { OpenSocket, ReceptionSocket } from './socket.ts'

export type ConnectionState = 'idle' | 'connecting' | 'subscribing' | 'live' | 'retrying'

/** One clean MQTT session. Only tick() may open/reopen; callbacks never retry. */
export function createMqttClient(options: {
  open: OpenSocket
  now: () => number
  random?: () => number
  onReport: (topic: string, payload: string) => void
}) {
  const random = options.random ?? Math.random
  let socket: ReceptionSocket | undefined
  let desired = new Set<string>()
  let subscribed = new Set<string>()
  const pending = new Map<number, { topic: string; remove: boolean; at: number }>()
  let sequence = 0
  let generation = 0
  let state: ConnectionState = 'idle'
  let message = ''
  let attempt = 0
  let retryAt = 0
  let openedAt = 0
  let lastTick: number | undefined
  let lastPing = 0
  let pingAt: number | undefined
  let connected = false
  let liveAt: number | undefined

  function close() {
    generation++
    const old = socket
    socket = undefined
    connected = false
    subscribed = new Set()
    pending.clear()
    pingAt = undefined
    liveAt = undefined
    if (!old) return
    old.onopen = old.onmessage = old.onerror = old.onclose = null
    try {
      if (old.readyState === 1) old.send(disconnectPacket)
    } catch {
      /* Closing must still happen after a failed send. */
    }
    try {
      old.close(1000, 'Reception session ended')
    } catch {
      /* Host owns final cleanup. */
    }
  }

  function fail(reason: string) {
    close()
    state = 'retrying'
    message = reason
    const delay = Math.min(60_000, 5_000 * 2 ** Math.min(attempt++, 4))
    retryAt = options.now() + delay + Math.floor(random() * delay * 0.2)
  }

  function send(bytes: Uint8Array) {
    if (socket?.readyState !== 1) throw new Error('Socket is not open')
    socket.send(bytes)
  }

  function reconcile() {
    if (!connected) return
    // Await previous ACKs before reversing an in-flight subscribe/unsubscribe.
    const busy = new Set([...pending.values()].map((item) => item.topic))
    for (const topic of new Set([...subscribed, ...desired])) {
      if (busy.has(topic) || subscribed.has(topic) === desired.has(topic)) continue
      sequence = (sequence % 65535) + 1
      const remove = !desired.has(topic)
      pending.set(sequence, { topic, remove, at: options.now() })
      send(subscriptionPacket(sequence, topic, remove))
    }
    state = pending.size ? 'subscribing' : 'live'
    if (state === 'live' && liveAt === undefined) liveAt = options.now()
  }

  function start() {
    close()
    const current = generation
    state = 'connecting'
    message = ''
    openedAt = options.now()
    lastPing = openedAt
    const decoder = createMqttDecoder()
    try {
      const opened = options.open(pskEndpoint, { protocols: [...pskProtocols] })
      socket = opened
      const guarded = (fn: () => void) => {
        if (generation !== current || socket !== opened) return
        // A hidden/removed last panel cannot keep consuming traffic indefinitely.
        if (lastTick !== undefined && options.now() - lastTick > 30_000) {
          close()
          state = 'idle'
          return
        }
        try {
          fn()
        } catch {
          fail('Feed protocol or connection error')
        }
      }
      opened.onopen = () =>
        guarded(() => {
          if (opened.protocol !== 'mqtt') throw new Error('MQTT subprotocol not negotiated')
          const id = `n1rwj${Math.floor(random() * 0xffffffff).toString(16)}${Math.floor(random() * 0xffffffff).toString(16)}`
          send(connectPacket(id))
        })
      opened.onmessage = (event) =>
        guarded(() => {
          if (typeof event.data === 'string') throw new Error('MQTT requires binary frames')
          for (const packet of decoder.feed(event.data)) {
            if (packet.kind === 'connack') {
              if (connected || packet.code !== 0) throw new Error('MQTT connection refused')
              connected = true
              reconcile()
            } else {
              if (!connected) throw new Error('MQTT connection not acknowledged')
              if (packet.kind === 'publish') {
                if (!packet.retained) options.onReport(packet.topic, packet.payload)
              } else if (packet.kind === 'pingresp') {
                pingAt = undefined
              } else {
                const request = pending.get(packet.id)
                if (
                  !request ||
                  request.remove !== (packet.kind === 'unsuback') ||
                  (packet.kind === 'suback' && packet.code !== 0)
                )
                  throw new Error('MQTT subscription refused or unexpected ACK')
                pending.delete(packet.id)
                if (request.remove) subscribed.delete(request.topic)
                else subscribed.add(request.topic)
                reconcile()
              }
            }
          }
        })
      opened.onerror = () => guarded(() => fail('Connection failed'))
      opened.onclose = () => guarded(() => fail('Connection closed'))
    } catch {
      fail('WebSocket unavailable or connection failed')
    }
  }

  return {
    tick(topics: readonly string[]) {
      const now = options.now()
      if (topics.length > 8) throw new Error('Too many reception subscriptions')
      desired = new Set(topics)
      const resumed = lastTick !== undefined && (now - lastTick > 30_000 || now < lastTick)
      lastTick = now
      if (!desired.size) {
        close()
        state = 'idle'
        return
      }
      if (resumed && socket) {
        close()
        state = 'idle'
      }
      if (!socket) {
        if (now >= retryAt) start()
        return
      }
      if (
        (!connected && now - openedAt >= 10_000) ||
        [...pending.values()].some((item) => now - item.at >= 10_000)
      ) {
        fail('Connection or subscription timed out')
        return
      }
      if (pingAt !== undefined && now - pingAt >= 15_000) {
        fail('Feed heartbeat timed out')
        return
      }
      try {
        reconcile()
        if (connected && pingAt === undefined && now - lastPing >= 15_000) {
          pingAt = lastPing = now
          send(pingPacket)
        }
        // Briefly successful connections must not reset a failure loop.
        if (liveAt !== undefined && now - liveAt >= 60_000) attempt = 0
      } catch {
        fail('Connection send failed')
      }
    },
    status() {
      return { state, message, retryAt }
    },
    stop() {
      desired.clear()
      close()
      state = 'idle'
    },
  }
}
