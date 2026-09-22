import type { PanelContent, PanelEnvironment, PanelRenderArgs } from '@ham2k/extension-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { RbnSnapshot } from '../src/model.ts'
import { createRbnPanel, panelModel } from '../src/panel.ts'

const typography = {
  fontFamily: null,
  fontFamilyFallback: [],
  fontSize: 14,
  scaledFontSize: 14,
  fontWeight: 400,
  lineHeight: 1.3,
  letterSpacing: 0,
}
const environment: PanelEnvironment = {
  version: 1,
  width: 1200,
  height: 800,
  safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
  brightness: 'light',
  colors: {
    surface: '#ffffff',
    surfaceContainer: '#f3f6f8',
    onSurface: '#172832',
    onSurfaceVariant: '#526876',
    accent: '#086f63',
    primary: '#086f63',
    onPrimary: '#ffffff',
    secondary: '#086f63',
    outline: '#cbd8df',
    outlineVariant: '#cbd8df',
    error: '#ba1a1a',
    onError: '#ffffff',
  },
  typography: {
    body: typography,
    label: typography,
    title: { ...typography, fontSize: 20, scaledFontSize: 20 },
    display: typography,
    mono: typography,
  },
  locale: 'en',
  textDirection: 'ltr',
  devicePixelRatio: 2,
  reducedMotion: true,
  highContrast: false,
}
const now = Date.UTC(2026, 8, 21, 14)
const args: PanelRenderArgs = {
  panelKey: 'my-signal',
  instanceId: 'test-panel',
  environment,
  operation: { stationCall: 'K8BTU/TEST', grid: 'EM99dq' },
  qsoCount: 0,
  reason: 'tick:30',
  config: { watchCall: 'K8BTU' },
}
const snapshot: RbnSnapshot = {
  call: 'K8BTU',
  windowMinutes: 15,
  status: 'ready',
  lastAttemptMs: now,
  lastSuccessMs: now,
  error: null,
  capped: false,
  reports: [
    {
      id: '1',
      call: 'K8BTU',
      receiver: 'W1NT',
      frequencyKhz: 7034,
      band: '40m',
      mode: 'CW',
      snrDb: 0,
      wpm: 20,
      timeMs: now - 60_000,
      receiverLatitude: 43,
      receiverLongitude: -71,
      country: 'United States',
    },
    {
      id: '2',
      call: 'K8BTU',
      receiver: 'UNKNOWN',
      frequencyKhz: 7034,
      band: '40m',
      mode: 'CW',
      snrDb: null,
      wpm: null,
      timeMs: now - 120_000,
      receiverLatitude: null,
      receiverLongitude: null,
      country: null,
    },
  ],
}

function sceneText(content: PanelContent): string {
  if (content.kind !== 'svgScene') throw new Error('Expected native scene')
  return content.scene.layers.map((layer) => layer.text?.literal ?? '').join('\n')
}
function setup(current = snapshot) {
  const getSnapshot = vi.fn().mockResolvedValue(current)
  return {
    getSnapshot,
    panel: createRbnPanel({ client: { getSnapshot }, now: () => now, settings: async () => ({}) }),
  }
}
function event(controlId: string, action: string, extra: Partial<PanelRenderArgs> = {}) {
  return {
    ...args,
    ...extra,
    event: { controlId, action, phase: 'activate' as const, sequence: 1 },
  }
}

