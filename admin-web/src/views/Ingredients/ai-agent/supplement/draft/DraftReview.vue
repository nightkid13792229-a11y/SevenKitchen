<template>
  <section class="draft-review" data-review-screen>
    <header class="draft-review__head">
      <div class="draft-review__head-main">
        <h2 class="draft-review__title">最终审核</h2>
        <p class="draft-review__desc">
          这里是写入前最后一次检查。确认写入后，会在一个事务里新建原料、营养档案、映射、标签证据和等价组关系；有阻断项或提醒项没确认时不会写入。
        </p>
      </div>
      <el-tag
        :type="reviewReady ? 'success' : 'warning'"
        effect="dark"
        size="large"
        data-review-state
      >
        {{ reviewReady ? '可以写入' : '还不能写入' }}
      </el-tag>
    </header>

    <div class="draft-review__stats">
      <div class="draft-review__stat" data-completeness>
        <span class="draft-review__stat-label">完整性</span>
        <strong class="draft-review__stat-value">
          {{ completeness.filledRequired }}/{{ completeness.totalRequired }}
        </strong>
        <span class="draft-review__stat-hint">必填项已填</span>
        <div
          v-if="completeness.missing.length > 0"
          class="draft-review__missing"
          data-missing-list
        >
          <span class="draft-review__missing-label">还缺：</span>
          <el-tag
            v-for="key in completeness.missing"
            :key="key"
            size="small"
            type="info"
            effect="plain"
            :title="key"
          >
            {{ missingLabel(key) }}
          </el-tag>
        </div>
        <span v-else class="draft-review__stat-ok">必填项都已填</span>
      </div>

      <div
        class="draft-review__stat"
        :class="{ 'draft-review__stat--danger': blockers.length > 0 }"
        data-blocker-count
      >
        <span class="draft-review__stat-label">硬校验</span>
        <strong class="draft-review__stat-value">{{ blockers.length }}</strong>
        <span class="draft-review__stat-hint">
          {{ blockers.length > 0 ? '条阻断项（必须改）' : '没有阻断项' }}
        </span>
      </div>

      <div
        class="draft-review__stat"
        :class="{ 'draft-review__stat--warning': unacknowledgedCount > 0 }"
        data-warning-count
      >
        <span class="draft-review__stat-label">提醒项</span>
        <strong class="draft-review__stat-value">
          {{ acknowledgedWarningCount }}/{{ warnings.length }}
        </strong>
        <span class="draft-review__stat-hint">
          {{
            warnings.length === 0
              ? '没有需要确认的提醒项'
              : unacknowledgedCount > 0
                ? `还有 ${unacknowledgedCount} 条没确认`
                : '已全部确认'
          }}
        </span>
      </div>
    </div>

    <section class="draft-review__block" data-blockers>
      <h3 class="draft-review__block-title">阻断项（必须改）</h3>
      <el-alert
        v-if="blockers.length === 0"
        title="没有阻断项"
        type="success"
        :closable="false"
        show-icon
      />
      <ul v-else class="draft-review__issues">
        <li
          v-for="(issue, index) in blockers"
          :key="`${issue.code}-${index}`"
          class="draft-review__issue draft-review__issue--blocker"
          data-blocker
          :data-field="issue.fieldPath ?? ''"
        >
          <el-tag type="danger" size="small" effect="dark">阻断</el-tag>
          <div class="draft-review__issue-body">
            <span class="draft-review__issue-message">{{ issue.message }}</span>
            <span v-if="issue.fieldPath" class="draft-review__issue-field">
              字段：<code>{{ issue.fieldPath }}</code>
            </span>
          </div>
        </li>
      </ul>
    </section>

    <section class="draft-review__block" data-warnings>
      <h3 class="draft-review__block-title">提醒项（逐条确认后才能写入）</h3>
      <el-alert
        v-if="warnings.length === 0"
        title="没有需要确认的提醒项"
        type="success"
        :closable="false"
        show-icon
      />
      <template v-else>
        <ul class="draft-review__issues">
          <li
            v-for="(issue, index) in warnings"
            :key="`${ackKeyOf(issue)}-${index}`"
            class="draft-review__issue draft-review__issue--warning"
            data-warning
            :data-ack-key="ackKeyOf(issue)"
          >
            <el-checkbox
              :model-value="isAcknowledged(issue)"
              class="draft-review__check"
              :disabled="finalizing"
              @update:model-value="handleWarningToggle(issue, $event)"
            >
              <span class="draft-review__issue-message">{{ issue.message }}</span>
            </el-checkbox>
            <div class="draft-review__issue-meta">
              <span v-if="issue.fieldPath" class="draft-review__issue-field">
                字段：<code>{{ issue.fieldPath }}</code>
              </span>
              <span class="draft-review__issue-field">
                确认键：<code>{{ ackKeyOf(issue) }}</code>
              </span>
            </div>
          </li>
        </ul>
        <p v-if="unacknowledgedCount > 0" class="draft-review__hint" data-ack-hint>
          还有 {{ unacknowledgedCount }} 条提醒项没确认；全部勾选后才能点「确认写入」。
        </p>
      </template>
    </section>

    <section class="draft-review__block" data-decision-log>
      <h3 class="draft-review__block-title">AI 决策日志</h3>
      <el-alert
        v-if="!hasAiSnapshot"
        title="这张草稿没有 AI 决策记录，可以手动补全后写入"
        type="info"
        :closable="false"
        show-icon
      />
      <template v-else>
        <el-alert
          v-if="!aiDecisions"
          title="AI 起草记录里没有决策项，只按草稿内容写入"
          type="info"
          :closable="false"
          show-icon
        />
        <ul v-else class="draft-review__decisions">
          <li
            v-for="row in decisionRows"
            :key="row.key"
            class="draft-review__decision"
            :data-decision="row.key"
          >
            <span class="draft-review__decision-label">{{ row.label }}</span>
            <div class="draft-review__decision-body">
              <span class="draft-review__decision-value">{{ row.decision }}</span>
              <span v-if="row.detail" class="draft-review__decision-detail">
                {{ row.detail }}
              </span>
              <span class="draft-review__decision-reason">理由：{{ row.reason }}</span>
              <span v-if="row.proposed" class="draft-review__decision-proposed">
                {{ row.proposed }}
              </span>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <section class="draft-review__block" data-field-map>
      <h3 class="draft-review__block-title">写入后会写什么</h3>
      <p class="draft-review__hint">
        只读对照表：左边是草稿字段，右边是这次写入的生产落点；长表默认收起，展开后可逐项核对。
      </p>
      <el-collapse v-model="openedSections" class="draft-review__field-map">
        <el-collapse-item
          v-for="group in fieldMapGroups"
          :key="group.section"
          :name="group.section"
          :data-field-map-section="group.section"
        >
          <template #title>
            <span class="draft-review__field-map-title">
              {{ group.section }}
              <span class="draft-review__field-map-count">
                {{ group.rows.length }} 项
              </span>
            </span>
          </template>
          <table class="draft-review__table">
            <thead>
              <tr>
                <th>草稿字段</th>
                <th>草稿路径</th>
                <th>生产落点</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in group.rows"
                :key="row.path"
                :data-field-path="row.path"
              >
                <td>{{ row.label }}</td>
                <td><code>{{ row.path }}</code></td>
                <td><code>{{ row.target }}</code></td>
              </tr>
            </tbody>
          </table>
        </el-collapse-item>
      </el-collapse>
    </section>

    <footer class="draft-review__footer">
      <span
        class="draft-review__footer-hint"
        :class="{ 'draft-review__footer-hint--busy': finalizing }"
        data-review-hint
      >
        {{ disabledReason || '确认后开始写入；写入成功后会自动逐项核验。' }}
      </span>
      <div class="draft-review__actions">
        <el-button
          data-action="back"
          :disabled="finalizing"
          @click="emit('back')"
        >
          返回修改
        </el-button>
        <el-button
          type="primary"
          data-action="finalize"
          :loading="finalizing"
          :disabled="!reviewReady"
          @click="emit('finalize')"
        >
          确认写入
        </el-button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * 最终审核屏（spec §4.4 / §10.4）。
 *
 * 只负责「把后端校验结果摆清楚」：
 * - 完整性、阻断项、提醒项逐条确认；
 * - AI 决策日志（取自 `draft.aiSnapshot.decisions`，并用 `proposedDecisions`
 *   标出 AI 原始提议与最终生效值的差异）；
 * - 字段 → 生产落点对照表（`fieldMapRows`，只读）。
 *
 * 不自己判断校验规则：能否写入完全遵循后端返回的 blockers/warnings 与
 * `canFinalize`（ackKey 缺省回退 code，与后端同一口径）。
 */
