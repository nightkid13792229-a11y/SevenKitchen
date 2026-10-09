#!/usr/bin/env node
/**
 * 疫苗本识别 · 跑分脚本（2026-10-09）
 *
 * 为什么要有它：老板问得对 —— "现在生产数据很少，再跑一周有意义吗？"
 * 没有意义。正确的做法是**自己造样本、主动量**，而不是等数据 ✗。
 *
 * ⚠️ 后缀是 .cjs —— backend/package.json 是 "type": "module"，
 *    用 .js 会被当成 ESM 从而 require 报错 ✗（2026-10-09 实测）。
 *
 * 用法（在仓库根目录）：
 *   EVAL_JWT=<令牌> node backend/scripts/eval-vaccine-books.cjs [--dir <评测集目录>]
 *   EVAL_JWT=<令牌> node backend/scripts/eval-vaccine-books.cjs --dump
 *     → **只生成答案草稿**（把每张照片识别出来的行按 labels.csv 的格式打出来，
 *        连"可疑的地方"一起标注），老板对着本子改一改就能用 ✓
 *
 * 评测集目录结构（默认 `.eval-data/vaccine-books/`，已在 .gitignore 里 ✓）：
 *   photos/*.jpg|png|webp|heic      真实疫苗本照片
 *   labels.csv                      标准答案：文件名,本子上写的产品名,接种日期
 *
 * ⚠️ 它**只调生产的识别接口**（识别 → 匹配 → 复核 → 品牌检查），
 *    **不会写任何接种记录** ✓；每张照片上传后立刻删掉 ✓（不在云上留垃圾）。
 *    照片全程留在本机 ✓ —— 不上传到我们这边（接口只收一个 URL ✓）。
 *
 * 打出来的四个数就是老板要看的：
 *   · 产品名读对率（严格/宽松）—— 模型照抄得准不准
 *   · 日期读对率 + **编了日子**的行数 —— 实测它会自己补一个日子 ✗
 *   · 认出率 —— 有多少行能落到产品库上（落到库里才算得进计划 ✓）
 *   · 报警数 —— 复核/品牌检查报了几行（含是否命中真错）
 */

const fs = require('node:fs');
const path = require('node:path');

const API_BASE = (process.env.EVAL_API_BASE || 'https://api.sevenkitchen.cloud/api/v1').replace(/\/+$/, '');
let TOKEN = process.env.EVAL_JWT || '';

const REPO_ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const DUMP_ONLY = args.includes('--dump');
const dirIndex = args.indexOf('--dir');
const DATA_DIR = dirIndex >= 0 && args[dirIndex + 1]
  ? path.resolve(args[dirIndex + 1])
  : path.join(REPO_ROOT, '.eval-data/vaccine-books');

/** 产品名归一化：去商标符号、空格、大小写、标点 —— 只判"字是不是那些字" */
function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[®™©@·．.。,，、'"“”‘’()（）\-—_/\s]/g, '');
}

function parseLabels(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('文件名')) continue;
    const parts = trimmed.split(',').map((item) => item.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3 || !parts[0]) continue;
    /*
     * 日期栏里老板会写批注（2026-10-09 实测），例如：
     *   「2025-04-26（未填注射日期，这个日期是生产日期）」
     *   「2025-08-20（18涂改成20）」
     * → 先剥掉括号里的批注，剩下的才是答案 ✓
     * → 批注里写了"未填/没有填"的：**本子上没有注射日期** ✓
     *   这时候我们若输出任何日期 = 「多写了日期」✗（这正是最该量的那个数 ✓）
     */
    const rawDate = parts[2];
    const note = (rawDate.match(/[（(]([^）)]*)[）)]/g) || []).join('');
    const dateValue = rawDate.replace(/[（(][^）)]*[）)]/g, '').trim();
    const dateMissing = /未填|没有填|没填|无注射日期|未写/.test(note);

    // `?` = 这一行看不清/说不清 → 跳过判定（不算错 ✓）
    const skipName = parts[1] === '?' || parts[1] === '' || parts[1] === '-';
    const skipDate = dateMissing || parts[2] === '?' || parts[2] === '-';
    rows.push({
      file: parts[0],
      name: skipName ? '' : parts[1],
      date: skipDate ? '' : dateValue,
      // 本子上没写注射日期（批注说的）→ 我们输出任何日期都算"多写了"✗
      expectsNoDate: dateMissing,
    });
  }
  return rows;
}

