<template>
  <view class="detail-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <view v-else-if="needLogin" class="state-block">
      <text class="state-title">登录已过期</text>
      <text class="state-text">请重新登录后再查看这张定制订单</text>
      <button class="retry-btn" @tap="goToLogin">去登录</button>
    </view>

    <view v-else-if="loadFailed" class="state-block">
      <text class="state-title">订单加载失败</text>
      <text class="state-text">请检查网络后重试</text>
      <button class="retry-btn" @tap="loadOrderDetail">重新加载</button>
    </view>

    <template v-else>
      <view class="status-card" :class="`status-card--${statusTone}`">
        <text class="status-text">{{ statusText }}</text>
        <text class="status-order-id">订单号 {{ order.orderId }}</text>
        <!-- 待付款时限：直接决定这单会不会被自动取消 -->
        <text v-if="paymentHint" class="status-deadline">{{ paymentHint }}</text>
        <!--
          后端下发的「给顾客的一句话」。
          比状态名多一层"所以呢" —— 顾客看到"制作中"仍然不知道要等多久。
        -->
        <text v-if="statusHint" class="status-hint">{{ statusHint }}</text>
      </view>

      <!--
        进度时间轴（2026-10-16）：
        节点集合与文案**由后端下发**，后台加一个内部环节时小程序不用发版。
        老后端不返回 progress 时整块不显示，页面照常可用。
      -->
      <view v-if="progressSteps.length" class="section progress-section">
        <view class="section-title">进度</view>
        <view class="progress-track">
          <view
            v-for="step in progressSteps"
            :key="step.code"
            class="progress-node"
            :class="{
              'progress-node--done': step.done,
              'progress-node--active': step.active,
            }"
          >
            <view class="progress-node__dot">{{ step.done ? '✓' : '' }}</view>
            <text class="progress-node__label">{{ step.label }}</text>
            <text
              v-if="step.note && (step.done || step.active)"
              class="progress-node__note"
            >{{ step.note }}</text>
          </view>
        </view>
      </view>

      <!-- 退款进度：顾客自助取消后钱去哪了，不能让他自己去猜 -->
      <view v-if="refund" class="refund-card" :class="`refund-card--${refund.tone}`">
        <text class="refund-card__title">退款金额</text>
        <text class="refund-card__text">{{ refund.text }}</text>
        <text v-if="refund.tone === 'processing'" class="refund-card__note">
          退款由微信原路退回，到账时间以微信为准，通常 1-3 个工作日。
        </text>
        <text v-if="refund.tone === 'failed'" class="refund-card__note">
          这笔钱还没有退回。请联系客服，我们会人工处理。
        </text>
      </view>

      <view class="section" v-if="creditVisible">
        <view class="section-title">成品抵扣额度</view>
        <view class="info-row">
          <text class="label">额度总额</text>
          <text class="value">¥{{ formatAmount(creditTotal) }}</text>
        </view>
        <view class="info-row">
          <text class="label">已抵扣</text>
          <text class="value">¥{{ formatAmount(creditUsed) }}</text>
        </view>
        <view class="info-row">
          <text class="label">剩余可用</text>
          <text class="value highlight">¥{{ formatAmount(creditRemaining) }}</text>
        </view>
        <text class="section-note">从这道定制食谱下成品单时可抵扣货款，没用完的额度可以下次继续用</text>
      </view>

      <view class="section">
        <view class="section-title">定制信息</view>
        <view class="info-row">
          <text class="label">定制对象</text>
          <text class="value">{{ order.dogName || '—' }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制目标</text>
          <text class="value">{{ goalText }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制费</text>
          <text class="value">¥{{ formatAmount(order.amount) }}</text>
        </view>
        <!-- 排期由系统自动定（顾客不选日期），这里只展示后端排好的结果 -->
        <view class="info-row" v-if="order.status !== 'CANCELLED'">
          <text class="label">预计交付</text>
          <text class="value">{{ formatDate(order.estimatedDeliveryDate, '排期中') }}</text>
        </view>
        <view class="info-row" v-else-if="order.cancelledAt">
          <text class="label">取消时间</text>
          <text class="value">{{ formatDate(order.cancelledAt, '已取消') }}</text>
        </view>
        <view class="info-row">
          <text class="label">提交时间</text>
          <text class="value">{{ formatDate(order.createdAt, '—') }}</text>
        </view>
      </view>

      <view class="section" v-if="hasRequirements">
        <view class="section-title">你的需求</view>
        <view class="tag-group" v-if="(order.medicalConditions || []).length">
          <text class="tag-label">疾病史</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.medicalConditions" :key="`c-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="order.allergyText">
          <text class="tag-label">过敏信息</text>
          <text class="allergy-text">{{ order.allergyText }}</text>
        </view>
        <view class="tag-group" v-else-if="(order.allergies || []).length">
          <text class="tag-label">过敏信息</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.allergies" :key="`a-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="order.allergyStatus">
          <text class="tag-label">过敏回答</text>
          <text class="allergy-text">{{ allergyAnswerText }}</text>
        </view>
        <view class="tag-group" v-if="currentFoodText">
          <text class="tag-label">现在主要喂什么</text>
          <text class="allergy-text">{{ currentFoodText }}</text>
        </view>
        <view class="tag-group" v-if="changeReasonText">
          <text class="tag-label">定制原因</text>
          <text class="allergy-text">{{ changeReasonText }}</text>
        </view>
        <view class="tag-group" v-if="stomachText">
          <text class="tag-label">最近肠胃</text>
          <text class="allergy-text">{{ stomachText }}</text>
        </view>
        <view class="tag-group" v-if="(order.preferredIngredients || []).length">
          <text class="tag-label">喜欢的食材</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.preferredIngredients" :key="`p-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.dislikedIngredients || []).length">
          <text class="tag-label">不吃的食材</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.dislikedIngredients" :key="`d-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="notes-block" v-if="order.additionalNotes">
          <text class="tag-label">其它需求</text>
          <text class="notes-text">{{ order.additionalNotes }}</text>
        </view>
      </view>

      <!-- 本单资料（2026-10-19）：报告草稿与备注附件 -->
      <view class="section" v-if="hasUploadedMaterials">
        <view class="section-title">本单资料</view>
        <view
          v-for="(report, reportIndex) in order.allergyReportDrafts || []"
          :key="`report-${reportIndex}`"
          v-show="(report.attachments || []).length"
          class="material-group"
        >
          <text class="material-title">检测报告 {{ reportIndex + 1 }}</text>
          <view class="material-thumbs">
            <view
              v-for="url in report.attachments || []"
              :key="url"
              class="material-thumb-wrap"
            >
              <image
                v-if="isImageAttachment(url)"
                class="material-thumb"
                :src="url"
                mode="aspectFill"
                @tap="previewMaterial(url)"
              />
              <view v-else class="material-doc" @tap="previewMaterial(url)">
                <text class="material-doc-badge">{{ attachmentFileLabel(url) }}</text>
                <text class="material-doc-label">报告</text>
              </view>
            </view>
          </view>
        </view>
        <view v-if="(order.attachments || []).length" class="material-group">
          <text class="material-title">其它附件</text>
          <view class="material-thumbs">
            <view
              v-for="url in order.attachments || []"
              :key="url"
              class="material-thumb-wrap"
            >
              <image
                v-if="isImageAttachment(url)"
                class="material-thumb"
                :src="url"
                mode="aspectFill"
                @tap="previewMaterial(url)"
              />
              <view v-else class="material-doc" @tap="previewMaterial(url)">
                <text class="material-doc-badge">{{ attachmentFileLabel(url) }}</text>
                <text class="material-doc-label">资料</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!--
        交付卡片（2026-10-16 批次 2.4）
        后端只给"第几版、什么时候交的、包含哪几样"，**不含内容本体** ——
        点进去才拉那几十 KB 的快照。这样订单页每次打开都不会被拖慢。
      -->
      <view class="section delivery-card" v-if="delivery">
        <view class="delivery-head">
          <text class="section-title">你的专属食谱</text>
          <text v-if="delivery.version > 1" class="delivery-version">
            第 {{ delivery.version }} 版
          </text>
        </view>
        <text class="recipe-name">{{ order.recipeName || '已交付的定制食谱' }}</text>
        <view class="delivery-items">
          <text
            v-for="code in delivery.itemCodes"
            :key="code"
            class="delivery-item"
          >
            {{ deliveryItemLabel(code) }}
          </text>
        </view>
        <text class="delivery-time">交付于 {{ formatDeliveryTime(delivery.deliveredAt) }}</text>

        <!-- 确认收到：文案与"能不能点"都由后端下发 -->
        <button
          v-if="confirmAction"
          class="recipe-btn"
          :loading="confirming"
          :disabled="confirming || !confirmAction.enabled"
          @tap="handleConfirmReceipt"
        >
          {{ confirmAction.label }}
        </button>
        <text
          v-if="confirmAction && !confirmAction.enabled && confirmAction.disabledReason"
          class="action-disabled-reason"
        >
          {{ confirmAction.disabledReason }}
        </text>

        <button class="recipe-btn ghost" @tap="viewDelivery">查看完整内容</button>
      </view>

      <!--
        「有问题」入口（批次 2.5）。
        按钮文案与"能不能点"由后端下发；不能点时把原因说出来。
      -->
      <view class="section" v-if="aftersaleAction || aftersaleCount > 0">
        <view class="section-title">售后与问题反馈</view>
        <text class="section-note">
          {{ aftersaleCount > 0
            ? `你有 ${aftersaleCount} 条反馈，处理进展在里面`
            : '食材买不到、吃了不适应、想改一版 —— 都可以在这里说' }}
        </text>
        <button
          class="recipe-btn"
          :disabled="aftersaleAction ? !aftersaleAction.enabled : false"
          @tap="viewAftersale"
        >
          {{ aftersaleCount > 0 ? '查看处理进展' : (aftersaleAction?.label || '有问题') }}
        </button>
        <text
          v-if="aftersaleAction && !aftersaleAction.enabled && aftersaleAction.disabledReason"
          class="action-disabled-reason"
        >
          {{ aftersaleAction.disabledReason }}
        </text>
      </view>

      <view class="action-bar">
        <button
          v-if="order.status === 'PENDING_PAYMENT'"
          class="btn primary"
          :loading="paying"
          :disabled="paying"
          @tap="goPay"
        >
          立即付款
        </button>
        <!--
          自助取消（决策 12）：还没开始制作就能取消；
          已付款的会**全额原路退回微信**，不需要等客服。

          2026-10-16：按钮文案与"能不能点"改由**后端下发**（`renderable.actions`）。
          此前这里是 `order.status === 'PENDING_PAYMENT' ? '取消订单' : '取消并退款'` ——
          前端在判断业务。老后端不返回 renderable 时回退到原来的判断。
        -->
        <button
          v-if="cancelAction"
          class="btn secondary"
          :loading="cancelling"
          :disabled="cancelling || paying || !cancelAction.enabled"
          @tap="cancelOrder"
        >
          {{ cancelAction.label }}
        </button>
        <!-- 不能点时把原因说出来：一个点不动又不说话的按钮，顾客只会以为系统坏了 -->
        <text
          v-if="cancelAction && !cancelAction.enabled && cancelAction.disabledReason"
          class="action-disabled-reason"
        >
          {{ cancelAction.disabledReason }}
        </text>
        <button class="btn secondary" @tap="goOrders">返回定制订单</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { getToken } from '@/utils/api';
import {
  cancelOrder as cancelOrderRequest,
  confirmReceipt as confirmReceiptRequest,
  fetchAftersales,
  fetchOrderDetail,
  fetchPublicConfig,
  findAction,
  toneToClass,
} from '@/api/custom-recipe';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  describeCustomRecipeRefund,
  formatAmount,
  formatDate,
} from '@/utils/custom-recipe-order';
import {
  CUSTOM_RECIPE_GOAL_SET,
  CUSTOM_RECIPE_STATUS_SET,
  useOptionSet,
} from '@/utils/option-set';


interface CustomRecipeOrderDetail {
  orderId?: string;
  dogName?: string;
  targetGoal?: string;
  scheduledDate?: string | null;
  estimatedDeliveryDate?: string | null;
  status?: string;
  amount?: number;
  creditAmount?: number;
  creditUsed?: number;
  creditRemaining?: number;
  recipeId?: string | null;
  recipeName?: string | null;
  allergies?: string[];
  /** 过敏自由文本（2026-10-19） */
  allergyText?: string | null;
  allergyStatus?: string | null;
  currentFoodMain?: string | null;
  currentFoodOther?: string | null;
  changeReasons?: string[];
  changeReasonOther?: string | null;
  stomachConditions?: string[];
  stomachOther?: string | null;
  /** 本单报告草稿（付款后转档案） */
  allergyReportDrafts?: Array<{
    attachments?: string[];
    testDate?: string | null;
    testMethod?: string | null;
    summary?: string | null;
  }>;
  /** 备注区其它附件 */
  attachments?: string[];
  medicalConditions?: string[];
  preferredIngredients?: string[];
  dislikedIngredients?: string[];
  additionalNotes?: string | null;
  createdAt?: string | null;
  /** 后端新增：支付截止时间与退款进度 */
  paymentDeadlineAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  cancelledAt?: string | null;
}

const orderId = ref('');
const loading = ref(true);
const loadFailed = ref(false);
const paying = ref(false);
const order = ref<CustomRecipeOrderDetail>({});

/** 登录已过期（401）：与"网络错误"分开表达，并给一个去登录的入口 */
const needLogin = ref(false);

/** 支付超时分钟数（0 = 不自动关单），来自后台公开配置 */
const paymentTimeoutMinutes = ref(0);

onLoad((options: any) => {
  // 目标/饲喂历史中文来自选项字典
  ensureGoalOptions();
  ensureCurrentFoodOptions();
  ensureChangeReasonOptions();
  ensureStomachOptions();
  ensureStatusOptions();
  orderId.value = options.orderId || '';
  void loadOrderDetail();
  void loadPaymentTimeoutConfig();
});

onPullDownRefresh(() => {
  void loadOrderDetail().finally(() => uni.stopPullDownRefresh());
});

/**
 * 读支付超时配置。
 *
 * 订单接口若还没下发 paymentDeadlineAt，就用它 + createdAt 估算剩余时间；
 * 读不到就不显示时限文案（不猜）。
 */
const loadPaymentTimeoutConfig = async () => {
  try {
    /**
     * 这里对失败是**容忍的**：只影响"还有多久支付"的文案。
     * 注意与 `fetchPublicConfig` 的区别 —— 那个用于展示**定制费**，
     * 失败必须报错（显示错价格比报错糟得多）；这个只是少一句话。
     */
    const config = await fetchPublicConfig();
    paymentTimeoutMinutes.value = Number(config.paymentTimeoutMinutes) || 0;
  } catch (error) {
    console.warn('[CustomRecipe] 读取支付超时配置失败:', error);
  }
};

const loadOrderDetail = async () => {
  if (!orderId.value) {
    loading.value = false;
    loadFailed.value = true;
    return;
  }

  // 未登录时直接切到"登录已过期"，不去打一次必然 401 的请求
  if (!getToken()) {
    loading.value = false;
    needLogin.value = true;
    return;
  }

  loading.value = true;
  loadFailed.value = false;
  needLogin.value = false;
  try {
    const detail = await fetchOrderDetail(orderId.value);

    /**
     * ⚠️ 这里用「先判空再赋值」而不是 `if (detail) { ... } else { ... }`。
     *
     * 原因：2026-10-16 我往 `if/else` 中间插了一段 try/catch，
     * 结果把 `else` 劈成了悬空的语法错误 —— **单元测试全绿，构建才报错**
     * （vitest 不完整编译 SFC）。项目规则要求改了小程序必须跑一次构建，
     * 就是防这个。保持这个写法，别再往 if/else 中间插东西。
     */
    if (!detail) {
      loadFailed.value = true;
      return;
    }
    order.value = detail as typeof order.value;

    /**
     * 已有的售后条数（只用于文案"你有 N 条反馈"）。
     *
     * 失败**不影响主流程** —— 订单详情本身已经拿到了，
     * 少一句话总比整页报错好。所以单独 try 一次。
     */
    try {
      const result = await fetchAftersales(orderId.value);
      aftersaleCount.value = result.items.length;
    } catch {
      aftersaleCount.value = 0;
    }
  } catch (error) {
    // 401 不能报成"网络错误"：那会让顾客去查自己的网络，方向完全错了
    if (isAuthError(error)) {
      needLogin.value = true;
      uni.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      return;
    }
    console.error('[CustomRecipe] 读取订单详情失败:', error);
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};

/**
 * 判断是不是"未登录/登录过期"。
 * request() 对 401 统一 reject 一个 message 为 'Authentication required' 的错误。
 */
const isAuthError = (error: any) => {
  const message = String(error?.message || error || '');
  return message.includes('Authentication required') || message.includes('401');
};

/** 去登录，登录后回到本页（沿用全站统一的 redirect 约定） */
const goToLogin = () => {
  const redirect = `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId.value)}`;
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
  });
};

