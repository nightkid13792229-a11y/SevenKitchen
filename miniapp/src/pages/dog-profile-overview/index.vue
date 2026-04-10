<template>
  <view class="page">
    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadDogProfile">重试</button>
    </view>

    <view v-else-if="isLoading && !profile" class="state-card">
      <text class="state-card__title">正在加载档案</text>
      <text class="state-card__desc">正在获取狗狗档案和喂养参数，请稍候。</text>
    </view>

    <view v-else-if="profile" class="content">
      <view class="section-card section-card--profile">
        <view class="section-card__header">
          <text class="section-card__eyebrow">基础信息</text>
          <text class="section-link" @tap="toggleSectionEdit('basic')">
            {{ activeEditSection === 'basic' ? '取消' : '编辑' }}
          </text>
        </view>

        <view class="profile-hero">
          <view
            class="profile-hero__avatar"
            :class="{ 'profile-hero__avatar--editable': activeEditSection === 'basic' }"
            @tap="handleDogAvatarTap"
          >
            <image
              class="profile-hero__avatar-image"
              :src="dogAvatarSrc"
              mode="aspectFill"
              @error="onDogAvatarImageError"
            />
            <view class="profile-hero__avatar-badge">{{ avatarText }}</view>
            <view v-if="activeEditSection === 'basic'" class="profile-hero__avatar-overlay">
              <text class="profile-hero__avatar-action">
                {{ isUploadingAvatar ? '上传中...' : '更换头像' }}
              </text>
            </view>
          </view>

          <view class="profile-hero__copy">
            <text class="profile-hero__name">{{ form.name || '未命名' }}</text>
            <text class="profile-hero__breed">{{ breedLabel }}</text>
          </view>
        </view>

        <view v-if="activeEditSection === 'basic'" class="editor-card">
          <view class="field-group">
            <text class="field-label">狗狗名字</text>
            <input
              class="field-input"
              type="text"
              placeholder="请输入名字"
              v-model="form.name"
            />
          </view>

          <view class="field-group">
            <text class="field-label">性别</text>
            <view class="chip-row">
              <view
                class="chip chip--gender"
                :class="{ 'chip--gender-male-active': form.gender === 'MALE' }"
                @tap="form.gender = 'MALE'"
              >
                弟弟
              </view>
              <view
                class="chip chip--gender"
                :class="{ 'chip--gender-female-active': form.gender === 'FEMALE' }"
                @tap="form.gender = 'FEMALE'"
              >
                妹妹
              </view>
            </view>
          </view>

          <view class="field-group">
            <text class="field-label">生日</text>
            <picker mode="date" :value="form.birthday" @change="form.birthday = $event.detail.value">
              <view class="field-picker">
                {{ form.birthday || '请选择生日' }}
              </view>
            </picker>
          </view>

          <view class="field-group">
            <view class="field-label-row">
              <text class="field-label">当前体重（kg）</text>
              <text class="field-link" @tap="goToWeightManagement">体重管理</text>
            </view>
            <input
              class="field-input"
              type="digit"
              placeholder="请输入体重"
              v-model="form.currentWeightKg"
            />
            <text v-if="form.currentWeightKg && !hasValidCurrentWeightKg" class="field-error">
              请输入 0 到 200 之间的有效体重
            </text>
          </view>

          <view class="field-group">
            <text class="field-label">品种</text>
            <view v-if="showBreedSearchInput" class="search-field">
              <text class="search-field__icon">🔍</text>
              <input
                class="field-input field-input--search"
                type="text"
                placeholder="搜索品种名称"
                v-model="breedSearchKeyword"
              />
            </view>

            <view v-if="showManualBreedEntry" class="manual-breed">
              <input
                class="field-input"
                type="text"
                placeholder="请输入品种名称，可留空显示混血/其他"
                v-model="form.customBreedName"
              />
              <text class="field-hint">手动填写品种时，需要同时确认体型。</text>
            </view>

            <view v-else class="breed-list">
              <view
                v-for="breed in displayedBreeds"
                :key="breed.id"
                class="breed-chip"
                :class="{ 'breed-chip--active': form.breedId === breed.id && !showManualBreedEntry }"
                @tap="selectBreed(breed)"
              >
                <text class="breed-chip__name">{{ breed.name }}</text>
                <text class="breed-chip__meta">{{ getSizeLabel(breed.sizeCategory) }}</text>
              </view>
            </view>

            <text v-if="showBreedSelectionHint" class="field-hint">点击卡片即可选中品种</text>
            <text v-if="showBreedEmptyState" class="field-hint field-hint--warning">
              {{ breedEmptyStateHint }}
              <text
                v-if="showManualBreedEntryAction"
                class="field-inline-link"
                @tap="openManualBreedEntry"
              >
                去手动填写
              </text>
            </text>

            <view v-if="showManualBreedEntry" class="section-inline-action">
              <text class="section-inline-link" @tap="openManualBreedEntry">
                改为选择标准品种
              </text>
            </view>

            <view v-if="showAutoMatchedSizeInfo" class="breed-auto-size">
              <text class="breed-auto-size__text">已自动匹配体型：{{ autoMatchedSizeLabel }}</text>
              <text class="breed-auto-size__link" @tap="enableSizeOverride">手动调整</text>
            </view>
          </view>

            <view v-if="showSizeChooser" class="field-group">
              <text class="field-label">体型</text>
              <view class="chip-row chip-row--wrap">
                <view
                  v-for="option in sizeClassChoices"
                :key="option.value"
                class="chip"
                :class="{ 'chip--active': effectiveSizeClass === option.value }"
                @tap="form.sizeClassOverride = option.value"
              >
                {{ option.label }}
              </view>
            </view>

              <view v-if="!showManualBreedEntry && derivedBreedSizeCategory" class="section-inline-action">
                <text class="section-inline-link" @tap="restoreAutoSizeMatch">
                  恢复自动匹配
                </text>
              </view>
            </view>

          <view class="field-group">
            <text class="field-label">是否绝育</text>
            <view class="chip-row">
              <view
                class="chip"
                :class="{ 'chip--active': form.isNeutered === true }"
                @tap="form.isNeutered = true"
              >
                已绝育
              </view>
              <view
                class="chip"
                :class="{ 'chip--active': form.isNeutered === false }"
                @tap="form.isNeutered = false"
              >
                未绝育
              </view>
            </view>
          </view>

          <view class="editor-actions">
            <button class="action-button action-button--ghost" @tap="cancelSectionEdit">
              取消
            </button>
            <button
              class="action-button action-button--primary"
              :loading="savingSection === 'basic'"
              :disabled="savingSection !== ''"
              @tap="saveBasicSection"
            >
              保存基础信息
            </button>
          </view>
        </view>

        <view v-else class="facts-inline">
          <view
            v-for="fact in basicFacts"
            :key="fact.label"
            class="facts-inline__item"
          >
            <text class="facts-inline__value">{{ fact.value }}</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-card__header">
          <view>
            <text class="section-card__title">喂养参数</text>
            <text class="section-card__desc">{{ feedingSectionDescription }}</text>
          </view>
          <text class="section-link" @tap="toggleSectionEdit('feeding')">
            {{ activeEditSection === 'feeding' ? '取消' : '编辑' }}
          </text>
        </view>

        <view v-if="activeEditSection === 'feeding'" class="editor-card">
          <view class="field-group">
            <view class="field-label-row">
              <text class="field-label">BCS体态评分</text>
              <view class="field-label-actions">
                <text class="field-text-link" @tap="toggleFeedingImpactInfo('bcs')">热量影响</text>
              </view>
            </view>
            <view class="bcs-choice-grid">
              <view
                v-for="option in bcsChoiceOptions"
                :key="option.value"
                class="bcs-choice"
                :class="{ 'bcs-choice--active': Number(form.bcsScore) === option.value }"
                @tap="selectBcsScore(option.value)"
              >
                <text class="bcs-choice__score">{{ option.label }}</text>
                <text class="bcs-choice__status">{{ option.status }}</text>
              </view>
            </view>
            <view class="info-panel info-panel--bcs-guide">
              <image
                v-if="!bcsGuideLoadFailed"
                class="bcs-guide-image"
                :src="BCS_GUIDE_IMAGE_URL"
                mode="widthFix"
                @error="onBcsGuideImageError"
              />
              <view v-else class="bcs-guide-fallback">
                <text class="bcs-guide-fallback__title">BCS 体态评分参考</text>
                <text class="bcs-guide-fallback__item">1-3 分：偏瘦，肋骨明显、腰线凹陷明显。</text>
                <text class="bcs-guide-fallback__item">4-5 分：标准，肋骨可摸到但不明显外露。</text>
                <text class="bcs-guide-fallback__item">6-7 分：偏胖，腰线不明显，腹部轻度下垂。</text>
                <text class="bcs-guide-fallback__item">8-9 分：肥胖，肋骨难触及，腹部明显下垂。</text>
              </view>
            </view>
            <view v-if="activeFeedingImpactInfo === 'bcs'" class="info-panel">
              <view class="info-panel__header">
                <text class="info-panel__title">{{ getFeedingImpactInfo('bcs').title }}</text>
                <text class="info-panel__close" @tap="toggleFeedingImpactInfo('bcs')">收起说明</text>
              </view>
              <text class="info-panel__summary">{{ getFeedingImpactInfo('bcs').summary }}</text>
              <view
                v-for="item in getFeedingImpactInfo('bcs').items"
                :key="item.label"
                class="info-panel__item"
              >
                <text class="info-panel__item-label">{{ item.label }}</text>
                <text class="info-panel__item-detail">{{ item.detail }}</text>
              </view>
            </view>
          </view>

          <view class="field-group">
            <view class="field-label-row">
              <text class="field-label">活动水平</text>
              <text class="field-text-link" @tap="toggleFeedingImpactInfo('activity')">热量影响</text>
            </view>
            <view class="activity-list">
              <view
                v-for="option in activityLevelOptions"
                :key="option.value"
                class="activity-option"
                :class="{ 'activity-option--active': form.activityLevel === option.value }"
                @tap="form.activityLevel = option.value"
              >
                <text class="activity-option__title">{{ option.label }}</text>
                <text class="activity-option__desc">{{ option.description }}</text>
              </view>
            </view>
            <view v-if="activeFeedingImpactInfo === 'activity'" class="info-panel">
              <view class="info-panel__header">
                <text class="info-panel__title">{{ getFeedingImpactInfo('activity').title }}</text>
                <text class="info-panel__close" @tap="toggleFeedingImpactInfo('activity')">收起说明</text>
              </view>
              <text class="info-panel__summary">{{ getFeedingImpactInfo('activity').summary }}</text>
              <view
                v-for="item in getFeedingImpactInfo('activity').items"
                :key="item.label"
                class="info-panel__item"
              >
                <text class="info-panel__item-label">{{ item.label }}</text>
                <text class="info-panel__item-detail">{{ item.detail }}</text>
              </view>
            </view>
          </view>

          <view class="field-group">
            <text class="field-label">每日餐数</text>
            <picker mode="selector" :range="mealsOptions" :value="mealsIndex" @change="onMealsChange">
              <view class="field-picker">
                {{ `${form.mealsPerDay || '2'} 餐/天` }}
              </view>
            </picker>
          </view>

          <view class="field-group">
            <view class="field-label-row">
              <text class="field-label">零食评估</text>
              <text class="field-text-link" @tap="toggleFeedingImpactInfo('treat')">热量影响</text>
            </view>
            <view class="chip-row chip-row--wrap">
              <view
                v-for="option in treatLevelOptions"
                :key="option.value"
                class="chip"
                :class="{ 'chip--active': form.treatLevel === option.value }"
                @tap="form.treatLevel = option.value"
              >
                {{ option.label }}
              </view>
            </view>
            <text class="field-hint">按日常喂零食频率选一个最接近的档位即可。</text>
            <view v-if="activeFeedingImpactInfo === 'treat'" class="info-panel">
              <view class="info-panel__header">
                <text class="info-panel__title">{{ getFeedingImpactInfo('treat').title }}</text>
                <text class="info-panel__close" @tap="toggleFeedingImpactInfo('treat')">收起说明</text>
              </view>
              <text class="info-panel__summary">{{ getFeedingImpactInfo('treat').summary }}</text>
              <view
                v-for="item in getFeedingImpactInfo('treat').items"
                :key="item.label"
                class="info-panel__item"
              >
                <text class="info-panel__item-label">{{ item.label }}</text>
                <text class="info-panel__item-detail">{{ item.detail }}</text>
              </view>
            </view>
          </view>

          <view class="editor-actions">
            <button class="action-button action-button--ghost" @tap="cancelSectionEdit">
              取消
            </button>
            <button
              class="action-button action-button--primary"
              :loading="savingSection === 'feeding'"
              :disabled="savingSection !== ''"
              @tap="saveFeedingSection"
            >
              保存喂养参数
            </button>
          </view>
        </view>

        <view v-else class="fact-list">
          <view
            v-for="fact in feedingFacts"
            :key="fact.label"
            class="fact-list__row"
          >
            <text class="fact-list__label">{{ fact.label }}</text>
            <text class="fact-list__value">{{ fact.value }}</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-card__header">
          <view>
            <text class="section-card__title">热量建议</text>
            <text class="section-card__desc">{{ energySectionDescription }}</text>
          </view>
        </view>

        <view v-if="energySection" class="energy-list">
          <view
            v-for="metric in energySection.metrics"
            :key="metric.label"
            class="energy-card"
            :class="{ 'energy-card--strong': metric.emphasis === 'strong' }"
          >
            <view class="energy-card__main">
              <text class="energy-card__label">{{ metric.label }}</text>
              <text class="energy-card__value">{{ metric.value }}</text>
            </view>
            <text v-if="metric.hint" class="energy-card__hint">{{ metric.hint }}</text>
          </view>

          <view class="note-card">
            <text class="note-card__title">{{ energySection.note.title }}</text>
            <text class="note-card__body">{{ energySection.note.body }}</text>
          </view>
        </view>

        <view v-else class="empty-card">
          <text class="empty-card__title">还没有可用的热量建议</text>
          <text class="empty-card__desc">先补齐基础信息和喂养参数，再自动生成热量估算结果。</text>
        </view>
      </view>

      <view class="section-card">
        <view class="section-card__header">
          <view>
            <text class="section-card__title">健康记录与饮食提醒</text>
            <text class="section-card__desc">{{ healthSummary }}</text>
          </view>
          <text class="section-link" @tap="toggleSectionEdit('health')">
            {{ activeEditSection === 'health' ? '取消' : '编辑' }}
          </text>
        </view>

        <view v-if="activeEditSection === 'health'" class="editor-card editor-card--health">
          <HealthRecordsSection
            v-model="form.medicalRecords"
            :dog-id="dogId"
            :preferred-expanded-record-identity="healthRecordFocusIdentity.medical"
            record-type="medical"
            title="病史记录"
            description="记录症状、发病日期和诊断结果。"
            empty-title="还没有病史记录"
            primary-field-key="chiefComplaint"
            primary-label="症状或疾病"
            date-field-key="visitDate"
            date-label="发病日期"
            secondary-field-key="diagnosis"
            secondary-label="诊断结果"
            notes-label="补充说明"
            @record-saved="rememberHealthRecordFocus('medical', $event)"
          />

          <HealthRecordsSection
            v-model="form.checkupRecords"
            :dog-id="dogId"
            :preferred-expanded-record-identity="healthRecordFocusIdentity.checkup"
            record-type="checkup"
            title="体检记录"
            description="更新最近的体检时间和发现。"
            empty-title="还没有体检记录"
            primary-field-key="checkupType"
            primary-label="体检类型"
            date-field-key="checkupDate"
            date-label="体检日期"
            notes-label="体检说明"
            @record-saved="rememberHealthRecordFocus('checkup', $event)"
          />

          <HealthRecordsSection
            v-model="form.allergyRecords"
            :dog-id="dogId"
            :preferred-expanded-record-identity="healthRecordFocusIdentity.allergy"
            record-type="allergy"
            title="过敏记录"
            description="记录明确的过敏原和相关备注。"
            empty-title="还没有过敏记录"
            primary-field-key="allergen"
            primary-label="过敏原"
            notes-label="备注"
            @record-saved="rememberHealthRecordFocus('allergy', $event)"
          />

            <view class="section-subcard">
              <view class="field-group">
                <text class="field-label">挑食 / 不爱吃的食物</text>
                <text v-if="dietReminderStatusText" class="field-help">{{ dietReminderStatusText }}</text>
                <textarea
                  class="field-textarea"
                  placeholder="记录口味偏好，方便后续推荐"
                v-model="form.pickyFoods"
              />
            </view>
            <view v-if="isDietReminderDirty" class="editor-actions editor-actions--inline">
              <button class="action-button action-button--ghost" @tap="resetDietReminderDraft">
                撤销修改
              </button>
              <button
                class="action-button action-button--primary"
                :loading="savingSection === 'health'"
                :disabled="savingSection !== ''"
                @tap="saveDietReminderSection"
              >
                保存挑食提醒
              </button>
            </view>
          </view>
        </view>

        <view v-else>
          <view class="fact-list">
            <view
              v-for="fact in healthFacts"
              :key="fact.label"
              class="fact-list__row"
            >
              <text class="fact-list__label">{{ fact.label }}</text>
              <text class="fact-list__value">{{ fact.value }}</text>
            </view>
          </view>

          <view v-if="healthPickyPreview" class="section-subcard health-preview-note">
            <text class="health-preview-note__label">挑食提醒</text>
            <text class="health-preview-note__value">{{ healthPickyPreview }}</text>
          </view>
        </view>
      </view>
    </view>

    <DogAvatarCropper
      :visible="showAvatarCropper"
      :source-path="avatarCropSourcePath"
      title="裁切狗狗头像"
      confirm-text="使用头像"
      @close="closeOverviewAvatarCropper"
      @confirm="handleOverviewAvatarCropConfirm"
      @error="showOverviewAvatarCropError"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import DogAvatarCropper from '../../components/dog-profile/DogAvatarCropper.vue'
