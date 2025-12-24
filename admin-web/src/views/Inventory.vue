<template>
  <div class="inventory-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>库存管理</span>
        </div>
      </template>

      <el-table :data="inventory" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="原料ID" width="120" />
        <el-table-column prop="name" label="原料名称" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag>{{ getTypeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="unitCost" label="单位成本" />
        <el-table-column prop="currentPricePerPurchaseUnit" label="采购单价" />
        <el-table-column prop="purchaseUnit" label="采购单位" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="editPrice(row)">
              修改价格
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 修改价格对话框 -->
    <el-dialog v-model="priceDialogVisible" title="修改价格" width="400px">
      <el-form :model="priceForm" label-width="100px">
        <el-form-item label="原料名称">
          <el-input v-model="priceForm.name" disabled />
        </el-form-item>
        <el-form-item label="新价格">
          <el-input-number v-model="priceForm.price" :min="0" :precision="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="priceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePrice">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { inventoryApi } from '@/api'

const loading = ref(false)
const inventory = ref<any[]>([])
const priceDialogVisible = ref(false)

const priceForm = reactive({
  id: '',
  name: '',
  price: 0
})

const getTypeText = (type: string) => {
  const typeMap: Record<string, string> = {
    FOOD: '食材',
    SUPPLEMENT: '营养补充剂',
    PACKAGING: '包装材料'
  }
  return typeMap[type] || type
}

const loadInventory = async () => {
  loading.value = true
  try {
    const data: any[] = await inventoryApi.list()
    inventory.value = data || []
  } catch (error) {
    ElMessage.error('加载库存列表失败')
  } finally {
    loading.value = false
  }
}

const editPrice = (item: any) => {
  priceForm.id = item.id
  priceForm.name = item.name
  priceForm.price = item.currentPricePerPurchaseUnit
  priceDialogVisible.value = true
}

const savePrice = async () => {
  try {
    await inventoryApi.updatePrice(priceForm.id, priceForm.price)
    ElMessage.success('价格修改成功')
    priceDialogVisible.value = false
    loadInventory()
  } catch (error) {
    ElMessage.error('价格修改失败')
  }
}

onMounted(() => {
  loadInventory()
})
</script>

<style scoped>
.inventory-page {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
