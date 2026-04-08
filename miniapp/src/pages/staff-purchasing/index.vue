<template>
  <view class="purchasing-page">
    <view class="header">
      <text class="title">采购管理</text>
      <text class="subtitle">查看采购清单与原料需求</text>
    </view>

    <view class="planning-card">
      <view class="section-heading">
        <text class="section-title">待采购日期</text>
        <text class="section-subtitle">先选生产日期，再决定是生成新清单还是查看已有清单</text>
      </view>

      <view class="date-chip-group">
        <view
          v-for="option in quickDateOptions"
          :key="option.date"
          class="date-chip"
          :class="{
            active: selectedTargetDate === option.date,
            muted: getDateOverview(option.date).state === 'EMPTY',
          }"
          @tap="selectTargetDate(option.date)"
        >
          <text class="chip-label">{{ option.label }}</text>
          <text class="chip-date">{{ option.shortDate }}</text>
          <text class="chip-meta">{{ getDateOverview(option.date).chipText }}</text>
        </view>

        <picker mode="date" :start="todayString" :value="selectedTargetDate" @change="onTargetDateChange">
          <view class="date-chip more-date-chip" :class="{ active: isCustomDateSelected }">
            <text class="chip-label">更多日期</text>
            <text class="chip-date">{{ customDateDisplay }}</text>
            <text class="chip-meta">{{ customDateMetaText }}</text>
          </view>
        </picker>
      </view>

      <view class="date-summary-card">
        <view class="summary-header">
          <view class="summary-date-block">
            <text class="summary-date">{{ formatSummaryDate(selectedTargetDate) }}</text>
            <text class="summary-status" :class="getSummaryStatusClass(selectedDateOverview.state)">
              {{ selectedDateOverview.statusText }}
            </text>
          </view>
          <text v-if="selectedTargetDate && selectedTargetDate !== todayString" class="summary-tag">
            非当天需确认
          </text>
        </view>

        <view v-if="selectedOverviewLoading" class="summary-loading">
          <text>正在加载该日期的采购信息...</text>
        </view>

        <view v-else class="summary-body">
          <text class="summary-line">{{ selectedDateOverview.summaryLine }}</text>
          <text class="summary-hint">{{ selectedDateOverview.hintText }}</text>
        </view>

        <view class="summary-actions" :class="{ 'single-action': !shouldShowPreviewButton }">
          <button
            v-if="shouldShowPreviewButton"
            class="summary-btn secondary"
            @tap="previewSelectedDate"
          >
            {{ previewActionText }}
          </button>
          <button
            class="summary-btn primary"
            :disabled="selectedOverviewLoading || selectedDateOverview.actionType === 'none'"
            :loading="generating && selectedDateOverview.actionType === 'generate'"
            @tap="handlePrimaryAction"
          >
            {{ primaryActionText }}
          </button>
        </view>
      </view>
    </view>

    <view class="quick-entry-card" @tap="goToStockCreate">
      <view class="quick-entry-copy">
        <text class="quick-entry-title">创建补货采购单</text>
        <text class="quick-entry-subtitle">海产、冻品、补剂、包材等可提前备货原料走这里</text>
      </view>
      <text class="quick-entry-arrow">›</text>
    </view>

    <view class="filters">
      <view class="filter-item filter-item-stack">
        <text class="filter-label">清单状态</text>
        <view class="status-filter-group">
          <view
            v-for="option in statusOptions"
            :key="option.value || 'ALL'"
            class="status-filter-chip"
            :class="{ active: selectedStatus === option.value }"
            @tap="selectStatus(option.value)"
          >
            <text>{{ option.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="purchase-lists">
      <view class="section-heading list-heading">
        <text class="section-title">采购清单列表</text>
        <text class="section-subtitle">这里展示已经生成的采购清单，状态筛选只作用于下方列表</text>
      </view>

      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="purchaseLists.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无采购清单</text>
        <text class="empty-hint">可以先在上方选择日期，生成第一张采购清单</text>
      </view>

      <view v-else class="list-items">
        <view
          v-for="list in purchaseLists"
          :key="list.id"
          class="list-item"
          @tap="goToDetail(list.id)"
        >
          <view class="item-header">
            <view class="header-left">
              <view class="target-line">
                <text class="target-date">{{ formatDate(list.targetDate) }}（制作日期）</text>
                <text class="kind-badge" :class="getListKindClass(list.kind)">
                  {{ getListKindText(list.kind) }}
                </text>
              </view>
              <text class="create-time">创建于 {{ formatDateTime(list.createdAt) }}</text>
            </view>
            <view class="status-badge" :class="getStatusClass(list.status)">
              <text>{{ getStatusText(list.status) }}</text>
            </view>
          </view>

          <view class="item-body">
            <view class="info-row">
              <text class="label">原料种类:</text>
              <text class="value">{{ list.itemCount }} 种</text>
            </view>
            <view class="info-row" v-if="list.recordsCount !== undefined">
              <text class="label">采购记录:</text>
              <text class="value">{{ list.recordsCount }} 条</text>
            </view>
            <view class="info-row" v-if="list.totalActualCost !== undefined && list.totalActualCost > 0">
              <text class="label">采购金额:</text>
              <text class="value cost">¥{{ Number(list.totalActualCost).toFixed(2) }}</text>
            </view>
            <view class="info-row" v-else-if="list.totalEstimatedCost !== undefined && list.totalEstimatedCost > 0">
              <text class="label">预估金额:</text>
              <text class="value cost">¥{{ Number(list.totalEstimatedCost).toFixed(2) }}</text>
            </view>
            <view class="info-row" v-if="list.sourceOrderIds && list.sourceOrderIds.length > 0">
              <text class="label">关联订单:</text>
              <text class="value">{{ list.sourceOrderIds.length }} 个</text>
            </view>
            <view class="info-row" v-else-if="list.kind === 'STOCK_REPLENISHMENT'">
              <text class="label">来源:</text>
              <text class="value">库存补货</text>
            </view>
            <view class="info-row" v-if="list.completedAt">
              <text class="label">完成时间:</text>
              <text class="value">{{ formatDate(list.completedAt) }}</text>
            </view>
          </view>

          <view v-if="list.status === 'PENDING' && !list.reimbursementId" class="item-footer">
            <view class="delete-list-btn" @tap.stop="confirmDeletePurchaseList(list.id)">
              删除清单
            </view>
          </view>
        </view>
      </view>

      <view v-if="hasMore && !loading && purchaseLists.length > 0" class="load-more" @tap="loadMore">
        <text>加载更多</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  deletePurchaseList,
  generatePurchaseList,
  getPurchaseLists,
  previewPurchaseList,
} from '@/api/purchasing';

interface DateOption {
  label: string;
  date: string;
  shortDate: string;
}

interface DateOverview {
  date: string;
  state: 'GENERATE' | 'SUPPLEMENT' | 'EXISTING' | 'EMPTY' | 'PAST';
  actionType: 'generate' | 'view' | 'none';
  generateMode: 'initial' | 'supplement' | 'none';
  statusText: string;
  chipText: string;
  summaryLine: string;
  hintText: string;
  orderCount: number;
  itemCount: number;
  estimatedCost: number;
  pendingAppendOrderCount: number;
  pendingAppendEstimatedCost: number;
  listCount: number;
  completedListCount: number;
  pendingListCount: number;
  existingList: any | null;
}

const statusOptions = [
  { label: '全部', value: '' },
  { label: '待采购', value: 'PENDING' },
  { label: '已完成', value: 'COMPLETED' },
];

const selectedStatus = ref('');
const purchaseLists = ref<any[]>([]);
const loading = ref(false);
const generating = ref(false);
const currentPage = ref(1);
const pageSize = 20;
const total = ref(0);
const hasMore = computed(() => purchaseLists.value.length < total.value);
const isMounted = ref(false);

const todayString = ref('');
const selectedTargetDate = ref('');
const dateOverviewMap = ref<Record<string, DateOverview>>({});
const overviewLoadingMap = ref<Record<string, boolean>>({});
const hasInitializedDateSelection = ref(false);

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createDateByOffset = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
};

