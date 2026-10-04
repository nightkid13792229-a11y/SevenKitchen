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

    <!--
      顾客改了健康信息 → 告知营养师（2026-10-04 第四期接线）。

      老板第 25 条："顾客改了健康信息，要实时告知正在为该狗设计食谱的营养师。"

      ⚠️ 这块的后端接口**早就实现好了**（staff-dog-health.controller.ts 的
      /admin/dogs/health-updates，前端 api 也封装好了），
      但**全 admin-web 没有任何页面调用它** —— 属于"能力已建、UI 从未接线"。
      过敏信息直接影响配方能不能用，这条提醒必须真的出现在营养师眼前。
    -->
    <el-alert
      v-if="healthUpdates.length > 0"
      class="health-update-alert"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #title>
        最近 {{ HEALTH_UPDATE_DAYS }} 天有 {{ healthUpdates.length }} 只正在设计的狗狗改了健康信息
      </template>
      <div class="health-update-list">
        <div
          v-for="item in healthUpdates"
          :key="item.dogId"
          class="health-update-item"
        >
          <span class="health-update-item__name">{{ item.dogName || '未命名' }}</span>
          <span class="health-update-item__time">{{ formatUpdateTime(item.updatedAt) }}</span>
          <el-button link type="primary" size="small" @click="openDogHealth(item.dogId)">
            看健康档案
          </el-button>
        </div>
      </div>
      <div class="health-update-note">
        过敏信息变了会直接影响配方能不能用，建议先核对再继续设计。
      </div>
    </el-alert>

    <el-card shadow="never" class="list-card">
      <template #header>
        <div class="card-header">
          <span>食谱设计</span>
          <div class="card-header-controls">
            <el-input
              v-model="searchKeyword"
              class="series-search"
              placeholder="搜索系列名称 / 原料 / 参考爱犬"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-radio-group v-model="statusFilter" size="small" @change="onStatusFilterChange">
              <el-radio-button :value="undefined">全部</el-radio-button>
              <el-radio-button value="DRAFT">草稿</el-radio-button>
              <el-radio-button value="PUBLIC">已发布</el-radio-button>
              <el-radio-button value="PRIVATE_CUSTOM">定制</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <el-empty v-if="loading && series.length === 0" description="加载中…" />
      <el-empty v-else-if="!loading && series.length === 0" :description="emptyDescription" />

      <div v-loading="loading" class="series-grid">
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
            <span v-if="card.referenceDogName" class="dog-chip">🐶 {{ card.referenceDogName }}</span>
            <span v-if="historicalDogNames(card)" class="dog-chip muted" :title="`历史参考犬：${historicalDogNames(card)}`">
              曾参考：{{ historicalDogNames(card) }}
            </span>
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
        <div ref="loadMoreSentinel" class="load-more-sentinel" />
        <el-button size="small" text :loading="loadingMore" @click="loadSeries(false)">
          {{ loadingMore ? '加载中…' : '加载更多系列' }}
        </el-button>
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
      <div class="form-tip">
        将把来源阶段的全部原料（含用量与排序）复制到「{{ copyTargetStageLabel }}」，
        并覆盖该阶段已有的原料；复制后直接打开该阶段编辑器
      </div>
      <template #footer>
        <el-button @click="copyItemsDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="copyingItems" @click="confirmCopyItems">复制并打开</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, Plus, Search } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { resolveCopySourceStages } from '@/utils/recipeDesigner/copySourceStages'
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
const route = useRoute()

const loading = ref(false)
const loadingMore = ref(false)
const creating = ref(false)
const renaming = ref(false)
const series = ref<RecipeDesignerSeriesCard[]>([])
const statusFilter = ref<RecipeDesignerSeriesStatusFilter | undefined>(undefined)
const searchKeyword = ref('')
const seriesPage = ref(1)
const seriesHasMore = ref(true)
const SERIES_PAGE_SIZE = 20
const loadMoreSentinel = ref<HTMLElement | null>(null)
let seriesObserver: IntersectionObserver | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null

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

/** 历史上参考过该系列的狗狗名称（不含当前参考犬），用于卡片提示 */
function historicalDogNames(card: RecipeDesignerSeriesCard): string {
  const names = card.referenceDogNames ?? []
  if (names.length <= 1) return ''
  return names.slice(1).join('、')
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
      search: searchKeyword.value.trim() || undefined,
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

/** 用 IntersectionObserver 监听底部哨兵，接近时自动加载下一页（不依赖具体滚动容器） */
function setupSeriesObserver() {
  if (typeof IntersectionObserver === 'undefined') return
  if (seriesObserver) seriesObserver.disconnect()
  seriesObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && seriesHasMore.value && !loadingMore.value) {
          void loadSeries(false)
        }
      }
    },
    { rootMargin: '120px' }
  )
  if (loadMoreSentinel.value) seriesObserver.observe(loadMoreSentinel.value)
}

function teardownSeriesObserver() {
  if (seriesObserver) {
    seriesObserver.disconnect()
    seriesObserver = null
  }
}

/** 状态筛选变化：重置到第一页重新加载 */
function onStatusFilterChange() {
  void loadSeries(true)
}

/** 名称搜索：输入停顿 300ms 后自动搜索（清空按钮立即生效） */
watch(searchKeyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadSeries(true)
  }, 300)
})

