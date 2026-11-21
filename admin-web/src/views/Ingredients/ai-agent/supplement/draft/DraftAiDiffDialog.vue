<template>
  <div
    v-if="modelValue"
    class="draft-diff__overlay"
    role="dialog"
    aria-modal="true"
    aria-label="AI 起草结果：采用前先对一遍"
  >
    <div ref="panelRef" class="draft-diff__panel" tabindex="-1">
      <header class="draft-diff__head">
        <h3 class="draft-diff__title">AI 起草结果：采用前先对一遍</h3>
        <span class="draft-diff__sub">
          必须选一次「采用所选」或「保留我的」才能继续
        </span>
      </header>

      <div class="draft-diff__body">
        <p class="draft-diff__intro">
      AI 改了 {{ rows.length }} 个字段。勾选的会采用 AI 新值；没勾选的会回退成你的原值，
      并记进「人改」，之后 AI 不会再覆盖。人改字段默认不采用。
    </p>

    <p v-if="rows.length === 0" class="draft-diff__empty">
      AI 没有带来任何字段变化。
    </p>

    <table v-else class="draft-diff__table">
      <thead>
        <tr>
          <th class="draft-diff__cell-check">
            <el-checkbox
              :model-value="allSelected"
              :indeterminate="someSelected && !allSelected"
              :disabled="selectableRows.length === 0"
              data-action="diff-toggle-all"
              @update:model-value="
                (value: boolean | string | number) => toggleAll(value === true)
              "
            />
          </th>
          <th>字段</th>
          <th>你的原值</th>
          <th>AI 新值</th>
          <th>标记</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.path"
          :data-diff-row="row.path"
          :class="{ 'draft-diff__row--manual': row.manual }"
        >
          <td class="draft-diff__cell-check">
            <el-checkbox
              :model-value="row.manual || selected.includes(row.path)"
              :disabled="row.manual"
              :data-diff-check="row.path"
              @update:model-value="
                (value: boolean | string | number) =>
                  toggleRow(row.path, value === true)
              "
            />
          </td>
          <td>
            <span class="draft-diff__field">{{ fieldLabel(row.path) }}</span>
            <code class="draft-diff__path">{{ row.path }}</code>
          </td>
          <td class="draft-diff__value">{{ formatValue(row.before) }}</td>
          <td
            class="draft-diff__value"
            :class="{ 'draft-diff__value--changed': !row.manual }"
          >
            {{ formatValue(row.after) }}
          </td>
          <td>
            <el-tag
              v-if="row.manual"
              type="warning"
              size="small"
              effect="plain"
              data-manual-label="true"
            >
              人改，AI 未覆盖
            </el-tag>
            <span v-else class="draft-diff__auto">AI 新值</span>
          </td>
        </tr>
      </tbody>
    </table>

      </div>

      <footer class="draft-diff__footer">
        <span class="draft-diff__summary">
          已勾选采用 {{ selected.length }} 项；未勾选的 {{ rows.length - selected.length }} 项会回退并标人改
        </span>
        <div class="draft-diff__actions">
          <el-button data-action="diff-keep-mine" @click="keepMine">
            保留我的（全部回退）
          </el-button>
          <el-button
            type="primary"
            :disabled="rows.length === 0"
            data-action="diff-adopt"
            @click="adoptSelected"
          >
            采用所选
          </el-button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AI 重填 diff 弹窗（spec §10.3）。
 *
 * - 只列叶子级真正变化的字段；`manualFields` 命中的行标「人改，AI 未覆盖」，
 *   且不允许勾选采用（即使后端有 bug 改了人改字段，这里也强制回退）。
 * - 「采用所选」发出勾选的路径；「保留我的」发空数组，父级据此把所有变化
 *   回退到原值并逐条 `markManual`。
 * - 弹窗不可点遮罩/Esc 关闭，必须明确选一次，避免不小心把 AI 值留在表单里。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SupplementDraftPayload } from '@/api/supplementDrafts'
import {
  diffDraft,
  fieldMapRows,
  type SupplementDraftDiffRow
} from './supplementDraftState'

const props = defineProps<{
  /** 是否显示；父级在 apply 后直接把组件卸载 */
  modelValue: boolean
  before: SupplementDraftPayload
  after: SupplementDraftPayload
  manualFields: string[]
}>()