const compareDateStrings = (left: string, right: string) => left.localeCompare(right);

const formatShortMonthDay = (dateStr: string) => {
  if (!dateStr) {
    return '--';
  }
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatWeekday = (dateStr: string) => {
  if (!dateStr) {
    return '';
  }
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[new Date(dateStr).getDay()];
};

const formatSummaryDate = (dateStr: string) => {
  if (!dateStr) {
    return '请选择生产日期';
  }
  return `${dateStr} ${formatWeekday(dateStr)}`;
};

const formatCurrency = (amount: number) => `¥${amount.toFixed(2)}`;

const normalizeAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const sortPurchaseListsByCreatedAtDesc = (lists: any[]) =>
  [...lists].sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
  );

const quickDateOptions = computed<DateOption[]>(() => {
  const labels = ['今天', '明天', '后天'];
  return labels.map((label, index) => {
    const date = createDateByOffset(index);
    const dateStr = getLocalDateString(date);
    return {
      label,
      date: dateStr,
      shortDate: `${formatShortMonthDay(dateStr)} ${formatWeekday(dateStr)}`,
    };
  });
});

const isCustomDateSelected = computed(
  () =>
    !!selectedTargetDate.value &&
    !quickDateOptions.value.some((option) => option.date === selectedTargetDate.value),
);

