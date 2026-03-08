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
        </view>

        <!-- 食材 -->
        <view v-if="foodItems.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">食材</view>
          <view class="ingredient-table">
            <view class="table-header">
              <text class="header-item name-col">原料名称</text>
              <text class="header-item method-col">制备方法</text>
              <text class="header-item actual-col">采购量</text>
            </view>
            <view v-for="(item, idx) in foodItems" :key="'food-' + idx" class="table-row">
              <text class="row-item name-col">{{ item.name }}</text>
              <text class="row-item method-col">{{ item.preparationMethod || '-' }}</text>
              <text
                class="row-item actual-col highlight amount-link"
                @tap.stop="showAmountDetailModal(item)"
              >
                {{ item.actualAmountStr }}
              </text>
            </view>
            <!-- 合计行 -->
            <view class="table-row total-row">
              <text class="row-item name-col total-label">合计</text>
              <text class="row-item method-col">-</text>
              <text class="row-item actual-col total-value highlight">{{ foodItemsTotal.actualAmountStr }}</text>
            </view>
          </view>
        </view>

        <!-- 补剂类：需额外补充的营养 -->
        <view v-if="supplementItemsDetailed.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">需额外补充的营养</view>
          <view class="ingredient-table">
            <view class="table-header supplement-table">
              <text class="header-item product-col">推荐营养品</text>
              <text class="header-item brand-col">推荐产品</text>
              <text class="header-item timing-col">添加时机</text>
              <text class="header-item dosage-col">添加量</text>
            </view>
            <view v-for="(item, idx) in supplementItemsDetailed" :key="'supp-' + idx" class="table-row supplement-table">
              <text class="row-item product-col">{{ item.name }}</text>
              <text
                v-if="item.brand !== '-'"
                class="row-item brand-col brand-link"
                @tap.stop="showSpecModal(item)"
              >
                {{ item.brand }}
              </text>
              <text v-else class="row-item brand-col">{{ item.brand }}</text>
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
        <view v-if="foodItems.length === 0 && supplementItems.length === 0" class="no-data">
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
          <text class="content-line">0-5℃冷藏保存3天</text>
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
      <button class="action-btn primary" @tap="handlePrint">
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

    <!-- Canvas用于打印功能（隐藏） - A4竖版: 1200px × 1697px -->
    <canvas
      canvas-id="printCanvas"
      id="printCanvas"
      class="print-canvas"
      :width="1200"
      :height="1697"
    ></canvas>

    <!-- 规格详情弹窗 -->
    <view v-if="showSpec" class="spec-modal" @tap="closeSpecModal">
      <view class="spec-content" @tap.stop>
        <view class="spec-header">
          <text class="spec-title">商品规格</text>
          <text class="btn-close" @tap="closeSpecModal">✕</text>
        </view>
        <view class="spec-body">
          <view class="spec-row">
            <text class="spec-label">商品名称：</text>
            <text class="spec-value">{{ currentSpec.name }}</text>
          </view>
          <view class="spec-row">
            <text class="spec-label">品牌：</text>
            <text class="spec-value">{{ currentSpec.brand }}</text>
          </view>
          <view v-if="currentSpec.productModel" class="spec-row">
            <text class="spec-label">规格：</text>
            <text class="spec-value">{{ currentSpec.productModel }}</text>
          </view>
          <view v-if="currentSpec.purchaseLink" class="spec-row">
            <text class="spec-label">Seven爸推荐：</text>
            <button
              class="btn-purchase"
              @tap="handlePurchase(currentSpec.purchaseLink, currentSpec.name)"
            >
              去购买
            </button>
          </view>
          <view v-else-if="currentSpec.purchaseChannel" class="spec-row">
            <text class="spec-label">Seven爸推荐：</text>
            <text class="spec-value">{{ currentSpec.purchaseChannel }}</text>
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
            <text class="spec-label">原料名称：</text>
            <text class="spec-value">{{ currentAmountDetail.name }}</text>
          </view>
          <view v-if="currentAmountDetail.preparationMethod" class="spec-row">
            <text class="spec-label">{{ currentAmountDetail.type === 'SUPPLEMENT' ? '添加时机：' : '制备方法：' }}</text>
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
            <text class="spec-label">推荐营养品：</text>
            <text class="spec-value">{{ currentNutritionInfo.name }}</text>
          </view>
          <view class="spec-row">
            <text class="spec-label">添加量：</text>
            <text class="spec-value">{{ currentNutritionInfo.amountStr }}</text>
          </view>
          <view v-if="currentNutritionInfo.nutrientTargetKey" class="spec-divider"></view>
          <view v-if="currentNutritionInfo.nutrientTargetKey" class="spec-row">
            <text class="spec-label">营养素：</text>
            <text class="spec-value">{{ currentNutritionInfo.nutrientTargetKey }}</text>
          </view>
          <view v-if="currentNutritionInfo.nutrientTotal" class="spec-row highlight-row">
            <text class="spec-label">营养素总量：</text>
            <text class="spec-value highlight-value">{{ currentNutritionInfo.nutrientTotal }}{{ currentNutritionInfo.nutrientUnit }}</text>
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
import { PrintCanvasBuilder } from '../../utils/print-canvas'
import ShareButton from '../../components/ShareButton.vue'
import ImagePreviewModal from '../../components/ImagePreviewModal.vue'
import { normalizeImageUrl } from '../../utils/config'

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

