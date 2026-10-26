<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    append-to-body
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <div class="classify-hint">
      每个分类最多选一个节点，不同分类可以同时选；留空也允许。
    </div>

    <div v-loading="saving" class="classify-body">
      <div v-for="kind in kinds" :key="kind.id" class="kind-block">
        <div class="kind-title">
          {{ kind.name }}
          <span class="kind-tip">
            {{ kind.code === 'MAIN_PROTEIN' ? '单选 · 只到物种' : '单选 · 可空' }}
          </span>
        </div>

        <div class="option-list">
          <label
            v-for="option in leafOptions(kind)"
            :key="option.id"
            class="option"
            :class="{ selected: selection[kind.id] === option.id }"
          >
            <el-radio
              :model-value="selection[kind.id] ?? ''"
              :value="option.id"
              @change="() => selectNode(kind.id, option.id)"
            >
              <span class="option-name">{{ option.path }}</span>
              <span class="option-definition">{{ option.definition }}</span>
            </el-radio>
          </label>
          <div v-if="leafOptions(kind).length === 0" class="option-empty">
            这个分类下还没有可用的叶子节点
          </div>
        </div>

        <el-button
          v-if="selection[kind.id]"
          class="clear-btn"
          size="small"
          text
          @click="selectNode(kind.id, null)"
        >
          清空这个分类
        </el-button>
      </div>
    </div>

    <template #footer>
      <span class="footer-note">只写归属关系，不改配方、不触发发布</span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存归类</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { recipeTaxonomyApi } from '@/api/recipeTaxonomy'
import type { TaxonomyKindView, TaxonomyNodeView } from '@/types/recipeDesigner'

interface LeafOption {
  id: string
  path: string
  definition: string
}

const props = defineProps<{
  modelValue: boolean
  seriesIds: string[]
  seriesName?: string
  kinds: TaxonomyKindView[]
  initialNodeIds: string[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved'): void
}>()

const saving = ref(false)
/** categoryId → nodeId（null 表示这个分类不归） */
const selection = ref<Record<string, string | null>>({})

const dialogTitle = computed(() =>
  props.seriesIds.length > 1
    ? `批量归类 · 已选 ${props.seriesIds.length} 道`
    : `归类 · ${props.seriesName ?? ''}`
)

function collectLeaves(
  nodes: TaxonomyNodeView[],
  parentPath: string[] = []
): LeafOption[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name]
    if (node.children.length > 0) {
      return collectLeaves(node.children, path)
    }
    return [{ id: node.id, path: path.join(' › '), definition: node.definition }]
  })
}

function leafOptions(kind: TaxonomyKindView): LeafOption[] {
  return collectLeaves(kind.nodes)
}

function resetSelection() {
  const next: Record<string, string | null> = {}
  for (const kind of props.kinds) {
    const hit = kind.nodes
      .flatMap(function flat(node): TaxonomyNodeView[] {
        return [node, ...node.children.flatMap(flat)]
      })
      .find((node) => props.initialNodeIds.includes(node.id))
    next[kind.id] = hit?.id ?? null
  }
  selection.value = next
}

watch(
  () => [props.modelValue, props.seriesIds.join(','), props.initialNodeIds.join(',')],
  () => {
    if (props.modelValue) resetSelection()
  },
  { immediate: true }
)

function selectNode(kindId: string, nodeId: string | null) {
  selection.value = { ...selection.value, [kindId]: nodeId }
}

async function save() {
  const nodeIds = Object.values(selection.value).filter(
    (value): value is string => Boolean(value)
  )

  saving.value = true
  try {
    if (props.seriesIds.length === 1) {
      await recipeTaxonomyApi.replaceLinks(props.seriesIds[0], nodeIds)
    } else {
      await recipeTaxonomyApi.batchLinks(props.seriesIds, nodeIds)
    }
    ElMessage.success('归类已保存')
    emit('saved')
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.classify-hint {
  font-size: 12px;
  color: #909399;
  margin-bottom: 10px;
}
.classify-body {
  max-height: 460px;
  overflow-y: auto;
}
.kind-block {
  padding: 10px 0;
  border-bottom: 1px dashed #ebeef5;
}
.kind-block:last-child {
  border-bottom: none;
}
.kind-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  margin-bottom: 4px;
}
.kind-tip {
  font-weight: 400;
  font-size: 11px;
  color: #a8b0bb;
  margin-left: 6px;
}
.option {
  display: block;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.option.selected {
  background: #f2f8ff;
}
.option :deep(.el-radio) {
  height: auto;
  align-items: flex-start;
  margin-right: 0;
}
.option :deep(.el-radio__label) {
  white-space: normal;
  line-height: 1.5;
}
.option-name {
  display: block;
  font-size: 12.5px;
  color: #303133;
}
.option-definition {
  display: block;
  font-size: 11px;
  color: #a0aab5;
}
.option-empty {
  font-size: 12px;
  color: #c0c4cc;
  padding: 4px 6px;
}
.clear-btn {
  margin-left: 6px;
  color: #909399;
}
.footer-note {
  float: left;
  font-size: 11px;
  color: #a8b0bb;
  line-height: 32px;
}
</style>