const customDateDisplay = computed(() => {
  if (!selectedTargetDate.value) {
    return '选择';
  }

  return isCustomDateSelected.value
    ? `${formatShortMonthDay(selectedTargetDate.value)} ${formatWeekday(selectedTargetDate.value)}`
    : '选择';
});

const createFallbackOverview = (date: string): DateOverview => {
  const isPast = !!date && compareDateStrings(date, todayString.value) < 0;

  if (isPast) {
    return {
      date,
      state: 'PAST',
      actionType: 'none',
      generateMode: 'none',
      statusText: '过去日期不可生成',
      chipText: '不可生成',
      summaryLine: '过去日期不支持生成采购清单',
      hintText: '请选择今天或未来日期进行采购安排',
      orderCount: 0,
      itemCount: 0,
      estimatedCost: 0,
      pendingAppendOrderCount: 0,
      pendingAppendEstimatedCost: 0,
      listCount: 0,
      completedListCount: 0,
      pendingListCount: 0,
      existingList: null,
    };
  }

  return {
    date,
    state: 'EMPTY',
    actionType: 'none',
    generateMode: 'none',
    statusText: '暂无待采购订单',
    chipText: '无订单',
    summaryLine: '暂无待采购订单',
    hintText: '可以切换其他日期，或先确认该日期是否已有付款订单',
    orderCount: 0,
    itemCount: 0,
    estimatedCost: 0,
    pendingAppendOrderCount: 0,
    pendingAppendEstimatedCost: 0,
    listCount: 0,
    completedListCount: 0,
    pendingListCount: 0,
    existingList: null,
  };
};

const buildSummaryLine = (orderCount: number, itemCount: number, estimatedCost: number) => {
  const parts = [`${orderCount}个待采购订单`, `${itemCount}种原料`];
  if (estimatedCost > 0) {
    parts.push(`预估 ${formatCurrency(estimatedCost)}`);
  }
  return parts.join(' · ');
};

const buildExistingSummaryLine = (
  orderCount: number,
  itemCount: number,
  amount: number,
  amountLabel: string,
) => {
  const parts = [`${orderCount}个关联订单`, `${itemCount}种原料`];
  if (amount > 0) {
    parts.push(`${amountLabel} ${formatCurrency(amount)}`);
  }
  return parts.join(' · ');
};

const buildExistingSummaryWithPendingAppend = (
  orderCount: number,
  itemCount: number,
  amount: number,
  amountLabel: string,
  pendingAppendOrderCount: number,
  pendingAppendEstimatedCost: number,
) => {
  const parts = [buildExistingSummaryLine(orderCount, itemCount, amount, amountLabel)];
  if (pendingAppendOrderCount > 0) {
    parts.push(`新增${pendingAppendOrderCount}单待合并`);
  }
  if (pendingAppendEstimatedCost > 0) {
    parts.push(`新增预估 ${formatCurrency(pendingAppendEstimatedCost)}`);
  }
  return parts.join(' · ');
};

const buildCompletedSummaryLine = (
  completedListCount: number,
  orderCount: number,
  amount: number,
  amountLabel: string,
) => {
  const parts = [
    completedListCount > 1 ? `${completedListCount}张已完成清单` : '已完成采购清单',
    `${orderCount}个关联订单`,
  ];
  if (amount > 0) {
    parts.push(`${amountLabel} ${formatCurrency(amount)}`);
  }
  return parts.join(' · ');
};

const buildSupplementSummaryLine = (
  completedListCount: number,
  pendingOrderCount: number,
  itemCount: number,
  estimatedCost: number,
) => {
  const parts = [
    completedListCount > 1 ? `已有${completedListCount}张已完成清单` : '已有已完成清单',
    `新增${pendingOrderCount}个订单`,
    `${itemCount}种原料`,
  ];
  if (estimatedCost > 0) {
    parts.push(`预估 ${formatCurrency(estimatedCost)}`);
  }
  return parts.join(' · ');
};

