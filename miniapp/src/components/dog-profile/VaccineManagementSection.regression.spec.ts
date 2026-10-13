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
  /** 一条记录的编辑卡（2026-10-12 第一步：模板搬去了这个文件 ✓）*/
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
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

  it('顾客可以自己改分类（他的记录，他做主）', () => {
    const source = readComponent()

    // 老板："用户可以判断，可以把疫苗记录进行手动更改。
    // 用户自己的疫苗记录、疫苗计划，我们去改什么呢？"
    expect(source).toContain('vaccine-kind__edit')
    expect(source).toContain('function toggleKind')
    expect(source).toContain('draft.kindsManual = true')
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
    // 2026-10-12：载荷的拼装规则提到共用文件了 ✓（第三步的新建卡也用同一套 ✓）——
    // 所以这条判据跟着挪 ✓，判据本身一个字没放松 ✓
    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )
    expect(shared).toContain('if (draft.nextDueDate) {')
  })

  it('新增一条之后滚到它、并把光标落进疫苗名称（2026-10-05）', () => {
    const source = readComponent()

    // 老板："在选择手动加一条之后，为什么没有定位到编辑窗口呢？"
    // 新记录追加在列表末尾，前面有几条时它落在屏幕外 —— 看着就像"没反应"。
    expect(source).toContain('scrollPageToSelector')
    // 2026-10-12 第一步：'正在打字的是哪一行'（focusIndex）仍由这里记着 ✓，
    // 卡片拿它当 nameFocused ✓；真正落到 input 上的 :focus 在卡片里 ✓
    expect(source).toContain(':name-focused="focusIndex === index"')
    // 2026-10-12 老板："不要定位到输入框中"✗ → 新增后只滚动，不落光标 ✓
    expect(source).toContain('focusIndex.value = -1')
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
    // 2026-10-12 第一步：卡片模板搬去 VaccineRecordCard.vue 了 ✓ ——
    // 但**这一条盯的是行为**（删除键在卡片脸上、不用先展开 ✓），
    // 所以改成读卡片文件 ✓（判据一个字没放松 ✓）
    const card = readCard()
    expect(card).toContain('vaccine-card__header-actions')
    expect(card).toContain("@tap.stop=\"emit('remove', index)\"")

    // 删除必须在头部那一块里，而不是展开区里
    const headerAt = card.indexOf('vaccine-card__header-actions')
    const bodyAt = card.indexOf('vaccine-card__body"')
    expect(headerAt).toBeGreaterThan(-1)
    expect(bodyAt).toBeGreaterThan(headerAt)
    const headerBlock = card.slice(card.lastIndexOf('<view class="vaccine-card__header"', headerAt), bodyAt)
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
    /*
     * 2026-10-08：保存状态改成"常驻 + 按 id 高亮"。
     * 原来那行「已保存」闪 2 秒就没了，而且是按**下标**记的 ——
     * 保存完整表会重排，那句字可能闪在别的卡片上 ✗。
     */
    expect(source).toContain('function markSaved(recordId: string)')
    expect(source).toContain('saveStateLabel(record, index)')
    expect(source).toContain('还没保存 · 填完自动保存')
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

    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )
    expect(shared).toContain('if (draft.nextDueDate) {')
    expect(shared).toContain('payload.nextDueDate = draft.nextDueDate')
  })

  it('顶部那条"到期提醒"已经下线（2026-10-09 老板定）', () => {
    const source = readComponent()

    /*
     * 老板："如果鱼骨图可以提供足够的信息，那么记录板块顶部的那条按接种计划的
     *        这个提醒是不是也可以不要？" —— 可以不要：
     *   计划卡片收起时那一行写着「下一针 / 分类 / 窗口期」，
     *   展开后鱼头又写着"要打哪一类 + 常见的那几支"，
     *   这条横幅是第三遍说同一件事（老板的口径：提示文案要精炼）。
     */
    expect(source).not.toContain('dueSummaryText')
    expect(source).not.toContain('vaccine-due-banner')
    expect(source).not.toContain('daysUntil')
    // 卡片脸上也不再挂"还有 N 天到期"（2026-10-08 就去掉了）
    expect(source).not.toContain('vaccine-card__due')
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('识别出的接种记录带着当页原图（不再是写死的空数组）', () => {
    const source = readComponent()

    expect(source).toContain('attachments: attachmentList(draft)')
    expect(source).not.toContain('attachments: [],')
  })

  it('保存时把原图一起提交给后端', () => {
    const source = readComponent()

    // 2026-10-12：字段拼装在共用文件里 ✓；"附件是**记录级**的"这条规矩留在板块 ✓
    // （附件来自 record ✓，不是草稿 ✓）
    expect(source).toContain('attachmentList(record)')
    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )
    expect(shared).toContain('attachments,')
    // 保存那条路要把记录本身传进 buildPayload，否则拿不到附件
    expect(source).toContain('buildPayload(draft, record)')
  })

  it('原件改成**整本只展示一次**（2026-10-08 老板定）', () => {
    const source = readComponent()

    /*
     * 老板："往往疫苗本就只有 1~2 张，上面有很多条疫苗标签和记录，
     *        我们是否只展示一次报告原件的缩略图就可以了吗？"
     * → 不再挂在每条记录上（一本本子被十几条记录共用，等于同一张图重复十几遍），
     *   改成记录板块顶部去重后展示一次。
     */
    expect(source).toContain('const bookAttachments = computed(')
    expect(source).toContain('疫苗本原件 · {{ bookAttachments.length }} 张')
    expect(source).toContain('@tap="previewAttachment(item)"')
    // 每条卡片上不再有那一块
    expect(source).not.toContain('v-if="attachmentList(record).length > 0"')
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
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

    // 2026-10-12 第一步：勾病种的界面搬去 VaccineRecordCard.vue 了 ✓ ——
    // 这两条盯的是**顾客能多选**这件事 ✓，所以改读卡片 ✓（判据没放松 ✓）
    const card = readCard()
    expect(card).toContain('function closeKindPicker()')
    // 2026-10-12 老板：不要「选好了」按钮 ✗（点字段名那一行即可展开/收起 ✓）
    // 只看**用法**（函数本身还留着，不算 ✗）
    expect(card.includes('@tap="closeKindPicker(')).toBe(false)
    // 提示里得写明可多选（组合苗要勾好几个病种）
    expect(card).toContain('可多选')
    // 父组件这一侧留着的仍是那个"按类别多选"的遗留函数 ✓（记着"不能退回单选" ✓）
    expect(source).toContain('function toggleKind')
  })

  it('组合苗的多分类仍然成立（从产品库选时自动带出）', () => {
    const source = readComponent()

    // 单选只针对"顾客手动指定"这一条路；
    // 选产品时分类按真实成分带出来（卫佳捌 = 核心 + 钩端），不能被单选逻辑吃掉
    // 2026-10-12 第一步：从产品库选那一行在卡片里 ✓
    expect(readCard()).toContain('draft.value.kinds = [...product.kinds]')
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  /**
   * 问题4 的根因：产品库下发的规范名是「宠必威幼犬保」（没有 ®），
   * 而疫苗本识别出来的是「宠必威® 幼犬保」。原来用 `===` 比，比不中 →
   * 名称那一行退回显示"从产品库选择"占位提示，
   * 识别出来的名字只能留在下面的手填输入框里。
   */
  it('🔴 产品名比对前先归一化，® 和空格不影响认不认得出', () => {
    // 2026-10-12 第一步：认产品库那一套搬去卡片了 ✓；这一份归一化
    // 父组件也还留着一份 ✓（扫描去重要拿它比名字 ✓）—— 两处一起盯 ✓
    const source = readCard()
    const parent = readComponent()
    // 2026-10-12：这套规则**只有一份**了 ✓（原来两边各一份 ✗）
    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )

    expect(shared).toContain('export function normalizeProductName(')
    // 与后端 normalizeProductText 同一套规则，缺一不可
    expect(shared).toContain(".replace(/[®™©]/g, '')")
    // 两个文件都必须**真的在用它**、不许再各抄一份 ✗
    for (const file of [source, parent]) {
      expect(file).toContain('normalizeProductName')
      expect(file).not.toContain('function normalizeProductName(')
    }
    expect(source).toContain('findCatalogProduct(')
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

    const card = readCard()
    expect(card).toContain('function nameFieldLabel(')
    expect(card).toContain('if (matched) return matched.name')
  })

  it('🔴 认不出：这一行只写"去库里挑一支"，不再把同一个名字显示两遍', () => {
    const source = readComponent()

    const card = readCard()
    expect(card).toContain("'＋ 从产品库选一支'")
    // 名字本身只在手填框里出现（:value 绑的是 draft.vaccineName）
    expect(card).toContain(':value="draft.vaccineName"')
    // 旧的"名称行直接显示原文"的写法（会和输入框重复）已经下线
    expect(source).not.toContain("return String(name || '').trim()")
  })

  it('🔴 手填输入框只在产品库里没有这只苗时才出现', () => {
    const source = readComponent()

    // 老板的规格："如果 AI 识别的疫苗名称没有在产品库中，
    // 才显示这个输入框吧？"
    const card = readCard()
    expect(card).toContain('function showManualNameInput(')
    expect(card).toContain('<template v-if="showManualNameInput()">')
    // 正打字的那一行不能把输入框抽走（打到一半刚好命中产品库会当场消失）
    expect(card).toContain('if (props.nameFocused) return true')
  })

  it('🔴 确认的结果留在卡片上，不再是"闪一下就没"', () => {
    const source = readComponent()

    // 老板："点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
    const card = readCard()
    expect(card).toContain('const confirmResult = ref<')
    expect(card).toContain("class=\"vaccine-confirm-result\"")
    expect(card).toContain('setConfirmResult(')
    // 成功和认不出两种结果都要说清楚
    expect(card).toContain('已确认：')
    expect(card).toContain('产品库和 AI 都没认出这支苗')
  })

  it('🔴 后台刷新不许把已经显示出来的记录先擦掉（"屏幕闪烁"的来源）', () => {
    const source = readComponent()

    // 每次自动保存（点分类、点确认、改日期）都会整表重载，
    // 而占位原来是 `v-if="loading"` —— 整个列表先消失再长回来。
    // 2026-10-10：加载失败提示插到了骨架前面，这里跟着变成 v-else-if ——
    // 守的还是同一件事：**后台刷新不许把已经显示出来的记录擦掉** ✓
    expect(source).toContain('v-else-if="loading && records.length === 0"')
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('🔴 识别结果填表时优先用 productName', () => {
    const source = readComponent()

    expect(source).toContain("vaccineName: String(draft.productName || draft.vaccineName || ''),")
  })

  it('🔴 点「确认」时也用后端给的规范名，并把名字对齐', () => {
    const source = readComponent()

    const card = readCard()
    expect(card).toContain("const canonicalName = String(res.data.productName || '')")
    expect(card).toContain('draft.value.vaccineName = canonicalName')
    // 后端没给才退回前端这份比对
    expect(card).toContain('canonicalName ? { name: canonicalName } : findCatalogProduct(props.catalogProducts, name)')
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('三种状态：还没写 / 库里有 / 库里没有', () => {
    const source = readCard()

    expect(source).toContain(
      "function nameFieldMode(name: string): 'empty' | 'recognized' | 'unknown'",
    )
    expect(source).toContain("if (!String(name || '').trim()) return 'empty'")
    expect(source).toContain("return isNameRecognized(name) ? 'recognized' : 'unknown'")
  })

  it('🔴 库里没有的产品：不给"从产品库挑一支"的入口', () => {
    const source = readCard()

    // 老板："对于宠派纯这类产品库中没有的产品……也不让用户可以点击
    // 从产品库中挑选产品的弹窗呢？因为这没有意义嘛，对吧？"
    expect(source).toContain(
      "v-if=\"catalogProducts.length > 0 && nameFieldMode(draft.vaccineName) !== 'unknown'\"",
    )
  })

  it('库里没有时要说清楚，并且名字仍然能写', () => {
    const source = readCard()

    expect(source).toContain('产品库里没有这支苗 —— 已按你写的名字记录')
    expect(source).toContain("nameFieldMode(draft.vaccineName) === 'unknown'")
  })

  /**
   * 老板："我看在卫佳8的记录下，疫苗名称下面还需要点确认按钮，它才会弹
   * 已确认卫佳8归为核心疫苗加钩端螺旋体的提醒。是需要点点击确认按钮才会
   * 归类吗？还是说不需要点其实已经归类了？"
   * —— 早就归类了。所以别再摆一个按钮让人以为"必须点一下"。
   */
  it('🔴 分类已经有了、名字也认得 → 不再显示「确认」按钮', () => {
    const source = readCard()

    expect(source).toContain('function showConfirmButton(): boolean')
    expect(source).toContain('if (draft.value.kinds.length === 0) return true')
    expect(source).toContain("return nameFieldMode(draft.value.vaccineName) === 'unknown'")
    expect(source).toContain('v-if="showConfirmButton()"')
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
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('🔴 识别草稿把候选带进来', () => {
    const source = readComponent()

    expect(source).toContain('nameSuggestions: Array.isArray(draft.nameSuggestions)')
    // 草稿的形状两个文件共用一份（2026-10-12 抽卡片时提出来的 ✓）
    const types = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )
    expect(types).toContain('nameSuggestions?: string[]')
  })

  it('🔴 认出没把握时，明说"这行字可能没读全"并列出候选', () => {
    const source = readCard()

    // 老板："如果不能完全有把握的识别出来，能不能诚实的告诉用户呢？"
    expect(source).toContain('这行字可能没读全')
    expect(source).toContain('(record.nameSuggestions || []).length > 0')
    expect(source).toContain('@tap="applySuggestedProduct(suggestion)"')
  })

  it('点候选 = 用那一支（名字和分类一起带对），用过就不再提示', () => {
    const source = readCard()

    expect(source).toContain('function applySuggestedProduct(name: string)')
    expect(source).toContain('applyCatalogProduct(at)')
    expect(source).toContain('props.record.nameSuggestions = []')
  })

  it('点「确认」时也刷新候选（认出来了就清空）', () => {
    const source = readCard()

    expect(source).toContain('if (Array.isArray(res.data.nameSuggestions))')
    expect(source).toContain('props.record.nameSuggestions = res.data.nameSuggestions.map(String)')
  })
})

/**
 * 整本重拍不重复记 + 识别弹层说清"匹配到哪一支"（2026-10-06 老板两问）。
 */
describe('扫描去重 + 匹配说明（2026-10-06）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  /**
   * 老板："如果我疫苗本上多贴了一个最新接种的疫苗的标签，但是我拍照拍的还是
   * 整本疫苗本，那 AI 会把这单独的一个新增的接种记录识别出来，
   * 而不会重复记录吗？"
   *
   * 查下来**当时是会的** —— AI 把整本读出来（对的），但保存那一步一条不落地
   * 全存，已经记过的会被再存一遍。
   */
  it('🔴 同一天、同一支苗已经记过的，扫描时跳过', () => {
    const source = readComponent()

    expect(source).toContain('function isAlreadyRecorded(name: string, date: string): boolean')
    // 只跟**已保存的**记录比（有 id 的），否则同批里刚识别的会挡掉自己
    expect(source).toContain('if (!record.id) return false')
    // 名字归一化后比（瓶签原文与规范名要能对上）
    expect(source).toContain("normalizeProductName(record.vaccineName || '')")
    expect(source).toContain('if (isAlreadyRecorded(scannedName, scannedDate)) {')
  })

  it('🔴 跳过了几条必须说出来（不吭声会被当成丢数据）', () => {
    const source = readComponent()

    expect(source).toContain('const scanNotice = ref(')
    expect(source).toContain('其中 ${skipped} 条已经记过')
    expect(source).toContain('records-card__notice')
  })

  /**
   * 老板："AI 识别的结果中，产品标签名称还是没有识别完整。但是我点击确认
   * 按钮之后，发现记录中识别的是准确的匹配到了卫佳捌。这是什么问题呢？"
   *
   * 不是问题，是两步：弹层显示的是"本子上怎么写的"（原文），
   * 落库用的是"我们认成了哪一支"（规范名）。但两者不一样时不解释一句，
   * 顾客会以为是错的。
   */
  it('🔴 匹配到产品库时，识别弹层要补一行说明', () => {
    const source = readScan()

    expect(source).toContain("push('匹配产品库', matched)")
    expect(source).toContain("if (matched && matched !== String(draft.vaccineName || '').trim())")
  })
})

/**
 * 接种日期不能晚于今天（2026-10-07 老板审计时定）。
 *
 * 为什么必须拦：计划算法是"有记录就算这一针打过了"。一条日期填到未来的
 * 记录会把"还没打的针"标成已完成、提醒随之消失。实测（当天 2026-06-01）：
 * 接种日填成 2026-12-01，「狂犬疫苗 首针」就变成已完成。
 *
 * 手填那条路已经用日期选择器的 :end 挡住（选不到未来）；
 * 但 **AI 识别出来的日期不走选择器** —— 疫苗本上的年份读错（2024 → 2042）
 * 时必须在保存前统一拦一道，而且要把话说在**卡片上**，
 * 不能只弹 2 秒 toast（一次识别好几条时顾客不知道是哪一行）。
 */
describe('接种日期不能晚于今天（2026-10-07）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('自动保存前统一拦：晚于今天的日期不保存，并在卡片上说清楚', () => {
    const source = readComponent()

    // 手填和 AI 识别两条路都走 autoSaveBlockReason
    expect(source).toContain('function autoSaveBlockReason')
    expect(source).toContain("if (draft.vaccinationDate > getTodayDateString()) return '接种日期不能晚于今天'")
  })

  it('手填：日期选择器不让选未来', () => {
    const source = readCard()

    expect(source).toContain(':end="getTodayDateString()"')
  })

  it('🔴 后端拒绝的原因也留在卡片上，不是只弹一下', () => {
    const source = readComponent()

    // catch 里必须往 autoSaveNotices 写一条，否则顾客不知道哪一行没存上
    expect(source).toContain('autoSaveNotices.value = { ...autoSaveNotices.value, [index]: message }')
  })

  it('提示文案要短 —— 老板 2026-10-07："太啰嗦了"', () => {
    const source = readComponent()

    // 只留一句"接种日期不能晚于今天"，后面那句"还没打的针请等打完再记录"去掉
    expect(source).not.toContain('接种日期不能晚于今天 ——')
  })
})

/**
 * 顶部"到期提醒"改成**系统按程序自动算**（2026-10-07 老板定）。
 *
 * 原来它只看每条记录上人工填的「下次到期日」：顾客不填就没有提醒，
 * 填错了还会误导。现在优先用计划算出来的"每一类的下一针"，
 * 人工填的那个仍然保留，但明确标成"疫苗本上写的"，两种日期不混着说。
 */
describe('到期提醒 · 用系统推算的那一份（2026-10-07）', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('提醒条下线之后，`planPending` 仍然喂给整批回执那句"下一次是 X"', () => {
    const source = readSection()

    // 常驻横幅没了，但"存完那一次"的回执还在用它 —— 两件事，别一起删错
    expect(source).toContain('planPending')
    expect(source).toContain('按接种计划，下一次是')
    expect(source).not.toContain('按接种计划：')
  })

  it('页面把计划报上来的数据转给记录板块', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('@pending-changed')
    expect(page).toContain(':plan-pending="vaccinePlanPending"')
  })

  it('计划卡片会把"每一类的下一针"报上去', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    expect(section).toContain("emit(\n      'pending-changed',")
  })
})

