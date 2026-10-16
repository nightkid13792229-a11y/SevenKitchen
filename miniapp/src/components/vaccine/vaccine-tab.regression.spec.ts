import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../../architecture/source-text'
import { stepPlanTitle } from '../../domain/vaccine/status'
import type { VaccineStep } from '../../domain/vaccine/types'

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

/**
 * ⚠️ 一律先 `stripComments()` 再断言（architecture/source-text.ts 里的规矩）：
 * "源码里不许出现某个说法"这类断言，会被**注释里提到那个词**骗到 ——
 * 而那几条注释往往正是在解释"为什么不该这么写"，于是越解释越误报。
 * 今天（2026-10-16）我在这个文件上又踩了一次，所以在这里一次性修掉。
 */
const read = (name: string) => stripComments(readFileSync(resolve(DIR, name), 'utf-8'))

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
      // 识别组件的提示块（"没识别到内容"）要离点击的地方近 ——
      // 2026-10-16 老板截图里它落在接种记录下面，太远了，挪到计划之前
      '<HealthDocumentScan',
      '<PlanTimeline',
      '<RecordList',
      '<IgnoreSheet',
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
    /*
     * ⚠️ 2026-10-16：`startDocumentScan`（PDF / Word 识别）从疫苗侧**撤掉**了。
     *    原型底栏只有两个明面按钮（上传疫苗本 / 记一条），疫苗本本身就是纸质小本；
     *    就诊/体检/过敏那三类的文档入口不受影响（仍在它们自己的底部通道里）。
     *    要恢复的话，得先给它一个家长看得见的入口，别再挂一个走不到的接口。
     */
    for (const name of [
      /*
       * ⚠️ 2026-10-16：`reload` 从这份名单里去掉了 —— 它一直暴露着，
       *    但**唯一会用的宿主页面从没调用过**，新加的"声明 vs 暴露"守卫
       *    （src/architecture/expose-contract.spec.ts）把这对不上抓了出来。
       */
      'startScan',
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
    // 已经没有"自己拼一句话"的退路了：每个真步骤后端都给 hint
    expect(hint).not.toContain('laterSteps')
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

  it('这张卡只有「记录这一针」一个动作（老板 2026-10-16 定）', () => {
    const template = templateOf(card)
    expect(template).toContain('记录这一针')
    /*
     * 老板 2026-10-16："下一针窗口中，取消掉上传疫苗本的按钮，只保留记录这一针" ——
     * 这张卡只做一件事；上传疫苗本是全局动作，放在底部固定栏里。
     */
    expect(template).not.toContain('上传疫苗本')
    expect(template).not.toContain('onScan')
  })

  it('🔴 同一件事只叫「已忽略」；没有待办时照实说（自检 V12/V16）', () => {
    /*
     * ⚠️ 2026-10-16 自检 V16：同一件事在这张卡上原来有三个叫法 ——
     *    "已忽略的 N 项" / "已设为不做" / "这个先不打"，家长得自己猜是不是同一件事。
     * ⚠️ 自检 V12：没有待办时原来写"该打的都打完了。以后该打的时候，这里会告诉你。"
     *    —— 那是替狗狗下结论：我们只知道手上没有要补的记录，并不知道它打完没打完。
     */
    expect(card).not.toContain('已设为不做')
    expect(card).not.toContain('这个先不打')
    expect(card).not.toContain('该打的都打完了')
    expect(card).toContain('项已忽略')
    expect(card).toContain('忽略这一针')
    expect(card).toContain('按现有记录没有要补的针，打过的都在下面的记录里')
  })
})