const buildDateOverview = (date: string, existingLists: any[], preview: any | null): DateOverview => {
  if (compareDateStrings(date, todayString.value) < 0) {
    return createFallbackOverview(date);
  }

  const sortedLists = sortPurchaseListsByCreatedAtDesc(existingLists || []);
  const pendingList = sortedLists.find((list) => list.status === 'PENDING') || null;
  const completedLists = sortedLists.filter((list) => list.status === 'COMPLETED');
  const latestCompletedList = completedLists[0] || null;
  const listCount = sortedLists.length;
  const completedListCount = completedLists.length;
  const pendingListCount = pendingList ? 1 : 0;

  if (pendingList) {
    const orderCount = Array.isArray(pendingList.sourceOrderIds)
      ? pendingList.sourceOrderIds.length
      : 0;
    const itemCount = Number(pendingList.itemCount || 0);
    const estimatedAmount = normalizeAmount(pendingList.totalEstimatedCost);
    const actualAmount = normalizeAmount(pendingList.totalActualCost);
    const displayAmount = estimatedAmount || actualAmount;
    const displayAmountLabel = estimatedAmount > 0 ? '预估' : '采购';
    const pendingAppendOrderCount = Array.isArray(preview?.affectedOrders)
      ? preview.affectedOrders.length
      : 0;
    const pendingAppendEstimatedCost = normalizeAmount(preview?.totalEstimatedCost);
    const hasPendingAppendOrders = pendingAppendOrderCount > 0;

    return {
      date,
      state: 'EXISTING',
      actionType: 'view',
      generateMode: 'none',
      statusText: hasPendingAppendOrders ? '有新增订单待合并' : '已有采购清单',
      chipText: hasPendingAppendOrders ? `${pendingAppendOrderCount}单待合并` : '已有清单',
      summaryLine: hasPendingAppendOrders
        ? buildExistingSummaryWithPendingAppend(
            orderCount,
            itemCount,
            displayAmount,
            displayAmountLabel,
            pendingAppendOrderCount,
            pendingAppendEstimatedCost,
          )
        : buildExistingSummaryLine(orderCount, itemCount, displayAmount, displayAmountLabel),
      hintText: hasPendingAppendOrders
        ? '该日期已有待采购清单，但新增了已付款订单。进入详情后可一键合并，无需新建第二张清单。'
        : '该日期已有待采购清单，可直接进入详情继续采购。',
      orderCount,
      itemCount,
      estimatedCost: displayAmount,
      pendingAppendOrderCount,
      pendingAppendEstimatedCost,
      listCount,
      completedListCount,
      pendingListCount,
      existingList: pendingList,
    };
  }

  const orderCount = Array.isArray(preview?.affectedOrders) ? preview.affectedOrders.length : 0;
  const itemCount = Number(preview?.itemCount || 0);
  const estimatedCost = normalizeAmount(preview?.totalEstimatedCost);

  if (completedListCount > 0) {
    const totalCompletedOrders = completedLists.reduce((sum, list) => {
      return sum + (Array.isArray(list.sourceOrderIds) ? list.sourceOrderIds.length : 0);
    }, 0);
    const totalCompletedAmount = completedLists.reduce((sum, list) => {
      const actualAmount = normalizeAmount(list.totalActualCost);
      const estimatedAmount = normalizeAmount(list.totalEstimatedCost);
      return sum + (actualAmount || estimatedAmount);
    }, 0);
    const hasActualCompletedAmount = completedLists.some(
      (list) => normalizeAmount(list.totalActualCost) > 0,
    );

    if (orderCount > 0) {
      return {
        date,
        state: 'SUPPLEMENT',
        actionType: 'generate',
        generateMode: 'supplement',
        statusText: '可生成增量清单',
        chipText: `${orderCount}单待补采`,
        summaryLine: buildSupplementSummaryLine(
          completedListCount,
          orderCount,
          itemCount,
          estimatedCost,
        ),
        hintText:
          '该日期已有已完成采购清单。本次会新建一张独立的增量采购清单，只处理新增订单，不影响原已完成清单。',
        orderCount,
        itemCount,
        estimatedCost,
        pendingAppendOrderCount: 0,
        pendingAppendEstimatedCost: 0,
        listCount,
        completedListCount,
        pendingListCount,
        existingList: latestCompletedList,
      };
    }

    return {
      date,
      state: 'EXISTING',
      actionType: 'view',
      generateMode: 'none',
      statusText: completedListCount > 1 ? `已有${completedListCount}张采购清单` : '已有采购清单',
      chipText: completedListCount > 1 ? `${completedListCount}张已完成` : '已完成',
      summaryLine: buildCompletedSummaryLine(
        completedListCount,
        totalCompletedOrders,
        totalCompletedAmount,
        hasActualCompletedAmount ? '累计采购' : '累计预估',
      ),
      hintText:
        completedListCount > 1
          ? '该日期采购已完成，下方列表可查看当天全部采购清单。'
          : '该日期采购已完成，可进入清单查看记录或继续报销流程。',
      orderCount: totalCompletedOrders,
      itemCount: completedLists.reduce((sum, list) => sum + Number(list.itemCount || 0), 0),
      estimatedCost: totalCompletedAmount,
      pendingAppendOrderCount: 0,
      pendingAppendEstimatedCost: 0,
      listCount,
      completedListCount,
      pendingListCount,
      existingList: latestCompletedList,
    };
  }

  if (orderCount > 0) {
    return {
      date,
      state: 'GENERATE',
      actionType: 'generate',
      generateMode: 'initial',
      statusText: '可生成采购清单',
      chipText: `${orderCount}单待采购`,
      summaryLine: buildSummaryLine(orderCount, itemCount, estimatedCost),
      hintText:
        date === todayString.value
          ? '当天清单可直接生成，便于员工马上开始采购'
          : '这不是当天生产清单，生成前会再次确认，避免误选日期',
      orderCount,
      itemCount,
      estimatedCost,
      pendingAppendOrderCount: 0,
      pendingAppendEstimatedCost: 0,
      listCount,
      completedListCount,
      pendingListCount,
      existingList: null,
    };
  }

  return createFallbackOverview(date);
};