import { dogApi } from '../../api/dogs'
import { addDogToCache } from '../../utils/dog-cache'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import {
  buildDogEditPayload,
  getRecommendationDirtyFields,
  shouldAutoPreviewRecommendation,
} from '../../utils/dog-profile-form'
import {
  buildDogOverviewBasicFacts,
  buildDogOverviewEnergySection,
  buildDogOverviewFeedingFacts,
  buildDogOverviewHealthFacts,
  hasDietReminderChanges,
  getBcsChoiceOptions,
  buildDogOverviewHealthSummary,
  getFeedingImpactExplanation,
  resolveDogBreedLabel,
  resolveDogBreedName,
  resolveDogOverviewTreatLevel,
} from '../../utils/dog-profile-overview'
import { filterBreedsByKeyword, normalizeBreedSearchText } from '../../utils/dog-breed-search'
import { getBreedSearchUiState } from '../../utils/dog-breed-ui'
import {
  resolveDogAvatarUploadErrorMessage,
  resolveDogAvatarSrc,
} from '../../utils/dog-avatar'
import {
  buildDogHealthStateSnapshot,
  mergeDogHealthStateSnapshot,
  readDogHealthStateSnapshotCache,
  writeDogHealthStateSnapshotCache,
} from '../../utils/health-records'
import {
  getWeightSyncSignalKey,
  getWeightSyncValueKey,
  buildProfileWeightRecordPayload,
  shouldPersistProfileWeightRecord,
} from '../../utils/weight-management'

