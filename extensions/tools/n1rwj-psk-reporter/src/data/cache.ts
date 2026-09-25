import type { JSONValue } from '@ham2k/extension-sdk'
import type { PersistentStorage } from '../../../../../packages/reception/src/storage.ts'
import { parsePskPayload } from './parser.ts'
import type { createReportStore } from './store.ts'

export const reportCacheKey = 'psk-reports-v1'
const interval = 30_000
type Store = ReturnType<typeof createReportStore>

function encode(store: Store, now: number): string {
  const { reports, droppedAt } = store.checkpoint(now)
  return JSON.stringify({
    version: 1,
    droppedAt,
    reports: reports.map((report) => ({
      id: report.id,
      sc: report.transmitter.call,
      rc: report.receiver.call,
      sl: report.transmitter.location?.grid,
      rl: report.receiver.location?.grid,
      t: report.timeMs / 1000,
      f: report.frequencyHz,
      md: report.mode,
      b: report.band,
      rp: report.snrDb,
    })),
  })
}

function restore(value: JSONValue | null, store: Store, now: number) {
  if (value === null) return
  if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('Invalid cache')
  const saved = JSON.parse(value)
  if (saved?.version !== 1 || !Array.isArray(saved.reports) || saved.reports.length > 1000)
    throw new Error('Invalid cache')
  for (const raw of saved.reports) {
    const report = parsePskPayload(JSON.stringify(raw))
    if (report && typeof raw.id === 'string' && raw.id.length <= 256) {
      report.id = raw.id
      store.ingestReport(report, now)
    }
  }
  store.restoreCapacityLoss(saved.droppedAt, now)
}

/** Render-driven checkpoints; no timer or storage write per incoming report. */
export function createReportCache(storage: PersistentStorage, store: Store, now = Date.now) {
  let loaded = false
  let loading: Promise<void> | undefined
  let saving = false
  let stopped = false
  let savedRevision = 0
  let nextAttempt = 0
  let warning: string | undefined

  function ready(): Promise<void> {
    if (loaded || stopped || now() < nextAttempt) return Promise.resolve()
    loading ??= (async () => {
      const before = store.revision
      try {
        const value = await storage.read(reportCacheKey)
        if (stopped) return
        const unchanged = before === store.revision
        try {
          restore(value, store, now())
          if (unchanged && before === 0) savedRevision = store.revision
          warning = undefined
        } catch {
          // Corrupt/unknown snapshots are replaceable; unavailable storage is not.
          savedRevision = -1
          warning = 'Saved reports could not be restored.'
        }
        loaded = true
      } catch {
        warning = 'Report storage unavailable; reports are kept only for this session.'
        nextAttempt = now() + interval
      }
    })().finally(() => {
      loading = undefined
    })
    return loading
  }

  return {
    ready,
    get warning() {
      return warning
    },
    tick() {
      void ready().then(async () => {
        if (!loaded || stopped || saving || now() < nextAttempt || savedRevision === store.revision)
          return
        const value = encode(store, now())
        const revision = store.revision
        saving = true
        nextAttempt = now() + interval
        try {
          await storage.write(reportCacheKey, value)
          savedRevision = revision
          warning = undefined
        } catch {
          warning = 'Reports could not be saved; recent reports may be lost on restart.'
        } finally {
          saving = false
        }
      })
    },
    stop() {
      stopped = true
    },
  }
}
