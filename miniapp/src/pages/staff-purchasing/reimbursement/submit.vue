<template>
  <view class="submit-reimbursement-page">
    <view class="page-header">
      <text class="title">{{ resubmitId ? '重新提交报销' : '申请报销' }}</text>
      <text class="subtitle">{{ stepSubtitle }}</text>
    </view>

    <view class="step-indicator">
      <view
        v-for="step in visibleSteps"
        :key="step.value"
        class="step-dot"
        :class="{ active: step.value === currentStep, done: isStepDone(step.value) }"
      >
        <text class="dot-index">{{ step.index }}</text>
        <text class="dot-label">{{ step.label }}</text>
      </view>
    </view>

    <view v-if="currentStep === 'TYPE'" class="section">
      <text class="section-title">选择报销类型</text>
      <view class="type-options">
        <view
          v-for="option in reimbursementFlowTypeOptions"
          :key="option.value"
          class="type-option"
          :class="{ selected: flowType === option.value }"
          @tap="selectFlowType(option.value)"
        >
          <view class="type-copy">
            <text class="type-title">{{ option.label }}</text>
            <text class="type-desc">{{ option.description }}</text>
          </view>
          <text class="type-check">{{ flowType === option.value ? '已选' : '选择' }}</text>
        </view>
      </view>
      <view class="notice-strip">
        <text>买了食材、补剂、包材，走采购报销；房租、水电、工资/人工等日常支出，走经营费用报销。</text>
      </view>
    </view>

    <view v-if="currentStep === 'PURCHASE_DETAILS'" class="section">
      <view class="section-head">
        <text class="section-title">采购报销</text>
        <text class="section-total">已选 ¥{{ purchaseListsTotalText }}</text>
      </view>

      <view class="filter-tabs">
        <view
          v-for="filter in purchaseListFilters"
          :key="filter.value"
          class="filter-tab"
          :class="{ active: activePurchaseFilter === filter.value }"
          @tap="activePurchaseFilter = filter.value"
        >
          <text>{{ filter.label }}</text>
        </view>
      </view>

      <view v-if="filteredPurchaseLists.length === 0" class="empty-state">
        <text class="empty-title">暂无可选采购清单</text>
        <text class="empty-desc">包材采购请先创建包材补货清单，再回来关联报销。</text>
      </view>

      <view v-else class="purchase-list">
        <view
          v-for="list in filteredPurchaseLists"
          :key="list.id"
          class="purchase-item"
          :class="{ selected: selectedListIds.includes(list.id) }"
          @tap="togglePurchaseList(list.id)"
        >
          <view class="purchase-main">
            <view class="purchase-title-row">
              <text class="purchase-kind">{{ getPurchaseListKindLabel(list) }}</text>
              <text class="purchase-date">{{ formatDate(list.targetDate) }}</text>
            </view>
            <text class="purchase-summary">{{ getPurchaseListSummary(list) }}</text>
            <text class="purchase-meta">{{ list.itemCount || getPurchaseItems(list).length || 0 }} 项 · ¥{{ getPurchaseListAmount(list).toFixed(2) }}</text>
          </view>
          <text class="select-state">{{ selectedListIds.includes(list.id) ? '已选' : '选择' }}</text>
        </view>
      </view>

      <view class="fee-grid">
        <view class="field">
          <text class="field-label">采购相关运费</text>
          <view class="money-input">
            <text>¥</text>
            <input v-model="platformShippingFee" type="digit" placeholder="0.00" />
          </view>
        </view>
        <view class="field">
          <text class="field-label">采购相关打包费</text>
          <view class="money-input">
            <text>¥</text>
            <input v-model="platformPackagingFee" type="digit" placeholder="0.00" />
          </view>
        </view>
      </view>

      <view v-if="!hasPackagingLists" class="notice-strip">
        <text>包材清单会进入采购报销，不放在经营费用里。没有包材清单时，请先到补货里创建包材补货清单。</text>
      </view>
    </view>

    <view v-if="currentStep === 'OPERATING_DETAILS'" class="section">
      <view class="section-head">
        <text class="section-title">经营费用报销</text>
        <text class="section-total">合计 ¥{{ operatingTotalText }}</text>
      </view>

      <view class="category-row">
        <view
          v-for="option in customFeeCategoryOptions"
          :key="option.value"
          class="category-chip"
          @tap="selectCustomFeeCategory(0, option.value)"
        >
          <text>{{ option.label }}</text>
        </view>
      </view>

      <view class="expense-list">
        <view
          v-for="(fee, index) in customFees"
          :key="index"
          class="expense-item"
        >
          <view class="expense-head">
            <text class="expense-title">{{ index === 0 ? '费用 1' : `费用 ${index + 1}` }}</text>
            <text
              v-if="index > 0"
              class="remove-link"
              @tap="deleteCustomFee(index)"
            >
              删除
            </text>
          </view>
          <view class="category-row compact">
            <view
              v-for="option in customFeeCategoryOptions"
              :key="option.value"
              class="category-chip"
              :class="{ active: fee.category === option.value }"
              @tap="selectCustomFeeCategory(index, option.value)"
            >
              <text>{{ option.label }}</text>
            </view>
          </view>
          <input
            v-model="fee.description"
            class="text-input"
            placeholder="说明，例如 6月房租、临时工具"
          />
          <view class="money-input">
            <text>¥</text>
            <input v-model="fee.amount" type="digit" placeholder="0.00" />
          </view>
        </view>
      </view>

      <button class="ghost-btn" @tap="addCustomFee">添加一项费用</button>
      <view class="notice-strip">
        <text>员工只填写实际发生的费用和凭证；是否分摊、分摊周期和成本归属由管理员处理。</text>
      </view>
    </view>

    <view v-if="currentStep === 'RECEIPTS'" class="section">
      <view class="section-head">
        <text class="section-title">上传支付凭证</text>
        <text class="section-total">{{ receiptUrls.length }} 张</text>
      </view>
      <view class="notice-strip">
        <text>凭证需要看清金额和支付时间，可上传转账截图、支付记录或发票照片。</text>
      </view>

      <view class="photo-grid">
        <view
          v-for="(photo, index) in receiptUrls"
          :key="`${photo.url}-${index}`"
          class="photo-item"
        >
          <image
            :src="photo.url"
            mode="aspectFill"
            @tap="previewPhoto(index)"
            @error="handleImageError(index)"
          />
          <view class="delete-photo" @tap.stop="deletePhoto(index)">
            <text>删除</text>
          </view>
        </view>
        <view class="upload-tile" @tap="uploadPhoto">
          <text class="upload-plus">+</text>
          <text>添加凭证</text>
        </view>
      </view>
    </view>

    <view v-if="currentStep === 'CONFIRM'" class="section">
      <text class="section-title">确认提交</text>
      <view class="summary-block">
        <view class="summary-row">
          <text class="label">报销类型</text>
          <text class="value">{{ flowTypeLabel }}</text>
        </view>
        <view class="summary-row">
          <text class="label">支付凭证</text>
          <text class="value">{{ receiptUrls.length }} 张</text>
        </view>
        <view class="summary-row total">
          <text class="label">报销合计</text>
          <text class="value">¥{{ totalReimbursementAmount }}</text>
        </view>
      </view>

      <view v-if="flowType === 'PURCHASE'" class="confirm-list">
        <view
          v-for="list in selectedPurchaseLists"
          :key="list.id"
          class="confirm-row"
        >
          <text>{{ getPurchaseListKindLabel(list) }} · {{ formatDate(list.targetDate) }}</text>
          <text>¥{{ getPurchaseListAmount(list).toFixed(2) }}</text>
        </view>
        <view v-if="shippingFeeAmount > 0" class="confirm-row">
          <text>采购相关运费</text>
          <text>¥{{ shippingFeeAmount.toFixed(2) }}</text>
        </view>
        <view v-if="packagingFeeAmount > 0" class="confirm-row">
          <text>采购相关打包费</text>
          <text>¥{{ packagingFeeAmount.toFixed(2) }}</text>
        </view>
      </view>

      <view v-else class="confirm-list">
        <view
          v-for="(fee, index) in normalizedOperatingFees"
          :key="index"
          class="confirm-row"
        >
          <text>{{ getReimbursementCustomFeeCategoryLabel(fee.category) }} · {{ fee.description }}</text>
          <text>¥{{ fee.amount.toFixed(2) }}</text>
        </view>
      </view>

      <view class="notice-strip">
        <text>提交后进入管理员处理。如果金额和凭证时间不一致，管理员会要求补充说明。</text>
      </view>
    </view>

    <view v-if="currentStep === 'SUCCESS'" class="section success-section">
      <text class="success-title">提交成功</text>
      <text v-if="lastSubmittedReimbursement?.claimNumber" class="success-number">
        {{ lastSubmittedReimbursement.claimNumber }}
      </text>
      <text class="success-amount">¥{{ totalReimbursementAmount }}</text>
      <text class="success-desc">当前状态：待报销。管理员处理后会更新状态。</text>
      <view class="success-actions">
        <button
          v-if="lastSubmittedReimbursement?.id"
          class="primary-btn"
          @tap="goToSubmittedDetail"
        >
          查看详情
        </button>
        <button class="ghost-btn" @tap="goToList">返回列表</button>
      </view>
    </view>

    <view v-if="currentStep !== 'SUCCESS'" class="bottom-actions">
      <button v-if="canGoBack" class="ghost-btn" @tap="goBack">上一步</button>
      <button
        v-if="currentStep !== 'CONFIRM'"
        class="primary-btn"
        @tap="goNext"
      >
        下一步
      </button>
      <button
        v-else
        class="primary-btn"
        :loading="submitting"
        :disabled="submitting"
        @tap="submitReimbursement"
      >
        {{ submitting ? '提交中...' : '确认提交' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  deleteReceiptPhoto,
  getPurchaseLists,
  getReimbursementDetail,
  resubmitReimbursement as resubmitReimbursementApi,
  submitReimbursement as submitReimbursementApi,
  uploadReceiptPhoto,
} from '../api/purchasing';
import {
  getReimbursementCustomFeeCategoryLabel,
  inferReimbursementCustomFeeCategory,
  reimbursementCustomFeeCategoryOptions,
  reimbursementFlowTypeOptions,
  type ReimbursementCustomFeeCategory,
} from '../constants/reimbursement';
import {
  calculateReimbursementTotal,
  getPurchaseListKindLabel,
  isPackagingPurchaseList,
  normalizeOperatingExpenseFees,
  validateReimbursementStep,
  type ReimbursementFlowStep,
  type ReimbursementFlowType,
} from './form-state';

interface CustomFee {
  category?: ReimbursementCustomFeeCategory;
  description: string;
  amount: string;
}

interface ReceiptPhoto {
  url: string;
  key: string;
}

type PurchaseFilter = 'ALL' | 'ORDER_DEMAND' | 'STOCK_REPLENISHMENT' | 'PACKAGING';

const completedPurchaseLists = ref<any[]>([]);
const selectedListIds = ref<string[]>([]);
const receiptUrls = ref<ReceiptPhoto[]>([]);
const platformShippingFee = ref('');
const platformPackagingFee = ref('');
const customFees = ref<CustomFee[]>([
  { category: 'RENT', description: '', amount: '' },
]);
const submitting = ref(false);
const flowType = ref<ReimbursementFlowType | ''>('');
const currentStep = ref<ReimbursementFlowStep>('TYPE');
const activePurchaseFilter = ref<PurchaseFilter>('ALL');
const resubmitId = ref('');
const lastSubmittedReimbursement = ref<any | null>(null);

const purchaseListFilters: Array<{ label: string; value: PurchaseFilter }> = [
  { label: '全部', value: 'ALL' },
  { label: '日采', value: 'ORDER_DEMAND' },
  { label: '补货', value: 'STOCK_REPLENISHMENT' },
  { label: '包材', value: 'PACKAGING' },
];

const visibleSteps = computed(() => {
  const detailStep =
    flowType.value === 'OPERATING'
      ? { value: 'OPERATING_DETAILS' as const, label: '费用', index: 2 }
      : { value: 'PURCHASE_DETAILS' as const, label: '采购', index: 2 };

  return [
    { value: 'TYPE' as const, label: '类型', index: 1 },
    detailStep,
    { value: 'RECEIPTS' as const, label: '凭证', index: 3 },
    { value: 'CONFIRM' as const, label: '确认', index: 4 },
  ];
});

const stepSubtitle = computed(() => {
  const copy: Record<ReimbursementFlowStep, string> = {
    TYPE: '先选这次报销属于哪类支出',
    PURCHASE_DETAILS: '选择一张或多张已完成采购清单',
    OPERATING_DETAILS: '一次可以添加多项经营费用',
    RECEIPTS: '上传能看清金额和支付时间的凭证',
    CONFIRM: '核对无误后再交给管理员处理',
    SUCCESS: '报销申请已进入管理员处理',
  };

  return copy[currentStep.value];
});

const canGoBack = computed(() => {
  return currentStep.value !== 'TYPE' && currentStep.value !== 'SUCCESS';
});

const selectedPurchaseLists = computed(() => {
  const selected = new Set(selectedListIds.value);
  return completedPurchaseLists.value.filter((list) => selected.has(list.id));
});

const filteredPurchaseLists = computed(() => {
  return completedPurchaseLists.value.filter((list) => {
    if (activePurchaseFilter.value === 'ALL') return true;
    if (activePurchaseFilter.value === 'PACKAGING') {
      return isPackagingPurchaseList(list);
    }
    if (activePurchaseFilter.value === 'STOCK_REPLENISHMENT') {
      return list.kind === 'STOCK_REPLENISHMENT' && !isPackagingPurchaseList(list);
    }
    return list.kind === activePurchaseFilter.value;
  });
});

const hasPackagingLists = computed(() => {
  return completedPurchaseLists.value.some((list) => isPackagingPurchaseList(list));
});

const shippingFeeAmount = computed(() => {
  const parsed = Number(platformShippingFee.value);
  return Number.isFinite(parsed) ? parsed : 0;
});

const packagingFeeAmount = computed(() => {
  const parsed = Number(platformPackagingFee.value);
  return Number.isFinite(parsed) ? parsed : 0;
});

const purchaseListsTotal = computed(() => {
  return selectedPurchaseLists.value.reduce(
    (sum, list) => sum + getPurchaseListAmount(list),
    0,
  );
});

const purchaseListsTotalText = computed(() => {
  return purchaseListsTotal.value.toFixed(2);
});

const normalizedOperatingResult = computed(() =>
  normalizeOperatingExpenseFees(customFees.value),
);

const normalizedOperatingFees = computed(() => {
  return normalizedOperatingResult.value.ok
    ? normalizedOperatingResult.value.fees
    : [];
});

const operatingTotalText = computed(() => {
  return normalizedOperatingFees.value
    .reduce((sum, fee) => sum + fee.amount, 0)
    .toFixed(2);
});

const totalAmount = computed(() => {
  if (flowType.value === 'OPERATING') {
    return calculateReimbursementTotal({
      purchaseLists: [],
      selectedListIds: [],
      platformShippingFee: 0,
      platformPackagingFee: 0,
      customFees: customFees.value,
    });
  }

  return calculateReimbursementTotal({
    purchaseLists: completedPurchaseLists.value,
    selectedListIds: selectedListIds.value,
    platformShippingFee: platformShippingFee.value,
    platformPackagingFee: platformPackagingFee.value,
    customFees: [],
  });
});

const totalReimbursementAmount = computed(() => totalAmount.value.toFixed(2));

const flowTypeLabel = computed(() => {
  return flowType.value === 'OPERATING' ? '经营费用报销' : '采购报销';
});

onLoad((options: any) => {
  initializePage(options || {});
});

const initializePage = async (options: any) => {
  const purchaseListId = options.purchaseListId ? `${options.purchaseListId}` : '';
  resubmitId.value = options.resubmitId ? `${options.resubmitId}` : '';

  if (resubmitId.value) {
    await loadExistingReimbursement(resubmitId.value);
    return;
  }

  if (purchaseListId) {
    flowType.value = 'PURCHASE';
    currentStep.value = 'PURCHASE_DETAILS';
  }

  await loadCompletedPurchaseLists();

  if (purchaseListId) {
    selectLoadedPurchaseList(purchaseListId);
  }
};

const selectLoadedPurchaseList = (purchaseListId: string) => {
  const loaded = completedPurchaseLists.value.some(
    (list) => list.id === purchaseListId,
  );

  if (!loaded) {
    uni.showToast({
      title: '采购清单暂不可报销，请返回清单重试',
      icon: 'none',
    });
    return;
  }

  selectedListIds.value = Array.from(
    new Set([...selectedListIds.value, purchaseListId]),
  );
};

const mergePurchaseLists = (lists: any[]) => {
  const map = new Map<string, any>();
  [...completedPurchaseLists.value, ...lists].forEach((list) => {
    if (list?.id) {
      map.set(list.id, list);
    }
  });
  completedPurchaseLists.value = Array.from(map.values());
};

const loadCompletedPurchaseLists = async (extraLists: any[] = []) => {
  try {
    const res: any = await getPurchaseLists({
      status: 'COMPLETED',
      excludeReimbursed: true,
      pageSize: 100,
    });

    if (res.code === 0) {
      completedPurchaseLists.value = Array.isArray(res.data?.list)
        ? res.data.list
        : [];
      mergePurchaseLists(extraLists);
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
    mergePurchaseLists(extraLists);
  }
};

const loadExistingReimbursement = async (id: string) => {
  try {
    uni.showLoading({ title: '加载中...' });
    const res: any = await getReimbursementDetail(id);

    if (res.code !== 0) {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
      return;
    }

    const data = res.data || {};
    const existingLists = Array.isArray(data.purchaseLists)
      ? data.purchaseLists
      : [];

    flowType.value = existingLists.length > 0 ? 'PURCHASE' : 'OPERATING';
    currentStep.value =
      flowType.value === 'PURCHASE' ? 'PURCHASE_DETAILS' : 'OPERATING_DETAILS';
    selectedListIds.value = existingLists.map((list: any) => list.id);
    platformShippingFee.value = data.platformShippingFee?.toString() || '';
    platformPackagingFee.value = data.platformPackagingFee?.toString() || '';
    customFees.value =
      Array.isArray(data.customFees) && data.customFees.length > 0
        ? data.customFees.map((fee: any) => ({
            category:
              fee.category ||
              inferReimbursementCustomFeeCategory(fee.description) ||
              'OTHER',
            description: fee.description || '',
            amount: fee.amount?.toString() || '',
          }))
        : [{ category: 'RENT', description: '', amount: '' }];
    receiptUrls.value = Array.isArray(data.receiptUrls)
      ? data.receiptUrls.map((url: string, index: number) => ({
          url,
          key: `existing_${index}`,
        }))
      : [];

    await loadCompletedPurchaseLists(existingLists);
  } catch (error: any) {
    console.error('加载报销单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
};

const selectFlowType = (type: ReimbursementFlowType) => {
  flowType.value = type;
  if (type === 'OPERATING' && customFees.value.length === 0) {
    customFees.value = [{ category: 'RENT', description: '', amount: '' }];
  }
};

const goNext = () => {
  const validation = validateCurrentStep();
  if (!validation.ok) {
    uni.showToast({ title: validation.message || '请补充信息', icon: 'none' });
    return;
  }

  if (currentStep.value === 'TYPE') {
    currentStep.value =
      flowType.value === 'OPERATING' ? 'OPERATING_DETAILS' : 'PURCHASE_DETAILS';
    return;
  }

  if (
    currentStep.value === 'PURCHASE_DETAILS' ||
    currentStep.value === 'OPERATING_DETAILS'
  ) {
    currentStep.value = 'RECEIPTS';
    return;
  }

  if (currentStep.value === 'RECEIPTS') {
    currentStep.value = 'CONFIRM';
  }
};

const goBack = () => {
  if (currentStep.value === 'CONFIRM') {
    currentStep.value = 'RECEIPTS';
    return;
  }

  if (currentStep.value === 'RECEIPTS') {
    currentStep.value =
      flowType.value === 'OPERATING' ? 'OPERATING_DETAILS' : 'PURCHASE_DETAILS';
    return;
  }

  currentStep.value = 'TYPE';
};

const validateCurrentStep = () => {
  return validateReimbursementStep({
    currentStep: currentStep.value,
    flowType: flowType.value,
    selectedListIds: selectedListIds.value,
    customFees: customFees.value,
    receiptUrls: receiptUrls.value,
    purchaseLists: completedPurchaseLists.value,
  });
};

const isStepDone = (step: ReimbursementFlowStep) => {
  const order = visibleSteps.value.map((item) => item.value);
  return order.indexOf(step) < order.indexOf(currentStep.value);
};

const togglePurchaseList = (id: string) => {
  if (selectedListIds.value.includes(id)) {
    selectedListIds.value = selectedListIds.value.filter((item) => item !== id);
    return;
  }

  selectedListIds.value = [...selectedListIds.value, id];
};

const getPurchaseItems = (list: any) => {
  return Array.isArray(list?.items) ? list.items : [];
};

const getPurchaseListAmount = (list: any) => {
  const amount = Number(list?.totalActualCost ?? list?.totalEstimatedCost ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const getPurchaseListSummary = (list: any) => {
  const items = getPurchaseItems(list);
  if (items.length === 0) {
    return getPurchaseListKindLabel(list) === '包材' ? '包材清单' : '采购清单';
  }

  return items
    .slice(0, 3)
    .map((item: any) => item.ingredientName || item.name || '采购项')
    .join('、');
};

const addCustomFee = () => {
  customFees.value.push({ category: 'OTHER', description: '', amount: '' });
};

const selectCustomFeeCategory = (
  index: number,
  category: ReimbursementCustomFeeCategory,
) => {
  const fee = customFees.value[index];
  if (!fee) return;

  fee.category = category;
};

const deleteCustomFee = (index: number) => {
  if (index === 0 || customFees.value.length <= 1) return;
  customFees.value.splice(index, 1);
};

const uploadPhoto = () => {
  uni.chooseImage({
    count: Math.max(1, 10 - receiptUrls.value.length),
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const tempFilePaths = res.tempFilePaths || [];
      uni.showLoading({ title: '上传中...' });

      try {
        const results = await Promise.all(
          tempFilePaths.map((filePath) => uploadReceiptPhoto(filePath)),
        );
        const photos = results.map((result: any) => ({
          url: result.data.url,
          key: result.data.key,
        }));
        receiptUrls.value.push(...photos);
        uni.showToast({ title: '上传成功', icon: 'success' });
      } catch (error: any) {
        uni.showToast({ title: error.message || '上传失败', icon: 'none' });
      } finally {
        uni.hideLoading();
      }
    },
  });
};

const deletePhoto = async (index: number) => {
  const photo = receiptUrls.value[index];
  if (!photo) return;

  try {
    if (photo.key && !photo.key.startsWith('existing_')) {
      await deleteReceiptPhoto(photo.key);
    }
    receiptUrls.value.splice(index, 1);
    uni.showToast({ title: '已删除', icon: 'success' });
  } catch (error: any) {
    console.error('删除照片失败', error);
    uni.showToast({ title: error.message || '删除失败', icon: 'none' });
  }
};

const previewPhoto = (index: number) => {
  const urls = receiptUrls.value.map((photo) => photo.url);
  uni.previewImage({
    urls,
    current: urls[index],
  });
};

const handleImageError = (index: number) => {
  console.error('报销凭证图片加载失败', index);
  uni.showToast({ title: '图片加载失败', icon: 'none' });
};

const submitReimbursement = async () => {
  const validation = validateCurrentStep();
  if (!validation.ok) {
    uni.showToast({ title: validation.message || '请补充信息', icon: 'none' });
    return;
  }

  if (totalAmount.value <= 0) {
    uni.showToast({ title: '报销金额需大于0', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const urls = receiptUrls.value.map((photo) => photo.url);
    const payload =
      flowType.value === 'OPERATING'
        ? {
            purchaseListIds: [],
            receiptUrls: urls,
            totalActualCost: totalAmount.value,
            platformShippingFee: 0,
            platformPackagingFee: 0,
            customFees: normalizedOperatingFees.value,
          }
        : {
            purchaseListIds: selectedListIds.value,
            receiptUrls: urls,
            totalActualCost: totalAmount.value,
            platformShippingFee: shippingFeeAmount.value,
            platformPackagingFee: packagingFeeAmount.value,
            customFees: [],
          };

    const res: any = resubmitId.value
      ? await resubmitReimbursementApi(resubmitId.value, payload)
      : await submitReimbursementApi(payload);

    if (res.code === 0) {
      lastSubmittedReimbursement.value = res.data || null;
      currentStep.value = 'SUCCESS';
      return;
    }

    uni.showToast({ title: res.message || '提交失败', icon: 'none' });
  } catch (error: any) {
    console.error('提交报销申请失败', error);
    uni.showToast({ title: error.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

const goToSubmittedDetail = () => {
  if (!lastSubmittedReimbursement.value?.id) return;

  uni.redirectTo({
    url: `/pages/staff-purchasing/reimbursement/detail?id=${lastSubmittedReimbursement.value.id}`,
  });
};

const goToList = () => {
  uni.redirectTo({
    url: '/pages/staff-purchasing/reimbursement/list',
  });
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};
</script>

<style scoped lang="scss">
.submit-reimbursement-page {
  min-height: 100vh;
  padding-bottom: 150rpx;
  background-color: #f6f7f9;
}

.page-header {
  padding: 40rpx 32rpx 28rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #eef0f3;

  .title {
    display: block;
    margin-bottom: 8rpx;
    color: #20242a;
    font-size: 40rpx;
    font-weight: 700;
  }

  .subtitle {
    display: block;
    color: #6b7280;
    font-size: 24rpx;
  }
}

.step-indicator {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10rpx;
  padding: 20rpx 24rpx;
  background-color: #ffffff;
}

.step-dot {
  min-width: 0;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: 8rpx;
  color: #8a93a3;
  background-color: #f2f4f7;

  &.active {
    color: #0f5132;
    background-color: #dff5e8;
  }

  &.done {
    color: #1d4ed8;
    background-color: #e8f0ff;
  }
}

.dot-index,
.dot-label {
  font-size: 22rpx;
  white-space: nowrap;
}

.section {
  margin: 24rpx 24rpx 0;
  padding: 28rpx;
  border-radius: 8rpx;
  background-color: #ffffff;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 22rpx;
}

.section-title {
  display: block;
  margin-bottom: 22rpx;
  color: #20242a;
  font-size: 30rpx;
  font-weight: 700;
}

.section-head .section-title {
  margin-bottom: 0;
}

.section-total {
  flex-shrink: 0;
  color: #1677ff;
  font-size: 26rpx;
  font-weight: 700;
}

.type-options,
.purchase-list,
.expense-list,
.confirm-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.type-option,
.purchase-item,
.expense-item,
.summary-block,
.confirm-row {
  border: 1rpx solid #e5e7eb;
  border-radius: 8rpx;
  background-color: #ffffff;
}

.type-option,
.purchase-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 24rpx;

  &.selected {
    border-color: #22c55e;
    background-color: #f0fdf4;
  }
}

.type-copy,
.purchase-main {
  flex: 1;
  min-width: 0;
}

.type-title,
.purchase-date,
.expense-title {
  display: block;
  color: #20242a;
  font-size: 28rpx;
  font-weight: 700;
}

.type-desc,
.purchase-summary,
.purchase-meta,
.empty-desc,
.success-desc {
  display: block;
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.5;
}

.type-check,
.select-state {
  flex-shrink: 0;
  min-width: 80rpx;
  color: #1677ff;
  font-size: 24rpx;
  font-weight: 700;
  text-align: right;
}

.notice-strip {
  margin-top: 22rpx;
  padding: 20rpx;
  border-radius: 8rpx;
  color: #5f4b16;
  background-color: #fff7df;
  font-size: 24rpx;
  line-height: 1.55;
}

.filter-tabs,
.category-row {
  display: flex;
  gap: 12rpx;
  margin-bottom: 22rpx;
  overflow-x: auto;
}

.filter-tab,
.category-chip {
  flex-shrink: 0;
  min-height: 58rpx;
  padding: 0 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  color: #4b5563;
  background-color: #f2f4f7;
  font-size: 24rpx;

  &.active {
    color: #ffffff;
    background-color: #1677ff;
  }
}

.category-row.compact {
  flex-wrap: wrap;
  overflow: visible;
}

.purchase-title-row,
.expense-head,
.summary-row,
.confirm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.purchase-kind {
  flex-shrink: 0;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  color: #0f766e;
  background-color: #ccfbf1;
  font-size: 22rpx;
  font-weight: 700;
}

.empty-state {
  padding: 56rpx 24rpx;
  text-align: center;
  border-radius: 8rpx;
  background-color: #f8fafc;
}

.empty-title {
  display: block;
  color: #4b5563;
  font-size: 28rpx;
  font-weight: 700;
}

.fee-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-top: 22rpx;
}

.field-label {
  display: block;
  margin-bottom: 10rpx;
  color: #4b5563;
  font-size: 24rpx;
  font-weight: 600;
}

.money-input,
.text-input {
  min-height: 78rpx;
  box-sizing: border-box;
  border-radius: 8rpx;
  background-color: #f8fafc;
}

.money-input {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 0 20rpx;

  text {
    color: #6b7280;
    font-size: 26rpx;
  }

  input {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
  }
}

.text-input {
  width: 100%;
  margin-bottom: 14rpx;
  padding: 0 20rpx;
  font-size: 26rpx;
}

.expense-item {
  padding: 22rpx;
}

.expense-head {
  margin-bottom: 18rpx;
}

.remove-link {
  color: #d92d20;
  font-size: 24rpx;
}

.ghost-btn,
.primary-btn {
  height: 82rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 82rpx;
}

.ghost-btn {
  color: #374151;
  background-color: #eef0f3;
}

.primary-btn {
  color: #ffffff;
  background-color: #1677ff;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14rpx;
}

.photo-item,
.upload-tile {
  aspect-ratio: 1;
  border-radius: 8rpx;
  overflow: hidden;
  background-color: #f2f4f7;
}

.photo-item {
  position: relative;

  image {
    width: 100%;
    height: 100%;
  }
}

.delete-photo {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background-color: rgba(0, 0, 0, 0.58);
  font-size: 22rpx;
}

.upload-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 24rpx;
  border: 2rpx dashed #cbd5e1;
}

.upload-plus {
  margin-bottom: 8rpx;
  font-size: 44rpx;
  line-height: 1;
}

.summary-block {
  padding: 22rpx;
  margin-bottom: 18rpx;
}

.summary-row {
  padding: 10rpx 0;

  .label {
    color: #6b7280;
    font-size: 25rpx;
  }

  .value {
    color: #20242a;
    font-size: 26rpx;
    font-weight: 700;
  }

  &.total .value {
    color: #1677ff;
    font-size: 34rpx;
  }
}

.confirm-row {
  padding: 18rpx 20rpx;
  color: #374151;
  font-size: 24rpx;
}

.success-section {
  text-align: center;
}

.success-title {
  display: block;
  color: #16a34a;
  font-size: 38rpx;
  font-weight: 800;
}

.success-number {
  display: block;
  margin-top: 16rpx;
  color: #20242a;
  font-size: 28rpx;
  font-weight: 700;
}

.success-amount {
  display: block;
  margin-top: 18rpx;
  color: #1677ff;
  font-size: 44rpx;
  font-weight: 800;
}

.success-actions {
  display: flex;
  gap: 18rpx;
  margin-top: 30rpx;

  button {
    flex: 1;
  }
}

.bottom-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  gap: 18rpx;
  padding: 20rpx 24rpx 28rpx;
  background-color: #ffffff;
  box-shadow: 0 -8rpx 24rpx rgba(15, 23, 42, 0.08);

  button {
    flex: 1;
  }
}
</style>
