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
    // 状态选择器没了（产品库那个 selector 是选疫苗名的，不是选状态）
    expect(source).not.toContain('statusValueAt')
    expect(source).not.toContain('statusIndex')

    // 但老记录存着别的值时，卡片上要照旧显示出来，不能变空白
    expect(source).toContain('const STATUS_LABELS')
    expect(source).toContain("OVERDUE: '已逾期'")
    expect(source).toContain("SCHEDULED: '已预约'")
    expect(source).toContain('function statusLabel')
  })

  it('顾客勾的是**病种**，分类由后台判定（2026-10-06 老板改）', () => {
    const source = readComponent()

    // 老板："在用户需要确认和手动修改的分类中，我们不应该把分类呈现给用户看……
    // 我们需要把它拆开，拆成每一个疫苗种类让顾客选择，
    // 至于分类的判定则交由后台来完成。"
    expect(source).toContain('含哪些病种')
    expect(source).toContain('componentOptions')
    expect(source).toContain('toggleComponent(index, option.value)')
    // 界面上不许再出现"核心疫苗/钩端螺旋体"这种内部类别让顾客选
    expect(source).not.toContain("label: '核心疫苗'")
  })


  it('系统认不出来时**如实承认**，并让顾客照本子勾病种（2026-10-06 改）', () => {
    const source = readComponent()

    expect(source).toContain('这一针含哪些病种？')
    expect(source).toContain('照疫苗本上的成分表勾')
    // 勾不上任何病种时要有出路（驱虫药这种本来就不是疫苗）
    expect(source).toContain('都不是 / 不确定')
    expect(source).toContain('function toggleNoneOfThem(index: number)')
  })


  it('顾客可以自己改分类（他的记录，他做主）', () => {
    const source = readComponent()

    // 老板："用户可以判断，可以把疫苗记录进行手动更改。
    // 用户自己的疫苗记录、疫苗计划，我们去改什么呢？"
    expect(source).toContain('vaccine-kind__edit')
    expect(source).toContain('function toggleKind')
    expect(source).toContain('draft.kindsManual = true')
  })

  it('录入只留两条路：选产品库 / 手填（2026-10-05 简化）', () => {
    const source = readComponent()

    // 老板："为什么还会显示狂犬疫苗、犬二联这种疫苗名称的选择器？
    // 这个疫苗名称字段，它的作用是什么呢？"
    // 原来有三个控件做同一件事（12 个预设标签 + 产品库 + 输入框）。
    // 现在两条，职责清楚：
    expect(source).toContain('function applyCatalogProduct')
    expect(source).toContain('catalogProducts')
    expect(source).toContain("updateDraft(index, 'vaccineName', $event.detail.value)")
    // 预设标签下线 —— 它们的唯一价值是"带着归类"，而现在打字也自动判
    expect(source).not.toContain('applyNamePreset')
    expect(source).not.toContain('presetNames')
  })

  it('名称写完点「确认」才匹配产品与分类（2026-10-05 老板的规格）', () => {
    const source = readComponent()

    // 老板："顾客手动的输入产品名称。**点击确认之后**，再来完成 AI 的匹配。
    // 包括产品匹配和分类匹配。"
    // 不边打字边判 —— 一来一回问后端会卡手，而且顾客往往写到一半就被判错。
    expect(source).toContain('function confirmVaccineName')
    expect(source).toContain('@tap="confirmVaccineName(index)"')
    expect(source).toContain('dogApi.classifyVaccineName')
    expect(source).not.toContain('scheduleClassify')
    expect(source).not.toContain('CLASSIFY_DELAY_MS')
    // 匹配期间要有反馈
    expect(source).toContain('matchingIndex')
    expect(source).toContain('匹配中…')
  })

  it('扫描出来的记录缺东西时**必须说出来**，不许静默跳过', () => {
    const source = readComponent()

    // 2026-10-05 的 bug：识别完提示"已识别 N 条"，实际一条都没存 ——
    // 缺归类时静默 return，顾客以为存好了，切个标签记录就凭空消失。
    expect(source).toContain("autoSaveNotices.value = { ...autoSaveNotices.value, [index]: reason }")
    expect(source).not.toContain('if (autoSaveBlockReason(record, index)) return')
  })

  it('目录由后端下发，前端不自带一份', () => {
    const source = readComponent()

    // 分类与产品是后端的 domain 知识，前端复制一份迟早对不上
    expect(source).toContain('dogApi.vaccineCatalog()')
    expect(source).toContain('function loadVaccineCatalog')
    expect(source).not.toContain('VACCINE_PRODUCTS')
    expect(source).not.toContain('classifyVaccineKinds')
  })

  it('记录一变就通知外面重算（计划与角标否则会一直停在旧状态）', () => {
    const source = readComponent()

    // 老板："自动识别并录入 3 条疫苗接种信息之后，并没有弹出或者展示出
    // 疫苗提醒或者计划呀。" —— 计划板块只在"换狗"时加载一次，
    // 顾客在原地录完，它完全不知道。
    expect(source).toContain("(event: 'records-changed'): void")
    expect(source).toContain('function notifyRecordsChanged')
    // 用"已保存记录的指纹"挡掉重复通知
    expect(source).toContain('savedRecordsSignature')
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

  it('🔴 识别出来的记录真的会存下去（老板反复遇到的那个 bug）', () => {
    const source = readComponent()

    // 手动保存键 2026-10-03 就下线了，可识别这条路一直只"填表"。
    // 2026-10-05 挖到最后一个根因：识别完**没有重建草稿**，
    // 于是 isDirty 取不到草稿 → 判定"没有改动" → 自动保存直接返回、
    // **不报错也不保存**。生产库里 vaccine_record 一直是 0 条。
    expect(source).toContain('ensureDrafts()')
    expect(source).toContain('function saveScannedRecords')
    expect(source).toContain('void saveScannedRecords()')
    // 不许并发（saveRecord 有 isBusy 守卫，同时发只存第一条）
    expect(source).toContain('await saveRecord(record, index)')
    expect(source).not.toContain('void runAutoSave(record, index)\n  })')
  })

  it('没保存过的记录（没有 id）只要填了名字就算"待保存"', () => {
    const source = readComponent()

    // isDirty 原来只比"草稿 vs 记录"，可识别出来的记录值本来就在记录里，
    // 两边一样 → 判不出"待保存"。没有 id 就说明从来没存过。
    expect(source).toContain('if (!record.id) {')
    expect(source).toContain('return Boolean(draftOf(record, index).vaccineName.trim())')
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
    // addRecord 仍由底部按钮通过 ref 调起；2026-10-06 起还接受一个预填参数
    // （从接种计划的某一步点「记录疫苗接种信息」进来时，带上那一步的分类）
    expect(source).toContain('function addRecord(prefill?: { kinds?: string[] })')
    expect(source).toContain('kinds: Array.isArray(prefill?.kinds) ? [...prefill.kinds] : [],')
  })

  it('空态只说一次「档案里还没有接种记录」', () => {
    const source = readComponent()

    // 老板："为什么会提醒了一次，没有接种记录。在下方又进行了一次
    // 没有疫苗记录的提醒呢。" —— 计划板块那张卡和这里的空态说的是同一件事。
    // 现在计划板块零记录时整块不渲染，这句话只在这里说。
    expect(source).toContain('档案里还没有接种记录')
    expect(source).not.toContain('还没有疫苗记录')
  })

  it('病种词表也由后端下发（前端只留一份小兜底）', () => {
    const source = readComponent()

    // 词表跟着接口走：后端改了前端不用改
    expect(source).toContain('componentOptions.value = res.data.components')
    expect(source).toContain('FALLBACK_COMPONENT_OPTIONS')
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

/**
 * 老板 2026-10-06 实测报的两个问题。
 */
describe('识别多条只存了一条 + 分类改不动（2026-10-06）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('🔴 整表重载不许冲掉还没保存的本地记录', () => {
    const source = readComponent()

    // 根因：saveScannedRecords 逐条存，而每存一条 saveRecord 都会 loadRecords()
    // 整表重载 —— 重载原来是"拿服务器返回的直接替换"，
    // 于是同一批里还没保存的那几条（id 还是空的）当场被冲掉。
    // 表现就是老板看到的：识别 3 条，只进去 1 条。
    expect(source).toContain('const unsavedLocal = records.value.filter((record) => !record.id)')
    expect(source).toContain('records.value = [...fromServer, ...unsavedLocal]')
    // 不能再用"直接替换"的写法
    expect(source).not.toContain('records.value = (Array.isArray(list) ? list : [])')
  })

  /**
   * 分类标签：**多选**（2026-10-06 第二轮定稿）。
   *
   * 中间走过一段弯路，这里把结论钉死：
   *   · 老板第一次说"点哪个都改不动"—— 真正的原因是**后端更新记录时漏写了
   *     kinds**（已修）。我当时代价最小地改成了单选，顺手把组合苗的
   *     多选能力也改没了。
   *   · 老板第二次把洞看出来了："卫佳捌这种多分类的产品……手动是没办法
   *     多选标签的，对吗？" —— 对。少勾一类的后果很实际：
   *     免疫计划会以为钩端那一步还没打。
   * 所以恢复多选；"改不动"的观感不会回来，因为后端现在真的存得进去。
   */
  it('🔴 手动分类是**多选**（组合苗要能同时勾上好几类）', () => {
    const source = readComponent()

    expect(source).toContain('draft.kinds.includes(kind)')
    expect(source).toContain('? draft.kinds.filter((item) => item !== kind)')
    expect(source).toContain(': [...draft.kinds, kind]')
    // 不能再退回"选一个"（那会吃掉组合苗的第二类）
    expect(source).not.toContain('draft.kinds = draft.kinds.length === 1 && draft.kinds[0] === kind ? [] : [kind]')
  })

  it('多选要能用：点一下不收起选择器，另给一个「选好了」', () => {
    const source = readComponent()

    // 收起就没法再点第二个病了
    expect(source).toContain('function closeKindPicker(index: number)')
    expect(source).toContain("class=\"vaccine-kind__done\" @tap=\"closeKindPicker(index)\"")
    // 提示里得写明可多选（组合苗要勾好几个病种）
    expect(source).toContain('可多选')
  })

  it('组合苗的多分类仍然成立（从产品库选时自动带出）', () => {
    const source = readComponent()

    // 单选只针对"顾客手动指定"这一条路；
    // 选产品时分类按真实成分带出来（卫佳捌 = 核心 + 钩端），不能被单选逻辑吃掉
    expect(source).toContain('draft.kinds = [...product.kinds]')
  })
})

/**
 * 老板 2026-10-06 实测报的另外三个问题（问题2/4/5）。
 */
describe('识别结果表单 + 疫苗名称回填 + 刷新不闪（2026-10-06 第二批）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  /**
   * 问题4 的根因：产品库下发的规范名是「宠必威幼犬保」（没有 ®），
   * 而疫苗本识别出来的是「宠必威® 幼犬保」。原来用 `===` 比，比不中 →
   * 名称那一行退回显示"从产品库选择"占位提示，
   * 识别出来的名字只能留在下面的手填输入框里。
   */
  it('🔴 产品名比对前先归一化，® 和空格不影响认不认得出', () => {
    const source = readComponent()

    expect(source).toContain('function normalizeProductName(')
    // 与后端 normalizeProductText 同一套规则，缺一不可
    expect(source).toContain(".replace(/[®™©]/g, '')")
    expect(source).toContain('function findCatalogProduct(')
    // 名称那一行必须走归一化比对，不能退回"一模一样才认"
    expect(source).toContain('function isNameRecognized(')
    expect(source).toContain('function nameFieldLabel(')
    expect(source).not.toContain('catalogProducts.value.some((item) => item.name === name)')
  })

  /**
   * 老板 2026-10-06 第二轮："未识别的疫苗产品输入框出现的时候，对用户而言
   * 是否会感到疑惑？因为它的上方还有一个产品名的选择器，**二者都是一样的名字**。"
   *
   * 对 —— 所以同一个名字只允许出现一次：认得出就只在这一行显示规范名
   * （同时不出现手填框）；认不出就把这一行降级成"去库里挑一支"这个**动作**，
   * 名字本身留给下面的手填框。
   */
  it('🔴 认得出：这一行显示库里的规范名', () => {
    const source = readComponent()

    expect(source).toContain('function nameFieldLabel(')
    expect(source).toContain('if (matched) return matched.name')
  })

  it('🔴 认不出：这一行只写"去库里挑一支"，不再把同一个名字显示两遍', () => {
    const source = readComponent()

    expect(source).toContain("'＋ 从产品库选一支'")
    // 名字本身只在手填框里出现（:value 绑的是 draft.vaccineName）
    expect(source).toContain(':value="draftOf(record, index).vaccineName"')
    // 旧的"名称行直接显示原文"的写法（会和输入框重复）已经下线
    expect(source).not.toContain("return String(name || '').trim()")
  })

  it('🔴 手填输入框只在产品库里没有这只苗时才出现', () => {
    const source = readComponent()

    // 老板的规格："如果 AI 识别的疫苗名称没有在产品库中，
    // 才显示这个输入框吧？"
    expect(source).toContain('function showManualNameInput(')
    expect(source).toContain('<template v-if="showManualNameInput(index)">')
    // 正打字的那一行不能把输入框抽走（打到一半刚好命中产品库会当场消失）
    expect(source).toContain('if (focusIndex.value === index) return true')
  })

  it('🔴 确认的结果留在卡片上，不再是"闪一下就没"', () => {
    const source = readComponent()

    // 老板："点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
    expect(source).toContain('const confirmResults = reactive<')
    expect(source).toContain("class=\"vaccine-confirm-result\"")
    expect(source).toContain('setConfirmResult(')
    // 成功和认不出两种结果都要说清楚
    expect(source).toContain('已确认：')
    expect(source).toContain('产品库和 AI 都没认出这支苗')
  })

  it('🔴 后台刷新不许把已经显示出来的记录先擦掉（"屏幕闪烁"的来源）', () => {
    const source = readComponent()

    // 每次自动保存（点分类、点确认、改日期）都会整表重载，
    // 而占位原来是 `v-if="loading"` —— 整个列表先消失再长回来。
    expect(source).toContain('v-if="loading && records.length === 0"')
    expect(source).not.toContain('<view v-if="loading" class="health-section__empty">')
  })
})

