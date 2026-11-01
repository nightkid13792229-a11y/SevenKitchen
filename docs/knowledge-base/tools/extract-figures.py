#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导出文档里的内容图（按面积过滤 + 去重），并尝试抓图注。"""
import csv, glob, json, os, re

import fitz

ROOT = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'figures')
MIN_AREA = 0.04          # 占页面面积 4% 以上才算内容图
MIN_SIDE = 60            # 短边至少 60px


def caption_for(page, rect):
    """在图片下方/上方找 FIGURE/Figure/图 开头的行"""
    for dy0, dy1 in ((rect.y1, rect.y1 + 40), (rect.y0 - 40, rect.y0)):
        clip = fitz.Rect(0, dy0, page.rect.width, dy1)
        for line in page.get_text('text', clip=clip).split('\n'):
            s = line.strip()
            if re.match(r'^(FIGURE|Figure|图)\s*[\dA-Z]', s):
                return re.sub(r'\s+', ' ', s)[:200]
    return ''


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(ROOT, '**', '*.pdf'), recursive=True))
    seen_xref = set()
    rows = []
    for f in files:
        rel = os.path.relpath(f, ROOT)
        did = re.sub(r'[^A-Za-z0-9\u4e00-\u9fff]+', '-', rel.rsplit('.', 1)[0]).strip('-')[:60]
        try:
            doc = fitz.open(f)
        except Exception:
            continue
        page_area = None
        for i in range(doc.page_count):
            page = doc[i]
            page_area = page.rect.width * page.rect.height
            for info in page.get_images(full=True):
                xref = info[0]
                if xref in seen_xref:
                    continue                      # 同一张图在别页复用，只留第一次
                rects = page.get_image_rects(xref)
                if not rects:
                    continue
                r = rects[0]
                if r.width < MIN_SIDE or r.height < MIN_SIDE:
                    continue
                if (r.width * r.height) / page_area < MIN_AREA:
                    continue
                try:
                    seen_xref.add(xref)
                    # 按区域渲染并限分辨率：原图常常几千像素，直接抽会撑爆体积
                    scale = min(1.0, 1100 / max(r.width, r.height))
                    m = fitz.Matrix(scale * 1.4, scale * 1.4)
                    pix = page.get_pixmap(matrix=m, clip=r)
                    name = f"{did}__p{i+1:03d}_{xref}.jpg"
                    p = os.path.join(OUT, name)
                    pix.save(p, jpg_quality=78)
                    rows.append({'图ID': name.rsplit('.', 1)[0], '文档': rel, '页码': i + 1,
                                 '宽': pix.width, '高': pix.height,
                                 '图注': caption_for(page, r)})
                except Exception:
                    continue
        doc.close()
    with open(os.path.join(os.path.dirname(OUT), 'figure-index.csv'), 'w',
              newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=['图ID', '文档', '页码', '宽', '高', '图注'])
        w.writeheader(); w.writerows(rows)
    with_cap = sum(1 for r in rows if r['图注'])
    print(f'导出内容图 {len(rows)} 张（有图注 {with_cap} 张）')


if __name__ == '__main__':
    main()
