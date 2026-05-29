<template>
  <el-drawer
    v-model="visible"
    title="候选营养档案审批"
    size="720px"
    destroy-on-close
  >
    <template v-if="candidate">
      <section class="review-section">
        <h3>原料与来源</h3>
        <div class="info-grid">
          <span>后台原料</span>
          <strong>{{ candidate.ingredient?.name || '-' }}</strong>
          <span>候选食物</span>
          <strong>{{ candidate.sourceRecord?.foodName || candidate.sourceRecord?.sourceTitle || '-' }}</strong>
          <span>来源编号</span>
          <strong>{{ candidate.sourceRecord?.sourceKey || '-' }}</strong>
        </div>
      </section>

      <section class="review-section">
        <h3>Agent建议</h3>
        <div class="agent-box">
          <div class="agent-summary">
            <el-tag size="small">{{ candidate.agentReview?.recommendedAction || '未审核' }}</el-tag>
            <el-tag size="small" type="info">{{ candidate.agentReview?.confidence || '-' }}</el-tag>
          </div>
          <p>{{ candidate.agentReview?.rationale || '尚未生成 Agent 审核建议。' }}</p>
          <div class="tag-list">
            <el-tag
              v-for="flag in candidate.agentReview?.riskFlags || []"
              :key="flag"
              size="small"
              type="warning"
              effect="plain"
            >
              {{ flag }}
            </el-tag>
          </div>
        </div>
      </section>

      <section class="review-section">
        <h3>硬闸门</h3>
        <el-alert
          :type="candidate.hardGateResults?.canBatchConfirm ? 'success' : 'warning'"
          :closable="false"
          :title="candidate.hardGateResults?.canBatchConfirm ? '可批量确认为主档案' : '需要人工复核'"
        />
        <div class="tag-list">
          <el-tag
            v-for="reason in candidate.hardGateResults?.blockingReasons || []"
            :key="reason"
            size="small"
            type="danger"
            effect="plain"
          >
            {{ hardGateReasonLabel(reason) }}
          </el-tag>
          <el-tag
            v-for="reason in candidate.hardGateResults?.warningReasons || []"
            :key="reason"
            size="small"
            type="warning"
            effect="plain"
          >
            {{ hardGateReasonLabel(reason) }}
          </el-tag>
        </div>
      </section>

      <section class="review-section">
        <h3>确认信息</h3>
        <el-form label-width="110px">
          <el-form-item label="营养状态">
            <el-select
              v-model="form.preparationState"
              clearable
              filterable
              placeholder="选择营养状态"
            >
              <el-option
                v-for="option in NUTRITION_PREPARATION_STATE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态代码">
            <el-input :model-value="form.preparationState || '-'" disabled />
          </el-form-item>
          <el-form-item label="可食部/规格">
            <el-select
              v-model="form.ediblePortionLabel"
              clearable
              filterable
              placeholder="选择可食部/规格"
            >
              <el-option
                v-for="option in NUTRITION_EDIBLE_PORTION_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.label"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="加工标记">
            <el-select
              v-model="form.processingLabel"
              clearable
              filterable
              placeholder="选择加工标记"
            >
              <el-option
                v-for="option in NUTRITION_PROCESSING_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.label"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="审核备注">
            <el-input
              v-model="form.reviewNote"
              type="textarea"
              :rows="3"
              placeholder="可记录人工判断依据"
            />
          </el-form-item>
        </el-form>
      </section>

      <section class="review-section">
        <h3>营养预览</h3>
        <NutritionProfilePreview :profile="candidate.normalizedNutrition" />
      </section>
    </template>

    <template #footer>
      <div class="drawer-actions">
        <el-button @click="visible = false">取消</el-button>
        <el-button :loading="busy" @click="$emit('review-agent', candidate)">
          运行 Agent 审核
        </el-button>
        <el-button :loading="busy" type="danger" plain @click="$emit('reject', candidate)">
          拒绝
        </el-button>
        <el-button :loading="busy" @click="emitConfirm('SECONDARY')">
          确认为次级档案
        </el-button>
        <el-button :loading="busy" type="primary" @click="emitConfirm('PRIMARY')">
          确认为主档案
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import NutritionProfilePreview from './NutritionProfilePreview.vue'
import {
  NUTRITION_EDIBLE_PORTION_OPTIONS,
  NUTRITION_PREPARATION_STATE_OPTIONS,
  NUTRITION_PROCESSING_OPTIONS,
  resolveReviewOptionLabel,
  resolveReviewOptionValue
} from '../nutritionReviewTaxonomy'
import type {
  ConfirmNutritionCandidatePayload,
  IngredientNutritionCandidateListItem
} from '@/types/nutritionGovernance'

