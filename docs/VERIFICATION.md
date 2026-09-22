# Verification and compatibility

## Release 0.3.3 preparation — 2026-09-21

Reviewed the four commits after published `v0.3.2`: Vail ReRBN migration,
settings preservation, compact layout, and manual refresh/reduced scheduled
renders. No remaining release-blocking defects were identified. Corrected the
refresh integration tests' mock responses to include the required `offset`
and `limit` fields; previously they exercised error caching. The tests now
also assert populated report reuse across placements and a successful manual
refresh with an updated check timestamp. Updated the root operator instructions
for View/Band in panel settings and corrected the stale catalog status.

Prepared synchronized version **0.3.3** across the root, all four extensions,
shared workspaces, and lockfile. `mise run format` and
`mise run release v0.3.3 --dry-run` passed: **411 tests across 30 files**, lint,
strict typechecks, official builds/packaging, and all eight asset/checksum paths.
`mise run verify-host` passed for every extension against the running
**Ham2K Next 26.9.0 build 170** kernel, SHA-256
`b001f0c0ede236f2dfb5a24788aaaebd49709bb193ff487b90337b115790f743`.

| Candidate bundle | SHA-256 |
| --- | --- |
| `n1rwj-cwt-0.3.3.h2kext` | `7ad8a6a0b1f254ad0a5ac8bb93b6a86f40a9151a2d96f91c47a7ac813c7ce3b3` |
| `n1rwj-mst-0.3.3.h2kext` | `35ce89e7f3dca610e20e29669bfa03898ae8974394b65e6f7e103b098a7a356c` |
| `n1rwj-rbn-0.3.3.h2kext` | `87bc1605f9751c5f503a14e5a3cdc4af9f1629af8948d6bbd11c52b75a5bfece` |
| `n1rwj-sst-0.3.3.h2kext` | `7be067967bb44c323ce9988d43e97e9259384fb817c970cb2e3c8d8b852f5159` |

These are local release candidates, not published or newly installed native
artifacts. Earlier native checks below cover the layout/settings candidate;
the final manual-refresh button still lacks native interaction acceptance.
RBN changes, release documentation, and personal packaging are exempt from
CWT upstream synchronization; contest runtime behavior is unchanged.

## Manual RBN refresh — 2026-09-21 (unreleased)

Added **↻** beside Details in the existing status row. Layout tests at 320,
390, and 1366 logical pixels confirm separate touch targets of at least 44
pixels, no overlap with status text, and unchanged map bounds. Static SVG
previews were inspected at phone, desktop, and enlarged-text sizes; these are
fixture-based previews, not native acceptance screenshots.

Panel tests cover the manual 30-second cooldown, concurrent tap deduplication,
reuse on the host's post-event render, retained display choices, waiting for
the action to complete, offline state, and server-directed 429 backoff across
queries. The native host disables scene buttons while an awaited action is
pending; this was verified in source, not by clicking the installed app.

`mise run format` and `mise run check` passed: 411 tests in 30 files, lint,
typechecks, builds, and official packaging. The installed-kernel check passed
against Next 26.9.0 build 170. The local package has not been installed or
published by this verification. RBN-only changes require no CWT upstream sync.

## RBN refresh budget and visibility — 2026-09-21 (unreleased)

The panel now declares `tick:60`, matching its existing 60-second per-query
network cooldown. Deterministic panel tests exercise the real RBN client with
mock HTTP responses: reveal and placement recreation reuse the cache through
59,999 ms; a request is eligible at 60,000 ms; neither panel discovery nor time
passing without renders causes polling; returning after five minutes fetches
once without a catch-up burst.

`mise run format` and `mise run check` passed: 405 tests in 30 files, lint,
typechecks, official builds, and all package validations. The installed-kernel
check (`mise run verify-host n1rwj-rbn`) passed against Next 26.9.0 build 170.
This builds a local candidate; it does not install or publish it.

