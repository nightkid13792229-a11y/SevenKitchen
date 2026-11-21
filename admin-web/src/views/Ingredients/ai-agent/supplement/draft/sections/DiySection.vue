<template>
  <section class="draft-section">
    <div class="draft-section__group">
      <h4 class="draft-section__title">DIY 推荐意向</h4>
      <div class="draft-section__row">
        <span class="draft-field__label">
          <span>是否用于 DIY</span>
          <AiFieldTag :tag="aiTag('diy.enabled')" />
          <span
            v-if="isManual('diy.enabled')"
            class="draft-field__manual"
            title="你手动改过，AI 不会覆盖"
          >
            人改
          </span>
        </span>
        <el-switch
          :model-value="diy.enabled"
          active-text="用于 DIY"
          inactive-text="不用于 DIY"
          @update:model-value="(value: boolean | string | number) => updateEnabled(value === true)"
        />
        <em class="draft-field__hint">
          关闭开关不会清空下面的平台/链接/图片，草稿里会原样保留。
        </em>
      </div>

      <div class="draft-section__grid" style="margin-top: 14px">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>购买平台</span>
            <AiFieldTag :tag="aiTag('diy.platform')" />
            <span
              v-if="isManual('diy.platform')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="diy.platform || undefined"
            placeholder="选择购买平台"
            style="width: 100%"
            @update:model-value="(value: string) => update('platform', value)"
          >
            <el-option
              v-for="option in platformOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>购买链接</span>
            <AiFieldTag :tag="aiTag('diy.linkUrl')" />
            <span
              v-if="isManual('diy.linkUrl')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <div class="draft-section__row">
            <el-input
              :model-value="diy.linkUrl"
              placeholder="商品详情页链接"
              style="flex: 1"
              @update:model-value="(value: string) => update('linkUrl', value)"
            />
            <el-button
              :loading="fetching"
              :disabled="locked || !diy.linkUrl.trim() || fetching"
              data-action="diy-fetch"
              @click="fetchFromLink"
            >
              从链接抓取
            </el-button>
          </div>
          <em v-if="!diy.platform && missingReason('diy.platform')" class="draft-field__missing" :title="missingReason('diy.platform')">
            AI 没找到，请补
          </em>
          <em v-if="!diy.linkUrl.trim() && missingReason('diy.linkUrl')" class="draft-field__missing" :title="missingReason('diy.linkUrl')">
            AI 没找到，请补
          </em>
          <em class="draft-field__hint">
            抓取用于补商品主图/品牌/规格；目前支持 iHerb 等能读到的商品页。
          </em>
          <em v-if="fetchError" class="draft-field__warn">{{ fetchError }}</em>
        </label>
      </div>

      <div
        v-if="fetchedImage || fetchedBrand || fetchedModel"
        class="draft-diy__fetched"
      >
        <p class="draft-diy__fetched-title">抓取结果（采用前不会写入草稿）</p>
        <div class="draft-section__row">
          <img
            v-if="fetchedImage"
            :src="fetchedImage"
            alt="抓取到的商品图"
            class="draft-diy__thumb"
          />
          <span v-if="fetchedBrand" class="draft-diy__meta">品牌：{{ fetchedBrand }}</span>
          <span v-if="fetchedModel" class="draft-diy__meta">规格：{{ fetchedModel }}</span>
          <el-button
            v-if="fetchedImage"
            type="primary"
            plain
            size="small"
            :loading="adopting"
            :disabled="locked"
            data-action="diy-adopt-image"
            @click="adoptFetchedImage"
          >
            采用这张商品图
          </el-button>
        </div>
      </div>
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">
        商品图片
        <AiFieldTag :tag="aiTag('diy.imageUrl')" />
      </h4>
      <div class="draft-diy__image-row">
        <div
          class="draft-diy__image-slot"
          :class="{ 'draft-diy__image-slot--filled': diy.imageUrl }"
          @click="pickFile"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <img
            v-if="diy.imageUrl"
            :src="diy.imageUrl"
            alt="DIY 商品图片"
            class="draft-diy__image"
          />
          <span v-else class="draft-diy__image-empty">
            点击上传、拖入图片，或直接 ⌘V 粘贴截图
          </span>
        </div>
        <div class="draft-diy__image-actions">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            hidden
            @change="onFileChange"
          />
          <el-button
            :loading="uploading"
            :disabled="locked"
            data-action="diy-upload"
            @click="pickFile"
          >
            {{ diy.imageUrl ? '替换图片' : '上传图片' }}
          </el-button>
          <el-button
            v-if="diy.imageUrl"
            text
            type="danger"
            :disabled="locked"
            data-action="diy-clear-image"
            @click="clearImage"
          >
            移除图片
          </el-button>
          <em class="draft-field__hint">
            上传会转存到我们自己的图床；公司商品图与 DIY 链接共用同一套上传接口。
          </em>
          <em v-if="!diy.imageUrl && missingReason('diy.imageUrl')" class="draft-field__missing" :title="missingReason('diy.imageUrl')">
            AI 没找到，请补
          </em>
          <em v-if="uploadError" class="draft-field__warn">{{ uploadError }}</em>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ⑤ DIY 推荐（spec §12.5）。
 *
 * 开关关闭时**不清理**平台/链接/图片（草稿保留人的准备内容）。
 * 图片上传复用 `ingredientApi.uploadIngredientDiyImage`；「从链接抓取」复用
 * `ingredientCreationApi.previewSupplementLink`，只把抓到的主图/品牌/规格
 * 展示出来，人点「采用」才转存并写入草稿——不静默改字段。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  SupplementDraftAiSnapshot,
  SupplementDraftDiy
} from '@/api/supplementDrafts'
import { ingredientApi } from '@/api/ingredients'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { getApiErrorMessage } from '@/utils/apiError'
import { isManualDraftPath } from '../supplementDraftState'
import AiFieldTag from './AiFieldTag.vue'
import { aiFieldTag, aiMissingReason } from './aiFieldMeta'

