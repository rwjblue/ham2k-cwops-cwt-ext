import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type {
  ExportHook,
  ExtensionDefinition,
  HookContext,
  RegisterHookParams,
  ScoringHook,
} from '@ham2k/extension-sdk'
import { expect, test } from 'vitest'
import manifest from '../manifest.json'

// Exercise the actual distributable in the ES2020 sandbox, with host-provided
// libraries. Source-hook tests alone would miss a packaging or bridge mistake.
test('the temporary bundle registers cqww and scores/exports RTTY without host IO', async () => {
  const sharedModules = Object.fromEntries(
    await Promise.all(
      Object.keys(manifest.sharedDependencies).map(async (name) => {
        const module = await import(name)
        return [name, name === 'i18next' ? module.default : module]
      }),
    ),
  )
  const definitions: ExtensionDefinition[] = []
  const hooks = new Map<string, RegisterHookParams>()
  const context = createContext({
    __polo: {
      sharedModules,
      defineExtension: (definition: ExtensionDefinition) => definitions.push(definition),
    },
  })
  runInContext('delete Object.hasOwn', context)
  runInContext(await readFile(new URL('../build/index.js', import.meta.url), 'utf8'), context, {
    timeout: 5000,
  })
  expect(definitions).toHaveLength(1)
  const definition = definitions[0]
  if (!definition) throw new Error('Missing extension')
  expect(definition.key).toBe('n1rwj-cqww')
  await definition.onActivation({
    hostCall: async () => {
      throw new Error('Unexpected host IO')
    },
    registerHook: (category, params) => {
      hooks.set(category, params)
    },
  })
  expect([...hooks.keys()].sort()).toEqual([...manifest.hooks].sort())
  expect([...hooks.values()].every((hook) => hook.key === 'n1rwj-cqww')).toBe(true)
  const ref = { type: 'cqww', mode: 'RTTY', zone: '5', qth: 'MA' }
  const operation = { stationCall: 'N1RWJ', refs: [ref] }
  const qso = {
    uuid: 'one',
    band: '20m',
    mode: 'RTTY',
    freq: 14085,
    startAtMillis: Date.UTC(2026, 8, 26, 12),
    their: { call: 'W1AW' },
    refs: [{ type: 'cqww', theirZone: '5', theirQth: 'CT' }],
  }
  const ctx: HookContext = { online: false, locale: 'en' }
  const scoring = hooks.get('scoring')?.hook as ScoringHook
  const result = await scoring.scoreQsos({ operation, ref, qsos: [qso] }, ctx)
  expect(result.operationSummary.cqww.total).toBe(3)
  const exporter = hooks.get('export')?.hook as ExportHook
  const file = await exporter.generateExport(
    { operation, qsos: [qso], exportType: 'cqww-cabrillo' },
    ctx,
  )
  expect(file.content).toContain('RY 2026-09-26 1200 N1RWJ 599 05 MA W1AW 599 05 CT')
})
