import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import type { RbnSnapshot } from '../model.ts'
import { isValidCall, normalizeCall } from '../model.ts'
import { parseRbnPayload, record } from './parser.ts'

const endpoint = 'https://vailrerbn.com/api/v1/spots'
const maxReports = 500
const maxEntries = 8
const maxResponseLength = 1_000_000
// One bounded snapshot request leaves time to render within the host's five-second deadline.
const requestTimeoutMs = 3000
const rateLimitMessage = 'Vail ReRBN rate limit reached. Waiting before retrying.'

export interface RbnQuery {
  call: string
  windowMinutes: number
}

export interface RbnClientOptions {
  fetch: (url: string, options?: FetchOptions) => Promise<FetchResponse>
  now?: () => number
  refreshIntervalMs?: number
}

export interface RbnClient {
  getSnapshot(
    query: RbnQuery,
    options?: { force?: boolean; online?: boolean; realNowMillis?: number },
  ): Promise<RbnSnapshot>
}

interface Entry {
  snapshot: RbnSnapshot
  inFlight?: Promise<RbnSnapshot>
}

export function createRbnClient(options: RbnClientOptions): RbnClient {
  const now = options.now ?? Date.now
  const refreshIntervalMs = Math.max(30_000, options.refreshIntervalMs ?? 60_000)
  const cache = new Map<string, Entry>()
  let rateLimitedUntil = 0

  async function getJson(url: string, requestNow: () => number): Promise<unknown> {
    const response = await options.fetch(url, { timeout: requestTimeoutMs })
    if (response.status === 429) {
      let retryAfter: unknown
      // The host does not expose Retry-After headers; Vail documents this JSON field.
      if (response.body.length <= maxResponseLength) {
        try {
          retryAfter = record(record(JSON.parse(response.body))?.error)?.retryAfter
        } catch {
          // Non-JSON rate-limit responses still pause every panel using this client.
        }
      }
      const delay =
        typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.max(30_000, retryAfter * 1000)
          : 60_000
      // Supplied panel clocks are frozen at render start. Allow the whole request
      // budget so the response's retryAfter period cannot expire early.
      rateLimitedUntil = Math.max(rateLimitedUntil, requestNow() + requestTimeoutMs + delay)
      throw new Error(rateLimitMessage)
    }
    const success = response.status >= 200 && response.status < 300
    if (!success) throw new Error(`Vail ReRBN request failed (${response.status}).`)
    if (response.body.length > maxResponseLength)
      throw new Error('Vail ReRBN response was too large.')
    try {
      return JSON.parse(response.body) as unknown
    } catch {
      throw new Error('Vail ReRBN returned an unsupported data format.')
    }
  }

  function getReports(query: RbnQuery, requestNow: () => number): Promise<unknown> {
    const since = Math.floor(requestNow() / 1000) - query.windowMinutes * 60
    // Vail's call search is partial; the parser enforces an exact callsign match.
    // Fetch a fresh, bounded window across modes instead of accumulating a stream.
    return getJson(
      `${endpoint}?call=${encodeURIComponent(query.call)}&since=${since}&limit=${maxReports}`,
      requestNow,
    )
  }

  function clip(snapshot: RbnSnapshot, at: number): RbnSnapshot {
    const reports = snapshot.reports.filter(
      (report) => report.timeMs >= at - snapshot.windowMinutes * 60_000,
    )
    return {
      ...snapshot,
      reports,
      status:
        snapshot.status === 'ready' || snapshot.status === 'empty'
          ? reports.length
            ? 'ready'
            : 'empty'
          : snapshot.status,
    }
  }

  function pruneCache(): void {
    for (const [key, entry] of cache) {
      if (cache.size <= maxEntries) break
      if (!entry.inFlight) cache.delete(key)
    }
  }

  async function getSnapshot(
    query: RbnQuery,
    requestOptions: { force?: boolean; online?: boolean; realNowMillis?: number } = {},
  ): Promise<RbnSnapshot> {
    // SDK panel clocks supply real epoch milliseconds independently of developer
    // time travel. Older hosts omit this field, so retain the injected fallback.
    const suppliedTime = requestOptions.realNowMillis
    const requestNow =
      typeof suppliedTime === 'number' && Number.isFinite(suppliedTime) ? () => suppliedTime : now
    const call = normalizeCall(query.call)
    const windowMinutes = Number.isFinite(query.windowMinutes)
      ? Math.min(120, Math.max(5, Math.round(query.windowMinutes)))
      : 30
    const normalized = { call, windowMinutes }
    const time = requestNow()
    const initial: RbnSnapshot = {
      ...normalized,
      reports: [],
      status: 'error',
      lastAttemptMs: null,
      lastSuccessMs: null,
      error: null,
      capped: false,
    }
    if (!isValidCall(call))
      return { ...initial, error: 'Set a valid station callsign to see RBN reports.' }
    const key = `${call}|${windowMinutes}`
    let entry = cache.get(key)
    if (requestOptions.online === false) {
      const previous = entry?.snapshot ?? initial
      return clip(
        {
          ...previous,
          status: previous.lastSuccessMs === null ? 'error' : 'stale',
          error: 'RBN is offline. Cached reports are shown when available.',
        },
        requestNow(),
      )
    }
    if (time < rateLimitedUntil) {
      const previous = entry?.snapshot ?? initial
      return clip(
        {
          ...previous,
          status: previous.lastSuccessMs === null ? 'error' : 'stale',
          error: rateLimitMessage,
        },
        requestNow(),
      )
    }
    if (entry) {
      cache.delete(key)
      cache.set(key, entry)
      if (entry.inFlight) return entry.inFlight.then((snapshot) => clip(snapshot, requestNow()))
      const cooldown = requestOptions.force ? 30_000 : refreshIntervalMs
      if (entry.snapshot.lastAttemptMs !== null && time - entry.snapshot.lastAttemptMs < cooldown) {
        return clip(entry.snapshot, requestNow())
      }
    } else {
      // Concurrent calls for many different queries cannot grow this cache indefinitely.
      pruneCache()
      if (
        cache.size >= maxEntries &&
        [...cache.values()].every((candidate) => candidate.inFlight)
      ) {
        return { ...initial, error: 'RBN is refreshing other station views. Try again shortly.' }
      }
      entry = { snapshot: initial }
      cache.set(key, entry)
      pruneCache()
    }
    const current = entry
    current.inFlight = (async () => {
      try {
        const payload = await getReports(normalized, requestNow)
        const result = parseRbnPayload(payload, call, windowMinutes, requestNow(), maxReports)
        current.snapshot = {
          ...normalized,
          ...result,
          status: result.reports.length ? 'ready' : 'empty',
          lastAttemptMs: time,
          lastSuccessMs: requestNow(),
          error: null,
        }
      } catch (error) {
        current.snapshot = {
          ...current.snapshot,
          status: current.snapshot.lastSuccessMs === null ? 'error' : 'stale',
          lastAttemptMs: time,
          error:
            error instanceof Error && error.message.startsWith('Vail ReRBN ')
              ? error.message
              : 'Unable to refresh Vail ReRBN. Check your connection.',
        }
      } finally {
        current.inFlight = undefined
        pruneCache()
      }
      return clip(current.snapshot, requestNow())
    })()
    return current.inFlight
  }

  return { getSnapshot }
}
