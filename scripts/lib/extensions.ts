import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { keyProblem } from '@ham2k/extension-tools/format'

export interface Manifest {
  key: string
  version: string
  name: string
  sharedDependencies?: Record<string, string>
  [field: string]: unknown
}

export interface PackageJson {
  name?: string
  version: string
  devDependencies?: Record<string, string>
  [field: string]: unknown
}

export interface Extension {
  dir: string
  path: string
  manifest: Manifest
  package: PackageJson
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

export async function discoverExtensions(root: string): Promise<Extension[]> {
  const result: Extension[] = []
  const keys = new Set<string>()
  const base = join(root, 'extensions')
  for (const group of await readdir(base, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const entry of await readdir(join(base, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(base, group.name, entry.name)
      const manifest = await readJson<Manifest>(join(dir, 'manifest.json'))
      const pkg = await readJson<PackageJson>(join(dir, 'package.json'))
      const problem = keyProblem(manifest.key)
      if (problem) throw new Error(`${relative(root, dir)}: ${problem}`)
      if (basename(dir) !== manifest.key || pkg.name !== manifest.key) {
        throw new Error(`${dir}: directory, manifest key, and package name must match`)
      }
      if (pkg.version !== manifest.version) {
        throw new Error(`${manifest.key}: manifest and package versions must match`)
      }
      if (keys.has(manifest.key)) throw new Error(`Duplicate extension key: ${manifest.key}`)
      keys.add(manifest.key)
      result.push({ dir, path: relative(root, dir), manifest, package: pkg })
    }
  }
  if (!result.length) throw new Error('No extensions found under extensions/<group>/<key>')
  return result.sort((a, b) => a.manifest.key.localeCompare(b.manifest.key))
}

export async function selectExtensions(root: string, key?: string): Promise<Extension[]> {
  const extensions = await discoverExtensions(root)
  if (!key) return extensions
  const selected = extensions.filter((extension) => extension.manifest.key === key)
  if (!selected.length) {
    throw new Error(
      `Unknown extension ${key}. Available: ${extensions.map((e) => e.manifest.key).join(', ')}`,
    )
  }
  return selected
}
