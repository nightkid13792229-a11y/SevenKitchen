<template>
  <view class="shopping-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <view v-else-if="!resolved" class="state-block">
      <text class="state-title">还没有交付内容</text>
      <text class="state-text">营养师交付后会在这里显示，并给你发通知</text>
      <button class="state-btn" @tap="goBack">返回</button>
    </view>

    <template v-else>
      <!--
        交付内容 · 第 2 页「采购与制作」（2026-10-16，批次 2.6）

        ## 为什么单独一页
        这一页的东西是**采购和做饭那一次**才看的 ——
        与第 1 页「每天喂多少」（天天要看）使用时机不同。
        混在一起的话，天天要看的那个每次都得划过一大段采购清单。

        ## 与第 1 页一样，这里**没有任何计算**
        要买多少克、含多少损耗余量、补充剂每 kg 加多少，
        全部来自后端在交付时冻结的快照。
      -->
      <view class="hero">
        <text class="hero-title">采购与制作</text>
        <text class="hero-sub">
          {{ resolved.recipeName || content.recipe.name }} · 第
          {{ resolved.version }} 版
        </text>
        <text v-if="resolved.isBatch && resolved.batchSize > 1" class="hero-batch">
          本次共交付 {{ resolved.batchSize }} 份 · 可在订单详情切换查看
        </text>
      </view>

      <!-- 这一批要做多少：先给总量，再给采购清单，读起来才有上下文 -->
      <view v-if="hasBatch" class="section">
        <view class="section-title">这一批要做多少</view>
        <view v-if="content.feeding.dailyIntakeG" class="info-row">
          <text class="label">每天</text>
          <text class="value">
            {{ content.feeding.dailyIntakeG }} 克<template
              v-if="content.feeding.mealsPerDay"
              >，分 {{ content.feeding.mealsPerDay }} 餐</template
            >
          </text>
        </view>
        <view v-if="content.feeding.cycleDays" class="info-row">
          <text class="label">这批做</text>
          <text class="value">{{ content.feeding.cycleDays }} 天</text>
        </view>
        <view v-if="content.shopping.totalNetG" class="info-row">
          <text class="label">总净重</text>
          <text class="value">{{ content.shopping.totalNetG }} 克</text>
        </view>
        <view v-if="content.feeding.perMealG" class="info-row">
          <text class="label">每餐</text>
          <text class="value">{{ content.feeding.perMealG }} 克</text>
        </view>
      </view>

      <!--
        要买什么：整块由**后端算好**。
        算不出来时后端给空清单，这里如实说"暂时算不出"，
        而不是显示一堆 0 让顾客以为不用买。
      -->
      <view class="section">
        <view class="section-title">每种食材要用多少</view>
        <RecipeIngredientUsageTable :items="foodUsageRows" />
        <text v-if="content.shopping.lines.length" class="section-note">
          只写"这次要用多少"。要买多少，你自己判断 —— 不同食材的损耗差很多，我们没法替你估。
        </text>
      </view>

      <!--
        补剂：2026-10-18 改成「**这次要备多少**」。

        老板原话："就不再展示营养素添加量，而是应该展示每一个补剂需要用多少了"。
        原来给的是"每 kg 食材加多少"（比例），顾客还得自己乘一遍总净重。

        2026-10-23：交付时冻结了可替换产品（名称/品牌/购买链接）；
        顾客可以换一个产品去买，但配方里的补剂用量不变。
      -->
      <view v-if="content.supplements.length" class="section">
        <view class="section-title">额外补充的营养素</view>
        <view class="supp-card-list">
          <view
            v-for="(item, index) in content.supplements"
            :key="index"
            class="supp-card"
          >
            <view class="supp-card__top">
              <text class="supp-card__name">{{ item.name }}</text>
              <text class="supp-card__amount">{{ formatSupplementTotal(item) }}</text>
            </view>
            <text v-if="supplementHint(item)" class="supp-card__sub">
              {{ supplementHint(item) }}
            </text>
            <text
              v-if="(item.alternatives || []).length"
              class="supp-card__switch"
              @tap="chooseSupplementAlternative(item)"
            >换一个 / 去买 ›</text>
          </view>
        </view>

        <!--
          一键买齐（2026-10-18）。

          ⚠️ **只有全部补剂都带 `ingredientId` 时才显示** ——
          老快照里没有这个字段。拿不到 id 就建不了下单行，
          显示一个点了报错的按钮，比不显示更糟。
        -->
        <button
          v-if="canBuySupplements"
          class="buy-supplements-btn"
          @tap="handleBuySupplements"
        >
          一键买齐预分装补剂
        </button>
      </view>

      <view v-if="content.steps.length" class="section">
        <view class="section-title">怎么做</view>
        <view v-for="(step, index) in content.steps" :key="index" class="step-row">
          <text class="step-index">{{ index + 1 }}</text>
          <text class="step-text">{{ step }}</text>
        </view>
      </view>

      <view v-if="content.storage" class="section">
        <view class="section-title">怎么存</view>
        <text class="section-note">{{ content.storage }}</text>
      </view>

      <!--
        制作设备推荐（2026-10-18 · 需求 2.4.2 ⑦ / V56）

        老板："也需要有制作设备推荐的板块"。

        数据来自 `/global-config` 的 `equipmentRecommendations` ——
        它是**全局配置**（不是每份食谱不同），所以不进交付快照：
        快照是冻结的，设备清单会随运营调整，塞进快照就等于锁死了。

        **拿不到就整块不画**（不占版面、不留空壳）。
      -->
      <view v-if="equipmentList.length" class="section">
        <view class="section-title">制作设备</view>
        <view class="equipment-row-list">
          <view
            v-for="item in equipmentList"
            :key="item.id"
            class="equipment-row"
            @tap="openEquipment(item)"
          >
            <image
              v-if="item.imageUrl"
              :src="item.imageUrl"
              class="equipment-row__icon"
              mode="aspectFill"
            />
            <view v-else class="equipment-row__icon equipment-row__icon--empty">
              <text class="equipment-row__initial">{{ item.name.slice(0, 1) }}</text>
            </view>
            <view class="equipment-row__text">
              <text class="equipment-row__name">{{ item.name }}</text>
              <text v-if="item.reason" class="equipment-row__reason">{{ item.reason }}</text>
            </view>
            <text v-if="item.purchaseLink" class="equipment-row__action">去买 ›</text>
          </view>
        </view>
      </view>

      <!--
        存长图（2026-10-16 批次 2.7）。
        用途很实在：买菜时直接把图给摊主看，或者打印出来贴冰箱上。

        ⚠️ 画布放在**屏幕外**（见样式），不是隐藏 ——
        小程序里 `display:none` 的画布取不到绘图上下文。
      -->
      <button class="save-image" :disabled="generating" @tap="saveAsImage">
        {{ generating ? '正在生成图片...' : '保存为图片（买菜/打印用）' }}
      </button>

      <canvas
        canvas-id="deliveryPrintCanvas"
        id="deliveryPrintCanvas"
        class="print-canvas"
        :width="CANVAS_OUTPUT_WIDTH"
        :height="canvasOutputHeight"
        :style="canvasStyle"
      ></canvas>

      <!-- 回到第 1 页：顾客做完饭多半要回去看"每天喂多少" -->
      <button class="goto-recipe" @tap="goRecipe">返回专属食谱</button>

      <view class="footer-note">
        <text>这份内容在交付时已存档，之后调整配方不会改变你现在看到的版本。</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchDelivery } from '@/api/custom-recipe';