describe('RBN native panel integration', () => {
  it('registers the stable panel identity and bounded refresh triggers', async () => {
    const { panel } = setup()
    expect((await panel.getPanels({}, { online: true }))[0]).toMatchObject({
      key: 'my-signal',
      multiple: true,
      on: ['operation', 'tick:30'],
    })
  })
  it('explains older-host incompatibility before any network or settings work', async () => {
    const { panel, getSnapshot } = setup()
    for (const extra of [{ environment: undefined }, { instanceId: undefined }]) {
      const result = await panel.render({ ...args, ...extra }, { online: true })
      expect(result.kind).toBe('markdown')
      expect('content' in result && result.content).toContain('SVG scene support')
    }
    expect(getSnapshot).not.toHaveBeenCalled()
  })
  it('uses the real clock for networking and stale report ages', async () => {
    const { panel, getSnapshot } = setup({ ...snapshot, status: 'stale', error: 'Offline.' })
    const result = await panel.render(
      { ...args, clock: { nowMillis: now - 604800000, realNowMillis: now + 60000 } },
      { online: false },
    )
    expect(getSnapshot).toHaveBeenCalledWith(
      { call: 'K8BTU', windowMinutes: 15 },
      { online: false, realNowMillis: now + 60000 },
    )
    expect(sceneText(result)).toContain('2 min')
    expect(sceneText(result)).toContain('Cached')
  })
  it('keeps unknown receiver measurements and zero SNR; derives location only from exact coordinates', () => {
    const model = panelModel(args, snapshot, now)
    expect(model.rows[0]).toMatchObject({ receiver: 'W1NT', snrDb: 0, age: '1 min ago' })
    expect(model.rows[0].distanceKm).toBeGreaterThan(800)
    expect(model.rows[1].distanceKm).toBeUndefined()
    expect(model.note).toContain('TEST OPERATION — observing K8BTU')
    expect(model.fetchedAt).toBe('14:00:00 UTC')
    expect(model.mapOptions?.receivers).toHaveLength(1)
    expect(model.bands).toEqual([
      'all',
      '160m',
      '80m',
      '60m',
      '40m',
      '30m',
      '20m',
      '17m',
      '15m',
      '12m',
      '10m',
      '6m',
    ])
    expect(model.mapOptions?.origin?.label).toBe('K8BTU')
  })
  it('passes every supported mode to the list while mapping a receiver only once', () => {
    const reports = ['CW', 'RTTY', 'FT8', 'FT4'].map((mode, index) => ({
      ...snapshot.reports[0],
      id: String(index),
      mode,
      wpm: mode === 'CW' ? 20 : null,
    }))
    const model = panelModel(args, { ...snapshot, reports }, now)
    expect(model.rows.map((row) => row.mode)).toEqual(reports.map((report) => report.mode))
    expect(model.rows.map((row) => row.wpm)).toEqual([20, undefined, undefined, undefined])
    expect(model.mapOptions?.receivers).toHaveLength(1)
    expect(model.note).toContain('CW, RTTY, FT8, and FT4 reports')
    expect(model.note).toContain('Reverse Beacon Network via Vail ReRBN')
    expect(model.note).toContain('HamDB registered grids')
  })
  it('handles Home with no operation, keeps explicit overrides, and exposes error provenance', async () => {
    const home = { ...args, operation: undefined } as unknown as PanelRenderArgs
    const model = panelModel(
      home,
      { ...snapshot, status: 'stale', error: 'RBN request failed (503).', capped: true },
      now,
    )
    expect(model.mapOptions?.origin).toBeUndefined()
    expect(model.rows[0].distanceKm).toBeUndefined()
    expect(model.warnings?.join(' ')).toContain('503')
    expect(model.warnings?.join(' ')).toContain('500-report limit')
    const { panel, getSnapshot } = setup()
    expect((await panel.render(home, { online: true })).kind).toBe('svgScene')
    expect(getSnapshot).toHaveBeenCalledWith({ call: 'K8BTU', windowMinutes: 15 }, { online: true })
    await panel.render({ ...home, config: {} }, { online: true })
    expect(getSnapshot).toHaveBeenLastCalledWith({ call: '', windowMinutes: 15 }, { online: true })
  })
  it('applies saved view and band together and keeps them across refreshes per placement', async () => {
    const { panel } = setup()
    const initial = await panel.render(args, { online: true })
    expect(sceneText(initial)).toContain('W1NT')
    const changed = {
      ...args,
      config: { ...args.config, view: 'map', band: '15m' },
      reason: 'config',
    }
    const filtered = await panel.render(changed, { online: true })
    expect(sceneText(filtered)).toContain('15m · 0 receivers')
    expect(sceneText(filtered)).not.toContain('W1NT')
    expect(sceneText(filtered)).not.toContain('Sort:')
    expect(await panel.render({ ...changed, reason: 'tick:30' }, { online: true })).toEqual(
      filtered,
    )
    expect(
      sceneText(await panel.render({ ...args, instanceId: 'other' }, { online: true })),
    ).toContain('W1NT')
    const list = await panel.render(
      { ...changed, config: { ...changed.config, view: 'list' } },
      { online: true },
    )
    expect(sceneText(list)).toContain('No 15m reports in this time window.')
    expect(sceneText(list)).toContain('Sort:')
    // Saved preferences are also authoritative after an extension restart.
    expect(await setup().panel.render(changed, { online: true })).toEqual(filtered)
  })
  it.each<PanelRenderArgs['config']>([
    { windowMinutes: 30 },
    { projection: 'azimuthal' },
    { grid: 'FN31' },
    { watchCall: 'N1RWJ' },
    { view: 'list', band: '40m' },
  ])('preserves sort choices after saving %j', async (config) => {
    const { panel } = setup()
    await panel.render(args, { online: true })
    for (const [control, action] of [
      ['sort', 'sort:call'],
      ['direction', 'direction:toggle'],
    ])
      await panel.onEvent?.(event(control, action), { online: true })
    const result = sceneText(
      await panel.render(
        { ...args, config: { ...args.config, ...config }, reason: 'config' },
        { online: true },
      ),
    )
    expect(result).toContain('Sort: Receiver ▾')
    expect(result).toContain('↑')
  })
  it('applies changed sort defaults without clearing the saved view or band', async () => {
    const { panel } = setup()
    const configured = { ...args, config: { ...args.config, view: 'list', band: '40m' } }
    await panel.render(configured, { online: true })
    await panel.onEvent?.(event('sort', 'sort:call', configured), { online: true })
    const result = sceneText(
      await panel.render(
        { ...configured, config: { ...configured.config, sort: 'snr', direction: 'asc' } },
        { online: true },
      ),
    )
    expect(result).toContain('40m · 2 receivers')
    expect(result).toContain('Sort: SNR ▾')
    expect(result).toContain('↑')
  })
  it('resets session sort choices when switching operations', async () => {
    const { panel } = setup()
    await panel.render(args, { online: true })
    await panel.onEvent?.(event('sort', 'sort:call'), { online: true })
    const result = sceneText(
      await panel.render(
        { ...args, operation: { ...args.operation, uuid: 'another-operation' } },
        { online: true },
      ),
    )
    expect(result).toContain('Sort: Heard ▾')
  })
  it.each([snapshot, { ...snapshot, status: 'empty' as const, reports: [] }])(
    'offers view and all supported bands through the host settings form ($status)',
    async (current) => {
      const { panel } = setup(current)
      const result = await panel.render(args, { online: true })
      if (result.kind !== 'svgScene') throw new Error('Expected native scene')
      expect(result.scene.controls?.some((control) => ['view', 'band'].includes(control.id))).toBe(
        false,
      )
      const fields = (await panel.getPanels({}, { online: true }))[0].form
      for (const [key, label, values] of [
        ['view', 'View', ['both', 'map', 'list']],
        [
          'band',
          'Band',
          ['all', '160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m'],
        ],
      ] as const) {
        const field = fields?.find((field) => field.type === 'field' && field.key === key)
        if (field?.type !== 'field' || !Array.isArray(field.options))
          throw new Error('Expected settings options')
        expect(field.label).toBe(label)
        expect(field.options.map((option) => option.value)).toEqual(values)
      }
    },
  )
  it('validates action/control pairs and ignores malformed or non-activation events', async () => {
    const { panel, getSnapshot } = setup()
    const initial = await panel.render(args, { online: true })
    for (const [controlId, action] of [
      ['sort', 'band:20m'],
      ['band', 'band:bogus'],
      ['band', 'band:20m'],
      ['view', 'view:map'],
      ['view', 'view:list:extra'],
      ['unknown', 'view:list'],
    ]) {
      await panel.onEvent?.(event(controlId, action), { online: true })
    }
    await panel.onEvent?.(
      {
        ...event('band', 'band:20m'),
        event: { ...event('band', 'band:20m').event, phase: 'change' },
      },
      { online: true },
    )
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(await panel.render(args, { online: true })).toEqual(initial)
  })
  it('sorts both ways through native actions and exposes full test/error details', async () => {
    const { panel } = setup({
      ...snapshot,
      status: 'stale',
      error: 'RBN request failed (503).',
      capped: true,
    })
    const listArgs = { ...args, config: { ...args.config, view: 'list' } }
    await panel.render(listArgs, { online: true })
    await panel.onEvent?.(event('sort', 'sort:call', listArgs), { online: true })
    const descending = sceneText(await panel.render(listArgs, { online: true }))
    expect(descending.indexOf('W1NT')).toBeLessThan(descending.indexOf('UNKNOWN'))
    await panel.onEvent?.(event('direction', 'direction:toggle', listArgs), { online: true })
    const ascending = sceneText(await panel.render(listArgs, { online: true }))
    expect(ascending.indexOf('UNKNOWN')).toBeLessThan(ascending.indexOf('W1NT'))
    await panel.onEvent?.(event('details', 'details:toggle', listArgs), { online: true })
    const details = sceneText(await panel.render(listArgs, { online: true }))
    expect(details).toContain('503')
    expect(details).toContain('TEST')
    expect(details).toContain('500-report')
  })
  it('keeps successful cached scenes stable and unavailable reports aging', async () => {
    let time = now
    let current = snapshot
    const panel = createRbnPanel({
      client: { getSnapshot: async () => current },
      now: () => time,
      settings: async () => ({}),
    })
    const initial = await panel.render(args, { online: true })
    time += 30000
    expect(await panel.render(args, { online: true })).toEqual(initial)
    current = { ...snapshot, status: 'stale', error: 'Offline.' }
    time = now + 60000
    const stale = await panel.render(args, { online: true })
    time += 60000
    expect(await panel.render(args, { online: true })).not.toEqual(stale)
  })
})
