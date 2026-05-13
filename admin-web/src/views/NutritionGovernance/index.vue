<template>
  <div class="nutrition-governance-page">
    <div class="page-header">
      <div>
        <h2>原料营养治理</h2>
        <div class="page-subtitle">候选匹配、补剂标签识别与营养档案确认</div>
      </div>
      <div class="header-actions">
        <el-button :icon="Setting" @click="openAgentSettings">
          Agent 设置
        </el-button>
        <el-button :icon="Refresh" :loading="refreshing" @click="refreshAll">
          刷新
        </el-button>
      </div>
    </div>

    <OverviewCards :overview="overview" />

    <el-tabs v-model="activeTab" class="governance-tabs">
      <el-tab-pane label="食材匹配" name="food">
        <div class="toolbar">
          <el-select
            v-model="confidenceFilter"
            placeholder="置信度"
            clearable
            style="width: 120px"
            @change="loadCandidates"
          >
            <el-option label="高" value="HIGH" />
            <el-option label="中" value="MEDIUM" />
            <el-option label="低" value="LOW" />
          </el-select>

          <el-select
            v-model="reviewGroupFilter"
            placeholder="审批队列"
            clearable
            style="width: 140px"
            @change="loadCandidates"
          >
            <el-option label="可批量" value="AUTO_REVIEWABLE" />
            <el-option label="需复核" value="NEEDS_REVIEW" />
            <el-option label="不推荐" value="NOT_RECOMMENDED" />
            <el-option label="缺来源" value="MISSING_SOURCE" />
          </el-select>

          <el-select
            v-model="selectedFoodIngredientId"
            filterable
            clearable
            placeholder="选择食材生成候选"
            style="width: 240px"
          >
            <el-option
              v-for="ingredient in foodIngredients"
              :key="ingredient.id"
              :label="ingredient.name"
              :value="ingredient.id"
            />
          </el-select>

          <el-button
            type="primary"
            :disabled="!selectedFoodIngredientId"
            :loading="generating"
            @click="handleGenerateCandidates"
          >
            生成候选
          </el-button>

          <el-input
            v-model="fdcId"
            clearable
            placeholder="USDA FDC ID"
            class="fdc-input"
          />
          <el-button
            :disabled="!fdcId.trim()"
            :loading="importing"
            @click="handleImportUsda"
          >
            导入 USDA
          </el-button>

          <el-button
            type="success"
            :disabled="!selectedCandidates.length || !!candidateBusyId"
            :loading="batchConfirming"
            @click="handleBatchConfirm"
          >
            批量确认
          </el-button>
        </div>

        <AgentBatchReviewPanel
          :latest-job="latestAgentJob"
          :running="agentJobLoading"
          :starting="batchAgentReviewing"
          @start="handleStartBatchAgentReview"
          @refresh="loadLatestAgentJob"
        />

        <FoodCandidatesTable
          :candidates="candidates"
          :loading="candidatesLoading"
          :busy-id="candidateBusyId"
          @confirm="handleConfirmCandidate"
          @review-agent="handleRunAgentReview"
          @reject="handleRejectCandidate"
          @selection-change="handleCandidateSelectionChange"
        />

        <CandidateReviewDrawer
          v-model="candidateDrawerVisible"
          :candidate="selectedCandidate"
          :busy="!!candidateBusyId"
          @review-agent="handleRunAgentReview"
          @confirm-primary="handleConfirmCandidateFromDrawer"
          @confirm-secondary="handleConfirmCandidateFromDrawer"
          @reject="handleRejectCandidateFromDrawer"
        />
      </el-tab-pane>

      <el-tab-pane label="补剂识别" name="supplement">
        <div class="toolbar">
          <el-select
            v-model="selectedSupplementIngredientId"
            filterable
            clearable
            placeholder="选择补剂原料"
            style="width: 240px"
          >
            <el-option
              v-for="ingredient in supplementIngredients"
              :key="ingredient.id"
              :label="ingredient.name"
              :value="ingredient.id"
            />
          </el-select>

          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            :on-change="handleSupplementFileChange"
          >
            <el-button
              type="primary"
              :disabled="!selectedSupplementIngredientId"
              :loading="uploading"
            >
              上传标签
            </el-button>
          </el-upload>
        </div>

        <SupplementDraftsTable
          :drafts="supplementDrafts"
          :loading="draftsLoading"
          :busy-id="draftBusyId"
          @confirm="handleConfirmSupplementDraft"
          @reject="handleRejectSupplementDraft"
        />
      </el-tab-pane>
    </el-tabs>

    <AgentSettingsDrawer
      v-model="agentSettingsVisible"
      :settings="agentSettings"
      :loading="agentSettingsLoading"
      :saving="agentSettingsSaving"
      :testing="agentSettingsTesting"
      @save="handleSaveAgentSettings"
      @test="handleTestAgentSettings"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { UploadFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Setting } from '@element-plus/icons-vue'