import {
  buildDeliveryDetailUrl,
  resolveDeliverySelection,
  type CustomRecipeDeliveryResponse,
} from '@/utils/custom-recipe-delivery';
import RecipeIngredientUsageTable from '@/components/recipe/RecipeIngredientUsageTable.vue';
import { PrintCanvasBuilder } from '@/utils/print-canvas';
import { drawDeliverySheet } from '@/utils/delivery-print';
import { saveSupplementPurchaseDraft } from '@/api/supplements';
import { getBaseUrl } from '@/utils/config';
import { request } from '@/utils/api';

const orderId = ref('');
const recipeId = ref('');
const loading = ref(true);
const delivery = ref<CustomRecipeDeliveryResponse | null>(null);

/**
 * 本次要采购/制作的那一份。
 *
 * 多份订单按 `recipeId` 选；老单份交付原样收敛，`content` 不变。
 * 第 2 页的清单必须和第 1 页看的是同一份 —— 否则顾客会照着鸭肉的
 * 采购单去做鸡肉。
 */
const resolved = computed(() =>
  resolveDeliverySelection(delivery.value, recipeId.value),
);

const content = computed(
  () =>
    resolved.value?.content ?? {
      schemaVersion: 1,
      recipe: { recipeId: '', name: '', items: [] },
      feeding: {
        dailyIntakeG: null,
        mealsPerDay: null,
        perMealG: null,
        cycleDays: null,
      },
      nutrition: {
        standard: null,
        energyDensityKcalPerKg: null,
      },
      shopping: { lines: [], totalNetG: 0 },
      supplements: [],
      steps: [],
      storage: null,
      generatedAt: '',
    },
);

