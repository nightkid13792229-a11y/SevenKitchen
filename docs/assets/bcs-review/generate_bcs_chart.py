#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
体况评分对照图生成器（俯视 + 侧视，四档）

为什么用代码画而不是 AI 生成：
  实测 doubao-seedream 连续 3 次都无法画出正确的「俯视腰线／臀宽」关系
  （腰不外鼓、臀部不比胸廓宽），而这两点恰恰是俯视判据的全部内容。
  俯视图要表达的只是身体宽度的变化曲线，属于示意图，代码可 100% 控制。

四档与问卷选项的对应（见 miniapp/src/utils/bcs-questionnaire.ts）：
  偏瘦 BCS4  俯视：明显收窄      侧视：明显往上收
  理想 BCS5  俯视：轻微收窄      侧视：轻微往上收
  偏胖 BCS7  俯视：平直、无收窄  侧视：平直
  肥胖 BCS9  俯视：往外凸        侧视：往下垂

用法：python3 docs/assets/bcs-review/generate_bcs_chart.py
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
S = 4  # 超采样倍数（抗锯齿）

# ---------------------------------------------------------------- 曲线工具


def catmull_rom(points, samples_per_seg=24):
    """穿过给定控制点的平滑曲线（Catmull-Rom 样条）。"""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for j in range(samples_per_seg):
            t = j / samples_per_seg
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    out.append(pts[-2])
    return out


# ---------------------------------------------------------------- 四档参数

# waist / hip 为「相对胸廓半宽」的倍数；tuck 为腹线上收像素（负值=下垂）
STATES = {
    4: dict(waist=0.76, hip=0.78, tuck=30, label='偏瘦', bcs='BCS 4'),
    5: dict(waist=0.88, hip=0.86, tuck=18, label='理想', bcs='BCS 5'),
    7: dict(waist=1.00, hip=0.96, tuck=4, label='偏胖', bcs='BCS 7'),
    9: dict(waist=1.13, hip=1.08, tuck=-12, label='肥胖', bcs='BCS 9'),
}

BODY = '#EFD9BC'   # 身体填充
LINE = '#6B4A2F'   # 描边
LINE_W = 3.0


# ---------------------------------------------------------------- 俯视图

def _ellipse(d, cx, cy, rx, ry):
    d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S],
              fill=BODY, outline=LINE, width=int(LINE_W * S))


