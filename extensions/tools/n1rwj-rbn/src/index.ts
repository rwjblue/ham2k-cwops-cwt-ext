import { defineExtension } from '@ham2k/extension-sdk'
import manifest from '../manifest.json'
import { createReceiverData } from './data/receivers.ts'
import { createRbnPanel } from './panel.ts'

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    const receivers = createReceiverData()
    registerHook('dataFile', { key: receivers.dataFile.key, hook: receivers.dataFile })
    registerHook('panel', {
      key: manifest.key,
      hook: createRbnPanel({ enrichReports: receivers.enrichReports }),
    })
  },
})
