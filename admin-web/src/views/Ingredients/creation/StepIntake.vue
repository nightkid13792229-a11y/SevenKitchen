<template>
  <section class="creation-step intake-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">①</span>
      <div>
        <h2 class="creation-step__title">起手</h2>
        <p class="creation-step__summary">
          先把「按什么名字、按什么状态去找数据」定下来。
        </p>
      </div>
    </header>

    <el-alert
      v-if="!draft"
      type="info"
      :closable="false"
      show-icon
      class="draft-hint"
      title="点「下一步」才会创建草稿"
    >
      草稿不再用「未命名原料」占位：填好名字后点下一步，会用这里的真实名字建草稿。
    </el-alert>

    <el-form class="intake-form" label-position="top" @submit.prevent="submit">
      <div class="field-grid">
        <el-form-item label="中文名" required>
          <el-input
            v-model="form.name"
            placeholder="例如：鸡肝"
            maxlength="50"
            show-word-limit
            clearable
          />
        </el-form-item>

        <el-form-item label="英文名" required>
          <el-input
            v-model="form.nameEn"
            placeholder="例如：Chicken liver"
            maxlength="100"
            clearable
          />
          <p class="field-hint field-hint--warning">
            只填中文名时匹配不到任何词条（实测「鸡肝」不带英文名查不到结果）。
            请照抄包装或来源上的英文名，不要自己音译。
          </p>
        </el-form-item>
      </div>

      <el-form-item label="类别" required>
        <div class="category-options" role="radiogroup" aria-label="原料类别">
          <button
            v-for="option in COVERAGE_CATEGORY_OPTIONS"
            :key="option.value"
            type="button"
            role="radio"
            class="category-option"
            :class="{ 'is-active': form.category === option.value }"
            :aria-checked="form.category === option.value"
            @click="selectCategory(option.value)"
          >
            <span class="category-option__label">{{ option.label }}</span>
            <span class="category-option__hint">{{ option.hint }}</span>
          </button>
        </div>
        <p class="field-hint">
          选完类别会自动带出生熟清单；判不准就选「其他」，再手工勾。
          类别只影响默认值，不参与名字匹配。
        </p>
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="可选。例如：供应商说这批是冷冻鸡肝，解冻后称重"
        />
      </el-form-item>
    </el-form>

    <section class="state-panel" aria-labelledby="state-panel-title">
      <div class="state-panel__header">
        <div>
          <h3 id="state-panel-title">这份原料要建几份档案？</h3>
          <p>
            类别只给默认值，最终以你勾的为准。
            <template v-if="form.category">
              默认主档案：{{ defaultPrimaryLabel }}（后续站点可调整）。
            </template>
            <template v-else>先选类别，清单会自动填好。</template>
          </p>
        </div>
        <el-tag v-if="form.selectedStates.length" type="info" effect="plain">
          已勾 {{ form.selectedStates.length }} 份
        </el-tag>
      </div>

      <el-checkbox-group
        v-model="form.selectedStates"
        class="state-options"
        :disabled="!form.category"
      >
        <el-checkbox
          v-for="option in STATE_OPTIONS"
          :key="option.value"
          :value="option.value"
          border
          class="state-option"
        >
          <span class="state-option__body">
            <span class="state-option__title">
              {{ option.label }}
              <el-tag
                size="small"
                effect="light"
                :type="stateLevelTagType(option.value)"
              >
                {{ stateLevelLabel(option.value) }}
              </el-tag>
            </span>
            <span class="state-option__hint">{{ option.hint }}</span>
          </span>
        </el-checkbox>
      </el-checkbox-group>

      <p v-if="!form.category" class="field-hint">
        先在「类别」里选一项，生熟清单才会出现。
      </p>

      <el-alert
        v-if="uncheckedRequiredStates.length"
        type="warning"
        :closable="false"
        show-icon
        title="已取消必需项"
      >
        你取消了{{ uncheckedRequiredStatesText }}。取消后终检不会再强制要求这一份；
        如果只是暂时没数据，建议保留必需项，在终检登记例外，留下操作人和理由。
      </el-alert>
    </section>

    <section class="caliber-card" aria-labelledby="caliber-title">
      <div class="caliber-card__header">
        <h3 id="caliber-title">检索口径</h3>
        <span class="caliber-card__hint">确认无误后点右下角「下一步」</span>
      </div>
      <dl class="caliber-grid">
        <div>
          <dt>中文名</dt>
          <dd>{{ form.name.trim() || '待填' }}</dd>
        </div>
        <div>
          <dt>英文名</dt>
          <dd>{{ form.nameEn.trim() || '待填' }}</dd>
        </div>
        <div>
          <dt>类别</dt>
          <dd>{{ categoryLabel || '待选' }}</dd>
        </div>
        <div>
          <dt>基准口径</dt>
          <dd>每 100g 可食部</dd>
        </div>
        <div>
          <dt>默认主档案</dt>
          <dd>{{ defaultPrimaryLabel }}</dd>
        </div>
        <div>
          <dt>易混词</dt>
          <dd>
            <template v-if="preservedConfusables.length">
              <el-tag
                v-for="word in preservedConfusables"
                :key="word"
                size="small"
                type="warning"
                effect="plain"
                class="caliber-tag"
              >
                {{ word }}
              </el-tag>
            </template>
            <span v-else class="caliber-card__muted">暂无</span>
          </dd>
        </div>
      </dl>
      <p v-if="preservedAliases.length" class="caliber-card__aliases">
        别名：
        <el-tag
          v-for="alias in preservedAliases"
          :key="alias"
          size="small"
          effect="plain"
          class="caliber-tag"
        >
          {{ alias }}
        </el-tag>
      </p>
      <p class="caliber-card__note">
        营养档案统一按每 100g 可食部比较，不再按「每份」混算；来源按份给值时，
        ② 站会标出换算依据，缺克数就不硬算。
      </p>
    </section>

    <p v-if="blockedReason" class="next-hint">{{ blockedReason }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  CoverageCategory,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  PreparationState
} from '@/types/ingredientCreation'
import {
  COVERAGE_CATEGORY_OPTIONS,
  getCoverageCategoryLabel,
  getPreparationStateLabel,
  resolveDefaultPrimaryState,
  resolveStateCoverage
} from './stateCoverage'

