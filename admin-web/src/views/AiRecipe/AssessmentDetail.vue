<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>营养评估详情</h2>
      <p>查看证据分级、营养管理方案、约束和审计信息。</p>
    </div>
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-alert
      v-else-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
    />
    <el-empty v-else-if="!assessment" description="暂无评估数据" />
    <el-descriptions v-else :column="1" border>
      <el-descriptions-item label="评估ID">{{ assessment.id }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ assessment.status || '-' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { aiRecipeApi, type AssessmentDetail } from '@/api/aiRecipe'

const route = useRoute()
const loading = ref(false)
const errorMessage = ref('')
const assessment = ref<AssessmentDetail | null>(null)

const loadAssessment = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    assessment.value = await aiRecipeApi.getAssessment(String(route.params.id))
  } catch (error: any) {
    errorMessage.value = error.message || '加载评估详情失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadAssessment)
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
