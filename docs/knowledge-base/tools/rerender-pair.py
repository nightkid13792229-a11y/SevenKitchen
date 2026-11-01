#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""返工第二轮：把表题所在页与其下一页一起渲染（表格常跨页）。"""
import csv, json, os, sys
import fitz

HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
IDX=os.path.join(HERE,'..','tables','_index.csv')
OUT='/tmp/tables/pair'

def main():
    ids=set(json.load(open(sys.argv[1])))
    idx={r['表号ID']:r for r in csv.DictReader(open(IDX,encoding='utf-8-sig'))}
    os.makedirs(OUT,exist_ok=True)
    cache={}
    for tid in sorted(ids):
        r=idx.get(tid)
        if not r: continue
        src=os.path.join(ROOT,r['文档'])
        if src not in cache: cache[src]=fitz.open(src)
        doc=cache[src]; pno=int(r['页码'])
        for tag,p in (('a',pno),('b',min(pno+1,doc.page_count))):
            page=doc[p-1]
            words=page.get_text('words')
            vert=sum(1 for w in words if (w[3]-w[1])>(w[2]-w[0])*1.5)
            if words and vert>len(words)*0.6:
                page.set_rotation((page.rotation+90)%360)
            pix=page.get_pixmap(dpi=130)
            pix.save(os.path.join(OUT,f'{tid}_{tag}.png'))
    for d in cache.values(): d.close()
    print('成对渲染完成 →', OUT)

if __name__=='__main__': main()
