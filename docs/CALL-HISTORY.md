# CWT call-history data

The data format follows the [N1MM call-history documentation](https://n1mm.hamdocs.com/setup/call-history/).
The public [call-history category](https://n1mm.hamdocs.com/mmfiles/categories/callhistory/)
lists the CWops file. The parser contains no dated filename or network access.

## Selecting a source

Leave **CWT Prefill → Source** blank for automatic discovery. An explicit
source must be an HTTPS category, CWOPS entry, or direct text URL on
`n1mm.hamdocs.com` or `n1mmwp.hamdocs.com`. Refresh the corresponding native
Data Files entry after changing the source; the last successful dataset stays
active until its replacement is downloaded and accepted.

Local file paths are unsupported. The native data-file loader uses HTTP, and
the extension's SDK 0.5.0 interface provides no local file import capability.

## Observed source

On September 19, 2026, the current entry was
[CWOPS_3992-AAA.txt](https://n1mmwp.hamdocs.com/mmfiles/cwops_3992-aaa-txt/),
credited there to Claude and updated September 18. The payload declares
`# CWOPS` and `# LastEdit,2026-09-17`. Downloading requires submitting the
entry's download form; a plain GET of its action returned an HTML access-denied
page. The refresh adapter must discover the current entry and form fields,
rather than permanently assuming this filename or form nonce.

The 215,765-byte downloaded file has SHA-256
`457e6374015b42a63404661cf86b2d479710b3c4561869f7cf3a7a8e6bdd2bdf`.
The parser successfully read all 7,155 records: 3,561 member exchanges,
2,497 explicit nonmember exchanges, 71 CWA exchanges, and 1,026 unknown
exchanges. One row has nonempty columns beyond its declared layout and
produces a warning; its Call, Name, and Exch1 remain unambiguous.

The live header maps `Call`, `Name`, `Exch1`, `UserText`, and an ignored trailing
column. `Exch1` contains the exchange to send in CWT. It can be a member number,
`CWA`, or a state/province/DX prefix. Many named records have blank `Exch1`.
Exchange tokens are one to six ASCII letters/digits, matching the native CWT
control; an all-zero token is invalid.
Their membership and number remain unknown. Neither text in `UserText` nor
the `State` column is promoted to an exchange.

## Supported syntax

- UTF-8 text, optional BOM, LF/CRLF/CR newlines, surrounding whitespace,
  blank lines, and full-line `#` comments.
- Comma or semicolon delimiters. The first data line chooses the delimiter
  when no order directive exists; another order directive can change it.
- Case-insensitive `!!Order!!` with reordered/omitted N1MM columns and empty
  columns that intentionally discard input. Without a directive, the
  documented default N1MM column order applies.
- CSV-style quoted fields and doubled quotes within a physical line.
  Multiline quoted records are unsupported and skipped with warnings.
- Missing fields are unknown, never evidence of nonmembership. Extra fields
  beyond the layout are ignored with a warning when nonempty. Unknown column
  names are ignored with a warning. Standard columns irrelevant to CWT are
  ignored.
- Duplicate calls merge field by field: later nonblank Name/Exch1 values win,
  with a warning. This does not turn blanks in a dataset into intentional
  operator clearing.
- `# CWT` and `# CWOPS` identify compatible data. Recognized N1MM association
  tags include NAQP, CQ, ARRL, state QSO parties, CW Open, MST, SST and NS
  families. An exclusively incompatible association list rejects the file.
  Multiple associations are allowed if at least one is compatible. Other
  comments are ignored; this is not a complete N1MM contest-name registry.
- The `LastEdit` comment is retained only when it is a valid ISO calendar date.

Every directive other than `!!Order!!` is an error, including otherwise valid
N1MM mapping/validation directives. The parser detects them instead of
silently applying different semantics. Invalid order directives, incompatible
recognized contest associations, and a file with no valid records also make
the result unusable. The caller must preserve its previous good cache on
these errors. Malformed individual rows and invalid exchange tokens produce
warnings and are skipped by the parser. The refresh adapter rejects such
warnings rather than accepting partially corrupt data; it also rejects HTML
and files over 5 MB. Nonessential extra-column warnings are accepted.

## Exchange precedence

Name and number resolve independently in this order:

1. Explicit operator input, including deliberate clearing.
2. Compatible current-operation CWT contacts.
3. The selected call-history file.
4. Older compatible CWT contacts.

After these sources are exhausted, native controls can use Ham2K’s ordinary
name suggestion and prefill Number/QTH with a location guess: state first,
then country/entity prefix, including the callsign country file. This is a
last-resort suggestion, not evidence of nonmembership, and is saved if left
unchanged. Operator corrections and deliberate clearing still take priority.
The pure resolver and its membership result describe only known exchanges;
the location fallback is applied separately by the logging-controls adapter.
Lookup notes report known history/file sources, not this location fallback.

For each source, exact callsign matches precede an unambiguous base call;
within history matches, the newest dated contact wins for each available
field. Undated contacts sort last, with stable input order for ties. Only
explicit `CWT` or `CWOPS` history markers qualify. Names or CW mode alone do
not prove contest compatibility. A blank field can fall through to a lower
source even when another field comes from a higher source.

Callsigns are normalized to uppercase. Portable prefixes and suffixes may
fall back to their single complete call component; an ambiguous pair such
as `K1ABC/W2XYZ` does not. Name, member number, and CWA may use a base match.
Nonmember location exchanges require an exact callsign because the location
can change: a base-call `CA` must not prefill `VE3/K1ABC`. An exact portable
entry takes precedence over its base, and a base-call query never selects a
different portable entry.

The pure resolver scopes operator input to its exact call and preserves
present empty strings or null as clearing. Host controls distinguish typed
values from suggestions, so adapters must use actual host edit/touch semantics
instead of assuming every value in a QSO reference was typed. A delayed lookup
must not clobber operator overrides. Native integration preserves touched
controls during callsign correction until Wipe/new-contact reset, following
Ham2K's own behavior; the pure resolver's operator argument is not used to
infer which native fields were touched.

`parseCallHistory`, `resolveCwtExchange`, and their data types are exported from
`src/history/index.ts`. Tests use small representative source records and
synthetic conflict, parser-error, suffix, and precedence cases. The downloaded
full dataset is not committed or bundled.
