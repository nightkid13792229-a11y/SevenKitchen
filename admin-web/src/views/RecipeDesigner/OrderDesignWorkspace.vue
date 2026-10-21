<template>
  <div class="order-design-workspace">
    <div class="page-header">
      <div class="page-header__main">
        <el-button :icon="ArrowLeft" text @click="returnToOrder">返回订单</el-button>
        <div>
          <h2>本单食谱设计</h2>
          <p class="page-subtitle">
            订单 {{ orderId }}
            <span v-if="workspace?.dogName"> · {{ workspace.dogName }}</span>
            · 本单 {{ progress.total }} 份
          </p>
        </div>
      </div>
      <div class="page-header__actions">
        <el-button :icon="Refresh" :loading="loading" @click="loadWorkspace">
          刷新
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!isAdmin"
      class="staff-permission-note"
      type="info"
      :closable="false"
      show-icon
      title="员工可以创建和编辑本单草稿；「加入本单待提交」和最终交付需要管理员"
    >
      <div>
        每份设计完成后，由管理员在编辑器里点「加入本单待提交」；
        N 份全部就绪后，再由管理员最终提交并通知顾客。
      </div>
    </el-alert>

    <el-alert
      v-if="loadError"
      class="load-error"
      type="error"
      :closable="false"
      show-icon
      :title="loadError"
    >
      <el-button link type="primary" @click="loadWorkspace">重新加载</el-button>
    </el-alert>

    <!-- 老订单没有槽位：新工作台仍可从 0/N 开始，同时明确旧交付入口还在 -->
    <el-alert
      v-if="hasNoSlots && !loading"
      class="legacy-note"
      type="info"
      :closable="false"
      show-icon
    >
      <template #title>本单还没有本单设计记录</template>
      <div>
        如果这是此前已开始制作的老订单，订单页原有的候选食谱交付仍可用；
        也可以用上方「从模板新建 / 空白草稿」为本单建立 N 份独立设计。
      </div>
    </el-alert>

    <el-alert
      v-if="progress.delivered > 0 && progress.delivered >= progress.total"
      class="delivered-note"
      type="success"
      :closable="false"
      show-icon
      title="本单已交付"
    >
      <div>
        本单 {{ progress.delivered }} 份食谱已经交付给顾客，顾客已收到交付通知。
        如需调整请走售后流程。
      </div>
    </el-alert>

    <el-card class="progress-card" shadow="never" v-loading="loading">
      <div class="progress-head">
        <div>
          <div class="progress-title">本单共 {{ progress.total }} 份</div>
          <div class="progress-sub">{{ progress.text }}</div>
        </div>
        <el-tag
          v-if="progress.delivered > 0 && progress.delivered >= progress.total"
          type="success"
          effect="dark"
        >
          已交付 {{ progress.delivered }} / {{ progress.total }} 份
        </el-tag>
        <el-tag
          v-else-if="readyCount === progress.total"
          type="success"
          effect="dark"
        >
          全部就绪
        </el-tag>
        <el-tag v-else type="info" effect="plain">还差 {{ progress.total - progress.completed }} 份</el-tag>
      </div>

      <el-progress
        class="progress-bar"
        :percentage="progress.percent"
        :status="progress.ready === progress.total ? 'success' : ''"
        :stroke-width="10"
      />

      <div v-if="!isDelivered" class="progress-actions">
        <el-button
          type="primary"
          :disabled="!canAddSlot"
          @click="openTemplatePicker"
        >
          从模板新建
        </el-button>
        <el-button
          :loading="creatingBlank"
          :disabled="!canAddSlot"
          @click="createBlank"
        >
          空白草稿
        </el-button>
        <span v-if="!canAddSlot" class="progress-tip">
          本单 {{ progress.total }} 份已建满；需要替换请先移除一份未交付草稿。
        </span>
        <span v-else class="progress-tip">
          还差 {{ progress.total - progress.completed }} 份；同一模板可以重复使用，每次都会生成独立食谱。
        </span>
      </div>
    </el-card>

    <div v-loading="loading" class="slot-section">
      <el-empty
        v-if="!loading && slots.length === 0"
        :image-size="80"
        description="还没有开始设计；可以从模板新建或创建空白草稿"
      />

      <div v-else class="slot-list">
        <el-card
          v-for="(slot, index) in slots"
          :key="slot.designId"
          class="slot-card"
          shadow="hover"
        >
          <div class="slot-card__head">
            <div class="slot-card__title">
              <span class="slot-index">第 {{ index + 1 }} 份</span>
              <span class="slot-name">{{ slot.name || '未命名食谱' }}</span>
              <el-tag
                size="small"
                :type="orderDesignStatusTagType(slot.status)"
                effect="plain"
              >
                {{ orderDesignStatusLabel(slot.status) }}
              </el-tag>
              <el-tag
                v-if="slot.sourceRecipeId"
                size="small"
                type="info"
                effect="plain"
              >
                来自模板
              </el-tag>
            </div>
            <div class="slot-card__actions">
              <el-button
                v-if="slot.status !== 'DELIVERED'"
                size="small"
                type="primary"
                plain
                @click="openSlotEditor(slot)"
              >
                打开编辑器
              </el-button>
              <el-button
                v-if="slot.status !== 'DELIVERED'"
                size="small"
                type="danger"
                text
                :loading="removingId === slot.designId"
                @click="removeSlot(slot)"
              >
                移除
              </el-button>
            </div>
          </div>

          <div class="slot-card__meta">
            <span>更新于 {{ formatDateTime(slot.updatedAt) }}</span>
            <span v-if="slot.recipeId">已生成私密食谱</span>
            <span v-else>还没有加入本单待提交</span>
          </div>

          <el-alert
            v-if="slot.stageWarning"
            class="slot-warning"
            type="warning"
            :closable="false"
            show-icon
            :title="slot.stageWarning"
          >
            <template #default>
              阶段不一致只提示，不会阻止编辑、加入待提交或最终交付。
            </template>
          </el-alert>
        </el-card>
      </div>
    </div>

    <el-card class="submit-card" shadow="never" v-loading="loading">
      <template v-if="progress.delivered > 0 && progress.delivered >= progress.total">
        <div class="submit-title">本单已交付</div>
        <p class="submit-desc">
          本单 {{ progress.delivered }} 份食谱已全部交付，无需再次提交。
        </p>
      </template>

      <template v-else-if="progress.ready === progress.total">
        <div class="submit-title">本单 {{ progress.total }} 份已全部就绪</div>
        <p class="submit-desc">
          最终提交会把本单 {{ progress.total }} 份食谱一次性交付给顾客，
          顾客只会收到一条通知。提交后请在订单页跟进交付状态。
        </p>
        <el-button
          v-if="isAdmin && progress.ready === progress.total"
          type="success"
          :loading="submitting"
          @click="submitDesigns"
        >
          最终提交并交付（{{ progress.total }} 份）
        </el-button>
        <el-alert
          v-else
          class="staff-waiting"
          type="info"
          :closable="false"
          show-icon
          title="等待管理员最终提交并交付"
        >
          员工不能触发首次交付和顾客通知，请联系管理员在订单设计工作台完成最终提交。
        </el-alert>
      </template>

      <template v-else>
        <div class="submit-title">还差 {{ progress.total - progress.ready }} 份</div>
        <p class="submit-desc">
          每份设计在编辑器里点「加入本单待提交」后就绪；N 份全部就绪后由管理员一次性提交交付。
        </p>
      </template>
    </el-card>

    <TemplatePickerDrawer
      v-model="templatePickerVisible"
      :order-id="orderId"
      :used-source-recipe-ids="usedSourceRecipeIds"
      @created="handleTemplateCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { orderRecipeDesignApi } from '@/api/orderRecipeDesign'
