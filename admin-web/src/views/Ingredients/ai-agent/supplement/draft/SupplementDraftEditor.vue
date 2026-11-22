<template>
  <section v-if="draft" class="draft-editor">
    <div v-if="conflict" class="draft-editor__conflict" data-conflict>
      <span class="draft-editor__conflict-text">
        {{ saveError || '草稿已被更新，需要重新加载服务端内容。' }}
      </span>
      <el-button
        size="small"
        type="primary"
        plain
        data-action="reload"
        @click="emit('reload')"
      >
        重新加载草稿
      </el-button>
    </div>

    <header class="draft-editor__top">
      <div class="draft-editor__top-main">
        <el-button
          text
          class="draft-editor__back"
          data-action="back"
          :disabled="formLocked"
          @click="emit('back')"
        >
          ← 返回草稿列表
        </el-button>
        <el-input
          v-model="draftName"
          class="draft-editor__name"
          placeholder="未命名补剂"
          maxlength="200"
          :disabled="formLocked || finalizing"
        />
      </div>

      <div class="draft-editor__top-side">
        <el-tag
          :type="saveStateTagType"
          size="small"
          effect="plain"
          :data-save-state="saveState"
          :title="saveState === 'failed' ? saveError : undefined"
        >
          {{ saveStateText }}
        </el-tag>
        <button
          type="button"
          class="draft-editor__completeness"
          data-action="open-completeness"
          @click="completenessOpen = true"
        >
          必填 {{ draft.completeness.filledRequired }}/{{
            draft.completeness.totalRequired
          }}
          <template v-if="missingRequiredRows.length > 0">
            · 还差 {{ missingRequiredRows.length }} 项
          </template>
        </button>

        <el-tooltip :content="aiHint" placement="bottom">
          <span class="draft-editor__ai-anchor">
            <el-button
              :disabled="!aiReady || formLocked || validating || finalizing || saving"
              :loading="aiRunning"
              data-action="run-ai"
              @click="emit('run-ai')"
            >
              让 AI 起草
            </el-button>
          </span>
        </el-tooltip>

        <el-button
          type="primary"
          :disabled="formLocked || saving || validating || finalizing"
          :loading="validating"
          data-action="review"
          @click="emit('review')"
        >
          最终审核
        </el-button>
      </div>
    </header>

    <div
      class="draft-editor__body"
      :class="{ 'draft-editor__body--locked': formLocked }"
      :aria-busy="formLocked"
      :inert="formLocked ? true : undefined"
    >
      <nav class="draft-editor__nav" aria-label="草稿区块">
        <button
          v-for="(item, index) in sections"
          :key="item.key"
          type="button"
          class="draft-editor__nav-item"
          :class="{
            'draft-editor__nav-item--active': activeSection === item.key
          }"
          :data-section="item.key"
          @click="activeSection = item.key"
        >
          <span class="draft-editor__nav-no">{{ index + 1 }}</span>
          <span class="draft-editor__nav-label">{{ item.label }}</span>
          <span
            v-if="missingBySection[item.key]"
            class="draft-editor__nav-badge draft-editor__nav-badge--missing"
            :title="`AI 没找到 ${missingBySection[item.key]} 项`"
          >
            缺{{ missingBySection[item.key] }}
          </span>
          <span
            v-if="requiredMissingBySection[item.key]"
            class="draft-editor__nav-badge draft-editor__nav-badge--required"
            :title="`还差 ${requiredMissingBySection[item.key]} 项必填`"
          >
            必填缺{{ requiredMissingBySection[item.key] }}
          </span>
          <span
            v-if="manualBySection[item.key]"
            class="draft-editor__nav-badge draft-editor__nav-badge--manual"
            :title="`${manualBySection[item.key]} 项人改，AI 不会覆盖`"
          >
            人改{{ manualBySection[item.key] }}
          </span>
        </button>
      </nav>

      <main class="draft-editor__content">
        <div class="draft-editor__section-head">
          <h3 class="draft-editor__section-title">{{ activeSectionLabel }}</h3>
          <span
            v-if="activeMissingCount > 0"
            class="draft-editor__section-badge draft-editor__section-badge--missing"
          >
            AI 没找到 {{ activeMissingCount }} 项
          </span>
          <span
            v-if="activeManualCount > 0"
            class="draft-editor__section-badge draft-editor__section-badge--manual"
          >
            人改 {{ activeManualCount }} 项
          </span>
          <span
            v-if="activeRequiredMissing.length > 0"
            class="draft-editor__section-badge draft-editor__section-badge--required"
          >
            还差：{{ activeRequiredMissing.map((item) => item.label).join('、') }}
          </span>
        </div>

        <BasicSection
          v-if="activeSection === 'basic'"
          v-model="draft.payload.basic"
          :ai-snapshot="aiSnapshot"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <NutritionSection
          v-else-if="activeSection === 'nutrition'"
          v-model="draft.payload.nutrition"
          :serving-units-per-dose="draft.payload.basic.servingUnitsPerDose"
          :unit-display-label="draft.payload.basic.unitDisplayLabel"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <LabelSection
          v-else-if="activeSection === 'label'"
          v-model="draft.payload.label"
          v-model:add-timing="draft.payload.basic.addTiming"
          :ai-snapshot="aiSnapshot"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <RetailSection
          v-else-if="activeSection === 'retail'"
          v-model="draft.payload.retail"
          :purchase-unit="draft.payload.basic.purchaseUnit"
          :purchase-to-base-ratio="draft.payload.basic.purchaseToBaseRatio"
          :current-price-per-purchase-unit="
            draft.payload.basic.currentPricePerPurchaseUnit
          "
          :unit-display-label="draft.payload.basic.unitDisplayLabel"
          :ai-snapshot="aiSnapshot"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <DiySection
          v-else-if="activeSection === 'diy'"
          v-model="draft.payload.diy"
          :ai-snapshot="aiSnapshot"
          :locked="formLocked"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <ProcurementSection
          v-else-if="activeSection === 'procurement'"
          v-model="draft.payload.procurement"
          :purchase-unit="draft.payload.basic.purchaseUnit"
          :purchase-to-base-ratio="draft.payload.basic.purchaseToBaseRatio"
          :current-price-per-purchase-unit="
            draft.payload.basic.currentPricePerPurchaseUnit
          "
          :unit-display-label="draft.payload.basic.unitDisplayLabel"
          :ai-snapshot="aiSnapshot"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <EquivalenceSection
          v-else-if="activeSection === 'equivalence'"
          v-model="draft.payload.equivalence"
          :draft-id="draft.id"
          :ai-snapshot="aiSnapshot"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />

        <EvidenceSection
          v-else
          v-model="draft.payload.evidence"
          :ai-snapshot="aiSnapshot"
          :locked="formLocked"
          :manual-fields="draft.manualFields"
          :mark-manual="markManual"
        />
      </main>

      <div
        v-if="formLocked"
        class="draft-editor__lock"
        data-ai-lock
        :data-lock-state="lockState"
      >
        <p class="draft-editor__lock-title">{{ lockTitle }}</p>
        <p class="draft-editor__lock-desc">{{ lockDescription }}</p>
      </div>
    </div>

    <footer class="draft-editor__footer">
      <button
        type="button"
        class="draft-editor__footer-status"
        :title="saveState === 'failed' ? saveError : undefined"
        data-action="open-completeness-footer"
        @click="completenessOpen = true"
      >
        {{ saveStateText }} · 必填
        {{ draft.completeness.filledRequired }}/{{ draft.completeness.totalRequired }}
        <template v-if="missingRequiredRows.length > 0">
          · 还差 {{ missingRequiredRows.length }} 项
        </template>
      </button>
      <div class="draft-editor__footer-actions">
        <el-button
          type="primary"
          :loading="saving"
          :disabled="formLocked || validating || finalizing"
          data-action="save"
          @click="emit('save')"
        >
          保存并离开
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="formLocked || saving || validating || finalizing"
          data-action="discard"
          @click="emit('discard')"
        >
          放弃草稿
        </el-button>
      </div>
    </footer>

    <el-dialog
      v-model="completenessOpen"
      title="必填项"
      width="560px"
      append-to-body
    >
      <p class="draft-completeness__summary">
        当前开关下必填 {{ draft.completeness.totalRequired }} 项，已填
        {{ draft.completeness.filledRequired }} 项。
      </p>

      <div v-if="missingRequiredRows.length > 0">
        <p class="draft-completeness__missing-title">
          还差 {{ missingRequiredRows.length }} 项：
        </p>
        <ul class="draft-completeness__list">
          <li
            v-for="item in missingRequiredRows"
            :key="item.key"
            class="draft-completeness__item"
          >
            <span>{{ item.label }}</span>
            <el-button
              text
              type="primary"
              size="small"
              :data-action="`completeness-go-${item.key}`"
              @click="goToRequired(item.section)"
            >
              去补
            </el-button>
          </li>
        </ul>
      </div>
      <p v-else class="draft-completeness__done">
        当前开关下的必填项已经填完。
      </p>

      <p class="draft-completeness__hint">
        必填项会随「上架 / DIY」开关变化；这里只列当前需要、但还没填的。
      </p>
    </el-dialog>
  </section>

  <section v-else class="draft-editor draft-editor--loading">
    <el-skeleton :rows="6" animated />
    <p class="draft-editor__loading-tip">正在加载草稿…</p>
  </section>
