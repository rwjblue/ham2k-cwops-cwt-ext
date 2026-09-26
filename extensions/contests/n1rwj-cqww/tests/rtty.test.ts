// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import type {
  ExportResult,
  JSONValue,
  LoggingControlDescriptor,
  ScoreQsosResult,
} from '@ham2k/extension-sdk'
import { test } from 'vitest'
import { CANADIAN_QTHS, normalizeQth, qthForCall, qthMultiplier, US_QTHS } from '../src/rtty.ts'
import { CQWWScorer } from '../src/scorer.ts'
import { loadExtension } from './support.ts'

const cqww = await loadExtension(() => import('../src/index.ts'))
type Qson = Record<string, JSONValue>
const ref: Qson = { type: 'cqww', mode: 'RTTY', zone: '5', qth: 'MA' }
const operation: Qson = { uuid: 'rtty', stationCall: 'N1RWJ', refs: [ref] }
const ctx = { online: false } as never
function qso(call: string, zone = '5', qth = 'MA', band = '20m', mode = 'RTTY'): Qson {
  return {
    uuid: `${call}-${band}-${mode}`,
    startAtMillis: Date.UTC(2026, 8, 26, 12),
    freq: 14085,
    band,
    mode,
    their: { call },
    refs: [{ type: 'cqww', theirZone: zone, theirQth: qth }],
  }
}
function run(qsos: Qson[], op = operation, contestRef = ref) {
  let sheet = CQWWScorer.startScoresheet({ operation: op, ref: contestRef }, ctx)
  const scores = qsos.map((qso) => {
    const result = CQWWScorer.scoreQso(
      { scoresheet: sheet, qso, operation: op, ref: contestRef, isNewDay: false },
      ctx,
    )
    sheet = result.scoresheet
    return result.score
  })
  return { sheet, scores }
}
async function exported(qsos: Qson[], op = operation): Promise<ExportResult> {
  return (await cqww.runHook('export', 'generateExport', {
    operation: op,
    qsos,
    exportType: 'cqww-cabrillo',
  })) as ExportResult
}

test('RTTY scores 1/2/3 points and all three multiplier axes', () => {
  const { sheet, scores } = run([
    qso('W1AW', '5', 'CT'),
    qso('VE3XYZ', '4', 'ON'),
    qso('DL1ABC', '14', 'DX'),
  ])
  assert.deepEqual(
    scores.map((s) => s.value),
    [1, 2, 3],
  )
  assert.equal(Object.keys(sheet.mults).length, 8)
  const summary = CQWWScorer.summarizeScore(
    { scoresheet: sheet, operation, ref, scope: 'operation' },
    ctx,
  ).cqww
  assert.equal(summary.total, 48)
  assert.ok(!summary.longSummary?.toString().includes('160m'))
  assert.ok(scores[0].notices?.includes('newMult'))
  assert.ok(!scores[0].notices?.includes('newBand'))
  assert.equal(scores[0].dupe, false)
})

test('RTTY gives two points within Europe, unlike CW/SSB', () => {
  const { scores } = run([qso('G3ABC', '14', 'DX')], { ...operation, stationCall: 'DL1ABC' })
  assert.equal(scores[0].value, 2)
})

test('RTTY duplicates persist across UTC days, but a new band counts', async () => {
  const first = qso('W1AW', '5', 'CT')
  const nextDay = { ...first, uuid: 'next-day', startAtMillis: Date.UTC(2026, 8, 27, 12) }
  const anotherBand: Qson = {
    ...qso('W1AW', '05', 'CT', '40m'),
    startAtMillis: Date.UTC(2026, 8, 27, 13),
  }
  const result = (await cqww.runHook('scoring', 'scoreQsos', {
    operation,
    ref,
    qsos: [first, nextDay, anotherBand],
  })) as ScoreQsosResult
  assert.equal(result.qsoScores['next-day'].dupe, true)
  assert.equal(result.operationSummary.cqww.total, 12)
  assert.ok(result.qsoScores[String(anotherBand.uuid)].notices?.includes('newBand'))
})

test('RTTY sidebands share the dupe key; generic DATA and FT8 are not RTTY', () => {
  const { scores } = run(
    ['RTTY-LSB', 'RTTY-USB', 'RTTY-R', 'DATA', 'DATA-USB', 'FT8'].map((mode) =>
      qso('W1AW', '5', 'CT', '20m', mode),
    ),
  )
  assert.equal(scores[0].value, 1)
  assert.equal(scores[1].dupe, true)
  assert.equal(scores[2].dupe, true)
  for (const s of scores.slice(3)) assert.deepEqual(s.alerts, ['invalidMode'])
})