import { computed, ref } from 'vue'
import type {
  SupplementDraftReview,
  SupplementDraftValidationIssue,
  SupplementDraftView
} from '@/api/supplementDrafts'
import { NO_SALE_REASONS } from '../launchConfigState'
import {
  ackKeyOf,
  canFinalize,
  fieldMapRows,
  type SupplementDraftFieldMapRow
} from './supplementDraftState'

const props = defineProps<{
  /** 后端最终校验结果（阻断项/提醒项/完成度） */
  review: SupplementDraftReview
  /** 当前草稿（AI 决策日志与字段映射从这里取） */
  draft: SupplementDraftView
  /** 已确认的提醒项 key（ackKey，缺省 code） */
  acknowledged: string[]
  /** 最终写入进行中：写入按钮与返回按钮都禁用 */
  finalizing: boolean
}>()

const emit = defineEmits<{
  (event: 'finalize'): void
  (event: 'back'): void
  (event: 'update:acknowledged', value: string[]): void
}>()

const blockers = computed(() => props.review.blockers)
const warnings = computed(() => props.review.warnings)
const completeness = computed(() => props.review.completeness)
const acknowledgedSet = computed(() => new Set(props.acknowledged))

const acknowledgedWarningCount = computed(
  () => warnings.value.filter((issue) => isAcknowledged(issue)).length
)
const unacknowledgedCount = computed(
  () => warnings.value.length - acknowledgedWarningCount.value
)

