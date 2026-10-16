#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * E6 · 疫苗板块第一条端到端自动化：录一条接种记录 → 免疫计划跟着变
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 它做什么（全部通过**微信开发者工具自带的自动化接口**，不新开项目窗口）：
 *
 *   ① 读当前模拟器状态（是否登录、连的是哪个后端）
 *   ② 打开健康管理页 → 点「疫苗」书签
 *   ③ 快照 A：免疫计划 + 接种记录（走小程序**自己的** api 层：api/vaccines.js）
 *   ④ 用**真点击**录一条接种记录：
 *        底部「记一条」→ 输入「狂犬」→ 勾「狂犬病」（名字不在产品库里，
 *        按需求 R10 必须勾病种）→ 点「保存」
 *   ⑤ 快照 B：断言 记录 +1、免疫计划**确实变了**（狂犬那一行 首针 → 每年一次）
 *   ⑥ 清场：把**这一次新加的那条**记录删掉（不碰任何既有记录）
 *   ⑦ 快照 C：断言与快照 A **逐字段完全一致**（生产数据不留痕）
 *
 * ⚠️ 三条硬约束（脚本自己守着）：
 *   · **只写测试档案**：页面上显示的狗名必须以「测」开头，否则直接退出（绝不碰真狗）
 *   · **只删自己写的**：删除按「快照 B 新增的 id」删，不靠名字猜
 *   · **不改 storage**：全程不写 `api_base_url`（它的空值 = "用默认"的意思）
 *
 * 用法：
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs              # 跑完整条（写一条 + 删掉）
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --dry-run    # 只读：只快照 + 打印，不写不删
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --keep       # 写完**不删**（留给人工看）
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --project /abs/path/to/miniapp
 *
 * 前置条件（缺一个都会明确报错，不会静默跑偏）：
 *   · 微信开发者工具开着，并且**已经登录**（自动化跑不了真实微信登录，要人点一次）
 *   · 项目窗口开着（本仓库默认 `miniapp/`，miniprogramRoot = dist/build/mp-weixin）
 *   · 模拟器里的小程序是**登录态**（storage 里有 token）
 *
 * 背景与实测记录见：docs/plans/2026-10-16-e6-vaccine-e2e-automation.md
 * ════════════════════════════════════════════════════════════════════════════
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

// ── 可调参数 ────────────────────────────────────────────────────────────────
const WECHATIDE = '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide'
const DEFAULT_PROJECT = '/Users/zhaochen/Documents/SevenKitchen/miniapp'
const HEALTH_PAGE = '/pages/dog-profile-health/index?from=home'
const PROD_API = 'https://api.sevenkitchen.cloud/api/v1'
/** 记的这条叫什么：写成家长会写的两个字（真实用法），不写产品全名 */
const VACCINE_NAME = '狂犬'
/** 名字在产品库里查不到时要勾的病种（需求 R10 的守门规则） */
const COMPONENT_LABEL = '狂犬病'
/** 只允许写以它开头的档案（测01~测49 是测试档案） */
const DOG_NAME_PREFIX = '测'
/** 这几个工具不吃 --project（传了会打一行"未知参数已忽略"的告警） */
const NO_PROJECT_TOOLS = new Set(['check_wechatide_status'])

// ── 命令行参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const DRY_RUN = flag('--dry-run')
const KEEP = flag('--keep')
const PROJECT = path.resolve(option('--project', DEFAULT_PROJECT))

// ── 小工具 ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let step = 0
const log = (msg) => console.log(msg)
const head = (msg) =>
  console.log(`\n── ${++step}. ${msg} ${'─'.repeat(Math.max(0, 58 - msg.length))}`)
