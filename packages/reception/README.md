# Shared reception components

RBN and PSK Reporter consume this workspace's ES2020 source. Each extension
bundles its own copy and owns its state; neither depends on the other being
installed. Host-provided libraries remain external and declared by each
extension's manifest. Declare this private workspace as a dev dependency
(`"@n1rwj/reception": "*"`) so the official packaging task also copies its
`assets/` notices into the consumer. The wildcard follows the local workspace
through synchronized release bumps; the lockfile pins its resolution.

| Module | Responsibility |
| --- | --- |
| `reports.ts` | Directed transmitter/receiver observations, latest-per-link selection, rows and map points |
| `callsign.ts`, `geography.ts` | Exact callsigns, distance and bearing |
| `config.ts` | Operation location/callsign defaults and configurable panel fields |
| `panel-state.ts` | Bounded per-placement state and validated scene controls |
| `map/` | Bundled geography, projections, paths, label placement and themes |
| `ui/` | Pure native SVG scenes, responsive cards/tables, sorting and pagination |

Reports preserve both endpoints. SNR belongs to the receiver even when the UI
shows remote transmitters. Keys include transmitter, receiver, band and mode;
the newest observation wins, not the strongest SNR. Unknown locations stay
in the report list without guessed coordinates. Portable suffixes are exact.

Feed adapters own transport, parsing, rate limits, connection state, and
location enrichment. Presentation options supply attribution, endpoint labels,
optional CW-speed sorting and the refresh action. Shared rendering performs no
network or storage operations. RBN retains HTTP snapshot caching and its
receiver-directory adapter; PSK will manage an MQTT stream independently.

Tests migrated with the map and UI. They retain coverage for typography,
contrast, small panes, dense maps, pagination and sandbox payload limits.
RBN's own panel tests protect its refresh and configuration behavior. PSK
tests cover both directions using the same renderer. Bundle tests verify that
both consumers receive the original map and library license notices.

See [map attribution](assets/MAP_ATTRIBUTION.md). `mise run rbn:geography`
retains its existing command name but writes the shared geography here.