/** 与后端 finalize 同一口径：没阻断项、每条提醒都用 ackKey 确认过。 */
const canWrite = computed(() => canFinalize(props.review, props.acknowledged))
const reviewReady = computed(() => canWrite.value && !props.finalizing)

const disabledReason = computed(() => {
  if (props.finalizing) return '正在写入，请稍候…'
  if (blockers.value.length > 0) {
    return `还有 ${blockers.value.length} 条阻断项，改完再写入`
  }
  if (unacknowledgedCount.value > 0) {
    return `还有 ${unacknowledgedCount.value} 条提醒项没确认，勾选后才能写入`
  }
  return ''
})

function isAcknowledged(issue: SupplementDraftValidationIssue): boolean {
  return acknowledgedSet.value.has(ackKeyOf(issue))
}

/** 勾选/取消一条提醒，整组 key 回传给父级（父级负责落草稿）。 */
function toggleWarning(
  issue: SupplementDraftValidationIssue,
  checked: boolean
): void {
  const key = ackKeyOf(issue)
  const next = new Set(props.acknowledged)
  if (checked) {
    next.add(key)
  } else {
    next.delete(key)
  }
  emit('update:acknowledged', [...next])
}

/** el-checkbox 的 model-value 可能是 boolean/string/number，这里统一收口。 */
function handleWarningToggle(
  issue: SupplementDraftValidationIssue,
  value: string | number | boolean
): void {
  toggleWarning(issue, value === true)
}