</template>

<script setup lang="ts">
/**
 * 补剂草稿编辑页外壳（spec §10.2）。
 *
 * 只负责布局和转交：顶部名称/保存状态/AI/最终审核，左侧 8 个区块导航，
 * 中间渲染当前区块，底部保存并离开/放弃草稿。真正的接口动作都在
 * `SupplementDraftFlow` 里，编辑页不直接调 API，也不自己存草稿。
 *
 * 名称与区块内容都直接改父级传进来的 draft 对象——父级的 composable 有
 * deep watcher 做自动保存，所以这里不需要「每个字段一个保存事件」。
 */
import { computed, nextTick, ref } from 'vue'
import type {
  SupplementDraftAiSnapshot,
  SupplementDraftView
} from '@/api/supplementDrafts'
import BasicSection from './sections/BasicSection.vue'
import NutritionSection from './sections/NutritionSection.vue'
import LabelSection from './sections/LabelSection.vue'
import RetailSection from './sections/RetailSection.vue'
import DiySection from './sections/DiySection.vue'
import ProcurementSection from './sections/ProcurementSection.vue'
import EquivalenceSection from './sections/EquivalenceSection.vue'
import EvidenceSection from './sections/EvidenceSection.vue'
import {
  requiredMissingRows,
  type DraftSectionKey
} from './requiredFields'
import { stillMissingPaths } from './draftMissing'

