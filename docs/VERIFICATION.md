# Verification and compatibility

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

Native verification used `/Applications/Ham2K Mac Logger (Next).app`, whose
current application identity is **Power Logger 26.9.0, build 169**. The
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

SDK 0.5.0/types are the API reference. Native behavior was inspected in public
HaLo commit [c726266](https://github.com/ham2k/halo/tree/c726266a4ae72117396ce48255611374136fd374),
which predates some archive behavior. SDK declarations alone do not certify a
native host build as compatible.

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
