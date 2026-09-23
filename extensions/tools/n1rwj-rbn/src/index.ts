import { defineExtension } from '@ham2k/extension-sdk'
import manifest from '../manifest.json'
import { rbnFetch } from './data/host-client.ts'
import { createReceiverData } from './data/receivers.ts'
import { createRbnPanel } from './panel.ts'
import { createRbnSpots } from './spots/index.ts'

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    const receivers = createReceiverData()
    // Share receiver metadata, never receiver selection. Spots preferences are
    // owned by createRbnSpots; My Signal uses its own per-panel configuration.
    const { spots, settings } = createRbnSpots({ fetch: rbnFetch, lookup: receivers.lookup })
    registerHook('spots', { hook: spots })
    registerHook('settingsPanel', { hook: settings })
    registerHook('dataFile', { key: receivers.dataFile.key, hook: receivers.dataFile })
    registerHook('panel', {
      key: manifest.key,
      hook: createRbnPanel({ enrichReports: receivers.enrichReports }),
    })
  },
})
