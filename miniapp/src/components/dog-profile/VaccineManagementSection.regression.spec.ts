import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 疫苗管理（2026-09-27）
 *
 * 后端的 /dogs/:dogId/vaccines 接口早就存在（含到期查询与订阅提醒），
 * 但顾客端**一个入口都没有** —— 生产 4544 只狗里疫苗记录为 0 条。
 * 老板要求把它并入「健康管理」板块。
 */
describe('疫苗管理', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('接的是后端已有的疫苗接口，没有另造一套', () => {
    const source = readComponent()

    expect(source).toContain('dogApi.healthRecords.vaccine.list')
    expect(source).toContain('dogApi.healthRecords.vaccine.create')
    expect(source).toContain('dogApi.healthRecords.vaccine.update')
    expect(source).toContain('dogApi.healthRecords.vaccine.delete')
  })

  it('四项信息齐全：疫苗名 / 接种日期 / 下次接种 / 备注', () => {
    const source = readComponent()

    for (const field of ['vaccineName', 'vaccinationDate', 'nextDueDate', 'notes']) {
      expect(source).toContain(field)
    }
  })

  it('「状态」不再让顾客选（2026-10-04 老板提问后改）', () => {
    const source = readComponent()

    // 老板："用户如果手动记录了疫苗信息的话，就意味着这一针已经打了呀，
    // 为什么还会让用户选择接种状态呢？" —— 对。一条接种记录记的就是
    // 已经发生的事，没有第二种可能。
    // 另外查过后端：**没有任何逻辑读这个字段**，它此前纯粹是个显示标签。
    expect(source).not.toContain('const STATUS_OPTIONS')
    expect(source).not.toContain('statusPickList')
    expect(source).not.toContain("mode=\"selector\"")

    // 但老记录存着别的值时，卡片上要照旧显示出来，不能变空白
    expect(source).toContain('const STATUS_LABELS')
    expect(source).toContain("OVERDUE: '已逾期'")
    expect(source).toContain("SCHEDULED: '已预约'")
    expect(source).toContain('function statusLabel')
  })

  it('草稿（还没保存的）也要能删（2026-10-05）', () => {
    const source = readComponent()

    // 老板："疫苗记录为什么没有删除的按钮呢？"
    // 根因是删除键带 v-if="record.id" —— 识别出来还没保存的那几条没有 id，
    // 于是看不到删除键；可 removeRecord 本来就支持删草稿。
    expect(source).not.toContain('v-if="record.id"\n            class="vaccine-card__delete"')
    expect(source).toContain('vaccine-card__delete')
    // 草稿走"从本地列表里摘掉"那条路
    expect(source).toContain('records.value = records.value.filter')
  })

  it('「下次接种」字段已删除（2026-10-05 老板要求）', () => {
    const source = readComponent()

    // 老板："为什么还是有下次接种时间这个字段呢？请把这个字段删掉。"
    // 提醒该由系统按免疫程序算，让顾客手填等于把责任推给他。
    expect(source).not.toContain('下次接种（可选）')
    expect(source).not.toContain("updateDraft(index, 'nextDueDate'")
    // 但后端字段保留：老记录里的值仍要显示、也要原样带回去，别清掉
    expect(source).toContain('nextDueDate')
    expect(source).toContain('if (draft.nextDueDate) {')
  })

  it('新增一条之后滚到它、并把光标落进疫苗名称（2026-10-05）', () => {
    const source = readComponent()

    // 老板："在选择手动加一条之后，为什么没有定位到编辑窗口呢？"
    // 新记录追加在列表末尾，前面有几条时它落在屏幕外 —— 看着就像"没反应"。
    expect(source).toContain('scrollPageToSelector')
    expect(source).toContain(':focus="focusIndex === index"')
    expect(source).toContain('focusIndex.value = target')
    // 必须在 DOM 更新之后做
    expect(source).toContain('nextTick(() => {')
  })

  it('识别出来的记录直接存掉（不然它们永远只是草稿）', () => {
    const source = readComponent()

    // 手动保存键 2026-10-03 就下线了，可识别这条路一直只"填表"，
    // 于是识别出来的记录看着像存好的、其实 id 是空的 ——
    // 删除键不显示、后端也一条都没有（疫苗计划那边因此整块不显示）。
    expect(source).toContain("`已识别 ${scanned} 条，正在保存…`")
    expect(source).toContain('void runAutoSave(record, index)')
  })

  it('删除按钮在卡片脸上，不用先展开（像就诊记录一样）', () => {
    const source = readComponent()

    // 老板："为什么不能像就诊记录一样，提供一个删除按钮和删除弹窗提醒呢？"
    // 弹窗一直都有（删除疫苗记录？/ 删除 / 保留），只是入口藏在展开后的表单最底下。
    expect(source).toContain('vaccine-card__header-actions')
    expect(source).toContain('@tap.stop="removeRecord(record, index)"')

    // 删除必须在头部那一块里，而不是展开区里
    const headerAt = source.indexOf('vaccine-card__header-actions')
    const bodyAt = source.indexOf('vaccine-card__body"')
    expect(headerAt).toBeGreaterThan(-1)
    expect(bodyAt).toBeGreaterThan(headerAt)
    const headerBlock = source.slice(source.lastIndexOf('<view class="vaccine-card__header"', headerAt), bodyAt)
    expect(headerBlock).toContain('vaccine-card__delete')
  })

  it('自动保存不收起卡片、不弹 toast（2026-10-04）', () => {
    const source = readComponent()

    // 老板："为什么在我选择了疫苗名称之后，它就会提醒已保存，
    // 并帮我收起了疫苗记录呢？"
    // 新增时接种日期默认今天，所以一点疫苗名标签两个必填就齐了 →
    // 立刻自动保存 → 卡片当场收起，后面想补字段都没得填。
    expect(source).not.toContain("uni.showToast({ title: '已保存', icon: 'success' })")

    // 存完不能无条件收起；要按 id 把展开状态跟回同一条
    // （loadRecords 会按接种日期重排，新增的那条会从末尾挪到前面）
    expect(source).toContain('const relocated = records.value.findIndex((item) => item.id === newId)')
    expect(source).toContain('expandedIndex.value = relocated')
    expect(source).toContain('function markSaved(index: number)')
  })

  it('板块内不再有「新增疫苗记录」按钮（底部那个已经在做同一件事）', () => {
    const source = readComponent()

    // 老板："在记录板块中有一个新增疫苗记录的按钮，在最下方还有一个新增记录的
    // 按钮呢？不是重复了吗？"
    expect(source).not.toContain('新增疫苗记录')
    // addRecord 仍由底部按钮通过 ref 调起
    expect(source).toContain('function addRecord()')
  })

  it('空态只说一次「档案里还没有接种记录」', () => {
    const source = readComponent()

    // 老板："为什么会提醒了一次，没有接种记录。在下方又进行了一次
    // 没有疫苗记录的提醒呢。" —— 计划板块那张卡和这里的空态说的是同一件事。
    // 现在计划板块零记录时整块不渲染，这句话只在这里说。
    expect(source).toContain('档案里还没有接种记录')
    expect(source).not.toContain('还没有疫苗记录')
  })

  it('常见疫苗名一点即选，不用顾客手打', () => {
    const source = readComponent()

    expect(source).toContain('commonVaccineNames')
    expect(source).toContain('狂犬疫苗')
    expect(source).toContain('犬瘟热')
    expect(source).toContain('犬细小病毒')
  })

  it('标签用"本子上真会写的写法"：联数名 + 病名（2026-10-04）', () => {
    const source = readComponent()

    // 顾客疫苗本印的是"犬四联""卫佳伍"这种产品/联数写法，
    // 原来 8 个标签全是病名（犬瘟热、犬细小病毒），两边对不上。
    expect(source).toContain("'犬二联'")
    expect(source).toContain("'犬四联'")
    expect(source).toContain("'犬八联'")
  })

  it('保存前校验疫苗名与接种日期，空值不静默丢弃', () => {
    const source = readComponent()

    expect(source).toContain('请填写疫苗名称')
    expect(source).toContain('请选择接种日期')
  })

  it('下次到期日留空时不把空字符串传给后端（日期字段会被拒）', () => {
    const source = readComponent()

    expect(source).toContain('if (draft.nextDueDate) {')
    expect(source).toContain('payload.nextDueDate = draft.nextDueDate')
  })

  it('到期提醒只做页面内提示：未来 30 天内到期 + 已过期', () => {
    const source = readComponent()

    expect(source).toContain('dueSummaryText')
    expect(source).toContain('已过期')
    expect(source).toContain('30 天内到期')
    expect(source).toContain('daysUntil')
    expect(source).toContain('还有 ${days} 天到期')
  })

  it('删除前必须二次确认，避免误删接种史', () => {
    const source = readComponent()

    expect(source).toContain('uni.showModal')
    expect(source).toContain('删除疫苗记录？')
    expect(source).toContain("confirmText: '删除'")
    expect(source).toContain("cancelText: '保留'")
  })

  it('记录变化后统一重建编辑草稿（防止索引错位把 A 的内容写到 B）', () => {
    const source = readComponent()

    expect(source).toContain('function ensureDrafts()')
    // 载入、新增、删除草稿后都要重建
    expect((source.match(/ensureDrafts\(\)/g) || []).length).toBeGreaterThanOrEqual(4)
    // 草稿不允许在渲染期间惰性创建
    expect(source).toContain('草稿绝不能"边渲染边创建"')
  })
})