/**
 * 存完整批回执（2026-10-08 老板要的）。
 *
 * 为什么要它：这一批是**逐条存**的 —— 存成功只在卡片上闪 2 秒「已保存」，
 * 存不下只在卡片上挂一句话，家长**不知道"8 条里到底进去了几条"** ✗
 * （他自己就问过："我刚才那 8 条都进去了吗？"）
 */
describe('存完整批回执（2026-10-08）', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('回执说清：存了几条、跳过几条、还差几条', () => {
    const source = readSection()

    expect(source).toContain('const scanReceipt = ref<{')
    expect(source).toContain('这批记好了：存了 {{ scanReceipt.saved }} 条')
    expect(source).toContain('还差信息没存上')
    expect(source).toContain('dismissScanReceipt')
  })

  it('回执里的"下一次"用计划算出来的那一针（不是人工填的到期日）', () => {
    const source = readSection()

    expect(source).toContain('nextLabel')
    expect(source).toContain('props.planPending')
    expect(source).toContain('按接种计划，下一次是')
  })
})

/**
 * 记录卡片的信息取舍（2026-10-08 老板审计第 4 块）
 */
describe('记录卡片 · 少挂重复信息（2026-10-08）', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('卡片脸上不再显示到期提示（老板："每条卡片不显示到期提示"）', () => {
    const source = readCard()

    expect(source).not.toContain('{{ dueHint(draft) }}')
    expect(source).toContain('到期提示**不在卡片脸上显示**')
  })

  it('展开后的字段顺序跟确认页一致：名字 → 日期 → 病种', () => {
    const source = readCard()

    const name = source.indexOf('<text class="field-label">疫苗名称</text>')
    const date = source.indexOf('<text class="field-label">接种日期</text>')
    // 2026-10-12 文案改了 ✓：含哪些病种 → 含哪些疫苗（可多选）
    const components = source.indexOf('<text class="field-label">含哪些疫苗（可多选）</text>')

    expect(name).toBeGreaterThan(0)
    expect(date).toBeGreaterThan(name)
    expect(components).toBeGreaterThan(date)
  })
})

