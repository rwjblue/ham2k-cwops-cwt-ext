// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Adapted from Ham2K CWT; see docs/PROVENANCE.md.

import type {
  ActivityHook as ActivityHookType,
  ActivitySuggestion,
  FormElement,
  HookContext,
  JSONValue,
  LoggingControlDescriptor,
  SuggestArgs,
} from '@ham2k/extension-sdk'
import manifest from '../../manifest.json'
import { firstName, guessedName, guessedQth, NUMBER_PATTERN, normalizeNumber } from './exchange.ts'
import { tFor } from './i18n.ts'
import {
  type CwtSession,
  relevanceFor,
  sessionAtHand,
  sessionDateLabel,
  sessionFor,
  sessionShortLabel,
  sessionsFrom,
} from './schedule.ts'
import { ALIASES, POWER_CLASSES, refOfType, SESSIONS_OFFERED, str, TYPE } from './shared.ts'

/// One picker row for a session. A suggestion is persisted VERBATIM and never
/// runs through `decorateRef`, so everything the operation row reads has to be
/// here — including `name`, the row's second line.
function suggestionFor(
  session: CwtSession,
  nowMillis: number,
  ctx: HookContext,
): ActivitySuggestion {
  return {
    type: TYPE,
    ref: session.key,
    name: `${sessionDateLabel(session)} · ${tFor(ctx)('sessionDescription')}`,
    program: 'Contest',
    label: sessionShortLabel(session),
    shortLabel: sessionShortLabel(session),
    relevance: relevanceFor(session, nowMillis),
  }
}

