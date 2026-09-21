import { describe, expect, it } from 'vitest'
import { parseRbnPayload } from '../../src/data/parser.ts'
import { NOW, payload, spotPayload } from './fixtures.ts'

const parse = (value: unknown) => parseRbnPayload(value, 'N1RWJ', 30, NOW)

describe('Vail ReRBN data parsing', () => {
  it('reads JSON spots and converts receiver grid centers without using the transmitter grid', () => {
    expect(parse(payload())).toEqual({
      capped: false,
      reports: [
        {
          id: '123',
          call: 'N1RWJ',
          receiver: 'W3LPL',
          frequencyKhz: 14060.1,
          band: '20m',
          mode: 'CW',
          snrDb: 19,
          wpm: 20,
          timeMs: NOW - 60_000,
          receiverLatitude: 39.5,
          receiverLongitude: -77,
          country: null,
        },
      ],
    })
  })

  it('preserves suffixed skimmer IDs and their distinct grid locations', () => {
    const reports = parse(
      payload({
        spots: [
          spotPayload({ id: 1, spotter: ' km3t-5 ', spotter_grid: ' fn42 ' }),
          spotPayload({ id: 2, spotter: 'W1NT-6', spotter_grid: 'FN43' }),
        ],
        total: 2,
      }),
    ).reports
    expect(
      reports.map(({ receiver, receiverLatitude, receiverLongitude }) => ({
        receiver,
        receiverLatitude,
        receiverLongitude,
      })),
    ).toEqual([
      { receiver: 'KM3T-5', receiverLatitude: 42.5, receiverLongitude: -71 },
      { receiver: 'W1NT-6', receiverLatitude: 43.5, receiverLongitude: -71 },
    ])
  })

  it('rejects malformed or unbounded receiver suffixes', () => {
    for (const spotter of ['KM3T-', 'KM3T-1-2', 'KM3T-123456789', 'KM3T-<script>']) {
      expect(parse(payload({ spots: [spotPayload({ spotter })] })).reports).toEqual([])
    }
  })

  it('accepts numeric measurement strings, zero SNR, and six/eight character grids', () => {
    const reports = parse(
      payload({
        spots: [
          spotPayload({ id: '1', frequency: '7074', snr: '0', wpm: '24', spotter_grid: 'fn31pr' }),
          spotPayload({ id: 2, frequency: 50313, spotter_grid: 'FN31pr12' }),
        ],
        total: 2,
      }),
    ).reports
    expect(reports[0]).toMatchObject({ band: '40m', snrDb: 0, wpm: 24 })
    expect(reports[0].receiverLatitude).toBeCloseTo(41.7291667)
    expect(reports[0].receiverLongitude).toBeCloseTo(-72.7083333)
    expect(reports[1].band).toBe('6m')
    expect(reports[1].receiverLatitude).toBeCloseTo(41.71875)
    expect(reports[1].receiverLongitude).toBeCloseTo(-72.7375)
  })

  it('keeps missing or invalid measurements and receiver locations unknown', () => {
    for (const spotter_grid of [undefined, null, '', 'ZZ99', 'FN31P', 'FN31ZZ', '0,0', 42]) {
      expect(
        parse(payload({ spots: [spotPayload({ spotter_grid, snr: '', wpm: -1 })] })).reports[0],
      ).toMatchObject({ snrDb: null, wpm: null, receiverLatitude: null, receiverLongitude: null })
    }
  })

  it('does not infer a band by reinterpreting kHz as MHz or choosing a nearby allocation', () => {
    const spots = [144, 12345, 136].map((frequency, index) =>
      spotPayload({ id: index + 1, frequency }),
    )
    expect(parse(payload({ spots, total: 3 })).reports.map(({ band }) => band)).toEqual(['2190m'])
  })

  it('preserves all modes and only uses CW WPM measurements', () => {
    const modes = ['CW', 'PSK31', 'RTTY', 'ft8', 'FT4', 'new-mode', null]
    const reports = parse(
      payload({
        spots: modes.map((mode, index) => spotPayload({ id: index + 1, mode })),
        total: modes.length,
      }),
    ).reports
    expect(reports.map(({ mode, wpm }) => ({ mode, wpm }))).toEqual([
      { mode: 'CW', wpm: 20 },
      { mode: 'PSK31', wpm: null },
      { mode: 'RTTY', wpm: null },
      { mode: 'FT8', wpm: null },
      { mode: 'FT4', wpm: null },
      { mode: 'NEW-MODE', wpm: null },
      { mode: 'Unknown', wpm: null },
    ])
  })

  it('exactly matches normalized callsigns and keeps portable suffixes distinct', () => {
    const data = payload({
      spots: ['N1RWJ', ' n1rwj/p ', 'N1RWJ/TEST', 'XN1RWJ', 'N1RWJ1'].map((callsign, index) =>
        spotPayload({ id: index + 1, callsign }),
      ),
      total: 5,
    })
    expect(parse(data).reports.map(({ call }) => call)).toEqual(['N1RWJ'])
    expect(parseRbnPayload(data, ' n1rwj/p ', 30, NOW).reports.map(({ call }) => call)).toEqual([
      'N1RWJ/P',
    ])
  })

  it('filters expired and implausibly future reports in every mode', () => {
    for (const mode of ['CW', 'PSK31', 'RTTY', 'FT8', 'FT4']) {
      const spots = [NOW - 1_800_001, NOW + 300_001].map((time, index) =>
        spotPayload({ id: index + 1, mode, timestamp: new Date(time).toISOString() }),
      )
      expect(parse(payload({ spots, total: spots.length })).reports).toEqual([])
    }
  })

  it('keeps the cutoff inclusive and sorts latest reports first', () => {
    const spots = [NOW - 1_800_000, NOW, NOW - 60_000].map((time, index) =>
      spotPayload({ id: index + 1, timestamp: new Date(time).toISOString() }),
    )
    expect(parse(payload({ spots, total: 3 })).reports.map(({ id }) => id)).toEqual(['2', '3', '1'])
  })

  it('skips malformed rows without dropping valid reports', () => {
    const spots = [
      null,
      [],
      {},
      spotPayload({ id: null }),
      spotPayload({ frequency: NaN }),
      spotPayload({ timestamp: '2026' }),
      spotPayload({ timestamp: '2026-99-99T99:99:99Z' }),
      spotPayload({ callsign: 12 }),
      spotPayload(),
    ]
    expect(parse(payload({ spots, total: spots.length })).reports).toHaveLength(1)
  })

  it('accepts an explicit empty response and distinguishes errors or schema changes', () => {
    expect(parse(payload({ spots: [], total: 0 }))).toEqual({ reports: [], capped: false })
    for (const value of [
      {},
      payload({ spots: {} }),
      payload({ spots: [{ other: true }] }),
      payload({ error: 'Database unavailable' }),
      payload({ total: -1 }),
      payload({ offset: '0' }),
      payload({ limit: 0 }),
    ]) {
      expect(() => parse(value)).toThrow('Vail ReRBN returned an unsupported data format.')
    }
  })

  it('reports truncation only when counts or defensive limits show omitted rows', () => {
    expect(parseRbnPayload(payload(), 'N1RWJ', 30, NOW, 1).capped).toBe(false)
    expect(parse(payload({ total: 501 })).capped).toBe(true)
    expect(parse(payload({ total: 501, offset: 500 })).capped).toBe(false)
    expect(
      parseRbnPayload(
        payload({ spots: [spotPayload(), spotPayload({ id: 124 })], total: 2 }),
        'N1RWJ',
        30,
        NOW,
        1,
      ),
    ).toMatchObject({ capped: true, reports: [expect.objectContaining({ id: '123' })] })
  })
})