describe('疫苗 · 边界与状态（老板 2026-10-16："这种小问题还有很多"）', () => {
  const tab = read('VaccineTab.vue')

  it('档案里没有生日 → 说"还缺一个生日"，**不能**说"该打的都打完了"', () => {
    expect(tab).toContain('档案里还缺一个生日')
    expect(tab).toContain("planData && !planData.birthday")
    expect(tab).toContain("url: `/pages/dog-create/index?dogId=${props.dogId}`")
  })

  it('加载/失败态里的叫法与板块一致，都叫"免疫计划"（不叫"免疫安排"）', () => {
    expect(tab).not.toContain('免疫安排')
  })

  it('🔴 点记录区的「编辑」要定位到录入卡（老板 2026-10-16 第 1 条）', () => {
    for (const fn of ['function onEditRecord', 'function onEditTest']) {
      const body = tab.slice(tab.indexOf(fn), tab.indexOf(fn) + 700)
      expect(body, `${fn} 里没有滚动定位`).toContain("scrollToAnchor('vk-anchor-editor')")
    }
  })

  it('核对成功也要回一句（原来只有失败才提示）', () => {
    expect(tab).toContain("uni.showToast({ title: '已核对'")
  })
});

describe('疫苗 · 忽略弹层（原型 J）', () => {
  const sheet = read('IgnoreSheet.vue')

  it('每次打开都复位成"这次先不打"（否则上次选过"不再接种了"，这次一按确定就记错原因）', () => {
    expect(sheet).toContain('DEFAULT_REASON')
    expect(sheet).toContain('if (open) reason.value = DEFAULT_REASON')
  })

  it('默认值取影响最小的那个（原型 J 画的是"不再接种了"选中，那只是画了一个状态）', () => {
    expect(sheet).toContain("const DEFAULT_REASON: 'NOT_NOW' | 'STOPPED' = 'NOT_NOW'")
  })
});

/** 造一个最小可用的步骤（这个文件是结构契约，只需要用到标题相关的字段） */
const step = (extra: Partial<VaccineStep>): VaccineStep =>
  ({
    key: 'core-puppy-2',
    kind: 'core',
    kindLabel: '核心疫苗（犬瘟、细小、腺病毒）',
    label: '第 2 针',
    layer: 'MUST',
    windowStart: '2026-11-01',
    windowEnd: '2026-11-15',
    status: 'UPCOMING',
    statusLabel: '待接种',
    titerable: false,
    products: [],
    ...extra,
  }) as VaccineStep

describe('疫苗 · 定位到录入卡（老板 2026-10-16："有弹窗时定位不过去"）', () => {
  const tab = read('VaccineTab.vue')

  it('🔴 查不到锚点要**重试**，不能静默放弃（nextTick 不保证已布局）', () => {
    expect(tab).toContain('function scrollToAnchor(id: string, attempt = 0)')
    expect(tab).toContain('if (attempt < 6)')
    expect(tab).toContain('setTimeout(() => scrollToAnchor(id, attempt + 1), 60)')
  })

  it('有冲突弹窗那条路也要走同一个定位（点「去修改」之后）', () => {
    // 记录区：先弹冲突说明 —— 确认后继续走 emit('edit-record')
    const list = read('RecordList.vue')
    expect(list).toContain("confirmText: '去修改'")
    expect(list).toContain("emit('edit-record', entry.record)")
  })
});

describe('疫苗 · "未判读"要解释一句（清单 E2 的发现）', () => {
  it('🔴 报告没写结论时，界面要说清"为什么是未判读"', () => {
    const editor = read('RecordEditor.vue')
    /*
     * 后端会把"报告没写结论"和"我们不替兽医判"都算好，
     * 但那句话只在**兜底降级**时才推给前端，而且前端根本不显示 warnings ✗ ——
     * 家长只看到一个"未判读"，不知道是报告没写、还是我们读不出来。
     */
    expect(editor).toContain("result === 'UNKNOWN'")
    expect(editor).toContain('报告上没有写合格与否的结论')
    expect(editor).toContain('以兽医的判读为准')
  })
});

