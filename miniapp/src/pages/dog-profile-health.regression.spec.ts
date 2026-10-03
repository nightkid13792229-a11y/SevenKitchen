import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog profile health page regressions', () => {
  function functionSource(source: string, startMarker: string, endMarker: string) {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('supports opening health records from the home tools without a dogId parameter', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    // 2026-09-30：选择器并进 Banner 的名称行（不再单开一张"选择狗狗"卡片）
    expect(source).toContain('mode="selector"')
    expect(source).toContain(':range="dogs"')
    expect(source).toContain('@change="onDogPickerChange"')
    expect(source).toContain('hero-card__name-row')

    // 2026-10-01 老板调整 Banner：
    //   · 删掉「健康管理」小标题与名字下方那句说明文字
    //   · 名字左边加头像、右边加年龄/性别/品种/体重四项
    expect(source).not.toContain('hero-card__eyebrow')
    expect(source).not.toContain('hero-card__subtitle')
    expect(source).not.toContain('集中维护病史、体检、过敏、疫苗、体重记录和饮食偏好')
    expect(source).toContain('class="hero-card__avatar"')
    expect(source).toContain(':src="dogAvatarSrc"')
    expect(source).toContain('v-for="fact in heroFacts"')
    expect(source).toContain("{{ fact.label }}")
    expect(source).toContain("{{ fact.value }}")
    expect(source).toContain('buildHealthHeroFacts(form)')

    // 2026-10-01 二次调整：
    //   · 「就诊前摘要」整块删除（老板：不需要给医生看摘要）
    //   · 「健康时间线」入口改名「健康记录」
    //   · 两个入口（健康记录 / 健康分析）搬到狗狗信息 Banner 下方、
    //     五个板块那张卡**之外**，并用颜色区分、小字换行在标题下方
    expect(source).not.toContain('就诊前摘要')
    expect(source).not.toContain('goVisitSummary')
    expect(source).not.toContain('health-shortcuts')
    expect(source).toContain('class="health-entries"')
    expect(source).toContain('health-entry--records')
    expect(source).toContain('health-entry--analysis')
    expect(source).toContain('class="health-entry__title">健康记录<')
    expect(source).toContain('class="health-entry__title">健康分析<')
    expect(source).toContain('class="health-entry__hint">{{ visitShortcutHint }}<')
    expect(source).toContain('7 项初步分析')

    // 老板要"一行放两个"：四项排成 2×2（年龄 性别 / 品种 体重）。
    // 用 flex-wrap + 百分比列宽实现（小程序的 WXSS 对 grid 支持不齐），
    // 第一列放 年龄/品种（品种名可能很长），第二列放 性别/体重。
    expect(source).toContain('flex-wrap: wrap')
    expect(source).toContain('width: 56%')
    expect(source).toContain('.hero-card__fact:nth-child(2n)')
    expect(source).toContain('resolveDogAvatarSrc(form.avatarUrl)')
    expect(source).toContain("form.avatarUrl = profile.avatarUrl || ''")
    // 下方那张独立的「选择狗狗」卡片已删除。
    // 注意别用宽泛的 '选择狗狗' —— 空态里的「先选择狗狗」也含这四个字。
    expect(source).not.toContain('dog-picker-card')
    expect(source).not.toContain('class="section-card__title">选择狗狗<')
    expect(source).toContain('const dogs = ref<DogProfileSummary[]>([])')
    expect(source).toContain("async function loadDogs(preferredDogId = '')")
    expect(source).toContain('function selectDogByIndex(index: number)')
    expect(source).toContain('loadDogs()')
    expect(source).toContain("dog_profile_step_viewed")
  })

  it('hides health record editors while a selected dog profile is loading', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const isProfileLoading = ref(false)')
    expect(source).toContain('<template v-else-if="dogId">')
    expect(source).toContain('v-if="isProfileLoading"')
    // 2026-09-30：底部主按钮改为按书签自适应，禁用条件也跟着走
    // 2026-10-03：底部保存键下线，改实时保存（这里锁"它真的没了 + 自动落库接上了"）
    expect(source).not.toContain('stickyPrimaryDisabled')
    expect(source).not.toContain("const stickyPrimaryText = computed(() => '保存')")
    expect(source).toContain('flushActiveTabAutoSaves')
  })

  it('切狗时只看记录草稿（饮食偏好已不在本页）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('if (hasUnsavedRecordDraft.value) {')
    expect(source).not.toContain('hasUnsavedDietReminder')
  })

  it('uses requested dog ids to discard stale health profile responses', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const latestRequestedDogId = ref(\'\')')
    expect(source).toContain('async function loadDogProfile(requestedDogId: string)')
    expect(source).toContain('shouldDiscardDogHealthProfileResponse({')
    expect(source).toContain('populateForm(res.data.profile)')
    expect(source).toContain('loadAllHealthRecordLists(requestedDogId)')
  })

  it('shows a real empty-dog state instead of treating no dogs as load failure', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const hasNoDogs = ref(false)')
    expect(source).toContain('v-else-if="hasNoDogs"')
    expect(source).not.toContain("loadError.value = '还没有狗狗档案，请先创建档案。'")
  })

  it('uses segmented health record CRUD endpoints instead of profile-array persistence', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain(':active-type="activeRecordType"')
    expect(source).toContain(':records="activeRecordList"')
    expect(source).toContain(':loading="activeRecordLoading"')
    expect(source).toContain(':saving-record-key="savingRecordKey"')
    // 2026-09-30：底部主按钮改为按书签自适应，禁用条件也跟着走
    expect(source).toContain(':primary-disabled="isSecondaryActionDisabled"')
    expect(source).toContain('const isHealthRecordSaving = computed(() => Boolean(savingRecordKey.value))')
    expect(source).toContain('const isSecondaryActionDisabled = computed(() =>')
    expect(source).not.toContain(':primary-disabled="!dogId || isProfileLoading || isSaving || savingRecordKey"')
    expect(source).not.toContain(':secondary-disabled="isLoading || isSaving || savingRecordKey"')
    expect(source).toContain('@save-record="saveHealthRecord"')
    expect(source).toContain('@delete-record="deleteHealthRecord"')
    expect(source).toContain('@dirty-change="hasUnsavedRecordDraft = $event"')
    // 2026-09-30：activeRecordType 由顶部书签派生（computed），不再是独立 ref
    expect(source).toContain("const activeRecordType = computed<HealthRecordType | 'visit'>(")
    expect(source).toContain("const activeHealthTab = ref<HealthTabKey>('medical')")
    expect(source).toContain('recordsByType = reactive<Record<HealthRecordType, Record<string, any>[]>>')
    expect(source).toContain('loadingByType = reactive<Record<HealthRecordType, boolean>>')
    expect(source).toContain('dogApi.healthRecords.medical.list')
    expect(source).toContain('dogApi.healthRecords.checkup.list')
    expect(source).toContain('dogApi.healthRecords.allergy.list')
    expect(source).toContain('function recordApiForType(type: HealthRecordType)')
    expect(source).toContain('async function loadHealthRecordList(')
    expect(source).toContain('async function loadAllHealthRecordLists')
    expect(source).toContain('async function saveHealthRecord')
    expect(source).toContain('.create(targetDogId')
    expect(source).toContain('.update(targetDogId')
    expect(source).toContain('async function deleteHealthRecord')
    expect(source).toContain('removeHealthRecordFromList')
    expect(functionSource(
      source,
      'async function saveHealthRecord',
      'async function deleteHealthRecord',
    )).not.toContain('hasUnsavedRecordDraft.value = false')
    // 2026-10-02：饮食偏好的保存逻辑已从本页删除，
    // deleteHealthRecord 之后紧接着是引导入口
    expect(functionSource(
      source,
      'async function deleteHealthRecord',
      'async function pickAddGuide',
    )).not.toContain('uni.showModal')
    // 引导入口本身是纯派发（不碰保存状态），保存态由底部按钮的禁用逻辑把关
    expect(source).toContain('const isSecondaryActionDisabled = computed(() =>')
    expect(functionSource(
      source,
      'function goBack',
      'function goToDogCreate',
    )).toContain('isHealthRecordSaving.value')
    expect(source).not.toContain('dogApi.updateHealthRecords')
    expect(source).not.toContain('buildDogHealthStateSnapshot')
    expect(source).not.toContain('mergeDogHealthStateSnapshot')
    expect(source).not.toContain('readDogHealthStateSnapshotCache')
    expect(source).not.toContain('writeDogHealthStateSnapshotCache')
  })

  it('饮食偏好已从健康管理页下线（只在定制食谱里填写）', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    // 老板 2026-10-02：饮食偏好跟健康管理关系不大，标签删掉
    expect(page).not.toContain('diet-reminder-card')
    expect(page).not.toContain('DietPreferenceSection')
    expect(page).not.toContain("{ key: 'diet'")

    // 但编辑入口没丢：定制食谱流程里有"饮食偏好"那一步
    const customRecipe = readFileSync(
      resolve(process.cwd(), 'src/pages/custom-recipe/index.vue'),
      'utf-8',
    )
    expect(customRecipe).toContain('饮食偏好')
  })

  /**
   * 「健康管理」是健康记录的唯一入口（2026-09-27）
   *
   * 建档流程删掉健康信息步骤之后，这一页就是顾客补充过敏 / 检查报告 /
   * 疫苗 / 体重的**唯一**去处，所以入口必须真的挂上、并且能刷新。
   */
  it('过敏类别里挂上了快速添加与报告识别入口', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(page).toContain('AllergyQuickAddSection')
    expect(page).toContain("v-if=\"activeRecordType === 'allergy'\"")
    expect(page).toContain(':recorded-allergens="recordedAllergens"')
    expect(page).toContain('@saved="onAllergenSaved"')

    // 快速添加写在过敏列表上方（切到过敏第一眼就能看到）
    // 2026-10-01：插槽加了开关 —— 只有过敏板块渲染它，
    // 否则空容器会作为 flex 子元素占掉一个 gap（书签下方多一条空白）
    expect(section).toContain('<slot v-if="showTypeExtra" name="type-extra" />')
    expect(page).toContain(":show-type-extra=\"activeRecordType === 'allergy'\"")
    const slotIndex = section.indexOf('<slot v-if="showTypeExtra" name="type-extra" />')
    const emptyIndex = section.indexOf('health-section__empty')
    expect(slotIndex).toBeGreaterThan(-1)
    expect(slotIndex).toBeLessThan(emptyIndex)
  })

  it('快速添加落库后把过敏列表拉回来，而不是本地硬塞', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('async function onAllergenSaved()')
    expect(page).toContain("await loadHealthRecordList('allergy', dogId.value)")
    // 已记过敏原从接口数据派生，保证与列表一致
    expect(page).toContain('const recordedAllergens = computed(() => (recordsByType.allergy || [])')
  })

  it('疫苗管理作为独立卡片挂在「健康管理」页里', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain("import VaccineManagementSection from")
    // 2026-09-30：改为书签切换 —— 只有切到「疫苗」时才渲染；
    // 并且改成 external-save（保存按钮由底部自适应按钮统一承担）
    expect(page).toContain('v-else-if="activeHealthTab === \'vaccine\'"')
    expect(page).toContain('ref="vaccineSectionRef"')
    expect(page).toContain('external-save')
    // 文案要如实列出这一页能维护什么
    expect(page).toContain('过敏、检查报告、疫苗、体重和饮食偏好')
  })

  /**
   * 喜欢吃的食材（2026-09-27 老板确认）
   *
   * 老板决定：食材偏好不改位置，仍留在「健康管理」页的这张卡片里，
   * 只把顾客端一直缺的「喜欢吃的食材」补上。
   * 这一列配方设计器与 AI 早就在读，但生产 4544 只狗整列为空。
   */

  it('饮食偏好的保存逻辑已从本页移除（只在定制食谱里填）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('async function saveDietReminders')
    expect(source).not.toContain('updateDietReminders')
  })
})

