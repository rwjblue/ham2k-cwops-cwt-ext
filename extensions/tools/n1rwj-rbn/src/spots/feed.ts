// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MPL-2.0

import type { FetchOptions, FetchResponse, Spot } from '@ham2k/extension-sdk'
import { bands, maxAgeMs, parseReports, record } from './model.ts'

const endpoint = 'https://vailrerbn.com/api/v1/spots'
const pageSize = 1000
const maxPages = 2
const requestTimeoutMs = 2000
const refreshMs = 60_000

export interface FeedOptions {
  fetch(url: string, options?: FetchOptions): Promise<FetchResponse>
  source: string
  mode?: string
  now?: () => number
}

/** Bounded HTTPS snapshots fit the hook deadline; no sockets or background timers. */
export function createSpotFeed(options: FeedOptions) {
  const now = options.now ?? Date.now
  let cached: Spot[] = []
  let nextFetchAt = 0
  let failure: unknown
  let inFlight: Promise<Spot[]> | undefined

  async function fetchBand(band: string, at: number): Promise<Spot[]> {
    const reports: Spot[] = []
    const since = Math.floor((at - maxAgeMs) / 1000)
    const until = Math.floor(at / 1000)
    for (let page = 0; page < maxPages; page++) {
      const response = await options.fetch(
        `${endpoint}?mode=${options.mode ?? 'CW'}&band=${band}&since=${since}&until=${until}&limit=${pageSize}&offset=${page * pageSize}`,
        { timeout: requestTimeoutMs },
      )
      if (response.status === 429) {
        let retryAfter: unknown
        if (response.body.length <= 1_000_000) {
          try {
            retryAfter = record(record(JSON.parse(response.body)).error).retryAfter
          } catch {
            /* Use default backoff. */
          }
        }
        const delay =
          typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.max(refreshMs, retryAfter * 1000)
            : refreshMs
        nextFetchAt = Math.max(nextFetchAt, now() + delay)
        throw new Error('Vail ReRBN rate limit reached. Waiting before retrying.')
      }
      if (response.status < 200 || response.status >= 300)
        throw new Error(`Vail ReRBN request failed (${response.status}).`)
      if (response.body.length > 1_000_000) throw new Error('Vail ReRBN response was too large.')
      const payload = record(JSON.parse(response.body))
      if (!Array.isArray(payload.spots))
        throw new Error('Vail ReRBN returned an unsupported data format.')
      if (payload.spots.length > pageSize)
        throw new Error('Vail ReRBN exceeded the requested report limit.')
      reports.push(
        ...parseReports(payload.spots, options.source, at).filter(
          (spot) => spot.band === band && spot.mode === (options.mode ?? 'CW'),
        ),
      )
      if (
        payload.spots.length < pageSize ||
        (typeof payload.total === 'number' && payload.total <= (page + 1) * pageSize)
      )
        break
    }
    return reports
  }

  return {
    get(online: boolean): Promise<Spot[]> {
      if (!online) return Promise.resolve(cached)
      if (inFlight) return inFlight
      if (now() < nextFetchAt) return failure ? Promise.reject(failure) : Promise.resolve(cached)
      const at = now()
      // Settle every band before allowing another refresh, including after errors.
      inFlight = Promise.allSettled(bands.map((band) => fetchBand(band.name, at)))
        .then((results) => {
          const rejected = results.find((result) => result.status === 'rejected')
          if (rejected?.status === 'rejected') throw rejected.reason
          cached = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
          failure = undefined
          return cached
        })
        .catch((error: unknown) => {
          failure = error
          throw error
        })
        .finally(() => {
          nextFetchAt = Math.max(nextFetchAt, now() + refreshMs)
          inFlight = undefined
        })
      return inFlight
    },
  }
}
