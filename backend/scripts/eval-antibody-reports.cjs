#!/usr/bin/env node
/**
 * 抗体检测报告识别 · 跑分脚本（2026-10-19）
 *
 * 为什么要有它：老板问得对 —— "今天那两个严重错误（报告没写结论被填成合格），
 * 除了拿真机试，还有没有别的办法先发现？"
 * 有：**把真报告攒成评测集、每次改动前后各跑一遍**，让数字说话 ✓。
 * 靠"下次上传时老板碰巧撞上"来发现问题，等于没测 ✗。
 *
 * ⚠️ 后缀是 .cjs —— backend/package.json 是 "type": "module"，
 *    用 .js 会被当成 ESM 从而 require 报错 ✗（2026-10-09 实测，vaccine 版踩过）。
 *
 * 用法（仓库根目录）：
 *   EVAL_JWT=<令牌> node backend/scripts/eval-antibody-reports.cjs [--dir <评测集目录>]
 *   EVAL_JWT=<令牌> node backend/scripts/eval-antibody-reports.cjs --dump
 *     → **只生成答案草稿**（把每张照片识别出来的内容按 labels.csv 的格式打出来，
 *        连"可疑的地方"一起标注），老板对着报告改一改就能用 ✓
 *   node backend/scripts/eval-antibody-reports.cjs --guard
 *     → 🛡️ **兜底自检**：不调模型、不花钱，直接用编译产物里那道
 *        「报告没写结论不许填合格」的兜底函数喂确定的输入，验它还拦不拦得住 ✓
 *        （照片跑分量的是"这次模型表现如何"；模型如果自己就回了 UNKNOWN，
 *          那道兜底**一次都不会被触发**，等于没测到 —— 所以两个都要跑 ✓）
 *   服务器上跑：bash backend/scripts/eval-antibody-reports-remote.sh [--dump|--guard|--clean]
 *
 * 评测集目录结构（默认 `.eval-data/antibody-reports/`，已在 .gitignore 里 ✓）：
 *   photos/*.jpg|png|webp|heic      真实抗体检测报告照片
 *   labels.csv                      标准答案：文件名,检测日期,检的是哪一项,报告结论,数值,单位
 *
 * ⚠️ 它**只调生产的识别接口**（`POST /health/extract-report`），**不写任何抗体记录** ✓；
 *    每张照片上传后立刻删掉 ✓（不留云端垃圾 —— 2026-10-19 实测：
 *    vaccine 版用的是 `DELETE /health/attachments/<type>/<key>`，**这条路由不存在** ✗，
 *    删除请求 404 被 `.catch(() => {})` 吞掉，照片其实一直留在云上 ✗。
 *    本脚本改用真正存在的 `DELETE /health/attachments`（body 传 key ✓），
 *    并且删除失败会**大声报出来**，不静默 ✓）。
 *    照片全程留在本机 ✓ —— 不上传到我们这边（接口只收一个 URL ✓）。
 *
 * 打出来的数就是老板要看的（抗体版五个指标）：
 *   ① 检测日期读对没 —— 严格对 / 只到年月 / **编了日子** / 多写了日期 / 错 / 空
 *   ② 检的是哪一项读对没 —— CORE / RABIES / 读错 / 空
 *   ③ 🔴 **报告结论** —— 重点是"**报告没写结论时，有没有被误判成合格/不合格**"
 *        · 报告没写、我们老实填"未判读" = 对 ✓；填了合格/不合格 = **替他判了** ✗（退出码非 0）
 *        · 额外量一个数：模型自己填了结论、被**出口兜底**按住的张数
 *          （> 0 = 提示词没拦住、是代码救的 ✓ 说明那道兜底不能删）
 *   ④ 数值 / 单位有没有照抄（前端不展示，但取值错了说明模型在瞎猜）
 *   ⑤ 不是抗体报告的图 → 有没有老实判成 NOT_MEDICAL
 *   ⑥ 契约：一份报告**只出一条**草稿（出了多条 = 契约违规）
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
  : path.join(REPO_ROOT, '.eval-data/antibody-reports');

/** 出口兜底（结论必须来自报告）那句话的兜底文案 —— 认不出来时用它匹配 warnings ✓ */
const NO_VERDICT_WARNING_FALLBACK = '报告上没有写合格与否的结论';

/* ──────────────────────────── 标准答案（labels.csv） ──────────────────────────── */

/** 剥掉老板写在格子里的批注，例如「2025-04-13（报告日期）」→ 2025-04-13 */
function stripNotes(raw) {
  return String(raw || '').replace(/[（(][^）)]*[）)]/g, '').trim();
}
function readNotes(raw) {
  return (String(raw || '').match(/[（(][^）)]*[）)]/g) || []).join('');
}

/** 项目列归一：核心三项（CDV/CPV/CAV/ICH…）一律算 CORE */
function normalizeTargetAnswer(raw) {
  const text = stripNotes(raw);
  if (!text) return '';
  if (/^(CORE|核心|核心抗体|犬瘟|犬瘟热|细小|犬细小|腺病毒|犬腺病毒|传染性肝炎|CDV|CPV|CAV|ICH)$/i.test(text)) {
    return /狂犬|RABIES|RABV/i.test(text) ? 'RABIES' : 'CORE';
  }
  if (/(狂犬|RABIES|RABV)/i.test(text)) return 'RABIES';
  if (/(核心|犬瘟|细小|腺病毒|传染性肝炎|CDV|CPV|CAV|ICH)/i.test(text)) return 'CORE';
  return '';
}