const props = defineProps<{
  draft: IngredientCreationDraft | null
  saving?: boolean
}>()

const emit = defineEmits<{
  next: [payload: Partial<IngredientCreationDraftPayload>]
  'can-next': [value: boolean]
}>()

interface StateOption {
  value: PreparationState
  label: string
  hint: string
}

const STATE_OPTIONS: readonly StateOption[] = [
  {
    value: 'RAW',
    label: '生',
    hint: '生鲜、未加热的样品数据；肉 / 内脏 / 水产 / 蛋默认必需。'
  },
  {
    value: 'COOKED',
    label: '熟',
    hint: '水煮、蒸等温和做法；烤、煎不进候选，根茎淀粉类默认必需。'
  }
]

const initialIntake = props.draft?.payload.intake
const preservedAliases = [...(initialIntake?.aliases ?? [])]
const preservedConfusables = [...(initialIntake?.confusables ?? [])]

function initialSelectedStates(): PreparationState[] {
  if (!initialIntake) {
    return []
  }
  const states: PreparationState[] = []
  for (const state of ['RAW', 'COOKED'] as const) {
    if (
      initialIntake.requiredStates.includes(state) ||
      initialIntake.suggestedStates.includes(state)
    ) {
      states.push(state)
    }
  }
  return states
}

const form = reactive<{
  name: string
  nameEn: string
  category: CoverageCategory | null
  notes: string
  selectedStates: PreparationState[]
}>({
  name: initialIntake?.name ?? '',
  nameEn: initialIntake?.nameEn ?? '',
  category: initialIntake?.category ?? null,
  notes: initialIntake?.notes ?? '',
  selectedStates: initialSelectedStates()
})

/**
 * 换类别就重填一次清单：类别是「默认值」的来源，用户改过清单后再换类别，
 * 继续沿用上一类的勾选会误导人。切回同一类别不触发（选择按钮会拦掉）。
 */
watch(
  () => form.category,
  (category) => {
    if (!category) {
      return
    }
    const coverage = resolveStateCoverage(category)
    form.selectedStates = [...coverage.required, ...coverage.suggested]
  }
)

const categoryLabel = computed(() =>
  form.category ? getCoverageCategoryLabel(form.category) : ''
)

const defaultPrimaryLabel = computed(() =>
  form.category
    ? getPreparationStateLabel(resolveDefaultPrimaryState(form.category))
    : '先选类别'
)

const uncheckedRequiredStates = computed<PreparationState[]>(() => {
  if (!form.category) {
    return []
  }
  const coverage = resolveStateCoverage(form.category)
  return coverage.required.filter(
    (state) => !form.selectedStates.includes(state)
  )
})

const uncheckedRequiredStatesText = computed(() =>
  uncheckedRequiredStates.value
    .map((state) => `「${getPreparationStateLabel(state)}」`)
    .join('、')
)

