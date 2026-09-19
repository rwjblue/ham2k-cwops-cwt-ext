import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const [tag, dryRun = 'false'] = process.argv.slice(2)
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const manifest = await json('manifest.json')
const pkg = await json('package.json')
const lock = await json('package-lock.json')

if (
  tag !== `v${manifest.version}` ||
  pkg.version !== manifest.version ||
  lock.version !== manifest.version ||
  lock.packages[''].version !== manifest.version
) {
  throw new Error(
    'Release tag must be v<version>, matching manifest, package, and lockfile versions.',
  )
}

const filename = `${manifest.key}-${manifest.version}.h2kext`
const bundle = `dist/${filename}`
const checksum = `${bundle}.sha256`
const digest = createHash('sha256')
  .update(await readFile(bundle))
  .digest('hex')
if ((await readFile(checksum, 'utf8')).trim() !== `${digest}  ${filename}`) {
  throw new Error(`Checksum does not match ${bundle}; rebuild before releasing.`)
}

if (dryRun === 'true') {
  console.log(`Validated ${tag}: ${bundle} and ${checksum}`)
} else {
  // Exact paths exclude older builds and local validation exports from dist/.
  // Do not clobber assets already downloaded by users of this release.
  execFileSync('gh', ['release', 'upload', tag, bundle, checksum], { stdio: 'inherit' })
}
