import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The published SDK imports JSON without Node import attributes; Vite
    // must transform those imports before Node can execute the SDK in tests.
    server: { deps: { inline: ['@ham2k/extension-sdk'] } },
  },
})