function stateLevel(
  state: PreparationState
): 'required' | 'suggested' | 'none' {
  if (!form.category) {
    return 'none'
  }
  const coverage = resolveStateCoverage(form.category)
  if (coverage.required.includes(state)) {
    return 'required'
  }
  if (coverage.suggested.includes(state)) {
    return 'suggested'
  }
  return 'none'
}

function stateLevelLabel(state: PreparationState): string {
  const level = stateLevel(state)
  if (level === 'required') return '必需'
  if (level === 'suggested') return '建议'
  return '可选'
}

function stateLevelTagType(
  state: PreparationState
): 'danger' | 'warning' | 'info' {
  const level = stateLevel(state)
  if (level === 'required') return 'danger'
  if (level === 'suggested') return 'warning'
  return 'info'
}

function selectCategory(category: CoverageCategory) {
  if (form.category === category) {
    return
  }
  form.category = category
}

/**
 * 只保留「勾了的状态」，并原样区分必需 / 建议。
 *
 * 取消必需项是人工决定：这里如实不再把它写进 requiredStates，
 * 页面同时给出警告，避免用户在不知情的情况下绕过终检。
 */
function buildIntakeCard() {
  const category = form.category
  if (!category) {
    return null
  }
  const coverage = resolveStateCoverage(category)
  const requiredStates = coverage.required.filter((state) =>
    form.selectedStates.includes(state)
  )
  const suggestedStates = [
    ...coverage.suggested.filter((state) =>
      form.selectedStates.includes(state)
    ),
    ...form.selectedStates.filter(
      (state) =>
        !coverage.required.includes(state) &&
        !coverage.suggested.includes(state)
    )
  ]

  return {
    name: form.name.trim(),
    nameEn: form.nameEn.trim() || null,
    aliases: preservedAliases,
    confusables: preservedConfusables,
    category,
    requiredStates,
    suggestedStates,
    notes: form.notes.trim() || null
  }
}

const canProceed = computed(
  () =>
    form.name.trim().length > 0 &&
    form.nameEn.trim().length > 0 &&
    form.category !== null &&
    form.selectedStates.length > 0
)

const blockedReason = computed(() => {
  if (!form.name.trim()) {
    return '请填写中文名。'
  }
  if (!form.nameEn.trim()) {
    return '请填写英文名：只填中文名时几乎匹配不到词条。'
  }
  if (!form.category) {
    return '请选择类别，生熟清单会按类别自动填好。'
  }
  if (!form.selectedStates.length) {
    return '请至少勾选一份要建的档案（生或熟）。'
  }
  return ''
})

function submit() {
  if (!canProceed.value) {
    ElMessage.warning(blockedReason.value || '请先补全起手信息')
    return
  }
  const intake = buildIntakeCard()
  if (!intake) {
    return
  }
  emit('next', { intake })
}

onMounted(() => emit('can-next', canProceed.value))
watch(canProceed, (value) => emit('can-next', value))

defineExpose({ submit })
</script>

<style scoped>
.intake-step {
  gap: 20px;
}

.draft-hint {
  margin-bottom: 4px;
}

.intake-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.field-hint {
  margin: 6px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.field-hint--warning {
  color: #b88230;
}

.category-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.category-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
}

.category-option:hover {
  border-color: #a0cfff;
}

.category-option.is-active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 0 0 1px #409eff inset;
}

.category-option__label {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.category-option__hint {
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.state-panel {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.state-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.state-panel__header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.state-panel__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.state-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.state-option {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 68px;
  align-items: flex-start;
  margin: 0;
  padding: 10px 12px;
  background: #fff;
}

.state-option :deep(.el-checkbox__input) {
  margin-top: 2px;
}

.state-option :deep(.el-checkbox__label) {
  display: block;
  width: 100%;
  white-space: normal;
}

.state-option__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-option__title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.state-option__hint {
  color: #909399;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.caliber-card {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}

.caliber-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.caliber-card__header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.caliber-card__hint {
  color: #909399;
  font-size: 12px;
}

.caliber-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 20px;
  margin: 0;
}

.caliber-grid dt {
  color: #909399;
  font-size: 12px;
}

.caliber-grid dd {
  margin: 2px 0 0;
  color: #303133;
  font-size: 14px;
  word-break: break-word;
}

.caliber-card__muted {
  color: #c0c4cc;
}

.caliber-tag {
  margin: 0 4px 2px 0;
}

.caliber-card__aliases {
  margin: 12px 0 0;
  color: #606266;
  font-size: 12px;
}

.caliber-card__note {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px dashed #ebeef5;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.next-hint {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 900px) {
  .field-grid,
  .state-options {
    grid-template-columns: minmax(0, 1fr);
  }

  .category-options,
  .caliber-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