describe('疫苗 · 同一张照片显示一次（老板 2026-10-16 发现的 bug）', () => {
  const list = read('RecordList.vue')
  const tab = read('VaccineTab.vue')

  it('🔴 一次识别读出多条时，同一张图只展示一次（不能显示 3 遍）', () => {
    /*
     * 生产实测：一次识别读出 3 条记录，那张疫苗本照片挂在**这 3 条上**（设计如此），
     * 按记录逐条列就显示 3 遍 ✗。现在按图片地址去重。
     */
    expect(list).toContain('const seen = new Map<string')
    expect(list).toContain('existing.ownerIds.push(String(owner.id))')
    expect(list).toContain('continue')
  })

  it('🔴 但删除要从**所有挂着它的记录**上一起删（否则刷新又出现）', () => {
    expect(list).toContain('ownerIds: [...item.ownerIds]')
    expect(tab).toContain('for (const ownerId of ownerIds)')
    expect(tab).toContain("const rest = (record.attachments || []).filter((url) => url !== payload.url)")
    expect(tab).toContain("const rest = (test.attachments || []).filter((url) => url !== payload.url)")
  })
});

describe('疫苗 · 附件区与首行横线（老板 2026-10-16）', () => {
  const list = read('RecordList.vue')
  const timeline = read('PlanTimeline.vue')

  it('🔴 首行不画顶部横线（计划与记录两侧）', () => {
    expect(timeline).toContain("'vk-plan__row--first': index === 0")
    expect(timeline).toContain('.vk-plan__row--first {\n  border-top: none;')
    expect(list).toContain("'vk-records__row--first': index === 0")
    expect(list).toContain('.vk-records__row--first {\n  border-top: none;')
  })

  it('🔴 附件区改名成「疫苗本 / 抗体检测附件」（里面不只有疫苗本）', () => {
    expect(list).toContain('疫苗本 / 抗体检测附件')
    expect(list).not.toContain('查看疫苗本')
  })

  it('附件区可展开、按来源分区、每张有上传时间、每张可删', () => {
    expect(list).toContain('toggleAttachments')
    // 两个分区：疫苗本 / 抗体检测报告
    expect(list).toContain("groupOf('record', '疫苗本'")
    expect(list).toContain("groupOf('test', '抗体检测报告'")
    // 上传时间用记录自己的 createdAt（照片真正传上来的时刻）
    expect(list).toContain('formatDateTime')
    expect(list).toContain('vk-attach__time')
    // 删除
    expect(list).toContain('onRemoveAttachment')
    expect(list).toContain("emit('remove-attachment'")
    const tab = read('VaccineTab.vue')
    expect(tab).toContain('@remove-attachment="onRemoveAttachment"')
    expect(tab).toContain('async function onRemoveAttachment')
    // 删之前问一句，并把云上的文件一起清掉
    expect(tab).toContain("title: '删掉这张照片？'")
    expect(tab).toContain('deleteHealthAttachment')
  })
});

describe('疫苗 · 抗体检测接入 AI 识别（老板 2026-10-16 第 2 条）', () => {
  const tab = read('VaccineTab.vue')
  const scan = read('ScanConfirm.vue')

  it('底部那个按钮选"抗体检测报告"时，走的是**识别**（不是空白卡）', () => {
    expect(tab).toContain('document-type="ANTIBODY_REPORT"')
    expect(tab).toContain('ref="antibodyScanRef"')
    const body = tab.slice(tab.indexOf('function addAntibodyTest'), tab.indexOf('function addAntibodyTest') + 300)
    expect(body).toContain('antibodyScanRef.value?.startScan?.()')
  })

  it('🔴 什么也没读出来时**不开卡**（否则会替家长给出"合格"的结论）', () => {
    const body = tab.slice(
      tab.indexOf('function onAntibodyScanned'),
      tab.indexOf('function onAntibodyScanned') + 600,
    )
    expect(body).toContain('if (list.length === 0) return')
  })

  it('识别结果铺进录入卡，家长照样能逐项改（唯一录入器）', () => {
    expect(tab).toContain('function onAntibodyScanned')
    expect(tab).toContain('onAntibodyPreset({')
    expect(tab).toContain(':preset="antibodyPreset"')
    const editor = read('RecordEditor.vue')
    expect(editor).toContain('preset?:')
    expect(editor).toContain('props.preset')
  })

  it('识别组件对"抗体报告"也只当识别服务用：不弹它自己的确认页、不合并草稿', () => {
    const docScan = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )
    expect(docScan).toContain('ANTIBODY_REPORT')
    // deferConfirm 不再只认疫苗本
    expect(docScan).toContain('if (props.deferConfirm) {')
  })

  it('识别填的那一份要说清"这是照报告填的，请核对"（抗体报告没有独立确认页）', () => {
    const editor = read('RecordEditor.vue')
    expect(editor).toContain('下面这些是照报告填好的，请核对一下')
    expect(editor).toContain('v-if="preset"')
  })

  it('🔴 抗体检测只记三样：项目 / 日期 / 结果（老板 2026-10-16）', () => {
    const editor = read('RecordEditor.vue')
    /*
     * 老板："抗体检测录入框中，只记录检查项目、检查日期、报告结果即可，不需要记录数值。"
     * 数值与单位从表单里撤掉 —— 报告照片里本来就看得见，不必再让家长抄一遍。
     */
    expect(editor).not.toContain('数值（选填）')
    expect(editor).not.toContain('valueText')
    expect(editor).not.toContain('unitText')
  })

  it('报告照片：能预览、能删、能再加（缩略图格子）', () => {
    const editor = read('RecordEditor.vue')
    expect(editor).toContain('vk-editor__photos')
    expect(editor).toContain('previewReportPhoto')
    expect(editor).toContain('uni.previewImage')
    expect(editor).toContain('removeReportPhoto')
    expect(editor).toContain('vk-editor__photo-add')
    expect(editor).toContain('vk-editor__photo-del')
  })
});

