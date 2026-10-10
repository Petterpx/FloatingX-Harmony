#!/usr/bin/env python3
"""Install the pinned public toolchain. Cache only verified download archives."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent
LOCK = json.loads((ROOT / 'toolchain.json').read_text())


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def download(item, dest):
    if not dest.exists() or sha256(dest) != item['sha256']:
        dest.unlink(missing_ok=True)
        partial = dest.with_suffix('.partial')
        subprocess.run(['curl', '-fL', '--retry', '3', '--retry-all-errors', '--connect-timeout', '30',
                        '--max-time', '1800', item['url'], '-o', str(partial)], check=True)
        if sha256(partial) != item['sha256']:
            partial.unlink()
            raise ValueError('Official toolchain archive checksum mismatch')
        partial.replace(dest)


def install(dest):
    dest.mkdir(parents=True, exist_ok=True)
    download(LOCK['sdk'], dest / 'sdk.tar.gz')
    download(LOCK['ohpm'], dest / 'ohpm.zip')
    sdk = dest / 'sdk'
    ohpm = dest / 'command-line'
    shutil.rmtree(sdk, ignore_errors=True)
    shutil.rmtree(ohpm, ignore_errors=True)
    sdk.mkdir(); ohpm.mkdir()
    with tarfile.open(dest / 'sdk.tar.gz') as archive:
        for component in ['ets', 'js', 'native', 'toolchains']:
            name = f'sdk/packages/ohos-sdk/darwin/{component}-darwin-arm64-5.0.0.71-Release.zip'
            target = dest / f'{component}.zip'
            with archive.extractfile(name) as source, target.open('wb') as output:
                shutil.copyfileobj(source, output)
            subprocess.run(['unzip', '-q', str(target), '-d', str(sdk / '12')], check=True)
            target.unlink()
    subprocess.run(['unzip', '-q', str(dest / 'ohpm.zip'), '-d', str(ohpm)], check=True)
    bins = [ohpm / 'oh-command-line-tools/ohpm/bin/ohpm']
    if not bins[0].is_file():
        raise ValueError('Unexpected official OHPM archive layout')
    # The official OHPM ZIP ships its shell entrypoint without executable mode.
    bins[0].chmod(0o755)
    subprocess.run([str(bins[0]), '--version'], check=True)
    subprocess.run(['npm', 'ci', '--registry=https://repo.harmonyos.com/npm/', '--prefix', str(ROOT)], check=True)
    return sdk, bins[0]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    args = parser.parse_args()
    sdk, ohpm = install(args.directory.resolve())
    if os.environ.get('GITHUB_ENV'):
        with open(os.environ['GITHUB_ENV'], 'a') as env:
            env.write(f'RELEASE_SDK={sdk}\nRELEASE_OHPM={ohpm}\n')
