import type { JSONValue } from '@ham2k/extension-sdk'
import { parseCallHistory } from '../history/index.ts'
import type { ParsedCallHistory } from '../history/types.ts'

export interface Snapshot {
  schema: 1
  body: string
  url: string
  fetchedAt: string
}
export interface LoadedFile {
  snapshot: Snapshot
  parsed: ParsedCallHistory
}
export interface Storage {
  read(): Promise<unknown>
  write(value: JSONValue): Promise<void>
}

export function checkedSnapshot(value: unknown): LoadedFile {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schema' in value) ||
    value.schema !== 1 ||
    !('body' in value) ||
    typeof value.body !== 'string' ||
    !('url' in value) ||
    typeof value.url !== 'string' ||
    !('fetchedAt' in value) ||
    typeof value.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.fetchedAt))
  ) {
    throw new Error('Invalid CWT cache format. Previous data retained.')
  }
  if (value.body.length > 5_000_000) throw new Error('CWT file exceeds the 5 MB limit.')
  if (/<(?:!doctype|html|body|script|form)\b/i.test(value.body)) {
    throw new Error('Invalid CWT file: received HTML instead of call-history text.')
  }
  const parsed = parseCallHistory(value.body)
  if (
    !parsed.usable ||
    parsed.issues.some((issue) => issue.code === 'invalid-row' || issue.code === 'invalid-exchange')
  ) {
    throw new Error(
      `Invalid CWT file: ${parsed.issues
        .filter(
          (issue) =>
            issue.severity === 'error' ||
            issue.code === 'invalid-row' ||
            issue.code === 'invalid-exchange',
        )
        .map((issue) => issue.message)
        .slice(0, 3)
        .join('; ')}`,
    )
  }
  return {
    snapshot: { schema: 1, body: value.body, url: value.url, fetchedAt: value.fetchedAt },
    parsed,
  }
}

/** Last-good runtime state. Production storage is volatile host KV; Ham2K's
 * dataFile manager persists successful snapshots and replays them at startup. */
export function createFileCache(storage: Storage) {
  let current: LoadedFile | undefined
  let error: string | undefined
  let generation = 0
  let ready: Promise<void> | undefined
  let mutations: Promise<void> = Promise.resolve()

  // Apply writes in invocation order. A failed operation still rejects its
  // caller, while the recovered tail allows the next queued change to run.
  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutations.then(operation)
    mutations = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    current: () => current,
    error: () => error,
    load(): Promise<void> {
      ready ??= (async () => {
        const before = generation
        try {
          const raw = await storage.read()
          if (raw !== null && raw !== undefined && generation === before && !current)
            current = checkedSnapshot(raw)
        } catch (cause) {
          if (generation === before) error = String(cause)
        }
      })()
      return ready
    },
    replace(snapshot: Snapshot): Promise<Snapshot> {
      const candidate = { ...snapshot }
      return mutate(async () => {
        try {
          const next = checkedSnapshot(candidate)
          await storage.write({ ...next.snapshot })
          generation++
          current = next
          error = undefined
          return next.snapshot
        } catch (cause) {
          error = String(cause)
          throw cause
        }
      })
    },
    accept(raw: unknown): void {
      try {
        const next = checkedSnapshot(raw)
        if (
          !current ||
          Date.parse(next.snapshot.fetchedAt) >= Date.parse(current.snapshot.fetchedAt)
        ) {
          generation++
          current = next
          error = undefined
        }
      } catch (cause) {
        error = String(cause)
      }
    },
    remove(): Promise<void> {
      return mutate(async () => {
        try {
          await storage.write(null)
          generation++
          current = undefined
          error = undefined
        } catch (cause) {
          error = String(cause)
          throw cause
        }
      })
    },
  }
}

export type FileCache = ReturnType<typeof createFileCache>
