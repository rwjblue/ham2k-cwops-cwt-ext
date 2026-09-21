// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Adapted from Ham2K CWT; see docs/PROVENANCE.md.

import type {
  HookContext,
  JSONValue,
  Ref,
  RefHandlerHook,
  RefLink,
  TitleSuggestion,
} from '@ham2k/extension-sdk'
import manifest from '../../manifest.json'
import { ourExchange } from './exchange.ts'
import { tFor } from './i18n.ts'
import { sessionDateLabel, sessionFor, sessionShortLabel } from './schedule.ts'

export const RefHandler = {
  async validateRef({ ref }: { ref: Ref }, _ctx: HookContext) {
    const normalized = (ref.ref ?? '').trim()
    return { valid: sessionFor(normalized) !== undefined, normalized }
  },

  async decorateRef({ ref }: { ref: Ref }, ctx: HookContext): Promise<Ref> {
    const t = tFor(ctx)
    const session = sessionFor(ref.ref)
    if (!session) return { ...ref, program: 'Contest', label: t('unconfigured') }
    const { name, number } = ourExchange(ref as Record<string, JSONValue>)
    return {
      ...ref,
      ref: session.key,
      program: 'Contest',
      label: sessionShortLabel(session),
      shortLabel: sessionShortLabel(session),
      // The row's second line SAYS when the exchange is still missing. A
      // suggestion tapped and then cancelled leaves a reference that names a
      // real session and nothing else, and a row reading like a configured
      // contest is how an operator reaches the Cabrillo with every sent
      // exchange exported as a dash.
      name: [
        sessionDateLabel(session),
        [name, number].filter((x) => x).join(' ') || t('notConfigured'),
      ].join(' · '),
    }
  },

  /// "KI2D for CWT 1300z" with "SEB 1234" beneath it: the sent exchange is the
  /// one thing an operator re-reads constantly during a contest.
  async suggestOperationTitle(
    { ref }: { ref: Ref; operation: Record<string, JSONValue> },
    ctx: HookContext,
  ): Promise<TitleSuggestion | null> {
    const session = sessionFor(ref.ref)
    const { name, number } = ourExchange(ref as Record<string, JSONValue>)
    return {
      for: session ? sessionShortLabel(session) : manifest.shortName,
      subtitle: name || number ? tFor(ctx)('ourExchangeSubtitle', { name, number }) : undefined,
    }
  },

  async linkForRef(_args: { ref: Ref }, _ctx: HookContext): Promise<RefLink | null> {
    return { url: 'https://cwops.org/cwops-tests/', label: 'CWops CWT' }
  },
} satisfies RefHandlerHook
