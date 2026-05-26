<template>
  <div class="agent-config-page">
    <div class="page-header">
      <h2>Agent 配置</h2>
    </div>

    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span>补剂识别 Agent</span>
          <el-tag :type="form.enabled ? 'success' : 'info'" effect="plain">
            {{ form.enabled ? '已启用' : '已关闭' }}
          </el-tag>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="180px"
        v-loading="loading"
      >
        <el-form-item label="启用" prop="enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-form-item label="Provider" prop="provider">
          <el-select v-model="form.provider" disabled style="width: 360px">
            <el-option label="OpenAI-compatible" value="OPENAI_COMPATIBLE" />
          </el-select>
        </el-form-item>

        <el-form-item label="Base URL" prop="baseUrl">
          <el-input
            v-model.trim="form.baseUrl"
            placeholder="https://api.openai.com/v1"
            clearable
            style="width: 520px"
          />
        </el-form-item>

        <el-form-item label="API Key" prop="apiKey">
          <div class="api-key-row">
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              placeholder="留空则保存时不覆盖现有密钥"
              clearable
              style="width: 360px"
            />
            <el-tag :type="apiKeyStatus.type" effect="plain">
              {{ apiKeyStatus.text }}
            </el-tag>
          </div>
          <div class="form-tip">空着保存不会覆盖现有密钥；输入新密钥后保存才会更新。</div>
        </el-form-item>

        <el-form-item label="Vision Model" prop="visionModel">
          <el-input v-model.trim="form.visionModel" clearable style="width: 360px" />
        </el-form-item>

        <el-form-item label="Text Model" prop="textModel">
          <el-input v-model.trim="form.textModel" clearable style="width: 360px" />
        </el-form-item>

        <el-form-item label="Temperature" prop="temperature">
          <el-input-number
            v-model="form.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            :precision="2"
            style="width: 180px"
          />
        </el-form-item>

        <el-form-item label="Timeout (ms)" prop="timeoutMs">
          <el-input-number
            v-model="form.timeoutMs"
            :min="1000"
            :step="1000"
            :precision="0"
            style="width: 180px"
          />
        </el-form-item>

        <el-form-item label="Max Retries" prop="maxRetries">
          <el-input-number
            v-model="form.maxRetries"
            :min="0"
            :max="10"
            :step="1"
            :precision="0"
            style="width: 180px"
          />
        </el-form-item>

        <el-form-item label="Prompt Version" prop="promptVersion">
          <el-input v-model.trim="form.promptVersion" clearable style="width: 360px" />
        </el-form-item>

        <el-form-item label="Schema Version" prop="schemaVersion">
          <el-input v-model.trim="form.schemaVersion" clearable style="width: 360px" />
        </el-form-item>

        <el-form-item label="最近测试">
          <div class="status-panel">
            <el-tag :type="lastTestTagType" effect="plain">
              {{ form.lastTestStatus || '未测试' }}
            </el-tag>
            <span class="status-message">{{ form.lastTestMessage || '暂无测试结果' }}</span>
          </div>
        </el-form-item>

        <el-form-item label="更新时间">
          <span class="meta-text">{{ formattedUpdatedAt }}</span>
          <span v-if="form.updatedBy" class="form-tip">更新人：{{ form.updatedBy }}</span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">
            保存配置
          </el-button>
          <el-button :loading="testing" @click="handleTest">
            测试连接
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  agentConfigApi,
  type SupplementImportAgentConfig,
  type UpdateSupplementImportAgentConfig
} from '@/api/agentConfig'

type AgentConfigForm = UpdateSupplementImportAgentConfig & {
  id: string
  apiKey: string
  apiKeyConfigured: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

const defaultForm = (): AgentConfigForm => ({
  id: '',
  enabled: false,
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: '',
  apiKey: '',
  apiKeyConfigured: false,
  visionModel: 'gpt-4.1-mini',
  textModel: 'gpt-4.1-mini',
  temperature: 0.1,
  timeoutMs: 30000,
  maxRetries: 1,
  promptVersion: 'supplement-import-v1',
  schemaVersion: 'supplement-import-schema-v1',
  lastTestStatus: null,
  lastTestMessage: null,
  updatedBy: null,
  createdAt: '',
  updatedAt: ''
})

const formRef = ref<FormInstance>()
const form = ref<AgentConfigForm>(defaultForm())
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)

