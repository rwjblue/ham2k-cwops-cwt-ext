import type { MapLabel, MapMarker, MapStation, MapTheme } from './types.ts'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Annotation captions have lower priority than reception marks and callsigns. */
export function annotationLabels(
  candidates: readonly MapLabel[],
  markers: readonly MapMarker[],
  reserved: readonly Box[],
  width: number,
  height: number,
  limit: number,
): MapLabel[] {
  const occupied = [
    ...reserved,
    ...markers.map((marker) => ({ x: marker.x - 10, y: marker.y - 10, width: 20, height: 20 })),
  ]
  const labels: MapLabel[] = []
  for (const label of candidates) {
    if (labels.length >= limit) break
    const box = { x: label.x - 4, y: label.y - 3, width: label.width + 8, height: label.height + 6 }
    if (
      box.x < 8 ||
      box.y < 8 ||
      box.x + box.width > width - 8 ||
      box.y + box.height > height - 25 ||
      occupied.some((other) => overlaps(box, other))
    )
      continue
    labels.push(label)
    occupied.push(box)
  }
  return labels
}

/** Greedy placement favors selection and recent reports; labels never hide markers. */
export function receiverLabels(
  stations: readonly MapStation[],
  markers: readonly MapMarker[],
  width: number,
  height: number,
  theme: MapTheme,
  reserved: readonly Box[],
  labelScale = 1,
): MapLabel[] {
  const occupied: Box[] = [
    ...reserved,
    ...markers.map((marker) => ({ x: marker.x - 8, y: marker.y - 8, width: 16, height: 16 })),
  ]
  const positions = new Map(markers.map((marker) => [marker.key, marker]))
  const candidates = [...stations].sort(
    (a, b) =>
      Number(Boolean(b.selected)) - Number(Boolean(a.selected)) ||
      a.ageMinutes - b.ageMinutes ||
      a.key.localeCompare(b.key),
  )
  const result: MapLabel[] = []
  // Density changes gradually with available area, including narrow but tall
  // maps. A few pixels of resizing must not suddenly double the label count.
  const limit =
    labelScale > 1.4 ? 0 : Math.max(3, Math.min(10, Math.floor((width * height) / 28000)))
  for (const receiver of candidates) {
    if (result.length >= limit) break
    const marker = positions.get(receiver.key)
    if (!marker) continue
    const size = width < 360 ? 11 : 12
    const text = receiver.label.slice(0, 18)
    const labelWidth = text.length * size * 0.64 * labelScale + 10
    const labelHeight = 20 * labelScale
    const choices: Box[] = [
      { x: marker.x + 10, y: marker.y - 10, width: labelWidth, height: labelHeight },
      { x: marker.x - labelWidth - 10, y: marker.y - 10, width: labelWidth, height: labelHeight },
      { x: marker.x - labelWidth / 2, y: marker.y - 29, width: labelWidth, height: labelHeight },
      { x: marker.x - labelWidth / 2, y: marker.y + 10, width: labelWidth, height: labelHeight },
    ]
    const box = choices.find(
      (choice) =>
        choice.x >= 8 &&
        choice.y >= 8 &&
        choice.x + choice.width <= width - 8 &&
        choice.y + choice.height <= height - 25 &&
        !occupied.some((taken) => overlaps(choice, taken)),
    )
    if (!box) continue
    occupied.push({ x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 })
    result.push({
      ...box,
      key: `receiver-label:${receiver.key}`,
      text,
      size,
      color: receiver.selected ? theme.accent : theme.text,
      weight: receiver.selected ? 700 : 600,
      align: 'center',
    })
  }
  return result
}