async function uploadPhoto(filePath, fileName) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), fileName);
  const res = await fetch(`${API_BASE}/health/upload-image?type=vaccine`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.url) {
    throw new Error(`上传失败 HTTP ${res.status}：${String(body?.message || '').slice(0, 120)}`);
  }
  return String(body.data.url);
}

async function extract(url, fileName) {
  const res = await fetch(`${API_BASE}/health/extract-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: url, originalFilename: fileName, documentType: 'VACCINE_BOOK' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data) {
    throw new Error(`识别失败 HTTP ${res.status}：${String(body?.message || '').slice(0, 120)}`);
  }
  return body.data;
}

async function dropAttachment(url) {
  const key = String(url || '').split('/').pop();
  if (!key) return;
  await fetch(`${API_BASE}/health/attachments/vaccine/${key}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
  }).catch(() => {});
}

/**
 * 把各种"年月写法"归一成 YYYY-MM。
 *
 * 为什么要有它（2026-10-09 老板问的）：各家表格软件对"2023年8月"的处理不一样，
 * 填的人不该为了迁就脚本去改自己习惯的写法 ✓。
 * 认这几种：2023-08 / 2023-8 / 2023/08 / 2023/8 / 2023年8月 / 2023.08
 * ⚠️ 认不出"Excel 已经偷偷存成 2023-08-01"的情况 ✗ —— 那长得和"真是 8 月 1 号"一样，
 *    脚本无法分辨（所以填表时别用 Excel，或者那一格加个单引号 ✓）。
 */
function normalizeMonthOnly(value) {
  const text = String(value || '').trim();
  const match =
    text.match(/^(\d{4})[-/.年](\d{1,2})月?$/) || null;
  if (!match) return '';
  const month = String(Number(match[2])).padStart(2, '0');
  if (Number(match[2]) < 1 || Number(match[2]) > 12) return '';
  return `${match[1]}-${month}`;
}

/** 日期判定：严格 / 只到年月（本子上就只写了年月）/ 我们多编了日子 */
function judgeDate(got, want, expectsNoDate) {
  const g = String(got || '').slice(0, 10);
  const w = String(want || '').trim();
  if (expectsNoDate) {
    return g
      ? `🔴 多写了日期（本子上没填注射日期，我们写了 ${g}）`
      : '对（本子上本来就没填）';
  }
  if (!w) return '没写答案';
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    return g === w ? '对' : `错（本子上是 ${w}，我们读成 ${g || '空'}）`;
  }
  const monthOnly = normalizeMonthOnly(w);
  if (monthOnly) {
    if (g.slice(0, 7) !== monthOnly) {
      return `错（本子上只有 ${monthOnly}，我们读成 ${g || '空'}）`;
    }
    return g.slice(8, 10) === '01'
      ? '对（只到年月）'
      : `⚠️ 编了日子（本子上只写 ${monthOnly}，我们补成 ${g}）`;
  }
  return `没写清楚（${w}）`;
}

/**
 * 给每条答案配一行识别结果（顺序无关）。
 *
 * 打分：日期完全对上 +4 / 只到年月对上 +2；名字归一化相等 +3 / 一方包含另一方 +2。
 * 贪心取最高分，取过的不再复用 ✓。
 */
function pairExpectedWithDrafts(expected, drafts) {
  const pairing = new Map();
  const used = new Set();
  const scored = [];
  expected.forEach((want, wantIndex) => {
    drafts.forEach((draft, draftIndex) => {
      let score = 0;
      const wantDate = String(want.date || '');
      const gotDate = String(draft.vaccinationDate || '').slice(0, 10);
      if (wantDate && gotDate) {
        const wantMonth = wantDate.length === 10 ? '' : normalizeMonthOnly(wantDate);
        if (wantDate === gotDate) score += 4;
        else if (wantMonth && gotDate.slice(0, 7) === wantMonth) score += 2;
      }
      const wantName = normalizeName(want.name);
      const gotName = normalizeName(draft.vaccineName);
      if (wantName && gotName) {
        if (wantName === gotName) score += 3;
        else if (wantName.includes(gotName) || gotName.includes(wantName)) score += 2;
      }
      scored.push({ wantIndex, draftIndex, score });
    });
  });
  scored.sort((a, b) => b.score - a.score);
  const doneWant = new Set();
  for (const item of scored) {
    if (item.score <= 0) continue;
    if (doneWant.has(item.wantIndex) || used.has(item.draftIndex)) continue;
    pairing.set(item.draftIndex, expected[item.wantIndex]);
    doneWant.add(item.wantIndex);
    used.add(item.draftIndex);
  }
  return pairing;
}

