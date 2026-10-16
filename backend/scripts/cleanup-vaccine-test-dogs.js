#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * 清掉生产库里的**疫苗测试档案**（测01 ~ 测49，共 50 只）—— 上线前 B2
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️⚠️ 这是**破坏性操作**，默认**只看不删**（dry-run）。
 *      真要删必须显式加 `--apply`，而且删之前会先把这些狗的全部相关数据
 *      导出成一份 JSON 存到 `backend/scripts/backup/`（不进 git）。
 *
 * 用法（在生产机上跑，见 docs/plans/2026-10-17-vaccine-ops-runbook.md）：
 *   cd /opt/sevenkitchen/SevenKitchen/backend
 *   node scripts/cleanup-vaccine-test-dogs.js             # ① 只看：要删什么、删多少
 *   node scripts/cleanup-vaccine-test-dogs.js --apply     # ② 真删（先备份，再删）
 *
 * 可选参数：
 *   --prefix <字>        只认名字以它开头的狗（默认「测」；**不要乱改**）
 *   --owner <id/手机号/昵称>  只处理挂在某个人名下的（默认不限）
 *   --backup-dir <目录>  备份写到哪（默认 backend/scripts/backup）
 *   --help
 *
 * 四道安全闸（每一道都会在真删之前再查一遍）：
 *   ① **只删名字以「测」开头的狗** —— 只要待删清单里出现一只不以它开头的，**立刻中止** ✗
 *   ② 真删那一刻，deleteMany 的 where 里**再带上** `name: { startsWith: '测' }`
 *      （就算上面的清单被谁改过，数据库这一层也只肯删「测」字头）
 *   ③ 删之前必须**备份成功**：写完文件会重新读一遍并 JSON.parse 校验，校验不过就不删
 *   ④ 三条删语句 + 删狗放在**同一个事务**里：删一半失败 = 全回滚，不留半截数据
 *
 * 删除顺序（照顾外键；见下方 DELETE_ORDER 的注释）：
 *   接种记录 → 抗体检测 → 忽略决定 → 狗（其余子表由数据库 CASCADE 跟着走）
 *
 * ⚠️ 这份脚本**不删云上的图片**（疫苗本原件）。删完记录之后那些原件就变成孤儿，
 *    由每天 03:07 的 `sevenkitchen-health-cleanup` 定时任务回收
 *    （它扫的就是 vaccine_record.attachments 这些字段）。
 *
 * ⚠️ **订单不会删**，但 `order.dog_id` 是 `ON DELETE SET NULL`：
 *    被删的狗身上如果挂过订单，那些订单会**丢掉"是哪只狗"的关联**（订单本身还在）。
 *    dry-run 会把笔数打出来；不为 0 时请人工确认后再 --apply。
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'))

/**
 * ⚠️ 安全闸的基准：**写死的「测」**，命令行改不了它。
 *
 * `--prefix` 只是"在安全集合里再挑一挑"用的（例如测试时），
 * 真正拦人的那一道（见下面第 ② 步）永远拿这个常量去比 ——
 * 这样即使有人 `--prefix ''`（=匹配所有狗）或写别的字，
 * 脚本也会在删之前**中止**，而不是把真狗删掉 ✗。
 */
const SAFE_PREFIX = '测'

// ── 命令行 ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(name)
const option = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(
    [
      '用法：node scripts/cleanup-vaccine-test-dogs.js [--apply] [--owner <id/手机号/昵称>]',
      '      不带 --apply = 只看不删（默认）；--apply = 先备份再真删',
    ].join('\n'),
  )
  process.exit(0)
}

const APPLY = hasFlag('--apply')
const PREFIX = option('--prefix', SAFE_PREFIX)
const OWNER = option('--owner', null)
const ONLY = option('--only', null)
const BACKUP_DIR = path.resolve(option('--backup-dir', path.join(__dirname, 'backup')))

