<template>
  <div class="taxonomy-view">
    <aside class="taxonomy-tree">
      <div
        class="unclassified-entry"
        :class="{ active: selected.nodeId === null }"
        @click="selectUnclassified"
      >
        <span>未归类</span>
        <b>{{ unclassifiedTotal }}</b>
      </div>

      <el-tree
        v-if="kindTree.length > 0"
        :data="kindTree"
        node-key="id"
        :props="{ label: 'label', children: 'children' }"
        :expand-on-click-node="false"
        highlight-current
        @node-click="onNodeClick"
      >
        <template #default="{ data }">
          <span class="tree-node" :class="{ 'is-kind': data.level === 0 }">
            <span class="tree-label">{{ data.label }}</span>
            <span v-if="data.count > 0" class="tree-count">{{ data.count }}</span>
            <span v-if="isAdmin" class="tree-actions">
              <el-button
                v-if="data.level < 2"
                size="small"
                text
                title="新增下级节点"
                @click.stop="openCreateNode(data)"
              >
                ＋
              </el-button>
              <el-button
                v-if="data.level > 0"
                size="small"
                text
                title="编辑这个节点"
                @click.stop="openEditNode(data)"
              >
                编辑
              </el-button>
            </span>
          </span>
        </template>
      </el-tree>
      <div v-else-if="!loading" class="tree-empty">还没有分类，请先在结构维护里添加</div>
    </aside>

    <section class="taxonomy-list">
      <div class="list-toolbar">
        <span class="list-title">
          {{ listTitle }} · 共 {{ total }} 道
        </span>
        <el-button
          size="small"
          type="primary"
          plain
          :disabled="selectedIds.length === 0"
          @click="openBatchClassify"
        >
          批量归类{{ selectedIds.length > 0 ? `（${selectedIds.length}）` : '' }}
        </el-button>
      </div>

      <el-empty v-if="!loading && items.length === 0" description="这里还没有食谱" />

      <div v-loading="loading" class="row-list">
        <div v-for="item in items" :key="item.id" class="row">
          <el-checkbox
            :model-value="selectedIds.includes(item.id)"
            @change="(value: boolean) => toggleSelect(item.id, value)"
          />
          <div class="row-main">
            <div class="row-name">
              {{ item.name }}
              <el-tag
                size="small"
                :type="item.businessStatus === 'PUBLIC' ? 'success' : 'info'"
                effect="plain"
              >
                {{ statusLabel(item.businessStatus) }}
              </el-tag>
              <span v-if="item.referenceDogName" class="dog-chip">
                🐶 {{ item.referenceDogName }}
              </span>
            </div>
            <div class="row-chips">
              <span
                v-for="chip in chipsOf(item)"
                :key="chip.key"
                class="chip"
                :class="{ missing: chip.missing }"
              >
                {{ chip.label }}
              </span>
            </div>
          </div>
          <el-button size="small" text type="primary" @click="openClassify(item)">
            归类
          </el-button>
        </div>
      </div>

      <div v-if="total > items.length" class="load-more">
        <el-button size="small" text :loading="loading" @click="loadMore">
          加载更多
        </el-button>
      </div>
    </section>

    <TaxonomyNodeDialog
      v-model="nodeDialogVisible"
      :kind-id="nodeForm.kindId"
      :parent-id="nodeForm.parentId"
      :parent-label="nodeForm.parentLabel"
      :node="nodeForm.node"
      @saved="refresh"
    />

    <TaxonomyClassifyDialog
      v-model="dialogVisible"
      :series-ids="dialogSeriesIds"
      :series-name="dialogSeriesName"
      :kinds="kinds"
      :initial-node-ids="dialogInitialNodeIds"
      @saved="afterSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { recipeTaxonomyApi } from '@/api/recipeTaxonomy'
import { buildTaxonomyChips, type TaxonomyChip } from '@/utils/recipeDesigner/taxonomyChips'
import type { TaxonomyKindView, TaxonomySeriesItem } from '@/types/recipeDesigner'
import TaxonomyClassifyDialog from './TaxonomyClassifyDialog.vue'
import TaxonomyNodeDialog from './TaxonomyNodeDialog.vue'
import { useIsAdmin } from '@/composables/useAdminRole'

interface TreeNodeData {
  id: string
  label: string
  level: number
  count: number
  nodeId: string | null
  kindId: string
  node?: TaxonomyNodeView
  children?: TreeNodeData[]
}

const props = defineProps<{
  /** 与页面上「产品线食谱 / 订单定制食谱」开关保持一致 */
  designMode?: 'CATALOG' | 'ORDER'
  /** 与页面上「全部 / 草稿 / 已发布 / 定制」开关保持一致 */
  status?: string
}>()

const PAGE_SIZE = 20

const loading = ref(false)
const kinds = ref<TaxonomyKindView[]>([])
const items = ref<TaxonomySeriesItem[]>([])
const total = ref(0)
const page = ref(1)
const selected = ref<{ nodeId: string | null; label: string }>({
  nodeId: null,
  label: '未归类'
})
const selectedIds = ref<string[]>([])
const unclassifiedTotal = ref(0)

const isAdmin = useIsAdmin()
const nodeDialogVisible = ref(false)
const nodeForm = ref<{
  kindId: string
  parentId: string | null
  parentLabel?: string
  node: TaxonomyNodeView | null
}>({ kindId: '', parentId: null, node: null })

