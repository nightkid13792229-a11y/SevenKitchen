#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""返工用：把失败的表格改为整页渲染（应对旋转表、表跨页、裁切错位）。"""
import csv, json, os, sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
IDX = os.path.join(HERE, '..', 'tables', '_index.csv')
OUT = '/tmp/tables/full'


def main():
    ids = set(json.load(open(sys.argv[1])))
    idx = {r['表号ID']: r for r in csv.DictReader(open(IDX, encoding='utf-8-sig'))}
    os.makedirs(OUT, exist_ok=True)
    cache, n = {}, 0
    for tid in sorted(ids):
        r = idx.get(tid)
        if not r:
            continue
        src = os.path.join(ROOT, r['文档'])
        if src not in cache:
            cache[src] = fitz.open(src)
        doc = cache[src]
        page = doc[int(r['页码']) - 1]
        # 横排（旋转 90°）的表格：把页面转正再渲染
        words = page.get_text('words')
        vertical = sum(1 for w in words if (w[3] - w[1]) > (w[2] - w[0]) * 1.5)
        rot = 90 if words and vertical > len(words) * 0.6 else 0
        if rot:
            page.set_rotation((page.rotation + rot) % 360)
        pix = page.get_pixmap(dpi=130)          # 整页，不裁
        pix.save(os.path.join(OUT, f'{tid}.png'))
        if rot:
            print('  旋转页:', tid)
        n += 1
    for d in cache.values():
        d.close()
    print(f'整页渲染 {n} 张 → {OUT}')


if __name__ == '__main__':
    main()
