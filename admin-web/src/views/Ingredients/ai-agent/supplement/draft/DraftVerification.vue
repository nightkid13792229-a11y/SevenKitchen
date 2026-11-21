<template>
  <section
    class="draft-verification"
    :class="{
      'draft-verification--ok': verification.ok,
      'draft-verification--failed': !verification.ok
    }"
    data-verification-screen
  >
    <el-alert
      :type="verification.ok ? 'success' : 'warning'"
      :title="title"
      :description="summary"
      :closable="false"
      show-icon
      class="draft-verification__banner"
      :data-verification-state="verification.ok ? 'ok' : 'failed'"
    />

    <div class="draft-verification__meta">
      <span>草稿：{{ draft.name.trim() || '未命名补剂' }}</span>
      <span>写入后核验时间：{{ formatTime(verification.checkedAt) }}</span>
      <span v-if="draft.finalizedIngredientId">
        原料 ID：<code>{{ draft.finalizedIngredientId }}</code>
      </span>
    </div>

    <section class="draft-verification__block" data-verification-fields>
      <header class="draft-verification__block-head">
        <h3 class="draft-verification__block-title">直接字段</h3>
        <el-tag
          :type="fieldsAllPass ? 'success' : 'danger'"
          size="small"
          effect="plain"
        >
          {{ fieldsPassed }}/{{ fields.length }} 通过
        </el-tag>
      </header>

      <el-alert
        v-if="fields.length === 0"
        title="没有写入时的字段核验记录，不能判定全部成功"
        type="warning"
        :closable="false"
        show-icon
      />
      <table v-else class="draft-verification__table">
        <thead>
          <tr>
            <th>字段</th>
            <th>期望</th>
            <th>实际</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="field in fields"
            :key="`${field.key}-${field.target}`"
            :data-field-row="field.key"
            :data-pass="field.ok ? 'true' : 'false'"
          >
            <td>
              <span class="draft-verification__field-label">{{ field.label }}</span>
              <span class="draft-verification__target">
                <code>{{ field.target }}</code>
              </span>
            </td>
            <td class="draft-verification__value">{{ formatValue(field.expected) }}</td>
            <td class="draft-verification__value">{{ formatValue(field.actual) }}</td>
            <td>
              <el-tag :type="field.ok ? 'success' : 'danger'" size="small">
                {{ field.ok ? '通过' : '不通过' }}
              </el-tag>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="draft-verification__block" data-verification-features>
      <header class="draft-verification__block-head">
        <h3 class="draft-verification__block-title">功能核验</h3>
        <el-tag
          :type="featuresAllPass ? 'success' : 'warning'"
          size="small"
          effect="plain"
        >
          {{ featuresPassed }}/{{ features.length }} 通过
        </el-tag>
      </header>

      <ul v-if="features.length > 0" class="draft-verification__features">
        <li
          v-for="feature in features"
          :key="feature.code"
          class="draft-verification__feature"
          :class="{
            'draft-verification__feature--failed': !feature.ok,
            'draft-verification__feature--warn':
              !feature.ok && feature.severity === 'WARN'
          }"
          :data-feature="feature.code"
          :data-pass="feature.ok ? 'true' : 'false'"
        >
          <div class="draft-verification__feature-main">
            <div class="draft-verification__feature-head">
              <span class="draft-verification__feature-label">{{ feature.label }}</span>
              <el-tag :type="featureTagType(feature)" size="small">
                {{ featureStatusText(feature) }}
              </el-tag>
              <el-tag
                v-if="!feature.ok"
                :type="feature.severity === 'ERROR' ? 'danger' : 'warning'"
                size="small"
                effect="plain"
              >
                {{ severityText(feature.severity) }}
              </el-tag>
            </div>
            <p class="draft-verification__feature-detail">{{ feature.detail }}</p>
          </div>

          <el-button
            v-if="!feature.ok"
            link
            type="primary"
            class="draft-verification__feature-action"
            :data-feature-action="feature.code"
            @click="goFeature(feature)"
          >
            {{ featureActionLabel(feature) }}
          </el-button>
        </li>
      </ul>
      <el-alert
        v-else
        title="没有功能核验项"
        type="info"
        :closable="false"
        show-icon
      />
    </section>

    <footer class="draft-verification__footer">
      <span v-if="reverifying" class="draft-verification__busy" data-reverify-hint>
        正在重新核验…
      </span>
      <span v-else class="draft-verification__hint">
        数据已经写入；修复外部配置后可重新核验，不需要重跑整张草稿。
      </span>

      <div class="draft-verification__actions">
        <el-button data-action="goto-ingredients" @click="go('/ingredients')">
          去原料库
        </el-button>
        <el-button
          data-action="goto-catalog"
          @click="go('/supplement-shop/catalog')"
        >
          去上架清单
        </el-button>
        <el-button
          data-action="goto-recipe-designer"
          @click="go('/recipe-designer')"
        >
          去配方设计器
        </el-button>
        <el-button
          type="primary"
          plain
          data-action="reverify"
          :loading="reverifying"
          :disabled="reverifying"
          @click="emit('reverify')"
        >
          重新核验
        </el-button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * 写入后核验结果页（spec §4.5 / §8.5 / §10.5）。
 *
 * 只展示后端核验报告，不自己推断结果：
 * - 直接字段逐行给「期望 / 实际 / 是否通过」；
 * - 功能项给标签、严重程度、详情和修复入口；
 * - `verification.ok=false` 时整页不使用成功样式，标题固定为
 *   「已写入，但以下功能未生效」，不能显示「全部成功」。
 *
 * 功能修复入口一律落在真实路由：后端报告里的 path 只作为提示，
 * 前端按 code 映射到本工程存在的页面，避免跳到 404。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type {
  SupplementDraftView,
  SupplementVerificationFeature,
  SupplementVerificationFeatureCode,
  SupplementVerificationFeatureSeverity,
  SupplementWriteVerification
} from '@/api/supplementDrafts'

