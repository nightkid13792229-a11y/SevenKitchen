<template>
  <view class="checkout-page">
    <!-- 确认地址 -->
    <view class="section address-section" @tap="openAddressSelector">
      <view class="section-title">
        <text class="title-text">确认地址</text>
      </view>

      <!-- 有地址 -->
      <view v-if="selectedAddress" class="address-card">
        <view class="address-info">
          <view class="address-header">
            <text class="recipient"
              >{{ selectedAddress.recipientName }}
              {{ selectedAddress.phone }}</text
            >
            <text v-if="selectedAddress.isDefault" class="default-badge"
              >默认</text
            >
          </view>
          <text class="detail"
            >{{ selectedAddress.regionText }}
            {{ selectedAddress.detailAddress }}</text
          >
        </view>
        <text class="arrow">›</text>
      </view>

      <!-- 无地址 -->
      <view v-else class="no-address-card">
        <view class="empty-content">
          <text class="empty-text">暂无收货地址</text>
          <button class="btn-add-address" @tap.stop="goToAddAddress">
            新增地址
          </button>
        </view>
      </view>

      <!-- 配送说明 -->
      <view class="shipping-note">
        <text class="note-text">默认顺丰特快，1至2日送达</text>
      </view>
    </view>

    <!-- 现货：不排产，只说明发货节奏 -->
    <view v-if="isStockOrder" class="section production-date-section">
      <view class="section-title">
        <text class="title-text">发货</text>
      </view>
      <view class="date-display-button">
        <text class="date-label">现货商品</text>
        <text class="date-value">付款后尽快发出</text>
        <text class="auto-tag">已在库冷冻保存</text>
      </view>
      <view class="date-tips">
        <text class="tip-text">现货为提前做好的冷冻成品，无需等待制作与排产</text>
      </view>
    </view>

    <!-- 确认日期（鲜食：需要排产） -->
    <view v-else class="section production-date-section">
      <view class="section-title">
        <text class="title-text">确认日期</text>
      </view>

      <!-- 只读模式：点击后才弹出选择器 -->
      <picker
        v-if="showProductionDatePicker"
        mode="date"
        :value="selectedProductionDate"
        :start="minProductionDate"
        @change="onProductionDateChange"
        @cancel="showProductionDatePicker = false"
      >
        <view class="date-picker-button">
          <text class="date-value">{{
            formatDisplayDate(selectedProductionDate)
          }}</text>
          <text class="picker-arrow">▼</text>
        </view>
      </picker>

      <view v-else class="date-display-button" @tap="openProductionDatePicker">
        <text class="date-label">制作日期：</text>
        <text class="date-value">{{
          formatDisplayDate(selectedProductionDate)
        }}</text>
        <text class="auto-tag">预约制作日期</text>
        <text class="picker-arrow">▼</text>
      </view>

      <!-- 提示文字 -->
      <view class="date-tips">
        <text class="tip-text">制作完成后，需要急冻24小时后再发货</text>
      </view>

      <!-- 发货日期和收货日期并排展示 -->
      <view class="date-info-row">
        <view class="date-info-item-left">
          <text class="date-info-label">预计发货日期</text>
          <text class="date-info-value">{{
            formatDisplayDate(calculatedShippingDate)
          }}</text>
        </view>
        <view class="date-info-item-right">
          <text class="date-info-label">预计收货日期</text>
          <text class="date-info-value">{{ estimatedDeliveryDateRange }}</text>
        </view>
      </view>
    </view>

    <!-- 订单信息 -->
    <view class="section config-info-section">
      <view class="section-title">
        <text class="title-text">订单信息</text>
      </view>

      <!-- 食谱（移到顶部，不显示标题） -->
      <view class="info-card recipe-card-top">
        <view class="recipe-content">
          <image
            v-if="orderConfig.recipeCoverImage"
            :src="orderConfig.recipeCoverImage"
            class="recipe-cover-small"
            mode="aspectFill"
          />
          <view v-else class="recipe-cover-placeholder">
            <text>{{ orderConfig.recipeName?.charAt(0) }}</text>
          </view>
          <text class="recipe-name">{{ orderConfig.recipeName }}</text>
        </view>
      </view>

      <!-- 爱犬信息（现货不绑定狗狗，整块隐藏） -->
      <view v-if="!isStockOrder" class="info-card dog-info-card">
        <text class="info-card-title">爱犬信息</text>
        <view class="config-grid">
          <view class="config-item">
            <text class="config-label">名称</text>
            <text class="config-value">{{ orderConfig.dogName }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">品种</text>
            <text class="config-value">{{ orderConfig.breedName || '-' }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">体重</text>
            <text class="config-value">{{
              orderConfig.weightKg ? orderConfig.weightKg + 'kg' : '-'
            }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">每日餐数</text>
            <text class="config-value">{{ orderConfig.mealsPerDay }}餐</text>
          </view>
          <view class="config-item">
            <text class="config-label">每日食量</text>
            <text class="config-value">{{ orderConfig.dailyIntakeG }}g</text>
          </view>
        </view>
      </view>

      <!-- 订购信息 -->
      <view class="info-card order-info-card">
        <text class="info-card-title">订购信息</text>
        <view class="config-grid">
          <view v-if="isStockOrder" class="config-item">
            <text class="config-label">购买数量</text>
            <text class="config-value">{{ orderConfig.sets }}套</text>
          </view>
          <view v-else class="config-item">
            <text class="config-label">预计可喂</text>
            <text class="config-value"
              >{{ orderConfig.estimatedFeedDays }}天</text
            >
          </view>
          <view class="config-item">
            <text class="config-label">总分装数</text>
            <text class="config-value">{{ orderConfig.totalPackages }}袋</text>
          </view>
          <view class="config-item">
            <text class="config-label">总净重</text>
            <text class="config-value">{{ orderConfig.totalGrams }}g</text>
          </view>
        </view>

        <view
          v-if="orderConfig.packagePlan.length"
          class="package-plan-section"
        >
          <text class="info-card-subtitle">分装明细</text>
          <view
            v-for="(row, index) in orderConfig.packagePlan"
            :key="`${row.packageSpecG}-${row.packageCount}-${index}`"
            class="package-plan-row"
          >
            <text class="package-plan-row-text"
              >{{ row.packageSpecG }}g × {{ row.packageCount }}袋</text
            >
          </view>
        </view>
      </view>

      <!-- 制作说明（现货没有加工要求，整块隐藏） -->
      <view v-if="!isStockOrder" class="info-card requirement-card">
        <text class="info-card-title">制作说明</text>
        <view class="config-grid">
          <view class="config-item">
            <text class="config-label">加工方式</text>
            <text class="config-value">{{
              orderConfig.preparationMethod === 'CHOPPED' ? '打碎' : '切丁'
            }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">烹饪要求</text>
            <text class="config-value">{{
              orderConfig.cookingMethod === 'RAW' ? '蒸/炖/低温慢煮' : '预加热'
            }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section order-note-section">
      <view class="section-title">
        <text class="title-text">订单备注</text>
      </view>
      <textarea
        v-model="customerNote"
        class="order-note-input"
        maxlength="200"
        auto-height
        placeholder="可填写过敏提醒、分装标签、配送时间等特殊要求"
      />
      <view class="order-note-footer">
        <text class="order-note-hint"
          >备注会展示在订单详情页，便于客服和制作人员核对。</text
        >
        <text class="order-note-count">{{ customerNote.length }}/200</text>
      </view>
    </view>

    <!-- 价格汇总（简化版） -->
    <view class="section price-section">
      <view class="section-title">
        <text class="title-text">订单金额</text>
      </view>

      <view class="price-card-simple">
        <text class="price-label">支付金额</text>
        <text class="price-value-large">¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <view class="price-card-note">
        <text class="price-note-text">已含冷链配送费</text>
      </view>

      <!-- 售后保障复述：支付前最后一次安心（与订购页同一口径） -->
      <view class="checkout-assurance">
        <text class="checkout-assurance-icon">✓</text>
        <text class="checkout-assurance-text">
          <template v-if="isStockOrder">
            收到后如有破损、变质等品质问题，可申请全额退款，或联系客服补发
          </template>
          <template v-else>
            收到后如有破损、变质等品质问题，可申请全额退款或免费重做
          </template>
        </text>
      </view>

      <!--
        取消政策：必须在支付前明确告知。
        我们按预约当天采买、当天制作，一旦进入采购就无法撤回，
        所以"开始备料后不能取消"这条规则只有提前说清楚才站得住。
      -->
      <view class="checkout-cancel-policy">
        <text class="checkout-cancel-policy-title">关于取消</text>
        <text class="checkout-cancel-policy-text">
          支付后到进入采购前，可以随时取消并全额退款。
          我们按您的预约日期当天采买、当天制作，一旦开始采购与制作，食材已单独投入，无法取消。
        </text>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-bar">
      <CustomerServiceInlineButton
        class="customer-service-bottom-action"
        source-type="PRODUCT"
        :product-id="orderConfig.recipeId"
        :product-name="orderConfig.recipeName"
        :image-url="orderConfig.recipeCoverImage"
        title="确认订单咨询"
        path="/pages/checkout/index"
      />
      <view class="bottom-price">
        <text class="bottom-total">{{ bottomPriceTitle }}</text>
        <view class="bottom-estimate">
          <text class="bottom-price-per-package">{{ bottomPricePerPackageText }}</text>
        </view>
      </view>
      <button
        class="btn-submit-order"
        :disabled="!canSubmitOrder"
        @tap="submitOrder"
      >
        提交订单
      </button>
    </view>

    <!-- 地址选择器弹窗 -->
    <view
      v-if="showAddressSelector"
      class="address-selector-overlay"
      @tap="closeAddressSelector"
    >
      <view class="address-selector" @tap.stop>
        <view class="selector-header">
          <text class="selector-title">选择收货地址</text>
          <text class="selector-close" @tap="closeAddressSelector">×</text>
        </view>
        <scroll-view class="address-list" scroll-y>
          <view
            v-for="addr in addressList"
            :key="addr.id"
            class="address-list-item"
            :class="{ selected: selectedAddress?.id === addr.id }"
            @tap="selectAddress(addr)"
          >
            <view class="list-address-info">
              <view class="list-address-header">
                <text class="list-recipient"
                  >{{ addr.recipientName }} {{ addr.phone }}</text
                >
                <text v-if="addr.isDefault" class="default-badge">默认</text>
              </view>
              <text class="list-detail"
                >{{ addr.regionText }} {{ addr.detailAddress }}</text
              >
            </view>
            <view v-if="selectedAddress?.id === addr.id" class="check-icon"
              >✓</view
            >
          </view>
        </scroll-view>
        <view class="selector-footer">
          <button class="btn-manage-address" @tap="goToAddressList">
            管理地址
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { request } from '../../utils/api'
import { quoteTastingPack } from '../../api/tastingPack';
import { ensurePhoneBound } from '../../utils/account';
import CustomerServiceInlineButton from '../../components/CustomerServiceInlineButton.vue'
import { trackFunnelEvent } from '../../utils/funnel';
import {
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
} from '../../utils/order-package-plan';

interface CartItem {
  id: string;
  dogId: string;
  dogName: string;
  dogBreedName?: string;
  dogWeightKg?: number;
  recipeId: string;
  recipeName: string;
  recipeCoverImage?: string;
  cycleDays: number;
  dailyIntakeG: number;
  totalGrams: number;
  packageCount: number;
  packageSpecG: number;
  unitPrice: number;
  totalPrice: number;
  preparationMethod?: string;
  cookingMethod?: string;
}

interface PackagePlanItem {
  packageSpecG: number;
  packageCount: number;
}

interface Address {
  id: string;
  recipientName: string;
  phone: string;
  regionText: string;
  detailAddress: string;
  isDefault?: boolean;
}

interface OrderConfig {
  dogId?: string;
  dogName: string;
  breedName?: string;
  weightKg?: number;
  mealsPerDay: number;
  dailyIntakeG: number;
  perMealG: number;
  totalPackages: number;
  cycleDays: number;
  totalGrams: number;
  estimatedFeedDays: string;
  packagePlan: PackagePlanItem[];
  ingredientSourcePlan?: string;
  ingredientSourcePlanLabel: string;
  preparationMethod: 'CHOPPED' | 'DICED';
  cookingMethod: 'RAW' | 'COOKED';
  recipeId?: string;
  recipeName: string;
  recipeCoverImage?: string;
  /** 订单种类：鲜食（默认）或试吃装现货 */
  orderKind?: 'FRESH_FOOD' | 'TASTING_PACK';
  /** 试吃装买了几个套装 */
  sets?: number;
  /** 试吃装面客编号（现货刷新价格要用） */
  tastingPackCode?: string;
}

const cartItems = ref<CartItem[]>([]);
const selectedAddress = ref<Address | null>(null);
const pricingSnapshotId = ref<string | null>(null);
const orderConfig = ref<OrderConfig>({
  dogId: '',
  dogName: '',
  breedName: '',
  weightKg: undefined,
  mealsPerDay: 2,
  dailyIntakeG: 0,
  perMealG: 0,
  totalPackages: 0,
  cycleDays: 0,
  totalGrams: 0,
  estimatedFeedDays: '-',
  packagePlan: [],
  ingredientSourcePlan: '',
  ingredientSourcePlanLabel: '',
  preparationMethod: 'CHOPPED',
  cookingMethod: 'RAW',
  recipeId: '',
  recipeName: '',
  recipeCoverImage: '',
  orderKind: 'FRESH_FOOD',
  sets: 0,
  tastingPackCode: '',
});

// 立即购买模式的价格显示（从URL参数获取，仅用于显示）
const directBuyPrice = ref({
  amountProduct: 0,
  amountShipping: 0,
  amountTotal: 0,
});

// ========== 地址选择器相关 ==========
const showAddressSelector = ref(false);
const addressList = ref<Address[]>([]);
const customerNote = ref('');

// ========== 制作日期相关 ==========
const showProductionDatePicker = ref(false);

// 判断当前时间是否在6点前
const isBefore6AM = computed(() => {
  const now = new Date();
  const hour = now.getHours();
  return hour < 6;
});

// 计算最小可选制作日期（可以选择当天，不能选昨天及以前）
const minProductionDate = computed(() => {
  const now = new Date();
  return formatDateToString(now);
});

// 默认制作日期：根据当前时间判断（0-6点当日，6-24点次日）
const defaultProductionDate = computed(() => {
  const now = new Date();
  const hour = now.getHours(); // 使用本地时间

  if (hour >= 0 && hour < 6) {
    // 0-6点：当日制作
    return formatDateToString(now);
  } else {
    // 6-24点：次日制作
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateToString(tomorrow);
  }
});

// 选中的制作日期
const selectedProductionDate = ref(defaultProductionDate.value);

// 计算发货日期（制作日期 + 1天）
const calculatedShippingDate = computed(() => {
  if (!selectedProductionDate.value) return '';
  const productionDate = new Date(selectedProductionDate.value);
  const shippingDate = new Date(productionDate);
  shippingDate.setDate(shippingDate.getDate() + 1);
  return formatDateToString(shippingDate);
});

// 计算预计收货日期范围（发货日期 + 1~2天）
const estimatedDeliveryDateRange = computed(() => {
  if (!calculatedShippingDate.value) return '';
  const shipping = new Date(calculatedShippingDate.value);
  const start = new Date(shipping);
  start.setDate(start.getDate() + 1);
  const end = new Date(shipping);
  end.setDate(end.getDate() + 2);
  return `${formatDisplayDate(formatDateToString(start))}-${formatDisplayDate(formatDateToString(end))}`;
});

// ========== 计算属性 ==========
const totalAmount = computed(() => {
  return directBuyPrice.value.amountTotal;
});

const averagePricePerPackage = computed(() => {
  if (orderConfig.value.totalPackages <= 0) return 0;
  return totalAmount.value / orderConfig.value.totalPackages;
});

const isSinglePackageSpec = computed(
  () => orderConfig.value.packagePlan.length === 1,
);

const bottomPriceTitle = computed(() => {
  return `¥${totalAmount.value.toFixed(2)}`;
});

const bottomPricePerPackageText = computed(() => {
  if (
    orderConfig.value.totalPackages <= 0 ||
    orderConfig.value.packagePlan.length === 0
  ) {
    return '等待分装信息';
  }

  if (isSinglePackageSpec.value) {
    return `¥${averagePricePerPackage.value.toFixed(2)}/袋`;
  }

  return `均价 ¥${averagePricePerPackage.value.toFixed(2)}/袋`;
});

/** 试吃装现货订单：不选制作日期、不绑狗狗、不显示排产相关说明 */
const isStockOrder = computed(
  () => orderConfig.value.orderKind === 'TASTING_PACK',
);

const canSubmitOrder = computed(() => {
  if (!selectedAddress.value || !pricingSnapshotId.value) return false;
  // 现货不排产，没有制作日期这一项
  if (isStockOrder.value) return true;
  return !!selectedProductionDate.value;
});

// ========== 工具函数 ==========
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '请选择日期';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function decodeURLText(value: unknown): string {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function readTextValue(primary: unknown, fallback: unknown = ''): string {
  const primaryText = normalizeText(primary);
  if (primaryText) {
    return primaryText;
  }

  return decodeURLText(fallback);
}

function readNumberValue(primary: unknown, fallback: unknown = 0): number {
  const primaryNumber = Number(primary);
  if (Number.isFinite(primaryNumber)) {
    return primaryNumber;
  }

  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
}

function readPositiveNumber(primary: unknown, fallback: unknown = 0): number {
  const primaryNumber = Number(primary);
  if (Number.isFinite(primaryNumber) && primaryNumber > 0) {
    return primaryNumber;
  }

  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0
    ? fallbackNumber
    : 0;
}

function readPositiveInteger(primary: unknown, fallback: unknown = 0): number {
  const primaryNumber = Math.floor(Number(primary));
  if (Number.isFinite(primaryNumber) && primaryNumber > 0) {
    return primaryNumber;
  }

  const fallbackNumber = Math.floor(Number(fallback));
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0
    ? fallbackNumber
    : 0;
}

function normalizePackagePlanRows(rows: unknown): PackagePlanItem[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.reduce<PackagePlanItem[]>((plan, row: any) => {
    const packageSpecG = readPositiveInteger(row?.packageSpecG);
    const packageCount = readPositiveInteger(row?.packageCount);

    if (packageSpecG > 0 && packageCount > 0) {
      plan.push({ packageSpecG, packageCount });
    }

    return plan;
  }, []);
}

function resolvePackagePlan(
  storedConfig: Record<string, any>,
  options: Record<string, any>,
  dailyIntakeG: number,
  mealsPerDay: number,
  cycleDays: number,
  totalPackages: number,
  perMealG: number,
): PackagePlanItem[] {
  const storedPlan = normalizePackagePlanRows(storedConfig.packagePlan);
  if (storedPlan.length > 0) {
    return storedPlan;
  }

  const storedRowPackageSpecG = readPositiveInteger(storedConfig.packageSpecG);
  const storedRowPackageCount = readPositiveInteger(storedConfig.packageCount);
  if (storedRowPackageSpecG > 0 && storedRowPackageCount > 0) {
    return [
      {
        packageSpecG: storedRowPackageSpecG,
        packageCount: storedRowPackageCount,
      },
    ];
  }

  const optionPlan = normalizePackagePlanRows(options.packagePlan);
  if (optionPlan.length > 0) {
    return optionPlan;
  }

  const optionRowPackageSpecG = readPositiveInteger(options.packageSpecG);
  const optionRowPackageCount = readPositiveInteger(
    options.packageCount || options.totalPackages,
  );
  if (optionRowPackageSpecG > 0 && optionRowPackageCount > 0) {
    return [
      {
        packageSpecG: optionRowPackageSpecG,
        packageCount: optionRowPackageCount,
      },
    ];
  }

  if (dailyIntakeG > 0 && mealsPerDay > 0) {
    return buildDefaultPackagePlan({
      dailyIntakeG,
      mealsPerDay,
      days: cycleDays,
    });
  }

  if (perMealG > 0 && totalPackages > 0) {
    return [
      {
        packageSpecG: perMealG,
        packageCount: totalPackages,
      },
    ];
  }

  return [];
}

function buildDirectBuyPrice(
  storedConfig: Record<string, any>,
  options: Record<string, any>,
) {
  const amountProduct = Math.max(
    0,
    readNumberValue(
      storedConfig.amountProduct,
      readNumberValue(options.amountProduct, 0),
    ),
  );
  const amountShipping = Math.max(
    0,
    readNumberValue(
      storedConfig.amountShipping,
      readNumberValue(options.amountShipping, 0),
    ),
  );
  const amountTotalFallback = amountProduct + amountShipping;
  const amountTotal = Math.max(
    0,
    readNumberValue(
      storedConfig.amountTotal,
      readNumberValue(options.amountTotal, amountTotalFallback),
    ),
  );

  return {
    amountProduct,
    amountShipping,
    amountTotal: amountTotal > 0 ? amountTotal : amountTotalFallback,
  };
}

function buildDirectBuyOrderConfig(
  storedConfig: Record<string, any>,
  options: Record<string, any>,
): OrderConfig {
  // 试吃装是现货：没有狗狗、没有每日饭量、不排产，
  // 所以这批配置只用来渲染，价格与库存一律以服务端快照为准
  const orderKind =
    storedConfig.orderKind === 'TASTING_PACK' ? 'TASTING_PACK' : 'FRESH_FOOD';
  const dogId = readTextValue(storedConfig.dogId, options.dogId);
  const dogName = readTextValue(storedConfig.dogName, options.dogName);
  const breedName = readTextValue(storedConfig.breedName, options.breedName);
  const weightKg = readPositiveNumber(storedConfig.weightKg, options.weightKg);
  const mealsPerDay =
    readPositiveInteger(storedConfig.mealsPerDay, options.mealsPerDay || 2) ||
    2;
  const optionDailyIntakeG = readPositiveNumber(
    options.dailyIntakeG,
    readPositiveNumber(options.perMealG, 0) * mealsPerDay,
  );
  const dailyIntakeG = readPositiveNumber(
    storedConfig.dailyIntakeG,
    optionDailyIntakeG,
  );
  const perMealG = readPositiveNumber(
    storedConfig.perMealG,
    readPositiveNumber(
      options.perMealG,
      dailyIntakeG > 0 && mealsPerDay > 0 ? dailyIntakeG / mealsPerDay : 0,
    ),
  );
  const cycleDays = readPositiveInteger(
    storedConfig.cycleDays,
    options.cycleDays,
  );
  const packagePlan = resolvePackagePlan(
    storedConfig,
    options,
    dailyIntakeG || optionDailyIntakeG,
    mealsPerDay,
    cycleDays,
    readPositiveInteger(storedConfig.totalPackages, options.totalPackages),
    perMealG || readPositiveInteger(options.perMealG),
  );
  const packagePlanTotal = getPackagePlanTotal(packagePlan);
  const totalPackages =
    readPositiveInteger(storedConfig.totalPackages, options.totalPackages) ||
    packagePlanTotal.totalPackages;
  const totalGrams = readPositiveNumber(
    storedConfig.totalGrams,
    readPositiveNumber(options.totalGrams, packagePlanTotal.totalGrams),
  );
  const estimatedFeedDays = readTextValue(
    storedConfig.estimatedFeedDays,
    options.estimatedFeedDays ||
      estimateFeedDays(totalGrams, dailyIntakeG || optionDailyIntakeG),
  );
  const ingredientSourcePlan = readTextValue(
    storedConfig.ingredientSourcePlan,
    options.ingredientSourcePlan,
  );
  const ingredientSourcePlanLabel = readTextValue(
    storedConfig.ingredientSourcePlanLabel,
    options.ingredientSourcePlanLabel ||
      (ingredientSourcePlan
        ? getSourcePlanLabel(ingredientSourcePlan as any)
        : ''),
  );
  const recipeId = readTextValue(storedConfig.recipeId, options.recipeId);
  const recipeName = readTextValue(storedConfig.recipeName, options.recipeName);
  const recipeCoverImage = readTextValue(
    storedConfig.recipeCoverImage,
    options.recipeCoverImage,
  );

  return {
    dogId,
    dogName,
    breedName,
    weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
    mealsPerDay,
    dailyIntakeG: dailyIntakeG || optionDailyIntakeG || 0,
    perMealG,
    totalPackages,
    cycleDays,
    totalGrams,
    estimatedFeedDays:
      estimatedFeedDays ||
      estimateFeedDays(totalGrams, dailyIntakeG || optionDailyIntakeG),
    packagePlan,
    ingredientSourcePlan,
    ingredientSourcePlanLabel,
    preparationMethod: (readTextValue(
      storedConfig.preparationMethod,
      options.preparationMethod,
    ) || 'CHOPPED') as 'CHOPPED' | 'DICED',
    cookingMethod: (readTextValue(
      storedConfig.cookingMethod,
      options.cookingMethod,
    ) || 'RAW') as 'RAW' | 'COOKED',
    recipeId,
    recipeName,
    recipeCoverImage,
    orderKind,
    sets: readPositiveInteger(storedConfig.sets, options.sets) || 0,
    tastingPackCode: readTextValue(
      storedConfig.tastingPackCode,
      options.tastingPackCode,
    ),
  };
}

// ========== 地址选择器相关 ==========
async function openAddressSelector() {
  if (!selectedAddress.value) {
    goToAddressList();
    return;
  }

  try {
    const res = await request({
      url: '/addresses',
      method: 'GET',
    });

    if (res.code === 0 && res.data && res.data.length > 0) {
      addressList.value = res.data.map((addr: any) => ({
        id: addr.id,
        recipientName: addr.recipientName,
        phone: addr.phone,
        regionText: formatRegionText(addr.region),
        detailAddress: addr.detailAddress,
        isDefault: addr.isDefault,
      }));
      showAddressSelector.value = true;
    }
  } catch (error) {
    console.error('Load address list error:', error);
  }
}

function closeAddressSelector() {
  showAddressSelector.value = false;
}

function selectAddress(addr: Address) {
  selectedAddress.value = addr;
  showAddressSelector.value = false;
  uni.showToast({
    title: '已切换地址',
    icon: 'success',
  });
}

// ========== 制作日期相关 ==========
function openProductionDatePicker() {
  showProductionDatePicker.value = true;
}

function onProductionDateChange(e: any) {
  selectedProductionDate.value = e.detail.value;
  showProductionDatePicker.value = false;
  console.log('[Checkout] Production date changed:', {
    productionDate: selectedProductionDate.value,
    shippingDate: calculatedShippingDate.value,
  });
}

// ========== 数据加载 ==========
onMounted(() => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1] as any;
  const options = currentPage.options || {};

  console.log('[Checkout] URL options:', options);

  loadDirectBuyItem(options);
  loadDefaultAddress();
  selectedProductionDate.value = defaultProductionDate.value;
});

// onShow - 每次页面显示时重新加载地址
onShow(async () => {
  // 漏斗：进入结算页（漏斗第 7 步）
  trackFunnelEvent({
    eventName: 'checkout_view',
    step: 'checkout',
    recipeId: orderConfig.value.recipeId,
    dogId: orderConfig.value.dogId,
  });

  // 手机号不在这里拦：让顾客先看清订单内容（地址、日期、金额、保障），
  // 真正需要它的是「提交订单」那一刻，见 submitOrder()。
  // 只在已经加载过订单配置后才重新加载地址（避免首次加载时重复请求）
  if (pricingSnapshotId.value) {
    console.log('[Checkout] onShow - reloading default address');
    loadDefaultAddress();
  }
});

// 监听地址选择事件（从地址列表返回时）
onMounted(() => {
  const handleAddressSelected = (data: any) => {
    console.log('[Checkout] Address selected event:', data);
    if (data && data.addressId) {
      // 加载选中的地址
      loadAddressById(data.addressId);
    }
  };

  uni.$on('address-selected', handleAddressSelected);

  // 清理事件监听器
  onUnmounted(() => {
    uni.$off('address-selected', handleAddressSelected);
  });
});

// 根据ID加载地址
async function loadAddressById(addressId: string) {
  try {
    const res = await request({
      url: '/addresses',
      method: 'GET',
    });

    if (res.code === 0 && res.data && res.data.length > 0) {
      const address = res.data.find((addr: any) => addr.id === addressId);
      if (address) {
        selectedAddress.value = {
          id: address.id,
          recipientName: address.recipientName,
          phone: address.phone,
          regionText: formatRegionText(address.region),
          detailAddress: address.detailAddress,
          isDefault: address.isDefault,
        };
        uni.showToast({
          title: '已选择地址',
          icon: 'success',
        });
      }
    }
  } catch (error) {
    console.error('Load address by ID error:', error);
  }
}

function loadDirectBuyItem(options: any) {
  const rawStoredConfig = (uni.getStorageSync('direct_buy_order_config') ||
    {}) as Record<string, any>;
  const optionSnapshotId = readTextValue(options.snapshotId);
  const storedSnapshotId = readTextValue(rawStoredConfig.snapshotId);
  const shouldUseStoredConfig = Boolean(
    storedSnapshotId &&
    (!optionSnapshotId || storedSnapshotId === optionSnapshotId),
  );
  const storedConfig = shouldUseStoredConfig ? rawStoredConfig : {};

  pricingSnapshotId.value = optionSnapshotId || storedSnapshotId || null;
  console.log('[Checkout] Pricing Snapshot ID:', pricingSnapshotId.value);

  directBuyPrice.value = buildDirectBuyPrice(storedConfig, options);
  orderConfig.value = buildDirectBuyOrderConfig(storedConfig, options);

  const item: CartItem = {
    id: 'direct-buy-temp',
    dogId: orderConfig.value.dogId || '',
    dogName: orderConfig.value.dogName,
    dogBreedName: orderConfig.value.breedName,
    dogWeightKg: orderConfig.value.weightKg,
    recipeId: orderConfig.value.recipeId || '',
    recipeName: orderConfig.value.recipeName,
    recipeCoverImage: orderConfig.value.recipeCoverImage,
    cycleDays: orderConfig.value.cycleDays,
    dailyIntakeG: orderConfig.value.dailyIntakeG,
    totalGrams: orderConfig.value.totalGrams,
    packageCount: orderConfig.value.totalPackages,
    packageSpecG:
      orderConfig.value.packagePlan[0]?.packageSpecG ||
      orderConfig.value.perMealG,
    unitPrice: 0,
    totalPrice: directBuyPrice.value.amountTotal,
    preparationMethod: orderConfig.value.preparationMethod,
    cookingMethod: orderConfig.value.cookingMethod,
  };

  cartItems.value = [item];
  console.log('[Checkout] Price display:', {
    amountProduct: directBuyPrice.value.amountProduct,
    amountShipping: directBuyPrice.value.amountShipping,
    amountTotal: directBuyPrice.value.amountTotal,
  });
}

async function loadDefaultAddress() {
  try {
    const res = await request({
      url: '/addresses',
      method: 'GET',
    });

    if (res.code === 0 && res.data && res.data.length > 0) {
      const defaultAddr =
        res.data.find((addr: any) => addr.isDefault) || res.data[0];
      if (defaultAddr) {
        selectedAddress.value = {
          id: defaultAddr.id,
          recipientName: defaultAddr.recipientName,
          phone: defaultAddr.phone,
          regionText: formatRegionText(defaultAddr.region),
          detailAddress: defaultAddr.detailAddress,
          isDefault: defaultAddr.isDefault,
        };
      }
    }
  } catch (error) {
    console.error('Load address error:', error);
  }
}

function formatRegionText(region: any): string {
  if (!region) return '';
  if (typeof region === 'string') return region;
  const parts = [region.province, region.city, region.district].filter(Boolean);
  return parts.join('');
}

function getPrimaryPackageSpecG(plan: PackagePlanItem[]): number {
  const primaryRow = [...plan].sort(
    (left, right) =>
      right.packageCount - left.packageCount ||
      right.packageSpecG - left.packageSpecG,
  )[0];

  return primaryRow?.packageSpecG || orderConfig.value.perMealG || 1;
}

function buildPricingPreviewItemFromOrderConfig() {
  return {
    recipeId: orderConfig.value.recipeId,
    quantityG: Math.round(orderConfig.value.totalGrams),
    packageCount: orderConfig.value.totalPackages,
    packageSpecG: getPrimaryPackageSpecG(orderConfig.value.packagePlan),
    packagePlan: orderConfig.value.packagePlan,
    cycleDays: orderConfig.value.cycleDays,
    dailyIntakeG: orderConfig.value.dailyIntakeG,
    preparationMethod: orderConfig.value.preparationMethod || undefined,
    cookingMethod: orderConfig.value.cookingMethod || undefined,
    customRequirements: customerNote.value.trim() || undefined,
  };
}

function isPricingSnapshotExpiredError(error: any): boolean {
  const message = normalizeText(error?.message || error);
  return (
    message.includes('Pricing snapshot has expired') ||
    message.includes('Pricing snapshot not found or expired') ||
    message.includes('价格快照已失效')
  );
}

async function refreshDirectBuyPricingSnapshot(): Promise<{
  success: boolean;
  priceChanged: boolean;
}> {
  // 现货：价格只认服务端的库存批次成本报价，不套用鲜食那套按狗狗算量的预览接口。
  // 这里重新报价同时也会再校验一次可售量 —— 库存被别人买走时能及时拦住。
  if (isStockOrder.value) {
    const code = orderConfig.value.tastingPackCode;
    if (!code || orderConfig.value.sets <= 0) {
      uni.showToast({ title: '价格已过期，请返回重新下单', icon: 'none' });
      return { success: false, priceChanged: false };
    }

    const previousAmount = directBuyPrice.value.amountTotal;
    try {
      uni.showLoading({ title: '更新价格...' });
      const res = await quoteTastingPack({
        idOrCode: code,
        sets: orderConfig.value.sets,
        addressId: selectedAddress.value?.id,
      });
      if (res.code !== 0 || !res.data?.snapshotId) {
        throw new Error(res.message || '价格刷新失败');
      }

      pricingSnapshotId.value = res.data.snapshotId;
      directBuyPrice.value = {
        amountProduct: res.data.amountProduct,
        amountShipping: res.data.amountShipping,
        amountTotal: res.data.amountTotal,
      };

      const storedConfig = (uni.getStorageSync('direct_buy_order_config') ||
        {}) as Record<string, any>;
      uni.setStorageSync('direct_buy_order_config', {
        ...storedConfig,
        snapshotId: pricingSnapshotId.value,
        amountProduct: res.data.amountProduct,
        amountShipping: res.data.amountShipping,
        amountTotal: res.data.amountTotal,
      });

      return {
        success: true,
        priceChanged:
          Math.abs(res.data.amountTotal - previousAmount) >= 0.01,
      };
    } catch (error: any) {
      console.error('Refresh tasting pack quote error:', error);
      uni.showToast({
        title: error?.message || '价格已过期，请返回重新下单',
        icon: 'none',
      });
      return { success: false, priceChanged: false };
    } finally {
      uni.hideLoading();
    }
  }

  if (
    !orderConfig.value.dogId ||
    !orderConfig.value.recipeId ||
    orderConfig.value.packagePlan.length === 0
  ) {
    uni.showToast({
      title: '价格已过期，请返回重新下单',
      icon: 'none',
    });
    return { success: false, priceChanged: false };
  }

  const previousAmount = directBuyPrice.value.amountTotal;

  try {
    uni.showLoading({ title: '更新价格...' });
    const res = await request({
      url: '/orders/pricing/preview',
      method: 'POST',
      suppressErrorToast: true,
      data: {
        dogId: orderConfig.value.dogId,
        type: 'FRESH_FOOD',
        ingredientSourcePlan: orderConfig.value.ingredientSourcePlan,
        addressId: selectedAddress.value?.id,
        items: [buildPricingPreviewItemFromOrderConfig()],
      },
    });

    if (res.code !== 0 || !res.data?.snapshotId) {
      throw new Error(res.message || '价格刷新失败');
    }

    const refreshedPrice = {
      amountProduct: res.data.amountProduct || 0,
      amountShipping: res.data.amountShipping || 0,
      amountTotal: res.data.amountTotal || 0,
    };

    pricingSnapshotId.value = res.data.snapshotId;
    directBuyPrice.value = refreshedPrice;
    const storedConfig = (uni.getStorageSync('direct_buy_order_config') ||
      {}) as Record<string, any>;
    uni.setStorageSync('direct_buy_order_config', {
      ...storedConfig,
      snapshotId: pricingSnapshotId.value,
      amountProduct: refreshedPrice.amountProduct,
      amountShipping: refreshedPrice.amountShipping,
      amountTotal: refreshedPrice.amountTotal,
    });

    return {
      success: true,
      priceChanged:
        Math.abs(refreshedPrice.amountTotal - previousAmount) >= 0.01,
    };
  } catch (error) {
    console.error('Refresh pricing snapshot error:', error);
    uni.showToast({
      title: '价格已过期，请返回重新下单',
      icon: 'none',
    });
    return { success: false, priceChanged: false };
  } finally {
    uni.hideLoading();
  }
}

// ========== 订单提交 ==========
async function submitOrder(hasRefreshedSnapshot = false) {
  if (!canSubmitOrder.value) return;

  // 手机号唯一的强制点：下单后需要用它做订单履约与售后联系。
  // 放在这一秒而不是页面加载时，是为了不打断顾客核对订单的过程。
  if (!(await ensurePhoneBound())) return;

  if (!selectedAddress.value) {
    uni.showToast({
      title: '请先选择收货地址',
      icon: 'none',
    });
    return;
  }

  if (!pricingSnapshotId.value) {
    uni.showToast({
      title: '价格快照已失效',
      icon: 'none',
    });
    return;
  }

  let submittedOrderId = '';

  try {
    uni.showLoading({ title: '提交中...' });

    // 1. 创建订单
    const createRes = await request({
      url: '/orders',
      method: 'POST',
      suppressErrorToast: true,
      data: {
        // 现货订单用 TASTING_PACK：服务端据此跳过排产、
        // 并把成品库存扣掉；鲜食仍走 FRESH_FOOD
        type: isStockOrder.value ? 'TASTING_PACK' : 'FRESH_FOOD',
        addressId: selectedAddress.value!.id,
        snapshotId: pricingSnapshotId.value,
        // 现货不排产，不带制作日期
        ...(isStockOrder.value
          ? {}
          : { targetProductionDate: selectedProductionDate.value }),
      },
    });

    if (createRes.code !== 0) {
      throw new Error(createRes.message || '创建订单失败');
    }

    const orderId = createRes.data.id;
    submittedOrderId = orderId;

    // 2. 确认订单
    const confirmRes = await request({
      url: `/orders/${orderId}/confirm`,
      method: 'POST',
    });

    if (confirmRes.code !== 0) {
      throw new Error(confirmRes.message || '确认订单失败');
    }

    // 漏斗：订单提交成功（漏斗第 8 步）
    trackFunnelEvent({
      eventName: 'order_submitted',
      step: 'order_submitted',
      recipeId: orderConfig.value.recipeId,
      dogId: orderConfig.value.dogId,
      orderId,
      properties: {
        amountTotal: totalAmount.value,
        // 支付前的最后一道：用于验证"绑手机后置到结算"是否真的没有漏人
        hadAddress: Boolean(selectedAddress.value?.id),
      },
    });

    uni.hideLoading();
    uni.showToast({
      title: '订单已生成',
      icon: 'success',
      duration: 1500,
    });

    uni.redirectTo({
      url: `/pages/order-detail/index?orderId=${orderId}`,
    });
  } catch (error: any) {
    console.error('Submit order error:', error);
    if (isPricingSnapshotExpiredError(error) && !hasRefreshedSnapshot) {
      uni.hideLoading();
      const refreshed = await refreshDirectBuyPricingSnapshot();
      if (!refreshed.success) return;
      if (refreshed.priceChanged) {
        uni.showToast({
          title: '价格已更新，请确认后重新提交',
          icon: 'none',
        });
        return;
      }
      await submitOrder(true);
      return;
    }

    if (submittedOrderId) {
      uni.showModal({
        title: '订单已生成',
        content: `${error.message || '订单确认未完成'}，请前往订单详情核对后继续处理。`,
        showCancel: false,
        success: () => {
          uni.redirectTo({
            url: `/pages/order-detail/index?orderId=${submittedOrderId}`,
          });
        },
      });
    } else {
      uni.showToast({
        title: error.message || '提交失败',
        icon: 'none',
      });
    }
  } finally {
    uni.hideLoading();
  }
}

// ========== 页面跳转 ==========
function goToAddressList() {
  uni.navigateTo({
    url: '/pages/address-list/index?mode=select',
  });
}

function goToAddAddress() {
  uni.navigateTo({
    url: '/pages/address-edit/index',
  });
}
</script>

<style scoped>
.checkout-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-bottom: 200rpx;
}

.section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: bold;
  color: #26261f;
}

.title-text {
  font-size: 30rpx;
  font-weight: bold;
  color: #26261f;
}

.order-note-section {
  display: flex;
  flex-direction: column;
}

.order-note-input {
  width: 100%;
  min-height: 150rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 12rpx;
  background-color: #eef2e4;
  font-size: 28rpx;
  line-height: 1.6;
  color: #26261f;
}

.order-note-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 14rpx;
}

.order-note-hint {
  flex: 1;
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.45;
}

.order-note-count {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #6b6653;
}

/* 收货地址 */
.address-section {
  position: relative;
}

.address-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  transition: background-color 0.2s;
}

