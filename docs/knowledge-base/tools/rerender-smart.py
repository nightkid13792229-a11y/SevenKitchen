#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""返工第三轮：在全文里找"表题后面紧跟大量数字"的那一页，渲成整页图。"""
import csv, json, os, re, sys
import fitz

HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.expanduser('~/Documents/SevenKitchen-knowledge-sources')
IDX=os.path.join(HERE,'..','tables','_index.csv')
OUT='/tmp/tables/smart'
NUM=re.compile(r'\d[\d,]*\.?\d*')

def main():
    ids=json.load(open(sys.argv[1]))
    idx={r['表号ID']:r for r in csv.DictReader(open(IDX,encoding='utf-8-sig'))}
    os.makedirs(OUT,exist_ok=True)
    cache={}; chosen={}
    for tid in ids:
        r=idx.get(tid)
        if not r: continue
        src=os.path.join(ROOT,r['文档'])
        if src not in cache: cache[src]=fitz.open(src)
        doc=cache[src]
        m=re.search(r'(?:TABLE|Table)\s*([A-Z]{0,3}[-–]?\d+(?:[-–]\d+)?)', r['表题'])
        key=m.group(1).replace('–','-') if m else None
        best=None; best_score=-1
        for i in range(doc.page_count):
            t=doc[i].get_text()
            if not key: break
            for mm in re.finditer(re.escape(key), t):
                tail=t[mm.end():mm.end()+800]
                score=len(NUM.findall(tail))
                if score>best_score:
                    best_score=score; best=i+1
        page_no=best or int(r['页码'])
        chosen[tid]={'page':page_no,'score':best_score}
        page=doc[page_no-1]
        words=page.get_text('words')
        vert=sum(1 for w in words if (w[3]-w[1])>(w[2]-w[0])*1.5)
        if words and vert>len(words)*0.6:
            page.set_rotation((page.rotation+90)%360)
        page.get_pixmap(dpi=130).save(os.path.join(OUT,f'{tid}.png'))
    for d in cache.values(): d.close()
    json.dump(chosen, open('/tmp/tables/smart_pages.json','w'), ensure_ascii=False, indent=1)
    print('智能定位并渲染', len(chosen), '张 →', OUT)

if __name__=='__main__': main()
