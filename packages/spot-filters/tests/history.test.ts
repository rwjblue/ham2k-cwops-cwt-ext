import { expect, it } from 'vitest'
import { callLookupKeys } from '../../n1mm/src/callsign.ts'
import { matchHistoryCalls } from '../src/history.ts'

it('preserves normalized portable identities and rejects ambiguous or mismatched entries', () => {
  const records = Object.freeze({
    K1ABC: Object.freeze({ call: 'K1ABC' }),
    W9BAD: Object.freeze({ call: 'W9OTHER' }),
  })
  const calls = Object.freeze([
    ' k1abc ',
    'K1ABC',
    'k1abc/p',
    'EA8/K1ABC',
    'K1ABC/W2XYZ',
    'W9BAD',
    'W9NEW',
  ])
  expect(matchHistoryCalls(calls, records, callLookupKeys)).toEqual([
    'K1ABC',
    'K1ABC/P',
    'EA8/K1ABC',
  ])
  expect(matchHistoryCalls(calls, {}, callLookupKeys)).toEqual([])
})
