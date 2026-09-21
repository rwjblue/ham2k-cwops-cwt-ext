# N1RWJ RBN · My signal

See where the [Reverse Beacon Network](https://www.reversebeacon.net/) has
heard your signal across all its modes, with a reception map and sortable receiver reports.
The panel automatically follows your operation's station callsign and location.
It is read-only: it does not transmit, spot a station, post to POTA, or create
contacts.

Part of the [N1RWJ extension family](../../../README.md).

## Install and open the panel

1. Use a Ham2K version with native SVG panels. If the panel shows
   **App update needed**, update Ham2K before using it.
2. Download `n1rwj-rbn-<version>.h2kext` from the
   [latest GitHub release](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases/latest).
3. In Ham2K, open **Settings → Features & Extensions → Install from file**
   and select the downloaded package.
4. Open an operation, choose **Edit Layout → Add a Panel → RBN · My signal**,
   and save the layout. On narrow layouts, **Edit Layout** is under **Tools**.
   If editing is unavailable, enable **Enable Layout Customization** in settings.
5. Leave **Watch callsign** and **Map origin grid** blank to follow the operation.
   Reports load automatically when the panel is visible.

No build tools, map accounts, or custom Ham2K build are required.

## In Ham2K

Installing the extension makes **RBN · My signal** available in the operation's
**Edit Layout → Add a Panel** menu. Choose its **+** button, place it in your
layout, and save.

![RBN · My signal in Ham2K's Add a Panel menu](../../../docs/images/rbn/rbn-add-panel.jpg)

The panel then appears alongside your other operation panels. This desktop
example shows the reception map and receiver table together:

![RBN map and receiver table in Ham2K](../../../docs/images/rbn/rbn-desktop.jpg)

Narrow layouts can show the map or receiver cards separately:

| Map view | Receiver list |
| --- | --- |
| ![RBN map in a compact Ham2K window](../../../docs/images/rbn/rbn-compact-map.jpg) | ![RBN receiver cards in a compact Ham2K window](../../../docs/images/rbn/rbn-compact-list.jpg) |

These screenshots show the published extension running in the native macOS app;
the compact examples use a narrow desktop window. See the
[screenshot record](../../../docs/images/README.md) for capture versions and
the [verification record](../../../docs/VERIFICATION.md) for runtime coverage.
Physical phone and Linux runtime checks remain outstanding.

## Configuration is optional

The operation provides the defaults. Open the panel's settings in **Edit Layout**
only when you want an override or different display defaults.

| Setting | With the default settings | Optional change |
| --- | --- | --- |
| **Watch callsign** | Uses the operation's station callsign | Watch another exact callsign |
| **Map origin grid** | Uses the operation's latitude/longitude, otherwise its grid | Use a 4, 6, or 8 character Maidenhead locator |
| **Report window** | Last 15 minutes | Last 30 or 60 minutes |
| **Default band** | All bands | Select one band |
| **Default view** | Map and receivers | Map or receivers only |
| **Default sort / direction** | Newest reports first | Receiver, SNR, distance, frequency, or CW speed; either direction |
| **Map projection** | Fit reporting receivers | From my station · distance rings |

The callsign is the operation's **station** callsign, which can differ from the
operator's callsign. If the operation has multiple comma-separated station
callsigns, the panel uses the first. Portable suffixes match exactly: `K1ABC`
and `K1ABC/P` are different watched callsigns. The band selection does not
automatically follow the operation's active band.

With both overrides blank, switching operations follows the new station and
location. An explicit override stays with that panel placement until you clear
it, including when its layout is used for another operation. A callsign override
does **not** look up or change the map origin; set the corresponding grid when
watching a station elsewhere.

If the operation has no location, the receiver list still works. The map asks
for an operation location or grid override, and distance and bearing remain
unavailable. The extension never substitutes a callsign-prefix location guess.
If no valid callsign is available, it prompts for one without requesting reports.

Changes made with the panel's view, band, sort and page controls survive normal
refreshes separately for each placement. They reset when switching operations,
changing saved panel settings, or restarting the extension. Save preferred
defaults in panel settings when you want them to survive a restart.

## Map and receiver list

The map marks your station with a diamond and reporting receivers with circles.
Reception paths show where your signal was heard. Regional maps include
state/province boundaries and sparse country labels; light and dark colors keep
land and water distinct. Labels adapt to the available space, with receiver
callsigns taking priority over geographic captions.
Choose **Fit reporting receivers** in panel settings for a regional view or
**From my station · distance rings** for a view centered on your station.
The map includes the selected band's located receivers across all list pages.
Receivers with no published coordinates remain in the list.

Use the view menu to choose **Map + list**, **Map**, or **List**, and the band
menu to select a reported band or **All bands**. The list contains the latest
report from each receiver on each band and mode: mode, frequency, SNR, CW speed
(for CW only), age, and—when
locations are known—distance and bearing. The **Sort** menu offers **Heard**,
**Receiver**, **SNR**, **Distance**, **Frequency**, and **CW speed**. The adjacent
direction button reverses the order; missing measurements stay last. Previous
and next buttons move between pages, with the visible range and total count
shown below the reports.

Narrow panels show receiver cards; sufficiently wide panels put the map and
table side by side. Page size follows the available height and text size.
In a short pane, choose **Map** or **List** to give that view more room. The
information button opens **Report details** with timestamps, origin, source
attribution and warnings. Long details are paginated too.

## Refreshes and interpreting reports

While visible, the panel checks RBN at most once per minute for each
callsign/report-window combination. Multiple panels watching the same query
share results. A failed refresh retains cached reports within the selected
time window and marks the failure. Reports expire as they age; the in-memory
cache does not survive an extension restart. A successful check with no reports
is different from a failed check. **Checked** and **Heard** show when data was
fetched and when your signal was last reported.

The simplified world geography is bundled in the package, so the map needs no
tile downloads or internet connection. New reception reports need internet
access. See [map attribution and licenses](assets/MAP_ATTRIBUTION.md).

Reports come from the RBN website's undocumented `spots.php` endpoint, which
can change or become unavailable. If its 500-report limit is reached, the panel
warns that reports may be missing. Receiver coordinates come from the exact
receiver's RBN metadata and are approximate reception locations.

SNR depends on each receiver's antenna and noise environment; comparisons at
the same receiver, band, and mode are most useful. Reception paths do not outline a
coverage boundary, and no recent reports do not establish a transmitter problem.
All RBN modes are included without a mode filter, including CW, PSK31, RTTY,
FT8, and FT4. Unrecognized mode codes remain visible with a numeric label.
This version focuses on your signal; it does not add a hunting feed or a
native Spots source.

## Try it without transmitting

1. Choose a currently active CW station from the public
   [POTA spots](https://pota.app/) and note its reported grid or location.
   An active POTA spot does not guarantee a recent RBN report.
2. Create a separate, empty test operation with a station callsign such as
   `K1ABC/TEST` and a title such as **RBN TEST — observing K1ABC**.
3. Add the panel and set **Watch callsign** to the real public callsign, such
   as `K1ABC`. Set **Map origin grid** to that station's reported grid, or give
   the test operation that location. Keep the operation's `/TEST` marker; the
   panel displays a test notice identifying whose reports it is observing.
4. Inspect the map and list. Keep this observation operation empty, without
   logging fictitious contacts or using spot/CQ posting controls.

The examples are placeholders; choose a station active at the time of testing.
For building from source, static previews, native acceptance steps and the
earlier HTML investigation, see the
[development and migration notes](../../../docs/RBN-SVG-MIGRATION.md).
