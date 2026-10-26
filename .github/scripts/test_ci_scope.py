"""Regression boundaries for selective CI, using real temporary Git histories."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sys
import unittest

from ci_scope import change_scope, classify_files, evaluate_gate, load_policy


ALLOWED = ['AI_HANDOFF.md', 'PROJECT_STATUS.json', 'docs/CI_COST_CONTROLS.md']
POLICY = {'administrative_docs': ALLOWED, 'full_jobs': ['runtime'], 'always_jobs': ['secrets']}


class ScopeTests(unittest.TestCase):
    def test_administrative_batch(self):
        self.assertEqual(classify_files(ALLOWED, ALLOWED), 'docs')

    def test_unknown_and_security_sensitive_files_force_full(self):
        for path in ['source/main.cjs', 'app/src/main/App.kt', 'package-lock.json',
                     'build/windows-build.cjs', 'tests/example.test.cjs',
                     '.github/ci-policy.json', '.github/scripts/ci_scope.py',
                     '.github/workflows/ci.yml', 'docs/ANDROID_COMPANION_CONTRACT.md',
                     'docs/USER_GUIDE.md', 'README_NEW.md', 'AI_HANDOFF.md\nsource/main.cjs']:
            with self.subTest(path=path):
                self.assertEqual(classify_files(['AI_HANDOFF.md', path], ALLOWED), 'full')

    def test_empty_is_not_documentation(self):
        self.assertEqual(classify_files([], ALLOWED), 'full')

    def test_unknown_or_manual_event_always_full(self):
        for event in ['workflow_dispatch', 'merge_group', None]:
            self.assertEqual(change_scope('.', event, {}, ALLOWED)[0], 'full')

    def test_invalid_or_initial_base_always_full(self):
        for before in [None, '0' * 40, 'bad', '$(echo unsafe)']:
            self.assertEqual(change_scope('.', 'push', {'before': before}, ALLOWED)[0], 'full')

    def test_gate_rejects_failed_missing_cancelled_and_unexpected_skips(self):
        good = {'scope': {'result': 'success'}, 'secrets': {'result': 'success'}, 'runtime': {'result': 'success'}}
        self.assertTrue(evaluate_gate('full', good, POLICY))
        for name in good:
            for result in ['failure', 'cancelled', 'skipped', None]:
                bad = {k: dict(v) for k, v in good.items()}
                bad[name]['result'] = result
                self.assertFalse(evaluate_gate('full', bad, POLICY))
            bad = {k: v for k, v in good.items() if k != name}
            self.assertFalse(evaluate_gate('full', bad, POLICY))
        self.assertFalse(evaluate_gate('', good, POLICY))
        self.assertFalse(evaluate_gate('full', {**good, 'unknown': {'result': 'success'}}, POLICY))

    def test_docs_gate_requires_real_scope_and_security_success(self):
        needs = {'scope': {'result': 'success'}, 'secrets': {'result': 'success'}, 'runtime': {'result': 'skipped'}}
        self.assertTrue(evaluate_gate('docs', needs, POLICY))
        needs['secrets']['result'] = 'failure'
        self.assertFalse(evaluate_gate('docs', needs, POLICY))
        needs['secrets']['result'] = 'success'
        needs['runtime']['result'] = 'cancelled'
        self.assertFalse(evaluate_gate('docs', needs, POLICY))

    def test_allowlist_rejects_wildcards_traversal_and_duplicates(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / '.github').mkdir()
            for paths in [['docs/**'], ['../AI_HANDOFF.md'], ['/tmp/a.md'], ['a.md', 'a.md'], ['a.md\n'],
                          ['.github/ci-policy.json'], ['app/src/main/assets/settings.json'], ['package.json']]:
                (root / '.github/ci-policy.json').write_text(json.dumps({**POLICY, 'administrative_docs': paths}))
                with self.assertRaises(ValueError):
                    load_policy(root)

    def test_gate_cli_fails_closed_if_environment_is_not_wired(self):
        self.assertNotEqual(self.run_gate(None).returncode, 0)

    def test_gate_cli_rejects_failed_runtime_and_accepts_success(self):
        needs = {'scope': {'result': 'success', 'outputs': {'mode': 'full'}},
                 'secrets': {'result': 'success'}, 'runtime': {'result': 'failure'}}
        self.assertNotEqual(self.run_gate(needs).returncode, 0)
        needs['runtime']['result'] = 'success'
        self.assertEqual(self.run_gate(needs).returncode, 0)

    def run_gate(self, needs):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / '.github').mkdir()
            (root / '.github/ci-policy.json').write_text(json.dumps(POLICY), encoding='utf-8')
            env = dict(os.environ, GITHUB_WORKSPACE=td)
            env.pop('CI_GATE_NEEDS', None)
            if needs is not None:
                env['CI_GATE_NEEDS'] = json.dumps(needs)
            return subprocess.run([sys.executable, str(Path(__file__).with_name('ci_scope.py')), '--gate'],
                                  env=env, capture_output=True, text=True)


class GitRangeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.email', 'ci-test@example.invalid')
        self.git('config', 'user.name', 'Synthetic CI test')
        self.write('AI_HANDOFF.md', 'Initial\n')
        self.write('runtime.cjs', 'initial\n')
        self.commit()
        self.base = self.git('rev-parse', 'HEAD').decode().strip()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.DEVNULL)

    def write(self, name, text):
        p = self.repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding='utf-8')

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'synthetic fixture')

    def scope(self, base=None, event='push'):
        base = base or self.base
        data = {'before': base} if event == 'push' else {'pull_request': {'base': {'sha': base}}}
        return change_scope(self.repo, event, data, ALLOWED)[0]

    def test_actual_documentation_diff(self):
        self.write('AI_HANDOFF.md', 'Updated\n')
        self.commit()
        self.assertEqual(self.scope(), 'docs')

    def test_entire_pr_range_includes_earlier_runtime_change(self):
        self.write('runtime.cjs', 'changed\n')
        self.commit()
        self.write('AI_HANDOFF.md', 'Only the final commit is docs\n')
        self.commit()
        self.assertEqual(self.scope(event='pull_request'), 'full')

    def test_runtime_moved_to_allowed_doc_still_full(self):
        (self.repo / 'AI_HANDOFF.md').unlink()
        self.git('mv', 'runtime.cjs', 'AI_HANDOFF.md')
        self.commit()
        self.assertEqual(self.scope(), 'full')

    def test_runtime_deletion_with_docs_still_full(self):
        (self.repo / 'runtime.cjs').unlink()
        self.write('AI_HANDOFF.md', 'Updated\n')
        self.commit()
        self.assertEqual(self.scope(), 'full')

    def test_unavailable_history_defaults_full(self):
        self.assertEqual(self.scope('1' * 40), 'full')

    def test_invalid_document_json_defaults_full(self):
        self.write('PROJECT_STATUS.json', '{ invalid')
        self.commit()
        self.assertEqual(self.scope(), 'full')


class PackageDownloadTests(unittest.TestCase):
    """CI transport policy; real package installation remains a hosted release gate."""
    def setUp(self):
        workflow = (Path(__file__).parents[1] / 'workflows/ci.yml').read_text(encoding='utf-8')
        self.step = workflow.split('- name: Install Windows runtime cross-compiler', 1)[1].split('\n      - ', 1)[0]

    def test_official_https_mirrors_replace_slow_azure_priority(self):
        self.assertIn('https://archive.ubuntu.com/ubuntu/', self.step)
        self.assertIn('https://security.ubuntu.com/ubuntu/', self.step)
        self.assertIn('sudo tee /etc/apt/apt-mirrors.txt', self.step)
        self.assertNotIn('http://', self.step)

    def test_unknown_runner_layout_fails_instead_of_silently_missing_override(self):
        guard = "grep -Fq 'mirror+file:/etc/apt/apt-mirrors.txt' /etc/apt/sources.list.d/ubuntu.sources"
        self.assertIn(guard, self.step)
        self.assertLess(self.step.index(guard), self.step.index('sudo tee'))
        self.assertNotIn('|| true', self.step)

    def test_downloads_are_bounded_without_weakening_package_trust(self):
        self.assertIn('sudo timeout --kill-after=15s 5m apt-get', self.step)
        self.assertIn('sudo timeout --kill-after=15s 8m apt-get', self.step)
        self.assertIn('Acquire::Retries=2', self.step)
        self.assertIn('Acquire::https::Timeout=30', self.step)
        self.assertIn('g++-mingw-w64-x86-64-posix cmake ninja-build', self.step)
        for unsafe in ['allow-unauthenticated', 'AllowInsecure', 'Verify-Peer=false',
                       'Verify-Host=false', 'trusted=yes', 'apt-key', 'Signed-By:']:
            self.assertNotIn(unsafe, self.step)


if __name__ == '__main__':
    unittest.main()
