<template>
  <view class="diy-sheet-page">
    <!-- 1. 食谱信息卡片 -->
    <view class="section recipe-info-section">
      <view class="recipe-cover-wrapper">
        <image
          v-if="recipe.coverImageUrl"
          :src="normalizeImageUrl(recipe.coverImageUrl)"
          class="recipe-cover"
          mode="aspectFill"
        />
        <view v-else class="recipe-cover-placeholder">
          <text class="placeholder-text">食谱封面</text>
        </view>
      </view>

      <view class="recipe-details">
        <text class="recipe-name">{{ recipe.name }}</text>

        <view class="tags-row">
          <text
            v-for="stage in recipe.applicableLifeStages"
            :key="'stage-' + stage"
            class="tag life-stage-tag"
          >
            {{ getLifeStageLabel(stage) }}
          </text>
          <text
            v-for="tag in recipe.targetHealthTags"
            :key="'tag-' + tag"
            class="tag health-tag"
          >
            {{ getHealthTagLabel(tag) }}
          </text>
        </view>

        <view class="nutrition-summary">
          <view class="nutrition-item">
            <text class="label">营养标准</text>
            <text class="value">{{ getNutritionStandardLabel(recipe.nutritionStandard) }}</text>
          </view>
          <view v-if="recipe.designSource" class="nutrition-item">
            <text class="label">设计来源</text>
            <text class="value">{{ recipe.designSource }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 生命阶段提醒 -->
    <view v-if="!isLifeStageMatch && dog && showWarning" class="warning-card">
      <view class="warning-header">
        <text class="warning-title">生命阶段提醒</text>
      </view>
      <text class="warning-text">
        {{ lifeStageReminderText }}
      </text>
      <button class="btn-continue" @tap="dismissWarning">
        我已知晓
      </button>
    </view>

    <!-- 2. 制作清单 -->
    <view class="section purchase-list-section">
      <view class="section-title">
        <text class="title-text">制作清单</text>
      </view>

      <view class="purchase-list-content">
        <!-- 狗狗信息 -->
        <view v-if="dog" class="dog-info-summary">
          <text class="info-text">
            狗狗：{{ dog.name }} | {{ dogAgeText }} | {{ dog.currentWeightKg }}kg | {{ dog.mealsPerDay }}餐/天
          </text>
        </view>

        <!-- 制作信息 -->
        <view class="making-info-summary">
          <text class="info-text">
            制作周期：{{ cycleDays }}天 | 每餐：{{ perMealG }}g | 每日：{{ dailyIntakeG }}g
          </text>
          <text v-if="foodItemsTotal.actualAmount > 0" class="info-text secondary-info-text">
            净食材约 {{ foodItemsTotal.theoreticalAmountStr }} | 采购量约 {{ foodItemsTotal.actualAmountStr }}（含损耗）
          </text>
        </view>

        <view v-if="pricePreviewWarning" class="preview-warning-summary">
          <text class="preview-warning-text">{{ pricePreviewWarning }}</text>
        </view>

        <!-- 食材 -->
        <view v-if="foodItemsDetailed.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">食材</view>
          <view class="ingredient-table">
            <view class="table-header food-table">
              <text class="header-item name-col">原料名称</text>
              <text class="header-item recommend-col">{{ DIY_SHEET_FOOD_RECOMMENDATION_LABEL }}</text>
              <text class="header-item method-col">制备方法</text>
              <text class="header-item actual-col">采购量</text>
            </view>
            <view v-for="(item, idx) in foodItemsDetailed" :key="'food-' + idx" class="table-row food-table">
              <text class="row-item name-col">{{ item.ingredientName }}</text>
              <view
                v-if="item.selectedProductDisplayText !== '-' && item.hasSpecDetail"
                class="row-item recommend-col recommend-choice"
              >
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
                <text
                  v-if="item.choiceLabel"
                  class="recommend-badge"
                  :class="{ 'recommend-badge-replace': item.allRecommendedProducts && item.allRecommendedProducts.length > 1 }"
                  @tap.stop="showSpecModal(item)"
                >
                  {{ item.choiceLabel }}
                </text>
              </view>
              <view v-else class="row-item recommend-col">
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
              </view>
              <text class="row-item method-col">{{ item.preparationMethod || '-' }}</text>
              <text
                class="row-item actual-col highlight amount-link"
                @tap.stop="showAmountDetailModal(item)"
              >
                {{ item.actualAmountStr }}
              </text>
            </view>
            <!-- 合计行 -->
            <view class="table-row total-row food-table">
              <text class="row-item name-col total-label">合计</text>
              <text class="row-item recommend-col">-</text>
              <text class="row-item method-col">-</text>
              <text class="row-item actual-col total-value highlight">{{ foodItemsTotal.actualAmountStr }}</text>
            </view>
          </view>
        </view>

        <!-- 补剂类：需额外补充的营养 -->
        <view v-if="supplementItemsDetailed.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">营养补充剂</view>
          <view class="ingredient-table">
            <view class="table-header supplement-table">
              <text class="header-item product-col">补剂名称</text>
              <text class="header-item brand-col">{{ DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL }}</text>
              <text class="header-item timing-col">最佳添加时机</text>
              <text class="header-item dosage-col">添加总量</text>
            </view>
            <view v-for="(item, idx) in supplementItemsDetailed" :key="'supp-' + idx" class="table-row supplement-table">
              <text class="row-item product-col">{{ item.name }}</text>
              <view
                v-if="item.hasSpecDetail"
                class="row-item brand-col recommend-choice"
              >
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
                <text
                  v-if="item.choiceLabel"
                  class="recommend-badge"
                  :class="{ 'recommend-badge-replace': item.allRecommendedProducts && item.allRecommendedProducts.length > 1 }"
                  @tap.stop="showSpecModal(item)"
                >
                  {{ item.choiceLabel }}
                </text>
              </view>
              <view v-else class="row-item brand-col">
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
              </view>
              <text class="row-item timing-col">{{ item.preparationMethod }}</text>
              <text
                class="row-item dosage-col highlight amount-link"
                @tap.stop="showNutritionInfoModal(item)"
              >
                {{ item.amountStr }}
              </text>
            </view>
          </view>
        </view>

        <!-- 无数据提示 -->
        <view v-if="foodItemsDetailed.length === 0 && supplementItemsDetailed.length === 0" class="no-data">
          <text class="no-data-text">暂无采购数据</text>
        </view>
      </view>
    </view>

    <!-- 3. 制作流程 -->
    <view class="section production-steps-section" v-if="recipe.productionSteps">
      <view class="section-title">
        <text class="title-text">制作流程</text>
      </view>
      <view class="steps-content">
        <text class="steps-text">{{ recipe.productionSteps }}</text>
      </view>
    </view>

    <!-- 4-8. 固定文案卡片 -->
    <view class="info-cards-grid">
      <!-- 烹饪建议 -->
      <view class="info-card">
        <view class="card-title">
          <text class="title-text">烹饪建议</text>
        </view>
        <view class="card-content multi-line">
          <text class="content-line">建议蒸、炖、低温慢煮</text>
          <text class="content-line warning">不建议微波、烤、煎等高温烹饪</text>
        </view>
      </view>

      <!-- 分装建议 -->
      <view class="info-card">
        <view class="card-title">
          <text class="title-text">分装建议</text>
        </view>
        <text class="card-content">建议使用食品真空袋抽真空保存</text>
      </view>

      <!-- 储存&保质期 -->
      <view class="info-card">
        <view class="card-title">
          <text class="title-text">储存&保质期</text>
        </view>
        <view class="card-content multi-line">
          <text class="content-line">-18℃冷冻保存6个月</text>
          <text class="content-line">0-4℃冷藏保存3天</text>
          <text class="content-line">开封后3小时内吃完</text>
        </view>
      </view>

      <!-- 制作设备推荐 -->
      <view v-if="false" class="info-card equipment-card" @tap="handleShowEquipmentList">
        <view class="card-title">
          <text class="title-text">制作设备推荐</text>
          <text class="view-more">查看详情 →</text>
        </view>
        <view class="equipment-list">
          <view
            v-for="equipment in equipmentRecommendations"
            :key="equipment.id"
            class="equipment-item"
          >
            <image
              v-if="equipment.imageUrl"
              :src="equipment.imageUrl"
              class="equipment-icon"
              mode="aspectFill"
            />
            <view v-else class="equipment-icon-placeholder">
              <text class="placeholder-icon">{{ equipment.name.charAt(0) }}</text>
            </view>
            <text class="equipment-name">{{ equipment.name }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-actions">
      <button
        class="action-btn primary"
        :disabled="!isPageDataLoaded || isGeneratingImage"
        @tap="handlePrint"
      >
        <text class="btn-text">生成图片</text>
      </button>
      <button class="action-btn success" @tap="handleSave">
        <text class="btn-text">保存制作单</text>
      </button>
      <ShareButton
        :share-path="sharePath"
        :share-title="shareTitle"
        :share-image="normalizeImageUrl(recipe.coverImageUrl)"
        type="icon-only"
        size="large"
      />
    </view>

    <!-- Canvas用于打印功能（隐藏） - A4竖版: 1200px × 1697px，2倍像素导出 -->
    <canvas
      canvas-id="printCanvas"
      id="printCanvas"
      class="print-canvas"
      :width="PRINT_CANVAS_OUTPUT_WIDTH"
      :height="PRINT_CANVAS_OUTPUT_HEIGHT"
      :style="printCanvasStyle"
    ></canvas>

    <!-- 规格详情弹窗 -->
    <view v-if="showSpec" class="spec-modal" @tap="closeSpecModal">
      <view class="spec-content" @tap.stop>
        <view class="spec-header">
          <text class="spec-title">{{ DIY_SHEET_SPEC_MODAL_TITLE }}</text>
          <text class="btn-close" @tap="closeSpecModal">✕</text>
        </view>
        <!-- 有多个推荐产品时：展示产品卡片列表 -->
        <view v-if="currentSpec.allRecommendedProducts && currentSpec.allRecommendedProducts.length > 1" class="spec-body">
          <view class="rp-cards-list">
            <view
              v-for="(rp, rpIdx) in currentSpec.allRecommendedProducts"
              :key="rp.id"
              class="rp-card"
              :class="{ 'rp-card-active': rpIdx === modalSelectedRpIndex }"
              @tap="selectRecommendedProduct(modalSelectionKey, rpIdx)"
            >
              <view class="rp-card-header">
                <text class="rp-card-name">{{ rp.name }}</text>
                <text v-if="rpIdx === modalSelectedRpIndex" class="rp-card-badge">已选</text>
              </view>
              <view class="rp-card-main">
                <view class="rp-card-body">
                  <view v-if="rp.brand" class="rp-card-field">
                    <text class="rp-card-field-label">品牌</text>
                    <text class="rp-card-field-value">{{ rp.brand }}</text>
                  </view>
                  <view v-if="rp.productModel" class="rp-card-field">
                    <text class="rp-card-field-label">规格</text>
                    <text class="rp-card-field-value">{{ rp.productModel }}</text>
                  </view>
                  <view v-if="getSpecPurchaseChannelDisplay(rp)" class="rp-card-field">
                    <text class="rp-card-field-label">推荐购买渠道</text>
                    <text class="rp-card-field-value">{{ getSpecPurchaseChannelDisplay(rp) }}</text>
                  </view>
                </view>
                <view class="rp-card-aside">
                  <view v-if="rp.imageUrl" class="rp-card-media">
                    <image
                      :src="getOptimizedProductImageUrl(rp.imageUrl)"
                      class="rp-card-image"
                      mode="aspectFill"
                      lazy-load
                    />
                  </view>
                  <view v-if="rp.purchaseLink" class="rp-card-actions">
                    <button
                      class="btn-purchase btn-purchase-sm"
                      @tap.stop="handlePurchase(rp.purchaseLink, rp.name)"
                    >去购买</button>
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view class="spec-actions">
            <button class="spec-action-btn spec-action-btn-secondary" @tap="closeSpecModal">取消</button>
            <button class="spec-action-btn spec-action-btn-primary" @tap="confirmRecommendedProductSelection">确认选择</button>
          </view>
        </view>
        <!-- 只有1个或没有推荐产品时：原有展示 -->
        <view v-else class="spec-body">
          <view class="spec-detail-main">
            <view class="spec-detail-body">
              <view class="spec-detail-field">
                <text class="spec-detail-field-label">商品名称</text>
                <text class="spec-detail-field-value">{{ currentSpec.name }}</text>
              </view>
              <view class="spec-detail-field">
                <text class="spec-detail-field-label">品牌</text>
                <text class="spec-detail-field-value">{{ currentSpec.brand }}</text>
              </view>
              <view v-if="currentSpec.productModel" class="spec-detail-field">
                <text class="spec-detail-field-label">规格</text>
                <text class="spec-detail-field-value">{{ currentSpec.productModel }}</text>
              </view>
              <view v-if="getSpecPurchaseChannelDisplay(currentSpec)" class="spec-detail-field">
                <text class="spec-detail-field-label">推荐购买渠道</text>
                <text class="spec-detail-field-value">{{ getSpecPurchaseChannelDisplay(currentSpec) }}</text>
              </view>
            </view>
            <view v-if="currentSpec.imageUrl || currentSpec.purchaseLink" class="spec-detail-aside">
              <view v-if="currentSpec.imageUrl" class="spec-image-block">
                <image
                  :src="getOptimizedProductImageUrl(currentSpec.imageUrl)"
                  class="spec-image"
                  mode="aspectFill"
                  lazy-load
                />
              </view>
              <view v-if="currentSpec.purchaseLink" class="spec-detail-actions">
                <button
                  class="btn-purchase btn-purchase-sm"
                  @tap="handlePurchase(currentSpec.purchaseLink, currentSpec.name)"
                >
                  去购买
                </button>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 用量详情弹窗 -->
    <view v-if="showAmountDetail" class="spec-modal" @tap="closeAmountDetailModal">
      <view class="spec-content" @tap.stop>
        <view class="spec-header">
          <text class="spec-title">采购量详情</text>
          <text class="btn-close" @tap="closeAmountDetailModal">✕</text>
        </view>
        <view class="spec-body">
          <view class="spec-row">
            <text class="spec-label">{{ getAmountDetailNameLabel(currentAmountDetail) }}</text>
            <text class="spec-value">{{ getAmountDetailName(currentAmountDetail) }}</text>
          </view>
          <view v-if="currentAmountDetail.preparationMethod" class="spec-row">
            <text class="spec-label">{{ currentAmountDetail.type === 'SUPPLEMENT' ? '最佳添加时机：' : '制备方法：' }}</text>
            <text class="spec-value">{{ currentAmountDetail.preparationMethod }}</text>
          </view>
          <view class="spec-divider"></view>
          <view class="spec-row">
            <text class="spec-label">理论用量：</text>
            <text class="spec-value">{{ currentAmountDetail.theoreticalAmountStr }}</text>
          </view>
          <view class="spec-row">
            <text class="spec-label">制作损耗率：</text>
            <text class="spec-value">{{ currentAmountDetail.lossRateStr }}</text>
          </view>
          <view class="spec-row highlight-row">
            <text class="spec-label">实际用量：</text>
            <text class="spec-value highlight-value">{{ currentAmountDetail.actualAmountStr }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 营养信息弹窗 -->
    <view v-if="showNutritionInfo" class="spec-modal" @tap="closeNutritionInfoModal">
      <view class="spec-content" @tap.stop>
        <view class="spec-header">
          <text class="spec-title">营养信息</text>
          <text class="btn-close" @tap="closeNutritionInfoModal">✕</text>
        </view>
        <view class="spec-body">
          <view class="spec-row">
            <text class="spec-label">补剂名称：</text>
            <text class="spec-value">{{ currentNutritionInfo.name }}</text>
          </view>
          <view class="spec-row">
            <text class="spec-label">添加总量：</text>
            <text class="spec-value">{{ currentNutritionInfo.amountStr }}</text>
          </view>
          <view v-if="currentNutritionInfo.targetSummary" class="spec-divider"></view>
          <view v-if="currentNutritionInfo.targetSummary" class="spec-row">
            <text class="spec-label">营养目标：</text>
            <text class="spec-value">{{ currentNutritionInfo.targetSummary }}</text>
          </view>
          <view v-if="currentNutritionInfo.nutrientTotal" class="spec-row highlight-row">
            <text class="spec-label">营养素总量：</text>
            <text class="spec-value highlight-value">{{ currentNutritionInfo.nutrientTotal }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 设备推荐列表弹窗 -->
    <view v-if="showEquipmentList" class="equipment-modal" @tap="closeEquipmentListModal">
      <view class="equipment-modal-content" @tap.stop>
        <view class="equipment-modal-header">
          <text class="equipment-modal-title">制作设备推荐</text>
          <text class="btn-close" @tap="closeEquipmentListModal">✕</text>
        </view>
        <view class="equipment-modal-body">
          <scroll-view scroll-y class="equipment-scroll">
            <view
              v-for="equipment in equipmentRecommendations"
              :key="equipment.id"
              class="equipment-detail-item"
              @tap="handleShowEquipmentDetail(equipment)"
            >
              <view class="equipment-detail-header">
                <image
                  v-if="equipment.imageUrl"
                  :src="equipment.imageUrl"
                  class="equipment-detail-image"
                  mode="aspectFill"
                />
                <view v-else class="equipment-detail-image-placeholder">
                  <text class="placeholder-text-large">{{ equipment.name.charAt(0) }}</text>
                </view>
                <view class="equipment-detail-info">
                  <text class="equipment-detail-name">{{ equipment.name }}</text>
                  <text v-if="equipment.brand" class="equipment-detail-brand">推荐品牌：{{ equipment.brand }}</text>
                  <text v-if="equipment.specification" class="equipment-detail-spec">规格：{{ equipment.specification }}</text>
                </view>
              </view>
              <view v-if="equipment.reason" class="equipment-detail-reason">
                <text class="reason-label">推荐理由：</text>
                <text class="reason-text">{{ equipment.reason }}</text>
              </view>
              <view v-if="equipment.purchaseLink" class="equipment-detail-action">
                <button
                  class="btn-purchase-equipment"
                  @tap.stop="handlePurchaseEquipment(equipment)"
                >
                  去购买
                </button>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>

    <!-- 图片预览弹窗 -->
    <ImagePreviewModal
      :visible="showImagePreview"
      :image-url="previewImageUrl"
      @update:visible="showImagePreview = $event"
      @save="handleSaveImage"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { PrintCanvasBuilder, type CanvasImageInfo } from '../../utils/print-canvas'
import {
  buildLifeStageReminderText,
  getLifeStageLabel,
  isRecipeLifeStageMatch,
  resolveDogLifeStage
} from '../../utils/life-stage-match'
import ShareButton from '../../components/ShareButton.vue'
import ImagePreviewModal from '../../components/ImagePreviewModal.vue'
import { normalizeImageUrl, getOptimizedProductImageUrl } from '../../utils/config'
import { formatSupplementAmountWithDisplayUnit } from '../../utils/diy-sheet-format'
import {
  formatSupplementTargets,
  getSupplementTargetBreakdowns
} from '../../utils/supplement-nutrients'
import {
  buildSupplementCandidateOptions,
  calculateSupplementAmountForOption,
  getSupplementSelectionKey
} from './supplement-alternatives'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
  DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL,
  DIY_SHEET_SPEC_MODAL_TITLE,
  formatFoodSelectedProductDisplayText,
  formatRecommendationActionLabel,
  formatSelectedProductDisplayText,
  getPurchaseTipByPlatform,
  getSpecRecommendedPurchaseChannelDisplay
} from './copy'
import {
  buildFallbackFoodIngredientItems,
  collectFoodIngredientIdsForRecommendations,
  getDiySheetPricePreviewWarning
} from './fallback'

// 页面参数
const recipeId = ref('')
const dogId = ref('')
const cycleDays = ref(7)
const perMealG = ref(0)
const dailyIntakeG = ref(0)

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 数据
const dog = ref<any>(null)  // 狗狗信息
const breeds = ref<any[]>([])
const recipe = ref<any>({
  id: '',
  name: '',
  coverImageUrl: '',
  nutritionStandard: '',
  designSource: '',
  applicableLifeStages: [],
  targetHealthTags: [],
  productionSteps: ''
})

const pricePreview = ref<any>(null)

// 推荐产品映射 { ingredientId: RecommendedProduct[] }
const recommendedProductsMap = ref<Record<string, any[]>>({})

// UI状态
// 规格弹窗状态
const showSpec = ref(false)
const currentSpec = ref<any>({})
const modalSelectedRpIndex = ref(0)
const modalSelectionKey = ref('')

// 用量详情弹窗状态
const showAmountDetail = ref(false)
const currentAmountDetail = ref<any>({})

// 营养信息弹窗状态
const showNutritionInfo = ref(false)
const currentNutritionInfo = ref<any>({})

// 设备推荐相关状态
const equipmentRecommendations = ref<any[]>([])
const diySheetHeaderBgImageUrl = ref('')
const showEquipmentList = ref(false)
const currentEquipmentDetail = ref<any>(null)

// 每个原料当前选中的推荐产品索引 { ingredientId: index }
const selectedRpIndexMap = ref<Record<string, number>>({})

// 图片预览弹窗状态
const showImagePreview = ref(false)
const previewImageUrl = ref('')
const isPageDataLoaded = ref(false)
const isGeneratingImage = ref(false)
const showWarning = ref(true)
const pricePreviewWarning = ref('')

const PRINT_CANVAS_LOGICAL_WIDTH = 1200
const PRINT_CANVAS_LOGICAL_HEIGHT = 1697
const PRINT_CANVAS_OUTPUT_SCALE = 2
const PRINT_CANVAS_OUTPUT_WIDTH = PRINT_CANVAS_LOGICAL_WIDTH * PRINT_CANVAS_OUTPUT_SCALE
const PRINT_CANVAS_OUTPUT_HEIGHT = PRINT_CANVAS_LOGICAL_HEIGHT * PRINT_CANVAS_OUTPUT_SCALE
const printCanvasStyle = computed(() => ({
  width: `${PRINT_CANVAS_OUTPUT_WIDTH}px`,
  height: `${PRINT_CANVAS_OUTPUT_HEIGHT}px`
}))

// 全局配置中的补剂损耗率（默认5%）
const globalSupplementLossRate = ref(0.05)
const totalFoodNetWeightG = computed(() => dailyIntakeG.value * cycleDays.value)

const ingredientDetails = computed(() => {
  return pricePreview.value?.pricingBreakdown?.ingredientDetails || []
})

const foodSourceItems = computed(() => {
  const pricedFoodItems = ingredientDetails.value.filter((item: any) => item.type === 'FOOD')
  if (pricedFoodItems.length > 0) {
    return pricedFoodItems
  }

  return buildFallbackFoodIngredientItems(recipe.value.items || [], totalFoodNetWeightG.value)
})

// 计算采购清单数据
const purchaseListData = computed(() => {
  if (foodSourceItems.value.length === 0 && ingredientDetails.value.length === 0) {
    return []
  }

  return [
    ...foodSourceItems.value.map((item: any) => buildPurchaseListItem(item)),
    ...ingredientDetails.value
      .filter((item: any) => item.type === 'SUPPLEMENT')
      .map((item: any) => buildPurchaseListItem(item))
  ]
})

// 分类：食材类
const foodItems = computed(() => {
  return purchaseListData.value.filter((item: any) => item.type === 'FOOD')
})

// 分类：补剂类
const supplementItems = computed(() => {
  return purchaseListData.value.filter((item: any) => item.type === 'SUPPLEMENT')
})

// 食材类合计
const foodItemsTotal = computed(() => {
  const totalTheoretical = foodItems.value.reduce((sum: number, item: any) => sum + item.theoreticalAmount, 0)
  const totalActual = foodItems.value.reduce((sum: number, item: any) => sum + item.actualAmount, 0)
  return {
    theoreticalAmount: totalTheoretical,
    actualAmount: totalActual,
    theoreticalAmountStr: formatAmount(totalTheoretical, true),
    actualAmountStr: formatAmount(totalActual, true)
  }
})

const supplementNutrientBaseWeightG = computed(() => {
  return foodItemsTotal.value.theoreticalAmount || totalFoodNetWeightG.value
})

const selectedDogLifeStage = computed(() => resolveDogLifeStage(dog.value, breeds.value))

const isLifeStageMatch = computed(() => {
  return isRecipeLifeStageMatch(recipe.value.applicableLifeStages || [], selectedDogLifeStage.value)
})

const lifeStageReminderText = computed(() => buildLifeStageReminderText({
  applicableStages: recipe.value.applicableLifeStages || [],
  dogLifeStage: selectedDogLifeStage.value,
  dogName: dog.value?.name,
}))

// 格式化狗狗年龄
const dogAgeText = computed(() => {
  if (!dog.value) return '-'
  const birthday = new Date(dog.value.birthday)
  const today = new Date()
  const ageInMonths = Math.floor((today.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24 * 30))

  if (ageInMonths < 12) {
    return `${ageInMonths}个月`
  } else {
    const years = Math.floor(ageInMonths / 12)
    const months = ageInMonths % 12
    return months > 0 ? `${years}岁${months}个月` : `${years}岁`
  }
})

const foodItemsDetailed = computed(() => {
  return foodSourceItems.value
    .map((item: any) => {
      const base = buildPurchaseListItem(item)
      const rps = recommendedProductsMap.value[item.ingredientId] || []
      const selectedRpIndex = selectedRpIndexMap.value[item.ingredientId] ?? 0
      const selectedRp = rps[selectedRpIndex] || rps[0]
      const selectedProductDisplayText = formatFoodSelectedProductDisplayText(selectedRp, item)
      const purchaseLink = selectedRp?.purchaseLink || undefined
      const hasSpecDetail = hasRecommendationDetail(selectedRp, {}, purchaseLink)

      return {
        ...base,
        selectionKey: item.ingredientId,
        ingredientId: item.ingredientId,
        ingredientName: item.name,
        name: selectedRp?.name || item.name,
        brand: selectedRp?.brand || '-',
        productModel: selectedRp?.productModel,
        purchaseChannel: selectedRp?.purchaseChannel,
        imageUrl: selectedRp?.imageUrl,
        purchaseLink,
        selectedProductDisplayText,
        choiceLabel: formatRecommendationActionLabel(rps.length),
        recommendedPrintText: selectedProductDisplayText,
        allRecommendedProducts: rps,
        hasSpecDetail
      }
    })
})

// 补剂类详细数据（用于需额外补充的营养表格）
const supplementItemsDetailed = computed(() => {
  if (ingredientDetails.value.length === 0) {
    return []
  }

  // 直接使用API返回的补剂数据
  const allItems = ingredientDetails.value
  const supplementItems = allItems.filter((item: any) => item.type === 'SUPPLEMENT')

  return supplementItems.map((item: any) => {
    const recipeItem = (recipe.value.items || []).find((candidate: any) => {
      if (item.recipeItemId && candidate.id === item.recipeItemId) {
        return true
      }
      return candidate.ingredientId === item.ingredientId
    })
    const supplementOptions = buildSupplementCandidateOptions(item, recipeItem)
    const selectionKey = getSupplementSelectionKey(item)
    const rpIdx = selectedRpIndexMap.value[selectionKey] ?? 0
    const hasRecommendedOptions = supplementOptions.length > 0
    const selectedRp = hasRecommendedOptions
      ? (supplementOptions[rpIdx] || supplementOptions[0])
      : undefined
    const selectedProductDisplayText = formatSelectedProductDisplayText(selectedRp || item, item.name)

    // 使用displayUnit作为显示单位
    const displayUnit = selectedRp?.displayUnit || item.displayUnit || item.unit || 'g'

    // 只用开启 DIY 推荐的补剂生成用户可见购买链接和详情
    const purchaseLink = hasRecommendedOptions ? selectedRp?.purchaseLink : undefined
    const hasSpecDetail = hasRecommendedOptions
      ? hasRecommendationDetail(selectedRp, {}, purchaseLink)
      : false

    const amount = calculateSupplementAmountForOption(
      item,
      selectedRp,
      supplementNutrientBaseWeightG.value
    )

    return {
      selectionKey,
      name: selectedRp?.name || item.name,                          // 推荐营养品
      brand: hasRecommendedOptions ? (selectedRp?.brand || '-') : '-', // 推荐品牌
      preparationMethod: selectedRp?.timingLabel || item.preparationMethod || '', // 添加时机
      amount: amount,                                               // 用量数值
      unit: item.unit,                                              // 原始单位（用于计算）
      displayUnit: displayUnit,                                     // 显示单位（用于展示）
      amountStr: formatSupplementAmountWithDisplayUnit(amount, item.unit, displayUnit),  // 格式化用量
      productModel: hasRecommendedOptions ? selectedRp?.productModel : undefined, // 规格
      purchaseChannel: hasRecommendedOptions ? selectedRp?.purchaseChannel : undefined, // 购买渠道
      imageUrl: hasRecommendedOptions ? selectedRp?.imageUrl : undefined,
      purchaseLink: purchaseLink,                                   // 购买链接
      ingredientId: item.ingredientId,                              // 原料ID
      nutrientTargetKey: item.nutrientTargetKey,                    // 营养素名称
      nutrientTargetValue: item.nutrientTargetValue,                // 营养目标值
      supplementTargets: item.supplementTargets || item.supplement_targets || recipeItem?.supplementTargets || recipeItem?.supplement_targets || [],
      nutritionProfile: selectedRp?.nutritionProfile || item.nutritionProfile || item.nutrition_profile_snapshot || item.ingredient?.nutritionProfile,
      activeNutrients:
        selectedRp?.activeNutrients ||
        selectedRp?.properties?.active_nutrients ||
        item.activeNutrients ||
        item.properties?.active_nutrients,
      nutrition_profile_snapshot: selectedRp?.nutritionProfile || item.nutrition_profile_snapshot,
      type: item.type,                                              // 类型标识
      properties: {
        ...(item.properties || {}),
        ...((selectedRp?.activeNutrients || selectedRp?.properties?.active_nutrients)
          ? {
              active_nutrients:
                selectedRp?.activeNutrients || selectedRp?.properties?.active_nutrients
            }
          : {})
      },                                                            // 完整的properties
      selectedProductDisplayText,                                   // 已选商品入口文案
      choiceLabel: formatRecommendationActionLabel(supplementOptions.length), // 候选数量提示
      recommendedSpecPrintText: selectedProductDisplayText,
      hasSpecDetail,                                                // 是否有规格/购买信息
      allRecommendedProducts: supplementOptions,                    // 所有候选补剂
      selectedRPIndex: 0                                            // 当前选中的推荐产品索引
    }
  })
})

// 格式化用量显示
function formatAmount(amount: number, isFood: boolean): string {
  if (isFood) {
    // 食材类：整数
    return `${Math.round(amount)}g`
  } else {
    // 补剂类：保留1位小数
    return `${amount.toFixed(1)}g`
  }
}

function formatFoodPrepAmountForPrint(amount: number): string {
  return `${amount.toFixed(1)}g`
}

function formatFoodPrepTotalForPrint(amount: number): string {
  return `${amount.toFixed(1)}g`
}

function formatRecipeLossRatePercent(): string {
  const percent = getRecipeLossRate() * 100
  return Number.isInteger(percent) ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`
}

function getFoodPrepAmountHeaderForPrint(): string {
  return `备料量（含${formatRecipeLossRatePercent()}损耗）`
}

function formatSupplementTargetForPrint(item: any): string {
  return formatSupplementTargets(item) || '-'
}

// 格式化补剂用量显示（参考订购成品页，保留用于向后兼容）
function formatSupplementAmount(amount: number, unit?: string): string {
  if (unit === 'kg') {
    return `${(amount * 1000).toFixed(1)}g`
  }
  if (unit === 'g') {
    return `${amount.toFixed(1)}g`
  }
  if (unit === 'mg') {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}g`
    }
    return `${amount.toFixed(1)}mg`
  }
  return `${amount}${unit || 'g'}`
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  console.log('[DIYSheet] 页面参数:', options)

  recipeId.value = options.recipeId || ''
  dogId.value = options.dogId || ''
  cycleDays.value = parseInt(options.cycleDays || '7')
  perMealG.value = parseFloat(options.perMealG || '0')
  dailyIntakeG.value = parseFloat(options.dailyIntakeG || '0')

  if (recipeId.value && dogId.value) {
    loadData()
  } else {
    uni.showToast({
      title: '参数错误',
      icon: 'none'
    })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  }
})