const ok = (msg) => console.log(`   ✓ ${msg}`)
const warn = (msg) => console.log(`   ! ${msg}`)
class E6Error extends Error {}
const fail = (msg) => {
  throw new E6Error(msg)
}
const die = (msg) => {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

/**
 * 从工具输出里抠出那一个 JSON 对象。
 *
 * ⚠️ 不能"取第一个 { 后面的全部"：工具的告警行（例如"未知参数 --project 已忽略"）
 *    有时排在 JSON **后面**，尾巴会把 JSON.parse 弄崩（踩过一次）。
 *    所以按花括号配对切，并且跳过字符串里的括号与转义。
 */
function extractJson(text) {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 调一次开发者工具的自动化接口。
 * 输出形如：`[wechatide] skill-call: ...\n{ ...json... }`，取第一行 `{` 之后的部分解析。
 */
function callRaw(tool, flags = {}) {
  const args = ['-c', 'codex', tool]
  // 少数工具不吃 --project（传了它会打一行告警，不影响结果，但输出会变脏）
  if (!NO_PROJECT_TOOLS.has(tool)) args.push('--project', PROJECT)
  for (const [k, v] of Object.entries(flags)) {
    if (v === undefined || v === null) continue
    args.push(`--${k}`, String(v))
  }
  const res = spawnSync(WECHATIDE, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const out = `${res.stdout || ''}${res.stderr || ''}`
  const raw = extractJson(out)
  if (!raw) {
    fail(
      `${tool} 没有返回 JSON（开发者工具没开？项目窗口没开？）\n---- 原始输出 ----\n${out.slice(0, 800)}`,
    )
  }
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    fail(`${tool} 返回的不是合法 JSON：\n${out.slice(0, 800)}`)
  }
  if (json.ok === false) {
    fail(`${tool} 失败：${json.message || json.errorType || JSON.stringify(json).slice(0, 400)}`)
  }
  return json
}

/** 把 {success, result:{...}} 这种外壳剥掉，拿到真正的内容 */
function payload(json) {
  let r = json.result
  while (r && typeof r === 'object' && r.success === true && 'result' in r) r = r.result
  // automation_evaluate 比别的工具多包一层 { result: X }
  if (r && typeof r === 'object' && !Array.isArray(r) && 'result' in r && Object.keys(r).length === 1) {
    r = r.result
  }
  return r
}

const call = (tool, flags) => payload(callRaw(tool, flags))

/** 探针版：元素不存在/读不到时返回 null，而不是把整条流程打断 */
function tryCall(tool, flags) {
  try {
    return call(tool, flags)
  } catch {
    return null
  }
}

/** 在小程序运行时里跑一段函数（和小程序自己跑代码是同一个上下文） */
// ⚠️ 一定要 trim：fn-source 前面带换行时工具会报 `Unexpected token 'function'`（踩过一次）
const evaluate = (fnSource) =>
  call('automation_evaluate', { 'fn-source': String(fnSource).trim() })
const elementText = (selector) => call('automation_element_action', { action: 'text', selector })
const elementTextSafe = (selector) =>
  tryCall('automation_element_action', { action: 'text', selector })
const elementOffset = (selector) => call('automation_element_action', { action: 'offset', selector })
const tap = (selector, waitForSelector) =>
  call('automation_element_action', { action: 'tap', selector, 'wait-for-selector': waitForSelector })
const inputText = (selector, value) =>
  call('automation_element_action', { action: 'input', selector, value })
/** ⚠️ `<input>` 用 text 读到的是空的 —— 要读 value（踩过一次） */
const inputValue = (selector) =>
  tryCall('automation_element_action', { action: 'value', selector })
const navigate = (action, url) => call('automation_navigate', { action, url })
const scrollPageTo = (top) =>
  call('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': Math.max(0, Math.round(top)) })
function screenshot(file) {
  return tryCall('simulator_screenshot', { path: file })?.path || null
}

/** 轮询等待（页面数据是异步来的，不能靠 sleep 猜） */
async function waitFor(label, fn, { timeout = 20000, interval = 800 } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch (err) {
      last = `(${err?.message || err})`
    }
    await sleep(interval)
  }
  fail(`等了 ${timeout / 1000}s 也没等到：${label}（最后一次看到的是 ${JSON.stringify(last)?.slice(0, 200)}）`)
}

let VIEWPORT_HEIGHT = 753
/** 小程序页面坐标是"文档坐标"，点之前先把元素滚进视口（底部固定栏会盖住最后一段） */
async function scrollIntoView(selector) {
  const box = elementOffset(selector)
  await scrollPageTo(box.top - VIEWPORT_HEIGHT * 0.45)
  await sleep(400)
  return box
}