.address-card:active {
  background-color: #f0f3e9;
}

.address-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.address-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.recipient {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.default-badge {
  padding: 4rpx 12rpx;
  background-color: #b4553f;
  color: #f3eddd;
  font-size: 20rpx;
  border-radius: 4rpx;
}

.detail {
  font-size: 26rpx;
  color: #26261f;
}

.no-address-card {
  padding: 60rpx 20rpx;
  text-align: center;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #6b6653;
}

.btn-add-address {
  padding: 12rpx 32rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 24rpx;
  font-size: 26rpx;
  border: none;
}

.shipping-note {
  margin-top: 16rpx;
  padding: 12rpx 16rpx;
  background-color: #eef2e4;
  border-radius: 8rpx;
}

.note-text {
  font-size: 24rpx;
  color: #b08d4f;
}

.arrow {
  font-size: 32rpx;
  color: #6b6653;
  margin-left: 20rpx;
}

/* 地址选择器 */
.address-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.address-selector {
  width: 100%;
  max-height: 70vh;
  background-color: #fbfcf7;
  border-radius: 24rpx 24rpx 0 0;
  display: flex;
  flex-direction: column;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #eef1e2;
}

.selector-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
}

.selector-close {
  font-size: 48rpx;
  color: #6b6653;
  line-height: 1;
}

