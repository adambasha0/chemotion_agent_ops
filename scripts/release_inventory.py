#!/usr/bin/env python3
"""What changed between two ELN releases, as a documentation work list.

The first step of a release documentation pass: turn a commit range into a
grouped inventory of merged pull requests, each with the user-facing strings it
moved and the documentation pages that mention them. The output is a checklist
to work through, not a summary to read.

    release_inventory.py --repo ComPlat/chemotion_ELN --from v3.1.2 --to v3.1.3 \
        --eln /path/to/chemotion_ELN --docs /path/to/chemotion_saurus

Needs `gh` authenticated for the PR titles and labels; without it, falls back
to commit subjects and says so.
"""
import argparse, json, os, re, subprocess, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pre_triage import classify, labels, parse_diff, grep_docs, tree_of  # noqa: E402

# Labels that decide whether a change is likely to need documentation at all.
DOC_RELEVANT = {'feature', 'enhancement', 'bug', 'chemistry', 'epic'}
IGNORE = {'dependencies', 'ci', 'chore', 'style', 'testing'}
# Labels are applied unevenly on this repository - most PRs in a release range
# carry none at all - so fall back to the conventional-commit prefix, which is
# applied consistently because the title convention is enforced.
PREFIX = re.compile(r'^(feat|fix|perf|refactor|style|chore|test|docs|ci|build)'
                    r'(?:\([^)]*\))?!?:')
PREFIX_GROUP = {'feat': 'feature', 'fix': 'bug', 'perf': 'enhancement',
                'refactor': 'enhancement', 'style': '_ignore',
                'chore': '_ignore', 'test': '_ignore', 'docs': '_ignore',
                'ci': '_ignore', 'build': '_ignore'}


def sh(args, cwd=None):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True).stdout


def merged_prs(repo, a, b, eln):
    """PR numbers in the range, from merge commit subjects, enriched via gh."""
    log = sh(['git', 'log', '--format=%H%x1f%s', f'{a}..{b}'], cwd=eln)
    rows = []
    for line in log.splitlines():
        if '\x1f' not in line:
            continue
        sha, subject = line.split('\x1f', 1)
        m = re.search(r'#(\d+)', subject)
        rows.append({'sha': sha, 'subject': subject,
                     'pr': int(m.group(1)) if m else None})
    nums = sorted({r['pr'] for r in rows if r['pr']})
    meta = {}
    for n in nums:
        out = sh(['gh', 'pr', 'view', str(n), '--repo', repo,
                  '--json', 'number,title,labels,url'])
        if not out.strip():
            continue
        try:
            d = json.loads(out)
        except json.JSONDecodeError:
            continue
        meta[n] = {'title': d['title'], 'url': d['url'],
                   'labels': [l['name'] for l in d.get('labels', [])]}
    return rows, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='ComPlat/chemotion_ELN')
    ap.add_argument('--from', dest='a', required=True)
    ap.add_argument('--to', dest='b', required=True)
    ap.add_argument('--eln', required=True)
    ap.add_argument('--docs', required=True)
    ap.add_argument('--max-strings', type=int, default=40)
    x = ap.parse_args()

    for ref in (x.a, x.b):
        if not sh(['git', 'rev-parse', '--verify', ref], cwd=x.eln).strip():
            sys.exit(f'{ref} is not a ref in {x.eln} - fetch tags first')

    rows, meta = merged_prs(x.repo, x.a, x.b, x.eln)
    diff = sh(['git', 'diff', f'{x.a}..{x.b}'], cwd=x.eln)
    files = parse_diff(diff)
    by_kind = defaultdict(list)
    for p in files:
        by_kind[classify(p)].append(p)

    ui_removed, ui_added = [], []
    for p in by_kind['ui']:
        ui_removed += labels(files[p]['removed'])
        ui_added += labels(files[p]['added'])
    gone = [s for s in dict.fromkeys(ui_removed) if s not in set(ui_added)]
    new = [s for s in dict.fromkeys(ui_added) if s not in set(ui_removed)]

    stale = {}
    for s in gone[:x.max_strings]:
        hits = grep_docs(x.docs, s)
        if hits:
            stale[s] = hits

    o = []
    o.append(f'# Documentation work list: {x.a} → {x.b}')
    o.append('')
    o.append(f'{len(rows)} commit(s), {len(meta)} pull request(s), '
             f'{len(files)} file(s) changed.')
    o.append('')
    if not meta:
        o.append('> No pull request metadata: `gh` is not authenticated, or the '
                 'merges carry no `#number`. The commit subjects below are all '
                 'there is to go on.')
        o.append('')

    # Grouped by label, because the label decides how much work each one is.
    groups = defaultdict(list)
    for n, d in sorted(meta.items()):
        ls = set(d['labels'])
        if ls & DOC_RELEVANT:
            for l in sorted(ls & DOC_RELEVANT):
                groups[l].append((n, d))
        elif ls & IGNORE:
            groups['_ignore'].append((n, d))
        else:
            m = PREFIX.match(d['title'])
            groups[PREFIX_GROUP.get(m.group(1), '_unlabelled') if m
                   else '_unlabelled'].append((n, d))

    o.append('## Work through these')
    o.append('')
    for label in sorted(k for k in groups if not k.startswith('_')):
        o.append(f'### {label} ({len(groups[label])})')
        o.append('')
        for n, d in groups[label]:
            o.append(f'- [ ] **#{n}** {d["title"]}  <{d["url"]}>')
        o.append('')
    if groups['_unlabelled']:
        o.append(f'### unclassified ({len(groups["_unlabelled"])}) — '
                 'no label and no recognised title prefix, so read these')
        o.append('')
        for n, d in groups['_unlabelled']:
            o.append(f'- [ ] **#{n}** {d["title"]}  <{d["url"]}>')
        o.append('')
    if groups['_ignore']:
        o.append(f'<details><summary>{len(groups["_ignore"])} dependency, CI, '
                 'chore, style, docs and test PRs — no documentation expected'
                 '</summary>')
        o.append('')
        for n, d in groups['_ignore']:
            o.append(f'- #{n} {d["title"]}')
        o.append('')
        o.append('</details>')
        o.append('')

    if stale:
        o.append('## Pages that name a control this release removes')
        o.append('')
        o.append('Fix these first: they tell a reader to click something that '
                 'is no longer there.')
        o.append('')
        o.append('| removed string | page | tree |')
        o.append('|---|---|---|')
        for s, hits in stale.items():
            for p in hits:
                o.append(f'| `{s}` | `{p}` | {tree_of(p)} |')
        o.append('')

    if new:
        o.append('## New user-facing strings')
        o.append('')
        o.append('Each one is either a thing to document or a deliberate '
                 'omission. Decide, do not skip.')
        o.append('')
        for s in new[:x.max_strings]:
            o.append(f'- [ ] `{s}`')
        o.append('')

    kinds = ', '.join(f'{len(v)} {k}' for k, v in sorted(by_kind.items()) if v)
    o.append('## Shape of the change')
    o.append('')
    o.append(f'{kinds}.')
    o.append('')
    if by_kind['migration']:
        o.append('Migrations in this range, so a field a reader can see may '
                 'have appeared or moved:')
        o.append('')
        for p in sorted(by_kind['migration']):
            o.append(f'- `{p}`')
        o.append('')
    print('\n'.join(o))


if __name__ == '__main__':
    main()
