import { host } from '@ham2k/extension-sdk'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DataFile, fileCache, Settings } from '../../src/data/hooks.ts'
import { DEFAULT_SOURCE } from '../../src/data/source.ts'

const ctx = { online: false, locale: 'es' }
const panelKey = 'n1rwj-cwt'

beforeEach(async () => {
  vi.spyOn(host, 'kvGet').mockResolvedValue(null)
  vi.spyOn(host, 'kvSet').mockResolvedValue(undefined)
  vi.spyOn(host, 'getSettings').mockResolvedValue({})
  await fileCache.remove()
})
afterEach(() => vi.restoreAllMocks())

it('defaults spots to file entries and persists an explicit opt-out in both locales', async () => {
  const setSettings = vi.spyOn(host, 'setSettings').mockResolvedValue(undefined)
  for (const locale of ['en', 'es']) {
    const form = await Settings.getDefinition({ panelKey }, { ...ctx, locale })
    expect(form.elements).toContainEqual(
      expect.objectContaining({
        key: 'spotsHistoryOnly',
        fieldType: 'checkbox',
        value: true,
      }),
    )
    expect(JSON.stringify(form)).not.toContain('{{')
  }
  const args = { panelKey, fieldKey: 'spotsHistoryOnly', value: false, state: {} }
  await Settings.onChangeField(args, ctx)
  expect(setSettings).toHaveBeenCalledWith({ spotsHistoryOnly: false })
  vi.mocked(host.getSettings).mockResolvedValue({
    extensions: { 'extension_n1rwj-cwt': { spotsHistoryOnly: false } },
  })
  const form = await Settings.getDefinition({ panelKey }, ctx)
  expect(form.elements).toContainEqual(
    expect.objectContaining({ key: 'spotsHistoryOnly', value: false }),
  )
})

it('localizes dataset and freshness labels while retaining personal cache identity', async () => {
  fileCache.accept({
    schema: 1,
    body: '!!Order!!,Call,Name,Exch1\n# LastEdit,2026-09-17\nK1ABC,Al,1234',
    url: 'https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS.txt',
    fetchedAt: '2026-09-19T15:00:00.000Z',
  })
  expect(DataFile.key).toBe('n1rwj-cwt_history')
  expect(host.kvSet).toHaveBeenCalledWith('last-good-cwt-file', null)
  if (typeof DataFile.name !== 'function') throw new Error('Expected localized data-file name')
  for (const [locale, name, title, status] of [
    ['en', 'CWops CWT call history (N1RWJ)', 'CWT Prefill', 'Calls: 1. Downloaded'],
    [
      'es',
      'Historial de indicativos CWT de CWops (N1RWJ)',
      'Autocompletado CWT',
      'Indicativos: 1. Descargado:',
    ],
  ]) {
    const context = { ...ctx, locale }
    expect(await DataFile.name({}, context)).toBe(name)
    expect(await Settings.getPanels?.({}, context)).toMatchObject([{ key: panelKey, title }])
    const form = await Settings.getDefinition({ panelKey }, context)
    expect(form.elements[0]).toMatchObject({
      type: 'markdown',
      text: expect.stringContaining(status),
    })
    const text = JSON.stringify(form)
    expect(text).toContain('2026-09-19T15:00:00.000Z')
    expect(text).toContain('2026-09-17')
    expect(text).toContain('https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS.txt')
    expect(text).toContain('Sebastian Delmont, KI2D')
    expect(text).not.toContain('{{')
  }
})

it('localizes source errors and keeps legacy saved sources recoverable', async () => {
  vi.mocked(host.getSettings).mockResolvedValue({
    extensions: { 'extension_n1rwj-cwt': { source: '/tmp/old-file.txt' } },
  })
  const setSettings = vi.spyOn(host, 'setSettings').mockResolvedValue(undefined)
  const args = { panelKey, fieldKey: 'source', value: '/tmp/old-file.txt', state: {} }
  const error =
    'Use una URL HTTPS de N1MM o deje el campo vacío para la búsqueda automática. No se admiten rutas de archivos locales.'
  expect(await Settings.validateField?.(args, ctx)).toBe(error)
  await expect(Settings.onChangeField(args, ctx)).rejects.toThrow(error)
  expect(setSettings).not.toHaveBeenCalled()
  if (typeof DataFile.url !== 'function') throw new Error('Expected configured data-file URL')
  expect(await DataFile.url({}, ctx)).toBe(DEFAULT_SOURCE)
  const form = await Settings.getDefinition({ panelKey }, ctx)
  expect(form.elements[0]).toMatchObject({
    text: expect.stringContaining('La fuente guardada no es compatible.'),
  })
  await Settings.onChangeField({ ...args, value: ` ${DEFAULT_SOURCE} ` }, ctx)
  expect(setSettings).toHaveBeenCalledWith({ source: DEFAULT_SOURCE })
})
