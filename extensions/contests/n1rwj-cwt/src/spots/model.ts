// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MPL-2.0

import type { Spot } from '@ham2k/extension-sdk'
import { callLookupKeys, isCallsign, normalizeCall } from '../history/callsign.ts'
import type { CallHistoryRecord } from '../history/types.ts'

export const maxAgeMs = 10 * 60_000
export const bands = [
  { name: '160m', low: 1800, high: 2000 },
  { name: '80m', low: 3500, high: 4000 },
  { name: '40m', low: 7000, high: 7300 },
  { name: '20m', low: 14000, high: 14350 },
  { name: '15m', low: 21000, high: 21450 },
  { name: '10m', low: 28000, high: 29700 },
] as const

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** A report is evidence of reception, never evidence of CWT participation. */
export function parseReports(rows: readonly unknown[], source: string, now: number): Spot[] {
  const spots: Spot[] = []
  for (const row of rows) {
    const raw = record(row)
    if (typeof raw.callsign !== 'string' || raw.mode !== 'CW') continue
    const call = normalizeCall(raw.callsign)
    const freq = raw.frequency
    const band =
      typeof freq === 'number' && Number.isFinite(freq)
        ? bands.find(({ low, high }) => freq >= low && freq <= high)
        : undefined
    const time = typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : NaN
    if (!isCallsign(call) || !band || !Number.isFinite(time) || time > now || time < now - maxAgeMs)
      continue
    const sourceInfo: NonNullable<Spot['spot']['sourceInfo']> = {}
    if (typeof raw.spotter === 'string') sourceInfo.spotter = raw.spotter
    if (typeof raw.snr === 'number' && Number.isFinite(raw.snr)) sourceInfo.snr = raw.snr
    if (typeof raw.wpm === 'number' && Number.isFinite(raw.wpm)) sourceInfo.wpm = raw.wpm
    spots.push({
      their: { call },
      freq: freq as number,
      band: band.name,
      mode: 'CW',
      spot: { timeInMillis: time, source, sourceInfo },
    })
  }
  return spots
}

/** Reapply the current file and clock even when the network snapshot is cached. */
export function selectSpots(
  reports: readonly Spot[],
  records: Readonly<Record<string, CallHistoryRecord>> | undefined,
  historyOnly: boolean,
  now: number,
): Spot[] {
  const latest = new Map<string, Spot>()
  for (const report of reports) {
    if (report.spot.timeInMillis < now - maxAgeMs || report.spot.timeInMillis > now) continue
    if (
      historyOnly &&
      !callLookupKeys(report.their.call).some((call) => records?.[call]?.call === call)
    )
      continue
    // Multiple receivers hear the same CQ. Keep the latest frequency per band;
    // retaining older frequencies would leave a moved station on the board twice.
    const key = `${report.their.call}:${report.band}`
    const previous = latest.get(key)
    if (!previous || report.spot.timeInMillis > previous.spot.timeInMillis) latest.set(key, report)
  }
  return [...latest.values()].sort((a, b) => b.spot.timeInMillis - a.spot.timeInMillis)
}
