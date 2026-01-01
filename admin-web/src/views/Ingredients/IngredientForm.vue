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
      <el-autocomplete
        v-model="formData.name"
        :fetch-suggestions="querySearchIngredients"
        placeholder="输入名称或拼音首字母（如：jxr）"
        maxlength="50"
        show-word-limit
        clearable
        style="width: 100%"
        :trigger-on-focus="false"
        @select="handleIngredientSelect"
        @input="handleIngredientInput"
      />
      <!-- 相似原料提示 -->
      <div v-if="similarIngredients.length > 0" class="similar-ingredients-warning">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
        >
          <template #title>
            <span>已存在相似原料：</span>
            <el-tag
              v-for="item in similarIngredients"
              :key="item.id"
              type="warning"
              size="small"
              style="margin: 0 4px"
              @click="formData.name = item.name; similarIngredients = []"
              class="similar-tag"
            >
              {{ item.name }} ({{ Math.round(item.similarity * 100) }}%)
            </el-tag>
          </template>
        </el-alert>
      </div>
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
      <div class="tag-selector-wrapper">
        <!-- 操作按钮 -->
        <div class="tag-selector-actions">
          <span class="selected-count">已选 {{ selectedTagIds.length }} 个</span>
          <el-button size="small" @click="selectAllTags">全选</el-button>
          <el-button size="small" @click="clearAllTags">取消全选</el-button>
          <el-button type="primary" size="small" @click="showCreateTagDialog">
            <el-icon><Plus /></el-icon>
            快速新建
          </el-button>
        </div>

        <!-- 标签列表 -->
        <div v-if="allTags.length > 0" class="tag-list">
          <el-tag
            v-for="tag in allTags"
            :key="tag.id"
            class="tag-item"
            :type="selectedTagIds.includes(tag.id) ? 'primary' : 'info'"
            @click="toggleTag(tag.id)"
            style="cursor: pointer"
          >
            {{ tag.name }}
          </el-tag>
        </div>

        <!-- 空状态 -->
        <div v-else class="empty-tags-state">
          <el-empty description="暂无标签，请先创建标签">
            <el-button type="primary" @click="showCreateTagDialog">创建第一个标签</el-button>
          </el-empty>
        </div>
      </div>
      <div class="hint-text">点击标签选择，可多选</div>

      <!-- 快速新建标签对话框 -->
      <el-dialog
        v-model="createTagDialogVisible"
        title="快速新建标签"
        width="500px"
        :close-on-click-modal="false"
      >
        <el-form :model="newTagForm" label-width="80px">
          <el-form-item label="标签名称" required>
            <el-input
              v-model="newTagForm.name"
              placeholder="请输入标签名称"
              maxlength="20"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="描述">
            <el-input
              v-model="newTagForm.description"
              type="textarea"
              :rows="2"
              placeholder="请输入标签描述（可选）"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="颜色">
            <el-color-picker v-model="newTagForm.color" />
            <span class="hint-text">可选，为标签设置颜色标识</span>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createTagDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleCreateTag" :loading="creatingTag">
            创建并选中
          </el-button>
        </template>
      </el-dialog>
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
      <span class="hint-text">替换基准单位在食谱中的显示名称</span>
    </el-form-item>

    <el-form-item label="采购单位" prop="purchaseUnit">
      <el-autocomplete
        v-model="formData.purchaseUnit"
        :fetch-suggestions="querySearchUnits"
        placeholder="输入或选择单位（如：kg、箱、瓶）"
        clearable
        style="width: 200px"
        :trigger-on-focus="false"
        @select="handleUnitSelect"
        @input="handleUnitInput"
      />
      <!-- 相似单位提示 -->
      <div v-if="similarUnits.length > 0" class="similar-units-warning">
        <el-alert
          type="info"
          :closable="false"
          show-icon
        >
          <template #title>
            <span>相似的标准单位：</span>
            <el-tag
              v-for="unit in similarUnits"
              :key="unit"
              type="info"
              size="small"
              style="margin: 0 4px"
              @click="formData.purchaseUnit = unit; similarUnits = []"
              class="similar-unit-tag"
            >
              {{ unit }}
            </el-tag>
          </template>
        </el-alert>
      </div>
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
      <span class="hint-text">
        <span v-if="formData.type === IngredientType.PACKAGING">必填（装箱算法需要）</span>
        <span v-else-if="formData.type === IngredientType.SUPPLEMENT">可选（用于运费计算，不填默认为0）</span>
        <span v-else>可选</span>
      </span>
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

      <el-form-item label="有效成分含量" prop="active_nutrients">
        <div class="nutrient-editor">
          <!-- 成分列表表格 -->
          <div class="nutrient-list">
            <div
              v-for="(nutrient, index) in nutrientList"
              :key="index"
              class="nutrient-row-enhanced"
            >
              <!-- 成分名称 -->
              <el-autocomplete
                v-model="nutrient.name"
                :fetch-suggestions="querySearchNutrients"
                placeholder="成分名称（如：钙、EPA）"
                style="width: 180px"
                :trigger-on-focus="false"
                clearable
              />

              <!-- 含量值 -->
              <el-input-number
                v-model="nutrient.displayValue"
                :min="0"
                :step="1"
                :precision="0"
                controls-position="right"
                :placeholder="formData.baseUnit === BaseUnit.PCS ? '每粒含量' : '每克含量'"
                style="width: 120px"
                @change="(val: number) => calculateConcentration(nutrient, val)"
              />

              <!-- 单位选择 -->
              <el-select
                v-model="nutrient.unit"
                style="width: 120px"
                @change="(val: string) => calculateConcentration(nutrient, nutrient.displayValue)"
              >
                <el-option
                  v-for="unit in NUTRIENT_UNITS"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
                />
              </el-select>

              <!-- 删除按钮 -->
              <el-button
                type="danger"
                :icon="Delete"
                circle
                size="small"
                @click="removeNutrient(index)"
                :disabled="nutrientList.length === 1"
              />
            </div>
          </div>

          <!-- 添加成分按钮 -->
          <el-button
            type="primary"
            :icon="Plus"
            size="small"
            @click="addNutrient"
            style="margin-top: 8px"
          >
            添加成分
          </el-button>

          <div class="hint-text" style="margin-top: 8px;">
            <div v-if="formData.baseUnit === BaseUnit.PCS">
              💡 输入每粒胶囊/片剂的营养素含量（查看产品标签）
            </div>
            <div v-else>
              💡 输入每克粉末的营养素含量
            </div>
          </div>
        </div>
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
import { ref, reactive, watch, computed, onMounted, nextTick } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus, CircleCheck, Delete } from '@element-plus/icons-vue'
import { ingredientTagApi, type IngredientTag, type CreateTagDto } from '@/api/ingredientTags'
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
const similarIngredients = ref<Array<{ id: string; name: string; similarity: number }>>([])
const similarUnits = ref<string[]>([])

