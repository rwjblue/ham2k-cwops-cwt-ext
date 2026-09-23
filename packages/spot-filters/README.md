# Temporary spot call filters, protocol v1

This is a compatibility bridge for today's host, not a proposed native API.
The [maintainer's direction](https://gist.github.com/rwjblue/3a7304de0c56f8fcdf7374da5951417f)
is for sources to supply spots, contest/activity extensions to assess relevance,
and the logger to highlight or hide spots according to the operator's preference.
RBN should ultimately have no contest-filter discovery or selection.

This MIT-licensed package is bundled into consumers and providers. It is not
a host shared library and introduces no install dependency between extensions.

Providers register `spotCallFilter:v1` under their extension key. Consumers use
the SDK's `hooks.invokeAll(category, 'describe', {}, online)` for discovery and
`hooks.invokeOne(category, key, 'matchCalls', { version: 1, calls }, online)`
to evaluate only the selected provider. These are extension-to-extension
methods, not native Spots filter controls.

`describe` returns a label, availability/reason, and a default-selection hint.
`matchCalls` accepts at most 2,000 normalized full callsigns and returns the
matching subset, preserving portable calls. Responses are JSON data, never
functions or full history files. Consumers validate versions and subsets,
split larger batches, and distinguish an unavailable file from zero matches.
Unavailable or failed selected filters must never silently become unfiltered.

The history adapter accepts a records getter and callsign lookup function.
It has no knowledge of CWops membership, serials, locations, or contest rules,
so CWT, MST, and SST use the same contract without sharing exchange semantics.
Use the current downloaded file, not prior QSOs or network lookups. Providers
must not call spot sources: discovery/evaluation must not recurse into fetching.

Selection belongs to the consumer. A default hint does not override an explicit
choice. Persist a chosen default's hook key so uninstalling its provider does
not silently broaden the feed. The host supplies no active operation to the
spots hook, so this contract cannot automatically follow the current contest.

## What remains and what goes away

`src/history.ts` contains the reusable, pure `matchHistoryCalls` function.
It uses cached records and the caller's callsign lookup policy, without hooks,
settings, operation state, network access, or scoring. Keep this matching and
each contest's history cache when replacing the transport in `src/index.ts`.
File presence is evidence for a display preference, not proof of participation
or club membership. Absence must never invalidate an otherwise valid QSO.

The current SDK's `scoreCandidates` already receives operation context and
returns notices, alerts, and duplicate status. Our contest scorers already
participate through `contestScorer`. We do not add speculative relevance fields,
overload scoring notices, fabricate activity refs, or alter QSO points to express
history membership. Use the eventual documented host contract once it exists.

The current compromise filters the returned RBN list before the logger sees it.
Consequently, the native UI cannot display rejected calls as band activity.
The underlying RBN feed cache remains unfiltered by contest; receiver selection,
expiration, paging, and deduplication remain source responsibilities.

Retire the bridge only when a supported host can represent history-based
relevance separately from scoring eligibility and apply the native display
preference. A generic "hide irrelevant" checkbox alone is insufficient if it
cannot preserve that distinction. At that point:

1. Use cached history matching from the contest's supported relevance path.
   Let the host provide operation context and combine activity judgments;
   keep CWT, MST, and SST exchange/scoring rules independent.
2. Remove RBN's `spots/filters.ts`, provider discovery/default selection,
   `matchFilter` invocation, `selectSpots`'s `allowedCalls` gate, and the
   call-history selector/status UI. Keep the reception feed, mode/skimmer/grid
   preferences, and My Signal panel.
3. Remove `spotCallFilter:v1` registrations and manifest entries from CWT,
   MST, and SST, plus their transport adapters and the protocol types/validators
   in this package. Preserve the pure matcher and history caches.
4. Migrate stored `spotCallFilter` choices and the legacy CWT
   `spotsHistoryOnly` hint deliberately. Preserve an explicit All calls opt-out
   and the default history-based narrowing where the native contract allows;
   a global provider selection may not map directly to operation-based settings.
   Do not silently broaden a selected unavailable filter. Decide older-host
   compatibility and manifest minimum versions before removing the fallback.
5. Verify native highlighting/hiding, operation changes, already-worked spots,
   missing histories, explicit opt-outs, and unchanged QSO scores. Replace the
   bridge tests with native-contract integration tests; retain matcher tests.

This checklist describes a future migration, not behavior implemented today.
No host capability detection or guessed fallback API is introduced here.
