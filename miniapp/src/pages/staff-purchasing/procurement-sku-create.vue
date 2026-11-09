<template>
  <view class="sku-create-page">
    <view class="anchor-card">
      <text class="anchor-label">挂到原料</text>
      <text class="anchor-name">{{ ingredientName }}</text>
      <text class="anchor-unit">按{{ baseUnitText }}记账</text>
    </view>

    <view v-if="loading" class="tip-card">
      <text>加载中…</text>
    </view>

    <template v-else>
      <view
        class="upload-card"
        :class="{ 'has-shot': hasScreenshot }"
        @tap="handleScreenshotTap"
      >
        <template v-if="shotState === 'idle'">
          <text class="upload-icon">📷</text>
          <text class="upload-title">拍商品详情页 / 从相册选</text>
          <text class="upload-sub">识别后自动填好下面的内容</text>
        </template>
        <view v-else class="shot-row">
          <view class="shot-thumb-wrap">
            <image
              v-if="shotThumbUrl"
              class="shot-thumb"
              :src="shotThumbUrl"
              mode="aspectFill"
            />
            <view v-else class="shot-thumb shot-thumb-empty"><text>🖼</text></view>
            <view v-if="recognizing" class="shot-mask"><text>识别中</text></view>
          </view>
          <view class="shot-info">
            <view class="shot-status">
              <text
                class="shot-badge"
                :class="{ done: shotState === 'done', failed: shotState === 'failed', busy: recognizing }"
              >
                {{ shotView.badge }}
              </text>
            </view>
            <text class="shot-desc">{{ shotView.desc }}</text>
            <view class="shot-actions">
              <text
                v-if="shotState === 'done'"
                class="shot-link"
                @tap.stop="chooseAnother"
              >
                换一张
              </text>
              <text
                v-else-if="shotState === 'failed'"
                class="shot-link"
                @tap.stop="retryRecognize"
              >
                重试
              </text>
              <text class="shot-link" @tap.stop="previewScreenshot">看大图</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="shotState === 'idle' || shotState === 'failed'" class="sample-card">
        <text class="sample-title">这样截图，信息最全</text>
        <view class="sample-body">
          <!--
            示例图放 CDN 而不是打进包里：小程序所有图片音频合计只有 200KB 的硬预算，
            整个包已经用掉 ~199KB，一张截图就顶爆（构建校验会直接失败）。
            图挂了就退回下面的示意块，不至于让员工对着空白框发呆。
          -->
          <image
            v-if="!sampleFailed"
            class="sample-image"
            :src="SAMPLE_IMAGE_URL"
            mode="aspectFill"
            @error="sampleFailed = true"
            @tap="previewSample"
          />
          <view v-else class="sample-mock">
            <view class="mock-line mock-title"><text>沃集鲜 糙米 1kg</text></view>
            <view class="mock-line"><text>净含量：1kg</text></view>
            <view class="mock-line"><text>¥14.99 / 袋</text></view>
          </view>
          <view class="sample-points">
            <text class="sample-point">① 商品标题（带规格那种）</text>
            <text class="sample-point">② 包装规格 —— 30枚 1.59kg / 24×330ml</text>
            <text class="sample-point">③ 单价 —— ¥14.99/袋</text>
          </view>
        </view>
      </view>

      <view class="divider"><text>或手动填写</text></view>

      <view v-if="stillMissing.length > 0" class="draft-notice">
        <text class="draft-notice-text">
          已按截图填好，其中 {{ stillMissing.length }} 项没认出来（红色那几格），补完就能存
        </text>
        <text v-if="hasScreenshot" class="draft-link" @tap="previewScreenshot">查看截图</text>
      </view>

      <view class="form-card">
        <view class="field">
          <view class="field-head">
            <text class="field-label">商品名</text>
            <text class="req">*</text>
            <text v-if="aiFilled.name" class="ai-tag">AI 识别</text>
          </view>
          <input
            v-model="form.name"
            class="field-input"
            :class="{ error: hasError('name') }"
            placeholder="如：沃集鲜 糙米 1kg"
            placeholder-class="ph"
            maxlength="100"
          />
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">在哪买的</text>
            <text class="req">*</text>
            <text v-if="channelLocked" class="ai-tag">本单渠道</text>
            <text v-else-if="aiFilled.purchaseChannel" class="ai-tag">
              {{ isLowConfidence('purchaseChannel') ? 'AI 推测·可改' : 'AI 识别' }}
            </text>
          </view>
          <view class="chip-row">
            <view
              v-for="channel in visibleChannels"
              :key="channel"
              class="chip"
              :class="{
                active: form.purchaseChannel === channel,
                locked: channelLocked && form.purchaseChannel !== channel,
              }"
              @tap="selectChannel(channel)"
            >
              {{ channel }}
            </view>
            <view v-if="hasMoreChannels" class="chip more" @tap="showAllChannels = !showAllChannels">
              {{ showAllChannels ? '收起' : '更多' }}
            </view>
          </view>
          <text v-if="channelLocked" class="field-hint-inline">
            这笔订单在「{{ form.purchaseChannel }}」，商品只能建在这个渠道下；要换渠道请先回识别结果页改订单渠道。
          </text>
          <text v-if="allChannels.length === 0" class="field-hint-inline warn-text">
            渠道清单没加载出来，请返回重试；新增渠道请找管理员在后台维护。
          </text>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">我买的是</text>
            <text class="req">*</text>
            <text class="field-hint-inline">单价、净含量都按它算</text>
          </view>
          <view class="chip-row">
            <view
              v-for="unit in visibleUnits"
              :key="unit"
              class="chip"
              :class="{ active: form.purchaseUnit === unit }"
              @tap="pickUnit(unit)"
            >
              {{ unit }}
            </view>
            <view v-if="hasMoreUnits" class="chip more" @tap="showAllUnits = !showAllUnits">
              {{ showAllUnits ? '收起' : '更多' }}
            </view>
          </view>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">一{{ unitWord }}的规格</text>
            <text class="req">*</text>
            <text v-if="aiFilled.specChain" class="ai-tag">AI 识别</text>
          </view>

          <text v-if="specText" class="spec-origin">包装原文：{{ specText }}</text>

          <view class="chain">
            <view
              v-for="(link, index) in specLinks"
              :key="'spec-link-' + index"
              class="chain-row"
            >
              <input
                v-model="link.count"
                class="chain-count"
                :class="{ error: linkUnfilled(index) }"
                type="number"
                placeholder="数量"
                placeholder-class="ph"
                @input="markStructureEdited"
              />
              <input
                v-model="link.unit"
                class="chain-unit"
                :class="{ error: linkUnfilled(index) }"
                maxlength="2"
                placeholder="单位"
                placeholder-class="ph"
                @input="markStructureEdited"
              />
              <text class="chain-times">×</text>
            </view>

            <view class="chain-row">
              <input
                v-model="netContentText"
                class="chain-count"
                :class="{ error: hasError('netContentPerPack') }"
                type="digit"
                placeholder="如 500"
                placeholder-class="ph"
              />
              <text class="chain-unit-fixed">{{ amountUnit }}</text>
            </view>

            <view class="chain-tools">
              <text class="chain-add" @tap="addLink">+ 再加一层</text>
              <text
                v-if="specLinks.length > 0"
                class="chain-remove"
                @tap="removeLink(specLinks.length - 1)"
              >
                删掉最后一层
              </text>
              <text
                v-if="innerLayerMissing"
                class="chain-single"
                @tap="confirmSingle"
              >
                这件只有一件
              </text>
            </view>
          </view>

          <text
            v-if="specText && !specChainResolved"
            class="chain-warn"
          >
            这张图只读到「{{ specText }}」，规格没折算全，请照包装把上面的层数和重量补齐。
          </text>
          <text
            v-else-if="innerLayerMissing"
            :class="submitted ? 'error-text' : 'chain-warn'"
          >
            整{{ unitWord }}的商品，请先「再加一层」填一{{ unitWord }}几件（这里少填，库存会差好几倍）。
          </text>
          <text
            v-else-if="submitted && packCountInvalid"
            class="error-text"
          >
            每一层都要填数量和单位，填不全不能保存。
          </text>
          <text v-else-if="ratio > 0 && specLinks.length > 0" class="ratio-hint">
            一{{ unitWord }} = {{ chainText }} = {{ ratio }} {{ amountUnit }}
          </text>

          <text v-if="totalMismatch" class="error-text">
            包装上印的是整{{ unitWord }} {{ totalNetContentInBase }} {{ amountUnit }}，
            现在算出来 {{ ratio }} {{ amountUnit }}，对不上，请核对。
          </text>
          <text
            v-else-if="netContentDerived && ratio > 0"
            class="derived-hint"
          >
            包装上印的是整{{ unitWord }} {{ totalNetContentInBase }} {{ amountUnit }}，
            每{{ innerUnitWord }} {{ netContentText }} {{ amountUnit }} 是折算出来的，请核对
          </text>
          <text v-else-if="hasError('netContentPerPack')" class="error-text">
            截图里没看出多重，请看一下包装补上（这一格不填，账就算不准）
          </text>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">一{{ unitWord }}多少钱</text>
            <text class="optional">选填</text>
            <text v-if="aiFilled.currentPurchasePrice" class="ai-tag">AI 识别</text>
          </view>
          <input
            v-model="unitPriceText"
            class="field-input"
            type="digit"
            placeholder="如 14.99"
            placeholder-class="ph"
          />
        </view>
      </view>

      <view class="bottom-actions">
        <button class="action-btn cancel" @tap="goBack">取消</button>
        <button
          class="action-btn submit"
          :class="{ disabled: !canSubmit }"
          :loading="submitting"
          @tap="handleSubmit"
        >
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  createStaffProcurementSku,
  draftProcurementSku,
  getProcurementSkuFormOptions,
  getPurchaseChannels,
  uploadProcurementSkuScreenshot,
} from './api/purchasing';
import {
  pickStillMissingFields,
  validateProcurementSkuForm,
} from './procurement-sku-form';
import { applyDraftToForm } from './procurement-sku-draft-apply';
import { decodeRouteParam } from './route-param';
import {
  prefillChannel,
  withSelectedChannel,
} from '../../utils/purchase-channel';
import { buildShotView, type ShotState } from './procurement-sku-shot';
import { MULTIPACK_UNITS } from './procurement-sku-multipack';
import {
  computeSpecRatio,
  firstIncompleteLinkIndex,
  formatSpecChain,
  multiplySpecLinks,
  isTotalMismatch,
  needsInnerLayer,
  type SpecLinkInput,
} from './procurement-sku-spec-chain';
import {
  normalizeSkuCreateSource,
  type SkuCreateSource,
} from './procurement-sku-event';