.address-list {
  flex: 1;
  overflow-y: auto;
}

.address-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #eef1e2;
}

.address-list-item.selected {
  background-color: #eef2e4;
}

.list-address-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.list-address-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.list-recipient {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.list-detail {
  font-size: 26rpx;
  color: #26261f;
}

.check-icon {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background-color: #1e3a2f;
  color: #f3eddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
}

.selector-footer {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid #eef1e2;
}

.btn-manage-address {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #fbfcf7;
  color: #b08d4f;
  border: 2rpx solid #1e3a2f;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: bold;
  text-align: center;
}

/* 制作日期选择 */
.production-date-section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.date-display-button {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  border: 1rpx solid #e5e8d4;
}

.date-display-button:active {
  background-color: #f0f3e9;
}

.date-label {
  font-size: 28rpx;
  color: #26261f;
}

.date-value {
  flex: 1;
  font-size: 32rpx;
  color: #26261f;
  font-weight: bold;
  margin-left: 16rpx;
}

.auto-tag {
  font-size: 24rpx;
  color: #6b6653;
  margin-left: 8rpx;
}

.picker-arrow {
  font-size: 24rpx;
  color: #6b6653;
  margin-left: 16rpx;
}

.date-picker-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  border: 2rpx solid #1e3a2f;
}

