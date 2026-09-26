<template>
  <div class="tasting-pack-list-page">
    <div class="page-header">
      <div>
        <h2>试吃装商品</h2>
        <p class="page-desc">
          一套试吃装 = 几道菜 × 每道几袋 × 每袋多少克。它是<strong>现货</strong>：
          提前做好放库存里卖，顾客点链接直接下单，不排产。
          售价由「成本 × 试吃倍率」自动算出，规则在
          <router-link to="/tasting-pack/config">试吃装设置</router-link>里调。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">新建试吃装</el-button>
      </div>
    </div>

    <el-alert
      v-if="restockItems.length > 0"
      class="restock-alert"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #title>
        有 {{ restockItems.length }} 个已上架的试吃装库存偏低，建议尽快备货
      </template>
      <div class="restock-list">
        <span v-for="item in restockItems" :key="item.id" class="restock-item">
          {{ item.name }}：仅剩 {{ item.availableSets }} 套（预警线
          {{ item.lowStockThreshold }} 套）
          <el-button link type="primary" @click="goStock(item.id)">
            去入库
          </el-button>
        </span>
      </div>
    </el-alert>

    <el-alert
      v-if="errorMessage"
      class="error-alert"
      type="error"
      :closable="false"
      show-icon
      :title="errorMessage"
    />

    <el-card shadow="never" v-loading="loading">
      <el-table :data="packs" border stripe>
        <el-table-column label="试吃装" min-width="260">
          <template #default="{ row }">
            <div class="pack-cell">
              <el-image
                v-if="row.coverImageUrl"
                :src="row.coverImageUrl"
                class="pack-cover"
                fit="cover"
              />
              <div class="pack-text">
                <div class="pack-name">{{ row.name }}</div>
                <div class="pack-sub">{{ row.subtitle || '—' }}</div>
                <div class="pack-code">编号 {{ row.code }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="配方" min-width="200">
          <template #default="{ row }">
            <div class="items-cell">
              <el-tag
                v-for="item in row.items"
                :key="item.id"
                size="small"
                class="item-tag"
              >
                {{ item.name }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="规格" width="130">
          <template #default="{ row }">
            {{ row.items.length }} 道 × {{ row.bagsPerRecipe }} 袋 ×
            {{ row.packSpecG }}g
            <div class="muted">共 {{ row.totalNetWeightG }}g</div>
          </template>
        </el-table-column>

        <el-table-column label="可售" width="120">
          <template #default="{ row }">
            <span :class="{ danger: row.availableSets <= 0 }">
              {{ row.availableSets }} 套
            </span>
            <div v-if="row.expiringSoonSets > 0" class="muted warn">
              {{ row.expiringSoonSets }} 套临期
            </div>
            <div v-if="row.expiredSets > 0" class="muted danger">
              {{ row.expiredSets }} 套已过期
            </div>
          </template>
        </el-table-column>

        <el-table-column label="成本 / 售价" width="170">
          <template #default="{ row }">
            <div class="price-line">
              <span class="price">¥{{ row.unitPrice }}</span>
              <span v-if="row.unitListPrice > row.unitPrice" class="strike">
                ¥{{ row.unitListPrice }}
              </span>
            </div>
            <div class="muted">成本 ¥{{ row.unitCost }}</div>
            <div class="muted">
              {{ COST_BASIS_LABELS[row.costBasis] || row.costBasis }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'ACTIVE'
                  ? 'success'
                  : row.status === 'DRAFT'
                    ? 'info'
                    : 'warning'
              "
              size="small"
            >
              {{ PACK_STATUS_LABELS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button link type="primary" @click="copyLink(row)">
              复制链接
            </el-button>
            <el-button link type="primary" @click="goStock(row.id)">
              库存
            </el-button>
            <el-button
              v-if="row.status !== 'ACTIVE'"
              link
              type="success"
              @click="publish(row)"
            >
              上架
            </el-button>
            <el-button v-else link type="warning" @click="unpublish(row)">
              下架
            </el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && packs.length === 0" description="还没有试吃装商品">
        <el-button type="primary" @click="openCreate">新建第一个</el-button>
      </el-empty>
    </el-card>

    <!-- ========== 新建 / 编辑 ========== -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑试吃装' : '新建试吃装'"
      width="760px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="140px">
        <el-divider content-position="left">基本信息</el-divider>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="一句话卖点">
          <el-input v-model="form.subtitle" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="封面图">
          <el-input v-model="form.coverImageUrl" placeholder="图片地址" />
        </el-form-item>

        <el-divider content-position="left">配方（至少一道菜）</el-divider>
        <el-form-item label="选菜" required>
          <el-select
            v-model="selectedRecipeIds"
            multiple
            filterable
            placeholder="从已公开的食谱里挑"
            style="width: 100%"
          >
            <el-option
              v-for="recipe in recipeOptions"
              :key="recipe.recipeId"
              :label="`${recipe.name}（v${recipe.version}）`"
              :value="recipe.recipeId"
            />
          </el-select>
          <div class="form-tip">
            只能选<strong>已公开</strong>的食谱。顾客定制的私有食谱不会出现在这里，
            这是为了防止把别人的定制配方卖出去
          </div>
        </el-form-item>
        <el-form-item label="每道菜袋数">
          <el-input-number
            v-model="form.bagsPerRecipe"
            :min="1"
            :max="20"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="每袋克重">
          <el-input-number
            v-model="form.packSpecG"
            :min="10"
            :max="1000"
            :step="10"
          />
          <span class="form-tip">
            合计 {{ selectedRecipeIds.length }} 道 × {{ form.bagsPerRecipe }} 袋 ×
            {{ form.packSpecG }}g =
            {{ selectedRecipeIds.length * form.bagsPerRecipe * form.packSpecG }}g
          </span>
        </el-form-item>

        <el-divider content-position="left">定价与售卖</el-divider>
        <el-form-item label="手动定价">
          <el-input-number
            v-model="form.manualPrice"
            :min="1"
            :step="1"
            :precision="2"
            placeholder="留空 = 自动算"
          />
          <el-button link type="primary" @click="form.manualPrice = null">
            清空（回到自动算价）
          </el-button>
          <div class="form-tip">
            留空时价格 = 库存批次成本 × 试吃倍率，会随库存成本自动变化。
            填了就以这个价卖，不再自动算
          </div>
        </el-form-item>
        <el-form-item label="单次限购">
          <el-input-number
            v-model="form.maxSetsOverride"
            :min="1"
            :max="50"
            :step="1"
            placeholder="留空 = 用设置里的值"
          />
          <el-button link type="primary" @click="form.maxSetsOverride = null">
            清空
          </el-button>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :step="1" />
          <span class="form-tip">数字越小越靠前</span>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="dialogError"
        type="error"
        :closable="false"
        show-icon
        :title="dialogError"
      />

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  COST_BASIS_LABELS,
  PACK_STATUS_LABELS,
  tastingPackApi,
  type TastingPackListRow,
} from '@/api/tastingPack';
import { recipeApi } from '@/api/recipes';
import { RecipeStatus, type RecipeSummary } from '@/types/recipe';

const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const packs = ref<TastingPackListRow[]>([]);
const recipeOptions = ref<RecipeSummary[]>([]);

const dialogVisible = ref(false);
const dialogError = ref('');
const editingId = ref<string | null>(null);
const selectedRecipeIds = ref<string[]>([]);

const form = ref({
  name: '',
  subtitle: '',
  coverImageUrl: '',
  bagsPerRecipe: 2,
  packSpecG: 80,
  manualPrice: null as number | null,
  maxSetsOverride: null as number | null,
  sortOrder: 0,
});

const restockItems = computed(() => packs.value.filter((p) => p.needsRestock));

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [list, recipes] = await Promise.all([
      tastingPackApi.listPacks(),
      recipeApi.list({ status: RecipeStatus.PUBLIC, page: 1, pageSize: 200 }),
    ]);
    packs.value = list.items || [];
    recipeOptions.value = recipes.data || [];
  } catch (error: any) {
    errorMessage.value = error?.message || '读取试吃装列表失败';
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.value = {
    name: '',
    subtitle: '',
    coverImageUrl: '',
    bagsPerRecipe: 2,
    packSpecG: 80,
    manualPrice: null,
    maxSetsOverride: null,
    sortOrder: 0,
  };
  selectedRecipeIds.value = [];
  dialogError.value = '';
}

function openCreate() {
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: TastingPackListRow) {
  editingId.value = row.id;
  form.value = {
    name: row.name,
    subtitle: row.subtitle || '',
    coverImageUrl: row.coverImageUrl || '',
    bagsPerRecipe: row.bagsPerRecipe,
    packSpecG: row.packSpecG,
    manualPrice: row.manualPrice,
    maxSetsOverride: row.maxSetsOverride,
    sortOrder: row.sortOrder,
  };
  selectedRecipeIds.value = row.items.map((item) => item.recipeId);
  dialogError.value = '';
  dialogVisible.value = true;
}

async function submit() {
  dialogError.value = '';

  if (!form.value.name.trim()) {
    dialogError.value = '请填写名称';
    return;
  }
  if (selectedRecipeIds.value.length === 0) {
    dialogError.value = '至少要配一道菜';
    return;
  }

  const payload = {
    name: form.value.name.trim(),
    subtitle: form.value.subtitle.trim() || null,
    coverImageUrl: form.value.coverImageUrl.trim() || null,
    bagsPerRecipe: form.value.bagsPerRecipe,
    packSpecG: form.value.packSpecG,
    manualPrice: form.value.manualPrice,
    maxSetsOverride: form.value.maxSetsOverride,
    sortOrder: form.value.sortOrder,
    items: selectedRecipeIds.value.map((recipeId, index) => ({
      recipeId,
      sortOrder: index,
    })),
  };

  saving.value = true;
  try {
    if (editingId.value) {
      await tastingPackApi.updatePack(editingId.value, payload);
      ElMessage.success('已保存');
    } else {
      await tastingPackApi.createPack(payload);
      ElMessage.success('已创建，商品是「草稿」状态，确认无误后请上架');
    }
    dialogVisible.value = false;
    await load();
  } catch (error: any) {
    dialogError.value = error?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

async function publish(row: TastingPackListRow) {
  try {
    await tastingPackApi.publishPack(row.id);
    ElMessage.success(`「${row.name}」已上架`);
    await load();
  } catch (error: any) {
    ElMessage.error(error?.message || '上架失败');
  }
}

async function unpublish(row: TastingPackListRow) {
  try {
    await tastingPackApi.unpublishPack(row.id);
    ElMessage.success(`「${row.name}」已下架`);
    await load();
  } catch (error: any) {
    ElMessage.error(error?.message || '下架失败');
  }
}

async function remove(row: TastingPackListRow) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？已经入过库的商品不能删除，只能下架。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }

  try {
    await tastingPackApi.removePack(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (error: any) {
    ElMessage.error(error?.message || '删除失败');
  }
}

/**
 * 复制购买链接。
 *
 * 小程序页面路径：运营把它发给顾客，顾客点开就是这款试吃装的详情页。
 * 同时也支持顾客自己转发（页面已开启分享）。
 */
async function copyLink(row: TastingPackListRow) {
  const path = `pages/tasting-pack/index?packId=${row.code}`;
  try {
    await navigator.clipboard.writeText(path);
    ElMessage.success('购买链接已复制，可直接发给顾客');
  } catch {
    ElMessageBox.alert(path, '购买链接（请手动复制）', { type: 'info' });
  }
}

function goStock(id: string) {
  router.push({ path: '/tasting-pack/stock', query: { packId: id } });
}

onMounted(load);
</script>

<style scoped>
.tasting-pack-list-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.page-desc {
  margin: 0;
  max-width: 820px;
  color: #666;
  font-size: 13px;
  line-height: 1.7;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.restock-alert {
  margin-bottom: 12px;
}

.restock-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.restock-item {
  font-size: 13px;
}

.error-alert {
  margin-bottom: 12px;
}

.pack-cell {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.pack-cover {
  width: 54px;
  height: 54px;
  border-radius: 6px;
  flex-shrink: 0;
}

.pack-name {
  font-weight: 600;
}

.pack-sub,
.pack-code {
  color: #999;
  font-size: 12px;
}

.items-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-tag {
  margin: 0;
}

.muted {
  color: #999;
  font-size: 12px;
}

.muted.warn {
  color: #d48806;
}

.muted.danger,
.danger {
  color: #d4380d;
}

.price-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.price {
  font-weight: 600;
  color: #d4380d;
}

.strike {
  color: #999;
  text-decoration: line-through;
  font-size: 12px;
}

.form-tip {
  margin-left: 12px;
  color: #999;
  font-size: 12px;
}
</style>
