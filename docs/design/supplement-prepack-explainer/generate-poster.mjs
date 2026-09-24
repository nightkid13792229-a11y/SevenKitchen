/**
 * 生成「什么是预分装补剂？」解释海报（Seedream 4.5 · 火山方舟通道）。
 *
 * 为什么不走 DSH 的 generate_image 工具：正在跑的 DSH 会话里，MCP 子进程是**按会话 spawn**
 * 的，改完插件代码后旧会话仍跑旧代码（旧代码不认 Seedream，还会静默丢掉参考图）。
 * 本脚本直接 import 磁盘上的最新代码，因此永远是最新逻辑。
 *
 * 用法：
 *   node generate-poster.mjs                  # 用 prompt.txt + refs/ 下全部参考图
 *   node generate-poster.mjs --no-refs        # 纯文字生图（忽略 refs/）
 *   node generate-poster.mjs --prompt x.txt   # 换一份提示词
 *   node generate-poster.mjs --model doubao-seedream-5-0-260128
 *
 * 费用：Seedream 4.5 约 0.2 元/张（参考图张数不影响计费）。一次只出一张。
 */
import { readFileSync, readdirSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

// 参考图目录可换：参考图的**构成比例**会显著影响模型的注意力分配。
// 比如想强调"预分装"，就别喂 5 张瓶子照片 —— 那样模型一定会把瓶子当主角。
const REFS_DIR = value('--refs-dir', join(HERE, 'refs'));
const MEDIA = join(homedir(), '.dsh', 'mcp', 'media', 'lib', 'tools.mjs');

const PROMPT_FILE = value('--prompt', join(HERE, 'prompt.txt'));
// 用户选定 Seedream 5.0 Pro（最新档）。
const MODEL = value('--model', 'doubao-seedream-5-0-pro-260628');
// 3:2 —— 跟仓库里既有的内容大图一致（miniapp/src/static/delivery/making.jpg = 700x471）。
// ⚠️ 5.0 Pro 的显式尺寸区间是 1280x720 ~ 2048x2048，所以**不能**用 3072x2048（会被拒）。
//    1920x1280 是 3:2、且宽高都是 16 的倍数，正好落在区间内。
const SIZE = value('--size', '1920x1280');
/** 交付尺寸：跟仓库既有内容图对齐（长边 700，JPG）。 */
const DELIVER_LONG_EDGE = Number(value('--deliver-edge', '700'));

if (!existsSync(PROMPT_FILE)) {
  console.error(`❌ 找不到提示词文件：${PROMPT_FILE}`);
  process.exit(1);
}
const prompt = readFileSync(PROMPT_FILE, 'utf8').trim();
if (!prompt) {
  console.error(`❌ 提示词文件是空的：${PROMPT_FILE}`);
  process.exit(1);
}

// ── 收集参考图（按文件名排序，顺序 = 提示词里的「图一/图二/…」）──
// 约定：以 `_` 开头的文件是给人看的辅助图（如 _contact-sheet.png），**不喂给模型**。
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
let refs = [];
let skipped = [];
if (!flag('--no-refs') && existsSync(REFS_DIR)) {
  const all = readdirSync(REFS_DIR).filter((n) => EXTS.has(extname(n).toLowerCase()));
  skipped = all.filter((n) => n.startsWith('_'));
  refs = all
    .filter((n) => !n.startsWith('_'))
    .sort()
    .map((n) => join(REFS_DIR, n));
}

console.log(`模型：${MODEL}`);
console.log(`尺寸：${SIZE}`);
console.log(`提示词：${basename(PROMPT_FILE)}（${prompt.length} 字）`);
if (refs.length === 0) {
  console.log('参考图：无（纯文字生图）');
} else {
  console.log(`参考图：${refs.length} 张`);
  refs.forEach((p, i) => {
    const kb = (statSync(p).size / 1024).toFixed(0);
    console.log(`  图${'一二三四五六七八九十'[i] ?? i + 1}  ${basename(p)}  (${kb}KB)`);
  });
  if (skipped.length) console.log(`  （跳过 ${skipped.length} 张辅助图：${skipped.join(', ')}）`);
}
console.log('');

const { generateImage } = await import(MEDIA);

let result;
try {
  result = await generateImage({
    model: MODEL,
    prompt,
    size: SIZE,
    ...(refs.length > 0 ? { referenceImages: refs } : {}),
  });
} catch (error) {
  const message = String(error?.message ?? error);
  console.error(`\n❌ 生成失败：${message}\n`);
  if (/API Key/.test(message)) {
    console.error('👉 没配火山方舟密钥。去 https://console.volcengine.com/ark 建一个，');
    console.error('   然后加进 ~/.dsh/.credentials.yaml 的 refs 下： ARK_API_KEY: <你的key>');
  } else if (/ModelNotOpen/.test(message)) {
    console.error('👉 模型还没开通：控制台 → 开通管理 → 搜 Doubao-Seedream → 立即开通。');
  } else if (/AccountOverdue|InsufficientBalance|QuotaExceeded/.test(message)) {
    console.error('👉 账户欠费或额度用尽，去火山方舟控制台充值即可（重试没有用）。');
  }
  process.exit(1);
}

// ── 落一份带版本号的副本到本目录 ──
const existing = readdirSync(HERE).filter((n) => /^[A-Z]-.*\.(jpg|jpeg|png)$/i.test(n));
const used = new Set(existing.map((n) => n[0].toUpperCase()));
const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c)) ?? 'Z';
const tag = `${letter}-${MODEL.replace(/^doubao-seedream-/, 'sd').replace(/-260628$|-251128$|-260128$|-250828$/, '')}-${refs.length ? `${refs.length}refs` : 'textonly'}`;
const dest = join(HERE, `${tag}${extname(result.path)}`);
copyFileSync(result.path, dest);

