import type { JSONValue, PanelHook, PanelRenderArgs } from '@ham2k/extension-sdk'
import { host } from '@ham2k/extension-sdk'
import type { PanelConfig } from './config.ts'
import { configFields, operationOrigin, rbnBands, readConfig, watchedCall } from './config.ts'
import type { RbnClient } from './data/client.ts'
import { rbnClient } from './data/host-client.ts'
import type { MapReceiver, MapTheme } from './map/index.ts'
import type { RbnSnapshot } from './model.ts'
import { bearingDegrees, distanceKm, latestReports, receiverCoordinates } from './model.ts'
import type { SceneSelection } from './ui/scene.ts'
import { renderRbnScene } from './ui/scene.ts'
import type { UiModel } from './ui/types.ts'

const mapTheme: MapTheme = {
  surface: '#ffffff',
  land: '#f3f6f8',
  text: '#172832',
  muted: '#526876',
  border: '#cbd8df',
  accent: '#086f63',
}

function ageLabel(time: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  return minutes === 0 ? '<1 min ago' : `${minutes} min ago`
}

function utcLabel(time: number): string {
  return `${new Date(time).toISOString().slice(11, 19)} UTC`
}

export function panelModel(
  args: PanelRenderArgs,
  snapshot: RbnSnapshot,
  now: number,
  settings: Record<string, JSONValue> = {},
): UiModel {
  const config = readConfig(args.config)
  const origin = operationOrigin(args.operation, config.gridOverride)
  const reports = latestReports(snapshot.reports)
  const bands = [...new Set([...rbnBands, ...reports.map((report) => report.band), config.band])]
  const pointsFor = (selected: typeof reports): MapReceiver[] => {
    // One point/path per receiver, even when it has reported on several bands.
    const receivers = new Map<string, (typeof reports)[number]>()
    for (const report of selected)
      if (!receivers.has(report.receiver)) receivers.set(report.receiver, report)
    return [...receivers.values()].flatMap((report) => {
      const coordinates = receiverCoordinates(report)
      return coordinates
        ? [
            {
              ...coordinates,
              key: report.receiver,
              label: report.receiver,
              ageMinutes: Math.max(0, (now - report.timeMs) / 60_000),
            },
          ]
        : []
    })
  }
  const allPoints = pointsFor(reports)
  const frameOptions = {
    origin: origin ? { ...origin, label: snapshot.call } : undefined,
    receivers: allPoints,
    projection: config.projection,
    theme: mapTheme,
  }
  const test = String(args.operation?.stationCall ?? '')
    .toUpperCase()
    .split(/[/,]/)
    .some((part) => part === 'TEST' || part === 'T')
  const warnings = [
    snapshot.error ?? '',
    snapshot.capped ? '500-report limit reached; some reports may be missing.' : '',
    reports.some((report) => !receiverCoordinates(report))
      ? 'Unlocated receivers are listed but not mapped.'
      : '',
  ].filter(Boolean)
  const notes = [
    test
      ? `TEST OPERATION — observing ${snapshot.call}; these reports belong to that station.`
      : '',
    snapshot.error ?? '',
    `Last ${config.windowMinutes} minutes of CW, RTTY, FT8, and FT4 reports from the Reverse Beacon Network via Vail ReRBN. Checks at most once a minute while this panel is visible.`,
    'Receiver locations use HamDB registered grids supplied by Vail ReRBN and may differ from the actual skimmer location. Distances and bearings are estimates.',
    snapshot.capped
      ? 'The Vail ReRBN response reached its 500-report limit; additional reports may be missing.'
      : '',
    reports.some((report) => !receiverCoordinates(report))
      ? 'Receivers without a valid registered grid remain in the list.'
      : '',
  ].filter(Boolean)
  const themeMode = settings.themeMode
  const brightness =
    args.environment?.brightness ??
    (themeMode === 'light' || themeMode === 'dark' ? themeMode : undefined)
  return {
    title: test ? 'My signal · TEST observation' : 'My signal',
    watchCall: snapshot.call,
    fetchedAt: snapshot.lastSuccessMs === null ? undefined : utcLabel(snapshot.lastSuccessMs),
    generatedAt: utcLabel(now),
    lastReport: reports.length
      ? ageLabel(Math.max(...reports.map((report) => report.timeMs)), now)
      : undefined,
    status:
      snapshot.status === 'ready'
        ? 'Recent reports'
        : snapshot.status === 'empty'
          ? 'No recent reports'
          : snapshot.status === 'stale'
            ? 'Cached · refresh unavailable'
            : 'Vail ReRBN unavailable',
    statusKind:
      snapshot.status === 'ready'
        ? 'live'
        : snapshot.status === 'stale'
          ? 'cached'
          : snapshot.status,
    locationLabel: origin
      ? `Map origin ${origin.label} · ${origin.latitude.toFixed(3)}°, ${origin.longitude.toFixed(3)}°`
      : 'Set an operation location or a map origin grid in panel settings.',
    note: notes.join(' '),
    warnings,
    bands,
    mapOptions: { ...frameOptions, width: 520, height: 360 },
    rows: reports.map((report) => {
      const coordinates = receiverCoordinates(report)
      return {
        receiver: report.receiver,
        country: report.country ?? undefined,
        band: report.band,
        mode: report.mode,
        frequencyKhz: report.frequencyKhz,
        snrDb: report.snrDb ?? undefined,
        wpm: report.wpm ?? undefined,
        timeMs: report.timeMs,
        age: ageLabel(report.timeMs, now),
        ageMinutes: Math.max(0, (now - report.timeMs) / 60_000),
        distanceKm: origin && coordinates ? distanceKm(origin, coordinates) : undefined,
        bearingDeg: origin && coordinates ? bearingDegrees(origin, coordinates) : undefined,
      }
    }),
    defaultBand: config.band,
    defaultSort: config.sort,
    defaultDirection: config.direction,
    defaultView: config.view,
    theme: { brightness, ...args.environment?.colors },
  }
}

