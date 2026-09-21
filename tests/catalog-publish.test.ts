import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type CatalogPublisher, publishCatalogRelease } from '../scripts/lib/catalog-publish.ts'
import type { CatalogRelease } from '../scripts/lib/catalog-release.ts'

const directories: string[] = []

async function fixture(version = '0.2.0') {
  const root = await mkdtemp(join(tmpdir(), 'extensions-catalog-publish-'))
  directories.push(root)
  const release: CatalogRelease = {
    tag: `v${version}`,
    notes: 'Release notes\n\nFixes and improvements.',
    prerelease: false,
    bundles: [],
  }
  for (const key of ['n1rwj-cwt', 'n1rwj-mst', 'n1rwj-sst']) {
    const path = join(root, `${key}-${version}.h2kext`)
    await writeFile(path, `Previously verified release archive for ${key}`)
    release.bundles.push({ key, version, path })
  }
  const runPublisher = vi.fn<CatalogPublisher>()
  const log = vi.fn<(message: string) => void>()
  return { root, release, dependencies: { runPublisher, log } }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('catalog publishing', () => {
  it('submits the existing archives using the pinned CLI, stable channel, and release notes', async () => {
    const { root, release, dependencies } = await fixture()
    vi.stubEnv('CATALOG_TEST_OTHER_ENV', 'preserved')
    vi.stubEnv('H2K_CATALOG_TOKEN', 'existing-environment-token')
    const token = 'explicit-private-token'

    publishCatalogRelease(root, release, { token }, dependencies)

    expect(dependencies.runPublisher).toHaveBeenCalledTimes(3)
    for (const [index, bundle] of release.bundles.entries()) {
      expect(dependencies.runPublisher).toHaveBeenNthCalledWith(
        index + 1,
        join(root, 'node_modules/.bin/h2kext-publish'),
        [bundle.path, '--channel', 'stable', '--notes', release.notes],
        {
          cwd: root,
          env: expect.objectContaining({
            H2K_CATALOG_TOKEN: token,
            CATALOG_TEST_OTHER_ENV: 'preserved',
          }),
          stdio: 'inherit',
        },
      )
    }
    expect(process.env.H2K_CATALOG_TOKEN).toBe('existing-environment-token')
    expect(
      JSON.stringify(dependencies.runPublisher.mock.calls.map((call) => call[1])),
    ).not.toContain(token)
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(token)
  })

  it('reads the token from the environment when no override is provided', async () => {
    const { root, release, dependencies } = await fixture()
    vi.stubEnv('H2K_CATALOG_TOKEN', 'environment-private-token')

    publishCatalogRelease(root, release, {}, dependencies)

    expect(dependencies.runPublisher.mock.calls[0]?.[2].env.H2K_CATALOG_TOKEN).toBe(
      'environment-private-token',
    )
  })

  it.each([
    { version: '0.2.0', prerelease: true },
    { version: '0.2.0-beta.1', prerelease: false },
  ])('defaults a prerelease to unstable: %j', async ({ version, prerelease }) => {
    const { root, release, dependencies } = await fixture(version)
    release.prerelease = prerelease

    publishCatalogRelease(root, release, { token: 'token' }, dependencies)

    expect(dependencies.runPublisher.mock.calls.every((call) => call[1][2] === 'unstable')).toBe(
      true,
    )
  })

  it('supports an explicit bleeding channel', async () => {
    const { root, release, dependencies } = await fixture()

    publishCatalogRelease(root, release, { token: 'token', channel: 'bleeding' }, dependencies)

    expect(dependencies.runPublisher.mock.calls.every((call) => call[1][2] === 'bleeding')).toBe(
      true,
    )
  })

  it.each(['', 'prod', 'next', 'dev', 'invalid'])(
    'rejects channel %j before uploading',
    async (channel) => {
      const { root, release, dependencies } = await fixture()

      expect(() =>
        publishCatalogRelease(root, release, { token: 'token', channel }, dependencies),
      ).toThrow('Catalog channel must be one of stable, unstable, bleeding')
      expect(dependencies.runPublisher).not.toHaveBeenCalled()
    },
  )

  it.each([
    { version: '0.2.0', prerelease: true },
    { version: '0.2.0-beta.1', prerelease: false },
  ])('rejects routing a prerelease to stable: %j', async ({ version, prerelease }) => {
    const { root, release, dependencies } = await fixture(version)
    release.prerelease = prerelease

    expect(() =>
      publishCatalogRelease(root, release, { token: 'token', channel: 'stable' }, dependencies),
    ).toThrow('Prereleases must use the unstable or bleeding catalog channel')
    expect(dependencies.runPublisher).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '  \n '])('rejects a missing or blank token %j', async (token) => {
    const { root, release, dependencies } = await fixture()
    vi.stubEnv('H2K_CATALOG_TOKEN', undefined)

    expect(() => publishCatalogRelease(root, release, { token }, dependencies)).toThrow(
      'Set H2K_CATALOG_TOKEN',
    )
    expect(dependencies.runPublisher).not.toHaveBeenCalled()
  })

  it('preflights every key before uploading any bundle', async () => {
    const { root, release, dependencies } = await fixture()
    release.bundles[2].key = 'ham2k-cwt'

    expect(() => publishCatalogRelease(root, release, { token: 'token' }, dependencies)).toThrow(
      'only approved n1rwj-* extension keys',
    )
    expect(dependencies.runPublisher).not.toHaveBeenCalled()
  })

  it.each([0, 16 * 1024 * 1024 + 1])(
    'preflights all bundle sizes before uploading: %i bytes',
    async (size) => {
      const { root, release, dependencies } = await fixture()
      await truncate(release.bundles[2].path, size)

      expect(() => publishCatalogRelease(root, release, { token: 'token' }, dependencies)).toThrow(
        'nonempty file no larger than 16 MiB',
      )
      expect(dependencies.runPublisher).not.toHaveBeenCalled()
    },
  )

  it('accepts a bundle at the exact 16 MiB limit', async () => {
    const { root, release, dependencies } = await fixture()
    await truncate(release.bundles[2].path, 16 * 1024 * 1024)

    publishCatalogRelease(root, release, { token: 'token' }, dependencies)

    expect(dependencies.runPublisher).toHaveBeenCalledTimes(3)
  })

  it('rejects a directory so the publisher cannot silently repack a build', async () => {
    const { root, release, dependencies } = await fixture()
    const directory = join(root, 'build')
    await mkdir(directory)
    release.bundles[2].path = directory

    expect(() => publishCatalogRelease(root, release, { token: 'token' }, dependencies)).toThrow(
      'nonempty file no larger than 16 MiB',
    )
    expect(dependencies.runPublisher).not.toHaveBeenCalled()
  })

  it('previews every upload without a token or a publisher invocation', async () => {
    const { root, release, dependencies } = await fixture()
    vi.stubEnv('H2K_CATALOG_TOKEN', undefined)

    publishCatalogRelease(root, release, { dryRun: true }, dependencies)

    expect(dependencies.runPublisher).not.toHaveBeenCalled()
    expect(dependencies.log).toHaveBeenCalledTimes(3)
    expect(dependencies.log).toHaveBeenCalledWith(
      `Would submit n1rwj-cwt 0.2.0 to stable: ${release.bundles[0].path}`,
    )
  })

  it('still rejects an invalid bundle in a dry run', async () => {
    const { root, release, dependencies } = await fixture()
    await truncate(release.bundles[2].path, 0)

    expect(() => publishCatalogRelease(root, release, { dryRun: true }, dependencies)).toThrow(
      'nonempty file no larger than 16 MiB',
    )
    expect(dependencies.runPublisher).not.toHaveBeenCalled()
    expect(dependencies.log).not.toHaveBeenCalled()
  })

  it('stops on the second failure without retrying or leaking child-process errors', async () => {
    const { root, release, dependencies } = await fixture()
    const token = 'private-token-never-print'
    dependencies.runPublisher
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error(`Failed with secret ${token}`)
      })

    let error: unknown
    try {
      publishCatalogRelease(root, release, { token }, dependencies)
    } catch (caught) {
      error = caught
    }

    expect(dependencies.runPublisher).toHaveBeenCalledTimes(2)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('Catalog publishing stopped at n1rwj-mst')
    expect(String(error)).toContain('Previously accepted submissions remain')
    expect(String(error)).toContain('Inspect the catalog dashboard before retrying')
    expect(String(error)).not.toContain(token)
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(token)
  })
})
