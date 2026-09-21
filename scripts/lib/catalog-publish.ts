import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { prerelease, valid } from 'semver'
import type { CatalogRelease } from './catalog-release.ts'

const channels = ['stable', 'unstable', 'bleeding']
const maxBundleBytes = 16 * 1024 * 1024

export interface CatalogPublishOptions {
  token?: string
  channel?: string
  dryRun?: boolean
}

export type CatalogPublisher = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' },
) => void

interface CatalogPublishDependencies {
  runPublisher?: CatalogPublisher
  log?: (message: string) => void
}

export function publishCatalogRelease(
  root: string,
  release: CatalogRelease,
  options: CatalogPublishOptions = {},
  dependencies: CatalogPublishDependencies = {},
): void {
  if (release.bundles.length === 0) throw new Error('No release bundles selected for publishing')
  let isPrerelease = release.prerelease
  for (const bundle of release.bundles) {
    if (valid(bundle.version) !== bundle.version) {
      throw new Error(`${bundle.key}: catalog publishing requires a valid SemVer version`)
    }
    if (prerelease(bundle.version)) isPrerelease = true
  }
  const channel = options.channel ?? (isPrerelease ? 'unstable' : 'stable')
  if (!channels.includes(channel)) {
    throw new Error(`Catalog channel must be one of ${channels.join(', ')}`)
  }
  if (channel === 'stable' && isPrerelease) {
    throw new Error('Prereleases must use the unstable or bleeding catalog channel')
  }
  const token = options.token ?? process.env.H2K_CATALOG_TOKEN
  if (!options.dryRun && !token?.trim()) {
    throw new Error('Set H2K_CATALOG_TOKEN before publishing to the catalog')
  }

  // Preflight every selected archive before the first upload. Passing files
  // directly to the official publisher preserves the GitHub release bytes.
  const bundles = release.bundles.map((bundle) => {
    if (!/^n1rwj-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bundle.key)) {
      throw new Error(`${bundle.key}: only approved n1rwj-* extension keys may be published`)
    }
    const path = resolve(root, bundle.path)
    const info = statSync(path)
    if (!info.isFile() || info.size === 0 || info.size > maxBundleBytes) {
      throw new Error(`${bundle.key}: release bundle must be a nonempty file no larger than 16 MiB`)
    }
    return { ...bundle, path }
  })
  const log = dependencies.log ?? console.log
  const runPublisher = dependencies.runPublisher ?? execFileSync
  const command = join(root, 'node_modules', '.bin', 'h2kext-publish')
  for (const bundle of bundles) {
    log(
      `${options.dryRun ? 'Would submit' : 'Submitting'} ${bundle.key} ${bundle.version} to ${channel}: ${bundle.path}`,
    )
    if (options.dryRun) continue
    try {
      runPublisher(command, [bundle.path, '--channel', channel, '--notes', release.notes], {
        cwd: root,
        env: { ...process.env, H2K_CATALOG_TOKEN: token },
        stdio: 'inherit',
      })
    } catch {
      // The official CLI prints redacted diagnostics. Do not reprint a child
      // process error, which could include command arguments or environment.
      throw new Error(
        `Catalog publishing stopped at ${bundle.key}. Previously accepted submissions remain, and this bundle may already have been accepted before its notes failed. Inspect the catalog dashboard before retrying; no automatic retry was attempted.`,
      )
    }
  }
}
