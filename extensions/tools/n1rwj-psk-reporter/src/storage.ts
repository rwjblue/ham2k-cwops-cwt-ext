import type { JSONValue } from '@ham2k/extension-sdk'

export interface PersistentStorage {
  read: (key: string) => Promise<JSONValue | null>
  write: (key: string, value: JSONValue) => Promise<void>
}

export interface SettingsHost {
  getSettings: () => Promise<Record<string, JSONValue>>
  setSettings: (values: Record<string, JSONValue>) => Promise<void>
}

/** kvGet/kvSet are runtime memory. Extension settings survive host restarts. */
export function createPersistentStorage(
  host: SettingsHost,
  extensionKey: string,
): PersistentStorage {
  let settings: Promise<Record<string, JSONValue>> | undefined
  let writing = Promise.resolve()
  function load() {
    settings ??= host
      .getSettings()
      .then((all) => {
        const groups = all.extensions
        const group =
          groups && typeof groups === 'object' && !Array.isArray(groups)
            ? groups[`extension_${extensionKey}`]
            : undefined
        return group && typeof group === 'object' && !Array.isArray(group) ? { ...group } : {}
      })
      .catch((error: unknown) => {
        settings = undefined
        throw error
      })
    return settings
  }
  return {
    async read(key) {
      return (await load())[key] ?? null
    },
    write(key, value) {
      // The host merges each write into one settings group. Serialize writes so
      // cache checkpoints and the HTTP cooldown cannot race that merge.
      const pending = writing.then(async () => {
        const values = await load()
        await host.setSettings({ [key]: value })
        values[key] = value
      })
      writing = pending.catch(() => {})
      return pending
    },
  }
}
