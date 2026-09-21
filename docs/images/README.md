# README screenshots

These are unmodified screenshots of the native Ham2K macOS app, recaptured
September 21, 2026 after updating all four installed N1RWJ extensions to the
published **0.3.1** bundles. Ham2K's **Features & Extensions** screen confirmed
the installed versions. The host is published **Ham2K Next 26.9.0 build 170**.

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

The [desktop](rbn/rbn-desktop.jpg) capture shows the updated map and receiver
table using the installed published bundle. It observes public reports for
**W8CAR** from an empty `W8CAR/TEST` operation marked **Testing**. The panel's
watch override is `W8CAR`, with map origin `EN81OK`, the public locator of
its POTA activation at **US-9496**. No contacts or spots were created.

The older `rbn-next170-*` images remain as historical evidence for the earlier
SVG migration; they are no longer the current README examples. Updated compact
captures remain pending because the Mac locked during layout setup.

See [verification and compatibility](../VERIFICATION.md) for package hashes,
runtime checks, and limitations. Keep capture details here rather than pinning
installation instructions to a release.
