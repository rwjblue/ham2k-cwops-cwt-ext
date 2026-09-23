import { describe, expect, it } from 'vitest'
import type { MapStation, ReceptionMapOptions } from '../../src/map/index.ts'
import {
  isMapLocation,
  layoutReceptionMap,
  mapDistanceKm,
  renderReceptionMap,
} from '../../src/map/index.ts'

const theme = {
  surface: '#ffffff',
  land: '#dce9ed',
  text: '#162b38',
  muted: '#526e7f',
  border: '#94adb8',
  accent: '#087c73',
}
const origin = { latitude: 41.7, longitude: -72.1, label: 'N1RWJ' }
const stations: MapStation[] = [
  { key: 'w3lpl', label: 'W3LPL', latitude: 39.35, longitude: -76.83, ageMinutes: 2 },
  { key: 'k9lc', label: 'K9LC', latitude: 42.1, longitude: -88.2, ageMinutes: 8 },
  {
    key: 've6wz',
    label: 'VE6WZ',
    latitude: 51.1,
    longitude: -114.0,
    ageMinutes: 16,
    selected: true,
  },
  { key: 'g4pvm', label: 'G4PVM', latitude: 51.75, longitude: 0.7, ageMinutes: 4 },
]
const options: ReceptionMapOptions = { width: 720, height: 380, origin, stations, theme }

