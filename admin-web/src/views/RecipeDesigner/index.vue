<template>
  <div class="recipe-designer-list">
    <div class="page-header">
      <div>
        <h2>食谱列表 &amp; 设计</h2>
        <p class="subtitle">为爱犬档案定制鲜食配方系列，配餐员设计、管理员审核发布</p>
      </div>
      <div class="header-actions">
        <el-button
          v-if="designModeFilter === 'CATALOG' || pendingReferenceDogId"
          type="primary"
          :icon="Plus"
          :loading="creating"
          @click="createSeries"
        >
          新建食谱
        </el-button>
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
    <!--
      从定制订单进来时显示本单进度（2026-10-21）：
      营养师必须知道“这单要设计几份、已经设计了几份”，
      不能只看到一只狗就猜。
    -->
    <el-alert
      v-if="multiOrderProgress"
      class="multi-order-progress-alert"
      type="info"
      :closable="false"
      show-icon
    >
      <template #title>
        本单共 {{ multiOrderProgress.quantity }} 份，已设计 {{ multiOrderProgress.designed }} 份
      </template>
      <div class="multi-order-progress-note">
        {{ multiOrderProgress.quantity - multiOrderProgress.designed > 0
          ? `还差 ${multiOrderProgress.quantity - multiOrderProgress.designed} 份，设计完成后回订单页一次性交付。`
          : '已设计齐全，可以回订单页一次性交付。' }}
      </div>
    </el-alert>

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
            <el-radio-group v-model="designModeFilter" size="small" @change="onDesignModeChange">
              <el-radio-button value="CATALOG">产品线食谱</el-radio-button>
              <el-radio-button value="ORDER">订单定制食谱</el-radio-button>
            </el-radio-group>
            <el-radio-group v-model="statusFilter" size="small" @change="onStatusFilterChange">
              <el-radio-button :value="undefined">全部</el-radio-button>
              <el-radio-button value="DRAFT">草稿</el-radio-button>
              <el-radio-button value="PUBLIC">已发布</el-radio-button>
              <el-radio-button value="PRIVATE_CUSTOM">定制</el-radio-button>
            </el-radio-group>
            <!-- 2026-10-26 需求分类：按系列 / 按需求分类 两种看法，数据源互不影响 -->
            <el-radio-group v-model="viewMode" size="small">
              <el-radio-button value="SERIES">按系列</el-radio-button>
              <el-radio-button value="TAXONOMY">按需求分类</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <TaxonomyView
        v-if="viewMode === 'TAXONOMY'"
        :design-mode="designModeFilter"
        :status="statusFilter"
      />

      <el-empty
        v-if="viewMode === 'SERIES' && loading && series.length === 0"
        description="加载中…"
      />
      <el-empty
        v-else-if="viewMode === 'SERIES' && !loading && series.length === 0"
        :description="emptyDescription"
      />

      <div v-if="viewMode === 'SERIES'" v-loading="loading" class="series-grid">
        <div v-for="card in series" :key="card.id" class="series-card">
          <div class="series-card-head">
            <div class="series-name-wrap">
              <span class="series-name">{{ card.name }}</span>
              <el-tag
                v-if="isTemporarySeriesName(card.name)"
                size="small"
                type="warning"
                effect="plain"
              >
                待改名
              </el-tag>
            </div>
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
          <div v-if="designModeFilter === 'ORDER'" class="order-meta">
            <el-tag size="small" type="success" effect="plain">订单定制</el-tag>
            <span v-if="card.orderNo">订单 {{ card.orderNo }}</span>
            <span v-if="card.orderDogName">🐶 {{ card.orderDogName }}</span>
            <span v-if="card.orderQuantity">共 {{ card.orderQuantity }} 份</span>
            <span v-if="card.orderStatus">· {{ orderStatusLabel(card.orderStatus) }}</span>
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

          <div v-if="designModeFilter === 'CATALOG'" class="release-progress">
            <el-tag size="small" type="info" effect="plain">
              已发布 {{ stageProgressLabel(card) }} 阶段
            </el-tag>
            <el-tag
              v-if="cardPendingStageCount(card) > 0"
              size="small"
              type="warning"
              effect="plain"
            >
              待重新发布 {{ cardPendingStageCount(card) }} 个阶段
            </el-tag>
            <el-tag
              v-else-if="hasCardPendingUpdates(card)"
              size="small"
              type="warning"
              effect="plain"
            >
              待重新发布
            </el-tag>
            <span class="release-progress-hint">
              未发布的阶段可在「发布 / 更新」里查看
            </span>
          </div>

          <div v-if="designModeFilter === 'CATALOG'" class="series-card-actions">
            <el-button size="small" text type="primary" @click="openSeriesReleaseDrawer(card)">{{ seriesReleaseEntryLabel(card) }}</el-button>
            <el-button size="small" text @click="handleCardCommand('duplicate', card)">复制系列</el-button>
            <el-button size="small" text @click="handleCardCommand('rename', card)">重命名</el-button>
            <el-button size="small" text type="danger" @click="handleCardCommand('delete', card)">删除系列</el-button>
          </div>
        </div>
      </div>
      <div v-if="viewMode === 'SERIES' && seriesHasMore" class="loadmore-tip">
        <div ref="loadMoreSentinel" class="load-more-sentinel" />
        <el-button size="small" text :loading="loadingMore" @click="loadSeries(false)">
          {{ loadingMore ? '加载中…' : '加载更多系列' }}
        </el-button>
      </div>
    </el-card>

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

    <!--
      系列发布（2026-10-22 · 两阶段发布）：
      阶段设计先保存进系列仓库，整条系列就绪后由管理员在这里一次性发布。
      卡片上的「系列发布」只负责打开抽屉，能不能发布由 release-readiness 决定。
    -->
    <SeriesReleaseDrawer
      v-model="releaseDrawerVisible"
      :series-id="releaseDrawerSeriesId"
      :series-name="releaseDrawerSeriesName"
      @released="handleSeriesReleased"
      @updated="handleSeriesUpdated"
      @saved="handleSeriesUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, Plus, Search } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { resolveCopySourceStages } from '@/utils/recipeDesigner/copySourceStages'
