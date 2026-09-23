# Spot call filters, protocol v1

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
