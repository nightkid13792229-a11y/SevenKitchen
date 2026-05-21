<template>
  <div class="purchase-lists">
    <div class="page-header">
      <div>
        <h2>采购单管理</h2>
        <p>按订单制作日期生成采购单，跟进采购执行、记录实际采购和库存补货。</p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="loadLists">刷新</el-button>
        <el-button type="primary" @click="openGenerateDialog">生成采购单</el-button>
      </div>
    </div>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters">
        <el-form-item label="类型">
          <el-select v-model="filters.kind" clearable placeholder="全部类型" style="width: 170px">
            <el-option label="订单日采" value="ORDER_DEMAND" />
            <el-option label="库存补货" value="STOCK_REPLENISHMENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 150px">
            <el-option label="待采购" value="PENDING" />
            <el-option label="已完成" value="COMPLETED" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchLists">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="lists" v-loading="loading" stripe>
        <el-table-column prop="id" label="采购单" min-width="210" show-overflow-tooltip />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag>{{ getKindText(row.kind) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划日期" width="130">
          <template #default="{ row }">{{ formatDate(row.targetDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getStatusTag(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="170">
          <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="原料项" width="100" align="right">
          <template #default="{ row }">{{ row.itemCount || row.items?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="预估成本" width="130" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.totalEstimatedCost) }}</template>
        </el-table-column>
        <el-table-column label="来源订单" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ (row.sourceOrderIds || []).join('、') || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="310" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="row.status === 'PENDING' && !row.startedAt"
              size="small"
              @click="startPurchase(row)"
            >
              开始
            </el-button>
            <el-button
              v-if="row.status === 'PENDING'"
              size="small"
              type="success"
              @click="completePurchase(row)"
            >
              完成
            </el-button>
            <el-button
              v-if="row.status === 'COMPLETED' && !row.reimbursementId"
              size="small"
              @click="reopenPurchase(row)"
            >
              撤回
            </el-button>
            <el-button
              v-if="row.status !== 'COMPLETED' && !row.reimbursementId"
              size="small"
              type="danger"
              @click="deleteList(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          layout="total, sizes, prev, pager, next"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="loadLists"
          @size-change="loadLists"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="generateDialogVisible"
      title="生成订单采购单"
      width="920px"
      :close-on-click-modal="false"
    >
      <el-form :model="generateForm" label-width="100px">
        <el-form-item label="制作日期" required>
          <el-date-picker
            v-model="generateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
          <el-button class="preview-button" :loading="previewLoading" @click="previewDemand">
            预览需求
          </el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="preview"
        class="preview-summary"
        :closable="false"
        type="info"
        show-icon
        :title="`共 ${preview.itemCount || preview.items?.length || 0} 个原料项，预估 ¥${formatAmount(preview.totalEstimatedCost)}，影响 ${(preview.affectedOrders || []).length} 个订单`"
      />

      <el-table v-if="preview" :data="preview.items || []" max-height="360" stripe>
        <el-table-column label="原料" min-width="190">
          <template #default="{ row }">{{ row.ingredientName || '-' }}</template>
        </el-table-column>
        <el-table-column label="需求" width="130" align="right">
          <template #default="{ row }">
            {{ formatNumber(row.quantityNeeded) }} {{ row.displayUnit || row.quantityUnit || '' }}
          </template>
        </el-table-column>
        <el-table-column label="需采购" width="130" align="right">
          <template #default="{ row }">
            {{ formatNumber(row.purchaseShortageQuantity ?? row.quantityNeeded) }}
          </template>
        </el-table-column>
        <el-table-column label="采购SKU" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.procurementSkuName || row.suggestedProductName || '-' }}</template>
        </el-table-column>
        <el-table-column label="渠道" width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.purchaseChannel || '-' }}</template>
        </el-table-column>
        <el-table-column label="预估成本" width="120" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.estimatedCost) }}</template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="generateDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!preview"
          @click="generatePurchase"
        >
          确认生成
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="采购单详情"
      width="1080px"
      :close-on-click-modal="false"
      @closed="currentList = null"
    >
      <template v-if="currentList">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="采购单">{{ currentList.id }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ getKindText(currentList.kind) }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ getStatusText(currentList.status) }}</el-descriptions-item>
          <el-descriptions-item label="计划日期">{{ formatDate(currentList.targetDate) }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatTime(currentList.startedAt) }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ formatTime(currentList.completedAt) }}</el-descriptions-item>
        </el-descriptions>

        <div class="detail-actions">
          <el-button
            :loading="detailActionLoading"
            :disabled="currentList.status !== 'PENDING'"
            @click="checkDateChanges"
          >
            检查日期变更
          </el-button>
          <el-button
            :loading="detailActionLoading"
            :disabled="currentList.status !== 'PENDING'"
            @click="recalculateCurrentList"
          >
            重新计算
          </el-button>
          <el-button
            :disabled="currentList.status !== 'PENDING'"
            @click="openOrderDialog('add')"
          >
            追加订单
          </el-button>
          <el-button
            :disabled="currentList.status !== 'PENDING'"
            @click="openOrderDialog('remove')"
          >
            剔除订单
          </el-button>
        </div>

        <el-tabs v-model="detailTab">
          <el-tab-pane label="采购明细" name="items">
            <el-table :data="currentList.items || []" stripe>
              <el-table-column label="原料" min-width="190">
                <template #default="{ row }">
                  <div class="stack">
                    <span class="primary-text">{{ row.ingredientName }}</span>
                    <span class="muted-text">{{ row.procurementSkuName || row.suggestedProductName || '-' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="采购量" width="140" align="right">
                <template #default="{ row }">
                  {{ formatNumber(row.purchaseShortageQuantity ?? row.quantityNeeded) }}
                  {{ row.displayUnit || row.quantityUnit || '' }}
                </template>
              </el-table-column>
              <el-table-column label="库存抵扣" width="110" align="right">
                <template #default="{ row }">{{ formatNumber(row.stockDeductedQuantity) }}</template>
              </el-table-column>
              <el-table-column label="渠道/型号" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ [row.purchaseChannel, row.productModel].filter(Boolean).join(' / ') || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="预估" width="110" align="right">
                <template #default="{ row }">¥{{ formatAmount(row.estimatedCost) }}</template>
              </el-table-column>
              <el-table-column label="无需采购" width="120">
                <template #default="{ row }">
                  <el-tag v-if="row.noPurchaseNeeded" type="info">已标记</el-tag>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="240" fixed="right">
                <template #default="{ row }">
                  <el-button
                    size="small"
                    :disabled="currentList.status !== 'PENDING' || !currentList.startedAt"
                    @click="openRecordDialog(row)"
                  >
                    记采购
                  </el-button>
                  <el-button
                    v-if="!row.noPurchaseNeeded"
                    size="small"
                    :disabled="currentList.status !== 'PENDING' || !currentList.startedAt"
                    @click="markNoPurchase(row)"
                  >
                    无需采购
                  </el-button>
                  <el-button
                    v-else
                    size="small"
                    :disabled="currentList.status !== 'PENDING' || !currentList.startedAt"
                    @click="clearNoPurchase(row)"
                  >
                    取消标记
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="采购记录" name="records">
            <el-table :data="records" v-loading="recordsLoading" stripe>
              <el-table-column label="原料/SKU" min-width="220">
                <template #default="{ row }">
                  <div class="stack">
                    <span class="primary-text">{{ row.ingredientName || '-' }}</span>
                    <span class="muted-text">{{ row.procurementSkuName || '-' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="渠道" width="150" show-overflow-tooltip>
                <template #default="{ row }">{{ row.purchaseChannel || '-' }}</template>
              </el-table-column>
              <el-table-column label="数量" width="160" align="right">
                <template #default="{ row }">
                  {{ formatNumber(row.actualQuantity || row.actualPackageCount) }}
                  {{ row.actualPackageUnit || '' }}
                </template>
              </el-table-column>
              <el-table-column label="金额" width="120" align="right">
                <template #default="{ row }">¥{{ formatAmount(row.actualCost) }}</template>
              </el-table-column>
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatTime(row.purchasedAt) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="90" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" type="danger" @click="deleteRecord(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-dialog>

    <el-dialog v-model="recordDialogVisible" title="添加采购记录" width="520px">
      <el-form :model="recordForm" label-width="110px">
        <el-form-item label="采购明细">
          <div class="stack">
            <span>{{ recordItem?.ingredientName || '-' }}</span>
            <span class="muted-text">{{ recordItem?.procurementSkuName || recordItem?.suggestedProductName || '-' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="采购渠道" required>
          <el-input v-model="recordForm.purchaseChannel" placeholder="如盒马、京东、山姆" />
        </el-form-item>
        <el-form-item label="采购数量">
          <el-input-number v-model="recordForm.actualQuantity" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="实际金额" required>
          <el-input-number v-model="recordForm.actualCost" :min="0.01" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="商品型号">
          <el-input v-model="recordForm.productModel" maxlength="120" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="recordForm.notes" type="textarea" :rows="3" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="recordSubmitting" @click="submitRecord">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="orderDialogVisible" :title="orderMode === 'add' ? '追加订单' : '剔除订单'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="订单ID" required>
          <el-input
            v-model="orderIdsText"
            type="textarea"
            :rows="5"
            placeholder="每行一个订单ID，或用逗号分隔"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="detailActionLoading" @click="submitOrderChanges">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { purchasingApi } from '@/api/purchasing'

type PurchaseList = Record<string, any>
type PurchaseItem = Record<string, any>
type PurchaseRecord = Record<string, any>

const loading = ref(false)
const lists = ref<PurchaseList[]>([])
const dateRange = ref<[string, string] | null>(null)
const filters = reactive({
  kind: '',
  status: ''
})
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const generateDialogVisible = ref(false)
const generateRange = ref<[string, string] | null>(null)
const preview = ref<any | null>(null)
const previewLoading = ref(false)
const generating = ref(false)
const generateForm = reactive({})

const detailVisible = ref(false)
const currentList = ref<PurchaseList | null>(null)
const detailTab = ref('items')
const detailActionLoading = ref(false)
const records = ref<PurchaseRecord[]>([])
const recordsLoading = ref(false)

const recordDialogVisible = ref(false)
const recordSubmitting = ref(false)
const recordItem = ref<PurchaseItem | null>(null)
const recordForm = reactive({
  purchaseChannel: '',
  actualQuantity: 0,
  actualCost: 0,
  productModel: '',
  notes: ''
})

const orderDialogVisible = ref(false)
const orderMode = ref<'add' | 'remove'>('add')
const orderIdsText = ref('')

const listParams = computed(() => ({
  kind: filters.kind || undefined,
  status: filters.status || undefined,
  startDate: dateRange.value?.[0],
  endDate: dateRange.value?.[1],
  page: pagination.page,
  pageSize: pagination.pageSize
}))

onMounted(() => {
  loadLists()
})

async function loadLists() {
  loading.value = true
  try {
    const result = await purchasingApi.getPurchaseLists(listParams.value)
    lists.value = result.list || []
    pagination.total = result.total || 0
  } finally {
    loading.value = false
  }
}

function searchLists() {
  pagination.page = 1
  loadLists()
}

function resetFilters() {
  filters.kind = ''
  filters.status = ''
  dateRange.value = null
  searchLists()
}

function openGenerateDialog() {
  const today = new Date().toISOString().slice(0, 10)
  generateRange.value = [today, today]
  preview.value = null
  generateDialogVisible.value = true
}

async function previewDemand() {
  if (!generateRange.value?.[0]) {
    ElMessage.warning('请选择制作日期')
    return
  }

  previewLoading.value = true
  try {
    preview.value = await purchasingApi.previewPurchaseList({
      startDate: generateRange.value[0],
      endDate: generateRange.value[1]
    })
  } finally {
    previewLoading.value = false
  }
}

async function generatePurchase() {
  if (!generateRange.value?.[0]) return
  generating.value = true
  try {
    await purchasingApi.generatePurchaseList({
      startDate: generateRange.value[0],
      endDate: generateRange.value[1]
    })
    ElMessage.success('采购单已生成')
    generateDialogVisible.value = false
    await loadLists()
  } finally {
    generating.value = false
  }
}

async function openDetail(row: PurchaseList) {
  detailVisible.value = true
  detailTab.value = 'items'
  await refreshDetail(row.id)
}

async function refreshDetail(id?: string) {
  const targetId = id || currentList.value?.id
  if (!targetId) return
  currentList.value = await purchasingApi.getPurchaseListDetail(targetId)
  await loadRecords(targetId)
}

async function loadRecords(id: string) {
  recordsLoading.value = true
  try {
    records.value = await purchasingApi.getPurchaseRecords(id)
  } finally {
    recordsLoading.value = false
  }
}

async function startPurchase(row: PurchaseList) {
  await purchasingApi.startPurchase(row.id)
  ElMessage.success('已开始采购')
  await loadLists()
}

async function completePurchase(row: PurchaseList) {
  await ElMessageBox.confirm('确认这张采购单已完成？系统会校验必需的采购记录。', '完成采购', {
    type: 'warning'
  })
  await purchasingApi.completePurchase(row.id)
  ElMessage.success('采购单已完成')
  await loadLists()
  if (currentList.value?.id === row.id) await refreshDetail(row.id)
}

async function reopenPurchase(row: PurchaseList) {
  await ElMessageBox.confirm('确认撤回完成状态？相关入库记录会被释放。', '撤回采购完成', {
    type: 'warning'
  })
  await purchasingApi.reopenPurchaseList(row.id)
  ElMessage.success('已撤回完成')
  await loadLists()
}

async function deleteList(row: PurchaseList) {
  await ElMessageBox.confirm('确认删除这张采购单？关联订单会从采购中回到已付款。', '删除采购单', {
    type: 'warning'
  })
  const result = await purchasingApi.deletePurchaseList(row.id)
  ElMessage.success(`采购单已删除，回滚 ${result?.restoredOrdersCount || 0} 个订单`)
  await loadLists()
}

async function checkDateChanges() {
  if (!currentList.value) return
  detailActionLoading.value = true
  try {
    const result = await purchasingApi.checkOrderDateChanges(currentList.value.id)
    if (!result.hasChanges) {
      ElMessage.success('未发现订单制作日期变更')
      return
    }
    const lines = result.changedOrders
      .map((order: any) => `${order.orderId}: ${order.originalDate} -> ${order.currentDate}`)
      .join('<br />')
    await ElMessageBox.alert(lines, '发现日期变更', {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '知道了'
    })
  } finally {
    detailActionLoading.value = false
  }
}

async function recalculateCurrentList() {
  if (!currentList.value) return
  await ElMessageBox.confirm('确认重新计算采购需求？会保留手工添加项，并更新库存分配。', '重新计算', {
    type: 'warning'
  })
  detailActionLoading.value = true
  try {
    await purchasingApi.recalculatePurchaseList(currentList.value.id)
    ElMessage.success('采购需求已重新计算')
    await refreshDetail()
    await loadLists()
  } finally {
    detailActionLoading.value = false
  }
}

function openRecordDialog(item: PurchaseItem) {
  recordItem.value = item
  recordForm.purchaseChannel = item.purchaseChannel || ''
  recordForm.actualQuantity = Number(item.purchaseShortageQuantity ?? item.quantityNeeded ?? 0)
  recordForm.actualCost = Number(item.estimatedCost || 0)
  recordForm.productModel = item.productModel || ''
  recordForm.notes = ''
  recordDialogVisible.value = true
}

async function submitRecord() {
  if (!currentList.value || !recordItem.value) return
  if (!recordForm.purchaseChannel.trim()) {
    ElMessage.warning('请填写采购渠道')
    return
  }
  if (recordForm.actualCost <= 0) {
    ElMessage.warning('请填写实际金额')
    return
  }

  recordSubmitting.value = true
  try {
    await purchasingApi.addPurchaseRecord(currentList.value.id, {
      purchaseItemId: recordItem.value.id,
      procurementSkuId: recordItem.value.procurementSkuId,
      suggestedProductId: recordItem.value.suggestedProductId,
      suggestedProductName: recordItem.value.suggestedProductName,
      purchaseChannel: recordForm.purchaseChannel.trim(),
      actualQuantity: recordForm.actualQuantity,
      actualCost: recordForm.actualCost,
      productModel: recordForm.productModel.trim(),
      notes: recordForm.notes.trim()
    })
    ElMessage.success('采购记录已保存')
    recordDialogVisible.value = false
    await loadRecords(currentList.value.id)
  } finally {
    recordSubmitting.value = false
  }
}

async function deleteRecord(record: PurchaseRecord) {
  if (!currentList.value) return
  await ElMessageBox.confirm('确认删除这条采购记录？', '删除采购记录', { type: 'warning' })
  await purchasingApi.deletePurchaseRecord(currentList.value.id, record.id)
  ElMessage.success('采购记录已删除')
  await loadRecords(currentList.value.id)
}

async function markNoPurchase(item: PurchaseItem) {
  if (!currentList.value) return
  const { value } = await ElMessageBox.prompt('请填写无需采购原因', '标记无需采购', {
    inputPlaceholder: '如库存足够、供应商赠送、无需本次采购',
    confirmButtonText: '确认',
    cancelButtonText: '取消'
  })
  await purchasingApi.markItemNoPurchase(currentList.value.id, item.id, { reason: value })
  ElMessage.success('已标记无需采购')
  await refreshDetail()
}

async function clearNoPurchase(item: PurchaseItem) {
  if (!currentList.value) return
  await purchasingApi.clearItemNoPurchase(currentList.value.id, item.id)
  ElMessage.success('已取消标记')
  await refreshDetail()
}

function openOrderDialog(mode: 'add' | 'remove') {
  orderMode.value = mode
  orderIdsText.value = ''
  orderDialogVisible.value = true
}

async function submitOrderChanges() {
  if (!currentList.value) return
  const orderIds = orderIdsText.value
    .split(/[\n,，\s]+/)
    .map((id) => id.trim())
    .filter(Boolean)

  if (orderIds.length === 0) {
    ElMessage.warning('请填写订单ID')
    return
  }

  detailActionLoading.value = true
  try {
    if (orderMode.value === 'add') {
      await purchasingApi.addOrdersToList(currentList.value.id, { orderIds })
      ElMessage.success('订单已追加')
    } else {
      await purchasingApi.removeOrdersFromList(currentList.value.id, { orderIds })
      ElMessage.success('订单已剔除')
    }
    orderDialogVisible.value = false
    await refreshDetail()
    await loadLists()
  } finally {
    detailActionLoading.value = false
  }
}

function getKindText(kind?: string) {
  const map: Record<string, string> = {
    ORDER_DEMAND: '订单日采',
    STOCK_REPLENISHMENT: '库存补货'
  }
  return map[kind || ''] || kind || '-'
}

function getStatusText(status?: string) {
  const map: Record<string, string> = {
    PENDING: '待采购',
    COMPLETED: '已完成'
  }
  return map[status || ''] || status || '-'
}

function getStatusTag(status?: string): 'success' | 'warning' | 'info' {
  return status === 'COMPLETED' ? 'success' : status === 'PENDING' ? 'warning' : 'info'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('zh-CN')
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatAmount(value?: number | string | null) {
  return Number(value || 0).toFixed(2)
}

function formatNumber(value?: number | string | null) {
  const num = Number(value || 0)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}
</script>

<style scoped lang="scss">
.purchase-lists {
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;

    h2 {
      margin: 0 0 6px;
      font-size: 22px;
      color: #1f2937;
    }

    p {
      margin: 0;
      color: #667085;
      font-size: 14px;
    }
  }

  .header-actions,
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-card,
  .table-card {
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .pagination-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .preview-button {
    margin-left: 12px;
  }

  .preview-summary {
    margin-bottom: 14px;
  }

  .detail-actions {
    margin: 16px 0;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 3px;
    line-height: 1.4;
  }

  .primary-text {
    color: #1f2937;
    font-weight: 500;
  }

  .muted-text {
    color: #667085;
    font-size: 12px;
  }
}
</style>