test('160m and WARC do not count in RTTY; single-band scores leave other bands unclaimed', async () => {
  for (const band of ['160m', '60m', '30m', '17m', '12m', '6m']) {
    assert.deepEqual(run([qso('W1AW', '5', 'CT', band)]).scores[0].alerts, ['invalidBand'])
  }
  const single = { ...ref, categoryBand: '20' }
  const qsos = [qso('W1AW', '5', 'CT'), qso('VE3XYZ', '4', 'ON', '40m')]
  assert.deepEqual(
    run(qsos, operation, single).scores.map((s) => s.value),
    [1, 0],
  )
  const file = await exported(qsos, { ...operation, refs: [single] })
  assert.equal(file.content.split('QSO:').length - 1, 2, 'all bands remain in submitted logs')
  assert.ok(file.content.includes('CATEGORY-BAND: 20'))
})

test('Canadian areas remain distinct and only unambiguous aliases normalize', () => {
  assert.equal(US_QTHS.length, 49)
  assert.equal(CANADIAN_QTHS.length, 14)
  assert.equal(normalizeQth(' nt '), 'NWT')
  assert.equal(normalizeQth('pe'), 'PEI')
  assert.equal(normalizeQth('NL'), 'NL')
  assert.equal(qthMultiplier('VO1ABC', 'NL'), '')
  assert.equal(qthMultiplier('VO1ABC', 'NF'), 'NF')
  assert.equal(qthMultiplier('VO2ABC', 'LB'), 'LB')
  const { sheet } = run([qso('VO1ABC', '5', 'NF'), qso('VO2ABC', '2', 'LB')])
  assert.ok(sheet.mults['20m|QNF'])
  assert.ok(sheet.mults['20m|QLB'])
})

test('Alaska and Hawaii earn countries but never state multipliers', () => {
  assert.equal(qthForCall('KL7ABC'), 'DX')
  assert.equal(qthForCall('KH6ABC'), 'DX')
  assert.equal(qthMultiplier('KL7ABC', 'AK'), '')
  assert.equal(qthMultiplier('KH6ABC', 'HI'), '')
  assert.equal(qthMultiplier('DL1ABC', 'MA'), '')
  const { scores, sheet } = run([qso('KL7ABC', '1', 'DX'), qso('KH6ABC', '31', 'DX')])
  assert.deepEqual(
    scores.map((s) => s.value),
    [2, 3],
  )
  assert.equal(Object.keys(sheet.mults).length, 4)
})

test('CQ country multipliers use WAE exceptions including Sicily and African Italy', () => {
  const { sheet, scores } = run([
    qso('I2ABC', '15', 'DX'),
    qso('IT9ABC', '15', 'DX'),
    qso('IG9ABC', '33', 'DX'),
    qso('IH9ABC', '33', 'DX'),
  ])
  assert.deepEqual(
    scores.map((s) => s.value),
    [3, 3, 3, 3],
  )
  assert.ok(sheet.mults['20m|CI'])
  assert.ok(sheet.mults['20m|C*IT9'])
  assert.equal(sheet.mults['20m|C*IG9'], 2)
})

test('maritime mobile contacts never earn their callsign country or state multiplier', () => {
  const { sheet } = run([qso('W1AW/MM', '8', 'DX')])
  assert.deepEqual(Object.keys(sheet.mults), ['20m|Z8'])
})

test('missing, cleared, invalid, or mismatched exchanges do not consume a valid contact', () => {
  const bad = [
    qso('W1AW', '', 'CT'),
    qso('W1AW', '41', 'CT'),
    qso('W1AW', '5', ''),
    qso('W1AW', '5', 'ON'),
    qso('W1AW', '5', 'DX'),
  ]
  for (const candidate of bad) {
    const { scores } = run([candidate, qso('W1AW', '5', 'CT')])
    assert.deepEqual(scores[0].alerts, ['missingExchange'])
    assert.equal(scores[1].value, 1)
    assert.equal(scores[1].dupe, false)
  }
  const missing = qso('DL1ABC', '14', 'DX')
  delete missing.refs
  assert.equal(run([missing]).scores[0].value, 0, 'no unrecorded guessed zone multiplier')
})

test('QTH suggestions are tentative lookup data, never guesses from call digits', async () => {
  const get = async (candidate: Qson) =>
    (await cqww.runHook('activity', 'loggingControls', {
      operation,
      qso: candidate,
    })) as LoggingControlDescriptor[]
  const controls = await get({ their: { call: 'W1AW', guess: { state: 'CT' } } })
  assert.equal(controls.length, 2)
  assert.equal((controls[1].input as { suggestedValue?: string }).suggestedValue, 'CT')
  const empty = await get({ their: { call: 'W1AW' } })
  assert.equal((empty[1].input as { suggestedValue?: string }).suggestedValue, undefined)
  const cw = (await cqww.runHook('activity', 'loggingControls', {
    operation: { ...operation, refs: [{ ...ref, mode: 'CW' }] },
    qso: qso('W1AW'),
  })) as LoggingControlDescriptor[]
  assert.equal(cw.length, 1)
})

