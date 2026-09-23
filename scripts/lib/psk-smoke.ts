import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type { ExtensionDefinition, PanelHook } from '@ham2k/extension-sdk'
import { environment } from '../../packages/reception/tests/environment.ts'
import type { Manifest } from './extensions.ts'

/** Exercises the selected SDK's actual binary bridge in a timerless VM.
 * This stand-in for the host is not a native Ham2K runtime test.
 */
export async function verifyPskBundle(path: string, manifest: Manifest) {
  const definitions: ExtensionDefinition[] = []
  const calls: { method: string; params: Record<string, unknown> }[] = []
  let listener: ((event: Record<string, unknown>) => void) | undefined
  let panel: PanelHook | undefined
  const sharedModules = Object.fromEntries(
    await Promise.all(
      Object.keys(manifest.sharedDependencies ?? {}).map(async (name) => {
        const module = await import(name)
        return [name, name === 'i18next' ? module.default : module]
      }),
    ),
  )
  runInContext(
    await readFile(path, 'utf8'),
    createContext({
      __polo: {
        sharedModules,
        defineExtension: (definition: ExtensionDefinition) => definitions.push(definition),
        registerSocket: (callback: typeof listener) => {
          listener = callback
          return 1
        },
        log: (message: string) => {
          throw new Error(message)
        },
      },
    }),
    { timeout: 5000 },
  )
  assert.equal(definitions.length, 1)
  assert.ok('api' in definitions[0])
  assert.equal(definitions[0].api, 2)
  definitions[0].onActivation({
    registerHook: (category, registration) => {
      assert.equal(category, 'panel')
      panel = registration.hook as PanelHook
    },
    hostCall: async (method, params) => {
      calls.push({ method, params })
      return null
    },
  })
  assert.ok(panel)
  const args = {
    panelKey: 'psk-reporter',
    instanceId: 'smoke',
    environment: environment(),
    operation: { stationCall: 'N1RWJ', grid: 'FN42' },
    qsoCount: 0,
    config: {},
    reason: 'operation' as const,
  }
  await panel.render(args, { online: true })
  assert.deepEqual(
    calls.map((call) => call.method),
    ['webSocketOpen'],
  )
  assert.equal(calls[0].params.url, 'wss://mqtt.pskreporter.info:1886')
  assert.equal(JSON.stringify(calls[0].params.protocols), '["mqtt"]')
  assert.ok(listener)
  listener({ type: 'open', protocol: 'mqtt' })
  const sent = () =>
    calls
      .filter((call) => call.method === 'webSocketSend')
      .map((call) => Buffer.from(String(call.params.binary), 'base64'))
  assert.equal(sent()[0][0], 0x10)
  const receive = (bytes: number[]) =>
    listener?.({ type: 'message', binary: Buffer.from(bytes).toString('base64') })
  receive([0x20, 2, 0, 0])
  assert.equal(sent()[1][0], 0x82)
  assert.ok(sent()[1].includes(Buffer.from('pskr/filter/v2/+/+/N1RWJ/#')))
  receive([0x90, 3, 0, 1, 0])
  const topic = Buffer.from('pskr/filter/v2/20m/FT8/N1RWJ/CU3AT/FN42/HM68/291/149')
  const payload = Buffer.from(
    JSON.stringify({
      sc: 'N1RWJ',
      rc: 'CU3AT',
      sl: 'FN42',
      rl: 'HM68',
      f: 14074000,
      md: 'FT8',
      b: '20m',
      t: Math.floor(Date.now() / 1000),
      rp: -12,
    }),
  )
  const body = [topic.length >> 8, topic.length & 255, ...topic, ...payload]
  const length: number[] = []
  let remaining = body.length
  do {
    const byte = remaining % 128
    remaining = Math.floor(remaining / 128)
    length.push(byte | (remaining ? 128 : 0))
  } while (remaining)
  receive([0x30, ...length, ...body])
  const rendered = JSON.stringify(await panel.render(args, { online: true }))
  assert.ok(rendered.includes('Live reception'))
  assert.ok(rendered.includes('CU3AT'))
  await panel.render(args, { online: false })
  assert.equal(sent()[sent().length - 1][0], 0xe0)
  assert.equal(calls[calls.length - 1].method, 'webSocketClose')
  console.log(
    'Candidate SDK bundle smoke passed: socket grant, MQTT handshake, binary report, native scene, disconnect.',
  )
}
