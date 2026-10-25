<template>
  <view class="container">
    <!-- 登录态过期：与原来的定制专属列表同一套处理，删页不能把这条体验弄丢 -->
    <view v-if="needLogin" class="state-block">
      <text class="state-title">登录已过期</text>
      <text class="state-text">登录已过期，请重新登录后再查看订单</text>
      <button class="state-btn" @tap="goToLogin">去登录</button>
    </view>

    <!-- 状态筛选Tab -->
    <!--
      类型筛选（2026-10-18 加，老板定"按类型筛"）。
      放在状态筛选**上面**：先想"我要找哪种单"，再想"它到哪一步了"。
      与状态筛选**叠加生效**（不是二选一）—— 两个维度互相独立。
    -->
    <view v-if="!needLogin" class="type-tabs">
      <view
        v-for="tab in TYPE_TABS"
        :key="tab.value"
        class="type-tab"
        :class="{ active: selectedType === tab.value }"
        @tap="selectType(tab.value)"
      >
        <text class="type-tab-text">{{ tab.label }}</text>
      </view>
    </view>

    <view v-if="viewAllOrders && !needLogin" class="view-all-banner">
      <view class="view-all-banner__head">
        <text class="view-all-banner__badge">测试视图</text>
        <text class="view-all-banner__title">全部顾客成品鲜食 + 我的定制/补剂测试单</text>
      </view>
      <text class="view-all-banner__desc">
        这里不是普通顾客的“我的订单”；定制/补剂卡片上的「我的测试单」来自当前管理员账号。
      </text>
    </view>

    <view v-if="!needLogin" class="status-tabs">
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

    <view
      v-if="!needLogin && loadFailed && allOrders.length === 0"
      class="state-block"
    >
      <text class="state-title">订单加载失败</text>
      <text class="state-text">请检查网络后重试</text>
      <button class="state-btn" @tap="loadOrders">重新加载</button>
    </view>

    <view
      v-if="
        !needLogin &&
        ((loadFailed && allOrders.length > 0) || partialLoadFailed)
      "
      class="load-warning"
    >
      <text class="load-warning__text">{{ loadWarningText }}</text>
      <text class="load-warning__retry" @tap="loadOrders">重试</text>
    </view>

    <view
      v-if="!needLogin && !(loadFailed && allOrders.length === 0)"
      class="order-list"
    >
      <view
        v-for="order in orders"
        :key="`${order._orderType}-${order.id}`"
        class="order-item"
        @tap="handleOrderTap(order)"
      >
        <!-- 订单时间和状态 -->
        <view class="order-header">
          <view class="order-header-main">
            <!--
              分类标识放最左侧（2026-10-24）：
              顾客扫一眼先知道"这是哪类单"，再看时间和状态。
              名称统一走 utils/order-type.ts，不再各页写"定制/成品/补剂"。
            -->
            <text
              class="order-type-tag"
              :class="`order-type-tag--${order._orderType || 'food'}`"
            >
              {{ orderTypeLabel(order._orderType || 'food') }}
            </text>
            <text
              v-if="viewAllOrders && order._orderType !== 'food'"
              class="order-type-tag order-type-tag--test"
            >
              我的测试单
            </text>
            <view
              class="order-type-stripe"
              :class="`order-type-stripe--${order._orderType || 'food'}`"
            />
            <text class="order-time">
              下单时间 {{ formatShortDateTime(order.createdAt) }}
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
          定制单（2026-10-18 并入）。
          顾客找的是"我给狗定的那份食谱"，所以标题用**食谱名**，
          没交付时显示「设计中的定制食谱」—— 订单号不是他要找的东西。
          整卡可点，进定制订单详情。
        -->
        <template v-if="order._orderType === 'custom'">
          <view class="order-summary">
            <text class="summary-title">{{ customOrderTitle(order) }}</text>
            <text v-if="customOrderSubtitle(order)" class="custom-order-sub">
              {{ customOrderSubtitle(order) }}
            </text>
            <text v-if="customRefundText(order)" class="custom-order-refund">
              {{ customRefundText(order) }}
            </text>
          </view>
          <!-- 金额与成品/补剂同一套：标签和数值一起靠右 -->
          <view class="order-amount">
            <text class="amount-label">订单金额</text>
            <text class="amount-value"
              >¥{{ formatAmountText(customOrderAmount(order)) }}</text
            >
          </view>
          <view class="order-actions" @tap.stop>
            <button
              v-if="order.status === 'PENDING_PAYMENT' && !isCustomPaymentExpired(order)"
              class="action-btn primary"
              :disabled="payingCustomId === order.orderId"
              @tap="payCustomFromList(order)"
            >
              {{ payingCustomId === order.orderId ? '调起支付中' : '继续支付' }}
            </button>
            <text
              v-if="order.status === 'PENDING_PAYMENT' && isCustomPaymentExpired(order)"
              class="order-expired-text"
            >
              支付已超时，订单已关闭
            </text>
            <button
              v-if="customRefundEntryLabel(order)"
              class="action-btn secondary"
              @tap="goCustomRefund(order)"
            >
              {{ customRefundEntryLabel(order) }}
            </button>
            <button
              v-if="
                order.status !== 'PENDING_PAYMENT' &&
                customAftersaleAction(order)?.enabled &&
                !isCustomRefundBlockingAftersale(order)
              "
              class="action-btn secondary"
              @tap="applyCustomAftersale(order)"
            >
              申请售后
            </button>
            <button
              v-if="order.status !== 'PENDING_PAYMENT'"
              class="action-btn secondary"
              @tap="reCustomize(order)"
            >
              再次定制
            </button>
          </view>
        </template>

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

          <view v-if="order.aftersaleType || order.hasOpenAftersale" class="order-address">
            <text class="address-text">
              售后 {{ order.hasOpenAftersale ? (order.openAftersaleLabel || '售后中') : getAftersaleLabel(order.aftersaleType) }}{{
                order.aftersaleReason ? ' · ' + order.aftersaleReason : ''
              }}
            </text>
          </view>

          <view class="order-address">
            <text class="address-text">
              预计发货 {{ order.packingDate || '待管理员排期' }}
            </text>
          </view>

          <!-- 补发单：0 元、免费补寄，必须让顾客一眼看出这不是新买的一单 -->
          <view v-if="order.reshipFromOrderId" class="order-address">
            <text class="address-text">本单为免费补发，不收任何费用</text>
          </view>
        </template>

        <!-- 商品数量（鲜食口径，补剂用上面的概要行） -->
        <view v-if="order._orderType === 'food'" class="order-summary">
          <text class="summary-text">{{ order.itemCount || 0 }}件商品</text>
        </view>

        <!-- 如果有详细商品信息，显示更多信息 -->
        <template v-if="order._orderType === 'food' && order.firstItem">
          <!-- 狗狗信息（现货试吃装不绑狗狗，不显示这一行） -->
          <view v-if="!isStockOrderRow(order)" class="order-dogs">
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
              <text v-if="isStockOrderRow(order)" class="meal-text"
                >{{ getStockSets(order) }}套 · 共{{ getTotalMeals(order) }}袋</text
              >
              <text v-else class="meal-text"
                >共{{ getTotalMeals(order) }}餐</text
              >
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

        <!-- 金额：定制单已在上面的定制卡片里展示，避免出现 ¥0.00 的第二行 -->
        <view v-if="order._orderType !== 'custom'" class="order-amount">
          <text class="amount-label">订单金额</text>
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
          <button
            v-if="order._orderType === 'supplement'"
            class="action-btn secondary"
            @tap="viewSupplementDetail(order.id)"
          >
            查看详情
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

    <view v-if="!needLogin" class="customer-service-bottom-bar">
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { request, getToken } from '@/utils/api';
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
import { ORDER_TYPE_META, ORDER_TYPE_TABS, orderTypeLabel } from '../../utils/order-type';
// 定制单（2026-10-18 并入三单合一）
import {
  fetchMyOrders,
  findAction,
  type CustomRecipeOrderDetail,
} from '@/api/custom-recipe';
import {
  describeCustomRecipeRefund,
  formatDate,
  isPaymentExpired,
} from '@/utils/custom-recipe-order';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';
import {
  CUSTOM_RECIPE_GOAL_SET,
  CUSTOM_RECIPE_STATUS_SET,
  useOptionSet,
} from '@/utils/option-set';
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

