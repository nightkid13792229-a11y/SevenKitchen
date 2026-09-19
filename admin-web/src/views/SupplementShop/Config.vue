<template>
  <div class="supplement-config-page">
    <div class="page-header">
      <div>
        <h2>补剂商城设置</h2>
        <p class="page-desc">
          加价倍率、分装服务费、运费策略和分装有效期都在这里单独配置，
          <strong>不受鲜食成本配置影响</strong>。改完即时生效，用户端下一次报价就会用新参数。
        </p>
      </div>
      <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-form :model="form" label-width="220px">
        <el-divider content-position="left">总开关</el-divider>
        <el-form-item label="开启补剂商城">
          <el-switch v-model="form.enabled" />
          <span class="form-tip">
            关闭后小程序端不再展示「一键购买补剂」入口，后台配置不受影响
          </span>
        </el-form-item>

        <el-divider content-position="left">定价</el-divider>
        <el-form-item label="加价倍率">
          <el-input-number
            v-model="form.markupMultiplier"
            :min="0.1"
            :max="20"
            :step="0.1"
            :precision="2"
            style="width: 220px"
          />
          <span class="form-tip">
            补剂费 = 分装量 × 单位成本 × 倍率。1.0 表示按成本原价卖（不赚钱）
          </span>
        </el-form-item>

        <el-form-item label="分装服务费">
          <el-select v-model="form.serviceFeeMode" style="width: 160px">
            <el-option
              v-for="(label, code) in SERVICE_FEE_MODE_LABELS"
              :key="code"
              :label="label"
              :value="code"
            />
          </el-select>
          <el-input-number
            v-model="form.serviceFeeAmount"
            :min="0"
            :step="0.5"
            :precision="2"
            style="width: 160px; margin-left: 12px"
          />
          <span class="form-tip">
            {{ form.serviceFeeMode === 'PER_ORDER' ? '元 / 单' : '元 / 袋（每种补剂一袋）' }}
          </span>
        </el-form-item>

        <el-form-item label="包材费">
          <el-input-number
            v-model="form.packagingFeePerBag"
            :min="0"
            :step="0.5"
            :precision="2"
            style="width: 220px"
          />
          <span class="form-tip">元 / 袋。铝箔袋、干燥剂、标签的成本，已含在服务费里就填 0</span>
        </el-form-item>

        <el-form-item label="价格圆整规则">
          <el-select v-model="form.priceRoundingMode" style="width: 260px">
            <el-option
              v-for="(label, code) in ROUNDING_MODE_LABELS"
              :key="code"
              :label="label"
              :value="code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="用量向上取整">
          <el-switch v-model="form.roundUpUsage" />
          <span class="form-tip">
            开启后：片/粒/平勺 向上取整到整数，按克称重的向上取到 0.1（避免分装出现半片、半粒）
          </span>
        </el-form-item>

        <el-form-item label="最低起送金额">
          <el-input-number
            v-model="form.minOrderAmount"
            :min="0"
            :step="1"
            :precision="2"
            style="width: 220px"
          />
          <span class="form-tip">0 表示不限制。低于此金额只提示，不阻止下单</span>
        </el-form-item>

        <el-divider content-position="left">运费</el-divider>
        <el-form-item label="运费策略">
          <el-select v-model="form.shippingMode" style="width: 300px">
            <el-option
              v-for="(label, code) in SHIPPING_MODE_LABELS"
              :key="code"
              :label="label"
              :value="code"
            />
          </el-select>
          <span class="form-tip">补剂极轻，建议一口价；鲜食用的顺丰模板不适合补剂</span>
        </el-form-item>

        <el-form-item v-if="form.shippingMode === 'FLAT_RATE'" label="一口价运费">
          <el-input-number
            v-model="form.flatShippingFee"
            :min="0"
            :step="0.5"
            :precision="2"
            style="width: 220px"
          />
          <span class="form-tip">元 / 单</span>
        </el-form-item>

        <el-form-item v-else label="运费模板">
          <el-select
            v-model="form.shippingTemplateId"
            placeholder="请选择运费模板"
            style="width: 300px"
          >
            <el-option
              v-for="tpl in shippingTemplates"
              :key="tpl.id"
              :label="`${tpl.name}（首重 ${tpl.baseWeightKg}kg / ${tpl.baseFee} 元）`"
              :value="tpl.id"
              :disabled="!tpl.isActive"
            />
          </el-select>
          <div class="form-tip block">
            注意：模板里的「保价费」也会计入补剂运费。建议给补剂单独建一条保价费为 0 的模板。
          </div>
        </el-form-item>

        <el-form-item label="包邮门槛">
          <el-input-number
            v-model="form.freeShippingThreshold"
            :min="0"
            :step="10"
            :precision="2"
            :controls="true"
            style="width: 220px"
          />
          <el-button link type="primary" style="margin-left: 12px" @click="form.freeShippingThreshold = null">
            清空（不包邮）
          </el-button>
          <div class="form-tip block">商品金额（补剂费 + 服务费 + 包材费）达到该金额即免运费</div>
        </el-form-item>

        <el-divider content-position="left">分装有效期</el-divider>
        <el-form-item label="分装后标示有效期">
          <span class="inline-field">
            粉剂
            <el-input-number
              v-model="form.powderShelfLifeMonths"
              :min="1"
              :max="60"
              :step="1"
              style="width: 130px"
            />
            个月
          </span>
          <span class="inline-field">
            片剂 / 胶囊
            <el-input-number
              v-model="form.solidShelfLifeMonths"
              :min="1"
              :max="60"
              :step="1"
              style="width: 130px"
            />
            个月
          </span>
          <span class="inline-field">
            油性软胶囊
            <el-input-number
              v-model="form.oilShelfLifeMonths"
              :min="1"
              :max="60"
              :step="1"
              style="width: 130px"
            />
            个月
          </span>
          <div class="form-tip block">
            鱼油、鱼肝油这类油性内容物最易氧化酸败，取更保守的一档。
            在「补剂上架清单」里把对应补剂的「油性」开关打开即可生效。
            <br />
            实际标签效期还会与「原瓶剩余保质期」取小：分装有效期 = min(原瓶到期日, 分装日 + 上面这个月数)
          </div>
        </el-form-item>

        <el-form-item label="最短可售剩余保质期">
          <el-input-number
            v-model="form.minRemainingShelfLifeDays"
            :min="0"
            :max="3650"
            :step="30"
            style="width: 220px"
          />
          <span class="form-tip">天。原瓶剩余保质期低于此值的补剂不允许上架</span>
        </el-form-item>

        <el-divider content-position="left">分装标签</el-divider>
        <el-form-item label="标签品牌名">
          <el-input
            v-model="form.labelBrandName"
            maxlength="100"
            show-word-limit
            style="width: 320px"
          />
          <div class="form-tip block">
            印在每张分装标签顶部，同时作为「分装者」署名。标签含品名、分装量、分装日期、
            有效期至、批号、储存条件、原品信息与「分装小样、非直接食用」声明。
          </div>
        </el-form-item>

        <el-form-item label="干燥剂提示">
          <el-switch v-model="form.labelIncludeDesiccantNotice" />
          <span class="form-tip">
            开启后标签上会印「内含干燥剂，请勿食用」。如果某个补剂袋里不放干燥剂，可以关掉
          </span>
        </el-form-item>

        <el-divider content-position="left">售后</el-divider>
        <el-form-item label="售后策略">
          <el-input
            v-model="form.aftersalePolicy"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="例如：缺货、发错、破损或量不对，无理由退款或免费补发"
            style="max-width: 620px"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="quote-card">
      <template #header>
        <div class="quote-header">
          <span>报价试算</span>
          <div>
            <el-button size="small" @click="addLine">加一行</el-button>
            <el-button size="small" type="primary" :loading="quoting" @click="handleQuote">
              按当前配置试算
            </el-button>
          </div>
        </div>
      </template>

      <p class="page-desc">
        试算用的是<strong>已保存的配置</strong>（不是表单里还没保存的值）。想比较不同参数，
        先保存再试算。
      </p>

      <el-table :data="quoteLines" size="small" border style="margin-bottom: 14px">
        <el-table-column label="补剂" min-width="200">
          <template #default="{ row }">
            <el-select
              v-model="row.ingredientId"
              placeholder="选择补剂"
              filterable
              size="small"
              style="width: 100%"
              @change="(id: string) => applyCatalogItem(row, id)"
            >
              <el-option
                v-for="item in quoteCatalog"
                :key="item.id"
                :label="`${item.name}（${item.brand || '无品牌'}）`"
                :value="item.id"
                :disabled="!item.unitCost"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="单位" width="80" align="center">
          <template #default="{ row }">{{ row.unit || '—' }}</template>
        </el-table-column>
        <el-table-column label="用量" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.amount" :min="0" :precision="2" :controls="false" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="单位成本" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.unitCost" :min="0" :precision="4" :controls="false" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="70" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="quoteLines.splice($index, 1)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        v-if="quoteError"
        :title="quoteError"
        type="error"
        show-icon
        :closable="false"
        style="margin-bottom: 14px"
      />

      <template v-if="quote">
        <el-descriptions :column="4" border size="small">
          <el-descriptions-item label="补剂成本">
            {{ quote.supplementCost.toFixed(2) }} 元
          </el-descriptions-item>
          <el-descriptions-item label="补剂费（对用户）">
            {{ quote.supplementPrice.toFixed(2) }} 元
          </el-descriptions-item>
          <el-descriptions-item :label="`分装服务费（${form.serviceFeeMode === 'PER_ORDER' ? '按单' : '按袋'}）`">
            {{ quote.serviceFee.toFixed(2) }} 元
          </el-descriptions-item>
          <el-descriptions-item label="包材费">
            {{ quote.packagingFee.toFixed(2) }} 元
          </el-descriptions-item>
          <el-descriptions-item label="商品小计">
            {{ quote.goodsSubtotal.toFixed(2) }} 元
          </el-descriptions-item>
          <el-descriptions-item label="运费">
            {{ quote.shippingFee.toFixed(2) }} 元
            <el-tag v-if="quote.freeShipping" type="success" size="small" style="margin-left: 6px">
              已包邮
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="用户实付">
            <strong>{{ quote.total.toFixed(2) }} 元</strong>
          </el-descriptions-item>
          <el-descriptions-item label="分装袋数">{{ quote.bagCount }} 袋</el-descriptions-item>
        </el-descriptions>

        <el-table :data="quote.lines" size="small" border style="margin-top: 14px">
          <el-table-column prop="name" label="补剂" min-width="140" />
          <el-table-column label="制作单用量" width="130">
            <template #default="{ row }">{{ row.requestedAmount }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="实际分装量" width="130">
            <template #default="{ row }">
              <strong>{{ row.packedAmount }} {{ row.unit }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="成本" width="100">
            <template #default="{ row }">{{ row.cost.toFixed(3) }} 元</template>
          </el-table-column>
          <el-table-column label="售价" width="100">
            <template #default="{ row }">{{ row.price.toFixed(2) }} 元</template>
          </el-table-column>
          <el-table-column label="分装效期" width="110">
            <template #default="{ row }">{{ row.shelfLifeMonths }} 个月</template>
          </el-table-column>
        </el-table>

        <el-alert
          v-for="warning in quote.warnings"
          :key="warning"
          :title="warning"
          type="warning"
          show-icon
          :closable="false"
          style="margin-top: 10px"
        />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  ROUNDING_MODE_LABELS,
  SERVICE_FEE_MODE_LABELS,
  SHIPPING_MODE_LABELS,
  supplementShopApi,
  type IngredientPhysicalFormCode,
  type SupplementCatalogItem,
  type SupplementQuote,
  type SupplementQuoteLineInput,
  type SupplementShopConfig,
} from '@/api/supplementShop';
import { shippingTemplateApi, type ShippingTemplate } from '@/api/shippingTemplates';

