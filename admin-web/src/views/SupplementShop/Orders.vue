<template>
  <div class="supplement-orders-page">
    <div class="page-header">
      <div>
        <h2>补剂订单</h2>
        <p class="page-desc">
          补剂是<strong>独立发货</strong>的：确认收款 → 分装（填原瓶到期日，系统自动算标签效期）→ 填快递单号发货。
        </p>
      </div>
      <el-button :loading="loading" @click="loadAll">刷新</el-button>
    </div>

    <el-tabs v-model="activeStatus" @tab-change="loadOrders">
      <el-tab-pane
        v-for="tab in statusTabs"
        :key="tab.value"
        :name="tab.value"
      >
        <template #label>
          <span>
            {{ tab.label }}
            <el-badge
              v-if="counts[tab.value]"
              :value="counts[tab.value]"
              type="primary"
              class="tab-badge"
            />
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="订单号 / 收件人 / 手机号"
          clearable
          style="width: 260px"
          @keyup.enter="loadOrders"
          @clear="loadOrders"
        />
        <el-button type="primary" @click="loadOrders">查询</el-button>
        <span class="toolbar-tip">共 {{ total }} 单</span>
      </div>

      <el-table :data="orders" v-loading="loading" border stripe size="small">
        <el-table-column prop="orderNo" label="订单号" width="160" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="SUPPLEMENT_ORDER_STATUS_TYPES[row.status]" size="small">
              {{ SUPPLEMENT_ORDER_STATUS_LABELS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="补剂" min-width="220">
          <template #default="{ row }">
            <div v-for="item in row.items" :key="item.id" class="item-line">
              {{ item.name }}
              <span class="muted">{{ item.packedAmount }}{{ item.unit }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="袋数" width="70" align="center">
          <template #default="{ row }">{{ row.bagCount }}</template>
        </el-table-column>
        <el-table-column label="实付" width="90" align="right">
          <template #default="{ row }">{{ row.amountTotal.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="收件人" min-width="180">
          <template #default="{ row }">
            <div>{{ row.receiverName }} {{ row.receiverPhone }}</div>
            <div class="muted">{{ row.receiverRegion }}{{ row.receiverDetail }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来源" min-width="150">
          <template #default="{ row }">
            <div class="muted">{{ row.recipeName || '—' }}</div>
            <div class="muted">{{ row.dogName || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="150">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PENDING_PAYMENT'"
              link
              type="primary"
              size="small"
              @click="handleConfirmPayment(row)"
            >
              确认收款
            </el-button>
            <el-button
              v-if="['PAID', 'PACKING'].includes(row.status)"
              link
              type="primary"
              size="small"
              @click="openPack(row)"
            >
              分装工单
            </el-button>
            <el-button
              v-if="row.status === 'PACKED'"
              link
              type="primary"
              size="small"
              @click="openShip(row)"
            >
              发货
            </el-button>
            <el-button
              v-if="['PACKED', 'SHIPPED', 'COMPLETED'].includes(row.status)"
              link
              type="primary"
              size="small"
              @click="openLabels(row)"
            >
              打印标签
            </el-button>
            <el-button link size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="['PENDING_PAYMENT', 'PAID'].includes(row.status)"
              link
              type="danger"
              size="small"
              @click="handleCancel(row)"
            >
              取消
            </el-button>
            <el-button
              v-if="!['CANCELLED', 'AFTERSALE'].includes(row.status)"
              link
              type="warning"
              size="small"
              @click="openAftersale(row)"
            >
              售后
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPageChange"
      />
    </el-card>

    <!-- 分装工单 -->
    <el-drawer v-model="packVisible" title="分装工单" size="760px">
      <template v-if="current">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="订单号">{{ current.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="袋数">{{ current.bagCount }} 袋</el-descriptions-item>
          <el-descriptions-item label="收件人">
            {{ current.receiverName }} {{ current.receiverPhone }}
          </el-descriptions-item>
          <el-descriptions-item label="地址">
            {{ current.receiverRegion }}{{ current.receiverDetail }}
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="pack-tip"
          title="标签效期 = min(原瓶到期日, 分装日 + 该形态的效期系数)。粉剂 6 个月，片剂/胶囊 9 个月。"
        />

        <el-table :data="packRows" border size="small" class="pack-table">
          <el-table-column label="补剂" min-width="130">
            <template #default="{ row }">
              <div>{{ row.name }}</div>
              <div class="muted">{{ formatForm(row.physicalForm) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="分装量" width="100" align="center">
            <template #default="{ row }">
              <strong>{{ row.packedAmount }}{{ row.unit }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="批号（可选）" width="140">
            <template #default="{ row }">
              <el-input v-model="row.batchNo" size="small" placeholder="可留空" />
            </template>
          </el-table-column>
          <el-table-column label="原瓶到期日" width="160">
            <template #default="{ row }">
              <el-date-picker
                v-model="row.sourceExpiryDate"
                type="date"
                size="small"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="标签效期" width="120" align="center">
            <template #default="{ row }">
              <strong :class="{ warn: !row.sourceExpiryDate }">
                {{ previewPackedExpiry(row.sourceExpiryDate, row.shelfLifeMonths) }}
              </strong>
            </template>
          </el-table-column>
        </el-table>

        <div class="pack-actions">
          <el-button type="primary" :loading="submitting" @click="submitPack">
            完成分装（{{ packRows.filter((r) => r.sourceExpiryDate).length }}/{{ packRows.length }}）
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 发货 -->
    <el-dialog v-model="shipVisible" title="填写快递单号" width="460px">
      <el-form label-width="90px">
        <el-form-item label="快递单号">
          <el-input v-model="shipForm.trackingNumber" placeholder="必填" />
        </el-form-item>
        <el-form-item label="快递公司">
          <el-select v-model="shipForm.carrierCode" placeholder="可选" clearable style="width: 100%">
            <el-option label="圆通 YTO" value="YTO" />
            <el-option label="中通 ZTO" value="ZTO" />
            <el-option label="申通 STO" value="STO" />
            <el-option label="韵达 YD" value="YD" />
            <el-option label="邮政 EMS" value="EMS" />
            <el-option label="顺丰 SF" value="SF" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitShip">确认发货</el-button>
      </template>
    </el-dialog>

    <!-- 售后 -->
    <el-dialog v-model="aftersaleVisible" title="登记售后" width="460px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="缺货 / 发错 / 破损 / 量不对，一律无理由退款或免费补发"
        class="pack-tip"
      />
      <el-form label-width="90px">
        <el-form-item label="处理方式">
          <el-radio-group v-model="aftersaleForm.type">
            <el-radio label="REFUND">线上退款（微信原路退回）</el-radio>
            <el-radio label="RESHIP">免费补发</el-radio>
            <el-radio label="RECORD_ONLY">仅登记（线下处理）</el-radio>
          </el-radio-group>
          <div class="form-tip block">
            <template v-if="aftersaleForm.type === 'REFUND'">
              直接调用微信退款，需要后台「支付配置」已开启线上退款。
              非微信支付的订单请改用「仅登记」，到微信商户后台手工退款。
            </template>
            <template v-else-if="aftersaleForm.type === 'RESHIP'">
              会按原单原样生成一张 0 元补发单，直接进入待分装，原单标记为售后中。
            </template>
            <template v-else>
              只把订单标记为售后中并留痕，资金动作由你线下处理。
            </template>
          </div>
        </el-form-item>
        <el-form-item label="退款金额" v-if="aftersaleForm.type === 'REFUND'">
          <el-input-number
            v-model="aftersaleForm.amount"
            :min="0.01"
            :precision="2"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">元。留空或等于订单金额即全额退款</span>
        </el-form-item>
        <el-form-item label="原因">
          <el-input
            v-model="aftersaleForm.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="例如：破损"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="aftersaleVisible = false">取消</el-button>
        <el-button type="warning" :loading="submitting" @click="submitAftersale">
          {{ aftersaleForm.type === 'REFUND' ? '确认退款' : aftersaleForm.type === 'RESHIP' ? '生成补发单' : '登记售后' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="订单详情" size="620px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="订单号">{{ current.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ SUPPLEMENT_ORDER_STATUS_LABELS[current.status] || current.status }}
          </el-descriptions-item>
          <el-descriptions-item label="金额">
            补剂 {{ current.amountSupplement.toFixed(2) }} + 服务费
            {{ current.amountServiceFee.toFixed(2) }} + 包材
            {{ current.amountPackaging.toFixed(2) }} + 运费
            {{ current.amountShipping.toFixed(2) }} = 实付
            <strong>{{ current.amountTotal.toFixed(2) }} 元</strong>
          </el-descriptions-item>
          <el-descriptions-item label="运费说明">
            {{ current.shippingDescription || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="收货信息">
            {{ current.receiverName }} {{ current.receiverPhone }}<br />
            {{ current.receiverRegion }}{{ current.receiverDetail }}
          </el-descriptions-item>
          <el-descriptions-item label="快递">
            {{ current.trackingNumber || '—' }} {{ current.carrierCode || '' }}
          </el-descriptions-item>
          <el-descriptions-item label="支付方式">
            {{ formatPaymentMethod(current.paymentMethod) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="current.aftersaleType" label="售后">
            {{ current.aftersaleType === 'REFUND' ? '退款' : '免费补发' }} ·
            {{ current.aftersaleReason }}
          </el-descriptions-item>
          <el-descriptions-item v-if="current.refundStatus" label="退款状态">
            {{ REFUND_STATUS_LABELS[current.refundStatus] || current.refundStatus }}
            <template v-if="current.refundAmount">
              · ¥{{ current.refundAmount.toFixed(2) }}
            </template>
            <template v-if="current.refundedAt">
              · {{ formatTime(current.refundedAt) }}
            </template>
          </el-descriptions-item>
          <el-descriptions-item v-if="current.reshipFromOrderNo" label="补发来源">
            原单 {{ current.reshipFromOrderNo }}
          </el-descriptions-item>
          <el-descriptions-item v-if="current.remark" label="备注">
            {{ current.remark }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="current.items" border size="small" class="pack-table">
          <el-table-column prop="name" label="补剂" min-width="120" />
          <el-table-column label="分装量" width="100" align="center">
            <template #default="{ row }">{{ row.packedAmount }}{{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="售价" width="80" align="right">
            <template #default="{ row }">{{ row.price.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="批号" width="120">
            <template #default="{ row }">{{ row.batchNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="标签效期" width="120">
            <template #default="{ row }">
              {{ row.packedExpiryDate ? row.packedExpiryDate.slice(0, 10) : '—' }}
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  REFUND_STATUS_LABELS,
  SUPPLEMENT_ORDER_STATUS_LABELS,
  SUPPLEMENT_ORDER_STATUS_TYPES,
  PHYSICAL_FORM_LABELS,
  previewPackedExpiry,
  supplementOrderApi,
  type IngredientPhysicalFormCode,
  type SupplementOrder,
} from '@/api/supplementShop';

interface PackRow {
  itemId: string;
  name: string;
  unit: string;
  packedAmount: number;
  physicalForm: IngredientPhysicalFormCode | null;
  shelfLifeMonths: number;
  batchNo: string;
  sourceExpiryDate: string;
}

const router = useRouter();

const statusTabs = [
  { label: '待付款', value: 'PENDING_PAYMENT' },
  { label: '待分装', value: 'PAID' },
  { label: '待发货', value: 'PACKED' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '售后中', value: 'AFTERSALE' },
  { label: '全部', value: '' },
];

const loading = ref(false);
const submitting = ref(false);
const orders = ref<SupplementOrder[]>([]);
const counts = ref<Record<string, number>>({});
const activeStatus = ref('PAID');
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const current = ref<SupplementOrder | null>(null);
const packVisible = ref(false);
const packRows = ref<PackRow[]>([]);
const shipVisible = ref(false);
const shipForm = ref({ trackingNumber: '', carrierCode: '' });
const aftersaleVisible = ref(false);
const aftersaleForm = ref<{
  type: 'REFUND' | 'RESHIP' | 'RECORD_ONLY';
  reason: string;
  amount: number | undefined;
}>({
  type: 'REFUND',
  reason: '',
  amount: undefined,
});
const detailVisible = ref(false);

async function loadOrders() {
  loading.value = true;
  try {
    const res = await supplementOrderApi.list({
      status: activeStatus.value || undefined,
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    orders.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadCounts() {
  counts.value = await supplementOrderApi.summary();
}

async function loadAll() {
  await Promise.all([loadOrders(), loadCounts()]);
}

function onPageChange(next: number) {
  page.value = next;
  void loadOrders();
}

function formatTime(value: string): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '—';
}

function formatPaymentMethod(method: string | null): string {
  if (method === 'WECHAT_PAY') return '微信支付';
  if (method === 'MANUAL') return '人工确认收款';
  if (method === 'RESHIP') return '免费补发（无需付款）';
  return method || '—';
}

function formatForm(code: IngredientPhysicalFormCode | null): string {
  if (!code) return '—';
  return PHYSICAL_FORM_LABELS[code] || code;
}

function openPack(order: SupplementOrder) {
  current.value = order;
  packRows.value = order.items.map((item) => ({
    itemId: item.id,
    name: item.name,
    unit: item.unit,
    packedAmount: item.packedAmount,
    physicalForm: item.physicalForm,
    shelfLifeMonths: item.shelfLifeMonths,
    batchNo: item.batchNo || '',
    sourceExpiryDate: item.sourceExpiryDate
      ? item.sourceExpiryDate.slice(0, 10)
      : '',
  }));
  packVisible.value = true;
}

async function submitPack() {
  const rows = packRows.value.filter((row) => row.sourceExpiryDate);
  if (rows.length !== packRows.value.length) {
    ElMessage.warning('还有袋子没填原瓶到期日');
    return;
  }

  submitting.value = true;
  try {
    const updated = await supplementOrderApi.pack(current.value!.id, {
      items: rows.map((row) => ({
        itemId: row.itemId,
        batchNo: row.batchNo.trim() || undefined,
        sourceExpiryDate: row.sourceExpiryDate,
      })),
    });
    packVisible.value = false;
    current.value = updated;
    await loadAll();

    try {
      await ElMessageBox.confirm(
        '分装完成！现在打印分装标签贴到每一袋上吗？',
        '下一步：打印标签',
        { type: 'success', confirmButtonText: '打印标签', cancelButtonText: '稍后再说' },
      );
      router.push(`/supplement-shop/orders/${updated.id}/labels`);
    } catch {
      ElMessage.success('分装完成，可以发货了');
    }
  } finally {
    submitting.value = false;
  }
}

function openShip(order: SupplementOrder) {
  current.value = order;
  shipForm.value = { trackingNumber: '', carrierCode: '' };
  shipVisible.value = true;
}

async function submitShip() {
  if (!shipForm.value.trackingNumber.trim()) {
    ElMessage.warning('请填写快递单号');
    return;
  }

  submitting.value = true;
  try {
    await supplementOrderApi.ship(current.value!.id, {
      trackingNumber: shipForm.value.trackingNumber.trim(),
      carrierCode: shipForm.value.carrierCode || undefined,
    });
    ElMessage.success('已发货');
    shipVisible.value = false;
    await loadAll();
  } finally {
    submitting.value = false;
  }
}

async function handleConfirmPayment(order: SupplementOrder) {
  try {
    await ElMessageBox.confirm(
      `确认已收到「${order.orderNo}」的 ${order.amountTotal.toFixed(2)} 元？确认后即可开始分装。`,
      '确认收款',
      { type: 'warning', confirmButtonText: '确认收款', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  await supplementOrderApi.confirmPayment(order.id, {});
  ElMessage.success('已确认收款');
  await loadAll();
}

async function handleCancel(order: SupplementOrder) {
  try {
    const { value } = await ElMessageBox.prompt('请填写取消原因', '取消订单', {
      inputPlaceholder: '例如：用户改需求',
      confirmButtonText: '确认取消',
      cancelButtonText: '返回',
    });
    await supplementOrderApi.cancel(order.id, { reason: value });
    ElMessage.success('订单已取消');
    await loadAll();
  } catch {
    /* 用户取消操作 */
  }
}

function openAftersale(order: SupplementOrder) {
  current.value = order;
  aftersaleForm.value = { type: 'REFUND', reason: '', amount: undefined };
  aftersaleVisible.value = true;
}

async function submitAftersale() {
  const reason = aftersaleForm.value.reason.trim();
  if (!reason) {
    ElMessage.warning('请填写售后原因');
    return;
  }

  const orderId = current.value!.id;
  submitting.value = true;
  try {
    if (aftersaleForm.value.type === 'REFUND') {
      const result = await supplementOrderApi.refund(orderId, {
        amount: aftersaleForm.value.amount,
        reason,
      });
      ElMessage.success(
        result.reused
          ? `该订单已有退款记录（${result.status}），未重复发起`
          : `退款已发起：${REFUND_STATUS_LABELS[result.status] || result.status} ¥${result.amount.toFixed(2)}`,
      );
    } else if (aftersaleForm.value.type === 'RESHIP') {
      const result = await supplementOrderApi.reship(orderId, { reason });
      ElMessage.success(`已生成补发单 ${result.reship.orderNo}（0 元，待分装）`);
    } else {
      await supplementOrderApi.aftersale(orderId, { type: 'REFUND', reason });
      ElMessage.success('已登记售后');
    }

    aftersaleVisible.value = false;
    await loadAll();
  } finally {
    submitting.value = false;
  }
}

function openLabels(order: SupplementOrder) {
  router.push(`/supplement-shop/orders/${order.id}/labels`);
}

function openDetail(order: SupplementOrder) {
  current.value = order;
  detailVisible.value = true;
}

onMounted(loadAll);
</script>

<style scoped>
.supplement-orders-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
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
  max-width: 760px;
}

.tab-badge {
  margin-left: 6px;
  vertical-align: middle;
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

.muted {
  font-size: 12px;
  color: #909399;
}

.item-line {
  line-height: 1.5;
}

.pager {
  margin-top: 14px;
  justify-content: flex-end;
}

.pack-tip {
  margin: 14px 0;
}

.pack-table {
  margin-top: 8px;
}

.pack-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}

.warn {
  color: #e6a23c;
}
</style>
