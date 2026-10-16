import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ══ 疫苗板块 · 组件层结构契约（2026-10-15 重构）════════════════════════════
 *
 * 技术方案 5.3：**组件层只保留少量结构契约**（钉语义标记，**不钉中文措辞**）。
 *
 * 这组断言盯四件事：
 *   ① **前端不做计划推算** —— 窗口、状态、排序、"下一针"都由后端下发（硬约束 2）；
 *   ② 写操作成功后**重新拉一次**整屏重绘（技术方案 3.4）；
 *   ③ 原型 A–K 十一屏需要的结构都在（下一针 / 类别色条 / 两个层级标识 /
 *      状态角标 / 节奏行 / 记录合并列表 / 录入器 / 识别确认 / 忽略原因）；
 *   ④ 视觉 token 只有一处（`styles/vaccine-tokens.scss`），组件里不写死主题色，
 *      模板里也不出现"系统会怎么记"这类内部话（硬约束 3、4）。
 */

const DIR = resolve(process.cwd(), 'src/components/vaccine')

const read = (name: string) => readFileSync(resolve(DIR, name), 'utf-8')

const COMPONENTS = [
  'VaccineTab.vue',
  'NextCard.vue',
  'PlanTimeline.vue',
  'RecordList.vue',
  'RecordEditor.vue',
  'ScanConfirm.vue',
  'IgnoreSheet.vue',
]

/**
 * 去掉注释之后的模板（判"界面上说了什么"必须先把注释摘掉）。
 *
 * ⚠️ 结尾取**最后一个** `</template>`：模板里还有内层的 `<template v-if>`，
 *    取第一个会在内层就截断（第一版就是这么错的）。
 */
function templateOf(source: string): string {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  const template = start >= 0 && end > start ? source.slice(start, end) : ''
  return template.replace(/<!--[\s\S]*?-->/g, '')
}

describe('疫苗 · 板块编排（VaccineTab）', () => {
  const tab = read('VaccineTab.vue')

  it('只有一个数据来源：主接口一次给全（下一针 / 计划 / 忽略 / 节奏 / 待核对）', () => {
    expect(tab).toContain('vaccineApi.plan(dogId)')
    expect(tab).toContain('planData.value?.plan')
    expect(tab).toContain('planData.value?.next')
    expect(tab).toContain('planData.value?.ignored')
    expect(tab).toContain('planData.value?.pendingReview')
  })

  it('🔴 前端不做计划推算：不解析日期、不排窗口、不判状态', () => {
    // 计划这一路不许出现"算日期"的代码（日期只做字符串切片，在 domain/status.ts 里）
    expect(tab).not.toContain('new Date(')
    expect(tab).not.toContain('getTime()')
    // "下一针"直接取后端给的那一条，不在前端挑
    expect(tab).toContain('planData.value?.next || null')
    expect(tab).not.toContain(".sort((left, right)")
  })

  it('🔴 任何写操作成功后都重新拉一次（整屏重绘，技术方案 3.4）', () => {
    const refreshes = tab.match(/await refreshAfterWrite\(\)/g) || []
    // 记一条 / 改一条 / 删一条 / 核对 / 识别入库 / 忽略 / 恢复
    expect(refreshes.length).toBeGreaterThanOrEqual(6)
    expect(tab).toContain('async function refreshAfterWrite()')
    expect(tab).toContain('await loadAll()')
  })

  it('原型 A–K 需要的六块都在，并且按"先下一针、再计划、再记录"的顺序', () => {
    const order = [
      '<NextCard',
      '<RecordEditor',
      '<ScanConfirm',
      '<PlanTimeline',
      '<RecordList',
      '<IgnoreSheet',
      '<HealthDocumentScan',
    ]
    let last = -1
    for (const tag of order) {
      const at = tab.indexOf(tag)
      expect(at, `${tag} 不在 VaccineTab 里`).toBeGreaterThan(-1)
      expect(at, `${tag} 的顺序不对`).toBeGreaterThan(last)
      last = at
    }
  })

  it('给页面（底部常驻栏 / 切书签守卫）的入口齐全', () => {
    const exposed = tab.slice(tab.indexOf('defineExpose({'))
    for (const name of [
      'reload',
      'startScan',
      'startDocumentScan',
      'addRecord',
      'countUnsaveableDrafts',
      'unconfirmedDraftCount',
    ]) {
      expect(exposed, `defineExpose 少了 ${name}`).toContain(name)
    }
  })

  it('加载失败 ≠ 没有记录（需求 R13）：给"重新加载"，不给空列表', () => {
    expect(tab).toContain('loadError')
    expect(tab).toContain('重新加载')
    expect(tab).toContain('v-else-if="loading && !planData"')
  })
})

