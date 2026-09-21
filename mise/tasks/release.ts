#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Check and attach every extension bundle to an existing GitHub release"
//[MISE] depends=["check", "local-tasks-npm-install"]
//[USAGE] arg "<tag>" env="RELEASE_TAG" help="Release tag matching all versions, such as v0.2.0"
//[USAGE] flag "--dry-run" help="Validate exact release assets without uploading"

import { execFileSync } from 'node:child_process'
import { validateRelease } from '../../scripts/lib/release.ts'

const tag = process.env.usage_tag ?? ''
const assets = await validateRelease(process.cwd(), tag)
if (process.env.usage_dry_run === 'true') {
  console.log(`Validated ${tag}:\n${assets.join('\n')}`)
} else {
  // Refuse to clobber existing assets users may already have downloaded.
  execFileSync('gh', ['release', 'upload', tag, ...assets], { stdio: 'inherit' })
}
