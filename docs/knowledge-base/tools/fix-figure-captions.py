#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给没有图注的图片补图注：在页内（必要时前后页）找 FIGURE/Figure/图 开头的行。"""
import csv, os, re

import fitz

ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
IDX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'figure-index.csv')
CAP = re.compile(r'^(FIGURE|Figure|Fig\.|图)\s*[\dA-Z一二三四五六七八九十]', re.I)


def lines_with_y(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b.get('type') != 0:
            continue
        for l in b.get('lines', []):
            t = ''.join(s['text'] for s in l['spans']).strip()
            if t:
                out.append((l['bbox'][1], t))
    return out


def main():
    rows = list(csv.DictReader(open(IDX, encoding='utf-8-sig')))
    cache, filled = {}, 0
    for r in rows:
        if r['图注']:
            continue
        path = os.path.join(ROOT, r['文档'])
        if not os.path.exists(path):
            continue
        if path not in cache:
            cache[path] = fitz.open(path)
        doc = cache[path]
        pno = int(r['页码'])
        text = ''
        for delta in (0, -1, 1):
            p = pno + delta
            if not (1 <= p <= doc.page_count):
                continue
            for _, line in lines_with_y(doc[p - 1]):
                if CAP.match(line) and len(line) > 8:
                    text = re.sub(r'\s+', ' ', line)[:200]
                    break
            if text:
                break
        if text:
            r['图注'] = text
            filled += 1
    for d in cache.values():
        d.close()
    with open(IDX, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=['图ID', '文档', '页码', '宽', '高', '图注'])
        w.writeheader()
        w.writerows(rows)
    total = len(rows)
    have = sum(1 for r in rows if r['图注'])
    print(f'补上 {filled} 张；现在有图注 {have}/{total}')


if __name__ == '__main__':
    main()
