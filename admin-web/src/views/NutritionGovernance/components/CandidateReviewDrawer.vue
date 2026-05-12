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
          :title="candidate.hardGateResults?.canBatchConfirm ? '可批量确认' : '需要人工复核'"
        />
        <div class="tag-list">
          <el-tag
            v-for="reason in candidate.hardGateResults?.blockingReasons || []"
            :key="reason"
            size="small"
            type="danger"
            effect="plain"
          >
            {{ reason }}
          </el-tag>
          <el-tag
            v-for="reason in candidate.hardGateResults?.warningReasons || []"
            :key="reason"
            size="small"
            type="warning"
            effect="plain"
          >
            {{ reason }}
          </el-tag>
        </div>
      </section>

      <section class="review-section">
        <h3>确认信息</h3>
        <el-form label-width="110px">
          <el-form-item label="营养状态">
            <el-input v-model="form.preparationStateLabel" placeholder="如：生重、熟重、干重" />
          </el-form-item>
          <el-form-item label="状态代码">
            <el-input v-model="form.preparationState" placeholder="如：RAW、COOKED、DRIED" />
          </el-form-item>
          <el-form-item label="可食部/规格">
            <el-input v-model="form.ediblePortionLabel" placeholder="如：去皮去骨、带皮、沥干" />
          </el-form-item>
          <el-form-item label="加工标记">
            <el-input v-model="form.processingLabel" placeholder="如：强化、无盐、紫外线照射" />
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
  preparationStateLabel: '',
  ediblePortionLabel: '',
  processingLabel: '',
  reviewNote: ''
})

watch(
  () => props.candidate,
  (candidate) => {
    form.preparationState = candidate?.preparationState || candidate?.agentReview?.preparationState || ''
    form.preparationStateLabel = candidate?.preparationStateLabel || candidate?.agentReview?.preparationStateLabel || ''
    form.ediblePortionLabel = candidate?.ediblePortionLabel || candidate?.agentReview?.ediblePortionLabel || ''
    form.processingLabel = candidate?.processingLabel || candidate?.agentReview?.processingLabel || ''
    form.reviewNote = candidate?.reviewNote || ''
  },
  { immediate: true }
)

function emitConfirm(mappingRole: 'PRIMARY' | 'SECONDARY') {
  const payload: ConfirmNutritionCandidatePayload = {
    mappingRole,
    preparationState: form.preparationState || null,
    preparationStateLabel: form.preparationStateLabel || null,
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
