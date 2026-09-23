import { defineExtension, host } from '@ham2k/extension-sdk'
import manifest from '../manifest.json'
import { createLiveReception } from './live.ts'
import { createPskPanel } from './panel.ts'

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    const live = createLiveReception((url, options) => host.webSocket(url, options))
    registerHook('panel', { key: manifest.key, hook: createPskPanel(live) })
  },
})
