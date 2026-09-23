import { copyFile, cp, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { buildExtension } from '@ham2k/extension-tools'
import { build } from 'esbuild'
import { readJson, selectExtensions } from './extensions.ts'

/** Declared local workspaces may supply notices/assets bundled by every consumer. */
async function workspaceAssets(root: string, dependencies: Record<string, unknown>) {
  if (!(await readdir(root)).includes('packages')) return []
  const directories: string[] = []
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(root, 'packages', entry.name)
    const pkg = await readJson<{ name?: string }>(join(dir, 'package.json'))
    if (
      pkg.name &&
      Object.keys(dependencies).includes(pkg.name) &&
      (await readdir(dir)).includes('assets')
    ) {
      directories.push(join(dir, 'assets'))
    }
  }
  return directories
}

export async function buildExtensions(root: string, key?: string): Promise<void> {
  for (const extension of await selectExtensions(root, key)) {
    await rm(join(extension.dir, 'build'), { recursive: true, force: true })
    const result = await buildExtension(build, { dir: extension.dir })
    // Copyright and adaptation provenance travel with every installable bundle.
    const assetsDir = join(result.outDir, 'assets')
    await mkdir(assetsDir, { recursive: true })
    for (const path of ['LICENSE', 'NOTICE.md', 'docs/PROVENANCE.md']) {
      await copyFile(join(root, path), join(assetsDir, basename(path)))
    }
    const assetSources = await workspaceAssets(root, extension.package.devDependencies ?? {})
    if ((await readdir(extension.dir)).includes('assets'))
      assetSources.push(join(extension.dir, 'assets'))
    for (const extensionAssetsDir of assetSources) {
      // Extension notices and static files accompany the bundle, without
      // replacing the repository's copyright and adaptation provenance.
      for (const entry of await readdir(extensionAssetsDir)) {
        await cp(join(extensionAssetsDir, entry), join(assetsDir, entry), {
          recursive: true,
          force: false,
          errorOnExist: true,
        })
      }
    }
    console.log(`Built ${result.manifest.key} ${result.manifest.version}`)
  }
}
