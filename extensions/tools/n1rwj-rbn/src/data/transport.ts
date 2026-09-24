import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import { RbnRequestError } from './errors.ts'
import { record } from './parser.ts'

/** Share API throttling between My Signal and native Spots in this bundle. */
export function createRbnTransport(
  fetch: (url: string, options?: FetchOptions) => Promise<FetchResponse>,
  now: () => number = Date.now,
) {
  let blockedUntil = 0
  const pending = new Map<string, Promise<FetchResponse>>()
  return (url: string, options?: FetchOptions): Promise<FetchResponse> => {
    if (now() < blockedUntil)
      return Promise.reject(
        new RbnRequestError(
          'rate-limit',
          'Vail ReRBN rate limit (HTTP 429) from another RBN request. Waiting before retrying.',
          { retryAtMs: blockedUntil, requestSent: false },
        ),
      )
    const key = `${url}:${options?.timeout ?? ''}`
    const current = pending.get(key)
    if (current) return current
    const request = fetch(url, options)
      .then((response) => {
        if (response.status === 429) {
          let delay = 60_000
          try {
            if (response.body.length <= 1_000_000) {
              const retry = record(record(JSON.parse(response.body))?.error)?.retryAfter
              if (typeof retry === 'number' && Number.isFinite(retry) && retry > 0)
                delay = Math.max(delay, retry * 1000)
            }
          } catch {
            /* Default backoff. */
          }
          blockedUntil = Math.max(blockedUntil, now() + delay)
        }
        return response
      })
      .finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}
