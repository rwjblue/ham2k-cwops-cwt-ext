// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// The guesses, which are the part that can be wrong without looking wrong.
//
// Callsigns resolve against the bundled country file (no network): W1AW → K/NA,
// DL1ABC → DL/EU.

import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  firstName,
  guessedName,
  guessedQth,
  normalizeNumber,
  ourExchange,
} from '../../src/cwt/exchange.ts'

test('a name is the first one, upper-cased', () => {
  // The lookup hands back whole names; the exchange is one name sent in CW.
  assert.equal(firstName('Hiram Percy Maxim'), 'HIRAM')
  assert.equal(firstName('seb'), 'SEB')
  assert.equal(firstName(undefined), '')
})

test('a name typed on the QSO beats the lookup guess', () => {
  assert.equal(guessedName({ name: 'Bob', guess: { name: 'Robert' } }), 'BOB')
  assert.equal(guessedName({ guess: { name: 'Robert' } }), 'ROBERT')
  assert.equal(guessedName({}), '')
})

test('the QTH hint prefers a state over an entity prefix', () => {
  // A non-member sends a state, province or DX prefix — the state is the more
  // specific of the two, and the one a US station would actually send.
  assert.equal(guessedQth({ call: 'W1AW', state: 'ct' }), 'CT')
  assert.equal(guessedQth({ call: 'W1AW', guess: { state: 'ct' } }), 'CT')
})

test('the QTH hint falls back to the country file when nothing was looked up', () => {
  // The last resort, and the only branch that reaches an external data file:
  // a shape change there would silently blank the hint rather than fail.
  assert.equal(guessedQth({ call: 'DL1ABC' }), 'DL')
  assert.equal(guessedQth({ call: 'W1AW' }), 'K')
  assert.equal(guessedQth({}), '')
})

test('numbers normalize to what goes in the log', () => {
  assert.equal(normalizeNumber(' 1234 '), '1234')
  assert.equal(normalizeNumber('cwa'), 'CWA')
  assert.equal(normalizeNumber(undefined), '')
})

test('our exchange reads ourName/ourNumber, never the decoration slots', () => {
  // `name` on a ref is where `decorateRef` writes the activity row's subtitle.
  // Reading it here would export a display string as the sent exchange.
  const ref = {
    type: 'cwt',
    ourName: 'Seb',
    ourNumber: '1234',
    name: '2026-08-26 1300z · SEB 1234',
  }
  assert.deepEqual(ourExchange(ref), { name: 'SEB', number: '1234' })
  assert.deepEqual(ourExchange(undefined), { name: '', number: '' })
})