/**
 * 板块书签（2026-09-30，老板要求）
 *
 * 六个板块原先全部平铺在一页里，一屏挤着病史、体检、过敏、疫苗、
 * 饮食偏好、体重管理六套内容，显得杂乱。改成书签：一次只显示一个。
 */
describe('dog-profile-health · 板块书签', () => {
  const readPage = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'), 'utf-8')

  it('五个书签齐全，顺序与老板给的一致（就诊与体检分开、饮食已下线）', () => {
    const page = readPage()

    // 2026-10-02：就诊与体检拆开；饮食偏好跟健康管理关系不大，标签下线
    //（只在定制食谱时填写，定制流程里本来就有那一步）
    expect(page).toContain("type HealthTabKey = 'medical' | 'checkup' | 'allergy' | 'vaccine' | 'weight'")
    expect(page).toContain("{ key: 'medical', label: '就诊' }")
    expect(page).toContain("{ key: 'checkup', label: '体检' }")
    expect(page).toContain("{ key: 'allergy', label: '过敏' }")
    expect(page).toContain("{ key: 'vaccine', label: '疫苗' }")
    expect(page).toContain("{ key: 'weight', label: '体重' }")
    expect(page).not.toContain("{ key: 'diet'")

    const medicalAt = page.indexOf("{ key: 'medical'")
    const checkupAt = page.indexOf("{ key: 'checkup'")
    const allergyAt = page.indexOf("{ key: 'allergy'")
    expect(medicalAt).toBeGreaterThan(-1)
    expect(checkupAt).toBeGreaterThan(medicalAt)
    expect(allergyAt).toBeGreaterThan(checkupAt)
  })

  it('一次只显示一个板块：每个板块都挂在书签条件上', () => {
    const page = readPage()

    // 三类记录共用一个组件
    expect(page).toContain('v-if="isRecordTab"')
    // 疫苗 / 体重管理各挂各的书签（就诊、体检、过敏走 isRecordTab 那支）
    expect(page).toContain("v-else-if=\"activeHealthTab === 'vaccine'\"")
    expect(page).toContain("v-else-if=\"activeHealthTab === 'weight'\"")
    // 饮食偏好标签已下线（老板 2026-10-02）
    expect(page).not.toContain("activeHealthTab === 'diet'")
  })

  it('记录类板块复用既有的三个类型，并关掉组件自带的重复标签', () => {
    const page = readPage()
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 就诊 / 体检 / 过敏 三者共用同一个组件（记录类）
    expect(page).toContain("const RECORD_TAB_KEYS: string[] = ['medical', 'checkup', 'allergy']")
    // 2026-10-02 拆标签后：每个标签只取自己那一类的记录，不再在页面里合并两类
    expect(page).toContain("if (activeHealthTab.value === 'medical') {")
    expect(page).toContain('return recordsByType.medical')
    expect(page).toContain('return recordsByType.checkup')
    // 类别由标签传给组件（表单里不再有"类型"切换）
    expect(page).toContain(':visit-kind="activeVisitKind"')
    // 上级已有书签，组件内那套一模一样的标签要关掉，否则重复
    expect(page).toContain('embedded')
    expect(section).toContain('v-if="!embedded" class="record-type-tabs"')
  })
})

