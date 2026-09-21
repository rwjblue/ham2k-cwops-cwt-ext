import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { buildExtension } from '@ham2k/extension-tools'
import { build } from 'esbuild'
import { selectExtensions } from './extensions.ts'

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
    console.log(`Built ${result.manifest.key} ${result.manifest.version}`)
  }
}
