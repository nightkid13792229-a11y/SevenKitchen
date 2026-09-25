<template>
  <view class="container">
    <!-- 状态筛选Tab -->
    <view class="status-tabs">
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: selectedStatus === tab.value }"
        @tap="selectStatus(tab.value)"
      >
        <text class="tab-text">{{ tab.label }}</text>
        <text v-if="tab.count > 0" class="tab-count">({{ tab.count }})</text>
      </view>
    </view>

    <view class="order-list">
      <view
        v-for="order in orders"
        :key="`${order._orderType}-${order.id}`"
        class="order-item"
        @tap="handleOrderTap(order)"
      >
        <!-- 订单时间和状态 -->
        <view class="order-header">
          <view class="order-header-left">
            <text class="order-time">{{
              formatShortDateTime(order.createdAt)
            }}</text>
            <!-- 两类订单混在一个列表里，靠这个标签让顾客一眼知道是哪一类 -->
            <text
              v-if="order._orderType === 'supplement'"
              class="order-type-tag"
            >
              补剂
            </text>
          </view>
          <text
            class="order-status"
            :style="{ color: getStatusColor(order) }"
          >
            {{ getStatusText(order) }}
          </text>
        </view>

        <!--
          补剂订单：字段结构与鲜食完全不同，且没有独立详情页，
          所以把订单号、概要、明细、物流、售后都在卡片里展示全，点卡片不再跳转。
        -->
        <template v-if="order._orderType === 'supplement'">
          <view class="order-summary">
            <text class="summary-text"
              >{{ order.orderNo }} · {{ formatSupplementSummary(order) }}</text
            >
          </view>

          <view class="order-items">
            <view
              v-for="item in order.items || []"
              :key="item.id"
              class="supplement-item-row"
            >
              <text class="supplement-item-name">{{ item.name }}</text>
              <text class="supplement-item-amount"
                >{{ formatSupplementAmount(item.packedAmount)
                }}{{ item.unit }}</text
              >
              <text class="supplement-item-price"
                >¥{{ formatAmount(item.price) }}</text
              >
            </view>
          </view>

          <view v-if="order.trackingNumber" class="order-address">
            <text class="address-text"
              >快递 {{ order.carrierCode ? order.carrierCode + ' ' : ''
              }}{{ order.trackingNumber }}</text
            >
          </view>

          <view v-if="order.aftersaleType" class="order-address">
            <text class="address-text"
              >售后 {{ order.aftersaleType === 'REFUND' ? '退款' : '免费补发'
              }}{{
                order.aftersaleReason ? ' · ' + order.aftersaleReason : ''
              }}</text
            >
          </view>
        </template>

        <!-- 商品数量（鲜食口径，补剂用上面的概要行） -->
        <view v-if="order._orderType === 'food'" class="order-summary">
          <text class="summary-text">{{ order.itemCount || 0 }}件商品</text>
        </view>

        <!-- 如果有详细商品信息，显示更多信息 -->
        <template v-if="order._orderType === 'food' && order.firstItem">
          <!-- 狗狗信息 -->
          <view class="order-dogs">
            <text class="dogs-text">{{ formatDogInfo(order) }}</text>
          </view>

          <!-- 商品信息：食谱名称、总餐数、每餐重量 -->
          <view class="order-items">
            <view class="recipe-header">
              <image
                v-if="getRecipeCoverImage(order)"
                class="recipe-cover"
                :src="getRecipeCoverImage(order)"
                mode="aspectFill"
              />
              <text class="recipe-name">{{ getRecipeName(order) }}</text>
            </view>
            <view class="meal-info">
              <text class="meal-text">共{{ getTotalMeals(order) }}餐</text>
              <text class="meal-separator">·</text>
              <text
                v-if="
                  order.firstItem?.packagePlan &&
                  order.firstItem.packagePlan.length > 0
                "
                class="meal-text"
              >
                {{ formatPackagePlan(order.firstItem) }}
              </text>
              <text v-else class="meal-text"
                >每餐{{ getMealWeight(order) }}g</text
              >
            </view>
          </view>

          <!-- 收货地址 -->
          <view class="order-address" v-if="order.address">
            <text class="address-text">{{ formatAddress(order.address) }}</text>
          </view>
        </template>

        <!-- 金额 -->
        <view class="order-amount">
          <text class="amount-label">订单金额:</text>
          <text class="amount-value"
            >¥{{ formatAmount(order.totalAmount) }}</text
          >
        </view>

        <view v-if="hasQuickActions(order)" class="order-actions" @tap.stop>
          <!-- 补剂：只有未付款需要入口，支付流程与鲜食不同，复用补剂自己的支付封装 -->
          <button
            v-if="
              order._orderType === 'supplement' &&
              order.status === 'PENDING_PAYMENT'
            "
            class="action-btn primary"
            :disabled="payingSupplementId === order.id"
            @tap="paySupplementFromList(order)"
          >
            {{ payingSupplementId === order.id ? '调起支付中' : '去支付' }}
          </button>

          <!-- 鲜食：下面这套操作沿用原样，只按类型标记收窄适用范围 -->
          <template v-if="order._orderType === 'food'">
            <button
              v-if="order.status === 'PENDING_PAYMENT' && !isPaymentExpired(order)"
              class="action-btn primary"
              :disabled="payingOrderId === order.id"
              @tap="payOrderFromList(order.id)"
            >
              {{ payingOrderId === order.id ? '调起支付中' : '立即付款' }}
            </button>
            <text v-if="isPaymentExpired(order)" class="order-expired-text">
              支付已超时，订单已关闭
            </text>
            <button
              v-if="order.status === 'SHIPPED'"
              class="action-btn secondary"
              @tap="viewLogistics(order)"
            >
              查看物流
            </button>
            <button
              v-if="getAftersaleEntryLabel(order.status, order.completedAt)"
              class="action-btn secondary"
              @tap="applyAftersale(order)"
            >
              {{ getAftersaleEntryLabel(order.status, order.completedAt) }}
            </button>
            <button
              v-if="order.status === 'SHIPPED'"
              class="action-btn primary"
              :disabled="receivingOrderId === order.id"
              @tap="confirmReceivedFromList(order)"
            >
              {{ receivingOrderId === order.id ? '确认中' : '确认收货' }}
            </button>
            <button
              class="action-btn secondary"
              @tap="buyAgain(order)"
            >
              再次购买
            </button>
          </template>
        </view>
      </view>

      <view v-if="orders.length === 0" class="empty-state">
        <text class="empty-title">{{ emptyTitle }}</text>
        <text class="empty-text">{{ emptyText }}</text>
        <button
          v-if="selectedStatus === 'ALL'"
          class="empty-action"
          @tap="goHome"
        >
          去选食谱
        </button>
      </view>
    </view>

    <view class="customer-service-bottom-bar">
      <CustomerServiceInlineButton
        class="customer-service-bottom-action"
        source-type="GENERAL"
        title="订单列表咨询"
        path="/pages/orders-list/index"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { request, getToken } from '../../utils/api';
