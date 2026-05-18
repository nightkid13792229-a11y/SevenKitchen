<template>
  <el-card shadow="never" class="table-card">
    <el-table
      v-loading="loading"
      :data="ingredientRows"
      stripe
      style="width: 100%"
      empty-text="暂无待确认候选"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="44" />

      <el-table-column type="expand" width="48">
        <template #default="{ row }">
          <div class="candidate-detail-list">
            <el-table :data="row.candidates" size="small" border>
              <el-table-column label="候选食物" min-width="260">
                <template #default="{ row: candidate }">
                  <div class="primary-text">
                    {{ candidate.sourceRecord?.foodName || candidate.sourceRecord?.sourceTitle || '-' }}
                  </div>
                  <div class="secondary-text">
                    {{ candidate.sourceRecord?.sourceKey || '-' }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="置信度" width="80" align="center">
                <template #default="{ row: candidate }">
                  <el-tag :type="confidenceTagType(candidate.confidence)" size="small">
                    {{ confidenceLabel(candidate.confidence) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="分数" width="80" align="right">
                <template #default="{ row: candidate }">
                  {{ formatScore(candidate.score) }}
                </template>
              </el-table-column>
              <el-table-column label="队列" width="100">
                <template #default="{ row: candidate }">
                  <el-tag size="small" effect="plain">
                    {{ reviewGroupLabel(candidate.reviewGroup) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="营养状态" min-width="180">
                <template #default="{ row: candidate }">
                  {{ formatNutritionState(candidate) }}
                </template>
              </el-table-column>
            </el-table>
            <NutritionProfilePreview
              v-if="row.primaryCandidate?.normalizedNutrition"
              class="primary-preview"
              :profile="row.primaryCandidate.normalizedNutrition"
            />
          </div>
        </template>
      </el-table-column>

      <el-table-column label="后台原料" min-width="160">
        <template #default="{ row }">
          <div class="primary-text">{{ row.ingredient?.name || '-' }}</div>
          <div class="secondary-text">{{ row.ingredient?.id || row.ingredientId }}</div>
        </template>
      </el-table-column>

      <el-table-column label="候选数" width="86" align="center">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">
            {{ row.candidateCount }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="来源" width="130">
        <template #default="{ row }">
          <div class="source-stack">
            <el-tag
              v-for="source in row.sourceSummaries"
              :key="`${row.ingredientId}-${source}`"
              size="small"
              type="info"
            >
              {{ source }}
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="推荐候选" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="primary-text">
            {{ row.primaryCandidate?.sourceRecord?.foodName || row.primaryCandidate?.sourceRecord?.sourceTitle || '-' }}
          </div>
          <div class="secondary-text">
            <template v-if="row.candidateCount > 1">
              另 {{ row.candidateCount - 1 }} 个候选，点审批统一处理
            </template>
            <template v-else>
              {{ row.primaryCandidate?.sourceRecord?.foodNameEn || row.primaryCandidate?.sourceRecord?.category || '-' }}
            </template>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="置信度" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="confidenceTagType(row.confidence)" size="small">
            {{ confidenceLabel(row.confidence) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="分数" width="90" align="right">
        <template #default="{ row }">
          {{ formatScore(row.score) }}
        </template>
      </el-table-column>

      <el-table-column label="队列" width="120">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">
            {{ reviewGroupLabel(row.reviewGroup) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Agent建议" min-width="300">
        <template #default="{ row }">
          <div class="primary-text">{{ agentActionLabel(row.primaryCandidate?.agentReview?.recommendedAction) }}</div>
          <div class="secondary-text">
            {{ row.agentReviewedCount }}/{{ row.candidateCount }} 已生成建议
          </div>
          <div
            v-if="agentReviewDetailText(row.primaryCandidate)"
            class="secondary-text agent-rationale"
          >
            语义分析：{{ agentReviewDetailText(row.primaryCandidate) }}
          </div>
        </template>
      </el-table-column>

      <el-table-column label="营养状态" min-width="180">
        <template #default="{ row }">
          <div class="state-line">{{ formatNutritionState(row) }}</div>
        </template>
      </el-table-column>

      <el-table-column label="硬闸门" width="110" align="center">
        <template #default="{ row }">
          <el-tag
            :type="row.batchableCount > 0 ? 'success' : 'warning'"
            size="small"
          >
            {{ row.batchableCount }}/{{ row.candidateCount }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="原因" min-width="220">
        <template #default="{ row }">
          <div class="reason-list">
            <el-tag
              v-for="reason in row.matchReasons"
              :key="`${row.id}-${reason.code}-${reason.label}`"
              size="small"
              effect="plain"
            >
              {{ reason.label }}
            </el-tag>
            <span v-if="!row.matchReasons?.length" class="muted">-</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            link
            :disabled="!!busyId"
            :loading="busyId === row.id"
            @click="$emit('confirm', row.primaryCandidate)"
          >
            审批
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TagProps } from 'element-plus'
import NutritionProfilePreview from './NutritionProfilePreview.vue'
import type {
  IngredientNutritionCandidateListItem,
  NutritionCandidateReviewGroup,
  NutritionMatchConfidence
} from '@/types/nutritionGovernance'

const props = defineProps<{
  candidates: IngredientNutritionCandidateListItem[]
  loading: boolean
  busyId?: string
}>()

const emit = defineEmits<{
  (e: 'confirm', candidate: IngredientNutritionCandidateListItem): void
  (e: 'selection-change', candidates: IngredientNutritionCandidateListItem[]): void
}>()

interface IngredientCandidateRow {
  id: string
  ingredientId: string
  ingredient: IngredientNutritionCandidateListItem['ingredient']
  candidates: IngredientNutritionCandidateListItem[]
  primaryCandidate: IngredientNutritionCandidateListItem
  candidateCount: number
  sourceSummaries: string[]
  confidence: NutritionMatchConfidence
  score: number
  reviewGroup?: NutritionCandidateReviewGroup | string | null
  matchReasons: IngredientNutritionCandidateListItem['matchReasons']
  batchableCount: number
  agentReviewedCount: number
}

const ingredientRows = computed(() => buildIngredientRows(props.candidates))

function buildIngredientRows(
  candidates: IngredientNutritionCandidateListItem[]
): IngredientCandidateRow[] {
  const groups = new Map<string, IngredientNutritionCandidateListItem[]>()

  for (const candidate of candidates) {
    const key = candidate.ingredientId || candidate.ingredient?.id || candidate.id
    groups.set(key, [...(groups.get(key) || []), candidate])
  }

  return [...groups.entries()].flatMap(([ingredientId, groupCandidates]) => {
    const sortedCandidates = [...groupCandidates].sort(candidateSort)
    const primaryCandidate = sortedCandidates[0]
    if (!primaryCandidate) return []

    return {
      id: ingredientId,
      ingredientId,
      ingredient: primaryCandidate.ingredient,
      candidates: sortedCandidates,
      primaryCandidate,
      candidateCount: sortedCandidates.length,
      sourceSummaries: buildSourceSummaries(sortedCandidates),
      confidence: primaryCandidate.confidence,
      score: primaryCandidate.score,
      reviewGroup: resolveGroupReviewGroup(sortedCandidates),
      matchReasons: primaryCandidate.matchReasons || [],
      batchableCount: sortedCandidates.filter(
        (candidate) => candidate.hardGateResults?.canBatchConfirm
      ).length,
      agentReviewedCount: sortedCandidates.filter(
        (candidate) => candidate.agentReviewStatus === 'COMPLETED' || candidate.agentReview
      ).length
    }
  })
}

function candidateSort(
  left: IngredientNutritionCandidateListItem,
  right: IngredientNutritionCandidateListItem
): number {
  return candidateDisplayRank(right) - candidateDisplayRank(left)
}

function candidateDisplayRank(candidate: IngredientNutritionCandidateListItem): number {
  const foodName = (candidate.sourceRecord?.foodName || '').toLowerCase()
  let rank = typeof candidate.score === 'number' ? candidate.score : 0

  rank -= candidate.sourcePriority * 0.01
  if (candidate.hardGateResults?.canBatchConfirm) rank += 0.04
  if (candidate.agentReview?.recommendedAction === 'CONFIRM_PRIMARY') rank += 0.08
  if (candidate.agentReview?.recommendedAction === 'CONFIRM_SECONDARY') rank -= 0.04
  if (/with peel|unpeeled|skin on/.test(foodName)) rank += 0.08
  if (/peeled|skinless|boneless|uv exposed/.test(foodName)) rank -= 0.08
  if (/flowers|flower|blossom/.test(foodName)) rank -= 0.24

  return rank
}

function buildSourceSummaries(candidates: IngredientNutritionCandidateListItem[]): string[] {
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    const source = candidate.sourceRecord?.sourceType || 'UNKNOWN'
    counts.set(source, (counts.get(source) || 0) + 1)
  }

  return [...counts.entries()].map(([source, count]) => (
    count > 1 ? `${source} x${count}` : source
  ))
}

function resolveGroupReviewGroup(candidates: IngredientNutritionCandidateListItem[]) {
  const priority = ['NEEDS_REVIEW', 'NOT_RECOMMENDED', 'MISSING_SOURCE', 'AUTO_REVIEWABLE']
  return priority.find((group) => candidates.some((candidate) => candidate.reviewGroup === group)) ??
    candidates[0]?.reviewGroup ??
    null
}

function handleSelectionChange(rows: IngredientCandidateRow[]) {
  emit('selection-change', rows.flatMap((row) => row.candidates))
}

const confidenceLabels: Record<NutritionMatchConfidence, string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低'
}

function confidenceLabel(confidence: NutritionMatchConfidence): string {
  return confidenceLabels[confidence] || confidence
}

function confidenceTagType(confidence: NutritionMatchConfidence): TagProps['type'] {
  const tagTypes: Record<NutritionMatchConfidence, TagProps['type']> = {
    HIGH: 'success',
    MEDIUM: 'warning',
    LOW: 'info'
  }
  return tagTypes[confidence] || 'info'
}

function formatScore(score: number): string {
  return typeof score === 'number' ? score.toFixed(2) : '-'
}

function reviewGroupLabel(group?: NutritionCandidateReviewGroup | string | null): string {
  const labels: Record<string, string> = {
    AUTO_REVIEWABLE: '可批量',
    NEEDS_REVIEW: '需复核',
    NOT_RECOMMENDED: '不推荐',
    MISSING_SOURCE: '缺来源'
  }
  return group ? labels[group] || group : '未分组'
}

function agentActionLabel(action?: string | null): string {
  const labels: Record<string, string> = {
    CONFIRM_PRIMARY: '建议主档案',
    CONFIRM_SECONDARY: '建议次级',
    NEEDS_HUMAN_REVIEW: '人工复核',
    REJECT: '建议拒绝',
    FIND_ALTERNATIVE_SOURCE: '换来源'
  }
  return action ? labels[action] || action : '未审核'
}

function agentReviewDetailText(candidate?: IngredientNutritionCandidateListItem | null): string {
  if (!candidate?.agentReview) return ''

  return [
    candidate.agentReview.rationale,
    candidate.agentReview.riskFlags?.length
      ? `风险标记：${candidate.agentReview.riskFlags.join('、')}`
      : ''
  ].filter(Boolean).join('；')
}

function formatNutritionState(row: IngredientNutritionCandidateListItem | IngredientCandidateRow): string {
  const candidate = 'primaryCandidate' in row ? row.primaryCandidate : row
  return [
    candidate.preparationStateLabel,
    candidate.ediblePortionLabel,
    candidate.processingLabel
  ].filter(Boolean).join(' / ') || '-'
}
</script>

<style scoped>
.table-card :deep(.el-card__body) {
  padding: 0;
}

.primary-text {
  color: #303133;
  font-weight: 500;
  line-height: 20px;
}

.secondary-text {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.agent-rationale {
  margin-top: 4px;
  color: #606266;
  overflow-wrap: anywhere;
  white-space: normal;
}

.source-key {
  margin-top: 2px;
  overflow-wrap: anywhere;
}

.source-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.candidate-detail-list {
  display: grid;
  gap: 12px;
  padding: 8px 12px 12px;
}

.primary-preview {
  max-width: 100%;
}

.reason-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.state-line {
  color: #606266;
  line-height: 20px;
}

.muted {
  color: #909399;
}
</style>
