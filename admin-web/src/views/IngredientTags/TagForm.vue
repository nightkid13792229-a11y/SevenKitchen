<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="formRules"
    label-width="120px"
  >
    <el-form-item label="标签名称" prop="name">
      <el-input
        v-model="formData.name"
        placeholder="请输入标签名称"
        maxlength="50"
        show-word-limit
      />
    </el-form-item>

    <el-form-item label="描述">
      <el-input
        v-model="formData.description"
        type="textarea"
        :rows="3"
        placeholder="请输入标签描述"
        maxlength="200"
        show-word-limit
      />
    </el-form-item>

    <el-form-item label="父标签" prop="parentId">
      <el-select
        v-model="formData.parentId"
        placeholder="选择父标签（可选）"
        clearable
        style="width: 300px"
      >
        <el-option
          v-for="tag in availableParentTags"
          :key="tag.id"
          :label="getTagPath(tag)"
          :value="tag.id"
          :disabled="tag.id === tag?.id"
        />
      </el-select>
      <div class="hint-text">不选择则为根标签</div>
    </el-form-item>

    <el-form-item label="排序" prop="sort">
      <el-input-number
        v-model="formData.sort"
        :min="0"
        :max="9999"
        :step="1"
        controls-position="right"
        style="width: 200px"
      />
      <div class="hint-text">数值越小越靠前</div>
    </el-form-item>

    <el-form-item label="颜色">
      <el-color-picker v-model="formData.color" show-alpha />
      <div class="hint-text">标签显示颜色（可选）</div>
    </el-form-item>

    <!-- Actions -->
    <el-form-item>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        保存
      </el-button>
      <el-button @click="handleCancel">取消</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { IngredientTag, CreateTagDto, UpdateTagDto } from '@/api/ingredientTags'

interface Props {
  tag?: IngredientTag
  parentTagId?: string
  allTags: IngredientTag[]
}

interface Emits {
  (e: 'submit', data: CreateTagDto | UpdateTagDto): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const formData = reactive<CreateTagDto & UpdateTagDto>({
  name: props.tag?.name || '',
  description: props.tag?.description || '',
  parentId: props.tag?.parentId || props.parentTagId || null,
  sort: props.tag?.sort ?? 0,
  color: props.tag?.color || ''
})

// Available parent tags (exclude self and descendants)
const availableParentTags = computed(() => {
  if (!props.tag?.id) {
    return props.allTags
  }

  // Filter out self and descendants
  const excludeIds = new Set<string>()
  const collectDescendants = (tagId: string) => {
    excludeIds.add(tagId)
    props.allTags
      .filter(t => t.parentId === tagId)
      .forEach(t => collectDescendants(t.id))
  }
  collectDescendants(props.tag.id)

  return props.allTags.filter(t => !excludeIds.has(t.id))
})

const getTagPath = (tag: IngredientTag): string => {
  if (!tag.parentId) {
    return tag.name
  }
  const parent = props.allTags.find(t => t.id === tag.parentId)
  const parentPath = parent ? getTagPath(parent) + ' > ' : ''
  return parentPath + tag.name
}

// Watch for tag changes
watch(() => props.tag, (newTag) => {
  if (newTag) {
    Object.assign(formData, {
      name: newTag.name,
      description: newTag.description,
      parentId: newTag.parentId,
      sort: newTag.sort,
      color: newTag.color
    })
  }
})

watch(() => props.parentTagId, (newParentId) => {
  if (newParentId !== undefined) {
    formData.parentId = newParentId
  }
})

// Form validation rules
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入标签名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  sort: [
    { required: true, message: '请输入排序值', trigger: 'blur' },
    { type: 'number', min: 0, message: '排序值不能小于0', trigger: 'blur' }
  ]
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    submitting.value = true

    // Convert rgba color to hex format
    const rgbaToHex = (color: string | null | undefined): string | null => {
      if (!color || color.trim() === '') return null
      if (color.startsWith('#')) return color

      // Parse rgba() or rgb() format
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!match || !match[1] || !match[2] || !match[3]) return null

      const toHex = (n: string) => parseInt(n, 10).toString(16).padStart(2, '0').toUpperCase()
      return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`
    }

    // Remove undefined values
    const data: CreateTagDto | UpdateTagDto = {
      name: formData.name,
      description: formData.description || null,
      parentId: formData.parentId || undefined,
      sort: formData.sort,
      color: rgbaToHex(formData.color)
    }

    emit('submit', data)
  } catch (error) {
    // Validation failed
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.hint-text {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
</style>
