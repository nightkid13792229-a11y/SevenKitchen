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
      <view class="upload-card" @tap="handlePickImage">
        <text class="upload-icon">📷</text>
        <text class="upload-title">
          {{ uploading ? '正在识别…' : '拍商品详情页 / 从相册选' }}
        </text>
        <text class="upload-sub">识别后自动填好下面的内容</text>
      </view>

      <view class="sample-card">
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
            <text class="sample-point">② 净含量 —— 1kg / 500g</text>
            <text class="sample-point">③ 单价 —— ¥14.99/袋</text>
          </view>
        </view>
      </view>

      <view class="divider"><text>或手动填写</text></view>

      <view v-if="draftMissing.length > 0" class="draft-notice">
        <text>已按截图填好，其中 {{ draftMissing.length }} 项没认出来（红色那几格），补完就能存</text>
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
            <text v-if="aiFilled.purchaseChannel" class="ai-tag">
              {{ isLowConfidence('purchaseChannel') ? 'AI 推测·可改' : 'AI 识别' }}
            </text>
          </view>
          <view class="chip-row">
            <view
              v-for="channel in channelChoices"
              :key="channel"
              class="chip"
              :class="{ active: form.purchaseChannel === channel }"
              @tap="selectChannel(channel)"
            >
              {{ channel }}
            </view>
          </view>
          <input
            v-model="form.purchaseChannel"
            class="field-input"
            :class="{ error: hasError('purchaseChannel') }"
            placeholder="或直接输入商超名称"
            placeholder-class="ph"
            maxlength="200"
          />
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

        <view v-if="canBeMultipack" class="switch-row" @tap="toggleMultipack">
          <view class="switch-text">
            <text class="switch-title">一{{ unitWord }}里装了好几件</text>
            <text class="switch-desc">整箱、组合装打开这个；单件不用管</text>
          </view>
          <switch :checked="multipack" color="#1e3a2f" @change="toggleMultipack" />
        </view>

        <view v-if="multipack" class="field">
          <view class="field-head">
            <text class="field-label">一{{ unitWord }}有几件</text>
            <text class="req">*</text>
          </view>
          <input
            v-model="packCountText"
            class="field-input"
            :class="{ error: hasError('packCount') }"
            type="number"
            placeholder="如 24"
            placeholder-class="ph"
          />
          <view v-if="draftMissing.includes('packCount')" class="error-text">
            截图里没看清一箱几件，请看一下包装补上（这里填错，库存会差几十倍）
          </view>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">{{ netContentLabel }}</text>
            <text class="req">*</text>
            <text v-if="aiFilled.netContentPerPack" class="ai-tag">AI 识别</text>
          </view>
          <input
            v-model="netContentText"
            class="field-input"
            :class="{ error: hasError('netContentPerPack') }"
            type="digit"
            placeholder="如 1000"
            placeholder-class="ph"
          />
          <view v-if="ratio > 0" class="ratio-hint">
            1 {{ form.purchaseUnit || '件' }} =
            {{ multipack ? `${packCountText} 件 × ${netContentText}` : netContentText }}
            = {{ ratio }} {{ baseUnitText }}
          </view>
          <view v-else-if="hasError('netContentPerPack')" class="error-text">
            截图里没看出多重，请看一下包装补上（这一格不填，账就算不准）
          </view>
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
  uploadProcurementSkuScreenshot,
} from './api/purchasing';
import {
  computePurchaseToBaseRatio,
  validateProcurementSkuForm,
} from './procurement-sku-form';
import { applyDraftToForm } from './procurement-sku-draft-apply';
import { decodeRouteParam } from './route-param';

const SAMPLE_IMAGE_URL =
  'https://img.sevenkitchen.cloud/app-assets/procurement-sku-sample.jpg';

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
const MULTIPACK_UNITS = ['箱', '桶', '提', '件'];

const ingredientId = ref('');
const ingredientName = ref('');
const baseUnit = ref('G');
const baseUnitText = computed(() => BASE_UNIT_TEXT[baseUnit.value] || '克');

const loading = ref(false);
const uploading = ref(false);
const submitting = ref(false);
const sampleFailed = ref(false);

const allUnits = ref<string[]>([]);
const channelChoices = ref<string[]>(['山姆', '沃尔玛', '盒马']);
const showAllUnits = ref(false);

const form = ref({
  name: '',
  purchaseChannel: '',
  purchaseUnit: '',
});

const packCountText = ref('1');
const netContentText = ref('');
const unitPriceText = ref('');

const multipack = ref(false);

const uploadedScreenshotUrl = ref('');
const aiFilled = ref<Record<string, boolean>>({});
const draftMissing = ref<string[]>([]);
const confidence = ref<Record<string, 'high' | 'low'>>({});
const submitted = ref(false);

