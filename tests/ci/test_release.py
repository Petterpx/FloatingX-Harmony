import hashlib
import importlib.util
import io
import tarfile
import zipfile
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

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