/** 结论列归一：**报告上印的字** → 我们契约里的枚举 */
function normalizeVerdictAnswer(raw) {
  const text = stripNotes(raw);
  if (!text) return '';
  if (/^(没写|未写|没有写|没结论|无结论|未判读|不判读|UNKNOWN|N\/A|NA)$/i.test(text)) return 'UNKNOWN';
  // ⚠️ 先判"不合格"（"不合格"里含"合格"）—— 与后端 resolveAntibodyResult 同一条规矩
  if (/不合格|未达标|没达标|无保护力|无抗体|阴性|FAIL|NEGATIVE/i.test(text)) return 'FAIL';
  if (/合格|达标|有保护力|有抗体|阳性|PASS|POSITIVE/i.test(text)) return 'PASS';
  return '';
}

function parseLabels(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('文件名')) continue;
    const parts = trimmed.split(',').map((item) => item.trim().replace(/^"|"$/g, ''));
    if (!parts[0]) continue;
    const file = parts[0];
    const rawDate = parts[1] || '';
    const rawTarget = parts[2] || '';
    const rawVerdict = parts[3] || '';
    const rawValue = parts[4] || '';
    const rawUnit = parts[5] || '';
    const notesOf = (raw) => readNotes(raw);
    const skip = (raw) => ['?', '-', ''].includes(stripNotes(raw));

    /*
     * 格子里的批注写法（老板的习惯，vaccine 版实测）：
     *   「2025-04-13（检测时间）」→ 答案 2025-04-13
     *   「没写（只有数值 + 分级条）」→ 答案"没写" = 报告上确实没有结论 ✓
     *   「未填」/「没有填」→ 报告上这一栏是空的 → 我们输出任何值都算"多写了" ✗
     */
    const dateNote = notesOf(rawDate);
    // 报告上确实没写检测日期（批注里说明的）→ 我们输出任何日期都算"多写了" ✗
    // ⚠️ "看不清 / 不知道"不算"没写"：那是我自己没看清，不是报告没写 → 整格跳过判定 ✓
    const dateUnclear = /看不清|不知道|不确定/.test(stripNotes(rawDate) + dateNote);
    const dateMissing = !dateUnclear &&
      (/^(没写|未写|没填|没有填|无检测日期)$/.test(stripNotes(rawDate)) ||
        /未填|没有填|没填|没写/.test(dateNote));

    // `非抗体报告`：这张图本来就不是抗体报告 → 期望我们判成 NOT_MEDICAL
    const notMedical = /非抗体报告|不是抗体报告|NOT_MEDICAL|不是报告/.test(stripNotes(rawTarget));

    rows.push({
      file,
      date: dateMissing || dateUnclear || skip(rawDate) ? '' : stripNotes(rawDate),
      expectsNoDate: dateMissing,
      target: notMedical || skip(rawTarget) ? '' : normalizeTargetAnswer(rawTarget),
      rawTarget: stripNotes(rawTarget),
      notMedical,
      // 结论：'' = 没写答案（跳过）｜'UNKNOWN' = 报告上没写结论 ✓（关键的一类）
      verdict: skip(rawVerdict) ? '' : normalizeVerdictAnswer(rawVerdict),
      rawVerdict: stripNotes(rawVerdict),
      expectsNoVerdict: normalizeVerdictAnswer(rawVerdict) === 'UNKNOWN',
      value: skip(rawValue) ? '' : stripNotes(rawValue),
      unit: skip(rawUnit) ? '' : stripNotes(rawUnit),
    });
  }
  return rows;
}

/* ──────────────────────────── 判定 ──────────────────────────── */

/** 日期归一化：把各种"年月写法"认出来（与 vaccine 版同一套） */
function normalizeMonthOnly(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/.年](\d{1,2})月?$/) || null;
  if (!match) return '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${match[1]}-${String(month).padStart(2, '0')}`;
}

/** ① 检测日期：严格对 / 只到年月 / 编了日子 / 多写了日期 / 错 / 空 */
function judgeDate(got, want, expectsNoDate) {
  const g = String(got || '').slice(0, 10);
  if (expectsNoDate) {
    return g
      ? `🔴 多写了日期（报告上没写检测日期，我们写了 ${g}）`
      : '对（报告上本来就没写日期）';
  }
  if (!want) return '没写答案';
  if (/^\d{4}-\d{2}-\d{2}$/.test(want)) {
    if (g === want) return '对';
    return g ? `错（报告上是 ${want}，我们读成 ${g}）` : '空（没读出来）';
  }
  const monthOnly = normalizeMonthOnly(want);
  if (monthOnly) {
    if (!g) return '空（没读出来）';
    if (g.slice(0, 7) !== monthOnly) return `错（报告上只有 ${monthOnly}，我们读成 ${g}）`;
    return g.slice(8, 10) === '01' ? '对（只到年月）' : `⚠️ 编了日子（报告上只写 ${monthOnly}，我们补成 ${g}）`;
  }
  return `没写清楚（${want}）`;
}

/** ② 检的是哪一项 */
function judgeTarget(got, want) {
  const list = (Array.isArray(got) ? got : [got])
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean);
  if (!want) return '没写答案';
  if (list.length === 0) return '空（没读出来）';
  if (list.length === 1 && list[0] === want) return '对';
  if (list.includes(want)) return `对（多带了一项：${list.join('/')}）`;
  const zh = (item) => (item === 'CORE' ? '核心' : item === 'RABIES' ? '狂犬' : item);
  return `读错（应该是 ${zh(want)}，我们读成 ${list.map(zh).join('/')}）`;
}

