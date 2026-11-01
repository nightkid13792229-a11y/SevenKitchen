#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把每张表所在区域渲染成 PNG，供视觉读数使用。"""
import csv, json, os

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
OUT = '/tmp/tables'
IDX = os.path.join(HERE, '..', 'tables', '_index.csv')


def table_bbox(page, cap_rect):
    """尽量只裁表格：从表题往下，遇到明显不属于表格的整行正文就收尾"""
    x0 = 30
    x1 = page.rect.width - 25
    top = max(cap_rect.y0 - 6, 20)
    bottom = page.rect.y1 - 22
    return fitz.Rect(x0, top, x1, bottom)


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = list(csv.DictReader(open(IDX, encoding='utf-8-sig')))
    cache, made = {}, 0
    for r in rows:
        path = os.path.join(ROOT, r['文档'])
        if path not in cache:
            cache[path] = fitz.open(path)
        doc = cache[path]
        x0, y0, x1, y1 = (float(v) for v in r['坐标'].split(','))
        page = doc[int(r['页码']) - 1]
        clip = table_bbox(page, fitz.Rect(x0, y0, x1, y1))
        pix = page.get_pixmap(dpi=150, clip=clip)
        pix.save(os.path.join(OUT, f"{r['表号ID']}.png"))
        made += 1
    for d in cache.values():
        d.close()
    print(f'渲染 {made} 张表图 → {OUT}')


if __name__ == '__main__':
    main()
