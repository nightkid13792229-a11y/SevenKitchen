<template>
  <div class="recipe-designer-list">
    <div class="page-header">
      <div>
        <h2>食谱设计器</h2>
        <p class="subtitle">为爱犬档案定制鲜食配方系列，配餐员设计、管理员审核发布</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建设计系列</el-button>
      </div>
    </div>

    <el-card shadow="never" class="list-card">
      <template #header>
        <div class="card-header">
          <span>食谱设计</span>
          <el-radio-group v-model="statusFilter" size="small" @change="onStatusFilterChange">
            <el-radio-button :value="undefined">全部</el-radio-button>
            <el-radio-button value="DRAFT">草稿</el-radio-button>
            <el-radio-button value="PUBLIC">已发布</el-radio-button>
            <el-radio-button value="PRIVATE_CUSTOM">定制</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <el-empty v-if="loading && series.length === 0" description="加载中…" />
      <el-empty v-else-if="!loading && series.length === 0" description="还没有设计系列，点击右上角「新建设计系列」开始" />

      <div v-loading="loading" class="series-grid" @scroll.passive="handleSeriesScroll">
        <div v-for="card in series" :key="card.id" class="series-card">
          <div class="series-card-head">
            <div class="series-name">{{ card.name }}</div>
            <el-tag
              size="small"
              :type="card.businessStatus === 'PUBLIC' ? 'success' : card.businessStatus === 'PRIVATE_CUSTOM' ? 'warning' : 'info'"
            >
              {{ card.businessStatusLabel || card.businessStatus || '草稿' }}
            </el-tag>
          </div>
          <div class="series-meta">
            <span class="updated-at">更新于 {{ formatTime(card.updatedAt) }}</span>
          </div>

          <div class="stage-grid">
            <div
              v-for="stage in card.stages"
              :key="stage.lifeStage"
              class="stage-cell stage-clickable"
              :class="stageCellClass(stage)"
              @click="openStage(card, stage)"
            >
              <div class="stage-label">{{ stage.label }}</div>
              <div class="stage-status">
                <el-tag size="small" :type="stageTagType(stage)" effect="plain">
                  {{ stageStatusLabel(stage) }}
                </el-tag>
                <span class="click-guard" @click.stop>
                  <el-dropdown
                    trigger="click"
                    @command="(cmd: string) => handleStageCommand(cmd, card, stage)"
                  >
                    <el-button size="small" text :icon="MoreFilled" class="stage-more" />
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="copyItems">复制其他阶段原料</el-dropdown-item>
                        <el-dropdown-item command="duplicateStage">复制为新食谱系列</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </span>
              </div>
            </div>
          </div>

          <div class="series-card-actions">
            <el-button size="small" text @click="handleCardCommand('duplicate', card)">复制系列</el-button>
            <el-button size="small" text @click="handleCardCommand('rename', card)">重命名</el-button>
            <el-button size="small" text type="danger" @click="handleCardCommand('delete', card)">删除系列</el-button>
          </div>
        </div>
      </div>
      <div v-if="seriesHasMore" class="loadmore-tip">
        {{ loadingMore ? '加载中…' : '继续向下滚动加载更多' }}
      </div>
    </el-card>

    <!-- 新建系列 -->
    <el-dialog v-model="createDialogVisible" title="新建设计系列" width="520px" @closed="resetCreateForm">
      <el-form label-width="96px">
        <el-form-item label="系列名称" required>
          <el-input v-model="createForm.name" placeholder="例如：旺财 12 月定制鲜食" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="参考爱犬">
          <el-select
            v-model="createForm.referenceDogId"
            filterable
            remote
            clearable
            placeholder="可选：选择一位客户的爱犬（用于设计参考）"
            :remote-method="searchDogs"
            :loading="dogLoading"
            style="width: 100%"
          >
            <el-option
              v-for="dog in dogOptions"
              :key="dog.id"
              :label="dogLabel(dog)"
              :value="dog.id"
            />
          </el-select>
          <div class="form-tip">可选的参考爱犬：进入配方编辑页后，可随时在「爱犬指导」面板设置或更换；该犬档案与 AI 建议仅作设计参考，发布后与犬解耦</div>
        </el-form-item>
        <el-form-item label="默认阶段">
          <el-select v-model="createForm.scenario" clearable placeholder="默认：普通成年犬（110ME）" style="width: 100%">
            <el-option
              v-for="(label, key) in FEDIAF_DOG_SCENARIO_LABELS"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createSeries">创建</el-button>
      </template>
    </el-dialog>

    <!-- 重命名 -->
    <el-dialog v-model="renameDialogVisible" title="重命名系列" width="420px">
      <el-input v-model="renameForm.name" maxlength="60" show-word-limit />
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="renaming" @click="confirmRename">保存</el-button>
      </template>
    </el-dialog>

    <!-- 复制其他阶段原料：选择来源阶段 -->
    <el-dialog v-model="copyItemsDialogVisible" title="复制其他阶段原料" width="460px">
      <div v-if="copySourceStages.length === 0" class="form-tip">
        暂无可复制的来源阶段（其他阶段还没有草稿/原料）
      </div>
      <el-radio-group
        v-else
        v-model="copySourceLifeStage"
        class="copy-source-group"
      >
        <el-radio
          v-for="stage in copySourceStages"
          :key="stage.lifeStage"
          :value="stage.lifeStage"
        >
          {{ stage.label }}
        </el-radio>
      </el-radio-group>
      <div class="form-tip">将把来源阶段的全部原料（含用量与排序）复制到「{{ copyTargetStageLabel }}」，随后直接打开该阶段编辑器</div>
      <template #footer>
        <el-button @click="copyItemsDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="copyingItems" @click="confirmCopyItems">复制并打开</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, Plus } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { dogApi } from '@/api/dogs'
