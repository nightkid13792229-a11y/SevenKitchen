<template>
  <div class="batch-panel">
    <div class="batch-header">
      <div>
        <div class="panel-title">批量 Agent 匹配</div>
        <div class="panel-subtitle">
          只生成候选建议、硬闸门和审批队列；营养档案仍需手动确认。
        </div>
      </div>
      <el-button :icon="Refresh" :loading="running" @click="$emit('refresh')">
        刷新任务
      </el-button>
    </div>

    <div class="batch-controls">
      <el-input-number
        v-model="form.limit"
        :min="1"
        :max="500"
        controls-position="right"
      />
      <el-checkbox v-model="form.forceRerun">
        覆盖已有 Agent 建议
      </el-checkbox>
      <el-button
        type="primary"
        :loading="starting"
        :disabled="running"
        @click="emitStart"
      >
        开始匹配
      </el-button>
    </div>

    <div v-if="latestJob" class="job-summary">
      <div class="job-status">
        <el-tag :type="statusTagType(latestJob.status)" effect="plain">
          {{ statusLabel(latestJob.status) }}
        </el-tag>
        <span>{{ latestJob.provider }} · {{ latestJob.model }}</span>
      </div>
      <el-progress
        :percentage="progressPercentage"
        :stroke-width="8"
        :show-text="false"
      />
      <div class="job-metrics">
        <span>总数 {{ latestJob.totalCount }}</span>
        <span>处理 {{ latestJob.processedCount }}</span>
        <span>成功 {{ latestJob.successCount }}</span>
        <span>跳过 {{ latestJob.skippedCount }}</span>
        <span>失败 {{ latestJob.failedCount }}</span>
      </div>
      <div v-if="latestJob.lastError" class="job-error">
        {{ latestJob.lastError }}
      </div>
    </div>

    <el-empty
      v-else
      :image-size="64"
      description="暂无批量 Agent 匹配任务"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { TagProps } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import type {
  BatchAgentReviewPayload,
  NutritionAgentReviewJob
} from '@/types/nutritionGovernance'

const props = defineProps<{
  latestJob: NutritionAgentReviewJob | null
  running?: boolean
  starting?: boolean
}>()

const emit = defineEmits<{
  (e: 'start', payload: BatchAgentReviewPayload): void
  (e: 'refresh'): void
}>()

const form = reactive({
  limit: 50,
  forceRerun: false
})

const progressPercentage = computed(() => {
  const job = props.latestJob
  if (!job?.totalCount) return 0
  return Math.min(100, Math.round((job.processedCount / job.totalCount) * 100))
})

function emitStart() {
  emit('start', {
    limit: form.limit,
    forceRerun: form.forceRerun
  })
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    RUNNING: '运行中',
    SUCCEEDED: '已完成',
    PARTIAL_FAILED: '部分失败',
    FAILED: '失败'
  }
  return labels[status] || status
}

function statusTagType(status: string): TagProps['type'] {
  const types: Record<string, TagProps['type']> = {
    RUNNING: 'warning',
    SUCCEEDED: 'success',
    PARTIAL_FAILED: 'warning',
    FAILED: 'danger'
  }
  return types[status] || 'info'
}
</script>

<style scoped>
.batch-panel {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
  padding: 14px;
}

.batch-header,
.batch-controls,
.job-status,
.job-metrics {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.batch-header {
  justify-content: space-between;
}

.panel-title {
  color: #303133;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.panel-subtitle,
.job-metrics,
.job-status {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.job-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-error {
  color: #f56c6c;
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 720px) {
  .batch-header,
  .batch-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .batch-controls :deep(.el-input-number),
  .batch-controls :deep(.el-button) {
    width: 100%;
  }
}
</style>
