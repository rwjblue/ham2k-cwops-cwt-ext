import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildExtensions } from '../../scripts/lib/build.ts'
import { discoverExtensions, selectExtensions } from '../../scripts/lib/extensions.ts'
import { packExtensions } from '../../scripts/lib/pack.ts'
import { scaffoldExtension } from '../../scripts/lib/scaffold.ts'

const directories: string[] = []
const repo = resolve('.')

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'extension-tooling-'))
  directories.push(dir)
  const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ ...pkg, version: '0.2.0' }))
  return dir
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('extension discovery and scaffolding', () => {
  it('discovers multiple groups in stable order and selects exact keys', async () => {
    const dir = await fixture()
    await scaffoldExtension(dir, { key: 'n1rwj-zebra', group: 'contests' })
    await scaffoldExtension(dir, { key: 'n1rwj-alpha' })
    expect((await discoverExtensions(dir)).map(({ manifest }) => manifest.key)).toEqual([
      'n1rwj-alpha',
      'n1rwj-zebra',
    ])
    expect((await selectExtensions(dir, 'n1rwj-zebra'))[0]?.path).toBe(
      'extensions/contests/n1rwj-zebra',
    )
    await expect(selectExtensions(dir, 'n1rwj-missing')).rejects.toThrow('Unknown extension')
  })

  it('refuses to overwrite an existing key in any group', async () => {
    const dir = await fixture()
    const created = await scaffoldExtension(dir, { key: 'n1rwj-demo' })
    const before = await readFile(join(created, 'manifest.json'), 'utf8')
    await expect(scaffoldExtension(dir, { key: 'n1rwj-demo', group: 'contests' })).rejects.toThrow(
      'refusing to overwrite',
    )
    expect(await readFile(join(created, 'manifest.json'), 'utf8')).toBe(before)
  })

  it.each(['../escape', 'ham2k-demo', 'notacall-demo', 'N1RWJ-demo'])(
    'rejects an invalid or reserved key %s',
    async (key) => {
      await expect(scaffoldExtension(await fixture(), { key })).rejects.toThrow()
    },
  )

  it('rejects directory traversal in the group', async () => {
    await expect(
      scaffoldExtension(await fixture(), { key: 'n1rwj-demo', group: '../outside' }),
    ).rejects.toThrow('Group must')
  })

  it('rejects divergent package identities and versions during discovery', async () => {
    const dir = await fixture()
    const extension = await scaffoldExtension(dir, { key: 'n1rwj-demo' })
    const path = join(extension, 'package.json')
    await writeFile(path, JSON.stringify({ name: 'n1rwj-other', version: '0.2.0' }))
    await expect(discoverExtensions(dir)).rejects.toThrow(
      'directory, manifest key, and package name',
    )
    await writeFile(path, JSON.stringify({ name: 'n1rwj-demo', version: '0.1.0' }))
    await expect(discoverExtensions(dir)).rejects.toThrow('manifest and package versions')
  })

  it('creates a typechecked starter that builds and packages using official tools', async () => {
    const dir = await fixture()
    await symlink(join(repo, 'node_modules'), join(dir, 'node_modules'), 'dir')
    await mkdir(join(dir, 'docs'))
    for (const path of ['LICENSE', 'NOTICE.md', 'docs/PROVENANCE.md']) {
      await copyFile(join(repo, path), join(dir, path))
    }
    const extension = await scaffoldExtension(dir, { key: 'n1rwj-demo', name: 'My "quoted" panel' })
    execFileSync(
      process.execPath,
      [
        join(repo, 'node_modules/typescript/bin/tsc'),
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--target',
        'ES2020',
        '--allowImportingTsExtensions',
        '--resolveJsonModule',
        '--skipLibCheck',
        join(extension, 'src/index.ts'),
      ],
      { stdio: 'pipe' },
    )
    await buildExtensions(dir)
    await packExtensions(dir)
    expect(
      (await readFile(join(dir, 'dist/n1rwj-demo-0.2.0.h2kext'))).subarray(0, 2).toString(),
    ).toBe('PK')
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'))
    manifest.name = 'Changed since build'
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest))
    await expect(packExtensions(dir)).rejects.toThrow('build manifest is stale')
  }, 20_000)
})