import { resolveDogScenarioFromDetail } from '@/utils/recipeDesigner/dogScenario'
import {
  buildTemporarySeriesName,
  isTemporarySeriesName
} from '@/utils/recipeDesigner/seriesName'
import { dogApi } from '@/api/dogs'
import { customRecipeApi } from '@/api/customRecipe'
import SeriesReleaseDrawer from './components/SeriesReleaseDrawer.vue'
import TaxonomyView from './components/TaxonomyView.vue'
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  type FediafDogScenario,
  type RecipeDesignerSeriesCard,
  type RecipeDesignerSeriesStage,
  type RecipeDesignerSeriesStatusFilter
} from '@/types/recipeDesigner'

const router = useRouter()
const route = useRoute()

/** 从定制订单进入时的“共 N 份 / 已设计 X 份”进度 */
const multiOrderProgress = ref<{
  orderId: string
  quantity: number
  designed: number
} | null>(null)

/** 从定制单进入时，后续跳编辑器也要带上 orderId，用来锁定参考爱犬 */
const entryOrderId = ref('')

const loading = ref(false)
const loadingMore = ref(false)
const creating = ref(false)
const renaming = ref(false)
const series = ref<RecipeDesignerSeriesCard[]>([])
const designModeFilter = ref<'CATALOG' | 'ORDER'>('CATALOG')
/** 2026-10-26：列表与需求分类是同一页的两种看法 */
const viewMode = ref<'SERIES' | 'TAXONOMY'>('SERIES')
const statusFilter = ref<RecipeDesignerSeriesStatusFilter | undefined>(undefined)
const searchKeyword = ref('')
const seriesPage = ref(1)
const seriesHasMore = ref(true)
const SERIES_PAGE_SIZE = 20
const loadMoreSentinel = ref<HTMLElement | null>(null)
let seriesObserver: IntersectionObserver | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null

/** 从订单入口带入的参考爱犬：不弹窗，点“新建食谱”时直接使用。 */
const pendingReferenceDogId = ref<string | null>(null)
const pendingReferenceDogName = ref<string | null>(null)
const pendingScenario = ref<FediafDogScenario | undefined>(undefined)