const { ensure: ensureGoalOptions, labelOf: goalLabel } = useOptionSet(
  CUSTOM_RECIPE_GOAL_SET,
);

/**
 * 定制单状态中文（2026-10-24）。
 *
 * 定制专属列表删除后，统一列表成了唯一入口；此前它用的是本页的 statusMap，
 * 里面没有 IN_PROGRESS / DELIVERED —— 定制单会露出英文码。
 * 这里改用后端的选项字典，和原来的专属列表同一份来源。
 */
const { ensure: ensureCustomStatusOptions, labelOf: customStatusLabel } =
  useOptionSet(CUSTOM_RECIPE_STATUS_SET);

// DEBUG flag for development logging
const DEBUG = true;

// 补剂订单列表接口有分页（后端每页上限 100）。合并列表要在本地筛选和排序，
// 所以这里按页拿全；MAX_PAGES 只是防止 total 异常时死循环的兜底。
const SUPPLEMENT_ORDER_PAGE_SIZE = 100;
const SUPPLEMENT_ORDER_MAX_PAGES = 20;

interface Order {
  id: string;
  /** 定制单的业务编号（跨类型模板里用于支付按钮） */
  orderId?: string;
  status: string;
  /** 订单类型：FRESH_FOOD / CUSTOM_SERVICE / TASTING_PACK */
  type?: string;
  cancellationReason?: string | null;
  aftersaleType?: string | null;
  /** 本单是哪张原单的补发单；普通订单为 null */
  reshipFromOrderId?: string | null;
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
type OrderType = 'food' | 'supplement' | 'custom';

type FoodOrderRow = Order & { _orderType: 'food' };

type SupplementOrderRow = SupplementOrder & { _orderType: 'supplement' };

/**
 * 定制单（2026-10-18 并入）。
 *
 * 顾客在这里看到的是"我给狗定的那份食谱"，所以卡片标题用**食谱名**，
 * 没交付时显示「设计中的定制食谱」—— 订单号不是他要找的东西。
 */
type CustomOrderRow = CustomRecipeOrderDetail & { _orderType: 'custom' };

type UnifiedOrder = FoodOrderRow | SupplementOrderRow | CustomOrderRow;

// 状态筛选Tab
const selectedStatus = ref<string>('ALL');

/**
 * 类型筛选（2026-10-24 文案收口）。
 *
 * 名称统一走 `utils/order-type.ts`：食谱定制 / 成品鲜食 / 预分装补剂。
 * 以前这里写死"定制 / 成品 / 补剂"，和卡片角标、专属列表各一份。
 */
type TypeFilter = 'ALL' | 'custom' | 'food' | 'supplement';
const TYPE_TABS = ORDER_TYPE_TABS;
const selectedType = ref<TypeFilter>('ALL');

function selectType(value: TypeFilter) {
  selectedType.value = value;
  filterOrders();
}

const allOrders = ref<UnifiedOrder[]>([]);
const orders = ref<UnifiedOrder[]>([]);
const viewAllOrders = ref(false); // 是否查看所有订单（从工作台进入时为true）
const payingOrderId = ref('');
const receivingOrderId = ref('');
const payingSupplementId = ref('');
const payingCustomId = ref('');
const nowTick = ref(Date.now());
let paymentClockTimer: ReturnType<typeof setInterval> | null = null;
/** 登录态过期（2026-10-24 从定制专属列表迁过来） */
const needLogin = ref(false);
/** 主列表加载失败；有旧数据时保留旧数据，只提示 */
const loadFailed = ref(false);
/** 定制单 / 补剂单部分失败，不影响鲜食列表 */
const customOrdersLoadFailed = ref(false);
const supplementOrdersLoadFailed = ref(false);
const partialLoadFailed = computed(
  () => customOrdersLoadFailed.value || supplementOrdersLoadFailed.value,
);
const loadWarningText = computed(() => {
  const failed: string[] = [];
  if (loadFailed.value) failed.push('鲜食订单');
  if (customOrdersLoadFailed.value) failed.push('定制订单');
  if (supplementOrdersLoadFailed.value) failed.push('补剂订单');
  return `${failed.join('、')}加载失败，其他订单仍可查看`;
});
const CUSTOM_ORDER_PAGE_SIZE = 50;
const CUSTOM_ORDER_MAX_PAGES = 20;

function isAuthError(error: any): boolean {
  const message = String(error?.message || error || '');
  return message.includes('Authentication required') || message.includes('401');
}

function goToLogin() {
  const redirect = encodeURIComponent('/pages/orders-list/index');
  uni.navigateTo({ url: `/pages/login/index?redirect=${redirect}` });
}

/**
 * 状态 Tab（2026-10-24 精简 + 按类型换词）。
 *
 * 三类订单的状态语义不同：
 *   · 成品：制作中 / 待收货
 *   · 补剂：分装中 / 待收货
 *   · 定制：定制中 / 待确认
 * 所以 Tab 的 value 固定、label 随 selectedType 变；数量也跟着类型重算。
 * "已取消"不再单独占一个 Tab —— 取消的单在"全部"里显示灰色状态。
 */
type StatusTabKey =
  | 'ALL'
  | 'PENDING_PAYMENT'
  | 'IN_PROGRESS'
  | 'WAIT_RECEIVE'
  | 'COMPLETED'
  | 'AFTERSALE';

const STATUS_TAB_KEYS: StatusTabKey[] = [
  'ALL',
  'PENDING_PAYMENT',
  'IN_PROGRESS',
  'WAIT_RECEIVE',
  'COMPLETED',
  'AFTERSALE',
];

const STATUS_TAB_LABELS: Record<TypeFilter, Record<StatusTabKey, string>> = {
  ALL: {
    ALL: '全部',
    PENDING_PAYMENT: '待付款',
    IN_PROGRESS: '进行中',
    WAIT_RECEIVE: '待收货/确认',
    COMPLETED: '已完成',
    AFTERSALE: '售后中',
  },
  custom: {
    ALL: '全部',
    PENDING_PAYMENT: '待付款',
    IN_PROGRESS: '定制中',
    WAIT_RECEIVE: '待确认',
    COMPLETED: '已完成',
    AFTERSALE: '售后中',
  },
  food: {
    ALL: '全部',
    PENDING_PAYMENT: '待付款',
    IN_PROGRESS: '制作中',
    WAIT_RECEIVE: '待收货',
    COMPLETED: '已完成',
    AFTERSALE: '售后中',
  },
  supplement: {
    ALL: '全部',
    PENDING_PAYMENT: '待付款',
    IN_PROGRESS: '分装中',
    WAIT_RECEIVE: '待收货',
    COMPLETED: '已完成',
    AFTERSALE: '售后中',
  },
};

const statusTabs = computed(() =>
  STATUS_TAB_KEYS.map((key) => ({
    value: key,
    label: STATUS_TAB_LABELS[selectedType.value][key],
    count: getOrdersByTab(key).length,
  })),
);

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
    IN_PROGRESS: '没有进行中的订单。',
    WAIT_RECEIVE: '没有等待收货 / 确认的订单。',
    COMPLETED: '没有已完成订单。',
    AFTERSALE: '没有售后中的订单。',
  };
  return copyMap[selectedStatus.value] || '这里暂时没有订单。';
});