import type { DogProfile } from '@/types/dog'
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  type FediafDogScenario,
  type RecipeDesignerSeriesCard,
  type RecipeDesignerSeriesStage,
  type RecipeDesignerSeriesStatusFilter
} from '@/types/recipeDesigner'

const router = useRouter()

const loading = ref(false)
const loadingMore = ref(false)
const creating = ref(false)
const renaming = ref(false)
const series = ref<RecipeDesignerSeriesCard[]>([])
const statusFilter = ref<RecipeDesignerSeriesStatusFilter | undefined>(undefined)
const seriesPage = ref(1)
const seriesHasMore = ref(true)
const SERIES_PAGE_SIZE = 20

const createDialogVisible = ref(false)
const createForm = reactive<{ name: string; referenceDogId?: string; scenario?: FediafDogScenario }>({
  name: '',
  referenceDogId: undefined,
  scenario: undefined
})

const renameDialogVisible = ref(false)
const renameForm = reactive<{ id: string; name: string }>({ id: '', name: '' })

// 跨阶段复制原料
const copyItemsDialogVisible = ref(false)
const copySourceStages = ref<RecipeDesignerSeriesStage[]>([])
const copySourceLifeStage = ref('')
const copyTargetStageLabel = ref('')
const copyTargetCardId = ref('')
const copyTargetStage = ref<RecipeDesignerSeriesStage | null>(null)
const copyingItems = ref(false)
const duplicatingStage = ref(false)

const dogOptions = ref<DogProfile[]>([])
const dogLoading = ref(false)

function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function stageTagType(stage: RecipeDesignerSeriesStage): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  if (stage.recipeId) return 'success'
  if (stage.draftId) return 'primary'
  return 'info'
}

function stageStatusLabel(stage: RecipeDesignerSeriesStage): string {
  if (stage.recipeId) return '已发布'
  if (stage.draftId) return '有草稿'
  return '空白'
}

/** 阶段格子底色：已发布=绿底、有草稿=蓝底、空白=灰底 */
function stageCellClass(stage: RecipeDesignerSeriesStage): Record<string, boolean> {
  if (stage.recipeId) return { 'stage-cell-published': true }
  if (stage.draftId) return { 'stage-cell-drafted': true }
  return { 'stage-cell-blank': true }
}

function dogLabel(dog: DogProfile): string {
  return `${dog.name}（${dog.breedName || dog.customBreedName || '未知品种'}，${dog.currentWeightKg}kg）`
}

async function searchDogs(keyword: string) {
  dogLoading.value = true
  try {
    const res = await dogApi.list({ search: keyword, pageSize: 50 })
    dogOptions.value = (res as unknown as { data: DogProfile[] }).data ?? res ?? []
  } catch {
    dogOptions.value = []
  } finally {
    dogLoading.value = false
  }
}

