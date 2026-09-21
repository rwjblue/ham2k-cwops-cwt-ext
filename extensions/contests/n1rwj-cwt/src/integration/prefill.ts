import type {
  ActivityHook,
  HookContext,
  JSONValue,
  LookupHook,
  ScoringHook,
} from '@ham2k/extension-sdk'
import manifest from '../../manifest.json'
import { firstName, guessedQth } from '../cwt/exchange.ts'
import { tFor } from '../cwt/i18n.ts'
import { ActivityHook as UpstreamActivity } from '../cwt/index.ts'
import type { FileCache } from '../data/cache.ts'
import { callLookupKeys } from '../history/callsign.ts'
import { membershipForExchange, normalizeKnownExchange } from '../history/exchange.ts'
import { resolveCwtExchange } from '../history/index.ts'
import { createHistoryAdapter, cwtRef, object, text } from './history.ts'

type Qson = Record<string, JSONValue>

// Ham2K ignores an empty suggestedValue instead of clearing an old guess.
// One space clears an untouched control and is trimmed out on save. A touched
// field (including a deliberate blank) is protected by the native host.
export const EMPTY_SUGGESTION = ' '

const SOURCE_LABELS = {
  operator: 'prefillSourceOperator',
  'current-operation': 'prefillSourceCurrentOperation',
  'selected-file': 'prefillSourceSelectedFile',
  'older-history': 'prefillSourceOlderHistory',
} as const

function locationSuggestion(qso: Qson): string | undefined {
  const their = object(qso.their)
  if (!callLookupKeys(text(their.call)).length) return undefined
  const qth = normalizeKnownExchange(guessedQth(their))
  // Location data may suggest a QTH, never a member number or CWA status.
  return membershipForExchange(qth) === 'nonmember' ? qth : undefined
}

export function createPrefill(cache: FileCache) {
  const history = createHistoryAdapter()
  async function resolve(operation: Qson, qso: Qson, ctx: HookContext) {
    await cache.load()
    const tiers = await history.find(operation, qso, ctx)
    return resolveCwtExchange({
      call: text(object(qso.their).call),
      ...tiers,
      selectedFile: cache.current()?.parsed.records,
    })
  }

  const activity = {
    ...UpstreamActivity,
    async loggingControls(args, ctx) {
      const controls = await UpstreamActivity.loggingControls(args, ctx)
      if (!controls.length) return controls
      const resolved = await resolve(args.operation, args.qso ?? {}, ctx)
      return controls.map((control) => {
        if (control.input.kind !== 'text') return control
        const field = control.input.field
        if (control.input.refType !== 'cwt' || (field !== 'name' && field !== 'number'))
          return control
        const suggestion =
          field === 'name'
            ? firstName(resolved.name?.value) || control.input.suggestedValue
            : resolved.number?.value || locationSuggestion(args.qso ?? {})
        return {
          ...control,
          input: { ...control.input, suggestedValue: suggestion || EMPTY_SUGGESTION },
        }
      })
    },
  } satisfies ActivityHook

  const lookup: LookupHook = {
    async lookupCall({ operation, qso, callInfo }, ctx) {
      if (!cwtRef(operation)) return []
      const result = await resolve(
        operation,
        { ...qso, their: { ...object(qso.their), call: callInfo.call ?? '' } },
        ctx,
      )
      if (!result.name && !result.number) return []
      const t = tFor(ctx)
      const fields = [
        result.name &&
          t('prefillName', {
            value: result.name.value,
            source: t(SOURCE_LABELS[result.name.source]),
          }),
        result.number &&
          t('prefillExchange', {
            value: result.number.value,
            source: t(SOURCE_LABELS[result.number.source]),
          }),
      ].filter(Boolean)
      const file = cache.current()
      const freshness =
        file && [result.name?.source, result.number?.source].includes('selected-file')
          ? t('prefillFreshness', {
              fileDate: file.parsed.sourceUpdatedAt ?? t('prefillUnknownDate'),
              downloadDate: file.snapshot.fetchedAt.slice(0, 10),
            })
          : ''
      return [
        {
          call: callInfo.call ?? '',
          source: manifest.key,
          scope: 'general',
          notes: [t('prefillNote', { fields: fields.join('; '), freshness })],
        },
      ]
    },
  }

  function scoring(base: ScoringHook): ScoringHook {
    return {
      ...base,
      async scoreQsos(args, ctx) {
        history.update(args)
        return base.scoreQsos(args, ctx)
      },
    }
  }
  return { activity, lookup, scoring, history }
}
