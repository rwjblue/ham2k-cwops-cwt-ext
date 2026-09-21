import { hooks } from '@ham2k/extension-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import mstManifest from '../../../extensions/contests/n1rwj-mst/manifest.json'
import { config as mst } from '../../../extensions/contests/n1rwj-mst/src/config.ts'
import sstManifest from '../../../extensions/contests/n1rwj-sst/manifest.json'
import { config as sst } from '../../../extensions/contests/n1rwj-sst/src/config.ts'
import { createActivity } from '../src/activity.ts'
import { createExports } from '../src/exports.ts'
import { parseHistory } from '../src/history.ts'
import type { Qson } from '../src/model.ts'

const ctx = { online: false }
const mstOperation: Qson = {
  stationCall: 'N1RWJ',
  refs: [{ type: 'mst', ref: '2026-09-21-1300', ourName: 'ROB', power: 'LP' }],
}
const sstOperation: Qson = {
  stationCall: 'N1RWJ',
  refs: [{ type: 'sst', ref: '2026-09-21-0000', ourName: 'ROB', ourLocation: 'MA', power: 'LP' }],
}
const baseQso: Qson = {
  their: { call: 'K1ABC' },
  mode: 'CW',
  band: '20m',
  freq: 14032.5,
  startAtMillis: Date.parse('2026-09-21T13:01:00Z'),
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
describe('native activity contracts', () => {
  it('registers host-allocated MST serial and never suggests a received serial', async () => {
    const file = parseHistory(mst, '# ICWC-MST\n!!Order!!,Call,Name,Misc\nK1ABC,BOB,123\n')
    const { activity } = createActivity(mst, mstManifest, () => file)
    const controls = await activity.loggingControls({ operation: mstOperation, qso: baseQso }, ctx)
    expect(controls.map(({ input }) => input)).toMatchObject([
      { kind: 'serial', field: 'ourSerial', sequence: { key: 'mst-serial', start: 1 } },
      { kind: 'text', field: 'theirSerial' },
      { kind: 'text', field: 'name', suggestedValue: 'BOB' },
    ])
    expect(controls[1]?.input).not.toHaveProperty('suggestedValue')
    expect(await activity.loggingControls({ operation: {}, qso: baseQso }, ctx)).toEqual([])
  })
  it('projects explicit operator corrections and clearing while native controls own touched-field protection', async () => {
    const file = parseHistory(sst, '# K1USNSST\n!!Order!!,Call,Name,Exch1\nK1ABC,BOB,MA\n')
    const { activity } = createActivity(sst, sstManifest, () => file)
    for (const values of [
      { name: '', location: '' },
      { name: 'Rob', location: 'VT' },
    ]) {
      const qso: Qson = { ...baseQso, refs: [{ type: 'sst', ...values }] }
      const controls = await activity.loggingControls({ operation: sstOperation, qso }, ctx)
      expect(
        controls.map(({ input }) => ('suggestedValue' in input ? input.suggestedValue : undefined)),
      ).toEqual(['BOB', 'MA'])
      expect(await activity.processQsoBeforeSave({ operation: sstOperation, qso }, ctx)).toEqual({
        their: { exchange: values.name ? 'ROB VT' : '' },
      })
    }
  })
  it('clears untouched guesses on a known-to-unknown callsign transition, even with an earlier suggested ref', async () => {
    const file = parseHistory(sst, '# K1USNSST\n!!Order!!,Call,Name,Exch1\nK1ABC,BOB,MA\n')
    const { activity } = createActivity(sst, sstManifest, () => file)
    const before = await activity.loggingControls({ operation: sstOperation, qso: baseQso }, ctx)
    expect(before?.[0]?.input).toMatchObject({ suggestedValue: 'BOB' })
    const after = await activity.loggingControls(
      {
        operation: sstOperation,
        qso: {
          ...baseQso,
          their: { call: 'W9ZZZ' },
          refs: [{ type: 'sst', name: 'BOB', location: 'MA' }],
        },
      },
      ctx,
    )
    expect(after.map(({ input }) => input)).toMatchObject([
      { suggestedValue: ' ' },
      { suggestedValue: ' ' },
    ])
  })
  it('projects MST sent serial and received serial/name, clearing a missing sent serial on edits', async () => {
    const { activity } = createActivity(mst, mstManifest)
    const qso: Qson = {
      ...baseQso,
      refs: [{ type: 'mst', name: 'AL', theirSerial: '023', ourSerial: 2 }],
    }
    expect(await activity.processQsoBeforeSave({ operation: mstOperation, qso }, ctx)).toEqual({
      our: { exchange: '2' },
      their: { exchange: '023 AL' },
    })
    expect(
      await activity.processQsoBeforeSave(
        {
          operation: mstOperation,
          qso: { ...baseQso, refs: [{ type: 'mst', name: '', theirSerial: '' }] },
        },
        ctx,
      ),
    ).toEqual({ our: { exchange: '' }, their: { exchange: '' } })
  })
  it('offers sessions on explicit search, narrows scopes and allows reopening a past session', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
    const { activity } = createActivity(mst, mstManifest)
    expect(await activity.suggest({ operation: {} }, ctx)).toEqual([])
    expect(await activity.suggest({ operation: {}, searchTerm: 'MST' }, ctx)).toHaveLength(4)
    expect(
      await activity.suggest({ operation: {}, searchTerm: '1900', scoped: true }, ctx),
    ).toHaveLength(1)
    expect(
      await activity.suggest({ operation: {}, searchTerm: '2026-08-24-1300', scoped: true }, ctx),
    ).toMatchObject([{ ref: '2026-08-24-1300', program: 'Contest' }])
  })
  it('keeps setup field data separate from core-owned decoration fields', async () => {
    const { activity, refHandler } = createActivity(sst, sstManifest)
    const controls = await activity.operationControls({ operation: sstOperation }, ctx)
    expect(controls[0]).toMatchObject({
      key: 'n1rwj-sst/setup',
      editable: true,
      input: { kind: 'form' },
    })
    const decorated = await refHandler.decorateRef(
      { ref: { type: 'sst', ref: '2026-09-21-0000', ourName: 'ROB', ourLocation: 'MA' } },
      ctx,
    )
    expect(decorated).toMatchObject({
      name: '2026-09-21 0000z · ROB MA',
      ourName: 'ROB',
      ourLocation: 'MA',
    })
  })
})
describe('ADIF and Cabrillo contracts', () => {
  it('exports MST numeric STX/SRX alongside serial/name strings without guessing any serial', async () => {
    const { adifFields } = createExports(mst, mstManifest)
    const qso: Qson = {
      ...baseQso,
      refs: [{ type: 'mst', name: 'AL', theirSerial: '023', ourSerial: 2 }],
    }
    expect(await adifFields.fieldsForOneQSO({ operation: mstOperation, qso }, ctx)).toEqual([
      { name: 'CONTEST_ID', value: 'ICWC-MST' },
      { name: 'STX_STRING', value: '2 ROB' },
      { name: 'SRX_STRING', value: '023 AL' },
      { name: 'STX', value: '2' },
      { name: 'SRX', value: '23' },
    ])
    expect(
      await adifFields.fieldsForOneQSO({ operation: mstOperation, qso: baseQso }, ctx),
    ).toEqual([
      { name: 'CONTEST_ID', value: 'ICWC-MST' },
      { name: 'STX_STRING', value: 'ROB' },
    ])
  })
  it('uses official contest IDs and N1MM Cabrillo columns without RST', async () => {
    for (const [config, manifest, operation, ref, line] of [
      [
        mst,
        mstManifest,
        mstOperation,
        { type: 'mst', name: 'AL', theirSerial: '023', ourSerial: 2 },
        'N1RWJ ROB 2 K1ABC AL 023',
      ],
      [
        sst,
        sstManifest,
        sstOperation,
        { type: 'sst', name: 'AL', location: 'NL' },
        'N1RWJ ROB MA K1ABC AL NL',
      ],
    ] as const) {
      const { exports, adifFields } = createExports(config, manifest)
      const qso: Qson = { ...baseQso, refs: [{ ...ref }] }
      const result = await exports.generateExport(
        {
          operation,
          qsos: [qso, { ...qso, deleted: true }, { band: 'event' }],
          exportType: 'cabrillo',
        },
        ctx,
      )
      expect(result.content).toContain(`CONTEST: ${config.cabrilloId}\n`)
      expect(result.content).toContain(`QSO: 14033 CW 2026-09-21 1301 ${line}\n`)
      expect(result.content.match(/^QSO:/gm)).toHaveLength(1)
      expect(result.content).not.toContain('599')
      expect(await adifFields.fieldsForOneQSO({ operation, qso }, ctx)).toContainEqual({
        name: 'CONTEST_ID',
        value: config.adifId,
      })
    }
  })
  it('delegates contest ADIF using the extension key and guards against recursion', async () => {
    const invoke = vi
      .spyOn(hooks, 'invokeOne')
      .mockResolvedValue([{ key: 'adif', ok: true, value: { content: '<eoh>\n<eor>' } }])
    const { exports } = createExports(sst, sstManifest)
    const args = { operation: sstOperation, qsos: [baseQso], exportType: 'contest-adif' }
    expect((await exports.generateExport(args, ctx)).content).toBe('<eoh>\n<eor>')
    expect(invoke).toHaveBeenCalledWith(
      'export',
      'adif',
      'generateExport',
      expect.objectContaining({ mainHandler: 'n1rwj-sst', exportType: 'adif' }),
    )
    expect(await exports.generateExport({ ...args, exportType: 'adif' }, ctx)).toEqual({
      filename: '',
      mimeType: '',
      content: '',
    })
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
