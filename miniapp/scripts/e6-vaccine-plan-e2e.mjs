#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * E6 · 疫苗板块端到端自动化（3 个用例，各自跑完必须**清干净并断言复原**）
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 三个用例（全部通过**微信开发者工具自带的自动化接口**，不新开项目窗口）：
 *
 *   ① `record`（2026-10-16 第一条，默认）：录一条接种记录 → 免疫计划跟着变
 *        底部「记一条」→ 输入「狂犬」→ 勾「狂犬病」→ 保存 → 断言记录 +1、计划变了
 *        → 按新增 id 删掉 → 断言与跑之前**逐字段一致**
 *
 *   ② `scan`（2026-10-17 加）：**上传疫苗本 → 识别 → 确认 → 保存**
 *        底部「上传疫苗本 / 报告」→（选择单选"疫苗本"）→ 走**真实的识别接口** →
 *        识别结果页出现 → 逐条「我已对照疫苗本核对」（需要核的行）→「核对好了，保存」
 *        → 断言记录 +N（N = 识别结果页上写的那几条）→ 按新增 id 删掉 → 断言复原
 *
 *   ③ `ignore`（2026-10-17 加）：**忽略 → 恢复**
 *        「查看详情」→「忽略这一针」→ 原因选**「这次先不打」**→ 确定
 *        → 断言这一项从计划里消失、进了"已忽略"→ 点「恢复」→ 断言它回来了、
 *        忽略数回到 0、计划与跑之前逐字段一致
 *
 * ⚠️ 四条硬约束（脚本自己守着）：
 *   · **只写测试档案**：页面上显示的狗名必须以「测」开头，否则直接退出（绝不碰真狗）
 *   · **只删自己写的**：删除按「快照 B 新增的 id」删，不靠名字猜
 *   · **不改 storage**：全程不写 `api_base_url`（它的空值 = "用默认"的意思）
 *   · **跑完必须复原**：出错也会尽力清场（删记录 / 撤决定 / 恢复 mock）
 *
 * ⚠️ `scan` 用例里三处**替身**（都是自动化够不到的地方，写清楚免得被误会成"造假"）：
 *   1. `wx.chooseImage` —— 相册是**操作系统**的文件选择框，自动化点不到。
 *      mock 成"选好了一张图"（用的是**生产库里已经存在的**那张疫苗本照片）。
 *   2. `wx.showActionSheet` —— 底部按钮点开的是**原生选择单**（疫苗本 / 抗体报告），
 *      同样不是 WXML、自动化点不到。mock 成"点了第 1 项：疫苗本"。
 *   3. `dogApi.uploadHealthAttachment` —— 换掉上传这一步，**直接复用那张照片在 COS 上
 *      已有的地址**。这样**不会往云上传任何新东西**（老板的要求），
 *      识别、确认、保存三步全都是真的。
 *   另外把 `dogApi.deleteHealthAttachment` 换成一个**只记录、不真删**的桩：
 *   识别失败时页面会"把这次传上去的图删掉"，而我们复用的是一个**别人正在用的**地址，
 *   真删会把 测49 那张疫苗本从云上删掉 ✗✗ —— 这是硬安全闸。
 *   跑完这些 mock/替身都会恢复，并复查那张原图**还在**。
 *
 * 用法：
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs                    # 用例①（写一条 + 删掉）
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --case scan        # 用例②（上传疫苗本）
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --case ignore      # 用例③（忽略 → 恢复）
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --case all         # 三个都跑
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --dry-run          # 只读：只快照 + 打印
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --keep             # （仅用例①）写完不删
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --image-url <COS 地址>   # 换一张已有照片
 *   node miniapp/scripts/e6-vaccine-plan-e2e.mjs --project /abs/path/to/miniapp
 *
 * 前置条件（缺一个都会明确报错，不会静默跑偏）：
 *   · 微信开发者工具开着，并且**已经登录**（自动化跑不了真实微信登录，要人点一次）
 *   · 项目窗口开着（本仓库默认 `miniapp/`，miniprogramRoot = dist/build/mp-weixin）
 *   · 模拟器里的小程序是**登录态**（storage 里有 token）
 *
 * 背景与实测记录见：
 *   · docs/plans/2026-10-16-e6-vaccine-e2e-automation.md（用例①）
 *   · docs/plans/2026-10-17-vaccine-ops-runbook.md（上线后怎么跑）
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
/** 忽略时选的原因（需求 R5）：这次先不打 */
const IGNORE_REASON_LABEL = '这次先不打'
/**
 * `scan` 用例里"改名"改成哪一支（见 caseScan 里那段注释）。
 * 选「卫佳伍」的理由：它就在这只狗的疫苗本上、也在它的既有记录里（别的日期），
 * 是**真实产品**，后端能判出类别 —— 换完这一条就和"已存在的记录"不再重复 ✓。
 */
const SCAN_RENAME_TO = '卫佳伍'
/** `scan` 用例里 mock 出来的"选好的那张照片"（本地假路径；上传那步有替身，不会真读它） */
const MOCK_PICKED_FILE = 'wxfile://tmp_e6_mock_vaccine_book.jpg'
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
/** 跑哪个用例：record（默认，保持老行为）/ scan / ignore / all */
const CASE = String(option('--case', 'record')).toLowerCase()
const IMAGE_URL_OVERRIDE = option('--image-url', null)
/**
 * `--mock-feature-on`：**只在疫苗开关接口拉不到时**用的测试开关。
 *
 * 背景（2026-10-17 实测）：生产后端还没有 `GET /health/vaccine-feature`
 * （那个接口是未提交改动）→ 小程序按 fail-safe 把「疫苗」书签整个藏起来 ✗。
 * 这时候这条 E2E 连疫苗页都进不去。这个开关**只拦那一个 URL**、其余请求原样放行，
 * 让测试能继续跑；它**不代表生产是好的** —— 打开时会大声警告。
 */
