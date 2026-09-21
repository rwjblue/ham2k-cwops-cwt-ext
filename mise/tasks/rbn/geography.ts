#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Regenerate the compact Natural Earth boundaries and country labels bundled with RBN"
//[MISE] depends=["local-tasks-npm-install"]

import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

type Position = [number, number]
interface Feature {
  properties: Record<string, string | number | null>
  geometry:
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'MultiLineString'; coordinates: Position[][] }
    | null
}

const sourceRoot = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
const outputRoot = 'extensions/tools/n1rwj-rbn/src/map/'

async function source(name: string, expectedHash: string): Promise<Feature[]> {
  const response = await fetch(`${sourceRoot}${name}.geojson`, {
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status} ${name}`)
  const data = Buffer.from(await response.arrayBuffer())
  const actualHash = createHash('sha256').update(data).digest('hex')
  if (actualHash !== expectedHash) throw new Error(`Natural Earth source checksum changed: ${name}`)
  return (JSON.parse(data.toString('utf8')) as { features: Feature[] }).features
}

function pointKey(point: Position): string {
  return point.map((value) => value.toFixed(6)).join(',')
}

/** Join segments at degree-two endpoints, keeping administrative junctions intact. */
function joinedLines(lines: Position[][]): Position[][] {
  const endpoints = new Map<string, number[]>()
  for (const [index, line] of lines.entries()) {
    for (const point of [line[0], line[line.length - 1]]) {
      const key = pointKey(point)
      const edges = endpoints.get(key) ?? []
      edges.push(index)
      endpoints.set(key, edges)
    }
  }
  const visited = new Set<number>()
  const joined: Position[][] = []
  for (const [index, sourceLine] of lines.entries()) {
    if (visited.has(index)) continue
    visited.add(index)
    const line = [...sourceLine]
    for (let direction = 0; direction < 2; direction += 1) {
      while (true) {
        const key = pointKey(line[line.length - 1])
        const edges = endpoints.get(key) ?? []
        if (edges.length !== 2) break
        const next = edges.find((edge) => !visited.has(edge))
        if (next === undefined) break
        visited.add(next)
        const segment = pointKey(lines[next][0]) === key ? lines[next] : [...lines[next]].reverse()
        line.push(...segment.slice(1))
      }
      line.reverse()
    }
    joined.push(line)
  }
  return joined
}

function squaredDistance(point: Position, start: Position, end: Position): number {
  let [x, y] = start
  const dx = end[0] - x
  const dy = end[1] - y
  if (dx !== 0 || dy !== 0) {
    const fraction = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)
    if (fraction > 1) [x, y] = end
    else if (fraction > 0) {
      x += dx * fraction
      y += dy * fraction
    }
  }
  return (point[0] - x) ** 2 + (point[1] - y) ** 2
}

/** Douglas–Peucker in longitude/latitude degrees, preserving junction endpoints. */
function simplifiedLine(line: Position[]): Position[] {
  const retained = new Set([0, line.length - 1])
  const segments = [[0, line.length - 1]]
  while (segments.length > 0) {
    const [first, last] = segments.pop() as [number, number]
    let maximum = 0.1 ** 2
    let furthest = 0
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredDistance(line[index], line[first], line[last])
      if (distance > maximum) {
        maximum = distance
        furthest = index
      }
    }
    if (furthest > 0) {
      retained.add(furthest)
      segments.push([first, furthest], [furthest, last])
    }
  }
  return [...retained]
    .sort((left, right) => left - right)
    .map<Position>((index) => [
      Number(line[index][0].toFixed(2)),
      Number(line[index][1].toFixed(2)),
    ])
    .filter(
      (point, index, points) => index === 0 || pointKey(point) !== pointKey(points[index - 1]),
    )
}

const [boundaries, countries] = await Promise.all([
  source(
    'ne_10m_admin_1_states_provinces_lines',
    '1a1f30ccaaf4cc9c4bde34266f0b8cbb955d3a4cf254b756912255f2ec7c75b6',
  ),
  source(
    'ne_110m_admin_0_countries',
    '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
  ),
])
const lines = boundaries.flatMap(({ geometry }) => {
  if (!geometry) return []
  return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
})
const coordinates = joinedLines(lines)
  .map(simplifiedLine)
  .filter((line) => line.length > 1)
const labels = countries
  .map(({ properties }) => ({
    key: `country-${properties.ADM0_A3}`,
    label:
      String(properties.NAME_LONG).length <= 20
        ? String(properties.NAME_LONG)
        : String(properties.NAME),
    latitude: Number(Number(properties.LABEL_Y).toFixed(2)),
    longitude: Number(Number(properties.LABEL_X).toFixed(2)),
    kind: 'country',
    rank: Number(properties.LABELRANK),
  }))
  .sort((left, right) => left.rank - right.rank || left.key.localeCompare(right.key))

for (const [filename, value] of [
  ['admin1-boundaries.json', { type: 'MultiLineString', coordinates }],
  ['geographic-labels.json', labels],
] as const) {
  const data = `${JSON.stringify(value)}\n`
  await writeFile(`${outputRoot}${filename}`, data)
  console.log(`${filename}: ${data.length} bytes; ${gzipSync(data).length} gzip bytes`)
}
console.log(`${coordinates.length} boundary lines; ${labels.length} country label candidates`)
console.log('Run mise run format after regeneration.')
