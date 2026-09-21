import type { ScoringHook } from '@ham2k/extension-sdk'
import { contestScorer } from '@ham2k/extension-sdk'
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
    activity,
    refHandler,
    adifFields,
    exports,
    scoring,
    dataFile: data.dataFile,
    settings: data.settings,
  }
}
