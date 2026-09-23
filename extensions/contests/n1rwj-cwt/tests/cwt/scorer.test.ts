// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// CWT's arithmetic is trivial — every contact is worth one point — which is
// exactly why the part that is NOT trivial needs pinning: the multiplier is
// unique CALLSIGNS rather than the per-band multiplier every other contest
// here counts.

import assert from 'node:assert/strict'
import type { JSONValue } from '@ham2k/extension-sdk'
import { test } from 'vitest'
import { CWTScorer } from '../../src/cwt/scorer.ts'

const ctx = { online: false }

const operation = { uuid: 'op', stationCall: 'N0DEV' }
/// Wednesday 26 August 2026, 1300-1400 UTC.
const sessionRef = { type: 'cwt', ref: '2026-08-26-1300' }
const DURING = Date.UTC(2026, 7, 26, 13, 30)

function qso(
  call: string,
  band = '20m',
  mode = 'CW',
  startAtMillis = DURING,
): Record<string, JSONValue> {
  return { their: { call }, band, mode, startAtMillis }
}

function run(
  qsos: Record<string, JSONValue>[],
  ref: Record<string, JSONValue> | undefined = sessionRef,
) {
  let sheet = CWTScorer.startScoresheet({ operation, ref }, ctx)
  const scores = qsos.map((q) => {
    const r = CWTScorer.scoreQso(
      { scoresheet: sheet, qso: q, operation, ref, isNewDay: false },
      ctx,
    )
    sheet = r.scoresheet
    return r.score
  })
  return { sheet, scores }
}

function total(sheet: Parameters<typeof CWTScorer.summarizeScore>[0]['scoresheet']) {
  return CWTScorer.summarizeScore(
    { scoresheet: sheet, operation, ref: sessionRef, scope: 'operation' },
    ctx,
  ).cwt.total
}

test('the multiplier is unique callsigns, not band-by-band mults', () => {
  // Three contacts with two stations: 3 points × 2 callsigns = 6. Counting
  // multipliers per band — the shape every other contest here uses — would
  // give 3 × 3 and a score half again too high.
  const { sheet, scores } = run([qso('W1AW', '20m'), qso('W1AW', '40m'), qso('K5XYZ', '20m')])
  assert.deepEqual(
    scores.map((s) => s.value),
    [1, 1, 1],
  )
  assert.equal(Object.keys(sheet.workedByCall).length, 2)
  assert.equal(total(sheet), 6)
})

test('a station worked again on a new band is a point but not a multiplier', () => {
  const { scores } = run([qso('W1AW', '20m'), qso('W1AW', '40m')])
  assert.deepEqual(scores[0].notices, ['newMult'])
  assert.deepEqual(scores[1].notices, ['newBand'])
})

test('a station worked twice on one band is a dupe worth nothing', () => {
  const { sheet, scores } = run([qso('W1AW', '20m'), qso('W1AW', '20m')])
  assert.equal(scores[1].value, 0)
  assert.equal(scores[1].dupe, true)
  assert.deepEqual(scores[1].alerts, ['duplicate'])
  // And it must not inflate the multiplier or the QSO count either.
  assert.equal(sheet.qsos, 1)
  assert.equal(total(sheet), 1)
})

test('a contact outside the session hour still counts', () => {
  // The reference names ONE HOUR, and this scorer deliberately does NOT gate
  // on it — that question is the same for every contest here and belongs in
  // one place for all of them. Pinned so reintroducing the gate in this one
  // scorer is a deliberate act rather than a quiet one.
  const { scores } = run([qso('W1AW', '20m', 'CW', Date.UTC(2026, 7, 26, 18, 0))])
  assert.equal(scores[0].value, 1)
})

test('CW only, and only on the six contest bands', () => {
  const { scores } = run([
    qso('W1AW', '20m', 'SSB'),
    qso('K5XYZ', '30m', 'CW'),
    qso('N2ABC', '160m', 'CW'),
  ])
  assert.deepEqual(scores[0].alerts, ['invalidMode'])
  assert.deepEqual(scores[1].alerts, ['invalidBand'])
  assert.equal(scores[2].value, 1)
})

test("a day's summary scores its own points against the running multipliers", () => {
  const { sheet } = run([qso('W1AW', '20m'), qso('K5XYZ', '40m')])
  const day = CWTScorer.summarizeScore(
    { scoresheet: sheet, operation, ref: sessionRef, scope: 'day' },
    ctx,
  ).cwt
  assert.equal(day.for, 'day')
  assert.equal(day.total, 4)
})

// The host renders label + longSummary and suppresses the numeric summary.
// Exercise that visible contract with a repeated station on another band and
// a same-band dupe, so neither contact count nor multiplier can be confused.
test('the information page shows the total and explains the unique-call multiplier', () => {
  const { sheet } = run([
    qso('W1AW', '20m'),
    qso('W1AW', '40m'),
    qso('K5XYZ', '20m'),
    qso('W1AW', '20m'),
  ])
  for (const scope of ['operation', 'day'] as const) {
    const tally = CWTScorer.summarizeScore(
      { scoresheet: sheet, operation, ref: sessionRef, scope },
      ctx,
    ).cwt
    assert.equal(tally.total, 6)
    assert.equal(tally.label, 'CWT: 6 points')
    assert.equal(tally.summary, '6')
    assert.ok(tally.longSummary)
    assert.match(tally.longSummary, /^3 QSOs × 2 unique callsigns\n\n/)
    assert.ok(tally.longSummary?.includes('**20m**: 2 QSOs'))
    assert.ok(tally.longSummary?.includes('**40m**: 1 QSOs'))
  }
})

test('the screenshot example displays 169 points with localized scoring details', () => {
  const { sheet } = run(Array.from({ length: 13 }, (_, i) => qso(`W1A${i}`)))
  for (const [locale, label, calculation] of [
    ['en', 'CWT: 169 points', '13 QSOs × 13 unique callsigns'],
    ['es', 'CWT: 169 puntos', '13 QSO × 13 indicativos únicos'],
  ]) {
    const tally = CWTScorer.summarizeScore(
      { scoresheet: sheet, operation, ref: sessionRef, scope: 'operation' },
      { online: false, locale },
    ).cwt
    assert.equal(tally.label, label)
    assert.equal(tally.total, 169)
    assert.ok(tally.longSummary?.startsWith(`${calculation}\n\n`))
  }
})
