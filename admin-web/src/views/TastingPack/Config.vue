<template>
  <div class="tasting-pack-config-page">
    <div class="page-header">
      <div>
        <h2>试吃装设置</h2>
        <p class="page-desc">
          试吃装是「提前做好、现货发售」的产品：一套固定几道菜，顾客点链接直接下单，不用等排产。
          价格由<strong>这套菜的合并成本 × 试吃倍率</strong>自动算出，不人工填价。
          人工时薪、间接成本、批次产能这些通用成本项在
          <router-link to="/global-config">全局配置</router-link>里，这里不重复。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存配置
        </el-button>
      </div>
    </div>

    <!--
      保存失败必须显示出来。补剂商城设置页踩过这个坑：
      没有 catch 时接口报错，用户只看到"按钮转完圈、值没变"，以为是没点保存。
    -->
    <el-alert
      v-if="saveError"
      class="save-error"
      type="error"
      :closable="false"
      show-icon
      :title="`保存失败：${saveError}`"
    />

    <el-card shadow="never" v-loading="loading">
      <el-form :model="form" label-width="200px">
        <el-divider content-position="left">总开关</el-divider>
        <el-form-item label="开启试吃装">
          <el-switch v-model="form.enabled" />
          <span class="form-tip">
            关闭后小程序端不展示试吃装入口（链接也进不去），后台配置不受影响
          </span>
        </el-form-item>

        <el-divider content-position="left">定价</el-divider>
        <el-form-item label="试吃倍率">
          <el-input-number
            v-model="form.tastingMultiplier"
            :min="0.1"
            :max="5"
            :step="0.05"
            :precision="3"
            style="width: 200px"
          />
          <span class="form-tip">
            实收 = 一套菜的成本 × 倍率。1.0 表示按成本原价卖（不赚钱）；
            默认 1.25 约等于正装口径的 75 折
          </span>
        </el-form-item>

        <el-form-item label="成本基数">
          <el-select v-model="form.costBasisMode" style="width: 260px">
            <el-option
              v-for="(label, code) in COST_BASIS_MODE_LABELS"
              :key="code"
              :label="label"
              :value="code"
            />
          </el-select>
          <div class="form-tip form-tip-block">
            <template v-if="form.costBasisMode === 'LIVE'">
              每次报价都按<strong>今天的原料价</strong>重算成本。
              原料涨价，售价跟着涨；原料降价，售价跟着降。
              好处是成本永远跟得上行情，风险是已做好的库存会随行情浮动
            </template>
            <template v-else>
              按<strong>仓库里那批货的实际成本</strong>算（入库时记下的单套成本）。
              原料之后涨跌都不影响已做好的库存，毛利更稳；
              风险是原料涨价时，早先低价做的货会卖得偏便宜
            </template>
          </div>
        </el-form-item>

        <el-form-item label="售价圆整">
          <el-select v-model="form.priceRoundingMode" style="width: 260px">
            <el-option
              v-for="(label, code) in ROUNDING_MODE_LABELS"
              :key="code"
              :label="label"
              :value="code"
            />
          </el-select>
          <span class="form-tip">
            一律向上取整。避免"算出来 1.0001、实收 1.00"这种负毛利
          </span>
        </el-form-item>

        <el-divider content-position="left">售卖</el-divider>
        <el-form-item label="单次限购套数">
          <el-input-number
            v-model="form.maxSetsPerOrder"
            :min="1"
            :max="50"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">一个订单最多能买几套试吃装</span>
        </el-form-item>

        <el-divider content-position="left">备货</el-divider>
        <el-form-item label="补货预警阈值">
          <el-input-number
            v-model="form.lowStockThreshold"
            :min="0"
            :max="999"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">可用套数低于这个数时，后台会提示补货</span>
        </el-form-item>

        <el-form-item label="一键备货默认套数">
          <el-input-number
            v-model="form.defaultRestockSets"
            :min="1"
            :max="999"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">点「一键备货」时预填的套数，可按当次情况改</span>
        </el-form-item>

        <el-form-item label="成品保质期（月）">
          <el-input-number
            v-model="form.shelfLifeMonths"
            :min="1"
            :max="24"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">
            入库时按「生产日期 + 这个月数」自动算到期日；急冻 -18℃ 口径是 6 个月
          </span>
        </el-form-item>

        <el-form-item label="每道菜默认袋数">
          <el-input-number
            v-model="form.defaultBagsPerRecipe"
            :min="1"
            :max="20"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">新建试吃装时的默认值，可逐个商品改</span>
        </el-form-item>

        <el-form-item label="每袋默认克重">
          <el-input-number
            v-model="form.defaultPackSpecG"
            :min="10"
            :max="1000"
            :step="10"
            style="width: 200px"
          />
          <span class="form-tip">新建试吃装时的默认值，可逐个商品改</span>
        </el-form-item>

        <el-form-item label="允许强制排产">
          <el-switch v-model="form.allowForceSchedule" />
          <span class="form-tip">
            正常流程要求"采购清单已完成"才能排产。原料已备齐时可跳过该检查强制排产，
            跳过会记操作日志
          </span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- ============ 试算 ============ -->
    <el-card shadow="never" class="quote-card">
      <template #header>
        <div class="card-header">
          <span>价格试算</span>
          <span class="card-header-desc">
            挑几道菜，看看按上面的参数一套要卖多少钱。改完参数记得先保存再试算
          </span>
        </div>
      </template>

      <el-table :data="specs" size="small" border>
        <el-table-column label="菜" min-width="320">
          <template #default="{ row }">
            <el-select
              v-model="row.recipeId"
              filterable
              placeholder="选择食谱"
              style="width: 100%"
            >
              <el-option
                v-for="recipe in recipeOptions"
                :key="recipe.recipeId"
                :label="`${recipe.name}（v${recipe.version}）`"
                :value="recipe.recipeId"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="每道袋数" width="140">
          <template #default="{ row }">
            <el-input-number
              v-model="row.packageCount"
              :min="1"
              :max="20"
              :step="1"
              size="small"
              controls-position="right"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="每袋克重" width="140">
          <template #default="{ row }">
            <el-input-number
              v-model="row.packageSpecG"
              :min="10"
              :max="1000"
              :step="10"
              size="small"
              controls-position="right"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ $index }">
            <el-button link type="danger" @click="removeSpec($index)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="quote-actions">
        <el-button @click="addSpec">再加一道菜</el-button>
        <el-button @click="applyDefaults">按默认规格填满</el-button>
        <el-input-number
          v-model="quoteSets"
          :min="1"
          :max="50"
          :step="1"
          style="width: 160px"
        />
        <span class="form-tip">套数</span>
        <el-button type="primary" :loading="quoting" @click="handleQuote">
          试算价格
        </el-button>
        <el-button :loading="stockLoading" @click="handleStockRequirement">
          测算备货用料
        </el-button>
      </div>

      <el-alert
        v-if="quoteError"
        class="quote-error"
        type="error"
        :closable="false"
        show-icon
        :title="quoteError"
      />

      <div v-if="quote" class="quote-result">
        <div class="quote-metrics">
          <div class="metric">
            <div class="metric-label">一套实收</div>
            <div class="metric-value primary">¥{{ quote.unitPrice }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">一套划线价</div>
            <div class="metric-value strike">¥{{ quote.unitListPrice }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">立省</div>
            <div class="metric-value">
              ¥{{ round2(quote.unitListPrice - quote.unitPrice) }}
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">一套成本</div>
            <div class="metric-value">¥{{ quote.unitCost }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">毛利</div>
            <div class="metric-value">
              ¥{{ round2(quote.unitPrice - quote.unitCost) }}
              <span class="metric-sub" v-if="quote.unitPrice > 0">
                （{{ grossMarginPercent }}%）
              </span>
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">运费（{{ quote.sets }} 套）</div>
            <div class="metric-value">¥{{ quote.amountShipping }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">{{ quote.sets }} 套合计</div>
            <div class="metric-value">¥{{ quote.amountTotal }}</div>
          </div>
        </div>

        <div class="quote-detail">
          <div class="detail-block">
            <div class="detail-title">成本构成（{{ quote.sets }} 套）</div>
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="原料">
                ¥{{ quote.costBreakdown.costIngredients }}
              </el-descriptions-item>
              <el-descriptions-item label="包材（含冷链箱/冰袋）">
                ¥{{ quote.costBreakdown.costPackaging }}
              </el-descriptions-item>
              <el-descriptions-item label="人工">
                ¥{{ quote.costBreakdown.costLabor }}
              </el-descriptions-item>
              <el-descriptions-item label="间接成本">
                ¥{{ quote.costBreakdown.costOverhead }}
              </el-descriptions-item>
              <el-descriptions-item label="成本合计">
                <strong>¥{{ quote.costBreakdown.totalProductCost }}</strong>
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <div class="detail-block">
            <div class="detail-title">规格与口径</div>
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="总净重">
                {{ quote.totalNetFoodWeightG }}g（{{ quote.totalPacks }} 袋）
              </el-descriptions-item>
              <el-descriptions-item label="含包材总重">
                {{ quote.totalWeightWithPackagingG }}g
              </el-descriptions-item>
              <el-descriptions-item label="试吃倍率">
                {{ quote.pricingParams.tastingMultiplier }}
              </el-descriptions-item>
              <el-descriptions-item label="成品口径利润率">
                {{ (quote.pricingParams.targetMargin * 100).toFixed(0) }}%
              </el-descriptions-item>
              <el-descriptions-item label="原料方案">
                {{ quote.pricingParams.ingredientSourcePlan }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <el-table :data="quote.perRecipe" size="small" border>
          <el-table-column prop="recipeName" label="菜" min-width="200" />
          <el-table-column label="规格" width="160">
            <template #default="{ row }">
              {{ row.packageSpecG }}g × {{ row.packageCount }} 袋
            </template>
          </el-table-column>
          <el-table-column label="净重" width="110">
            <template #default="{ row }">{{ row.netWeightG }}g</template>
          </el-table-column>
          <el-table-column label="原料成本" width="120">
            <template #default="{ row }">¥{{ row.costIngredients }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="stockRequirement" class="quote-result">
        <div class="detail-title">
          备货用料：做 {{ stockRequirement.sets }} 套需要
          {{ stockRequirement.totalNetFoodWeightG }}g 净料（{{
            stockRequirement.totalPacks
          }}
          袋），共 {{ stockRequirement.ingredientDetails.length }} 种原料
        </div>
        <el-table
          :data="stockRequirement.ingredientDetails"
          size="small"
          border
          max-height="380"
        >
          <el-table-column prop="name" label="原料" min-width="180" />
          <el-table-column prop="type" label="类型" width="110" />
          <el-table-column label="用量" width="150">
            <template #default="{ row }">
              {{ round3(row.amount) }} {{ row.unit }}
            </template>
          </el-table-column>
          <el-table-column label="成本" width="120">
            <template #default="{ row }">¥{{ round2(row.cost) }}</template>
          </el-table-column>
        </el-table>
        <p class="form-tip">
          这里只做测算，不会真的下采购单。备货生产单建好后，原料需求会直接进采购流程。
        </p>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  COST_BASIS_MODE_LABELS,
  ROUNDING_MODE_LABELS,
  tastingPackApi,
  type TastingPackConfig,
  type TastingPackQuote,
  type TastingPackRecipeSpec,
  type TastingPackStockRequirement,
} from '@/api/tastingPack';
import { recipeApi } from '@/api/recipes';
import { RecipeStatus, type RecipeSummary } from '@/types/recipe';

const loading = ref(false);
const saving = ref(false);
const saveError = ref('');

const quoting = ref(false);
const quoteError = ref('');
const quote = ref<TastingPackQuote | null>(null);

const stockLoading = ref(false);
const stockRequirement = ref<TastingPackStockRequirement | null>(null);

const recipeOptions = ref<RecipeSummary[]>([]);
const quoteSets = ref(1);

const form = ref<TastingPackConfig>({
  enabled: false,
  tastingMultiplier: 1.25,
  priceRoundingMode: 'CEIL_TO_1',
  costBasisMode: 'LIVE',
  maxSetsPerOrder: 5,
  lowStockThreshold: 10,
  defaultRestockSets: 20,
  shelfLifeMonths: 6,
  defaultBagsPerRecipe: 2,
  defaultPackSpecG: 80,
  allowForceSchedule: true,
  updatedAt: null,
});

/** 试算用的菜品清单，默认 5 行（与产品定稿的 5 道菜一致） */
const specs = ref<TastingPackRecipeSpec[]>(
  Array.from({ length: 5 }, () => ({
    recipeId: '',
    packageCount: 2,
    packageSpecG: 80,
  })),
);

const grossMarginPercent = computed(() => {
  if (!quote.value || quote.value.unitPrice <= 0) return '0.0';
  return (
    ((quote.value.unitPrice - quote.value.unitCost) / quote.value.unitPrice) *
    100
  ).toFixed(1);
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

async function load() {
  loading.value = true;
  try {
    const [config, recipes] = await Promise.all([
      tastingPackApi.getConfig(),
      recipeApi.list({ status: RecipeStatus.PUBLIC, page: 1, pageSize: 200 }),
    ]);
    form.value = config;
    recipeOptions.value = recipes.data || [];
    quote.value = null;
    stockRequirement.value = null;
  } catch (error: any) {
    ElMessage.error(error?.message || '读取试吃装设置失败');
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  saving.value = true;
  saveError.value = '';
  try {
    form.value = await tastingPackApi.updateConfig({
      enabled: form.value.enabled,
      tastingMultiplier: form.value.tastingMultiplier,
      priceRoundingMode: form.value.priceRoundingMode,
      costBasisMode: form.value.costBasisMode,
      maxSetsPerOrder: form.value.maxSetsPerOrder,
      lowStockThreshold: form.value.lowStockThreshold,
      defaultRestockSets: form.value.defaultRestockSets,
      shelfLifeMonths: form.value.shelfLifeMonths,
      defaultBagsPerRecipe: form.value.defaultBagsPerRecipe,
      defaultPackSpecG: form.value.defaultPackSpecG,
      allowForceSchedule: form.value.allowForceSchedule,
    });
    ElMessage.success('已保存，用户端下一次报价就会用新参数');
  } catch (error: any) {
    saveError.value = error?.message || '未知错误';
  } finally {
    saving.value = false;
  }
}

function addSpec() {
  specs.value.push({
    recipeId: '',
    packageCount: form.value.defaultBagsPerRecipe,
    packageSpecG: form.value.defaultPackSpecG,
  });
}

function removeSpec(index: number) {
  specs.value.splice(index, 1);
}

function applyDefaults() {
  specs.value = specs.value.map((row) => ({
    ...row,
    packageCount: form.value.defaultBagsPerRecipe,
    packageSpecG: form.value.defaultPackSpecG,
  }));
}

function collectSpecs(): TastingPackRecipeSpec[] | null {
  const filled = specs.value.filter((row) => row.recipeId);
  if (filled.length === 0) {
    quoteError.value = '请先选择至少一道菜';
    return null;
  }
  const duplicated = filled.length !== new Set(filled.map((r) => r.recipeId)).size;
  if (duplicated) {
    quoteError.value = '同一道菜不能重复选择';
    return null;
  }
  if (filled.some((row) => !row.packageCount || row.packageCount <= 0)) {
    quoteError.value = '袋数必须大于 0';
    return null;
  }
  if (filled.some((row) => !row.packageSpecG || row.packageSpecG <= 0)) {
    quoteError.value = '每袋克重必须大于 0';
    return null;
  }
  return filled;
}

async function handleQuote() {
  quoteError.value = '';
  const filled = collectSpecs();
  if (!filled) return;

  quoting.value = true;
  quote.value = null;
  try {
    quote.value = await tastingPackApi.quotePreview({
      specs: filled,
      sets: quoteSets.value,
    });
  } catch (error: any) {
    quoteError.value = error?.message || '试算失败';
  } finally {
    quoting.value = false;
  }
}

async function handleStockRequirement() {
  quoteError.value = '';
  const filled = collectSpecs();
  if (!filled) return;

  stockLoading.value = true;
  stockRequirement.value = null;
  try {
    stockRequirement.value = await tastingPackApi.stockRequirementPreview({
      specs: filled,
      sets: quoteSets.value,
    });
  } catch (error: any) {
    quoteError.value = error?.message || '用料测算失败';
  } finally {
    stockLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.tasting-pack-config-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
}

.page-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.page-desc {
  margin: 0;
  color: #666;
  font-size: 13px;
  line-height: 1.7;
  max-width: 780px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.save-error {
  margin-bottom: 12px;
}

.form-tip {
  margin-left: 12px;
  color: #999;
  font-size: 12px;
}

.form-tip-block {
  margin: 6px 0 0;
  line-height: 1.7;
  max-width: 620px;
}

.quote-card {
  margin-top: 16px;
}

.card-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.card-header-desc {
  color: #999;
  font-size: 12px;
}

.quote-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.quote-error {
  margin-top: 12px;
}

.quote-result {
  margin-top: 16px;
}

.quote-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.metric {
  min-width: 130px;
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

.metric-value.primary {
  color: #d4380d;
}

.metric-value.strike {
  color: #999;
  text-decoration: line-through;
  font-weight: 500;
}

.metric-sub {
  font-size: 12px;
  font-weight: 400;
  color: #888;
}

.quote-detail {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.detail-block {
  flex: 1;
  min-width: 0;
}

.detail-title {
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 13px;
}
</style>