type EditableSection = '' | 'basic' | 'feeding' | 'health'

interface DogProfileDetail {
  id: string
  name?: string
  breedId?: string
  breedName?: string
  customBreedName?: string
  avatarUrl?: string | null
  birthday?: string
  gender?: string
  isNeutered?: boolean
  currentWeightKg?: number
  bcsScore?: number
  activityLevel?: string
  lifeStageOverride?: string
  sizeClassOverride?: string | null
  mealsPerDay?: number
  treatInputMode?: string
  treatLevel?: string
  manualTreatKcal?: number
  medicalRecords?: any[]
  checkupRecords?: any[]
  allergyRecords?: any[]
  pickyFoods?: string
  dirtyFields?: string[]
  [key: string]: any
}

interface DogCalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  calcDetails?: Record<string, any> | null
}

interface DogBreedItem {
  id: string
  name: string
  aliases?: string[]
  sizeCategory?: string | null
  isCommon?: boolean
}

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const BCS_GUIDE_IMAGE_URL = 'https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.jpg'
const mealsOptions = ['1', '2', '3', '4', '5']
const bcsChoiceOptions = getBcsChoiceOptions()
const sizeClassChoices = [
  { value: 'SMALL', label: '小型犬' },
  { value: 'MEDIUM', label: '中型犬' },
  { value: 'LARGE', label: '大型犬' },
  { value: 'GIANT', label: '巨型犬' },
]
const activityLevelOptions = [
  { value: 'RESTING', label: '休息', description: '几乎不运动，主要时间休息' },
  { value: 'LOW', label: '低活动', description: '偶尔散步，每日运动少于30分钟' },
  { value: 'NORMAL', label: '正常活动', description: '每日散步1-2小时，正常活动量' },
  { value: 'HIGH', label: '高活动', description: '每日运动2-4小时，经常跑步或玩耍' },
  { value: 'WORKING', label: '工作犬', description: '高强度训练或工作犬场景' },
]
const treatLevelOptions = [
  { value: 'NONE', label: '不给零食' },
  { value: 'LOW', label: '较少零食' },
  { value: 'MODERATE', label: '适中零食' },
  { value: 'HIGH', label: '较多零食' },
]
const sizeLabelMap = Object.fromEntries(sizeClassChoices.map(option => [option.value, option.label]))
const dogId = ref('')
const profile = ref<DogProfileDetail | null>(null)
const calcResult = ref<DogCalcResult | null>(null)
const persistedCalcResult = ref<DogCalcResult | null>(null)
const breeds = ref<DogBreedItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const hasLoadedOnce = ref(false)
const activeEditSection = ref<EditableSection>('')
const savingSection = ref<EditableSection>('')
const isHydrating = ref(false)
const isPreviewLoading = ref(false)
const isUploadingAvatar = ref(false)
const showAvatarCropper = ref(false)
const avatarCropSourcePath = ref('')
const avatarLocalPreviewPath = ref('')
const bcsGuideLoadFailed = ref(false)
const activeFeedingImpactInfo = ref<'bcs' | 'activity' | 'treat' | ''>('')
const breedSearchKeyword = ref('')
const showManualBreedEntry = ref(false)
const showSizeOverrideEditor = ref(false)
const loadedFields = reactive({
  pickyFoods: true,
})
const healthRecordFocusIdentity = reactive({
  medical: '',
  checkup: '',
  allergy: '',
})

