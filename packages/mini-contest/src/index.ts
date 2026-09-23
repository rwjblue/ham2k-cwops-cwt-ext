import type { ScoringHook } from '@ham2k/extension-sdk'
import { contestScorer } from '@ham2k/extension-sdk'
import { callLookupKeys } from '../../n1mm/src/callsign.ts'
import { createHistoryCallFilter } from '../../spot-filters/src/index.ts'
import { createActivity } from './activity.ts'
import { createHistoryData } from './data.ts'
import { createExports } from './exports.ts'
import type { ContestConfig, ContestManifest } from './model.ts'
import { createScorer } from './scorer.ts'

export function createMiniContest(config: ContestConfig, manifest: ContestManifest) {
  const data = createHistoryData(config, manifest)
  const { activity, refHandler, history } = createActivity(config, manifest, data.current)
  const { adifFields, exports } = createExports(config, manifest)
  const base = contestScorer(createScorer(config), { scope: { refTypes: [config.type] } })
  const scoring: ScoringHook = {
    ...base,
    async scoreQsos(args, ctx) {
      history.update(args)
      return base.scoreQsos(args, ctx)
    },
  }
  return {
    // Temporary MST/SST transport; remove with native relevance support.
    // Keep cached history/matching separate from QSO scoring eligibility.
    // Migration: packages/spot-filters/README.md.
    callFilter: createHistoryCallFilter({
      label: () => `${config.shortName} call-history file`,
      unavailableReason: () =>
        `Download the ${config.shortName} call-history file in extension settings.`,
      records: async () => data.current()?.records,
      lookupKeys: callLookupKeys,
    }),
    activity,
    refHandler,
    adifFields,
    exports,
    scoring,
    dataFile: data.dataFile,
    settings: data.settings,
  }
}
