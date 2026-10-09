#!/usr/bin/env node
/**
 * 疫苗本识别 · 跑分脚本（2026-10-09）
 *
 * 为什么要有它：老板问得对 —— "现在生产数据很少，再跑一周有意义吗？"
 * 没有意义。正确的做法是**自己造样本、主动量**，而不是等数据 ✗。
 *
 * 用法（在仓库根目录）：
 *   EVAL_JWT=<令牌> node backend/scripts/eval-vaccine-books.js [--dir <评测集目录>]
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
const TOKEN = process.env.EVAL_JWT || '';
const REPO_ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const DATA_DIR = dirIndex >= 0 && args[dirIndex + 1]
  ? path.resolve(args[dirIndex + 1])
  : path.join(REPO_ROOT, '.eval-data/vaccine-books');

/** 产品名归一化：去商标符号、空格、大小写、标点 —— 只判"字是不是那些字" */
function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[®™©·．.。,，、'"“”‘’()（）\-—_/\s]/g, '');
}

function parseLabels(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('文件名')) continue;
    const parts = trimmed.split(',').map((item) => item.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3 || !parts[0]) continue;
    // `?` = 这一行看不清/说不清 → 跳过判定（不算错 ✓）
    const skipName = parts[1] === '?' || parts[1] === '' || parts[1] === '-';
    const skipDate = parts[2] === '?' || parts[2] === '' || parts[2] === '-';
    rows.push({
      file: parts[0],
      name: skipName ? '' : parts[1],
      date: skipDate ? '' : parts[2],
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

/** 日期判定：严格 / 只到年月（本子上就只写了年月）/ 我们多编了日子 */
function judgeDate(got, want) {
  const g = String(got || '').slice(0, 10);
  const w = String(want || '').trim();
  if (!w) return '没写答案';
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    return g === w ? '对' : `错（本子上是 ${w}，我们读成 ${g || '空'}）`;
  }
  if (/^\d{4}-\d{2}$/.test(w)) {
    if (g.slice(0, 7) !== w) return `错（本子上只有 ${w}，我们读成 ${g || '空'}）`;
    return g.slice(8, 10) === '01' ? '对（只到年月）' : `⚠️ 编了日子（本子上只写 ${w}，我们补成 ${g}）`;
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
        if (wantDate === gotDate) score += 4;
        else if (wantDate.length === 7 && gotDate.slice(0, 7) === wantDate) score += 2;
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
  if (g && (g.includes(w) || w.includes(g))) return `部分对（本子上「${want}」→ 我们「${got}」）`;
  return `错（本子上「${want}」→ 我们「${got || '空'}」）`;
}

async function main() {
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
  const photos = fs.existsSync(photosDir)
    ? fs.readdirSync(photosDir).filter((name) => /\.(jpe?g|png|webp|heic|heif)$/i.test(name))
    : [];

  console.log(`评测集：${DATA_DIR}`);
  console.log(`照片 ${photos.length} 张 ｜ 标准答案 ${labels.length} 条\n`);
  if (photos.length === 0) {
    console.log('photos/ 里还没有照片 —— 放进去再跑 ✓');
    return;
  }

  const summary = {
    photos: 0, rows: 0,
    nameExact: 0, nameLoose: 0, nameWrong: 0,
    dateExact: 0, dateMonthOnly: 0, dateInvented: 0, dateWrong: 0,
    matchedLibrary: 0, unmatchedLibrary: 0,
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
        const dateJudge = judgeDate(draft.vaccinationDate, want.date);
        const matched = String(draft.productName || '').trim();
        const reviewAlarm = draft.productReview && draft.productReview.consistent === false;
        const brandAlarm = draft.brandCheck && draft.brandCheck.conflict === true;

        summary.rows += 1;
        if (nameJudge === '对') summary.nameExact += 1;
        else if (nameJudge.startsWith('部分对')) summary.nameLoose += 1;
        else if (want.name) summary.nameWrong += 1;
        if (dateJudge === '对') summary.dateExact += 1;
        else if (dateJudge.startsWith('对（只到年月）')) summary.dateMonthOnly += 1;
        else if (dateJudge.startsWith('⚠️ 编了日子')) summary.dateInvented += 1;
        else if (want.date) summary.dateWrong += 1;
        if (matched) summary.matchedLibrary += 1; else summary.unmatchedLibrary += 1;
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
  console.log(`日期：严格对 ${summary.dateExact}（${pct(summary.dateExact, summary.rows)}）｜ 只到年月 ${summary.dateMonthOnly} ｜ **编了日子 ${summary.dateInvented}** ｜ 错 ${summary.dateWrong}`);
  console.log(`认出产品：落到产品库 ${summary.matchedLibrary}（${pct(summary.matchedLibrary, summary.rows)}）｜ 没匹配上 ${summary.unmatchedLibrary}`);
  console.log(`报警：复核 ${summary.reviewAlarms} 行 ｜ 品牌 ${summary.brandAlarms} 行`);

  const reportPath = path.join(DATA_DIR, 'last-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), summary, details }, null, 2));
  console.log(`\n明细已存：${reportPath}`);
}

main().catch((error) => {
  console.error('跑分脚本出错：', error);
  process.exit(1);
});
