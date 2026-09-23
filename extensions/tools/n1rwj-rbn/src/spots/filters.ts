import { hooks } from '@ham2k/extension-sdk'
import {
  callFilterCategory,
  type FilterDescriptor,
  maxFilterCalls,
  readDescriptor,
  readMatches,
} from '../../../../../packages/spot-filters/src/index.ts'

export const allCalls = 'none'
export type Provider = FilterDescriptor & { key: string }
export type FilterBridge = Pick<typeof hooks, 'invokeAll' | 'invokeOne'>

export async function discoverFilters(online: boolean, bridge: FilterBridge = hooks) {
  const replies = await bridge.invokeAll(callFilterCategory, 'describe', {}, online)
  const providers: Provider[] = []
  let failed = false
  for (const reply of replies) {
    const descriptor = reply.ok ? readDescriptor(reply.value) : undefined
    if (descriptor) providers.push({ ...descriptor, key: reply.key })
    else failed = true
  }
  return { providers, failed }
}

export async function matchFilter(
  key: string,
  calls: string[],
  online: boolean,
  bridge: FilterBridge = hooks,
): Promise<Set<string>> {
  const unique = [...new Set(calls)]
  const selected = new Set<string>()
  // Even an empty batch checks that the provider still has its file.
  for (let offset = 0; offset === 0 || offset < unique.length; offset += maxFilterCalls) {
    const batch = unique.slice(offset, offset + maxFilterCalls)
    const replies = await bridge.invokeOne(
      callFilterCategory,
      key,
      'matchCalls',
      { version: 1, calls: batch },
      online,
    )
    const reply = replies.length === 1 && replies[0]?.key === key ? replies[0] : undefined
    const result = reply?.ok ? readMatches(reply.value, batch) : undefined
    if (!result?.available)
      throw new Error(
        result?.reason || 'The selected call-history filter is unavailable. No spots shown.',
      )
    for (const call of result.calls) selected.add(call)
  }
  return selected
}
