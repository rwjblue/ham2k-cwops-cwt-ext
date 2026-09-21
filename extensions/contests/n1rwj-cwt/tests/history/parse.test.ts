import { describe, expect, it } from 'vitest'
import { parseCallHistory } from '../../src/history'

describe('N1MM call history', () => {
  it('parses the actual CWOPS file structure and explicit exchange categories', () => {
    // Representative records from CWOPS_3992-AAA.txt, retrieved 2026-09-19.
    const parsed = parseCallHistory(`!!Order!!,Call,Name,Exch1,UserText,
# CWOPS
# LastEdit,2026-09-17
2E0DCW,Gerald,,London England
2E0IER,Brian,3702,Doncaster England
AA0AI,Steve,IA,North Liberty IA
AA4NO,Bill,CWA,Wilmington NC
9A/S57KM,Sandi,9A,
N0AC/M,Bill,IA,(1252),
KE6K,John,1427,Welch,K,AZ,
`)
    expect(parsed.usable).toBe(true)
    expect(parsed.associations).toEqual(['CWOPS'])
    expect(parsed.sourceUpdatedAt).toBe('2026-09-17')
    expect(parsed.records['2E0IER']).toEqual({
      call: '2E0IER',
      name: 'Brian',
      number: '3702',
      membership: 'member',
    })
    expect(parsed.records.AA0AI).toMatchObject({ number: 'IA', membership: 'nonmember' })
    expect(parsed.records.AA4NO).toMatchObject({ number: 'CWA', membership: 'cwa' })
    expect(parsed.records['9A/S57KM']).toMatchObject({ number: '9A', membership: 'nonmember' })
    expect(parsed.records['2E0DCW']).toEqual({
      call: '2E0DCW',
      name: 'Gerald',
      membership: 'unknown',
    })
    expect(parsed.records.KE6K).toMatchObject({ name: 'John', number: '1427' })
    expect(parsed.issues).toEqual([
      expect.objectContaining({ code: 'extra-columns', severity: 'warning' }),
    ])
  })

  it('handles BOM, CRLF, blank fields, case, whitespace, and semicolon columns', () => {
    const parsed = parseCallHistory(
      '\uFEFF!!Order!!; Exch1;CALL; Name;;State\r\n# cwoPS\r\n\r\n  122 ; k1abc/p ; Pat ; ignored ; MA\r\n ; W1XYZ ; ; ; PA\r\n',
    )
    expect(parsed.usable).toBe(true)
    expect(parsed.records['K1ABC/P']).toEqual({
      call: 'K1ABC/P',
      name: 'Pat',
      number: '122',
      membership: 'member',
    })
    expect(parsed.records.W1XYZ).toEqual({ call: 'W1XYZ', membership: 'unknown' })
  })

  it('uses the N1MM default order when no directive is present', () => {
    const parsed = parseCallHistory('K1ABC,Pat,,,,MA,,,1234\nW1XYZ,Lee,,,,TX')
    expect(parsed.records.K1ABC).toMatchObject({ name: 'Pat', number: '1234' })
    expect(parsed.records.W1XYZ).toEqual({ call: 'W1XYZ', name: 'Lee', membership: 'unknown' })
  })

  it('supports changing column order and delimiter within a file', () => {
    const parsed = parseCallHistory(
      '!!Order!!,Call,Name,Exch1\nK1ABC,Pat,12\n!!order!!;exch1;name;call\nCWA;Lee;W1XYZ',
    )
    expect(parsed.records.W1XYZ).toMatchObject({ name: 'Lee', number: 'CWA' })
    expect(parsed.records.K1ABC?.number).toBe('12')
  })

  it('preserves quoted delimiters, escaped quotes, and skipped columns', () => {
    const parsed = parseCallHistory(
      '!!Order!!,Call,,Name,Exch1,UserText\nK1ABC,ignore,"Pat, Jr.",321,"Quote ""inside"""',
    )
    expect(parsed.records.K1ABC?.name).toBe('Pat, Jr.')
    expect(parsed.issues).toEqual([])
  })

  it('ignores unknown columns with an actionable warning', () => {
    const parsed = parseCallHistory('!!Order!!,Call,Name,Number\nK1ABC,Pat,123')
    expect(parsed.usable).toBe(true)
    expect(parsed.records.K1ABC?.number).toBeUndefined()
    expect(parsed.issues[0]?.code).toBe('unknown-column')
  })

  it.each(['!!MapStateToSect!!', '!!Validate50State!!', '!!UnknownFutureDirective!!'])(
    'rejects unsupported directive %s without silently changing semantics',
    (directive) => {
      const parsed = parseCallHistory(`!!Order!!,Call,Name,Exch1\n${directive}\nK1ABC,Pat,321`)
      expect(parsed.usable).toBe(false)
      expect(parsed.issues).toContainEqual(
        expect.objectContaining({ code: 'unsupported-directive', line: 2, severity: 'error' }),
      )
    },
  )

  it.each([
    '!!Order!!,Name,Exch1',
    '!!Order!!,Call,Name,Name',
    '!!Order!!,Call,Call',
    '!!Order!!,Call,Exch1,Exch1',
  ])('rejects ambiguous order %s', (directive) => {
    expect(parseCallHistory(`${directive}\nK1ABC,Pat,321`).issues).toContainEqual(
      expect.objectContaining({ code: 'invalid-order' }),
    )
    expect(parseCallHistory(`${directive}\nK1ABC,Pat,321`).usable).toBe(false)
  })

  it('rejects explicitly unrelated contests and accepts files associated with multiple including CWT', () => {
    expect(parseCallHistory('# naqpcw\nK1ABC,Pat').usable).toBe(false)
    const parsed = parseCallHistory('# CQWWCW\n# CWOPS\n# cwops\nK1ABC,Pat')
    expect(parsed.usable).toBe(true)
    expect(parsed.associations).toEqual(['CQWWCW', 'CWOPS'])
    expect(parseCallHistory('# QSOParty PA\nK1ABC,Pat').usable).toBe(false)
  })

  it.each(['ICWC-MST', 'K1USNSST', 'K1USN-SST'])(
    'rejects the actual %s association rather than interpreting its exchange as CWT',
    (contest) => {
      const parsed = parseCallHistory(`# ${contest}\n!!Order!!,Call,Name,Exch1\nK1ABC,Pat,123`)
      expect(parsed.usable).toBe(false)
      expect(parsed.issues).toContainEqual(
        expect.objectContaining({ code: 'incompatible-contest' }),
      )
    },
  )

  it('treats ordinary comments as comments and rejects invalid dates', () => {
    const parsed = parseCallHistory(
      '# Thanks K1ABC W1XYZ\n# Notes\n# LastEdit,2026-02-31\nK1ABC,Pat',
    )
    expect(parsed.associations).toEqual([])
    expect(parsed.sourceUpdatedAt).toBeUndefined()
    expect(parsed.usable).toBe(true)
  })

  it('merges duplicate records field by field, with later nonblank values winning', () => {
    const parsed = parseCallHistory(
      '!!Order!!,Call,Name,Exch1\nK1ABC,Pat,123\nK1ABC,Patrick,\nK1ABC,,456',
    )
    expect(parsed.records.K1ABC).toEqual({
      call: 'K1ABC',
      name: 'Patrick',
      number: '456',
      membership: 'member',
    })
    expect(parsed.issues.filter((issue) => issue.code === 'duplicate-call')).toHaveLength(2)
  })

  it('skips malformed rows while retaining valid records and never promotes usertext', () => {
    const parsed = parseCallHistory(
      '!!Order!!,Call,Name,Exch1,UserText\nK1ABC,Pat,?,CWA\nnot a call,Lee,45\nW1XYZ,"Broken,123\nN1ABC,Jo,0,NY',
    )
    expect(parsed.usable).toBe(true)
    expect(Object.keys(parsed.records)).toEqual(['K1ABC', 'N1ABC'])
    expect(parsed.records.K1ABC?.membership).toBe('unknown')
    expect(parsed.records.N1ABC?.number).toBeUndefined()
    expect(parsed.issues.filter((issue) => issue.code === 'invalid-row')).toHaveLength(2)
  })

  it.each(['', '# CWOPS\n', '<!DOCTYPE html>\n<html>Access denied</html>'])(
    'rejects an empty or HTML response',
    (text) => {
      expect(parseCallHistory(text).usable).toBe(false)
    },
  )
})