describe('疫苗 · 下一针（NextCard，原型 A/B/C/F/I/K/G）', () => {
  const card = read('NextCard.vue')

  it('右上角「查看详情 ›」可展开可收起', () => {
    expect(card).toContain('@tap="toggleDetail"')
    expect(card).toContain('查看详情 ›')
    expect(card).toContain('收起详情')
    expect(card).toContain('function toggleDetail()')
  })

  it('卡片第三行用**短话 hint**，不许拿长依据 basis 当小字（会长成一堵墙）', () => {
    const hint = card.slice(card.indexOf('const hint = computed'), card.indexOf('const idleText'))
    expect(hint).toContain('step.hint')
    expect(hint).toContain('还有：')
    // basis 是"查看详情"里的整段依据（实测 128 字），不进首屏小字
    expect(hint).not.toContain('step.basis')
    // 展开时这一行不显示（短话与长依据说的是同一件事，别叠着看）
    expect(card).toContain('v-if="hint && !expanded"')
  })

  it('展开里的「依据」是长文 basis（与第三行的短话分工明确）', () => {
    const detail = card.slice(card.indexOf('vk-next__detail'))
    expect(detail).toContain('vk-next__field-label">依据')
    expect(card).toContain("const basisText = computed(() => String(props.next?.basis || '').trim())")
  })

  it('详情里有：常见产品 / 依据 / 抗体检测入口 / 忽略 / 两针一起打', () => {
    const detail = card.slice(card.indexOf('vk-next__detail'))
    /*
     * ⚠️ 2026-10-16 去掉「免疫流程」那一格：它当时显示的其实是"接种窗口 + 状态"，
     *    和卡片第二行一字不差地重复；后端也没下发"免疫流程"这句话，
     *    前端不该自己编。这一格将来要回来，得先让后端给字段。
     */
    expect(detail).not.toContain('免疫流程')
    expect(detail).toContain('record-combo')
    expect(detail).toContain('常见产品')
    expect(detail).toContain('依据')
    expect(detail).toContain('@tap="onAntibody"')
    expect(detail).toContain('@tap="onIgnore"')
    expect(detail).toContain('next.combo')
    expect(detail).toContain('这一针可以和')
  })

  it('抗体检测入口只对能被替代的那一类出现（核心 = titerable）', () => {
    expect(card).toContain('v-if="next.titerable"')
  })

  it('K 屏：没有待办时写"暂无需要接种的项目"，并给"查看已忽略的 N 项"', () => {
    const template = templateOf(card)
    expect(template).toContain('暂无需要接种的项目')
    expect(template).toContain('查看已忽略的')
    expect(template).toContain('@tap="toggleIgnored"')
    // 恢复入口就在家长眼皮底下（R5：一键恢复）
    expect(card).toContain('@tap="onRestore(item.key)"')
    expect(card).toContain('恢复')
  })

  it('两种入口按钮：上传疫苗本 / 记录这一针', () => {
    const template = templateOf(card)
    // "上传"不写"拍"：识别只开相册、不调相机（老板 2026-10-04 定）
    expect(template).toContain('上传疫苗本')
    expect(template).not.toContain('拍疫苗本')
    expect(template).toContain('记录这一针')
  })
})

describe('疫苗 · 接种记录能改能删（老板 2026-10-16 问）', () => {
  const list = read('RecordList.vue')

  it('每一行都有可见的「编辑」入口（原型只画了名字+日期，家长不知道能点）', () => {
    expect(list).toContain('vk-records__edit')
    expect(list).toContain('编辑')
  })

  it('点一行 → 进编辑；待核对的先给核对动作；抗体检测行也能改', () => {
    expect(list).toContain("emit('edit-record', entry.record)")
    expect(list).toContain("emit('edit-test', entry.test)")
    expect(list).toContain("emit('verify-record', entry.record)")
  })

  it('编辑入口把"这是哪一条"带进去，删除按钮由"有没有 id"决定（新增时不出现）', () => {
    const editor = read('RecordEditor.vue')
    expect(editor).toContain('const canRemove = computed(() => Boolean(props.record?.id || props.test?.id))')
    expect(editor).toContain("v-if=\"canRemove\"")
  })
});