async function loadData() {
  isPageDataLoaded.value = false

  try {
    // 先加载健康标签映射
    await loadHealthTagMapping()

    // 并行加载食谱详情、价格预览、狗狗信息和设备推荐
    await Promise.all([
      loadRecipe(),
      loadBreeds(),
      loadPricePreview(),
      loadDog(),
      loadEquipmentRecommendations()
    ])

    // 价格预览加载完成后，加载推荐产品（需要 ingredientIds）
    await loadRecommendedProducts()

    // 自动保存制作单（用于评价权限验证），静默失败
    autoSaveDiySheet()
  } catch (error) {
    console.error('[DIYSheet] Load data error:', error)
  } finally {
    isPageDataLoaded.value = true
  }
}

/**
 * 自动保存制作单到数据库（用于评价权限验证）
 * 幂等操作：后端会检查是否已存在相同的 user+recipe+dog 组合
 */
async function autoSaveDiySheet() {
  try {
    await request({
      url: '/user/diy-sheets',
      method: 'POST',
      data: {
        recipeId: recipeId.value,
        recipeName: recipe.value.name,
        dogId: dogId.value,
        cycleDays: cycleDays.value,
        perMealG: perMealG.value,
        dailyIntakeG: dailyIntakeG.value,
        purchaseList: purchaseListData.value,
        productionSteps: recipe.value.productionSteps
      }
    })
  } catch {
    // 静默失败，不影响页面显示
  }
}

