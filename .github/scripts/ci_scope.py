"""Classify CI work conservatively; only explicit administrative files are exempt."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess


def load_policy(repo):
    policy = json.loads((Path(repo) / '.github/ci-policy.json').read_text(encoding='utf-8'))
    paths = policy['administrative_docs']
    if not paths or len(set(paths)) != len(paths):
        raise ValueError('Invalid administrative-document allowlist')
    for name in paths:
        if (not isinstance(name, str) or not name or name.startswith('/')
                or '\\' in name or '..' in PurePosixPath(name).parts
                or any(ord(c) < 32 or c in '*?[]' for c in name)
                or not name.endswith(('.md', '.json'))):
            raise ValueError('Invalid administrative-document path')
        if (PurePosixPath(name).parts[0] in {'.github', 'source', 'app', 'build', 'tests', 'scripts',
                                           'chrome_extension', 'desktop-helper', 'gradle'}
                or (name.endswith('.json') and name != 'PROJECT_STATUS.json')):
            raise ValueError('Runtime, dependency and CI paths cannot be administrative documents')
    jobs = policy['full_jobs']
    if not jobs or len(set(jobs)) != len(jobs) or not all(re.fullmatch(r'[a-z][a-z0-9-]*', j) for j in jobs):
        raise ValueError('Invalid full-validation job list')
    return policy


def classify_files(paths, allowed):
    return 'docs' if paths and all(p in allowed for p in paths) else 'full'


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL)


def change_scope(repo, event_name, event, allowed):
    if event_name not in ('push', 'pull_request'):
        return 'full', 'Manual or unknown event: full validation required.'
    try:
        base = event['pull_request']['base']['sha'] if event_name == 'pull_request' else event['before']
        if not isinstance(base, str) or not re.fullmatch(r'[0-9a-f]{40}', base) or base == '0' * 40:
            return 'full', 'Missing or initial base: full validation required.'
        # Compare the complete event range, not just its final commit. --no-renames
        # retains both sides of a rename so a moved runtime file cannot look like docs.
        data = git(repo, 'diff', '--no-renames', '--name-only', '-z', base, 'HEAD', '--')
        paths = [p.decode('utf-8', errors='strict') for p in data.split(b'\0') if p]
        mode = classify_files(paths, allowed)
        if mode == 'docs':
            git(repo, 'diff', '--check', base, 'HEAD', '--')
            for name in paths:
                if name.endswith('.json') and (Path(repo) / name).is_file():
                    json.loads((Path(repo) / name).read_text(encoding='utf-8'))
        return mode, ('Only recognized administrative documents changed.' if mode == 'docs'
                      else 'Runtime, build, tests, policy or unknown files: full validation required.')
    except (KeyError, TypeError, ValueError, OSError, subprocess.CalledProcessError):
        return 'full', 'Scope could not be established safely: full validation required.'


def evaluate_gate(mode, needs, policy):
    full_jobs = set(policy['full_jobs'])
    always = set(policy.get('always_jobs', [])) | {'scope'}
    if mode not in ('docs', 'full') or set(needs) != full_jobs | always:
        return False
    expected = always if mode == 'docs' else always | full_jobs
    return all(value.get('result') == ('success' if name in expected else 'skipped')
               for name, value in needs.items())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gate', action='store_true', help='Require aggregate results; never fall back to scope detection.')
    args = parser.parse_args()
    repo = Path(os.environ.get('GITHUB_WORKSPACE', '.')).resolve()
    policy = load_policy(repo)
    # A malformed status document should fail the lightweight job, rather than
    # accidentally pass unrelated runtime checks after conservative escalation.
    status = repo / 'PROJECT_STATUS.json'
    if status.is_file() and 'PROJECT_STATUS.json' in policy['administrative_docs']:
        json.loads(status.read_text(encoding='utf-8'))
    if args.gate:
        if not os.environ.get('CI_GATE_NEEDS'):
            raise SystemExit('CI gate requires explicit dependency results.')
        needs = json.loads(os.environ['CI_GATE_NEEDS'])
        mode = needs.get('scope', {}).get('outputs', {}).get('mode')
        if not evaluate_gate(mode, needs, policy):
            raise SystemExit('CI gate rejected missing, failed, cancelled or unexpectedly skipped validation.')
        print('CI gate accepted the required ' + mode + ' validation path.')
        return
    try:
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
    except (KeyError, ValueError, OSError):
        event = {}
    mode, reason = change_scope(repo, os.environ.get('GITHUB_EVENT_NAME'), event, policy['administrative_docs'])
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
        f.write('mode=' + mode + '\n')
    print(mode + ': ' + reason)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write('### CI validation scope\n\n' + mode + ': ' + reason + '\n')


if __name__ == '__main__':
    main()
