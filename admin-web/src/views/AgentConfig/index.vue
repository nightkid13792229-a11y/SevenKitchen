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
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import {
  AGENT_DEFAULT_PURPOSE,
  AGENT_PURPOSES,
  agentPurposeLabel
} from '@/constants/agentPurposes'
import AgentSettingsDrawer from './components/AgentSettingsDrawer.vue'
import type { AgentProviderSettings, UpdateAgentProviderSettingsPayload } from '@/types/nutritionGovernance'

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

const purposeRows = computed(() =>
  AGENT_PURPOSES.map((meta) => rows.value[meta.purpose]!).filter(Boolean)
)

async function loadAll() {
  loading.value = true
  try {
    const defaultSettings = await nutritionGovernanceApi.getAgentSettings(AGENT_DEFAULT_PURPOSE)
    const map: Record<string, PurposeRow> = {}
    for (const meta of AGENT_PURPOSES) {
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

onMounted(loadAll)
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
</style>
