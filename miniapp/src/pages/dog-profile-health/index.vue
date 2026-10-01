<template>
  <view class="page">
    <!-- 顶部 Banner（2026-10-01 老板调整）：
         左侧头像 + 名字（多只狗时可点切换），右侧是这个孩子的基本信息。
         原来的「健康管理」小标题与那句说明文字已删 —— Banner 是门面，
         一眼看到"这是谁、多大、什么品种、多重"就够了。 -->
    <view class="hero-card">
      <view class="hero-card__row">
        <picker
          v-if="dogs.length > 1"
          class="hero-card__identity"
          mode="selector"
          :range="dogs"
          range-key="name"
          :value="selectedDogIndex"
          @change="onDogPickerChange"
        >
          <view class="hero-card__identity-inner">
            <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
            <view class="hero-card__name-block">
              <view class="hero-card__name-row">
                <text class="hero-card__title">{{ form.name || '请选择狗狗' }}</text>
                <text class="hero-card__switch">切换 ▼</text>
              </view>
            </view>
          </view>
        </picker>
        <view v-else class="hero-card__identity">
          <view class="hero-card__identity-inner">
            <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
            <view class="hero-card__name-block">
              <text class="hero-card__title">{{ form.name || '健康档案' }}</text>
            </view>
          </view>
        </view>

        <view v-if="heroFacts.length" class="hero-card__facts">
          <view
            v-for="fact in heroFacts"
            :key="fact.label"
            class="hero-card__fact"
          >
            <text class="hero-card__fact-label">{{ fact.label }}</text>
            <text class="hero-card__fact-value">{{ fact.value }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadErrorRetry">重试</button>
    </view>

    <view v-else-if="isLoading && !dogId" class="state-card">
      <text class="state-card__title">正在加载狗狗档案</text>
      <text class="state-card__desc">正在获取可维护健康记录的狗狗列表，请稍候。</text>
    </view>

    <view v-else-if="hasNoDogs" class="state-card">
      <text class="state-card__title">还没有狗狗档案</text>
      <text class="state-card__desc">创建档案后，即可维护过敏、检查报告、疫苗、体重和饮食偏好。</text>
      <button class="state-card__button" @tap="goToDogCreate">创建狗狗档案</button>
    </view>

    <view v-else class="content">
      <view v-if="isProfileLoading" class="state-card">
        <text class="state-card__title">正在加载健康记录</text>
        <text class="state-card__desc">正在切换到所选狗狗，请稍候。</text>
      </view>

      <template v-else-if="dogId">
        <!-- 书签 + 板块拼成**一张卡**（老板要求：两者要有融合感，不能割裂）。
             书签是这张卡的头部，板块是它的内容区；每个板块一套主题色，
             高亮的下划线把当前书签和它下面的内容连起来。 -->
        <view class="health-panel" :class="`health-theme--${activeHealthTab}`">
          <view class="health-tabs">
            <text
              v-for="tab in HEALTH_TABS"
              :key="tab.key"
              class="health-tabs__item"
              :class="{ 'health-tabs__item--active': activeHealthTab === tab.key }"
              @tap="selectHealthTab(tab.key)"
            >{{ tab.label }}</text>
          </view>

          <view class="health-panel__body">
        <!-- 时间线与就诊前摘要的入口（2026-10-01，第二期）。

             老板明确：健康时间线**不以新的板块标签形式存在**，放在健康管理页里。
             所以它们是这一行的两个入口，五个板块下都看得到，也不占书签位。 -->
        <view class="health-shortcuts">
          <text class="health-shortcuts__item" @tap="goHealthTimeline">
            <text class="health-shortcuts__label">健康时间线</text>
            <text class="health-shortcuts__hint">{{ visitShortcutHint }}</text>
          </text>
          <text class="health-shortcuts__item" @tap="goVisitSummary">
            <text class="health-shortcuts__label">就诊前摘要</text>
            <text class="health-shortcuts__hint">看医生前先看这个</text>
          </text>
          <text class="health-shortcuts__item" @tap="goHealthAnalysis">
            <text class="health-shortcuts__label">健康分析</text>
            <text class="health-shortcuts__hint">七项初步分析</text>
          </text>
        </view>

        <HealthRecordsSection
          v-if="isRecordTab"
          ref="recordsSectionRef"
          :dog-id="dogId"
          embedded
          :active-type="activeRecordType"
          :records="activeRecordList"
          :loading="activeRecordLoading"
          :saving-record-key="savingRecordKey"
          :preferred-expanded-record-identity="preferredExpandedRecordIdentity"
          @change-type="activeRecordType = $event"
          @save-record="saveHealthRecord"
          @delete-record="deleteHealthRecord"
          @dirty-change="hasUnsavedRecordDraft = $event"
        >
          <!-- 过敏是最要紧的一类：一点即选 + 上传检测报告自动识别。
               建档流程从 2026-09-27 起完全不收集健康信息，这里是它的唯一入口。 -->
          <template #type-extra>
            <AllergyQuickAddSection
              v-if="activeRecordType === 'allergy'"
              :dog-id="dogId"
              :recorded-allergens="recordedAllergens"
              @saved="onAllergenSaved"
            />
          </template>
        </HealthRecordsSection>

        <!-- 疫苗管理（2026-09-27 新增）：后端接口早就有，顾客端一直没有入口 -->
        <template v-else-if="activeHealthTab === 'vaccine'">
          <!-- 疫苗计划（2026-10-01，第四期）：记录是"打过什么"，
               计划是"接下来怎么打"，计划放上面先看到。 -->
          <VaccinePlanSection :dog-id="dogId" />
          <VaccineManagementSection
            ref="vaccineSectionRef"
            external-save
            :dog-id="dogId"
            @dirty-change="hasUnsavedSectionDraft = $event"
          />
        </template>

        <view v-else-if="activeHealthTab === 'diet'" class="diet-tab">
          <!-- 结构化偏好 + 变更历史（2026-10-01，第五期） -->
          <DietPreferenceSection :dog-id="dogId" />

          <!-- 原来的两个自由文本框**保留**：配方设计仍在用，
               而且顾客已经填过的文字不能凭空消失。 -->
          <view class="health-section health-card diet-reminder-card">
            <text class="health-section__title">原来的文字描述</text>
            <text class="health-section__desc">
              这两栏会继续进推荐与配方。上面的条目整理好之后，这里可以留作补充说明。
            </text>

            <view class="field-group">
              <text class="field-label">喜欢吃的食材</text>
              <textarea
                class="field-textarea"
                placeholder="例如：鸡胸肉、南瓜、三文鱼"
                v-model="form.preferredFoods"
              />
            </view>

            <view class="field-group">
              <text class="field-label">挑食 / 不爱吃的食物</text>
              <!-- 过敏≠不爱吃：真过敏走上面的「过敏」分类，这里只是口味 -->
              <text v-if="dietReminderStatusText" class="field-help">{{ dietReminderStatusText }}</text>
              <textarea
                class="field-textarea"
                placeholder="例如：胡萝卜、羊肉"
                v-model="form.pickyFoods"
              />
            </view>
          </view>
        </view>

        <WeightManagementSection
          v-else-if="activeHealthTab === 'weight'"
          ref="weightSectionRef"
          external-save
          :dog-id="dogId"
          :dog-profile="weightSectionDogProfile"
          @dirty-change="hasUnsavedSectionDraft = $event"
        />
          </view>
        </view>
      </template>

      <view v-else class="section-card">
        <text class="section-card__title">先选择狗狗</text>
        <text class="state-card__desc">选择一只狗狗后，即可维护过敏、检查报告、疫苗、体重和饮食偏好。</text>
        <button class="state-card__button" @tap="goToDogCreate">创建狗狗档案</button>
      </view>
    </view>

    <!-- 底部按钮按当前板块自适应（老板要求）：
         · 饮食偏好是**页面自己持有数据**的板块，所以由底部按钮保存；
         · 其余五个板块（病史/体检/过敏/疫苗/体重管理）各自在板块内有保存按钮
           （每条记录单独保存），底部再放一个"保存"没有意义，只会让人不知道
           它到底在存什么 —— 所以那些书签下不显示保存按钮。
         · 返回按钮的文案跟着入口走。 -->
    <StickyActionBar
      :primary-text="stickyPrimaryText"
      :secondary-text="stickySecondaryText"
      :primary-disabled="stickyPrimaryDisabled"
      :primary-theme="activeHealthTab"
      :secondary-disabled="isSecondaryActionDisabled"
      @primary="onStickyPrimary"
      @secondary="goBack"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import AllergyQuickAddSection from '../../components/dog-profile/AllergyQuickAddSection.vue'
import VaccineManagementSection from '../../components/dog-profile/VaccineManagementSection.vue'
import VaccinePlanSection from '../../components/dog-profile/VaccinePlanSection.vue'
import DietPreferenceSection from '../../components/dog-profile/DietPreferenceSection.vue'
import WeightManagementSection from '../../components/dog-profile/WeightManagementSection.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { buildHealthHeroFacts } from '../../utils/health-hero'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
  buildHealthVisitPayload,
  mergeHealthVisitRecords,
  normalizeHealthVisitRecord,
  buildCrudHealthRecordPayload,
  buildHealthRecordFocusIdentity,
  hasUnsavedDietReminderChange,
  mergeHealthRecordListWithCachedAttachments,
  normalizeHealthRecordListResponse,
  normalizeSavedHealthRecordResponse,
  removeHealthRecordAttachmentCache,
  removeHealthRecordFromList,
  replaceHealthRecordInList,
  resolveDogHealthSelectionState,
  shouldDiscardDogHealthProfileResponse,
  writeHealthRecordAttachmentCache,
} from '../../utils/health-records'
import { navigateToDogCreate } from '../../utils/dog-profile-entry'

