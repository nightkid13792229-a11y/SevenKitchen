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
        <el-col :span="5">
          <el-select
            v-model="filters.category"
            placeholder="分类"
            clearable
            @change="handleFilterChange"
          >
            <el-option label="标准食谱" :value="RecipeManagementCategory.STANDARD" />
            <el-option label="私密定制" :value="RecipeManagementCategory.PRIVATE_CUSTOM" />
            <el-option label="用户的食谱" :value="RecipeManagementCategory.USER_RECIPE" />
          </el-select>
        </el-col>

        <el-col :span="4">
          <el-select
            v-model="filters.status"
            placeholder="状态"
            clearable
            @change="handleFilterChange"
          >
            <el-option label="草稿" :value="RecipeStatus.DRAFT" />
            <el-option label="已发布" :value="RecipeStatus.PUBLIC" />
          </el-select>
        </el-col>

        <el-col :span="5">
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

        <el-col :span="5">
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

        <el-col :span="5">
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
              <span class="name">{{ getRecipeSeriesDisplayName(row) }}</span>
              <el-tag size="small" class="version-tag">v{{ row.version }}</el-tag>
            </div>
            <div v-if="row.currentPublicVersion && row.pendingDraftVersion" class="recipe-version-note">
              当前公开 v{{ row.currentPublicVersion.version }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="seriesBusinessStatus" label="系列状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getRecipeBusinessStatusType(row)">
              {{ getRecipeBusinessStatusLabel(row) }}
            </el-tag>
            <div v-if="row.pendingDraftVersion" class="pending-version-note">
              待发布修订 v{{ row.pendingDraftVersion.version }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="生命阶段" min-width="300">
          <template #default="{ row }">
            <div v-if="getConfiguredSeriesStages(row).length" class="series-stage-tags">
              <el-tag
                v-for="stage in getConfiguredSeriesStages(row)"
                :key="stage.lifeStage"
                :type="getSeriesStageStatusType(stage.status)"
                size="small"
                :class="[
                  'series-stage-tag',
                  { 'is-clickable': Boolean(stage.recipeVersionId) },
                ]"
                @click.stop="handleStageView(stage)"
              >
                {{ stage.label }}：{{ getSeriesStageStatusLabel(stage.status) }}
              </el-tag>
            </div>
            <template v-else>
              <el-tag
                v-for="stage in row.applicableLifeStages"
                :key="stage"
                size="small"
                class="tag-item"
              >
                {{ getLifeStageLabel(stage) }}
              </el-tag>
            </template>
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
              :disabled="!getOperableRecipeId(row)"
              @click="handleView(row)"
            >
              查看
            </el-button>
            <el-popover
              v-if="getPendingPublishStages(row).length"
              :visible="activePublishPopoverKey === getRecipePublishRowKey(row)"
              trigger="manual"
              placement="bottom-end"
              :width="300"
              popper-class="recipe-publish-popover"
            >
              <template #reference>
                <el-button
                  link
                  type="success"
                  size="small"
                  :loading="publishingRowKey === getRecipePublishRowKey(row)"
                  :disabled="publishingRecipeStages"
                  @click.stop="openPublishPopover(row)"
                >
                  发布
                </el-button>
              </template>
              <div class="publish-popover-content">
                <div class="publish-popover-title">选择要发布的生命阶段</div>
                <el-checkbox-group
                  v-model="selectedPublishStageIds"
                  class="publish-stage-list"
                  :disabled="publishingRecipeStages"
                >
                  <el-checkbox
                    v-for="stage in getPendingPublishStages(row)"
                    :key="stage.publishRecipeId"
                    :label="stage.publishRecipeId"
                    :value="stage.publishRecipeId"
                    class="publish-stage-option"
                  >
                    <span class="publish-stage-label">{{ stage.label }}</span>
                    <el-tag v-if="stage.version" size="small" type="warning">v{{ stage.version }}</el-tag>
                  </el-checkbox>
                </el-checkbox-group>
                <div class="publish-popover-actions">
                  <el-button
                    size="small"
                    :disabled="publishingRecipeStages"
                    @click="closePublishPopover"
                  >
                    取消
                  </el-button>
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="publishingRecipeStages || !selectedPublishStageIds.length"
                    @click="publishSelectedStages(row)"
                  >
                    发布所选
                  </el-button>
                  <el-button
                    size="small"
                    type="success"
                    :disabled="publishingRecipeStages"
                    @click="publishAllPendingStages(row)"
                  >
                    一键发布全部
                  </el-button>
                </div>
              </div>
            </el-popover>
            <el-button
              v-if="row.status === RecipeStatus.PUBLIC"
              link
              type="warning"
              size="small"
              :disabled="!getOperableRecipeId(row)"
              @click="handleUnpublish(row)"
            >
              下架
            </el-button>
            <el-button
              link
              type="info"
              size="small"
              :disabled="!getOperableRecipeId(row)"
              @click="handleDuplicate(row)"
            >
              复制
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              :disabled="!getOperableRecipeId(row)"
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
  getPendingPublishStages as resolvePendingPublishStages,
  getRecipePublishRowKey,
  type PendingPublishStage,
} from '@/utils/recipeMultiStagePublish';
import {
  RecipeStatus,
  RecipeSeriesBusinessStatus,
  RecipeManagementCategory,
  type RecipeSummary,
  type RecipeQuery,
  type RecipeSeriesStageSummary,
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
const activePublishPopoverKey = ref<string>();
const selectedPublishStageIds = ref<string[]>([]);
const publishingRecipeStages = ref(false);
const publishingRowKey = ref<string>();

// Metadata (enum options)
const lifeStageOptions = ref<EnumOption[]>([]);
const healthTagOptions = ref<EnumOption[]>([]);

const filters = reactive<RecipeQuery>({
  category: undefined,
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

const SeriesStageStatusLabels: Record<string, string> = {
  NOT_DESIGNED: '未设计',
  MODIFIED: '已修改',
  SUBMITTED: '已提交',
  PUBLISHED: '已发布',
  USER_RECIPE: '用户的食谱',
  PRIVATE_CUSTOM: '私密定制',
};

const RecipeBusinessStatusLabels: Record<string, string> = {
  [RecipeSeriesBusinessStatus.DRAFT]: '草稿',
  [RecipeSeriesBusinessStatus.PUBLIC]: '已发布',
  [RecipeSeriesBusinessStatus.PRIVATE_CUSTOM]: '私密定制',
};

const RecipeBusinessStatusTagTypes: Record<string, string> = {
  [RecipeSeriesBusinessStatus.DRAFT]: 'info',
  [RecipeSeriesBusinessStatus.PUBLIC]: 'success',
  [RecipeSeriesBusinessStatus.PRIVATE_CUSTOM]: 'danger',
};

const RecipeManagementCategoryLabels: Record<RecipeManagementCategory, string> = {
  [RecipeManagementCategory.STANDARD]: '标准食谱',
  [RecipeManagementCategory.PRIVATE_CUSTOM]: '私密定制',
  [RecipeManagementCategory.USER_RECIPE]: '用户的食谱',
};

const RecipeManagementCategoryTagTypes: Record<RecipeManagementCategory, string> = {
  [RecipeManagementCategory.STANDARD]: 'info',
  [RecipeManagementCategory.PRIVATE_CUSTOM]: 'danger',
  [RecipeManagementCategory.USER_RECIPE]: 'primary',
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

const getRecipeBusinessStatusLabel = (row: RecipeSummary) => {
  if (row.managementCategory && row.managementCategory !== RecipeManagementCategory.STANDARD) {
    return row.managementCategoryLabel || RecipeManagementCategoryLabels[row.managementCategory] || row.managementCategory;
  }

  const status = row.seriesBusinessStatus || row.status;
  return row.seriesBusinessStatusLabel || RecipeBusinessStatusLabels[status] || RecipeStatusLabels[row.status as RecipeStatus] || status;
};

const getRecipeBusinessStatusType = (row: RecipeSummary) => {
  if (row.managementCategory && row.managementCategory !== RecipeManagementCategory.STANDARD) {
    return RecipeManagementCategoryTagTypes[row.managementCategory] || 'info';
  }

  const status = row.seriesBusinessStatus || row.status;
  return RecipeBusinessStatusTagTypes[status] || RecipeStatusTagTypes[row.status as RecipeStatus] || 'info';
};

const getRecipeSeriesDisplayName = (row: RecipeSummary) => {
  return row.seriesName || row.name;
};

const getSeriesStageStatusLabel = (status: string) => {
  return SeriesStageStatusLabels[status] || status;
};

const getSeriesStageStatusType = (status: string) => {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'SUBMITTED' || status === 'MODIFIED') return 'warning';
  if (status === 'USER_RECIPE') return 'primary';
  if (status === 'PRIVATE_CUSTOM') return 'danger';
  return 'info';
};

const getConfiguredSeriesStages = (row: RecipeSummary) => {
  return (row.seriesStages || []).filter((stage) => stage.recipeVersionId);
};

const getOperableRecipeId = (row: Pick<RecipeSummary, 'id' | 'seriesId'>) => {
  if (!row.id || row.id === row.seriesId) return undefined;
  return row.id;
};

const getPendingPublishStages = (row: RecipeSummary) => {
  return resolvePendingPublishStages(row);
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
  ElMessage.info('请在食谱设计器中新建系列食谱，并为每个生命阶段创建对应草稿');
};

const handleView = (row: RecipeSummary) => {
  const id = getOperableRecipeId(row);
  if (!id) return;

  router.push({
    path: `/recipes/${id}`,
    query: { mode: 'view' }
  });
};

const handleStageView = (stage: RecipeSeriesStageSummary) => {
  if (!stage.recipeVersionId) {
    ElMessage.info('该生命阶段还没有配置食谱');
    return;
  }

  router.push({
    path: `/recipes/${stage.recipeVersionId}`,
    query: { mode: 'view' },
  });
};

const handleEdit = (row: RecipeSummary) => {
  const id = getOperableRecipeId(row);
  if (!id) return;

  router.push(`/recipes/${id}/edit`);
};

const openPublishPopover = (row: RecipeSummary) => {
  if (publishingRecipeStages.value) {
    ElMessage.info('食谱正在发布中，请稍后再试');
    return;
  }

  const stages = getPendingPublishStages(row);
  if (!stages.length) {
    ElMessage.info('没有待发布的生命阶段');
    return;
  }

  activePublishPopoverKey.value = getRecipePublishRowKey(row);
  selectedPublishStageIds.value = stages.map((stage) => stage.publishRecipeId);
};

const closePublishPopover = () => {
  activePublishPopoverKey.value = undefined;
  selectedPublishStageIds.value = [];
};

const publishSelectedStages = async (row: RecipeSummary) => {
  const selectedIds = new Set(selectedPublishStageIds.value);
  const selectedStages = getPendingPublishStages(row).filter((stage) =>
    selectedIds.has(stage.publishRecipeId),
  );
  await publishPendingStages(row, selectedStages);
};

const publishAllPendingStages = async (row: RecipeSummary) => {
  await publishPendingStages(row, getPendingPublishStages(row));
};

const publishPendingStages = async (
  row: RecipeSummary,
  stages: PendingPublishStage[],
) => {
  if (publishingRecipeStages.value) {
    ElMessage.info('食谱正在发布中，请稍后再试');
    return;
  }

  if (!stages.length) {
    ElMessage.warning('请选择要发布的生命阶段');
    return;
  }

  const rowKey = getRecipePublishRowKey(row);
  publishingRecipeStages.value = true;
  publishingRowKey.value = rowKey;
  const failures: Array<{ stage: PendingPublishStage; message: string }> = [];

  try {
    for (const stage of stages) {
      try {
        await recipeApi.publish(stage.publishRecipeId);
      } catch (error: any) {
        failures.push({
          stage,
          message: error?.message || '发布失败',
        });
      }
    }

    if (activePublishPopoverKey.value === rowKey) {
      closePublishPopover();
    }
    await loadRecipes();

    if (!failures.length) {
      ElMessage.success(stages.length > 1 ? '全部生命阶段发布成功' : '发布成功');
      return;
    }

    const failureText = failures
      .map(({ stage, message }) => `${stage.label}：${message}`)
      .join('；');
    const message =
      failures.length === stages.length
        ? `发布失败：${failureText}`
        : `部分发布失败：${failureText}`;

    ElMessage({
      type: failures.length === stages.length ? 'error' : 'warning',
      message,
      duration: 6000,
    });
  } finally {
    publishingRecipeStages.value = false;
    if (publishingRowKey.value === rowKey) {
      publishingRowKey.value = undefined;
    }
  }
};

const handleUnpublish = async (row: RecipeSummary) => {
  const id = getOperableRecipeId(row);
  if (!id) return;

  try {
    await ElMessageBox.confirm('确认下架该食谱？', '提示', {
      type: 'warning',
    });

    await recipeApi.unpublish(id);
    ElMessage.success('下架成功');
    loadRecipes();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '下架失败');
    }
  }
};

const handleDuplicate = async (row: RecipeSummary) => {
  const id = getOperableRecipeId(row);
  if (!id) return;

  try {
    await ElMessageBox.confirm('确认复制该食谱？', '提示', {
      type: 'info',
    });

    await recipeApi.duplicate(id);
    ElMessage.success('复制成功');
    loadRecipes();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '复制失败');
    }
  }
};

const handleDelete = async (row: RecipeSummary) => {
  const id = getOperableRecipeId(row);
  if (!id) return;

  try {
    await ElMessageBox.confirm('确认删除该草稿？删除后无法恢复！', '警告', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });

    await recipeApi.delete(id);
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

.filter-card :deep(.el-select),
.filter-card :deep(.el-input) {
  width: 100%;
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

.recipe-version-note,
.pending-version-note {
  margin-top: 4px;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1.3;
}

.pending-version-note {
  color: #d48806;
}

.tag-item {
  margin-right: 4px;
  margin-bottom: 4px;
}

.series-stage-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.series-stage-tag {
  margin: 0;
}

.series-stage-tag.is-clickable {
  cursor: pointer;
}

.series-stage-tag.is-clickable:hover {
  filter: brightness(0.96);
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #666;
}

.publish-popover-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.publish-popover-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.publish-stage-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.publish-stage-option {
  width: 100%;
  margin-right: 0;
}

.publish-stage-option :deep(.el-checkbox__label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.publish-stage-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
