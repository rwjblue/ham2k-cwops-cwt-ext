import type { JSONValue } from '@ham2k/extension-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { Snapshot, Storage } from '../../src/data/cache'
import { checkedSnapshot, createFileCache } from '../../src/data/cache'

const raw = '!!Order!!,Call,Name,Exch1\n# CWOPS\nK1ABC,Pat,123'

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    schema: 1,
    body: raw,
    url: 'https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS.txt',
    fetchedAt: '2026-09-19T12:00:00.000Z',
    ...overrides,
  }
}

function memoryStorage(initial: unknown = null) {
  let saved: unknown = initial
  const save = async (value: JSONValue) => {
    saved = value
  }
  const storage: Storage = {
    read: vi.fn(async () => saved),
    write: vi.fn(save),
  }
  return { storage, save, value: () => saved }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('last-good CWT file cache', () => {
  it('persists raw data and source freshness, then restores it offline on restart', async () => {
    const { storage, value } = memoryStorage()
    const first = createFileCache(storage)
    await first.replace(snapshot())
    expect(value()).toEqual(snapshot())
    const restarted = createFileCache(storage)
    await restarted.load()
    expect(restarted.current()?.snapshot.fetchedAt).toBe('2026-09-19T12:00:00.000Z')
    expect(restarted.current()?.parsed.records.K1ABC?.number).toBe('123')
    expect(restarted.error()).toBeUndefined()
  })

  it('loads durable storage only once and treats an absent cache as normal', async () => {
    const { storage } = memoryStorage()
    const cache = createFileCache(storage)
    await Promise.all([cache.load(), cache.load()])
    await cache.load()
    expect(storage.read).toHaveBeenCalledTimes(1)
    expect(cache.current()).toBeUndefined()
    expect(cache.error()).toBeUndefined()
  })

  it.each([
    null,
    {},
    snapshot({ schema: 2 as 1 }),
    snapshot({ body: '<!DOCTYPE html><html>Access denied</html>' }),
    snapshot({ body: '# CWOPS' }),
    snapshot({ body: '!!Unsupported!!\nK1ABC,Pat' }),
    snapshot({ body: '# NAQPCW\nK1ABC,Pat' }),
    snapshot({ fetchedAt: 'not-a-date' }),
  ])('rejects corrupt, incompatible, or invalid-version snapshots', (candidate) => {
    expect(() => checkedSnapshot(candidate)).toThrow()
  })

  it('rejects files beyond the size limit before parsing', () => {
    expect(() => checkedSnapshot(snapshot({ body: 'x'.repeat(5_000_001) }))).toThrow('5 MB')
  })

  it('retains memory and durable copies when a corrupt refresh arrives', async () => {
    const { storage, value } = memoryStorage()
    const cache = createFileCache(storage)
    await cache.replace(snapshot())
    await expect(
      cache.replace(
        snapshot({ body: '<html>Access denied</html>', fetchedAt: '2026-09-20T00:00:00Z' }),
      ),
    ).rejects.toThrow()
    expect(cache.current()?.snapshot).toEqual(snapshot())
    expect(value()).toEqual(snapshot())
    expect(storage.write).toHaveBeenCalledTimes(1)
    expect(cache.error()).toContain('Invalid CWT file')
  })

  it('retains memory and durable copies if writing a valid replacement fails', async () => {
    const { storage, value } = memoryStorage(snapshot())
    const cache = createFileCache(storage)
    await cache.load()
    vi.mocked(storage.write).mockRejectedValueOnce(new Error('disk full'))
    await expect(cache.replace(snapshot({ body: raw.replace('123', '456') }))).rejects.toThrow(
      'disk full',
    )
    expect(cache.current()?.parsed.records.K1ABC?.number).toBe('123')
    expect(value()).toEqual(snapshot())
    expect(cache.error()).toContain('disk full')
  })

  it('reports unreadable or corrupt durable storage without rejecting host startup', async () => {
    const { storage } = memoryStorage({ body: 'bad' })
    const corrupt = createFileCache(storage)
    await expect(corrupt.load()).resolves.toBeUndefined()
    expect(corrupt.current()).toBeUndefined()
    expect(corrupt.error()).toContain('Invalid CWT cache')
    vi.mocked(storage.read).mockRejectedValueOnce(new Error('storage unavailable'))
    const unreadable = createFileCache(storage)
    await expect(unreadable.load()).resolves.toBeUndefined()
    expect(unreadable.error()).toContain('storage unavailable')
  })

  it('clears a previous error after a successful replacement', async () => {
    const { storage } = memoryStorage()
    const cache = createFileCache(storage)
    cache.accept({ wrong: true })
    expect(cache.error()).toBeDefined()
    await cache.replace(snapshot())
    expect(cache.error()).toBeUndefined()
  })

  it('retains the newest accepted host snapshot and ignores an older one', () => {
    const { storage } = memoryStorage()
    const cache = createFileCache(storage)
    const current = snapshot({
      fetchedAt: '2026-09-20T00:00:00.000Z',
      body: raw.replace('123', '456'),
    })
    cache.accept(current)
    cache.accept(snapshot())
    expect(cache.current()?.snapshot).toEqual(current)
    expect(storage.write).not.toHaveBeenCalled()
    cache.accept({ schema: 1, body: 'bad' })
    expect(cache.current()?.snapshot).toEqual(current)
  })

  it('a delayed startup read cannot overwrite a completed fresh replacement', async () => {
    const pending = deferred<unknown>()
    const { storage } = memoryStorage()
    vi.mocked(storage.read).mockReturnValue(pending.promise)
    const cache = createFileCache(storage)
    const loading = cache.load()
    const fresh = snapshot({
      fetchedAt: '2026-09-20T00:00:00.000Z',
      body: raw.replace('123', '456'),
    })
    await cache.replace(fresh)
    pending.resolve(snapshot())
    await loading
    expect(cache.current()?.snapshot).toEqual(fresh)
  })

  it('a delayed startup read cannot overwrite a newer accepted host snapshot', async () => {
    const pending = deferred<unknown>()
    const { storage } = memoryStorage()
    vi.mocked(storage.read).mockReturnValue(pending.promise)
    const cache = createFileCache(storage)
    const loading = cache.load()
    const fresh = snapshot({ body: raw.replace('123', '456') })
    cache.accept(fresh)
    pending.resolve(snapshot())
    await loading
    expect(cache.current()?.snapshot).toEqual(fresh)
  })

  it('a delayed stale startup error cannot replace a successful refresh status', async () => {
    const pending = deferred<unknown>()
    const { storage } = memoryStorage()
    vi.mocked(storage.read).mockReturnValue(pending.promise)
    const cache = createFileCache(storage)
    const loading = cache.load()
    await cache.replace(snapshot())
    pending.reject(new Error('stale startup failure'))
    await loading
    expect(cache.error()).toBeUndefined()
    expect(cache.current()?.snapshot).toEqual(snapshot())
  })

  it('compares accepted freshness by actual time even when ISO offsets differ', () => {
    const { storage } = memoryStorage()
    const cache = createFileCache(storage)
    const newer = snapshot({ fetchedAt: '2026-09-19T12:00:00.000Z' })
    cache.accept(newer)
    cache.accept(
      snapshot({ fetchedAt: '2026-09-19T13:00:00+02:00', body: raw.replace('123', '456') }),
    )
    expect(cache.current()?.parsed.records.K1ABC?.number).toBe('123')
  })

  it('rejects HTML mixed into an otherwise parsable downloaded file', () => {
    expect(() =>
      checkedSnapshot(snapshot({ body: `<html>Access denied</html>\n${raw}` })),
    ).toThrow()
  })

  it('rejects a damaged replacement with valid rows mixed with malformed rows', () => {
    expect(() =>
      checkedSnapshot(snapshot({ body: `${raw}\nTHIS IS CORRUPT\nK2XYZ,"unfinished` })),
    ).toThrow()
  })

  it('removes the durable copy and prevents an old in-flight load from resurrecting it', async () => {
    const pending = deferred<unknown>()
    const { storage, value } = memoryStorage(snapshot())
    vi.mocked(storage.read).mockReturnValue(pending.promise)
    const cache = createFileCache(storage)
    const loading = cache.load()
    await cache.remove()
    pending.resolve(snapshot())
    await loading
    expect(value()).toBeNull()
    expect(cache.current()).toBeUndefined()
    expect(cache.error()).toBeUndefined()
  })

  it('retains the active cache if removing durable storage fails', async () => {
    const { storage } = memoryStorage(snapshot())
    const cache = createFileCache(storage)
    await cache.load()
    vi.mocked(storage.write).mockRejectedValueOnce(new Error('cannot remove'))
    await expect(cache.remove()).rejects.toThrow('cannot remove')
    expect(cache.current()?.snapshot).toEqual(snapshot())
  })

  it('serializes overlapping replacements so slower older writes cannot win', async () => {
    const firstWrite = deferred<void>()
    const firstStarted = deferred<void>()
    const secondStarted = deferred<void>()
    const { storage, value, save } = memoryStorage()
    vi.mocked(storage.write)
      .mockImplementationOnce(async (candidate) => {
        firstStarted.resolve()
        await firstWrite.promise
        await save(candidate)
      })
      .mockImplementationOnce(async (candidate) => {
        secondStarted.resolve()
        await save(candidate)
      })
    const cache = createFileCache(storage)
    const first = snapshot()
    const second = snapshot({ body: raw.replace('123', '456') })
    const replacingFirst = cache.replace(first)
    const replacingSecond = cache.replace(second)
    await firstStarted.promise
    expect(storage.write).toHaveBeenCalledTimes(1)
    expect(cache.current()).toBeUndefined()
    firstWrite.resolve()
    await replacingFirst
    await secondStarted.promise
    await replacingSecond
    expect(storage.write).toHaveBeenCalledTimes(2)
    expect(value()).toEqual(second)
    expect(cache.current()?.snapshot).toEqual(second)
  })

  it('queues removal behind an in-flight replacement so completion cannot resurrect it', async () => {
    const write = deferred<void>()
    const started = deferred<void>()
    const { storage, value, save } = memoryStorage()
    vi.mocked(storage.write).mockImplementationOnce(async (candidate) => {
      started.resolve()
      await write.promise
      await save(candidate)
    })
    const cache = createFileCache(storage)
    const replacing = cache.replace(snapshot())
    const removing = cache.remove()
    await started.promise
    expect(storage.write).toHaveBeenCalledTimes(1)
    write.resolve()
    await Promise.all([replacing, removing])
    expect(storage.write).toHaveBeenNthCalledWith(2, null)
    expect(value()).toBeNull()
    expect(cache.current()).toBeUndefined()
  })

  it('queues a replacement after removal and ends with the explicitly requested new file', async () => {
    const removalWrite = deferred<void>()
    const started = deferred<void>()
    const { storage, value, save } = memoryStorage(snapshot())
    vi.mocked(storage.write).mockImplementationOnce(async (candidate) => {
      started.resolve()
      await removalWrite.promise
      await save(candidate)
    })
    const cache = createFileCache(storage)
    await cache.load()
    const next = snapshot({ body: raw.replace('123', '456') })
    const removing = cache.remove()
    const replacing = cache.replace(next)
    await started.promise
    expect(storage.write).toHaveBeenCalledTimes(1)
    removalWrite.resolve()
    await Promise.all([removing, replacing])
    expect(value()).toEqual(next)
    expect(cache.current()?.snapshot).toEqual(next)
  })

  it('retains the last good file when a queued write fails and continues the next queued replacement', async () => {
    const failedWrite = deferred<void>()
    const firstStarted = deferred<void>()
    const nextWrite = deferred<void>()
    const nextStarted = deferred<void>()
    const { storage, value, save } = memoryStorage(snapshot())
    vi.mocked(storage.write)
      .mockImplementationOnce(async () => {
        firstStarted.resolve()
        await failedWrite.promise
      })
      .mockImplementationOnce(async (candidate) => {
        nextStarted.resolve()
        await nextWrite.promise
        await save(candidate)
      })
    const cache = createFileCache(storage)
    await cache.load()
    const failing = cache.replace(snapshot({ body: raw.replace('123', '456') }))
    const failure = expect(failing).rejects.toThrow('write failure')
    const newest = snapshot({ body: raw.replace('123', '789') })
    const succeeding = cache.replace(newest)
    await firstStarted.promise
    expect(storage.write).toHaveBeenCalledTimes(1)
    failedWrite.reject(new Error('write failure'))
    await failure
    await nextStarted.promise
    expect(cache.current()?.snapshot).toEqual(snapshot())
    expect(value()).toEqual(snapshot())
    expect(cache.error()).toContain('write failure')
    nextWrite.resolve()
    await succeeding
    expect(cache.current()?.snapshot).toEqual(newest)
    expect(value()).toEqual(newest)
    expect(cache.error()).toBeUndefined()
  })

  it('a failed queued removal does not poison a subsequent replacement', async () => {
    const { storage } = memoryStorage(snapshot())
    const cache = createFileCache(storage)
    await cache.load()
    vi.mocked(storage.write).mockRejectedValueOnce(new Error('remove failed'))
    const removing = cache.remove()
    const failure = expect(removing).rejects.toThrow('remove failed')
    const next = snapshot({ body: raw.replace('123', '456') })
    const replacing = cache.replace(next)
    await failure
    await replacing
    expect(cache.current()?.snapshot).toEqual(next)
    expect(cache.error()).toBeUndefined()
  })
})