/**
 * 安全默认值：没核对过的记录不算进计划（2026-10-09 老板定）
 *
 * 老板："疫苗接种是会影响狗狗安全的，如果我们就这么草率地上生产的话，合适吗？"
 * —— 两个方向的后果不对称：
 *   · 错算成"没打" → 多提醒一次 ✓
 *   · 错算成"打了" → **狗真的漏打** ✗✗（狂犬还是法定强制免疫）
 * 所以：识别出来且我们有理由怀疑的那一针（品牌对不上 / 复核读到不一样的字 / 狂犬），
 * 在顾客点「我已对照本子核对」之前**不算数** ✓ —— 计划该提醒的继续提醒 ✓。
 */
describe('安全默认值 · 待核对（2026-10-09）', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
  /** 徽标与「一键核对」都在卡片上（2026-10-12 第一步 ✓）*/
  const readCard = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('识别出来的记录：三种可疑情况先标成"待核对"', () => {
    const source = readSection()

    expect(source).toContain('productVerified: !(')
    expect(source).toContain('draft.brandCheck?.conflict === true')
    expect(source).toContain("draft.productReview?.consistent === false")
    expect(source).toContain(".includes('rabies')")
  })

  it('卡片上有「待核对」徽标 + 说明 + 一键核对', () => {
    const source = readCard()

    expect(source).toContain('class="vaccine-card__pending"')
    expect(source).toContain('这一针先没算进接种计划')
    expect(source).toContain('我已对照本子核对')
    expect(source).toContain('function confirmVerified()')
  })

  it('提交时带上这个标记（创建与更新都要落）', () => {
    const source = readSection()

    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )
    expect(shared).toContain('productVerified: draft.productVerified !== false')
  })
})