const getDateOverview = (date: string) => {
  if (!date) {
    return createFallbackOverview(todayString.value);
  }
  return dateOverviewMap.value[date] || createFallbackOverview(date);
};

const selectedDateOverview = computed(() => getDateOverview(selectedTargetDate.value));
const selectedOverviewLoading = computed(() => !!overviewLoadingMap.value[selectedTargetDate.value]);

const customDateMetaText = computed(() => {
  if (!selectedTargetDate.value || !isCustomDateSelected.value) {
    return '手动选择';
  }
  return getDateOverview(selectedTargetDate.value).chipText;
});

const shouldShowPreviewButton = computed(() => selectedDateOverview.value.actionType === 'generate');

const previewActionText = computed(() =>
  selectedDateOverview.value.generateMode === 'supplement' ? '预览新增需求' : '预览该日期需求',
);

const primaryActionText = computed(() => {
  if (selectedOverviewLoading.value) {
    return '加载中...';
  }

  switch (selectedDateOverview.value.actionType) {
    case 'view':
      if (
        selectedDateOverview.value.pendingAppendOrderCount === 0 &&
        selectedDateOverview.value.completedListCount > 1 &&
        selectedDateOverview.value.pendingListCount === 0
      ) {
        return '查看最新采购清单';
      }
      return selectedDateOverview.value.pendingAppendOrderCount > 0
        ? '查看并合并订单'
        : '查看采购清单';
    case 'generate':
      return selectedDateOverview.value.generateMode === 'supplement'
        ? '生成增量采购清单'
        : '生成采购清单';
    default:
      return '暂无待采购订单';
  }
});

const fetchDateOverview = async (date: string) => {
  if (!date) {
    return;
  }

  overviewLoadingMap.value = {
    ...overviewLoadingMap.value,
    [date]: true,
  };

  try {
    const [listRes, previewRes]: any = await Promise.all([
      getPurchaseLists({
        startDate: date,
        endDate: date,
        page: 1,
        pageSize: 20,
      }),
      previewPurchaseList({
        startDate: date,
      }),
    ]);

    const existingLists =
      listRes?.code === 0 && Array.isArray(listRes.data?.list) ? listRes.data.list : [];
    const preview = previewRes?.code === 0 ? previewRes.data : null;

    dateOverviewMap.value = {
      ...dateOverviewMap.value,
      [date]: buildDateOverview(date, existingLists, preview),
    };
  } catch (error) {
    console.error('加载日期采购概览失败', date, error);
    dateOverviewMap.value = {
      ...dateOverviewMap.value,
      [date]: createFallbackOverview(date),
    };
  } finally {
    overviewLoadingMap.value = {
      ...overviewLoadingMap.value,
      [date]: false,
    };
  }
};

