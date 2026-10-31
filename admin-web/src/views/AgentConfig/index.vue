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

      <el-table :data="purposeRows" size="default" :loading="loading" row-key="purpose" default-expand-all>
        <el-table-column label="用途" min-width="200">
          <template #default="{ row }">
            <div class="purpose-name">{{ row.label }}</div>
            <div class="purpose-desc">{{ row.description }}</div>
          </template>
        </el-table-column>

        <el-table-column label="配置状态" width="180">
          <template #default="{ row }">
            <el-tag
              :type="row.composite ? 'info' : row.isDefault ? 'info' : row.configured ? 'success' : 'warning'"
              effect="plain"
            >
              {{ row.composite
                ? '含 2 套配置'
                : row.isDefault ? '全局默认' : row.configured ? '已独立配置' : '使用默认' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="模型" width="180">
          <template #default="{ row }">
            {{ row.composite ? '—' : row.settings?.model || row.defaultModel }}
          </template>
        </el-table-column>

        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <span v-if="row.composite" class="muted">—</span>
            <el-tag v-else-if="row.isDefault" :type="row.settings?.enabled ? 'success' : 'info'" effect="plain">
              {{ row.settings?.enabled ? '启用' : '停用' }}
            </el-tag>
            <span v-else :class="{ 'muted': !row.settings?.enabled }">
              {{ row.settings?.enabled ? '启用' : '使用默认' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.composite"
              size="small"
              text
              type="primary"
              @click="openConfig(row)"
            >
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
      AI 食谱封面（2026-10-28）：DeepSeek 写提示词、Seedream 5.0 Pro 生图。
      与上面的 DeepSeek 文本配置、智谱旧配置都是独立的 Key/用途。
      真正生成在「发布 / 更新 → 封面图」和「上线检查 → 订单展示」。
    -->
    <el-card shadow="never" class="section">
      <template #header>
        <div class="card-header">
          <span>AI 食谱封面</span>
          <el-tag :type="recipeCoverStatus.type" effect="plain">
            {{ recipeCoverStatus.label }}
          </el-tag>
        </div>
      </template>

      <p class="zhipu-hint">
        DeepSeek 负责把配方食材写成摄影提示词，火山方舟 Seedream 5.0 Pro 负责生图。
        两个模型都启用、保存 Key，且系统提示词非空时，两个页面的 AI 生成按钮才可用。
        生成一张约 0.2 元。
      </p>

      <div class="recipe-cover-status">
        <span>DeepSeek：{{ recipeCoverConfig?.deepseek.configured ? '已配置' : '未配置' }}</span>
        <span>Seedream：{{ recipeCoverConfig?.ark.configured ? '已配置' : '未配置' }}</span>
        <span>提示词：{{ recipeCoverConfig?.promptTemplate ? '已配置' : '使用默认' }}</span>
      </div>

      <el-button type="primary" @click="recipeCoverDrawerVisible = true">
        配置
      </el-button>
    </el-card>

    <RecipeCoverConfigDrawer
      v-model="recipeCoverDrawerVisible"
      @saved="loadRecipeCoverConfig"
    />

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
import RecipeCoverConfigDrawer from './RecipeCoverConfigDrawer.vue'
import {
  buildZhipuImageSettingsPayload,
  resolveZhipuImageStatus,
  validateZhipuImageForm,
  type ZhipuImageForm
} from '@/utils/agentConfig/zhipuImage'
import type {
  AgentProviderSettings,
  RecipeCoverConfig,
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
  /** 组合行（AI 食谱设计）：自身无配置，下面挂产品线与定制订单两套 */
  composite?: boolean
  children?: PurposeRow[]
}

const loading = ref(false)
const rows = ref<Record<string, PurposeRow>>({})

const recipeCoverDrawerVisible = ref(false)
const recipeCoverConfig = ref<RecipeCoverConfig | null>(null)
const recipeCoverStatus = computed(() => ({
  label: recipeCoverConfig.value?.ready ? '可用' : '未就绪',
  type: recipeCoverConfig.value?.ready ? 'success' : 'info'
}))

async function loadRecipeCoverConfig() {
  try {
    recipeCoverConfig.value = await nutritionGovernanceApi.getRecipeCoverConfig()
  } catch {
    recipeCoverConfig.value = null
  }
}

const drawerVisible = ref(false)
const drawerPurpose = ref('')
const drawerPurposeLabel = ref('')
const drawerSettings = ref<AgentProviderSettings | null>(null)
const drawerLoading = ref(false)
const drawerSaving = ref(false)
const drawerTesting = ref(false)

/** AI 食谱设计：一个入口，下挂产品线与定制订单两套配置 */
const RECIPE_DESIGN_FLOWS = [
  {
    purpose: 'RECIPE_DESIGN_CATALOG',
    label: '产品线',
    description: '橱窗食谱：不绑订单、不绑顾客狗狗'
  },
  {
    purpose: 'RECIPE_DESIGN_ORDER',
    label: '定制订单',
    description: '定制订单：绑订单与狗狗档案'
  }
] as const

/** 生图用途走下面的「智谱封面图」卡片；DeepSeek 列表里不再出现，避免点错配置抽屉 */
const purposeRows = computed(() =>
  AGENT_PURPOSES.filter((meta) => meta.purpose !== 'RECIPE_COVER_IMAGE')
    .map((meta) => {
      const row = rows.value[meta.purpose]
      if (!row) return null
      if (meta.purpose === 'RECIPE_DESIGN') {
        return {
          ...row,
          children: RECIPE_DESIGN_FLOWS.map(
            (flow) => rows.value[flow.purpose]
          ).filter(Boolean)
        } as PurposeRow
      }
      return row
    })
    .filter((row): row is PurposeRow => Boolean(row))
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
    // 并发取：原来是一次一条串行请求，11 个用途排队，页面要卡好几秒
    const purposes = Array.from(
      new Set([
        AGENT_DEFAULT_PURPOSE,
        ...AGENT_PURPOSES.map((meta) => meta.purpose),
        ...RECIPE_DESIGN_FLOWS.map((flow) => flow.purpose)
      ])
    )
    const loaded = await Promise.all(
      purposes.map(async (purpose) => {
        try {
          return [purpose, await nutritionGovernanceApi.getAgentSettings(purpose)] as const
        } catch {
          return [purpose, null] as const
        }
      })
    )
    const settingsMap = new Map(loaded)

    const map: Record<string, PurposeRow> = {}
    for (const meta of AGENT_PURPOSES) {
      const isComposite = meta.purpose === 'RECIPE_DESIGN'
      map[meta.purpose] = {
        purpose: meta.purpose,
        label: meta.label,
        description: meta.description,
        defaultModel: meta.defaultModel,
        isDefault: meta.purpose === AGENT_DEFAULT_PURPOSE,
        composite: isComposite,
        configured: isComposite
          ? RECIPE_DESIGN_FLOWS.every((flow) => Boolean(settingsMap.get(flow.purpose)))
          : meta.purpose === AGENT_DEFAULT_PURPOSE ||
            Boolean(settingsMap.get(meta.purpose)),
        settings: settingsMap.get(meta.purpose) ?? null
      }
    }
    for (const flow of RECIPE_DESIGN_FLOWS) {
      map[flow.purpose] = {
        purpose: flow.purpose,
        label: flow.label,
        description: flow.description,
        defaultModel: 'deepseek-flash',
        isDefault: false,
        configured: Boolean(settingsMap.get(flow.purpose)),
        settings: settingsMap.get(flow.purpose) ?? null
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
  void loadRecipeCoverConfig()
  void loadAll()
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
.recipe-cover-status {
  display: flex;
  gap: 20px;
  margin: 0 0 14px;
  color: #606266;
  font-size: 13px;
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