// 常用采购单位数据库
const COMMON_PURCHASE_UNITS = [
  'kg', 'g', '斤', '两', '吨',  // 重量单位
  '箱', '盒', '瓶', '袋', '包', '桶',  // 容器单位
  '个', '片', '粒', '条', '块', '张',  // 计数单位
  '米', '卷', '捆', '把', '扎',  // 长度/束状单位
  '升', '毫升', 'ml', 'L', 'ml'  // 容积单位
]

// 单位别名映射表（别名 -> 标准单位）
const UNIT_ALIASES: Record<string, string> = {
  // kg 别名
  'KG': 'kg',
  'Kg': 'kg',
  '公斤': 'kg',
  '千克': 'kg',
  'kilo': 'kg',

  // g 别名
  'G': 'g',
  '克': 'g',
  'gram': 'g',
  '公克': 'g',

  // 斤两
  '市斤': '斤',
  '市两': '两',

  // 箱盒
  '箱子': '箱',
  '盒子': '盒',
  '纸箱': '箱'
}

// 拼音映射表（常用汉字）
const PINYIN_MAP: Record<string, string> = {
  '鸡': 'j', '胸': 'x', '肉': 'r', '腿': 't', '肝': 'g', '心': 'x',
  '猪': 'z', '牛': 'n', '羊': 'y', '鸭': 'y', '鹅': 'e',
  '鱼': 'y', '虾': 'x', '蟹': 'x', '贝': 'b',
  '胡': 'h', '萝': 'l', '卜': 'b', '白': 'b', '红': 'h',
  '南': 'n', '瓜': 'g', '冬': 'd', '黄': 'h', '苦': 'k',
  '大': 'd', '小': 'x', '绿': 'l', '青': 'q', '洋': 'y',
  '土': 't', '番': 'f', '茄': 'q', '椒': 'j', '芹': 'q',
  '菠': 'b', '菜': 'c', '葱': 'c', '蒜': 's', '姜': 'j',
  '苹': 'p', '果': 'g', '香': 'x', '蕉': 'j', '梨': 'l',
  '桃': 't', '杏': 'x', '李': 'l', '枣': 'z', '橘': 'j',
  '豆': 'd', '腐': 'f', '芽': 'y', '干': 'g',
  '玉': 'y', '米': 'm', '面': 'm', '粉': 'f',
  '奶': 'n', '酸': 's', '蛋': 'd',
  '油': 'y', '盐': 'y', '糖': 't'
}