async function loadSeries(reset = true) {
  if (reset) {
    seriesPage.value = 1
    seriesHasMore.value = true
    loading.value = true
  } else {
    if (loadingMore.value || !seriesHasMore.value) return
    loadingMore.value = true
  }
  try {
    const res = await recipeDesignerApi.listSeries({
      status: statusFilter.value,
      page: reset ? 1 : seriesPage.value + 1,
      pageSize: SERIES_PAGE_SIZE,
    })
    const items = Array.isArray(res) ? res : res.items
    series.value = reset ? items : [...series.value, ...items]
    seriesPage.value = reset ? 1 : seriesPage.value + 1
    seriesHasMore.value = Array.isArray(res) ? false : Boolean(res.hasMore)
  } catch {
    series.value = []
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function handleSeriesScroll(event: Event) {
  const el = event.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    void loadSeries(false)
  }
}

/** 状态筛选变化：重置到第一页重新加载 */
function onStatusFilterChange() {
  void loadSeries(true)
}

function openCreateDialog() {
  createForm.name = ''
  createForm.referenceDogId = undefined
  createForm.scenario = undefined
  createDialogVisible.value = true
  searchDogs('')
}

function resetCreateForm() {
  createForm.name = ''
  createForm.referenceDogId = undefined
  createForm.scenario = undefined
}

async function createSeries() {
  const name = createForm.name.trim()
  if (!name) {
    ElMessage.warning('请填写系列名称')
    return
  }
  if (!createForm.referenceDogId) {
    ElMessage.warning('请选择参考爱犬（必选）')
    return
  }
  creating.value = true
  try {
    const card = await recipeDesignerApi.createSeries({
      name,
      referenceDogId: createForm.referenceDogId,
      scenario: createForm.scenario
    })
    ElMessage.success('系列创建成功')
    createDialogVisible.value = false
    // 创建成功后直接进入默认阶段（第一个有草稿的阶段）编辑器
    const targetDraftId = card?.initialDraftId || card?.stages.find((s) => s.draftId)?.draftId
    if (targetDraftId) {
      router.push(`/recipe-designer/series/${card.id}/drafts/${targetDraftId}`)
    } else {
      await loadSeries(true)
    }
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    creating.value = false
  }
}

async function openStage(card: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  if (stage.draftId) {
    // 已有草稿：若草稿为空且该阶段有已发布配方，走后端"自动带入已发布原料"，
    // 避免进入历史遗留的空草稿；否则直接进入该草稿（已发布草稿由编辑器自动创建修订版）
    try {
      const detail = await recipeDesignerApi.getDraft(stage.draftId)
      if (detail.items.length === 0 && stage.recipeId) {
        const draft = await recipeDesignerApi.createSeriesStageDraft(card.id, {
          scenario: stage.scenario
        })
        if (draft?.id) {
          router.push(`/recipe-designer/series/${card.id}/drafts/${draft.id}`)
          return
        }
      }
    } catch {
      // 查询失败则直接进入原草稿
    }
    router.push(`/recipe-designer/series/${card.id}/drafts/${stage.draftId}`)
    return
  }
  try {
    const draft = await recipeDesignerApi.createSeriesStageDraft(card.id, {
      scenario: stage.scenario
    })
    if (draft?.id) {
      router.push(`/recipe-designer/series/${card.id}/drafts/${draft.id}`)
    } else {
      ElMessage.warning('阶段草稿创建失败，请重试')
    }
  } catch {
    // 拦截器已提示
  }
}

async function handleCardCommand(command: string, card: RecipeDesignerSeriesCard) {
  if (command === 'duplicate') {
    try {
      await recipeDesignerApi.duplicateSeries(card.id)
      ElMessage.success('系列已复制')
      await loadSeries(true)
    } catch {
      // 已提示
    }
  } else if (command === 'rename') {
    renameForm.id = card.id
    renameForm.name = card.name
    renameDialogVisible.value = true
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        `删除系列「${card.name}」将同时删除其全部未发布的配方草稿，且不可恢复。请输入系列名称确认：`,
        '删除确认',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      await recipeDesignerApi.deleteSeries(card.id, {
        confirmName: card.name,
        confirmUserVisibleRemoval: true
      })
      ElMessage.success('系列已删除')
      await loadSeries(true)
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      // 其它错误已由拦截器提示
    }
  }
}

async function confirmRename() {
  const name = renameForm.name.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  renaming.value = true
  try {
    await recipeDesignerApi.renameSeries(renameForm.id, { name })
    ElMessage.success('已重命名')
    renameDialogVisible.value = false
    await loadSeries(true)
  } finally {
    renaming.value = false
  }
}

