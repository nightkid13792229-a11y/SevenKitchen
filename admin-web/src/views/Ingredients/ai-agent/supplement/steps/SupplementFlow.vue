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

    <ArchiveStep
      v-if="state.step === 1"
      :draft="state.archive"
      :selection-note="state.selectionNote"
      :saved-result="state.saved"
      @update:selection-note="onSelectionNote"
      @saved="onSaved"
      @go-launch="jump(2)"
    />

    <LaunchConfigStep
      v-else-if="state.step === 2 && state.saved"
      :ingredient-id="state.saved.ingredientId"
      @close="onLaunchClear"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import ArchiveStep from './ArchiveStep.vue'
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
 * 补剂线的 Web 端外壳。
 *
 * 只做两件事：建档（录入 + 门禁 + 写入）、上架（落地配置）。
 * 定形态与比价已经移到 DSH 的 supplement-product-selection Skill：
 * 结论以文字形式贴进「选品依据」，随档案留档。
 */
const stepDefs: { id: FlowStep; label: string }[] = [
  { id: 1, label: '建档' },
  { id: 2, label: '上架' }
]

const state = ref<SupplementFlowState>(loadSnapshot() ?? emptyFlowState())

function isDone(step: FlowStep): boolean {
  if (step === 1) return !!state.value.saved
  return false
}

function jump(step: FlowStep): void {
  state.value = goTo(state.value, step)
}

function onSelectionNote(value: string): void {
  state.value = { ...state.value, selectionNote: value }
}

function onSaved(result: { ingredientId: string; nutritionFoodId: string; evidenceId: string }): void {
  state.value = { ...state.value, saved: result }
}

/** 「不是这条？清除」：放掉刚写入的结果，回到建档页重来 */
function onLaunchClear(): void {
  state.value = { ...state.value, saved: null, step: 1 }
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
</style>
