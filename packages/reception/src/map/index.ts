import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo'
import { geoAzimuthalEquidistant, geoDistance, geoGraticule10, geoPath } from 'd3-geo'
import earth from './earth-110m.json'
import { admin1Boundaries, geographicLabels } from './geography.ts'
import { annotationLabels, receiverLabels } from './labels.ts'
import type {
  MapLabel,
  MapLocation,
  MapMarker,
  MapStation,
  MapTheme,
  ReceptionMapLayout,
  ReceptionMapOptions,
} from './types.ts'

export type {
  MapLabel,
  MapLocation,
  MapMarker,
  MapStation,
  MapTheme,
  ReceptionMapLayout,
  ReceptionMapOptions,
} from './types.ts'

const earthRadiusKm = 6371.0088
const radiansToDegrees = 180 / Math.PI

const fallbackTheme: MapTheme = {
  surface: '#101d28',
  land: '#263a43',
  text: '#ecf3f3',
  muted: '#9aacb5',
  border: '#48606a',
  accent: '#72ded0',
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character]
  })
}

function format(value: number): string {
  return value.toFixed(2)
}

function safeSize(value: number, fallback: number, minimum: number): number {
  return Number.isFinite(value) ? Math.min(4096, Math.max(minimum, Math.round(value))) : fallback
}

function safeLabelScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(4, value)) : 1
}

function safeTheme(theme: MapTheme): MapTheme {
  const result = { ...fallbackTheme }
  for (const key of Object.keys(result) as (keyof MapTheme)[]) {
    if (/^#[\da-f]{6}$/i.test(theme[key])) result[key] = theme[key]
  }
  return result
}

export function isMapLocation(location: MapLocation | undefined): location is MapLocation {
  return Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      Math.abs(location.latitude) <= 90 &&
      Math.abs(location.longitude) <= 180,
  )
}

function coordinates(location: MapLocation): [number, number] {
  return [location.longitude, location.latitude]
}

function projected(projection: GeoProjection, location: MapLocation): [number, number] | undefined {
  const point = projection(coordinates(location))
  return point?.every(Number.isFinite) ? point : undefined
}

function freshOpacity(age: number): number {
  const minutes = Number.isFinite(age) ? Math.max(0, age) : 30
  return Math.max(0.32, 1 - minutes / 45)
}

function niceRadius(distanceKm: number): number {
  const steps = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000]
  return steps.find((step) => step >= distanceKm * 1.2) ?? 20000
}

function createProjection(
  origin: MapLocation,
  stations: readonly MapStation[],
  width: number,
  height: number,
  kind: 'regional' | 'azimuthal',
): GeoProjection {
  const projection = geoAzimuthalEquidistant()
    .rotate([-origin.longitude, -origin.latitude])
    .scale(1)
    .translate([0, 0])
    .clipAngle(179.99)
    .precision(0.6)

  const points = [origin, ...stations].flatMap((location) => {
    const point = projected(projection, location)
    return point ? [point] : []
  })
  const padding = Math.max(26, Math.min(44, width / 12))
  if (kind === 'azimuthal') {
    const farthest = stations.reduce(
      (distance, receiver) =>
        Math.max(distance, geoDistance(coordinates(origin), coordinates(receiver)) * earthRadiusKm),
      0,
    )
    const radius = niceRadius(farthest) / earthRadiusKm
    projection
      .scale(Math.min(width - padding * 2, height - padding * 2) / (radius * 2))
      .translate([width / 2, height / 2])
  } else {
    // A minimum extent prevents a single local skimmer from over-zooming the
    // 110m geography. Quantized bounds reduce drift when a receiver reappears.
    const minX = Math.floor(Math.min(...points.map((point) => point[0])) / 0.05) * 0.05
    const maxX = Math.ceil(Math.max(...points.map((point) => point[0])) / 0.05) * 0.05
    const minY = Math.floor(Math.min(...points.map((point) => point[1])) / 0.05) * 0.05
    const maxY = Math.ceil(Math.max(...points.map((point) => point[1])) / 0.05) * 0.05
    const extentX = Math.max(0.4, (maxX - minX) * 1.2)
    const extentY = Math.max(0.3, (maxY - minY) * 1.2)
    const scale = Math.min((width - padding * 2) / extentX, (height - padding * 2) / extentY)
    projection
      .scale(scale)
      .translate([
        width / 2 - ((minX + maxX) / 2) * scale,
        height / 2 - ((minY + maxY) / 2) * scale,
      ])
  }
  return projection.clipExtent([
    [1, 1],
    [width - 1, height - 1],
  ])
}

