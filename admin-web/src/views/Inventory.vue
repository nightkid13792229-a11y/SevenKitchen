<template>
  <div class="inventory-page">
    <div class="summary-grid">
      <el-card shadow="hover">
        <div class="summary-label">库存总条目</div>
        <div class="summary-value">{{ inventory.length }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card danger">
        <div class="summary-label">需要补货</div>
        <div class="summary-value">{{ replenishmentCount }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card warning">
        <div class="summary-label">低于安全库存</div>
        <div class="summary-value">{{ lowStockCount }}</div>
      </el-card>
      <el-card shadow="hover">
        <div class="summary-label">未设阈值</div>
        <div class="summary-value">{{ noPolicyCount }}</div>
      </el-card>
    </div>

    <el-card>
      <template #header>
        <div class="card-header">
          <div>
            <div class="header-title">库存管理台</div>
            <div class="header-subtitle">统一查看库存状态、流水变动和盘点差异</div>
          </div>
          <div class="header-actions">
            <el-button @click="openAdjustmentDialog()">手工调整</el-button>
            <el-button type="primary" @click="openStocktakeDialog">新建盘点</el-button>
            <el-button @click="refreshActiveTab">刷新</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="inventory-tabs">
        <el-tab-pane label="库存总览" name="overview">
          <div class="tab-toolbar">
            <el-select
              v-model="typeFilter"
              clearable
              placeholder="全部原料类型"
              style="width: 180px"
            >
              <el-option label="食材" value="FOOD" />
              <el-option label="营养补充剂" value="SUPPLEMENT" />
              <el-option label="包装材料" value="PACKAGING" />
            </el-select>
            <el-switch
              v-model="onlyWarnings"
              active-text="仅看预警"
              inactive-text="全部"
            />
          </div>

          <el-table :data="displayInventory" v-loading="loadingInventory" style="width: 100%">
            <el-table-column prop="name" label="原料名称" min-width="180" />
            <el-table-column prop="type" label="类型" width="110">
              <template #default="{ row }">
                <el-tag>{{ getTypeText(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="采购策略" width="120">
              <template #default="{ row }">
                <el-tag :type="getStrategyTagType(row.procurementStrategy)">
                  {{ getStrategyText(row.procurementStrategy) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="当前库存" width="150" align="right">
              <template #default="{ row }">
                {{ formatQuantity(row.currentStock) }} {{ row.stockUnitLabel }}
              </template>
            </el-table-column>
            <el-table-column label="库存状态" width="130">
              <template #default="{ row }">
                <el-tag :type="getStockStatusTagType(row.stockStatus)">
                  {{ getStockStatusText(row.stockStatus) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="阈值设置" min-width="220">
              <template #default="{ row }">
                <span v-if="formatThresholds(row)">
                  {{ formatThresholds(row) }}
                </span>
                <span v-else class="placeholder">-</span>
              </template>
            </el-table-column>
            <el-table-column label="在途 / 建议补货" min-width="240">
              <template #default="{ row }">
                <div
                  v-if="row.suggestedPurchaseQuantity > 0 || row.inTransitQuantity > 0"
                  class="suggestion-block"
                >
                  <div v-if="row.inTransitQuantity > 0" class="suggestion-meta">
                    在途 {{ formatQuantity(row.inTransitQuantity) }} {{ row.purchaseUnit }}
                  </div>
                  <div v-if="row.netShortageQuantity > 0">
                    {{ formatQuantity(row.netShortageQuantity) }} {{ row.purchaseUnit }}
                  </div>
                  <div v-if="row.netShortageQuantity > 0" class="suggestion-meta">
                    还差 · 约 ¥{{ formatPrice(row.netShortageEstimatedCost) }}
                    <span v-if="row.suggestedProductName"> · {{ row.suggestedProductName }}</span>
                  </div>
                  <div v-else class="suggestion-meta">在途已覆盖</div>
                </div>
                <span v-else class="placeholder">-</span>
              </template>
            </el-table-column>
            <el-table-column label="成本" width="160" align="right">
              <template #default="{ row }">
                {{ formatInventoryCost(row) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button size="small" @click="openLedgerForIngredient(row)">流水</el-button>
                  <el-button size="small" @click="openAdjustmentDialog(row)">调库存</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="库存流水" name="ledger">
          <div class="tab-toolbar wrap">
            <el-select
              v-model="ledgerFilter.ingredientId"
              clearable
              filterable
              placeholder="筛选原料"
              style="width: 260px"
            >
              <el-option
                v-for="item in inventory"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <el-button @click="loadLedger">查询</el-button>
            <el-button text @click="clearLedgerFilter">清空筛选</el-button>
          </div>

          <el-table :data="ledgerEntries" v-loading="loadingLedger" style="width: 100%">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column prop="ingredientName" label="原料" min-width="160" />
            <el-table-column label="变动" width="160" align="right">
              <template #default="{ row }">
                <span :class="row.deltaG >= 0 ? 'positive' : 'negative'">
                  {{ formatSignedQuantity(row.deltaG) }} {{ row.stockUnitLabel }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="来源" width="130">
              <template #default="{ row }">
                <el-tag :type="getSourceTagType(row.sourceType)">
                  {{ row.sourceLabel || getSourceText(row.sourceType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="数量说明" min-width="240">
              <template #default="{ row }">
                <span v-if="formatLedgerQuantities(row)">
                  {{ formatLedgerQuantities(row) }}
                </span>
                <span v-else class="placeholder">-</span>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="220">
              <template #default="{ row }">
                <span v-if="row.sourceDescription">{{ row.sourceDescription }}</span>
                <span v-else class="placeholder">-</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="盘点记录" name="stocktakes">
          <div class="tab-toolbar">
            <div class="muted-text">盘点提交后由管理员复核；容差内自动入账，超容差才需要人工通过或驳回。驳回后需重新盘点（新建一张单）。</div>
          </div>

          <el-table :data="stocktakes" v-loading="loadingStocktakes" style="width: 100%">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="stocktake-lines">
                  <div class="stocktake-note">
                    <strong>盘点备注：</strong>
                    <span>{{ row.note || '无' }}</span>
                  </div>
                  <el-table :data="row.lines" border size="small">
                    <el-table-column prop="ingredientName" label="原料名称" min-width="160" />
                    <el-table-column label="账面库存" width="160" align="right">
                      <template #default="{ row: line }">
                        {{ formatQuantity(line.expectedQuantityG) }} {{ line.stockUnitLabel }}
                      </template>
                    </el-table-column>
                    <el-table-column label="盘点库存" width="160" align="right">
                      <template #default="{ row: line }">
                        {{ line.countedQuantityG === null || line.countedQuantityG === undefined ? '未盘' : formatQuantity(line.countedQuantityG) + ' ' + line.stockUnitLabel }}
                      </template>
                    </el-table-column>
                    <el-table-column label="差异" width="160" align="right">
                      <template #default="{ row: line }">
                        <span v-if="line.deltaG !== null && line.deltaG !== undefined" :class="line.deltaG >= 0 ? 'positive' : 'negative'">
                          {{ formatSignedQuantity(line.deltaG) }} {{ line.stockUnitLabel }}
                        </span>
                        <span v-else class="placeholder">-</span>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="stocktakeTagType(row.status)">
                  {{ getStocktakeStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="原料数" width="100" align="right">
              <template #default="{ row }">
                {{ row.lineCount }}
              </template>
            </el-table-column>
            <el-table-column label="有差异条目" width="120" align="right">
              <template #default="{ row }">
                {{ row.varianceCount }}
              </template>
            </el-table-column>
            <el-table-column label="差异绝对值合计" width="170" align="right">
              <template #default="{ row }">
                {{ formatQuantity(row.totalAbsDeltaG) }}
              </template>
            </el-table-column>
            <el-table-column label="入账时间" width="170">
              <template #default="{ row }">
                <span v-if="row.appliedAt">{{ formatDateTime(row.appliedAt) }}</span>
                <span v-else class="placeholder">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === InventoryStocktakeStatus.SUBMITTED">
                  <el-button type="success" size="small" @click="approveStocktake(row)">
                    通过并入账
                  </el-button>
                  <el-button type="danger" size="small" @click="rejectStocktake(row)">
                    驳回
                  </el-button>
                </template>
                <span v-else class="placeholder">{{ stocktakeStatusHint(row.status) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="报废/领用" name="adjustments">
          <div class="tab-toolbar">
            <div class="muted-text">报废单笔 ≥50 元进待复核；内部领用免批。驳回会写一笔反向调整，把扣掉的加回来。</div>
            <el-button size="small" @click="loadAdjustments">刷新</el-button>
          </div>

          <div class="adjust-summary">
            <div class="summary-cell"><span>内部领用</span><strong>{{ adjustmentSummary.internalUseCount }}</strong></div>
            <div class="summary-cell"><span>报废</span><strong>{{ adjustmentSummary.scrapCount }}</strong></div>
            <div class="summary-cell"><span>待复核金额</span><strong>¥{{ formatQuantity(adjustmentSummary.pendingAmount) }}</strong></div>
            <div class="summary-cell"><span>本期盘亏</span><strong>{{ formatQuantity(adjustmentSummary.stocktakeLoss) }}</strong></div>
          </div>

          <el-table :data="adjustments" v-loading="loadingAdjustments" style="width: 100%">
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column prop="ingredientName" label="原料" min-width="140" />
            <el-table-column label="分类" width="110">
              <template #default="{ row }">{{ adjustmentCategoryText(row.category) }}</template>
            </el-table-column>
            <el-table-column label="数量" width="140" align="right">
              <template #default="{ row }">
                {{ formatSignedQuantity(row.deltaG) }} {{ row.stockUnitLabel }}
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100" align="right">
              <template #default="{ row }">
                {{ row.costAmount === null ? '-' : '¥' + formatQuantity(row.costAmount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="adjustmentTagType(row.reviewStatus)">
                  {{ adjustmentStatusText(row.reviewStatus) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <template v-if="row.reviewStatus === 'PENDING'">
                  <el-button type="success" size="small" @click="approveAdjustment(row)">通过</el-button>
                  <el-button type="danger" size="small" @click="rejectAdjustment(row)">驳回</el-button>
                </template>
                <span v-else class="placeholder">-</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>



    <el-dialog v-model="adjustmentDialogVisible" title="手工库存调整" width="520px">
      <el-form :model="adjustmentForm" label-width="110px">
        <el-form-item label="原料">
          <el-select
            v-model="adjustmentForm.ingredientId"
            filterable
            placeholder="请选择原料"
            style="width: 100%"
          >
            <el-option
              v-for="item in inventory"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="调整方式">
          <el-radio-group v-model="adjustmentForm.adjustmentMode">
            <el-radio-button :label="InventoryAdjustmentMode.DELTA">按差异调整</el-radio-button>
            <el-radio-button :label="InventoryAdjustmentMode.SET">设置为盘点值</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="adjustmentQuantityLabel">
          <el-input-number
            v-model="adjustmentForm.quantity"
            :precision="2"
            :step="1"
            :min="adjustmentForm.adjustmentMode === InventoryAdjustmentMode.SET ? 0 : undefined"
            style="width: 100%"
          />
          <div class="form-hint">
            当前单位：{{ selectedAdjustmentIngredient?.stockUnitLabel || 'G' }}
          </div>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="adjustmentForm.reason" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="adjustmentForm.note"
            type="textarea"
            :rows="3"
            placeholder="可填写差异原因、处理说明等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustmentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingAdjustment" @click="submitAdjustment">
          确认调整
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="stocktakeDialogVisible" title="新建盘点单" width="760px">
      <div class="stocktake-toolbar">
        <span class="muted-text">后台新建只用于补录/抽盘；主流程从员工端开单。留空表示未盘。</span>
        <el-button text @click="addStocktakeLine">添加原料</el-button>
      </div>

      <el-form :model="stocktakeForm" label-width="100px">
        <el-form-item label="盘点备注">
          <el-input
            v-model="stocktakeForm.note"
            type="textarea"
            :rows="2"
            placeholder="可填写本次盘点范围、异常说明等"
          />
        </el-form-item>
      </el-form>

      <div v-if="stocktakeForm.lines.length === 0" class="empty-lines">
        还没有盘点原料，点击“添加原料”开始录入。
      </div>

      <div v-for="(line, index) in stocktakeForm.lines" :key="line.key" class="stocktake-line-row">
        <div class="line-index">{{ index + 1 }}</div>
        <el-select
          v-model="line.ingredientId"
          filterable
          placeholder="选择原料"
          style="width: 320px"
        >
          <el-option
            v-for="item in inventory"
            :key="item.id"
            :label="item.name"
            :value="item.id"
            :disabled="isIngredientSelected(line.ingredientId, item.id)"
          />
        </el-select>
        <el-input
          v-model="line.countedText"
          placeholder="留空=未盘"
          style="width: 180px"
        />
        <div class="line-unit">{{ getLineUnit(line.ingredientId) }}</div>
        <el-button text type="danger" @click="removeStocktakeLine(index)">删除</el-button>
      </div>

      <template #footer>
        <el-button @click="stocktakeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingStocktake" @click="submitStocktake">
          保存草稿
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { inventoryApi } from '@/api'
import { formatInventoryCost } from '@/utils/costFormat'
import {
  IngredientProcurementStrategy,
  IngredientProcurementStrategyLabels,
  InventoryAdjustmentMode,
  InventoryAdjustmentModeLabels,
  InventorySourceType,
  InventorySourceTypeLabels,
  InventoryStocktakeStatus,
  InventoryStocktakeStatusLabels,
  StockLevelStatusLabels,
  type InventoryLedgerItem,
  type InventoryOverviewItem,
  type InventoryStocktakeItem,
  type StockLevelStatus
} from '@/types/ingredient'

const activeTab = ref('overview')
const loadingInventory = ref(false)
const loadingLedger = ref(false)
const loadingStocktakes = ref(false)
const inventory = ref<InventoryOverviewItem[]>([])
const ledgerEntries = ref<InventoryLedgerItem[]>([])
const stocktakes = ref<InventoryStocktakeItem[]>([])
const adjustments = ref<any[]>([])
const loadingAdjustments = ref(false)
const adjustmentSummary = ref({
  internalUseCount: 0,
  scrapCount: 0,
  pendingAmount: 0,
  stocktakeLoss: 0
})

const adjustmentDialogVisible = ref(false)
const stocktakeDialogVisible = ref(false)
const onlyWarnings = ref(false)
const typeFilter = ref('')
const submittingAdjustment = ref(false)
const submittingStocktake = ref(false)


const ledgerFilter = reactive({
  ingredientId: ''
})

const adjustmentForm = reactive({
  ingredientId: '',
  adjustmentMode: InventoryAdjustmentMode.DELTA,
  quantity: 0,
  reason: '',
  note: ''
})

const stocktakeForm = reactive({
  note: '',
  lines: [] as Array<{
    key: string
    ingredientId: string
    countedText: string
  }>
})

const displayInventory = computed(() => {
  let rows = inventory.value
  if (typeFilter.value) {
    rows = rows.filter((item) => item.type === typeFilter.value)
  }
  if (!onlyWarnings.value) {
    return rows
  }

  return rows.filter((item) =>
    item.stockStatus === 'NEEDS_REPLENISHMENT' || item.stockStatus === 'LOW_STOCK'
  )
})

const replenishmentCount = computed(() => (
  inventory.value.filter((item) => item.stockStatus === 'NEEDS_REPLENISHMENT').length
))

const lowStockCount = computed(() => (
  inventory.value.filter((item) => item.stockStatus === 'LOW_STOCK').length
))

const noPolicyCount = computed(() => (
  inventory.value.filter((item) => item.stockStatus === 'NO_POLICY').length
))

const selectedAdjustmentIngredient = computed(() =>
  inventory.value.find((item) => item.id === adjustmentForm.ingredientId)
)

const adjustmentQuantityLabel = computed(() => (
  adjustmentForm.adjustmentMode === InventoryAdjustmentMode.SET ? '盘点库存' : '调整差异'
))

const getTypeText = (type: string) => {
  const typeMap: Record<string, string> = {
    FOOD: '食材',
    SUPPLEMENT: '营养补充剂',
    PACKAGING: '包装材料'
  }
  return typeMap[type] || type
}

const getStrategyText = (strategy: string) => (
  IngredientProcurementStrategyLabels[strategy] || strategy
)

const getStrategyTagType = (strategy: string) => {
  const typeMap: Record<string, string> = {
    [IngredientProcurementStrategy.DAILY_PURCHASE]: 'info',
    [IngredientProcurementStrategy.STOCK_REPLENISHMENT]: 'success',
    [IngredientProcurementStrategy.HYBRID]: 'warning'
  }
  return typeMap[strategy] || 'info'
}

const getStockStatusText = (status: StockLevelStatus) => (
  StockLevelStatusLabels[status] || status
)

const getStockStatusTagType = (status: StockLevelStatus) => {
  const typeMap: Record<StockLevelStatus, string> = {
    NEEDS_REPLENISHMENT: 'danger',
    LOW_STOCK: 'warning',
    SUFFICIENT: 'success',
    NO_POLICY: 'info'
  }
  return typeMap[status]
}

const getSourceText = (sourceType: InventorySourceType) => (
  InventorySourceTypeLabels[sourceType] || sourceType
)

const getSourceTagType = (sourceType: InventorySourceType) => {
  const typeMap: Record<InventorySourceType, string> = {
    [InventorySourceType.KITCHEN_TASK]: 'warning',
    [InventorySourceType.PURCHASE_RECORD]: 'success',
    [InventorySourceType.PURCHASE_RECORD_REVERSAL]: 'info',
    [InventorySourceType.OPENING_BALANCE]: 'info',
    [InventorySourceType.MANUAL_ADJUSTMENT]: 'primary',
    [InventorySourceType.STOCKTAKE]: 'danger'
  }
  return typeMap[sourceType] || 'info'
}

const getStocktakeStatusText = (status: InventoryStocktakeStatus) => (
  InventoryStocktakeStatusLabels[status] || status
)

const formatQuantity = (value: number | null | undefined) => Number(value || 0).toFixed(2)
const formatPrice = (value: number | null | undefined) => Number(value || 0).toFixed(2)

const formatSignedQuantity = (value: number | null | undefined) => {
  const num = Number(value || 0)
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}`
}

const formatDateTime = (value: string) => {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false
  })
}

const formatThresholds = (item: InventoryOverviewItem) => {
  const segments = [
    item.safetyStock !== null ? `安全 ${formatQuantity(item.safetyStock)} ${item.stockUnitLabel}` : '',
    item.reorderPoint !== null ? `补货 ${formatQuantity(item.reorderPoint)} ${item.stockUnitLabel}` : '',
    item.targetStock !== null ? `目标 ${formatQuantity(item.targetStock)} ${item.stockUnitLabel}` : ''
  ].filter(Boolean)

  return segments.join(' / ')
}

const formatLedgerQuantities = (item: InventoryLedgerItem) => {
  if (item.quantityBeforeG !== null && item.quantityAfterG !== null) {
    return `${formatQuantity(item.quantityBeforeG)} -> ${formatQuantity(item.quantityAfterG)} ${item.stockUnitLabel}`
  }

  if (item.expectedQuantityG !== null && item.countedQuantityG !== null) {
    return `账面 ${formatQuantity(item.expectedQuantityG)} / 盘点 ${formatQuantity(item.countedQuantityG)} ${item.stockUnitLabel}`
  }

  return ''
}

const loadInventory = async () => {
  loadingInventory.value = true
  try {
    const data = await inventoryApi.overview()
    inventory.value = (data || []) as InventoryOverviewItem[]
  } catch (error) {
    ElMessage.error('加载库存列表失败')
  } finally {
    loadingInventory.value = false
  }
}

const loadLedger = async () => {
  loadingLedger.value = true
  try {
    const data = await inventoryApi.ledger({
      ingredientId: ledgerFilter.ingredientId || undefined,
      limit: 200
    })
    ledgerEntries.value = (data || []) as InventoryLedgerItem[]
  } catch (error) {
    ElMessage.error('加载库存流水失败')
  } finally {
    loadingLedger.value = false
  }
}

const loadStocktakes = async () => {
  loadingStocktakes.value = true
  try {
    const data = await inventoryApi.stocktakes({ limit: 30 })
    stocktakes.value = (data || []) as InventoryStocktakeItem[]
  } catch (error) {
    ElMessage.error('加载盘点记录失败')
  } finally {
    loadingStocktakes.value = false
  }
}

const loadAdjustments = async () => {
  loadingAdjustments.value = true
  try {
    const [rows, summary] = await Promise.all([
      inventoryApi.adjustments({}),
      inventoryApi.adjustmentSummary({})
    ])
    adjustments.value = (rows || []) as any[]
    adjustmentSummary.value = {
      internalUseCount: Number(summary?.internalUseCount || 0),
      scrapCount: Number(summary?.scrapCount || 0),
      pendingAmount: Number(summary?.pendingAmount || 0),
      stocktakeLoss: Number(summary?.stocktakeLoss || 0)
    }
  } catch (error) {
    ElMessage.error('加载报废/领用失败')
  } finally {
    loadingAdjustments.value = false
  }
}

const adjustmentCategoryText = (category: string) =>
  ({
    INTERNAL_USE: '内部领用',
    EXPIRED: '过期报废',
    DAMAGED: '破损污染',
    OTHER: '其他'
  })[category] || category

const adjustmentStatusText = (status: string) =>
  ({
    NONE: '已入账',
    PENDING: '待复核',
    APPROVED: '已通过',
    REJECTED: '已驳回'
  })[status] || status

const adjustmentTagType = (status: string) => {
  if (status === 'PENDING') return 'warning'
  if (status === 'REJECTED') return 'danger'
  if (status === 'APPROVED') return 'success'
  return 'info'
}

const approveAdjustment = async (row: any) => {
  try {
    await ElMessageBox.confirm('确认通过这条报废吗？通过后不再改动库存。', '复核通过', {
      type: 'warning'
    })
    await inventoryApi.reviewAdjustment(row.id, { approve: true })
    ElMessage.success('已通过')
    await Promise.all([loadAdjustments(), loadInventory(), loadLedger()])
  } catch (error: any) {
    if (error === 'cancel' || error?.message === 'cancel') return
    ElMessage.error(error?.message || '复核失败')
  }
}

const rejectAdjustment = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt('填写驳回原因（至少 4 个字），系统会把扣掉的库存加回来。', '驳回报废', {
      inputValidator: (v: string) => (v && v.trim().length >= 4) || '请填写至少 4 个字'
    })
    await inventoryApi.reviewAdjustment(row.id, { approve: false, note: value.trim() })
    ElMessage.success('已驳回并冲回')
    await Promise.all([loadAdjustments(), loadInventory(), loadLedger()])
  } catch (error: any) {
    if (error === 'cancel' || error?.message === 'cancel') return
    ElMessage.error(error?.message || '驳回失败')
  }
}

const refreshActiveTab = async () => {
  if (activeTab.value === 'overview') {
    await loadInventory()
    return
  }

  if (activeTab.value === 'ledger') {
    await loadLedger()
    return
  }

  if (activeTab.value === 'adjustments') {
    await loadAdjustments()
    return
  }

  await loadStocktakes()
}

const clearLedgerFilter = async () => {
  ledgerFilter.ingredientId = ''
  await loadLedger()
}

const openLedgerForIngredient = async (item: InventoryOverviewItem) => {
  ledgerFilter.ingredientId = item.id
  activeTab.value = 'ledger'
  await loadLedger()
}

const resetAdjustmentForm = () => {
  adjustmentForm.ingredientId = ''
  adjustmentForm.adjustmentMode = InventoryAdjustmentMode.DELTA
  adjustmentForm.quantity = 0
  adjustmentForm.reason = ''
  adjustmentForm.note = ''
}

const openAdjustmentDialog = (item?: InventoryOverviewItem) => {
  resetAdjustmentForm()
  if (item) {
    adjustmentForm.ingredientId = item.id
  }
  adjustmentDialogVisible.value = true
}

const submitAdjustment = async () => {
  if (!adjustmentForm.ingredientId) {
    ElMessage.warning('请选择原料')
    return
  }

  if (!adjustmentForm.reason.trim()) {
    ElMessage.warning('请填写调整原因')
    return
  }

  if (adjustmentForm.adjustmentMode === InventoryAdjustmentMode.DELTA && adjustmentForm.quantity === 0) {
    ElMessage.warning('调整差异不能为 0')
    return
  }

  submittingAdjustment.value = true
  try {
    await inventoryApi.createAdjustment({
      ingredientId: adjustmentForm.ingredientId,
      adjustmentMode: adjustmentForm.adjustmentMode,
      quantity: adjustmentForm.quantity,
      reason: adjustmentForm.reason.trim(),
      note: adjustmentForm.note.trim() || undefined
    })

    ElMessage.success(
      adjustmentForm.adjustmentMode === InventoryAdjustmentMode.SET
        ? '库存已按盘点值更新'
        : `库存${InventoryAdjustmentModeLabels[adjustmentForm.adjustmentMode]}成功`
    )
    adjustmentDialogVisible.value = false
    await Promise.all([loadInventory(), loadLedger()])
  } catch (error) {
    ElMessage.error('库存调整失败')
  } finally {
    submittingAdjustment.value = false
  }
}

const resetStocktakeForm = () => {
  stocktakeForm.note = ''
  stocktakeForm.lines = []
  addStocktakeLine()
}

const openStocktakeDialog = () => {
  resetStocktakeForm()
  stocktakeDialogVisible.value = true
}

const addStocktakeLine = () => {
  stocktakeForm.lines.push({
    key: `${Date.now()}-${Math.random()}`,
    ingredientId: '',
    countedText: ''
  })
}

const removeStocktakeLine = (index: number) => {
  stocktakeForm.lines.splice(index, 1)
}

const isIngredientSelected = (currentIngredientId: string, candidateId: string) => (
  stocktakeForm.lines.some((line) => line.ingredientId === candidateId && line.ingredientId !== currentIngredientId)
)

const getLineUnit = (ingredientId: string) => {
  const ingredient = inventory.value.find((item) => item.id === ingredientId)
  return ingredient?.stockUnitLabel || 'G'
}

const submitStocktake = async () => {
  const validLines = stocktakeForm.lines.filter((line) => line.ingredientId)
  if (validLines.length === 0) {
    ElMessage.warning('请至少选择一个盘点原料')
    return
  }

  const ingredientIds = validLines.map((line) => line.ingredientId)
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    ElMessage.warning('盘点单中存在重复原料')
    return
  }

  let lines: Array<{ ingredientId: string; countedQuantityG: number | null }>
  try {
    lines = validLines.map((line) => {
      const text = line.countedText.trim()
      if (!text) {
        return { ingredientId: line.ingredientId, countedQuantityG: null }
      }
      const value = Number(text)
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('实盘数量必须是非负数字，或留空表示未盘')
      }
      return { ingredientId: line.ingredientId, countedQuantityG: value }
    })
  } catch (error: any) {
    ElMessage.warning(error.message || '实盘数量不合法')
    return
  }

  submittingStocktake.value = true
  try {
    await inventoryApi.createStocktake({
      note: stocktakeForm.note.trim() || undefined,
      lines
    })

    ElMessage.success('盘点草稿已保存')
    stocktakeDialogVisible.value = false
    await loadStocktakes()
    activeTab.value = 'stocktakes'
  } catch (error) {
    ElMessage.error('创建盘点单失败')
  } finally {
    submittingStocktake.value = false
  }
}

const stocktakeTagType = (status: InventoryStocktakeStatus) => {
  if (status === InventoryStocktakeStatus.APPLIED) return 'success'
  if (status === InventoryStocktakeStatus.SUBMITTED) return 'warning'
  if (status === InventoryStocktakeStatus.REJECTED) return 'danger'
  return 'info'
}

const stocktakeStatusHint = (status: InventoryStocktakeStatus) => {
  if (status === InventoryStocktakeStatus.DRAFT) return '草稿（员工端录入）'
  if (status === InventoryStocktakeStatus.APPLIED) return '已入账'
  if (status === InventoryStocktakeStatus.REJECTED) return '已驳回，需重盘'
  return ''
}

const approveStocktake = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      '确认通过并补入超容差的差异吗？通过后库存会按盘点结果纠偏。',
      '复核通过',
      { type: 'warning' }
    )
    await inventoryApi.reviewStocktake(row.id, { approve: true })
    ElMessage.success('已通过并入账')
    await Promise.all([loadStocktakes(), loadInventory(), loadLedger()])
  } catch (error: any) {
    if (error === 'cancel' || error?.message === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '复核失败')
  }
}

const rejectStocktake = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt(
      '填写驳回原因（至少 4 个字），员工需要重新盘点。',
      '驳回盘点',
      {
        inputValidator: (v: string) =>
          (v && v.trim().length >= 4) || '请填写至少 4 个字'
      }
    )
    await inventoryApi.reviewStocktake(row.id, {
      approve: false,
      note: value.trim()
    })
    ElMessage.success('已驳回，需重新盘点')
    await loadStocktakes()
  } catch (error: any) {
    if (error === 'cancel' || error?.message === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '驳回失败')
  }
}

onMounted(async () => {
  await Promise.all([loadInventory(), loadLedger(), loadStocktakes(), loadAdjustments()])
})
</script>

<style scoped>
.inventory-page {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.summary-card.danger {
  border-color: #f56c6c;
}

.summary-card.warning {
  border-color: #e6a23c;
}

.summary-label {
  font-size: 13px;
  color: #909399;
}

.summary-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 700;
  color: #303133;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.header-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.inventory-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

.tab-toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tab-toolbar.wrap {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  gap: 8px;
}

.suggestion-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.suggestion-meta,
.muted-text,
.form-hint,
.placeholder {
  color: #909399;
  font-size: 12px;
}

.positive {
  color: #67c23a;
  font-weight: 600;
}

.negative {
  color: #f56c6c;
  font-weight: 600;
}

.stocktake-toolbar {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.empty-lines {
  padding: 24px 0;
  text-align: center;
  color: #909399;
}

.stocktake-line-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 320px) 180px 80px 72px;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.line-index {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f4f4f5;
  color: #606266;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.line-unit {
  color: #606266;
  font-size: 13px;
}

.stocktake-lines {
  padding: 8px 12px 12px;
}

.stocktake-note {
  margin-bottom: 12px;
  color: #606266;
}

@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .stocktake-line-row {
    grid-template-columns: 40px 1fr;
  }

  .line-unit {
    margin-top: -8px;
  }
}

@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .header-actions,
  .tab-toolbar {
    width: 100%;
    flex-wrap: wrap;
  }

  .row-actions {
    flex-wrap: wrap;
  }
}
.adjust-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.summary-cell {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f7f9f5;
  border: 1px solid #e8ede7;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.summary-cell span {
  font-size: 12px;
  color: #7a8a80;
}
.summary-cell strong {
  font-size: 22px;
  color: #1e3a2f;
}
</style>
