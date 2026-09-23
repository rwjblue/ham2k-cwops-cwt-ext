import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type { ExtensionDefinition, PanelHook, RegisterHookParams } from '@ham2k/extension-sdk'
import { expect, it } from 'vitest'
import { environment } from '../../../../packages/reception/tests/environment.ts'
import manifest from '../manifest.json'

it('loads and renders the built preview in an ES2020-style sandbox without network calls', async () => {
  const source = await readFile(new URL('../build/index.js', import.meta.url), 'utf8')
  const sharedModules = Object.fromEntries(
    await Promise.all(
      Object.keys(manifest.sharedDependencies).map(async (name) => {
        const loaded = await import(name)
        return [name, name === 'i18next' ? loaded.default : loaded]
      }),
    ),
  )
  const definitions: ExtensionDefinition[] = []
  const registered = new Map<string, RegisterHookParams>()
  runInContext(
    source,
    createContext({
      __polo: {
        sharedModules,
        defineExtension: (definition: ExtensionDefinition) => definitions.push(definition),
      },
    }),
    { timeout: 5000 },
  )
  expect(definitions).toHaveLength(1)
  definitions[0].onActivation({
    registerHook: (category, hook) => registered.set(category, hook),
    hostCall: async (method) => {
      throw new Error(`Unexpected host call ${method}`)
    },
  })
  expect([...registered.keys()]).toEqual(['panel'])
  const panel = registered.get('panel')?.hook as PanelHook
  const content = await panel.render(
    {
      panelKey: 'psk-reporter',
      instanceId: 'preview',
      environment: environment(),
      operation: { stationCall: 'N1RWJ', grid: 'FN42' },
      qsoCount: 0,
      config: {},
      reason: 'operation',
    },
    { online: true },
  )
  expect(content.kind).toBe('svgScene')
  expect(JSON.stringify(content)).toContain('live reception not connected')
  expect(manifest.domains).toEqual([])
  expect(manifest).not.toHaveProperty('webSockets')
})

it.each(['n1rwj-rbn', 'n1rwj-psk-reporter'])('preserves shared map notices in %s', async (key) => {
  for (const path of [
    'MAP_ATTRIBUTION.md',
    'licenses/d3-geo-ISC.txt',
    'licenses/d3-array-ISC.txt',
    'licenses/internmap-ISC.txt',
    'licenses/atlas-MIT.txt',
  ]) {
    const bundled = await readFile(
      new URL(`../../${key}/build/assets/${path}`, import.meta.url),
      'utf8',
    )
    const shared = await readFile(
      new URL(`../../../../packages/reception/assets/${path}`, import.meta.url),
      'utf8',
    )
    expect(bundled).toBe(shared)
  }
})
