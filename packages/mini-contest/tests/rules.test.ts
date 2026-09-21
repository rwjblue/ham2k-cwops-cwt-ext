import { describe, expect, it } from 'vitest'
import { config as mst } from '../../../extensions/contests/n1rwj-mst/src/config.ts'
import { config as sst } from '../../../extensions/contests/n1rwj-sst/src/config.ts'
import type { ContestConfig, Qson } from '../src/model.ts'
import { sessionAtHand, sessionFor, sessionsFrom } from '../src/schedule.ts'
import { createScorer } from '../src/scorer.ts'

const ctx = { online: false }
function score(config: ContestConfig, qsos: Qson[], session?: string) {
  const scorer = createScorer(config)
  const operation: Qson = { refs: [{ type: config.type, ...(session ? { ref: session } : {}) }] }
  let scoresheet = scorer.startScoresheet({ operation }, ctx)
  const verdicts = qsos.map((qso) => {
    const result = scorer.scoreQso({ scoresheet, qso, operation, isNewDay: false }, ctx)
    scoresheet = result.scoresheet
    return result.score
  })
  const tally = scorer.summarizeScore({ scoresheet, operation, scope: 'operation' }, ctx)[
    config.type
  ]
  return { tally, verdicts, scoresheet }
}
function qso(
  type: 'mst' | 'sst',
  call: string,
  band = '20m',
  location = 'MA',
  dxccCode?: number,
): Qson {
  return {
    their: { call, ...(dxccCode ? { dxccCode } : {}) },
    band,
    mode: 'CW',
    refs: [{ type, name: 'BOB', theirSerial: '10', location }],
  }
}
describe('weekly UTC sessions', () => {
  it('offers all three MST sessions then the next Monday, independent of DST', () => {
    expect(sessionsFrom(mst, Date.parse('2026-09-20T12:00:00Z')).map((row) => row.key)).toEqual([
      '2026-09-21-1300',
      '2026-09-21-1900',
      '2026-09-22-0300',
      '2026-09-28-1300',
    ])
    expect(sessionsFrom(mst, Date.parse('2026-11-01T12:00:00Z'))[0]?.key).toBe('2026-11-02-1300')
  })
  it('uses Monday 0000 UTC for Sunday evening SST, plus Friday 2000 UTC', () => {
    expect(sessionsFrom(sst, Date.parse('2026-09-20T21:00:00Z')).map((row) => row.key)).toEqual([
      '2026-09-21-0000',
      '2026-09-25-2000',
      '2026-09-28-0000',
      '2026-10-02-2000',
    ])
  })
  it('keeps the just-finished session for one hour and observes offer boundaries', () => {
    expect(sessionAtHand(sst, Date.parse('2026-09-20T20:59:59Z'))).toBeUndefined()
    expect(sessionAtHand(sst, Date.parse('2026-09-20T21:00:00Z'))?.key).toBe('2026-09-21-0000')
    expect(sessionAtHand(sst, Date.parse('2026-09-21T01:59:59Z'))?.key).toBe('2026-09-21-0000')
    expect(sessionAtHand(sst, Date.parse('2026-09-21T02:00:00Z'))).toBeUndefined()
  })
  it('rejects invalid dates, weekdays, hours and unrelated session identifiers', () => {
    for (const ref of [
      '2026-02-30-1300',
      '2026-09-20-1300',
      '2026-09-21-1400',
      '2026-09-21-1360',
      'MST',
      '',
    ])
      expect(sessionFor(mst, ref)).toBeUndefined()
    expect(sessionFor(mst, '2026-09-21-1300')?.endMillis).toBe(Date.parse('2026-09-21T14:00:00Z'))
  })
})
describe('MST scoring', () => {
  it('counts unique calls once overall, and duplicate contacts once per band', () => {
    const result = score(mst, [
      qso('mst', 'K1ABC'),
      qso('mst', 'K1ABC', '40m'),
      qso('mst', 'k1abc'),
      qso('mst', 'K2ABC'),
    ])
    expect(result.tally).toMatchObject({ qsos: 3, points: 3, mults: 2, total: 6 })
    expect(result.verdicts[1]).toMatchObject({ dupe: false, notices: ['newBand'] })
    expect(result.verdicts[2]).toMatchObject({ value: 0, dupe: true })
  })
  it('allows only CW and the six contest bands, excluding deleted/invalid contacts', () => {
    const result = score(mst, [
      { ...qso('mst', 'K1ABC'), mode: 'SSB' },
      qso('mst', 'K2ABC', '30m'),
      { ...qso('mst', 'K3ABC'), deleted: true },
      qso('mst', 'notacall'),
      qso('mst', 'K4ABC', '160m'),
    ])
    expect(result.verdicts.map((row) => row.value)).toEqual([0, 0, 0, 0, 1])
    expect(result.verdicts[0]?.alerts).toEqual(['invalidMode'])
    expect(result.verdicts[1]?.alerts).toEqual(['invalidBand'])
  })
  it('scores only the selected session, inclusive start and exclusive end', () => {
    const result = score(
      mst,
      ['12:59:59', '13:00:00', '13:59:59', '14:00:00'].map((time, i) => ({
        ...qso('mst', `K${i + 1}ABC`),
        startAtMillis: Date.parse(`2026-09-21T${time}Z`),
      })),
      '2026-09-21-1300',
    )
    expect(result.verdicts.map((row) => row.value)).toEqual([0, 1, 1, 0])
    expect(result.verdicts[3]?.alerts).toContain('Outside selected session')
  })
  it('flags incomplete or invalid received exchanges while retaining provisional QSO points', () => {
    const result = score(mst, [
      { ...qso('mst', 'K1ABC'), refs: [{ type: 'mst', name: 'BOB', theirSerial: '' }] },
      { ...qso('mst', 'K2ABC'), refs: [{ type: 'mst', name: 'BOB', theirSerial: 'MA' }] },
    ])
    expect(result.verdicts.map((row) => row.alerts)).toEqual([
      ['missingExchange'],
      ['invalidExchange'],
    ])
    expect(result.tally?.points).toBe(2)
  })
  it('serializes the scoresheet for checkpoint/resume without losing duplicate detection', () => {
    const initial = score(mst, [qso('mst', 'K1ABC')]).scoresheet
    const scorer = createScorer(mst)
    const scoresheet = JSON.parse(JSON.stringify(initial)) as typeof initial
    const result = scorer.scoreQso(
      { scoresheet, operation: {}, qso: qso('mst', 'K1ABC'), isNewDay: false },
      ctx,
    )
    expect(result.score.dupe).toBe(true)
    expect(scoresheet.points).toBe(1)
  })
})
describe('SST scoring', () => {
  it('counts states, provinces and DXCC entities once per band', () => {
    const result = score(sst, [
      qso('sst', 'K1ABC'),
      qso('sst', 'K2ABC'),
      qso('sst', 'K1ABC', '40m'),
      qso('sst', 'VE3ABC', '20m', 'ON'),
      qso('sst', 'G4ABC', '20m', 'DX', 223),
      qso('sst', 'G5ABC', '20m', 'DX', 223),
    ])
    expect(result.tally).toMatchObject({ qsos: 6, mults: 4, total: 24 })
    expect(result.verdicts[2]?.notices).toEqual(['newMult', 'newBand'])
  })
  it('counts Alaska and Hawaii as distinct DXCC multipliers without US/Canada country mults', () => {
    const result = score(sst, [
      qso('sst', 'KL7ABC', '20m', 'DX', 6),
      qso('sst', 'KH6ABC', '20m', 'DX', 110),
      qso('sst', 'W1ABC', '20m', 'DX', 291),
      qso('sst', 'VE3ABC', '20m', 'DX', 1),
    ])
    expect(result.tally).toMatchObject({ qsos: 4, mults: 2, total: 8 })
    expect(result.verdicts[2]?.alerts).toEqual(['Unknown DXCC multiplier'])
  })
  it('canonicalizes NL/NF to one multiplier while retaining Labrador separately', () => {
    const result = score(sst, [
      qso('sst', 'VO1ABC', '20m', 'NL'),
      qso('sst', 'VO1DEF', '20m', 'NF'),
      qso('sst', 'VO2ABC', '20m', 'LB'),
    ])
    expect(result.tally).toMatchObject({ points: 3, mults: 2, total: 6 })
  })
  it('does not turn literal DX into a single shared multiplier or award invalid state multipliers', () => {
    const result = score(sst, [
      qso('sst', 'G4ABC', '20m', 'DX', 223),
      qso('sst', 'DL1ABC', '20m', 'DX', 230),
      qso('sst', 'W1ABC', '20m', 'ZZ'),
    ])
    expect(result.tally?.mults).toBe(2)
    expect(result.verdicts[2]?.alerts).toEqual(['invalidExchange'])
  })
})
