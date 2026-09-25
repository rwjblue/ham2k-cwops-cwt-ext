import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import type { PersistentStorage } from '../../../../../packages/reception/src/storage.ts'
import { backoffKey, readBackoff } from './cache.ts'
import { RbnRequestError } from './errors.ts'
import { record } from './parser.ts'

/** Share API throttling between My Signal and native Spots in this bundle. */
export function createRbnTransport(
  fetch: (url: string, options?: FetchOptions) => Promise<FetchResponse>,
  now: () => number = Date.now,
  storage?: PersistentStorage,
) {
  let blockedUntil = 0
  let restored: Promise<void> | undefined
  let restoreAfter = 0
  const pending = new Map<string, Promise<FetchResponse>>()
  return async (url: string, options?: FetchOptions): Promise<FetchResponse> => {
    if (storage && now() >= restoreAfter) {
      restored ??= storage
        .read(backoffKey)
        .then((value) => {
          blockedUntil = Math.max(blockedUntil, readBackoff(value, now()))
        })
        .catch(() => {
          restored = undefined
          restoreAfter = now() + 60_000
        })
      await restored
    }
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
      .then(async (response) => {
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
          try {
            await storage?.write(backoffKey, blockedUntil)
          } catch {
            // In-memory backoff remains effective if persistent storage fails.
          }
        }
        return response
      })
      .finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}
