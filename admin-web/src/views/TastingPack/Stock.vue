<template>
  <div class="tasting-pack-stock-page">
    <div class="page-header">
      <div>
        <h2>试吃装库存</h2>
        <p class="page-desc">
          这里管的是<strong>做好的成品</strong>（按套记），不是原料。一次备货入库记一个批次，
          扣减按「先到期先出」，每笔进出都有流水。已过期的批次不再计入可售。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button :loading="sweeping" @click="runSweep">过期下账</el-button>
        <el-button type="primary" @click="openStockIn()">备货入库</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      class="error-alert"
      type="error"
      :closable="false"
      show-icon
      :title="errorMessage"
    />

    <el-card shadow="never" v-loading="loading" class="selector-card">
      <div class="selector-row">
        <span class="selector-label">查看哪个试吃装</span>
        <el-select
          v-model="selectedPackId"
          placeholder="全部"
          clearable
          style="width: 320px"
          @change="load"
        >
          <el-option
            v-for="overview in overviews"
            :key="overview.tastingPackId"
            :label="overview.tastingPackName"
            :value="overview.tastingPackId"
          />
        </el-select>
        <el-tag v-if="needsRestockCount > 0" type="warning" size="small">
          {{ needsRestockCount }} 个商品需要补货
        </el-tag>
      </div>
    </el-card>

    <!-- 当前选中商品的库存概览 -->
    <el-card v-if="current" shadow="never" class="summary-card">
      <div class="summary-metrics">
        <div class="metric">
          <div class="metric-label">可售</div>
          <div class="metric-value" :class="{ danger: current.availableSets <= 0 }">
            {{ current.availableSets }} 套
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">临期（30 天内到期）</div>
          <div class="metric-value" :class="{ warn: current.expiringSoonSets > 0 }">
            {{ current.expiringSoonSets }} 套
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">已过期未清理</div>
          <div class="metric-value" :class="{ danger: current.expiredSets > 0 }">
            {{ current.expiredSets }} 套
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">库存加权成本</div>
          <div class="metric-value">
            {{ current.weightedUnitCost === null ? '未记成本' : `¥${current.weightedUnitCost}` }}
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">补货预警线</div>
          <div class="metric-value">
            {{ current.lowStockThreshold }} 套
            <el-tag v-if="current.needsRestock" type="danger" size="small">
              需补货
            </el-tag>
          </div>
        </div>
      </div>

      <el-table :data="current.batches" border size="small">
        <el-table-column prop="batchNo" label="批次号" width="170" />
        <el-table-column label="生产日期" width="120">
          <template #default="{ row }">{{ formatDate(row.producedAt) }}</template>
        </el-table-column>
        <el-table-column label="到期日" width="180">
          <template #default="{ row }">
            {{ formatDate(row.expiresAt) }}
            <el-tag
              v-if="row.daysToExpiry < 0"
              type="danger"
              size="small"
            >
              已过期
            </el-tag>
            <el-tag
              v-else-if="row.daysToExpiry <= 30"
              type="warning"
              size="small"
            >
              剩 {{ row.daysToExpiry }} 天
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="剩余 / 入库" width="130">
          <template #default="{ row }">
            {{ row.quantityRemaining }} / {{ row.quantityTotal }} 套
          </template>
        </el-table-column>
        <el-table-column label="单套成本" width="110">
          <template #default="{ row }">
            {{ row.unitCost === null ? '—' : `¥${row.unitCost}` }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'AVAILABLE'
                  ? 'success'
                  : row.status === 'DEPLETED'
                    ? 'info'
                    : 'danger'
              "
              size="small"
            >
              {{ STOCK_STATUS_LABELS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="160" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="row.status === 'VOID'"
              @click="openAdjust(row)"
            >
              调整
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="row.status === 'VOID' || row.quantityRemaining === 0"
              @click="voidBatch(row)"
            >
              作废
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-if="current.batches.length === 0"
        description="这个试吃装还没有入库记录"
      />
    </el-card>

    <el-card v-else shadow="never" class="summary-card">
      <el-table :data="overviews" border size="small">
        <el-table-column prop="tastingPackName" label="试吃装" min-width="200" />
        <el-table-column label="可售" width="110">
          <template #default="{ row }">{{ row.availableSets }} 套</template>
        </el-table-column>
        <el-table-column label="临期" width="110">
          <template #default="{ row }">{{ row.expiringSoonSets }} 套</template>
        </el-table-column>
        <el-table-column label="加权成本" width="130">
          <template #default="{ row }">
            {{ row.weightedUnitCost === null ? '未记成本' : `¥${row.weightedUnitCost}` }}
          </template>
        </el-table-column>
        <el-table-column label="需补货" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.needsRestock" type="danger" size="small">
              需补货
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="selectedPackId = row.tastingPackId; load()">
              看批次
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="overviews.length === 0" description="还没有试吃装商品" />
    </el-card>

    <!-- ========== 入库 ========== -->
    <el-dialog
      v-model="stockInVisible"
      title="备货入库"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="stockInForm" label-width="130px">
        <el-form-item label="试吃装" required>
          <el-select
            v-model="stockInForm.tastingPackId"
            placeholder="选择商品"
            style="width: 100%"
          >
            <el-option
              v-for="pack in packs"
              :key="pack.id"
              :label="`${pack.name}（${pack.code}）`"
              :value="pack.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="入库套数" required>
          <el-input-number
            v-model="stockInForm.sets"
            :min="1"
            :max="9999"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="生产日期" required>
          <el-date-picker
            v-model="stockInForm.producedAt"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="到期日">
          <el-date-picker
            v-model="stockInForm.expiresAt"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="留空 = 按设置的保质期自动算"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="单套成本">
          <el-input-number
            v-model="stockInForm.unitCost"
            :min="0"
            :step="1"
            :precision="2"
            placeholder="留空 = 不计成本"
          />
          <div class="form-tip">
            填了之后，现货售价会按这个成本算（而不是今天的原料价），
            毛利才是真实的。可以先用「试吃装设置」里的用料测算估一个
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="stockInForm.note" maxlength="200" />
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
        <el-button @click="stockInVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitStockIn">
          确认入库
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== 人工调整 ========== -->
    <el-dialog v-model="adjustVisible" title="人工调整库存" width="480px">
      <el-form label-width="120px">
        <el-form-item label="批次">
          <span>{{ adjustingBatch?.batchNo }}</span>
        </el-form-item>
        <el-form-item label="当前剩余">
          <span>{{ adjustingBatch?.quantityRemaining }} 套</span>
        </el-form-item>
        <el-form-item label="调整数量" required>
          <el-input-number v-model="adjustForm.delta" :step="1" />
          <span class="form-tip">负数表示减少（报损），正数表示增加（盘盈）</span>
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="adjustForm.note" maxlength="200" />
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
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAdjust">
          确认调整
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  STOCK_STATUS_LABELS,
  tastingPackApi,
  type StockBatch,
  type TastingPack,
  type TastingPackStockOverview,
} from '@/api/tastingPack';

const route = useRoute();

const loading = ref(false);
const sweeping = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const dialogError = ref('');

const overviews = ref<TastingPackStockOverview[]>([]);
const packs = ref<TastingPack[]>([]);
const selectedPackId = ref<string>('');
const needsRestockCount = ref(0);

const stockInVisible = ref(false);
const adjustVisible = ref(false);
const adjustingBatch = ref<StockBatch | null>(null);

const stockInForm = ref({
  tastingPackId: '',
  sets: 20,
  producedAt: '',
  expiresAt: '',
  unitCost: null as number | null,
  note: '',
});

const adjustForm = ref({ delta: -1, note: '' });

const current = computed(() =>
  overviews.value.find((item) => item.tastingPackId === selectedPackId.value),
);

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : '—';
}

function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [stock, list] = await Promise.all([
      tastingPackApi.listStock(),
      tastingPackApi.listPacks(),
    ]);
    overviews.value = stock.items || [];
    needsRestockCount.value = stock.needsRestockCount || 0;
    packs.value = list.items || [];
  } catch (error: any) {
    errorMessage.value = error?.message || '读取库存失败';
  } finally {
    loading.value = false;
  }
}