// UI状态
// 规格弹窗状态
const showSpec = ref(false)
const currentSpec = ref<any>({})

// 用量详情弹窗状态
const showAmountDetail = ref(false)
const currentAmountDetail = ref<any>({})

// 营养信息弹窗状态
const showNutritionInfo = ref(false)
const currentNutritionInfo = ref<any>({})

// 设备推荐相关状态
const equipmentRecommendations = ref<any[]>([])
const showEquipmentList = ref(false)
const currentEquipmentDetail = ref<any>(null)

// 图片预览弹窗状态
const showImagePreview = ref(false)
const previewImageUrl = ref('')

// 全局配置中的补剂损耗率（默认5%）
const globalSupplementLossRate = ref(0.05)

// 计算采购清单数据
const purchaseListData = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) {
    return []
  }

  // 从后端获取食谱的损耗率（后端存储1.05表示5%损耗，需要减1）
  const recipeLossRate = recipe.value?.productionLossRate ? recipe.value.productionLossRate - 1 : 0.07

  return pricePreview.value.pricingBreakdown.ingredientDetails.map((item: any) => {
    const isFood = item.type === 'FOOD'
    // 食材使用食谱设置的损耗率，补剂使用全局配置的损耗率
    const lossRate = isFood ? recipeLossRate : globalSupplementLossRate.value

    // 理论用量（克）
    const theoreticalAmount = (item.netAmount ?? item.amount) * 1000

    // 实际用量 = 理论用量 × (1 + 损耗率)
    const actualAmount = theoreticalAmount * (1 + lossRate)

    return {
      name: item.name,
      type: item.type,
      theoreticalAmount,
      actualAmount,
      lossRate,
      displayUnit: item.displayUnit || item.unit || 'g',
      preparationMethod: item.preparationMethod || null,
      // 格式化显示
      theoreticalAmountStr: formatAmount(theoreticalAmount, isFood),
      actualAmountStr: formatAmount(actualAmount, isFood),
      lossRateStr: `${(lossRate * 100).toFixed(0)}%`,
      // 计算过程描述
      calculationProcess: isFood
        ? `理论用量 ${formatAmount(theoreticalAmount, false)} × (1 + ${(lossRate * 100).toFixed(0)}%损耗率) = 实际用量 ${formatAmount(actualAmount, false)}`
        : `营养需求 ${theoreticalAmount.toFixed(2)}mg ÷ 浓度 × (1 + ${(lossRate * 100).toFixed(0)}%损耗率) = 实际用量 ${formatAmount(actualAmount, false)}`
    }
  })
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