const props = withDefaults(
  defineProps<{
    /** 后端写入后核验报告（spec §9.3） */
    verification: SupplementWriteVerification
    /** 已写入的草稿（只用于显示名称/原料 id） */
    draft: SupplementDraftView
    /** 重跑功能核验的 loading；不传按 false 处理 */
    reverifying?: boolean
  }>(),
  { reverifying: false }
)

const emit = defineEmits<{
  (event: 'reverify'): void
}>()

const router = useRouter()

const fields = computed(() => props.verification.fields)
const features = computed(() => props.verification.features)
const fieldsPassed = computed(() => fields.value.filter((field) => field.ok).length)
const featuresPassed = computed(
  () => features.value.filter((feature) => feature.ok).length
)
/** 空报告不能算「全部通过」，否则缺字段报告会被绿色标签洗成成功。 */
const fieldsAllPass = computed(
  () => fields.value.length > 0 && fieldsPassed.value === fields.value.length
)
const featuresAllPass = computed(
  () => features.value.length > 0 && featuresPassed.value === features.value.length
)

const title = computed(() =>
  props.verification.ok
    ? '已写入并核验通过'
    : '已写入，但以下功能未生效'
)

const summary = computed(() => {
  if (props.verification.ok) {
    return '正式数据已经写入，直接字段与功能核验全部通过。'
  }
  const failed = features.value.filter(
    (feature) => !feature.ok && feature.severity === 'ERROR'
  ).length
  const directFailed = fields.value.filter((field) => !field.ok).length
  if (directFailed > 0) {
    return `数据已经写入，但有 ${directFailed} 个直接字段与草稿不一致，另有 ${failed} 个功能未生效。草稿不会回滚，请按下面的入口修复。`
  }
  return `数据已经写入，但功能校验没有全部通过（阻断 ${failed} 项）。这不代表可以正常使用，请按下面的入口逐项修复。`
})

/* ------------------------------------------------------------------ */
/* 展示格式                                                            */
/* ------------------------------------------------------------------ */

/** 核验值可能是字符串/数字/布尔/数组/对象，统一转成可读文本。 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') {
    const text = value.trim()
    return text || '—'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '—'
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => formatValue(item)).join('、') : '—'
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

const SEVERITY_TEXT: Record<SupplementVerificationFeatureSeverity, string> = {
  INFO: '正常',
  WARN: '提醒',
  ERROR: '阻断'
}

function severityText(severity: SupplementVerificationFeatureSeverity): string {
  return SEVERITY_TEXT[severity]
}

function featureStatusText(feature: SupplementVerificationFeature): string {
  if (feature.ok) return '通过'
  return feature.severity === 'WARN' ? '提醒' : '不通过'
}

function featureTagType(
  feature: SupplementVerificationFeature
): 'success' | 'warning' | 'danger' | 'info' {
  if (feature.ok) return 'success'
  return feature.severity === 'WARN' ? 'warning' : 'danger'
}

/* ------------------------------------------------------------------ */
/* 修复入口：按 code 映射到本工程真实路由                                */
/* ------------------------------------------------------------------ */

