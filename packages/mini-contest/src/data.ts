import type { DataFileDefinition, DynamicSettingsPanel } from '@ham2k/extension-sdk'
import { host } from '@ham2k/extension-sdk'
import { createN1mmSource, DEFAULT_SOURCE, sourceValidationError } from '../../n1mm/src/source.ts'
import { type HistoryFile, parseHistory } from './history.ts'
import { type ContestConfig, type ContestManifest, object, text } from './model.ts'

interface Snapshot {
  schema: 1
  body: string
  url: string
  fetchedAt: string
}
export function createHistoryData(config: ContestConfig, manifest: ContestManifest) {
  let current: { snapshot: Snapshot; parsed: HistoryFile } | undefined
  let error: string | undefined
  const source = createN1mmSource({ filePrefix: config.historyPrefix, label: config.shortName })
  function accept(raw: unknown) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('schema' in raw) ||
      raw.schema !== 1 ||
      !('body' in raw) ||
      typeof raw.body !== 'string' ||
      !('url' in raw) ||
      typeof raw.url !== 'string' ||
      !('fetchedAt' in raw) ||
      typeof raw.fetchedAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.fetchedAt))
    )
      throw new Error('Invalid history snapshot. Previous data retained.')
    const parsed = parseHistory(config, raw.body)
    if (!current || raw.fetchedAt >= current.snapshot.fetchedAt)
      current = {
        snapshot: { schema: 1, body: raw.body, url: raw.url, fetchedAt: raw.fetchedAt },
        parsed,
      }
    error = undefined
  }
  async function savedSource() {
    const settings = await host.getSettings()
    return text(object(object(settings.extensions)[`extension_${manifest.key}`]).source).trim()
  }
  const dataFile: DataFileDefinition = {
    key: `${manifest.key}_history`,
    name: `${config.shortName} N1MM call history`,
    description:
      config.exchange === 'serial-name'
        ? 'Name suggestions only. Received serials must always be copied on the air.'
        : 'Name and state/province/DX suggestions; verify the received exchange on the air.',
    category: manifest.key,
    fetchType: 'raw',
    maxAgeInDays: 1,
    async url() {
      const url = await savedSource()
      return sourceValidationError(url) ? DEFAULT_SOURCE : url || DEFAULT_SOURCE
    },
    async rawToJSONData({ body, url }) {
      try {
        const downloaded = await source.sourceText(body, url, host.fetch)
        const snapshot: Snapshot = { schema: 1, ...downloaded, fetchedAt: new Date().toISOString() }
        accept(snapshot)
        return { ...snapshot }
      } catch (cause) {
        error = String(cause)
        throw cause
      }
    },
    onLoadRawData(raw: unknown) {
      try {
        accept(raw)
      } catch (cause) {
        error = String(cause)
      }
    },
    async onRemoveRawData() {
      current = undefined
      error = undefined
    },
  }
  const settings: DynamicSettingsPanel = {
    kind: 'dynamic',
    async getPanels() {
      return [
        {
          key: manifest.key,
          title: `${config.shortName} call history`,
          icon: manifest.icon,
          dataFilesSection: true,
        },
      ]
    },
    async getDefinition() {
      const url = await savedSource()
      return {
        elements: [
          {
            type: 'markdown',
            text: [
              current
                ? `${current.parsed.count} calls loaded. File date: ${current.parsed.updatedAt ?? 'unknown'}. Downloaded: ${current.snapshot.fetchedAt}. Parser warnings: ${current.parsed.warnings}.`
                : 'No call-history file loaded. Download it in Data Files to enable offline suggestions.',
              error ?? '',
              sourceValidationError(url) ?? '',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
          {
            type: 'field',
            fieldType: 'text',
            key: 'source',
            label: 'N1MM call-history source',
            uppercase: false,
            value: url || DEFAULT_SOURCE,
          },
          {
            type: 'markdown',
            text: `Leave blank for automatic ${config.shortName} file discovery, or paste an HTTPS N1MM entry/text URL. Refresh in Data Files after changing it. Explicit exchange edits and clearing always win. ${config.exchange === 'serial-name' ? 'MST serials are never suggested from history.' : 'Alaska and Hawaii send DX.'}`,
          },
        ],
      }
    },
    async validateField({ fieldKey, value }) {
      return fieldKey === 'source' && typeof value === 'string'
        ? sourceValidationError(value)
        : null
    },
    async onChangeField({ fieldKey, value }) {
      if (fieldKey !== 'source' || typeof value !== 'string') return
      const problem = sourceValidationError(value)
      if (problem) throw new Error(problem)
      await host.setSettings({ source: value.trim() })
    },
  }
  return { dataFile, settings, current: () => current?.parsed }
}