/**
 * 老板 2026-10-06 第二次实测报的两个问题。
 */
describe('识别 3 条变 6 条 + 表单底部红字下线（2026-10-06 第三批）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  /**
   * 老板："明明上传的疫苗本上只有 3 次幼犬保的接种记录，为什么在确认之后的
   * 疫苗标签下、接种计划下方的疫苗记录中间却有 6 条信息呢？"
   *
   * 数据库里一直是 3 条 —— 是界面在重复显示：创建成功之后本地那条记录的
   * id 还是空的，紧接着 loadRecords() 把它当成"还没保存的草稿"留下来，
   * 于是服务端那条和本地幽灵那条同时出现。3 真 + 3 幽灵 = 6 条。
   */
  it('🔴 创建成功后必须先把新 id 写回本地记录，再重载列表', () => {
    const source = readComponent()

    expect(source).toContain('if (!record.id && newId) {')
    expect(source).toContain('record.id = newId')

    // 顺序不能反：写回要排在 loadRecords() 之前，
    // 否则 unsavedLocal 又会把这条已保存的记录当成草稿留下来
    const saveAt = source.indexOf('async function saveRecord(')
    const writeBackAt = source.indexOf('record.id = newId', saveAt)
    const reloadAt = source.indexOf('await loadRecords()', saveAt)
    expect(writeBackAt).toBeGreaterThan(-1)
    expect(reloadAt).toBeGreaterThan(-1)
    expect(writeBackAt).toBeLessThan(reloadAt)
  })

  it('列表重载仍然保留"真的还没保存"的草稿（别把上一轮的修复改回去）', () => {
    const source = readComponent()

    expect(source).toContain('const unsavedLocal = records.value.filter((record) => !record.id)')
    expect(source).toContain('records.value = [...fromServer, ...unsavedLocal]')
  })
})

