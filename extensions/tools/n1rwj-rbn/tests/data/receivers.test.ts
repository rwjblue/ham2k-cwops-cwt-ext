import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRbnPayload } from '../../src/data/parser.ts'
import {
  createReceiverData,
  parseReceiverDirectory,
  receiverDirectoryUrl,
} from '../../src/data/receivers.ts'
import { NOW, payload, spotPayload } from './fixtures.ts'

const directory = readFileSync(new URL('./receivers.txt', import.meta.url), 'utf8')
const reports = (receiver = 'VK6ANC', grid: string | null = 'FN31') =>
  parseRbnPayload(
    payload({ spots: [spotPayload({ spotter: receiver, spotter_grid: grid })] }),
    'N1RWJ',
    30,
    NOW,
  ).reports

function row(call: string, grid: string, country = 'Australia') {
  return `<tr><td><a title="show spots sent from this skimmer">${call}</a></td><td>15m</td><td>${grid}</td><td><a title="${country} - show spots from this dxcc">VK</a></td><td>OC</td><td>58</td><td>29</td><td>1 year ago</td><td>online</td></tr>`
}

async function refresh(data: ReturnType<typeof createReceiverData>, body = directory) {
  const snapshot = await data.dataFile.rawToJSONData({
    body,
    url: receiverDirectoryUrl,
    options: {},
  })
  // The host persists processed JSON, then loads it through this callback.
  data.dataFile.onLoadRawData(JSON.parse(JSON.stringify(snapshot)))
  return snapshot
}

describe('RBN receiver directory', () => {
  it('locates every receiver from the reported screenshot using verified directory locations', () => {
    expect(parseReceiverDirectory(directory).sort((a, b) => a.call.localeCompare(b.call))).toEqual([
      { call: 'BD8CS', grid: 'OM30BP', country: 'China' },
      { call: 'JJ2VLY', grid: 'PM95JG', country: 'Japan' },
      { call: 'KD7EFG', grid: 'DN31UO', country: 'United States' },
      { call: 'ND7K', grid: 'DM34OB', country: 'United States' },
      { call: 'VK6ANC', grid: 'OF78WE', country: 'Australia' },
      { call: 'ZL2KS', grid: 'RE68XQ', country: 'New Zealand' },
      { call: 'ZL3X', grid: 'RE66IR', country: 'New Zealand' },
    ])
  })

  it('normalizes text and grids, decodes entities, and preserves receiver suffixes', () => {
    expect(parseReceiverDirectory(row(' km3t-5 ', ' fn42 ', 'Trinidad &amp; Tobago'))).toEqual([
      { call: 'KM3T-5', grid: 'FN42', country: 'Trinidad & Tobago' },
    ])
    expect(
      parseReceiverDirectory(row('K1ABC/P', 'FN31', 'C&#244;te d&#39;Ivoire'))[0].country,
    ).toBe("Côte d'Ivoire")
  })

  it('rejects failures, changed columns, conflicting nodes and all-invalid grids', () => {
    for (const body of [
      '',
      '<html>Service unavailable</html>',
      '<tr><td>login</td></tr>',
      row('VK6ANC', 'OF78WE').replace('<td>15m</td>', ''),
      row('VK6ANC', 'ZZ99'),
      row('bad call', 'OF78WE'),
      row('VK6ANC', 'OF78WE') + row('VK6ANC', 'FN31'),
    ])
      expect(() => parseReceiverDirectory(body)).toThrow('Previous data retained')
  })

  it('prefers RBN coordinates, supplies countries and retains Vail fallback without mutation', async () => {
    const data = createReceiverData()
    const original = reports()
    expect(data.enrichReports(original)).toEqual(original)
    await refresh(data)
    expect(data.enrichReports(original)[0]).toMatchObject({ country: 'Australia' })
    expect(data.enrichReports(original)[0].receiverLatitude).toBeCloseTo(-31.8125)
    expect(data.enrichReports(original)[0].receiverLongitude).toBeCloseTo(115.875)
    expect(original[0]).toMatchObject({
      country: null,
      receiverLatitude: 41.5,
      receiverLongitude: -73,
    })
    expect(data.enrichReports(reports('W3LPL'))).toEqual(reports('W3LPL'))
    expect(data.enrichReports(reports('W3LPL', null))[0].receiverLatitude).toBeNull()
    await refresh(data, row('VK6ANC', 'OF78WE') + row('W3LPL', '', 'United States'))
    expect(data.enrichReports(reports('W3LPL'))[0]).toMatchObject({
      country: 'United States',
      receiverLatitude: 41.5,
    })
    expect(data.enrichReports(reports('VK6ANC-2', null))[0].receiverLatitude).toBeNull()
  })

  it('replays the cache offline, updates moved nodes, retains absent nodes, and removes on request', async () => {
    const first = createReceiverData()
    const saved = await refresh(first)
    const restarted = createReceiverData()
    restarted.dataFile.onLoadRawData(saved)
    expect(restarted.enrichReports(reports('ZL3X', null))[0].country).toBe('New Zealand')
    const updated = await refresh(restarted, row('VK6ANC', 'OF79WE'))
    expect(updated.nodes).toHaveLength(7)
    expect(restarted.enrichReports(reports())[0].receiverLatitude).toBeCloseTo(-30.8125)
    expect(restarted.enrichReports(reports('ZL3X', null))[0].country).toBe('New Zealand')
    await restarted.dataFile.onRemoveRawData()
    expect(restarted.enrichReports(reports())).toEqual(reports())
  })

  it('keeps good data when a refresh or saved snapshot fails validation', async () => {
    const data = createReceiverData()
    const saved = await refresh(data)
    const before = data.enrichReports(reports())
    await expect(refresh(data, '<html>Bad gateway</html>')).rejects.toThrow()
    for (const raw of [
      null,
      { ...saved, schema: 2 },
      { schema: 1, nodes: [] },
      { schema: 1, nodes: [{ call: 'VK6ANC', grid: 'ZZ99', country: 'Australia' }] },
      { schema: 1, nodes: [saved.nodes[0], saved.nodes[0]] },
    ])
      expect(() => data.dataFile.onLoadRawData(raw)).toThrow()
    expect(data.enrichReports(reports())).toEqual(before)
  })
})
