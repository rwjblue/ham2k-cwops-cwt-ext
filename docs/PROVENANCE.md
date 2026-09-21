# CWT adaptation provenance

**Primary upstream author: Sebastian Delmont, KI2D**, the main Ham2K developer.
The setup, scheduling, scoring, exchange controls, translations, ADIF fields,
and Cabrillo behavior in `extensions/contests/n1rwj-cwt/` derive from his
official Ham2K CWT extension. This monorepo adds personal exchange suggestions,
MST and SST extensions, shared code, and independent packaging; it is not an
official Ham2K release.

## Original installable archive

- File: `ham2k-cwt-0.2.1.h2kext`, supplied by the user.
- Extension key: `ham2k-cwt`; version: `0.2.1`; extension API: `1`.
- SHA-256: `c0b8606d6c37d1c30200fef45a3f7370e9c8ccb0e341ab4644ae5ac570166252`.
- Inspected on September 19, 2026. The ZIP contains `manifest.json` and a
  readable `index.js`; CWT source sections identify
  `extensions/contests/ham2k-cwt/src/`.

## Maintainable source and licensing

The public [Ham2K HaLo repository](https://github.com/ham2k/halo) supplied
maintainable TypeScript at commit
[`c726266a4ae72117396ce48255611374136fd374`](https://github.com/ham2k/halo/tree/c726266a4ae72117396ce48255611374136fd374/extensions/contests/cwt).
The CWT sources there use the older path `extensions/contests/cwt/` and
manifest version `0.0.1`; this revision is **not claimed to be the exact source
revision of the supplied 0.2.1 archive**. The scheduling, exchange, scoring,
and translation implementations match the corresponding readable archive
sections. The archive is the compatibility reference where they differ.

The [upstream README](https://github.com/ham2k/halo/blob/c726266a4ae72117396ce48255611374136fd374/README.md#license)
declares MPL-2.0. The CWT TypeScript files each carry
`Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>` and
`SPDX-License-Identifier: MPL-2.0`. These notices remain in the adapted files.
The full MPL-2.0 text in this project's `LICENSE` is the text distributed by
[Ham2K app-polo](https://github.com/ham2k/app-polo/blob/main/LICENSE).

Adapted source locations (all personal CWT paths are now under
`extensions/contests/n1rwj-cwt/`):

| Upstream | This project |
| --- | --- |
| `src/index.ts` | `extensions/contests/n1rwj-cwt/src/cwt/{activity,refs,exports,shared}.ts` |
| `src/exchange.ts` | `extensions/contests/n1rwj-cwt/src/cwt/exchange.ts` |
| `src/schedule.ts` | `extensions/contests/n1rwj-cwt/src/cwt/schedule.ts` |
| `src/scorer.ts` | `extensions/contests/n1rwj-cwt/src/cwt/scorer.ts` |
| `src/i18n.ts`, `src/i18n/*.json` | Corresponding files in `extensions/contests/n1rwj-cwt/src/cwt/` |
| `src/{exchange,schedule,scorer}.test.ts` | Corresponding Vitest tests in `extensions/contests/n1rwj-cwt/tests/cwt/` |

The archive's later integration changes are retained: registration and ADIF
delegation use the installed extension key; ADIF forwards segment, lookup,
settings, and export context options; Cabrillo comes from published
`@ham2k/lib-qson-cabrillo`. Internal SDK copies and repository-relative SDK
imports are replaced with published `@ham2k/extension-sdk` imports. The SDK is
version 0.5.0, MIT licensed, copyright Sebastian Delmont <sd@ham2k.com>; its
license notice is reproduced in `NOTICE.md`. Host-provided Ham2K shared
libraries are declared in the manifest and externalized by the official
builder.

## Compatibility boundaries retained

### Public extensions PR

[Ham2K/extensions PR #1](https://github.com/ham2k/extensions/pull/1) now carries
the exchange-prefill feature in the official extension's source layout.
Its feature behavior is the source of truth for ongoing personal backports.
Version 0.1.2 brings back its history-loading race fix, restriction of
suggestions to CWT exchange fields, and localized prefill/settings text.
Those contributions carry Robert Jackson's MIT notice, retained in `NOTICE.md`.
The personal extension retains the original adaptation's MPL-2.0 notices,
published SDK dependency, export identifiers, storage keys, and build tools.

The monorepo move preserves that CWT behavior and data identity. Generic N1MM
CSV parsing, callsign handling, and downloads now live in `packages/n1mm/`;
CWT-specific membership interpretation and exchange precedence remain in the
CWT workspace. Recognition of MST/SST file markers, source-date variants,
and numbered N1MM download slugs is synchronized with the upstream CWT PR.

### MST and SST

`extensions/contests/n1rwj-mst/` and `extensions/contests/n1rwj-sst/` are new
extensions using `packages/mini-contest/` and the shared N1MM adapters. Their
contest behavior follows the [ICWC MST rules](https://internationalcwcouncil.org/mst-contest/)
and [K1USN SST rules](https://www.k1usn.com/sst_rules.html), with export layouts
checked against the sponsor-linked N1MM definitions for
[MST](https://n1mmwp.hamdocs.com/mmfiles/icwc-mst-udc/) and
[SST](https://n1mmwp.hamdocs.com/mmfiles/k1usnsst-udc/).
Their ADIF identifiers are `ICWC-MST` and `K1USN-SST`; the SST Cabrillo
identifier is `K1USNSST`, following that definition.

The [SST FAQ](https://www.k1usn.com/sst_faq.html) supplies the Canadian
multiplier table, including separate `LB` and `NF` entries, and explains that
`NL` is an alias for `NF`. Its table and the rules were checked on September
20, 2026. The SST UDC uses `IsMultPer=1`, meaning once per band under the
[N1MM UDC contract](https://n1mmwp.hamdocs.com/appendices/udc-editor/);
MST uses `IsMultPer=4`, meaning once per contest. Both sponsors permit QRP,
low-power, and high-power entries. Their published exchanges and N1MM
Cabrillo layouts contain no signal report.

Only CWT is subject to the temporary upstream-PR synchronization requirement.
These new contests and the monorepo's personal tooling and release layout do
not modify the official CWT extension.

### Existing operations and exchanges

- The activity/ref type remains `cwt`, preserving existing CWT operations and
  received exchanges. The extension key is personal (`n1rwj-cwt`). Disable
  the official CWT extension before enabling this one, because both register
  handlers for that same activity.
- Four one-hour UTC sessions are computed weekly: Wednesday 1300/1900 and
  Thursday 0300/0700. Occasional sponsor cancellations are not encoded.
- Scoring remains one point per callsign per band, multiplied by unique
  callsigns across the operation, on the six HF contest bands in CW. Like the
  supplied extension, the scorer does not itself exclude contacts outside
  the selected hour; host activity segments determine its active scope.
- `ourName` and `ourNumber` retain the sent exchange. The QSO CWT ref's
  `name` and `number` retain the received exchange, including intentional
  blanks. Their joined value is projected to `their.exchange` for the log.
- Generic location guesses prefill Number/QTH only after all known CWT
  exchange sources are exhausted. Data/history suggestions
  introduced by this adaptation must explicitly identify a valid exchange;
  missing membership records do not prove nonmembership.