/** 有没有"这一批做多少"可讲 —— 一个数都没有就不显示这一块 */
const hasBatch = computed(
  () =>
    content.value.feeding.dailyIntakeG !== null ||
    content.value.feeding.cycleDays !== null ||
    content.value.shopping.totalNetG > 0,
);

/**
 * 用量表的行（2026-10-18）。
 *
 * 快照里 `shopping.lines` 只有 name/netG，没有制备方法 ——
 * 制备方法在 `recipe.items` 里。按名称对齐后合并。
 */
const foodUsageRows = computed(() => {
  const preparations = new Map<string, string | null>();
  for (const item of content.value.recipe.items || []) {
    if (item.preparation) preparations.set(item.name, item.preparation);
  }
  return (content.value.shopping.lines || []).map((line) => ({
    name: line.name,
    netG: line.netG,
    preparation: preparations.get(line.name) ?? null,
  }));
});

/** 补剂「这次要备多少」—— 后端已算好 `totalG`，前端只格式化 */
/**
 * 能不能一键买齐（2026-10-18）。
 *
 * ⚠️ 要求**每一个**补剂都同时有 `ingredientId` 和正数用量：
 *   · 老快照里没有 `ingredientId` → 建不了下单行
 *   · 用量为 0 或 null → 买了也没意义
 *
 * 拿不到就**整颗按钮不显示** —— 顾客看到按钮点进去必然失败，还不如不显示。
 */
/**
 * 换一个补剂产品。
 *
 * 交付快照里存的是"可替换产品"，不是实时商品库：
 * 顾客换的是买哪瓶，配方里的营养目标和用量不变。
 */
function chooseSupplementAlternative(item: {
  name: string;
  alternatives?: Array<{
    name: string;
    brand?: string | null;
    productModel?: string | null;
    purchaseLink?: { url: string; platform?: string | null } | null;
  }> | null;
}) {
  const options = (item.alternatives || []).filter((option) => option.name);
  if (options.length === 0) return;
  uni.showActionSheet({
    itemList: options.map((option) =>
      [option.brand, option.name, option.productModel]
        .filter(Boolean)
        .join(' · '),
    ),
    success: (res) => {
      const selected = options[res.tapIndex];
      if (!selected?.purchaseLink?.url) {
        uni.showToast({ title: '这个产品暂未配置购买链接', icon: 'none' });
        return;
      }
      uni.setClipboardData({
        data: selected.purchaseLink.url,
        success: () => {
          uni.showModal({
            title: selected.name,
            content:
              '购买链接已复制。去京东/淘宝/天猫打开即可下单；补剂用量和营养目标仍按本页配方。',
            showCancel: false,
            confirmText: '知道了',
          });
        },
      });
    },
  });
}

/**
 * 制作设备推荐（2026-10-18 · 需求 2.4.2 ⑦）
 *
 * 从 `/global-config` 取，**不进交付快照** —— 设备清单是运营随时会调的全局配置，
 * 塞进快照等于锁死在某一次交付里。
 *
 * 拿不到就空数组 → 整块不画。
 */
