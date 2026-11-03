#!/usr/bin/env python3
"""CKD 图书馆试点：段落检索 + 评测（不生成答案）。

用法：
  python3 search.py --mode zh_expanded
  python3 search.py --mode oracle_en --show ckd-02
  python3 search.py --compare
"""
import argparse, json, math, re, os
from collections import Counter, defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, '..', '..', '..', '..'))
LAYER = os.path.join(ROOT, 'docs', 'knowledge-base', 'source-layer')

DOCS = [
    'sacn5-chapters-SACN5-37',
    'iris-IRIS-staging-guidelines-2026',
    'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
    'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
    'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
]

ZH2EN = {
    '慢性肾病': ['chronic kidney disease', 'CKD', 'renal'],
    '肾病': ['kidney', 'renal', 'CKD'],
    'CKD': ['CKD', 'chronic kidney disease'],
    '磷结合剂': ['phosphate binder', 'phosphorus binder', 'hyperphosphatemia'],
    '限磷': ['phosphorus restriction', 'decreased phosphorus'],
    '营养': ['nutrition', 'nutritional', 'dietary'],
    '管理': ['management'],
    '脂肪酸': ['fatty acid', 'fatty acids'],
    '尿毒症': ['uremia', 'uremic'],
    '4期': ['stage 4', 'stage IV'],
    '四期': ['stage 4', 'stage IV'],
    '补': ['supplement', 'supplementation'],
    '合并': ['concurrent', 'with'],
    '磷': ['phosphorus', 'phosphate'],
    '蛋白尿': ['proteinuria', 'UPC', 'urine protein creatinine ratio'],
    '蛋白': ['protein'],
    '钠': ['sodium'],
    '钾': ['potassium'],
    '鱼油': ['fish oil', 'omega-3'],
    'omega-3': ['omega-3', 'fish oil'],
    'UPC': ['UPC', 'urine protein creatinine ratio'],
    '血压': ['blood pressure', 'systemic hypertension'],
    '高血压': ['hypertension', 'blood pressure', 'sodium', 'ACE inhibitor', 'amlodipine'],
    '复查': ['reassessment', 'monitoring', 'frequency'],
    '监测': ['monitoring', 'measurement'],
    '能量': ['energy', 'RER', 'resting energy'],
    '自制': ['home-prepared', 'homemade', 'complete balanced', 'veterinary nutritionist'],
    '鲜食': ['home-prepared', 'homemade', 'fresh food', 'complete balanced'],
    '维生素 D': ['vitamin D', 'calcitriol'],
    '维生素D': ['vitamin D', 'calcitriol'],
    '维生素 E': ['vitamin E', 'antioxidants'],
    '抗氧化': ['antioxidants'],
    '分期': ['staging', 'stage', 'IRIS'],
    'IRIS': ['IRIS', 'staging'],
    '推荐范围': ['recommendation', 'range', 'percent'],
    '上限': ['less than', 'maximum', 'upper'],
    '生存期': ['survival time', 'survival'],
    '怎么喂': ['feeding', 'feed'],
    '怎么管理': ['management'],
    '估算': ['requirement', 'calculation'],
    '需要': ['indication', 'recommend'],
    '能不能': ['may', 'recommend'],
    '开始': ['start', 'early', 'initiate'],
    '第几期': ['stage', 'staging'],
    '多少': ['how much', 'percent', 'range'],
    '什么': ['what', 'which'],
}

STOP = set('a an the and or of to in on for with by is are was were be been being this that these those as at from it its their there can may should could would not no than then when where which who whom whose what how why'.split())

def stem(w):
    if len(w) > 4 and w.endswith('ies'):
        return w[:-3] + 'y'
    if len(w) > 3 and w.endswith('s') and not w.endswith(('ss', 'us', 'is')):
        return w[:-1]
    return w

def norm_tokens(text):
    text = text.lower()
    out = []
    for w in re.findall(r'[a-z][a-z0-9\-]*|\d+(?:\.\d+)?%?', text):
        if w in STOP or len(w) <= 1:
            continue
        out.append(stem(w))
    return out

def load_paragraphs():
    out = []
    for name in DOCS:
        path = os.path.join(LAYER, name + '.json')
        if not os.path.exists(path):
            print('missing', path); continue
        d = json.load(open(path))
        for p in d.get('paragraphs', []):
            text = p.get('text', '')
            if len(text.strip()) < 40:
                continue
            out.append({
                'id': p['id'],
                'doc': name,
                'section': p['sectionId'],
                'page': p.get('pageStart'),
                'text': text,
                'tokens': norm_tokens(text),
                'tableish': (sum(1 for t in norm_tokens(text) if re.match(r'^\d', t) or '%' in t) / max(1, len(norm_tokens(text)))) > 0.06,
            })
    return out

def expand_zh(question):
    terms = []
    q = question
    for zh, ens in ZH2EN.items():
        if zh in q:
            terms.extend(ens)
    # 英文缩写/术语直接保留
    terms.extend(re.findall(r'[A-Za-z][A-Za-z0-9\-]{1,}', question))
    # 去重、去停词
    out = []
    for t in terms:
        t = t.strip()
        if not t: continue
        if t.lower() in STOP: continue
        if t not in out: out.append(t)
    return out

