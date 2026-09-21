import type { MapLabel, MapMarker, MapReceiver, MapTheme } from './types.ts'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Greedy placement favors selection and recent reports; labels never hide markers. */
export function receiverLabels(
  receivers: readonly MapReceiver[],
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
  const candidates = [...receivers].sort(
    (a, b) =>
      Number(Boolean(b.selected)) - Number(Boolean(a.selected)) ||
      a.ageMinutes - b.ageMinutes ||
      a.key.localeCompare(b.key),
  )
  const result: MapLabel[] = []
  const limit = labelScale > 1.4 ? 0 : width < 420 ? 5 : 12
  for (const receiver of candidates) {
    if (result.length >= limit) break
    const marker = positions.get(receiver.key)
    if (!marker) continue
    const size = width < 420 ? 11 : 12
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
