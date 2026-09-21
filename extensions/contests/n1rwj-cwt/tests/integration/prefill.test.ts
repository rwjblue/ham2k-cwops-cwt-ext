import type { HookContext, JSONValue, LoggingControlDescriptor } from '@ham2k/extension-sdk'
import { contestScorer } from '@ham2k/extension-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActivityHook, AdifFieldsHook, CWTScorer, ExportHook } from '../../src/cwt/index.ts'
import { createFileCache } from '../../src/data/cache.ts'
import { createPrefill, EMPTY_SUGGESTION } from '../../src/integration/prefill.ts'

type Qson = Record<string, JSONValue>
const operation: Qson = {
  uuid: 'operation',
  stationCall: 'N1RWJ',
  refs: [{ type: 'cwt', ref: '2026-09-16-1300', ourName: 'ROB', ourNumber: '1234' }],
}
const ctx: HookContext = { online: false, locale: 'en' }
const file =
  '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,AL,4567\nK2ABC,BOB,CWA\nK3ABC,CARL,PA\nK4ABC,DAN,\n'

afterEach(() => vi.restoreAllMocks())

async function setup(body = file) {
  const cache = createFileCache({ read: async () => null, write: async () => {} })
  await cache.replace({
    schema: 1,
    body,
    url: 'file.txt',
    fetchedAt: '2026-09-19T15:00:00.000Z',
  })
  return createPrefill(cache)
}

// Contract model of halo logging_controls.dart at c726266: native fields track
// touched keys, apply nonempty suggestions only to untouched fields, trim on
// save, and persist intentional blanks. This is NOT a Flutter runtime test.
class Controls {
  values = new Map<string, string>()
  touched = new Set<string>()
  descriptors: LoggingControlDescriptor[] = []
  apply(descriptors: LoggingControlDescriptor[]) {
    this.descriptors = descriptors
    for (const descriptor of descriptors) {
      if (descriptor.input.kind !== 'text' || this.touched.has(descriptor.key)) continue
      const value = descriptor.input.suggestedValue
      if (value) this.values.set(descriptor.key, value)
    }
  }
  type(key: string, value: string) {
    this.values.set(key, value)
    this.touched.add(key)
  }
  refs(): Qson[] {
    const ref: Qson = { type: 'cwt' }
    for (const descriptor of this.descriptors) {
      if (descriptor.input.kind !== 'text') continue
      const value = this.values.get(descriptor.key)?.trim() ?? ''
      if (value || this.touched.has(descriptor.key)) ref[descriptor.input.field] = value
    }
    return [ref]
  }
}