function mappedReceivers(origin: MapLocation, stations: readonly MapStation[]): MapStation[] {
  // The exact antipode has no unique bearing; leave it in the receiver list.
  return stations.filter(
    (receiver) =>
      isMapLocation(receiver) &&
      geoDistance(coordinates(origin), coordinates(receiver)) < Math.PI - 0.0002,
  )
}

function basemap(
  projection: GeoProjection,
  theme: MapTheme,
  width: number,
  height: number,
): string[] {
  const path = geoPath(projection).digits(1)
  // Separate country elements allow native layers to split between complete
  // shapes. A single compound world path cannot be split by the layer packer.
  const land = [
    ...earth.geometries.flatMap((geometry) => {
      const d = path(geometry as GeoPermissibleObjects)
      return d
        ? [
            `<path d="${d}" fill="${theme.land}" stroke="${theme.border}" stroke-width="0.8" stroke-linejoin="round"/>`,
          ]
        : []
    }),
  ]
  // Internal divisions add context at regional scales but overwhelm a world
  // view. Clip detailed boundary endpoints to the bundled coarse coastline.
  const regional = Math.max(width, height) / projection.scale() < 2.8
  const landPath = regional ? (path(earth as GeoPermissibleObjects) ?? '') : ''
  const divisions: string[] = []
  if (regional && landPath.length < 160000) {
    let boundaryPath = ''
    const flush = () => {
      if (!boundaryPath) return
      const id = `admin-land-${divisions.length}`
      divisions.push(
        `<defs><clipPath id="${id}"><path d="${landPath}"/></clipPath></defs><path d="${boundaryPath}" clip-path="url(#${id})" fill="none" stroke="${theme.border}" stroke-opacity="0.65" stroke-width="0.6" stroke-linejoin="round"/>`,
      )
      boundaryPath = ''
    }
    for (const coordinates of admin1Boundaries.coordinates) {
      const line = path({ type: 'LineString', coordinates })
      if (!line) continue
      if (boundaryPath.length + line.length > 48000) flush()
      boundaryPath += line
    }
    flush()
  }
  return [
    ...land,
    ...divisions,
    `<path d="${path(geoGraticule10()) ?? ''}" fill="none" stroke="${theme.border}" stroke-opacity="0.18" stroke-width="0.5"/>`,
  ]
}

function svgDocument(body: string, width: number, height: number, description: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(description)}"><title>${escapeXml(description)}</title>${body}</svg>`
}

/** Split only between complete elements; each native layer carries its own clip. */
function geometryLayers(
  groups: readonly string[][],
  width: number,
  height: number,
  description: string,
): string[] {
  const clip = `<defs><clipPath id="map-frame"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="9"/></clipPath></defs>`
  const result: string[] = []
  for (const group of groups) {
    let body = ''
    const flush = () => {
      if (!body) return
      result.push(
        svgDocument(
          `${clip}<g clip-path="url(#map-frame)">${body}</g>`,
          width,
          height,
          description,
        ),
      )
      body = ''
    }
    for (const element of group) {
      if (body.length + element.length > 240000) flush()
      body += element
    }
    flush()
  }
  return result
}

function labelBackings(labels: readonly MapLabel[], theme: MapTheme): string {
  return labels
    .filter((label) => label.key.startsWith('receiver-label:') || label.key === 'origin-label')
    .map(
      (label) =>
        `<rect x="${format(label.x)}" y="${format(label.y)}" width="${format(label.width)}" height="${format(label.height)}" rx="${label.key === 'origin-label' ? 6 : 4}" fill="${theme.land}" fill-opacity="0.94"${label.key === 'origin-label' ? ` stroke="${theme.text}" stroke-opacity="0.4" stroke-width="0.8"` : ''}/>`,
    )
    .join('')
}

