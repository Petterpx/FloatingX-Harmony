import hashlib
import argparse
import importlib.util
import io
import tarfile
import zipfile
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/ci/release.py'

class ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.available = SCRIPT.exists()
        if cls.available:
            spec = importlib.util.spec_from_file_location('release', SCRIPT)
            cls.release = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.release)

    def implementation(self):
        self.assertTrue(self.available, 'release pipeline implementation is missing')
        return self.release

    def test_semver_and_unsafe_tags(self):
        r = self.implementation()
        self.assertEqual(r.version_from_tag('v1.2.3-rc.1'), ('1.2.3-rc.1', 1002004))
        for tag in ['main', 'v01.2.3', 'v1.2.3;echo hi', 'v1.2.3\n', '../v1.2.3', 'v1.2.3-01', 'v2148.0.0']:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                r.version_from_tag(tag)

    def test_archive_uses_tag_commit_and_excludes_private_material(self):
        r = self.implementation()
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / 'repo'; repo.mkdir()
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=repo, text=True).strip()
            git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test')
            (repo / 'floatingx').mkdir(); (repo / 'floatingx/Index.ets').write_text('tagged')
            (repo / 'work').mkdir(); (repo / 'work/private.key').write_text('secret')
            (repo / 'floatingx/signing.p12').write_text('secret')
            git('add', '.'); git('commit', '-qm', 'tag'); git('tag', 'v1.2.3')
            commit = git('rev-parse', 'HEAD')
            (repo / 'floatingx/Index.ets').write_text('main'); git('add', '.'); git('commit', '-qm', 'main')
            stage = Path(tmp) / 'stage'
            self.assertEqual(r.resolve_tag(repo, 'v1.2.3'), commit)
            self.assertNotEqual(git('rev-parse', 'HEAD'), commit)
            r.archive_source(repo, r.resolve_tag(repo, 'v1.2.3'), stage)
            self.assertEqual((stage / 'floatingx/Index.ets').read_text(), 'tagged')
            self.assertFalse((stage / 'work').exists())
            self.assertFalse((stage / '.git').exists())
            self.assertFalse((stage / 'floatingx/signing.p12').exists())

    def test_staging_version_does_not_change_source(self):
        r = self.implementation()
        root = SCRIPT.parents[2]
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp) / 'stage'
            commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
            original = (root / 'build-profile.json5').read_bytes()
            r.archive_source(root, commit, stage)
            r.prepare_stage(stage, 'v2.3.4-beta.1')
            self.assertEqual(json.loads((stage / 'floatingx/oh-package.json5').read_text())['version'], '2.3.4-beta.1')
            self.assertIn("'2.3.4-beta.1'", (stage / 'floatingx/Index.ets').read_text())
            self.assertEqual(json.loads((stage / 'AppScope/app.json5').read_text())['app']['versionCode'], 2003005)
            profile = json.loads((stage / 'build-profile.json5').read_text())['app']['products'][0]
            self.assertEqual(profile['compatibleSdkVersion'], 12)
            self.assertEqual(profile['runtimeOS'], 'OpenHarmony')
            self.assertEqual((root / 'build-profile.json5').read_bytes(), original)

    def test_rejects_packages_with_wrong_version_or_api(self):
        r = self.implementation()
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            metadata = {'app': {'versionName': '1.2.3', 'versionCode': 1002004,
                'minAPIVersion': 12, 'targetAPIVersion': 12, 'compileSdkType': 'OpenHarmony',
                'compileSdkVersion': '5.0.0.71'}}
            with tarfile.open(out / r.binary_names('v1.2.3')[0], 'w:gz') as har:
                for name, value in {'package/oh-package.json5': json.dumps({'version': '1.2.3'}),
                                    'package/Index.ets': "export const FLOATINGX_VERSION: string = '1.2.3';",
                                    'package/src/main/module.json': json.dumps(metadata)}.items():
                    payload = value.encode(); member = tarfile.TarInfo(name); member.size = len(payload)
                    har.addfile(member, io.BytesIO(payload))
            def hap():
                with zipfile.ZipFile(out / r.binary_names('v1.2.3')[1], 'w') as package:
                    package.writestr('module.json', json.dumps(metadata))
            hap()
            self.assertTrue(hasattr(r, 'verify_packages'), 'package metadata verification is missing')
            r.verify_packages(out, 'v1.2.3')
            metadata['app']['minAPIVersion'] = 24
            hap()
            with self.assertRaises(ValueError):
                r.verify_packages(out, 'v1.2.3')
            metadata['app']['minAPIVersion'] = 12
            metadata['app']['versionName'] = '0.0.0'
            hap()
            with self.assertRaises(ValueError):
                r.verify_packages(out, 'v1.2.3')

    def test_rerun_recovers_if_manifest_upload_fails_after_deletion(self):
        r = self.implementation()
        self.assertTrue(hasattr(r, 'replace_assets'), 'recoverable asset replacement is missing')
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            for name in r.binary_names('v1.2.3'):
                (out / name).write_bytes(b'package')
            r.write_metadata(out, 'v1.2.3', 'a' * 40, {})
            assets = {name: {'id': index, 'name': name, 'label': ''}
                      for index, name in enumerate(r.asset_names('v1.2.3'), 1)}
            fail_once = [True]
            def api(url, method='GET', data=None, content_type=None):
                if method in ['PATCH', 'DELETE']:
                    identity = int(url.rsplit('/', 1)[1])
                    name = next(name for name, asset in assets.items() if asset['id'] == identity)
                    if method == 'DELETE':
                        del assets[name]
                    else:
                        assets[name]['label'] = json.loads(data)['label']
                elif method == 'POST':
                    query = r.urllib.parse.parse_qs(r.urllib.parse.urlsplit(url).query)
                    name = query['name'][0]
                    if name == 'manifest.json' and fail_once[0]:
                        fail_once[0] = False
                        raise ConnectionError('Injected manifest upload failure')
                    assets[name] = {'id': max([item['id'] for item in assets.values()] + [0]) + 1,
                                    'name': name, 'label': query['label'][0]}
            base = 'https://api.github.com/repos/owner/repo'
            upload = 'https://uploads.github.com/repos/owner/repo/releases/1/assets'
            with self.assertRaises(ConnectionError):
                r.replace_assets(api, base, upload, dict(assets), out, 'v1.2.3', 'a' * 40)
            self.assertNotIn('manifest.json', assets)
            r.check_recovery_labels(assets, 'v1.2.3', 'a' * 40)
            with self.assertRaises(ValueError):
                r.check_recovery_labels(assets, 'v1.2.3', 'b' * 40)
            r.replace_assets(api, base, upload, dict(assets), out, 'v1.2.3', 'a' * 40)
            self.assertEqual(set(assets), set(r.asset_names('v1.2.3')))

    def github_upload_fixture(self, r, out):
        # A stateful fake GitHub service: failed POST leaves a server-side starter asset.
        tag = 'v1.2.3'; commit = 'a' * 40
        for name in r.binary_names(tag):
            (out / name).write_bytes(b'package')
        r.write_metadata(out, tag, commit, {})
        state = {'commit': commit, 'fail': True, 'mutations': 0}
        assets = {name: {'id': index, 'name': name, 'label': '', 'state': 'uploaded',
                        'browser_download_url': f'https://github.com/owner/repo/releases/download/{tag}/{name}',
                        'data': (out / name).read_bytes()}
                  for index, name in enumerate(r.asset_names(tag), 1)}
        def urlopen(request, timeout=None):
            url = request if isinstance(request, str) else request.full_url
            method = 'GET' if isinstance(request, str) else request.get_method()
            if method == 'GET':
                if '/releases/tags/' in url:
                    payload = {'draft': False, 'tag_name': tag,
                        'upload_url': 'https://uploads.github.com/repos/owner/repo/releases/1/assets{?name,label}',
                        'assets': [{key: value for key, value in asset.items() if key != 'data'}
                                   for asset in assets.values()]}
                elif '/commits/' in url:
                    payload = {'sha': state['commit']}
                else:
                    return io.BytesIO(assets[url.rsplit('/', 1)[1]]['data'])
                return io.BytesIO(json.dumps(payload).encode())
            state['mutations'] += 1
            if method in ['PATCH', 'DELETE']:
                identity = int(url.rsplit('/', 1)[1])
                name = next(name for name, asset in assets.items() if asset['id'] == identity)
                if method == 'DELETE':
                    del assets[name]
                else:
                    assets[name]['label'] = json.loads(request.data)['label']
                return io.BytesIO(b'{}')
            query = r.urllib.parse.parse_qs(r.urllib.parse.urlsplit(url).query)
            name = query['name'][0]
            fail = name == 'manifest.json' and state['fail']
            assets[name] = {'id': max([item['id'] for item in assets.values()] + [0]) + 1,
                'name': name, 'label': query['label'][0], 'state': 'starter' if fail else 'uploaded',
                'data': b'' if fail else request.data,
                'browser_download_url': f'https://github.com/owner/repo/releases/download/{tag}/{name}'}
            if fail:
                state['fail'] = False
                error = r.urllib.error.HTTPError(url, 502, 'Injected upstream failure after asset creation', {}, io.BytesIO(b''))
                error.close()
                raise error
            return io.BytesIO(b'{}')
        args = argparse.Namespace(tag=tag, commit=commit, assets=out, repository='owner/repo')
        return args, assets, state, urlopen

    def test_starter_manifest_from_failed_post_is_recoverable(self):
        r = self.implementation()
        with tempfile.TemporaryDirectory() as tmp:
            args, assets, state, urlopen = self.github_upload_fixture(r, Path(tmp))
            with patch.dict(r.os.environ, {'GH_TOKEN': 'test-token'}), patch.object(r.urllib.request, 'urlopen', urlopen):
                with self.assertRaises(r.urllib.error.HTTPError):
                    r.publish(args)
                self.assertEqual(assets['manifest.json']['state'], 'starter')
                self.assertEqual(assets['manifest.json']['data'], b'')
                r.publish(args)
            self.assertEqual(set(assets), set(r.asset_names(args.tag)))
            self.assertTrue(all(asset['state'] == 'uploaded' for asset in assets.values()))
            self.assertEqual(len({asset['label'] for asset in assets.values()}), 4)
            for name, asset in assets.items():
                self.assertEqual(asset['data'], (args.assets / name).read_bytes())
                self.assertEqual(asset['label'], f'{name} | FloatingX:{args.tag}:{args.commit}')

    def test_legacy_starter_labels_migrate_only_with_matching_tag_and_commit(self):
        r = self.implementation()
        with tempfile.TemporaryDirectory() as tmp:
            args, assets, state, urlopen = self.github_upload_fixture(r, Path(tmp))
            with patch.dict(r.os.environ, {'GH_TOKEN': 'test-token'}), patch.object(r.urllib.request, 'urlopen', urlopen):
                with self.assertRaises(r.urllib.error.HTTPError):
                    r.publish(args)
                for asset in assets.values():
                    asset['label'] = f'FloatingX tag={args.tag} sourceCommit={args.commit}'
                with self.assertRaises(ValueError):
                    r.check_recovery_labels(assets, args.tag, 'b' * 40)
                with self.assertRaises(ValueError):
                    r.check_recovery_labels(assets, 'v1.2.4', args.commit)
                r.publish(args)
            self.assertEqual(len({asset['label'] for asset in assets.values()}), 4)
            for name, asset in assets.items():
                self.assertEqual(asset['label'], f'{name} | FloatingX:{args.tag}:{args.commit}')

    def test_starter_recovery_rejects_missing_labels_and_different_commit(self):
        r = self.implementation()
        for failure in ['manifest-label', 'binary-label', 'new-source-commit', 'moved-remote-tag']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp:
                args, assets, state, urlopen = self.github_upload_fixture(r, Path(tmp))
                with patch.dict(r.os.environ, {'GH_TOKEN': 'test-token'}), patch.object(r.urllib.request, 'urlopen', urlopen):
                    with self.assertRaises(r.urllib.error.HTTPError):
                        r.publish(args)
                    if failure == 'manifest-label':
                        assets['manifest.json']['label'] = ''
                    elif failure == 'binary-label':
                        assets[r.binary_names(args.tag)[0]]['label'] = ''
                    elif failure == 'new-source-commit':
                        args.commit = 'b' * 40; state['commit'] = args.commit
                        r.write_metadata(args.assets, args.tag, args.commit, {})
                    else:
                        state['commit'] = 'b' * 40
                    mutations = state['mutations']
                    with self.assertRaisesRegex(ValueError, 'provenance|Tag changed'):
                        r.publish(args)
                    self.assertEqual(state['mutations'], mutations)

    def test_uploaded_invalid_manifest_never_falls_back_to_labels(self):
        r = self.implementation()
        with tempfile.TemporaryDirectory() as tmp:
            args, assets, state, urlopen = self.github_upload_fixture(r, Path(tmp))
            for name, asset in assets.items():
                asset['label'] = r.provenance_label(args.tag, args.commit, name)
            assets['manifest.json']['data'] = b'not JSON'
            with patch.dict(r.os.environ, {'GH_TOKEN': 'test-token'}), patch.object(r.urllib.request, 'urlopen', urlopen):
                with self.assertRaises(json.JSONDecodeError):
                    r.publish(args)
            self.assertEqual(state['mutations'], 0)

    def assert_resolve_headers_and_missing_release(self, token):
        r = self.implementation()
        def urlopen(request, timeout=None):
            self.assertIsInstance(request, r.urllib.request.Request)
            self.assertEqual(r.urllib.parse.urlsplit(request.full_url).hostname, 'api.github.com')
            self.assertEqual(request.get_header('Accept'), 'application/vnd.github+json')
            self.assertEqual(request.get_header('User-agent'), 'FloatingX-Release')
            self.assertEqual(request.get_header('X-github-api-version'), '2022-11-28')
            self.assertEqual(request.get_header('Authorization'), f'Bearer {token}' if token else None)
            self.assertEqual(timeout, 60)
            error = r.urllib.error.HTTPError(request.full_url, 404, 'Not Found', {}, io.BytesIO(b''))
            error.close()
            raise error
        argv = ['release.py', 'resolve', '--tag', 'v1.2.3', '--repository', 'owner/repo']
        env = {'GH_TOKEN': token} if token else {}
        with patch.dict(r.os.environ, env, clear=True), patch('sys.argv', argv), patch.object(r.urllib.request, 'urlopen', urlopen):
            with self.assertRaisesRegex(ValueError, 'No existing published Release'):
                r.main()

    def test_resolve_uses_scoped_api_read_token_headers(self):
        self.assert_resolve_headers_and_missing_release('test-read-only-token')

    def test_resolve_without_token_supports_public_404_rejection(self):
        self.assert_resolve_headers_and_missing_release(None)

    def test_manifest_detects_tamper_and_rejects_commit_replacement(self):
        r = self.implementation()
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            for name in r.binary_names('v1.2.3'):
                (out / name).write_bytes(b'package')
            r.write_metadata(out, 'v1.2.3', 'a' * 40, {'node': 'v20.20.1'})
            self.assertEqual(set(p.name for p in out.iterdir()), set(r.asset_names('v1.2.3')))
            r.validate_assets(out, 'v1.2.3', 'a' * 40)
            existing = json.loads((out / 'manifest.json').read_text())
            with self.assertRaises(ValueError):
                r.check_existing_manifest(existing, 'v1.2.3', 'b' * 40)
            (out / r.binary_names('v1.2.3')[0]).write_bytes(b'changed')
            with self.assertRaises(ValueError):
                r.validate_assets(out, 'v1.2.3', 'a' * 40)

if __name__ == '__main__':
    unittest.main()
