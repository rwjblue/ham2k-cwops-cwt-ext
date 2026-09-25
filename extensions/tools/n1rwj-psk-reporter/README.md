# N1RWJ PSK Reporter

Live PSK Reporter reception maps for Ham2K **build 171 or newer**. The regular
package uses the published `@ham2k/extension-sdk` **0.6.0** and
`@ham2k/extension-tools` **0.5.0**, with API 2, a WebSocket permission
for `mqtt.pskreporter.info`, and HTTPS access to `retrieve.pskreporter.info`
for recent history.

## Build and install

```sh
mise run pack n1rwj-psk-reporter
```

Install `dist/n1rwj-psk-reporter-0.4.1.h2kext` through Ham2K's extension installer,
allow its declared network hosts, and add **PSK Reporter** to an operation's layout.
It follows the operation's station callsign and location unless overridden.
Choose **Who hears me** for outgoing reception or **Who I hear** for reports
uploaded by your receiving software. No fixture reports appear in the app.
The extension key is unchanged, so this replaces the earlier offline preview.

## Verification

`mise run check` includes the normal bundle's binary MQTT smoke test, strict
TypeScript checks, deterministic transport/panel tests and official packaging.
The smoke test exercises the actual published SDK's socket, HTTP, storage and
force-reload bridges with fixture responses in a timerless Node VM. It does not
validate native Ham2K UI, real HTTP access or operating-system lifecycle.

The implementation first passed against upstream source commit
[17b15fdcafdd](https://github.com/ham2k/halo/commit/17b15fdcafdd), then passed the
same contract, build, packer and binary bridge checks against the published
SDK 0.6.0/tools 0.5.0. The code now uses the SDK's own socket types and regular
entry point; no SDK implementation is copied into this repository.

For future SDK/tools compatibility checks, an optional isolated candidate build
uses the same entry point and manifest:

```sh
mise run psk:build-live --sdk /path/to/extension-sdk --tools /path/to/extension-tools
```

The SDK directory must contain built `dist/` files. Omitting flags uses the
installed packages. This writes a development package and `toolchain.json` under
`dist/psk-development/`, leaving the normal package and dependency pins unchanged.

A bounded live-network probe uses the same transport and store under Node:

```sh
mise run psk:probe N1RWJ
mise run psk:probe CU3AT --incoming
```

It subscribes only to that callsign, runs for at most 75 seconds, reports whether
MQTT connected and whether reports arrived, and closes its connection. The local
probe established connection, subscription and heartbeat with the live broker;
CU3AT had no reports during that observation. Fixtures validate binary report
ingestion and scene generation separately. Native build-171-or-newer tests remain
pending; the installed app was still build 170 at promotion time.

## Reception behavior

- The shared [reception workspace](../../../packages/reception/README.md)
  supplies RBN's map, SVG renderer, settings, and panel state. Settings offer
  **Who hears me** and **Who I hear**, map/list layouts, band/window selection,
  projection and sorting. Callsign and location follow the operation unless
  overridden. SNR belongs to the receiver; reported grids are never replaced
  with callsign-prefix guesses.
- `src/transport/mqtt.ts` implements the needed MQTT 3.1.1 clean-session QoS-0
  subscriber packets. It handles fragmented/coalesced binary packets, strict
  UTF-8, CONNECT/CONNACK, SUBSCRIBE/SUBACK, UNSUBSCRIBE/UNSUBACK, PUBLISH,
  PINGREQ/PINGRESP and DISCONNECT. Packet, frame and callback work limits reject
  malformed or excessive input. Retained publications are ignored.
- `src/transport/client.ts` negotiates `mqtt` over
  `wss://mqtt.pskreporter.info:1886`. Handshakes and subscription ACKs time out
  after 10 seconds. Visible ticks send a ping every 15 seconds and allow 15
  seconds for its reply. Failures retry only from a render tick, with exponential
  5–60 second backoff plus jitter. A minute of stable connection resets backoff.
  Closed-session callbacks cannot affect the replacement session.
- `src/live.ts` shares **one socket per extension**, up to eight distinct narrow
  callsign/direction subscriptions and 32 placement leases. It validates topics
  against report payloads and exact watched calls before storing reports. The
  cache retains at most 1,000 newest links and expires them after one hour.
  Capacity loss is visible. A new callsign cannot display the prior call's data.
- Panels render at most on the host's five-second tick cadence plus operation or
  UI events. Connection status is separate from report age; connecting is not
  presented as live reception. No per-report render or whole-log query occurs.
- Recent history uses PSK Reporter's documented XML query API on startup,
  after a collection gap, and when a larger report window needs older data.
  It requests the configured 15/30/60-minute window across all bands, with a
  1,000-record limit. History and MQTT reports share the same bounded cache;
  newer observations win. Exact callsign and direction filtering also applies
  to history. Unlocated stations remain in the list.
- Automatic HTTP requests share one queue and are spaced at least five minutes
  apart across all placements. The cooldown persists across extension reloads.
  Failures increase the delay up to an hour. Hidden or replaced subscriptions
  do not start queued work or ingest late responses. Requests time out after
  seven seconds and never block automatic panel rendering or MQTT delivery.
- The **Force reload** arrow explicitly bypasses the local history cooldown,
  including failure backoff, but still obeys offline state and serializes requests.
  Repeated clicks for the same in-flight request share its result. It does not
  bypass server limits or browser challenges. Use it sparingly: the provider
  recommends no more than one retrieval every five minutes.
- Connection and history status are displayed separately. Challenges, HTTP
  errors, unsupported XML, response limits and cache capacity are reported;
  unsuccessful backfill never clears live reports or claims complete coverage.

## Visibility and remaining native tests

There are no JavaScript timers in the extension. A placement's subscription lease
expires after 30 seconds without rendering. A remaining visible panel removes
expired subscriptions on its next tick. With all panels hidden or removed,
subsequent socket events close the session after the lease expires; with no events,
the broker's 30-second MQTT keepalive limit provides cleanup (normally by 45
seconds without client traffic). Reveal/sleep recovery discards an old session
and reconnects from a render. Host unload owns final socket cleanup.