interface DogProfileSummary {
  id: string
  name: string
}

const dogId = ref('')
const dogs = ref<DogProfileSummary[]>([])
const selectedDogIndex = ref(-1)
const isLoading = ref(false)
const isProfileLoading = ref(false)
const isSaving = ref(false)
const hasNoDogs = ref(false)
const loadError = ref('')
const latestRequestedDogId = ref('')
/**
 * 板块书签（2026-09-30，老板要求）。
 *
 * 六个板块原先全部平铺在页面上，一屏里挤着病史、体检、过敏、疫苗、
 * 饮食偏好、体重管理六套内容，显得杂乱。改成书签：一次只显示一个。
 *
 * 病史/体检/过敏复用 HealthRecordsSection（三类记录本来就一次全加载，
 * 切书签不需要重新请求），疫苗/饮食偏好/体重管理各自是独立板块。
 */
/**
 * 板块书签（2026-10-01 改版）。
 *
 * 病史与体检合并成「病例」：在顾客眼里这就是一件事——"带狗去看了一次医生"。
 * 分成两个板块，家长要先判断"这算病史还是体检"才能动手记，是负担。
 *
 * ★ 合并只在界面层：两条记录仍然分别存在 medical_record / checkup_record
 *   两张表里，保存时按记录自己的类型走原接口。
 */
type HealthTabKey = 'visit' | 'allergy' | 'vaccine' | 'diet' | 'weight'

