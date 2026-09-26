<template>
  <div class="plan-page">
    <div class="page-header">
      <div>
        <h2>试吃装备货</h2>
        <p class="page-desc">
          现货要提前做一批放库存里。这里把「做几套」换算成每道菜做多少、每样原料买多少，
          生成采购清单后交给现有的采购与生产流程，完工后确认入库。
          系统过去只能从顾客订单生成生产，这条通路就是补上「没有订单也能生产」。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="openCreate()">建备货单</el-button>
      </div>
    </div>

    <!-- 补货提醒：一键备货的入口 -->
    <el-alert
      v-if="suggestions.length > 0"
      class="restock-alert"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #title>
        有 {{ suggestions.length }} 个已上架的试吃装库存偏低
      </template>
      <div class="restock-list">
        <span v-for="item in suggestions" :key="item.tastingPackId" class="restock-item">
          {{ item.name }}：仅剩 {{ item.availableSets }} 套（预警线
          {{ item.lowStockThreshold }} 套）
          <el-button
            v-if="!item.openPlanId"
            link
            type="primary"
            @click="openCreate(item)"
          >
            一键备货 {{ item.suggestedSets }} 套
          </el-button>
          <el-tag v-else type="info" size="small">已有在途备货单</el-tag>
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
      <el-table :data="plans" border stripe>
        <el-table-column prop="planNo" label="备货单号" width="200" />
        <el-table-column label="商品" min-width="200">
          <template #default="{ row }">
            <div>{{ row.tastingPackName }}</div>
            <div class="muted">{{ row.tastingPackCode }}</div>
          </template>
        </el-table-column>
        <el-table-column label="计划" width="150">
          <template #default="{ row }">
            <div>{{ row.sets }} 套</div>
            <div class="muted">{{ row.plannedDate }} 生产</div>
          </template>
        </el-table-column>
        <el-table-column label="用料" width="170">
          <template #default="{ row }">
            <div>{{ row.dishes.length }} 道菜 / {{ row.ingredientCount }} 种原料</div>
            <div class="muted">预估 ¥{{ row.estimatedIngredientCost }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="170">
          <template #default="{ row }">
            <el-tag :type="planStatusTagType(row.status)" size="small">
              {{ planStatusLabel(row.status) }}
            </el-tag>
            <div v-if="row.purchaseListStatus" class="muted">
              采购单：{{ purchaseStatusLabel(row.purchaseListStatus) }}
            </div>
            <div
              v-if="row.status === 'COMPLETED' && row.suggestedStockInSets !== null"
              class="muted warn"
            >
              建议入库 {{ row.suggestedStockInSets }} 套
            </div>
            <div v-if="row.stockedSets" class="muted">
              已入库 {{ row.stockedSets }} 套
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PLANNED'"
              link
              type="primary"
              @click="createPurchaseList(row)"
            >
              生成采购清单
            </el-button>
            <el-button
              v-if="row.status === 'PURCHASING'"
              link
              type="primary"
              @click="schedule(row, false)"
            >
              排产
            </el-button>
            <el-button
              v-if="row.status === 'PURCHASING'"
              link
              type="warning"
              @click="schedule(row, true)"
            >
              强制排产
            </el-button>
            <el-button
              v-if="row.status === 'SCHEDULED'"
              link
              type="info"
              disabled
            >
              生产中
            </el-button>
            <el-button
              v-if="row.status === 'COMPLETED'"
              link
              type="success"
              @click="openStockIn(row)"
            >
              确认入库
            </el-button>
            <el-button link type="primary" @click="openDetail(row)">
              明细
            </el-button>
            <el-button
              v-if="['PLANNED', 'PURCHASING'].includes(row.status)"
              link
              type="danger"
              @click="cancel(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && plans.length === 0" description="还没有备货单">
        <el-button type="primary" @click="openCreate()">建第一张</el-button>
      </el-empty>
    </el-card>

    <!-- ===== 建备货单 ===== -->
    <el-dialog
      v-model="createVisible"
      title="建备货生产单"
      width="620px"
      :close-on-click-modal="false"
    >
      <el-form :model="createForm" label-width="140px">
        <el-form-item label="试吃装" required>
          <el-select
            v-model="createForm.tastingPackId"
            placeholder="选择商品"
            style="width: 100%"
            @change="refreshPreview"
          >
            <el-option
              v-for="pack in packs"
              :key="pack.id"
              :label="`${pack.name}（${pack.code}）`"
              :value="pack.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="做几套" required>
          <el-input-number
            v-model="createForm.sets"
            :min="1"
            :max="999"
            :step="1"
            @change="refreshPreview"
          />
          <span class="form-tip">现货可以多做一点，冷冻保质期 6 个月</span>
        </el-form-item>
        <el-form-item label="计划生产日期" required>
          <el-date-picker
            v-model="createForm.plannedDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.note" maxlength="200" />
        </el-form-item>

        <el-alert v-if="previewError" type="error" :closable="false" show-icon :title="previewError" />

        <div v-if="preview" class="preview">
          <div class="preview-title">
            用料预览：{{ preview.dishes.length }} 道菜 / {{ preview.dishTotals.length }} 项
          </div>
          <el-table :data="preview.dishTotals" size="small" border max-height="200">
            <el-table-column prop="recipeName" label="菜" min-width="180" />
            <el-table-column label="要做" width="150">
              <template #default="{ row }">
                {{ row.netWeightG }}g / {{ row.packageCount }} 袋
              </template>
            </el-table-column>
          </el-table>
          <div class="preview-total">
            共需原料 {{ preview.ingredientCount }} 种，预估成本
            <strong>¥{{ preview.estimatedCost }}</strong>
          </div>
        </div>
      </el-form>

      <el-alert v-if="dialogError" type="error" :closable="false" show-icon :title="dialogError" />

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">
          建单
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 确认入库 ===== -->
    <el-dialog v-model="stockInVisible" title="确认入库" width="520px">
      <el-form label-width="140px">
        <el-form-item label="备货单">
          <span>{{ currentPlan?.planNo }}（计划 {{ currentPlan?.sets }} 套）</span>
        </el-form-item>
        <el-form-item label="入库套数">
          <el-input-number v-model="stockInForm.sets" :min="1" :max="9999" :step="1" />
          <span class="form-tip">
            系统按实际产出建议
            {{ currentPlan?.suggestedStockInSets ?? '—' }} 套，可按实际情况改
          </span>
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
            填了之后现货售价就按这个成本算，毛利才是真实的
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="stockInForm.note" maxlength="200" />
        </el-form-item>
      </el-form>

      <el-alert v-if="dialogError" type="error" :closable="false" show-icon :title="dialogError" />

      <template #footer>
        <el-button @click="stockInVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitStockIn">
          确认入库
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 明细 ===== -->
    <el-dialog v-model="detailVisible" title="备货单明细" width="720px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="备货单号">{{ detail.planNo }}</el-descriptions-item>
          <el-descriptions-item label="商品">
            {{ detail.tastingPackName }}（{{ detail.tastingPackCode }}）
          </el-descriptions-item>
          <el-descriptions-item label="计划套数">{{ detail.sets }} 套</el-descriptions-item>
          <el-descriptions-item label="计划生产日期">{{ detail.plannedDate }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ planStatusLabel(detail.status) }}
          </el-descriptions-item>
          <el-descriptions-item label="预估原料成本">
            ¥{{ detail.estimatedIngredientCost }}
          </el-descriptions-item>
          <el-descriptions-item label="生产批次" :span="2">
            {{ detail.productionBatchId || '未排产' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-title">每道菜要做多少</div>
        <el-table :data="detail.dishes" size="small" border>
          <el-table-column prop="recipeName" label="菜" min-width="180" />
          <el-table-column label="净重" width="110">
            <template #default="{ row }">{{ row.netWeightG }}g</template>
          </el-table-column>
          <el-table-column label="分装" width="150">
            <template #default="{ row }">
              {{ row.packageSpecG }}g × {{ row.packageCount }} 袋
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  PLAN_STATUS_LABELS,
  tastingPackApi,
  tastingPackPlanApi,
  type RestockSuggestion,
  type TastingPackListRow,
  type TastingPackPlan,
} from '@/api/tastingPack';

const route = useRoute();

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const dialogError = ref('');

const plans = ref<TastingPackPlan[]>([]);
const packs = ref<TastingPackListRow[]>([]);
const suggestions = ref<RestockSuggestion[]>([]);

const createVisible = ref(false);
const stockInVisible = ref(false);
const detailVisible = ref(false);
const currentPlan = ref<TastingPackPlan | null>(null);
const detail = ref<TastingPackPlan | null>(null);

const createForm = ref({
  tastingPackId: '',
  sets: 20,
  plannedDate: '',
  note: '',
});

const stockInForm = ref({
  sets: 1,
  unitCost: null as number | null,
  note: '',
});

const preview = ref<{
  dishes: Array<{ recipeId: string }>;
  dishTotals: Array<{
    recipeName: string;
    netWeightG: number;
    packageCount: number;
  }>;
  ingredientCount: number;
  estimatedCost: number;
} | null>(null);
const previewError = ref('');

function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function planStatusTagType(status: string) {
  if (status === 'STOCKED') return 'success';
  if (status === 'CANCELLED') return 'info';
  if (status === 'COMPLETED') return 'primary';
  if (status === 'SCHEDULED') return 'warning';
  return 'info';
}

function planStatusLabel(status: string): string {
  return PLAN_STATUS_LABELS[status as keyof typeof PLAN_STATUS_LABELS] || status;
}

function purchaseStatusLabel(status: string): string {
  return status === 'COMPLETED' ? '已完成' : status === 'PENDING' ? '待采购' : status;
}

async function loadAll() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [planRes, packRes, suggestionRes] = await Promise.all([
      tastingPackPlanApi.listPlans(),
      tastingPackApi.listPacks(),
      tastingPackPlanApi.restockSuggestions(),
    ]);
    plans.value = planRes.items || [];
    packs.value = packRes.items || [];
    suggestions.value = suggestionRes.items || [];
  } catch (error: any) {
    errorMessage.value = error?.message || '读取备货单失败';
  } finally {
    loading.value = false;
  }
}

