<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>AI 食谱规则包</h2>
      <p>首批规则包用于胰腺呵护/低脂和减重/肥胖管理。</p>
    </div>
    <el-table :data="packages" v-loading="loading" border>
      <el-table-column prop="code" label="代码" width="220" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="status" label="状态" width="120" />
      <el-table-column label="当前版本" width="120">
        <template #default="{ row }">
          {{ row.currentVersion ?? '-' }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { aiRecipeApi, type RulePackageListItem } from '@/api/aiRecipe'

const loading = ref(false)
const packages = ref<RulePackageListItem[]>([])

onMounted(async () => {
  loading.value = true
  try {
    packages.value = await aiRecipeApi.listRulePackages()
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.ai-recipe-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #303133;
}

.page-header p {
  margin: 0;
  font-size: 14px;
  color: #606266;
}
</style>
