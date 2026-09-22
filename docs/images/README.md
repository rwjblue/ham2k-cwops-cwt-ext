# README screenshots

These are unmodified screenshots of the native Ham2K macOS app, captured
September 21, 2026 in published **Ham2K Next 26.9.0 build 170**. The RBN map,
receiver, and tune-settings images now show the local compact-layout **0.3.2**
candidate. The installation, contest, and Add a Panel images still show the
published **0.3.1** bundles; those screens are unchanged by the RBN layout work.

Dates, callsigns, exchanges, and versions illustrate the captured UI; they
are not installation requirements. Follow the latest-release links in the
extension guides when installing.

## Installation and contest views

Captured in a 1437×768 window:

- [Installed extensions](extensions-installed.jpg): **Settings → Features & Extensions**,
  filtered to `N1RWJ`, showing all four extensions at **0.3.1**.
- [CWT setup](contests/cwt-setup.jpg) and [logging](contests/cwt-logging.jpg).
- [MST setup](contests/mst-setup.jpg) and [logging](contests/mst-logging.jpg).
- [SST setup](contests/sst-setup.jpg) and [logging](contests/sst-logging.jpg).
- [RBN panel selection](rbn/rbn-add-panel.jpg): **Edit Layout → Add a Panel**.

The contest images reopen existing `N1RWJ/TEST` operations marked **Testing**.
Their saved contacts are synthetic examples from earlier validation. Capturing
these images did not add or change contacts or contest session settings.
CWT images also accompany the upstream CWT guide; they show the personal
adaptation used for native testing, not a side-loaded `ham2k-` package.

## RBN map and receivers

The [desktop](rbn/rbn-desktop.jpg), [compact map](rbn/rbn-compact-map.jpg),
[compact receiver list](rbn/rbn-compact-list.jpg), and
[tune settings](rbn/rbn-settings.jpg) captures show the local **0.3.2** candidate
installed through **Features & Extensions → Install from file**. This is an
unreleased working-tree build, with SHA-256
`a64f6ca88fbe83bdd3f5c452832cf8bc603354e41bcad06d4cf848fa0f3d8416`.

They observe public **WG1V** FT4 reports using a **60-minute** window and an
explicit **FN42FK** origin, the registered grid previously returned by Vail.
This is an approximate origin, not a verified transmitter location. The existing
empty **W8CAR/TEST** operation retains its original title and Testing marker;
the panel watch override identifies WG1V. No contacts or spots were created.

The desktop and settings images are 1380×768; the narrow images are 543×800.
The panel displays 14 receivers, including one without a map location. The
map fills the space below the compact status summary, and the view and band
controls are in the native tune dialog. The native **View** setting switched
successfully between Map and Receivers. The desktop capture was checked at
00:15:01 UTC; the narrow captures at 00:16:47 UTC on September 22
(September 21 local time).

After capture, both desktop and narrow test placements were restored to their
original W8CAR / EN81OK overrides, 15-minute window, All bands, and Map and
receivers view. The updated candidate remains installed. These are macOS
captures, not physical-phone runtime evidence.

The older `rbn-next170-*` images remain as historical evidence for the earlier
SVG migration; they are no longer the current README examples.

See [verification and compatibility](../VERIFICATION.md) for package hashes,
runtime checks, and limitations. Keep capture details here rather than pinning
installation instructions to a release.
