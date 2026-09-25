import { bandForExactFrequencyInMHz } from '@ham2k/lib-operation-data'
import type { ReceptionReport } from '../../../../../packages/reception/src/reports.ts'
import { parsePskPayload } from '../data/parser.ts'

export const historyLimit = 1000
const invalid = () => new Error('History unavailable: unsupported XML response.')

function unescapeXml(text: string): string {
  return text.replace(/&([^;]*);|&/g, (_match, entity: string | undefined) => {
    const named: Record<string, string> = Object.assign(Object.create(null), {
      amp: '&',
      quot: '"',
      apos: "'",
      lt: '<',
      gt: '>',
    })
    if (entity && named[entity] !== undefined) return named[entity]
    if (entity && /^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) {
      const code =
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1))
      if (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff))
        return String.fromCodePoint(code)
    }
    throw invalid()
  })
}

/** Bounded reader for the API's attribute-based XML. No DOM, DTDs or entities. */
export function parseHistoryXml(xml: string): {
  reports: ReceptionReport[]
  incomplete: boolean
} {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid()
  const tokens =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w:.-]*(?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>/g
  const stack: string[] = []
  const reports: ReceptionReport[] = []
  let root = ''
  let offset = 0
  let count = 0
  let skipped = false
  let tokenCount = 0
  for (const match of xml.matchAll(tokens)) {
    if (++tokenCount > 20_000) throw invalid()
    const text = xml.slice(offset, match.index)
    if (text.includes('<') || (!stack.length && text.trim())) throw invalid()
    unescapeXml(text)
    offset = match.index + match[0].length
    const tag = match[0]
    if (tag.startsWith('<!--') || tag.startsWith('<?')) continue
    const name = /^<\/?([\w:.-]+)/.exec(tag)?.[1] ?? ''
    if (tag.startsWith('</')) {
      if (!/^<\/[\w:.-]+\s*>$/.test(tag) || stack.pop() !== name) throw invalid()
      continue
    }
    if (!stack.length) {
      if (root || !['pskreporter', 'receptionReports'].includes(name)) throw invalid()
      root = name
    }
    if (/error/i.test(name)) throw new Error('History unavailable: PSK Reporter returned an error.')
    const attrs: Record<string, string> = Object.create(null)
    for (const attribute of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g)) {
      if (attrs[attribute[1]] !== undefined) throw invalid()
      attrs[attribute[1]] = unescapeXml(attribute[2] ?? attribute[3])
    }
    if (name === 'receptionReport') {
      if (++count > historyLimit) {
        skipped = true
      } else {
        const frequency = Number(attrs.frequency)
        const report = parsePskPayload(
          JSON.stringify({
            sc: attrs.senderCallsign,
            rc: attrs.receiverCallsign,
            sl: attrs.senderLocator,
            rl: attrs.receiverLocator,
            f: frequency,
            // Despite its name, the host's exact helper takes kHz.
            b: bandForExactFrequencyInMHz(frequency / 1000),
            md: attrs.mode || 'UNKNOWN',
            t: Number(attrs.flowStartSeconds),
            rp: attrs.sNR === undefined ? undefined : Number(attrs.sNR),
          }),
        )
        if (report) reports.push(report)
        else skipped = true
      }
    }
    if (!tag.endsWith('/>')) stack.push(name)
    if (stack.length > 16) throw invalid()
  }
  if (!root || stack.length || xml.slice(offset).trim()) throw invalid()
  return { reports, incomplete: skipped || count >= historyLimit }
}