/**
 * 底部按钮与书签视觉（2026-09-30，老板反馈）
 *
 * 1. 底部「返回概览」在从首页进来时也显示，逻辑说不通 —— 回哪去要跟着入口走。
 * 2. 「保存饮食偏好」只保存饮食偏好 —— 那就只在饮食偏好书签下出现，
 *    其余五个板块各自有保存按钮，底部再放一个没人知道它在存什么。
 * 3. 书签与板块原先各是一张卡、中间还留间距，看着割裂；书签宽度也不一致。
 */
describe('dog-profile-health · 底部按钮与书签', () => {
  const readPage = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'), 'utf-8')

  it('返回按钮的文案跟着入口走，不再一律写「返回概览」', () => {
    const page = readPage()

    expect(page).toContain("entrySource.value = from === 'home' || from === 'overview' ? from : 'unknown'")
    expect(page).toContain('const HEALTH_ENTRY_LABELS')
    expect(page).toContain('home: \'返回首页\'')
    expect(page).toContain('overview: \'返回概览\'')
    // 标签写死「返回概览」是这次的病根，不能再出现
    expect(page).not.toContain('secondary-text="返回概览"')
  })

  it('两个入口都带上来源参数', () => {
    const home = readFileSync(resolve(process.cwd(), 'src/pages/home/index.vue'), 'utf-8')
    const overview = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(home).toContain('/pages/dog-profile-health/index?from=home')
    expect(overview).toContain('&from=overview')
  })

  it('底部主按钮按书签自适应：六个板块都保存自己那一块', () => {
    const page = readPage()

    // 2026-10-03 老板定：底部不再有保存键，六个板块全部实时保存；
    // 底部只剩「记一条」，边界（切标签/隐藏/卸载）把等待中的保存立刻发出去
    expect(page).not.toContain("computed(() => '保存')")
    expect(page).toContain('flushActiveTabAutoSaves')
    expect(page).toContain('recordsSectionRef.value?.flushAutoSaves?.()')
    expect(page).toContain('vaccineSectionRef.value?.flushAutoSaves?.()')
    expect(page).toContain('weightSectionRef.value?.flushAutoSaves?.()')
    expect(page).toContain('onHide(')
    expect(page).toContain('onUnload(')
    // 次按钮：病历/检查板块是「新增记录」（入口合并到这里），其它板块仍是返回
    expect(page).toContain("selectedDog.value ? '记一条' : HEALTH_ENTRY_LABELS[entrySource.value]")
    // 2026-10-02：新增统一走引导面板（不再直连记录板块的选择器）
    expect(page).toContain('openAddGuide()')
  })

  it('三大记录板块（病史/体检/过敏）各自独立，内嵌时不再顶一行板块头', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 2026-10-01 老板要求：书签已经写着「病历/检查 / 过敏」，
    // 板块里再顶一个同名标题 + 「N 条」是重复，还占一行。
    expect(section).toContain('v-if="!embedded" class="health-section__header"')
    expect(section).toContain('{{ savedRecordCount }} 条')
    // 逐条保存按钮在内嵌模式下隐藏，改由底部统一保存；
    // 记录入口（手动 / 拍照）也交给底部那一个按钮
    // 2026-10-03：底部保存按钮下线，板块改为自动保存；对外仍暴露这几个入口
    expect(section).toContain('openAddRecordChooser')
    expect(section).toContain('startScan')
    expect(section).toContain('flushAutoSaves')
  })

  it('五个板块在内嵌时都不顶"标题 + 数量"（老板 2026-10-01 要求）', () => {
    const read = (name: string) =>
      readFileSync(resolve(process.cwd(), `src/components/dog-profile/${name}.vue`), 'utf-8')

    // 病例 / 过敏
    expect(read('HealthRecordsSection')).toContain('v-if="!embedded" class="health-section__header"')
    // 疫苗
    expect(read('VaccineManagementSection')).toContain('v-if="!embedded" class="health-section__header"')
    // 体重（首卡那行标题与说明）
    expect(read('WeightManagementSection')).toContain('<template v-if="!embedded">')
    // 饮食：两列清单的数量去掉，"爱吃的 / 不吃的"名字保留（否则两列分不清）
    const diet = read('DietPreferenceSection')
    expect(diet).toContain('v-if="!embedded" class="health-section__count"')
    expect(diet).toContain('>爱吃的<')
    expect(diet).toContain('>不吃的 / 挑食<')

    // 页面确实把这几个组件都标成了内嵌
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
    expect(page).toContain('embedded')
  })

  it('五个书签等宽，且与板块拼成同一张卡', () => {
    const page = readPage()

    // 等宽：flex:1 均分（原来靠横向滚动，最后一个会被裁掉）
    expect(page).toContain('.health-tabs__item {')
    expect(page).toContain('flex: 1 1 0;')
    // 同一张卡：书签是卡片头部，内容区不再自己画卡。
    // 2026-10-01：板块的"不画卡"改成由共用外壳负责（自己是扁平的），
    // 页面里那套 :deep() 覆盖已删除 —— 小程序组件样式隔离，它本来也穿不进去。
    expect(page).toContain('class="health-panel"')
    expect(page).toContain('health-panel__body')
    expect(page).toContain("@import '../../styles/health-section.scss';")
    // 书签与板块之间不再留间距（那是"割裂感"的来源）
    expect(page).not.toContain('margin-bottom: 24rpx;\n  white-space: nowrap;')
  })

  it('每个板块一套主题色（病史体检合并后为五套；保存键 2026-10-03 已下线）', () => {
    const page = readPage()
    const bar = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/StickyActionBar.vue'),
      'utf-8',
    )

    // 样式里为了对齐加过多余空格，比较前先把连续空白压成一个
    const compact = page.replace(/\s+/g, ' ')
    for (const theme of ['visit', 'allergy', 'vaccine', 'diet', 'weight']) {
      expect(compact).toContain(`.health-theme--${theme} .health-tabs__item--active`)
    }
    // 已停用的旧书签不该留残影
    expect(compact).not.toContain('.health-theme--medical')
    expect(compact).not.toContain('.health-theme--checkup')
    // 按钮主题做成属性 —— 小程序组件样式隔离，父页面 :deep() 进不来。
    // 2026-10-03：底部只剩「记一条」一个按钮（保存键下线），主题固定成 visit；
    // 组件仍保留多套主题能力，板块色系继续由书签与内容区表达。
    expect(page).toContain('primary-theme="visit"')
    expect(page).not.toContain('stickyPrimaryTheme')
    expect(bar).toContain('primaryTheme?:')
    for (const theme of ['visit', 'allergy', 'vaccine', 'diet', 'weight']) {
      expect(bar).toContain(`.sticky-bar__button--primary--${theme}`)
    }
    // 色系要铺到内容区 —— 只给书签文字上色不够（老板指出"色系没划分出来"）
    expect(compact).toContain('.health-theme--diet .health-panel__body')
  })
})