Host source and existing host test inspection confirm hidden-tab and hidden/paused
app suppression of repeat renders. The SDK has no device battery or lifecycle
API. See the [source evidence and exceptions](RBN-SVG-MIGRATION.md#why-the-refresh-model-works):
a selected panel can receive an initial render while the app is hidden, and
started renders/requests are not canceled when hidden. Native screen-lock and
background behavior were not runtime-tested, and the host's Flutter tests were
not run here. These RBN-only changes do not affect CWT and require no upstream
CWT synchronization.

## Compact RBN layout and README captures — 2026-09-21 (unreleased)

Installed the compact-layout local RBN **0.3.2** candidate through
**Features & Extensions → Install from file** in published **Ham2K Next 26.9.0
build 170**. The update dialog identified version 0.3.2 and the existing
`vailrerbn.com` network capability. This is not a published release artifact:
**261,712 bytes**, SHA-256
`a64f6ca88fbe83bdd3f5c452832cf8bc603354e41bcad06d4cf848fa0f3d8416`.

Native macOS checks and screenshots used the existing empty W8CAR/TEST
operation, temporarily observing WG1V with a 60-minute window and FN42FK origin:

- Desktop rendering showed the map beside the receiver table, a two-line
  status/filter summary, one footer, and no in-panel view or band dropdowns.
- The host tune dialog exposed **View** and **Band**. Saving **Map**, then
  **Receivers**, changed the narrow placement to a full-height reception map
  and paginated receiver cards respectively.
- Live Vail reports populated 14 receivers and FT4 rows. The details button
  retained its warning indicator for an unlocated receiver.
- Saved four native screenshots for the README: desktop, narrow map, narrow
  receiver list, and tune settings. See the [capture record](images/README.md)
  for dimensions and timestamps. No static previews substitute for these images.
- Restored the original overrides, report window, and view in both layout
  placements. The operation remained at zero QSOs; no contacts or spots were
  submitted. The updated RBN candidate remains installed.

`mise run check` passed **403 tests across 30 files**, lint, TypeScript checks,
official builds, and package validation. Deterministic tests cover tune-form
choices, configuration persistence, map space, safe bounds, scaled text, and
paginated details. Native coverage is macOS only; physical phone and Linux
checks remain outstanding. RBN-only changes require no CWT upstream sync.

## RBN control preferences — 2026-09-21 (unreleased)

Installed the local RBN candidate through **Features & Extensions → Install
from file** in published **Ham2K Next 26.9.0 build 170**. The native
**Check for Updates…** dialog reported that this was the newest available
version; no host update was available. The installed-extension list confirmed
RBN **0.3.2**, enabled. This is a working-tree candidate, not a published
0.3.2 release artifact: **262,210 bytes**, SHA-256
`cd6a7a9cf55c05b5b0f9a4a6b8be132ce2b2868a26746b872474ae469c117499`.

Native macOS checks used the existing empty `W8CAR/TEST` operation:

- Selected **Map** in the panel, opened its settings, changed **Default band**
  from **All bands** to **15m**, and saved. The panel retained **Map** and
  displayed **15m**, although the saved default view remained **Map and
  receivers**. This reproduces the reported settings-save sequence.
- With no recent W8CAR reports, the panel's band dropdown opened and offered
  **All bands** plus all eleven bands from **160m** through **6m**. Selecting
  **20m** directly changed the filter and retained Map.
- Temporarily watched public **WG1V** reports with a **60-minute** window and
  explicit **FN42FK** origin, the registered grid returned by Vail. The
  operation retained its `/TEST` identity. Selecting **40m** directly displayed
  **14 receivers**, one band, and an estimated **6,008 km** maximum distance.
  **Map + list** showed FT4 receiver rows; selecting **10m** removed receivers
  from both surfaces and displayed **No 10m reports in this time window**.
- Selected Map again, changed the saved default band to 40m, and saved. At
  **23:53:53 UTC**, the panel retained Map and displayed the populated 40m map.
- An automatic refresh advanced **Checked 23:53:53 → 23:55:00 UTC** while
  preserving Map and 40m, with the same 14 receivers.

Restored the test panel's original W8CAR / EN81OK overrides, 15-minute window,
All bands, and Map + list view. The updated RBN candidate remains installed.
The operation stayed at **zero QSOs** with a blank draft; no spots or contacts
were submitted. No host source changes were needed.

`mise run check` passed **402 tests across 30 files**, lint, TypeScript checks,
official builds, and package validation. `mise run verify-host n1rwj-rbn`
also passed against the running build 170 kernel. A separate static preview
made a successful live HTTP request for W8CAR; native interaction evidence
above comes from the installed app, not that preview.

This verification covers macOS; physical phone interaction remains untested.
Changes are confined to RBN, so no CWT upstream synchronization is required.

## Vail ReRBN HTTP migration — 2026-09-21 (unreleased)

The RBN panel now requests CW, RTTY, FT8, and FT4 reports through the
[Vail ReRBN HTTP API](https://vailrerbn.com/docs/endpoints). Each visible query
fetches one bounded snapshot per minute; exact callsign filtering, portable
suffixes, expiry, failed-refresh caching, response limits, and shared rate-limit
backoff are covered by deterministic tests. Receiver coordinates use Vail's
HamDB grids and are explicitly described as approximate lookup locations.
The `n1rwj-rbn` extension and `my-signal` panel identities are unchanged.

`mise run check` passed **392 tests across 30 files**, lint, TypeScript checks,
official builds, and package validation. This working-tree build retains the
**0.3.2** version label; it is not a published release artifact. The local RBN
archive is **262,131 bytes**, with SHA-256
`5fd4bc44f751f73692bb47749e7d8561e27de4e6e4cf2b3ccd04654420317800`.

At 23:25 UTC, the built ES2020 bundle ran through the installed **Ham2K Next
26.9.0 build 170** JavaScript kernel with a synthetic 1280×800 panel environment:

| Observed call | Visible mode | Scene reports | HTTP request | Complete render |
| --- | --- | --- | --- | --- |
| WG1V | FT4 | 14 receivers, 1 band | 200, 230 ms, 2,785 bytes | 384 ms |
| VE3KI | FT8 | 14 receivers, 2 bands, 19 receiver/band/mode rows | 200, 189 ms, 3,534 bytes | 342 ms |

Each render made one request to `/api/v1/spots` with `call`, Unix-second
`since`, and `limit=500`. Both stayed below the five-second host budget.
The memory-only `/TEST` operations used explicit origin grids returned by
Vail (FN42FK and EM77UR); these lookup grids do not verify transmitter
locations. No native operation, QSO, or spot was created.

Local evidence is `dist/rbn-vail-ft4.svg` and `dist/rbn-vail-ft8.svg`, with
matching scene and provenance JSON files. Kernel execution establishes bundle
compatibility and live HTTP parsing, not native UI rendering or interaction.
The changed package has not been installed in the native app for this check.
This change is confined to RBN and its preview tooling; CWT behavior is
unchanged, so no CWT upstream synchronization is required.

## Published 0.3.1 native screenshot refresh — 2026-09-21

Downloaded all four `.h2kext` bundles and their checksum files directly from
[the published v0.3.1 release](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases/tag/v0.3.1).
All checksums matched. Installed these exact downloaded archives through
**Settings → Features & Extensions → Install from file** in published
**Ham2K Next 26.9.0 build 170**. The installed-extension list confirmed
**0.3.1** for CWT, MST, SST, and RBN.

| Published bundle | SHA-256 |
| --- | --- |
| `n1rwj-cwt-0.3.1.h2kext` | `d71b9a66fdd8636238fe52654aa35caee23f1c691838b75453f513373ea03558` |
| `n1rwj-mst-0.3.1.h2kext` | `fdf67b8493a6213368d81eaf4a518b419a4f980a4deec6a4d119b6c181626f78` |
| `n1rwj-sst-0.3.1.h2kext` | `bcf57b0bdb0aadc4f317269a172ea555fcc806a177dd94778f92e7a3b84608d4` |
| `n1rwj-rbn-0.3.1.h2kext` | `2e237b6aded0574ccffd10fd7ba1c52caf62a8f7ee67b680c1ad2967d875cf42` |

Reopened each existing contest test operation and captured its session setup,
exchange controls, saved contacts, and score. Contacts and contest settings
were not changed. The refreshed images are listed in the
[screenshot record](images/README.md).

For RBN, the public POTA feed at 19:21 UTC listed **W8CAR** at **US-9496,
Resthaven State Wildlife Area**, locator **EN81OK**. An empty native
`W8CAR/TEST` operation with the **Testing** tag watched this public callsign
using explicit callsign and map-origin overrides. The desktop panel displayed
live reports, distinct land/water colors, boundary geometry, geographic and
receiver labels, the diamond station marker, and a receiver table. The capture
showed **27 receivers**, **one band**, and **7,977 km** maximum distance.
No QSOs or spots were created.

This establishes native installation and rendering of the published packages
and supersedes the earlier pending desktop visual check below. It is a focused
screenshot verification, not a repeat of every contest behavior or RBN control
test. After unlocking the Mac, compact map and receiver-card captures were
completed in a 449×768 window with the same published bundle and overrides.
The native view selector switched between **Map** and **List**; both captures
showed 30 receivers on one band and 7,977 km maximum distance. The desktop
window size was restored afterward. Physical phone, Linux, CPU, and battery
checks remain outstanding.

## Release 0.3.1 — 2026-09-21

[v0.3.1 is published on GitHub](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases/tag/v0.3.1)
from signed commit
[`c1327670`](https://github.com/rwjblue/ham2k-n1rwj-extensions/commit/c132767012a4a9f0b94e392ace32f772fe60c59e).
[Main CI passed](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35636851999)
and the [release upload job succeeded](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35636926897/job/106456515162).
All four bundles and four checksum files are available. A local
`mise run release:catalog v0.3.1 --dry-run` downloaded and validated all eight
assets without submitting anything. The published RBN archive is **261,909
bytes**, with SHA-256
`2e237b6aded0574ccffd10fd7ba1c52caf62a8f7ee67b680c1ad2967d875cf42`.

The [catalog job failed](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35636926897/job/106456635007)
at `2026-09-21T18:13:17.854Z`: its first `n1rwj-cwt` upload received HTTP
**403** and a Cloudflare challenge. No submission was accepted, and subsequent
extensions were not attempted. GitHub downloads work; catalog acceptance is
not established. See [publishing and recovery](PUBLISHING.md) before retrying.

The 0.3.1 RBN map adds bundled state/province boundaries at regional scales,
sparse country labels, distinct land/water colors in both themes, a diamond
station marker, and quieter reception paths and distance rings. Receiver labels
take priority over geographic captions. Collision checks reserve the attribution
footer and empty-report message, and label density changes gradually with size.

`mise run check` passed **385 tests across 30 files**, lint, TypeScript checks,
official builds and package validation. New checks cover crowded North American
and European layouts, compact sizes, enlarged text, resizing near 420 pixels,
theme contrast, and 500-receiver SVG layer budgets through 4096×4096. This work
affects RBN and its geography-generation tooling; it does not change CWT behavior.

The public POTA feed at 17:48 UTC listed **N5ILQ**, **US-10658, Lake Carl
Blackwell Wildlife Management Area**, grid **EM16JC**. Static previews at
18:01–18:02 UTC observed that public call with a memory-only `N5ILQ/TEST`
operation and a 30-minute window. They showed 26 receivers on one band, with
a maximum reported distance of 3,076 km. No native operation, QSO or spot was
created. The built ES2020 bundle ran through the installed published Next 170
kernel; it was not installed in the native app for this check.

Local evidence is `dist/rbn-map-improved-desktop.jpg` (1280×800 panel),
`dist/rbn-map-improved-compact.jpg` and `dist/rbn-map-improved-dark.jpg`
(424×644 panels). Each screenshot includes an additional static-preview footer.
Matching SVG, scene JSON and provenance JSON files are beside the screenshots.
These ignored files are local evidence, not repository assets. The desktop scene
used 120 layers and 115,991 bytes of formatted JSON; compact scenes used 28 layers
and 82,212 bytes. These static checks do not establish native rendering, control,
CPU or battery behavior. Native visual acceptance remains outstanding because
computer use reported that the Mac was locked and could not unlock it.

The preview-stage archive carried version **0.3.0**, but was **not the
published 0.3.0 artifact**. It was 261,912 bytes with SHA-256
`074c3c8385b880eacd0a29919a8ec7d935ee6c5df92453562a909a9d1f3e332b`.
Release preparation subsequently synchronized every workspace to **0.3.1**.
The release checks above passed after that version change; the preview evidence
predates it. Native visual acceptance of the refinement remains pending.

## Release 0.3.0 — 2026-09-21

[v0.3.0 is published on GitHub](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases/tag/v0.3.0)
from signed commit
[`5c039254`](https://github.com/rwjblue/ham2k-n1rwj-extensions/commit/5c039254e0d427caebd328a6375b539d5d197110).
All four extension bundles and their four SHA-256 files were uploaded, and
the downloaded release assets matched their checksums.

- [Main CI passed](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35631933388):
  **372 tests across 28 files**, lint, TypeScript checks, official builds and
  package validation.
- The local release dry run passed the same checks plus synchronized-version
  and asset/checksum validation. The
  [release upload job succeeded](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35631976696/job/106440097548).
- The published RBN archive is **124,085 bytes**, with SHA-256
  `4df0bd93f911c8e76b1d49fe02f39dc0a982807fa5296b233c006a2ea4995a04`.
- Native RBN acceptance used published **Ham2K Next 26.9.0 build 170** and
  the candidate archive labeled **0.2.0** identified below. Version
  synchronization subsequently produced the released 0.3.0 archives; those archives were not
  separately reinstalled for native acceptance. The screenshots below record
  the tested 0.2.0 package. Physical phone and Linux testing remain outstanding.

The [catalog job failed](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35631976696/job/106440223935)
on the first `n1rwj-cwt` upload: HTTP **403**, a Cloudflare challenge, at
`2026-09-21T17:26:41.297Z` (Ray ID `a3eac6bb4a526b25`). No upload was accepted
by that run and later extensions were not attempted. The earlier v0.2.1
attempt encountered the same failure. GitHub downloads are available, but
these attempts do not establish catalog submission, review, or channel
acceptance. See [publishing and recovery](PUBLISHING.md) before retrying.

## RBN SVG migration — 2026-09-21

The current RBN implementation returns native `svgScene` content. The HTML
renderer and its shared hidden basemap machinery have been removed. The
extension preserves its `n1rwj-rbn` / `my-signal` identities and saved config.
It builds one selected-band map, native text, native dropdowns, and a paginated
receiver table/cards. Per-placement choices survive ticks and reset when
operation/config changes; saved defaults survive runtime restarts.

The updated [published panel contract](https://catalog.ham2k.net/docs/hooks)
and SDK 0.5.0 support this design. The host source inspected for this work was
`cad0bc2cc78ba5f2a8a7e8f34423fa48bfc8a071`; SVG scenes first landed in
`e4c149e9cf6083b0369c67b39f4988b263508443` on September 19. Existing contest
and award program UI used native Markdown/forms/scoring rows. The
Radio, Solar and Weather dashboard examples use `svgScene`, which is the
relevant comparison for this map. The scene API is still experimental.

The native checks used the unmodified published **Next 26.9.0 build
170**, installed by the user. Its binary includes `SvgSceneView`, scene
validation, placement identity, render environment and event handling. The
extension renders live RBN data and native controls in that app. Its kernel
SHA-256 is
`b001f0c0ede236f2dfb5a24788aaaebd49709bb193ff487b90337b115790f743`.

The earlier **build 169** updater initially reported that it was up to date.
That native binary contains HTML renderer names but no scene renderer symbols.
The migrated package visibly showed **RBN · App update needed** in an empty
`K8BTU/TEST` operation, verifying the missing-environment/placement compatibility
path before any RBN request. Evidence is `dist/rbn-svg-next169-compatibility.png`.
That temporary placement was removed and the original QSOs / Info / Spots / Map
layout restored. Build 170 was subsequently installed for the checks below.
A successful kernel run alone does not certify native scene support; static
previews deliberately supply an environment and placement identity.

The prior host experiment was preserved locally as commit **ef546297**
on **codex/tmp-html-panel-refresh**. Primary `halo` was restored to `main` at
`cad0bc2c`, matching `origin/main`, with its pre-existing untracked `mise.lock`
left alone. The old experimental worktree was detached at the same main commit
and clean. No host push or PR was made; the Dev app was stopped. Subsequent
native checks used the published Next application only.

The static preview task executes the actual built ES2020 extension using the
installed Next kernel, then exports a scene JSON plus an SVG approximation.
The SVG explicitly says it is a static preview with inactive controls. It
cannot verify Flutter text measurement, native menus, touch, or semantics.
Before native build 170 testing, at 16:33 UTC, live public POTA spots listed
W9MET at US-6298, Crooked Lake Wildlife Area, EL97er. A memory-only
`W9MET/TEST` observation returned 22 receivers in 735 ms, including RBN's
schema-version retry.
The preview candidate at 16:37 UTC showed 24 receivers. The 1366×900
scene rendered in 442 ms (118 layers, 72,022 bytes of formatted scene JSON),
the 390×844 map in 301 ms, and the dark 390×844 list in 337 ms. These are
Node/kernel timings including live network access, not native frame or CPU
measurements. Static browser screenshots are `dist/rbn-svg-desktop.png`,
`dist/rbn-svg-phone-map.png`, and `dist/rbn-svg-phone-list.png`; each carries
a visible static-preview label. Their scene JSON and provenance are beside them.
Paths under `dist/` in this record identify ignored local evidence, not files
shipped in the repository. The published Next 170 screenshots linked below
are stored in `docs/images/` and can be viewed from a fresh checkout.

`mise run check` passed **372 tests across 28 files**, Biome, all TypeScript
checks, official builds, and official package validation. The installed-kernel
verification passed registration and shared-dependency checks against build 170.
The historical **0.2.0**, **124,081-byte** native-test archive installed in that
app has SHA-256
`0a4531f93d82ae3991fa4097101dbb944b60b5375f2652c07626b92c02d7e106`.
The earlier build-169 compatibility candidate was 124,067 bytes with SHA-256
`ab26cd7ac49d738b7f0e2c6a2ae0fba2a2626e8ba3edcf9676ccb084d23a6bc0`;
its 370-test result predates the final layout regressions.

Release preparation subsequently synchronized all workspace versions to
**0.3.0**. The release results are recorded above; the native evidence below
is for the 0.2.0 archive identified here.

### Published Next 170 native acceptance

The public POTA feed at 17:05 UTC listed W9MET at **US-6298, Crooked Lake
Wildlife Area, EL97ER**. A clearly labeled `W9MET/TEST` operation watched
that public callsign through the explicit panel override. The operation
remained empty with **zero QSOs**; no spots, POTA posts or transmissions
were made. Native checks established:

- Live reception map and receiver table rendered in a **1437×768** desktop
  window. The final native-test package showed 26 receivers on two bands,
  including descending SNR readings of 26, 26, 25, 19 and 18 dB after 17:13 UTC.
- The native **SNR** sort menu and direction button worked. Earlier live
  readings sorted as 25, 24, 24, 21 and 21 dB descending, then 2, 3, 4, 4
  and 4 dB ascending. Next page showed reports **6–10 of 23**.
- The **30m** filter updated both the map and list to three receivers.
- An automatic refresh advanced **Checked 17:09:30 → 17:10:30 UTC** while
  preserving ascending SNR and page 2. This exercises the scene event and
  tick paths in the published app, without any HTML host patch.
- Native compact testing used a **448×770** macOS window. Map/List switching,
  SNR sorting and paging worked; the list displayed **3–4 of 28** on its
  next page. Report details wrapped into readable text and showed **1/2**
  pages rather than clipping the longer explanation.
- Native testing found that an approximately 477-pixel-wide combined pane
  could allocate a map while leaving no report row. The final change reserves
  enough height for a complete receiver card, controls, gaps, and pagination.
  When both views cannot fit, it shows receiver cards with a **Map**
  hint. The final package was retested in the native narrow pane and displayed
  two cards instead of empty list space.

The following are **screenshots of published Next 170**, separate from the
static preview artifacts and earlier custom Dev screenshots:

- [Desktop map and table](images/rbn/rbn-next170-desktop.jpg) — 1437×768.
- [Compact native map](images/rbn/rbn-next170-phone-map.jpg) — 448×770.
- [Compact native receiver cards](images/rbn/rbn-next170-phone-list.jpg) — 448×770.

The compact screenshots exercise the phone-oriented layout inside the macOS
app; they do not represent physical phone hardware. Both temporary global
layout changes were then removed and saved. The compact layout was restored
to QSOs / Spots / Map and the desktop layout to QSOs / Info / Spots / Map.
The original desktop divider at 957 and window dimensions of 1437×768 were
restored. The TEST operation was left with zero QSOs and a blank draft.

The design avoids a WebView, contains no animation, and generates only the
visible map and list page. This removes the HTML/Linux WebView dependency;
it is not a measured claim about native CPU or battery savings. Tests bound
scene layers, per-layer strings, total artwork, native controls and menu
sizes, including 500 receivers and phone dimensions. Physical phone and
Linux runtime testing remain outstanding. RBN/tooling changes are exempt
from CWT upstream synchronization; no CWT behavior changed.

See [migration and maintainer notes](RBN-SVG-MIGRATION.md) for reproduction,
implementation choices, and additional device acceptance steps.

## Earlier RBN HTML prototype — 2026-09-21

The independent `n1rwj-rbn` panel includes bundled Natural Earth vector
geography, station-centered reception paths, band filters, and sortable
receiver reports. The list becomes cards at phone widths. There are no
map-tile requests. Changes to packaging only add optional per-extension
assets and preserve the existing root notices. These are RBN and general
monorepo tooling changes, exempt from the CWT upstream synchronization rule;
no CWT behavior changed.

- `mise run check` passed **359 deterministic tests across 28 files**, lint,
  TypeScript checks, official builds, and official `.h2kext` validation,
  including the snapshot-age stability change.
- `mise run verify-host n1rwj-rbn`: the bundle registers its panel and
  satisfies shared-library constraints in the installed Ham2K Next
  26.9.0 build 169 JavaScript kernel.
- `mise run rbn:preview --call K8BTU --grid EM99DQ --minutes 60`:
  at 14:27:53 UTC, the actual bundle returned 34 receiver rows in 732 ms
  using that installed kernel under Node VM. Metadata, the HTTP 400
  version handshake, and the successful retry were exercised live.
  POTA's public activator feed listed K8BTU at US-5641, Jesse Owens
  State Park, EM99dq. The preview operation is `K8BTU/TEST`, titled
  `RBN TEST — observing K8BTU`; the panel header also says TEST observation.
- The final live preview at 14:48:08 UTC observed KG2GL at POTA US-0751,
  Paterson Great Falls National Historical Park, FN20vw. It returned 26
  receiver rows in 560 ms. This uses the final bundle, whose `.h2kext`
  SHA-256 is `b8975894b6df23df3e67be7a034b99f4d3a0f7302c554d70fe6e2727617d02d7`.
- Browser testing of actual extension live-data HTML output at 1366×900,
  390×844, and 320×740:
  inspected map/list layout, confirmed no horizontal overflow, changed
  band and view controls, and verified both SNR sort directions using
  the visual row positions. Screenshot artifacts are
  `dist/rbn-desktop.png`, `dist/rbn-phone-map.png`, and
  `dist/rbn-phone-list.png`. These are browser screenshots of a frozen
  live-data snapshot, not screenshots from the native Ham2K app.
- A synthetic actual-bundle benchmark with 500 globally distributed
  receivers across 11 CW bands rendered in 244–270 ms, with two shared
  basemap definitions and about 1.56 MB of HTML. Compared with rendering
  separate geography for every band, this cut render time from 1.7–2.3
  seconds and HTML size from about 4.95 MB. This was measured on this Mac,
  not on physical phone hardware.

After the Mac was unlocked, `n1rwj-rbn` installed successfully through the
native Ham2K Next 26.9.0 build 169 installer. A separate operation was
created with the clearly labeled station callsign `K8BTU/TEST`, watching
K8BTU's public reports from EM99DQ. No contacts were logged, and no spotting
or POTA posting occurred. The native panel remained blank; the diagnostic
screenshot `dist/rbn-native-initial-load-blocked.png` records that failure,
not a successful native rendering.

The initial investigation attributed the blank panel to the host cancelling
the initial `about:blank` navigation. The source supports that mechanism, but
an independent minimal native reproduction and callback trace are still
needed to establish it in the installed Next binary. A separate source-level
defect passes HTML only as `initialData`, without updating the mounted native
document when an extension returns changed content. The exploratory host
patch is isolated in `~/src/github/ham2k/halo-html-panel-refresh`, with a
local artifact at `dist/ham2k-html-panel-refresh.patch`; it includes additional
state-preservation behavior and is not a ready-to-merge recommendation.

The final host patch passed 17 focused widget/state tests and scoped Dart
analysis. An earlier revision also passed all 3,568 app tests selected by
the host's changed-test gate; this is not its full merge gate. A native
WKWebView harness exercised the actual state-preservation scripts in an
isolated content world, with both production JavaScript permission flags
set to false. Sort and scroll survived replacement, explicit changed defaults
took precedence, and an embedded extension script remained unexecuted.
Native app testing then exposed the plugin's unterminated print-function
prelude: prepending an IIFE accidentally invoked print. Both fixed host
scripts now start with a semicolon, with an executable regression covering
that exact prelude shape for capture and restore.
The separate Dev build combines the patched public Dart host sources with
the installed Next JavaScript kernel, so it is a local hybrid test build,
not the published Next application.

The Dev app's generated shared-library metadata also matches that exact
Next kernel. The app artifact sets `HALO_DEV_DATA` through `LSEnvironment`;
the host ignores a Dart define for this particular flag. Its open database
was verified under `/private/tmp/ham2k-rbn-test-data/`, with sync disabled.
An initial launch without that environment created a separate normal Dev
container and imported existing cloud logs. No contacts or layouts were
edited there; Next's operator, database, and preferences stayed unchanged.
The isolated test operation is `KG2GL/TEST`, titled
`RBN TEST - observing KG2GL`, with zero contacts.

Native verification in that final hybrid Dev app confirmed initial map/list
rendering and subsequent live-data updates. **Map + list**, **Map**, and
**List** controls worked; SNR sorting was verified in both directions,
including descending rows of 31, 27, 26, and 25 dB. The app was checked at
a 1327×768 desktop window and a 446×834 compact window, the minimum width
available for this macOS app. The compact layout shows the receiver cards
and phone map treatment. Browser checks at 390×844 and 320×740 provide
additional coverage below the native Mac minimum; no physical phone was
used.

Native screenshots are `dist/rbn-native-desktop.png`,
`dist/rbn-native-phone-map.png`, and `dist/rbn-native-phone-list.png`.
They show `KG2GL/TEST` and the panel's **TEST observation** label. The
desktop capture shows Map + list with descending SNR, data checked at
15:18:00 UTC, 23 receivers, one band, and a farthest receiver of 5,522 km.
These captures are separate from the browser snapshot images listed above.
No contacts were logged and no spots or POTA reports were posted during
the Dev verification. The original published Next test remained blank;
the successful checks apply to the local patched hybrid Dev app, not an
exact-source control for the published Next binary.

Native refresh persistence was then verified with **List** and descending
**SNR** selected. After scrolling to W5ZN, KD7EFG, TI7W, and AA4PA, an
automatic update advanced report ages from 8 to 9 minutes and from less
than 1 to 1 minute while preserving the exact scroll position. Returning
to the top showed **Data checked 15:17:00 UTC**, advanced from 15:15:51,
with List and the descending SNR selection still active and leading rows
of 30 and 29 dB. No print alerts appeared. This establishes view/sort/scroll
retention in the complete native app; the separate harness additionally
covers changed defaults and removed-option fallback.

### Follow-up HTML investigation

Current source references were fetched and inspected without changing either
host checkout: host `cad0bc2cc78ba5f2a8a7e8f34423fa48bfc8a071` and standalone
extensions `ad875f3b02af417624546a9fdaab52ea01ccc5cd`. The earlier Dev build
used September 1 host sources; the HTML implementation remains unchanged in
the September 21 source. Current contests/programs render through native
scoring rows, Markdown, and forms. Current Radio/Solar/Weather dashboards
return `svgScene`; their refresh behavior does not exercise the HTML WebView.
The official `k2hrc-radio` sample does return HTML but is not bundled in Next.

The source audit traced the missing HTML update path through the host,
vendored plugin, and Flutter platform-view lifecycle. First-load navigation
cancellation remains a separate, narrower hypothesis for the blank screen.
The previous patch's sort/scroll retention is an enhancement, not an existing
HTML contract requirement. Its initial-load error handling and navigation
allowance also need further review before adoption.

A network-free counter extension (HTML fragment, full HTML document, and
Markdown control) and the unchanged official HTML sample were built and
packed. Both registered and returned changing content through the exact
installed Next JavaScript kernel. Minimal native checks could not yet run
because computer use reported the Mac locked. The local, ignored report and
reproduction package are in `dist/html-panel-investigation/`; the report
explicitly distinguishes source evidence, prior Dev observations, and
pending native checks. No host commits, pushes, PRs, or external reports
were made during that investigation. The later user-authorized local backup
commit is recorded in the SVG migration section above.

That investigation also reproduced an independent RBN bug: the host can omit
`args.operation` on Home/Logs, but RBN dereferences it. Rendering with an absent
operation fails both with and without explicit watch/grid overrides; an empty
operation object or a TEST operation produces visible HTML. The exact-kernel
reproduction is recorded locally. This is an extension issue requiring a
defensive empty-context path; it does not explain the original operation-view
blank. Production extension source was not changed during the investigation.
The SVG migration subsequently fixed the absent-operation bug and added a regression test.

## Monorepo release 0.2.0

Verified September 20–21, 2026, using Power Logger 26.9.0 build 169 at
`/Applications/Ham2K Mac Logger (Next).app`. This is a permanent repository;
only the personal CWT extension retains the upstream transition arrangement.

`mise run check` passed lint, strict TypeScript checks (including executable
tasks), **264 tests across 19 files**, all three builds, and official packaging
validation. Tests cover shared N1MM parsing/downloads, bounded contest history,
CWT regressions, MST/SST schedules, exchanges, scoring and exports, generated
bundles, extension scaffolding, and release version/asset validation.
[Main CI passed](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35555147399)
for the monorepo implementation. The installed-kernel check registered all
22 hooks across CWT, MST, and SST and accepted their declared shared libraries.
It uses the kernel identified below under Node and is separate from native UI
testing.

All three `0.2.0` bundles were installed in the native app. CWT updated from
`0.1.2` while retaining its settings, cached data, and existing operation.
The following native checks used dedicated operations with station
`N1RWJ/TEST` and the native **Testing** label; they were synthetic contacts,
not on-air QSOs:

- **CWT:** reopening the existing three-contact test operation retained its
  `3 × 3` score. A fresh `K0ACP` draft suggested `ARTHUR / 3806`, with both
  fields identified as current-operation history, despite the conflicting
  file name and a separate MST contact for the same callsign. The draft was
  wiped without saving.
- **MST:** automatic N1MM discovery downloaded 7,772 calls, file date
  `2026-09-14`, with six nonfatal parser warnings. The selected session was
  `2026-09-21 1300z`, with sent name `ROB` and LP power. Saving `K0ACP` at
  `13:05z` on 20m CW retained sent serial `1` and received exchange
  `42 ARTHUR`; the operation displayed `1 × 1`. After reopening it with the
  final build, a fresh `K0AD` draft showed sent serial `2`, an empty received
  serial, and the suggested name `AL`. That draft was wiped.
- **SST:** automatic discovery downloaded 15,643 calls, file date
  `2026-09-15`, with one nonfatal warning. The selected session was
  `2026-09-25 2000z`, with sent exchange `ROB RI` and LP power. Saving
  `K1USN / WATSON / MA` at `20:05z` on 20m CW retained those values and
  displayed `1 × 1`.
- **SST corrections and clearing:** after deliberately clearing the location,
  changing `K1USN` to `K1USN/P` left that field blank. Changing the name to
  `WATT` and then the call to `K1USN/M` retained the correction and blank
  location. After wiping, a fresh `K1USN` draft again suggested `WATSON / MA`.
  Replacing the call with `ZZ0ZZZ` without editing the exchange cleared the
  name and suggested `DX` after lookup completed. All these drafts were
  wiped. This exercises the native touched-control and clearing contracts,
  not a controlled delayed-network race.
- The final MST/SST builds replace custom internal alert keys with readable
  labels. A fresh SST draft visibly displayed **Outside selected session**;
  built-in alerts continue to use the host's localization.
- **Exports:** native ADIF and Cabrillo exports were written locally and
  inspected. MST ADIF used `ICWC-MST`, `STX=1`, `SRX=42`, and complete
  exchanges `1 ROB` / `42 ARTHUR`; its Cabrillo QSO used `ROB 1` /
  `ARTHUR 42`. SST ADIF used `K1USN-SST` and `ROB RI` / `WATSON MA`;
  Cabrillo used `CONTEST: K1USNSST` and the same name/location exchanges.
  Both Cabrillo files used `CATEGORY-POWER: LOW` and omitted RST fields.
  No contest submission was uploaded. Test exports stay in ignored `dist/`.

The native checks establish installation/update, live data discovery, saved
exchange controls, representative scores, serial progression, input protection,
and native exports. Cross-band multiplier rules, session boundaries, history
edits/deletions, and failed-refresh recovery are covered by deterministic tests;
they were not all repeated in native MST/SST operations. OS-offline use and a
controlled slow-lookup race remain unverified in the native app. Earlier CWT
failed-refresh/restart observations below remain historical evidence.

Upstream-relevant N1MM metadata fixes were also pushed to the source branch of
[Ham2K/extensions PR #1](https://github.com/ham2k/extensions/pull/1), with its
115 tests, typecheck, build, and official packaging checks passing. Monorepo
organization, personal release tooling, and the new MST/SST extensions do not
change upstream CWT behavior and do not need matching changes in that PR.

## Personal backport 0.1.2

The backport from [Ham2K/extensions PR #1](https://github.com/ham2k/extensions/pull/1)
passed `mise run check`: **190 tests across 13 files**, Biome, TypeScript,
build, and official packaging validation. Its focused history regression
failed against the previous code and passes with the fix. It verifies both
full and resumed scoring during a pending initial log read, including waiting
for refreshed membership before requesting targeted callsign history.
Additional coverage checks English/Spanish settings and provenance, preserves
the personal cache identity, and leaves unrelated input suggestions intact.

`mise run verify-host` also accepted 0.1.2 against the installed Power Logger
26.9.0 build 169 kernel, registering all eight hooks. This runs the installed
JavaScript kernel under Node; **0.1.2 has not been tested in the native UI**.
The native observations below describe 0.1.0 and 0.1.1.

## Earlier verification

Verified September 19, 2026. `mise run check` runs Biome, TypeScript,
deterministic Vitest tests, the published builder, and official `h2kext-pack`
validation. Local `0.1.1` validation passed **182 tests across 11 files**,
lint, typechecking, build/pack validation, and the installed-kernel check.
Tests cover parsing/corruption, precedence/suffixes, offline replay,
failed replacements, history edits/deletes, native suggestion contracts,
saved exchanges, scoring, and ADIF/Cabrillo. Bundle tests evaluate the generated
IIFE with pinned shared libraries and a simulated bridge, not Flutter/native UI.
CI passed for commit `3913d235` in
[run 35452432500](https://github.com/rwjblue/ham2k-cwops-cwt-ext/actions/runs/35452432500).

The live default-source path was exercised separately: category discovery,
entry GET, dynamic form POST, and parsing succeeded with 7,155 calls. Its
SHA-256 matches the observed file in [CALL-HISTORY.md](CALL-HISTORY.md). Tests
do not depend on this live service.

## Installed app

Earlier native verification used `/Applications/Ham2K Mac Logger (Next).app`,
whose identity at that time was **Power Logger 26.9.0, build 169**. The
installed-kernel compatibility check accepts its shared dependencies and
registers all eight extension hooks after the manifest's LiquidJS requirement
was corrected to `^10.28.0`. The verifier selects the running app, or the
latest installed build when none is running; an explicit `.app` path can
select another installation.

Installed kernel SHA-256:
`98dc8c6577786465c7811f4a87796c9d399aad97f3e0ce64efa235aaf22c4255`.

Verified `n1rwj-cwt-0.1.1.h2kext` SHA-256:
`b54b19ba1ccb8eddca31d9b3ac405b8ec9e0aa1ad8b518755c3382b298e7e9be`.

The following were confirmed in the native UI:

- The built-in **CWops CWT** extension is off and custom **N1RWJ CWT 0.1.1**
  is on. The initial logging/export/cache checks below used `0.1.0`; the
  `0.1.1` update adds history operation-identity and source-URL validation
  fixes, and its current-operation precedence was checked separately below.
- Initial **CWT Prefill** settings reported 7,155 downloaded calls, file date
  `2026-09-17`, download time `2026-09-19T15:33:12.600Z`, and one nonfatal
  parser warning. The resolved source was
  [CWOPS_3992-AAA.txt](https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS_3992-AAA.txt).
- A dedicated operation, **CWT extension validation (TEST)**, used station
  `N1RWJ/TEST` and the native **Testing** label. Its CWT session was
  `2026-09-23 1300z`, with sent exchange `ROB CWA` and LP power.
- Entering `K0ACP` prefilled `ART` / `3806`, `AA0AI` prefilled `STEVE` / `IA`,
  and `AA4NO` prefilled `BILL` / `CWA`. All three contacts were saved and their
  exchange values were confirmed in the native log rows. The visible CWT
  score was `3 × 3 = 9`.
- Entering `N4DL` prefilled `GARY` and left **Nr** blank, even though the host
  separately knew the station's `FL` state. This unknown-number contact was
  not saved.
- A fresh `K0AD` draft prefilled `AL` / `138`. After **Nr** was intentionally
  cleared with the keyboard and the call changed to `K0AD/P`, the completed
  lookup left **Nr** blank. The name was then edited to `ALAN` and the call
  changed to `K0AD/M`; after lookup, `ALAN` and the blank **Nr** remained,
  although the provenance note still offered the source exchange `Al 138`.
  This verified native protection of operator edits and clearing during
  those callsign transitions. It did not impose a controlled slow-network
  race. The draft was wiped without saving.
- The native export UI wrote three local files into `dist/`. The CWT ADIF
  and Cabrillo outputs were read and checked. ADIF contained
  `CONTEST_ID=CWOPS-CWT`, sent exchange `ROB CWA`, and received exchanges
  `ART 3806`, `STEVE IA`, and `BILL CWA`. Cabrillo contained all three QSO
  lines with those sent/received exchanges and `CATEGORY-POWER: LOW`.
  The checked files were
  `2026-09-19 N1RWJ-TEST for CWT-2026-09-23-1300 Testing.adi` and
  `2026-09-19 N1RWJ-TEST for CWT-2026-09-23-1300 Testing.log`.
  No external upload was performed.
- An unsupported local path, `/tmp/cwt-validation-missing-source.txt`, was
  used to trigger a failed native refresh. After quitting and relaunching the
  app, **CWT Prefill** still reported 7,155 records and the original download
  timestamp, `2026-09-19T15:33:12.600Z`. This confirms dataset retention
  across that failed refresh and restart. In the test operation after restart,
  a fresh unsaved `K0AD` draft prefilled `AL` / `138`, identified as
  `selected-file` data. The operating system was not taken offline.
- After that cached `K0AD` prefill, the callsign was cleared and replaced with
  `N4DL` without touching either exchange field. After lookup, the name became
  `GARY` and **Nr** was blank while the separate state remained `FL`. The old
  `138` was removed; accessibility inspection showed the clearing space.
- With `0.1.1` installed, the existing test operation was reopened. Its saved
  `K0ACP` contact had been corrected to `ARTHUR 3806`. A fresh `K0ACP` draft
  prefilled `ARTHUR` / `3806`, with both fields attributed to
  `current-operation`, while the source file still supplied `ART`. The saved
  row remained `ARTHUR 3806`. This confirms current-operation history taking
  precedence over a conflicting file name. The earlier `0.1.0` exports
  recorded `ART 3806` before that correction.
- The source setting was restored to blank automatic discovery before the
  `0.1.1` update. Refreshing the default category in `0.1.1` then succeeded:
  settings showed 7,155 calls, file date `2026-09-17`, download time
  `2026-09-19T15:54:42.936Z`, the same CWOPS_3992 source, and one nonfatal
  parser warning. This confirms normal discovery and refresh were restored
  after the deliberate failed-source test.

These observations establish native installation, source refresh, member,
nonmember, CWA, and unknown-number suggestions, saved exchange display,
representative scoring, native ADIF/Cabrillo exports, and cached suggestions
after a failed refresh and restart. They also verify current-operation history
precedence in `0.1.1`. OS-offline operation has not been verified.

SDK 0.5.0/types are the API reference. Native behavior for these earlier CWT
checks was inspected in a local checkout of the private Ham2K host repository
at commit `c726266a4ae72117396ce48255611374136fd374`, which predates some archive
behavior. SDK declarations alone do not certify a native host build as
compatible.

## Decisions and remaining limits

- Native touched-control tracking protects corrections and deliberate blanks.
  The callsign-transition checks above confirmed this in the native UI.
  Existing `qso.refs` values are not assumed to be operator input: they can be
  earlier guesses. The inspected host ignores empty suggestions. An ASCII
  space clears an **untouched** old suggestion and is trimmed out on save.
  The `K0AD` → `N4DL` transition above confirmed this ASCII-space convention
  for an **untouched** number suggestion in the native UI.
- Log one callsign at a time. The inspected host shares exchange refs across
  comma-separated call-list batches; each call would receive the same exchange.
  The extension cannot distinguish shared typed data from a previous prefill
  at that point, so batch entry is not supported for CWT exchanges.
- The inspected `getHistoryForCall` implementation returns at most five recent
  QSOs per exact/base call. Unrelated contacts can crowd out older CWT evidence;
  unlimited cross-operation history is unavailable through this API. History
  rows lack operation IDs, so scoring snapshots or a cached initial log read
  establish current-operation ownership. Fresh data prevents reuse of stale
  corrections and deleted contacts. Whole-log reads are shared/cached, not
  performed on every keystroke; the QSO being edited is excluded. When a
  matching current-operation contact is omitted by the targeted history cap,
  a full-log revalidation is shared/cached per call, returned-history signature,
  and scoring generation. This preserves older fields in the current operation
  without repeatedly reading its log. Native inspection found that lookup and
  control payloads omit the operation UUID while scoring payloads include it;
  `0.1.1` recovers that identity when exactly one indexed scoring operation
  matches the creation timestamp and station callsign. Missing or ambiguous
  identity does not promote contacts to the current-operation tier. This
  recovery and precedence were verified in the native `K0ACP` check above;
  older cross-operation precedence is covered by tests, not a separate native
  acceptance exercise.
- Native Data Files writes successful snapshots to disk and replays them on
  restart. `host.kvSet` is **in-memory only**, a runtime backup here. Parsing
  failures occur before the disk cache is written. Physical corruption or
  deletion of that cache requires another download. No large
  dataset is copied into global settings.
- Refresh rejects HTML, unsupported directives, invalid records/exchanges,
  empty data, and files over 5 MB. Extra nonessential columns can warn without
  rejecting the live file. A syntactically valid incomplete file cannot always
  be distinguished from an intentionally smaller file.
- Discovery selects the first CWOPS entry in N1MM's latest-first category.
  Changed markup/forms or an entry outside the listed page fail visibly and
  retain previous data; select an explicit HTTPS entry or direct text URL.
  Local import is unsupported: the inspected native loader fetches HTTP
  resources, and SDK 0.5.0 provides no local import capability here. File/download
  dates cannot guarantee that an operator's exchange remains unchanged. A new
  source takes effect after a successful refresh; the previous cached dataset
  remains active until then.
- Upstream scoring/scheduling behavior is retained, including no special
  cancellation dates or independent selected-hour filter. See
  [PROVENANCE.md](PROVENANCE.md).

Older cross-operation precedence, a controlled delayed-lookup race, and a
session with the operating system offline were not separately exercised in
the native UI. Deterministic tests cover these contracts; the native
failed-refresh/restart and cached-lookup checks above provide additional
evidence for cache recovery.
