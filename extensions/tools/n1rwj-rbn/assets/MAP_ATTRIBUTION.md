# Bundled map data and geometry

The extension bundles coarse country geometry, simplified state/province
boundaries, and country label positions; drawing or reopening its map never
downloads image tiles. The map is a reception diagram, not a navigation map.
Receiver positions and countries come from the [RBN node directory](https://www.reversebeacon.net/nodes/), cached by Ham2K for seven days, with HamDB registered grids supplied by Vail ReRBN as a fallback. Positions are approximate.
Lines indicate reports at those receivers, not a measured coverage boundary.

The source file `src/map/earth-110m.json` contains the 177 country geometries in
[`@d3-maps/atlas@1.0.0/world/countries/countries-110m`](https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-110m),
derived from Natural Earth at 1:110 million scale. TopoJSON arcs were expanded into
GeoJSON rings, country metadata removed, and longitude/latitude values rounded to
three decimals. No points were otherwise simplified. This keeps the full world
data small enough to include directly in the `.h2kext` JavaScript bundle.

The source files `src/map/admin1-boundaries.json` and
`src/map/geographic-labels.json` derive directly from the Natural Earth repository's
**v5.1.2** snapshot:

- [10m internal administrative boundary lines](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_1_states_provinces_lines.geojson)
  cover most countries worldwide. Connected segments are joined at degree-two
  endpoints while preserving junctions, simplified with Douglas–Peucker at a
  longitude/latitude tolerance of 0.1 degrees, then rounded to two decimal places.
  Duplicate consecutive coordinates and lines that collapse to a point are
  removed. All source scale ranks are included: 8,991 output lines and 28,276
  coordinates. Minified GeoJSON is 412,556 bytes, or approximately 119 KB with gzip.
- [110m countries](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_admin_0_countries.geojson)
  supply 177 label candidates from `LABEL_X`, `LABEL_Y`, and `LABELRANK`.
  Labels use `NAME_LONG` when at most 20 characters, otherwise `NAME`.
  Coordinates are rounded to two decimals. The renderer chooses a sparse,
  non-overlapping subset; these are geographic labels, not receiver locations.

To reproduce these two files from the repository root, run
`mise run rbn:geography`, then `mise run format`. The generator pins the source tag
and verifies SHA-256 checksums before generating either file. It uses Node's
built-in modules and does not add a runtime dependency. The source checksums are:

```text
1a1f30ccaaf4cc9c4bde34266f0b8cbb955d3a4cf254b756912255f2ec7c75b6  ne_10m_admin_1_states_provinces_lines.geojson
6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f  ne_110m_admin_0_countries.geojson
```

The [Natural Earth admin-1 dataset](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/)
omits some tiny countries and disputed areas. It uses Natural Earth's standard
de facto boundaries. Its 10m source is simplified for this regional reception map;
it is neither a detailed local basemap nor an authoritative boundary reference.

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
