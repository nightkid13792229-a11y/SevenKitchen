<template>
  <div class="publish-page">
    <div class="page-header">
      <el-page-header @back="$router.back()">
        <template #content>
          <span class="header-title">发布配方</span>
        </template>
      </el-page-header>
    </div>

    <div v-loading="loading">
      <template v-if="draft">
        <el-alert
          v-if="!isAdmin"
          type="info"
          :closable="false"
          show-icon
          title="仅管理员可发布食谱。配餐员完成设计后，请提交给管理员在此发布。"
          class="alert"
        />

        <el-card shadow="never" class="section">
          <template #header>配方信息</template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="系列阶段">
              {{ draft.name }}
            </el-descriptions-item>
            <el-descriptions-item label="生命阶段">
              {{ draft.seriesLifeStage || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="方案">
              {{ draft.fediafDogScenario || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="版本">
              v{{ draft.version }}
            </el-descriptions-item>
            <el-descriptions-item label="原料数">
              {{ draft.items?.length ?? 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="总重量">
              {{ formatWeight(totalWeight) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never" class="section">
          <template #header>FEDIAF 2025 营养评估</template>
          <div v-if="assessment" class="assessment-overview">
            <div class="status-row">
              <el-tag :type="overallTagType" size="large">
                {{ overallStatusLabel }}
              </el-tag>
              <span class="summary-text">
                达标 {{ assessment.summary?.compliant ?? 0 }} ·
                不足 {{ assessment.summary?.deficient ?? 0 }} ·
                超标 {{ assessment.summary?.excess ?? 0 }} ·
                缺数据 {{ assessment.summary?.missingData ?? 0 }}
              </span>
            </div>
            <el-alert
              v-if="overallStatus !== 'COMPLIANT'"
              type="warning"
              :closable="false"
              show-icon
              title="配方未完全达标，发布将进入人工审核流程，需填写审核备注"
              class="alert"
            />
          </div>
          <div v-else class="muted">评估数据加载失败，请返回编辑器重新评估</div>
        </el-card>

        <el-card shadow="never" class="section" v-if="assessment">
          <template #header>完整营养评估报告</template>
          <!-- 食谱原料清单 -->
          <div class="report-block">
            <div class="report-block-title">食谱原料清单</div>
            <table class="report-table">
              <thead>
                <tr>
                  <th class="col-ingredient">原料</th>
                  <th class="col-number">用量</th>
                  <th class="col-number">重量占比</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in report.ingredientRows" :key="row.ingredientName">
                  <td class="col-ingredient">{{ row.ingredientName }}</td>
                  <td class="col-number">{{ row.amountLabel }}</td>
                  <td class="col-number">{{ row.weightPercentLabel }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 宏量营养分析 -->
          <div class="report-block">
            <div class="report-block-title">宏量营养分析</div>
            <table class="report-table">
              <thead>
                <tr>
                  <th class="col-name">项目</th>
                  <th class="col-number">占配方</th>
                  <th class="col-number">占干物质</th>
                  <th class="col-number">占热量</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in report.macroRows" :key="row.key">
                  <td class="col-name">{{ row.name }}</td>
                  <td class="col-number">{{ row.weightPercentLabel }}</td>
                  <td class="col-number">{{ row.dryMatterLabel }}</td>
                  <td class="col-number">{{ row.energyPercentLabel }}</td>
                </tr>
              </tbody>
            </table>
            <div class="energy-density-list">
              <div v-for="row in report.energyDensityRows" :key="row.label" class="energy-density-row">
                <span class="energy-density-label">能量密度</span>
                <span class="energy-density-value">{{ row.value }}</span>
              </div>
            </div>
          </div>

          <!-- 各类营养素分区 -->
          <div v-for="section in nutrientSectionList" :key="section.key" class="report-block">
            <div class="report-block-title">{{ section.title }}</div>
            <table class="report-table">
              <thead>
                <tr>
                  <th class="col-name">营养素</th>
                  <th class="col-unit">单位</th>
                  <th class="col-number">标准下限</th>
                  <th class="col-number">标准上限</th>
                  <th class="col-number">食谱含量</th>
                  <th class="col-number">{{ section.dryMatterHeader || '/100gDM' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="section.rows.length === 0">
                  <td colspan="6" class="empty-cell">暂无数据</td>
                </tr>
                <tr
                  v-for="row in section.rows"
                  :key="row.key || row.name"
                  :class="row.statusClass"
                >
                  <td class="col-name">{{ row.name }}</td>
                  <td class="col-unit">{{ row.unit }}</td>
                  <td class="col-number">{{ row.minLabel }}</td>
                  <td class="col-number">{{ row.maxLabel }}</td>
                  <td class="col-number current-cell">{{ row.currentLabel }}</td>
                  <td class="col-number">{{ row.dryMatterLabel }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </el-card>

        <el-card v-if="issueEntries.length" shadow="never" class="section">
          <template #header>待关注营养素（{{ issueEntries.length }}）</template>
          <el-table :data="issueEntries" size="small" stripe>
            <el-table-column prop="label" label="营养素" min-width="140" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="当前值" width="120">
              <template #default="{ row }">
                {{ row.currentValue == null ? '—' : formatNumber(row.currentValue) }} {{ row.unit || '' }}
              </template>
            </el-table-column>
            <el-table-column label="参考区间" min-width="160">
              <template #default="{ row }">
                {{ rangeText(row) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="section">
          <template #header>发布设置</template>
          <el-form label-width="96px" class="publish-form">
            <el-form-item label="发布名称">
              <el-input v-model="publishForm.name" placeholder="留空使用配方名" maxlength="60" />
            </el-form-item>
            <el-form-item label="审核备注" :required="publishRequiresReview">
              <el-input
                v-model="publishForm.reviewNote"
                type="textarea"
                :rows="3"
                :placeholder="publishRequiresReview ? '配方存在未达标项，请填写说明（如缺数据原因、补充计划）' : '可选'"
              />
            </el-form-item>
          </el-form>
          <div class="publish-actions">
            <el-button @click="$router.back()">返回编辑</el-button>
            <el-button
              type="primary"
              :loading="publishing"
              :disabled="!isAdmin"
              @click="confirmPublish"
            >
              {{ isAdmin ? '发布到食谱管理' : '仅管理员可发布' }}
            </el-button>
          </div>
        </el-card>
      </template>

      <el-empty v-else-if="!loading" description="未找到该草稿" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { DesignRecipeDraftDetail } from '@/types/recipeDesigner'
import { useUserStore } from '@/store/user'
import { buildPublishNutritionReport } from './publishReport'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const draftId = route.params.draftId as string
const loading = ref(false)
const publishing = ref(false)
const draft = ref<DesignRecipeDraftDetail | null>(null)
const assessment = ref<any>(null)

const publishForm = reactive<{ name: string; reviewNote: string }>({
  name: '',
  reviewNote: ''
})

const isAdmin = computed(() => userStore.userInfo?.role === 'ADMIN')

const overallStatus = computed(() => {
  const status =
    assessment.value?.overallStatus ||
    draft.value?.assessmentSummary?.overallStatus ||
    draft.value?.status
  return String(status || '').toUpperCase()
})

const overallStatusLabel = computed(() => {
  switch (overallStatus.value) {
    case 'COMPLIANT':
      return '完全达标'
    case 'NON_COMPLIANT':
      return '未达标'
    case 'INCOMPLETE':
      return '数据不完整'
    default:
      return overallStatus.value || '未知'
  }
})

const overallTagType = computed(() => {
  switch (overallStatus.value) {
    case 'COMPLIANT':
      return 'success'
    case 'NON_COMPLIANT':
      return 'danger'
    default:
      return 'warning'
  }
})

const publishRequiresReview = computed(() => {
  return Boolean(overallStatus.value && overallStatus.value !== 'COMPLIANT')
})

const issueEntries = computed(() => {
  const entries = Array.isArray(assessment.value?.groupedEntries)
    ? assessment.value.groupedEntries
    : Array.isArray(assessment.value?.entries)
      ? assessment.value.entries
      : []
  return entries.filter((entry: any) =>
    ['DEFICIENT', 'EXCESS', 'MISSING_DATA'].includes(String(entry?.status || '').toUpperCase())
  )
})

const report = computed(() =>
  buildPublishNutritionReport({
    draft: draft.value,
    assessment: assessment.value,
  })
)

const nutrientSectionList = computed(() => report.value.nutrientSections)

const totalWeight = computed(() => {
  const items = draft.value?.items ?? []
  return items.reduce((sum, item) => sum + Number(item.weightG ?? 0), 0)
})

function formatWeight(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} kg`
  return `${Math.round(value)} g`
}

function formatNumber(value: number): string {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'
}

function rangeText(row: any): string {
  const min = row.minValue
  const max = row.maxValue
  if (min != null && max != null) return `${min} - ${max}`
  if (min != null) return `≥ ${min}`
  if (max != null) return `≤ ${max}`
  return '—'
}

function statusTagType(status: string): 'success' | 'danger' | 'warning' {
  switch (String(status || '').toUpperCase()) {
    case 'EXCESS':
      return 'danger'
    case 'MISSING_DATA':
      return 'warning'
    default:
      return 'danger'
  }
}

function statusLabel(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'DEFICIENT':
      return '不足'
    case 'EXCESS':
      return '超标'
    case 'MISSING_DATA':
      return '缺数据'
    default:
      return String(status || '')
  }
}

async function load() {
  loading.value = true
  try {
    const [draftRes, assessRes] = await Promise.all([
      recipeDesignerApi.getDraft(draftId),
      recipeDesignerApi.assessDraft(draftId)
    ])
    draft.value = draftRes
    assessment.value = assessRes
  } catch {
    draft.value = null
    assessment.value = null
  } finally {
    loading.value = false
  }
}

async function confirmPublish() {
  if (!isAdmin.value) {
    ElMessage.warning('仅管理员可发布食谱')
    return
  }
  if (publishRequiresReview.value && !publishForm.reviewNote.trim()) {
    ElMessage.warning('配方存在未达标项，请填写审核备注')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将「${publishForm.name.trim() || draft.value?.name || ''}」发布到食谱管理？发布后将进入后台审核流程。`,
      '发布确认',
      {
        confirmButtonText: '确认发布',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  publishing.value = true
  try {
    const recipeName = publishForm.name.trim() || draft.value?.name || ''
    await recipeDesignerApi.publishDraft(draftId, {
      name: recipeName,
      ...(publishForm.reviewNote.trim() ? { reviewNote: publishForm.reviewNote.trim() } : {})
    })
    ElMessage.success('发布成功，已进入食谱管理审核')
    router.push('/recipes')
  } finally {
    publishing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.publish-page {
  padding: 20px;
}
.page-header {
  margin-bottom: 16px;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
}
.alert {
  margin-bottom: 16px;
}
.section {
  margin-bottom: 16px;
}
.assessment-overview {
  padding: 8px 0;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.summary-text {
  color: #606266;
  font-size: 13px;
}
.publish-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.muted {
  color: #909399;
}

/* 完整营养评估报告 */
.report-block {
  margin-bottom: 20px;
}
.report-block:last-child {
  margin-bottom: 0;
}
.report-block-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}
.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.report-table th,
.report-table td {
  border: 1px solid #ebeef5;
  padding: 6px 8px;
  text-align: left;
  vertical-align: middle;
}
.report-table th {
  background: #f5f7fa;
  color: #606266;
  font-weight: 600;
  white-space: nowrap;
}
.report-table td.col-number,
.report-table th.col-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.report-table td.col-unit,
.report-table th.col-unit {
  text-align: center;
  white-space: nowrap;
}
.report-table td.col-ingredient,
.report-table th.col-ingredient {
  min-width: 180px;
}
.report-table td.col-name,
.report-table th.col-name {
  min-width: 140px;
}
.report-table td.current-cell {
  color: #409eff;
  font-weight: 600;
}
.report-table tr.status-compliant td {
  color: #67c23a;
}
.report-table tr.status-deficient td {
  color: #f56c6c;
}
.report-table tr.status-excess td {
  color: #e6a23c;
}
.report-table tr.status-missing td {
  color: #909399;
}
.report-table tr.status-pending td {
  color: #909399;
}
.empty-cell {
  text-align: center;
  color: #909399;
}
.energy-density-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.energy-density-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.energy-density-label {
  color: #606266;
  width: 120px;
}
.energy-density-value {
  color: #303133;
  font-weight: 600;
}
</style>
