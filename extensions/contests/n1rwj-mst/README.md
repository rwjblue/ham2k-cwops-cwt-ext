# ICWC Medium Speed Test

An independently installable Ham2K extension with key `n1rwj-mst` and activity
type `mst`. It supports the [ICWC MST rules](https://internationalcwcouncil.org/mst-contest/):
one-hour sessions on Monday at 13:00 and 19:00 UTC and Tuesday at 03:00 UTC,
using CW on 160, 80, 40, 20, 15, and 10 meters. The suggested speed is 20–25 WPM.

## Configure and log

Install this extension's `.h2kext` bundle as described in the
[repository guide](../../../README.md), add an MST session to an operation,
and configure your exchange name and power class: QRP (up to 5 W), low
(up to 100 W), or high (over 100 W). Each session is a separate entry.
Session references contain the UTC date and start time, such as
`2026-09-21-1300`; ordinary weekly suggestions do not encode sponsor exceptions.

The exchange is a name and sequential QSO number. Ham2K allocates your sent
serial starting at 1 across the operation, not separately per band. Enter the
received serial for every contact; neither previous serials nor CWops member
numbers are suggested. Names use the first word, uppercased. Explicit edits
and intentional clearing are preserved. Log one callsign at a time because
batch entry shares the received exchange controls.

## History and scoring

Refresh **MST N1MM call history** in Ham2K's data sources. Blank source settings
discover the latest `ICWC-MST-*.txt` entry in the
[N1MM call-history category](https://n1mmwp.hamdocs.com/mmfiles/categories/callhistory/).
You can instead select an HTTPS N1MM entry or direct text URL on
`n1mm.hamdocs.com` or `n1mmwp.hamdocs.com`. Local file paths are unsupported.
The native data file is `n1rwj-mst_history`, with a daily refresh interval.
Settings show record count, file date, download time, and parser warnings;
failed or incompatible replacements retain the last successful dataset.

The parser accepts `ICWC-MST`/`MST` contest markers and reads names from the
`Name` column; `Misc`, `Exch1`, and user comments never become received serials.
After operator input, name suggestions prefer current-operation MST contacts,
then the selected file, then older MST contacts, with the host name lookup as
the final fallback. Exact calls precede unambiguous base calls within each
source; recent contacts precede older ones. Downloads happen during refresh,
and the shared history adapter bounds full-log reads outside the per-key path.

Each eligible QSO earns one point, once per callsign per band. The multiplier
is the number of unique callsigns across the whole session; total score is
points × multipliers. Non-CW contacts, unsupported bands, deleted contacts,
and duplicates score zero. For a valid selected session, timestamped contacts
before its start or at/after its end also score zero with an `outsideSession`
alert. Without a usable session or timestamp the time filter cannot apply.

An otherwise eligible contact with a missing name/serial or invalid serial
still contributes provisional points and its callsign multiplier, with a
`missingExchange` or `invalidExchange` alert. Correct those contacts before
reporting the score; the displayed provisional score does not certify that
their exchanges are complete.

## Export and development

ADIF uses `CONTEST_ID=ICWC-MST`, exchange strings, and numeric `STX`/`SRX`
fields for valid serials. Cabrillo also uses `ICWC-MST` and name-then-serial
columns without RST, following the [sponsor-linked N1MM definition](https://n1mmwp.hamdocs.com/mmfiles/icwc-mst-udc/).
Export filenames include the session. Report totals on
[3830 Scores](https://www.3830scores.com/); the sponsor does not require log
submission.

```sh
mise run build n1rwj-mst
mise run pack n1rwj-mst
mise run test -- packages/mini-contest/tests
mise run check
```

Shared implementation and Vitest coverage live in `packages/mini-contest/`,
with N1MM and operation-history adapters in sibling shared packages. See
[verification](../../../docs/VERIFICATION.md) for automated and native-test
evidence and [provenance](../../../docs/PROVENANCE.md) for attribution.
