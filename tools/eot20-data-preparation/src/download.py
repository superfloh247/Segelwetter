import hashlib
import os
import tarfile
import urllib.request

ARCHIVE_URL = 'https://github.com/mattmonkey55-afk/eot20-grids/releases/download/v1.0.0/eot20-ocean-tides-f4.tar.gz'
EXPECTED_SHA256 = '37dfd1707cd58de9b61a0300768e90f75c6e365461c4376b7a01c9ccd42cf893'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def ensure_source(source_dir, cache_dir):
    os.makedirs(source_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)
    # If source already present, skip download.
    if os.path.exists(os.path.join(source_dir, 'M2_ocean_eot20.nc')):
        return source_dir
    archive = os.path.join(cache_dir, 'eot20-ocean-tides-f4.tar.gz')
    if not os.path.exists(archive) or sha256_file(archive) != EXPECTED_SHA256:
        print('Downloading EOT20 source archive...')
        urllib.request.urlretrieve(ARCHIVE_URL, archive)
        if sha256_file(archive) != EXPECTED_SHA256:
            raise RuntimeError('Checksum mismatch for downloaded archive')
    print('Extracting source archive...')
    with tarfile.open(archive, 'r:gz') as tf:
        tf.extractall(source_dir)
    return source_dir