// 快速创建标签相关
const createTagDialogVisible = ref(false)
const creatingTag = ref(false)
const newTagForm = reactive({
  name: '',
  description: '',
  color: ''
})

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

// 编辑模式判断
const isEdit = computed(() => !!props.ingredient?.id)

// 有效成分列表管理
interface NutrientItem {
  name: string
  value: number  // 浓度值（0-1之间的小数，用于后端计算）
  displayValue: number  // 显示值（用户输入的含量，如500mg）
  unit: string  // 单位（mg、g、μg、IU等）
}

// 营养成分单位枚举
const NUTRIENT_UNITS = [
  { label: 'mg (毫克)', value: 'mg' },
  { label: 'g (克)', value: 'g' },
  { label: 'μg (微克)', value: 'μg' },
  { label: 'IU (国际单位)', value: 'IU' },
  { label: '% (百分比)', value: '%' }
]

const nutrientList = ref<NutrientItem[]>([
  { name: '', value: 0, displayValue: 0, unit: 'mg' }
])

// 常见营养成分列表（用于自动补全）
const COMMON_NUTRIENTS = [
  // 矿物质
  '钙', '铁', '锌', '镁', '钾', '钠', '磷', '碘', '硒', '铜', '锰', '铬',
  // 维生素
  '维生素A', '维生素D', '维生素E', '维生素K',
  '维生素B1', '维生素B2', '维生素B3', '维生素B5', '维生素B6', '维生素B12', '维生素C',
  '叶酸', '生物素',
  // 氨基酸
  '赖氨酸', '蛋氨酸', '色氨酸',
  // 脂肪酸
  'EPA', 'DHA', '亚油酸', 'α-亚麻酸',
  // 其他
  '益生菌', '益生元', '膳食纤维', '蛋白质', '胶原蛋白', '辅酶Q10'
]

// 搜索营养成分（用于自动补全）
const querySearchNutrients = (queryString: string, cb: any) => {
  const results = COMMON_NUTRIENTS
    .filter(nutrient => nutrient.toLowerCase().includes(queryString.toLowerCase()))
    .map(nutrient => ({ value: nutrient }))
  cb(results)
}

// 添加成分
const addNutrient = () => {
  nutrientList.value.push({ name: '', value: 0, displayValue: 0, unit: 'mg' })
}

// 删除成分
const removeNutrient = (index: number) => {
  if (nutrientList.value.length > 1) {
    nutrientList.value.splice(index, 1)
  }
}

// 计算浓度：根据显示值和单位计算浓度值
const calculateConcentration = (nutrient: NutrientItem, displayValue: number | undefined) => {
  if (displayValue === undefined || displayValue === null) {
    nutrient.value = 0
    return
  }

  // 单位换算系数（转换为克）
  const unitConversions: Record<string, number> = {
    'mg': 0.001,      // 1mg = 0.001g
    'g': 1,           // 1g = 1g
    'μg': 0.000001,   // 1μg = 0.000001g
    'IU': 0.001,      // 1IU ≈ 0.001g (简化处理，实际需要根据具体营养素换算)
    '%': 0.01         // 1% = 0.01g
  }

  // 将显示值转换为克数
  const valueInGrams = displayValue * (unitConversions[nutrient.unit] || 0.001)

  // ✅ Bug 1 修复: 直接存储"每基准单位的含量(克)"
  // 根据文档: active_nutrients的Value是"每1个基准单位(1g粉 or 1粒) 含有的数值"
  // - PCS类型: value = 每粒含有的克数
  // - G类型: value = 每克粉末含有的克数
  // 不需要除以purchaseToBaseRatio或weightG!
  nutrient.value = valueInGrams
}