import {
  createWechatPayment,
  type WechatPaymentResult,
} from '../../api/orders';
import {
  fetchSupplementOrders,
  SUPPLEMENT_ORDER_STATUS_LABELS,
  type SupplementOrder,
} from '../../api/supplements';
import { runSupplementPayment } from '../../utils/supplement-payment';
import { formatShortDateTime } from '../../utils/date';
import { requestWechatOrderPayment } from '../../utils/wechat-payment';
import { confirmWechatReceiptBeforeInternalComplete } from '../../utils/wechat-confirm-receipt';
import {
  getOrderStatusText,
  canApplyRefund,
  canApplyRemake,
  canCancelOrder,
  getAftersaleEntryLabel,
} from '../../utils/order-aftersale';
import CustomerServiceInlineButton from '../../components/CustomerServiceInlineButton.vue';

// DEBUG flag for development logging
const DEBUG = true;

// 补剂订单列表接口有分页（后端每页上限 100）。合并列表要在本地筛选和排序，
// 所以这里按页拿全；MAX_PAGES 只是防止 total 异常时死循环的兜底。
const SUPPLEMENT_ORDER_PAGE_SIZE = 100;
const SUPPLEMENT_ORDER_MAX_PAGES = 20;

interface Order {
  id: string;
  status: string;
  cancellationReason?: string | null;
  aftersaleType?: string | null;
  refundStatus?: {
    success: boolean;
  } | null;
  totalAmount?: number;
  itemCount?: number;
  createdAt?: string;
  completedAt?: string;
  trackingNumber?: string;
  carrierCode?: string;
  paymentMethod?: string | null;
  transactionId?: string | null;
  paymentDeadline?: string | null;
  paymentRemainingSeconds?: number | null;
  paymentAutoCloseEnabled?: boolean | null;
  firstItem?: {
    dogId?: string;
    dog?: {
      name?: string;
      breedName?: string;
      weightKg?: number;
      mealsPerDay?: number;
    };
    recipeSnapshot?: {
      id: string;
      name: string;
      coverImageUrl?: string | null;
    };
    packageCount: number;
    packageSpecG: number;
    packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
    ingredientSourcePlan?: string | null;
    dailyIntakeG?: number;
  };
  address?: {
    recipientName: string;
    regionText: string;
    detailAddress: string;
  };
}