const props = defineProps<{
  draft: SupplementDraftView | null
  saving: boolean
  aiRunning: boolean
  validating: boolean
  finalizing: boolean
  /** 有还没存到服务端的改动；决定顶部显示「未保存」而不是「已保存」 */
  dirty: boolean
  /** 保存失败的中文原因；为空表示最近一次保存没有失败 */
  saveError: string
  /** 上一次保存是 409 冲突：显示「重新加载草稿」入口 */
  conflict?: boolean
  /** AI 差异弹窗打开等场景：锁住整个表单，避免绕过遮罩改字段 */
  locked?: boolean
  /** 人改标记入口（由父级 composable 的 markManual 提供） */
  markManual?: (path: string) => void
}>()

const emit = defineEmits<{
  (event: 'save'): void
  (event: 'run-ai'): void
  (event: 'review'): void
  (event: 'back'): void
  (event: 'discard'): void
  (event: 'reload'): void
}>()

/** 传给各区块的人改入口；父级没提供时安全地什么都不做。 */
function markManual(path: string): void {
  props.markManual?.(path)
}

type SectionKey = DraftSectionKey

interface SectionDef {
  key: SectionKey
  label: string
}

/** 8 个区块的顺序与名称（spec §4.3）。 */
const sections: SectionDef[] = [
  { key: 'basic', label: '商品与基本信息' },
  { key: 'nutrition', label: '营养档案' },
  { key: 'label', label: '标签与合规' },
  { key: 'retail', label: '上架与商城' },
  { key: 'diy', label: 'DIY 推荐' },
  { key: 'procurement', label: '生产采购' },
  { key: 'equivalence', label: '等价组' },
  { key: 'evidence', label: '证据与来源' }
]