const equipmentList = ref<
  Array<{
    id: string;
    name: string;
    reason?: string | null;
    imageUrl?: string | null;
    purchaseLink?: string | null;
  }>
>([]);

async function loadEquipment() {
  try {
    const res: any = await request({
      url: '/global-config',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    } as any);
    const list = res?.data?.equipmentRecommendations;
    equipmentList.value = Array.isArray(list) ? list : [];
  } catch {
    // 设备推荐是"锦上添花"的东西，取不到就不画，不能让交付页挂掉
    equipmentList.value = [];
  }
}

/** 有购买链接就跳转；没有就什么都不做（别弹"暂不支持"这种废话） */
function openEquipment(item: { name: string; purchaseLink?: string | null }) {
  if (!item.purchaseLink) return;
  uni.navigateTo({
    url: `/pages/webview/index?url=${encodeURIComponent(item.purchaseLink)}`,
    fail: () => {
      uni.showToast({ title: '链接暂时打不开', icon: 'none' });
    },
  });
}

const canBuySupplements = computed(() => {
  const list = content.value.supplements || [];
  if (list.length === 0) return false;
  return list.every(
    (item) =>
      Boolean(item.ingredientId) &&
      item.totalG !== null &&
      item.totalG !== undefined &&
      Number(item.totalG) > 0,
  );
});

/** 一键买齐：把补剂清单交给补剂下单页（行带用量，塞不进 URL，走本地存储） */
function handleBuySupplements() {
  const lines = (content.value.supplements || [])
    .filter(
      (item) =>
        Boolean(item.ingredientId) &&
        item.totalG !== null &&
        item.totalG !== undefined &&
        Number(item.totalG) > 0,
    )
    .map((item) => ({
      ingredientId: String(item.ingredientId),
      amount: Number(item.totalG),
      name: item.name,
      unit: 'g',
      specText: item.brand || '',
    }));

  if (lines.length === 0) {
    uni.showToast({ title: '暂无可购买的补剂', icon: 'none' });
    return;
  }

  /**
   * ⚠️ 只传**确认存在**的字段：
   * `recipeId` 在 `content.recipe` 里（`OrderDelivery` 顶层没有它）。
   * `dogId` / `cycleDays` 这个接口不返回 —— 不传，下单页会用自己的默认值，
   * 比塞个 undefined 装作有值更干净。
   */
  saveSupplementPurchaseDraft({
    lines,
    recipeId: content.value.recipe?.recipeId || undefined,
    recipeName: content.value.recipe?.name,
  });

  uni.navigateTo({ url: '/pages/supplement-order/index' });
}