describe('疫苗 · 免疫计划（PlanTimeline，原型 A/B/C/F/I/K）', () => {
  const timeline = read('PlanTimeline.vue')

  it('每行 = 日期窗口 + 类别色条 + `类别 · 步骤名` + 层级标识（只给待办行）', () => {
    expect(timeline).toContain('vk-plan__when')
    expect(timeline).toContain('vk-plan__kind')
    expect(timeline).toContain('kindTone(step.kind)')
    expect(timeline).toContain('stepTitle(step)')
    // 两个层级标识走 status.ts（唯一一份），组件只套 token
    expect(timeline).toContain('stepLayerLabel')
    expect(timeline).toContain('layerLabel(step.layer)')
    // 已完成的行不挂"必打"（原型 K/F 里那两行就没有）
    expect(timeline).toContain("v-if=\"step.status !== 'DONE'\"")
    /*
     * 行内**不挂状态角标**：左边那一列已经在说"现在 / 尽快 / 已完成"，
     * 再挂角标会让已完成的行说两遍（原型时间线行本来也没有角标）。
     */
    expect(timeline).not.toContain('vk-plan__badge')
    expect(timeline).not.toContain('statusLabel(step)')
  })

  it('还没到时间的那几行弱化（原型 `.tl__row--far`）', () => {
    expect(timeline).toContain('vk-plan__row--far')
    expect(timeline).toContain("step.status === 'UPCOMING'")
  })

  it('🔴 按后端给的顺序画，不重排；"现在"那一行由后端的 nextKey 决定', () => {
    expect(timeline).toContain('v-for="step in plan"')
    expect(timeline).toContain("step.key === nextKey")
    expect(timeline).not.toContain('.sort(')
  })

  it('底部"之后的节奏"一行（需求 7.3：不排 20 年）', () => {
    expect(timeline).toContain('vk-plan__rhythm')
    expect(timeline).toContain('{{ rhythm }}')
  })
})

describe('疫苗 · 记录列表（RecordList，原型 C/F/K）', () => {
  const list = read('RecordList.vue')

  it('接种记录与抗体检测合并成一个列表（按日期倒序，与计划无关）', () => {
    expect(list).toContain("type: 'record'")
    expect(list).toContain("type: 'test'")
    expect(list).toContain('antibodyEntryTitle(entry.test)')
  })

  it('最近几条 + 查看全部；疫苗本原件只出现一处（R10）', () => {
    expect(list).toContain('RECENT_COUNT')
    expect(list).toContain('查看全部')
    expect(list).toContain('查看疫苗本原件')
    expect(list).toContain('@tap="onPreviewBook"')
  })

  it('待核对的记录带角标，点它是去核对而不是去编辑（R7）', () => {
    expect(list).toContain('待核对')
    expect(list).toContain("emit('verify-record', entry.record)")
  })
})

describe('疫苗 · 唯一录入器（RecordEditor，原型 D/H）', () => {
  const editor = read('RecordEditor.vue')

  it('名称 + 日期两个必填；名称栏带「从产品库选」', () => {
    const template = templateOf(editor)
    expect(template).toContain('打了什么疫苗')
    expect(template).toContain('什么时候打的')
    expect(template).toContain('从产品库选')
    expect(template).toContain('mode="date"')
  })

  it('🔴 入参里没有 nextDueDate / status，也不传 kinds（后端算归类）', () => {
    expect(editor).not.toContain('nextDueDate')
    expect(editor).not.toContain('status:')
    expect(editor).not.toContain('kinds')
    // 病种是家长勾的、类别由后端推
    expect(editor).toContain('payload.components = [...components.value]')
  })

  it('归不了类时引导勾"含哪些疫苗"；确实不知道就不硬存（R6）', () => {
    expect(editor).toContain('含哪些疫苗')
    expect(editor).toContain('function toggleComponent(')
    expect(editor).toContain('这个名字看不出含什么疫苗，先勾一下它含哪些；确实不知道就问一下医生。')
  })

  it('日期不能填未来（R13）', () => {
    expect(editor).toContain('日期不能填将来的日子')
  })

  it('三个入口共用同一个录入器（页面底部 / 记录这一针 / 改一条）', () => {
    const tab = read('VaccineTab.vue')
    // ① 底部「记一条」 ② 下一针的「记录这一针」 ③ 记录列表里点一条
    expect(tab).toContain('function addRecord()')
    expect(tab).toContain('function onRecordStep(step: VaccineStep | null)')
    expect(tab).toContain('function onEditRecord(record: VaccineRecord)')
    // 识别结果补录也走它（ScanConfirm 里缺的那条）
    expect(tab).toContain("editorMode.value = 'record'")
  })
})

