<template>
  <section class="draft-list">
    <header class="draft-list__head">
      <div>
        <h2 class="draft-list__title">补剂草稿</h2>
        <p class="draft-list__desc">
          草稿存在服务端，只有手动放弃才会清掉；没点最终写入前不会影响正式原料库。
        </p>
      </div>
      <el-button type="primary" data-action="new" @click="emit('new')">
        ＋ 新建补剂
      </el-button>
    </header>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      class="draft-list__error"
    >
      <el-button text size="small" data-action="retry" @click="emit('retry')">
        重新加载
      </el-button>
    </el-alert>

    <p v-if="loading && drafts.length === 0" class="draft-list__loading">
      正在加载草稿…
    </p>

    <el-empty
      v-else-if="!error && drafts.length === 0"
      description="还没有草稿"
      :image-size="96"
    >
      <p class="draft-list__empty-desc">
        新建一条补剂草稿，传正面图和标签图后可以让 AI 先起草，再逐项核对。
      </p>
      <el-button type="primary" data-action="new-empty" @click="emit('new')">
        新建补剂
      </el-button>
    </el-empty>

    <template v-else-if="drafts.length > 0">
      <el-table :data="drafts" row-key="id" stripe style="width: 100%">
        <el-table-column label="草稿名" min-width="220">
          <template #default="{ row }">
            <span
              class="draft-list__name"
              :class="{ 'draft-list__name--empty': !row.name }"
            >
              {{ draftName(row) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="90">
          <template #default>
            <el-tag
              type="info"
              size="small"
              effect="plain"
              data-status="draft"
            >
              草稿
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="最后编辑" width="180">
          <template #default="{ row }">
            <span :title="row.updatedAt">{{ formatEditedAt(row.updatedAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="完成度" width="230">
          <template #default="{ row }">
            <div class="draft-list__completeness">
              <el-progress
                :percentage="completenessPercent(row)"
                :stroke-width="8"
                :show-text="false"
                class="draft-list__progress"
              />
              <span class="draft-list__ratio">
                已填 {{ row.completeness.filledRequired }}/{{
                  row.completeness.totalRequired
                }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button
              text
              type="primary"
              data-action="continue"
              @click="emit('continue', row.id)"
            >
              继续
            </el-button>
            <el-button
              text
              type="danger"
              data-action="discard"
              @click="emit('discard', row)"
            >
              放弃
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <p v-if="loading" class="draft-list__loading">正在刷新草稿…</p>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * 补剂草稿列表（spec §10.1）。
 *
 * 只负责展示和转交意图：真正的新建/继续/放弃都由输入输出组件
 * `SupplementDraftFlow` 调接口，这样列表本身可以在测试里独立挂载。
 */
import type { SupplementDraftSummary } from '@/api/supplementDrafts'

withDefaults(
  defineProps<{
    /** 我的未完成草稿，按最近编辑倒序（后端已排序） */
    drafts: SupplementDraftSummary[]
    loading: boolean
    /**
     * 列表加载失败的中文原因。有值时不要显示「还没有草稿」，
     * 否则会把「网络失败」说成「没有草稿」。
     */
    error?: string
  }>(),
  { error: '' }
)

const emit = defineEmits<{
  (event: 'new'): void
  (event: 'continue', id: string): void
  (event: 'discard', draft: SupplementDraftSummary): void
  (event: 'retry'): void
}>()

/** 名字是空的草稿显示成「未命名补剂」，不要显示空行。 */
function draftName(draft: Pick<SupplementDraftSummary, 'name'>): string {
  const name = draft.name?.trim()
  return name ? name : '未命名补剂'
}

/** 必填完成度换算成进度条百分比；总数为 0 时不做除法。 */
function completenessPercent(draft: SupplementDraftSummary): number {
  const total = draft.completeness.totalRequired
  if (!Number.isFinite(total) || total <= 0) return 0
  const filled = Math.min(Math.max(draft.completeness.filledRequired, 0), total)
  return Math.round((filled / total) * 100)
}

/** 最后编辑时间按本地时区显示到分钟；解析不了就原样展示。 */
function formatEditedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<style scoped>
.draft-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.draft-list__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.draft-list__title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: #1f2733;
}

.draft-list__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #6b7482;
}

.draft-list__error {
  border-radius: 10px;
}

.draft-list__loading {
  margin: 0;
  font-size: 12.5px;
  color: #8a93a0;
}

.draft-list__empty-desc {
  margin: 0 0 6px;
  font-size: 12.5px;
  color: #8892a0;
}

.draft-list__name {
  font-weight: 600;
  color: #202833;
}

.draft-list__name--empty {
  font-weight: 400;
  color: #98a1ad;
}

.draft-list__completeness {
  display: flex;
  align-items: center;
  gap: 10px;
}

.draft-list__progress {
  flex: 1;
  min-width: 80px;
}

.draft-list__ratio {
  flex: none;
  font-size: 12px;
  color: #5b6470;
  font-variant-numeric: tabular-nums;
}
</style>
