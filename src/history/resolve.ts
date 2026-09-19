import { callLookupKeys, normalizeCall } from './callsign'
import { isCwtContest, membershipForExchange, normalizeKnownExchange } from './exchange'
import type {
  CallHistoryRecord,
  CwtHistoryContact,
  ExchangeSource,
  ResolveCwtExchangeInput,
  ResolvedCwtExchange,
  ResolvedField,
} from './types'

type ExchangeRecord = Pick<CallHistoryRecord, 'call' | 'name' | 'number'>

function historyCandidates(
  history: readonly CwtHistoryContact[],
  keys: readonly string[],
): CwtHistoryContact[] {
  return history
    .filter(
      (contact) => isCwtContest(contact.contest) && keys.includes(normalizeCall(contact.call)),
    )
    .map((contact, index) => ({ contact, index }))
    .sort((a, b) => {
      const match =
        keys.indexOf(normalizeCall(a.contact.call)) - keys.indexOf(normalizeCall(b.contact.call))
      if (match !== 0) return match
      const aTime = Number.isFinite(a.contact.timestamp) ? (a.contact.timestamp ?? 0) : -Infinity
      const bTime = Number.isFinite(b.contact.timestamp) ? (b.contact.timestamp ?? 0) : -Infinity
      return bTime - aTime || 0 || a.index - b.index
    })
    .map(({ contact }) => contact)
}

function resolveField(
  field: 'name' | 'number',
  records: readonly ExchangeRecord[],
  source: ExchangeSource,
  call: string,
): ResolvedField | undefined {
  for (const record of records) {
    const value = field === 'number' ? normalizeKnownExchange(record.number) : record.name?.trim()
    if (!value) continue
    const matchedCall = normalizeCall(record.call)
    // A member number/CWA identifies the operator, while a nonmember's QTH
    // can change with a portable prefix or suffix. Never transfer that QTH.
    if (
      field === 'number' &&
      matchedCall !== call &&
      membershipForExchange(value) === 'nonmember'
    ) {
      continue
    }
    return { value, source, matchedCall, match: matchedCall === call ? 'exact' : 'base' }
  }
  return undefined
}

/** Each field independently follows operator > current operation > file > older CWT. */
export function resolveCwtExchange(input: ResolveCwtExchangeInput): ResolvedCwtExchange {
  const call = normalizeCall(input.call)
  const result: ResolvedCwtExchange = { call, membership: 'unknown' }
  const keys = callLookupKeys(call)
  if (keys.length === 0) return result

  const sources: [ExchangeSource, readonly ExchangeRecord[]][] = [
    ['current-operation', historyCandidates(input.currentOperation ?? [], keys)],
    [
      'selected-file',
      keys.flatMap((key) => {
        const record = input.selectedFile?.[key]
        return record ? [record] : []
      }),
    ],
    ['older-history', historyCandidates(input.olderHistory ?? [], keys)],
  ]
  for (const field of ['name', 'number'] as const) {
    const operator = input.operator
    if (operator && normalizeCall(operator.call) === call && operator[field] !== undefined) {
      result[field] = {
        value: operator[field] ?? '',
        source: 'operator',
        matchedCall: call,
        match: 'exact',
      }
      continue
    }
    for (const [source, records] of sources) {
      const resolved = resolveField(field, records, source, call)
      if (resolved) {
        result[field] = resolved
        break
      }
    }
  }
  result.membership = membershipForExchange(result.number?.value)
  return result
}
