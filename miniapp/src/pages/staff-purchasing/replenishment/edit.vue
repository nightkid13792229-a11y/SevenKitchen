<template>
  <view class="edit-page">
    <view v-if="loading" class="state-card">
      <text>正在加载...</text>
    </view>

    <view v-else-if="errorText" class="state-card">
      <text class="state-title">{{ errorText }}</text>
      <button class="retry-btn" @tap="load">重试</button>
    </view>

    <template v-else-if="record">
      <view v-if="lockedReason" class="notice-card">
        <text>{{ lockedReason }}</text>
      </view>
      <button v-if="lockedReason" class="back-btn" @tap="goBack">回详情</button>

      <view class="section-card">
        <view class="section-head">
          <text class="section-title">商品明细</text>
          <text class="section-count">{{ items.length }} 项</text>
        </view>

        <view v-for="item in items" :key="item.itemId" class="item-card">
          <view class="item-head">
            <text class="item-name">{{ item.name }}</text>
            <text class="item-unit">单位：{{ item.unit }}</text>
          </view>
          <view class="item-fields">
            <view class="field">
              <text class="field-label">数量</text>
              <input
                v-model="item.quantity"
                type="digit"
                class="field-input"
                placeholder="数量"
                :disabled="!!lockedReason"
              />
            </view>
            <view class="field">
              <text class="field-label">单价</text>
              <input
                v-model="item.unitPrice"
                type="digit"
                class="field-input"
                placeholder="单价"
                :disabled="!!lockedReason"
              />
            </view>
          </view>
          <view class="item-foot">
            <text class="item-total">小计 ¥{{ itemLineTotal(item) }}</text>
            <text v-if="!lockedReason" class="item-delete" @tap="deleteItem(item)">删掉这一项</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-head">
          <text class="section-title">订单金额</text>
        </view>
        <view class="field-row">
          <text class="field-label">订单实付</text>
          <input v-model="form.paidAmount" type="digit" class="field-input" :disabled="!!lockedReason" />
        </view>
        <view class="field-row">
          <text class="field-label">运费</text>
          <input v-model="form.shippingFee" type="digit" class="field-input" :disabled="!!lockedReason" />
        </view>
        <view class="field-row">
          <text class="field-label">包装费</text>
          <input v-model="form.packagingFee" type="digit" class="field-input" :disabled="!!lockedReason" />
        </view>
        <view class="summary-row">
          <text>商品合计</text>
          <text>¥{{ goodsTotal }}</text>
        </view>
        <view v-if="personalAmount > 0" class="summary-row muted">
          <text>含个人（不报销）</text>
          <text>¥{{ money(personalAmount) }}</text>
        </view>
        <view class="summary-row total">
          <text>本次报销</text>
          <text class="summary-amount">¥{{ reimbursementAmount }}</text>
        </view>
      </view>

      <button
        v-if="!lockedReason"
        class="save-btn"
        :loading="saving"
        :disabled="saving"
        @tap="save"
      >
        {{ saving ? '保存中...' : '保存修改' }}
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  deleteReplenishmentItem,
  getReplenishmentRecord,
  updateReplenishmentRecord,
} from '../api/purchasing';

const recordId = ref('');
const record = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const errorText = ref('');

const items = ref<
  Array<{
    itemId: string;
    name: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    /** 打开页面时的原值：没改过的行按原总额回写，避免单价四舍五入后金额漂移 */
    originalQuantity: string;
    originalUnitPrice: string;
    originalTotal: number;
  }>
>([]);

const form = ref({
  paidAmount: '',
  shippingFee: '',
  packagingFee: '',
});

const lockedReason = computed(() => {
  if (!record.value) return '';
  if (record.value.voidedAt) return '已作废，不能修改。';
  if (record.value.reimbursementId) return '已提交报销，驳回或撤回后才能改。';
  if (record.value.arrivedAt) return '已到货，先撤销到货再改。';
  return '';
});

const money = (value: unknown) => Number(value || 0).toFixed(2);