const activeSection = ref<SectionKey>('basic')
const completenessOpen = ref(false)

const missingRequiredRows = computed(() =>
  requiredMissingRows(props.draft?.completeness.missing ?? [])
)

const requiredMissingBySection = computed<Record<SectionKey, number>>(() => {
  const counts: Record<SectionKey, number> = {
    basic: 0,
    nutrition: 0,
    label: 0,
    retail: 0,
    diy: 0,
    procurement: 0,
    equivalence: 0,
    evidence: 0
  }
  for (const item of missingRequiredRows.value) {
    counts[item.section] += 1
  }
  return counts
})

const activeRequiredMissing = computed(() =>
  missingRequiredRows.value.filter((item) => item.section === activeSection.value)
)

const activeSectionLabel = computed(
  () => sections.find((item) => item.key === activeSection.value)?.label ?? ''
)

const aiSnapshot = computed<SupplementDraftAiSnapshot | null>(
  () => props.draft?.aiSnapshot ?? null
)

/**
 * 表单锁定：AI 起草、差异弹窗、最终校验、最终写入期间都不能改草稿。
 *
 * 校验后如果还能改，审核屏拿到的 blockers/warnings 会立刻过期；写入期间更
 * 不能让本地值再变。锁定优先顺序与遮罩文案保持一致。
 */
const formLocked = computed(
  () =>
    props.aiRunning ||
    props.locked === true ||
    props.validating ||
    props.finalizing
)

const lockState = computed(() => {
  if (props.finalizing) return 'finalizing'
  if (props.validating) return 'validating'
  if (props.aiRunning) return 'ai'
  return 'diff'
})

const lockTitle = computed(() => {
  if (props.finalizing) return '正在写入正式数据…'
  if (props.validating) return '正在校验草稿…'
  if (props.aiRunning) return 'AI 正在读图起草…'
  return '请先处理 AI 差异'
})

const lockDescription = computed(() => {
  if (props.finalizing) {
    return '写入在一个事务里完成，期间表单锁定；请不要关闭页面。'
  }
  if (props.validating) {
    return '校验期间表单锁定，避免审核结果和草稿内容对不上。请稍候。'
  }
  if (props.aiRunning) {
    return '起草期间表单锁定，避免 AI 结果覆盖你正在改的内容。请稍候。'
  }
  return '差异弹窗关闭前不能编辑草稿；请选择「采用所选」或「保留我的」。'
})

