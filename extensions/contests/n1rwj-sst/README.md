# N1RWJ SST for Ham2K

Log the **K1USN Slow Speed Test (SST)** in Ham2K with session selection,
name/location suggestions, scoring, and ADIF/Cabrillo exports. The extension
suggests exchanges from a downloaded call-history file and your previous SST
contacts, while preserving what you actually enter.

Part of the [N1RWJ contest extensions](../../../README.md#contest-extensions):
[CWT](../n1rwj-cwt/README.md) · [MST](../n1rwj-mst/README.md) · **SST**.

## The contest at a glance

The [K1USN SST](https://www.k1usn.com/sst.html) is a welcoming opportunity to
practice CW and contest logging at slower speeds. Everyone is welcome, and
each one-hour session is a separate contest. This extension covers the
weekly SST; the annual Slow Speed Open is a separate event.

| Detail | SST |
| --- | --- |
| Sessions, UTC | Monday 00:00; Friday 20:00 |
| Mode and bands | CW on 160, 80, 40, 20, 15, and 10 meters |
| Speed | Maximum 20 WPM; slower speeds are welcome |
| Exchange | First name + US state, Canadian province, or `DX`, such as `ROB RI` |
| Score | QSO points × state/province/DXCC multipliers, counted once per band |

See the [official rules](https://www.k1usn.com/sst_rules.html) and
[operator FAQ](https://www.k1usn.com/sst_faq.html) for operating guidance.
The extension suggests the regular weekly schedule; it does not track
sponsor schedule exceptions.

## Get started

1. Download `n1rwj-sst-<version>.h2kext` from
   [N1RWJ releases](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases)
   and install it through **Settings → Features & Extensions → Install from file**.
2. Create a new operation for the session, add SST, and select the correct
   UTC date/time. Set your first name, state/province/`DX`, and power class:
   QRP (up to 5 W), low power (up to 100 W), or high power (over 100 W).
3. Under **Settings → Accounts, Services & Data Sources**, refresh
   **SST N1MM call history** before operating.
4. Enter a callsign, listen to the exchange, and confirm or correct
   **Name** and **State / province / DX** before saving.

Use a separate operation for each session and log **one callsign at a time**;
batch call entry shares the exchange fields. Use **Wipe** to start a fresh
contact and reset any edits left in the controls.

## Which location to send

Stations in the lower 48 US states send their two-letter state abbreviation;
Washington, DC sends `DC`. Canadian stations send their province/territory
abbreviation. Other locations, including Alaska, Hawaii, and Puerto Rico,
send the literal **`DX`**. SST uses **no serial or membership number**.

The [SST FAQ's abbreviation table](https://www.k1usn.com/sst_faq.html) uses
`NF` for Newfoundland and `LB` for Labrador, as separate multipliers. The
extension also accepts `NL` as an alias for `NF` when scoring, while retaining
your entered spelling in the log and exports. For DX
stations, enter `DX` rather than a country prefix; a prefix such as `ON`
could otherwise be mistaken for Ontario.

## Where the call history comes from

The default source is the public
[N1MM call-history collection](https://n1mmwp.hamdocs.com/mmfiles/categories/callhistory/).
The extension discovers the latest listed `K1USNSST-*.txt` file and uses its
names and locations. See N1MM's
[call-history explanation](https://n1mmwp.hamdocs.com/setup/call-history/)
for background on these community-maintained files. They are suggestions,
not a guarantee of where a station is operating today.

Ham2K checks the data when it loads the extension and when it reconnects,
downloading a missing file or refreshing one older than 24 hours. You can
also refresh it manually. **SST call history** settings show the file date,
download time, record count, warnings, and selected source. Leave the source
blank for automatic discovery, or choose an HTTPS N1MM file page or direct
text URL, then refresh. Local file paths are not supported.

Typing a callsign uses the downloaded data and your local history; it does
not download the N1MM file for every contact. The native app keeps the last
successful file across restarts and failed refreshes, so cached suggestions
remain available without a new download. See the
[verification record](../../../docs/VERIFICATION.md) for tested offline/cache
behavior and its limits.

## How exchange suggestions work

Your edits, including deliberately cleared fields, take priority. For each
untouched field, the extension looks for a value in this order:

1. SST contacts already saved in this operation.
2. The downloaded N1MM SST file.
3. Your older SST contacts.
4. Ham2K's ordinary name or location suggestion.

Name and location are resolved separately. Within each source, exact callsign
matches come first. An unambiguous base call can supply a portable station's
name, but a stored location requires the exact call because the station may
have moved. History-file locations `AK`, `HI`, and `PR` suggest `DX`; CWops
member numbers are never used as SST locations. Always check the actual exchange.
Clearing or correcting a suggestion is respected during callsign corrections.

## How scoring works

Each eligible contact earns **one point**, and you may work a callsign once
on each contest band. Multipliers are **different US states/DC, Canadian
subdivisions, and DXCC entities on each band**. Add those band multiplier
counts, then multiply by the total QSO points. For example, 10 contacts with
5 multipliers on 20m and 3 on 40m score **10 × (5 + 3) = 80**.

The same state or DXCC entity can count again on another band. The lower
48 US and Canada earn state/province credit only, without another country
multiplier. For a `DX` exchange, Ham2K's country data identifies the DXCC
entity: `DX` itself is not one shared multiplier. This per-band treatment
matches the [sponsor-linked N1MM definition](https://n1mmwp.hamdocs.com/mmfiles/k1usnsst-udc/)
and its [multiplier setting](https://n1mmwp.hamdocs.com/appendices/udc-editor/).

Duplicate contacts on the same band, deleted contacts, non-CW contacts, and
contacts on other bands earn no points. With a valid selected session and
contact time, contacts outside its hour also earn no points and show
**Outside selected session**. Check imported contacts with missing dates or
session information because the time filter cannot classify them.

Missing or invalid exchanges are flagged but still earn provisional QSO
points. A recognized location can count as a multiplier even if the name
is missing; an unknown location, or `DX` without a usable DXCC entity,
cannot. Correct flagged contacts before reporting your score.

## Export and report your score

Use Ham2K's **Exports** menu for ADIF or Cabrillo. Both retain your sent and
received name/location exchanges. ADIF identifies the contest as
`K1USN-SST`; Cabrillo uses `K1USNSST` and omits signal reports, following the
sponsor-linked N1MM format. Export names include the selected session.

Exports retain logged contacts even when the scorer excludes them for being
outside the session, so review your log before sharing it. Report your
session total at [3830 Scores](https://www.3830scores.com/); K1USN does not
require a log submission.

## About this extension

N1RWJ SST shares call-history handling and contest tools with the other
N1RWJ extensions. See the [installation and development guide](../../../README.md),
[verification record](../../../docs/VERIFICATION.md),
[provenance](../../../docs/PROVENANCE.md), and [notices](../../../NOTICE.md).
To build just SST, run `mise run pack n1rwj-sst` from the repository root.
