<template>
  <view class="supplement-library-page">
    <view class="library-header">
      <view class="library-title-block">
        <text class="page-title">补剂库</text>
        <text class="page-subtitle">内部补剂维护</text>
      </view>
      <button
        v-if="canCreateSupplementOption"
        class="primary-btn header-create-btn"
        @tap="openSupplementForm"
      >
        新增补剂
      </button>
    </view>

    <view v-if="!canCreateSupplementOption" class="state-block">
      <text>仅内部用户可维护补剂</text>
    </view>

    <view v-else>
      <view class="action-panel">
        <text class="action-note">食材类原料请在 Web 管理后台维护</text>
        <view class="action-row">
          <button
            class="link-btn"
            :disabled="recognizingSupplementLabel"
            @tap="chooseSupplementLabelImage"
          >
            {{ recognizingSupplementLabel ? '识别中' : '拍照识别补剂' }}
          </button>
          <button class="link-btn" @tap="toggleSupplementForm">
            {{ supplementFormVisible ? '收起' : '新增补剂' }}
          </button>
        </view>
      </view>

      <view v-if="supplementFormVisible" class="supplement-form-panel">
        <view
          v-if="supplementAiWarnings.length || supplementOcrText"
          class="supplement-ai-summary"
        >
          <text class="supplement-ai-title">AI 已预填，请核对后再创建</text>
          <text
            v-for="warning in supplementAiWarnings"
            :key="warning"
            class="supplement-ai-warning"
          >
            {{ warning }}
          </text>
          <view v-if="supplementOcrText" class="supplement-ocr-block">
            <text class="supplement-ocr-title">OCR 原文</text>
            <text class="supplement-ocr-text">{{ supplementOcrText }}</text>
          </view>
        </view>

        <view class="supplement-field-row">
          <text class="supplement-field-label">补剂名称</text>
          <input
            class="supplement-text-input"
            v-model="supplementName"
            maxlength="40"
            placeholder="输入名称"
          />
        </view>
        <view class="supplement-field-row">
          <text class="supplement-field-label">档案名称</text>
          <input
            class="supplement-text-input"
            v-model="supplementProfileName"
            maxlength="60"
            placeholder="默认使用补剂名称"
          />
        </view>
        <view class="supplement-basis-row supplement-choice-row">
          <text class="supplement-field-label">平时怎么添加</text>
          <view class="supplement-choice-grid">
            <button
              v-for="unit in supplementUsageUnitOptions"
              :key="unit"
              class="basis-option supplement-choice"
              :class="{ active: supplementUsageUnit === unit }"
              @tap="selectSupplementUsageUnit(unit)"
            >
              {{ unit }}
            </button>
          </view>
        </view>
        <view class="supplement-basis-row">
          <text class="supplement-field-label">包装营养数据</text>
          <view class="supplement-basis-options">
            <button
              v-for="basis in supplementBasisOptions"
              :key="basis.value"
              class="basis-option"
              :class="{ active: supplementBasisType === basis.value }"
              @tap="selectSupplementBasisType(basis.value)"
            >
              {{ basis.label }}
            </button>
          </view>
        </view>
        <view v-if="needsSupplementUnitWeight" class="supplement-field-row">
          <text class="supplement-field-label">单位换算</text>
          <view class="supplement-conversion-input">
            <text class="supplement-conversion-prefix">1{{ supplementUsageUnit }} =</text>
            <input
              class="supplement-text-input supplement-conversion-value"
              type="digit"
              v-model="supplementServingWeightInput"
              placeholder="请输入"
            />
            <text class="supplement-conversion-suffix">g</text>
          </view>
        </view>
        <view v-if="needsSupplementDensity" class="supplement-field-row">
          <text class="supplement-field-label">密度</text>
          <view class="supplement-conversion-input">
            <text class="supplement-conversion-prefix">1ml =</text>
            <input
              class="supplement-text-input supplement-conversion-value"
              type="digit"
              v-model="supplementDensityInput"
              placeholder="可不填"
            />
            <text class="supplement-conversion-suffix">g</text>
          </view>
        </view>

        <view class="supplement-nutrition-header">
          <text class="supplement-section-title">营养数据</text>
          <button class="link-btn supplement-all-fields-btn" @tap="toggleSupplementAllFields">
            {{ supplementAllFieldsVisible ? '常用字段' : '完整营养字段' }}
          </button>
        </view>
        <scroll-view scroll-y class="supplement-fields-scroll">
          <view
            v-for="group in visibleSupplementNutrientGroups"
            :key="group.key"
            class="supplement-nutrient-group"
          >
            <text class="supplement-group-title">{{ group.title }}</text>
            <view class="supplement-nutrient-grid">
              <view
                v-for="field in group.fields"
                :key="field.fieldPath"
                class="supplement-nutrient-row"
              >
                <text class="supplement-nutrient-label">{{ field.label }}</text>
                <view class="supplement-nutrient-input-shell">
                  <input
                    class="supplement-nutrient-input"
                    type="digit"
                    :value="supplementNutrientInputs[field.fieldPath] || ''"
                    placeholder="0"
                    @input="onSupplementNutrientInput(field.fieldPath, $event)"
                  />
                  <text class="supplement-nutrient-unit">{{ field.unit }}</text>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>

        <view class="supplement-submit-row">
          <button class="plain-btn supplement-cancel-btn" @tap="resetSupplementForm">清空</button>
          <button
            class="primary-btn supplement-submit-btn"
            :disabled="!canSubmitSupplementOption"
            @tap="submitSupplementOption"
          >
            {{ creatingSupplementOption ? '创建中' : '创建补剂' }}
          </button>
        </view>
      </view>

      <view class="library-section">
        <view class="section-heading">
          <text class="section-title">当前补剂</text>
          <text class="section-total">{{ supplementOptions.length }} 项</text>
        </view>
        <view class="search-row">
          <input
            class="search-input"
            v-model="searchKeyword"
            confirm-type="search"
            placeholder="搜索补剂名称"
            @confirm="searchSupplementOptions"
          />
        </view>

        <view v-if="supplementLoading && supplementOptions.length === 0" class="state-block compact">
          <text>加载中...</text>
        </view>
        <view v-else-if="supplementOptions.length === 0" class="state-block compact">
          <text>暂无补剂</text>
        </view>
        <view v-else class="supplement-list">
          <view
            v-for="option in supplementOptions"
            :key="option.id"
            class="supplement-option"
          >
            <view class="supplement-option-main">
              <text class="supplement-option-name">{{ option.name }}</text>
              <text class="supplement-option-meta">{{ getSupplementOptionMeta(option) }}</text>
            </view>
            <button
              v-if="returnToEditor"
              class="link-btn use-btn"
              @tap="returnCreatedSupplementOption(option)"
            >
              使用
            </button>
          </view>
        </view>
        <button
          v-if="supplementOptionHasMore"
          class="load-more-btn"
          :disabled="supplementLoading"
          @tap="loadMoreSupplementOptions"
        >
          {{ supplementLoading ? '加载中' : '加载更多' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import {
  recipeDesignerApi,
  type IngredientOptionListResponse,
  type RecipeDesignerIngredientOption,
  type SupplementLabelExtractionDraft,
  type SupplementNutritionBasisType,
  type SupplementUsageUnit,
} from '../../api/recipe-designer'

interface SupplementNutrientField {
  fieldPath: string
  label: string
  unit: string
  common?: boolean
}

interface SupplementNutrientGroup {
  key: string
  title: string
  fields: SupplementNutrientField[]
}

interface SupplementBasisOption {
  value: SupplementNutritionBasisType
  label: string
}

const PENDING_SUPPLEMENT_OPTION_STORAGE_KEY = 'recipeDesignerPendingSupplementOption'

const supplementNutrientGroups: SupplementNutrientGroup[] = [
  {
    key: 'minerals',
    title: '矿物质',
    fields: [
      { fieldPath: 'minerals.calcium', label: '钙', unit: 'mg', common: true },
      { fieldPath: 'minerals.phosphorus', label: '磷', unit: 'mg', common: true },
      { fieldPath: 'minerals.potassium', label: '钾', unit: 'mg' },
      { fieldPath: 'minerals.sodium', label: '钠', unit: 'mg' },
      { fieldPath: 'minerals.magnesium', label: '镁', unit: 'mg' },
      { fieldPath: 'minerals.chloride', label: '氯', unit: 'mg' },
      { fieldPath: 'minerals.iron', label: '铁', unit: 'mg' },
      { fieldPath: 'minerals.zinc', label: '锌', unit: 'mg', common: true },
      { fieldPath: 'minerals.copper', label: '铜', unit: 'mg' },
      { fieldPath: 'minerals.manganese', label: '锰', unit: 'mg' },
      { fieldPath: 'minerals.selenium', label: '硒', unit: 'μg' },
      { fieldPath: 'minerals.iodine', label: '碘', unit: 'μg' },
    ],
  },
  {
    key: 'vitamins',
    title: '维生素',
    fields: [
      { fieldPath: 'vitamins.vitaminA', label: '维生素 A', unit: 'IU' },
      { fieldPath: 'vitamins.vitaminD', label: '维生素 D', unit: 'IU', common: true },
      { fieldPath: 'vitamins.vitaminE', label: '维生素 E', unit: 'IU', common: true },
      { fieldPath: 'vitamins.vitaminK', label: '维生素 K', unit: 'μg' },
      { fieldPath: 'vitamins.vitaminB1', label: '维生素 B1', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB2', label: '维生素 B2', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB3', label: '维生素 B3', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB5', label: '维生素 B5', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB6', label: '维生素 B6', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB7', label: '维生素 B7', unit: 'μg' },
      { fieldPath: 'vitamins.vitaminB9', label: '维生素 B9', unit: 'μg' },
      { fieldPath: 'vitamins.vitaminB12', label: '维生素 B12', unit: 'μg' },
      { fieldPath: 'vitamins.choline', label: '胆碱', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminC', label: '维生素 C', unit: 'mg' },
    ],
  },
  {
    key: 'fattyAcids',
    title: '脂肪酸',
    fields: [
      { fieldPath: 'fattyAcids.saturatedFattyAcids', label: '饱和脂肪酸', unit: 'g' },
      { fieldPath: 'fattyAcids.monounsaturatedFattyAcids', label: '单不饱和脂肪酸', unit: 'g' },
      { fieldPath: 'fattyAcids.polyunsaturatedFattyAcids', label: '多不饱和脂肪酸', unit: 'g' },
      { fieldPath: 'fattyAcids.linoleicAcid', label: '亚油酸', unit: 'g' },
      { fieldPath: 'fattyAcids.alphaLinolenicAcid', label: 'α-亚麻酸', unit: 'g' },
      { fieldPath: 'fattyAcids.arachidonicAcid', label: '花生四烯酸', unit: 'g' },
      { fieldPath: 'fattyAcids.epa', label: 'EPA', unit: 'mg', common: true },
      { fieldPath: 'fattyAcids.dpa', label: 'DPA', unit: 'mg' },
      { fieldPath: 'fattyAcids.dha', label: 'DHA', unit: 'mg', common: true },
    ],
  },
  {
    key: 'aminoAcids',
    title: '氨基酸',
    fields: [
      { fieldPath: 'aminoAcids.arginine', label: '精氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.lysine', label: '赖氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.methionine', label: '蛋氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.cystine', label: '胱氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.taurine', label: '牛磺酸', unit: 'g', common: true },
      { fieldPath: 'aminoAcids.tryptophan', label: '色氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.threonine', label: '苏氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.leucine', label: '亮氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.isoleucine', label: '异亮氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.valine', label: '缬氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.phenylalanine', label: '苯丙氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.tyrosine', label: '酪氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.histidine', label: '组氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.glutamicAcid', label: '谷氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.glycine', label: '甘氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.proline', label: '脯氨酸', unit: 'g' },
    ],
  },
  {
    key: 'macros',
    title: '基础营养',
    fields: [
      { fieldPath: 'macros.energyKcal', label: '能量', unit: 'kcal' },
      { fieldPath: 'macros.moisture', label: '水分', unit: 'g' },
      { fieldPath: 'macros.crudeProtein', label: '粗蛋白', unit: 'g' },
      { fieldPath: 'macros.crudeFat', label: '粗脂肪', unit: 'g' },
      { fieldPath: 'macros.ash', label: '灰分', unit: 'g' },
      { fieldPath: 'macros.carbohydrate', label: '碳水化合物', unit: 'g' },
      { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
      { fieldPath: 'macros.solubleFiber', label: '可溶性纤维', unit: 'g' },
      { fieldPath: 'macros.insolubleFiber', label: '不可溶性纤维', unit: 'g' },
    ],
  },
]

const supplementUsageUnitOptions: SupplementUsageUnit[] = ['g', 'ml', '粒', '片', '胶囊', '平勺', '份']

const supplementServingBasisLabels: Record<SupplementUsageUnit, string> = {
  g: '每1g',
  ml: '每1ml',
  粒: '每粒',
  片: '每片',
  胶囊: '每胶囊',
  平勺: '每平勺',
  份: '每份',
}

const currentUserRole = ref('')
const returnToEditor = ref(false)
const returnDraftId = ref('')
const searchKeyword = ref('')
const supplementOptions = ref<RecipeDesignerIngredientOption[]>([])
const supplementLoading = ref(false)
const supplementOptionPage = ref(1)
const supplementOptionHasMore = ref(false)
const supplementOptionPageSize = 50
const supplementFormVisible = ref(false)
const creatingSupplementOption = ref(false)
const recognizingSupplementLabel = ref(false)
const supplementName = ref('')
const supplementProfileName = ref('')
const supplementUsageUnit = ref<SupplementUsageUnit>('g')
const supplementBasisType = ref<SupplementNutritionBasisType>('PER_1_G')
const supplementServingWeightInput = ref('')
const supplementDensityInput = ref('')
const supplementAllFieldsVisible = ref(false)
const supplementNutrientInputs = ref<Record<string, string>>({})
const supplementAiWarnings = ref<string[]>([])
const supplementOcrText = ref('')
let supplementSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingSupplementOptionsReset = false

const canCreateSupplementOption = computed(() => {
  return currentUserRole.value === 'STAFF' || currentUserRole.value === 'ADMIN'
})

const commonSupplementNutrientFields = computed(() => {
  return supplementNutrientGroups.flatMap((group) => group.fields).filter((field) => field.common)
})

const commonSupplementNutrientFieldPaths = computed(() => {
  return new Set(commonSupplementNutrientFields.value.map((field) => field.fieldPath))
})

const allSupplementNutrientFieldPaths = computed(() => {
  return new Set(supplementNutrientGroups.flatMap((group) => group.fields).map((field) => field.fieldPath))
})

const visibleSupplementNutrientGroups = computed(() => {
  if (supplementAllFieldsVisible.value) return supplementNutrientGroups
  return supplementNutrientGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => commonSupplementNutrientFieldPaths.value.has(field.fieldPath)),
    }))
    .filter((group) => group.fields.length > 0)
})

const supplementBasisOptions = computed<SupplementBasisOption[]>(() => {
  if (supplementUsageUnit.value === 'g') {
    return [
      { value: 'PER_1_G', label: '每1g' },
      { value: 'PER_100_G', label: '每100g' },
    ]
  }
  if (supplementUsageUnit.value === 'ml') {
    return [
      { value: 'PER_1_ML', label: '每1ml' },
      { value: 'PER_100_ML', label: '每100ml' },
    ]
  }
  return [
    { value: 'PER_SERVING', label: supplementServingBasisLabels[supplementUsageUnit.value] },
    { value: 'PER_1_G', label: '每1g' },
    { value: 'PER_100_G', label: '每100g' },
  ]
})

const needsSupplementUnitWeight = computed(() => {
  return !['g', 'ml'].includes(supplementUsageUnit.value) && supplementBasisType.value !== 'PER_SERVING'
})

const needsSupplementDensity = computed(() => {
  return supplementUsageUnit.value === 'ml'
})

const hasSupplementNutrientInput = computed(() => {
  return Object.values(supplementNutrientInputs.value).some((value) => {
    const trimmed = String(value ?? '').trim()
    return trimmed !== '' && Number(trimmed) > 0
  })
})

const canSubmitSupplementOption = computed(() => {
  return (
    canCreateSupplementOption.value &&
    !creatingSupplementOption.value &&
    supplementName.value.trim().length > 0 &&
    (!needsSupplementUnitWeight.value || Number(supplementServingWeightInput.value) > 0) &&
    hasSupplementNutrientInput.value
  )
})

onLoad((options: any) => {
  currentUserRole.value = getCurrentUserRole()
  returnToEditor.value = options?.returnTo === 'editor'
  returnDraftId.value = String(options?.draftId || '')
})

onShow(() => {
  currentUserRole.value = getCurrentUserRole()
  if (canCreateSupplementOption.value && supplementOptions.value.length === 0) {
    void loadSupplementOptions(true)
  }
})

watch(searchKeyword, () => {
  if (!canCreateSupplementOption.value) return
  clearSupplementSearchDebounce()
  supplementSearchDebounceTimer = setTimeout(() => {
    void loadSupplementOptions(true)
  }, 300)
})

onUnmounted(() => {
  clearSupplementSearchDebounce()
})

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
    console.warn('[SupplementLibrary] Failed to read current user role:', error)
    return ''
  }
}

