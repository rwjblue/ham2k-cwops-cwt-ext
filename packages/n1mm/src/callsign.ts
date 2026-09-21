export function normalizeCall(call: string): string {
  return call.trim().toUpperCase()
}

export function isCallsign(call: string): boolean {
  return /^(?=.*[A-Z])(?=.*\d)[A-Z\d]+(?:\/[A-Z\d]+)*$/.test(call)
}

/**
 * Return only an unambiguous full call component. This handles prefixes and
 * /P, /M, /MM, /AM, /QRP and district suffixes without treating a DX prefix as
 * the operator's call. Two full calls (K1ABC/W2XYZ) have no safe fallback.
 */
export function baseCall(call: string): string {
  const normalized = normalizeCall(call)
  const parts = normalized.split('/')
  if (parts.length === 1) return normalized
  const candidates = parts.filter((part) => /^(?=.*[A-Z])[A-Z\d]*\d[A-Z]+$/.test(part))
  return candidates.length === 1 ? (candidates[0] ?? normalized) : normalized
}

export function callLookupKeys(call: string): string[] {
  const exact = normalizeCall(call)
  if (!isCallsign(exact)) return []
  const base = baseCall(exact)
  return exact === base ? [exact] : [exact, base]
}
