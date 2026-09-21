# RBN native SVG migration and maintainer notes

For installation and everyday use, start with the
[RBN operator guide](../extensions/tools/n1rwj-rbn/README.md).

## Result and published-app compatibility

RBN can use the documented native `svgScene` API for its bundled reception
map, receiver table, band/sort menus and pagination. The implementation now
uses that API. Published Next 26.9.0 build 170 supports it, and the migrated
extension runs in that unmodified app. Native testing with an empty
`W9MET/TEST` operation observing W9MET at the public POTA grid EL97ER has
verified live reports, the native sort menu, both SNR directions and
pagination. No contacts were logged and no spots were posted. The
[verification record](VERIFICATION.md) records the completed layout, control,
refresh and screenshot checks. Those native checks used the 0.2.0 test archive
identified there; release preparation repackaged the implementation as 0.3.0
and passed the release checks. The 0.3.0 archives were not separately retested
in the native app.

The earlier build 169 check remains useful compatibility evidence: its
updater initially reported it up to date, but it does not supply the scene
environment/placement identity. The migrated package was installed there
and its compatibility message was visibly verified in an empty TEST
operation; the original layout was restored afterward. The user then
installed published build 170. No custom host build or host patch is needed
for the SVG implementation.

The extension intentionally renders a native Markdown upgrade message when
`args.environment` or `args.instanceId` is absent. It performs no RBN request
on that path. SDK types, shared-dependency registration and kernel execution
are necessary checks, but none prove the native app understands `svgScene`.
The SDK currently has no manifest minimum-native-build constraint here.

## Operation defaults and saved settings

[Configuration resolution](../extensions/tools/n1rwj-rbn/src/config.ts) uses
the explicit panel watch callsign first, then the first comma-separated
`operation.stationCall`. Location resolution uses an explicit grid override,
then valid operation `lat`/`lon`, then the operation's grid. A watch override
does not resolve that station's location. Without an origin, reports remain
usable while map paths, distance and bearing are unavailable. Without a valid
call, the client returns a configuration message without making an RBN request.

Defaults are 15 minutes, all bands, regional projection, map + list, and
descending report time. The band does not follow the operation's active band.
Settings belong to the panel placement, so explicit call/grid overrides remain
in effect when that layout is used with another operation. Clearing them
restores inheritance. The [panel](../extensions/tools/n1rwj-rbn/src/panel.ts)
keeps menu/page state in memory per instance, with a signature based on saved
config, operation UUID and station callsign. Changed signatures or a runtime
restart restore the saved defaults.

## Why the refresh model works

`on: ['operation', 'tick:30']` requests renders while visible. It is a refresh
budget, not an event listener inside a document. The RBN client separately
limits network refreshes to once a minute per callsign/window and coalesces
concurrent requests. Failed refreshes retain only unexpired cached reports.

For SVG scenes, controls dispatch an action to the panel's `onEvent`. The
extension validates control/action pairs and updates bounded, per-instance
view/band/sort/direction/page state. Returning `{values:{}}` is intentional:
current `ExtensionPanel._sceneEvent` requests an authoritative render in its
`finally` block, so structural changes arrive in the next scene. Numeric
patches are useful for local animation; this static map needs none.

Current host source automatically requests throttled renders for scene
size/theme changes. Coordinates use logical panel dimensions and safe
insets. Device pixel ratio is not a coordinate multiplier. Native text
receives unscaled role font size; its reserved bounds use scaled font size.

## Rendering constraints and choices

- Geography is simplified Natural Earth vector data bundled in the `.h2kext`.
  There are no earth tiles, downloads, external fonts, or remote SVG assets.
- One selected-band map is laid out at the actual available dimensions.
  All selected-band receivers are mapped regardless of the current list page.
  Unlocated receivers remain in the list; no callsign location is invented.
- Map SVG contains geometry. Text uses native scene text layers, since SVG
  `<text>` is not portable through Flutter's vector renderer.
- The scene has no scrolling container. The list therefore paginates,
  becoming cards at narrow widths; details also paginate when necessary.
- Native menu buttons expose band/sort/view options. Drawn backgrounds/text
  accompany the controls' hit regions, with 44-pixel minimum targets.
- The renderer respects the native limits: 128 layers, 64 controls, 32 menu
  items, 256 KiB per SVG/literal string and 1 MiB combined artwork/text.
  Large maps split into self-contained geometry layers, each with local defs.
- TEST identity, checked time, age, stale/error and capped-response provenance
  remain available through the header/status/details view.
- Local interaction state is bounded to 32 placements and resets on changed
  operation/config. Preferences saved in the host's form remain the defaults.
- The absent-operation Home/Logs exception was our extension bug; it is fixed.

Native Flutter SVG/text avoids the HTML WebView requirement on Linux.
The map needs no animation loop or per-frame JavaScript. Native CPU, battery,
and cross-platform rendering have not been measured; Node render timings are
not a substitute for those measurements.

## Development build and static previews

