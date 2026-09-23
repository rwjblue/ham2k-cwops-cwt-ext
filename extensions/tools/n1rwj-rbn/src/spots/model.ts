// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MPL-2.0

import type { Spot } from '@ham2k/extension-sdk'
import { isValidReceiver, receiverLocation } from '../data/parser.ts'
import { isValidCall, normalizeCall } from '../model.ts'

export const maxAgeMs = 10 * 60_000
export const bands = [
  { name: '160m', low: 1800, high: 2000 },
  { name: '80m', low: 3500, high: 4000 },
  { name: '40m', low: 7000, high: 7300 },
  { name: '30m', low: 10100, high: 10150 },
  { name: '20m', low: 14000, high: 14350 },
  { name: '17m', low: 18068, high: 18168 },
  { name: '15m', low: 21000, high: 21450 },
  { name: '12m', low: 24890, high: 24990 },
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
    if (
      typeof raw.callsign !== 'string' ||
      !['CW', 'RTTY', 'FT8', 'FT4'].includes(String(raw.mode))
    )
      continue
    const call = normalizeCall(raw.callsign)
    const freq = raw.frequency
    const band =
      typeof freq === 'number' && Number.isFinite(freq)
        ? bands.find(({ low, high }) => freq >= low && freq <= high)
        : undefined
    const time = typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : NaN
    if (
      !isValidCall(call) ||
      !band ||
      !Number.isFinite(time) ||
      time > now ||
      time < now - maxAgeMs
    )
      continue
    const sourceInfo: NonNullable<Spot['spot']['sourceInfo']> = {}
    if (typeof raw.spotter !== 'string' || !isValidReceiver(normalizeCall(raw.spotter))) continue
    sourceInfo.spotter = normalizeCall(raw.spotter)
    if (receiverLocation(raw.spotter_grid)[0] !== null)
      sourceInfo.spotterGrid = String(raw.spotter_grid).trim().toUpperCase()
    if (typeof raw.snr === 'number' && Number.isFinite(raw.snr)) sourceInfo.snr = raw.snr
    if (typeof raw.wpm === 'number' && Number.isFinite(raw.wpm)) sourceInfo.wpm = raw.wpm
    spots.push({
      their: { call },
      freq: freq as number,
      band: band.name,
      mode: String(raw.mode),
      spot: { timeInMillis: time, source, sourceInfo },
    })
  }
  return spots
}

export interface ReceiverSelection {
  skimmers: string[]
  grids: string[]
}
export type ReceiverLookup = (call: string) => { grid: string | null } | undefined

/** Filter receivers before collapsing duplicate station reports. */
export function selectSpots(
  reports: readonly Spot[],
  allowedCalls: ReadonlySet<string> | undefined,
  receivers: ReceiverSelection,
  lookup: ReceiverLookup,
  now: number,
): Spot[] {
  const latest = new Map<string, Spot>()
  for (const report of reports) {
    if (report.spot.timeInMillis < now - maxAgeMs || report.spot.timeInMillis > now) continue
    if (allowedCalls && !allowedCalls.has(report.their.call)) continue
    const info = report.spot.sourceInfo ?? {}
    const receiver = String(info.spotter ?? '')
    if (receivers.skimmers.length && !receivers.skimmers.includes(receiver)) continue
    const grid = lookup(receiver)?.grid ?? String(info.spotterGrid ?? '')
    if (receivers.grids.length && !receivers.grids.some((prefix) => grid.startsWith(prefix)))
      continue
    const key = `${report.their.call}:${report.band}:${report.mode}`
    const previous = latest.get(key)
    if (!previous || report.spot.timeInMillis > previous.spot.timeInMillis) {
      latest.set(key, {
        ...report,
        spot: { ...report.spot, sourceInfo: { ...info, spotterGrid: grid } },
      })
    }
  }
  return [...latest.values()].sort((a, b) => b.spot.timeInMillis - a.spot.timeInMillis)
}
