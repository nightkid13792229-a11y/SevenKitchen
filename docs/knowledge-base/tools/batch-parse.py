#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把归档里的每一份文档解析成 文档/章节/段落，输出 JSON。"""
import glob, json, os, re, sys, zipfile

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
OUT = os.path.join(HERE, '..', 'source-layer')
MAX_P, MIN_P = 800, 40


def norm(t):
    t = t.replace('\u00ad', '')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


def split_long(text):
    if len(text) <= MAX_P:
        return [text]
    parts = re.split(r'(?<=[.。!?！？])\s+', text)
    out, cur = [], ''
    for s in parts:
        if len(cur) + len(s) + 1 > MAX_P and cur:
            out.append(cur.strip()); cur = s
        else:
            cur = (cur + ' ' + s).strip()
    if cur:
        out.append(cur)
    return [x for x in out if len(x) >= MIN_P]


def doc_id(rel):
    return re.sub(r'[^A-Za-z0-9]+', '-', rel.rsplit('.', 1)[0]).strip('-')[:60]


def parse_pdf(path, did):
    doc = fitz.open(path)
    n = doc.page_count
    import collections
    cnt = collections.Counter()
    for i in range(n):
        for b in doc[i].get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            for line in b.get('lines', []):
                for s in line['spans']:
                    cnt[round(s['size'], 1)] += len(s['text'].strip())
    body = cnt.most_common(1)[0][0] if cnt else 10.0

    seen = collections.Counter()
    for i in range(n):
        ls = {norm(''.join(s['text'] for s in line['spans']))
              for b in doc[i].get_text('dict')['blocks'] if b.get('type') == 0
              for line in b.get('lines', [])}
        for x in ls:
            if x and len(x) <= 90:
                seen[x] += 1
    boiler = {x for x, c in seen.items() if c >= 3}

    def is_head(txt, size):
        if size < body * 1.15 or len(txt) > 120 or txt in boiler:
            return False
        if re.fullmatch(r'[\d\s.]*', txt):
            return False
        if len(txt) < 4:
            return False
        if re.search(r'\s\d{2,3}$', txt):
            return False
        if txt.endswith('.') and len(txt) > 60:
            return False
        return True

    secs = [{'id': f'{did}-s000', 'title': '(文档开头)', 'pageNo': 1}]
    paras = []
    cur = secs[0]
    buf, bpage, bsec, last = [], None, None, None

    def flush():
        nonlocal buf, bpage, bsec
        if not buf:
            return
        for piece in split_long(norm(' '.join(buf))):
            paras.append({'id': f'{did}-p{len(paras)+1:05d}', 'sectionId': bsec['id'],
                          'text': piece, 'pageStart': bpage, 'pageEnd': None})
        buf, bpage, bsec = [], None, None

    for i in range(n):
        pno = i + 1
        for b in doc[i].get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            lines = b.get('lines', [])
            if not lines:
                continue
            raw = '\n'.join(''.join(s['text'] for s in line['spans']) for line in lines)
            raw = re.sub(r'-\n(?=[a-z])', '', raw)
            txt = norm(raw)
            if not txt or txt in boiler:
                continue
            size = max(s['size'] for line in lines for s in line['spans'])
            if is_head(txt, size):
                flush()
                if last is not None and cur is last and len(last['title']) < 18 and len(txt) < 45:
                    last['title'] = (last['title'] + ' ' + txt).strip()
                else:
                    cur = {'id': f'{did}-s{len(secs)+1:03d}', 'title': txt, 'pageNo': pno}
                    secs.append(cur); last = cur
                continue
            if buf and bpage == pno and not re.search(r'[.。!?！？]$', norm(' '.join(buf))):
                buf.append(txt)
            else:
                flush(); buf, bpage, bsec = [txt], pno, cur
    flush()
    total_pages = n
    doc.close()
    return {'sections': secs, 'paragraphs': paras, 'pages': total_pages}