const props = defineProps<{
  aiSnapshot?: SupplementDraftAiSnapshot | null
  /** AI 起草中或差异弹窗打开：窗口级粘贴/拖入也要拒绝，不能只靠遮罩 */
  locked?: boolean
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const diy = defineModel<SupplementDraftDiy>({ required: true })

const platformOptions = [
  { value: 'TAOBAO', label: '淘宝/天猫' },
  { value: 'JD', label: '京东' },
  { value: 'PINDUODUO', label: '拼多多' },
  { value: 'IHERB', label: 'iHerb' },
  { value: 'OTHER', label: '其他' }
] as const

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const fetching = ref(false)
const fetchError = ref('')
const fetchedImage = ref('')
const fetchedBrand = ref('')
const fetchedModel = ref('')
const adopting = ref(false)

function isManual(path: string): boolean {
  return isManualDraftPath(path, props.manualFields ?? [])
}

const aiTag = (path: string) => aiFieldTag(props.aiSnapshot, path)
const missingReason = (path: string) => aiMissingReason(props.aiSnapshot, path)

function update<K extends keyof SupplementDraftDiy>(
  key: K,
  value: SupplementDraftDiy[K]
): void {
  props.markManual?.(`diy.${String(key)}`)
  diy.value[key] = value
}

function updateEnabled(value: boolean): void {
  props.markManual?.('diy.enabled')
  diy.value.enabled = value
}

interface UploadedImage {
  url?: string
  data?: { url?: string }
}

/** 上传一张图并返回可写进草稿的 URL；失败返回空串。 */
async function uploadImage(file: File): Promise<string> {
  const response = (await ingredientApi.uploadIngredientDiyImage(
    file
  )) as unknown as UploadedImage
  return response.url ?? response.data?.url ?? ''
}

async function acceptFile(file: File): Promise<void> {
  if (props.locked) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('这不是图片文件')
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    const url = await uploadImage(file)
    if (!url) throw new Error('no url')
    update('imageUrl', url)
    ElMessage.success('商品图已上传')
  } catch {
    uploadError.value = '这张图没传上去，重试一次'
  } finally {
    uploading.value = false
  }
}

function pickFile(): void {
  if (props.locked) return
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    await acceptFile(file)
  }
}

async function onDrop(event: DragEvent): Promise<void> {
  if (props.locked) return
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    await acceptFile(file)
  }
}

function clearImage(): void {
  if (props.locked) return
  update('imageUrl', '')
}

/**
 * 粘贴截图：只处理剪贴板里带图片、且焦点不在文本框上的情况，
 * 避免抢掉普通文字粘贴。
 */
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
  await acceptFile(file)
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
})

async function fetchFromLink(): Promise<void> {
  if (props.locked) return
  const url = diy.value.linkUrl.trim()
  if (!url) {
    ElMessage.warning('先填购买链接')
    return
  }
  fetching.value = true
  fetchError.value = ''
  fetchedImage.value = ''
  fetchedBrand.value = ''
  fetchedModel.value = ''
  try {
    const preview = await ingredientCreationApi.previewSupplementLink(url)
    fetchedImage.value = preview.imageUrl ?? ''
    fetchedBrand.value = preview.brand ?? ''
    fetchedModel.value = preview.productModel ?? ''
    if (!fetchedImage.value && !fetchedBrand.value && !fetchedModel.value) {
      fetchError.value = '这个链接没读出主图/品牌/规格，请手动填'
    }
  } catch (err) {
    fetchError.value = getApiErrorMessage(
      err,
      '这个链接读不出来，可以手动上传商品图'
    )
  } finally {
    fetching.value = false
  }
}

/** 采用抓到的商品图：先转存到我们自己的图床，再写进草稿。 */
async function adoptFetchedImage(): Promise<void> {
  if (props.locked) return
  const source = fetchedImage.value
  if (!source) return
  adopting.value = true
  try {
    const response = await fetch(source)
    if (!response.ok) throw new Error('download failed')
    const blob = await response.blob()
    const file = new File([blob], 'diy-image.jpg', {
      type: blob.type || 'image/jpeg'
    })
    const url = await uploadImage(file)
    if (!url) throw new Error('upload failed')
    update('imageUrl', url)
    fetchedImage.value = ''
    ElMessage.success('已采用抓取到的商品图')
  } catch {
    ElMessage.error('商品图转存失败，可以手动上传')
  } finally {
    adopting.value = false
  }
}
</script>

<style scoped src="./draftSection.css"></style>

<style scoped>
.draft-diy__fetched {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #d9e6ff;
  border-radius: 8px;
  background: #f5f9ff;
}

.draft-diy__fetched-title {
  margin: 0 0 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: #3370ff;
}

.draft-diy__thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e3e7ed;
}

.draft-diy__meta {
  font-size: 12.5px;
  color: #5b6470;
}

.draft-diy__image-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.draft-diy__image-slot {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 168px;
  height: 168px;
  border: 1px dashed #d9dee5;
  border-radius: 10px;
  background: #fafbfc;
  overflow: hidden;
}

.draft-diy__image-slot--filled {
  border-style: solid;
}

.draft-diy__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.draft-diy__image-empty {
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #98a1ad;
  text-align: center;
}

.draft-diy__image-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
</style>