const SAMPLE_IMAGE_URL =
  'https://img.sevenkitchen.cloud/app-assets/procurement-sku-sample-v2.jpg';

const BASE_UNIT_TEXT: Record<string, string> = {
  G: '克',
  ML: '毫升',
  PCS: '个',
};

/**
 * 员工实际"买回来的一整件"是这些包装单位。
 *
 * 白名单里还有 g / kg / 斤 / 两 / 吨 —— 那些是**计量单位**，不是包装：
 * 选了「斤」系统会要求"1 斤 = 多少克"，员工在心里算 500 反而容易错。
 * 所以这里只给包装单位，真正的白名单仍以服务端返回的为准（做交集）。
 */
const CLERK_UNIT_PRIORITY = ['袋', '箱', '包', '瓶', '盒', '桶', '提', '件', '份', '卷'];

const ingredientId = ref('');
const ingredientName = ref('');
const baseUnit = ref('G');
const baseUnitText = computed(() => BASE_UNIT_TEXT[baseUnit.value] || '克');

/**
 * 是哪个页面让我新建的（详情页 / 识别结果页 / 采购记录页）。
 * 新建成功后的广播是全应用的，压在栈里的页面也收得到，
 * 所以要把来源带回去，只有发起页处理（否则详情节会误弹「添加采购记录」抽屉）。
 */