const MOCK_FEATURE_ON = flag('--mock-feature-on') || process.env.E6_MOCK_FEATURE_ON === '1'
const CASES = CASE === 'all' ? ['record', 'scan', 'ignore'] : [CASE]
if (!CASES.every((c) => ['record', 'scan', 'ignore'].includes(c))) {
  console.error(`✗ --case 只能是 record / scan / ignore / all（收到的是「${CASE}」）`)
  process.exit(2)
}

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

// ── wx API 的 mock（自动化够不到的地方用；跑完一定 restore）─────────────────
/**
 * 已经 mock 掉的方法名。⚠️ 只在**全部 restore 成功**后才清空 ——
 * 出错清场时要靠这份名单把它们一个个还原回去，别把模拟器留在"被 mock 过"的状态 ✗
 */
const mockedWxMethods = new Set()

function mockWx(method, result) {
  call('automation_wx_api', { action: 'mock', method, result: JSON.stringify(result) })
  mockedWxMethods.add(method)
  ok(`已 mock wx.${method}（自动化点不到它）`)
}

function restoreWx(method) {
  tryCall('automation_wx_api', { action: 'restore', method })
  mockedWxMethods.delete(method)
}

function restoreAllWx() {
  for (const method of [...mockedWxMethods]) restoreWx(method)
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
    var ig = (p.ignored && p.ignored.items) ? p.ignored.items : []
    return {
      birthday: cut(p.birthday),
      ageWeeks: p.ageWeeks,
      next: [n.kind || '', n.label || '', n.status || '', cut(n.windowStart), cut(n.windowEnd)].join('|'),
      nextKey: n.key || '',
      nextTitle: [n.kindLabel || '', n.label || ''].join(''),
      plan: (p.plan || []).map(function (s) {
        return [s.kind || '', s.label || '', s.status || '', cut(s.windowStart), cut(s.windowEnd)].join('/')
      }).sort(),
      planKeys: (p.plan || []).map(function (s) { return s.key || '' }).sort(),
      ignored: ig.map(function (i) {
        return [i.key || '', i.kindLabel || '', i.label || '', i.reason || ''].join('/')
      }).sort(),
      ignoredCount: (p.ignored && p.ignored.count) || 0,
      records: recs.map(function (x) {
        return { id: x.id, text: [x.vaccineName || '', cut(x.vaccinationDate), (x.kinds || []).join('+')].join(' ') }
      }).sort(function (a, b) { return a.text < b.text ? -1 : 1 }),
      recordAttachments: recs.map(function (x) {
        return { id: x.id, urls: Array.isArray(x.attachments) ? x.attachments : [] }
      }),
      recordNameDates: recs.map(function (x) {
        return [String(x.vaccineName || ''), cut(x.vaccinationDate)].join(' ')
      }),
      tests: tests.map(function (t) { return t.id }).sort()
    }
  })
}
`

async function takeState(dogId) {
  const s = await evaluate(stateFn(dogId))
  return {
    ...s,
    recordIds: s.records.map((r) => r.id),
    recordTexts: s.records.map((r) => r.text),
  }
}

/** 把一份快照里所有出现过的云上地址收起来（用来证明"没有新上传"） */
function knownAttachmentUrls(state) {
  return new Set((state.recordAttachments || []).flatMap((r) => r.urls || []))
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
/** `scan` 用例：这次识别出几条、写进去几条（给最后的汇总用） */
let scanSummary = null
/** `ignore` 用例：正在被忽略的那一步（出错时要把它撤回来）＋ 现在到底忽略上没有 */
let ignoreStepKey = null
let ignoreStepTitle = ''
let ignoreApplied = false

async function main() {
  log('E6 · 疫苗端到端自动化（微信开发者工具）')
  log(`  项目：${PROJECT}`)
  log(`  用例：${CASES.join(' → ')}${DRY_RUN ? '（只看不写）' : ''}`)
  if (KEEP && CASES.some((c) => c !== 'record')) {
    warn('--keep 只对用例①（record）有效；②③ 一律"跑完必须复原"，不受它影响')
  }

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
  if (MOCK_FEATURE_ON) {
    await installFeatureOnMock()
  }
  await navigate('redirectTo', HEALTH_PAGE)
  /**
   * ⚠️ 等的是"狗狗名字"，别把页面**加载中的占位标题**当成名字 ✗
   *    （2026-10-17 实测：刚 redirectTo 完，`.hero-card__title` 里先是「健康档案」，
   *     脚本会以为拿到名字了，接着报"这不是测试档案"——是个假失败）。
   */
  const PLACEHOLDER_TITLES = ['请选择', '健康档案', '正在读取', '加载中']
  const dogName = String(
    await waitFor('健康管理页把当前狗狗的名字渲染出来', async () => {
      const t = await elementTextSafe('.hero-card__title')
      if (typeof t !== 'string' || !t.trim()) return ''
      const text = t.trim()
      if (PLACEHOLDER_TITLES.some((p) => text.includes(p))) return ''
      return text
    }),
  )
  ok(`页面上显示的狗狗：${dogName}`)
  if (!dogName.startsWith(DOG_NAME_PREFIX)) {
    fail(
      `页面上是「${dogName}」，不是测试档案（名字要以「${DOG_NAME_PREFIX}」开头）。\n` +
        '  这条 E2E 会往这只狗身上写数据再删掉 —— 拒绝在真实用户的狗上跑。',
    )
  }
  const dogs = await evaluate(dogListFn)
  const dog = dogs.find((d) => d.name === dogName)
  if (!dog) fail(`在狗狗列表里找不到「${dogName}」，拿不到 dogId。`)
  dogId = dog.id
  ok(`dogId：${dogId}`)

  await tapVaccineTab()
  await waitFor('疫苗书签里的「免疫计划」渲染出来', async () => {
    const t = await elementTextSafe('.vk-plan')
    return typeof t === 'string' && t.includes('免疫计划') ? t : ''
  })
  const activeTab = await elementText('.health-tabs__item--active')
  if (String(activeTab) !== '疫苗') fail(`书签没切到「疫苗」（现在是「${activeTab}」）`)
  ok('已切到「疫苗」书签')

  // ④ 按用例跑（每个用例自己快照、自己断言、自己清场）──────────────────────
  for (const name of CASES) {
    if (name === 'record') await caseRecord()
    else if (name === 'scan') await caseScan()
    else if (name === 'ignore') await caseIgnore()
  }

  // ⑤ 收尾：替身一律还原（不管有没有用上）
  if (MOCK_FEATURE_ON) await restoreFeatureMock()
}

/**
 * 点「疫苗」书签。
 *
 * ⚠️ 不能写死 `:nth-child(3)`：疫苗书签是**按开关渲染的** ——
 *    开关拉不到时它会整个消失，那时第 3 个书签是「体重」✗，
 *    脚本会**默默点到别的书签**、然后在下一步报一句看不懂的"免疫计划没渲染出来"。
 *    2026-10-17 就是这么被坑了一次（生产后端还没有那个开关接口）。
 *    所以：按**文字**找，找不到就直说原因 ✓。
 */
async function tapVaccineTab() {
  for (let i = 1; i <= 5; i += 1) {
    const label = await elementTextSafe(`.health-tabs__item:nth-child(${i})`)
    if (typeof label !== 'string') continue
    if (label.trim() === '疫苗') {
      await tap(`.health-tabs__item:nth-child(${i})`, '.health-tabs__item')
      return i
    }
  }
  const seen = []
  for (let i = 1; i <= 5; i += 1) {
    const label = await elementTextSafe(`.health-tabs__item:nth-child(${i})`)
    if (typeof label === 'string' && label.trim()) seen.push(label.trim())
  }
  fail(
    '健康管理页上**根本没有「疫苗」书签** —— 页面上只有：' + seen.join(' / ') + '\n' +
      '  最可能的原因：后端 GET /health/vaccine-feature 拉不到，小程序按 fail-safe\n' +
      '  把整个疫苗板块藏了（见 miniapp/src/utils/vaccine-feature.ts）。\n' +
      '  自己确认一下：curl https://api.sevenkitchen.cloud/api/v1/health/vaccine-feature\n' +
      '  临时要跑测试可以加 --mock-feature-on（只拦这一个请求，其余原样放行）。',
  )
}

/**
 * 把识别结果页**第 1 条**的疫苗名改成 `name`（真在输入框里打字，走页面的 @input）。
 *
 * ⚠️ `<input>` 要用 `--action value` 读值，用 `--action text` 读到的是空 ✗（踩过一次）。
 *
 * @returns 改成功了吗（读回输入框里的字确认过）
 */
async function renameFirstRow(name) {
  const beforeName = String((await inputValue('.vk-scan__name'))?.value ?? (await inputValue('.vk-scan__name')) ?? '')
  ok(`第 1 条原来识别成：「${beforeName || '(读不到)'}」`)
  await inputText('.vk-scan__name', name)
  await sleep(800)
  const readBack = await inputValue('.vk-scan__name')
  const after = String(readBack?.value ?? readBack ?? '')
  if (!after.includes(name)) {
    warn(`输入之后输入框里是「${after}」（期望含「${name}」）—— 名字没改成功`)
    return false
  }
  ok(`页面上确认已改成：「${after}」`)
  return true
}

/**
 * 把疫苗开关改成"开着"——**只换小程序里那一个函数**，不碰网络层。
 *
 * 为什么不能用 `automation_wx_api --mock request`：
 *   实测（2026-10-17）mock `wx.request` 会把**所有**请求都截住 ——
 *   放行那一条转发给真 `request` 之后，返回的 `RequestTask` 会被 mock 层当成"响应"，
 *   于是狗狗列表那一批全部报 `[API] No response data` ✗✗，页面直接空掉。
 *   而 `utils/vaccine-feature.js` 里 `exports.fetchVaccineFeatureFlag = i` 是**普通赋值**、
 *   页面又是 `F.fetchVaccineFeatureFlag()` 动态取属性 → 换掉这一个函数既精准又可还原 ✓。
 */
async function installFeatureOnMock() {
  const res = await evaluate(`
