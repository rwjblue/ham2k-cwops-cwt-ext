// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT

import type { HookContext } from '@ham2k/extension-sdk'

/** Extension-to-extension protocol, not a built-in Ham2K UI hook. */
export const callFilterCategory = 'spotCallFilter:v1'
export const maxFilterCalls = 2000

export type FilterDescriptor = {
  version: 1
  label: string
  available: boolean
  reason?: string
  defaultSelected: boolean
}
export type MatchRequest = { version: 1; calls: string[] }
export type MatchResult = { version: 1; available: boolean; calls: string[]; reason?: string }
export type CallFilterHook = {
  describe(args: Record<string, never>, ctx: HookContext): Promise<FilterDescriptor>
  matchCalls(args: MatchRequest, ctx: HookContext): Promise<MatchResult>
}

type Records = Readonly<Record<string, { call: string }>>
type ProviderOptions = {
  label(ctx: HookContext): string
  unavailableReason(ctx: HookContext): string
  records(): Promise<Records | undefined>
  lookupKeys(call: string): string[]
  defaultSelected?(): Promise<boolean>
}

/** Only file membership crosses the boundary; exchanges and logs stay private. */
export function createHistoryCallFilter(options: ProviderOptions): CallFilterHook {
  return {
    async describe(_args, ctx) {
      const available = (await options.records()) !== undefined
      return {
        version: 1,
        label: options.label(ctx),
        available,
        defaultSelected: (await options.defaultSelected?.()) ?? false,
        ...(!available ? { reason: options.unavailableReason(ctx) } : {}),
      }
    },
    async matchCalls(args, ctx) {
      if (
        args?.version !== 1 ||
        !Array.isArray(args.calls) ||
        args.calls.length > maxFilterCalls ||
        args.calls.some((call) => typeof call !== 'string' || call.length > 64)
      ) {
        throw new Error('Unsupported spot call-filter request')
      }
      const records = await options.records()
      if (!records)
        return { version: 1, available: false, calls: [], reason: options.unavailableReason(ctx) }
      return {
        version: 1,
        available: true,
        calls: [...new Set(args.calls.map((call) => call.trim().toUpperCase()))].filter((call) =>
          options.lookupKeys(call).some((key) => records[key]?.call === key),
        ),
      }
    },
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Validate each bundle's independently compiled protocol at the boundary. */
export function readDescriptor(value: unknown): FilterDescriptor | undefined {
  const raw = object(value)
  if (
    raw.version !== 1 ||
    typeof raw.label !== 'string' ||
    !raw.label.trim() ||
    raw.label.length > 160 ||
    typeof raw.available !== 'boolean' ||
    typeof raw.defaultSelected !== 'boolean' ||
    (raw.reason !== undefined && typeof raw.reason !== 'string')
  )
    return undefined
  return raw as FilterDescriptor
}

export function readMatches(value: unknown, requested: readonly string[]): MatchResult | undefined {
  const raw = object(value)
  const allowed = new Set(requested)
  if (
    raw.version !== 1 ||
    typeof raw.available !== 'boolean' ||
    !Array.isArray(raw.calls) ||
    raw.calls.length > maxFilterCalls ||
    raw.calls.some((call) => typeof call !== 'string' || !allowed.has(call)) ||
    (raw.reason !== undefined && typeof raw.reason !== 'string') ||
    (!raw.available && raw.calls.length)
  )
    return undefined
  return raw as MatchResult
}
