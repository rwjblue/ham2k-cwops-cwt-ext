import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import type {
  ActivityHook,
  DataFileDefinition,
  ExtensionDefinition,
  RegisterHookParams,
  ScoringHook,
} from '@ham2k/extension-sdk'
import { describe, expect, it } from 'vitest'
import mstManifest from '../../../extensions/contests/n1rwj-mst/manifest.json'
import sstManifest from '../../../extensions/contests/n1rwj-sst/manifest.json'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing required bundle hook or method')
  return value
}

for (const manifest of [mstManifest, sstManifest]) {
  const type = manifest.shortName.toLowerCase()
  const historyText =
    type === 'mst'
      ? '# ICWC-MST\n!!Order!!,Call,Name,Misc\nK1ABC,BOB,123\n'
      : '# K1USNSST\n!!Order!!,Call,Name,Exch1\nK1ABC,BOB,MA\n'
  async function harness() {
    const source = await readFile(
      new URL(`../../../extensions/contests/${manifest.key}/build/index.js`, import.meta.url),
      'utf8',
    )
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
    required(definitions[0]).onActivation({
      registerHook: (category, hook) => registered.set(category, hook),
      hostCall: async (method) => {
        throw new Error(`Unexpected host call ${method}`)
      },
    })
    return { registered, definition: required(definitions[0]) }
  }
  describe(`${manifest.key} packaged sandbox`, () => {
    it('registers every declared hook and scoring scope without Node/DOM globals', async () => {
      const { registered, definition } = await harness()
      expect(definition.key).toBe(manifest.key)
      expect(definition.version).toBe(manifest.version)
      expect([...registered.keys()].sort()).toEqual([...manifest.hooks].sort())
      expect(registered.get('dataFile')?.key).toBe(`${manifest.key}_history`)
      expect(registered.get('scoring')?.hook).toMatchObject({ scope: { refTypes: [type] } })
    })
    it('replays a last-good offline file and keeps it after a failed refresh', async () => {
      const { registered } = await harness()
      const dataFile = required(registered.get('dataFile')).hook as DataFileDefinition
      const activity = required(registered.get('activity')).hook as ActivityHook
      const operation = { refs: [{ type }], stationCall: 'N1RWJ' }
      const qso = { their: { call: 'K1ABC' } }
      const ctx = { online: false }
      const snapshot = {
        schema: 1,
        body: historyText,
        url: 'https://n1mm.hamdocs.com/history.txt',
        fetchedAt: '2026-09-21T12:00:00Z',
      }
      dataFile.onLoadRawData?.(JSON.parse(JSON.stringify(snapshot)))
      const controls = await required(activity.loggingControls)({ operation, qso }, ctx)
      expect(controls.find((row) => row.key.endsWith('/name'))?.input).toMatchObject({
        suggestedValue: 'BOB',
      })
      if (type === 'mst')
        expect(controls.find((row) => row.key.endsWith('/theirSerial'))?.input).not.toHaveProperty(
          'suggestedValue',
        )
      else
        expect(controls.find((row) => row.key.endsWith('/location'))?.input).toMatchObject({
          suggestedValue: 'MA',
        })
      await expect(
        required(dataFile.rawToJSONData)({
          body: 'not call history',
          url: snapshot.url,
          options: {},
        }),
      ).rejects.toThrow()
      expect(
        (await required(activity.loggingControls)({ operation, qso }, ctx)).find((row) =>
          row.key.endsWith('/name'),
        )?.input,
      ).toMatchObject({ suggestedValue: 'BOB' })
      await dataFile.onRemoveRawData?.()
      expect(
        (await required(activity.loggingControls)({ operation, qso }, ctx)).find((row) =>
          row.key.endsWith('/name'),
        )?.input,
      ).toMatchObject({ suggestedValue: ' ' })
    })
    it('scores a batch, resumes a serialized checkpoint and detects a same-band duplicate', async () => {
      const { registered } = await harness()
      const scorer = required(registered.get('scoring')).hook as ScoringHook
      const operation = { uuid: 'sandbox-op', refs: [{ type }], stationCall: 'N1RWJ' }
      const qso = {
        uuid: 'qso-1',
        their: { call: 'K1ABC' },
        band: '20m',
        mode: 'CW',
        startAtMillis: Date.parse('2026-09-21T13:00:00Z'),
        refs: [{ type, name: 'BOB', location: 'MA', theirSerial: '1' }],
      }
      const result = await scorer.scoreQsos({ operation, qsos: [qso] }, { online: false })
      expect(result.operationSummary[type]).toMatchObject({ points: 1, mults: 1, total: 1 })
      const resumed = await scorer.scoreQsos(
        {
          operation,
          qsos: [{ ...qso, uuid: 'qso-2', startAtMillis: qso.startAtMillis + 1000 }],
          resumeFrom: JSON.parse(JSON.stringify(result.scoresheet)),
        },
        { online: false },
      )
      expect(resumed.qsoScores['qso-2']).toMatchObject({ value: 0, dupe: true })
    })
  })
}