Install dependencies as described in the [root README](../README.md), then
build an installable RBN package from the repository root:

```sh
mise run pack n1rwj-rbn
```

For a reproducible development preview, render the actual bundled extension
through the installed Ham2K JavaScript kernel:

```sh
mise run rbn:preview --call K1ABC --grid FN31 --minutes 30
mise run rbn:preview --call K1ABC --grid FN31 --width 390 --height 844 --view list --sort snr --output dist/rbn-phone.svg
```

Replace the example call and grid with a station you want to observe. The task
builds the extension, loads the installed JavaScript kernel and ES2020 bundle,
and invokes the actual panel with live read-only RBN requests and a synthetic
render environment. It writes:

- `dist/rbn-preview.svg`: a labeled static approximation of scene artwork and
  native text; controls and animation are inactive.
- `dist/rbn-preview.scene.json`: the actual scene document.
- `dist/rbn-preview.json`: environment, text, timings, hashes, request records
  and the five-second render budget result.

Use `--output <path.svg>` for another output name, `--width` and `--height` for
panel dimensions, and `--theme dark` for a dark preview. `--view`, `--band`,
`--sort` and `--direction` select the initial presentation. Browser SVG text
measurement differs from Flutter's native text. The synthetic environment
allows this check even when the installed app lacks the native scene API;
successful kernel execution does not prove that app can display the scene.
The task's `/TEST` operation exists only in memory and creates no native
operation. Run `mise run check` for the repository's automated checks.

The RBN client caches at most eight callsign/window queries with at most 500
reports each, without disk persistence. Each HTTPS request has a 1.2-second
timeout. Metadata and reports load concurrently; the endpoint's version
handshake permits one report retry. The parser reads schema metadata and
rejects unknown formats. These bounds leave room within the host's five-second
render deadline; they do not guarantee response times from the public service.

## Published-app reproduction and acceptance

1. Use the published Next app. Record version/build and run Check for Updates.
2. Install `n1rwj-rbn-0.3.0.h2kext` from the
   [release](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases/tag/v0.3.0),
   or a freshly built package from `dist/`, through Settings → Features & Extensions.
3. Open a clearly labeled, empty TEST operation. Add RBN · My signal using
   Edit Layout. On older builds, expect the explicit app-update message.
4. On a scene-capable published build, select a current public POTA CW station.
   Keep the operation station as `CALL/TEST`, label its title TEST, and put
   the real public call in the panel's Watch callsign setting. Use the public
   operation grid. Do not transmit, spot, or log fictitious contacts.
5. Verify map + table at desktop width, then map/cards at narrow width.
   Select each band, both SNR directions, next/previous page, and Details.
   Missing measurements must remain last in either sort direction.
6. Wait for a new checked timestamp. Confirm view/band/sort/page survive the
   refresh. Change saved panel defaults and confirm those new defaults apply.
7. Resize and change theme/font scale; inspect clipping, text and hit targets.
   Test Home without an operation, with explicit watch/grid overrides.
8. Repeat on Linux and a physical phone before claiming those native results.
   Capture app screenshots and record exact package hash/build.

Automated tests exercise these state/layout/data contracts; static preview
screenshots show the actual scene's initial layout with approximated text.
They must not be presented as native app acceptance.

## HTML investigation retained for context

Existing contest/program panels were misleading comparators: they use native
Markdown/forms, not the sandboxed HTML renderer. Current official dashboard
examples have migrated to SVG scenes. The old HTML radio sample does not
prove published Next's WebView refresh behavior.

At host main `cad0bc2c`, `panel_content_view.dart` builds
`InAppWebView(initialData: InAppWebViewInitialData(data: html))`. The mounted
view has no controller-driven `loadData` path for changed HTML. Triggers do
recompute the document, but creation-time data does not update an existing
native platform view. That is a source-level HTML refresh defect. The original
blank first load is a separate issue: cancellation of initial navigation is
a hypothesis, not independently established by the published-app minimal
reproducer. A working patched hybrid Dev build does not prove which change
fixed first load in the published binary.

A minimal maintainer check is a network-free HTML panel returning an
incrementing counter on `tick:2`, beside an equivalent Markdown panel.
Check initial display, advance twice, switch tabs, resize, and remount. Log
rendered counter, WebView creation/update and navigation callbacks. Compare
an HTML fragment with a full document and the unchanged official HTML radio
sample. Confirm whether new content reaches an existing native view before
changing navigation allowances. Preserve the no-script/no-subresource-network
and external-navigation policy. Form/scroll retention is a separate enhancement,
not a requirement to fix basic document refresh.

The exploratory HTML prototype was backed up locally at halo commit `ef546297`
on `codex/tmp-html-panel-refresh`. Both working checkouts were restored to
main at `cad0bc2c` on September 21, 2026; no host code was pushed or proposed
as a PR. Detailed historical reproduction artifacts remain only in the original
local workspace's ignored `dist/html-panel-investigation/` directory; they are
not shipped in the release or available from a fresh clone.