const renameDialogVisible = ref(false)
const renameForm = reactive<{ id: string; name: string }>({ id: '', name: '' })

// 系列发布（阶段设计先入系列仓库，整条系列就绪后一次性发布）
const releaseDrawerVisible = ref(false)
const releaseDrawerSeriesId = ref('')
const releaseDrawerSeriesName = ref('')

// 跨阶段复制原料
const copyItemsDialogVisible = ref(false)
const copySourceStages = ref<RecipeDesignerSeriesStage[]>([])
const copySourceLifeStage = ref('')
const copyTargetStageLabel = ref('')
const copyTargetCardId = ref('')
const copyTargetStage = ref<RecipeDesignerSeriesStage | null>(null)
const copyingItems = ref(false)
const duplicatingStage = ref(false)


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

/**
 * 卡片上的阶段进度：只用列表接口已经返回的数据，不额外为每张卡片拉 readiness。
 * 精确的必填阶段就绪数（READY + PUBLIC）由抽屉打开后按后端门槛展示。
 */
function stageProgressLabel(card: RecipeDesignerSeriesCard): string {
  const total = Array.isArray(card.stages) ? card.stages.length : 0
  const published = Number(card.publishedStageCount) || 0
  return `${Math.min(published, total)}/${total}`
}

/**
 * 卡片上的待更新阶段数（2026-10-22）。
 *
 * 列表接口目前不返回这些字段，所以**只在卡片真有数据时**才展示；
 * 前端不为了这个数字给每张卡片额外拉一次 readiness。
 */
function cardPendingStageCount(card: RecipeDesignerSeriesCard): number {
  const count = Number(card.pendingStageCount)
  if (Number.isFinite(count) && count > 0) return Math.trunc(count)
  if (Array.isArray(card.pendingStageCodes)) return card.pendingStageCodes.length
  return 0
}

function hasCardPendingUpdates(card: RecipeDesignerSeriesCard): boolean {
  return (
    card.releaseState === 'NEEDS_UPDATE' ||
    card.hasPendingUpdates === true ||
    cardPendingStageCount(card) > 0
  )
}

/** 卡片入口文案：已上线叫「更新」，未上线叫「发布」（设计 6.1） */
function seriesReleaseEntryLabel(card: RecipeDesignerSeriesCard): string {
  return card.businessStatus === 'PUBLIC' ? '更新' : '发布'
}

function openSeriesReleaseDrawer(card: RecipeDesignerSeriesCard): void {
  releaseDrawerSeriesId.value = card.id
  releaseDrawerSeriesName.value = card.name
  releaseDrawerVisible.value = true
}

/** 发布成功后刷新列表：卡片状态与阶段进度立即反映整系列已发布 */
async function handleSeriesReleased(): Promise<void> {
  await loadSeries(true)
}

/** 下架 / 系列状态变化后刷新列表，卡片入口文案与进度同步更新 */
async function handleSeriesUpdated(): Promise<void> {
  await loadSeries(true)
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
      designMode: designModeFilter.value,
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
function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    IN_PROGRESS: '制作中',
    DELIVERED: '已交付',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中'
  }
  return labels[status] ?? status
}

function onStatusFilterChange() {
  void loadSeries(true)
}

/** 切换产品线 / 订单定制：回到第一页并清空状态筛选，避免两种上下文混用 */
function onDesignModeChange() {
  statusFilter.value = undefined
  void loadSeries(true)
}

/** 名称搜索：输入停顿 300ms 后自动搜索（清空按钮立即生效） */
watch(searchKeyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadSeries(true)
  }, 300)
})

const emptyDescription = computed(() => {
  if (designModeFilter.value === 'ORDER') {
    return searchKeyword.value.trim()
      ? `没有找到包含「${searchKeyword.value.trim()}」的订单定制系列`
      : '还没有订单定制系列；请从订单设计工作台创建设计'
  }
  return searchKeyword.value.trim()
    ? `没有找到名称、原料或爱犬包含「${searchKeyword.value.trim()}」的设计系列`
    : '还没有设计系列，点击右上角「新建食谱」开始'
})