function () {
  var mod = require('utils/vaccine-feature.js')
  var g = (typeof globalThis !== 'undefined') ? globalThis : this
  if (!g.__e6featureOriginal) g.__e6featureOriginal = mod.fetchVaccineFeatureFlag
  mod.fetchVaccineFeatureFlag = function () {
    return Promise.resolve({ enabled: true, notice: '' })
  }
  return { patched: mod.fetchVaccineFeatureFlag !== g.__e6featureOriginal }
}`)
  if (!res?.patched) fail('没能把疫苗开关改成「开着」（fetchVaccineFeatureFlag 换不掉）—— 中止。')
  warn(
    '⚠️ 已把疫苗开关的取值换成「开着」（--mock-feature-on）：只换了小程序里这一个函数，\n' +
      '     网络请求一个都没动。**生产上那个接口现在还是 404，家长看不到疫苗板块** ✗',
  )
}

/** 还原上面那个函数（跑完/出错都要调） */
async function restoreFeatureMock() {
  try {
    await evaluate(`
function () {
  var g = (typeof globalThis !== 'undefined') ? globalThis : this
  if (!g.__e6featureOriginal) return { restored: true }
  require('utils/vaccine-feature.js').fetchVaccineFeatureFlag = g.__e6featureOriginal
  delete g.__e6featureOriginal
  return { restored: true }
}`)
  } catch (err) {
    warn(`还原疫苗开关失败：${err?.message || err}`)
  }
}

// ══ 用例①：录一条接种记录 → 免疫计划跟着变 ═════════════════════════════════
async function caseRecord() {
  const planTextBefore = String(await elementText('.vk-plan'))
  const nextTextBefore = String(await elementText('.vk-next'))
  const today =
    (await evaluate(`function () { return require('utils/date.js').todayDateText() }`)) ||
    new Date().toISOString().slice(0, 10)

  // 快照 A ──────────────────────────────────────────────────────────────────
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

  // 真点击：底部「记一条」→ 名字 → 勾病种 → 保存 ───────────────────────────
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

  // 快照 B + 断言 ───────────────────────────────────────────────────────────
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

  // 清场 ────────────────────────────────────────────────────────────────────
  if (KEEP) {
    cleanedUp = `--keep：**没有删**。请自己删掉这条：${writtenIds.join(', ') || '(未记下 id)'}（${VACCINE_NAME} / ${today}）`
    warn(cleanedUp)
    return
  }
  head('清场：把这一次新加的那条删掉')
  cleanedUp = await cleanup(before.recordIds)

  // 快照 C + 断言完全复原 ───────────────────────────────────────────────────
  await assertRestored(before, '快照 C（清场之后）：和写之前是不是一模一样')
}

// ══ 用例②：上传疫苗本 → 识别 → 确认 → 保存 ═════════════════════════════════
async function caseScan() {
  head('用例② 上传疫苗本 → 识别 → 确认 → 保存')
  before = await takeState(dogId)
  ok(`接种记录 ${before.records.length} 条，抗体检测 ${before.tests.length} 份`)
  const knownUrls = knownAttachmentUrls(before)

  // 用哪张照片：默认拿这只狗记录上**已经存在**的那张原件（不新拍、不新传）
  let imageUrl = IMAGE_URL_OVERRIDE
  if (!imageUrl) {
    const withAttachment = (before.recordAttachments || []).find((r) => (r.urls || []).length > 0)
    imageUrl = withAttachment?.urls?.[0] || null
  }
  if (!imageUrl) {
    fail(
      '这只狗的记录上没有任何原件（attachments 为空），没有"已经存在的照片"可用。\n' +
        '  换一只带疫苗本照片的测试档案，或加 --image-url <COS 地址> 指定一张已经存在的图。',
    )
  }
  ok(`用生产库里**已经存在**的这张原件（不新上传）：${imageUrl}`)

  if (DRY_RUN) {
    log('\n--dry-run：只快照 + 打印，没有打开识别、也没有写任何东西。')
    return
  }

  // ── 装替身 / mock：自动化点不到相册和原生选择单 ─────────────────────────
  head('装替身 / mock（都是自动化够不到的地方）')
  const stubs = await installScanStubs(imageUrl)
  if (!stubs?.uploadPatched || !stubs?.deletePatched) {
    fail('替身没装上（upload / delete 有一个没换掉）—— 中止，此时还没动任何数据。')
  }
  ok('上传那一步 → 换成"复用这张已有地址"（**不会往云上传新东西**）')
  ok('"删掉这张图"那一步 → 换成"只记录、不真删"（保护 测49 那张原图，硬安全闸）')
  mockWx('showActionSheet', { tapIndex: 0, errMsg: 'showActionSheet:ok' })
  mockWx('chooseImage', { tempFilePaths: [MOCK_PICKED_FILE], errMsg: 'chooseImage:ok' })
  mockWx('getImageInfo', {
    width: 1234,
    height: 567,
    path: MOCK_PICKED_FILE,
    orientation: 'up',
    type: 'jpg',
    errMsg: 'getImageInfo:ok',
  })

  // ── 点底部「上传疫苗本 / 报告」→（选择单选疫苗本）────────────────────────
  head('点底部「上传疫苗本 / 报告」')
  const secondary = String(await elementText('.sticky-bar__button--secondary'))
  if (!secondary.includes('疫苗本')) {
    fail(`底部左键写的是「${secondary.trim()}」，不是"上传疫苗本" —— 页面结构变了？不敢瞎点。`)
  }
  await scrollIntoView('.sticky-bar__button--secondary')
  await tap('.sticky-bar__button--secondary', '.sticky-bar__button--secondary')
  ok(`已点「${secondary.trim()}」（选择单被 mock 成"选了第 1 项：疫苗本"）`)

  // ── 断言：识别结果页出现 ─────────────────────────────────────────────────
  head('断言：识别结果页出现（真的调了识别接口）')
  const scanTitle = String(
    await waitFor(
      '识别结果页出现',
      async () => {
        const t = await elementTextSafe('.vk-scan__title')
        return typeof t === 'string' && t.includes('识别结果') ? t.trim() : ''
      },
      { timeout: 120000, interval: 1500 },
    ),
  )
  ok(`识别结果页出现了：「${scanTitle}」`)
  const countText = String(await elementText('.vk-scan__count'))
  const rowCount = Number((countText.match(/\d+/) || [0])[0])
  if (!rowCount) fail(`识别结果页上没有条数（读到的是「${countText}」）—— 中止，此时还没写任何东西。`)
  ok(`识别出 ${rowCount} 条（页面上写着「${countText}」）`)
  const scanCardText = String(await elementText('.vk-scan'))
  log(`     识别结果页上的字：${scanCardText.replace(/\n/g, ' | ').slice(0, 500)}`)

  // 需要核对的行：点「我已对照疫苗本核对」（点一个少一个，所以循环点）
  let verifiedRows = 0
  for (let i = 0; i < 10; i += 1) {
    const act = await elementTextSafe('.vk-scan__act')
    if (typeof act !== 'string' || !act.trim()) break
    await scrollIntoView('.vk-scan__act')
    await tap('.vk-scan__act')
    verifiedRows += 1
    await sleep(300)
  }
  if (verifiedRows > 0) ok(`点了 ${verifiedRows} 条「我已对照疫苗本核对」`)
  else ok('这次识别出来的几条都不需要额外核对（没有"待核对"的行）')

  // ── 保存 ─────────────────────────────────────────────────────────────────
  head('点「核对好了，保存」')
  await scrollIntoView('.vk-scan__btn--primary')
  await tap('.vk-scan__btn--primary')
  ok('已点保存')
  await waitFor(
    '保存的请求跑完（按钮不再写"正在保存…"）',
    async () => {
      const t = String((await elementTextSafe('.vk-scan__btn--primary')) || '')
      return t.includes('正在保存') ? '' : t || '(按钮没了)'
    },
    { timeout: 30000 },
  ).catch(() => warn('等了 30s 保存按钮还写着"正在保存…" —— 继续往下看结果'))

  let after = await takeState(dogId)
  let added = after.records.filter((r) => !before.recordIds.includes(r.id))

  /**
   * ⚠️ 识别出来的这几条，生产库里**很可能已经有了**（同一只狗、同名同日期）——
   *    后端会按"重复"把它们拦掉（`HealthService.assertNotDuplicated`），
   *    于是"保存"看起来什么也没发生 ✗。这不是 bug，是**后端在防重复**。
   *
   * 第一次存进去 0 条时：把**第 1 条**的日期往后挪一天（走页面自己的日期选择器事件，
   * 和手指点日历是同一条路），再存一次 —— 这样"识别 → 确认 → 保存"这条链路
   * 才真的走完一遍；跑完照样删掉、断言复原 ✓
   */
  if (added.length === 0) {
    warn('这一次一条都没存进去 —— 多半是"生产库里已经有同名同日期的那几条"（后端按重复拦掉）')
    const rowText = String((await elementTextSafe('.vk-scan')) || '')
    if (rowText.includes('没存上') || rowText.includes('已经')) {
      log(`     页面上写着：${rowText.replace(/\n/g, ' | ').slice(0, 400)}`)
    }
    /**
     * 为什么是"改名"而不是"改日期"：
     *   日期是**原生日期选择器**（`<picker mode="date">`），自动化点不到它的弹层，
     *   `automation_element_action --action trigger` 也**打不进**原生 picker 的 change
     *   （2026-10-17 实测：事件发了，页面上的日期没变 ✗）。
     *   而名称是一个普通的 `<input>`，`--action input` 真能改 ✓ ——
     *   这也正是确认页存在的意义：家长**核对后可以改**再存。
     */
    head(`把第 1 条的名称改成「${SCAN_RENAME_TO}」，再存一次`)
    const renamed = await renameFirstRow(SCAN_RENAME_TO)
    if (!renamed) fail('名字没改成（input 没生效）—— 中止；此时还没写任何东西。')
    await scrollIntoView('.vk-scan__btn--primary')
    await tap('.vk-scan__btn--primary')
    ok('已再点一次保存')
    await sleep(3000)
    after = await takeState(dogId)
    added = after.records.filter((r) => !before.recordIds.includes(r.id))
  }

  // 卡片收起（还有没填全/没存上的会留在页面上 —— 那就把它们丢掉，别留着）
  const stillOpen = String((await elementTextSafe('.vk-scan__title')) || '').trim()
  if (stillOpen) {
    const leftText = String((await elementTextSafe('.vk-scan')) || '')
    warn('识别结果页还留着几条没存上的（重复的 / 缺名称日期的）—— 点「全部不要」丢掉，页面清空')
    const errorLines = leftText
      .split('\n')
      .filter((l) => l.includes('没存上') || l.includes('重复') || l.includes('已经'))
    errorLines.slice(0, 4).forEach((l) => log(`     · ${l}`))
    await tap('.vk-scan__btn--ghost')
  }

  // ── 快照 B + 断言：记录 +N ───────────────────────────────────────────────
  head('快照 B（保存之后）：记录 +N')
  writtenIds = added.map((r) => r.id)
  ok(`接种记录 ${before.records.length} → ${after.records.length} 条（新增 ${added.length} 条）`)
  added.forEach((r) => log(`     + ${r.text}（id=${r.id}）`))
  if (added.length < 1) fail('识别 → 确认 → 保存这条链**一条都没写进去** —— 没跑通。')
  ok(`识别出 ${rowCount} 条、写进去 ${added.length} 条${added.length === rowCount ? '（一致 ✓）' : '（不一致，见上面的提示）'}`)

  const addedUrls = (after.recordAttachments || [])
    .filter((r) => writtenIds.includes(r.id))
    .flatMap((r) => r.urls || [])
  const brandNewUrls = [...new Set(addedUrls)].filter((u) => !knownUrls.has(u))
  if (brandNewUrls.length > 0) {
    warn(`⚠️ 新记录上出现了 ${brandNewUrls.length} 个**新的**云上地址（说明有东西被传上去了）：`)
    brandNewUrls.forEach((u) => log(`     · ${u}`))
  } else {
    ok('新记录挂的还是原来那张原件的地址 —— 没有往云上新增任何东西 ✓')
  }
  scanSummary = { rowCount, saved: added.length }

  // ── 清场 + 复原 ──────────────────────────────────────────────────────────
  head('清场：把这一次识别写进去的那几条删掉')
  cleanedUp = await cleanup(before.recordIds, null)

  await assertRestored(before, '快照 C（清场之后）：和跑之前是不是一模一样')

  head('收尾：把替身和 mock 都还原，并确认那张原图还在')
  await restoreAndVerify(imageUrl)
}

// ══ 用例③：忽略 → 恢复 ═════════════════════════════════════════════════════
async function caseIgnore() {
  head('用例③ 忽略 → 恢复')
  before = await takeState(dogId)
  if (!before.nextKey) fail('这只狗现在没有"下一针"，没法测忽略 —— 换一只测试档案再跑。')
  ok(`当前下一针：${before.nextTitle}（key=${before.nextKey}）`)
  ok(`跑之前已忽略 ${before.ignoredCount} 项：${before.ignored.join(' ｜ ') || '（无）'}`)

  if (DRY_RUN) {
    log('\n--dry-run：只快照 + 打印，没有点忽略、也没有写任何东西。')
    return
  }

  // 打开详情 → 忽略这一针 ───────────────────────────────────────────────────
  head(`点「忽略这一针」：${before.nextTitle}`)
  // ⚠️ 注意 tap 的第二个参数是"**动作之前**要等到的选择器"，不是动作之后的结果 ✗
  //    （2026-10-17 踩过：写成 `.vk-next__detail` 会一直等一个"点了才会出现"的元素）
  await tap('.vk-next__toggle')
  await waitFor('详情展开（出现「忽略这一针」）', async () => {
    const t = await elementTextSafe('.vk-next__act--ghost')
    return typeof t === 'string' && t.includes('忽略') ? t : ''
  })
  await tap('.vk-next__act--ghost')
  await waitFor('忽略弹层出现（「这一针怎么办？」）', async () => {
    const t = await elementTextSafe('.vk-ignore__title')
    return typeof t === 'string' && t.trim() ? t : ''
  })
  const firstOption = String(await elementText('.vk-ignore__opt:nth-child(2)'))
  if (!firstOption.includes(IGNORE_REASON_LABEL)) {
    fail(`忽略弹层的第 1 个选项不是「${IGNORE_REASON_LABEL}」（读到的是「${firstOption}」）—— 不敢瞎点，中止。`)
  }
  ok(`忽略弹层已打开，第 1 个选项就是「${IGNORE_REASON_LABEL}」`)

  ignoreStepKey = before.nextKey
  ignoreStepTitle = before.nextTitle
  await tap('.vk-ignore__opt:nth-child(2)') // 选「这次先不打」（默认就是它，这里真点一下）
  await tap('.vk-ignore__btn--primary') // 确定
  ignoreApplied = true
  ok('已选「这次先不打」→ 点「确定」')

  // 断言：从计划里消失、进了"已忽略" ───────────────────────────────────────
  head('断言：这一项进了"已忽略"、下一针也换人了')
  /**
   * ⚠️ 计划行**不会**从 `.plan` 里消失 —— 它会留在原地、状态变成"已忽略" ✓
   *    （2026-10-17 实测：光看 planKeys 会以为"没生效"✗，真正变的是
   *      ① `ignored.items` 多了这一项；② `next` 不再指向它；③ 那一行的 status 变了）
   */
  const after = await waitFor(
    '计划刷新后这一项被标成"已忽略"',
    async () => {
      const s = await takeState(dogId)
      const inIgnored = (s.ignored || []).some((x) => String(x).split('/')[0] === before.nextKey)
      return inIgnored ? s : ''
    },
    { timeout: 25000 },
  )
  ok(`已忽略 ${after.ignoredCount} 项（跑之前 ${before.ignoredCount} 项）`)
  after.ignored.forEach((x) => log(`     · ${x}`))
  if (after.nextKey === before.nextKey) {
    fail('忽略了"下一针"这一项，但下一针还是它 —— 没生效？')
  }
  ok(`下一针换人了：${before.nextKey} → ${after.nextKey}`)
  const planChanged = after.plan.filter((p) => !before.plan.includes(p))
  const planGone = before.plan.filter((p) => !after.plan.includes(p))
  if (planChanged.length > 0 || planGone.length > 0) {
    ok('免疫计划里对应的那一行状态变了：')
    planGone.forEach((p) => log(`     - ${p}`))
    planChanged.forEach((p) => log(`     + ${p}`))
  } else {
    warn('免疫计划那几行看起来没变化 —— 请人工看一眼（已忽略的那一行应该标成"已忽略"）')
  }
  const toggleText = String((await elementTextSafe('.vk-next__ignored-toggle')) || '')
  if (toggleText.includes('查看已忽略的')) ok(`页面上出现了按钮：「${toggleText.trim()}」`)
  else warn('页面上没看到"查看已忽略的 N 项"那个按钮 —— 请人工看一眼')

  // 恢复 ───────────────────────────────────────────────────────────────────
  head('点「恢复」把它放回计划')
  await scrollIntoView('.vk-next__btn--ghost')
  await tap('.vk-next__btn--ghost')
  await waitFor('已忽略列表展开（出现「恢复」）', async () => {
    const t = await elementTextSafe('.vk-next__restore')
    return typeof t === 'string' && t.includes('恢复') ? t : ''
  })
  const ignoredListText = String(await elementText('.vk-next__ignored'))
  if (!ignoredListText.includes(before.nextTitle)) {
    fail(
      `展开的"已忽略"里没看到「${before.nextTitle}」—— 不敢乱点恢复。\n` +
        `  列表里写的是：${ignoredListText.replace(/\n/g, ' | ')}`,
    )
  }
  await tap('.vk-next__restore')
  ok('已点「恢复」')

  const restoredState = await waitFor(
    '它回到计划里、忽略数归零',
    async () => {
      const s = await takeState(dogId)
      const stillIgnored = (s.ignored || []).some((x) => String(x).split('/')[0] === before.nextKey)
      return !stillIgnored && s.ignoredCount === before.ignoredCount ? s : ''
    },
    { timeout: 25000 },
  )
  ignoreApplied = false
  ignoreStepKey = null
  ok(`「${before.nextTitle}」回到计划里了 ✓`)
  ok(`已忽略 ${restoredState.ignoredCount} 项（与跑之前一致：${before.ignoredCount}）`)

  await assertRestored(before, '快照 C（恢复之后）：和跑之前是不是一模一样')
}

/** 快照 C：断言一切回到跑之前（不一致就打印差异 + exitCode=2） */
async function assertRestored(beforeState, title) {
  head(title)
  const restored = await takeState(dogId)
  const same =
    restored.plan.join('|') === beforeState.plan.join('|') &&
    restored.planKeys.join('|') === beforeState.planKeys.join('|') &&
    restored.next === beforeState.next &&
    restored.nextKey === beforeState.nextKey &&
    restored.ignored.join('|') === beforeState.ignored.join('|') &&
    restored.ignoredCount === beforeState.ignoredCount &&
    restored.recordIds.slice().sort().join('|') === beforeState.recordIds.slice().sort().join('|') &&
    restored.tests.join('|') === beforeState.tests.join('|') &&
    restored.birthday === beforeState.birthday
  ok(
    `接种记录 ${restored.records.length} 条 / 免疫计划 ${restored.plan.length} 项 / 下一针 ${restored.next} / 已忽略 ${restored.ignoredCount} 项`,
  )
  if (same) {
    ok('与跑之前完全一致 ✓（生产库没留下痕迹）')
  } else {
    warn('清场后与跑之前**不完全一致**，请人工看一眼：')
    if (restored.next !== beforeState.next) log(`     下一针：${beforeState.next} → ${restored.next}`)
    if (restored.ignoredCount !== beforeState.ignoredCount) {
      log(`     已忽略：${beforeState.ignoredCount} → ${restored.ignoredCount}`)
    }
    beforeState.plan.filter((p) => !restored.plan.includes(p)).forEach((p) => log(`     - ${p}`))
    restored.plan.filter((p) => !beforeState.plan.includes(p)).forEach((p) => log(`     + ${p}`))
    beforeState.recordTexts
      .filter((t) => !restored.recordTexts.includes(t))
      .forEach((t) => log(`     - 记录 ${t}`))
    restored.recordTexts
      .filter((t) => !beforeState.recordTexts.includes(t))
      .forEach((t) => log(`     + 记录 ${t}`))
    process.exitCode = 2
  }
  return same
}

// ── scan 用例的替身（装在页面运行时里；跑完一定还原）───────────────────────
/**
 * 换掉两个 api 方法：
 *   · `uploadHealthAttachment` → 直接返回**已有的** COS 地址（不新上传）
 *   · `deleteHealthAttachment` → **只记录、不真删**
 *     （识别失败时页面会删"这次传上去的图"；我们复用的是别人正在用的地址，
 *      真删会把 测49 那张疫苗本从云上删掉 ✗✗）
 */
async function installScanStubs(imageUrl) {
  const fn = `
