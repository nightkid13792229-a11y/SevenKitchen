<template>
  <view class="container">
    <view class="form-section">
      <!-- Loading breeds indicator -->
      <view class="loading-notice" v-if="loadingBreeds">
        <text>正在加载品种列表...</text>
      </view>

      <StepProgressHeader
        class="wizard-step-header"
        :active-step="currentCreateStep"
      />

      <view v-if="showBasicSection" class="wizard-step wizard-step--basic">
        <view class="profile-card">
          <view class="profile-card__identity">
            <view class="profile-card__avatar-placeholder">
              <text class="profile-card__avatar-text">{{ createAvatarPlaceholder }}</text>
            </view>

            <view class="profile-card__identity-fields">
              <view class="profile-card__field">
                <text class="label">狗狗名字 *</text>
                <input
                  class="input"
                  placeholder="请输入狗狗姓名"
                  :value="String(formData.name || '')"
                  @input="e => formData.name = e.detail.value"
                />
              </view>

              <view class="profile-card__field">
                <text class="label">性别</text>
                <view class="gender-selector">
                  <view
                    v-for="option in createGenderChoices"
                    :key="option.value"
                    class="gender-option"
                    :class="[
                      option.value === 'MALE' ? 'gender-option--male' : 'gender-option--female',
                      { active: formData.gender === option.value },
                    ]"
                    @tap="selectGender(option.value)"
                  >
                    <text
                      class="gender-symbol"
                      :class="option.value === 'MALE' ? 'gender-symbol--male' : 'gender-symbol--female'"
                    >
                      {{ option.symbol }}
                    </text>
                    <text class="gender-label">{{ option.label }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__grid">
            <view class="profile-card__field profile-card__field--half">
              <text class="label">生日 *</text>
              <picker mode="date" :value="formData.birthday || ''" @change="onBirthdayChange">
                <view class="picker">{{ formData.birthday || '请选择生日' }}</view>
              </picker>
            </view>

            <view class="profile-card__field profile-card__field--half">
              <text class="label">体重 *</text>
              <input
                class="input"
                type="digit"
                placeholder="例如 12.5"
                v-model="formData.currentWeightKg"
              />
              <text v-if="formData.currentWeightKg && !hasValidCurrentWeightKg" class="hint hint-warning">
                请输入 0 到 200 之间的有效体重
              </text>
            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__section-heading">
            <text class="profile-card__section-title">品种与体型 *</text>
          </view>

          <view v-if="selectedBreed || isMixedBreed" class="selected-breed-display">
            <text class="selected-text">
              {{ isMixedBreed
                ? (formData.customBreedName || '混血/其他')
                : selectedBreed?.name
              }}
            </text>
            <text class="change-btn" @tap="clearBreed">更换品种</text>
          </view>

          <view v-else class="breed-selector">
            <view v-if="breedSearchUiState.showSearchInput" class="search-box">
              <text class="search-box__icon">🔍</text>
              <input
                class="search-input search-input--with-icon"
                placeholder="搜索品种名称"
                v-model="searchKeyword"
                @input="onSearchInput"
              />
            </view>

            <view v-if="showCustomBreedInput" class="inline-manual-entry">
              <text class="inline-manual-entry__title">{{ createManualBreedLabels.nameTitle }}</text>
              <input
                class="input"
                v-model="customBreedName"
                placeholder="如：泰迪串串、田园犬"
              />
              <text class="inline-manual-entry__title">{{ createManualBreedLabels.sizeTitle }}</text>
              <view class="custom-breed-size-grid custom-breed-size-grid--inline">
                <view
                  v-for="option in customBreedSizeOptions"
                  :key="option.value"
                  class="custom-breed-size-option"
                  :class="{ active: customBreedSizeClass === option.value }"
                  @tap="selectCustomBreedSize(option.value)"
                >
                  <text class="custom-breed-size-option-label">{{ option.label }}</text>
                </view>
              </view>
              <text class="hint">{{ createManualBreedLabels.sizeHint }}</text>
              <view class="inline-manual-entry__actions">
                <button
                  class="custom-breed-btn-cancel custom-breed-btn-cancel--inline"
                  @tap="cancelCustomBreed"
                >
                  返回搜索品种
                </button>
                <button
                  class="custom-breed-btn-confirm custom-breed-btn-confirm--inline"
                  :class="{ disabled: !customBreedSizeClass }"
                  :disabled="!customBreedSizeClass"
                  @tap="confirmCustomBreed"
                >
                  确定
                </button>
              </view>
            </view>

            <view v-else-if="hasSearchKeyword" class="search-results">
              <view class="search-results-header">
                <text class="section-title">搜索结果 ({{ filteredBreeds.length }}个品种)</text>
                <text v-if="breedSearchUiState.showSelectionHint" class="search-results-hint">点击卡片即可选中品种</text>
              </view>
              <view class="breed-list breed-search-list">
                <view
                  v-for="breed in filteredBreeds"
                  :key="breed.id"
                  class="breed-search-item"
                  @tap="selectBreed(breed)"
                >
                  <view class="breed-search-main">
                    <text class="breed-search-name">{{ breed.name }}</text>
                    <view class="breed-search-meta">
                      <text class="breed-search-chip">{{ getSizeClassLabel(breed.sizeCategory) }}</text>
                      <text v-if="breed.isCommon" class="breed-search-chip common">常见品种</text>
                    </view>
                  </view>
                  <view class="breed-search-action">
                    <text class="breed-search-action-text">选择</text>
                    <text class="breed-search-action-icon">›</text>
                  </view>
                </view>
              </view>
              <view v-if="filteredBreeds.length === 0" class="search-empty-state">
                <text class="search-empty-hint">
                  {{ breedSearchUiState.emptyStateHint }}
                  <text
                    v-if="breedSearchUiState.showManualEntryAction"
                    class="search-fallback-link"
                    @tap="selectMixedBreed"
                  >
                    去手动填写
                  </text>
                </text>
              </view>
            </view>

            <view v-else>
              <view class="section">
                <view class="section-header" @tap="toggleCommonBreeds">
                  <text class="section-title">常见品种</text>
                  <text class="toggle-icon">{{ showCommonBreeds ? '▲' : '▼' }}</text>
                </view>
                <view v-if="showCommonBreeds" class="common-breeds">
                  <view
                    v-for="breedName in commonBreeds"
                    :key="breedName"
                    class="breed-tag"
                    @tap="selectBreedByName(breedName)"
                  >
                    {{ breedName }}
                  </view>
                </view>
                <view v-else class="common-breeds collapsed">
                  <view
                    v-for="breedName in commonBreeds.slice(0, 5)"
                    :key="breedName"
                    class="breed-tag"
                    @tap="selectBreedByName(breedName)"
                  >
                    {{ breedName }}
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view v-if="selectedBreed || isMixedBreed" class="profile-card__field profile-card__field--size">
            <text class="label">{{ showStandardBreedSizeSummary ? '体型（自动匹配）' : '体型分类' }}</text>
            <view v-if="showStandardBreedSizeSummary" class="auto-size-summary">
              <text class="auto-size-summary__text">{{ getSizeClassDisplay() }}</text>
              <text class="auto-size-summary__link" @tap="enableBreedSizeOverride">手动调整</text>
            </view>
            <view v-else-if="showMixedBreedSizeSummary" class="mixed-size-summary">
              <text class="mixed-size-summary__text">{{ getSizeClassDisplay() }}</text>
              <text class="mixed-size-summary__link" @tap="clearMixedBreedSizeSelection">重新选择</text>
            </view>
            <picker
              v-else
              mode="selector"
              :range="sizeClassOptionsForPicker"
              :value="sizeClassIndex"
              @change="onSizeClassChange"
            >
              <view
                class="size-info"
                :class="{
                  'size-required': isMixedBreed && !formData.sizeClassOverride,
                  'size-info--auto': !isMixedBreed && !formData.sizeClassOverride,
                }"
              >
                <text class="size-text">{{ getSizeClassDisplay() }}</text>
                <text
                  class="manual-select-btn"
                  :class="{ 'manual-select-btn--muted': !isMixedBreed && !formData.sizeClassOverride }"
                >
                  {{ !isMixedBreed && !formData.sizeClassOverride ? '可调整' : '手动选择' }}
                </text>
              </view>
            </picker>
            <text
              v-if="isMixedBreed"
              class="hint"
              :class="{ 'hint-warning': !formData.sizeClassOverride }"
            >
              {{ getSizeClassHint() }}
            </text>
            <text
              v-if="!isMixedBreed && formData.sizeClassOverride"
              class="restore-auto-link"
              @tap="restoreBreedSizeAutoMatch"
            >
              恢复按品种自动匹配
            </text>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__section-heading">
            <text class="profile-card__section-title">绝育状态</text>
            <text class="profile-card__section-desc">{{ createNeuterHint }}</text>
          </view>
          <view class="neuter-selector">
            <view
              class="neuter-option"
              :class="{ active: formData.isNeutered === true }"
              @tap="selectNeutered(true)"
            >
              <text class="neuter-label">已绝育</text>
            </view>
            <view
              class="neuter-option"
              :class="{ active: formData.isNeutered === false }"
              @tap="selectNeutered(false)"
            >
              <text class="neuter-label">未绝育</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 身体状态区 -->
      <view v-if="showFeedingSection" class="wizard-step wizard-step--feeding">
        <view class="profile-card">
          <view class="feeding-card__header">
            <view>
              <text class="profile-card__section-title">BCS 体态评分 *</text>
              <text class="profile-card__section-desc">4到5分是理想体态。</text>
            </view>
            <text class="feeding-impact-link" @tap="toggleFeedingImpact('bcs')">热量影响</text>
          </view>

          <view class="bcs-choice-grid">
            <view
              v-for="option in createBcsOptions"
              :key="option.value"
              class="bcs-choice-card"
              :class="[
                getCreateBcsToneClass(option.value),
                { 'bcs-choice-card--active': formData.bcsScore === option.value },
              ]"
              @tap="selectBcsScore(option.value)"
            >
              <text class="bcs-choice-card__score">{{ option.label }}</text>
              <text class="bcs-choice-card__status">{{ option.status }}</text>
            </view>
          </view>

          <view v-if="feedingImpactExpanded.bcs" class="feeding-impact-panel">
            <text class="feeding-impact-panel__title">{{ feedingImpactContent.bcs.title }}</text>
            <text class="feeding-impact-panel__summary">{{ feedingImpactContent.bcs.summary }}</text>
            <view
              v-for="item in feedingImpactContent.bcs.items"
              :key="item.label"
              class="feeding-impact-panel__item"
            >
              <text class="feeding-impact-panel__item-label">{{ item.label }}</text>
              <text class="feeding-impact-panel__item-detail">{{ item.detail }}</text>
            </view>
          </view>

          <view class="feeding-guide-card">
            <view class="feeding-guide-card__header">
              <text class="feeding-guide-card__title">BCS 评分参考图</text>
              <text class="feeding-guide-card__badge">当前页查看</text>
            </view>
            <image
              v-if="!showBcsFallback"
              class="feeding-guide-card__image"
              :src="bcsGuideImageUrl"
              mode="widthFix"
              @load="onBcsImageLoad"
              @error="onBcsImageError"
            />
            <view v-else class="bcs-fallback-content">
              <view class="bcs-fallback-title">BCS体态评分标准（9分制）</view>
              <view class="bcs-table">
                <view class="bcs-row bcs-row-thin">
                  <view class="bcs-score-group">
                    <text class="bcs-score">1-3分</text>
                    <text class="bcs-label">偏瘦</text>
                  </view>
                  <view class="bcs-desc">
                    <text class="bcs-desc-item">• 肋骨：肉眼可见，极易触摸</text>
                    <text class="bcs-desc-item">• 腰部：明显凹陷</text>
                    <text class="bcs-desc-item">• 腹部：严重内收</text>
                  </view>
                </view>
                <view class="bcs-row bcs-row-ideal">
                  <view class="bcs-score-group">
                    <text class="bcs-score">4-5分</text>
                    <text class="bcs-label">标准</text>
                  </view>
                  <view class="bcs-desc">
                    <text class="bcs-desc-item">• 肋骨：可触摸但不明显</text>
                    <text class="bcs-desc-item">• 腰部：从上方可见</text>
                    <text class="bcs-desc-item">• 腹部：略微抬起</text>
                  </view>
                </view>
                <view class="bcs-row bcs-row-overweight">
                  <view class="bcs-score-group">
                    <text class="bcs-score">6-9分</text>
                    <text class="bcs-label">偏胖/肥胖</text>
                  </view>
                  <view class="bcs-desc">
                    <text class="bcs-desc-item">• 肋骨：难以触摸</text>
                    <text class="bcs-desc-item">• 腰部：不可见</text>
                    <text class="bcs-desc-item">• 腹部：明显隆起</text>
                  </view>
                </view>
              </view>
              <view class="bcs-tip">
                <text class="bcs-tip-text">建议尽量维持 4-5 分的理想状态，有助于健康和后续喂食稳定。</text>
              </view>
            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="feeding-card__header">
            <view>
              <text class="profile-card__section-title">活动水平 *</text>
              <text class="profile-card__section-desc">选择更贴近日常平均状态的一项，系统会据此调节总热量需求。</text>
            </view>
            <text class="feeding-impact-link" @tap="toggleFeedingImpact('activity')">热量影响</text>
          </view>

          <view class="activity-level-container">
            <view
              v-for="option in createActivityChoices"
              :key="option.value"
              class="activity-level-card"
              :class="{ 'activity-level-card--active': formData.activityLevel === option.value }"
              @tap="selectActivityLevel(option.value)"
            >
              <text class="activity-level-card__label">{{ option.label }}</text>
              <text class="activity-level-card__description">{{ option.description }}</text>
            </view>
          </view>

          <view v-if="feedingImpactExpanded.activity" class="feeding-impact-panel">
            <text class="feeding-impact-panel__title">{{ feedingImpactContent.activity.title }}</text>
            <text class="feeding-impact-panel__summary">{{ feedingImpactContent.activity.summary }}</text>
            <view
              v-for="item in feedingImpactContent.activity.items"
              :key="item.label"
              class="feeding-impact-panel__item"
            >
              <text class="feeding-impact-panel__item-label">{{ item.label }}</text>
              <text class="feeding-impact-panel__item-detail">{{ item.detail }}</text>
            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__field">
            <text class="label">每日餐数</text>
            <picker
              mode="selector"
              :range="createMealChoices.map(option => option.label)"
              :value="createMealsIndex"
              @change="onCreateMealsChange"
            >
              <view class="picker">{{ `${formData.mealsPerDay || '2'} 餐/天` }}</view>
            </picker>
            <text class="hint">用于计算每餐的饭量。</text>
          </view>
        </view>

        <view class="profile-card">
          <view class="feeding-card__header">
            <view>
              <text class="profile-card__section-title">零食评估</text>
              <text class="profile-card__section-desc">用于预留零食的热量，剔除零食热量后再计算主食热量。</text>
            </view>
            <text class="feeding-impact-link" @tap="toggleFeedingImpact('treat')">热量影响</text>
          </view>

          <view class="treat-level-grid">
            <view
              v-for="level in createTreatChoices"
              :key="level.level"
              class="treat-level-card"
              :class="{ 'treat-level-card--active': formData.treatLevel === level.level }"
              @tap="selectTreatLevel(level.level)"
            >
              <text class="treat-level-card__label">{{ level.label }}</text>
              <text class="treat-level-card__description">{{ level.description }}</text>
            </view>
          </view>

          <view v-if="feedingImpactExpanded.treat" class="feeding-impact-panel">
            <text class="feeding-impact-panel__title">{{ feedingImpactContent.treat.title }}</text>
            <text class="feeding-impact-panel__summary">{{ feedingImpactContent.treat.summary }}</text>
            <view
              v-for="item in feedingImpactContent.treat.items"
              :key="item.label"
              class="feeding-impact-panel__item"
            >
              <text class="feeding-impact-panel__item-label">{{ item.label }}</text>
              <text class="feeding-impact-panel__item-detail">{{ item.detail }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 健康补充区 -->
      <view v-if="showHealthSection" class="wizard-step wizard-step--health">
        <HealthRecordsSection
          v-model="formData.medicalRecords"
          :dog-id="dogId || ''"
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
        />

        <HealthRecordsSection
          v-model="formData.checkupRecords"
          :dog-id="dogId || ''"
          record-type="checkup"
          title="体检记录"
          description="更新最近的体检时间和发现。"
          empty-title="还没有体检记录"
          primary-field-key="checkupType"
          primary-label="体检类型"
          date-field-key="checkupDate"
          date-label="体检日期"
          notes-label="体检说明"
        />

        <HealthRecordsSection
          v-model="formData.allergyRecords"
          :dog-id="dogId || ''"
          record-type="allergy"
          title="过敏记录"
          description="记录明确的过敏原和相关备注。"
          empty-title="还没有过敏记录"
          primary-field-key="allergen"
          primary-label="过敏原"
          notes-label="备注"
        />

        <view class="profile-card">
          <view class="profile-card__section-heading">
            <text class="profile-card__section-title">挑食提醒</text>
            <text class="profile-card__section-desc">补充不爱吃的食物，方便后续查看和喂养参考。</text>
          </view>
          <textarea
            class="textarea"
            placeholder="例如：胡萝卜、某种肉罐头"
            v-model="formData.pickyFoods"
          />
        </view>
      </view>

      <view v-if="showRecommendationSection" class="wizard-recommendation-section">
        <view v-if="calcStaleNotice" class="calc-stale-notice">
          <text class="calc-stale-text">信息已更新，我们会自动刷新最新喂食建议</text>
        </view>
        <RecommendationSummaryCard
          v-if="createRecommendationSummary"
          class="wizard-recommendation-shell"
          :title="createRecommendationSummary.heading"
          subtitle=""
          :summary-meta="createRecommendationSummary.meta"
          :metrics="createRecommendationMetrics"
          compact
        />
        <view v-if="createRecommendationSummary" class="wizard-recommendation-note">
          <text class="wizard-recommendation-note-title">{{ createRecommendationSummary.note.title }}</text>
          <text class="wizard-recommendation-note-body">{{ createRecommendationSummary.note.body }}</text>
        </view>
        <view v-else class="wizard-recommendation-empty">
          <text class="wizard-recommendation-empty-title">先生成喂食建议</text>
          <text class="wizard-recommendation-empty-desc">回到上一步补齐喂食条件后，我们会自动更新建议结果。</text>
        </view>
      </view>

    </view>

    <StickyActionBar
      :primary-text="createActionConfig.primaryText"
      :secondary-text="createActionConfig.secondaryText"
      :tertiary-text="createActionConfig.tertiaryText"
      :primary-disabled="createActionConfig.primaryDisabled"
      :secondary-disabled="createActionConfig.secondaryDisabled"
      :tertiary-disabled="createActionConfig.tertiaryDisabled"
      @primary="handleCreatePrimaryAction"
      @secondary="handleCreateSecondaryAction"
      @tertiary="handleCreateTertiaryAction"
    />

    <view v-if="showLifeStageOverride" class="life-stage-sheet" @tap="closeLifeStageOverride">
      <view class="life-stage-sheet-mask"></view>
      <view class="life-stage-sheet-content" @tap.stop>
        <text class="life-stage-sheet-title">请选择生命阶段</text>
        <text class="life-stage-sheet-subtitle">如果你想覆盖系统判断，可以在这里手动指定</text>
        <view class="override-options">
          <view
            v-for="option in lifeStageOverrideOptions"
            :key="option.value"
            class="override-option"
            :class="{ active: formData.lifeStageOverride === option.value }"
            @tap="selectLifeStageOverride(option.value)"
          >
            <text class="override-option-label">{{ option.label }}</text>
            <text class="override-option-desc">{{ option.description }}</text>
          </view>
        </view>
        <button class="life-stage-sheet-cancel" @tap="closeLifeStageOverride">取消</button>
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch, reactive } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import StepProgressHeader from '../../components/dog-profile/StepProgressHeader.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { type DogProfileCreateStep } from '../../constants/dog-profile'
import { dogApi } from '../../api/dogs'
import { addDogToCache } from '../../utils/dog-cache'
import {
  clearDogProfileDraft,
  loadDogProfileDraft,
  saveDogProfileDraft,
} from '../../utils/dog-profile-draft'
import {
  getCreateActivityChoices,
  getCreateAvatarPlaceholder,
  getCreateBcsOptions,
  getCreateBcsToneClass,
  getCreateFeedingImpact,
  getCreateMealChoices,
  getCreateManualBreedLabels,
  getCreateMixedBreedSizeHint,
  shouldShowCreateMixedBreedSizeSummary,
  getCreateTreatChoices,
  getCreateGenderChoices,
  getCreateNeuterHint,
  normalizeCreateActivityLevel,
  normalizeCreateBcsScore,
  normalizeCreateMealsPerDay,
  normalizeCreateTreatLevel,
  resolveCreateDraftStep,
} from '../../utils/dog-profile-create-view'
import {
  buildDogOverviewHealthSummary,
} from '../../utils/dog-profile-overview'
import {
  buildDogCreatePayload,
  canAdvanceCreateStep,
  getDogCreateLegacyRedirectRoute,
  getCreateStepAvailability,
  getNextCreateStep,
  getRecommendationDirtyFields,
  shouldAutoPreviewRecommendation,
} from '../../utils/dog-profile-form'
import { getCreateWizardActionConfig } from '../../utils/dog-profile-create-actions'
import { buildRecommendationSummary } from '../../utils/dog-recommendation-summary'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import { filterBreedsByKeyword, normalizeBreedSearchText } from '../../utils/dog-breed-search'
import { getBreedSearchUiState, getManualBreedDraftName } from '../../utils/dog-breed-ui'
import { scrollPageToTop } from '../../utils/page-scroll'
import { buildInitialWeightRecordPayload } from '../../utils/weight-management'
import {
  buildDogHealthStateSnapshot,
  mergeDogHealthStateSnapshot,
  writeDogHealthStateSnapshotCache,
} from '../../utils/health-records'

