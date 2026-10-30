<template>
  <div class="designer-editor">
    <div class="editor-header">
      <el-button :icon="ArrowLeft" text @click="goBack">返回</el-button>
      <div class="header-info">
        <span class="draft-name">{{ seriesDisplayName }}</span>
        <el-button
          v-if="draft?.seriesId"
          size="small"
          text
          :icon="EditPen"
          class="rename-series-btn"
          @click="openRenameDialog"
        >改名</el-button>
        <!--
          设计模式标识（2026-10-29）：产品线 / 订单定制一目了然。
          订单定制还会在下方显示本单横幅；这里的标签保证两种模式都有明确归属。
        -->
        <el-tag
          size="small"
          effect="plain"
          :type="isOrderDesign ? 'warning' : 'primary'"
          class="design-mode-tag"
          :title="isOrderDesign
            ? '订单定制食谱：绑定顾客订单，不上橱窗'
            : '产品线食谱：按生命阶段设计，入仓后可整系列发布'"
        >{{ isOrderDesign ? '订单定制' : '产品线' }}</el-tag>
        <span v-if="draft?.seriesLifeStage" class="stage-tag">
          {{ stageLabel }}
        </span>
        <el-dropdown v-if="stageSwitchVisible" trigger="click" @command="handleSwitchStage">
          <el-button size="small" class="stage-switch-btn" :loading="switchingStage">
            切换阶段<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="(label, key) in FEDIAF_DOG_SCENARIO_LABELS"
                :key="key"
                :command="key"
                :disabled="key === draft?.fediafDogScenario"
              >
                {{ label }}<span v-if="key === draft?.fediafDogScenario" class="stage-current">（当前）</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="header-right">
        <el-button
          text
          :icon="RefreshLeft"
          :disabled="!canUndo"
          @click="undo"
        >撤销</el-button>
        <el-button
          text
          :icon="RefreshRight"
          :disabled="!canRedo"
          @click="redo"
        >重做</el-button>
        <!--
          上线检查：产品线（CATALOG）与本单设计（ORDER）共用公共门槛，
          并分别检查展示资料与各自的分支条件（产品线文案 / 订单信息）。
        -->
        <el-button
          text
          :type="launchReadinessVisible ? 'primary' : 'default'"
          :icon="CircleCheck"
          :disabled="!draft"
          :loading="launchCheckOpening"
          title="公共门槛 + 展示资料 + 分支条件（产品线文案或订单信息）"
          @click="openLaunchReadiness"
        >上线检查</el-button>
        <el-button
          text
          :type="agentDrawerVisible ? 'primary' : 'default'"
          :icon="MagicStick"
          :disabled="!draft"
          @click="agentDrawerVisible = true"
        >AI 设计对话</el-button>
        <span class="save-status" :class="saveStatus">
          <el-icon v-if="saveStatus === 'saving'"><Loading /></el-icon>
          <el-icon v-else-if="saveStatus === 'error'"><WarningFilled /></el-icon>
          <el-icon v-else><CircleCheckFilled /></el-icon>
          {{ saveStatusText }}
        </span>
      </div>
    </div>

    <!--
      本单设计模式（2026-10-22）：
      从订单设计工作台进入的草稿锁定本单狗狗，草稿本身不直接发布到橱窗；
      管理员在这里把这一份「加入本单待提交」，N 份齐了再回工作台一次性交付。
    -->
    <div v-if="orderId" class="order-design-banner">
      <div class="order-design-banner__info">
        <span class="order-design-banner__badge">本单设计</span>
        <span class="order-design-banner__order">订单 {{ orderId }}</span>
        <span v-if="orderDesignWorkspace?.dogName" class="order-design-banner__dog">
          · {{ orderDesignWorkspace.dogName }}
        </span>
        <span>· 本单 {{ orderDesignWorkspace?.quantity ?? 0 }} 份</span>
        <span>· 已就绪 {{ orderDesignWorkspace?.readyCount ?? 0 }} / {{ orderDesignWorkspace?.quantity ?? 0 }} 份</span>
        <el-tag
          v-if="currentOrderSlot"
          size="small"
          :type="orderDesignStatusTagType(currentOrderSlot.status)"
          effect="plain"
        >
          {{ orderDesignStatusLabel(currentOrderSlot.status) }}
        </el-tag>
      </div>
      <div class="order-design-banner__actions">
        <span v-if="!isAdmin" class="order-design-banner__lock">
          {{ ADMIN_ONLY_TIP }}：加入本单待提交
        </span>
        <el-button size="small" text @click="backToOrderWorkspace">
          返回本单工作台
        </el-button>
      </div>
      <div
        v-if="currentOrderSlot?.stageWarning"
        class="order-design-banner__warning"
      >
        {{ currentOrderSlot.stageWarning }}（只提示，不影响加入待提交）
      </div>
    </div>

    <div class="editor-body">
      <!-- 左：原料库 -->
      <div class="pane pane-library" :style="{ width: paneWidths.library + 'px' }">
        <div class="pane-title">原料库</div>
        <IngredientLibrary :scenario="draft?.fediafDogScenario" @add="handleAddOption" />
      </div>

      <div
        class="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整原料库与配方明细的宽度"
        title="拖动调整栏宽，双击恢复默认"
        @pointerdown="startPaneResize('library-items', $event)"
        @dblclick="resetPaneWidths('library-items')"
      ></div>

      <!-- 中：配方编辑 -->
      <div ref="itemsPaneRef" class="pane pane-items">
        <div class="pane-title">
          配方明细
          <span class="item-count">
            原料 {{ items.length }} 种<span v-if="items.length">（食材 {{ foodItemCount }} · 补剂 {{ supplementItemCount }}）</span> · 总重 {{ includedTotalWeightText }}
          </span>
        </div>
        <div v-loading="initialLoading" class="item-list">
          <el-empty v-if="!initialLoading && items.length === 0" description="从左侧原料库点击食材加入配方" />
          <template v-if="items.length > 0">
            <!--
              列头（2026-10-29）：只在有原料时出现；
              排序 / 操作两列按老板要求不写字，只留位置。
            -->
            <div class="item-col-head">
              <div class="col-cell" aria-hidden="true"></div>
              <div class="col-cell col-center">类型</div>
              <div class="col-cell">原料 / 营养档案</div>
              <div
                class="col-cell"
                title="按「部位 / 状态 / 预处理」顺序填写，例如：牛里脊/生/去油"
              >预处理方式<span class="col-hint">?</span></div>
              <div class="col-cell col-center">用量</div>
              <div class="col-cell col-right">占比</div>
              <div class="col-cell col-center">计入评估</div>
              <div class="col-cell" aria-hidden="true"></div>
            </div>
            <div class="item-list-body">
              <draggable
                v-model="items"
                item-key="id"
                handle=".drag-handle"
                animation="150"
                ghost-class="drag-ghost"
                @start="handleReorderStart"
                @end="handleReorder"
              >
                <template #item="{ element, index }">
                  <div class="item-row" :class="{ 'item-row-excluded': element.includeInAssessment === false }">
                    <div class="drag-handle">
                      <el-icon><Rank /></el-icon>
                    </div>
                    <span class="item-type-tag" :class="itemTypeTagClass(element)">{{ itemTypeLabel(element) }}</span>
                    <div class="item-main">
                      <div class="item-name">{{ itemDisplayName(element) }}</div>
                      <div class="item-meta">
                        <span class="item-profile-name">{{ itemProfileName(element) }}</span>
                      </div>
                    </div>
                    <!--
                      预处理方式与重量 / 占比 / 开关 / 删除同排（2026-10-22）：
                      名称和营养档案留在左侧；名称下面不再放预处理控件。
                      Tab 顺序只保留每行的重量输入：其余控件显式 tabindex=-1
                      （ElAutocomplete / ElSwitch 均支持 tabindex prop，ElButton 透传原生属性）。
                    -->
                    <div class="item-controls">
                      <div class="item-preparation-inline">
                        <!-- 宽屏由列头说明（见 --item-grid）；窄屏列头收起时才显示 -->
                        <span class="preparation-label" :title="PREPARATION_FIELD_LABEL">{{ PREPARATION_FIELD_LABEL }}</span>
                        <!--
                          2026-10-26：输入框直接显示原文字，历史文案作为下拉建议。
                          不再从字典选择，也不再显示「人工/自动」来源标签。
                        -->
                        <PreparationMethodField
                          class="preparation-method-field"
                          :model-value="element.preparationMethod || ''"
                          :label="element.preparationMethodLabel || ''"
                          :ingredient-id="element.ingredientId"
                          :tabindex="-1"
                          @change="(value: string | null) => onPreparationMethodChange(element, value)"
                        />
                      </div>
                      <div class="weight-editor">
                        <el-input-number
                          :model-value="element.weightG"
                          :min="0"
                          :precision="2"
                          :controls="false"
                          size="small"
                          class="weight-input"
                          @update:model-value="(value: number | undefined) => onWeightChange(element, value)"
                        />
                        <span class="weight-unit">{{ itemUnitLabel(element) }}</span>
                      </div>
                      <div class="item-ratio-column">
                        <span v-if="shouldShowWeightRatio(element)" class="item-ratio">{{ weightRatioLabel(element) }}</span>
                      </div>
                      <div class="item-action-stack">
                        <el-switch
                          :model-value="element.includeInAssessment !== false"
                          size="small"
                          :tabindex="-1"
                          @change="(value: string | number | boolean) => onToggleInclude(element, Boolean(value))"
                        />
                        <el-button
                          size="small"
                          text
                          type="danger"
                          :icon="Delete"
                          :tabindex="-1"
                          @click="handleRemoveItem(element)"
                        />
                      </div>
                    </div>
                    <span
                      v-if="itemPreparationHint(element)"
                      class="item-preparation-hint"
                    >{{ itemPreparationHint(element) }}</span>

                    <!--
                      补剂目标营养素 + 当前实际添加浓度（2026-10-22）：
                      浓度按「评估总重量」实时计算，改用量 / 配方总重 / 目标后自动重算。
                    -->
                    <div v-if="isSupplementItem(element)" class="item-supplement-row">
                      <template v-if="itemSupplementTargetViews(element).length">
                        <el-tag
                          v-for="target in itemSupplementTargetViews(element)"
                          :key="target.fieldPath"
                          size="small"
                          :type="target.valuePerKg === null ? 'danger' : 'warning'"
                          effect="plain"
                          :title="target.valuePerKg === null ? '当前档案缺该字段或配方总重量未知，无法计算添加浓度' : '每 kg 配方实际添加浓度'"
                        >
                          {{ target.text }}
                        </el-tag>
                      </template>
                      <span v-else class="item-target-missing">
                        未设置目标营养素（保存 / 发布会被拒绝）
                      </span>
                      <el-button
                        size="small"
                        text
                        type="primary"
                        :tabindex="-1"
                        @click="openSupplementTargetEditor(element)"
                      >修改目标</el-button>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
          </template>
        </div>
      </div>

      <div
        class="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整配方明细与关键比例仪表的宽度"
        title="拖动调整栏宽，双击恢复默认"
        @pointerdown="startPaneResize('items-dashboard', $event)"
        @dblclick="resetPaneWidths('items-dashboard')"
      ></div>

      <!-- 中右：关键比例仪表盘 -->
      <div class="pane pane-dashboard" :style="{ width: paneWidths.dashboard + 'px' }">
        <!--
          「评估中」的细条（批次 5.3）：评估改成后端算之后，
          结果会比按键晚一点点到。不给提示的话，用户会以为数字没变。
          ⚠️ 刻意**不隐藏旧结果** —— 每敲一个字面板闪一下比稍微延迟更难受。
        -->
        <div v-if="assessing" class="assessing-bar" />
        <GaugePanel :assessment="assessment" />
        <MacroCompositionPanel :assessment="assessment" />
      </div>

      <div
        class="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整关键比例仪表与营养评估的宽度"
        title="拖动调整栏宽，双击恢复默认"
        @pointerdown="startPaneResize('dashboard-assessment', $event)"
        @dblclick="resetPaneWidths('dashboard-assessment')"
      ></div>

      <!-- 右：营养评估 -->
      <div class="pane pane-right" :style="{ width: paneWidths.assessment + 'px' }">
        <div class="pane-title">营养评估</div>
        <div class="assessment-pane">
          <AssessmentPanel
            ref="assessmentPanelRef"
            :assessment="assessment"
            :loading-inputs="assessmentLoading"
            :scenario="draft?.fediafDogScenario"
            :on-update-item-weight="applyItemWeight"
            :load-contributors="loadAssessmentContributors"
            @add-ingredient="handleAddOption"
          />
        </div>
      </div>

      <div
        class="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整营养评估与爱犬信息的宽度"
        title="拖动调整栏宽，双击恢复默认"
        @pointerdown="startPaneResize('assessment-dog', $event)"
        @dblclick="resetPaneWidths('assessment-dog')"
      ></div>

      <!-- 最右：爱犬信息 -->
      <div class="pane pane-dog" :style="{ width: paneWidths.dog + 'px' }">
        <div class="pane-title">爱犬信息</div>
        <div class="dog-pane">
          <DogInsightPanel
            :dog-id="referenceDogId"
            :draft-id="draft?.id"
            :series-id="seriesId"
            :lock-reference-dog="Boolean(route.query.orderId)"
            :energy-density-kcal-per-kg="assessment?.energyDensityKcalPerKg ?? null"
            @dog-changed="(dogId: string | null) => (referenceDogId = dogId)"
          />
        </div>
      </div>
    </div>

    <!-- 系列改名（合并命名模型：编辑页与列表、发布页共用同一个系列名） -->
    <el-dialog v-model="renameDialogVisible" title="重命名系列" width="420px">
      <el-input
        v-model="renameForm.name"
        maxlength="12"
        show-word-limit
        placeholder="例如：均衡营养|三文鱼南瓜"
      />
      <div class="rename-hint">
        价值点在前、食材在后，最多 12 个字——多了标签印不下。
      </div>
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="renaming" @click="confirmRename">保存</el-button>
      </template>
    </el-dialog>

    <!--
      添加 / 修改补剂目标营养素（2026-10-22）。
      补剂没有目标就不允许加入配方；预选默认目标或当前评估营养素，仍可多选调整。
    -->
    <SupplementTargetDialog
      v-if="supplementTargetDialog"
      v-model="supplementTargetDialogVisible"
      :mode="supplementTargetDialog.mode"
      :ingredient-name="supplementTargetDialog.ingredientName"
      :nutrition-food-name="supplementTargetDialog.nutritionFoodName"
      :profile="supplementTargetDialog.profile"
      :initial-targets="supplementTargetDialog.initialTargets"
      :saving="supplementDialogSaving"
      @confirm="confirmSupplementTargets"
    />

    <!--
      上线检查（2026-10-22）：读取后端共享发布门槛（发布 / 加入待提交同一套判断）。
      产品线与本单设计都可用；只在当前页打开抽屉，不跳转路由。
    -->
    <LaunchReadinessDrawer
      v-model="launchReadinessVisible"
      :draft-id="currentDraftId"
      :draft-name="draft?.series?.name || draft?.name || ''"
      :order-id="orderId"
      :design-id="designId"
      :series-id="seriesId"
      @published="handleStagePublished"
      @staged="handleOrderStaged"
      @go-to-series-list="goToSeriesListFromCheck"
    />

    <!--
      AI 食谱设计 Agent（P2）：对话式抽屉。
      运行中每 1.5 秒轮询会话；连续工具步骤合并为可折叠执行记录；
      交付确认卡只读展示，复核与发布统一走头部「上线检查」。
    -->
    <RecipeAgentDrawer
      v-model="agentDrawerVisible"
      :draft-id="currentDraftId"
      :dog-id="referenceDogId"
      :series-id="seriesId"
      :lock-reference-dog="Boolean(route.query.orderId)"
      :energy-density-kcal-per-kg="assessment?.energyDensityKcalPerKg ?? null"
      @dog-changed="(dogId: string | null) => (referenceDogId = dogId)"
      @refresh="loadDraft()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowLeft, CircleCheck, CircleCheckFilled, Delete, EditPen, Loading, MagicStick, Rank, RefreshLeft, RefreshRight, WarningFilled } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { CreateRecipeSeriesStageDraftPayload } from '@/api/recipeDesigner'
