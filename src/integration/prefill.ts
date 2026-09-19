import type {
  ActivityHook,
  HookContext,
  JSONValue,
  LookupHook,
  ScoringHook,
} from '@ham2k/extension-sdk'
import { firstName } from '../cwt/exchange.ts'
import { ActivityHook as UpstreamActivity } from '../cwt/index.ts'
import type { FileCache } from '../data/cache.ts'
import { resolveCwtExchange } from '../history/index.ts'
import { createHistoryAdapter, cwtRef, object, text } from './history.ts'

type Qson = Record<string, JSONValue>

// Ham2K ignores an empty suggestedValue instead of clearing an old guess.
// One space clears an untouched control and is trimmed out on save. A touched
// field (including a deliberate blank) is protected by the native host.
export const EMPTY_SUGGESTION = ' '

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
        const suggestion =
          field === 'name'
            ? firstName(resolved.name?.value) || control.input.suggestedValue
            : field === 'number'
              ? resolved.number?.value
              : undefined
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
      const fields = [
        result.name && `name ${result.name.value} (${result.name.source})`,
        result.number && `exchange ${result.number.value} (${result.number.source})`,
      ].filter(Boolean)
      const file = cache.current()
      const freshness =
        file && [result.name?.source, result.number?.source].includes('selected-file')
          ? `; file ${file.parsed.sourceUpdatedAt ?? 'date unknown'}, downloaded ${file.snapshot.fetchedAt.slice(0, 10)}`
          : ''
      return [
        {
          call: callInfo.call ?? '',
          source: 'n1rwj-cwt',
          scope: 'general',
          notes: [`CWT: ${fields.join('; ')}${freshness}`],
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
