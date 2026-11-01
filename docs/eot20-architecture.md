# EOT20 Tide Prediction Architecture

## Source data
- Model: EOT20 global empirical ocean tide model (Hart-Davis et al., 2021), CC BY 4.0.
- Source archive: `eot20-ocean-tides-f4.tar.gz` (17 constituents, float32 amplitude/phase).
- Grid: 0.125° resolution, latitude -90..90 (1441), longitude 0..360 (2881).
- Constituents: 2N2, J1, K1, K2, M2, M4, MF, MM, N2, O1, P1, Q1, S1, S2, SA, SSA, T2.
- Invalid/land cells: amplitude and phase both zero (pyTMD convention).

## Processing pipeline
1. Download and verify source archive (SHA-256).
2. Parse NetCDF constituents and build normalized grid.
3. Build validity mask (ocean vs land/invalid; inland water excluded).
4. Partition into geographic tiles (~5°).
5. Serialize compact binary tiles + spatial index + metadata.
6. Browser loads index, selects tiles for current location, caches in IndexedDB.
7. Interpolate constituents and predict high/low water times.

## Tile strategy
- Geographic tiles of approximately 5° latitude x 5° longitude.
- Every valid ocean cell assigned to exactly one tile.
- Browser loads all tiles intersecting a padded bounding box around the query coordinate to preserve interpolation neighbors.
- Tiles are trimmed to their valid sub-region; actual tile size ~219–230 kB (2048 tiles total).

## Binary format (version 1)
- Magic `EOT2`, format version uint16, data version uint32.
- Grid metadata: nConst uint8, nLat uint16, nLon uint16, then lat0, latStep, lon0, lonStep (float64 each). Header total: 47 bytes.
- Validity mask: one byte per cell (0 = land/invalid, 1 = ocean).
- Per constituent c in index order: amplitude float32[nLat*nLon], then phase float32[nLat*nLon] (row-major, contiguous).
- Units: amplitude in **cm**, phase in **degrees** (0..360, can be negative as stored by EOT20; normalize to [0,360) at prediction time).
- Little-endian. Data start offset (47 + nLat*nLon) is not always 4-byte aligned → decode via DataView/copy, not direct typed-array views.
- Tiles are trimmed: content covers only the valid sub-region of the 5° block (hence nLat/nLon vary, e.g. 40x40, 40x41).

## Caching
- IndexedDB database `eot20` (version 2): store `tiles` (keyPath `key`) + store `meta` (keyPath `key`).
- Cache key: `dataVersion:tileId`. Entries store the verified SHA-256 and the raw buffer.
- On read: cached buffer is re-hashed and compared with the index SHA-256; corrupt or size-mismatched entries are deleted and re-downloaded.
- On dataset change (dataVersion/formatVersion in index differs from `meta`), the tile store is cleared.
- In-memory LRU caches (16 raw buffers, 8 decoded tiles) sit in front of IndexedDB.
- Browser-side code in `tides.js` (public: `ensureIndex`, `loadTile`, `loadTilesForLocation`, `discoverTileRecords`, `constituentsAt`, `preloadTideTiles`).

## Scientific requirements
- No missing values converted to zero amplitude.
- Land/inland water cells marked invalid.
- Bilinear interpolation over valid neighbors; nearest valid fallback.
- No tide prediction for invalid locations.
