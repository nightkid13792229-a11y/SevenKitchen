/**
 * A 路线：真实商品图 + AI 生成场景 → 合成一张海报。
 *
 * 为什么这么做：AI 重画别人的商标会出错（实测 KAL 那瓶写成了 "Bonen Meal Powstrotay"），
 * 而真实商品图的文字是 100% 准确的。所以让 AI 只负责它擅长的部分
 * （背景、光影、铝箔袋、散落的半成品），瓶子全部用真实商品图抠出来贴上去。
 *
 * 抠图算法：白底商品图 → 从**画面四边**做 floodFill（cv2.floodFill），
 * 只把「与边框连通的近白区域」判为背景。
 * 这一点很关键：不能简单地"把白色都去掉"，因为 01/02/03 的瓶子本身就是白的，
 * 一刀切会把瓶子掏空。floodFill 从边缘出发，白瓶内部与外界不连通，因此能保住。
 *
 * 用法：node composite-poster.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS = join(HERE, 'refs');

// ── 配置：要贴哪些真实包装、放多大、放哪里 ──
// `h` 是瓶子高度占画布高度的比例（模拟货架上的真实大小差异）；
// `baseY` 是瓶底所在的画布高度比例 —— 必须跟场景里铝箔袋的底边对齐，否则会"浮空"。
const BASE_Y = 0.805;
const PLAN = [
  { file: '04-solgar琥珀瓶.jpg', label: 'Solgar 琥珀瓶', h: 0.235, cx: 0.062, shadow: 0.55 },
  { file: '02-now片剂瓶.jpg',    label: 'NOW 片剂瓶',    h: 0.285, cx: 0.156, shadow: 0.60 },
  { file: '01-now胶囊瓶.jpg',    label: 'NOW 胶囊瓶',    h: 0.330, cx: 0.258, shadow: 0.65 },
  { file: '03-粉剂罐.jpg',       label: 'KAL 粉剂罐',    h: 0.392, cx: 0.372, shadow: 0.70 },
];

const SCENE = process.argv[2] ?? join(HERE, 'scene-base.jpg');
const OUT = join(HERE, 'N-real-photos-composite.jpg');
const READY = join(HERE, 'ready', 'N-real-photos-composite-700.jpg');

if (!existsSync(SCENE)) {
  console.error(`❌ 找不到场景底图：${SCENE}\n   先跑：node generate-poster.mjs --no-refs --prompt prompt-scene.txt`);
  process.exit(1);
}

/** 白底抠图：只去掉「与四边连通的近白区域」，保住白瓶子本身。 */
function cutoutWhite(srcPath, tag) {
  const py = `
import cv2, numpy as np, sys
p = sys.argv[1]
img = cv2.imread(p, cv2.IMREAD_COLOR)
if img is None: sys.exit('读不到图片: ' + p)
h, w = img.shape[:2]

# 近白判定：三个通道都很亮，且彼此接近（排除彩色/高光带色）
b, g, r = cv2.split(img.astype(np.int16))
mn = np.minimum(np.minimum(b, g), r)
mx = np.maximum(np.maximum(b, g), r)
near_white = ((mn >= 232) & ((mx - mn) <= 16)).astype(np.uint8)

# 只保留与边框连通的那一块 —— 白瓶内部不连通，因此不会被吃掉
ff = near_white.copy()
mask = np.zeros((h + 2, w + 2), np.uint8)
for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if ff[seed[1], seed[0]] == 1:
        cv2.floodFill(ff, mask, seed, 2)
bg = (ff == 2).astype(np.uint8)

# 边缘羽化：对背景区域做一点腐蚀再高斯模糊，得到柔和的 alpha
alpha = (1 - bg).astype(np.float32)
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
alpha = cv2.erode(alpha, k, iterations=2)
alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

# ── 去白边（despill）：这是合成里最容易露馅的地方 ──
# 白底商品图的半透明边缘像素里混着背景的白，直接贴上去就是一圈白色光晕
# （03 那张原图还是透明底合成出来的白底 JPEG，光晕更明显）。
# 做法：先用 alpha 的"实心区"当作颜色源，再用距离变换把每个边缘像素的颜色
# 替换成离它最近的那个实心像素的颜色 —— 也就是把瓶身颜色"外扩"去填边缘。
# ⚠️ core 必须是 **布尔** 数组。写成 (alpha > 0.9).astype(np.uint8) 再拿去索引，
# numpy 会当成"整数索引"（把 0/1 当行号），生成一个百万级的索引数组，
# lut[labels[core]] = img[core] 就会卡死几十秒到几分钟。这个坑实测踩过。
core = alpha > 0.90
if core.any():
    inv = (1 - core.astype(np.uint8)).astype(np.uint8)
    _dist, labels = cv2.distanceTransformWithLabels(
        inv, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros((int(labels.max()) + 1, 3), np.uint8)
    lut[labels[core]] = img[core]
    img = lut[labels]

out = np.dstack([img.astype(np.float32), alpha * 255]).astype(np.uint8)
cv2.imwrite(sys.argv[2], out)

ys, xs = np.where(alpha > 0.35)
if len(xs) == 0: sys.exit('抠图结果为空: ' + p)
print(f"{xs.min()},{ys.min()},{xs.max()},{ys.max()}")
`;
  // ⚠️ 每张抠图必须写到**各自独立**的临时文件。
  // 之前这里写死了同一个路径，而合成阶段是在循环结束后才读文件，
  // 结果四张抠图全指向最后写的那一张 —— 于是四个瓶子都变成了 KAL。
  const tmpPng = join(HERE, `.tmp-cutout-${tag}.png`);
  const res = spawnSync('python3', ['-c', py, srcPath, tmpPng], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`抠图失败 ${srcPath}: ${res.stderr || res.stdout}`);
  const bbox = res.stdout.trim().split(',').map(Number);
  return { png: tmpPng, bbox };
}