def parse_xml(path, did):
    raw = open(path, encoding='utf-8', errors='ignore').read()
    secs = [{'id': f'{did}-s000', 'title': '(文档开头)', 'pageNo': None}]
    paras = []
    # JATS: <sec><title>..</title><p>..</p></sec>
    for m in re.finditer(r'<sec[^>]*>(.*?)</sec>', raw, re.S):
        blk = m.group(1)
        t = re.search(r'<title[^>]*>(.*?)</title>', blk, re.S)
        title = re.sub(r'<[^>]+>', '', t.group(1)).strip() if t else '(无标题小节)'
        sec = {'id': f'{did}-s{len(secs)+1:03d}', 'title': norm(title)[:200], 'pageNo': None}
        secs.append(sec)
        for p in re.finditer(r'<p[^>]*>(.*?)</p>', blk, re.S):
            txt = norm(re.sub(r'<[^>]+>', ' ', p.group(1)))
            if len(txt) >= MIN_P:
                paras.append({'id': f'{did}-p{len(paras)+1:05d}', 'sectionId': sec['id'],
                              'text': txt, 'pageStart': None, 'pageEnd': None})
    return {'sections': secs, 'paragraphs': paras, 'pages': None}


def parse_epub(path, did):
    secs = [{'id': f'{did}-s000', 'title': '(文档开头)', 'pageNo': None}]
    paras = []
    with zipfile.ZipFile(path) as z:
        for name in sorted(z.namelist()):
            if not name.lower().endswith(('.xhtml', '.html', '.htm')):
                continue
            html = z.read(name).decode('utf-8', 'ignore')
            t = re.search(r'<title[^>]*>(.*?)</title>', html, re.S)
            sec = {'id': f'{did}-s{len(secs)+1:03d}',
                   'title': norm(re.sub(r'<[^>]+>', '', t.group(1)))[:200] if t else name,
                   'pageNo': None}
            secs.append(sec)
            for p in re.finditer(r'<p[^>]*>(.*?)</p>', html, re.S):
                txt = norm(re.sub(r'<[^>]+>', ' ', p.group(1)))
                if len(txt) >= MIN_P:
                    paras.append({'id': f'{did}-p{len(paras)+1:05d}', 'sectionId': sec['id'],
                                  'text': txt, 'pageStart': None, 'pageEnd': None})
    return {'sections': secs, 'paragraphs': paras, 'pages': None}


def parse_text(path, did):
    raw = open(path, encoding='utf-8', errors='ignore').read()
    secs = [{'id': f'{did}-s000', 'title': '(全文)', 'pageNo': None}]
    paras = []
    for blk in re.split(r'\n\s*\n', raw):
        txt = norm(blk)
        if len(txt) < MIN_P:
            continue
        for piece in split_long(txt):
            paras.append({'id': f'{did}-p{len(paras)+1:05d}', 'sectionId': secs[0]['id'],
                          'text': piece, 'pageStart': None, 'pageEnd': None})
    return {'sections': secs, 'paragraphs': paras, 'pages': None}


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(ROOT, '**', '*'), recursive=True))
    stats, done = [], 0
    for f in files:
        if os.path.isdir(f):
            continue
        low = f.lower()
        rel = os.path.relpath(f, ROOT)
        did = doc_id(rel)
        try:
            if low.endswith('.pdf'):
                r = parse_pdf(f, did)
            elif low.endswith(('.xml', '.html')):
                r = parse_xml(f, did)
            elif low.endswith('.epub'):
                r = parse_epub(f, did)
            elif low.endswith(('.txt', '.md')):
                r = parse_text(f, did)
            else:
                continue
        except Exception as e:
            stats.append({'doc': rel, 'error': str(e)[:80]})
            continue
        r.update({'docId': did, 'path': rel,
                  'title': os.path.basename(rel)})
        json.dump(r, open(os.path.join(OUT, f'{did}.json'), 'w'), ensure_ascii=False)
        stats.append({'doc': rel, 'docId': did, 'sections': len(r['sections']),
                      'paragraphs': len(r['paragraphs'])})
        done += 1
    total_p = sum(x.get('paragraphs', 0) for x in stats)
    print(f'解析 {done} 份文档，段落合计 {total_p}')
    json.dump(stats, open(os.path.join(OUT, '_stats.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
