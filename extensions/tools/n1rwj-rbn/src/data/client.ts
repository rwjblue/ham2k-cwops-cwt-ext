import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import type { RbnSnapshot } from '../model.ts'
import { isValidCall, normalizeCall } from '../model.ts'
import type { RbnMetadata } from './parser.ts'
import { parseRbnMetadata, parseRbnPayload, record } from './parser.ts'

const endpoint = 'https://www.reversebeacon.net/spots.php'
const maxReports = 500
const maxEntries = 8
const maxResponseLength = 1_000_000
// A cold load runs metadata in parallel with at most two spot requests.
// Keep their combined network budget below the host's five-second panel deadline.
const requestTimeoutMs = 1200

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
  let metadata: Promise<RbnMetadata> | undefined
  let version: string | undefined

  async function getJson(url: string, allowVersionChallenge = false): Promise<unknown> {
    const response = await options.fetch(url, { timeout: requestTimeoutMs })
    const success = response.status >= 200 && response.status < 300
    if (!success && !(allowVersionChallenge && response.status === 400))
      throw new Error(`RBN request failed (${response.status}).`)
    if (response.body.length > maxResponseLength) throw new Error('RBN response was too large.')
    let data: unknown
    try {
      data = JSON.parse(response.body) as unknown
    } catch {
      throw new Error('RBN returned an unsupported data format.')
    }
    // RBN uses HTTP 400 for its normal website-version handshake.
    if (!success && record(data)?.error !== 888)
      throw new Error(`RBN request failed (${response.status}).`)
    return data
  }

  function getMetadata(): Promise<RbnMetadata> {
    if (!metadata) {
      metadata = getJson(`${endpoint}?meta=1`)
        .then(parseRbnMetadata)
        .catch((error: unknown) => {
          metadata = undefined
          throw error
        })
    }
    return metadata
  }

  async function getReports(query: RbnQuery): Promise<unknown> {
    const queryString = `cdx=${encodeURIComponent(query.call)}&ma=${query.windowMinutes * 60}&r=${maxReports}`
    const request = () =>
      getJson(
        `${endpoint}?${queryString}${version ? `&h=${encodeURIComponent(version)}` : ''}`,
        true,
      )
    let data = await request()
    const challenge = record(data)
    if (
      challenge?.error === 888 &&
      typeof challenge.ver_h === 'string' &&
      /^[a-z0-9]{1,64}$/i.test(challenge.ver_h)
    ) {
      version = challenge.ver_h
      // The site's version handshake is retried once, never in a loop.
      data = await request()
    }
    return data
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
        const [schema, payload] = await Promise.all([getMetadata(), getReports(normalized)])
        const result = parseRbnPayload(
          payload,
          schema,
          call,
          windowMinutes,
          requestNow(),
          maxReports,
        )
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
            error instanceof Error && error.message.startsWith('RBN ')
              ? error.message
              : 'Unable to refresh RBN. Check your connection.',
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