const rules: FormRules<AgentConfigForm> = {
  provider: [{ required: true, message: '请选择 Provider', trigger: 'change' }],
  visionModel: [{ required: true, message: '请输入 Vision Model', trigger: 'blur' }],
  textModel: [{ required: true, message: '请输入 Text Model', trigger: 'blur' }],
  temperature: [{ required: true, type: 'number', min: 0, max: 2, message: '范围 0-2', trigger: 'blur' }],
  timeoutMs: [{ required: true, type: 'number', min: 1000, message: '不能小于 1000ms', trigger: 'blur' }],
  maxRetries: [{ required: true, type: 'number', min: 0, max: 10, message: '范围 0-10', trigger: 'blur' }],
  promptVersion: [{ required: true, message: '请输入 Prompt Version', trigger: 'blur' }],
  schemaVersion: [{ required: true, message: '请输入 Schema Version', trigger: 'blur' }]
}

const apiKeyStatus = computed(() => {
  if (form.value.apiKey.trim()) {
    return { type: 'warning' as const, text: '将更新密钥' }
  }

  if (form.value.apiKeyConfigured) {
    return { type: 'success' as const, text: '已配置密钥' }
  }

  return { type: 'info' as const, text: '未配置密钥' }
})

const lastTestTagType = computed(() => {
  const status = form.value.lastTestStatus?.toLowerCase()
  if (!status) return 'info'
  if (['success', 'succeeded', 'pass', 'passed', 'ok'].includes(status)) return 'success'
  if (['failed', 'failure', 'error'].includes(status)) return 'danger'
  return 'warning'
})

const formattedUpdatedAt = computed(() => {
  if (!form.value.updatedAt) return '尚未保存'
  const date = new Date(form.value.updatedAt)
  if (Number.isNaN(date.getTime())) return form.value.updatedAt
  return date.toLocaleString()
})

const applyConfig = (config: SupplementImportAgentConfig) => {
  form.value = {
    ...defaultForm(),
    ...config,
    baseUrl: config.baseUrl ?? '',
    visionModel: config.visionModel ?? '',
    textModel: config.textModel ?? '',
    apiKey: ''
  }
}

const buildPayload = (): UpdateSupplementImportAgentConfig => {
  const payload: UpdateSupplementImportAgentConfig = {
    enabled: form.value.enabled,
    provider: form.value.provider,
    baseUrl: form.value.baseUrl?.trim() || null,
    visionModel: form.value.visionModel?.trim(),
    textModel: form.value.textModel?.trim(),
    temperature: form.value.temperature,
    timeoutMs: form.value.timeoutMs,
    maxRetries: form.value.maxRetries,
    promptVersion: form.value.promptVersion,
    schemaVersion: form.value.schemaVersion
  }

  const apiKey = form.value.apiKey.trim()
  if (apiKey) {
    payload.apiKey = apiKey
  }

  return payload
}

const loadConfig = async () => {
  loading.value = true
  try {
    const data = await agentConfigApi.getSupplementImport()
    applyConfig(data)
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    saving.value = true
    try {
      const data = await agentConfigApi.updateSupplementImport(buildPayload())
      applyConfig(data)
      ElMessage.success('Agent 配置保存成功')
    } catch (error) {
      console.error(error)
    } finally {
      saving.value = false
    }
  })
}

const handleTest = async () => {
  testing.value = true
  try {
    const result = await agentConfigApi.testSupplementImport()
    form.value.lastTestStatus = result.ok ? 'SUCCESS' : 'FAILED'
    form.value.lastTestMessage = result.message
    ElMessage[result.ok ? 'success' : 'warning'](result.message || '测试连接完成')
    await loadConfig()
  } catch (error) {
    console.error(error)
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.agent-config-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.config-card {
  max-width: 900px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.api-key-row,
.status-panel {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-message {
  color: #606266;
}

.meta-text {
  color: #606266;
}

.form-tip {
  margin-left: 12px;
  font-size: 13px;
  color: #909399;
}
</style>
