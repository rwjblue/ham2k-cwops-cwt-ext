// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Reading and guessing the CWT exchange: a name, and then either a CWops
// member number or — for non-members — a state, province or DX country prefix.
// CW Academy students send "CWA" in that second slot.
//
// Separate from index.ts so these can be unit-tested: index.ts calls
// `defineExtension` at import time, so nothing in it is reachable from
// `node --test`.

import type { JSONValue } from '@ham2k/extension-sdk'
import { annotateCallAgainstCountryFile } from '@ham2k/extension-sdk'

/// Member number or QTH, as typed: digits for a member, letters otherwise.
/// Anchored and matched case-insensitively by the core.
export const NUMBER_PATTERN = '[A-Z0-9]{1,6}'

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/// A first name, upper-cased — the exchange is one name sent in CW, and the
/// lookup may well hand back "Hiram Percy Maxim".
export function firstName(value: JSONValue | undefined): string {
  return str(value).trim().split(/\s+/)[0].toUpperCase()
}

export function normalizeNumber(value: JSONValue | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

/// The name to offer for this station, from whatever the lookup resolved.
export function guessedName(their: Record<string, JSONValue>): string {
  const guess = (their.guess as Record<string, JSONValue>) ?? {}
  return firstName(their.name) || firstName(guess.name)
}

/// What a NON-MEMBER would send — their state, province or entity prefix.
///
/// Used as a placeholder and, after all known CWT exchanges are exhausted,
/// as a location prefill. This guess does not establish club membership.
export function guessedQth(their: Record<string, JSONValue>): string {
  const guess = (their.guess as Record<string, JSONValue>) ?? {}
  const call = str(their.call)
  const info = (call ? annotateCallAgainstCountryFile(call) : {}) as Record<string, JSONValue>

  const state = normalizeNumber(str(their.state) || str(guess.state))
  if (state) return state
  return normalizeNumber(
    str(their.entityPrefix) || str(guess.entityPrefix) || str(info.entityPrefix),
  )
}

/// What WE send, as it goes into the exchange fields of an export.
///
/// Read from `ourName`/`ourNumber`, NOT `name`/`number`. `name` on a ref is a
/// CORE-OWNED decoration slot — `decorateRef` writes the activity row's
/// subtitle there, and the decorated ref is what gets persisted — so an
/// extension storing its own data under that key has it overwritten by a
/// display string the moment the operator saves the setup form.
export function ourExchange(ref?: Record<string, JSONValue>): { name: string; number: string } {
  return { name: firstName(ref?.ourName), number: normalizeNumber(ref?.ourNumber) }
}
