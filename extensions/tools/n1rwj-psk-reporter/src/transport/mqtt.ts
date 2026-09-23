// MQTT 3.1.1, clean-session subscriber at QoS 0. No Node/DOM codecs or timers.
// https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html
const maxPacketBytes = 32_768

function ascii(value: string): number[] {
  if (!value.length || value.length > 65535 || /[^\x20-\x7e]/.test(value))
    throw new Error('Invalid MQTT string')
  return [value.length >> 8, value.length & 255, ...Array.from(value, (c) => c.charCodeAt(0))]
}

function packet(header: number, body: number[]): Uint8Array {
  const length: number[] = []
  let remaining = body.length
  do {
    const digit = remaining % 128
    remaining = Math.floor(remaining / 128)
    length.push(digit | (remaining ? 128 : 0))
  } while (remaining)
  return new Uint8Array([header, ...length, ...body])
}

export function connectPacket(clientId: string): Uint8Array {
  // MQTT 3.1.1, clean session, no credentials/will, 30 second keepalive.
  return packet(0x10, [...ascii('MQTT'), 4, 2, 0, 30, ...ascii(clientId)])
}

export function subscriptionPacket(id: number, topic: string, remove = false): Uint8Array {
  if (!Number.isInteger(id) || id < 1 || id > 65535) throw new Error('Invalid MQTT packet ID')
  return packet(remove ? 0xa2 : 0x82, [id >> 8, id & 255, ...ascii(topic), ...(remove ? [] : [0])])
}

export const pingPacket = new Uint8Array([0xc0, 0])
export const disconnectPacket = new Uint8Array([0xe0, 0])

/** Strict UTF-8, including supplementary characters; QuickJS has no TextDecoder. */
function utf8(bytes: Uint8Array): string {
  const chars: string[] = []
  for (let i = 0; i < bytes.length; ) {
    const first = bytes[i++]
    let point = first
    const size =
      first < 0x80
        ? 1
        : first >= 0xc2 && first <= 0xdf
          ? 2
          : first >= 0xe0 && first <= 0xef
            ? 3
            : first >= 0xf0 && first <= 0xf4
              ? 4
              : 0
    if (!size || i + size - 1 > bytes.length) throw new Error('Invalid MQTT UTF-8')
    for (let j = 1; j < size; j++) {
      const next = bytes[i++]
      if ((next & 0xc0) !== 0x80) throw new Error('Invalid MQTT UTF-8')
      if (j === 1) point &= (1 << (7 - size)) - 1
      point = (point << 6) | (next & 63)
    }
    if (
      (size === 2 && point < 0x80) ||
      (size === 3 && point < 0x800) ||
      (size === 4 && point < 0x10000) ||
      point > 0x10ffff ||
      (point >= 0xd800 && point <= 0xdfff)
    )
      throw new Error('Invalid MQTT UTF-8')
    chars.push(String.fromCodePoint(point))
  }
  return chars.join('')
}

export type MqttPacket =
  | { kind: 'connack'; code: number }
  | { kind: 'suback'; id: number; code: number }
  | { kind: 'unsuback'; id: number }
  | { kind: 'pingresp' }
  | { kind: 'publish'; topic: string; payload: string; retained: boolean }

function decode(header: number, body: Uint8Array): MqttPacket {
  if (header === 0x20 && body.length === 2 && body[0] === 0 && body[1] <= 5)
    return { kind: 'connack', code: body[1] }
  const id = (body[0] << 8) | body[1]
  if (header === 0x90 && body.length === 3 && id && [0, 1, 2, 128].includes(body[2]))
    return { kind: 'suback', id, code: body[2] }
  if (header === 0xb0 && body.length === 2 && id) return { kind: 'unsuback', id }
  if (header === 0xd0 && !body.length) return { kind: 'pingresp' }
  // Requesting QoS 0 means a conforming broker never sends QoS 1/2 here.
  if ((header === 0x30 || header === 0x31) && body.length >= 2) {
    const length = (body[0] << 8) | body[1]
    if (!length || length > 1024 || length + 2 > body.length || body.length - length - 2 > 16384)
      throw new Error('Invalid MQTT publication size')
    const topic = utf8(body.subarray(2, 2 + length))
    if (topic.includes(String.fromCharCode(0)) || /[+#]/.test(topic))
      throw new Error('Invalid MQTT publication topic')
    return {
      kind: 'publish',
      topic,
      payload: utf8(body.subarray(2 + length)),
      retained: header === 0x31,
    }
  }
  throw new Error('Unexpected MQTT packet')
}

/** Bounded stream decoder: frames may split a packet or contain several. */
export function createMqttDecoder() {
  let pending = new Uint8Array(0)
  return {
    feed(data: ArrayBuffer): MqttPacket[] {
      if (data.byteLength > 65_536) throw new Error('MQTT frame exceeds local work budget')
      const bytes = new Uint8Array(pending.length + data.byteLength)
      bytes.set(pending)
      bytes.set(new Uint8Array(data), pending.length)
      const result: MqttPacket[] = []
      let offset = 0
      while (offset < bytes.length) {
        let cursor = offset + 1
        let length = 0
        let multiplier = 1
        let complete = false
        for (let n = 0; n < 4; n++) {
          if (cursor === bytes.length) break
          const digit = bytes[cursor++]
          length += (digit & 127) * multiplier
          if (length > maxPacketBytes) throw new Error('MQTT packet exceeds local limit')
          if (!(digit & 128)) {
            if (n && digit === 0) throw new Error('Non-canonical MQTT length')
            complete = true
            break
          }
          if (n === 3) throw new Error('Malformed MQTT length')
          multiplier *= 128
        }
        if (!complete || bytes.length - cursor < length) break
        if (result.length === 256) throw new Error('MQTT packet work budget exceeded')
        result.push(decode(bytes[offset], bytes.subarray(cursor, cursor + length)))
        offset = cursor + length
      }
      pending = bytes.slice(offset)
      if (pending.length > maxPacketBytes + 5) throw new Error('MQTT receive buffer exceeded')
      return result
    },
  }
}
