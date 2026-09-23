// Copyright (c) 2026 Robert Jackson (N1RWJ)
// SPDX-License-Identifier: MIT
// Shared operation-membership adapter, originally contributed to Ham2K CWT.
import type { HookContext, JSONValue, ScoreQsosRequest } from '@ham2k/extension-sdk'
import { callLookupKeys, normalizeCall } from '../../n1mm/src/callsign.ts'

type Qson = Record<string, JSONValue>
function object(value: JSONValue | undefined): Qson {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function text(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}
function refOf(qso: Qson, type: string): Qson | undefined {
  return Array.isArray(qso.refs) ? qso.refs.map(object).find((ref) => ref.type === type) : undefined
}

interface Index {
  rows: Map<string, Qson>
  operationIdentity?: string
  loading?: Promise<void>
  generation: number
  validations: Map<string, Promise<Qson[] | undefined>>
}

function operationIdentity(operation: Qson): string | undefined {
  const createdAt = operation.createdAtMillis
  const station = normalizeCall(text(operation.stationCall))
  return typeof createdAt === 'number' && Number.isFinite(createdAt) && station
    ? JSON.stringify([createdAt, station])
    : undefined
}

function rowsById(rows: Qson[]): Map<string, Qson> {
  const result = new Map<string, Qson>()
  for (const row of rows) {
    const uuid = text(row.uuid)
    if (uuid) result.set(uuid, row)
  }
  return result
}

/** Scoring supplies operation membership. Targeted history supplies fresh
 * exchanges; initial and bounded omitted-row reads cover missing snapshots. */
export function createHistoryAdapter<T>({
  refType,
  toContact,
}: {
  refType: string
  toContact: (qso: Qson) => T | undefined
}) {
  const contestRef = (qso: Qson) => refOf(qso, refType)
  const operations = new Map<string, Index>()
  function operationUuid(operation: Qson): string {
    const uuid = text(operation.uuid)
    if (uuid) return uuid
    // Native lookup/loggingControls pass operation.data without its row UUID.
    // Scoring's qsonPayloadFor adds the UUID, so recover it only when exactly
    // one indexed operation shares the immutable creation stamp and station.
    const identity = operationIdentity(operation)
    if (!identity) return ''
    const matching = [...operations.entries()].filter(
      ([, index]) => index.operationIdentity === identity,
    )
    return matching.length === 1 ? (matching[0]?.[0] ?? '') : ''
  }
  function entry(uuid: string): Index {
    let index = operations.get(uuid)
    if (!index) {
      const oldest = operations.keys().next().value
      if (operations.size >= 4 && oldest !== undefined) operations.delete(oldest)
      index = { rows: new Map(), generation: 0, validations: new Map() }
      operations.set(uuid, index)
    }
    return index
  }
  return {
    update({
      operation,
      qsos,
      resumeFrom,
    }: Pick<ScoreQsosRequest, 'operation' | 'qsos' | 'resumeFrom'>) {
      const uuid = text(operation.uuid)
      if (!uuid) return
      const index = entry(uuid)
      index.operationIdentity = operationIdentity(operation)
      index.generation++
      index.validations.clear()
      if (resumeFrom !== undefined) {
        // A resumed scorer receives only a tail; it cannot tell us which
        // earlier rows were edited/deleted. Invalidate once, not per call.
        index.loading = undefined
      } else {
        index.rows = rowsById(qsos)
        index.loading = Promise.resolve()
      }
    },
    async find(operation: Qson, qso: Qson, ctx: HookContext) {
      const call = text(object(qso.their).call)
      const keys = callLookupKeys(call)
      if (!keys.length || !contestRef(operation)) return { currentOperation: [], olderHistory: [] }
      const opId = operationUuid(operation)
      const index: Index = opId
        ? entry(opId)
        : { rows: new Map(), generation: 0, validations: new Map() }
      let generation: number
      do {
        generation = index.generation
        if (!index.loading) {
          const before = generation
          index.loading = (async () => {
            try {
              const rows = opId && ctx.getQsos ? await ctx.getQsos(opId) : null
              if (index.generation === before) index.rows = rowsById(rows ?? [])
            } catch {
              /* History is optional; file suggestions remain usable. */
            }
          })()
        }
        await index.loading
        // Resumed scoring may invalidate membership while a read is pending.
        // Wait for the new generation's shared read before classifying rows.
      } while (index.generation !== generation)
      const relevant = (row: Qson) => row.uuid !== qso.uuid || !qso.uuid
      const getHistory = ctx.getHistoryForCall
      const responses = getHistory
        ? await Promise.all(
            keys.map(async (key) => {
              try {
                // Filter before the host's result cap so other activities
                // cannot crowd out this contest's older exchanges. Keep
                // toContact's checks for older hosts that ignore options.
                return { rows: await getHistory(key, { refType }), ok: true }
              } catch {
                return { rows: [], ok: false }
              }
            }),
          )
        : []
      const allHistory = responses.flatMap((response) => response.rows)
      if (index.generation !== generation) return { currentOperation: [], olderHistory: [] }
      const convert = (rows: Qson[]) =>
        rows.map(toContact).filter((row): row is T => row !== undefined)
      const matches = (row: Qson) =>
        toContact(row) !== undefined && keys.includes(normalizeCall(text(object(row.their).call)))
      const targetedIds = new Set(allHistory.map((row) => text(row.uuid)).filter(Boolean))
      const missingCurrent = [...index.rows.values()].some(
        (row) => matches(row) && !targetedIds.has(text(row.uuid)),
      )
      let validated: Qson[] | undefined
      if (
        missingCurrent &&
        responses.every((response) => response.ok) &&
        getHistory &&
        ctx.getQsos &&
        opId
      ) {
        // The host caps targeted history. Revalidate an omitted current contact
        // with one full read, shared by this call + history signature + scoring
        // generation. Keep only matching rows so this bounded cache stays small.
        const signature = JSON.stringify([
          keys,
          allHistory.map((row) => [
            row.uuid,
            row.updatedAtMillis,
            row.startAtMillis,
            object(row.their).call,
            contestRef(row),
          ]),
        ])
        let validation = index.validations.get(signature)
        if (!validation) {
          const getQsos = ctx.getQsos
          validation = (async () => {
            try {
              const rows = await getQsos(opId)
              return rows && index.generation === generation ? rows.filter(matches) : undefined
            } catch {
              return undefined
            }
          })()
          if (index.validations.size >= 16) {
            const oldest = index.validations.keys().next().value
            if (oldest !== undefined) index.validations.delete(oldest)
          }
          index.validations.set(signature, validation)
        }
        validated = await validation
        if (index.generation !== generation) return { currentOperation: [], olderHistory: [] }
      }
      // Targeted rows are fresh; cached exchanges are used only when the host
      // has no targeted API, or after the bounded full-read validation above.
      const currentRows =
        validated ??
        (getHistory
          ? allHistory.filter((row) => index.rows.has(text(row.uuid)))
          : [...index.rows.values()])
      // A current row disappearing during the full read was deleted; its
      // earlier targeted result must not be reclassified as older history.
      const currentIds = new Set(index.rows.keys())
      for (const row of validated ?? []) currentIds.add(text(row.uuid))
      return {
        currentOperation: convert(currentRows.filter(relevant)),
        olderHistory: convert(
          allHistory.filter((row) => relevant(row) && !currentIds.has(text(row.uuid))),
        ),
      }
    },
  }
}