function () {
  var dogApi = require('api/dogs.js').dogApi
  var g = (typeof globalThis !== 'undefined') ? globalThis : this
  g.__e6stub = g.__e6stub || { calls: [], originals: {} }
  var s = g.__e6stub
  var URL = ${JSON.stringify(imageUrl)}
  if (!s.originals.upload) s.originals.upload = dogApi.uploadHealthAttachment
  if (!s.originals.del) s.originals.del = dogApi.deleteHealthAttachment
  dogApi.uploadHealthAttachment = function (type, filePath) {
    s.calls.push({ fn: 'uploadHealthAttachment', type: String(type), filePath: String(filePath) })
    return Promise.resolve({ url: URL, key: '__e6_reuse_existing__' })
  }
  dogApi.deleteHealthAttachment = function (type, key) {
    s.calls.push({ fn: 'deleteHealthAttachment', type: String(type), key: String(key) })
    return Promise.resolve({ blocked: true })
  }
  return {
    uploadPatched: dogApi.uploadHealthAttachment !== s.originals.upload,
    deletePatched: dogApi.deleteHealthAttachment !== s.originals.del,
    url: URL
  }
}`
  return evaluate(fn)
}

/** 还原上面那两个方法（返回它们这次被调用了几次 —— 有记录就说明替身真的生效过） */
async function restoreScanStubs() {
  const fn = `
