import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type {
  DataFileDefinition,
  ExtensionDefinition,
  RegisterHookParams,
} from '@ham2k/extension-sdk'
import { expect, it } from 'vitest'
import manifest from '../manifest.json'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing bundle hook method')
  return value
}

it('registers and loads the weekly receiver data file in the packaged sandbox', async () => {
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
  expect([...registered.keys()].sort()).toEqual([...manifest.hooks].sort())
  const dataFile = registered.get('dataFile')?.hook as DataFileDefinition
  expect(dataFile).toMatchObject({ key: 'n1rwj-rbn_receivers', fetchType: 'raw', maxAgeInDays: 7 })
  const saved = await required(dataFile.rawToJSONData)({
    body: await readFile(new URL('./data/receivers.txt', import.meta.url), 'utf8'),
    url: String(dataFile.url),
    options: {},
  })
  expect(saved.nodes).toHaveLength(7)
  required(dataFile.onLoadRawData)(JSON.parse(JSON.stringify(saved)))
  await expect(
    required(dataFile.rawToJSONData)({
      body: 'Bad gateway',
      url: String(dataFile.url),
      options: {},
    }),
  ).rejects.toThrow()
  await required(dataFile.onRemoveRawData)()
})