function openStockIn(packId?: string) {
  dialogError.value = '';
  stockInForm.value = {
    tastingPackId: packId || selectedPackId.value || packs.value[0]?.id || '',
    sets: 20,
    producedAt: todayString(),
    expiresAt: '',
    unitCost: null,
    note: '',
  };
  stockInVisible.value = true;
}

async function submitStockIn() {
  dialogError.value = '';
  if (!stockInForm.value.tastingPackId) {
    dialogError.value = '请选择试吃装';
    return;
  }
  if (!stockInForm.value.producedAt) {
    dialogError.value = '请选择生产日期';
    return;
  }
  if (!stockInForm.value.sets || stockInForm.value.sets <= 0) {
    dialogError.value = '入库套数要大于 0';
    return;
  }

  saving.value = true;
  try {
    await tastingPackApi.stockIn({
      tastingPackId: stockInForm.value.tastingPackId,
      sets: stockInForm.value.sets,
      producedAt: stockInForm.value.producedAt,
      expiresAt: stockInForm.value.expiresAt || null,
      unitCost: stockInForm.value.unitCost,
      note: stockInForm.value.note || null,
    });
    ElMessage.success('已入库');
    stockInVisible.value = false;
    selectedPackId.value = stockInForm.value.tastingPackId;
    await load();
  } catch (error: any) {
    dialogError.value = error?.message || '入库失败';
  } finally {
    saving.value = false;
  }
}

