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
              <text class="field-label">当前体重（{{ weightUnitLabel }}）</text>
              <text class="field-link" @tap="goToHealthProfile">健康管理</text>
            </view>
            <!-- 单位必须显式显示并可切换：内部一律按公斤存，
                 顾客按「斤」填若不换算，热量会翻倍。 -->
            <view class="weight-input-row">
              <input
                class="field-input weight-input"
                type="digit"
                :value="weightInputText"
                @input="onWeightInput"
              />
              <view class="weight-unit-toggle">
                <text
                  v-for="option in weightUnitOptions"
                  :key="option.value"
                  class="weight-unit-option"
                  :class="{ active: weightUnit === option.value }"
                  @tap="onWeightUnitChange(option.value)"
                >{{ option.label }}</text>
              </view>
            </view>
            <text v-if="weightInputText && !hasValidCurrentWeightKg" class="field-error">
              {{ weightRangeHint }}
            </text>
            <!-- 只显示单位换算回显（= 86 斤）。不做任何「偏大/偏小」判断——
                 系统无法区分填错了还是养的本就是串串/茶杯犬，
                 错误提醒比不提醒更伤信任（2026-09-28 老板决定）。 -->
            <text v-else-if="weightEcho" class="weight-echo">{{ weightEcho }}</text>
          </view>

          <!-- 生命阶段（2026-09-29，阶段 A）
               此前顾客端**只有建档时**能指定生命阶段，编辑页没有入口 ——
               一只成年犬忽然怀孕，顾客无从切换。这里补上入口与必要的日期字段。 -->

          <!-- 体况确认状态与重评提醒（2026-09-29，阶段 C7/C8）
               新算法让体况分第一次真正起作用；而生产库 99.98% 的档案从未确认过。
               这里把「确没确认」「该不该重评」直接显示给顾客。 -->
          <view class="bcs-status" :class="{ 'bcs-status--pending': !bcsStatus.confirmed }">
            <text class="bcs-status__text">{{ bcsStatus.text }}</text>
            <text v-if="bcsStatus.reviewHint" class="bcs-status__hint">{{ bcsStatus.reviewHint }}</text>
          </view>
          <view class="field-group">
            <text class="field-label">生命阶段</text>
            <view class="life-stage-grid">
              <text
                v-for="option in lifeStageOptions"
                :key="option.value"
                class="life-stage-chip"
                :class="{ active: form.lifeStageOverride === option.value }"
                @tap="selectLifeStage(option.value)"
              >{{ option.label }}</text>
            </view>

            <!-- 妊娠期 -->
            <template v-if="form.lifeStageOverride === 'PREGNANCY'">
              <view class="repro-field">
                <text class="repro-field__label">预产期</text>
                <picker mode="date" :value="form.expectedDueDate" @change="onExpectedDueDateChange">
                  <view class="repro-field__value">
                    {{ form.expectedDueDate || '请选择（兽医告知的更准）' }}
                  </view>
                </picker>
              </view>
              <view class="repro-field">
                <text class="repro-field__label">配种日</text>
                <picker mode="date" :value="form.matingDate" @change="onMatingDateChange">
                  <view class="repro-field__value">
                    {{ form.matingDate || '请选择（不知道预产期时填这个）' }}
                  </view>
                </picker>
              </view>
              <text class="repro-hint">两个填一个就行。犬的孕期约 63 天，系统据此算当前孕周并调整每日能量。</text>
            </template>

            <!-- 哺乳期 -->
            <template v-if="form.lifeStageOverride === 'LACTATION'">
              <view class="repro-field">
                <text class="repro-field__label">分娩日</text>
                <picker mode="date" :value="form.deliveryDate" @change="onDeliveryDateChange">
                  <view class="repro-field__value">{{ form.deliveryDate || '请选择' }}</view>
                </picker>
              </view>
              <view class="repro-field">
                <text class="repro-field__label">这一窝几只</text>
                <input
                  class="repro-field__input"
                  type="number"
                  :value="form.litterSize"
                  placeholder="例如 4"
                  @input="onLitterSizeInput"
                />
              </view>
              <text class="repro-hint">哺乳期能量随「产后第几周」和「几只小狗」变化很大。</text>
            </template>

            <!-- 繁殖期信息过期提示（2026-09-29，阶段 A5）
                 不做微信主动推送（一次授权只能发一条，攒不够），
                 改为顾客打开档案时就能看到的站内提示。 -->
            <view v-if="reproductionExpiredHint" class="repro-expired">
              <text class="repro-expired__text">{{ reproductionExpiredHint }}</text>
            </view>
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
            <text class="field-label">每日餐数</text>
            <picker mode="selector" :range="mealsOptions" :value="mealsIndex" @change="onMealsChange">
              <view class="field-picker">
                {{ `${form.mealsPerDay || '2'} 餐/天` }}
              </view>
            </picker>
          </view>

          <view class="field-group">
            <view class="field-label-row">
              <text class="field-label">活动水平</text>
            </view>
            <view class="activity-list">
              <view
                v-for="option in activityLevelOptions"
                :key="option.value"
                class="activity-option"
                :class="{ 'activity-option--active': form.activityLevel === option.value }"
                @tap="selectActivityLevel(option.value)"
              >
                <text class="activity-option__title">{{ option.label }}</text>
                <text class="activity-option__desc">{{ option.description }}</text>
              </view>
            </view>
          </view>

          <view class="field-group">
            <view class="field-label-row">
              <text class="field-label">零食评估</text>
            </view>
            <view class="chip-row chip-row--wrap">
              <view
                v-for="option in treatLevelOptions"
                :key="option.value"
                class="chip"
                :class="{ 'chip--active': isTreatLevelActive(option.value) }"
                @tap="form.treatLevel = option.value"
              >
                {{ option.label }}
              </view>
            </view>
            <text class="field-hint">按日常喂零食频率选一个最接近的档位即可。</text>
          </view>

          <view class="field-group">
            <text class="field-label">BCS体态评分</text>
            <!-- 已有确认结果且本次还没作答时，如实显示当前值：
                 不让顾客以为"我的答案丢了"，也不替他编一组答案 -->
            <text
              v-if="bcsStatus.confirmed && effectiveBcs === null"
              class="bcs-current"
            >当前 {{ form.bcsScore }} 分 · {{ getBcsLabel(Number(form.bcsScore) || 5) }}</text>
            <text class="bcs-banner">回答以下问题，确认狗狗的体态健康！</text>

            <view
              v-for="question in bcsQuestions"
              :key="question.key"
              class="bcs-question"
            >
              <image
                v-if="question.image"
                class="bcs-question__image"
                :src="question.image"
                mode="widthFix"
              />
              <text class="bcs-question__title">{{ question.title }}</text>
              <view class="bcs-question__options">
                <view
                  v-for="option in question.options"
                  :key="option.label"
                  class="bcs-question__option"
                  :class="{ active: bcsAnswers[question.key] === option.bcs }"
                  @tap="selectBcsAnswer(question.key, option.bcs)"
                >{{ option.label }}</view>
              </view>
            </view>

            <view v-if="effectiveBcs !== null" class="bcs-result">
              <text class="bcs-result__score">体况：{{ effectiveBcs }} 分 · {{ bcsResultLabel }}</text>
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
            <text class="section-card__title">成品食谱历史</text>
            <text class="section-card__desc">只展示这只狗狗订购过的成品鲜食记录。</text>
          </view>
        </view>

        <view v-if="finishedFoodHistoryLoading" class="empty-card">
          <text class="empty-card__desc">正在加载成品订购记录...</text>
        </view>

        <view v-else-if="finishedFoodHistoryItems.length === 0" class="empty-card">
          <text class="empty-card__title">暂无成品订购记录</text>
          <text class="empty-card__desc">下单成品鲜食后，会在这里看到历史食谱。</text>
        </view>

        <view v-else class="finished-history-list">
          <view
            v-for="item in finishedFoodHistoryItems"
            :key="item.orderItemId"
            class="finished-history-row"
            @tap="openFinishedFoodOrder(item.orderId)"
          >
            <view class="finished-history-row__main">
              <text class="finished-history-row__title">{{ item.recipeName }}</text>
              <text class="finished-history-row__meta">
                {{ formatHistoryDate(item.orderedAt) }} · {{ formatHistoryStatus(item.orderStatus) }}
              </text>
              <text class="finished-history-row__meta">
                {{ item.packageSummary || `${item.packageSpecG}g x ${item.packageCount}包` }}
              </text>
            </view>
            <text class="finished-history-row__amount">¥{{ formatHistoryAmount(item.amountTotal) }}</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-card__header">
          <view>
            <text class="section-card__title">健康档案</text>
            <text class="section-card__desc">{{ healthSummary }}</text>
          </view>
        </view>

        <!-- 过敏原明细：只读态必须看得到"对什么过敏"。
             原先这里只显示"过敏 2 条"这种条数，而唯一能看到明细的编辑态又是坏的
             （保存不落库），等于顾客根本拿不到这条信息。 -->
        <view v-if="allergyNames.length > 0" class="allergy-tags">
          <text class="allergy-tags__label">过敏原</text>
          <view class="allergy-tags__list">
            <text
              v-for="name in allergyNames"
              :key="name"
              class="allergy-tags__item"
            >{{ name }}</text>
          </view>
        </view>

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

        <!-- 健康档案的唯一入口。
             概览页原先内嵌了一个健康记录编辑器，但保存/删除事件从未接线 ——
             顾客填完点"保存这一条"不入库、不提示、退出即丢（见 2026-09-27 体检报告 H2）。
             按老板决定移除，统一到真正能保存的「健康管理」页，避免顾客白做工。 -->
        <button class="health-entry-btn" @tap="goToHealthProfile">
          管理健康档案
        </button>
        <text class="health-entry-hint">过敏、病史、体检、体重都在这里维护</text>
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
  buildDogOverviewHealthSummary,
  resolveDogBreedLabel,
  resolveDogBreedName,
  resolveDogOverviewTreatLevel,
} from '../../utils/dog-profile-overview'
import { filterBreedsByKeyword, normalizeBreedSearchText } from '../../utils/dog-breed-search'
import { getBreedSearchUiState } from '../../utils/dog-breed-ui'
import {
  getBcsLabel,
  BCS_QUESTIONS,
  applyBcsScoreMap,
  resolveBcsFromAnswers,
} from '../../utils/bcs-questionnaire'
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
import {
  formatWeightForInput,
  getWeightRangeHint,
  getWeightUnitLabel,
  parseWeightInputToKg,
  type WeightUnit,
  formatWeightEcho,
} from '../../utils/weight-unit'

