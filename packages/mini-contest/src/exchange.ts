import type { JSONValue } from '@ham2k/extension-sdk'
import { annotateCallAgainstCountryFile } from '@ham2k/extension-sdk'
import { type ContestConfig, object, type Qson, refOf, text } from './model.ts'

export const STATES = new Set(
  'AL AR AZ CA CO CT DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY DC'.split(
    ' ',
  ),
)
// SST's sponsor-linked N1MM table distinguishes Labrador (LB) and
// Newfoundland (NF). NL is accepted as the common Newfoundland alias.
export const PROVINCES = new Set('AB BC MB NB NF NL LB NS NT NU ON PE QC SK YT'.split(' '))
export const LOCATIONS = [...STATES, ...PROVINCES, 'DX']
export function firstName(value: JSONValue | undefined): string {
  return text(value).trim().split(/\s+/)[0].toUpperCase()
}
export function location(value: JSONValue | undefined): string {
  const result = text(value).trim().toUpperCase()
  // The received exchange is preserved verbatim; only suggestions map aliases.
  return result
}
export function canonicalLocation(value: string): string {
  return value === 'NL' ? 'NF' : value
}
export function serial(value: JSONValue | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : text(value).trim().toUpperCase()
}
export function validSerial(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value))
}
export function guessedName(their: Qson): string {
  return firstName(their.name) || firstName(object(their.guess).name)
}
export function guessedLocation(their: Qson): string {
  const guess = object(their.guess)
  const info = annotateCallAgainstCountryFile(text(their.call))
  const entity = text(their.entityPrefix) || text(guess.entityPrefix) || info.entityPrefix || ''
  const state = location(their.state) || location(guess.state)
  if (entity === 'K') return STATES.has(state) ? state : ''
  if (entity === 'VE') return PROVINCES.has(state) ? state : ''
  // Alaska and Hawaii are DX for SST, regardless of a lookup's AK/HI state.
  return entity ? 'DX' : ''
}
export function received(config: ContestConfig, qso: Qson): { name: string; value: string } {
  const ref = refOf(qso, config.type)
  return {
    name: firstName(ref?.name),
    value: config.exchange === 'serial-name' ? serial(ref?.theirSerial) : location(ref?.location),
  }
}
export function sent(
  config: ContestConfig,
  operation: Qson,
  qso: Qson,
): { name: string; value: string } {
  const op = refOf(operation, config.type)
  return {
    name: firstName(op?.ourName),
    value:
      config.exchange === 'serial-name'
        ? serial(refOf(qso, config.type)?.ourSerial)
        : location(op?.ourLocation),
  }
}
export function exchangeText(
  config: ContestConfig,
  exchange: { name: string; value: string },
): string {
  return (
    config.exchange === 'serial-name'
      ? [exchange.value, exchange.name]
      : [exchange.name, exchange.value]
  )
    .filter(Boolean)
    .join(' ')
}
