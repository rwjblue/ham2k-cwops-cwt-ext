// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MPL-2.0

import assert from 'node:assert/strict'
import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'
import { test } from 'vitest'
import { createFileCache } from '../../src/data/cache.ts'
import { parseCallHistory } from '../../src/history/parse.ts'
import { createSpotFeed } from '../../src/spots/feed.ts'
import { createSpotsHook } from '../../src/spots/hook.ts'
import { maxAgeMs, parseReports, selectSpots } from '../../src/spots/model.ts'

const at = Date.parse('2026-09-23T13:10:00Z')
const history = '!!Order!!,Call,Name,Exch1\nK1ABC,Al,1234\nW1XYZ,Pat,MA\nN1CWA,Lee,CWA\nK2ABC,Jo,\n'
const records = parseCallHistory(history).records
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

test('history filtering admits every exchange category and safe portable matches', () => {
  const calls = ['K1ABC', 'W1XYZ', 'N1CWA', 'K2ABC', 'ea8/k1abc/p', 'K1ABC/W2XYZ', 'W9NEW']
  const spots = selectSpots(
    parseReports(
      calls.map((callsign) => row({ callsign })),
      'cwt',
      at,
    ),
    records,
    true,
    at,
  )
  assert.deepEqual(
    spots.map((spot) => spot.their.call),
    ['K1ABC', 'W1XYZ', 'N1CWA', 'K2ABC', 'EA8/K1ABC/P'],
  )
  assert.equal(spots[4]?.refs, undefined)
  assert.deepEqual(spots[0]?.spot.sourceInfo, { spotter: 'K1TTT', snr: 12, wpm: 28 })
  assert.equal(selectSpots(parseReports([row()], 'cwt', at), undefined, true, at).length, 0)
  assert.equal(selectSpots(parseReports([row()], 'cwt', at), undefined, false, at).length, 1)
})

test('retains an exact portable file entry without treating another portable call as the same entry', () => {
  const exact = parseCallHistory('!!Order!!,Call,Name,Exch1\nEA8/K1ABC,Al,EA8').records
  const reports = parseReports(
    ['EA8/K1ABC', 'K1ABC', 'F/K1ABC'].map((callsign) => row({ callsign })),
    'cwt',
    at,
  )
  assert.deepEqual(
    selectSpots(reports, exact, true, at).map((s) => s.their.call),
    ['EA8/K1ABC'],
  )
})

test('rejects malformed, stale, future, non-CW, and non-contest-band reports', () => {
  const bad = [
    null,
    {},
    row({ callsign: '<script>' }),
    row({ mode: 'FT8' }),
    row({ frequency: 10120 }),
    row({ frequency: '14032.5' }),
    row({ frequency: NaN }),
    row({ timestamp: 'bad' }),
    row({ timestamp: new Date(at + 1000).toISOString() }),
    row({ timestamp: new Date(at - maxAgeMs - 1).toISOString() }),
  ]
  assert.deepEqual(parseReports(bad, 'cwt', at), [])
  assert.equal(
    parseReports([row({ timestamp: new Date(at - maxAgeMs).toISOString() })], 'cwt', at).length,
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
    'cwt',
    at,
  )
  const spots = selectSpots(reports, records, true, at)
  assert.equal(spots.length, 3)
  assert.equal(spots[0]?.freq, 14034)
  assert.ok(spots.some((s) => s.band === '40m'))
  assert.ok(spots.some((s) => s.their.call === 'K1ABC/P'))
  assert.equal(selectSpots(reports, records, true, at + maxAgeMs + 1).length, 0)
})

function fixture() {
  let now = at
  let historyOnly = true
  const requests: string[] = []
  const fileCache = createFileCache({ read: async () => null, write: async () => {} })
  function load(body = history) {
    fileCache.accept({
      schema: 1,
      body,
      url: 'https://n1mm.hamdocs.com/cwops.txt',
      fetchedAt: new Date(now).toISOString(),
    })
  }
  const options = {
    source: 'cwt',
    now: () => now,
    fetch: async (url: string, options?: FetchOptions) => {
      requests.push(url)
      assert.equal(options?.timeout, 2000)
      return response(
        new URL(url).searchParams.get('band') === '20m' ? [row(), row({ callsign: 'W9NEW' })] : [],
      )
    },
  }
  const hook = createSpotsHook({ ...options, fileCache, historyOnly: async () => historyOnly })
  return {
    options,
    hook,
    fileCache,
    requests,
    load,
    setTime: (value: number) => {
      now = value
    },
    setFilter: (value: boolean) => {
      historyOnly = value
    },
  }
}

test('requires a loaded file by default, coalesces requests, and applies setting/file changes to cached reports', async () => {
  const f = fixture()
  assert.deepEqual(await f.hook.fetchSpots({}, { online: true }), [])
  assert.equal(f.requests.length, 0)
  f.load()
  const [first, second] = await Promise.all([
    f.hook.fetchSpots({}, { online: true }),
    f.hook.fetchSpots({}, { online: true }),
  ])
  assert.deepEqual(first, second)
  assert.deepEqual(
    first.map((s) => s.their.call),
    ['K1ABC'],
  )
  assert.equal(f.requests.length, 6)
  f.setFilter(false)
  assert.equal((await f.hook.fetchSpots({}, { online: true })).length, 2)
  f.setFilter(true)
  f.load('!!Order!!,Call,Name,Exch1\nW9NEW,Pat,MA')
  assert.deepEqual(
    (await f.hook.fetchSpots({}, { online: true })).map((s) => s.their.call),
    ['W9NEW'],
  )
  await f.fileCache.remove()
  assert.deepEqual(await f.hook.fetchSpots({}, { online: true }), [])
  assert.equal(f.requests.length, 6)
})

test('offline reads do not fetch and cached spots expire against the current clock', async () => {
  const f = fixture()
  f.load()
  assert.deepEqual(await f.hook.fetchSpots({}, { online: false }), [])
  await f.hook.fetchSpots({}, { online: true })
  assert.equal((await f.hook.fetchSpots({}, { online: false })).length, 1)
  f.setTime(at + maxAgeMs)
  assert.deepEqual(await f.hook.fetchSpots({}, { online: false }), [])
  assert.equal(f.requests.length, 6)
  await f.hook.fetchSpots({}, { online: true })
  assert.equal(f.requests.length, 12)
})

test('history removal during a request cannot leak formerly matching reports', async () => {
  const f = fixture()
  f.load()
  const hook = createSpotsHook({
    ...f.options,
    fileCache: f.fileCache,
    historyOnly: async () => true,
    fetch: async () => {
      await f.fileCache.remove()
      return response([row()])
    },
  })
  assert.deepEqual(await hook.fetchSpots({}, { online: true }), [])
})

test('fetches at most two pages per band with a fixed time window', async () => {
  const urls: URL[] = []
  const feed = createSpotFeed({
    source: 'cwt',
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
  assert.equal(urls.length, 12)
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
  assert.equal(requests, 6)
  f.setTime(at + 61_000)
  await assert.rejects(feed.get(true), /rate limit/)
  assert.equal(requests, 6)
  limited = false
  f.setTime(at + 121_000)
  assert.deepEqual(await feed.get(true), [])
  assert.equal(requests, 12)
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