import type {
  CreateOrderDesignFromTemplateResult,
  OrderDesignWorkspace,
  OrderDesignWorkspaceSlot,
} from '@/types/orderRecipeDesign'
import { useIsAdmin } from '@/composables/useAdminRole'
import {
  buildOrderDesignProgress,
  canAddOrderDesignSlot,
  countActiveSlots,
  countReadySlots,
  orderDesignStatusLabel,
  orderDesignStatusTagType,
} from '@/utils/orderRecipeDesign'
import { formatDateTime } from '@/utils/date'
import TemplatePickerDrawer from './components/TemplatePickerDrawer.vue'

const route = useRoute()
const router = useRouter()
const isAdmin = useIsAdmin()

const orderId = computed(() => String(route.params.orderId || '').trim())

const workspace = ref<OrderDesignWorkspace | null>(null)
const loading = ref(false)
const loadError = ref('')
const creatingBlank = ref(false)
const removingId = ref('')
const submitting = ref(false)
const templatePickerVisible = ref(false)

const slots = computed<OrderDesignWorkspaceSlot[]>(
  () => workspace.value?.slots ?? [],
)

const progress = computed(() =>
  buildOrderDesignProgress(workspace.value?.quantity, slots.value),
)

/** 已就绪数量以后端工作台为准；后端没返回时用槽位状态兜底。 */
const readyCount = computed(() =>
  workspace.value ? workspace.value.readyCount : countReadySlots(slots.value),
)

const activeCount = computed(() => countActiveSlots(slots.value))
const isDelivered = computed(
  () => progress.value.delivered > 0 && progress.value.delivered >= progress.value.total,
)
const canAddSlot = computed(() =>
  !isDelivered.value &&
  canAddOrderDesignSlot(progress.value.total, activeCount.value),
)

const hasNoSlots = computed(() => slots.value.length === 0)

const usedSourceRecipeIds = computed(() =>
  slots.value
    .map((slot) => slot.sourceRecipeId)
    .filter((recipeId): recipeId is string => Boolean(recipeId)),
)

async function loadWorkspace() {
  const targetOrderId = orderId.value
  if (!targetOrderId) {
    loadError.value = '缺少订单号'
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    workspace.value = await orderRecipeDesignApi.getWorkspace(targetOrderId)
  } catch {
    workspace.value = null
    loadError.value = '本单设计工作台加载失败，请刷新重试'
  } finally {
    loading.value = false
  }
}

