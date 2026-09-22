import type { PanelEnvironment, SvgScene, SvgSceneLayer } from '@ham2k/extension-sdk'
import { describe, expect, it } from 'vitest'
import type { SceneSelection } from '../../src/ui/scene.ts'
import { renderRbnScene, sortedSceneReports } from '../../src/ui/scene.ts'
import type { UiModel, UiReport } from '../../src/ui/types.ts'

function environment(width = 1366, height = 900, scale = 1): PanelEnvironment {
  const role = (fontSize: number) => ({
    fontFamily: 'Host font',
    fontFamilyFallback: [],
    fontSize,
    scaledFontSize: fontSize * scale,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
  })
  return {
    version: 1,
    width,
    height,
    safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
    brightness: 'light',
    colors: {
      surface: '#ffffff',
      surfaceContainer: '#f1f5f7',
      onSurface: '#172832',
      onSurfaceVariant: '#526876',
      accent: '#086f63',
      primary: '#086f63',
      onPrimary: '#ffffff',
      secondary: '#226688',
      outline: '#cbd8df',
      outlineVariant: '#cbd8df',
      error: '#990000',
      onError: '#ffffff',
    },
    typography: {
      label: role(13),
      body: role(15),
      title: role(20),
      display: role(32),
      mono: role(14),
    },
    locale: 'en-US',
    textDirection: 'ltr',
    devicePixelRatio: 1,
    reducedMotion: false,
    highContrast: false,
  }
}

const rows: UiReport[] = Array.from({ length: 24 }, (_, index) => ({
  receiver: `K${index % 10}RX${String(index).padStart(2, '0')}`,
  country: index === 23 ? undefined : 'United States',
  band: index % 2 ? '40m' : '20m',
  mode: 'CW',
  frequencyKhz: index % 2 ? 7033 : 14055.5,
  snrDb: index === 23 ? undefined : index,
  wpm: 20 + (index % 10),
  age: `${index + 1} min ago`,
  timeMs: 100_000 - index * 1000,
  distanceKm: index === 23 ? undefined : index * 100,
  bearingDeg: index * 10,
}))

const model: UiModel = {
  title: 'My signal · TEST observation',
  watchCall: 'KG2GL',
  fetchedAt: '14:48:08 UTC',
  generatedAt: '14:48:08 UTC',
  lastReport: '1 min ago',
  status: 'Recent reports',
  statusKind: 'live',
  locationLabel: 'Map origin FN20VW · 40.938°, -74.208°',
  note: 'TEST OPERATION — observing KG2GL; these reports belong to that station. Last 30 minutes of CW, RTTY, FT8, and FT4 reports from the Reverse Beacon Network via Vail ReRBN. Checks at most once a minute while this panel is visible.',
  bands: ['all', '20m', '40m'],
  rows,
  mapOptions: {
    width: 520,
    height: 360,
    origin: { latitude: 40.9, longitude: -74.2, label: 'KG2GL' },
    receivers: rows.slice(0, 23).map((row, index) => ({
      key: row.receiver,
      label: row.receiver,
      latitude: 30 + index,
      longitude: -90 + index,
      ageMinutes: index,
    })),
    theme: {
      surface: '#ffffff',
      land: '#f1f5f7',
      text: '#172832',
      muted: '#526876',
      border: '#cbd8df',
      accent: '#086f63',
    },
  },
}

function text(scene: SvgScene): string {
  return scene.layers.flatMap((layer) => layer.text?.literal ?? []).join('\n')
}

function layer(scene: SvgScene, id: string): SvgSceneLayer {
  const found = scene.layers.find((item) => item.id === id)
  if (!found) throw new Error(`Missing scene layer ${id}`)
  return found
}

