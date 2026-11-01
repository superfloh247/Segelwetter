import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import download
import format
import parse
import partition

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-dir", default="../../tmp/eot20-src")
    ap.add_argument("--output-dir", default="../../data/eot20")
    ap.add_argument("--cache-dir", default="../../tmp/eot20-cache")
    args = ap.parse_args()

    source_dir = os.path.abspath(args.source_dir)
    output_dir = os.path.abspath(args.output_dir)
    cache_dir = os.path.abspath(args.cache_dir)
    os.makedirs(output_dir, exist_ok=True)
    tiles_dir = os.path.join(output_dir, "tiles")
    os.makedirs(tiles_dir, exist_ok=True)

    source_dir = download.ensure_source(source_dir, cache_dir)
    print("Loading constituents...")
    lat, lon, amps, phases, valid = parse.load_all(source_dir)
    print("Partitioning...")
    tiles_meta_defs = partition.make_tiles(lat, lon, valid, tile_deg=5.0)
    print("Tiles:", len(tiles_meta_defs))

    constituents = parse.CONSTITUENTS
    tile_records = []
    for t in tiles_meta_defs:
        r0, r1 = t["row0"], t["row1"]
        c0, c1 = t["col0"], t["col1"]
        sub_lat = lat[r0:r1+1]
        sub_lon = lon[c0:c1+1]
        amp_stack = {c: amps[c][r0:r1+1, c0:c1+1] for c in constituents}
        phase_stack = {c: phases[c][r0:r1+1, c0:c1+1] for c in constituents}
        mask = valid[r0:r1+1, c0:c1+1]
        fname = t["id"] + ".bin"
        fpath = os.path.join(tiles_dir, fname)
        sha, size = format.write_tile(fpath, sub_lat, sub_lon, amp_stack, phase_stack, mask, constituents)
        tile_records.append({
            "id": t["id"],
            "file": "tiles/" + fname,
            "latMin": float(sub_lat[0]),
            "latMax": float(sub_lat[-1]),
            "lonMin": float(sub_lon[0]),
            "lonMax": float(sub_lon[-1]),
            "rows": [r0, r1],
            "cols": [c0, c1],
            "sha256": sha,
            "size": size,
        })
        print("Wrote", fname, size)

    format.write_index(os.path.join(output_dir, "eot20-index.json"), tile_records, constituents)
    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump({"dataVersion": format.DATA_VERSION, "formatVersion": format.FORMAT_VERSION, "source": "EOT20 ocean tides (CC BY 4.0)"}, f, indent=2)
    print("Done.")

if __name__ == "__main__":
    main()
