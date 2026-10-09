#!/usr/bin/env python3
"""Mechanical doc-impact triage: what the diff changed, and which docs pages say so.

Deterministic on purpose. It runs before the agent and without a model, so the
plumbing is provable on its own and the agent's judgement is an addition rather
than a dependency. It reports signals, never a decision it cannot support.

    pre_triage.py --diff pr.diff --docs ./saurus [--pr 123] [--range a..b]

Writes markdown on stdout. Exit 0 always: having nothing to say is an answer.
"""
import argparse, os, re, subprocess, sys
from collections import defaultdict

# A user-facing string: quoted, has a letter, and is either several words or a
# capitalised phrase. Tuned to catch button labels and headings while leaving
# out class names, keys, paths and i18n ids.
STRING = re.compile(r"""['"`]([^'"`\n]{4,80})['"`]""")
# Half the labels in this codebase are JSX text rather than quoted strings -
# <Button>Extract from sheet</Button>. Missing those made the first version of
# this script report almost nothing on a diff that renamed two buttons.
JSX_TEXT = re.compile(r'>([^<>{}\n]{4,80})<')
NOT_A_LABEL = re.compile(r"""^(?:[a-z0-9_.\-/]+|[A-Z0-9_]+|\s*|.*[{}<>$\\].*|
                             .*(?:px|rem|%|/api/|https?://).*)$""", re.X)
# A class list reads like a sentence to the rule above: several words, letters,
# no punctuation. Nothing a user ever sees is entirely lowercase hyphenated
# tokens, so drop those - "d-inline-flex align-items-center" is not a label.
CSS_LIKE = re.compile(r'^[a-z0-9]+(?:[-:_][a-z0-9]+)*(?:\s+[a-z0-9]+(?:[-:_][a-z0-9]+)*)+$')
DOC_EXT = ('.mdx', '.md')


def classify(path):
    if '/spec/' in path or path.startswith('spec/'):
        return 'tests'
    if re.search(r'app/javascript/.*\.(jsx?|tsx?)$', path):
        return 'ui'
    if re.search(r'app/api/|lib/chemotion/|app/usecases/', path):
        return 'api'
    if re.search(r'db/migrate/', path):
        return 'migration'
    if re.search(r'app/models/|app/serializers/', path):
        return 'model'
    if re.search(r'\.(yml|yaml|json|lock)$|^Gemfile|^package\.json', path):
        return 'config'
    return 'other'


def parse_diff(text):
    files, cur = defaultdict(lambda: {'added': [], 'removed': [], 'plus': 0, 'minus': 0}), None
    for line in text.splitlines():
        m = re.match(r'^\+\+\+ b/(.+)$', line)
        if m:
            cur = m.group(1)
            continue
        if line.startswith('--- ') or line.startswith('diff --git') or line.startswith('@@'):
            continue
        if cur is None:
            continue
        if line.startswith('+'):
            files[cur]['plus'] += 1
            files[cur]['added'].append(line[1:])
        elif line.startswith('-'):
            files[cur]['minus'] += 1
            files[cur]['removed'].append(line[1:])
    return files


def labels(lines):
    out = []
    for line in lines:
        for s in STRING.findall(line) + JSX_TEXT.findall(line):
            s = s.strip()
            if not s or NOT_A_LABEL.match(s):
                continue
            if not re.search(r'[A-Za-z]{3}', s):
                continue
            if CSS_LIKE.match(s):
                continue
            # several words, or a capitalised phrase
            if ' ' in s or s[:1].isupper():
                out.append(s)
    # stable, deduplicated, longest first: a long phrase is a better search key
    return sorted(set(out), key=lambda x: (-len(x), x))


