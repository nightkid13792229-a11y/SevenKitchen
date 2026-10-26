<template>
  <el-dialog
    :model-value="modelValue"
    class="check-dialog"
    width="min(680px, 94vw)"
    top="6vh"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="check-dialog__title">
        <b>核验报告 · {{ checkDomainLabel(domain) }}</b>
        <el-tag
          v-if="run && !loading"
          size="small"
          :type="run.trigger === 'USER' ? 'success' : 'info'"
          effect="plain"
        >
          {{ run.trigger === 'USER' ? '人工核验' : 'AI 自检（不算授权依据）' }}
        </el-tag>
      </div>
    </template>

    <div v-if="loading" class="check-loading" role="status" aria-live="polite">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <div>
        <p class="check-loading__title">正在跑规则…</p>
        <p class="check-loading__hint">规则逐条跑，跑完自动显示报告。</p>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="check-action-error"
      type="error"
      :closable="false"
      show-icon
      title="这一步没成功（后端返回原文）"
    >
      <p class="check-dialog__error">{{ error }}</p>
    </el-alert>

    <template v-if="run && !loading">
      <div class="check-meta">
        <span>规则版本 {{ run.rulesVersion }}</span>
        <span>检查于 {{ formatCheckedAt(run.createdAt) }}</span>
      </div>

      <el-alert
        v-if="stale"
        class="check-stale"
        type="warning"
        :closable="false"
        show-icon
        title="这份报告已过期：核验之后草稿又改过"
      >
        授权只认重跑后的报告，点下方「重跑核验」再授权。
      </el-alert>

      <div class="check-counts" role="group" aria-label="核验计数">
        <div class="check-count check-count--danger">
          <span class="check-count__num">{{ counts.blocking }}</span>
          <span class="check-count__label">阻断</span>
        </div>
        <div class="check-count check-count--warning">
          <span class="check-count__num">{{ counts.exceptionable }}</span>
          <span class="check-count__label">不合格（可例外）</span>
        </div>
        <div class="check-count check-count--info">
          <span class="check-count__num">{{ counts.warning }}</span>
          <span class="check-count__label">提醒</span>
        </div>
      </div>
      <p class="check-total">
        {{ counts.total > 0 ? `共发现 ${counts.total} 条问题` : '没有发现问题' }}
      </p>

      <section
        v-for="section in sections"
        :key="section.key"
        class="check-section"
      >
        <h4 class="check-section__head" :class="`check-section__head--${section.key}`">
          {{ section.label }}
          <span class="check-section__count">{{ section.items.length }}</span>
        </h4>

        <p v-if="section.items.length === 0" class="check-section__empty">
          没有{{ section.label }}项
        </p>

        <article
          v-for="item in section.items"
          :key="`${section.key}-${item.code}-${item.fieldPath ?? ''}`"
          class="check-item"
        >
          <div class="check-item__head">
            <el-tag size="small" :type="section.type" effect="plain">
              <code class="check-item__code">{{ item.code }}</code>
            </el-tag>
            <span class="check-item__message">{{ item.message }}</span>
          </div>

          <p v-if="item.suggestion" class="check-item__suggestion">
            建议：{{ item.suggestion }}
          </p>

          <p v-if="item.fieldPath" class="check-item__path">
            字段：<code>{{ item.fieldPath }}</code>
          </p>

          <div class="check-item__actions">
            <el-button
              v-if="item.fieldPath"
              size="small"
              text
              type="primary"
              @click="emit('locate', item)"
            >
              定位到字段
            </el-button>

            <template v-if="section.key === 'exceptionable'">
              <el-tag
                v-if="isExcepted(item)"
                size="small"
                type="success"
                effect="plain"
              >
                已登记例外
              </el-tag>
              <el-button
                v-else
                size="small"
                type="warning"
                plain
                :disabled="savingException"
                @click="emit('exception', item)"
              >
                登记例外
              </el-button>
            </template>
          </div>
        </article>
      </section>
    </template>

    <el-empty
      v-if="!loading && !run && !error"
      description="还没有报告。点「重跑核验」跑一次。"
      :image-size="64"
    />

    <template #footer>
      <div class="check-dialog__footer">
        <span class="check-dialog__hint">
          授权只认人点「核验此页」跑出来的报告；AI 自检不算。
        </span>
        <div class="check-dialog__buttons">
          <el-button
            :loading="loading"
            :disabled="loading || savingException"
            @click="emit('rerun')"
          >
            重跑核验
          </el-button>
          <el-button @click="emit('update:modelValue', false)">关闭</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type {
  CheckDomain,
  CheckItem,
  CheckRunView
} from '@/types/ingredientCreation'
import {
  checkDomainLabel,
  checkRunCounts,
  formatCheckedAt,
  toCheckReportSections
} from '../checkReportView'

/**
 * 按域核验报告弹窗。
 *
 * 只负责渲染与发事件（`rerun` / `locate` / `exception`），所有判定逻辑在
 * `checkReportView.ts`；页面拿到事件后再调接口、改草稿、重跑核验。
 */
const props = defineProps<{
  modelValue: boolean
  domain: CheckDomain
  run: CheckRunView | null
  loading: boolean
  /** 核验接口失败时的原文；拦截器已经弹过提示，这里只做弹窗内说明。 */
  error: string
  /** 报告是否已过期（授权只认 fresh 的报告）。 */
  stale: boolean
  /** 已登记例外的 code；exceptionable 项据此显示「已登记例外」。 */
  exceptionCodes: string[]
  savingException: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'rerun'): void
  (e: 'locate', item: CheckItem): void
  (e: 'exception', item: CheckItem): void
}>()

const sections = computed(() => toCheckReportSections(props.run))
const counts = computed(() => checkRunCounts(props.run))

function isExcepted(item: CheckItem): boolean {
  return props.exceptionCodes.includes(item.code)
}
</script>

<style scoped>
.check-dialog__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.check-loading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 28px 8px;
  color: var(--el-color-primary);
}

.check-loading__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.check-loading__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.check-dialog__error {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.check-action-error {
  margin-bottom: 12px;
}

.check-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.check-stale {
  margin-bottom: 12px;
}

.check-counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.check-count {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.check-count__num {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.check-count__label {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.check-count--danger .check-count__num {
  color: var(--el-color-danger);
}

.check-count--warning .check-count__num {
  color: var(--el-color-warning);
}

.check-count--info .check-count__num {
  color: var(--el-color-info);
}

.check-total {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.check-section {
  margin-top: 12px;
}

.check-section__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}

.check-section__head--blocking {
  color: var(--el-color-danger);
}

.check-section__head--exceptionable {
  color: var(--el-color-warning);
}

.check-section__head--warning {
  color: var(--el-color-info);
}

.check-section__count {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.check-section__empty {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.check-item {
  padding: 8px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.check-item:last-child {
  border-bottom: none;
}

.check-item__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.check-item__head :deep(.el-tag) {
  flex: none;
}

.check-item__code {
  font-size: 11px;
}

.check-item__message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.check-item__suggestion {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.check-item__path {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.check-item__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.check-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.check-dialog__hint {
  flex: 1;
  min-width: 180px;
  font-size: 12px;
  text-align: left;
  color: var(--el-text-color-secondary);
}

.check-dialog__buttons {
  display: flex;
  gap: 8px;
}
</style>