describe('识别结果表单 · 底部红字下线（2026-10-06）', () => {
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('底部那段汇总红字不再渲染', () => {
    const source = readScan()

    // 老板："既然在上传照片预览图下方已经有提醒了，
    // 那么在识别后的表单最下方的红字提醒是否就可以不要了呢？"
    expect(source).not.toContain('class="confirm__warnings"')
    expect(source).not.toContain('confirm__warning"')
    // 状态和样式一起清干净，别留死代码
    expect(source).not.toContain('.confirm__warnings')
    expect(source).not.toContain('const warnings = ref')
  })

  it('照片预览下方的逐张提示还在，而且照样按合并结果筛过', () => {
    const source = readScan()

    expect(source).toContain('class="pages__warnings"')
    expect(source).toContain('filterWarningsAgainstRecord(page.warnings, merged[0])')
  })
})

/**
 * 接种记录板块（2026-10-06 老板第二次改）。
 */
describe('接种记录 · 空记录不显示 + 做成一个板块（2026-10-06）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('🔴 没有任何记录时，标题行不出现（老板："它也会显示出来"）', () => {
    const source = readComponent()

    expect(source).toContain('v-if="records.length > 0" class="records-card__head"')
    // 守卫必须排在标题之前，否则标题又会常显
    const cardAt = source.indexOf('health-card records-card')
    const guardAt = source.indexOf('v-if="records.length > 0"', cardAt)
    const headAt = source.indexOf('records-card__head', cardAt)
    expect(guardAt).toBeGreaterThan(-1)
    expect(headAt).toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(headAt)
  })

  it('但零记录时那句说明还在（否则这一页就没话可说了）', () => {
    const source = readComponent()

    expect(source).toContain('档案里还没有接种记录')
    expect(source).toContain('records-card__empty')
  })

  it('记录行不再各自成卡，而是板块里用分隔线排开的一组', () => {
    const source = readComponent()

    expect(source).toContain('class="health-card records-card"')
    expect(source).toContain('<view class="records-list">')
    // 行上不能再挂 health-card —— 那会给每一行套回白底 + 边框 + 阴影
    expect(source).not.toContain('class="vaccine-card health-card"')
    expect(source).toContain('.records-list .vaccine-card:first-child')
  })

  it('板块有表头（标题 + 条数 + 一句说明），和「接种计划」同一套语言', () => {
    const source = readComponent()

    expect(source).toContain('records-card__title')
    expect(source).toContain('records-card__count')
    expect(source).toContain('records-card__desc')
  })
})