def draw_top(state, size):
    """
    正上方俯视。

    头部／耳朵／尾巴／腿都拆成独立形状，只有**躯干**由半宽剖面控制 ——
    这样四档之间的差异全部集中在躯干宽度上，一眼能比出来。
    """
    W, H = size
    p = STATES[state]
    cx = W / 2
    img = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    y0, y1 = 0.175 * H, 0.895 * H         # 躯干纵向范围
    span = y1 - y0
    # 俯视的狗「长:宽 ≈ 2.5:1」——比例不对就会读成仓鼠
    rib = 0.108 * W                       # 胸廓半宽（骨架固定，四档不变）

    def y_at(t):
        return y0 + span * t

    # --- 四条腿：只从身侧露出一点点（俯视时腿基本被身体挡住）---
    leg_w = 0.036 * W
    for t in (0.09, 0.88):
        yy = y_at(t)
        for sgn in (-1, 1):
            px = cx + sgn * rib * 0.72
            d.rounded_rectangle(
                [(px - leg_w / 2) * S, (yy - leg_w * 0.6) * S,
                 (px + leg_w / 2) * S, (yy + leg_w * 1.7) * S],
                radius=leg_w / 2 * S, fill=BODY, outline=LINE,
                width=int(LINE_W * S))

    # --- 尾巴：从臀部向后收细 ---
    tail = catmull_rom([(cx, y_at(0.965)),
                        (cx + W * 0.012, y_at(1.075)),
                        (cx + W * 0.038, y_at(1.185))])
    d.line([(x * S, y * S) for x, y in tail], fill=LINE,
           width=int(W * 0.016 * S), joint='curve')

    # --- 躯干：半宽剖面，四档差异都在这里 ---
    prof = [
        (0.00, 0.58),          # 颈根
        (0.07, 0.80),          # 肩
        (0.22, 0.98),
        (0.34, 1.00),          # 胸廓最宽
        (0.45, 0.96),
        (0.58, p['waist']),    # 腰部 ← 关键差异
        (0.68, p['waist'] * 1.03),
        (0.82, p['hip']),      # 臀部
        (0.93, p['hip'] * 0.80),
        (1.00, 0.42),          # 尾根
    ]
    right = [(cx + rib * m, y_at(t)) for t, m in prof]
    left = [(cx - rib * m, y_at(t)) for t, m in reversed(prof)]
    body = catmull_rom(right) + catmull_rom(left)
    d.polygon([(x * S, y * S) for x, y in body], fill=BODY,
              outline=LINE, width=int(LINE_W * S))

    # --- 头：吻部 + 颅部两段，耳朵后移贴头侧 ---
    hy = 0.112 * H
    hx_r = rib * 0.56          # 颅部半宽
    hy_r = rib * 0.62
    # 颅部
    skull = catmull_rom([
        (cx - hx_r * 0.66, hy + hy_r * 1.30),
        (cx - hx_r * 1.00, hy + hy_r * 0.10),
        (cx - hx_r * 0.70, hy - hy_r * 0.85),
        (cx,               hy - hy_r * 0.95),
        (cx + hx_r * 0.70, hy - hy_r * 0.85),
        (cx + hx_r * 1.00, hy + hy_r * 0.10),
        (cx + hx_r * 0.66, hy + hy_r * 1.30),
    ])
    d.polygon([(x * S, y * S) for x, y in skull], fill=BODY,
              outline=LINE, width=int(LINE_W * S))
    # 吻部（向前伸出、明显比颅部窄 —— 这是「狗」和「老鼠」的关键区别）
    mz_w, mz_l = hx_r * 0.46, hy_r * 1.05
    muzzle = catmull_rom([
        (cx - mz_w,        hy - hy_r * 0.35),
        (cx - mz_w * 0.78, hy - hy_r * 0.35 - mz_l * 0.72),
        (cx,               hy - hy_r * 0.35 - mz_l * 0.98),
        (cx + mz_w * 0.78, hy - hy_r * 0.35 - mz_l * 0.72),
        (cx + mz_w,        hy - hy_r * 0.35),
        (cx + mz_w * 0.80, hy - hy_r * 0.10),
        (cx - mz_w * 0.80, hy - hy_r * 0.10),
    ])
    d.polygon([(x * S, y * S) for x, y in muzzle], fill=BODY,
              outline=LINE, width=int(LINE_W * S))
    # 耳朵：长条形垂耳，顺着颅部两侧向后（不是两个圆球）
    er = rib * 0.26
    for sgn in (-1, 1):
        _ellipse(d, cx + sgn * (hx_r * 0.86 + er * 0.30),
                 hy + hy_r * 0.44, er * 0.58, er * 1.45)

    return img.resize((W, H), Image.LANCZOS)


# ---------------------------------------------------------------- 侧视图

