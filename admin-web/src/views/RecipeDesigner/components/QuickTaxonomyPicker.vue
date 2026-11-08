<template>
  <div class="quick-taxonomy">
    <div class="quick-head">
      <span v-if="showTitle !== false" class="quick-title">快速归类</span>
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
      双拼 / 多拼菜可以不挂主蛋白，挂其它任一分类即可发布。改动先存发布草稿，点「发布这一版」后才影响顾客筛选。
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
  /** 外层已经有「快速归类」标签时，隐藏组件自己的标题 */
  showTitle?: boolean
  /**
   * 保存方式（2026-11-08）。
   *
   * 不传 = 直接调归类接口（页面会自己刷新）；
   * 传了 = 交给调用方（发布抽屉）放进草稿保存队列，和其他字段串行、共用乐观锁。
   */
  persistLinks?: (
    links: Array<{ kindId: string; nodeId: string }>
  ) => Promise<void>
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
    // 2026-11-08：归类先存发布草稿，这里读「草稿 ?? 线上」的生效值；
    // 顺便不再去 200 条的列表里找（系列一多就会找不到、显示成全空）。
    const [tree, current] = await Promise.all([
      recipeTaxonomyApi.getTree({ designMode: 'CATALOG' }),
      recipeTaxonomyApi.getSeriesLinks(props.seriesId)
    ])
    kinds.value = tree.kinds ?? []
    const next: Record<string, string> = {}
    for (const link of current.links ?? []) {
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
    const links = kinds.value
      .map((kind) => ({
        kindId: kind.id,
        nodeId:
          kind.id === activeKind.value?.id
            ? picked.value
            : linked.value[kind.id]
      }))
      .filter(
        (link): link is { kindId: string; nodeId: string } =>
          Boolean(link.nodeId)
      )
    if (props.persistLinks) {
      await props.persistLinks(links)
    } else {
      await recipeTaxonomyApi.replaceLinks(
        props.seriesId,
        links.map((link) => link.nodeId)
      )
    }
    ElMessage.success('归类已存进发布草稿，发布后生效')
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