This is a **live window with best-effort backfill**, without a promise of background
capture or complete history. Cache contents can remain visible while offline or reconnecting. Incoming
reports require uploads from receiving software. Portable calls containing `/`
remain unsupported for subscriptions until the broker's encoding is verified;
we neither remove suffixes nor widen subscriptions.

History follows the [PSK Reporter query API](https://pskreporter.info/pskdev.html).
The September 24, 2026 command-line API probe received a Cloudflare browser
challenge instead of XML. Native `host.fetch` access remains unverified; this
implementation handles that failure without interrupting the MQTT feed. The
deterministic tests and SDK bundle smoke verify fixtures, not provider availability.
History responses and live reports are held in memory; only the automatic-request
cooldown persists across extension reloads. No background HTTP polling occurs.

Before publishing, install on build 171 or newer and test both directions,
multiple placements, callsign/operation changes, hidden tabs, app backgrounding,
panel removal, sleep/resume, disconnects, denied grants and extension reload.
Check native binary delivery and UI on each intended platform. Publication
monitoring is paused because both required packages have been verified.
Also check first-open history, force reload, returning after a gap, multiple
panels sharing the HTTP cooldown, a callsign change during a request, and an
HTTP denial or browser challenge while MQTT continues receiving.

Reports originate at [PSK Reporter](https://pskreporter.info/); the MQTT distribution
is operated by M0LTE ([feed schema and topics](https://www.mqtt.pskreporter.info/)).
The packet implementation follows [MQTT 3.1.1](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html).
Reception reports are not QSOs, confirmations or proof of coverage. The extension
neither submits spots nor logs contacts. See [shared map attribution](../../../packages/reception/assets/MAP_ATTRIBUTION.md).
