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
    // 2026-10-03：只留一条通栏 Banner「健康记录」，整块上色；
    // 「健康分析」入口暂时隐藏（页面/接口仍在）
    expect(source).toContain('health-entry--records')
    expect(source).not.toContain('health-entry--analysis')
    expect(source).toContain('class="health-entry__title">健康记录<')
    expect(source).not.toContain('class="health-entry__title">健康分析<')
    expect(source).toContain('{{ visitShortcutHint }}')
    // 「健康分析」入口暂时隐藏（2026-10-03）
    expect(source).not.toContain('7 项初步分析')

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
      'function onAddRecordTap',
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
  it('过敏已从健康管理移除（2026-10-04 老板：全部删除掉，搬去定制食谱）', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 四个过敏板块与它们的接线全部下线
    for (const gone of [
      'AllergyQuickAddSection',
      'AllergyConclusionSection',
      'AllergyReportSection',
      'AllergyTrialSection',
      'recordedAllergens',
      'allergyReports',
      'onAllergenSaved',
    ]) {
      expect(page).not.toContain(gone)
    }

    // 组件里那个插槽还在（其它板块以后可能用），但本页不再往里塞东西
    expect(section).toContain('<slot v-if="showTypeExtra" name="type-extra" />')
    expect(page).not.toContain('show-type-extra')
  })

  it('页面里不再有任何过敏板块或过敏接口调用', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    // 不再单独加载过敏表（那个常量还包含 allergy，所以页面自己列了白名单）
    expect(page).not.toContain("loadHealthRecordList('allergy'")
    expect(page).toContain("const HEALTH_PAGE_RECORD_TYPES: HealthRecordType[] = ['medical', 'checkup']")
    // 过敏报告接口也不在本页调
    expect(page).not.toContain('allergyReports.list')
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
    expect(page).toContain('就诊记录、体检报告、疫苗和体重')
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

  it('四个书签，顺序与老板给的一致（2026-10-04 起「过敏」已移出健康管理）', () => {
    const page = readPage()

    // 2026-10-02：就诊与体检拆开；饮食偏好标签下线（只在定制食谱里填）
    // 2026-10-04 老板："把过敏标签及相关的板块内容，从健康管理中全部删除掉"
    expect(page).toContain("type HealthTabKey = 'medical' | 'checkup' | 'vaccine' | 'weight'")
    expect(page).toContain("{ key: 'medical', label: '就诊' }")
    expect(page).toContain("{ key: 'checkup', label: '体检' }")
    expect(page).toContain("{ key: 'vaccine', label: '疫苗' }")
    expect(page).toContain("{ key: 'weight', label: '体重' }")
    expect(page).not.toContain("{ key: 'diet'")
    // 过敏不再是书签
    expect(page).not.toContain("{ key: 'allergy'")

    const medicalAt = page.indexOf("{ key: 'medical'")
    const checkupAt = page.indexOf("{ key: 'checkup'")
    const vaccineAt = page.indexOf("{ key: 'vaccine'")
    expect(medicalAt).toBeGreaterThan(-1)
    expect(checkupAt).toBeGreaterThan(medicalAt)
    expect(vaccineAt).toBeGreaterThan(checkupAt)
  })

  it('一次只显示一个板块：每个板块都挂在书签条件上', () => {
    const page = readPage()

    // 就诊与体检共用一个组件
    expect(page).toContain('v-if="isRecordTab"')
    // 疫苗 / 体重管理各挂各的书签（就诊、体检走 isRecordTab 那支）
    expect(page).toContain("v-else-if=\"activeHealthTab === 'vaccine'\"")
    expect(page).toContain("v-else-if=\"activeHealthTab === 'weight'\"")
    // 饮食偏好标签已下线（老板 2026-10-02）
    expect(page).not.toContain("activeHealthTab === 'diet'")
  })

  it('记录类板块复用既有的类型，并关掉组件自带的重复标签', () => {
    const page = readPage()
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 就诊 / 体检 两者共用同一个组件（记录类）
    expect(page).toContain("const RECORD_TAB_KEYS: string[] = ['medical', 'checkup']")
    // 每个标签只取自己那一类的记录，不在页面里合并两类
    expect(page).toContain("activeHealthTab.value === 'medical' ? recordsByType.medical : recordsByType.checkup")
    expect(page).toContain('recordsByType.medical')
    expect(page).toContain('recordsByType.checkup')
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
    // 主按钮：选了狗是「新增记录」，没选狗是返回
    expect(page).toContain("return HEALTH_ENTRY_LABELS[entrySource.value]")
    expect(page).toContain("return '新增记录'")
    // 2026-10-02：新增统一走引导面板（不再直连记录板块的选择器）
    expect(page).toContain('onAddRecordTap()')
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

  it('每个板块一套主题色（2026-10-04 起四套：就诊/体检/疫苗/体重）', () => {
    const page = readPage()
    const bar = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/StickyActionBar.vue'),
      'utf-8',
    )

    // 样式里为了对齐加过多余空格，比较前先把连续空白压成一个
    const compact = page.replace(/\s+/g, ' ')
    // 2026-10-03 老板实测：就诊与体检两个标签没有主题色 ——
    // 因为 activeHealthTab 传的是 medical/checkup，而样式里只写了 visit。
    for (const theme of ['medical', 'checkup', 'vaccine', 'weight']) {
      expect(compact).toContain(`.health-theme--${theme} .health-tabs__item--active`)
      expect(compact).toContain(`.health-theme--${theme} .health-panel__body`)
    }
    // 饮食板块已下线，主题色不该留残影；中间那个临时的 visit 也一并清掉
    expect(compact).not.toContain('.health-theme--diet')
    expect(compact).not.toContain('.health-theme--visit')
    // 2026-10-04：过敏标签移出健康管理，主题色一并下线
    expect(compact).not.toContain('.health-theme--allergy')
    // 按钮主题做成属性 —— 小程序组件样式隔离，父页面 :deep() 进不来。
    // 2026-10-03：底部只剩「记一条」一个按钮（保存键下线），主题固定成 visit；
    // 组件仍保留多套主题能力，板块色系继续由书签与内容区表达。
    expect(page).toContain(':primary-theme="stickyAddTheme"')
    expect(page).not.toContain('stickyPrimaryTheme')
    expect(bar).toContain('primaryTheme?:')
    // 2026-10-03：新增记录按钮按标签换色 —— 五个标签五套（含体检的蓝）
    for (const theme of ['visit', 'checkup', 'allergy', 'vaccine', 'weight']) {
      expect(bar).toContain(`.sticky-bar__button--primary--${theme}`)
    }
    // 饮食标签早下线 → 它的按钮主题也清掉了
    expect(bar).not.toContain('.sticky-bar__button--primary--diet')
    // 色系要铺到内容区 —— 只给书签文字上色不够（老板指出"色系没划分出来"）
    expect(compact).toContain('.health-theme--medical .health-panel__body')
    expect(compact).toContain('.health-theme--checkup .health-panel__body')
  })
})

