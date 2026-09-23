import { expect, it } from 'vitest'
import { callLookupKeys } from '../../n1mm/src/callsign.ts'
import {
  createHistoryCallFilter,
  maxFilterCalls,
  readDescriptor,
  readMatches,
} from '../src/index.ts'

const ctx = { online: false }
it('matches file entries without depending on contest exchange fields', async () => {
  for (const record of [
    { call: 'K1ABC', number: '123' },
    { call: 'K1ABC', serial: '123' },
    { call: 'K1ABC', location: 'MA' },
    { call: 'K1ABC' },
  ]) {
    const hook = createHistoryCallFilter({
      label: () => 'History',
      unavailableReason: () => 'Load file',
      records: async () => ({ K1ABC: record }),
      lookupKeys: callLookupKeys,
    })
    expect(
      await hook.matchCalls(
        { version: 1, calls: ['k1abc', 'K1ABC/P', 'EA8/K1ABC', 'W9NEW', 'K1ABC/W2XYZ'] },
        ctx,
      ),
    ).toEqual({ version: 1, available: true, calls: ['K1ABC', 'K1ABC/P', 'EA8/K1ABC'] })
  }
})
it('distinguishes missing and empty files and sees removal without cached matches', async () => {
  let records: Record<string, { call: string }> | undefined = { K1ABC: { call: 'K1ABC' } }
  const hook = createHistoryCallFilter({
    label: () => 'History',
    unavailableReason: () => 'Load file',
    records: async () => records,
    lookupKeys: callLookupKeys,
    defaultSelected: async () => true,
  })
  expect(await hook.describe({}, ctx)).toMatchObject({
    version: 1,
    available: true,
    defaultSelected: true,
  })
  records = {}
  expect(await hook.matchCalls({ version: 1, calls: ['K1ABC'] }, ctx)).toEqual({
    version: 1,
    available: true,
    calls: [],
  })
  records = undefined
  expect(await hook.describe({}, ctx)).toMatchObject({ available: false, reason: 'Load file' })
  expect(await hook.matchCalls({ version: 1, calls: ['K1ABC'] }, ctx)).toMatchObject({
    available: false,
    calls: [],
  })
})
it('rejects incompatible or oversized batches and results outside the requested calls', async () => {
  const hook = createHistoryCallFilter({
    label: () => 'History',
    unavailableReason: () => 'Load file',
    records: async () => ({}),
    lookupKeys: callLookupKeys,
  })
  await expect(
    hook.matchCalls({ version: 1, calls: Array(maxFilterCalls + 1).fill('K1ABC') }, ctx),
  ).rejects.toThrow()
  expect(readDescriptor({ version: 2, label: 'Future' })).toBeUndefined()
  expect(readMatches({ version: 1, available: true, calls: ['W9NEW'] }, ['K1ABC'])).toBeUndefined()
  expect(readMatches({ version: 1, available: false, calls: ['K1ABC'] }, ['K1ABC'])).toBeUndefined()
  expect(readMatches({ version: 1, available: true, calls: ['K1ABC'] }, ['K1ABC'])?.calls).toEqual([
    'K1ABC',
  ])
})
