import type { HookContext, JSONValue, LoggingControlDescriptor } from '@ham2k/extension-sdk'
import { describe, expect, it, vi } from 'vitest'
import { AdifFieldsHook, ExportHook } from '../../src/cwt/index.ts'
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
  it('displays the same normalized first name that CWT saves and exports', async () => {
    const { activity } = await setup('!!Order!!,Call,Name,Exch1\nK1ABC,  Hiram Percy  ,1234')
    const controls = await activity.loggingControls(
      { operation, qso: { their: { call: 'K1ABC' } } },
      ctx,
    )
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'HIRAM' })
  })
  it.each([
    ['K1ABC', 'AL', '4567'],
    ['K2ABC', 'BOB', 'CWA'],
    ['K3ABC', 'CARL', 'PA'],
  ])('round-trips %s through controls, save, ADIF and Cabrillo', async (call, name, number) => {
    const { activity } = await setup()
    const ui = new Controls()
    const qso: Qson = {
      uuid: 'new',
      their: { call },
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

  it('clears stale untouched suggestions on a callsign with no exchange, without guessing state', async () => {
    const { activity } = await setup()
    const ui = new Controls()
    ui.apply(await activity.loggingControls({ operation, qso: { their: { call: 'K1ABC' } } }, ctx))
    const unknown = await activity.loggingControls(
      { operation, qso: { their: { call: 'W9ZZZ', guess: { state: 'WI' } }, refs: ui.refs() } },
      ctx,
    )
    expect(unknown[1]?.input).toMatchObject({ suggestedValue: EMPTY_SUGGESTION, placeholder: 'WI' })
    ui.apply(unknown)
    expect(ui.refs()).toEqual([{ type: 'cwt' }])
  })

  it('does not treat an unrelated contest exchange as a CWT number', async () => {
    const { activity } = await setup()
    const controls = await activity.loggingControls(
      { operation, qso: { their: { call: 'K4ABC', exchange: 'DAN CT', guess: { state: 'CT' } } } },
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
    expect(controls[1]?.input).toMatchObject({ suggestedValue: EMPTY_SUGGESTION })
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
      { operation, qso: { their: { call: 'K1ABC' } } },
      context,
    )
    expect(controls[0]?.input).toMatchObject({ suggestedValue: 'AL' })
    expect(controls[1]?.input).toMatchObject({ suggestedValue: '9876' })
    const notes = await prefill.lookup.lookupCall(
      { operation, qso: {}, callInfo: { call: 'K1ABC' } },
      context,
    )
    expect(notes[0]?.notes?.[0]).toContain(
      'name AL (selected-file); exchange 9876 (current-operation)',
    )
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
