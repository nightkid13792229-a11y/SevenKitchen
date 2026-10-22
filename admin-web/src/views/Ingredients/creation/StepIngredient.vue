<template>
  <section class="creation-step ingredient-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">⑤</span>
      <div>
        <h2 class="creation-step__title">原料档案</h2>
        <p class="creation-step__summary">
          只补齐标准原料的基础字段；拿不准的留空标「待补」，不阻断。
        </p>
      </div>
    </header>

    <el-form class="ingredient-form" label-position="top" @submit.prevent="submit">
      <div class="field-grid">
        <el-form-item label="原料名称" required>
          <el-input
            v-model="form.name"
            maxlength="50"
            show-word-limit
            clearable
            placeholder="例如：鸡肝"
          />
          <p class="field-hint">
            默认取 ① 起手页的中文名；这里改了只影响正式原料，不改检索口径卡。
          </p>
        </el-form-item>

        <el-form-item label="原料类型">
          <div class="readonly-value">
            <el-tag type="success" effect="light">食材（固定）</el-tag>
            <span class="field-hint field-hint--inline">
              阶段一只建食材；补剂与包材不在本向导。
            </span>
          </div>
        </el-form-item>

        <el-form-item label="基准单位" required>
          <el-select v-model="form.baseUnit" class="field-control">
            <el-option
              v-for="unit in BASE_UNIT_OPTIONS"
              :key="unit.value"
              :label="unit.label"
              :value="unit.value"
            />
          </el-select>
          <p class="field-hint">
            配方与采购都按这个单位换算；创建后不可再改。
          </p>
        </el-form-item>

        <el-form-item label="单位展示名">
          <el-input
            v-model="form.unitDisplayLabel"
            maxlength="20"
            clearable
            :placeholder="defaultUnitLabel"
          />
          <p class="field-hint">
            只用于展示（如「克」「毫升」），留空会自动用「{{ defaultUnitLabel }}」。
          </p>
        </el-form-item>

        <el-form-item label="CFCT 分类">
          <el-select
            v-model="form.cfctClass"
            class="field-control"
            clearable
            filterable
            placeholder="判不准就留空"
          >
            <el-option
              v-for="option in CFCT_CLASS_OPTIONS"
              :key="option"
              :label="option"
              :value="option"
            />
          </el-select>
          <p class="field-hint">
            用于营养库归类参考；留空标「待补」，不阻断提交。
          </p>
        </el-form-item>

        <el-form-item label="可食部比例">
          <div class="rate-row">
            <el-input-number
              v-model="form.edibleYieldRate"
              :min="0.1"
              :max="1"
              :step="0.01"
              :precision="2"
              :controls="false"
              placeholder="未知留空"
              class="rate-input"
            />
            <el-tag v-if="form.edibleYieldRate === null" size="small" type="info" effect="plain">
              待补
            </el-tag>
          </div>
          <p class="field-hint">
            去除不可食部分后的比例，如带骨肉类 0.85；不知道就留空。
          </p>
        </el-form-item>
      </div>
    </el-form>

    <el-alert
      v-if="missingFieldLabels.length"
      type="info"
      :closable="false"
      show-icon
      title="以下字段标为待补（不阻断）"
    >
      {{ missingFieldLabels.join('、') }}。AI 没有依据填的字段一律留空，
      比填一个猜的值安全；提交后可在原料详情里补。
    </el-alert>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="商品 / 采购不在这里"
    >
      采购 SKU、商品链接、DIY 推荐都在原料创建完成后的独立入口维护；
      本向导只负责标准原料的基础字段、营养档案与主映射。
    </el-alert>

    <p v-if="blockedReason" class="next-hint">{{ blockedReason }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  BaseUnit,
  BaseUnitLabels,
  CFCT_CLASS_OPTIONS
} from '@/types/ingredient'
import type {
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientDraft
} from '@/types/ingredientCreation'

