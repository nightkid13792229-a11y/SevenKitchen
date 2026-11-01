#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""出处锚定 v2：用条目里的英文关键词去匹配英文原文段落。"""
import glob, json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', '..', 'backend', 'src', 'domain',
                    'recipe-designer', 'knowledge-base', 'data')
LAYER = os.path.join(HERE, '..', 'source-layer')

WORD = re.compile(r'[A-Za-z][A-Za-z\-]{2,}')
STOP = set('''the and for with that this from are was were been has have had not but can may
which when where while also more most than than into their they them these those such
should could would about after before during between both each other using used use
two one three four five six seven eight nine ten per day days'''.split())


def en_terms(text):
    return {w.lower() for w in WORD.findall(text or '')
            if w.lower() not in STOP and len(w) >= 3}


def load_layer():
    docs = {}
    for f in glob.glob(os.path.join(LAYER, '*.json')):
        if f.endswith('_stats.json'):
            continue
        d = json.load(open(f))
        docs[d['docId']] = d
    return docs


SOURCE_ID_DOC = {
    'SACN5': 'sacn5-chapters-',
    'AAHA-LIFE-STAGE-2019': 'AAHA-2019-Canine-Life',
    'AAHA-SENIOR-2023': 'AAHA-2023-Senior',
    'AAHA-2021-NUTRITION': 'AAHA-2021-Nutrition',
    'AAHA-2014-WEIGHT': 'AAHA-2014-Weight',
    'AAHA-DENTAL-2019': 'AAHA-2019-Dental',
    'AAHA-VACC-2022': 'AAHA-2022-Canine-Vaccination',
    'ACVIM-CONSENSUS': 'acvim',
    'WSAVA-NUTRITION': 'wsava-nutrition',
    'WSAVA-VACC-2024': 'wsava-vaccination',
    'WSAVA-PAIN-2022': 'wsava-pain',
    'WSAVA-DENTAL': 'wsava-dental',
    'WSAVA-REPRO': 'wsava-repro',
    'WSAVA-WELFARE': 'wsava-welfare',
    'WSAVA-HEREDITARY': 'wsava-hereditary',
    'IRIS-CKD-2026': 'iris',
    'FEDIAF-2025': 'fediaf',
    'NRC-2006': 'nrc',
    'MERCK-CLINICAL-BIOCHEM': 'merck',
    'MERCK-HEME': 'merck',
    'MERCK-HEPATIC': 'merck',
    'CN-EPIDEMIC-LAW': 'cn-regulation',
    'CN-RABIES-TECH': 'cn-regulation',
    'ASPCA-POISON': 'aspca',
}


def pick_docs_by_id(sid, locator, docs):
    key = SOURCE_ID_DOC.get(sid)
    if not key:
        return []
    if sid == 'SACN5':
        m = re.search(r'第\s*(\d+)', locator or '')
        if m:
            want = f'sacn5-chapters-SACN5-{m.group(1)}'
            if want in docs:
                return [want]
    return [k for k in docs if key in k]


def pick_docs(source, chapter, docs):
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
        key = ('AAHA-2021' if '2021' in s else 'AAHA-2014' if '2014' in s else
               'AAHA-2023-Senior' if '老年' in s else
               'AAHA-2019-Canine-Life' if '生命阶段' in s else
               'AAHA-2019-Dental' if '牙科' in s else
               'AAHA-2022-Canine-Vaccination' if '免疫' in s else 'AAHA')
        return [k for k in docs if key in k]
    if s.startswith('ACVIM'):
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
KEYW = re.compile(r"keywords:\s*\[([^\]]*)\]")


def main():
    docs = load_layer()
    # 预建索引
    idx = {}
    for k, v in docs.items():
        idx[k] = [(p['id'], p['sectionId'], en_terms(p['text'])) for p in v['paragraphs']]

    out = []
    for f in sorted(glob.glob(os.path.join(DATA, '*.ts'))):
        raw = open(f, encoding='utf-8').read()
        for m in ENTRY.finditer('\n' + raw):
            eid, body = m.group(1), m.group(2)
            head = body.split('citations:')[0].split('sources:')[0]
            kw = KEYW.search(head)
            terms = en_terms(kw.group(1) if kw else '')
            if len(terms) < 2:
                terms = en_terms(head)
            if not terms:
                out.append({'entry': eid, 'source': None, 'doc': None,
                            'paragraphs': [], 'score': 0, 'reason': '无英文术语'})
                continue
            cites = []
            for obj in re.findall(r'\{[^{}]*\}', body):
                sid = re.search(r"sourceId: '([^']+)'", obj)
                src = re.search(r"source: '([^']+)'", obj)
                loc = re.search(r"(?:chapter|locator): '([^']*)'", obj)
                if sid:
                    cites.append((None, loc.group(1) if loc else '', sid.group(1)))
                elif src:
                    cites.append((src.group(1), loc.group(1) if loc else '', None))
            for src, ch, sid in cites:
                cands = pick_docs_by_id(sid, ch, docs) if sid else pick_docs(src, ch, docs)
                if not cands:
                    out.append({'entry': eid, 'source': src or sid, 'chapter': ch,
                                'doc': None, 'paragraphs': [], 'score': 0,
                                'reason': '无候选文档'})
                    continue
                # 章节里如果写了表号，记下来供表格锚定
                tbl = re.search(r'表\s*([A-Z]{0,2}[-–]?\d+[-–]\d+)', ch or '')
                best = (0.0, None, [], None)
                for cand in cands:
                    sec_score = {}
                    for pid, sec_id, pt in idx[cand]:
                        if not pt:
                            continue
                        inter = len(terms & pt)
                        if not inter:
                            continue
                        cov = inter / len(terms)
                        sec_score[sec_id] = sec_score.get(sec_id, 0) + cov
                        if cov > best[0]:
                            best = (cov, cand, [pid], sec_id)
                    if best[3] is None and sec_score:
                        top = max(sec_score, key=sec_score.get)
                        best = (0.0, cand, [], top)
                conf = ('high' if best[0] >= 0.5 else
                        'medium' if best[0] >= 0.3 else
                        'low' if best[1] else 'none')
                out.append({'entry': eid, 'source': src or sid, 'chapter': ch,
                            'doc': best[1], 'paragraphs': best[2],
                            'section': best[3], 'confidence': conf,
                            'score': round(best[0], 3),
                            'table': tbl.group(1).replace('–', '-') if tbl else None,
                            'reason': '' if best[1] else '匹配不到段落'})
    json.dump(out, open(os.path.join(HERE, '..', 'citation-anchors.json'), 'w'),
              ensure_ascii=False, indent=1)
    n = len(out)
    got = [x for x in out if x['doc']]
    s = sorted((x['score'] for x in got), reverse=True)
    print(f'出处 {n} 条 | 定位到文档 {len(got)} | 失败 {n-len(got)}')
    for th in (0.6, 0.5, 0.4, 0.3):
        print(f'  相似度 ≥ {th}: {sum(1 for x in s if x >= th)}')
    import collections
    print('失败原因:', collections.Counter(x['reason'] for x in out if not x['doc']).most_common())


if __name__ == '__main__':
    main()