describe('prefill to saved/exported CWT exchange', () => {
  it('retains a corrected saved exchange in native UUID-less controls and provenance lookups', async () => {
    const prefill = await setup('!!Order!!,Call,Name,Exch1\n# CWOPS\nK0ACP,Art,3806')
    // Native exported QSON carries operation.uuid; the native lookup and
    // logging-controls paths pass operation.data and omit that UUID.
    const nativeOperation: Qson = {
      stationCall: 'N1RWJ/TEST',
      userTitle: 'CWT extension validation (TEST)',
      createdAtMillis: 1789832158828,
      refs: [{ type: 'cwt', ref: '2026-09-23-1300', ourName: 'ROB', ourNumber: 'CWA' }],
    }
    const saved: Qson = {
      uuid: 'saved-contact',
      refs: [{ type: 'cwt', name: 'ARTHUR', number: '3806' }],
      their: { call: 'K0ACP', exchange: 'ARTHUR 3806' },
      our: { call: 'N1RWJ/TEST' },
      freq: 14046.45,
      band: '20m',
      mode: 'CW',
      startAtMillis: 1789832362350,
      updatedAtMillis: 1789832713139,
    }
    await prefill.scoring(contestScorer(CWTScorer, { scope: { refTypes: ['cwt'] } })).scoreQsos(
      {
        operation: {
          ...nativeOperation,
          uuid: 'native-operation',
          local: { operatorCall: 'N1RWJ' },
        },
        qsos: [saved],
      },
      ctx,
    )
    const context = { ...ctx, getHistoryForCall: async () => [saved], getQsos: vi.fn() }
    const controls = await prefill.activity.loggingControls(
      {
        operation: nativeOperation,
        qso: { their: { call: 'K0ACP' } },
      },
      context,
    )
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'ARTHUR' })
    expect(controls[1]?.input).toMatchObject({ suggestedValue: '3806' })
    const lookups = await prefill.lookup.lookupCall(
      { operation: nativeOperation, qso: {}, callInfo: { call: 'K0ACP' } },
      context,
    )
    expect(lookups[0]?.notes?.[0]).toContain(
      'name ARTHUR (current operation); exchange 3806 (current operation)',
    )
    expect(context.getQsos).not.toHaveBeenCalled()
  })

  it('displays the same normalized first name that CWT saves and exports', async () => {
    const { activity } = await setup('!!Order!!,Call,Name,Exch1\nK1ABC,  Hiram Percy  ,1234')
    const controls = await activity.loggingControls(
      { operation, qso: { their: { call: 'K1ABC' } } },
      ctx,
    )
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'HIRAM' })
  })

  it('only changes suggestions for the CWT name and number fields', async () => {
    const unrelated: LoggingControlDescriptor[] = [
      {
        key: 'other/name',
        label: 'Other name',
        input: { kind: 'text', refType: 'other', field: 'name', suggestedValue: 'OTHER' },
      },
      {
        key: 'cwt/note',
        label: 'Note',
        input: { kind: 'text', refType: 'cwt', field: 'note', suggestedValue: 'NOTE' },
      },
    ]
    const qso = { their: { call: 'K1ABC' } }
    const base = await ActivityHook.loggingControls({ operation, qso }, ctx)
    vi.spyOn(ActivityHook, 'loggingControls').mockResolvedValueOnce([...base, ...unrelated])
    const { activity } = await setup()
    const controls = await activity.loggingControls({ operation, qso }, ctx)
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'AL' })
    expect(controls[1]?.input).toMatchObject({ suggestedValue: '4567' })
    expect(controls.slice(2)).toEqual(unrelated)
  })
  it.each([
    ['K1ABC', 'AL', '4567'],
    ['K2ABC', 'BOB', 'CWA'],
    ['K3ABC', 'CARL', 'PA'],
    ['DL1ABC', 'HELMUT', 'DL'],
    ['W9ZZZ', 'HELMUT', 'WI'],
  ])('round-trips %s through controls, save, ADIF and Cabrillo', async (call, name, number) => {
    const { activity } = await setup()
    const ui = new Controls()
    const qso: Qson = {
      uuid: 'new',
      their: { call, guess: { name: 'Helmut', ...(call === 'W9ZZZ' ? { state: 'wi' } : {}) } },
      mode: 'CW',
      freq: 14030,
      band: '20m',
      startAtMillis: Date.UTC(2026, 8, 16, 13, 5),
    }
    ui.apply(await activity.loggingControls({ operation, qso }, ctx))
    const draft = { ...qso, refs: ui.refs() }
    const patch = await activity.processQsoBeforeSave({ operation, qso: draft }, ctx)
    const saved: Qson = { ...draft, ...patch, their: { call, ...(patch?.their as Qson) } }
    expect(saved.their).toMatchObject({ exchange: `${name} ${number}` })
    expect(await AdifFieldsHook.fieldsForOneQSO({ operation, qso: saved }, ctx)).toContainEqual({
      name: 'SRX_STRING',
      value: `${name} ${number}`,
    })
    const cabrillo = await ExportHook.generateExport(
      { operation, qsos: [saved], exportType: 'cabrillo' },
      ctx,
    )
    expect(cabrillo.content).toContain(`${call} 599 ${name} ${number}`)
  })

  it('preserves corrections and intentional blanks through delayed lookup and callsign correction', async () => {
    const { activity } = await setup()
    const ui = new Controls()
    ui.apply(await activity.loggingControls({ operation, qso: { their: { call: 'K1ABC' } } }, ctx))
    ui.type('cwt/name', 'ALLEN')
    ui.type('cwt/number', '')
    ui.apply(
      await activity.loggingControls(
        { operation, qso: { their: { call: 'K2ABC' }, refs: ui.refs() } },
        ctx,
      ),
    )
    expect(ui.refs()).toEqual([{ type: 'cwt', name: 'ALLEN', number: '' }])
    const saved = await activity.processQsoBeforeSave(
      { operation, qso: { their: { call: 'K2ABC', guess: { name: 'BOB' } }, refs: ui.refs() } },
      ctx,
    )
    expect(saved).toMatchObject({
      refs: [{ name: 'ALLEN', number: '' }],
      their: { exchange: 'ALLEN' },
    })
  })

  it('replaces stale suggestions with location fallback and clears them when no location exists', async () => {
    const { activity } = await setup()
    const ui = new Controls()
    ui.apply(await activity.loggingControls({ operation, qso: { their: { call: 'K1ABC' } } }, ctx))
    const unknown = await activity.loggingControls(
      { operation, qso: { their: { call: 'W9ZZZ', guess: { state: 'WI' } }, refs: ui.refs() } },
      ctx,
    )
    expect(unknown[1]?.input).toMatchObject({ suggestedValue: 'WI', placeholder: 'WI' })
    ui.apply(unknown)
    expect(ui.refs()).toEqual([{ type: 'cwt', number: 'WI' }])
    ui.apply(await activity.loggingControls({ operation, qso: { their: { call: '' } } }, ctx))
    expect(ui.refs()).toEqual([{ type: 'cwt' }])
  })

  it.each(['', '9999'])('protects operator exchange %j from location fallback', async (number) => {
    const { activity } = await setup()
    const ui = new Controls()
    ui.apply(await activity.loggingControls({ operation, qso: { their: { call: 'K1ABC' } } }, ctx))
    ui.type('cwt/number', number)
    const qso = { their: { call: 'W9ZZZ', guess: { state: 'WI' } } }
    ui.apply(await activity.loggingControls({ operation, qso }, ctx))
    expect(ui.refs()).toEqual([{ type: 'cwt', number }])
    const saved = await activity.processQsoBeforeSave(
      { operation, qso: { ...qso, refs: ui.refs() } },
      ctx,
    )
    expect(saved?.their).toEqual({ exchange: number })
  })

  it.each(['1234', 'CWA', 'TOO-LONG'])(
    'does not promote invalid location %s into an exchange',
    async (state) => {
      const { activity } = await setup()
      const controls = await activity.loggingControls(
        { operation, qso: { their: { call: 'W9ZZZ', guess: { state } } } },
        ctx,
      )
      expect(controls[1]?.input).toMatchObject({ suggestedValue: EMPTY_SUGGESTION })
    },
  )

  it('uses older CWT exchanges before location fallback for a file record with no exchange', async () => {
    const { activity } = await setup()
    const controls = await activity.loggingControls(
      { operation, qso: { their: { call: 'K4ABC', guess: { state: 'CT' } } } },
      {
        ...ctx,
        getHistoryForCall: async () => [
          { uuid: 'old', their: { call: 'K4ABC' }, refs: [{ type: 'cwt', number: '6789' }] },
        ],
      },
    )
    expect(controls[1]?.input).toMatchObject({ suggestedValue: '6789' })
  })

  it('does not treat an unrelated contest exchange as a CWT number', async () => {
    const { activity } = await setup()
    const controls = await activity.loggingControls(
      { operation, qso: { their: { call: 'K4ABC', exchange: 'DAN CT', guess: { state: 'WI' } } } },
      {
        ...ctx,
        getHistoryForCall: async () => [
          {
            uuid: 'old',
            their: { call: 'K4ABC' },
            refs: [{ type: 'naqp', name: 'DAN', exchange: 'CT' }],
          },
        ],
      },
    )
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'DAN' })
    expect(controls[1]?.input).toMatchObject({ suggestedValue: 'WI' })
  })

  it('resolves fields across current operation, file, then older CWT and reports provenance', async () => {
    const prefill = await setup()
    const current = {
      uuid: 'current',
      their: { call: 'K1ABC' },
      refs: [{ type: 'cwt', number: '9876' }],
    }
    const old = {
      uuid: 'old',
      their: { call: 'K1ABC' },
      refs: [{ type: 'cwt', name: 'OLD', number: '1111' }],
    }
    prefill.history.update({ operation, qsos: [current] })
    const context = { ...ctx, getHistoryForCall: async () => [current, old], getQsos: vi.fn() }
    const controls = await prefill.activity.loggingControls(
      { operation, qso: { their: { call: 'K1ABC', guess: { state: 'WI' } } } },
      context,
    )
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'AL' })
    expect(controls[1]?.input).toMatchObject({ suggestedValue: '9876' })
    for (const [locale, expected] of [
      [
        'en',
        'CWT: name AL (selected file); exchange 9876 (current operation); file date unknown, downloaded 2026-09-19',
      ],
      [
        'es',
        'CWT: nombre AL (archivo seleccionado); intercambio 9876 (operación actual); archivo fecha desconocida, descargado 2026-09-19',
      ],
    ]) {
      const notes = await prefill.lookup.lookupCall(
        { operation, qso: {}, callInfo: { call: 'K1ABC' } },
        { ...context, locale },
      )
      expect(notes[0]).toMatchObject({ source: 'n1rwj-cwt', notes: [expected] })
    }
    expect(context.getQsos).not.toHaveBeenCalled()
    expect(
      await prefill.lookup.lookupCall({ operation: {}, qso: {}, callInfo: { call: 'K1ABC' } }, ctx),
    ).toEqual([])
  })

  it('keeps concurrent callsign lookup answers scoped to their own request', async () => {
    const prefill = await setup()
    let finish: (value: Qson[]) => void = () => {}
    const pending = new Promise<Qson[]>((resolve) => {
      finish = resolve
    })
    const context = {
      ...ctx,
      getHistoryForCall: (call: string) => (call === 'K1ABC' ? pending : Promise.resolve([])),
    }
    const first = prefill.activity.loggingControls(
      { operation, qso: { their: { call: 'K1ABC' } } },
      context,
    )
    const second = await prefill.activity.loggingControls(
      { operation, qso: { their: { call: 'K2ABC' } } },
      context,
    )
    finish([])
    expect((await first)[1]?.input).toMatchObject({ suggestedValue: '4567' })
    expect(second[1]?.input).toMatchObject({ suggestedValue: 'CWA' })
  })
})