import { ingredientApi } from '@/api/ingredients'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import { IngredientType, type Ingredient } from '@/types/ingredient'
import type {
  AgentProviderSettings,
  BatchAgentReviewPayload,
  ConfirmNutritionCandidatePayload,
  IngredientNutritionCandidateListItem,
  NutritionAgentReviewJob,
  NutritionCandidateReviewGroup,
  NutritionGovernanceOverview,
  NutritionMatchConfidence,
  SupplementNutritionDraft,
  UpdateAgentProviderSettingsPayload
} from '@/types/nutritionGovernance'
import OverviewCards from './components/OverviewCards.vue'
import FoodCandidatesTable from './components/FoodCandidatesTable.vue'
import CandidateReviewDrawer from './components/CandidateReviewDrawer.vue'
import SupplementDraftsTable from './components/SupplementDraftsTable.vue'
import AgentBatchReviewPanel from './components/AgentBatchReviewPanel.vue'
import AgentSettingsDrawer from './components/AgentSettingsDrawer.vue'

const overview = ref<NutritionGovernanceOverview | null>(null)
const candidates = ref<IngredientNutritionCandidateListItem[]>([])
const ingredients = ref<Ingredient[]>([])
const supplementDrafts = ref<SupplementNutritionDraft[]>([])
const agentSettings = ref<AgentProviderSettings | null>(null)
const latestAgentJob = ref<NutritionAgentReviewJob | null>(null)

const activeTab = ref<'food' | 'supplement'>('food')
const confidenceFilter = ref<NutritionMatchConfidence | ''>('')
const reviewGroupFilter = ref<NutritionCandidateReviewGroup | ''>('')
const selectedFoodIngredientId = ref('')
const selectedSupplementIngredientId = ref('')
const fdcId = ref('')
const selectedCandidates = ref<IngredientNutritionCandidateListItem[]>([])
const selectedCandidate = ref<IngredientNutritionCandidateListItem | null>(null)
const candidateDrawerVisible = ref(false)
const agentSettingsVisible = ref(false)

const refreshing = ref(false)
const overviewLoading = ref(false)
const candidatesLoading = ref(false)
const ingredientsLoading = ref(false)
const generating = ref(false)
const importing = ref(false)
const uploading = ref(false)
const candidateBusyId = ref('')
const batchConfirming = ref(false)
const draftsLoading = ref(false)
const draftBusyId = ref('')
const agentSettingsLoading = ref(false)
const agentSettingsSaving = ref(false)
const agentSettingsTesting = ref(false)
const agentJobLoading = ref(false)
const batchAgentReviewing = ref(false)

const foodIngredients = computed(() => (
  ingredients.value.filter((ingredient) => ingredient.type === IngredientType.FOOD)
))

const supplementIngredients = computed(() => (
  ingredients.value.filter((ingredient) => ingredient.type === IngredientType.SUPPLEMENT)
))

onMounted(() => {
  refreshAll()
})

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([
      loadOverview(),
      loadCandidates(),
      loadIngredients(),
      loadSupplementDrafts(),
      loadLatestAgentJob()
    ])
  } finally {
    refreshing.value = false
  }
}

async function loadOverview() {
  overviewLoading.value = true
  try {
    overview.value = await nutritionGovernanceApi.getOverview()
  } catch (error) {
    ElMessage.error('营养治理概览加载失败')
  } finally {
    overviewLoading.value = false
  }
}

