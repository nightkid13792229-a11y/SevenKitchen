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
        <el-table-column label="规格" min-width="130">
          <template #default="{ row }">
            {{ row.productModel || '—' }}
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
        <el-form-item label="采购单位">
          <el-select v-model="editForm.purchaseUnit" style="width: 100%">
            <el-option
              v-for="unit in purchaseUnitOptions"
              :key="unit"
              :label="unit"
              :value="unit"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="ratioLabel">
          <el-input-number
            v-model="editForm.purchaseToBaseRatio"
            :min="0"
            :step="1"
            style="width: 100%"
          />
          <div class="field-hint">
            1 {{ editForm.purchaseUnit || '采购单位' }} =
            {{ editForm.purchaseToBaseRatio || 0 }} {{ baseUnitLabel }}（库存按这个换）
          </div>
        </el-form-item>
        <el-form-item label="采购渠道">
          <el-input v-model="editForm.purchaseChannel" maxlength="200" />
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
import { purchaseUnitsForBaseUnit } from '@/constants/procurementPurchaseUnits'
import { buildStaffSkuQueryParams } from './staffProcurementSkuQuery'

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
  purchaseToBaseRatio: 0,
  purchaseChannel: '',
  currentPurchasePrice: 0,
  isActive: true
})

const baseUnitLabel = computed(
  () => BaseUnitLabels[editing.value?.baseUnit || ''] || ''
)

const purchaseUnitOptions = computed(() =>
  purchaseUnitsForBaseUnit(editing.value?.baseUnit)
)

const ratioLabel = computed(() => {
  const unit = BaseUnitLabels[editing.value?.baseUnit || ''] || ''
  return unit ? `一采购单位等于多少${unit}` : '换算'
})

const openEdit = (row: StaffCreatedProcurementSku) => {
  editing.value = row
  editForm.name = row.name
  editForm.brand = row.brand || ''
  editForm.productModel = row.productModel || ''
  editForm.purchaseUnit = row.purchaseUnit || ''
  editForm.purchaseToBaseRatio = row.purchaseToBaseRatio || 0
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
  if (!editForm.purchaseToBaseRatio || editForm.purchaseToBaseRatio <= 0) {
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
        purchaseToBaseRatio: editForm.purchaseToBaseRatio,
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

onMounted(() => {
  loadIngredientOptions()
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
</style>
