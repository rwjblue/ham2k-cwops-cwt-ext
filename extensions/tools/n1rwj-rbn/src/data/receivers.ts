import type { DataFileDefinition } from '@ham2k/extension-sdk'
import { normalizeCall, type RbnReport } from '../model.ts'
import { isValidReceiver, receiverLocation, record } from './parser.ts'

export const receiverDirectoryUrl = 'https://www.reversebeacon.net/cont_includes/status.php?t=skt'
const maxNodes = 10_000
const invalidDirectory = 'Invalid RBN receiver directory. Previous data retained.'

interface Receiver {
  call: string
  grid: string | null
  country: string | null
}

interface ReceiverSnapshot {
  schema: 1
  nodes: Receiver[]
}

// This adapter reads RBN's table fragment, not arbitrary HTML. No DOM exists
// in the sandbox. Decode text only after removing tags, never execute markup.
function text(html: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? whole
      const code =
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10)
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedGrid(value: unknown): string | null {
  return receiverLocation(value)[0] === null ? null : String(value).trim().toUpperCase()
}

export function parseReceiverDirectory(body: string): Receiver[] {
  if (body.length > 10_000_000) throw new Error(invalidDirectory)
  const nodes = new Map<string, Receiver>()
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((cell) => cell[1])
    if (!cells.length) continue
    // Verify the known column structure so a changed table cannot silently
    // replace good locations with unrelated values.
    if (cells.length !== 9 || !/title=["']show spots sent from this skimmer["']/i.test(cells[0]))
      throw new Error(invalidDirectory)
    const call = normalizeCall(text(cells[0]))
    if (!isValidReceiver(call)) throw new Error(invalidDirectory)
    const countryTitle = cells[3].match(/title=["']([^"']*?) - show spots from this dxcc["']/i)
    const country = countryTitle ? text(countryTitle[1]) : null
    if (country && country.length > 100) throw new Error(invalidDirectory)
    const node = { call, grid: normalizedGrid(text(cells[2])), country: country || null }
    const previous = nodes.get(call)
    if (previous && (previous.grid !== node.grid || previous.country !== node.country))
      throw new Error(invalidDirectory)
    nodes.set(call, node)
    if (nodes.size > maxNodes) throw new Error(invalidDirectory)
  }
  if (!nodes.size || ![...nodes.values()].some((node) => node.grid))
    throw new Error(invalidDirectory)
  return [...nodes.values()]
}

function readSnapshot(raw: unknown): ReceiverSnapshot {
  const snapshot = record(raw)
  if (
    snapshot?.schema !== 1 ||
    !Array.isArray(snapshot.nodes) ||
    !snapshot.nodes.length ||
    snapshot.nodes.length > maxNodes
  )
    throw new Error(invalidDirectory)
  const nodes: Receiver[] = snapshot.nodes.map((value: unknown) => {
    const node = record(value)
    if (
      !node ||
      typeof node.call !== 'string' ||
      !isValidReceiver(node.call) ||
      (node.grid !== null &&
        (typeof node.grid !== 'string' || normalizedGrid(node.grid) !== node.grid)) ||
      (node.country !== null &&
        (typeof node.country !== 'string' || !node.country.trim() || node.country.length > 100))
    )
      throw new Error(invalidDirectory)
    return {
      call: node.call,
      grid: node.grid as string | null,
      country: node.country as string | null,
    }
  })
  if (
    new Set(nodes.map((node) => node.call)).size !== nodes.length ||
    !nodes.some((node) => node.grid)
  )
    throw new Error(invalidDirectory)
  return { schema: 1, nodes }
}

export function createReceiverData() {
  let current = new Map<string, Receiver>()
  const dataFile = {
    key: 'n1rwj-rbn_receivers',
    name: 'RBN receiver directory',
    description:
      'Receiver grids and countries from the Reverse Beacon Network. Refreshes when older than seven days.',
    category: 'n1rwj-rbn',
    url: receiverDirectoryUrl,
    fetchType: 'raw',
    maxAgeInDays: 7,
    async rawToJSONData({ body }) {
      const downloaded = parseReceiverDirectory(body)
      // Retain receivers absent from this response (they may just be offline).
      // Fresh entries go last so only the oldest absent entries hit the bound.
      const merged = new Map(current)
      for (const node of downloaded) {
        merged.delete(node.call)
        merged.set(node.call, node)
      }
      return { schema: 1, nodes: [...merged.values()].slice(-maxNodes) } satisfies ReceiverSnapshot
    },
    onLoadRawData(raw: unknown) {
      const snapshot = readSnapshot(raw)
      current = new Map(snapshot.nodes.map((node) => [node.call, node]))
    },
    async onRemoveRawData() {
      current = new Map()
    },
  } satisfies DataFileDefinition
  function enrichReports(reports: readonly RbnReport[]): RbnReport[] {
    return reports.map((report) => {
      const node = current.get(report.receiver)
      if (!node) return report
      const [latitude, longitude] = receiverLocation(node.grid)
      return {
        ...report,
        receiverLatitude: latitude ?? report.receiverLatitude,
        receiverLongitude: longitude ?? report.receiverLongitude,
        country: node.country ?? report.country,
      }
    })
  }
  return { dataFile, enrichReports, lookup: (call: string) => current.get(call) }
}
