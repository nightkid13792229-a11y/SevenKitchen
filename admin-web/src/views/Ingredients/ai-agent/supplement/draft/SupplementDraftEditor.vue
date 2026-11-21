<template>
  <section v-if="draft" class="draft-editor">
    <header class="draft-editor__top">
      <div class="draft-editor__top-main">
        <el-button
          text
          class="draft-editor__back"
          data-action="back"
          @click="emit('back')"
        >
          ← 返回草稿列表
        </el-button>
        <el-input
          v-model="draftName"
          class="draft-editor__name"
          placeholder="未命名补剂"
          maxlength="200"
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
        <span class="draft-editor__completeness">
          必填 {{ draft.completeness.filledRequired }}/{{
            draft.completeness.totalRequired
          }}
        </span>

        <el-tooltip :content="aiHint" placement="bottom">
          <span class="draft-editor__ai-anchor">
            <el-button
              :disabled="!aiReady || aiRunning || validating || finalizing || saving"
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
          :disabled="saving || aiRunning || validating || finalizing"
          :loading="validating"
          data-action="review"
          @click="emit('review')"
        >
          最终审核
        </el-button>
      </div>
    </header>

    <div class="draft-editor__body">
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
        </button>
      </nav>

      <main class="draft-editor__content">
        <h3 class="draft-editor__section-title">{{ activeSectionLabel }}</h3>

        <BasicSection
          v-if="activeSection === 'basic'"
          v-model="draft.payload.basic"
          :ai-snapshot="aiSnapshot"
        />

        <NutritionSection
          v-else-if="activeSection === 'nutrition'"
          v-model="draft.payload.nutrition"
          :serving-units-per-dose="draft.payload.basic.servingUnitsPerDose"
          :unit-display-label="draft.payload.basic.unitDisplayLabel"
        />

        <section v-else class="draft-editor__placeholder">
          <p class="draft-editor__placeholder-title">
            「{{ activeSectionLabel }}」的填写项还没接入
          </p>
          <p class="draft-editor__placeholder-desc">
            AI 起草出来的内容已经先保存在草稿里。这个区块的表格会在下一步补齐；
            现在可以先填「商品与基本信息」和「营养档案」。
          </p>
        </section>
      </main>
    </div>

    <footer class="draft-editor__footer">
      <span
        class="draft-editor__footer-status"
        :title="saveState === 'failed' ? saveError : undefined"
      >
        {{ saveStateText }} · 必填
        {{ draft.completeness.filledRequired }}/{{ draft.completeness.totalRequired }}
      </span>
      <div class="draft-editor__footer-actions">
        <el-button
          type="primary"
          :loading="saving"
          :disabled="aiRunning || validating || finalizing"
          data-action="save"
          @click="emit('save')"
        >
          保存并离开
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="saving || aiRunning || validating || finalizing"
          data-action="discard"
          @click="emit('discard')"
        >
          放弃草稿
        </el-button>
      </div>
    </footer>
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
import { computed, ref } from 'vue'
import type {
  SupplementDraftAiSnapshot,
  SupplementDraftView
} from '@/api/supplementDrafts'
import BasicSection from './sections/BasicSection.vue'
import NutritionSection from './sections/NutritionSection.vue'

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
}>()

const emit = defineEmits<{
  (event: 'save'): void
  (event: 'run-ai'): void
  (event: 'review'): void
  (event: 'back'): void
  (event: 'discard'): void
}>()

type SectionKey =
  | 'basic'
  | 'nutrition'
  | 'label'
  | 'retail'
  | 'diy'
  | 'procurement'
  | 'equivalence'
  | 'evidence'

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

const activeSectionLabel = computed(
  () => sections.find((item) => item.key === activeSection.value)?.label ?? ''
)

const aiSnapshot = computed<SupplementDraftAiSnapshot | null>(
  () => props.draft?.aiSnapshot ?? null
)

/** 草稿名可改；空名先存着，AI 起草/最终审核前再补。 */
const draftName = computed({
  get: () => props.draft?.name ?? '',
  set: (value: string) => {
    if (props.draft) {
      props.draft.name = value
    }
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
  font-size: 12px;
  color: #6b7482;
  font-variant-numeric: tabular-nums;
}

.draft-editor__ai-anchor {
  display: inline-flex;
}

.draft-editor__body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
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
}

.draft-editor__content {
  flex: 1;
  min-width: 0;
}

.draft-editor__section-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2733;
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
  font-size: 12px;
  color: #8a93a0;
  font-variant-numeric: tabular-nums;
}

.draft-editor__footer-actions {
  display: flex;
  gap: 8px;
}
</style>