const emit = defineEmits<{
  (event: 'apply', applyPaths: string[]): void
}>()


const rows = computed<SupplementDraftDiffRow[]>(() =>
  diffDraft(props.before, props.after, props.manualFields)
)

const selectableRows = computed(() => rows.value.filter((row) => !row.manual))

/** 默认全选「非人改」行；人改行默认保持原值。 */
const selected = ref<string[]>([])

/** 弹窗自己的焦点陷阱：差异未选完前，Tab 不能跑回后面的表单。 */
const panelRef = ref<HTMLElement | null>(null)

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(): HTMLElement[] {
  const panel = panelRef.value
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 不能 Esc 跳过：必须明确选「采用所选」或「保留我的」。
    event.preventDefault()
    return
  }
  if (event.key !== 'Tab') return
  const elements = focusableElements()
  if (elements.length === 0) return
  const first = elements[0]!
  const last = elements[elements.length - 1]!
  const active = document.activeElement
  if (event.shiftKey && (active === first || !panelRef.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !panelRef.value?.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  await nextTick()
  focusableElements()[0]?.focus()
  window.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
})

watch(
  selectableRows,
  (next) => {
    selected.value = next.map((row) => row.path)
  },
  { immediate: true }
)

const allSelected = computed(
  () =>
    selectableRows.value.length > 0 &&
    selectableRows.value.every((row) => selected.value.includes(row.path))
)

const someSelected = computed(() =>
  selectableRows.value.some((row) => selected.value.includes(row.path))
)

const labelByPath = computed(() => {
  const map = new Map<string, string>()
  for (const row of fieldMapRows) {
    map.set(row.path, row.label)
  }
  return map
})

function fieldLabel(path: string): string {
  return labelByPath.value.get(path) ?? path
}

function toggleRow(path: string, checked: boolean): void {
  if (checked) {
    if (!selected.value.includes(path)) {
      selected.value = [...selected.value, path]
    }
  } else {
    selected.value = selected.value.filter((item) => item !== path)
  }
}

function toggleAll(checked: boolean): void {
  selected.value = checked ? selectableRows.value.map((row) => row.path) : []
}

/** 展示用值：null/undefined 要能区分「空」和「没这个字段」。 */
function formatValue(value: unknown): string {
  if (value === undefined) return '（原草稿没有）'
  if (value === null) return '空'
  if (Array.isArray(value)) {
    return value.length === 0 ? '（空列表）' : value.join('、')
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function adoptSelected(): void {
  emit('apply', [...selected.value])
}

function keepMine(): void {
  emit('apply', [])
}
</script>

<style scoped>
.draft-diff__overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(17, 24, 39, 0.45);
}

.draft-diff__panel {
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: 86vh;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
  overflow: hidden;
}

.draft-diff__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f2f5;
}

.draft-diff__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2733;
}

.draft-diff__sub {
  font-size: 11.5px;
  color: #98a1ad;
}

.draft-diff__body {
  padding: 16px 20px;
  overflow: auto;
}

.draft-diff__intro {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #5b6470;
}

.draft-diff__empty {
  margin: 0;
  padding: 28px;
  border: 1px dashed #e3e7ed;
  border-radius: 10px;
  color: #98a1ad;
  font-size: 12.5px;
  text-align: center;
}

.draft-diff__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.draft-diff__table th,
.draft-diff__table td {
  padding: 9px 10px;
  border-bottom: 1px solid #f0f2f5;
  text-align: left;
  vertical-align: top;
}

.draft-diff__table th {
  color: #8a93a0;
  font-weight: 600;
  background: #fafbfc;
}

.draft-diff__row--manual {
  background: #fffbf5;
}

.draft-diff__cell-check {
  width: 44px;
}

.draft-diff__field {
  display: block;
  font-weight: 600;
  color: #38414d;
}

.draft-diff__path {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #98a1ad;
}

.draft-diff__value {
  max-width: 240px;
  color: #5b6470;
  word-break: break-word;
}

.draft-diff__value--changed {
  color: #1f2733;
  font-weight: 500;
}

.draft-diff__auto {
  font-size: 11.5px;
  color: #8a93a0;
}

.draft-diff__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #f0f2f5;
  background: #fafbfc;
}

.draft-diff__summary {
  font-size: 12px;
  color: #8a93a0;
}

.draft-diff__actions {
  display: flex;
  gap: 8px;
}
</style>
