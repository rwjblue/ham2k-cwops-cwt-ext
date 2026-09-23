import { normalizeCall } from '../../../../packages/reception/src/callsign.ts'
import type {
  ReceptionDirection,
  ReceptionReport,
} from '../../../../packages/reception/src/reports.ts'
import { parsePskPayload } from './data/parser.ts'
import { createReportStore } from './data/store.ts'
import { pskTopic } from './data/subscriptions.ts'
import { type ConnectionState, createMqttClient } from './transport/client.ts'
import type { OpenSocket } from './transport/socket.ts'

export interface LiveSnapshot {
  reports: ReceptionReport[]
  capped: boolean
  state: ConnectionState | 'invalid' | 'limit' | 'offline'
  message: string
  retryAt?: number
}

/** One socket per extension; placements lease narrow subscriptions while rendering. */
export function createLiveReception(open: OpenSocket, now = Date.now, random = Math.random) {
  const leases = new Map<
    string,
    { call: string; direction: ReceptionDirection; topic: string; seen: number }
  >()
  const store = createReportStore()
  const prune = () => {
    for (const [id, lease] of leases) {
      if (now() - lease.seen > 30_000 || now() < lease.seen) leases.delete(id)
    }
  }
  const client = createMqttClient({
    open,
    now,
    random,
    onReport(topic, payload) {
      prune()
      const report = parsePskPayload(payload)
      if (!report) return
      const parts = topic.split('/')
      if (
        parts.length !== 11 ||
        parts.slice(0, 3).join('/') !== 'pskr/filter/v2' ||
        parts[3] !== report.band ||
        parts[4].toUpperCase() !== report.mode ||
        normalizeCall(parts[5]) !== report.transmitter.call ||
        normalizeCall(parts[6]) !== report.receiver.call
      )
        return
      if (
        [...leases.values()].some(
          (lease) =>
            (lease.direction === 'incoming' ? report.receiver.call : report.transmitter.call) ===
            lease.call,
        )
      )
        store.ingest(payload, now())
    },
  })
  return {
    snapshot(
      instance: string,
      call: string,
      direction: ReceptionDirection,
      windowMinutes: number,
      online: boolean,
    ): LiveSnapshot {
      prune()
      leases.delete(instance)
      const topic = pskTopic(call, direction)
      const topics = new Set([...leases.values()].map((lease) => lease.topic))
      let error: LiveSnapshot['state'] | undefined
      if (!online) error = 'offline'
      else if (!topic) error = 'invalid'
      else if (leases.size >= 32 || (!topics.has(topic) && topics.size >= 8)) error = 'limit'
      else leases.set(instance, { call: normalizeCall(call), direction, topic, seen: now() })
      if (!online) leases.clear()
      client.tick([...new Set([...leases.values()].map((lease) => lease.topic))])
      const stored = store.snapshot(now(), windowMinutes)
      // The map's filter is also pure, but do not hand another call's data to a placement.
      stored.reports = stored.reports.filter(
        (report) =>
          (direction === 'incoming' ? report.receiver.call : report.transmitter.call) ===
          normalizeCall(call),
      )
      if (error)
        return {
          ...stored,
          state: error,
          message:
            error === 'invalid'
              ? 'Set a callsign without a portable suffix to receive reports.'
              : error === 'limit'
                ? 'At most eight callsign/direction subscriptions can be active.'
                : 'Offline · reception paused',
        }
      return { ...stored, ...client.status() }
    },
    stop: () => {
      leases.clear()
      client.stop()
      store.clear()
    },
  }
}

export type LiveReception = ReturnType<typeof createLiveReception>
