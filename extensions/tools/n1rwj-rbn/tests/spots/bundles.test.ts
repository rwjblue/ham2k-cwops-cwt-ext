import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type {
  DataFileDefinition,
  DynamicSettingsPanel,
  ExtensionDefinition,
  JSONValue,
  RegisterHookParams,
  SpotsHook,
} from '@ham2k/extension-sdk'
import { expect, it, vi } from 'vitest'
import manifest from '../../manifest.json'

/** Actual bundles, separate SDK copies, the documented kernel dispatch boundary. */
async function harness(saved: Record<string, JSONValue> = {}, contests = ['cwt', 'mst', 'sst']) {
  const preferences: Record<string, JSONValue> = structuredClone(saved)
  const definitions: ExtensionDefinition[] = []
  const registered = new Map<string, Map<string, RegisterHookParams>>()
  const sharedModules = Object.fromEntries(
    await Promise.all(
      Object.keys(manifest.sharedDependencies).map(async (name) => {
        const module = await import(name)
        return [name, name === 'i18next' ? module.default : module]
      }),
    ),
  )
  const requests = vi.fn(async (url: string) => ({
    status: 200,
    body: JSON.stringify({
      spots:
        new URL(url).searchParams.get('band') === '20m'
          ? ['K1ABC/P', 'W9NEW', 'N2SST'].map((callsign) => ({
              callsign,
              spotter: 'KM3T-5',
              spotter_grid: 'FN42',
              mode: 'CW',
              frequency: 14032,
              timestamp: new Date(Date.now() - 60_000).toISOString(),
            }))
          : [],
    }),
  }))
  const context = createContext({
    __polo: {
      sharedModules,
      defineExtension: (definition: ExtensionDefinition) => definitions.push(definition),
      invokeLocal: async (
        category: string,
        method: string,
        args: unknown,
        online: boolean,
        key?: string,
      ) => {
        const results = []
        for (const [extension, categories] of registered) {
          const registration = categories.get(category)
          if (!registration || (key && key !== (registration.key ?? extension))) continue
          const hookKey = registration.key ?? extension
          try {
            const hook = registration.hook as Record<
              string,
              (args: unknown, ctx: unknown) => unknown
            >
            results.push({
              key: hookKey,
              ok: true,
              value: await hook[method](args, { online, locale: 'en' }),
            })
          } catch (error) {
            results.push({ key: hookKey, ok: false, error: String(error) })
          }
        }
        return results
      },
    },
  })
  runInContext('delete Object.hasOwn', context)
  for (const path of ['tools/n1rwj-rbn', ...contests.map((name) => `contests/n1rwj-${name}`)]) {
    runInContext(
      await readFile(new URL(`../../../../${path}/build/index.js`, import.meta.url), 'utf8'),
      context,
      { timeout: 5000 },
    )
  }
  for (const definition of definitions) {
    const categories = new Map<string, RegisterHookParams>()
    registered.set(definition.key, categories)
    definition.onActivation({
      registerHook: (category, hook) => {
        categories.set(category, hook)
      },
      hostCall: async (method, params) => {
        if (method === 'getSettings') return { extensions: preferences }
        if (method === 'setSettings') {
          const key = `extension_${definition.key}`
          preferences[key] = {
            ...((preferences[key] as Record<string, JSONValue>) ?? {}),
            ...(params.values as Record<string, JSONValue>),
          }
          return null
        }
        if (method === 'kvGet' || method === 'kvSet') return null
        if (method === 'fetch') return requests(String(params.url))
        throw new Error(`Unexpected host call: ${method}`)
      },
    })
  }
  function hook<T>(key: string, category: string): T {
    const entry = registered.get(key)?.get(category)
    if (!entry) throw new Error(`Missing ${category} from ${key}`)
    return entry.hook as T
  }
  const spots = hook<SpotsHook>('n1rwj-rbn', 'spots')
  const settings = hook<DynamicSettingsPanel>('n1rwj-rbn', 'settingsPanel')
  const ctx = { online: true, locale: 'en' }
  return {
    preferences,
    requests,
    registered,
    hook,
    spots,
    settings,
    fetch: () => spots.fetchSpots({}, ctx),
    choose: (value: string) =>
      settings.onChangeField(
        { panelKey: 'n1rwj-rbn', fieldKey: 'spotCallFilter', value, state: {} },
        ctx,
      ),
    load: (contest: string, body: string) =>
      hook<DataFileDefinition>(`n1rwj-${contest}`, 'dataFile').onLoadRawData?.({
        schema: 1,
        body,
        url: 'https://n1mm.hamdocs.com/history.txt',
        fetchedAt: new Date().toISOString(),
      }),
  }
}

