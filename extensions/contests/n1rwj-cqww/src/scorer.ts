// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// CQ WW DX scoring, ported from app-polo's CQWWExtension `scoringForQSO` /
// `accumulateScoreForOperation` / `summarizeScore` into a `ContestScorer`.
//
// CW/SSB rules below; RTTY uses 1/2/3 points, excludes 160m, and adds
// W/VE QTH multipliers (https://cqwwrtty.com/rules.htm).
// The rules, per the CQ WW general rules:
//   * Points depend on where the other station is relative to us — 0 for our
//     own DXCC entity, 1 within our continent, 2 for NA-to-NA (North America
//     is the exception), 3 across continents.
//   * Multipliers are PER BAND, and there are two kinds: each CQ zone and each
//     DXCC country worked on that band. Total = points x multipliers.
//   * A station may be worked once per band. A repeat on the same band scores
//     nothing and yields no multiplier; the same station on a new band is a
//     fresh contact.
//   * Only 160/80/40/20/15/10m count, and the QSO's mode must match the
//     contest's mode.

import type { ContestScorer, JSONValue, QsoScoreVerdict, ScoreTally } from '@ham2k/extension-sdk'
import { annotateCallAgainstCountryFile } from '@ham2k/extension-sdk'
import { fmtInteger } from '@ham2k/lib-format-tools'
import { isRtty, qthForCall, qthIsValid, qthMultiplier, RTTY_BANDS } from './rtty.ts'

/// CQ WW is an HF contest: the WARC bands are excluded by the rules, not an
/// oversight.
export const VALID_BANDS = ['160m', '80m', '40m', '20m', '15m', '10m']

/// A CQ zone as typed: 1-40, with or without a leading zero. Anchored and
/// matched case-insensitively by the core, so this is just the body.
export const ZONE_PATTERN = '0?(?:[1-9]|[1-3][0-9]|40)'

export type CQWWScoresheet = {
  /// call → bands already worked with it (one QSO per band is allowed).
  workedByCall: Record<string, string[]>
  /// Every `band|Znn` / `band|Cxx` multiplier seen, and the per-band split the
  /// summary breaks out.
  mults: Record<string, number>
  bandMults: Record<string, Record<string, number>>
  bands: Record<string, number>
  bandPoints: Record<string, number>
  qsos: number
  points: number
  dayQsos: number
  dayPoints: number
  /// Our own continent and DXCC entity, resolved once from the station call —
  /// every point calculation is relative to them.
  ourContinent?: string
  ourEntity?: string
  rtty?: boolean
}

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/// The zone as the operator typed it, reduced to its canonical form: "05" and
/// "5" are the same multiplier, and must not count twice.
export function normalizeZone(value: JSONValue | undefined): string {
  const digits = String(value ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '')
  return /^([1-9]|[1-3][0-9]|40)$/.test(digits) ? digits : ''
}

/// CQ WW runs separate CW, SSB and RTTY weekends; a QSO in the wrong mode is
/// not a contest QSO. SSB covers the sideband modes a radio may report.
function modeMatches(contestMode: string, qsoMode: string): boolean {
  if (!contestMode) return true
  if (contestMode === 'RTTY') return isRtty(qsoMode)
  if (contestMode === 'SSB') return qsoMode === 'SSB' || qsoMode === 'USB' || qsoMode === 'LSB'
  return qsoMode === contestMode
}

