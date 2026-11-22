<template>
  <section class="draft-basic">
    <div class="draft-basic__group">
      <h4 class="draft-basic__title">基本信息</h4>
      <div class="draft-basic__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>原料名称</span>
            <span v-if="isManual('basic.name')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.name']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.name']?.low }"
            >
              {{ aiTags['basic.name']?.text }}
            </span>
          </span>
          <el-input
            :model-value="basic.name"
            placeholder="只写物质名，如「铜」"
            maxlength="200"
            @update:model-value="(value: string) => update('name', value)"
          />
          <em
            v-if="!basic.name.trim() && missingReason('basic.name')"
            class="draft-field__missing"
            :title="missingReason('basic.name')"
          >
            AI 没找到，请补
          </em>
          <em v-else-if="nameFormWord" class="draft-field__warn">
            名称结尾的「{{ nameFormWord }}」是剂型，建议只写物质名
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>品牌</span>
            <span v-if="isManual('basic.brand')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.brand']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.brand']?.low }"
            >
              {{ aiTags['basic.brand']?.text }}
            </span>
          </span>
          <el-input
            :model-value="basic.brand"
            placeholder="如 Swanson"
            maxlength="100"
            @update:model-value="(value: string) => update('brand', value)"
          />
          <em
            v-if="!basic.brand.trim() && missingReason('basic.brand')"
            class="draft-field__missing"
            :title="missingReason('basic.brand')"
          >
            AI 没找到，请补
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>产品规格</span>
            <span v-if="isManual('basic.productModel')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.productModel']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.productModel']?.low }"
            >
              {{ aiTags['basic.productModel']?.text }}
            </span>
          </span>
          <el-input
            :model-value="basic.productModel"
            placeholder="如 120 粒/瓶"
            maxlength="100"
            @update:model-value="(value: string) => update('productModel', value)"
          />
          <em
            v-if="!basic.productModel.trim() && missingReason('basic.productModel')"
            class="draft-field__missing"
            :title="missingReason('basic.productModel')"
          >
            AI 没找到，请补
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>采购渠道</span>
            <span v-if="isManual('basic.purchaseChannel')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.purchaseChannel']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.purchaseChannel']?.low }"
            >
              {{ aiTags['basic.purchaseChannel']?.text }}
            </span>
          </span>
          <el-input
            :model-value="basic.purchaseChannel"
            placeholder="如 iHerb"
            maxlength="200"
            @update:model-value="(value: string) => update('purchaseChannel', value)"
          />
          <em
            v-if="!basic.purchaseChannel.trim() && missingReason('basic.purchaseChannel')"
            class="draft-field__missing"
            :title="missingReason('basic.purchaseChannel')"
          >
            AI 没找到，请补
          </em>
        </label>
      </div>
    </div>

    <div class="draft-basic__group">
      <h4 class="draft-basic__title">单位与剂型</h4>
      <div class="draft-basic__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>基准单位</span>
            <span v-if="isManual('basic.baseUnit')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.baseUnit']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.baseUnit']?.low }"
            >
              {{ aiTags['basic.baseUnit']?.text }}
            </span>
          </span>
          <el-select
            :model-value="basic.baseUnit"
            style="width: 100%"
            @update:model-value="(value: string) => update('baseUnit', value as SupplementBaseUnit)"
          >
            <el-option
              v-for="option in baseUnitOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <em class="draft-field__hint">
            按实际计量选：按克/毫升/个都行；平勺、滴属于「个」，只要展示单位和基准 1:1。营养按每 1 个基准单位折算
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>展示单位</span>
            <span v-if="isManual('basic.unitDisplayLabel')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.unitDisplayLabel']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.unitDisplayLabel']?.low }"
            >
              {{ aiTags['basic.unitDisplayLabel']?.text }}
            </span>
          </span>
          <el-select
            :model-value="basic.unitDisplayLabel"
            placeholder="请选择"
            style="width: 100%"
            @update:model-value="(value: string) => update('unitDisplayLabel', value)"
          >
            <el-option
              v-for="unit in displayUnitOptions"
              :key="unit"
              :label="unit"
              :value="unit"
            />
          </el-select>
          <em class="draft-field__hint">
            要和基准单位 1:1 对应：粒/片/胶囊 ↔ 个，g ↔ 克，ml ↔ 毫升；「份」不能当展示单位
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>物理形态</span>
            <span v-if="isManual('basic.physicalForm')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.physicalForm']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.physicalForm']?.low }"
            >
              {{ aiTags['basic.physicalForm']?.text }}
            </span>
          </span>
          <el-select
            :model-value="basic.physicalForm"
            placeholder="请选择"
            style="width: 100%"
            @update:model-value="(value: string) => update('physicalForm', value as SupplementPhysicalForm)"
          >
            <el-option
              v-for="option in physicalFormOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>每份多少{{ unitLabel }}</span>
            <span v-if="isManual('basic.servingUnitsPerDose')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.servingUnitsPerDose']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.servingUnitsPerDose']?.low }"
            >
              {{ aiTags['basic.servingUnitsPerDose']?.text }}
            </span>
          </span>
          <el-input-number
            :model-value="basic.servingUnitsPerDose ?? undefined"
            :min="servingIsPcs ? 1 : 0.01"
            :precision="servingIsPcs ? 0 : 2"
            :step="servingIsPcs ? 1 : 0.1"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) =>
                update('servingUnitsPerDose', value ?? null)
            "
          />
          <em class="draft-field__hint">{{ servingHint }}</em>
          <em
            v-if="!basic.servingUnitsPerDose && missingReason('basic.servingUnitsPerDose')"
            class="draft-field__missing"
            :title="missingReason('basic.servingUnitsPerDose')"
          >
            AI 没找到，请补
          </em>
        </label>
      </div>
    </div>

    <div class="draft-basic__group">
      <h4 class="draft-basic__title">采购与价格</h4>
      <div class="draft-basic__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>采购单位</span>
            <span v-if="isManual('basic.purchaseUnit')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.purchaseUnit']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.purchaseUnit']?.low }"
            >
              {{ aiTags['basic.purchaseUnit']?.text }}
            </span>
          </span>
          <el-input
            :model-value="basic.purchaseUnit"
            placeholder="如 瓶"
            maxlength="50"
            @update:model-value="(value: string) => update('purchaseUnit', value)"
          />
          <em
            v-if="!basic.purchaseUnit.trim() && missingReason('basic.purchaseUnit')"
            class="draft-field__missing"
            :title="missingReason('basic.purchaseUnit')"
          >
            AI 没找到，请补
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>换算倍数</span>
            <span v-if="isManual('basic.purchaseToBaseRatio')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.purchaseToBaseRatio']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.purchaseToBaseRatio']?.low }"
            >
              {{ aiTags['basic.purchaseToBaseRatio']?.text }}
            </span>
          </span>
          <el-input-number
            :model-value="basic.purchaseToBaseRatio ?? undefined"
            :min="0.01"
            :precision="2"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) =>
                update('purchaseToBaseRatio', value ?? null)
            "
          />
          <em class="draft-field__hint">
            1 个采购单位 = 多少{{ unitLabel }}
          </em>
          <em
            v-if="!basic.purchaseToBaseRatio && missingReason('basic.purchaseToBaseRatio')"
            class="draft-field__missing"
            :title="missingReason('basic.purchaseToBaseRatio')"
          >
            AI 没找到，请补
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>当前采购价</span>
            <span v-if="isManual('basic.currentPricePerPurchaseUnit')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.currentPricePerPurchaseUnit']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.currentPricePerPurchaseUnit']?.low }"
            >
              {{ aiTags['basic.currentPricePerPurchaseUnit']?.text }}
            </span>
          </span>
          <el-input-number
            :model-value="basic.currentPricePerPurchaseUnit ?? undefined"
            :min="0"
            :precision="2"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) =>
                update('currentPricePerPurchaseUnit', value ?? null)
            "
          />
          <em class="draft-field__hint">按采购单位记，人民币</em>
          <em
            v-if="!basic.currentPricePerPurchaseUnit && missingReason('basic.currentPricePerPurchaseUnit')"
            class="draft-field__missing"
            :title="missingReason('basic.currentPricePerPurchaseUnit')"
          >
            AI 没找到，请补
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>生产损耗率</span>
            <span v-if="isManual('basic.productionLossRate')" class="draft-field__manual" title="你手动改过，AI 不会覆盖">人改</span>
            <span
              v-if="aiTags['basic.productionLossRate']"
              class="draft-field__source"
              :class="{ 'draft-field__source--low': aiTags['basic.productionLossRate']?.low }"
            >
              {{ aiTags['basic.productionLossRate']?.text }}
            </span>
          </span>
          <el-input-number
            :model-value="basic.productionLossRate"
            :min="1"
            :max="2"
            :step="0.01"
            :precision="2"
            controls-position="right"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) =>
                update('productionLossRate', value ?? 1.05)
            "
          />
          <em class="draft-field__hint">默认 1.05（+5%），可按实际损耗覆盖</em>
        </label>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
