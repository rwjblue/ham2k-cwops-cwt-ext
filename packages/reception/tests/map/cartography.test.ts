import { describe, expect, it } from 'vitest'
import type { MapLabel, MapStation, ReceptionMapLayout } from '../../src/map/index.ts'
import { layoutReceptionMap } from '../../src/map/index.ts'

const theme = {
  surface: '#e4eff3',
  land: '#f6f4eb',
  text: '#183342',
  muted: '#637986',
  border: '#a2b6c0',
  accent: '#087c73',
}

const americanOrigin = { latitude: 27.73, longitude: -81.63, label: 'N1RWJ' }
const europeanOrigin = { latitude: 48.1, longitude: 11.6, label: 'DL1TEST' }

function receiver(key: string, latitude: number, longitude: number, ageMinutes = 1): MapStation {
  return { key, label: key, latitude, longitude, ageMinutes }
}

const northAmerica = [
  receiver('W3LPL', 39.35, -76.83),
  receiver('K3LR', 41.04, -80.5),
  receiver('N2QT', 37.35, -79.48),
  receiver('K1TTT', 42.64, -73.05),
  receiver('N1MM', 41.6, -72.88),
  receiver('W2RE', 42.76, -74.35),
  receiver('K1FC', 41.85, -71.49),
  receiver('K3WW', 40.27, -75.4),
  receiver('K9IMM', 43.28, -89.98),
  receiver('WA7LNW', 37.3, -113.62),
  receiver('VE3EJ', 43.16, -79.16),
  receiver('ZF1A', 19.31, -81.39),
]

const europe = [
  receiver('DL1A', 48.18, 11.19),
  receiver('DK0TE', 47.78, 9.61),
  receiver('OE3K', 48.3, 16.27),
  receiver('OL7M', 50.17, 16.3),
  receiver('S50A', 45.89, 14.81),
  receiver('HA1AG', 47.56, 17.45),
  receiver('HB9CA', 47.2, 8.58),
  receiver('F5IN', 47.96, 2.15),
  receiver('G4PVM', 51.75, 0.7),
  receiver('PA5KT', 51.6, 3.7),
  receiver('SM7IUN', 55.76, 13.22),
  receiver('IK4MGP', 44.18, 12.27),
]

function overlapsMarker(label: MapLabel, x: number, y: number): boolean {
  // The receiver's radius is 4.5 pixels; leave a small margin so native text
  // and its backing do not touch the visible marker outline.
  const clearance = 5
  return (
    label.x < x + clearance &&
    label.x + label.width > x - clearance &&
    label.y < y + clearance &&
    label.y + label.height > y - clearance
  )
}

function expectReadableLabels(map: ReceptionMapLayout): void {
  for (const label of map.labels) {
    expect(label.x, `${label.key} left`).toBeGreaterThanOrEqual(0)
    expect(label.y, `${label.key} top`).toBeGreaterThanOrEqual(0)
    expect(label.x + label.width, `${label.key} right`).toBeLessThanOrEqual(map.width)
    expect(label.y + label.height, `${label.key} bottom`).toBeLessThanOrEqual(map.height)
    for (const marker of map.markers) {
      expect(
        overlapsMarker(label, marker.x, marker.y),
        `${label.key} obscures receiver ${marker.key} in ${map.width}×${map.height}`,
      ).toBe(false)
    }
  }
}

describe('reception map cartography', () => {
  it('keeps receiver positions stable when resizing across the former compact breakpoint', () => {
    const base = { origin: americanOrigin, stations: northAmerica, theme }
    const before = layoutReceptionMap({ ...base, width: 419, height: 390 })
    const after = layoutReceptionMap({ ...base, width: 420, height: 390 })
    for (const marker of before.markers) {
      const next = after.markers.find((candidate) => candidate.key === marker.key)
      expect(next).toBeDefined()
      expect(Math.abs((next?.x ?? 0) - marker.x)).toBeLessThan(2)
      expect(Math.abs((next?.y ?? 0) - marker.y)).toBeLessThan(2)
    }
  })
  it('keeps labels in bounds and clear of crowded receivers at compact and desktop sizes', () => {
    for (const [origin, receivers] of [
      [americanOrigin, northAmerica],
      [europeanOrigin, europe],
    ] as const) {
      for (const width of [320, 424, 480, 720]) {
        const map = layoutReceptionMap({ width, height: 390, origin, stations: receivers, theme })
        expect(map.markers).toHaveLength(receivers.length)
        expect(map.labels.some((label) => label.key.startsWith('receiver-label:'))).toBe(true)
        expectReadableLabels(map)
      }
    }
  })

  it('does not abruptly add a desktop quantity of receiver labels around 420 pixels', () => {
    const receivers = Array.from({ length: 24 }, (_, index) =>
      receiver(`R${index + 1}`, 25 + Math.floor(index / 6) * 8, -125 + (index % 6) * 10),
    )
    const counts = [419, 420, 424].map(
      (width) =>
        layoutReceptionMap({
          width,
          height: 450,
          origin: americanOrigin,
          stations: receivers,
          theme,
        }).labels.filter((label) => label.key.startsWith('receiver-label:')).length,
    )
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
  })

  it('moves or omits a distance caption when a receiver lies along its north-axis position', () => {
    // Receivers near 1,000/2,000 km north of Florida occupy the old fixed ring
    // caption positions; western stations retain enough geographic context.
    const receivers = [
      receiver('NORTH1', 36.7, -80.7),
      receiver('NORTH2', 45.7, -79.9),
      receiver('WEST1', 36.7, -115),
      receiver('WEST2', 48, -123),
    ]
    for (const width of [320, 424, 720]) {
      const map = layoutReceptionMap({
        width,
        height: 390,
        origin: americanOrigin,
        stations: receivers,
        theme,
      })
      for (const label of map.labels.filter((label) => label.key.startsWith('ring:'))) {
        for (const marker of map.markers) {
          expect(
            overlapsMarker(label, marker.x, marker.y),
            `${label.key} obscures ${marker.key}`,
          ).toBe(false)
        }
      }
      expectReadableLabels(map)
    }
  })

  it('keeps scaled native map labels readable without pushing them outside a compact panel', () => {
    for (const labelScale of [1.3, 2, 4]) {
      for (const height of [180, 390]) {
        const map = layoutReceptionMap({
          width: 320,
          height,
          origin: europeanOrigin,
          stations: europe,
          theme,
          labelScale,
        })
        expectReadableLabels(map)
        if (labelScale > 1.4) {
          expect(map.labels.some((label) => label.key.startsWith('receiver-label:'))).toBe(false)
        }
      }
    }
  })

  it('reserves the empty-report message before placing ring and geographic captions', () => {
    for (const origin of [
      { latitude: 54.4, longitude: -2.12, label: 'G4TEST' },
      { latitude: 41.56, longitude: 21.56, label: 'Z3TEST' },
    ]) {
      for (const [width, height] of [
        [320, 180],
        [424, 390],
        [720, 390],
      ]) {
        const map = layoutReceptionMap({ width, height, origin, stations: [], theme })
        const message = map.labels.find((label) => label.key === 'no-receivers')
        expect(message).toBeDefined()
        if (!message) throw new Error('Missing empty-report message')
        for (const label of map.labels.filter((label) => label !== message)) {
          const overlaps =
            label.x < message.x + message.width &&
            label.x + label.width > message.x &&
            label.y < message.y + message.height &&
            label.y + label.height > message.y
          expect(overlaps, `${label.key} obscures the empty-report message`).toBe(false)
        }
      }
    }
  })
})