/** 快照：走小程序**自己的** api 层（= 手机上取数的那条路），不是脚本另写一套 HTTP */
const stateFn = (dogId) => `
function () {
  var vac = require('api/vaccines.js').vaccineApi
  var DOG = ${JSON.stringify(dogId)}
  return Promise.all([vac.plan(DOG), vac.records.list(DOG), vac.antibodyTests.list(DOG)]).then(function (r) {
    var p = (r[0] && r[0].data) ? r[0].data : (r[0] || {})
    var recs = r[1] || []
    var tests = r[2] || []
    var n = p.next || {}
    var cut = function (v) { return String(v || '').slice(0, 10) }
    return {
      birthday: cut(p.birthday),
      ageWeeks: p.ageWeeks,
      next: [n.kind || '', n.label || '', n.status || '', cut(n.windowStart), cut(n.windowEnd)].join('|'),
      plan: (p.plan || []).map(function (s) {
        return [s.kind || '', s.label || '', s.status || '', cut(s.windowStart), cut(s.windowEnd)].join('/')
      }).sort(),
      records: recs.map(function (x) {
        return { id: x.id, text: [x.vaccineName || '', cut(x.vaccinationDate), (x.kinds || []).join('+')].join(' ') }
      }).sort(function (a, b) { return a.text < b.text ? -1 : 1 }),
      tests: tests.map(function (t) { return t.id }).sort()
    }
  })
}
`

async function takeState(dogId) {
  const s = await evaluate(stateFn(dogId))
  return { ...s, recordIds: s.records.map((r) => r.id), recordTexts: s.records.map((r) => r.text) }
}

const dogListFn = `
function () {
  return Promise.resolve(require('api/dogs.js').dogApi.list()).then(function (res) {
    return (res.data || []).map(function (d) { return { id: d.id, name: d.name } })
  })
}`

// ── 主流程 ──────────────────────────────────────────────────────────────────
let writtenIds = []
let before = null
let dogId = null
let cleanedUp = '（没写过东西）'
let backendUsed = '(未知)'
let fatal = null