onMounted(async () => {
  ensureGoalOptions();
  ensureCustomStatusOptions();
  paymentClockTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 15000);
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
  if (!viewAllOrders.value && !getToken()) {
    needLogin.value = true;
    return;
  }
  needLogin.value = false;
  loadFailed.value = false;
  supplementOrdersLoadFailed.value = false;
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
  /**
   * 测试视图也要带当前管理员自己的补剂测试单；顾客视图同样只返回自己的。
   * 补剂这一路失败不能让鲜食订单一起白屏：降级成空数组，但页面要提示。
   */
  const supplementPromise: Promise<SupplementOrderRow[]> =
    fetchAllSupplementOrders().catch((err) => {
      console.error('[OrdersList] 加载补剂订单失败:', err);
      supplementOrdersLoadFailed.value = true;
      return [] as SupplementOrderRow[];
    });

  const foodPromise = request({
    url: apiUrl,
    method: 'GET',
  }).catch((error) => {
    if (isAuthError(error)) {
      needLogin.value = true;
      return null;
    }
    console.error('[OrdersList] 加载鲜食订单失败:', error);
    loadFailed.value = true;
    return null;
  });

  try {
    const [res, supplementOrders, customOrders] = await Promise.all([
      foodPromise,
      supplementPromise,
      // 定制单（2026-10-18 并入）—— 内部已吞异常但有失败标记
      fetchAllCustomOrders(),
    ]);

    if (needLogin.value) return;

    if (DEBUG) {
      console.log('[OrdersList] Response:', {
        code: res.code,
        orderCount: res.data?.length || 0,
        supplementCount: supplementOrders.length,
        customCount: customOrders.length,
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

    const foodOrders: FoodOrderRow[] =
      res && res.code === 0 && res.data
        ? (Array.isArray(res.data) ? res.data : res.data.list || []).map(
            (order: Order) => ({
              ...order,
              _orderType: 'food' as const,
            }),
          )
        : [];
    if (!res) {
      loadFailed.value = true;
    } else if (res.code !== 0) {
      loadFailed.value = true;
    }

    allOrders.value = mergeOrdersByCreatedAtDesc(
      foodOrders,
      supplementOrders,
      customOrders,
    );
    filterOrders();
  } catch (err) {
    console.error('Load orders error:', err);
    if (isAuthError(err)) {
      needLogin.value = true;
    } else {
      loadFailed.value = true;
    }
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
  customOrders: CustomOrderRow[] = [],
): UnifiedOrder[] {
  return [...foodOrders, ...supplementOrders, ...customOrders].sort(
    (a, b) => toCreatedAtTime(b.createdAt) - toCreatedAtTime(a.createdAt),
  );
}

/**
 * 拉定制单（2026-10-18 并入）。
 *
 * 失败返回空数组，不让整个列表挂掉 —— 顾客至少还能看到成品和补剂订单。
 */
async function fetchAllCustomOrders(): Promise<CustomOrderRow[]> {
  customOrdersLoadFailed.value = false;
  const collected: CustomOrderRow[] = [];
  let page = 1;

  while (page <= CUSTOM_ORDER_MAX_PAGES) {
    try {
      const data = await fetchMyOrders({
        page,
        pageSize: CUSTOM_ORDER_PAGE_SIZE,
      });
      if (!data) {
        customOrdersLoadFailed.value = true;
        break;
      }
      const list = (data.orders || []) as CustomRecipeOrderDetail[];
      collected.push(
        ...list.map((order) => ({
          ...order,
          id: order.orderId,
          _orderType: 'custom' as const,
        })),
      );

      const total = Number(data.total || 0);
      if (
        list.length === 0 ||
        list.length < CUSTOM_ORDER_PAGE_SIZE ||
        (total > 0 && collected.length >= total)
      ) {
        break;
      }
      page += 1;
    } catch (error) {
      console.warn('[OrdersList] 拉取定制单失败:', error);
      customOrdersLoadFailed.value = true;
      break;
    }
  }

  return collected;
}

function toCreatedAtTime(value?: string): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

// 根据选中状态筛选订单（类型过滤也在 getOrdersByTab 里，避免两处口径）
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
  COMPLETED: ['COMPLETED'],
  AFTERSALE: ['AFTERSALE'],
  CANCELLED: ['CANCELLED'],
};

const SUPPLEMENT_STATUS_GROUPS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PENDING_PAYMENT'],
  IN_PROGRESS: ['PAID', 'PACKING', 'PACKED'],
  WAIT_RECEIVE: ['SHIPPED'],
  COMPLETED: ['COMPLETED'],
  AFTERSALE: ['AFTERSALE'],
  CANCELLED: ['CANCELLED'],
};

/**
 * 定制单的状态分组（2026-10-18，2026-10-24 补 IN_PROGRESS）。
 *
 * 定制单的状态名跟成品不一样（PENDING_PAYMENT / PAID / IN_PROGRESS /
 * DELIVERED / COMPLETED / CANCELLED），不能直接套用 FOOD_STATUS_GROUPS。
 *
 * ⚠️ 售后中的定制单状态仍是 DELIVERED，售后只是一个标记 ——
 * 所以"售后中"Tab 不能只看 status，要走 isAftersaleOrder()。
 */
const CUSTOM_STATUS_GROUPS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PENDING_PAYMENT'],
  IN_PROGRESS: ['PAID', 'IN_PROGRESS'],
  WAIT_RECEIVE: ['DELIVERED'],
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['CANCELLED'],
};

function getStatusesForTab(
  status: string,
  orderType: OrderType = 'food',
): string[] | null {
  const statusGroups =
    orderType === 'custom'
      ? CUSTOM_STATUS_GROUPS
      : orderType === 'supplement'
        ? SUPPLEMENT_STATUS_GROUPS
        : FOOD_STATUS_GROUPS;
  return statusGroups[status] || null;
}

/**
 * 这一单是不是"售后中"。
 *
 * 成品/补剂有 AFTERSALE 状态；定制单没有，后端把状态标签覆盖成"售后中"，
 * 底层 status 仍是 DELIVERED。所以定制单必须读 renderable，不能只看 status。
 */
function isAftersaleOrder(order: UnifiedOrder): boolean {
  if (order._orderType === 'custom') {
    if (isCustomRefundRequestOpen(order)) return true;
    const label = (order as CustomOrderRow).renderable?.status?.label;
    if (label === '售后中') return true;
    return Boolean((order as unknown as { hasOpenAftersale?: boolean }).hasOpenAftersale);
  }
  return (
    order.status === 'AFTERSALE' ||
    Boolean((order as unknown as { hasOpenAftersale?: boolean }).hasOpenAftersale)
  );
}

function getOrdersByTab(
  status: string,
  type: OrderType | 'ALL' = selectedType.value,
): UnifiedOrder[] {
  const sameType =
    type === 'ALL'
      ? allOrders.value
      : allOrders.value.filter((order) => order._orderType === type);

  if (status === 'ALL') {
    return sameType;
  }

  if (status === 'AFTERSALE') {
    return sameType.filter((order) => isAftersaleOrder(order));
  }

  return sameType.filter((order) => {
    // 有未处理售后的单只出现在"售后中"，不在"待确认/已完成"里重复出现
    if (isAftersaleOrder(order)) return false;
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
/**
 * 定制单卡片的三行文案（2026-10-18）。
 *
 * 标题用**食谱名**（没交付时「设计中的定制食谱」）—— 顾客认的是"给我家狗做的那份"，
 * 不是订单号。副标题给"给谁 + 交付日期"，这是他在这一页真正想知道的两件事。
 */
function customOrderTitle(order: UnifiedOrder): string {
  const row = order as CustomOrderRow;
  if (row.status === 'CANCELLED') return '已取消的定制食谱';
  if (row.status === 'PENDING_PAYMENT') return '待付款的定制食谱';
  const name = (row.recipeName || '').trim();
  return name || '设计中的定制食谱';
}

/**
 * 定制卡副标题（2026-10-24 改）：
 * 只给"给谁 · 什么品种 · 多重 · 几份"。
 * 定制目标、预计交付日期从卡片上拿掉 —— 它们是详情页的信息，
 * 列表卡要让人一眼认出"这是我家哪只狗的那份"。
 */
function customOrderSubtitle(order: UnifiedOrder): string {
  const row = order as CustomOrderRow;
  const parts: string[] = [];
  if (row.dogName) parts.push(row.dogName);
  if (row.dogBreedName) parts.push(row.dogBreedName);
  const weight = Number(row.dogWeightKg);
  if (Number.isFinite(weight) && weight > 0) parts.push(`${weight}kg`);
  const quantity = Number(row.recipeQuantity);
  if (Number.isFinite(quantity) && quantity > 0) {
    parts.push(`${quantity} 份`);
  }
  return parts.join(' · ');
}

function customRefundRequest(order: UnifiedOrder) {
  return order._orderType === 'custom'
    ? ((order as CustomOrderRow).refundRequest ?? null)
    : null;
}

function isCustomRefundRequestOpen(order: UnifiedOrder): boolean {
  const request = customRefundRequest(order);
  return Boolean(
    request && ['PENDING', 'PROCESSING'].includes(String(request.status)),
  );
}

/**
 * 有退款申请时不再让顾客同时去提「调整食谱」——
 * 退款是资金动作，两个流程并行会让后台和顾客都分不清。
 * 被驳回/失败后可以再调整或重新申请。
 */
function isCustomRefundBlockingAftersale(order: UnifiedOrder): boolean {
  const request = customRefundRequest(order);
  return Boolean(
    request &&
      ['PENDING', 'PROCESSING', 'REFUNDED'].includes(String(request.status)),
  );
}

/** 定制卡退款入口：未开始/制作中/已交付都可以进退款页；有申请时看进度 */
function customRefundEntryLabel(order: UnifiedOrder): string {
  if (order._orderType !== 'custom') return '';
  const row = order as CustomOrderRow;
  if (
    !['PAID', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED'].includes(
      String(row.status || ''),
    )
  ) {
    return '';
  }
  const request = row.refundRequest;
  if (request) {
    if (
      ['PENDING', 'PROCESSING', 'REFUNDED'].includes(String(request.status))
    ) {
      return '退款进度';
    }
    return '再次申请退款';
  }
  return '退款';
}

function goCustomRefund(order: UnifiedOrder) {
  const row = order as CustomOrderRow;
  uni.navigateTo({
    url: `/pages/custom-recipe/refund?orderId=${encodeURIComponent(row.orderId)}`,
  });
}

/** 已取消的定制单：退款进展（退款中 / 已退款 / 退款失败） */
function customRefundText(order: UnifiedOrder): string {
  const request = customRefundRequest(order);
  if (request) {
    const status = String(request.status);
    if (status === 'REJECTED' || status === 'FAILED') {
      const note = String(request.adminNote || '').trim();
      return note
        ? `审核说明：${note}`
        : status === 'REJECTED'
          ? '退款未通过'
          : '退款失败';
    }
    // 审核中/处理中/成功已经在卡片顶部状态显示，避免重复
    return '';
  }
  return describeCustomRecipeRefund(order as any)?.text || '';
}

function customOrderAmount(order: UnifiedOrder): number {
  const row = order as CustomOrderRow;
  const value = Number(row.amount);
  return Number.isFinite(value) ? value : 0;
}

/** 金额显示：整数不带小数，有角分才保留两位 */
function formatAmountText(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function viewSupplementDetail(id: string) {
  uni.navigateTo({
    url: `/pages/supplement-order-detail/index?orderId=${encodeURIComponent(id)}`,
  })
}

function handleOrderTap(order: UnifiedOrder) {
  if (order._orderType === 'custom') {
    uni.navigateTo({
      url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(
        (order as CustomOrderRow).orderId,
      )}`,
    });
    return;
  }
  if (order._orderType === 'supplement') {
    uni.navigateTo({
      url: `/pages/supplement-order-detail/index?orderId=${encodeURIComponent(order.id)}`,
    });
    return;
  }
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

function isCustomPaymentExpired(order: UnifiedOrder): boolean {
  const row = order as CustomOrderRow;
  return isPaymentExpired(row.paymentDeadlineAt ?? null, nowTick.value);
}

/**
 * 定制单列表的「继续支付」。
 * 订单列表原先只给成品/补剂支付按钮，定制待付款只能点进详情再付。
 */
async function payCustomFromList(order: CustomOrderRow) {
  if (payingCustomId.value) return;
  if (isCustomPaymentExpired(order)) {
    uni.showToast({ title: '支付已超时，订单已关闭', icon: 'none' });
    await loadOrders();
    return;
  }
  payingCustomId.value = order.orderId;
  try {
    const outcome = await runCustomRecipePayment(order.orderId);
    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
    } else if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可稍后再付', icon: 'none' });
    } else if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新定制', icon: 'none' });
    }
    await loadOrders();
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '支付失败，请稍后重试',
      icon: 'none',
    });
  } finally {
    payingCustomId.value = '';
  }
}

function customAftersaleAction(order: UnifiedOrder) {
  return findAction(
    (order as CustomOrderRow).renderable,
    'APPLY_AFTERSALE',
  );
}

function applyCustomAftersale(order: UnifiedOrder) {
  uni.navigateTo({
    url: `/pages/custom-recipe/aftersale?orderId=${encodeURIComponent(
      (order as CustomOrderRow).orderId,
    )}`,
  });
}

function reCustomize(order: UnifiedOrder) {
  const row = order as CustomOrderRow;
  const query = row.dogId
    ? `?dogId=${encodeURIComponent(String(row.dogId))}`
    : '';
  uni.navigateTo({ url: `/pages/custom-recipe/index${query}` });
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
    /**
     * 定制单：状态中文以后端渲染契约为准，缺了再回落到选项字典。
     * 统一列表原先的 statusMap 没有 IN_PROGRESS / DELIVERED，
     * 定制单会露出英文码（专属列表删除后，这里成了唯一入口）。
     */
    if (orderOrStatus._orderType === 'custom') {
      const request = customRefundRequest(orderOrStatus);
      if (request) {
        const requestStatus = String(request.status);
        const labels: Record<string, string> = {
          PENDING: '退款审核中',
          PROCESSING: '退款处理中',
          REFUNDED: '退款成功',
          REJECTED: '退款未通过',
          FAILED: '退款失败',
        };
        if (labels[requestStatus]) return labels[requestStatus];
      }
      // 查不到也必须给中文，绝不把 IN_PROGRESS / DELIVERED 这类码漏给顾客
      const label =
        orderOrStatus.renderable?.status?.label || customStatusLabel(status);
      return label || '状态待确认';
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
    if (orderOrStatus._orderType === 'custom') {
      const request = customRefundRequest(orderOrStatus);
      if (request) {
        const requestStatus = String(request.status);
        if (['PENDING', 'PROCESSING'].includes(requestStatus)) return '#faad14';
        if (requestStatus === 'REFUNDED') return '#52c41a';
        return '#f5222d';
      }
      const tone = String(orderOrStatus.renderable?.status?.tone || '')
      const toneColors: Record<string, string> = {
        success: '#52c41a',
        warning: '#faad14',
        danger: '#f5222d',
        info: '#1890ff',
        progress: '#1890ff',
        neutral: '#999',
        muted: '#999',
      }
      if (toneColors[tone]) return toneColors[tone]
      if (status === 'PENDING_PAYMENT') return '#ff9800'
      if (status === 'CANCELLED') return '#999'
      return '#52c41a'
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

/**
 * 售后类型的展示文案。
 *
 * 原先写成"不是退款就是免费补发"，加了"重做"以后就会把重做也说成补发，
 * 顾客按这句话去找客服要补寄就会对不上，所以按类型逐项列出。
 */
function getAftersaleLabel(type?: string | null): string {
  const labels: Record<string, string> = {
    REFUND: '退款',
    REMAKE: '重做',
    COMPLAINT: '投诉建议',
    RESOLVED: '已处理',
    RESHIP: '免费补发',
  };
  return labels[type || ''] || '处理中';
}

/** 试吃装（现货）订单：不绑狗狗、没有"餐"的概念，展示口径与鲜食不同 */
function isStockOrderRow(order: FoodOrderRow): boolean {
  return order.type === 'TASTING_PACK';
}

/**
 * 现货订单的套数。
 *
 * 总袋数 ÷ 每套袋数即可还原买了几个套装；
 * 拿不到分装明细时退化成总袋数，宁可显示得粗一点，也不要显示 0。
 */
function getStockSets(order: FoodOrderRow): number {
  const firstItem = order.firstItem;
  if (!firstItem) return 0;
  const plan = firstItem.packagePlan || [];
  const perSet = plan.reduce((sum, row) => sum + (row.packageCount || 0), 0);
  if (perSet <= 0) return firstItem.packageCount || 0;
  return Math.max(1, Math.round((firstItem.packageCount || 0) / perSet));
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

onUnmounted(() => {
  if (paymentClockTimer) {
    clearInterval(paymentClockTimer);
    paymentClockTimer = null;
  }
});
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-top: 0;
  padding-bottom: 136rpx;
}

/* 状态筛选：文字 Tab + 下划线，与上面的分段式类型筛选同一套节奏 */
.view-all-banner {
  margin: 8rpx 20rpx 4rpx;
  padding: 18rpx 20rpx;
  border-radius: 14rpx;
  background: #eef3e8;
  border: 1rpx solid #d9e4d1;
}

.view-all-banner__head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}

.view-all-banner__badge {
  flex: 0 0 auto;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  background: #1e3a2f;
  color: #f6efe0;
  font-size: 18rpx;
  font-weight: 700;
}

.view-all-banner__title {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.view-all-banner__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 19rpx;
  line-height: 1.55;
  color: #6b6653;
}

.order-type-tag--test {
  background: #1e3a2f;
  border-color: #1e3a2f;
  color: #f6efe0;
}

.status-tabs {
  display: flex;
  background-color: transparent;
  padding: 10rpx 20rpx 0;
  margin-bottom: 8rpx;
  overflow-x: auto;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  flex-shrink: 0;
  padding: 14rpx 18rpx;
  margin-right: 4rpx;
  border-radius: 0;
  background-color: transparent;
  border-bottom: 4rpx solid transparent;
  display: flex;
  align-items: center;
  gap: 4rpx;
  transition: color 0.2s, border-color 0.2s;
}

.tab-item.active {
  background-color: transparent;
  border-bottom-color: #c6a15b;
}

.tab-text {
  font-size: 26rpx;
  color: #6b6653;
}

.tab-item.active .tab-text {
  color: #1e3a2f;
  font-weight: 700;
}

.tab-count {
  font-size: 20rpx;
  color: #9a927f;
}

.tab-item.active .tab-count {
  color: #b08d4f;
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

.order-header-main {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: 1;
  min-width: 0;
}

.order-time {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 24rpx;
  color: #8a7a66;
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
  flex-shrink: 0;
  margin-left: 12rpx;
  font-size: 26rpx;
  font-weight: 700;
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
  justify-content: flex-end;
  align-items: baseline;
  gap: 8rpx;
  padding-top: 10rpx;
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

.custom-order-amount {
  margin-left: 8rpx;
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

/* ===== 定制单（2026-10-18 并入三单合一）===== */
.order-type-tag--food {
  background: #e8f5e9;
  color: #2e7d32;
}

/* 类型色条：定制橙 / 成品绿 / 补剂紫（需求 2.10） */
.order-type-stripe {
  width: 4rpx;
  height: 26rpx;
  align-self: center;
  border-radius: 999rpx;
  background: #2e7d32;
}

.order-type-stripe--custom {
  background: #b45309;
}

.order-type-stripe--supplement {
  background: #7c3aed;
}

.order-type-tag--custom {
  background: #fff1e3;
  color: #b45309;
}

.order-type-tag--supplement {
  background: #f3e8ff;
  color: #7c3aed;
}

.custom-order-sub {
  display: block;
  font-size: 22rpx;
  color: #8a7a66;
  margin-top: 8rpx;
  line-height: 1.5;
}

.custom-order-refund {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #b45309;
  line-height: 1.5;
}

/* ===== 类型筛选（2026-10-18）===== */
/* 类型筛选：一个分段控件（4 段共用一个容器），不再每段各自描边 */
.type-tabs {
  display: flex;
  gap: 4rpx;
  margin: 8rpx 20rpx 0;
  padding: 6rpx;
  background: #f1ead9;
  border-radius: 999rpx;
}

.type-tab {
  flex: 1;
  text-align: center;
  border-radius: 999rpx;
  padding: 12rpx 0;
  background: transparent;
  border: none;
  transition: background 0.2s, box-shadow 0.2s;
}

.type-tab.active {
  background: #fffdf7;
  box-shadow: 0 4rpx 14rpx rgba(30, 58, 47, 0.08);
}

.type-tab-text {
  font-size: 24rpx;
  color: #6e5f4b;
}

.type-tab.active .type-tab-text {
  color: #1e3a2f;
  font-weight: 700;
}
/* 登录态过期的空态（从定制专属列表迁过来，2026-10-24） */
.load-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin: 8rpx 20rpx 0;
  padding: 18rpx 20rpx;
  border-radius: 12rpx;
  background: #fff7ed;
  border: 1rpx solid #f1dcc2;
}

.load-warning__text {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.5;
  color: #b45309;
}

.load-warning__retry {
  flex: 0 0 auto;
  font-size: 22rpx;
  font-weight: 700;
  color: #1e5b35;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 160rpx 48rpx;
}

.state-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.state-text {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #8a7a66;
  text-align: center;
}

.state-btn {
  margin-top: 32rpx;
  padding: 0 48rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 26rpx;
}

</style>
