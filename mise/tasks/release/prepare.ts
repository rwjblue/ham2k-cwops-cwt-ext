#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Set the synchronized repository, extension, and shared package version"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] arg "<version>" help="SemVer without a v prefix, such as 0.3.0"

import { prepareRelease } from '../../../scripts/lib/release.ts'

const version = process.env.usage_version ?? ''
const files = await prepareRelease(process.cwd(), version)
console.log(
  `Prepared v${version}:\n${files.join('\n')}\nRun mise run check before committing and tagging.`,
)
