import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
const script = resolve('scripts/release.mjs')

async function fixture(packageVersion = '0.1.1') {
  const dir = await mkdtemp(join(tmpdir(), 'cwt-release-'))
  directories.push(dir)
  await mkdir(join(dir, 'dist'))
  const filename = 'n1rwj-cwt-0.1.1.h2kext'
  const body = 'packaging is verified by the official pack task'
  const digest = createHash('sha256').update(body).digest('hex')
  await Promise.all([
    writeFile(join(dir, 'manifest.json'), JSON.stringify({ key: 'n1rwj-cwt', version: '0.1.1' })),
    writeFile(join(dir, 'package.json'), JSON.stringify({ version: packageVersion })),
    writeFile(
      join(dir, 'package-lock.json'),
      JSON.stringify({ version: '0.1.1', packages: { '': { version: '0.1.1' } } }),
    ),
    writeFile(join(dir, 'dist', filename), body),
    writeFile(join(dir, 'dist', `${filename}.sha256`), `${digest}  ${filename}\n`),
    writeFile(join(dir, 'dist', 'old-version.h2kext'), 'not a release asset'),
  ])
  return dir
}

function validate(dir: string, tag = 'v0.1.1') {
  return execFileSync(process.execPath, [script, tag, 'true'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('release validation', () => {
  it('selects only the current bundle and checksum without uploading', async () => {
    const output = validate(await fixture())
    expect(output).toContain('n1rwj-cwt-0.1.1.h2kext.sha256')
    expect(output).not.toContain('old-version')
  })

  it.each(['0.1.1', 'v0.1.2'])('rejects a mismatched release tag %s', async (tag) => {
    const dir = await fixture()
    expect(() => validate(dir, tag)).toThrow('Release tag must be v<version>')
  })

  it('rejects inconsistent package versions', async () => {
    const dir = await fixture('0.1.2')
    expect(() => validate(dir)).toThrow('Release tag must be v<version>')
  })

  it('rejects a corrupt bundle before uploading', async () => {
    const dir = await fixture()
    await writeFile(join(dir, 'dist/n1rwj-cwt-0.1.1.h2kext'), 'corrupt')
    expect(() => validate(dir)).toThrow('Checksum does not match')
  })
})
