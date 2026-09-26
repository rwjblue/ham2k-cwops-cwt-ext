import type {
  ExtensionDefinition,
  HookContext,
  JSONValue,
  RegisterHookParams,
} from '@ham2k/extension-sdk'
import { vi } from 'vitest'

const definitions = vi.hoisted(() => [] as ExtensionDefinition[])
vi.mock('@ham2k/extension-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@ham2k/extension-sdk')>()
  return {
    ...sdk,
    defineExtension: (definition: ExtensionDefinition) => definitions.push(definition),
  }
})

export function fixtureOperation(
  overrides: Record<string, JSONValue> = {},
): Record<string, JSONValue> {
  return { uuid: 'test-operation', stationCall: 'KI2D', refs: [], ...overrides }
}

// A test adapter for the published activation boundary, not SDK implementation.
export async function loadExtension(importer: () => Promise<unknown>) {
  await importer()
  const hooks = new Map<string, RegisterHookParams>()
  for (const definition of definitions) {
    await definition.onActivation({
      hostCall: async () => {
        throw new Error('Unexpected host call on offline logging path')
      },
      registerHook: (category, params) => {
        hooks.set(category, params)
      },
    })
  }
  return {
    async runHook(category: string, method: string, args: unknown): Promise<unknown> {
      const hook = hooks.get(category)?.hook as Record<string, unknown> | undefined
      const callback = hook?.[method]
      if (typeof callback !== 'function') throw new Error(`Missing ${category}.${method}`)
      const ctx: HookContext = { online: false, locale: 'en', appName: 'Ham2K Logger' }
      return callback(args, ctx)
    },
  }
}