/* ------------------------------------------------------------------ */
/* 完整性缺失项 → 中文名                                                */
/* ------------------------------------------------------------------ */

/** 与后端 `computeDraftCompleteness` 的 key 一一对应；未知 key 原样显示。 */
const MISSING_LABELS: Record<string, string> = {
  name: '原料名称',
  baseUnit: '基准单位',
  unitDisplayLabel: '展示单位',
  physicalForm: '物理形态',
  servingUnitsPerDose: '每份多少',
  purchaseUnit: '采购单位',
  purchaseToBaseRatio: '换算倍数',
  currentPricePerPurchaseUnit: '当前采购价',
  addTiming: '添加时机',
  nutrition: '营养（每份含量 + 默认目标）',
  labelCategory: '标签分类',
  labelNames: '标签名称',
  tagNames: '标签分类标签',
  shelfLifeMonths: '原厂保质期',
  noSaleReason: '不上架原因',
  platform: '购买平台',
  linkUrl: '购买链接',
  groupId: '等价组'
}

function missingLabel(key: string): string {
  return MISSING_LABELS[key] ?? key
}

/* ------------------------------------------------------------------ */
/* AI 决策日志                                                          */
/* ------------------------------------------------------------------ */

const NO_SALE_REASON_LABELS = new Map<string, string>(
  NO_SALE_REASONS.map((reason) => [reason.value, reason.label])
)

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function readRecord(
  record: UnknownRecord | null,
  key: string
): UnknownRecord | null {
  return record ? asRecord(record[key]) : null
}

