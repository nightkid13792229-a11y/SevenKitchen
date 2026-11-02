#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验视觉转录结果：每个数值必须能在原文该页文本里找到。"""
import csv, glob, json, os, re, collections

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
IDX = os.path.join(HERE, '..', 'tables', '_index.csv')
OUT = '/tmp/tables/out'
NUM = re.compile(r'\d[\d,]*(?:\.\d+)?')


def norm_text(t):
    return t.replace(',', '').replace('\u2212', '-')


def main():
    idx = {r['表号ID']: r for r in csv.DictReader(open(IDX, encoding='utf-8-sig'))}
    cache, report = {}, []
    for path in sorted(glob.glob(os.path.join(OUT, '*.json'))):
        tid = os.path.basename(path)[:-5]
        r = idx.get(tid)
        if not r:
            continue
        try:
            d = json.load(open(path))
        except Exception as e:
            report.append({'id': tid, '状态': 'JSON 坏了', '数值': '-', '命中': '-', '说明': str(e)[:60]})
            continue
        src = os.path.join(ROOT, r['文档'])
        if src not in cache:
            cache[src] = fitz.open(src)
        # 跨页表：把前后各一页也纳入比对，避免把"数字记在下一页"误判成错
        doc = cache[src]
        pno = int(r['页码']) - 1
        page_text = norm_text(' '.join(
            doc[i].get_text() for i in range(max(0, pno - 1), min(doc.page_count, pno + 2))
        ))
        rows = d.get('rows') or []
        if not rows:
            report.append({'id': tid, '状态': '无内容', '数值': 0, '命中': 0, '说明': d.get('note', '')[:40]})
            continue
        total = hit = 0
        miss = []
        for row in rows:
            for cell in row:
                for n in NUM.findall(str(cell)):
                    total += 1
                    raw = n.replace(',', '')
                    if raw in page_text or raw.rstrip('0').rstrip('.') in page_text:
                        hit += 1
                    else:
                        miss.append(raw)
        has_text = len(page_text.strip()) > 200
        if total == 0:
            status = '无数值'
        elif not has_text:
            status = '原文无文字层'
        else:
            ratio = hit / total
            status = '通过' if ratio >= 0.95 else ('部分存疑' if ratio >= 0.8 else '不通过')
        report.append({'id': tid, '状态': status, '数值': total, '命中': hit,
                       '说明': (','.join(miss[:5]) if miss else '')})
    for d in cache.values():
        d.close()

    c = collections.Counter(x['状态'] for x in report)
    print('校验结果：', dict(c))
    with open(os.path.join(HERE, '..', 'tables', '_verify.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=['id', '状态', '数值', '命中', '说明'])
        w.writeheader(); w.writerows(report)
    bad = [x for x in report if x['状态'] in ('不通过', '部分存疑', 'JSON 坏了', '无内容')]
    print('需要返工：', len(bad))
    for x in bad[:10]:
        print('   ', x['id'], x['状态'], x['数值'], x['命中'], x['说明'][:40])


if __name__ == '__main__':
    main()
