import type { PanelRenderArgs } from '@ham2k/extension-sdk'
import { expect, it, vi } from 'vitest'
import { renderReceptionScene } from '../../../../packages/reception/src/ui/scene.ts'
import { environment } from '../../../../packages/reception/tests/environment.ts'
import { parsePskPayload } from '../src/data/parser.ts'
import { createLiveReception } from '../src/live.ts'
import { createPskPanel, pskPanelModel } from '../src/panel.ts'

const connection = { state: 'live' as const, message: '', capped: false }
const now = Date.UTC(2026, 8, 23, 18)
const args: PanelRenderArgs = {
  panelKey: 'psk-reporter',
  instanceId: 'one',
  environment: environment(),
  operation: { uuid: 'op', stationCall: 'N1RWJ', grid: 'FN42FK' },
  qsoCount: 0,
  reason: 'operation',
  config: {},
  clock: { nowMillis: now, realNowMillis: now },
}
const report = parsePskPayload(
  JSON.stringify({
    sc: 'N1RWJ',
    rc: 'CU3AT',
    sl: 'FN42FK',
    rl: 'HM68',
    md: 'FT8',
    b: '20m',
    f: 14074000,
    t: now / 1000,
    rp: -12,
  }),
)
if (!report) throw new Error('Invalid reception fixture')

it('uses the same renderer for both directions without RBN branding or invented CW speed', () => {
  for (const incoming of [false, true]) {
    const call = incoming ? 'CU3AT' : 'N1RWJ'
    const model = pskPanelModel(
      {
        ...args,
        operation: { ...args.operation, stationCall: call },
        config: { receptionDirection: incoming ? 'incoming' : 'outgoing' },
      },
      [report],
      now,
      connection,
    )
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({
      call: incoming ? 'N1RWJ' : 'CU3AT',
      frequencyKhz: 14074,
      snrDb: -12,
    })
    expect(model.mapOptions?.stations[0].key).toBe(model.rows[0].call)
    const { scene } = renderReceptionScene(model, environment())
    const text = scene.layers.map((layer) => layer.text?.literal ?? '').join('\n')
    expect(text).toContain(incoming ? 'Transmitter' : 'Receiver')
    expect(text).toContain('PSK Reporter')
    expect(text).not.toMatch(/RBN|Vail/)
    expect(JSON.stringify(scene.controls?.find((control) => control.id === 'refresh'))).toContain(
      'Force reload',
    )
    expect(JSON.stringify(scene.controls)).not.toContain('CW speed')
  }
})

it('keeps suffixes exact and filters stale or unrelated reports', () => {
  expect(
    pskPanelModel({ ...args, config: { watchCall: 'N1RWJ/P' } }, [report], now, connection).rows,
  ).toEqual([])
  expect(pskPanelModel(args, [report], now + 16 * 60_000, connection).rows).toEqual([])
  expect(pskPanelModel(args, [report], now - 120_000, connection).rows).toEqual([])
})

it('does not open a socket or fabricate reports while offline', async () => {
  const open = vi.fn(() => {
    throw new Error('Unexpected socket')
  })
  const hook = createPskPanel(createLiveReception(open))
  const panels = await hook.getPanels({}, { online: false })
  expect(panels[0].on).toEqual(['operation', 'tick:5'])
  const content = await hook.render(args, { online: false })
  expect(content.kind).toBe('svgScene')
  if (content.kind !== 'svgScene') throw new Error('Expected scene')
  const text = content.scene.layers.map((layer) => layer.text?.literal ?? '').join('\n')
  expect(text).toContain('Offline · reception paused')
  expect(open).not.toHaveBeenCalled()
  expect(text).not.toContain('CU3AT')
})
