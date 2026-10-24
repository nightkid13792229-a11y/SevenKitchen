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
        <text v-if="order.dogName" class="status-dog">为 {{ order.dogName }} 定制</text>
        <!-- 订单号 + 一键复制（2026-10-24） -->
        <view class="status-order-row">
          <text class="status-order-id">订单号 {{ order.orderId }}</text>
          <text class="status-order-copy" @tap="copyOrderId">复制</text>
        </view>
        <!-- 待付款时限：直接决定这单会不会被自动取消 -->
        <text v-if="paymentHint" class="status-deadline">{{ paymentHint }}</text>
        <!--
          2026-10-24：不再展示后端下发的「给顾客的一句话」。
          日期在订单信息里、阶段在进度里，"已交付……确认一下"还和确认按钮一起被移除，
          这里再放一句就是重复。
        -->
      </view>

      <!--
        购买后补开交付提醒（2026-10-20）。
        微信一次性订阅必须在用户点击的同步调用栈里申请；这里用页面加载时缓存的
        模板 ID，给已付款但未授权的订单一个补开入口。
      -->
      <view v-if="canEnableDeliveryNotice" class="delivery-notice">
        <view class="delivery-notice__copy">
          <text class="delivery-notice__title">交付时想收到微信提醒？</text>
          <text class="delivery-notice__desc">开启后，食谱交付时会在微信「服务通知」里提醒你。</text>
        </view>
        <button
          class="delivery-notice__btn"
          :loading="enablingDeliveryNotice"
          :disabled="enablingDeliveryNotice"
          @tap="enableDeliveryNotice"
        >
          开启提醒
        </button>
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
          </view>
        </view>
        <!-- 2026-10-24：去掉进度下方的小字说明 —— 阶段标签和订单信息里的日期已经够了 -->
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

      <!--
        多份交付（2026-10-21 · 第二阶段 Task 4）
        一张订单一次交付 N 份，每份一张卡片。后端只给摘要（不含快照），
        点「进入食谱」才拉那一份的内容；售后入口就留在这一份的卡上。
      -->
      <view class="section delivery-card" v-if="deliveryBatch">
        <view class="delivery-head">
          <text class="section-title">你的定制食谱</text>
          <text v-if="deliveryBatch.version > 1" class="delivery-version">
            第 {{ deliveryBatch.version }} 版
          </text>
        </view>
        <text
          v-if="deliveryBatch.items.length > 1"
          class="batch-summary"
        >
          本次共交付 {{ deliveryBatch.items.length }} 份
        </text>

        <view
          v-for="(item, index) in deliveryBatch.items"
          :key="item.deliveryItemId"
          class="batch-recipe"
        >
          <image
            v-if="item.recipeCoverImageUrl"
            class="batch-recipe__cover"
            :src="item.recipeCoverImageUrl"
            mode="aspectFill"
          />
          <view
            v-else
            class="batch-recipe__cover batch-recipe__cover--fallback"
          >
            <text class="batch-recipe__cover-initial">
              {{ (item.recipeName || '食').slice(0, 1) }}
            </text>
          </view>

          <view class="batch-recipe__body">
            <text class="batch-recipe__name">
              {{ item.recipeName || `第 ${index + 1} 份食谱` }}
            </text>
            <text class="delivery-time">
              交付于 {{ formatDeliveryTime(deliveryBatch.deliveredAt) }}
            </text>
            <view class="batch-recipe__actions">
              <button class="recipe-btn" @tap="viewBatchDelivery(item)">
                进入食谱
              </button>
              <!--
                按份售后（2026-10-21，2026-10-24 改）：
                售后是针对这一份食谱的，所以入口留在卡片上；
                已有未处理售后时按钮变成"查看进展"，不再另设整单售后卡。
              -->
              <button
                v-if="aftersaleCount > 0 || aftersaleAction?.enabled"
                class="recipe-btn batch-recipe__adjust"
                @tap="viewBatchAftersale(item)"
              >
                {{ aftersaleCount > 0 ? '查看进展' : '继续调整' }}
              </button>
            </view>
          </view>
        </view>
      </view>

      <!--
        交付卡片（2026-10-16 批次 2.4）—— 老单份订单保持原样。
        后端只给"第几版、什么时候交的、包含哪几样"，**不含内容本体** ——
        点进去才拉那几十 KB 的快照。这样订单页每次打开都不会被拖慢。
      -->
      <view class="section delivery-card" v-if="!deliveryBatch && delivery">
        <view class="delivery-head">
          <text class="section-title">你的定制食谱</text>
          <text v-if="delivery.version > 1" class="delivery-version">
            第 {{ delivery.version }} 版
          </text>
        </view>
        <!-- 封面：与交付页同一张图，16:9（上传要求就是 16:9） -->
        <image
          v-if="order.recipeCoverImageUrl"
          class="single-recipe__cover"
          :src="order.recipeCoverImageUrl"
          mode="aspectFill"
        />
        <text class="recipe-name">{{ order.recipeName || '已交付的定制食谱' }}</text>
        <text class="delivery-time">交付于 {{ formatDeliveryTime(delivery.deliveredAt) }}</text>

        <view class="batch-recipe__actions">
          <button class="recipe-btn ghost" @tap="viewDelivery">
            查看完整内容
          </button>
          <!-- 按份售后：单份订单只有这一份，入口同样留在卡片上 -->
          <button
            v-if="aftersaleCount > 0 || aftersaleAction?.enabled"
            class="recipe-btn batch-recipe__adjust"
            @tap="viewAftersale"
          >
            {{ aftersaleCount > 0 ? '查看进展' : '继续调整' }}
          </button>
        </view>
      </view>

      <view class="section">
        <view class="section-title">订单信息</view>
        <view class="info-row">
          <text class="label">定制对象</text>
          <text class="value">{{ order.dogName || '—' }}</text>
        </view>
        <!-- 营养师设计时用到的狗档案：顾客有权核对（2026-10-24） -->
        <view class="info-row" v-if="dogProfileText">
          <text class="label">对象档案</text>
          <text class="value info-value--wrap">{{ dogProfileText }}</text>
        </view>
        <view class="info-row">
          <text class="label">体重管理方向</text>
          <text class="value">{{ weightGoalText }}</text>
        </view>
        <view class="info-row">
          <text class="label">健康管理</text>
          <text class="value">{{ healthManagementText }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制份数</text>
          <text class="value">{{ recipeQuantityText }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制费</text>
          <text class="value">¥{{ formatAmount(order.amount) }}</text>
        </view>
        <view class="info-row">
          <text class="label">订单创建时间</text>
          <text class="value">{{ formatDateTime(order.createdAt, '—') }}</text>
        </view>
        <view class="info-row" v-if="order.paymentConfirmedAt">
          <text class="label">付款时间</text>
          <text class="value">{{ formatDateTime(order.paymentConfirmedAt, '—') }}</text>
        </view>
        <!-- 交付前看预计；已交付后看实际，避免两行日期同时占版面 -->
        <view class="info-row" v-if="showEstimatedDelivery">
          <text class="label">预计交付日期</text>
          <text class="value">{{ formatDate(order.estimatedDeliveryDate, '排期中') }}</text>
        </view>
        <view class="info-row" v-if="order.deliveredAt">
          <text class="label">实际交付日期</text>
          <text class="value">{{ formatDateTime(order.deliveredAt, '—') }}</text>
        </view>
        <view class="info-row" v-if="order.status === 'CANCELLED' && order.cancelledAt">
          <text class="label">取消时间</text>
          <text class="value">{{ formatDateTime(order.cancelledAt, '—') }}</text>
        </view>
      </view>

      <view class="section" v-if="hasRequirements">
        <view class="section-title">定制需求</view>
        <view class="tag-group" v-if="(order.medicalConditions || []).length">
          <text class="tag-label">疾病史</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.medicalConditions" :key="`c-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <!--
          过敏合并成一行（2026-10-24）：
          原先"过敏信息"和"过敏回答"两行，顾客要自己把两行对起来看；
          现在一行说完：内容 + 是否确认过。
        -->
        <view class="tag-group" v-if="allergyDisplayText">
          <text class="tag-label">过敏</text>
          <text class="allergy-text">{{ allergyDisplayText }}</text>
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
        2026-10-24：整单"售后与问题反馈"卡已移除。
        售后是针对某份食谱的 —— 入口留在上面的食谱卡（继续调整 / 查看进展）；
        退款是另一件事，入口在底部固定栏。
      -->

      <view class="action-bar">
        <button
          v-if="order.status === 'PENDING_PAYMENT' && !paymentExpired"
          class="btn primary"
          :loading="paying"
          :disabled="paying"
          @tap="goPay"
        >
          立即付款
        </button>
        <text
          v-if="order.status === 'PENDING_PAYMENT' && paymentExpired"
          class="action-disabled-reason"
        >
          支付已超时，订单正在关闭
        </text>
        <!--
          自助取消（决策 12）：还没开始制作就能取消；
          已付款的会**全额原路退回微信**，不需要等客服。

          2026-10-16：按钮文案与"能不能点"改由**后端下发**（`renderable.actions`）。
          此前这里是 `order.status === 'PENDING_PAYMENT' ? '取消订单' : '取消并退款'` ——
          前端在判断业务。老后端不返回 renderable 时回退到原来的判断。
        -->
        <button
          v-if="cancelAction?.enabled"
          class="btn secondary"
          :loading="cancelling"
          :disabled="cancelling || paying || !cancelAction.enabled"
          @tap="cancelOrder"
        >
          {{ cancelAction.label }}
        </button>
        <!-- 退款是另一件事：入口在底栏，售后（调整食谱）留在食谱卡片上 -->
        <button
          v-if="canRequestRefund"
          class="btn secondary"
          @tap="viewRefund"
        >
          退款申请
        </button>
        <CustomerServiceInlineButton
          class="order-service"
          compact
          label="Seven爸爸"
          source-type="ORDER"
          :order-id="orderId"
          :order-no="orderId"
          :title="`定制订单 ${orderId}`"
          path="/pages/orders-list/index"
        />
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { getToken } from '@/utils/api';
import {
  cancelOrder as cancelOrderRequest,
  fetchAftersales,
  fetchOrderDetail,
  fetchPublicConfig,
  findAction,
  toneToClass,
  type DeliveryBatchItemSummary,
  type DeliveryBatchSummary,
  type DeliverySummary,
} from '@/api/custom-recipe';
import { buildDeliveryDetailUrl } from '@/utils/custom-recipe-delivery';
import CustomerServiceInlineButton from '@/components/CustomerServiceInlineButton.vue';
import { buildAftersaleUrl } from '@/utils/custom-recipe-aftersale';
import {
  requestCustomRecipeOrderSubscription,
  runCustomRecipePayment,
} from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  describeCustomRecipeRefund,
  formatAmount,
  formatDate,
  isPaymentExpired,
  resolvePaymentDeadlineAt,
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
  /** 交付摘要（老单份）；多份订单为 null */
  delivery?: DeliverySummary | null;
  /** 多份交付摘要（2026-10-21）；老订单为 null / 不返回 */
  deliveryBatch?: DeliveryBatchSummary | null;
}

const orderId = ref('');
const loading = ref(true);
const loadFailed = ref(false);
const paying = ref(false);
const order = ref<CustomRecipeOrderDetail>({});
const nowTick = ref(Date.now());
let paymentClockTimer: ReturnType<typeof setInterval> | null = null;

/** 登录已过期（401）：与"网络错误"分开表达，并给一个去登录的入口 */
const needLogin = ref(false);

/** 支付超时分钟数（0 = 不自动关单），来自后台公开配置 */
const paymentTimeoutMinutes = ref(0);
/** 交付订阅消息模板 ID（页面加载时缓存，点击时同步申请） */
const orderNotifyTemplateId = ref('');
const enablingDeliveryNotice = ref(false);
const canEnableDeliveryNotice = computed(() => {
  const status = String(order.value?.status || '');
  return status === 'PAID' || status === 'IN_PROGRESS';
});

onLoad((options: any) => {
  // 目标/饲喂历史中文来自选项字典
  ensureGoalOptions();
  ensureCurrentFoodOptions();
  ensureChangeReasonOptions();
  ensureStomachOptions();
  ensureStatusOptions();
  orderId.value = options.orderId || '';
  paymentClockTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 15000);
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
    orderNotifyTemplateId.value = String(
      config.orderNotifyTemplateId || '',
    ).trim();
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

/**
 * 多份交付摘要（2026-10-21）。
 *
 * 多份订单整批交付没有老的单份 `delivery`，只有这一份；
 * 老订单这个字段为 null，继续走下面的单份卡片。
 */
const deliveryBatch = computed(() => order.value.deliveryBatch ?? null);

const formatDeliveryTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
    url: buildAftersaleUrl(orderId.value),
  });
};

/**
 * 从多份交付中的某一份进售后（2026-10-21 · 第二阶段 Task 6）。
 *
 * 必须带上这一份的业务编号 `recipeId`，售后页据此默认勾选它；
 * 顾客仍然可以在表单里追加其他份。路由拼接统一走 helper。
 */
const viewBatchAftersale = (item: DeliveryBatchItemSummary) => {
  uni.navigateTo({
    url: buildAftersaleUrl(orderId.value, item.recipeId),
  });
};

/** 打开交付内容页（老单份交付） */
const viewDelivery = () => {
  uni.navigateTo({
    url: buildDeliveryDetailUrl(orderId.value),
  });
};

/**
 * 打开多份交付中的某一份（2026-10-21）。
 *
 * 必须带上这一份的业务编号 `recipeId`；否则交付页会默认显示第一份，
 * 顾客点第二张卡却看到第一份的内容。
 */
const viewBatchDelivery = (item: DeliveryBatchItemSummary) => {
  uni.navigateTo({
    url: buildDeliveryDetailUrl(orderId.value, item.recipeId),
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
/** 体重管理方向：只显示减重/维持/增重；健康管理单独一行 */
const weightGoalText = computed(() => {
  const goal = String(order.value.targetGoal || '');
  if (!goal || goal === 'HEALTH_SUPPORT') return '—';
  return goalLabel(goal) || goal;
});

/**
 * 健康管理：布尔字段 + 历史单兜底。
 * 老的健康管理单 targetGoal = HEALTH_SUPPORT，needsHealthManagement 可能没落库；
 * 只看布尔会把它显示成"不需要"，和"体重方向 —"自相矛盾。
 */
const healthManagementText = computed(() => {
  if (order.value.needsHealthManagement) return '需要';
  if (String(order.value.targetGoal || '') === 'HEALTH_SUPPORT') {
    return '需要（历史订单）';
  }
  return '不需要';
});

/** 定制份数 */
const recipeQuantityText = computed(() => {
  const quantity = Number(order.value.recipeQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? `${quantity} 份` : '1 份';
});

const ACTIVITY_LEVEL_LABELS: Record<string, string> = {
  RESTING: '静养',
  LOW: '低活动量',
  NORMAL: '正常活动量',
  HIGH: '高活动量',
  WORKING: '工作犬强活动量',
};

/** 生日 → 几岁几个月（详情页展示用，不参与业务计算） */
function formatDogAge(birthday: string | null | undefined): string {
  if (!birthday) return '';
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let months =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return '';
  if (months < 12) return `${months} 个月`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} 岁 ${rest} 个月` : `${years} 岁`;
}

/** 定制对象档案：品种 · 年龄 · 体重 · 体况 · 活动量 · 餐数 */
const dogProfileText = computed(() => {
  const parts: string[] = [];
  const breed = String(order.value.dogBreedName || '').trim();
  if (breed) parts.push(breed);
  const age = formatDogAge(order.value.dogBirthday);
  if (age) parts.push(age);
  const weight = Number(order.value.dogWeightKg);
  if (Number.isFinite(weight) && weight > 0) parts.push(`${weight}kg`);
  const bcs = Number(order.value.dogBcsScore);
  if (Number.isFinite(bcs) && bcs > 0) parts.push(`体况 ${bcs}/9`);
  const activity =
    ACTIVITY_LEVEL_LABELS[String(order.value.dogActivityLevel || '')];
  if (activity) parts.push(activity);
  const meals = Number(order.value.dogMealsPerDay);
  if (Number.isFinite(meals) && meals > 0) parts.push(`每天 ${meals} 餐`);
  return parts.join(' · ');
});

/** 交付前看预计、交付后看实际，避免两行日期同时占版面 */
const showEstimatedDelivery = computed(
  () => order.value.status !== 'CANCELLED' && !order.value.deliveredAt,
);

/** 过敏合并成一行：内容 + 是否确认过 */
const allergyDisplayText = computed(() => {
  const status = String(order.value.allergyStatus || '');
  const text =
    String(order.value.allergyText || '').trim() ||
    (order.value.allergies || []).join('、');
  if (status === 'NO_ALLERGY') return '没有过敏（已确认）';
  if (status === 'HAS_ALLERGY') {
    return text ? `${text}（已确认有过敏）` : '有过敏（已确认）';
  }
  if (text) return `${text}（未确认）`;
  return '未填写';
});

/** 订单/付款/交付时间要带时分；纯日期仍用 formatDate */
function formatDateTime(
  value: string | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day} ${hour}:${minute}`;
}

/** 一键复制订单号 */
const copyOrderId = () => {
  const value = String(order.value.orderId || '').trim();
  if (!value) return;
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title: '订单号已复制', icon: 'none' }),
  });
};

/** 退款入口：只在不能自助取消（已进入制作/已交付）时出现 */
const canRequestRefund = computed(() => {
  const status = String(order.value.status || '');
  return (
    !cancelAction.value?.enabled &&
    ['PAID', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED'].includes(status)
  );
});

const viewRefund = () => {
  uni.navigateTo({
    url: `${buildAftersaleUrl(orderId.value)}&scene=refund`,
  });
};

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
    now: nowTick.value,
  });
});

const paymentExpired = computed(() => {
  if (order.value.status !== 'PENDING_PAYMENT') return false;
  const deadline = resolvePaymentDeadlineAt({
    paymentDeadlineAt: order.value.paymentDeadlineAt ?? null,
    createdAt: order.value.createdAt ?? null,
    paymentTimeoutMinutes: paymentTimeoutMinutes.value,
  });
  return isPaymentExpired(deadline, nowTick.value);
});

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

  if (paymentExpired.value) {
    uni.showToast({ title: '支付已超时，订单已关闭', icon: 'none' });
    await loadOrderDetail().catch(() => undefined);
    return;
  }

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

async function enableDeliveryNotice() {
  if (enablingDeliveryNotice.value) return;
  const templateId = String(orderNotifyTemplateId.value || '').trim();
  if (!templateId) {
    uni.showToast({ title: '暂时无法申请，请稍后再试', icon: 'none' });
    return;
  }
  enablingDeliveryNotice.value = true;
  try {
    const accepted = await requestCustomRecipeOrderSubscription(templateId);
    uni.showToast({
      title: accepted ? '已开启，交付时会提醒你' : '未开启，可以稍后再试',
      icon: 'none',
    });
  } finally {
    enablingDeliveryNotice.value = false;
  }
}

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


onUnmounted(() => {
  if (paymentClockTimer) {
    clearInterval(paymentClockTimer);
    paymentClockTimer = null;
  }
});
</script>

<style scoped>

/* ===== 交付卡片（2026-10-16 批次 2.4）===== */
.delivery-card {
  border: 1rpx solid rgba(216, 188, 133, 0.4);
}

/* ===== 多份交付卡片（2026-10-21 · 第二阶段 Task 4）===== */
.batch-summary {
  display: block;
  margin: 4rpx 0 20rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.batch-recipe {
  display: flex;
  gap: 20rpx;
  padding: 20rpx;
  margin-bottom: 18rpx;
  background: rgba(216, 188, 133, 0.08);
  border: 1rpx solid rgba(216, 188, 133, 0.28);
  border-radius: 20rpx;
}

/* 封面比例 16:9（后台上传要求就是 16:9，2026-10-24） */
.batch-recipe__cover {
  width: 240rpx;
  height: 135rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  background: #f1ead9;
}

.batch-recipe__cover--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #24483a, #16261f 62%, #0e1a15);
}

.batch-recipe__cover-initial {
  font-size: 56rpx;
  font-weight: 700;
  color: #f4ecd8;
}

.batch-recipe__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.batch-recipe__name {
  display: block;
  margin-bottom: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.batch-recipe__body .delivery-items {
  margin-top: 0;
}

.batch-recipe__body .delivery-item {
  color: #5c4b2e;
  background: rgba(216, 188, 133, 0.2);
}

.batch-recipe__body .delivery-time {
  margin-bottom: 14rpx;
  color: rgba(38, 38, 31, 0.5);
}

.batch-recipe__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  margin-top: auto;
}

.batch-recipe__actions .recipe-btn {
  flex: 1;
  height: 64rpx;
  line-height: 64rpx;
  font-size: 24rpx;
}

/* 「进入食谱」是主操作；「继续调整」退成文字动作，避免每张卡两个大胶囊 */
.batch-recipe__actions .recipe-btn:first-child {
  color: #1e3a2f;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  border-color: #c6a15b;
  font-weight: 700;
}

.batch-recipe__adjust {
  color: #8a6d2f;
  background: transparent;
  border: 0;
  font-weight: 500;
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

/* 对象档案这种长文本：允许换行，右对齐 */
.info-value--wrap {
  line-height: 1.55;
  word-break: break-all;
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
  z-index: 50;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--sk-surface, #fbfcf7);
  border-top: 1rpx solid var(--sk-line, #e3e6d4);
  box-shadow: 0 -2rpx 16rpx rgba(30, 46, 36, 0.06);
}

.btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  line-height: 1.2;
  padding: 0 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  border-radius: 999rpx;
  box-sizing: border-box;
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

.progress-note {
  display: block;
  margin-top: 16rpx;
  padding: 12rpx 16rpx;
  border-radius: 10rpx;
  background: #f4f2e9;
  font-size: 21rpx;
  line-height: 1.5;
  color: #6b6653;
}

.delivery-notice {
  margin: 0 24rpx 20rpx;
  padding: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  border-radius: 14rpx;
  background: #f4f8ef;
  border: 1rpx solid #dbe6d0;
}

.delivery-notice__copy {
  flex: 1;
  min-width: 0;
}

.delivery-notice__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #2d4638;
}

.delivery-notice__desc {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  line-height: 1.5;
  color: #7d8a72;
}

.delivery-notice__btn {
  flex-shrink: 0;
  margin: 0;
  padding: 0 18rpx;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 22rpx;
  color: #f6efe0;
  background: #1e3a2f;
  border-radius: 999rpx;
}

/* ===== 2026-10-23 顾客端统一视觉：温暖私厨 ===== */
.detail-page {
  background: #f3eee3;
  padding-bottom: calc(210rpx + env(safe-area-inset-bottom));
}

.status-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(145deg, #294b3c 0%, #1b3328 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.45);
  box-shadow: 0 18rpx 46rpx rgba(20, 41, 31, 0.22);
}

.status-card::after {
  content: '';
  position: absolute;
  right: -80rpx;
  top: -80rpx;
  width: 260rpx;
  height: 260rpx;
  border: 1rpx solid rgba(216, 188, 133, 0.2);
  border-radius: 50%;
}

.status-text {
  position: relative;
  z-index: 1;
  font-family: "Songti SC", "STSong", serif;
  font-size: 44rpx;
  letter-spacing: 2rpx;
}

.status-dog {
  position: relative;
  z-index: 1;
  margin-top: 2rpx;
  font-size: 24rpx;
  color: #e7d3a5;
}

.status-order-id,
.status-hint,
.status-deadline {
  position: relative;
  z-index: 1;
}

.section {
  background: #fffdf7;
  border: 1rpx solid #e8decd;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 34rpx rgba(30, 58, 47, 0.05);
  padding: 30rpx 30rpx;
  margin-bottom: 22rpx;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 24rpx;
  font-size: 29rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  color: #1e3a2f;
}

.section-title::before {
  content: '';
  width: 5rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background: #c6a15b;
}

.info-row {
  font-size: 26rpx;
}

.info-row .label,
.info-row .info-label {
  color: #8a806c;
}

.info-row .value,
.info-row .info-value {
  color: #2f3a30;
  font-weight: 500;
}

.progress-note {
  background: #f7f1e4;
  color: #6b6653;
}

.action-bar {
  background: rgba(255, 253, 247, 0.96);
  border-top: 1rpx solid #e8decd;
  box-shadow: 0 -10rpx 30rpx rgba(30, 58, 47, 0.06);
}

.btn.secondary {
  color: #1e3a2f;
  background: #fffdf7;
  border: 1rpx solid #d9cdb8;
}

.btn.primary {
  color: #1e3a2f;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
}

.delivery-notice {
  background: #f7f1e4;
  border-color: #e8decd;
}

/* ===== 2026-10-24 顾客订单详情：复制 / 封面 / 单份卡 ===== */
.status-order-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 6rpx;
}

.status-order-copy {
  padding: 2rpx 14rpx;
  font-size: 20rpx;
  color: #1e3a2f;
  background: rgba(255, 253, 247, 0.9);
  border-radius: 999rpx;
}

.single-recipe__cover {
  width: 100%;
  height: 368rpx;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
  background: #f1ead9;
}

</style>