/**
 * 合并列表的类型标记。
 *
 * 两类订单的字段几乎不重叠（鲜食是 firstItem/address，补剂是 items/orderNo），
 * 用一个下划线前缀的字段挂在订单对象上区分；前缀是为了不和后端返回的字段撞名。
 */
type OrderType = 'food' | 'supplement';

type FoodOrderRow = Order & { _orderType: 'food' };

type SupplementOrderRow = SupplementOrder & { _orderType: 'supplement' };

type UnifiedOrder = FoodOrderRow | SupplementOrderRow;

// 状态筛选Tab
const selectedStatus = ref<string>('ALL');

const statusTabs = ref<Array<{ label: string; value: string; count: number }>>([
  { label: '全部', value: 'ALL', count: 0 },
  { label: '未付款', value: 'PENDING_PAYMENT', count: 0 },
  { label: '已付款', value: 'IN_PROGRESS', count: 0 },
  { label: '已发货', value: 'WAIT_RECEIVE', count: 0 },
  { label: '已完成', value: 'RECEIVED', count: 0 },
  { label: '售后中', value: 'AFTERSALE', count: 0 },
  { label: '已取消', value: 'CANCELLED', count: 0 },
]);

const allOrders = ref<UnifiedOrder[]>([]);
const orders = ref<UnifiedOrder[]>([]);
const viewAllOrders = ref(false); // 是否查看所有订单（从工作台进入时为true）
const payingOrderId = ref('');
const receivingOrderId = ref('');
const payingSupplementId = ref('');

/**
 * 补剂自己的状态分色：金=待办、绿=正常、红=售后、灰=结束。
 * 刻意不用旧的蓝色系（已废弃），和鲜食卡片保持同一套语义。
 */
const SUPPLEMENT_STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: '#ff9800',
  PAID: '#52c41a',
  PACKING: '#faad14',
  PACKED: '#faad14',
  SHIPPED: '#52c41a',
  COMPLETED: '#52c41a',
  CANCELLED: '#999',
  AFTERSALE: '#f5222d',
};

const emptyTitle = computed(() => {
  if (selectedStatus.value === 'ALL') {
    return '还没有订单';
  }
  const tab = statusTabs.value.find(
    (item) => item.value === selectedStatus.value,
  );
  return `暂无${tab?.label || '相关'}订单`;
});

const emptyText = computed(() => {
  const copyMap: Record<string, string> = {
    ALL: '去首页选择食谱，下单后订单会出现在这里。',
    PENDING_PAYMENT: '没有需要付款的订单。',
    IN_PROGRESS: '没有已付款或正在制作的订单。',
    WAIT_RECEIVE: '没有等待收货的订单。',
    RECEIVED: '没有已完成订单。',
    AFTERSALE: '没有售后中的订单。',
    CANCELLED: '没有已取消订单。',
  };
  return copyMap[selectedStatus.value] || '这里暂时没有订单。';
});

onMounted(async () => {
  loadOrders();
});

onLoad((options: any) => {
  // 获取页面参数，判断是否查看所有订单
  // 如果URL参数中有viewAll=true，则查看所有订单（管理员模式）
  if (options && options.viewAll === 'true') {
    viewAllOrders.value = true;
  }
  if (options && typeof options.status === 'string') {
    const matchedTab = statusTabs.value.find(
      (tab) => tab.value === options.status,
    );
    if (matchedTab) {
      selectedStatus.value = matchedTab.value;
    }
  }
});

onShow(async () => {
  // Refresh orders when page becomes visible (e.g., after creating new order)
  loadOrders();
});