const form = reactive<Record<string, any>>({
  id: '',
  name: '',
  breedId: '',
  breedName: '',
  customBreedName: '',
  avatarUrl: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'NORMAL',
  lifeStageOverride: 'NONE',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalRecords: [],
  checkupRecords: [],
  allergyRecords: [],
  pickyFoods: '',
})

let previousRecommendationSnapshot: Record<string, any> = {}
let autoPreviewTimer: ReturnType<typeof setTimeout> | null = null
let previewRequestId = 0
let lastSeenWeightSyncSignal: string | number | null = null

const avatarText = computed(() => {
  const name = String(form.name || '').trim()
  return name ? name.slice(0, 1) : '汪'
})
const dogAvatarSrc = computed(() => resolveDogAvatarSrc(form.avatarUrl, avatarLocalPreviewPath.value))

const breedLabel = computed(() => resolveDogBreedLabel(form, breeds.value))
const derivedBreedSizeCategory = computed(() => breeds.value.find(breed => breed.id === form.breedId)?.sizeCategory || '')
const effectiveSizeClass = computed(() => form.sizeClassOverride || derivedBreedSizeCategory.value || '')
const basicFacts = computed(() => buildDogOverviewBasicFacts(
  form,
  calcResult.value,
  { breedSizeCategory: derivedBreedSizeCategory.value },
))
const feedingFacts = computed(() => buildDogOverviewFeedingFacts(form, calcResult.value))
const healthFacts = computed(() => buildDogOverviewHealthFacts(form))
const healthSummary = computed(() => buildDogOverviewHealthSummary(form))
const healthPickyPreview = computed(() => String(form.pickyFoods || '').trim())
const isDietReminderDirty = computed(() => hasDietReminderChanges(
  form.pickyFoods,
  profile.value?.pickyFoods,
))
const dietReminderStatusText = computed(() => {
  if (isDietReminderDirty.value) {
    return '已修改，待保存'
  }

  if (String(profile.value?.pickyFoods || '').trim()) {
    return '已保存'
  }

  return ''
})
const energySection = computed(() => buildDogOverviewEnergySection(form, calcResult.value))
const isMixedBreed = computed(() => form.breedId === MIXED_BREED_VIRTUAL_ID)
const parsedCurrentWeightKg = computed(() => {
  const trimmed = typeof form.currentWeightKg === 'string' ? form.currentWeightKg.trim() : ''
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200 ? parsed : null
})
const hasValidCurrentWeightKg = computed(() => parsedCurrentWeightKg.value !== null)
const canPreview = computed(() => Boolean(
  form.breedId &&
  form.birthday &&
  form.gender &&
  hasValidCurrentWeightKg.value &&
  effectiveSizeClass.value,
))
const mealsIndex = computed(() => Math.max(0, mealsOptions.indexOf(form.mealsPerDay || '2')))
const commonBreeds = computed(() => breeds.value.filter(breed => breed.isCommon).slice(0, 8))
const filteredBreeds = computed(() => filterBreedsByKeyword(breeds.value, breedSearchKeyword.value).slice(0, 12))
const hasBreedKeyword = computed(() => normalizeBreedSearchText(breedSearchKeyword.value).length > 0)
const displayedBreeds = computed(() => {
  if (showManualBreedEntry.value) {
    return []
  }

  return hasBreedKeyword.value ? filteredBreeds.value : commonBreeds.value
})
const selectedStandardBreedName = computed(() => {
  if (!form.breedId || form.breedId === MIXED_BREED_VIRTUAL_ID) {
    return ''
  }

  return resolveDogBreedName({
    breedId: form.breedId,
    breedName: form.breedName,
    customBreedName: '',
  }, breeds.value)
})
const hasSelectedStandardBreed = computed(() => (
  !showManualBreedEntry.value &&
  Boolean(selectedStandardBreedName.value) &&
  normalizeBreedSearchText(selectedStandardBreedName.value) === normalizeBreedSearchText(breedSearchKeyword.value)
))
const breedUiState = computed(() => getBreedSearchUiState(filteredBreeds.value.length, {
  hasKeyword: hasBreedKeyword.value,
  isManualEntry: showManualBreedEntry.value,
  hasSelectedStandardBreed: hasSelectedStandardBreed.value,
}))
const showBreedSelectionHint = computed(() => hasBreedKeyword.value && breedUiState.value.showSelectionHint)
const showBreedSearchInput = computed(() => breedUiState.value.showSearchInput)
const showBreedEmptyState = computed(() => hasBreedKeyword.value && filteredBreeds.value.length === 0 && !showManualBreedEntry.value)
const showManualBreedEntryAction = computed(() => breedUiState.value.showManualEntryAction)
const breedEmptyStateHint = computed(() => breedUiState.value.emptyStateHint)
const needsStandardSizeFallback = computed(() => (
  !showManualBreedEntry.value &&
  Boolean(form.breedId) &&
  form.breedId !== MIXED_BREED_VIRTUAL_ID &&
  !derivedBreedSizeCategory.value
))
const hasManualSizeOverride = computed(() => (
  !showManualBreedEntry.value &&
  Boolean(form.breedId) &&
  form.breedId !== MIXED_BREED_VIRTUAL_ID &&
  Boolean(derivedBreedSizeCategory.value) &&
  Boolean(form.sizeClassOverride) &&
  form.sizeClassOverride !== derivedBreedSizeCategory.value
))
const showSizeChooser = computed(() => (
  showManualBreedEntry.value ||
  showSizeOverrideEditor.value ||
  hasManualSizeOverride.value ||
  needsStandardSizeFallback.value
))
const showAutoMatchedSizeInfo = computed(() => (
  !showManualBreedEntry.value &&
  Boolean(form.breedId) &&
  form.breedId !== MIXED_BREED_VIRTUAL_ID &&
  Boolean(autoMatchedSizeLabel.value) &&
  !showSizeChooser.value
))
const autoMatchedSizeLabel = computed(() => getSizeLabel(derivedBreedSizeCategory.value || ''))
const hasProfileDirtyRecommendation = computed(() => shouldAutoPreviewRecommendation(profile.value?.dirtyFields || []))
const feedingSectionDescription = computed(() => (
  activeEditSection.value === 'feeding' && isPreviewLoading.value
    ? '正在根据当前参数实时更新热量估算。'
    : '这些参数决定狗狗当前的热量估算方式。'
))
const energySectionDescription = computed(() => {
  if (isPreviewLoading.value) {
    return '正在根据当前参数实时更新热量估算。'
  }

  if (activeEditSection.value === 'basic' || activeEditSection.value === 'feeding') {
    return '热量数值会随着当前编辑内容自动重算。'
  }

  if (hasProfileDirtyRecommendation.value) {
    return '当前档案有影响热量计算的变更，进入编辑后会自动重算。'
  }

  return '首次喂养参考值，可结合体重和体态变化动态调整。'
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  if (value) {
    dogId.value = value
    lastSeenWeightSyncSignal = uni.getStorageSync(getWeightSyncSignalKey(dogId.value)) || null
    void loadDogProfile()
    void loadBreeds()
    return
  }

  loadError.value = '缺少狗狗ID，无法打开爱犬概览。'
})