interface Props {
  draft: IngredientCreationDraft | null
  saving?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  next: [payload: Partial<IngredientCreationDraftPayload>]
  'can-next': [value: boolean]
}>()

interface BaseUnitOption {
  value: IngredientDraft['baseUnit']
  label: string
}

const BASE_UNIT_OPTIONS: readonly BaseUnitOption[] = [
  { value: BaseUnit.G, label: '克 (G)' },
  { value: BaseUnit.ML, label: '毫升 (ML)' },
  { value: BaseUnit.PCS, label: '个/件 (PCS)' }
]

const initialIngredient = props.draft?.payload.ingredient
const intakeName = props.draft?.payload.intake?.name ?? props.draft?.name ?? ''

const form = reactive<{
  name: string
  baseUnit: IngredientDraft['baseUnit']
  unitDisplayLabel: string
  cfctClass: string
  edibleYieldRate: number | null
}>({
  name: initialIngredient?.name?.trim() || intakeName,
  baseUnit: initialIngredient?.baseUnit ?? BaseUnit.G,
  unitDisplayLabel: initialIngredient?.unitDisplayLabel ?? '',
  cfctClass: initialIngredient?.cfctClass ?? '',
  edibleYieldRate:
    typeof initialIngredient?.edibleYieldRate === 'number'
      ? initialIngredient.edibleYieldRate
      : null
})

const defaultUnitLabel = computed(
  () => BaseUnitLabels[form.baseUnit] ?? BaseUnitLabels[BaseUnit.G] ?? '克'
)

/**
 * 切换基准单位时只在展示名还空着、或还是上一个单位的默认名时才自动跟随，
 * 不覆盖人手工写过的「平勺」「条」。
 */
watch(
  () => form.baseUnit,
  (unit, previous) => {
    const previousDefault = BaseUnitLabels[previous] ?? ''
    const trimmed = (form.unitDisplayLabel ?? '').trim()
    if (!trimmed || trimmed === previousDefault) {
      form.unitDisplayLabel = BaseUnitLabels[unit] ?? ''
    }
  }
)

const missingFieldLabels = computed<string[]>(() => {
  const labels: string[] = []
  if (!(form.cfctClass ?? '').trim()) {
    labels.push('CFCT 分类')
  }
  if (typeof form.edibleYieldRate !== 'number') {
    labels.push('可食部比例')
  }
  return labels
})

function buildIngredientDraft(): IngredientDraft {
  return {
    name: (form.name ?? '').trim(),
    type: 'FOOD',
    baseUnit: form.baseUnit,
    unitDisplayLabel:
      (form.unitDisplayLabel ?? '').trim() ||
      BaseUnitLabels[form.baseUnit] ||
      '克',
    cfctClass: (form.cfctClass ?? '').trim() || null,
    edibleYieldRate:
      typeof form.edibleYieldRate === 'number' &&
      Number.isFinite(form.edibleYieldRate)
        ? form.edibleYieldRate
        : null
  }
}

const blockedReason = computed(() => {
  if (!props.draft) {
    return '草稿还没有创建。'
  }
  if (!(form.name ?? '').trim()) {
    return '请填写原料名称。'
  }
  return ''
})

const canProceed = computed(() => blockedReason.value === '')

function submit() {
  if (!canProceed.value) {
    ElMessage.warning(blockedReason.value)
    return
  }

  emit('next', { ingredient: buildIngredientDraft() })
}

onMounted(() => emit('can-next', canProceed.value))
watch(canProceed, (value) => emit('can-next', value))

defineExpose({ submit })
</script>

<style scoped>
.ingredient-step {
  gap: 18px;
}

.ingredient-form {
  display: flex;
  flex-direction: column;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}

.field-control {
  width: 100%;
}

.field-hint {
  margin: 6px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.field-hint--inline {
  margin: 0;
}

.readonly-value {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.rate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.rate-input {
  width: 160px;
}

.next-hint {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 900px) {
  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
