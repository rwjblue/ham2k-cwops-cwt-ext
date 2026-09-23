import type { ReceptionSocket } from '../src/transport/socket.ts'

export function fakeSocket() {
  const sent: number[][] = []
  const socket: ReceptionSocket = {
    url: 'wss://mqtt.pskreporter.info:1886',
    readyState: 1,
    protocol: 'mqtt',
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      if (typeof data === 'string') throw new Error('Expected binary')
      sent.push([
        ...new Uint8Array(
          data instanceof ArrayBuffer ? data : data.buffer,
          data instanceof ArrayBuffer ? 0 : data.byteOffset,
          data instanceof ArrayBuffer ? data.byteLength : data.byteLength,
        ),
      ])
    },
    close() {
      closed++
    },
  }
  let closed = 0
  return {
    socket,
    sent,
    get closed() {
      return closed
    },
    receive(bytes: number[]) {
      socket.onmessage?.({ data: new Uint8Array(bytes).buffer })
    },
  }
}

export function publication(topic: string, payload: string) {
  const text = new TextEncoder().encode(payload)
  const body = [topic.length >> 8, topic.length & 255, ...new TextEncoder().encode(topic), ...text]
  const length: number[] = []
  let rest = body.length
  do {
    const digit = rest % 128
    rest = Math.floor(rest / 128)
    length.push(digit | (rest ? 128 : 0))
  } while (rest)
  return [0x30, ...length, ...body]
}
