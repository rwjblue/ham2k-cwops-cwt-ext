// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MIT
import { createHistoryCallFilter } from '../../../../../packages/spot-filters/src/index.ts'
import { tFor } from '../cwt/i18n.ts'
import { callLookupKeys } from '../history/callsign.ts'
import { fileCache, savedSettings } from './hooks.ts'

export const callFilter = createHistoryCallFilter({
  label: (ctx) => tFor(ctx)('spotsFilterLabel'),
  unavailableReason: (ctx) => tFor(ctx)('historyEmpty'),
  async records() {
    await fileCache.load()
    return fileCache.current()?.parsed.records
  },
  lookupKeys: callLookupKeys,
  // Preserve an explicit opt-out from the earlier standalone CWT source.
  defaultSelected: async () => (await savedSettings()).spotsHistoryOnly !== false,
})
