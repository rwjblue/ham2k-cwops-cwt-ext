#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Build all extensions, or one key, with official Ham2K ES2020 tools"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] arg "[key]" help="Extension key; omit to build every extension"

import { buildExtensions } from '../../scripts/lib/build.ts'

await buildExtensions(process.cwd(), process.env.usage_key)
