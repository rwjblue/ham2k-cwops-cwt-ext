import { defineExtension, host } from '@ham2k/extension-sdk'
import manifest from '../manifest.json'
import { createLiveReception } from './live.ts'
import { createPskPanel } from './panel.ts'
import { createPersistentStorage } from './storage.ts'

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    const live = createLiveReception(
      (url, options) => host.webSocket(url, options),
      Date.now,
      Math.random,
      {
        fetch: (url, options) => host.fetch(url, options),
        ...createPersistentStorage(host, manifest.key),
      },
    )
    registerHook('panel', { key: manifest.key, hook: createPskPanel(live) })
  },
})