function () {
  var dogApi = require('api/dogs.js').dogApi
  var g = (typeof globalThis !== 'undefined') ? globalThis : this
  var s = g.__e6stub
  if (!s) return { restored: true, calls: [] }
  if (s.originals.upload) dogApi.uploadHealthAttachment = s.originals.upload
  if (s.originals.del) dogApi.deleteHealthAttachment = s.originals.del
  var calls = s.calls || []
  var okNow = dogApi.uploadHealthAttachment === s.originals.upload &&
              dogApi.deleteHealthAttachment === s.originals.del
  delete g.__e6stub
  return { restored: okNow, calls: calls }
}`
  try {
    return await evaluate(fn)
  } catch (err) {
    warn(`还原替身失败：${err?.message || err}`)
    return null
  }
}

/** 那张原图还在不在（拿真实尺寸问一次；mock 已经还原，所以读到的是真值） */
async function checkImageAlive(url) {
  const fn = `
function () {
  return new Promise(function (resolve) {
    wx.getImageInfo({
      src: ${JSON.stringify(url)},
      success: function (r) { resolve({ ok: true, width: r.width, height: r.height }) },
      fail: function (e) { resolve({ ok: false, message: String((e && e.errMsg) || e) }) }
    })
  })
}`
  return evaluate(fn)
}

/** scan 用例收尾：还原 mock / 替身，并确认原图还在 */
async function restoreAndVerify(imageUrl) {
  restoreAllWx()
  ok('wx 的 mock 已全部还原（showActionSheet / chooseImage / getImageInfo）')
  const stub = await restoreScanStubs()
  if (stub?.restored) ok('dogApi 的两个替身已还原')
  else warn('dogApi 的替身没还原干净 —— 请人工在模拟器里刷新一次小程序')
  const uploadCalls = (stub?.calls || []).filter((c) => c.fn === 'uploadHealthAttachment')
  const deleteCalls = (stub?.calls || []).filter((c) => c.fn === 'deleteHealthAttachment')
  if (uploadCalls.length > 0) ok(`上传那步被替身接住 ${uploadCalls.length} 次（没有真上传）`)
  if (deleteCalls.length > 0) {
    warn(`页面请求"删掉这张图" ${deleteCalls.length} 次 —— 被安全闸挡下了（原图没动）✓`)
  }
  const alive = await checkImageAlive(imageUrl)
  if (alive?.ok) ok(`原图还在 ✓（${alive.width}×${alive.height}）：${imageUrl}`)
  else {
    warn(`⚠️ 原图读不到了（${alive?.message || '未知原因'}）—— 请人工去 COS 确认：${imageUrl}`)
    process.exitCode = 4
  }
}

/**
 * 只删「快照 B 新增的那些 id」。
 *
 * `fallback`：万一 id 没记下来，退一步按"名字 + 日期 + 不在快照 A 里"找 ——
 * 这条兜底只对**用例①**（自己写的那条叫狂犬）成立；
 * `scan` 用例传 `null`（识别出来的名字/日期是 AI 给的，猜不得），只认 id ✓。
 */
async function cleanup(beforeIds, fallback = { name: VACCINE_NAME, date: new Date().toISOString().slice(0, 10) }) {
  const fn = `