/**
 * 疫苗本原图留档（2026-10-01，健康管理第九期）。
 *
 * 老板：拍疫苗本上传的图片，原图也要留档（像病历/检查那样）。
 * 疫苗本是接种凭证 —— 出行、寄养、换医院都可能要看原件。
 */
describe('疫苗本原图留档', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('识别出的接种记录带着当页原图（不再是写死的空数组）', () => {
    const source = readComponent()

    expect(source).toContain('attachments: attachmentList(draft)')
    expect(source).not.toContain('attachments: [],')
  })

  it('保存时把原图一起提交给后端', () => {
    const source = readComponent()

    expect(source).toContain('attachments: attachmentList(record)')
    // 保存那条路要把记录本身传进 buildPayload，否则拿不到附件
    expect(source).toContain('buildPayload(draft, record)')
  })

  it('卡片上能看原图：有原件才显示「报告原件」，点开可预览', () => {
    const source = readComponent()

    expect(source).toContain('v-if="attachmentList(record).length > 0"')
    expect(source).toContain('报告原件')
    expect(source).toContain('@tap="previewAttachment(attachment)"')
    // 图片/PDF 的打开逻辑与病历卡片共用一份，不各写一套
    expect(source).toContain('previewHealthAttachment')
    expect(source).toContain('buildHealthAttachmentDisplayMeta')
  })

  it('立即求值的 computed/watch 写在它用到的 ref 之后（否则整个板块崩掉）', () => {
    const source = readComponent()

    // 2026-10-02 修：hasPendingDraft 的 immediate watcher 原来写在 const records 之前，
    // setup 期间立刻求值 → records 还是 undefined → 抛
    // TypeError: Cannot read properties of undefined (reading 'value')，
    // 「疫苗」板块整块 setup 失败（开发者工具控制台刷满同一条报错）。
    const recordsAt = source.indexOf('const records = ref')
    const computedAt = source.indexOf('const hasPendingDraft = computed')
    const watchAt = source.indexOf('watch(hasPendingDraft')

    expect(recordsAt).toBeGreaterThan(-1)
    expect(computedAt).toBeGreaterThan(recordsAt)
    expect(watchAt).toBeGreaterThan(computedAt)
    // 立即求值是必须的（父页面靠它知道要不要亮保存键），所以只能靠顺序保证安全
    expect(source).toContain('watch(hasPendingDraft, (value) => emit(\'dirty-change\', value), { immediate: true })')
  })

  it('接口类型带上 attachments 字段', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('attachments?: string[]')
  })
})