function openSupplementForm() {
  supplementFormVisible.value = true
}

function toggleSupplementForm() {
  supplementFormVisible.value = !supplementFormVisible.value
}

function toggleSupplementAllFields() {
  supplementAllFieldsVisible.value = !supplementAllFieldsVisible.value
}

function selectSupplementUsageUnit(unit: SupplementUsageUnit) {
  supplementUsageUnit.value = unit
  if (unit === 'g') {
    supplementBasisType.value = 'PER_1_G'
  } else if (unit === 'ml') {
    supplementBasisType.value = 'PER_1_ML'
  } else {
    supplementBasisType.value = 'PER_SERVING'
  }
  supplementServingWeightInput.value = ''
  supplementDensityInput.value = ''
}

function selectSupplementBasisType(basisType: SupplementNutritionBasisType) {
  supplementBasisType.value = basisType
}

function onSupplementNutrientInput(fieldPath: string, event: any) {
  supplementNutrientInputs.value = {
    ...supplementNutrientInputs.value,
    [fieldPath]: String(event?.detail?.value ?? ''),
  }
}

function resetSupplementForm() {
  supplementName.value = ''
  supplementProfileName.value = ''
  supplementUsageUnit.value = 'g'
  supplementBasisType.value = 'PER_1_G'
  supplementServingWeightInput.value = ''
  supplementDensityInput.value = ''
  supplementAllFieldsVisible.value = false
  supplementNutrientInputs.value = {}
  supplementAiWarnings.value = []
  supplementOcrText.value = ''
}