import { nutritionFoodApi, type NutritionFoodDetail } from '@/api/ingredients'
import { orderRecipeDesignApi } from '@/api/orderRecipeDesign'
import type {
  OrderDesignWorkspace,
  OrderDesignWorkspaceSlot
} from '@/types/orderRecipeDesign'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import {
  orderDesignStatusLabel,
  orderDesignStatusTagType
} from '@/utils/orderRecipeDesign'
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  type DesignRecipeDraftDetail,
  type DesignerItem,
  type DesignerSupplementTarget,
  type FediafDogScenario,
  type IngredientNutritionProfileOption,
  type RecipeDesignerIngredientOption
} from '@/types/recipeDesigner'
import { useRecipeDesignerAssessment } from '@/composables/useRecipeDesignerAssessment'
import { useDesignerSaveQueue } from '@/composables/useDesignerSaveQueue'
import IngredientLibrary from './components/IngredientLibrary.vue'
import AssessmentPanel from './components/AssessmentPanel.vue'
import GaugePanel from './components/GaugePanel.vue'
import MacroCompositionPanel from './components/MacroCompositionPanel.vue'
import DogInsightPanel from './components/DogInsightPanel.vue'
import SupplementTargetDialog from './components/SupplementTargetDialog.vue'
import PreparationMethodField from './components/PreparationMethodField.vue'
import { PREPARATION_FIELD_LABEL } from '@/constants/preparationField'
import { isTemporarySeriesName } from '@/utils/recipeDesigner/seriesName'
import {
  DEFAULT_PANE_WIDTHS,
  PANE_MAX_WIDTH,
  PANE_MIN_WIDTHS,
  resizePaneWidths,
  type PaneSplitterKey,
  type PaneWidths
} from '@/utils/recipeDesigner/paneResize'
import LaunchReadinessDrawer from './components/LaunchReadinessDrawer.vue'
import RecipeAgentDrawer from './components/RecipeAgentDrawer.vue'
import type { DesignRecipeAssessmentResult } from '@/utils/recipeDesigner/assessmentTypes'
import {
  computeSupplementTargetConcentration,
  formatSupplementTargetConcentration,
  listSupplementTargetFieldCandidates,
  normalizeSupplementTargetDefinitions,
  readDefaultSupplementTargets,
  resolveSupplementTargetDefinition,
  resolveSupplementTargetFieldPath,
  type SupplementTargetDefinition
} from '@/utils/recipeDesigner/supplementTargets'
import { preparationBasisMismatchHint } from '@/utils/preparationBasis'

/** 兜底烹饪方式选项（后端未提供时使用） */

// 系列生命阶段 → 中文标签（对应后端 SERIES_LIFE_STAGE_LABELS）
const SERIES_LIFE_STAGE_LABELS: Record<string, string> = {
  PUPPY_UNDER_14_WEEKS: '小于 14 周幼犬',
  PUPPY_14_WEEKS_PLUS: '14 周以上幼犬',
  HIGH_ACTIVITY_ADULT: '普通成年犬',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低能量成年犬 / 老年犬',
  REPRODUCTION: '繁殖期'
}

const route = useRoute()
const router = useRouter()
const draftId = route.params.draftId as string
const seriesId = route.params.seriesId as string
// 从「订单设计工作台」进入时带上的本单上下文（2026-10-22）
const orderId = String(route.query.orderId || '').trim()
const designId = String(route.query.designId || '').trim()
const isAdmin = useIsAdmin()
const orderDesignWorkspace = ref<OrderDesignWorkspace | null>(null)
const stagingReady = ref(false)