/**
 * 状态文案（2026-10-16 起优先用**后端下发的**）。
 *
 * 后端从渲染契约里给 `renderable.status.label`，那份中文来自「选项字典」，
 * 运营在后台改一次三个端一起变。本地那份映射表只作为**老后端的兜底**，
 * 等全量上线后（批次 5）就可以删掉了。
 *
 * 注意这里没有"取不到就用默认值"的逻辑 —— 后端没给是**正常的**（老版本），
 * 所以老老实实退回本地表，而不是编一个。
 */
const statusText = computed(
  () =>
    order.value.renderable?.status?.label ||
    statusLabel(order.value.status) || '状态待确认',
);

/** 后端下发的"给顾客的一句话"；老后端没有就不显示 */
const statusHint = computed(
  () => order.value.renderable?.status?.customerHint || '',
);

/** 色彩档位（后端给语义档位，前端只做档位 → class 的映射） */
const statusTone = computed(() => toneToClass(order.value.renderable?.status?.tone));

/**
 * 进度时间轴。
 *
 * **后端没给就整块不显示** —— 不在这里编一条时间轴出来
 * （编出来的会和真实进度不一致，比不显示更糟）。
 */
const progressSteps = computed(() => order.value.renderable?.progress?.timeline || []);

/**
 * 交付摘要（来自订单详情，不含内容本体）。
 *
 * 与 `renderable` 里的动作配套：后端说"有交付"时才显示这张卡。
 */