function returnToOrder() {
  router.push({
    path: '/order-center',
    query: { type: 'CUSTOM_RECIPE', orderId: orderId.value },
  })
}

function openTemplatePicker() {
  templatePickerVisible.value = true
}

function openSlotEditor(slot: OrderDesignWorkspaceSlot) {
  router.push({
    name: 'RecipeDesignerEditor',
    params: { seriesId: slot.seriesId, draftId: slot.draftId },
    query: { orderId: orderId.value, designId: slot.designId },
  })
}

async function handleTemplateCreated(
  payload: CreateOrderDesignFromTemplateResult & { templateName: string },
) {
  templatePickerVisible.value = false
  if (payload.stageWarning) {
    ElMessage.warning(payload.stageWarning)
  } else {
    ElMessage.success(
      payload.templateName
        ? `已按「${payload.templateName}」创建本单草稿`
        : '已创建本单设计草稿',
    )
  }
  let designId = ''
  try {
    const latest = await orderRecipeDesignApi.getWorkspace(orderId.value)
    workspace.value = latest
    designId =
      latest.slots.find(
        (slot) =>
          slot.seriesId === payload.seriesId &&
          slot.draftId === payload.draftId,
      )?.designId ?? ''
  } catch {
    // 工作台刷新失败不挡住进入编辑器
  }
  router.push({
    name: 'RecipeDesignerEditor',
    params: { seriesId: payload.seriesId, draftId: payload.draftId },
    query: { orderId: orderId.value, ...(designId ? { designId } : {}) },
  })
}

async function createBlank() {
  const targetOrderId = orderId.value
  creatingBlank.value = true
  try {
    const created = await orderRecipeDesignApi.createBlank(targetOrderId)
    ElMessage.success('已创建空白草稿')
    let designId = ''
    try {
      const latest = await orderRecipeDesignApi.getWorkspace(targetOrderId)
      workspace.value = latest
      designId =
        latest.slots.find(
          (slot) =>
            slot.seriesId === created.seriesId &&
            slot.draftId === created.draftId,
        )?.designId ?? ''
    } catch {
      // 工作台刷新失败不挡住进入编辑器
    }
    router.push({
      name: 'RecipeDesignerEditor',
      params: { seriesId: created.seriesId, draftId: created.draftId },
      query: { orderId: targetOrderId, ...(designId ? { designId } : {}) },
    })
  } catch {
    // 错误提示由 API 拦截器统一处理
  } finally {
    creatingBlank.value = false
  }
}

async function removeSlot(slot: OrderDesignWorkspaceSlot) {
  try {
    await ElMessageBox.confirm(
      `确认移除「${slot.name || '未命名食谱'}」吗？该草稿和暂存私密食谱会一起清理；已交付的槽位不能移除。`,
      '移除本单食谱',
      {
        type: 'warning',
        confirmButtonText: '确认移除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  removingId.value = slot.designId
  try {
    await orderRecipeDesignApi.removeDesign(orderId.value, slot.designId)
    ElMessage.success('已移除')
    await loadWorkspace()
  } catch {
    // 错误提示由 API 拦截器统一处理
  } finally {
    removingId.value = ''
  }
}

async function submitDesigns() {
  if (!isAdmin.value) {
    ElMessage.warning('只有管理员可以最终提交并交付')
    return
  }
  const targetOrderId = orderId.value
  try {
    await ElMessageBox.confirm(
      `最终提交会把本单 ${progress.value.total} 份食谱一次性交付给顾客，并只发送一条通知。提交后不可从工作台撤销，确认继续吗？`,
      '最终提交并交付',
      {
        type: 'warning',
        confirmButtonText: '确认提交并交付',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    const result = await orderRecipeDesignApi.submitDesigns(targetOrderId)
    if (result.replayed) {
      ElMessage.success('本单已提交过，无需重复交付')
    } else {
      ElMessage.success(`已交付本单 ${result.recipeCount} 份食谱，顾客已收到通知`)
    }
    await loadWorkspace()
    returnToOrder()
  } catch {
    // 错误提示由 API 拦截器统一处理
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void loadWorkspace()
})
</script>

<style scoped>
.order-design-workspace {
  padding: 20px 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1080px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-header__main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #606266;
}

.page-header__actions {
  flex-shrink: 0;
}

.legacy-note,
.staff-permission-note,
.load-error,
.delivered-note {
  margin: 0;
}

.progress-card,
.submit-card {
  border: 1px solid #ebeef5;
}

.progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.progress-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.progress-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
}

.progress-bar {
  margin-top: 14px;
}

.progress-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.progress-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.slot-section {
  min-height: 80px;
}

.slot-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slot-card {
  border: 1px solid #ebeef5;
}

.slot-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.slot-card__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.slot-index {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
}

.slot-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.slot-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.slot-card__meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.slot-warning {
  margin-top: 10px;
}

.submit-card {
  margin-top: 4px;
}

.submit-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.submit-desc {
  margin: 6px 0 12px;
  font-size: 13px;
  color: #606266;
  line-height: 1.7;
}

.staff-waiting {
  margin-top: 4px;
}
</style>