async function loadOrders() {
  if (DEBUG) {
    const token = getToken();
    console.log('[OrdersList] Loading orders', {
      token: token ? token.substring(0, 20) + '...' : 'none',
      viewAllOrders: viewAllOrders.value,
    });
  }

  uni.showLoading({ title: '加载中...' });

  // 根据页面参数决定调用哪个API
  // viewAll=true 时调用管理员API查看所有订单，否则调用普通API只看自己的订单
  const apiUrl = viewAllOrders.value ? '/admin/orders' : '/orders';

  // 管理员视角看的是「全部顾客的鲜食订单」，而补剂列表接口只返回「我自己的」，
  // 合进来会把管理员本人的补剂订单混进别人的订单里，所以只在顾客视角合并。
  const supplementPromise: Promise<SupplementOrderRow[]> = viewAllOrders.value
    ? Promise.resolve([])
    : fetchAllSupplementOrders().catch((err) => {
        // 补剂这一路失败不能让鲜食订单一起白屏：降级成「本次没有补剂订单」
        console.error('[OrdersList] 加载补剂订单失败:', err);
        return [] as SupplementOrderRow[];
      });

  try {
    const [res, supplementOrders] = await Promise.all([
      request({
        url: apiUrl,
        method: 'GET',
      }),
      supplementPromise,
    ]);

    if (DEBUG) {
      console.log('[OrdersList] Response:', {
        code: res.code,
        orderCount: res.data?.length || 0,
        supplementCount: supplementOrders.length,
        viewAllOrders: viewAllOrders.value,
      });
      console.log(
        '[OrdersList] Orders Data:',
        JSON.stringify(res.data, null, 2),
      );
      if (res.data && res.data.length > 0) {
        console.log(
          '[OrdersList] First Order:',
          JSON.stringify(res.data[0], null, 2),
        );
        console.log('[OrdersList] First Order Items:', res.data[0].items);
      }
    }

    if (res.code === 0 && res.data) {
      // 管理员API返回的是 { list, total } 结构，普通用户API返回的是数组
      const rawOrders = Array.isArray(res.data) ? res.data : res.data.list || [];
      const foodOrders: FoodOrderRow[] = rawOrders.map((order: Order) => ({
        ...order,
        _orderType: 'food' as const,
      }));
      allOrders.value = mergeOrdersByCreatedAtDesc(foodOrders, supplementOrders);
      updateStatusCounts();
      filterOrders();
    }
  } catch (err) {
    console.error('Load orders error:', err);
  } finally {
    uni.hideLoading();
  }
}

/**
 * 把「我的补剂订单」按页拿全。
 *
 * 这个接口是分页的（后端每页上限 100），而本页要在本地做筛选和数量统计，
 * 少拿一页就会出现「筛选里没有、但订单确实存在」和排序断裂。
 */
async function fetchAllSupplementOrders(): Promise<SupplementOrderRow[]> {
  const collected: SupplementOrderRow[] = [];
  let page = 1;

  while (page <= SUPPLEMENT_ORDER_MAX_PAGES) {
    const res = await fetchSupplementOrders({
      page,
      pageSize: SUPPLEMENT_ORDER_PAGE_SIZE,
    });
    if (res.code !== 0 || !res.data) break;

    const items = res.data.items || [];
    collected.push(
      ...items.map((order) => ({ ...order, _orderType: 'supplement' as const })),
    );

    if (items.length === 0 || collected.length >= Number(res.data.total || 0)) {
      break;
    }
    page += 1;
  }

  return collected;
}

/**
 * 两类订单混排：按 createdAt 一起倒序，而不是「先鲜食后补剂」。
 * 时间缺失或非法时按 0 处理，避免 NaN 把整段排序搞乱。
 */
function mergeOrdersByCreatedAtDesc(
  foodOrders: FoodOrderRow[],
  supplementOrders: SupplementOrderRow[],
): UnifiedOrder[] {
  return [...foodOrders, ...supplementOrders].sort(
    (a, b) => toCreatedAtTime(b.createdAt) - toCreatedAtTime(a.createdAt),
  );
}

function toCreatedAtTime(value?: string): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

// 更新各状态订单数量
// Phase 9: Simplified status counts aligned with e-commerce standards
// Phase 9.1: Added PURCHASING, FREEZING and AFTERSALE status counts
function updateStatusCounts() {
  statusTabs.value.forEach((tab) => {
    tab.count = getOrdersByTab(tab.value).length;
  });
}

// 根据选中状态筛选订单
// Phase 9: Simplified filter logic
function filterOrders() {
  orders.value = getOrdersByTab(selectedStatus.value);
}

/**
 * 筛选口径：鲜食这套映射原样保留（后端已经把多个内部状态归并好），
 * 补剂订单的状态码和鲜食有交集但不完全一样（多了 PACKING / PACKED），
 * 所以单独一套，避免两边以后各自改动时互相污染。
 */
const FOOD_STATUS_GROUPS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PENDING_PAYMENT'],
  IN_PROGRESS: ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING'],
  WAIT_RECEIVE: ['SHIPPED'],
  RECEIVED: ['COMPLETED'],
  AFTERSALE: ['AFTERSALE'],
  CANCELLED: ['CANCELLED'],
};

const SUPPLEMENT_STATUS_GROUPS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PENDING_PAYMENT'],
  IN_PROGRESS: ['PAID', 'PACKING', 'PACKED'],
  WAIT_RECEIVE: ['SHIPPED'],
  RECEIVED: ['COMPLETED'],
  AFTERSALE: ['AFTERSALE'],
  CANCELLED: ['CANCELLED'],
};

