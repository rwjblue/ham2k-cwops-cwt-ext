import type {
  PanelEnvironment,
  PanelTypography,
  SvgScene,
  SvgSceneControl,
  SvgSceneLayer,
} from '@ham2k/extension-sdk'
import { layoutReceptionMap } from '../map/index.ts'
import { receptionMapTheme } from '../map/theme.ts'
import type { UiDirection, UiModel, UiReport, UiSort, UiView } from './types.ts'

export interface SceneSelection {
  view: UiView
  band: string
  sort: UiSort
  direction: UiDirection
  /** Zero based; clamped whenever the data or available space changes. */
  page: number
  details?: boolean
}

export interface SceneResult {
  scene: SvgScene
  selection: SceneSelection
  pageCount: number
  pageSize: number
  totalRows: number
}

const allSorts: Array<{ key: UiSort; label: string }> = [
  { key: 'age', label: 'Heard' },
  { key: 'call', label: 'Receiver' },
  { key: 'snr', label: 'SNR' },
  { key: 'distance', label: 'Distance' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'wpm', label: 'CW speed' },
]

const finite = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const number = (value: number | undefined, digits = 0): string =>
  finite(value) ? value.toFixed(digits) : '—'

/** Missing readings stay last in either direction; ties never reorder randomly. */
export function sortedSceneReports(
  reports: readonly UiReport[],
  sort: UiSort,
  direction: UiDirection,
): UiReport[] {
  const value = (row: UiReport): string | number | undefined => {
    if (sort === 'call') return row.call.toUpperCase()
    if (sort === 'age') return row.timeMs
    if (sort === 'snr') return row.snrDb
    if (sort === 'distance') return row.distanceKm
    if (sort === 'frequency') return row.frequencyKhz
    return row.wpm
  }
  return [...reports].sort((a, b) => {
    const av = value(a)
    const bv = value(b)
    const missingA = av === undefined || (typeof av === 'number' && !finite(av))
    const missingB = bv === undefined || (typeof bv === 'number' && !finite(bv))
    if (missingA !== missingB) return missingA ? 1 : -1
    if (!missingA && !missingB) {
      const order = av < bv ? -1 : av > bv ? 1 : 0
      if (order) return direction === 'asc' ? order : -order
    }
    return a.call.localeCompare(b.call) || a.band.localeCompare(b.band)
  })
}

function fallbackRole(fontSize: number): PanelTypography {
  return {
    fontFamily: null,
    fontFamilyFallback: [],
    fontSize,
    scaledFontSize: fontSize,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
  }
}

function color(value: string | undefined, fallback: string): string {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback
}

function size(value: number | undefined, fallback: number): number {
  return finite(value) ? Math.max(1, Math.min(8192, value)) : fallback
}