/**
 * ① 商品与基本信息（spec §12.1）。
 *
 * 用 `defineModel` 直接改父级传进来的 basic 对象：父级（编辑页）对整份草稿
 * 有 deep watcher，改一个字段就自动保存，所以这里不需要单独的「保存」事件。
 * 商品链接不在这里，统一放在「证据与来源」，避免两处填写打架。
 */
import { computed } from 'vue'
import type {
  SupplementBaseUnit,
  SupplementDraftAiSnapshot,
  SupplementDraftBasic,
  SupplementPhysicalForm
} from '@/api/supplementDrafts'
import { supplementUsageUnitOptions } from '@/constants/supplementNutrients'
import { findSupplementFormWord } from '../../supplementFormState'
import { isManualDraftPath } from '../supplementDraftState'

const props = defineProps<{
  /** AI 起草快照：有该字段就显示来源徽标，AI 说没找到的项标红 */
  aiSnapshot?: SupplementDraftAiSnapshot | null
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const basic = defineModel<SupplementDraftBasic>({ required: true })

/** 人改过？父路径命中子路径也算，与后端 manualFields 口径一致。 */
function isManual(path: string): boolean {
  return isManualDraftPath(path, props.manualFields ?? [])
}

/**
 * 统一的人改入口：先 markManual 再改值。
 *
 * 直接用 `v-model` 改值会绕开 manualFields，AI 重填时就会静默覆盖人改内容，
 * 所以每个输入框都显式走这里。
 */
function update<K extends keyof SupplementDraftBasic>(
  key: K,
  value: SupplementDraftBasic[K]
): void {
  props.markManual?.(`basic.${String(key)}`)
  basic.value[key] = value
}

/** 基准单位选项；值仍是后端枚举，展示只给中文。 */
const baseUnitOptions: Array<{ value: SupplementBaseUnit; label: string }> = [
  { value: 'PCS', label: '个（粒/片/胶囊）' },
  { value: 'G', label: '克' },
  { value: 'ML', label: '毫升' }
]

/** 物理形态；只描述形态，不再决定基准单位。 */
const physicalFormOptions: Array<{
  value: SupplementPhysicalForm
  label: string
}> = [
  { value: 'POWDER', label: '粉剂' },
  { value: 'TABLET', label: '片剂' },
  { value: 'CAPSULE', label: '胶囊' },
  { value: 'LIQUID', label: '液体' }
]

/** 展示单位：去掉「份」——它不是 1:1 单位；保留「胶囊」。 */
const displayUnitOptions = [
  ...supplementUsageUnitOptions.filter((unit) => unit !== '份'),
  '滴'
]

const unitLabel = computed(() => basic.value.unitDisplayLabel.trim() || '个基准单位')

const nameFormWord = computed(() => findSupplementFormWord(basic.value.name))

/**
 * 片/胶囊按个，每份量必须是整数（1.5 粒没有意义）；粉剂/液体按克/毫升，
 * 允许两位小数。输入框精度跟着基准单位走，避免 UI 让人填出 1.5 粒。
 */
const servingIsPcs = computed(() => basic.value.baseUnit === 'PCS')

/** 粉/液体标每份小数，片/胶囊按整数；文案跟着形态变。 */
const servingHint = computed(() => {
  if (basic.value.baseUnit === 'G' || basic.value.baseUnit === 'ML') {
    return '标签上每份几克/几毫升就填几，可以带两位小数（如 0.9、2.5）'
  }
  return '标签上「Serving Size」是几粒/几片/几平勺/几滴就填几，必须是整数'
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface AiTag {
  text: string
  low: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  LABEL: 'AI 读标签',
  FRONT: 'AI 读正面图',
  LINK: 'AI 读商品页',
  CATALOG: '目录',
  RULE: '规则',
  INFERENCE: 'AI 推断'
}

/** 字段路径 → 来源徽标；`aiSnapshot.fields` 的键就是草稿点路径。 */
const aiTags = computed<Record<string, AiTag>>(() => {
  const fields = props.aiSnapshot?.fields
  if (!isRecord(fields)) return {}
  const tags: Record<string, AiTag> = {}
  const manual = props.manualFields ?? []
  for (const [path, raw] of Object.entries(fields)) {
    if (!isRecord(raw)) continue
    // 人改过的字段不显示 AI 来源徽标（理由见 aiFieldMeta.aiFieldTag）
    if (isManualDraftPath(path, manual)) continue
    const source = typeof raw.source === 'string' ? raw.source : ''
    const label = SOURCE_LABELS[source]
    if (!label) continue
    const confidence = typeof raw.confidence === 'string' ? raw.confidence : ''
    tags[path] = {
      text: confidence === 'LOW' ? `${label} · 低置信` : label,
      low: confidence === 'LOW'
    }
  }
  return tags
})

/** 字段路径 → AI 自己承认没找到的原因。 */
const missingReasons = computed<Record<string, string>>(() => {
  const list = props.aiSnapshot?.missing
  if (!Array.isArray(list)) return {}
  const reasons: Record<string, string> = {}
  for (const raw of list) {
    if (!isRecord(raw)) continue
    const path = typeof raw.fieldPath === 'string' ? raw.fieldPath.trim() : ''
    if (!path) continue
    reasons[path] = typeof raw.reason === 'string' ? raw.reason : ''
  }
  return reasons
})

function missingReason(path: string): string {
  return missingReasons.value[path] ?? ''
}
</script>

<style scoped>
.draft-basic {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.draft-basic__group {
  padding: 16px;
  border: 1px solid #eceff3;
  border-radius: 10px;
  background: #fff;
}

.draft-basic__title {
  margin: 0 0 14px;
  font-size: 13.5px;
  font-weight: 600;
  color: #38414d;
}

.draft-basic__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

.draft-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.draft-field__label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12.5px;
  color: #5b6470;
}

.draft-field__source {
  padding: 0 6px;
  border-radius: 8px;
  background: #eef4ff;
  color: #3370ff;
  font-size: 11px;
  font-style: normal;
  line-height: 18px;
}

.draft-field__source--low {
  background: #fff4e5;
  color: #c46a00;
}

.draft-field__manual {
  padding: 0 6px;
  border-radius: 8px;
  background: #fff4e5;
  color: #c46a00;
  font-size: 11px;
  font-style: normal;
  line-height: 18px;
}

.draft-field__hint {
  font-size: 11.5px;
  font-style: normal;
  line-height: 1.5;
  color: #97a0ac;
}

.draft-field__warn {
  font-size: 11.5px;
  font-style: normal;
  line-height: 1.5;
  color: #c46a00;
}

.draft-field__missing {
  font-size: 11.5px;
  font-style: normal;
  line-height: 1.5;
  color: #d4380d;
}
</style>
