<template>
  <div class="ingredient-tags-page">
    <!-- Header -->
    <div class="page-header">
      <h2>原料标签管理</h2>
      <el-button type="primary" @click="handleCreate" :icon="Plus">
        新增标签
      </el-button>
    </div>

    <!-- Tags List -->
    <el-card v-loading="loading">
      <el-table
        :data="tags"
        row-key="id"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="name" label="标签名称" width="250">
          <template #default="{ row }">
            <el-tag
              v-if="row.color"
              :color="row.color"
              size="small"
              effect="plain"
            >
              {{ row.name }}
            </el-tag>
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="description" label="描述" min-width="200">
          <template #default="{ row }">
            {{ row.description || '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="color" label="颜色" width="100">
          <template #default="{ row }">
            <div v-if="row.color" class="color-preview">
              <span
                class="color-box"
                :style="{ backgroundColor: row.color }"
              ></span>
              {{ row.color }}
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column prop="sort" label="排序" width="80" align="center">
          <template #default="{ row }">
            {{ row.sort }}
          </template>
        </el-table-column>

        <el-table-column prop="parent" label="父标签" width="150">
          <template #default="{ row }">
            {{ getParentName(row.parentId) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              type="primary"
              size="small"
              link
              @click="handleAddChild(row)"
            >
              添加子标签
            </el-button>
            <el-button
              type="danger"
              size="small"
              link
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Empty State -->
      <div v-if="tags.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无标签数据" />
      </div>
    </el-card>

    <!-- Tag Form Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :close-on-click-modal="false"
    >
      <TagFormComponent
        :tag="currentTag"
        :parent-tag-id="parentTagId"
        :all-tags="allTagsFlat"
        @submit="handleSubmit"
        @cancel="dialogVisible = false"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { ingredientTagApi, type IngredientTag, type CreateTagDto, type UpdateTagDto } from '@/api/ingredientTags'
import TagFormComponent from './TagForm.vue'

// Data
const loading = ref(false)
const tags = ref<any[]>([])
const allTagsFlat = ref<IngredientTag[]>([])
const dialogVisible = ref(false)
const currentTag = ref<IngredientTag | undefined>(undefined)
const parentTagId = ref<string | undefined>(undefined)

// Computed
const dialogTitle = computed(() => {
  if (parentTagId.value) {
    return `新增子标签`
  }
  return currentTag.value?.id ? '编辑标签' : '新增标签'
})

// Methods
const loadData = async () => {
  loading.value = true
  try {
    const [hierarchyData, allData] = await Promise.all([
      ingredientTagApi.getHierarchy(),
      ingredientTagApi.list()
    ])

    allTagsFlat.value = allData

    // Build tree structure
    const tagMap = new Map<string, any>()
    hierarchyData.forEach(tag => {
      tagMap.set(tag.id, { ...tag, children: [] })
    })

    const rootTags: any[] = []
    hierarchyData.forEach(tag => {
      if (tag.parentId) {
        const parent = tagMap.get(tag.parentId)
        if (parent) {
          parent.children.push(tagMap.get(tag.id))
        }
      } else {
        rootTags.push(tagMap.get(tag.id))
      }
    })

    tags.value = rootTags
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const getParentName = (parentId: string | null): string => {
  if (!parentId) return '-'
  const parent = allTagsFlat.value.find(t => t.id === parentId)
  return parent?.name || '-'
}

const handleCreate = () => {
  currentTag.value = undefined
  parentTagId.value = undefined
  dialogVisible.value = true
}

const handleEdit = (tag: any) => {
  currentTag.value = { ...tag }
  parentTagId.value = undefined
  dialogVisible.value = true
}

const handleAddChild = (tag: any) => {
  currentTag.value = undefined
  parentTagId.value = tag.id
  dialogVisible.value = true
}

const handleDelete = async (tag: any) => {
  try {
    // Check if has children
    const hasChildren = tag.children && tag.children.length > 0

    const message = hasChildren
      ? `该标签包含 ${tag.children.length} 个子标签，删除后将一并删除所有子标签。确定要删除标签"${tag.name}"吗？`
      : `确定要删除标签"${tag.name}"吗？此操作不可恢复。`

    await ElMessageBox.confirm(message, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    loading.value = true
    await ingredientTagApi.delete(tag.id)
    ElMessage.success('删除成功')
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  } finally {
    loading.value = false
  }
}

const handleSubmit = async (data: CreateTagDto | UpdateTagDto) => {
  try {
    loading.value = true
    if (currentTag.value?.id) {
      await ingredientTagApi.update(currentTag.value.id, data)
      ElMessage.success('更新成功')
    } else {
      const tagData: CreateTagDto = {
        name: data.name || '',
        ...data,
        parentId: parentTagId.value ?? data.parentId
      }
      await ingredientTagApi.create(tagData)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    await loadData()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    loading.value = false
  }
}

// Lifecycle
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.ingredient-tags-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.color-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-box {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}
</style>
