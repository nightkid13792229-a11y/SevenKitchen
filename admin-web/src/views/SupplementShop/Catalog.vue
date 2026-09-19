<template>
  <div class="supplement-catalog-page">
    <div class="page-header">
      <div>
        <h2>补剂上架清单</h2>
        <p class="page-desc">
          补剂商城第 0 期：逐个确认补剂的<strong>物理形态</strong>、<strong>原厂保质期</strong>和
          <strong>储存条件</strong>，补齐后才能上架。档案不全会阻断上架。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button :loading="applying" @click="handleApplySuggestions">
          按系统建议预填空白项
        </el-button>
        <el-button type="primary" :loading="enablingAll" @click="handleEnableAll">
          一键上架全部可生产补剂
        </el-button>
      </div>
    </div>

    <div class="summary-row">
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.total }}</div>
        <div class="summary-label">补剂档案总数</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.retailEnabled }}</div>
        <div class="summary-label">已上架</div>
      </el-card>
      <el-card shadow="never" class="summary-card highlight-ok">
        <div class="summary-value">{{ summary.readyToSell }}</div>
        <div class="summary-label">可直接售卖</div>
      </el-card>
      <el-card shadow="never" class="summary-card highlight-error">
        <div class="summary-value">{{ summary.blockedByError }}</div>
        <div class="summary-label">有阻断性问题</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.noPrice }}</div>
        <div class="summary-label">进货价为 0</div>
      </el-card>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索补剂名称 / 品牌"
          clearable
          style="width: 260px"
        />
        <el-select v-model="filter" style="width: 190px">
          <el-option label="全部补剂" value="ALL" />
          <el-option label="有阻断性问题" value="BLOCKED" />
          <el-option label="已上架" value="ENABLED" />
          <el-option label="可直接售卖" value="READY" />
          <el-option label="被食谱引用过" value="USED" />
          <el-option label="可用于生产" value="PRODUCIBLE" />
        </el-select>
        <span class="toolbar-tip">共 {{ filteredItems.length }} 条</span>
      </div>

      <el-table
        :data="filteredItems"
        v-loading="loading"
        stripe
        border
        size="small"
        style="width: 100%"
      >
        <el-table-column label="补剂" min-width="230" fixed>
          <template #default="{ row }">
            <div class="cell-title">{{ row.name }}</div>
            <div class="cell-sub">{{ row.brand || '无品牌' }} · {{ row.productModel || '无规格' }}</div>
          </template>
        </el-table-column>

        <el-table-column label="物理形态" width="180">
          <template #default="{ row }">
            <el-select
              :model-value="row.physicalForm"
              placeholder="待填"
              size="small"
              :loading="savingIds.has(row.id)"
              style="width: 100%"
              @update:model-value="(value: any) => save(row, { physicalForm: value })"
            >
              <el-option
                v-for="(label, code) in PHYSICAL_FORM_LABELS"
                :key="code"
                :label="label"
                :value="code"
                :disabled="code === 'LIQUID'"
              />
            </el-select>
            <div v-if="!row.physicalForm && row.suggestedPhysicalForm" class="cell-hint">
              建议：{{ formLabel(row.suggestedPhysicalForm) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="计量单位" width="90" align="center">
          <template #default="{ row }">
            <span>{{ row.displayUnit }}</span>
          </template>
        </el-table-column>

        <el-table-column label="瓶价 / 单位成本" width="140" align="right">
          <template #default="{ row }">
            <div>{{ row.pricePerPurchaseUnit.toFixed(2) }} 元 / {{ row.purchaseUnit }}</div>
            <div class="cell-sub">
              {{ row.unitCost === null ? '—' : `${row.unitCost.toFixed(4)} 元/${row.displayUnit}` }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="原厂保质期（月）" width="160">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.shelfLifeMonths ?? undefined"
              :min="1"
              :max="120"
              :controls="false"
              size="small"
              placeholder="待填"
              style="width: 100%"
              @change="(value: any) => save(row, { shelfLifeMonths: value ?? null })"
            />
            <div v-if="!row.shelfLifeMonths && row.suggestedShelfLifeMonths" class="cell-hint">
              建议：{{ row.suggestedShelfLifeMonths }} 个月
            </div>
          </template>
        </el-table-column>

        <el-table-column label="储存条件" min-width="200">
          <template #default="{ row }">
            <el-input
              :model-value="row.storageCondition ?? ''"
              size="small"
              placeholder="例如：避光、密封、阴凉干燥处保存"
              @blur="(event: any) => onStorageBlur(row, event)"
              @keyup.enter="(event: any) => onStorageBlur(row, event)"
            />
          </template>
        </el-table-column>

        <el-table-column label="油性" width="110" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.isOilBased"
              :loading="savingIds.has(row.id)"
              size="small"
              @update:model-value="(value: any) => save(row, { isOilBased: value })"
            />
            <div v-if="!row.isOilBased && row.suggestedOilBased" class="cell-hint">
              建议开启
            </div>
          </template>
        </el-table-column>

        <el-table-column label="可生产" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.producible" type="success" size="small" effect="plain">
              可生产
            </el-tag>
            <span v-else class="cell-sub">未启用</span>
          </template>
        </el-table-column>

        <el-table-column label="引用食谱" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.recipeReferenceCount > 0" type="success" size="small" effect="plain">
              {{ row.recipeReferenceCount }}
            </el-tag>
            <span v-else class="cell-sub">0</span>
          </template>
        </el-table-column>

        <el-table-column label="数据体检" min-width="200">
          <template #default="{ row }">
            <el-tag v-if="row.issues.length === 0" type="success" size="small">正常</el-tag>
            <template v-else>
              <el-tooltip
                v-for="issue in row.issues"
                :key="issue.code + issue.message"
                :content="issue.message"
                placement="top"
              >
                <el-tag
                  :type="issue.level === 'ERROR' ? 'danger' : 'warning'"
                  size="small"
                  effect="plain"
                  class="issue-tag"
                >
                  {{ ISSUE_LABELS[issue.code] || issue.code }}
                </el-tag>
              </el-tooltip>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="上架" width="110" align="center" fixed="right">
          <template #default="{ row }">
            <el-tooltip
              :disabled="row.readyToSell || !row.issues.some((i: any) => i.level === 'ERROR')"
              content="档案未补齐，无法上架"
              placement="top"
            >
              <span>
                <el-switch
                  :model-value="row.supplementRetailEnabled"
                  :disabled="!row.readyToSell"
                  :loading="savingIds.has(row.id)"
                  @update:model-value="(value: any) => save(row, { supplementRetailEnabled: value })"
                />
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ISSUE_LABELS,
  PHYSICAL_FORM_LABELS,
  supplementShopApi,
  type SupplementCatalogItem,
  type SupplementCatalogSummary,
  type UpdateSupplementCatalogItemDto,
} from '@/api/supplementShop';

const loading = ref(false);
const applying = ref(false);
const enablingAll = ref(false);
const items = ref<SupplementCatalogItem[]>([]);
const summary = ref<SupplementCatalogSummary>({
  total: 0,
  retailEnabled: 0,
  readyToSell: 0,
  blockedByError: 0,
  missingForm: 0,
  missingShelfLife: 0,
  noPrice: 0,
});
const keyword = ref('');
const filter = ref<'ALL' | 'BLOCKED' | 'ENABLED' | 'READY' | 'USED' | 'PRODUCIBLE'>(
  'ALL',
);
const savingIds = ref(new Set<string>());

function formLabel(code: string | null): string {
  if (!code) return '—';
  return PHYSICAL_FORM_LABELS[code as keyof typeof PHYSICAL_FORM_LABELS] ?? code;
}

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (kw) {
      const haystack = `${item.name} ${item.brand ?? ''} ${item.productModel ?? ''}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    const hasError = item.issues.some((issue) => issue.level === 'ERROR');
    switch (filter.value) {
      case 'BLOCKED':
        return hasError;
      case 'ENABLED':
        return item.supplementRetailEnabled;
      case 'READY':
        return item.readyToSell;
      case 'USED':
        return item.recipeReferenceCount > 0;
      case 'PRODUCIBLE':
        return item.producible;
      default:
        return true;
    }
  });
});

async function load() {
  loading.value = true;
  try {
    const res = await supplementShopApi.catalog();
    items.value = res.items;
    summary.value = res.summary;
  } finally {
    loading.value = false;
  }
}

async function save(row: SupplementCatalogItem, patch: UpdateSupplementCatalogItemDto) {
  savingIds.value = new Set(savingIds.value).add(row.id);
  try {
    const updated = await supplementShopApi.updateItem(row.id, patch);
    const index = items.value.findIndex((item) => item.id === row.id);
    if (index >= 0) items.value[index] = updated;
    await refreshSummary();
  } catch (error) {
    // 拦截器已经弹过错误提示，这里只需要把开关状态刷回真实值
    await load();
  } finally {
    const next = new Set(savingIds.value);
    next.delete(row.id);
    savingIds.value = next;
  }
}

/** 只更新汇总，避免整表重载打断正在编辑的行 */
async function refreshSummary() {
  try {
    const res = await supplementShopApi.catalog();
    summary.value = res.summary;
    items.value = res.items.map((fresh) => {
      const local = items.value.find((item) => item.id === fresh.id);
      return local && savingIds.value.has(fresh.id) ? local : fresh;
    });
  } catch {
    // 汇总刷新失败不影响本次保存结果
  }
}

function onStorageBlur(row: SupplementCatalogItem, event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value === (row.storageCondition ?? '')) return;
  void save(row, { storageCondition: value || null });
}

async function handleEnableAll() {
  try {
    await ElMessageBox.confirm(
      '会把所有「可用于生产」的补剂自动补齐档案并全部上架（已经上架的不受影响）。没有进货价、算不出售价的会单独列出来给你处理。是否继续？',
      '一键上架确认',
      { type: 'warning', confirmButtonText: '开始上架', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  enablingAll.value = true;
  try {
    const result = await supplementShopApi.enableAllProducible();
    await load();

    if (result.skipped.length === 0) {
      ElMessage.success(`已上架 ${result.enabled} 个补剂，全部可生产补剂都已可售`);
      return;
    }

    const lines = result.skipped
      .map((item) => `· ${item.name}（${item.brand || '无品牌'}）：${item.reason}`)
      .join('\n');

    await ElMessageBox.alert(
      `已上架 ${result.enabled} 个补剂。\n\n以下 ${result.skipped.length} 个因为档案不全没能上架：\n${lines}`,
      '部分补剂需要人工处理',
      { confirmButtonText: '知道了' },
    );
  } finally {
    enablingAll.value = false;
  }
}

async function handleApplySuggestions() {
  try {
    await ElMessageBox.confirm(
      '将按系统建议，为「形态」和「原厂保质期」为空的补剂自动预填（不会覆盖已填内容）。是否继续？',
      '批量预填确认',
      { type: 'warning', confirmButtonText: '继续预填', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  applying.value = true;
  try {
    const res = await supplementShopApi.applySuggestions();
    ElMessage.success(`已预填 ${res.updated} 条补剂档案`);
    await load();
  } finally {
    applying.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.supplement-catalog-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.page-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: #909399;
  max-width: 720px;
}

.header-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.summary-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.summary-card {
  flex: 1;
  min-width: 140px;
  text-align: center;
}

.summary-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}

.summary-label {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.highlight-ok .summary-value {
  color: #67c23a;
}

.highlight-error .summary-value {
  color: #f56c6c;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.toolbar-tip {
  font-size: 13px;
  color: #909399;
}

.cell-title {
  font-weight: 600;
}

.cell-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.cell-hint {
  font-size: 12px;
  color: #e6a23c;
  margin-top: 2px;
}

.issue-tag {
  margin: 0 4px 4px 0;
}
</style>