const loading = ref(false);
const saving = ref(false);
const quoting = ref(false);
const quoteError = ref('');
const quote = ref<SupplementQuote | null>(null);
const shippingTemplates = ref<ShippingTemplate[]>([]);
const quoteCatalog = ref<SupplementCatalogItem[]>([]);

const form = ref<SupplementShopConfig>({
  enabled: false,
  markupMultiplier: 2,
  serviceFeeMode: 'PER_ORDER',
  serviceFeeAmount: 9.9,
  packagingFeePerBag: 0,
  priceRoundingMode: 'CEIL_TO_0_1',
  minOrderAmount: 0,
  roundUpUsage: true,
  shippingMode: 'FLAT_RATE',
  flatShippingFee: 8,
  shippingTemplateId: null,
  freeShippingThreshold: null,
  powderShelfLifeMonths: 6,
  solidShelfLifeMonths: 9,
  oilShelfLifeMonths: 6,
  minRemainingShelfLifeDays: 90,
  aftersalePolicy: null,
  labelBrandName: '赛文的食堂',
  labelIncludeDesiccantNotice: true,
  updatedAt: null,
});

const quoteLines = ref<
  (SupplementQuoteLineInput & { ingredientId: string })[]
>([
  { ingredientId: '', name: '', unit: '', amount: 0, unitCost: 0, physicalForm: 'POWDER' },
]);

