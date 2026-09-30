<template>
  <view class="page">
    <view class="hero-card">
      <text class="hero-card__eyebrow">健康管理</text>
      <!-- 狗狗选择器直接并进名称这一行（老板要求）：
           名称本来就是顾客最想确认的信息，再在下方单开一张"选择狗狗"卡片
           纯属占地方。只有多只狗时才可点 —— 一只狗没什么好选的。 -->
      <picker
        v-if="dogs.length > 1"
        mode="selector"
        :range="dogs"
        range-key="name"
        :value="selectedDogIndex"
        @change="onDogPickerChange"
      >
        <view class="hero-card__name-row">
          <text class="hero-card__title">{{ form.name || '请选择狗狗' }}</text>
          <text class="hero-card__switch">切换 ▼</text>
        </view>
      </picker>
      <text v-else class="hero-card__title">{{ form.name || '健康档案' }}</text>
      <text class="hero-card__subtitle">集中维护病史、体检、过敏、疫苗、体重记录和饮食偏好。</text>
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
        <HealthRecordsSection
          v-if="isRecordTab"
          ref="recordsSectionRef"
          :dog-id="dogId"
          embedded
          :active-type="activeRecordType"
          :records="recordsByType[activeRecordType]"
          :loading="loadingByType[activeRecordType]"
          :saving-record-key="savingRecordKey"
          :preferred-expanded-record-identity="healthRecordFocusIdentity[activeRecordType]"
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
        <VaccineManagementSection
          v-else-if="activeHealthTab === 'vaccine'"
          ref="vaccineSectionRef"
          external-save
          :dog-id="dogId"
          @dirty-change="hasUnsavedSectionDraft = $event"
        />

        <view v-else-if="activeHealthTab === 'diet'" class="section-card diet-reminder-card">
          <text class="section-card__title">饮食偏好</text>
          <text class="section-card__desc">
            喜欢吃什么、不吃什么都会进推荐与配方，填得越具体越准。
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
      :primary-theme="activeHealthTab === 'diet' ? 'warm' : 'default'"
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
import WeightManagementSection from '../../components/dog-profile/WeightManagementSection.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
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
type HealthTabKey = 'medical' | 'checkup' | 'allergy' | 'vaccine' | 'diet' | 'weight'

const HEALTH_TABS: { key: HealthTabKey; label: string }[] = [
  { key: 'medical', label: '病史' },
  { key: 'checkup', label: '体检' },
  { key: 'allergy', label: '过敏' },
  { key: 'vaccine', label: '疫苗' },
  { key: 'diet', label: '饮食' },
  { key: 'weight', label: '体重' },
]

const RECORD_TAB_KEYS: HealthRecordType[] = ['medical', 'checkup', 'allergy']

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

const activeHealthTab = ref<HealthTabKey>('medical')

/** 当前书签是否是「记录类」（病史/体检/过敏）—— 这三个共用同一个组件 */
const isRecordTab = computed(() => RECORD_TAB_KEYS.includes(activeHealthTab.value as HealthRecordType))

const activeRecordType = computed<HealthRecordType>(() =>
  isRecordTab.value ? (activeHealthTab.value as HealthRecordType) : 'medical',
)

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
const hasUnsavedDietReminder = computed(() => (
  hasUnsavedDietReminderChange(form.preferredFoods, savedDietPreferences.preferredFoods) ||
  hasUnsavedDietReminderChange(form.pickyFoods, savedDietPreferences.pickyFoods)
))

const form = reactive<Record<string, any>>({
  id: '',
  name: '',
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
    const payload = buildCrudHealthRecordPayload(type, record)
    const res: any = recordId
      ? await recordApiForType(type).update(targetDogId, recordId, payload)
      : await recordApiForType(type).create(targetDogId, payload)

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '保存失败')
    }

    if (targetDogId !== dogId.value) {
      return
    }

    const nextRecord = normalizeSavedHealthRecordResponse(res.data, record)
    writeHealthRecordAttachmentCache(targetDogId, type, nextRecord)
    recordsByType[type] = replaceHealthRecordInList(recordsByType[type], nextRecord)
    healthRecordFocusIdentity[type] = buildHealthRecordFocusIdentity(type, nextRecord)
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

const activeTabLabel = computed(
  () => HEALTH_TABS.find((tab) => tab.key === activeHealthTab.value)?.label || '',
)

const stickyPrimaryText = computed(() => `保存${activeTabLabel.value}`)

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

function goToDogCreate() {
  // 2026-09-21：由 redirectTo 改为 navigateTo。
  // 原先 redirectTo 会把健康管理页从页面栈里替换掉，建档完成后无法回到这里；
  // 现在保留本页，建档成功 navigateBack 回来即可直接维护健康记录。
  navigateToDogCreate({ source: 'health' })
}
</script>

<style scoped>
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

.hero-card__eyebrow {
  display: block;
  font-size: 22rpx;
  letter-spacing: 0.12em;
  color: #d8bc85;
  text-transform: uppercase;
}

.hero-card__title {
  display: block;
  margin-top: 16rpx;
  font-size: 42rpx;
  font-weight: 800;
}

.hero-card__subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: rgba(243, 237, 221, 0.72);
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
.health-theme--medical .health-tabs__item--active { color: #0f7b49; border-top-color: #0f7b49; }
.health-theme--checkup .health-tabs__item--active { color: #216d9b; border-top-color: #216d9b; }
.health-theme--allergy .health-tabs__item--active { color: #ad5b2a; border-top-color: #ad5b2a; }
.health-theme--vaccine .health-tabs__item--active { color: #6b5b9b; border-top-color: #6b5b9b; }
.health-theme--diet    .health-tabs__item--active { color: #b07a1e; border-bottom-color: #b07a1e; }
.health-theme--weight  .health-tabs__item--active { color: #0e6f78; border-bottom-color: #0e6f78; }

/*
 * 内容区里的板块不再自己画卡 —— 否则一张卡里套着好几张卡，还是割裂。
 * 只去掉卡片外观（背景/圆角/阴影），内边距留着当内容区的留白。
 */
.health-panel__body :deep(.records-section),
.health-panel__body :deep(.vaccine-section),
.health-panel__body .diet-reminder-card {
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.health-panel__body :deep(.weight-section) {
  gap: 0;
}

.health-panel__body :deep(.weight-section > .section-card) {
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

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