/** 名字判定：严格（归一化后相等）/ 宽松（一方包含另一方）/ 错 */
function judgeName(got, want) {
  const g = normalizeName(got);
  const w = normalizeName(want);
  if (!w) return '没写答案';
  if (g === w) return '对';
  /*
   * ⚠️ 三级判定（2026-10-09 实测校准）：
   * 原来把"读得更全"也判成错 ✗ —— 例如本子上只写「卫佳®伍」，
   * 模型读成「卫佳®伍 犬瘟热、腺病毒2型、副流感、细小病毒病四联活疫苗」，
   * 那是**更忠实**（把标签上的全名也抄了）✓，不是错 ✗。
   * 现在：读全了（包含答案）= 对 ✓；读漏了（被答案包含）= 部分对 ✓。
   */
  if (g && g.includes(w)) return '对（读全了）';
  if (g && w.includes(g)) return `部分对（读漏了：本子上「${want}」→ 我们「${got}」）`;
  /*
   * 词序不同不该判错（2026-10-09 老板第 1 条发现就是这类）：
   * 本子上「狂犬病灭活疫苗(G52株) 瑞贝康」，模型读成
   * 「瑞贝康 RABISIN 狂犬病灭活疫苗 (G52株)」—— 字都在 ✓，只是顺序换了 ✓。
   * 认产品靠的是词都在不在（我们的匹配本来就是按名字包含来的 ✓），不是顺序 ✓。
   */
  const gChars = [...new Set(g.split(''))].sort().join('');
  const wChars = [...new Set(w.split(''))].sort().join('');
  if (gChars === wChars) return '对（只是词序不同）';
  if (w && g && [...new Set(w.split(''))].every((ch) => g.includes(ch))) {
    return '对（读全了）';
  }
  return `错（本子上「${want}」→ 我们「${got || '空'}」）`;
}

/**
 * 在服务器上跑的时候，令牌**由脚本自己现取**（2026-10-09）。
 *
 * 为什么：一开始用 shell 把令牌传进环境变量，结果转义把令牌弄坏了 ✗
 * （报 "Cannot convert argument to a ByteString …" —— Authorization 头里混进了非 ASCII 字符）。
 * 脚本本来就在 backend 目录里跑，直接 require 那两样东西最稳 ✓。
 * 用 EVAL_MINT=1 打开这个模式。
 * ⚠️ 后缀必须 .cjs（backend/package.json 是 "type": "module"，且 CJS 里没有顶层 await ✗）。
 */