// 将显示值和单位转换为克数（用于内部计算）
const convertToGrams = (displayValue: number, unit: string): number => {
  const unitConversions: Record<string, number> = {
    'mg': 0.001,      // 1mg = 0.001g
    'g': 1,           // 1g = 1g
    'μg': 0.000001,   // 1μg = 0.000001g
    'IU': 0.001,      // 1IU ≈ 0.001g (简化处理，实际需要根据具体营养素换算)
    '%': 0.01         // 1% = 0.01g
  }
  return displayValue * (unitConversions[unit] || 0.001)
}

// 监听成分列表变化，同步到active_nutrients对象
watch(
  () => nutrientList.value,
  (newList) => {
    const activeNutrients: Record<string, {value: number, unit: string}> = {}
    newList.forEach(item => {
      if (item.name && item.displayValue > 0) {
        // 保存原始显示值和单位
        activeNutrients[item.name] = {
          value: item.displayValue,
          unit: item.unit
        }
      }
    })
    supplementProperties.active_nutrients = activeNutrients
  },
  { deep: true }
)

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

// 拼音转换函数（转首字母）
const convertToPinyin = (text: string): string => {
  let result = ''
  for (const char of text) {
    result += PINYIN_MAP[char] || char
  }
  return result.toLowerCase()
}

// Levenshtein距离算法（计算字符串相似度）
const calculateSimilarity = (str1: string, str2: string): number => {
  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0) return len2 === 0 ? 1 : 0
  if (len2 === 0) return 0

  const matrix: number[][] = []
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  const maxLen = Math.max(len1, len2)
  return 1 - matrix[len1][len2] / maxLen
}

// 查询原料（支持拼音首字母搜索）
const querySearchIngredients = (queryString: string, cb: any) => {
  if (!queryString || queryString.length < 1) {
    cb([])
    return
  }

  const searchLower = queryString.toLowerCase()
  const results: Array<{ value: string; item: Ingredient }> = []
  const addedNames = new Set<string>() // 用于追踪已添加的名称，去重

  allIngredients.value.forEach(ingredient => {
    // 排除当前编辑的原料
    if (formData.id && ingredient.id === formData.id) return

    // 检查名称是否已经添加过（去重）
    if (addedNames.has(ingredient.name)) return

    // 完全匹配
    if (ingredient.name.toLowerCase().includes(searchLower)) {
      results.push({ value: ingredient.name, item: ingredient })
      addedNames.add(ingredient.name) // 标记名称为已添加
      return
    }

    // 拼音首字母匹配
    const pinyin = convertToPinyin(ingredient.name)
    if (pinyin.includes(searchLower)) {
      results.push({ value: ingredient.name, item: ingredient })
      addedNames.add(ingredient.name) // 标记名称为已添加
    }
  })

  cb(results.slice(0, 10)) // 限制最多显示10条
}

// 处理原料输入，检测相似原料
const handleIngredientInput = (value: string) => {
  if (!value || value.length < 2) {
    similarIngredients.value = []
    return
  }

  const similarities: Array<{ id: string; name: string; similarity: number }> = []

  allIngredients.value.forEach(ingredient => {
    // 排除当前编辑的原料
    if (formData.id && ingredient.id === formData.id) return

    // 排除完全相同的名称
    if (ingredient.name === value) return

    // 计算相似度
    const similarity = calculateSimilarity(value, ingredient.name)

    // 相似度大于60%才提示
    if (similarity > 0.6) {
      similarities.push({
        id: ingredient.id,
        name: ingredient.name,
        similarity
      })
    }
  })

  // 按相似度排序，取前3个
  similarIngredients.value = similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
}

// 处理原料选择
const handleIngredientSelect = (item: any) => {
  similarIngredients.value = []
}