const currentOrderSlot = computed<OrderDesignWorkspaceSlot | null>(() => {
  if (!designId || !orderDesignWorkspace.value) return null
  return (
    orderDesignWorkspace.value.slots.find(
      (slot) => slot.designId === designId
    ) ?? null
  )
})

async function loadOrderDesignWorkspace() {
  if (!orderId) return
  try {
    orderDesignWorkspace.value =
      await orderRecipeDesignApi.getWorkspace(orderId)
  } catch {
    // 本单进度拉不到不影响编辑；页面至少还能锁定狗狗继续设计
    orderDesignWorkspace.value = null
  }
}

// 进入已发布草稿会自动跳转到修订版，此后用 currentDraftId 跟随最新草稿
const currentDraftId = ref(draftId)
const agentDrawerVisible = ref(false)

const draft = ref<DesignRecipeDraftDetail | null>(null)
/** 当前设计模式：路由带订单号，或系列本身标记为 ORDER，都算订单定制 */
const isOrderDesign = computed(
  () => Boolean(orderId) || draft.value?.series?.designMode === 'ORDER'
)
/**
 * 顶部「切换阶段」入口（2026-10-30）。
 *
 * 产品线：沿用「按阶段另开一份草稿」；订单定制：原地换这一份草稿的阶段，
 * 所以两种模式都要给入口。已交付的那一份不给换（要改只能走售后改稿重新打开）。
 */
const stageSwitchVisible = computed(
  () =>
    Boolean(draft.value) &&
    (!orderId ||
      (Boolean(designId) && currentOrderSlot.value?.status !== 'DELIVERED'))
)
const items = ref<DesignerItem[]>([])
/** 原料对象内部字段变更的修订号；watch 必须显式读它，否则改开关不会触发评估 */
const itemsRevision = ref(0)

/**
 * 补剂目标营养素弹窗上下文（2026-10-22）。
 *
 * add = 从原料库 / 智能添加进入，确认后才真正调用 addItem；
 * edit = 修改已有补剂项的目标，保存时调用 updateItem。
 */
interface SupplementTargetDialogState {
  mode: 'add' | 'edit'
  ingredientId?: string
  itemId?: string
  nutritionFoodId: string
  ingredientName: string
  nutritionFoodName: string
  profile: unknown
  initialTargets: SupplementTargetDefinition[]
  weightG: number
}
const supplementTargetDialog = ref<SupplementTargetDialogState | null>(null)
const supplementDialogSaving = ref(false)
const supplementTargetDialogVisible = computed({
  get: () => Boolean(supplementTargetDialog.value),
  set: (visible: boolean) => {
    if (!visible) supplementTargetDialog.value = null
  }
})
const nutritionFoodDetailCache = new Map<string, Promise<NutritionFoodDetail>>()

async function loadNutritionFoodDetail(
  nutritionFoodId: string
): Promise<NutritionFoodDetail> {
  const cached = nutritionFoodDetailCache.get(nutritionFoodId)
  if (cached) return cached

  const request = nutritionFoodApi.getDetail(nutritionFoodId).catch((error) => {
    nutritionFoodDetailCache.delete(nutritionFoodId)
    throw error
  })
  nutritionFoodDetailCache.set(nutritionFoodId, request)
  return request
}
const initialLoading = ref(true)

/* ---------- 五栏栏宽拖拽（2026-10-29） ---------- */
const PANE_WIDTH_STORAGE_KEY = 'recipe-designer:pane-widths:v1'
const paneWidths = reactive<PaneWidths>({ ...DEFAULT_PANE_WIDTHS })
const itemsPaneRef = ref<HTMLElement | null>(null)
let stopPaneResize: (() => void) | null = null

