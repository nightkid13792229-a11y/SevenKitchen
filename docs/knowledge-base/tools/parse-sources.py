#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
原文档解析管线（原型 v0.1）

把 PDF 切成 文档 → 章节 → 段落，并抽出 表格 与 图片。

用法：
    python3 parse-sources.py --in <单份PDF> --out <json> [--doc-id X]
    python3 parse-sources.py --sample            # 跑三份样本，打印质量指标

设计取舍（见 docs/_archive/superpowers/specs/2026-11-01-source-layer-spec.md）：
  · 段落 50–800 字，不跨章节
  · 页眉页脚（≥3 页重复的短行）丢弃
  · 断词连字符（"sub-\\nmitted"）复原
  · 表格保留行列结构，不压成文本
  · 图片只记位置与 xref，实际导出在后续步骤
"""
import argparse, collections, json, os, re, sys

import fitz

MAX_P = 800
MIN_P = 40


def norm(t: str) -> str:
    t = t.replace('\u00ad', '')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


def split_long(text: str) -> list[str]:
    """按句末标点切到 <= MAX_P。切不动就整段返回（由质检统计超长）。"""
    if len(text) <= MAX_P:
        return [text]
    parts = re.split(r'(?<=[.。!?！？])\s+', text)
    out, cur = [], ''
    for s in parts:
        if len(cur) + len(s) + 1 > MAX_P and cur:
            out.append(cur.strip())
            cur = s
        else:
            cur = (cur + ' ' + s).strip()
    if cur:
        out.append(cur)
    return [x for x in out if len(x) >= MIN_P]


def parse_pdf(path: str, doc_id: str, max_pages: int | None = None) -> dict:
    doc = fitz.open(path)
    n = doc.page_count if max_pages is None else min(doc.page_count, max_pages)

    # 正文字号：按字符数加权（行数会被脚注、图表说明带偏）
    cnt: collections.Counter = collections.Counter()
    for i in range(n):
        for b in doc[i].get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            for line in b.get('lines', []):
                for s in line['spans']:
                    cnt[round(s['size'], 1)] += len(s['text'].strip())
    body = cnt.most_common(1)[0][0] if cnt else 10.0

    # 页眉页脚：在 >=3 页上出现过的短行
    seen: collections.Counter = collections.Counter()
    for i in range(n):
        lines = {norm(''.join(s['text'] for s in line['spans']))
                 for b in doc[i].get_text('dict')['blocks'] if b.get('type') == 0
                 for line in b.get('lines', [])}
        for x in lines:
            if x and len(x) <= 90:
                seen[x] += 1
    boiler = {x for x, c in seen.items() if c >= 3}

    def is_head(txt: str, size: float) -> bool:
        if size < body * 1.15 or len(txt) > 120 or txt in boiler:
            return False
        if re.fullmatch(r'[\d\s.]*', txt):            # 纯数字（页码/章号）
            return False
        if len(txt) < 4:
            return False
        if re.search(r'\s\d{2,3}$', txt):             # 书眉 + 页码
            return False
        if txt.endswith('.') and len(txt) > 60:
            return False
        return True

    sections = [{'id': f'{doc_id}-s000', 'title': '(文档开头)', 'pageNo': 1}]
    paras, tables, figures = [], [], []
    cur = sections[0]
    buf, bpage, bsec, last_head = [], None, None, None

    def flush() -> None:
        nonlocal buf, bpage, bsec
        if not buf:
            return
        for piece in split_long(norm(' '.join(buf))):
            paras.append({'id': f'{doc_id}-p{len(paras)+1:04d}',
                          'sectionId': bsec['id'], 'text': piece, 'pageNo': bpage})
        buf, bpage, bsec = [], None, None

    for i in range(n):
        page = doc[i]
        pno = i + 1

        # 表格
        try:
            for t in page.find_tables().tables or []:
                data = t.extract()
                rows = [[(c or '').strip() for c in row] for row in (data or []) if any(row)]
                if len(rows) >= 2:
                    tables.append({'id': f'{doc_id}-t{len(tables)+1:03d}', 'pageNo': pno,
                                   'headers': rows[0], 'rows': rows[1:]})
        except Exception:
            pass

        # 图片
        for img in page.get_images(full=True):
            figures.append({'id': f'{doc_id}-f{len(figures)+1:03d}', 'pageNo': pno, 'xref': img[0]})

        # 文字
        for b in page.get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            lines = b.get('lines', [])
            if not lines:
                continue
            raw = '\n'.join(''.join(s['text'] for s in line['spans']) for line in lines)
            raw = re.sub(r'-\n(?=[a-z])', '', raw)     # 断词复原
            txt = norm(raw)
            if not txt or txt in boiler:
                continue
            size = max(s['size'] for line in lines for s in line['spans'])
            if is_head(txt, size):
                flush()
                if (last_head is not None and cur is last_head
                        and len(last_head['title']) < 18 and len(txt) < 45):
                    last_head['title'] = (last_head['title'] + ' ' + txt).strip()
                else:
                    cur = {'id': f'{doc_id}-s{len(sections)+1:03d}', 'title': txt, 'pageNo': pno}
                    sections.append(cur)
                    last_head = cur
                continue
            if buf and bpage == pno and not re.search(r'[.。!?！？]$', norm(' '.join(buf))):
                buf.append(txt)
            else:
                flush()
                buf, bpage, bsec = [txt], pno, cur
    flush()
    doc.close()
    return {'docId': doc_id, 'bodySize': body, 'sections': sections,
            'paragraphs': paras, 'tables': tables, 'figures': figures}


def report(r: dict) -> str:
    L = [len(p['text']) for p in r['paragraphs']]
    over = sum(1 for x in L if x > MAX_P)
    under = sum(1 for x in L if x < 60)
    avg = sum(L) // max(len(L), 1)
    return (f"{r['docId']}: 字号 {r['bodySize']} | 章节 {len(r['sections'])} | "
            f"段落 {len(r['paragraphs'])}（均 {avg}，超长 {over}，过短 {under}）| "
            f"表格 {len(r['tables'])} | 图片 {len(r['figures'])}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src')
    ap.add_argument('--out', dest='out')
    ap.add_argument('--doc-id', dest='doc_id')
    ap.add_argument('--sample', action='store_true')
    ap.add_argument('--json', action='store_true', help='--sample 时同时输出每份的 JSON')
    a = ap.parse_args()

    if a.sample:
        root = os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
        cases = [('SACN5-12', f'{root}/sacn5/chapters/SACN5_12.pdf'),
                 ('SACN5-40', f'{root}/sacn5/chapters/SACN5_40.pdf'),
                 ('AAHA-2021-NUTRITION',
                  f'{root}/aaha/AAHA-2021-Nutrition-and-Weight-Management-Guidelines.pdf'),
                 ('WSAVA-BCS-DOG-2025', f'{root}/wsava/nutrition/Body-Condition-Score-Dog-2025.pdf')]
        for did, path in cases:
            r = parse_pdf(path, did)
            print(report(r))
            if a.json:
                json.dump(r, open(f'/tmp/{did}.json', 'w'), ensure_ascii=False, indent=1)
        return

    if not a.src:
        ap.error('需要 --in 或 --sample')
    did = a.doc_id or os.path.splitext(os.path.basename(a.src))[0]
    r = parse_pdf(a.src, did)
    print(report(r))
    if a.out:
        json.dump(r, open(a.out, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
