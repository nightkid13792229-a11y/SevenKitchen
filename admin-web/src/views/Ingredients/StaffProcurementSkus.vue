<template>
  <div class="staff-sku-page">
    <el-card shadow="never">
      <div class="page-head">
        <div class="page-title">员工新增的采购商品</div>
        <p class="page-desc">
          员工在小程序里「添加采购记录」时新增的采购商品都汇总在这里 ——
          点「编辑」可改名称、规格、渠道和单价，点「删除」会从该原料下移除（历史采购记录不受影响）。
        </p>
      </div>

      <el-form :inline="true" class="filter-bar" @submit.prevent>
        <el-form-item label="原料">
          <el-select
            v-model="filters.ingredientId"
            placeholder="全部原料"
            filterable
            clearable
            style="width: 180px"
          >
            <el-option
              v-for="item in ingredientOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="添加时间">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="商品名 / 渠道"
            clearable
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="ingredientName" label="原料" width="130" />
        <el-table-column prop="name" label="新增的采购商品" min-width="200" show-overflow-tooltip />
        <el-table-column label="规格" min-width="180">
          <template #default="{ row }">
            {{ row.packagingText || row.productModel || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="一采购单位 =" min-width="150">
          <template #default="{ row }">
            {{ formatRatio(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="purchaseChannel" label="渠道" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.purchaseChannel" size="small" type="success">
              {{ row.purchaseChannel }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="参考单价" width="110">
          <template #default="{ row }">
            {{ formatPrice(row.currentPurchasePrice) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdByName" label="添加人" width="110">
          <template #default="{ row }">
            {{ row.createdByName || row.createdById || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="添加时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
            <el-button
              v-if="row.sourceScreenshotUrl"
              link
              type="info"
              @click="previewScreenshot(row)"
            >
              截图
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-hint">还没有员工新增的采购商品</div>
        </template>
      </el-table>

      <el-pagination
        class="pager"
        background
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pagination.pageSize"
        :current-page="pagination.page"
        @current-change="handlePageChange"
      />
    </el-card>

    <el-dialog v-model="editVisible" title="编辑采购商品" width="560px">
      <el-form label-width="110px">
        <el-form-item label="原料">
          <span>{{ editing?.ingredientName || '—' }}</span>
        </el-form-item>
        <el-form-item label="商品名称" required>
          <el-input v-model="editForm.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="品牌">
          <el-input v-model="editForm.brand" maxlength="100" />
        </el-form-item>
        <el-form-item label="规格">
          <el-input v-model="editForm.productModel" maxlength="100" />
        </el-form-item>
        <el-form-item label="采购单位" required>
          <el-select v-model="editForm.purchaseUnit" style="width: 100%">
            <el-option
              v-for="unit in purchaseUnitOptions"
              :key="unit.code"
              :label="unit.code"
              :value="unit.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="包装层级">
          <div class="packaging-editor">
            <div
              v-for="(link, index) in editForm.links"
              :key="`link-${index}`"
              class="packaging-row"
            >
              <span class="packaging-prefix">一{{ editForm.purchaseUnit || '件' }} =</span>
              <el-input-number
                v-model="link.count"
                :min="1"
                :step="1"
                :precision="0"
                controls-position="right"
                style="width: 110px"
              />
              <el-input
                v-model="link.unit"
                maxlength="4"
                placeholder="单位（捆/枚/包）"
                style="width: 150px"
              />
              <span class="packaging-times">×</span>
            </div>
            <div class="packaging-row">
              <span class="packaging-prefix">
                一{{ editForm.purchaseUnit || '件' }} =
              </span>
              <el-input-number
                v-model="editForm.amount"
                :min="0"
                :step="1"
                :precision="3"
                controls-position="right"
                style="width: 130px"
              />
              <span class="packaging-unit">{{ baseUnitLabel }}</span>
              <el-button
                link
                type="primary"
                @click="addPackagingLink"
              >
                + 再加一层
              </el-button>
              <el-button
                v-if="editForm.links.length > 0"
                link
                type="danger"
                @click="removePackagingLink"
              >
                删掉最后一层
              </el-button>
            </div>
            <div class="field-hint">
              {{ packagingPreview }}
            </div>
            <div class="field-hint">
              换算倍数由层级自动算，不能直接改；库存按它折算。
            </div>
          </div>
        </el-form-item>
        <el-form-item label="采购渠道">
          <el-select
            v-model="editForm.purchaseChannel"
            filterable
            clearable
            placeholder="请选择采购渠道"
            style="width: 100%"
          >
            <el-option
              v-for="channel in channelSelectOptions(editForm.purchaseChannel)"
              :key="channel"
              :label="channel"
              :value="channel"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="参考单价">
          <el-input-number
            v-model="editForm.currentPurchasePrice"
            :min="0"
            :precision="2"
            :step="1"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="screenshotVisible" title="员工上传的商品截图" width="420px">
      <el-image
        v-if="screenshotUrl"
        :src="screenshotUrl"
        :preview-src-list="[screenshotUrl]"
        fit="contain"
        style="width: 100%"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ingredientApi } from '@/api/ingredients'
import type {
  StaffCreatedProcurementSku
} from '@/api/ingredients'
import { BaseUnitLabels } from '@/types/ingredient'
import { buildStaffSkuQueryParams } from './staffProcurementSkuQuery'
import { fetchPublicOptionSet, platformOptionsApi } from '@/api/platformOptions'
import {
  formatPackagingText,
  legacyPackaging,
  ratioOf,
  type PackagingSpec
} from '@/utils/packagingDisplay'

const loading = ref(false)
const rows = ref<StaffCreatedProcurementSku[]>([])
const total = ref(0)
const ingredientOptions = ref<Array<{ id: string; name: string }>>([])

const filters = reactive<{
  ingredientId: string
  keyword: string
  dateRange: [string, string] | null
}>({
  ingredientId: '',
  keyword: '',
  dateRange: null
})

const pagination = reactive({ page: 1, pageSize: 20 })

const load = async () => {
  loading.value = true
  try {
    const params = buildStaffSkuQueryParams({
      ingredientId: filters.ingredientId,
      keyword: filters.keyword,
      createdFrom: filters.dateRange?.[0],
      createdTo: filters.dateRange?.[1],
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    const result = await ingredientApi.listStaffCreatedProcurementSkus(params)
    rows.value = result.items
    total.value = result.total
  } catch {
    // 拦截器已经弹过提示
  } finally {
    loading.value = false
  }
}

const loadIngredientOptions = async () => {
  try {
    const list = await ingredientApi.list()
    ingredientOptions.value = (list || []).map((item: any) => ({
      id: item.id,
      name: item.name
    }))
  } catch {
    ingredientOptions.value = []
  }
}

const handleSearch = () => {
  pagination.page = 1
  load()
}

const resetFilters = () => {
  filters.ingredientId = ''
  filters.keyword = ''
  filters.dateRange = null
  pagination.page = 1
  load()
}

const handlePageChange = (page: number) => {
  pagination.page = page
  load()
}

const formatPrice = (value: number | null) =>
  typeof value === 'number' ? `¥${value.toFixed(2)}` : '—'

const formatDateTime = (value: string) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatRatio = (row: StaffCreatedProcurementSku) => {
  if (!row.purchaseToBaseRatio) return '—'
  const unit = BaseUnitLabels[row.baseUnit || ''] || ''
  return `1 ${row.purchaseUnit || '件'} = ${row.purchaseToBaseRatio} ${unit}`
}

// ==================== 编辑 ====================

const editVisible = ref(false)
const saving = ref(false)
const editing = ref<StaffCreatedProcurementSku | null>(null)
const editForm = reactive({
  name: '',
  brand: '',
  productModel: '',
  purchaseUnit: '',
  /** 包装层级：中间层 + 末层（末层单位恒为原料基准单位） */
  links: [] as Array<{ count: number; unit: string }>,
  amount: 0,
  purchaseChannel: '',
  currentPurchasePrice: 0,
  isActive: true
})

const baseUnitLabel = computed(
  () => BaseUnitLabels[editing.value?.baseUnit || ''] || ''
)

const ratioLabel = computed(() => {
  const unit = baseUnitLabel.value
  return unit ? `一采购单位等于多少${unit}` : '每件净含量'
})

/**
 * 采购单位选项（2026-11-11）：唯一来源 = 平台选项字典 `purchase_unit`。
 * 以前这里是从 `constants/procurementPurchaseUnits.ts` 抄的一份常量，
 * 和原料弹窗里的另一份、后端白名单必须"手动保持一致"——那必然漂移。
 */
const purchaseUnitDict = ref<
  Array<{ code: string; baseUnits: string[]; multipack: boolean; sortOrder: number }>
>([])

const loadPurchaseUnitDict = async () => {
  try {
    const detail = await platformOptionsApi.getSet('purchase_unit')
    purchaseUnitDict.value = (detail.items || [])
      .filter((item) => item.enabled)
      .map((item) => {
        const extra = (item.extra || {}) as {
          baseUnits?: string[]
          multipack?: boolean
        }
        return {
          code: item.code,
          baseUnits: Array.isArray(extra.baseUnits) ? extra.baseUnits : [],
          multipack: extra.multipack === true,
          sortOrder: item.sortOrder
        }
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
  } catch {
    purchaseUnitDict.value = []
  }
}

const purchaseUnitOptions = computed(() => {
  const baseUnit = String(editing.value?.baseUnit || 'G').toUpperCase()
  return purchaseUnitDict.value.filter((item) =>
    item.baseUnits.includes(baseUnit)
  )
})

const baseUnitCode = computed(
  () => (String(editing.value?.baseUnit || 'G').toUpperCase() as 'G' | 'ML' | 'PCS')
)

const packagingSpec = computed<PackagingSpec>(() => ({
  links: editForm.links.map((link) => ({
    count: Number(link.count),
    unit: String(link.unit || '').trim()
  })),
  amount: Number(editForm.amount),
  amountUnit: baseUnitCode.value,
  ...(editForm.productModel ? { printedText: editForm.productModel } : {})
}))

const packagingPreview = computed(() => {
  const text = formatPackagingText(packagingSpec.value, editForm.purchaseUnit)
  const ratio = ratioOf(packagingSpec.value)
  return text ? `${text} = ${ratio} ${baseUnitLabel.value}` : '请先填层级'
})

const addPackagingLink = () => {
  if (editForm.links.length >= 3) {
    ElMessage.warning('最多三层（再深就不是包装了）')
    return
  }
  editForm.links.push({ count: 1, unit: '' })
}

const removePackagingLink = () => {
  editForm.links.pop()
}

const openEdit = (row: StaffCreatedProcurementSku) => {
  editing.value = row
  editForm.name = row.name
  editForm.brand = row.brand || ''
  editForm.productModel = row.productModel || ''
  editForm.purchaseUnit = row.purchaseUnit || ''
  const spec = row.packaging || legacyPackaging(
    row.purchaseToBaseRatio,
    row.baseUnit,
    row.productModel
  )
  editForm.links = (spec.links || []).map((link) => ({
    count: Number(link.count),
    unit: link.unit
  }))
  editForm.amount = Number(spec.amount || 0)
  editForm.purchaseChannel = row.purchaseChannel || ''
  editForm.currentPurchasePrice = row.currentPurchasePrice || 0
  editForm.isActive = row.isActive
  editVisible.value = true
}

const saveEdit = async () => {
  if (!editing.value) return
  if (!editForm.name.trim()) {
    ElMessage.warning('商品名称不能为空')
    return
  }
  if (!editForm.purchaseUnit) {
    ElMessage.warning('请选择采购单位')
    return
  }
  const incompleteLink = editForm.links.find(
    (link) => !Number.isFinite(Number(link.count)) || Number(link.count) <= 0 ||
      !String(link.unit || '').trim()
  )
  if (incompleteLink) {
    ElMessage.warning('每一层都要填数量和单位')
    return
  }
  if (!editForm.amount || editForm.amount <= 0) {
    ElMessage.warning(`${ratioLabel.value}必须大于 0`)
    return
  }

  saving.value = true
  try {
    await ingredientApi.updateProcurementSku(
      editing.value.ingredientId,
      editing.value.id,
      {
        name: editForm.name.trim(),
        brand: editForm.brand.trim() || null,
        productModel: editForm.productModel.trim() || null,
        purchaseUnit: editForm.purchaseUnit || null,
        // 层级是唯一事实：倍数由服务端派生，前端不再单独提交
        packaging: {
          links: packagingSpec.value.links,
          amount: packagingSpec.value.amount,
          amountUnit: baseUnitCode.value,
          ...(editForm.productModel
            ? { printedText: editForm.productModel.trim() }
            : {})
        },
        purchaseChannel: editForm.purchaseChannel.trim() || null,
        currentPurchasePrice: editForm.currentPurchasePrice,
        isActive: editForm.isActive
      }
    )
    ElMessage.success('已保存')
    editVisible.value = false
    load()
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// ==================== 删除 / 截图 ====================

const handleDelete = async (row: StaffCreatedProcurementSku) => {
  try {
    await ElMessageBox.confirm(
      `将删除「${row.name}」（${row.ingredientName || '该原料'} 下）。会从该原料下移除，历史采购记录不受影响。确认删除？`,
      '删除采购商品',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  try {
    await ingredientApi.deleteProcurementSku(row.ingredientId, row.id)
    ElMessage.success('已删除')
    load()
  } catch {
    // 拦截器已提示
  }
}

const screenshotVisible = ref(false)
const screenshotUrl = ref('')

const previewScreenshot = (row: StaffCreatedProcurementSku) => {
  screenshotUrl.value = row.sourceScreenshotUrl || ''
  screenshotVisible.value = true
}

// 采购渠道（唯一来源：平台选项字典 purchase_channel）
const channelOptions = ref<string[]>([])

function channelSelectOptions(current: string) {
  const value = (current || '').trim()
  if (value && !channelOptions.value.includes(value)) {
    return [...channelOptions.value, value]
  }
  return channelOptions.value
}

async function loadChannelOptions() {
  try {
    const items = await fetchPublicOptionSet('purchase_channel')
    channelOptions.value = items.map((item) => item.code)
  } catch {
    channelOptions.value = []
  }
}

onMounted(() => {
  loadIngredientOptions()
  loadChannelOptions()
  loadPurchaseUnitDict()
  load()
})
</script>

<style scoped>
.staff-sku-page {
  padding: 16px;
}
.page-head {
  margin-bottom: 12px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e3a2f;
}
.page-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: #6b6653;
  line-height: 1.6;
}
.filter-bar {
  margin-top: 12px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #8a8375;
}
.empty-hint {
  padding: 24px 0;
  color: #9a9384;
}
.packaging-editor {
  width: 100%;
}
.packaging-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.packaging-prefix {
  font-size: 13px;
  color: #6b6455;
}
.packaging-times {
  color: #9a9384;
}
.packaging-unit {
  font-size: 13px;
  color: #6b6455;
  min-width: 32px;
}
</style>
