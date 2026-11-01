import numpy as np

def make_tiles(lat, lon, valid, tile_deg=5.0):
    tiles = []
    lat_edges = np.arange(lat[0], lat[-1] + tile_deg, tile_deg)
    lon_edges = np.arange(lon[0], lon[-1] + tile_deg, tile_deg)
    for i in range(len(lat_edges)-1):
        for j in range(len(lon_edges)-1):
            lat_mask = (lat >= lat_edges[i]) & (lat < lat_edges[i+1])
            if i == len(lat_edges)-2:
                lat_mask = (lat >= lat_edges[i]) & (lat <= lat_edges[i+1])
            lon_mask = (lon >= lon_edges[j]) & (lon < lon_edges[j+1])
            if j == len(lon_edges)-2:
                lon_mask = (lon >= lon_edges[j]) & (lon <= lon_edges[j+1])
            rows = np.where(lat_mask)[0]
            cols = np.where(lon_mask)[0]
            if len(rows) == 0 or len(cols) == 0:
                continue
            sub = valid[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]
            if not sub.any():
                continue
            tiles.append({
                'id': 'tile_%04d_%04d' % (i, j),
                'row0': int(rows[0]),
                'row1': int(rows[-1]),
                'col0': int(cols[0]),
                'col1': int(cols[-1]),
                'lat_min': float(lat[rows[0]]),
                'lat_max': float(lat[rows[-1]]),
                'lon_min': float(lon[cols[0]]),
                'lon_max': float(lon[cols[-1]]),
            })
    return tiles