const HEALTH_TABS: { key: HealthTabKey; label: string }[] = [
  { key: 'visit', label: '病例' },
  { key: 'allergy', label: '过敏' },
  { key: 'vaccine', label: '疫苗' },
  { key: 'diet', label: '饮食' },
  { key: 'weight', label: '体重' },
]

/** 走 HealthRecordsSection 的板块：「病例」是合并展示，过敏是单一类型 */
const RECORD_TAB_KEYS: string[] = ['visit', 'allergy']

/**
 * 从哪个入口进来的。
 *
 * 首页和爱犬概览页都有健康管理入口，底部按钮不能一律写「返回概览」——
 * 从首页进来的顾客看到「返回概览」是说不通的（老板指出）。
 * 有页面栈时 navigateBack 本来就会回到入口页；这里的来源只用于
 * **按钮文案**，以及页面被 redirect 掉、栈里没有上一页时的兜底返回。
 */
type HealthEntrySource = 'home' | 'overview' | 'unknown'
const entrySource = ref<HealthEntrySource>('unknown')

const HEALTH_ENTRY_LABELS: Record<HealthEntrySource, string> = {
  home: '返回首页',
  overview: '返回概览',
  unknown: '返回',
}

const activeHealthTab = ref<HealthTabKey>('visit')

/** 当前书签是否是「记录类」（病史/体检/过敏）—— 这三个共用同一个组件 */
const isRecordTab = computed(() => RECORD_TAB_KEYS.includes(activeHealthTab.value))

/** 传给 HealthRecordsSection 的板块标识：'visit' 表示就诊+体检合并展示 */
const activeRecordType = computed<HealthRecordType | 'visit'>(() =>
  isRecordTab.value ? (activeHealthTab.value as HealthRecordType | 'visit') : 'medical',
)

/**
 * 「病例」列表：把病史和体检两类记录合成一条按日期倒序的列表。
 * 合并逻辑放在 utils 里（有测试覆盖），页面只负责取数。
 */
const visitRecords = computed(() => (
  mergeHealthVisitRecords(recordsByType.medical, recordsByType.checkup)
))
const visitLoading = computed(() => loadingByType.medical || loadingByType.checkup)

/** 当前「病例」板块要展示的记录与加载态 */
const activeRecordList = computed(() => (
  activeHealthTab.value === 'visit' ? visitRecords.value : recordsByType.allergy
))
const activeRecordLoading = computed(() => (
  activeHealthTab.value === 'visit' ? visitLoading.value : loadingByType.allergy
))

function selectHealthTab(key: HealthTabKey) {
  activeHealthTab.value = key
  // 各板块的未保存状态是各自汇报的，切换时要清掉上一个板块留下的值，
  // 否则新板块明明没改动，底部按钮却亮着
  hasUnsavedSectionDraft.value = false
  hasUnsavedRecordDraft.value = false
}


const recordsByType = reactive<Record<HealthRecordType, Record<string, any>[]>>({
  medical: [],
  checkup: [],
  allergy: [],
})
const loadingByType = reactive<Record<HealthRecordType, boolean>>({
  medical: false,
  checkup: false,
  allergy: false,
})
const savingRecordKey = ref('')
const hasUnsavedRecordDraft = ref(false)
const healthRecordFocusIdentity = reactive<Record<HealthRecordType, string>>({
  medical: '',
  checkup: '',
  allergy: '',
})

/**
 * 「病例」合并页上一次真正保存/删除的是哪一类记录（就诊还是体检）。
 *
 * 合并页本身没有单一类型，但"保存完要把刚存的那条展开"这件事必须知道类型，
 * 否则展开标识取不到值、保存后列表不会定位到那条记录。
 */
const lastVisitRecordType = ref<HealthRecordType>('medical')

/** 传给记录组件的"优先展开标识"：合并页取上一次动过的那一类 */
const preferredExpandedRecordIdentity = computed(() => {
  const type = activeRecordType.value
  return healthRecordFocusIdentity[type === 'visit' ? lastVisitRecordType.value : type]
})
/**
 * 饮食偏好（喜欢吃的 / 不爱吃的）上一次保存的值。
 *
 * 两个字段一起记：上次只存了"不爱吃"，于是「喜欢吃的食材」改完
 * 会被判定成"没有未保存修改"，顾客一点返回就白填。
 */
const savedDietPreferences = reactive({
  preferredFoods: '',
  pickyFoods: '',
})
const isHealthRecordSaving = computed(() => Boolean(savingRecordKey.value))
const isDietReminderActionDisabled = computed(() =>
  !dogId.value || isProfileLoading.value || isSaving.value || isHealthRecordSaving.value,
)
const isSecondaryActionDisabled = computed(() =>
  isLoading.value || isSaving.value || isHealthRecordSaving.value,
)
const selectedDog = computed(() => (
  selectedDogIndex.value >= 0 ? dogs.value[selectedDogIndex.value] || null : null
))

/** 档案里已经记过的过敏原：给「快速添加」做去重与"已记"标记 */
const recordedAllergens = computed(() => (recordsByType.allergy || [])
  .map(record => String(record?.allergen || '').trim())
  .filter(Boolean))

/**
 * 快速添加/报告识别写了一条过敏记录后，把过敏列表拉回来。
 *
 * 不在这里手动往数组里塞：接口返回的才是权威数据（含 id 与附件缓存），
 * 手动塞容易和「未保存草稿」的判定打架。
 */
async function onAllergenSaved() {
  if (!dogId.value) {
    return
  }

  await loadHealthRecordList('allergy', dogId.value)
}

