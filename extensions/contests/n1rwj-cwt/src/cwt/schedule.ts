// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// When the CWTs run, and which one is the one at hand.
//
// COMPUTED from the rule CWops publishes — "every Wednesday at 1300-1400z and
// 1900-2000z, and every Thursday at 0300-0400z and 0700-0800z"
// (https://cwops.org/cwops-tests/) — the same reasoning `fd/schedule.ts` gives
// for Field Day: a rule is right for every week, including ones nobody has
// updated a data file for.
//
// A CWT is an HOUR, four times a week, so unlike every other contest here the
// reference has to name the *occurrence*, not the event: `2026-08-26-1300` is a
// different contest entry from `2026-08-26-1900`, submitted separately.
//
// KNOWN LIMIT: CWops occasionally suspends a week (their published calendar is
// the authority). Nothing here knows about that, so an off week is still
// offered. A suggestion is an offer, not a claim, and the operator is the one
// who knows.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/// A session's start, as (UTC weekday, UTC hour). `Date.getUTCDay()`'s
/// numbering — 3 is Wednesday, 4 is Thursday.
const SLOTS: { day: number; hour: number }[] = [
  { day: 3, hour: 13 },
  { day: 3, hour: 19 },
  { day: 4, hour: 3 },
  { day: 4, hour: 7 },
]

/// Every session runs exactly one hour.
export const SESSION_MILLIS = HOUR

/// How long before a session starts it appears in the picker unprompted.
export const OFFER_LEAD_MILLIS = 3 * HOUR

/// How long after a session ends it still counts as "the one at hand" — an
/// operator who worked the hour and only afterwards opens the operation sheet
/// is still setting up THAT session, not the next one.
export const OFFER_GRACE_MILLIS = HOUR

export interface CwtSession {
  /// The reference: `YYYY-MM-DD-HHMM` of the start, in UTC.
  key: string
  startMillis: number
  endMillis: number
  /// The UTC hour, which is what an operator calls the session ("the 1300").
  hour: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function sessionAt(startMillis: number): CwtSession {
  const at = new Date(startMillis)
  return {
    key: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}-${pad(at.getUTCHours())}00`,
    startMillis,
    endMillis: startMillis + SESSION_MILLIS,
    hour: at.getUTCHours(),
  }
}

/// The sessions starting on the UTC day [dayMillis] falls in, in order.
function sessionsOnDay(dayMillis: number): CwtSession[] {
  const at = new Date(dayMillis)
  const midnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  const weekday = new Date(midnight).getUTCDay()
  return SLOTS.filter((slot) => slot.day === weekday).map((slot) =>
    sessionAt(midnight + slot.hour * HOUR),
  )
}

/// The next [count] sessions as of [nowMillis] — a session still counts as
/// "next" until [OFFER_GRACE_MILLIS] past its end, so the hour just worked
/// heads the list rather than vanishing from it the moment it finishes.
export function sessionsFrom(nowMillis: number, count: number): CwtSession[] {
  const found: CwtSession[] = []
  // Start a day back: a session that started yesterday UTC can still be within
  // the grace window.
  for (let offset = -1; offset <= 14 && found.length < count; offset += 1) {
    for (const session of sessionsOnDay(nowMillis + offset * DAY)) {
      if (session.endMillis + OFFER_GRACE_MILLIS <= nowMillis) continue
      if (found.length < count) found.push(session)
    }
  }
  return found
}

/// The session to offer UNPROMPTED, or undefined when none is close enough.
///
/// This is the "only on the day it happens" rule: the picker's nearby list only
/// names a CWT from three hours before a session until an hour after it ends.
/// Searching for it, or scoping the picker to this extension, still finds the
/// next sessions on any day — see `sessionsFrom`.
export function sessionAtHand(nowMillis: number): CwtSession | undefined {
  const next = sessionsFrom(nowMillis, 1)[0]
  if (!next) return undefined
  return nowMillis >= next.startMillis - OFFER_LEAD_MILLIS ? next : undefined
}

/// The session a reference names, or undefined when the key isn't one.
///
/// Validates the SLOT, not just the shape: `2026-08-25-1300` is a well-formed
/// key for a Tuesday, and no CWT runs then.
export function sessionFor(key: string | undefined): CwtSession | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})00$/.exec((key ?? '').trim())
  if (!match) return undefined
  const [year, month, day, hour] = match.slice(1).map(Number)
  const startMillis = Date.UTC(year, month - 1, day, hour)
  const at = new Date(startMillis)
  // Round-trip guard: Date.UTC rolls a 31st of February over into March
  // silently, and the rolled-over date would then be a legitimate session.
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return undefined
  if (!SLOTS.some((slot) => slot.day === at.getUTCDay() && slot.hour === hour)) return undefined
  return sessionAt(startMillis)
}

/// The session's own name — "CWT 1300z". The hour is how operators refer to
/// them, and it is the same string on every locale, so it isn't translated.
export function sessionShortLabel(session: CwtSession): string {
  return `CWT ${pad(session.hour)}00z`
}

/// The date and hour, for a picker row that has to tell four sessions a week
/// apart — "2026-08-26 1300z". ISO order rather than a localized date: this is
/// a log reference the operator will see again in a filename and a Cabrillo
/// header, and it should read the same in all three.
export function sessionDateLabel(session: CwtSession): string {
  return `${session.key.slice(0, 10)} ${pad(session.hour)}00z`
}

/// Relevance for ordering the picker — 1 for the session at hand, falling away
/// for each one further out.
///
/// Strictly decreasing in time-to-start, so a list of sessions ranked by it
/// stays in CHRONOLOGICAL order. A separate, lower rank for a session that has
/// already run would sink it below the one after it, and the operator setting
/// up the log for the hour they just worked would find it second.
///
/// Only ORDERS suggestions, and only against others with no location: the
/// picker sorts everything with a distance ahead of everything without one.
export function relevanceFor(session: CwtSession, nowMillis: number): number {
  const hours = (session.startMillis - nowMillis) / HOUR
  if (hours <= 0) return 1
  return 1 / (1 + hours / 24)
}
