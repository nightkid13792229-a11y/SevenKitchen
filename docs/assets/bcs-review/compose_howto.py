#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「怎么摸」操作指引图 —— 合成上线版

为什么用「高亮区域」而不是画手：
  实测 AI 画「手放在狗身上」时手指偏长偏平、手臂与狗背糊在一起，
  属于 AI 的经典弱项。而指引图真正要传达的只是**位置**，
  高亮区能 100% 精确控制，且不会出现畸形的手。

两个区域的位置由 `80-网格.jpg` 上的坐标网格读出，不是估算。

输入：30-基准-理想-侧视.jpg
输出：90-怎么摸-操作指引图.jpg
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
S = 2

W = 1200 * S
PAD = 36 * S
ROW_H = 300 * S
HEAD_H = 118 * S
FOOT_H = 78 * S
H = HEAD_H + ROW_H * 2 + FOOT_H + PAD

ORANGE = (255, 122, 56, 120)

# 在 1091x824 的狗图上按比例标注的区域（网格读出）
ZONES = {
    'rib': [((0.22, 0.34, 0.44, 0.56), ORANGE)],
    'back': [((0.20, 0.23, 0.615, 0.335), ORANGE),
             ((0.625, 0.245, 0.725, 0.365), ORANGE)],
}

ROWS = [
    ('rib', '1', '摸肋骨', '手平放在这里，轻轻按下去', '#C05621'),
    ('back', '2', '摸脊椎和骨盆', '从脖子摸到尾巴，再摸屁股上方', '#1F6FEB'),
]


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


def trim_white(im, thr=246):
    g = im.convert('L')
    b = ImageChops.difference(g, Image.new('L', im.size, 255)).point(
        lambda p: 255 if p > (255 - thr) else 0).getbbox()
    return im.crop(b) if b else im


base = trim_white(Image.open(os.path.join(HERE, '30-基准-理想-侧视.jpg')).convert('RGBA'))
BW, BH = base.size

canvas = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(canvas)

f_title = font(46, True)
f_sub = font(32)
f_name = font(44, True)
f_cue = font(36)
f_badge = font(38, True)

d.text((PAD, 26 * S), '怎么摸？两个动作就够', fill='#2B2B2B', font=f_title)
d.text((PAD, 82 * S), '对应第 1、2 题（这两题决定体况分，不能跳过）',
       fill='#8A8A8A', font=f_sub)
d.line([(PAD, HEAD_H), (W - PAD, HEAD_H)], fill='#E4E4E4', width=2 * S)

DOG_H = 236 * S
DOG_COL = PAD + 10 * S
TEXT_X = DOG_COL + 360 * S      # 文字列起点（狗约占 320px，留出间隙）
BADGE_R = 26 * S
NAME_PAD = 62 * S               # 编号圆标之后才是档位名

for i, (key, badge, name, cue, color) in enumerate(ROWS):
    top = HEAD_H + i * ROW_H
    mid = top + ROW_H / 2

    # 叠加高亮区
    zone = Image.new('RGBA', (BW, BH), (0, 0, 0, 0))
    zd = ImageDraw.Draw(zone)
    for (x0, y0, x1, y1), c in ZONES[key]:
        zd.ellipse((x0 * BW, y0 * BH, x1 * BW, y1 * BH), fill=c)
    dog = Image.alpha_composite(base, zone)

    scale = DOG_H / dog.height
    dog = dog.resize((int(dog.width * scale), DOG_H), Image.LANCZOS)
    canvas.paste(dog, (int(DOG_COL), int(mid - DOG_H / 2)), dog)

    # 编号圆标（在文字左侧，不与文字重叠）
    d.ellipse([TEXT_X, mid - BADGE_R, TEXT_X + BADGE_R * 2, mid + BADGE_R],
              fill=color)
    tw = d.textlength(badge, font=f_badge)
    d.text((TEXT_X + BADGE_R - tw / 2, mid - 24 * S), badge,
           fill='white', font=f_badge)

    nx = TEXT_X + NAME_PAD
    d.text((nx, mid - 40 * S), name, fill=color, font=f_name)
    d.text((nx, mid + 14 * S), cue, fill='#555555', font=f_cue)

    if i == 0:
        d.line([(PAD, top + ROW_H), (W - PAD, top + ROW_H)],
               fill='#EDEDED', width=2 * S)

d.text((PAD, HEAD_H + ROW_H * 2 + 24 * S),
       '摸到什么样算什么样，不用刻意用力 —— 答案没有对错，照实选就好。',
       fill='#8A8A8A', font=font(30))

out = os.path.join(HERE, '90-怎么摸-操作指引图.jpg')
canvas.resize((W // S, H // S), Image.LANCZOS).save(out, quality=92)
print('saved', out, (W // S, H // S))
