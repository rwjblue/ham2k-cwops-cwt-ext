#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="List extension keys, versions, and source directories"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] flag "--json" help="Print machine-readable extension information"

import { discoverExtensions } from '../../../scripts/lib/extensions.ts'

const extensions = await discoverExtensions(process.cwd())
if (process.env.usage_json === 'true') {
  console.log(
    JSON.stringify(
      extensions.map(({ path, manifest }) => ({ path, ...manifest })),
      null,
      2,
    ),
  )
} else {
  for (const { path, manifest } of extensions) {
    console.log(`${manifest.key}\t${manifest.version}\t${path}`)
  }
}