/**
 * 「记一条」引导入口（2026-10-02 老板定的方向）。
 *
 * 老板的原话：标签页就作为"结果呈现或者手动编辑"，
 * 初次录入给一个入口，从这个入口进去**分类来让用户录入信息**，
 * 并进入分类引导流程 —— 因为就诊与体检要填的东西差别很大。
 */
describe('dog-profile-health · 引导入口', () => {
  const readPage = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('底部一个入口，任何标签下都是「记一条」', () => {
    const page = readPage()

    expect(page).toContain('function openAddGuide()')
    expect(page).toContain("selectedDog.value ? '记一条' : HEALTH_ENTRY_LABELS[entrySource.value]")
    // 点了就开面板，不再直连某一个板块的选择器
    expect(page).toContain("openAddGuide()")
    expect(page).toContain('class="add-guide"')
  })

  it('先分类：五张卡（就诊/体检/疫苗/过敏/体重），各带一句人话说明', () => {
    const page = readPage()

    expect(page).toContain('你要记什么？')
    for (const key of ['medical', 'checkup', 'vaccine', 'allergy', 'weight']) {
      expect(page).toContain(`key: '${key}'`)
    }
    expect(page).toContain('症状、医生诊断、医嘱、用药')
    expect(page).toContain('体检报告、化验单')
    expect(page).toContain('拍疫苗本，一次读出多条接种记录')
    // 饮食不再是一张卡（也不再有那个标签）
    expect(page).not.toContain("key: 'diet'")
  })

  it('再按类引导：就诊/体检给"传照片识别"与"手动填写"两条路', () => {
    const page = readPage()

    expect(page).toContain("{ mode: 'scan', label: '传病历/处方（AI 识别）', primary: true }")
    expect(page).toContain("{ mode: 'scan', label: '传体检报告（AI 识别）', primary: true }")
    expect(page).toContain("{ mode: 'manual', label: '手动填写' }")
    // 选完先切标签（看得见落点），再调起对应动作
    expect(page).toContain('selectHealthTab(key as HealthTabKey)')
    expect(page).toContain('recordsSectionRef.value?.startScan?.()')
    expect(page).toContain('recordsSectionRef.value?.addRecord?.()')
  })

  it('疫苗 / 过敏 / 体重各有落点（拍疫苗本、去过敏板块、直接落光标）', () => {
    const page = readPage()
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
    const weight = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/WeightManagementSection.vue'),
      'utf-8',
    )

    expect(vaccine).toContain('startScan: () => scanRef.value?.startScan?.()')
    expect(vaccine).toContain('addRecord')
    expect(vaccine).toContain('flushAutoSaves')
    expect(weight).toContain('focusInput: focusWeightInput')
    expect(weight).toContain('flushAutoSaves')
    expect(weight).toContain(':focus="weightInputFocused"')
    expect(page).toContain('weightSectionRef.value?.focusInput?.()')
    // 过敏也能直达上传（2026-10-02 补：不再只是切过去提示）
    expect(page).toContain("{ mode: 'scan', label: '拍检测报告（AI 识别）', primary: true }")
    expect(page).toContain('allergySectionRef.value?.pickHealthReport?.()')
  })
})