interface FormData {
  name: string
  breedId: string
  customBreedName?: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  sizeClassOverride: string | null
  mealsPerDay: string
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  medicalHistory?: string  // 保留用于向后兼容
  medicalRecords: any[]  // 新的病史记录列表
  checkupRecords: any[]  // 体检记录列表
  allergyRecords: any[]  // 过敏记录列表
  allergyFoods: string
  pickyFoods: string
}

// Constants
const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const formData = ref<FormData>({
  name: '',
  breedId: '',
  customBreedName: '',
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
  allergyFoods: '',
  pickyFoods: ''
})

const lifeStageOptions = ['NONE', 'PUPPY', 'ADULT', 'SENIOR', 'PREGNANCY', 'LACTATION']

// 生命阶段手动覆盖选项（排除 NONE）
const lifeStageOverrideOptions = [
  { value: 'PUPPY', label: '幼犬期', description: '成长发育阶段，需要更高能量' },
  { value: 'ADULT', label: '成年期', description: '成年犬，标准能量需求' },
  { value: 'SENIOR', label: '老年期', description: '老年犬，新陈代谢减缓' },
  { value: 'PREGNANCY', label: '妊娠期', description: '怀孕母犬，需要额外营养' },
  { value: 'LACTATION', label: '哺乳期', description: '哺乳母犬，高能量需求' }
]
const sizeClassOptions = ['SMALL', 'MEDIUM', 'LARGE', 'GIANT']
const sizeClassOptionsForPicker = ['小型犬', '中型犬', '大型犬', '巨型犬']
const customBreedSizeOptions = sizeClassOptions.map((value, index) => ({
  value,
  label: sizeClassOptionsForPicker[index],
}))
const createBcsOptions = getCreateBcsOptions()
const createActivityChoices = getCreateActivityChoices()
const createMealChoices = getCreateMealChoices()
const createTreatChoices = getCreateTreatChoices()
const createAvatarPlaceholder = getCreateAvatarPlaceholder()
const createGenderChoices = getCreateGenderChoices()
const createNeuterHint = getCreateNeuterHint()
const createManualBreedLabels = getCreateManualBreedLabels()
const showMixedBreedSizeSummary = computed(() =>
  shouldShowCreateMixedBreedSizeSummary(isMixedBreed.value, Boolean(formData.value.sizeClassOverride)),
)
const createMealsIndex = computed(() => {
  const currentValue = normalizeCreateMealsPerDay(formData.value.mealsPerDay)
  const nextIndex = createMealChoices.findIndex(option => option.value === currentValue)
  return nextIndex >= 0 ? nextIndex : 1
})
const feedingImpactContent = {
  bcs: getCreateFeedingImpact('bcs'),
  activity: getCreateFeedingImpact('activity'),
  treat: getCreateFeedingImpact('treat'),
}

interface Breed {
  id: string
  name: string
  aliases?: string[]
  sizeCategory: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg?: number
  isCommon?: boolean
}

interface CalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
  calcDetails?: {
    weightKg: number
    ageMonths: number
    sizeClass: string
    lifeStage: string
    stageFactor: number
    bcsMultiplier: number
    isNeutered: boolean
    activityLevel: string
    treatMode: string
    treatLevel?: string
    treatPercentage?: number
  }
}

const breeds = ref<Breed[]>([])

// 常见品种从API返回的数据中筛选（isCommon为true的品种）
const commonBreeds = computed(() => {
  return breeds.value.filter(b => b.isCommon).map(b => b.name)
})

const selectedBreed = ref<Breed | null>(null)
const calcResult = ref<CalcResult | null>(null)
const calcStaleNotice = ref(false)
const showCalcProcess = ref(false)
const loadingBreeds = ref(false)
const calculating = ref(false)

// 后端返回的生命阶段信息（用于显示）
const backendLifeStageInfo = ref<{
  stage: string
  label: string
  detail: string
} | null>(null)

const dogId = ref<string | null>(null)
const isLegacyRedirecting = ref(false)
const currentCreateStep = ref<DogProfileCreateStep>('basic')
const restoringCreateDraft = ref(false)
const suppressDerivedStateInvalidation = ref(false)
let previousCreateFormSnapshot = JSON.parse(JSON.stringify(formData.value))
let createAutoPreviewTimer: ReturnType<typeof setTimeout> | null = null