/** 读回上次的栏宽；存储损坏或数值异常就按默认宽度，不打断页面 */
function restorePaneWidths() {
  try {
    const raw = localStorage.getItem(PANE_WIDTH_STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<PaneWidths>
    for (const key of Object.keys(DEFAULT_PANE_WIDTHS) as (keyof PaneWidths)[]) {
      const value = Number(saved?.[key])
      if (Number.isFinite(value)) {
        paneWidths[key] = Math.min(
          Math.max(value, PANE_MIN_WIDTHS[key]),
          PANE_MAX_WIDTH
        )
      }
    }
  } catch {
    // 忽略：按默认栏宽继续
  }
}

function persistPaneWidths() {
  try {
    localStorage.setItem(PANE_WIDTH_STORAGE_KEY, JSON.stringify(paneWidths))
  } catch {
    // 隐私模式 / 存储被禁用：拖动本身仍然生效，只是下次不记得
  }
}

/**
 * 拖动分界调整栏宽。
 * 拖动过程始终以「按下时的宽度 + 总位移」计算，不累加每一帧，避免误差越拖越大。
 */
function startPaneResize(splitter: PaneSplitterKey, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  stopPaneResize?.()
  const startX = event.clientX
  const startWidths: PaneWidths = { ...paneWidths }
  const itemsWidth = itemsPaneRef.value?.getBoundingClientRect().width ?? 0
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  const splitterEl = event.currentTarget as HTMLElement | null
  // 捕获指针：拖出浏览器窗口再松手也能正常收尾
  try {
    splitterEl?.setPointerCapture(event.pointerId)
  } catch {
    // 个别浏览器/合成事件不支持捕获，退回普通监听
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handleMove = (moveEvent: PointerEvent) => {
    Object.assign(
      paneWidths,
      resizePaneWidths(splitter, startWidths, moveEvent.clientX - startX, itemsWidth)
    )
  }
  const finish = () => {
    try {
      splitterEl?.releasePointerCapture(event.pointerId)
    } catch {
      // 已经释放或浏览器不支持：忽略
    }
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    stopPaneResize = null
    persistPaneWidths()
  }
  stopPaneResize = finish
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}

/** 双击分界：把这条分界两侧的栏恢复默认宽度 */
function resetPaneWidths(splitter: PaneSplitterKey) {
  if (splitter === 'library-items') {
    paneWidths.library = DEFAULT_PANE_WIDTHS.library
  }
  if (splitter === 'items-dashboard') {
    paneWidths.dashboard = DEFAULT_PANE_WIDTHS.dashboard
  }
  if (splitter === 'dashboard-assessment') {
    paneWidths.dashboard = DEFAULT_PANE_WIDTHS.dashboard
    paneWidths.assessment = DEFAULT_PANE_WIDTHS.assessment
  }
  if (splitter === 'assessment-dog') {
    paneWidths.assessment = DEFAULT_PANE_WIDTHS.assessment
    paneWidths.dog = DEFAULT_PANE_WIDTHS.dog
  }
  persistPaneWidths()
}
/** 切换生命阶段中 */
const switchingStage = ref(false)

/** 合并命名模型：详情页显示系列名（草稿名自动跟随系列名） */
const seriesDisplayName = computed(() => {
  const seriesName = draft.value?.series?.name?.trim()
  return seriesName || draft.value?.name || '加载中…'
})

const renameDialogVisible = ref(false)
const renameForm = reactive({ name: '' })
const renaming = ref(false)

function openRenameDialog() {
  const current = seriesDisplayName.value === '加载中…' ? '' : seriesDisplayName.value
  // 临时名只是占位，清空让用户直接填正式名称
  renameForm.name = isTemporarySeriesName(current) ? '' : current
  renameDialogVisible.value = true
}

async function confirmRename() {
  const name = renameForm.name.trim()
  if (!name) {
    ElMessage.warning('请填写系列名称')
    return
  }
  if (!draft.value?.seriesId) {
    ElMessage.error('该草稿不属于任何系列，无法改名')
    return
  }
  renaming.value = true
  try {
    await recipeDesignerApi.renameSeries(draft.value.seriesId, { name })
    if (draft.value.series) draft.value.series.name = name
    draft.value.name = name
    renameDialogVisible.value = false
    ElMessage.success('系列名称已更新，旗下所有配方同步生效')
  } catch (error) {
    ElMessage.error('改名失败，请重试')
  } finally {
    renaming.value = false
  }
}

const {
  loadInputs,
  refreshInputs,
  loadingInputs: assessmentLoading,
  inputsError,
  assessment,
  assessing,
  assessError,
  schedule: scheduleAssessment,
  compute: computeAssessment,
  loadContributors: loadContributorsFromApi,
  dispose: disposeAssessment
} = useRecipeDesignerAssessment()
const {
  saveStatus,
  willAutoRetry,
  enqueue,
  flushNow,
  hasPending,
  cancelPendingRemove,
  cancelBatchOrders,
  cancelItemOps
} = useDesignerSaveQueue()

async function loadAssessmentContributors(nutrientKey: string) {
  if (!draft.value) return []
  return loadContributorsFromApi(
    draft.value.fediafDogScenario,
    draft.value.id,
    items.value,
    nutrientKey
  )
}

/**
 * 营养评估（2026-10-16 批次 5.3 改成**后端算**）
 *
 * 此前是一个**同步 computed**：每次 items 变就当场算一遍。
 * 现在改成防抖请求后端（见 `useRecipeDesignerAssessment` 的文件头：
 * 400ms 防抖 + 保留上次结果 + 只认最后一次响应）。
 *
 * ⚠️ 监听的是 `items` 的**引用**而不是深度 —— 这个页面里 items
 * 每次都是整体替换（`items.value = next`），所以引用变化就够了。
 * 真去做深度监听反而会在批量操作时触发很多次。
 */
watch(
  () => [draft.value?.id, draft.value?.fediafDogScenario, items.value, itemsRevision.value] as const,
  ([draftId, scenario]) => {
    if (!draftId || !scenario) return
    scheduleAssessment(scenario, draftId, items.value)
  }
)

/**
 * 评估输入加载完成后再算一次。
 *
 * 首次进入编辑器时营养档案是异步到达的 —— 不补这一下，
 * 第一次评估会拿着空档案去算，面板整片显示"缺数据"，
 * 要等用户碰一下原料才恢复。
 */
watch(assessmentLoading, (loading) => {
  if (loading) return
  if (!draft.value?.fediafDogScenario) return
  void computeAssessment(
    draft.value.fediafDogScenario,
    draft.value.id,
    items.value
  )
})

/** 离开页面时清掉待执行的防抖任务（免得对着已销毁的组件写状态） */
onBeforeUnmount(() => {
  disposeAssessment()
})

// ---------- 营养评估面板的滚动位置 ----------
// 列表内部 .entry-list 由 AssessmentPanel 自己持有，这里只负责在刷新评估输入前
// 通知它「保住当前滚动位置」：添加/删除原料后评估会重算，面板内容重排会把列表顶回顶部，
// 而用户此刻正停在刚补齐的那一项营养素上。
const assessmentPanelRef = ref<InstanceType<typeof AssessmentPanel> | null>(null)

/** 添加/删除原料后刷新评估输入，并保持营养评估列表的滚动位置不跳回顶部 */
async function refreshInputsKeepingScroll() {
  if (!draft.value) return
  assessmentPanelRef.value?.preserveScrollOnNextAssessmentUpdate()
  await refreshInputs(draft.value.id)
  /**
   * 刷新完立刻重算 —— 新原料的营养档案刚到，
   * 不补这一下面板要等下一次编辑才更新。
   */
  if (draft.value.fediafDogScenario) {
    void computeAssessment(
      draft.value.fediafDogScenario,
      draft.value.id,
      items.value
    )
  }
}

const referenceDogId = ref<string | null>(null)

/**
 * 上线检查抽屉：产品线与本单设计共用同一套后端门槛。
 * 打开前先把待保存修改落盘，避免检查读到上一次保存的版本。
 */
const launchReadinessVisible = ref(false)
const launchCheckOpening = ref(false)
/**
 * 旧版纯文本制作步骤（如果有）。
 * 设计草稿接口当前不返回该字段；没有时传空串，编辑器不显示旧版提示，
 * 也不会把旧文本自动转换为结构化步骤。
 */
const legacyProductionStepsText = computed(() => {
  const legacy = (
    draft.value as
      | (DesignRecipeDraftDetail & { productionSteps?: unknown })
      | null
  )?.productionSteps
  return typeof legacy === 'string' ? legacy.trim() : ''
})

function syncReferenceDog() {
  referenceDogId.value = draft.value?.series?.referenceDogId ?? null
}

/**
 * 计入评估的原料总重（与评估、重量百分比一致）。
 *
 * 2026-10-14：改为排除"按非克单位计量"的补剂（粒 / 片 / 平勺 等）。
 * 它们的 weightG 存的是粒数/片数，不是克重，与食材的克数相加没有意义 ——
 * 实测一道菜里 9.7 粒鱼油胶囊会让总重凭空多出 9.7，而它实际只有几克。
 * 按克计量的补剂（如碳酸钙粉、营养酵母粉）仍然计入。
 */
const includedTotalWeightG = computed(() =>
  items.value
    .filter((item) => item.includeInAssessment !== false)
    .filter((item) => !isNonGramMeasured(item))
    .reduce((sum, item) => sum + Number(item.weightG ?? 0), 0)
)

const includedTotalWeightText = computed(() => {
  const total = includedTotalWeightG.value
  if (total >= 1000) return `${(total / 1000).toFixed(2)}kg`
  return `${Math.round(total)}g`
})

/**
 * 标题里的原料计数（2026-10-29）：总数之外，再拆出食材 / 补剂各多少种。
 * 补剂判定沿用 isSupplementItem，与每行的类型标签保持一致。
 */
const foodItemCount = computed(() => items.value.filter((item) => !isSupplementItem(item)).length)
const supplementItemCount = computed(() => items.value.length - foodItemCount.value)

// ---------- 明细列表显示 ----------

function itemTypeLabel(item: DesignerItem): string {
  return isSupplementItem(item) ? '补剂' : '食材'
}

function itemTypeTagClass(item: DesignerItem): string {
  return isSupplementItem(item) ? 'supplement' : 'food'
}

/** 标准原料名称（与小程序一致） */
function itemDisplayName(item: DesignerItem): string {
  return (
    item.name ||
    item.ingredientName ||
    item.ingredient?.name ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未命名原料'
  )
}

/** 营养档案名称（与小程序一致） */
function itemProfileName(item: DesignerItem): string {
  return (
    item.nutritionFood?.displayNameZh ||
    item.nutritionProfileDisplayName ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未选择营养档案'
  )
}

/** 部位 / 状态 / 预处理文案（后端已把字典 ID 解析成中文） */
function itemPreparationText(item: DesignerItem): string {
  return String(item.preparationMethodLabel || item.preparationMethod || '').trim()
}

/** 部位 / 状态 / 预处理的称重口径与所选营养档案不一致时给出提示 */
function itemPreparationHint(item: DesignerItem): string | null {
  return preparationBasisMismatchHint(
    itemPreparationText(item),
    item.nutritionFood?.preparationState ?? null
  )
}

/** 重量百分比：仅食材（非补剂）且计入评估、总重大于 0 时显示 */
function shouldShowWeightRatio(item: DesignerItem): boolean {
  if (isSupplementItem(item)) return false
  if (item.includeInAssessment === false) return false
  const weight = Number(item.weightG ?? 0)
  return includedTotalWeightG.value > 0 && weight > 0
}

function weightRatioLabel(item: DesignerItem): string {
  const percent = (Number(item.weightG ?? 0) / includedTotalWeightG.value) * 100
  const rounded = Math.round(percent * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'pending':
      return '待保存'
    case 'saving':
      return '保存中…'
    case 'error':
      return willAutoRetry.value ? '保存失败，自动重试中' : '保存失败，请重试'
    default:
      return '已保存'
  }
})

const stageLabel = computed(() => {
  const stage = draft.value?.seriesLifeStage || ''
  return SERIES_LIFE_STAGE_LABELS[stage] ?? stage
})

// ---------- 撤销 / 重做 ----------
type HistoryEntry =
  | { type: 'add'; item: DesignerItem }
  | { type: 'remove'; item: DesignerItem; index: number }
  | {
      type: 'update'
      itemId: string
      field: 'weightG' | 'preparationMethod' | 'includeInAssessment'
      before: unknown
      after: unknown
    }
  | { type: 'reorder'; before: string[]; after: string[] }

const HISTORY_LIMIT = 50
const undoStack = ref<HistoryEntry[]>([])
const redoStack = ref<HistoryEntry[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
// 系列生命阶段草稿且非正式版时，允许一键恢复正式版本
const canRevert = computed(() => {
  const detail = draft.value
  if (!detail?.seriesId || !detail.seriesLifeStage) return false
  return String(detail.status || '').toUpperCase() !== 'PUBLISHED'
})
const reverting = ref(false)

function recordHistory(entry: HistoryEntry) {
  undoStack.value.push(entry)
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
  redoStack.value.length = 0
}

function applyUpdateField(item: DesignerItem, field: 'weightG' | 'preparationMethod' | 'includeInAssessment', value: unknown) {
  if (field === 'weightG') item.weightG = Number(value ?? 0)
  else if (field === 'preparationMethod') item.preparationMethod = (value as string | undefined) ?? undefined
  else item.includeInAssessment = Boolean(value)
  itemsRevision.value += 1
}

function buildUpdateData(field: 'weightG' | 'preparationMethod' | 'includeInAssessment', value: unknown) {
  if (field === 'weightG') return { weightG: Number(value ?? 0) }
  if (field === 'preparationMethod') return { preparationMethod: (value as string | null | undefined) ?? null }
  return { includeInAssessment: Boolean(value) }
}

function applyOrderByIds(ids: string[]) {
  const byId = new Map(items.value.map((item) => [item.id, item]))
  const next = ids.map((id) => byId.get(id)).filter((item): item is DesignerItem => Boolean(item))
  for (const item of items.value) {
    if (!next.some((candidate) => candidate.id === item.id)) next.push(item)
  }
  items.value = next
}

/**
 * 撤销删除后服务器上原料已不存在时，用原信息重新创建原料（生成新 id 并替换本地引用）。
 *
 * ⚠️ 补剂目标必须**连原值一起带回去**（2026-10-28）。
 * 目标浓度是「本份提供量 ÷ 配方总重 × 1000」，而总重取的是上一次评估回写的缓存；
 * 删除/撤销后它可能明显偏小，重算会把目标放大几十上百倍
 * （实测：海藻粉碘目标 144,834 μg，正常应 ~918）。
 */
async function recreateItem(snapshot: DesignerItem) {
  if (!draft.value) return
  const supplementTargets = normalizeSupplementTargetDefinitions(
    snapshot.supplementTargets
  )
  /** 旧目标值（落库口径是 `targetValue`，本地装饰用 `targetValuePerKg`） */
  const storedTargetValues = new Map<string, number>()
  if (Array.isArray(snapshot.supplementTargets)) {
    for (const raw of snapshot.supplementTargets) {
      if (!raw || typeof raw !== 'object') continue
      const record = raw as {
        fieldPath?: unknown
        targetValue?: unknown
        targetValuePerKg?: unknown
      }
      const fieldPath =
        typeof record.fieldPath === 'string' ? record.fieldPath.trim() : ''
      if (!fieldPath) continue
      const value = Number(record.targetValue ?? record.targetValuePerKg)
      if (Number.isFinite(value) && value > 0) {
        storedTargetValues.set(fieldPath, value)
      }
    }
  }
  const payload = {
    ingredientId: snapshot.ingredientId ?? snapshot.ingredient?.id,
    nutritionFoodId: snapshot.nutritionFoodId ?? '',
    weightG: Number(snapshot.weightG ?? 0),
    includeInAssessment: snapshot.includeInAssessment,
    preparationMethod: snapshot.preparationMethod,
    nutrientTargetKey: snapshot.nutrientTargetKey ?? undefined,
    nutrientTargetValue: snapshot.nutrientTargetValue ?? undefined,
    ...(supplementTargets.length > 0
      ? {
          supplementTargets: supplementTargets.map((target) => ({
            fieldPath: target.fieldPath,
            label: target.label,
            unit: target.unit,
            ...(storedTargetValues.has(target.fieldPath)
              ? { targetValue: storedTargetValues.get(target.fieldPath) }
              : {})
          }))
        }
      : {})
  }
  try {
    const created = await recipeDesignerApi.addItem(draft.value.id, payload)
    const oldId = snapshot.id
    const decorated: DesignerItem = {
      ...created,
      nutritionFood: snapshot.nutritionFood ?? created.nutritionFood,
      supplementTargets:
        supplementTargets.length > 0
          ? buildStoredSupplementTargets(supplementTargets)
          : created.supplementTargets
    }
    items.value = items.value.map((item) => (item.id === oldId ? decorated : item))
    // 旧 id 在服务器上已失效：丢弃指向它的待保存操作，并把历史栈中的 id 换成新 id
    cancelItemOps(oldId)
    remapHistoryItemId(oldId, created.id)
    await refreshInputsKeepingScroll()
  } catch {
    ElMessage.error('原料恢复失败，请重试')
    items.value = items.value.filter((item) => item.id !== snapshot.id)
  }
}

function remapHistoryItemId(oldId: string, newId: string) {
  for (const stack of [undoStack.value, redoStack.value]) {
    for (const entry of stack) {
      if (entry.type === 'remove' || entry.type === 'add') {
        if (entry.item.id === oldId) entry.item.id = newId
      } else if (entry.type === 'update' && entry.itemId === oldId) {
        entry.itemId = newId
      }
    }
  }
}

async function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
  const isUndo = direction === 'undo'
  switch (entry.type) {
    case 'add': {
      if (isUndo) {
        // 撤销新增：本地移除 + 排队删除
        items.value = items.value.filter((item) => item.id !== entry.item.id)
        enqueue({ kind: 'removeItem', itemId: entry.item.id })
      } else {
        // 重做新增：若删除尚未发送则直接恢复；否则重新创建
        if (cancelPendingRemove(entry.item.id)) {
          items.value = [...items.value, entry.item]
        } else {
          await recreateItem(entry.item)
        }
      }
      break
    }
    case 'remove': {
      if (isUndo) {
        const index = Math.min(entry.index, items.value.length)
        const next = [...items.value]
        next.splice(index, 0, entry.item)
        items.value = next
        if (cancelPendingRemove(entry.item.id)) {
          // 删除请求尚未发送：本地恢复即可，服务器上原料仍在
        } else {
          // 已发送：服务器上原料已删除，重新创建并换新 id
          await recreateItem(entry.item)
        }
      } else {
        items.value = items.value.filter((item) => item.id !== entry.item.id)
        enqueue({ kind: 'removeItem', itemId: entry.item.id })
      }
      break
    }
    case 'update': {
      const value = isUndo ? entry.before : entry.after
      const item = items.value.find((candidate) => candidate.id === entry.itemId)
      if (item) applyUpdateField(item, entry.field, value)
      enqueue({
        kind: 'updateItem',
        itemId: entry.itemId,
        data: buildUpdateData(entry.field, value)
      })
      break
    }
    case 'reorder': {
      cancelBatchOrders()
      const ids = isUndo ? entry.before : entry.after
      applyOrderByIds(ids)
      enqueue({
        kind: 'batchOrder',
        order: ids.map((id, index) => ({ id, sortOrder: index }))
      })
      break
    }
  }
}

async function undo() {
  const entry = undoStack.value.pop()
  if (!entry) return
  redoStack.value.push(entry)
  await applyHistoryEntry(entry, 'undo')
}

async function redo() {
  const entry = redoStack.value.pop()
  if (!entry) return
  undoStack.value.push(entry)
  await applyHistoryEntry(entry, 'redo')
}

function isSupplementItem(item: DesignerItem): boolean {
  return (
    String(item.ingredientType || item.ingredient?.type || '').trim().toUpperCase() === 'SUPPLEMENT'
  )
}

function isSupplementOption(option: RecipeDesignerIngredientOption): boolean {
  return String(option.type || '').trim().toUpperCase() === 'SUPPLEMENT'
}

// ---------- 原料预处理（2026-10-22） ----------

/**
 * 修改原料「部位 / 状态 / 预处理」：只保存自由文本。
 * 字典只用于老数据展示兜底，不再把文字反查成字典 id。
 */
function onPreparationMethodChange(
  item: DesignerItem,
  value: string | null | undefined
) {
  const nextMethod = String(value ?? '').trim() || null
  const currentMethod = String(item.preparationMethod ?? '').trim() || null
  if (nextMethod === currentMethod) return

  item.preparationMethod = nextMethod ?? undefined
  item.preparationMethodLabel = nextMethod
  itemsRevision.value += 1
  enqueue({
    kind: 'updateItem',
    itemId: item.id,
    data: { preparationMethod: nextMethod }
  })
}

// ---------- 补剂目标营养素与添加浓度（2026-10-22） ----------

interface SupplementTargetView extends SupplementTargetDefinition {
  valuePerKg: number | null
  text: string
}

function buildStoredSupplementTargets(
  definitions: SupplementTargetDefinition[]
): DesignerSupplementTarget[] {
  return definitions.map((definition) => ({
    fieldPath: definition.fieldPath,
    label: definition.label,
    unit: definition.unit,
    nutrientTargetKey:
      definition.fieldPath.slice(definition.fieldPath.lastIndexOf('.') + 1) ||
      null,
    targetValuePerKg: null
  }))
}

/**
 * 明细行展示：目标营养素标签 + 当前配方的实际添加浓度（每 kg）。
 * 浓度按当前评估总重量实时计算，用量 / 总重 / 目标变化后自动重算。
 */
function itemSupplementTargetViews(item: DesignerItem): SupplementTargetView[] {
  const definitions = normalizeSupplementTargetDefinitions(
    item.supplementTargets
  )

  // 历史数据兼容：只有旧版单目标字段时也展示出来，避免看起来像「没有目标」。
  if (definitions.length === 0 && item.nutrientTargetKey) {
    const legacyFieldPath = resolveSupplementTargetFieldPath(
      item.nutrientTargetKey
    )
    const legacyDefinition = legacyFieldPath
      ? resolveSupplementTargetDefinition(legacyFieldPath)
      : null
    if (legacyDefinition) definitions.push(legacyDefinition)
  }

  const totalWeightG = assessment.value?.totalWeightG ?? null
  return definitions.map((definition) => {
    const valuePerKg =
      item.includeInAssessment === false
        ? null
        : computeSupplementTargetConcentration(
            item.nutritionFood?.nutritionData,
            definition.fieldPath,
            Number(item.weightG ?? 0),
            totalWeightG
          )
    return {
      ...definition,
      valuePerKg,
      text: formatSupplementTargetConcentration(definition, valuePerKg)
    }
  })
}

async function openSupplementTargetEditor(item: DesignerItem) {
  const nutritionFoodId = String(item.nutritionFoodId ?? '').trim()
  if (!nutritionFoodId) {
    ElMessage.warning('该补剂缺少营养档案，无法修改目标营养素')
    return
  }

  let profile = item.nutritionFood?.nutritionData ?? null
  let nutritionFoodName =
    item.nutritionFood?.name || item.nutritionFoodName || ''

  if (!profile) {
    try {
      const detail = await loadNutritionFoodDetail(nutritionFoodId)
      profile = detail.nutritionData
      nutritionFoodName = detail.name || nutritionFoodName
    } catch {
      return
    }
  }

  const currentTargets = normalizeSupplementTargetDefinitions(
    item.supplementTargets
  )
  if (currentTargets.length === 0 && item.nutrientTargetKey) {
    const legacyFieldPath = resolveSupplementTargetFieldPath(
      item.nutrientTargetKey
    )
    const legacyDefinition = legacyFieldPath
      ? resolveSupplementTargetDefinition(legacyFieldPath)
      : null
    if (legacyDefinition) currentTargets.push(legacyDefinition)
  }

  supplementTargetDialog.value = {
    mode: 'edit',
    itemId: item.id,
    nutritionFoodId,
    ingredientName: itemDisplayName(item),
    nutritionFoodName,
    profile,
    initialTargets: currentTargets,
    weightG: Number(item.weightG ?? 0)
  }
}

/**
 * 添加补剂前先解析默认目标 / 智能添加目标，再打开目标选择弹窗。
 * 没有任何目标时不允许调用 addItem —— 后端也会 400，这里提前拦住。
 */
async function openSupplementTargetAddDialog(
  option: RecipeDesignerIngredientOption,
  profile: IngredientNutritionProfileOption,
  weightG: number,
  nutrientKey?: string
) {
  let detail: NutritionFoodDetail
  try {
    detail = await loadNutritionFoodDetail(profile.nutritionFoodId)
  } catch {
    return
  }

  const initialTargets = readDefaultSupplementTargets(detail)
  const smartFieldPath = resolveSupplementTargetFieldPath(nutrientKey)
  if (smartFieldPath) {
    const definition = resolveSupplementTargetDefinition(smartFieldPath)
    if (definition) {
      const available = listSupplementTargetFieldCandidates(detail.nutritionData)
      if (available.some((candidate) => candidate.fieldPath === definition.fieldPath)) {
        if (!initialTargets.some((target) => target.fieldPath === definition.fieldPath)) {
          initialTargets.push(definition)
        }
      } else if (!smartFieldPath.startsWith('derived.')) {
        // 派生字段只用于兼容历史目标，不再作为新目标候选；派生类评估指标
        // 不强行预选，交给营养师在独立字段里选择。
        ElMessage.warning(
          `「${definition.label}」在「${detail.name}」营养档案中为空或为 0，请改选其他目标营养素`
        )
      }
    }
  }

  supplementTargetDialog.value = {
    mode: 'add',
    ingredientId: option.id,
    nutritionFoodId: profile.nutritionFoodId,
    ingredientName: option.name,
    nutritionFoodName: detail.name,
    profile: detail.nutritionData,
    initialTargets,
    weightG
  }
}

async function confirmSupplementTargets(
  targets: SupplementTargetDefinition[]
) {
  const dialogState = supplementTargetDialog.value
  if (!dialogState || !draft.value) return
  if (targets.length === 0) {
    ElMessage.warning('补剂至少需要选择一个目标营养素')
    return
  }

  const payloadTargets = targets.map((target) => ({
    fieldPath: target.fieldPath,
    label: target.label,
    unit: target.unit
  }))

  supplementDialogSaving.value = true
  try {
    if (dialogState.mode === 'add') {
      if (!dialogState.ingredientId) {
        ElMessage.error('缺少原料信息，无法添加补剂')
        return
      }
      const created = await recipeDesignerApi.addItem(draft.value.id, {
        ingredientId: dialogState.ingredientId,
        nutritionFoodId: dialogState.nutritionFoodId,
        weightG: dialogState.weightG,
        includeInAssessment: true,
        supplementTargets: payloadTargets
      })
      const decoratedItem: DesignerItem = {
        ...created,
        nutritionFood: {
          ...(created.nutritionFood ?? {}),
          id: dialogState.nutritionFoodId,
          name: dialogState.nutritionFoodName,
          nutritionData: dialogState.profile
        },
        supplementTargets: buildStoredSupplementTargets(targets)
      }
      items.value = [...items.value, decoratedItem]
      recordHistory({ type: 'add', item: decoratedItem })
      supplementTargetDialog.value = null
      await refreshInputsKeepingScroll()
    } else {
      if (!dialogState.itemId) {
        ElMessage.error('缺少补剂明细，无法保存目标')
        return
      }
      // 目标编辑走独立接口；先把此前的用量/预处理修改落盘，
      // 否则旧的 updateItem 请求可能在目标保存后把 supplementTargets 覆盖回旧值。
      await flushNow()
      if (hasPending()) {
        await waitForSaveIdle()
      }
      if (hasPending() || saveStatus.value === 'error') {
        ElMessage.error('原料修改尚未保存成功，暂时不能保存补剂目标，请稍后重试')
        return
      }
      const updated = await recipeDesignerApi.updateItem(dialogState.itemId, {
        supplementTargets: payloadTargets
      })
      const item = items.value.find(
        (candidate) => candidate.id === dialogState.itemId
      )
      if (item) {
        // 以服务端返回为准，避免本地多选 3 项、数据库只落 1 项却继续显示 3 项。
        item.supplementTargets =
          updated.supplementTargets ?? buildStoredSupplementTargets(targets)
        item.nutritionFood = {
          ...(item.nutritionFood ?? {}),
          nutritionData: dialogState.profile
        }
      }
      supplementTargetDialog.value = null
      ElMessage.success('补剂目标营养素已更新')
    }
  } catch (error) {
    // 后端校验失败时保留弹窗，并明确告知失败原因，避免只改到本地显示。
    ElMessage.error(
      error instanceof Error && error.message
        ? error.message
        : '补剂目标保存失败，请重试'
    )
  } finally {
    supplementDialogSaving.value = false
  }
}

/** 明细行单位：食材统一为克；补剂按其规格单位显示（如 粒/片/胶囊/毫升），无规格时兜底克 */
function readIngredientUnit(source: any): string {
  // 2026-10-14：与导出报告 publishReport.ts 的 readIngredientDisplayUnit 对齐。
  // 原实现只读 unitDisplayLabel / properties.display_unit / purchaseUnit 三处，
  // 比报告少读 properties.servingUnitLabel、properties.amountUnitLabel、
  // properties.purchaseUnit、displayUnit、unit —— 导致同一份补剂
  // 在编辑页显示成「g」、在导出报告里显示成「粒」。
  const props = (source?.properties ?? null) as Record<string, unknown> | null
  const pick = (...vals: unknown[]) =>
    vals.map((v) => String(v ?? '').trim()).find((v) => v.length > 0) || ''
  return pick(
    source?.unitDisplayLabel,
    source?.displayUnit,
    source?.display_unit,
    props?.['unitDisplayLabel'],
    props?.['displayUnit'],
    props?.['display_unit'],
    props?.['servingUnitLabel'],
    source?.purchaseUnit,
    props?.['purchaseUnit'],
    source?.unit,
    props?.['amountUnitLabel'],
  )
}

function itemUnitLabel(item: DesignerItem): string {
  if (!isSupplementItem(item)) return 'g'
  return readIngredientUnit(item.ingredient) || 'g'
}

/**
 * 该原料是否按"非克单位"计量（如 粒 / 片 / 平勺）。
 *
 * 2026-10-14 新增：用于把这类补剂排除出「总重」。
 * 原因：weightG 对它们存的是"粒数/片数"而不是克重，直接与食材的克数相加没有意义
 * （实测一道菜里 9.7 粒鱼油胶囊会让总重凭空多出 9.7）。
 */
function isNonGramMeasured(item: DesignerItem): boolean {
  if (!isSupplementItem(item)) return false
  const unit = readIngredientUnit(item.ingredient).toLowerCase()
  return unit !== '' && unit !== 'g' && unit !== '克' && unit !== 'ml' && unit !== '毫升'
}

async function loadDraft(targetDraftId?: string) {
  initialLoading.value = true
  const id = targetDraftId ?? draftId
  try {
    let detail = await recipeDesignerApi.getDraft(id)
    // 已发布正式草稿不可直接编辑：自动创建可编辑修订版并跳转（与小程序行为一致）
    if (String(detail.status || '').toUpperCase() === 'PUBLISHED') {
      try {
        const revision = (await recipeDesignerApi.createRevisionDraft(
          detail.id
        )) as unknown as DesignRecipeDraftDetail
        if (revision?.id && revision.id !== detail.id) {
          ElMessage.info('已创建可编辑修订版本')
          currentDraftId.value = revision.id
          router.replace({
            path: `/recipe-designer/series/${detail.seriesId ?? seriesId}/drafts/${revision.id}`,
            query: route.query
          })
          detail = revision
        } else {
          currentDraftId.value = revision?.id ?? detail.id
          detail = revision
        }
      } catch {
        ElMessage.error('正式版本无法直接编辑，进入修订版失败')
        initialLoading.value = false
        router.push('/recipe-designer')
        return
      }
    }
    draft.value = detail
    syncReferenceDog()
    items.value = (detail.items ?? []).map((item) => ({
      ...item,
      includeInAssessment: item.includeInAssessment !== false
    }))
    undoStack.value = []
    redoStack.value = []
    // 带上当前原料：跨阶段复制/切换阶段会换掉原料 id，缓存对不上时会自动重新拉取
    await loadInputs(detail.id, detail.fediafDogScenario, items.value)
  } catch {
    ElMessage.error('草稿加载失败')
  } finally {
    initialLoading.value = false
  }
}

/** 切换该配方系列的生命阶段：打开目标阶段的草稿（无草稿时自动新建并带入当前内容） */
async function handleSwitchStage(scenario: string) {
  if (!draft.value || switchingStage.value) return
  if (scenario === draft.value.fediafDogScenario) return
  // 订单定制：原地换这一份草稿的阶段，不另开阶段草稿（2026-10-30）
  if (orderId) {
    await switchOrderDesignStage(scenario)
    return
  }
  const targetLabel = FEDIAF_DOG_SCENARIO_LABELS[scenario as FediafDogScenario] ?? scenario
  try {
    await ElMessageBox.confirm(
      `确认切换到「${targetLabel}」阶段吗？\n将把当前配方内容复制到该阶段（若该阶段已有草稿则直接打开），当前草稿不受影响。`,
      '切换生命阶段',
      {
        type: 'warning',
        confirmButtonText: '确认切换',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  switchingStage.value = true
  try {
    const payload: CreateRecipeSeriesStageDraftPayload = {
      scenario: scenario as FediafDogScenario,
      sourceDraftId: currentDraftId.value
    }
    const next = await recipeDesignerApi.createSeriesStageDraft(seriesId, payload)
    currentDraftId.value = next.id
    router.replace({
      path: `/recipe-designer/series/${seriesId}/drafts/${next.id}`,
      query: route.query
    })
    await loadDraft(next.id)
    ElMessage.success(`已切换到「${targetLabel}」`)
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    switchingStage.value = false
  }
}

/**
 * 本单设计换生命阶段（2026-10-30）：原地改这一份草稿的阶段，原料不动。
 *
 * 为什么不能像产品线那样另开阶段草稿：订单卡片锁着这一份草稿，
 * 另开一份会出现「界面看到的是新的、加入待提交取走的是旧的」。
 *
 * 已加入待提交的那份，后端会先退回「编辑中」并清掉按旧阶段生成的暂存食谱，
 * 所以提示里必须说清楚「需要重新加入」，否则会以为已经交过了。
 */
async function switchOrderDesignStage(scenario: string) {
  if (!draft.value || !orderId) return
  const targetLabel =
    FEDIAF_DOG_SCENARIO_LABELS[scenario as FediafDogScenario] ?? scenario
  const wasReady = currentOrderSlot.value?.status === 'READY'

  try {
    await ElMessageBox.confirm(
      [
        `确认把这份设计改为「${targetLabel}」阶段吗？`,
        '原料、克数与展示资料保持不变，营养评估会按新阶段重新计算。',
        wasReady
          ? '这一份已经加入过本单待提交，换阶段后会退回「编辑中」，需要重新点一次「加入本单待提交」。'
          : ''
      ]
        .filter(Boolean)
        .join('\n'),
      '切换生命阶段',
      {
        type: 'warning',
        confirmButtonText: '确认切换',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  switchingStage.value = true
  try {
    // 先把还在保存队列里的克数 / 排序刷完，否则紧接着刷新草稿会把它们丢掉
    await flushNow()
    if (hasPending() || saveStatus.value === 'error') {
      ElMessage.warning('还有改动尚未保存成功，请稍候再试')
      return
    }
    const result = await orderRecipeDesignApi.switchStage(orderId, designId, scenario)
    await loadDraft(currentDraftId.value)
    await loadOrderDesignWorkspace()
    ElMessage.success(
      result.status === 'EDITING' && wasReady
        ? `已切换到「${targetLabel}」，请重新加入本单待提交`
        : `已切换到「${targetLabel}」`
    )
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    switchingStage.value = false
  }
}

/** 一键恢复正式版：丢弃未发布修改，回到最近一次发布的正式版本 */
async function handleRevert() {
  if (!draft.value) return
  try {
    await ElMessageBox.confirm(
      '将丢弃本草稿的全部未发布修改，恢复为最近一次发布的正式版本。确定继续吗？',
      '恢复正式版',
      {
        type: 'warning',
        confirmButtonText: '恢复',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  reverting.value = true
  try {
    const reverted = (await recipeDesignerApi.revertDraftToLatestOfficial(
      currentDraftId.value
    )) as unknown as DesignRecipeDraftDetail
    draft.value = reverted
    items.value = (reverted.items ?? []).map((item) => ({
      ...item,
      includeInAssessment: item.includeInAssessment !== false
    }))
    undoStack.value = []
    redoStack.value = []
    await loadInputs(reverted.id, reverted.fediafDogScenario, items.value)
    ElMessage.success('已恢复正式版')
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    reverting.value = false
  }
}

async function handleAddOption(
  option: RecipeDesignerIngredientOption,
  targetProfile?: IngredientNutritionProfileOption,
  weightG?: number,
  nutrientKey?: string
) {
  if (!draft.value) return
  const profile =
    targetProfile ??
    option.nutritionProfiles.find((candidate) => candidate.isPrimary) ??
    option.nutritionProfiles[0]
  if (!profile) {
    ElMessage.warning(`「${option.name}」暂无可用营养档案，无法加入配方`)
    return
  }

  /**
   * 补剂必须先明确目标营养素（默认目标或人工选择），
   * 不允许绕过弹窗直接 addItem，也不做营养缺口推断。
   */
  if (isSupplementOption(option)) {
    await openSupplementTargetAddDialog(
      option,
      profile,
      weightG ?? 100,
      nutrientKey
    )
    return
  }

  const payload = {
    ingredientId: option.id,
    nutritionFoodId: profile.nutritionFoodId,
    weightG: weightG ?? 100,
    includeInAssessment: true
  }

  try {
    const created = await recipeDesignerApi.addItem(draft.value.id, payload)
    items.value = [...items.value, created]
    recordHistory({ type: 'add', item: created })
    await refreshInputsKeepingScroll()
  } catch {
    // 拦截器已提示
  }
}

function onWeightChange(item: DesignerItem, value: number | undefined) {
  const weightG = Number(value ?? 0)
  if (!Number.isFinite(weightG) || weightG < 0) return
  const before = item.weightG
  item.weightG = weightG
  itemsRevision.value += 1
  recordHistory({
    type: 'update',
    itemId: item.id,
    field: 'weightG',
    before,
    after: weightG
  })
  // 本地即时生效（修订号触发重新评估），防抖保存
  enqueue({
    kind: 'updateItem',
    itemId: item.id,
    data: { weightG }
  })
}

function onToggleInclude(item: DesignerItem, value: boolean) {
  const after = value
  const before = !after
  item.includeInAssessment = after
  itemsRevision.value += 1
  recordHistory({
    type: 'update',
    itemId: item.id,
    field: 'includeInAssessment',
    before,
    after
  })
  enqueue({
    kind: 'updateItem',
    itemId: item.id,
    data: { includeInAssessment: after }
  })
}

/** 弹窗内修改原料用量：本地即时生效（评估自动重算）+ 保存队列 */
async function applyItemWeight(itemId: string, weightG: number): Promise<void> {
  const item = items.value.find((candidate) => candidate.id === itemId)
  if (!item) return
  const before = item.weightG
  item.weightG = weightG
  itemsRevision.value += 1
  recordHistory({
    type: 'update',
    itemId,
    field: 'weightG',
    before,
    after: weightG
  })
  enqueue({
    kind: 'updateItem',
    itemId,
    data: { weightG }
  })
}

async function handleRemoveItem(item: DesignerItem) {
  const index = items.value.findIndex((candidate) => candidate.id === item.id)
  items.value = items.value.filter((candidate) => candidate.id !== item.id)
  recordHistory({ type: 'remove', item: { ...item }, index: index < 0 ? 0 : index })
  enqueue({ kind: 'removeItem', itemId: item.id })
}

let reorderBeforeIds: string[] = []

function handleReorderStart() {
  reorderBeforeIds = items.value.map((item) => item.id)
}

async function handleReorder() {
  if (!draft.value) return
  const afterIds = items.value.map((item) => item.id)
  recordHistory({ type: 'reorder', before: reorderBeforeIds, after: afterIds })
  cancelBatchOrders()
  const order = items.value.map((item, index) => ({
    id: item.id,
    sortOrder: index
  }))
  enqueue({ kind: 'batchOrder', order })
}

/**
 * 把当前草稿「加入本单待提交」（仅管理员）。
 *
 * 先把保存队列里还没落盘的权重/排序刷完：ready 接口读的是服务器上的草稿，
 * 本地还没保存的修改不会跟着进去。
 */
async function stageOrderDesign() {
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }
  if (!orderId || !designId) {
    ElMessage.warning('请从本单设计工作台打开这份设计后再加入待提交')
    return
  }
  if (!draft.value) return

  try {
    await ElMessageBox.confirm(
      `确认把「${seriesDisplayName.value}」加入本单待提交吗？\n加入后顾客还看不到；管理员最终提交时才会一次性交付。`,
      '加入本单待提交',
      {
        type: 'warning',
        confirmButtonText: '加入待提交',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  stagingReady.value = true
  try {
    await flushNow()
    if (hasPending() || saveStatus.value === 'error') {
      ElMessage.warning('还有改动尚未保存成功，请稍候再试')
      return
    }
    const result = await orderRecipeDesignApi.markReady(orderId, designId)
    const total = orderDesignWorkspace.value?.quantity ?? 0
    ElMessage.success(
      total > 0
        ? `已加入本单待提交（${result.readyCount} / ${total} 份）`
        : '已加入本单待提交'
    )
    await loadOrderDesignWorkspace()
    await router.push(`/order-design/${encodeURIComponent(orderId)}`)
  } catch {
    // 错误提示由 API 拦截器统一处理
  } finally {
    stagingReady.value = false
  }
}

/**
 * 等正在进行的保存请求落地（最多 timeoutMs）。
 *
 * `flushNow()` 遇到已有保存在飞时会立即返回；上线检查读的是服务器上的草稿，
 * 不等一下就会和保存请求赛跑，检查结果可能落后一次修改。
 */
function waitForSaveIdle(timeoutMs = 5000): Promise<void> {
  if (!hasPending()) return Promise.resolve()
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = () => {
      stop()
      if (timer) clearTimeout(timer)
      resolve()
    }
    const stop = watch([saveStatus, willAutoRetry], () => {
      if (!hasPending()) {
        finish()
        return
      }
      // 自动重试已经放弃时不再干等，打开后仍会提示结果可能不是最新
      if (saveStatus.value === 'error' && !willAutoRetry.value) {
        finish()
      }
    })
    timer = setTimeout(finish, timeoutMs)
  })
}

/**
 * 打开「上线检查」抽屉（产品线 / 本单设计都可用）。
 *
 * 不跳转路由：检查结果在抽屉里看；先把未落盘修改刷完，避免读到旧版本。
 * 公共门槛 + 产品展示对两种设计都生效，分支条件按设计模式各自检查。
 */
async function openLaunchReadiness() {
  if (!draft.value) {
    ElMessage.warning('草稿加载完成后才能做上线检查')
    return
  }
  if (launchCheckOpening.value) return

  launchCheckOpening.value = true
  try {
    await flushNow()
    if (hasPending()) {
      await waitForSaveIdle()
    }
    if (hasPending() || saveStatus.value === 'error') {
      ElMessage.error('还有改动尚未保存成功，已停止本次上线检查；请等待保存完成后再试')
      return
    }
    launchReadinessVisible.value = true
  } finally {
    launchCheckOpening.value = false
  }
}

/** 打开发布 / 更新抽屉（仅产品线系列；订单设计沿用本单交付流程） */
/**
 * 上线检查 → 去食谱列表发布 / 更新。
 * 发布是整条系列的动作，统一收在按系列组织的列表页，编辑器不再提供第二个入口。
 */
function goToSeriesListFromCheck(): void {
  launchReadinessVisible.value = false
  void router.push('/recipe-designer')
}

function backToOrderWorkspace() {
  if (!orderId) return
  router.push(`/order-design/${encodeURIComponent(orderId)}`)
}

async function handleOrderStaged() {
  launchReadinessVisible.value = false
  await loadOrderDesignWorkspace()
  if (orderId) {
    await router.push(`/order-design/${encodeURIComponent(orderId)}`)
  }
}

function handleStagePublished() {
  launchReadinessVisible.value = false
  router.push('/recipe-designer')
}

function goBack() {
  if (orderId) {
    backToOrderWorkspace()
    return
  }
  router.push('/recipe-designer')
}

let beforeUnloadRegistered = false
function registerBeforeUnload() {
  if (beforeUnloadRegistered) return
  beforeUnloadRegistered = true
  window.addEventListener('beforeunload', (event) => {
    if (hasPending()) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) void redo()
    else void undo()
  } else if (key === 'y') {
    event.preventDefault()
    void redo()
  }
}

onMounted(() => {
  restorePaneWidths()
  registerBeforeUnload()
  window.addEventListener('keydown', handleKeydown)
  void loadDraft()
  void loadOrderDesignWorkspace()
})

onBeforeUnmount(() => {
  stopPaneResize?.()
  window.removeEventListener('keydown', handleKeydown)
  if (hasPending()) {
    void flushNow()
  }
})
</script>

<style scoped>
.designer-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  /* 本页五栏合计约 1500px，由 .editor-body 自己横向滚动；
     这里只保证自己不被父级 flex 压窄。 */
  min-width: 0;
  flex-shrink: 0;
}
.production-steps-drawer-empty {
  padding: 32px 16px;
  font-size: 13px;
  color: #909399;
  text-align: center;
}
.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
  flex-shrink: 0;
}
.order-design-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 8px 16px;
  background: #f0f9eb;
  border-bottom: 1px solid #e1f3d8;
  font-size: 12px;
  color: #606266;
  flex-shrink: 0;
}
.order-design-banner__info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.order-design-banner__badge {
  background: #67c23a;
  color: #fff;
  border-radius: 4px;
  padding: 2px 8px;
  font-weight: 600;
}
.order-design-banner__order {
  font-weight: 600;
  color: #303133;
}
.order-design-banner__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.order-design-banner__lock {
  color: #909399;
}
.order-design-banner__warning {
  flex-basis: 100%;
  color: #e6a23c;
  line-height: 1.6;
}
.header-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.draft-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.design-mode-tag {
  flex-shrink: 0;
}
.rename-hint {
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.5;
  color: #909399;
}
.stage-tag {
  color: #909399;
  font-size: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 2px 8px;
  flex-shrink: 0;
}
.stage-switch-btn {
  flex-shrink: 0;
}
.stage-current {
  color: #909399;
  margin-left: 4px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}
.save-status.saving {
  color: #409eff;
}
.save-status.error {
  color: #f56c6c;
}
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  /* 2026-10-14 修正：原为 overflow: hidden。
     五栏固定宽度合计约 1500px（原料库 250 + 配方明细 ≥320 + 仪表盘 300 + 营养评估 330 + 爱犬信息 300），
     在窄于该宽度的窗口里，hidden 会把右侧三栏（仪表盘 / 营养评估 / 爱犬信息）整个裁掉，
     且没有任何滚动入口 —— 看起来就像"内容没加载出来"，实际是被裁切。
     改为横向可滚动：窄窗口下用户能滚到右侧各栏，宽窗口下不出现滚动条，布局不变。 */
  overflow-x: auto;
  overflow-y: hidden;
}
.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}
.pane-library {
  width: 250px;
  min-width: 200px;
  flex-shrink: 0;
}
.pane-items {
  flex: 1;
  min-width: 320px;
  /* 不参与压缩：否则窗口变窄时这一栏会被挤到只剩几十像素，
     原料名（.item-main）连同用量输入框一起被压没（实测名字列只剩 24px）。
     宽度的增减由两侧的分界线拖动决定，见 .pane-splitter。 */
  flex-shrink: 0;
}
.pane-dashboard {
  width: 300px;
  min-width: 240px;
  flex-shrink: 0;
  background: #fafbfc;
  overflow-y: auto;
}
.pane-right {
  width: 330px;
  min-width: 280px;
  flex-shrink: 0;
}
.pane-dog {
  width: 300px;
  min-width: 240px;
  flex-shrink: 0;
}

/* 五栏之间的拖动分界（2026-10-29）：平时是一条 1px 分隔线，悬停变蓝 */
.pane-splitter {
  position: relative;
  flex: 0 0 7px;
  align-self: stretch;
  background: #fff;
  cursor: col-resize;
  touch-action: none;
}
.pane-splitter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
  background: #e4e7ed;
  transition: background-color .15s, width .15s, left .15s;
}
.pane-splitter:hover::before,
.pane-splitter:active::before {
  left: 2px;
  width: 3px;
  background: #409eff;
}
.assessing-bar {
  height: 2px;
  margin-bottom: 8px;
  background: linear-gradient(90deg, transparent, var(--el-color-primary), transparent);
  animation: assessing-pulse 1.2s ease-in-out infinite;
}

@keyframes assessing-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.assessment-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.dog-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.pane-title {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.item-count {
  font-weight: 400;
  color: #909399;
  font-size: 12px;
}
.item-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 6px;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 5px;
  background: #fff;
  /* 2026-10-15 老板报的"用量/占比/开关/删除被换到原料名下一行"。
     2026-10-14 那次改动把 .item-main 写成 flex-basis: 100%，注释里说"宽窗口下与原来一致"，
     但 basis 100% 意味着原料名那一格**永远独占整行**，控件必然被挤到第二行，与窗口多宽无关
     （实测 1100 / 1280 / 1426 / 1600 宽的窗口全部换行）。
     现在恢复一行布局：名字与用量/占比/开关/删除同排；
     只有本栏真的窄到放不下（< 约 420px）时才换行，且换行时整组控件一起落到第二行
     （.item-controls 作为一整块，避免出现"名字+用量一行、占比+删除另一行"的碎行）。
     实测窗口 ≥ 1700px（五栏都能完整显示）时，名字列宽度与 2026-10-14 之前完全一致。 */
  flex-wrap: wrap;
}
.item-row:hover {
  border-color: #c6e2ff;
}
.item-row-excluded {
  opacity: 0.6;
}
.drag-handle {
  cursor: grab;
  color: #c0c4cc;
  font-size: 16px;
  flex-shrink: 0;
}
.drag-ghost {
  opacity: 0.4;
}
/* 类型标签：食材 / 补剂 */
.item-type-tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.item-type-tag.food {
  color: #409eff;
  background: #ecf5ff;
}
.item-type-tag.supplement {
  color: #e6a23c;
  background: #fdf6ec;
}
.item-main {
  /* 见 .item-row 说明：这里只声明"原料名至少留 ~140px"的基准宽度，
     宽度够就与右侧控件同排（原来的一行布局），不够才整组控件换行。
     ⚠️ 不要写回 flex: 1 1 100%（那会让任何宽度下都强制换行），
     也不要写 flex: 1（基准 0 会让名字在窄窗口被压到几十像素、只剩省略号）。 */
  flex: 1 1 140px;
  min-width: 0;
}
.item-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-supplement-row {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 2px 0 0 22px;
}
.item-target-missing {
  font-size: 11px;
  color: #f56c6c;
}
.item-preparation-inline {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.preparation-label {
  flex-shrink: 0;
  font-size: 11px;
  color: #909399;
}
.item-preparation-hint {
  flex-basis: 100%;
  padding-left: 22px;
  font-size: 11px;
  line-height: 1.5;
  color: #e6a23c;
}
.item-preparation {
  margin-left: 6px;
  color: #909399;
}
.item-preparation-mismatch {
  color: #e6a23c;
}
.item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: #909399;
  min-width: 0;
}
.item-profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
/* 预处理 + 用量 + 占比 + 开关/删除：作为一个整体参与换行。
   本栏够宽时整组贴在原料名右侧；窄到放不下时整组落到下一行，
   并允许控件组内部继续换行，避免横向溢出。 */
.item-controls {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
}
/* 用量编辑 */
.weight-editor {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.weight-editor .weight-input {
  width: 70px;
}
.weight-editor :deep(.el-input__inner) {
  padding: 0 4px;
}
.weight-unit {
  font-size: 12px;
  color: #909399;
}
/* 重量百分比 */
.item-ratio-column {
  flex-shrink: 0;
  width: 46px;
  text-align: right;
}
.item-ratio {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}
/* 开关 + 删除 */
.item-action-stack {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}
.dog-pane {
  padding: 0 12px;
  box-sizing: border-box;
}

/* ---------- 配方明细列头 + 固定列宽（2026-10-29） ---------- */
/* 列头与原料行共用这一组列宽。这一栏窄到放不下时，
   由文件末尾的容器查询退回原来的「换行 + 行内小字」布局。 */
.pane-items {
  --item-grid: 22px 40px minmax(0, 1fr) 240px 84px 50px 56px 34px;
  container-type: inline-size;
  container-name: pane-items;
}
.item-list {
  /* 列头要贴在滚动区顶部，所以左右内边距挪到 .item-list-body；
     列头与行的内容都从 15px 起（6 内边距 + 1 边框 + 8 行内边距）。 */
  padding: 0;
}
.item-list-body {
  padding: 6px;
}
.item-col-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: var(--item-grid);
  column-gap: 5px;
  align-items: center;
  height: 30px;
  padding: 0 15px;
  background: #f7f8fa;
  border-bottom: 1px solid #e4e7ed;
  font-size: 11.5px;
  color: #7f8a9a;
  letter-spacing: .02em;
}
.item-col-head .col-center { text-align: center; }
.item-col-head .col-right { text-align: right; }
.col-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 11px;
  height: 11px;
  margin-left: 3px;
  border: 1px solid #c3cbd6;
  border-radius: 50%;
  font-size: 8px;
  line-height: 1;
  color: #aab4c1;
  vertical-align: 1px;
}
.item-row {
  display: grid;
  grid-template-columns: var(--item-grid);
  column-gap: 5px;
  align-items: center;
}
/* 宽屏：预处理/用量/占比/开关/删除不再包成一整块，直接成为网格里的列 */
.item-controls,
.item-action-stack {
  display: contents;
}
.drag-handle { justify-self: center; }
.item-type-tag { justify-self: center; }
.item-preparation-inline { width: 100%; }
.preparation-label { display: none; }
.item-ratio-column { width: auto; }
.item-preparation-hint,
.item-supplement-row { grid-column: 1 / -1; }
.item-row :deep(.el-switch),
.item-row :deep(.el-button) { justify-self: center; }

/* 这一栏窄于 760px 时（窄窗口 / 小屏）：
   列头收起，回到原来的换行布局，行内小字也恢复，保证控件不丢。 */
@container pane-items (max-width: 760px) {
  .item-col-head { display: none; }
  .item-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .item-controls { display: flex; }
  .item-action-stack { display: flex; }
  .item-preparation-inline { width: auto; }
  .preparation-label { display: inline; }
  .item-ratio-column { width: 46px; }
  .item-row :deep(.el-switch),
  .item-row :deep(.el-button) { justify-self: auto; }
}
</style>
