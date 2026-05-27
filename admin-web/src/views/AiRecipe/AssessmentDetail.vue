<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>营养评估详情</h2>
      <p>查看证据分级、营养管理方案、约束和审计信息。</p>
    </div>
    <el-empty v-if="!assessment" description="暂无评估数据" />
    <el-descriptions v-else :column="1" border>
      <el-descriptions-item label="评估ID">{{ assessment.id }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ assessment.status || '-' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { aiRecipeApi } from '@/api/aiRecipe'

const route = useRoute()
const assessment = ref<any>(null)

onMounted(async () => {
  assessment.value = await aiRecipeApi.getAssessment(String(route.params.id))
})
</script>
