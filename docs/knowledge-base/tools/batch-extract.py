#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量抽表 v1：坐标法 + 数值校验，产出统一 JSON。"""
import csv, json, os, re, sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
OUTDIR = os.path.join(HERE, '..', 'tables')
INV = os.path.join(HERE, '..', 'table-inventory.csv')
Y_TOL, GAP = 4.0, 10.0


def detect_gutter(page):
    W = page.rect.width
    bins = [0] * int(W // 6 + 2)
    for w in page.get_text('words'):
        for b in range(int(max(w[0], 0) // 6), min(int(w[2] // 6) + 1, len(bins))):
            bins[b] += 1
    run = 0
    for b in range(int(W * 0.3 // 6), int(W * 0.7 // 6)):
        if bins[b] == 0:
            run += 1
            if run >= 4:
                return (b - run + 1) * 6
        else:
            run = 0
    return None


def bounds(page, cap_x0):
    g = detect_gutter(page)
    if g is None:
        return 30, page.rect.width - 25
    return (30, g - 4) if cap_x0 < g else (g + 4, page.rect.width - 25)


def rows_of(page, clip):
    buckets = {}
    for x0, y0, x1, y1, w, *_ in page.get_text('words', clip=clip):
        buckets.setdefault(round(y0 / Y_TOL), []).append((x0, x1, w))
    rows = []
    for k in sorted(buckets):
        cells, cur, last = [], [], None
        for x0, x1, w in sorted(buckets[k]):
            if last is not None and x0 - last > GAP:
                cells.append(' '.join(cur)); cur = []
            cur.append(w); last = x1
        if cur:
            cells.append(' '.join(cur))
        if cells:
            rows.append(cells)
    # 合并"只有一格的续行"
    merged = []
    for r in rows:
        if merged and len(r) == 1 and len(merged[-1]) >= 2:
            merged[-1][-1] = (merged[-1][-1] + ' ' + r[0]).strip()
        else:
            merged.append(r)
    return merged


NUM = re.compile(r'\d[\d,]*(?:\.\d+)?')


def verify(rows, page_text):
    """每个数值必须在原页文本里出现（去掉千分位后比对）"""
    t = page_text.replace(',', '')
    total = hit = 0
    misses = []
    for r in rows:
        for c in r:
            for num in NUM.findall(c):
                total += 1
                raw = num.replace(',', '')
                if raw in t or raw.rstrip('0').rstrip('.') in t:
                    hit += 1
                else:
                    misses.append(num)
    return total, hit, misses[:6]


def main():
    rows = [r for r in csv.DictReader(open(INV, encoding='utf-8-sig'))
            if r['类型'] == '表题' and r['坐标']]
    # 去重：同文档+同页+同表题只留一条
    seen, uniq = set(), []
    for r in rows:
        k = (r['文件'], r['页码'], r['表题'][:60])
        if k in seen:
            continue
        seen.add(k); uniq.append(r)
    print(f'表题去重后：{len(uniq)} 张')

    os.makedirs(OUTDIR, exist_ok=True)
    cache, index = {}, []
    ok = 0
    for i, r in enumerate(uniq, 1):
        tid = f'T{i:04d}'
        path = os.path.join(ROOT, r['文件'])
        if path not in cache:
            cache[path] = fitz.open(path)
        doc = cache[path]
        x0, y0, x1, y1 = (float(v) for v in r['坐标'].split(','))
        pno = int(r['页码'])
        page = doc[pno - 1]
        try:
            bx0, bx1 = bounds(page, x0)
            clip = fitz.Rect(bx0, y0 + (y1 - y0) - 2, bx1, page.rect.y1 - 25)
            data = rows_of(page, clip)
        except Exception:
            data = []
        total, hit, misses = verify(data, page.get_text())
        avg_len = sum(len(' '.join(d)) for d in data) / max(len(data), 1)
        tiny = sum(1 for d in data if len(' '.join(d)) <= 3) / max(len(data), 1)
        good = (len(data) >= 2
                and avg_len >= 12            # 每行有实质内容（不是孤立字母）
                and tiny <= 0.3
                and (total == 0 or hit / total >= 0.8))
        rec = {'表号ID': tid, '文档': r['文件'], '页码': pno, '表题': r['表题'][:160],
               '坐标': r['坐标'], '配方相关': r['配方相关'],
               '方法': '坐标法' if good else '待视觉', '行数': len(data),
               '数值校验': f'{hit}/{total}' if total else '-'}
        index.append(rec)
        if good:
            ok += 1
            json.dump({'tableId': tid, 'doc': r['文件'], 'page': pno,
                       'caption': r['表题'][:300], 'method': '坐标法',
                       'rows': data,
                       'verify': {'numbers': total, 'found': hit, 'misses': misses}},
                      open(os.path.join(OUTDIR, f'{tid}.json'), 'w'), ensure_ascii=False, indent=1)
    for d in cache.values():
        d.close()
    with open(os.path.join(OUTDIR, '_index.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(index[0].keys()))
        w.writeheader(); w.writerows(index)
    print(f'坐标法成功 {ok} / {len(uniq)}（{100*ok//max(len(uniq),1)}%），其余转视觉')
    print('索引：', os.path.join(OUTDIR, '_index.csv'))


if __name__ == '__main__':
    main()