function emptyMap(
  width: number,
  height: number,
  theme: MapTheme,
  count: number,
  labelScale: number,
): ReceptionMapLayout {
  const centerX = width / 2
  const centerY = height / 2 - 30
  const icon = `<g stroke="${theme.border}" fill="none" stroke-width="1.5"><circle cx="${centerX}" cy="${centerY}" r="25"/><ellipse cx="${centerX}" cy="${centerY}" rx="12" ry="25"/><path d="M${centerX - 25},${centerY}H${centerX + 25}M${centerX - 20},${centerY - 13}H${centerX + 20}M${centerX - 20},${centerY + 13}H${centerX + 20}"/></g>`
  const labels: MapLabel[] = [
    {
      key: 'empty-title',
      text: labelScale > 1.4 ? 'Set your location' : 'Set your operation location',
      x: 12,
      y: centerY + 39,
      width: width - 24,
      height: 24 * labelScale,
      size: width < 340 ? 15 : 17,
      color: theme.text,
      weight: 600,
      align: 'center',
    },
    {
      key: 'empty-hint',
      text: labelScale > 1.4 ? 'Use panel settings' : 'Map paths need your operating QTH.',
      x: 12,
      y: centerY + 42 + 24 * labelScale,
      width: width - 24,
      height: 20 * labelScale,
      size: 12,
      color: theme.muted,
      weight: 400,
      align: 'center',
    },
  ]
  if (labelScale > 2.5) labels.splice(1, 1)
  // Keep even the largest accessibility setting within a short panel.
  const overflow = Math.max(0, ...labels.map((label) => label.y + label.height - height + 8))
  for (const label of labels) label.y -= overflow
  const description = 'Reception map unavailable: set the operation location or a grid override.'
  const svg = svgDocument(
    `<rect width="${width}" height="${height}" rx="10" fill="${theme.surface}"/>${icon}`,
    width,
    height,
    description,
  )
  return {
    svg,
    svgLayers: [svg],
    labels,
    markers: [],
    width,
    height,
    state: 'no-origin',
    description,
    unmappedCount: count,
  }
}