/** 点路径 → 编辑页区块；只认 payload 里的业务区块。 */
function goToRequired(section: DraftSectionKey): void {
  activeSection.value = section
  completenessOpen.value = false
  void nextTick(() => {
    document
      .querySelector('.draft-editor__content')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
}

function sectionOfPath(path: string): SectionKey | null {
  // 添加时机虽然存在 basic 里，但编辑入口在「标签与合规」，角标跟着入口走。
  if (path === 'basic.addTiming') return 'label'
  const key = path.split('.')[0]
  switch (key) {
    case 'basic':
    case 'nutrition':
    case 'label':
    case 'retail':
    case 'diy':
    case 'procurement':
    case 'equivalence':
    case 'evidence':
      return key
    default:
      return null
  }
}

function countBySection(paths: readonly string[]): Record<SectionKey, number> {
  const counts: Record<SectionKey, number> = {
    basic: 0,
    nutrition: 0,
    label: 0,
    retail: 0,
    diy: 0,
    procurement: 0,
    equivalence: 0,
    evidence: 0
  }
  for (const path of paths) {
    const key = sectionOfPath(path)
    if (key) counts[key] += 1
  }
  return counts
}

/**
 * AI 自己说没找到、且**现在还是空的**字段，按区块计数（导航角标）。
 * 人把那一项补上后角标就消失，不会一直挂着「缺 N」。
 */
const missingBySection = computed<Record<SectionKey, number>>(() =>
  countBySection(
    stillMissingPaths(props.draft?.payload, props.draft?.aiSnapshot?.missing)
  )
)

/** 人改过的字段，按区块计数（导航角标）。 */
const manualBySection = computed<Record<SectionKey, number>>(() =>
  countBySection(props.draft?.manualFields ?? [])
)

const activeMissingCount = computed(
  () => missingBySection.value[activeSection.value]
)
const activeManualCount = computed(
  () => manualBySection.value[activeSection.value]
)

/** 草稿名可改；空名先存着，AI 起草/最终审核前再补。 */
const draftName = computed({
  get: () => props.draft?.name ?? '',
  set: (value: string) => {
    if (!props.draft) return
    props.draft.name = value
    // 草稿名与原料名保持同步，并记成人改：AI 重跑时不能把名字覆盖回去。
    props.draft.payload.basic.name = value
    props.markManual?.('basic.name')
  }
})

/** 两张图都在才让 AI 起草；缺一张时按钮禁用并用 tooltip 说清楚缺什么。 */
const aiReady = computed(() => {
  const evidence = props.draft?.payload.evidence
  if (!evidence) return false
  return (
    evidence.frontImageUrl.trim().length > 0 &&
    evidence.labelImageUrl.trim().length > 0
  )
})

const aiHint = computed(() =>
  aiReady.value
    ? 'AI 会读正面图和标签图，重填草稿里没被人改过的字段；改过的字段留给你决定'
    : '先到「证据与来源」上传商品正面图和标签图，才能让 AI 起草'
)

type SaveState = 'saving' | 'failed' | 'unsaved' | 'saved'

const SAVE_STATE_TEXT: Record<SaveState, string> = {
  saving: '保存中…',
  failed: '保存失败',
  unsaved: '未保存',
  saved: '已保存'
}

const SAVE_STATE_TAG: Record<
  SaveState,
  'info' | 'danger' | 'warning' | 'success'
> = {
  saving: 'info',
  failed: 'danger',
  unsaved: 'warning',
  saved: 'success'
}

/**
 * 真实保存状态：防抖期间是「未保存」，保存失败是「保存失败」，
 * 只有服务端确认过（load/save 成功）才是「已保存」。
 */
const saveState = computed<SaveState>(() => {
  if (props.saving) return 'saving'
  if (props.saveError.trim()) return 'failed'
  if (props.dirty) return 'unsaved'
  return 'saved'
})

const saveStateText = computed(() => SAVE_STATE_TEXT[saveState.value])
const saveStateTagType = computed(() => SAVE_STATE_TAG[saveState.value])
</script>

<style scoped>
.draft-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.draft-editor--loading {
  padding: 24px;
}

.draft-editor__loading-tip {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: #98a1ad;
  text-align: center;
}

.draft-editor__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid #eceff3;
  border-radius: 10px;
  background: #fff;
}

.draft-editor__top-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 280px;
  flex: 1;
}

.draft-editor__back {
  flex: none;
}

.draft-editor__name {
  max-width: 360px;
}

