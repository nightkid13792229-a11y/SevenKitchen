<template>
  <section class="draft-nutrition">
    <div class="draft-nutrition__head">
      <div>
        <h4 class="draft-nutrition__title">每份含量</h4>
        <p class="draft-nutrition__desc">
          照标签填每份的含量；每 1 个基准单位的折算值由系统算，不用手填，也不用写每粒值。
        </p>
      </div>
      <el-checkbox v-model="showAll" class="draft-nutrition__toggle">
        显示全部字段
      </el-checkbox>
    </div>

    <div class="draft-nutrition__group">
      <label class="draft-field">
        <span class="draft-field__label">默认目标营养素</span>
        <el-select
          v-model="nutrition.defaultTargetFields"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="设计器里加这条补剂时默认勾选的营养素"
          style="width: 100%"
        >
          <el-option
            v-for="option in targetOptions"
            :key="option.value"
            :label="`${option.label}（${option.unit}）`"
            :value="option.value"
          />
        </el-select>
        <em v-if="targetOptions.length === 0" class="draft-field__hint">
          先在下面填至少一项每份含量（大于 0），才能选默认目标
        </em>
        <em v-else class="draft-field__hint">
          只列出每份含量大于 0 的营养素；至少选一项
        </em>
      </label>
    </div>

    <div
      v-for="group in visibleGroups"
      :key="group.key"
      class="draft-nutrition__group"
    >
      <h5 class="draft-nutrition__group-title">{{ group.title }}</h5>
      <div class="draft-nutrition__grid">
        <label
          v-for="field in group.fields"
          :key="field.fieldPath"
          class="draft-field"
        >
          <span class="draft-field__label">
            {{ field.label }}（{{ field.unit }}）
          </span>
          <el-input-number
            :model-value="nutrition.servingNutrients[field.fieldPath]"
            :min="0"
            :precision="4"
            :controls="false"
            placeholder="每份"
            style="width: 100%"
            @update:model-value="
              (value: number | undefined) => setServing(field.fieldPath, value)
            "
          />
          <em class="draft-field__calc">
            每 1 {{ unitLabel }} = {{ perUnitPreview(field.fieldPath) }}
            {{ field.unit }}
          </em>
        </label>
      </div>
    </div>

    <p v-if="visibleGroups.length === 0" class="draft-nutrition__empty">
      还没有填任何营养素。勾选「显示全部字段」可以从目录里选，或点上方「让 AI 起草」先读标签图。
    </p>

    <div class="draft-nutrition__group">
      <label class="draft-field">
        <span class="draft-field__label">标签原文</span>
        <el-input
          v-model="nutrition.labelText"
          type="textarea"
          :rows="4"
          placeholder="照标签抄：Serving Size / 每份含量 / 成分表"
        />
        <em class="draft-field__hint">
          留档用；写入后能回查这张标签当时怎么写的
        </em>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ② 营养档案（spec §12.2）。
 *
 * 只让填「每份含量」；每 1 个基准单位的折算值在这里只做预览，真正写入的每粒值
 * 由服务端算（客户端不送、服务端也不信客户端送的每粒值）。
 *
 * 页面上永远只列目录里的字段（`supplementNutrientGroups`），键就是服务端
 * 营养档案的字段路径，避免自己造字段名。
 */
import { computed, ref, watch } from 'vue'
import type { SupplementDraftNutrition } from '@/api/supplementDrafts'
import { supplementNutrientGroups } from '@/constants/supplementNutrients'

const props = defineProps<{
  /** 每份多少（来自「商品与基本信息」）；折算预览除的就是它 */
  servingUnitsPerDose: number | null
  /** 展示单位（粒/片/胶囊/g/ml…），只用于文案 */
  unitDisplayLabel: string
}>()

const nutrition = defineModel<SupplementDraftNutrition>({ required: true })

const showAll = ref(false)

/**
 * 每份值被清掉/改成 0 后，已经选中的默认目标要同步剔除。
 *
 * 否则选择框里会留着一个「标签上已经没有」的字段，最终校验报
 * DEFAULT_TARGET_INVALID，人还得回头找是哪一项。
 */
