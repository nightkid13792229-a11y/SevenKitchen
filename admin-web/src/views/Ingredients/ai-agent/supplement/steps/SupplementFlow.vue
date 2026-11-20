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

    <FormAdviceStep
      v-if="state.step === 1"
      :initial-nutrient-key="state.nutrientKey"
      @loaded="onAdviceLoaded"
      @chosen="onFormChosen"
      @skip="onSkipToCompare"
    />

    <CompareStep
      v-else-if="state.step === 2 && state.nutrientKey"
      :nutrient-key="state.nutrientKey"
      :nutrient-label="state.nutrientLabel"
      :form-label="effectiveForm(state)?.labelZh ?? ''"
      :form-aliases="chosenAliases"
      :comparison="state.comparison"
      @update:comparison="setComparison"
      @chosen="pickOffer"
      @back="backToForm"
    />

    <ArchiveStep
      v-else-if="state.step === 3"
      :draft="state.archive"
      :offer="chosenOffer"
      :form-level="effectiveForm(state)?.labelZh ?? ''"
      :chosen-form="effectiveForm(state)"
      :form-advice="state.formAdvice"
      :saved-result="state.saved"
      @back="backToCompare"
      @saved="onSaved"
      @go-launch="jump(4)"
    />

    <LaunchConfigStep
      v-else-if="state.step === 4 && state.saved"
      :ingredient-id="state.saved.ingredientId"
      @close="onLaunchClear"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type {
  SupplementComparisonDto,
  SupplementDimensionsAdviceDto,
  SupplementOfferDto
} from '@/types/ingredientCreation'
import ArchiveStep from './ArchiveStep.vue'
import CompareStep from './CompareStep.vue'
import FormAdviceStep from './FormAdviceStep.vue'
import LaunchConfigStep from '../LaunchConfigStep.vue'
import {
  canEnter,
  effectiveForm,
  emptyFlowState,
  goTo,
  loadSnapshot,
  saveSnapshot,
  type ChosenForm,
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

const state = ref<SupplementFlowState>(loadSnapshot() ?? emptyFlowState())

/** 选中的那个形态还有哪些别称（双甘氨酸铜…），比价时用来认同一档 */
const chosenAliases = computed<string[]>(() => {
  const chosen = effectiveForm(state.value)
  if (!chosen) {
    return []
  }
  const candidate = state.value.formAdvice?.dimensions
    .flatMap((group) => group.candidates)
    .find((item) => item.key === chosen.candidateKey)
  return candidate?.alsoKnownAs ?? []
})

const chosenOffer = computed<SupplementOfferDto | null>(() => {
  const data = state.value.comparison
  const url = state.value.chosenOfferUrl
  if (!data || !url) {
    return null
  }
  return data.offers.find((offer) => offer.url === url) ?? null
})

function isDone(step: FlowStep): boolean {
  if (step === 1) return !!state.value.chosenForm || !!state.value.formAdvice
  if (step === 2) return !!state.value.chosenOfferUrl
  if (step === 3) return !!state.value.saved
  return false
}

function jump(step: FlowStep): void {
  state.value = goTo(state.value, step)
}

function onAdviceLoaded(advice: SupplementDimensionsAdviceDto): void {
  // nutrientKey 必须在这里写进状态：第 2 步的渲染条件是 `state.nutrientKey`，
  // 只存 formAdvice 的话，选完形态页面会停在步骤条上（2026-11-20 复核阻塞项）
  state.value = {
    ...state.value,
    nutrientKey: advice.nutrientKey,
    nutrientLabel: advice.nutrientLabel,
    formAdvice: advice,
    chosenForm: null,
    formSkipped: false,
    comparison: null,
    chosenOfferUrl: null
  }
}

function onFormChosen(payload: ChosenForm): void {
  state.value = {
    ...state.value,
    chosenForm: payload,
    formSkipped: false,
    // 换形态就是换一批货，旧表不能留着
    comparison: null,
    chosenOfferUrl: null
  }
  state.value = goTo(state.value, 2)
}

/** 这一类没有形态可问：直接进比价，不逼着人点一个假选项 */
function onSkipToCompare(): void {
  // 没有形态可问：记住"跳过了"，否则 canEnter(2) 会把人锁在第 1 步
  state.value = goTo({ ...state.value, chosenForm: null, formSkipped: true }, 2)
}

function onSaved(result: { ingredientId: string; nutritionFoodId: string; evidenceId: string }): void {
  state.value = { ...state.value, saved: result }
}

/** 「不是这条？清除」：把刚写入的结果放掉，回到第 3 步重来 */
function onLaunchClear(): void {
  state.value = { ...state.value, saved: null, step: 3 }
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

/** 第 3 步的「回去比价」是回第 2 步，不是回第 1 步 */
function backToCompare(): void {
  state.value = goTo(state.value, 2)
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
