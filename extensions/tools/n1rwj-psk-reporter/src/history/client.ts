import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import { normalizeCall } from '../../../../../packages/reception/src/callsign.ts'
import type {
  ReceptionDirection,
  ReceptionReport,
} from '../../../../../packages/reception/src/reports.ts'
import { pskTopic } from '../data/subscriptions.ts'
import type { PersistentStorage } from '../storage.ts'
import { historyLimit, parseHistoryXml } from './parser.ts'

export interface HistoryHost extends PersistentStorage {
  fetch: (url: string, options: FetchOptions) => Promise<FetchResponse>
}

export interface HistoryStatus {
  message: string
  warning?: string
}

interface Entry {
  call: string
  direction: ReceptionDirection
  window: number
  seen: number
  connected: boolean
  revision: number
  needed: boolean
  loading: boolean
  warning?: string
}

const cooldown = 5 * 60_000
const storageKey = 'psk-history-next-request-v1'

export function historyUrl(call: string, direction: ReceptionDirection, window: number): string {
  const field = direction === 'outgoing' ? 'senderCallsign' : 'receiverCallsign'
  return `https://retrieve.pskreporter.info/query?${field}=${encodeURIComponent(call)}&flowStartSeconds=-${window * 60}&rptlimit=${historyLimit}&rronly=1&noactive=1&nolocator=1`
}

/** One extension-wide queue. Visible render ticks drive automatic work; no timers. */
export function createHistoryClient(
  host: HistoryHost,
  ingest: (reports: ReceptionReport[]) => void,
  now = Date.now,
  watched: (call: string, direction: ReceptionDirection) => boolean = () => true,
) {
  const entries = new Map<string, Entry>()
  let nextRequest = 0
  let failures = 0
  let restored: Promise<void> | undefined
  let running: { entry: Entry; promise: Promise<void> } | undefined
  let online = true
  let generation = 0
  const keyFor = (call: string, direction: ReceptionDirection) =>
    `${direction}:${normalizeCall(call)}`
  const current = (entry: Entry) => entries.get(keyFor(entry.call, entry.direction)) === entry
  const active = (entry: Entry) =>
    current(entry) && now() - entry.seen <= 30_000 && watched(entry.call, entry.direction)

  async function restore() {
    restored ??= host.read(storageKey).then((value) => {
      if (typeof value === 'number' && Number.isFinite(value))
        nextRequest = Math.max(nextRequest, Math.min(value, now() + 60 * 60_000))
    })
    await restored
  }

  function request(entry: Entry, force: boolean): Promise<void> {
    if (running) {
      if (!force || running.entry === entry) return running.promise
      // A different panel's forced reload waits for the in-flight request.
      return running.promise.then(() => request(entry, true))
    }
    const epoch = generation
    const task = (async () => {
      try {
        await restore()
        if (epoch !== generation || !online || !active(entry)) return
        if (!force && now() < nextRequest) return
        const started = now()
        const revision = entry.revision
        const window = entry.window
        entry.loading = true
        nextRequest = started + cooldown
        // Save before sending, so a reload cannot reset the automatic budget.
        await host.write(storageKey, nextRequest)
        if (epoch !== generation || !online || !active(entry)) return
        const response = await host.fetch(historyUrl(entry.call, entry.direction, window), {
          timeout: 7000,
          headers: { Accept: 'application/xml, text/xml' },
        })
        if (epoch !== generation || !online || !active(entry)) return
        if (response.status !== 200)
          throw new Error(`History unavailable: HTTP ${response.status}.`)
        const parsed = parseHistoryXml(response.body)
        const reports = parsed.reports.filter(
          (report) =>
            (entry.direction === 'outgoing' ? report.transmitter.call : report.receiver.call) ===
              entry.call &&
            report.timeMs >= started - window * 60_000 &&
            report.timeMs <= now() + 60_000,
        )
        ingest(reports)
        failures = 0
        entry.needed = entry.revision !== revision
        entry.warning = parsed.incomplete
          ? 'History may be incomplete: the response limit was reached or some records were unsupported.'
          : undefined
      } catch (error) {
        if (epoch !== generation) return
        entry.needed = true
        entry.warning =
          error instanceof Error && error.message.startsWith('History unavailable:')
            ? error.message
            : 'History unavailable: request or cooldown storage failed.'
        nextRequest = Math.max(
          nextRequest,
          now() + Math.min(60 * 60_000, cooldown * 2 ** Math.min(failures++, 4)),
        )
        // Failed reads may recover later; never let storage failure create a request loop.
        restored = undefined
        try {
          await host.write(storageKey, nextRequest)
        } catch {
          /* In-memory backoff remains. */
        }
      } finally {
        entry.loading = false
        // Rotate attempted work so one failing callsign cannot starve another panel.
        if (current(entry)) {
          entries.delete(keyFor(entry.call, entry.direction))
          entries.set(keyFor(entry.call, entry.direction), entry)
        }
      }
    })()
    const promise = task.finally(() => {
      if (running?.promise === promise) running = undefined
    })
    running = { entry, promise }
    return promise
  }

  function observe(
    call: string,
    direction: ReceptionDirection,
    window: number,
    connected: boolean,
    isOnline: boolean,
  ): HistoryStatus {
    online = isOnline
    if (!pskTopic(call, direction)) return { message: '' }
    const time = now()
    const key = keyFor(call, direction)
    for (const [id, entry] of entries) if (time - entry.seen > 60 * 60_000) entries.delete(id)
    let entry = entries.get(key)
    const minutes = [15, 30, 60].includes(window) ? window : 15
    if (!entry) {
      entry = {
        call: normalizeCall(call),
        direction,
        window: minutes,
        seen: time,
        connected,
        revision: 0,
        needed: true,
        loading: false,
      }
      entries.set(key, entry)
      if (entries.size > 32) entries.delete(entries.keys().next().value as string)
    } else {
      if (
        time - entry.seen > 30_000 ||
        time < entry.seen ||
        entry.connected !== connected ||
        minutes > entry.window
      ) {
        entry.needed = true
        entry.revision++
      }
      entry.window = Math.max(entry.window, minutes)
      entry.seen = time
      entry.connected = connected
    }
    if (online && !running && time >= nextRequest) {
      const pending = [...entries.values()].find(
        (candidate) => candidate.needed && active(candidate),
      )
      if (pending) void request(pending, false)
    }
    const message =
      entry.loading || running?.entry === entry
        ? 'Loading recent reports'
        : entry.needed
          ? !online
            ? 'History paused while offline'
            : entry.warning
              ? 'History unavailable'
              : 'Collection gap · history queued'
          : entry.warning
            ? 'History may be incomplete'
            : 'Recent history loaded'
    return { message, warning: entry.warning }
  }

  return {
    observe,
    async force(call: string, direction: ReceptionDirection, window: number, isOnline: boolean) {
      online = isOnline
      if (!online || !pskTopic(call, direction)) return
      const entry = entries.get(keyFor(call, direction))
      if (!entry) return
      const minutes = [15, 30, 60].includes(window) ? window : 15
      if (minutes > entry.window) entry.revision++
      entry.window = Math.max(entry.window, minutes)
      entry.seen = now()
      entry.needed = true
      await request(entry, true)
    },
    stop() {
      generation++
      entries.clear()
      online = false
    },
  }
}
