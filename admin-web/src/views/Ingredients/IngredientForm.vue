<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="formRules"
    label-width="140px"
  >
    <!-- 基础信息 -->
    <div class="section-title">基础信息</div>

    <el-form-item label="原料名称" prop="name">
      <el-input
        v-model="formData.name"
        placeholder="请输入原料名称"
        maxlength="50"
        show-word-limit
      />
    </el-form-item>

    <el-form-item label="原料类型" prop="type">
      <el-radio-group v-model="formData.type" @change="handleTypeChange">
        <el-radio :value="IngredientType.FOOD">食材</el-radio>
        <el-radio :value="IngredientType.SUPPLEMENT">补剂</el-radio>
        <el-radio :value="IngredientType.PACKAGING">包材</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item label="品牌">
      <el-autocomplete
        v-model="formData.brand"
        :fetch-suggestions="querySearchBrands"
        placeholder="搜索或输入品牌"
        clearable
        style="width: 200px"
        :trigger-on-focus="false"
      />
    </el-form-item>

    <el-form-item label="产品型号/规格">
      <el-input
        v-model="formData.productModel"
        placeholder="如：1kg装、500g装"
        maxlength="50"
      />
    </el-form-item>

    <el-form-item label="采购渠道">
      <el-autocomplete
        v-model="formData.purchaseChannel"
        :fetch-suggestions="querySearchChannels"
        placeholder="搜索或输入采购渠道"
        clearable
        style="width: 200px"
        :trigger-on-focus="false"
      />
    </el-form-item>

    <el-form-item label="备注">
      <el-input
        v-model="formData.notes"
        type="textarea"
        :rows="2"
        placeholder="请输入备注"
        maxlength="200"
        show-word-limit
      />
    </el-form-item>

    <el-form-item label="标签分类">
      <el-select
        v-model="selectedTagIds"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="选择标签"
        style="width: 100%"
      >
        <el-option
          v-for="tag in allTags"
          :key="tag.id"
          :label="tag.name"
          :value="tag.id"
        >
          <div class="tag-option">
            <el-tag
              v-if="tag.color"
              :color="tag.color"
              size="small"
              effect="plain"
            >
              {{ tag.name }}
            </el-tag>
            <span v-else>{{ tag.name }}</span>
            <span class="tag-description">{{ tag.description || '' }}</span>
          </div>
        </el-option>
      </el-select>
      <div class="hint-text">可选择多个标签进行分类</div>
    </el-form-item>

    <!-- 单位与成本 -->
    <div class="section-title">单位与成本</div>

    <el-form-item label="基准单位" prop="baseUnit">
      <el-radio-group v-model="formData.baseUnit" @change="handleBaseUnitChange">
        <el-radio :value="BaseUnit.G">克 (G)</el-radio>
        <el-radio :value="BaseUnit.ML">毫升 (ML)</el-radio>
        <el-radio :value="BaseUnit.PCS">个/件 (PCS)</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item label="单位显示标签">
      <el-input
        v-model="formData.unitDisplayLabel"
        placeholder="可选，如：平勺、条"
        maxlength="20"
        style="width: 200px"
      />
      <span class="hint-text">覆盖默认单位显示</span>
    </el-form-item>

    <el-form-item label="采购单位" prop="purchaseUnit">
      <el-input
        v-model="formData.purchaseUnit"
        placeholder="如：kg、包、瓶"
        style="width: 200px"
      />
    </el-form-item>

    <el-form-item label="转换倍数" prop="purchaseToBaseRatio">
      <el-input-number
        v-model="formData.purchaseToBaseRatio"
        :min="0.01"
        :max="10000"
        :step="0.01"
        :precision="2"
        controls-position="right"
        style="width: 200px"
      />
      <span class="hint-text">采购单位 → 基准单位的转换倍数</span>
    </el-form-item>

    <el-form-item label="采购单价" prop="currentPricePerPurchaseUnit">
      <el-input-number
        v-model="formData.currentPricePerPurchaseUnit"
        :min="0"
        :max="100000"
        :step="0.01"
        :precision="2"
        controls-position="right"
        style="width: 200px"
      />
      <span class="unit-label">元 / {{ formData.purchaseUnit }}</span>
    </el-form-item>

    <el-form-item label="单位成本">
      <span class="cost-display">{{ calculatedUnitCost }} 元 / {{ BaseUnitLabels[formData.baseUnit] }}</span>
      <span class="hint-text">自动计算: 采购单价 ÷ 转换倍数</span>
    </el-form-item>

    <el-form-item v-if="formData.baseUnit === BaseUnit.PCS" label="单个重量(克)" prop="weightG">
      <el-input-number
        v-model="formData.weightG"
        :min="0.1"
        :max="100000"
        :step="0.1"
        :precision="1"
        controls-position="right"
        style="width: 200px"
      />
      <span class="unit-label">克</span>
      <span class="hint-text">PCS类型必填</span>
    </el-form-item>

    <el-form-item
      v-if="formData.type === IngredientType.PACKAGING && formData.baseUnit === BaseUnit.PCS"
      label="最大容量(克)"
    >
      <el-input-number
        v-model="formData.maxCapacityG"
        :min="1"
        :max="1000000"
        :step="1"
        controls-position="right"
        style="width: 200px"
      />
      <span class="unit-label">克</span>
      <span class="hint-text">包材装箱算法使用</span>
    </el-form-item>

    <!-- 类型特定属性 -->
    <div class="section-title">{{ getTypeSpecificTitle() }}</div>

    <!-- 食材属性 -->
    <template v-if="formData.type === IngredientType.FOOD">
      <el-form-item label="CFCT分类" prop="cfct_class">
        <el-select
          v-model="foodProperties.cfct_class"
          placeholder="请选择分类"
          style="width: 200px"
        >
          <el-option
            v-for="cls in CFCT_CLASS_OPTIONS"
            :key="cls"
            :label="cls"
            :value="cls"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="可食部比率" prop="edible_yield_rate">
        <el-input-number
          v-model="foodProperties.edible_yield_rate"
          :min="0.1"
          :max="1.0"
          :step="0.01"
          :precision="2"
          controls-position="right"
          style="width: 200px"
        />
        <span class="hint-text">去除不可食部分后的比率，如带骨肉类为0.85</span>
      </el-form-item>

      <el-form-item label="主要营养价值" prop="main_nutrients_desc">
        <el-input
          v-model="foodProperties.main_nutrients_desc"
          placeholder="如：高蛋白，低脂肪"
          maxlength="100"
        />
      </el-form-item>

      <el-form-item
        v-if="formData.baseUnit === BaseUnit.ML"
        label="密度(g/ml)"
        prop="density_g_per_ml"
      >
        <el-input-number
          v-model="foodProperties.density_g_per_ml"
          :min="0.1"
          :max="10"
          :step="0.01"
          :precision="3"
          controls-position="right"
          style="width: 200px"
        />
        <span class="hint-text">ML类型必填，用于体积→质量转换</span>
      </el-form-item>
    </template>

    <!-- 补剂属性 -->
    <template v-if="formData.type === IngredientType.SUPPLEMENT">
      <el-form-item label="营养分类" prop="category_type">
        <el-select
          v-model="supplementProperties.category_type"
          placeholder="请选择分类"
          style="width: 200px"
        >
          <el-option
            v-for="cat in SUPPLEMENT_CATEGORY_OPTIONS"
            :key="cat.value"
            :label="cat.label"
            :value="cat.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="有效成分浓度" prop="active_nutrients">
        <el-input
          v-model="activeNutrientsJson"
          type="textarea"
          :rows="3"
          placeholder='JSON格式，如：{"钙": 0.3, "锌": 0.05}'
          @input="handleActiveNutrientsChange"
        />
        <span class="hint-text">JSON格式，记录有效成分及其浓度</span>
      </el-form-item>

      <el-form-item label="生产损耗率">
        <el-input-number
          v-model="supplementProperties.production_loss_rate"
          :min="1.0"
          :max="2.0"
          :step="0.01"
          :precision="2"
          controls-position="right"
          style="width: 200px"
        />
        <span class="hint-text">可选，覆盖全局默认值1.05</span>
      </el-form-item>
    </template>

    <!-- 包材属性 -->
    <template v-if="formData.type === IngredientType.PACKAGING">
      <el-form-item label="消耗品类型" prop="is_consumable">
        <el-radio-group v-model="packagingProperties.is_consumable">
          <el-radio :value="true">消耗品</el-radio>
          <el-radio :value="false">固定资产</el-radio>
        </el-radio-group>
        <div class="hint-text">
          消耗品：每单消耗，计入成本（如真空袋、标签）<br>
          固定资产：重复使用，不计入单笔成本（如保温箱、密封盒）
        </div>
      </el-form-item>

      <el-form-item label="关联配件">
        <el-input
          v-model="packagingProperties.linked_item_id"
          placeholder="关联配件ID"
          style="width: 300px"
        />
        <span class="hint-text">可选，如4号箱绑定4号袋</span>
      </el-form-item>
    </template>

    <!-- Actions -->
    <el-form-item>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        保存
      </el-button>
      <el-button @click="handleCancel">取消</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { ingredientTagApi, type IngredientTag } from '@/api/ingredientTags'
