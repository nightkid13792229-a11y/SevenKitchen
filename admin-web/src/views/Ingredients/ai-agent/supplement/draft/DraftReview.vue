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

      <div
        class="draft-review__stat"
        :class="{ 'draft-review__stat--warning': readinessWarningCount > 0 }"
        data-readiness-count
      >
        <span class="draft-review__stat-label">功能就绪</span>
        <strong class="draft-review__stat-value">
          {{ readinessReadyCount }}/{{ readiness.length }}
        </strong>
        <span class="draft-review__stat-hint">
          {{
            readinessWarningCount > 0
              ? `${readinessWarningCount} 项需补全或写入后核验`
              : '按草稿估算都已就绪'
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

    <section class="draft-review__block" data-readiness>
      <header class="draft-review__block-head">
        <div>
          <h3 class="draft-review__block-title">功能就绪（按草稿意向估算）</h3>
          <p class="draft-review__hint">
            这里只按草稿内容估算，不代表写入后一定可用；实际结果由写入后的功能核验逐项给出。
          </p>
        </div>
        <el-tag
          :type="readinessWarningCount === 0 ? 'success' : 'warning'"
          size="small"
          effect="plain"
        >
          就绪 {{ readinessReadyCount }}/{{ readiness.length }}
        </el-tag>
      </header>
      <ul class="draft-review__readiness">
        <li
          v-for="item in readiness"
          :key="item.key"
          class="draft-review__readiness-item"
          :data-readiness-item="item.key"
          :data-status="item.status"
        >
          <div class="draft-review__readiness-head">
            <span class="draft-review__readiness-label">{{ item.label }}</span>
            <el-tag :type="readinessTagType(item.status)" size="small">
              {{ READINESS_STATUS_TEXT[item.status] }}
            </el-tag>
          </div>
          <p class="draft-review__readiness-detail">{{ item.detail }}</p>
          <p v-if="item.note" class="draft-review__readiness-note">
            写入后核验：{{ item.note }}
          </p>
        </li>
      </ul>
    </section>

    <section class="draft-review__block" data-verification-checklist>
      <h3 class="draft-review__block-title">写入后会核验什么</h3>
      <p class="draft-review__hint">
        点「确认写入」不是结束：下面 7 项会在写入后逐项核验，未通过会显示「已写入，但以下功能未生效」。
      </p>
      <ul class="draft-review__checklist">
        <li
          v-for="item in VERIFICATION_CHECKLIST"
          :key="item.key"
          class="draft-review__checklist-item"
          :data-verification-checklist-item="item.key"
        >
          <span class="draft-review__checklist-label">{{ item.label }}</span>
          <span class="draft-review__checklist-detail">{{ item.detail }}</span>
        </li>
      </ul>
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

    <section class="draft-review__block" data-ai-missing>
      <h3 class="draft-review__block-title">AI 没找到的项</h3>
      <p v-if="!hasAiSnapshot" class="draft-review__hint">
        这张草稿还没有 AI 起草记录，没有可列的缺失项。
      </p>
      <p v-else-if="aiMissingItems.length === 0" class="draft-review__hint">
        AI 没有报告没找到的项；如果有目录/标签没读到，仍需要人工补。
      </p>
      <ul v-else class="draft-review__ai-missing">
        <li
          v-for="item in aiMissingItems"
          :key="item.fieldPath"
          class="draft-review__ai-missing-item"
          data-ai-missing-item
          :data-field-path="item.fieldPath"
        >
          <div class="draft-review__ai-missing-head">
            <span class="draft-review__ai-missing-label">{{ item.label }}</span>
            <code class="draft-review__ai-missing-path">{{ item.fieldPath }}</code>
          </div>
          <p v-if="item.reason" class="draft-review__ai-missing-reason">
            AI 原因：{{ item.reason }}
          </p>
          <p v-if="item.suggestion" class="draft-review__ai-missing-suggestion">
            补录建议：{{ item.suggestion }}
          </p>
        </li>
      </ul>
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

const props = withDefaults(
  defineProps<{
    /** 后端最终校验结果（阻断项/提醒项/完成度） */
    review: SupplementDraftReview
    /** 当前草稿（AI 决策日志、功能就绪估算与字段映射从这里取） */
    draft: SupplementDraftView
    /** 已确认的提醒项 key（ackKey，缺省 code） */
    acknowledged: string[]
    /** 最终写入进行中：写入按钮与返回按钮都禁用 */
    finalizing: boolean
    /** 审核结果与当前草稿内容已经对不上：必须重新审核 */
    reviewStale?: boolean
    /** 写入失败（如 409 已有记录/草稿过期）后需要先处理的阻塞原因 */
    blockedReason?: string
  }>(),
  { reviewStale: false, blockedReason: '' }
)

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
const reviewReady = computed(
  () =>
    canWrite.value &&
    !props.finalizing &&
    !props.reviewStale &&
    !props.blockedReason
)

const disabledReason = computed(() => {
  if (props.finalizing) return '正在写入，请稍候…'
  if (props.blockedReason) return props.blockedReason
  if (props.reviewStale) {
    return '草稿内容在校验后又变了，请返回重进最终审核，避免用旧结论写入'
  }
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

function readTextArray(record: UnknownRecord | null, key: string): string[] {
  const value = record?.[key]
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
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

/* ------------------------------------------------------------------ */
/* 功能就绪（按草稿意向估算）                                            */
/* ------------------------------------------------------------------ */

type ReadinessStatus = 'ready' | 'warn' | 'off'

interface ReadinessItem {
  key: string
  label: string
  status: ReadinessStatus
  detail: string
  /** 写入后由服务端核验什么（不是现在就绪的结论） */
  note: string
}

const READINESS_STATUS_TEXT: Record<ReadinessStatus, string> = {
  ready: '就绪',
  warn: '提醒',
  off: '未启用'
}

function readinessTagType(
  status: ReadinessStatus
): 'success' | 'warning' | 'info' {
  if (status === 'ready') return 'success'
  if (status === 'warn') return 'warning'
  return 'info'
}

const PHYSICAL_FORM_LABELS: Record<string, string> = {
  POWDER: '粉剂',
  TABLET: '片剂',
  CAPSULE: '胶囊',
  LIQUID: '液体'
}

const BASE_UNIT_BY_PHYSICAL_FORM: Record<string, string> = {
  POWDER: 'G',
  LIQUID: 'ML',
  TABLET: 'PCS',
  CAPSULE: 'PCS'
}

function isPositiveNumber(value: number | null): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isPositiveInteger(value: number | null): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function formLabel(value: string | null): string {
  return value ? PHYSICAL_FORM_LABELS[value] ?? value : '未选剂型'
}

/**
 * 功能就绪只是「按草稿意向估算」，不是后端结论：
 * - 组状态/成员数、上架体检、商城总开关都拿不到，统一标「写入后核验」；
 * - 没启用的功能显示「未启用」，不因为关闭就判失败。
 */
const readiness = computed<ReadinessItem[]>(() => {
  const payload = props.draft.payload
  const {
    basic,
    nutrition,
    retail,
    diy,
    procurement,
    equivalence,
    evidence
  } = payload
  const form = basic.physicalForm
  const formText = formLabel(form)
  const items: ReadinessItem[] = []

  // ① 商城上架：开关 / 保质期 / 液体 / 单位
  if (!retail.enabled) {
    const reason = retail.noSaleReason?.trim() ?? ''
    const reasonLabel = reason
      ? NO_SALE_REASON_LABELS.get(reason) ?? reason
      : ''
    items.push({
      key: 'retail',
      label: '商城上架',
      status: reason ? 'off' : 'warn',
      detail: reason
        ? `不上架（${reasonLabel}）`
        : '已关闭上架，但还没选不上架原因',
      note: '上架清单能否查到、开关是否一致、上架体检是否无阻断'
    })
  } else {
    const problems: string[] = []
    if (!isPositiveInteger(retail.shelfLifeMonths)) {
      problems.push('缺少有效的原厂保质期（月）')
    }
    if (!form) {
      problems.push('还没选物理形态')
    } else if (BASE_UNIT_BY_PHYSICAL_FORM[form] !== basic.baseUnit) {
      problems.push('基准单位与剂型不一致')
    }
    if (form === 'LIQUID') {
      problems.push(`${formText}补剂暂不支持分装，上架体检会拦`)
    }
    items.push({
      key: 'retail',
      label: '商城上架',
      status: problems.length > 0 ? 'warn' : 'ready',
      detail:
        problems.length > 0
          ? problems.join('；')
          : `上架开关已开，保质期 ${retail.shelfLifeMonths} 个月，单位 ${
              basic.unitDisplayLabel || basic.baseUnit
            }`,
      note: '上架体检、商城总开关与 readyToSell'
    })
  }

  // ② DIY：开关 / 链接 / 液体
  if (!diy.enabled) {
    items.push({
      key: 'diy',
      label: 'DIY 推荐',
      status: 'off',
      detail: '未开启 DIY',
      note: 'DIY 开关是否与草稿一致'
    })
  } else {
    const problems: string[] = []
    if (!diy.platform.trim() || !diy.linkUrl.trim()) {
      problems.push('缺少购买平台或购买链接')
    }
    if (form === 'LIQUID') {
      problems.push(`${formText}补剂暂不支持分装，DIY 制作单不会出现`)
    }
    items.push({
      key: 'diy',
      label: 'DIY 推荐',
      status: problems.length > 0 ? 'warn' : 'ready',
      detail:
        problems.length > 0
          ? problems.join('；')
          : `开关已开，${diy.platform} 购买链接已填`,
      note: 'DIY 推荐与购买链接是否可读'
    })
  }

  // ③ 生产采购：开关 / 采购口径
  if (!procurement.enabled) {
    items.push({
      key: 'procurement',
      label: '生产采购',
      status: 'off',
      detail: '未开启生产采购',
      note: '生产采购开关是否与草稿一致'
    })
  } else {
    const problems: string[] = []
    if (!basic.purchaseUnit.trim()) problems.push('缺少采购单位')
    if (!isPositiveNumber(basic.purchaseToBaseRatio)) {
      problems.push('换算倍数不可用')
    }
    if (!isPositiveNumber(basic.currentPricePerPurchaseUnit)) {
      problems.push('采购价不可用')
    }
    items.push({
      key: 'procurement',
      label: '生产采购',
      status: problems.length > 0 ? 'warn' : 'ready',
      detail:
        problems.length > 0
          ? problems.join('；')
          : `采购口径：${basic.purchaseUnit} × ${basic.purchaseToBaseRatio}，价格 ${
              basic.currentPricePerPurchaseUnit
            }`,
      note: '采购需求能否查到、单位/倍数/价格是否可用'
    })
  }

  // ④ 等价组：选中组 / 暂不归组 + 组状态只在写入后能核验
  const groupId = equivalence.groupId?.trim() ?? ''
  if (!groupId) {
    items.push({
      key: 'equivalence',
      label: '等价组',
      status: 'warn',
      detail: '还没选等价组，或明确选「暂不归组」',
      note: '组状态、成员数与浓度解析'
    })
  } else if (groupId === '__SKIP__') {
    items.push({
      key: 'equivalence',
      label: '等价组',
      status: 'warn',
      detail: '暂不归组：缺货时无法推荐同营养替代原料',
      note: '写入后确认未归组'
    })
  } else {
    const reapprove = equivalence.reapproveGroup !== false
    items.push({
      key: 'equivalence',
      label: '等价组',
      status: 'warn',
      detail: `已选等价组 ${groupId}；组状态/成员数无法在审核屏确认`,
      note: reapprove
        ? '加入已审核组会打回待审核，本次会一并审核通过；取消则留 DRAFT。写入后核验组状态/成员数/浓度'
        : '已取消一并审核：组会留在待审核（DRAFT），缺货替换暂不生效。写入后核验组状态/成员数/浓度'
    })
  }

  // ⑤ 默认目标
  const targets = nutrition.defaultTargetFields
    .map((field) => field.trim())
    .filter(Boolean)
  items.push({
    key: 'defaultTargets',
    label: '默认目标',
    status: targets.length > 0 ? 'ready' : 'warn',
    detail:
      targets.length > 0
        ? `默认目标：${targets.join('、')}`
        : '没有默认目标营养素，配方设计器不会推荐这条补剂',
    note: '配方设计器补剂候选能否查到'
  })

  // ⑥ 证据两图
  const missingEvidence: string[] = []
  if (!evidence.frontImageUrl.trim()) missingEvidence.push('正面图')
  if (!evidence.labelImageUrl.trim()) missingEvidence.push('标签图')
  items.push({
    key: 'evidence',
    label: '证据两图',
    status: missingEvidence.length > 0 ? 'warn' : 'ready',
    detail:
      missingEvidence.length > 0
        ? `缺少${missingEvidence.join('和')}，写入后证据不完整`
        : '商品正面图和标签图都已填',
    note: '证据表的图片/链接/标签原文'
  })

  return items
})

const readinessReadyCount = computed(
  () => readiness.value.filter((item) => item.status === 'ready').length
)
const readinessWarningCount = computed(
  () => readiness.value.filter((item) => item.status === 'warn').length
)

/** 写入后服务端会逐项核验的 7 件事（spec §9.2）。 */
const VERIFICATION_CHECKLIST = [
  {
    key: 'retail',
    label: '商城上架',
    detail: '上架清单能查到，开关一致，上架体检无阻断'
  },
  {
    key: 'recipe',
    label: '配方可选',
    detail: '营养档案 VERIFIED + 主映射 + 默认目标，配方设计器能推荐'
  },
  {
    key: 'diy',
    label: 'DIY 推荐',
    detail: '开关一致，购买链接可读，制作单能返回'
  },
  {
    key: 'procurement',
    label: '生产采购',
    detail: '开关一致，采购需求能查到，单位/倍数/价格可用'
  },
  {
    key: 'equivalence',
    label: '等价替换',
    detail: '组状态/成员/优先级符合草稿；应参与替换时浓度可解析'
  },
  {
    key: 'duplicate',
    label: '无重复',
    detail: '同名同品牌同规格只有一条'
  },
  {
    key: 'packaging',
    label: '包材匹配',
    detail: '能匹配到袋型规则；匹配不到只提醒，不改变写入结论'
  }
] as const

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

  const labelNames = readTextArray(effective, 'labelNames')
  const proposedLabelNames = readTextArray(proposed, 'labelNames')
  rows.push({
    key: 'labelNames',
    label: '标签名称',
    decision: labelNames.length > 0 ? labelNames.join('、') : '还没给',
    reason: 'AI 建议的标签名称，需要人工核对目录规范名',
    detail: '',
    proposed: sameStrings(labelNames, proposedLabelNames)
      ? ''
      : `AI 原始提议：${
          proposedLabelNames.length > 0
            ? proposedLabelNames.join('、')
            : '还没给'
        }`
  })

  const targetFields = readTextArray(effective, 'defaultTargetFields')
  const proposedTargetFields = readTextArray(proposed, 'defaultTargetFields')
  rows.push({
    key: 'defaultTargetFields',
    label: '默认目标营养素',
    decision: targetFields.length > 0 ? targetFields.join('、') : '还没给',
    reason: '配方设计器按这些营养素推荐补剂',
    detail: '',
    proposed: sameStrings(targetFields, proposedTargetFields)
      ? ''
      : `AI 原始提议：${
          proposedTargetFields.length > 0
            ? proposedTargetFields.join('、')
            : '还没给'
        }`
  })

  return rows
})

/* ------------------------------------------------------------------ */
/* AI 没找到的项                                                        */
/* ------------------------------------------------------------------ */

interface AiMissingRow {
  fieldPath: string
  label: string
  reason: string
  suggestion: string
}

/** 缺失项路径 → 编辑页字段名；营养素等子路径回退到父级字段。 */
function fieldLabelOf(path: string): string {
  const exact = fieldMapRows.find((row) => row.path === path)
  if (exact) return exact.label
  const prefix = fieldMapRows.find((row) => path.startsWith(`${row.path}.`))
  return prefix?.label ?? path
}

const aiMissingItems = computed<AiMissingRow[]>(() => {
  const missing = aiSnapshot.value?.missing
  if (!Array.isArray(missing)) return []
  const rows: AiMissingRow[] = []
  for (const item of missing) {
    const record = asRecord(item)
    if (!record) continue
    const fieldPath = readText(record, 'fieldPath')
    if (!fieldPath) continue
    rows.push({
      fieldPath,
      label: fieldLabelOf(fieldPath),
      reason: readText(record, 'reason'),
      suggestion: readText(record, 'suggestion')
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.draft-review__block-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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

.draft-review__readiness {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-review__readiness-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #f8fafc;
}

.draft-review__readiness-item[data-status='warn'] {
  border-color: #f5dab1;
  background: #fdf6ec;
}

.draft-review__readiness-item[data-status='off'] {
  background: #f4f4f5;
}

.draft-review__readiness-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.draft-review__readiness-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2733;
}

.draft-review__readiness-detail {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #1f2733;
  word-break: break-all;
}

.draft-review__readiness-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: #909399;
}

.draft-review__checklist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-review__checklist-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #eef1f5;
  border-radius: 8px;
}

.draft-review__checklist-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #1f2733;
}

.draft-review__checklist-detail {
  font-size: 11.5px;
  line-height: 1.6;
  color: #5b6470;
}

.draft-review__ai-missing {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-review__ai-missing-item {
  padding: 9px 11px;
  border: 1px solid #f5dab1;
  border-radius: 8px;
  background: #fdf6ec;
}

.draft-review__ai-missing-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.draft-review__ai-missing-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #1f2733;
}

.draft-review__ai-missing-path {
  padding: 1px 4px;
  border-radius: 4px;
  background: #eef1f5;
  font-size: 11.5px;
  color: #3b4654;
}

.draft-review__ai-missing-reason,
.draft-review__ai-missing-suggestion {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
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
  .draft-review__stats,
  .draft-review__readiness,
  .draft-review__checklist {
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