function chooseSupplementLabelImage() {
  if (!canCreateSupplementOption.value || recognizingSupplementLabel.value) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: async (res: any) => {
      const filePath = res?.tempFilePaths?.[0]
      if (!filePath) return
      await recognizeSupplementLabel(filePath)
    },
  })
}

async function recognizeSupplementLabel(filePath: string) {
  recognizingSupplementLabel.value = true
  uni.showLoading({ title: '正在识别补剂信息' })
  try {
    const draft = await recipeDesignerApi.extractSupplementLabel(filePath)
    applySupplementLabelDraft(draft)
    supplementFormVisible.value = true
    uni.showToast({ title: '已填入识别结果', icon: 'success' })
  } catch (error) {
    console.error('[SupplementLibrary] Failed to recognize supplement label:', error)
    uni.showToast({ title: '识别失败，请手动填写', icon: 'none' })
  } finally {
    uni.hideLoading()
    recognizingSupplementLabel.value = false
  }
}

function applySupplementLabelDraft(draft: SupplementLabelExtractionDraft) {
  const draftUsageUnit = isSupplementUsageUnit(draft.usageUnit) ? draft.usageUnit : 'g'
  supplementName.value = String(draft.ingredientName || draft.name || '').trim()
  supplementProfileName.value = String(draft.profileName || '').trim()
  supplementUsageUnit.value = draftUsageUnit
  supplementBasisType.value = isSupplementBasisType(draft.basisType)
    ? draft.basisType
    : draftUsageUnit === 'ml'
      ? 'PER_1_ML'
      : draftUsageUnit === 'g'
        ? 'PER_1_G'
        : 'PER_SERVING'
  supplementServingWeightInput.value =
    draft.servingWeightG !== undefined && draft.servingWeightG !== null
      ? String(draft.servingWeightG)
      : ''
  supplementDensityInput.value =
    draft.densityGPerMl !== undefined && draft.densityGPerMl !== null
      ? String(draft.densityGPerMl)
      : ''
  const nutrients: Record<string, string> = {}
  for (const [fieldPath, value] of Object.entries(draft.nutrients || {})) {
    if (!allSupplementNutrientFieldPaths.value.has(fieldPath)) continue
    const text = String(value ?? '').trim()
    if (text) {
      nutrients[fieldPath] = text
    }
  }
  supplementNutrientInputs.value = nutrients
  supplementAllFieldsVisible.value = Object.keys(nutrients).some(
    (fieldPath) => !commonSupplementNutrientFieldPaths.value.has(fieldPath),
  )
  supplementAiWarnings.value = Array.isArray(draft.warnings) ? draft.warnings : []
  supplementOcrText.value = String(draft.ocrText || '').trim()
}