async function createSeries() {
  // 一键创建：不再弹「参考爱犬 / 默认阶段」。
  // 产品线默认普通成年犬；参考爱犬只在从订单带入时使用，阶段由后端/编辑器再切。
  const referenceDogId = pendingReferenceDogId.value || undefined
  // 临时名固定 12 个字（含日期时间）；狗名放在卡片标签上，不塞进名字
  const name = buildTemporarySeriesName()
  creating.value = true
  try {
    const card = await recipeDesignerApi.createSeries({
      name,
      referenceDogId,
      scenario: pendingScenario.value
    })
    ElMessage.success(
      referenceDogId
        ? '食谱创建成功，已按参考爱犬带出默认阶段；可在编辑器切换阶段。'
        : '食谱创建成功，默认阶段为普通成年犬；可在编辑器切换阶段、设置参考爱犬。'
    )
    pendingReferenceDogId.value = null
    pendingReferenceDogName.value = null
    pendingScenario.value = undefined
    const targetDraftId = card?.initialDraftId || card?.stages.find((s) => s.draftId)?.draftId
    if (targetDraftId) {
      router.push(draftRoute(card.id, targetDraftId))
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
  // 订单定制列表进入时，把业务订单号带进编辑器：锁狗、显示本单进度。
  entryOrderId.value =
    designModeFilter.value === 'ORDER' && card.orderNo ? card.orderNo : ''
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
          router.push(draftRoute(card.id, draft.id))
          return
        }
      }
    } catch {
      // 查询失败则直接进入原草稿
    }
    router.push(draftRoute(card.id, stage.draftId))
    return
  }
  try {
    const draft = await recipeDesignerApi.createSeriesStageDraft(card.id, {
      scenario: stage.scenario
    })
    if (draft?.id) {
      router.push(draftRoute(card.id, draft.id))
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
      router.push(draftRoute(card.id, targetDraftId))
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
function draftRoute(seriesId: string, draftId: string) {
  const base = `/recipe-designer/series/${seriesId}/drafts/${draftId}`
  return entryOrderId.value
    ? `${base}?orderId=${encodeURIComponent(entryOrderId.value)}`
    : base
}

async function applyEntryQuery() {
  const dogId = String(route.query.dogId || '').trim()
  const orderId = String(route.query.orderId || '').trim()
  entryOrderId.value = orderId

  // 从订单带入参考爱犬：不弹窗，点“新建食谱”时直接使用；
  // 犬的生命阶段能推断就带出，推断不出来再用普通成年犬默认值。
  if (dogId) {
    pendingReferenceDogId.value = dogId
    try {
      const res: any = await dogApi.getDetail(dogId)
      const detail = res?.data ?? res
      pendingReferenceDogName.value = detail?.profile?.name ?? null
      pendingScenario.value = resolveDogScenarioFromDetail(detail) ?? undefined
    } catch {
      pendingReferenceDogName.value = null
      pendingScenario.value = undefined
    }
  }

  /**
   * 从订单进来时带上本单份数与已设计数量。
   *
   * 数量以订单为准，已设计数量以“可交付候选”接口为准；
   * 两个接口失败都不影响设计器主流程，最多是不显示这条提示。
   */
  if (orderId) {
    try {
      const [order, candidates] = await Promise.all([
        customRecipeApi.getOrderDetail(orderId),
        customRecipeApi.listRecipeCandidates(orderId),
      ])
      const quantity = Number((order as any)?.recipeQuantity ?? 1)
      multiOrderProgress.value = {
        orderId,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        designed: Array.isArray(candidates) ? candidates.length : 0,
      }
    } catch {
      multiOrderProgress.value = null
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
.multi-order-progress-alert {
  margin-bottom: 16px;
}

.multi-order-progress-note {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
}


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
.series-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.series-name-wrap .el-tag {
  flex-shrink: 0;
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
.release-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}
.release-progress-hint {
  font-size: 12px;
  color: #c0c4cc;
}
.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
}
.create-name-tip {
  margin-left: 96px;
  margin-bottom: 8px;
}

.order-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0 4px;
  font-size: 12px;
  color: #606266;
}
</style>