describe('疫苗 · 多条识别结果里"是哪一条错了"（老板 2026-10-16）', () => {
  const scan = read('ScanConfirm.vue')
  const tab = read('VaccineTab.vue')

  it('🔴 错误挂在**那一行**上：标红 + 写清原因 + 给一条出路', () => {
    expect(scan).toContain("'vk-scan__row--error': row.error")
    expect(scan).toContain('row.error')
    expect(scan).toContain('去补全这一条')
  })

  it('🔴 逐条存：一条失败不影响后面的，能存的先存进去', () => {
    // 每一条都单独 try/catch，失败只记到它自己身上
    expect(tab).toContain('failedRows.push({')
    expect(tab).toContain('scanRows.value = failedRows')
    // 提示要说清"存了几条、还剩几条"，而不是一句笼统的报错
    expect(tab).toContain('还有 ${failedRows.length} 条要处理')
  })

  it('"去补全"走录入器（那里能勾"含哪些疫苗"），补完把那一条从列表里拿掉', () => {
    expect(tab).toContain('function onScanFixRow(row: VaccineScanRow, index: number)')
    expect(tab).toContain("editorHeading.value = '补全这一条'")
    /*
     * ⚠️ 2026-10-16 自检 V6 修：原来按**行号**删，行号会因家长中途删/加行而错位，
     *    补完存好拿掉的可能是另一条 ✗。现在按行的唯一标识（key）删。
     */
    expect(tab).toContain('scanRows.value = scanRows.value.filter((row) => row.key !== editorFixKey.value)')
  })

  it('补全时把识别到的名称与日期一起带过去（不让家长重打一遍）', () => {
    expect(tab).toContain('editorPresetName.value = String(row.name || \'\')')
    expect(tab).toContain('editorDate.value = String(row.date || \'\')')
    const editor = read('RecordEditor.vue')
    expect(editor).toContain('presetDate')
  })
});