async function main() {
  log('E6 · 疫苗端到端自动化（微信开发者工具）')
  log(`  项目：${PROJECT}`)

  // ① 开发者工具登录态 ───────────────────────────────────────────────────────
  head('开发者工具登录态')
  const status = call('check_wechatide_status', { 'skill-version': '0.3.9' })
  if (status.loginExpired) fail('开发者工具登录态已过期 —— 请人在界面上重新扫码登录后再跑。')
  ok(`已登录：${status.loginUser?.nickName || status.loginUser?.openid || '(未知)'}`)

  // ② 运行时：页面 / 小程序登录态 / 连的是哪个后端 ───────────────────────────
  head('小程序运行时：登录态 / 后端地址')
  const runtime = call('automation_runtime_info', { action: 'currentPage' })
  ok(`当前页面：${runtime.currentPage?.path}`)
  VIEWPORT_HEIGHT =
    (await evaluate(`function () { return wx.getSystemInfoSync().windowHeight }`)) || VIEWPORT_HEIGHT
  const env = await evaluate(`
function () {
  var cfg = require('utils/config.js')
  return {
    baseUrl: cfg.getBaseUrl(),
    storage: wx.getStorageSync('api_base_url'),
    hasToken: !!wx.getStorageSync('token'),
    platform: (wx.getDeviceInfo() || {}).platform
  }
}`)
  backendUsed = env.baseUrl
  ok(`实际请求的后端：${env.baseUrl}`)
  ok(`api_base_url（storage）：${env.storage === '' ? "''（空 = 用默认）" : env.storage}`)
  if (!env.hasToken) {
    fail('模拟器里没有 token（未登录）—— 需要人在开发者工具里点一次「立即登录」后再跑。')
  }
  if (!String(env.baseUrl).includes('sevenkitchen.cloud')) {
    fail(
      `当前连的是 ${env.baseUrl}，不是生产后端。\n` +
        '  50 只「测XX」测试档案在生产库，本机库没有 → 这条 E2E 需要连生产。\n' +
        '  （本脚本不会替你改 storage：请先把项目切回生产构建，或人工确认后再跑。）',
    )
  }

  // ③ 打开健康管理页 → 疫苗书签 ─────────────────────────────────────────────
  head('打开 健康管理 → 疫苗书签')
  await navigate('redirectTo', HEALTH_PAGE)
  const dogName = String(
    await waitFor('健康管理页把当前狗狗的名字渲染出来', async () => {
      const t = await elementTextSafe('.hero-card__title')
      return typeof t === 'string' && t.trim() && !t.includes('请选择') ? t.trim() : ''
    }),
  )
  ok(`页面上显示的狗狗：${dogName}`)
  if (!dogName.startsWith(DOG_NAME_PREFIX)) {
    fail(
      `页面上是「${dogName}」，不是测试档案（名字要以「${DOG_NAME_PREFIX}」开头）。\n` +
        '  这条 E2E 会往这只狗身上写一条记录再删掉 —— 拒绝在真实用户的狗上跑。',
    )
  }
  const dogs = await evaluate(dogListFn)
  const dog = dogs.find((d) => d.name === dogName)
  if (!dog) fail(`在狗狗列表里找不到「${dogName}」，拿不到 dogId。`)
  dogId = dog.id
  ok(`dogId：${dogId}`)

  await tap('.health-tabs__item:nth-child(3)', '.health-tabs__item') // 第 3 个书签 = 疫苗
  await waitFor('疫苗书签里的「免疫计划」渲染出来', async () => {
    const t = await elementTextSafe('.vk-plan')
    return typeof t === 'string' && t.includes('免疫计划') ? t : ''
  })
  const activeTab = await elementText('.health-tabs__item--active')
  if (String(activeTab) !== '疫苗') fail(`书签没切到「疫苗」（现在是「${activeTab}」）`)
  ok('已切到「疫苗」书签')

  const planTextBefore = String(await elementText('.vk-plan'))
  const nextTextBefore = String(await elementText('.vk-next'))
  const today =
    (await evaluate(`function () { return require('utils/date.js').todayDateText() }`)) ||
    new Date().toISOString().slice(0, 10)

  // ④ 快照 A ────────────────────────────────────────────────────────────────
  head('快照 A（写之前）')
  before = await takeState(dogId)
  ok(`免疫计划 ${before.plan.length} 项，下一针：${before.next}`)
  ok(`接种记录 ${before.records.length} 条，抗体检测 ${before.tests.length} 份`)
  before.plan.forEach((p) => log(`     · ${p}`))

  if (DRY_RUN) {
    log('\n--dry-run：到此为止（没有写任何东西）。')
    log(`  页面上「免疫计划」现在写的是：\n     ${planTextBefore.replace(/\n/g, ' | ')}`)
    log(`  页面上「下一针」现在写的是：\n     ${nextTextBefore.replace(/\n/g, ' | ')}`)
    return
  }

  // ⑤ 真点击：底部「记一条」→ 名字 → 勾病种 → 保存 ─────────────────────────
  head(`录一条接种记录（真点击）：${VACCINE_NAME} / ${today}`)
  await tap('.sticky-bar__button--primary', '.sticky-bar__button--primary') // 疫苗页的「记一条」
  const heading = String(
    await waitFor('录入卡打开', async () => {
      const t = await elementTextSafe('.vk-editor__title')
      return typeof t === 'string' && t.trim() ? t : ''
    }),
  )
  ok(`录入卡已打开：${heading}`)

  await inputText('.vk-editor__input', VACCINE_NAME)
  await sleep(1200)
  ok(`已输入疫苗名：${await inputValue('.vk-editor__input')}`)
  if (String(await elementText('.vk-editor')).includes(VACCINE_NAME) === false) {
    warn(`录入卡里没看到「${VACCINE_NAME}」两个字，继续（下一步会按病种勾选兜住类别）`)
  }

  // 名字不在常见疫苗库里 → 页面会要求勾「含哪些疫苗」（需求 R10 的守门规则）
  let chipIndex = 0
  for (let n = 1; n <= 12; n += 1) {
    const label = await elementTextSafe(`.vk-editor__chip:nth-child(${n})`)
    if (typeof label !== 'string' || !label) break
    if (label === COMPONENT_LABEL) {
      chipIndex = n
      break
    }
  }
  if (!chipIndex) {
    fail(`录入卡里没找到「${COMPONENT_LABEL}」这个病种选项，不敢瞎勾 —— 中止（此时还没写任何东西）。`)
  }
  await scrollIntoView(`.vk-editor__chip:nth-child(${chipIndex})`)
  await tap(`.vk-editor__chip:nth-child(${chipIndex})`)
  await sleep(600)
  const chipClass = String(
    await call('automation_element_action', {
      action: 'attribute',
      selector: `.vk-editor__chip:nth-child(${chipIndex})`,
      name: 'class',
    }),
  )
  if (!chipClass.includes('--on')) fail(`点了「${COMPONENT_LABEL}」但没勾上（class 里没有 --on）`)
  ok(`已勾病种：${COMPONENT_LABEL}`)

  const editorText = String(await elementText('.vk-editor'))
  if (!editorText.includes(today)) warn(`录入卡里没看到今天的日期（${today}），日期那栏可能不是默认值`)
  else ok(`接种日期就是今天：${today}`)

  await scrollIntoView('.vk-editor__btn--primary')
  const shotPath = path.join('/tmp', `e6-vaccine-after-save-${Date.now()}.jpg`)
  await tap('.vk-editor__btn--primary')
  ok('已点「保存」')

  // ⑥ 快照 B + 断言 ─────────────────────────────────────────────────────────
  head('快照 B（写之后）：免疫计划有没有跟着变')
  await waitFor('保存后计划重画（录入卡收起）', async () => {
    const t = await elementTextSafe('.vk-editor__title')
    return !t || !String(t).trim()
  })
  const after = await takeState(dogId)
  const added = after.records.filter((r) => !before.recordIds.includes(r.id))
  writtenIds = added.map((r) => r.id)
  ok(`接种记录 ${before.records.length} → ${after.records.length} 条（新增 ${added.length} 条）`)
  added.forEach((r) => log(`     + ${r.text}（id=${r.id}）`))

  if (after.records.length !== before.records.length + 1) {
    warn(
      `记录条数不是 +1（${before.records.length} → ${after.records.length}）` +
        ' —— 可能有别人同时在写这只狗；清场仍按新增 id 精确删。',
    )
  }
  const planRemoved = before.plan.filter((p) => !after.plan.includes(p))
  const planAdded = after.plan.filter((p) => !before.plan.includes(p))
  if (planRemoved.length === 0 && planAdded.length === 0 && before.next === after.next) {
    fail('录了记录，但免疫计划**一点没变** —— 这条端到端没跑通。')
  }
  ok(`免疫计划变了 ${planRemoved.length + planAdded.length} 处：`)
  planRemoved.forEach((p) => log(`     - ${p}`))
  planAdded.forEach((p) => log(`     + ${p}`))
  if (before.next !== after.next) log(`     下一针：${before.next}  →  ${after.next}`)

  head('页面上那一段文字也跟着变了吗')
  const planTextAfter = String(await elementText('.vk-plan'))
  if (planTextAfter === planTextBefore) {
    warn('页面上「免疫计划」那段文字没变 ✗ —— 请人工看一眼（数据变了但没重画？）')
  } else {
    const beforeLines = planTextBefore.split('\n')
    const afterLines = planTextAfter.split('\n')
    const goneLines = beforeLines.filter((l) => l.trim() && !afterLines.includes(l))
    const newLines = afterLines.filter((l) => l.trim() && !beforeLines.includes(l))
    ok('页面上「免疫计划」重画了，具体这几行换了：')
    goneLines.slice(0, 6).forEach((l) => log(`     - ${l}`))
    newLines.slice(0, 6).forEach((l) => log(`     + ${l}`))
  }
  const shot = screenshot(shotPath)
  if (shot) ok(`写完之后模拟器截图：${shot}`)

  // ⑦ 清场 ──────────────────────────────────────────────────────────────────
  if (KEEP) {
    cleanedUp = `--keep：**没有删**。请自己删掉这条：${writtenIds.join(', ') || '(未记下 id)'}（${VACCINE_NAME} / ${today}）`
    warn(cleanedUp)
    return
  }
  head('清场：把这一次新加的那条删掉')
  cleanedUp = await cleanup(before.recordIds)

  // ⑧ 快照 C + 断言完全复原 ────────────────────────────────────────────────
  head('快照 C（清场之后）：和写之前是不是一模一样')
  const restored = await takeState(dogId)
  const same =
    restored.plan.join('|') === before.plan.join('|') &&
    restored.next === before.next &&
    restored.recordIds.slice().sort().join('|') === before.recordIds.slice().sort().join('|') &&
    restored.tests.join('|') === before.tests.join('|') &&
    restored.birthday === before.birthday
  ok(
    `接种记录 ${restored.records.length} 条 / 免疫计划 ${restored.plan.length} 项 / 下一针 ${restored.next}`,
  )
  if (same) {
    ok('与写之前完全一致 ✓（生产库没留下痕迹）')
  } else {
    warn('清场后与写之前**不完全一致**，请人工看一眼：')
    if (restored.next !== before.next) log(`     下一针：${before.next} → ${restored.next}`)
    before.plan.filter((p) => !restored.plan.includes(p)).forEach((p) => log(`     - ${p}`))
    restored.plan.filter((p) => !before.plan.includes(p)).forEach((p) => log(`     + ${p}`))
    before.recordTexts.filter((t) => !restored.recordTexts.includes(t)).forEach((t) => log(`     - 记录 ${t}`))
    restored.recordTexts.filter((t) => !before.recordTexts.includes(t)).forEach((t) => log(`     + 记录 ${t}`))
    process.exitCode = 2
  }
}

