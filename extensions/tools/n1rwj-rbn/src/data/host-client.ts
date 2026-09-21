import { host } from '@ham2k/extension-sdk'
import { createRbnClient } from './client.ts'

/** All network access stays on the SDK bridge; the sandbox has no global fetch. */
export const rbnClient = createRbnClient({ fetch: (url, options) => host.fetch(url, options) })
