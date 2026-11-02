#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""扫描归档里的 PDF，产出「表格清单」：文档 / 页码 / 表题 / 坐标 / 是否配方相关。

思路：靠表题（"Table 12-5" / "TABLE III-3a"）定位，不依赖表格线 ——
因为 SACN5 这类书是双栏 + 无边线表，线框识别为 0。
"""
import csv, glob, os, re, sys

import fitz

ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'table-inventory.csv')

CAP = re.compile(r'\b(TABLE|Table|表)\s*([A-Z]{0,3}[-–]?\d+(?:[-–]\d+)?[a-z]?)\b')

# 配方设计真正要用的表：营养素需要量 / 原料成分 / 补充剂成分 / 能量
FORMULA_KW = re.compile(
    r'(nutrient|requirement|recommend|allowance|adequate intake|safe upper|'
    r'composition|proximate|mineral|vitamin|amino acid|fatty acid|'
    r'energy|calorie|metaboli|protein|fat|calcium|phosphor|'
    r'营养|需要量|推荐量|成分|矿物|维生素|氨基酸|脂肪酸|能量|热量|钙|磷)', re.I)


def line_at(page, rect):
    """取出 rect 所在的那一整行文本（判断是"表题"还是"正文提及"）"""
    for b in page.get_text('dict')['blocks']:
        if b.get('type') != 0:
            continue
        for l in b.get('lines', []):
            lb = fitz.Rect(l['bbox'])
            if lb.intersects(rect):
                return ' '.join(''.join(s['text'] for s in l['spans']).split())
    return ''


def caption_line(page, rect):
    return line_at(page, rect)[:160] or ' '.join(
        page.get_text('text', clip=fitz.Rect(rect.x0 - 5, rect.y0 - 3,
                                             min(rect.x0 + 460, page.rect.x1), rect.y1 + 3)).split())[:160]


def scan(path, rel):
    rows = []
    try:
        doc = fitz.open(path)
    except Exception as e:
        return [{'文件': rel, '页码': '', '表题': f'(打不开: {e})', '配方相关': ''}]
    for i in range(doc.page_count):
        page = doc[i]
        text = page.get_text()
        seen = set()
        for m in CAP.finditer(text):
            label = f'{m.group(1)} {m.group(2)}'
            if label in seen:
                continue
            seen.add(label)
            hits = page.search_for(m.group(0))
            rect = hits[0] if hits else None
            line = caption_line(page, rect) if rect else label
            head = line.lstrip().lower()
            lab = m.group(0).lower()
            kind = '表题' if head.startswith(lab) else '正文提及'
            rows.append({
                '文件': rel,
                '页码': i + 1,
                '表题': line,
                '类型': kind,
                '坐标': f'{rect.x0:.0f},{rect.y0:.0f},{rect.x1:.0f},{rect.y1:.0f}' if rect else '',
                '配方相关': '是' if FORMULA_KW.search(line) else '',
                '有无文字层': '有' if len(text.strip()) > 200 else '无(扫描件)',
            })
    doc.close()
    return rows


def main():
    files = sorted(glob.glob(os.path.join(ROOT, '**', '*.pdf'), recursive=True))
    all_rows = []
    for f in files:
        rel = os.path.relpath(f, ROOT)
        all_rows += scan(f, rel)
    with open(OUT, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=['文件', '页码', '表题', '类型', '坐标', '配方相关', '有无文字层'])
        w.writeheader()
        w.writerows(all_rows)
    docs = len({r['文件'] for r in all_rows})
    real = sum(1 for r in all_rows if r['类型'] == '表题')
    formula = sum(1 for r in all_rows if r['类型'] == '表题' and r['配方相关'] == '是')
    scan_only = sum(1 for r in all_rows if r['有无文字层'].startswith('无'))
    print(f'扫描 PDF {len(files)} 份，命中表题 {len(all_rows)} 条，涉及 {docs} 份文档')
    print(f'  其中真正的表题（行首就是 Table X-Y）：{real} 条')
    print(f'  其中「配方相关」：{formula} 条')
    print(f'  在扫描件（无文字层）里的表题：{scan_only} 条 —— 这些靠表题抓不到，需要视觉模型补')
    print(f'  输出：{os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
