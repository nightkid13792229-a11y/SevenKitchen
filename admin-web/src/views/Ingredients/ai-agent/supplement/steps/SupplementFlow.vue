<template>
  <div class="flow">
    <div v-if="previous" class="flow__previous">
      <span>
        上次建的是「{{ previous.name || '这条补剂' }}」，已经建档完成。
      </span>
      <el-button text size="small" @click="resumePrevious">继续配置这条</el-button>
      <el-button text size="small" @click="dismissPrevious">知道了</el-button>
    </div>

    <div class="flow__bar">
      <el-button
        text
        size="small"
        data-action="start-new-supplement"
        @click="startNew"
      >
        ＋ 新建一条补剂
      </el-button>
    </div>

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

/**
 * 进页面默认是**新的一条**：上次已经建档完成的那条不自动恢复，
 * 否则每次进来都停在它的「上架」阶段，想加新原料还得先找地方清空。
 */
const snapshot = loadSnapshot()
const previous = ref<{ ingredientId: string; nutritionFoodId: string; evidenceId: string; name?: string } | null>(
  snapshot?.saved ? { ...snapshot.saved } : null,
)
const state = ref<SupplementFlowState>(
  snapshot?.saved ? emptyFlowState() : (snapshot ?? emptyFlowState()),
)

function resumePrevious(): void {
  const saved = previous.value
  if (!saved) return
  state.value = { ...emptyFlowState(), step: 2, saved }
  previous.value = null
}

function dismissPrevious(): void {
  previous.value = null
}

function startNew(): void {
  state.value = emptyFlowState()
  previous.value = null
}

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

function onSaved(result: {
  ingredientId: string
  nutritionFoodId: string
  evidenceId: string
  name?: string
}): void {
  state.value = { ...state.value, saved: result }
  previous.value = null
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
.flow__previous {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #f4f8ff;
  border: 1px solid #d9e6ff;
  font-size: 12.5px;
  color: #4a5563;
}
.flow__bar {
  display: flex;
  justify-content: flex-end;
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
