#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""段落清理：过短的并入上一段，过长的按句/逗号切开。"""
import glob, json, os, re

MAX_P, MIN_P = 900, 60


def split_long(text):
    if len(text) <= MAX_P:
        return [text]
    for seps in (r'(?<=[.。!?！？])\s+', r'(?<=[;；])\s+', r'(?<=[,，])\s+'):
        parts = re.split(seps, text)
        if len(parts) > 1:
            out, cur = [], ''
            for s in parts:
                if len(cur) + len(s) + 1 > MAX_P and cur:
                    out.append(cur.strip()); cur = s
                else:
                    cur = (cur + ' ' + s).strip()
            if cur:
                out.append(cur)
            chunks = [x for x in out if x]
            if all(len(c) <= MAX_P * 1.2 for c in chunks):
                return chunks
    return [text]


def main():
    n_before = n_after = 0
    for f in glob.glob('../source-layer/*.json'):
        if f.endswith('_stats.json'):
            continue
        d = json.load(open(f))
        paras = d['paragraphs']
        n_before += len(paras)
        merged = []
        for p in paras:
            if (merged and len(p['text']) < MIN_P
                    and merged[-1]['sectionId'] == p['sectionId']
                    and len(merged[-1]['text']) + len(p['text']) <= MAX_P):
                merged[-1]['text'] = (merged[-1]['text'] + ' ' + p['text']).strip()
                merged[-1]['pageEnd'] = p['pageStart']
            else:
                merged.append(dict(p))
        out = []
        for p in merged:
            chunks = split_long(p['text'])
            for i, c in enumerate(chunks):
                q = dict(p)
                q['id'] = p['id'] + (f'-{i+1}' if len(chunks) > 1 else '')
                q['text'] = c
                out.append(q)
        d['paragraphs'] = out
        n_after += len(out)
        json.dump(d, open(f, 'w'), ensure_ascii=False)
    print(f'段落 {n_before} → {n_after}')


if __name__ == '__main__':
    main()