/** Render geometry and collision-aware labels separately for native SVG scenes. */
export function layoutReceptionMap(options: ReceptionMapOptions): ReceptionMapLayout {
  const width = safeSize(options.width, 640, 220)
  const height = safeSize(options.height, 360, 180)
  const theme = safeTheme(options.theme)
  const labelScale = safeLabelScale(options.labelScale)
  const stationLabel = options.stationLabel ?? 'receiver'
  const origin = options.origin
  if (!isMapLocation(origin))
    return emptyMap(width, height, theme, options.stations.length, labelScale)

  const receivers = mappedReceivers(origin, options.stations)
  const plotHeight = Math.max(70, height - 15 - 16 * labelScale)
  const projection = createProjection(
    origin,
    receivers,
    width,
    plotHeight,
    options.projection ?? 'regional',
  )
  const path = geoPath(projection).digits(1)
  const originPoint = projected(projection, origin) ?? [width / 2, height / 2]
  const markers: MapMarker[] = receivers.flatMap((receiver) => {
    const point = projected(projection, receiver)
    return point
      ? [{ key: receiver.key, x: point[0], y: point[1], selected: Boolean(receiver.selected) }]
      : []
  })
  const labels: MapLabel[] = [
    {
      key: 'attribution',
      text:
        labelScale > 1.4
          ? 'Natural Earth'
          : width < 420
            ? 'Natural Earth · approximate locations'
            : `Natural Earth · ${stationLabel} locations approximate`,
      x: 10,
      y: height - 5 - 16 * labelScale,
      width: width - 20,
      height: 16 * labelScale,
      size: 11,
      color: theme.muted,
      weight: 400,
      align: 'right',
    },
  ]
  if (receivers.length === 0) {
    labels.push({
      key: 'no-receivers',
      text: labelScale > 1.4 ? 'No mapped reports' : `Waiting for ${stationLabel} reports`,
      x: 12,
      y: 12,
      width: width - 24,
      height: 24 * labelScale,
      size: 14,
      color: theme.text,
      weight: 600,
      align: 'center',
    })
  }
  const background: string[] = [
    `<rect width="${width}" height="${height}" rx="10" fill="${theme.surface}"/>`,
    ...basemap(projection, theme, width, height),
  ]
  const body: string[] = []
  const ringLabels: MapLabel[] = []

  const visibleRadiusKm = (Math.max(width, height) / projection.scale()) * earthRadiusKm
  const ringStep =
    visibleRadiusKm > 18000
      ? 5000
      : visibleRadiusKm > 8000
        ? 2000
        : visibleRadiusKm > 3500
          ? 1000
          : 500
  for (
    let distanceKm = ringStep;
    distanceKm < Math.min(20000, visibleRadiusKm);
    distanceKm += ringStep
  ) {
    const radius = (distanceKm / earthRadiusKm) * projection.scale()
    body.push(
      `<circle cx="${format(originPoint[0])}" cy="${format(originPoint[1])}" r="${format(radius)}" fill="none" stroke="${theme.muted}" stroke-opacity="0.2" stroke-width="0.7" stroke-dasharray="2 7"/>`,
    )
    const x = originPoint[0] + 6
    const y = originPoint[1] - radius - 10
    if (
      labelScale <= 1.4 &&
      x > 10 &&
      x + 80 * labelScale < width - 10 &&
      y > 12 &&
      y < height - 30
    ) {
      ringLabels.push({
        key: `ring:${distanceKm}`,
        text: `${distanceKm.toLocaleString('en-US')} km`,
        x,
        y,
        width: 80 * labelScale,
        height: 16 * labelScale,
        size: 11,
        color: theme.muted,
        weight: 400,
        align: 'left',
      })
    }
  }

  // Draw oldest paths first so fresh or selected reception is visually on top.
  const ordered = [...receivers].sort(
    (a, b) =>
      Number(Boolean(a.selected)) - Number(Boolean(b.selected)) || b.ageMinutes - a.ageMinutes,
  )
  for (const receiver of ordered) {
    const route = path({
      type: 'LineString',
      coordinates: [coordinates(origin), coordinates(receiver)],
    })
    if (route)
      body.push(
        `<path d="${route}" fill="none" stroke="${theme.accent}" stroke-opacity="${format(receiver.selected ? 1 : freshOpacity(receiver.ageMinutes) * 0.46)}" stroke-width="${receiver.selected ? 2.5 : 1.15}" stroke-linecap="round"/>`,
      )
  }

  for (const receiver of ordered) {
    const point = projected(projection, receiver)
    if (!point) continue
    const [x, y] = point.map(format)
    if (receiver.selected)
      body.push(
        `<circle cx="${x}" cy="${y}" r="10" fill="${theme.accent}" fill-opacity="0.15" stroke="${theme.accent}" stroke-width="1"/>`,
      )
    body.push(
      `<circle cx="${x}" cy="${y}" r="${receiver.selected ? 5 : 4.5}" fill="${theme.accent}" fill-opacity="${format(freshOpacity(receiver.ageMinutes))}" stroke="${theme.land}" stroke-width="1.8"/>`,
    )
  }
  const [originX, originY] = originPoint
  body.push(
    `<circle cx="${format(originX)}" cy="${format(originY)}" r="14" fill="${theme.land}" fill-opacity="0.85"/><path d="M${format(originX)},${format(originY - 8)}L${format(originX + 7)},${format(originY)}L${format(originX)},${format(originY + 8)}L${format(originX - 7)},${format(originY)}Z" fill="${theme.text}" stroke="${theme.land}" stroke-width="1.5"/><circle cx="${format(originX)}" cy="${format(originY)}" r="2" fill="${theme.land}"/>`,
  )
  const originText = (origin.label ?? 'Your station').slice(0, 20)
  const originWidth = Math.min(width - 32, originText.length * 7.8 * labelScale + 18)
  const originLabel: MapLabel = {
    key: 'origin-label',
    text: originText,
    x: Math.max(8, Math.min(width - originWidth - 8, originPoint[0] - originWidth / 2)),
    y: Math.min(height - 10 - 38 * labelScale, originPoint[1] + 17),
    width: originWidth,
    height: 22 * labelScale,
    size: 12,
    color: theme.text,
    weight: 700,
    align: 'center',
  }
  const mapMarkers = [...markers, { key: 'origin', x: originX, y: originY, selected: false }]
  if (receivers.length > 0 || labelScale <= 1.4) {
    const centeredX = Math.max(12, Math.min(width - originWidth - 12, originLabel.x))
    const candidates = [
      { ...originLabel, x: centeredX },
      { ...originLabel, x: centeredX, y: originY - originLabel.height - 17 },
      { ...originLabel, x: originX + 18, y: originY - originLabel.height / 2 },
      { ...originLabel, x: originX - originWidth - 18, y: originY - originLabel.height / 2 },
      { ...originLabel, x: 12, y: 12 },
      { ...originLabel, x: width - originWidth - 12, y: 12 },
    ]
    labels.push(...annotationLabels(candidates, mapMarkers, labels, width, height, 1))
  }
  labels.push(...receiverLabels(receivers, mapMarkers, width, height, theme, labels, labelScale))
  labels.push(...annotationLabels(ringLabels, mapMarkers, labels, width, height, 2))
  if (labelScale <= 1.4) {
    const countries: MapLabel[] = geographicLabels.flatMap((country) => {
      const point = projected(projection, country)
      if (!point) return []
      const text = country.label.toUpperCase()
      const labelWidth = text.length * 6.5 * labelScale + 8
      return [
        {
          key: `geography:${country.key}`,
          text,
          x: point[0] - labelWidth / 2,
          y: point[1] - 9 * labelScale,
          width: labelWidth,
          height: 18 * labelScale,
          size: 11,
          color: theme.muted,
          weight: 400,
          align: 'center' as const,
        },
      ]
    })
    labels.push(
      ...annotationLabels(countries, mapMarkers, labels, width, height, width < 520 ? 3 : 5),
    )
  }
  const overlay = [
    `<rect x="1" y="${format(plotHeight)}" width="${width - 2}" height="${format(height - plotHeight - 1)}" rx="9" fill="${theme.surface}"/>`,
    labelBackings(labels, theme),
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="none" stroke="${theme.border}" stroke-width="1"/>`,
  ]
  const description = `${originText} reception map: ${receivers.length} ${stationLabel}${receivers.length === 1 ? '' : 's'}. Diamond marks the station; circles mark ${stationLabel}s. Lines show reported reception, not a coverage boundary.`
  const svgLayers = geometryLayers([background, body], width, height, description)
  svgLayers.push(svgDocument(overlay.join(''), width, height, description))
  return {
    svg: svgDocument(
      svgLayers.map((svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')).join(''),
      width,
      height,
      description,
    ),
    svgLayers,
    labels,
    markers,
    width,
    height,
    state: receivers.length ? 'ready' : 'no-receivers',
    description,
    unmappedCount: options.stations.length - receivers.length,
  }
}

/** Standalone SVG, including text, for browser previews or static image export. */
export function renderReceptionMap(options: ReceptionMapOptions): string {
  const layout = layoutReceptionMap(options)
  const text = layout.labels
    .map((label) => {
      const anchor = label.align === 'center' ? 'middle' : label.align === 'right' ? 'end' : 'start'
      const x =
        label.x +
        (label.align === 'center' ? label.width / 2 : label.align === 'right' ? label.width : 0)
      return `<text x="${format(x)}" y="${format(label.y + label.height / 2 + label.size * 0.35)}" text-anchor="${anchor}" font-family="sans-serif" font-size="${label.size}" font-weight="${label.weight}" fill="${label.color}">${escapeXml(label.text)}</text>`
    })
    .join('')
  return layout.svg.replace('</svg>', `${text}</svg>`)
}

/** Public helper for callers building their receiver details or accessibility labels. */
export function mapDistanceKm(origin: MapLocation, receiver: MapLocation): number | undefined {
  return isMapLocation(origin) && isMapLocation(receiver)
    ? geoDistance(coordinates(origin), coordinates(receiver)) * earthRadiusKm
    : undefined
}

export function mapAngularDistanceDegrees(
  origin: MapLocation,
  receiver: MapLocation,
): number | undefined {
  const distance = mapDistanceKm(origin, receiver)
  return distance === undefined ? undefined : (distance / earthRadiusKm) * radiansToDegrees
}
