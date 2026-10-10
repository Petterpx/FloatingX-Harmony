#!/usr/bin/env python3
"""Build only tagged sources and attach verified assets to an existing Release."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import subprocess
import tarfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
LOCK = json.loads((TOOLS / 'toolchain.json').read_text())
TAG_RE = re.compile(r'v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?')
SOURCE_ROOTS = {'AppScope', 'entry', 'floatingx', 'hvigor', 'tests'}
SOURCE_FILES = {'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'oh-package-lock.json5',
                'package.json', 'package-lock.json', 'tsconfig.core.json', 'LICENSE'}
PRIVATE_SUFFIXES = {'.p12', '.pfx', '.pem', '.key', '.cer', '.crt', '.p7b', '.jks', '.keystore'}
EXCLUDED_PARTS = {'work', '.git', '.hvigor', 'build', 'node_modules', 'oh_modules', 'ohosTest', '__pycache__'}


def run(*args, cwd=ROOT, env=None):
    subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=True)


def output(*args, cwd=ROOT, env=None):
    return subprocess.check_output(list(map(str, args)), cwd=cwd, env=env, text=True).strip()


def version_from_tag(tag):
    match = TAG_RE.fullmatch(tag)
    if not match:
        raise ValueError('Release tag must be vX.Y.Z or vX.Y.Z-prerelease')
    major, minor, patch = map(int, match.group(1, 2, 3))
    pre = match.group(4)
    if pre and any(part.isdigit() and len(part) > 1 and part[0] == '0' for part in pre.split('.')):
        raise ValueError('Numeric prerelease identifiers must not have leading zeros')
    code = major * 1000000 + minor * 1000 + patch + 1
    if minor > 999 or patch > 999 or code > 2147483647:
        raise ValueError('Release version cannot fit HarmonyOS versionCode')
    return tag[1:], code


def resolve_tag(repo, tag):
    version_from_tag(tag)
    return output('git', 'rev-parse', '--verify', f'refs/tags/{tag}^{{commit}}', cwd=repo)


def archive_source(repo, commit, stage):
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Expected full source commit SHA')
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    archive = subprocess.check_output(['git', 'archive', commit], cwd=repo)
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for member in source.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not path.parts:
                raise ValueError('Unsafe archive path')
            if path.parts[0] not in SOURCE_ROOTS and member.name not in SOURCE_FILES:
                continue
            if set(path.parts) & EXCLUDED_PARTS or path.suffix in PRIVATE_SUFFIXES or path.name.startswith('.env'):
                continue
            if path.name in {'local.properties'} or path.name.startswith('local-signing'):
                continue
            if not member.isfile():
                continue  # Never copy symlinks or other special files.
            dest = stage.joinpath(*path.parts)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as stream, dest.open('wb') as target:
                shutil.copyfileobj(stream, target)


def update_json(path, mutate):
    data = json.loads(path.read_text())
    mutate(data)
    path.write_text(json.dumps(data, indent=2) + '\n')


def prepare_stage(stage, tag):
    version, code = version_from_tag(tag)
    update_json(stage / 'floatingx/oh-package.json5', lambda data: data.update(version=version))
    index = stage / 'floatingx/Index.ets'
    text, count = re.subn(r"(FLOATINGX_VERSION: string = )'[^']+'", lambda match: match[1] + repr(version), index.read_text())
    if count != 1:
        raise ValueError('Missing unique public version constant')
    index.write_text(text)
    update_json(stage / 'AppScope/app.json5', lambda data: data['app'].update(versionName=version, versionCode=code))
    def profile(data):
        data['app']['signingConfigs'] = []
        for product in data['app']['products']:
            product.pop('signingConfig', None)
            product.update(compileSdkVersion=12, compatibleSdkVersion=12, targetSdkVersion=12, runtimeOS='OpenHarmony')
    update_json(stage / 'build-profile.json5', profile)
    for module in ['entry', 'floatingx']:
        update_json(stage / module / 'src/main/module.json5', lambda data: data['module'].update(
            deviceTypes=['default' if item == 'phone' else item for item in data['module']['deviceTypes']]))
    # Old lock formats are not installed silently: the pinned OHPM validates them.
    lock = stage / 'entry/oh-package-lock.json5'
    if lock.exists():
        def local_version(data):
            for package in data.get('packages', {}).values():
                if package.get('name') == 'floatingx':
                    package['version'] = version
        update_json(lock, local_version)


def binary_names(tag):
    version_from_tag(tag)
    return [f'floatingx-{tag}.har', f'floatingx-demo-{tag}-openharmony-api12-unsigned.hap']


def asset_names(tag):
    return binary_names(tag) + ['SHA256SUMS', 'manifest.json']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_packages(out, tag):
    version, code = version_from_tag(tag)
    har_name, hap_name = binary_names(tag)
    with tarfile.open(out / har_name) as har:
        package = json.load(har.extractfile('package/oh-package.json5'))
        index = har.extractfile('package/Index.ets').read().decode()
        har_module = json.load(har.extractfile('package/src/main/module.json'))
        if package['version'] != version or f"FLOATINGX_VERSION: string = '{version}'" not in index:
            raise ValueError('Packaged HAR does not match the Release version')
    with zipfile.ZipFile(out / hap_name) as hap:
        hap_module = json.loads(hap.read('module.json'))
    expected = {'versionName': version, 'versionCode': code, 'minAPIVersion': 12,
                'targetAPIVersion': 12, 'compileSdkType': 'OpenHarmony',
                'compileSdkVersion': LOCK['sdk']['version']}
    for module in [har_module, hap_module]:
        if any(module['app'].get(key) != value for key, value in expected.items()):
            raise ValueError('Packaged version/API/SDK does not match the Release manifest')


def write_metadata(out, tag, commit, versions):
    assets = [{'name': name, 'sha256': digest(out / name), 'bytes': (out / name).stat().st_size} for name in binary_names(tag)]
    manifest = {'schemaVersion': 1, 'tag': tag, 'commit': commit, 'version': version_from_tag(tag)[0],
                'sourceCommit': commit, 'toolingCommit': output('git', 'rev-parse', 'HEAD'),
                'sdk': LOCK['sdk'], 'tools': versions, 'sdkComponents': ['ets', 'js', 'native', 'toolchains'], 'demo': {'runtimeOS': 'OpenHarmony', 'api': 12, 'signed': False},
                'assets': assets}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    names = binary_names(tag) + ['manifest.json']
    (out / 'SHA256SUMS').write_text(''.join(f'{digest(out / name)}  {name}\n' for name in names))


def check_existing_manifest(manifest, tag, commit):
    if manifest.get('tag') != tag or manifest.get('commit') != commit:
        raise ValueError('Existing Release assets belong to another tag/commit; refusing replacement')


def validate_assets(out, tag, commit):
    if set(path.name for path in out.iterdir()) != set(asset_names(tag)):
        raise ValueError('Expected exactly four Release assets')
    manifest = json.loads((out / 'manifest.json').read_text())
    check_existing_manifest(manifest, tag, commit)
    if {item['name'] for item in manifest['assets']} != set(binary_names(tag)):
        raise ValueError('Unexpected manifest binaries')
    for item in manifest['assets']:
        path = out / item['name']
        if path.stat().st_size != item['bytes'] or digest(path) != item['sha256']:
            raise ValueError('Asset hash or size mismatch')
    expected = ''.join(f'{digest(out / name)}  {name}\n' for name in binary_names(tag) + ['manifest.json'])
    if (out / 'SHA256SUMS').read_text() != expected:
        raise ValueError('Checksum file mismatch')


def build(args):
    tag = args.tag
    commit = resolve_tag(ROOT, tag)
    stage = args.work / 'source'
    assets = args.work / 'assets'
    shutil.rmtree(assets, ignore_errors=True)
    archive_source(ROOT, commit, stage)
    prepare_stage(stage, tag)
    env = os.environ.copy()
    env.pop('DEVECO_SDK_HOME', None)
    env.update(OHOS_SDK_HOME=str(args.sdk.resolve()), NODE_PATH=str(TOOLS / 'node_modules'))
    (stage / 'local.properties').write_text(f'sdk.dir={args.sdk.resolve()}\n')
    node = output('node', '--version')
    if node != 'v' + LOCK['node']:
        raise ValueError(f'Expected Node {LOCK["node"]}, found {node}')
    ohpm = output(args.ohpm.resolve(), '--version', env=env)
    if ohpm != LOCK['ohpm']['version']:
        raise ValueError(f'Expected OHPM {LOCK["ohpm"]["version"]}, found {ohpm}')
    run('npm', 'ci', '--ignore-scripts', cwd=stage)
    run('npm', 'run', 'test:core', cwd=stage)
    run(args.ohpm.resolve(), 'install', '--all', '--strict_ssl', 'true', cwd=stage, env=env)
    hvigor = TOOLS / 'node_modules/@ohos/hvigor/bin/hvigor.js'
    for module, task in [('floatingx', 'assembleHar'), ('entry', 'assembleHap')]:
        run('node', hvigor, '--mode', 'module', '-p', f'module={module}@default', '-p', 'product=default',
            '-p', 'buildMode=release', task, '--no-daemon', cwd=stage, env=env)
    produced = [stage / 'floatingx/build/default/outputs/default/floatingx.har',
                stage / 'entry/build/default/outputs/default/entry-default-unsigned.hap']
    if not all(path.is_file() and path.stat().st_size > 0 for path in produced):
        raise ValueError('Build did not produce both expected fresh packages')
    assets.mkdir(parents=True)
    for source, name in zip(produced, binary_names(tag)):
        shutil.copyfile(source, assets / name)
    versions = {'node': node, 'ohpm': ohpm, 'hvigor': LOCK['hvigor'], 'hvigorOhosPlugin': LOCK['hvigorOhosPlugin'],
                'os': platform.system(), 'architecture': platform.machine(),
                'npmToolchainLockSha256': digest(TOOLS / 'package-lock.json')}
    verify_packages(assets, tag)
    write_metadata(assets, tag, commit, versions)
    validate_assets(assets, tag, commit)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output_file:
            output_file.write(f'tag={tag}\ncommit={commit}\n')
    print(f'Built {tag} at {commit}: {assets}')


def provenance_label(tag, commit):
    return f'FloatingX tag={tag} sourceCommit={commit}'


def check_recovery_labels(existing, tag, commit):
    owned = [asset for name, asset in existing.items() if name in asset_names(tag)]
    label = provenance_label(tag, commit)
    if any(asset.get('label') != label for asset in owned):
        raise ValueError('Existing assets lack matching recovery provenance; refusing replacement')


def replace_assets(request, base, upload_url, existing, assets, tag, commit):
    label = provenance_label(tag, commit)
    # Preserve source provenance on existing assets before any destructive replacement.
    # If manifest POST fails after DELETE, these labels allow only same-commit recovery.
    for name in asset_names(tag):
        if name in existing and existing[name].get('label') != label:
            request(base + f'/releases/assets/{existing[name]["id"]}', method='PATCH',
                    data=json.dumps({'label': label}).encode())
    for name in ['manifest.json'] + binary_names(tag) + ['SHA256SUMS']:
        if name in existing:
            request(base + f'/releases/assets/{existing[name]["id"]}', method='DELETE')
        query = urllib.parse.urlencode({'name': name, 'label': label})
        request(upload_url + '?' + query, method='POST',
                data=(assets / name).read_bytes(), content_type='application/octet-stream')


def publish(args):
    """The only operation that needs a write token. Never creates Releases."""
    version_from_tag(args.tag)
    validate_assets(args.assets, args.tag, args.commit)
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
        raise ValueError('Invalid GitHub repository')
    token = os.environ['GH_TOKEN']
    base = f'https://api.github.com/repos/{args.repository}'
    def request(url, method='GET', data=None, content_type='application/json'):
        if not url.startswith(('https://api.github.com/', 'https://uploads.github.com/')):
            raise ValueError('Untrusted GitHub API URL')
        req = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': content_type, 'User-Agent': 'FloatingX-Release'})
        with urllib.request.urlopen(req, timeout=180) as response:
            body = response.read()
            return json.loads(body) if body else None
    release = request(base + '/releases/tags/' + urllib.parse.quote(args.tag, safe=''))
    if release['draft'] or release['tag_name'] != args.tag:
        raise ValueError('Expected an existing published Release for this tag')
    current = request(base + '/commits/' + urllib.parse.quote(args.tag, safe=''))
    if current['sha'] != args.commit:
        raise ValueError('Tag changed after build; refusing upload')
    existing = {asset['name']: asset for asset in release['assets']}
    manifest_asset = existing.get('manifest.json')
    if manifest_asset is not None and manifest_asset.get('state') == 'starter':
        # GitHub may retain an empty starter asset after a failed (e.g. 502) POST.
        # Never parse it as a manifest; recovery still requires every target label.
        check_recovery_labels(existing, args.tag, args.commit)
    elif manifest_asset is not None:
        if manifest_asset.get('state') != 'uploaded':
            raise ValueError('Unexpected manifest asset state; refusing replacement')
        # This repository is public. Use its public download URL without forwarding credentials.
        url = existing['manifest.json']['browser_download_url']
        expected_prefix = f'https://github.com/{args.repository}/releases/download/'
        if not url.startswith(expected_prefix):
            raise ValueError('Untrusted manifest download URL')
        with urllib.request.urlopen(url, timeout=60) as response:
            check_existing_manifest(json.load(response), args.tag, args.commit)
    else:
        check_recovery_labels(existing, args.tag, args.commit)
    upload_url = release['upload_url'].split('{', 1)[0]
    replace_assets(request, base, upload_url, existing, args.assets, args.tag, args.commit)
    print(f'Uploaded four assets to existing Release {args.tag}')


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    resolve = commands.add_parser('resolve')
    resolve.add_argument('--tag', required=True)
    resolve.add_argument('--repository', required=True)
    build_parser = commands.add_parser('build')
    build_parser.add_argument('--tag', required=True)
    build_parser.add_argument('--sdk', type=Path, required=True)
    build_parser.add_argument('--ohpm', type=Path, required=True)
    build_parser.add_argument('--work', type=Path, required=True)
    publish_parser = commands.add_parser('publish')
    publish_parser.add_argument('--tag', required=True)
    publish_parser.add_argument('--commit', required=True)
    publish_parser.add_argument('--assets', type=Path, required=True)
    publish_parser.add_argument('--repository', required=True)
    args = parser.parse_args()
    if args.command == 'resolve':
        version_from_tag(args.tag)
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
            raise ValueError('Invalid GitHub repository')
        url = f'https://api.github.com/repos/{args.repository}/releases/tags/' + urllib.parse.quote(args.tag, safe='')
        headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'FloatingX-Release',
                   'X-GitHub-Api-Version': '2022-11-28'}
        token = os.environ.get('GH_TOKEN')
        if token:
            headers['Authorization'] = f'Bearer {token}'
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                release = json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise ValueError('No existing published Release for this tag; publish it before rerunning') from error
            raise
        if release['draft']:
            raise ValueError('Release must be published before building assets')
        run('git', 'fetch', '--force', 'origin', f'refs/tags/{args.tag}:refs/tags/{args.tag}')
        print(resolve_tag(ROOT, args.tag))
    elif args.command == 'build':
        build(args)
    else:
        publish(args)


if __name__ == '__main__':
    main()