describe('疫苗 · 识别结果页（老板 2026-10-16 的三个问题）', () => {
  const scan = read('ScanConfirm.vue')

  it('哪些要核对：四种情形写在页面上，不是只在代码里；狂犬单拎一句', () => {
    /*
     * ⚠️ 2026-10-16 自检 V20：这句原来钉的是"名字没读出来、是狂犬、产品库里没有这个名字、
     *    日期可疑"——把狂犬混在"我们没十足把握的"里说，等于说我们只是"可能读错"。
     *    狂犬不是没把握、是必须核（漏了/错了会漏打一针必须打的），所以现在分两句说：
     *    前三种说"没十足把握"，狂犬单拎一句说"必须核"。
     *    顺带按 V14 的方向把"产品库"（内部叫法）说成"常见疫苗"。
     */
    expect(scan).toContain('名字没读出来、名字不在常见疫苗里、日期看着可疑的')
    expect(scan).toContain('狂犬这一针不是没把握，是必须核')
  })

  it('🔴 名称与日期必须**看起来就能改**：给它们输入框（有框 = 能改）', () => {
    expect(scan).toContain('vk-scan__field')
    /*
     * ⚠️ 2026-10-16 老板："把疫苗产品名称和日期放到输入框中就可以了，不需要再加一个
     *    「改」的按钮。" —— 有框本身就说明能改，再挂一个「改」是重复。
     */
    expect(scan).not.toContain('vk-scan__edit')
  })

  it('🔴 「删掉」必须先确认（手一滑就少一条，而少的那条未必马上发现）', () => {
    expect(scan).toContain('@tap="onRemoveRow(index)"')
    expect(scan).toContain('async function onRemoveRow')
    expect(scan).toContain("title: '删掉这一条？'")
    expect(scan).toContain("confirmText: '删除'")
  })

  it('识别漏掉的那条，能在这一页直接补（走同一个录入器）', () => {
    expect(scan).toContain('＋ 补一条（识别漏掉的）')
    expect(scan).toContain("emit('add-manual')")
    const tab = read('VaccineTab.vue')
    expect(tab).toContain('@add-manual="onAddManualRecord"')
    // 用的是唯一录入器，不是在这页硬填名字（手写名字认不出类别时会被后端拦）
    expect(tab).toContain('function onAddManualRecord()')
    expect(tab).toContain('addRecord()')
  })
});

describe('疫苗 · 计划项展开详情（老板 2026-10-16 第 2 条）', () => {
  const timeline = read('PlanTimeline.vue')

  it('每一项都有展开入口，展开后给：依据 + 常见产品', () => {
    expect(timeline).toContain('vk-plan__more')
    expect(timeline).toContain("isOpen(step.key) ? '收起' : '详情 ›'")
    expect(timeline).toContain('step.basis')
    expect(timeline).toContain('step.products.join')
    /*
     * ⚠️ 2026-10-16 老板："「这一类是什么」这个字段不再展示，可以删除掉。"
     *    所以展开里只剩"这一刻真正用得上"的两样：依据 + 常见产品。
     *    要加回来，得先问老板。
     */
    expect(timeline).not.toContain('这一类是什么')
    expect(timeline).not.toContain('step.kindDefinition')
  })

  it('同时只展开一项（不然几条依据叠在一起，版面又被撑爆）', () => {
    expect(timeline).toContain("const openKey = ref('')")
    expect(timeline).toContain("openKey.value = openKey.value === key ? '' : key")
  })
});

describe('疫苗 · 不作数的记录要说清为什么（老板 2026-10-16："20周够吗？有依据吗？"）', () => {
  const list = read('RecordList.vue')
  const tab = read('VaccineTab.vue')

  it('🔴 后端算好的 conflicts 必须显示出来（原来只在后端算、界面不显示）', () => {
    expect(tab).toContain('planConflicts')
    expect(tab).toContain(':conflicts="planConflicts"')
    expect(list).toContain('conflictOf')
    expect(list).toContain('vk-records__warn')
  })

  it('点那一条先讲清"为什么、该怎么办"，再进编辑', () => {
    expect(list).toContain('conflict.suggestion')
    expect(list).toContain("confirmText: '去修改'")
    /*
     * ⚠️ 2026-10-16 自检 V11：弹窗标题原来兜底写"这一条暂时不作数"（内部说法，
     *    而且它只是"先不排进计划"，不是"这条记录不存在"）。现在兜底说"这条记录需要改一下"。
     */
    expect(list).toContain('这条记录需要改一下')
  })

  it('录入卡的抗体提示写明两个时间条件（20 周龄 / 最后一针后 4 周）', () => {
    const editor = read('RecordEditor.vue')
    expect(editor).toContain('20 周龄之前')
    expect(editor).toContain('不满 4 周')
  })
});

