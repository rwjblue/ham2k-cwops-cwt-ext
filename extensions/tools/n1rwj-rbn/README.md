# N1RWJ RBN · My signal

See where the [Reverse Beacon Network](https://www.reversebeacon.net/) has
heard your CW signal, with a reception map and sortable receiver reports.
The extension is a read-only panel: it does not transmit, spot a station,
post to POTA, or create contacts.

Part of the [N1RWJ extension family](../../../README.md).

## Install and open the panel

Build the installable package from the repository root with
`mise run pack n1rwj-rbn`, then install the resulting
`n1rwj-rbn-<version>.h2kext` through Ham2K's extension installer. Add
**RBN · My signal** through an operation's **Edit Layout → Add a Panel**.
If layout editing is unavailable, enable **Enable Layout Customization**
in the app's settings first. Narrow layouts put **Edit Layout** under **Tools**.

**Host compatibility:** This implementation requires Ham2K's native
`svgScene` panel API, including a render environment and placement identity.
Published Ham2K Next 26.9.0 build 170 supplies that API. Live RBN reports,
the native sort menu, both SNR sort directions and pagination have been
verified in that unmodified app. See the
[verification record](../../../docs/VERIFICATION.md) for the complete
native test results and remaining device coverage.

Build 169 lacks the API and shows **App update needed** without making RBN
requests. Its updater initially reported that it was up to date during
the September 21, 2026 check; build 170 was subsequently installed and
used for the native tests.

The extension no longer returns HTML or depends on an HTML host patch.
The earlier custom Dev build is not an installation or testing requirement
for this implementation. See the [verification record](../../../docs/VERIFICATION.md)
for the current published-app checks and the limits of earlier HTML testing.

The panel follows the operation's station callsign. Set the operation's
actual location so it can draw paths and calculate receiver distance and
bearing. The extension uses that location, never a callsign-prefix location
guess. A **Map origin grid** override accepts a 4, 6, or 8 character
Maidenhead locator.

## Map and receiver list

The map shows the operation location, reception paths, and receiver points.
Choose **Fit reporting receivers** for a regional view or
**From my station · distance rings** for an azimuthal view centered on the
operation. Receivers with no published coordinates remain in the list.
The map includes the selected band's located receivers, independent of the
currently visible list page. Only the selected map view and visible report
page are generated for each scene.

The world geography is bundled inside the extension package as simplified
vector data. There are no map tiles, map accounts, or map downloads. The map
remains available without a network connection; new reception reports need
internet access. See [map attribution and licenses](assets/MAP_ATTRIBUTION.md).

Use the view menu to choose **Map + list**, **Map**, or **List**, and the
band menu to select a reported band or **All bands**. The list contains
the latest report from each receiver on each
band, including frequency, SNR, CW speed, age, and—when locations are
known—distance and bearing. The **Sort** menu offers **Heard**, **Receiver**,
**SNR**, **Distance**, **Frequency**, and **Speed**. Use the adjacent direction
button to reverse the order. Missing measurements sort last. The previous
and next buttons move between pages; the footer identifies the visible
range and total report count.

On narrow screens, receiver rows become cards with labeled measurements.
On sufficiently wide screens, the map and list sit side by side. Page size
responds to the available height and text size. In a short pane, choose
**Map** or **List** to give that view more room. The information button opens
**Report details**, with timestamps, origin, source attribution and warnings;
long details are paginated too.

Ham2K renders artwork, text, menu controls and accessibility semantics
natively. The extension receives deliberate button/menu events through
`onEvent`; Ham2K requests a new scene after the action. Sorting rebuilds
the report text in the selected order. View, band, sorting, page and details
choices remain separate for each panel placement across ordinary refreshes.
Session state is bounded to 32 placements and resets when the operation,
panel settings or extension runtime changes. Save preferred view, band,
sort and direction in panel settings for defaults that survive a restart.

Native scenes avoid the HTML panel's WebView and are not subject to its
Linux WebView availability restriction. This is an architectural benefit,
not a measured CPU or battery improvement. Native macOS checks do not
establish Linux or physical-phone behavior, screen-reader acceptance, or
cross-platform performance.

## Reports, refreshes, and offline behavior

Choose a **15, 30, or 60 minute** report window. While the panel is visible,
Ham2K requests updates periodically; repeated renders share a cache and
check RBN at most once per minute for each callsign/window combination.
Concurrent requests for the same view share one request. The client keeps
at most eight cached views, each containing at most 500 reports, in memory.
The cache does not survive an extension runtime restart.

Each HTTPS request has a 1.2-second timeout so a slow RBN response leaves
time for the host to render the panel. A failed refresh retains cached
reports still inside the selected time window and clearly marks the
refresh failure. Reports expire as they age; an offline panel can therefore
eventually show no remaining reports. **Data checked** and **last heard**
are separate timestamps. A successful request with no reports is different
from a failed request.

The data source is the RBN website's undocumented
[`spots.php` endpoint](https://www.reversebeacon.net/spots.php?meta=1),
queried for the exact watched callsign and CW reports. The client reads the
endpoint's schema metadata, handles its version handshake with one retry,
and rejects unknown formats. This endpoint can change or become unavailable.
If the server returns the full 500-report limit, the panel warns that some
reports may be missing. Portable suffixes are matched exactly; `K1ABC`
and `K1ABC/P` are different watched callsigns.

Receiver coordinates come only from the exact receiver's RBN metadata.
They are approximate reception locations, not precise antenna positions.
SNR depends on the receiver's antennas and noise environment; compare
changes at the same receiver and band. Empty regions do not establish a
lack of coverage, and no recent reports do not establish a transmitter
problem. This first version focuses on your signal; it does not add a
hunting feed or native Spots source.

## Try it without transmitting

1. Choose a currently active CW station from the public
   [POTA spots](https://pota.app/) and note its reported grid or operation
   location. An active POTA spot does not guarantee a recent RBN report.
2. Create a separate local operation clearly labeled as a test, using a
   station callsign such as `K1ABC/TEST` and a title such as
   **RBN TEST — observing K1ABC**. Use the observed station's reported
   location, not your home location, for this test operation.
3. In the RBN panel settings, set **Watch callsign** to the real public
   callsign, such as `K1ABC`. Keep the operation's `/TEST` marker; the panel
   displays a test notice identifying whose reports it is observing.
4. Inspect the map and list at desktop and narrow phone widths. Leave the
   operation empty: do not log fictitious contacts or use any spot/CQ
   posting controls.

The examples above are placeholders; select a real station active at the
time of the test. Native testing on published build 170 uses an empty
`W9MET/TEST` operation observing the public POTA station W9MET at EL97ER.
Live reports, SNR ordering in both directions and paging were verified
without logging contacts or posting spots. See the repository's
[verification record](../../../docs/VERIFICATION.md) for the complete
native checks, screenshots and their limits. Unit, bundle and packaging
checks alone do not establish that an installed Ham2K version renders
every control correctly.

Published Next 170 screenshots: [desktop map and table](../../../docs/images/rbn/rbn-next170-desktop.jpg),
[compact map](../../../docs/images/rbn/rbn-next170-phone-map.jpg), and
[compact receiver cards](../../../docs/images/rbn/rbn-next170-phone-list.jpg). The
compact captures use a 448×770 macOS window, not a physical phone.

For a reproducible desktop development check, render the actual bundled
extension through the installed Ham2K JavaScript kernel:

```sh
mise run rbn:preview --call K1ABC --grid FN31 --minutes 30
mise run rbn:preview --call K1ABC --grid FN31 --width 390 --height 844 --view list --sort snr --output dist/rbn-phone.svg
```

Replace the example call and grid with the observed station. The task
builds the extension, loads the installed JavaScript kernel and ES2020
bundle, and invokes the actual panel with live read-only RBN requests and
a synthetic render environment. It writes:

- `dist/rbn-preview.svg`: a labeled static approximation of scene artwork
  and native text; controls and animation are inactive.
- `dist/rbn-preview.scene.json`: the actual scene document.
- `dist/rbn-preview.json`: environment, text, timings, hashes, request
  records and the five-second render budget result.

Use `--output <path.svg>` for another output name, `--width` and `--height`
for panel dimensions, and `--theme dark` for a dark preview. `--view`,
`--band`, `--sort` and `--direction` select the initial presentation.
Browser SVG text measurement differs from Flutter's native text. The
synthetic environment allows this development check even when the installed
app lacks the native scene API; successful kernel execution does not prove
that app can display the scene. The task's `/TEST` operation exists only
in memory and creates no native operation.
