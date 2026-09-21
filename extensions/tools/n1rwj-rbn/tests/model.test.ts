import { describe, expect, it } from 'vitest'
import type { RbnReport } from '../src/model.ts'
import { bearingDegrees, distanceKm, latestReports, sortReports } from '../src/model.ts'

function report(overrides: Partial<RbnReport> = {}): RbnReport {
  return {
    id: '1',
    call: 'N1RWJ',
    receiver: 'W3LPL',
    frequencyKhz: 14060,
    band: '20m',
    mode: 'CW',
    snrDb: 20,
    wpm: 20,
    timeMs: 100_000,
    receiverLatitude: 39,
    receiverLongitude: -77,
    country: 'United States',
    ...overrides,
  }
}

describe('RBN report presentation model', () => {
  it('keeps latest report per receiver/band/mode, preserving separate bands and modes', () => {
    const strongOld = report({ id: 'old', snrDb: 50 })
    const weakNew = report({ id: 'new', snrDb: 10, timeMs: 110_000 })
    const otherBand = report({ id: '40', band: '40m' })
    const otherMode = report({ id: 'ft8', mode: 'FT8', timeMs: 105_000, wpm: null })
    expect(latestReports([strongOld, otherBand, otherMode, weakNew])).toEqual([
      weakNew,
      otherMode,
      otherBand,
    ])
  })

  it('sorts strongest first with unknown SNR last in either direction and preserves input', () => {
    const reports = [
      report({ id: 'a', snrDb: null }),
      report({ id: 'b', snrDb: 5 }),
      report({ id: 'c', snrDb: 20 }),
    ]
    expect(sortReports(reports, 'snr').map((value) => value.id)).toEqual(['c', 'b', 'a'])
    expect(sortReports(reports, 'snr', null, false).map((value) => value.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(reports.map((value) => value.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts recent reports first, supports receiver and frequency ordering', () => {
    const reports = [
      report({ id: 'a', receiver: 'ZL1ABC', timeMs: 90_000 }),
      report({ id: 'b', receiver: 'K1ABC', frequencyKhz: 7030 }),
    ]
    expect(sortReports(reports, 'age').map((value) => value.id)).toEqual(['b', 'a'])
    expect(sortReports(reports, 'receiver').map((value) => value.id)).toEqual(['b', 'a'])
    expect(sortReports(reports, 'frequency').map((value) => value.id)).toEqual(['b', 'a'])
  })

  it('calculates great-circle distances and bearings including the date line', () => {
    const a = { latitude: 0, longitude: 179 }
    const b = { latitude: 0, longitude: -179 }
    expect(distanceKm(a, b)).toBeCloseTo(222.39, 1)
    expect(bearingDegrees(a, b)).toBeCloseTo(90)
    expect(distanceKm(a, a)).toBe(0)
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(
      20_015,
      0,
    )
  })

  it('sorts by distance only when station and receiver coordinates exist', () => {
    const reports = [
      report({ id: 'a', receiverLatitude: null }),
      report({ id: 'b', receiverLatitude: 0, receiverLongitude: 1 }),
      report({ id: 'c', receiverLatitude: 0, receiverLongitude: 90 }),
    ]
    expect(
      sortReports(reports, 'distance', { latitude: 0, longitude: 0 }).map((value) => value.id),
    ).toEqual(['c', 'b', 'a'])
  })
})
