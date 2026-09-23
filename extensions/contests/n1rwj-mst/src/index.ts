import { defineExtension } from '@ham2k/extension-sdk'
import { createMiniContest } from '../../../../packages/mini-contest/src/index.ts'
import { callFilterCategory } from '../../../../packages/spot-filters/src/index.ts'
import manifest from '../manifest.json'
import { config } from './config.ts'

const hooks = createMiniContest(config, manifest)
defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook(callFilterCategory, { hook: hooks.callFilter })
    registerHook('activity', { hook: hooks.activity })
    registerHook('ref:mst', { hook: hooks.refHandler })
    registerHook('adifFields', { hook: hooks.adifFields })
    registerHook('export', { hook: hooks.exports })
    registerHook('scoring', { hook: hooks.scoring })
    registerHook('dataFile', { key: hooks.dataFile.key, hook: hooks.dataFile })
    registerHook('settingsPanel', { hook: hooks.settings })
  },
})