.date-tips {
  margin-top: 16rpx;
  padding: 16rpx;
  background-color: #f6efe0;
  border-radius: 8rpx;
}

.tip-text {
  font-size: 24rpx;
  color: #8a6b33;
  line-height: 1.5;
}

.date-info-row {
  margin-top: 16rpx;
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}

.date-info-item-left,
.date-info-item-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx;
  background-color: #eef2e4;
  border-radius: 8rpx;
}

.date-info-label {
  font-size: 24rpx;
  color: #26261f;
  margin-bottom: 8rpx;
}

.date-info-value {
  font-size: 28rpx;
  color: #1e3a2f;
  font-weight: bold;
}

/* 配置信息板块 */
.config-info-section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.info-card {
  padding: 20rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.info-card:last-child {
  margin-bottom: 0;
}

.dog-info-card {
  background-color: #eef2e4;
  border-left: 4rpx solid #1e3a2f;
}

.order-info-card {
  background-color: #eef2e4;
  border-left: 4rpx solid #1e3a2f;
}

.requirement-card {
  background-color: #f6efe0;
  border-left: 4rpx solid #b08d4f;
}

.recipe-card {
  background-color: #fbfcf7;
  border-left: 4rpx solid #1e3a2f;
}

.recipe-card-top {
  background-color: #fbfcf7;
  border-left: 4rpx solid #1e3a2f;
  margin-bottom: 16rpx;
}

.info-card-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
  margin-bottom: 16rpx;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx 24rpx;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16rpx;
  padding: 12rpx 0;
}