async function loadCandidates() {
  candidatesLoading.value = true
  try {
    candidates.value = await nutritionGovernanceApi.listCandidates({
      status: 'CANDIDATE',
      confidence: confidenceFilter.value || undefined,
      reviewGroup: reviewGroupFilter.value || undefined
    })
  } catch (error) {
    ElMessage.error('候选列表加载失败')
  } finally {
    candidatesLoading.value = false
  }
}

async function loadIngredients() {
  ingredientsLoading.value = true
  try {
    ingredients.value = await ingredientApi.list()
  } catch (error) {
    ElMessage.error('原料列表加载失败')
  } finally {
    ingredientsLoading.value = false
  }
}

async function loadSupplementDrafts() {
  draftsLoading.value = true
  try {
    supplementDrafts.value = await nutritionGovernanceApi.listSupplementDrafts({
      status: 'DRAFT'
    })
  } catch (error) {
    ElMessage.error('补剂草稿加载失败')
  } finally {
    draftsLoading.value = false
  }
}

async function loadAgentSettings() {
  agentSettingsLoading.value = true
  try {
    agentSettings.value = await nutritionGovernanceApi.getAgentSettings()
  } catch (error) {
    ElMessage.error('Agent 设置加载失败')
  } finally {
    agentSettingsLoading.value = false
  }
}

async function openAgentSettings() {
  agentSettingsVisible.value = true
  await loadAgentSettings()
}

async function handleSaveAgentSettings(payload: UpdateAgentProviderSettingsPayload) {
  agentSettingsSaving.value = true
  try {
    agentSettings.value = await nutritionGovernanceApi.updateAgentSettings(payload)
    ElMessage.success('Agent 设置已保存')
  } catch (error) {
    ElMessage.error('Agent 设置保存失败')
  } finally {
    agentSettingsSaving.value = false
  }
}

async function handleTestAgentSettings() {
  agentSettingsTesting.value = true
  try {
    const result = await nutritionGovernanceApi.testAgentSettings()
    ElMessage.success(
      result.recommendedAction
        ? `DeepSeek 连接正常：${result.recommendedAction}`
        : 'DeepSeek 连接正常'
    )
  } catch (error) {
    ElMessage.error('DeepSeek 连接测试失败')
  } finally {
    agentSettingsTesting.value = false
  }
}

async function loadLatestAgentJob() {
  agentJobLoading.value = true
  try {
    latestAgentJob.value = await nutritionGovernanceApi.getLatestAgentReviewJob()
  } catch (error) {
    ElMessage.error('Agent 任务加载失败')
  } finally {
    agentJobLoading.value = false
  }
}

async function handleStartBatchAgentReview(payload: BatchAgentReviewPayload) {
  batchAgentReviewing.value = true
  try {
    await ElMessageBox.confirm(
      '批量 Agent 匹配只会写入候选建议和审批队列，不会自动确认营养档案。确认开始吗？',
      '开始批量 Agent 匹配',
      {
        type: 'warning',
        confirmButtonText: '开始匹配',
        cancelButtonText: '取消'
      }
    )
  } catch {
    batchAgentReviewing.value = false
    return
  }

  try {
    const job = await nutritionGovernanceApi.startBatchAgentReview({
      ...payload,
      confidence: confidenceFilter.value || undefined,
      reviewGroup: reviewGroupFilter.value || undefined
    })
    latestAgentJob.value = job
    ElMessage.success(
      `批量 Agent 匹配完成：成功 ${job.successCount} 条，失败 ${job.failedCount} 条`
    )
    await Promise.all([loadOverview(), loadCandidates(), loadLatestAgentJob()])
  } catch (error) {
    ElMessage.error('批量 Agent 匹配失败')
  } finally {
    batchAgentReviewing.value = false
  }
}

async function handleGenerateCandidates() {
  if (!selectedFoodIngredientId.value) return

  generating.value = true
  try {
    const generated = await nutritionGovernanceApi.generateFoodCandidates(selectedFoodIngredientId.value)
    ElMessage.success(`已生成 ${generated.length} 条候选`)
    await Promise.all([loadOverview(), loadCandidates()])
  } catch (error) {
    ElMessage.error('候选生成失败')
  } finally {
    generating.value = false
  }
}