describe('疫苗 · 识别结果逐条确认（ScanConfirm，原型 E）', () => {
  const scan = read('ScanConfirm.vue')

  it('只有名称 + 日期两列，可改可删（R12）', () => {
    const template = templateOf(scan)
    expect(template).toContain('@input="onNameInput(index, $event)"')
    expect(template).toContain('@change="onDateChange(index, $event)"')
    expect(template).toContain('@tap="removeRow(index)"')
    // 缺名称或日期的那几条不静默丢，也不交上去
    expect(scan).toContain('还没有填好名称和日期')
  })

  it('"待核对"的行给核对动作，且没确认的不会保存', () => {
    expect(scan).toContain('待核对')
    expect(scan).toContain('@tap="verifyRow(index)"')
    expect(scan).toContain('没确认的不会保存')
  })

  it('底部两个键：全部不要 / 确认并保存', () => {
    const template = templateOf(scan)
    expect(template).toContain('全部不要')
    expect(template).toContain('确认并保存')
  })
})

describe('疫苗 · 忽略时选原因（IgnoreSheet，原型 J）', () => {
  const sheet = read('IgnoreSheet.vue')

  it('两个选项：这次先不打 / 不再接种了（行为一致，只记原因）', () => {
    expect(sheet).toContain("value: 'NOT_NOW', label: '这次先不打'")
    expect(sheet).toContain("value: 'STOPPED', label: '不再接种了'")
    expect(sheet).toContain('这一针怎么办？')
  })

  it('确认后交给上层（decision: SKIP + reason），本组件不管计划', () => {
    const tab = read('VaccineTab.vue')
    expect(tab).toContain("await vaccineApi.setDecision(props.dogId, step.key, { decision: 'SKIP', reason })")
  })
})

describe('疫苗 · 视觉 token 一处分定义（硬约束 4）', () => {
  it('🔴 组件里不许写死主题色，一律走 vaccine-tokens.scss', () => {
    for (const name of COMPONENTS) {
      const source = read(name)
      // 样式里不许出现裸色值（红色、绿色都是主题色的一部分）
      const literals = source.match(/#[0-9a-fA-F]{3,8}\b/g) || []
      expect(literals, `${name} 写死了色值：${literals.join(' ')}`).toEqual([])
      // 也不许自己写 rgba 主题色（白色蒙层除外，它是遮罩不是主题色）
      expect(source, `${name} 必须 @import 设计 token`).toContain(
        "@import '../../styles/vaccine-tokens.scss';",
      )
    }
  })

  it('🔴 token 文件里只有变量与 mixin，没有选择器规则（8 个组件各 import 一次不会重复产出）', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'src/styles/vaccine-tokens.scss'), 'utf-8')
    const rules = tokens
      .split('\n')
      .filter((line) => /\{/.test(line))
      .filter((line) => !/^\s*@mixin/.test(line.trim()))
    expect(rules).toEqual([])
    // 类别色 / 状态色 / 字号 / 间距四类都得有
    for (const token of ['$vk-core', '$vk-rabies', '$vk-lepto', '$vk-due-bg', '$vk-over-fg', '$vk-font-title', '$vk-gap-block']) {
      expect(tokens, `token 少了 ${token}`).toContain(token)
    }
  })

  it('🔴 界面只说顾客语言：模板里不出现"系统会怎么记 / 会算进计划 / 内部"这类话', () => {
    const forbidden = ['系统', '会算进计划', '内部', '后端', '接口', '数据库', '推算']
    const files = readdirSync(DIR).filter((name) => name.endsWith('.vue'))
    for (const name of files) {
      const template = templateOf(read(name))
      for (const word of forbidden) {
        expect(template.includes(word), `${name} 的界面上出现了内部话术「${word}」`).toBe(false)
      }
    }
  })
})
