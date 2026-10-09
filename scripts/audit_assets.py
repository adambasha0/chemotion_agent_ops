#!/usr/bin/env python3
"""Which images each documentation tree uses, and which are safe to remove.

Written for the release pass, where a version folder has to be left describing
only what that version does: references to removed controls go, and the assets
behind them go with them - except that `static/img` is ONE namespace shared by
every tree, so deleting a file because v3 stopped using it can break the
current tree, silently, in a build that only fails later.

    audit_assets.py --docs /path/to/chemotion_saurus [--tree v3] [--json]

Reports, per tree: references, missing files (these break the build), and
assets only that tree uses. Plus the shared set, which no single tree may
delete.
"""
import argparse, json, os, re, sys
from collections import defaultdict

IMG = re.compile(r'(?:src=["\']|\]\(|url\(["\']?)(/?[\w./-]*?img/[\w./-]+?\.'
                 r'(?:png|jpe?g|gif|webp|svg|webm|mp4))')
EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.webm', '.mp4')
DOC_EXT = ('.mdx', '.md')


def trees(docs):
    out = {}
    if os.path.isdir(os.path.join(docs, 'docs')):
        out['current'] = 'docs'
    vd = os.path.join(docs, 'versioned_docs')
    if os.path.isdir(vd):
        for d in sorted(os.listdir(vd)):
            if d.startswith('version-'):
                out[d[len('version-'):]] = os.path.join('versioned_docs', d)
    return out


def refs_in_tree(docs, rel):
    """{normalised img path -> [pages that reference it]}"""
    found = defaultdict(list)
    root = os.path.join(docs, rel)
    for dirpath, _, names in os.walk(root):
        for n in names:
            if not n.endswith(DOC_EXT):
                continue
            page = os.path.relpath(os.path.join(dirpath, n), docs)
            try:
                body = open(os.path.join(dirpath, n), encoding='utf-8',
                            errors='replace').read()
            except OSError:
                continue
            for m in IMG.findall(body):
                # Everything resolves against static/, however it was written.
                p = m[m.index('img/'):]
                found[p].append(page)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--docs', required=True)
    ap.add_argument('--tree', help='report one tree in detail (e.g. v3, current)')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    tr = trees(a.docs)
    if not tr:
        sys.exit(f'no documentation trees under {a.docs}')
    if a.tree and a.tree not in tr:
        sys.exit(f'unknown tree {a.tree!r}; have: {", ".join(tr)}')

    static = os.path.join(a.docs, 'static')
    on_disk = set()
    for dirpath, _, names in os.walk(os.path.join(static, 'img')):
        for n in names:
            if n.lower().endswith(EXT):
                on_disk.add(os.path.relpath(os.path.join(dirpath, n), static))

    per_tree = {name: refs_in_tree(a.docs, rel) for name, rel in tr.items()}
    users = defaultdict(set)
    for name, refs in per_tree.items():
        for p in refs:
            users[p].add(name)

    referenced = set(users)
    missing = sorted(referenced - on_disk)
    orphans = sorted(on_disk - referenced)
    shared = sorted(p for p, u in users.items() if len(u) > 1)

    if a.json:
        print(json.dumps({
            'trees': tr,
            'on_disk': len(on_disk),
            'referenced': len(referenced),
            'missing': missing,
            'orphans': orphans,
            'shared': {p: sorted(users[p]) for p in shared},
            'exclusive': {name: sorted(p for p in refs if users[p] == {name})
                          for name, refs in per_tree.items()},
        }, indent=2))
        return 1 if missing else 0

    o = []
    o.append('# Asset audit')
    o.append('')
    o.append(f'{len(on_disk)} file(s) under `static/img`, {len(referenced)} '
             f'referenced by {len(tr)} tree(s): ' + ', '.join(sorted(tr)) + '.')
    o.append('')

    if missing:
        o.append('## Referenced but not on disk')
        o.append('')
        o.append('`onBrokenMarkdownImages` is `throw`, so each of these fails '
                 'the build.')
        o.append('')
        for p in missing:
            o.append(f'- `{p}` ← ' + ', '.join(
                f'`{pg}`' for u in sorted(users[p]) for pg in per_tree[u][p][:2]))
        o.append('')

    o.append('## Per tree')
    o.append('')
    o.append('| tree | references | only this tree |')
    o.append('|---|---|---|')
    for name, refs in sorted(per_tree.items()):
        excl = [p for p in refs if users[p] == {name}]
        o.append(f'| {name} | {len(refs)} | {len(excl)} |')
    o.append('')
    o.append(f'**{len(shared)} asset(s) are used by more than one tree.** '
             'Removing a reference in one version does NOT make the file '
             'deletable: `static/img` is one namespace for every version.')
    o.append('')

    if a.tree:
        refs = per_tree[a.tree]
        excl = sorted(p for p in refs if users[p] == {a.tree})
        sh = sorted(p for p in refs if len(users[p]) > 1)
        o.append(f'## {a.tree} in detail')
        o.append('')
        o.append(f'### Safe to delete with the reference ({len(excl)})')
        o.append('')
        o.append('No other tree uses these.')
        o.append('')
        for p in excl:
            o.append(f'- `{p}` ← ' + ', '.join(f'`{x}`' for x in refs[p][:3]))
        o.append('')
        o.append(f'### Shared — remove the reference only ({len(sh)})')
        o.append('')
        for p in sh:
            o.append(f'- `{p}` also used by: '
                     + ', '.join(sorted(users[p] - {a.tree})))
        o.append('')

    if orphans:
        o.append(f'## Referenced by nothing ({len(orphans)})')
        o.append('')
        o.append('Left behind by an earlier edit. Deleting them changes no '
                 'page, but check `git log` first - an asset can be waiting '
                 'for a branch that has not merged.')
        o.append('')
        for p in orphans[:60]:
            o.append(f'- `{p}`')
        if len(orphans) > 60:
            o.append(f'- …and {len(orphans) - 60} more')
        o.append('')

    print('\n'.join(o))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