async function mintToken() {
  require('dotenv').config();
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    // ownerId 是非空外键，不能写 not: null ✗（Prisma 直接报错）——随便取一只就行 ✓
    const dog = await prisma.dog.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!dog?.ownerId) throw new Error('库里没有可用的狗（拿不到 ownerId）');
    return jwt.sign(
      { userId: dog.ownerId, customerId: dog.ownerId, role: 'CUSTOMER' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' },
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 加载真实产品库（2026-10-09 老板选 A 之后补的指标）。
 *
 * 为什么要它：我们真正在意的是"**认成的是不是同一支产品**" ✓ ——
 * 计划靠的是产品（成分→病种→哪一步）✓，不是字面 ✓。
 * 实测例子：本子上「瑞贝康」被读成「…RABISIN 瑞比信」✗ 字面不一样，
 * 但**产品认对了** ✓（瑞比信已登记成瑞贝康的别名 ✓）—— 这种不该算错 ✗。
 *
 * 脚本在服务器上跑时就在 backend 目录里，可以直接 import 编译产物用**同一份**匹配逻辑 ✓
 * （用不到就跳过这一项，其余指标照跑 ✓）。
 */
async function loadLibrary() {
  try {
    const mod = await import('./dist/src/domain/health/vaccine-products.js');
    return { findProductByText: mod.findProductByText };
  } catch (error) {
    console.log(`（跳过"产品认对没"这一项：加载产品库失败 ${String(error.message).slice(0, 60)}）\n`);
    return null;
  }
}

async function main() {
  if (!TOKEN && process.env.EVAL_MINT === '1') {
    TOKEN = await mintToken();
  }
  if (!TOKEN) {
    console.error('缺少 EVAL_JWT（评测用的一次性令牌）。用法：EVAL_JWT=<令牌> node backend/scripts/eval-vaccine-books.js');
    process.exit(1);
  }

  const labelsPath = path.join(DATA_DIR, 'labels.csv');
  const photosDir = path.join(DATA_DIR, 'photos');
  if (!fs.existsSync(labelsPath)) {
    console.error(`没找到 ${labelsPath} —— 先按 README 放照片和 labels.csv`);
    process.exit(1);
  }

  const labels = parseLabels(fs.readFileSync(labelsPath, 'utf8'));
  const library = await loadLibrary();
  const photos = fs.existsSync(photosDir)
    ? fs.readdirSync(photosDir).filter((name) => /\.(jpe?g|png|webp|heic|heif)$/i.test(name))
    : [];

  console.log(`评测集：${DATA_DIR}`);
  console.log(`照片 ${photos.length} 张 ｜ 标准答案 ${labels.length} 条\n`);
  if (photos.length === 0) {
    console.log('photos/ 里还没有照片 —— 放进去再跑 ✓');
    return;
  }

  if (DUMP_ONLY) {
    console.log('（草稿模式：只读不判分 —— 下面每一行都可以直接粘进 labels.csv ✓）\n');
    let totalRows = 0;
    const suspects = [];
    for (const file of photos) {
      let url = '';
      try {
        url = await uploadPhoto(path.join(photosDir, file), file);
        const data = await extract(url, file);
        const drafts = Array.isArray(data.drafts) ? data.drafts : [];
        totalRows += drafts.length;
        console.log(`# ── ${file} ──────────────────────────────`);
        drafts.forEach((draft) => {
          console.log(`${file},${String(draft.vaccineName || '').trim()},${String(draft.vaccinationDate || '').slice(0, 10)}`);
          const flags = [];
          if (draft.brandCheck?.conflict) {
            flags.push(`🏷️ 品牌对不上：文字「${draft.brandCheck.textBrand}」 vs ${draft.brandCheck.productBrand}`);
          }
          if (draft.productReview?.consistent === false) {
            flags.push(`⚠️ 复核读到「${draft.productReview.textOnBook}」`);
          }
          if (!String(draft.productName || '').trim()) flags.push('库里没有这支苗');
          if (flags.length) console.log(`#    ↳ ${flags.join(' ｜ ')}`);
          // 非狗的疫苗本：猫三联/杯状/泛白细胞减少 这些词只出现在猫苗上
          if (/猫|杯状|泛白细胞减少|feline|FCV|FPV/i.test(String(draft.vaccineName || ''))) {
            suspects.push(file);
          }
        });
        console.log('');
      } catch (error) {
        console.log(`# ${file} 读取失败：${error.message}\n`);
      } finally {
        if (url) await dropAttachment(url);
      }
    }
    const uniqueSuspects = Array.from(new Set(suspects));
    console.log('──── 小结 ────');
    console.log(`照片 ${photos.length} 张 ｜ 识别出 ${totalRows} 行`);
    console.log(
      uniqueSuspects.length
        ? `⚠️ 看起来**不是狗**的疫苗本 ${uniqueSuspects.length} 张：${uniqueSuspects.join('、')}`
        : '✓ 没看到猫/其他物种的疫苗本',
    );
    return;
  }

  const summary = {
    photos: 0, rows: 0,
    nameExact: 0, nameLoose: 0, nameWrong: 0,
    dateExact: 0, dateMonthOnly: 0, dateInvented: 0, dateWrong: 0, dateAdded: 0,
    matchedLibrary: 0, unmatchedLibrary: 0,
    productJudged: 0, productExact: 0, productWrong: 0,
    reviewAlarms: 0, brandAlarms: 0,
  };
  const details = [];

  for (const file of photos) {
    const expected = labels.filter((row) => row.file === file);
    process.stdout.write(`【${file}】`);
    let url = '';
    try {
      url = await uploadPhoto(path.join(photosDir, file), file);
      const data = await extract(url, file);
      const drafts = Array.isArray(data.drafts) ? data.drafts : [];

      /*
       * ⚠️ 答案**不要求顺序一致**（2026-10-09 老板问"怎么填"之后改的）：
       * 按"日期 + 名字"给每一条答案配一行识别结果 —— 填的人不必操心顺序 ✓
       * （原来按下标死配，本子上写串了顺序就会全判成错 ✗）。
       */
      const pairing = pairExpectedWithDrafts(expected, drafts);
      summary.photos += 1;
      console.log(` 识别 ${drafts.length} 行${expected.length ? `（答案 ${expected.length} 条）` : '（⚠️ 这张没有标准答案）'}`);

      drafts.forEach((draft, index) => {
        const want = pairing.get(index) || {};
        const nameJudge = judgeName(draft.vaccineName, want.name);
        const dateJudge = judgeDate(draft.vaccinationDate, want.date, want.expectsNoDate);
        const matched = String(draft.productName || '').trim();
        const reviewAlarm = draft.productReview && draft.productReview.consistent === false;
        const brandAlarm = draft.brandCheck && draft.brandCheck.conflict === true;

        summary.rows += 1;
        if (nameJudge.startsWith('对')) summary.nameExact += 1;
        else if (nameJudge.startsWith('部分对')) summary.nameLoose += 1;
        else if (want.name) summary.nameWrong += 1;
        if (dateJudge.startsWith('🔴 多写了日期')) summary.dateAdded += 1;
        else if (dateJudge === '对') summary.dateExact += 1;
        else if (dateJudge.startsWith('对（只到年月）')) summary.dateMonthOnly += 1;
        else if (dateJudge.startsWith('⚠️ 编了日子')) summary.dateInvented += 1;
        else if (want.date) summary.dateWrong += 1;
        if (matched) summary.matchedLibrary += 1; else summary.unmatchedLibrary += 1;

        // 产品认对没（标准答案的写法在我们库里对应哪一支 → 和我们入库的那支比）
        if (library && want.name) {
          const expected = String(library.findProductByText(want.name)?.name || '').trim();
          if (expected) {
            summary.productJudged += 1;
            if (expected === matched) summary.productExact += 1;
            else summary.productWrong += 1;
          }
        }
        if (reviewAlarm) summary.reviewAlarms += 1;
        if (brandAlarm) summary.brandAlarms += 1;

        console.log(
          `   ${String(index + 1).padStart(2)}. 名字 ${nameJudge} ｜ 日期 ${dateJudge}` +
          ` ｜ 入库产品 ${matched || '（没匹配上）'}` +
          (brandAlarm ? ` ｜ 🏷️ 品牌对不上（文字「${draft.brandCheck.textBrand}」 vs ${draft.brandCheck.productBrand}）` : '') +
          (reviewAlarm ? ` ｜ ⚠️ 复核读到「${draft.productReview.textOnBook}」` : ''),
        );
        details.push({ file, index: index + 1, nameJudge, dateJudge, matched, want, got: draft });
      });

      if (expected.length > 0 && drafts.length !== expected.length) {
        console.log(`   ⚠️ 行数对不上：答案 ${expected.length} 条，识别出 ${drafts.length} 行`);
      }
    } catch (error) {
      console.log(` 失败：${error.message}`);
    } finally {
      if (url) await dropAttachment(url);
    }
    console.log('');
  }

  const pct = (value, total) => (total > 0 ? `${Math.round((value / total) * 1000) / 10}%` : '—');
  console.log('──── 汇总 ────');
  console.log(`照片 ${summary.photos} 张 ｜ 行 ${summary.rows} 条`);
  console.log(`产品名：严格对 ${summary.nameExact}（${pct(summary.nameExact, summary.rows)}）｜ 部分对 ${summary.nameLoose} ｜ 错 ${summary.nameWrong}`);
  console.log(`日期：严格对 ${summary.dateExact}（${pct(summary.dateExact, summary.rows)}）｜ 只到年月 ${summary.dateMonthOnly} ｜ **编了日子 ${summary.dateInvented}** ｜ **多写了日期 ${summary.dateAdded}** ｜ 错 ${summary.dateWrong}`);
  console.log(`认出产品：落到产品库 ${summary.matchedLibrary}（${pct(summary.matchedLibrary, summary.rows)}）｜ 没匹配上 ${summary.unmatchedLibrary}`);
  console.log(
    `认得的产品：标准答案能对上库的 ${summary.productJudged} 行里，我们认对 ${summary.productExact}` +
    `（${pct(summary.productExact, summary.productJudged)}）｜ 认错 ${summary.productWrong}`,
  );
  console.log(`报警：复核 ${summary.reviewAlarms} 行 ｜ 品牌 ${summary.brandAlarms} 行`);

  const reportPath = path.join(DATA_DIR, 'last-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), summary, details }, null, 2));
  console.log(`\n明细已存：${reportPath}`);
}

main().catch((error) => {
  console.error('跑分脚本出错：', error);
  process.exit(1);
});
