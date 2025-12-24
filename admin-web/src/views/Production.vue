<template>
  <div class="production-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>生产批次管理</span>
          <el-button type="primary" @click="showCreateDialog = true">创建批次</el-button>
        </div>
      </template>

      <el-table :data="batches" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="批次ID" width="120" />
        <el-table-column prop="productionDate" label="生产日期" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalProductionG" label="总产量(g)" />
        <el-table-column prop="uniqueRecipeCount" label="食谱数" />
        <el-table-column prop="orderItemCount" label="订单项数" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewDetail(row.id)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建批次对话框 -->
    <el-dialog v-model="showCreateDialog" title="创建生产批次" width="500px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="生产日期">
          <el-date-picker
            v-model="createForm.productionDate"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createBatch">确定</el-button>
      </template>
    </el-dialog>

    <!-- 批次详情对话框 -->
    <el-dialog v-model="detailVisible" title="批次详情" width="70%">
      <el-descriptions v-if="currentBatch" :column="2" border>
        <el-descriptions-item label="批次ID">{{ currentBatch.id }}</el-descriptions-item>
        <el-descriptions-item label="生产日期">{{ currentBatch.productionDate }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentBatch.status)">
            {{ getStatusText(currentBatch.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="总产量">{{ currentBatch.totalProductionG }}g</el-descriptions-item>
        <el-descriptions-item label="食谱数">{{ currentBatch.uniqueRecipeCount }}</el-descriptions-item>
        <el-descriptions-item label="订单项数">{{ currentBatch.orderItemCount }}</el-descriptions-item>
      </el-descriptions>

      <el-divider>包装单位</el-divider>
      <el-table :data="currentBatch?.packagingUnits" style="width: 100%">
        <el-table-column prop="recipeSnapshotId" label="食谱快照ID" />
        <el-table-column prop="totalProductionG" label="产量(g)" />
        <el-table-column prop="orderItemCount" label="订单项数" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { productionApi } from '@/api'

const loading = ref(false)
const batches = ref<any[]>([])
const showCreateDialog = ref(false)
const detailVisible = ref(false)
const currentBatch = ref<any>(null)

const createForm = reactive({
  productionDate: ''
})

const getStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    PLANNED: 'info',
    IN_PRODUCTION: 'warning',
    COMPLETED: 'success'
  }
  return typeMap[status] || ''
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PLANNED: '已计划',
    IN_PRODUCTION: '生产中',
    COMPLETED: '已完成'
  }
  return textMap[status] || status
}

const loadBatches = async () => {
  loading.value = true
  try {
    const data: any[] = await productionApi.getBatches()
    batches.value = data || []
  } catch (error) {
    ElMessage.error('加载批次列表失败')
  } finally {
    loading.value = false
  }
}

const createBatch = async () => {
  try {
    const date = createForm.productionDate
      ? new Date(createForm.productionDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    await productionApi.createBatch({ productionDate: date })
    ElMessage.success('批次创建成功')
    showCreateDialog.value = false
    loadBatches()
  } catch (error) {
    ElMessage.error('批次创建失败')
  }
}

const viewDetail = async (id: string) => {
  try {
    const data = await productionApi.getBatchDetail(id)
    currentBatch.value = data
    detailVisible.value = true
  } catch (error) {
    ElMessage.error('加载批次详情失败')
  }
}

onMounted(() => {
  loadBatches()
})
</script>

<style scoped>
.production-page {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