const delivery = computed(() => order.value.delivery ?? null);

/** 「确认收到」这个动作 —— 文案与可用性全部由后端下发 */
const confirmAction = computed(() =>
  findAction(order.value.renderable, 'CONFIRM_RECEIPT'),
);

/** 交付物码 → 中文。码是后端定的，这里只做展示名 */
const DELIVERY_ITEM_LABELS: Record<string, string> = {
  RECIPE: '专属食谱',
  SHOPPING_SOP: '采购与制作单',
  NUTRITION_REPORT: '营养评估报告',
};
const deliveryItemLabel = (code: string) =>
  DELIVERY_ITEM_LABELS[code] || code;

const formatDeliveryTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const confirming = ref(false);

/**
 * 顾客确认收到。
 *
 * 幂等由后端保证，所以**不需要在前端挡重复点击** ——
 * 挡了反而会出现"点了没反应"的困惑。这里只在请求进行中禁一下按钮。
 */
const handleConfirmReceipt = async () => {
  if (confirming.value) return;

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '确认收到？',
      content:
        '确认后这单就完成了。如果食谱有问题，之后还可以在售后期内申请调整。',
      confirmText: '确认收到',
      cancelText: '再看看',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  confirming.value = true;
  try {
    const result = await confirmReceiptRequest(orderId.value);
    if (!result.ok) {
      throw new Error(result.message || '确认失败，请重试');
    }
    uni.showToast({
      title: result.alreadyConfirmed ? '你已经确认过了' : '已确认收到',
      icon: 'none',
    });
    // 重新拉一次详情：状态、动作、进度都由后端算，前端不自己改
    await loadOrderDetail();
  } catch (error) {
    uni.showToast({
      title: (error as Error)?.message || '确认失败，请重试',
      icon: 'none',
    });
  } finally {
    confirming.value = false;
  }
};

