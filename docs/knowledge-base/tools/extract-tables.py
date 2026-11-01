#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 table-inventory.csv 里逐张抽表（表题锚定 + 限定栏 + 按 y 聚行）。

为什么不是简单的 find_tables：
  SACN5 这类书是**双栏 + 无边线表**。靠表格线的策略识别为 0；
  靠文字对齐的策略会把左右两栏搅成一锅。而表题位置是已知的，
  以表题所在栏为界、按 y 坐标聚行，反而稳。
"""
import csv, json, os, re, sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
INV = os.path.join(HERE, '..', 'table-inventory.csv')
Y_TOL = 4.0        # 同一行的 y 容差
MIN_ROWS = 3


def detect_gutter(page):
    """找页面中部的竖向空白带（双栏页才有）；没有就返回 None（通栏）"""
    W = page.rect.width
    bins = [0] * int(W // 6 + 1)
    for w in page.get_text('words'):
        x0, x1 = w[0], w[2]
        for b in range(int(max(x0, 0) // 6), min(int(x1 // 6) + 1, len(bins))):
            bins[b] += 1
    lo, hi = int(W * 0.3 // 6), int(W * 0.7 // 6)
    run = 0
    for b in range(lo, hi):
        if bins[b] == 0:
            run += 1
            if run >= 4:              # 连续 24pt 空白 → 认定是栏间距
                return (b - run + 1) * 6
        else:
            run = 0
    return None


def column_bounds(page, cap_x0):
    """按页面实际版式决定表格的横向范围"""
    gutter = detect_gutter(page)
    if gutter is None:
        return 30, page.rect.width - 25          # 通栏表
    if cap_x0 < gutter:
        return 30, gutter - 4                    # 左栏
    return gutter + 4, page.rect.width - 25      # 右栏


GAP = 10.0   # 同一行内，词间距 > GAP 就切成新单元格


def rows_from_words(words):
    buckets = {}
    for x0, y0, x1, y1, w, *_ in words:
        buckets.setdefault(round(y0 / Y_TOL), []).append((x0, x1, w))
    out = []
    for k in sorted(buckets):
        items = sorted(buckets[k])
        cells, cur, last_x1 = [], [], None
        for x0, x1, w in items:
            if last_x1 is not None and x0 - last_x1 > GAP:
                cells.append(' '.join(cur)); cur = []
            cur.append(w); last_x1 = x1
        if cur:
            cells.append(' '.join(cur))
        if cells:
            out.append(cells)
    return out


def merge_wrapped(rows):
    """把换行产生的"只有一格的续行"并回上一行"""
    out = []
    for r in rows:
        if out and len(r) == 1 and len(out[-1]) >= 2:
            out[-1][-1] = (out[-1][-1] + ' ' + r[0]).strip()
        else:
            out.append(r)
    return out


def merge_cells(rows):
    """把被拆开的单元格合回来（同一行里空格隔开的短语）"""
    return [[' '.join(r)] for r in rows]


def extract(doc, page_no, cap_rect):
    page = doc[page_no - 1]
    x0, x1 = column_bounds(page, cap_rect.x0)
    clip = fitz.Rect(x0, cap_rect.y1 - 2, x1, page.rect.y1 - 25)
    words = page.get_text('words', clip=clip)
    return merge_wrapped(rows_from_words(words))


def main():
    rows = [r for r in csv.DictReader(open(INV, encoding='utf-8-sig'))
            if r['类型'] == '表题' and r['坐标']]
    only_formula = '--formula' in sys.argv
    if only_formula:
        rows = [r for r in rows if r['配方相关'] == '是']
    limit = next((int(a.split('=')[1]) for a in sys.argv if a.startswith('--limit=')), 30)
    rows = rows[:limit]

    ok = bad = 0
    samples = []
    cache = {}
    for r in rows:
        path = os.path.join(ROOT, r['文件'])
        if not os.path.exists(path):
            continue
        if path not in cache:
            cache[path] = fitz.open(path)
        doc = cache[path]
        x0, y0, x1, y1 = (float(v) for v in r['坐标'].split(','))
        try:
            data = extract(doc, int(r['页码']), fitz.Rect(x0, y0, x1, y1))
        except Exception:
            data = []
        # 质量判据：至少 3 行，且多数行有 2 个以上"词"
        # 结构判据：≥3 行；表头行 ≥2 格；至少 2 行是多格（说明列真的分开了）
        good = (len(data) >= MIN_ROWS
                and len(data[0]) >= 2
                and sum(1 for d in data if len(d) >= 2) >= 2)
        if good:
            ok += 1
            if len(samples) < 3:
                samples.append((r['文件'].split('/')[-1], r['页码'], r['表题'][:70], data[:4]))
        else:
            bad += 1
    for p, d in cache.items():
        d.close()

    print(f'尝试 {ok+bad} 张表：结构可用 {ok}，失败 {bad}（{100*ok//max(ok+bad,1)}%）')
    for f, p, cap, d in samples:
        print(f'\n示例：{f} p{p} — {cap}')
        for row in d:
            print('   ', ' | '.join(row)[:100])


if __name__ == '__main__':
    main()