function getStatusesForTab(
  status: string,
  orderType: OrderType = 'food',
): string[] | null {
  const statusGroups =
    orderType === 'supplement' ? SUPPLEMENT_STATUS_GROUPS : FOOD_STATUS_GROUPS;
  return statusGroups[status] || null;
}

function getOrdersByTab(status: string): UnifiedOrder[] {
  if (status === 'ALL') {
    return allOrders.value;
  }

  return allOrders.value.filter((order) => {
    const statuses = getStatusesForTab(status, order._orderType);
    // 未知筛选值（例如 URL 里传进来的野状态码）退化为精确匹配当前状态
    return statuses ? statuses.includes(order.status) : order.status === status;
  });
}

// 选择状态
function selectStatus(status: string) {
  selectedStatus.value = status;
  filterOrders();
}

function viewOrder(orderId: string) {
  uni.navigateTo({
    url: `/pages/order-detail/index?id=${orderId}`,
  });
}

/**
 * 补剂没有独立详情页，卡片上已经把订单号、状态、明细、物流、售后、金额展示全了。
 * 所以点补剂卡片不再跳转——跳过去也只能落在一个「不指向这一单」的列表页上。
 */
function handleOrderTap(order: UnifiedOrder) {
  if (order._orderType !== 'food') return;
  viewOrder(order.id);
}

function goHome() {
  uni.switchTab({
    url: '/pages/home/index',
  });
}

function hasQuickActions(order: UnifiedOrder): boolean {
  return Boolean(order.id);
}

function requestWechatPayment(payment: WechatPaymentResult): Promise<void> {
  return requestWechatOrderPayment(payment);
}

async function payOrderFromList(orderId: string) {
  if (payingOrderId.value) return;

  try {
    payingOrderId.value = orderId;
    uni.showLoading({ title: '调起支付中...' });

    const res = await createWechatPayment(orderId);
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '支付失败');
    }

    uni.hideLoading();
    await requestWechatPayment(res.data);
    uni.showToast({
      title: '支付成功',
      icon: 'success',
    });
    loadOrders();
  } catch (error: any) {
    const errorMessage = error?.errMsg?.includes('cancel')
      ? '未扣款，订单仍为待付款'
      : error instanceof Error
        ? error.message
        : '支付失败，请重试';
    uni.showToast({
      title: errorMessage,
      icon: 'none',
    });
  } finally {
    payingOrderId.value = '';
    uni.hideLoading();
  }
}

/**
 * 补剂支付：流程与鲜食不同——支付通道不可用时由 runSupplementPayment
 * 降级为「人工确认收款」，订单照样保留。
 * 这里直接复用那个封装（以及补剂订单页的提示口径），不再另写一套支付。
 */
async function paySupplementFromList(order: SupplementOrderRow) {
  if (payingSupplementId.value) return;

  payingSupplementId.value = order.id;
  try {
    const outcome = await runSupplementPayment(order.id);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
      await loadOrders();
      return;
    }

    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付', icon: 'none' });
      return;
    }

    if (outcome === 'MANUAL') {
      uni.showModal({
        title: '暂不能在线支付',
        content: '我们会尽快与你联系确认收款，订单已为你保留。',
        showCancel: false,
      });
      return;
    }

    uni.showToast({ title: '支付失败，请重试', icon: 'none' });
  } finally {
    payingSupplementId.value = '';
  }
}

/** 补剂概要：「N 种 · 共 M 袋」，加量时再标出份数 */
function formatSupplementSummary(order: SupplementOrderRow): string {
  const parts = [
    `${(order.items || []).length} 种`,
    `共 ${order.bagCount || 0} 袋`,
  ];

  const portions = Number(order.portionMultiplier);
  if (Number.isFinite(portions) && portions > 1) {
    parts.push(`加量 ${Math.round(portions)} 份`);
  }

  return parts.join(' · ');
}

/** 补剂用量是「12.5 平勺」这类数值，整数不补小数位，与补剂订单页口径一致 */
function formatSupplementAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);
}

function viewLogistics(order: FoodOrderRow) {
  if (!order.trackingNumber) {
    uni.showToast({
      title: '暂无物流信息',
      icon: 'none',
    });
    return;
  }

  uni.showModal({
    title: '物流信息',
    content: `快递公司：${getCarrierName(order.carrierCode)}\n运单号：${order.trackingNumber}`,
    confirmText: '复制单号',
    cancelText: '关闭',
    success: (res) => {
      if (!res.confirm) return;
      uni.setClipboardData({
        data: order.trackingNumber || '',
        success: () => {
          uni.showToast({ title: '已复制', icon: 'success' });
        },
      });
    },
  });
}