function isSupplementUsageUnit(value: unknown): value is SupplementUsageUnit {
  return supplementUsageUnitOptions.includes(value as SupplementUsageUnit)
}

function isSupplementBasisType(value: unknown): value is SupplementNutritionBasisType {
  return ['PER_1_G', 'PER_100_G', 'PER_1_ML', 'PER_100_ML', 'PER_SERVING'].includes(
    value as string,
  )
}

function readPositiveOptionalInput(value: string) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return undefined
  const normalized = Number(trimmed)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null
}

function buildSupplementNutrientsPayload() {
  const nutrients: Record<string, number> = {}
  for (const [fieldPath, rawValue] of Object.entries(supplementNutrientInputs.value)) {
    const trimmed = String(rawValue ?? '').trim()
    if (!trimmed) continue
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0) {
      uni.showToast({ title: '营养数据需为非负数字', icon: 'none' })
      return null
    }
    if (value > 0) {
      nutrients[fieldPath] = value
    }
  }

  if (Object.keys(nutrients).length === 0) {
    uni.showToast({ title: '请至少填写一个营养成分', icon: 'none' })
    return null
  }

  return nutrients
}

async function submitSupplementOption() {
  if (!canCreateSupplementOption.value) {
    uni.showToast({ title: '仅内部用户可新增补剂', icon: 'none' })
    return
  }
  const name = supplementName.value.trim()
  if (!name) {
    uni.showToast({ title: '请输入补剂名称', icon: 'none' })
    return
  }
  const nutrients = buildSupplementNutrientsPayload()
  if (!nutrients) return
  const servingWeightG = readPositiveOptionalInput(supplementServingWeightInput.value)
  if (servingWeightG === null || (needsSupplementUnitWeight.value && !servingWeightG)) {
    uni.showToast({ title: `请填写1${supplementUsageUnit.value}对应的克重`, icon: 'none' })
    return
  }
  const densityGPerMl = readPositiveOptionalInput(supplementDensityInput.value)
  if (densityGPerMl === null) {
    uni.showToast({ title: '密度需为大于0的数字', icon: 'none' })
    return
  }

  creatingSupplementOption.value = true
  try {
    const res: any = await recipeDesignerApi.createSupplementOption({
      name,
      profileName: supplementProfileName.value.trim() || undefined,
      basisType: supplementBasisType.value,
      usageUnit: supplementUsageUnit.value,
      servingWeightG,
      densityGPerMl,
      nutrients,
    })
    const option = (res?.data ?? res) as RecipeDesignerIngredientOption
    if (!option?.id) {
      throw new Error('invalid supplement option response')
    }
    supplementOptions.value = [
      option,
      ...supplementOptions.value.filter((candidate) => candidate.id !== option.id),
    ]
    uni.showToast({ title: '补剂已创建', icon: 'success' })
    if (returnToEditor.value) {
      returnCreatedSupplementOption(option)
      return
    }
    supplementFormVisible.value = false
    resetSupplementForm()
  } catch (error) {
    console.error('[SupplementLibrary] Failed to create supplement option:', error)
    uni.showToast({ title: '创建补剂失败', icon: 'none' })
  } finally {
    creatingSupplementOption.value = false
  }
}

