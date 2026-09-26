// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// CQ WW's point structure is the part a port gets wrong quietly: the numbers
// are all small, so a mistake produces a plausible-looking score that is simply
// not what the sponsor will compute. These encode WHY each value is what it is.
//
// Callsigns resolve against the bundled country file (no network): W1AW → K/NA
// zone 5, VE3XYZ → VE/NA, DL1ABC → DL/EU, JA1ABC → JA/AS, PY2ABC → PY/SA.

import assert from 'node:assert/strict'
import type { JSONValue } from '@ham2k/extension-sdk'
import { test } from 'vitest'
import { CQWWScorer, normalizeZone } from '../src/scorer.ts'

const ctx = { online: false } as never

/// A US station, so "our continent" is NA and "our country" is K.
const usOperation = { uuid: 'op', stationCall: 'N0DEV' }
const ssbRef = { type: 'cqww', mode: 'SSB' }

function qso(
  call: string,
  band = '20m',
  mode = 'SSB',
  theirZone?: string,
): Record<string, JSONValue> {
  return {
    their: { call },
    band,
    mode,
    ...(theirZone ? { refs: [{ type: 'cqww', theirZone }] } : {}),
  }
}

function run(
  qsos: Record<string, JSONValue>[],
  operation = usOperation,
  ref: Record<string, JSONValue> = ssbRef,
) {
  let sheet = CQWWScorer.startScoresheet({ operation, ref }, ctx)
  const scores = qsos.map((q) => {
    const r = CQWWScorer.scoreQso(
      { scoresheet: sheet, qso: q, operation, ref, isNewDay: false },
      ctx,
    )
    sheet = r.scoresheet
    return r.score
  })
  return { sheet, scores }
}

test('a zone the operator deliberately emptied earns no multiplier', () => {
  // The core writes `theirZone: ''` for a field the operator cleared and drops
  // the key when none was entered. Falling back on the country file for the
  // first would score a multiplier the Cabrillo line exports as a dash — the
  // log disagreeing with its own score, which is what §8 exists to prevent.
  const { scores, sheet } = run([
    {
      their: { call: 'DL1ABC' },
      band: '20m',
      mode: 'SSB',
      refs: [{ type: 'cqww', theirZone: '' }],
    },
  ])
  // Still a contact worth its points, and still a COUNTRY multiplier — only the
  // zone, which nobody sent, is absent.
  assert.ok(scores[0].value > 0)
  assert.deepEqual(Object.keys(sheet.mults), ['20m|CDL'])
})

test('a zone nobody entered still falls back to the country file', () => {
  // The other side of the same rule: an ABSENT field is not a decision.
  const { sheet } = run([{ their: { call: 'DL1ABC' }, band: '20m', mode: 'SSB' }])
  assert.deepEqual(Object.keys(sheet.mults).sort(), ['20m|CDL', '20m|Z14'])
})

test('zones normalize so 05 and 5 are one multiplier, not two', () => {
  assert.equal(normalizeZone('05'), '5')
  assert.equal(normalizeZone('5'), '5')
  assert.equal(normalizeZone('40'), '40')
  assert.equal(normalizeZone('040'), '40')
  // Out of range, or not a zone at all.
  assert.equal(normalizeZone('41'), '')
  assert.equal(normalizeZone('0'), '')
  assert.equal(normalizeZone('abc'), '')

  const { sheet } = run([qso('DL1ABC', '20m', 'SSB', '14'), qso('DL2ABC', '20m', 'SSB', '014')])
  // One zone multiplier, one country multiplier — not two of each.
  assert.equal(Object.keys(sheet.mults).length, 2)
})

test('a station in our own country is worth no points, but still multiplies', () => {
  // Working another US station from the US: zero points by the rules, yet the
  // QSO still counts toward zone/country multipliers.
  const { scores, sheet } = run([qso('W1AW')])
  assert.equal(scores[0].value, 0)
  assert.equal(sheet.points, 0)
  assert.ok(Object.keys(sheet.mults).length > 0)
})

test('same continent is 1 point, except North America which is 2', () => {
  // NA-to-NA: the documented exception.
  const { scores: naScores } = run([qso('VE3XYZ')])
  assert.equal(naScores[0].value, 2)

  // EU-to-EU, scored from a German station: ordinary same-continent = 1.
  const euOperation = { uuid: 'op', stationCall: 'DL0ABC' }
  const { scores: euScores } = run([qso('EA4XYZ')], euOperation)
  assert.equal(euScores[0].value, 1)
})

test('a different continent is 3 points', () => {
  const { scores } = run([qso('DL1ABC'), qso('JA1ABC'), qso('PY2ABC')])
  assert.deepEqual(
    scores.map((s) => s.value),
    [3, 3, 3],
  )
})

test('the same station on the same band is a dupe; a new band is a fresh QSO', () => {
  const { scores, sheet } = run([qso('DL1ABC', '20m'), qso('DL1ABC', '20m'), qso('DL1ABC', '40m')])
  assert.equal(scores[0].value, 3)

  assert.equal(scores[1].value, 0)
  assert.equal(scores[1].dupe, true)

  // A new band is a new contact AND a new multiplier, since mults are per band.
  assert.equal(scores[2].value, 3)
  assert.ok(scores[2].notices?.includes('newBand'))
  assert.ok(scores[2].notices?.includes('newMult'))
  assert.equal(sheet.points, 6)
})

test('multipliers are per band, so the same country on two bands counts twice', () => {
  const { sheet } = run([qso('DL1ABC', '20m', 'SSB', '14'), qso('DL2ABC', '40m', 'SSB', '14')])
  // 20m|Z14, 20m|CDL, 40m|Z14, 40m|CDL
  assert.equal(Object.keys(sheet.mults).length, 4)
})

test('a QSO in the wrong mode or on a WARC band does not count', () => {
  // CQ WW runs separate CW and SSB weekends.
  const { scores: wrongMode } = run([qso('DL1ABC', '20m', 'CW')], usOperation, {
    type: 'cqww',
    mode: 'SSB',
  })
  assert.equal(wrongMode[0].value, 0)
  assert.deepEqual(wrongMode[0].alerts, ['invalidMode'])

  // 30m is a WARC band — excluded by the rules, not an oversight.
  const { scores: warc } = run([qso('DL1ABC', '30m')])
  assert.equal(warc[0].value, 0)
  assert.deepEqual(warc[0].alerts, ['invalidBand'])
})

test('the typed exchange wins over the callsign-derived zone', () => {
  // A station operating away from its callsign's zone — the operator hears the
  // real zone and types it, and that must be what scores.
  const { sheet } = run([qso('DL1ABC', '20m', 'SSB', '5')])
  assert.ok(Object.keys(sheet.mults).includes('20m|Z5'))
  assert.ok(!Object.keys(sheet.mults).includes('20m|Z14'))
})

test('the score is points times multipliers, not points alone', () => {
  const { sheet } = run([qso('DL1ABC', '20m', 'SSB', '14'), qso('JA1ABC', '20m', 'SSB', '25')])
  const summary = CQWWScorer.summarizeScore(
    { scoresheet: sheet, operation: usOperation, scope: 'operation' },
    ctx,
  )

  // 6 points; mults are 20m|Z14, 20m|CDL, 20m|Z25, 20m|CJA = 4.
  assert.equal(summary.cqww.points, 6)
  assert.equal(summary.cqww.mults, 4)
  assert.equal(summary.cqww.total, 24)
})