/**
 * 「有问题」这个动作与已有的售后条数（批次 2.5）。
 *
 * 条数只是给文案用（"你有 N 条反馈"）——
 * **能不能提新的、窗口过没过，一律以后端下发为准。**
 */
const aftersaleAction = computed(() =>
  findAction(order.value.renderable, 'APPLY_AFTERSALE'),
);
const aftersaleCount = ref(0);

const viewAftersale = () => {
  uni.navigateTo({
    url: `/pages/custom-recipe/aftersale?orderId=${encodeURIComponent(orderId.value)}`,
  });
};

/** 打开交付内容页 */
const viewDelivery = () => {
  uni.navigateTo({
    url: `/pages/custom-recipe/delivery?orderId=${encodeURIComponent(orderId.value)}`,
  });
};

/**
 * 「取消订单」这个动作。
 *
 * 后端算好了能不能点、为什么不能点、点了要确认什么。
 * 老后端不返回 renderable 时，回退到原来的本地判断。
 */
const cancelAction = computed(() => {
  const fromBackend = findAction(order.value.renderable, 'CANCEL_SELF');
  if (fromBackend) return fromBackend;

  // ---- 老后端兜底：把原来的判断原样搬过来，行为不变 ----
  if (!canSelfCancel.value) return undefined;
  return {
    code: 'CANCEL_SELF',
    label:
      order.value.status === 'PENDING_PAYMENT' ? '取消订单' : '取消并退款',
    enabled: true,
    confirmText: null,
    danger: true,
  };
});

