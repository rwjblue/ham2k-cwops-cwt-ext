import type { HookContext, JSONValue } from '@ham2k/extension-sdk'
import { describe, expect, it, vi } from 'vitest'
import { resolveCwtExchange } from '../../src/history/index.ts'
import { contact, createHistoryAdapter } from '../../src/integration/history.ts'

type Qson = Record<string, JSONValue>
const operation = { uuid: 'op', refs: [{ type: 'cwt', ref: '2026-09-23-1300' }] }
const candidate = { their: { call: 'K1ABC' } }

function qso(uuid: string, number = '1234', call = 'K1ABC'): Qson {
  return { uuid, their: { call }, refs: [{ type: 'cwt', name: 'AL', number }], startAtMillis: 1000 }
}

describe('history adapter', () => {
  it('connects native UUID-less lookup/control payloads to the UUID supplied by scoring', async () => {
    const history = createHistoryAdapter()
    const nativeOperation = {
      stationCall: 'N1RWJ/TEST',
      createdAtMillis: 1789832158828,
      refs: [{ type: 'cwt', ref: '2026-09-23-1300' }],
    }
    const current = qso('current', '3806', 'K0ACP')
    history.update({ operation: { ...nativeOperation, uuid: 'native-op' }, qsos: [current] })
    const getQsos = vi.fn()
    expect(
      await history.find(
        nativeOperation,
        { their: { call: 'K0ACP' } },
        {
          online: false,
          getQsos,
          getHistoryForCall: async () => [current],
        },
      ),
    ).toEqual({ currentOperation: [contact(current)], olderHistory: [] })
    expect(getQsos).not.toHaveBeenCalled()
  })

  it('never matches UUID-less operations by station alone or guesses through an ambiguous identity', async () => {
    const history = createHistoryAdapter()
    const nativeOperation = {
      stationCall: 'N1RWJ/TEST',
      createdAtMillis: 1000,
      refs: operation.refs,
    }
    const current = qso('current')
    history.update({ operation: { ...nativeOperation, uuid: 'first' }, qsos: [current] })
    const ctx = { online: false, getHistoryForCall: async () => [current] }
    expect(
      (await history.find({ ...nativeOperation, createdAtMillis: 2000 }, candidate, ctx))
        .currentOperation,
    ).toEqual([])
    expect(
      (await history.find({ ...nativeOperation, stationCall: 'W1XYZ' }, candidate, ctx))
        .currentOperation,
    ).toEqual([])
    history.update({ operation: { ...nativeOperation, uuid: 'second' }, qsos: [qso('other')] })
    expect((await history.find(nativeOperation, candidate, ctx)).currentOperation).toEqual([])
    expect(
      (await history.find({ ...nativeOperation, uuid: 'first' }, candidate, ctx)).currentOperation,
    ).toEqual([contact(current)])
  })

  it('reads the operation once, then classifies fresh matching rows by operation membership', async () => {
    const current = qso('current')
    const older = qso('older', '2345')
    const getQsos = vi.fn().mockResolvedValue([current])
    const getHistoryForCall = vi.fn().mockResolvedValue([older, current])
    const ctx: HookContext = { online: false, getQsos, getHistoryForCall }
    const history = createHistoryAdapter()
    const result = await history.find(operation, candidate, ctx)
    expect(result).toEqual({ currentOperation: [contact(current)], olderHistory: [contact(older)] })
    await history.find(operation, candidate, ctx)
    expect(getQsos).toHaveBeenCalledExactlyOnceWith('op')
    expect(getHistoryForCall).toHaveBeenCalledWith('K1ABC')
  })

  it('uses corrected history rather than the cached exchange and does not resurrect deletions', async () => {
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [qso('current', '1111')] })
    const getHistoryForCall = vi.fn().mockResolvedValue([qso('current', '2222')])
    const ctx = { online: false, getHistoryForCall }
    expect((await history.find(operation, candidate, ctx)).currentOperation[0]?.number).toBe('2222')
    getHistoryForCall.mockResolvedValue([])
    expect(await history.find(operation, candidate, ctx)).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
  })

  it('excludes the contact being edited from both history tiers', async () => {
    const edited = qso('edited')
    const other = qso('other')
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [edited] })
    const result = await history.find(operation, edited, {
      online: false,
      getHistoryForCall: async () => [edited, other],
    })
    expect(result.currentOperation).toEqual([])
    expect(result.olderHistory).toEqual([contact(other)])
  })

  it('retains known local rows on older hosts without targeted history and filters unrelated QSOs', async () => {
    const member = qso('member')
    const deleted = { ...qso('deleted'), deleted: true }
    const event = { ...qso('event'), band: 'event' }
    const unrelated = { ...qso('other'), refs: [{ type: 'naqp', name: 'AL', number: 'CT' }] }
    const history = createHistoryAdapter()
    const result = await history.find(operation, candidate, {
      online: false,
      getQsos: async () => [member, deleted, event, unrelated],
    })
    expect(result).toEqual({ currentOperation: [contact(member)], olderHistory: [] })
  })

  it('degrades when methods are unavailable or rejected', async () => {
    const history = createHistoryAdapter()
    expect(await history.find(operation, candidate, { online: false })).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
    const rejected = createHistoryAdapter()
    const getQsos = vi.fn().mockRejectedValue(new Error('unavailable'))
    const getHistoryForCall = vi.fn().mockRejectedValue(new Error('unavailable'))
    const ctx = { online: false, getQsos, getHistoryForCall }
    expect(await rejected.find(operation, candidate, ctx)).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
    await rejected.find(operation, candidate, ctx)
    expect(getQsos).toHaveBeenCalledTimes(1)
  })

  it('does not confuse a resumed scoring tail with the complete operation', async () => {
    const first = qso('first')
    const second = qso('second', '2345')
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [first] })
    const getQsos = vi.fn().mockResolvedValue([first, second])
    const ctx = { online: false, getQsos, getHistoryForCall: async () => [first, second] }
    await history.find(operation, candidate, ctx)
    expect(getQsos).not.toHaveBeenCalled()
    history.update({ operation, qsos: [second], resumeFrom: {} })
    const result = await history.find(operation, candidate, ctx)
    expect(result.currentOperation).toEqual([contact(first), contact(second)])
    expect(result.olderHistory).toEqual([])
    await history.find(operation, candidate, ctx)
    expect(getQsos).toHaveBeenCalledTimes(1)
  })

  it('does not let an older pending full-log read replace a newer full scoring pass', async () => {
    let finishRead: (rows: Qson[]) => void = () => {
      throw new Error('Read has not started')
    }
    const stale = qso('stale')
    const current = qso('current', '2345')
    const history = createHistoryAdapter()
    const ctx = {
      online: false,
      getQsos: () =>
        new Promise<Qson[]>((resolve) => {
          finishRead = resolve
        }),
      getHistoryForCall: async () => [current],
    }
    const pending = history.find(operation, candidate, ctx)
    history.update({ operation, qsos: [current] })
    finishRead([stale])
    expect(await pending).toEqual({ currentOperation: [contact(current)], olderHistory: [] })
  })

  it('shares an initial whole-log read among concurrent calls', async () => {
    const current = qso('current')
    const getQsos = vi.fn().mockResolvedValue([current])
    const history = createHistoryAdapter()
    await Promise.all(
      Array.from({ length: 5 }, () =>
        history.find(operation, candidate, { online: false, getQsos }),
      ),
    )
    expect(getQsos).toHaveBeenCalledTimes(1)
  })

  it('queries an exact portable call and its unambiguous base without using a generic exchange', async () => {
    const getHistoryForCall = vi
      .fn()
      .mockResolvedValue([{ uuid: 'generic', their: { call: 'K1ABC', exchange: 'AL 1234' } }])
    const history = createHistoryAdapter()
    expect(
      await history.find(
        operation,
        { their: { call: 'K1ABC/P' } },
        { online: false, getHistoryForCall },
      ),
    ).toEqual({ currentOperation: [], olderHistory: [] })
    expect(getHistoryForCall.mock.calls.map(([call]) => call)).toEqual(['K1ABC/P', 'K1ABC'])
  })

  it('contributes nothing outside CWT or for an incomplete call', async () => {
    const getQsos = vi.fn()
    const getHistoryForCall = vi.fn()
    const history = createHistoryAdapter()
    const ctx = { online: false, getQsos, getHistoryForCall }
    expect(await history.find({ uuid: 'op' }, candidate, ctx)).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
    expect(await history.find(operation, { their: { call: 'K' } }, ctx)).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
    expect(getQsos).not.toHaveBeenCalled()
    expect(getHistoryForCall).not.toHaveBeenCalled()
  })

  it('revalidates a sixth current-operation field omitted by capped history once per signature', async () => {
    const rows = [
      qso('sixth', '5555'),
      ...Array.from({ length: 5 }, (_, index) => qso(`recent-${index}`, '')),
    ]
    const getQsos = vi.fn().mockResolvedValue(rows)
    const getHistoryForCall = vi.fn().mockResolvedValue(rows.slice(1))
    const ctx = { online: false, getQsos, getHistoryForCall }
    const history = createHistoryAdapter()
    history.update({ operation, qsos: rows })
    const tiers = await history.find(operation, candidate, ctx)
    expect(
      resolveCwtExchange({
        call: 'K1ABC',
        ...tiers,
        selectedFile: { K1ABC: { call: 'K1ABC', number: '9999', membership: 'member' } },
      }).number,
    ).toMatchObject({ value: '5555', source: 'current-operation' })
    await Promise.all(Array.from({ length: 5 }, () => history.find(operation, candidate, ctx)))
    expect(getQsos).toHaveBeenCalledTimes(1)
    history.update({ operation, qsos: rows })
    await history.find(operation, candidate, ctx)
    expect(getQsos).toHaveBeenCalledTimes(2)
  })

  it('revalidates after targeted history changes, including deleting the final contact', async () => {
    const current = qso('current')
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [current] })
    const getQsos = vi.fn().mockResolvedValue([current])
    const getHistoryForCall = vi.fn().mockResolvedValue([qso('older', '2345')])
    const ctx = { online: false, getQsos, getHistoryForCall }
    expect((await history.find(operation, candidate, ctx)).currentOperation).toEqual([
      contact(current),
    ])
    getQsos.mockResolvedValue([])
    getHistoryForCall.mockResolvedValue([])
    expect(await history.find(operation, candidate, ctx)).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
    await history.find(operation, candidate, ctx)
    expect(getQsos).toHaveBeenCalledTimes(2)
  })

  it('never reclassifies a current row deleted during validation as older history', async () => {
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [qso('current'), qso('omitted')] })
    const result = await history.find(operation, candidate, {
      online: false,
      getQsos: async () => [],
      getHistoryForCall: async () => [qso('current')],
    })
    expect(result).toEqual({ currentOperation: [], olderHistory: [] })
  })

  it('falls back to fresh targeted rows when validation fails without repeatedly reading the log', async () => {
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [qso('current'), qso('omitted')] })
    const getQsos = vi.fn().mockRejectedValue(new Error('unavailable'))
    const ctx = { online: false, getQsos, getHistoryForCall: async () => [qso('current', '2345')] }
    expect((await history.find(operation, candidate, ctx)).currentOperation).toEqual([
      contact(qso('current', '2345')),
    ])
    await history.find(operation, candidate, ctx)
    expect(getQsos).toHaveBeenCalledTimes(1)
  })

  it('shares an in-flight validation and discards it after a newer scoring pass', async () => {
    const history = createHistoryAdapter()
    history.update({ operation, qsos: [qso('stale')] })
    let finishRead: (rows: Qson[]) => void = () => {
      throw new Error('Read has not started')
    }
    const getQsos = vi.fn(
      () =>
        new Promise<Qson[]>((resolve) => {
          finishRead = resolve
        }),
    )
    const ctx = { online: false, getQsos, getHistoryForCall: async () => [] }
    const first = history.find(operation, candidate, ctx)
    const second = history.find(operation, candidate, ctx)
    await vi.waitFor(() => expect(getQsos).toHaveBeenCalledTimes(1))
    history.update({ operation, qsos: [] })
    finishRead([qso('stale')])
    expect(await first).toEqual({ currentOperation: [], olderHistory: [] })
    expect(await second).toEqual({ currentOperation: [], olderHistory: [] })
    expect(await history.find(operation, candidate, ctx)).toEqual({
      currentOperation: [],
      olderHistory: [],
    })
  })
})
