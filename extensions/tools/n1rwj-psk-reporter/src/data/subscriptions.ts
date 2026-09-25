import { isValidCall, normalizeCall } from '../../../../../packages/reception/src/callsign.ts'
import type { ReceptionDirection } from '../../../../../packages/reception/src/reports.ts'

export const pskEndpoint = 'wss://mqtt.pskreporter.info:1886'
export const pskProtocols = ['mqtt']

/** Narrow subscriptions only; never subscribe to the entire worldwide feed. */
export function pskTopic(call: string, direction: ReceptionDirection): string | undefined {
  const normalized = normalizeCall(call)
  if (!isValidCall(normalized)) return undefined
  // Match GridTracker's filtered-v2 encoding without broadening the callsign.
  const station = normalized.replace(/\//g, '.')
  return direction === 'outgoing'
    ? `pskr/filter/v2/+/+/${station}/#`
    : `pskr/filter/v2/+/+/+/${station}/#`
}

/** Dots escape portable-call separators in MQTT topics and payloads. */
export function decodePskCall(call: string): string {
  return normalizeCall(call.replace(/\./g, '/'))
}