function openAdjust(batch: StockBatch) {
  dialogError.value = '';
  adjustingBatch.value = batch;
  adjustForm.value = { delta: -1, note: '' };
  adjustVisible.value = true;
}

async function submitAdjust() {
  dialogError.value = '';
  if (!adjustForm.value.delta) {
    dialogError.value = '调整数量不能为 0';
    return;
  }
  if (!adjustForm.value.note.trim()) {
    dialogError.value = '请填写调整原因';
    return;
  }

  saving.value = true;
  try {
    await tastingPackApi.adjustBatch(adjustingBatch.value!.id, {
      delta: adjustForm.value.delta,
      note: adjustForm.value.note.trim(),
    });
    ElMessage.success('已调整');
    adjustVisible.value = false;
    await load();
  } catch (error: any) {
    dialogError.value = error?.message || '调整失败';
  } finally {
    saving.value = false;
  }
}

async function voidBatch(batch: StockBatch) {
  let note = '';
  try {
    const result = await ElMessageBox.prompt(
      `作废批次 ${batch.batchNo} 后，剩余 ${batch.quantityRemaining} 套将一次性下账且不可恢复。请填写原因：`,
      '作废批次',
      { type: 'warning', inputPlaceholder: '例如：运输破损、盘点报废' },
    );
    note = result.value || '';
  } catch {
    return;
  }
  if (!note.trim()) {
    ElMessage.warning('必须填写原因');
    return;
  }

  try {
    await tastingPackApi.voidBatch(batch.id, { note: note.trim() });
    ElMessage.success('已作废');
    await load();
  } catch (error: any) {
    ElMessage.error(error?.message || '作废失败');
  }
}

async function runSweep() {
  sweeping.value = true;
  try {
    const result = await tastingPackApi.expirySweep();
    ElMessage.success(
      result.expired > 0
        ? `已把 ${result.expired} 个过期批次下账`
        : '没有需要下账的过期批次',
    );
    await load();
  } catch (error: any) {
    ElMessage.error(error?.message || '过期下账失败');
  } finally {
    sweeping.value = false;
  }
}

onMounted(async () => {
  await load();
  const queryPackId = route.query.packId;
  if (typeof queryPackId === 'string' && queryPackId) {
    selectedPackId.value = queryPackId;
  }
});
</script>

<style scoped>
.tasting-pack-stock-page {
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

.error-alert {
  margin-bottom: 12px;
}

.selector-card,
.summary-card {
  margin-bottom: 16px;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selector-label {
  color: #666;
  font-size: 13px;
}

.summary-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.metric {
  min-width: 140px;
  padding: 10px 14px;
  background: #f7f8fa;
  border-radius: 6px;
}

.metric-label {
  color: #888;
  font-size: 12px;
}

.metric-value {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 600;
}

.metric-value.warn {
  color: #d48806;
}

.metric-value.danger {
  color: #d4380d;
}

.form-tip {
  margin-left: 12px;
  color: #999;
  font-size: 12px;
}
</style>