// 搜索单位（支持别名匹配）
const querySearchUnits = (queryString: string, cb: any) => {
  if (!queryString || queryString.length < 1) {
    cb([])
    return
  }

  const searchLower = queryString.toLowerCase()
  const results: Array<{ value: string }> = []

  // 1. 精确匹配常用单位
  COMMON_PURCHASE_UNITS.forEach(unit => {
    if (unit.toLowerCase().includes(searchLower)) {
      results.push({ value: unit })
    }
  })

  // 2. 检查是否为别名，如果返回标准单位
  if (results.length === 0 && UNIT_ALIASES[queryString]) {
    results.push({ value: UNIT_ALIASES[queryString] })
  }

  // 3. 检查别名映射表中包含搜索词的单位
  Object.entries(UNIT_ALIASES).forEach(([alias, standard]) => {
    if (alias.toLowerCase().includes(searchLower) && !results.find(r => r.value === standard)) {
      results.push({ value: standard })
    }
  })

  cb(results.slice(0, 8)) // 限制最多显示8条
}

// 处理单位输入，检测相似标准单位
const handleUnitInput = (value: string) => {
  if (!value || value.length < 1) {
    similarUnits.value = []
    return
  }

  const inputLower = value.toLowerCase()
  const suggestions: string[] = []

  // 1. 检查是否为别名，提示标准单位
  if (UNIT_ALIASES[value]) {
    suggestions.push(UNIT_ALIASES[value])
  }

  // 2. 查找相似的常用单位（基于包含关系）
  COMMON_PURCHASE_UNITS.forEach(unit => {
    if (unit !== value && !suggestions.includes(unit)) {
      // 输入是单位的子串或单位包含输入
      if (unit.toLowerCase().includes(inputLower) || inputLower.includes(unit.toLowerCase())) {
        suggestions.push(unit)
      }
    }
  })

  // 3. 检查别名映射表
  Object.entries(UNIT_ALIASES).forEach(([alias, standard]) => {
    if (alias.toLowerCase().includes(inputLower) && !suggestions.includes(standard)) {
      suggestions.push(standard)
    }
  })

  // 去重并限制数量
  similarUnits.value = [...new Set(suggestions)].slice(0, 3)
}

// 处理单位选择
const handleUnitSelect = (item: any) => {
  similarUnits.value = []
}

// 标签选择相关方法
const toggleTag = (tagId: string) => {
  const index = selectedTagIds.value.indexOf(tagId)
  if (index > -1) {
    selectedTagIds.value.splice(index, 1)
  } else {
    selectedTagIds.value.push(tagId)
  }
}

const selectAllTags = () => {
  selectedTagIds.value = allTags.value.map(tag => tag.id)
  ElMessage.success('已选中所有标签')
}

const clearAllTags = () => {
  selectedTagIds.value = []
  ElMessage.info('已取消所有选中')
}

// 快速创建标签相关方法
const showCreateTagDialog = () => {
  // 重置表单
  newTagForm.name = ''
  newTagForm.description = ''
  newTagForm.color = ''
  createTagDialogVisible.value = true
}

const handleCreateTag = async () => {
  // 验证
  if (!newTagForm.name.trim()) {
    ElMessage.warning('请输入标签名称')
    return
  }

  try {
    creatingTag.value = true

    const createData: CreateTagDto = {
      name: newTagForm.name.trim(),
      description: newTagForm.description.trim() || null,
      color: newTagForm.color || null
    }

    const newTag = await ingredientTagApi.create(createData)

    // 重新加载标签列表
    await loadTags()

    // 自动选中新创建的标签
    selectedTagIds.value.push(newTag.id)

    // 关闭对话框
    createTagDialogVisible.value = false
    ElMessage.success(`标签"${newTag.name}"创建成功并已选中`)
  } catch (error: any) {
    console.error('Failed to create tag:', error)
    ElMessage.error(error?.message || '创建标签失败')
  } finally {
    creatingTag.value = false
  }
}

// Watch for tagIds changes
watch(selectedTagIds, (newIds) => {
  formData.tagIds = newIds
})

