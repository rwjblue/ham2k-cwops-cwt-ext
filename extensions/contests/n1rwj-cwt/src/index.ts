import { contestScorer, defineExtension, host } from '@ham2k/extension-sdk'
import manifest from '../manifest.json'
import { AdifFieldsHook, CWTScorer, ExportHook, RefHandler } from './cwt/index.ts'
import { DataFile, fileCache, Settings, savedSettings } from './data/hooks.ts'
import { createPrefill } from './integration/prefill.ts'

import { createSpotsHook } from './spots/hook.ts'

const spots = createSpotsHook({
  fetch: (url, options) => host.fetch(url, options),
  source: manifest.key,
  fileCache,
  historyOnly: async () => (await savedSettings()).spotsHistoryOnly !== false,
})

const prefill = createPrefill(fileCache)

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook('activity', { hook: prefill.activity })
    registerHook('ref:cwt', { hook: RefHandler })
    registerHook('adifFields', { hook: AdifFieldsHook })
    registerHook('export', { hook: ExportHook })
    registerHook('scoring', {
      hook: prefill.scoring(contestScorer(CWTScorer, { scope: { refTypes: ['cwt'] } })),
    })
    registerHook('lookup', { hook: prefill.lookup })
    registerHook('dataFile', { key: DataFile.key, hook: DataFile })
    registerHook('settingsPanel', { hook: Settings })
    registerHook('spots', { hook: spots })
    void fileCache.load()
  },
})
