// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Adapted from Ham2K CWT activity controls and weekly session suggestions.
import type {
  ActivityHook,
  ActivitySuggestion,
  FormElement,
  HookContext,
  LoggingControlDescriptor,
  RefHandlerHook,
} from '@ham2k/extension-sdk'
import { isCallsign } from '../../n1mm/src/callsign.ts'
import {
  exchangeText,
  firstName,
  guessedLocation,
  guessedName,
  location,
  received,
  serial,
} from './exchange.ts'
import type { HistoryFile } from './history.ts'
import { createHistory } from './history.ts'
import {
  type ContestConfig,
  type ContestManifest,
  object,
  POWER_CLASSES,
  refOf,
  text,
} from './model.ts'
import {
  type Session,
  sessionAtHand,
  sessionDateLabel,
  sessionFor,
  sessionLabel,
  sessionsFrom,
} from './schedule.ts'

export function createActivity(
  config: ContestConfig,
  manifest: ContestManifest,
  file: () => HistoryFile | undefined = () => undefined,
) {
  const history = createHistory(config)
  const suggestion = (session: Session, now: number): ActivitySuggestion => ({
    type: config.type,
    ref: session.key,
    program: 'Contest',
    label: sessionLabel(config, session),
    shortLabel: sessionLabel(config, session),
    name: `${sessionDateLabel(session)} · ${config.name}`,
    relevance: 1 / (1 + Math.max(0, session.startMillis - now) / 86_400_000),
  })
  const activity = {
    async suggest({ searchTerm, scoped }, _ctx: HookContext) {
      const term = (searchTerm ?? '').trim().toUpperCase()
      const namesContest = !term || config.aliases.some((alias) => alias.includes(term))
      if (!scoped && !namesContest) return []
      const now = Date.now()
      if (!term && !scoped) {
        const session = sessionAtHand(config, now)
        return session ? [suggestion(session, now)] : []
      }
      const exact = scoped ? sessionFor(config, term) : undefined
      if (exact) return [suggestion(exact, now)]
      return sessionsFrom(config, now)
        .filter(
          (session) =>
            namesContest ||
            `${session.key} ${sessionLabel(config, session)}`.toUpperCase().includes(term),
        )
        .map((session) => suggestion(session, now))
    },
    async operationControls({ operation }, _ctx: HookContext) {
      const current = text(refOf(operation, config.type)?.ref)
      const options = sessionsFrom(config, Date.now()).map((session) => ({
        value: session.key,
        label: sessionDateLabel(session),
      }))
      if (current && !options.some((option) => option.value === current))
        options.unshift({ value: current, label: current })
      const elements: FormElement[] = [
        {
          type: 'field',
          fieldType: 'select',
          key: 'ref',
          label: 'Session (UTC)',
          value: current || options[0]?.value,
          options,
        },
        {
          type: 'field',
          fieldType: 'text',
          key: 'ourName',
          label: 'Your exchange name',
          uppercase: true,
        },
      ]
      if (config.exchange === 'name-location')
        elements.push({
          type: 'field',
          fieldType: 'text',
          key: 'ourLocation',
          label: 'Your state / province / DX',
          uppercase: true,
          placeholder: 'MA, ON or DX',
        })
      elements.push(
        {
          type: 'field',
          fieldType: 'radio',
          key: 'power',
          label: 'Power class',
          options: POWER_CLASSES.map(({ value, label }) => ({ value, label })),
        },
        { type: 'markdown', text: `${config.guidance}\n\n[Official rules](${config.rulesUrl})` },
      )
      return [
        {
          key: `${manifest.key}/setup`,
          label: config.name,
          icon: manifest.icon,
          color: manifest.accentColor,
          order: 10,
          editable: true,
          input: {
            kind: 'form',
            refType: config.type,
            form: { title: `${config.shortName} setup`, elements },
          },
        },
      ]
    },
    async loggingControls({ operation, qso }, ctx) {
      if (!refOf(operation, config.type)) return []
      const draft = qso ?? {}
      const hints = await history.suggestions(operation, draft, ctx, file())
      const their = object(draft.their)
      const validCall = isCallsign(text(their.call))
      const name = hints.name || (validCall ? guessedName(their) : '')
      const qth = hints.location || (validCall ? guessedLocation(their) : '')
      // Native touched-field tracking protects edits and intentional clearing.
      // A single space clears an untouched old guess; an empty string is
      // ignored by the host and would leave the previous station's exchange.
      const control = (
        field: string,
        label: string,
        order: number,
        input: LoggingControlDescriptor['input'],
      ): LoggingControlDescriptor => ({
        key: `${manifest.key}/${field}`,
        label,
        order,
        icon: manifest.icon,
        color: manifest.accentColor,
        input,
      })
      if (config.exchange === 'serial-name')
        return [
          control('ourSerial', 'Sent #', 10, {
            kind: 'serial',
            refType: config.type,
            field: 'ourSerial',
            sequence: { key: `${config.type}-serial`, start: 1 },
          }),
          control('theirSerial', 'Received #', 20, {
            kind: 'text',
            refType: config.type,
            field: 'theirSerial',
            numeric: true,
            pattern: '[0-9]+',
            maxLength: 6,
          }),
          control('name', 'Name', 30, {
            kind: 'text',
            refType: config.type,
            field: 'name',
            uppercase: true,
            maxLength: 20,
            suggestedValue: name || ' ',
            placeholder: name || undefined,
          }),
        ]
      return [
        control('name', 'Name', 10, {
          kind: 'text',
          refType: config.type,
          field: 'name',
          uppercase: true,
          maxLength: 20,
          suggestedValue: name || ' ',
          placeholder: name || undefined,
        }),
        control('location', 'State / province / DX', 20, {
          kind: 'text',
          refType: config.type,
          field: 'location',
          uppercase: true,
          pattern: '[A-Z]{2}',
          maxLength: 4,
          suggestedValue: qth || ' ',
          placeholder: qth || undefined,
        }),
      ]
    },
    async processQsoBeforeSave({ operation, qso }, _ctx: HookContext) {
      if (!refOf(operation, config.type)) return null
      const ref = refOf(qso, config.type)
      const hasReceived =
        ref &&
        ('name' in ref ||
          (config.exchange === 'serial-name' ? 'theirSerial' in ref : 'location' in ref))
      if (config.exchange === 'serial-name')
        return {
          our: { exchange: serial(ref?.ourSerial) },
          ...(hasReceived
            ? { their: { exchange: exchangeText(config, received(config, qso)) } }
            : {}),
        }
      return hasReceived
        ? { their: { exchange: exchangeText(config, received(config, qso)) } }
        : null
    },
  } satisfies ActivityHook
  const refHandler = {
    async validateRef({ ref }, _ctx: HookContext) {
      const normalized = (ref.ref ?? '').trim()
      return { valid: !!sessionFor(config, normalized), normalized }
    },
    async decorateRef({ ref }, _ctx: HookContext) {
      const session = sessionFor(config, ref.ref)
      const ours = [
        firstName(ref.ourName),
        config.exchange === 'name-location' ? location(ref.ourLocation) : '',
      ]
        .filter(Boolean)
        .join(' ')
      return {
        ...ref,
        program: 'Contest',
        label: session ? sessionLabel(config, session) : config.shortName,
        shortLabel: session ? sessionLabel(config, session) : config.shortName,
        name: [
          session ? sessionDateLabel(session) : 'Select a session',
          ours || 'Exchange not configured',
        ].join(' · '),
      }
    },
    async suggestOperationTitle({ ref }, _ctx: HookContext) {
      const session = sessionFor(config, ref.ref)
      return {
        for: session ? sessionLabel(config, session) : config.shortName,
        subtitle:
          [
            firstName(ref.ourName),
            config.exchange === 'name-location' ? location(ref.ourLocation) : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
      }
    },
    async linkForRef() {
      return { url: config.rulesUrl, label: `${config.name} rules` }
    },
  } satisfies RefHandlerHook
  return { activity, refHandler, history }
}