function assertSceneBounds(scene: SvgScene): void {
  expect(scene.layers.length).toBeLessThanOrEqual(128)
  expect(scene.controls?.length ?? 0).toBeLessThanOrEqual(64)
  const ids = scene.layers.map((layer) => layer.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const item of [...scene.layers, ...(scene.controls ?? [])]) {
    expect(item.x, `${item.id} x`).toBeGreaterThanOrEqual(0)
    expect(item.y, `${item.id} y`).toBeGreaterThanOrEqual(0)
    expect(item.width, `${item.id} width`).toBeGreaterThan(0)
    expect(item.height, `${item.id} height`).toBeGreaterThan(0)
    expect(item.x + item.width, `${item.id} right`).toBeLessThanOrEqual(scene.width + 0.01)
    expect(item.y + item.height, `${item.id} bottom`).toBeLessThanOrEqual(scene.height + 0.01)
  }
  for (const control of scene.controls ?? []) {
    expect(control.width).toBeGreaterThanOrEqual(44)
    expect(control.height).toBeGreaterThanOrEqual(44)
  }
  for (const layer of scene.layers) {
    expect(layer.svg ?? '').not.toMatch(
      /<text\b|<script\b|<foreignObject\b|<image\b|\bonclick\s*=/i,
    )
    expect(layer.svg?.length ?? 0).toBeLessThanOrEqual(262144)
    expect(layer.pulse).toBeUndefined()
    expect(layer.transitionMs).toBeUndefined()
  }
  expect(
    scene.layers.reduce((sum, layer) => sum + (layer.svg?.length ?? 0), 0),
  ).toBeLessThanOrEqual(1048576)
}