function formatSupplementTotal(item: { totalG?: number | null }): string {
  const value = item?.totalG;
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num * 10) / 10} g`;
}

/**
 * 补剂下面那行小字。
 *
 * 有营养素目标就给「每 kg 食材 5g」（顾客想知道浓度），
 * 没有就给添加时机（"随餐"/"出锅前"）—— 总有一样能说。
 */
function supplementHint(item: {
  perKgG?: number | null;
  timing?: string | null;
  targets?: Array<{ label: string; targetValuePerKg: number | null }> | null;
}): string {
  const target = (item?.targets || [])[0];
  if (target && target.targetValuePerKg !== null && target.targetValuePerKg !== undefined) {
    return `${target.label} · 每 kg 食材 ${target.targetValuePerKg}g`;
  }
  if (item?.perKgG !== null && item?.perKgG !== undefined) {
    return `每 kg 食材 ${item.perKgG}g`;
  }
  return (item?.timing || '').trim();
}

// ==================== 长图导出（批次 2.7）====================

/** 逻辑宽度与 DIY 制作单一致（1200），导出的图放一起看着像一套 */
const CANVAS_LOGICAL_WIDTH = 1200;
const CANVAS_LOGICAL_HEIGHT = 1697;
const CANVAS_OUTPUT_SCALE = 2;
const CANVAS_OUTPUT_WIDTH = CANVAS_LOGICAL_WIDTH * CANVAS_OUTPUT_SCALE;
/** 画布底部给页脚留的高度 */
const CANVAS_FOOTER_SPACE = 60;

/**
 * 画布高度按内容自适应。
 *
 * canvas **不会自动分页** —— 内容超出就被裁掉，而裁掉的偏偏是最下面的
 * 「怎么存」和页脚。所以先画一遍量高度，再定画布尺寸重画一次。
 * （与 DIY 制作单同一套做法，见那页的注释。）
 */
const canvasLogicalHeight = ref(CANVAS_LOGICAL_HEIGHT);
const canvasOutputHeight = computed(
  () => canvasLogicalHeight.value * CANVAS_OUTPUT_SCALE,
);
const canvasStyle = computed(() => ({
  width: `${CANVAS_OUTPUT_WIDTH}px`,
  height: `${canvasOutputHeight.value}px`,
}));

const generating = ref(false);

/** 等画布按新的高度完成一次重排再画，否则会画在旧尺寸上 */
const waitForCanvasResize = () =>
  new Promise((resolve) => setTimeout(resolve, 30));

/** 交付日期 → 「2026-10-16」。纯格式化，不涉及业务判断 */
const deliveredAtText = computed(() => {
  const iso = resolved.value?.deliveredAt;
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

const saveAsImage = async () => {
  if (!resolved.value) return;
  generating.value = true;
  uni.showLoading({ title: '生成中...', mask: true });
  try {
    await waitForCanvasResize();

    canvasLogicalHeight.value = CANVAS_LOGICAL_HEIGHT;
    await waitForCanvasResize();

    const build = (height: number) =>
      new PrintCanvasBuilder({
        canvasId: 'deliveryPrintCanvas',
        width: CANVAS_LOGICAL_WIDTH,
        height,
        outputScale: CANVAS_OUTPUT_SCALE,
        autoHeight: true,
      });

    /**
     * 小程序码（2026-10-18 改为**服务端生成**）。
     *
     * 原先要人工从微信后台下载一张图放进 `static/` ——
     * 那要求人去做机器能做的事，而且图片不进仓库就没法上线。
     *
     * 现在后端用微信 `wxacode.getUnlimited` 生成并缓存到 COS，
     * 这里**下载到本地临时文件**再画（canvas 的 drawImage 只认本地路径）。
     *
     * 任何一步失败都返回 null → 长图**整块不画二维码**，其余内容照常。
     */
    const qrCodePath = await (async (): Promise<string | null> => {
      try {
        const res: any = await new Promise((resolve, reject) => {
          uni.request({
            url: `${getBaseUrl()}/custom-recipe-config/miniapp-code`,
            success: resolve,
            fail: reject,
          });
        });
        const url = String(res?.data?.data?.url || '').trim();
        if (!url) return null;

        const download: any = await new Promise((resolve, reject) => {
          uni.downloadFile({ url, success: resolve, fail: reject });
        });
        return download?.statusCode === 200 ? download.tempFilePath : null;
      } catch {
        // 拿不到就整块不画 —— 不能让二维码把整张长图搞失败
        return null;
      }
    })();

    const sheetInput = () => ({
      content: content.value,
      version: resolved.value?.version,
      deliveredAtText: deliveredAtText.value,
      dogName: (delivery.value as any)?.dogName ?? null,
      qrCodePath,
    });

    // 第一遍：用基准高度量内容
    let builder = build(canvasLogicalHeight.value);
    drawDeliverySheet(builder, sheetInput());
    /**
     * `PrintCanvasBuilder.getCurrentY()` 是画完之后的**内容底部**。
     * 用它决定画布要撑多高 —— canvas 不会自动分页，
     * 高度不够就会把最下面的「怎么存」和页脚**裁掉**。
     */
    const needed = Math.ceil(builder.getCurrentY() + CANVAS_FOOTER_SPACE);

    if (needed > CANVAS_LOGICAL_HEIGHT) {
      canvasLogicalHeight.value = needed;
      await waitForCanvasResize();
      builder = build(canvasLogicalHeight.value);
      drawDeliverySheet(builder, sheetInput());
    }

    builder.drawFooter(
      `赛文的食堂 | 采购与制作单 | ${deliveredAtText.value || ''}`,
    );

    const imagePath = await builder.toImage();
    uni.hideLoading();
    uni.previewImage({
      urls: [imagePath],
      success: () => {
        // 预览页里用户可以长按保存；这里再给一次明确的保存入口
      },
    });
  } catch (error) {
    console.error('[DeliveryShopping] 生成图片失败:', error);
    uni.hideLoading();
    uni.showToast({ title: '生成失败', icon: 'none' });
  } finally {
    generating.value = false;
  }
};

const load = async () => {
  loading.value = true;
  try {
    delivery.value = await fetchDelivery(
      orderId.value,
      undefined,
      recipeId.value,
    );
  } finally {
    loading.value = false;
  }
};

const goBack = () => uni.navigateBack();

/**
 * 回第 1 页。
 *
 * 用 `redirectTo` 而不是 `navigateTo`：这一页是从第 1 页跳过来的，
 * 再 navigateTo 会叠成三层（列表 → 食谱 → 采购 → 食谱），
 * 顾客连按返回要按好几次才回得到订单。
 *
 * 多份订单必须把 `recipeId` 带回去，否则会退回批次第一份。
 */
const goRecipe = () => {
  /**
   * 老单份订单不带 recipeId —— 保持原来的链接形状；
   * 多份批次才需要把"看的是哪一份"带回去。
   */
  const selectedRecipeId = resolved.value?.recipeId ?? recipeId.value;
  const routeRecipeId = resolved.value?.isBatch
    ? selectedRecipeId
    : undefined;
  uni.redirectTo({
    url: buildDeliveryDetailUrl(orderId.value, routeRecipeId),
  });
};

onLoad((options) => {
  uni.setNavigationBarTitle({ title: '采购与制作' });
  orderId.value = options?.orderId ? decodeURIComponent(options.orderId) : '';
  recipeId.value = options?.recipeId
    ? decodeURIComponent(options.recipeId)
    : '';
  load();
  // 设备推荐与交付内容无关（全局配置），单独拉、失败不影响主体
  void loadEquipment();
});

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style scoped>
.shopping-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #16261f;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 120rpx 40rpx;
}

.state-title {
  font-size: 32rpx;
  color: #f4ecd8;
}

.state-text {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
  text-align: center;
}

.state-btn,
.goto-recipe {
  margin-top: 16rpx;
  border-radius: 16rpx;
  background: rgba(201, 162, 39, 0.16);
  color: #c9a227;
  font-size: 28rpx;
}

.hero {
  padding: 8rpx 8rpx 24rpx;
}

.hero-title {
  display: block;
  font-size: 40rpx;
  font-weight: 600;
  color: #f4ecd8;
}

.hero-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(244, 236, 216, 0.55);
}

.hero-batch {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #d8bc85;
}

.section {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: rgba(244, 236, 216, 0.05);
}

.section-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #c9a227;
}

.section-note {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.6);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10rpx 0;
}

.info-row .label {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
}

.info-row .value {
  font-size: 28rpx;
  color: #f4ecd8;
}





.shopping-net {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.45);
}





.step-row {
  display: flex;
  gap: 16rpx;
  padding: 12rpx 0;
}

.step-index {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(201, 162, 39, 0.2);
  color: #c9a227;
  font-size: 24rpx;
  text-align: center;
  line-height: 40rpx;
}

.step-text {
  flex: 1;
  font-size: 27rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.85);
}

.save-image {
  margin: 8rpx 0 16rpx;
  border-radius: 16rpx;
  background: rgba(201, 162, 39, 0.16);
  color: #c9a227;
  font-size: 28rpx;
}

/*
  ⚠️ 画布要放到**屏幕外**，不能用 display:none ——
  小程序里被 display:none 的画布取不到绘图上下文，画出来是空白。
*/
.print-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  z-index: -1;
  pointer-events: none;
}

.footer-note {
  padding: 24rpx 8rpx 48rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.4);
}

/* ===== 2026-10-18 新增：补剂卡 ===== */
.supp-card-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.supp-card {
  background: #fff;
  border: 1px solid #ede0d0;
  border-radius: 22rpx;
  padding: 20rpx 24rpx;
}

.supp-card__top {
  display: flex;
  align-items: baseline;
}

.supp-card__name {
  flex: 1;
  font-size: 26rpx;
  font-weight: 700;
  color: #3f3222;
}

.supp-card__amount {
  font-size: 26rpx;
  font-weight: 800;
  color: #b45309;
}

.supp-card__sub {
  display: block;
  font-size: 21rpx;
  color: #8a7a66;
  margin-top: 6rpx;
  line-height: 1.5;
}

.supp-card__switch {
  display: inline-block;
  margin-top: 10rpx;
  font-size: 23rpx;
  font-weight: 600;
  color: #b08d4f;
  border-bottom: 1rpx solid rgba(176, 141, 79, 0.45);
}

/* ===== 一键买齐（2026-10-18）===== */
.buy-supplements-btn {
  margin-top: 20rpx;
  background: #fff;
  border: 2rpx solid #e5c9a3;
  border-radius: 999rpx;
  color: #b45309;
  font-size: 26rpx;
  font-weight: 700;
  padding: 16rpx 0;
  line-height: 1.4;
}

.buy-supplements-btn::after {
  border: none;
}

/* ===== 制作设备推荐（2026-10-18 · 需求 2.4.2 ⑦）===== */
.equipment-row-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.equipment-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx;
  background: #fff;
  border-radius: 16rpx;
}

.equipment-row__icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 12rpx;
  background: #f4ebe0;
  flex: 0 0 auto;
}

.equipment-row__icon--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.equipment-row__initial {
  font-size: 28rpx;
  color: #b45309;
  font-weight: 700;
}

.equipment-row__text {
  flex: 1;
  min-width: 0;
}

.equipment-row__name {
  display: block;
  font-size: 26rpx;
  color: #3f3222;
  font-weight: 700;
}

.equipment-row__reason {
  display: block;
  font-size: 21rpx;
  color: #9c8b76;
  margin-top: 4rpx;
  line-height: 1.45;
}

.equipment-row__action {
  font-size: 23rpx;
  color: #b45309;
  flex: 0 0 auto;
}

/* ===== 2026-10-23 顾客端统一视觉：温暖私厨 ===== */
.shopping-page {
  background: #f3eee3;
  padding: 24rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));
}

.hero {
  margin-bottom: 22rpx;
  padding: 34rpx 32rpx;
  background: linear-gradient(145deg, #294b3c 0%, #1b3328 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.45);
  border-radius: 28rpx;
  box-shadow: 0 18rpx 46rpx rgba(20, 41, 31, 0.2);
}

.hero-title {
  font-family: "Songti SC", "STSong", serif;
  font-size: 46rpx;
  letter-spacing: 2rpx;
  color: #f6efe0;
}

.hero-sub {
  margin-top: 12rpx;
  color: #cfdccf;
}

.hero-batch {
  color: #e7d3a5;
}

.section {
  background: #fffdf7;
  border: 1rpx solid #e8decd;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 34rpx rgba(30, 58, 47, 0.05);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 14rpx;
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

.section-note {
  color: #8a806c;
}

.info-row .label {
  color: #8a806c;
}

.info-row .value {
  color: #2f3a30;
  font-weight: 600;
}

.step-index {
  background: #f1e5cc;
  color: #8a6d2f;
  font-weight: 700;
}

.step-text {
  font-size: 26rpx;
  color: #2f3a30;
}

.save-image {
  margin-top: 12rpx;
  background: #fffdf7;
  border: 1rpx solid #d9cdb8;
  color: #1e3a2f;
  font-weight: 600;
}

.goto-recipe {
  margin-top: 12rpx;
  background: #1e3a2f;
  color: #f6efe0;
  border-radius: 999rpx;
  font-weight: 600;
}

.footer-note {
  color: #9a927f;
}

.state-title {
  color: #1e3a2f;
}

.state-text {
  color: #7d7564;
}

.state-btn {
  color: #1e3a2f;
  background: #d8bc85;
}

</style>
