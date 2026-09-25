#!/usr/bin/env -S node --experimental-strip-types

//[MISE] description="Probe the actual PSK transport against a narrow live feed for up to 75 seconds"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] arg "<call>" help="Exact watched callsign (including portable suffix)"
//[USAGE] flag "--incoming" help="Observe reports received by this callsign"

import { pskTopic } from '../../../extensions/tools/n1rwj-psk-reporter/src/data/subscriptions.ts'
import { createLiveReception } from '../../../extensions/tools/n1rwj-psk-reporter/src/live.ts'
import type { ReceptionSocket } from '../../../extensions/tools/n1rwj-psk-reporter/src/transport/socket.ts'

const call = process.env.usage_call ?? ''
const direction = process.env.usage_incoming === 'true' ? 'incoming' : 'outgoing'
if (!pskTopic(call, direction)) throw new Error('A valid exact callsign is required')
const live = createLiveReception((url, options) => {
  const ws = new WebSocket(url, options?.protocols)
  ws.binaryType = 'arraybuffer'
  const socket: ReceptionSocket = {
    url,
    get readyState() {
      return ws.readyState as 0 | 1 | 2 | 3
    },
    get protocol() {
      return ws.protocol
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: (data) =>
      ws.send(
        typeof data === 'string' || data instanceof ArrayBuffer
          ? data
          : new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      ),
    close: (code, reason) => ws.close(code, reason),
  }
  ws.onopen = () => socket.onopen?.()
  ws.onmessage = (event) => {
    if (typeof event.data === 'string' || event.data instanceof ArrayBuffer)
      socket.onmessage?.({ data: event.data })
  }
  ws.onerror = () => socket.onerror?.({ message: 'Node WebSocket failed' })
  ws.onclose = (event) =>
    socket.onclose?.({ code: event.code, reason: event.reason, wasClean: event.wasClean })
  return socket
})

let connected = false
let previous = ''
try {
  await new Promise<void>((resolve, reject) => {
    const end = Date.now() + 75_000
    const timer = setInterval(() => {
      const snapshot = live.snapshot('probe', call, direction, 15, true)
      const label = `${snapshot.state}: ${snapshot.reports.length} distinct reception links`
      if (label !== previous) console.log(label)
      previous = label
      connected ||= snapshot.state === 'live'
      if (snapshot.reports.length || Date.now() >= end) {
        clearInterval(timer)
        if (!connected) reject(new Error(`Feed did not become live: ${snapshot.message}`))
        else {
          console.log(
            snapshot.reports.length
              ? 'Received and parsed live reports through the prepared transport.'
              : 'Connection/subscription succeeded; no report arrived for this call during the probe.',
          )
          resolve()
        }
      }
    }, 1000)
  })
} finally {
  live.stop()
}
console.log('Node transport probe only; this does not validate Ham2K native lifecycle or UI.')
