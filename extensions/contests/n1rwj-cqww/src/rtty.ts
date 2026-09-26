// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT

import type { JSONValue } from '@ham2k/extension-sdk'
import { annotateCallAgainstCountryFile } from '@ham2k/extension-sdk'

// CQ WW RTTY rules IV.C.3: these are contest call areas, not postal provinces.
// Newfoundland and Labrador are separate multipliers; NL is ambiguous.
export const US_QTHS =
  'AL AR AZ CA CO CT DC DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(
    ' ',
  )
export const CANADIAN_QTHS = 'NB NS QC ON MB SK AB BC NWT NF LB NU YT PEI'.split(' ')
export const RTTY_BANDS = ['80m', '40m', '20m', '15m', '10m']
export const QTH_OPTIONS = [...US_QTHS, ...CANADIAN_QTHS, 'DX'].map((code) => ({ code }))
export const QTH_PATTERN = [...US_QTHS, ...CANADIAN_QTHS, 'DX', 'NT', 'PE'].join('|')

export function isRtty(mode: JSONValue | undefined): boolean {
  return (
    typeof mode === 'string' &&
    ['RTTY', 'RTTY-R', 'RTTY-LSB', 'RTTY-USB'].includes(mode.trim().toUpperCase())
  )
}

export function normalizeQth(value: JSONValue | undefined): string {
  const qth = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return ({ NT: 'NWT', PE: 'PEI' } as Record<string, string>)[qth] ?? qth
}

export function qthIsValid(qth: string, entity: string | undefined): boolean {
  if (entity === 'K') return US_QTHS.includes(qth)
  if (entity === 'VE') return CANADIAN_QTHS.includes(qth)
  return !!entity && qth === 'DX'
}

// Never derive a state from a callsign's digit. DX is only a format default
// for a positively identified non-W/VE station, not a fallback for missing data.
export function qthForCall(call: string, value?: JSONValue): string {
  if (value !== undefined) return normalizeQth(value)
  const info = annotateCallAgainstCountryFile(call)
  if (info.postindicators?.includes('MM')) return 'DX'
  return info.entityPrefix && !['K', 'VE'].includes(info.entityPrefix) ? 'DX' : ''
}

export function suggestedQth(call: string, guess: Record<string, JSONValue>): string {
  const entity = annotateCallAgainstCountryFile(call).entityPrefix
  const qth = normalizeQth(guess.state)
  return qthIsValid(qth, entity) ? qth : qthForCall(call)
}

export function qthMultiplier(call: string, value: JSONValue | undefined): string {
  const info = annotateCallAgainstCountryFile(call)
  const qth = normalizeQth(value)
  return !info.postindicators?.includes('MM') &&
    ['K', 'VE'].includes(info.entityPrefix ?? '') &&
    qthIsValid(qth, info.entityPrefix)
    ? qth
    : ''
}
