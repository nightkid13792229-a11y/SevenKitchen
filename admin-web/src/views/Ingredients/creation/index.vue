<template>
  <div class="creation-page" v-loading="loading || saving">
    <header class="creation-page__header">
      <div>
        <h2 class="creation-page__title">AI 新建标准原料</h2>
        <p class="creation-page__subtitle">
          AI 出方案，人做确认；每个进入档案的数字都要能追到来源。
        </p>
      </div>
      <el-button text @click="handleBackToList">返回原料列表</el-button>
    </header>

    <el-result
      v-if="loadError"
      icon="error"
      title="草稿加载失败"
      :sub-title="loadError"
    >
      <template #extra>
        <el-button @click="handleBackToList">返回原料列表</el-button>
        <el-button type="primary" @click="handleCreateNewDraft">重新开始</el-button>
      </template>
    </el-result>

    <template v-else-if="draft">
      <nav class="creation-steps" aria-label="创建步骤">
        <button
          v-for="(item, index) in stepList"
          :key="item.step"
          type="button"
          class="creation-step-tab"
          :class="{
            'is-active': item.step === activeStep,
            'is-done': index < activeIndex,
            'is-reachable': index <= maxReachableIndex
          }"
          :disabled="index > maxReachableIndex"
          :aria-current="item.step === activeStep ? 'step' : undefined"
          @click="goToStep(index)"
        >
          <span class="creation-step-tab__index">{{ index + 1 }}</span>
          <span class="creation-step-tab__text">
            <span class="creation-step-tab__title">{{ item.title }}</span>
            <span class="creation-step-tab__summary">{{ item.summary }}</span>
          </span>
        </button>
      </nav>

      <el-card class="creation-body" shadow="never">
        <component :is="currentStepComponent" @next="handleStepNext" />
      </el-card>

      <footer class="creation-footer">
        <el-button :disabled="activeIndex === 0 || saving" @click="handlePrevious">
          上一步
        </el-button>
        <span class="creation-footer__position">
          第 {{ activeIndex + 1 }} / {{ stepList.length }} 站
          <span v-if="!canGoNext"> · 已是最后一站</span>
        </span>
        <el-button
          type="primary"
          :disabled="!canGoNext || saving"
          @click="handleNext"
        >
          下一步
        </el-button>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Component } from 'vue'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import type {
  CreationStep,
  IngredientCreationDraft,
  IngredientCreationDraftPayload
} from '@/types/ingredientCreation'
import {
  getApiErrorMessage,
  shouldToastApiError
} from '@/utils/apiError'
import StepCheck from './StepCheck.vue'
import StepFinish from './StepFinish.vue'
import StepIngredient from './StepIngredient.vue'
import StepIntake from './StepIntake.vue'
import StepProfile from './StepProfile.vue'
import StepSources from './StepSources.vue'
import { nextStep, stepIndex, stepList } from './stepState'

/**
 * 起手站还没输入名字，而后端 `POST drafts` 要求 name 非空，
 * 所以先落一个工作名；正式原料名以 ⑤ 与提交时的字段为准。
 */
const DRAFT_WORKING_NAME = '未命名原料'

const stepComponents: Record<CreationStep, Component> = {
  INTAKE: StepIntake,
  SOURCES: StepSources,
  PROFILE: StepProfile,
  CHECK: StepCheck,
  INGREDIENT: StepIngredient,
  COMMIT: StepFinish
}

const route = useRoute()
const router = useRouter()

const draft = ref<IngredientCreationDraft | null>(null)
const activeStep = ref<CreationStep>('INTAKE')
/** 已到达过的最远一站：进度条只允许点回这里及更早的站。 */
const maxReachableIndex = ref(0)
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')

const activeIndex = computed(() => Math.max(stepIndex(activeStep.value), 0))
const currentStepComponent = computed(() => stepComponents[activeStep.value])
const canGoNext = computed(() => nextStep(activeStep.value) !== null)

function readRouteDraftId(): string | null {
  const raw = route.params.draftId
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.length > 0 ? value : null
}

function applyDraft(loaded: IngredientCreationDraft) {
  draft.value = loaded
  const index = stepIndex(loaded.step)
  activeStep.value = index >= 0 ? loaded.step : 'INTAKE'
  maxReachableIndex.value = Math.max(index, 0)
}

/**
 * 进页面没有 draftId 时先建草稿，再把 draftId 补进地址栏，
 * 这样刷新或从别处打开同一地址都能回到这份草稿。
 */
async function bootstrap() {
  loading.value = true
  loadError.value = ''
  try {
    let draftId = readRouteDraftId()
    if (!draftId) {
      const created = await ingredientCreationApi.createDraft(DRAFT_WORKING_NAME)
      draftId = created.draftId
      await router.replace({
        name: 'IngredientCreation',
        params: { draftId }
      })
    }

    applyDraft(await ingredientCreationApi.getDraft(draftId))
  } catch (error) {
    draft.value = null
    loadError.value = getApiErrorMessage(
      error,
      '无法创建或读取草稿，请稍后重试'
    )
    if (shouldToastApiError(error, '无法创建或读取草稿')) {
      ElMessage.error(loadError.value)
    }
  } finally {
    loading.value = false
  }
}

