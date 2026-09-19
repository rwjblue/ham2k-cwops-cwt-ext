import type { Membership } from './types'

/** Validate only exchange syntax; do not guess geography or club membership. */
export function normalizeKnownExchange(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase()
  if (!normalized || !/^[A-Z\d]{1,6}$/.test(normalized)) return undefined
  if (/^0+$/.test(normalized)) return undefined
  return normalized
}

export function membershipForExchange(value: string | undefined): Membership {
  const number = normalizeKnownExchange(value)
  if (!number) return 'unknown'
  if (/^\d+$/.test(number)) return 'member'
  return number === 'CWA' ? 'cwa' : 'nonmember'
}

export function isCwtContest(contest: string): boolean {
  return ['CWT', 'CWOPS'].includes(contest.trim().toUpperCase())
}
