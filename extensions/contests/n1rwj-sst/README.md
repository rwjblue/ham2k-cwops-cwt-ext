# K1USN Slow Speed Test

An independently installable Ham2K extension with key `n1rwj-sst` and activity
type `sst`. It supports the [K1USN SST rules](https://www.k1usn.com/sst_rules.html):
one-hour sessions on Monday at 00:00 UTC and Friday at 20:00 UTC, using CW on
160, 80, 40, 20, 15, and 10 meters. The maximum speed is 20 WPM; slower speeds
are welcome. This extension covers the weekly SST, not the separate annual
Slow Speed Open.

## Configure and log

Install this extension's `.h2kext` bundle as described in the
[repository guide](../../../README.md), add an SST session to an operation,
and configure your exchange name, state/province/DX, and power class: QRP
(up to 5 W), low (up to 100 W), or high (over 100 W). Each session is separate.
Session references contain the UTC date and start time, such as
`2026-09-21-0000`; ordinary weekly suggestions do not encode sponsor exceptions.

Exchange your first name and lower-48 US state (or DC), Canadian province,
or literal `DX` for other locations. Alaska, Hawaii, and Puerto Rico use
`DX`. Do not substitute a country prefix such as `ON`, which can collide with
a Canadian province. The [sponsor FAQ](https://www.k1usn.com/sst_faq.html)
defines the province table: `AB BC LB MB NB NF NS NT NU ON PE QC SK YT`.
Newfoundland's `NL` spelling is accepted as the same scoring multiplier as
`NF`; Labrador's `LB` is separate. Logged exchange spellings remain intact.

Names use the first word, uppercased. Operator edits and intentional clearing
are preserved. Log one callsign at a time because batch entry shares the
received exchange controls.

## History and scoring

Refresh **SST N1MM call history** in Ham2K's data sources. Blank source settings
discover the latest `K1USNSST-*.txt` entry in the
[N1MM call-history category](https://n1mmwp.hamdocs.com/mmfiles/categories/callhistory/).
You can instead select an HTTPS N1MM entry or direct text URL on
`n1mm.hamdocs.com` or `n1mmwp.hamdocs.com`. Local file paths are unsupported.
The native data file is `n1rwj-sst_history`, with a daily refresh interval.
Settings show record count, file date, download time, and parser warnings;
failed or incompatible replacements retain the last successful dataset.

Accepted file markers are `K1USNSST`, `K1USN-SST`, and `SST`. `Name` supplies
the name, and `Exch1` supplies the location (`State` is a fallback for files
without that value). History-file `AK`, `HI`, and `PR` values suggest `DX`;
numeric CWops exchanges are never interpreted as SST locations.

After operator input, suggestions prefer current-operation SST contacts,
then the selected file, then older SST contacts, independently for each field.
Within each source, exact calls and recent contacts take precedence. An
unambiguous base call may supply a portable station's name, but a stored SST
location requires an exact callsign match. Host name/location guesses are the
final fallback. Verify every suggestion against what was sent. Downloads
happen during refresh, with no per-key download or full-log read.

Each eligible QSO earns one point, once per callsign per band. Multipliers are
distinct US states/DC, Canadian subdivisions, and DXCC entities **once per
band**; total score is points × the sum of those band multipliers. The lower
48 US and Canada earn subdivision credit only, never an additional country
multiplier. DXCC credit comes from the station's country data. The
[sponsor-linked N1MM definition](https://n1mmwp.hamdocs.com/mmfiles/k1usnsst-udc/)
sets `IsMultPer=1`, meaning once per band in the
[N1MM UDC documentation](https://n1mmwp.hamdocs.com/appendices/udc-editor/).

Non-CW contacts, unsupported bands, deleted contacts, and duplicates score
zero. For a valid selected session, timestamped contacts before its start or
at/after its end also score zero with an `outsideSession` alert. Without a
usable session or timestamp the time filter cannot apply.

Otherwise eligible contacts with missing or invalid exchanges still earn
provisional QSO points with `missingExchange` or `invalidExchange` alerts.
Only a recognized location earns its multiplier; `DX` without a usable DXCC
entity earns no multiplier and shows `unknownMultiplier` when the exchange
is otherwise complete. A valid location can provisionally count even if the
name is missing. Correct flagged contacts before reporting the score.

## Export and development

ADIF uses `CONTEST_ID=K1USN-SST` and name/location exchange strings. Cabrillo
uses `CONTEST=K1USNSST` and name/location columns without RST, following the
sponsor-linked N1MM definition. Export filenames include the session. Report
totals on [3830 Scores](https://www.3830scores.com/); the sponsor does not
require log submission.

```sh
mise run build n1rwj-sst
mise run pack n1rwj-sst
mise run test -- packages/mini-contest/tests
mise run check
```

Shared implementation and Vitest coverage live in `packages/mini-contest/`,
with N1MM and operation-history adapters in sibling shared packages. See
[verification](../../../docs/VERIFICATION.md) for automated and native-test
evidence and [provenance](../../../docs/PROVENANCE.md) for attribution.