function readText(record: UnknownRecord | null, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readBoolean(record: UnknownRecord | null, key: string): boolean | null {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : null
}

const aiSnapshot = computed<UnknownRecord | null>(() =>
  asRecord(props.draft.aiSnapshot)
)
const aiDecisions = computed<UnknownRecord | null>(() => {
  if (!aiSnapshot.value) return null
  return (
    readRecord(aiSnapshot.value, 'decisions') ??
    readRecord(aiSnapshot.value, 'proposedDecisions')
  )
})
const aiProposedDecisions = computed<UnknownRecord | null>(() =>
  readRecord(aiSnapshot.value, 'proposedDecisions')
)
const hasAiSnapshot = computed(() => aiSnapshot.value !== null)

interface DecisionRow {
  key: string
  label: string
  decision: string
  reason: string
  /** 补充说明（链接、原因码等） */
  detail: string
  /** AI 原始提议与最终生效值不同时的一句话对照 */
  proposed: string
}

/** AI 的 reason 优先取生效值，空时回退原始提议里的理由。 */
function reasonOf(
  effective: UnknownRecord | null,
  proposed: UnknownRecord | null
): string {
  return readText(effective, 'reason') || readText(proposed, 'reason') || 'AI 没给理由'
}

function booleanDiffText(
  prefix: string,
  effective: boolean | null,
  proposed: boolean | null,
  onText: string,
  offText: string
): string {
  if (effective === null || proposed === null || effective === proposed) return ''
  return `${prefix}：${proposed ? onText : offText}`
}

const decisionRows = computed<DecisionRow[]>(() => {
  const effective = aiDecisions.value
  if (!effective) return []
  const proposed = aiProposedDecisions.value
  const rows: DecisionRow[] = []

  const recommend = readRecord(effective, 'recommendCreate')
  const recommendValue = readBoolean(recommend, 'value')
  if (recommendValue !== null) {
    const proposedRecommend = readBoolean(
      readRecord(proposed, 'recommendCreate'),
      'value'
    )
    rows.push({
      key: 'recommendCreate',
      label: '是否建议建档',
      decision: recommendValue ? 'AI 建议建档' : 'AI 建议不建档',
      reason: reasonOf(recommend, readRecord(proposed, 'recommendCreate')),
      detail: '',
      proposed: booleanDiffText(
        'AI 原始提议',
        recommendValue,
        proposedRecommend,
        '建议建档',
        '建议不建档'
      )
    })
  }

  const retail = readRecord(effective, 'retail')
  const retailEnabled = readBoolean(retail, 'enabled')
  if (retailEnabled !== null) {
    const noSaleReason = readText(effective, 'noSaleReason')
    const noSaleLabel = noSaleReason
      ? NO_SALE_REASON_LABELS.get(noSaleReason) ?? noSaleReason
      : ''
    rows.push({
      key: 'retail',
      label: '商城上架',
      decision: retailEnabled
        ? '上架'
        : noSaleLabel
          ? `不上架（${noSaleLabel}）`
          : '不上架',
      reason: reasonOf(retail, readRecord(proposed, 'retail')),
      detail: retailEnabled ? '' : noSaleReason ? `不上架原因码：${noSaleReason}` : '',
      proposed: booleanDiffText(
        'AI 原始提议',
        retailEnabled,
        readBoolean(readRecord(proposed, 'retail'), 'enabled'),
        '上架',
        '不上架'
      )
    })
  }

  const diy = readRecord(effective, 'diy')
  const diyEnabled = readBoolean(diy, 'enabled')
  if (diyEnabled !== null) {
    const linkUrl = readText(diy, 'linkUrl')
    rows.push({
      key: 'diy',
      label: 'DIY 推荐',
      decision: diyEnabled ? '开启' : '关闭',
      reason: reasonOf(diy, readRecord(proposed, 'diy')),
      detail: diyEnabled && linkUrl ? `链接：${linkUrl}` : '',
      proposed: booleanDiffText(
        'AI 原始提议',
        diyEnabled,
        readBoolean(readRecord(proposed, 'diy'), 'enabled'),
        '开启',
        '关闭'
      )
    })
  }

  const procurement = readRecord(effective, 'procurement')
  const procurementEnabled = readBoolean(procurement, 'enabled')
  if (procurementEnabled !== null) {
    rows.push({
      key: 'procurement',
      label: '生产采购',
      decision: procurementEnabled ? '开启' : '关闭',
      reason: reasonOf(procurement, readRecord(proposed, 'procurement')),
      detail: '',
      proposed: booleanDiffText(
        'AI 原始提议',
        procurementEnabled,
        readBoolean(readRecord(proposed, 'procurement'), 'enabled'),
        '开启',
        '关闭'
      )
    })
  }

  const equivalence = readRecord(effective, 'equivalence')
  if (equivalence) {
    const groupId = readText(equivalence, 'groupId')
    const proposedGroupId = readText(
      readRecord(proposed, 'equivalence'),
      'groupId'
    )
    rows.push({
      key: 'equivalence',
      label: '等价组',
      decision: !groupId
        ? '还没选'
        : groupId === '__SKIP__'
          ? '暂不归组'
          : `归入等价组 ${groupId}`,
      reason: reasonOf(
        equivalence,
        readRecord(proposed, 'equivalence')
      ),
      detail: '',
      proposed:
        groupId === proposedGroupId
          ? ''
          : `AI 原始提议：${
              !proposedGroupId
                ? '还没选'
                : proposedGroupId === '__SKIP__'
                  ? '暂不归组'
                  : proposedGroupId
            }`
    })
  }

  return rows
})

/* ------------------------------------------------------------------ */
/* 字段 → 生产落点                                                      */
/* ------------------------------------------------------------------ */

interface FieldMapGroup {
  section: string
  rows: SupplementDraftFieldMapRow[]
}

const fieldMapGroups = computed<FieldMapGroup[]>(() => {
  const groups: FieldMapGroup[] = []
  for (const row of fieldMapRows) {
    const existing = groups.find((group) => group.section === row.section)
    if (existing) {
      existing.rows.push(row)
    } else {
      groups.push({ section: row.section, rows: [row] })
    }
  }
  return groups
})

/** 长表默认收起，短表展开；始终可以手动开合。 */
const openedSections = ref<string[]>(
  fieldMapGroups.value
    .filter((group) => group.rows.length <= 8)
    .map((group) => group.section)
)
</script>

<style scoped>
.draft-review {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: #fff;
}

.draft-review__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.draft-review__title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: #1f2733;
}

