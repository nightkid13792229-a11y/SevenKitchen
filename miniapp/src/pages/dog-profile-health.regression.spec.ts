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
    expect(source).toContain(':primary-disabled="stickyPrimaryDisabled"')
    expect(source).toContain('const stickyPrimaryDisabled = computed(')
  })

  it('guards dog switching when diet reminders have unsaved changes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const hasUnsavedDietReminder = computed(() =>')
    expect(source).toContain('hasUnsavedRecordDraft')
    expect(source).toContain('confirmSwitchDogWithUnsavedChanges')
    expect(source).toContain('uni.showModal({')
    expect(source).toContain('selectedDogIndex.value = getCurrentDogIndex()')
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
    expect(source).toContain(':primary-disabled="stickyPrimaryDisabled"')
    expect(source).toContain('const stickyPrimaryDisabled = computed(')
    expect(source).toContain(':secondary-disabled="isSecondaryActionDisabled"')
    expect(source).toContain('const isHealthRecordSaving = computed(() => Boolean(savingRecordKey.value))')
    expect(source).toContain('const isDietReminderActionDisabled = computed(() =>')
    expect(source).toContain('const isSecondaryActionDisabled = computed(() =>')
    expect(source).not.toContain(':primary-disabled="!dogId || isProfileLoading || isSaving || savingRecordKey"')
    expect(source).not.toContain(':secondary-disabled="isLoading || isSaving || savingRecordKey"')
    expect(source).toContain('@save-record="saveHealthRecord"')
    expect(source).toContain('@delete-record="deleteHealthRecord"')
    expect(source).toContain('@dirty-change="hasUnsavedRecordDraft = $event"')
    // 2026-09-30：activeRecordType 由顶部书签派生（computed），不再是独立 ref
    expect(source).toContain("const activeRecordType = computed<HealthRecordType | 'visit'>(")
    expect(source).toContain("const activeHealthTab = ref<HealthTabKey>('visit')")
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
    expect(functionSource(
      source,
      'async function deleteHealthRecord',
      'async function saveDietReminders',
    )).not.toContain('uni.showModal')
    expect(functionSource(
      source,
      'async function saveDietReminders',
      'function goBack',
    )).toContain('isHealthRecordSaving.value')
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

  it('keeps diet reminders isolated from health record CRUD', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('diet-reminder-card')
    expect(source).toContain('saveDietReminders')
    expect(source).toContain('dogApi.updateDietReminders')
    expect(source).not.toContain('dogApi.updateHealthRecords')
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
    expect(section).toContain('<slot name="type-extra" />')
    const slotIndex = section.indexOf('<slot name="type-extra" />')
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
  it('饮食偏好里两个口味字段都在：喜欢吃的 + 不爱吃的', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('喜欢吃的食材')
    expect(page).toContain('挑食 / 不爱吃的食物')
    expect(page).toContain('v-model="form.preferredFoods"')
    expect(page).toContain('v-model="form.pickyFoods"')
    // 真过敏走「过敏」分类，这张卡只是口味
    expect(page).toContain('过敏≠不爱吃')
  })

  it('保存饮食偏好时两个字段一起提交，并一起参与"未保存"判定', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    // 只存一个字段会导致「喜欢吃的」改完被判成"没有未保存修改"，一点返回就白填
    expect(page).toContain('const savedDietPreferences = reactive({')
    expect(page).toContain('preferredFoods: form.preferredFoods,')
    expect(page).toContain('pickyFoods: form.pickyFoods,')
    expect(page).toContain('hasUnsavedDietReminderChange(form.preferredFoods, savedDietPreferences.preferredFoods)')
    expect(page).toContain('hasUnsavedDietReminderChange(form.pickyFoods, savedDietPreferences.pickyFoods)')
    expect(page).not.toContain('savedPickyFoods')
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

  it('五个书签齐全，顺序与老板给的一致（病史与体检已合并为「病例」）', () => {
    const page = readPage()

    expect(page).toContain('病例')
    expect(page).toContain('过敏')
    expect(page).toContain('疫苗')
    expect(page).toContain('饮食偏好')
    expect(page).toContain('体重管理')

    const order = ['visit', 'allergy', 'vaccine', 'diet', 'weight']
    const tabsBlock = page.slice(page.indexOf('const HEALTH_TABS'), page.indexOf('const RECORD_TAB_KEYS'))
    let cursor = -1
    for (const key of order) {
      const idx = tabsBlock.indexOf(`key: '${key}'`)
      expect(idx).toBeGreaterThan(cursor)
      cursor = idx
    }
  })

  it('一次只显示一个板块：每个板块都挂在书签条件上', () => {
    const page = readPage()

    // 三类记录共用一个组件
    expect(page).toContain('v-if="isRecordTab"')
    // 疫苗 / 饮食偏好 / 体重管理各挂各的书签
    expect(page).toContain("v-else-if=\"activeHealthTab === 'vaccine'\"")
    expect(page).toContain("v-else-if=\"activeHealthTab === 'diet'\"")
    expect(page).toContain("v-else-if=\"activeHealthTab === 'weight'\"")
  })

  it('记录类板块复用既有的三个类型，并关掉组件自带的重复标签', () => {
    const page = readPage()
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 「病例」是合并展示，「过敏」是单一类型 —— 两者共用同一个组件
    expect(page).toContain("const RECORD_TAB_KEYS: string[] = ['visit', 'allergy']")
    // 合并列表由 utils 产出，页面只负责取数
    expect(page).toContain('const visitRecords = computed(() => (')
    expect(page).toContain('mergeHealthVisitRecords(recordsByType.medical, recordsByType.checkup)')
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

    // 2026-09-30：文案只写「保存」—— 当前在哪个板块由书签与色系表达
    expect(page).toContain("const stickyPrimaryText = computed(() => '保存')")
    // 动作分派到对应板块暴露出来的保存方法
    expect(page).toContain('recordsSectionRef.value?.saveAllDirty?.()')
    expect(page).toContain('vaccineSectionRef.value?.saveAllDirty?.()')
    expect(page).toContain('weightSectionRef.value?.saveRecord?.()')
    // 「返回」统一挪到次按钮 —— 主按钮位已经被保存占满了
    expect(page).toContain('const stickySecondaryText = computed(() => HEALTH_ENTRY_LABELS[entrySource.value])')
  })

  it('三大记录板块（病史/体检/过敏）各自独立：标题用本类型的名字', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 原先三类共用一个「健康记录」标题，看着像一个大板块
    expect(section).toContain("embedded ? activeTypeMeta.label : '健康记录'")
    // 逐条保存按钮在内嵌模式下隐藏，改由底部统一保存
    expect(section).toContain('defineExpose({ saveAllDirty })')
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

  it('每个板块一套主题色，且保存按钮跟着板块变色（病史体检合并后为五套）', () => {
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
    // 2026-10-01：病史与体检合并成「病例」后是五个板块，切到哪块按钮就是哪块的色。
    expect(page).toContain(':primary-theme="activeHealthTab"')
    expect(bar).toContain('primaryTheme?:')
    for (const theme of ['visit', 'allergy', 'vaccine', 'diet', 'weight']) {
      expect(bar).toContain(`.sticky-bar__button--primary--${theme}`)
    }
    // 色系要铺到内容区 —— 只给书签文字上色不够（老板指出"色系没划分出来"）
    expect(compact).toContain('.health-theme--diet .health-panel__body')
  })
})