const props = defineProps<{
  modelValue: boolean
  candidate: IngredientNutritionCandidateListItem | null
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'review-agent', candidate: IngredientNutritionCandidateListItem | null): void
  (e: 'confirm-primary', payload: ConfirmNutritionCandidatePayload): void
  (e: 'confirm-secondary', payload: ConfirmNutritionCandidatePayload): void
  (e: 'reject', candidate: IngredientNutritionCandidateListItem | null): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const form = reactive({
  preparationState: '',
  ediblePortionLabel: '',
  processingLabel: '',
  reviewNote: ''
})

const selectedPreparationStateLabel = computed(() =>
  resolveReviewOptionLabel(NUTRITION_PREPARATION_STATE_OPTIONS, form.preparationState)
)

watch(
  () => props.candidate,
  (candidate) => {
    form.preparationState = resolveReviewOptionValue(
      NUTRITION_PREPARATION_STATE_OPTIONS,
      candidate?.preparationState || candidate?.agentReview?.preparationState,
      candidate?.preparationStateLabel || candidate?.agentReview?.preparationStateLabel
    )
    form.ediblePortionLabel = resolveReviewOptionLabel(
      NUTRITION_EDIBLE_PORTION_OPTIONS,
      candidate?.ediblePortionLabel || candidate?.agentReview?.ediblePortionLabel
    )
    form.processingLabel = resolveReviewOptionLabel(
      NUTRITION_PROCESSING_OPTIONS,
      candidate?.processingLabel || candidate?.agentReview?.processingLabel
    )
    form.reviewNote = candidate?.reviewNote || ''
  },
  { immediate: true }
)

function emitConfirm(mappingRole: 'PRIMARY' | 'SECONDARY') {
  const payload: ConfirmNutritionCandidatePayload = {
    mappingRole,
    preparationState: form.preparationState || null,
    preparationStateLabel: selectedPreparationStateLabel.value || null,
    ediblePortionLabel: form.ediblePortionLabel || null,
    processingLabel: form.processingLabel || null,
    reviewNote: form.reviewNote || null
  }

  if (mappingRole === 'PRIMARY') {
    emit('confirm-primary', payload)
    return
  }

  emit('confirm-secondary', payload)
}

function hardGateReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    MISSING_SOURCE_RECORD: '缺少来源记录',
    MISSING_NORMALIZED_NUTRITION: '缺少标准化营养数据',
    MISSING_CRITICAL_NUTRIENTS: '缺少核心营养字段',
    MISSING_RAW_BASIS: '缺少每 100g/每份等基准',
    MISSING_AGENT_REVIEW: '尚未运行 Agent 审核',
    LOW_AGENT_CONFIDENCE: 'Agent 置信度低',
    AGENT_RECOMMENDS_REJECT: 'Agent 建议拒绝',
    AGENT_RECOMMENDS_ALTERNATIVE: 'Agent 建议寻找其他来源',
    AGENT_NEEDS_HUMAN_REVIEW: 'Agent 要求人工复核',
    AGENT_RECOMMENDS_SECONDARY: 'Agent 建议作为次级档案',
    AGENT_RECOMMENDATION_UNSUPPORTED: 'Agent 建议类型暂不支持批量确认',
    AGENT_REVIEW_FAILED: 'Agent 审核失败'
  }

  return labels[reason] || reason
}
</script>

<style scoped>
.review-section {
  margin-bottom: 18px;
}

.review-section h3 {
  margin: 0 0 10px;
  color: #303133;
  font-size: 15px;
  line-height: 22px;
}

.info-grid {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px 12px;
  color: #606266;
  font-size: 13px;
}

.info-grid strong {
  color: #303133;
  overflow-wrap: anywhere;
}

.agent-box {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
}

.agent-summary,
.tag-list,
.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-box p {
  margin: 8px 0;
  color: #606266;
  line-height: 20px;
}

.drawer-actions {
  justify-content: flex-end;
}
</style>
