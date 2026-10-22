<template>
  <el-drawer v-model="visible" size="760px" destroy-on-close :before-close="handleBeforeClose">
    <template #header>
      <div class="launch-readiness__heading">
        <div class="launch-readiness__heading-text">
          <span class="launch-readiness__title">上线检查</span>
          <span class="launch-readiness__subtitle">
            发布 / 加入待提交前共用门槛
          </span>
        </div>
        <el-tag
          v-if="loading"
          size="small"
          type="info"
          effect="dark"
        >检查中…</el-tag>
        <el-tag
          v-else-if="readiness"
          size="small"
          :type="readiness.ready ? 'success' : 'danger'"
          effect="dark"
        >{{ launchReadinessStatusLabel(readiness.ready) }}</el-tag>
        <el-tag
          v-else-if="error"
          size="small"
          type="danger"
          effect="dark"
        >检查失败</el-tag>
      </div>
    </template>

    <div class="launch-readiness">
      <div class="launch-readiness__toolbar">
        <div class="launch-readiness__meta">
          <template v-if="readiness">
            <el-tag size="small" effect="plain">
              {{ launchReadinessModeLabel(readiness.designMode) }}
            </el-tag>
            <span class="launch-readiness__draft">
              草稿 {{ readiness.draftId }}
            </span>
          </template>
          <span v-else class="launch-readiness__draft">
            检查服务器上已保存的草稿
          </span>
        </div>
        <el-button
          size="small"
          :icon="Refresh"
          :loading="loading"
          :disabled="!draftId"
          @click="loadReadiness"
        >刷新检查</el-button>
      </div>

      <el-alert
        v-if="readiness"
        class="launch-readiness__mode-note"
        type="info"
        :closable="false"
        show-icon
        :title="launchReadinessModeNote(readiness.designMode)"
      />

      <div v-if="!readiness && !error" class="launch-readiness__loading">
        <el-skeleton :rows="6" animated />
      </div>

      <div v-else-if="error && !readiness" class="launch-readiness__error">
        <el-alert
          type="error"
          :closable="false"
          show-icon
          title="上线检查加载失败"
          :description="error"
        />
        <el-button
          type="primary"
          :loading="loading"
          @click="loadReadiness"
        >重试</el-button>
      </div>

      <div
        v-else-if="readiness"
        v-loading="loading"
        class="launch-readiness__content"
      >
        <div
          class="launch-readiness__overview"
          :class="{ 'is-ready': readiness.ready, 'is-blocked': !readiness.ready }"
        >
          <el-icon
            v-if="readiness.ready"
            class="launch-readiness__overview-icon"
          ><CircleCheckFilled /></el-icon>
          <el-icon
            v-else
            class="launch-readiness__overview-icon"
          ><CircleCloseFilled /></el-icon>
          <div class="launch-readiness__overview-text">
            <div class="launch-readiness__overview-title">
              {{ launchReadinessStatusSummary(readiness) }}
            </div>
            <div class="launch-readiness__overview-sub">
              阻断 {{ readiness.blockers.length }} 项 · 提醒
              {{ readiness.warnings.length }} 项
            </div>
          </div>
        </div>

        <section class="launch-readiness__section">
          <div class="launch-readiness__section-title">概要</div>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item
              v-for="row in summaryRows"
              :key="row.key"
              :label="row.label"
            >
              <div
                v-if="row.key === 'reportAvailable'"
                class="launch-readiness__report-action"
              >
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :loading="reportLoading"
                  @click="openNutritionReport"
                >{{ reportAction ? reportAction.label : row.value }}</el-button>
              </div>
              <span
                v-else
                class="launch-readiness__summary-value"
                :class="[
                  `is-${row.tone}`,
                  { 'is-clickable': row.key === 'stepCount' }
                ]"
                :title="row.key === 'stepCount' ? '点击展开制作步骤' : undefined"
                @click="onSummaryRowClick(row.key)"
              >{{ row.value }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </section>

        <section class="launch-readiness__section">
          <div class="launch-readiness__section-title">产品展示</div>
          <PresentationPanel
            :draft-id="draftId"
            :design-mode="readiness.designMode"
            @saved="handlePresentationSaved"
            @dirty-change="(value: boolean) => (presentationDirty = value)"
          />
        </section>

        <section class="launch-readiness__section">
          <el-collapse v-model="stepsExpanded" class="launch-readiness__steps">
            <el-collapse-item name="steps">
              <template #title>
                <div class="launch-readiness__steps-title">
                  <span>制作步骤</span>
                  <el-tag
                    size="small"
                    :type="readiness.summary.stepCount > 0 ? 'success' : 'danger'"
                    effect="plain"
                  >
                    {{ readiness.summary.stepCount > 0
                      ? `${readiness.summary.stepCount} 步`
                      : '未设置' }}
                  </el-tag>
                  <span class="launch-readiness__steps-hint">
                    直接在这里编辑、保存，不需要再打开另一个弹窗
                  </span>
                </div>
              </template>
              <ProductionStepsEditor
                :draft-id="draftId"
                @saved="handleStepsSaved"
                @dirty-change="(value: boolean) => (stepsDirty = value)"
              />
            </el-collapse-item>
          </el-collapse>
        </section>

        <section class="launch-readiness__section">
          <div class="launch-readiness__section-title">
            已通过
            <span class="launch-readiness__count">{{ passedChecks.length }}</span>
          </div>
          <div v-if="passedChecks.length" class="launch-readiness__passed">
            <div
              v-for="check in passedChecks"
              :key="check.code"
              class="launch-passed"
            >
              <el-icon class="is-success"><CircleCheckFilled /></el-icon>
              <span>{{ check.label }}</span>
              <el-tag
                size="small"
                type="info"
                effect="plain"
                class="launch-passed__scope"
              >{{ check.scopeLabel }}</el-tag>
            </div>
          </div>
          <div v-else class="launch-readiness__clear">
            暂无已通过项
          </div>
        </section>

        <section class="launch-readiness__section">
          <div class="launch-readiness__section-title">
            阻断项
            <span class="launch-readiness__count">{{ readiness.blockers.length }}</span>
          </div>
          <div
            v-if="readiness.blockers.length"
            class="launch-readiness__groups"
          >
            <div
              v-for="group in blockerGroups"
              :key="`blocker-group-${group.scope}`"
              class="launch-readiness__group"
            >
              <div class="launch-readiness__group-title">
                <el-tag size="small" effect="plain">{{ group.label }}</el-tag>
                <span class="launch-readiness__group-count">
                  {{ group.issues.length }} 项
                </span>
              </div>
              <div class="launch-readiness__issues">
                <div
                  v-for="(blocker, index) in group.issues"
                  :key="`${blocker.code}-${blocker.itemId || index}`"
                  class="launch-issue launch-issue--blocker"
                >
                  <div class="launch-issue__message">
                    <el-icon class="launch-issue__icon"><CircleCloseFilled /></el-icon>
                    <span>{{ blocker.message }}</span>
                  </div>
                  <div class="launch-issue__hints">
                    <el-tag
                      v-if="launchIssueFieldLabel(blocker.field)"
                      size="small"
                      type="danger"
                      effect="plain"
                      :title="blocker.field"
                    >字段：{{ launchIssueFieldLabel(blocker.field) }}</el-tag>
                    <el-tag
                      v-if="launchIssueItemLabel(blocker.itemId)"
                      size="small"
                      type="info"
                      effect="plain"
                      :title="blocker.itemId"
                    >{{ launchIssueItemLabel(blocker.itemId) }}</el-tag>
                    <span class="launch-issue__code">{{ blocker.code }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="launch-readiness__clear">
            <el-icon class="is-success"><CircleCheckFilled /></el-icon>
            没有阻断项
          </div>
        </section>

        <section class="launch-readiness__section">
          <div class="launch-readiness__section-title">
            提醒项
            <span class="launch-readiness__count">{{ readiness.warnings.length }}</span>
          </div>
          <div
            v-if="readiness.warnings.length"
            class="launch-readiness__groups"
          >
            <div
              v-for="group in warningGroups"
              :key="`warning-group-${group.scope}`"
              class="launch-readiness__group"
            >
              <div class="launch-readiness__group-title">
                <el-tag
                  size="small"
                  type="warning"
                  effect="plain"
                >{{ group.label }}</el-tag>
                <span class="launch-readiness__group-count">
                  {{ group.issues.length }} 项
                </span>
              </div>
              <div class="launch-readiness__issues">
                <div
                  v-for="(warning, index) in group.issues"
                  :key="`${warning.code}-${warning.itemId || index}`"
                  class="launch-issue launch-issue--warning"
                >
                  <div class="launch-issue__message">
                    <el-icon class="launch-issue__icon"><WarningFilled /></el-icon>
                    <span>{{ warning.message }}</span>
                  </div>
                  <div class="launch-issue__hints">
                    <el-tag
                      v-if="launchIssueFieldLabel(warning.field)"
                      size="small"
                      type="warning"
                      effect="plain"
                      :title="warning.field"
                    >字段：{{ launchIssueFieldLabel(warning.field) }}</el-tag>
                    <el-tag
                      v-if="launchIssueItemLabel(warning.itemId)"
                      size="small"
                      type="info"
                      effect="plain"
                      :title="warning.itemId"
                    >{{ launchIssueItemLabel(warning.itemId) }}</el-tag>
                    <span class="launch-issue__code">{{ warning.code }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="launch-readiness__clear">
            <el-icon class="is-success"><CircleCheckFilled /></el-icon>
            没有提醒项
          </div>
        </section>

        <p class="launch-readiness__footer-note">
          检查的是服务器上已保存的版本；刚修改过的内容请等保存完成后再点「刷新检查」。
        </p>
      </div>
    </div>
  </el-drawer>

  <!--
    营养报告（2026-10-22）：在上线检查里生成 / 查看，不跳转路由。
    报告由后端按发布口径生成并持久化，这里只负责展示与过期提示。
  -->
  <NutritionReportDrawer
    v-model="reportDrawerVisible"
    :snapshot="reportSnapshot"
    :loading="reportLoading"
    :error="reportError"
    @retry="retryNutritionReport"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Refresh,
  WarningFilled
} from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import ProductionStepsEditor from './ProductionStepsEditor.vue'
import NutritionReportDrawer from './NutritionReportDrawer.vue'
import PresentationPanel from './PresentationPanel.vue'
import type {
  DraftLaunchReadiness,
  DraftNutritionReportEnvelope
} from '@/types/recipeDesigner'
import {
  buildLaunchPassedChecks,
  buildLaunchSummaryRows,
  groupLaunchReadinessIssues,
  launchIssueFieldLabel,
  launchIssueItemLabel,
  launchReadinessModeLabel,
  launchReadinessModeNote,
  launchReadinessStatusLabel,
  launchReadinessStatusSummary
} from '@/utils/recipeDesigner/launchReadiness'
import { resolveNutritionReportAction } from '@/utils/recipeDesigner/nutritionReport'

const props = defineProps<{
  modelValue: boolean
  draftId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const loading = ref(false)
const error = ref('')
const readiness = ref<DraftLaunchReadiness | null>(null)
const stepsExpanded = ref<string[]>([])
const stepsDirty = ref(false)
const presentationDirty = ref(false)

const reportDrawerVisible = ref(false)
const reportSnapshot = ref<DraftNutritionReportEnvelope | null>(null)
const reportLoading = ref(false)
const reportError = ref('')

/** 只认最后一次请求，避免关闭 / 重复刷新时的旧响应覆盖新状态 */
let requestSeq = 0
/** 营养报告独立计数，生成 / 查看失败时不干扰上线检查本身 */
let reportRequestSeq = 0

const summaryRows = computed(() =>
  readiness.value ? buildLaunchSummaryRows(readiness.value.summary) : []
)

/** 概要里的「完整营养报告」不是纯文本，而是按报告状态给出的动作 */
const reportAction = computed(() =>
  readiness.value
    ? resolveNutritionReportAction(readiness.value.summary)
    : null
)

const passedChecks = computed(() =>
  readiness.value ? buildLaunchPassedChecks(readiness.value) : []
)

/** 阻断 / 提醒都按归属分组：共用 / 展示资料 / 产品线或订单 */
const blockerGroups = computed(() =>
  readiness.value
    ? groupLaunchReadinessIssues(
        readiness.value.blockers,
        readiness.value.designMode
      )
    : []
)

const warningGroups = computed(() =>
  readiness.value
    ? groupLaunchReadinessIssues(
        readiness.value.warnings,
        readiness.value.designMode
      )
    : []
)

async function loadReadiness(): Promise<void> {
  if (!props.draftId) {
    readiness.value = null
    error.value = '缺少草稿 id，无法执行上线检查'
    return
  }

  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  try {
    const result = await recipeDesignerApi.getDraftLaunchReadiness(props.draftId)
    if (seq !== requestSeq) return
    readiness.value = result
    if (result.summary.stepCount === 0) {
      stepsExpanded.value = ['steps']
    }
  } catch {
    if (seq !== requestSeq) return
    // 错误提示已由 API 拦截器统一弹出，这里只保留可重试的内联状态
    readiness.value = null
    error.value = '上线检查加载失败，请稍后重试'
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

function onSummaryRowClick(key: string): void {
  if (key === 'stepCount') {
    stepsExpanded.value = ['steps']
  }
}

async function handleStepsSaved(): Promise<void> {
  stepsDirty.value = false
  await loadReadiness()
}

/** 展示资料保存成功后立即重拉上线检查，阻断项 / 已通过项同步更新 */
async function handlePresentationSaved(): Promise<void> {
  presentationDirty.value = false
  await loadReadiness()
}

/**
 * 打开营养报告：
 *  - 已保存且未过期 → GET 读回，直接查看；
 *  - 没生成过 / 已过期 → POST 生成，成功后刷新上线检查概要。
 *
 * 生成失败（后端 400）与读取失败都留在报告抽屉里重试，不关闭上线检查。
 */
async function openNutritionReport(): Promise<void> {
  if (!props.draftId || !readiness.value) return

  const action = resolveNutritionReportAction(readiness.value.summary)
  const needsGenerate = action.kind !== 'view'
  const seq = ++reportRequestSeq

  reportSnapshot.value = null
  reportError.value = ''
  reportLoading.value = true
  reportDrawerVisible.value = true

  try {
    const snapshot = needsGenerate
      ? await recipeDesignerApi.generateDraftNutritionReport(props.draftId)
      : await recipeDesignerApi.getDraftNutritionReport(props.draftId)
    if (seq !== reportRequestSeq) return
    reportSnapshot.value = snapshot
    if (needsGenerate) {
      // 生成后 revision 变了：重新拉上线检查，概要里的动作会切成「查看营养报告」
      await loadReadiness()
    }
  } catch {
    if (seq !== reportRequestSeq) return
    // 错误提示已由 API 拦截器统一弹出，这里只保留可重试的内联状态
    reportError.value = needsGenerate
      ? '营养报告生成失败，请稍后重试'
      : '营养报告加载失败，请稍后重试'
  } finally {
    if (seq === reportRequestSeq) {
      reportLoading.value = false
    }
  }
}

async function retryNutritionReport(): Promise<void> {
  await openNutritionReport()
}

async function handleBeforeClose(done: () => void): Promise<void> {
  if (!stepsDirty.value && !presentationDirty.value) {
    done()
    return
  }

  const dirtySections = [
    presentationDirty.value ? '产品展示' : '',
    stepsDirty.value ? '制作步骤' : ''
  ].filter(Boolean)
  try {
    await ElMessageBox.confirm(
      `${dirtySections.join('、')}还有未保存的修改，关闭会丢失这些修改。确定关闭吗？`,
      '有未保存的修改',
      {
        type: 'warning',
        confirmButtonText: '放弃修改并关闭',
        cancelButtonText: '继续编辑'
      }
    )
    stepsDirty.value = false
    presentationDirty.value = false
    done()
  } catch {
    // 留在抽屉里继续编辑
  }
}

watch(
  () => [props.modelValue, props.draftId] as const,
  ([open, draftId]) => {
    if (!open) {
      // 关闭后到达的响应不再写回，避免下次打开先闪一眼旧结果
      requestSeq += 1
      loading.value = false
      stepsDirty.value = false
      presentationDirty.value = false
      reportRequestSeq += 1
      reportDrawerVisible.value = false
      reportLoading.value = false
      reportSnapshot.value = null
      reportError.value = ''
      return
    }
    readiness.value = null
    error.value = ''
    stepsDirty.value = false
    presentationDirty.value = false
    reportSnapshot.value = null
    reportError.value = ''
    if (!draftId) {
      error.value = '缺少草稿 id，无法执行上线检查'
      return
    }
    void loadReadiness()
  },
  { immediate: true }
)
</script>

<style scoped>
.launch-readiness__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.launch-readiness__heading-text {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.launch-readiness__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.launch-readiness__subtitle {
  font-size: 12px;
  color: #909399;
}

.launch-readiness {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.launch-readiness__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.launch-readiness__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.launch-readiness__draft {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launch-readiness__mode-note :deep(.el-alert__title) {
  font-size: 12px;
  line-height: 1.6;
}

.launch-readiness__loading {
  padding: 8px 0;
}

.launch-readiness__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.launch-readiness__content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 200px;
}

.launch-readiness__overview {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  padding: 14px 16px;
  border: 1px solid #e4e7ed;
  background: #f5f7fa;
}

.launch-readiness__overview.is-ready {
  border-color: #b3e19d;
  background: #f0f9eb;
}

.launch-readiness__overview.is-blocked {
  border-color: #f3d19e;
  background: #fdf6ec;
}

.launch-readiness__overview-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.is-ready .launch-readiness__overview-icon {
  color: #67c23a;
}

.is-blocked .launch-readiness__overview-icon {
  color: #e6a23c;
}

.launch-readiness__overview-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.launch-readiness__overview-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.launch-readiness__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.launch-readiness__section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.launch-readiness__count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #f0f2f5;
  color: #606266;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.launch-readiness__summary-value.is-success {
  color: #67c23a;
  font-weight: 600;
}

.launch-readiness__summary-value.is-danger {
  color: #f56c6c;
  font-weight: 600;
}

.launch-readiness__report-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.launch-readiness__issues {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.launch-readiness__groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.launch-readiness__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.launch-readiness__group-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.launch-readiness__group-count {
  font-size: 12px;
  color: #909399;
}

.launch-issue {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}

.launch-issue--blocker {
  border-left: 3px solid #f56c6c;
}

.launch-issue--warning {
  border-left: 3px solid #e6a23c;
}

.launch-issue__message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

.launch-issue__icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.launch-issue--blocker .launch-issue__icon {
  color: #f56c6c;
}

.launch-issue--warning .launch-issue__icon {
  color: #e6a23c;
}

.launch-issue__hints {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-left: 20px;
}

.launch-issue__code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #c0c4cc;
  margin-left: auto;
}

.launch-readiness__clear {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.launch-readiness__clear .is-success {
  color: #67c23a;
}

.launch-readiness__footer-note {
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.launch-readiness__steps {
  border-top: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
}

.launch-readiness__steps-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.launch-readiness__steps-title > span:first-child {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.launch-readiness__steps-hint {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.launch-readiness__summary-value.is-clickable {
  cursor: pointer;
  color: #409eff;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.launch-readiness__passed {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.launch-passed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #529b2e;
}

.launch-passed .is-success {
  color: #67c23a;
}

.launch-passed__scope {
  margin-left: auto;
}
</style>