const dialogVisible = ref(false)
const dialogSeriesIds = ref<string[]>([])
const dialogSeriesName = ref('')
const dialogInitialNodeIds = ref<string[]>([])

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PUBLIC: '已发布',
    DRAFT: '草稿',
    PRIVATE_CUSTOM: '定制'
  }
  return map[status] ?? status
}

const kindTree = computed<TreeNodeData[]>(() =>
  kinds.value.map((kind) => ({
    id: `kind:${kind.id}`,
    label: kind.name,
    level: 0,
    count: kind.rollupSeriesCount,
    nodeId: null,
    kindId: kind.id,
    children: kind.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      level: 1,
      count: node.rollupSeriesCount,
      nodeId: node.id,
      kindId: kind.id,
      node,
      children: node.children.map((child) => ({
        id: child.id,
        label: child.name,
        level: 2,
        count: child.seriesCount,
        nodeId: child.id,
        kindId: kind.id,
        node: child
      }))
    }))
  }))
)

const listTitle = computed(() => selected.value.label)

function chipsOf(item: TaxonomySeriesItem): TaxonomyChip[] {
  return buildTaxonomyChips(item, kinds.value)
}

function onNodeClick(data: TreeNodeData) {
  if (!data.nodeId) return
  selected.value = { nodeId: data.nodeId, label: data.label }
  selectedIds.value = []
  page.value = 1
  void loadList()
}

function selectUnclassified() {
  selected.value = { nodeId: null, label: '未归类' }
  selectedIds.value = []
  page.value = 1
  void loadList()
}

function toggleSelect(id: string, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((item) => item !== id)
}

function scopeParams() {
  return {
    designMode: props.designMode,
    businessStatus: props.status
  }
}

async function loadTree() {
  const result = await recipeTaxonomyApi.getTree(scopeParams())
  kinds.value = result.kinds ?? []
}

async function loadUnclassifiedTotal() {
  const result = await recipeTaxonomyApi.listSeries({
    ...scopeParams(),
    unclassified: true,
    page: 1,
    pageSize: 1
  })
  unclassifiedTotal.value = result.total
}

async function loadList() {
  loading.value = true
  try {
    const result = await recipeTaxonomyApi.listSeries({
      ...scopeParams(),
      nodeId: selected.value.nodeId ?? undefined,
      unclassified: selected.value.nodeId === null,
      page: page.value,
      pageSize: PAGE_SIZE
    })
    items.value = page.value === 1 ? result.items : [...items.value, ...result.items]
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function loadMore() {
  page.value += 1
  void loadList()
}

async function refresh() {
  await Promise.all([loadTree(), loadUnclassifiedTotal(), loadList()])
}

function openCreateNode(data: TreeNodeData) {
  nodeForm.value = {
    kindId: data.kindId,
    parentId: data.nodeId,
    parentLabel: data.label,
    node: null
  }
  nodeDialogVisible.value = true
}

function openEditNode(data: TreeNodeData) {
  nodeForm.value = {
    kindId: data.kindId,
    parentId: data.node?.parentId ?? null,
    parentLabel: undefined,
    node: data.node ?? null
  }
  nodeDialogVisible.value = true
}

function openClassify(item: TaxonomySeriesItem) {
  dialogSeriesIds.value = [item.id]
  dialogSeriesName.value = item.name
  dialogInitialNodeIds.value = item.links.map((link) => link.nodeId)
  dialogVisible.value = true
}

function openBatchClassify() {
  dialogSeriesIds.value = [...selectedIds.value]
  dialogSeriesName.value = ''
  dialogInitialNodeIds.value = []
  dialogVisible.value = true
}

async function afterSaved() {
  selectedIds.value = []
  await refresh()
}

// 上面的开关一变，树的计数和列表都要跟着换口径
watch(
  () => [props.designMode, props.status],
  () => {
    page.value = 1
    selectedIds.value = []
    void refresh()
  }
)

onMounted(() => {
  void refresh()
})

defineExpose({ refresh })
</script>

<style scoped>
.taxonomy-view {
  display: flex;
  min-height: 520px;
  border-top: 1px solid #ebeef5;
}
.taxonomy-tree {
  width: 250px;
  padding: 8px 0;
  border-right: 1px solid #ebeef5;
  background: #fcfdfe;
}
.unclassified-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 10px 10px;
  padding: 7px 10px;
  border: 1px dashed #ecc58f;
  border-radius: 5px;
  background: #fdf6ec;
  font-size: 12.5px;
  color: #b88230;
  cursor: pointer;
}
.unclassified-entry.active {
  border-style: solid;
  border-color: #e6a23c;
  background: #fdf1e0;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}
.tree-node.is-kind {
  font-weight: 600;
}
.tree-count {
  color: #a8b3c0;
  font-size: 11px;
}
.tree-empty {
  padding: 12px;
  font-size: 12px;
  color: #c0c4cc;
}
.taxonomy-list {
  flex: 1;
  padding: 12px 14px;
  background: #fbfcfe;
}
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.list-title {
  font-size: 12.5px;
  color: #606266;
}
.row-list {
  min-height: 200px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #e9edf3;
  border-radius: 6px;
  background: #fff;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 5px;
}
.dog-chip {
  font-size: 11.5px;
  font-weight: 400;
  color: #909399;
}
.row-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  font-size: 10.5px;
  padding: 1.5px 6px;
  border-radius: 3px;
  background: #f0f6ff;
  color: #3a7cc2;
  border: 1px solid #d9e9fb;
}
.chip.missing {
  background: #f7f8fa;
  color: #b6bec8;
  border: 1px dashed #e8ebef;
}
.load-more {
  text-align: center;
  padding: 6px 0;
}
</style>