const emptyDescription = computed(() =>
  searchKeyword.value.trim()
    ? `没有找到名称、原料或爱犬包含「${searchKeyword.value.trim()}」的设计系列`
    : '还没有设计系列，点击右上角「新建设计系列」开始'
)

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
  // 来源阶段：其他已经有原料来源的阶段（有草稿或已有正式版本，含已发布的成熟阶段）
  const sources = resolveCopySourceStages(card.stages, targetStage.lifeStage)
  if (sources.length === 0) {
    ElMessage.info('暂无可复制的来源阶段（其他阶段还没有草稿或正式版本）')
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
  if (!card || !sourceStage || !targetStage) {
    ElMessage.warning('复制信息不完整，请重试')
    return
  }
  copyingItems.value = true
  try {
    // 后端按生命阶段解析来源（优先该阶段草稿，没有草稿时用已发布正式版本），
    // 目标阶段还没有草稿时会自动创建，并返回更新后的目标草稿。
    const targetDraft = await recipeDesignerApi.copySeriesStageIngredients(
      card.id,
      targetStage.lifeStage,
      { sourceLifeStage: sourceStage.lifeStage }
    )
    const targetDraftId = targetDraft?.id ?? targetStage.draftId ?? ''
    ElMessage.success('已复制原料')
    copyItemsDialogVisible.value = false
    if (targetDraftId) {
      router.push(`/recipe-designer/series/${card.id}/drafts/${targetDraftId}`)
    }
  } catch {
    // 拦截器已提示
  } finally {
    copyingItems.value = false
  }
}

/**
 * 从「定制食谱订单」一键进来时（?dogId=xxx&openCreate=1），
 * 预填参考爱犬并直接打开创建对话框。
 *
 * 2026-09-28：此前设计器与定制订单之间**没有任何通路**，
 * 营养师只能手工新建系列、再自己搜出那只狗，"参考顾客信息设计"无从谈起。
 */
async function applyEntryQuery() {
  const dogId = String(route.query.dogId || '').trim()
  if (!dogId) return

  createForm.referenceDogId = dogId
  createDialogVisible.value = true

  await searchDogs('')

  // 目标狗可能不在前 50 条里：单独取一次详情补进选项，
  // 否则下拉框里会显示成一个没有名字的空选项。
  if (!dogOptions.value.some((dog) => dog.id === dogId)) {
    try {
      const res: any = await dogApi.getDetail(dogId)
      const profile = res?.data?.profile ?? res?.profile ?? null
      if (profile?.id) {
        dogOptions.value = [profile as DogProfile, ...dogOptions.value]
      }
    } catch {
      // 取不到详情也不阻断：referenceDogId 已经填上了
    }
  }
}

/**
 * 健康信息变更提醒（2026-10-04 第四期）。
 *
 * 老板第 25 条："顾客改了健康信息，要实时告知正在为该狗设计食谱的营养师。"
 *
 * 后端接口（/admin/dogs/health-updates）与前端 api 封装**早就有了**，
 * 但全 admin-web 没有任何页面调用它 —— 能力建好了、UI 从未接线。
 * 它返回的是"最近改过健康记录、且带进行中定制单"的狗，
 * 也就是营养师此刻真正需要重新核对的那些。
 */
const HEALTH_UPDATE_DAYS = 7
const healthUpdates = ref<
  Array<{ dogId: string; dogName: string; updatedAt: string }>
>([])

async function loadHealthUpdates() {
  try {
    const res: any = await dogApi.listHealthUpdates(HEALTH_UPDATE_DAYS)
    const items = res?.data?.items
    healthUpdates.value = Array.isArray(items) ? items : []
  } catch {
    // 提醒拉不到不影响设计系列列表本身
    healthUpdates.value = []
  }
}

/** 相对时间：营养师要的是"多久之前改的"，不是具体时间戳 */
function formatUpdateTime(value: string) {
  const at = new Date(value).getTime()
  if (!Number.isFinite(at)) return ''
  const diffMinutes = Math.floor((Date.now() - at) / 60000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  return `${Math.floor(diffHours / 24)} 天前`
}

function openDogHealth(dogId: string) {
  router.push(`/dogs/${dogId}/health`)
}

onMounted(async () => {
  await loadSeries(true)
  setupSeriesObserver()
  void applyEntryQuery()
  // 健康信息变更提醒（2026-10-04 第四期）。
  // 不 await：它是辅助信息，不该拖慢设计系列列表的首屏。
  void loadHealthUpdates()
})

onBeforeUnmount(() => {
  teardownSeriesObserver()
  if (searchTimer) clearTimeout(searchTimer)
})</script>

<style scoped>
/* 健康信息变更提醒（2026-10-04 第四期） */
.health-update-alert {
  margin-bottom: 16px;
}
.health-update-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.health-update-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.health-update-item__name {
  font-weight: 600;
}
.health-update-item__time {
  color: #909399;
  font-size: 12px;
}
.health-update-note {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

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
.card-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.series-search {
  width: 280px;
}
.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  min-height: 120px;
}
.loadmore-tip {
  text-align: center;
  padding: 10px 0;
  font-size: 12px;
  color: #909399;
}
.load-more-sentinel {
  height: 1px;
  width: 100%;
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
.dog-chip {
  display: inline-flex;
  align-items: center;
  background: #f4f4f5;
  border-radius: 10px;
  padding: 2px 10px;
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
