<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑节点' : '新增节点'"
    width="500px"
    append-to-body
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <div v-if="!isEdit && parentLabel" class="parent-hint">
      将创建在「{{ parentLabel }}」下面
    </div>

    <el-form label-width="72px">
      <el-form-item label="名称" required>
        <el-input v-model="form.name" maxlength="50" placeholder="例如：三文鱼" />
      </el-form-item>

      <el-form-item label="定义" required>
        <el-input
          v-model="form.definition"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="要能用来判断：什么菜该放进来"
        />
        <div class="field-hint">
          没有定义，你、营养师、AI 会把同一道菜归到不同地方。
        </div>
      </el-form-item>

      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="0" :step="10" />
        <span class="field-hint inline">数字小的排前面</span>
      </el-form-item>

      <el-form-item v-if="isEdit" label="状态">
        <el-switch v-model="isActive" active-text="启用" inactive-text="停用" />
        <span class="field-hint inline">停用后不再接受新归类，已有归属保留</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button v-if="isEdit" type="danger" text :loading="deleting" @click="remove">
        删除节点
      </el-button>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { recipeTaxonomyApi } from '@/api/recipeTaxonomy'
import type { TaxonomyNodeView } from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: boolean
  kindId: string
  parentId: string | null
  parentLabel?: string
  node: TaxonomyNodeView | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved'): void
}>()

const saving = ref(false)
const deleting = ref(false)
const form = ref({ name: '', definition: '', sort: 0 })
const isActive = ref(true)

const isEdit = computed(() => Boolean(props.node))

watch(
  () => [props.modelValue, props.node?.id],
  () => {
    if (!props.modelValue) return
    form.value = {
      name: props.node?.name ?? '',
      definition: props.node?.definition ?? '',
      sort: props.node?.sort ?? 0
    }
    isActive.value = props.node ? props.node.status === 'ACTIVE' : true
  },
  { immediate: true }
)

async function save() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写节点名称')
    return
  }
  if (!form.value.definition.trim()) {
    ElMessage.warning('请填写节点定义：没有定义，归类就没有统一口径')
    return
  }

  saving.value = true
  try {
    if (props.node) {
      await recipeTaxonomyApi.updateNode(props.node.id, {
        name: form.value.name.trim(),
        definition: form.value.definition.trim(),
        sort: form.value.sort,
        status: isActive.value ? 'ACTIVE' : 'DISABLED'
      })
    } else {
      await recipeTaxonomyApi.createNode({
        kindId: props.kindId,
        parentId: props.parentId,
        name: form.value.name.trim(),
        definition: form.value.definition.trim(),
        sort: form.value.sort
      })
    }
    ElMessage.success('已保存')
    emit('saved')
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.node) return
  try {
    await ElMessageBox.confirm(
      `删除「${props.node.name}」后不可恢复。只有没有任何归属时才允许删除。`,
      '删除节点',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  deleting.value = true
  try {
    await recipeTaxonomyApi.deleteNode(props.node.id)
    ElMessage.success('已删除')
    emit('saved')
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.message || '删除失败')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.parent-hint {
  font-size: 12px;
  color: #909399;
  margin-bottom: 10px;
}
.field-hint {
  font-size: 11px;
  color: #a8b0bb;
  line-height: 1.5;
}
.field-hint.inline {
  margin-left: 8px;
}
</style>
