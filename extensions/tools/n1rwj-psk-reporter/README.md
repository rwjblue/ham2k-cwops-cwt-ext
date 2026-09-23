# N1RWJ PSK Reporter preview

This is an **offline development scaffold**. It builds and packages with the
currently pinned SDK/tools and contributes a native panel, but it does not
open a socket or receive live reports. No fixture reports appear in the app.
The panel says **Preview · live reception not connected**.

Build locally with `mise run pack n1rwj-psk-reporter`, install the resulting
`dist/n1rwj-psk-reporter-0.4.1.h2kext`, and add **PSK Reporter · Preview** to an
operation's layout. The panel follows the operation's station callsign and
location unless explicitly overridden. Settings offer **Who hears me** and
**Who I hear**, map/list layouts, band/window selection, projection and sorting.
These configure the preview; they do not enable live reception.

## Implemented foundations

- The shared [reception workspace](../../../packages/reception/README.md)
  supplies the same map, SVG renderer, configuration, and panel state as RBN.
- `src/data/parser.ts` parses a JSON reception payload after MQTT decoding.
  It preserves both callsigns and reported grids, converts epoch seconds to
  milliseconds, prefers normalized `t_tx`, and keeps receiver SNR (including
  zero). Invalid grids remain unlocated; they never become callsign guesses.
- `src/data/subscriptions.ts` prepares narrow callsign-specific incoming or
  outgoing topics. Portable calls containing `/` are deliberately unsupported
  for subscriptions until the broker's encoding is verified. Their payloads
  and exact-match presentation are supported; suffixes are never stripped.
- `src/data/store.ts` holds a bounded, expiring in-memory window, handles
  out-of-order reports, and reports capacity loss. It has no timer or transport.
- `pskPanelModel` accepts recorded reports for deterministic tests. The shipped
  panel passes an empty list and has no network grants or polling triggers.

## Enable live reception after the SDK/tools release

The baseline is `@ham2k/extension-sdk` **0.5.7** and
`@ham2k/extension-tools` **0.4.0**, checked September 23, 2026. Read the actual
published types and validator before upgrading: a higher version alone is
not sufficient. The SDK must expose `host.webSocket`, binary frames and
subprotocol options; the tools must accept API 2 and the `webSockets` grant.

The [upstream WebSocket change](https://github.com/ham2k/halo/commit/17b15fdcafdd)
is intended for build 171. That build was listed for macOS, Windows x64 and
Linux ARM64 on the [official download page](https://ham2k.com/downloads/)
during investigation. Verify the installed build per platform.

Next implementation steps:

1. Upgrade the published SDK/tools and declare `"api": 2` plus
   `"webSockets": ["mqtt.pskreporter.info"]`. Keep the offline scaffold on
   API 1 until it actually uses sockets; do not bypass the packer's checks.
2. Add an MQTT transport over `wss://mqtt.pskreporter.info:1886`, negotiating
   `mqtt`. WebSocket frames carry binary MQTT packets, not raw JSON. Cover
   packet reassembly, CONNECT/CONNACK, SUBSCRIBE/SUBACK, PUBLISH, keepalive,
   unsubscribe, and disconnect. Do not assume a browser MQTT library runs
   unchanged in QuickJS: the sandbox has no DOM, Node or JavaScript timers.
3. Feed decoded payloads into the store, enforce the active callsign filters,
   cap work and memory, and render snapshots at a bounded visible-panel cadence.
   Separate connection state from report age and capacity warnings. Reconnect
   with backoff driven by supported host events, never an immediate close loop.
4. Test multiple placements, changed callsigns, extension reloads, hidden
   panels, sleep/resume, network failure and binary delivery in Ham2K itself.
   Panel ticks stop when hidden, so keepalive and background behavior need an
   explicit solution. Do not promise historical backfill or background capture.

Current tests are unit, Node sandbox bundle and official packaging checks;
they are not a live WebSocket test inside Ham2K. The investigation's standalone
Node probe received an actual report, but does not establish app lifecycle behavior.

Reports originate at [PSK Reporter](https://pskreporter.info/) and the planned
MQTT distribution is operated by M0LTE: [feed schema and topics](https://www.mqtt.pskreporter.info/).
Incoming reports require uploads from receiving software. Reception reports
are not QSOs, confirmations, or proof of coverage. The preview neither submits
spots nor logs contacts. See [shared map attribution](../../../packages/reception/assets/MAP_ATTRIBUTION.md).