/**
 * 「待核对」按原因给不同的话（2026-10-09 老板实测）
 *
 * 老板："02 号和 04 号照片中，我发现模型可能会把疫苗的生产日期或者其他日期
 *        识别成注射日期。并且 04 号照片中，还会识别出不存在的日期。"
 * —— 这时候要说"日期可疑" ✓，而不是笼统说"可能把贴纸认成了另一支苗" ✗。
 */
describe('待核对 · 按原因说不同的话（2026-10-09）', () => {
  // 2026-10-12 第一步：按原因说这些话的是**卡片** ✓
  const section = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
      'utf-8',
    )

  it('日期可疑（本子上没写 / 与复核不一致）时说日期', () => {
    const source = section()

    expect(source).toContain("dateReview === 'missing'")
    expect(source).toContain('本子上好像没写注射日期')
    expect(source).toContain("dateReview === 'differs'")
    expect(source).toContain('日期我们和复核读得不一样')
  })

  it('其它原因照旧说名字（不把所有情况都说成日期）', () => {
    const source = section()

    expect(source).toContain('可能把贴纸认成了另一支苗')
  })
})

/**
 * 记录"没加载出来"必须看得见（2026-10-10 老板报的）
 *
 * 老板截图："计划下方没有任何的记录。" —— 接口其实有 3 条 ✓，
 * 而失败时只弹了一句会消失的 toast ✗，界面上就剩一张空卡 ✗，
 * 看起来和"本来就没有记录"一模一样 ✗。
 */