/** 只删「快照 B 新增的那些 id」；找不到就按 名字+日期+不在快照 A 里 兜底 */
async function cleanup(beforeIds) {
  const today = new Date().toISOString().slice(0, 10)
  const fn = `
function () {
  var vac = require('api/vaccines.js').vaccineApi
  var DOG = ${JSON.stringify(dogId)}
  var IDS = ${JSON.stringify(writtenIds)}
  var NAME = ${JSON.stringify(VACCINE_NAME)}
  var DATE = ${JSON.stringify(today)}
  var BEFORE = ${JSON.stringify(beforeIds)}
  return vac.records.list(DOG).then(function (recs) {
    var list = recs || []
    var targets = list.filter(function (r) { return IDS.indexOf(r.id) >= 0 })
    if (targets.length === 0) {
      targets = list.filter(function (r) {
        return String(r.vaccineName || '') === NAME &&
          String(r.vaccinationDate || '').slice(0, 10) === DATE &&
          BEFORE.indexOf(r.id) < 0
      })
    }
    if (targets.length === 0) return { deleted: [], left: list.length }
    return Promise.all(targets.map(function (t) { return vac.records.remove(DOG, t.id) })).then(function () {
      return {
        deleted: targets.map(function (t) {
          return [t.vaccineName, String(t.vaccinationDate || '').slice(0, 10), 'id=' + t.id].join(' ')
        }),
        left: list.length - targets.length
      }
    })
  })
}`
  const res = await evaluate(fn)
  if (!res || !res.deleted || res.deleted.length === 0) {
    warn(`没有删到东西 —— 请人工确认这条记录还在不在：${writtenIds.join(', ') || '(没记下 id)'}`)
    process.exitCode = 3
    return '⚠️ 没删掉（请人工确认）'
  }
  res.deleted.forEach((d) => ok(`已删除：${d}`))
  ok(`该狗接种记录剩 ${res.left} 条`)
  return res.deleted.join('；')
}

