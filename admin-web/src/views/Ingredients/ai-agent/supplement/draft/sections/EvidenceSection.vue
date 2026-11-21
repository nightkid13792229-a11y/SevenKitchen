<template>
  <section class="draft-section">
    <div class="draft-section__group">
      <h4 class="draft-section__title">读图证据</h4>
      <p class="draft-field__hint" style="margin: 0 0 12px">
        两张图都上传后，顶部「让 AI 起草」才能用。图片只用于读字与留档，不会自动改变其他字段。
      </p>
      <div class="draft-section__grid">
        <div class="draft-evidence__slot-wrap">
          <span class="draft-field__label">
            <span>商品正面图</span>
            <AiFieldTag :tag="aiTag('evidence.frontImageUrl')" />
            <span
              v-if="isManual('evidence.frontImageUrl')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <div
            class="draft-evidence__slot"
            :class="{ 'draft-evidence__slot--filled': evidence.frontImageUrl }"
            @dragover.prevent
            @drop.prevent="(event: DragEvent) => onDrop('front', event)"
          >
            <img
              v-if="evidence.frontImageUrl"
              :src="evidence.frontImageUrl"
              alt="商品正面图"
              class="draft-evidence__image"
            />
            <span v-else class="draft-evidence__empty">
              上传、拖入或 ⌘V 粘贴商品正面图
            </span>
          </div>
          <div class="draft-section__row">
            <input
              ref="frontInput"
              type="file"
              accept="image/*"
              hidden
              @change="(event: Event) => onFileChange('front', event)"
            />
            <el-button
              size="small"
              :loading="uploadingFront"
              :disabled="locked"
              data-action="evidence-upload-front"
              @click="pick('front')"
            >
              {{ evidence.frontImageUrl ? '替换正面图' : '上传正面图' }}
            </el-button>
            <el-button
              v-if="evidence.frontImageUrl"
              text
              size="small"
              type="danger"
              :disabled="locked"
              data-action="evidence-clear-front"
              @click="clearImage('front')"
            >
              移除
            </el-button>
          </div>
          <em v-if="!evidence.frontImageUrl && missingReason('evidence.frontImageUrl')" class="draft-field__missing" :title="missingReason('evidence.frontImageUrl')">
            AI 没找到，请补
          </em>
          <em v-if="uploadErrors.front" class="draft-field__warn">
            {{ uploadErrors.front }}
          </em>
        </div>

        <div class="draft-evidence__slot-wrap">
          <span class="draft-field__label">
            <span>标签图</span>
            <AiFieldTag :tag="aiTag('evidence.labelImageUrl')" />
            <span
              v-if="isManual('evidence.labelImageUrl')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <div
            class="draft-evidence__slot"
            :class="{ 'draft-evidence__slot--filled': evidence.labelImageUrl }"
            @dragover.prevent
            @drop.prevent="(event: DragEvent) => onDrop('label', event)"
          >
            <img
              v-if="evidence.labelImageUrl"
              :src="evidence.labelImageUrl"
              alt="标签图"
              class="draft-evidence__image"
            />
            <span v-else class="draft-evidence__empty">
              上传、拖入或 ⌘V 粘贴标签图
            </span>
          </div>
          <div class="draft-section__row">
            <input
              ref="labelInput"
              type="file"
              accept="image/*"
              hidden
              @change="(event: Event) => onFileChange('label', event)"
            />
            <el-button
              size="small"
              :loading="uploadingLabel"
              :disabled="locked"
              data-action="evidence-upload-label"
              @click="pick('label')"
            >
              {{ evidence.labelImageUrl ? '替换标签图' : '上传标签图' }}
            </el-button>
            <el-button
              v-if="evidence.labelImageUrl"
              text
              size="small"
              type="danger"
              :disabled="locked"
              data-action="evidence-clear-label"
              @click="clearImage('label')"
            >
              移除
            </el-button>
          </div>
          <em v-if="!evidence.labelImageUrl && missingReason('evidence.labelImageUrl')" class="draft-field__missing" :title="missingReason('evidence.labelImageUrl')">
            AI 没找到，请补
          </em>
          <em v-if="uploadErrors.label" class="draft-field__warn">
            {{ uploadErrors.label }}
          </em>
        </div>
      </div>

      <el-alert
        v-if="!evidence.frontImageUrl || !evidence.labelImageUrl"
        type="info"
        :closable="false"
        show-icon
        class="draft-section__alert"
        :title="
          !evidence.frontImageUrl && !evidence.labelImageUrl
            ? '还缺商品正面图和标签图，补齐后可以让 AI 起草。'
            : !evidence.frontImageUrl
              ? '还缺商品正面图，补齐后可以让 AI 起草。'
              : '还缺标签图，补齐后可以让 AI 起草。'
        "
      />
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">来源与选品依据</h4>
      <div class="draft-section__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>商品链接</span>
            <AiFieldTag :tag="aiTag('evidence.productUrl')" />
            <span
              v-if="isManual('evidence.productUrl')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input
            :model-value="evidence.productUrl"
            placeholder="商品详情页链接（≤500 字）"
            maxlength="500"
            @update:model-value="(value: string) => update('productUrl', value)"
          />
          <em v-if="!evidence.productUrl.trim() && missingReason('evidence.productUrl')" class="draft-field__missing" :title="missingReason('evidence.productUrl')">
            AI 没找到，请补
          </em>
          <em class="draft-field__hint">
            商品链接只在这一处维护；DIY 的购买链接在「DIY 推荐」里单独填。
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>选品依据</span>
            <AiFieldTag :tag="aiTag('evidence.selectionNote')" />
            <span
              v-if="isManual('evidence.selectionNote')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input
            :model-value="evidence.selectionNote"
            type="textarea"
            :rows="4"
            placeholder="从选品 Skill 粘过来：形态结论、比价、选中商品与单价"
            @update:model-value="(value: string) => update('selectionNote', value)"
          />
          <em class="draft-field__hint">
            原样存进标签证据的选品快照，AI 不覆盖。
          </em>
        </label>
      </div>
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">AI 没找到 / 决策理由</h4>
      <template v-if="aiSnapshot">
        <div v-if="missingItems.length > 0" class="draft-section__list">
          <p class="draft-evidence__sub-title">AI 没找到的字段（{{ missingItems.length }} 项）</p>
          <div
            v-for="item in missingItems"
            :key="item.fieldPath"
            class="draft-evidence__reason-row"
          >
            <code class="draft-evidence__path">{{ item.fieldPath }}</code>
            <span class="draft-evidence__reason">{{ item.reason || 'AI 没有给出原因' }}</span>
          </div>
        </div>
        <p v-else class="draft-section__readonly">AI 没有报告缺失字段。</p>

        <div v-if="decisionRows.length > 0" class="draft-section__list" style="margin-top: 12px">
          <p class="draft-evidence__sub-title">AI 决策理由</p>
          <div
            v-for="row in decisionRows"
            :key="row.label"
            class="draft-evidence__reason-row"
          >
            <span class="draft-evidence__decision">{{ row.label }}：{{ row.value }}</span>
            <span class="draft-evidence__reason">{{ row.reason || '没有给出理由' }}</span>
          </div>
        </div>
      </template>
      <p v-else class="draft-section__empty">
        还没有 AI 结果。上传两张图后点「让 AI 起草」，这里会列出它没找到的字段和每个决定的理由。
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ⑧ 证据与来源（spec §12.8）。
 *
 * 图片上传复用 `ingredientApi.uploadIngredientDiyImage`（同一套腾讯 COS 接口，
 * 不新增后端端点）。AI 只读这两张图，不负责写它们；人上传/粘贴/移除图片都算
 * 人改，要记进 `manualFields`。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientApi } from '@/api/ingredients'