/**
 * 底部「新增记录」按当前标签直接路由（2026-10-03 老板定）。
 *
 * 老板原话："既然点击记一条按钮之后，依然走的是每一个标签的功能来让 AI 识别，
 * 那我们能否把点击之后的弹窗去掉，让它自动识别当前处在哪个标签页下，
 * 点击就自动走哪一个通道呢？另外，记一条这个按钮的文案能不能改为新增记录？"
 *
 * 所以：面板下线、文案改「新增记录」、点了直接用当前标签的通道。
 * 纯手填的入口留在各板块内部（不再需要先选一次类别）。
 */
describe('dog-profile-health · 新增记录直接路由', () => {
  const readPage = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('文案改成「新增记录」，引导面板彻底下线', () => {
    const page = readPage()

    expect(page).toContain("return '新增记录'")
    expect(page).not.toContain('addGuideVisible')
    expect(page).not.toContain('ADD_GUIDE_ITEMS')
    expect(page).not.toContain('你要记什么？')
    expect(page).not.toContain('class="add-guide"')
  })

  it('点一下就走当前标签的通道（就诊/体检→AI 识别，疫苗→拍疫苗本，过敏→滚到添加卡，体重→落光标）', () => {
    const page = readPage()

    expect(page).toContain('function onAddRecordTap()')
    // 就诊 / 体检：直接调起相册识别
    expect(page).toContain('recordsSectionRef.value?.startScan?.()')
    // 疫苗：打开新增块并直接拍疫苗本
    expect(page).toContain('vaccineSectionRef.value?.startScan?.()')
    // 过敏已不在这个页面
    expect(page).not.toContain("activeHealthTab.value === 'allergy'")
    // 体重：打开输入块 + 光标进输入框
    expect(page).toContain('weightSectionRef.value?.focusInput?.()')
    // 不再有"先切标签再执行"那一步
    expect(page).not.toContain('selectHealthTab(key as HealthTabKey)')
  })

  it('点下去先问一句：上传图片 AI 识别 / 自己手动填写（过敏除外）', () => {
    const page = readPage()

    expect(page).toContain('uni.showActionSheet({')
    expect(page).toContain("['上传图片，AI 识别', '手动填写']")
    expect(page).toContain("['拍疫苗本，AI 识别', '手动加一条']")
    // 过敏已不在这个页面
    expect(page).not.toContain("['拍检测报告，AI 识别', '手动点选 / 手输']")
    // 选完才把对应板块的录入块打开；标签页本身仍是"看结果 + 改已有"
    expect(page).toContain('recordsSectionRef.value?.addRecord?.()')
    expect(page).toContain('vaccineSectionRef.value?.addRecord?.()')
    // 体重没有 AI 这条路 → 不弹选择，直接落光标
    expect(page).toContain('weightSectionRef.value?.focusInput?.()')
  })

  it('板块内不再重复放手动填写入口（老板：多余）', () => {
    const records = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )
    const page = readPage()

    expect(records).not.toContain('手动填写一条')
    // 2026-10-04：疫苗板块内那个新增按钮也下线了 —— 老板提问
    // "在记录板块中有一个新增按钮，在最下方还有一个新增记录的按钮呢？
    // 不是重复了吗？"。现在点底部「新增记录」直接调起板块的 addRecord()。
    expect(page).not.toContain('show-add-entry="vaccineAddEntryVisible"')
    // 过敏已移出本页（搬去定制食谱），这里不该再出现它的入口
    expect(page).not.toContain(':show-add-entry="true"')
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
describe('dog-profile-health · 新增入口（2026-10-03 起：AI 走底部、手填在板块内）', () => {
  const readPage = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('体重的新增块默认关闭，由「新增记录」里的选择打开', () => {
    const page = readPage()

    // 疫苗板块的开关已删除（2026-10-04，板块内按钮下线）；
    // 体重还留着 —— 它的输入块由页面自己持有，需要这个开关。
    expect(page).not.toContain('vaccineAddEntryVisible')
    expect(page).toContain('const weightAddEntryVisible = ref(false)')
    expect(page).toContain(':show-add-entry="weightAddEntryVisible"')
    // 换标签就复位，避免开关残留
    expect(page).toContain('resetAddEntryFlags()')
  })

  it('过敏已移出健康管理（2026-10-04）', () => {
    const page = readPage()

    expect(page).not.toContain('allergyAddEntryVisible')
    expect(page).not.toContain('AllergyQuickAddSection')
    expect(page).not.toContain('AllergyTrialSection')
    expect(page).not.toContain('AllergyReportSection')
    expect(page).not.toContain('AllergyConclusionSection')
  })

  it('新增块关闭时不渲染空卡片（老板截图里的白框）', () => {
    const weight = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/WeightManagementSection.vue'),
      'utf-8',
    )
    const scan = readFileSync(
      resolve(process.cwd(), 'src/components/custom-recipe/AllergyScanBlock.vue'),
      'utf-8',
    )

    // 体重：内嵌 + 新增块关闭 → 整张卡片不渲染（否则留下一个空的白卡片）
    expect(weight).toContain('v-if="!embedded || showAddEntry" class="health-card weight-record-card"')
    // 过敏扫描块：没有待确认候选时不显示候选区（只留入口本身）
    expect(scan).toContain('v-if="candidates.length > 0" class="allergy-scan__candidates"')
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

  it('体重板块的新增部分仍挂在 showAddEntry 上（疫苗与过敏都已不在）', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )
    const weight = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/WeightManagementSection.vue'),
      'utf-8',
    )

    // 疫苗板块：板块内的新增按钮已下线（老板说重复），
    // 「拍疫苗本」的触发行本来就常隐（AI 走底部「新增记录」）。
    expect(vaccine).not.toContain('health-section__action')
    // 「拍疫苗本」触发行仍常隐（AI 走底部「新增记录」）
    expect(vaccine).toContain('hideScanTrigger?: boolean')
    // 体重板块不变：它的输入块仍由这个开关控制
    expect(weight).toContain('<view v-if="showAddEntry" class="input-card">')
  })
})

/**
 * 疫苗书签角标（2026-10-04）。
 *
 * 老板定：提醒保持"时间窗口"不细化到某一天；A 层做到疫苗种类提醒。
 * 但提醒只有落在顾客**看得见的地方**才算数 —— 疫苗计划藏在疫苗书签里，
 * 顾客不点进去永远不知道有针要打。
 */
describe('健康管理 · 疫苗书签角标（2026-10-04）', () => {
  function readPage() {
    return readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
  }

  it('有针要打时，书签上直接写出数量', () => {
    const page = readPage()

    expect(page).toContain('vaccineBadgeText')
    expect(page).toContain('有 ${dueCount} 针该打了')
    expect(page).toContain('.health-tabs__badge')
    expect(page).toContain("tab.key === 'vaccine' && vaccineBadgeText")
  })

  it('角标由页面自己拉，不能等 VaccinePlanSection 报 —— 那个组件点进去才挂载', () => {
    const page = readPage()

    expect(page).toContain('async function loadVaccineBadge(')
    expect(page).toContain('await dogApi.vaccinePlan(requestedDogId)')
    // 角标的全部意义就是"还没点进去时"提醒，所以必须挂在页面上
    expect(page).toContain('loadVaccineBadge(requestedDogId)')
  })

  it('一条接种记录都没有时**不挂角标**（2026-10-04 老板提问后改）', () => {
    const page = readPage()

    // 原来显示"待补记录"。三处不对：
    //   1. 生产 4575 只狗疫苗记录是 0 条 —— 等于每个用户永远看到这个角标，
    //      一个永远亮着的角标就不是信号了；
    //   2. 它跟"有 N 针该打了"用同一套视觉，把真正的提醒一起贬值；
    //   3. 读起来像在说"你欠我们一条记录"。
    // 没有记录时计划板块本来就有一张说明卡把话讲清楚，那里说就够了。
    expect(page).toContain('noRecordAtAll === true')
    expect(page).not.toContain('待补记录')
    expect(page).toContain("if (res.data.noRecordAtAll === true) {")
    expect(page).toContain("vaccineBadgeText.value = ''")
  })

  it('计划没开或拉失败时不挂角标（不在书签上写"加载失败"）', () => {
    const page = readPage()

    expect(page).toContain('res.data.available === false')
    // 静默清空，不抛也不弹 toast
    expect(page).toContain("vaccineBadgeText.value = ''")
  })

  it('书签里的文字 vs 主题色：color 留在 .health-tabs__item 上', () => {
    const page = readPage()

    // 书签从 <text> 变成纵向 flex 的 <view>（要放角标），
    // 但是主题色是按 .health-tabs__item--active 给的 ——
    // 文字元素自己写 color 会把主题色盖掉，四套主题色就全废了。
    expect(page).toContain('.health-tabs__label {')
    const itemBlock = page.slice(
      page.indexOf('.health-tabs__item {'),
      page.indexOf('.health-tabs__label {'),
    )
    expect(itemBlock).toContain('color: #6b7566;')
    const labelBlock = page.slice(
      page.indexOf('.health-tabs__label {'),
      page.indexOf('}', page.indexOf('.health-tabs__label {')),
    )
    expect(labelBlock).not.toContain('color:')
  })
})