interface FeatureRoute {
  path: string
  label: string
}

/**
 * 有效路由表。后端 `action.path` 只是建议（历史上出现过 `/supplement-shop`
 * 这类总入口），这里按 code 落到最具体的页面，避免修复入口找不到目标。
 */
const FEATURE_ROUTES: Record<SupplementVerificationFeatureCode, FeatureRoute> = {
  RETAIL: { path: '/supplement-shop/catalog', label: '去上架清单处理' },
  RECIPE: { path: '/ingredients?tab=nutrition', label: '去营养档案检查' },
  DIY: { path: '/ingredients', label: '去原料库补购买链接' },
  PROCUREMENT: { path: '/ingredients', label: '去原料库补采购信息' },
  EQUIVALENCE: {
    path: '/supplement-shop/equivalence-groups',
    label: '去等价组检查'
  },
  PACKAGING: { path: '/supplement-shop/packaging', label: '去配置包材' },
  DUPLICATE: { path: '/ingredients', label: '去原料库检查重复' },
  DIRECT_FIELDS_MISSING: { path: '/ingredients', label: '去原料库核对字段' }
}

function featureRoute(feature: SupplementVerificationFeature): FeatureRoute {
  return (
    FEATURE_ROUTES[feature.code] ?? {
      path: '/ingredients',
      label: '去原料库检查'
    }
  )
}

function featureActionLabel(feature: SupplementVerificationFeature): string {
  return feature.action?.label || featureRoute(feature).label
}

function go(path: string): void {
  void router.push(path)
}

function goFeature(feature: SupplementVerificationFeature): void {
  go(featureRoute(feature).path)
}
</script>

<style scoped>
.draft-verification {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: #fff;
}

.draft-verification--failed {
  border-color: #f5dab1;
}

.draft-verification__banner {
  border-radius: 10px;
}

.draft-verification__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12.5px;
  color: #5b6470;
}

.draft-verification__meta code {
  padding: 1px 4px;
  border-radius: 4px;
  background: #eef1f5;
  font-size: 11.5px;
  color: #3b4654;
}

.draft-verification__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.draft-verification__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.draft-verification__block-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2733;
}

.draft-verification__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.draft-verification__table th,
.draft-verification__table td {
  padding: 8px 10px;
  border: 1px solid #eef1f5;
  text-align: left;
  vertical-align: top;
  line-height: 1.5;
}

.draft-verification__table th {
  background: #f8fafc;
  font-weight: 600;
  color: #5b6470;
}

.draft-verification__table tr[data-pass='false'] {
  background: #fef0f0;
}

.draft-verification__field-label {
  display: block;
  font-weight: 600;
  color: #1f2733;
}

.draft-verification__target {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: #909399;
}

.draft-verification__target code,
.draft-verification__meta code {
  word-break: break-all;
}

.draft-verification__value {
  max-width: 260px;
  word-break: break-all;
}

.draft-verification__features {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-verification__feature {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #f8fafc;
}

.draft-verification__feature--failed {
  border-color: #fbc4c4;
  background: #fef0f0;
}

.draft-verification__feature--warn {
  border-color: #f5dab1;
  background: #fdf6ec;
}

.draft-verification__feature-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.draft-verification__feature-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.draft-verification__feature-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2733;
}

.draft-verification__feature-detail {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #5b6470;
}

.draft-verification__feature-action {
  flex: none;
}

.draft-verification__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef1f5;
}

.draft-verification__hint {
  font-size: 12.5px;
  color: #5b6470;
}

.draft-verification__busy {
  font-size: 12.5px;
  font-weight: 600;
  color: #b45309;
}

.draft-verification__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 900px) {
  .draft-verification__footer,
  .draft-verification__feature {
    flex-direction: column;
    align-items: stretch;
  }

  .draft-verification__actions {
    justify-content: flex-end;
  }
}
</style>