onShow(() => {
  if (dogId.value) {
    void trackDogProfileEvent('dog_profile_step_viewed', {
      mode: 'edit',
      dogId: dogId.value,
      stepName: 'overview',
    })
  }

  if (dogId.value) {
    const latestSignal = uni.getStorageSync(getWeightSyncSignalKey(dogId.value)) || null
    if (latestSignal && latestSignal !== lastSeenWeightSyncSignal) {
      lastSeenWeightSyncSignal = latestSignal

      if (activeEditSection.value === 'basic') {
        const syncedWeightValue = uni.getStorageSync(getWeightSyncValueKey(dogId.value))
        const syncedWeight = Number(syncedWeightValue)
        if (Number.isFinite(syncedWeight) && syncedWeight > 0 && syncedWeight <= 200) {
          isHydrating.value = true
          form.currentWeightKg = syncedWeight.toString()
          if (profile.value) {
            profile.value.currentWeightKg = syncedWeight
          }
          previousRecommendationSnapshot = cloneDeep(getRecommendationSnapshot())
          isHydrating.value = false
          queuePreview(true)
          return
        }
      }

      if (hasLoadedOnce.value) {
        void loadDogProfile()
      }
      return
    }
  }

  if (hasLoadedOnce.value && dogId.value && !activeEditSection.value) {
    void loadDogProfile()
  }
})

watch(
  () => JSON.stringify(getRecommendationSnapshot()),
  () => {
    if (isHydrating.value) {
      return
    }

    if (activeEditSection.value !== 'basic' && activeEditSection.value !== 'feeding') {
      return
    }

    const nextSnapshot = getRecommendationSnapshot()
    const dirtyFields = getRecommendationDirtyFields(previousRecommendationSnapshot, nextSnapshot)
    previousRecommendationSnapshot = cloneDeep(nextSnapshot)

    if (!shouldAutoPreviewRecommendation(dirtyFields)) {
      return
    }

    queuePreview(true)
  },
)

watch(
  () => [
    JSON.stringify(form.medicalRecords),
    JSON.stringify(form.checkupRecords),
    JSON.stringify(form.allergyRecords),
  ],
  () => {
    if (!dogId.value) {
      return
    }

    writeDogHealthStateSnapshotCache(
      dogId.value,
      buildDogHealthStateSnapshot({
        medicalRecords: form.medicalRecords,
        checkupRecords: form.checkupRecords,
        allergyRecords: form.allergyRecords,
        pickyFoods: profile.value?.pickyFoods || form.pickyFoods,
      }),
    )
  },
)

async function loadBreeds() {
  try {
    const res: any = await dogApi.breeds()
    if (res.code === 0 && Array.isArray(res.data)) {
      breeds.value = res.data

      if (form.breedId && !form.customBreedName && !form.breedName) {
        const resolvedBreedName = resolveDogBreedName(form, breeds.value)
        if (resolvedBreedName) {
          form.breedName = resolvedBreedName
          if (!breedSearchKeyword.value) {
            breedSearchKeyword.value = resolvedBreedName
          }
        }
      }
    }
  } catch {
    // Breed metadata only improves the editing experience; overview still works without it.
  }
}

async function loadDogProfile() {
  if (!dogId.value) {
    loadError.value = '缺少狗狗ID，无法打开爱犬概览。'
    return
  }

  isLoading.value = true
  loadError.value = ''

  try {
    const res: any = await dogApi.detail(dogId.value)

    if (res.code === 0 && res.data?.profile) {
      applyServerState(res.data.profile, res.data.calcResult || null)
      hasLoadedOnce.value = true
      return
    }

    throw new Error(res.message || '加载狗狗档案失败')
  } catch (error: any) {
    loadError.value = error?.message || '加载狗狗档案失败，请稍后重试。'
  } finally {
    isLoading.value = false
    uni.stopPullDownRefresh?.()
  }
}

function applyServerState(nextProfile: DogProfileDetail, nextCalcResult: DogCalcResult | null) {
  profile.value = cloneDeep(nextProfile)
  persistedCalcResult.value = cloneDeep(nextCalcResult)
  calcResult.value = cloneDeep(nextCalcResult)
  populateForm(nextProfile)
}