function openCreate(preset?: RestockSuggestion) {
  dialogError.value = '';
  preview.value = null;
  previewError.value = '';
  createForm.value = {
    tastingPackId: preset?.tastingPackId || packs.value[0]?.id || '',
    sets: preset?.suggestedSets ?? 20,
    plannedDate: todayString(),
    note: '',
  };
  createVisible.value = true;
  void refreshPreview();
}

/**
 * 建单前先看一眼用料。
 *
 * 用的是与真正建单同一个测算接口，所以预览的数字就是建单后冻结的数字 ——
 * 不会出现"预览 80 种、建完变 90 种"。
 */
async function refreshPreview() {
  previewError.value = '';
  preview.value = null;
  const pack = packs.value.find((item) => item.id === createForm.value.tastingPackId);
  if (!pack || !createForm.value.sets || createForm.value.sets <= 0) return;

  try {
    const result = await tastingPackApi.stockRequirementPreview({
      specs: pack.items.map((item) => ({
        recipeId: item.recipeId,
        packageCount: pack.bagsPerRecipe,
        packageSpecG: pack.packSpecG,
      })),
      sets: createForm.value.sets,
    });
    preview.value = {
      dishes: pack.items.map((item) => ({ recipeId: item.recipeId })),
      dishTotals: result.perRecipe.map((dish) => ({
        recipeName: dish.recipeName,
        netWeightG: dish.netWeightG,
        packageCount: dish.packageCount,
      })),
      ingredientCount: result.ingredientDetails.length,
      estimatedCost:
        Math.round(
          result.ingredientDetails.reduce((sum, d) => sum + (d.cost || 0), 0) * 100,
        ) / 100,
    };
  } catch (error: any) {
    previewError.value = error?.message || '用料测算失败';
  }
}

