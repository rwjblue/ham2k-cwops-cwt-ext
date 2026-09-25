import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { verifyPskBundle } from '../../../../scripts/lib/psk-smoke.ts'
import manifest from '../manifest.json'

it('loads the normal API-2 bundle and receives binary MQTT reports through the published SDK', async () => {
  expect(manifest.api).toBe(2)
  expect(manifest.webSockets).toEqual(['mqtt.pskreporter.info'])
  expect(manifest.domains).toEqual(['retrieve.pskreporter.info'])
  await verifyPskBundle(fileURLToPath(new URL('../build/index.js', import.meta.url)), manifest)
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