async function confirmReceivedFromList(order: FoodOrderRow) {
  if (receivingOrderId.value) return;

  uni.showModal({
    title: '确认收货',
    content: '确认已经收到商品了吗？',
    success: async (res) => {
      if (!res.confirm) return;

      try {
        receivingOrderId.value = order.id;
        uni.showLoading({ title: '确认中...' });
        await confirmWechatReceiptBeforeInternalComplete(order);
        const result = await request({
          url: `/orders/${order.id}/complete`,
          method: 'POST',
        });
        if (result.code !== 0) {
          throw new Error(result.message || '确认失败');
        }
        uni.showToast({
          title: '已确认收货',
          icon: 'success',
        });
        loadOrders();
      } catch (error: any) {
        uni.showToast({
          title: error?.message || '确认失败',
          icon: 'none',
        });
      } finally {
        receivingOrderId.value = '';
        uni.hideLoading();
      }
    },
  });
}

/**
 * 进入售后申请页。
 *
 * 原先写死 type=REFUND，但"已完成且超过 7 天"的订单其实只允许投诉建议，
 * 顾客会被带到一个默认选中"申请退款"的页面，提交时才被拒绝。
 * 现在按"当前状态下第一个真正允许的类型"进入。
 */
function applyAftersale(order: FoodOrderRow) {
  const status = String(order.status || '');
  const completedAt = order.completedAt;

  // 已付款（未采购）→ 取消订单；已发货/已完成 → 售后；其余（锁定期）→ 投诉建议
  const type = canCancelOrder(status) || canApplyRefund(status, completedAt)
    ? 'REFUND'
    : canApplyRemake(status, completedAt)
      ? 'REMAKE'
      : 'COMPLAINT';

  uni.navigateTo({
    url: `/pages/aftersale-apply/index?orderId=${order.id}&type=${type}`,
  });
}

function getRepurchasePackageCount(item: Order['firstItem']): number {
  const packageCount = Number(item?.packageCount);
  if (Number.isFinite(packageCount) && packageCount > 0) {
    return Math.round(packageCount);
  }

  const packagePlanTotal = (item?.packagePlan || []).reduce((sum, row) => {
    const rowCount = Number(row?.packageCount);
    return Number.isFinite(rowCount) && rowCount > 0 ? sum + rowCount : sum;
  }, 0);

  return packagePlanTotal > 0 ? Math.round(packagePlanTotal) : 0;
}

function getRepurchasePackageSpecG(item: Order['firstItem']): number {
  const packageSpecG = Number(item?.packageSpecG);
  if (Number.isFinite(packageSpecG) && packageSpecG > 0) {
    return Math.round(packageSpecG);
  }

  const firstPlanRow = (item?.packagePlan || []).find((row) => {
    const rowSpec = Number(row?.packageSpecG);
    return Number.isFinite(rowSpec) && rowSpec > 0;
  });

  return firstPlanRow ? Math.round(Number(firstPlanRow.packageSpecG)) : 0;
}

function buildBuyAgainQueryPairs(order: FoodOrderRow, recipeId: string): string[] {
  const firstItem = order.firstItem;
  const queryPairs = [
    `recipeId=${encodeURIComponent(recipeId)}`,
    `autoConfig=true`,
  ];

  if (firstItem?.dogId) {
    queryPairs.push(`dogId=${encodeURIComponent(firstItem.dogId)}`);
  }

  const packageCount = getRepurchasePackageCount(firstItem);
  if (packageCount > 0) {
    queryPairs.push(`packageCount=${packageCount}`);
  }

  const packageSpecG = getRepurchasePackageSpecG(firstItem);
  if (packageSpecG > 0) {
    queryPairs.push(`packageSpecG=${packageSpecG}`);
    queryPairs.push(`perMealG=${packageSpecG}`);
  }

  return queryPairs;
}

async function buyAgain(order: FoodOrderRow) {
  const recipeId = order.firstItem?.recipeSnapshot?.id;
  if (!recipeId) {
    uni.showToast({
      title: '食谱信息不完整',
      icon: 'none',
    });
    return;
  }

  try {
    uni.showLoading({ title: '检查中...' });
    const res = await request({
      url: `/recipes/${recipeId}`,
      method: 'GET',
    });

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '获取食谱信息失败');
    }

    if (!['PUBLIC', 'ACTIVE'].includes(res.data.status)) {
      uni.showModal({
        title: '提示',
        content: '该食谱已下架，无法再次购买',
        showCancel: false,
      });
      return;
    }

    const queryPairs = buildBuyAgainQueryPairs(order, recipeId);
    uni.hideLoading();
    uni.navigateTo({
      url: `/pages/recipe-order/index?${queryPairs.join('&')}`,
    });
  } catch (error) {
    console.error('Check recipe error:', error);
    uni.showToast({
      title: '检查食谱失败',
      icon: 'none',
    });
  } finally {
    uni.hideLoading();
  }
}

