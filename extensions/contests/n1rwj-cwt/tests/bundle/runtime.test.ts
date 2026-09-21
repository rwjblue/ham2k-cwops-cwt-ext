import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type {
  ActivityHook,
  AdifFieldsHook,
  DataFileDefinition,
  DynamicSettingsPanel,
  ExportHook,
  ExtensionDefinition,
  HookContext,
  JSONValue,
  RegisterHookParams,
  ScoringHook,
  ScoringScope,
} from '@ham2k/extension-sdk'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import manifest from '../../manifest.json'
import { DEFAULT_SOURCE } from '../../src/data/source'

type Qson = Record<string, JSONValue>
type HookTypes = {
  activity: ActivityHook
  adifFields: AdifFieldsHook
  dataFile: DataFileDefinition
  export: ExportHook
  settingsPanel: DynamicSettingsPanel
  scoring: ScoringHook & { scope: ScoringScope }
}
let bundle: string
let sharedModules: Record<string, unknown>

beforeAll(async () => {
  bundle = await readFile(new URL('../../build/index.js', import.meta.url), 'utf8')
  sharedModules = Object.fromEntries(
    await Promise.all(
      Object.keys(manifest.sharedDependencies).map(async (name) => {
        const module = await import(name)
        return [name, name === 'i18next' ? module.default : module]
      }),
    ),
  )
})

/** Runs the shipped IIFE, with only the published bridge and pinned libraries. */
function harness(settingsGroups: Record<string, Record<string, unknown>> = {}) {
  // Host KV belongs to this runtime only. Durable state lives in settings
  // or the native data-file JSON cache replayed by the host after startup.
  const storage = new Map<string, unknown>()
  const definitions: ExtensionDefinition[] = []
  const registered = new Map<string, RegisterHookParams>()
  const hostCall = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === 'getSettings') return structuredClone({ extensions: settingsGroups })
    if (method === 'setSettings') {
      if (!params.values || typeof params.values !== 'object' || Array.isArray(params.values)) {
        throw new Error('setSettings expects an object')
      }
      const group = `extension_${String(params.ns)}`
      settingsGroups[group] = { ...settingsGroups[group], ...params.values }
      return null
    }
    if (method === 'kvGet') return storage.get(String(params.key)) ?? null
    if (method === 'kvSet') {
      storage.set(String(params.key), params.value)
      return null
    }
    throw new Error(`Unexpected host call ${method}`)
  })
  const context = createContext({
    __polo: {
      sharedModules,
      defineExtension: (definition: ExtensionDefinition) => definitions.push(definition),
    },
  })
  runInContext(bundle, context, { filename: 'built-extension.js', timeout: 5000 })
  expect(definitions).toHaveLength(1)
  const definition = definitions[0]
  if (!definition) throw new Error('Bundle did not register its extension')
  definition.onActivation({
    hostCall,
    registerHook: (category, params) => registered.set(category, params),
  })
  return {
    definition,
    registered,
    hostCall,
    storage,
    settingsGroups,
    hook<K extends keyof HookTypes>(category: K): HookTypes[K] {
      const entry = registered.get(category)
      if (!entry) throw new Error(`Missing ${category} hook`)
      // The compiled registration is checked against its concrete hook contract
      // below, after TypeScript has checked the source registration itself.
      return entry.hook as HookTypes[K]
    },
  }
}

const operation: Qson = {
  uuid: 'bundle-test-operation',
  stationCall: 'N1RWJ',
  refs: [{ type: 'cwt', ref: '2026-08-26-1300', ourName: 'Rob', ourNumber: '1234', power: 'LP' }],
}
const ctx: HookContext = {
  online: false,
  locale: 'en',
  getHistoryForCall: async () => [],
  getQsos: async () => {
    throw new Error('Full log reads are forbidden on the logging path')
  },
}
const body = '#CWOPS\n!!Order!!,Call,Name,Exch1\nK1ABC,AL,4567\n'