function populateForm(nextProfile: DogProfileDetail) {
  isHydrating.value = true
  loadedFields.pickyFoods = Object.prototype.hasOwnProperty.call(nextProfile, 'pickyFoods')
  const cachedHealthState = readDogHealthStateSnapshotCache(dogId.value || nextProfile.id || '')
  const mergedHealthState = mergeDogHealthStateSnapshot(
    cachedHealthState || buildDogHealthStateSnapshot(form),
    nextProfile,
  )

  const resolvedBreedName = resolveDogBreedName(nextProfile, breeds.value)

  form.id = nextProfile.id || ''
  form.name = nextProfile.name || ''
  form.breedId = nextProfile.breedId || ''
  form.breedName = nextProfile.customBreedName ? '' : resolvedBreedName
  form.customBreedName = nextProfile.customBreedName || ''
  form.avatarUrl = nextProfile.avatarUrl || ''
  form.birthday = nextProfile.birthday ? new Date(nextProfile.birthday).toISOString().split('T')[0] : ''
  form.gender = nextProfile.gender || 'MALE'
  form.isNeutered = nextProfile.isNeutered ?? false
  form.currentWeightKg = nextProfile.currentWeightKg?.toString() || ''
  form.bcsScore = nextProfile.bcsScore ?? 5
  form.activityLevel = nextProfile.activityLevel || 'NORMAL'
  form.lifeStageOverride = nextProfile.lifeStageOverride || 'NONE'
  form.sizeClassOverride = nextProfile.sizeClassOverride || null
  form.mealsPerDay = (nextProfile.mealsPerDay || 2).toString()
  form.treatInputMode = 'ESTIMATE_LEVEL'
  form.treatLevel = resolveDogOverviewTreatLevel(nextProfile, calcResult.value) || nextProfile.treatLevel || 'LOW'
  form.manualTreatKcal = ''
  form.medicalRecords = cloneDeep(mergedHealthState.medicalRecords)
  form.checkupRecords = cloneDeep(mergedHealthState.checkupRecords)
  form.allergyRecords = cloneDeep(mergedHealthState.allergyRecords)
  form.pickyFoods = mergedHealthState.pickyFoods
  breedSearchKeyword.value = form.customBreedName || form.breedName || ''
  showManualBreedEntry.value = form.breedId === MIXED_BREED_VIRTUAL_ID
  showSizeOverrideEditor.value = false
  previousRecommendationSnapshot = cloneDeep(getRecommendationSnapshot())
  isHydrating.value = false

  writeDogHealthStateSnapshotCache(
    dogId.value || nextProfile.id || '',
    mergedHealthState,
  )
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function getRecommendationSnapshot() {
  return {
    breedId: form.breedId,
    birthday: form.birthday,
    gender: form.gender,
    isNeutered: form.isNeutered,
    currentWeightKg: form.currentWeightKg,
    bcsScore: form.bcsScore,
    activityLevel: form.activityLevel,
    lifeStageOverride: form.lifeStageOverride,
    sizeClassOverride: effectiveSizeClass.value,
    mealsPerDay: form.mealsPerDay,
    treatInputMode: 'ESTIMATE_LEVEL',
    treatLevel: form.treatLevel,
    manualTreatKcal: '',
  }
}

function toggleSectionEdit(section: Exclude<EditableSection, ''>) {
  if (activeEditSection.value === section) {
    cancelSectionEdit()
    return
  }

  if (profile.value) {
    applyServerState(profile.value, persistedCalcResult.value)
  }

  activeEditSection.value = section
  resetFeedingAssistPanels()
  if ((section === 'basic' || section === 'feeding') && !calcResult.value && canPreview.value) {
    queuePreview(false)
  }
}

function cancelSectionEdit() {
  if (profile.value) {
    applyServerState(profile.value, persistedCalcResult.value)
  }

  activeEditSection.value = ''
  resetFeedingAssistPanels()
}

function resetDietReminderDraft() {
  form.pickyFoods = profile.value?.pickyFoods || ''
}

function rememberHealthRecordFocus(type: 'medical' | 'checkup' | 'allergy', identity: string) {
  healthRecordFocusIdentity[type] = identity
}

function selectBreed(breed: DogBreedItem) {
  showManualBreedEntry.value = false
  form.breedId = breed.id
  form.breedName = breed.name
  form.customBreedName = ''
  breedSearchKeyword.value = breed.name
  form.sizeClassOverride = breed.sizeCategory || form.sizeClassOverride || 'MEDIUM'
  showSizeOverrideEditor.value = !breed.sizeCategory
}

function openManualBreedEntry() {
  showManualBreedEntry.value = !showManualBreedEntry.value
  if (showManualBreedEntry.value) {
    showSizeOverrideEditor.value = false
    const manualBreedKeyword = normalizeBreedSearchText(breedSearchKeyword.value)
    form.breedId = MIXED_BREED_VIRTUAL_ID
    form.breedName = ''
    form.customBreedName = form.customBreedName?.trim() || breedSearchKeyword.value.trim()
    breedSearchKeyword.value = manualBreedKeyword ? breedSearchKeyword.value.trim() : form.customBreedName || ''
    if (!form.sizeClassOverride) {
      form.sizeClassOverride = 'MEDIUM'
    }
    return
  }

  const nextKeyword = form.customBreedName?.trim() || ''
  if (form.breedId === MIXED_BREED_VIRTUAL_ID) {
    form.breedId = ''
    form.sizeClassOverride = null
  }
  form.customBreedName = ''
  breedSearchKeyword.value = nextKeyword
}

function enableSizeOverride() {
  showSizeOverrideEditor.value = true
  if (!form.sizeClassOverride) {
    form.sizeClassOverride = derivedBreedSizeCategory.value || 'MEDIUM'
  }
}

function restoreAutoSizeMatch() {
  form.sizeClassOverride = derivedBreedSizeCategory.value || 'MEDIUM'
  showSizeOverrideEditor.value = false
}

function openOverviewAvatarCropper(filePath: string) {
  avatarCropSourcePath.value = filePath
  showAvatarCropper.value = true
}

function closeOverviewAvatarCropper() {
  showAvatarCropper.value = false
  avatarCropSourcePath.value = ''
}

function showOverviewAvatarCropError(message: string) {
  uni.showToast({
    title: message || '裁切失败，请重试',
    icon: 'none',
  })
}

function onDogAvatarImageError() {
  if (avatarLocalPreviewPath.value) {
    avatarLocalPreviewPath.value = ''
  }
}

async function handleDogAvatarTap() {
  if (activeEditSection.value !== 'basic' || !dogId.value || isUploadingAvatar.value) {
    return
  }

  try {
    const res = await uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })

    const filePath = res.tempFilePaths?.[0]
    if (!filePath) {
      return
    }

    openOverviewAvatarCropper(filePath)
  } catch (error: any) {
    if (String(error?.errMsg || '').includes('cancel')) {
      return
    }

    uni.showToast({
      title: error?.message || '选择头像失败',
      icon: 'none',
    })
  }
}

async function handleOverviewAvatarCropConfirm(croppedFilePath: string) {
  avatarLocalPreviewPath.value = croppedFilePath
  closeOverviewAvatarCropper()
  await uploadDogAvatar(croppedFilePath)
}

async function uploadDogAvatar(filePath: string) {
  if (!dogId.value) {
    return
  }

  isUploadingAvatar.value = true

  try {
    uni.showLoading({ title: '上传中...' })
    const avatarUrl = await dogApi.uploadAvatar(dogId.value, filePath)

    avatarLocalPreviewPath.value = ''
    form.avatarUrl = avatarUrl
    if (profile.value) {
      profile.value.avatarUrl = avatarUrl
      addDogToCache({
        ...profile.value,
        avatarUrl,
      })
    }

    uni.hideLoading()
    uni.showToast({
      title: '头像已更新',
      icon: 'success',
    })
  } catch (error: any) {
    avatarLocalPreviewPath.value = ''
    uni.hideLoading()
    uni.showToast({
      title: resolveDogAvatarUploadErrorMessage(error),
      icon: 'none',
    })
  } finally {
    isUploadingAvatar.value = false
  }
}

function getSizeLabel(value?: string | null) {
  if (!value) {
    return '未识别体型'
  }

  return sizeLabelMap[value] || value
}

function selectBcsScore(value: number) {
  form.bcsScore = value
}

function onMealsChange(event: any) {
  form.mealsPerDay = mealsOptions[event.detail.value] || '2'
}

function toggleFeedingImpactInfo(type: 'bcs' | 'activity' | 'treat') {
  activeFeedingImpactInfo.value = activeFeedingImpactInfo.value === type ? '' : type
}

function resetFeedingAssistPanels() {
  bcsGuideLoadFailed.value = false
  activeFeedingImpactInfo.value = ''
}

function getFeedingImpactInfo(type: 'bcs' | 'activity' | 'treat') {
  return getFeedingImpactExplanation(type)
}

function onBcsGuideImageError() {
  bcsGuideLoadFailed.value = true
}

function queuePreview(silent: boolean) {
  if (autoPreviewTimer) {
    clearTimeout(autoPreviewTimer)
  }

  autoPreviewTimer = setTimeout(() => {
    void previewRecommendation({ silent })
  }, 350)
}

