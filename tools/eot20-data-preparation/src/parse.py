import numpy as np
import os
import netCDF4

CONSTITUENTS = ['2N2','J1','K1','K2','M2','M4','MF','MM','N2','O1','P1','Q1','S1','S2','SA','SSA','T2']

FILE_MAP = {
 '2N2':'2N2_ocean_eot20.nc',
 'J1':'J1_ocean_eot20.nc',
 'K1':'K1_ocean_eot20.nc',
 'K2':'K2_ocean_eot20.nc',
 'M2':'M2_ocean_eot20.nc',
 'M4':'M4_ocean_eot20.nc',
 'MF':'MF_ocean_eot20.nc',
 'MM':'MM_ocean_eot20.nc',
 'N2':'N2_ocean_eot20.nc',
 'O1':'O1_ocean_eot20.nc',
 'P1':'P1_ocean_eot20.nc',
 'Q1':'Q1_ocean_eot20.nc',
 'S1':'S1_ocean_eot20.nc',
 'S2':'S2_ocean_eot20.nc',
 'SA':'SA_ocean_eot20.nc',
 'SSA':'SSA_ocean_eot20.nc',
 'T2':'T2_ocean_eot20.nc',
}

def load_constituent(source_dir, name):
    path = os.path.join(source_dir, FILE_MAP[name])
    ds = netCDF4.Dataset(path)
    lat = np.asarray(ds.variables['lat'][:], dtype=np.float64)
    lon = np.asarray(ds.variables['lon'][:], dtype=np.float64)
    amp = np.asarray(ds.variables['amplitude'][:], dtype=np.float32)
    phase = np.asarray(ds.variables['phase'][:], dtype=np.float32)
    ds.close()
    invalid = (amp == 0) & (phase == 0)
    invalid = invalid | np.isnan(amp) | np.isnan(phase)
    amp = np.where(invalid, 0.0, amp).astype(np.float32)
    phase = np.where(invalid, 0.0, phase).astype(np.float32)
    return lat, lon, amp, phase, invalid

def load_all(source_dir):
    lat = None
    lon = None
    amps = {}
    phases = {}
    masks = {}
    for c in CONSTITUENTS:
        la, lo, a, p, inv = load_constituent(source_dir, c)
        if lat is None:
            lat, lon = la, lo
        amps[c] = a
        phases[c] = p
        masks[c] = inv
    combined_invalid = np.ones((len(lat), len(lon)), dtype=bool)
    for c in CONSTITUENTS:
        combined_invalid = combined_invalid & masks[c]
    valid = ~combined_invalid
    return lat, lon, amps, phases, valid