/**
 * 目标文案来自选项字典（批次 5.1）—— 与状态同一套理由：
 * 本地那份表在后端加枚举时跟不上。
 * 取不到时给「—」，与原来的 fallback 一致。
 */
const { ensure: ensureGoalOptions, labelOf: goalLabel } = useOptionSet(
  CUSTOM_RECIPE_GOAL_SET,
);
const { ensure: ensureCurrentFoodOptions, labelOf: currentFoodLabel } =
  useOptionSet('custom_recipe_current_food');
const { ensure: ensureChangeReasonOptions, labelOf: changeReasonLabel } =
  useOptionSet('custom_recipe_change_reason');
const { ensure: ensureStomachOptions, labelOf: stomachLabel } =
  useOptionSet('custom_recipe_stomach');

/**
 * 状态中文：**优先用后端渲染契约里的**（`renderable.status.label`），
 * 没有（老后端）才退回选项字典；字典也查不到就兜成中文 ——
 * **绝不把英文枚举漏给顾客**。
 */
const {
  ensure: ensureStatusOptions,
  labelOf: statusLabel,
} = useOptionSet(CUSTOM_RECIPE_STATUS_SET);
const goalText = computed(() => {
  const goal = order.value.targetGoal;
  if (!goal) return '—';
  return goalLabel(goal) || '—';
});

const allergyAnswerText = computed(() => {
  const status = String(order.value.allergyStatus || '');
  if (status === 'HAS_ALLERGY') return '有过敏';
  if (status === 'NO_ALLERGY') return '明确回答：没有过敏';
  return '未回答';
});

const currentFoodText = computed(() => {
  const code = String(order.value.currentFoodMain || '');
  if (!code) return '';
  const label = currentFoodLabel(code) || code;
  const other = String(order.value.currentFoodOther || '').trim();
  return other ? `${label}（${other}）` : label;
});

const changeReasonText = computed(() => {
  const codes = order.value.changeReasons || [];
  const other = String(order.value.changeReasonOther || '').trim();
  if (codes.length === 0 && !other) return '';
  return `${codes.map((code) => changeReasonLabel(code) || code).join('、')}${
    other ? `（${other}）` : ''
  }`;
});

const stomachText = computed(() => {
  const codes = order.value.stomachConditions || [];
  const other = String(order.value.stomachOther || '').trim();
  if (codes.length === 0 && !other) return '';
  return `${codes.map((code) => stomachLabel(code) || code).join('、')}${
    other ? `（${other}）` : ''
  }`;
});

/** 退款进度：识别不出来就整块不显示（退款不能靠猜） */
const refund = computed(() => describeCustomRecipeRefund(order.value));

/** 支付时限：只在待付款时有意义 */
const paymentHint = computed(() => {
  if (order.value.status !== 'PENDING_PAYMENT') return '';
  return buildPaymentTimeoutHint({
    paymentDeadlineAt: order.value.paymentDeadlineAt ?? null,
    createdAt: order.value.createdAt ?? null,
    paymentTimeoutMinutes: paymentTimeoutMinutes.value,
  });
});

const creditTotal = computed(() => Number(order.value.creditAmount || 0));
const creditUsed = computed(() => Number(order.value.creditUsed || 0));

/**
 * 额度只在实际可用的订单状态下展示（2026-10-19）。
 * 已取消/待付款订单即使有快照金额，也不能拿这个额度去下成品单。
 */
const creditVisible = computed(() => {
  const status = String(order.value.status || '');
  return (
    ['PAID', 'IN_PROGRESS', 'DELIVERED'].includes(status) &&
    (creditRemaining.value > 0 || creditTotal.value > 0)
  );
});