let createSource: SkuCreateSource | '' = '';
/**
 * 从识别结果页某一行的「新建采购商品」进来时，记住是那一行（2026-11-07）：
 * 保存后退回识别结果页，要把新商品直接匹配到这一行，不能靠那边猜。
 */
let createForLineId = '';
/**
 * 从识别结果页进来时，这条识别记录本身（2026-11-07）：
 * 商品就是给这笔订单买的，渠道要锁死，并且服务端还会再校验一次。
 */
let createOrderImportId = '';

/** 渠道锁死：从识别结果页进来、且这笔订单的渠道有值 */
const channelLocked = ref(false);

const loading = ref(false);
const submitting = ref(false);
const sampleFailed = ref(false);

const allUnits = ref<string[]>([]);
/**
 * 渠道清单（2026-11-05）：唯一来源 = 后台字典 purchase_channel。
 * 以前这里是「历史出现过的写法 + 写死三家 + 自由输入」，
 * 结果同一个门店能存出好几种名字。现在只给字典里的项，不给自由输入。
 */
const allChannels = ref<string[]>([]);
const showAllChannels = ref(false);
const showAllUnits = ref(false);

const form = ref({
  name: '',
  purchaseChannel: '',
  purchaseUnit: '',
});

/**
 * 规格链的计数层（最后一层基准数量在 netContentText 里）：
 * 一盒鸡蛋 = [{count:'30', unit:'枚'}] × 53 克。
 */
const specLinks = ref<SpecLinkInput[]>([]);
const netContentText = ref('');
const unitPriceText = ref('');

/** 53 克是包装上印的（false），还是用整盒 1.59kg 除出来的（true） */
const netContentDerived = ref(false);
const totalNetContentInBase = ref<number | null>(null);
/** 最后一层用什么单位说话：按个记账时可能是包装上的「张/枚」 */
const amountUnitText = ref('');
/** 包装规格原文，如「30枚 1.59kg」；没改过就原样存进 productModel */
const specText = ref('');
/** 链是否折算成功；false = 只读到计数层，重量要人补 */
const specChainResolved = ref(true);
/** 员工动过"层数/单位"，包装原文就不再照抄（改了重量不算） */
const structureEdited = ref(false);
/** 整箱商品确认"只有一件"，不再逼他补一层 */
const singleConfirmed = ref(false);

