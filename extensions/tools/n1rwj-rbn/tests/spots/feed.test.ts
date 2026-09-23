// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MPL-2.0

import assert from 'node:assert/strict'
import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import { test } from 'vitest'
import { createSpotFeed } from '../../src/spots/feed.ts'
import { maxAgeMs, parseReports, selectSpots } from '../../src/spots/model.ts'

const at = Date.parse('2026-09-23T13:10:00Z')
const row = (changes: Record<string, unknown> = {}) => ({
  callsign: 'K1ABC',
  frequency: 14032.5,
  mode: 'CW',
  timestamp: new Date(at - 60_000).toISOString(),
  spotter: 'K1TTT',
  snr: 12,
  wpm: 28,
  ...changes,
})
const response = (spots: unknown[], total = spots.length): FetchResponse => ({
  status: 200,
  body: JSON.stringify({ spots, total }),
})

test('rejects malformed, stale, future, unsupported-mode, and out-of-band reports', () => {
  const bad = [
    null,
    {},
    row({ callsign: '<script>' }),
    row({ mode: 'SSB' }),
    row({ frequency: 5000 }),
    row({ frequency: '14032.5' }),
    row({ frequency: NaN }),
    row({ timestamp: 'bad' }),
    row({ timestamp: new Date(at + 1000).toISOString() }),
    row({ timestamp: new Date(at - maxAgeMs - 1).toISOString() }),
  ]
  assert.deepEqual(parseReports(bad, 'n1rwj-rbn', at), [])
  assert.equal(
    parseReports([row({ timestamp: new Date(at - maxAgeMs).toISOString() })], 'n1rwj-rbn', at)
      .length,
    1,
  )
})

test('keeps the newest frequency for each full callsign and band, preserving other bands', () => {
  const reports = parseReports(
    [
      row(),
      row({ frequency: 14034, timestamp: new Date(at).toISOString() }),
      row({ spotter: 'W3LPL' }),
      row({ frequency: 7033 }),
      row({ callsign: 'K1ABC/P' }),
    ],
    'n1rwj-rbn',
    at,
  )
  const spots = selectSpots(reports, undefined, { skimmers: [], grids: [] }, () => undefined, at)
  assert.equal(spots.length, 3)
  assert.equal(spots[0]?.freq, 14034)
  assert.ok(spots.some((s) => s.band === '40m'))
  assert.ok(spots.some((s) => s.their.call === 'K1ABC/P'))
  assert.equal(
    selectSpots(reports, undefined, { skimmers: [], grids: [] }, () => undefined, at + maxAgeMs + 1)
      .length,
    0,
  )
})

function fixture() {
  let now = at
  return {
    setTime: (value: number) => {
      now = value
    },
    options: {
      source: 'n1rwj-rbn',
      now: () => now,
      fetch: async (url: string, options?: FetchOptions) => {
        assert.equal(options?.timeout, 2000)
        return response(
          new URL(url).searchParams.get('band') === '20m'
            ? [row(), row({ callsign: 'W9NEW' })]
            : [],
        )
      },
    },
  }
}

test('fetches at most two pages per band with a fixed time window', async () => {
  const urls: URL[] = []
  const feed = createSpotFeed({
    source: 'n1rwj-rbn',
    now: () => at,
    fetch: async (url) => {
      const parsed = new URL(url)
      urls.push(parsed)
      return response(
        Array.from({ length: 1000 }, () => row()),
        5000,
      )
    },
  })
  await feed.get(true)
  assert.equal(urls.length, 18)
  assert.deepEqual([...new Set(urls.map((url) => url.searchParams.get('offset')))], ['0', '1000'])
  for (const url of urls) {
    assert.equal(url.searchParams.get('since'), String((at - maxAgeMs) / 1000))
    assert.equal(url.searchParams.get('until'), String(at / 1000))
    assert.equal(url.searchParams.get('mode'), 'CW')
  }
})

test('rate limits pause retries across bands and recover after retryAfter', async () => {
  const f = fixture()
  let requests = 0
  let limited = true
  const feed = createSpotFeed({
    ...f.options,
    fetch: async () => {
      requests++
      return limited
        ? { status: 429, body: JSON.stringify({ error: { retryAfter: 120 } }) }
        : response([])
    },
  })
  await assert.rejects(feed.get(true), /rate limit/)
  assert.equal(requests, 9)
  f.setTime(at + 61_000)
  await assert.rejects(feed.get(true), /rate limit/)
  assert.equal(requests, 9)
  limited = false
  f.setTime(at + 121_000)
  assert.deepEqual(await feed.get(true), [])
  assert.equal(requests, 18)
})

test('bad responses fail the source without presenting partial data as a complete refresh', async () => {
  for (const bad of [
    { status: 503, body: '' },
    { status: 200, body: '<html>' },
    { status: 200, body: '{}' },
    { status: 200, body: 'x'.repeat(1_000_001) },
  ]) {
    const f = fixture()
    let broken = false
    const feed = createSpotFeed({
      ...f.options,
      fetch: async (url) => {
        if (broken && new URL(url).searchParams.get('band') === '20m') return bad
        return f.options.fetch(url, { timeout: 2000 })
      },
    })
    const previous = await feed.get(true)
    broken = true
    f.setTime(at + 61_000)
    await assert.rejects(feed.get(true))
    assert.deepEqual(await feed.get(false), previous)
  }
})