function returnCreatedSupplementOption(option: RecipeDesignerIngredientOption) {
  uni.setStorageSync(PENDING_SUPPLEMENT_OPTION_STORAGE_KEY, {
    draftId: returnDraftId.value,
    option,
  })
  uni.navigateBack()
}

async function searchSupplementOptions() {
  clearSupplementSearchDebounce()
  await loadSupplementOptions(true)
}

async function loadMoreSupplementOptions() {
  if (!supplementOptionHasMore.value || supplementLoading.value) return
  await loadSupplementOptions(false)
}

async function loadSupplementOptions(reset: boolean) {
  if (supplementLoading.value) {
    if (reset) pendingSupplementOptionsReset = true
    return
  }
  supplementLoading.value = true
  try {
    const nextPage = reset ? 1 : supplementOptionPage.value + 1
    const res: any = await recipeDesignerApi.listIngredientOptions({
      search: searchKeyword.value.trim(),
      page: nextPage,
      pageSize: supplementOptionPageSize,
    })
    const data = (res?.data ?? res) as IngredientOptionListResponse
    const options = Array.isArray(data?.data)
      ? data.data.filter((option) => isSupplementOption(option))
      : []
    supplementOptions.value = reset ? options : [...supplementOptions.value, ...options]
    supplementOptionPage.value = data?.page || nextPage
    supplementOptionHasMore.value = Boolean(data?.hasMore)
  } catch (error) {
    console.error('[SupplementLibrary] Failed to load supplement options:', error)
    uni.showToast({ title: '加载补剂失败', icon: 'none' })
  } finally {
    supplementLoading.value = false
    if (pendingSupplementOptionsReset) {
      pendingSupplementOptionsReset = false
      await loadSupplementOptions(true)
    }
  }
}