export const CQWWScorer: ContestScorer<CQWWScoresheet> = {
  startScoresheet({ operation, ref }): CQWWScoresheet {
    const rtty = ref?.mode === 'RTTY'
    const ours = annotateCallAgainstCountryFile(str(operation.stationCall), { wae: rtty })
    return {
      workedByCall: {},
      mults: {},
      bandMults: {},
      bands: {},
      bandPoints: {},
      qsos: 0,
      points: 0,
      dayQsos: 0,
      dayPoints: 0,
      ourContinent: ours.continent,
      ourEntity: ours.entityPrefix,
      rtty,
    }
  },

  // Mutates and returns the given scoresheet — see ContestScorer.scoreQso.
  scoreQso({ scoresheet, qso, ref, isNewDay }) {
    const base = scoresheet
    if (isNewDay) {
      base.dayQsos = 0
      base.dayPoints = 0
    }

    const their = (qso.their as Record<string, JSONValue>) ?? {}
    const call = str(their.call).trim().toUpperCase()
    if (!call) return { scoresheet: base, score: { value: 0 } }

    const band = str(qso.band)
    const mode = str(qso.mode)

    if (!modeMatches(str(ref?.mode), mode)) {
      return { scoresheet: base, score: { value: 0, alerts: ['invalidMode'] } }
    }
    if (
      !(base.rtty ? RTTY_BANDS : VALID_BANDS).includes(band) ||
      (base.rtty &&
        ref?.categoryBand &&
        ref.categoryBand !== 'ALL' &&
        band !== `${ref.categoryBand}m`)
    ) {
      return { scoresheet: base, score: { value: 0, alerts: ['invalidBand'] } }
    }

    // One QSO per station per band.
    const worked = base.workedByCall[call] ?? []
    if (worked.includes(band)) {
      return { scoresheet: base, score: { value: 0, dupe: true, alerts: ['duplicate'] } }
    }

    // The exchange the operator typed wins; the country file's zone for that
    // call is the fallback, so a QSO logged without an exchange still scores.
    //
    // PRESENCE of the field decides, not truthiness. The core writes
    // `theirZone: ''` for a zone the operator deliberately emptied and drops the
    // key when none was ever entered, so falling back on `||` would score a
    // guessed multiplier for a QSO whose Cabrillo line exports a dash — the
    // exact log-disagrees-with-its-own-score problem §8 exists to prevent, just
    // arrived at from the other side.
    const theirInfo = annotateCallAgainstCountryFile(call, { wae: base.rtty })
    const contestRef = ((qso.refs as Record<string, JSONValue>[] | undefined) ?? []).find(
      (r) => r?.type === 'cqww',
    )
    const zone =
      contestRef && 'theirZone' in contestRef
        ? normalizeZone(contestRef.theirZone)
        : base.rtty
          ? ''
          : normalizeZone(theirInfo.cqZone)
    const maritime = base.rtty && theirInfo.postindicators?.includes('MM')
    const entity = maritime ? undefined : theirInfo.entityPrefix
    const qth = base.rtty ? qthForCall(call, contestRef?.theirQth) : ''
    // An incomplete exchange cannot claim points or consume the dupe slot.
    // Unknown countries cannot silently receive the maximum three points.
    if (
      base.rtty &&
      (!zone || (!maritime && (!base.ourEntity || !entity || !qthIsValid(qth, entity))))
    ) {
      return { scoresheet: base, score: { value: 0, alerts: ['missingExchange'] } }
    }

    // Points are relative to us: our own entity is worth nothing, our own
    // continent little, another continent most. NA-to-NA is the documented
    // exception at 2.
    let points = 3
    if (base.ourEntity && entity && base.ourEntity === entity) {
      points = base.rtty ? 1 : 0
    } else if (
      !maritime &&
      base.ourContinent &&
      theirInfo.continent &&
      base.ourContinent === theirInfo.continent
    ) {
      points = base.rtty || base.ourContinent === 'NA' ? 2 : 1
    }

    // RTTY adds W/VE QTHs to the zone and country multipliers.
    const locationMult = base.rtty ? qthMultiplier(call, contestRef?.theirQth) : ''
    const hadPreviousBand = worked.length > 0
    // Zone and country each multiply, once per band.
    const newMults: string[] = []
    for (const mult of [
      zone ? `${band}|Z${zone}` : '',
      entity ? `${band}|C${entity}` : '',
      locationMult ? `${band}|Q${locationMult}` : '',
    ]) {
      if (!mult) continue
      if (base.mults[mult] === undefined) newMults.push(mult)
      base.mults[mult] = (base.mults[mult] ?? 0) + 1
      base.bandMults[band] ??= {}
      base.bandMults[band][mult] = (base.bandMults[band][mult] ?? 0) + 1
    }

    if (worked.length > 0) base.workedByCall[call].push(band)
    else base.workedByCall[call] = [band]

    base.bands[band] = (base.bands[band] ?? 0) + 1
    base.bandPoints[band] = (base.bandPoints[band] ?? 0) + points
    base.qsos += 1
    base.points += points
    base.dayQsos += 1
    base.dayPoints += points

    const score: QsoScoreVerdict = { value: points, band, dupe: false }
    const notices: string[] = []
    if (newMults.length > 0) notices.push('newMult')
    if (hadPreviousBand) notices.push('newBand')
    if (notices.length > 0) score.notices = notices
    if (zone) score.zone = zone

    return { scoresheet: base, score }
  },

  summarizeScore({ scoresheet, scope }): Record<string, ScoreTally> {
    const isDay = scope === 'day'
    const multCount = Object.keys(scoresheet.mults).length
    const points = isDay ? scoresheet.dayPoints : scoresheet.points
    // Multipliers accumulate across the whole contest, so a day's "score" is
    // still its points against the running multiplier count.
    const total = points * (multCount || 0)

    return {
      cqww: {
        key: 'cqww',
        for: scope,
        icon: 'earth',
        total,
        points,
        mults: multCount,
        qsos: isDay ? scoresheet.dayQsos : scoresheet.qsos,
        label: `${fmtInteger(points)} × ${fmtInteger(multCount)}`,
        summary: `${fmtInteger(total)}`,
        longSummary: bandBreakdown(scoresheet),
      },
    }
  },
}

/// The per-band table a contester actually reads while operating — QSOs,
/// points and multipliers for each band, in band order.
function bandBreakdown(sheet: CQWWScoresheet): string {
  const lines = (sheet.rtty ? RTTY_BANDS : VALID_BANDS).map((band) => {
    const qsos = sheet.bands[band] ?? 0
    const points = sheet.bandPoints[band] ?? 0
    const mults = Object.keys(sheet.bandMults[band] ?? {}).length
    return qsos === 0 && mults === 0
      ? `**${band}**: —`
      : `**${band}**: ${fmtInteger(qsos)} QSOs, ${fmtInteger(points)} pts, ${fmtInteger(mults)} mults`
  })
  return lines.join('\n')
}
