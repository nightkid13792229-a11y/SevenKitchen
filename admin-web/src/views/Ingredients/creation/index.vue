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

    <template v-else-if="!loading">
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
        <component
          :is="currentStepComponent"
          :key="draft?.id ?? 'new-draft'"
          ref="stepRef"
          :draft="draft"
          :saving="saving"
          @next="handleStepNext"
          @can-next="handleStepCanNext"
        />
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
          :disabled="!canGoNext || saving || !stepCanProceed"
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
 * 各 Step 组件可选暴露 `submit()`：底部「下一步」优先调它，
 * 让组件自己校验并带上本站 payload（例如 ① 站的 intake）。
 */
interface CreationStepExpose {
  submit?: () => void
}

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
/**
 * 当前 Step 组件是否放行「下一步」。各站通过 `can-next` 事件上报；
 * 默认放行，避免尚未接 `can-next` 的站位在未来任务里被误禁用。
 */
const stepCanProceed = ref(true)
/** 当前 Step 组件实例；底部「下一步」优先调它暴露的 `submit()`。 */
const stepRef = ref<CreationStepExpose | null>(null)
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
  // 换站后由新组件自己上报；先放行，避免新组件还没挂载就被旧状态卡住。
  stepCanProceed.value = true
}

/**
 * 进页面没有 draftId 时不建草稿：① 站还没输入名字，后端的 name 必填。
 * 草稿延迟到第一次点「下一步」、拿到真实名字后再创建。
 */
async function bootstrap() {
  loading.value = true
  loadError.value = ''
  draft.value = null
  stepRef.value = null
  try {
    const draftId = readRouteDraftId()
    if (!draftId) {
      activeStep.value = 'INTAKE'
      maxReachableIndex.value = 0
      return
    }

    applyDraft(await ingredientCreationApi.getDraft(draftId))
  } catch (error) {
    draft.value = null
    loadError.value = getApiErrorMessage(
      error,
      '无法读取草稿，请稍后重试'
    )
    if (shouldToastApiError(error, '无法读取草稿')) {
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
  if (saving.value) {
    return
  }

  saving.value = true
  const previousMax = maxReachableIndex.value
  try {
    let draftId = draft.value?.id ?? readRouteDraftId()

    if (!draftId) {
      // 延迟创建：后端要求 name 非空，所以必须等到 ① 站拿到真实名字。
      const name = payload.intake?.name?.trim()
      if (!name) {
        ElMessage.warning('请先填写原料名称')
        return
      }

      const created = await ingredientCreationApi.createDraft(name)
      draftId = created.draftId
      await router.replace({
        name: 'IngredientCreation',
        params: { draftId }
      })
      // 先把新草稿拉回本地，后续站点与刷新都能按地址栏里的 draftId 恢复。
      applyDraft(await ingredientCreationApi.getDraft(draftId))
    }

    const updated = await ingredientCreationApi.patchDraft(
      draftId,
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

/**
 * 底部「下一步」：组件暴露了 `submit()` 就交给组件校验并带 payload，
 * 否则只推进站点（尚未接入校验的占位站）。
 */
function handleNext() {
  if (stepRef.value?.submit) {
    stepRef.value.submit()
    return
  }
  void advance(nextStep(activeStep.value))
}

/** 各 Step 组件发出的「下一步」：可携带本站 payload，由壳统一落库。 */
function handleStepNext(payload?: Partial<IngredientCreationDraftPayload>) {
  void advance(nextStep(activeStep.value), payload ?? {})
}

/** 各 Step 组件上报当前是否允许进入下一站（冲突未裁决等）。 */
function handleStepCanNext(value: boolean) {
  stepCanProceed.value = value
}

/** 换站时清掉上一步组件的实例与放行状态，由新组件挂载后自己上报。 */
function switchStep(step: CreationStep) {
  stepRef.value = null
  stepCanProceed.value = true
  activeStep.value = step
}

function handlePrevious() {
  const index = activeIndex.value
  if (index <= 0) {
    return
  }
  const previous = stepList[index - 1]
  if (previous) {
    switchStep(previous.step)
  }
}

function goToStep(index: number) {
  if (index < 0 || index > maxReachableIndex.value) {
    return
  }
  const target = stepList[index]
  if (target) {
    switchStep(target.step)
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