/** 出错时尽力清场：别把测试记录留在生产上 */
async function rescueCleanup() {
  if (DRY_RUN || KEEP || !before) return
  try {
    const dogs = await evaluate(dogListFn)
    const shown = String(await elementTextSafe('.hero-card__title') || '').trim()
    const dog = dogs.find((d) => d.name === shown) || (dogId ? { id: dogId } : null)
    if (dog) {
      console.error('   正在尽力清场…')
      cleanedUp = await cleanup(before.recordIds)
    }
  } catch (err) {
    console.error(`   清场也失败了：${err?.message || err}`)
    console.error(`   请人工删掉这条：${writtenIds.join(', ') || '(没记下 id)'}（${VACCINE_NAME}）`)
  }
}

main()
  .then(() => finish(null))
  .catch(async (err) => {
    console.error(`\n✗ 跑挂了：${err?.stack || err}`)
    await rescueCleanup()
    fatal = err
    finish(err)
  })

function finish(err) {
  console.log('\n════════════════════════════════════════════════════════════════')
  console.log('结果汇总')
  console.log('════════════════════════════════════════════════════════════════')
  console.log(
    `  跑的方式      ：${DRY_RUN ? '只看不写（--dry-run）' : KEEP ? '写了但保留（--keep）' : '写了并已删除'}`,
  )
  console.log(`  连的后端      ：${backendUsed}（脚本没有改过 storage）`)
  console.log(
    `  写进去的那条  ：${VACCINE_NAME} / ${new Date().toISOString().slice(0, 10)}` +
      `${writtenIds.length ? `（id=${writtenIds.join(',')}）` : '（这次没写）'}`,
  )
  console.log(`  删干净没有    ：${cleanedUp}`)
  console.log(`  结论          ：${err ? '✗ 没跑通（卡点见上面的报错）' : '✓ 跑通'}`)
  console.log('════════════════════════════════════════════════════════════════\n')
  if (err) process.exit(1)
}