/**
 * 截图上传区四种状态（2026-11-05 老板反馈：图传完了，页面还是"没传"的样子）：
 * idle 还没选图 / recognizing 已选图、正在上传识别 /
 * done 识别完成 / failed 上传或识别失败（图保留，可重试）
 */
const shotState = ref<ShotState>('idle');
const pickedImagePath = ref('');
const uploadedScreenshotUrl = ref('');
const shotError = ref('');

const aiFilled = ref<Record<string, boolean>>({});
const draftMissing = ref<string[]>([]);
const confidence = ref<Record<string, 'high' | 'low'>>({});
const submitted = ref(false);

const recognizing = computed(() => shotState.value === 'recognizing');

const hasScreenshot = computed(() =>
  Boolean(pickedImagePath.value || uploadedScreenshotUrl.value),
);

const shotThumbUrl = computed(
  () => pickedImagePath.value || uploadedScreenshotUrl.value,
);

const aiFilledCount = computed(
  () => Object.values(aiFilled.value).filter(Boolean).length,
);

const shotView = computed(() =>
  buildShotView({
    state: shotState.value,
    uploaded: Boolean(uploadedScreenshotUrl.value),
    filledCount: aiFilledCount.value,
    error: shotError.value,
  }),
);

/** 已经填了内容才提醒"换图会覆盖"，避免员工白填一次 */
const hasFormContent = computed(() =>
  Boolean(
    form.value.name.trim() ||
      form.value.purchaseChannel.trim() ||
      netContentText.value.trim() ||
      unitPriceText.value.trim() ||
      specLinks.value.length > 0,
  ),
);

/** 只给"包装单位"；服务端白名单里没有的不会出现 */
const clerkUnits = computed(() => {
  const fromPriority = CLERK_UNIT_PRIORITY.filter((unit) => allUnits.value.includes(unit));
  return fromPriority.length >= 3 ? fromPriority : allUnits.value;
});

const visibleChannels = computed(() =>
  showAllChannels.value
    ? allChannels.value
    : withSelectedChannel(allChannels.value, form.value.purchaseChannel),
);

const hasMoreChannels = computed(() => allChannels.value.length > 6);

const visibleUnits = computed(() =>
  showAllUnits.value ? clerkUnits.value : clerkUnits.value.slice(0, 5),
);

const hasMoreUnits = computed(() => clerkUnits.value.length > 5);

const unitWord = computed(() => form.value.purchaseUnit || '件');

const amountUnit = computed(
  () => amountUnitText.value.trim() || baseUnitText.value,
);

/** 计数层连乘；有一层没填好返回 null（表单标红、挡住保存） */
const packCount = computed(() => {
  if (specLinks.value.length === 0) return 1;
  return multiplySpecLinks(specLinks.value);
});

/** 紧挨着基准数量的那一层用什么量词：「枚」「瓶」「捆」 */
const innerUnitWord = computed(() => {
  const last = specLinks.value[specLinks.value.length - 1];
  return last?.unit?.trim() || '件';
});

/** 箱/桶/提/件一层都没填：必须拦住，不能按 1 件算 */
const innerLayerMissing = computed(() =>
  needsInnerLayer({
    purchaseUnit: form.value.purchaseUnit,
    linkCount: specLinks.value.length,
    confirmedSingle: singleConfirmed.value,
  }),
);

const chainText = computed(() =>
  formatSpecChain({
    links: specLinks.value,
    amountText: netContentText.value,
    baseUnitText: amountUnit.value,
  }),
);

const toNumberOrNull = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const snapshot = computed(() => ({
  name: form.value.name,
  purchaseChannel: form.value.purchaseChannel,
  purchaseUnit: form.value.purchaseUnit,
  packCount: packCount.value,
  netContentPerPack: toNumberOrNull(netContentText.value),
  currentPurchasePrice: toNumberOrNull(unitPriceText.value),
}));

const ratio = computed(() =>
  computeSpecRatio({
    links: specLinks.value,
    amountText: netContentText.value,
  }),
);

const errors = computed(() => {
  const result = validateProcurementSkuForm(snapshot.value, {
    purchaseUnits: allUnits.value,
    baseUnitText: baseUnitText.value,
  });
  const list: Array<{ field: string; message: string }> = result.ok
    ? []
    : [...result.errors];

  if (innerLayerMissing.value) {
    list.push({
      field: 'packCount',
      message: '整箱商品请先填一箱几件',
    });
  }

  return list;
});

const stillMissing = computed(() =>
  pickStillMissingFields(draftMissing.value, errors.value),
);

