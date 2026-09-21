import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pack } from '@ham2k/extension-tools/format'
import { type Manifest, readJson, selectExtensions } from './extensions.ts'

export async function packExtensions(root: string, key?: string): Promise<void> {
  await mkdir(join(root, 'dist'), { recursive: true })
  for (const extension of await selectExtensions(root, key)) {
    const buildDir = join(extension.dir, 'build')
    const manifest = await readJson<Manifest>(join(buildDir, 'manifest.json'))
    if (JSON.stringify(manifest) !== JSON.stringify(extension.manifest)) {
      throw new Error(`${extension.manifest.key}: build manifest is stale; run mise run build`)
    }
    const filename = `${manifest.key}-${manifest.version}.h2kext`
    const outPath = join(root, 'dist', filename)
    // This is the validator/packer invoked by the official h2kext-pack CLI.
    await pack(buildDir, { outPath })
    const checksum = createHash('sha256')
      .update(await readFile(outPath))
      .digest('hex')
    await writeFile(`${outPath}.sha256`, `${checksum}  ${filename}\n`)
    console.log(`Validated and packed ${outPath}\nSHA-256 ${checksum}`)
  }
}