describe('reception map', () => {
  it('uses bundled geographic paths and places receivers inside the desktop viewport', () => {
    const map = layoutReceptionMap(options)
    expect(map.state).toBe('ready')
    expect(map.markers).toHaveLength(4)
    expect(map.svg).toContain('fill="#dce9ed"')
    expect(map.svg.length).toBeGreaterThan(4000)
    expect(map.svg).not.toMatch(/<text|<image|<script|NaN|Infinity/)
    for (const marker of map.markers) {
      expect(marker.x).toBeGreaterThan(15)
      expect(marker.x).toBeLessThan(705)
      expect(marker.y).toBeGreaterThan(15)
      expect(marker.y).toBeLessThan(365)
    }
    expect(map.labels.some((label) => label.text === 'VE6WZ')).toBe(true)
  })

  it('keeps 500 global receivers within native SVG layer limits without dropping reports', () => {
    const globalReceivers = Array.from({ length: 500 }, (_, index) => ({
      key: `receiver-${index}`,
      label: `R${index}`,
      latitude: -85 + ((index * 23) % 170),
      longitude: -179 + ((index * 71) % 358),
      ageMinutes: index % 30,
      selected: true,
    }))
    for (const [width, height] of [
      [320, 290],
      [1366, 768],
      [4096, 4096],
    ]) {
      const map = layoutReceptionMap({ ...options, width, height, stations: globalReceivers })
      expect(map.markers).toHaveLength(500)
      expect(map.svgLayers.length).toBeGreaterThan(1)
      expect(map.svgLayers.reduce((sum, svg) => sum + svg.length, 0)).toBeLessThan(1048576)
      for (const svg of map.svgLayers) {
        expect(svg.length).toBeLessThanOrEqual(262144)
        expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`)
        expect(svg).not.toMatch(
          /<(?:text|image|script|foreignObject|use)\b|<!DOCTYPE|<!ENTITY|NaN|Infinity/,
        )
        const definitions = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
        for (const match of svg.matchAll(/url\(#([^)]*)\)/g)) {
          expect(definitions.has(match[1])).toBe(true)
        }
      }
      expect(map.svgLayers[0].includes('fill="#dce9ed"')).toBe(true)
    }
  })

  it('lays out collision-free labels for a phone, without shrinking desktop type', () => {
    const map = layoutReceptionMap({ ...options, width: 320, height: 290 })
    expect(map.labels.every((label) => label.size >= 11)).toBe(true)
    const calls = map.labels.filter((label) => label.key.startsWith('receiver-label:'))
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.size).toBeGreaterThanOrEqual(11)
      expect(call.x).toBeGreaterThanOrEqual(0)
      expect(call.x + call.width).toBeLessThanOrEqual(320)
      expect(call.y + call.height).toBeLessThanOrEqual(290)
      for (const other of calls.filter((label) => label !== call)) {
        const overlaps =
          call.x < other.x + other.width &&
          call.x + call.width > other.x &&
          call.y < other.y + other.height &&
          call.y + call.height > other.y
        expect(overlaps).toBe(false)
      }
    }
    expect(renderReceptionMap({ ...options, width: 320, height: 290 })).toContain(
      'viewBox="0 0 320 290"',
    )
  })

  it('adds clipped regional divisions within native budgets and omits them at world scale', () => {
    const regionalReceivers = Array.from({ length: 500 }, (_, index) => ({
      key: `regional-${index}`,
      label: `R${index}`,
      latitude: 25 + (index % 25),
      longitude: -125 + (index % 55),
      ageMinutes: index % 30,
    }))
    for (const [width, height] of [
      [320, 390],
      [1280, 800],
      [4096, 4096],
    ]) {
      const map = layoutReceptionMap({ ...options, width, height, stations: regionalReceivers })
      expect(map.markers).toHaveLength(500)
      expect(map.svg.includes('admin-land-')).toBe(true)
      expect(map.svgLayers.reduce((sum, layer) => sum + layer.length, 0)).toBeLessThan(1048576)
      for (const layer of map.svgLayers) {
        expect(layer.length).toBeLessThanOrEqual(262144)
        const ids = new Set([...layer.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
        for (const match of layer.matchAll(/url\(#([^)]*)\)/g)) expect(ids.has(match[1])).toBe(true)
      }
    }
    const worldwide = layoutReceptionMap({
      ...options,
      stations: [
        { key: 'vk', label: 'VK', latitude: -33, longitude: 151, ageMinutes: 0 },
        { key: 'ja', label: 'JA', latitude: 35, longitude: 140, ageMinutes: 0 },
        { key: 'zs', label: 'ZS', latitude: -33, longitude: 18, ageMinutes: 0 },
      ],
    })
    expect(worldwide.svg.includes('admin-land-')).toBe(false)
  })

  it('reserves scaled native text space and removes crowded labels at large text sizes', () => {
    const normal = layoutReceptionMap({ ...options, width: 320, height: 290 })
    const scaled = layoutReceptionMap({ ...options, width: 320, height: 290, labelScale: 2 })
    const normalOrigin = normal.labels.find((label) => label.key === 'origin-label')
    const scaledOrigin = scaled.labels.find((label) => label.key === 'origin-label')
    expect(scaledOrigin?.size).toBe(normalOrigin?.size)
    expect(scaledOrigin?.height).toBe((normalOrigin?.height ?? 0) * 2)
    expect(scaled.labels.some((label) => /^(?:receiver-label:|ring:)/.test(label.key))).toBe(false)
    expect(scaled.svgLayers.join('').match(/fill-opacity="0.94"/g)).toHaveLength(1)
    for (const origin of [options.origin, undefined]) {
      for (const labelScale of [1, 1.3, 2, 4]) {
        const map = layoutReceptionMap({ ...options, width: 320, height: 180, origin, labelScale })
        for (const label of map.labels) {
          expect(label.x).toBeGreaterThanOrEqual(0)
          expect(label.y).toBeGreaterThanOrEqual(0)
          expect(label.x + label.width).toBeLessThanOrEqual(320)
          expect(label.y + label.height).toBeLessThanOrEqual(180)
        }
      }
    }
  })

  it('keeps the station centered in azimuthal mode and draws real distance rings', () => {
    const map = layoutReceptionMap({ ...options, projection: 'azimuthal' })
    // The map reserves a footer for attribution below its geographic viewport.
    expect(map.svg.includes('cx="360.00" cy="174.50" r="2"')).toBe(true)
    expect(map.labels.some((label) => label.key.startsWith('ring:'))).toBe(true)
    expect(map.svg).not.toMatch(/NaN|Infinity/)
    const regional = layoutReceptionMap({ ...options, projection: 'regional' })
    expect(regional.markers[0].x).not.toBeCloseTo(map.markers[0].x, 0)
    expect(regional.markers[0].y).not.toBeCloseTo(map.markers[0].y, 0)
  })

  it('fits distant receivers even in a short station-centered panel', () => {
    const map = layoutReceptionMap({
      ...options,
      width: 720,
      height: 180,
      projection: 'azimuthal',
      stations: [{ key: 'south', label: 'ZL1TEST', latitude: -40, longitude: 170, ageMinutes: 2 }],
    })
    expect(map.markers[0].y).toBeGreaterThan(10)
    expect(map.markers[0].y).toBeLessThan(170)
  })

  it('handles a receiver across the date line without zooming out to the world', () => {
    const map = layoutReceptionMap({
      ...options,
      origin: { latitude: 45, longitude: 179.8 },
      stations: [
        { key: 'dateline', label: 'KL7TEST', latitude: 46, longitude: -179.8, ageMinutes: 2 },
      ],
    })
    const marker = map.markers[0]
    expect(marker.x).toBeGreaterThan(300)
    expect(marker.x).toBeLessThan(420)
    expect(map.svg).not.toMatch(/NaN|Infinity/)
  })

  it('retains exact poles and degrades unknown or invalid coordinates explicitly', () => {
    expect(isMapLocation({ latitude: 90, longitude: 180 })).toBe(true)
    expect(isMapLocation({ latitude: 91, longitude: 0 })).toBe(false)
    expect(isMapLocation({ latitude: 0, longitude: Number.NaN })).toBe(false)
    const missing = layoutReceptionMap({ ...options, origin: undefined })
    expect(missing.state).toBe('no-origin')
    expect(missing.markers).toEqual([])
    expect(missing.labels.map((label) => label.text)).toContain('Set your operation location')
    const invalid = layoutReceptionMap({
      ...options,
      stations: [
        ...stations,
        { key: 'invalid', label: 'INVALID', latitude: 100, longitude: 0, ageMinutes: 1 },
      ],
    })
    expect(invalid.unmappedCount).toBe(1)
    expect(invalid.markers).toHaveLength(4)
    expect(
      layoutReceptionMap({ ...options, origin: { latitude: 90, longitude: 0 } }).svg,
    ).not.toMatch(/NaN|Infinity/)
  })

  it('does not invent a bearing for the station antipode', () => {
    const map = layoutReceptionMap({
      ...options,
      stations: [
        {
          key: 'antipode',
          label: 'TEST',
          latitude: -origin.latitude,
          longitude: origin.longitude + 180,
          ageMinutes: 1,
        },
      ],
    })
    expect(map.unmappedCount).toBe(1)
    expect(map.state).toBe('no-receivers')
    expect(map.svg).not.toMatch(/NaN|Infinity/)
  })

  it('escapes remote labels and rejects colors that could inject SVG attributes', () => {
    const svg = renderReceptionMap({
      ...options,
      origin: { ...origin, label: '<evil & "call">' },
      stations: [{ ...stations[0], label: '<script>&' }],
      theme: { ...theme, accent: 'red"/><script>bad()</script>' },
    })
    expect(svg).not.toContain('<evil')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;evil &amp; &quot;call&quot;&gt;')
    expect(svg).toContain('#72ded0')
  })

  it('clamps bad dimensions and reports empty reception without fabricating dots', () => {
    const map = layoutReceptionMap({ ...options, width: Number.NaN, height: -9, stations: [] })
    expect(map.width).toBe(640)
    expect(map.height).toBe(180)
    expect(map.state).toBe('no-receivers')
    expect(map.markers).toEqual([])
    expect(map.labels.some((label) => label.text === 'Waiting for receiver reports')).toBe(true)
    expect(map.svg).not.toMatch(/NaN|Infinity/)
  })

  it('uses spherical distances rather than flat map coordinates', () => {
    expect(mapDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111.195,
      2,
    )
    expect(mapDistanceKm(origin, origin)).toBe(0)
    expect(mapDistanceKm(origin, { latitude: 999, longitude: 0 })).toBeUndefined()
  })
})