.config-label {
  font-size: 26rpx;
  color: #26261f;
  flex-shrink: 0;
}

.config-value {
  flex: 1;
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
  text-align: right;
  word-break: break-word;
}

.recipe-content {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.recipe-cover-small {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.recipe-cover-placeholder {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recipe-cover-placeholder text {
  font-size: 32rpx;
  font-weight: bold;
  color: #f3eddd;
}

.recipe-name {
  flex: 1;
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.info-card-subtitle {
  display: block;
  margin-top: 16rpx;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.package-plan-section {
  padding-top: 8rpx;
}

.package-plan-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 12rpx 16rpx;
  margin-top: 12rpx;
  background-color: rgba(251, 252, 247, 0.6);
  border-radius: 8rpx;
}

.package-plan-row-text {
  font-size: 26rpx;
  color: #26261f;
  word-break: break-word;
}

/* 简化价格展示 */
.price-section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.price-card-simple {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx 24rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
}

.price-card-note {
  display: flex;
  justify-content: flex-end;
  padding: 12rpx 24rpx 0;
}

.price-note-text {
  font-size: 22rpx;
  color: #6b6653;
}

/* 售后保障复述：与订购页同一口径，支付前再讲一次 */
.checkout-cancel-policy {
  display: flex;
  flex-direction: column;
  margin-top: 16rpx;
  padding: 20rpx 22rpx;
  border-radius: 12rpx;
  background-color: #f7f8f2;
  border: 1rpx solid #e5e8d4;
}

.checkout-cancel-policy-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.checkout-cancel-policy-text {
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.55;
  color: #6b6653;
}

.checkout-assurance {
  display: flex;
  align-items: flex-start;
  margin: 20rpx 24rpx 0;
  padding: 18rpx 20rpx;
  background: #eef3ea;
  border-radius: 12rpx;
}

.checkout-assurance-icon {
  flex: none;
  width: 32rpx;
  height: 32rpx;
  margin-right: 14rpx;
  border-radius: 50%;
  background: #1e3a2f;
  color: #f6efe0;
  font-size: 20rpx;
  font-weight: 700;
  text-align: center;
  line-height: 32rpx;
}

.checkout-assurance-text {
  flex: 1;
  font-size: 24rpx;
  line-height: 1.5;
  color: #1e3a2f;
}

.price-label {
  font-size: 28rpx;
  color: #26261f;
}

.price-value-large {
  font-size: 48rpx;
  font-weight: bold;
  color: #b4553f;
}

/* 支付方式提示 */
.payment-guide-section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.payment-guide-card {
  padding: 24rpx;
  background: linear-gradient(135deg, #eef2e4 0%, #e2e8d4 100%);
  border-radius: 12rpx;
  border-left: 4rpx solid #1e3a2f;
}

.guide-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.guide-icon {
  font-size: 32rpx;
}

.guide-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #b08d4f;
}

.guide-steps {
  margin-bottom: 24rpx;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.step-item:last-child {
  margin-bottom: 0;
}

.step-number {
  width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 50%;
  font-size: 22rpx;
  font-weight: bold;
  flex-shrink: 0;
}

.step-text {
  flex: 1;
  font-size: 26rpx;
  color: #26261f;
  line-height: 36rpx;
}

.wechat-contact {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.contact-label {
  font-size: 26rpx;
  color: #26261f;
}

.contact-value {
  flex: 1;
  font-size: 28rpx;
  color: #b08d4f;
  font-weight: bold;
  font-family: monospace;
}

.btn-copy-wechat {
  padding: 8rpx 20rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
}

.payment-tip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx;
  background-color: #f6efe0;
  border-radius: 8rpx;
}

.tip-icon {
  font-size: 28rpx;
}

.tip-text {
  flex: 1;
  font-size: 24rpx;
  color: #8a6b33;
  line-height: 1.5;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background-color: #fbfcf7;
  box-shadow: 0 -8rpx 28rpx rgba(30, 46, 36, 0.08);
  z-index: 100;
}

.bottom-price {
  min-width: 0;
  max-width: calc(100% - 470rpx);
  margin-left: auto;
  margin-right: 0;
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  text-align: right;
}

.bottom-total {
  max-width: 100%;
  font-size: 36rpx;
  color: #b4553f;
  font-weight: 800;
  line-height: 1.15;
  text-align: right;
}

.bottom-estimate {
  max-width: 100%;
  font-size: 23rpx;
  color: #6b6653;
  line-height: 1.3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2rpx;
  overflow: hidden;
  text-align: right;
}

.bottom-price-per-package {
  max-width: 100%;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.btn-submit-order {
  width: 240rpx;
  flex-shrink: 0;
  margin: 0;
  height: 80rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 40rpx;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}

.btn-submit-order[disabled] {
  background-color: #eef2e4;
  color: #968f6d;
}

.customer-service-bottom-action {
  flex: 0 0 auto;
}

.btn-amount {
  font-size: 36rpx;
}

/* 模拟支付弹窗 */
.payment-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.payment-modal {
  width: 640rpx;
  background-color: #fbfcf7;
  border-radius: 24rpx;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #eef1e2;
}

.modal-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
}

.modal-close {
  font-size: 48rpx;
  color: #6b6653;
  line-height: 1;
}

.modal-body {
  padding: 32rpx;
}

.payment-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #eef1e2;
}

.amount-label {
  font-size: 28rpx;
  color: #26261f;
}

.amount-value {
  font-size: 40rpx;
  font-weight: bold;
  color: #b4553f;
}

.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.payment-method-item {
  display: flex;
  align-items: center;
  padding: 24rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 12rpx;
  gap: 16rpx;
}

.payment-method-item.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.method-icon {
  font-size: 48rpx;
  flex-shrink: 0;
}

.method-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.method-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
}

.method-desc {
  font-size: 24rpx;
  color: #6b6653;
}

.method-radio {
  width: 40rpx;
  height: 40rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.method-radio.checked {
  border-color: #1e3a2f;
  background-color: #1e3a2f;
}

.radio-dot {
  font-size: 24rpx;
  color: #f3eddd;
}

.password-input {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
}

.password-label {
  display: block;
  font-size: 26rpx;
  color: #26261f;
  margin-bottom: 16rpx;
  text-align: center;
}

.password-dots {
  display: flex;
  justify-content: center;
  gap: 16rpx;
}

.dot {
  width: 48rpx;
  height: 48rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot.filled {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.dot text {
  font-size: 32rpx;
  color: #b08d4f;
}

.password-input-hidden {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.modal-footer {
  padding: 24rpx 32rpx 32rpx;
}

.btn-pay-confirm {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  text-align: center;
}

.btn-pay-confirm[disabled] {
  background-color: #f2f4ea;
  color: #6b6653;
}
</style>
