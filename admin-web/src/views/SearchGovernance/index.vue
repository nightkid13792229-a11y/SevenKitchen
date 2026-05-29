<template>
  <div class="search-governance-page">
    <div class="page-header">
      <div>
        <h2>搜索治理</h2>
        <div class="page-subtitle">别名词库、查询洞察与 Agent 建议审批</div>
      </div>
      <div class="header-actions">
        <el-select
          v-model="selectedDomain"
          clearable
          placeholder="全部应用范围"
          style="width: 180px"
          @change="handleDomainChange"
        >
          <el-option
            v-for="domain in domainOptions"
            :key="domain.value"
            :label="domain.label"
            :value="domain.value"
          />
        </el-select>
        <el-button :icon="Refresh" :loading="refreshing" @click="loadAll">
          刷新
        </el-button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-panel">
        <span>活跃别名组</span>
        <strong>{{ overview?.activeAliasGroupCount ?? aliasGroups.length }}</strong>
      </div>
      <div class="metric-panel">
        <span>待处理建议</span>
        <strong>{{ overview?.pendingSuggestionCount ?? pendingSuggestionCount }}</strong>
      </div>
      <div class="metric-panel">
        <span>近期零结果查询</span>
        <strong>{{ overview?.recentNoResultQueries?.length ?? 0 }}</strong>
      </div>
      <div class="metric-panel">
        <span>当前洞察窗口</span>
        <strong>{{ insightDays }} 天</strong>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="governance-tabs">
      <el-tab-pane label="搜索概览" name="overview">
        <div class="section-toolbar">
          <span class="section-title">全局概览</span>
          <el-tag type="info">不受应用范围筛选影响</el-tag>
        </div>
        <el-table
          v-loading="overviewLoading"
          :data="overview?.recentNoResultQueries ?? []"
          border
          height="360"
        >
          <el-table-column prop="rawQuery" label="搜索词" min-width="160" />
          <el-table-column prop="normalizedQuery" label="归一化词" min-width="160" />
          <el-table-column label="范围" width="130">
            <template #default="{ row }">
              {{ formatDomain(row.domain) }}
            </template>
          </el-table-column>
          <el-table-column prop="source" label="来源" width="130" />
          <el-table-column prop="createdAt" label="时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="词库管理" name="aliases">
        <div class="section-toolbar">
          <div class="inline-controls">
            <el-select
              v-model="aliasStatus"
              clearable
              placeholder="全部状态"
              style="width: 130px"
              @change="loadAliasGroups"
            >
              <el-option label="启用" value="ACTIVE" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
          </div>
          <el-button type="primary" :icon="Plus" @click="openCreateAliasGroup">
            新增别名组
          </el-button>
        </div>

        <el-table v-loading="aliasLoading" :data="aliasGroups" border height="520">
          <el-table-column prop="canonicalTerm" label="标准词" min-width="160" fixed="left" />
          <el-table-column label="应用范围" width="130">
            <template #default="{ row }">
              {{ formatDomain(row.domain) }}
            </template>
          </el-table-column>
          <el-table-column label="别名" min-width="260">
            <template #default="{ row }">
              <el-tag
                v-for="alias in row.aliases"
                :key="alias"
                class="alias-tag"
                type="info"
              >
                {{ alias }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="风险" width="100">
            <template #default="{ row }">
              <el-tag :type="riskTagType(row.riskLevel)">
                {{ formatRisk(row.riskLevel) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">
                {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEditAliasGroup(row)">
                编辑
              </el-button>
              <el-button
                link
                type="danger"
                :disabled="row.status === 'DISABLED'"
                @click="handleDisableAliasGroup(row)"
              >
                停用
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="搜索洞察" name="insights">
        <div class="section-toolbar">
          <div class="inline-controls">
            <el-input-number
              v-model="insightDays"
              :min="1"
              :max="90"
              controls-position="right"
              style="width: 140px"
            />
            <el-button :icon="SearchIcon" :loading="insightLoading" @click="loadQueryInsights">
              查询
            </el-button>
          </div>
          <span class="table-count">{{ queryInsights.length }} 条记录</span>
        </div>
        <el-table v-loading="insightLoading" :data="queryInsights" border height="520">
          <el-table-column prop="rawQuery" label="搜索词" min-width="160" fixed="left" />
          <el-table-column prop="normalizedQuery" label="归一化词" min-width="160" />
          <el-table-column label="范围" width="130">
            <template #default="{ row }">
              {{ formatDomain(row.domain) }}
            </template>
          </el-table-column>
          <el-table-column prop="resultCount" label="结果数" width="90" sortable />
          <el-table-column prop="selectedEntityName" label="选中对象" min-width="180">
            <template #default="{ row }">
              {{ row.selectedEntityName || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="source" label="来源" width="130" />
          <el-table-column prop="createdAt" label="时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="Agent 建议" name="suggestions">
        <div class="section-toolbar">
          <div class="inline-controls">
            <el-select
              v-model="suggestionStatus"
              clearable
              placeholder="全部状态"
              style="width: 140px"
              @change="loadSuggestions"
            >
              <el-option label="待处理" value="PENDING" />
              <el-option label="已批准" value="APPROVED" />
              <el-option label="已拒绝" value="REJECTED" />
              <el-option label="已应用" value="APPLIED" />
              <el-option label="失败" value="FAILED" />
            </el-select>
            <el-input-number
              v-model="suggestionDays"
              :min="1"
              :max="90"
              controls-position="right"
              style="width: 140px"
            />
            <el-button
              type="primary"
              :icon="MagicStick"
              :loading="generatingSuggestions"
              @click="handleGenerateSuggestions"
            >
              生成建议
            </el-button>
          </div>
          <span class="table-count">{{ suggestions.length }} 条建议</span>
        </div>

        <el-table v-loading="suggestionLoading" :data="suggestions" border height="520">
          <el-table-column label="范围" width="130">
            <template #default="{ row }">
              {{ formatDomain(row.domain) }}
            </template>
          </el-table-column>
          <el-table-column prop="action" label="动作" width="130" />
          <el-table-column label="建议内容" min-width="260">
            <template #default="{ row }">
              <div class="payload-block">
                <strong>{{ extractPayloadTerm(row.payload) }}</strong>
                <span>{{ extractPayloadAliases(row.payload) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="agentRationale" label="理由" min-width="260">
            <template #default="{ row }">
              {{ row.agentRationale || formatJson(row.evidence) }}
            </template>
          </el-table-column>
          <el-table-column label="风险" width="100">
            <template #default="{ row }">
              <el-tag :type="riskTagType(row.riskLevel)">
                {{ formatRisk(row.riskLevel) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="suggestionTagType(row.status)">
                {{ formatSuggestionStatus(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button
                link
                type="success"
                :icon="Check"
                :disabled="row.status !== 'PENDING' || suggestionBusyId === row.id"
                @click="handleApproveSuggestion(row)"
              >
                通过
              </el-button>
              <el-button
                link
                type="danger"
                :icon="Close"
                :disabled="row.status !== 'PENDING' || suggestionBusyId === row.id"
                @click="handleRejectSuggestion(row)"
              >
                拒绝
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="应用范围" name="scope">
        <el-table :data="scopeRows" border>
          <el-table-column prop="label" label="应用范围" width="180" />
          <el-table-column prop="domain" label="域编码" width="170" />
          <el-table-column prop="description" label="治理对象" min-width="260" />
          <el-table-column prop="operatorNote" label="运营关注点" min-width="320" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="aliasFormVisible"
      :title="aliasForm.id ? '编辑别名组' : '新增别名组'"
      width="620px"
      destroy-on-close
    >
      <el-form :model="aliasForm" label-width="90px">
        <el-form-item label="应用范围" required>
          <el-select v-model="aliasForm.domain" style="width: 100%">
            <el-option
              v-for="domain in domainOptions"
              :key="domain.value"
              :label="domain.label"
              :value="domain.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标准词" required>
          <el-input v-model="aliasForm.canonicalTerm" placeholder="例如：鸡胸肉" />
        </el-form-item>
        <el-form-item label="别名" required>
          <el-input
            v-model="aliasForm.aliasesText"
            type="textarea"
            :rows="5"
            placeholder="多个别名可用逗号或换行分隔"
          />
        </el-form-item>
        <el-form-item label="风险等级">
          <el-select v-model="aliasForm.riskLevel" style="width: 160px">
            <el-option label="低" value="LOW" />
            <el-option label="中" value="MEDIUM" />
            <el-option label="高" value="HIGH" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="aliasForm.notes" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="aliasFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="aliasSaving" @click="handleSaveAliasGroup">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check,
  Close,
  MagicStick,
  Plus,
  Refresh,
  Search as SearchIcon
} from '@element-plus/icons-vue'
import { searchGovernanceApi } from '@/api/searchGovernance'
import type {
  SearchAliasGroup,
  SearchAliasGroupStatus,
  SearchAliasRiskLevel,
  SearchAliasSuggestion,
  SearchAliasSuggestionStatus,
  SearchGovernanceDomain,
  SearchGovernanceOverview,
  SearchQueryInsight,
  UpsertSearchAliasGroupPayload
} from '@/types/searchGovernance'

const domainOptions: Array<{ label: string; value: SearchGovernanceDomain }> = [
  { label: '原料搜索', value: 'INGREDIENT' },
  { label: '营养原料搜索', value: 'NUTRITION_FOOD' },
  { label: '犬种搜索', value: 'BREED' },
  { label: '订单搜索', value: 'ORDER' }
]

const scopeRows = [
  {
    label: '原料搜索',
    domain: 'INGREDIENT',
    description: '采购原料、食材与补剂原料的名称检索。',
    operatorNote: '维护常见简称、错别字、供应商命名差异，避免原料重复建档。'
  },
  {
    label: '营养原料搜索',
    domain: 'NUTRITION_FOOD',
    description: 'USDA、CFCT 等营养库食物条目的检索。',
    operatorNote: '关注中英文别名、烹饪状态、可食部与加工形态造成的歧义。'
  },
  {
    label: '犬种搜索',
    domain: 'BREED',
    description: '犬种档案、别名与中英文品种名检索。',
    operatorNote: '处理中文俗称、英文缩写和相近品种名称，降低误选风险。'
  },
  {
    label: '订单搜索',
    domain: 'ORDER',
    description: '订单号、客户信息与订单关联实体的检索。',
    operatorNote: '只接收低风险别名，避免把隐私字段或模糊身份信息扩散到词库。'
  }
]

const activeTab = ref('overview')
const selectedDomain = ref<SearchGovernanceDomain | ''>('')
const overview = ref<SearchGovernanceOverview | null>(null)
const aliasGroups = ref<SearchAliasGroup[]>([])
const queryInsights = ref<SearchQueryInsight[]>([])
const suggestions = ref<SearchAliasSuggestion[]>([])

const aliasStatus = ref<SearchAliasGroupStatus | ''>('ACTIVE')
const suggestionStatus = ref<SearchAliasSuggestionStatus | ''>('PENDING')
const insightDays = ref(14)
const suggestionDays = ref(14)

const refreshing = ref(false)
const overviewLoading = ref(false)
const aliasLoading = ref(false)
const insightLoading = ref(false)
const suggestionLoading = ref(false)
const aliasSaving = ref(false)
const generatingSuggestions = ref(false)
const suggestionBusyId = ref('')

const aliasFormVisible = ref(false)
const aliasForm = reactive({
  id: '',
  domain: 'INGREDIENT' as SearchGovernanceDomain,
  canonicalTerm: '',
  aliasesText: '',
  riskLevel: 'LOW' as SearchAliasRiskLevel,
  notes: ''
})

const pendingSuggestionCount = computed(
  () => suggestions.value.filter((item) => item.status === 'PENDING').length
)

const currentDomainParam = () => selectedDomain.value || undefined

const loadOverview = async () => {
  overviewLoading.value = true
  try {
    overview.value = await searchGovernanceApi.getOverview()
  } finally {
    overviewLoading.value = false
  }
}

const loadAliasGroups = async () => {
  aliasLoading.value = true
  try {
    aliasGroups.value = await searchGovernanceApi.listAliasGroups({
      domain: currentDomainParam(),
      status: aliasStatus.value || undefined
    })
  } finally {
    aliasLoading.value = false
  }
}

const loadQueryInsights = async () => {
  insightLoading.value = true
  try {
    queryInsights.value = await searchGovernanceApi.getQueryInsights({
      domain: currentDomainParam(),
      days: insightDays.value
    })
  } finally {
    insightLoading.value = false
  }
}

const loadSuggestions = async () => {
  suggestionLoading.value = true
  try {
    suggestions.value = await searchGovernanceApi.listSuggestions({
      domain: currentDomainParam(),
      status: suggestionStatus.value || undefined
    })
  } finally {
    suggestionLoading.value = false
  }
}

const loadAll = async () => {
  refreshing.value = true
  try {
    await Promise.all([
      loadOverview(),
      loadAliasGroups(),
      loadQueryInsights(),
      loadSuggestions()
    ])
  } finally {
    refreshing.value = false
  }
}

const handleDomainChange = () => {
  loadAll()
}

const resetAliasForm = () => {
  aliasForm.id = ''
  aliasForm.domain = selectedDomain.value || 'INGREDIENT'
  aliasForm.canonicalTerm = ''
  aliasForm.aliasesText = ''
  aliasForm.riskLevel = 'LOW'
  aliasForm.notes = ''
}

const openCreateAliasGroup = () => {
  resetAliasForm()
  aliasFormVisible.value = true
}

const openEditAliasGroup = (group: SearchAliasGroup) => {
  aliasForm.id = group.id
  aliasForm.domain = group.domain
  aliasForm.canonicalTerm = group.canonicalTerm
  aliasForm.aliasesText = group.aliases.join('\n')
  aliasForm.riskLevel = group.riskLevel
  aliasForm.notes = group.notes ?? ''
  aliasFormVisible.value = true
}

const parseAliases = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )

const buildAliasPayload = (): UpsertSearchAliasGroupPayload | null => {
  const canonicalTerm = aliasForm.canonicalTerm.trim()
  const aliases = parseAliases(aliasForm.aliasesText)

  if (!canonicalTerm) {
    ElMessage.warning('请填写标准词')
    return null
  }
  if (!aliases.length) {
    ElMessage.warning('请至少填写一个别名')
    return null
  }

  return {
    domain: aliasForm.domain,
    canonicalTerm,
    aliases,
    riskLevel: aliasForm.riskLevel,
    notes: aliasForm.notes.trim() || null
  }
}

const handleSaveAliasGroup = async () => {
  const payload = buildAliasPayload()
  if (!payload) {
    return
  }

  aliasSaving.value = true
  try {
    if (aliasForm.id) {
      await searchGovernanceApi.updateAliasGroup(aliasForm.id, payload)
      ElMessage.success('别名组已更新')
    } else {
      await searchGovernanceApi.createAliasGroup(payload)
      ElMessage.success('别名组已创建')
    }
    aliasFormVisible.value = false
    await Promise.all([loadAliasGroups(), loadOverview()])
  } finally {
    aliasSaving.value = false
  }
}

const confirmOperatorAction = async (
  message: string,
  title: string
): Promise<boolean> => {
  try {
    await ElMessageBox.confirm(message, title, { type: 'warning' })
    return true
  } catch {
    return false
  }
}

const handleDisableAliasGroup = async (group: SearchAliasGroup) => {
  const confirmed = await confirmOperatorAction(
    `确定停用「${group.canonicalTerm}」别名组吗？停用后不会参与搜索召回。`,
    '停用别名组'
  )
  if (!confirmed) {
    return
  }

  await searchGovernanceApi.disableAliasGroup(group.id)
  ElMessage.success('别名组已停用')
  await Promise.all([loadAliasGroups(), loadOverview()])
}

const handleGenerateSuggestions = async () => {
  generatingSuggestions.value = true
  try {
    const created = await searchGovernanceApi.generateSuggestions({
      domain: currentDomainParam(),
      days: suggestionDays.value
    })
    ElMessage.success(`已生成 ${created.length} 条 Agent 建议`)
    await Promise.all([loadSuggestions(), loadOverview()])
  } finally {
    generatingSuggestions.value = false
  }
}

const handleApproveSuggestion = async (suggestion: SearchAliasSuggestion) => {
  const confirmed = await confirmOperatorAction('确认应用这条 Agent 建议吗？', '审批建议')
  if (!confirmed) {
    return
  }

  suggestionBusyId.value = suggestion.id
  try {
    await searchGovernanceApi.approveSuggestion(suggestion.id)
    ElMessage.success('建议已应用')
    await Promise.all([loadSuggestions(), loadAliasGroups(), loadOverview()])
  } finally {
    suggestionBusyId.value = ''
  }
}

const handleRejectSuggestion = async (suggestion: SearchAliasSuggestion) => {
  const confirmed = await confirmOperatorAction('确认拒绝这条 Agent 建议吗？', '拒绝建议')
  if (!confirmed) {
    return
  }

  suggestionBusyId.value = suggestion.id
  try {
    await searchGovernanceApi.rejectSuggestion(suggestion.id)
    ElMessage.success('建议已拒绝')
    await Promise.all([loadSuggestions(), loadAliasGroups(), loadOverview()])
  } finally {
    suggestionBusyId.value = ''
  }
}

const formatDomain = (domain: SearchGovernanceDomain) =>
  domainOptions.find((item) => item.value === domain)?.label ?? domain

const formatRisk = (risk: SearchAliasRiskLevel) => {
  const labels: Record<SearchAliasRiskLevel, string> = {
    LOW: '低',
    MEDIUM: '中',
    HIGH: '高'
  }
  return labels[risk] ?? risk
}

const riskTagType = (risk: SearchAliasRiskLevel) => {
  if (risk === 'HIGH') return 'danger'
  if (risk === 'MEDIUM') return 'warning'
  return 'success'
}

const formatSuggestionStatus = (status: SearchAliasSuggestionStatus) => {
  const labels: Record<SearchAliasSuggestionStatus, string> = {
    PENDING: '待处理',
    APPROVED: '已批准',
    REJECTED: '已拒绝',
    APPLIED: '已应用',
    FAILED: '失败'
  }
  return labels[status] ?? status
}

const suggestionTagType = (status: SearchAliasSuggestionStatus) => {
  if (status === 'PENDING') return 'warning'
  if (status === 'APPLIED' || status === 'APPROVED') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const extractPayloadTerm = (payload: Record<string, unknown>) => {
  const term = payload.canonicalTerm
  return typeof term === 'string' && term.trim() ? term : '未指定标准词'
}

const extractPayloadAliases = (payload: Record<string, unknown>) => {
  const aliases = payload.aliases
  if (!Array.isArray(aliases)) {
    return '别名：-'
  }
  return `别名：${aliases.filter((item) => typeof item === 'string').join('、') || '-'}`
}

const formatJson = (value: Record<string, unknown>) => JSON.stringify(value)

onMounted(() => {
  loadAll()
})
</script>

<style scoped>
.search-governance-page {
  min-width: 960px;
}

.page-header,
.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  color: #1f2f3d;
  font-size: 22px;
}

.page-subtitle {
  margin-top: 6px;
  color: #6b7785;
  font-size: 13px;
}

.header-actions,
.inline-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
}

.metric-panel span,
.table-count {
  color: #6b7785;
  font-size: 13px;
}

.metric-panel strong {
  color: #1f2f3d;
  font-size: 26px;
  line-height: 1;
}

.governance-tabs {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
}

.section-title {
  color: #1f2f3d;
  font-weight: 600;
}

.alias-tag {
  margin: 2px 6px 2px 0;
}

.payload-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.payload-block span {
  color: #6b7785;
  font-size: 13px;
}

@media (max-width: 1200px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