async function load() {
  loading.value = true;
  try {
    const [config, templates, catalog] = await Promise.all([
      supplementShopApi.getConfig(),
      shippingTemplateApi.list(),
      supplementShopApi.catalog(),
    ]);
    form.value = config;
    shippingTemplates.value = templates;
    quoteCatalog.value = catalog.items;
  } finally {
    loading.value = false;
  }
}

function applyCatalogItem(
  row: SupplementQuoteLineInput & { ingredientId: string },
  ingredientId: string,
) {
  const item = quoteCatalog.value.find((entry) => entry.id === ingredientId);
  if (!item) return;
  row.name = item.name;
  row.unit = item.displayUnit;
  row.unitCost = item.unitCost ?? 0;
  row.physicalForm = (item.physicalForm ||
    item.suggestedPhysicalForm ||
    'POWDER') as IngredientPhysicalFormCode;
}

function addLine() {
  quoteLines.value.push({
    ingredientId: '',
    name: '',
    unit: '',
    amount: 0,
    unitCost: 0,
    physicalForm: 'POWDER',
  });
}

async function handleSave() {
  saving.value = true;
  try {
    form.value = await supplementShopApi.updateConfig({
      enabled: form.value.enabled,
      markupMultiplier: form.value.markupMultiplier,
      serviceFeeMode: form.value.serviceFeeMode,
      serviceFeeAmount: form.value.serviceFeeAmount,
      packagingFeePerBag: form.value.packagingFeePerBag,
      priceRoundingMode: form.value.priceRoundingMode,
      minOrderAmount: form.value.minOrderAmount,
      roundUpUsage: form.value.roundUpUsage,
      shippingMode: form.value.shippingMode,
      flatShippingFee: form.value.flatShippingFee,
      shippingTemplateId: form.value.shippingTemplateId,
      freeShippingThreshold: form.value.freeShippingThreshold,
      powderShelfLifeMonths: form.value.powderShelfLifeMonths,
      solidShelfLifeMonths: form.value.solidShelfLifeMonths,
      oilShelfLifeMonths: form.value.oilShelfLifeMonths,
      minRemainingShelfLifeDays: form.value.minRemainingShelfLifeDays,
      aftersalePolicy: form.value.aftersalePolicy,
      labelBrandName: form.value.labelBrandName,
      labelIncludeDesiccantNotice: form.value.labelIncludeDesiccantNotice,
    });
    ElMessage.success('补剂商城配置已保存');
  } finally {
    saving.value = false;
  }
}

async function handleQuote() {
  const lines = quoteLines.value.filter(
    (line) => line.ingredientId && line.amount > 0,
  );
  if (lines.length === 0) {
    ElMessage.warning('请先选择补剂并填写用量');
    return;
  }

  quoting.value = true;
  quoteError.value = '';
  quote.value = null;
  try {
    quote.value = await supplementShopApi.quotePreview({
      lines: lines.map((line) => ({ ...line })),
      totalWeightG: 500,
    });
  } catch (error: any) {
    quoteError.value = error?.message || '试算失败';
  } finally {
    quoting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.supplement-config-page {
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
  max-width: 780px;
}

.form-tip {
  margin-left: 12px;
  font-size: 13px;
  color: #909399;
}

.form-tip.block {
  display: block;
  margin: 6px 0 0;
}

.inline-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: 24px;
  font-size: 13px;
  color: #606266;
}

.quote-card {
  margin-top: 20px;
}

.quote-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}
</style>
