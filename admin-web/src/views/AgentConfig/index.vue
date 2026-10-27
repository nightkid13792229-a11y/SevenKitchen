<template>
  <div class="agent-config-page">
    <div class="page-header">
      <div>
        <h2>AI / Agent 配置</h2>
        <p class="subtitle">全局默认配置 + 各业务用途可独立配置；未单独配置的用途自动使用默认</p>
      </div>
    </div>

    <el-card shadow="never" class="section">
      <template #header>
        <div class="card-header">
          <span>用途列表</span>
        </div>
      </template>

      <el-table :data="purposeRows" size="default" :loading="loading" row-key="purpose">
        <el-table-column label="用途" min-width="200">
          <template #default="{ row }">
            <div class="purpose-name">{{ row.label }}</div>
            <div class="purpose-desc">{{ row.description }}</div>
          </template>
        </el-table-column>

        <el-table-column label="配置状态" width="180">
          <template #default="{ row }">
            <el-tag
              :type="row.isDefault ? 'info' : row.configured ? 'success' : 'warning'"
              effect="plain"
            >
              {{ row.isDefault ? '全局默认' : row.configured ? '已独立配置' : '使用默认' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="模型" width="180">
          <template #default="{ row }">
            {{ row.settings?.model || row.defaultModel }}
          </template>
        </el-table-column>

        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.isDefault" :type="row.settings?.enabled ? 'success' : 'info'" effect="plain">
              {{ row.settings?.enabled ? '启用' : '停用' }}
            </el-tag>
            <span v-else :class="{ 'muted': !row.settings?.enabled }">
              {{ row.settings?.enabled ? '启用' : '使用默认' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openConfig(row)">
              配置
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="tip-block">
        💡 各业务用途默认使用「全局默认」配置。如果某个用途需要不同的模型或密钥，点击「配置」单独设置即可。
      </div>
    </el-card>

    <!--
      智谱封面图（2026-10-27）：
      与上面的 DeepSeek 文本配置是两套 Key/模型，必须单独一行（provider=ZHIPU）。
      这里只让运营填 Key / 启用；真正出图在「发布 / 更新 → 封面图」。
    -->
    <el-card shadow="never" class="section">
      <template #header>
        <div class="card-header">
          <span>智谱封面图（食谱封面图生成）</span>
          <el-tag :type="zhipuStatus.type" effect="plain">
            {{ zhipuStatus.label }}
          </el-tag>
        </div>
      </template>

      <p class="zhipu-hint">
        用于「发布 / 更新 → 封面图 → AI 生成图片」和旧「编辑食谱」页的 AI 封面。
        生成一张约 0.1 元；连接测试只验证 Key，不生成图片、不花钱。
        Key 在
        <a
          href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys"
          target="_blank"
          rel="noopener"
        >bigmodel.cn → API Keys</a>
        创建。Base URL 填 https://open.bigmodel.cn 即可（系统会自动补 /api）；
        保存并启用后，重新打开「发布 / 更新」抽屉即可看到按钮变亮。
      </p>

      <el-form label-width="120px" class="zhipu-form">
        <el-form-item label="启用">
          <el-switch v-model="zhipuForm.enabled" />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input
            v-model="zhipuForm.baseUrl"
            placeholder="https://open.bigmodel.cn"
          />
        </el-form-item>
        <el-form-item label="模型">
          <el-input v-model="zhipuForm.model" placeholder="glm-image" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="zhipuForm.apiKey"
            type="password"
            show-password
            autocomplete="off"
            :placeholder="zhipuKeyPlaceholder"
          />
          <div v-if="zhipuSettings?.apiKeyConfigured" class="zhipu-key-actions">
            <el-button
              link
              type="danger"
              :loading="zhipuSaving"
              @click="clearZhipuKey"
            >
              清除已保存的 Key
            </el-button>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="zhipuSaving"
            @click="saveZhipuSettings"
          >
            保存
          </el-button>
          <el-button
            :loading="zhipuTesting"
            :disabled="!zhipuSettings?.apiKeyConfigured"
            @click="testZhipuSettings"
          >
            连接测试
          </el-button>
          <span class="zhipu-note">先保存，再测试；测试不会生成图片。</span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 配置抽屉（可复用，按用途传参） -->
    <AgentSettingsDrawer
      v-model="drawerVisible"
      :settings="drawerSettings"
      :loading="drawerLoading"
      :saving="drawerSaving"
      :testing="drawerTesting"
      :purpose="drawerPurpose"
      :purpose-label="drawerPurposeLabel"
      @save="handleSave"
      @test="handleTest"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import {
  AGENT_DEFAULT_PURPOSE,
  AGENT_PURPOSES,
  agentPurposeLabel
} from '@/constants/agentPurposes'
import AgentSettingsDrawer from './components/AgentSettingsDrawer.vue'
import {
  buildZhipuImageSettingsPayload,
  resolveZhipuImageStatus,
  validateZhipuImageForm,
  type ZhipuImageForm
} from '@/utils/agentConfig/zhipuImage'
import type {
  AgentProviderSettings,
  UpdateAgentProviderSettingsPayload,
  ZhipuImageSettings
} from '@/types/nutritionGovernance'

interface PurposeRow {
  purpose: string
  label: string
  description: string
  defaultModel: string
  isDefault: boolean
  configured: boolean
  settings: AgentProviderSettings | null
}

const loading = ref(false)
const rows = ref<Record<string, PurposeRow>>({})

const drawerVisible = ref(false)
const drawerPurpose = ref('')
const drawerPurposeLabel = ref('')
const drawerSettings = ref<AgentProviderSettings | null>(null)
const drawerLoading = ref(false)
const drawerSaving = ref(false)
const drawerTesting = ref(false)

/** 生图用途走下面的「智谱封面图」卡片；DeepSeek 列表里不再出现，避免点错配置抽屉 */
const purposeRows = computed(() =>
  AGENT_PURPOSES.filter((meta) => meta.purpose !== 'RECIPE_COVER_IMAGE')
    .map((meta) => rows.value[meta.purpose]!)
    .filter(Boolean)
)

const zhipuSettings = ref<ZhipuImageSettings | null>(null)
const zhipuForm = reactive<ZhipuImageForm>({
  enabled: false,
  baseUrl: 'https://open.bigmodel.cn',
  model: 'glm-image',
  apiKey: ''
})
const zhipuSaving = ref(false)
const zhipuTesting = ref(false)

const zhipuStatus = computed(() => resolveZhipuImageStatus(zhipuSettings.value))
const zhipuKeyPlaceholder = computed(() =>
  zhipuSettings.value?.apiKeyConfigured
    ? `已配置（末四位 ${zhipuSettings.value.apiKeyLast4 ?? '****'}），留空不修改`
    : '粘贴智谱开放平台（bigmodel.cn）的 API Key'
)

/** 服务器永远只回末四位；输入框每次都用空串，绝不回填明文 */
function applyZhipuForm(settings: ZhipuImageSettings | null) {
  zhipuForm.enabled = Boolean(settings?.enabled)
  zhipuForm.baseUrl = settings?.baseUrl || 'https://open.bigmodel.cn'
  zhipuForm.model = settings?.model || 'glm-image'
  zhipuForm.apiKey = ''
}

async function loadZhipuSettings() {
  try {
    const settings = await nutritionGovernanceApi.getZhipuImageSettings()
    zhipuSettings.value = settings
    applyZhipuForm(settings)
  } catch {
    // 拦截器已提示
  }
}

async function saveZhipuSettings() {
  const invalid = validateZhipuImageForm(zhipuForm, zhipuSettings.value)
  if (invalid) {
    ElMessage.warning(invalid)
    return
  }

  zhipuSaving.value = true
  try {
    const saved = await nutritionGovernanceApi.updateZhipuImageSettings(
      buildZhipuImageSettingsPayload(zhipuForm)
    )
    zhipuSettings.value = saved
    applyZhipuForm(saved)
    ElMessage.success('智谱封面图配置已保存')
  } catch {
    // 拦截器已提示
  } finally {
    zhipuSaving.value = false
  }
}

async function testZhipuSettings() {
  zhipuTesting.value = true
  try {
    const result = await nutritionGovernanceApi.testZhipuImageSettings()
    ElMessage.success(result?.message || '智谱 Key 有效')
  } catch {
    // 拦截器已提示
  } finally {
    zhipuTesting.value = false
  }
}

async function clearZhipuKey() {
  try {
    await ElMessageBox.confirm(
      '清除后，AI 封面会暂时用不了，直到重新填写 Key。确定清除？',
      '清除智谱 API Key',
      {
        type: 'warning',
        confirmButtonText: '清除',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  zhipuSaving.value = true
  try {
    const saved = await nutritionGovernanceApi.updateZhipuImageSettings({
      enabled: false,
      clearApiKey: true
    })
    zhipuSettings.value = saved
    applyZhipuForm(saved)
    ElMessage.success('已清除智谱 API Key')
  } catch {
    // 拦截器已提示
  } finally {
    zhipuSaving.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    const defaultSettings = await nutritionGovernanceApi.getAgentSettings(AGENT_DEFAULT_PURPOSE)
    const map: Record<string, PurposeRow> = {}
    for (const meta of AGENT_PURPOSES) {
      if (meta.purpose === 'RECIPE_COVER_IMAGE') continue
      let settings: AgentProviderSettings | null = null
      try {
        settings = await nutritionGovernanceApi.getAgentSettings(meta.purpose)
      } catch {
        settings = null
      }
      map[meta.purpose] = {
        purpose: meta.purpose,
        label: meta.label,
        description: meta.description,
        defaultModel: meta.defaultModel,
        isDefault: meta.purpose === AGENT_DEFAULT_PURPOSE,
        configured: meta.purpose === AGENT_DEFAULT_PURPOSE || Boolean(settings),
        settings: meta.purpose === AGENT_DEFAULT_PURPOSE ? defaultSettings : settings
      }
    }
    rows.value = map
  } catch {
    ElMessage.error('加载 Agent 配置失败')
  } finally {
    loading.value = false
  }
}

async function openConfig(row: PurposeRow) {
  drawerPurpose.value = row.purpose
  drawerPurposeLabel.value = row.label
  drawerSettings.value = row.settings
  drawerVisible.value = true
}

async function handleSave(payload: UpdateAgentProviderSettingsPayload) {
  drawerSaving.value = true
  try {
    const saved = await nutritionGovernanceApi.updateAgentSettings(payload, drawerPurpose.value)
    drawerSettings.value = saved
    drawerVisible.value = false
    ElMessage.success('已保存')
    await loadAll()
  } catch {
    // 拦截器已提示
  } finally {
    drawerSaving.value = false
  }
}

async function handleTest(payload: UpdateAgentProviderSettingsPayload) {
  drawerTesting.value = true
  try {
    await nutritionGovernanceApi.testAgentSettings(drawerPurpose.value)
    ElMessage.success('连接测试通过')
  } catch {
    ElMessage.error('连接测试失败')
  } finally {
    drawerTesting.value = false
  }
}

onMounted(() => {
  void loadAll()
  void loadZhipuSettings()
})
</script>

<style scoped>
.agent-config-page {
  padding: 20px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.purpose-name {
  font-weight: 600;
  color: #303133;
}
.purpose-desc {
  color: #909399;
  font-size: 12px;
  margin-top: 2px;
}
.muted {
  color: #909399;
}
.tip-block {
  margin-top: 14px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  color: #606266;
  font-size: 12.5px;
  line-height: 1.5;
}
.zhipu-hint {
  margin: 0 0 14px;
  color: #606266;
  font-size: 12.5px;
  line-height: 1.6;
}
.zhipu-form {
  max-width: 720px;
}
.zhipu-form .el-input {
  max-width: 420px;
}
.zhipu-key-actions {
  margin-top: 4px;
}
.zhipu-note {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
</style>
