import { isCallsign, normalizeCall } from './callsign.ts'
import type { N1mmDocument, N1mmRow, ParseIssue } from './types.ts'

const DEFAULT_ORDER = [
  'call',
  'name',
  'loc1',
  'loc2',
  'sect',
  'state',
  'ck',
  'birthdate',
  'exch1',
  'misc',
  'power',
  'cqzone',
  'ituzone',
  'usertext',
  'lastupdatenote',
]
const KNOWN_COLUMNS = new Set(DEFAULT_ORDER)

function separatorFor(line: string): ',' | ';' {
  let quoted = false
  for (const character of line) {
    if (character === '"') quoted = !quoted
    if (!quoted && (character === ',' || character === ';')) return character
  }
  return ','
}

/** One physical record per line; CSV quoting and doubled quotes are supported. */
function splitFields(line: string, delimiter: string): string[] | undefined {
  const fields: string[] = []
  let value = ''
  let quoted = false
  let closedQuote = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index] ?? ''
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          value += '"'
          index++
        } else {
          quoted = false
          closedQuote = true
        }
      } else value += character
    } else if (character === delimiter) {
      fields.push(value.trim())
      value = ''
      closedQuote = false
    } else if (character === '"' && value.trim() === '' && !closedQuote) {
      value = ''
      quoted = true
    } else if (closedQuote && character.trim() !== '') {
      return undefined
    } else {
      value += character
    }
  }
  if (quoted) return undefined
  fields.push(value.trim())
  return fields
}

function calendarDate(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

function contestComment(comment: string): string | undefined {
  const tag = comment.toUpperCase().trim()
  // Recognize the contest families used in N1MM files, without interpreting
  // arbitrary one-word prose comments as a contest association.
  if (
    /^(?:CWT|CWOPS|CWOPEN|CWO|MST|ICWC-MST|SST|K1USNSST|K1USN-SST|NAQP(?:CW|SSB|RTTY)?|NS(?:LADDER|RTTY)?|ARRL[A-Z\d-]*|CQ[A-Z\d-]*|[A-Z]{2}QP|QSOPARTY(?: [A-Z]{2})?)$/.test(
      tag,
    )
  ) {
    return tag
  }
  return undefined
}

/**
 * Parse the common N1MM call-history format without assigning exchange semantics. Fatal issues make the entire
 * result unusable so a refresh cannot replace a valid offline cache.
 */
export function parseN1mm(text: string): N1mmDocument {
  const rows: N1mmRow[] = []
  const seen = new Set<string>()
  const issues: ParseIssue[] = []
  const associations: string[] = []
  let sourceUpdatedAt: string | undefined
  let order = [...DEFAULT_ORDER]
  let delimiter: ',' | ';' | undefined
  const addIssue = (
    line: number,
    severity: ParseIssue['severity'],
    code: ParseIssue['code'],
    message: string,
  ) => {
    issues.push({ line, severity, code, message })
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n|\r/)
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1
    const line = (lines[index] ?? '').trim()
    if (!line) continue
    if (line.startsWith('#')) {
      const comment = line.slice(1).trim()
      const association = contestComment(comment)
      if (association && !associations.includes(association)) associations.push(association)
      const updated = /^(?:\d+\s*-\s*)?Last\s*Edit\s*[,;]\s*(\d{4}-\d{2}-\d{2})$/i.exec(comment)
      if (updated?.[1]) sourceUpdatedAt = calendarDate(updated[1])
      continue
    }
    if (line.startsWith('!!')) {
      if (!/^!!Order!!(?:\s*[,;]|\s*$)/i.test(line)) {
        addIssue(
          lineNumber,
          'error',
          'unsupported-directive',
          `Unsupported N1MM directive: ${line.split(/[,;]/)[0] ?? line}`,
        )
        continue
      }
      delimiter = separatorFor(line)
      const columns = splitFields(line, delimiter)
        ?.slice(1)
        .map((column) => column.toLowerCase())
      if (
        !columns?.includes('call') ||
        ['call', 'name', 'exch1'].some(
          (column) => columns.filter((value) => value === column).length > 1,
        )
      ) {
        addIssue(
          lineNumber,
          'error',
          'invalid-order',
          'Order must identify exactly one Call column and may not duplicate Name or Exch1.',
        )
        continue
      }
      order = columns
      const unknown = columns.filter((column) => column && !KNOWN_COLUMNS.has(column))
      if (unknown.length)
        addIssue(
          lineNumber,
          'warning',
          'unknown-column',
          `Ignored unsupported columns: ${unknown.join(', ')}`,
        )
      continue
    }

    delimiter ??= separatorFor(line)
    const fields = splitFields(line, delimiter)
    const callIndex = order.indexOf('call')
    const call = normalizeCall(fields?.[callIndex] ?? '')
    if (!fields || !isCallsign(call)) {
      addIssue(lineNumber, 'warning', 'invalid-row', 'Skipped malformed row or invalid callsign.')
      continue
    }
    if (fields.length > order.length && fields.slice(order.length).some(Boolean)) {
      addIssue(lineNumber, 'warning', 'extra-columns', 'Ignored data beyond the declared columns.')
    }
    if (seen.has(call))
      addIssue(
        lineNumber,
        'warning',
        'duplicate-call',
        `Duplicate ${call}; later nonblank fields take precedence.`,
      )
    seen.add(call)
    const named: Record<string, string> = Object.create(null) as Record<string, string>
    for (let fieldIndex = 0; fieldIndex < order.length; fieldIndex++) {
      const column = order[fieldIndex]
      if (column && KNOWN_COLUMNS.has(column)) named[column] = fields[fieldIndex] ?? ''
    }
    rows.push({ line: lineNumber, call, fields: named })
  }

  if (!rows.length) addIssue(0, 'error', 'empty-file', 'No valid callsign records found.')
  return {
    rows,
    issues,
    associations,
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    usable: !issues.some((issue) => issue.severity === 'error'),
  }
}