function clearSupplementSearchDebounce() {
  if (!supplementSearchDebounceTimer) return
  clearTimeout(supplementSearchDebounceTimer)
  supplementSearchDebounceTimer = null
}

function isSupplementOption(option: RecipeDesignerIngredientOption) {
  return String(option.type || '').trim().toUpperCase() === 'SUPPLEMENT'
}

function getSupplementOptionMeta(option: RecipeDesignerIngredientOption) {
  const profileCount = option.nutritionProfiles?.length || 0
  const brand = String(option.brand || '').trim()
  const model = String(option.productModel || '').trim()
  const parts = [
    brand,
    model,
    profileCount > 0 ? `${profileCount} 个营养档案` : '未关联营养档案',
  ].filter(Boolean)
  return parts.join(' · ')
}
</script>

<style scoped lang="scss">
.supplement-library-page {
  min-height: 100vh;
  padding: 24rpx 32rpx 64rpx;
  background: #f5f5f5;
  box-sizing: border-box;
}

.library-header,
.action-row,
.section-heading,
.supplement-option,
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

.library-header,
.section-heading,
.supplement-option {
  justify-content: space-between;
  gap: 20rpx;
}

.library-header {
  margin-bottom: 20rpx;
}

.library-title-block {
  flex: 1;
  min-width: 0;
}