/**
 * 认出来的产品要用库里的规范名（2026-10-06 老板实测）。
 *
 * 瓶签「卫佳® Vanguard® Plus 5/CV-L」在库里叫「卫佳捌」。
 * 后端那套匹配能认出这种写法（名称或别名被包含），前端这份只做
 * "名字一模一样"的比对，认不出 —— 所以规范名一律以后端下发的为准。
 */
describe('疫苗名称 · 用后端认出来的规范产品名（2026-10-06）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('🔴 识别结果填表时优先用 productName', () => {
    const source = readComponent()

    expect(source).toContain("vaccineName: String(draft.productName || draft.vaccineName || ''),")
  })

  it('🔴 点「确认」时也用后端给的规范名，并把名字对齐', () => {
    const source = readComponent()

    expect(source).toContain("const canonicalName = String(res.data.productName || '')")
    expect(source).toContain('draft.vaccineName = canonicalName')
    // 后端没给才退回前端这份比对
    expect(source).toContain('canonicalName ? { name: canonicalName } : findCatalogProduct(name)')
  })

  it('认不出来时绝不硬塞名字（照旧显示顾客写的那串字）', () => {
    const source = readComponent()

    // draft.productName 为空串时回退到原文
    expect(source).toContain("|| draft.vaccineName || ''")
  })
})

