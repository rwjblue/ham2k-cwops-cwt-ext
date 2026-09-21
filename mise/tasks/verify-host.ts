#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Verify extensions against the running or newest installed macOS Ham2K kernel"
//[MISE] depends=["build", "local-tasks-npm-install"]
//[USAGE] arg "[key]" help="Extension key; omit to verify all extensions"
//[USAGE] flag "--app <path>" help="Explicit installed .app path"

import { verifyInstalledHost } from '../../scripts/verify-installed-host.ts'

await verifyInstalledHost(process.cwd(), process.env.usage_key, process.env.usage_app)
