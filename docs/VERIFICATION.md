# Verification and compatibility

Verified September 19, 2026. `mise run check` runs Biome, TypeScript,
deterministic Vitest tests, the published builder, and official `h2kext-pack`
validation. Tests cover parsing/corruption, precedence/suffixes, offline replay,
failed replacements, history edits/deletes, native suggestion contracts,
saved exchanges, scoring, and ADIF/Cabrillo. Bundle tests evaluate the generated
IIFE with pinned shared libraries and a simulated bridge, not Flutter/native UI.

The live default-source path was exercised separately: category discovery,
entry GET, dynamic form POST, and parsing succeeded with 7,155 calls. Its
SHA-256 matches the observed file in [CALL-HISTORY.md](CALL-HISTORY.md). Tests
do not depend on this live service.

## Installed app

`mise run verify-host` inspected **Ham2K Mac Logger (Next) 26.8.1-alpha1,
build 109** in `/Applications`. Its kernel lacks `liquidjs` and
`getHistoryForCall`, and has older format-tools, operation-data, and
qson-cabrillo libraries than required. It is also incompatible with the supplied
official CWT 0.2.1 archive, which requires qson-cabrillo 1.2 and liquidjs.
No native installation or test contacts were created. The app was not updated.

Installed kernel SHA-256:
`381949dcaf6f62ad7d55a60c65bef7c0bc69302efe55df834a9cf4bcd1efa248`.

SDK 0.5.0/types are the API reference. Native behavior was inspected in public
HaLo commit [c726266](https://github.com/ham2k/halo/tree/c726266a4ae72117396ce48255611374136fd374),
which predates some archive behavior. SDK declarations alone do not certify a
native host build as compatible.

## Decisions and remaining limits

- Native touched-control tracking protects corrections and deliberate blanks.
  Existing `qso.refs` values are not assumed to be operator input: they can be
  earlier guesses. The inspected host ignores empty suggestions. An ASCII
  space clears an **untouched** old suggestion and is trimmed out on save.
  This convention is tested with a host-contract model and needs native
  confirmation on the target app.
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
  without repeatedly reading its log.
- Native Data Files writes successful snapshots to disk and replays them on
  restart. `host.kvSet` is **in-memory only**, a runtime backup here. Parsing
  failures occur before the disk cache is written. Physical corruption or
  deletion of that cache requires another download/local import. No large
  dataset is copied into global settings.
- Refresh rejects HTML, unsupported directives, invalid records/exchanges,
  empty data, and files over 5 MB. Extra nonessential columns can warn without
  rejecting the live file. A syntactically valid incomplete file cannot always
  be distinguished from an intentionally smaller file.
- Discovery selects the first CWOPS entry in N1MM's latest-first category.
  Changed markup/forms or an entry outside the listed page fail visibly and
  retain previous data; select an explicit entry/local file. File/download
  dates cannot guarantee that an operator's exchange remains unchanged. A new
  source takes effect after a successful refresh; the previous cached dataset
  remains active until then.
- Upstream scoring/scheduling behavior is retained, including no special
  cancellation dates or independent selected-hour filter. See
  [PROVENANCE.md](PROVENANCE.md).

Remaining native acceptance exercise: install in a compatible host, disable
original CWT, refresh data, test member/nonmember/CWA/unknown calls, edit/clear
fields during a delayed lookup, correct the call, save a test QSO, inspect
ADIF/Cabrillo, then restart offline and repeat. Use a test operation.