async function persistStep(
  target: CreationStep,
  payload: Partial<IngredientCreationDraftPayload>
) {
  const current = draft.value
  if (!current || saving.value) {
    return
  }

  saving.value = true
  const previousMax = maxReachableIndex.value
  try {
    const updated = await ingredientCreationApi.patchDraft(
      current.id,
      target,
      payload
    )
    applyDraft(updated)
    // applyDraft 会按后端返回的 step 重置可达范围；导航回看时不能丢掉已到过的站。
    maxReachableIndex.value = Math.max(previousMax, stepIndex(target))
  } catch (error) {
    if (shouldToastApiError(error, '保存草稿失败')) {
      ElMessage.error(getApiErrorMessage(error, '保存草稿失败'))
    }
  } finally {
    saving.value = false
  }
}

async function advance(
  target: CreationStep | null,
  payload: Partial<IngredientCreationDraftPayload> = {}
) {
  if (!target) {
    return
  }
  await persistStep(target, payload)
}

/** 底部「下一步」：只负责推进站点；各站自己的保存逻辑通过 `next` 事件带 payload。 */
function handleNext() {
  void advance(nextStep(activeStep.value))
}

/** 各 Step 组件发出的「下一步」：可携带本站 payload，由壳统一落库。 */
function handleStepNext(payload?: Partial<IngredientCreationDraftPayload>) {
  void advance(nextStep(activeStep.value), payload ?? {})
}

function handlePrevious() {
  const index = activeIndex.value
  if (index <= 0) {
    return
  }
  const previous = stepList[index - 1]
  if (previous) {
    activeStep.value = previous.step
  }
}

function goToStep(index: number) {
  if (index < 0 || index > maxReachableIndex.value) {
    return
  }
  const target = stepList[index]
  if (target) {
    activeStep.value = target.step
  }
}

async function handleCreateNewDraft() {
  await router.replace({ name: 'IngredientCreation' })
  await bootstrap()
}

async function handleBackToList() {
  // 只要向后推进过（哪怕当前点回了第一站），离开就会丢掉一份无法从列表找回的进度。
  if (maxReachableIndex.value > 0) {
    try {
      await ElMessageBox.confirm(
        '草稿已自动保存在服务器，但当前版本还没有草稿列表入口，离开后将无法从列表回到这一份。确定离开？',
        '离开 AI 新建？',
        {
          type: 'warning',
          confirmButtonText: '离开',
          cancelButtonText: '继续填写'
        }
      )
    } catch {
      return
    }
  }

  await router.push('/ingredients')
}

onMounted(bootstrap)
</script>

<style scoped>
.creation-page {
  max-width: 1180px;
  margin: 0 auto;
  padding-bottom: 80px;
}

.creation-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.creation-page__title {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.creation-page__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #909399;
}

.creation-steps {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 4px;
  overflow-x: auto;
}

.creation-step-tab {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 150px;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.creation-step-tab:hover:not(:disabled) {
  border-color: #a0cfff;
}

.creation-step-tab:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.creation-step-tab.is-active {
  border-color: #409eff;
  background: #ecf5ff;
}

.creation-step-tab.is-done .creation-step-tab__index,
.creation-step-tab.is-active .creation-step-tab__index {
  border-color: #409eff;
  background: #409eff;
  color: #fff;
}

.creation-step-tab.is-done .creation-step-tab__index {
  border-color: #67c23a;
  background: #67c23a;
}

.creation-step-tab__index {
  flex: none;
  width: 22px;
  height: 22px;
  border: 1px solid #c0c4cc;
  border-radius: 50%;
  color: #606266;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
}

.creation-step-tab__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.creation-step-tab__title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.creation-step-tab__summary {
  overflow: hidden;
  font-size: 11px;
  color: #909399;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.creation-body {
  min-height: 380px;
}

.creation-footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 16px;
  border-top: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.04);
}

.creation-footer__position {
  font-size: 13px;
  color: #909399;
}

:deep(.creation-step) {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

:deep(.creation-step__header) {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

:deep(.creation-step__badge) {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ecf5ff;
  color: #409eff;
  font-size: 18px;
  line-height: 36px;
  text-align: center;
}

:deep(.creation-step__title) {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

:deep(.creation-step__summary) {
  margin: 4px 0 0;
  font-size: 13px;
  color: #909399;
}

:deep(.creation-step__placeholder) {
  padding: 48px 16px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
  color: #909399;
  text-align: center;
}

:deep(.creation-step__placeholder p) {
  margin: 0;
}

:deep(.creation-step__actions) {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .creation-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .creation-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
