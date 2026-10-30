<template>
  <div class="quick-taxonomy">
    <div class="quick-head">
      <span class="quick-title">快速归类</span>
      <el-tag v-if="missingCount > 0" size="small" type="danger" effect="plain">
        缺 {{ missingCount }} 项
      </el-tag>
      <el-tag v-else size="small" type="success" effect="plain">已归类</el-tag>
    </div>

    <div v-loading="loading" class="quick-rows">
      <div v-for="kind in kinds" :key="kind.id" class="quick-row">
        <span class="quick-k">{{ kind.name }}</span>
        <span class="quick-v" :class="{ empty: !linked[kind.id] }">
          {{ labelOf(kind.id) }}
        </span>
        <el-button size="small" text type="primary" @click="openPicker(kind)">
          {{ linked[kind.id] ? '改' : '挂' }}
        </el-button>
      </div>
    </div>

    <div class="quick-note">
      双拼 / 多拼菜可以不挂主蛋白，挂其它任一分类即可发布。
    </div>

    <el-dialog
      v-model="pickerVisible"
      :title="`选择「${activeKind?.name ?? ''}」`"
      width="480px"
      append-to-body
    >
      <div class="picker-body">
        <div
          v-for="option in options"
          :key="option.id"
          class="picker-option"
          :class="{ selected: picked === option.id }"
          @click="picked = option.id"
        >
          <div class="picker-name">{{ option.path }}</div>
          <div class="picker-def">{{ option.definition }}</div>
        </div>
        <el-empty v-if="options.length === 0" description="这个分类下还没有可选节点" />
      </div>
      <template #footer>
        <el-button v-if="activeKind && linked[activeKind.id]" text @click="clearKind">
          清空这个分类
        </el-button>
        <el-button @click="pickerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { recipeTaxonomyApi } from '@/api/recipeTaxonomy'
import type { TaxonomyKindView, TaxonomyNodeView } from '@/types/recipeDesigner'

const props = defineProps<{
  seriesId: string | null
}>()

const emit = defineEmits<{ (event: 'saved'): void }>()

const loading = ref(false)
const saving = ref(false)
const kinds = ref<TaxonomyKindView[]>([])
const linked = ref<Record<string, string>>({})
const pickerVisible = ref(false)
const activeKind = ref<TaxonomyKindView | null>(null)
const picked = ref<string>('')

interface LeafOption {
  id: string
  path: string
  definition: string
}

const options = computed<LeafOption[]>(() =>
  activeKind.value ? collectLeaves(activeKind.value.nodes) : []
)

const missingCount = computed(
  () => kinds.value.filter((kind) => !linked.value[kind.id]).length
)

function collectLeaves(
  nodes: TaxonomyNodeView[],
  parentPath: string[] = []
): LeafOption[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name]
    if (node.children.length > 0) return collectLeaves(node.children, path)
    return [{ id: node.id, path: path.join(' › '), definition: node.definition }]
  })
}

function labelOf(kindId: string): string {
  const nodeId = linked.value[kindId]
  if (!nodeId) return '未选'
  const kind = kinds.value.find((item) => item.id === kindId)
  if (!kind) return '未选'
  return collectLeaves(kind.nodes).find((leaf) => leaf.id === nodeId)?.path ?? '未选'
}

async function load() {
  if (!props.seriesId) return
  loading.value = true
  try {
    const [tree, seriesList] = await Promise.all([
      recipeTaxonomyApi.getTree({ designMode: 'CATALOG' }),
      recipeTaxonomyApi.listSeries({ page: 1, pageSize: 200 })
    ])
    kinds.value = tree.kinds ?? []
    const current = seriesList.items.find((item) => item.id === props.seriesId)
    const next: Record<string, string> = {}
    for (const link of current?.links ?? []) {
      next[link.kindId] = link.nodeId
    }
    linked.value = next
  } finally {
    loading.value = false
  }
}

function openPicker(kind: TaxonomyKindView) {
  activeKind.value = kind
  picked.value = linked.value[kind.id] ?? ''
  pickerVisible.value = true
}

function clearKind() {
  if (activeKind.value) picked.value = ''
  void save()
}

async function save() {
  if (!props.seriesId || !activeKind.value) return
  saving.value = true
  try {
    const nodeIds = kinds.value
      .map((kind) =>
        kind.id === activeKind.value?.id ? picked.value : linked.value[kind.id]
      )
      .filter((value): value is string => Boolean(value))
    await recipeTaxonomyApi.replaceLinks(props.seriesId, nodeIds)
    ElMessage.success('归类已保存')
    pickerVisible.value = false
    await load()
    emit('saved')
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.quick-taxonomy {
  border: 1px solid #e4e8ef;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fbfcfe;
  margin-bottom: 14px;
}
.quick-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.quick-title {
  font-size: 12.5px;
  font-weight: 600;
}
.quick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.quick-k {
  width: 64px;
  color: #909399;
  flex: none;
}
.quick-v {
  flex: 1;
  color: #303133;
}
.quick-v.empty {
  color: #b6bec8;
}
.quick-note {
  margin-top: 6px;
  font-size: 11px;
  color: #a8b0bb;
}
.picker-body {
  max-height: 380px;
  overflow-y: auto;
}
.picker-option {
  padding: 7px 9px;
  border-radius: 5px;
  cursor: pointer;
}
.picker-option:hover {
  background: #f7faff;
}
.picker-option.selected {
  background: #ecf5ff;
}
.picker-name {
  font-size: 12.5px;
  color: #303133;
}
.picker-def {
  font-size: 11px;
  color: #a0aab5;
}
</style>