/** 结论值归一（照抄后端那套别名，只看"模型回的这个值算哪一类"） */
function resolveResult(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'UNKNOWN';
  if (/^(PASS|POSITIVE|阳性|合格|达标|达到标准|有保护力|有抗体)$/i.test(raw)) return 'PASS';
  if (/^(FAIL|NEGATIVE|阴性|不合格|未达标|无保护力|无抗体)$/i.test(raw)) return 'FAIL';
  if (/不合格|未达标|没达标|无保护力|无抗体|阴性/.test(raw)) return 'FAIL';
  if (/合格|达标|有保护力|有抗体|阳性/.test(raw)) return 'PASS';
  return 'UNKNOWN';
}

/**
 * ③ 🔴 报告结论 —— 这个脚本存在的头号理由。
 * 判的不是"猜到没"，而是"**有没有替家长判**"：
 * 报告没写结论时，只有 UNKNOWN（或干脆没填）才算对 ✓。
 */
function judgeResult(got, want) {
  const g = resolveResult(got);
  const rawGot = String(got ?? '').trim();
  if (!want) return { label: '没写答案', kind: 'skip' };

  if (want === 'UNKNOWN') {
    if (!rawGot) return { label: '对（没填结论，按未判读处理）', kind: 'unknownOk' };
    if (g === 'UNKNOWN') return { label: '对（老实按"未判读"记）', kind: 'unknownOk' };
    if (g === 'PASS') return { label: '🔴 替他判了「合格」（报告上一个结论字都没有）', kind: 'inventedPass' };
    return { label: '🔴 替他判了「不合格」（报告上一个结论字都没有）', kind: 'inventedFail' };
  }

  if (!rawGot) return { label: '空（报告上写了结论，我们没读出来）', kind: 'empty' };
  if (g === want) return { label: `对（${want === 'PASS' ? '合格' : '不合格'}）`, kind: 'exact' };
  if (want === 'FAIL' && g === 'PASS') {
    return { label: '🔴 判反了（报告写的是不合格，我们判成合格 —— 最危险的一类）', kind: 'reversed' };
  }
  if (want === 'PASS' && g === 'FAIL') {
    return { label: '判反了（报告写的是合格，我们判成不合格）', kind: 'reversed' };
  }
  if (g === 'UNKNOWN') return { label: '没读出来（报告写了结论，我们给了"未判读"）', kind: 'missed' };
  return { label: '错', kind: 'missed' };
}

/** ④ 数值：照抄对不对（不比大小、不换算 —— 只判"是不是报告上那个数"） */
function normalizeNumber(value) {
  return String(value ?? '')
    .replace(/[，,\s]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}
function judgeValue(got, want) {
  const g = normalizeNumber(got);
  const w = normalizeNumber(want);
  if (!w) return '没写答案';
  if (!g) return '空（没读出来）';
  if (g === w) return '对';
  if (g.includes(w)) return '对（读全了）';
  if (w.includes(g)) return `部分对（只读了一半：${got}）`;
  return `错（报告上是 ${want}，我们读成 ${got}）`;
}

function judgeUnit(got, want) {
  const g = String(got ?? '').trim().toLowerCase();
  const w = String(want ?? '').trim().toLowerCase();
  if (!w) return '没写答案';
  if (!g) return '空（没读出来）';
  if (g === w) return '对';
  if (g.includes(w) || w.includes(g)) return '对（读全了）';
  return `错（报告上是 ${want}，我们读成 ${got}）`;
}

/* ──────────────────────────── 接口调用 ──────────────────────────── */

async function uploadPhoto(filePath, fileName) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), fileName);
  const res = await fetch(`${API_BASE}/health/upload-image?type=antibody`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.url) {
    throw new Error(`上传失败 HTTP ${res.status}：${String(body?.message || '').slice(0, 120)}`);
  }
  return { url: String(body.data.url), key: String(body.data.key || '') };
}