async function previewRecommendation(options: { silent: boolean }) {
  if (!canPreview.value) {
    if (!options.silent) {
      if (!form.breedId) {
        uni.showToast({ title: '请先选择品种', icon: 'none' })
        return false
      }

      if (!form.birthday) {
        uni.showToast({ title: '请先选择生日', icon: 'none' })
        return false
      }

      if (!hasValidCurrentWeightKg.value) {
        uni.showToast({ title: '请先填写有效体重', icon: 'none' })
        return false
      }

      if (!effectiveSizeClass.value) {
        uni.showToast({ title: '请先选择体型', icon: 'none' })
      }
    }

    return false
  }

  const requestId = ++previewRequestId
  isPreviewLoading.value = true

  try {
    const res: any = await dogApi.preview({
      breedId: form.breedId,
      customBreedName: form.breedId === MIXED_BREED_VIRTUAL_ID ? (form.customBreedName || undefined) : undefined,
      birthday: new Date(form.birthday).toISOString(),
      gender: form.gender,
      isNeutered: form.isNeutered,
      currentWeightKg: parsedCurrentWeightKg.value,
      bcsScore: Number(form.bcsScore) || 5,
      activityLevel: form.activityLevel,
      lifeStageOverride: form.lifeStageOverride,
      sizeClassOverride: effectiveSizeClass.value || null,
      mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: form.treatLevel,
      manualTreatKcal: undefined,
    })

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '刷新建议失败')
    }

    if (requestId !== previewRequestId) {
      return false
    }

    calcResult.value = res.data
    return true
  } catch (error: any) {
    if (requestId === previewRequestId && !options.silent) {
      uni.showToast({ title: error?.message || '刷新建议失败', icon: 'none' })
    }
    return false
  } finally {
    if (requestId === previewRequestId) {
      isPreviewLoading.value = false
    }
  }
}

async function saveBasicSection() {
  if (!dogId.value) {
    return
  }

  if (!form.name.trim()) {
    uni.showToast({ title: '请先填写狗狗名字', icon: 'none' })
    return
  }

  if (!form.birthday) {
    uni.showToast({ title: '请选择生日', icon: 'none' })
    return
  }

  if (!hasValidCurrentWeightKg.value) {
    uni.showToast({ title: '请先填写有效体重', icon: 'none' })
    return
  }

  if (!form.breedId) {
    uni.showToast({ title: '请先选择品种', icon: 'none' })
    return
  }

  if (!effectiveSizeClass.value) {
    uni.showToast({ title: '请先确认体型', icon: 'none' })
    return
  }

  await saveSection('basic')
}

async function saveFeedingSection() {
  if (!dogId.value) {
    return
  }

  await saveSection('feeding')
}

async function saveDietReminderSection() {
  if (!dogId.value) {
    return
  }

  savingSection.value = 'health'

  try {
    uni.showLoading({ title: '保存中...' })
    const res: any = await dogApi.updateDietReminders(dogId.value, {
      pickyFoods: form.pickyFoods,
    })

    if (res.code !== 0 || !res.data?.profile) {
      throw new Error(res.message || '保存失败')
    }

    applyServerState(res.data.profile, res.data.calcResult ?? calcResult.value)
    uni.hideLoading()
    uni.showToast({ title: '饮食提醒已保存', icon: 'success' })
  } catch (error: any) {
    uni.hideLoading()
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    savingSection.value = ''
  }
}

async function saveSection(section: Exclude<EditableSection, ''>) {
  if (!dogId.value) {
    return
  }

  savingSection.value = section
  const previousWeightKg = profile.value?.currentWeightKg ?? null

  try {
    uni.showLoading({ title: '保存中...' })
    const payload = buildDogEditPayload(form, section)

    if (section === 'basic') {
      if (form.breedId === MIXED_BREED_VIRTUAL_ID) {
        payload.sizeClassOverride = effectiveSizeClass.value || null
        payload.breedId = MIXED_BREED_VIRTUAL_ID
        payload.customBreedName = form.customBreedName?.trim() || null
      } else {
        payload.sizeClassOverride = hasManualSizeOverride.value ? effectiveSizeClass.value || null : null
        payload.customBreedName = null
      }
    }

    if (section === 'health') {
      if (!loadedFields.pickyFoods && !String(form.pickyFoods || '').trim()) {
        delete payload.pickyFoods
      }
    }

    const res: any = await dogApi.update(dogId.value, payload)
    if (res.code !== 0 || !res.data?.profile) {
      throw new Error(res.message || '保存失败')
    }

    let successMessage = '已保存'
    if (
      section === 'basic' &&
      shouldPersistProfileWeightRecord({
        previousWeightKg,
        nextWeightKg: res.data.profile.currentWeightKg ?? null,
      })
    ) {
      try {
        await dogApi.createWeightRecord(
          dogId.value,
          buildProfileWeightRecordPayload({
            recordDate: new Date().toISOString().split('T')[0],
            weightKg: Number(res.data.profile.currentWeightKg),
          }),
        )
      } catch (historyError) {
        console.error('[DogProfileOverview] Failed to persist weight history:', historyError)
        successMessage = '基础信息已保存，体重历史未记录'
      }
    }

    applyServerState(res.data.profile, res.data.calcResult || calcResult.value)
    activeEditSection.value = ''
    uni.hideLoading()
    uni.showToast({ title: successMessage, icon: successMessage === '已保存' ? 'success' : 'none' })
  } catch (error: any) {
    uni.hideLoading()
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    savingSection.value = ''
  }
}