type EditableSection = '' | 'basic' | 'feeding'

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
  bcsScoreConfirmed?: boolean
  bcsScoreConfirmedAt?: string | null
  bcsConfirmedWeightKg?: number | null
  matingDate?: string | null
  expectedDueDate?: string | null
  deliveryDate?: string | null
  litterSize?: number | null
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

interface FinishedFoodHistoryItem {
  orderId: string
  orderItemId: string
  orderStatus: string
  orderedAt: string
  recipeName: string
  quantityG: number
  packageCount: number
  packageSpecG: number
  packageSummary?: string
  amountTotal: number
}

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const mealsOptions = ['1', '2', '3', '4', '5']
const sizeClassChoices = [
  { value: 'SMALL', label: '小型犬' },
  { value: 'MEDIUM', label: '中型犬' },
  { value: 'LARGE', label: '大型犬' },
  { value: 'GIANT', label: '巨型犬' },
]
const activityLevelOptions = [
  { value: 'RESTING', label: '休息静养', description: '几乎不运动，主要时间休息或医嘱控量' },
  {
    value: 'LOW',
    label: '城市日常',
    description: '每日散步约30-45分钟，适合多数国内城市犬',
    // 绝大多数城市犬都属于这一档，未选中时也要在视觉上区分（与建档页一致）
    isCommon: true,
  },
  { value: 'NORMAL', label: '规律运动', description: '每日主动运动约1小时，活动量稳定' },
  { value: 'HIGH', label: '高活动', description: '每日运动2-4小时，经常跑步或玩耍' },
  { value: 'WORKING', label: '工作犬', description: '高强度训练或工作犬场景' },
]
/**
 * 零食档位（2026-09-27 与建档页同步精简为 3 档）。
 * 建档页此前已由 4 档改为 3 档，总览页当时漏改，会出现"两个页面选项数不一致"。
 */
