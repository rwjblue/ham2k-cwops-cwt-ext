import { host } from '@ham2k/extension-sdk'
import { createRbnClient } from './client.ts'
import { createRbnTransport } from './transport.ts'

/** All network access stays on the SDK bridge; the sandbox has no global fetch. */
export const rbnFetch = createRbnTransport((url, options) => host.fetch(url, options))
export const rbnClient = createRbnClient({ fetch: rbnFetch })