async function extract(url, fileName) {
  const res = await fetch(`${API_BASE}/health/extract-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: url, originalFilename: fileName, documentType: 'ANTIBODY_REPORT' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data) {
    throw new Error(`识别失败 HTTP ${res.status}：${String(body?.message || '').slice(0, 120)}`);
  }
  return body.data;
}

/**
 * 删掉云上的临时副本。
 * ⚠️ 真正存在的路由是 `DELETE /health/attachments`（key 放在 body 里）——
 *    `DELETE /health/attachments/<类型>/<key>` 那条**不存在**（vaccine 版就这么写的 ✗）。
 *    这里删除失败**不再静默**：返回结果由调用方打出来 ✓。
 */
async function dropAttachment(key) {
  if (!key) return { ok: false, reason: '拿不到 key' };
  try {
    const res = await fetch(`${API_BASE}/health/attachments`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status} ${String(body?.message || '')}` };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * 在服务器上跑的时候，令牌**由脚本自己现取**（vaccine 版 2026-10-09 的经验）。
 * 为什么：用 shell 把令牌传进环境变量，转义会把令牌弄坏 ✗
 * （报 "Cannot convert argument to a ByteString …"）。脚本就在 backend 目录里跑，
 * 直接 require 那几样东西最稳 ✓。用 EVAL_MINT=1 打开。
 * ⚠️ 后缀必须 .cjs（backend/package.json 是 "type": "module"，且 CJS 里没有顶层 await ✗）。
 */
async function mintToken() {
  require('dotenv').config();
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
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
 * 出口兜底那句话（"报告上没有写合格与否的结论…"）。
 * 拿编译产物里的**同一份常量**最准 ✓；拿不到就用兜底文案匹配，并大声说明。
 */
async function loadNoVerdictWarning() {
  try {
    const mod = await import('./dist/src/application/health/health-report-extraction.service.js');
    if (typeof mod.ANTIBODY_NO_VERDICT_WARNING === 'string') {
      return mod.ANTIBODY_NO_VERDICT_WARNING;
    }
  } catch {
    // 忽略：下面用兜底文案
  }
  return NO_VERDICT_WARNING_FALLBACK;
}

/** 模型自己填了结论、被出口兜底按住的迹象（warnings 里有那句话） */
function looksDowngraded(warnings, noVerdictWarning) {
  const text = (Array.isArray(warnings) ? warnings : []).join('\n');
  return text.includes(noVerdictWarning) || text.includes(NO_VERDICT_WARNING_FALLBACK);
}

/* ──────────────────────────── 主流程 ──────────────────────────── */

function printRowDraft(file, draft, expected) {
  const date = String(draft.testedAt || '').slice(0, 10);
  const targets = Array.isArray(draft.targets) ? draft.targets.join('/') : '';
  const verdict = resolveResult(draft.result);
  /*
   * 结论这一列给的是**建议值**，不是"照抄模型"：
   * 模型判了 PASS/FAIL 时，报告上到底有没有写结论，只有人能看见 ✓
   * → 打一个显眼的提醒，让老板对着报告核一遍那一个字 ✓
   */
  const suggestedVerdict = verdict === 'UNKNOWN' ? '没写' : '（请核报告上有没有印"合格/不合格"）';
  console.log(
    `${file},${date},${targets},${suggestedVerdict},${String(draft.value || '').trim()},${String(draft.unit || '').trim()}`,
  );
  const flags = [];
  flags.push(`模型给的结论：${verdict}`);
  if (verdict !== 'UNKNOWN' && !looksDowngraded(draft.__warnings, draft.__noVerdictWarning)) {
    flags.push('⚠️ 它是模型自己判的 —— 请对着报告看：**报告上到底有没有印"合格/不合格"**');
  }
  if (looksDowngraded(draft.__warnings, draft.__noVerdictWarning)) {
    flags.push('ℹ️ 模型大概填过合格/不合格，被出口兜底按成了"未判读"（提示词没拦住，是代码救的）');
  }
  if (draft.notes) flags.push(`备注：${draft.notes}`);
  console.log(`#    ↳ ${flags.join(' ｜ ')}`);
  if (expected) {
    console.log(`#    ↳ 标准答案：日期 ${expected.date || '—'} ｜ 项目 ${expected.rawTarget || '—'} ｜ 结论 ${expected.rawVerdict || '—'}`);
  }
}

/**
 * 🛡️ **兜底自检**（`--guard`）：不调模型、不花一分钱，只验代码里那道网还能不能拦住那个坑。
 *
 * 为什么必须有它（2026-10-19 跑完第一遍发现的）：
 * 照片跑分只能量"**这一次模型表现如何**" —— 真实报告上模型可能老老实实回了 UNKNOWN，
 * 于是那道出口兜底**一次都没被触发**（跑分里 `被兜底按住的 = 0`），
 * 这种情况下"兜底到底有没有用"根本**没被测到** ✗。
 * 而它防的恰恰是最危险的一条（报告没写结论却被填成合格）。
 * → 所以直接拿编译产物里的那个函数**喂确定的输入**，把该拦的、不该拦的都过一遍 ✓。
 */
async function guardSelfCheck() {
  let mod;
  try {
    mod = await import('./dist/src/application/health/health-report-extraction.service.js');
  } catch (error) {
    console.log('🔴 拿不到编译产物 —— 兜底自检必须在 backend 目录、且 dist 已构建时跑 ✗');
    console.log(`   ${String(error.message).slice(0, 120)}`);
    process.exitCode = 1;
    return;
  }
  const guard = mod.guardAntibodyResultByReportText;
  const warningText = mod.ANTIBODY_NO_VERDICT_WARNING;
  if (typeof guard !== 'function' || typeof warningText !== 'string') {
    console.log('🔴 编译产物里没有 guardAntibodyResultByReportText / ANTIBODY_NO_VERDICT_WARNING ✗');
    console.log('   （说明线上跑的那份代码里没有这道兜底 —— 这正是要报的事，别当成脚本坏了）');
    process.exitCode = 1;
    return;
  }

  /*
   * 每一条：模型回了什么（result / 原始草稿）+ 报告原文（OCR） → 期望的结论与"有没有降级"。
   * `knownGap` 是**已知盲区**：只打印、不算失败（它是设计的取舍，不是 bug）。
   */
  const cases = [
    {
      name: '模型填「合格」，但报告上一个结论字都没有（老板真机踩的那个坑）',
      input: { result: 'PASS', rawDraft: { result: 'PASS', value: '1234.47', unit: 'RFU' }, ocrText: '' },
      expect: { result: 'UNKNOWN', downgraded: true },
    },
    {
      name: '报告只有数值（数值不算结论）',
      input: { result: 'PASS', rawDraft: { result: 'PASS', value: '1234.47', unit: 'RFU' }, ocrText: 'CDV-Ab 1234.47 RFU CPV-Ab 1936.85 RFU' },
      expect: { result: 'UNKNOWN', downgraded: true },
    },
    {
      name: '模型回的是我们自己的枚举名「PASS」（不是报告上的字，不算证据）',
      input: { result: 'PASS', rawDraft: { result: 'PASS' }, ocrText: 'S1 S2 S3 S4 S5 S6' },
      expect: { result: 'UNKNOWN', downgraded: true },
    },
    {
      name: '报告真的写了「合格」→ 不能反过来把它降级 ✗',
      input: { result: 'PASS', rawDraft: { result: '合格' }, ocrText: '检测结果：合格' },
      expect: { result: 'PASS', downgraded: false },
    },
    {
      name: '报告写「有保护力」',
      input: { result: 'PASS', rawDraft: { result: '有保护力' }, ocrText: '抗体水平：有保护力' },
      expect: { result: 'PASS', downgraded: false },
    },
    {
      name: '报告写「不合格」→ 保持 FAIL（别降级，也别读成合格）',
      input: { result: 'FAIL', rawDraft: { result: '不合格' }, ocrText: '结论：不合格' },
      expect: { result: 'FAIL', downgraded: false },
    },
    {
      name: '模型本来就没判（UNKNOWN）→ 没什么要拦的',
      input: { result: 'UNKNOWN', rawDraft: { result: 'UNKNOWN' }, ocrText: '' },
      expect: { result: 'UNKNOWN', downgraded: false },
    },
    {
      name: '报告写「未达标」→ 保持 FAIL',
      input: { result: '未达标', rawDraft: { result: '未达标' }, ocrText: '判定：未达标' },
      expect: { result: 'FAIL', downgraded: false },
    },
    {
      name: '📌 已知盲区：报告写「阴性」，模型却回「阳性」—— 兜底只看"有没有结论字眼"、不看方向，所以拦不住 ✗',
      input: { result: 'PASS', rawDraft: { result: '阳性' }, ocrText: '抗体检测结果：阴性' },
      expect: { result: 'PASS', downgraded: false },
      knownGap: true,
    },
  ];

  console.log('──── 🛡️ 兜底自检（报告没写结论时，代码那道网还拦得住吗）────');
  console.log(`（用的就是线上那份编译产物里的 ${guard.name || 'guardAntibodyResultByReportText'} ✓，不调模型、不花钱）\n`);
  let pass = 0;
  let fail = 0;
  let gaps = 0;
  cases.forEach((item, index) => {
    let got;
    try {
      got = guard(item.input);
    } catch (error) {
      console.log(`🔴 ${index + 1}. ${item.name}\n     ↳ 调用报错：${error.message}`);
      fail += 1;
      return;
    }
    const ok = got.result === item.expect.result && got.downgraded === item.expect.downgraded;
    /*
     * ⚠️ 已知盲区**一律打 📌、不算通过**（哪怕它的表现和我预期的一模一样）：
     *    那一条的期望值写的就是"拦不住"——如果把它打成 ✓，只数绿勾的人
     *    会以为"方向错误也防住了" ✗，正好把最该看见的那句话藏起来。
     */
    if (item.knownGap) {
      gaps += 1;
      console.log(`📌 ${index + 1}. ${item.name}`);
      console.log(`     ↳ 实测：${got.result}${got.downgraded ? '（已降级）' : '（保持不动、也没有提示）'} —— 这一条**不防**，要靠"报告写了结论"的样本量出来`);
    } else if (ok) {
      pass += 1;
      console.log(`✓ ${index + 1}. ${item.name}`);
      console.log(`     ↳ ${got.result}${got.downgraded ? '（已降级）+ 给家长一句解释 ✓' : '（保持不动）'}`);
    } else {
      fail += 1;
      console.log(`🔴 ${index + 1}. ${item.name}`);
      console.log(`     ↳ 期望 ${item.expect.result}${item.expect.downgraded ? '+降级' : '+不降级'}，实际 ${got.result}${got.downgraded ? '+降级' : '+不降级'}`);
    }
  });
  console.log('');
  console.log(`共 ${cases.length} 条：通过 ${pass} ｜ 🔴 失败 ${fail} ｜ 📌 已知盲区 ${gaps}（盲区不计入通过）`);
  console.log(
    fail === 0
      ? '✓ 兜底可用：「报告没写结论 → 不许填合格」这一条，代码这一层拦得住 ✓'
      : '🔴 兜底失效了 —— 这是最要紧的一处，必须马上看（它防的就是"家长以为狗有保护力"）',
  );
  console.log('（提醒：这条自检只验代码那道网；"模型会不会自己判"要靠上面的照片跑分 ✓，两个一起看才算数）');
  if (fail > 0) process.exitCode = 1;
}

async function main() {
  // 兜底自检不调接口、不需要令牌、也不需要照片 —— 先拦一道 ✓
  if (process.argv.slice(2).includes('--guard')) {
    await guardSelfCheck();
    return;
  }

  if (!TOKEN && process.env.EVAL_MINT === '1') {
    TOKEN = await mintToken();
  }
  if (!TOKEN) {
    console.error('缺少 EVAL_JWT（评测用的一次性令牌）。用法：EVAL_JWT=<令牌> node backend/scripts/eval-antibody-reports.cjs');
    process.exit(1);
  }

  const labelsPath = path.join(DATA_DIR, 'labels.csv');
  const photosDir = path.join(DATA_DIR, 'photos');
  if (!fs.existsSync(labelsPath)) {
    console.error(`没找到 ${labelsPath} —— 先按 README 放照片和 labels.csv`);
    process.exit(1);
  }

  const labels = parseLabels(fs.readFileSync(labelsPath, 'utf8'));
  const noVerdictWarning = await loadNoVerdictWarning();
  const photos = fs.existsSync(photosDir)
    ? fs.readdirSync(photosDir).filter((name) => /\.(jpe?g|png|webp|heic|heif)$/i.test(name)).sort()
    : [];

  console.log(`评测集：${DATA_DIR}`);
  console.log(`照片 ${photos.length} 张 ｜ 标准答案 ${labels.length} 条 ｜ 接口 ${API_BASE}\n`);
  if (photos.length === 0) {
    console.log('photos/ 里还没有照片 —— 放进去再跑 ✓');
    return;
  }

  if (DUMP_ONLY) {
    console.log('（草稿模式：只读不判分 —— 下面每一行都可以直接粘进 labels.csv ✓）');
    console.log('（⚠️ "报告结论"那一列必须**你对着报告填**：报告上印了"合格"就写合格，没写就写"没写" ✗ 别按数值猜）\n');
    let totalRows = 0;
    const notMedicalFiles = [];
    for (const file of photos) {
      let uploaded = { url: '', key: '' };
      try {
        uploaded = await uploadPhoto(path.join(photosDir, file), file);
        const data = await extract(uploaded.url, file);
        const drafts = Array.isArray(data.drafts) ? data.drafts : [];
        totalRows += drafts.length;
        console.log(`# ── ${file} ──────────────────────────────`);
        console.log(`#    判成：${data.documentType} ｜ 草稿 ${drafts.length} 条`);
        if (data.documentType === 'NOT_MEDICAL') notMedicalFiles.push(file);
        if (drafts.length === 0) {
          console.log('#    （没读出草稿）');
        }
        drafts.forEach((draft) => {
          printRowDraft(file, { ...draft, __warnings: data.warnings, __noVerdictWarning: noVerdictWarning }, null);
        });
        for (const warning of Array.isArray(data.warnings) ? data.warnings : []) {
          console.log(`#    💬 ${warning}`);
        }
        console.log('');
      } catch (error) {
        console.log(`# ${file} 读取失败：${error.message}\n`);
      } finally {
        if (uploaded.key) {
          const dropped = await dropAttachment(uploaded.key);
          if (!dropped.ok) console.log(`# ⚠️ 云上副本没删掉（${file}）：${dropped.reason}\n`);
        }
      }
    }
    console.log('──── 小结 ────');
    console.log(`照片 ${photos.length} 张 ｜ 识别出 ${totalRows} 条草稿`);
    console.log(
      notMedicalFiles.length
        ? `判成"不是医疗资料"（NOT_MEDICAL）的 ${notMedicalFiles.length} 张：${notMedicalFiles.join('、')}`
        : '✓ 没有一张被判成"不是医疗资料"',
    );
    console.log('把上面的行按 labels.csv 的格式补上"报告结论"那一列，就能开始跑分了 ✓');
    return;
  }

  const summary = {
    photos: 0, photosWithAnswer: 0, drafts: 0, requestFailures: 0, dropFailures: 0,
    dateJudged: 0, dateExact: 0, dateMonthOnly: 0, dateInvented: 0, dateAdded: 0, dateWrong: 0, dateEmpty: 0,
    targetJudged: 0, targetExact: 0, targetWrong: 0, targetEmpty: 0,
    verdictMissing: 0, inventedPass: 0, inventedFail: 0, verdictKeptUnknown: 0,
    verdictWritten: 0, verdictExact: 0, verdictReversed: 0, verdictMissed: 0, verdictEmpty: 0,
    downgradedByGuard: 0, noVerdictExplained: 0,
    valueJudged: 0, valueExact: 0, valueLoose: 0, valuePartial: 0, valueWrong: 0, valueEmpty: 0,
    unitJudged: 0, unitExact: 0, unitWrong: 0, unitEmpty: 0,
    typeAntibody: 0, typeNotMedical: 0, typeOther: 0,
    nonMedicalSamples: 0, nonMedicalCorrect: 0, nonMedicalWrong: 0,
    contractOneRow: 0, contractMultiRow: 0, contractUnexpectedVerdict: 0,
    antibodyExpectedButNotMedical: 0,
  };
  const details = [];
  const suspects = [];

  for (const file of photos) {
    const expectedRows = labels.filter((row) => row.file === file);
    const want = expectedRows[0] || {};
    process.stdout.write(`【${file}】`);
    let uploaded = { url: '', key: '' };
    try {
      uploaded = await uploadPhoto(path.join(photosDir, file), file);
      const data = await extract(uploaded.url, file);
      const drafts = Array.isArray(data.drafts) ? data.drafts : [];
      const documentType = String(data.documentType || '');
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      const draft = drafts[0] || {};
      const downgraded = looksDowngraded(warnings, noVerdictWarning);
      /** 每一项判了什么，最后原样写进 last-report.json（方便前后对比、也方便老板复查） */
      const judges = {};

      summary.photos += 1;
      summary.drafts += drafts.length;
      if (expectedRows.length > 0) summary.photosWithAnswer += 1;
      if (documentType === 'ANTIBODY_REPORT') summary.typeAntibody += 1;
      else if (documentType === 'NOT_MEDICAL') summary.typeNotMedical += 1;
      else summary.typeOther += 1;

      // ⑥ 契约：一份报告只出一条
      if (drafts.length === 1) summary.contractOneRow += 1;
      else if (drafts.length > 1) summary.contractMultiRow += 1;
      const rawResult = String(draft.result ?? '').trim();
      if (rawResult && !['PASS', 'FAIL', 'UNKNOWN'].includes(rawResult)) summary.contractUnexpectedVerdict += 1;

      console.log(` 判成 ${documentType} ｜ 草稿 ${drafts.length} 条${expectedRows.length ? '' : '（⚠️ 这张没有标准答案，不计入任何比率）'}`);

      /*
       * 不是抗体报告的图：只量"有没有老实判成 NOT_MEDICAL" ✓
       * （判成抗体报告、还硬读出一条 = 最糟；其余类型也不对，但没那么危险）
       */
      if (want.notMedical) {
        summary.nonMedicalSamples += 1;
        const ok = documentType === 'NOT_MEDICAL' && drafts.length === 0;
        judges.notMedical = ok ? '对（判成 NOT_MEDICAL）' : `🔴 判成 ${documentType}（读出 ${drafts.length} 条）`;
        if (ok) summary.nonMedicalCorrect += 1;
        else summary.nonMedicalWrong += 1;
        console.log(ok
          ? '   ✓ 老实判成"不是宠物医疗资料"（NOT_MEDICAL），没硬读草稿'
          : `   🔴 这不是抗体报告，却判成 ${documentType} 并读出 ${drafts.length} 条草稿`);
      } else if (expectedRows.length > 0 && documentType === 'NOT_MEDICAL') {
        // 反过来也要报：真报告被判成"不是医疗资料"，家长会以为自己传错了 ✗
        summary.antibodyExpectedButNotMedical += 1;
        console.log('   🔴 这是抗体报告，却被判成"不是宠物医疗资料"（NOT_MEDICAL）—— 家长会以为传错了 ✗');
      }

      // ① 日期
      if (!want.notMedical && expectedRows.length > 0 && (want.date || want.expectsNoDate)) {
        const judged = judgeDate(draft.testedAt, want.date, want.expectsNoDate);
        judges.date = judged;
        summary.dateJudged += 1;
        if (judged === '对' || judged.startsWith('对（报告上本来就没写')) summary.dateExact += 1;
        else if (judged.startsWith('对（只到年月）')) summary.dateMonthOnly += 1;
        else if (judged.startsWith('⚠️ 编了日子')) summary.dateInvented += 1;
        else if (judged.startsWith('🔴 多写了日期')) summary.dateAdded += 1;
        else if (judged.startsWith('空')) summary.dateEmpty += 1;
        else summary.dateWrong += 1;
        console.log(`   📅 检测日期 ${judged}`);
      }

      // ② 检的是哪一项
      if (!want.notMedical && expectedRows.length > 0 && want.target) {
        const judged = judgeTarget(draft.targets, want.target);
        judges.target = judged;
        summary.targetJudged += 1;
        if (judged.startsWith('对')) summary.targetExact += 1;
        else if (judged.startsWith('空')) summary.targetEmpty += 1;
        else summary.targetWrong += 1;
        console.log(`   🎯 检的是哪一项 ${judged}`);
      }

      // ③ 🔴 报告结论
      if (!want.notMedical && expectedRows.length > 0 && want.verdict) {
        const judged = judgeResult(draft.result, want.verdict);
        judges.result = judged.label;
        if (want.verdict === 'UNKNOWN') {
          summary.verdictMissing += 1;
          if (judged.kind === 'inventedPass') summary.inventedPass += 1;
          else if (judged.kind === 'inventedFail') summary.inventedFail += 1;
          else summary.verdictKeptUnknown += 1;
          const explained = warnings.some((warning) => /没写|未判读|兽医/.test(String(warning)));
          if (explained) summary.noVerdictExplained += 1;
          if (downgraded) summary.downgradedByGuard += 1;
        } else {
          summary.verdictWritten += 1;
          if (judged.kind === 'exact') summary.verdictExact += 1;
          else if (judged.kind === 'reversed') summary.verdictReversed += 1;
          else if (judged.kind === 'empty') summary.verdictEmpty += 1;
          else summary.verdictMissed += 1;
        }
        console.log(`   🔴 报告结论 ${judged.label}`);
      }

      // ④ 数值 / 单位
      if (!want.notMedical && expectedRows.length > 0 && want.value) {
        const judged = judgeValue(draft.value, want.value);
        judges.value = judged;
        summary.valueJudged += 1;
        if (judged === '对') summary.valueExact += 1;
        else if (judged.startsWith('对（读全了）')) summary.valueLoose += 1;
        else if (judged.startsWith('部分对')) summary.valuePartial += 1;
        else if (judged.startsWith('空')) summary.valueEmpty += 1;
        else summary.valueWrong += 1;
        console.log(`   🔢 数值 ${judged}`);
      }
      if (!want.notMedical && expectedRows.length > 0 && want.unit) {
        const judged = judgeUnit(draft.unit, want.unit);
        judges.unit = judged;
        summary.unitJudged += 1;
        if (judged.startsWith('对')) summary.unitExact += 1;
        else if (judged.startsWith('空')) summary.unitEmpty += 1;
        else summary.unitWrong += 1;
        console.log(`   📏 单位 ${judged}`);
      }

      for (const warning of warnings) console.log(`   💬 ${warning}`);
      if (downgraded) {
        console.log('   🛡️ 出口兜底生效：模型大概填了合格/不合格，被代码按成"未判读" ✓（提示词没拦住）');
      }
      if (expectedRows.length > 0 && drafts.length !== 1) {
        console.log(`   ⚠️ 契约：一份报告应当只出 1 条草稿，实际 ${drafts.length} 条`);
      }
      // 看起来不像抗体报告的关键词（医生留给老板复查用）
      if (/过敏|血常规|生化|B超|X光|影像/i.test(String(draft.notes || ''))) suspects.push(file);

      details.push({ file, documentType, warnings, downgraded, judges, drafts, want });
    } catch (error) {
      summary.requestFailures += 1;
      console.log(` 失败：${error.message}`);
      details.push({ file, error: error.message, want });
    } finally {
      if (uploaded.key) {
        const dropped = await dropAttachment(uploaded.key);
        if (!dropped.ok) {
          summary.dropFailures += 1;
          console.log(`   ⚠️ 云上副本没删掉：${dropped.reason}`);
        }
      }
    }
    console.log('');
  }

  const pct = (value, total) => (total > 0 ? `${Math.round((value / total) * 1000) / 10}%` : '—');
  const inventedTotal = summary.inventedPass + summary.inventedFail;
  console.log('════════ 汇总（抗体检测报告） ════════');
  console.log(`照片 ${summary.photos} 张 ｜ 有标准答案 ${summary.photosWithAnswer} 张 ｜ 识别出 ${summary.drafts} 条草稿`);
  console.log('');
  console.log(`① 检测日期（判了 ${summary.dateJudged} 张）：严格对 ${summary.dateExact}（${pct(summary.dateExact, summary.dateJudged)}）｜ 只到年月 ${summary.dateMonthOnly} ｜ **编了日子 ${summary.dateInvented}** ｜ **多写了日期 ${summary.dateAdded}** ｜ 错 ${summary.dateWrong} ｜ 空 ${summary.dateEmpty}`);
  console.log(`② 检的是哪一项（判了 ${summary.targetJudged} 张）：对 ${summary.targetExact}（${pct(summary.targetExact, summary.targetJudged)}）｜ 读错 ${summary.targetWrong} ｜ 空 ${summary.targetEmpty}`);
  console.log('③ 🔴 报告结论 ——');
  console.log(`   报告**没写**结论的 ${summary.verdictMissing} 张：**替他判了的 ${inventedTotal} 张**（合格 ${summary.inventedPass} ｜ 不合格 ${summary.inventedFail}）｜ 老实按"未判读" ${summary.verdictKeptUnknown} 张`);
  console.log(`   报告**写了**结论的 ${summary.verdictWritten} 张：读对 ${summary.verdictExact}（${pct(summary.verdictExact, summary.verdictWritten)}）｜ **判反 ${summary.verdictReversed}** ｜ 没读出来/给了未判读 ${summary.verdictMissed} ｜ 空 ${summary.verdictEmpty}`);
  console.log(`   🛡️ 模型自己填了结论、被**出口兜底**按住的：${summary.downgradedByGuard} 张 ← 大于 0 说明提示词没拦住、是代码救的（那道兜底不能删）`);
  console.log(`   💬 报告没写结论时、给了家长一句解释的：${summary.noVerdictExplained} 张（信息项，前端展示用）`);
  console.log(`④ 数值（判了 ${summary.valueJudged} 张）：严格对 ${summary.valueExact}（${pct(summary.valueExact, summary.valueJudged)}）｜ 读全了 ${summary.valueLoose} ｜ 只读一半 ${summary.valuePartial} ｜ 读错 ${summary.valueWrong} ｜ 空 ${summary.valueEmpty}`);
  console.log(`   单位（判了 ${summary.unitJudged} 张）：对 ${summary.unitExact} ｜ 错 ${summary.unitWrong} ｜ 空 ${summary.unitEmpty}`);
  console.log(`⑤ 判成哪一类：抗体报告 ${summary.typeAntibody} ｜ NOT_MEDICAL ${summary.typeNotMedical} ｜ 其他 ${summary.typeOther}`);
  console.log(
    summary.nonMedicalSamples > 0
      ? `   非抗体报告的样本 ${summary.nonMedicalSamples} 张：老实判成 NOT_MEDICAL ${summary.nonMedicalCorrect}（${pct(summary.nonMedicalCorrect, summary.nonMedicalSamples)}）｜ 🔴 硬读成报告 ${summary.nonMedicalWrong}`
      : '   非抗体报告的样本 0 张 —— ⚠️ **这一类还没测**（README 里已列进"还需要老板补的样本"）',
  );
  if (summary.antibodyExpectedButNotMedical > 0) {
    console.log(`   🔴 反向错误：真抗体报告被判成 NOT_MEDICAL 的 ${summary.antibodyExpectedButNotMedical} 张`);
  }
  console.log(`⑥ 契约（一份报告只出 1 条）：符合 ${summary.contractOneRow} ｜ 🔴 出了多条 ${summary.contractMultiRow} ｜ 意外结论值 ${summary.contractUnexpectedVerdict}`);
  if (summary.requestFailures > 0) console.log(`⚠️ 请求失败 ${summary.requestFailures} 张（上面的数都不含这几张）`);
  if (summary.dropFailures > 0) console.log(`⚠️ 云上临时副本没删掉 ${summary.dropFailures} 张 —— 记得去清（照片不该留在云上）`);
  if (suspects.length > 0) console.log(`⚠️ 备注里出现别的报告字眼（可能传错图）：${Array.from(new Set(suspects)).join('、')}`);
  console.log('');
  console.log(
    inventedTotal > 0
      ? `🔴🔴 重点结论：报告明明没写结论，我们却替他判了 ${inventedTotal} 张 ✗ —— 这个数必须一直是 0`
      : '✓ 重点结论：报告没写结论时，一次都没有替他判（这个数必须一直是 0）',
  );
  if (summary.photos <= 2) {
    console.log('⚠️ 样本只有 2 张（还是同一份报告的两个清晰度），**上面的比率不具代表性** —— 只说明"这份报告读得怎么样"；README 里写了还需要 8~10 张不同医院的 ✓');
  }

  const reportPath = path.join(DATA_DIR, 'last-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), summary, details }, null, 2));
  console.log(`\n明细已存：${reportPath}`);

  // 最要紧的那条不达标就**退出码非 0** —— 不允许"看着正常的报告里悄悄藏着一个严重错误"
  if (inventedTotal > 0 || summary.verdictReversed > 0 || summary.requestFailures > 0) {
    console.log('（退出码 1：有"替他判了结论"或"判反了"或"请求失败"，请先看上面那几行）');
    process.exitCode = 1;
  }
}

/**
 * 只有直接 `node 本脚本` 时才跑；被 require 时只导出那几个纯函数 ✓ ——
 * 判定规则本身也要能测：否则"跑分脚本自己判错了"这种事没人能发现 ✗。
 */
if (require.main === module) {
  main().catch((error) => {
    console.error('跑分脚本出错：', error);
    process.exit(1);
  });
}

module.exports = {
  parseLabels,
  judgeDate,
  judgeTarget,
  judgeResult,
  judgeValue,
  judgeUnit,
  resolveResult,
};
