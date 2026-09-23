import type {
  DynamicSettingsPanel,
  FetchOptions,
  FetchResponse,
  JSONValue,
  Spot,
  SpotsHook,
} from '@ham2k/extension-sdk'
import { host } from '@ham2k/extension-sdk'
import manifest from '../../manifest.json'
import { continents } from '../data/continents.ts'
import { createSpotFeed } from './feed.ts'
import { allCalls, discoverFilters, type FilterBridge, matchFilter } from './filters.ts'
import { type ReceiverLookup, selectSpots } from './model.ts'
import {
  ownSettings,
  radiusIssue,
  readPreferences,
  spotModes,
  tokens,
  validateEdit,
} from './preferences.ts'

interface Options {
  fetch(url: string, options?: FetchOptions): Promise<FetchResponse>
  lookup: ReceiverLookup
  now?: () => number
  bridge?: FilterBridge
  getSettings?: typeof host.getSettings
  setSettings?: typeof host.setSettings
}

export function createRbnSpots(options: Options) {
  const getSettings = options.getSettings ?? host.getSettings
  const setSettings = options.setSettings ?? host.setSettings
  const now = options.now ?? Date.now
  const feeds = new Map(
    spotModes.map((mode) => [mode, createSpotFeed({ ...options, source: manifest.key, mode })]),
  )
  let status = ''
  let generation = 0
  // Serialize default selection and explicit edits so a slow discovery cannot
  // overwrite an operator's choice. Persist the provider even if its file is absent.
  let queue: Promise<unknown> = Promise.resolve()
  function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn)
    queue = result.catch(() => undefined)
    return result
  }
  // Temporary source-side preference/discovery. Native relevance will instead
  // follow the operation in the logger; migrate explicit choices before removal.
  async function selection(online: boolean, forSettings = false) {
    return serialized(async () => {
      const raw = ownSettings(await getSettings())
      const discovered = await discoverFilters(online, options.bridge).catch((error: unknown) => {
        if (!forSettings && raw.spotCallFilter !== allCalls) throw error
        status = 'Call-history filters could not be loaded. Retry after enabling the extension.'
        return { providers: [], failed: true }
      })
      if (raw.spotCallFilter === undefined) {
        const chosen = discovered.providers.find((provider) => provider.defaultSelected)
        if (chosen) {
          await setSettings({ spotCallFilter: chosen.key })
          raw.spotCallFilter = chosen.key
        } else if (discovered.failed && !forSettings) {
          throw new Error('Call-history filters could not be loaded. No spots shown.')
        }
      }
      const key = typeof raw.spotCallFilter === 'string' ? raw.spotCallFilter : allCalls
      const provider = discovered.providers.find((entry) => entry.key === key)
      const unavailable =
        key !== allCalls && !provider?.available
          ? provider?.reason ||
            'The selected call-history extension is unavailable. Enable it or choose another filter.'
          : ''
      return { raw, key, provider, unavailable, providers: discovered.providers }
    })
  }
  const spots: SpotsHook = {
    sourceName: 'RBN',
    async fetchSpots(_args, ctx) {
      const started = generation
      try {
        const selected = await selection(ctx.online)
        if (selected.unavailable) {
          status = selected.unavailable
          return []
        }
        const prefs = readPreferences(selected.raw)
        const feed = feeds.get(prefs.mode)
        if (!feed) return []
        let reports: Spot[]
        try {
          reports = await feed.get(ctx.online)
          status = ctx.online ? '' : 'Offline: showing unexpired cached reports only.'
        } catch (error) {
          status = `${error instanceof Error ? error.message : 'RBN unavailable.'} Showing unexpired cached reports only.`
          reports = await feed.get(false)
        }
        // Compatibility bridge only: the feed cache above retains every report.
        // Once native relevance can preserve our history-based preference, remove
        // this match call and selectSpots' allowedCalls gate, keeping receiver filters.
        const allowed =
          selected.key === allCalls
            ? undefined
            : await matchFilter(
                selected.key,
                reports.map((spot) => spot.their.call),
                ctx.online,
                options.bridge,
              )
        // A settings edit while the network was pending invalidates this answer.
        if (started !== generation) return []
        return selectSpots(reports, allowed, prefs, options.lookup, now())
      } catch (error) {
        status =
          error instanceof Error ? error.message : 'Spot filters unavailable. No spots shown.'
        return []
      }
    },
  }
  const settings: DynamicSettingsPanel = {
    kind: 'dynamic',
    async getPanels() {
      return [{ key: manifest.key, title: 'RBN', icon: 'radar' }]
    },
    async getDefinition(_args, ctx) {
      const selected = await selection(ctx.online, true)
      const choices = [
        { label: 'All calls', value: allCalls },
        ...selected.providers.map((provider) => ({
          label: provider.label + (provider.available ? '' : ' (file unavailable)'),
          value: provider.key,
        })),
      ]
      if (!choices.some((entry) => entry.value === selected.key))
        choices.push({ label: `Unavailable: ${selected.key}`, value: selected.key })
      return {
        elements: [
          {
            type: 'header',
            style: 'section',
            title: 'My Signal — Who hears me',
          },
          {
            type: 'markdown',
            text: 'The My Signal map and receiver reports show who hears your station. Configure them with the tune button beside the My Signal panel title in your operation. The Spots filters below never affect My Signal.',
          },
          {
            type: 'header',
            style: 'section',
            title: 'Spots — Who I might hear',
          },
          {
            type: 'markdown',
            text: 'All settings below apply only to the RBN source in Spots, across operations. Nearby receivers can help you find stations to try; reception at your station is not guaranteed.',
          },
          {
            type: 'field',
            fieldType: 'select',
            key: 'spotCallFilter',
            label: 'Call-history filter',
            options: choices,
            value: selected.key,
          },
          {
            type: 'field',
            fieldType: 'select',
            key: 'spotMode',
            label: 'Spot mode',
            value: selected.raw.spotMode ?? 'CW',
            options: spotModes.map((value) => ({ label: value, value })),
          },
          {
            type: 'field',
            fieldType: 'text',
            key: 'spotSkimmers',
            label: 'Only these skimmers',
            value: selected.raw.spotSkimmers ?? '',
            uppercase: true,
          },
          {
            type: 'field',
            fieldType: 'text',
            key: 'spotGrids',
            label: 'Receiver grid regions',
            value: selected.raw.spotGrids ?? '',
            uppercase: true,
          },
          {
            type: 'markdown',
            text: 'Separate entries with spaces or commas. Leave blank for all receivers. Use exact skimmer IDs (for example KM3T-5). Regions are Maidenhead prefixes such as FN, EM, JO, or FN42. Every enabled receiver filter must match.',
          },
          {
            type: 'field',
            fieldType: 'multiselect',
            key: 'spotContinents',
            label: 'Receiver continents',
            description:
              'No selection allows all continents. Uses the skimmer location, not the spotted station.',
            value: selected.raw.spotContinents ?? [],
            options: Object.entries(continents).map(([value, label]) => ({ value, label })),
          },
          {
            type: 'field',
            fieldType: 'text',
            key: 'spotRadiusGrid',
            label: 'Distance origin grid',
            description:
              'Your grid for distance filtering, shared across operations. Update it when you move.',
            placeholder: 'e.g. FN42FK',
            value: selected.raw.spotRadiusGrid ?? '',
            uppercase: true,
          },
          {
            type: 'field',
            fieldType: 'number',
            key: 'spotRadiusMiles',
            label: 'Maximum receiver distance (miles)',
            description: 'Leave blank for no distance limit. Set the origin grid first.',
            value: selected.raw.spotRadiusMiles ?? '',
          },
          {
            type: 'markdown',
            text: 'Distance is approximate, measured between grid centers. Refresh the RBN receiver directory in Data Files to load continents and updated grids. Receivers with no known continent are excluded when continents are selected; receivers with no known grid are excluded when a grid region or distance limit is set.',
          },
          {
            type: 'markdown',
            text:
              selected.unavailable ||
              radiusIssue(selected.raw) ||
              status ||
              'Reports cover the last ten minutes on 160–10m, including WARC bands. Busy bands may exceed the bounded snapshot. Changes apply on the next Spots refresh.',
          },
        ],
      }
    },
    async validateField({ fieldKey, value, state }) {
      return validateEdit(fieldKey, value, state)
    },
    async onChangeField({ fieldKey, value }) {
      await serialized(async () => {
        // Recheck persisted siblings inside the queue: simultaneous edits must
        // not save a distance limit with no origin even if form state is stale.
        const error = validateEdit(fieldKey, value, ownSettings(await getSettings()))
        if (error) throw new Error(error)
        generation++
        await setSettings({
          [fieldKey]: (fieldKey === 'spotSkimmers' || fieldKey === 'spotGrids'
            ? tokens(value).join(', ')
            : fieldKey === 'spotRadiusGrid'
              ? String(value).trim().toUpperCase()
              : fieldKey === 'spotContinents'
                ? [...new Set(value as string[])]
                : fieldKey === 'spotRadiusMiles'
                  ? value === null || String(value).trim() === ''
                    ? ''
                    : Number(value)
                  : value) as JSONValue,
        })
      })
      status = ''
    },
  }
  return { spots, settings }
}