/**
 * 名称字段的三种状态 + 选中态样式顺序（2026-10-06 第三轮）。
 */
describe('疫苗名称 · 三种状态各司其职（2026-10-06）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('三种状态：还没写 / 库里有 / 库里没有', () => {
    const source = readComponent()

    expect(source).toContain(
      "function nameFieldMode(name: string): 'empty' | 'recognized' | 'unknown'",
    )
    expect(source).toContain("if (!String(name || '').trim()) return 'empty'")
    expect(source).toContain("return isNameRecognized(name) ? 'recognized' : 'unknown'")
  })

  it('🔴 库里没有的产品：不给"从产品库挑一支"的入口', () => {
    const source = readComponent()

    // 老板："对于宠派纯这类产品库中没有的产品……也不让用户可以点击
    // 从产品库中挑选产品的弹窗呢？因为这没有意义嘛，对吧？"
    expect(source).toContain(
      "v-if=\"catalogProducts.length > 0 && nameFieldMode(draftOf(record, index).vaccineName) !== 'unknown'\"",
    )
  })

  it('库里没有时要说清楚，并且名字仍然能写', () => {
    const source = readComponent()

    expect(source).toContain('产品库里没有这支苗 —— 已按你写的名字记录')
    expect(source).toContain("nameFieldMode(draftOf(record, index).vaccineName) === 'unknown'")
  })

  /**
   * 老板："我看在卫佳8的记录下，疫苗名称下面还需要点确认按钮，它才会弹
   * 已确认卫佳8归为核心疫苗加钩端螺旋体的提醒。是需要点点击确认按钮才会
   * 归类吗？还是说不需要点其实已经归类了？"
   * —— 早就归类了。所以别再摆一个按钮让人以为"必须点一下"。
   */
  it('🔴 分类已经有了、名字也认得 → 不再显示「确认」按钮', () => {
    const source = readComponent()

    expect(source).toContain('function showConfirmButton(index: number): boolean')
    expect(source).toContain('if (draft.kinds.length === 0) return true')
    expect(source).toContain("return nameFieldMode(draft.vaccineName) === 'unknown'")
    expect(source).toContain('v-if="showConfirmButton(index)"')
    // 取而代之说明一句
    expect(source).toContain('分类已按产品库自动判定，不用再确认。')
  })

  /**
   * 老板："我在分类中点击选项，没有反应。但是点击选好了之后。
   * 依然会显示出刚刚已经点击的那几类。"
   *
   * 状态一直是对的（所以"选好了"之后看得到），看不见的是**高亮** ——
   * 因为选中态的样式写在了基础态**前面**，两个选择器优先级一样，后写的赢，
   * 基础类的白底深字把选中态整个盖掉了。样式顺序问题只能靠顺序修。
   */
  it('🔴 选中态样式必须写在基础态之后（否则高亮永远被盖掉）', () => {
    const source = readComponent()

    const baseAt = source.indexOf('.vaccine-name-tag {')
    const activeAt = source.indexOf('.vaccine-name-tag--active {')
    expect(baseAt).toBeGreaterThan(-1)
    expect(activeAt).toBeGreaterThan(-1)
    expect(activeAt).toBeGreaterThan(baseAt)
  })
})