// Watch for ingredient changes
watch(() => props.ingredient, (newIngredient, oldIngredient) => {
  // 只在从编辑切换到新增时重置表单
  if (oldIngredient && !newIngredient) {
    // ✅ 修复：当新增原料时，重置表单数据（清除 id 等字段）
    formData.id = undefined
    formData.name = ''
    formData.type = IngredientType.FOOD
    formData.brand = ''
    formData.productModel = ''
    formData.purchaseChannel = ''
    formData.notes = ''
    formData.baseUnit = BaseUnit.G
    formData.unitDisplayLabel = ''
    formData.purchaseUnit = 'kg'
    formData.purchaseToBaseRatio = 1.0
    formData.currentPricePerPurchaseUnit = 0
    formData.weightG = undefined
    formData.maxCapacityG = undefined
    formData.properties = getDefaultProperties(IngredientType.FOOD)
    formData.tagIds = []

    // 重置类型特定属性
    Object.assign(foodProperties, getDefaultFoodProperties())
    Object.assign(supplementProperties, getDefaultSupplementProperties())
    Object.assign(packagingProperties, getDefaultPackagingProperties())

    // 重置其他状态
    selectedTagIds.value = []
    nutrientList.value = [{ name: '', value: 0, displayValue: 0, unit: 'mg' }]
    similarIngredients.value = []
    similarUnits.value = []

    // 清除表单验证状态
    nextTick(() => {
      formRef.value?.clearValidate()
    })
  } else if (newIngredient) {
    // ✅ 重置相似原料提示和单位提示
    similarIngredients.value = []
    similarUnits.value = []

    Object.assign(formData, newIngredient)

    // Update type-specific properties
    if (newIngredient.type === IngredientType.FOOD) {
      Object.assign(foodProperties, newIngredient.properties as FoodProperties)
    } else if (newIngredient.type === IngredientType.SUPPLEMENT) {
      Object.assign(supplementProperties, newIngredient.properties as SupplementProperties)
      // ✅ 从active_nutrients读取原始值和单位（新格式: {value: number, unit: string}）
      const nutrients = (newIngredient.properties as SupplementProperties).active_nutrients || {}
      const nutrientArray = Object.entries(nutrients).map(([name, data]) => {
        // data 现在是 {value: number, unit: string} 格式
        const displayValue = (data as any).value  // 原始显示值
        const unit = (data as any).unit           // 单位
        const valueInGrams = convertToGrams(displayValue, unit)  // 转换为克用于内部计算
        return { name, value: valueInGrams, displayValue, unit }
      })
      nutrientList.value = nutrientArray.length > 0 ? nutrientArray : [{ name: '', value: 0, displayValue: 0, unit: 'mg' }]
    } else if (newIngredient.type === IngredientType.PACKAGING) {
      Object.assign(packagingProperties, newIngredient.properties as PackagingProperties)
    }

    // Update selected tag IDs
    if (newIngredient.tagIds) {
      selectedTagIds.value = newIngredient.tagIds
    }

    // 清除表单验证状态
    nextTick(() => {
      formRef.value?.clearValidate()
    })
  }

  // Reload ingredients data whenever form is opened (ingredient prop changes)
  // This ensures brand/channel suggestions are up-to-date
  loadIngredients()
})

// Lifecycle
onMounted(() => {
  loadTags()
  loadIngredients()  // ✅ 确保组件加载时获取原料列表
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
        // ✅ 方案A: 只有包材类型的PCS才强制要求weightG
        if (formData.type === IngredientType.PACKAGING &&
            formData.baseUnit === BaseUnit.PCS &&
            (value === null || value === undefined)) {
          callback(new Error('包材(PCS类型)必须填写单个重量'))
        } else if (value !== null && value !== undefined && value < 0.1) {
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

/* 相似原料提示样式 */
.similar-ingredients-warning {
  margin-top: 8px;
}

.similar-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.similar-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(230, 162, 60, 0.3);
}

/* 相似单位提示样式 */
.similar-units-warning {
  margin-top: 8px;
}

.similar-unit-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.similar-unit-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.3);
}

/* 营养成分表格编辑器样式 */
.nutrient-editor {
  width: 100%;
}

.nutrient-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 12px;
}

.nutrient-row-enhanced {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.nutrient-row-enhanced .el-autocomplete {
  flex: 0 0 auto;
}

.concentration-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: #e4e7ed;
  border-radius: 4px;
  min-width: 100px;
}

.concentration-label {
  font-size: 12px;
  color: #606266;
}

.concentration-value {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  font-family: 'Courier New', monospace;
}

/* 标签选择器样式 */
.tag-selector-wrapper {
  width: 100%;
}

.tag-selector-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 6px;
}

.selected-count {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-height: 120px;
  overflow-y: auto;
  padding: 8px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.tag-item {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 14px;
}

.empty-tags-state {
  padding: 40px 20px;
  text-align: center;
}

/* 旧样式保留（兼容） */
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