/**
 * 可抵扣余额（2026-10-16 批次 5.2）。
 *
 * ⚠️ **直接取后端给的值，不在前端相减。**
 *
 * 以前这里留了一段兜底：`creditRemaining ?? (creditAmount - creditUsed)`。
 * 后端两个接口（订单列表与详情）**本来就会返回这个值**，
 * 所以那段兜底是死代码；而留着它的代价是：
 * 万一余额的算法变了（比如要考虑退款回冲），前端这份相减会**悄悄算错**，
 * 而且没人会想起来还有第二处。
 *
 * 老板的要求是「所有的计算交给后端，前端只负责渲染」——
 * 这一处就是那句话的直接体现。
 */
const creditRemaining = computed(() => Number(order.value.creditRemaining ?? 0));

const hasRequirements = computed(() => {
  const value = order.value;
  return Boolean(
    (value.medicalConditions || []).length ||
      (value.allergies || []).length ||
      Boolean(value.allergyText) ||
      (value.preferredIngredients || []).length ||
      (value.dislikedIngredients || []).length ||
      value.allergyStatus ||
      value.currentFoodMain ||
      (value.changeReasons || []).length ||
      value.changeReasonOther ||
      (value.stomachConditions || []).length ||
      value.stomachOther ||
      value.additionalNotes,
  );
});

const hasUploadedMaterials = computed(() => {
  const drafts = order.value.allergyReportDrafts || [];
  return (
    drafts.some((report) => (report.attachments || []).length > 0) ||
    (order.value.attachments || []).length > 0
  );
});

function attachmentExtension(url: unknown): string {
  const raw = String(url || '');
  const extMatch = raw.match(/[?&]ext=([a-z0-9]+)/i);
  if (extMatch) return `.${extMatch[1].toLowerCase()}`;
  const path = raw.split('?')[0].split('#')[0].toLowerCase();
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot) : '';
}

function isImageAttachment(url: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(
    attachmentExtension(url),
  );
}

function attachmentFileLabel(url: string): string {
  const ext = attachmentExtension(url);
  if (ext === '.pdf') return 'PDF';
  if (ext === '.doc' || ext === '.docx') return 'Word';
  return '文件';
}

function previewMaterial(url: string) {
  if (!url) return;
  if (isImageAttachment(url)) {
    uni.previewImage({ urls: [url] });
    return;
  }
  if (!['.pdf', '.doc', '.docx'].includes(attachmentExtension(url))) {
    uni.showToast({ title: '暂不支持预览这种文件', icon: 'none' });
    return;
  }
  uni.showLoading({ title: '打开中…' });
  uni.downloadFile({
    url,
    success: (res) => {
      uni.hideLoading();
      if (res.statusCode !== 200 || !res.tempFilePath) {
        uni.showToast({ title: '文件下载失败', icon: 'none' });
        return;
      }
      uni.openDocument({
        filePath: res.tempFilePath,
        showMenu: true,
        fail: () => uni.showToast({ title: '文件打开失败', icon: 'none' }),
      });
    },
    fail: () => {
      uni.hideLoading();
      uni.showToast({ title: '文件下载失败', icon: 'none' });
    },
  });
}

const viewRecipe = () => {
  if (!order.value.recipeId) return;
  uni.navigateTo({
    url: `/pages/recipe-detail/index?id=${encodeURIComponent(order.value.recipeId)}`,
  });
};

/**
 * 付款入口：优先走小程序内微信支付；
 * 支付通道不可用（返回 MANUAL）时，跳到提交成功页看客服收款方式，
 * 保证订单在任何情况下都能被付掉。
 */
const goPay = async () => {
  if (paying.value) return;

  const targetOrderId = order.value.orderId || orderId.value;
  if (!targetOrderId) return;

  paying.value = true;
  try {
    const outcome = await runCustomRecipePayment(targetOrderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
      await loadOrderDetail();
      return;
    }

    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可稍后再付', icon: 'none' });
      return;
    }

    if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新提交定制', icon: 'none' });
      await loadOrderDetail();
      return;
    }

    if (outcome === 'MANUAL') {
      uni.navigateTo({
        url: `/pages/custom-recipe/success?orderId=${encodeURIComponent(targetOrderId)}`,
      });
      return;
    }

    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    paying.value = false;
  }
};

/**
 * 能否自助取消（老板拍板的决策 12）。
 *
 * 只要还没开始制作就能取消 —— 待付款和已付款两个状态。
 * 制作中/已交付要联系客服（那时已经投入了人工）。
 */
const canSelfCancel = computed(() => {
  const status = String(order.value.status || '');
  return status === 'PENDING_PAYMENT' || status === 'PAID';
});

const cancelling = ref(false);

/**
 * 顾客自助取消订单。
 *
 * 已付款的走全额原路退款（后端调微信退款）；退款失败**不会**把订单取消掉，
 * 避免出现"取消了钱没退"这种最糟的结果 —— 所以要如实告诉顾客。
 */