/**
 * 显式按顺序删的三张表（其余子表交给数据库 CASCADE）。
 *
 * 为什么是这个顺序：
 *   · 先删**记录**（接种记录），再删**抗体检测**，最后删**决定** ——
 *     这是需求里写死的顺序（记录 → 抗体检测 → 决定 → 狗），
 *     祖先数据先走，后面的删起来不会撞外键 ✓。
 *   · 其实数据库那层是 CASCADE（删狗时会自己带走），
 *     但显式删一遍的意义在于：**每一步删了几条能打印出来对账** ✓。
 */
const DELETE_ORDER = [
  ['vaccineRecord', '接种记录'],
  ['antibodyTestRecord', '抗体检测'],
  ['vaccineDecision', '忽略/决定'],
]

/** 挂在狗身上、删狗时会**跟着 CASCADE 一起没**的表（备份要带走，dry-run 要报数） */
const CASCADE_TABLES = [
  ['weightRecord', '体重记录'],
  ['weightGoalPlan', '体重目标计划'],
  ['checkupRecord', '体检记录'],
  ['medicalRecord', '就诊记录'],
  ['allergyRecord', '过敏记录'],
  ['allergyReport', '过敏原报告'],
  ['allergyTrial', '过敏试验'],
  ['dogDietPreference', '饮食偏好'],
  ['dogDietPreferenceChange', '饮食偏好变更'],
  ['dogHealthShareToken', '健康分享链接'],
  ['customRecipeOrder', '定制食谱订单'],
]

/**
 * 有 `dog_id` 列、但**没有外键**的表：删狗不会动它们，删完会变成孤儿行。
 * （脚本**不删**这些 —— 它们在 B2 的范围之外；这里只报数 + 备份，让人知道有多少。）
 */
const ORPHAN_TABLES = [
  ['dogProfileEvent', '档案漏斗事件'],
  ['productFunnelEvent', '成品漏斗事件'],
  ['lifeStageAcknowledgement', '生命阶段确认'],
  // ⚠️ Prisma 把 `DIYSheet` 这个模型名转成 delegate 时是 `dIYSheet`（不是 diySheet）
  ['dIYSheet', '自制食谱单'],
  ['supplementOrder', '补剂订单'],
  ['orderItem', '订单明细'],
]

const prisma = new PrismaClient()

const n = (v) => String(v).padStart(6)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

