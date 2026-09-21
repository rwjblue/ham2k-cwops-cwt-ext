// Copyright © 2026 N1RWJ CWT contributors
// SPDX-License-Identifier: MPL-2.0

import type { JSONValue } from '@ham2k/extension-sdk'
import { hooks } from '@ham2k/extension-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import manifest from '../../manifest.json'
import { ActivityHook } from '../../src/cwt/activity.ts'
import { AdifFieldsHook, ExportHook } from '../../src/cwt/exports.ts'
import { RefHandler } from '../../src/cwt/refs.ts'

const ctx = { online: false, locale: 'en' }
const operation = {
  stationCall: 'N1RWJ',
  refs: [{ type: 'cwt', ref: '2026-08-26-1300', ourName: 'Rob', ourNumber: '1234', power: 'LP' }],
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('upstream setup and exchange contracts', () => {
  it('preserves an older session when the setup form is opened later', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T14:00:00Z'))
    const controls = await ActivityHook.operationControls({ operation }, ctx)
    const input = controls[0]?.input
    expect(input?.kind).toBe('form')
    if (input?.kind !== 'form') throw new Error('Expected setup form')
    const field = input.form.elements[0]
    expect(field).toMatchObject({ key: 'ref', value: '2026-08-26-1300' })
    if (field?.type !== 'field') throw new Error('Expected session field')
    expect(field.options?.[0]).toEqual({ value: '2026-08-26-1300', label: '2026-08-26 1300z' })
  })

  it('suggests sessions on explicit search outside the automatic offer window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T14:00:00Z'))
    expect(await ActivityHook.suggest({ operation }, ctx)).toEqual([])
    const suggestions = await ActivityHook.suggest({ operation, searchTerm: 'CWT' }, ctx)
    expect(suggestions).toHaveLength(4)
    expect(suggestions[0]?.ref).toBe('2026-09-23-1300')
    const narrowed = await ActivityHook.suggest(
      { operation, searchTerm: '1300', scoped: true },
      ctx,
    )
    expect(narrowed).toHaveLength(1)
  })

  it('keeps name suggestions separate from a QTH placeholder', async () => {
    const controls = await ActivityHook.loggingControls(
      { operation, qso: { their: { call: 'W1AW', guess: { name: 'Hiram Percy', state: 'CT' } } } },
      ctx,
    )
    expect(controls[0]?.input).toMatchObject({ field: 'name', suggestedValue: 'HIRAM' })
    expect(controls[1]?.input).toMatchObject({ field: 'number', placeholder: 'CT' })
    expect(controls[1]?.input).not.toHaveProperty('suggestedValue')
    expect(await ActivityHook.loggingControls({ operation: {} }, ctx)).toEqual([])
  })

  it('saves typed exchange corrections and respects intentional clearing', async () => {
    const qso = {
      their: { guess: { name: 'Robert' } },
      refs: [{ type: 'cwt', name: 'bob', number: ' 2345 ' }],
    }
    expect(await ActivityHook.processQsoBeforeSave({ operation, qso }, ctx)).toEqual({
      refs: [{ type: 'cwt', name: 'BOB', number: '2345' }],
      their: { exchange: 'BOB 2345' },
    })
    expect(
      await ActivityHook.processQsoBeforeSave(
        { operation, qso: { ...qso, refs: [{ type: 'cwt', name: '', number: '' }] } },
        ctx,
      ),
    ).toEqual({ their: { exchange: '' } })
    expect(await ActivityHook.processQsoBeforeSave({ operation: {}, qso }, ctx)).toBeNull()
  })

  it('does not turn an unknown number into an intentional blank', async () => {
    expect(
      await ActivityHook.processQsoBeforeSave(
        { operation, qso: { their: { guess: { name: 'Bob' } } } },
        ctx,
      ),
    ).toEqual({
      refs: [{ type: 'cwt', name: 'BOB' }],
      their: { exchange: 'BOB' },
    })
  })

  it('decorates operation names without overwriting the sent exchange', async () => {
    const ref = await RefHandler.decorateRef({ ref: operation.refs[0] }, ctx)
    expect(ref.name).toBe('2026-08-26 1300z · ROB 1234')
    expect(ref.ourName).toBe('Rob')
    expect(
      await RefHandler.validateRef({ ref: { type: 'cwt', ref: '2026-08-25-1300' } }, ctx),
    ).toMatchObject({ valid: false })
  })
})