import type {
  SupplementDraftAiSnapshot,
  SupplementDraftEvidence
} from '@/api/supplementDrafts'
import { isManualDraftPath } from '../supplementDraftState'
import AiFieldTag from './AiFieldTag.vue'
import { aiFieldTag, aiMissingReason } from './aiFieldMeta'

const props = defineProps<{
  /** AI 起草快照：展示 missing 与决策理由 */
  aiSnapshot?: SupplementDraftAiSnapshot | null
  /** AI 起草中或差异弹窗打开：窗口级粘贴/拖入也要拒绝，不能只靠遮罩 */
  locked?: boolean
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const evidence = defineModel<SupplementDraftEvidence>({ required: true })

type Slot = 'front' | 'label'

const frontInput = ref<HTMLInputElement | null>(null)
const labelInput = ref<HTMLInputElement | null>(null)
const activeSlot = ref<Slot | null>(null)
const uploadingFront = ref(false)
const uploadingLabel = ref(false)
const uploadErrors = ref<{ front: string; label: string }>({
  front: '',
  label: ''
})

interface MissingItem {
  fieldPath: string
  reason: string
}

interface DecisionRow {
  label: string
  value: string
  reason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const missingItems = computed<MissingItem[]>(() => {
  const list = props.aiSnapshot?.missing
  if (!Array.isArray(list)) return []
  const items: MissingItem[] = []
  for (const raw of list) {
    if (!isRecord(raw)) continue
    const fieldPath =
      typeof raw.fieldPath === 'string' ? raw.fieldPath.trim() : ''
    if (!fieldPath) continue
    items.push({
      fieldPath,
      reason: typeof raw.reason === 'string' ? raw.reason : ''
    })
  }
  return items
})

function decisionReason(raw: unknown): string {
  if (!isRecord(raw)) return ''
  return typeof raw.reason === 'string' ? raw.reason : ''
}

/** 把 AI 决策翻成「决定 + 理由」，只列人看得懂、能核对的几项。 */
const decisionRows = computed<DecisionRow[]>(() => {
  const decisions = props.aiSnapshot?.decisions
  if (!isRecord(decisions)) return []
  const rows: DecisionRow[] = []

  const recommendCreate = decisions.recommendCreate
  if (isRecord(recommendCreate) && typeof recommendCreate.value === 'boolean') {
    rows.push({
      label: '是否建议建档',
      value: recommendCreate.value ? '建议建档' : 'AI 建议不建档',
      reason: decisionReason(recommendCreate)
    })
  }

  const retail = decisions.retail
  if (isRecord(retail) && typeof retail.enabled === 'boolean') {
    rows.push({
      label: '商城上架',
      value: retail.enabled ? '建议上架' : '建议不上架',
      reason: decisionReason(retail)
    })
  }

  const diy = decisions.diy
  if (isRecord(diy) && typeof diy.enabled === 'boolean') {
    rows.push({
      label: 'DIY',
      value: diy.enabled ? '建议用于 DIY' : '不建议用于 DIY',
      reason: decisionReason(diy)
    })
  }

  const procurement = decisions.procurement
  if (isRecord(procurement) && typeof procurement.enabled === 'boolean') {
    rows.push({
      label: '生产采购',
      value: procurement.enabled ? '建议用于生产/采购' : '不建议用于生产',
      reason: decisionReason(procurement)
    })
  }

  const equivalence = decisions.equivalence
  if (isRecord(equivalence)) {
    const groupId =
      typeof equivalence.groupId === 'string' ? equivalence.groupId : ''
    rows.push({
      label: '等价组',
      value: groupId ? `建议归入 ${groupId}` : '建议暂不归组',
      reason: decisionReason(equivalence)
    })
  }

  return rows.filter((row) => row.reason.trim() || row.value)
})

function isManual(path: string): boolean {
  return isManualDraftPath(path, props.manualFields ?? [])
}

const aiTag = (path: string) => aiFieldTag(props.aiSnapshot, path)
const missingReason = (path: string) => aiMissingReason(props.aiSnapshot, path)

function update<K extends keyof SupplementDraftEvidence>(
  key: K,
  value: SupplementDraftEvidence[K]
): void {
  props.markManual?.(`evidence.${String(key)}`)
  evidence.value[key] = value
}

function pick(slot: Slot): void {
  if (props.locked) return
  activeSlot.value = slot
  if (slot === 'front') {
    frontInput.value?.click()
  } else {
    labelInput.value?.click()
  }
}

interface UploadedImage {
  url?: string
  data?: { url?: string }
}

async function uploadImage(file: File): Promise<string> {
  const response = (await ingredientApi.uploadIngredientDiyImage(
    file
  )) as unknown as UploadedImage
  return response.url ?? response.data?.url ?? ''
}

function setImage(slot: Slot, url: string): void {
  if (slot === 'front') {
    update('frontImageUrl', url)
  } else {
    update('labelImageUrl', url)
  }
}

async function acceptImage(slot: Slot, file: File): Promise<void> {
  if (props.locked) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('这不是图片文件')
    return
  }
  if (slot === 'front') {
    uploadingFront.value = true
  } else {
    uploadingLabel.value = true
  }
  uploadErrors.value[slot] = ''
  try {
    const url = await uploadImage(file)
    if (!url) throw new Error('no url')
    setImage(slot, url)
  } catch {
    uploadErrors.value[slot] = '这张图没传上去，重试一次'
  } finally {
    if (slot === 'front') {
      uploadingFront.value = false
    } else {
      uploadingLabel.value = false
    }
  }
}

async function onFileChange(slot: Slot, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    activeSlot.value = slot
    await acceptImage(slot, file)
  }
}

