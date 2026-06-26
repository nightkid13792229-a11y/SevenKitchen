<template>
  <view
    class="recipe-designer-editor-page"
    :class="{
      'reorder-mode': reorderMode,
      'item-dragging-active': !!draggingItemId,
      'ingredient-picker-active': ingredientPickerVisible,
    }"
    :style="editorPageStyle"
    @tap="collapseAssessmentIfOpen"
    @touchmove="lockEditorScrollWhileItemDragging"
  >
    <view v-if="draftSeriesLifeStage" class="series-context-block">
      <text class="series-context-title">{{ recipeSeriesDisplayName }}</text>
      <view class="series-context-details">
        <text class="series-context-detail">{{ assessmentStandardName }}</text>
        <text class="series-context-detail">{{ draftSeriesLifeStageLabel }}</text>
      </view>
    </view>

    <view class="section">
      <view class="section-header ingredient-action-header">
        <view class="section-heading">
          <text class="section-title">原料</text>
          <text class="section-total">{{ items.length }}种 · 总重量 {{ currentTotalWeightG.toFixed(0) }}g</text>
        </view>
        <view class="history-controls" @tap.stop>
          <button
            class="history-btn history-icon-btn"
            :disabled="!canUndoRecipeDesignerHistory"
            aria-label="撤回"
            @tap.stop="undoRecipeDesignerHistory"
          >
            <view class="history-icon history-icon-undo" aria-hidden="true">
              <view class="history-icon-arc"></view>
              <view class="history-icon-arrow"></view>
            </view>
          </button>
          <button
            class="history-btn history-icon-btn"
            :disabled="!canRedoRecipeDesignerHistory"
            aria-label="前进"
            @tap.stop="redoRecipeDesignerHistory"
          >
            <view class="history-icon history-icon-redo" aria-hidden="true">
              <view class="history-icon-arc"></view>
              <view class="history-icon-arrow"></view>
            </view>
          </button>
        </view>
        <button
          v-if="canRevertToLatestOfficial"
          class="link-btn revert-official-btn"
          :disabled="revertingToLatestOfficial || loading || autoSaveStatus === 'saving'"
          @tap.stop="confirmRevertToLatestOfficial"
        >
          {{ revertingToLatestOfficial ? '恢复中' : '恢复正式版' }}
        </button>
        <button
          v-if="items.length > 1"
          class="link-btn sort-mode-btn"
          :class="{ active: reorderMode }"
          @tap.stop="toggleReorderMode"
        >
          {{ reorderMode ? '完成' : '排序' }}
        </button>
      </view>

      <view v-if="revertingToLatestOfficial" class="state-block">
        <text>正在恢复正式版本...</text>
      </view>

      <view v-else-if="redirectingToEditableDraft" class="state-block">
        <text>正在进入可编辑版本...</text>
      </view>

      <view v-else-if="loading" class="state-block">
        <text>加载中...</text>
      </view>

      <view v-else-if="items.length === 0" class="state-block">
        <text>暂无原料</text>
      </view>

      <view v-else class="item-list">
        <view
          v-for="(item, index) in items"
          :key="item.id"
          class="item-row-frame"
        >
          <view v-if="showDragInsertionMarker(index)" class="drag-insertion-marker"></view>
          <view
            class="item-row"
            :class="{
              'item-row-excluded': !isItemIncludedInAssessment(item),
              'item-row-reordering': reorderMode,
              dragging: draggingItemId === item.id,
            }"
          >
            <view v-if="reorderMode" class="item-drag-handle-shell">
              <button
                class="drag-handle"
                hover-class="none"
                @touchstart.stop.prevent="startItemDrag(item, index, $event)"
                @touchmove.stop.prevent="onItemTouchMove"
                @touchend.stop.prevent="finishItemDrag($event)"
                @touchcancel.stop.prevent="cancelItemDrag($event)"
              >
                <view class="drag-handle-bar"></view>
                <view class="drag-handle-bar"></view>
                <view class="drag-handle-bar"></view>
              </button>
            </view>
            <view class="item-leading">
              <text class="item-type-tag" :class="getItemTypeTagClass(item)">
                {{ getItemTypeLabel(item) }}
              </text>
            </view>
            <view class="item-main">
              <text class="item-name">{{ getItemName(item) }}</text>
              <text class="item-meta">{{ getItemNutritionProfileName(item) }}</text>
            </view>
            <view class="weight-editor">
              <input
                class="weight-input"
                type="digit"
                :value="formatItemWeightInput(item.weightG)"
                :disabled="reorderMode"
                @input="onWeightInput(item, $event)"
                @blur="updateWeight(item)"
                @confirm="updateWeight(item)"
              />
              <text class="weight-unit">{{ getItemUnit(item) }}</text>
            </view>
            <view class="item-ratio-column">
              <text v-if="shouldShowItemWeightRatio(item)" class="item-ratio">
                {{ getItemWeightPercentLabel(item) }}
              </text>
            </view>
            <view v-if="!reorderMode" class="item-action-stack" @tap.stop>
              <view class="include-control">
                <switch
                  class="include-switch"
                  :checked="isItemIncludedInAssessment(item)"
                  color="#1677ff"
                  @change="toggleItemAssessment(item, $event)"
                />
              </view>
              <button class="icon-text-btn" @tap.stop="removeIngredient(item)">删除</button>
            </view>
          </view>
          <view
            v-if="getRemovableSupplementWarning(item)"
            class="supplement-removal-hint"
          >
            <text>{{ getRemovableSupplementWarningMessage(item) }}</text>
          </view>
        </view>
      </view>

      <view v-if="!loading && !redirectingToEditableDraft && !revertingToLatestOfficial && !reorderMode" class="ingredient-list-actions">
        <button class="link-btn secondary-add-btn" @tap="openIngredientPicker()">添加原料</button>
      </view>
    </view>

    <view v-if="ingredientPickerVisible" class="ingredient-picker-mask" @tap="closeIngredientPicker">
      <view class="ingredient-picker-panel" @tap.stop>
        <view class="picker-fixed-top">
          <view class="picker-header">
            <view>
              <text class="picker-title">添加原料</text>
              <text v-if="ingredientNutrientSearchTarget" class="picker-nutrient-context">
                食材按每100g{{ ingredientNutrientSearchTarget.label }}含量排序
              </text>
            </view>
            <button class="picker-close" @tap="closeIngredientPicker">×</button>
          </view>

          <view class="search-row">
            <input
              class="search-input"
              v-model="ingredientSearchKeyword"
              confirm-type="search"
              placeholder="搜索原料名称"
              @confirm="searchIngredientOptions"
            />
          </view>

          <view v-if="showSupplementLibraryTip" class="supplement-library-tip">
            <text class="supplement-library-copy">没有找到补剂？去补剂库新增</text>
            <button class="link-btn supplement-library-btn" @tap="goToSupplementLibrary">补剂库</button>
          </view>
        </view>

        <scroll-view scroll-y class="ingredient-list picker-scroll-body">
          <view v-if="ingredientLoading && ingredientOptionSections.length === 0" class="picker-state">
            <text>加载原料中...</text>
            <text class="picker-state-note">仅显示已维护并验证营养档案的原料，可尝试缩短关键词或近义词</text>
          </view>

          <view v-else-if="ingredientOptionSections.length === 0" class="picker-state">
            <text>{{ ingredientEmptyText }}</text>
            <text class="picker-state-note">仅显示已维护并验证营养档案的原料，可尝试缩短关键词或近义词</text>
          </view>

          <view
            v-for="section in ingredientOptionSections"
            :key="section.key"
            class="ingredient-option-section"
            :class="[`ingredient-option-section-${section.kind}`]"
          >
            <view v-if="section.title" class="ingredient-option-section-header">
              <view class="ingredient-option-section-heading">
                <text v-if="section.kind !== 'all'" class="ingredient-section-kind">
                  {{ section.kind === 'supplement' ? '补剂' : '食材' }}
                </text>
                <text class="ingredient-option-section-title">{{ section.title }}</text>
              </view>
              <text class="section-count">{{ section.options.length }}项</text>
            </view>

            <view
              v-for="option in section.options"
              :key="option.id"
              class="food-option"
              :class="{
                selected: selectedIngredientOption?.id === option.id,
                'supplement-option': section.kind === 'supplement',
                'food-source-option': section.kind === 'food',
              }"
              @tap="selectIngredientOption(option)"
            >
              <view class="food-option-mainline">
                <view class="food-main">
                  <text class="food-name">{{ option.name }}</text>
                  <text
                    v-if="getIngredientOptionNutrientMatchText(option)"
                    class="food-nutrient-match"
                  >
                    {{ getIngredientOptionNutrientMatchText(option) }}
                  </text>
                </view>
              </view>

              <text
                v-if="getSupplementOptionDetailText(option)"
                class="ingredient-option-detail"
              >
                {{ getSupplementOptionDetailText(option) }}
              </text>

              <view
                v-if="shouldShowNutritionProfileOptions(option)"
                class="profile-options"
              >
                <view
                  v-for="profile in option.nutritionProfiles"
                  :key="profile.nutritionFoodId"
                  class="profile-option"
                  :class="{ active: selectedNutritionProfile?.nutritionFoodId === profile.nutritionFoodId }"
                  @tap.stop="selectNutritionProfile(profile)"
                >
                  <text class="profile-name">{{ profile.name }}</text>
                  <text class="profile-meta">{{ getNutritionProfileMeta(profile) }}</text>
                </view>
              </view>
            </view>
          </view>

          <button
            v-if="ingredientOptionHasMore"
            class="load-more-btn"
            :disabled="ingredientLoading"
            @tap="loadMoreIngredientOptions"
          >
            {{ ingredientLoading ? '加载中' : '加载更多' }}
          </button>
        </scroll-view>

        <view class="picker-footer picker-footer-panel picker-fixed-footer">
          <view class="selected-info">
            <text class="selected-label">已选原料</text>
            <text class="selected-name">{{ selectedIngredientOption?.name || '请选择' }}</text>
            <text class="selected-profile">
              {{ getSelectedNutritionProfileLabel() }}
            </text>
          </view>
          <view class="add-weight-row">
            <view class="weight-entry">
              <view class="weight-label-row">
                <text class="weight-label">用量</text>
                <text class="required-mark">*</text>
              </view>
              <view class="add-weight-input-shell">
                <input
                  class="add-weight-input"
                  type="digit"
                  v-model="newItemWeightInput"
                  placeholder="请输入"
                />
                <text class="weight-unit">{{ selectedIngredientUnitLabel }}</text>
              </view>
            </view>
            <button
              class="primary-btn add-btn"
              :disabled="!canConfirmAddIngredient"
              @tap="confirmAddIngredient"
            >
              {{ addingItem ? '加入中' : '加入' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <view
      v-if="!reorderMode"
      class="assessment-drawer"
      :class="{ expanded: assessmentExpanded, dragging: assessmentDragging }"
      :style="assessmentDrawerStyle"
      @tap.stop
    >
      <view
        class="drawer-touch-zone"
      >
        <view
          class="drawer-drag-zone"
          @touchstart.stop="onAssessmentTouchStart"
          @touchmove.stop.prevent="onAssessmentTouchMove"
          @touchend.stop="onAssessmentTouchEnd"
        >
          <view class="drawer-grip"></view>
        </view>

        <view class="drawer-handle">
          <view class="drawer-title-row">
            <text class="drawer-title">营养评估</text>
            <text class="standard-context">{{ assessmentStandardContextLabel }}</text>
            <button
              class="scenario-switch-btn"
              :disabled="scenarioSwitching || redirectingToEditableDraft || revertingToLatestOfficial"
              @tap.stop="openScenarioSwitchSheet"
            >
              切换
            </button>
          </view>
        </view>
      </view>

      <view class="assessment-category-tabs" @tap.stop>
        <view
          v-for="category in assessmentCategories"
          :key="category.key"
          class="assessment-category-tab"
          :class="{ active: selectedAssessmentCategory === category.key }"
          @tap.stop="selectAssessmentCategory(category.key, true)"
        >
          <text>{{ getAssessmentCategoryLabel(category.key) }}</text>
          <text
            v-if="getAssessmentCategoryAttentionCount(category) > 0"
            class="assessment-category-badge"
          >
            {{ getAssessmentCategoryAttentionCount(category) }}
          </text>
        </view>
      </view>

      <scroll-view v-if="assessmentListVisible" scroll-y class="assessment-list" :key="selectedAssessmentCategory" :scroll-top="assessmentScrollTop" @scroll="onAssessmentListScroll">
        <view class="assessment-list-surface">
          <text class="assessment-category-title">
            {{ getAssessmentCategoryTitle(selectedAssessmentCategoryGroup.key) }}
          </text>
          <view v-if="visibleAssessmentEntries.length === 0" class="assessment-empty">
            <text>暂无评估条目</text>
          </view>
          <view
            v-for="entry in visibleAssessmentEntries"
            :key="entry.key || entry.nutrientKey"
            class="assessment-entry"
          >
            <view v-if="isMacroOverviewEntry(entry)" class="macro-overview-row">
              <text class="macro-overview-name">{{ getAssessmentEntryName(entry) }}</text>
              <view class="macro-overview-amount">
                <text class="macro-overview-value">{{ formatMacroOverviewPrimaryValue(entry) }}</text>
                <text v-if="formatMacroOverviewBasisLabel(entry)" class="macro-overview-basis">
                  {{ formatMacroOverviewBasisLabel(entry) }}
                </text>
              </view>
              <text class="macro-overview-dry-matter">
                {{ formatMacroOverviewDryMatterLabel(entry) || '' }}
              </text>
            </view>
            <view v-else>
              <view class="entry-heading">
                <view class="entry-name-line">
                  <text class="entry-status entry-status-inline" :class="getAssessmentDisplayStatusClass(entry)">
                    {{ getAssessmentDisplayStatusLabel(entry) }}
                  </text>
                  <text class="entry-name">{{ getAssessmentEntryName(entry) }}</text>
                  <text class="entry-basis">{{ formatAssessmentBasisLabel(entry) }}</text>
                  <text
                    v-if="shouldShowAssessmentDetailTrigger(entry)"
                    class="entry-detail-trigger"
                    @tap.stop="showAssessmentEntryDetail(entry)"
                  >
                    含量/原料
                  </text>
                </view>
                <text
                  v-if="shouldShowDryMatter(entry)"
                  class="entry-dry-matter entry-dry-matter-side"
                >
                  {{ formatDryMatterLabel(entry) }}
                </text>
              </view>
              <view
                v-if="hasAssessmentRange(entry)"
                class="entry-range"
              >
                <view
                  v-if="getAssessmentBoundaryLabel(entry, 'min')"
                  class="entry-range-bound"
                  :style="getAssessmentBoundaryStyle(entry, 'min')"
                >
                  <text>{{ getAssessmentBoundaryTitle(entry, 'min') }} {{ getAssessmentBoundaryLabel(entry, 'min') }}</text>
                  <text
                    v-if="getAssessmentBoundaryNote(entry, 'min')"
                    class="entry-footnote-btn"
                    @tap.stop="showAssessmentBoundaryNote(entry, 'min')"
                  >
                    ?
                  </text>
                </view>
                <view
                  v-if="getAssessmentBoundaryLabel(entry, 'max')"
                  class="entry-range-bound"
                  :style="getAssessmentBoundaryStyle(entry, 'max')"
                >
                  <text>{{ getAssessmentBoundaryTitle(entry, 'max') }} {{ getAssessmentBoundaryLabel(entry, 'max') }}</text>
                  <text
                    v-if="getAssessmentBoundaryNote(entry, 'max')"
                    class="entry-footnote-btn"
                    @tap.stop="showAssessmentBoundaryNote(entry, 'max')"
                  >
                    ?
                  </text>
                </view>
                <view class="entry-range-track" :style="getAssessmentRangeStyle(entry)">
                  <view
                    v-if="shouldShowAssessmentCurrentMarker(entry)"
                    class="entry-range-marker"
                    :style="getAssessmentCurrentMarkerStyle(entry)"
                  ></view>
                </view>
                <text
                  v-if="shouldShowAssessmentCurrentMarker(entry)"
                  class="entry-range-current"
                  :style="getAssessmentCurrentLabelStyle(entry)"
                >
                  当前 {{ getAssessmentCurrentLabel(entry) }}
                </text>
                <text v-if="getAssessmentRangeConflictNote(entry)" class="entry-range-conflict">
                  {{ getAssessmentRangeConflictNote(entry) }}
                </text>
              </view>
              <view v-else-if="entry.status === 'INFO'" class="entry-reference-value">
                <text>当前 {{ getAssessmentCurrentLabel(entry) }}</text>
              </view>
              <view v-else>
                <text class="entry-missing-detail">缺少当前配方含量，暂不能定位到标准范围</text>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-if="showBottomPublishBar" class="bottom-publish-bar" @tap.stop>
      <view v-if="customerNextActions" class="customer-next-actions">
        <button
          class="primary-btn customer-next-btn"
          :disabled="!canCreatePrivateSnapshot || privateSnapshotCreatingTarget === 'ORDER'"
          @tap="goToPrivateRecipeTarget('ORDER')"
        >
          订购成品
        </button>
        <button
          class="secondary-btn customer-next-btn"
          :disabled="!canCreatePrivateSnapshot || privateSnapshotCreatingTarget === 'DIY'"
          @tap="goToPrivateRecipeTarget('DIY')"
        >
          生成制作单
        </button>
        <button
          class="link-btn customer-report-btn"
          :disabled="loading || redirectingToEditableDraft || revertingToLatestOfficial || autoSaveStatus === 'saving'"
          @tap="goToNutritionReport"
        >
          查看营养报告
        </button>
      </view>
      <button
        v-else
        class="primary-btn bottom-publish-btn"
        :disabled="loading || redirectingToEditableDraft || revertingToLatestOfficial || autoSaveStatus === 'saving'"
        @tap="goToNutritionReport"
      >
        查看营养报告
      </button>
    </view>
  </view>

  <view
    v-if="scenarioSwitchSheetVisible"
    class="scenario-switch-mask"
    @tap="closeScenarioSwitchSheet"
  >
    <view class="scenario-switch-panel" @tap.stop>
      <view class="scenario-switch-header">
        <text class="scenario-switch-title">切换生命阶段</text>
        <text class="scenario-switch-close" @tap="closeScenarioSwitchSheet">关闭</text>
      </view>
      <text class="scenario-switch-note">
        切换后会按新的生命阶段重新计算 FEDIAF 2025 营养评估。
      </text>

      <view class="scenario-option-list">
        <view
          v-for="option in scenarioOptions"
          :key="option.value"
          class="scenario-option"
          :class="{ 'scenario-option-active': option.value === pendingScenario }"
          @tap="selectScenarioOption(option.value)"
        >
          <view class="scenario-option-main">
            <text class="scenario-option-title">{{ option.label }}</text>
            <text v-if="option.value === pendingScenario" class="scenario-option-check">✓</text>
          </view>
          <text v-if="getScenarioDescription(option.value)" class="scenario-option-desc">
            {{ getScenarioDescription(option.value) }}
          </text>
        </view>
      </view>

      <view class="scenario-switch-actions">
        <button
          class="plain-btn scenario-switch-cancel-btn"
          :disabled="scenarioSwitching"
          @tap="closeScenarioSwitchSheet"
        >
          取消
        </button>
        <button
          class="primary-btn scenario-switch-confirm-btn"
          :disabled="!canConfirmScenarioSwitch"
          @tap="confirmScenarioSwitch"
        >
          {{ scenarioSwitching ? '切换中' : '确认切换' }}
        </button>
      </view>
    </view>
  </view>

  <view
    v-if="detailModalVisible"
    class="assessment-detail-mask"
    @tap="closeAssessmentEntryDetail"
  >
    <view class="assessment-detail-panel" @tap.stop>
      <view class="detail-modal-header">
        <text class="detail-modal-title">{{ detailModalTitle }}</text>
        <text class="detail-modal-close" @tap="closeAssessmentEntryDetail">关闭</text>
      </view>
      <scroll-view scroll-y class="detail-modal-body">
        <view v-if="detailModalRangeVisible" class="detail-range-preview">
          <view class="detail-range-summary">
            <text class="detail-range-title">含量刻度</text>
            <text class="detail-range-status entry-status" :class="detailModalRangeStatusClass">
              {{ detailModalRangeStatusLabel }}
            </text>
          </view>
          <view class="detail-range-scale">
            <view
              v-if="detailModalRangeEntry && shouldShowAssessmentCurrentMarker(detailModalRangeEntry)"
              class="detail-range-current"
              :style="detailModalRangeCurrentLabelStyle"
            >
              <text class="detail-range-current-title">当前含量</text>
              <text class="detail-range-current-value">{{ detailModalRangeCurrentLabel }}</text>
            </view>
            <view class="detail-range-track" :style="detailModalRangeStyle">
              <view
                v-if="detailModalRangeEntry && shouldShowAssessmentCurrentMarker(detailModalRangeEntry)"
                class="detail-range-marker"
                :style="detailModalRangeMarkerStyle"
              ></view>
              <view v-if="detailContributionUpdating" class="detail-range-loading">
                <view class="detail-loading-spinner"></view>
                <text>计算中</text>
              </view>
            </view>
          </view>
          <view v-if="detailModalRangeEntry" class="detail-range-bounds">
            <text>{{ getDetailRangeBoundaryLabel('min') }}</text>
            <text>{{ getDetailRangeBoundaryLabel('max') }}</text>
          </view>
        </view>

        <view v-if="detailModalRows.length > 0" class="detail-modal-table">
          <view class="detail-modal-table-head">
            <text class="detail-modal-label">单位</text>
            <text class="detail-modal-value">当前含量</text>
          </view>
          <view
            v-for="row in detailModalRows"
            :key="row.label"
            class="detail-modal-row"
          >
            <text class="detail-modal-label">{{ row.label }}</text>
            <text class="detail-modal-value">{{ row.value }}</text>
          </view>
        </view>

        <view v-if="detailContributionRows.length > 0" class="detail-contribution-section">
          <text class="detail-contribution-title">原料贡献</text>
          <view class="detail-contribution-table">
            <view class="detail-contribution-head">
              <text class="detail-contribution-name">原料</text>
              <text class="detail-contribution-weight">用量</text>
              <text class="detail-contribution-amount">贡献量</text>
              <text class="detail-contribution-percent">贡献度</text>
            </view>
            <view
              v-for="row in detailContributionRows"
              :key="row.itemId"
              class="detail-contribution-row"
            >
              <view class="detail-contribution-name-cell">
                <text class="detail-contribution-item-name">{{ row.itemName }}</text>
                <view class="detail-contribution-bar">
                  <view
                    class="detail-contribution-bar-fill"
                    :style="`width: ${row.barPercent}%`"
                  ></view>
                </view>
              </view>
              <view class="detail-contribution-weight">
                <view class="detail-contribution-weight-editor">
                  <input
                    class="detail-contribution-weight-input"
                    type="digit"
                    :value="getDetailContributionWeightInputValue(row)"
                    :disabled="isDetailContributionWeightUpdating(row)"
                    @input="onDetailContributionWeightInput(row, $event)"
                  />
                  <view
                    v-if="isDetailContributionWeightUpdating(row)"
                    class="detail-contribution-spinner"
                  ></view>
                  <text class="detail-contribution-weight-unit">{{ row.amountUnit }}</text>
                </view>
                <button
                  class="detail-contribution-weight-confirm-btn"
                  :disabled="!canConfirmDetailContributionWeight(row)"
                  @tap.stop="confirmDetailContributionWeight(row)"
                >
                  确认
                </button>
              </view>
              <text class="detail-contribution-amount">{{ row.amountLabel }}</text>
              <text class="detail-contribution-percent">{{ row.percentLabel }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
      <view v-if="detailNutrientSearchTarget" class="detail-modal-footer">
        <button
          class="detail-nutrient-search-btn"
          @tap.stop="openIngredientPickerForDetailNutrient"
        >
          寻找富含该营养素的原料
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { getLifeStageLabel } from '../../utils/label-mapping'
import {
  FEDIAF_DOG_SCENARIO_DESCRIPTIONS,
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type FediafDogScenario,
  type IngredientNutritionProfileOption,
  type IngredientOptionListQuery,
  type IngredientOptionListResponse,
  type RecipeDesignerIngredientOption,
  type SupplementTargetPayload,
} from '../../api/recipe-designer'
import {
  buildAssessmentCategories,
  canDisplayAssessmentRange,
  formatAssessmentRatioValue,
  getAssessmentBoundaryNote,
  getAssessmentBoundaryTitle,
  getAssessmentCategoryAttentionCount,
  getAssessmentCategoryLabel,
  getAssessmentCategoryTitle,
  getAssessmentContributionRows,
  getAssessmentDetailRows,
  getAssessmentDisplayEntry,
  getAssessmentDisplayStatusClass,
  getAssessmentDisplayStatusLabel,
  getAssessmentDryMatterLabel,
  getAssessmentNutrientSearchTarget,
  getAssessmentRangeConflictNote,
  getScenarioLabel,
  shouldShowAssessmentCurrentMarker,
  shouldShowAssessmentDetailTrigger,
  shouldShowAssessmentDryMatterInline,
  type AssessmentCategoryGroup,
  type AssessmentCategoryKey,
  type AssessmentContributionRow,
  type AssessmentDetailRow,
  type AssessmentEntryLike,
  type AssessmentNutrientSearchTarget,
} from './assessment'
import {
  buildHistoryItemAddPayload,
  commitRedoRecipeDesignerHistory,
  commitUndoRecipeDesignerHistory,
  createAddItemHistoryEntry,
  createRecipeDesignerHistoryState,
  createRemoveItemHistoryEntry,
  createReorderItemsHistoryEntry,
  createUpdateItemHistoryEntry,
  getRedoRecipeDesignerHistoryEntry,
  getUndoRecipeDesignerHistoryEntry,
  pushRecipeDesignerHistoryEntry,
  recordHistoryItemIdReplacement,
  resolveHistoryItemId,
  resolveHistoryOrderIds,
  snapshotRecipeDesignerItem,
  type RecipeDesignerHistoryEntry,
  type RecipeDesignerHistoryItemPatch,
  type RecipeDesignerHistoryItemSnapshot,
  type RecipeDesignerHistoryState,
} from './editor-history'
import {
  buildReorderedItems,
  getChangedSortOrderUpdates,
  moveItem,
  type SortOrderUpdate,
} from './reorder'

interface StandardIngredientSnapshot {
  id?: string
  name?: string
  type?: string
  unitDisplayLabel?: string | null
  purchaseUnit?: string | null
  properties?: Record<string, unknown> | null
}

interface DesignerItem {
  id: string
  name?: string
  ingredientId?: string
  ingredientName?: string
  ingredientType?: string
  ingredient?: StandardIngredientSnapshot
  nutritionFoodId?: string
  nutritionFoodName?: string
  nutritionProfileDisplayName?: string
  nutritionFood?: {
    id?: string
    name?: string
    displayNameZh?: string | null
    mappings?: Array<{
      ingredientId?: string | null
      isPrimary?: boolean
      ingredient?: StandardIngredientSnapshot | null
    }>
  }
  weightG?: number
  includeInAssessment?: boolean
  ratioPercent?: number
  preparationMethod?: string
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
  supplementTargets?: SupplementTargetPayload[] | null
  sortOrder?: number
}

interface RemovableSupplementWarning {
  itemId: string
  itemName?: string
  targetLabels?: string[]
  message?: string
}

type HistoryActionDirection = 'undo' | 'redo'

type RecipeDesignerEditorStateSnapshot = {
  items: DesignerItem[]
  assessment: any
  detailModalEntry: AssessmentEntryLike | null
  detailModalRows: AssessmentDetailRow[]
  detailContributionRows: AssessmentContributionRow[]
  detailContributionWeightDrafts: Record<string, string>
  historyState: RecipeDesignerHistoryState
}

interface IngredientOptionSection {
  key: string
  kind: 'all' | 'supplement' | 'food'
  title: string
  options: RecipeDesignerIngredientOption[]
}

const DEFAULT_WINDOW_WIDTH_PX = 375
const ASSESSMENT_COLLAPSED_HEIGHT_RPX = 188
const BOTTOM_PUBLISH_BAR_HEIGHT_RPX = 108
const EDITOR_BOTTOM_GAP_RPX = 24
const scenarioOptions: Array<{ label: string; value: FediafDogScenario }> = [
  { label: FEDIAF_DOG_SCENARIO_LABELS.EARLY_GROWTH_REPRODUCTION, value: 'EARLY_GROWTH_REPRODUCTION' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.LATE_GROWTH, value: 'LATE_GROWTH' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_95, value: 'ADULT_MER_95' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_110, value: 'ADULT_MER_110' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.REPRODUCTION, value: 'REPRODUCTION' },
]

const SUPPLEMENT_TARGET_FIELD_BY_NUTRIENT_KEY: Record<string, string> = {
  calcium: 'minerals.calcium',
  phosphorus: 'minerals.phosphorus',
  potassium: 'minerals.potassium',
  sodium: 'minerals.sodium',
  magnesium: 'minerals.magnesium',
  chloride: 'minerals.chloride',
  iron: 'minerals.iron',
  zinc: 'minerals.zinc',
  copper: 'minerals.copper',
  manganese: 'minerals.manganese',
  selenium: 'minerals.selenium',
  iodine: 'minerals.iodine',
  vitaminA: 'vitamins.vitaminA',
  vitaminD: 'vitamins.vitaminD',
  vitaminE: 'vitamins.vitaminE',
  vitaminK: 'vitamins.vitaminK',
  thiamine: 'vitamins.thiamine',
  riboflavin: 'vitamins.riboflavin',
  niacin: 'vitamins.niacin',
  pantothenicAcid: 'vitamins.pantothenicAcid',
  vitaminB6: 'vitamins.vitaminB6',
  folicAcid: 'vitamins.folicAcid',
  vitaminB12: 'vitamins.vitaminB12',
  choline: 'vitamins.choline',
  biotin: 'vitamins.biotin',
  linoleicAcid: 'fattyAcids.linoleicAcid',
  alphaLinolenicAcid: 'fattyAcids.alphaLinolenicAcid',
  arachidonicAcid: 'fattyAcids.arachidonicAcid',
  epa: 'fattyAcids.epa',
  dha: 'fattyAcids.dha',
  arginine: 'aminoAcids.arginine',
  histidine: 'aminoAcids.histidine',
  isoleucine: 'aminoAcids.isoleucine',
  leucine: 'aminoAcids.leucine',
  lysine: 'aminoAcids.lysine',
  methionine: 'aminoAcids.methionine',
  cystine: 'aminoAcids.cystine',
  phenylalanine: 'aminoAcids.phenylalanine',
  tyrosine: 'aminoAcids.tyrosine',
  threonine: 'aminoAcids.threonine',
  tryptophan: 'aminoAcids.tryptophan',
  valine: 'aminoAcids.valine',
}

function rpxToPx(rpx: number, windowWidth = DEFAULT_WINDOW_WIDTH_PX) {
  return Math.ceil((rpx * windowWidth) / 750)
}

function getSafeAreaBottomPx(systemInfo: any) {
  const explicitInset = Number(systemInfo?.safeAreaInsets?.bottom)
  const screenHeight = Number(systemInfo?.screenHeight || systemInfo?.windowHeight)
  const safeAreaBottom = Number(systemInfo?.safeArea?.bottom)
  const derivedInset =
    Number.isFinite(screenHeight) && Number.isFinite(safeAreaBottom)
      ? screenHeight - safeAreaBottom
      : NaN
  const bottomInsetCandidates = [explicitInset, derivedInset].filter((value) => Number.isFinite(value))

  return Math.max(0, ...bottomInsetCandidates)
}

const draftId = ref('')
const draftName = ref('')
const draftSeriesId = ref('')
const draftSeriesName = ref('')
const draftSeriesLifeStage = ref('')
const customerDogId = ref('')
const customerDogName = ref('')
const scenario = ref<FediafDogScenario>('ADULT_MER_110')
const items = ref<DesignerItem[]>([])
const assessment = ref<any>(null)
const draftIsCompliant = ref(false)
const loading = ref(false)
const autoSaveStatus = ref<'saved' | 'saving' | 'failed'>('saved')
const activeAutoSaveCount = ref(0)
const assessmentExpanded = ref(false)
const assessmentDragging = ref(false)
const assessmentDrawerTopPx = ref(0)
const assessmentDrawerHeightPx = ref(rpxToPx(ASSESSMENT_COLLAPSED_HEIGHT_RPX))
const assessmentCollapsedHeightPx = ref(rpxToPx(ASSESSMENT_COLLAPSED_HEIGHT_RPX))
const assessmentExpandedHeightPx = ref(520)
const assessmentDrawerMinTopPx = ref(0)
const assessmentDrawerMaxTopPx = ref(0)
const assessmentPublishBarHeightPx = ref(rpxToPx(BOTTOM_PUBLISH_BAR_HEIGHT_RPX))
const editorBottomGapPx = ref(rpxToPx(EDITOR_BOTTOM_GAP_RPX))
const selectedAssessmentCategory = ref<AssessmentCategoryKey>('MACRO')
const assessmentScrollTopByCategory = ref<Partial<Record<AssessmentCategoryKey, number>>>({})
const assessmentScrollTop = ref(0)
const assessmentCurrentScrollTop = ref(0)
const detailModalVisible = ref(false)
const detailModalTitle = ref('')
const detailModalEntry = ref<AssessmentEntryLike | null>(null)
const detailModalRows = ref<AssessmentDetailRow[]>([])
const detailContributionRows = ref<AssessmentContributionRow[]>([])
const detailNutrientSearchTarget = ref<AssessmentNutrientSearchTarget | null>(null)
const updatingDetailContributionItemId = ref('')
const detailContributionWeightDrafts = ref<Record<string, string>>({})
const historyState = ref(createRecipeDesignerHistoryState())
const historyActionRunning = ref(false)
const historyActionDirection = ref<HistoryActionDirection | ''>('')
const itemWeightEditBaselines = ref<Record<string, number>>({})
const scenarioSwitchSheetVisible = ref(false)
const scenarioSwitching = ref(false)
const pendingScenario = ref<FediafDogScenario>('ADULT_MER_110')
const ingredientPickerVisible = ref(false)
const ingredientLoading = ref(false)
const addingItem = ref(false)
const redirectingToEditableDraft = ref(false)
const revertingToLatestOfficial = ref(false)
const reorderMode = ref(false)
const draggingItemId = ref('')
const dragTargetIndex = ref(-1)
const dragPersisting = ref(false)
const ingredientNutrientSearchTarget = ref<AssessmentNutrientSearchTarget | null>(null)
const ingredientSearchKeyword = ref('')
const ingredientOptions = ref<RecipeDesignerIngredientOption[]>([])
const supplementIngredientOptions = ref<RecipeDesignerIngredientOption[]>([])
const ingredientTypeHints = ref<Record<string, StandardIngredientSnapshot>>({})
const ingredientLastLoadedSearchKeyword = ref('')
const selectedIngredientOption = ref<RecipeDesignerIngredientOption | null>(null)
const selectedNutritionProfile = ref<IngredientNutritionProfileOption | null>(null)
const newItemWeightInput = ref('')
const currentUserRole = ref('')
const privateSnapshotCreatingTarget = ref<'ORDER' | 'DIY' | ''>('')
const ingredientOptionPage = ref(1)
const ingredientOptionHasMore = ref(false)
const ingredientOptionPageSize = 20
const PENDING_SUPPLEMENT_OPTION_STORAGE_KEY = 'recipeDesignerPendingSupplementOption'
let ingredientSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingIngredientOptionsReset = false
let assessmentDragStartY = 0
let assessmentDragStartTopPx = 0
let dragPreparedIndex = -1
let dragStartY = 0
let dragOriginalOrderIds: string[] = []
let itemRowRects: Array<{ top: number; bottom: number }> = []

const ASSESSMENT_RANGE_COLORS = {
  deficient: '#fed7aa',
  compliant: '#bbf7d0',
  excess: '#fecaca',
  neutral: '#e5e7eb',
} as const

const currentTotalWeightG = computed(() => {
  return items.value
    .filter((item) => isItemIncludedInAssessment(item))
    .reduce((sum, item) => sum + Number(item.weightG || 0), 0)
})

const assessmentListVisible = computed(
  () => assessmentDrawerTopPx.value < assessmentDrawerMaxTopPx.value - 56,
)

const showBottomPublishBar = computed(() => !assessmentListVisible.value)

const autoSaveStatusLabel = computed(() => {
  if (revertingToLatestOfficial.value) return '恢复正式版本中'
  if (redirectingToEditableDraft.value) return '进入可编辑版本中'
  if (loading.value) return '加载中'
  if (autoSaveStatus.value === 'saving') return '保存中'
  if (autoSaveStatus.value === 'failed') return '保存失败'
  return '已保存'
})

const collapsedAssessmentDrawerBottomInsetPx = computed(() => assessmentPublishBarHeightPx.value)

const assessmentDrawerBottomInsetPx = computed(() =>
  showBottomPublishBar.value ? collapsedAssessmentDrawerBottomInsetPx.value : 0,
)

const assessmentDrawerStyle = computed(
  () =>
    `top: ${assessmentDrawerTopPx.value}px; height: ${assessmentDrawerHeightPx.value}px;`,
)

const editorBottomPaddingPx = computed(() => {
  if (reorderMode.value) return Math.ceil(editorBottomGapPx.value)
  const drawerPadding = Math.ceil(assessmentDrawerHeightPx.value)
  const publishPadding = showBottomPublishBar.value ? assessmentPublishBarHeightPx.value : 0
  return Math.ceil(drawerPadding + publishPadding + editorBottomGapPx.value)
})

const editorPageStyle = computed(() => `padding-bottom: ${editorBottomPaddingPx.value}px;`)

const ingredientOptionSections = computed<IngredientOptionSection[]>(() => {
  if (!ingredientNutrientSearchTarget.value) {
    return ingredientOptions.value.length > 0
      ? [{ key: 'all', kind: 'all', title: '', options: ingredientOptions.value }]
      : []
  }

  const sections: IngredientOptionSection[] = []
  if (supplementIngredientOptions.value.length > 0) {
    sections.push({
      key: 'supplements',
      kind: 'supplement',
      title: '推荐补剂',
      options: supplementIngredientOptions.value,
    })
  }
  if (ingredientOptions.value.length > 0) {
    sections.push({
      key: 'foods',
      kind: 'food',
      title: `富含${ingredientNutrientSearchTarget.value.label}的食材`,
      options: ingredientOptions.value,
    })
  }
  return sections
})

const ingredientEmptyText = computed(() => {
  if (ingredientNutrientSearchTarget.value) {
    return `暂无富含${ingredientNutrientSearchTarget.value.label}的可用原料`
  }
  return '暂无可用原料'
})

const canCreateSupplementOption = computed(() => {
  return currentUserRole.value === 'STAFF' || currentUserRole.value === 'ADMIN'
})

const isCustomerMode = computed(() => {
  return currentUserRole.value !== 'STAFF' && currentUserRole.value !== 'ADMIN'
})

const canCreateRevisionDraft = computed(() => !isCustomerMode.value)

const canRevertToLatestOfficial = computed(() => {
  return Boolean(draftSeriesId.value && draftSeriesLifeStage.value && !isCustomerMode.value)
})

const canCreatePrivateSnapshot = computed(() =>
  Boolean(customerDogId.value && currentTotalWeightG.value > 0),
)

const customerNextActions = computed(() =>
  Boolean(isCustomerMode.value && customerDogId.value),
)

const showSupplementLibraryTip = computed(() => {
  return (
    canCreateSupplementOption.value &&
    ingredientSearchKeyword.value.trim().length > 0 &&
    ingredientLastLoadedSearchKeyword.value === ingredientSearchKeyword.value.trim() &&
    ingredientOptionSections.value.length === 0 &&
    !ingredientLoading.value
  )
})

const selectedIngredientUnitLabel = computed(() => {
  return getIngredientOptionUnit(selectedIngredientOption.value)
})

const assessmentEntries = computed(() => {
  return assessment.value?.groupedEntries || assessment.value?.entries || assessment.value?.nutrients || []
})

const removableSupplementWarningByItemId = computed<Record<string, RemovableSupplementWarning>>(() => {
  const warnings = Array.isArray(assessment.value?.removableSupplementWarnings)
    ? assessment.value.removableSupplementWarnings
    : []
  return Object.fromEntries(
    warnings
      .filter((warning: RemovableSupplementWarning) => warning?.itemId)
      .map((warning: RemovableSupplementWarning) => [warning.itemId, warning]),
  )
})

const assessmentCategories = computed(() => buildAssessmentCategories(assessmentEntries.value, assessment.value || {}))

const selectedAssessmentCategoryGroup = computed<AssessmentCategoryGroup>(() => {
  return (
    assessmentCategories.value.find((group) => group.key === selectedAssessmentCategory.value) ||
    assessmentCategories.value[0]
  )
})

const visibleAssessmentEntries = computed(() => selectedAssessmentCategoryGroup.value?.entries || [])

const detailModalRangeEntry = computed(() => {
  if (!detailModalEntry.value) return null
  return getAssessmentDisplayEntry(detailModalEntry.value).basisEntry
})

const detailModalRangeVisible = computed(() => {
  return detailModalRangeEntry.value ? hasAssessmentRange(detailModalRangeEntry.value) : false
})

const detailModalRangeStyle = computed(() => {
  return detailModalRangeEntry.value ? getAssessmentRangeStyle(detailModalRangeEntry.value) : ''
})

const detailModalRangeMarkerStyle = computed(() => {
  return detailModalRangeEntry.value ? getAssessmentCurrentMarkerStyle(detailModalRangeEntry.value) : ''
})

const detailModalRangeCurrentLabel = computed(() => {
  return detailModalRangeEntry.value ? getAssessmentCurrentLabel(detailModalRangeEntry.value) : '-'
})

const detailModalRangeCurrentLabelStyle = computed(() => {
  return detailModalRangeEntry.value ? getAssessmentCurrentLabelStyle(detailModalRangeEntry.value) : ''
})

const detailModalRangeStatusLabel = computed(() => {
  return detailModalRangeEntry.value ? getAssessmentDisplayStatusLabel(detailModalRangeEntry.value) : ''
})

const detailModalRangeStatusClass = computed(() => {
  return detailModalRangeEntry.value ? getAssessmentDisplayStatusClass(detailModalRangeEntry.value) : ''
})

const detailContributionUpdating = computed(() => Boolean(updatingDetailContributionItemId.value))

const historyControlsDisabled = computed(() => {
  return (
    redirectingToEditableDraft.value ||
    revertingToLatestOfficial.value ||
    loading.value ||
    autoSaveStatus.value === 'saving' ||
    historyActionRunning.value
  )
})

const canUndoRecipeDesignerHistory = computed(() => {
  return !historyControlsDisabled.value && Boolean(getUndoRecipeDesignerHistoryEntry(historyState.value))
})

const canRedoRecipeDesignerHistory = computed(() => {
  return !historyControlsDisabled.value && Boolean(getRedoRecipeDesignerHistoryEntry(historyState.value))
})

const canConfirmScenarioSwitch = computed(() => {
  return (
    !redirectingToEditableDraft.value &&
    !revertingToLatestOfficial.value &&
    !scenarioSwitching.value &&
    pendingScenario.value !== scenario.value
  )
})

const assessmentStandardName = computed(() =>
  cleanAssessmentStandardName(
    assessment.value?.standardName || assessment.value?.nutritionStandardName || 'FEDIAF 2025',
  ),
)

const assessmentStandardContextLabel = computed(() => {
  const lifeStage = getScenarioLabel(assessment.value?.scenario || scenario.value)
  return `${assessmentStandardName.value} · ${lifeStage}`
})

const draftSeriesLifeStageLabel = computed(() => {
  if (draftSeriesLifeStage.value) {
    return getLifeStageLabel(draftSeriesLifeStage.value)
  }
  return getScenarioLabel((assessment.value?.scenario || scenario.value) as FediafDogScenario)
})

const recipeSeriesDisplayName = computed(() => {
  const seriesName = draftSeriesName.value.trim()
  if (seriesName) return seriesName
  if (draftSeriesId.value) return '未命名食谱'
  return draftName.value || '未命名食谱'
})

const canConfirmAddIngredient = computed(() => {
  if (redirectingToEditableDraft.value || revertingToLatestOfficial.value) return false
  if (addingItem.value || !selectedIngredientOption.value || !selectedNutritionProfile.value) return false
  const weightG = Number(newItemWeightInput.value)
  return Number.isFinite(weightG) && weightG > 0
})

onLoad((options: any) => {
  syncAssessmentDrawerMetrics()
  updateNavigationTitle()
  currentUserRole.value = getCurrentUserRole()
  draftId.value = options?.id || ''
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  loadDraft()
})

onShow(() => {
  applyPendingSupplementOptionFromStorage()
})

watch(ingredientSearchKeyword, () => {
  if (!ingredientPickerVisible.value) return
  clearIngredientSearchDebounce()
  ingredientSearchDebounceTimer = setTimeout(() => {
    void loadIngredientOptions(true)
  }, 300)
})

watch(
  () => items.value.length,
  (itemCount) => {
    if (itemCount > 1 || !reorderMode.value) return
    reorderMode.value = false
    clearItemDragState()
  },
)

watch(assessmentCategories, (categories) => {
  const activeGroup = categories.find((group) => group.key === selectedAssessmentCategory.value)
  if (activeGroup && activeGroup.entries.length > 0) {
    void nextTick(() => restoreAssessmentScrollPosition(selectedAssessmentCategory.value))
    return
  }

  const fallbackCategory =
    categories.find((group) => getAssessmentCategoryAttentionCount(group) > 0)?.key || 'MACRO'
  selectedAssessmentCategory.value = fallbackCategory
  void nextTick(() => restoreAssessmentScrollPosition(fallbackCategory))
})

watch(autoSaveStatusLabel, () => {
  updateNavigationTitle()
})

onUnmounted(() => {
  clearIngredientSearchDebounce()
})

async function loadDraft() {
  loading.value = true
  try {
    const res: any = await recipeDesignerApi.getDraft(draftId.value)
    const draft = res?.data ?? res
    if (draft) {
      if (await ensureEditableDraftAfterLoad(draft)) {
        return
      }

      await applyDraftDetail(draft)
    }
    void refreshAssessment({ quiet: true })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to load draft:', error)
    uni.showToast({ title: '加载食谱失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function applyDraftDetail(draft: any) {
  draftName.value = String(draft.name || '')
  draftSeriesId.value = String(draft.seriesId || '')
  draftSeriesName.value = String(draft.series?.name || draft.seriesName || '')
  draftSeriesLifeStage.value = String(draft.seriesLifeStage || '')
  customerDogId.value = String(draft.customerDogId || draft.series?.customerDogId || '')
  customerDogName.value = String(draft.customerDogName || draft.series?.dog?.name || draft.dog?.name || (customerDogId.value ? '爱犬' : ''))
  draftIsCompliant.value = Boolean(
    draft.isCompliant ||
    String(draft.assessmentSummary?.overallStatus || '').toUpperCase() === 'COMPLIANT',
  )
  scenario.value = getDraftScenario(draft)
  ingredientTypeHints.value = {}
  items.value = draft.items || []
  assessment.value = null
  applyCachedAssessmentFromDraft(draft)
  await hydrateIngredientTypeHintsForItems(items.value)
}

function applyCachedAssessmentFromDraft(draft: any) {
  const groupedEntries = Array.isArray(draft?.complianceStatus) ? draft.complianceStatus : []
  const nutrients =
    draft?.calculatedNutrition && typeof draft.calculatedNutrition === 'object'
      ? draft.calculatedNutrition
      : {}
  const summary =
    draft?.assessmentSummary && typeof draft.assessmentSummary === 'object'
      ? draft.assessmentSummary
      : {}

  if (groupedEntries.length === 0 && Object.keys(nutrients).length === 0) return

  assessment.value = {
    scenario: getDraftScenario(draft),
    totalWeightG: Number(draft?.totalWeightG || 0),
    energyDensityKcalPerKg: draft?.energyDensityKcalPerKg ?? null,
    nutrients,
    groupedEntries,
    overallStatus: summary.overallStatus || draft?.status || '',
    summary: summary.summary || '',
    rawSummary: summary.rawSummary || '',
  }
}

function isPublishedDraftRecord(draft: { status?: string; publishedRecipeId?: string | null; publishedAt?: string | null }) {
  return draft.status === 'PUBLISHED' || Boolean(draft.publishedRecipeId || draft.publishedAt)
}

async function ensureEditableDraftAfterLoad(draft: any) {
  if (!isPublishedDraftRecord({
    status: String(draft?.status || ''),
    publishedRecipeId: draft?.publishedRecipeId,
    publishedAt: draft?.publishedAt,
  })) {
    return false
  }
  if (!canCreateRevisionDraft.value) {
    uni.showToast({ title: '该食谱草稿不可编辑', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return true
  }
  if (!draftId.value || redirectingToEditableDraft.value) return true

  redirectingToEditableDraft.value = true
  updateNavigationTitle()
  uni.showToast({ title: '正在进入可编辑版本', icon: 'loading', duration: 800 })
  try {
    const res: any = await recipeDesignerApi.createRevisionDraft(draftId.value)
    const revision = res?.data ?? res
    const revisionId = revision?.id
    if (!revisionId) {
      uni.showToast({ title: '进入可编辑版本失败', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return true
    }
    uni.redirectTo({ url: `/pages/recipe-designer/editor?id=${revisionId}` })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to enter editable revision draft:', error)
    uni.showToast({ title: '进入可编辑版本失败', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
  }
  return true
}

function updateNavigationTitle() {
  uni.setNavigationBarTitle({ title: `食谱编辑 · ${autoSaveStatusLabel.value}` })
}

function syncAssessmentDrawerMetrics() {
  const systemInfo = uni.getSystemInfoSync?.()
  const windowHeight = Number(systemInfo?.windowHeight || 667)
  const windowWidth = Number(systemInfo?.windowWidth || systemInfo?.screenWidth || DEFAULT_WINDOW_WIDTH_PX)
  assessmentCollapsedHeightPx.value = rpxToPx(ASSESSMENT_COLLAPSED_HEIGHT_RPX, windowWidth)
  assessmentPublishBarHeightPx.value =
    rpxToPx(BOTTOM_PUBLISH_BAR_HEIGHT_RPX, windowWidth) + getSafeAreaBottomPx(systemInfo)
  editorBottomGapPx.value = rpxToPx(EDITOR_BOTTOM_GAP_RPX, windowWidth)
  assessmentExpandedHeightPx.value = Math.max(360, Math.min(Math.round(windowHeight * 0.72), windowHeight - 72))
  assessmentDrawerMinTopPx.value = Math.max(72, windowHeight - assessmentExpandedHeightPx.value)
  assessmentDrawerMaxTopPx.value = Math.max(
    assessmentDrawerMinTopPx.value,
    windowHeight - assessmentCollapsedHeightPx.value - collapsedAssessmentDrawerBottomInsetPx.value,
  )
  const nextTop =
    assessmentDrawerTopPx.value > 0
      ? clampNumber(assessmentDrawerTopPx.value, assessmentDrawerMinTopPx.value, assessmentDrawerMaxTopPx.value)
      : assessmentExpanded.value
        ? assessmentDrawerMinTopPx.value
        : assessmentDrawerMaxTopPx.value
  setAssessmentDrawerTop(nextTop, windowHeight)
}

function setAssessmentExpanded(expanded: boolean) {
  syncAssessmentDrawerMetrics()
  assessmentExpanded.value = expanded
  setAssessmentDrawerTop(expanded ? assessmentDrawerMinTopPx.value : assessmentDrawerMaxTopPx.value)
}

function collapseAssessmentIfOpen() {
  if (!assessmentListVisible.value) return
  setAssessmentExpanded(false)
}

function onAssessmentTouchStart(event: any) {
  syncAssessmentDrawerMetrics()
  assessmentDragging.value = true
  assessmentDragStartY = Number(event.touches?.[0]?.clientY || 0)
  assessmentDragStartTopPx = assessmentDrawerTopPx.value
}

function onAssessmentTouchMove(event: any) {
  if (!assessmentDragging.value) return
  const currentY = Number(event.touches?.[0]?.clientY || assessmentDragStartY)
  const nextTop = assessmentDragStartTopPx + currentY - assessmentDragStartY
  setAssessmentDrawerTop(clampNumber(nextTop, assessmentDrawerMinTopPx.value, assessmentDrawerMaxTopPx.value))
}

function onAssessmentTouchEnd() {
  if (!assessmentDragging.value) return
  assessmentDragging.value = false
  assessmentExpanded.value = assessmentListVisible.value
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function setAssessmentDrawerTop(topPx: number, windowHeightOverride?: number) {
  const systemInfo = windowHeightOverride ? null : uni.getSystemInfoSync?.()
  const windowHeight = windowHeightOverride ?? Number(systemInfo?.windowHeight || 667)
  assessmentDrawerTopPx.value = clampNumber(
    topPx,
    assessmentDrawerMinTopPx.value,
    assessmentDrawerMaxTopPx.value,
  )
  assessmentDrawerHeightPx.value = Math.max(
    assessmentCollapsedHeightPx.value,
    windowHeight - assessmentDrawerTopPx.value - assessmentDrawerBottomInsetPx.value,
  )
}

async function refreshAssessment(options: { quiet?: boolean } = {}) {
  try {
    const res: any = await recipeDesignerApi.assessDraft(draftId.value)
    const data = res?.data ?? res
    assessment.value = data
    const assessedItems = data?.items || data?.draft?.items
    if (Array.isArray(assessedItems)) {
      items.value = mergeAssessedItems(items.value, assessedItems)
    }
    refreshDetailModalFromAssessment()
    await nextTick()
    restoreAssessmentScrollPosition(selectedAssessmentCategory.value)
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to refresh assessment:', error)
    if (!options.quiet) {
      throw error
    }
  }
}

function onWeightInput(item: DesignerItem, event: any) {
  if (itemWeightEditBaselines.value[item.id] === undefined) {
    itemWeightEditBaselines.value = {
      ...itemWeightEditBaselines.value,
      [item.id]: Number(item.weightG || 0),
    }
  }
  item.weightG = Number(event.detail.value || 0)
}

async function updateWeight(item: DesignerItem) {
  const previousWeightG = itemWeightEditBaselines.value[item.id] ?? Number(item.weightG || 0)
  const weightG = Number(item.weightG || 0)
  if (weightG < 0) {
    uni.showToast({ title: '用量不能小于0', icon: 'none' })
    return
  }
  if (Math.abs(weightG - previousWeightG) < 0.0001) {
    clearItemWeightEditBaseline(item.id)
    return
  }

  beginAutoSave()
  try {
    await recipeDesignerApi.updateItem(item.id, { weightG })
    await refreshAssessment()
    finishAutoSave()
    pushEditorHistory(
      createUpdateItemHistoryEntry({
        itemId: item.id,
        itemName: getItemName(item),
        before: { weightG: previousWeightG },
        after: { weightG },
      }),
    )
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to update item weight:', error)
    item.weightG = previousWeightG
    failAutoSave()
    uni.showToast({ title: '更新用量失败', icon: 'none' })
  } finally {
    clearItemWeightEditBaseline(item.id)
  }
}

function clearItemWeightEditBaseline(itemId: string) {
  const nextBaselines = { ...itemWeightEditBaselines.value }
  delete nextBaselines[itemId]
  itemWeightEditBaselines.value = nextBaselines
}

function isItemIncludedInAssessment(item: DesignerItem) {
  return item.includeInAssessment !== false
}

function getRemovableSupplementWarning(item: DesignerItem): RemovableSupplementWarning | undefined {
  return removableSupplementWarningByItemId.value[item.id]
}

function getRemovableSupplementWarningMessage(item: DesignerItem) {
  const warning = getRemovableSupplementWarning(item)
  if (warning?.message) return warning.message
  const targetLabels = Array.isArray(warning?.targetLabels) && warning.targetLabels.length > 0
    ? warning.targetLabels.join('、')
    : '目标营养素'
  return `移除该补剂后，${targetLabels}仍然满足最低充足性；是否保留由管理员按配方意图决定。`
}

async function toggleItemAssessment(item: DesignerItem, event: any) {
  const nextIncluded = Boolean(event.detail?.value)
  const previousIncluded = isItemIncludedInAssessment(item)
  item.includeInAssessment = nextIncluded

  beginAutoSave()
  try {
    await recipeDesignerApi.updateItem(item.id, { includeInAssessment: nextIncluded })
    await refreshAssessment()
    finishAutoSave()
    if (nextIncluded !== previousIncluded) {
      pushEditorHistory(
        createUpdateItemHistoryEntry({
          itemId: item.id,
          itemName: getItemName(item),
          before: { includeInAssessment: previousIncluded },
          after: { includeInAssessment: nextIncluded },
        }),
      )
    }
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to update item assessment participation:', error)
    item.includeInAssessment = previousIncluded
    failAutoSave()
    uni.showToast({ title: '更新计算开关失败', icon: 'none' })
  }
}

function startItemDrag(item: DesignerItem, index: number, event: any) {
  if (!reorderMode.value || items.value.length < 2 || dragPersisting.value) return
  stopItemDragEvent(event)
  if (draggingItemId.value === item.id) return
  draggingItemId.value = item.id
  dragTargetIndex.value = index
  dragPreparedIndex = index
  dragStartY = getTouchClientY(event) || dragStartY
  dragOriginalOrderIds = items.value.map((candidate) => candidate.id)
  captureItemRowRects()
  pulseItemDragFeedback()
}

function onItemTouchMove(event: any) {
  if (!draggingItemId.value) return
  stopItemDragEvent(event)
  const currentIndex = items.value.findIndex((item) => item.id === draggingItemId.value)
  if (currentIndex < 0) return
  const targetIndex = getDragTargetIndex(getTouchClientY(event), currentIndex)
  if (targetIndex === dragTargetIndex.value) return
  dragTargetIndex.value = targetIndex
  pulseItemDragFeedback()
}

async function finishItemDrag(event?: any) {
  if (!draggingItemId.value) return
  stopItemDragEvent(event)
  const draggedItemId = draggingItemId.value
  const beforeItems = items.value
  const fromIndex = beforeItems.findIndex((item) => item.id === draggedItemId)
  const toIndex = dragTargetIndex.value
  const beforeOrderIds = [...dragOriginalOrderIds]
  const movedItems = fromIndex >= 0 && toIndex >= 0 ? moveItem(beforeItems, fromIndex, toIndex) : beforeItems
  const orderedItems = buildReorderedItems(movedItems, movedItems.map((item) => item.id))
  const orderChanged = beforeOrderIds.some((itemId, index) => orderedItems[index]?.id !== itemId)
  const sortOrderUpdates = getChangedSortOrderUpdates(beforeItems, orderedItems)
  clearItemDragState()
  if (!orderChanged) return
  items.value = orderedItems
  const persisted = await persistItemSortOrder(sortOrderUpdates)
  if (persisted) {
    pushEditorHistory(createReorderItemsHistoryEntry(beforeOrderIds, orderedItems.map((item) => item.id)))
  }
}

function cancelItemDrag(event?: any) {
  void finishItemDrag(event)
}

async function toggleReorderMode() {
  if (dragPersisting.value) return
  if (reorderMode.value) {
    await finishItemDrag()
    reorderMode.value = false
    return
  }
  reorderMode.value = true
}

function lockEditorScrollWhileItemDragging(event: any) {
  if (!draggingItemId.value) return
  stopItemDragEvent(event)
}

function showDragInsertionMarker(index: number) {
  return Boolean(reorderMode.value && draggingItemId.value && dragTargetIndex.value === index)
}

function pulseItemDragFeedback() {
  uni.vibrateShort?.({ type: 'light' })
}

function clearItemDragState() {
  draggingItemId.value = ''
  dragTargetIndex.value = -1
  dragPreparedIndex = -1
  dragOriginalOrderIds = []
  itemRowRects = []
}

async function persistItemSortOrder(sortOrderUpdates: SortOrderUpdate[]) {
  if (sortOrderUpdates.length === 0) return true
  if (dragPersisting.value) return false
  dragPersisting.value = true
  beginAutoSave()
  try {
    await recipeDesignerApi.reorderItems(draftId.value, { items: sortOrderUpdates })
    finishAutoSave()
    return true
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to persist item order:', error)
    failAutoSave()
    uni.showToast({ title: '排序保存失败', icon: 'none' })
    await loadDraft()
    return false
  } finally {
    dragPersisting.value = false
  }
}

function getDragTargetIndex(clientY: number, fallbackIndex: number) {
  if (itemRowRects.length === items.value.length) {
    const foundIndex = itemRowRects.findIndex((rect) => clientY >= rect.top && clientY <= rect.bottom)
    if (foundIndex >= 0) return foundIndex
    const first = itemRowRects[0]
    const last = itemRowRects[itemRowRects.length - 1]
    if (first && clientY < first.top) return 0
    if (last && clientY > last.bottom) return items.value.length - 1
  }

  const approximateRowHeightPx = 72
  const deltaIndex = Math.round((clientY - dragStartY) / approximateRowHeightPx)
  return clampNumber(dragPreparedIndex + deltaIndex, 0, items.value.length - 1)
}

function getTouchClientY(event: any) {
  return Number(event.touches?.[0]?.clientY ?? event.changedTouches?.[0]?.clientY ?? event.detail?.y ?? 0)
}

function stopItemDragEvent(event?: any) {
  event?.stopPropagation?.()
  event?.preventDefault?.()
}

function captureItemRowRects() {
  const query = uni.createSelectorQuery?.()
  if (!query?.selectAll) return
  query
    .selectAll('.item-row')
    .boundingClientRect((rects: any) => {
      itemRowRects = Array.isArray(rects)
        ? rects.map((rect) => ({
            top: Number(rect?.top ?? 0),
            bottom: Number(rect?.bottom ?? 0),
          }))
        : []
    })
    .exec()
}

function getCurrentUserRole() {
  try {
    const rawUserInfo = uni.getStorageSync('userInfo') || uni.getStorageSync('user')
    const userInfo =
      typeof rawUserInfo === 'string'
        ? rawUserInfo
          ? JSON.parse(rawUserInfo)
          : null
        : rawUserInfo
    return String(userInfo?.role || userInfo?.user?.role || '').toUpperCase()
  } catch (error) {
    console.warn('[RecipeDesignerEditor] Failed to read current user role:', error)
    return ''
  }
}

async function openIngredientPicker(target: AssessmentNutrientSearchTarget | null = null) {
  const targetChanged =
    (ingredientNutrientSearchTarget.value?.nutrientKey || '') !== (target?.nutrientKey || '') ||
    (ingredientNutrientSearchTarget.value?.expressionBasis || '') !== (target?.expressionBasis || '')
  ingredientNutrientSearchTarget.value = target
  ingredientPickerVisible.value = true
  selectedIngredientOption.value = null
  selectedNutritionProfile.value = null
  newItemWeightInput.value = ''
  if (targetChanged) {
    ingredientSearchKeyword.value = ''
    ingredientLastLoadedSearchKeyword.value = ''
    ingredientOptions.value = []
    supplementIngredientOptions.value = []
    ingredientOptionPage.value = 1
    ingredientOptionHasMore.value = false
  }
  if (targetChanged || ingredientOptions.value.length === 0) {
    await loadIngredientOptions(true)
  }
}

function closeIngredientPicker() {
  if (addingItem.value) return
  clearIngredientSearchDebounce()
  ingredientPickerVisible.value = false
}

async function searchIngredientOptions() {
  clearIngredientSearchDebounce()
  await loadIngredientOptions(true)
}

async function loadMoreIngredientOptions() {
  if (!ingredientOptionHasMore.value || ingredientLoading.value) return
  await loadIngredientOptions(false)
}

async function loadIngredientOptions(reset: boolean) {
  if (ingredientLoading.value) {
    if (reset) pendingIngredientOptionsReset = true
    return
  }
  ingredientLoading.value = true
  try {
    const nextPage = reset ? 1 : ingredientOptionPage.value + 1
    const res: any = await fetchRecipeDesignerIngredientOptions({
      search: ingredientSearchKeyword.value.trim(),
      ...(ingredientNutrientSearchTarget.value
        ? {
            nutrientKey: ingredientNutrientSearchTarget.value.nutrientKey,
            scenario: scenario.value,
            expressionBasis: ingredientNutrientSearchTarget.value.expressionBasis,
          }
        : {}),
      page: nextPage,
      pageSize: ingredientOptionPageSize,
    })
    const data = (res?.data ?? res) as IngredientOptionListResponse
    const options = Array.isArray(data?.data) ? data.data : []
    options.forEach((option) => setIngredientTypeHint(option))
    if (ingredientNutrientSearchTarget.value) {
      const responseSupplementOptions = Array.isArray(data?.supplementData)
        ? data.supplementData
        : options.filter((option) => isSupplementOption(option))
      const responseFoodOptions = Array.isArray(data?.foodData)
        ? data.foodData
        : options.filter((option) => !isSupplementOption(option))
      responseSupplementOptions.forEach((option) => setIngredientTypeHint(option))
      responseFoodOptions.forEach((option) => setIngredientTypeHint(option))
      if (reset || Array.isArray(data?.supplementData)) {
        supplementIngredientOptions.value = responseSupplementOptions
      }
      ingredientOptions.value = reset
        ? responseFoodOptions
        : [...ingredientOptions.value, ...responseFoodOptions]
    } else {
      if (reset) {
        supplementIngredientOptions.value = []
      }
      ingredientOptions.value = reset ? options : [...ingredientOptions.value, ...options]
    }
    if (reset) {
      ingredientLastLoadedSearchKeyword.value = ingredientSearchKeyword.value.trim()
    }
    ingredientOptionPage.value = data?.page || nextPage
    ingredientOptionHasMore.value = Boolean(data?.hasMore)
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to load ingredient options:', error)
    uni.showToast({ title: '加载原料失败', icon: 'none' })
  } finally {
    ingredientLoading.value = false
    if (pendingIngredientOptionsReset) {
      pendingIngredientOptionsReset = false
      await loadIngredientOptions(true)
    }
  }
}

function fetchRecipeDesignerIngredientOptions(query: IngredientOptionListQuery = {}) {
  return recipeDesignerApi.listIngredientOptions(query)
}

function clearIngredientSearchDebounce() {
  if (!ingredientSearchDebounceTimer) return
  clearTimeout(ingredientSearchDebounceTimer)
  ingredientSearchDebounceTimer = null
}

function selectIngredientOption(option: RecipeDesignerIngredientOption) {
  setIngredientTypeHint(option)
  selectedIngredientOption.value = option
  selectedNutritionProfile.value = getDefaultNutritionProfile(option)
}

function getNutrientTargetContextForAddItem(option: RecipeDesignerIngredientOption) {
  const target = ingredientNutrientSearchTarget.value
  if (!isSupplementOption(option) || !target) {
    return {}
  }

  const supplementTarget: SupplementTargetPayload = {
    fieldPath: resolveSupplementTargetFieldPath(target.nutrientKey),
    nutrientTargetKey: target.nutrientKey,
    label: target.label,
    ...(target.targetValue !== undefined ? { targetValue: target.targetValue } : {}),
    ...(target.expressionBasis ? { expressionBasis: target.expressionBasis } : {}),
  }

  return {
    nutrientTargetKey: target.nutrientKey,
    nutrientTargetValue: target.targetValue,
    supplementTargets: [supplementTarget],
  }
}

function resolveSupplementTargetFieldPath(nutrientKey: string) {
  return SUPPLEMENT_TARGET_FIELD_BY_NUTRIENT_KEY[nutrientKey] || nutrientKey
}

function selectNutritionProfile(profile: IngredientNutritionProfileOption) {
  selectedNutritionProfile.value = profile
}

async function confirmAddIngredient() {
  if (!selectedIngredientOption.value || !selectedNutritionProfile.value) {
    uni.showToast({ title: '请选择原料', icon: 'none' })
    return
  }

  const weightG = Number(newItemWeightInput.value || 0)
  if (!Number.isFinite(weightG) || weightG <= 0) {
    uni.showToast({ title: '请输入大于0的用量', icon: 'none' })
    return
  }

  addingItem.value = true
  beginAutoSave()
  try {
    setIngredientTypeHint(selectedIngredientOption.value)
    const res: any = await recipeDesignerApi.addItem(draftId.value, {
      ingredientId: selectedIngredientOption.value.id,
      nutritionFoodId: selectedNutritionProfile.value.nutritionFoodId,
      weightG,
      ...getNutrientTargetContextForAddItem(selectedIngredientOption.value),
      sortOrder: items.value.length,
    })
    const item = res?.data ?? res
    if (item?.id) {
      items.value = [...items.value, item]
    }
    ingredientPickerVisible.value = false
    selectedIngredientOption.value = null
    selectedNutritionProfile.value = null
    await refreshAssessment()
    finishAutoSave()
    if (item?.id) {
      pushEditorHistory(createAddItemHistoryEntry(snapshotRecipeDesignerItem(item)))
    }
    uni.showToast({ title: '已加入食谱', icon: 'success' })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to add ingredient:', error)
    failAutoSave()
    uni.showToast({ title: '添加原料失败', icon: 'none' })
  } finally {
    addingItem.value = false
  }
}

function removeIngredient(item: DesignerItem) {
  const itemSnapshot = snapshotRecipeDesignerItem(item)
  uni.showModal({
    title: '删除原料',
    content: `确认从食谱中删除「${getItemName(item)}」吗？`,
    confirmText: '删除',
    confirmColor: '#cf1322',
    success: async (result: any) => {
      if (!result.confirm) return
      beginAutoSave()
      try {
        await recipeDesignerApi.removeItem(item.id)
        items.value = items.value.filter((candidate) => candidate.id !== item.id)
        await refreshAssessment()
        finishAutoSave()
        pushEditorHistory(createRemoveItemHistoryEntry(itemSnapshot))
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerEditor] Failed to remove item:', error)
        failAutoSave()
        uni.showToast({ title: '删除失败', icon: 'none' })
      }
    },
  })
}

function goToSupplementLibrary() {
  const query = draftId.value
    ? `?returnTo=editor&draftId=${encodeURIComponent(draftId.value)}`
    : ''
  uni.navigateTo({ url: `/pages/recipe-designer/supplement-library${query}` })
}

function readWarningCount(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.trunc(numericValue) : 0
}

function countAssessmentEntriesByStatus(status: string) {
  return assessmentEntries.value.filter((entry: AssessmentEntryLike) => {
    return !entry.excludeFromAttention && String(entry.status || '').toUpperCase() === status
  }).length
}

function getDraftNutritionWarningMessage() {
  const status = String(
    assessment.value?.overallStatus ||
    assessment.value?.summary?.overallStatus ||
    assessment.value?.status ||
    '',
  ).toUpperCase()
  const summary = assessment.value?.summary || {}
  const missingData = Math.max(
    readWarningCount(summary.missingData),
    countAssessmentEntriesByStatus('MISSING_DATA'),
  )
  const deficient = Math.max(
    readWarningCount(summary.deficient),
    countAssessmentEntriesByStatus('DEFICIENT'),
  )
  const excess = Math.max(
    readWarningCount(summary.excess),
    countAssessmentEntriesByStatus('EXCESS'),
  )

  if ((status === 'COMPLIANT' || (!status && draftIsCompliant.value)) && missingData === 0 && deficient === 0 && excess === 0) {
    return ''
  }

  const parts: string[] = []
  if (missingData > 0) parts.push(`${missingData}项缺少营养数据`)
  if (deficient > 0) parts.push(`${deficient}项营养不足`)
  if (excess > 0) parts.push(`${excess}项营养超标`)
  if (parts.length === 0) parts.push('部分营养项未达标或需复核')
  return `当前食谱有营养提醒：${parts.join('、')}。可以继续生成制作单或订购，建议后续再优化配方。`
}

function confirmRecipeNutritionWarning(message: string) {
  if (!message) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '营养提醒',
      content: message,
      confirmText: '继续',
      cancelText: '返回调整',
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    })
  })
}

async function goToPrivateRecipeTarget(target: 'ORDER' | 'DIY') {
  if (!draftId.value || privateSnapshotCreatingTarget.value) return
  if (!canCreatePrivateSnapshot.value) {
    uni.showToast({ title: '请先添加食材并确认用量', icon: 'none' })
    return
  }
  if (!(await confirmRecipeNutritionWarning(getDraftNutritionWarningMessage()))) {
    return
  }

  privateSnapshotCreatingTarget.value = target
  try {
    const snapshotPayload =
      target === 'DIY'
        ? { target: 'DIY' as const }
        : { target: 'ORDER' as const }
    const res: any = await recipeDesignerApi.createPrivateRecipeSnapshot(draftId.value, snapshotPayload)
    const data = res?.data ?? res
    const fallbackDogId = data?.dogId || customerDogId.value
    const url = data?.targetUrl || (
      target === 'DIY'
        ? `/pages/recipe-diy/index?recipeId=${data?.recipeId}&dogId=${fallbackDogId}`
        : `/pages/recipe-order/index?recipeId=${data?.recipeId}&dogId=${fallbackDogId}`
    )
    if (!data?.recipeId && !data?.targetUrl) {
      uni.showToast({ title: '暂时无法进入下一步', icon: 'none' })
      return
    }
    uni.navigateTo({ url })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to create private recipe snapshot:', error)
    uni.showToast({ title: '暂时无法进入下一步', icon: 'none' })
  } finally {
    privateSnapshotCreatingTarget.value = ''
  }
}

function applyPendingSupplementOptionFromStorage() {
  const raw = uni.getStorageSync(PENDING_SUPPLEMENT_OPTION_STORAGE_KEY)
  if (!raw) return

  let payload: any = raw
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    } catch (error) {
      uni.removeStorageSync(PENDING_SUPPLEMENT_OPTION_STORAGE_KEY)
      return
    }
  }

  const option = payload?.option as RecipeDesignerIngredientOption | undefined
  if (!option?.id) {
    uni.removeStorageSync(PENDING_SUPPLEMENT_OPTION_STORAGE_KEY)
    return
  }

  const pendingDraftId = String(payload?.draftId || '')
  if (pendingDraftId && draftId.value && pendingDraftId !== draftId.value) return

  uni.removeStorageSync(PENDING_SUPPLEMENT_OPTION_STORAGE_KEY)
  ingredientPickerVisible.value = true
  ingredientOptions.value = [
    option,
    ...ingredientOptions.value.filter((candidate) => candidate.id !== option.id),
  ]
  selectIngredientOption(option)
  newItemWeightInput.value = ''
}

function normalizeAssessmentScrollTop(value: unknown) {
  const scrollTop = Number(value)
  return Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0
}

function getAssessmentScrollTop(category: AssessmentCategoryKey) {
  return normalizeAssessmentScrollTop(assessmentScrollTopByCategory.value[category])
}

function rememberAssessmentScrollPosition(category: AssessmentCategoryKey = selectedAssessmentCategory.value) {
  assessmentScrollTopByCategory.value = {
    ...assessmentScrollTopByCategory.value,
    [category]: normalizeAssessmentScrollTop(assessmentCurrentScrollTop.value),
  }
}

function restoreAssessmentScrollPosition(category: AssessmentCategoryKey = selectedAssessmentCategory.value) {
  const scrollTop = getAssessmentScrollTop(category)
  assessmentCurrentScrollTop.value = scrollTop
  assessmentScrollTop.value = scrollTop
}

function onAssessmentListScroll(event: any) {
  const scrollTop = normalizeAssessmentScrollTop(event.detail?.scrollTop)
  assessmentCurrentScrollTop.value = scrollTop
  assessmentScrollTopByCategory.value = {
    ...assessmentScrollTopByCategory.value,
    [selectedAssessmentCategory.value]: scrollTop,
  }
}

function selectAssessmentCategory(key: AssessmentCategoryKey, expandDrawer = false) {
  rememberAssessmentScrollPosition()
  selectedAssessmentCategory.value = key
  if (expandDrawer && !assessmentListVisible.value) {
    setAssessmentExpanded(true)
  }
  void nextTick(() => restoreAssessmentScrollPosition(key))
}

function getAssessmentEntryName(entry: AssessmentEntryLike) {
  return entry.label || entry.name || entry.nutrientName || entry.key || entry.nutrientKey || '未命名营养素'
}

function formatAssessmentBasisLabel(entry: AssessmentEntryLike) {
  if (entry.displayBasisLabel) return entry.displayBasisLabel
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const basis = basisEntry.expressionBasis || entry.expressionBasis || ''
  if (basis === 'PER_1000_KCAL_ME') return '/1000kcal ME'
  if (basis === 'PER_MJ_ME') return '每MJ ME'
  if (basis === 'PER_100G_DRY_MATTER') return '每100g干物质'
  if (basis === 'RATIO') return '比例'
  return formatExpressionBasis(basis)
}

function formatDryMatterPercent(entry: AssessmentEntryLike) {
  return getAssessmentDryMatterLabel(entry).replace(/^干物质\s*/, '') || '-'
}

function formatDryMatterLabel(entry: AssessmentEntryLike) {
  return getAssessmentDryMatterLabel(entry)
}

function shouldShowDryMatter(entry: AssessmentEntryLike) {
  return shouldShowAssessmentDryMatterInline(entry)
}

function isMacroOverviewEntry(entry: AssessmentEntryLike) {
  return Boolean(entry.isSupplementalMacro)
}

function formatMacroOverviewBasisLabel(entry: AssessmentEntryLike) {
  if (entry.nutrientKey === 'energy_density') return ''
  return formatAssessmentBasisLabel(entry)
}

function formatMacroOverviewPrimaryValue(entry: AssessmentEntryLike) {
  const value = getAssessmentCurrentValue(entry)
  return `${formatAssessmentNumber(value ?? 0)}${entry.unit || ''}`
}

function formatMacroOverviewDryMatterLabel(entry: AssessmentEntryLike) {
  if (!shouldShowDryMatter(entry)) return ''
  const value = getAssessmentDisplayEntry(entry).dryMatterValue
  return value === null || value === undefined ? '' : `干物质 ${formatAssessmentNumber(value)}%`
}

function hasAssessmentRange(entry: AssessmentEntryLike) {
  return canDisplayAssessmentRange(entry)
}

function getAssessmentBoundaryLabel(entry: AssessmentEntryLike, boundary: 'min' | 'max') {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const value = boundary === 'min' ? getAssessmentMinValue(basisEntry) : getAssessmentMaxValue(basisEntry)
  if (value === null) return ''
  return formatAssessmentValue(basisEntry, value)
}

function getAssessmentBoundaryStyle(entry: AssessmentEntryLike, boundary: 'min' | 'max') {
  return `left: ${getAssessmentBoundaryPosition(entry, boundary)}%;`
}

function getAssessmentCurrentLabel(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const value = getAssessmentCurrentValue(entry)
  return value === null ? '-' : formatAssessmentValue(basisEntry, value)
}

function getAssessmentCurrentMarkerStyle(entry: AssessmentEntryLike) {
  return `left: ${getAssessmentCurrentPosition(entry)}%;`
}

function getAssessmentCurrentLabelStyle(entry: AssessmentEntryLike) {
  const position = getAssessmentCurrentPosition(entry)

  if (position < 14) {
    return `left: ${position}%; transform: translateX(0); text-align: left;`
  }

  if (position > 86) {
    return `left: ${position}%; transform: translateX(-100%); text-align: right;`
  }

  return `left: ${position}%; transform: translateX(-50%); text-align: center;`
}

function showAssessmentBoundaryNote(entry: AssessmentEntryLike, boundary: 'min' | 'max') {
  const note = getAssessmentBoundaryNote(entry, boundary)
  if (!note) return
  const boundaryLabel = getAssessmentBoundaryTitle(entry, boundary)
  uni.showModal({
    title: `${getAssessmentEntryName(entry)}${boundaryLabel}说明`,
    content: note,
    showCancel: false,
    confirmText: '知道了',
  })
}

function showAssessmentEntryDetail(entry: AssessmentEntryLike) {
  if (updateAssessmentEntryDetail(entry)) {
    detailModalVisible.value = true
  }
}

function updateAssessmentEntryDetail(entry: AssessmentEntryLike) {
  const rows = getAssessmentDetailRows(entry)
  const contributionRows = getAssessmentContributionRows(entry)
  if (rows.length === 0 && contributionRows.length === 0) return false
  detailModalTitle.value = getAssessmentEntryName(entry)
  detailModalEntry.value = entry
  detailModalRows.value = rows
  detailContributionRows.value = contributionRows
  detailNutrientSearchTarget.value = getAssessmentNutrientSearchTarget(entry)
  return true
}

function refreshDetailModalFromAssessment() {
  if (!detailModalVisible.value || !detailModalEntry.value) return
  const nextEntry = findDetailAssessmentEntry()
  if (!nextEntry) return
  updateAssessmentEntryDetail(nextEntry)
}

function findDetailAssessmentEntry() {
  const currentEntry = detailModalEntry.value
  if (!currentEntry) return null
  const currentKey = currentEntry.nutrientKey || currentEntry.key
  if (!currentKey) return null
  const currentBasis = getAssessmentDisplayEntry(currentEntry).basisEntry.expressionBasis || currentEntry.expressionBasis

  return assessmentEntries.value.find((entry: AssessmentEntryLike) => {
    const entryKey = entry.nutrientKey || entry.key
    const entryBasis = getAssessmentDisplayEntry(entry).basisEntry.expressionBasis || entry.expressionBasis
    return entryKey === currentKey && (!currentBasis || entryBasis === currentBasis)
  }) || null
}

function getDetailRangeBoundaryLabel(boundary: 'min' | 'max') {
  if (!detailModalRangeEntry.value) return ''
  const label = getAssessmentBoundaryLabel(detailModalRangeEntry.value, boundary)
  if (!label) return ''
  return `${getAssessmentBoundaryTitle(detailModalRangeEntry.value, boundary)} ${label}`
}

function formatDetailContributionWeight(row: AssessmentContributionRow) {
  return row.weightValue === null ? '' : String(row.weightValue)
}

function getDetailContributionWeightInputValue(row: AssessmentContributionRow) {
  return detailContributionWeightDrafts.value[row.itemId] ?? formatDetailContributionWeight(row)
}

function hasDetailContributionWeightDraft(row: AssessmentContributionRow) {
  return detailContributionWeightDrafts.value[row.itemId] !== undefined
}

function isDetailContributionWeightUpdating(row: AssessmentContributionRow) {
  return updatingDetailContributionItemId.value === row.itemId
}

function canConfirmDetailContributionWeight(row: AssessmentContributionRow) {
  return hasDetailContributionWeightDraft(row) && !isDetailContributionWeightUpdating(row)
}

function onDetailContributionWeightInput(row: AssessmentContributionRow, event: any) {
  const rawValue = String(event.detail?.value ?? '')
  detailContributionWeightDrafts.value = {
    ...detailContributionWeightDrafts.value,
    [row.itemId]: rawValue,
  }
}

async function confirmDetailContributionWeight(row: AssessmentContributionRow) {
  if (!hasDetailContributionWeightDraft(row)) return
  await commitDetailContributionWeight(row, detailContributionWeightDrafts.value[row.itemId])
}

async function commitDetailContributionWeight(row: AssessmentContributionRow, rawValue: string) {
  if (!rawValue.trim()) {
    uni.showToast({ title: '请输入用量', icon: 'none' })
    return
  }
  const weightG = Number(rawValue)
  if (!Number.isFinite(weightG) || weightG < 0) {
    uni.showToast({ title: '用量不能小于0', icon: 'none' })
    return
  }
  if (row.weightValue !== null && Math.abs(weightG - row.weightValue) < 0.0001) {
    clearDetailContributionWeightDraft(row.itemId)
    return
  }
  await updateDetailContributionItemWeight(row.itemId, weightG, row.weightValue ?? undefined)
}

function clearDetailContributionWeightDraft(itemId: string) {
  const nextDrafts = { ...detailContributionWeightDrafts.value }
  delete nextDrafts[itemId]
  detailContributionWeightDrafts.value = nextDrafts
}

function clearDetailContributionWeightDrafts() {
  detailContributionWeightDrafts.value = {}
}

async function updateDetailContributionItemWeight(itemId: string, weightG: number, previousWeightG?: number) {
  if (updatingDetailContributionItemId.value) return
  const item = items.value.find((candidate) => candidate.id === itemId)
  const beforeWeightG = previousWeightG ?? Number(item?.weightG || 0)
  updatingDetailContributionItemId.value = itemId
  beginAutoSave()
  try {
    await recipeDesignerApi.updateItem(itemId, { weightG })
    items.value = items.value.map((item) => (item.id === itemId ? { ...item, weightG } : item))
    await refreshAssessment()
    finishAutoSave()
    if (Math.abs(weightG - beforeWeightG) >= 0.0001) {
      pushEditorHistory(
        createUpdateItemHistoryEntry({
          itemId,
          itemName: item ? getItemName(item) : '原料',
          before: { weightG: beforeWeightG },
          after: { weightG },
        }),
      )
    }
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to update contribution weight:', error)
    failAutoSave()
    uni.showToast({ title: '更新用量失败', icon: 'none' })
  } finally {
    updatingDetailContributionItemId.value = ''
    clearDetailContributionWeightDraft(itemId)
  }
}

function beginAutoSave() {
  activeAutoSaveCount.value += 1
  autoSaveStatus.value = 'saving'
}

function finishAutoSave() {
  activeAutoSaveCount.value = Math.max(0, activeAutoSaveCount.value - 1)
  if (activeAutoSaveCount.value === 0) {
    autoSaveStatus.value = 'saved'
  }
}

function failAutoSave() {
  activeAutoSaveCount.value = 0
  autoSaveStatus.value = 'failed'
}

function pushEditorHistory(entry: RecipeDesignerHistoryEntry) {
  historyState.value = pushRecipeDesignerHistoryEntry(historyState.value, entry)
}

async function undoRecipeDesignerHistory() {
  const entry = getUndoRecipeDesignerHistoryEntry(historyState.value)
  if (!entry || historyControlsDisabled.value) return

  const succeeded = await executeHistoryEntry(entry, 'undo')
  if (!succeeded) return
  historyState.value = commitUndoRecipeDesignerHistory(historyState.value, entry)
}

async function redoRecipeDesignerHistory() {
  const entry = getRedoRecipeDesignerHistoryEntry(historyState.value)
  if (!entry || historyControlsDisabled.value) return

  const succeeded = await executeHistoryEntry(entry, 'redo')
  if (!succeeded) return
  historyState.value = commitRedoRecipeDesignerHistory(historyState.value, entry)
}

async function executeHistoryEntry(entry: RecipeDesignerHistoryEntry, direction: HistoryActionDirection) {
  if (historyActionRunning.value) return false
  historyActionRunning.value = true
  historyActionDirection.value = direction
  const snapshot = snapshotRecipeDesignerEditorState()
  try {
    applyHistoryEntryOptimistically(entry, direction)
    beginAutoSave()
    if (entry.kind === 'update-item') {
      await applyHistoryItemPatch(entry.itemId, direction === 'undo' ? entry.before : entry.after)
    } else if (entry.kind === 'add-item') {
      if (direction === 'undo') {
        await removeHistoryItem(entry.item.id)
      } else {
        await restoreHistoryItem(entry.item)
      }
    } else if (entry.kind === 'remove-item') {
      if (direction === 'undo') {
        await restoreHistoryItem(entry.item)
      } else {
        await removeHistoryItem(entry.item.id)
      }
    } else if (entry.kind === 'reorder-items') {
      await applyHistoryOrder(direction === 'undo' ? entry.beforeOrderIds : entry.afterOrderIds)
    }
    finishAutoSave()
    return true
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to apply edit history:', error)
    restoreRecipeDesignerEditorState(snapshot)
    failAutoSave()
    uni.showToast({ title: direction === 'undo' ? '撤回失败' : '前进失败', icon: 'none' })
    return false
  } finally {
    historyActionRunning.value = false
    historyActionDirection.value = ''
  }
}

function snapshotRecipeDesignerEditorState(): RecipeDesignerEditorStateSnapshot {
  return {
    items: cloneDesignerItems(items.value),
    assessment: assessment.value,
    detailModalEntry: detailModalEntry.value,
    detailModalRows: detailModalRows.value.map((row) => ({ ...row })),
    detailContributionRows: detailContributionRows.value.map((row) => ({ ...row })),
    detailContributionWeightDrafts: { ...detailContributionWeightDrafts.value },
    historyState: {
      undoStack: [...historyState.value.undoStack],
      redoStack: [...historyState.value.redoStack],
      itemIdMap: { ...historyState.value.itemIdMap },
    },
  }
}

function restoreRecipeDesignerEditorState(snapshot: RecipeDesignerEditorStateSnapshot) {
  items.value = cloneDesignerItems(snapshot.items)
  assessment.value = snapshot.assessment
  detailModalEntry.value = snapshot.detailModalEntry
  detailModalRows.value = snapshot.detailModalRows.map((row) => ({ ...row }))
  detailContributionRows.value = snapshot.detailContributionRows.map((row) => ({ ...row }))
  detailContributionWeightDrafts.value = { ...snapshot.detailContributionWeightDrafts }
  historyState.value = snapshot.historyState
}

function applyHistoryEntryOptimistically(
  entry: RecipeDesignerHistoryEntry,
  direction: HistoryActionDirection,
) {
  if (entry.kind === 'update-item') {
    applyOptimisticHistoryItemPatch(entry.itemId, direction === 'undo' ? entry.before : entry.after)
  } else if (entry.kind === 'add-item') {
    if (direction === 'undo') {
      removeOptimisticHistoryItem(entry.item.id)
    } else {
      insertOptimisticHistoryItem(entry.item)
    }
  } else if (entry.kind === 'remove-item') {
    if (direction === 'undo') {
      insertOptimisticHistoryItem(entry.item)
    } else {
      removeOptimisticHistoryItem(entry.item.id)
    }
  } else if (entry.kind === 'reorder-items') {
    applyOptimisticHistoryOrder(direction === 'undo' ? entry.beforeOrderIds : entry.afterOrderIds)
  }
}

function applyOptimisticHistoryItemPatch(itemId: string, patch: RecipeDesignerHistoryItemPatch) {
  const resolvedItemId = resolveHistoryItemId(historyState.value, itemId)
  items.value = items.value.map((item) =>
    item.id === resolvedItemId
      ? {
          ...item,
          ...patch,
        }
      : item,
  )

  if (patch.weightG !== undefined) {
    const weightG = Number(patch.weightG || 0)
    detailContributionRows.value = detailContributionRows.value.map((row) =>
      row.itemId === resolvedItemId
        ? {
            ...row,
            weightValue: weightG,
            weightLabel: `${formatAssessmentNumber(weightG)}${row.amountUnit || 'g'}`,
          }
        : row,
    )
    clearDetailContributionWeightDraft(resolvedItemId)
  }
}

function insertOptimisticHistoryItem(itemSnapshot: RecipeDesignerHistoryItemSnapshot) {
  const optimisticItem = buildOptimisticDesignerItem(itemSnapshot)
  items.value = sortItemsBySortOrder([
    ...items.value.filter((item) => item.id !== optimisticItem.id),
    optimisticItem,
  ])
}

function removeOptimisticHistoryItem(itemId: string) {
  const resolvedItemId = resolveHistoryItemId(historyState.value, itemId)
  items.value = items.value.filter((item) => item.id !== resolvedItemId)
}

function applyOptimisticHistoryOrder(orderIds: string[]) {
  const resolvedOrderIds = resolveHistoryOrderIds(historyState.value, orderIds)
  const itemById = new Map(items.value.map((item) => [item.id, item]))
  const orderedItems = resolvedOrderIds
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is DesignerItem => Boolean(item))
  const orderedIdSet = new Set(orderedItems.map((item) => item.id))
  const remainingItems = items.value.filter((item) => !orderedIdSet.has(item.id))
  items.value = [...orderedItems, ...remainingItems].map((item, index) => ({ ...item, sortOrder: index }))
}

function buildOptimisticDesignerItem(itemSnapshot: RecipeDesignerHistoryItemSnapshot): DesignerItem {
  const itemName = itemSnapshot.name || itemSnapshot.ingredientName || '原料'
  return {
    id: itemSnapshot.id,
    name: itemName,
    ingredientId: itemSnapshot.ingredientId,
    ingredientName: itemSnapshot.ingredientName || itemName,
    nutritionFoodId: itemSnapshot.nutritionFoodId,
    nutritionFoodName: itemName,
    weightG: itemSnapshot.weightG,
    includeInAssessment: itemSnapshot.includeInAssessment !== false,
    preparationMethod: itemSnapshot.preparationMethod ?? undefined,
    nutrientTargetKey: itemSnapshot.nutrientTargetKey ?? null,
    nutrientTargetValue: itemSnapshot.nutrientTargetValue ?? null,
    supplementTargets: itemSnapshot.supplementTargets
      ? itemSnapshot.supplementTargets.map((target) => ({ ...target }))
      : null,
    sortOrder: itemSnapshot.sortOrder,
  }
}

function cloneDesignerItems(list: DesignerItem[]) {
  return list.map((item) => ({
    ...item,
    ingredient: item.ingredient ? { ...item.ingredient } : undefined,
    nutritionFood: item.nutritionFood ? { ...item.nutritionFood } : undefined,
    supplementTargets: item.supplementTargets
      ? item.supplementTargets.map((target) => ({ ...target }))
      : item.supplementTargets,
  }))
}

async function applyHistoryItemPatch(itemId: string, patch: RecipeDesignerHistoryItemPatch) {
  const resolvedItemId = resolveHistoryItemId(historyState.value, itemId)
  const res: any = await recipeDesignerApi.updateItem(resolvedItemId, patch)
  const updatedItem = res?.data ?? res
  items.value = items.value.map((item) =>
    item.id === resolvedItemId
      ? {
          ...item,
          ...patch,
          ...(updatedItem?.id ? updatedItem : {}),
        }
      : item,
  )
  await refreshAssessment()
}

async function restoreHistoryItem(itemSnapshot: ReturnType<typeof snapshotRecipeDesignerItem>) {
  const payload = buildHistoryItemAddPayload(itemSnapshot)
  const res: any = await recipeDesignerApi.addItem(draftId.value, payload)
  const restoredItem = res?.data ?? res
  if (restoredItem?.id) {
    historyState.value = recordHistoryItemIdReplacement(historyState.value, itemSnapshot.id, restoredItem.id)
    items.value = sortItemsBySortOrder([
      ...items.value.filter((item) => item.id !== restoredItem.id && item.id !== itemSnapshot.id),
      restoredItem,
    ])
  }
  await refreshAssessment()
}

async function removeHistoryItem(itemId: string) {
  const resolvedItemId = resolveHistoryItemId(historyState.value, itemId)
  await recipeDesignerApi.removeItem(resolvedItemId)
  items.value = items.value.filter((item) => item.id !== resolvedItemId)
  await refreshAssessment()
}

async function applyHistoryOrder(orderIds: string[]) {
  const resolvedOrderIds = resolveHistoryOrderIds(historyState.value, orderIds)
  const nextItems = buildReorderedItems(items.value, resolvedOrderIds)
  const sortOrderUpdates = getChangedSortOrderUpdates(items.value, nextItems)
  items.value = nextItems
  if (sortOrderUpdates.length > 0) {
    await recipeDesignerApi.reorderItems(draftId.value, { items: sortOrderUpdates })
  }
}

function sortItemsBySortOrder(list: DesignerItem[]) {
  return [...list].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
}

function openScenarioSwitchSheet() {
  pendingScenario.value = scenario.value
  scenarioSwitchSheetVisible.value = true
}

function closeScenarioSwitchSheet() {
  if (scenarioSwitching.value) return
  scenarioSwitchSheetVisible.value = false
}

function selectScenarioOption(value: FediafDogScenario) {
  if (scenarioSwitching.value) return
  pendingScenario.value = value
}

function getScenarioDescription(value: FediafDogScenario) {
  return FEDIAF_DOG_SCENARIO_DESCRIPTIONS[value] || ''
}

async function confirmScenarioSwitch() {
  if (pendingScenario.value === scenario.value) {
    scenarioSwitchSheetVisible.value = false
    return
  }

  const previousScenario = scenario.value
  let scenarioPersisted = false
  rememberAssessmentScrollPosition()
  scenarioSwitching.value = true
  beginAutoSave()
  try {
    await recipeDesignerApi.updateDraft(draftId.value, { scenario: pendingScenario.value })
    scenarioPersisted = true
    scenario.value = pendingScenario.value
    await refreshAssessment()
    finishAutoSave()
    scenarioSwitchSheetVisible.value = false
    uni.showToast({ title: '已切换生命阶段', icon: 'success' })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to switch scenario:', error)
    if (!scenarioPersisted) {
      scenario.value = previousScenario
    }
    failAutoSave()
    uni.showToast({ title: '切换生命阶段失败', icon: 'none' })
  } finally {
    scenarioSwitching.value = false
  }
}

function goToNutritionReport() {
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  if (revertingToLatestOfficial.value) {
    uni.showToast({ title: '正在恢复正式版本', icon: 'none' })
    return
  }
  if (autoSaveStatus.value === 'saving') {
    uni.showToast({ title: '正在保存最新修改', icon: 'none' })
    return
  }
  if (autoSaveStatus.value === 'failed') {
    uni.showModal({
      title: '自动保存失败',
      content: '最新修改可能还未保存，继续查看会展示上一次成功保存的营养报告。',
      confirmText: '继续查看',
      cancelText: '留在编辑',
      success: (result: any) => {
        if (result.confirm) navigateToNutritionReport()
      },
    })
    return
  }
  navigateToNutritionReport()
}

function confirmRevertToLatestOfficial() {
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  if (revertingToLatestOfficial.value) return
  if (autoSaveStatus.value === 'saving') {
    uni.showToast({ title: '正在保存最新修改', icon: 'none' })
    return
  }

  uni.showModal({
    title: '恢复正式版',
    content: '将撤回当前生命阶段的所有未发布修改，恢复到最新正式版本。',
    confirmText: '恢复',
    cancelText: '取消',
    success: (result: any) => {
      if (result.confirm) {
        void revertToLatestOfficial()
      }
    },
  })
}

async function revertToLatestOfficial() {
  if (!draftId.value || revertingToLatestOfficial.value) return

  revertingToLatestOfficial.value = true
  updateNavigationTitle()
  try {
    const res: any = await recipeDesignerApi.revertDraftToLatestOfficial(draftId.value)
    const revertedDraft = res?.data ?? res
    historyState.value = createRecipeDesignerHistoryState()
    itemWeightEditBaselines.value = {}
    closeAssessmentEntryDetail()
    reorderMode.value = false
    clearItemDragState()
    if (revertedDraft) {
      await applyDraftDetail(revertedDraft)
    } else {
      await loadDraft()
    }
    autoSaveStatus.value = 'saved'
    await refreshAssessment({ quiet: true })
    uni.showToast({ title: '已恢复正式版', icon: 'success' })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to revert to latest official:', error)
    uni.showToast({ title: '恢复正式版失败', icon: 'none' })
  } finally {
    revertingToLatestOfficial.value = false
    updateNavigationTitle()
  }
}

function navigateToNutritionReport() {
  const url = `/pages/recipe-designer/publish?id=${encodeURIComponent(draftId.value)}&name=${encodeURIComponent(recipeSeriesDisplayName.value)}`
  uni.navigateTo({ url })
}

function openIngredientPickerForDetailNutrient() {
  const target = detailNutrientSearchTarget.value
  if (!target) return
  closeAssessmentEntryDetail()
  void openIngredientPicker(target)
}

function closeAssessmentEntryDetail() {
  detailModalVisible.value = false
  detailModalTitle.value = ''
  detailModalEntry.value = null
  detailModalRows.value = []
  detailContributionRows.value = []
  detailNutrientSearchTarget.value = null
  clearDetailContributionWeightDrafts()
}

function getAssessmentRangeStyle(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const minValue = getAssessmentMinValue(basisEntry)
  const maxValue = getAssessmentMaxValue(basisEntry)
  const minPosition = getAssessmentBoundaryPosition(entry, 'min')
  const maxPosition = getAssessmentBoundaryPosition(entry, 'max')

  if (minValue !== null && maxValue !== null) {
    return `background: linear-gradient(90deg, ${ASSESSMENT_RANGE_COLORS.deficient} 0 ${minPosition}%, ${ASSESSMENT_RANGE_COLORS.compliant} ${minPosition}% ${maxPosition}%, ${ASSESSMENT_RANGE_COLORS.excess} ${maxPosition}% 100%);`
  }

  if (minValue !== null) {
    return `background: linear-gradient(90deg, ${ASSESSMENT_RANGE_COLORS.deficient} 0 ${minPosition}%, ${ASSESSMENT_RANGE_COLORS.compliant} ${minPosition}% 100%);`
  }

  if (maxValue !== null) {
    return `background: linear-gradient(90deg, ${ASSESSMENT_RANGE_COLORS.compliant} 0 ${maxPosition}%, ${ASSESSMENT_RANGE_COLORS.excess} ${maxPosition}% 100%);`
  }

  return `background: ${ASSESSMENT_RANGE_COLORS.neutral};`
}

function getItemName(item: DesignerItem) {
  return (
    item.name ||
    item.ingredientName ||
    item.ingredient?.name ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未命名原料'
  )
}

function getItemNutritionProfileName(item: DesignerItem) {
  return (
    item.nutritionFood?.displayNameZh ||
    item.nutritionProfileDisplayName ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未选择营养档案'
  )
}

function getDefaultNutritionProfile(option: RecipeDesignerIngredientOption) {
  return (
    option.nutritionProfiles.find(
      (profile) => profile.nutritionFoodId === option.defaultNutritionFoodId,
    ) ||
    option.nutritionProfiles.find((profile) => profile.isPrimary) ||
    option.nutritionProfiles[0] ||
    null
  )
}

function getNutritionProfileSourceLabel(profile?: IngredientNutritionProfileOption | null) {
  return `数据来源：${profile?.dataSource || '未标注'}`
}

function getNutritionProfileMeta(profile: IngredientNutritionProfileOption) {
  return getNutritionProfileSourceLabel(profile)
}

function getSelectedNutritionProfileLabel() {
  if (!selectedNutritionProfile.value) return '请选择数据来源'
  if (selectedIngredientOption.value && isSupplementOption(selectedIngredientOption.value)) {
    return getNutritionProfileSourceLabel(selectedNutritionProfile.value)
  }
  return selectedNutritionProfile.value.name || '请选择数据来源'
}

function cleanIngredientOptionText(value?: string | null) {
  return String(value || '').trim()
}

function isSupplementOption(option: RecipeDesignerIngredientOption) {
  return String(option.type || '').trim().toUpperCase() === 'SUPPLEMENT'
}

function replaceSupplementServingUnit(text: string, unitLabel: string) {
  if (!unitLabel || !text.includes('/')) return text
  return text.replace(/\/[^/]+$/, `/${unitLabel}`)
}

function getIngredientOptionNutrientMatchText(option: RecipeDesignerIngredientOption) {
  const match = option.nutrientMatch
  if (!match) return ''
  if (isSupplementOption(option)) {
    return replaceSupplementServingUnit(match.displayText, getIngredientOptionUnit(option))
  }
  return match.displayText
}

function shouldShowNutritionProfileOptions(option: RecipeDesignerIngredientOption) {
  return (
    selectedIngredientOption.value?.id === option.id &&
    !isSupplementOption(option) &&
    option.nutritionProfiles.length > 0
  )
}

function getSupplementOptionDetailText(option: RecipeDesignerIngredientOption) {
  if (!isSupplementOption(option)) return ''
  const brand = cleanIngredientOptionText(option.brand)
  const productModel = cleanIngredientOptionText(option.productModel)
  return [brand, productModel].filter(Boolean).join(' · ')
}

function normalizeIngredientHintKey(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function getIngredientIdHintKey(id?: string | null) {
  const normalizedId = normalizeIngredientHintKey(id)
  return normalizedId ? `id:${normalizedId}` : ''
}

function getIngredientNameHintKey(name?: string | null) {
  const normalizedName = normalizeIngredientHintKey(name)
  return normalizedName ? `name:${normalizedName}` : ''
}

function getItemIngredientSearchName(item: DesignerItem) {
  return cleanIngredientOptionText(item.ingredientName || item.ingredient?.name || item.name)
}

function getItemIngredientHintKeys(item: DesignerItem) {
  const keys = [
    getIngredientIdHintKey(item.ingredientId),
    getIngredientIdHintKey(item.ingredient?.id),
    getIngredientNameHintKey(item.ingredientName),
    getIngredientNameHintKey(item.ingredient?.name),
    getIngredientNameHintKey(item.name),
  ].filter(Boolean)
  return Array.from(new Set(keys))
}

function setIngredientTypeHint(option: RecipeDesignerIngredientOption) {
  if (!option?.id && !option?.name) return
  const hint: StandardIngredientSnapshot = {
    id: option.id,
    name: option.name,
    type: option.type,
    unitDisplayLabel: option.unitDisplayLabel,
    purchaseUnit: option.purchaseUnit,
    properties: option.properties,
  }
  const keys = [
    getIngredientIdHintKey(option.id),
    getIngredientNameHintKey(option.name),
  ].filter(Boolean)
  ingredientTypeHints.value = keys.reduce(
    (nextHints, key) => ({
      ...nextHints,
      [key]: hint,
    }),
    { ...ingredientTypeHints.value },
  )
}

function getIngredientTypeHint(item: DesignerItem) {
  for (const key of getItemIngredientHintKeys(item)) {
    const hint = ingredientTypeHints.value[key]
    if (hint) return hint
  }
  return null
}

function getIngredientOptionResponseOptions(res: any) {
  const data = (res?.data ?? res) as IngredientOptionListResponse
  return [
    ...(Array.isArray(data?.data) ? data.data : []),
    ...(Array.isArray(data?.supplementData) ? data.supplementData : []),
    ...(Array.isArray(data?.foodData) ? data.foodData : []),
  ]
}

async function hydrateIngredientTypeHintsForItems(draftItems: DesignerItem[]) {
  const searchNames = Array.from(
    new Set(
      draftItems
        .filter((item) => {
          const standardIngredient = resolveMappedOrDirectStandardIngredient(item)
          return !standardIngredient?.type && !getIngredientTypeHint(item)?.type
        })
        .map((item) => getItemIngredientSearchName(item))
        .filter(Boolean),
    ),
  )

  for (const searchName of searchNames) {
    try {
      const res: any = await fetchRecipeDesignerIngredientOptions({
        search: searchName,
        pageSize: ingredientOptionPageSize,
      })
      getIngredientOptionResponseOptions(res).forEach((option) => setIngredientTypeHint(option))
    } catch (error) {
      console.warn('[RecipeDesignerEditor] Failed to hydrate ingredient type hints:', error)
    }
  }
}

function readIngredientDisplayUnit(properties?: Record<string, unknown> | null) {
  const unit = String(properties?.display_unit || '').trim()
  return unit || ''
}

function getRecipeDesignerWeightUnit(
  type?: string | null,
  purchaseUnit?: string | null,
  unitDisplayLabel?: string | null,
  properties?: Record<string, unknown> | null,
) {
  const normalizedType = String(type || '').trim().toUpperCase()
  const displayUnit = String(unitDisplayLabel || '').trim() || readIngredientDisplayUnit(properties)
  const unit = String(purchaseUnit || '').trim()
  if (normalizedType !== 'SUPPLEMENT') {
    return 'g'
  }
  return displayUnit || unit || 'g'
}

function getIngredientOptionUnit(option?: RecipeDesignerIngredientOption | null) {
  return getRecipeDesignerWeightUnit(option?.type, option?.purchaseUnit, option?.unitDisplayLabel, option?.properties)
}

function resolveMappedOrDirectStandardIngredient(item: DesignerItem) {
  const mappings = item.nutritionFood?.mappings || []
  const mapping =
    mappings.find((candidate) => candidate.ingredientId === item.ingredientId) ||
    mappings.find((candidate) => candidate.isPrimary) ||
    mappings[0]

  const mappedIngredient = mapping?.ingredient
  return mappedIngredient || item.ingredient || null
}

function resolveItemStandardIngredient(item: DesignerItem) {
  const standardIngredient = resolveMappedOrDirectStandardIngredient(item)
  const hintedIngredient = standardIngredient || getIngredientTypeHint(item)
  const typeHint = getIngredientTypeHint(item)
  if (standardIngredient && typeHint) {
    return {
      ...typeHint,
      ...standardIngredient,
      type: standardIngredient.type || typeHint.type,
      unitDisplayLabel: standardIngredient.unitDisplayLabel || typeHint.unitDisplayLabel,
      purchaseUnit: standardIngredient.purchaseUnit || typeHint.purchaseUnit,
      properties: standardIngredient.properties || typeHint.properties,
    }
  }
  return hintedIngredient
}

function getItemUnit(item: DesignerItem) {
  const standardIngredient = resolveItemStandardIngredient(item)
  return getRecipeDesignerWeightUnit(
    standardIngredient?.type || item.ingredientType,
    standardIngredient?.purchaseUnit,
    standardIngredient?.unitDisplayLabel,
    standardIngredient?.properties,
  )
}

function getNormalizedItemType(item: DesignerItem) {
  const standardIngredient = resolveItemStandardIngredient(item)
  return String(standardIngredient?.type || item.ingredientType || '').trim().toUpperCase()
}

function getItemTypeLabel(item: DesignerItem) {
  switch (getNormalizedItemType(item)) {
    case 'SUPPLEMENT':
      return '补剂'
    case 'PACKAGING':
      return '包材'
    default:
      return '食材'
  }
}

function getItemTypeTagClass(item: DesignerItem) {
  switch (getNormalizedItemType(item)) {
    case 'SUPPLEMENT':
      return 'supplement'
    case 'PACKAGING':
      return 'packaging'
    default:
      return 'food'
  }
}

function shouldShowItemWeightRatio(item: DesignerItem) {
  if (!isItemIncludedInAssessment(item)) {
    return false
  }
  const normalizedType = getNormalizedItemType(item)
  const weight = Number(item.weightG ?? 0)
  if (normalizedType === 'SUPPLEMENT') {
    return false
  }
  return currentTotalWeightG.value > 0 && weight > 0
}

function formatItemWeightPercentValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function getItemWeightPercentLabel(item: DesignerItem) {
  if (!shouldShowItemWeightRatio(item)) {
    return ''
  }
  const percent = (Number(item.weightG ?? 0) / currentTotalWeightG.value) * 100
  return `${formatItemWeightPercentValue(percent)}%`
}

function formatItemWeightInput(value?: number) {
  return value === null || value === undefined ? '' : String(value)
}

function getAssessmentCurrentValue(entry: AssessmentEntryLike) {
  return readAssessmentEntryNumber(getAssessmentDisplayEntry(entry).basisEntry, [
    'currentValue',
    'current',
    'actual',
    'value',
  ])
}

function getAssessmentMinValue(entry: AssessmentEntryLike) {
  return readAssessmentEntryNumber(entry, ['minValue', 'targetMin', 'min'])
}

function getAssessmentMaxValue(entry: AssessmentEntryLike) {
  return readAssessmentEntryNumber(entry, ['maxValue', 'targetMax', 'max'])
}

function readAssessmentEntryNumber(entry: AssessmentEntryLike, keys: Array<keyof AssessmentEntryLike>) {
  for (const key of keys) {
    const value = entry[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function formatAssessmentValue(entry: AssessmentEntryLike, value: number) {
  if (isAssessmentRatioEntry(entry)) return formatAssessmentRatioValue(value)
  return `${formatAssessmentNumber(value)}${entry.unit || ''}`
}

function isAssessmentRatioEntry(entry: AssessmentEntryLike) {
  const unit = String(entry.unit || '').toLowerCase()
  return entry.expressionBasis === 'RATIO' || entry.category === 'RATIO' || unit === 'ratio' || unit === ':1'
}

function getAssessmentBoundaryPosition(entry: AssessmentEntryLike, boundary: 'min' | 'max') {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const minValue = getAssessmentMinValue(basisEntry)
  const maxValue = getAssessmentMaxValue(basisEntry)

  if (minValue !== null && maxValue !== null) {
    return boundary === 'min' ? 28 : 82
  }

  if (minValue !== null) return 32
  if (maxValue !== null) return 76
  return boundary === 'min' ? 28 : 82
}

function getAssessmentCurrentPosition(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const currentValue = getAssessmentCurrentValue(entry)
  const minValue = getAssessmentMinValue(basisEntry)
  const maxValue = getAssessmentMaxValue(basisEntry)

  if (currentValue === null) return 50

  if (minValue !== null && maxValue !== null && maxValue > minValue) {
    if (currentValue < minValue) {
      return clampPercent((currentValue / Math.max(minValue, 1)) * 26 + 2, 2, 28)
    }
    if (currentValue <= maxValue) {
      return clampPercent(28 + ((currentValue - minValue) / (maxValue - minValue)) * 54, 28, 82)
    }
    return clampPercent(82 + ((currentValue - maxValue) / Math.max(maxValue, 1)) * 14, 82, 96)
  }

  if (minValue !== null) {
    if (currentValue < minValue) {
      return clampPercent((currentValue / Math.max(minValue, 1)) * 30 + 2, 2, 32)
    }
    return clampPercent(32 + ((currentValue - minValue) / Math.max(currentValue, minValue, 1)) * 54, 32, 88)
  }

  if (maxValue !== null) {
    if (currentValue <= maxValue) {
      return clampPercent((currentValue / Math.max(maxValue, 1)) * 74 + 2, 2, 76)
    }
    return clampPercent(76 + ((currentValue - maxValue) / Math.max(maxValue, 1)) * 18, 76, 96)
  }

  return 50
}

function clampPercent(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatExpressionBasis(value: string) {
  const map: Record<string, string> = {
    PER_1000_KCAL_ME: '/1000kcal ME',
    PER_MJ_ME: '每MJ',
    PER_100G_DRY_MATTER: '干物质',
    RATIO: '比例',
  }
  return map[value] || value
}

function cleanAssessmentStandardName(value: string) {
  return value.replace(/全标准/g, '').replace(/犬标准/g, '').replace(/\s+/g, ' ').trim() || 'FEDIAF 2025'
}

function getDraftScenario(draft: any): FediafDogScenario {
  return (draft?.scenario || draft?.fediafDogScenario || 'ADULT_MER_110') as FediafDogScenario
}

function mergeAssessedItems(currentItems: DesignerItem[], assessedItems: DesignerItem[]) {
  const assessedById = new Map(assessedItems.map((item) => [item.id, item]))
  const currentIds = new Set(currentItems.map((item) => item.id))
  const merged = currentItems.map((current) => {
    const assessed = assessedById.get(current.id)
    if (!assessed) return current
    return {
      ...current,
      ...assessed,
      includeInAssessment: assessed.includeInAssessment ?? current.includeInAssessment,
      preparationMethod: assessed.preparationMethod ?? current.preparationMethod,
      nutritionFood: assessed.nutritionFood ?? current.nutritionFood,
    }
  })

  for (const assessed of assessedItems) {
    if (!currentIds.has(assessed.id)) {
      merged.push(assessed)
    }
  }

  return merged
}

function formatAssessmentNumber(value: unknown) {
  if (value === undefined || value === null) return undefined
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return String(value)
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(2)
}
</script>

<style scoped lang="scss">
.recipe-designer-editor-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx 32rpx 0;
  box-sizing: border-box;
}

.recipe-designer-editor-page.item-dragging-active {
  touch-action: none;
}

.recipe-designer-editor-page.ingredient-picker-active {
  padding-top: 0;
}

.customer-dog-context-block {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  margin-bottom: 16rpx;
  padding: 18rpx 22rpx;
  border: 1rpx solid #dbeafe;
  border-radius: 8rpx;
  background: #eef8ff;
}

.customer-dog-context-title {
  overflow: hidden;
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.customer-dog-context-meta {
  overflow: hidden;
  color: #475569;
  font-size: 23rpx;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-context-block {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  margin-bottom: 20rpx;
  padding: 18rpx 22rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 10rpx;
  background: #fff;
}

.series-context-title {
  overflow: hidden;
  color: #222;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-context-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.series-context-detail {
  max-width: 100%;
  padding: 4rpx 10rpx;
  border-radius: 6rpx;
  background: #f3f4f6;
  color: #555;
  font-size: 22rpx;
  line-height: 1.35;
}

.section {
  background: #fff;
  border-radius: 12rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.section-header,
.item-row,
.drawer-handle {
  display: flex;
  align-items: center;
}

.section-header,
.drawer-handle {
  justify-content: space-between;
  gap: 16rpx;
}

.ingredient-action-header {
  position: sticky;
  top: 0;
  z-index: 24;
  margin: -28rpx -28rpx 20rpx;
  padding: 24rpx 28rpx 18rpx;
  border-bottom: 1rpx solid #eef0f3;
  border-radius: 12rpx 12rpx 0 0;
  background: #fff;
  box-shadow: 0 6rpx 14rpx rgba(15, 23, 42, 0.04);
  box-sizing: border-box;
}

.recipe-designer-editor-page.ingredient-picker-active .series-context-block {
  display: none;
}

.recipe-designer-editor-page.ingredient-picker-active .customer-dog-context-block {
  display: none;
}

.recipe-designer-editor-page.ingredient-picker-active .section {
  border-radius: 0 0 12rpx 12rpx;
}

.recipe-designer-editor-page.ingredient-picker-active .ingredient-action-header {
  top: 0;
  z-index: 32;
  border-radius: 0;
}

.recipe-designer-editor-page.ingredient-picker-active .ingredient-picker-mask {
  top: 104rpx;
  z-index: 22;
  align-items: stretch;
}

.recipe-designer-editor-page.ingredient-picker-active .ingredient-picker-panel {
  height: calc(100vh - 104rpx);
  max-height: calc(100vh - 104rpx);
  border-radius: 0;
}

.primary-btn,
.secondary-btn,
.plain-btn,
.link-btn,
.icon-text-btn,
.picker-close,
.load-more-btn {
  height: 68rpx;
  border-radius: 10rpx;
  font-size: 26rpx;
  line-height: 68rpx;
  margin: 0;
}

.primary-btn {
  background: #1890ff;
  color: #fff;
}

.secondary-btn {
  background: #f0f6ff;
  color: #1677ff;
}

.plain-btn {
  background: #f7f8fa;
  color: #555;
}

.link-btn {
  padding: 0 18rpx;
  background: #fff;
  border: 1rpx solid #d9d9d9;
  color: #333;
}

.revert-official-btn {
  flex-shrink: 0;
  min-width: 150rpx;
  border-color: #91caff;
  color: #1677ff;
}

.icon-text-btn {
  flex-shrink: 0;
  width: 88rpx;
  padding: 0;
  background: #fff1f0;
  color: #cf1322;
  font-size: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #222;
}

.section-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.section-total {
  color: #777;
  font-size: 24rpx;
}

.history-controls {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.history-btn {
  width: 54rpx;
  height: 54rpx;
  margin: 0;
  padding: 0;
  border: 1rpx solid #d9e4ef;
  border-radius: 8rpx;
  background: #fff;
  color: #1677ff;
  font-size: 0;
  line-height: 1;
}

.history-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-icon {
  position: relative;
  width: 30rpx;
  height: 26rpx;
  color: inherit;
}

.history-icon-redo {
  transform: scaleX(-1);
}

.history-icon-arc {
  position: absolute;
  left: 7rpx;
  top: 6rpx;
  width: 17rpx;
  height: 14rpx;
  border: 4rpx solid currentColor;
  border-left-color: transparent;
  border-radius: 999rpx;
  transform: rotate(-28deg);
  box-sizing: border-box;
}

.history-icon-arrow {
  position: absolute;
  left: 2rpx;
  top: 2rpx;
  width: 0;
  height: 0;
  border-top: 7rpx solid transparent;
  border-bottom: 7rpx solid transparent;
  border-right: 10rpx solid currentColor;
}

.history-btn[disabled] {
  color: #b8c2cc;
  background: #f5f7fa;
}

.sort-mode-btn {
  flex: 0 0 auto;
  min-width: 104rpx;
  padding: 0 20rpx;
  text-align: center;
}

.sort-mode-btn.active {
  border-color: #91caff;
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 700;
}

.state-block {
  padding: 80rpx 0;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 20rpx;
}

.item-row-frame {
  display: flex;
  flex-direction: column;
}

.drag-insertion-marker {
  height: 6rpx;
  margin: 0 8rpx 10rpx;
  border-radius: 999rpx;
  background: #1677ff;
  box-shadow: 0 0 0 6rpx rgba(22, 119, 255, 0.12);
}

.ingredient-list-actions {
  margin-top: 22rpx;
}

.secondary-add-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  border-style: dashed;
  background: #f8fafc;
  color: #1677ff;
}

.item-row {
  position: relative;
  justify-content: space-between;
  gap: 14rpx;
  padding: 20rpx 12rpx;
  border: 1rpx solid transparent;
  border-top-color: #f0f0f0;
  border-radius: 12rpx;
  box-sizing: border-box;
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
}

.item-row-reordering {
  gap: 10rpx;
  background: #fbfdff;
  border-color: #e5edf7;
}

.item-row.dragging {
  border-color: #1677ff;
  background: #eef6ff;
  box-shadow: 0 12rpx 28rpx rgba(24, 144, 255, 0.22);
  opacity: 0.96;
  transform: scale(1.018);
  z-index: 2;
}

.item-row-excluded {
  opacity: 0.62;
}

.supplement-removal-hint {
  margin: 8rpx 12rpx 0 86rpx;
  padding: 12rpx 16rpx;
  border: 1rpx solid #ffd591;
  border-radius: 8rpx;
  background: #fff7e6;
  color: #8a4b00;
  font-size: 22rpx;
  line-height: 1.45;
}

.item-drag-handle-shell {
  flex: 0 0 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
}

.drag-handle {
  width: 52rpx;
  height: 64rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 10rpx;
  background: #f3f6fa;
  box-sizing: border-box;
}

.drag-handle::after {
  border: 0;
}

.drag-handle-bar {
  width: 26rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: #9aa4b2;
}

.item-row.dragging .drag-handle {
  background: #dbeafe;
}

.item-leading {
  flex: 0 0 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-type-tag {
  min-width: 56rpx;
  height: 32rpx;
  padding: 0 8rpx;
  border-radius: 8rpx;
  font-size: 19rpx;
  font-weight: 800;
  line-height: 32rpx;
  text-align: center;
  box-sizing: border-box;
}

.item-type-tag.food {
  background: #ecfdf3;
  color: #15803d;
}

.item-type-tag.supplement {
  background: #eff6ff;
  color: #2563eb;
}

.item-type-tag.packaging {
  background: #f3f4f6;
  color: #4b5563;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-name {
  display: block;
  font-size: 28rpx;
  color: #222;
  font-weight: 600;
}

.item-meta {
  display: block;
  margin-top: 8rpx;
  color: #888;
  font-size: 22rpx;
}

.weight-editor {
  flex-shrink: 0;
  width: 128rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6rpx;
  padding: 0 12rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
}

.weight-input {
  width: 72rpx;
  text-align: right;
  font-size: 28rpx;
  color: #222;
}

.weight-unit {
  color: #777;
  font-size: 24rpx;
}

.item-ratio-column {
  flex: 0 0 78rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 64rpx;
}

.item-ratio {
  color: #555;
  font-size: 24rpx;
  font-weight: 700;
  white-space: nowrap;
}

.item-action-stack {
  flex: 0 0 88rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.include-control {
  width: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.include-switch {
  transform: scale(0.62);
  transform-origin: center;
}

.item-row-excluded .weight-editor {
  background: #f1f5f9;
}

.item-row-excluded .item-name {
  color: #6b7280;
}

.ingredient-picker-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.38);
}

.ingredient-picker-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 86vh;
  max-height: 86vh;
  padding: 28rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  border-radius: 24rpx 24rpx 0 0;
  background: #fff;
  box-sizing: border-box;
}

.picker-fixed-top,
.picker-fixed-footer {
  flex: 0 0 auto;
}

.picker-header,
.search-row,
.food-option-mainline,
.picker-footer,
.add-weight-row {
  display: flex;
  align-items: center;
}

.picker-header,
.food-option-mainline,
.picker-footer {
  justify-content: space-between;
  gap: 20rpx;
}

.picker-title {
  display: block;
  color: #222;
  font-size: 32rpx;
  font-weight: 700;
}

.picker-nutrient-context {
  display: block;
  margin-top: 8rpx;
  color: #1677ff;
  font-size: 22rpx;
  font-weight: 700;
}

.picker-close {
  flex-shrink: 0;
  width: 68rpx;
  padding: 0;
  background: #f5f5f5;
  color: #555;
  font-size: 34rpx;
}

.search-row {
  margin-top: 28rpx;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 10rpx;
  background: #f7f8fa;
  color: #222;
  font-size: 26rpx;
  box-sizing: border-box;
}

.supplement-library-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 18rpx;
  padding: 16rpx 18rpx;
  border: 1rpx solid #dce8f5;
  border-radius: 12rpx;
  background: #f8fbff;
}

.supplement-library-copy {
  flex: 1;
  min-width: 0;
  color: #222;
  font-size: 24rpx;
  font-weight: 700;
}

.supplement-library-btn {
  flex-shrink: 0;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 22rpx;
}

.supplement-form-panel {
  margin-top: 14rpx;
  padding: 18rpx;
  border: 1rpx solid #d8e6f3;
  border-radius: 12rpx;
  background: #fbfdff;
}

.supplement-ai-summary {
  margin-bottom: 16rpx;
  padding: 14rpx;
  border: 1rpx solid #c9e3ff;
  border-radius: 10rpx;
  background: #f3f9ff;
}

.supplement-ai-title,
.supplement-ai-warning,
.supplement-ocr-title,
.supplement-ocr-text {
  display: block;
}

.supplement-ai-title {
  color: #1677ff;
  font-size: 23rpx;
  font-weight: 700;
}

.supplement-ai-warning {
  margin-top: 8rpx;
  color: #a16207;
  font-size: 21rpx;
  line-height: 1.45;
}

.supplement-ocr-block {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #dbeafe;
}

.supplement-ocr-title {
  color: #555;
  font-size: 21rpx;
  font-weight: 700;
}

.supplement-ocr-text {
  max-height: 120rpx;
  margin-top: 6rpx;
  color: #667085;
  font-size: 20rpx;
  line-height: 1.45;
  overflow: hidden;
}

.supplement-field-row,
.supplement-basis-row,
.supplement-nutrition-header,
.supplement-submit-row,
.supplement-nutrient-row,
.supplement-nutrient-input-shell,
.supplement-basis-options {
  display: flex;
  align-items: center;
}

.supplement-field-row,
.supplement-basis-row,
.supplement-nutrition-header,
.supplement-submit-row {
  gap: 16rpx;
}

.supplement-field-row + .supplement-field-row,
.supplement-basis-row,
.supplement-nutrition-header {
  margin-top: 14rpx;
}

.supplement-field-label {
  flex: 0 0 148rpx;
  color: #555;
  font-size: 23rpx;
  font-weight: 700;
}

.supplement-text-input {
  flex: 1;
  min-width: 0;
  height: 62rpx;
  padding: 0 18rpx;
  border: 1rpx solid #d9e4ef;
  border-radius: 10rpx;
  background: #fff;
  color: #222;
  font-size: 24rpx;
  box-sizing: border-box;
}

.supplement-basis-options {
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
  gap: 10rpx;
}

.basis-option {
  flex: 1 1 132rpx;
  height: 58rpx;
  margin: 0;
  padding: 0;
  border: 1rpx solid #d9e4ef;
  border-radius: 10rpx;
  background: #fff;
  color: #555;
  font-size: 23rpx;
  line-height: 58rpx;
}

.basis-option.active {
  border-color: #1890ff;
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 700;
}

.supplement-choice-row {
  align-items: flex-start;
}

.supplement-choice-grid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.supplement-choice {
  flex: 0 0 calc((100% - 20rpx) / 3);
}

.supplement-conversion-input {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.supplement-conversion-prefix,
.supplement-conversion-suffix {
  flex: 0 0 auto;
  color: #555;
  font-size: 23rpx;
  font-weight: 700;
}

.supplement-conversion-value {
  flex: 1;
}

.supplement-nutrition-header {
  justify-content: space-between;
}

.supplement-section-title {
  color: #222;
  font-size: 25rpx;
  font-weight: 700;
}

.supplement-fields-scroll {
  max-height: 360rpx;
  margin-top: 12rpx;
}

.supplement-nutrient-group {
  padding: 12rpx 0;
  border-top: 1rpx solid #eef2f6;
}

.supplement-group-title {
  display: block;
  margin-bottom: 8rpx;
  color: #777;
  font-size: 21rpx;
  font-weight: 700;
}

.supplement-nutrient-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.supplement-nutrient-row {
  flex: 0 0 calc((100% - 10rpx) / 2);
  justify-content: space-between;
  gap: 8rpx;
  min-height: 58rpx;
}

.supplement-nutrient-label {
  flex: 1 1 70rpx;
  min-width: 0;
  overflow: hidden;
  color: #333;
  font-size: 23rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.supplement-nutrient-input-shell {
  flex: 0 0 130rpx;
  height: 54rpx;
  padding: 0 10rpx;
  border: 1rpx solid #d9e4ef;
  border-radius: 10rpx;
  background: #fff;
  box-sizing: border-box;
}

.supplement-nutrient-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  color: #222;
  font-size: 24rpx;
  text-align: right;
}

.supplement-nutrient-unit {
  flex-shrink: 0;
  margin-left: 8rpx;
  color: #777;
  font-size: 21rpx;
}

.supplement-submit-row {
  justify-content: flex-end;
  margin-top: 16rpx;
}

.supplement-cancel-btn,
.supplement-submit-btn {
  width: 150rpx;
  padding: 0;
}

.ingredient-list {
  margin-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
  border-bottom: 1rpx solid #f0f0f0;
}

.picker-scroll-body {
  flex: 1;
  min-height: 0;
}

.picker-state {
  padding: 96rpx 0;
  color: #999;
  font-size: 26rpx;
  text-align: center;
}

.picker-state-note {
  display: block;
  margin-top: 12rpx;
  color: #777;
  font-size: 22rpx;
  line-height: 1.4;
}

.ingredient-option-section + .ingredient-option-section {
  margin-top: 18rpx;
}

.ingredient-option-section {
  margin: 16rpx 0;
  padding: 16rpx;
  border: 1rpx solid #edf2f7;
  border-radius: 14rpx;
  background: #fff;
  box-sizing: border-box;
}

.ingredient-option-section-all {
  padding: 0;
  border: 0;
  border-radius: 0;
}

.ingredient-option-section-supplement {
  border-color: #d6eaff;
  background: #f7fbff;
}

.ingredient-option-section-food {
  border-color: #dbeedd;
  background: #fbfdf8;
}

.ingredient-option-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 0 2rpx 14rpx;
  border-bottom: 1rpx solid rgba(148, 163, 184, 0.18);
}

.ingredient-option-section-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.ingredient-section-kind {
  flex: 0 0 auto;
  padding: 3rpx 10rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #1677ff;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.35;
}

.ingredient-option-section-title {
  display: block;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #4b5563;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-count {
  flex: 0 0 auto;
  color: #667085;
  font-size: 21rpx;
  font-weight: 800;
}

.ingredient-option-section-food .ingredient-section-kind {
  color: #15803d;
}

.food-option {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
  box-sizing: border-box;
}

.ingredient-option-section-supplement .food-option,
.ingredient-option-section-food .food-option {
  margin-top: 12rpx;
  padding: 18rpx 18rpx 18rpx 22rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.18);
  border-radius: 12rpx;
  background: #fff;
}

.ingredient-option-section-supplement .food-option:last-child,
.ingredient-option-section-food .food-option:last-child {
  border-bottom: 1rpx solid rgba(148, 163, 184, 0.18);
}

.supplement-option {
  box-shadow: inset 6rpx 0 0 #3b82f6;
}

.food-source-option {
  box-shadow: inset 6rpx 0 0 #22c55e;
}

.food-option.selected {
  border-color: #1677ff;
  background: #edf4ff;
}

.food-option-mainline {
  width: 100%;
}

.food-main {
  flex: 1;
  min-width: 0;
}

.food-name {
  display: block;
  color: #222;
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.35;
}

.food-nutrient-match {
  display: block;
  margin-top: 6rpx;
  color: #1677ff;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
}

.supplement-option .food-nutrient-match {
  color: #2563eb;
}

.food-source-option .food-nutrient-match {
  color: #15803d;
}

.ingredient-option-detail-list {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  margin-top: 10rpx;
  padding: 12rpx 14rpx;
  border: 1rpx solid #e7f0ff;
  border-radius: 10rpx;
  background: #fbfdff;
}

.ingredient-option-detail {
  display: block;
  color: #555;
  font-size: 22rpx;
  line-height: 1.45;
  word-break: break-word;
}

.profile-options {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 16rpx;
  padding: 12rpx;
  border-radius: 10rpx;
  background: #f7f8fa;
}

.profile-option {
  padding: 14rpx 16rpx;
  border: 1rpx solid #e8e8e8;
  border-radius: 8rpx;
  background: #fff;
}

.profile-option.active {
  border-color: #1677ff;
  background: #edf4ff;
}

.profile-name,
.profile-meta,
.selected-profile {
  display: block;
}

.profile-name {
  color: #222;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1.35;
}

.profile-meta {
  margin-top: 6rpx;
  color: #777;
  font-size: 21rpx;
}

.load-more-btn {
  width: 100%;
  margin: 18rpx 0;
  background: #f7f8fa;
  color: #555;
}

.picker-footer {
  margin-top: 22rpx;
}

.picker-footer-panel {
  padding: 22rpx 18rpx;
  border: 1rpx solid #e8edf3;
  border-radius: 14rpx;
  background: #f8fafc;
  box-shadow: 0 -4rpx 14rpx rgba(15, 23, 42, 0.06);
}

.selected-info {
  flex: 1;
  min-width: 0;
}

.selected-label {
  display: block;
  color: #888;
  font-size: 22rpx;
}

.selected-name {
  display: block;
  margin-top: 6rpx;
  color: #222;
  font-size: 26rpx;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-profile {
  margin-top: 6rpx;
  color: #777;
  font-size: 22rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-weight-row {
  flex-shrink: 0;
  align-items: flex-end;
  gap: 12rpx;
}

.weight-entry {
  flex-shrink: 0;
}

.weight-label-row {
  display: flex;
  align-items: center;
  gap: 4rpx;
  margin-bottom: 8rpx;
  padding-left: 4rpx;
}

.weight-label {
  color: #333;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1;
}

.required-mark {
  color: #ff4d4f;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1;
}

.add-weight-input-shell {
  display: flex;
  align-items: center;
  width: 154rpx;
  height: 68rpx;
  padding: 0 14rpx;
  border: 2rpx solid #91caff;
  border-radius: 12rpx;
  background: #fff;
  box-shadow: 0 0 0 4rpx rgba(24, 144, 255, 0.08);
  box-sizing: border-box;
}

.add-weight-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  background: transparent;
  text-align: right;
  color: #222;
  font-size: 28rpx;
  box-sizing: border-box;
}

.add-btn {
  width: 104rpx;
  padding: 0;
  margin-bottom: 0;
}

.assessment-drawer {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-height: 188rpx;
  max-height: calc(100vh - 72px);
  padding: 8rpx 32rpx 0;
  background: #eef4f8;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.08);
  border-radius: 20rpx 20rpx 0 0;
  box-sizing: border-box;
  overflow: hidden;
  transition: top 0.18s ease, height 0.18s ease;
}

.assessment-drawer.dragging {
  transition: none;
}

.drawer-touch-zone {
  flex: 0 0 auto;
}

.drawer-touch-zone {
  padding-bottom: 8rpx;
}

.drawer-drag-zone {
  flex: 0 0 auto;
  width: 100%;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.drawer-grip {
  flex: 0 0 auto;
  width: 76rpx;
  height: 8rpx;
  margin: 0;
  border-radius: 999rpx;
  background: #d8dde6;
}

.drawer-handle {
  justify-content: flex-start;
  gap: 16rpx;
}

.drawer-title-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.drawer-title {
  display: block;
  flex-shrink: 0;
  font-size: 30rpx;
  font-weight: 700;
  color: #222;
}

.standard-context {
  flex: 1;
  min-width: 0;
  max-width: 390rpx;
  margin-left: auto;
  display: block;
  overflow: hidden;
  color: #333;
  font-size: 22rpx;
  font-weight: 700;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scenario-switch-btn {
  flex: 0 0 auto;
  width: 72rpx;
  height: 42rpx;
  margin: 0;
  padding: 0;
  border: 1rpx solid #b6d9ff;
  border-radius: 8rpx;
  background: #fff;
  color: #1677ff;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 42rpx;
}

.scenario-switch-btn[disabled] {
  color: #9fb6cf;
  background: #f5f7fa;
}

.scenario-switch-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 95;
  display: flex;
  align-items: flex-end;
  background: rgba(17, 24, 39, 0.36);
}

.scenario-switch-panel {
  width: 100%;
  max-height: 78vh;
  padding: 28rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
  border-radius: 20rpx 20rpx 0 0;
  background: #fff;
  box-sizing: border-box;
}

.scenario-switch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.scenario-switch-title {
  color: #222;
  font-size: 32rpx;
  font-weight: 800;
  line-height: 1.35;
}

.scenario-switch-close {
  flex: 0 0 auto;
  color: #1677ff;
  font-size: 24rpx;
  font-weight: 800;
}

.scenario-switch-note {
  display: block;
  margin-top: 10rpx;
  color: #667085;
  font-size: 23rpx;
  line-height: 1.45;
}

.scenario-option-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 22rpx;
}

.scenario-option {
  padding: 18rpx 20rpx;
  border: 1rpx solid #edf0f5;
  border-radius: 12rpx;
  background: #fbfcfe;
  box-sizing: border-box;
}

.scenario-option-active {
  border-color: #91caff;
  background: #eef8ff;
}

.scenario-option-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.scenario-option-title {
  flex: 1;
  min-width: 0;
  color: #222;
  font-size: 27rpx;
  font-weight: 800;
  line-height: 1.35;
}

.scenario-option-check {
  flex: 0 0 auto;
  color: #1677ff;
  font-size: 28rpx;
  font-weight: 800;
  line-height: 1;
}

.scenario-option-desc {
  display: block;
  margin-top: 8rpx;
  color: #777;
  font-size: 22rpx;
  line-height: 1.45;
}

.scenario-switch-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}

.scenario-switch-cancel-btn,
.scenario-switch-confirm-btn {
  flex: 1;
  height: 72rpx;
  margin: 0;
  padding: 0;
  line-height: 72rpx;
}

.entry-status {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.assessment-category-tabs {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10rpx;
  margin-top: 10rpx;
}

.assessment-category-tab {
  position: relative;
  min-width: 0;
  height: 56rpx;
  line-height: 56rpx;
  background: #fff;
  border-radius: 999rpx;
  color: #555;
  font-size: 22rpx;
  font-weight: 700;
  text-align: center;
}

.assessment-category-tab.active {
  background: #e6f4ff;
  color: #1677ff;
}

.assessment-category-badge {
  position: absolute;
  top: -10rpx;
  right: -6rpx;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 6rpx;
  border: 4rpx solid #fff;
  border-radius: 999rpx;
  background: #ef4444;
  color: #fff;
  font-size: 18rpx;
  line-height: 28rpx;
  text-align: center;
  box-sizing: content-box;
}

.assessment-list {
  flex: 1;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  margin-top: 20rpx;
  border-top: 0;
}

.assessment-list-surface {
  padding: 0 20rpx;
  border: 1rpx solid #dbe7f1;
  border-radius: 14rpx;
  background: #fff;
  box-sizing: border-box;
  overflow: hidden;
}

.bottom-publish-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 18;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: none;
  box-sizing: border-box;
}

.bottom-publish-btn {
  width: 100%;
  height: 76rpx;
  padding: 0;
  line-height: 76rpx;
}

.customer-next-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  align-items: center;
}

.customer-next-btn,
.customer-report-btn {
  width: 100%;
  height: 76rpx;
  padding: 0 8rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 76rpx;
}

.customer-report-btn {
  border-color: #d9e2ec;
  color: #475569;
}

.assessment-category-title {
  display: block;
  padding: 18rpx 0 4rpx;
  color: #222;
  font-size: 26rpx;
  font-weight: 700;
}

.assessment-empty {
  padding: 36rpx 0 12rpx;
  color: #999;
  text-align: center;
  font-size: 24rpx;
}

.assessment-entry {
  display: block;
  padding: 20rpx 0 26rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.entry-heading,
.entry-name-line {
  display: flex;
  align-items: center;
  min-width: 0;
}

.entry-heading {
  justify-content: space-between;
  gap: 16rpx;
}

.entry-name-line {
  flex: 1;
  gap: 10rpx;
  overflow: hidden;
  white-space: nowrap;
}

.entry-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #222;
  font-size: 26rpx;
  font-weight: 700;
}

.entry-basis,
.entry-dry-matter {
  flex: 0 0 auto;
  color: #777;
  font-size: 20rpx;
  font-weight: 700;
}

.entry-detail-trigger {
  flex: 0 0 auto;
  max-width: 168rpx;
  min-height: 34rpx;
  padding: 0 12rpx;
  border: 1rpx solid #cfe8ff;
  border-radius: 999rpx;
  color: #2187e8;
  background: #f3f9ff;
  overflow: hidden;
  text-align: center;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 34rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-dry-matter {
  padding-left: 10rpx;
  border-left: 1rpx solid #e8e8e8;
  color: #444;
}

.entry-dry-matter-side {
  flex: 0 0 auto;
  margin-left: auto;
  text-align: right;
}

.entry-status-inline {
  flex: 0 0 auto;
  padding: 3rpx 10rpx;
  font-size: 20rpx;
  line-height: 1.3;
}

.macro-overview-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-width: 0;
  min-height: 54rpx;
}

.macro-overview-name {
  flex: 1.05 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #222;
  font-size: 26rpx;
  font-weight: 700;
}

.macro-overview-amount {
  flex: 1.2 1 0;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6rpx;
  overflow: hidden;
  white-space: nowrap;
}

.macro-overview-value {
  flex: 0 0 auto;
  color: #222;
  font-size: 26rpx;
  font-weight: 800;
}

.macro-overview-basis {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #777;
  font-size: 20rpx;
  font-weight: 700;
}

.macro-overview-dry-matter {
  flex: 0 0 108rpx;
  min-height: 1em;
  color: #444;
  font-size: 24rpx;
  font-weight: 700;
  text-align: right;
}

.entry-range {
  position: relative;
  height: 104rpx;
  margin-top: 20rpx;
}

.entry-range-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 30rpx;
  height: 12rpx;
  border-radius: 999rpx;
  background: #e5e7eb;
}

.entry-range-marker {
  position: absolute;
  top: -8rpx;
  width: 6rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: #111827;
  transform: translateX(-50%);
}

.entry-range-bound,
.entry-range-current {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}

.entry-range-bound {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  top: 0;
  color: #777;
  font-size: 20rpx;
  font-weight: 700;
}

.entry-footnote-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24rpx;
  height: 24rpx;
  border-radius: 999rpx;
  background: #edf2ff;
  color: #2563eb;
  font-size: 18rpx;
  font-weight: 800;
  line-height: 24rpx;
}

.entry-range-current {
  top: 50rpx;
  color: #222;
  font-size: 20rpx;
  font-weight: 800;
}

.entry-range-conflict {
  position: absolute;
  left: 0;
  right: 0;
  top: 78rpx;
  color: #be123c;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 24rpx;
  white-space: normal;
}

.entry-missing-detail {
  display: block;
  margin-top: 10rpx;
  color: #888;
  font-size: 22rpx;
}

.entry-reference-value {
  margin-top: 12rpx;
  color: #333;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 32rpx;
}

.assessment-detail-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  background: rgba(17, 24, 39, 0.36);
  box-sizing: border-box;
}

.assessment-detail-panel {
  width: 620rpx;
  max-width: 100%;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  padding: 28rpx 28rpx 24rpx;
  border-radius: 16rpx;
  background: #fff;
  box-sizing: border-box;
  overflow: hidden;
}

.detail-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.detail-modal-title {
  min-width: 0;
  overflow: hidden;
  color: #222;
  font-size: 30rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-modal-close {
  flex: 0 0 auto;
  color: #2563eb;
  font-size: 24rpx;
  font-weight: 700;
}

.detail-modal-body {
  flex: 1;
  min-height: 0;
  max-height: 58vh;
}

.detail-range-preview {
  margin-top: 18rpx;
  padding: 18rpx;
  border: 1rpx solid #edf2f7;
  border-radius: 12rpx;
  background: #fbfdff;
}

.detail-range-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.detail-range-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #667085;
  font-size: 23rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-range-status {
  flex: 0 0 auto;
  max-width: 150rpx;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-range-scale {
  position: relative;
  padding-top: 66rpx;
}

.detail-range-track {
  position: relative;
  height: 12rpx;
  border-radius: 999rpx;
  background: #e5e7eb;
}

.detail-range-current {
  position: absolute;
  top: 4rpx;
  z-index: 1;
  display: flex;
  max-width: 220rpx;
  min-width: 132rpx;
  flex-direction: column;
  gap: 4rpx;
  padding: 8rpx 10rpx;
  border: 1rpx solid #dbeafe;
  border-radius: 10rpx;
  background: #fff;
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.08);
  box-sizing: border-box;
}

.detail-range-current-title,
.detail-range-current-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-range-current-title {
  color: #667085;
  font-size: 19rpx;
  font-weight: 800;
  line-height: 1;
}

.detail-range-current-value {
  color: #222;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 1.12;
}

.detail-range-marker {
  position: absolute;
  top: -8rpx;
  width: 6rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: #111827;
  transform: translateX(-50%);
}

.detail-range-loading {
  position: absolute;
  right: 0;
  top: -24rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 4rpx 8rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #2563eb;
  font-size: 19rpx;
  font-weight: 800;
  box-shadow: 0 2rpx 8rpx rgba(37, 99, 235, 0.12);
}

.detail-loading-spinner,
.detail-contribution-spinner {
  flex: 0 0 auto;
  width: 22rpx;
  height: 22rpx;
  border: 3rpx solid #bfdbfe;
  border-top-color: #2563eb;
  border-radius: 999rpx;
  animation: detail-spin 0.8s linear infinite;
  box-sizing: border-box;
}

.detail-range-bounds {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30rpx;
  margin-top: 14rpx;
  color: #667085;
  font-size: 21rpx;
  font-weight: 700;
}

.detail-modal-table {
  margin-top: 18rpx;
  overflow: hidden;
  border: 1rpx solid #edf2f7;
  border-radius: 12rpx;
}

.detail-modal-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 16rpx 18rpx;
  background: #f8fafc;
}

.detail-modal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx;
  border-top: 1rpx solid #f1f5f9;
}

.detail-modal-label {
  flex: 0 0 210rpx;
  color: #666;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.45;
}

.detail-modal-value {
  flex: 1;
  color: #222;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.45;
  text-align: right;
  word-break: break-word;
}

.detail-contribution-section {
  margin-top: 22rpx;
}

.detail-contribution-title {
  display: block;
  margin-bottom: 12rpx;
  color: #222;
  font-size: 26rpx;
  font-weight: 800;
}

.detail-contribution-table {
  overflow: hidden;
  border: 1rpx solid #edf2f7;
  border-radius: 12rpx;
}

.detail-contribution-head,
.detail-contribution-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 14rpx 14rpx;
}

.detail-contribution-head {
  background: #f8fafc;
  color: #667085;
  font-size: 21rpx;
  font-weight: 800;
}

.detail-contribution-row {
  border-top: 1rpx solid #f1f5f9;
}

.detail-contribution-name,
.detail-contribution-name-cell {
  flex: 1 1 auto;
  min-width: 0;
}

.detail-contribution-weight {
  flex: 0 0 184rpx;
  min-width: 0;
}

.detail-contribution-amount {
  flex: 0 0 112rpx;
  min-width: 0;
  text-align: right;
}

.detail-contribution-percent {
  flex: 0 0 76rpx;
  min-width: 0;
  text-align: right;
}

.detail-contribution-row .detail-contribution-weight,
.detail-contribution-row .detail-contribution-amount,
.detail-contribution-row .detail-contribution-percent {
  color: #222;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-word;
}

.detail-contribution-row .detail-contribution-weight {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.detail-contribution-weight-editor {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 52rpx;
  padding: 0 10rpx;
  border: 1rpx solid #d9e4ef;
  border-radius: 10rpx;
  background: #fff;
  box-sizing: border-box;
}

.detail-contribution-weight-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  color: #222;
  font-size: 23rpx;
  font-weight: 800;
  text-align: right;
}

.detail-contribution-weight-confirm-btn {
  flex: 0 0 54rpx;
  width: 54rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border-radius: 8rpx;
  background: #1677ff;
  color: #fff;
  font-size: 19rpx;
  font-weight: 800;
  line-height: 52rpx;
}

.detail-contribution-weight-confirm-btn[disabled] {
  background: #e5e7eb;
  color: #98a2b3;
}

.detail-contribution-spinner {
  width: 20rpx;
  height: 20rpx;
  margin-left: 6rpx;
  border-width: 3rpx;
}

.detail-contribution-weight-unit {
  flex: 0 0 auto;
  margin-left: 6rpx;
  color: #667085;
  font-size: 20rpx;
  font-weight: 800;
}

.detail-contribution-item-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #222;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-contribution-bar {
  height: 8rpx;
  margin-top: 8rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background: #eef2f7;
}

.detail-contribution-bar-fill {
  height: 100%;
  border-radius: 999rpx;
  background: #1677ff;
}

@keyframes detail-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.detail-nutrient-search-btn {
  width: 100%;
  height: 72rpx;
  margin: 0;
  border-radius: 12rpx;
  background: #1677ff;
  color: #fff;
  font-size: 25rpx;
  font-weight: 800;
  line-height: 72rpx;
}

.detail-modal-footer {
  flex: 0 0 auto;
  padding-top: 18rpx;
  border-top: 1rpx solid #f1f5f9;
  background: #fff;
}

.status-compliant {
  background: #f6ffed;
  color: #389e0d;
}

.status-deficient {
  background: #fff7ed;
  color: #c2410c;
}

.status-excess {
  background: #fef2f2;
  color: #dc2626;
}

.status-conflict {
  background: #fff1f2;
  color: #be123c;
}

.status-missing,
.status-pending {
  background: #f5f5f5;
  color: #777;
}
</style>