/** 生成一张柔和接触阴影（RGBA），贴在瓶子下面让它"站住"。 */
function makeShadow(w, h, strength) {
  const py = `
import cv2, numpy as np, sys
w, h, s = int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3])
# 椭圆形的软阴影：中间深、边缘淡
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
d = ((xx - cx) / (w / 2.0)) ** 2 + ((yy - cy) / (h / 2.0)) ** 2
a = np.clip(1.0 - d, 0, 1) ** 1.6 * s
a = cv2.GaussianBlur(a.astype(np.float32), (0, 0), max(1.0, w / 12.0))
img = np.zeros((h, w, 4), np.uint8)
img[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
cv2.imwrite(sys.argv[4], img)
`;
  const out = join(HERE, '.tmp-shadow.png');
  const res = spawnSync('python3', ['-c', py, String(w), String(h), String(strength), out], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`阴影生成失败: ${res.stderr}`);
  return out;
}

// ── 用 Python/PIL 做最终合成（要读 RGBA 叠加，PIL 最省事）──
const cutouts = [];
let idx = 0;
for (const item of PLAN) {
  const src = join(REFS, item.file);
  if (!existsSync(src)) {
    console.log(`⏭️  跳过（缺文件）：${item.file}`);
    continue;
  }
  const { png, bbox } = cutoutWhite(src, idx);
  cutouts.push({ ...item, png, bbox });
  console.log(`✅ 抠出 ${item.label}：${item.file}  → ${png}`);
  idx += 1;
}

const planJson = join(HERE, '.tmp-plan.json');
writeFileSync(planJson, JSON.stringify({ scene: SCENE, out: OUT, baseY: BASE_Y, items: cutouts }), 'utf8');

const compose = `
import json, sys
from PIL import Image, ImageFilter, ImageDraw, ImageChops
import numpy as np

cfg = json.load(open(sys.argv[1], encoding='utf-8'))
scene = Image.open(cfg['scene']).convert('RGBA')
W, H = scene.size
print('画布', scene.size)

# 先把底图整体压一点点对比度并暖化，让贴上去的照片不显得比背景"更亮更冷"
arr = np.asarray(scene.convert('RGB')).astype(np.float32)
arr = arr * 0.985 + 4.0
arr[..., 0] *= 1.004   # 轻微偏暖
arr[..., 2] *= 0.996
scene = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert('RGBA')

for it in cfg['items']:
    cut = Image.open(it['png']).convert('RGBA')
    x0, y0, x1, y1 = it['bbox']
    cut = cut.crop((x0, y0, x1 + 1, y1 + 1))

    # 目标高度 = 画布高度 * h，等比缩放
    target_h = int(H * it['h'])
    target_w = max(1, int(cut.width * target_h / cut.height))
    cut = cut.resize((target_w, target_h), Image.LANCZOS)

    # 色调匹配：商品图是冷白棚拍，场景是暖米色环境光。不调的话瓶子会"跳"出来，
    # 一眼就看得出是贴上去的。这里轻微暖化 + 压一点亮度，把它摁回场景的环境光里。
    _rgb = np.asarray(cut.convert('RGB')).astype(np.float32)
    _rgb *= np.array([1.014, 1.000, 0.976], np.float32)
    _rgb = _rgb * 0.972 + 3.5
    _alpha = np.asarray(cut)[..., 3]
    cut = Image.fromarray(
        np.dstack([np.clip(_rgb, 0, 255).astype(np.uint8), _alpha]), 'RGBA')

    cx = int(W * it['cx'])
    left = cx - target_w // 2
    # 瓶底对齐 baseY（跟场景里铝箔袋的底边同一条线，否则会"浮空"）
    top = int(H * cfg['baseY']) - target_h
    left = max(0, min(left, W - target_w))
    top = max(0, min(top, H - target_h))

    # 接触阴影：贴在瓶子底部偏下，比瓶子略宽。
    # 之前阴影太黑太宽，看起来像台面上多了一条黑带 —— 现在调淡、收窄、多模糊。
    sw = int(target_w * 1.22)
    sh = max(5, int(target_h * 0.048))
    sh_img = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh_img)
    d.ellipse([0, 0, sw - 1, sh - 1], fill=(72, 62, 48, int(105 * it['shadow'])))
    sh_img = sh_img.filter(ImageFilter.GaussianBlur(max(2.0, sw / 7.0)))
    # 阴影中心落在瓶底下方一点，而不是跨在瓶底上
    sy = int(H * cfg['baseY'] - sh * 0.42)
    sx = cx - sw // 2
    scene.alpha_composite(sh_img, (max(0, sx), max(0, min(sy, H - sh))))

    # 贴瓶子
    scene.alpha_composite(cut, (left, top))
    print(f"  贴上 {it['label']}: {target_w}x{target_h} @ ({left},{top})")

scene.convert('RGB').save(cfg['out'], quality=94)
print('已输出', cfg['out'])
`;
const res = spawnSync('python3', ['-c', compose, planJson], { encoding: 'utf8' });
process.stdout.write(res.stdout || '');
if (res.status !== 0) {
  console.error(res.stderr);
  process.exit(1);
}

// 顺带出交付图
spawnSync('sips', ['-Z', '700', '-s', 'format', 'jpeg', OUT, '--out', READY], { stdio: 'ignore' });
console.log(`\n📦 交付图：${READY}`);