// New state variables
const searchKeyword = ref('')
const showCommonBreeds = ref(true)
const isMixedBreed = ref(false)
const showCustomBreedInput = ref(false)
const showBreedSizeOverridePicker = ref(false)
const customBreedName = ref('')
const customBreedSizeClass = ref<string | null>(null)
const feedingImpactExpanded = reactive<Record<'bcs' | 'activity' | 'treat', boolean>>({
  bcs: false,
  activity: false,
  treat: false,
})

// BCS评分图URL - 使用腾讯云COS CDN加速域名
const bcsGuideImageUrl = ref('https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.jpg')
const showBcsFallback = ref(false) // 是否显示降级内容（图片加载失败时）
const showLifeStageOverride = ref(false) // 生命阶段手动选择面板展开状态

const filteredBreeds = computed(() => {
  return filterBreedsByKeyword(breeds.value, searchKeyword.value)
})

const hasSearchKeyword = computed(() => normalizeBreedSearchText(searchKeyword.value).length > 0)

const hasSelectedStandardBreed = computed(() => Boolean(selectedBreed.value) && !isMixedBreed.value)

const breedSearchUiState = computed(() => {
  return getBreedSearchUiState(filteredBreeds.value.length, {
    hasKeyword: hasSearchKeyword.value,
    isManualEntry: showCustomBreedInput.value,
    hasSelectedStandardBreed: hasSelectedStandardBreed.value,
  })
})

const lifeStageIndex = computed(() => {
  const idx = lifeStageOptions.indexOf(formData.value.lifeStageOverride)
  return Math.max(0, idx) // 确保返回非负整数
})

function resolveSizeClassByPickerValue(value: unknown): string | null {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0 || index >= sizeClassOptions.length) {
    return null
  }

  return sizeClassOptions[index]
}

function resolveSizeClassIndex(sizeClass?: string | null): number {
  if (!sizeClass) {
    return 0
  }

  const idx = sizeClassOptions.indexOf(sizeClass)
  return Math.max(0, idx)
}

const sizeClassIndex = computed(() => {
  const effectiveSizeClass =
    formData.value.sizeClassOverride ||
    selectedBreed.value?.sizeCategory ||
    null

  return resolveSizeClassIndex(effectiveSizeClass)
})

const showStandardBreedSizeSummary = computed(() => (
  Boolean(selectedBreed.value) &&
  !isMixedBreed.value &&
  Boolean(selectedBreed.value?.sizeCategory) &&
  !showBreedSizeOverridePicker.value &&
  !formData.value.sizeClassOverride
))

// ========== 生命阶段自动计算逻辑 ==========

/**
 * 计算狗狗的年龄（月）
 */
const calculateAgeMonths = computed(() => {
  if (!formData.value.birthday) return 0
  const birthday = new Date(formData.value.birthday)
  const today = new Date()
  const diffTime = today.getTime() - birthday.getTime()
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  return Math.floor(diffDays / 30.4375) // 平均每月30.4375天
})

/**
 * 获取体型分类的成年标准（月）
 */
const getAdultThresholdMonths = computed(() => {
  const sizeClass = getCurrentSizeClass.value
  const thresholds: Record<string, number> = {
    'SMALL': 10,
    'MEDIUM': 12,
    'LARGE': 18,
    'GIANT': 24
  }
  // 如果有品种且品种有自定义成年标准，使用品种的
  if (selectedBreed.value && selectedBreed.value.adultAgeMonths) {
    return selectedBreed.value.adultAgeMonths
  }
  return thresholds[sizeClass] || 12
})

/**
 * 获取体型分类的老年标准（年）
 */
const getSeniorThresholdYears = computed(() => {
  const sizeClass = getCurrentSizeClass.value
  const thresholds: Record<string, number> = {
    'SMALL': 11,
    'MEDIUM': 10,
    'LARGE': 8,
    'GIANT': 7
  }
  // 如果有品种且品种有自定义老年标准，使用品种的
  if (selectedBreed.value && selectedBreed.value.seniorAgeYears) {
    return selectedBreed.value.seniorAgeYears
  }
  return thresholds[sizeClass] || 10
})

/**
 * 获取当前体型分类
 */
const getCurrentSizeClass = computed(() => {
  // 优先使用手动覆盖
  if (formData.value.sizeClassOverride) {
    return formData.value.sizeClassOverride
  }
  // 使用品种的体型分类
  if (selectedBreed.value) {
    return selectedBreed.value.sizeCategory
  }
  return 'MEDIUM' // 默认中型
})

/**
 * 计算自动识别的生命阶段
 * 优先使用后端返回的结果，如果没有则使用前端简化逻辑（仅作为fallback）
 * 注意：必须先选择品种（或混血犬选择体型分类）才能进行生命阶段判断
 */
