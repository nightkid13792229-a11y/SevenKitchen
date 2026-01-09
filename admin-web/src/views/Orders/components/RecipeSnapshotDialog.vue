<template>
  <el-dialog
    v-model="visible"
    title="食谱快照详情"
    width="700px"
    @close="handleClose"
  >
    <div v-if="snapshot" class="recipe-snapshot">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="食谱名称" :span="2">
          {{ snapshot.name }}
        </el-descriptions-item>
        <el-descriptions-item label="版本号">
          v{{ snapshot.version }}
        </el-descriptions-item>
        <el-descriptions-item label="基础食谱">
          {{ snapshot.baseRecipe || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="制作方式">
          {{ snapshot.preparationMethod || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="健康标签">
          <el-tag
            v-for="tag in snapshot.healthTags"
            :key="tag"
            size="small"
            style="margin-right: 4px"
          >
            {{ tag }}
          </el-tag>
          <span v-if="!snapshot.healthTags?.length">-</span>
        </el-descriptions-item>
        <el-descriptions-item label="食谱描述" :span="2">
          {{ snapshot.description || '无描述' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">原料清单</el-divider>

      <el-table :data="snapshot.ingredients" style="width: 100%">
        <el-table-column prop="ingredientName" label="原料名称" />
        <el-table-column prop="amountG" label="用量" width="120">
          <template #default="{ row }">
            {{ row.amountG }}g
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 20px"
      >
        此为订单创建时的食谱快照，仅供参考。当前最新食谱可能已有更新。
      </el-alert>
    </div>

    <div v-else class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <template #footer>
      <el-button type="primary" @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { RecipeSnapshot } from '@/types/order'

interface Props {
  modelValue: boolean
  snapshot?: RecipeSnapshot
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const visible = ref(false)

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
.recipe-snapshot {
  padding: 10px 0;
}

.loading-container {
  padding: 20px 0;
}

:deep(.el-descriptions) {
  margin-bottom: 20px;
}

:deep(.el-dialog__body) {
  padding-top: 20px;
}
</style>
