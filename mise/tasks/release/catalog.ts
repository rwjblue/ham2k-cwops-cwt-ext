#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Submit exact GitHub release bundles to the Ham2K catalog (see docs/PUBLISHING.md)"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] arg "<tag>" env="RELEASE_TAG" help="Published GitHub release matching this checkout, such as v0.2.0"
//[USAGE] arg "[key]" help="Submit only this extension; omit to submit all extensions"
//[USAGE] flag "--channel <channel>" help="Override the default stable/unstable release channel" {
//[USAGE]   choices "stable" "unstable" "bleeding"
//[USAGE] }
//[USAGE] flag "--dry-run" help="Validate release assets and preview each extension's notes without submitting"

import { publishCatalogRelease } from '../../../scripts/lib/catalog-publish.ts'
import { withCatalogRelease } from '../../../scripts/lib/catalog-release.ts'

const root = process.cwd()
const dryRun = process.env.usage_dry_run === 'true'
const token = process.env.H2K_CATALOG_TOKEN
if (!dryRun && !token?.trim()) {
  throw new Error('Set H2K_CATALOG_TOKEN in .env.local or the GitHub Actions secret first.')
}

await withCatalogRelease(
  root,
  process.env.usage_tag ?? '',
  process.env.usage_key,
  async (release) =>
    publishCatalogRelease(root, release, {
      token,
      channel: process.env.usage_channel,
      dryRun,
    }),
)