async function loadRecipe() {
  try {
    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      recipe.value = res.data
      console.log('[DIYSheet] 食谱加载成功:', res.data)
    }
  } catch (error) {
    console.error('[DIYSheet] Load recipe error:', error)
    uni.showToast({
      title: '加载食谱失败',
      icon: 'none'
    })
  }
}

async function loadBreeds() {
  try {
    const res = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })

    if (res.code === 0 && Array.isArray(res.data)) {
      breeds.value = res.data
    }
  } catch (error) {
    console.error('[DIYSheet] Load breeds error:', error)
  }
}

async function loadHealthTagMapping() {
  try {
    const res = await request({
      url: '/recipes/filter-options',
      method: 'GET'
    })
    if (res.code === 0 && res.data?.healthTags) {
      const uuidMap: Record<string, string> = {}
      if (Array.isArray(res.data.healthTags)) {
        res.data.healthTags.forEach((tag: any) => {
          if (tag.value && tag.label) {
            uuidMap[tag.value] = tag.label
          }
        })
      }
      healthTagUuidLabelMap.value = uuidMap
    }
  } catch (error) {
    console.error('[DIYSheet] Load health tag mapping error:', error)
  }
}

async function loadDog() {
  console.log('[DIYSheet] 开始加载狗狗信息, dogId:', dogId.value)

  try {
    const res = await request({
      url: `/dogs/${dogId.value}`,
      method: 'GET'
    })

    console.log('[DIYSheet] 狗狗API响应:', res)

    if (res.code === 0 && res.data) {
      dog.value = res.data.profile
      console.log('[DIYSheet] 狗狗信息加载成功:', res.data.profile)
      console.log('[DIYSheet] 狗狗字段检查:', res.data.profile)
    } else {
      console.error('[DIYSheet] API返回错误:', res)
    }
  } catch (error) {
    console.error('[DIYSheet] Load dog error:', error)
  }
}

