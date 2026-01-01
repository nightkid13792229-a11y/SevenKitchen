<template>
  <div class="recipes-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2>食谱管理</h2>
      <el-button type="primary" @click="handleCreate">
        <el-icon><Plus /></el-icon>
        新建食谱
      </el-button>
    </div>

    <!-- Filters -->
    <el-card class="filter-card">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-select
            v-model="filters.status"
            placeholder="状态"
            clearable
            @change="handleFilterChange"
          >
            <el-option label="草稿" :value="RecipeStatus.DRAFT" />
            <el-option label="已发布" :value="RecipeStatus.PUBLIC" />
            <el-option label="私密定制" :value="RecipeStatus.PRIVATE_CUSTOM" />
          </el-select>
        </el-col>

        <el-col :span="6">
          <el-select
            v-model="filters.lifeStage"
            placeholder="生命阶段"
            clearable
            @change="handleFilterChange"
          >
            <el-option
              v-for="option in lifeStageOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-col>

        <el-col :span="6">
          <el-select
            v-model="filters.healthTag"
            placeholder="健康标签"
            clearable
            @change="handleFilterChange"
          >
            <el-option
              v-for="option in healthTagOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-col>

        <el-col :span="6">
          <el-input
            v-model="filters.search"
            placeholder="搜索名称或ID"
            clearable
            @clear="handleFilterChange"
            @keyup.enter="handleFilterChange"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
      </el-row>
    </el-card>

    <!-- Recipe Table -->
    <el-card class="table-card">
      <el-table
        v-loading="loading"
        :data="recipes"
        stripe
        style="width: 100%"
      >
        <el-table-column label="封面" width="120">
          <template #default="{ row }">
            <el-image
              v-if="row.coverImageUrl"
              :src="row.coverImageUrl"
              fit="cover"
              style="width: 96px; height: 54px; border-radius: 4px"
            />
            <div v-else class="placeholder-image">
              <el-icon><Picture /></el-icon>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="name" label="食谱名称" min-width="180">
          <template #default="{ row }">
            <div class="recipe-name">
              <span class="name">{{ row.name }}</span>
              <el-tag size="small" class="version-tag">v{{ row.version }}</el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="RecipeStatusTagTypes[row.status as RecipeStatus]">
              {{ RecipeStatusLabels[row.status as RecipeStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="生命阶段" width="150">
          <template #default="{ row }">
            <el-tag
              v-for="stage in row.applicableLifeStages"
              :key="stage"
              size="small"
              class="tag-item"
            >
              {{ getLifeStageLabel(stage) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="健康标签" width="180">
          <template #default="{ row }">
            <el-tag
              v-for="tag in row.targetHealthTags"
              :key="tag"
              size="small"
              type="info"
              class="tag-item"
            >
              {{ getHealthTagLabel(tag) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="energyDensityKcalPerKg" label="能量密度" width="120">
          <template #default="{ row }">
            {{ row.energyDensityKcalPerKg }} kcal/kg
          </template>
        </el-table-column>

        <el-table-column label="销量数据" width="150">
          <template #default="{ row }">
            <div class="stats">
              <span>销量: {{ row.salesCount }}</span>
              <span>DIY: {{ row.diyGenCount }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleView(row)"
            >
              查看
            </el-button>
            <el-button
              v-if="row.status === RecipeStatus.DRAFT"
              link
              type="success"
              size="small"
              @click="handlePublish(row)"
            >
              发布
            </el-button>
            <el-button
              v-if="row.status === RecipeStatus.PUBLIC"
              link
              type="warning"
              size="small"
              @click="handleUnpublish(row)"
            >
              下架
            </el-button>
            <el-button
              link
              type="info"
              size="small"
              @click="handleDuplicate(row)"
            >
              复制
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="currentPageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Picture } from '@element-plus/icons-vue';
import { recipeApi } from '@/api/recipes';
import {
  RecipeStatus,
  type RecipeSummary,
  type RecipeQuery,
} from '@/types/recipe';

// Enum option type
interface EnumOption {
  value: string;
  label: string;
}

const router = useRouter();

// Data
const loading = ref(false);
const recipes = ref<RecipeSummary[]>([]);

// Metadata (enum options)
const lifeStageOptions = ref<EnumOption[]>([]);
const healthTagOptions = ref<EnumOption[]>([]);

const filters = reactive<RecipeQuery>({
  status: undefined,
  lifeStage: undefined,
  healthTag: undefined,
  search: '',
  page: 1,
  pageSize: 20,
});

const total = ref(0);

// Separate pagination refs for el-pagination
const currentPage = ref(1);
const currentPageSize = ref(20);

// Enums labels
const RecipeStatusLabels: Record<RecipeStatus, string> = {
  [RecipeStatus.DRAFT]: '草稿',
  [RecipeStatus.PUBLIC]: '已发布',
  [RecipeStatus.PRIVATE_CUSTOM]: '私密定制',
};

const RecipeStatusTagTypes: Record<RecipeStatus, string> = {
  [RecipeStatus.DRAFT]: 'info',
  [RecipeStatus.PUBLIC]: 'success',
  [RecipeStatus.PRIVATE_CUSTOM]: 'warning',
};

// Helper functions to get labels from dynamic metadata
const getLifeStageLabel = (value: string) => {
  const option = lifeStageOptions.value.find(opt => opt.value === value);
  return option?.label || value;
};

const getHealthTagLabel = (value: string) => {
  const option = healthTagOptions.value.find(opt => opt.value === value);
  return option?.label || value;
};

// Methods
const loadMetadata = async () => {
  try {
    const [lifeStages, healthTags] = await Promise.all([
      recipeApi.getLifeStages(),
      recipeApi.getHealthTags(),
    ]);
    lifeStageOptions.value = lifeStages || [];
    healthTagOptions.value = healthTags || [];
  } catch (error: any) {
    ElMessage.error(error.message || '加载元数据失败');
  }
};

const loadRecipes = async () => {
  loading.value = true;
  try {
    const response = await recipeApi.list({
      ...filters,
      page: currentPage.value,
      pageSize: currentPageSize.value,
    });

    // Response interceptor already extracts data, so response is the RecipeListResponse
    recipes.value = response.data;
    total.value = response.total;
  } catch (error: any) {
    ElMessage.error(error.message || '加载食谱列表失败');
  } finally {
    loading.value = false;
  }
};

const handleFilterChange = () => {
  currentPage.value = 1;
  loadRecipes();
};

const handlePageChange = (page: number) => {
  currentPage.value = page;
  loadRecipes();
};

const handleSizeChange = (size: number) => {
  currentPageSize.value = size;
  currentPage.value = 1;
  loadRecipes();
};

const handleCreate = () => {
  router.push('/recipes/create');
};

const handleView = (row: RecipeSummary) => {
  router.push({
    path: `/recipes/${row.id}`,
    query: { mode: 'view' }
  });
};

const handleEdit = (row: RecipeSummary) => {
  router.push(`/recipes/${row.id}/edit`);
};

const handlePublish = async (row: RecipeSummary) => {
  try {
    await ElMessageBox.confirm('确认发布该食谱？', '提示', {
      type: 'warning',
    });

    await recipeApi.publish(row.id);
    ElMessage.success('发布成功');
    loadRecipes();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '发布失败');
    }
  }
};

const handleUnpublish = async (row: RecipeSummary) => {
  try {
    await ElMessageBox.confirm('确认下架该食谱？', '提示', {
      type: 'warning',
    });

    await recipeApi.unpublish(row.id);
    ElMessage.success('下架成功');
    loadRecipes();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '下架失败');
    }
  }
};

const handleDuplicate = async (row: RecipeSummary) => {
  try {
    await ElMessageBox.confirm('确认复制该食谱？', '提示', {
      type: 'info',
    });

    await recipeApi.duplicate(row.id);
    ElMessage.success('复制成功');
    loadRecipes();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '复制失败');
    }
  }
};

const handleDelete = async (row: RecipeSummary) => {
  try {
    await ElMessageBox.confirm('确认删除该草稿？删除后无法恢复！', '警告', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });

    await recipeApi.delete(row.id);
    ElMessage.success('删除成功');
    loadRecipes();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Lifecycle
onMounted(() => {
  loadMetadata();
  loadRecipes();
});
</script>

<style scoped>
.recipes-page {
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
  font-size: 24px;
  font-weight: 600;
}

.filter-card {
  margin-bottom: 20px;
}

.table-card {
  margin-bottom: 20px;
}

.placeholder-image {
  width: 96px;
  height: 54px;
  background-color: #f5f5f5;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 24px;
}

.recipe-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recipe-name .name {
  font-weight: 500;
}

.version-tag {
  font-size: 12px;
}

.tag-item {
  margin-right: 4px;
  margin-bottom: 4px;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #666;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