function formatAmount(amount?: number): string {
  if (!amount) return '0.00';
  return amount.toFixed(2);
}

// 判断待付款订单是否已支付超时（与详情页逻辑一致）
function isPaymentExpired(order: FoodOrderRow): boolean {
  if (order.status !== 'PENDING_PAYMENT') return false;
  if (order.paymentAutoCloseEnabled !== true) return false;
  if (order.paymentRemainingSeconds != null) {
    return order.paymentRemainingSeconds <= 0;
  }
  if (order.paymentDeadline) {
    return new Date(order.paymentDeadline).getTime() <= Date.now();
  }
  return false;
}

function getStatusText(orderOrStatus: UnifiedOrder | string): string {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string') {
    // 补剂的 PACKING / PACKED 在鲜食状态表里不存在，若不单独处理会兜底成「处理中」，
    // 顾客看不出订单卡在哪一步，所以走补剂自己的中文映射。
    if (orderOrStatus._orderType === 'supplement') {
      return SUPPLEMENT_ORDER_STATUS_LABELS[status] || getOrderStatusText(status)
    }
    if (isRefundedOrder(orderOrStatus)) {
      return '已退款（钱款原路退回）'
    }
    if (isPaymentExpired(orderOrStatus)) {
      return '已超时关闭'
    }
  }
  // Phase 9: Simplified status text aligned with e-commerce standards
  // Phase 9.1: Added PURCHASING, FREEZING and AFTERSALE status text
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    PURCHASING: '采购中',
    IN_PRODUCTION: '生产中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中',
  };
  return statusMap[status] || getOrderStatusText(status);
}

function getStatusColor(orderOrStatus: UnifiedOrder | string): string {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string') {
    if (orderOrStatus._orderType === 'supplement') {
      return SUPPLEMENT_STATUS_COLORS[status] || '#999'
    }
    if (isRefundedOrder(orderOrStatus)) {
      return '#16a34a'
    }
    if (isPaymentExpired(orderOrStatus)) {
      return '#999'
    }
  }
  // Phase 9: Simplified status colors aligned with e-commerce standards
  // Phase 9.1: Added PURCHASING, FREEZING and AFTERSALE status colors
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#52c41a',
    PURCHASING: '#faad14',
    IN_PRODUCTION: '#1890ff',
    FREEZING: '#722ed1',
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d',
  };
  return colorMap[status] || '#999';
}

function isRefundedOrder(order: FoodOrderRow): boolean {
  return order.status === 'CANCELLED' && order.refundStatus?.success === true
}

function getCarrierName(code?: string): string {
  const carrierMap: Record<string, string> = {
    SF: '顺丰速运',
    STO: '申通快递',
    YTO: '圆通速递',
    ZTO: '中通快递',
    EMS: 'EMS',
  };
  return carrierMap[code || ''] || code || '-';
}

function formatDogInfo(order: FoodOrderRow): string {
  if (!order.firstItem || !order.firstItem.dog) {
    return '';
  }

  const dog = order.firstItem.dog;
  const dogName = dog.name || '';
  const breedName = dog.breedName || '';
  const weightKg = dog.weightKg || 0;

  const parts = [dogName];
  if (breedName) parts.push(breedName);
  if (weightKg > 0) parts.push(`${weightKg}kg`);

  return parts.join(' · ');
}

function getRecipeName(order: FoodOrderRow): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return '';
  }
  return order.firstItem.recipeSnapshot.name || '';
}

function getRecipeCoverImage(order: FoodOrderRow): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return '';
  }
  return order.firstItem.recipeSnapshot.coverImageUrl || '';
}

function getTotalMeals(order: FoodOrderRow): number {
  if (!order.firstItem) {
    return 0;
  }
  return order.firstItem.packageCount || 0;
}

function getMealWeight(order: FoodOrderRow): number {
  if (!order.firstItem) {
    return 0;
  }

  const firstItem = order.firstItem;

  // ✅ 修复：直接返回用户配置的包装规格（每袋重量 = 每餐饭量）
  // 这是用户下单时确认并支付的数据，而不是系统推荐值
  return firstItem.packageSpecG || 0;
}