describe('CWT exports', () => {
  const qso: Record<string, JSONValue> = {
    their: { call: 'K1ABC' },
    band: '20m',
    freq: 14032.5,
    mode: 'CW',
    startAtMillis: Date.UTC(2026, 7, 26, 13, 5),
    refs: [{ type: 'cwt', name: 'AL', number: '4567' }],
  }

  it('emits the official contest tag and both halves from the saved ref', async () => {
    expect(await AdifFieldsHook.fieldsForOneQSO({ operation, qso }, ctx)).toEqual([
      { name: 'CONTEST_ID', value: 'CWOPS-CWT' },
      { name: 'STX_STRING', value: 'ROB 1234' },
      { name: 'SRX_STRING', value: 'AL 4567' },
    ])
    expect(await AdifFieldsHook.fieldsForOneQSO({ operation: {}, qso }, ctx)).toEqual([])
  })

  it.each(['CWA', 'CT', 'DL'])(
    'exports an explicitly known %s exchange unchanged',
    async (number) => {
      const fields = await AdifFieldsHook.fieldsForOneQSO(
        { operation, qso: { ...qso, refs: [{ type: 'cwt', name: 'AL', number }] } },
        ctx,
      )
      expect(fields).toContainEqual({ name: 'SRX_STRING', value: `AL ${number}` })
    },
  )

  it('writes Cabrillo exchanges, power, UTC time, and skips deleted/event rows', async () => {
    const result = await ExportHook.generateExport(
      {
        operation,
        qsos: [qso, { ...qso, deleted: true }, { band: 'event' }],
        exportType: 'cabrillo',
      },
      ctx,
    )
    expect(result.content).toContain('CONTEST: CWOPS-CWT\n')
    expect(result.content).toContain('CATEGORY-POWER: LOW\n')
    expect(result.content).toContain(
      'QSO: 14033 CW 2026-08-26 1305 N1RWJ 599 ROB 1234 K1ABC 599 AL 4567\n',
    )
    expect(result.content.match(/^QSO:/gm)).toHaveLength(1)
    expect(result.content).toMatch(/END-OF-LOG:\n$/)
    expect(result.filename).toContain('CWT-2026-08-26-1300')
  })

  it('offers session-specific matching filenames and refuses unknown export types', async () => {
    const options = await ExportHook.suggestExportOptions({ operation, qsos: [qso] }, ctx)
    const generated = await ExportHook.generateExport(
      { operation, qsos: [qso], exportType: 'cabrillo' },
      ctx,
    )
    expect(options.find((option) => option.exportType === 'cabrillo')?.filename).toBe(
      generated.filename,
    )
    expect(
      await ExportHook.generateExport({ operation, qsos: [qso], exportType: 'unknown' }, ctx),
    ).toEqual({ filename: '', mimeType: '', content: '' })
  })

  it('delegates ADIF to the host with this extension key and all export context', async () => {
    const invoke = vi
      .spyOn(hooks, 'invokeOne')
      .mockResolvedValue([{ key: 'adif', ok: true, value: { content: '<eoh>\n<eor>' } }])
    const args = {
      operation,
      qsos: [qso],
      exportType: 'contest-adif',
      segments: [{ fromMillis: 0, operation }],
      includePrivateData: true,
      includeLookupData: true,
      exportSettings: {},
      exportData: { name: 'Session log' },
      exportTitle: 'CWT',
    }
    const result = await ExportHook.generateExport(args, ctx)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('export', 'adif', 'generateExport', {
      ...args,
      exportType: 'adif',
      mainHandler: manifest.key,
      includeFieldsFrom: undefined,
    })
    expect(result.content).toBe('<eoh>\n<eor>')
  })
})
