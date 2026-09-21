import boundaries from './admin1-boundaries.json'
import labels from './geographic-labels.json'

/** Country labels are candidates; the map renderer controls density and collisions. */
export interface GeographicLabel {
  key: string
  label: string
  latitude: number
  longitude: number
  kind: 'country'
  /** Natural Earth label rank; smaller values take priority. */
  rank: number
}

/** Each line can be drawn separately to respect the host's SVG string limit. */
export const admin1Boundaries = boundaries as {
  type: 'MultiLineString'
  coordinates: [number, number][][]
}

export const geographicLabels = labels as GeographicLabel[]