def draw_side(state, size):
    """正侧视：背线水平，腹线由 tuck 参数控制上收或下垂。"""
    W, H = size
    p = STATES[state]
    img = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    ground = H * 0.88
    body_h = H * 0.30
    x_head, x_tail = W * 0.10, W * 0.92

    # --- 腿（先画，被躯干盖住上端）---
    leg_w = W * 0.055
    front_x, hind_x = W * 0.30, W * 0.70
    for lx in (front_x, hind_x):
        d.rounded_rectangle([(lx - leg_w / 2) * S, (ground - body_h * 0.75) * S,
                             (lx + leg_w / 2) * S, ground * S],
                            radius=leg_w / 2 * S, fill=BODY, outline=LINE, width=int(LINE_W * S))

    # --- 躯干：背线（上） + 腹线（下）---
    back_y = ground - body_h
    trough = ground - body_h * 0.42 + p['tuck']     # 腹线最低点（胸底）
    belly_y = ground - body_h * 0.42 - p['tuck'] * 0.15
    top = catmull_rom([
        (W * 0.20, back_y + body_h * 0.30),   # 颈根
        (W * 0.28, back_y + body_h * 0.06),
        (W * 0.45, back_y),
        (W * 0.62, back_y + body_h * 0.02),
        (W * 0.78, back_y + body_h * 0.10),
        (x_tail,  back_y + body_h * 0.34),    # 臀
    ])
    belly = catmull_rom([
        (x_tail,  back_y + body_h * 0.34),
        (W * 0.80, ground - body_h * 0.30 - p['tuck'] * 0.55),
        (W * 0.64, ground - body_h * 0.34 - p['tuck'] * 0.95),
        (W * 0.50, trough),
        (W * 0.38, ground - body_h * 0.26 - p['tuck'] * 1.05),
        (W * 0.28, ground - body_h * 0.10 - p['tuck'] * 0.35),
        (W * 0.21, back_y + body_h * 0.34),
    ])
    torso = top + belly
    d.polygon([(x * S, y * S) for x, y in torso], fill=BODY, outline=LINE, width=int(LINE_W * S))

    # --- 头 + 颈 ---
    hx, hy, hr = W * 0.135, back_y - body_h * 0.02, body_h * 0.40
    d.ellipse([(hx - hr) * S, (hy - hr) * S, (hx + hr) * S, (hy + hr) * S],
              fill=BODY, outline=LINE, width=int(LINE_W * S))
    d.ellipse([(hx - hr * 1.30) * S, (hy - hr * 0.10) * S,
               (hx - hr * 0.30) * S, (hy + hr * 0.62) * S],
              fill=BODY, outline=LINE, width=int(LINE_W * S))          # 吻部
    d.ellipse([(hx + hr * 0.28) * S, (hy - hr * 0.98) * S,
               (hx + hr * 1.02) * S, (hy + hr * 0.30) * S],
              fill='#D9B591', outline=LINE, width=int(LINE_W * S))     # 耳
    d.polygon([((hx + hr * 0.30) * S, (hy + hr * 0.55) * S),
               ((W * 0.24) * S, (back_y + body_h * 0.10) * S),
               ((W * 0.235) * S, (back_y + body_h * 0.42) * S),
               ((hx + hr * 0.20) * S, (hy + hr * 0.95) * S)],
              fill=BODY, outline=LINE, width=int(LINE_W * S))          # 颈

    # --- 尾 ---
    tail = catmull_rom([(x_tail - W * 0.01, back_y + body_h * 0.30),
                        (W * 0.97, back_y - body_h * 0.10),
                        (W * 1.00, back_y - body_h * 0.55)])
    d.line([(x * S, y * S) for x, y in tail], fill=LINE,
           width=int((leg_w * 0.42) * S), joint='curve')
    return img.resize((W, H), Image.LANCZOS)


# ---------------------------------------------------------------- 拼图

def build_sheet(cell=(430, 330), label_h=64):
    try:
        f_title = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 34)
        f_sub = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 24)
    except Exception:
        f_title = f_sub = ImageFont.load_default()

    cw, ch = cell
    cols, rows = 4, 2
    pad = 20
    W = pad * (cols + 1) + cw * cols
    H = label_h + pad * (rows + 1) + ch * rows + 46
    sheet = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(sheet)

    d.text((pad, 18), '体况评分对照图', fill='#6B4A2F', font=f_title)
    row_titles = ['从正上方看（俯视）', '从正侧面看（侧视）']
    order = [4, 5, 7, 9]

    for r in range(rows):
        y = label_h + pad + r * (ch + pad + 46)
        d.text((pad + 4, y - 34), row_titles[r], fill='#333333', font=f_sub)
        for c, st in enumerate(order):
            x = pad + c * (cw + pad)
            im = draw_top(st, (cw, ch)) if r == 0 else draw_side(st, (cw, ch))
            sheet.paste(im, (x, y), im)
            s = STATES[st]
            cap = f"{s['label']}　{s['bcs']}"
            tw = d.textlength(cap, font=f_sub)
            d.text((x + (cw - tw) / 2, y + ch + 8), cap,
                   fill='#6B4A2F' if st == 5 else '#333333', font=f_sub)
    return sheet


if __name__ == '__main__':
    sheet = build_sheet()
    path = os.path.join(OUT_DIR, '10-代码绘制-对照图.jpg')
    sheet.save(path, quality=94)
    print('saved', path, sheet.size)
    # 单张导出（供小程序按档位单独使用）
    for st in STATES:
        for view, fn in (('top', draw_top), ('side', draw_side)):
            im = fn(st, (600, 460))
            bg = Image.new('RGB', im.size, 'white')
            bg.paste(im, (0, 0), im)
            bg.save(os.path.join(OUT_DIR, f'11-bcs{st}-{view}.jpg'), quality=92)
    print('单张导出完成')