export const ActivityHook = {
  /// The date rule, and the whole point of this extension's shape — see the
  /// file header.
  async suggest(
    { searchTerm, scoped }: SuggestArgs,
    ctx: HookContext,
  ): Promise<ActivitySuggestion[]> {
    const term = (searchTerm ?? '').trim().toUpperCase()
    const namesThisContest = !term || ALIASES.some((alias) => alias.includes(term))
    // Not ours, and nobody asked us in particular.
    if (!namesThisContest && !scoped) return []

    const now = Date.now()
    // Asked for BY NAME, or asked of this extension alone: the operator is
    // looking for a CWT, so the answer is which ones are coming up. Only the
    // unprompted list is gated on the day.
    if (term || scoped) {
      const sessions = sessionsFrom(now, SESSIONS_OFFERED)
      // Within a scope the rows are labelled "CWT 1300z", so `cwt: 1300` is an
      // operator narrowing the list, not one asking a question this extension
      // can't answer — it filters the sessions rather than emptying the panel.
      const matching = namesThisContest
        ? sessions
        : sessions.filter((session) =>
            `${session.key} ${sessionShortLabel(session)}`.toUpperCase().includes(term),
          )
      return matching.map((session) => suggestionFor(session, now, ctx))
    }

    const session = sessionAtHand(now)
    return session ? [suggestionFor(session, now, ctx)] : []
  },

  /// The setup form — a `form`, not `options`: `activities_view.dart` renders
  /// only `refList` and `form` for operation controls.
  async operationControls(
    { operation }: { operation: Record<string, JSONValue> },
    ctx: HookContext,
  ): Promise<LoggingControlDescriptor[]> {
    const t = tFor(ctx)
    const currentKey = str(refOfType(operation, TYPE)?.ref)
    const options = sessionsFrom(Date.now(), SESSIONS_OFFERED).map((session) => ({
      value: session.key,
      label: sessionDateLabel(session),
    }))
    // An operation opened weeks later names a session that has long since
    // dropped off the list; its own reference still has to be selectable, or
    // saving the form would silently move the log to another session.
    if (currentKey && !options.some((option) => option.value === currentKey)) {
      const known = sessionFor(currentKey)
      options.unshift({ value: currentKey, label: known ? sessionDateLabel(known) : currentKey })
    }

    const elements: FormElement[] = [
      {
        type: 'field',
        fieldType: 'select',
        // The session key IS the ref's identity, so this writes `ref` — the one
        // core-owned key a setup form legitimately sets.
        key: 'ref',
        label: t('sessionLabel'),
        value: currentKey || options[0]?.value,
        options,
      },
      // `ourName`/`ourNumber`, not `name`/`number`: a form field key IS a key
      // on the ref, and `name` is the slot `decorateRef` writes the activity
      // row's subtitle into.
      {
        type: 'field',
        fieldType: 'text',
        key: 'ourName',
        label: t('ourNameLabel'),
        placeholder: t('ourNamePlaceholder'),
        uppercase: true,
      },
      {
        type: 'field',
        fieldType: 'text',
        key: 'ourNumber',
        label: t('ourNumberLabel'),
        placeholder: t('ourNumberPlaceholder'),
        uppercase: true,
      },
      {
        type: 'field',
        fieldType: 'radio',
        key: 'power',
        label: t('powerLabel'),
        options: POWER_CLASSES.map((power) => ({
          value: power.value,
          label: `${power.value} (${power.watts})`,
        })),
      },
      { type: 'markdown', text: t('rulesLink') },
    ]

    return [
      {
        key: 'cwt/setup',
        label: t('activityLabel'),
        icon: manifest.icon,
        color: manifest.accentColor,
        order: 10,
        input: { kind: 'form', refType: TYPE, form: { title: t('setupLabel'), elements } },
      },
    ]
  },

  /// The two halves of the exchange. Off-contest, contribute nothing — an
  /// optimization, not the rule: the core already refuses a primary field to
  /// an activity the operation isn't running.
  async loggingControls(
    { operation, qso }: { operation: Record<string, JSONValue>; qso?: Record<string, JSONValue> },
    ctx: HookContext,
  ): Promise<LoggingControlDescriptor[]> {
    if (!refOfType(operation, TYPE)) return []

    const t = tFor(ctx)
    const their = (qso?.their as Record<string, JSONValue>) ?? {}
    const name = guessedName(their)
    const qth = guessedQth(their)

    return [
      {
        key: 'cwt/name',
        label: t('nameLabel'),
        icon: manifest.icon,
        color: manifest.accentColor,
        order: 10,
        input: {
          kind: 'text',
          refType: TYPE,
          field: 'name',
          maxLength: 12,
          uppercase: true,
          placeholder: name || undefined,
          suggestedValue: name || undefined,
        },
      },
      {
        key: 'cwt/number',
        label: t('numberLabel'),
        icon: manifest.icon,
        color: manifest.accentColor,
        order: 20,
        input: {
          kind: 'text',
          refType: TYPE,
          field: 'number',
          maxLength: 6,
          uppercase: true,
          pattern: NUMBER_PATTERN,
          // A HINT, never a suggested value — see `guessedQth`. Most CWT
          // participants are members sending a number, and pre-filling a state
          // would stamp the wrong exchange onto the majority of contacts.
          placeholder: qth || undefined,
        },
      },
    ]
  },

  /// Records what was received, and mirrors it where the rest of the app can
  /// see it (docs/design/contests.md §8).
  async processQsoBeforeSave(
    { qso, operation }: { qso: Record<string, JSONValue>; operation: Record<string, JSONValue> },
    _ctx: HookContext,
  ): Promise<Record<string, JSONValue> | null> {
    if (!refOfType(operation, TYPE)) return null

    const their = (qso.their as Record<string, JSONValue>) ?? {}
    const qsoRef = refOfType(qso, TYPE)

    // PRESENCE of each field, not its truthiness. The core writes `field: ''`
    // when the operator empties one on purpose and drops the key entirely when
    // it was never filled in — so a present key, blank or not, is a decision,
    // and guessing over it would put back what they just removed.
    const nameDecided = qsoRef !== undefined && 'name' in qsoRef
    const numberDecided = qsoRef !== undefined && 'number' in qsoRef
    const name = nameDecided ? firstName(qsoRef.name) : guessedName(their)
    // The number is never guessed — only what the operator typed is recorded.
    const number = numberDecided ? normalizeNumber(qsoRef.number) : ''

    if (!name && !number) {
      // A deliberate blank still projects, so clearing an exchange on an edit
      // clears the QSO row's column too instead of leaving the old value there.
      return nameDecided || numberDecided ? { their: { exchange: '' } } : null
    }

    // Only the halves that carry something or that the operator already
    // decided: an object literal would stamp `number: ''` onto every QSO, which
    // the presence rule above then reads back forever as "emptied on purpose".
    const refPatch: Record<string, JSONValue> = { type: TYPE }
    if (name || nameDecided) refPatch.name = name
    if (number || numberDecided) refPatch.number = number

    return {
      refs: [refPatch],
      their: { exchange: [name, number].filter((x) => x).join(' ') },
    }
  },
} satisfies ActivityHookType