const canSubmit = computed(() => errors.value.length === 0);

/**
 * 红框只标"现在仍然不合格"的格子：
 * AI 没认出来、但用户已经补好的，不再标红（2026-11-05）。
 */
const hasError = (field: string) => {
  if (submitted.value) {
    return errors.value.some((error) => error.field === field);
  }
  return stillMissing.value.includes(field);
};

const isLowConfidence = (field: string) => confidence.value[field] === 'low';

const selectChannel = (channel: string) => {
  // 从识别结果页进来时渠道是这笔订单定死的，点不动（2026-11-07）
  if (channelLocked.value) return;
  form.value.purchaseChannel = channel;
};

const pickUnit = (unit: string) => {
  form.value.purchaseUnit = unit;
  // 换成袋/包/盒这类单件单位后，原来"整箱只有一件"的确认就不作数了
  if (!MULTIPACK_UNITS.includes(unit)) {
    singleConfirmed.value = false;
  }
};

const addLink = () => {
  // 新的一层加在最里面（紧挨着基准数量）：一箱 = 10 捆 × [?] × 500 克
  specLinks.value.push({ count: '', unit: '' });
  singleConfirmed.value = false;
  markStructureEdited();
};

const removeLink = (index: number) => {
  specLinks.value.splice(index, 1);
  markStructureEdited();
};

const confirmSingle = () => {
  singleConfirmed.value = true;
};

/** 员工动过规格：折算提示作废，原文规格也不再照抄进 productModel */
const markStructureEdited = () => {
  structureEdited.value = true;
};

/** 件数连乘不成立（某层没填）——保存时才提示，避免一进页面就红 */
const packCountInvalid = computed(() => packCount.value === null);

/**
 * 合计和包装上印的总重对不上：员工改了件数/重量，或 AI 两处读数矛盾。
 * 这一条不能随编辑消失 —— 编辑之后恰恰最需要它（评审 I4）。
 */
const totalMismatch = computed(() =>
  isTotalMismatch({
    ratio: ratio.value,
    printedTotalInBase: totalNetContentInBase.value,
  }),
);

const linkUnfilled = (index: number) => {
  if (!submitted.value) return false;
  const link = specLinks.value[index];
  return link ? firstIncompleteLinkIndex([link]) >= 0 : false;
};

