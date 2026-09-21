import { describe, expect, it } from 'vitest'
import { parseRbnMetadata, parseRbnPayload } from '../../src/data/parser.ts'
import { metadata, NOW, payload } from './fixtures.ts'

const schema = parseRbnMetadata(metadata)
const parse = (value: unknown) => parseRbnPayload(value, schema, 'N1RWJ', 30, NOW)

describe('RBN website data parsing', () => {
  it('preserves suffixed skimmer IDs and uses their exact receiver metadata', () => {
    const reports = parse(
      payload({
        spots: {
          '1': ['KM3T-5', '7034.0', 'N1RWJ', 25, 24, '', 0, 12, 1, 1, NOW / 1000 - 60],
          '2': ['W1NT-6', '7034.0', 'N1RWJ', 17, 24, '', 0, 12, 1, 1, NOW / 1000 - 60],
        },
        call_info: {
          'KM3T-5': ['K', 'United States', 'NA', 'us', '8', '5', '42.8', '-71.6'],
          'W1NT-6': ['K', 'United States', 'NA', 'us', '8', '5', '43.1', '-71.1'],
          KM3T: ['K', 'United States', 'NA', 'us', '8', '5', '40', '-75'],
        },
      }),
    ).reports
    expect(
      reports.map(({ receiver, receiverLatitude, receiverLongitude }) => ({
        receiver,
        receiverLatitude,
        receiverLongitude,
      })),
    ).toEqual([
      { receiver: 'KM3T-5', receiverLatitude: 42.8, receiverLongitude: -71.6 },
      { receiver: 'W1NT-6', receiverLatitude: 43.1, receiverLongitude: -71.1 },
    ])
  })

  it('rejects malformed or unbounded receiver suffixes', () => {
    for (const receiver of ['KM3T-', 'KM3T-1-2', 'KM3T-123456789', 'KM3T-<script>']) {
      expect(
        parse(
          payload({
            spots: {
              '1': [receiver, '7034.0', 'N1RWJ', 25, 24, '', 0, 12, 1, 1, NOW / 1000 - 60],
            },
          }),
        ).reports,
      ).toEqual([])
    }
  })

  it('reads the documented metadata ordering and receiver coordinates', () => {
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
          receiverLatitude: 39.2,
          receiverLongitude: -76.8,
          country: 'United States',
        },
      ],
    })
  })

  it('honors reordered metadata and numeric strings', () => {
    const changed = { ...metadata, spot_fields: [...metadata.spot_fields].reverse() }
    const source = payload()
    const row = (source.spots as Record<string, unknown[]>)['123']
    source.spots = { '123': [...row].reverse() }
    expect(
      parseRbnPayload(source, parseRbnMetadata(changed), 'N1RWJ', 30, NOW).reports[0].receiver,
    ).toBe('W3LPL')
  })

  it('never guesses receiver coordinates from the callsign prefix or watched station', () => {
    const reports = parse(
      payload({
        call_info: {
          K: ['K', 'United States', 'NA', 'us', '8', '5', '39.2', '-76.8'],
          N1RWJ: ['K', 'United States', 'NA', 'us', '8', '5', '40', '-75'],
        },
      }),
    ).reports
    expect(reports[0].receiverLatitude).toBeNull()
    expect(reports[0].receiverLongitude).toBeNull()
  })

  it('keeps unknown measurements unknown and rejects partial coordinates', () => {
    const data = payload()
    const row = (data.spots as Record<string, unknown[]>)['123']
    row[3] = ''
    row[4] = -1
    data.call_info = { W3LPL: ['K', 'United States', 'NA', 'us', '8', '5', '39.2', ''] }
    expect(parse(data).reports[0]).toMatchObject({
      snrDb: null,
      wpm: null,
      receiverLatitude: null,
      receiverLongitude: null,
    })
  })

  it('accepts zero latitude, longitude, and SNR as real measurements', () => {
    const data = payload()
    const row = (data.spots as Record<string, unknown[]>)['123']
    row[3] = 0
    data.call_info = { W3LPL: ['K', 'United States', 'NA', 'us', '8', '5', 0, 0] }
    expect(parse(data).reports[0]).toMatchObject({
      snrDb: 0,
      receiverLatitude: 0,
      receiverLongitude: 0,
    })
  })

  it('keeps all modes, including new metadata names and unrecognized mode codes', () => {
    const source = parseRbnMetadata({
      ...metadata,
      modes: { ...metadata.modes, '101': { mode: 'new-mode' } },
    })
    const original = (payload().spots as Record<string, unknown[]>)['123']
    const codes = [1, 10, 11, 34, 45, 101, 102, 103]
    const spots = Object.fromEntries(
      codes.map((code, index) => {
        const row = [...original]
        row[9] = code
        return [String(index), row]
      }),
    )
    const reports = parseRbnPayload(payload({ spots }), source, 'N1RWJ', 30, NOW).reports
    expect(reports.map(({ mode, wpm }) => ({ mode, wpm }))).toEqual([
      { mode: 'CW', wpm: 20 },
      { mode: 'PSK31', wpm: null },
      { mode: 'RTTY', wpm: null },
      { mode: 'FT8', wpm: null },
      { mode: 'FT4', wpm: null },
      { mode: 'NEW-MODE', wpm: null },
      { mode: 'Mode 102', wpm: null },
      { mode: 'Mode 103', wpm: null },
    ])
  })

  it('does not require CW in the mode metadata', () => {
    expect(parseRbnMetadata({ ...metadata, modes: { '34': { mode: 'ft8' } } }).modes).toEqual({
      '34': 'FT8',
    })
  })

  it('filters mismatched calls, expired reports, and future reports in every mode', () => {
    const original = (payload().spots as Record<string, unknown[]>)['123']
    const other = [...original]
    other[2] = 'N1RWJ/P'
    const expired = [...original]
    expired[10] = NOW / 1000 - 1801
    const future = [...original]
    future[10] = NOW / 1000 + 301
    for (const mode of [1, 10, 11, 34, 45]) {
      for (const row of [other, expired, future]) row[9] = mode
      expect(parse(payload({ spots: { a: other, b: expired, c: future } })).reports).toEqual([])
    }
  })

  it('treats the server normal empty response as no reports', () => {
    expect(parse({ now: NOW / 1000, ver_h: 'example', lastid_c: 12 }).reports).toEqual([])
  })

  it('distinguishes unsupported schemas and server errors from empty results', () => {
    expect(() =>
      parseRbnMetadata({ ...metadata, spot_fields: ['something', 'different'] }),
    ).toThrow('unsupported')
    expect(() => parse({})).toThrow('unsupported')
    expect(() => parse({ now: NOW / 1000, spots: { '123': { call: 'N1RWJ' } } })).toThrow(
      'unsupported',
    )
    expect(() => parse({ error: 888, ver_h: 'new' })).toThrow('unsupported')
  })

  it('caps report processing and discloses the possible truncation', () => {
    expect(parseRbnPayload(payload(), schema, 'N1RWJ', 30, NOW, 1)).toMatchObject({ capped: true })
  })
})
