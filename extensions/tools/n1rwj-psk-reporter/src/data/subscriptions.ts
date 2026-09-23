import { isValidCall, normalizeCall } from '../../../../../packages/reception/src/callsign.ts'
import type { ReceptionDirection } from '../../../../../packages/reception/src/reports.ts'

export const pskEndpoint = 'wss://mqtt.pskreporter.info:1886'
export const pskProtocols = ['mqtt']

/** Narrow subscriptions only; never subscribe to the entire worldwide feed. */
export function pskTopic(call: string, direction: ReceptionDirection): string | undefined {
  const station = normalizeCall(call)
  // MQTT treats slash as a path separator. Verify the broker's portable-call
  // encoding before supporting it; never remove a suffix or widen the feed.
  if (!isValidCall(station) || station.includes('/')) return undefined
  return direction === 'outgoing'
    ? `pskr/filter/v2/+/+/${station}/#`
    : `pskr/filter/v2/+/+/+/${station}/#`
}
