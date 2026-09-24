import type { JSONValue, PanelHook, PanelRenderArgs } from '@ham2k/extension-sdk'
import { host } from '@ham2k/extension-sdk'
import type { MapTheme } from '../../../../packages/reception/src/map/index.ts'
import {
  applySceneEvent,
  createPanelStateStore,
} from '../../../../packages/reception/src/panel-state.ts'
import { ageLabel, receptionView, utcLabel } from '../../../../packages/reception/src/reports.ts'
import { renderReceptionScene } from '../../../../packages/reception/src/ui/scene.ts'
import type { UiModel } from '../../../../packages/reception/src/ui/types.ts'
import { configFields, operationOrigin, rbnBands, readConfig, watchedCall } from './config.ts'
import type { RbnClient } from './data/client.ts'
import { rbnClient } from './data/host-client.ts'
import type { RbnReport, RbnSnapshot } from './model.ts'
import { latestReports, receiverCoordinates } from './model.ts'
import { rbnPresentation } from './presentation.ts'
import { toReceptionReport } from './reception.ts'

const mapTheme: MapTheme = {
  surface: '#ffffff',
  land: '#f3f6f8',
  text: '#172832',
  muted: '#526876',
  border: '#cbd8df',
  accent: '#086f63',
}

function refreshDetails(snapshot: RbnSnapshot): string {
  const refresh = snapshot.refresh
  return [
    `Last request attempt: ${snapshot.lastAttemptMs === null ? 'never' : utcLabel(snapshot.lastAttemptMs)}.`,
    `Last successful check: ${snapshot.lastSuccessMs === null ? 'never' : utcLabel(snapshot.lastSuccessMs)}.`,
    refresh?.state === 'offline'
      ? 'No request sent: Ham2K reports the device is offline.'
      : refresh?.state === 'cooldown'
        ? 'No new request sent: local refresh cooldown; reusing the last result.'
        : refresh?.state === 'rate-limit'
          ? 'Requests paused after HTTP 429, shared with other My Signal panels and RBN Spots.'
          : '',
    refresh?.manualAtMs != null && refresh.automaticAtMs != null
      ? `Manual refresh allowed from ${utcLabel(refresh.manualAtMs)}. Automatic check eligible from ${utcLabel(refresh.automaticAtMs)} while visible.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
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
  const view = receptionView(reports.map(toReceptionReport), snapshot.call, 'outgoing', now, origin)
  const frameOptions = {
    origin: origin ? { ...origin, label: snapshot.call } : undefined,
    stations: view.stations,
    projection: config.projection,
    theme: mapTheme,
  }
  const test = String(args.operation?.stationCall ?? '')
    .toUpperCase()
    .split(/[/,]/)
    .some((part) => part === 'TEST' || part === 'T')
  const warnings = [
    snapshot.error ? `${snapshot.error} ${refreshDetails(snapshot)}` : '',
    snapshot.capped ? '500-report limit reached; some reports may be missing.' : '',
    reports.some((report) => !receiverCoordinates(report))
      ? 'Unlocated receivers are listed but not mapped.'
      : '',
  ].filter(Boolean)
  const notes = [
    test
      ? `TEST OPERATION — observing ${snapshot.call}; these reports belong to that station.`
      : '',
    snapshot.error ? '' : refreshDetails(snapshot),
    `Last ${config.windowMinutes} minutes of CW, RTTY, FT8, and FT4 reports from the Reverse Beacon Network via Vail ReRBN. Automatic checks at most once a minute while this panel is visible. Manual refresh waits at least 30 seconds between requests.`,
    'Receiver locations and countries use the cached RBN receiver directory, with HamDB registered grids supplied by Vail ReRBN as a fallback. Distances and bearings are estimates. Refresh the receiver directory in Data Files settings.',
    snapshot.capped
      ? 'The Vail ReRBN response reached its 500-report limit; additional reports may be missing.'
      : '',
    reports.some((report) => !receiverCoordinates(report))
      ? 'Receivers without a valid grid remain in the list.'
      : '',
  ].filter(Boolean)
  const themeMode = settings.themeMode
  const failureLabel = snapshot.failureKind
    ? {
        'rate-limit': 'rate limited',
        timeout: 'request timed out',
        request: 'request failed',
        http: 'HTTP error',
        response: 'invalid response',
        offline: 'offline',
      }[snapshot.failureKind]
    : 'refresh unavailable'
  const brightness =
    args.environment?.brightness ??
    (themeMode === 'light' || themeMode === 'dark' ? themeMode : undefined)
  return {
    presentation: rbnPresentation,
    title: test ? 'My Signal · TEST observation' : 'My Signal',
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
            ? `Cached · ${failureLabel}`
            : snapshot.failureKind
              ? `Vail ReRBN · ${failureLabel}`
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
    rows: view.rows,
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
    enrichReports?: (reports: readonly RbnReport[]) => RbnReport[]
  } = {},
): PanelHook {
  const client = dependencies.client ?? rbnClient
  const now = dependencies.now ?? Date.now
  const settings = dependencies.settings ?? (() => host.getSettings())
  const stateFor = createPanelStateStore()
  return {
    async getPanels() {
      return [
        {
          key: 'my-signal',
          title: 'My Signal',
          icon: 'radar',
          description:
            'Where your CW, RTTY, FT8, and FT4 signals are heard, with a map and RBN receiver reports provided by Vail ReRBN.',
          // The host withholds renders behind a tab or while the app is hidden.
          // Match the network cooldown to avoid rebuilding an unchanged map halfway through it.
          on: ['operation', 'tick:60'],
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
            '**My Signal requires SVG scene support.**\n\nThis app build does not supply the native panel environment and placement identity. Install a published Ham2K build with SVG scenes to use the reception map and sortable receiver list. No RBN request was made.',
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
      const rendered = renderReceptionScene(
        panelModel(
          args,
          {
            ...snapshot,
            reports: dependencies.enrichReports?.(snapshot.reports) ?? snapshot.reports,
          },
          ageReference,
          preferences,
        ),
        args.environment,
        { ...state.selection, view: config.view, band: config.band },
      )
      state.selection = rendered.selection
      return {
        kind: 'svgScene',
        title: `My Signal${call ? ` · ${call}` : ''}`,
        scene: rendered.scene,
      }
    },
    async onEvent(args, ctx) {
      if (!args.instanceId || !args.environment || args.event.phase !== 'activate')
        return { values: {} }
      const state = stateFor(args)
      const config = readConfig(args.config)
      const { controlId, action } = args.event
      const [prefix, value] = action.split(':')
      if (action !== `${prefix}:${value}`) return { values: {} }
      if (controlId === 'refresh' && action === 'refresh:reports') {
        const suppliedTime = args.clock?.realNowMillis
        // Await the request so the host disables buttons while it is pending.
        // Its post-event render reads this same shared cache, without another fetch.
        await client.getSnapshot(
          {
            call: watchedCall(args.operation, config.watchCall),
            windowMinutes: config.windowMinutes,
          },
          {
            force: true,
            online: ctx.online,
            ...(typeof suppliedTime === 'number' && Number.isFinite(suppliedTime)
              ? { realNowMillis: suppliedTime }
              : {}),
          },
        )
      } else {
        applySceneEvent(state, controlId, action)
      }
      // The host schedules an authoritative render after every scene event.
      // Structural changes (sort/filter/page/view) therefore need no numeric patch.
      return { values: {} }
    },
  }
}