def tokens_for_mode(q, mode):
    if mode == 'oracle_en':
        toks = norm_tokens(q['query_en']) + [w for w in re.findall(r'[A-Za-z][A-Za-z0-9\-]{1,}', q['query_en']) if w.lower() not in STOP]
        toks += re.findall(r'\d+(?:\.\d+)?\s*(?:to|-|–)\s*\d+(?:\.\d+)?%?', q['query_en'])
        return toks
    if mode == 'zh_expanded':
        raw = expand_zh(q['question'])
        toks = []
        for t in raw:
            toks.extend(norm_tokens(t))
            if ' ' in t:
                toks.append(t.lower())
        return toks
    if mode == 'zh_only':
        return re.findall(r'[\u4e00-\u9fff]{2,}', q['question'])
    raise ValueError(mode)

def bm25(paragraphs, query_terms, boost_table=False):
    N = len(paragraphs)
    df = Counter()
    for p in paragraphs:
        for t in set(p['tokens']):
            df[t] += 1
    avgdl = sum(len(p['tokens']) for p in paragraphs) / max(1, N)
    idf = {t: math.log(1 + (N - n + 0.5) / (n + 0.5)) for t, n in df.items()}
    # 词组的精确匹配加分（英文子串）
    phrases = [t for t in query_terms if ' ' in t or '-' in t or len(t) > 8]
    scored = []
    for p in paragraphs:
        tf = Counter(p['tokens'])
        dl = len(p['tokens']) or 1
        score = 0.0
        for t in query_terms:
            if t in tf:
                f = tf[t]
                score += idf.get(t, 0.0) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * dl / avgdl))
        text = p['text'].lower()
        for ph in phrases:
            if ph in text:
                score += 1.5
        if boost_table and p.get('tableish'):
            score *= 1.9
        # CKD 核心文档轻微加权
        if p['doc'] == 'sacn5-chapters-SACN5-37': score *= 1.05
        elif p['doc'].startswith('iris-'): score *= 1.03
        scored.append((score, p))
    scored.sort(key=lambda x: (-x[0], x[1]['id']))
    return scored

def evaluate(questions, paragraphs, mode):
    rows = []
    for q in questions:
        terms = tokens_for_mode(q, mode)
        numeric_intent = any(k in q['question'] for k in ['多少','范围','上限','推荐']) or any(k in q['query_en'].lower() for k in ['percent','range','how much'])
        ranked = bm25(paragraphs, terms, boost_table=numeric_intent)
        gold_paras = set(q['gold_paragraphs'])
        gold_secs = {next((p['section'] for p in paragraphs if p['id'] == gid), None) for gid in gold_paras}
        gold_secs.discard(None)
        top = [p for _, p in ranked[:10]]
        pr = next((i + 1 for i, p in enumerate(top) if p['id'] in gold_paras), None)
        sr = next((i + 1 for i, p in enumerate(top) if p['section'] in gold_secs), None)
        rows.append({
            'id': q['id'], 'question': q['question'], 'terms': terms,
            'para_rank': pr, 'section_rank': sr,
            'top': [(round(s, 3), p['id'], p['section'], p['doc'], p['page'], p['text'][:160].replace('\n', ' ')) for s, p in ranked[:5]],
        })
    def recall(k, key):
        return sum(1 for r in rows if r[key] and r[key] <= k) / len(rows)
    def mrr(key):
        vals = [1 / r[key] for r in rows if r[key]]
        return sum(vals) / len(rows)
    return {
        'mode': mode, 'n': len(rows),
        'para_r1': recall(1, 'para_rank'),
        'para_r5': recall(5, 'para_rank'), 'para_r10': recall(10, 'para_rank'),
        'sec_r5': recall(5, 'section_rank'), 'sec_r10': recall(10, 'section_rank'),
        'mrr_para': mrr('para_rank'), 'mrr_sec': mrr('section_rank'),
        'rows': rows,
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', default='zh_expanded', choices=['zh_expanded', 'oracle_en', 'zh_only'])
    ap.add_argument('--show', default=None)
    ap.add_argument('--compare', action='store_true')
    args = ap.parse_args()
    questions = json.load(open(os.path.join(BASE, 'questions.json')))
    paragraphs = load_paragraphs()
    modes = ['zh_expanded', 'oracle_en'] if args.compare else [args.mode]
    results = []
    for mode in modes:
        res = evaluate(questions, paragraphs, mode)
        results.append(res)
        print(f"\n== {mode}  paragraphs={len(paragraphs)}  questions={res['n']}")
        print(f"   paragraph R@1={res['para_r1']:.0%}  R@5={res['para_r5']:.0%}  R@10={res['para_r10']:.0%}  MRR={res['mrr_para']:.2f}")
        print(f"   section   R@5={res['sec_r5']:.0%}  R@10={res['sec_r10']:.0%}  MRR={res['mrr_sec']:.2f}")
        misses = [r for r in res['rows'] if not r['para_rank'] or r['para_rank'] > 10]
        if misses:
            print("   misses:", ', '.join(r['id'] for r in misses))
    if args.show:
        for res in results:
            row = next(r for r in res['rows'] if r['id'] == args.show)
            print(f"\n== {res['mode']} {row['id']} {row['question']}")
            print("   terms:", ', '.join(row['terms'][:20]))
            print("   para_rank:", row['para_rank'], "section_rank:", row['section_rank'])
            for s, pid, sec, doc, page, text in row['top']:
                print(f"   {s:6.2f} {pid} p{page} | {text}")

if __name__ == '__main__':
    main()
