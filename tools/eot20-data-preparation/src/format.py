import hashlib
import json
import os
import struct

import numpy as np

MAGIC = b"EOT2"
FORMAT_VERSION = 1
DATA_VERSION = 1

def write_tile(path, lat, lon, amp_stack, phase_stack, mask, constituents):
    nlat = len(lat)
    nlon = len(lon)
    nconst = len(constituents)
    with open(path, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack("<HI", FORMAT_VERSION, DATA_VERSION))
        f.write(struct.pack("<BHH", nconst, nlat, nlon))
        f.write(struct.pack("<dddd", float(lat[0]), float(lat[1]-lat[0]), float(lon[0]), float(lon[1]-lon[0])))
        f.write(mask.astype(np.uint8).ravel().tobytes())
        for c in constituents:
            a = np.asarray(amp_stack[c], dtype=np.float32).ravel()
            p = np.asarray(phase_stack[c], dtype=np.float32).ravel()
            f.write(a.tobytes())
            f.write(p.tobytes())
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest(), os.path.getsize(path)

def write_index(path, tiles, constituents):
    with open(path, "w") as f:
        json.dump({
            'formatVersion': FORMAT_VERSION,
            'dataVersion': DATA_VERSION,
            'constituents': constituents,
            'tiles': tiles,
        }, f, indent=2)
