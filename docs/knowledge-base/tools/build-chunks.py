#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把段落合并成检索块（300–600 字，不跨小节），供模型直接取用。"""
import glob, json, os

TARGET = 450
MAXC = 700
MINC = 120


def main():
    out = []
    for f in sorted(glob.glob('../source-layer/*.json')):
        if f.endswith('_stats.json'):
            continue
        d = json.load(open(f))
        cur_ids, cur_txt = [], ''
        cur_sec = None
        for p in d['paragraphs']:
            t = p['text']
            if cur_sec and p['sectionId'] != cur_sec:
                if len(cur_txt) >= MINC:
                    out.append((d['docId'], cur_sec, cur_ids, cur_txt))
                cur_ids, cur_txt, cur_sec = [], '', None
            if len(cur_txt) + len(t) > MAXC and cur_txt:
                if len(cur_txt) >= MINC:
                    out.append((d['docId'], cur_sec, cur_ids, cur_txt))
                cur_ids, cur_txt = [], ''
            if not cur_sec:
                cur_sec = p['sectionId']
            cur_ids.append(p['id'])
            cur_txt = (cur_txt + ' ' + t).strip()
            if len(cur_txt) >= TARGET:
                out.append((d['docId'], cur_sec, cur_ids, cur_txt))
                cur_ids, cur_txt = [], ''
        if len(cur_txt) >= MINC:
            out.append((d['docId'], cur_sec, cur_ids, cur_txt))

    path = os.path.join('..', 'chunks.jsonl')
    with open(path, 'w', encoding='utf-8') as fh:
        for i, (doc, sec, ids, text) in enumerate(out, 1):
            fh.write(json.dumps({'chunkId': f'C{i:06d}', 'docId': doc, 'sectionId': sec,
                                 'paragraphIds': ids, 'text': text}, ensure_ascii=False) + '\n')
    L = [len(x[3]) for x in out]
    print(f'检索块 {len(out)} 个 | 平均 {sum(L)//len(L)} 字 | 最长 {max(L)}')
    print('输出', os.path.abspath(path))


if __name__ == '__main__':
    main()
