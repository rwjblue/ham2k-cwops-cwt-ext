# N1RWJ MST for Ham2K

Log the **ICWC Medium Speed Test (MST)** in Ham2K with session selection,
sent serial numbering, name suggestions, scoring, and ADIF/Cabrillo exports.
The extension suggests names from a downloaded call-history file and your
previous MST contacts; you copy each received serial from the other station.

Part of the [N1RWJ contest extensions](../../../README.md#contest-extensions):
[CWT](../n1rwj-cwt/README.md) · **MST** · [SST](../n1rwj-sst/README.md).

## The contest at a glance

The [ICWC MST](https://internationalcwcouncil.org/mst-contest/) offers short
CW sessions for practicing operating skills at moderate speeds. Everyone is
welcome, and each one-hour session is a separate contest.

| Detail | MST |
| --- | --- |
| Sessions, UTC | Monday 13:00 and 19:00; Tuesday 03:00 |
| Mode and bands | CW on 160, 80, 40, 20, 15, and 10 meters |
| Speed | Requested 20–25 WPM; slow down on request |
| Exchange | Sequential contact number + first name, such as `1 ROB` |
| Score | QSO points × unique callsigns across all bands |

See the [official rules](https://internationalcwcouncil.org/mst-contest/)
for operating guidance and current announcements. The extension suggests the
regular weekly schedule; it does not track sponsor schedule exceptions.

## Get started

1. Download `n1rwj-mst-<version>.h2kext` from
   [N1RWJ releases](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases)
   and install it through **Settings → Features & Extensions → Install from file**.
2. **Create a new operation for each session**, add MST, and select the
   correct UTC date/time. Set your first name and power class: QRP (up to
   5 W), low power (up to 100 W), or high power (over 100 W).
3. Under **Settings → Accounts, Services & Data Sources**, refresh
   **MST N1MM call history** before operating.
4. Enter a callsign. Send the displayed **Sent #** and your name, copy the
   other station's **Received #**, and confirm or correct **Name** before saving.

Log **one callsign at a time**; batch call entry shares the received exchange
fields. Use **Wipe** to start a fresh contact and reset edits in the controls.

## How serial numbers work

Ham2K starts **Sent #** at **1 for a new operation** and uses one sequence
across all bands. The number shown while entering a contact is a preview;
saving the contact commits it and advances the next number. Wiping an
unsaved draft does not use a number.

You can correct **Sent #** on a new or saved contact to match what you
actually sent. A higher number advances the next automatic serial beyond it;
a lower correction does not rewind the counter. Editing, deleting, or
rescoring a contact never renumbers other contacts, and deleted contacts'
serials remain reserved. **Changing the selected session inside an existing
operation does not reset the counter**—start a new operation for the next
session.

The received number belongs to this contact, so it is never filled from
call history, earlier contacts, or CWops member numbers. Always copy it on air.

## Where the call history comes from

The default source is the public
[N1MM call-history collection](https://n1mmwp.hamdocs.com/mmfiles/categories/callhistory/).
The extension discovers the latest listed `ICWC-MST-*.txt` file and uses its
names. See N1MM's [call-history explanation](https://n1mmwp.hamdocs.com/setup/call-history/)
for background on these community-maintained files. They do not provide
received MST serial numbers.

Ham2K checks the data when it loads the extension and when it reconnects,
downloading a missing file or refreshing one older than 24 hours. You can
also refresh it manually. **MST call history** settings show the file date,
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

Your edits, including deliberately cleared fields, take priority. For an
untouched name, the extension looks for a value in this order:

1. MST contacts already saved in this operation.
2. The downloaded N1MM MST file.
3. Your older MST contacts.
4. Ham2K's ordinary name suggestion.

Within each source, exact callsign matches come first; an unambiguous base
call may supply a portable station's name. The exchange uses the first name,
uppercased. Always check it against what the other station sends. Clearing or
correcting a suggestion is respected, including during callsign corrections.

## How scoring works

Each eligible contact earns **one point**, and you may work a callsign once
on each contest band. The multiplier is the number of **different callsigns
across the whole session**. Working the same station on a second band adds
a point, but does not add another multiplier. For example, 10 contacts with
8 different callsigns score **10 × 8 = 80**.

Duplicate contacts on the same band, deleted contacts, non-CW contacts, and
contacts on other bands earn no points. With a valid selected session and
contact time, contacts outside its hour also earn no points and show
**Outside selected session**. Check imported contacts with missing dates or
session information because the time filter cannot classify them.

Missing or invalid received exchanges are flagged but still earn provisional
points and callsign multipliers. Correct those contacts before reporting
your score; the displayed total does not certify a complete exchange.

## Export and report your score

Use Ham2K's **Exports** menu for ADIF or Cabrillo. Both identify the contest
as `ICWC-MST`. ADIF includes sent/received serials and full exchange strings;
Cabrillo places the name before the serial, following the
[sponsor-linked N1MM format](https://n1mmwp.hamdocs.com/mmfiles/icwc-mst-udc/),
and omits signal reports. Export names include the selected session.

Exports retain logged contacts even when the scorer excludes them for being
outside the session, so review your log before sharing it. Report your
session total at [3830 Scores](https://www.3830scores.com/); ICWC does not
require a log submission.

## About this extension

N1RWJ MST shares call-history handling and contest tools with the other
N1RWJ extensions. See the [installation and development guide](../../../README.md),
[verification record](../../../docs/VERIFICATION.md),
[provenance](../../../docs/PROVENANCE.md), and [notices](../../../NOTICE.md).
To build just MST, run `mise run pack n1rwj-mst` from the repository root.