function goToWeightManagement() {
  if (!dogId.value) {
    return
  }

  uni.navigateTo({
    url: `/pages/weight-management/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(7, 193, 96, 0.14), transparent 26%),
    linear-gradient(180deg, #f4faf7 0%, #eef5f1 100%);
}

.content {
  padding: 24rpx 24rpx calc(64rpx + env(safe-area-inset-bottom));
}

.section-card,
.state-card {
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
}

.section-card {
  padding: 28rpx;
}

.section-card + .section-card {
  margin-top: 20rpx;
}

.section-card--profile {
  background: linear-gradient(180deg, rgba(246, 251, 248, 0.98) 0%, #ffffff 52%);
  border: 1rpx solid rgba(7, 193, 96, 0.14);
}

.section-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20rpx;
}

.section-card__eyebrow {
  display: block;
  font-size: 22rpx;
  letter-spacing: 0.12em;
  color: #0f7a4d;
  text-transform: uppercase;
}

.section-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #17313f;
}

.section-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b7f89;
}

.section-link {
  flex-shrink: 0;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f7a4d;
  background: rgba(7, 193, 96, 0.1);
}

.profile-hero {
  margin-top: 20rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.profile-hero__avatar {
  position: relative;
  width: 112rpx;
  height: 112rpx;
  flex-shrink: 0;
  border-radius: 30rpx;
  overflow: hidden;
  background: linear-gradient(135deg, #edf8f2 0%, #dff3e8 100%);
}

.profile-hero__avatar--editable {
  cursor: pointer;
}

.profile-hero__avatar-image {
  width: 100%;
  height: 100%;
}

.profile-hero__avatar-badge {
  position: absolute;
  right: 8rpx;
  bottom: 8rpx;
  min-width: 38rpx;
  height: 38rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #0d6b43 0%, #0a8a55 100%);
}

.profile-hero__avatar-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10rpx 0;
  background: rgba(9, 25, 31, 0.48);
  display: flex;
  justify-content: center;
  align-items: center;
}

.profile-hero__avatar-action {
  font-size: 20rpx;
  font-weight: 600;
  color: #ffffff;
}

.profile-hero__copy {
  flex: 1;
  min-width: 0;
}

.profile-hero__name {
  display: block;
  font-size: 44rpx;
  line-height: 1.15;
  font-weight: 800;
  color: #17313f;
}

.profile-hero__breed {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: #68808a;
}

.facts-inline {
  margin-top: 20rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.facts-inline__item {
  display: inline-flex;
  align-items: center;
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: #f7faf8;
  border: 1rpx solid rgba(24, 49, 63, 0.06);
}

.facts-inline__value {
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.editor-card {
  margin-top: 22rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #f7faf8;
  border: 1rpx solid rgba(24, 49, 63, 0.06);
}

.editor-card--health {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.field-group + .field-group {
  margin-top: 20rpx;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.field-label-actions {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415b65;
}

.field-text-link {
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1.4;
  font-weight: 600;
  color: #6b8e7d;
}

.field-link {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.field-input,
.field-picker,
.field-textarea {
  margin-top: 10rpx;
  display: block;
  width: 100%;
  box-sizing: border-box;
  border-radius: 22rpx;
  font-size: 28rpx;
  color: #17313f;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.field-input {
  height: 92rpx;
  line-height: 92rpx;
  padding: 0 24rpx;
}

.search-field {
  position: relative;
  margin-top: 10rpx;
}

.search-field__icon {
  position: absolute;
  left: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 28rpx;
  line-height: 1;
  z-index: 1;
}

.field-input--search {
  margin-top: 0;
  padding-left: 68rpx;
}

.field-picker {
  min-height: 92rpx;
  padding: 18rpx 24rpx;
  display: flex;
  align-items: center;
  line-height: 1.6;
}

.field-textarea {
  min-height: 180rpx;
  padding: 20rpx 24rpx;
  line-height: 1.7;
}

.field-hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6f818b;
}

.field-hint--warning,
.field-error {
  color: #d96c00;
}

.field-inline-link {
  margin-left: 6rpx;
  font-weight: 600;
  color: #0f7a4d;
}

.bcs-choice-grid {
  margin-top: 10rpx;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.bcs-choice {
  padding: 18rpx 16rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.bcs-choice--active {
  border-color: rgba(7, 193, 96, 0.28);
  background: rgba(7, 193, 96, 0.08);
}

.bcs-choice__score {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.bcs-choice__status,
.bcs-choice__detail {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6d808a;
}

.info-panel {
  margin-top: 14rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: rgba(15, 122, 77, 0.05);
  border: 1rpx solid rgba(15, 122, 77, 0.1);
}

.info-panel--bcs-guide {
  background: #ffffff;
}

.info-panel__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.info-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.info-panel__close {
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1.4;
  font-weight: 600;
  color: #6b8e7d;
}

.info-panel__summary {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #5d747f;
}

.info-panel__item + .info-panel__item {
  margin-top: 12rpx;
}

.info-panel__item {
  margin-top: 14rpx;
}

.info-panel__item-label {
  display: block;
  font-size: 22rpx;
  font-weight: 700;
  color: #17313f;
}

.info-panel__item-detail {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6d808a;
}

.bcs-guide-image {
  width: 100%;
  border-radius: 18rpx;
}

.bcs-guide-fallback__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.bcs-guide-fallback__item {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #5d747f;
}

.chip-row {
  margin-top: 10rpx;
  display: flex;
  gap: 12rpx;
}

.chip-row--wrap {
  flex-wrap: wrap;
}

.chip {
  padding: 16rpx 22rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  color: #3e5762;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.chip--active {
  color: #0d6b43;
  font-weight: 700;
  background: rgba(7, 193, 96, 0.08);
  border-color: rgba(7, 193, 96, 0.28);
}

.chip--gender-male-active {
  color: #236ce5;
  font-weight: 700;
  background: rgba(35, 108, 229, 0.1);
  border-color: rgba(35, 108, 229, 0.28);
}

.chip--gender-female-active {
  color: #d84f8b;
  font-weight: 700;
  background: rgba(216, 79, 139, 0.12);
  border-color: rgba(216, 79, 139, 0.28);
}

.breed-list {
  margin-top: 14rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.breed-chip {
  min-width: calc(50% - 6rpx);
  box-sizing: border-box;
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.breed-chip--active {
  border-color: rgba(7, 193, 96, 0.28);
  background: rgba(7, 193, 96, 0.08);
}

.breed-chip__name {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.breed-chip__meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6d808a;
}

.section-inline-action {
  margin-top: 12rpx;
}

.section-inline-link {
  display: inline-block;
  font-size: 24rpx;
  font-weight: 600;
  color: #0f7a4d;
}

.manual-breed {
  margin-top: 14rpx;
}

.breed-auto-size {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.breed-auto-size__text {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6f818b;
}

.breed-auto-size__link {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f7a4d;
}

.fact-list {
  margin-top: 18rpx;
}

.fact-list__row {
  padding: 18rpx 0;
  display: flex;
  gap: 20rpx;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1rpx solid rgba(24, 49, 63, 0.06);
}

.fact-list__row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.fact-list__label {
  flex: 0 0 180rpx;
  font-size: 24rpx;
  color: #738691;
}

.fact-list__value {
  flex: 1;
  text-align: right;
  font-size: 26rpx;
  line-height: 1.6;
  font-weight: 700;
  color: #17313f;
}

.activity-list {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.activity-option {
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.activity-option--active {
  border-color: rgba(7, 193, 96, 0.28);
  background: rgba(7, 193, 96, 0.08);
}

.activity-option__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.activity-option__desc {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6d808a;
}

.energy-list {
  margin-top: 20rpx;
}

.energy-card + .energy-card,
.energy-card + .note-card {
  margin-top: 14rpx;
}

.energy-card {
  padding: 24rpx;
  border-radius: 24rpx;
  background: #ffffff;
  border: 1rpx solid rgba(24, 49, 63, 0.08);
}

.energy-card--strong {
  background: linear-gradient(180deg, rgba(7, 193, 96, 0.1) 0%, rgba(7, 193, 96, 0.04) 100%);
  border-color: rgba(7, 193, 96, 0.24);
  box-shadow: 0 14rpx 28rpx rgba(7, 193, 96, 0.08);
}

.energy-card__main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20rpx;
}

.energy-card__label {
  flex: 1;
  font-size: 24rpx;
  color: #6d7f88;
}

.energy-card__value {
  flex-shrink: 0;
  text-align: right;
  font-size: 34rpx;
  line-height: 1.2;
  font-weight: 800;
  color: #17313f;
}

.energy-card--strong .energy-card__value {
  font-size: 40rpx;
  color: #0d6b43;
}

.energy-card__hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #738691;
}

.note-card {
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 184, 0, 0.08);
  border: 1rpx solid rgba(255, 184, 0, 0.2);
}

.note-card__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #7a5310;
}

.note-card__body {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #8a6520;
}

.empty-card {
  margin-top: 20rpx;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  background: rgba(7, 193, 96, 0.05);
}

.empty-card__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.empty-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #627780;
}

.section-subcard {
  padding: 24rpx;
  border-radius: 24rpx;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.health-preview-note {
  margin-top: 18rpx;
}

.health-preview-note__label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415b65;
}

.health-preview-note__value {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #17313f;
}

.field-help {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6c7d86;
}

.editor-actions {
  margin-top: 24rpx;
  display: flex;
  gap: 16rpx;
}

.editor-actions--inline {
  margin-top: 8rpx;
}

.action-button {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.action-button::after {
  border: none;
}

.action-button--ghost {
  color: #0f7a4d;
  background: rgba(7, 193, 96, 0.08);
}

.action-button--primary {
  color: #ffffff;
  background: linear-gradient(135deg, #0d6b43 0%, #0a8a55 100%);
}

.state-card {
  margin: 24rpx;
  padding: 36rpx 28rpx;
  text-align: center;
}

.state-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #18313f;
}

.state-card__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6d7b86;
}

.state-card__button {
  margin-top: 24rpx;
  width: 220rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #0d6b43 0%, #0a8a55 100%);
}

.state-card__button::after {
  border: none;
}
</style>