async function onDrop(slot: Slot, event: DragEvent): Promise<void> {
  if (props.locked) return
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    activeSlot.value = slot
    await acceptImage(slot, file)
  }
}

function clearImage(slot: Slot): void {
  if (props.locked) return
  setImage(slot, '')
}

/** 粘贴时贴到哪一格：刚点过的那格 → 空的正面 → 空的标签 → 正面。 */
function pasteTarget(): Slot {
  if (activeSlot.value) return activeSlot.value
  if (!evidence.value.frontImageUrl) return 'front'
  if (!evidence.value.labelImageUrl) return 'label'
  return 'front'
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  if (props.locked) return
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    return
  }
  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  )
  const file = imageItem?.getAsFile()
  if (!file) return
  event.preventDefault()
  await acceptImage(pasteTarget(), file)
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
})
</script>

<style scoped src="./draftSection.css"></style>

<style scoped>
.draft-section__alert {
  margin-top: 12px;
}

.draft-evidence__slot-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.draft-evidence__slot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 190px;
  border: 1px dashed #d9dee5;
  border-radius: 10px;
  background: #fafbfc;
  overflow: hidden;
}

.draft-evidence__slot--filled {
  border-style: solid;
}

.draft-evidence__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
}

.draft-evidence__empty {
  padding: 16px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #98a1ad;
  text-align: center;
}

.draft-evidence__sub-title {
  margin: 0 0 2px;
  font-size: 12.5px;
  font-weight: 600;
  color: #5b6470;
}

.draft-evidence__reason-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #f0f2f5;
  border-radius: 8px;
  background: #fafbfc;
  font-size: 12px;
  line-height: 1.6;
}

.draft-evidence__path {
  flex: none;
  padding: 0 6px;
  border-radius: 6px;
  background: #eef4ff;
  color: #3370ff;
  font-size: 11.5px;
}

.draft-evidence__decision {
  flex: none;
  font-weight: 600;
  color: #38414d;
}

.draft-evidence__reason {
  color: #5b6470;
}
</style>