onLoad(async (options: Record<string, string>) => {
  ingredientId.value = String(options?.ingredientId || '');
  ingredientName.value = decodeRouteParam(options?.ingredientName) || '原料';
  baseUnit.value = String(options?.baseUnit || 'G');
  createSource = normalizeSkuCreateSource(options?.from);
  createForLineId = String(options?.lineId || '');
  createOrderImportId = String(options?.importId || '');

  if (!ingredientId.value) {
    uni.showToast({ title: '缺少原料信息', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    try {
      const channelRes: any = await getPurchaseChannels();
      if (channelRes?.code === 0 && Array.isArray(channelRes.data)) {
        allChannels.value = channelRes.data;
      }
    } catch {
      uni.showToast({ title: '渠道清单加载失败，请重试', icon: 'none' });
    }

    // 从识别结果页过来时带着那笔订单的渠道：预选它，并锁死（2026-11-07）。
    // 商品是给这笔订单买的，换个渠道建出来的商品根本挂不回这一行。
    const requestedChannel = prefillChannel(
      decodeRouteParam(options?.channel),
      allChannels.value,
    );
    if (requestedChannel) {
      form.value.purchaseChannel = requestedChannel;
      channelLocked.value = createSource === 'order-import';
    }

    const res: any = await getProcurementSkuFormOptions(ingredientId.value);
    if (res?.code === 0 && res.data) {
      baseUnit.value = res.data.baseUnit || baseUnit.value;
      allUnits.value = res.data.purchaseUnits || [];
      form.value.purchaseUnit = clerkUnits.value.includes('袋')
        ? '袋'
        : clerkUnits.value[0] || '';
    }
  } catch {
    uni.showToast({ title: '加载可选项失败，请重试', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

const previewSample = () => {
  uni.previewImage({ urls: [SAMPLE_IMAGE_URL] });
};

const previewScreenshot = () => {
  const url = uploadedScreenshotUrl.value || pickedImagePath.value;
  if (!url) return;
  uni.previewImage({ urls: [url] });
};

const failShot = (message: string) => {
  shotError.value = message;
  shotState.value = 'failed';
  uni.showToast({ title: message, icon: 'none' });
};

const recognizeFromUrl = async (imageUrl: string) => {
  shotState.value = 'recognizing';
  shotError.value = '';

  try {
    const res: any = await draftProcurementSku({
      imageUrl,
      ingredientId: ingredientId.value,
    });

    if (res?.code !== 0) {
      throw new Error(res?.message || '识别失败');
    }

    const draft = res.data?.draft;
    if (!draft) {
      failShot('没认出来，可以重试或手动填');
      return;
    }

    applyDraft(draft, imageUrl);
  } catch (error: any) {
    failShot(error?.message || '识别失败，请手动填写');
  }
};

const recognizeFromPath = async (filePath: string) => {
  shotState.value = 'recognizing';
  shotError.value = '';

  let imageUrl = '';
  try {
    const uploaded = await uploadProcurementSkuScreenshot(filePath);
    imageUrl = uploaded.url;
    uploadedScreenshotUrl.value = imageUrl;
  } catch (error: any) {
    failShot(error?.message || '上传失败，请检查网络');
    return;
  }

  await recognizeFromUrl(imageUrl);
};

const handlePickImage = async () => {
  if (recognizing.value) return;

  const chosen: any = await new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: resolve,
      fail: () => resolve(null),
    });
  });

  const filePath = chosen?.tempFilePaths?.[0];
  if (!filePath) return;

  // 先点亮缩略图，再开始上传：员工点完马上能看到"图收到了"
  pickedImagePath.value = filePath;
  uploadedScreenshotUrl.value = '';
  shotError.value = '';
  aiFilled.value = {};
  draftMissing.value = [];
  confidence.value = {};

  await recognizeFromPath(filePath);
};

const chooseAnother = async () => {
  if (recognizing.value) return;

  if (hasScreenshot.value && hasFormContent.value) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '换一张图？',
        content: '已经按上一张图填好的内容会重新识别，可能被覆盖。',
        confirmText: '换一张',
        cancelText: '先不换',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  handlePickImage();
};

const retryRecognize = () => {
  if (recognizing.value) return;

  if (uploadedScreenshotUrl.value) {
    recognizeFromUrl(uploadedScreenshotUrl.value);
    return;
  }

  if (pickedImagePath.value) {
    recognizeFromPath(pickedImagePath.value);
  }
};

const handleScreenshotTap = () => {
  if (shotState.value === 'idle') {
    handlePickImage();
    return;
  }
  if (recognizing.value) return;
  previewScreenshot();
};

const applyDraft = (draft: any, screenshotUrl: string) => {
  const result = applyDraftToForm(draft, {
    purchaseUnits: allUnits.value,
  });

  const filled: Record<string, boolean> = {};

  if (result.patch.name) {
    form.value.name = result.patch.name;
    filled.name = true;
  }
  if (result.patch.purchaseChannel) {
    form.value.purchaseChannel = result.patch.purchaseChannel;
    filled.purchaseChannel = true;
  }
  if (result.patch.purchaseUnit) {
    pickUnit(result.patch.purchaseUnit);
    filled.purchaseUnit = true;
  }
  if (result.patch.specLinks) {
    specLinks.value = result.patch.specLinks.map((link) => ({ ...link }));
    // 读到件数、或至少读到重量，都算"规格有东西"，截图区据此显示识别成功
    filled.specChain =
      result.patch.specLinks.length > 0 ||
      Boolean(result.patch.netContentText);
  }
  if (typeof result.patch.netContentText === 'string') {
    netContentText.value = result.patch.netContentText;
    filled.netContentPerPack = result.patch.netContentText.length > 0;
  }
  netContentDerived.value = Boolean(result.patch.netContentDerived);
  totalNetContentInBase.value = result.patch.totalNetContentInBase ?? null;
  specChainResolved.value = result.patch.specChainResolved !== false;
  amountUnitText.value = result.patch.amountUnitText ?? '';
  specText.value = result.patch.specText ?? '';
  structureEdited.value = false;
  // AI 明确读到"一箱只有 1 件"时才替员工确认，否则整箱必须让他补一层
  singleConfirmed.value =
    typeof draft?.packCount === 'number' &&
    draft.packCount === 1 &&
    !(Array.isArray(draft?.missing) ? draft.missing : []).includes('packCount');

  if (typeof result.patch.unitPriceText === 'string') {
    unitPriceText.value = result.patch.unitPriceText;
    filled.currentPurchasePrice = true;
  }

  aiFilled.value = filled;
  draftMissing.value = result.missing;
  confidence.value = result.confidence;
  uploadedScreenshotUrl.value = screenshotUrl;
  shotError.value = '';
  shotState.value = 'done';
};

const goBack = () => {
  uni.navigateBack();
};

const handleSubmit = async () => {
  if (submitting.value) return;

  submitted.value = true;

  if (errors.value.length > 0) {
    uni.showToast({ title: '还有必填项没填', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    const res: any = await createStaffProcurementSku(ingredientId.value, {
      name: snapshot.value.name.trim(),
      purchaseChannel: snapshot.value.purchaseChannel.trim(),
      purchaseUnit: snapshot.value.purchaseUnit,
      packCount: Number(snapshot.value.packCount),
      netContentPerPack: Number(snapshot.value.netContentPerPack),
      // 没改过规格就把包装原文存进去：订单截图按「1.59kg(30枚)」也能认出同一样货
      // 包装原文只在"没动过层数、且和总重算得对"时照抄：
      // 员工改了件数或重量，原文就和账对不上了，宁可让服务端按数字拼规格
      productModel:
        specText.value && !structureEdited.value && !totalMismatch.value
          ? specText.value
          : undefined,
      currentPurchasePrice: snapshot.value.currentPurchasePrice ?? undefined,
      sourceScreenshotUrl: uploadedScreenshotUrl.value || undefined,
      // 服务端拿它校验渠道必须和这笔订单一致（2026-11-07）
      orderImportId: createOrderImportId || undefined,
    });

    if (res?.code !== 0) {
      throw new Error(res?.message || '保存失败');
    }

    const result = res.data;
    uni.showToast({
      title: result?.status === 'duplicate' ? '已有这个商品，已选中' : '已添加',
      icon: 'none',
    });

    uni.$emit('procurement-sku:created', {
      ingredientId: ingredientId.value,
      skuId: result?.sku?.id,
      // 识别结果页拿它把新商品直接挂到「刚点新建的那一行」上（2026-11-07）
      lineId: createForLineId || undefined,
      sku: result?.sku,
      duplicate: result?.status === 'duplicate',
      // 只回发起页：识别结果页新建商品时，详情页也在听这条广播
      from: createSource,
    });

    setTimeout(() => {
      uni.navigateBack();
    }, 600);
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败，请重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.sku-create-page {
  min-height: 100vh;
  background: #fbfcf7;
  /* 底部留够空间：保存条是 fixed 的，留少了会盖住最后一个输入框 */
  padding: 12px 12px 140px;
}

.anchor-card {
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: #fff;
  border: 1px solid #eee7d6;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.anchor-label {
  font-size: 12px;
  color: #6b6653;
  flex: none;
}
.anchor-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e3a2f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.anchor-unit {
  margin-left: auto;
  font-size: 11px;
  color: #9a9384;
  flex: none;
}

.draft-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fdf3ee;
  border: 1px solid #e8cfc4;
  border-radius: 10px;
  padding: 9px 11px;
  margin-bottom: 10px;
  font-size: 11px;
  color: #b4553f;
  line-height: 1.6;
}
.draft-notice-text {
  flex: 1;
}
.draft-link {
  flex: none;
  font-size: 11px;
  color: #8a3f2c;
  text-decoration: underline;
}

.upload-card {
  background: #fffdf6;
  border: 1px dashed #c9bd9a;
  border-radius: 14px;
  padding: 20px 12px;
  text-align: center;
  margin-bottom: 10px;
}
.upload-icon {
  font-size: 26px;
}
.upload-title {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1e3a2f;
}
.upload-sub {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #9a9384;
}
/* 传过图之后，上传区改成一张"图 + 状态"的卡片，取代原来的相机占位 */
.upload-card.has-shot {
  background: #fff;
  border-style: solid;
  border-color: #ddd6c1;
  padding: 10px;
  text-align: left;
}
.shot-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.shot-thumb-wrap {
  position: relative;
  width: 62px;
  height: 84px;
  flex: none;
}
.shot-thumb {
  width: 62px;
  height: 84px;
  border-radius: 8px;
  border: 1px solid #e6dfc9;
  background: #f4f1e7;
}
.shot-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
.shot-mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  border-radius: 8px;
  background: rgba(30, 58, 47, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
}
.shot-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.shot-status {
  display: flex;
}
.shot-badge {
  font-size: 10px;
  line-height: 1.6;
  border-radius: 4px;
  padding: 1px 6px;
}
.shot-badge.done {
  color: #4a6b46;
  background: #eef3e4;
}
.shot-badge.busy {
  color: #8a6b33;
  background: #f6f1e2;
}
.shot-badge.failed {
  color: #b4553f;
  background: #fdf3ee;
}
.shot-desc {
  font-size: 12px;
  color: #26261f;
  line-height: 1.5;
}
.shot-actions {
  display: flex;
  gap: 14px;
}
.shot-link {
  padding: 2px 0;
  font-size: 11.5px;
  color: #4a6b46;
}

.sample-card {
  background: #f6f1e2;
  border: 1px solid #e8dfc4;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
}
.sample-title {
  font-size: 12px;
  font-weight: 600;
  color: #8a6b33;
}
.sample-body {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.sample-image {
  width: 78px;
  height: 108px;
  border-radius: 8px;
  border: 1px solid #ddd3b6;
  flex: none;
  background: #fff;
}
.sample-mock {
  width: 78px;
  height: 108px;
  flex: none;
  border-radius: 8px;
  border: 1px solid #ddd3b6;
  background: #fff;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.mock-line {
  font-size: 9px;
  color: #5d5747;
  line-height: 1.3;
}
.mock-title {
  font-weight: 600;
  color: #1e3a2f;
}
.sample-points {
  display: flex;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
}
.sample-point {
  font-size: 11px;
  color: #5d5747;
  line-height: 1.4;
}

.divider {
  text-align: center;
  font-size: 11px;
  color: #a8a192;
  margin: 14px 0 12px;
}

.form-card {
  background: #fff;
  border: 1px solid #eee7d6;
  border-radius: 12px;
  padding: 12px;
}

.field {
  margin-bottom: 16px;
}
.field-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.field-label {
  font-size: 12px;
  color: #6b6653;
}
.field-hint-inline {
  font-size: 10px;
  color: #a8a192;
}
.field-hint-inline.warn-text {
  display: block;
  margin-top: 8px;
  color: #b4553f;
  line-height: 1.5;
}
.req {
  color: #b4553f;
  font-size: 12px;
}
.optional {
  font-size: 10px;
  color: #a8a192;
}
.ai-tag {
  font-size: 10px;
  color: #4a6b46;
  background: #eef3e4;
  border-radius: 4px;
  padding: 1px 5px;
}
.field-input {
  height: 40px;
  border: 1px solid #e6dfc9;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  background: #fff;
}
.field-input.error {
  border-color: #d8a292;
  background: #fdf6f3;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.chip {
  font-size: 12px;
  color: #5d5747;
  background: #f4f1e7;
  border-radius: 14px;
  padding: 5px 12px;
}
.chip.active {
  background: #1e3a2f;
  color: #f7f2e2;
}
.chip.more {
  background: #fff;
  border: 1px dashed #c9bd9a;
  color: #8a6b33;
}
/* 渠道锁死时，别的渠道是「看得见但点不了」，避免以为还能换 */
.chip.locked {
  opacity: 0.45;
}

.spec-origin {
  display: block;
  font-size: 11px;
  color: #6b6653;
  margin-bottom: 8px;
}

.chain {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #faf8f0;
  border: 1px solid #f0ebdc;
  border-radius: 10px;
  padding: 10px;
}
.chain-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chain-count {
  width: 92px;
  height: 36px;
  border: 1px solid #e6dfc9;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  background: #fff;
}
.chain-count.error {
  border-color: #d8a292;
  background: #fdf6f3;
}
.chain-unit {
  width: 60px;
  height: 36px;
  border: 1px solid #e6dfc9;
  border-radius: 8px;
  padding: 0 8px;
  font-size: 13px;
  background: #fff;
  text-align: center;
}
.chain-unit.error {
  border-color: #d8a292;
  background: #fdf6f3;
}
.chain-times {
  font-size: 13px;
  color: #9a9384;
}
.chain-unit-fixed {
  font-size: 13px;
  color: #5d5747;
}
.chain-remove {
  margin-left: auto;
  font-size: 12px;
  color: #b4553f;
}
.chain-tools {
  display: flex;
  align-items: center;
  gap: 16px;
}
.chain-add {
  font-size: 12px;
  color: #1e3a2f;
  text-decoration: underline;
}
.chain-single {
  font-size: 12px;
  color: #8a6b33;
  text-decoration: underline;
}

.chain-warn {
  margin-top: 6px;
  font-size: 11px;
  color: #8a6b33;
  line-height: 1.5;
}

.derived-hint {
  margin-top: 6px;
  font-size: 11px;
  color: #8a6b33;
  background: #fdf3e4;
  border-radius: 8px;
  padding: 7px 9px;
  line-height: 1.6;
}

.ratio-hint {
  margin-top: 6px;
  font-size: 11px;
  color: #4a6b46;
  background: #eef3e4;
  border-radius: 8px;
  padding: 7px 9px;
  line-height: 1.6;
}
.error-text {
  margin-top: 6px;
  font-size: 11px;
  color: #b4553f;
  line-height: 1.5;
}

.bottom-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #f0ece0;
}
.action-btn {
  flex: 1;
  height: 42px;
  line-height: 42px;
  border-radius: 9px;
  font-size: 14px;
}
.action-btn.cancel {
  background: #f4f1e7;
  color: #6b6653;
}
.action-btn.submit {
  background: #1e3a2f;
  color: #f7f2e2;
}
.action-btn.submit.disabled {
  opacity: 0.55;
}
.ph {
  color: #b3ab99;
}
.tip-card {
  background: #fff;
  border: 1px solid #eee7d6;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: #8a8375;
}
</style>
