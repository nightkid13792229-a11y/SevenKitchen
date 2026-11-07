<template>
  <div class="ai-cover-field">
    <div class="ai-cover-field__row">
      <el-upload
        :show-file-list="false"
        :before-upload="handleUpload"
        accept="image/jpeg,image/png,image/webp"
      >
        <div class="ai-cover-field__box" :class="{ 'is-empty': !modelValue }">
          <img
            v-if="modelValue"
            :src="modelValue"
            alt="封面图预览"
            @click.stop="largeVisible = true"
          />
          <div v-else class="ai-cover-field__placeholder">
            <el-icon><Plus /></el-icon>
            <span>上传封面图</span>
          </div>
          <div v-if="uploading" class="ai-cover-field__mask">上传中…</div>
        </div>
      </el-upload>

      <div class="ai-cover-field__actions">
        <el-button
          v-if="isAdmin"
          type="primary"
          plain
          size="small"
          :loading="generating"
          @click="generate"
        >AI 生成封面</el-button>
        <el-button
          v-if="modelValue"
          link
          type="danger"
          size="small"
          @click="remove"
        >移除封面</el-button>
        <span class="ai-cover-field__hint">
          建议 16:9 横图，JPG / PNG / WebP，不超过 5MB。
        </span>
      </div>
    </div>

    <el-dialog
      v-model="previewVisible"
      title="AI 封面候选（挑一张）"
      width="980px"
      :close-on-click-modal="false"
      @closed="discardPreview"
    >
      <div class="ai-cover-candidates">
        <div
          v-for="candidate in candidates"
          :key="candidate.url"
          class="ai-cover-candidate"
          :class="{ 'is-active': selectedUrl === candidate.url }"
          @click="selectedUrl = candidate.url"
        >
          <img :src="candidate.url" class="ai-cover-candidate__img" />
          <div class="ai-cover-candidate__label">
            {{ candidate.presetLabel }}
            <span v-if="candidate.skeletonLabel">· {{ candidate.skeletonLabel }}</span>
          </div>
        </div>
      </div>
      <div class="ai-cover-candidates__hint">
        每张的摆法不同，先看哪张最像这道菜；没选中的会自动丢弃。
      </div>
      <template #footer>
        <el-button @click="discardPreview">都不要</el-button>
        <el-button type="primary" :disabled="!selectedUrl" @click="applyPreview">
          用这张
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="largeVisible" title="封面预览" width="760px">
      <img v-if="modelValue" :src="modelValue" class="ai-cover-field__preview" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { recipeApi } from '@/api/recipes'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { AiCoverCandidate } from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: string
  entityType: 'design' | 'series'
  entityId: string
  isAdmin?: boolean
  baselineValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const generating = ref(false)
const uploading = ref(false)
const previewVisible = ref(false)
const candidates = ref<AiCoverCandidate[]>([])
const selectedUrl = ref('')
const largeVisible = ref(false)
const pendingUrl = ref('')
const pendingReason = ref<'PREVIEW_DISCARDED' | 'UPLOAD_DISCARDED'>(
  'PREVIEW_DISCARDED'
)

async function generate() {
  if (!props.isAdmin || generating.value) return
  generating.value = true
  try {
    const result =
      props.entityType === 'design'
        ? await recipeDesignerApi.generateDraftAiCover(props.entityId)
        : await recipeDesignerApi.generateSeriesAiCover(props.entityId)
    candidates.value =
      result.candidates && result.candidates.length > 0
        ? result.candidates
        : [
            {
              url: result.url,
              preset: '',
              presetLabel: '默认',
              skeleton: '',
              skeletonLabel: ''
            }
          ]
    selectedUrl.value = candidates.value[0]?.url ?? ''
    previewVisible.value = true
  } catch (error: any) {
    if (!error?.__apiErrorToasted) {
      ElMessage.error(error?.message || 'AI 生成封面失败')
    }
  } finally {
    generating.value = false
  }
}

function discardUrls(urls: string[]) {
  for (const url of urls) {
    void recipeDesignerApi
      .discardAiCoverPreview(url, 'PREVIEW_DISCARDED')
      .catch(() => undefined)
  }
}

function applyPreview() {
  const chosen = selectedUrl.value
  if (!chosen) return
  pendingUrl.value = chosen
  pendingReason.value = 'PREVIEW_DISCARDED'
  emit('update:modelValue', chosen)
  // 没选中的候选直接丢弃，别在 COS 里堆垃圾
  discardUrls(
    candidates.value.map((item) => item.url).filter((url) => url !== chosen)
  )
  candidates.value = []
  selectedUrl.value = ''
  previewVisible.value = false
  ElMessage.success('封面已替换，保存后生效')
}

function discardPreview() {
  const urls = candidates.value.map((item) => item.url)
  candidates.value = []
  selectedUrl.value = ''
  previewVisible.value = false
  discardUrls(urls)
}

function remove() {
  if (pendingUrl.value && props.modelValue === pendingUrl.value) {
    void recipeDesignerApi
      .discardAiCoverPreview(pendingUrl.value, pendingReason.value)
      .catch(() => undefined)
    pendingUrl.value = ''
  }
  emit('update:modelValue', '')
}

onBeforeUnmount(() => {
  if (candidates.value.length > 0) discardPreview()
  if (
    pendingUrl.value &&
    props.modelValue === pendingUrl.value &&
    props.baselineValue !== pendingUrl.value
  ) {
    void recipeDesignerApi
      .discardAiCoverPreview(pendingUrl.value, pendingReason.value)
      .catch(() => undefined)
  }
})

async function handleUpload(file: File) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('只能上传 JPG / PNG / WebP 图片')
    return false
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('图片不能超过 5MB')
    return false
  }
  uploading.value = true
  try {
    const result = await recipeApi.uploadImage(file)
    pendingUrl.value = result.url
    pendingReason.value = 'UPLOAD_DISCARDED'
    emit('update:modelValue', result.url)
    ElMessage.success('封面图上传成功，保存后生效')
  } catch (error: any) {
    if (!error?.__apiErrorToasted) {
      ElMessage.error(error?.message || '封面图上传失败')
    }
  } finally {
    uploading.value = false
  }
  return false
}
</script>

<style scoped>
.ai-cover-field__row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.ai-cover-field__box {
  width: 240px;
  height: 135px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: #fafafa;
}
.ai-cover-field__box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ai-cover-field__placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #909399;
  font-size: 12px;
}
.ai-cover-field__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.75);
  color: #606266;
  font-size: 12px;
}
.ai-cover-candidates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.ai-cover-candidate {
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #fafafa;
  transition: border-color 0.15s ease;
}
.ai-cover-candidate.is-active {
  border-color: #1e3a2f;
}
.ai-cover-candidate__img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
.ai-cover-candidate__label {
  padding: 6px 8px;
  font-size: 12px;
  color: #606266;
  text-align: center;
}
.ai-cover-candidates__hint {
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}

.ai-cover-field__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.ai-cover-field__hint {
  color: #909399;
  font-size: 12px;
}
.ai-cover-field__preview {
  width: 100%;
  border-radius: 6px;
}
</style>
