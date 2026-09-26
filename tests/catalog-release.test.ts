import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withCatalogRelease } from '../scripts/lib/catalog-release.ts'

const directories: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'catalog-release-test-'))
  directories.push(root)
  const assets = new Map<string, string>()
  const packages: Record<string, { version: string }> = {
    '': { version: '0.2.0' },
    'packages/shared': { version: '0.2.0' },
  }
  await mkdir(join(root, 'packages/shared'), { recursive: true })
  await writeFile(join(root, 'packages/shared/package.json'), JSON.stringify({ version: '0.2.0' }))
  for (const key of ['n1rwj-cwt', 'n1rwj-sst']) {
    const path = `extensions/contests/${key}`
    await mkdir(join(root, path), { recursive: true })
    await writeFile(
      join(root, path, 'manifest.json'),
      JSON.stringify({ key, name: key, version: '0.2.0' }),
    )
    await writeFile(
      join(root, path, 'package.json'),
      JSON.stringify({ name: key, version: '0.2.0' }),
    )
    packages[path] = { version: '0.2.0' }
    const filename = `${key}-0.2.0.h2kext`
    const body = `release bundle for ${key}`
    assets.set(filename, body)
    assets.set(
      `${filename}.sha256`,
      `${createHash('sha256').update(body).digest('hex')}  ${filename}\n`,
    )
  }
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.2.0' }))
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ version: '0.2.0', packages }))
  const metadata: Record<string, unknown> = {
    tagName: 'v0.2.0',
    isDraft: false,
    isPrerelease: false,
    body: '# Release overview\n\n## Shared changes\n\nUpdated SDK.\n\n## n1rwj-cwt\n\nCWT fix.\n\n## n1rwj-sst\n\nNo extension-specific changes for SST.',
  }
  let downloadDirectory = ''
  const runGh = vi.fn(async (args: string[], cwd: string) => {
    expect(cwd).toBe(root)
    if (args[1] === 'view') return JSON.stringify(metadata)
    expect(args.slice(0, 3)).toEqual(['release', 'download', 'v0.2.0'])
    downloadDirectory = args[args.indexOf('--dir') + 1]
    const names = args.flatMap((value, index) => (value === '--pattern' ? [args[index + 1]] : []))
    expect(names).toEqual([...assets.keys()])
    await Promise.all(
      names.map((name) => {
        const contents = assets.get(name)
        if (contents === undefined) throw new Error(`Missing fixture asset ${name}`)
        return writeFile(join(downloadDirectory, name), contents)
      }),
    )
    return ''
  })
  return { root, assets, metadata, runGh, downloadedTo: () => downloadDirectory }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('GitHub release catalog inputs', () => {
  it.each([undefined, 'n1rwj-sst'])(
    'skips unchanged extensions even with explicit selection %s',
    async (key) => {
      const data = await fixture()
      data.metadata.body =
        '## n1rwj-cwt\n\nNew contest support.\n\n## n1rwj-sst\n\nNo extension-specific changes for SST.\n\n## Repository notes\n\nVersions advanced.'
      const publish = vi.fn(async () => undefined)
      await withCatalogRelease(data.root, 'v0.2.0', key, publish, data)
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          skipped: ['n1rwj-sst'],
          bundles: key ? [] : [expect.objectContaining({ key: 'n1rwj-cwt' })],
        }),
      )
      expect(data.runGh).toHaveBeenCalledTimes(2)
    },
  )

  it('uses verified published assets and notes, then removes the temporary download', async () => {
    const data = await fixture()
    data.metadata.isPrerelease = true
    const result = await withCatalogRelease(
      data.root,
      'v0.2.0',
      undefined,
      async (release) => {
        expect(release).toMatchObject({
          tag: 'v0.2.0',
          prerelease: true,
        })
        expect(release.bundles.map(({ path }) => basename(path))).toEqual([
          'n1rwj-cwt-0.2.0.h2kext',
          'n1rwj-sst-0.2.0.h2kext',
        ])
        for (const bundle of release.bundles) {
          expect(bundle.version).toBe('0.2.0')
          expect(await readFile(bundle.path, 'utf8')).toBe(`release bundle for ${bundle.key}`)
        }
        expect(release.bundles[0].notes).toBe(
          '## n1rwj-cwt\n\nCWT fix.\n\n## Shared changes\n\nUpdated SDK.',
        )
        expect(release.bundles[1].notes).toBe(
          '## n1rwj-sst\n\nNo extension-specific changes for SST.\n\n## Shared changes\n\nUpdated SDK.',
        )
        return 'published'
      },
      data,
    )
    expect(result).toBe('published')
    await expect(readFile(data.downloadedTo())).rejects.toThrow('ENOENT')
  })

  it('provides only the selected extension while validating all release assets', async () => {
    const data = await fixture()
    const publish = vi.fn(async () => undefined)
    await withCatalogRelease(data.root, 'v0.2.0', 'n1rwj-cwt', publish, data)
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        bundles: [expect.objectContaining({ key: 'n1rwj-cwt', version: '0.2.0' })],
      }),
    )
    publish.mockClear()
    data.assets.set('n1rwj-sst-0.2.0.h2kext', 'corrupt unselected extension')
    await expect(
      withCatalogRelease(data.root, 'v0.2.0', 'n1rwj-cwt', publish, data),
    ).rejects.toThrow('Checksum does not match')
    expect(publish).not.toHaveBeenCalled()
    await expect(readFile(data.downloadedTo())).rejects.toThrow('ENOENT')
  })

  it.each([{ tagName: 'v0.3.0' }, { isDraft: true }, { isPrerelease: undefined }, { body: null }])(
    'rejects invalid release metadata %j before download',
    async (invalid) => {
      const data = await fixture()
      Object.assign(data.metadata, invalid)
      const publish = vi.fn(async () => undefined)
      await expect(
        withCatalogRelease(data.root, 'v0.2.0', undefined, publish, data),
      ).rejects.toThrow('must be published with matching tag and valid metadata')
      expect(data.runGh).toHaveBeenCalledTimes(1)
      expect(publish).not.toHaveBeenCalled()
    },
  )

  it('rejects missing unselected notes before downloading or publishing', async () => {
    const data = await fixture()
    data.metadata.body = '## n1rwj-cwt\n\nCWT fix.'
    const publish = vi.fn(async () => undefined)
    await expect(
      withCatalogRelease(data.root, 'v0.2.0', 'n1rwj-cwt', publish, data),
    ).rejects.toThrow('Missing or empty release notes section "## n1rwj-sst"')
    expect(data.runGh).toHaveBeenCalledTimes(1)
    expect(publish).not.toHaveBeenCalled()
  })

  it.each([
    { tag: '--latest', key: undefined, error: 'valid SemVer' },
    { tag: 'v0.2.0', key: 'n1rwj-missing', error: 'Unknown extension' },
  ])('rejects tag $tag or key $key before contacting GitHub', async ({ tag, key, error }) => {
    const data = await fixture()
    const publish = vi.fn(async () => undefined)
    await expect(withCatalogRelease(data.root, tag, key, publish, data)).rejects.toThrow(error)
    expect(data.runGh).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })

  it('rejects repository version drift before publishing', async () => {
    const data = await fixture()
    const path = join(data.root, 'package-lock.json')
    const lock = JSON.parse(await readFile(path, 'utf8'))
    lock.packages['extensions/contests/n1rwj-sst'].version = '0.1.0'
    await writeFile(path, JSON.stringify(lock))
    const publish = vi.fn(async () => undefined)
    await expect(withCatalogRelease(data.root, 'v0.2.0', undefined, publish, data)).rejects.toThrow(
      'manifest, package, lockfile, and release versions must match',
    )
    expect(publish).not.toHaveBeenCalled()
    await expect(readFile(data.downloadedTo())).rejects.toThrow('ENOENT')
  })

  it('removes downloaded artifacts when publishing fails', async () => {
    const data = await fixture()
    await expect(
      withCatalogRelease(
        data.root,
        'v0.2.0',
        undefined,
        async () => {
          throw new Error('Publishing failed')
        },
        data,
      ),
    ).rejects.toThrow('Publishing failed')
    await expect(readFile(data.downloadedTo())).rejects.toThrow('ENOENT')
  })

  it('removes partially downloaded artifacts when GitHub fails', async () => {
    const data = await fixture()
    const publish = vi.fn(async () => undefined)
    let directory = ''
    await expect(
      withCatalogRelease(data.root, 'v0.2.0', undefined, publish, {
        runGh: async (args) => {
          if (args[1] === 'view') return JSON.stringify(data.metadata)
          directory = args[args.indexOf('--dir') + 1]
          await writeFile(join(directory, 'partial-download.h2kext'), 'partial')
          throw new Error('Download failed')
        },
      }),
    ).rejects.toThrow('Download failed')
    expect(publish).not.toHaveBeenCalled()
    await expect(readFile(directory)).rejects.toThrow('ENOENT')
  })
})