// 体重管理区块需要的档案信息
const weightSectionDogProfile = computed(() => ({
  currentWeightKg: form.currentWeightKg
    ? Number(form.currentWeightKg)
    : null,
  // 阶段 B2-7：体况分决定要不要给「制定计划」入口 ——
  // BCS 4-5 是理想区间，本来就不需要增减重计划，不该在页面上推销
  bcsScore: form.bcsScore ? Number(form.bcsScore) : null,
}))
/**
 * Banner 里的头像。
 *
 * 用与爱犬概览页同一个解析函数：没上传头像时给统一的默认头像，
 * 不在这里各写一份兜底逻辑。
 */
const dogAvatarSrc = computed(() => resolveDogAvatarSrc(form.avatarUrl))

/**
 * Banner 右侧的基本信息（年龄 / 性别 / 品种 / 体重）。
 *
 * 缺哪项不显示哪项 —— 规则在 utils/health-hero.ts 里，有单元测试。
 */
const heroFacts = computed(() => buildHealthHeroFacts(form))

const hasUnsavedDietReminder = computed(() => (
  hasUnsavedDietReminderChange(form.preferredFoods, savedDietPreferences.preferredFoods) ||
  hasUnsavedDietReminderChange(form.pickyFoods, savedDietPreferences.pickyFoods)
))

const form = reactive<Record<string, any>>({
  id: '',
  name: '',
  avatarUrl: '',
  breedId: '',
  breedName: '',
  customBreedName: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'LOW',
  lifeStageOverride: 'NONE',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  preferredFoods: '',
  pickyFoods: '',
})

const dietReminderStatusText = computed(() => {
  if (hasUnsavedDietReminder.value) {
    return '已修改，待保存'
  }

  const saved = String(savedDietPreferences.preferredFoods || '').trim() ||
    String(savedDietPreferences.pickyFoods || '').trim()
  if (saved) {
    return '已保存'
  }

  return ''
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  const from = Array.isArray(options?.from) ? options.from[0] : options?.from
  // 记住从哪进来的：底部按钮的文案与"兜底返回"都要跟着变（老板要求）
  entrySource.value = from === 'home' || from === 'overview' ? from : 'unknown'
  void loadDogs(typeof value === 'string' ? value : '')
})

/**
 * 从建档页返回时本页不会重新挂载：原先 onLoad 只跑一次，
 * 「还没有狗狗档案」的空态会一直留着，用户看不到刚建好的狗。
 */
onShow(() => {
  if (!dogs.value.length) {
    void loadDogs()
  }
})

async function loadDogs(preferredDogId = '') {
  isLoading.value = true
  hasNoDogs.value = false
  loadError.value = ''

  try {
    uni.showLoading({ title: '加载中...' })
    const res: any = await dogApi.list()
    if (res.code !== 0 || !Array.isArray(res.data)) {
      throw new Error(res.message || '加载狗狗列表失败')
    }

    dogs.value = res.data
    const selection = resolveDogHealthSelectionState(dogs.value, preferredDogId)

    if (selection.hasNoDogs) {
      dogId.value = ''
      selectedDogIndex.value = -1
      latestRequestedDogId.value = ''
      resetHealthForm()
      hasNoDogs.value = true
      return
    }

    await selectDogByIndex(selection.selectedIndex)
  } catch (error: any) {
    if (preferredDogId) {
      latestRequestedDogId.value = preferredDogId
      selectedDogIndex.value = -1
      resetHealthForm()
      await Promise.all([
        loadDogProfile(preferredDogId),
        loadAllHealthRecordLists(preferredDogId),
      ])
      return
    }

    loadError.value = error?.message || '加载狗狗列表失败，请稍后重试。'
  } finally {
    isLoading.value = false
    uni.hideLoading()
  }
}

function onDogPickerChange(event: any) {
  const index = Number(event?.detail?.value)
  if (!Number.isInteger(index)) {
    return
  }

  if (isSaving.value || isProfileLoading.value || isHealthRecordSaving.value) {
    selectedDogIndex.value = getCurrentDogIndex()
    return
  }

  if (hasUnsavedDietReminder.value || hasUnsavedRecordDraft.value) {
    confirmSwitchDogWithUnsavedChanges(index)
    return
  }

  void selectDogByIndex(index)
}

async function selectDogByIndex(index: number) {
  const nextDog = dogs.value[index]
  if (!nextDog?.id) {
    return
  }

  const requestedDogId = nextDog.id
  selectedDogIndex.value = index
  dogId.value = ''
  latestRequestedDogId.value = requestedDogId
  isProfileLoading.value = true
  resetHealthForm()
  healthRecordFocusIdentity.medical = ''
  healthRecordFocusIdentity.checkup = ''
  healthRecordFocusIdentity.allergy = ''
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'edit',
    dogId: requestedDogId,
    moduleName: 'health',
  })
  await Promise.all([
    loadDogProfile(requestedDogId),
    loadAllHealthRecordLists(requestedDogId),
  ])
}

function loadErrorRetry() {
  if (dogId.value) {
    const requestedDogId = dogId.value
    void Promise.all([
      loadDogProfile(requestedDogId),
      loadAllHealthRecordLists(requestedDogId),
    ])
    return
  }

  void loadDogs()
}

function getCurrentDogIndex() {
  const index = dogs.value.findIndex(dog => dog.id === dogId.value)
  return index >= 0 ? index : selectedDogIndex.value
}