async function handleImportUsda() {
  const nextFdcId = fdcId.value.trim()
  if (!nextFdcId) return

  importing.value = true
  try {
    await nutritionGovernanceApi.importUsdaSource(
      nextFdcId,
      selectedFoodIngredientId.value || undefined
    )
    ElMessage.success(
      selectedFoodIngredientId.value
        ? 'USDA 来源已导入，并已生成候选'
        : 'USDA 来源已导入'
    )
    fdcId.value = ''
    await Promise.all([loadOverview(), loadCandidates()])
  } catch (error) {
    ElMessage.error('USDA 来源导入失败')
  } finally {
    importing.value = false
  }
}

async function handleConfirmCandidate(candidate: IngredientNutritionCandidateListItem) {
  handleOpenCandidate(candidate)
}

function handleOpenCandidate(candidate: IngredientNutritionCandidateListItem) {
  selectedCandidate.value = candidate
  candidateDrawerVisible.value = true
}

function handleCandidateSelectionChange(selection: IngredientNutritionCandidateListItem[]) {
  selectedCandidates.value = selection
}

async function handleRunAgentReview(candidate: IngredientNutritionCandidateListItem | null) {
  if (!candidate || candidateBusyId.value) return

  candidateBusyId.value = candidate.id
  try {
    const reviewed = await nutritionGovernanceApi.reviewCandidateWithAgent(candidate.id)
    ElMessage.success('Agent 审核已完成')
    await loadCandidates()
    if (selectedCandidate.value?.id === candidate.id) {
      selectedCandidate.value = {
        ...selectedCandidate.value,
        ...reviewed
      } as IngredientNutritionCandidateListItem
    }
  } catch (error) {
    ElMessage.error('Agent 审核失败')
  } finally {
    candidateBusyId.value = ''
  }
}

async function handleConfirmCandidateFromDrawer(payload: ConfirmNutritionCandidatePayload) {
  const candidate = selectedCandidate.value
  if (!candidate || candidateBusyId.value) return

  candidateBusyId.value = candidate.id
  try {
    await ElMessageBox.confirm(
      `确认将「${candidate.sourceRecord?.foodName || '候选食物'}」写入「${candidate.ingredient?.name || '原料'}」的营养档案吗？`,
      '确认营养档案',
      {
        type: 'warning',
        confirmButtonText: '确认写入',
        cancelButtonText: '取消'
      }
    )
  } catch {
    candidateBusyId.value = ''
    return
  }

  try {
    await nutritionGovernanceApi.confirmCandidate(candidate.id, payload)
    ElMessage.success('候选已确认')
    candidateDrawerVisible.value = false
    selectedCandidate.value = null
    await Promise.all([loadOverview(), loadCandidates()])
  } catch (error) {
    ElMessage.error('候选确认失败')
  } finally {
    candidateBusyId.value = ''
  }
}

async function handleBatchConfirm() {
  const candidateIds = selectedCandidates.value
    .filter((candidate) => candidate.hardGateResults?.canBatchConfirm)
    .map((candidate) => candidate.id)

  if (!candidateIds.length) {
    ElMessage.warning('请选择已通过硬闸门的候选')
    return
  }

  batchConfirming.value = true
  try {
    await ElMessageBox.confirm(
      `确认批量写入 ${candidateIds.length} 条可批量候选吗？`,
      '批量确认营养档案',
      {
        type: 'warning',
        confirmButtonText: '确认写入',
        cancelButtonText: '取消'
      }
    )
  } catch {
    batchConfirming.value = false
    return
  }

  try {
    await nutritionGovernanceApi.batchConfirmCandidates(candidateIds)
    ElMessage.success('批量确认成功')
    selectedCandidates.value = []
    await Promise.all([loadOverview(), loadCandidates()])
  } catch (error) {
    ElMessage.error('批量确认失败')
  } finally {
    batchConfirming.value = false
  }
}