describe('RBN native scene', () => {
  it.each([390, 1366])('shows modes and CW-only WPM at width %i', (width) => {
    const source = {
      ...model,
      rows: ['CW', 'RTTY', 'FT8', 'FT4'].map((mode) => ({
        ...rows[0],
        mode,
        wpm: mode === 'CW' ? 25 : undefined,
      })),
    }
    const initial = renderRbnScene(source, environment(width, 900), { view: 'list' })
    let contents = ''
    for (let page = 0; page < initial.pageCount; page++) {
      const { scene } = renderRbnScene(source, environment(width, 900), { view: 'list', page })
      assertSceneBounds(scene)
      contents += text(scene)
      for (let index = 0; index < initial.pageSize; index++) {
        const row = source.rows[page * initial.pageSize + index]
        if (!row) break
        const measurement = layer(
          scene,
          width === 390 ? `row-${index}-frequency` : `row-${index}-speed`,
        ).text?.literal
        if (row.mode === 'CW') expect(measurement).toContain('25 wpm')
        else expect(measurement).not.toContain('wpm')
      }
    }
    for (const row of source.rows) expect(contents).toContain(row.mode)
    expect(contents).not.toContain('CW reports')
  })

  it('renders a map beside a receiver table at desktop sizes with native readable text', () => {
    const { scene, pageSize } = renderRbnScene(model, environment())
    const map = layer(scene, 'reception-map-0')
    const row = layer(scene, 'row-0-background')
    expect(map.x + map.width).toBeLessThan(row.x)
    expect(scene.layers.some((layer) => layer.id === 'column-0')).toBe(true)
    expect(pageSize).toBeLessThanOrEqual(7)
    expect(text(scene)).toContain('TEST · Recent reports')
    expect(text(scene)).toContain('Checked 14:48:08 UTC · Heard 1 min ago')
    expect(text(scene)).toContain('RBN via Vail')
    expect(scene.layers.find((layer) => layer.id === 'status')?.text?.fontFamily).toBe('Host font')
    assertSceneBounds(scene)
  })

  it.each([320, 390])('uses phone cards and paginates every report at %ipx', (width) => {
    const initial = renderRbnScene(model, environment(width, 844), { view: 'list', sort: 'age' })
    expect(initial.scene.layers.some((layer) => layer.id === 'column-0')).toBe(false)
    expect(initial.scene.layers.some((layer) => layer.id === 'row-0-call')).toBe(true)
    expect(initial.pageSize).toBeGreaterThan(0)
    expect(initial.pageSize).toBeLessThanOrEqual(4)
    const calls: string[] = []
    for (let page = 0; page < initial.pageCount; page++) {
      const result = renderRbnScene(model, environment(width, 844), {
        view: 'list',
        sort: 'age',
        page,
      })
      calls.push(
        ...result.scene.layers
          .filter((layer) => /^row-\d+-call$/.test(layer.id))
          .flatMap((layer) => layer.text?.literal ?? []),
      )
      assertSceneBounds(result.scene)
    }
    expect(calls).toEqual(rows.map((row) => row.receiver))
    expect(initial.scene.controls?.find((control) => control.id === 'next')?.event).toBe(
      'page:next',
    )
    expect(initial.scene.controls?.some((control) => control.id === 'previous')).toBe(false)
    const end = renderRbnScene(model, environment(width, 844), { view: 'list', page: 999 })
    expect(end.selection.page).toBe(end.pageCount - 1)
    expect(end.scene.controls?.some((control) => control.id === 'next')).toBe(false)
  })

  it('filters both map and list to the selected band and shows an empty configured band', () => {
    const selected = renderRbnScene(model, environment(), { band: '40m' })
    expect(selected.totalRows).toBe(12)
    expect(text(selected.scene)).toContain('12 receivers · 1 band')
    const empty = renderRbnScene(model, environment(390, 844), { view: 'list', band: '10m' })
    expect(empty.totalRows).toBe(0)
    expect(text(empty.scene)).toContain('No 10m reports in this time window.')
    expect(text(empty.scene)).toContain('10m · 0 receivers')
  })

  it('uses the selected band’s report age for receiver marker freshness', () => {
    if (!model.mapOptions) throw new Error('Missing fixture map options')
    const source = {
      ...model,
      rows: [
        { ...rows[0], band: '20m', ageMinutes: 0 },
        { ...rows[0], band: '40m', ageMinutes: 30 },
      ],
      mapOptions: {
        ...model.mapOptions,
        receivers: [{ ...model.mapOptions.receivers[0], ageMinutes: 0 }],
      },
    }
    const fresh = renderRbnScene(source, environment(390, 844), { view: 'map', band: '20m' })
    const old = renderRbnScene(source, environment(390, 844), { view: 'map', band: '40m' })
    const geometry = (scene: SvgScene) =>
      scene.layers
        .filter((layer) => layer.id.startsWith('reception-map-'))
        .map((layer) => layer.svg)
        .join('')
    const markerOpacity = (scene: SvgScene) =>
      Number(geometry(scene).match(/<circle[^>]+r="4\.5"[^>]+fill-opacity="([\d.]+)"/)?.[1])
    expect(markerOpacity(fresh.scene)).toBe(1)
    expect(markerOpacity(old.scene)).toBeCloseTo(1 / 3, 2)
  })

  it.each([
    [1100, 500],
    [390, 844],
    [600, 350],
  ])(
    'gives the map the panel height after a compact header and footer at %ix%i',
    (width, height) => {
      const { scene } = renderRbnScene(model, environment(width, height), { view: 'map' })
      const map = layer(scene, 'reception-map-0')
      expect(map.height).toBeGreaterThanOrEqual(height - 100)
      expect(scene.controls?.map((control) => control.id)).toEqual(['details'])
      expect(layer(scene, 'summary').y + layer(scene, 'summary').height).toBeLessThan(map.y)
      expect(map.y + map.height).toBeLessThan(layer(scene, 'source').y)
      assertSceneBounds(scene)
    },
  )

  it('stays within native host payload limits with 500 globally distributed receivers', () => {
    if (!model.mapOptions) throw new Error('Missing fixture map options')
    const reports = Array.from({ length: 500 }, (_, index) => ({
      ...rows[index % rows.length],
      receiver: `K${index}RX`,
    }))
    const source = {
      ...model,
      rows: reports,
      mapOptions: {
        ...model.mapOptions,
        receivers: reports.map((row, index) => ({
          key: row.receiver,
          label: row.receiver,
          ageMinutes: 0,
          latitude: -80 + (index % 160),
          longitude: -179 + ((index * 17) % 358),
        })),
      },
    }
    const { scene, pageCount } = renderRbnScene(source, environment())
    expect(pageCount).toBeGreaterThan(60)
    expect(scene.layers.filter((layer) => layer.id.startsWith('reception-map-'))).toHaveLength(3)
    assertSceneBounds(scene)
  })

  it('makes controls explicit host events, without HTML or local animation bindings', () => {
    const { scene } = renderRbnScene(model, environment())
    expect(scene.controls?.some((control) => ['view', 'band'].includes(control.id))).toBe(false)
    expect(scene.controls?.find((control) => control.id === 'sort')?.menu).toContainEqual({
      label: 'SNR',
      event: 'sort:snr',
    })
    expect(scene.controls?.find((control) => control.id === 'direction')?.event).toBe(
      'direction:toggle',
    )
    expect(scene.controls?.find((control) => control.id === 'details')?.event).toBe(
      'details:toggle',
    )
    expect(scene.values).toEqual({})
  })

  it('shows all provenance and warning text in paginated details on a phone', () => {
    const warning =
      'The Vail ReRBN response reached its 500-report limit; additional reports may be missing.'
    const source = { ...model, warnings: [warning] }
    const first = renderRbnScene(source, environment(320, 580), { details: true })
    const details: string[] = []
    for (let page = 0; page < first.pageCount; page++) {
      const result = renderRbnScene(source, environment(320, 580), { details: true, page })
      details.push(text(result.scene))
      assertSceneBounds(result.scene)
    }
    const displayed = details.join(' ').replace(/\s+/g, ' ')
    expect(displayed).toContain(
      'The Vail ReRBN response reached its 500-report limit; additional reports may be missing.',
    )
    expect(displayed).toContain('these reports belong to that station.')
    expect(displayed).toContain('No map tiles are downloaded.')
    expect(displayed).toContain(model.locationLabel)
    expect(displayed).toContain('Data checked: 14:48:08 UTC. Last report: 1 min ago.')
    expect(displayed).toContain('2,200 km max')
    expect(first.scene.controls?.find((control) => control.id === 'details')?.label).toBe(
      'Close report details',
    )
  })

  it('reserves OS scaled text space once and ignores device pixel ratio', () => {
    const normal = renderRbnScene(model, environment(390, 740), { view: 'list' })
    const scaledEnvironment = environment(390, 740, 1.6)
    const scaled = renderRbnScene(model, scaledEnvironment, { view: 'list' })
    expect(scaled.pageSize).toBeLessThan(normal.pageSize)
    expect(scaled.scene.layers.find((layer) => layer.id === 'status')?.text?.size).toBe(13)
    expect(scaled.scene.layers.find((layer) => layer.id === 'status')?.height).toBeGreaterThan(
      layer(normal.scene, 'status').height,
    )
    expect(
      renderRbnScene(model, { ...scaledEnvironment, devicePixelRatio: 3 }, { view: 'list' }),
    ).toEqual(scaled)
    assertSceneBounds(scaled.scene)
  })

  it('keeps a complete receiver card when combining the map and list in a narrow native pane', () => {
    for (const height of [642, 662, 682, 742]) {
      const host = environment(477, height)
      host.typography.label.fontSize = 12
      host.typography.label.scaledFontSize = 12
      const { scene } = renderRbnScene(model, host, { view: 'both' })
      const row = layer(scene, 'row-0-background')
      const lastLine = layer(scene, 'row-0-distance')
      const pager = layer(scene, 'page-count')
      expect(lastLine.y + lastLine.height).toBeLessThanOrEqual(row.y + row.height)
      expect(row.y + row.height).toBeLessThan(pager.y)
      expect(text(scene)).not.toContain('Enlarge this panel to display receiver reports.')
      if (!scene.layers.some((item) => item.id.startsWith('reception-map-'))) {
        expect(text(scene)).toContain('Choose Map in panel settings for a larger map.')
      }
      assertSceneBounds(scene)
    }
  })

  it('caps tall details pages below the native layer limit without losing later warnings', () => {
    const source = {
      ...model,
      warnings: Array.from(
        { length: 240 },
        (_, index) => `Warning ${index}: receiver information is approximate.`,
      ),
    }
    const first = renderRbnScene(source, environment(477, 8192), { details: true })
    expect(first.pageSize).toBe(100)
    expect(first.pageCount).toBeGreaterThan(1)
    const shown: string[] = []
    for (let page = 0; page < first.pageCount; page++) {
      const { scene } = renderRbnScene(source, environment(477, 8192), { details: true, page })
      shown.push(text(scene))
      assertSceneBounds(scene)
    }
    expect(shown.join(' ').replace(/\s+/g, ' ')).toContain(
      'Warning 239: receiver information is approximate.',
    )
  })

  it.each([
    [320, 250, 1],
    [320, 740, 1],
    [390, 844, 1],
    [1366, 900, 1],
    [1920, 1200, 1],
    [390, 844, 1.6],
    [1366, 900, 2],
    [100, 80, 1],
  ])(
    'bounds scene, touch targets, and payload at %ix%i with text scale %i',
    (width, height, scale) => {
      for (const view of ['both', 'map', 'list'] as SceneSelection['view'][]) {
        const result = renderRbnScene(model, environment(width, height, scale), { view })
        assertSceneBounds(result.scene)
      }
    },
  )

  it('respects safe insets and applies host theme colors to the map and native text', () => {
    const host = environment(390, 844)
    host.safeInsets = { left: 12, right: 8, top: 28, bottom: 24 }
    host.brightness = 'dark'
    host.colors.surface = '#101923'
    host.colors.onSurface = '#edf4f6'
    const { scene } = renderRbnScene(model, host, { view: 'map' })
    expect(scene.layers.find((layer) => layer.id === 'status')?.y).toBeGreaterThanOrEqual(28)
    expect(scene.layers.find((layer) => layer.id === 'status')?.text?.color).toBe('#086f63')
    expect(scene.layers.find((layer) => layer.id === 'surface')?.svg).toContain('#101923')
    assertSceneBounds(scene)
  })
})