.page-title {
  display: block;
  color: #222;
  font-size: 40rpx;
  font-weight: 800;
}

.page-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #777;
  font-size: 24rpx;
}

.primary-btn,
.plain-btn,
.link-btn,
.load-more-btn {
  height: 68rpx;
  margin: 0;
  border-radius: 10rpx;
  font-size: 26rpx;
  line-height: 68rpx;
}

.primary-btn {
  background: #1890ff;
  color: #fff;
}

.plain-btn {
  background: #f7f8fa;
  color: #555;
}

.link-btn {
  padding: 0 18rpx;
  border: 1rpx solid #d9d9d9;
  background: #fff;
  color: #333;
}

.header-create-btn {
  flex-shrink: 0;
  padding: 0 24rpx;
}

.action-panel,
.supplement-form-panel,
.library-section {
  margin-bottom: 20rpx;
  padding: 24rpx;
  border-radius: 12rpx;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.action-note {
  display: block;
  color: #667085;
  font-size: 23rpx;
  line-height: 1.45;
}

.action-row {
  gap: 12rpx;
  margin-top: 16rpx;
}

.state-block {
  padding: 100rpx 0;
  color: #888;
  font-size: 28rpx;
  text-align: center;
}

.state-block.compact {
  padding: 52rpx 0;
  font-size: 26rpx;
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
  max-height: 144rpx;
  margin-top: 6rpx;
  color: #667085;
  font-size: 20rpx;
  line-height: 1.45;
  overflow: hidden;
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

.supplement-all-fields-btn {
  flex-shrink: 0;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 22rpx;
}

.supplement-fields-scroll {
  max-height: 420rpx;
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

.section-title {
  color: #222;
  font-size: 30rpx;
  font-weight: 800;
}

.section-total {
  color: #777;
  font-size: 24rpx;
}

.search-row {
  margin-top: 20rpx;
}

.search-input {
  width: 100%;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 10rpx;
  background: #f7f8fa;
  color: #222;
  font-size: 26rpx;
  box-sizing: border-box;
}

.supplement-list {
  margin-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
}

.supplement-option {
  padding: 22rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.supplement-option-main {
  flex: 1;
  min-width: 0;
}

.supplement-option-name {
  display: block;
  color: #222;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 1.35;
}

.supplement-option-meta {
  display: block;
  margin-top: 6rpx;
  color: #777;
  font-size: 22rpx;
  line-height: 1.4;
}

.use-btn {
  flex-shrink: 0;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 22rpx;
}

.load-more-btn {
  width: 100%;
  margin-top: 18rpx;
  background: #f7f8fa;
  color: #555;
}
</style>
