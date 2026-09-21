// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Adapted from Ham2K CWT; see docs/PROVENANCE.md.

import type { JSONValue } from '@ham2k/extension-sdk'
import { type CwtSession, sessionFor } from './schedule.ts'

export const TYPE = 'cwt'

/// The ADIF `Contest_ID` enumeration's own name for this event — "CWOPS-CWT |
/// CWops Mini-CWT Test". A plain `CWOPS` is not in the list (that is the
/// sponsor, not the contest), and an importer would not recognize the file.
export const CONTEST_TAG = 'CWOPS-CWT'

/// How many sessions a search or a scoped picker offers.
export const SESSIONS_OFFERED = 4

/// What a search has to be a prefix of to offer this contest. Matched as "does
/// the alias contain what was typed", the same rule `fd` uses.
export const ALIASES = ['CWT', 'CWOPS', 'CWOPS CWT', 'MINI-TEST', 'MINITEST']

/// The classes CWops asks operators to report, and the `CATEGORY-POWER` value
/// each becomes in a Cabrillo header.
export const POWER_CLASSES: { value: string; cabrillo: string; watts: string }[] = [
  { value: 'QRP', cabrillo: 'QRP', watts: '≤5W' },
  { value: 'LP', cabrillo: 'LOW', watts: '≤100W' },
  { value: 'HP', cabrillo: 'HIGH', watts: '>100W' },
]

export function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

export function refOfType(
  container: Record<string, JSONValue>,
  type: string,
): Record<string, JSONValue> | undefined {
  return ((container.refs as Record<string, JSONValue>[] | undefined) ?? []).find(
    (r) => r?.type === type,
  )
}

export function sessionOn(
  operation: Record<string, JSONValue> | undefined,
): CwtSession | undefined {
  return sessionFor(str(refOfType(operation ?? {}, TYPE)?.ref))
}
