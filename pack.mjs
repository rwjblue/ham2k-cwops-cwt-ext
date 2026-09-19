import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pack } from '@ham2k/extension-tools/format'

const dir = import.meta.dirname
const manifest = JSON.parse(await readFile(join(dir, 'build/manifest.json'), 'utf8'))
const filename = `${manifest.key}-${manifest.version}.h2kext`
const outPath = join(dir, 'dist', filename)
await mkdir(join(dir, 'dist'), { recursive: true })

// This is the same validator/packer invoked by the official h2kext-pack CLI.
await pack(join(dir, 'build'), { outPath })
const checksum = createHash('sha256')
  .update(await readFile(outPath))
  .digest('hex')
await writeFile(`${outPath}.sha256`, `${checksum}  ${filename}\n`)
console.log(`Validated and packed ${outPath}\nSHA-256 ${checksum}`)
