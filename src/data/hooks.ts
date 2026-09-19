import type { DataFileDefinition, DynamicSettingsPanel, JSONValue } from '@ham2k/extension-sdk'
import { host } from '@ham2k/extension-sdk'
import manifest from '../../manifest.json'
import { createFileCache } from './cache.ts'
import { DEFAULT_SOURCE, sourceText } from './source.ts'

export const fileCache = createFileCache({
  read: () => host.kvGet('last-good-cwt-file'),
  write: (value) => host.kvSet('last-good-cwt-file', value),
})

function record(value: JSONValue | undefined): Record<string, JSONValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function selectedSource(): Promise<string> {
  const settings = await host.getSettings()
  const mine = record(record(settings.extensions)[`extension_${manifest.key}`])
  return typeof mine.source === 'string' && mine.source.trim() ? mine.source.trim() : DEFAULT_SOURCE
}

export const DataFile: DataFileDefinition = {
  key: `${manifest.key}_history`,
  name: 'CWops CWT call history (N1RWJ)',
  description:
    'N1MM CWOPS exchanges; retains the last valid file offline. Configure the source in CWT Prefill settings.',
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
  async getPanels() {
    return [{ key: manifest.key, title: 'CWT Prefill', icon: 'clock-fast', dataFilesSection: true }]
  },
  async getDefinition() {
    await fileCache.load()
    const loaded = fileCache.current()
    const status = loaded
      ? `${Object.keys(loaded.parsed.records).length} calls. Downloaded ${loaded.snapshot.fetchedAt}. File date: ${loaded.parsed.sourceUpdatedAt ?? 'not declared'}.\n\nSource: ${loaded.snapshot.url}\n\n${loaded.parsed.issues.length} parser warning(s).`
      : 'No valid file cached yet. Download the CWT data file in Settings → Data Files.'
    return {
      elements: [
        {
          type: 'markdown',
          text: `${status}${fileCache.error() ? `\n\nLast cache error: ${fileCache.error()}` : ''}`,
        },
        {
          type: 'field',
          fieldType: 'text',
          key: 'source',
          label: 'Call-history source URL or local file path',
          uppercase: false,
          value: await selectedSource(),
        },
        {
          type: 'markdown',
          text: 'The default N1MM category discovers its latest CWOPS download. You may select a CWOPS entry URL, a direct text URL on the N1MM hosts, or a local downloaded file. After changing the source, refresh the CWT entry in Data Files. The previous valid file remains active until a replacement succeeds.\n\nOperator edits and deliberate blanks take priority. Next: current-operation CWT exchanges, this selected file, then older CWT exchanges. A missing number never implies nonmembership.\n\nBased on the official CWT extension by **Sebastian Delmont, KI2D**, the main Ham2K developer. Disable the original CWops CWT extension to avoid duplicate handlers.',
        },
      ],
    }
  },
  async validateField({ fieldKey, value }) {
    if (fieldKey !== 'source' || typeof value !== 'string') return null
    const source = value.trim()
    if (!source || source.startsWith('/') || /^https:\/\/n1mm(?:wp)?\.hamdocs\.com\//i.test(source))
      return null
    return 'Use an HTTPS N1MM URL, an absolute local file path, or leave blank for automatic discovery.'
  },
  async onChangeField({ fieldKey, value }) {
    if (fieldKey === 'source' && typeof value === 'string')
      await host.setSettings({ source: value.trim() })
  },
}
