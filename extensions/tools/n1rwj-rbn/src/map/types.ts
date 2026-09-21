export interface MapLocation {
  latitude: number
  longitude: number
  label?: string
}

export interface MapReceiver extends MapLocation {
  key: string
  label: string
  ageMinutes: number
  selected?: boolean
}

export interface MapTheme {
  surface: string
  land: string
  text: string
  muted: string
  border: string
  accent: string
}

export interface ReceptionMapOptions {
  width: number
  height: number
  origin?: MapLocation
  receivers: readonly MapReceiver[]
  projection?: 'regional' | 'azimuthal'
  /** Native text scale used only to reserve label space; font sizes stay unscaled. */
  labelScale?: number
  theme: MapTheme
}

/** Coordinates are top-left anchors in the SVG viewBox, suitable for scene text. */
export interface MapLabel {
  key: string
  text: string
  x: number
  y: number
  width: number
  height: number
  size: number
  color: string
  weight: number
  align: 'left' | 'center' | 'right'
}

export interface MapMarker {
  key: string
  x: number
  y: number
  selected: boolean
}

export interface ReceptionMapLayout {
  /** Geometry only: host scenes should draw labels using native text layers. */
  svg: string
  /** Self-contained geometry layers, each below the native 256 KiB string limit. */
  svgLayers: string[]
  labels: MapLabel[]
  markers: MapMarker[]
  width: number
  height: number
  state: 'ready' | 'no-origin' | 'no-receivers'
  description: string
  unmappedCount: number
}
