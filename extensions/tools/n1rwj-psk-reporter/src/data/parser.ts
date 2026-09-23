import { isValidCall, normalizeCall } from '../../../../../packages/reception/src/callsign.ts'
import { operationOrigin } from '../../../../../packages/reception/src/config.ts'
import type {
  ReceptionReport,
  ReceptionStation,
} from '../../../../../packages/reception/src/reports.ts'

function station(call: string, locator: unknown): ReceptionStation {
  const grid = typeof locator === 'string' ? locator.trim().toUpperCase() : ''
  const origin = operationOrigin(undefined, grid)
  return {
    call,
    location: origin
      ? {
          latitude: origin.latitude,
          longitude: origin.longitude,
          grid,
          source: 'reported-grid',
        }
      : undefined,
  }
}

/** Decodes one MQTT PUBLISH payload, not an MQTT packet or a WebSocket frame. */
export function parsePskPayload(payload: string): ReceptionReport | undefined {
  if (payload.length > 16_384) return undefined
  let raw: Record<string, unknown>
  try {
    const value: unknown = JSON.parse(payload)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    raw = value as Record<string, unknown>
  } catch {
    return undefined
  }
  const tx = typeof raw.sc === 'string' ? normalizeCall(raw.sc) : ''
  const rx = typeof raw.rc === 'string' ? normalizeCall(raw.rc) : ''
  const time = raw.t_tx ?? raw.t
  if (
    !isValidCall(tx) ||
    !isValidCall(rx) ||
    typeof raw.f !== 'number' ||
    !Number.isSafeInteger(raw.f) ||
    raw.f <= 0 ||
    raw.f > 300_000_000_000 ||
    typeof time !== 'number' ||
    !Number.isSafeInteger(time) ||
    time <= 0 ||
    time > 8_640_000_000_000 ||
    typeof raw.md !== 'string' ||
    !/^[A-Z0-9+-]{1,16}$/i.test(raw.md) ||
    typeof raw.b !== 'string' ||
    !/^\d+(?:\.\d+)?(?:m|cm|mm)$/.test(raw.b)
  )
    return undefined
  const mode = raw.md.toUpperCase()
  return {
    id:
      typeof raw.sq === 'number' && Number.isSafeInteger(raw.sq) && raw.sq >= 0
        ? String(raw.sq)
        : JSON.stringify([tx, rx, time, raw.f, mode]),
    transmitter: station(tx, raw.sl),
    receiver: station(rx, raw.rl),
    frequencyHz: raw.f,
    band: raw.b,
    mode,
    timeMs: time * 1000,
    snrDb:
      typeof raw.rp === 'number' && Number.isFinite(raw.rp) && Math.abs(raw.rp) <= 100
        ? raw.rp
        : undefined,
  }
}
