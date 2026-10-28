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
      title="AI 封面预览"
      width="720px"
      :close-on-click-modal="false"
      @closed="discardPreview"
    >
      <img v-if="previewUrl" :src="previewUrl" class="ai-cover-field__preview" />
      <template #footer>
        <el-button @click="discardPreview">不要</el-button>
        <el-button type="primary" @click="applyPreview">用这张</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="largeVisible" title="封面预览" width="760px">
      <img v-if="modelValue" :src="modelValue" class="ai-cover-field__preview" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { recipeApi } from '@/api/recipes'
import { recipeDesignerApi } from '@/api/recipeDesigner'

const props = defineProps<{
  modelValue: string
  entityType: 'design' | 'series'
  entityId: string
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const generating = ref(false)
const uploading = ref(false)
const previewVisible = ref(false)
const previewUrl = ref('')
const largeVisible = ref(false)

async function generate() {
  if (!props.isAdmin || generating.value) return
  generating.value = true
  try {
    const result =
      props.entityType === 'design'
        ? await recipeDesignerApi.generateDraftAiCover(props.entityId)
        : await recipeDesignerApi.generateSeriesAiCover(props.entityId)
    previewUrl.value = result.url
    previewVisible.value = true
  } catch (error: any) {
    if (!error?.__apiErrorToasted) {
      ElMessage.error(error?.message || 'AI 生成封面失败')
    }
  } finally {
    generating.value = false
  }
}

function applyPreview() {
  if (!previewUrl.value) return
  emit('update:modelValue', previewUrl.value)
  previewUrl.value = ''
  previewVisible.value = false
  ElMessage.success('封面已替换，保存后生效')
}

function discardPreview() {
  const url = previewUrl.value
  previewUrl.value = ''
  previewVisible.value = false
  if (url) {
    void recipeDesignerApi.discardAiCoverPreview(url).catch(() => undefined)
  }
}

function remove() {
  emit('update:modelValue', '')
}

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