export function createRbnPanel(
  dependencies: {
    client?: RbnClient
    now?: () => number
    settings?: () => Promise<Record<string, JSONValue>>
  } = {},
): PanelHook {
  const client = dependencies.client ?? rbnClient
  const now = dependencies.now ?? Date.now
  const settings = dependencies.settings ?? (() => host.getSettings())
  const selections = new Map<
    string,
    { signature: string; config: PanelConfig; selection: Partial<SceneSelection> }
  >()
  function stateFor(args: PanelRenderArgs) {
    const config = readConfig(args.config)
    const signature = JSON.stringify([args.operation?.uuid, args.operation?.stationCall])
    const key = args.instanceId ?? ''
    let state = selections.get(key)
    if (!state || state.signature !== signature) {
      state = { signature, config, selection: {} }
      selections.delete(key)
      selections.set(key, state)
      // Placements can disappear without a teardown hook; bound session memory.
      if (selections.size > 32) selections.delete(selections.keys().next().value as string)
    } else if (JSON.stringify(state.config) !== JSON.stringify(config)) {
      // Saving one default must not discard unrelated in-panel choices.
      // A changed default takes effect for that control on the next render.
      for (const field of ['sort', 'direction'] as const) {
        if (state.config[field] !== config[field]) delete state.selection[field]
      }
      state.selection.page = 0
      state.config = config
    }
    return state
  }
  return {
    async getPanels() {
      return [
        {
          key: 'my-signal',
          title: 'RBN · My signal',
          icon: 'radar',
          description:
            'Where your CW, RTTY, FT8, and FT4 signals are heard, with a map and RBN receiver reports provided by Vail ReRBN.',
          on: ['operation', 'tick:30'],
          multiple: true,
          form: configFields,
        },
      ]
    },
    async render(args, ctx) {
      if (!args.environment || !args.instanceId) {
        return {
          kind: 'markdown',
          title: 'RBN · App update needed',
          content:
            '**RBN · My signal requires SVG scene support.**\n\nThis app build does not supply the native panel environment and placement identity. Install a published Ham2K build with SVG scenes to use the reception map and sortable receiver list. No RBN request was made.',
        }
      }
      const config = readConfig(args.config)
      const call = watchedCall(args.operation, config.watchCall)
      const suppliedTime = args.clock?.realNowMillis
      const realTime =
        typeof suppliedTime === 'number' && Number.isFinite(suppliedTime) ? suppliedTime : undefined
      const [snapshot, preferences] = await Promise.all([
        client.getSnapshot(
          { call, windowMinutes: config.windowMinutes },
          {
            online: ctx.online,
            ...(realTime === undefined ? {} : { realNowMillis: realTime }),
          },
        ),
        settings().catch(() => ({})),
      ])
      // Successful snapshots share their fetch-time age reference; unavailable
      // snapshots still age once a minute so old reports never appear fresh.
      const ageReference =
        snapshot.status === 'ready' || snapshot.status === 'empty'
          ? (snapshot.lastSuccessMs ?? realTime ?? now())
          : Math.max(snapshot.lastSuccessMs ?? 0, Math.floor((realTime ?? now()) / 60_000) * 60_000)
      const state = stateFor(args)
      const rendered = renderRbnScene(
        panelModel(args, snapshot, ageReference, preferences),
        args.environment,
        { ...state.selection, view: config.view, band: config.band },
      )
      state.selection = rendered.selection
      return {
        kind: 'svgScene',
        title: `RBN · ${call || 'My signal'}`,
        scene: rendered.scene,
      }
    },
    async onEvent(args) {
      if (!args.instanceId || !args.environment || args.event.phase !== 'activate')
        return { values: {} }
      const state = stateFor(args)
      const config = readConfig(args.config)
      const { controlId, action } = args.event
      const [prefix, value] = action.split(':')
      if (action !== `${prefix}:${value}`) return { values: {} }
      if (
        controlId === 'sort' &&
        prefix === 'sort' &&
        ['age', 'call', 'snr', 'distance', 'frequency', 'wpm'].includes(value)
      ) {
        state.selection = { ...state.selection, sort: value as SceneSelection['sort'], page: 0 }
      } else if (controlId === 'direction' && action === 'direction:toggle') {
        state.selection = {
          ...state.selection,
          direction: (state.selection.direction ?? config.direction) === 'asc' ? 'desc' : 'asc',
          page: 0,
        }
      } else if (
        (controlId === 'previous' && action === 'page:previous') ||
        (controlId === 'next' && action === 'page:next')
      ) {
        state.selection = {
          ...state.selection,
          page: Math.max(
            0,
            Math.min(499, (state.selection.page ?? 0) + (controlId === 'next' ? 1 : -1)),
          ),
        }
      } else if (controlId === 'details' && action === 'details:toggle') {
        state.selection = { ...state.selection, details: !state.selection.details, page: 0 }
      }
      // The host schedules an authoritative render after every scene event.
      // Structural changes (sort/filter/page/view) therefore need no numeric patch.
      return { values: {} }
    },
  }
}
