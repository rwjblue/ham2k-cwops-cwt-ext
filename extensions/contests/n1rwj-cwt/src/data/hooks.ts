import type { DataFileDefinition, DynamicSettingsPanel, JSONValue } from '@ham2k/extension-sdk'
import { host } from '@ham2k/extension-sdk'
import manifest from '../../manifest.json'
import { tFor } from '../cwt/i18n.ts'
import { createFileCache } from './cache.ts'
import { DEFAULT_SOURCE, sourceText, sourceValidationError } from './source.ts'

export const fileCache = createFileCache({
  read: () => host.kvGet('last-good-cwt-file'),
  write: (value) => host.kvSet('last-good-cwt-file', value),
})

function record(value: JSONValue | undefined): Record<string, JSONValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export async function savedSettings(): Promise<Record<string, JSONValue>> {
  const settings = await host.getSettings()
  return record(record(settings.extensions)[`extension_${manifest.key}`])
}

async function savedSource(): Promise<string> {
  const mine = await savedSettings()
  return typeof mine.source === 'string' ? mine.source.trim() : ''
}

async function selectedSource(): Promise<string> {
  const source = await savedSource()
  // A bad saved setting must not hide the definition: the host needs it to
  // replay the last good data file from disk when starting offline.
  return sourceValidationError(source) ? DEFAULT_SOURCE : source || DEFAULT_SOURCE
}

export const DataFile: DataFileDefinition = {
  key: `${manifest.key}_history`,
  name: (_args, ctx) => tFor(ctx)('historyFileName'),
  description: (_args, ctx) => tFor(ctx)('historyFileDescription'),
  url: selectedSource,
  maxAgeInDays: 1,
  fetchType: 'raw',
  category: manifest.key,
  async rawToJSONData({ body, url }) {
    const source = await sourceText(body, url, host.fetch)
    return fileCache.replace({ schema: 1, ...source, fetchedAt: new Date().toISOString() })
  },
  onLoadRawData(data: unknown) {
    fileCache.accept(data)
  },
  onRemoveRawData: () => fileCache.remove(),
}

export const Settings: DynamicSettingsPanel = {
  kind: 'dynamic',
  async getPanels(_args, ctx) {
    return [
      {
        key: manifest.key,
        title: tFor(ctx)('prefillTitle'),
        icon: 'clock-fast',
        dataFilesSection: true,
      },
    ]
  },
  async getDefinition(_args, ctx) {
    const t = tFor(ctx)
    await fileCache.load()
    const source = await savedSource()
    const loaded = fileCache.current()
    const status = loaded
      ? t('historyStatus', {
          count: Object.keys(loaded.parsed.records).length,
          downloaded: loaded.snapshot.fetchedAt,
          date: loaded.parsed.sourceUpdatedAt ?? t('historyUnknownDate'),
          source: loaded.snapshot.url,
          warnings: loaded.parsed.issues.length,
        })
      : t('historyEmpty')
    const cacheError = fileCache.error()
    return {
      elements: [
        {
          type: 'markdown',
          text: [
            status,
            cacheError ? t('historyCacheError', { error: cacheError }) : '',
            sourceValidationError(source) ? t('historyUnsupportedSavedSource') : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
        {
          type: 'field',
          fieldType: 'text',
          key: 'source',
          label: t('historySourceLabel'),
          uppercase: false,
          value: source || DEFAULT_SOURCE,
        },
        { type: 'markdown', text: t('historyHelp') },
        { type: 'markdown', text: t('spotsHelp') },
      ],
    }
  },
  async validateField({ fieldKey, value }, ctx) {
    if (fieldKey !== 'source' || typeof value !== 'string') return null
    return sourceValidationError(value) ? tFor(ctx)('historyInvalidSource') : null
  },
  async onChangeField({ fieldKey, value }, ctx) {
    if (fieldKey === 'source' && typeof value === 'string') {
      if (sourceValidationError(value)) throw new Error(tFor(ctx)('historyInvalidSource'))
      await host.setSettings({ source: value.trim() })
    }
  },
}