function confirmSwitchDogWithUnsavedChanges(index: number) {
  uni.showModal({
    title: '切换狗狗？',
    content: '当前页面有未保存的修改，切换后会放弃本次修改。',
    confirmText: '继续切换',
    cancelText: '继续编辑',
    success: (res) => {
      if (res.confirm) {
        void selectDogByIndex(index)
        return
      }

      selectedDogIndex.value = getCurrentDogIndex()
    },
    fail: () => {
      selectedDogIndex.value = getCurrentDogIndex()
    },
  })
}

function resetHealthForm() {
  form.id = ''
  form.name = ''
  form.breedId = ''
  form.breedName = ''
  form.customBreedName = ''
  form.birthday = ''
  form.gender = 'MALE'
  form.isNeutered = false
  form.currentWeightKg = ''
  form.bcsScore = 5
  form.activityLevel = 'LOW'
  form.lifeStageOverride = 'NONE'
  form.sizeClassOverride = null
  form.mealsPerDay = '2'
  form.treatInputMode = 'ESTIMATE_LEVEL'
  form.treatLevel = 'LOW'
  form.manualTreatKcal = ''
  form.preferredFoods = ''
  form.pickyFoods = ''
  savedDietPreferences.preferredFoods = ''
  savedDietPreferences.pickyFoods = ''
  savingRecordKey.value = ''
  hasUnsavedRecordDraft.value = false
  for (const type of HEALTH_RECORD_TYPES) {
    recordsByType[type] = []
    loadingByType[type] = false
  }
}

async function loadDogProfile(requestedDogId: string) {
  if (!requestedDogId) {
    return
  }

  latestRequestedDogId.value = requestedDogId
  isProfileLoading.value = true
  loadError.value = ''

  try {
    uni.showLoading({ title: '加载中...' })
    const res: any = await dogApi.detail(requestedDogId)
    if (res.code !== 0 || !res.data?.profile) {
      throw new Error(res.message || '加载狗狗档案失败')
    }

    if (shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      return
    }

    dogId.value = requestedDogId
    populateForm(res.data.profile)
  } catch (error: any) {
    if (shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      return
    }

    dogId.value = ''
    loadError.value = error?.message || '加载狗狗档案失败，请稍后重试。'
  } finally {
    if (!shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      isProfileLoading.value = false
      uni.hideLoading()
    }
  }
}

function populateForm(profile: Record<string, any>) {
  form.id = profile.id || ''
  form.name = profile.name || ''
  form.avatarUrl = profile.avatarUrl || ''
  form.breedId = profile.breedId || ''
  form.breedName = profile.breedName || ''
  form.customBreedName = profile.customBreedName || ''
  form.birthday = profile.birthday ? new Date(profile.birthday).toISOString().split('T')[0] : ''
  form.gender = profile.gender || 'MALE'
  form.isNeutered = profile.isNeutered ?? false
  form.currentWeightKg = profile.currentWeightKg?.toString() || ''
  form.bcsScore = profile.bcsScore ?? 5
  form.activityLevel = profile.activityLevel || 'LOW'
  form.lifeStageOverride = profile.lifeStageOverride || 'NONE'
  form.sizeClassOverride = profile.sizeClassOverride || null
  form.mealsPerDay = (profile.mealsPerDay || 2).toString()
  form.treatInputMode = profile.treatInputMode || 'ESTIMATE_LEVEL'
  form.treatLevel = profile.treatLevel || 'LOW'
  form.manualTreatKcal = profile.manualTreatKcal?.toString() || ''
  form.preferredFoods = typeof profile.preferredFoods === 'string' ? profile.preferredFoods : ''
  form.pickyFoods = typeof profile.pickyFoods === 'string' ? profile.pickyFoods : ''
  savedDietPreferences.preferredFoods = form.preferredFoods
  savedDietPreferences.pickyFoods = form.pickyFoods
}

function recordApiForType(type: HealthRecordType) {
  if (type === 'medical') {
    return dogApi.healthRecords.medical
  }

  if (type === 'checkup') {
    return dogApi.healthRecords.checkup
  }

  return dogApi.healthRecords.allergy
}

/**
 * 按记录类型分派保存（2026-10-01 自查补）。
 *
 * 就诊与体检走两张表、两个接口、两套 payload，过敏又是第三套。
 * 逐个分支写，类型与接口才对得上；运行时行为与原来完全一致。
 */
async function saveByRecordType(
  type: HealthRecordType,
  targetDogId: string,
  recordId: string,
  record: Record<string, any>,
) {
  if (type === 'medical') {
    const payload = buildHealthVisitPayload('medical', record)
    return recordId
      ? dogApi.healthRecords.medical.update(targetDogId, recordId, payload)
      : dogApi.healthRecords.medical.create(targetDogId, payload)
  }

  if (type === 'checkup') {
    const payload = buildHealthVisitPayload('checkup', record)
    return recordId
      ? dogApi.healthRecords.checkup.update(targetDogId, recordId, payload)
      : dogApi.healthRecords.checkup.create(targetDogId, payload)
  }

  const payload = buildCrudHealthRecordPayload('allergy', record)
  return recordId
    ? dogApi.healthRecords.allergy.update(targetDogId, recordId, payload)
    : dogApi.healthRecords.allergy.create(targetDogId, payload)
}

function recordListApiForType(type: HealthRecordType) {
  if (type === 'medical') {
    return dogApi.healthRecords.medical.list
  }

  if (type === 'checkup') {
    return dogApi.healthRecords.checkup.list
  }

  return dogApi.healthRecords.allergy.list
}

function shouldDiscardHealthRecordListResponse(requestedDogId: string) {
  return shouldDiscardDogHealthProfileResponse({
    requestedDogId,
    latestRequestedDogId: latestRequestedDogId.value,
  })
}