.draft-review__desc {
  margin: 0;
  max-width: 720px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #5b6470;
}

.draft-review__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.draft-review__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  background: #f8fafc;
}

.draft-review__stat--danger {
  border-color: #fbc4c4;
  background: #fef0f0;
}

.draft-review__stat--warning {
  border-color: #f5dab1;
  background: #fdf6ec;
}

.draft-review__stat-label {
  font-size: 12px;
  color: #5b6470;
}

.draft-review__stat-value {
  font-size: 22px;
  line-height: 1.2;
  color: #1f2733;
}

.draft-review__stat-hint {
  font-size: 12px;
  color: #5b6470;
}

.draft-review__stat-ok {
  font-size: 12px;
  color: #67c23a;
}

.draft-review__missing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.draft-review__missing-label {
  font-size: 12px;
  color: #b45309;
}

.draft-review__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.draft-review__block-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2733;
}

.draft-review__issues {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-review__issue {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
}

.draft-review__issue--blocker {
  border: 1px solid #fbc4c4;
  background: #fef0f0;
}

.draft-review__issue--warning {
  flex-direction: column;
  gap: 6px;
  border: 1px solid #f5dab1;
  background: #fdf6ec;
}

.draft-review__issue-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.draft-review__issue-message {
  font-size: 13px;
  line-height: 1.6;
  color: #1f2733;
}

.draft-review__issue-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-left: 24px;
}

.draft-review__issue-field {
  font-size: 12px;
  color: #5b6470;
}

.draft-review__issue-field code,
.draft-review__table code {
  padding: 1px 4px;
  border-radius: 4px;
  background: #eef1f5;
  font-size: 11.5px;
  color: #3b4654;
}

.draft-review__check {
  align-items: flex-start;
}

.draft-review__check :deep(.el-checkbox__label) {
  white-space: normal;
  line-height: 1.6;
}

.draft-review__hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #5b6470;
}

.draft-review__decisions {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  overflow: hidden;
  list-style: none;
}

.draft-review__decision {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #eef1f5;
}

.draft-review__decision:last-child {
  border-bottom: none;
}

.draft-review__decision-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #5b6470;
}

.draft-review__decision-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.draft-review__decision-value {
  font-size: 13px;
  font-weight: 600;
  color: #1f2733;
}

.draft-review__decision-detail,
.draft-review__decision-reason {
  font-size: 12px;
  line-height: 1.6;
  color: #5b6470;
  word-break: break-all;
}

.draft-review__decision-proposed {
  font-size: 12px;
  line-height: 1.6;
  color: #b45309;
}

.draft-review__field-map {
  border-top: 1px solid #eef1f5;
}

.draft-review__field-map-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2733;
}

.draft-review__field-map-count {
  font-size: 11.5px;
  font-weight: 400;
  color: #909399;
}

.draft-review__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.draft-review__table th,
.draft-review__table td {
  padding: 7px 10px;
  border: 1px solid #eef1f5;
  text-align: left;
  vertical-align: top;
  line-height: 1.5;
}

.draft-review__table th {
  background: #f8fafc;
  font-weight: 600;
  color: #5b6470;
}

.draft-review__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef1f5;
}

.draft-review__footer-hint {
  font-size: 12.5px;
  color: #5b6470;
}

.draft-review__footer-hint--busy {
  color: #b45309;
  font-weight: 600;
}

.draft-review__actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 900px) {
  .draft-review__stats {
    grid-template-columns: 1fr;
  }

  .draft-review__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .draft-review__actions {
    justify-content: flex-end;
  }
}
</style>
