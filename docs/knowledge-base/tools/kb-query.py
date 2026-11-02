#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识库查询接口（原型）：search / entry / paragraph / chunk / table / figure / anchors"""
import argparse, glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
LAYER = os.path.join(BASE, 'source-layer')
DATA = os.path.join(BASE, '..', '..', 'backend', 'src', 'domain',
                    'recipe-designer', 'knowledge-base', 'data')

_cache = {}


def docs():
    if 'docs' not in _cache:
        d = {}
        for f in glob.glob(os.path.join(LAYER, '*.json')):
            if f.endswith('_stats.json'):
                continue
            x = json.load(open(f))
            d[x['docId']] = x
        _cache['docs'] = d
    return _cache['docs']


def paragraphs():
    if 'para' not in _cache:
        m = {}
        for did, d in docs().items():
            for p in d['paragraphs']:
                m[p['id']] = dict(p, docId=did)
        _cache['para'] = m
    return _cache['para']


def entries():
    if 'ent' in _cache:
        return _cache['ent']
    out = {}
    for f in glob.glob(os.path.join(DATA, '*.ts')):
        raw = open(f, encoding='utf-8').read()
        for m in re.finditer(r"\n  \{\n    id: '([^']+)'([\s\S]*?)\n  \},", '\n' + raw):
            eid, body = m.group(1), m.group(2)
            t = re.search(r"title:\s*\n?\s*'([^']*)'", body)
            s = re.search(r"summary:\s*\n?\s*'([^']*)'", body)
            cites = []
            for obj in re.findall(r'\{[^{}]*\}', body):
                src = re.search(r"source: '([^']+)'", obj)
                sid = re.search(r"sourceId: '([^']+)'", obj)
                loc = re.search(r"(?:chapter|locator): '([^']*)'", obj)
                if src or sid:
                    cites.append({'source': (src or sid).group(1),
                                  'locator': loc.group(1) if loc else ''})
            out[eid] = {'id': eid, 'title': t.group(1) if t else '',
                        'summary': s.group(1) if s else '', 'citations': cites}
    _cache['ent'] = out
    return out


def anchors():
    if 'anc' not in _cache:
        a = json.load(open(os.path.join(BASE, 'citation-anchors.json')))
        by = {}
        for x in a:
            if 'confidence' in x:
                by.setdefault(x['entry'], []).append(x)
        _cache['anc'] = by
    return _cache['anc']


def tables():
    if 'tab' not in _cache:
        t = {}
        for f in glob.glob(os.path.join(BASE, 'tables', 'T*.json')):
            d = json.load(open(f))
            t[d['tableId']] = d
        _cache['tab'] = t
    return _cache['tab']


def cmd_search(a):
    q = a.text.lower()
    hits = []
    for pid, p in paragraphs().items():
        if q in p['text'].lower():
            hits.append(p)
            if len(hits) >= a.limit:
                break
    for h in hits:
        print(f"[{h['id']}] {h['docId']} p{h.get('pageStart')}\n    {h['text'][:160]}...")
    if not hits:
        print('未命中')


def cmd_entry(a):
    e = entries().get(a.id)
    if not e:
        print('未找到条目'); return
    print(f"{e['id']}  {e['title']}\n{e['summary']}\n出处 {len(e['citations'])} 条：")
    for x in anchors().get(a.id, []):
        pid = ','.join(x.get('paragraphs') or []) or (x.get('section') or '-')
        print(f"  · {x.get('source')} / {(x.get('chapter') or '')[:40]} → {x['confidence']} {pid}")


def cmd_paragraph(a):
    p = paragraphs().get(a.id)
    print(p['text'] if p else '未找到段落')


def cmd_table(a):
    t = tables().get(a.id)
    if not t:
        print('未找到表格'); return
    print(t.get('caption', ''))
    print(' | '.join(t.get('columns') or []))
    for r in (t.get('rows') or [])[:a.limit]:
        print(' | '.join(r))


def cmd_chunk(a):
    path = os.path.join(BASE, 'chunks.jsonl')
    for line in open(path, encoding='utf-8'):
        d = json.loads(line)
        if d['chunkId'] == a.id:
            print(d['text']); return
    print('未找到检索块')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('search'); s.add_argument('text'); s.add_argument('--limit', type=int, default=5)
    s.set_defaults(fn=cmd_search)
    s = sub.add_parser('entry'); s.add_argument('id'); s.set_defaults(fn=cmd_entry)
    s = sub.add_parser('paragraph'); s.add_argument('id'); s.set_defaults(fn=cmd_paragraph)
    s = sub.add_parser('table'); s.add_argument('id'); s.add_argument('--limit', type=int, default=10)
    s.set_defaults(fn=cmd_table)
    s = sub.add_parser('chunk'); s.add_argument('id'); s.set_defaults(fn=cmd_chunk)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