async function loadPricePreview() {
  try {
    // 计算总重量和包装规格
    const totalG = dailyIntakeG.value * cycleDays.value
    const pkgSpecG = perMealG.value
    const pkgCount = Math.round(totalG / pkgSpecG)

    const res = await request({
      url: '/orders/pricing/preview',
      method: 'POST',
      data: {
        dogId: dogId.value,
        type: 'FRESH_FOOD',
        pricingPurpose: 'DIY_SHEET',
        items: [{
          recipeId: recipeId.value,
          quantityG: totalG,
          packageCount: pkgCount,
          packageSpecG: pkgSpecG,
          cycleDays: cycleDays.value,
          dailyIntakeG: dailyIntakeG.value
        }]
      }
    })

    if (res.code === 0 && res.data) {
      pricePreview.value = res.data
      pricePreviewWarning.value = ''
      console.log('[DIYSheet] 价格预览加载成功')
    }
  } catch (error) {
    pricePreview.value = null
    pricePreviewWarning.value = getDiySheetPricePreviewWarning(error)
    console.error('[DIYSheet] Load price preview error:', error)
    // 不显示错误提示，因为采购清单可以降级处理
  }
}

async function loadRecommendedProducts() {
  try {
    const uniqueIngredientIds = collectFoodIngredientIdsForRecommendations(
      pricePreview.value,
      recipe.value.items || []
    )

    if (uniqueIngredientIds.length === 0) return

    const res = await request({
      url: `/recommended-products?ingredientIds=${uniqueIngredientIds.join(',')}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      recommendedProductsMap.value = res.data
    }
  } catch (error) {
    console.error('[DIYSheet] Load recommended products error:', error)
    // 推荐产品加载失败不影响主流程
  }
}

async function loadEquipmentRecommendations() {
  try {
    const res = await request({
      url: '/global-config',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      diySheetHeaderBgImageUrl.value = normalizeImageUrl(res.data.diySheetHeaderBgImageUrl)

      // 获取设备推荐
      if (res.data.equipmentRecommendations) {
        equipmentRecommendations.value = res.data.equipmentRecommendations
        console.log('[DIYSheet] 设备推荐加载成功:', equipmentRecommendations.value)
      } else {
        // 如果没有配置设备推荐，使用默认列表
        equipmentRecommendations.value = [
          { id: 'meat-grinder', name: '绞肉机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'blender', name: '搅拌机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'grinder', name: '研磨机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'vacuum-sealer', name: '真空机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'vacuum-bag', name: '真空袋', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
        ]
      }

      // 获取补剂损耗率（后端存储1.05表示5%损耗，需要减1）
      if (res.data.supplementLossRate) {
        globalSupplementLossRate.value = res.data.supplementLossRate - 1
        console.log('[DIYSheet] 补剂损耗率加载成功:', globalSupplementLossRate.value)
      }
    }
  } catch (error) {
    console.error('[DIYSheet] Load equipment recommendations error:', error)
    diySheetHeaderBgImageUrl.value = ''
    // 出错时使用默认列表
    equipmentRecommendations.value = [
      { id: 'meat-grinder', name: '绞肉机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'blender', name: '搅拌机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'grinder', name: '研磨机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'vacuum-sealer', name: '真空机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'vacuum-bag', name: '真空袋', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
    ]
  }
}

function resolveCanvasImageInfo(imageUrl: string): Promise<CanvasImageInfo | undefined> {
  if (!imageUrl) {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    uni.getImageInfo({
      src: imageUrl,
      success: (info) => {
        resolve({
          path: info.path || imageUrl,
          width: info.width,
          height: info.height
        })
      },
      fail: (error) => {
        console.warn('[DIYSheet] 制作单头部背景图加载失败，使用默认背景:', error)
        resolve(undefined)
      }
    })
  })
}

// 打印制作单
async function handlePrint() {
  if (isGeneratingImage.value) {
    return
  }

  if (!isPageDataLoaded.value || !recipe.value.name || !dog.value) {
    uni.showToast({
      title: '制作单加载中',
      icon: 'none'
    })
    return
  }

  isGeneratingImage.value = true
  uni.showLoading({ title: '生成中...' })

  try {
    // 1. 创建Canvas构建器（A4纸规格按2倍像素渲染，提升保存后放大清晰度）
    const canvasWidth = PRINT_CANVAS_LOGICAL_WIDTH
    const canvasHeight = PRINT_CANVAS_LOGICAL_HEIGHT

    console.log('[DIYSheet] 开始生成制作单图片:', {
      width: canvasWidth,
      height: canvasHeight,
      outputScale: PRINT_CANVAS_OUTPUT_SCALE,
      outputSize: `${PRINT_CANVAS_OUTPUT_WIDTH}x${PRINT_CANVAS_OUTPUT_HEIGHT}`,
      orientation: canvasHeight > canvasWidth ? '竖版(Portrait)' : '横版(Landscape)'
    })

    const builder = new PrintCanvasBuilder({
      canvasId: 'printCanvas',
      width: canvasWidth,
      height: canvasHeight,
      outputScale: PRINT_CANVAS_OUTPUT_SCALE
    })
    const headerBackground = await resolveCanvasImageInfo(diySheetHeaderBgImageUrl.value)

    // 2. 绘制分享图品牌头部
    builder.drawBrandHeader({
      brand: 'Seven的厨房',
      logoPath: '/static/logo.png',
      avatarPath: dog.value?.avatarUrl ? normalizeImageUrl(dog.value.avatarUrl) : undefined,
      backgroundImage: headerBackground,
      title: recipe.value.name,
      subtitle: dog.value ? `${dog.value.name} 的 ${cycleDays.value} 天鲜食计划` : `${cycleDays.value} 天鲜食计划`,
      stages: recipe.value.applicableLifeStages.map(getLifeStageLabel)
    })

    // 3. 绘制狗狗信息和制作参数合并卡片（8个字段）
    if (dog.value) {
      builder.drawShareSummaryCards({
        dogInfo: `${dogAgeText.value}  /  ${dog.value.currentWeightKg}kg  /  ${dog.value.mealsPerDay}餐/天`,
        dogSub: `专为 ${dog.value.name} 生成`,
        cycle: `${cycleDays.value}天`,
        cycleSub: `每日 ${dailyIntakeG.value}g，每餐 ${perMealG.value}g`,
        packagePlan: `${perMealG.value}g × ${cycleDays.value * dog.value.mealsPerDay}份`,
        packageSub: '每餐一份',
        formulaStandard: getNutritionStandardLabel(recipe.value.nutritionStandard),
        formulaSource: recipe.value.designSource
      })
    }

    // 4. 绘制食材清单表格
    if (foodItemsDetailed.value.length > 0) {
      builder.drawSectionTitle('食材清单')

      const foodRows = foodItemsDetailed.value.map(item => [
        item.ingredientName,
        item.recommendedPrintText,
        formatFoodPrepAmountForPrint(item.actualAmount),
        item.preparationMethod || '-'
      ])

      builder.drawTable(
        ['原料名称', '已选商品', getFoodPrepAmountHeaderForPrint(), '制备方法'],
        foodRows,
        {
          totalRow: ['备料合计', '-', formatFoodPrepTotalForPrint(foodItemsTotal.value.actualAmount), '-'],
          colWidths: [210, 300, 210, 400],
          wrapColumns: [true, true, false, true]
        }
      )
    }

    // 5. 绘制补剂清单表格
    if (supplementItemsDetailed.value.length > 0) {
      builder.drawSectionTitle('营养补充剂')

      const supplementRows = supplementItemsDetailed.value.map(item => [
        item.name,
        item.recommendedSpecPrintText,
        item.amountStr,
        formatSupplementTargetForPrint(item)
      ])

      builder.drawTable(
        ['补剂名称', '已选商品 / 规格', '添加总量', '目标补充量'],
        supplementRows,
        {
          colWidths: [180, 520, 170, 250],
          wrapColumns: [false, true, false, false]
        }
      )

      builder.drawSupplementNotice(
        '营养补充剂的添加总量与已选商品严格匹配。由于不同营养补剂营养浓度不同，如果要选择其它产品，须按目标补充量自行换算添加总量。'
      )
    }

    // 6. 绘制制作流程
    if (recipe.value.productionSteps) {
      builder.drawSectionTitle('制作流程')
      builder.drawProductionSteps(recipe.value.productionSteps)
    }

    // 7. 绘制提示卡片（3个横向排列）
    builder.drawImportantTipsSection([
      {
        title: '烹饪建议',
        content: ['建议蒸、炖、低温慢煮', '不建议微波、烤、煎等高温烹饪']
      },
      {
        title: '分装建议',
        content: ['建议使用食品真空袋', '抽真空保存']
      },
      {
        title: '储存&保质期',
        content: ['-18℃冷冻保存6个月', '0-4℃冷藏保存3天', '开封后3小时内吃完']
      }
    ])

    // 10. 绘制页脚
    const dateStr = new Date().toLocaleDateString('zh-CN')
    builder.drawFooter(`Seven厨房 | ${dateStr}`)

    // 11. 导出为图片
    const imagePath = await builder.toImage()

    console.log('[DIYSheet] 图片生成成功:', {
      path: imagePath,
      expectedSize: `${canvasWidth}x${canvasHeight}`,
      orientation: canvasHeight > canvasWidth ? '竖版' : '横版'
    })

    safeHideLoading()

    // 12. 显示图片预览弹窗
    previewImageUrl.value = imagePath
    showImagePreview.value = true
  } catch (error) {
    console.error('[DIYSheet] 生成图片失败:', error)
    safeHideLoading()
    uni.showToast({
      title: '生成失败',
      icon: 'none'
    })
  } finally {
    isGeneratingImage.value = false
  }
}

function safeHideLoading() {
  try {
    uni.hideLoading({
      fail: () => {}
    } as any)
  } catch {
    // 真机上 loading 可能已经被页面切换或 toast 自动清理，忽略即可。
  }
}

// 处理保存图片到相册
function handleSaveImage() {
  if (!previewImageUrl.value) {
    uni.showToast({
      title: '图片未生成',
      icon: 'none'
    })
    return
  }

  saveImageToPhotosAlbum(previewImageUrl.value)
}

// 保存图片到相册
function saveImageToPhotosAlbum(filePath: string) {
  uni.saveImageToPhotosAlbum({
    filePath,
    success: () => {
      uni.showToast({
        title: '已保存到相册',
        icon: 'success'
      })
    },
    fail: (err) => {
      console.error('[DIYSheet] 保存到相册失败:', err)

      // 如果用户拒绝授权，引导用户开启权限
      if (err.errMsg.includes('auth')) {
        uni.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限，以便保存制作单图片',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              uni.openSetting()
            }
          }
        })
      } else {
        uni.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    }
  })
}

// 保存制作单
async function handleSave() {
  uni.showLoading({ title: '保存中...' })

  try {
    // 收集数据
    const sheetData = {
      recipeId: recipeId.value,
      recipeName: recipe.value.name,
      dogId: dogId.value,
      cycleDays: cycleDays.value,
      perMealG: perMealG.value,
      dailyIntakeG: dailyIntakeG.value,
      purchaseList: purchaseListData.value,
      productionSteps: recipe.value.productionSteps
    }

    // 调用保存API
    const res = await request({
      url: '/user/diy-sheets',
      method: 'POST',
      data: sheetData
    })

    uni.hideLoading()

    if (res.code === 0) {
      uni.showToast({
        title: '保存成功',
        icon: 'success'
      })
    } else {
      uni.showToast({
        title: res.message || '保存失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('[DIYSheet] Save error:', error)
    uni.hideLoading()
    uni.showToast({
      title: '保存失败',
      icon: 'none'
    })
  }
}

// 分享配置
const sharePath = computed(() => {
  return `/pages/diy-sheet/index?recipeId=${recipeId.value}&dogId=${dogId.value}&cycleDays=${cycleDays.value}&perMealG=${perMealG.value}&dailyIntakeG=${dailyIntakeG.value}`
})

const shareTitle = computed(() => {
  return `【DIY制作单】${recipe.value.name} - ${dog.value?.name || '宠物'}专属`
})

// 规格弹窗控制
function showSpecModal(item: any) {
  currentSpec.value = item
  modalSelectionKey.value = item.selectionKey || item.ingredientId || ''
  modalSelectedRpIndex.value = selectedRpIndexMap.value[modalSelectionKey.value] ?? 0
  showSpec.value = true
}

function closeSpecModal() {
  showSpec.value = false
  currentSpec.value = {}
  modalSelectionKey.value = ''
  modalSelectedRpIndex.value = 0
}

function getSpecPurchaseChannelDisplay(target: any): string {
  return getSpecRecommendedPurchaseChannelDisplay({
    ingredientType: currentSpec.value?.type,
    purchaseLink: target?.purchaseLink,
    purchaseChannel: target?.purchaseChannel
  })
}

// 显示用量详情弹窗
function showAmountDetailModal(item: any) {
  currentAmountDetail.value = item
  showAmountDetail.value = true
}

function closeAmountDetailModal() {
  showAmountDetail.value = false
}

// 显示营养信息弹窗
function showNutritionInfoModal(item: any) {
  const targetSummary = formatSupplementTargets(item)
  const nutrientTotal = getSupplementTargetBreakdowns(
    item,
    supplementNutrientBaseWeightG.value
  )
    .map((breakdown) => `${Number(breakdown.totalNutrientNeeded.toFixed(2))}${breakdown.target.unit}${breakdown.target.label}`)
    .join('、')

  // 将计算的营养素总量和单位添加到item中
  currentNutritionInfo.value = {
    ...item,
    targetSummary,
    nutrientTotal
  }

  showNutritionInfo.value = true
}

function closeNutritionInfoModal() {
  showNutritionInfo.value = false
}

function dismissWarning() {
  showWarning.value = false
}

// 选择推荐产品（在弹窗中切换）
function selectRecommendedProduct(ingredientId: string, rpIndex: number | string) {
  modalSelectionKey.value = ingredientId
  modalSelectedRpIndex.value = Number(rpIndex)
}

function confirmRecommendedProductSelection() {
  if (!modalSelectionKey.value) {
    closeSpecModal()
    return
  }

  selectedRpIndexMap.value[modalSelectionKey.value] = modalSelectedRpIndex.value
  closeSpecModal()
}

// 从链接判断平台类型
function detectPlatformFromUrl(url: string): string {
  if (url.includes('taobao') || url.includes('tmall') || url.includes('tb.cn') || url.includes('m.tb.cn')) {
    return 'TAOBAO'
  }
  if (url.includes('jd.com') || url.includes('jd.hk')) {
    return 'JD'
  }
  if (url.includes('pinduoduo') || url.includes('yangkeduo') || url.includes('pdd')) {
    return 'PINDUODUO'
  }
  if (url.includes('iherb.com') || url.includes('iherb.cn')) {
    return 'IHERB'
  }
  return 'OTHER'
}

// 处理购买链接 - 复制到剪贴板
function handlePurchase(purchaseLink: any, productName: string) {
  if (!purchaseLink) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  const { url, platform } = purchaseLink

  if (!url) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  // 复制链接到剪贴板
  uni.setClipboardData({
    data: url,
    success: () => {
      const tip = getPurchaseTipByPlatform(platform)
      uni.showModal({
        title: productName,
        content: tip,
        showCancel: false,
        confirmText: '知道了'
      })
    },
    fail: (err) => {
      console.error('[DIYSheet] 复制失败:', err)
      uni.showToast({
        title: '复制失败，请重试',
        icon: 'none'
      })
    }
  })
}

function getRecipeLossRate(): number {
  return recipe.value?.productionLossRate ? recipe.value.productionLossRate - 1 : 0.07
}

function buildPurchaseListItem(item: any) {
  const isFood = item.type === 'FOOD'
  const lossRate = isFood ? getRecipeLossRate() : globalSupplementLossRate.value
  const theoreticalAmount = (item.netAmount ?? item.amount) * 1000
  const actualAmount = theoreticalAmount * (1 + lossRate)

  return {
    name: item.name,
    type: item.type,
    theoreticalAmount,
    actualAmount,
    lossRate,
    displayUnit: item.displayUnit || item.unit || 'g',
    preparationMethod: item.preparationMethod || null,
    theoreticalAmountStr: formatAmount(theoreticalAmount, isFood),
    actualAmountStr: formatAmount(actualAmount, isFood),
    lossRateStr: `${(lossRate * 100).toFixed(0)}%`,
    calculationProcess: isFood
      ? `理论用量 ${formatAmount(theoreticalAmount, false)} × (1 + ${(lossRate * 100).toFixed(0)}%损耗率) = 实际用量 ${formatAmount(actualAmount, false)}`
      : `营养需求 ${theoreticalAmount.toFixed(2)}mg ÷ 浓度 × (1 + ${(lossRate * 100).toFixed(0)}%损耗率) = 实际用量 ${formatAmount(actualAmount, false)}`
  }
}

function hasRecommendationDetail(selectedRp: any, item: any, purchaseLink: any): boolean {
  return !!(
    selectedRp ||
    item.imageUrl ||
    item.properties?.image_url ||
    item.brand ||
    item.productModel ||
    item.purchaseChannel ||
    purchaseLink
  )
}

function getAmountDetailName(item: any): string {
  if (!item) return '-'
  return item.type === 'FOOD' ? (item.ingredientName || item.name || '-') : (item.name || '-')
}

function getAmountDetailNameLabel(item: any): string {
  return item?.type === 'SUPPLEMENT' ? '补剂名称：' : '原料名称：'
}

function getHealthTagLabel(tagOrUuid: string): string {
  // 优先使用动态映射（UUID -> label）
  if (healthTagUuidLabelMap.value[tagOrUuid]) {
    return healthTagUuidLabelMap.value[tagOrUuid]
  }

  // 兼容旧的枚举值（用于向后兼容）
  const map: Record<string, string> = {
    'HEALTHY': '健康',
    'PICKY_EATER': '挑食',
    'SENSITIVE_STOMACH': '敏感胃',
    'PANCREATITIS_SUPPORT': '胰腺炎友好',
    'LOW_FAT': '低脂',
    'SKIN_COAT_CARE': '护肤',
  }

  if (map[tagOrUuid]) {
    return map[tagOrUuid]
  }

  return tagOrUuid
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'AAFCO_2021': 'AAFCO 2021',
    'NRC_2006': 'NRC 2006',
  }
  return map[standard] || standard
}

// 设备推荐相关处理函数
function handleShowEquipmentList() {
  console.log('[DIYSheet] 显示设备推荐列表')
  showEquipmentList.value = true
}

function closeEquipmentListModal() {
  showEquipmentList.value = false
}

function handleShowEquipmentDetail(equipment: any) {
  console.log('[DIYSheet] 显示设备详情:', equipment)
  currentEquipmentDetail.value = equipment
  // 可以在这里显示单个设备的详情弹窗
  // 目前直接处理购买
  if (equipment.purchaseLink) {
    handlePurchaseEquipment(equipment)
  }
}

function handlePurchaseEquipment(equipment: any) {
  console.log('[DIYSheet] 购买设备:', equipment)

  const purchaseLink = equipment.purchaseLink
  if (!purchaseLink) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  // 从链接判断平台类型
  const platform = detectPlatformFromUrl(purchaseLink)

  // 复制链接到剪贴板
  uni.setClipboardData({
    data: purchaseLink,
    success: () => {
      console.log('[DIYSheet] 设备购买链接复制成功:', purchaseLink)
      const tip = getPurchaseTipByPlatform(platform)
      uni.showModal({
        title: equipment.name,
        content: tip,
        showCancel: false,
        confirmText: '知道了'
      })
    },
    fail: (err) => {
      console.error('[DIYSheet] 复制失败:', err)
      uni.showToast({
        title: '复制失败，请重试',
        icon: 'none'
      })
    }
  })
}

// 微信小程序分享配置
// 分享给朋友
onShareAppMessage(() => {
  return {
    title: shareTitle.value,
    path: sharePath.value,
    imageUrl: normalizeImageUrl(recipe.value.coverImageUrl) || '',
    success: () => {
      console.log('[DIYSheet] 分享成功')
    },
    fail: (err) => {
      console.error('[DIYSheet] 分享失败:', err)
    }
  }
})

// 分享到朋友圈
onShareTimeline(() => {
  return {
    title: shareTitle.value,
    query: `recipeId=${recipeId.value}&dogId=${dogId.value}&cycleDays=${cycleDays.value}&perMealG=${perMealG.value}&dailyIntakeG=${dailyIntakeG.value}`,
    imageUrl: normalizeImageUrl(recipe.value.coverImageUrl) || ''
  }
})
</script>

<style scoped>
.diy-sheet-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 180rpx;
}

.section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
  cursor: pointer;
  user-select: none;
}

.title-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

/* 食谱信息卡片 */
.recipe-info-section {
  padding: 0;
  overflow: hidden;
}

.recipe-cover-wrapper {
  width: 100%;
  height: 400rpx;
  position: relative;
}

.recipe-cover {
  width: 100%;
  height: 100%;
}

.recipe-cover-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 36rpx;
  color: #fff;
  font-weight: bold;
}

.recipe-details {
  padding: 32rpx 24rpx;
}

.recipe-name {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 20rpx;
  text-align: center;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  justify-content: center;
  margin-bottom: 24rpx;
}

.tag {
  padding: 8rpx 20rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
}

.life-stage-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.health-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

.nutrition-summary {
  display: flex;
  justify-content: space-around;
  gap: 20rpx;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  margin-top: 16rpx;
}

.nutrition-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #999;
}

.nutrition-item .value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.warning-card {
  margin: 20rpx 24rpx;
  padding: 24rpx;
  background-color: #fff7e6;
  border: 1rpx solid #ffd591;
  border-radius: 12rpx;
}

.warning-header {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.warning-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #d46b08;
}

.warning-text {
  display: block;
  font-size: 26rpx;
  color: #8c5a00;
  line-height: 1.6;
  margin-bottom: 16rpx;
}

.btn-continue {
  height: 64rpx;
  line-height: 64rpx;
  background-color: #faad14;
  color: #fff;
  border-radius: 8rpx;
  font-size: 26rpx;
  border: none;
}

/* 采购清单 */
.purchase-list-content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

/* 狗狗信息 */
.dog-info-summary {
  padding: 16rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
  border-left: 4rpx solid #1890ff;
}

/* 制作信息 */
.making-info-summary {
  padding: 16rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
  border-left: 4rpx solid #1890ff;
}

.preview-warning-summary {
  padding: 16rpx 18rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  border-left: 4rpx solid #faad14;
}

.preview-warning-text {
  display: block;
  font-size: 25rpx;
  color: #ad6800;
  line-height: 1.5;
}

.info-text {
  display: block;
  font-size: 26rpx;
  color: #333;
  line-height: 1.5;
}

.secondary-info-text {
  margin-top: 6rpx;
  color: #666;
}

.ingredient-group {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.ingredient-category-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  padding: 12rpx 0;
}

.ingredient-table {
  display: flex;
  flex-direction: column;
  border: 1rpx solid #e8e8e8;
  border-radius: 8rpx;
  overflow: hidden;
}

.table-header,
.table-row {
  display: flex;
  padding: 16rpx 12rpx;
}

.table-header {
  background-color: #fafafa;
  border-bottom: 1rpx solid #e8e8e8;
}

.table-row {
  border-bottom: 1rpx solid #f0f0f0;
}

.table-row:last-child {
  border-bottom: none;
}

/* 合计行样式 */
.total-row {
  background-color: #fff7e6;
  border-top: 2rpx solid #ffd591;
  font-weight: bold;
}

.total-label {
  color: #333;
  font-weight: bold;
}

.total-value {
  color: #ff4d4f;
  font-weight: bold;
}

.header-item,
.row-item {
  font-size: 24rpx;
  display: flex;
  align-items: center;
}

.header-item {
  font-weight: bold;
  color: #666;
}

.row-item {
  color: #333;
}

.name-col {
  flex: 1;
  justify-content: center;
  text-align: center;
  padding-left: 24rpx;
}

.recommend-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.method-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.actual-col {
  flex: 1;
  justify-content: center;
  text-align: center;
  padding-right: 24rpx;
}

.row-item.highlight {
  color: #1890ff;
  font-weight: bold;
}

/* 可点击的用量链接 */
.amount-link {
  text-decoration: underline;
  cursor: pointer;
}

.food-table .name-col,
.food-table .recommend-col,
.food-table .method-col,
.food-table .actual-col {
  padding: 0 8rpx;
}

.food-table .name-col {
  flex: 0.95;
}

.food-table .recommend-col {
  flex: 1.15;
  font-size: 22rpx;
  line-height: 1.4;
  word-break: break-word;
}

.food-table .method-col {
  flex: 1.6;
}

.food-table .actual-col {
  flex: 0.7;
}

.recommend-choice {
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.recommend-main {
  max-width: 100%;
  font-size: 22rpx;
  color: #333;
  line-height: 1.35;
  word-break: break-word;
}

.recommend-badge {
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  background-color: #e6f4ff;
  color: #1677ff;
  border: 1rpx solid #bae0ff;
  font-size: 19rpx;
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none !important;
  white-space: nowrap;
  cursor: pointer;
}

.recommend-badge-replace {
  background-color: #fff7e6;
  border-color: #ffd591;
  color: #d46b08;
}

/* 补剂表格4列布局 */
.supplement-table .product-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.supplement-table .brand-col {
  flex: 1;
  justify-content: center;
  text-align: center;
  font-size: 24rpx;
  color: #333;
}

.supplement-table .timing-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.supplement-table .dosage-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.no-data {
  padding: 60rpx 0;
  text-align: center;
}

.no-data-text {
  font-size: 28rpx;
  color: #999;
}

/* 制作流程 */
.production-steps-section {
  padding: 24rpx;
}

.steps-content {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.steps-text {
  font-size: 28rpx;
  color: #333;
  line-height: 1.8;
  white-space: pre-wrap;
}

/* 固定文案卡片网格 */
.info-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 20rpx;
}

.info-card {
  background-color: #fff;
  padding: 24rpx;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.card-title {
  display: flex;
  align-items: center;
}

.card-content {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

.card-content.multi-line {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.content-line {
  font-size: 26rpx;
  color: #666;
  line-height: 1.5;
}

.content-line.warning {
  color: #faad14;
}

/* 底部操作栏 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  display: flex;
  gap: 12rpx;
  z-index: 100;
}

.action-btn {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #333;
  border: none;
}

.action-btn.primary {
  background-color: #1890ff;
  color: #fff;
}

.action-btn.success {
  background-color: #52c41a;
  color: #fff;
}

.btn-text {
  font-size: 26rpx;
  font-weight: 500;
}

/* Canvas离屏渲染 - 实际尺寸由 printCanvasStyle 绑定到高分辨率输出尺寸 */
.print-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  z-index: -1;
  pointer-events: none;
}

/* 规格弹窗 */
.spec-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.spec-content {
  width: 600rpx;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

.spec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border-bottom: 1rpx solid #e5e5e5;
}

.spec-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.btn-close {
  font-size: 40rpx;
  color: #999;
  padding: 0 8rpx;
}

.spec-body {
  padding: 24rpx;
}

.spec-row {
  display: flex;
  margin-bottom: 20rpx;
  align-items: center;
}

.spec-label {
  font-size: 28rpx;
  color: #666;
  min-width: 200rpx;
  flex-shrink: 0;
  white-space: nowrap;
}

.spec-value {
  font-size: 28rpx;
  color: #333;
  flex: 1;
  word-break: break-all;
}

.btn-purchase {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 8rpx;
  padding: 8rpx 24rpx;
  font-size: 26rpx;
  font-weight: 500;
  margin-left: 16rpx;
}

.btn-purchase:active {
  opacity: 0.8;
}

/* 用量详情弹窗样式 */
.spec-divider {
  height: 1rpx;
  background-color: #e8e8e8;
  margin: 20rpx 0;
}

.calculation-detail {
  margin: 20rpx 0;
  padding: 20rpx;
  background-color: #f7f9fc;
  border-radius: 8rpx;
  border-left: 4rpx solid #1890ff;
}

.calculation-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 12rpx;
}

.calculation-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
  display: block;
}

.highlight-row {
  background-color: #fff7e6;
  padding: 12rpx;
  border-radius: 8rpx;
  margin-top: 8rpx;
}

.highlight-value {
  color: #ff4d4f;
  font-weight: bold;
  font-size: 30rpx;
}

/* 设备推荐卡片样式 */
.equipment-card {
  cursor: pointer;
  user-select: none;
}

.card-title .view-more {
  margin-left: auto;
  font-size: 24rpx;
  color: #1890ff;
}

.equipment-list {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.equipment-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  min-width: 100rpx;
}

.equipment-icon {
  width: 60rpx;
  height: 60rpx;
  border-radius: 8rpx;
}

.equipment-icon-placeholder {
  width: 60rpx;
  height: 60rpx;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 28rpx;
  color: #fff;
  font-weight: bold;
}

.equipment-name {
  font-size: 22rpx;
  color: #666;
  text-align: center;
}

/* 设备推荐列表弹窗样式 */
.equipment-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
}

.equipment-modal-content {
  width: 100%;
  max-height: 80vh;
  background-color: #fff;
  border-radius: 32rpx 32rpx 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.equipment-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 32rpx 24rpx;
  border-bottom: 1rpx solid #e5e5e5;
}

.equipment-modal-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.equipment-modal-body {
  flex: 1;
  overflow: hidden;
}

.equipment-scroll {
  height: 100%;
  padding: 24rpx 32rpx;
}

.equipment-detail-item {
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.equipment-detail-header {
  display: flex;
  gap: 20rpx;
  align-items: center;
}

.equipment-detail-image {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.equipment-detail-image-placeholder {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.placeholder-text-large {
  font-size: 48rpx;
  color: #fff;
  font-weight: bold;
}

.equipment-detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.equipment-detail-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.equipment-detail-brand {
  font-size: 26rpx;
  color: #666;
}

.equipment-detail-spec {
  font-size: 24rpx;
  color: #999;
}

.equipment-detail-reason {
  padding: 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.reason-label {
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
}

.reason-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

.equipment-detail-action {
  display: flex;
  justify-content: flex-end;
}

.btn-purchase-equipment {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 12rpx;
  padding: 16rpx 48rpx;
  font-size: 28rpx;
  font-weight: 500;
}

.btn-purchase-equipment:active {
  opacity: 0.8;
}

/* 推荐产品卡片列表（弹窗内） */
.rp-cards-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.rp-card {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: 2rpx solid #e8e8e8;
  transition: all 0.2s;
}

.rp-card:active {
  opacity: 0.8;
}

.rp-card-active {
  background-color: #f0f7ff;
  border-color: #1890ff;
}

.rp-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.rp-card-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.rp-card-active .rp-card-name {
  color: #1890ff;
}

.rp-card-badge {
  font-size: 22rpx;
  color: #fff;
  background-color: #1890ff;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
}

.rp-card-body {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex: 1;
  min-width: 0;
}

.rp-card-main {
  display: flex;
  align-items: stretch;
  gap: 20rpx;
}

.rp-card-aside {
  width: 180rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex-shrink: 0;
}

.rp-card-media {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: #fff;
}

.rp-card-image {
  width: 100%;
  height: 100%;
  display: block;
  background-color: #fff;
}

.rp-card-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4rpx;
}

.rp-card-field-label {
  font-size: 24rpx;
  color: #999;
}

.rp-card-field-value {
  font-size: 24rpx;
  color: #333;
  line-height: 1.5;
  text-align: left;
  word-break: break-all;
}

.rp-card-actions {
  display: flex;
  width: 100%;
}

.spec-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 20rpx;
}

.spec-action-btn {
  min-width: 160rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  font-weight: 500;
}

.spec-action-btn-secondary {
  background: #f5f5f5;
  color: #666;
  border: 1rpx solid #d9d9d9;
}

.spec-action-btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
}

.spec-image-block {
  width: 220rpx;
  height: 220rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  overflow: hidden;
  background-color: #f5f5f5;
}

.spec-image {
  width: 100%;
  height: 100%;
  display: block;
  background-color: #f5f5f5;
}

.spec-detail-main {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
  margin-bottom: 24rpx;
}

.spec-detail-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.spec-detail-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6rpx;
}

.spec-detail-field-label {
  font-size: 24rpx;
  color: #999;
}

.spec-detail-field-value {
  font-size: 26rpx;
  color: #333;
  line-height: 1.5;
  text-align: left;
  word-break: break-all;
}

.spec-detail-aside {
  width: 220rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex-shrink: 0;
}

.spec-detail-actions {
  display: flex;
  width: 100%;
}

.btn-purchase-sm {
  background: #fff;
  color: #6f4fc8;
  border: 2rpx solid #d8cff7;
  border-radius: 8rpx;
  width: 100%;
  height: 64rpx;
  line-height: 60rpx;
  padding: 0 20rpx;
  font-size: 24rpx;
  font-weight: 500;
  margin-left: 0;
  box-sizing: border-box;
}

.btn-purchase-sm:active {
  background: #f6f1ff;
  opacity: 1;
}

.btn-purchase-sm::after {
  border: none;
}
</style>