async function loadHealthRecordList(type: HealthRecordType, targetDogId = dogId.value) {
  if (!targetDogId) {
    recordsByType[type] = []
    return
  }

  loadingByType[type] = true

  try {
    const res: any = await recordListApiForType(type)(targetDogId)
    if (shouldDiscardHealthRecordListResponse(targetDogId)) {
      return
    }

    if (res.code !== 0) {
      throw new Error(res.message || '加载健康记录失败')
    }

    recordsByType[type] = mergeHealthRecordListWithCachedAttachments(
      targetDogId,
      type,
      normalizeHealthRecordListResponse(res),
    )
  } catch (error: any) {
    if (shouldDiscardHealthRecordListResponse(targetDogId)) {
      return
    }

    recordsByType[type] = []
    uni.showToast({ title: error?.message || '加载健康记录失败', icon: 'none' })
  } finally {
    if (!shouldDiscardHealthRecordListResponse(targetDogId)) {
      loadingByType[type] = false
    }
  }
}

async function loadAllHealthRecordLists(targetDogId: string) {
  await Promise.all(
    HEALTH_RECORD_TYPES.map(type => loadHealthRecordList(type, targetDogId)),
  )
}

async function saveHealthRecord({
  type,
  record,
  recordKey,
}: {
  type: HealthRecordType
  record: Record<string, any>
  recordKey: string
}) {
  if (!dogId.value) {
    return
  }

  const targetDogId = dogId.value
  const recordId = typeof record.id === 'string' ? record.id : ''
  const nextSavingKey = recordId || recordKey || buildHealthRecordFocusIdentity(type, record)
  savingRecordKey.value = nextSavingKey

  try {
    // 「病例」合并后，一条记录可能是就诊也可能是体检 —— 组件已经把它的
    // 真实类型放在 type 里传上来，按类型分别走原来那两个接口。
    //
    // 这里按类型逐个分支（而不是先算出 payload 再统一调用）：
    // 三个接口的 payload 类型各不相同，写成联合类型会被类型检查拦下，
    // 而"先算 payload 再分派"恰恰丢掉了类型与接口的对应关系。
    const res: any = await saveByRecordType(type, targetDogId, recordId, record)

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '保存失败')
    }

    if (targetDogId !== dogId.value) {
      return
    }

    const nextRecord = type === 'allergy'
      ? normalizeSavedHealthRecordResponse(res.data, record)
      : normalizeHealthVisitRecord(type, res.data)
    writeHealthRecordAttachmentCache(targetDogId, type, nextRecord)
    recordsByType[type] = replaceHealthRecordInList(recordsByType[type], nextRecord)
    healthRecordFocusIdentity[type] = buildHealthRecordFocusIdentity(type, nextRecord)
    lastVisitRecordType.value = type
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    if (savingRecordKey.value === nextSavingKey) {
      savingRecordKey.value = ''
    }
  }
}

async function deleteHealthRecord({
  type,
  record,
}: {
  type: HealthRecordType
  record: Record<string, any>
}) {
  if (!dogId.value || !record.id) {
    return
  }

  const targetDogId = dogId.value
  const recordId = String(record.id)
  const nextSavingKey = recordId || buildHealthRecordFocusIdentity(type, record)
  savingRecordKey.value = nextSavingKey

  try {
    const res: any = await recordApiForType(type).delete(targetDogId, recordId)
    if (res.code !== 0) {
      throw new Error(res.message || '删除失败')
    }

    if (targetDogId !== dogId.value) {
      return
    }

    removeHealthRecordAttachmentCache(targetDogId, type, record)
    recordsByType[type] = removeHealthRecordFromList(recordsByType[type], recordId)
    uni.showToast({ title: '已删除', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
  } finally {
    if (savingRecordKey.value === nextSavingKey) {
      savingRecordKey.value = ''
    }
  }
}

async function saveDietReminders() {
  if (!dogId.value || isProfileLoading.value || isHealthRecordSaving.value) {
    return
  }

  const targetDogId = dogId.value
  isSaving.value = true

  try {
    void trackDogProfileEvent('dog_profile_submit_requested', {
      mode: 'edit',
      dogId: targetDogId,
      moduleName: 'health',
      submitStatus: 'requested',
    })
    uni.showLoading({ title: '保存中...' })
    const res: any = await dogApi.updateDietReminders(targetDogId, {
      preferredFoods: form.preferredFoods,
      pickyFoods: form.pickyFoods,
    })
    if (res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }

    if (targetDogId === dogId.value && res.data?.profile) {
      populateForm(res.data.profile)
    } else if (targetDogId === dogId.value) {
      savedDietPreferences.preferredFoods = form.preferredFoods
      savedDietPreferences.pickyFoods = form.pickyFoods
    }

    void trackDogProfileEvent('dog_profile_submit_succeeded', {
      mode: 'edit',
      dogId: targetDogId,
      moduleName: 'health',
      submitStatus: 'success',
    })
    uni.hideLoading()
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      goBack()
    }, 300)
  } catch (error: any) {
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'edit',
      dogId: targetDogId,
      moduleName: 'health',
      submitStatus: 'failed',
    })
    uni.hideLoading()
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    isSaving.value = false
  }
}

/**
 * 底部主按钮：**每个书签都保存它自己的那一块**（老板要求）。
 *
 * 文案是「保存 + 当前书签名」，动作调对应板块暴露出来的保存方法 ——
 * 各板块内部的保存按钮在内嵌模式下已隐藏，顾客只需要认底部这一个位置。
 */
const recordsSectionRef = ref<{ saveAllDirty?: () => Promise<void> } | null>(null)
const vaccineSectionRef = ref<{ saveAllDirty?: () => Promise<void> } | null>(null)
const weightSectionRef = ref<{ saveRecord?: () => Promise<void> } | null>(null)

