// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Adapted from the Ham2K CWT weekly-session model.
import type { ContestConfig } from './model.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
export const OFFER_LEAD = 3 * HOUR
export const OFFER_GRACE = HOUR
export interface Session {
  key: string
  startMillis: number
  endMillis: number
}
function sessionAt(startMillis: number): Session {
  const at = new Date(startMillis).toISOString()
  return {
    key: `${at.slice(0, 10)}-${at.slice(11, 13)}00`,
    startMillis,
    endMillis: startMillis + HOUR,
  }
}
export function sessionFor(config: ContestConfig, key: string | undefined): Session | undefined {
  if (!key || !/^\d{4}-\d{2}-\d{2}-\d{2}00$/.test(key)) return undefined
  const at = Date.parse(`${key.slice(0, 10)}T${key.slice(11, 13)}:00:00Z`)
  if (!Number.isFinite(at)) return undefined
  const session = sessionAt(at)
  const date = new Date(at)
  return session.key === key &&
    config.slots.some(({ day, hour }) => day === date.getUTCDay() && hour === date.getUTCHours())
    ? session
    : undefined
}
export function sessionsFrom(config: ContestConfig, now: number, count = 4): Session[] {
  const date = new Date(now)
  if (!Number.isFinite(now) || count <= 0) return []
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const found: Session[] = []
  for (let offset = -1; offset <= 21 && found.length < count; offset++) {
    const day = midnight + offset * DAY
    for (const slot of [...config.slots].sort((a, b) => a.hour - b.hour)) {
      if (slot.day !== new Date(day).getUTCDay()) continue
      const session = sessionAt(day + slot.hour * HOUR)
      if (session.endMillis + OFFER_GRACE > now && found.length < count) found.push(session)
    }
  }
  return found
}
export function sessionAtHand(config: ContestConfig, now: number): Session | undefined {
  const next = sessionsFrom(config, now, 1)[0]
  return next && now >= next.startMillis - OFFER_LEAD ? next : undefined
}
export function sessionLabel(config: ContestConfig, session: Session): string {
  return `${config.shortName} ${session.key.slice(11)}z`
}
export function sessionDateLabel(session: Session): string {
  return `${session.key.slice(0, 10)} ${session.key.slice(11)}z`
}
