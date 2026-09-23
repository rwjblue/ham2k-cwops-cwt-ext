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

/** Pure presentation seam for recorded fixtures now, a live snapshot later. */
export function pskPanelModel(
  args: PanelRenderArgs,
  reports: readonly ReceptionReport[],
  now: number,
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
    title: 'PSK Reporter · Preview',
    watchCall: call,
    generatedAt: utcLabel(now),
    lastReport: view.rows.length
      ? ageLabel(Math.max(...view.rows.map((row) => row.timeMs ?? 0)), now)
      : undefined,
    status: 'Preview · live reception not connected',
    statusKind: 'empty',
    note: 'This development preview does not receive live reports yet. Who I hear requires reception reports uploaded by your receiving software. Reports are observations, not confirmed contacts or a coverage boundary.',
    locationLabel: origin
      ? `Map origin ${origin.label}`
      : 'Set an operation location or map origin grid.',
    presentation: {
      source: 'PSK Reporter',
      stationLabel: incoming ? 'Transmitter' : 'Receiver',
      cwSpeed: false,
      details: [
        'Feed planned: PSK Reporter via the MQTT service operated by M0LTE. SNR is measured at the receiver.',
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

export function createPskPanel(): PanelHook {
  const stateFor = createPanelStateStore()
  return {
    async getPanels() {
      return [
        {
          key: 'psk-reporter',
          title: 'PSK Reporter · Preview',
          icon: 'radar',
          description:
            'Development preview of reception maps. Live reception is not connected yet.',
          on: ['operation'],
          multiple: true,
          form: configFields,
        },
      ]
    },
    async render(args) {
      if (!args.environment || !args.instanceId)
        return {
          kind: 'markdown',
          content: 'PSK Reporter preview requires a Ham2K build with native SVG panels.',
        }
      const state = stateFor(args, String(args.config.receptionDirection ?? 'outgoing'))
      const config = readConfig(args.config)
      const rendered = renderReceptionScene(
        pskPanelModel(args, [], args.clock?.realNowMillis ?? Date.now()),
        args.environment,
        { ...state.selection, view: config.view, band: config.band },
      )
      state.selection = rendered.selection
      return { kind: 'svgScene', title: 'PSK Reporter · Preview', scene: rendered.scene }
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
