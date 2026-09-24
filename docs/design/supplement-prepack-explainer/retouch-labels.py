#!/usr/bin/env python3
"""
在已定稿的成品图上「局部改字」——只换铝箔袋标签上的文案，其余像素一律不动。

为什么不重新生成：这一版是抽到的好图（构图、瓶身文字都对），
重新生成会把整张重画一遍，等于把运气重掷一次。局部改字不会动到任何别的地方。

做法：
  1. 用颜色找出三个墨绿标签的位置与旋转角（minAreaRect）
  2. 在标签范围内找出白色文字像素，做成 mask
  3. cv2.inpaint 把旧字抹掉 —— 用 inpaint 而不是直接填绿色，
     这样标签本身的颗粒质感、以及第三个标签上那道斜向阴影，都能原样保留
  4. 用宋体（Songti SC Bold）把新字画上去，字号自动对齐原字高度，并按标签角度旋转

用法：python3 retouch-labels.py
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = 'P-sd5-0-pro-6refs.jpg'
DST = 'P2-sd5-0-pro-6refs-relabeled.jpg'
FONT = '/System/Library/Fonts/Supplemental/Songti.ttc'
FONT_INDEX = 1  # Songti SC Bold

# 要改的两个标签：中心坐标、旋转角、原文字、新文字
EDITS = [
    dict(center=(1151.3, 698.7), angle=3.86, old='一人份', new='一次份'),
    dict(center=(1544.1, 714.7), angle=6.34, old='一餐量', new='制作量'),
]


def label_masks(img):
    """找出全部墨绿标签，返回 [(polygon, center, angle, rw, rh)]。"""
    b, g, r = cv2.split(img.astype(np.int16))
    m = ((g > r + 12) & (g > b + 8) & (g < 130) & (r < 95)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 8000 or w / max(1, h) < 1.3:
            continue
        comp = (lab == i).astype(np.uint8)
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        (cx, cy), (rw, rh), ang = cv2.minAreaRect(cnts[0])
        if rw < rh:
            rw, rh, ang = rh, rw, ang + 90
        out.append(dict(poly=cv2.boxPoints(((cx, cy), (rw, rh), ang)).astype(np.int32),
                        center=(cx, cy), angle=ang, rw=rw, rh=rh))
    return out


def fit_font(text, target_w, target_h):
    """
    二分找字号。

    ⚠️ 关键：要按**宽度**去对齐，不能按高度。
    第一版按高度对齐，结果「一次性」比原来的「一人份」宽出一截，直接顶出标签外。
    标签的横向空间才是硬约束（内宽就那么多），所以让文字的宽度贴合原字宽度，
    同时保证高度不超过原字高度。
    """
    lo, hi = 8, 600
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        f = ImageFont.truetype(FONT, mid, index=FONT_INDEX)
        bb = f.getbbox(text)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        if w <= target_w and h <= target_h:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return ImageFont.truetype(FONT, best or 40, index=FONT_INDEX)


def main():
    img = cv2.imread(SRC)
    H, W = img.shape[:2]
    print(f'底图 {W}x{H}')

    labels = label_masks(img)
    print(f'检测到 {len(labels)} 个墨绿标签')

    for ed in EDITS:
        # 找离目标中心最近的那个标签
        tgt = np.array(ed['center'])
        lab = min(labels, key=lambda L: np.hypot(L['center'][0] - tgt[0], L['center'][1] - tgt[1]))
        cx, cy = lab['center']
        print(f"\n改字「{ed['old']}」→「{ed['new']}」：标签中心 ({cx:.0f},{cy:.0f}) 角度 {lab['angle']:.2f}° 尺寸 {lab['rw']:.0f}x{lab['rh']:.0f}")

        # ① 标签内缩后的实心区域（避免碰到标签外的银色）
        plate = np.zeros((H, W), np.uint8)
        cv2.fillPoly(plate, [lab['poly']], 255)
        plate = cv2.erode(plate, np.ones((9, 9), np.uint8), iterations=1)

        # ② 标签内的亮像素 = 旧文字
        b, g, r = cv2.split(img.astype(np.int16))
        bright = ((r > 100) & (g > 100) & (b > 100)).astype(np.uint8) * 255
        text = cv2.bitwise_and(bright, plate)
        ys, xs = np.where(text > 0)
        if len(xs) == 0:
            print('   ⚠️ 没找到文字像素，跳过')
            continue
        tx0, ty0, tx1, ty1 = xs.min(), ys.min(), xs.max(), ys.max()
        text_w, text_h = tx1 - tx0 + 1, ty1 - ty0 + 1
        print(f'   旧字包围盒 {text_w}x{text_h}')

        # ③ inpaint 抹掉旧字（保留颗粒质感与阴影）
        grow = cv2.dilate(text, np.ones((7, 7), np.uint8), iterations=2)
        img = cv2.inpaint(img, grow, 6, cv2.INPAINT_TELEA)

        # ④ 画新字：先在高分辨率透明层上渲染，再旋转、缩放、贴回去
        SS = 4  # 超采样倍率，让边缘平滑
        # 留 4% 余量，避免新字贴着原字外框
        font = fit_font(ed['new'], text_w * SS * 0.96, text_h * SS * 1.02)
        tmp = Image.new('RGBA', (2400, 900), (0, 0, 0, 0))
        d = ImageDraw.Draw(tmp)
        bb = font.getbbox(ed['new'])
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        ox, oy = (tmp.width - tw) // 2 - bb[0], (tmp.height - th) // 2 - bb[1]
        # 极淡的深色投影，模拟原字那种轻微浮雕感
        d.text((ox + 4, oy + 4), ed['new'], font=font, fill=(16, 42, 30, 90))
        d.text((ox, oy), ed['new'], font=font, fill=(253, 252, 248, 255))
        tmp = tmp.rotate(-lab['angle'], resample=Image.BICUBIC, center=(tmp.width / 2, tmp.height / 2))
        tmp = tmp.resize((tmp.width // SS, tmp.height // SS), Image.LANCZOS)

        layer = np.array(tmp)
        x0 = int(round(cx - layer.shape[1] / 2))
        y0 = int(round(cy - layer.shape[0] / 2))
        # 只把有像素的地方贴上去，且限制在原标签区域内
        a = (layer[:, :, 3:4].astype(np.float32)) / 255.0
        sub = img[y0:y0 + layer.shape[0], x0:x0 + layer.shape[1]].astype(np.float32)
        rgb = layer[:, :, :3].astype(np.float32)
        gate = np.zeros(a.shape, np.float32)
        cv2.fillPoly(gate[:, :, 0], [lab['poly'] - [x0, y0]], 1.0)
        a = a * gate
        img[y0:y0 + layer.shape[0], x0:x0 + layer.shape[1]] = (
            sub * (1 - a) + rgb * a).astype(np.uint8)
        print(f'   已写入「{ed["new"]}」，字号 {font.size//SS}pt（超采样 {SS}x）')

    cv2.imwrite(DST, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f'\n✅ 输出 {DST}')


if __name__ == '__main__':
    main()