async function main() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`疫苗测试档案清理（${APPLY ? '⚠️ 真删模式 --apply' : '只看不删（dry-run）'}）`)
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`数据库      ：${maskedDbUrl()}`)
  console.log(
    `筛选条件    ：名字以「${PREFIX}」开头` +
      `${ONLY ? ` 且含「${ONLY}」` : ''}${OWNER ? ` 且属于 ${OWNER}` : ''}` +
      `（**安全闸**：只肯删名字以「${SAFE_PREFIX}」开头的）`,
  )
  console.log(`备份目录    ：${BACKUP_DIR}`)
  console.log('')

  // ── ① 找出要处理的狗 ──────────────────────────────────────────────────────
  const where = { name: { startsWith: PREFIX } }
  if (ONLY) where.name = { startsWith: PREFIX, contains: ONLY }
  if (OWNER) {
    where.owner = {
      is: { OR: [{ id: OWNER }, { phone: OWNER }, { nickname: OWNER }] },
    }
  }
  const dogs = await prisma.dog.findMany({
    where,
    select: {
      id: true,
      name: true,
      createdAt: true,
      ownerId: true,
      owner: { select: { id: true, nickname: true, phone: true } },
    },
    orderBy: { name: 'asc' },
  })

  if (dogs.length === 0) {
    console.log('没有匹配的狗 —— 什么都不用做。')
    return 0
  }

  // ── ② 安全闸 ①：名字必须全部以「测」开头（比的是写死的 SAFE_PREFIX），
  //        混进一只真狗就**立刻中止** ✗ ─────────────────────────────────────
  const bad = dogs.filter((d) => !String(d.name || '').startsWith(SAFE_PREFIX))
  if (bad.length > 0) {
    console.error(
      `✗ 中止：待删清单里有 ${bad.length} 只**名字不以「${SAFE_PREFIX}」开头**的狗 ` +
        '—— 这是安全闸，绝不往下走（一个字节都不会删）。',
    )
    bad.forEach((d) => console.error(`   · ${d.name}（id=${d.id}）`))
    console.error('   如果确实要删，请人工核对后改 --prefix；不要为了省事把这行判断去掉。')
    return 2
  }

  // ── ③ 把每只狗的关联数据都读出来（dry-run 靠它报数，--apply 靠它备份）────
  // ⚠️ 先确认这台机器上生成的 Prisma Client 认识这些表再往下走 ——
  //    生产上的 client 是**部署时生成的那一份**，可能比仓库 schema 旧
  //    （2026-10-17 实测：`dIYSheet` 一开始写成 `diySheet`，直接
  //     "Cannot read properties of undefined (reading 'findMany')" 这种看不懂的错 ✗）。
  const tableNames = [
    ...DELETE_ORDER.map(([key]) => key),
    ...CASCADE_TABLES.map(([key]) => key),
    ...ORPHAN_TABLES.map(([key]) => key),
    'order',
  ]
  const missing = tableNames.filter((key) => !prisma[key])
  if (missing.length > 0) {
    console.error(
      `✗ 这台机器上的 Prisma Client 不认识这些表：${missing.join(', ')}\n` +
        '   多半是它比仓库里的 schema 旧 —— 请先在 backend 目录 `npx prisma generate` 再跑（只生成客户端，不碰数据库）。',
    )
    return 3
  }

  const ids = dogs.map((d) => d.id)
  const related = {}
  for (const [key] of [...DELETE_ORDER, ...CASCADE_TABLES]) {
    related[key] = await prisma[key].findMany({ where: { dogId: { in: ids } } })
  }
  // 没有外键的那几张表：只备份、不删
  const orphans = {}
  for (const [key] of ORPHAN_TABLES) {
    orphans[key] = await prisma[key].findMany({ where: { dogId: { in: ids } } })
  }
  // 订单：不删，但 dog_id 会被置空
  const orders = await prisma.order.findMany({
    where: { dogId: { in: ids } },
    select: { id: true, orderNo: true, dogId: true, status: true, createdAt: true },
  })

  const perDog = new Map()
  for (const id of ids) perDog.set(id, {})
  for (const [key] of [...DELETE_ORDER, ...CASCADE_TABLES]) {
    for (const row of related[key]) {
      const bucket = perDog.get(row.dogId)
      if (bucket) bucket[key] = (bucket[key] || 0) + 1
    }
  }

  // ── ④ 逐只打印"将要删什么" ────────────────────────────────────────────────
  console.log(`共 ${dogs.length} 只狗（名字全部以「${SAFE_PREFIX}」开头 ✓，安全闸已过）\n`)
  for (const dog of dogs) {
    const c = perDog.get(dog.id) || {}
    const extras = CASCADE_TABLES.filter(([key]) => c[key])
      .map(([key, label]) => `${label} ${c[key]}`)
      .join(' / ')
    console.log(
      ` · ${dog.name}\n` +
        `     接种记录 ${c.vaccineRecord || 0} 条 ｜ 抗体检测 ${c.antibodyTestRecord || 0} 份 ｜ ` +
        `忽略决定 ${c.vaccineDecision || 0} 条` +
        (extras ? `\n     还会一起没的：${extras}` : '') +
        `\n     主人：${dog.owner?.nickname || '(无名)'}${dog.owner?.phone ? ` / ${maskPhone(dog.owner.phone)}` : ''}` +
        `（id=${dog.ownerId}）｜ dogId=${dog.id}`,
    )
  }

  // ── ⑤ 汇总 ────────────────────────────────────────────────────────────────
  const sum = (key) => (related[key] || []).length
  const totalDeleted = DELETE_ORDER.reduce((acc, [key]) => acc + sum(key), 0)
  console.log('\n──────────── 汇总（将要动的数据）────────────')
  DELETE_ORDER.forEach(([key, label]) => console.log(`  ${label.padEnd(10, '　')} ${n(sum(key))} 条`))
  console.log('  ── 上面这些是显式按顺序删的；下面这些由数据库 CASCADE 跟着删 ──')
  CASCADE_TABLES.forEach(([key, label]) => {
    const count = sum(key)
    if (count > 0) console.log(`  ${label.padEnd(10, '　')} ${n(count)} 条`)
  })
  const cascadeTotal = CASCADE_TABLES.reduce((acc, [key]) => acc + sum(key), 0)
  console.log(`  合计：显式删 ${totalDeleted} 条 + CASCADE 跟着删 ${cascadeTotal} 条 + 狗 ${dogs.length} 只`)

  if (orders.length > 0) {
    console.log(
      `\n  ⚠️ 订单 ${orders.length} 笔挂在这些狗身上：订单**不会删**，但会丢掉"是哪只狗"的关联` +
        '（order.dog_id → NULL）。真删之前请人工确认这几笔能接受。',
    )
    orders.slice(0, 10).forEach((o) =>
      console.log(`     · 单号 ${o.orderNo || '(空)'} ｜ id=${o.id} ｜ 状态 ${o.status}`),
    )
  }

  const orphanTotal = ORPHAN_TABLES.reduce((acc, [key]) => acc + (orphans[key] || []).length, 0)
  if (orphanTotal > 0) {
    console.log('\n  ⚠️ 下面这些表有 dog_id 但**没有外键**，删狗不会动它们，会变成孤儿行（本脚本不删）：')
    ORPHAN_TABLES.forEach(([key, label]) => {
      const count = (orphans[key] || []).length
      if (count > 0) console.log(`     · ${label} ${count} 条`)
    })
  }

  // 附件（云上的图片）：脚本不删，交给每天的 orphan 清理任务
  const attachmentUrls = [...(related.vaccineRecord || []), ...(related.antibodyTestRecord || [])]
    .flatMap((row) => (Array.isArray(row.attachments) ? row.attachments : []))
    .filter(Boolean)
  if (attachmentUrls.length > 0) {
    const uniqueUrls = [...new Set(attachmentUrls)]
    console.log(
      `\n  ℹ️ 这些记录上挂着 ${uniqueUrls.length} 张云上原图（疫苗本/报告，被引用 ${attachmentUrls.length} 次）` +
        '—— 脚本**不删云上的图**，删完记录它们由每天 03:07 的 orphan 清理任务回收。',
    )
    uniqueUrls.slice(0, 6).forEach((u) => console.log(`     · ${u}`))
    if (uniqueUrls.length > 6) console.log(`     · …还有 ${uniqueUrls.length - 6} 张`)
  }

  // ── ⑥ dry-run 到此为止 ───────────────────────────────────────────────────
  const backupPayload = buildBackupPayload({ dogs, related, orphans, orders })
  const backupJson = JSON.stringify(backupPayload, null, 2)
  const backupBytes = Buffer.byteLength(backupJson, 'utf8')

  if (!APPLY) {
    console.log(`\n备份预估大小：${kb(backupBytes)}（--apply 时会真的写盘）`)
    console.log('\n这是 dry-run：**一个字节都没写、一条数据都没删** ✓')
    console.log('要真删请加 --apply（会先备份到上面那个目录，再删）。')
    return 0
  }

  // ── ⑦ 真删：先备份 ────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const backupFile = path.join(BACKUP_DIR, `vaccine-test-dogs-backup-${stamp}.json`)
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 })
  fs.writeFileSync(backupFile, backupJson, { encoding: 'utf8', mode: 0o600 })

  // 备份写完了要**读回来验一遍**：文件坏了就不许删
  let verified
  try {
    verified = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
  } catch (error) {
    console.error(`✗ 备份文件读不回来（${error.message}）—— 中止，什么都没删。`)
    return 3
  }
  if (!Array.isArray(verified.dogs) || verified.dogs.length !== dogs.length) {
    console.error('✗ 备份内容对不上（狗的只数不一致）—— 中止，什么都没删。')
    return 3
  }
  const size = fs.statSync(backupFile).size
  console.log(`\n✓ 备份已写好并校验通过：${backupFile}（${kb(size)}，${dogs.length} 只狗）`)

  // ── ⑧ 真删（一个事务：三步显式删 + 删狗；where 里再带一次「测」字头）──────
  console.log('\n开始删除（一个事务里，失败全回滚）…')
  const result = await prisma.$transaction(async (tx) => {
    const counts = []
    for (const [key, label] of DELETE_ORDER) {
      const r = await tx[key].deleteMany({ where: { dogId: { in: ids } } })
      counts.push([label, r.count])
      console.log(`   · 删除${label}：${r.count} 条`)
    }
    // ⚠️ 安全闸②：这一层的 where 里**再带一次**写死的「测」字头 —— 双保险
    const dogsDeleted = await tx.dog.deleteMany({
      where: { id: { in: ids }, name: { startsWith: SAFE_PREFIX } },
    })
    console.log(`   · 删除狗档案：${dogsDeleted.count} 只（其余子表由 CASCADE 跟着走）`)
    return { counts, dogsDeleted: dogsDeleted.count }
  })

  if (result.dogsDeleted !== dogs.length) {
    console.error(
      `✗ 删掉的狗数（${result.dogsDeleted}）和清单（${dogs.length}）不一致 —— ` +
        '有狗在删之前被别处改过；请复查数据库。备份在：' + backupFile,
    )
    return 4
  }

  // ── ⑨ 复查：这些狗还在不在、关联数据清干净没有 ───────────────────────────
  const leftDogs = await prisma.dog.count({ where: { id: { in: ids } } })
  let leftRelated = 0
  for (const [key] of [...DELETE_ORDER, ...CASCADE_TABLES]) {
    leftRelated += await prisma[key].count({ where: { dogId: { in: ids } } })
  }
  console.log(`\n复查：剩下这些狗 ${leftDogs} 只，关联数据 ${leftRelated} 条（都应为 0）`)
  if (leftDogs !== 0 || leftRelated !== 0) {
    console.error('✗ 还有残留，请人工看一眼（备份文件还在，可据此恢复）。')
    return 5
  }
  console.log(`✓ 清干净了。备份：${backupFile}`)
  console.log('ℹ️ 云上的原图不在这份脚本的范围里，由每天的 orphan 清理任务回收。')
  return 0
}