const treatLevelOptions = [
  { value: 'NONE', label: '不给零食' },
  { value: 'LOW', label: '较少零食' },
  { value: 'HIGH', label: '较多零食' },
]

/**
 * 某档零食当前是否选中（兼容历史数据）。
 *
 * 库里仍有 MODERATE（适中）的档案，它不属于现有 3 档，
 * 但把它归到「较少」这一档**展示**，顾客不动它时保存值仍是 MODERATE，
 * 不会被这次改版悄悄改写喂养口径。
 */
function isTreatLevelActive(level: string) {
  if (form.treatLevel === level) return true
  return level === 'LOW' && form.treatLevel === 'MODERATE'
}
const sizeLabelMap = Object.fromEntries(sizeClassChoices.map(option => [option.value, option.label]))
const dogId = ref('')
const profile = ref<DogProfileDetail | null>(null)
const calcResult = ref<DogCalcResult | null>(null)
const persistedCalcResult = ref<DogCalcResult | null>(null)
const breeds = ref<DogBreedItem[]>([])
const hotBreeds = ref<DogBreedItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const hasLoadedOnce = ref(false)
const finishedFoodHistoryLoading = ref(false)
const finishedFoodHistoryItems = ref<FinishedFoodHistoryItem[]>([])
const activeEditSection = ref<EditableSection>('')
const savingSection = ref<EditableSection>('')
const isHydrating = ref(false)
const isPreviewLoading = ref(false)
const isUploadingAvatar = ref(false)
const showAvatarCropper = ref(false)
const avatarCropSourcePath = ref('')
const avatarLocalPreviewPath = ref('')
const breedSearchKeyword = ref('')
const showManualBreedEntry = ref(false)
const showSizeOverrideEditor = ref(false)
const loadedFields = reactive({
  pickyFoods: true,
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
  activityLevel: 'LOW',
  lifeStageOverride: 'NONE',
  // 体况确认状态（2026-09-29，阶段 C7/C8）
  bcsScoreConfirmed: false,
  bcsScoreConfirmedAt: null as string | null,
  bcsConfirmedWeightKg: null as number | null,
  /**
   * 该犬种的体况分下限（深胸细腰型犬，如灵缇 = 4），随狗的档案接口下发。
   * 名单与数值都在数据库的犬种表里，小程序不维护。
   */
  bcsScoreMap: null as number | null,
  // 繁殖期信息（2026-09-29，阶段 A）
  matingDate: '',
  expectedDueDate: '',
  deliveryDate: '',
  litterSize: '',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalRecords: [],
  checkupRecords: [],
  allergyRecords: [],
  pickyFoods: '',
  // 活动量/餐数是否亲自选过（定制门槛按此判定，不看"有没有值"；
  // 体况的确认状态在上面的「体况确认状态」一组里）
  activityLevelConfirmed: false,
  mealsPerDayConfirmed: false,
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
/**
 * 过敏原明细。
 *
 * 只读态过去只显示"过敏 N 条"，顾客看不到到底对什么过敏 ——
 * 而唯一能看到明细的编辑态保存是坏的（点了不入库），等于这条信息拿不到。
 * 这里把过敏原名字直接列出来（数据本来就已经在 form 里，不用额外请求）。
 */
const allergyNames = computed(() =>
  (form.allergyRecords || [])
    .map((record: any) => String(record?.allergen || '').trim())
    .filter(Boolean),
)
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

// ========== 体重单位（公斤 / 斤）==========
// form.currentWeightKg 内部**始终是公斤**，单位只影响输入框展示。
// 原先标签写死了「（kg）」但没有换算入口，习惯按斤报体重的顾客会把 25 斤填成 25，
// 热量与报价直接翻倍。
const weightUnit = ref<WeightUnit>('KG')
const weightUnitOptions: Array<{ value: WeightUnit; label: string }> = [
  { value: 'KG', label: '公斤' },
  { value: 'JIN', label: '斤' },
]
// 单独存输入框的原始文本，避免换算把顾客正在输入的按键序列打断（如 "12." 丢小数点）
const weightInputText = ref('')
const weightUnitLabel = computed(() => getWeightUnitLabel(weightUnit.value))
const weightRangeHint = computed(() => getWeightRangeHint(weightUnit.value))

const syncWeightInputFromForm = () => {
  weightInputText.value = formatWeightForInput(
    form.currentWeightKg,
    weightUnit.value,
  )
}

const onWeightInput = (event: any) => {
  const raw = String(event?.detail?.value ?? '')
  weightInputText.value = raw
  form.currentWeightKg = parseWeightInputToKg(raw, weightUnit.value)
}

const onWeightUnitChange = (unit: WeightUnit) => {
  if (unit === weightUnit.value) return
  // 先把当前输入按旧单位固化成公斤，再按新单位重新展示
  form.currentWeightKg = parseWeightInputToKg(
    weightInputText.value,
    weightUnit.value,
  )
  weightUnit.value = unit
  syncWeightInputFromForm()
}
/**
 * 体重双向单位回显（2026-09-28）：只做客观换算，不做任何合理性判断。
 * 见 miniapp/src/utils/weight-unit.ts 的 formatWeightEcho 说明。
 */
const weightEcho = computed(() =>
  hasValidCurrentWeightKg.value
    ? formatWeightEcho(parsedCurrentWeightKg.value, weightUnit.value)
    : '',
)

// ========== 体重单位结束 ==========

// ========== 生命阶段与繁殖期信息（2026-09-29，阶段 A） ==========

const lifeStageOptions = [
  { value: 'NONE', label: '自动判断' },
  { value: 'ADULT', label: '成年期' },
  { value: 'SENIOR', label: '老年期' },
  { value: 'PREGNANCY', label: '妊娠期' },
  { value: 'LACTATION', label: '哺乳期' },
]

function selectLifeStage(stage: string) {
  form.lifeStageOverride = stage
}

function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

/**
 * 繁殖期信息过期提示（阶段 A5）
 *
 * 与后端 energy-v2 的两个有效期保持一致：
 *   · 哺乳超过 8 周（犬通常已断奶）→ 后端已自动按成犬计算
 *   · 预产期过去 14 天以上 → 后端已自动按成犬计算
 * 这里只负责把事实告诉顾客，推动他更新档案。
 */
const reproductionExpiredHint = computed(() => {
  const today = new Date()

  if (form.lifeStageOverride === 'LACTATION' && form.deliveryDate) {
    const delivery = new Date(form.deliveryDate)
    if (!Number.isNaN(delivery.getTime())) {
      const weeks = (today.getTime() - delivery.getTime()) / (7 * 86400000)
      if (weeks > 8) {
        return '分娩已超过 8 周（通常已断奶），系统已改按成犬计算每日能量。建议把生命阶段改回「自动判断」。'
      }
    }
  }

  if (form.lifeStageOverride === 'PREGNANCY' && form.expectedDueDate) {
    const due = new Date(form.expectedDueDate)
    if (!Number.isNaN(due.getTime())) {
      const days = (today.getTime() - due.getTime()) / 86400000
      if (days > 14) {
        return '预产期已过两周以上，系统已改按成犬计算每日能量。如果已经生产，请更新为「哺乳期」并填写分娩日与窝仔数。'
      }
    }
  }

  return ''
})

/**
 * 体况确认状态与重评提醒（阶段 C7/C8）
 *
 * 两条重评规则（与老板确认的口径一致）：
 *   1. 距上次确认超过 **3 个月**
 *   2. 当前体重相对**确认时的体重**变化 **≥5%**
 * 未确认过 → 提示去确认（新算法靠体况分换算理想体重，未确认会影响准确度）。
 */
const bcsStatus = computed(() => {
  const confirmed = Boolean(form.bcsScoreConfirmed)
  const confirmedAtRaw = form.bcsScoreConfirmedAt
  const confirmedWeight = form.bcsConfirmedWeightKg
  const now = Date.now()
  const MONTH = 30.4375 * 86400000

  if (!confirmed) {
    return {
      confirmed: false,
      text: `体况分 ${form.bcsScore}（默认值，未确认）`,
      reviewHint: '还没确认过体况。新算法会用体况分推算目标体重，建议做一次「摸肋骨」确认。',
    }
  }

  let reviewHint = ''
  if (confirmedAtRaw) {
    const at = new Date(confirmedAtRaw)
    if (!Number.isNaN(at.getTime()) && now - at.getTime() > 3 * MONTH) {
      reviewHint = '上次确认体况已经超过 3 个月，建议重新摸一下肋骨确认。'
    }
  }

  if (!reviewHint && typeof confirmedWeight === 'number' && confirmedWeight > 0) {
    const current = Number(form.currentWeightKg)
    if (Number.isFinite(current) && current > 0) {
      const change = Math.abs(current - confirmedWeight) / confirmedWeight
      if (change >= 0.05) {
        reviewHint = `体重相对上次确认时（${confirmedWeight} kg）变化了 ${Math.round(change * 100)}%，建议重新评估体况。`
      }
    }
  }

  return {
    confirmed: true,
    text: `体况分 ${form.bcsScore}（已确认）`,
    reviewHint,
  }
})

const onExpectedDueDateChange = (e: any) => {
  form.expectedDueDate = e.detail.value
}
const onMatingDateChange = (e: any) => {
  form.matingDate = e.detail.value
}
const onDeliveryDateChange = (e: any) => {
  form.deliveryDate = e.detail.value
}
const onLitterSizeInput = (e: any) => {
  form.litterSize = String(e?.detail?.value ?? '')
}

// ========== 生命阶段与繁殖期信息结束 ==========
const canPreview = computed(() => Boolean(
  form.breedId &&
  form.birthday &&
  form.gender &&
  hasValidCurrentWeightKg.value &&
  effectiveSizeClass.value,
))
const mealsIndex = computed(() => Math.max(0, mealsOptions.indexOf(form.mealsPerDay || '2')))
const filteredBreeds = computed(() => filterBreedsByKeyword(breeds.value, breedSearchKeyword.value).slice(0, 12))
const hasBreedKeyword = computed(() => normalizeBreedSearchText(breedSearchKeyword.value).length > 0)
const displayedBreeds = computed(() => {
  if (showManualBreedEntry.value) {
    return []
  }

  return hasBreedKeyword.value ? filteredBreeds.value : hotBreeds.value
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
    void loadHotBreeds()
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
          // 从「健康管理」页同步回来的体重是公斤，输入框显示文本要按当前单位重建
          syncWeightInputFromForm()
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

async function loadHotBreeds() {
  try {
    const res: any = await dogApi.hotBreeds()
    if (res.code === 0 && Array.isArray(res.data)) {
      hotBreeds.value = res.data
      return
    }

    throw new Error(res.message || 'Failed to load hot breeds')
  } catch {
    hotBreeds.value = []
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
      void loadFinishedFoodHistory()
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

async function loadFinishedFoodHistory() {
  if (!dogId.value) {
    finishedFoodHistoryItems.value = []
    return
  }

  finishedFoodHistoryLoading.value = true
  try {
    const res: any = await dogApi.finishedFoodHistory(dogId.value)
    finishedFoodHistoryItems.value = res.code === 0 && Array.isArray(res.data)
      ? res.data
      : []
  } catch (error) {
    console.error('[DogProfileOverview] Failed to load finished food history:', error)
    finishedFoodHistoryItems.value = []
  } finally {
    finishedFoodHistoryLoading.value = false
  }
}

function openFinishedFoodOrder(orderId: string) {
  if (!orderId) return
  uni.navigateTo({ url: `/pages/order-detail/index?orderId=${orderId}` })
}

function formatHistoryAmount(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function formatHistoryDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatHistoryStatus(status?: string) {
  const map: Record<string, string> = {
    INIT: '待提交',
    PENDING_PAYMENT: '待收款',
    PAID: '已收款',
    PURCHASING: '采购中',
    IN_PRODUCTION: '制作中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    AFTERSALE: '售后中',
  }
  return map[status || ''] || status || '-'
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
  // 体重是按公斤回填的，输入框显示文本要按当前单位重建一次
  syncWeightInputFromForm()
  form.bcsScore = nextProfile.bcsScore ?? 5
  form.activityLevel = nextProfile.activityLevel || 'LOW'
  // 回填已有的确认状态：本次未重新点选时，不能把它当成"刚确认"
  form.bcsScoreConfirmed = Boolean(nextProfile.bcsScoreConfirmed)
  form.activityLevelConfirmed = Boolean(nextProfile.activityLevelConfirmed)
  form.mealsPerDayConfirmed = Boolean(nextProfile.mealsPerDayConfirmed)
  form.lifeStageOverride = nextProfile.lifeStageOverride || 'NONE'
  form.bcsScoreMap = nextProfile.bcsScoreMap ?? null
  form.bcsScoreConfirmedAt = nextProfile.bcsScoreConfirmedAt ?? null
  form.bcsConfirmedWeightKg = nextProfile.bcsConfirmedWeightKg ?? null
  form.matingDate = toDateInputValue(nextProfile.matingDate)
  form.expectedDueDate = toDateInputValue(nextProfile.expectedDueDate)
  form.deliveryDate = toDateInputValue(nextProfile.deliveryDate)
  form.litterSize =
    nextProfile.litterSize === null || nextProfile.litterSize === undefined
      ? ''
      : String(nextProfile.litterSize)
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
    matingDate: form.matingDate || null,
    expectedDueDate: form.expectedDueDate || null,
    deliveryDate: form.deliveryDate || null,
    litterSize: form.litterSize ? Number(form.litterSize) : null,
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

  // 后台「狗档案转化分析」的「打开编辑模块」指标此前恒为 0 —— 前端从未上报过。
  void trackDogProfileEvent('dog_profile_edit_module_opened', {
    mode: 'edit',
    dogId: dogId.value,
    moduleName: section,
  })

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

// ========== 体况引导（与建档页同一套动作题库） ==========
const bcsAnswers = ref<Record<string, number>>({})

const bcsQuestions = BCS_QUESTIONS

const bcsResult = computed(() =>
  resolveBcsFromAnswers({ answers: bcsAnswers.value, questions: bcsQuestions }),
)

/**
 * 该犬种的体况分下限（深胸细腰型犬，如灵缇）。
 * 名单与数值来自数据库犬种表，随狗的档案接口下发。
 */
const bcsScoreMap = computed(() => form.bcsScoreMap ?? null)

/** 最终生效的体况分 = 算出的分与犬种下限取较大者（展示与保存必须是同一个数） */
const effectiveBcs = computed(() =>
  applyBcsScoreMap(bcsResult.value.bcs, bcsScoreMap.value, bcsQuestions[0].options),
)

const bcsResultLabel = computed(() =>
  effectiveBcs.value === null ? '' : getBcsLabel(effectiveBcs.value),
)

/** 顾客点某一题的某个选项 */
function selectBcsAnswer(questionKey: string, bcs: number) {
  bcsAnswers.value = { ...bcsAnswers.value, [questionKey]: bcs }
  const result = resolveBcsFromAnswers({
    answers: bcsAnswers.value,
    questions: bcsQuestions,
  })
  if (result.bcs !== null) {
    // 算出来了 → 按犬种下限修正后写进表单，并标记「顾客亲自确认过」
    form.bcsScore = applyBcsScoreMap(result.bcs, bcsScoreMap.value, bcsQuestions[0].options) ?? result.bcs
    form.bcsScoreConfirmed = true
  }
}

// ========== 体况引导结束 ==========

function selectActivityLevel(value: string) {
  form.activityLevel = value
  form.activityLevelConfirmed = true
}

function onMealsChange(event: any) {
  form.mealsPerDay = mealsOptions[event.detail.value] || '2'
  form.mealsPerDayConfirmed = true
}

function resetFeedingAssistPanels() {
  // 热量影响的折叠面板已下线（老板要求全部删掉），这里暂时没有需要重置的东西。
  // 保留函数是因为调用点（进入/退出编辑态）未来可能还要清其他辅助状态。
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

function goToHealthProfile() {
  if (!dogId.value) {
    return
  }

  uni.navigateTo({
    url: `/pages/dog-profile-health/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(176, 141, 79, 0.14), transparent 26%),
    linear-gradient(180deg, #f0f3e9 0%, #f2f4ea 100%);
}

.content {
  padding: 24rpx 24rpx calc(64rpx + env(safe-area-inset-bottom));
}

.section-card,
.state-card {
  border-radius: 32rpx;
  background: #fbfcf7;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
}

.section-card {
  padding: 28rpx;
}

.section-card + .section-card {
  margin-top: 20rpx;
}

.section-card--profile {
  background: linear-gradient(180deg, #fbfcf7 0%, #fbfcf7 52%);
  border: 1rpx solid rgba(176, 141, 79, 0.14);
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
  color: #1e3a2f;
  text-transform: uppercase;
}

.section-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.section-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.section-link {
  flex-shrink: 0;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #1e3a2f;
  background: rgba(176, 141, 79, 0.1);
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
  background: linear-gradient(135deg, #eef2e4 0%, #eef2e4 100%);
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
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
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
  color: #f3eddd;
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
  color: #26261f;
}

.profile-hero__breed {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: #6b6653;
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
  background: #fbfcf7;
  border: 1rpx solid rgba(24, 49, 63, 0.06);
}

.facts-inline__value {
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.editor-card {
  margin-top: 22rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #fbfcf7;
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

/* 体重：输入框 + 单位切换（公斤/斤）。
   内部一律按公斤存，这里只负责让顾客按自己的习惯填、且单位始终可见。 */
.weight-input-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.weight-input {
  flex: 1 1 auto;
  min-width: 0;
}

.weight-unit-toggle {
  display: flex;
  flex: 0 0 auto;
  padding: 3rpx;
  background: #eef3ea;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.weight-unit-option {
  /* 收紧凑一些：切换器越窄，输入框越宽，灰字才不会被切掉 */
  padding: 0 14rpx;
  height: 52rpx;
  line-height: 52rpx;
  font-size: 23rpx;
  color: #6b6653;
  border-radius: 999rpx;
}

.weight-unit-option.active {
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b6653;
}

.field-text-link {
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1.4;
  font-weight: 600;
  color: #6b6653;
}

.field-link {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #1e3a2f;
  background: rgba(176, 141, 79, 0.1);
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
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
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
  color: #6b6653;
}

.field-hint--warning,
.weight-echo {
  color: #6b7a70;
  font-size: 24rpx;
}

.field-error {
  color: #8a6b33;
}

.field-inline-link {
  margin-left: 6rpx;
  font-weight: 600;
  color: #1e3a2f;
}






.info-panel {
  margin-top: 14rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: rgba(15, 122, 77, 0.05);
  border: 1rpx solid rgba(15, 122, 77, 0.1);
}


.info-panel__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
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
  color: #6b6653;
}

.info-panel__summary {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
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
  color: #26261f;
}

.info-panel__item-detail {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
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
  color: #6b6653;
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
}

.chip--active {
  color: #1e3a2f;
  font-weight: 700;
  background: rgba(176, 141, 79, 0.08);
  border-color: rgba(176, 141, 79, 0.28);
}

.chip--gender-male-active {
  color: #b08d4f;
  font-weight: 700;
  background: rgba(35, 108, 229, 0.1);
  border-color: rgba(35, 108, 229, 0.28);
}

.chip--gender-female-active {
  color: #c48f77;
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
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
}

.breed-chip--active {
  border-color: rgba(176, 141, 79, 0.28);
  background: rgba(176, 141, 79, 0.08);
}

.breed-chip__name {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.breed-chip__meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
}

.section-inline-action {
  margin-top: 12rpx;
}

.section-inline-link {
  display: inline-block;
  font-size: 24rpx;
  font-weight: 600;
  color: #1e3a2f;
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
  color: #6b6653;
}

.breed-auto-size__link {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 600;
  color: #1e3a2f;
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
  color: #6b6653;
}

.fact-list__value {
  flex: 1;
  text-align: right;
  font-size: 26rpx;
  line-height: 1.6;
  font-weight: 700;
  color: #26261f;
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
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
}

/*
 * 最常见的档位（城市日常）：未选中时也要和另外四档区分开（与建档页一致）。
 * 绝大多数城市犬都在这一档，顾客不该在五个选项里犹豫。
 */
.activity-option--common {
  border-color: rgba(30, 46, 36, 0.22);
  border-width: 2rpx;
  background: rgba(30, 46, 36, 0.04);
}

.activity-option__row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.activity-option__badge {
  flex: none;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: #ffffff;
  background: rgba(30, 46, 36, 0.55);
}

.activity-option--active {
  border-color: rgba(176, 141, 79, 0.28);
  background: rgba(176, 141, 79, 0.08);
}

.activity-option__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.activity-option__desc {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
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
  background: #fbfcf7;
  border: 1rpx solid rgba(24, 49, 63, 0.08);
}

.energy-card--strong {
  background: linear-gradient(180deg, rgba(176, 141, 79, 0.1) 0%, rgba(176, 141, 79, 0.04) 100%);
  border-color: rgba(176, 141, 79, 0.24);
  box-shadow: 0 14rpx 28rpx rgba(176, 141, 79, 0.08);
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
  color: #6b6653;
}

.energy-card__value {
  flex-shrink: 0;
  text-align: right;
  font-size: 34rpx;
  line-height: 1.2;
  font-weight: 800;
  color: #26261f;
}

.energy-card--strong .energy-card__value {
  font-size: 40rpx;
  color: #1e3a2f;
}

.energy-card__hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6b6653;
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
  color: #8a6b33;
}

.note-card__body {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #8a6b33;
}

.empty-card {
  margin-top: 20rpx;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  background: rgba(176, 141, 79, 0.05);
}

.empty-card__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.empty-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.finished-history-list {
  margin-top: 18rpx;
}

.finished-history-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid rgba(24, 49, 63, 0.06);
}

.finished-history-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.finished-history-row__main {
  flex: 1;
  min-width: 0;
}

.finished-history-row__title {
  display: block;
  color: #26261f;
  font-size: 28rpx;
  font-weight: 800;
}

.finished-history-row__meta {
  display: block;
  margin-top: 6rpx;
  color: #6b6653;
  font-size: 22rpx;
  line-height: 1.5;
}

.finished-history-row__amount {
  flex-shrink: 0;
  color: #b4553f;
  font-size: 28rpx;
  font-weight: 800;
}

.section-subcard {
  padding: 24rpx;
  border-radius: 24rpx;
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
}

.health-preview-note {
  margin-top: 18rpx;
}

.health-preview-note__label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b6653;
}

.health-preview-note__value {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #26261f;
}

/* 过敏原明细：只读态直接列出"对什么过敏"，而不是只给一个条数 */
.allergy-tags {
  margin-top: 18rpx;
}

.allergy-tags__label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b6653;
}

.allergy-tags__list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}

.allergy-tags__item {
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: #8a4b2a;
  background: #fbeee2;
  border: 1rpx solid #e8cdb4;
  border-radius: 999rpx;
}

/* 健康档案入口：概览页内嵌编辑器已移除，这里是唯一入口，要显眼 */
.health-entry-btn {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid #d8bc85;
  border-radius: 999rpx;
}

.health-entry-btn::after {
  border: none;
}

.health-entry-hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #968f6d;
  text-align: center;
}

.field-help {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
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
  color: #1e3a2f;
  background: rgba(176, 141, 79, 0.08);
}

.action-button--primary {
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
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
  color: #26261f;
}

.state-card__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.state-card__button {
  margin-top: 24rpx;
  width: 220rpx;
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

/* ===== 生命阶段与繁殖期信息（2026-09-29，阶段 A） ===== */
.life-stage-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}

.life-stage-chip {
  padding: 12rpx 24rpx;
  border: 1rpx solid #d8ded2;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #46564d;
}

.life-stage-chip.active {
  border-color: #1e3a2f;
  background-color: #eef4ea;
  color: #1e3a2f;
  font-weight: bold;
}

.repro-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eef1ea;
}

.repro-field__label {
  font-size: 28rpx;
  color: #33413a;
}

.repro-field__value,
.repro-field__input {
  min-width: 300rpx;
  text-align: right;
  font-size: 28rpx;
  color: #1e3a2f;
}

.repro-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #6b7a70;
  line-height: 1.5;
}

.repro-expired {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: #fdf3ee;
}

.repro-expired__text {
  font-size: 24rpx;
  color: #b4553f;
  line-height: 1.6;
}

/* ===== 体况确认状态（2026-09-29，阶段 C7/C8） ===== */
.bcs-current {
  display: block;
  margin-top: 12rpx;
  font-size: 28rpx;
  color: #1f6b43;
  font-weight: 600;
}

.bcs-banner {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #46564d;
  line-height: 1.6;
}

.bcs-question {
  margin-top: 24rpx;
}

.bcs-question__image {
  display: block;
  width: 100%;
  margin-bottom: 16rpx;
  border-radius: 16rpx;
}

.bcs-question__title {
  display: block;
  font-size: 28rpx;
  color: #2f3a34;
  font-weight: 600;
  line-height: 1.5;
}

.bcs-question__options {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 16rpx;
}

.bcs-question__option {
  padding: 14rpx 26rpx;
  border: 2rpx solid #dfe6e1;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #46564d;
  background: #ffffff;
}

.bcs-question__option.active {
  border-color: #2f8f5b;
  background: #e8f5ee;
  color: #1f6b43;
  font-weight: 600;
}

.bcs-result {
  margin-top: 24rpx;
}

.bcs-result__score {
  font-size: 28rpx;
  color: #1f6b43;
  font-weight: 600;
}

.bcs-status {
  margin: 16rpx 0;
  padding: 18rpx 20rpx;
  border-radius: 12rpx;
  background-color: #eef4ea;
}

.bcs-status--pending {
  background-color: #fdf3ee;
}

.bcs-status__text {
  display: block;
  font-size: 26rpx;
  color: #1e3a2f;
  font-weight: bold;
}

.bcs-status__hint {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6b7a70;
  line-height: 1.5;
}
</style>