/** 只给"包装单位"；服务端白名单里没有的不会出现 */
const clerkUnits = computed(() => {
  const fromPriority = CLERK_UNIT_PRIORITY.filter((unit) => allUnits.value.includes(unit));
  return fromPriority.length >= 3 ? fromPriority : allUnits.value;
});

const visibleUnits = computed(() =>
  showAllUnits.value ? clerkUnits.value : clerkUnits.value.slice(0, 5),
);

const hasMoreUnits = computed(() => clerkUnits.value.length > 5);

const unitWord = computed(() => form.value.purchaseUnit || '件');

const canBeMultipack = computed(() =>
  MULTIPACK_UNITS.includes(form.value.purchaseUnit),
);

const netContentLabel = computed(() =>
  multipack.value
    ? `每件多少${baseUnitText.value}`
    : `一${unitWord.value}多少${baseUnitText.value}`,
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
  packCount: multipack.value ? toNumberOrNull(packCountText.value) : 1,
  netContentPerPack: toNumberOrNull(netContentText.value),
  currentPurchasePrice: toNumberOrNull(unitPriceText.value),
}));

const ratio = computed(() =>
  computePurchaseToBaseRatio({
    packCount: snapshot.value.packCount,
    netContentPerPack: snapshot.value.netContentPerPack,
  }),
);

const errors = computed(() => {
  const result = validateProcurementSkuForm(snapshot.value, {
    purchaseUnits: allUnits.value,
    baseUnitText: baseUnitText.value,
  });
  return result.ok ? [] : result.errors;
});

const canSubmit = computed(() => errors.value.length === 0);

const hasError = (field: string) => {
  if (draftMissing.value.includes(field)) return true;
  if (!submitted.value) return false;
  return errors.value.some((error) => error.field === field);
};

const isLowConfidence = (field: string) => confidence.value[field] === 'low';

const selectChannel = (channel: string) => {
  form.value.purchaseChannel = channel;
};

const pickUnit = (unit: string) => {
  form.value.purchaseUnit = unit;
  if (!MULTIPACK_UNITS.includes(unit)) {
    multipack.value = false;
    packCountText.value = '1';
  }
};

const toggleMultipack = () => {
  multipack.value = !multipack.value;
  if (!multipack.value) {
    packCountText.value = '1';
  }
};

onLoad(async (options: Record<string, string>) => {
  ingredientId.value = String(options?.ingredientId || '');
  ingredientName.value = decodeRouteParam(options?.ingredientName) || '原料';
  baseUnit.value = String(options?.baseUnit || 'G');

  if (!ingredientId.value) {
    uni.showToast({ title: '缺少原料信息', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
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

const handlePickImage = async () => {
  if (uploading.value) return;

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

  uploading.value = true;
  try {
    const uploaded = await uploadProcurementSkuScreenshot(filePath);
    const res: any = await draftProcurementSku({
      imageUrl: uploaded.url,
      ingredientId: ingredientId.value,
    });

    if (res?.code !== 0) {
      throw new Error(res?.message || '识别失败');
    }

    const draft = res.data?.draft;
    if (!draft) {
      uni.showToast({ title: '没认出来，手动填一下', icon: 'none' });
      return;
    }

    applyDraft(draft, uploaded.url);
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '识别失败，请手动填写',
      icon: 'none',
    });
  } finally {
    uploading.value = false;
  }
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
  if (typeof result.patch.packCountText === 'string') {
    packCountText.value = result.patch.packCountText;
    // 箱规有值且大于 1 → 多件装，把开关打开，让员工看见自己在填什么
    if (result.patch.packCountText && Number(result.patch.packCountText) > 1) {
      multipack.value = true;
    }
    filled.packCount = result.patch.packCountText.length > 0;
  }
  if (typeof result.patch.netContentText === 'string') {
    netContentText.value = result.patch.netContentText;
    filled.netContentPerPack = true;
  }
  if (typeof result.patch.unitPriceText === 'string') {
    unitPriceText.value = result.patch.unitPriceText;
    filled.currentPurchasePrice = true;
  }

  aiFilled.value = filled;
  draftMissing.value = result.missing;
  confidence.value = result.confidence;
  uploadedScreenshotUrl.value = screenshotUrl;
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
      currentPurchasePrice: snapshot.value.currentPurchasePrice ?? undefined,
      sourceScreenshotUrl: uploadedScreenshotUrl.value || undefined,
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
      duplicate: result?.status === 'duplicate',
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
  background: #fdf3ee;
  border: 1px solid #e8cfc4;
  border-radius: 10px;
  padding: 9px 11px;
  margin-bottom: 10px;
  font-size: 11px;
  color: #b4553f;
  line-height: 1.6;
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

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #f8f5ec;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.switch-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.switch-title {
  font-size: 12.5px;
  color: #26261f;
}
.switch-desc {
  font-size: 10.5px;
  color: #9a9384;
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