const refreshDateOverviews = async (autoPick = false) => {
  const dates = new Set<string>(quickDateOptions.value.map((option) => option.date));
  if (selectedTargetDate.value) {
    dates.add(selectedTargetDate.value);
  }

  await Promise.all(Array.from(dates).map((date) => fetchDateOverview(date)));

  if (autoPick && !hasInitializedDateSelection.value) {
    const preferredDate =
      quickDateOptions.value.find((option) => getDateOverview(option.date).actionType === 'generate')?.date ||
      quickDateOptions.value.find((option) => getDateOverview(option.date).actionType === 'view')?.date ||
      todayString.value;

    selectedTargetDate.value = preferredDate;
    hasInitializedDateSelection.value = true;
  }

  if (selectedTargetDate.value && !dateOverviewMap.value[selectedTargetDate.value]) {
    await fetchDateOverview(selectedTargetDate.value);
  }
};

const loadPurchaseLists = async (refresh = false) => {
  if (refresh) {
    currentPage.value = 1;
    purchaseLists.value = [];
  }

  loading.value = true;

  try {
    const params: any = {
      page: currentPage.value,
      pageSize,
    };

    if (selectedStatus.value) {
      params.status = selectedStatus.value;
    }

    const res: any = await getPurchaseLists(params);

    if (res.code === 0) {
      if (refresh) {
        purchaseLists.value = res.data.list;
      } else {
        purchaseLists.value.push(...res.data.list);
      }
      total.value = res.data.total;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error) {
    console.error('加载采购清单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  if (!loading.value && hasMore.value) {
    currentPage.value++;
    loadPurchaseLists();
  }
};

const selectStatus = (status: string) => {
  if (selectedStatus.value === status) {
    return;
  }

  selectedStatus.value = status;
  loadPurchaseLists(true);
};

const selectTargetDate = async (date: string) => {
  if (selectedTargetDate.value === date) {
    return;
  }

  selectedTargetDate.value = date;
  if (!dateOverviewMap.value[date]) {
    await fetchDateOverview(date);
  }
};

const onTargetDateChange = async (e: any) => {
  const nextDate = e.detail.value;
  if (!nextDate) {
    return;
  }

  selectedTargetDate.value = nextDate;
  await fetchDateOverview(nextDate);
};

const previewSelectedDate = () => {
  if (!selectedTargetDate.value) {
    uni.showToast({ title: '请先选择制作日期', icon: 'none' });
    return;
  }

  uni.navigateTo({
    url: `/pages/staff-purchasing/preview?startDate=${selectedTargetDate.value}`,
  });
};

const generateList = async () => {
  if (!selectedTargetDate.value) {
    uni.showToast({ title: '请选择制作日期', icon: 'none' });
    return;
  }

  const today = todayString.value;
  const isSupplemental = selectedDateOverview.value.generateMode === 'supplement';

  if (compareDateStrings(selectedTargetDate.value, today) < 0) {
    uni.showToast({ title: '不能生成过去日期的采购清单', icon: 'none' });
    return;
  }

  const submitGenerateRequest = async () => {
    generating.value = true;

    try {
      const response: any = await generatePurchaseList({
        startDate: selectedTargetDate.value,
      });

      if (response.code === 0) {
        uni.showToast({
          title: isSupplemental ? '增量清单已生成' : '生成成功',
          icon: 'success',
        });
        await Promise.all([
          loadPurchaseLists(true),
          refreshDateOverviews(false),
        ]);
      } else {
        uni.showToast({ title: response.message || '生成失败', icon: 'none' });
      }
    } catch (error: any) {
      console.error('生成采购清单失败', error);
      uni.showToast({ title: error.message || '生成失败', icon: 'none' });
    } finally {
      generating.value = false;
    }
  };

  const showFinalConfirm = (title: string, content: string) => {
    uni.showModal({
      title,
      content,
      confirmText: '确认生成',
      success: async (res) => {
        if (res.confirm) {
          await submitGenerateRequest();
        }
      },
    });
  };

  if (selectedTargetDate.value !== today) {
    showFinalConfirm(
      '非当天采购提醒',
      isSupplemental
        ? `当前日期是 ${today}，你选择为 ${selectedTargetDate.value} 生成增量采购清单。系统只会处理这一天新增的已付款订单，不会影响已完成清单，请确认是否继续。`
        : `当前日期是 ${today}，你选择生成的是 ${selectedTargetDate.value} 的采购清单。这不是当天生产清单，请确认是否继续。`,
    );
    return;
  }

  showFinalConfirm(
    isSupplemental ? '生成增量采购清单' : '生成采购清单',
    isSupplemental
      ? `该日期已有已完成采购清单。本次只会把 ${selectedTargetDate.value} 新增的已付款订单生成一张独立的增量采购清单，不会影响原已完成清单，确认继续？`
      : `将根据 ${selectedTargetDate.value} 制作日期的已付款订单生成采购清单，确认继续？`,
  );
};

const handlePrimaryAction = () => {
  const overview = selectedDateOverview.value;

  if (overview.actionType === 'view' && overview.existingList?.id) {
    goToDetail(overview.existingList.id);
    return;
  }

  if (overview.actionType === 'generate') {
    generateList();
  }
};

const goToDetail = (id: string) => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/detail?id=${id}`,
  });
};

const goToStockCreate = () => {
  uni.navigateTo({
    url: '/pages/staff-purchasing/stock-create',
  });
};

const getListKindText = (kind?: string) => {
  const kindMap: Record<string, string> = {
    ORDER_DEMAND: '订单采购',
    STOCK_REPLENISHMENT: '库存补货',
  };
  return kindMap[kind || 'ORDER_DEMAND'] || '订单采购';
};

const getListKindClass = (kind?: string) => {
  return kind === 'STOCK_REPLENISHMENT' ? 'stock' : 'order';
};

const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    PENDING: '待采购',
    COMPLETED: '已完成',
  };
  return statusMap[status] || status;
};

const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    DRAFT: 'draft',
    PENDING: 'pending',
    COMPLETED: 'completed',
  };
  return classMap[status] || '';
};

const getSummaryStatusClass = (state: DateOverview['state']) => {
  const classMap: Record<DateOverview['state'], string> = {
    GENERATE: 'generate',
    SUPPLEMENT: 'supplement',
    EXISTING: 'existing',
    EMPTY: 'empty',
    PAST: 'past',
  };
  return classMap[state];
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

const confirmDeletePurchaseList = (id: string) => {
  uni.showModal({
    title: '删除采购清单',
    content: '确认删除该采购清单？删除后所有关联订单将回退到"已付款"状态',
    confirmColor: '#ff4d4f',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await deletePurchaseList(id);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });
            await Promise.all([
              loadPurchaseLists(true),
              refreshDateOverviews(false),
            ]);
          } else {
            uni.showToast({ title: response.message || '删除失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('删除采购清单失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

onMounted(() => {
  todayString.value = getLocalDateString();
  selectedTargetDate.value = todayString.value;
  loadPurchaseLists();
  refreshDateOverviews(true);
  isMounted.value = true;
});

onShow(() => {
  if (isMounted.value) {
    todayString.value = getLocalDateString();
    loadPurchaseLists(true);
    refreshDateOverviews(false);
  }
});
</script>

<style scoped lang="scss">
.purchasing-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 48rpx;
}

.header {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;

  .title {
    display: block;
    font-size: 44rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 8rpx;
  }

  .subtitle {
    display: block;
    font-size: 24rpx;
    color: rgba(51, 51, 51, 0.7);
  }
}

.planning-card,
.filters,
.purchase-lists {
  margin: 0 32rpx 24rpx;
}

.quick-entry-card {
  margin: 0 32rpx 24rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #dff6d2 0%, #eefad8 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(73, 160, 120, 0.12);
}

.quick-entry-copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.quick-entry-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f3b2d;
}

.quick-entry-subtitle {
  font-size: 24rpx;
  color: rgba(31, 59, 45, 0.74);
  line-height: 1.5;
}

.quick-entry-arrow {
  font-size: 40rpx;
  color: rgba(31, 59, 45, 0.42);
}

.planning-card,
.filters {
  background-color: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.04);
}

.section-heading {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
}

.section-subtitle {
  font-size: 24rpx;
  color: #999;
  line-height: 1.5;
}

.date-chip-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.date-chip {
  min-height: 152rpx;
  border-radius: 20rpx;
  padding: 24rpx 22rpx;
  background: #faf7ef;
  border: 2rpx solid transparent;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10rpx;
  box-sizing: border-box;

  &.active {
    border-color: #f6b93b;
    background: linear-gradient(135deg, #fff8df 0%, #ffe3a3 100%);
    box-shadow: 0 10rpx 24rpx rgba(246, 185, 59, 0.18);
  }

  &.muted {
    background: #f7f7f7;
  }
}

.more-date-chip {
  background: linear-gradient(135deg, #f6f7fb 0%, #eef1f7 100%);
}

.chip-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.chip-date {
  font-size: 24rpx;
  color: #666;
}

.chip-meta {
  font-size: 22rpx;
  color: #999;
}

.date-summary-card {
  margin-top: 24rpx;
  border-radius: 24rpx;
  background: linear-gradient(180deg, #fffdfa 0%, #fff6df 100%);
  padding: 24rpx;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.summary-date-block {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.summary-date {
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
}

.summary-status {
  align-self: flex-start;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;

  &.generate {
    background: rgba(250, 173, 20, 0.14);
    color: #ad6800;
  }

  &.supplement {
    background: rgba(250, 140, 22, 0.14);
    color: #ad4e00;
  }

  &.existing {
    background: rgba(24, 144, 255, 0.12);
    color: #0958d9;
  }

  &.empty {
    background: rgba(0, 0, 0, 0.06);
    color: #666;
  }

  &.past {
    background: rgba(255, 77, 79, 0.12);
    color: #cf1322;
  }
}

.summary-tag {
  font-size: 22rpx;
  color: #a16b00;
  background: rgba(255, 193, 7, 0.16);
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
}

.summary-loading {
  padding: 24rpx 0;

  text {
    font-size: 26rpx;
    color: #999;
  }
}

.summary-body {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.summary-line {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
  line-height: 1.5;
}

.summary-hint {
  font-size: 24rpx;
  color: #8c6d1f;
  line-height: 1.6;
}

.summary-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;

  &.single-action {
    .summary-btn {
      width: 100%;
    }
  }
}

.summary-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  border: none;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;

  &.secondary {
    background: #fff;
    color: #7a5d00;
    border: 1rpx solid rgba(242, 184, 41, 0.35);
  }

  &.primary {
    background: linear-gradient(135deg, #ffd54f 0%, #ffca28 100%);
    color: #333;
    box-shadow: 0 10rpx 24rpx rgba(255, 202, 40, 0.24);
  }

  &[disabled] {
    background: #f0f0f0;
    color: #999;
    box-shadow: none;
  }
}

.filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.filter-item-stack {
  flex-direction: column;
  align-items: flex-start;
}

.filter-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
}

.status-filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  width: 100%;
}

.status-filter-chip {
  min-width: 132rpx;
  height: 64rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background-color: #f5f5f5;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;

  text {
    font-size: 26rpx;
    font-weight: 500;
  }

  &.active {
    background: linear-gradient(135deg, #ffd54f 0%, #ffca28 100%);
    color: #333;
    box-shadow: 0 8rpx 18rpx rgba(255, 202, 40, 0.25);
  }
}

.purchase-lists {
  padding: 0;
}

.list-heading {
  margin: 0 0 20rpx;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 32rpx;
  background: #fff;
  border-radius: 24rpx;

  text {
    font-size: 28rpx;
    color: #999;
  }

  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 12rpx;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #999;
    text-align: center;
    line-height: 1.6;
  }
}

.list-items {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.list-item {
  background-color: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.04);

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;
    padding-bottom: 16rpx;
    border-bottom: 1rpx solid #f5f5f5;

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;

      .target-line {
        display: flex;
        align-items: center;
        gap: 12rpx;
        flex-wrap: wrap;
      }

      .target-date {
        font-size: 30rpx;
        font-weight: bold;
        color: #333;
      }

      .kind-badge {
        padding: 6rpx 14rpx;
        border-radius: 999rpx;
        font-size: 22rpx;
        font-weight: 600;

        &.order {
          background: rgba(255, 202, 40, 0.18);
          color: #8a5a00;
        }

        &.stock {
          background: rgba(34, 197, 94, 0.14);
          color: #15803d;
        }
      }

      .create-time {
        font-size: 22rpx;
        color: #999;
      }
    }

    .status-badge {
      padding: 8rpx 16rpx;
      border-radius: 8rpx;
      font-size: 22rpx;
      font-weight: bold;

      &.draft {
        background-color: #f0f0f0;
        color: #666;
      }

      &.pending {
        background-color: #fff7e6;
        color: #fa8c16;
      }

      &.completed {
        background-color: #f6ffed;
        color: #52c41a;
      }
    }
  }

  .item-body {
    margin-bottom: 16rpx;

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 26rpx;
        color: #666;
      }

      .value {
        font-size: 26rpx;
        color: #333;
        font-weight: 500;

        &.cost {
          color: #ff6b6b;
          font-weight: bold;
        }
      }
    }
  }

  .item-footer {
    padding-top: 16rpx;
    border-top: 1rpx solid #f5f5f5;
    display: flex;
    justify-content: flex-end;
    align-items: center;

    .delete-list-btn {
      padding: 12rpx 32rpx;
      background: linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%);
      color: #cf1322;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: 500;

      &:active {
        opacity: 0.8;
      }
    }
  }
}

.load-more {
  text-align: center;
  padding: 32rpx;

  text {
    font-size: 26rpx;
    color: #1890ff;
  }
}
</style>