describe('receiver sorting', () => {
  const reports: UiReport[] = [
    {
      receiver: 'Z1RX',
      band: '20m',
      mode: 'CW',
      age: '2 min ago',
      timeMs: 1000,
      snrDb: 0,
      distanceKm: 200,
      frequencyKhz: 14000,
      wpm: 30,
    },
    {
      receiver: 'A1RX',
      band: '40m',
      mode: 'CW',
      age: '1 min ago',
      timeMs: 2000,
      snrDb: 5,
      distanceKm: 100,
      frequencyKhz: 7000,
      wpm: 20,
    },
    { receiver: 'M1RX', band: '20m', mode: 'FT8', age: 'unknown', snrDb: Number.NaN },
  ]
  it('sorts all fields in both directions, preserving zero and keeping missing readings last', () => {
    const calls = (sort: SceneSelection['sort'], direction: SceneSelection['direction']) =>
      sortedSceneReports(reports, sort, direction).map((row) => row.receiver)
    expect(calls('age', 'desc')).toEqual(['A1RX', 'Z1RX', 'M1RX'])
    expect(calls('age', 'asc')).toEqual(['Z1RX', 'A1RX', 'M1RX'])
    expect(calls('snr', 'desc')).toEqual(['A1RX', 'Z1RX', 'M1RX'])
    expect(calls('snr', 'asc')).toEqual(['Z1RX', 'A1RX', 'M1RX'])
    expect(calls('distance', 'desc')).toEqual(['Z1RX', 'A1RX', 'M1RX'])
    expect(calls('frequency', 'asc')).toEqual(['A1RX', 'Z1RX', 'M1RX'])
    expect(calls('wpm', 'desc')).toEqual(['Z1RX', 'A1RX', 'M1RX'])
    expect(calls('call', 'asc')).toEqual(['A1RX', 'M1RX', 'Z1RX'])
    expect(calls('call', 'desc')).toEqual(['Z1RX', 'M1RX', 'A1RX'])
  })
})