describe('接种记录 · 加载失败要看得见（2026-10-10）', () => {
  const section = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('失败时留一句常驻的话 + 一个能点的重试（不是一闪而过的 toast）', () => {
    const source = section()

    expect(source).toContain("const loadError = ref('')")
    expect(source).toContain('接种记录没加载出来')
    expect(source).toContain('@tap="loadRecords()"')
    expect(source).toContain('loadError.value = String(error?.message')
  })

  it('失败提示排在"空态"前面（别让失败长得像没有记录）', () => {
    const source = section()

    const failIndex = source.indexOf('v-if="loadError && records.length === 0"')
    const emptyIndex = source.indexOf('v-else-if="records.length === 0"')
    expect(failIndex).toBeGreaterThan(0)
    expect(emptyIndex).toBeGreaterThan(failIndex)
  })
})

/**
 * ⚠️ 钉死这个 bug（2026-10-11，害了两天）：**别名先用了、后定义** ✗
 *
 * 症状：记录板块**整块不渲染、一次请求都不发** ✗
 * （老板："计划下方没有任何记录" ✓；生产日志里连 /vaccines 请求都没有 ✗）。
 * 根因：`const today = getTodayDateString()` 写在了
 * `const getTodayDateString = todayDateText` **上面** ✗ ——
 * const 在初始化前是 undefined ✓ → setup 抛 "not a function" ✗
 * → 板块"半死不活"（模板在、数据全空）✗。
 *
 * 小程序里 setup 抛错就是这个样子 ✗ —— 所以顺序类错误必须钉住 ✓。
 */
