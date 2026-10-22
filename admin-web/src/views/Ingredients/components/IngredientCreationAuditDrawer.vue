<template>
  <el-drawer
    v-model="visible"
    :title="drawerTitle"
    size="760px"
    destroy-on-close
  >
    <div v-loading="loading" class="audit-drawer">
      <el-alert
        v-if="loadError"
        type="error"
        :closable="false"
        show-icon
        title="加载创建记录失败（后端返回原文）"
      >
        <p class="audit-error">{{ loadError }}</p>
      </el-alert>

      <el-empty
        v-else-if="notFound"
        description="这条原料没有创建记录"
      />

      <template v-else-if="audit">
        <section class="audit-summary" aria-labelledby="audit-summary-title">
          <header class="audit-section__header">
            <div>
              <h3 id="audit-summary-title">这次创建</h3>
              <p>提交时一次性写入原料、营养档案与映射。</p>
            </div>
            <el-tag size="small" type="success" effect="light">已提交</el-tag>
          </header>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="提交时间">
              {{ formatDateTime(audit.committedAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="提交人">
              <span class="mono">{{ audit.committedBy }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="原料 ID">
              <span class="mono">{{ audit.ingredientId }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="营养档案 ID">
              <span class="mono">
                {{ audit.nutritionFoodIds.join('、') || '—' }}
              </span>
            </el-descriptions-item>
          </el-descriptions>
        </section>

        <section class="audit-section" aria-labelledby="audit-proposals-title">
          <header class="audit-section__header">
            <div>
              <h3 id="audit-proposals-title">AI 提案</h3>
              <p>AI 每次出方案时留下的原始快照；按字段列出当时的来源与值。</p>
            </div>
            <el-tag size="small" type="info" effect="plain">
              {{ proposalSection.snapshots.length }} 份
            </el-tag>
          </header>

          <div v-if="proposalSection.isEmpty" class="audit-empty">
            {{ proposalSection.emptyText }}
          </div>

          <div v-else class="proposal-list">
            <article
              v-for="(snapshot, index) in proposalSection.snapshots"
              :key="`${snapshot.kind}-${snapshot.createdAt}-${index}`"
              class="proposal-card"
            >
              <header class="proposal-card__header">
                <div class="proposal-card__title">
                  <el-tag size="small" effect="light">
                    {{ snapshot.kindLabel }}
                  </el-tag>
                  <span class="proposal-card__time">
                    {{ formatDateTime(snapshot.createdAt) }}
                  </span>
                </div>
                <span class="proposal-card__kind mono">{{ snapshot.kind }}</span>
              </header>

              <ul
                v-if="snapshot.summaryLines.length"
                class="proposal-card__summary"
              >
                <li
                  v-for="line in snapshot.summaryLines"
                  :key="line"
                >
                  {{ line }}
                </li>
              </ul>

              <el-table
                v-if="snapshot.fieldRows.length"
                :data="snapshot.fieldRows"
                size="small"
                border
              >
                <el-table-column label="字段" min-width="140">
                  <template #default="{ row }">
                    <div>{{ row.fieldLabel }}</div>
                    <div class="mono audit-muted">{{ row.fieldPath }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="AI 当时的来源" min-width="160">
                  <template #default="{ row }">
                    <span class="mono">{{ row.sourceText }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="AI 当时的值" width="150">
                  <template #default="{ row }">{{ row.valueText }}</template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                  <template #default="{ row }">
                    <el-tag size="small" type="info" effect="plain">
                      {{ row.statusLabel }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </article>
          </div>
        </section>

        <section class="audit-section" aria-labelledby="audit-changes-title">
          <header class="audit-section__header">
            <div>
              <h3 id="audit-changes-title">人工改动</h3>
              <p>AI 提案与最终档案不一致的字段；一致即视为采纳，不列在这里。</p>
            </div>
            <el-tag
              size="small"
              :type="changeRows.length ? 'warning' : 'info'"
              effect="plain"
            >
              {{ changeRows.length }} 处
            </el-tag>
          </header>

          <div v-if="changeRows.length === 0" class="audit-empty">
            {{ EMPTY_CHANGES_TEXT }}
          </div>

          <el-table v-else :data="changeRows" size="small" border>
            <el-table-column label="档案" width="80">
              <template #default="{ row }">{{ row.profileLabel }}</template>
            </el-table-column>
            <el-table-column label="字段" min-width="120">
              <template #default="{ row }">
                <div>{{ row.fieldLabel }}</div>
                <div class="mono audit-muted">{{ row.fieldPath }}</div>
              </template>
            </el-table-column>
            <el-table-column label="AI 值" width="120">
              <template #default="{ row }">{{ row.aiValueText }}</template>
            </el-table-column>
            <el-table-column label="最终值" width="120">
              <template #default="{ row }">{{ row.finalValueText }}</template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" type="warning" effect="light">
                  {{ row.statusLabel }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作人" width="110">
              <template #default="{ row }">
                <span class="mono">{{ row.changedBy }}</span>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section
          v-if="exceptionRows.length"
          class="audit-section"
          aria-labelledby="audit-exceptions-title"
        >
          <header class="audit-section__header">
            <div>
              <h3 id="audit-exceptions-title">人登记的例外</h3>
              <p>终检时人主动放行的理由，提交后留在创建记录里。</p>
            </div>
            <el-tag size="small" type="warning" effect="light">
              {{ exceptionRows.length }} 条
            </el-tag>
          </header>

          <el-table :data="exceptionRows" size="small" border>
            <el-table-column label="规则码" min-width="180">
              <template #default="{ row }">
                <span class="mono">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column label="理由" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ row.reason }}</template>
            </el-table-column>
            <el-table-column label="操作人" width="130">
              <template #default="{ row }">
                <span class="mono">{{ row.approvedBy }}</span>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ row.approvedAt }}</template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { getApiErrorMessage } from '@/utils/apiError'
import type { IngredientCreationAudit } from '@/types/ingredientCreation'
import {
  EMPTY_CHANGES_TEXT,
  buildAuditChangeRows,
  buildAuditExceptionRows,
  buildProposalSection
} from '../creation/creationAuditPresentation'

interface Props {
  modelValue: boolean
  ingredientId: string | null
  ingredientName?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  ingredientName: null
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const audit = ref<IngredientCreationAudit | null>(null)
const loading = ref(false)
const loadError = ref('')
const notFound = ref(false)
let requestToken = 0

const drawerTitle = computed(() =>
  props.ingredientName
    ? `创建记录 · ${props.ingredientName}`
    : '创建记录'
)

const proposalSection = computed(() =>
  buildProposalSection(audit.value?.proposals)
)
const changeRows = computed(() =>
  buildAuditChangeRows(audit.value?.changes)
)
const exceptionRows = computed(() =>
  buildAuditExceptionRows(audit.value?.changes)
)

function isNotFoundError(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } } | null)?.response?.status ===
    404
  )
}

async function loadAudit(ingredientId: string) {
  const token = ++requestToken
  loading.value = true
  loadError.value = ''
  notFound.value = false
  audit.value = null

  try {
    const result = await ingredientCreationApi.getAudit(ingredientId)
    if (token !== requestToken) {
      return
    }
    audit.value = result
  } catch (error) {
    if (token !== requestToken) {
      return
    }
    if (isNotFoundError(error)) {
      notFound.value = true
      return
    }
    loadError.value = getApiErrorMessage(error, '加载创建记录失败')
  } finally {
    if (token === requestToken) {
      loading.value = false
    }
  }
}

watch(
  () => [props.modelValue, props.ingredientId] as const,
  ([isOpen, ingredientId]) => {
    if (!isOpen || !ingredientId) {
      requestToken += 1
      loading.value = false
      audit.value = null
      loadError.value = ''
      notFound.value = false
      return
    }
    void loadAudit(ingredientId)
  },
  { immediate: true }
)

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.audit-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 160px;
}

.audit-section {
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.audit-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.audit-section__header h3 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.audit-section__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.audit-empty {
  padding: 18px 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  color: #909399;
  font-size: 13px;
  text-align: center;
}

.audit-error {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-line;
  word-break: break-word;
}

.proposal-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.proposal-card {
  padding: 10px;
  border: 1px solid #f0f2f5;
  border-radius: 6px;
  background: #fafafa;
}

.proposal-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.proposal-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.proposal-card__time {
  color: #909399;
  font-size: 12px;
}

.proposal-card__kind {
  color: #c0c4cc;
}

.proposal-card__summary {
  margin: 0 0 8px;
  padding-left: 18px;
  color: #606266;
  font-size: 12px;
  line-height: 1.7;
}

.audit-muted {
  color: #c0c4cc;
  font-size: 11px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