const cancelOrder = async () => {
  if (cancelling.value) return;

  const paid = order.value.status === 'PAID';

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: paid ? '取消并退款？' : '取消订单？',
      content: paid
        ? '取消后定制费会全额原路退回微信，到账时间以微信为准。'
        : '取消后这一天的名额会释放，你可以重新下单。',
      confirmText: paid ? '取消并退款' : '确认取消',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });

  if (!confirmed) return;

  cancelling.value = true;
  uni.showLoading({ title: paid ? '退款中...' : '取消中...' });

  try {
    const result = await cancelOrderRequest(orderId.value);
    /**
     * API 层已经判过 code：失败时把后端的原因带回来。
     * 这里**不自己编原因** —— 后端说"已经开始设计了"，就照它说。
     */
    if (!result.ok) {
      throw new Error(result.message || '取消失败');
    }

    uni.hideLoading();

    /**
     * 退款结果当场就说，不等详情接口。
     *
     * 退款是钱的事：后端在取消响应里已经回了 refundStatus（PROCESSING/FAILED…），
     * 如果只统一提示"退款已发起"，退款失败时顾客会以为钱在路上，
     * 一直到他自己去翻订单才发现 —— 那可能是几天后了。
     */
    const refundOutcome = describeCustomRecipeRefund({
      refundStatus: result.refundStatus ?? null,
    });

    if (refundOutcome?.tone === 'failed') {
      uni.showToast({
        title: '已取消，但退款未成功，请联系客服',
        icon: 'none',
        duration: 3000,
      });
    } else if (refundOutcome?.tone === 'done') {
      uni.showToast({ title: '已取消，退款已原路退回', icon: 'none' });
    } else {
      uni.showToast({
        title: paid ? '已取消，退款已发起' : '已取消',
        icon: 'none',
      });
    }

    await loadOrderDetail();
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({
      title: error?.message || '取消失败，请联系客服',
      icon: 'none',
      duration: 3000,
    });
  } finally {
    cancelling.value = false;
  }
};

const goOrders = () => {
  uni.redirectTo({ url: '/pages/custom-recipe/orders' });
};
</script>

<style scoped>

/* ===== 交付卡片（2026-10-16 批次 2.4）===== */
.delivery-card {
  border: 1rpx solid rgba(216, 188, 133, 0.4);
}

.delivery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.delivery-version {
  padding: 4rpx 14rpx;
  font-size: 22rpx;
  color: #1e3a2f;
  background: rgba(216, 188, 133, 0.9);
  border-radius: 100rpx;
}

.delivery-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin: 16rpx 0 8rpx;
}

.delivery-item {
  padding: 8rpx 18rpx;
  font-size: 24rpx;
  color: #f4ecd8;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 100rpx;
}

.delivery-time {
  display: block;
  margin-bottom: 20rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.5);
}

.recipe-btn.ghost {
  margin-top: 16rpx;
  color: #f4ecd8;
  background: transparent;
  border: 1rpx solid rgba(216, 188, 133, 0.5);
}


/* ===== 2026-10-16 渲染契约新增的样式 ===== */

/*
 * 后端下发的「给顾客的一句话」。
 * 比状态名淡一点：它是解释，不是标题。
 */
.status-hint {
  margin-top: 4rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
}

/*
 * 色彩档位 → 左侧一道色条。
 * 刻意不做整卡变色：状态卡是深绿底，整卡换色会跟全站配色打架。
 */