describe('记录板块 · 别名必须定义在使用之前（2026-10-11）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('getTodayDateString 的定义在脚本里所有使用点之前（模板里的调用不算 ✗）', () => {
    const text = source()
    // 只看 <script> 之后：模板里的调用发生在渲染期 ✓，不受 const 顺序影响 ✓
    const script = text.slice(text.indexOf('<script'))
    // 定义必须紧挨在这次顶层调用之前 ✓（真正会出事的就是这种"先用了后定义" ✗）
    expect(
      /const getTodayDateString = todayDateText\s*\n\s*const today = getTodayDateString\(\)/.test(script),
    ).toBe(true)
  })
})

/**
 * ⚠️ 同类错误的通用守卫（2026-10-11）：**用了却没导入 / 先用了后定义** ✗
 *
 * 这两天连着栽了三次（`watch` 没导入 ✗、`todayDateText` 没导入 ✗、
 * `getTodayDateString` 先用了后定义 ✗）—— 症状全是同一个：
 * **板块整块不渲染、请求一个不发、界面半死不活** ✗，
 * 而错误只躺在小程序控制台里 ✓（看服务端日志只能看到"请求没发" ✗）。
 */
describe('记录板块 · 导入与定义顺序的通用守卫（2026-10-11）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('用到的外部工具函数都导入了（todayDateText / watch / onMounted …）', () => {
    const text = source()
    const pairs: [string, string][] = [
      ['todayDateText', "from '../../utils/date'"],
      ['watch', "from 'vue'"],
      ['onMounted', "from 'vue'"],
    ]
    for (const [name, importFrom] of pairs) {
      if (!new RegExp(`\\b${name}\\b`).test(text)) continue
      const importBlock = text.slice(0, text.indexOf('<script') + 4000)
      expect(`${name} → ${importBlock.includes(importFrom) ? 'ok' : 'missing'}`).toBe(`${name} → ok`)
    }
  })
})

/**
 * 记录板块 ←→ 编辑卡 的**接线**（2026-10-12 第一步）。
 *
 * ── 为什么要专门守这条 ──────────────────────────────────────────────
 *
 * 第一步把"一条记录的编辑卡"抽成了 VaccineRecordCard.vue ✓，
 * 两边的约定是 **props 往下、emits 往上** ✓。这类"跨文件接线"错起来
 * 全都不会在构建期报错 ✗：
 *   · 属性名写错（`:expanded` 写成 `:expand`）→ 卡片永远收着 ✓，看着像"点不开" ✗
 *   · 事件名写错（`@name-blur` 写成 `@blur`）→ 输入框的焦点标记再也清不掉 ✓
 *   · 父组件忘了接某个 emit → 卡片按钮点了没反应 ✓
 * **真机才会发现** ✗，而且第一眼很像"数据没加载出来" ✓。
 *
 * 所以：把"父组件用到的"和"卡片声明的"对一遍 ✓，差集不为空就在本地红 ✓。
 * 判据故意写得很宽（只比名字集合 ✓），因为它要挡的是**名字对不上**这一类 ✓。
 */