/** Pure, bounded scene generation. Only the selected map and visible page are built. */
export function renderReceptionScene(
  model: UiModel,
  environment?: PanelEnvironment,
  requested: Partial<SceneSelection> = {},
): SceneResult {
  const source = model.presentation?.source ?? 'Reception'
  const stationLabel = model.presentation?.stationLabel ?? 'Station'
  const station = stationLabel.toLowerCase()
  const sorts = allSorts
    .filter((sort) => sort.key !== 'wpm' || model.presentation?.cwSpeed !== false)
    .map((sort) => (sort.key === 'call' ? { ...sort, label: stationLabel } : sort))
  const width = size(environment?.width, 640)
  const height = size(environment?.height, 640)
  const inset = (value: number | undefined): number => (finite(value) ? Math.max(0, value) : 0)
  const left = Math.min(width, inset(environment?.safeInsets.left)) + 12
  const top = Math.min(height, inset(environment?.safeInsets.top)) + 8
  const right = Math.max(left, width - inset(environment?.safeInsets.right) - 12)
  const bottom = Math.max(top, height - inset(environment?.safeInsets.bottom) - 8)
  const w = right - left
  const dark = environment?.brightness === 'dark' || model.theme?.brightness === 'dark'
  const raw = environment?.colors ?? model.theme
  const colors = {
    surface: color(raw?.surface, dark ? '#101923' : '#ffffff'),
    card: color(raw?.surfaceContainer, dark ? '#1d2b37' : '#f1f5f7'),
    text: color(raw?.onSurface, dark ? '#edf4f6' : '#172832'),
    muted: color(raw?.onSurfaceVariant, dark ? '#b4c5cd' : '#526876'),
    accent: color(raw?.accent, dark ? '#72ded0' : '#086f63'),
    border: color(raw?.outline, dark ? '#48606a' : '#cbd8df'),
  }
  const label = environment?.typography.label ?? fallbackRole(13)
  const body = environment?.typography.body ?? fallbackRole(15)
  const line = (role: PanelTypography): number =>
    Math.ceil(role.scaledFontSize * role.lineHeight + 4)
  const labelLine = line(label)
  const bodyLine = line(body)
  const buttonHeight = Math.max(44, labelLine + 16)
  const layers: SvgSceneLayer[] = []
  const controls: SvgSceneControl[] = []
  const scene: SvgScene = { version: 1, width, height, values: {}, layers, controls }
  const selection: SceneSelection = {
    view: requested.view ?? model.defaultView ?? 'both',
    band: requested.band ?? model.defaultBand ?? 'all',
    sort: requested.sort ?? model.defaultSort ?? 'age',
    direction: requested.direction ?? model.defaultDirection ?? 'desc',
    page: finite(requested.page) ? Math.max(0, Math.floor(requested.page)) : 0,
    details: requested.details === true,
  }
  const rows = sortedSceneReports(
    model.rows.filter((row) => selection.band === 'all' || row.band === selection.band),
    selection.sort,
    selection.direction,
  )
  const result: SceneResult = {
    scene,
    selection,
    pageCount: 1,
    pageSize: 1,
    totalRows: rows.length,
  }

  function art(id: string, x: number, y: number, sw: number, sh: number, markup: string): void {
    if (sw < 1 || sh < 1) return
    layers.push({
      id,
      x,
      y,
      width: sw,
      height: sh,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}">${markup}</svg>`,
    })
  }
  function text(
    id: string,
    literal: string,
    x: number,
    y: number,
    tw: number,
    role = label,
    ink = colors.text,
    align: 'start' | 'center' | 'end' = 'start',
    weight = role.fontWeight,
  ): void {
    if (tw < 1 || y + line(role) > bottom + 0.1) return
    layers.push({
      id,
      x,
      y,
      width: tw,
      height: line(role),
      text: {
        literal,
        size: role.fontSize,
        fontFamily: role.fontFamily ?? undefined,
        fontWeight: weight,
        lineHeight: role.lineHeight,
        letterSpacing: role.letterSpacing,
        color: ink,
        align,
      },
    })
  }
  function button(
    id: string,
    caption: string,
    x: number,
    y: number,
    bw: number,
    options: { event?: string; menu?: SvgSceneControl['menu']; label?: string } = {},
  ): void {
    if (bw < 44 || y + buttonHeight > bottom) return
    art(
      `${id}-background`,
      x,
      y,
      bw,
      buttonHeight,
      `<rect x=".5" y=".5" width="${bw - 1}" height="${buttonHeight - 1}" rx="8" fill="${colors.card}" stroke="${colors.border}"/>`,
    )
    text(
      `${id}-label`,
      caption,
      x + 8,
      y + (buttonHeight - labelLine) / 2,
      bw - 16,
      label,
      colors.text,
      'center',
    )
    // Inactive pagination ends are labels, not focusable controls that do nothing.
    if (options.event || options.menu?.length)
      controls.push({
        id,
        label: options.label ?? caption,
        kind: 'button',
        x,
        y,
        width: bw,
        height: buttonHeight,
        ...(options.event ? { event: options.event } : {}),
        ...(options.menu ? { menu: options.menu } : {}),
      })
  }

  art(
    'surface',
    0,
    0,
    width,
    height,
    `<rect width="${width}" height="${height}" fill="${colors.surface}"/>`,
  )
  if (w < 180 || bottom - top < labelLine * 2 + buttonHeight + 20) {
    text('small-panel', `Enlarge this panel to see ${source} reports.`, left, top, w)
    return result
  }

  let y = top
  const testObservation = /\bTEST\b/.test(model.title)
  const receivers = new Set(rows.map((row) => row.call)).size
  const bands = new Set(rows.map((row) => row.band)).size
  const farthest = Math.max(
    0,
    ...rows.flatMap((row) => (finite(row.distanceKm) ? [row.distanceKm] : [])),
  )
  const bandLabel = selection.band === 'all' ? 'All bands' : selection.band
  const summary = `${receivers} ${station}${receivers === 1 ? '' : 's'} · ${bands} band${bands === 1 ? '' : 's'}${farthest ? ` · ${Math.round(farthest).toLocaleString('en-US')} km max` : ''}`
  // The host tab already names the watched call. Keep status and the active
  // filter beside refresh/details instead of spending a row on a title.
  text(
    'status',
    `${testObservation ? 'TEST · ' : ''}${model.status ?? `${stationLabel} reports`}`,
    left,
    y,
    w - 112,
    label,
    colors.accent,
  )
  text(
    'summary',
    w >= 600 * (label.scaledFontSize / label.fontSize)
      ? `${bandLabel} · ${summary}`
      : `${bandLabel} · ${receivers} ${station}${receivers === 1 ? '' : 's'}`,
    left,
    y + labelLine,
    w - 112,
  )
  if (model.presentation?.refreshLabel)
    button('refresh', '↻', right - 104, y, 48, {
      event: 'refresh:reports',
      label: model.presentation.refreshLabel,
    })
  button(
    'details',
    selection.details ? '×' : model.warnings?.length ? '!' : 'ⓘ',
    right - 48,
    y,
    48,
    {
      event: 'details:toggle',
      label: selection.details
        ? 'Close report details'
        : `Report details, provenance${model.warnings?.length ? ` and ${model.warnings.length} warnings` : ''}`,
    },
  )
  y += Math.max(labelLine * 2, buttonHeight) + 6

  if (selection.details) {
    const paragraphs = [
      `${model.watchCall} · ${bandLabel} · ${summary}`,
      ...(model.warnings ?? []),
      model.note,
      model.locationLabel,
      `Data checked: ${model.fetchedAt ?? 'never'}. Last report: ${model.lastReport ?? 'none'}. Report ages as of ${model.generatedAt ?? 'unknown'}.`,
      ...(model.presentation?.details ?? []),
      'Map geography: Natural Earth. Station locations are approximate. No map tiles are downloaded.',
    ].filter((paragraph): paragraph is string => Boolean(paragraph))
    const characters = Math.max(12, Math.floor(w / (body.scaledFontSize * 0.58)))
    const lines: string[] = []
    for (const paragraph of [...new Set(paragraphs)]) {
      let current = ''
      for (const word of paragraph.split(/\s+/)) {
        if (current && current.length + word.length + 1 > characters) {
          lines.push(current)
          current = ''
        }
        current = current ? `${current} ${word}` : word
      }
      if (current) lines.push(current)
      lines.push('')
    }
    result.pageSize = Math.max(
      1,
      Math.min(100, Math.floor((bottom - y - buttonHeight - 8) / bodyLine)),
    )
    result.pageCount = Math.max(1, Math.ceil(lines.length / result.pageSize))
    selection.page = Math.min(selection.page, result.pageCount - 1)
    for (const [index, value] of lines
      .slice(selection.page * result.pageSize, (selection.page + 1) * result.pageSize)
      .entries())
      text(`detail-${index}`, value, left, y + index * bodyLine, w, body)
    const pagerY = bottom - buttonHeight
    button('previous', '‹', left, pagerY, 48, {
      event: selection.page > 0 ? 'page:previous' : undefined,
      label: 'Previous details page',
    })
    button('next', '›', right - 48, pagerY, 48, {
      event: selection.page + 1 < result.pageCount ? 'page:next' : undefined,
      label: 'Next details page',
    })
    text(
      'page-count',
      `Details ${selection.page + 1}/${result.pageCount}`,
      left + 56,
      pagerY + (buttonHeight - labelLine) / 2,
      w - 112,
      label,
      colors.muted,
      'center',
    )
    return result
  }

  // View and band are persisted by the host's panel tune form.
  const footerTop = Math.max(y, bottom - labelLine)
  const contentBottom = footerTop - 8
  const sideBySide = selection.view === 'both' && w >= 1080
  const listWidth = sideBySide ? Math.floor(w * 0.51) : w
  const listX = sideBySide ? right - listWidth : left
  let listY = y

  if (selection.view !== 'list') {
    const mapWidth = sideBySide ? w - listWidth - 16 : w
    const available = contentBottom - y
    // Leave room for the map/list gap, sort controls, one complete card, its
    // row gap, and pagination. Rounding the map down preserves that last row.
    const minimumList = buttonHeight * 2 + bodyLine + labelLine * 3 + 48
    const mapHeight =
      selection.view === 'both' && !sideBySide
        ? Math.floor(
            Math.min(Math.max(180, available * 0.42), Math.max(0, available - minimumList)),
          )
        : available
    if (mapHeight >= 180 && mapWidth >= 220 && model.mapOptions) {
      const calls = new Set(rows.map((row) => row.call))
      const receiverAges = new Map<string, number>()
      for (const row of rows) {
        if (finite(row.ageMinutes)) {
          receiverAges.set(
            row.call,
            Math.min(receiverAges.get(row.call) ?? Infinity, row.ageMinutes),
          )
        }
      }
      const textScale = label.scaledFontSize / label.fontSize
      const map = layoutReceptionMap({
        ...model.mapOptions,
        width: mapWidth,
        height: mapHeight,
        stations: model.mapOptions.stations
          .filter((receiver) => calls.has(receiver.key))
          .map((receiver) => {
            const ageMinutes = receiverAges.get(receiver.key)
            return ageMinutes === undefined ? receiver : { ...receiver, ageMinutes }
          }),
        labelScale: textScale,
        theme: receptionMapTheme(dark ? 'dark' : 'light', raw?.accent),
      })
      for (const [index, svg] of map.svgLayers.entries())
        layers.push({
          id: `reception-map-${index}`,
          x: left,
          y,
          width: map.width,
          height: map.height,
          svg,
        })
      for (const entry of map.labels) {
        layers.push({
          id: `map-${entry.key}`,
          x: left + entry.x,
          y: y + entry.y,
          width: entry.width,
          height: entry.height,
          text: {
            literal: entry.text,
            size: entry.size,
            fontFamily: label.fontFamily ?? undefined,
            fontWeight: entry.weight,
            lineHeight: label.lineHeight,
            color: entry.color,
            align: entry.align === 'left' ? 'start' : entry.align === 'right' ? 'end' : 'center',
          },
        })
      }
      if (!sideBySide) listY = y + map.height + 10
    } else if (selection.view === 'map') {
      text(
        'map-unavailable',
        mapHeight < 180
          ? 'Enlarge this panel to display the map.'
          : 'Set your operation location to show the map.',
        left,
        y,
        w,
        body,
      )
    } else if (!sideBySide) {
      text(
        'map-compact',
        'Choose Map in panel settings for a larger map.',
        left,
        y,
        w,
        label,
        colors.muted,
      )
      listY += labelLine + 8
    }
  }

  if (selection.view !== 'map') {
    if (contentBottom - listY < buttonHeight + labelLine + 8) {
      text('list-compact', 'Enlarge this panel to display reports.', listX, listY, listWidth)
      text(
        'source',
        `${source} · ${receivers} ${station}s · ${model.fetchedAt ?? model.status ?? 'No recent reports'}`,
        left,
        footerTop,
        w,
        label,
        colors.muted,
      )
      return result
    }
    const sortLabel = sorts.find((sort) => sort.key === selection.sort)?.label ?? 'Heard'
    button('sort', `Sort: ${sortLabel} ▾`, listX, listY, listWidth - 56, {
      label: `Sort ${station} reports`,
      menu: sorts.map((sort) => ({ label: sort.label, event: `sort:${sort.key}` })),
    })
    button(
      'direction',
      selection.direction === 'desc' ? '↓' : '↑',
      listX + listWidth - 48,
      listY,
      48,
      {
        event: 'direction:toggle',
        label: `Sort ${selection.direction === 'desc' ? 'descending' : 'ascending'}; activate to reverse`,
      },
    )
    listY += buttonHeight + 8
    const table = listWidth >= Math.max(560, (560 * label.scaledFontSize) / label.fontSize)
    const rowHeight = table ? Math.max(44, labelLine * 2 + 8) : bodyLine + labelLine * 3 + 16
    const headingHeight = table ? labelLine + 6 : 0
    const capacity = Math.floor(
      (contentBottom - listY - headingHeight - buttonHeight - 8) / (rowHeight + 6),
    )
    result.pageSize = Math.max(1, Math.min(table ? (sideBySide ? 7 : 8) : 4, capacity))
    result.pageCount = Math.max(1, Math.ceil(rows.length / result.pageSize))
    selection.page = Math.min(selection.page, result.pageCount - 1)
    const page = rows.slice(
      selection.page * result.pageSize,
      (selection.page + 1) * result.pageSize,
    )
    const columns = [0, 0.25, 0.43, 0.53, 0.64, 0.84, 1]
    if (table && capacity > 0) {
      const labels = [stationLabel, 'Band / kHz', 'SNR', 'Mode', 'km / bearing', 'Heard']
      for (const [index, caption] of labels.entries()) {
        text(
          `column-${index}`,
          caption,
          listX + columns[index] * listWidth + 8,
          listY,
          (columns[index + 1] - columns[index]) * listWidth - 12,
          label,
          colors.muted,
        )
      }
      listY += headingHeight
    }
    const visible = capacity > 0 ? page : []
    for (const [index, row] of visible.entries()) {
      const ry = listY + index * (rowHeight + 6)
      art(
        `row-${index}-background`,
        listX,
        ry,
        listWidth,
        rowHeight,
        `<rect width="${listWidth}" height="${rowHeight}" rx="8" fill="${colors.card}"/>`,
      )
      const distance = finite(row.distanceKm)
        ? `${Math.round(row.distanceKm).toLocaleString('en-US')} km${finite(row.bearingDeg) ? ` · ${Math.round(row.bearingDeg)}°` : ''}`
        : 'Location unknown'
      if (table) {
        const fields = [
          row.call,
          row.band,
          `${number(row.snrDb)} dB`,
          row.mode,
          finite(row.distanceKm) ? `${Math.round(row.distanceKm).toLocaleString('en-US')} km` : '—',
          row.age,
        ]
        for (const [column, value] of fields.entries()) {
          text(
            `row-${index}-${column}`,
            value,
            listX + columns[column] * listWidth + 8,
            ry + 8,
            (columns[column + 1] - columns[column]) * listWidth - 12,
            label,
            column === 2 ? colors.accent : colors.text,
            'start',
            column === 0 ? 600 : label.fontWeight,
          )
        }
        text(
          `row-${index}-country`,
          row.country ?? 'Country unknown',
          listX + 8,
          ry + 8 + labelLine,
          listWidth * 0.25 - 16,
          label,
          colors.muted,
        )
        text(
          `row-${index}-frequency`,
          number(row.frequencyKhz, 1),
          listX + listWidth * 0.25 + 8,
          ry + 8 + labelLine,
          listWidth * 0.18 - 12,
          label,
          colors.muted,
        )
        text(
          `row-${index}-speed`,
          row.mode === 'CW' && finite(row.wpm) ? `${number(row.wpm)} wpm` : '',
          listX + listWidth * 0.53 + 8,
          ry + 8 + labelLine,
          listWidth * 0.11 - 12,
          label,
          colors.muted,
        )
        text(
          `row-${index}-bearing`,
          finite(row.bearingDeg) ? `${Math.round(row.bearingDeg)}°` : 'Location unknown',
          listX + listWidth * 0.64 + 8,
          ry + 8 + labelLine,
          listWidth * 0.2 - 12,
          label,
          colors.muted,
        )
      } else {
        text(
          `row-${index}-call`,
          row.call,
          listX + 10,
          ry + 8,
          listWidth - 110,
          body,
          colors.text,
          'start',
          600,
        )
        text(
          `row-${index}-snr`,
          `${number(row.snrDb)} dB`,
          listX + listWidth - 100,
          ry + 8,
          90,
          body,
          colors.accent,
          'end',
          600,
        )
        text(
          `row-${index}-country`,
          `${row.country ?? 'Country unknown'} · ${row.age}`,
          listX + 10,
          ry + 8 + bodyLine,
          listWidth - 20,
          label,
          colors.muted,
        )
        text(
          `row-${index}-frequency`,
          `${row.band} · ${row.mode} · ${number(row.frequencyKhz, 1)} kHz${row.mode === 'CW' && finite(row.wpm) ? ` · ${number(row.wpm)} wpm` : ''}`,
          listX + 10,
          ry + 8 + bodyLine + labelLine,
          listWidth - 20,
        )
        text(
          `row-${index}-distance`,
          distance,
          listX + 10,
          ry + 8 + bodyLine + labelLine * 2,
          listWidth - 20,
          label,
          colors.muted,
        )
      }
    }
    if (!rows.length)
      text(
        'empty-reports',
        selection.band === 'all'
          ? 'No reports in this time window.'
          : `No ${selection.band} reports in this time window.`,
        listX + 8,
        listY + 8,
        listWidth - 16,
        body,
      )
    else if (capacity < 1)
      text(
        'list-compact',
        `Enlarge this panel to display ${station} reports.`,
        listX,
        listY,
        listWidth,
      )
    const pagerY = contentBottom - buttonHeight
    if (capacity > 0 && rows.length) {
      button('previous', '‹', listX, pagerY, 48, {
        event: selection.page > 0 ? 'page:previous' : undefined,
        label: `Previous ${station} page`,
      })
      button('next', '›', listX + listWidth - 48, pagerY, 48, {
        event: selection.page + 1 < result.pageCount ? 'page:next' : undefined,
        label: `Next ${station} page`,
      })
      const first = selection.page * result.pageSize + 1
      const last = Math.min(rows.length, first + result.pageSize - 1)
      text(
        'page-count',
        `${first}–${last} of ${rows.length} · Page ${selection.page + 1}/${result.pageCount}`,
        listX + 56,
        pagerY + (buttonHeight - labelLine) / 2,
        listWidth - 112,
        label,
        colors.muted,
        'center',
      )
    }
  }

  text(
    'source',
    w >= 800 * (label.scaledFontSize / label.fontSize)
      ? `${source} · Checked ${model.fetchedAt ?? 'never'} · Heard ${model.lastReport ?? '—'} · Ages as of ${model.generatedAt ?? '—'}`
      : `${source} · ${model.generatedAt ?? model.fetchedAt ?? '—'}`,
    left,
    footerTop,
    w,
    label,
    colors.muted,
  )
  return result
}
