# EOT20 Tide Prediction Architecture

## Source data
- Model: EOT20 global empirical ocean tide model (Hart-Davis et al., 2021), CC BY 4.0.
- Source archive: `eot20-ocean-tides-f4.tar.gz` (17 NetCDF files, one per constituent, float32 amplitude/phase), downloaded from a pinned GitHub release and verified by SHA-256.
- Grid: 0.125° resolution, latitude −90..90 (1441 points), longitude 0..360 (2881 points).
- Constituents: 2N2, J1, K1, K2, M2, M4, MF, MM, N2, O1, P1, Q1, S1, S2, SA, SSA, T2.
- Invalid/land cells: amplitude and phase both zero (pyTMD convention); NaN values are also treated as invalid.

## Offline data-preparation pipeline
The standalone utility lives in `tools/eot20-data-preparation/` (Python 3, dependencies in `requirements.txt`: numpy, netCDF4). It runs locally once and produces the static assets under `data/eot20/`.

```bash
cd tools/eot20-data-preparation
python3 -m src.cli --source-dir ../../tmp/eot20-src --output-dir ../../data/eot20
```

Stages, one module each in `src/`:
1. **download** (`src/download.py`) – downloads the archive from the pinned release URL, verifies the expected SHA-256 before extraction, and skips the download entirely if the source files already exist. Downloaded sources are kept separate from generated output.
2. **parse** (`src/parse.py`) – reads each constituent NetCDF (`{NAME}_ocean_eot20.nc`), extracting `lat`, `lon` (float64) and `amplitude`, `phase` (float32). A cell is invalid when `(amplitude == 0 && phase == 0)` or either value is NaN; the grid is valid only where **all 17 constituents** agree on a valid cell, so no constituent contributes a spurious zero.
3. **partition** (`src/partition.py`) – cuts the global grid into 5°×5° blocks (36 latitude × 72 longitude), trims each block to the bounding box of its valid cells, and drops blocks without any valid cell. The global grid yields **2048 tiles**; every valid ocean cell belongs to exactly one tile.
4. **format** (`src/format.py`) – serializes each tile to the binary format below, then writes `eot20-index.json` (per-tile file name, bounds, row/column counts, size, SHA-256) and `metadata.json` (data version, format version, source attribution).

The pipeline is deterministic: a re-run from the same source files reproduces the shipped dataset byte-for-byte (identical index and metadata hashes, identical SHA-256 for all 2048 tiles).

## Tile strategy
- Geographic tiles of approximately 5° latitude x 5° longitude.
- Every valid ocean cell assigned to exactly one tile.
- Browser loads all tiles intersecting a padded bounding box around the query coordinate to preserve interpolation neighbors.
- Tiles are trimmed to their valid sub-region; actual tile size ~219–230 kB (2048 tiles, ~433 MB total).

## Binary format (version 1)
- Magic `EOT2`, format version uint16, data version uint32.
- Grid metadata: nConst uint8, nLat uint16, nLon uint16, then lat0, latStep, lon0, lonStep (float64 each). Header total: 47 bytes.
- Validity mask: one byte per cell (0 = land/invalid, 1 = ocean).
- Per constituent c in index order: amplitude float32[nLat*nLon], then phase float32[nLat*nLon] (row-major, contiguous).
- Units: amplitude in **cm**, phase in **degrees** (0..360, can be negative as stored by EOT20; normalize to [0,360) at prediction time).
- Little-endian. Data start offset (47 + nLat*nLon) is not always 4-byte aligned → decode via DataView/copy, not direct typed-array views.
- Tiles are trimmed: content covers only the valid sub-region of the 5° block (hence nLat/nLon vary, e.g. 40x40, 40x41).

## Browser loading and caching (implemented)
`tides.js` (loaded from `index.html`, invoked fire-and-forget from `api.js`) is a loader-only module:
- `ensureIndex()` – loads and validates `data/eot20/eot20-index.json`.
- `discoverTileRecords(lat, lon)` – finds the index records for a padded bounding box around a coordinate (normalizes −180..180 to 0..360, wraps the date line).
- `loadTile(rec)` / `loadTilesForLocation(lat, lon)` – fetches missing tiles, decodes them, verifies SHA-256 on both network and cached data.
- `constituentsAt(lat, lon, tiles)` – nearest-grid-point amplitude/phase at a coordinate; `null` over land or with no tiles.
- `preloadTideTiles(lat, lon)` – non-blocking, error-isolated entry point wired into the weather request path.

Caching:
- IndexedDB database `eot20` (version 2): store `tiles` (keyPath `key`) + store `meta` (keyPath `key`).
- Cache key: `dataVersion:tileId`. Entries store the verified SHA-256 and the raw buffer.
- On read: cached buffer is re-hashed and compared with the index SHA-256; corrupt or size-mismatched entries are deleted and re-downloaded.
- On dataset change (dataVersion/formatVersion in index differs from `meta`), the tile store is cleared.
- In-memory LRU caches (16 raw buffers, 8 decoded tiles) sit in front of IndexedDB.
- Concurrent requests for the same tile are deduplicated; the app stays interactive while tiles load.

## Current state
- **Implemented:** offline data-preparation pipeline, generated dataset under `data/eot20/`, browser tile loading with IndexedDB caching.
- **Not yet implemented:** tide prediction and high/low-water detection. The UI reads `weatherData.tideExtremes` (currently always empty); prediction logic will build on the loader's `constituentsAt` / `loadTilesForLocation` to interpolate local constituents and find sea-level extrema over a time window.

## Scientific requirements
- No missing values converted to zero amplitude.
- Land/inland water cells marked invalid.
- Bilinear interpolation over valid neighbors; nearest valid fallback.
- No tide prediction for invalid locations.