/** 疫苗/体重板块自己的未保存状态（病史/体检/过敏复用 hasUnsavedRecordDraft） */
const hasUnsavedSectionDraft = ref(false)


/**
 * 底部保存按钮的文案只写「保存」（老板要求）。
 * 当前在哪个板块由上面的书签和色系表达，按钮不必再重复一遍板块名。
 */
const stickyPrimaryText = computed(() => '保存')

/** 当前书签下有没有待保存的内容 —— 没有就把按钮置灰，别让顾客白点 */
const hasUnsavedInActiveTab = computed(() => {
  if (activeHealthTab.value === 'diet') {
    return !isDietReminderActionDisabled.value
  }
  if (isRecordTab.value) {
    return hasUnsavedRecordDraft.value
  }
  return hasUnsavedSectionDraft.value
})

const stickyPrimaryDisabled = computed(
  () => isSecondaryActionDisabled.value || !hasUnsavedInActiveTab.value,
)

/**
 * 次按钮就是「返回」。六个板块现在都能从底部保存，主按钮位被占满了，
 * 所以返回统一放在次按钮上，不再随书签变来变去。
 */
const stickySecondaryText = computed(() => HEALTH_ENTRY_LABELS[entrySource.value])

async function onStickyPrimary() {
  if (activeHealthTab.value === 'diet') {
    await saveDietReminders()
    return
  }
  if (isRecordTab.value) {
    await recordsSectionRef.value?.saveAllDirty?.()
    return
  }
  if (activeHealthTab.value === 'vaccine') {
    await vaccineSectionRef.value?.saveAllDirty?.()
    return
  }
  if (activeHealthTab.value === 'weight') {
    await weightSectionRef.value?.saveRecord?.()
  }
}

