import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { valid } from 'semver'
import { discoverExtensions } from './extensions.ts'
import { validateRelease } from './release.ts'

export interface CatalogRelease {
  tag: string
  notes: string
  prerelease: boolean
  bundles: Array<{ key: string; version: string; path: string }>
}

interface Dependencies {
  runGh?: (args: string[], cwd: string) => string | Promise<string>
}

function runGh(args: string[], cwd: string): string {
  return execFileSync('gh', args, { cwd, encoding: 'utf8' })
}

export async function withCatalogRelease<T>(
  root: string,
  tag: string,
  key: string | undefined,
  callback: (release: CatalogRelease) => Promise<T>,
  dependencies: Dependencies = {},
): Promise<T> {
  if (!tag.startsWith('v') || valid(tag.slice(1)) !== tag.slice(1)) {
    throw new Error('Catalog release tag must be v<version>, using a valid SemVer.')
  }
  const extensions = await discoverExtensions(root)
  const selected = key
    ? extensions.filter((extension) => extension.manifest.key === key)
    : extensions
  if (!selected.length) {
    throw new Error(
      `Unknown extension ${key}. Available: ${extensions.map((extension) => extension.manifest.key).join(', ')}`,
    )
  }

  const gh = dependencies.runGh ?? runGh
  const metadata: unknown = JSON.parse(
    await gh(['release', 'view', tag, '--json', 'tagName,isDraft,isPrerelease,body'], root),
  )
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !('tagName' in metadata) ||
    metadata.tagName !== tag ||
    !('isDraft' in metadata) ||
    metadata.isDraft !== false ||
    !('isPrerelease' in metadata) ||
    typeof metadata.isPrerelease !== 'boolean' ||
    !('body' in metadata) ||
    typeof metadata.body !== 'string'
  ) {
    throw new Error(`GitHub release ${tag} must be published with matching tag and valid metadata.`)
  }

  const directory = await mkdtemp(join(tmpdir(), 'h2k-catalog-release-'))
  try {
    const patterns = extensions.flatMap(({ manifest }) => {
      const filename = `${manifest.key}-${manifest.version}.h2kext`
      return ['--pattern', filename, '--pattern', `${filename}.sha256`]
    })
    await gh(['release', 'download', tag, '--dir', directory, ...patterns], root)
    // Validate every release asset before the callback can publish even one extension.
    await validateRelease(root, tag, directory)
    return await callback({
      tag,
      notes: metadata.body,
      prerelease: metadata.isPrerelease,
      bundles: selected.map(({ manifest }) => ({
        key: manifest.key,
        version: manifest.version,
        path: join(directory, `${manifest.key}-${manifest.version}.h2kext`),
      })),
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
