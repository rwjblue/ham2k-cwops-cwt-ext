import { parseN1mm } from '../../../../../packages/n1mm/src/parse.ts'
import { isCwtContest, membershipForExchange, normalizeKnownExchange } from './exchange.ts'
import type { CallHistoryRecord, ParsedCallHistory } from './types.ts'

/** CWT alone interprets Exch1 as membership number, CWA, or explicit QTH. */
export function parseCallHistory(text: string): ParsedCallHistory {
  const { rows, issues, associations, sourceUpdatedAt } = parseN1mm(text)
  const records: Record<string, CallHistoryRecord> = Object.create(null) as Record<
    string,
    CallHistoryRecord
  >
  for (const { call, fields, line } of rows) {
    const name = fields.name?.trim() || undefined
    const rawNumber = fields.exch1?.trim()
    const number = normalizeKnownExchange(rawNumber)
    if (rawNumber && !number)
      issues.push({
        line,
        severity: 'warning',
        code: 'invalid-exchange',
        message:
          'Ignored invalid Exch1; membership remains unknown unless an earlier record supplies a valid exchange.',
      })
    const mergedName = name ?? records[call]?.name
    const mergedNumber = number ?? records[call]?.number
    records[call] = {
      call,
      ...(mergedName ? { name: mergedName } : {}),
      ...(mergedNumber ? { number: mergedNumber } : {}),
      membership: membershipForExchange(mergedNumber),
    }
  }
  if (associations.length && !associations.some(isCwtContest))
    issues.push({
      line: 0,
      severity: 'error',
      code: 'incompatible-contest',
      message: `File is associated with ${associations.join(', ')}, not CWT/CWOPS.`,
    })
  return {
    records,
    issues,
    associations,
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    usable: !issues.some((issue) => issue.severity === 'error'),
  }
}
