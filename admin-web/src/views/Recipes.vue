<template>
  <div class="recipes-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>食谱管理</span>
        </div>
      </template>

      <el-table :data="recipes" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="120" />
        <el-table-column prop="name" label="食谱名称" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'PUBLIC' ? 'success' : 'info'">
              {{ row.status === 'PUBLIC' ? '公开' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="energyDensityKcalPerKg" label="能量密度" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewDetail(row.id)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 食谱详情对话框 -->
    <el-dialog v-model="detailVisible" title="食谱详情" width="60%">
      <el-descriptions v-if="currentRecipe" :column="2" border>
        <el-descriptions-item label="食谱ID">{{ currentRecipe.id }}</el-descriptions-item>
        <el-descriptions-item label="名称">{{ currentRecipe.name }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ currentRecipe.version }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="currentRecipe.status === 'PUBLIC' ? 'success' : 'info'">
            {{ currentRecipe.status === 'PUBLIC' ? '公开' : '草稿' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="能量密度">
          {{ currentRecipe.energyDensityKcalPerKg }} kcal/kg
        </el-descriptions-item>
        <el-descriptions-item label="生产损耗率">
          {{ (currentRecipe.productionLossRate * 100).toFixed(1) }}%
        </el-descriptions-item>
      </el-descriptions>

      <el-divider>配方成分</el-divider>
      <el-table :data="currentRecipe?.items" style="width: 100%">
        <el-table-column prop="ingredientId" label="原料ID" />
        <el-table-column prop="ingredientName" label="原料名称" />
        <el-table-column prop="ratioPercent" label="占比(%)" />
        <el-table-column prop="isPrimarySource" label="主要来源">
          <template #default="{ row }">
            <el-tag v-if="row.isPrimarySource" type="success">是</el-tag>
            <el-tag v-else type="info">否</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { recipeApi } from '@/api'

const loading = ref(false)
const recipes = ref<any[]>([])
const detailVisible = ref(false)
const currentRecipe = ref<any>(null)

const loadRecipes = async () => {
  loading.value = true
  try {
    const data = await recipeApi.list()
    recipes.value = data || []
  } catch (error) {
    ElMessage.error('加载食谱列表失败')
  } finally {
    loading.value = false
  }
}

const viewDetail = async (id: string) => {
  try {
    const data = await recipeApi.getDetail(id)
    currentRecipe.value = data
    detailVisible.value = true
  } catch (error) {
    ElMessage.error('加载食谱详情失败')
  }
}

onMounted(() => {
  loadRecipes()
})
</script>

<style scoped>
.recipes-page {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