const itemLineTotal = (item: { quantity: string; unitPrice: string }) => {
  const quantity = Number(item.quantity);
  const price = Number(item.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return '0.00';
  return (quantity * price).toFixed(2);
};

const reimbursementAmount = computed(() => {
  const paid = Number(form.value.paidAmount);
  const personal = Number(record.value?.personalAmount ?? 0);
  if (!Number.isFinite(paid)) return '0.00';
  return Math.max(paid - personal, 0).toFixed(2);
});

const personalAmount = computed(() => Number(record.value?.personalAmount ?? 0));

const goodsTotal = computed(() =>
  items.value
    .reduce((sum, item) => sum + Number(itemLineTotal(item)), personalAmount.value)
    .toFixed(2),
);

const load = async () => {
  if (!recordId.value) {
    loading.value = false;
    errorText.value = '缺少补货记录 id';
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const res: any = await getReplenishmentRecord(recordId.value);
    if (res?.code !== 0 || !res.data) {
      errorText.value = res?.message || '加载失败';
      return;
    }
    record.value = res.data;
    items.value = (res.data.items || []).map((item: any) => {
      const quantity = Number(item.quantityNeeded ?? 0);
      const total = Number(item.estimatedCost ?? 0);
      const quantityText = String(quantity || '');
      const unitPriceText =
        quantity > 0 ? String(Number((total / quantity).toFixed(2))) : '';
      return {
        itemId: item.id,
        name: item.ingredientName || item.ingredient?.name || '原料',
        unit: item.quantityUnit || item.displayUnit || '',
        quantity: quantityText,
        unitPrice: unitPriceText,
        originalQuantity: quantityText,
        originalUnitPrice: unitPriceText,
        originalTotal: total,
      };
    });
    form.value = {
      paidAmount: String(res.data.paidAmount ?? ''),
      shippingFee: String(res.data.shippingFee ?? ''),
      packagingFee: String(res.data.packagingFee ?? ''),
    };
  } catch (error: any) {
    errorText.value = error?.message || '加载失败';
  } finally {
    loading.value = false;
  }
};

const deleteItem = (item: { itemId: string; name: string }) => {
  if (lockedReason.value) return;
  if (items.value.length <= 1) {
    uni.showModal({
      title: '不能删光',
      content: '至少留一项；整笔不要了请用作废。',
      showCancel: false,
    });
    return;
  }
  uni.showModal({
    title: '删掉这一项？',
    content: `删掉「${item.name}」后，不再计入报销和库存。`,
    confirmColor: '#b4453a',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const response: any = await deleteReplenishmentItem(
          recordId.value,
          item.itemId,
        );
        if (response?.code !== 0) {
          throw new Error(response?.message || '删除失败');
        }
        // 只移除这一行，不整页重拉：别把其它行还没保存的数量/单价改动冲掉
        items.value = items.value.filter((row) => row.itemId !== item.itemId);
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (error: any) {
        uni.showToast({ title: error?.message || '删除失败', icon: 'none' });
      }
    },
  });
};

const save = async () => {
  if (saving.value || lockedReason.value) return;
  if (items.value.length === 0) {
    uni.showModal({
      title: '没有商品',
      content: '至少留一项；整笔不要了请用作废。',
      showCancel: false,
    });
    return;
  }

  const payloadItems = items.value.map((item) => {
    const quantity = Number(item.quantity);
    const untouched =
      item.quantity === item.originalQuantity &&
      item.unitPrice === item.originalUnitPrice &&
      quantity > 0;
    return {
      itemId: item.itemId,
      quantity,
      // 没改过的行用「原总额 ÷ 数量」回写，避免 12.4633 被显示成 12.46 后总额差几分钱
      unitPrice: untouched
        ? item.originalTotal / quantity
        : Number(item.unitPrice),
      unit: item.unit,
    };
  });
  const invalid = payloadItems.find(
    (item) =>
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0,
  );
  if (invalid) {
    uni.showToast({ title: '请填写有效的数量和单价', icon: 'none' });
    return;
  }

  const paidAmount = Number(form.value.paidAmount);
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
    uni.showToast({ title: '请填写订单实付', icon: 'none' });
    return;
  }

  saving.value = true;
  try {
    const res: any = await updateReplenishmentRecord(recordId.value, {
      items: payloadItems,
      paidAmount,
      shippingFee: Number(form.value.shippingFee) || 0,
      packagingFee: Number(form.value.packagingFee) || 0,
    });
    if (res?.code !== 0) {
      throw new Error(res?.message || '保存失败');
    }
    uni.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  uni.navigateBack();
};

onLoad((options: Record<string, string>) => {
  recordId.value = String(options?.id || '');
  void load();
});
</script>

<style scoped lang="scss">
.edit-page {
  min-height: 100vh;
  background: #fbfcf7;
  padding: 24rpx 28rpx 80rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.state-card {
  padding: 60rpx 24rpx;
  background: #ffffff;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.state-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #3c3a32;
}

.retry-btn {
  width: 200rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 26rpx;
}

.back-btn {
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 16rpx;
  background: #f1efe5;
  color: #1e3a2f;
  font-size: 26rpx;
  font-weight: 600;
}

.notice-card {
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background: #fff8e6;
  border: 1rpx solid #f0dca8;
  font-size: 24rpx;
  color: #7a5c28;
  line-height: 1.6;
}

.section-card {
  padding: 24rpx 26rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid #e7e3d6;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.section-count {
  font-size: 24rpx;
  color: #6b6653;
}

.item-card {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #f0eee5;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.item-card:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.item-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #3c3a32;
}

.item-unit {
  font-size: 24rpx;
  color: #6b6653;
}

.item-fields {
  display: flex;
  gap: 16rpx;
}

.field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.field-label {
  font-size: 24rpx;
  color: #6b6653;
}

.field-input {
  height: 80rpx;
  padding: 0 16rpx;
  border-radius: 10rpx;
  background: #f7f5ec;
  font-size: 28rpx;
  color: #3c3a32;
}

.item-total {
  font-size: 24rpx;
  color: #6b6653;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 12rpx 0;
}

.field-row .field-label {
  font-size: 26rpx;
  color: #3c3a32;
}

.field-row .field-input {
  width: 240rpx;
  text-align: right;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 26rpx;
  color: #3c3a32;
  padding: 8rpx 0;
}

.summary-row.muted {
  font-size: 24rpx;
  color: #6b6653;
}

.summary-row.total {
  margin-top: 8rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f0eee5;
  font-weight: 600;
}

.summary-amount {
  font-weight: 800;
  color: #1e3a2f;
}

.save-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 16rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 30rpx;
  font-weight: 700;
}

.item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.item-delete {
  font-size: 24rpx;
  color: #b4453a;
  padding: 4rpx 0;
}
</style>