const autoDetectedLifeStage = computed(() => {
  // 优先使用后端返回的生命阶段信息
  if (backendLifeStageInfo.value) {
    return backendLifeStageInfo.value
  }

  // Fallback：前端简化计算逻辑（用于未触发计算时的即时显示）
  // 但前提是必须已经选择了品种（或混血犬选择了体型分类）
  if (!selectedBreed.value && !formData.value.sizeClassOverride) {
    // 没有品种信息，无法判断生命阶段
    return null
  }

  const ageMonths = calculateAgeMonths.value
  const adultThreshold = getAdultThresholdMonths.value
  const ageYears = ageMonths / 12.0
  const seniorThreshold = getSeniorThresholdYears.value

  // 判断生命阶段
  if (ageMonths < adultThreshold) {
    // 幼犬期 - 根据月龄显示详细信息
    if (ageMonths < 4) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（快速成长期）` }
    } else if (ageMonths < 6) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（成长期）` }
    } else {
      // 6个月及以上，统一显示月龄
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月` }
    }
  } else if (ageYears >= seniorThreshold) {
    // 老年期
    return { stage: 'SENIOR', label: '老年期', detail: `${Math.floor(ageYears)}岁` }
  } else {
    // 成年期
    // 对于不足1岁的成年犬，显示月龄而不是"0岁"
    if (ageYears < 1) {
      return { stage: 'ADULT', label: '成年期', detail: `${ageMonths}个月` }
    }
    return { stage: 'ADULT', label: '成年期', detail: `${Math.floor(ageYears)}岁` }
  }
})

/**
 * 显示的生命阶段文本（如果有手动覆盖则显示覆盖后的，否则显示自动识别的）
 */
const displayLifeStage = computed(() => {
  const override = formData.value.lifeStageOverride
  if (override && override !== 'NONE') {
    // 显示手动覆盖的选项
    const labels: Record<string, string> = {
      'PUPPY': '幼犬期（手动覆盖）',
      'ADULT': '成年期（手动覆盖）',
      'SENIOR': '老年期（手动覆盖）',
      'PREGNANCY': '妊娠期',
      'LACTATION': '哺乳期'
    }
    return labels[override] || override
  }
  // 显示自动识别的
  return autoDetectedLifeStage.value?.label || '请先选择品种'
})

/**
 * 判断是否处于手动覆盖模式
 */
const isLifeStageOverride = computed(() => {
  return formData.value.lifeStageOverride && formData.value.lifeStageOverride !== 'NONE'
})

/**
 * 显示的生命阶段文本（手动或自动）
 */
const displayLifeStageText = computed(() => {
  if (isLifeStageOverride.value) {
    // 手动选择：显示手动选择的阶段
    const override = formData.value.lifeStageOverride
    const labels: Record<string, string> = {
      'PUPPY': '幼犬期',
      'ADULT': '成年期',
      'SENIOR': '老年期',
      'PREGNANCY': '妊娠期',
      'LACTATION': '哺乳期'
    }
    return labels[override] || override
  }
  // 自动匹配：显示自动识别的阶段
  if (!autoDetectedLifeStage.value) {
    return '请先选择品种'
  }
  return autoDetectedLifeStage.value.label
})

/**
 * 显示的生命阶段详情（手动或自动）
 */
const displayLifeStageDetail = computed(() => {
  // 手动选择和自动匹配都显示年龄信息，保持格式一致
  if (!autoDetectedLifeStage.value) {
    return ''
  }
  return autoDetectedLifeStage.value.detail
})

// ========== 生命阶段计算逻辑结束 ==========

const parsedCurrentWeightKg = computed(() => {
  if (typeof formData.value.currentWeightKg !== 'string') {
    return null
  }

  const trimmed = formData.value.currentWeightKg.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200 ? parsed : null
})

const hasValidCurrentWeightKg = computed(() => parsedCurrentWeightKg.value !== null)

const canSubmit = computed(() => {
  return Boolean(
    formData.value.name &&
    formData.value.breedId &&
    formData.value.birthday &&
    hasValidCurrentWeightKg.value &&
    formData.value.activityLevel &&
    !calculating.value &&
    (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
  )
})

const canPreview = computed(() => {
  return Boolean(
    formData.value.breedId &&
    formData.value.birthday &&
    hasValidCurrentWeightKg.value &&
    !calculating.value &&
    (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
  )
})

const createStepAvailability = computed(() => getCreateStepAvailability(formData.value))
const showBasicSection = computed(() => currentCreateStep.value === 'basic')
const showFeedingSection = computed(() => currentCreateStep.value === 'feeding')
const showRecommendationSection = computed(() => currentCreateStep.value === 'recommendation')
const showHealthSection = computed(() => currentCreateStep.value === 'health')
const canAdvanceFromBasic = computed(() => canAdvanceCreateStep('basic', createStepAvailability.value))
const canAdvanceFromFeeding = computed(() => canAdvanceCreateStep('feeding', createStepAvailability.value))
const canAdvanceFromRecommendation = computed(() => canAdvanceCreateStep('recommendation', createStepAvailability.value))
const createPreviewReady = computed(() => Boolean(
  canAdvanceFromFeeding.value &&
  canPreview.value &&
  !calculating.value
))
const createActionConfig = computed(() => getCreateWizardActionConfig({
  step: currentCreateStep.value,
  canAdvanceFromBasic: canAdvanceFromBasic.value,
  canAdvanceFromFeeding: canAdvanceFromFeeding.value,
  canAdvanceFromRecommendation: canAdvanceFromRecommendation.value && hasCreateRecommendationResult.value,
  canSubmit: canSubmit.value,
  recommendationReady: hasCreateRecommendationResult.value,
  calculating: calculating.value,
}))
const createRecommendationSummary = computed(() => {
  if (!calcResult.value) {
    return null
  }

  return buildRecommendationSummary({
    dogName: String(formData.value.name || '').trim() || '喂食建议',
    ageText: displayLifeStageDetail.value,
    lifeStageLabel: displayLifeStageText.value,
    weightKg: calcResult.value.calcDetails?.weightKg ?? parsedCurrentWeightKg.value,
    rer: calcResult.value.rer,
    totalDer: calcResult.value.totalDer,
    treatDeduction: calcResult.value.treatDeduction,
    finalFoodKcal: calcResult.value.finalFoodKcal,
    isTreatCapped: calcResult.value.isTreatCapped,
    calcDetails: calcResult.value.calcDetails,
  })
})
const createRecommendationCards = computed(() => {
  if (!createRecommendationSummary.value) {
    return []
  }

  const { cards } = createRecommendationSummary.value
  return cards.length === 3 ? cards : []
})
const createRecommendationMetrics = computed(() => {
  if (createRecommendationCards.value.length !== 3) {
    return []
  }

  return createRecommendationCards.value.map(card => ({
    label: card.label,
    value: card.value,
    hint: card.summary,
    emphasis: card.emphasis,
  }))
})
const hasCreateRecommendationResult = computed(() => (
  Boolean(calcResult.value) &&
  createRecommendationCards.value.length === 3 &&
  !calcStaleNotice.value
))

// onLoad lifecycle hook - receives page parameters
onLoad((options: any) => {
  console.log('[DogCreate] onLoad called with options:', options)

  const legacyDogId = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  const legacyRedirectRoute = getDogCreateLegacyRedirectRoute(legacyDogId)
  if (legacyRedirectRoute) {
    isLegacyRedirecting.value = true
    uni.redirectTo({ url: legacyRedirectRoute })
    return
  }

  console.log('[DogCreate] Create mode')
})

onMounted(async () => {
  if (isLegacyRedirecting.value) {
    return
  }

  // Load breeds first (required for breed selection)
  await loadBreeds()
  console.log('[DogCreate] onMounted: create mode')
  const restoredDraft = restoreCreateDraft()

  if ((currentCreateStep.value === 'recommendation' || currentCreateStep.value === 'health') && createPreviewReady.value) {
    scheduleCreateAutoPreview()
  }

  void trackDogProfileEvent('dog_profile_create_started', {
    mode: 'create',
    entrySource: 'dog_list',
    stepName: getCreateAnalyticsStepName(currentCreateStep.value),
    hasDraft: restoredDraft,
  })
  trackCreateStepViewed(currentCreateStep.value)
})

onUnmounted(() => {
  clearCreateAutoPreviewTimer()
})

watch(formData, () => {
  if (restoringCreateDraft.value) {
    previousCreateFormSnapshot = cloneFormSnapshot()
    return
  }

  const nextFormSnapshot = cloneFormSnapshot()
  const dirtyFields = getRecommendationDirtyFields(previousCreateFormSnapshot, nextFormSnapshot)

  previousCreateFormSnapshot = nextFormSnapshot

  if (dirtyFields.length > 0 && shouldAutoPreviewRecommendation(dirtyFields)) {
    invalidateBreedDerivedState()

    if (createPreviewReady.value) {
      scheduleCreateAutoPreview(dirtyFields)
    } else {
      clearCreateAutoPreviewTimer()
    }
  }

  saveCreateDraft()
}, { deep: true })

watch(() => formData.value.currentWeightKg, (newValue, oldValue) => {
  if (suppressDerivedStateInvalidation.value || oldValue === undefined || newValue === oldValue) {
    return
  }

  invalidateBreedDerivedState()
})

watch(currentCreateStep, (step) => {
  if (restoringCreateDraft.value) {
    return
  }

  saveCreateDraft()
  trackCreateStepViewed(step)

  if ((step === 'recommendation' || step === 'health') && !calcResult.value) {
    scheduleCreateAutoPreview()
  }
})

function getCreateAnalyticsStepName(step: DogProfileCreateStep) {
  const stepMap: Record<DogProfileCreateStep, string> = {
    basic: 'basic_info',
    feeding: 'feeding_info',
    recommendation: 'recommendation',
    health: 'health',
  }

  return stepMap[step]
}

function trackCreateStepViewed(step: DogProfileCreateStep) {
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'create',
    stepName: getCreateAnalyticsStepName(step),
  })
}

function trackCreateStepCompleted(step: DogProfileCreateStep) {
  void trackDogProfileEvent('dog_profile_step_completed', {
    mode: 'create',
    stepName: getCreateAnalyticsStepName(step),
  })
}

async function loadBreeds() {
  loadingBreeds.value = true
  try {
    const res: any = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[DogCreate] Loaded breeds:', breeds.value.length)
      if (breeds.value.length === 0) {
        uni.showToast({
          title: '品种列表为空，请先运行seed脚本',
          icon: 'none',
          duration: 3000
        })
      }
    } else {
      throw new Error(res.message || 'Failed to load breeds')
    }
  } catch (err) {
    console.error('[DogCreate] Load breeds error:', err)
    uni.showToast({
      title: '加载品种列表失败',
      icon: 'none',
      duration: 2000
    })
  } finally {
    loadingBreeds.value = false
  }
}

// 加载已有的狗狗档案
// 将 API 数据填充到表单
function populateFormData(profile: any) {
  console.log('[DogCreate] populateFormData called with profile:', profile)
  suppressDerivedStateInvalidation.value = true

  try {
    calcStaleNotice.value = false
    customBreedSizeClass.value = null

    // 基本信息
    formData.value.name = profile.name || ''
    formData.value.birthday = profile.birthday ?
      new Date(profile.birthday).toISOString().split('T')[0] : ''
    formData.value.gender = profile.gender || 'MALE'
    formData.value.isNeutered = profile.isNeutered ?? false
    formData.value.currentWeightKg = profile.currentWeightKg?.toString() || ''
    formData.value.bcsScore = normalizeCreateBcsScore(profile.bcsScore)
    formData.value.activityLevel = normalizeCreateActivityLevel(profile.activityLevel)
    formData.value.lifeStageOverride = profile.lifeStageOverride || 'NONE'
    formData.value.sizeClassOverride = profile.sizeClassOverride || null
    formData.value.mealsPerDay = normalizeCreateMealsPerDay(profile.mealsPerDay)
    formData.value.treatInputMode = 'ESTIMATE_LEVEL'
    formData.value.treatLevel = normalizeCreateTreatLevel(profile.treatLevel)
    formData.value.manualTreatKcal = ''
    formData.value.medicalHistory = profile.medicalHistory || ''
    formData.value.medicalRecords = profile.medicalRecords || []
    console.log('[DogCreate] Loaded medicalRecords:', formData.value.medicalRecords)
    formData.value.checkupRecords = profile.checkupRecords || []
    console.log('[DogCreate] Loaded checkupRecords:', formData.value.checkupRecords)
    formData.value.allergyRecords = profile.allergyRecords || []
    console.log('[DogCreate] Loaded allergyRecords:', formData.value.allergyRecords)
    formData.value.allergyFoods = profile.allergyFoods || ''
    formData.value.pickyFoods = profile.pickyFoods || ''

    // 品种信息
    formData.value.breedId = profile.breedId || ''
    formData.value.customBreedName = profile.customBreedName || ''

    console.log('[DogCreate] Breed info - breedId:', formData.value.breedId, 'customBreedName:', formData.value.customBreedName)

    // 判断是否为混血犬
    if (profile.breedId === MIXED_BREED_VIRTUAL_ID) {
      isMixedBreed.value = true
      selectedBreed.value = null
      console.log('[DogCreate] Detected mixed breed dog')
    } else {
      // 查找品种对象
      const breed = breeds.value.find(b => b.id === profile.breedId)
      if (breed) {
        selectedBreed.value = breed
        isMixedBreed.value = false
        console.log('[DogCreate] Found breed in list:', breed)
      } else {
        // 找不到品种时，创建临时品种对象（防止数据丢失）
        console.warn('[DogCreate] Breed not found in list:', profile.breedId, '- creating temp breed object')
        selectedBreed.value = {
          id: profile.breedId,
          name: profile.customBreedName || '未知品种',
          sizeCategory: profile.sizeClassOverride || 'MEDIUM',
          adultAgeMonths: 12,
          seniorAgeYears: 10,
          averageAdultWeightKg: undefined
        }
        isMixedBreed.value = false
        // 保持原有的 breedId 和 customBreedName
        formData.value.breedId = profile.breedId
        formData.value.customBreedName = profile.customBreedName || ''
        formData.value.sizeClassOverride = profile.sizeClassOverride || null
      }
    }

    console.log('[DogCreate] Form data after populate:', {
      name: formData.value.name,
      breedId: formData.value.breedId,
      customBreedName: formData.value.customBreedName,
      sizeClassOverride: formData.value.sizeClassOverride,
      isMixedBreed: isMixedBreed.value,
      selectedBreed: selectedBreed.value?.name
    })

    // 如果有缓存的计算结果，可以选择显示
    if (profile.cachedTargetFoodKcal) {
      console.log('[DogCreate] Cached target food kcal:', profile.cachedTargetFoodKcal)
    }
  } finally {
    suppressDerivedStateInvalidation.value = false
  }
}

function cloneFormSnapshot() {
  return JSON.parse(JSON.stringify(formData.value))
}

function getCustomerId() {
  const rawCustomerId = uni.getStorageSync('userId')
  return typeof rawCustomerId === 'string' && rawCustomerId.trim()
    ? rawCustomerId.trim()
    : ''
}

function clearCreateAutoPreviewTimer() {
  if (createAutoPreviewTimer) {
    clearTimeout(createAutoPreviewTimer)
    createAutoPreviewTimer = null
  }
}

function invalidateBreedDerivedState() {
  const hadCalcResult = Boolean(calcResult.value)

  backendLifeStageInfo.value = null
  calcResult.value = null
  showCalcProcess.value = false
  calcStaleNotice.value = calcStaleNotice.value || hadCalcResult
}

function setCreateStep(step: DogProfileCreateStep) {
  currentCreateStep.value = step

  nextTick(() => {
    scrollPageToTop()
  })
}

function getPreviousCreateStep(step: DogProfileCreateStep): DogProfileCreateStep {
  if (step === 'health') {
    return 'recommendation'
  }

  if (step === 'recommendation') {
    return 'feeding'
  }

  if (step === 'feeding') {
    return 'basic'
  }

  return 'basic'
}

function saveCreateDraft() {
  if (restoringCreateDraft.value) {
    return
  }

  const customerId = getCustomerId()
  if (!customerId) {
    return
  }

  saveDogProfileDraft(customerId, 'create', {
    step: currentCreateStep.value,
    form: cloneFormSnapshot(),
  })

  void trackDogProfileEvent('dog_profile_draft_saved', {
    mode: 'create',
    hasDraft: true,
    stepName: getCreateAnalyticsStepName(currentCreateStep.value),
  })
}

function restoreCreateDraft() {
  const customerId = getCustomerId()
  if (!customerId) {
    previousCreateFormSnapshot = cloneFormSnapshot()
    return false
  }

  const draft = loadDogProfileDraft(customerId, 'create')
  if (!draft) {
    previousCreateFormSnapshot = cloneFormSnapshot()
    return false
  }

  restoringCreateDraft.value = true

  try {
    populateFormData(draft.form)
    setCreateStep(resolveCreateDraftStep(draft.step, draft.form))
    previousCreateFormSnapshot = cloneFormSnapshot()
    calcResult.value = null
    void trackDogProfileEvent('dog_profile_draft_restored', {
      mode: 'create',
      hasDraft: true,
      stepName: getCreateAnalyticsStepName(currentCreateStep.value),
    })
    return true
  } finally {
    restoringCreateDraft.value = false
  }
}

function clearCreateDraft() {
  const customerId = getCustomerId()
  if (!customerId) {
    return
  }

  clearDogProfileDraft(customerId, 'create')
}

function scheduleCreateAutoPreview(dirtyFields?: string[]) {
  if (dirtyFields && !shouldAutoPreviewRecommendation(dirtyFields)) {
    return
  }

  if (!createPreviewReady.value) {
    return
  }

  clearCreateAutoPreviewTimer()
  createAutoPreviewTimer = setTimeout(() => {
    previewCalculation({ silent: true })
  }, 250)
}

function onSearchInput(e: any) {
  searchKeyword.value = e.detail.value
}

function selectBreed(breed: Breed) {
  selectedBreed.value = breed
  isMixedBreed.value = false
  showCustomBreedInput.value = false
  showBreedSizeOverridePicker.value = false
  formData.value.breedId = breed.id
  formData.value.customBreedName = ''
  formData.value.sizeClassOverride = null  // Reset override
  searchKeyword.value = ''
  customBreedSizeClass.value = null
  invalidateBreedDerivedState()
}

function selectBreedByName(name: string) {
  const breed = breeds.value.find(b => b.name === name)
  if (breed) {
    selectBreed(breed)
  }
}

function selectMixedBreed() {
  customBreedName.value = getManualBreedDraftName(searchKeyword.value, customBreedName.value)
  customBreedSizeClass.value = null
  showBreedSizeOverridePicker.value = false
  showCustomBreedInput.value = true
}

function confirmCustomBreed() {
  if (!customBreedSizeClass.value) {
    uni.showToast({
      title: '请选择体型分类',
      icon: 'none'
    })
    return
  }

  const name = customBreedName.value.trim() || '混血/其他'
  const selectedSizeClass = customBreedSizeClass.value
  selectedBreed.value = null
  isMixedBreed.value = true
  formData.value.breedId = MIXED_BREED_VIRTUAL_ID
  formData.value.customBreedName = name
  formData.value.sizeClassOverride = selectedSizeClass
  showBreedSizeOverridePicker.value = false
  showCustomBreedInput.value = false
  customBreedName.value = ''
  customBreedSizeClass.value = null
  searchKeyword.value = ''
  invalidateBreedDerivedState()
}

function cancelCustomBreed() {
  showCustomBreedInput.value = false
  customBreedName.value = ''
  customBreedSizeClass.value = null
}

function clearBreed() {
  selectedBreed.value = null
  isMixedBreed.value = false
  showCustomBreedInput.value = false
  showBreedSizeOverridePicker.value = false
  formData.value.breedId = ''
  formData.value.customBreedName = ''
  formData.value.sizeClassOverride = null
  searchKeyword.value = ''
  customBreedSizeClass.value = null
  invalidateBreedDerivedState()
}

function toggleCommonBreeds() {
  showCommonBreeds.value = !showCommonBreeds.value
}

function onSizeClassChange(e: any) {
  const selectedSizeClass = resolveSizeClassByPickerValue(e?.detail?.value)
  if (!selectedSizeClass) {
    return
  }

  formData.value.sizeClassOverride = selectedSizeClass
  invalidateBreedDerivedState()
}

function getSizeClassDisplay(): string {
  const override = formData.value.sizeClassOverride
  const labels: Record<string, string> = {
    'SMALL': '小型犬',
    'MEDIUM': '中型犬',
    'LARGE': '大型犬',
    'GIANT': '巨型犬'
  }

  if (isMixedBreed.value) {
    return override ? labels[override] : '请选择'
  }

  if (override) {
    return labels[override]
  }

  if (selectedBreed.value) {
    return labels[selectedBreed.value.sizeCategory]
  }

  return '请先选择品种'
}

function getSizeClassHint(): string {
  if (isMixedBreed.value) {
    return getCreateMixedBreedSizeHint(Boolean(formData.value.sizeClassOverride))
  }

  return ''
}

function onBirthdayChange(e: any) {
  formData.value.birthday = e.detail.value
  invalidateBreedDerivedState()
}

function restoreBreedSizeAutoMatch() {
  formData.value.sizeClassOverride = null
  showBreedSizeOverridePicker.value = false
  invalidateBreedDerivedState()
}

function clearMixedBreedSizeSelection() {
  if (!isMixedBreed.value) {
    return
  }

  formData.value.sizeClassOverride = null
  invalidateBreedDerivedState()
}

function enableBreedSizeOverride() {
  if (!selectedBreed.value || isMixedBreed.value) {
    return
  }

  showBreedSizeOverridePicker.value = true
}

function selectCustomBreedSize(sizeClass: string) {
  customBreedSizeClass.value = sizeClass
}

// 选择性别
function selectGender(gender: 'MALE' | 'FEMALE') {
  formData.value.gender = gender
}

// 选择是否绝育
function selectNeutered(value: boolean) {
  formData.value.isNeutered = value
  invalidateBreedDerivedState()
}

function selectBcsScore(score: number) {
  formData.value.bcsScore = score
  invalidateBreedDerivedState()
}

// 选择活动水平
function selectActivityLevel(value: string) {
  formData.value.activityLevel = value
  invalidateBreedDerivedState()
}

function onCreateMealsChange(event: any) {
  formData.value.mealsPerDay = createMealChoices[event.detail.value]?.value || '2'
  invalidateBreedDerivedState()
}

function toggleFeedingImpact(type: 'bcs' | 'activity' | 'treat') {
  feedingImpactExpanded[type] = !feedingImpactExpanded[type]
}

function onBcsImageLoad() {
  console.log('[BCS Guide] Image loaded successfully')
  console.log('[BCS Guide] Image URL:', bcsGuideImageUrl.value)
  showBcsFallback.value = false
}

function onBcsImageError() {
  console.error('[BCS Guide] Failed to load BCS guide image')
  console.error('[BCS Guide] Image URL:', bcsGuideImageUrl.value)
  console.error('[BCS Guide] Possible causes:')
  console.error('  1. Domain not in WeChat miniprogram whitelist')
  console.error('  2. Network connectivity issue')
  console.error('  3. Image file does not exist or is corrupted')
  showBcsFallback.value = true // 显示降级内容
}

// ========== 生命阶段选择函数 ==========

/**
 * 展开手动选择面板
 */
function enableLifeStageOverride() {
  console.log('[LifeStage] enableLifeStageOverride called')
  showLifeStageOverride.value = true
  console.log('[LifeStage] showLifeStageOverride set to:', showLifeStageOverride.value)
}

function closeLifeStageOverride() {
  showLifeStageOverride.value = false
}

/**
 * 选择手动覆盖的生命阶段（选中后自动收起面板）
 */
function selectLifeStageOverride(stage: string) {
  console.log('[LifeStage] selectLifeStageOverride called with:', stage)
  formData.value.lifeStageOverride = stage
  showLifeStageOverride.value = false // 自动收起面板
  invalidateBreedDerivedState()
  console.log('[LifeStage] Panel closed, lifeStageOverride set to:', formData.value.lifeStageOverride)
}

/**
 * 恢复自动匹配（清除手动覆盖）
 */
function restoreAutoMatch() {
  console.log('[LifeStage] restoreAutoMatch called')
  formData.value.lifeStageOverride = 'NONE'
  showLifeStageOverride.value = false
  invalidateBreedDerivedState()
  console.log('[LifeStage] Restored to auto match')
}

// ========== 生命阶段选择函数结束 ==========

function onLifeStageChange(e: any) {
  formData.value.lifeStageOverride = lifeStageOptions[e.detail.value]
  invalidateBreedDerivedState()
}

function selectTreatLevel(level: string) {
  formData.value.treatInputMode = 'ESTIMATE_LEVEL'
  formData.value.treatLevel = level
  invalidateBreedDerivedState()
}

async function previewCalculation(options?: { silent?: boolean }) {
  // Only calculate if we have minimum required fields
  // Silently return if not ready - don't show error to user
  if (!canPreview.value) {
    if (!options?.silent && !hasValidCurrentWeightKg.value) {
      showInvalidWeightToast()
    }
    return false
  }

  calculating.value = true
  try {
    void trackDogProfileEvent('dog_profile_calc_requested', {
      mode: 'create',
      stepName: currentCreateStep.value === 'feeding'
        ? 'feeding_info'
        : getCreateAnalyticsStepName(currentCreateStep.value),
      calcStatus: 'requested',
    })

    const payload: any = {
      breedId: formData.value.breedId,
      birthday: new Date(formData.value.birthday).toISOString(),
      gender: formData.value.gender,
      isNeutered: formData.value.isNeutered,
      currentWeightKg: parsedCurrentWeightKg.value,
      bcsScore: formData.value.bcsScore,
      activityLevel: formData.value.activityLevel,
      lifeStageOverride: formData.value.lifeStageOverride,
      sizeClassOverride: formData.value.sizeClassOverride,
      mealsPerDay: parseInt(formData.value.mealsPerDay) || 2,
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: formData.value.treatLevel
    }

    console.log('[DogCreate] Preview calculation payload:', payload)

    const res: any = await request({
      url: '/dogs/calc-preview',
      method: 'POST',
      data: payload
    })

    console.log('[DogCreate] Preview calculation response:', res)

    if (res.code === 0 && res.data) {
      calcResult.value = {
        rer: res.data.rer,
        totalDer: res.data.totalDer,
        finalFoodKcal: res.data.finalFoodKcal,
        treatDeduction: res.data.treatDeduction,
        isTreatCapped: res.data.isTreatCapped,
        dailyIntakeG: res.data.dailyIntakeG,
        calcDetails: res.data.calcDetails
      }
      console.log('[DogCreate] Preview calculation result:', calcResult.value)
      calcStaleNotice.value = false

      // 从后端返回的 calcDetails 中提取生命阶段信息
      if (res.data.calcDetails) {
        const details = res.data.calcDetails
        const lifeStage = details.lifeStage
        const ageMonths = details.ageMonths

        // 根据后端返回的 lifeStage 生成显示文本
        const labels: Record<string, string> = {
          'GROWTH': '生长期',
          'PUPPY': '幼犬期',
          'ADULT': '成年期',
          'SENIOR': '老年期',
          'PREGNANCY': '妊娠期',
          'LACTATION': '哺乳期'
        }

        // 生成详细信息文本
        let detailText = ''
        if (lifeStage === 'PUPPY') {
          if (ageMonths < 4) {
            detailText = `${ageMonths}个月（快速成长期）`
          } else if (ageMonths < 6) {
            detailText = `${ageMonths}个月（成长期）`
          } else {
            // 6个月及以上，统一显示月龄
            detailText = `${ageMonths}个月`
          }
        } else {
          // 成年期和老年期
          // 对于不足1岁的成年犬，显示月龄而不是"0岁"
          const ageYears = Math.floor(ageMonths / 12)
          if (ageYears < 1) {
            detailText = `${ageMonths}个月`
          } else {
            detailText = `${ageYears}岁`
          }
        }

        backendLifeStageInfo.value = {
          stage: lifeStage,
          label: labels[lifeStage] || lifeStage,
          detail: detailText
        }

        console.log('[DogCreate] Backend life stage info:', backendLifeStageInfo.value)
      }

      if (!options?.silent) {
        uni.showToast({
          title: '计算完成',
          icon: 'success',
          duration: 1500
        })
      }

      void trackDogProfileEvent('dog_profile_calc_succeeded', {
        mode: 'create',
        stepName: 'recommendation',
        calcStatus: 'success',
      })

      return true
    } else {
      throw new Error(res.message || 'Calculation failed')
    }
  } catch (err: any) {
    console.error('[DogCreate] Preview calculation error:', err)
    void trackDogProfileEvent('dog_profile_calc_failed', {
      mode: 'create',
      stepName: getCreateAnalyticsStepName(currentCreateStep.value),
      calcStatus: 'failed',
    })
    if (!options?.silent) {
      uni.showToast({
        title: err?.message || '计算失败，请检查输入',
        icon: 'none',
        duration: 2000
      })
    }
    calcResult.value = null
    return false
  } finally {
    calculating.value = false
  }
}

function showCreateStepBlockedToast(step: DogProfileCreateStep) {
  const messageMap: Record<DogProfileCreateStep, string> = {
    basic: '请先补齐名字、生日、体重，并确认品种/体型',
    feeding: '请先补齐基础信息',
    recommendation: '请先完善喂食信息并生成建议',
    health: '请先生成喂食建议',
  }

  uni.showToast({
    title: messageMap[step],
    icon: 'none',
    duration: 2000,
  })
}

function showInvalidWeightToast() {
  uni.showToast({
    title: '请输入有效的体重(0.1-200kg)',
    icon: 'none',
    duration: 2000,
  })
}

async function handleCreatePrimaryAction() {
  if (currentCreateStep.value === 'basic') {
    if (!canAdvanceFromBasic.value) {
      if (!hasValidCurrentWeightKg.value) {
        showInvalidWeightToast()
        return
      }

      if (isMixedBreed.value && !formData.value.sizeClassOverride) {
        uni.showToast({
          title: '混血犬请选择体型分类',
          icon: 'none',
          duration: 2000,
        })
        return
      }

      showCreateStepBlockedToast('basic')
      return
    }

    trackCreateStepCompleted('basic')
    setCreateStep(getNextCreateStep('basic'))
    return
  }

  if (currentCreateStep.value === 'feeding') {
    if (!canAdvanceFromFeeding.value) {
      showCreateStepBlockedToast('recommendation')
      return
    }

    const previewSucceeded = await previewCalculation()
    if (!previewSucceeded) {
      return
    }

    trackCreateStepCompleted('feeding')
    setCreateStep(getNextCreateStep('feeding'))
    return
  }

  if (currentCreateStep.value === 'recommendation') {
    if (!canAdvanceFromRecommendation.value || !hasCreateRecommendationResult.value) {
      showCreateStepBlockedToast('health')
      return
    }

    trackCreateStepCompleted('recommendation')
    setCreateStep(getNextCreateStep('recommendation'))
    return
  }

  if (currentCreateStep.value === 'health' && !hasCreateRecommendationResult.value) {
    showCreateStepBlockedToast('health')
    return
  }

  await submit()
}

async function handleCreateSecondaryAction() {
  if (currentCreateStep.value === 'basic') {
    return
  }

  setCreateStep(getPreviousCreateStep(currentCreateStep.value))
}

async function handleCreateTertiaryAction() {
  if (currentCreateStep.value === 'recommendation') {
    if (!hasCreateRecommendationResult.value) {
      showCreateStepBlockedToast('health')
      return
    }

    await submit()
    return
  }

  if (currentCreateStep.value !== 'health') {
    return
  }

  void trackDogProfileEvent('dog_profile_health_skipped', {
    mode: 'create',
    stepName: 'health',
  })
  await submit()
}

// ========== 计算过程辅助函数 ==========

function toggleCalcProcess() {
  showCalcProcess.value = !showCalcProcess.value
}

function getSizeClassLabel(sizeClass: string): string {
  const labels: Record<string, string> = {
    'SMALL': '小型犬',
    'MEDIUM': '中型犬',
    'LARGE': '大型犬',
    'GIANT': '巨型犬'
  }
  return labels[sizeClass] || sizeClass
}

function getLifeStageLabel(lifeStage: string): string {
  const labels: Record<string, string> = {
    'GROWTH': '生长期',
    'ADULT': '成年期',
    'SENIOR': '老年期',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
    'PUPPY': '幼犬期'
  }
  return labels[lifeStage] || lifeStage
}

function getTreatModeLabel(treatMode: string): string {
  const labels: Record<string, string> = {
    'ESTIMATE_LEVEL': '估算级别',
    'EXACT_KCAL': '精确热量'
  }
  return labels[treatMode] || treatMode
}

function getTreatLevelLabel(treatLevel?: string): string {
  if (!treatLevel) return ''
  const labels: Record<string, string> = {
    'NONE': '无零食',
    'LOW': '少量',
    'MODERATE': '适量',
    'HIGH': '较多'
  }
  return labels[treatLevel] || treatLevel
}

function getActivityLevelText(activityLevel: string): string {
  const texts: Record<string, string> = {
    'LOW': '低活动量',
    'NORMAL': '正常活动量',
    'HIGH': '高活动量'
  }
  return texts[activityLevel] || activityLevel
}

function getBcsText(bcsMultiplier: number): string {
  // 根据bcsMultiplier判断体况
  if (bcsMultiplier >= 1.1) return '偏瘦（需要增加热量）'
  if (bcsMultiplier === 1.0) return '标准体型'
  if (bcsMultiplier < 1.0 && bcsMultiplier >= 0.6) return '偏胖（需要减少热量）'
  return '未知'
}

/**
 * 获取生命阶段基础系数说明
 */
function getStageFactorBase(details: any): string {
  const stage = details.lifeStage

  if (stage === 'PUPPY') {
    // 幼犬期：系数根据月龄和体型细分，这里显示总体说明
    return `${details.stageFactor.toFixed(1)}（幼犬期，根据月龄和体型确定）`
  } else if (stage === 'ADULT') {
    // 成年期：根据绝育状态显示不同基准
    if (details.isNeutered) {
      return '1.6（已绝育基准）'
    } else {
      return '1.8（未绝育基准）'
    }
  } else if (stage === 'SENIOR') {
    return '1.4（老年期基准）'
  } else if (stage === 'PREGNANCY') {
    return '3.0（妊娠期）'
  } else if (stage === 'LACTATION') {
    return '4.0（哺乳期）'
  }

  // 其他情况（如手动覆盖）返回实际值
  return `${details.stageFactor.toFixed(2)}（${getLifeStageLabel(stage)}）`
}

/**
 * 获取活动水平系数
 */
function getActivityMultiplier(level: string): string {
  const multipliers: Record<string, string> = {
    'RESTING': '0.8',
    'LOW': '0.9',
    'NORMAL': '1.0',
    'HIGH': '1.2',
    'WORKING': '1.5'
  }
  return multipliers[level] || '1.0'
}

// ========== 计算过程辅助函数结束 ==========

async function submit() {
  const { name, breedId, birthday, currentWeightKg, activityLevel } = formData.value

  if (!hasCreateRecommendationResult.value) {
    showCreateStepBlockedToast('health')
    return false
  }

  // Validation
  if (!name || !breedId || !birthday || !currentWeightKg || !activityLevel) {
    uni.showToast({
      title: '请填写必填项',
      icon: 'none'
    })
    return false
  }

  // Validate weight is a valid number
  if (!hasValidCurrentWeightKg.value) {
    showInvalidWeightToast()
    return false
  }

  // For mixed breed, require size class override
  if (isMixedBreed.value && !formData.value.sizeClassOverride) {
    uni.showToast({
      title: '混血犬请选择体型分类',
      icon: 'none'
    })
    return false
  }

  uni.showLoading({ title: '创建中...' })

  void trackDogProfileEvent('dog_profile_submit_requested', {
    mode: 'create',
    submitStatus: 'requested',
  })

  const payload: any = {
    ...buildDogCreatePayload(formData.value),
  }

  // Debug log: Show submit payload
  console.log('[DogCreate] Submit payload:', JSON.stringify(payload, null, 2))
  console.log('[DogCreate] Submit payload breedId:', payload.breedId)
  console.log('[DogCreate] formData.breedId:', formData.value.breedId)
  console.log('[DogCreate] selectedBreed:', selectedBreed.value)

  const requestConfig = {
    url: '/dogs',
    method: 'POST',
    data: payload
  }

  try {
    const res: any = await request(requestConfig)
    console.log('[DogCreate] Submit response:', res)
    if (res.code === 0 && res.data) {
      const updatedDog = res.data.profile || res.data
      console.log('[DogCreate] Updated dog data:', updatedDog)
      console.log('[DogCreate] Updated dog breedId:', updatedDog.breedId)
      const resultDogId = updatedDog.id

      if (!resultDogId) {
        console.error('[DogCreate] Response missing dog id:', res.data)
        uni.showToast({
          title: '创建失败：响应格式错误',
          icon: 'none',
          duration: 2000
        })
        return false
      }

      console.info(`[DogCreate] Dog created successfully: id=${resultDogId}, name=${updatedDog.name}`)

      writeDogHealthStateSnapshotCache(
        resultDogId,
        mergeDogHealthStateSnapshot(
          buildDogHealthStateSnapshot(payload),
          updatedDog,
        ),
      )

      if (hasValidCurrentWeightKg.value) {
        try {
          await dogApi.createWeightRecord(
            resultDogId,
            buildInitialWeightRecordPayload({
              recordDate: new Date().toISOString().split('T')[0],
              weightKg: parseFloat(formData.value.currentWeightKg),
            }),
          )
        } catch (weightRecordErr) {
          console.error('[DogCreate] Failed to persist initial weight record:', weightRecordErr)
        }
      }

      void trackDogProfileEvent('dog_profile_submit_succeeded', {
        mode: 'create',
        dogId: resultDogId,
        submitStatus: 'success',
      })

      uni.setStorageSync('dogId', resultDogId)
      addDogToCache(updatedDog)
      clearCreateDraft()

      uni.showToast({
        title: '创建成功',
        icon: 'success',
        duration: 1500
      })

      setTimeout(() => {
        uni.redirectTo({
          url: '/pages/dog-profile-list/index'
        })
      }, 1500)
      return true
    } else {
      const errorMsg = res.message || '创建失败'
      console.error('[DogCreate] API error:', res.code, errorMsg)
      void trackDogProfileEvent('dog_profile_submit_failed', {
        mode: 'create',
        submitStatus: 'failed',
      })
      uni.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
      return false
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err) || '网络错误'
    console.error('[DogCreate] Create dog error:', err)
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'create',
      submitStatus: 'failed',
    })

    let userMsg = '创建失败，请稍后重试'
    if (errMsg.includes('400') || errMsg.includes('Bad Request')) {
      userMsg = '请求参数错误，请检查填写内容'
    } else if (errMsg.includes('网络') || errMsg.includes('连接') || errMsg.includes('timeout')) {
      userMsg = '网络连接失败，请检查网络设置'
    }

    uni.showToast({
      title: userMsg,
      icon: 'none',
      duration: 2000
    })
    return false
  } finally {
    uni.hideLoading()
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-bottom: calc(220rpx + env(safe-area-inset-bottom)); /* 为固定底部按钮和安全区留出空间 */
}

.form-section {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.wizard-step-header {
  position: sticky;
  top: 0;
  z-index: 40;
  margin: 0 -30rpx 8rpx;
  padding: 0 30rpx 12rpx;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8rpx);
}

.wizard-step {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.wizard-step__intro {
  padding: 8rpx 8rpx 0;
}

.wizard-step__eyebrow {
  display: block;
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: #0f7b49;
}

.wizard-step__title {
  display: block;
  margin-top: 12rpx;
  font-size: 40rpx;
  line-height: 1.25;
  font-weight: 700;
  color: #17313f;
}

.wizard-step__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #667b74;
}

.wizard-step--feeding .profile-card {
  background: linear-gradient(180deg, #ffffff 0%, #fbfffc 100%);
  border: 2rpx solid #e3f1e8;
  border-radius: 32rpx;
  padding: 28rpx;
  box-shadow: 0 14rpx 40rpx rgba(15, 123, 73, 0.06);
}

.wizard-step--feeding .label {
  margin-bottom: 12rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #59706a;
}

.wizard-step--feeding .input {
  height: 88rpx;
  border: 2rpx solid #dce9e2;
  border-radius: 24rpx;
  padding: 0 24rpx;
  background: #ffffff;
  font-size: 28rpx;
  color: #18313f;
  box-sizing: border-box;
}

.wizard-step--feeding .picker {
  height: 88rpx;
  line-height: 84rpx;
  border: 2rpx solid #dce9e2;
  border-radius: 24rpx;
  padding: 0 24rpx;
  background: #ffffff;
  font-size: 28rpx;
  color: #18313f;
  box-sizing: border-box;
}

.wizard-step--feeding .hint {
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #69807a;
}

.wizard-step--feeding .feeding-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.wizard-step--feeding .feeding-impact-link {
  flex-shrink: 0;
  font-size: 24rpx;
  line-height: 1.5;
  font-weight: 600;
  color: #0f7a4d;
}

.wizard-step--feeding .bcs-choice-grid {
  margin-top: 18rpx;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10rpx;
}

.wizard-step--feeding .bcs-choice-card {
  --bcs-accent: #17313f;
  --bcs-border: rgba(20, 47, 58, 0.08);
  --bcs-bg: #ffffff;
  min-height: 92rpx;
  padding: 12rpx 8rpx 8rpx;
  border-radius: 18rpx;
  background: var(--bcs-bg);
  border: 1rpx solid var(--bcs-border);
  text-align: center;
}

.wizard-step--feeding .bcs-choice-card--active {
  border-color: rgba(15, 122, 77, 0.34);
  box-shadow: 0 0 0 4rpx rgba(15, 122, 77, 0.08);
  transform: translateY(-2rpx);
}

.wizard-step--feeding .bcs-choice-card__score {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--bcs-accent);
}

.wizard-step--feeding .bcs-choice-card__status,
.wizard-step--feeding .bcs-choice-card__status {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  line-height: 1.5;
  color: #6d808a;
}

.wizard-step--feeding .bcs-choice-card--score-1 {
  --bcs-accent: #2c67c7;
  --bcs-border: rgba(44, 103, 199, 0.18);
  --bcs-bg: linear-gradient(180deg, #eef5ff 0%, #f8fbff 100%);
}

.wizard-step--feeding .bcs-choice-card--score-2 {
  --bcs-accent: #3478d9;
  --bcs-border: rgba(52, 120, 217, 0.18);
  --bcs-bg: linear-gradient(180deg, #eff7ff 0%, #f9fbff 100%);
}

.wizard-step--feeding .bcs-choice-card--score-3 {
  --bcs-accent: #23879b;
  --bcs-border: rgba(35, 135, 155, 0.16);
  --bcs-bg: linear-gradient(180deg, #ecf9f9 0%, #f7fcfc 100%);
}

.wizard-step--feeding .bcs-choice-card--score-4 {
  --bcs-accent: #2f8f5f;
  --bcs-border: rgba(47, 143, 95, 0.16);
  --bcs-bg: linear-gradient(180deg, #eef9f1 0%, #f8fcf9 100%);
}

.wizard-step--feeding .bcs-choice-card--score-5 {
  --bcs-accent: #0f7a4d;
  --bcs-border: rgba(15, 122, 77, 0.18);
  --bcs-bg: linear-gradient(180deg, #edf9f1 0%, #f8fcf9 100%);
}

.wizard-step--feeding .bcs-choice-card--score-6 {
  --bcs-accent: #a06a11;
  --bcs-border: rgba(160, 106, 17, 0.16);
  --bcs-bg: linear-gradient(180deg, #fff7e9 0%, #fffdf9 100%);
}

.wizard-step--feeding .bcs-choice-card--score-7 {
  --bcs-accent: #b56c16;
  --bcs-border: rgba(181, 108, 22, 0.16);
  --bcs-bg: linear-gradient(180deg, #fff1e4 0%, #fffaf6 100%);
}

.wizard-step--feeding .bcs-choice-card--score-8 {
  --bcs-accent: #c75d32;
  --bcs-border: rgba(199, 93, 50, 0.16);
  --bcs-bg: linear-gradient(180deg, #ffebe3 0%, #fff8f5 100%);
}

.wizard-step--feeding .bcs-choice-card--score-9 {
  --bcs-accent: #bf4337;
  --bcs-border: rgba(191, 67, 55, 0.16);
  --bcs-bg: linear-gradient(180deg, #ffe4df 0%, #fff7f5 100%);
}

.wizard-step--feeding .feeding-impact-panel {
  margin-top: 14rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: rgba(15, 122, 77, 0.05);
  border: 1rpx solid rgba(15, 122, 77, 0.1);
}

.wizard-step--feeding .feeding-impact-panel__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-step--feeding .feeding-impact-panel__summary {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #5d747f;
}

.wizard-step--feeding .feeding-impact-panel__item {
  margin-top: 14rpx;
}

.wizard-step--feeding .feeding-impact-panel__item-label {
  display: block;
  font-size: 22rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-step--feeding .feeding-impact-panel__item-detail {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6d808a;
}

.wizard-step--feeding .feeding-guide-card {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: #ffffff;
  border: 1rpx solid rgba(15, 122, 77, 0.1);
}

.wizard-step--feeding .feeding-guide-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.wizard-step--feeding .feeding-guide-card__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-step--feeding .feeding-guide-card__badge {
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1.4;
  font-weight: 600;
  color: #6b8e7d;
}

.wizard-step--feeding .feeding-guide-card__image {
  margin-top: 14rpx;
  width: 100%;
  border-radius: 18rpx;
}

.wizard-step--feeding .activity-level-container {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.wizard-step--feeding .activity-level-card {
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.wizard-step--feeding .activity-level-card--active {
  border-color: rgba(7, 193, 96, 0.28);
  background: rgba(7, 193, 96, 0.08);
}

.wizard-step--feeding .activity-level-card__label {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-step--feeding .activity-level-card__description {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6d808a;
}

.wizard-step--feeding .treat-level-grid {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.wizard-step--feeding .treat-level-card {
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.wizard-step--feeding .treat-level-card--active {
  border-color: rgba(7, 193, 96, 0.28);
  background: rgba(7, 193, 96, 0.08);
}

.wizard-step--feeding .treat-level-card__label {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-step--feeding .treat-level-card__description {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6d808a;
}

.wizard-step--basic .profile-card {
  background: linear-gradient(180deg, #ffffff 0%, #fbfffc 100%);
  border: 2rpx solid #e3f1e8;
  border-radius: 32rpx;
  padding: 28rpx;
  box-shadow: 0 14rpx 40rpx rgba(15, 123, 73, 0.06);
}

.profile-card__identity {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.profile-card__avatar-placeholder {
  width: 144rpx;
  height: 144rpx;
  flex-shrink: 0;
  border-radius: 36rpx;
  background: linear-gradient(145deg, #edf8f1 0%, #dff3e7 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 2rpx rgba(15, 123, 73, 0.08);
}

.profile-card__avatar-text {
  font-size: 72rpx;
  line-height: 1;
  color: #0f6b43;
}

.profile-card__identity-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.profile-card__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.profile-card__field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile-card__field--half {
  flex: 1 1 280rpx;
}

.profile-card__field--size {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #e6f0ea;
}

.profile-card__section-heading {
  margin-bottom: 20rpx;
}

.profile-card__section-title {
  display: block;
  font-size: 30rpx;
  line-height: 1.3;
  font-weight: 700;
  color: #17313f;
}

.profile-card__section-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #69807a;
}

.wizard-step--basic .label {
  margin-bottom: 12rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #59706a;
}

.wizard-step--basic .input,
.wizard-step--basic .picker {
  height: 88rpx;
  border: 2rpx solid #dce9e2;
  border-radius: 24rpx;
  padding: 0 24rpx;
  background: #ffffff;
  font-size: 28rpx;
  color: #18313f;
  box-sizing: border-box;
}

.wizard-step--basic .picker {
  line-height: 84rpx;
}

.wizard-step--basic .selected-breed-display {
  padding: 22rpx 24rpx;
  background: #f5faf7;
  border: 2rpx solid #dcebe1;
  border-radius: 24rpx;
}

.wizard-step--basic .change-btn {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #0f6b43;
  background: rgba(15, 123, 73, 0.08);
}

.wizard-step--basic .breed-selector {
  border: 2rpx solid #e3efe7;
  border-radius: 24rpx;
  background: #ffffff;
}

.wizard-step--basic .search-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
  background: linear-gradient(180deg, #f7fbf8 0%, #f1f8f4 100%);
  border-bottom: 1rpx solid #e6f0ea;
}

.wizard-step--basic .search-box__icon {
  flex-shrink: 0;
  font-size: 28rpx;
  line-height: 1;
  color: #5f7a6f;
}

.wizard-step--basic .search-input {
  width: 100%;
  border: 2rpx solid #d8e7de;
  border-radius: 20rpx;
  padding: 0 24rpx;
  background: #ffffff;
}

.wizard-step--basic .search-input--with-icon {
  padding-left: 20rpx;
}

.wizard-step--basic .section {
  padding: 20rpx;
  border-bottom: 1rpx solid #edf3ef;
}

.wizard-step--basic .section-header .section-title {
  margin-bottom: 0;
}

.wizard-step--basic .breed-tag {
  background: #eef7ff;
  border: 1rpx solid #cfe1f7;
  color: #236ce5;
}

.wizard-step--basic .size-info {
  border: 2rpx solid #dce9e2;
  border-radius: 22rpx;
  padding: 18rpx 20rpx;
}

.wizard-step--basic .manual-select-btn {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
}

.wizard-step--basic .inline-manual-entry {
  padding: 24rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.wizard-step--basic .inline-manual-entry__title {
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-step--basic .inline-manual-entry__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.wizard-step--basic .custom-breed-btn-cancel--inline {
  margin: 0;
  min-width: 200rpx;
}

.wizard-step--basic .custom-breed-size-grid--inline {
  margin-top: 0;
}

.wizard-step--basic .custom-breed-btn-confirm--inline {
  margin: 0;
  min-width: 180rpx;
}

.wizard-step--basic .auto-size-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 20rpx;
  border: 2rpx solid #dce9e2;
  border-radius: 22rpx;
  background: #f5f7f7;
}

.wizard-step--basic .auto-size-summary__text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: #17313f;
  font-weight: 600;
}

.wizard-step--basic .auto-size-summary__link {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #0f6b43;
}

.wizard-step--basic .mixed-size-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 20rpx;
  border: 2rpx solid #dce9e2;
  border-radius: 22rpx;
  background: #f7fbf8;
}

.wizard-step--basic .mixed-size-summary__text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: #17313f;
  font-weight: 600;
}

.wizard-step--basic .mixed-size-summary__link {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #0f6b43;
}

.wizard-recommendation-section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.wizard-recommendation-shell {
  padding: 28rpx;
  border-radius: 28rpx;
  background: linear-gradient(180deg, #f8fcfa 0%, #ffffff 38%);
  border: 1rpx solid rgba(7, 193, 96, 0.12);
  box-shadow: 0 12rpx 34rpx rgba(24, 40, 60, 0.08);
}

.wizard-recommendation-header {
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid rgba(15, 107, 67, 0.08);
}

.wizard-recommendation-title {
  display: block;
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #17313f;
}

.wizard-recommendation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.wizard-recommendation-meta-item {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
}

.wizard-energy-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 24rpx;
}

.wizard-energy-card {
  display: flex;
  gap: 24rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #fff;
  border: 1rpx solid rgba(17, 24, 39, 0.06);
}

.wizard-energy-card--highlight {
  background: linear-gradient(135deg, #eefaf3 0%, #ffffff 88%);
  border-color: rgba(7, 193, 96, 0.28);
  box-shadow: 0 12rpx 30rpx rgba(7, 193, 96, 0.12);
}

.wizard-energy-main {
  width: 220rpx;
  flex-shrink: 0;
}

.wizard-energy-label {
  display: block;
  font-size: 24rpx;
  color: #70808a;
}

.wizard-energy-value {
  display: block;
  margin-top: 12rpx;
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #18313f;
}

.wizard-energy-value--highlight {
  font-size: 42rpx;
  color: #0f6b43;
}

.wizard-energy-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.wizard-energy-summary {
  display: block;
  font-size: 24rpx;
  line-height: 1.5;
  font-weight: 600;
  color: #36505f;
}

.wizard-energy-line {
  display: block;
  font-size: 22rpx;
  line-height: 1.6;
  color: #69808a;
}

.wizard-recommendation-note {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #fff9ec;
  border: 1rpx solid #ffe3ad;
}

.wizard-recommendation-note-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #8a5b08;
}

.wizard-recommendation-note-body {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6b30;
}

.wizard-recommendation-empty {
  padding: 30rpx 24rpx;
  border-radius: 24rpx;
  background: rgba(7, 193, 96, 0.06);
}

.wizard-recommendation-empty-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.wizard-recommendation-empty-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #627780;
}

.wizard-skip-note {
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 20rpx;
  background: #f7fafb;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6d7b86;
}

.loading-notice {
  background-color: #f0f0f0;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
  text-align: center;
  font-size: 28rpx;
  color: #666;
}

.form-item {
  margin-bottom: 30rpx;
}

.breed-section {
  margin-bottom: 40rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #333;
  font-weight: bold;
}

/* Breed Selection Styles */
.breed-selector {
  border: 1px solid #ddd;
  border-radius: 8rpx;
  overflow: hidden;
}

.search-box {
  padding: 20rpx;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
}

.search-results-header {
  padding: 20rpx 20rpx 8rpx;
}

.search-results-hint {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #999;
}

.search-input {
  width: 100%;
  height: 70rpx;
  border: 1px solid #ddd;
  border-radius: 6rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.section {
  padding: 20rpx;
  border-bottom: 1px solid #e9ecef;
}

.section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

.section-title {
  font-size: 26rpx;
  color: #666;
  font-weight: bold;
  display: block;
  margin-bottom: 15rpx;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

/* Common Breeds Tags */
.common-breeds {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
}

.breed-tag {
  background-color: #e6f7ff;
  color: #1890ff;
  padding: 10rpx 20rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  border: 1px solid #91d5ff;
}

/* Breed List */
.breed-list {
  max-height: 400rpx;
  overflow-y: auto;
}

.breed-search-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  max-height: 520rpx;
  padding: 12rpx 20rpx 8rpx;
  box-sizing: border-box;
}

.all-breeds-list {
  max-height: 600rpx;
}

.breed-item {
  padding: 20rpx;
  border-bottom: 1px solid #f0f0f0;
  font-size: 28rpx;
  color: #333;
}

.breed-item:last-child {
  border-bottom: none;
}

.breed-search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  background-color: #fff;
  border: 1px solid #d9e2f2;
  border-radius: 16rpx;
  box-shadow: 0 6rpx 18rpx rgba(24, 144, 255, 0.08);
}

.breed-search-item:active {
  background-color: #f0f7ff;
  border-color: #91d5ff;
  transform: scale(0.98);
}

.breed-search-main {
  flex: 1;
  min-width: 0;
}

.breed-search-name {
  display: block;
  font-size: 30rpx;
  color: #333;
  font-weight: bold;
}

.breed-search-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 10rpx;
}

.breed-search-chip {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background-color: #f0f5ff;
  color: #2f54eb;
  font-size: 22rpx;
  line-height: 1.2;
}

.breed-search-chip.common {
  background-color: #fff7e6;
  color: #d46b08;
}

.breed-search-action {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.breed-search-action-text {
  font-size: 24rpx;
  color: #1890ff;
  font-weight: bold;
}

.breed-search-action-icon {
  font-size: 28rpx;
  color: #1890ff;
  font-weight: bold;
}

.search-empty-state {
  padding: 32rpx 20rpx 12rpx;
  text-align: center;
}

.no-results {
  display: block;
  color: #999;
  font-size: 26rpx;
}

.search-empty-hint {
  display: block;
  margin-top: 12rpx;
  color: #999;
  font-size: 24rpx;
  line-height: 1.5;
}

.search-mixed-entry {
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 8rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: bold;
  background-color: #fff7e6;
  color: #fa8c16;
  border: 1px solid #ffd591;
}

.search-mixed-entry.primary {
  margin-top: 20rpx;
}

.search-fallback-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 20rpx 8rpx;
}

.search-fallback-text {
  font-size: 24rpx;
  color: #999;
}

.search-fallback-link {
  font-size: 24rpx;
  color: #fa8c16;
  font-weight: bold;
}

/* Selected Breed Display */
.selected-breed-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 8rpx;
}

.selected-text {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.change-btn {
  color: #1890ff;
  font-size: 26rpx;
}

/* Size Class Display */
.size-display {
  background-color: #f8f9fa;
  padding: 20rpx;
  border-radius: 8rpx;
  border: 1px solid #e9ecef;
}

.size-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx;
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 6rpx;
}

.size-info--auto {
  background-color: #f5f7f7;
  border-color: #dde6e0;
}

.size-text {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.edit-icon {
  font-size: 32rpx;
  color: #1890ff;
}

.manual-select-btn {
  font-size: 26rpx;
  color: #1890ff;
  padding: 8rpx 20rpx;
  background-color: #e6f7ff;
  border-radius: 4rpx;
  white-space: nowrap;
}

.manual-select-btn--muted {
  color: #6f8a7d;
  background-color: #edf4ef;
}

/* Original Input Styles */
.input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.picker {
  height: 80rpx;
  line-height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}

.hint {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 5rpx;
}

.restore-auto-link {
  display: inline-block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #1890ff;
}

.size-required {
  border-color: #ff4d4f !important;
  background-color: #fff1f0 !important;
}

.hint-warning {
  color: #ff4d4f !important;
  font-weight: bold;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 20rpx;
  border: none;
}

.btn:disabled {
  background-color: #ccc;
  color: #999;
}

.btn-secondary {
  background-color: #1890ff;
  margin-top: 20rpx;
}

.calc-stale-notice {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 8rpx;
}

.calc-stale-text {
  font-size: 24rpx;
  color: #d46b08;
  line-height: 1.5;
}

.recommendation-card {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8rpx;
  padding: 30rpx;
  margin-top: 30rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 15rpx;
}

.calc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx 0;
  border-bottom: 1px solid #f0f0f0;
}

.calc-item:last-child {
  border-bottom: none;
}

.calc-item.highlight-item {
  background-color: #e6f7ff;
  padding: 20rpx;
  border-radius: 4rpx;
  margin: 10rpx 0;
  border-bottom: none;
}

.calc-label {
  font-size: 28rpx;
  color: #666;
  flex: 1;
}

.calc-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.calc-value.highlight {
  color: #1890ff;
  font-weight: bold;
  font-size: 32rpx;
}

.calc-warning {
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4rpx;
  padding: 15rpx;
  margin-top: 15rpx;
  font-size: 26rpx;
  color: #fa8c16;
  line-height: 1.5;
}

/* Collapsed Common Breeds */
.common-breeds.collapsed {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  max-height: 80rpx;
  overflow: hidden;
}

/* Size Category Groups with Sidebar Navigation */
.breed-selector-with-sidebar {
  display: flex;
  height: 600rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  overflow: hidden;
  background-color: #fff;
}

/* 侧边快速导航栏 */
.quick-nav-sidebar {
  width: 100rpx;
  background-color: #f5f5f5;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 10rpx;
  border-bottom: 1px solid #e8e8e8;
  transition: all 0.3s ease;
  cursor: pointer;
}

.nav-item:last-child {
  border-bottom: none;
}

.nav-item.active {
  background-color: #fff;
  box-shadow: 0 0 10rpx rgba(0, 0, 0, 0.1);
  border-left: 3px solid #1890ff;
}

.nav-icon {
  font-size: 28rpx;
  margin-bottom: 4rpx;
}

.nav-label {
  font-size: 20rpx;
  color: #666;
}

.nav-item.active .nav-label {
  color: #1890ff;
  font-weight: bold;
}

/* 品种内容滚动区 */
.breed-content-scroll {
  flex: 1;
  height: 100%;
  overflow-y: auto;
}

.size-category-group {
  margin-bottom: 20rpx;
}

.size-category-group:last-child {
  margin-bottom: 0;
}

.size-category-title {
  font-size: 28rpx;
  font-weight: bold;
  padding: 20rpx;
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  border-radius: 4rpx;
  margin-bottom: 15rpx;
}

/* 不同分类的颜色主题 */
.size-category-group[data-category="SMALL"] .size-category-title {
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  color: #0050b3;
  border-left: 4px solid #1890ff;
}

.size-category-group[data-category="MEDIUM"] .size-category-title {
  background: linear-gradient(135deg, #fffbe6 0%, #fff1b8 100%);
  color: #ad6800;
  border-left: 4px solid #faad14;
}

.size-category-group[data-category="LARGE"] .size-category-title {
  background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
  color: #389e0d;
  border-left: 4px solid #52c41a;
}

.size-category-group[data-category="GIANT"] .size-category-title {
  background: linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%);
  color: #722ed1;
  border-left: 4px solid #722ed1;
}

/* 品种网格布局 */
.breed-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  padding: 0 20rpx 20rpx 20rpx;
}

.breed-item {
  background-color: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6rpx;
  padding: 15rpx 25rpx;
  font-size: 26rpx;
  color: #333;
  text-align: center;
  min-width: 120rpx;
  transition: all 0.2s ease;
  cursor: pointer;
}

.breed-item:active {
  background-color: #e6f7ff;
  border-color: #1890ff;
  transform: scale(0.95);
}

/* Custom Breed Input Modal */
.custom-breed-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.custom-breed-content {
  width: 600rpx;
  background-color: #fff;
  border-radius: 12rpx;
  padding: 40rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);
}

.custom-breed-title {
  font-size: 32rpx;
  color: #333;
  font-weight: bold;
  margin-bottom: 12rpx;
  display: block;
  text-align: center;
}

.custom-breed-subtitle {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  color: #666;
  text-align: center;
}

.custom-breed-input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  margin-bottom: 12rpx;
}

.custom-breed-input-hint {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  color: #7d7d7d;
  line-height: 1.5;
}

.custom-breed-size-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.custom-breed-size-option {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  background-color: #f7f8f9;
  border: 2rpx solid #d8dee4;
  border-radius: 12rpx;
  transition: all 0.2s;
}

.custom-breed-size-option.active {
  background-color: #e8f7ee;
  border-color: #07c160;
  box-shadow: 0 10rpx 24rpx rgba(7, 193, 96, 0.12);
}

.custom-breed-size-option-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #335344;
}

.custom-breed-hint {
  display: block;
  margin-bottom: 30rpx;
  font-size: 24rpx;
  color: #999;
}

.custom-breed-actions {
  display: flex;
  gap: 20rpx;
}

.custom-breed-btn-cancel,
.custom-breed-btn-confirm {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  text-align: center;
  border: none;
}

.custom-breed-btn-cancel {
  background-color: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
}

.custom-breed-btn-confirm {
  background-color: #07c160;
  color: #fff;
}

.custom-breed-btn-confirm.disabled {
  background-color: #ccc;
  color: #999;
}

/* Gender Selector */
.gender-selector {
  display: flex;
  gap: 18rpx;
}

.gender-option {
  flex: 1;
  min-height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 0 20rpx;
  background-color: #f6f8f7;
  border: 2rpx solid #e0e9e4;
  border-radius: 24rpx;
  transition: all 0.2s;
}

.gender-option--male.active {
  background: #edf5ff;
  border-color: #cfe0ff;
  color: #236ce5;
}

.gender-option--female.active {
  background: #fff1f6;
  border-color: #ffd2e2;
  color: #d84f8b;
}

.gender-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #60726a;
}

.gender-symbol {
  font-size: 30rpx;
  line-height: 1;
  font-weight: 700;
}

.gender-symbol--male {
  color: #236ce5;
}

.gender-symbol--female {
  color: #d84f8b;
}

.gender-option.active .gender-label {
  color: inherit;
}

/* Neuter Selector */
.neuter-selector {
  display: flex;
  gap: 18rpx;
}

.neuter-option {
  flex: 1;
  min-height: 92rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20rpx;
  background-color: #f6f8f7;
  border: 2rpx solid #e0e9e4;
  border-radius: 24rpx;
  transition: all 0.2s;
}

.neuter-option.active {
  background: #edf8f1;
  border-color: #bcdcc8;
  box-shadow: 0 12rpx 24rpx rgba(15, 123, 73, 0.08);
}

.neuter-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #60726a;
}

.neuter-option.active .neuter-label {
  color: #0f6b43;
}

/* BCS Score Row */
.bcs-score-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.bcs-slider {
  flex: 1;
  min-width: 0;
}

.bcs-body-status {
  font-size: 26rpx;
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 8rpx 12rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
}

/* Activity Level Options */
.activity-level-container {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.activity-level-option {
  padding: 20rpx;
  background-color: #f5f5f5;
  border: 2px solid #e0e0e0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.activity-level-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.activity-level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.activity-level-label {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.activity-level-option.active .activity-level-label {
  color: #1890ff;
}

.activity-level-coefficient {
  font-size: 26rpx;
  font-weight: bold;
  color: #ff4d4f;
  background-color: #fff1f0;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.activity-level-description {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}

/* BCS Guide Popup */
.bcs-guide-popup {
  width: 650rpx;
  max-height: 85vh;
  background-color: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.bcs-guide-title {
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;
  color: #333;
  margin-bottom: 20rpx;
  width: 100%;
  box-sizing: border-box;
}

.bcs-image-container {
  width: 100%;
  flex: 1;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.bcs-image-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.bcs-guide-image {
  max-width: 100%;
  height: auto;
  border-radius: 8rpx;
  display: block;
}

.bcs-image-error {
  padding: 60rpx 20rpx;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}

/* BCS降级内容样式 */
.bcs-fallback-content {
  padding: 30rpx;
  background-color: #fafafa;
  border-radius: 8rpx;
}

.bcs-fallback-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  text-align: center;
  margin-bottom: 30rpx;
}

.bcs-table {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.bcs-row {
  background-color: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  border-left: 6rpx solid #ccc;
}

.bcs-row-thin {
  border-left-color: #ff4d4f;
  background-color: #fff1f0;
}

.bcs-row-ideal {
  border-left-color: #52c41a;
  background-color: #f6ffed;
}

.bcs-row-overweight {
  border-left-color: #faad14;
  background-color: #fffbe6;
}

.bcs-score-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16rpx;
}

.bcs-score {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.bcs-label {
  font-size: 24rpx;
  color: #666;
  margin-top: 8rpx;
}

.bcs-desc {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.bcs-desc-item {
  font-size: 24rpx;
  color: #666;
  line-height: 1.6;
}

.bcs-tip {
  margin-top: 30rpx;
  padding: 20rpx;
  background-color: #e6f7ff;
  border-radius: 8rpx;
  border-left: 4rpx solid #1890ff;
}

.bcs-tip-text {
  font-size: 24rpx;
  color: #0050b3;
  line-height: 1.6;
}

/* Health Record Section */
.health-record-section {
  margin-bottom: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  overflow: hidden;
}

.health-record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 30rpx;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12rpx;
  cursor: pointer;
}

.health-record-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
  transition: transform 0.3s;
}

.health-record-content {
  padding: 20rpx 30rpx;
  background-color: #f9f9f9;
}

.placeholder-box {
  padding: 40rpx 20rpx;
  background-color: #fff;
  border: 2px dashed #d0d0d0;
  border-radius: 8rpx;
  text-align: center;
}

.placeholder-text {
  font-size: 26rpx;
  color: #999;
}

/* ========== 生命阶段样式 ========== */

.life-stage-section {
  background-color: #f8f9fa;
  border-radius: 12rpx;
  padding: 24rpx;
  border: 1px solid #e9ecef;
}

/* 生命阶段内容区域 */
.life-stage-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

/* 自动匹配结果展示 */
.auto-match-result {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%);
  border-radius: 8rpx;
  border-left: 4px solid #1890ff;
  flex-wrap: wrap;
}

.auto-match-text {
  font-size: 30rpx;
  color: #1890ff;
  font-weight: bold;
}

.auto-match-label {
  font-size: 26rpx;
  color: #666;
  font-weight: 500;
}

/* 手动选择触发按钮 */
.manual-select-trigger {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8rpx;
  padding: 12rpx 0;
  background: transparent;
  border: none;
  transition: all 0.3s;
}

.manual-select-trigger:active {
  opacity: 0.6;
}

.manual-select-text {
  font-size: 26rpx;
  color: #999;
  font-weight: 400;
}

.manual-select-icon {
  font-size: 22rpx;
  color: #999;
}

/* 未填写生日提示 */
.life-stage-prompt {
  padding: 32rpx;
  background-color: #fffbe6;
  border-radius: 8rpx;
  text-align: center;
  border: 1px solid #ffe58f;
}

.prompt-text {
  font-size: 26rpx;
  color: #ad6800;
  line-height: 1.6;
}

.life-stage-sheet {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: flex-end;
}

.life-stage-sheet-mask {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.38);
}

.life-stage-sheet-content {
  position: relative;
  width: 100%;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  background-color: #fff;
  border-radius: 28rpx 28rpx 0 0;
  box-shadow: 0 -12rpx 32rpx rgba(0, 0, 0, 0.14);
}

.life-stage-sheet-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: #1f1f1f;
  text-align: center;
}

.life-stage-sheet-subtitle {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6f6f6f;
  text-align: center;
}

.override-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.override-option {
  padding: 16rpx;
  background-color: #f5f5f5;
  border: 2px solid #e0e0e0;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  transition: all 0.2s;
}

.override-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.override-option-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.override-option.active .override-option-label {
  color: #1890ff;
  font-weight: bold;
}

.override-option-desc {
  font-size: 24rpx;
  color: #999;
  line-height: 1.4;
}

.life-stage-sheet-cancel {
  margin-top: 24rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 16rpx;
  background-color: #f3f4f6;
  color: #4b5563;
  border: none;
  font-size: 28rpx;
}

/* ========== 零食设置样式 ========== */

.treat-section {
  background-color: #f8f9fa;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-label {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 20rpx;
}

.field-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 12rpx;
}

/* 零食输入模式选择器 */
.treat-mode-selector,
.treat-level-selector {
  margin-bottom: 20rpx;
}

.treat-exact-input {
  margin-bottom: 20rpx;
}

/* 卡片选项容器 */
.card-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

/* 横向布局的卡片选项容器 */
.card-options-horizontal {
  flex-direction: row;
  gap: 16rpx;
}

/* 单个卡片 */
.card-option {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
  background-color: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.card-option.active {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

/* 简化卡片（无圆圈，用于输入模式选择） */
.card-option-simple {
  flex: 1;
  justify-content: center;
  padding: 24rpx 16rpx;
}

/* 单选按钮 */
.card-radio {
  width: 40rpx;
  height: 40rpx;
  border: 3px solid #d0d0d0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-option.active .card-radio {
  border-color: #1890ff;
}

.radio-checked {
  width: 20rpx;
  height: 20rpx;
  background-color: #1890ff;
  border-radius: 50%;
}

/* 卡片内容 */
.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.card-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.card-option.active .card-label {
  color: #1890ff;
  font-weight: bold;
}

.card-label-simple {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  flex: 1;
  text-align: center;
}

.card-option-simple.active .card-label-simple {
  color: #1890ff;
  font-weight: bold;
}

.card-desc {
  font-size: 24rpx;
  color: #999;
  line-height: 1.4;
}

/* 零食量卡片特殊样式 */
.treat-level-card .card-label {
  font-size: 28rpx;
}

/* 精确输入框 */
.treat-exact-input .input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.input-white-bg {
  background-color: #ffffff !important;
}

/* ========== 计算过程样式 ========== */
.calc-process-section {
  margin-top: 20rpx;
  border-top: 1px solid #e9ecef;
  padding-top: 20rpx;
}

.process-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f0f2f5;
  border-radius: 8rpx;
  cursor: pointer;
}

.process-toggle-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.process-toggle-icon {
  font-size: 24rpx;
  color: #1890ff;
}

.process-content {
  margin-top: 20rpx;
}

.process-step {
  margin-bottom: 24rpx;
  padding: 20rpx;
  background-color: #fafafa;
  border-radius: 8rpx;
  border-left: 3px solid #1890ff;
}

.process-step.final-step {
  background-color: #f6ffed;
  border-left-color: #52c41a;
}

.step-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
}

.step-desc {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
  margin-bottom: 10rpx;
}

.step-tip {
  font-size: 24rpx;
  color: #0050b3;
  line-height: 1.6;
  margin-top: 10rpx;
  background-color: #e6f7ff;
  padding: 10rpx 12rpx;
  border-radius: 4rpx;
  border-left: 3px solid #1890ff;
}

.step-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.info-item {
  font-size: 26rpx;
  color: #666;
  line-height: 1.5;
}

.formula-box {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6rpx;
  padding: 15rpx;
  margin-top: 10rpx;
}

.formula-text {
  font-size: 26rpx;
  color: #333;
  font-family: 'Courier New', monospace;
  line-height: 1.8;
  word-break: break-all;
  display: block;
  margin-bottom: 4rpx;
}

.formula-result {
  font-size: 30rpx;
  font-weight: bold;
  color: #52c41a;
  margin-top: 10rpx;
  padding-top: 10rpx;
  border-top: 2px dashed #d9d9d9;
}

.coefficients-box {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 10rpx;
}

.coeff-item {
  font-size: 26rpx;
  color: #666;
  line-height: 1.5;
}

.treat-box {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 10rpx;
}

.treat-mode,
.treat-level,
.treat-deduction {
  font-size: 26rpx;
  color: #666;
  line-height: 1.5;
}

.treat-mode {
  font-weight: bold;
  color: #333;
}

/* ========== 计算过程样式结束 ========== */

/* 内联计算按钮样式 */
.btn-inline-calc {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 8rpx;
  font-size: 30rpx;
  margin-top: 20rpx;
  border: none;
}

.btn-inline-calc:disabled {
  background-color: #ccc;
  color: #999;
}

</style>
