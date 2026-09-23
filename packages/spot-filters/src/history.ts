// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT

export type HistoryRecords = Readonly<Record<string, { call: string }>>

/**
 * Pure file-membership evidence, independent of the temporary hook protocol.
 * Keep this matcher when native spot relevance replaces source-side filtering.
 * A match does not establish participation, membership, or scoring eligibility.
 * The caller must distinguish an unavailable file from an available empty file.
 */
export function matchHistoryCalls(
  calls: readonly string[],
  records: HistoryRecords,
  lookupKeys: (call: string) => string[],
): string[] {
  return [...new Set(calls.map((call) => call.trim().toUpperCase()))].filter((call) =>
    lookupKeys(call).some((key) => records[key]?.call === key),
  )
}