watch(
  () => nutrition.value.servingNutrients,
  (nutrients) => {
    const stillPositive = (fieldPath: string): boolean => {
      const value = nutrients[fieldPath]
      return typeof value === 'number' && Number.isFinite(value) && value > 0
    }
    const next = nutrition.value.defaultTargetFields.filter(stillPositive)
    if (next.length !== nutrition.value.defaultTargetFields.length) {
      nutrition.value.defaultTargetFields = next
    }
  },
  { deep: true }
)

const unitLabel = computed(
  () => props.unitDisplayLabel.trim() || '个基准单位'
)

/** 每份含量大于 0 的字段个数；决定默认展示「已填」还是「常用」。 */
const filledCount = computed(
  () =>
    Object.values(nutrition.value.servingNutrients).filter(
      (value) => Number.isFinite(value) && value > 0
    ).length
)

/**
 * 默认只显示有值的字段，避免一屏几十个空格子；一个都没填时显示常用字段，
 * 勾「显示全部字段」才展开整个目录。
 */
const visibleGroups = computed(() => {
  const mode = showAll.value ? 'all' : filledCount.value > 0 ? 'filled' : 'common'
  return supplementNutrientGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => {
        if (mode === 'all') return true
        const value = nutrition.value.servingNutrients[field.fieldPath]
        if (mode === 'filled') {
          return typeof value === 'number' && Number.isFinite(value) && value > 0
        }
        return field.common === true
      })
    }))
    .filter((group) => group.fields.length > 0)
})

/** 默认目标只能选有值的营养素，避免选了标签上根本没有的项。 */
const targetOptions = computed(() => {
  const options: Array<{ value: string; label: string; unit: string }> = []
  for (const group of supplementNutrientGroups) {
    for (const field of group.fields) {
      const value = nutrition.value.servingNutrients[field.fieldPath]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        options.push({
          value: field.fieldPath,
          label: `${group.title} · ${field.label}`,
          unit: field.unit
        })
      }
    }
  }
  return options
})

/** 每 1 个基准单位的折算预览：每份值 ÷ 每份量，保留 4 位；算不出显示「—」。 */
function perUnitPreview(fieldPath: string): string {
  const serving = nutrition.value.servingNutrients[fieldPath]
  const dose = props.servingUnitsPerDose
  if (typeof serving !== 'number' || !Number.isFinite(serving) || serving <= 0) {
    return '—'
  }
  if (typeof dose !== 'number' || !Number.isFinite(dose) || dose <= 0) {
    return '—'
  }
  return String(Number((serving / dose).toFixed(4)))
}

/** 清空输入就从对象里删掉键（服务端把「没有这个键」当作没填）。 */
function setServing(fieldPath: string, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value)) {
    delete nutrition.value.servingNutrients[fieldPath]
    return
  }
  nutrition.value.servingNutrients[fieldPath] = value
}
</script>

<style scoped>
.draft-nutrition {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.draft-nutrition__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.draft-nutrition__title {
  margin: 0 0 4px;
  font-size: 13.5px;
  font-weight: 600;
  color: #38414d;
}

.draft-nutrition__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a93a0;
}

.draft-nutrition__toggle {
  flex: none;
}

.draft-nutrition__group {
  padding: 16px;
  border: 1px solid #eceff3;
  border-radius: 10px;
  background: #fff;
}

.draft-nutrition__group-title {
  margin: 0 0 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: #5b6470;
}

.draft-nutrition__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.draft-nutrition__empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed #e3e7ed;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #98a1ad;
  text-align: center;
}

.draft-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.draft-field__label {
  font-size: 12.5px;
  color: #5b6470;
}

.draft-field__calc {
  font-size: 11.5px;
  font-style: normal;
  line-height: 1.5;
  color: #8a93a0;
  font-variant-numeric: tabular-nums;
}

.draft-field__hint {
  font-size: 11.5px;
  font-style: normal;
  line-height: 1.5;
  color: #97a0ac;
}
</style>