/** 阶段单元格操作：跨阶段复制原料 / 复制该阶段为新系列 */
async function handleStageCommand(
  command: string,
  card: RecipeDesignerSeriesCard,
  stage: RecipeDesignerSeriesStage
) {
  if (command === 'copyItems') {
    openCopyItemsDialog(card, stage)
  } else if (command === 'duplicateStage') {
    try {
      await ElMessageBox.confirm(
        `将「${stage.label}」复制为一个全新的食谱系列（含原料与用量），原系列不受影响。确定继续吗？`,
        '复制为新食谱系列',
        {
          confirmButtonText: '复制',
          cancelButtonText: '取消',
          type: 'info'
        }
      )
    } catch {
      return
    }
    duplicatingStage.value = true
    try {
      await recipeDesignerApi.duplicateSeriesStage(card.id, stage.lifeStage)
      ElMessage.success('已复制为新系列')
      await loadSeries(true)
    } catch {
      // 拦截器已提示
    } finally {
      duplicatingStage.value = false
    }
  }
}

function openCopyItemsDialog(card: RecipeDesignerSeriesCard, targetStage: RecipeDesignerSeriesStage) {
  // 来源阶段：其他有草稿、且非已发布正式版的阶段
  const sources = card.stages.filter(
    (candidate) =>
      candidate.lifeStage !== targetStage.lifeStage &&
      Boolean(candidate.draftId) &&
      !candidate.recipeId
  )
  if (sources.length === 0) {
    ElMessage.info('暂无可复制的来源阶段（其他阶段还没有草稿/原料）')
    return
  }
  copyTargetCardId.value = card.id
  copyTargetStage.value = targetStage
  copyTargetStageLabel.value = targetStage.label
  copySourceStages.value = sources
  copySourceLifeStage.value = sources[0]?.lifeStage ?? ''
  copyItemsDialogVisible.value = true
}

async function confirmCopyItems() {
  if (!copyTargetCardId.value || !copyTargetStage.value || !copySourceLifeStage.value) return
  const card = series.value.find((candidate) => candidate.id === copyTargetCardId.value)
  const targetStage = copyTargetStage.value
  const sourceStage = card?.stages.find((s) => s.lifeStage === copySourceLifeStage.value)
  if (!card || !sourceStage?.draftId || !targetStage) {
    ElMessage.warning('复制信息不完整，请重试')
    return
  }
  copyingItems.value = true
  try {
    // 目标阶段没有草稿时先创建（已发布阶段不在此入口处理）
    let targetDraftId = targetStage.draftId
    if (!targetDraftId) {
      const draft = await recipeDesignerApi.createSeriesStageDraft(card.id, {
        scenario: targetStage.scenario
      })
      targetDraftId = draft?.id ?? ''
    }
    if (!targetDraftId) {
      ElMessage.warning('目标阶段草稿创建失败')
      return
    }
    await recipeDesignerApi.copyStageItemsFromDraft(targetDraftId, {
      sourceDraftId: sourceStage.draftId
    })
    ElMessage.success('已复制原料')
    copyItemsDialogVisible.value = false
    router.push(`/recipe-designer/series/${card.id}/drafts/${targetDraftId}`)
  } catch {
    // 拦截器已提示
  } finally {
    copyingItems.value = false
  }
}

onMounted(() => loadSeries(true))
</script>

<style scoped>
.recipe-designer-list {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  min-height: 120px;
  max-height: calc(100vh - 280px);
  overflow-y: auto;
}
.loadmore-tip {
  text-align: center;
  padding: 10px 0;
  font-size: 12px;
  color: #909399;
}
.series-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px;
  transition: box-shadow 0.2s;
}
.series-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.series-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.series-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0 10px;
  font-size: 12px;
  color: #606266;
}
.dog-chip.muted {
  color: #c0c4cc;
}
.updated-at {
  color: #909399;
}
.stage-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.stage-cell {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 4px;
  text-align: center;
  background: #fafafa;
  min-width: 0;
  overflow: hidden;
}
.stage-cell.stage-clickable {
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.stage-cell.stage-clickable:hover {
  border-color: #a0cfff;
  background: #ecf5ff;
}
.stage-cell.stage-cell-published {
  border-color: #67c23a;
  background: #f0f9eb;
}
.stage-cell.stage-cell-drafted {
  border-color: #409eff;
  background: #ecf5ff;
}
.stage-cell.stage-cell-blank {
  border-color: #ebeef5;
  background: #fafafa;
}
.stage-label {
  font-size: 11px;
  color: #606266;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}
.stage-status .el-tag {
  max-width: 100%;
  min-width: 0;
  padding: 0 5px;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-more {
  flex-shrink: 0;
  padding: 4px;
}
/* 拦截 ⋯ 按钮点击冒泡，避免触发卡片跳转 */
.click-guard {
  display: inline-flex;
  align-items: center;
}
.series-card-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}
.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
}
</style>