/**
 * 新增入口收敛（2026-10-02 老板定）。
 *
 * 老板的原话：*"标签页内的零散入口收敛也进行收敛。用户想要新增记录的话，
 * 只能通过记一条入口来新增。标签页内部只能编辑现有的信息。"*
 * 做法：三个板块各加一个 showAddEntry 开关（默认关），
 * 引导入口选到对应类别时页面把它打开 —— 界面还是熟悉的板块界面，
 * 但全站只有「记一条」一个新增起点。
 */
describe('dog-profile-health · 新增入口已收敛', () => {
  const readPage = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('三个板块的新增块默认不显示，由引导入口打开', () => {
    const page = readPage()

    expect(page).toContain('const vaccineAddEntryVisible = ref(false)')
    expect(page).toContain('const allergyAddEntryVisible = ref(false)')
    expect(page).toContain('const weightAddEntryVisible = ref(false)')
    expect(page).toContain(':show-add-entry="vaccineAddEntryVisible"')
    expect(page).toContain(':show-add-entry="allergyAddEntryVisible"')
    expect(page).toContain(':show-add-entry="weightAddEntryVisible"')
    // 换标签就复位，避免开关残留
    expect(page).toContain('resetAddEntryFlags()')
  })

  it('记录板块自身的「新增记录」按钮已下线（只有引导能新建）', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 按钮本身没了
    expect(section).not.toContain('{{ activeTypeMeta.addLabel }}')
    // 但能力留着（引导入口要用）
    // 2026-10-03：底部保存按钮下线，板块改为自动保存；对外仍暴露这几个入口
    expect(section).toContain('openAddRecordChooser')
    expect(section).toContain('startScan')
    expect(section).toContain('flushAutoSaves')
  })

  it('疫苗/过敏/体重三个板块的新增部分都挂在 showAddEntry 上', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
    const allergy = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
      'utf-8',
    )
    const weight = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/WeightManagementSection.vue'),
      'utf-8',
    )

    expect(vaccine).toContain(':hide-trigger="!showAddEntry"')
    expect(vaccine).toContain('v-if="showAddEntry"\n      class="health-section__action"')
    expect(allergy).toContain('<template v-if="showAddEntry">')
    expect(weight).toContain('<view v-if="showAddEntry" class="input-card">')
  })
})
