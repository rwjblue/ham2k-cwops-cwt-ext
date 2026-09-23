import type { ExtensionWebSocket, host } from '@ham2k/extension-sdk'

/** Transport seam derived from the published SDK; mocks implement the same contract. */
export type ReceptionSocket = ExtensionWebSocket
export type OpenSocket = typeof host.webSocket
