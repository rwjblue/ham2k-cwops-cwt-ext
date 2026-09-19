import { describe, expect, it } from 'vitest'
import type { CwtHistoryContact } from '../../src/history'
import { baseCall, callLookupKeys, parseCallHistory, resolveCwtExchange } from '../../src/history'

function contact(fields: Partial<CwtHistoryContact> = {}): CwtHistoryContact {
  return {
    call: 'K1ABC',
    contest: 'CWOPS',
    name: 'History',
    number: '123',
    timestamp: 100,
    ...fields,
  }
}

function file(text = 'K1ABC,File,456') {
  return parseCallHistory(`!!Order!!,Call,Name,Exch1\n${text}`).records
}

describe('field-aware CWT exchange resolution', () => {
  it('uses operator > current operation > selected file > older compatible history independently', () => {
    const result = resolveCwtExchange({
      call: 'K1ABC',
      operator: { call: 'k1abc', name: 'Correction' },
      currentOperation: [contact({ name: 'Current', number: undefined })],
      selectedFile: file(),
      olderHistory: [contact({ name: 'Older', number: '789' })],
    })
    expect(result.name).toMatchObject({ value: 'Correction', source: 'operator' })
    expect(result.number).toMatchObject({ value: '456', source: 'selected-file' })
    expect(result.membership).toBe('member')
  })

  it('retains an operator clearing through delayed lookup arrival', () => {
    for (const selectedFile of [undefined, file()]) {
      const result = resolveCwtExchange({
        call: 'K1ABC',
        operator: { call: 'K1ABC', name: '', number: null },
        selectedFile,
      })
      expect(result.name).toMatchObject({ value: '', source: 'operator' })
      expect(result.number).toMatchObject({ value: '', source: 'operator' })
      expect(result.membership).toBe('unknown')
    }
  })

  it('does not carry an edit or clearing to a different call', () => {
    const result = resolveCwtExchange({
      call: 'W1XYZ',
      operator: { call: 'K1ABC', name: 'Wrong', number: '' },
      selectedFile: file('W1XYZ,Lee,CWA'),
    })
    expect(result.name?.value).toBe('Lee')
    expect(result.number?.value).toBe('CWA')
  })

  it('fills missing current-operation fields from file and then older history', () => {
    const result = resolveCwtExchange({
      call: 'K1ABC',
      currentOperation: [contact({ number: '' })],
      selectedFile: file('K1ABC,File,'),
      olderHistory: [contact({ number: 'CWA' })],
    })
    expect(result.name).toMatchObject({ value: 'History', source: 'current-operation' })
    expect(result.number).toMatchObject({ value: 'CWA', source: 'older-history' })
    expect(result.membership).toBe('cwa')
  })

  it('uses newest compatible contact for each available field without relying on input order', () => {
    const olderHistory = [
      contact({ name: 'Old', number: 'MA', timestamp: 100 }),
      contact({ name: 'New', number: '', timestamp: 300 }),
      contact({ name: '', number: '987', timestamp: 200 }),
    ]
    for (const history of [olderHistory, [...olderHistory].reverse()]) {
      const result = resolveCwtExchange({ call: 'K1ABC', olderHistory: history })
      expect(result.name?.value).toBe('New')
      expect(result.number?.value).toBe('987')
    }
  })

  it('rejects unrelated, unmarked and other-call history even with plausible exchange values', () => {
    const result = resolveCwtExchange({
      call: 'K1ABC',
      olderHistory: [
        contact({ contest: 'NAQPCW' }),
        contact({ contest: '' }),
        contact({ contest: 'CWOPEN' }),
        contact({ call: 'K2XYZ' }),
      ],
    })
    expect(result).toEqual({ call: 'K1ABC', membership: 'unknown' })
  })

  it('never infers nonmembership from a missing record or a file record without Exch1', () => {
    for (const selectedFile of [file('W1XYZ,Lee,NY'), file('K1ABC,Pat,')]) {
      const result = resolveCwtExchange({ call: 'K1ABC', selectedFile })
      expect(result.number).toBeUndefined()
      expect(result.membership).toBe('unknown')
    }
  })

  it.each([
    ['123', 'member'],
    ['CA', 'nonmember'],
    ['9A', 'nonmember'],
    ['CWA', 'cwa'],
  ])('accepts explicitly supplied %s as %s', (number, membership) => {
    const result = resolveCwtExchange({ call: 'K1ABC', selectedFile: file(`K1ABC,Pat,${number}`) })
    expect(result.number?.value).toBe(number)
    expect(result.membership).toBe(membership)
  })

  it('prefers exact portable entries over base entries, field by field', () => {
    const result = resolveCwtExchange({
      call: 'N0AC/M',
      selectedFile: file('N0AC,Bill,1252\nN0AC/M,,IA'),
    })
    expect(result.name).toMatchObject({ value: 'Bill', match: 'base' })
    expect(result.number).toMatchObject({ value: 'IA', matchedCall: 'N0AC/M', match: 'exact' })
  })

  it('prefers exact history matches over newer base matches within a source', () => {
    const result = resolveCwtExchange({
      call: 'K1ABC/P',
      olderHistory: [
        contact({ name: 'Base', timestamp: 300 }),
        contact({ call: 'K1ABC/P', name: 'Portable', timestamp: 100 }),
      ],
    })
    expect(result.name?.value).toBe('Portable')
  })

  it('does not transfer a base-call nonmember location to a portable call', () => {
    for (const call of ['VE3/K1ABC', 'K1ABC/M', 'K1ABC/P']) {
      const result = resolveCwtExchange({
        call,
        selectedFile: file('K1ABC,Pat,CA'),
        currentOperation: [contact({ number: 'TX' })],
        olderHistory: [contact({ number: 'MA' })],
      })
      expect(result.name?.value).toBe('History')
      expect(result.number).toBeUndefined()
      expect(result.membership).toBe('unknown')
    }
  })

  it('can use an older exact portable location after rejecting higher-priority base locations', () => {
    const result = resolveCwtExchange({
      call: 'VE3/K1ABC',
      selectedFile: file('K1ABC,Pat,CA'),
      olderHistory: [contact({ call: 'VE3/K1ABC', number: 'ON' })],
    })
    expect(result.number).toMatchObject({ value: 'ON', source: 'older-history', match: 'exact' })
  })

  it('keeps source precedence ahead of exact/base preference', () => {
    const result = resolveCwtExchange({
      call: 'K1ABC/P',
      currentOperation: [contact({ number: 'CWA' })],
      selectedFile: file('K1ABC/P,File,456'),
    })
    expect(result.number).toMatchObject({
      value: 'CWA',
      source: 'current-operation',
      match: 'base',
    })
  })

  it('places undated contacts after dated contacts and resolves equal dates stably', () => {
    const result = resolveCwtExchange({
      call: 'K1ABC',
      olderHistory: [
        contact({ name: 'Undated', timestamp: undefined }),
        contact({ name: 'First', timestamp: 100 }),
        contact({ name: 'Second', timestamp: 100 }),
      ],
    })
    expect(result.name?.value).toBe('First')
  })

  it('does not mutate the input history or trim deliberate operator input', () => {
    const olderHistory = Object.freeze([Object.freeze(contact())])
    const result = resolveCwtExchange({
      call: ' k1abc ',
      operator: { call: 'K1ABC', name: ' Typed ' },
      olderHistory,
    })
    expect(result.name?.value).toBe(' Typed ')
    expect(olderHistory[0]?.name).toBe('History')
  })
})

describe('callsign matching', () => {
  it.each([
    'K1ABC/P',
    'K1ABC/M',
    'K1ABC/MM',
    'K1ABC/AM',
    'K1ABC/QRP',
    'K1ABC/4',
    'EA8/K1ABC',
    'EA8/K1ABC/P',
  ])('uses unambiguous base for %s', (call) => {
    expect(baseCall(call)).toBe('K1ABC')
    expect(callLookupKeys(call)).toEqual([call, 'K1ABC'])
  })

  it('does not substitute a different portable record for a base call or choose between two full calls', () => {
    expect(callLookupKeys('K1ABC')).toEqual(['K1ABC'])
    expect(baseCall('K1ABC/W2XYZ')).toBe('K1ABC/W2XYZ')
    expect(
      resolveCwtExchange({ call: 'K1ABC', selectedFile: file('K1ABC/P,Pat,123') }).number,
    ).toBeUndefined()
  })

  it.each(['', 'K', '123', 'K1 A', 'K1ABC/', '<html>'])(
    'rejects incomplete or invalid input %s',
    (call) => {
      expect(callLookupKeys(call)).toEqual([])
    },
  )
})
