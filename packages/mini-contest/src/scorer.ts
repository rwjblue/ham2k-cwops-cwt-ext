// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// The accumulation structure follows the Ham2K CWT/NAQP scorers.
import type { ContestScorer, QsoScoreVerdict } from '@ham2k/extension-sdk'
import { annotateCallAgainstCountryFile } from '@ham2k/extension-sdk'
import { isCallsign, normalizeCall } from '../../n1mm/src/callsign.ts'
import { canonicalLocation, LOCATIONS, received, validSerial } from './exchange.ts'
import { BANDS, type ContestConfig, object, type Qson, refOf, text } from './model.ts'
import { sessionFor } from './schedule.ts'

export type Scoresheet = {
  worked: Record<string, string[]>
  multipliers: Record<string, true>
  bands: Record<string, number>
  points: number
  dayPoints: number
}
export function sstMultiplier(qso: Qson, value: string): string | undefined {
  if (value !== 'DX')
    return LOCATIONS.includes(value) ? `location:${canonicalLocation(value)}` : undefined
  const their = object(qso.their)
  const guess = object(their.guess)
  const code =
    their.dxccCode ?? guess.dxccCode ?? annotateCallAgainstCountryFile(text(their.call)).dxccCode
  // 291 = contiguous United States, 1 = Canada. Both send subdivisions.
  return typeof code === 'number' && code > 0 && code !== 291 && code !== 1
    ? `dxcc:${code}`
    : undefined
}
export function createScorer(config: ContestConfig): ContestScorer<Scoresheet> {
  return {
    startScoresheet() {
      return { worked: {}, multipliers: {}, bands: {}, points: 0, dayPoints: 0 }
    },
    scoreQso({ scoresheet, qso, operation, isNewDay }) {
      if (isNewDay) scoresheet.dayPoints = 0
      const result = (score: QsoScoreVerdict) => ({ scoresheet, score })
      const call = normalizeCall(text(object(qso.their).call))
      if (!isCallsign(call) || qso.deleted || qso.band === 'event') return result({ value: 0 })
      if (text(qso.mode).toUpperCase() !== 'CW')
        return result({ value: 0, alerts: ['invalidMode'] })
      const band = text(qso.band)
      if (!BANDS.includes(band)) return result({ value: 0, alerts: ['invalidBand'] })
      const session = sessionFor(config, text(refOf(operation, config.type)?.ref))
      if (
        session &&
        typeof qso.startAtMillis === 'number' &&
        (qso.startAtMillis < session.startMillis || qso.startAtMillis >= session.endMillis)
      ) {
        return result({ value: 0, alerts: ['outsideSession'] })
      }
      const worked = scoresheet.worked[call]
      if (worked?.includes(band)) return result({ value: 0, dupe: true, alerts: ['duplicate'] })
      const exchange = received(config, qso)
      const locationMult =
        config.exchange === 'name-location' ? sstMultiplier(qso, exchange.value) : undefined
      const mult =
        config.exchange === 'serial-name'
          ? call
          : locationMult
            ? `${band}|${locationMult}`
            : undefined
      const notices: string[] = []
      if (mult && !scoresheet.multipliers[mult]) notices.push('newMult')
      if (mult) scoresheet.multipliers[mult] = true
      if (worked) worked.push(band)
      else scoresheet.worked[call] = [band]
      if (worked) notices.push('newBand')
      scoresheet.points++
      scoresheet.dayPoints++
      scoresheet.bands[band] = (scoresheet.bands[band] ?? 0) + 1
      const score: QsoScoreVerdict = { value: 1, dupe: false, band, notices }
      if (!exchange.name || !exchange.value) score.alerts = ['missingExchange']
      else if (
        config.exchange === 'serial-name'
          ? !validSerial(exchange.value)
          : !LOCATIONS.includes(exchange.value)
      )
        score.alerts = ['invalidExchange']
      else if (config.exchange === 'name-location' && exchange.value === 'DX' && !mult)
        score.alerts = ['unknownMultiplier']
      return result(score)
    },
    summarizeScore({ scoresheet, scope }) {
      const points = scope === 'day' ? scoresheet.dayPoints : scoresheet.points
      const mults = Object.keys(scoresheet.multipliers).length
      return {
        [config.type]: {
          key: config.type,
          for: scope,
          icon: 'clock-fast',
          points,
          qsos: points,
          mults,
          total: points * mults,
          label: `${points} × ${mults}`,
          summary: String(points * mults),
          longSummary: BANDS.map((band) => `**${band}**: ${scoresheet.bands[band] ?? 0} QSOs`).join(
            '\n',
          ),
        },
      }
    },
  }
}
