import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareRelease, validateRelease } from '../scripts/lib/release.ts'

const directories: string[] = []

async function fixture(packageVersion = '0.2.0') {
  const dir = await mkdtemp(join(tmpdir(), 'extensions-release-'))
  directories.push(dir)
  await mkdir(join(dir, 'dist'))
  await mkdir(join(dir, 'packages/shared'), { recursive: true })
  await writeFile(join(dir, 'packages/shared/package.json'), JSON.stringify({ version: '0.2.0' }))
  const lockPackages: Record<string, { version: string }> = {
    '': { version: '0.2.0' },
    'packages/shared': { version: '0.2.0' },
  }
  for (const key of ['n1rwj-cwt', 'n1rwj-mst', 'n1rwj-sst']) {
    const path = `extensions/contests/${key}`
    await mkdir(join(dir, path), { recursive: true })
    const filename = `${key}-0.2.0.h2kext`
    const body = `bundle for ${key}; packaging is verified separately by official tools`
    const digest = createHash('sha256').update(body).digest('hex')
    await writeFile(join(dir, path, 'manifest.json'), JSON.stringify({ key, version: '0.2.0' }))
    await writeFile(
      join(dir, path, 'package.json'),
      JSON.stringify({ name: key, version: '0.2.0' }),
    )
    await writeFile(join(dir, 'dist', filename), body)
    await writeFile(join(dir, 'dist', `${filename}.sha256`), `${digest}  ${filename}\n`)
    lockPackages[path] = { version: '0.2.0' }
  }
  await writeFile(join(dir, 'package.json'), JSON.stringify({ version: packageVersion }))
  await writeFile(
    join(dir, 'package-lock.json'),
    JSON.stringify({ version: '0.2.0', packages: lockPackages }),
  )
  await writeFile(join(dir, 'dist', 'old-version.h2kext'), 'not a release asset')
  return dir
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('release validation', () => {
  it('selects only each current bundle and checksum, in stable order', async () => {
    const assets = await validateRelease(await fixture(), 'v0.2.0')
    expect(assets.map((path) => basename(path))).toEqual([
      'n1rwj-cwt-0.2.0.h2kext',
      'n1rwj-cwt-0.2.0.h2kext.sha256',
      'n1rwj-mst-0.2.0.h2kext',
      'n1rwj-mst-0.2.0.h2kext.sha256',
      'n1rwj-sst-0.2.0.h2kext',
      'n1rwj-sst-0.2.0.h2kext.sha256',
    ])
  })

  it.each(['0.2.0', 'v0.2.1'])('rejects a mismatched release tag %s', async (tag) => {
    await expect(validateRelease(await fixture(), tag)).rejects.toThrow(
      'Release tag must be v<version>',
    )
  })

  it('rejects inconsistent root package versions', async () => {
    await expect(validateRelease(await fixture('0.2.1'), 'v0.2.0')).rejects.toThrow(
      'Release tag must be v<version>',
    )
  })

  it('rejects a stale extension workspace lockfile entry', async () => {
    const dir = await fixture()
    const path = join(dir, 'package-lock.json')
    const lock = JSON.parse(await readFile(path, 'utf8'))
    lock.packages['extensions/contests/n1rwj-mst'].version = '0.1.0'
    await writeFile(path, JSON.stringify(lock))
    await expect(validateRelease(dir, 'v0.2.0')).rejects.toThrow(
      'n1rwj-mst: manifest, package, lockfile',
    )
  })

  it('rejects a stale shared package workspace lockfile entry', async () => {
    const dir = await fixture()
    const path = join(dir, 'package-lock.json')
    const lock = JSON.parse(await readFile(path, 'utf8'))
    lock.packages['packages/shared'].version = '0.1.0'
    await writeFile(path, JSON.stringify(lock))
    await expect(validateRelease(dir, 'v0.2.0')).rejects.toThrow(
      'shared package, lockfile, and release versions',
    )
  })

  it('rejects any corrupt bundle before uploading', async () => {
    const dir = await fixture()
    await writeFile(join(dir, 'dist/n1rwj-sst-0.2.0.h2kext'), 'corrupt')
    await expect(validateRelease(dir, 'v0.2.0')).rejects.toThrow('Checksum does not match')
  })

  it('refuses a missing extension checksum', async () => {
    const dir = await fixture()
    await rm(join(dir, 'dist/n1rwj-mst-0.2.0.h2kext.sha256'))
    await expect(validateRelease(dir, 'v0.2.0')).rejects.toThrow('ENOENT')
  })
})

describe('release preparation', () => {
  it('updates all extension, shared, root, and lockfile versions together', async () => {
    const dir = await fixture()
    const files = await prepareRelease(dir, '0.3.0')
    expect(files).toHaveLength(9)
    for (const path of files) {
      expect(JSON.parse(await readFile(join(dir, path), 'utf8')).version).toBe('0.3.0')
    }
    const lock = JSON.parse(await readFile(join(dir, 'package-lock.json'), 'utf8'))
    expect(
      Object.values(lock.packages).every((pkg) => (pkg as { version: string }).version === '0.3.0'),
    ).toBe(true)
  })

  it.each(['v0.3.0', '../0.3.0', '0.3', '01.3.0'])(
    'rejects invalid version %s without writing',
    async (version) => {
      const dir = await fixture()
      const before = await readFile(join(dir, 'package.json'), 'utf8')
      await expect(prepareRelease(dir, version)).rejects.toThrow('valid SemVer')
      expect(await readFile(join(dir, 'package.json'), 'utf8')).toBe(before)
    },
  )
})