.draft-editor__top-side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.draft-editor__completeness {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  font-size: 12px;
  color: #6b7482;
  font-variant-numeric: tabular-nums;
}

.draft-editor__ai-anchor {
  display: inline-flex;
}

.draft-editor__conflict {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid #f3d19e;
  border-radius: 10px;
  background: #fdf6ec;
}

.draft-editor__conflict-text {
  font-size: 12.5px;
  line-height: 1.6;
  color: #9a5b00;
}

.draft-editor__body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  position: relative;
}

.draft-editor__body--locked .draft-editor__nav,
.draft-editor__body--locked .draft-editor__content {
  pointer-events: none;
  opacity: 0.55;
}

.draft-editor__lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  z-index: 3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(1.5px);
}

.draft-editor__lock-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: #3370ff;
}

.draft-editor__lock-desc {
  margin: 0;
  font-size: 12.5px;
  color: #5b6470;
}

.draft-editor__nav {
  flex: none;
  width: 172px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid #eceff3;
  border-radius: 10px;
  background: #fff;
  position: sticky;
  top: 12px;
}

.draft-editor__nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #5b6470;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.draft-editor__nav-item:hover {
  background: #f5f7fa;
}

.draft-editor__nav-item--active {
  border-color: #d9e6ff;
  background: #eef4ff;
  color: #3370ff;
  font-weight: 600;
}

.draft-editor__nav-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #eef0f3;
  font-size: 11px;
}

.draft-editor__nav-item--active .draft-editor__nav-no {
  background: #3370ff;
  color: #fff;
}

.draft-editor__nav-label {
  line-height: 1.4;
  flex: 1;
}

.draft-editor__nav-badge {
  flex: none;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.draft-editor__nav-badge--missing {
  background: #fff1f0;
  color: #cf1322;
}

.draft-editor__nav-badge--manual {
  background: #fff4e5;
  color: #c46a00;
}

.draft-editor__content {
  flex: 1;
  min-width: 0;
}

.draft-editor__section-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
}

.draft-editor__section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2733;
}

.draft-editor__section-badge {
  padding: 0 7px;
  border-radius: 9px;
  font-size: 11px;
  line-height: 18px;
}

.draft-editor__section-badge--missing {
  background: #fff1f0;
  color: #cf1322;
}

.draft-editor__section-badge--required {
  background: #fef3f2;
  color: #b42318;
}

.draft-editor__nav-badge--required {
  background: #fef3f2;
  color: #b42318;
}

.draft-completeness__summary {
  margin: 0 0 12px;
  color: #38414d;
}

.draft-completeness__missing-title {
  margin: 0 0 8px;
  color: #b42318;
  font-weight: 600;
}

.draft-completeness__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid #eceff3;
  border-radius: 8px;
}

.draft-completeness__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #f2f4f7;
}

.draft-completeness__item:last-child {
  border-bottom: 0;
}

.draft-completeness__done {
  margin: 0;
  color: #067647;
}

.draft-completeness__hint {
  margin: 14px 0 0;
  color: #98a1ad;
  font-size: 12px;
  line-height: 1.6;
}

.draft-editor__section-badge--manual {
  background: #fff4e5;
  color: #c46a00;
}

.draft-editor__placeholder {
  padding: 36px 24px;
  border: 1px dashed #e3e7ed;
  border-radius: 10px;
  background: #fafbfc;
  text-align: center;
}

.draft-editor__placeholder-title {
  margin: 0 0 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: #5b6470;
}

.draft-editor__placeholder-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #98a1ad;
}

.draft-editor__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid #eceff3;
  border-radius: 10px;
  background: #fff;
  position: sticky;
  bottom: 0;
}

.draft-editor__footer-status {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  font-size: 12px;
  color: #8a93a0;
  font-variant-numeric: tabular-nums;
}

.draft-editor__footer-actions {
  display: flex;
  gap: 8px;
}
</style>
