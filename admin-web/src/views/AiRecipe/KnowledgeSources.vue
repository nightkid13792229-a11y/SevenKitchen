<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>AI 食谱知识源</h2>
      <p>查看已登记的专业知识来源、版本和审核状态。</p>
    </div>
    <el-table :data="sources" v-loading="loading" border>
      <el-table-column prop="code" label="代码" width="180" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="versionLabel" label="版本" width="140" />
      <el-table-column prop="authorityLevel" label="权威等级" width="140" />
      <el-table-column prop="status" label="状态" width="120" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { aiRecipeApi, type KnowledgeSourceListItem } from '@/api/aiRecipe'

const loading = ref(false)
const sources = ref<KnowledgeSourceListItem[]>([])

onMounted(async () => {
  loading.value = true
  try {
    sources.value = await aiRecipeApi.listKnowledgeSources()
  } finally {
    loading.value = false
  }
})
</script>
