import { expect, it } from 'vitest'
import { latestBy, type ReceptionReport, receptionKey, receptionView } from '../src/reports.ts'

const report: ReceptionReport = {
  id: '1',
  transmitter: { call: 'N1RWJ' },
  receiver: { call: 'W1AW', location: { latitude: 42, longitude: -72, source: 'provider' } },
  frequencyHz: 14030000,
  band: '20m',
  mode: 'CW',
  timeMs: 1000,
  snrDb: 0,
}

it('deduplicates complete directed links rather than merging different transmitters', () => {
  const reports = [
    report,
    { ...report, id: '2', timeMs: 2000, snrDb: -5 },
    { ...report, transmitter: { call: 'N1RWJ/P' } },
    { ...report, mode: 'FT8' },
    { ...report, band: '40m' },
    { ...report, receiver: { call: 'CU3AT' } },
  ]
  expect(latestBy(reports, receptionKey)).toHaveLength(5)
  const view = receptionView(reports, 'N1RWJ', 'outgoing', 3000)
  expect(view.rows).toHaveLength(4)
  expect(view.rows[0]).toMatchObject({ call: 'W1AW', snrDb: -5 })
  expect(view.stations).toHaveLength(1)
})

it('orients the remote endpoint while keeping unlocated stations and receiver SNR', () => {
  const incoming = receptionView([report], 'W1AW', 'incoming', 3000)
  expect(incoming.rows[0]).toMatchObject({ call: 'N1RWJ', snrDb: 0, frequencyKhz: 14030 })
  expect(incoming.rows[0].distanceKm).toBeUndefined()
  expect(incoming.stations).toEqual([])
  expect(receptionView([report], 'N1RWJ/P', 'outgoing', 3000).rows).toEqual([])
})

it('does not restore an older location when the newest station report is unlocated', () => {
  const unlocated = { ...report, id: '2', timeMs: 2000, band: '40m', receiver: { call: 'W1AW' } }
  const view = receptionView([report, unlocated], 'N1RWJ', 'outgoing', 3000)
  expect(view.rows).toHaveLength(2)
  expect(view.stations).toEqual([])
})
