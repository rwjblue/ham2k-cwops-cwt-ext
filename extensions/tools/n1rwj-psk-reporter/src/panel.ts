import type { PanelHook, PanelRenderArgs, SettingsField } from '@ham2k/extension-sdk'
import {
  operationOrigin,
  readConfig,
  receptionBands,
  receptionConfigFields,
  watchedCall,
} from '../../../../packages/reception/src/config.ts'
import { receptionMapTheme } from '../../../../packages/reception/src/map/theme.ts'
import {
  applySceneEvent,
  createPanelStateStore,
} from '../../../../packages/reception/src/panel-state.ts'
import {
  ageLabel,
  type ReceptionReport,
  receptionView,
  utcLabel,
} from '../../../../packages/reception/src/reports.ts'
import { renderReceptionScene } from '../../../../packages/reception/src/ui/scene.ts'
import type { UiModel } from '../../../../packages/reception/src/ui/types.ts'
import type { LiveReception, LiveSnapshot } from './live.ts'

export const configFields: SettingsField[] = [
  {
    type: 'field',
    fieldType: 'select',
    key: 'receptionDirection',
    label: 'Reception',
    value: 'outgoing',
    options: [
      { label: 'Who hears me', value: 'outgoing' },
      { label: 'Who I hear', value: 'incoming' },
    ],
  },
  ...receptionConfigFields('Station', false),
]

/** Pure presentation shared by recorded fixtures and live snapshots. */
export function pskPanelModel(
  args: PanelRenderArgs,
  reports: readonly ReceptionReport[],
  now: number,
  live: Pick<LiveSnapshot, 'state' | 'message' | 'retryAt' | 'capped'>,
): UiModel {
  const config = readConfig(args.config)
  const incoming = args.config.receptionDirection === 'incoming'
  const call = watchedCall(args.operation, config.watchCall)
  const origin = operationOrigin(args.operation, config.gridOverride)
  const selected = reports.filter(
    (report) =>
      report.timeMs >= now - config.windowMinutes * 60_000 && report.timeMs <= now + 60_000,
  )
  const view = receptionView(selected, call, incoming ? 'incoming' : 'outgoing', now, origin)
  return {
    title: call ? `PSK Reporter · ${call}` : 'PSK Reporter',
    watchCall: call,
    generatedAt: utcLabel(now),
    lastReport: view.rows.length
      ? ageLabel(Math.max(...view.rows.map((row) => row.timeMs ?? 0)), now)
      : undefined,
    status:
      live.state === 'live'
        ? view.rows.length
          ? 'Live reception'
          : 'Connected · waiting for reports'
        : live.state === 'retrying'
          ? `${live.message} · retry in ${Math.max(0, Math.ceil(((live.retryAt ?? now) - now) / 1000))}s`
          : live.message ||
            (live.state === 'subscribing'
              ? 'Subscribing to reception reports'
              : 'Connecting to PSK Reporter'),
    statusKind:
      live.state === 'live'
        ? 'live'
        : view.rows.length
          ? 'cached'
          : live.state === 'retrying'
            ? 'error'
            : 'empty',
    warnings: live.capped ? ['Report capacity reached; this window is incomplete.'] : [],
    note: 'Live reports while this panel is visible; no historical backfill. Who I hear requires uploads from your receiving software. Reports are observations, not confirmed contacts.',
    locationLabel: origin
      ? `Map origin ${origin.label}`
      : 'Set an operation location or map origin grid.',
    presentation: {
      source: 'PSK Reporter',
      stationLabel: incoming ? 'Transmitter' : 'Receiver',
      cwSpeed: false,
      details: [
        'Feed: PSK Reporter via the MQTT service operated by M0LTE. SNR is measured at the receiver.',
      ],
    },
    bands: [...new Set([...receptionBands, ...view.rows.map((row) => row.band)])],
    rows: view.rows,
    mapOptions: {
      width: 520,
      height: 360,
      origin: origin ? { ...origin, label: call } : undefined,
      stations: view.stations,
      stationLabel: incoming ? 'transmitter' : 'receiver',
      projection: config.projection,
      theme: receptionMapTheme(args.environment?.brightness ?? 'light'),
    },
    defaultBand: config.band,
    defaultView: config.view,
    defaultSort: config.sort === 'wpm' ? 'age' : config.sort,
    defaultDirection: config.direction,
  }
}

export function createPskPanel(live: LiveReception): PanelHook {
  const stateFor = createPanelStateStore()
  return {
    async getPanels() {
      return [
        {
          key: 'psk-reporter',
          title: 'PSK Reporter',
          icon: 'radar',
          description: 'Live PSK Reporter reception maps for a watched callsign.',
          on: ['operation', 'tick:5'],
          multiple: true,
          form: configFields,
        },
      ]
    },
    async render(args, ctx) {
      if (!args.environment || !args.instanceId)
        return {
          kind: 'markdown',
          content: 'PSK Reporter requires Ham2K build 171 or newer with native SVG panels.',
        }
      const state = stateFor(args, String(args.config.receptionDirection ?? 'outgoing'))
      const config = readConfig(args.config)
      const now = args.clock?.realNowMillis ?? Date.now()
      const snapshot = live.snapshot(
        args.instanceId,
        watchedCall(args.operation, config.watchCall),
        args.config.receptionDirection === 'incoming' ? 'incoming' : 'outgoing',
        config.windowMinutes,
        ctx.online !== false,
      )
      const model = pskPanelModel(args, snapshot.reports, now, snapshot)
      const rendered = renderReceptionScene(model, args.environment, {
        ...state.selection,
        view: config.view,
        band: config.band,
      })
      state.selection = rendered.selection
      return { kind: 'svgScene', title: model.title, scene: rendered.scene }
    },
    async onEvent(args) {
      if (args.instanceId && args.environment && args.event.phase === 'activate') {
        applySceneEvent(
          stateFor(args, String(args.config.receptionDirection ?? 'outgoing')),
          args.event.controlId,
          args.event.action,
          false,
        )
      }
      return { values: {} }
    },
  }
}