function goBack() {
  if (isHealthRecordSaving.value) {
    return
  }

  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }

  // 栈里没有上一页时的兜底：按入口来源回，而不是一律回概览
  if (entrySource.value === 'home') {
    uni.redirectTo({ url: '/pages/home/index' })
    return
  }

  if (!dogId.value) {
    uni.redirectTo({ url: '/pages/home/index' })
    return
  }

  uni.redirectTo({
    url: `/pages/dog-profile-overview/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

/**
 * 健康时间线 / 就诊前摘要的入口（2026-10-01，第二期）。
 *
 * 两个页面都在分包 pages/dog-health 里（重页面不进主包）。
 */
function goHealthTimeline() {
  if (!dogId.value) {
    return
  }
  uni.navigateTo({
    url: `/pages/dog-health/timeline?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

function goVisitSummary() {
  if (!dogId.value) {
    return
  }
  uni.navigateTo({
    url: `/pages/dog-health/summary?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

/** 时间线入口上的小字：让顾客知道里面有多少条，不然不会点 */
const visitShortcutHint = computed(() => {
  const count =
    (recordsByType.medical?.length || 0) +
    (recordsByType.checkup?.length || 0) +
    (recordsByType.allergy?.length || 0)
  return count > 0 ? `已记 ${count} 条` : '还没有记录'
})

/**
 * AI 健康分析（2026-10-01，第七期）。
 *
 * 顾客侧默认未开放（知识尚未经专业审核），页面会如实说明原因。
 */
function goHealthAnalysis() {
  if (!dogId.value) {
    return
  }
  uni.navigateTo({
    url: `/pages/dog-health/analysis?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

function goToDogCreate() {
  // 2026-09-21：由 redirectTo 改为 navigateTo。
  // 原先 redirectTo 会把健康管理页从页面栈里替换掉，建档完成后无法回到这里；
  // 现在保留本页，建档成功 navigateBack 回来即可直接维护健康记录。
  navigateToDogCreate({ source: 'health' })
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(132rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top right, rgba(176, 141, 79, 0.12), transparent 26%),
    linear-gradient(180deg, #f0f3e9 0%, #f2f4ea 100%);
}

.hero-card {
  padding: 32rpx;
  border-radius: 28rpx;
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

/* 一行装下：左边头像+名字，右边基本信息 */
.hero-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.hero-card__identity {
  flex: 1;
  min-width: 0;
}

.hero-card__identity-inner {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.hero-card__avatar {
  flex: none;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: rgba(243, 237, 221, 0.14);
  border: 2rpx solid rgba(216, 188, 133, 0.55);
}

.hero-card__name-block {
  min-width: 0;
}

.hero-card__title {
  display: block;
  font-size: 42rpx;
  font-weight: 800;
  /* 名字过长时省略，不要把右边的信息挤没了 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 右侧基本信息：四行"标签 + 值"，右对齐 */
.hero-card__facts {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  text-align: right;
}

.hero-card__fact {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 12rpx;
}

.hero-card__fact-label {
  font-size: 22rpx;
  color: rgba(243, 237, 221, 0.62);
}

.hero-card__fact-value {
  max-width: 240rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #f3eddd;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.content,
.state-card {
  margin-top: 24rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section-card,
.state-card {
  padding: 30rpx;
  border-radius: 30rpx;
  background: #fbfcf7;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
}

.section-card__title,
.state-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.section-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* Banner 的「名称 + 切换」一行：选择器并进名称行后不再单开卡片 */
.hero-card__name-row {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.hero-card__switch {
  flex: none;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.82);
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.5);
}

/*
 * 书签 + 板块 = **一张卡**。
 *
 * 之前书签是一张独立的胶囊，板块又是一张独立的卡，中间还留着间距 ——
 * 两者看着是两件事（老板说"有割裂感"）。现在书签是这张卡的头部，
 * 板块是它的内容区，内部各板块不再自己画卡。
 */
/*
 * 主题色的**单一来源**：板块内所有按钮都取这个变量。
 *
 * 子组件（记录/疫苗/过敏/体重）与父页面之间是**样式隔离**的 ——
 * 父页面的选择器进不去，但 CSS 自定义属性是**继承**的，能穿过组件边界。
 * 所以这里定义变量、子组件用 var(--health-accent, 原色) 兜底，
 * 两边都不用互相知道对方的存在。
 */
.health-panel { --health-accent: #0f6b43; }
.health-theme--visit { --health-accent: #0f7b49;  --health-accent-soft: #e6f2ea; }
.health-theme--allergy { --health-accent: #ad5b2a;  --health-accent-soft: #f7e9e0; }
.health-theme--vaccine { --health-accent: #6b5b9b;  --health-accent-soft: #ece9f5; }
.health-theme--diet { --health-accent: #b07a1e;  --health-accent-soft: #f7eedd; }
.health-theme--weight { --health-accent: #0e6f78;  --health-accent-soft: #e2f0f2; }

.health-panel {
  border-radius: 30rpx;
  background: #fbfcf7;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
  overflow: hidden;
}

/*
 * 书签条：模仿 Chrome 的标签页（老板要求）。
 *
 * Chrome 的关键特征，这里逐条对应：
 *   1. 标签栏底色比内容区**略深**，像浏览器窗口顶部那条
 *   2. 每个标签是**上圆角**的片，未选中的是浅底 + 彼此之间有细分隔线
 *   3. **选中的标签与下方内容同色、且没有底边** —— 看着像"长"在内容上
 *   4. 选中标签顶部一条主题色，起高亮作用
 *
 * 第 3 条靠"负外边距 + 用内容底色盖住标签栏的底边"实现：
 * 这是纯 CSS 里让标签与内容连成一体的经典做法。
 */
.health-tabs {
  display: flex;
  align-items: flex-end;
  padding: 10rpx 10rpx 0;
  background: rgba(30, 46, 36, 0.055);
  border-bottom: 1rpx solid rgba(30, 46, 36, 0.08);
}

/* 六个书签等宽（老板要求） */
.health-tabs__item {
  flex: 1 1 0;
  min-width: 0;
  padding: 16rpx 0 18rpx;
  text-align: center;
  font-size: 24rpx;
  color: #6b7566;
  background: rgba(30, 46, 36, 0.045);
  border-radius: 14rpx 14rpx 0 0;
  /* 未选中标签之间的分隔线（Chrome 也有） */
  border-right: 1rpx solid rgba(30, 46, 36, 0.07);
}

.health-tabs__item:last-child {
  border-right: none;
}

.health-tabs__item--active {
  font-weight: 700;
  /* 与内容区同色 → 连成一体 */
  background: #fbfcf7;
  /* 顶部主题色高亮条 */
  border-top: 5rpx solid transparent;
  /* 左右分隔线让开，避免把"长在内容上"的观感切断 */
  border-right-color: transparent;
  border-left: 1rpx solid rgba(30, 46, 36, 0.07);
  /* 盖住标签栏的底边 —— 这一步才真正让它和内容连起来 */
  margin-bottom: -1rpx;
  padding-bottom: 19rpx;
}

/*
 * 每个板块一套主题色。下划线取主题色，选中文字也用主题色。
 * 六个颜色都取低饱和，和整站的米绿底色放一起不刺眼。
 */
.health-theme--visit .health-tabs__item--active { color: #0f7b49; border-top-color: #0f7b49; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--visit .health-panel__body,
.health-theme--visit .health-tabs__item--active { background: #edf6f1; }
.health-theme--allergy .health-tabs__item--active { color: #ad5b2a; border-top-color: #ad5b2a; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--allergy .health-panel__body,
.health-theme--allergy .health-tabs__item--active { background: #fbf1ea; }
.health-theme--vaccine .health-tabs__item--active { color: #6b5b9b; border-top-color: #6b5b9b; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--vaccine .health-panel__body,
.health-theme--vaccine .health-tabs__item--active { background: #f2f0f8; }
.health-theme--diet .health-tabs__item--active { color: #b07a1e; border-top-color: #b07a1e; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--diet .health-panel__body,
.health-theme--diet .health-tabs__item--active { background: #faf3e8; }
.health-theme--weight .health-tabs__item--active { color: #0e6f78; border-top-color: #0e6f78; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--weight .health-panel__body,
.health-theme--weight .health-tabs__item--active { background: #ebf4f5; }

/* 时间线 / 就诊前摘要的入口：两个等宽小卡 */
.diet-tab {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.health-shortcuts {
  display: flex;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.health-shortcuts__item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.78);
  border: 2rpx solid var(--health-accent-soft, #eef2e4);
}

.health-shortcuts__label {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--health-accent, #1e3a2f);
}

.health-shortcuts__hint {
  font-size: 22rpx;
  color: #8a968a;
}

/*
 * 内容区里的板块现在自己是扁平的（见 src/styles/health-section.scss），
 * 不再需要在这里用 :deep() 去掉它们的卡片外观 ——
 * 而且微信小程序的自定义组件有样式隔离，:deep() 本来也穿不进去。
 */

.state-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.state-card__button {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  color: #f3eddd;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
}

.state-card__button::after {
  border: none;
}

.field-group + .field-group {
  margin-top: 24rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b6653;
}

.field-help {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
}

.field-textarea {
  margin-top: 10rpx;
  width: 100%;
  min-height: 180rpx;
  box-sizing: border-box;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
}
</style>