/**
 * 「从产品库选一支」之后，**刚设好的归类不许被自己清掉**（2026-10-13 老板问出来的）。
 *
 * 老板原话："在选择了产品库中的某一个产品之后，疫苗名称字段下方会出现一个确认按钮。
 *            这里为什么会出现一个确认按钮呢？"
 * —— 因为选产品的流程是"① 先设归类 → ② 再报名字变更"，
 *    而"名字变更"原来**无条件**把归类清空 ✗ → 界面以为"还没归类" → 冒出「确认」✗。
 */
describe('选产品之后归类不许被清掉（2026-10-13 老板第 6 条）', () => {
  const section = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('名字**真的变了**才把归类作废（两处都要）', () => {
    const source = section()

    // 列表那张卡的路径
    expect(source).toContain("if (field === 'vaccineName' && changed) {")
    // 计划卡下面那张新建卡的路径
    expect(source).toContain('if (field === \'vaccineName\' && changed) {')
    // 无条件清空那版必须已经不在
    expect(source).not.toContain(`if (field === 'vaccineName') {
    draft.kindsManual = false
    draft.kinds = []`)
  })

  it('保存路径两处一致：同一个载荷构造 + 同一个接口', () => {
    const source = section()

    // 两处都用 buildPayload（它再委托给共用的 buildVaccinePayload）
    expect((source.match(/buildPayload\(draft, record\)/g) || []).length).toBeGreaterThanOrEqual(2)
    // 校验也一致：名字 + 日期
    expect((source.match(/请填写疫苗名称/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((source.match(/请选择接种日期/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('记录板块 ↔ 编辑卡 · 接线对得上（2026-10-12 第一步）', () => {
  const stripComments = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

  const readRaw = (name: string) =>
    readFileSync(resolve(process.cwd(), `src/components/dog-profile/${name}`), 'utf-8')

  const templateOf = (text: string) =>
    text.slice(text.indexOf('<template>'), text.indexOf('</template>'))

  const scriptOf = (text: string) =>
    text.slice(text.indexOf('<script setup'), text.indexOf('</script>'))

  /** kebab-case → camelCase（Vue 模板里两种写法都合法 ✓）*/
  const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

  /**
   * Vue 自己吃掉的属性，不算卡片的 props ✓。
   * `:key` / `:class` / `:style` / `ref` 这些由框架处理，卡片声明不到它们 ✓。
   */
  const VUE_BUILTIN_ATTRS = new Set([
    'key',
    'class',
    'style',
    'ref',
    'is',
    'slot',
    'modelValue',
  ])

  /** 父组件写在 <VaccineRecordCard … /> 上的属性与事件 */
  /**
   * 模板里**所有**用到 `<VaccineRecordCard>` 的地方 ✓。
   *
   * ⚠️ 第一版只取了**第一个** ✗ —— 2026-10-12 加第三张卡（计划卡下面那张新建卡 ✓）
   *    的时候，它排在了列表那张**前面** ✓，于是一整组断言全都在检查新卡 ✗、
   *    列表那张反而没人看了 ✓（"看着还在跑，其实看错了对象" ✗）。
   *    现在把每一处都收进来 ✓：每一处都要对得上 ✓，接口约定的四个事件
   *    **至少有一处**接上（列表那张 ✓）。
   */
  function usagesInSection() {
    const tpl = templateOf(readRaw('VaccineManagementSection.vue'))
    const blocks: string[] = []
    const openRe = /<VaccineRecordCard/g
    let m: RegExpExecArray | null
    while ((m = openRe.exec(tpl)) !== null) {
      const rest = tpl.slice(m.index)
      const end = rest.indexOf('/>')
      blocks.push(end >= 0 ? rest.slice(0, end) : rest)
    }

    const props: string[] = []
    const events: string[] = []
    for (const block of blocks) {
      for (const hit of block.matchAll(/([:@])([a-zA-Z][\w-]*)\s*=/g)) {
        const [, sigil, name] = hit
        if (sigil === ':') {
          if (!VUE_BUILTIN_ATTRS.has(name)) props.push(camel(name))
        } else {
          events.push(camel(name))
        }
      }
    }
    return { props, events, blocks, block: blocks[0] || '' }
  }

  /** 卡片声明了哪些 props（defineProps 里的一级字段 ✓）*/
  function declaredProps(): string[] {
    const script = scriptOf(readRaw('VaccineRecordCard.vue'))
    const start = script.indexOf('defineProps<{')
    expect(start, '卡片里找不到 defineProps<{').toBeGreaterThan(-1)
    // 括号配平，取出 defineProps 的泛型块
    let depth = 0
    let end = -1
    for (let i = script.indexOf('{', start); i < script.length; i += 1) {
      if (script[i] === '{') depth += 1
      else if (script[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    expect(end, 'defineProps 的泛型块没配平').toBeGreaterThan(-1)
    const body = script.slice(start, end)
    // 只认"行首缩进 + 名字 + ?/:" —— 那才是 props 本身，
    // 对象类型里的字段（kinds / components …）缩进更深 ✓ 不会误判 ✓
    const found: string[] = []
    for (const line of body.split('\n')) {
      const m = line.match(/^ {4}([a-zA-Z][\w]*)\??\s*:/)
      if (m) found.push(m[1])
    }
    return found
  }

  /** 卡片声明了哪些 emit */
  function declaredEmits(): string[] {
    const script = scriptOf(readRaw('VaccineRecordCard.vue'))
    const found: string[] = []
    for (const hit of script.matchAll(/\(event:\s*'([\w-]+)'/g)) {
      found.push(camel(hit[1]))
    }
    return found
  }

  it('卡片确实声明了一批 props / emits（防止解析写错导致这条空转）', () => {
    // 接口是老板点名要求的四个 + 一堆显示状态 ✓
    for (const name of ['record', 'index', 'draft', 'toggleLabel']) {
      expect(declaredProps()).toContain(name)
    }
    for (const name of ['update', 'remove', 'toggle', 'save', 'nameBlur']) {
      expect(declaredEmits()).toContain(name)
    }
  })

  it('🔴 父组件用了的属性和事件，卡片都声明了（名字对不上就在本地红）', () => {
    const { props, events } = usagesInSection()
    const known = new Set(declaredProps())
    const knownEvents = new Set(declaredEmits())

    // 自检：真的从模板里读到了东西（否则下面的差集必然为空 ✓ 等于白测 ✗）
    expect(props.length).toBeGreaterThanOrEqual(10)
    expect(events.length).toBeGreaterThanOrEqual(5)

    const propProblems = props.filter((name) => !known.has(name))
    const eventProblems = events.filter((name) => !knownEvents.has(name))

    expect({ propProblems, eventProblems }).toEqual({ propProblems: [], eventProblems: [] })
  })

  it('🔴 接口那四个 emit 父组件一个都没漏接（漏了就是"点了没反应"）', () => {
    const { events } = usagesInSection()

    for (const name of ['update', 'remove', 'toggle', 'save']) {
      expect(events).toContain(name)
    }
  })

  it('🔴 展开由父组件说了算：卡片拿的是 :expanded，不是让自己的下标', () => {
    const { props, blocks } = usagesInSection()

    // 一次只展开一条 ✓ —— 这是**列表级**的状态 ✓，留在这里 ✓
    expect(props).toContain('toggleLabel')
    /*
     * 列表那一处：**收起的判定**由父组件按行算 ✓ ——
     * ⚠️ 传的是字符串 `'collapse'`，不是布尔 ✗（这条通道上 false 会被当成"没传"丢掉，
     *    老板两次截图报的"输入项不全"就是它）。不传 = 展开。
     */
    /*
     * ⚠️ 传的是**字符串文案**（'收起' / '展开'），不是布尔 ✗ ——
     * 这条 props 通道上布尔不可靠（false 被当成"没传"丢掉、Boolean 又强制成 false），
     * 老板三次截图报的"输入项不全"根因就是这个。
     */
    expect(
      blocks.some((b) => b.includes(':toggle-label="expandedIndex === index ? \'收起\' : \'展开\'"')),
    ).toBe(true)
    // 列表容器（不是卡片）仍然负责一条条排出来
    expect(templateOf(readRaw('VaccineManagementSection.vue'))).toContain(
      'v-for="(record, index) in records"',
    )
  })

  it('草稿仍然由父组件持有（校验与自动保存要看得见顾客在打什么字）', () => {
    const { props, blocks } = usagesInSection()

    expect(props).toContain('draft')
    expect(blocks.some((b) => b.includes(':draft="draftOf(record, index)"'))).toBe(true)
    // 父组件这边还得有那份草稿仓库与三个列表级的能力
    const section = readRaw('VaccineManagementSection.vue')
    for (const anchor of ['const drafts = reactive', 'function draftOf(', 'function updateDraft(']) {
      expect(section).toContain(anchor)
    }
  })

  it('接口约定的四个事件各自接到了列表级的实现上', () => {
    const { blocks } = usagesInSection()

    // 每一条都要落到真的会干活的函数上 ✓（不是接了个空壳 ✓）
    /*
     * ⚠️ 这五条是**列表那一处**的接法 ✓（新增卡那处接的是另一套 ✓）——
     *    所以判据是"**有一处**这么接" ✓，不是"每一处都这么接" ✗。
     */
    for (const handler of [
      '@update="updateDraft"',
      '@toggle="toggleExpandedByIndex"',
      '@save="saveRecordByIndex"',
      '@remove="removeRecordByIndex"',
      '@name-blur="clearFocus"',
    ]) {
      expect(blocks.some((b) => b.includes(handler))).toBe(true)
    }
    // 这些实现就在父组件里 ✓
    const section = stripComments(readRaw('VaccineManagementSection.vue'))
    for (const fn of [
      'function toggleExpandedByIndex(',
      'function saveRecordByIndex(',
      'function removeRecordByIndex(',
      'function clearFocus(',
    ]) {
      expect(section).toContain(fn)
    }
  })
})