def grep_docs(docs, needle):
    """Which documentation files mention this string."""
    try:
        r = subprocess.run(['grep', '-rlF', needle, '--include=*.mdx', '--include=*.md', '.'],
                           cwd=docs, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return []
    return sorted(p[2:] for p in r.stdout.split() if p.endswith(DOC_EXT))


def images_in(docs, page):
    try:
        body = open(os.path.join(docs, page), encoding='utf-8', errors='replace').read()
    except OSError:
        return []
    return sorted(set(re.findall(r'[\w./-]*/img/[\w./-]+\.(?:png|gif|webp|jpe?g)', body)))


def tree_of(page):
    if page.startswith('versioned_docs/version-'):
        return page.split('/')[1].replace('version-', '')
    if page.startswith('docs/'):
        return 'current (unreleased)'
    return 'other'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--diff', required=True)
    ap.add_argument('--docs', required=True)
    ap.add_argument('--pr')
    ap.add_argument('--range')
    ap.add_argument('--max-strings', type=int, default=12)
    a = ap.parse_args()

    files = parse_diff(open(a.diff, encoding='utf-8', errors='replace').read())
    by_kind = defaultdict(list)
    for p in files:
        by_kind[classify(p)].append(p)

    ui_removed, ui_added = [], []
    for p in by_kind['ui']:
        ui_removed += labels(files[p]['removed'])
        ui_added += labels(files[p]['added'])
    # A string present on both sides moved; it is not a change in wording.
    gone = [s for s in dict.fromkeys(ui_removed) if s not in set(ui_added)]
    new = [s for s in dict.fromkeys(ui_added) if s not in set(ui_removed)]

    # The strongest signal available without a model: the docs still use a
    # string the UI no longer contains.
    stale = {}
    for s in gone[:a.max_strings]:
        hits = grep_docs(a.docs, s)
        if hits:
            stale[s] = hits
    pages = sorted({p for hits in stale.values() for p in hits})

    out = []
    out.append('## Documentation impact — mechanical pre-triage')
    out.append('')
    if a.range:
        out.append(f'`{a.range}`' + (f' · PR #{a.pr}' if a.pr else ''))
        out.append('')

    counts = ', '.join(f'{len(v)} {k}' for k, v in sorted(by_kind.items()) if v)
    out.append(f'**{len(files)} file(s) changed** — {counts}.')
    out.append('')

    if stale:
        out.append('### Documentation still uses strings this diff removes')
        out.append('')
        out.append('The strongest signal here, and the one that leaves readers '
                   'clicking something that no longer exists.')
        out.append('')
        out.append('| removed string | page | tree |')
        out.append('|---|---|---|')
        for s, hits in stale.items():
            for p in hits:
                out.append(f'| `{s}` | `{p}` | {tree_of(p)} |')
        out.append('')
        imgs = sorted({i for p in pages for i in images_in(a.docs, p)})
        if imgs:
            out.append('Screenshots on those pages, each of which may now show a '
                       'UI that no longer exists:')
            out.append('')
            for i in imgs[:25]:
                out.append(f'- `{i}`')
            if len(imgs) > 25:
                out.append(f'- …and {len(imgs) - 25} more')
            out.append('')
    elif gone:
        out.append('### Strings removed from the UI, not currently in the docs')
        out.append('')
        for s in gone[:a.max_strings]:
            out.append(f'- `{s}`')
        out.append('')

    if new:
        out.append('### New user-facing strings')
        out.append('')
        out.append('Nothing in the documentation describes these yet.')
        out.append('')
        for s in new[:a.max_strings]:
            out.append(f'- `{s}`')
        out.append('')

    # A verdict only where the evidence carries it.
    if stale:
        verdict = ('**docs: needed** — the documentation names a control this '
                   'diff removes or renames.')
    elif new or by_kind['ui']:
        verdict = ('**docs: check** — user-facing code changed; whether it is '
                   'worth documenting is a judgement call.')
    elif by_kind['api'] or by_kind['migration']:
        verdict = ('**docs: check** — no UI change, but the API or the schema '
                   'moved; a reader may still notice.')
    elif set(by_kind) <= {'tests', 'config', 'other'}:
        verdict = ('**docs: none** — only tests, configuration or internals '
                   'changed, and no user-facing string moved.')
    else:
        verdict = '**docs: check** — nothing conclusive in the diff.'
    out.insert(2, verdict)
    out.insert(3, '')

    out.append('---')
    out.append('')
    out.append('_Mechanical: file classification, user-facing string extraction, '
               'and a literal search of the documentation trees. It reports '
               'signals, not judgement — no instance was run and no screen was '
               'looked at._')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