import { ingredientApi } from '@/api/ingredients'
import type { Ingredient } from '@/types/ingredient'
import {
  IngredientType,
  BaseUnit,
  SupplementCategoryType,
  IngredientTypeLabels,
  BaseUnitLabels,
  CFCT_CLASS_OPTIONS,
  type IngredientForm,
  type FoodProperties,
  type SupplementProperties,
  type PackagingProperties
} from '@/types/ingredient'

interface Props {
  ingredient?: IngredientForm
}

interface Emits {
  (e: 'submit', data: IngredientForm): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const allTags = ref<IngredientTag[]>([])
const allIngredients = ref<Ingredient[]>([])
const selectedTagIds = ref<string[]>([])

const formData = reactive<IngredientForm>({
  id: props.ingredient?.id,
  name: props.ingredient?.name || '',
  type: props.ingredient?.type || IngredientType.FOOD,
  brand: props.ingredient?.brand || '',
  productModel: props.ingredient?.productModel || '',
  purchaseChannel: props.ingredient?.purchaseChannel || '',
  notes: props.ingredient?.notes || '',
  baseUnit: props.ingredient?.baseUnit || BaseUnit.G,
  unitDisplayLabel: props.ingredient?.unitDisplayLabel || '',
  purchaseUnit: props.ingredient?.purchaseUnit || 'kg',
  purchaseToBaseRatio: props.ingredient?.purchaseToBaseRatio ?? 1.0,
  currentPricePerPurchaseUnit: props.ingredient?.currentPricePerPurchaseUnit ?? 0,
  weightG: props.ingredient?.weightG,
  maxCapacityG: props.ingredient?.maxCapacityG,
  properties: props.ingredient?.properties || getDefaultProperties(IngredientType.FOOD),
  tagIds: props.ingredient?.tagIds || []
})

// 类型特定属性
const foodProperties = reactive<FoodProperties>(
  (formData.type === IngredientType.FOOD ? formData.properties : getDefaultFoodProperties())
)

const supplementProperties = reactive<SupplementProperties>(
  (formData.type === IngredientType.SUPPLEMENT ? formData.properties : getDefaultSupplementProperties())
)

const packagingProperties = reactive<PackagingProperties>(
  (formData.type === IngredientType.PACKAGING ? formData.properties : getDefaultPackagingProperties())
)

// 有效成分JSON显示
const activeNutrientsJson = ref('')

// 补充分类选项
const SUPPLEMENT_CATEGORY_OPTIONS = Object.entries({
  [SupplementCategoryType.MINERAL]: '矿物质',
  [SupplementCategoryType.VITAMIN]: '维生素',
  [SupplementCategoryType.AMINO_ACID]: '氨基酸',
  [SupplementCategoryType.FATTY_ACID]: '脂肪酸',
  [SupplementCategoryType.PROBIOTIC]: '益生菌',
  [SupplementCategoryType.FUNCTIONAL]: '功能性成分',
  [SupplementCategoryType.OTHER]: '其他'
}).map(([value, label]) => ({ value, label }))

// 计算属性
const calculatedUnitCost = computed(() => {
  const cost = formData.currentPricePerPurchaseUnit / formData.purchaseToBaseRatio
  return cost.toFixed(4)
})

// 方法
function getDefaultProperties(type: IngredientType): FoodProperties | SupplementProperties | PackagingProperties {
  switch (type) {
    case IngredientType.FOOD:
      return getDefaultFoodProperties()
    case IngredientType.SUPPLEMENT:
      return getDefaultSupplementProperties()
    case IngredientType.PACKAGING:
      return getDefaultPackagingProperties()
  }
}

function getDefaultFoodProperties(): FoodProperties {
  return {
    cfct_class: '',
    edible_yield_rate: 1.0,
    main_nutrients_desc: ''
  }
}

function getDefaultSupplementProperties(): SupplementProperties {
  return {
    category_type: '',
    active_nutrients: {}
  }
}

function getDefaultPackagingProperties(): PackagingProperties {
  return {
    is_consumable: true
  }
}

function getTypeSpecificTitle() {
  switch (formData.type) {
    case IngredientType.FOOD:
      return '食材属性'
    case IngredientType.SUPPLEMENT:
      return '补剂属性'
    case IngredientType.PACKAGING:
      return '包材属性'
  }
}

function handleTypeChange() {
  // 切换类型时，重置特定属性为默认值
  const defaultProps = getDefaultProperties(formData.type)
  formData.properties = defaultProps

  // 更新响应式对象
  if (formData.type === IngredientType.FOOD) {
    Object.assign(foodProperties, defaultProps)
  } else if (formData.type === IngredientType.SUPPLEMENT) {
    Object.assign(supplementProperties, defaultProps)
  } else if (formData.type === IngredientType.PACKAGING) {
    Object.assign(packagingProperties, defaultProps)
  }
}

function handleBaseUnitChange() {
  // 当切换baseUnit时，处理density字段
  if (formData.type === IngredientType.FOOD) {
    if (formData.baseUnit !== BaseUnit.ML) {
      // 如果不是ML类型，清除density字段以避免验证问题
      delete foodProperties.density_g_per_ml
    }
  }
}

function handleActiveNutrientsChange(value: string) {
  try {
    supplementProperties.active_nutrients = JSON.parse(value || '{}')
  } catch (error) {
    // Invalid JSON, ignore
  }
}

function syncProperties() {
  if (formData.type === IngredientType.FOOD) {
    formData.properties = { ...foodProperties }
  } else if (formData.type === IngredientType.SUPPLEMENT) {
    formData.properties = { ...supplementProperties }
  } else if (formData.type === IngredientType.PACKAGING) {
    formData.properties = { ...packagingProperties }
  }
}

// Load tags
const loadTags = async () => {
  try {
    allTags.value = await ingredientTagApi.list()
  } catch (error: any) {
    console.error('Failed to load tags:', error)
  }
}

// Load all ingredients for brand/channel suggestions
const loadIngredients = async () => {
  try {
    allIngredients.value = await ingredientApi.list()
  } catch (error: any) {
    console.error('Failed to load ingredients:', error)
  }
}

// Query search brands
const querySearchBrands = (queryString: string, cb: any) => {
  const brands = [...new Set(allIngredients.value.map(i => i.brand).filter((b): b is string => Boolean(b)))]
  const results = queryString
    ? brands.filter(b => b.toLowerCase().includes(queryString.toLowerCase()))
    : brands
  cb(results.map(b => ({ value: b })))
}

// Query search channels
const querySearchChannels = (queryString: string, cb: any) => {
  const channels = [...new Set(allIngredients.value.map(i => i.purchaseChannel).filter((c): c is string => Boolean(c)))]
  const results = queryString
    ? channels.filter(c => c.toLowerCase().includes(queryString.toLowerCase()))
    : channels
  cb(results.map(c => ({ value: c })))
}

// Watch for tagIds changes
watch(selectedTagIds, (newIds) => {
  formData.tagIds = newIds
})

// Watch for ingredient changes
watch(() => props.ingredient, (newIngredient) => {
  if (newIngredient) {
    Object.assign(formData, newIngredient)

    // Update type-specific properties
    if (newIngredient.type === IngredientType.FOOD) {
      Object.assign(foodProperties, newIngredient.properties as FoodProperties)
    } else if (newIngredient.type === IngredientType.SUPPLEMENT) {
      Object.assign(supplementProperties, newIngredient.properties as SupplementProperties)
      activeNutrientsJson.value = JSON.stringify((newIngredient.properties as SupplementProperties).active_nutrients, null, 2)
    } else if (newIngredient.type === IngredientType.PACKAGING) {
      Object.assign(packagingProperties, newIngredient.properties as PackagingProperties)
    }

    // Update selected tag IDs
    if (newIngredient.tagIds) {
      selectedTagIds.value = newIngredient.tagIds
    }
  }

  // Reload ingredients data whenever form is opened (ingredient prop changes)
  // This ensures brand/channel suggestions are up-to-date
  loadIngredients()
}, { immediate: true })

// Lifecycle
onMounted(() => {
  loadTags()
  // loadIngredients() is called by watch with immediate: true
})

// 表单验证规则
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入原料名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择原料类型', trigger: 'change' }
  ],
  baseUnit: [
    { required: true, message: '请选择基准单位', trigger: 'change' }
  ],
  purchaseUnit: [
    { required: true, message: '请输入采购单位', trigger: 'blur' }
  ],
  purchaseToBaseRatio: [
    { required: true, message: '请输入转换倍数', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '转换倍数必须大于0', trigger: 'blur' }
  ],
  currentPricePerPurchaseUnit: [
    { required: true, message: '请输入采购单价', trigger: 'blur' },
    { type: 'number', min: 0, message: '采购单价必须大于等于0', trigger: 'blur' }
  ],
  weightG: [
    {
      type: 'number',
      min: 0.1,
      message: '单个重量必须大于0',
      trigger: 'blur',
      validator: (rule, value, callback) => {
        if (formData.baseUnit === BaseUnit.PCS && (value === null || value === undefined)) {
          callback(new Error('PCS类型必须填写单个重量'))
        } else if (formData.baseUnit === BaseUnit.PCS && value !== null && value < 0.1) {
          callback(new Error('单个重量必须大于0'))
        } else {
          callback()
        }
      }
    }
  ]
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    // 基础验证
    await formRef.value.validate()

    // 类型特定属性验证
    if (formData.type === IngredientType.FOOD) {
      // 食材验证
      if (!foodProperties.cfct_class) {
        throw new Error('请选择CFCT分类')
      }
      if (!foodProperties.edible_yield_rate || foodProperties.edible_yield_rate < 0.1 || foodProperties.edible_yield_rate > 1.0) {
        throw new Error('可食部比率必须在0.1到1.0之间')
      }
      if (formData.baseUnit === BaseUnit.ML && (!foodProperties.density_g_per_ml || foodProperties.density_g_per_ml <= 0)) {
        throw new Error('ML类型必须输入密度且必须大于0')
      }
    } else if (formData.type === IngredientType.SUPPLEMENT) {
      // 补剂验证
      if (!supplementProperties.category_type) {
        throw new Error('请选择营养分类')
      }
      if (!supplementProperties.active_nutrients || Object.keys(supplementProperties.active_nutrients).length === 0) {
        throw new Error('请至少添加一种有效成分')
      }
      // 验证active_nutrients JSON格式
      try {
        if (typeof activeNutrientsJson.value === 'string' && activeNutrientsJson.value) {
          JSON.parse(activeNutrientsJson.value)
        }
      } catch (e) {
        throw new Error('有效成分浓度JSON格式不正确')
      }
    } else if (formData.type === IngredientType.PACKAGING) {
      // 包材验证
      if (packagingProperties.is_consumable === null || packagingProperties.is_consumable === undefined) {
        throw new Error('请选择消耗品类型')
      }
    }

    syncProperties()
    submitting.value = true
    emit('submit', { ...formData })
  } catch (error: any) {
    // Validation failed
    const message = error?.message || '表单验证失败'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.section-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  margin: 24px 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #dcdfe6;
}

.unit-label {
  margin-left: 8px;
  color: #606266;
  font-size: 14px;
}

.hint-text {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
  display: block;
  margin-top: 4px;
  line-height: 1.5;
}

.cost-display {
  font-size: 16px;
  font-weight: 500;
  color: #409eff;
}

.tag-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tag-description {
  color: #909399;
  font-size: 12px;
}
</style>