test('save projection and ADIF preserve corrections, aliases and deliberate clearing', async () => {
  const candidate = {
    ...qso('VE3XYZ', '3', 'nt'),
    their: { call: 'VE3XYZ', guess: { state: 'ON', cqZone: 4 } },
  }
  const patch = (await cqww.runHook('activity', 'processQsoBeforeSave', {
    operation,
    qso: candidate,
  })) as Qson
  assert.deepEqual(patch.their, { exchange: '3 NWT' })
  assert.deepEqual(patch.refs, [{ type: 'cqww', theirZone: '3', theirQth: 'NWT' }])
  const cleared = { ...candidate, refs: [{ type: 'cqww', theirZone: '', theirQth: '' }] }
  const blank = (await cqww.runHook('activity', 'processQsoBeforeSave', {
    operation,
    qso: cleared,
  })) as Qson
  assert.deepEqual(blank.their, { exchange: '' })
  assert.deepEqual(blank.refs, [{ type: 'cqww', theirZone: '', theirQth: '' }])
  const fields = (await cqww.runHook('adifFields', 'fieldsForOneQSO', {
    operation,
    qso: candidate,
  })) as { name: string; value: string }[]
  assert.ok(fields.some((f) => f.name === 'SRX_STRING' && f.value === '3 NWT'))
  assert.ok(fields.some((f) => f.name === 'STX_STRING' && f.value === '5 MA'))
  assert.ok(fields.some((f) => f.name === 'CONTEST_ID' && f.value === 'CQ-WW-RTTY'))
})

test('Cabrillo includes RY, padded zones, both QTH columns and category headers', async () => {
  const file = await exported([
    qso('VE3XYZ', '4', 'ON', '20m', 'RTTY-USB'),
    qso('DL1ABC', '14', 'DX'),
    qso('W1AW', '5', 'CT', '20m', 'FT8'),
  ])
  assert.ok(file.content.includes('CONTEST: CQ-WW-RTTY'))
  assert.ok(file.content.includes('LOCATION: MA'))
  assert.ok(file.content.includes('CATEGORY-MODE: RTTY'))
  assert.ok(file.content.includes('CATEGORY-OPERATOR: SINGLE-OP'))
  assert.ok(file.content.includes('CATEGORY-ASSISTED: NON-ASSISTED'))
  const lines = file.content.split('\n').filter((line) => line.startsWith('QSO:'))
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0].trim().split(/\s+/), [
    'QSO:',
    '14085',
    'RY',
    '2026-09-26',
    '1200',
    'N1RWJ',
    '599',
    '05',
    'MA',
    'VE3XYZ',
    '599',
    '04',
    'ON',
  ])
  assert.ok(lines[1].endsWith('DL1ABC 599 14 DX'))
  assert.ok(!file.content.includes(' DG '))
})

test('Cabrillo honors received RSTs and refuses an incomplete sent exchange', async () => {
  const candidate = {
    ...qso('W1AW', '05', 'CT'),
    our: { sent: '579' },
    their: { call: 'W1AW', sent: '589' },
  }
  assert.ok((await exported([candidate])).content.includes('N1RWJ 579 05 MA W1AW 589 05 CT'))
  for (const setup of [
    { ...ref, qth: '' },
    { ...ref, zone: '' },
    { ...ref, qth: 'ON' },
  ]) {
    await assert.rejects(
      exported([candidate], { ...operation, refs: [setup] }),
      /Configure a valid CQ zone/,
    )
  }
})

test('cleared received fields export as missing, never restored from callsign guesses', async () => {
  const file = await exported([qso('DL1ABC', '', '')])
  assert.ok(file.content.includes('DL1ABC 599 - -'))
})

test('RTTY references link to their own rules and show the sent QTH', async () => {
  const link = (await cqww.runHook('ref:cqww', 'linkForRef', { ref })) as { url: string }
  assert.equal(link.url, 'https://cqwwrtty.com/rules.htm')
  const title = (await cqww.runHook('ref:cqww', 'suggestOperationTitle', { operation, ref })) as {
    subtitle: string
  }
  assert.equal(title.subtitle, 'Zone 5 MA')
})

test('CW/SSB Cabrillo exchange columns and rules links stay compatible', async () => {
  const cwOp = { ...operation, refs: [{ type: 'cqww', mode: 'CW', zone: '5' }] }
  const file = await exported([qso('DL1ABC', '14', 'DX', '20m', 'CW')], cwOp)
  assert.ok(file.content.includes('N1RWJ 599 5 DL1ABC 599 14'))
  assert.ok(!file.content.includes('LOCATION:'))
  const link = (await cqww.runHook('ref:cqww', 'linkForRef', {
    ref: { type: 'cqww', mode: 'CW' },
  })) as { url: string }
  assert.equal(link.url, 'https://www.cqww.com/rules.htm')
})
