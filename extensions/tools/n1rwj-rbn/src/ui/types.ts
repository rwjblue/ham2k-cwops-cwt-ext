import type { ReceptionMapOptions } from '../map/types.ts'

/** Presentation data only: rendering performs no storage or network work. */
export interface UiReport {
  receiver: string
  country?: string
  band: string
  frequencyKhz?: number
  snrDb?: number
  wpm?: number
  age: string
  ageMinutes?: number
  timeMs?: number
  distanceKm?: number
  bearingDeg?: number
}

export type UiSort = 'age' | 'call' | 'snr' | 'distance' | 'frequency' | 'wpm'
export type UiDirection = 'asc' | 'desc'
export type UiView = 'both' | 'map' | 'list'

export interface UiModel {
  title: string
  watchCall: string
  generatedAt?: string
  fetchedAt?: string
  lastReport?: string
  status?: string
  statusKind?: 'live' | 'cached' | 'empty' | 'error'
  locationLabel?: string
  note?: string
  warnings?: string[]
  mapOptions?: ReceptionMapOptions
  bands?: string[]
  rows: UiReport[]
  defaultSort?: UiSort
  defaultDirection?: UiDirection
  defaultView?: UiView
  defaultBand?: string
  theme?: {
    brightness?: 'light' | 'dark'
    surface?: string
    surfaceContainer?: string
    onSurface?: string
    onSurfaceVariant?: string
    accent?: string
    outline?: string
  }
}
