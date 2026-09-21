#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Bootstrap a typed, tested extension in the monorepo"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] arg "<key>" help="Unique lowercase callsign-prefixed key, such as n1rwj-notes"
//[USAGE] flag "--name <name>" help="Display name"
//[USAGE] flag "--group <group>" default="dashboards" help="Directory under extensions/"

import { execFileSync } from 'node:child_process'
import { scaffoldExtension } from '../../../scripts/lib/scaffold.ts'

const dir = await scaffoldExtension(process.cwd(), {
  key: process.env.usage_key ?? '',
  name: process.env.usage_name,
  group: process.env.usage_group,
})
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { stdio: 'inherit' })
execFileSync('npx', ['--no-install', 'biome', 'check', '--write', dir], { stdio: 'inherit' })
console.log(`Created ${dir}\nRun mise run check, then adapt its typed panel hook.`)