async function submitCreate() {
  dialogError.value = '';
  if (!createForm.value.tastingPackId) {
    dialogError.value = '请选择试吃装';
    return;
  }
  if (!createForm.value.plannedDate) {
    dialogError.value = '请选择计划生产日期';
    return;
  }

  saving.value = true;
  try {
    await tastingPackPlanApi.createPlan({
      tastingPackId: createForm.value.tastingPackId,
      sets: createForm.value.sets,
      plannedDate: createForm.value.plannedDate,
      note: createForm.value.note || null,
    });
    ElMessage.success('备货单已建好，下一步生成采购清单');
    createVisible.value = false;
    await loadAll();
  } catch (error: any) {
    dialogError.value = error?.message || '建单失败';
  } finally {
    saving.value = false;
  }
}

async function createPurchaseList(row: TastingPackPlan) {
  try {
    await tastingPackPlanApi.createPurchaseList(row.id);
    ElMessage.success('采购清单已生成，去「采购管理」采购原料');
    await loadAll();
  } catch (error: any) {
    ElMessage.error(error?.message || '生成采购清单失败');
  }
}

async function schedule(row: TastingPackPlan, force: boolean) {
  if (force) {
    try {
      await ElMessageBox.confirm(
        '强制排产会跳过「采购清单已完成」的检查。只有在原料确实已经到位时才用。确定吗？',
        '强制排产',
        { type: 'warning' },
      );
    } catch {
      return;
    }
  }

  try {
    await tastingPackPlanApi.schedule(row.id, { force });
    ElMessage.success('已排产，车间可以在员工端开工了');
    await loadAll();
  } catch (error: any) {
    ElMessage.error(error?.message || '排产失败');
  }
}