describe('疫苗 · 「下一针」卡的展开态（老板 2026-10-16 第 2、3 条）', () => {
  const card = read('NextCard.vue')

  it('🔴 展开后不许出现两个「记录这一针」——收起态那一排要藏起来', () => {
    expect(card).toContain('v-if="!expanded" class="vk-next__acts"')
    // 展开后详情里自己有「记录这一针」，收起态那一排再出现就是同一张卡两个一样的键
    const acts = card.slice(card.indexOf('v-if="!expanded"'), card.indexOf('vk-next__detail'))
    expect(acts).toContain('记录这一针')
  })

  it('展开态也不放「上传疫苗本」（与收起态一致）', () => {
    const detail = card.slice(card.indexOf('vk-next__detail'))
    expect(detail).not.toContain('上传疫苗本')
    expect(detail).not.toContain('onScan')
  })

  it('🔴 展开里不再复述"接下来还有哪几项"—— 正下方就是完整的免疫计划', () => {
    expect(card).not.toContain('还有：')
    expect(card).not.toContain('后面还有')
    expect(card).not.toContain('laterSteps')
    expect(card).not.toContain('laterText')
  })
});

describe('疫苗 · 计划行的排版（老板 2026-10-16："标题长的排版非常混乱"）', () => {
  it('短名进计划行，长名留给卡片；"第 N 针"这种序号不进计划行', () => {
    const long = step({ kindShort: '核心疫苗', label: '第 2 针' });
    expect(stepPlanTitle(long)).toBe('核心疫苗');
    expect(stepPlanTitle(step({ kindShort: '核心疫苗', label: '每年一次' }))).toBe(
      '核心疫苗 · 每年一次',
    );
    expect(stepPlanTitle(step({ kindShort: '狂犬疫苗', label: '补一针' }))).toBe(
      '狂犬疫苗 · 补一针',
    );
    // 没有短名时退回长名，不许空着
    expect(stepPlanTitle(step({ kindShort: '', kindLabel: '钩端螺旋体', label: '' }))).toBe(
      '钩端螺旋体',
    );
  });
});

describe('疫苗 · 抗体检测的入口位置（需求 R9：能记录、不主动提示）', () => {
  const list = read('RecordList.vue')
  const editor = read('RecordEditor.vue')
  const card = read('NextCard.vue')

  it('🔴 记录区**不许**摆"记抗体检测"这种常驻招呼 —— 那等于劝人去做检测', () => {
    expect(list).not.toContain('记抗体检测')
    expect(list).not.toContain('add-test')
  })

  it('入口与「上传疫苗本」合成**一个按钮**（老板 2026-10-16 第 3 条）', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
    // 2026-10-16（自检 V32）：底部左键文案从「上传疫苗本 / 报告」缩成「上传疫苗本」
    // —— 按钮是 nowrap + flex .92，7 个中文字加斜杠在窄屏上会压字。
    /*
     * ⚠️ 自检 V32 曾把它缩成「上传疫苗本」（担心窄屏压字），**已回退**：
     *    老板 17:29 的截图里「上传疫苗本 / 报告」渲染正常（有证据），
     *    而缩短后"报告"这条路在按钮上就看不见了 —— 与他"合成一个按钮"的意图相悖。
     */
    expect(page).toContain("'上传疫苗本 / 报告'")
    expect(page).toContain("'疫苗本（传照片识别）'")
    // 2026-10-16：抗体检测报告也走 AI 识别（不再是"传张照片、手填"）
    expect(page).toContain("'抗体检测报告（传报告识别）'")
    expect(page).toContain('vaccineSectionRef.value?.addAntibodyTest?.()')
  })

  it('抗体检测的记录能留原件（报告照片），且是选填', () => {
    expect(editor).toContain('报告照片')
    expect(editor).toContain('uploadHealthImage')
  })

  it('🔴「检了什么」是**单选**：一份报告就是一份报告（老板 2026-10-16 第 5 条）', () => {
    expect(editor).toContain("const target = ref<AntibodyTarget>('CORE')")
    expect(editor).not.toContain('toggleTarget')
  })

  it('需要它的那一处仍然明说：「下一针」展开里的「先做抗体检测」（核心那一针能省掉）', () => {
    expect(card).toContain('先做抗体检测')
    expect(card).toContain('v-if="next.titerable"')
  })
});

