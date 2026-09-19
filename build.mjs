import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { buildExtension } from '@ham2k/extension-tools'
import { build } from 'esbuild'

const dir = import.meta.dirname
await rm(join(dir, 'build'), { recursive: true, force: true })
const result = await buildExtension(build, { dir })

// Copyright and adaptation provenance travel with every installable bundle.
const assetsDir = join(result.outDir, 'assets')
await mkdir(assetsDir, { recursive: true })
for (const path of ['LICENSE', 'NOTICE.md', 'docs/PROVENANCE.md']) {
  await copyFile(join(dir, path), join(assetsDir, path.split('/').at(-1)))
}
console.log(`Built ${result.manifest.key} ${result.manifest.version}`)
