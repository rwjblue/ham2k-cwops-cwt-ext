import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { valid } from 'semver'
import { discoverExtensions, type PackageJson, readJson, writeJson } from './extensions.ts'

interface PackageLock {
  version: string
  packages: Record<string, { version?: string; [field: string]: unknown }>
  [field: string]: unknown
}

async function sharedPackages(
  root: string,
): Promise<Array<{ path: string; package: PackageJson }>> {
  const result: Array<{ path: string; package: PackageJson }> = []
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = `packages/${entry.name}`
    result.push({ path, package: await readJson<PackageJson>(join(root, path, 'package.json')) })
  }
  return result
}

export async function validateRelease(
  root: string,
  tag: string,
  assetDirectory = join(root, 'dist'),
): Promise<string[]> {
  const pkg = await readJson<PackageJson>(join(root, 'package.json'))
  const lock = await readJson<PackageLock>(join(root, 'package-lock.json'))
  if (
    !valid(pkg.version) ||
    tag !== `v${pkg.version}` ||
    lock.version !== pkg.version ||
    lock.packages['']?.version !== pkg.version
  ) {
    throw new Error('Release tag must be v<version>, matching package and lockfile versions.')
  }
  for (const shared of await sharedPackages(root)) {
    if (
      shared.package.version !== pkg.version ||
      lock.packages[shared.path]?.version !== pkg.version
    ) {
      throw new Error(`${shared.path}: shared package, lockfile, and release versions must match`)
    }
  }
  const assets: string[] = []
  for (const extension of await discoverExtensions(root)) {
    const { key, version } = extension.manifest
    if (version !== pkg.version || lock.packages[extension.path]?.version !== version) {
      throw new Error(`${key}: manifest, package, lockfile, and release versions must match`)
    }
    const filename = `${key}-${version}.h2kext`
    const bundle = join(assetDirectory, filename)
    const checksum = `${bundle}.sha256`
    const digest = createHash('sha256')
      .update(await readFile(bundle))
      .digest('hex')
    if ((await readFile(checksum, 'utf8')).trim() !== `${digest}  ${filename}`) {
      throw new Error(`Checksum does not match ${bundle}; rebuild before releasing.`)
    }
    // Exact paths exclude older builds and local validation exports from dist/.
    assets.push(bundle, checksum)
  }
  return assets
}

export async function prepareRelease(root: string, version: string): Promise<string[]> {
  if (valid(version) !== version)
    throw new Error('Version must be a valid SemVer without a v prefix')
  const extensions = await discoverExtensions(root)
  const pkg = await readJson<PackageJson>(join(root, 'package.json'))
  const lock = await readJson<PackageLock>(join(root, 'package-lock.json'))
  const files: Array<[string, Record<string, unknown>]> = [['package.json', { ...pkg, version }]]
  lock.version = version
  lock.packages[''] = { ...lock.packages[''], version }
  for (const extension of extensions) {
    files.push(
      [`${extension.path}/manifest.json`, { ...extension.manifest, version }],
      [`${extension.path}/package.json`, { ...extension.package, version }],
    )
    if (!lock.packages[extension.path]) {
      throw new Error(`${extension.path} is missing from package-lock.json; run npm install first`)
    }
    lock.packages[extension.path] = { ...lock.packages[extension.path], version }
  }
  // Private shared workspaces travel with the repository's synchronized version.
  for (const { path, package: shared } of await sharedPackages(root)) {
    if (!lock.packages[path]) {
      throw new Error(`${path} is missing from package-lock.json; run npm install first`)
    }
    files.push([`${path}/package.json`, { ...shared, version }])
    lock.packages[path] = { ...lock.packages[path], version }
  }
  files.push(['package-lock.json', lock])
  // Finish every read and validation before writing any version files.
  for (const [path, content] of files) await writeJson(join(root, path), content)
  return files.map(([path]) => path)
}
