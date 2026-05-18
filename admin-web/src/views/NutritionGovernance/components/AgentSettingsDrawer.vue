<template>
  <el-drawer
    v-model="visible"
    title="DeepSeek Agent 设置"
    size="560px"
    destroy-on-close
  >
    <div v-loading="loading" class="settings-panel">
      <div class="settings-status">
        <div>
          <div class="status-title">DeepSeek</div>
          <div class="status-text">
            {{ settings?.enabled ? '已启用' : '未启用' }} · {{ apiKeyStatus }}
          </div>
        </div>
        <el-tag :type="settings?.enabled ? 'success' : 'info'" effect="plain">
          {{ settings?.enabled ? '启用' : '停用' }}
        </el-tag>
      </div>

      <el-form label-width="118px" class="settings-form">
        <el-form-item label="启用 Agent">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-form-item label="Base URL">
          <el-input
            v-model="form.baseUrl"
            placeholder="https://api.deepseek.com"
          />
        </el-form-item>

        <el-form-item label="默认模型">
          <el-input
            v-model="form.model"
            placeholder="deepseek-v4-flash"
          />
          <div class="form-tip">
            用于批量搜索词生成和普通候选排序，建议 Flash。
          </div>
        </el-form-item>

        <el-form-item label="复核模型">
          <el-input
            v-model="form.reviewModel"
            placeholder="deepseek-v4-pro"
          />
          <div class="form-tip">
            用于营养校验、复杂来源和人工升级复核，建议 Pro。
          </div>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="留空则保留现有密钥"
          />
          <div class="form-tip">
            后端只保存加密密钥；页面不会回显完整 API Key。
          </div>
        </el-form-item>

        <el-form-item label="最大并发">
          <el-input-number
            v-model="form.maxConcurrency"
            :min="1"
            :max="5"
            controls-position="right"
          />
        </el-form-item>

        <el-form-item label="超时毫秒">
          <el-input-number
            v-model="form.requestTimeoutMs"
            :min="5000"
            :max="300000"
            :step="5000"
            controls-position="right"
          />
        </el-form-item>

        <el-form-item label="重试次数">
          <el-input-number
            v-model="form.retryCount"
            :min="0"
            :max="5"
            controls-position="right"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="drawer-actions">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          :disabled="!settings?.apiKeyConfigured"
          :loading="saving"
          @click="emitClearKey"
        >
          清除密钥
        </el-button>
        <el-button
          :loading="testing"
          :disabled="saving"
          @click="emitTest"
        >
          测试连接
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="loading || testing"
          @click="emitSave"
        >
          保存设置
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type {
  AgentProviderSettings,
  UpdateAgentProviderSettingsPayload
} from '@/types/nutritionGovernance'

const props = defineProps<{
  modelValue: boolean
  settings: AgentProviderSettings | null
  loading?: boolean
  saving?: boolean
  testing?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: UpdateAgentProviderSettingsPayload): void
  (e: 'test', payload: UpdateAgentProviderSettingsPayload): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const form = reactive({
  enabled: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  reviewModel: 'deepseek-v4-pro',
  apiKey: '',
  maxConcurrency: 1,
  requestTimeoutMs: 90000,
  retryCount: 2
})

const apiKeyStatus = computed(() => {
  if (!props.settings?.apiKeyConfigured) {
    return 'API Key 未配置'
  }

  return props.settings.apiKeyLast4
    ? `API Key 已配置，尾号 ${props.settings.apiKeyLast4}`
    : 'API Key 已配置'
})

watch(
  () => props.settings,
  (settings) => {
    form.enabled = settings?.enabled ?? false
    form.baseUrl = settings?.baseUrl ?? 'https://api.deepseek.com'
    form.model = settings?.model ?? 'deepseek-v4-flash'
    form.reviewModel = settings?.reviewModel ?? 'deepseek-v4-pro'
    form.apiKey = ''
    form.maxConcurrency = settings?.maxConcurrency ?? 1
    form.requestTimeoutMs = settings?.requestTimeoutMs ?? 90000
    form.retryCount = settings?.retryCount ?? 2
  },
  { immediate: true }
)

function buildPayload(): UpdateAgentProviderSettingsPayload {
  const payload: UpdateAgentProviderSettingsPayload = {
    enabled: form.enabled,
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    reviewModel: form.reviewModel.trim(),
    maxConcurrency: form.maxConcurrency,
    requestTimeoutMs: form.requestTimeoutMs,
    retryCount: form.retryCount
  }

  const apiKey = form.apiKey.trim()
  if (apiKey) {
    payload.apiKey = apiKey
  }

  return payload
}

function emitSave() {
  emit('save', buildPayload())
}

function emitTest() {
  emit('test', buildPayload())
}

function emitClearKey() {
  form.apiKey = ''
  emit('save', {
    ...buildPayload(),
    enabled: false,
    clearApiKey: true
  })
}
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.settings-status {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 14px 16px;
}

.status-title {
  color: #303133;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.status-text,
.form-tip {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.settings-form :deep(.el-input-number) {
  width: 180px;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .settings-status {
    align-items: flex-start;
    flex-direction: column;
  }

  .drawer-actions :deep(.el-button) {
    flex: 1 1 120px;
  }
}
</style>
