// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0

import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import {
  OFFER_GRACE_MILLIS,
  OFFER_LEAD_MILLIS,
  relevanceFor,
  sessionAtHand,
  sessionDateLabel,
  sessionFor,
  sessionShortLabel,
  sessionsFrom,
} from '../../src/cwt/schedule.ts'

const HOUR = 60 * 60 * 1000

// Wednesday 26 August 2026, 1300 UTC — the first session of that week.
const WED_1300 = Date.UTC(2026, 7, 26, 13)

function knownSession(key: string) {
  const session = sessionFor(key)
  assert.ok(session)
  return session
}

describe('sessionFor', () => {
  it('resolves a session key to its hour', () => {
    const session = sessionFor('2026-08-26-1300')
    assert.equal(session?.startMillis, WED_1300)
    assert.equal(session?.endMillis, WED_1300 + HOUR)
    assert.equal(session?.hour, 13)
  })

  it('accepts all four weekly slots and nothing else', () => {
    assert.ok(sessionFor('2026-08-26-1300'))
    assert.ok(sessionFor('2026-08-26-1900'))
    assert.ok(sessionFor('2026-08-27-0300'))
    assert.ok(sessionFor('2026-08-27-0700'))
    // Wednesday, but not an hour any CWT runs.
    assert.equal(sessionFor('2026-08-26-1400'), undefined)
    // 1300z, but a Tuesday — the slot is a weekday AND an hour, and a key that
    // only checked the shape would make every day of the week a contest.
    assert.equal(sessionFor('2026-08-25-1300'), undefined)
  })

  it('rejects a date that only exists after Date.UTC rolls it over', () => {
    // Date.UTC(2026, 1, 31) is 3 March, which IS a Wednesday 1300 slot — so
    // without the round-trip guard this junk key resolves to a real session.
    assert.equal(sessionFor('2026-02-31-1300'), undefined)
  })

  it('rejects malformed keys', () => {
    assert.equal(sessionFor(''), undefined)
    assert.equal(sessionFor(undefined), undefined)
    assert.equal(sessionFor('CWT-1300'), undefined)
    assert.equal(sessionFor('2026-08-26-1301'), undefined)
  })
})

describe('sessionsFrom', () => {
  it("lists the week's four sessions in order", () => {
    const keys = sessionsFrom(WED_1300 - 4 * HOUR, 4).map((s) => s.key)
    assert.deepEqual(keys, [
      '2026-08-26-1300',
      '2026-08-26-1900',
      '2026-08-27-0300',
      '2026-08-27-0700',
    ])
  })

  it("rolls into the next week once a week's sessions are past", () => {
    const keys = sessionsFrom(Date.UTC(2026, 7, 27, 12), 2).map((s) => s.key)
    assert.deepEqual(keys, ['2026-09-02-1300', '2026-09-02-1900'])
  })

  it('keeps the session just finished at the head of the list', () => {
    // The hour is over but the operator is still setting up the log for it —
    // dropping it here would make the picker offer the NEXT session for a log
    // that has already been worked.
    const keys = sessionsFrom(WED_1300 + HOUR + OFFER_GRACE_MILLIS - 1, 1).map((s) => s.key)
    assert.deepEqual(keys, ['2026-08-26-1300'])
  })

  it('drops a session once its grace window closes', () => {
    const keys = sessionsFrom(WED_1300 + HOUR + OFFER_GRACE_MILLIS, 1).map((s) => s.key)
    assert.deepEqual(keys, ['2026-08-26-1900'])
  })
})

describe('sessionAtHand', () => {
  it('offers nothing on a day with no session', () => {
    // Monday. The whole point of this extension's suggest gate — a weekly
    // event that always offered itself would head the nearby list six days a
    // week.
    assert.equal(sessionAtHand(Date.UTC(2026, 7, 24, 13)), undefined)
  })

  it('offers nothing on a Wednesday still more than the lead away', () => {
    assert.equal(sessionAtHand(WED_1300 - OFFER_LEAD_MILLIS - 1), undefined)
  })

  it('offers the session once the lead window opens', () => {
    assert.equal(sessionAtHand(WED_1300 - OFFER_LEAD_MILLIS)?.key, '2026-08-26-1300')
  })

  it('offers the session while it is on the air', () => {
    assert.equal(sessionAtHand(WED_1300 + 30 * 60 * 1000)?.key, '2026-08-26-1300')
  })

  it('goes quiet between two sessions on the same day', () => {
    // 1500z: the 1300 is past its grace window and the 1900 is still four
    // hours out. Wednesday is a CWT day, but nothing is at hand.
    assert.equal(sessionAtHand(WED_1300 + HOUR + OFFER_GRACE_MILLIS), undefined)
  })

  it('moves on to the evening session once ITS lead window opens', () => {
    assert.equal(sessionAtHand(WED_1300 + 6 * HOUR - OFFER_LEAD_MILLIS)?.key, '2026-08-26-1900')
  })
})

describe('relevanceFor', () => {
  const session = knownSession('2026-08-26-1300')

  it('ranks a running session top', () => {
    assert.equal(relevanceFor(session, WED_1300 + 10 * 60 * 1000), 1)
  })

  it('keeps a just-finished session at the top rather than sinking it', () => {
    // Ranked below the session that follows, it would come SECOND in the
    // picker for the operator setting up the log for the hour just worked.
    const justFinished = relevanceFor(session, WED_1300 + 90 * 60 * 1000)
    const nextOneUp = relevanceFor(knownSession('2026-08-26-1900'), WED_1300 + 90 * 60 * 1000)
    assert.equal(justFinished, 1)
    assert.ok(justFinished > nextOneUp)
  })

  it('ranks a nearer session ahead of one further out', () => {
    assert.ok(relevanceFor(session, WED_1300 - HOUR) > relevanceFor(session, WED_1300 - 24 * HOUR))
  })
})

describe('labels', () => {
  const session = knownSession('2026-08-27-0300')

  it('names the session by its hour', () => {
    assert.equal(sessionShortLabel(session), 'CWT 0300z')
  })

  it('dates the session in the same order its filename and Cabrillo use', () => {
    assert.equal(sessionDateLabel(session), '2026-08-27 0300z')
  })
})