function buildBackupPayload({ dogs, related, orphans, orders }) {
  const relatedCounts = {}
  Object.entries(related).forEach(([key, rows]) => {
    relatedCounts[key] = rows.length
  })
  const orphanCounts = {}
  Object.entries(orphans).forEach(([key, rows]) => {
    orphanCounts[key] = rows.length
  })
  return {
    generatedAt: new Date().toISOString(),
    note: '疫苗测试档案清理前的全量备份（B2）。删狗之前写的；恢复时按 dogs[].id 找回各表行。',
    database: maskedDbUrl(),
    criteria: { namePrefix: PREFIX, only: ONLY, owner: OWNER || null, safePrefix: SAFE_PREFIX },
    counts: { dogs: dogs.length, related: relatedCounts, orphans: orphanCounts, orders: orders.length },
    dogs,
    related,
    // 下面两块**不在删除范围**（一个没有外键、一个只是置空关联），备份下来只为留证
    orphansNotDeleted: orphans,
    ordersNotDeleted: orders,
  }
}

/** 打印数据库地址时把密码挡掉，别把连接串写进日志/备份 */
function maskedDbUrl() {
  const url = process.env.DATABASE_URL || '(没有 DATABASE_URL)'
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@')
}

function maskPhone(phone) {
  const s = String(phone)
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : '****'
}

main()
  .then(async (code) => {
    await prisma.$disconnect()
    process.exit(code || 0)
  })
  .catch(async (error) => {
    console.error('\n✗ 跑挂了：', error?.message || error)
    await prisma.$disconnect()
    process.exit(1)
  })