/**
 * 名字没读全要诚实说（2026-10-06 老板）。
 */
describe('疫苗名称 · 没读全时如实告知并一键改对（2026-10-06）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('🔴 识别草稿把候选带进来', () => {
    const source = readComponent()

    expect(source).toContain('nameSuggestions: Array.isArray(draft.nameSuggestions)')
    expect(source).toContain('nameSuggestions?: string[]')
  })

  it('🔴 认出没把握时，明说"这行字可能没读全"并列出候选', () => {
    const source = readComponent()

    // 老板："如果不能完全有把握的识别出来，能不能诚实的告诉用户呢？"
    expect(source).toContain('这行字可能没读全')
    expect(source).toContain('(record.nameSuggestions || []).length > 0')
    expect(source).toContain('@tap="applySuggestedProduct(index, suggestion)"')
  })

  it('点候选 = 用那一支（名字和分类一起带对），用过就不再提示', () => {
    const source = readComponent()

    expect(source).toContain('function applySuggestedProduct(index: number, name: string)')
    expect(source).toContain('applyCatalogProduct(index, at)')
    expect(source).toContain('if (record) record.nameSuggestions = []')
  })

  it('点「确认」时也刷新候选（认出来了就清空）', () => {
    const source = readComponent()

    expect(source).toContain('if (Array.isArray(res.data.nameSuggestions))')
    expect(source).toContain('record.nameSuggestions = res.data.nameSuggestions.map(String)')
  })
})