console.log(`\n✅ 生成成功`);
console.log(`   引擎内落盘：${result.path}`);
console.log(`   版本副本  ：${dest}`);
console.log(`   体积      ：${(result.bytes / 1024).toFixed(0)}KB   格式：${result.format}`);
console.log(`   耗时      ：${(result.elapsedMs / 1000).toFixed(1)}s`);
console.log(`   参考图    ：${result.referenceCount} 张`);
console.log(`   本张费用  ：约 0.2 元`);

// ── 出一份「可直接进小程序」的交付图：长边 700 的 JPG，跟仓库既有内容图同规格 ──
const READY_DIR = join(HERE, 'ready');
mkdirSync(READY_DIR, { recursive: true });
const ready = join(READY_DIR, `${tag}-${DELIVER_LONG_EDGE}.jpg`);
try {
  execFileSync('sips', ['-Z', String(DELIVER_LONG_EDGE), '-s', 'format', 'jpeg', dest, '--out', ready], {
    stdio: 'ignore',
  });
  const kb = (statSync(ready).size / 1024).toFixed(0);
  // 读出实际交付尺寸，确认长边确实是 700
  const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', ready], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => /pixel/.test(l))
    .map((l) => l.split(':')[1].trim())
    .join('x');
  console.log(`\n📦 交付图（可直接放进 miniapp/src/static/）：`);
  console.log(`   ${ready}`);
  console.log(`   ${dims}   ${kb}KB`);
  if (Number(kb) > 120) {
    console.log(`   ⚠️ 比仓库既有的 60KB 偏大，可再压一档：sips -Z ${DELIVER_LONG_EDGE} -s formatOptions 70 …`);
  }
} catch (error) {
  console.log(`\n⚠️  交付图压缩失败（不影响上面的原图）：${error?.message ?? error}`);
  console.log('   手动压：sips -Z 700 -s format jpeg 原图 --out 目标.jpg');
}