function openStockIn(row: TastingPackPlan) {
  dialogError.value = '';
  currentPlan.value = row;
  stockInForm.value = {
    sets: row.suggestedStockInSets ?? row.sets,
    unitCost: null,
    note: '',
  };
  stockInVisible.value = true;
}

async function submitStockIn() {
  dialogError.value = '';
  if (!stockInForm.value.sets || stockInForm.value.sets <= 0) {
    dialogError.value = '入库套数要大于 0';
    return;
  }

  saving.value = true;
  try {
    await tastingPackPlanApi.stockIn(currentPlan.value!.id, {
      sets: stockInForm.value.sets,
      unitCost: stockInForm.value.unitCost,
      note: stockInForm.value.note || null,
    });
    ElMessage.success('已入库，现货可以开卖了');
    stockInVisible.value = false;
    await loadAll();
  } catch (error: any) {
    dialogError.value = error?.message || '入库失败';
  } finally {
    saving.value = false;
  }
}

async function cancel(row: TastingPackPlan) {
  let reason = '';
  try {
    const result = await ElMessageBox.prompt(
      `确定取消备货单 ${row.planNo} 吗？请填写原因：`,
      '取消备货单',
      { type: 'warning', inputPlaceholder: '例如：本期不备货了' },
    );
    reason = result.value || '';
  } catch {
    return;
  }
  if (!reason.trim()) {
    ElMessage.warning('必须填写原因');
    return;
  }

  try {
    await tastingPackPlanApi.cancelPlan(row.id, reason.trim());
    ElMessage.success('已取消');
    await loadAll();
  } catch (error: any) {
    ElMessage.error(error?.message || '取消失败');
  }
}

async function openDetail(row: TastingPackPlan) {
  try {
    detail.value = await tastingPackPlanApi.getPlan(row.id);
    detailVisible.value = true;
  } catch (error: any) {
    ElMessage.error(error?.message || '读取明细失败');
  }
}

onMounted(async () => {
  await loadAll();
  const presetPackId = route.query.packId;
  if (typeof presetPackId === 'string' && presetPackId) {
    const pack = packs.value.find((item) => item.id === presetPackId);
    if (pack) openCreate();
    createForm.value.tastingPackId = presetPackId;
    await refreshPreview();
  }
});
</script>

<style scoped>
.plan-page {
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
  max-width: 860px;
  color: #666;
  font-size: 13px;
  line-height: 1.7;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.restock-alert,
.error-alert {
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

.muted {
  color: #999;
  font-size: 12px;
}

.muted.warn {
  color: #d48806;
}

.form-tip {
  margin-left: 12px;
  color: #999;
  font-size: 12px;
}

.preview {
  margin-top: 8px;
  padding: 12px;
  background: #f7f8fa;
  border-radius: 6px;
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.preview-total {
  margin-top: 8px;
  font-size: 13px;
}

.detail-title {
  margin: 16px 0 8px;
  font-weight: 600;
  font-size: 13px;
}
</style>