async function handleRejectCandidateFromDrawer(candidate: IngredientNutritionCandidateListItem | null) {
  if (!candidate) return
  await handleRejectCandidate(candidate)
  candidateDrawerVisible.value = false
}

async function handleRejectCandidate(candidate: IngredientNutritionCandidateListItem) {
  if (candidateBusyId.value) return

  candidateBusyId.value = candidate.id
  try {
    await ElMessageBox.confirm(
      `确认拒绝「${candidate.sourceRecord?.foodName || '候选食物'}」吗？拒绝后该候选会从待确认流程中移除。`,
      '拒绝候选',
      {
        type: 'warning',
        confirmButtonText: '确认拒绝',
        cancelButtonText: '取消'
      }
    )
  } catch {
    candidateBusyId.value = ''
    return
  }

  try {
    await nutritionGovernanceApi.rejectCandidate(candidate.id)
    ElMessage.success('候选已拒绝')
    await Promise.all([loadOverview(), loadCandidates()])
  } catch (error) {
    ElMessage.error('候选拒绝失败')
  } finally {
    candidateBusyId.value = ''
  }
}

async function handleSupplementFileChange(uploadFile: UploadFile) {
  if (!selectedSupplementIngredientId.value || !uploadFile.raw) return

  uploading.value = true
  try {
    await nutritionGovernanceApi.uploadSupplementLabel(
      selectedSupplementIngredientId.value,
      uploadFile.raw
    )
    ElMessage.success('补剂标签已上传')
    await Promise.all([loadOverview(), loadSupplementDrafts()])
  } catch (error) {
    ElMessage.error('补剂标签上传失败')
  } finally {
    uploading.value = false
  }
}

async function handleConfirmSupplementDraft(draft: SupplementNutritionDraft) {
  if (draftBusyId.value) return

  if (!draft.normalizedNutrition) {
    ElMessage.warning('该草稿暂无可确认的标准化营养数据')
    return
  }

  draftBusyId.value = draft.id
  try {
    await ElMessageBox.confirm(
      `确认将补剂标签草稿写入「${draft.ingredient?.name || draft.ingredientId}」的营养档案吗？`,
      '确认补剂草稿',
      {
        type: 'warning',
        confirmButtonText: '确认写入',
        cancelButtonText: '取消'
      }
    )
  } catch {
    draftBusyId.value = ''
    return
  }

  try {
    await nutritionGovernanceApi.confirmSupplementDraft(draft.id)
    ElMessage.success('补剂草稿已确认')
    await Promise.all([loadOverview(), loadSupplementDrafts()])
  } catch (error) {
    ElMessage.error('补剂草稿确认失败')
  } finally {
    draftBusyId.value = ''
  }
}

async function handleRejectSupplementDraft(draft: SupplementNutritionDraft) {
  if (draftBusyId.value) return

  draftBusyId.value = draft.id
  try {
    await ElMessageBox.confirm(
      `确认拒绝「${draft.ingredient?.name || draft.ingredientId}」的补剂标签草稿吗？`,
      '拒绝补剂草稿',
      {
        type: 'warning',
        confirmButtonText: '确认拒绝',
        cancelButtonText: '取消'
      }
    )
  } catch {
    draftBusyId.value = ''
    return
  }

  try {
    await nutritionGovernanceApi.rejectSupplementDraft(draft.id)
    ElMessage.success('补剂草稿已拒绝')
    await Promise.all([loadOverview(), loadSupplementDrafts()])
  } catch (error) {
    ElMessage.error('补剂草稿拒绝失败')
  } finally {
    draftBusyId.value = ''
  }
}
</script>

<style scoped>
.nutrition-governance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.page-header h2 {
  margin: 0;
  color: #303133;
  font-size: 20px;
  line-height: 28px;
}

.page-subtitle {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
  line-height: 20px;
}

.governance-tabs {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 0 16px 16px;
}

.governance-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.fdc-input {
  width: 160px;
}

@media (max-width: 720px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions,
  .toolbar {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .header-actions :deep(.el-button),
  .toolbar :deep(.el-select),
  .toolbar :deep(.el-input),
  .toolbar :deep(.el-button),
  .fdc-input {
    width: 100% !important;
  }
}
</style>