function formatPackagePlan(item: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
  packageSpecG?: number;
  packageCount?: number;
}): string {
  const packagePlanRows = (item.packagePlan || [])
    .map((row) => {
      const packageSpecG = Number(row?.packageSpecG);
      const packageCount = Number(row?.packageCount);
      if (
        !Number.isFinite(packageSpecG) ||
        !Number.isFinite(packageCount) ||
        packageSpecG <= 0 ||
        packageCount <= 0
      ) {
        return '';
      }
      return `${packageSpecG}g×${packageCount}袋`;
    })
    .filter(Boolean);

  if (packagePlanRows.length > 0) {
    return packagePlanRows.join('，');
  }

  return `${item.packageSpecG || 0}g×${item.packageCount || 0}袋`;
}

function formatAddress(address?: { regionText?: string }): string {
  if (!address || !address.regionText) {
    return '';
  }

  // 只显示第一个地区（市级）
  const regions = address.regionText.split(/\s+/);
  return regions[0] || address.regionText;
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-top: 0;
  padding-bottom: 136rpx;
}

/* 状态筛选Tab */
.status-tabs {
  display: flex;
  background-color: #fbfcf7;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  overflow-x: auto;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 20rpx;
  background-color: #fbfcf7;
  display: flex;
  align-items: center;
  gap: 4rpx;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #1e3a2f;
}

.tab-text {
  font-size: 26rpx;
  color: #26261f;
}

.tab-item.active .tab-text {
  color: #f3eddd;
  font-weight: bold;
}

.tab-count {
  font-size: 22rpx;
  color: #6b6653;
}

.tab-item.active .tab-count {
  color: #f3eddd;
}

.order-list {
  padding: 20rpx 0;
}

.order-item {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.06);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #eef1e2;
}

.order-time {
  font-size: 26rpx;
  color: #6b6653;
}

.order-header-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

/* 补剂类型标签：暖金底 + 深金字，与「我的」页的次级提示同一套色，不使用旧蓝色系 */
.order-type-tag {
  flex-shrink: 0;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  background: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.45);
  color: #8a6b33;
  font-size: 20rpx;
  font-weight: 700;
}

/* 补剂明细行：名称占满剩余宽度，用量与金额右对齐（与补剂订单页同一排版逻辑） */
.supplement-item-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 6rpx 0;
}

.supplement-item-name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: #26261f;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.supplement-item-amount {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #6b6653;
}

.supplement-item-price {
  flex-shrink: 0;
  min-width: 120rpx;
  font-size: 24rpx;
  color: #b4553f;
  text-align: right;
}

.order-status {
  font-size: 28rpx;
  font-weight: bold;
}

.order-dogs {
  margin-bottom: 16rpx;
}

.dogs-text {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.order-summary {
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
}

.summary-text {
  font-size: 26rpx;
  color: #26261f;
}

.order-items {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.recipe-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}

.recipe-cover {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.recipe-name {
  flex: 1;
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
  min-width: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.meal-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.meal-text {
  font-size: 26rpx;
  color: #26261f;
  min-width: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.meal-separator {
  font-size: 26rpx;
  color: #968f6d;
}

.order-address {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.address-text {
  font-size: 26rpx;
  color: #26261f;
}

.order-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8rpx;
}

.amount-label {
  font-size: 26rpx;
  color: #26261f;
}

.amount-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #b4553f;
}

.order-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  flex-wrap: wrap;
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #eef1e2;
}

.action-btn {
  min-width: 152rpx;
  height: 60rpx;
  line-height: 1;
  padding: 0 22rpx;
  margin: 0;
  border-radius: 30rpx;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.order-expired-text {
  align-self: center;
  font-size: 24rpx;
  color: #6b6653;
}

.action-btn::after,
.empty-action::after {
  border: none;
}

.action-btn.primary {
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
}

.action-btn.secondary {
  color: #26261f;
  background: #eef2e4;
}

.action-btn[disabled] {
  color: #968f6d;
  background: #1e3a2f;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
  text-align: center;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
  margin-bottom: 14rpx;
}

.empty-text {
  width: 520rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #6b6653;
}

.empty-action {
  width: 240rpx;
  height: 72rpx;
  line-height: 1;
  margin-top: 32rpx;
  border-radius: 36rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #f3eddd;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.customer-service-bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  background-color: #fbfcf7;
  box-shadow: 0 -8rpx 28rpx rgba(30, 46, 36, 0.08);
  box-sizing: border-box;
}

.customer-service-bottom-action {
  width: 100%;
}
</style>
