# Bundled map data and geometry

The extension bundles coarse country geometry; drawing or reopening its map never
downloads image tiles. The map is a reception diagram, not a navigation map.
Receiver positions come from RBN's reported skimmer locations and are approximate.
Lines indicate reports at those receivers, not a measured coverage boundary.

The source file `src/map/earth-110m.json` contains the 177 country geometries in
[`@d3-maps/atlas@1.0.0/world/countries/countries-110m`](https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-110m),
derived from Natural Earth at 1:110 million scale. TopoJSON arcs were expanded into
GeoJSON rings, country metadata removed, and longitude/latitude values rounded to
three decimals. No points were otherwise simplified. This keeps the full world
data small enough to include directly in the `.h2kext` JavaScript bundle.

Made with Natural Earth. Natural Earth map data is public domain:
<https://www.naturalearthdata.com/about/terms-of-use/>.

The atlas package is MIT licensed, copyright 2026 Georgii Bukharov. Its notice is
retained in [`licenses/atlas-MIT.txt`](licenses/atlas-MIT.txt).

Projection, spherical clipping, and geodesic interpolation use `d3-geo` (ISC),
with its `d3-array` and `internmap` dependencies (ISC). Their license notices are
retained in the [`licenses/`](licenses/) directory alongside this file. All notices
are copied into the `.h2kext` bundle under `assets/`. These dependencies are bundled
locally; the map does not load scripts or geography from a remote service.

The regional view fits the station and receiver positions in a station-centered
azimuthal equidistant projection. The azimuthal view keeps the station in the
middle, with concentric great-circle distance rings. Distances and bearings are
accurate from the station; shapes become more distorted farther from it.