function () {
  var vac = require('api/vaccines.js').vaccineApi
  var DOG = ${JSON.stringify(dogId)}
  var IDS = ${JSON.stringify(writtenIds)}
  var FB = ${JSON.stringify(fallback)}
  var BEFORE = ${JSON.stringify(beforeIds)}
  return vac.records.list(DOG).then(function (recs) {
    var list = recs || []
    var targets = list.filter(function (r) { return IDS.indexOf(r.id) >= 0 })
    if (targets.length === 0 && FB) {
      targets = list.filter(function (r) {
        return String(r.vaccineName || '') === FB.name &&
          String(r.vaccinationDate || '').slice(0, 10) === FB.date &&
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

/**
 * 出错时尽力清场：别把测试数据留在生产上、也别把模拟器留在"被 mock 过"的状态。
 *
 * 三件事，缺一不可：
 *   ① 还原 wx 的 mock（showActionSheet / chooseImage / getImageInfo）
 *   ② 还原 dogApi 的替身（upload / delete）
 *   ③ 把写过的东西撤掉：记录按 id 删；忽略的那一项按 stepKey 撤回来
 */
async function rescueCleanup() {
  // ①② mock / 替身：不管哪一步挂的，都要还原
  try {
    restoreAllWx()
  } catch (err) {
    console.error(`   还原 wx mock 失败：${err?.message || err}`)
  }
  if (MOCK_FEATURE_ON) await restoreFeatureMock()
  try {
    await restoreScanStubs()
  } catch (err) {
    console.error(`   还原替身失败：${err?.message || err}`)
  }

  if (DRY_RUN || !before) return

  // ③-1 忽略的那一项：写进去了就撤回来（恢复 = 清掉这个决定）
  if (ignoreApplied && ignoreStepKey) {
    try {
      console.error(`   正在把「${ignoreStepTitle || ignoreStepKey}」的忽略撤回来…`)
      await evaluate(`
function () {
  return require('api/vaccines.js').vaccineApi
    .clearDecision(${JSON.stringify(dogId)}, ${JSON.stringify(ignoreStepKey)})
    .then(function () { return { cleared: true } })
}`)
      ignoreApplied = false
      console.error('   已撤回 ✓')
    } catch (err) {
      console.error(`   撤回失败：${err?.message || err}`)
      console.error(`   ⚠️ 请人工恢复这一步：dogId=${dogId} stepKey=${ignoreStepKey}`)
    }
  }

  // ③-2 记录：只有**单独跑用例①**时才有"名字+日期"兜底；
  //      跑 scan（识别写进去的）只认 id —— 名字是 AI 给的，猜不得 ✓
  if (writtenIds.length === 0) return
  if (KEEP && !CASES.includes('scan')) return
  try {
    const dogs = await evaluate(dogListFn)
    const shown = String((await elementTextSafe('.hero-card__title')) || '').trim()
    const dog = dogs.find((d) => d.name === shown) || (dogId ? { id: dogId } : null)
    if (dog) {
      console.error('   正在尽力清场（删掉这次写进去的记录）…')
      const onlyRecordCase = CASES.length === 1 && CASES[0] === 'record'
      cleanedUp = await cleanup(before.recordIds, onlyRecordCase ? undefined : null)
    }
  } catch (err) {
    console.error(`   清场也失败了：${err?.message || err}`)
    console.error(`   请人工删掉这几条：${writtenIds.join(', ') || '(没记下 id)'}`)
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
  console.log(`  跑的用例      ：${CASES.join(' → ')}`)
  console.log(
    `  跑的方式      ：${DRY_RUN ? '只看不写（--dry-run）' : KEEP ? '写了但保留（--keep）' : '写了并已删除'}`,
  )
  console.log(`  连的后端      ：${backendUsed}（脚本没有改过 storage）`)
  if (MOCK_FEATURE_ON) {
    console.log('  疫苗开关      ：⚠️ 这次用了 --mock-feature-on（替身；生产接口仍不可用）')
  }
  console.log(
    `  写进去的      ：${writtenIds.length} 条记录` +
      `${writtenIds.length ? `（id=${writtenIds.join(',')}）` : '（这次没写记录）'}` +
      `${scanSummary ? `；识别出 ${scanSummary.rowCount} 条、保存 ${scanSummary.saved} 条` : ''}`,
  )
  console.log(
    `  忽略→恢复     ：${CASES.includes('ignore') ? (ignoreApplied ? `⚠️ 还忽略着（${ignoreStepKey}）` : '已恢复') : '（这次没跑）'}`,
  )
  console.log(`  删干净没有    ：${cleanedUp}`)
  console.log(`  结论          ：${err ? '✗ 没跑通（卡点见上面的报错）' : '✓ 跑通'}`)
  console.log('════════════════════════════════════════════════════════════════\n')
  if (err) process.exit(1)
}
