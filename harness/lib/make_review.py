#!/usr/bin/env python3
"""Build review.html from the provenance sidecars.

Every claim on the page comes from a .json sidecar written by the flow that
produced the asset, so the page cannot state an assertion the run did not make.
There is no hand-written asset list: tasks are discovered, and a task with no
sidecar shows up as missing rather than being quietly left out.

    python3 harness/lib/make_review.py [--out review.html]
"""
import base64, html, json, os, sys

OPS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TASKS = os.path.join(OPS, 'harness', 'tasks')
DEST = os.path.join(OPS, 'review.html')
MIME = {'.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'}
INLINE_LIMIT = 4 * 1024 * 1024   # bigger assets are linked, not embedded


def assets(task_dir):
    out = os.path.join(task_dir, 'out')
    if not os.path.isdir(out):
        return []
    found = []
    for f in sorted(os.listdir(out)):
        stem, ext = os.path.splitext(f)
        if ext not in MIME:
            continue
        side = os.path.join(out, stem + '.json')
        meta = None
        if os.path.exists(side):
            try:
                meta = json.load(open(side))
            except json.JSONDecodeError as e:
                meta = {'_broken': str(e)}
        found.append((os.path.join(out, f), ext, meta))
    return found


def embed(path, ext):
    if os.path.getsize(path) > INLINE_LIMIT:
        return None
    b = base64.b64encode(open(path, 'rb').read()).decode()
    return f'data:{MIME[ext]};base64,{b}'


def render(task, items):
    rows = [f'<h2 id="{html.escape(task)}">{html.escape(task)}</h2>']
    if not items:
        rows.append('<p class="bad">no asset in out/ — the flow has not run, '
                    'or it threw before writing one.</p>')
        return '\n'.join(rows)
    for path, ext, meta in items:
        name = os.path.basename(path)
        rows.append('<section class="asset">')
        rows.append(f'<h3>{html.escape(name)}</h3>')
        if meta is None:
            rows.append('<p class="bad">NO SIDECAR — this asset carries no evidence '
                        'and publish.sh will refuse it.</p>')
        elif '_broken' in meta:
            rows.append(f'<p class="bad">unreadable sidecar: {html.escape(meta["_broken"])}</p>')
        else:
            a = meta.get('assertions_passed') or []
            cls = 'ok' if a else 'bad'
            rows.append(f'<dl><dt>shows</dt><dd>{html.escape(str(meta.get("shows", "—")))}</dd>'
                        f'<dt>doc</dt><dd>{html.escape(str(meta.get("doc", "—")))}</dd>'
                        f'<dt>recorded</dt><dd>{html.escape(str(meta.get("recorded_at", "—")))}</dd>'
                        f'<dt>ELN commit</dt><dd>{html.escape(str(meta.get("git_sha", "—"))[:12])}</dd>'
                        f'<dt>sha256</dt><dd>{html.escape(str(meta.get("sha256", "—"))[:16])}…</dd></dl>')
            rows.append(f'<p class="{cls}">{len(a)} assertion(s) passed'
                        + ('' if a else ' — publish.sh will refuse this') + '</p>')
            if meta.get('kind') != 'png' and meta.get('start_marked') is False:
                rows.append('<p class="bad">the take was not marked: it opens on '
                            'the navigation that led to the subject</p>')
            if a:
                rows.append('<ul>' + ''.join(f'<li>{html.escape(x)}</li>' for x in a) + '</ul>')
        src = embed(path, ext)
        if src:
            rows.append(f'<img src="{src}" alt="{html.escape(name)}">')
        else:
            rows.append(f'<p><a href="{html.escape(os.path.relpath(path, OPS))}">'
                        f'{html.escape(name)}</a> (too large to inline)</p>')
        rows.append('</section>')
    return '\n'.join(rows)


def main():
    dest = DEST
    if '--out' in sys.argv:
        dest = sys.argv[sys.argv.index('--out') + 1]
    names = sorted(d for d in os.listdir(TASKS)
                   if os.path.isdir(os.path.join(TASKS, d)) and d != 'TEMPLATE')
    body, total, unevidenced = [], 0, 0
    for t in names:
        items = assets(os.path.join(TASKS, t))
        total += len(items)
        unevidenced += sum(1 for _, _, m in items
                           if not m or '_broken' in m or not (m.get('assertions_passed') or []))
        body.append(render(t, items))
    style = """
body{font:15px/1.55 system-ui,sans-serif;margin:0;padding:2rem 1.25rem 4rem;max-width:60rem}
h1{font-size:1.5rem}h2{margin-top:2.5rem;border-bottom:1px solid #ccc;padding-bottom:.3rem}
h3{font-family:ui-monospace,monospace;font-size:.95rem;margin:.2rem 0}
.asset{margin:1.5rem 0;padding:1rem;border:1px solid #ddd;border-radius:4px}
img{max-width:100%;border:1px solid #ccc;margin-top:.7rem}
dl{display:grid;grid-template-columns:auto 1fr;gap:.1rem .8rem;margin:.6rem 0;font-size:.85rem}
dt{color:#666}dd{margin:0;font-family:ui-monospace,monospace}
ul{font-size:.85rem;margin:.4rem 0 0;padding-left:1.1rem}
.ok{color:#17642a;font-weight:600}.bad{color:#a01b1b;font-weight:600}
nav a{margin-right:1rem}
"""
    nav = ' '.join(f'<a href="#{html.escape(t)}">{html.escape(t)}</a>' for t in names)
    head = (f'<h1>Capture review</h1><p>{len(names)} task(s), {total} asset(s), '
            f'<span class="{"bad" if unevidenced else "ok"}">{unevidenced} without evidence'
            '</span>.</p><nav>' + nav + '</nav>')
    open(dest, 'w').write(f'<!doctype html><meta charset="utf-8"><title>Capture review</title>'
                          f'<style>{style}</style>{head}' + '\n'.join(body))
    print(f'{dest}: {len(names)} tasks, {total} assets, {unevidenced} without evidence')
    return 1 if unevidenced else 0


if __name__ == '__main__':
    sys.exit(main())
