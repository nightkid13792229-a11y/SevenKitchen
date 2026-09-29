#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BCS 侧视参考图 —— 合成最终上线图

设计要点：
  1. 竖排 4 行（不做 1×4 横排）—— 全宽显示时每只狗才够大，腹线看得清
  2. 标签直接用问卷第 4 题的**选项原文**，让图和用户要答的题一一对应
  3. 四只狗按**脚底对齐**，否则胖瘦对比不成立

输入：30-基准-理想-侧视.jpg / 32-偏瘦-BCS4.jpg / 33-偏胖-BCS7.jpg / 34-肥胖-BCS9.jpg
输出：50-BCS侧视参考图-上线版.jpg
"""

import os
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
S = 2  # 超采样倍数


def trim_white(im, thr=244):
    g = im.convert('L')
    bg = Image.new('L', im.size, 255)
    box = ImageChops.difference(g, bg).point(
        lambda p: 255 if p > (255 - thr) else 0).getbbox()
    return im.crop(box) if box else im


# 档位顺序：从瘦到胖（与问卷第 4 题选项顺序一致）
ROWS = [
    ('32-偏瘦-BCS4.jpg', '偏瘦', 'BCS 4', '明显往上收', '#B8860B'),
    ('30-基准-理想-侧视.jpg', '理想', 'BCS 5', '轻微往上收', '#1a7f37'),
    ('33-偏胖-BCS7.jpg', '偏胖', 'BCS 6-7', '平直', '#C05621'),
    ('34-肥胖-BCS9.jpg', '肥胖', 'BCS 8-9', '往下垂', '#C0392B'),
]

W = 1200 * S                    # 最终图宽（小程序全宽显示 ~690rpx）
PAD = 34 * S
DOG_H = 210 * S                 # 四只狗统一站立高度
ROW_H = DOG_H + 48 * S
HEAD_H = 118 * S
FOOT_H = 76 * S
H = HEAD_H + ROW_H * 4 + FOOT_H + PAD

# 字号按「最终显示宽度」反推：
#   源图 1200px 在小程序里显示约 690px（缩放 0.575），
#   要让标签在手机上有 12~13pt，源图字号必须 ≥ 42px。
canvas = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(canvas)


def font(sz, bold=False):
    try:
        f = ImageFont.truetype(FONT, sz * S)
        if bold:
            try:
                f.set_variation_by_name('W6')
            except Exception:
                pass
        return f
    except Exception:
        return ImageFont.load_default()


f_title = font(46, True)
f_sub = font(32)
f_name = font(46, True)
f_bcs = font(32)
f_cue = font(42)

# --- 顶部标题 ---
d.text((PAD, 26 * S), '体况参考 · 从侧面看肚子', fill='#2B2B2B', font=f_title)
d.text((PAD, 82 * S), '对应第 4 题「从侧面看，肚子有往上收吗？」',
       fill='#8A8A8A', font=f_sub)

y = HEAD_H
d.line([(PAD, y), (W - PAD, y)], fill='#E4E4E4', width=2 * S)

DOG_COL = PAD + 6 * S
NAME_X = DOG_COL + 300 * S      # 档位名起始
CUE_RIGHT = W - PAD - 6 * S     # 判据右对齐

for i, (fn, name, bcs, cue, color) in enumerate(ROWS):
    top = HEAD_H + i * ROW_H
    mid_y = top + ROW_H / 2

    # 理想档：左侧绿色竖条 + 淡底（不用整块底色，否则狗的白底会衬成白方块）
    if name == '理想':
        d.rectangle([PAD - 14 * S, top + 8 * S,
                     PAD - 6 * S, top + ROW_H - 8 * S], fill='#1a7f37')

    # --- 狗：统一缩放到 DOG_H，按脚底对齐 ---
    im = trim_white(Image.open(os.path.join(HERE, fn)).convert('RGB'))
    scale = DOG_H / im.height
    im = im.resize((max(1, int(im.width * scale)), DOG_H), Image.LANCZOS)
    canvas.paste(im, (int(DOG_COL), int(mid_y - DOG_H / 2)))

    # --- 档位名 + BCS（同一行内联）---
    d.text((NAME_X, mid_y - 32 * S), name, fill=color, font=f_name)
    nw = d.textlength(name, font=f_name)
    d.text((NAME_X + nw + 20 * S, mid_y - 14 * S), bcs,
           fill='#9A9A9A', font=f_bcs)

    # --- 判据：问卷选项原文（右对齐）---
    tw = d.textlength(cue, font=f_cue)
    d.text((CUE_RIGHT - tw, mid_y - 26 * S), cue, fill='#2B2B2B', font=f_cue)

    if i < len(ROWS) - 1:
        d.line([(PAD, top + ROW_H), (W - PAD, top + ROW_H)],
               fill='#EDEDED', width=2 * S)

# --- 底部说明 ---
d.text((PAD, HEAD_H + ROW_H * 4 + 22 * S),
       '看不出区别也没关系，以「用手摸肋骨」那两题的结果为准。',
       fill='#8A8A8A', font=font(30))

out = os.path.join(HERE, '50-BCS侧视参考图-上线版.jpg')
canvas.resize((W // S, H // S), Image.LANCZOS).save(out, quality=92)
print('saved', out, (W // S, H // S))