it('RBN discovers all three contest bundles, defaults to CWT and respects removal and explicit all calls across restarts', async () => {
  const runtime = await harness()
  expect(runtime.spots.sourceName).toBe('RBN')
  expect(await runtime.fetch()).toEqual([])
  expect(runtime.requests).not.toHaveBeenCalled()
  expect(runtime.preferences['extension_n1rwj-rbn']).toEqual({ spotCallFilter: 'n1rwj-cwt' })
  const form = await runtime.settings.getDefinition({ panelKey: 'n1rwj-rbn' }, { online: true })
  expect(JSON.stringify(form)).toContain('MST call-history file')
  expect(JSON.stringify(form)).toContain('SST call-history file')
  runtime.load('cwt', '#CWOPS\n!!Order!!,Call,Name,Exch1\nK1ABC,Al,1234\n')
  const [first, second] = await Promise.all([runtime.fetch(), runtime.fetch()])
  expect(first).toEqual(second)
  expect(first.map((spot) => spot.their.call)).toEqual(['K1ABC/P'])
  expect(first[0]).toMatchObject({ freq: 14032, spot: { source: 'n1rwj-rbn' } })
  expect(first[0].refs).toBeUndefined()
  expect(runtime.requests).toHaveBeenCalledTimes(9)
  await runtime.hook<DataFileDefinition>('n1rwj-cwt', 'dataFile').onRemoveRawData?.()
  expect(await runtime.fetch()).toEqual([])
  const missing = await harness(runtime.preferences, [])
  expect(await missing.fetch()).toEqual([])
  expect(missing.requests).not.toHaveBeenCalled()
  await runtime.choose('none')
  expect(await runtime.fetch()).toHaveLength(3)
  const restarted = await harness(runtime.preferences)
  expect(await restarted.fetch()).toHaveLength(3)
  expect(restarted.preferences['extension_n1rwj-rbn']).toEqual({ spotCallFilter: 'none' })
})

it('MST and SST select cached membership through the same bundled contract', async () => {
  const runtime = await harness()
  runtime.load('mst', '#ICWC-MST\n!!Order!!,Call,Name,Misc\nW9NEW,Pat,123\n')
  runtime.load('sst', '#K1USNSST\n!!Order!!,Call,Name,Exch1\nN2SST,Jo,MA\n')
  await runtime.choose('n1rwj-mst')
  expect((await runtime.fetch()).map((spot) => spot.their.call)).toEqual(['W9NEW'])
  await runtime.choose('n1rwj-sst')
  expect((await runtime.fetch()).map((spot) => spot.their.call)).toEqual(['N2SST'])
  expect(runtime.requests).toHaveBeenCalledTimes(9)
  runtime.registered.delete('n1rwj-sst')
  expect(await runtime.fetch()).toEqual([])
})

it('RBN runs alone; adding CWT later supplies a default unless the operator selected all', async () => {
  const runtime = await harness({}, [])
  expect(await runtime.fetch()).toHaveLength(3)
  expect(runtime.preferences['extension_n1rwj-rbn']).toBeUndefined()
  const added = await harness(runtime.preferences)
  expect(await added.fetch()).toEqual([])
  const optedOut = await harness({ 'extension_n1rwj-cwt': { spotsHistoryOnly: false } })
  expect(await optedOut.fetch()).toHaveLength(3)
})

it('persists geography settings, needs directory continents, and rejects stale origin edits', async () => {
  const runtime = await harness({}, [])
  const edit = (fieldKey: string, value: JSONValue) =>
    runtime.settings.onChangeField(
      { panelKey: 'n1rwj-rbn', fieldKey, value, state: {} },
      { online: true },
    )
  await expect(edit('spotRadiusMiles', 100)).rejects.toThrow('origin')
  await edit('spotRadiusGrid', ' fn42 ')
  await edit('spotRadiusMiles', '100')
  await edit('spotContinents', ['NA', 'NA'])
  expect(runtime.preferences['extension_n1rwj-rbn']).toEqual({
    spotRadiusGrid: 'FN42',
    spotRadiusMiles: 100,
    spotContinents: ['NA'],
  })
  const restored = await harness(runtime.preferences, [])
  expect(await restored.fetch()).toEqual([]) // Unknown continent is excluded.
  restored.hook<DataFileDefinition>('n1rwj-rbn', 'dataFile').onLoadRawData?.({
    schema: 1,
    nodes: [{ call: 'KM3T-5', grid: 'FN42', country: 'United States', continent: 'NA' }],
  })
  expect(await restored.fetch()).toHaveLength(3)
  const form = await restored.settings.getDefinition({ panelKey: 'n1rwj-rbn' }, { online: true })
  expect(form.elements).toContainEqual(
    expect.objectContaining({ key: 'spotContinents', fieldType: 'multiselect', value: ['NA'] }),
  )
  expect(form.elements).toContainEqual(
    expect.objectContaining({ key: 'spotRadiusMiles', value: 100 }),
  )
  await expect(edit('spotRadiusGrid', '')).rejects.toThrow('origin')
  await edit('spotRadiusMiles', '')
  await edit('spotRadiusGrid', '')
  await edit('spotContinents', [])
  expect(await runtime.fetch()).toHaveLength(3)
  // Form state can be stale: queue revalidation prevents concurrent writes
  // from leaving an enabled radius with a cleared origin.
  await edit('spotRadiusGrid', 'FN42')
  const results = await Promise.allSettled([
    edit('spotRadiusMiles', 10),
    edit('spotRadiusGrid', ''),
  ])
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
})
