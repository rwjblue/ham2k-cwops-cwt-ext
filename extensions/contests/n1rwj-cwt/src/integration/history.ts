import type { JSONValue } from '@ham2k/extension-sdk'
import { createHistoryAdapter as createAdapter } from '../../../../../packages/contest-history/src/index.ts'
import type { CwtHistoryContact } from '../history/types.ts'

type Qson = Record<string, JSONValue>
export function object(value: JSONValue | undefined): Qson {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
export function text(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}
export function cwtRef(qso: Qson): Qson | undefined {
  return Array.isArray(qso.refs)
    ? qso.refs.map(object).find((ref) => ref.type === 'cwt')
    : undefined
}

export function contact(qso: Qson): CwtHistoryContact | undefined {
  const ref = cwtRef(qso)
  if (!ref || qso.deleted || qso.band === 'event') return undefined
  const their = object(qso.their)
  const call = text(their.call)
  if (!call) return undefined
  return {
    call,
    contest: 'CWT',
    name: typeof ref.name === 'string' ? ref.name : undefined,
    number: typeof ref.number === 'string' ? ref.number : undefined,
    timestamp: typeof qso.startAtMillis === 'number' ? qso.startAtMillis : undefined,
  }
}

export function createHistoryAdapter() {
  return createAdapter({ refType: 'cwt', toContact: contact })
}
