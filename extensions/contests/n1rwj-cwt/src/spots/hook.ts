// Copyright © 2026 Robert Jackson, N1RWJ
// SPDX-License-Identifier: MPL-2.0

import type { SpotsHook } from '@ham2k/extension-sdk'
import type { FileCache } from '../data/cache.ts'
import { createSpotFeed, type FeedOptions } from './feed.ts'
import { selectSpots } from './model.ts'

export function createSpotsHook(
  options: FeedOptions & {
    fileCache: FileCache
    historyOnly(): Promise<boolean>
  },
): SpotsHook {
  const feed = createSpotFeed(options)
  const now = options.now ?? Date.now
  return {
    sourceName: 'CWT · RBN',
    async fetchSpots(_args, ctx) {
      await options.fileCache.load()
      const historyOnly = await options.historyOnly()
      if (historyOnly && !options.fileCache.current()) return []
      const reports = await feed.get(ctx.online)
      // Read again after the request: the user may have replaced/removed the file.
      return selectSpots(reports, options.fileCache.current()?.parsed.records, historyOnly, now())
    },
  }
}
