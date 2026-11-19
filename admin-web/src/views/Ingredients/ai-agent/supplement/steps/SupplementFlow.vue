<template>
  <div class="flow">
    <nav class="flow__steps">
      <button
        v-for="item in stepDefs"
        :key="item.id"
        type="button"
        class="flow__step"
        :class="{
          'flow__step--active': state.step === item.id,
          'flow__step--done': isDone(item.id),
          'flow__step--locked': !canEnter(state, item.id)
        }"
        :disabled="!canEnter(state, item.id)"
        @click="jump(item.id)"
      >
        <span class="flow__step-no">{{ item.id }}</span>
        <span class="flow__step-label">{{ item.label }}</span>
      </button>
    </nav>

    <!-- 第 1 步：接形态建议（下一个提交补上），这里先给一个能走到比价的最小入口 -->
    <section v-if="state.step === 1" class="flow__panel">
      <h3>① 定形态</h3>
      <p class="flow__desc">
        选一个营养素，Agent 会去知识库读原文，给出「形态档位 + 结论 + 出处」。
      </p>
      <div class="flow__row">
        <el-select
          v-model="tempNutrientKey"
          placeholder="要给狗补什么"
          filterable
          style="width: 240px"
        >
          <el-option
            v-for="item in nutrientOptions"
            :key="item.fieldPath"
            :label="item.label"
            :value="item.fieldPath"
          />
        </el-select>
        <el-select v-model="tempFormLevel" placeholder="形态档位" style="width: 200px">
          <el-option
            v-for="item in formLevelOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button type="primary" :disabled="!tempNutrientKey" @click="startCompare">
          先比价
        </el-button>
      </div>
      <p class="flow__hint">形态建议接上之后，这一屏会换成「结论 + 出处」的表。</p>
    </section>

    <CompareStep
      v-else-if="state.step === 2 && state.nutrientKey"
      :nutrient-key="state.nutrientKey"
      :nutrient-label="state.nutrientLabel"
      :form-level="state.chosenFormLevel ?? ''"
      :comparison="state.comparison"
      @update:comparison="setComparison"
      @chosen="pickOffer"
      @back="backToForm"
    />

    <section v-else-if="state.step === 3" class="flow__panel">
      <h3>③ 建档</h3>
      <p class="flow__desc">传正面图和标签图，Agent 把图上的字变成档案。</p>
      <p class="flow__hint">这一步还在做，先把前面两步跑通。</p>
    </section>

    <LaunchConfigStep
      v-else-if="state.step === 4 && state.saved"
      :ingredient-id="state.saved.ingredientId"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { supplementNutrientGroups } from '@/constants/supplementNutrients'
import type {
  SupplementComparisonDto,
  SupplementOfferDto
} from '@/types/ingredientCreation'
import CompareStep from './CompareStep.vue'
import LaunchConfigStep from '../LaunchConfigStep.vue'
import {
  canEnter,
  emptyFlowState,
  goTo,
  loadSnapshot,
  saveSnapshot,
  type FlowStep,
  type SupplementFlowState
} from './supplementFlowState'

/**
 * 补剂三步的外壳。
 *
 * 它只做四件事：拿状态、切步骤、存快照、把每一步的产物接起来。
 * 业务判断都在后端与各自的步骤组件里。
 */
const stepDefs: { id: FlowStep; label: string }[] = [
  { id: 1, label: '定形态' },
  { id: 2, label: '比价' },
  { id: 3, label: '建档' },
  { id: 4, label: '上架' }
]

const formLevelOptions = [
  { value: 'ORGANIC_CHELATE', label: '有机络合（螯合/氨基酸络合）' },
  { value: 'INORGANIC_SALT', label: '无机盐（硫酸盐等）' },
  { value: 'OXIDE', label: '氧化物' },
  { value: 'OTHER', label: '其它/复合' }
]

const nutrientOptions = supplementNutrientGroups.flatMap((group) =>
  group.fields.map((field) => ({ fieldPath: field.fieldPath, label: `${group.title} · ${field.label}` }))
)

const state = ref<SupplementFlowState>(loadSnapshot() ?? emptyFlowState())
const tempNutrientKey = ref<string | null>(state.value.nutrientKey)
const tempFormLevel = ref<string | null>(state.value.chosenFormLevel)

function isDone(step: FlowStep): boolean {
  if (step === 1) return !!state.value.chosenFormLevel || !!state.value.formAdvice
  if (step === 2) return !!state.value.chosenOfferUrl
  if (step === 3) return !!state.value.saved
  return false
}

function jump(step: FlowStep): void {
  state.value = goTo(state.value, step)
}

function startCompare(): void {
  const key = tempNutrientKey.value
  if (!key) {
    return
  }
  const option = nutrientOptions.find((item) => item.fieldPath === key)
  state.value = {
    ...state.value,
    nutrientKey: key,
    nutrientLabel: option?.label ?? key,
    chosenFormLevel: tempFormLevel.value,
    comparison: null
  }
  state.value = goTo(state.value, 2)
}

function setComparison(value: SupplementComparisonDto): void {
  state.value = { ...state.value, comparison: value }
}

function pickOffer(offer: SupplementOfferDto): void {
  state.value = {
    ...state.value,
    chosenOfferUrl: offer.url,
    archive: {
      ...state.value.archive,
      currentPricePerPurchaseUnit: offer.priceCny ?? state.value.archive.currentPricePerPurchaseUnit,
      purchaseToBaseRatio: offer.unitsPerBottle ?? state.value.archive.purchaseToBaseRatio,
      evidence: { ...state.value.archive.evidence, productUrl: offer.url }
    }
  }
  state.value = goTo(state.value, 3)
}

function backToForm(): void {
  state.value = goTo(state.value, 1)
}

watch(
  state,
  (value) => {
    saveSnapshot(value)
  },
  { deep: true }
)

onMounted(() => {
  saveSnapshot(state.value)
})
</script>

<style scoped>
.flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.flow__steps {
  display: flex;
  gap: 8px;
}
.flow__step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  color: #5b6470;
}
.flow__step--active {
  border-color: #3370ff;
  color: #3370ff;
  font-weight: 600;
}
.flow__step--done .flow__step-no {
  background: #0f7a54;
  color: #fff;
}
.flow__step--locked {
  cursor: not-allowed;
  opacity: 0.55;
}
.flow__step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #eef0f3;
  font-size: 12px;
}
.flow__panel {
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  padding: 16px;
}
.flow__panel h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.flow__desc {
  margin: 0 0 12px;
  font-size: 12px;
  color: #8a9099;
  line-height: 1.6;
}
.flow__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.flow__hint {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: #9aa2ab;
}
</style>