describe('疫苗 · 录入卡', () => {
  const editor = read('RecordEditor.vue')

  it('日期不能选未来（后端会拒，但别让家长白填一遍）', () => {
    expect(editor).toContain(':end="maxDate"')
    expect(editor).toContain('const maxDate = computed(() => todayDateText())')
  })
});

describe('疫苗 · 接种记录能改能删（老板 2026-10-16 问）', () => {
  const list = read('RecordList.vue')

  it('每一行都有可见的「编辑」入口（原型只画了名字+日期，家长不知道能点）', () => {
    expect(list).toContain('vk-records__edit')
    expect(list).toContain('编辑')
  })

  it('点一行 → 进编辑；待核对且没有冲突的先给核对动作；抗体检测行也能改', () => {
    expect(list).toContain("emit('edit-record', entry.record)")
    expect(list).toContain("emit('edit-test', entry.test)")
    expect(list).toContain("emit('verify-record', entry.record)")
  })

  it('🔴 既待核对、又有冲突的那一条：「去修改」之后真的去编辑，不再落到核对流程（自检 V5）', () => {
    /*
     * ⚠️ 2026-10-16 自检 V5：有冲突时弹的框确认键写的是「去修改」，但代码原来继续
     *    往下走 `isPending` 那一支（去核对）—— 那条记录永远改不了，按钮名与动作不符。
     *    冲突说明这条记录本身有问题，核对通过也没意义，所以**先去改**。
     */
    const body = list.slice(list.indexOf('async function onEntryTap'), list.indexOf('function onPreviewBook'))
    const conflictBranch = body.slice(0, body.indexOf('if (isPending(entry)'))
    expect(conflictBranch).toContain("emit('edit-record', entry.record)")
    expect(conflictBranch).toContain("emit('edit-test', entry.test)")
    // 走完编辑这一支就 return，不许再落到下面的核对 / 抗体行分支
    expect(conflictBranch).toContain('return')
    // 核对那一支仍然在，只是排在冲突之后（没有冲突的待核对行照样能核对）
    expect(body).toContain("emit('verify-record', entry.record)")
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
    // 计划行用**短名 + 不显示第几针**（老板 2026-10-16：标题长的排版很乱）
    expect(timeline).toContain('stepPlanTitle')
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
    // 2026-10-16：加了 index（第一行不画顶部横线要用它）
    expect(timeline).toContain('v-for="(step, index) in plan"')
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

  it('最近几条 + 查看全部；疫苗本只出现一处（R10）', () => {
    expect(list).toContain('RECENT_COUNT')
    expect(list).toContain('查看全部')
    /*
     * ⚠️ 2026-10-16 自检 V17：这句原来钉的是"查看疫苗本原件"——同一个东西在这页有
     *    "本子""疫苗本原件"好几个叫法。统一成「疫苗本」（原名件照片仍整本只展示一处）。
     */
    /*
     * ⚠️ 2026-10-16 老板：这一块不再叫「查看疫苗本」—— 里面既有疫苗本照片，
     *    也有抗体检测报告照片。现在叫「疫苗本 / 抗体检测附件」，可展开、按来源分区。
     */
    expect(list).toContain('疫苗本 / 抗体检测附件')
    // 2026-10-16：改成按张预览（分区之后按张看更清楚），由 previewOne 承担
    expect(list).toContain('previewOne(item.url)')
  })

  it('待核对的记录带角标，点它是去核对而不是去编辑（R7）', () => {
    expect(list).toContain('待核对')
    expect(list).toContain("emit('verify-record', entry.record)")
  })
})

describe('疫苗 · 唯一录入器（RecordEditor，原型 D/H）', () => {
  const editor = read('RecordEditor.vue')

  it('名称 + 日期两个必填；名称栏带「从常见疫苗选」', () => {
    const template = templateOf(editor)
    expect(template).toContain('打了什么疫苗')
    expect(template).toContain('什么时候打的')
    // ⚠️ 2026-10-16 自检 V14：这句原来叫「从产品库选」——
    //    "产品库"是我们的说法，家长面前统一说「常见疫苗」。
    expect(template).toContain('从常见疫苗选')
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
    /*
     * ⚠️ 2026-10-16 自检 V24：这条原来钉的是**提示与报错一字不差的那一句** ——
     *    同一张卡上把同一句话说两遍 ✗，而且"问一下医生"应说**兽医**。
     *    现在：提示留在勾选块里（说清为什么），报错只说缺什么、下一步做什么。
     */
    expect(editor).toContain('这个名字看不出含什么疫苗。勾一下它含哪些；确实不知道就问一下兽医。')
    expect(editor).toContain("errorText.value = '先勾一下它含哪些疫苗，再保存。'")
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

describe('疫苗 · 识别结果逐条核对（ScanConfirm，原型 E）', () => {
  const scan = read('ScanConfirm.vue')

  it('只有名称 + 日期两列，可改可删（R12）', () => {
    const template = templateOf(scan)
    expect(template).toContain('@input="onNameInput(index, $event)"')
    expect(template).toContain('@change="onDateChange(index, $event)"')
    // 2026-10-16 起走确认弹窗（防误触），不再直接删
    expect(template).toContain('@tap="onRemoveRow(index)"')
  })

  it('🔴 缺名称或日期的那几条：不交上去，而且**留在页面上**（自检 V4）', () => {
    /*
     * ⚠️ 2026-10-16 自检 V4：这句原来钉的是"还没有填好名称和日期"。当时注释写着
     *    "缺的那几条留在页面上"，代码却是 `rows.value = ready` —— 把它们**从页面上删掉**，
     *    提示还说"先留着" ✗（家长填漏一行：既没保存、也从界面上消失，只能重新识别一次）。
     *    现在只把填全的交上去，缺的原地不动，提示照实说"没有保存"。
     */
    expect(scan).not.toContain('rows.value = ready')
    expect(scan).toContain('还没填全，没有保存')
    // 缺的那几条的 key 要记下来：父组件回写识别结果时不能被抹掉
    expect(scan).toContain('keptKeys')
  })

  it('🔴 一条都填不全时说清缺哪条、缺什么、下一步（自检 V22）', () => {
    // 原来只有一句"还没有填好名称和日期"：没说缺哪条、也没说下一步
    expect(scan).not.toContain('还没有填好名称和日期')
    expect(scan).toContain('function missingHint(')
    expect(scan).toContain('补齐再保存')
  })

  it('"待核对"的行给核对动作，并说清该做什么', () => {
    expect(scan).toContain('待核对')
    expect(scan).toContain('@tap="verifyRow(index)"')
    /*
     * ⚠️ 2026-10-16 修：这里原来钉的是"没确认的不会保存" —— 与事实相反：
     *    待核对的行**会先存下来**（只是不参与计划）。当时那条守卫能过，
     *    是因为**注释里**还留着那句话 ✗（这个文件现在也统一先剥注释了）。
     *
     * ⚠️ 2026-10-16 自检 V9/V18：这句原来钉的是"暂时不参与提醒" —— 那是**系统话**
     *    （家长不关心我们的提醒怎么算）。现在只说该做什么：对着疫苗本核一下。
     */
    expect(scan).not.toContain('没确认的不会保存')
    expect(scan).not.toContain('暂时不参与提醒')
    expect(scan).toContain('请对着疫苗本核一下')
  })

  it('底部两个键：全部不要 / 核对好了，保存（自检 V19：全页统一用「核对」）', () => {
    const template = templateOf(scan)
    expect(template).toContain('全部不要')
    // 原来是"确认并保存"：同一件事在这页上有"核对""确认"两个叫法，统一成「核对」
    expect(template).toContain('核对好了，保存')
    // 日期显示成 2026/11/20，跟记录区、免疫计划一个写法（自检 V30）
    expect(template).toContain('formatFullDate(row.date)')
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
