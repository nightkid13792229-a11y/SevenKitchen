#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把知识条目的出处锚定到原文段落。

思路：
  1) 出处 → 先定位到"哪一份文档"（来源名 + 章节号）；
  2) 在该文档内，用条目自身的标题/摘要/要点与段落做词面匹配，取最相似的若干段；
  3) 输出 (条目, 出处, 文档, 段落ID[], 相似度)。
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', '..', 'backend', 'src', 'domain',
                    'recipe-designer', 'knowledge-base', 'data')
LAYER = os.path.join(HERE, '..', 'source-layer')

CJK = re.compile(r'[\u4e00-\u9fff]')
WORD = re.compile(r'[A-Za-z][A-Za-z\-]{2,}')


def tokens(text):
    t = text or ''
    out = set(w.lower() for w in WORD.findall(t))
    cjk = ''.join(CJK.findall(t))
    out |= {cjk[i:i + 2] for i in range(len(cjk) - 1)}
    return out


def load_layer():
    docs = {}
    for f in glob.glob(os.path.join(LAYER, '*.json')):
        if f.endswith('_stats.json'):
            continue
        d = json.load(open(f))
        docs[d['docId']] = d
    return docs


def pick_docs(source, chapter, docs):
    """按来源名 + 章节号挑候选文档"""
    s = source
    ch = chapter or ''
    if s.startswith('小动物临床营养学'):
        m = re.search(r'第\s*(\d+)', ch)
        if m:
            want = f'sacn5-chapters-SACN5-{m.group(1)}'
            if want in docs:
                return [want]
        return [k for k in docs if 'sacn5-chapters' in k]
    if s.startswith('AAHA'):
        key = ('AAHA-2021' if '2021' in s else
               'AAHA-2014' if '2014' in s else
               'AAHA-2023-Senior' if '老年' in s else
               'AAHA-2019-Canine-Life' if '生命阶段' in s else
               'AAHA-2019-Dental' if '牙科' in s else
               'AAHA-2022-Canine-Vaccination' if '免疫' in s else 'AAHA')
        return [k for k in docs if key in k]
    if s.startswith('ACVIM'):
        if s == 'ACVIM 共识 / 背书声明':
            return [k for k in docs if 'acvim' in k.lower()]
        core = re.sub(r'[^A-Za-z0-9\u4e00-\u9fff]', '', s.replace('ACVIM', ''))[:8]
        return [k for k in docs if 'acvim' in k.lower()]
    if s.startswith('WSAVA'):
        base = [k for k in docs if 'wsava' in k.lower()]
        if '疼痛' in s:
            base = [k for k in base if 'pain' in k.lower()] or base
        elif '疫苗' in s:
            base = [k for k in base if 'vaccin' in k.lower()] or base
        elif '营养' in s:
            base = [k for k in base if 'nutrition' in k.lower()] or base
        return base
    for key in ('iris', 'fediaf', 'nrc', 'merck', 'aspca'):
        if key in s.lower():
            return [k for k in docs if key in k.lower()]
    if '动物防疫法' in s or '狂犬病' in s:
        return [k for k in docs if 'cn-regulation' in k.lower()]
    return []


ENTRY = re.compile(r"\n  \{\n    id: '([^']+)'([\s\S]*?)\n  \},")


def main():
    docs = load_layer()
    texts = {k: [p['text'] for p in v['paragraphs']] for k, v in docs.items()}
    ids = {k: [p['id'] for p in v['paragraphs']] for k, v in docs.items()}
    out = []
    files = sorted(glob.glob(os.path.join(DATA, '*.ts')))
    for f in files:
        raw = open(f, encoding='utf-8').read()
        for m in ENTRY.finditer('\n' + raw):
            eid, body = m.group(1), m.group(2)
            # 条目自身文本（不含出处部分）
            head = body.split('citations:')[0].split('sources:')[0]
            qt = tokens(head)
            if not qt:
                continue
            cites = re.findall(r"\{ source: '([^']+)'(?:, chapter: '([^']*)')?", body)
            for src, ch in cites:
                cands = pick_docs(src, ch, docs)
                if not cands:
                    out.append({'entry': eid, 'source': src, 'chapter': ch,
                                'doc': None, 'paragraphs': [], 'score': 0})
                    continue
                # 章节号命中的优先
                best = (0.0, None, [])
                for cand in cands:
                    for i, t in enumerate(texts[cand]):
                        pt = tokens(t)
                        if not pt:
                            continue
                        inter = len(qt & pt)
                        if not inter:
                            continue
                        score = inter / (len(qt) ** 0.5 * len(pt) ** 0.5 + 1e-9)
                        if score > best[0]:
                            best = (score, cand, [ids[cand][i]])
                out.append({'entry': eid, 'source': src, 'chapter': ch,
                            'doc': best[1], 'paragraphs': best[2],
                            'score': round(best[0], 4)})
    json.dump(out, open(os.path.join(HERE, '..', 'citation-anchors.json'), 'w'),
              ensure_ascii=False, indent=1)
    scores = sorted(x['score'] for x in out)
    n = len(out)
    print(f'出处 {n} 条；已定位到文档 {sum(1 for x in out if x["doc"])}；'
          f'无候选 {sum(1 for x in out if not x["doc"])}')
    for th in (0.30, 0.20, 0.15, 0.10):
        print(f'  相似度 ≥ {th}: {sum(1 for s in scores if s >= th)}')


if __name__ == '__main__':
    main()
