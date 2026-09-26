# N1RWJ CQ WW — temporary upstream preview

This is a temporary, independently installable copy of the official
[`ham2k-cqww`](https://github.com/ham2k/extensions/tree/main/extensions/contests/ham2k-cqww)
extension with RTTY improvements intended for that official extension.
Runtime source and translations are kept identical to
[Ham2K/extensions PR #2](https://github.com/ham2k/extensions/pull/2), on branch
`codex/cqww-rtty` in `~/src/github/ham2k/extensions`. Personal identity,
versioning, tests, and packaging stay here. It is not a permanent fork.

**Disable the official CQ WW extension before enabling N1RWJ CQ WW.** Both
handle the same `cqww` activity. The personal package key is `n1rwj-cqww`,
but saved references, exchange fields, and export identifiers stay official.
Once the official extension ships these changes, disable this temporary
extension and enable the updated official one. Existing operations keep
working without translating their contest references or exchanges. Install
only one provider at a time; export a backup before switching.

Build an installable bundle with `mise run pack n1rwj-cqww`. New builds are
in `dist/`; this preview has not been published to the catalog.

## Operating guide

Select **RTTY** in CQ WW setup. Configure the sent CQ zone, state / Canadian
call area / DX, and the single-operator or checklog entry category. Set the
logging mode to RTTY; rig-reported RTTY-LSB, RTTY-USB and RTTY-R are also
recognized. Generic DATA, DATA-USB and FT8 are not treated as RTTY.

The received exchange is RST, CQ zone, and (for continental US/Canada)
state or Canadian call area. RST uses the host's existing report controls.
The extra State / Province field appears only for RTTY. DX is filled for
identified stations outside continental US/Canada, including Alaska and
Hawaii. Copy and verify the actual exchange: zone and lookup-state suggestions
can be corrected or deliberately cleared. No call-history download is needed.

Use the contest's Canadian abbreviations: NB, NS, QC, ON, MB, SK, AB, BC,
NWT, NF, LB, NU, YT, PEI. NT and PE normalize to NWT and PEI. NL is left
unresolved because Newfoundland (NF) and Labrador (LB) score separately.

Scoring follows the [CQ WW RTTY rules](https://cqwwrtty.com/rules.htm):
1/2/3 points for same country/same continent/other continent, three multiplier
groups per band, and one contact per station per band across the whole
operation. Only 80, 40, 20, 15 and 10m count. Countries use the shared country
file's CQ/WAE entities, including IG9/IH9. Maritime mobile contacts earn only
a zone multiplier. Missing or invalid exchanges do not consume a dupe slot.
A single-band entry scores only that band but retains other-band contacts
in its Cabrillo submission. Use a separate operation for each annual event;
the host's active activity segments define which contacts belong to it.

Cabrillo uses `CQ-WW-RTTY`, `CATEGORY-MODE: RTTY`, `RY` QSO mode, and both
zone/QTH columns. Sent exchange setup must be valid before export. A received
field deliberately cleared stays missing (`-`) in the export. Inspect missing
exchanges before submission. ADIF carries `STX_STRING` and `SRX_STRING`, and
RTTY sideband spellings normalize to `MODE: RTTY` in contest ADIF fields.
The [official Cabrillo guide](https://cqwwrtty.com/cabrillo.htm) describes
submission metadata; verify your category and contact details during upload.

This first RTTY implementation supports single-operator and checklog entries.
Choose ASSISTED if you use spotting assistance. Multi-transmitter identifiers,
band-change limits, Classic overlay operating-time accounting, modem/audio
processing, and radio transmission are outside this implementation. It does
not automatically submit logs. CW and SSB retain their existing exchanges
and scoring rules.

Automated tests cover pure scoring, registered hooks, exchange edits,
CW/SSB regressions, and Cabrillo fields. These tests are not an on-air test
or a native Ham2K UI test.
