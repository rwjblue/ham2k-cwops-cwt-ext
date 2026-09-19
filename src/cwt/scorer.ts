// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// CWT scoring, per the CWops mini-test rules
// (https://cwops.org/cwops-tests/):
//   * 1 point per QSO, a station worked once per band only.
//   * The multiplier is the number of UNIQUE CALLSIGNS worked — once for the
//     whole session, not per band, which is what makes this different from
//     every other contest here.
//   * Total = points × unique callsigns.
//   * Six bands: 160/80/40/20/15/10m. CW only.
//
// A CWT is one hour, and the reference names which hour (schedule.ts) — but
// contacts outside it are NOT excluded here. Every contest in this directory
// has the same question and none of them answers it, so it belongs in one
// place for all of them rather than in this one scorer.

import type { ContestScorer, JSONValue, QsoScoreVerdict, ScoreTally } from '@ham2k/extension-sdk'
import { fmtInteger } from '@ham2k/lib-format-tools'

export const VALID_BANDS = ['160m', '80m', '40m', '20m', '15m', '10m']

export type CwtScoresheet = {
  /// call → bands already worked with it. Its SIZE is the multiplier, and its
  /// values are the once-per-band rule.
  workedByCall: Record<string, string[]>
  bands: Record<string, number>
  qsos: number
  points: number
  dayQsos: number
  dayPoints: number
}

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

export const CWTScorer: ContestScorer<CwtScoresheet> = {
  startScoresheet(): CwtScoresheet {
    return { workedByCall: {}, bands: {}, qsos: 0, points: 0, dayQsos: 0, dayPoints: 0 }
  },

  // Mutates and returns the given scoresheet — see ContestScorer.scoreQso.
  scoreQso({ scoresheet, qso, isNewDay }) {
    const base = scoresheet
    if (isNewDay) {
      base.dayQsos = 0
      base.dayPoints = 0
    }

    const their = (qso.their as Record<string, JSONValue>) ?? {}
    const call = str(their.call)
    if (!call) return { scoresheet: base, score: { value: 0 } }

    const band = str(qso.band)

    // CW only: the whole event is a CW test, so anything else is not a contest
    // contact even on a contest band.
    if (str(qso.mode) !== 'CW') {
      return { scoresheet: base, score: { value: 0, alerts: ['invalidMode'] } }
    }
    if (!VALID_BANDS.includes(band)) {
      return { scoresheet: base, score: { value: 0, alerts: ['invalidBand'] } }
    }

    const worked = base.workedByCall[call]
    if (worked?.includes(band)) {
      return { scoresheet: base, score: { value: 0, dupe: true, alerts: ['duplicate'] } }
    }

    // A callsign never worked before is a new multiplier; one worked on
    // another band is a fresh point but no new multiplier.
    const notices: string[] = []
    if (worked) {
      worked.push(band)
      notices.push('newBand')
    } else {
      base.workedByCall[call] = [band]
      notices.push('newMult')
    }

    base.bands[band] = (base.bands[band] ?? 0) + 1
    base.qsos += 1
    base.points += 1
    base.dayQsos += 1
    base.dayPoints += 1

    const score: QsoScoreVerdict = { value: 1, band }
    if (notices.length > 0) score.notices = notices
    return { scoresheet: base, score }
  },

  summarizeScore({ scoresheet, scope }): Record<string, ScoreTally> {
    const isDay = scope === 'day'
    const mults = Object.keys(scoresheet.workedByCall).length
    const points = isDay ? scoresheet.dayPoints : scoresheet.points
    // Multipliers are counted over the whole log, so a day's "score" is its
    // own points against the running multiplier count.
    const total = points * mults

    return {
      cwt: {
        key: 'cwt',
        for: scope,
        icon: 'clock-fast',
        total,
        points,
        mults,
        qsos: isDay ? scoresheet.dayQsos : scoresheet.qsos,
        label: `${fmtInteger(points)} × ${fmtInteger(mults)}`,
        summary: `${fmtInteger(total)}`,
        longSummary: bandBreakdown(scoresheet),
      },
    }
  },
}

/// QSOs per band — the multiplier is a single whole-log number, so unlike CQ
/// WW there is nothing per-band to break out of it.
function bandBreakdown(sheet: CwtScoresheet): string {
  return VALID_BANDS.map((band) => {
    const qsos = sheet.bands[band] ?? 0
    return qsos === 0 ? `**${band}**: —` : `**${band}**: ${fmtInteger(qsos)} QSOs`
  }).join('\n')
}