describe('the installable bundle with a simulated host bridge', () => {
  it('registers the manifest identity and every declared hook without Node/DOM globals', () => {
    const runtime = harness()
    expect(runtime.definition.key).toBe('n1rwj-cwt')
    expect(runtime.definition.version).toBe(manifest.version)
    expect([...runtime.registered.keys()].sort()).toEqual([...manifest.hooks].sort())
    expect(runtime.registered.get('dataFile')?.key).toBe('n1rwj-cwt_history')
    expect(runtime.hook('scoring').scope).toEqual({ refTypes: ['cwt'] })
  })

  it('parses a file, suggests both controls, and exports the saved operator correction', async () => {
    const runtime = harness()
    const data = runtime.hook('dataFile')
    if (!data.rawToJSONData) throw new Error('Missing raw parser')
    const snapshot = await data.rawToJSONData({
      body,
      url: 'https://n1mm.hamdocs.com/cwops.txt',
      options: {},
    })
    data.onLoadRawData?.(snapshot)
    const qso: Qson = {
      their: { call: 'K1ABC' },
      band: '20m',
      freq: 14032.5,
      mode: 'CW',
      startAtMillis: Date.UTC(2026, 7, 26, 13, 5),
    }
    const activity = runtime.hook('activity')
    const controls = await activity.loggingControls?.({ operation, qso }, ctx)
    expect(controls?.map((control) => control.input)).toMatchObject([
      { field: 'name', suggestedValue: 'AL' },
      { field: 'number', suggestedValue: '4567' },
    ])

    // Native controls store the operator's final values on the CWT ref. This
    // models that documented boundary; it does not claim to test Flutter UI.
    const saved: Qson = { ...qso, refs: [{ type: 'cwt', name: 'ALAN', number: '7654' }] }
    const patch = await activity.processQsoBeforeSave?.({ operation, qso: saved }, ctx)
    expect(patch?.their).toEqual({ exchange: 'ALAN 7654' })
    const fields = await runtime
      .hook('adifFields')
      .fieldsForOneQSO?.({ operation, qso: saved }, ctx)
    expect(fields).toContainEqual({ name: 'SRX_STRING', value: 'ALAN 7654' })
    const exported = await runtime
      .hook('export')
      .generateExport({ operation, qsos: [saved], exportType: 'cabrillo' }, ctx)
    expect(exported.content).toContain('N1RWJ 599 ROB 1234 K1ABC 599 ALAN 7654')
    expect(runtime.hostCall.mock.calls.some(([method]) => method === 'fetch')).toBe(false)
  })

  it('retains the native disk cache after a corrupt refresh and replays it after restart', async () => {
    const first = harness()
    let diskCache = ''
    async function refresh(body: string) {
      const dataFile = first.hook('dataFile')
      const snapshot = await dataFile.rawToJSONData?.({
        body,
        url: 'https://n1mm.hamdocs.com/cwops.txt',
        options: {},
      })
      // DataFileManager writes the disk cache only after conversion succeeds.
      diskCache = JSON.stringify(snapshot)
      dataFile.onLoadRawData?.(snapshot)
    }
    await refresh(body)
    const validDiskCache = diskCache
    await expect(refresh('not a call-history dataset')).rejects.toThrow()
    expect(diskCache).toBe(validDiskCache)

    const restarted = harness()
    expect(restarted.storage.size).toBe(0)
    restarted.hook('dataFile').onLoadRawData?.(JSON.parse(diskCache))
    const controls = await restarted
      .hook('activity')
      .loggingControls?.({ operation, qso: { their: { call: 'K1ABC' } } }, ctx)
    expect(controls?.[1]?.input).toMatchObject({ field: 'number', suggestedValue: '4567' })
    expect(restarted.hostCall.mock.calls.every(([method]) => method === 'kvGet')).toBe(true)
  })

  it('persists the selected source in settings and resolves it on the next definition', async () => {
    const first = harness()
    const source = 'https://n1mmwp.hamdocs.com/mmfiles/cwops_3992-aaa-txt/'
    await first
      .hook('settingsPanel')
      .onChangeField(
        { panelKey: manifest.key, fieldKey: 'source', value: source, state: { source } },
        ctx,
      )
    expect(first.settingsGroups[`extension_${manifest.key}`]).toEqual({ source })
    const currentUrl = first.hook('dataFile').url
    expect(typeof currentUrl === 'function' ? await currentUrl({}, ctx) : currentUrl).toBe(source)
    const restarted = harness(first.settingsGroups)
    const url = restarted.hook('dataFile').url
    expect(typeof url === 'function' ? await url({}, ctx) : url).toBe(source)
    const definition = await restarted
      .hook('settingsPanel')
      .getDefinition({ panelKey: manifest.key }, ctx)
    expect(definition.elements).toContainEqual(
      expect.objectContaining({ key: 'source', value: source }),
    )
  })

  it('rejects local source edits without persisting them', async () => {
    const runtime = harness()
    const settings = runtime.hook('settingsPanel')
    const args = {
      panelKey: manifest.key,
      fieldKey: 'source',
      value: '/tmp/cwops.txt',
      state: { source: '/tmp/cwops.txt' },
    }
    expect(await settings.validateField?.(args, ctx)).toContain(
      'Local file paths are not supported',
    )
    await expect(settings.onChangeField(args, ctx)).rejects.toThrow(
      'Local file paths are not supported',
    )
    expect(runtime.settingsGroups).toEqual({})
  })

  it('keeps a legacy invalid source visible while allowing native cache replay and automatic discovery', async () => {
    const source = '/tmp/previously-accepted-cwops.txt'
    const runtime = harness({ [`extension_${manifest.key}`]: { source } })
    const dataFile = runtime.hook('dataFile')
    const snapshot = {
      schema: 1,
      body,
      url: DEFAULT_SOURCE,
      fetchedAt: '2026-09-19T15:33:12.600Z',
    }
    dataFile.onLoadRawData?.(snapshot)
    expect(typeof dataFile.url === 'function' ? await dataFile.url({}, ctx) : dataFile.url).toBe(
      DEFAULT_SOURCE,
    )
    const settings = await runtime
      .hook('settingsPanel')
      .getDefinition({ panelKey: manifest.key }, ctx)
    expect(settings.elements).toContainEqual(
      expect.objectContaining({ key: 'source', value: source }),
    )
    expect(settings.elements).toContainEqual(
      expect.objectContaining({
        text: expect.stringContaining('The saved source is unsupported.'),
      }),
    )
    const controls = await runtime
      .hook('activity')
      .loggingControls?.({ operation, qso: { their: { call: 'K1ABC' } } }, ctx)
    expect(controls?.[1]?.input).toMatchObject({ field: 'number', suggestedValue: '4567' })
    expect(runtime.settingsGroups[`extension_${manifest.key}`]).toEqual({ source })
  })
})