// 补剂类详细数据（用于需额外补充的营养表格）
const supplementItemsDetailed = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) {
    console.log('[DIYSheet] pricePreview 或 pricingBreakdown 不存在')
    return []
  }

  console.log('[DIYSheet] pricePreview 存在:', !!pricePreview.value)
  console.log('[DIYSheet] pricingBreakdown 存在:', !!pricePreview.value?.pricingBreakdown)
  console.log('[DIYSheet] ingredientDetails 存在:', !!pricePreview.value?.pricingBreakdown?.ingredientDetails)
  console.log('[DIYSheet] ingredientDetails 长度:', pricePreview.value?.pricingBreakdown?.ingredientDetails?.length)

  // 直接使用API返回的补剂数据
  const allItems = pricePreview.value.pricingBreakdown.ingredientDetails
  console.log('[DIYSheet] 所有原料数据:', allItems.map((item: any) => ({
    name: item.name,
    type: item.type,
    preparationMethod: item.preparationMethod
  })))

  const supplementItems = allItems.filter((item: any) => item.type === 'SUPPLEMENT')
  console.log('[DIYSheet] 补剂数量:', supplementItems.length)

  return supplementItems.map((item: any) => {
    // 调试日志：查看所有补剂的完整数据
    console.log('[DIYSheet] 补剂完整数据:', JSON.stringify({
      name: item.name,
      type: item.type,
      preparationMethod: item.preparationMethod,
      preparationMethodType: typeof item.preparationMethod,
      allFields: Object.keys(item)
    }, null, 2))

    // 使用displayUnit作为显示单位
    const displayUnit = item.displayUnit || item.unit || 'g'

    // 从properties中提取购买链接
    const purchaseLink = item.properties?.purchase_link || undefined

    return {
      name: item.name,                          // 推荐营养品
      brand: item.brand || '-',                 // 推荐品牌
      preparationMethod: item.preparationMethod || '',  // 添加时机
      amount: item.amount,                      // 用量数值
      unit: item.unit,                          // 原始单位（用于计算）
      displayUnit: displayUnit,                 // 显示单位（用于展示）
      amountStr: formatSupplementAmountWithDisplayUnit(item.amount, item.unit, displayUnit),  // 格式化用量
      productModel: item.productModel,          // 规格（弹窗用）
      purchaseChannel: item.purchaseChannel,    // 购买渠道（弹窗用）
      purchaseLink: purchaseLink,               // 购买链接（从properties中提取）
      ingredientId: item.ingredientId,          // 原料ID
      nutrientTargetKey: item.nutrientTargetKey,      // 营养素名称
      nutrientTargetValue: item.nutrientTargetValue,  // 营养目标值
      type: item.type,                          // 类型标识
      properties: item.properties               // 完整的properties（包含active_nutrients单位信息）
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

// 格式化补剂用量显示（使用displayUnit字段）
function formatSupplementAmountWithDisplayUnit(
  amount: number,
  originalUnit: string | undefined,
  displayUnit: string
): string {
  // 将原始单位转换为克数
  let amountInG = amount
  if (originalUnit === 'kg') {
    amountInG = amount * 1000
  } else if (originalUnit === 'mg') {
    amountInG = amount / 1000
  }

  // 根据displayUnit格式化显示
  if (displayUnit === '粒' || displayUnit === '片' || displayUnit === '颗') {
    // 计数单位，显示整数
    return `${Math.round(amountInG)}${displayUnit}`
  } else if (displayUnit === 'ml') {
    // 液体单位
    if (amountInG >= 1000) {
      return `${(amountInG / 1000).toFixed(2)}L`
    }
    return `${amountInG.toFixed(1)}${displayUnit}`
  } else if (displayUnit === 'g') {
    // 克
    if (originalUnit === 'kg') {
      return `${amountInG.toFixed(1)}${displayUnit}`
    }
    return `${amountInG.toFixed(1)}${displayUnit}`
  } else if (displayUnit === 'mg') {
    // 毫克
    if (originalUnit === 'g') {
      return `${(amount * 1000).toFixed(1)}${displayUnit}`
    }
    return `${amount.toFixed(1)}${displayUnit}`
  } else {
    // 其他单位，直接使用displayUnit
    return `${amountInG.toFixed(1)}${displayUnit}`
  }
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
  try {
    // 先加载健康标签映射
    await loadHealthTagMapping()

    // 并行加载食谱详情、价格预览、狗狗信息和设备推荐
    await Promise.all([
      loadRecipe(),
      loadPricePreview(),
      loadDog(),
      loadEquipmentRecommendations()
    ])
  } catch (error) {
    console.error('[DIYSheet] Load data error:', error)
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
      console.log('[DIYSheet] 价格预览加载成功')
    }
  } catch (error) {
    console.error('[DIYSheet] Load price preview error:', error)
    // 不显示错误提示，因为采购清单可以降级处理
  }
}

async function loadEquipmentRecommendations() {
  try {
    const res = await request({
      url: '/global-config',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
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

// 打印制作单
async function handlePrint() {
  uni.showLoading({ title: '生成中...' })

  try {
    // 1. 创建Canvas构建器（A4纸规格 @150dpi - 竖版）
    const canvasWidth = 1200
    const canvasHeight = 1697

    console.log('[DIYSheet] 开始生成制作单图片:', {
      width: canvasWidth,
      height: canvasHeight,
      orientation: canvasHeight > canvasWidth ? '竖版(Portrait)' : '横版(Landscape)'
    })

    const builder = new PrintCanvasBuilder({
      canvasId: 'printCanvas',
      width: canvasWidth,
      height: canvasHeight
    })

    // 2. 绘制标题（食谱名称）
    builder.drawTitle(recipe.value.name)

    // 3. 绘制标签（适用阶段、健康标签）
    const tags = [
      ...recipe.value.applicableLifeStages.map(getLifeStageLabel),
      ...recipe.value.targetHealthTags.map(getHealthTagLabel)
    ]
    builder.drawTags(tags)

    // 4. 绘制狗狗信息和制作参数合并卡片（8个字段）
    if (dog.value) {
      builder.drawInfoCard([
        { label: '狗狗', value: dog.value.name },
        { label: '年龄', value: dogAgeText.value },
        { label: '体重', value: `${dog.value.currentWeightKg}kg` },
        { label: '每日餐数', value: `${dog.value.mealsPerDay}餐/天` },
        { label: '制作周期', value: `${cycleDays.value}天` },
        { label: '每餐饭量', value: `${perMealG.value}g` },
        { label: '每日饭量', value: `${dailyIntakeG.value}g` },
        { label: '营养标准', value: getNutritionStandardLabel(recipe.value.nutritionStandard) }
      ], '#1890ff')
    }

    // 5. 绘制食材清单表格
    if (foodItems.value.length > 0) {
      builder.drawSectionTitle('食材清单')

      const foodRows = foodItems.value.map(item => [
        item.name,
        item.preparationMethod || '-',
        item.actualAmountStr
      ])

      builder.drawTable(
        ['原料名称', '制备方法', '采购量'],
        foodRows,
        {
          showTotal: true,
          totalText: '合计',
          totalValue: foodItemsTotal.value.actualAmountStr
        }
      )
    }

    // 7. 绘制补剂清单表格
    if (supplementItemsDetailed.value.length > 0) {
      builder.drawSectionTitle('需额外补充的营养')

      const supplementRows = supplementItemsDetailed.value.map(item => {
        // 计算营养素总量 = 营养目标值 * 食材总量 / 1000
        let nutrientTotal = ''
        let nutrientUnit = ''
        if (item.nutrientTargetKey && item.nutrientTargetValue && foodItemsTotal.value.actualAmount) {
          const total = Math.round(item.nutrientTargetValue * foodItemsTotal.value.actualAmount / 1000)
          nutrientUnit = item.properties?.active_nutrients?.[item.nutrientTargetKey]?.unit || 'mg'
          nutrientTotal = `${total}${nutrientUnit}`
        }

        return [
          item.name,
          item.brand || '-',
          item.productModel || '-',
          item.preparationMethod || '-',
          item.amountStr,
          item.nutrientTargetKey || '-',
          nutrientTotal
        ]
      })

      builder.drawTable(
        ['推荐营养品', '推荐品牌', '规格', '添加时机', '添加量', '营养素', '营养素总量'],
        supplementRows,
        {
          colWidths: [160, 120, 300, 120, 120, 150, 150],
          wrapColumns: [false, false, true, false, false, false, false]
        }
      )
    }

    // 8. 绘制制作流程
    if (recipe.value.productionSteps) {
      builder.drawSectionTitle('制作流程')
      builder.drawProductionSteps(recipe.value.productionSteps)
    }

    // 9. 绘制提示卡片（3个横向排列）
    builder.drawSectionTitle('重要提示')
    builder.drawTipsCards([
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
        content: ['-18℃冷冻保存6个月', '0-5℃冷藏保存3天', '开封后3小时内吃完']
      }
    ])

    // 10. 绘制页脚
    const dateStr = new Date().toLocaleDateString('zh-CN')
    builder.drawFooter(`Seven厨房 | ${dateStr}`)

    // 11. 导出为图片
    uni.showLoading({ title: '正在生成图片...' })
    const imagePath = await builder.toImage()

    console.log('[DIYSheet] 图片生成成功:', {
      path: imagePath,
      expectedSize: `${canvasWidth}x${canvasHeight}`,
      orientation: canvasHeight > canvasWidth ? '竖版' : '横版'
    })

    uni.hideLoading()

    // 12. 显示图片预览弹窗
    previewImageUrl.value = imagePath
    showImagePreview.value = true
  } catch (error) {
    console.error('[DIYSheet] 生成图片失败:', error)
    uni.hideLoading()
    uni.showToast({
      title: '生成失败',
      icon: 'none'
    })
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
  // 调试日志：查看打开规格弹窗时的数据
  console.log('[DIYSheet] 打开规格弹窗:', {
    name: item.name,
    purchaseLink: item.purchaseLink,
    purchaseLinkUrl: item.purchaseLink?.url
  })

  currentSpec.value = item
  showSpec.value = true
}

function closeSpecModal() {
  showSpec.value = false
}

// 显示用量详情弹窗
function showAmountDetailModal(item: any) {
  console.log('[DIYSheet] 打开用量详情弹窗:', item)
  currentAmountDetail.value = item
  showAmountDetail.value = true
}

function closeAmountDetailModal() {
  showAmountDetail.value = false
}

// 显示营养信息弹窗
function showNutritionInfoModal(item: any) {
  console.log('[DIYSheet] 打开营养信息弹窗:', item)
  console.log('[DIYSheet] properties:', item.properties)
  console.log('[DIYSheet] active_nutrients:', item.properties?.active_nutrients)
  console.log('[DIYSheet] nutrientTargetKey:', item.nutrientTargetKey)

  // 从properties中获取营养素的实际单位（μg 或 mg）
  const nutrientUnit = item.properties?.active_nutrients?.[item.nutrientTargetKey]?.unit || 'mg'

  console.log('[DIYSheet] 获取到的单位:', nutrientUnit)

  // 计算营养素总量 = 营养目标 * 食材采购量总量 / 1000
  const nutrientTotal = item.nutrientTargetValue && foodItemsTotal.value.actualAmount
    ? (item.nutrientTargetValue * foodItemsTotal.value.actualAmount / 1000).toFixed(0)
    : null

  // 将计算的营养素总量和单位添加到item中
  currentNutritionInfo.value = {
    ...item,
    nutrientTotal,
    nutrientUnit
  }

  console.log('[DIYSheet] 最终营养信息:', {
    nutrientTotal: currentNutritionInfo.value.nutrientTotal,
    nutrientUnit: currentNutritionInfo.value.nutrientUnit
  })

  showNutritionInfo.value = true
}

function closeNutritionInfoModal() {
  showNutritionInfo.value = false
}

// 处理购买链接跳转
function handlePurchase(purchaseLink: any, productName: string) {
  // 调试日志：查看点击去购买时的数据
  console.log('[DIYSheet] 点击去购买:', {
    productName,
    purchaseLink,
    hasUrl: !!purchaseLink?.url,
    hasAppId: !!purchaseLink?.mini_program_appid,
    hasPath: !!purchaseLink?.mini_program_path
  })

  // 优化判断逻辑：根据平台类型检查必要字段
  if (!purchaseLink) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  const { url, platform, mini_program_appid, mini_program_path } = purchaseLink

  // WEBVIEW平台需要url
  if (platform === 'WEBVIEW' && !url) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  // 小程序跳转平台需要appid和path
  if (platform !== 'WEBVIEW' && (!mini_program_appid || !mini_program_path)) {
    uni.showToast({
      title: '购买链接配置不完整',
      icon: 'none'
    })
    return
  }

  if (platform === 'WEBVIEW') {
    // 使用web-view打开网页链接
    uni.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(url)}`
    })
  } else {
    // 跳转其他小程序
    uni.navigateToMiniProgram({
      appId: mini_program_appid,
      path: mini_program_path,
      success: () => {
        console.log('[DIYSheet] 跳转成功:', productName)
      },
      fail: (err) => {
        console.error('[DIYSheet] 跳转失败:', err)
        uni.showModal({
          title: '跳转失败',
          content: '无法打开商品页面，请检查链接配置',
          showCancel: false
        })
      }
    })
  }
}

// 辅助函数
function getLifeStageLabel(stage: string): string {
  const map: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
  }
  return map[stage] || stage
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

  // 根据链接类型处理跳转
  if (purchaseLink.startsWith('http')) {
    // 外部链接，使用web-view打开
    uni.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(purchaseLink)}`
    })
  } else if (purchaseLink.startsWith('/')) {
    // 小程序路径，直接跳转
    uni.navigateTo({
      url: purchaseLink,
      success: () => {
        console.log('[DIYSheet] 跳转成功:', equipment.name)
      },
      fail: (err) => {
        console.error('[DIYSheet] 跳转失败:', err)
        uni.showToast({
          title: '页面跳转失败',
          icon: 'none'
        })
      }
    })
  } else {
    uni.showToast({
      title: '购买链接格式错误',
      icon: 'none'
    })
  }
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

.info-text {
  font-size: 26rpx;
  color: #333;
  line-height: 1.5;
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

.supplement-table .brand-link {
  color: #1890ff;
  text-decoration: underline;
  cursor: pointer;
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

/* Canvas隐藏 - A4竖版规格: 1200px × 1697px */
.print-canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 1200px;
  height: 1697px;
  visibility: hidden;
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
</style>