.status-card--warning { border-left: 8rpx solid #e6a23c; }
.status-card--info { border-left: 8rpx solid #7aa7d8; }
.status-card--progress { border-left: 8rpx solid #6fb3a0; }
.status-card--success { border-left: 8rpx solid #7bc48a; }
.status-card--danger { border-left: 8rpx solid #e08b8b; }
.status-card--neutral { border-left: 8rpx solid rgba(216, 188, 133, 0.5); }

.progress-list {
  display: flex;
  flex-direction: column;
}

.progress-item {
  display: flex;
  gap: 16rpx;
  min-height: 84rpx;
}

.progress-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36rpx;
  flex-shrink: 0;
}

.progress-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32rpx;
  height: 32rpx;
  font-size: 20rpx;
  line-height: 1;
  color: #fff;
  background: rgba(216, 188, 133, 0.28);
  border-radius: 50%;
}

.progress-item--done .progress-dot {
  background: #6fb3a0;
}

.progress-item--active .progress-dot {
  background: #d8bc85;
  box-shadow: 0 0 0 6rpx rgba(216, 188, 133, 0.22);
}

.progress-line {
  flex: 1;
  width: 2rpx;
  margin: 6rpx 0;
  background: rgba(216, 188, 133, 0.22);
}

.progress-item--done .progress-line {
  background: rgba(111, 179, 160, 0.5);
}

.progress-body {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding-bottom: 20rpx;
}

.progress-label {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.6);
}

.progress-item--done .progress-label,
.progress-item--active .progress-label {
  color: #f4ecd8;
  font-weight: 600;
}

.progress-note {
  font-size: 22rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);
}

/* 按钮不能点时的原因 —— 必须看得见，否则顾客以为系统坏了 */
.action-disabled-reason {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
}

.detail-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 200rpx;
  background: var(--sk-bg, #f0f3e9);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 160rpx 40rpx;
}

.state-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.state-text {
  font-size: 26rpx;
  color: var(--sk-ink-3, #968f6d);
}

.retry-btn {
  margin-top: 12rpx;
  padding: 0 48rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.retry-btn::after {
  border: none;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 16rpx 44rpx rgba(20, 41, 31, 0.28);
}

.status-text {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
}

.status-order-id {
  font-size: 24rpx;
  color: #cfe0d5;
}

/* 待付款时限：决定这单会不会被自动取消，放在状态卡里最显眼处 */
.status-deadline {
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #f0d9a8;
}

/* ---------- 退款进度 ---------- */
.refund-card {
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
}

.refund-card__title {
  display: block;
  font-size: 26rpx;
  color: var(--sk-ink-2, #6b6653);
}

.refund-card__text {
  display: block;
  margin-top: 8rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.refund-card__note {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-3, #968f6d);
}

/* 退款到账：墨绿（好消息）；退款中：金色（还在路上） */
.refund-card--done .refund-card__text {
  color: var(--sk-primary, #1e3a2f);
}

.refund-card--processing {
  background: var(--sk-gold-soft, #f6efe0);
  border-color: rgba(176, 141, 79, 0.45);
}

.refund-card--processing .refund-card__text {
  color: var(--sk-gold, #b08d4f);
}

/* 退款未成功：必须一眼看到，并给出"找客服"的下一步 */
.refund-card--failed {
  background: #fdf1ef;
  border-color: rgba(176, 58, 46, 0.4);
}

.refund-card--failed .refund-card__text {
  color: #b03a2e;
}

.section {
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
  margin-bottom: 24rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #888;
  flex-shrink: 0;
}

.value {
  color: #333;
  text-align: right;
  flex: 1;
  margin-left: 20rpx;
}

.value.highlight {
  color: #b08d4f;
  font-weight: 700;
}

.section-note {
  display: block;
  margin-top: 20rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-3, #968f6d);
}

.tag-group {
  margin-bottom: 24rpx;
}

.tag-group:last-child {
  margin-bottom: 0;
}

.tag-label {
  display: block;
  font-size: 26rpx;
  color: #888;
  margin-bottom: 12rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: var(--sk-primary, #1e3a2f);
  background: var(--sk-primary-tint, #eef3ea);
  border-radius: 999rpx;
}

/* 2026-10-19：过敏自由文本，原文展示、可换行 */
.allergy-text {
  display: block;
  font-size: 24rpx;
  line-height: 1.6;
  color: #26261f;
  white-space: pre-wrap;
}

.notes-block {
  margin-top: 8rpx;
}

.notes-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--sk-ink, #26261f);
}

.recipe-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
  margin-bottom: 24rpx;
}

.recipe-btn {
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  color: #1e3a2f;
  background: #f3eddd;
  border: 1rpx solid #d8bc85;
  border-radius: 999rpx;
}

.recipe-btn::after {
  border: none;
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--sk-surface, #fbfcf7);
  border-top: 1rpx solid var(--sk-line, #e3e6d4);
  box-shadow: 0 -2rpx 16rpx rgba(30, 46, 36, 0.06);
}

.btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  border-radius: 999rpx;
}

.btn.primary {
  background: linear-gradient(135deg, #1e3a2f 0%, #2b5040 100%);
  color: var(--sk-gold-soft, #f6efe0);
}

.btn.secondary {
  background: transparent;
  color: var(--sk-ink-2, #6b6653);
  border: 1rpx solid var(--sk-line, #e3e6d4);
}

/* 本单资料（2026-10-19） */
.material-group {
  margin-top: 16rpx;
}

.material-title {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: #8a7a63;
}

.material-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.material-thumb-wrap {
  width: 140rpx;
  height: 140rpx;
}

.material-thumb {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.material-doc {
  width: 140rpx;
  height: 140rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  border-radius: 12rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.material-doc-badge {
  font-size: 26rpx;
  font-weight: 700;
  color: #8a6b3f;
}

.material-doc-label {
  font-size: 20rpx;
  color: #8a7a63;
}

/* 进度条：横版（2026-10-19）。旧纵版样式已不再使用。 */
.progress-track {
  display: flex;
  align-items: flex-start;
  padding: 10rpx 0 2rpx;
}

.progress-node {
  position: relative;
  flex: 1;
  min-width: 0;
  text-align: center;
}

.progress-node::after {
  content: '';
  position: absolute;
  top: 15rpx;
  left: 50%;
  right: -50%;
  height: 2rpx;
  background: #e3e6d4;
}

.progress-node:last-child::after {
  display: none;
}

.progress-node--done::after {
  background: #6fb3a0;
}

.progress-node__dot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  margin: 0 auto;
  border-radius: 50%;
  border: 1rpx solid #d8d8c8;
  background: #f2f1ec;
  font-size: 18rpx;
  color: #8a7a63;
  box-sizing: border-box;
}

.progress-node--done .progress-node__dot {
  border-color: #6fb3a0;
  background: #6fb3a0;
  color: #fff;
}

.progress-node--active .progress-node__dot {
  border-color: #d8bc85;
  background: #d8bc85;
  color: #1e3a2f;
  box-shadow: 0 0 0 6rpx rgba(216, 188, 133, 0.2);
}

.progress-node__label {
  display: block;
  margin-top: 10rpx;
  padding: 0 4rpx;
  font-size: 24rpx;
  line-height: 1.3;
  color: #5f5a4c;
}

.progress-node--done .progress-node__label,
.progress-node--active .progress-node__label {
  color: #1e3a2f;
  font-weight: 600;
}

.progress-node__note {
  display: block;
  margin-top: 4rpx;
  padding: 0 4rpx;
  font-size: 20rpx;
  line-height: 1.35;
  color: #8a7a63;
}
</style>
