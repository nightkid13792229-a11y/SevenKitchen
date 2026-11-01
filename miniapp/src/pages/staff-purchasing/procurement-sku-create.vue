<template>
  <view class="sku-create-page">
    <view class="anchor-card">
      <text class="anchor-label">挂到原料</text>
      <text class="anchor-name">{{ ingredientName }}</text>
      <text class="anchor-unit">基准单位 {{ baseUnitText }}</text>
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
            这里故意不用真截图：小程序的媒体资源总量有 200KB 的硬预算，
            一张商品详情页截图就要 100~400KB，直接顶爆（会挂掉构建校验）。
            所以用等高宽比的示意块表达"图上要有哪三样"。
          -->
          <view class="sample-mock">
            <view class="mock-line mock-title">
              <text class="mock-badge">①</text>
              <text>沃集鲜 糙米 1kg</text>
            </view>
            <view class="mock-line">
              <text class="mock-badge">②</text>
              <text>净含量：1kg</text>
            </view>
            <view class="mock-line">
              <text class="mock-badge">③</text>
              <text>¥14.99 / 袋</text>
            </view>
          </view>
          <view class="sample-points">
            <text class="sample-point">① 商品标题（带规格那种）</text>
            <text class="sample-point">② 净含量 —— 1kg / 500g</text>
            <text class="sample-point">③ 单价 —— ¥14.99/袋</text>
          </view>
        </view>
      </view>

      <view class="divider"><text>或手动填写</text></view>

      <view class="form-card">
        <view class="field">
          <view class="field-head">
            <text class="field-label">商品名<text class="req">*</text></text>
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
            <text class="field-label">采购渠道<text class="req">*</text></text>
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
            <text class="field-label">采购单位<text class="req">*</text></text>
          </view>
          <view class="chip-row">
            <view
              v-for="unit in purchaseUnits"
              :key="unit"
              class="chip"
              :class="{ active: form.purchaseUnit === unit }"
              @tap="form.purchaseUnit = unit"
            >
              {{ unit }}
            </view>
          </view>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">一{{ form.purchaseUnit || '件' }}有几件</text>
            <text class="req">*</text>
          </view>
          <input
            v-model="packCountText"
            class="field-input"
            :class="{ error: hasError('packCount') }"
            type="number"
            placeholder="单件填 1；整箱填箱规，如 24"
            placeholder-class="ph"
          />
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">每件多少{{ baseUnitText }}<text class="req">*</text></text>
            <text v-if="aiFilled.netContentPerPack" class="ai-tag">AI 识别</text>
          </view>
          <input
            v-model="netContentText"
            class="field-input"
            :class="{ error: hasError('netContentPerPack') }"
            type="digit"
            :placeholder="`如：1000${baseUnitText}`"
            placeholder-class="ph"
          />
          <view v-if="ratio > 0" class="ratio-hint">
            1 {{ form.purchaseUnit || '件' }} = {{ snapshot.packCount }} ×
            {{ snapshot.netContentPerPack }} = {{ ratio }} {{ baseUnitText }}，
            买 2 {{ form.purchaseUnit || '件' }} → 库存 +{{ ratio * 2 }} {{ baseUnitText }}
          </view>
          <view v-else-if="hasError('netContentPerPack')" class="error-text">
            截图里没看出多重，请看一下包装补上（这一格不填，账就算不准）
          </view>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">单价（元）</text>
            <text v-if="aiFilled.currentPurchasePrice" class="ai-tag">AI 识别</text>
          </view>
          <input
            v-model="unitPriceText"
            class="field-input"
            type="digit"
            :placeholder="`每个${form.purchaseUnit || '件'}多少钱`"
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

const BASE_UNIT_TEXT: Record<string, string> = {
  G: '克',
  ML: '毫升',
  PCS: '个',
};

const ingredientId = ref('');
const ingredientName = ref('');
const baseUnit = ref('G');
const baseUnitText = computed(() => BASE_UNIT_TEXT[baseUnit.value] || '克');

const loading = ref(false);
const uploading = ref(false);
const submitting = ref(false);

const purchaseUnits = ref<string[]>([]);
const channelChoices = ref<string[]>(['山姆', '沃尔玛', '盒马']);

const form = ref({
  name: '',
  purchaseChannel: '',
  purchaseUnit: '',
  packCount: 1 as number | null,
  netContentPerPack: null as number | null,
  currentPurchasePrice: null as number | null,
});

const packCountText = ref('1');
const netContentText = ref('');
const unitPriceText = ref('');

const uploadedScreenshotUrl = ref('');
const aiFilled = ref<Record<string, boolean>>({});
const confidence = ref<Record<string, 'high' | 'low'>>({});
const submitted = ref(false);

const toNumberOrNull = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 表单快照：文本框是字符串，校验和提交都要先归一成数字。
 * 放在 computed 里而不是「提交时再算」，是为了让合计提示和"能不能存"实时一致。
 */
const snapshot = computed(() => ({
  name: form.value.name,
  purchaseChannel: form.value.purchaseChannel,
  purchaseUnit: form.value.purchaseUnit,
  packCount: toNumberOrNull(packCountText.value),
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
    purchaseUnits: purchaseUnits.value,
    baseUnitText: baseUnitText.value,
  });
  return result.ok ? [] : result.errors;
});

const canSubmit = computed(() => errors.value.length === 0);

const hasError = (field: string) => {
  if (!submitted.value) return false;
  return errors.value.some((error) => error.field === field);
};

const isLowConfidence = (field: string) => confidence.value[field] === 'low';

const selectChannel = (channel: string) => {
  form.value.purchaseChannel = channel;
};

onLoad(async (options: Record<string, string>) => {
  ingredientId.value = String(options?.ingredientId || '');
  ingredientName.value = String(options?.ingredientName || '原料');
  baseUnit.value = String(options?.baseUnit || 'G');
  form.value.purchaseUnit = '';

  if (!ingredientId.value) {
    uni.showToast({ title: '缺少原料信息', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    const res: any = await getProcurementSkuFormOptions(ingredientId.value);
    if (res?.code === 0 && res.data) {
      baseUnit.value = res.data.baseUnit || baseUnit.value;
      purchaseUnits.value = res.data.purchaseUnits || [];
      if (purchaseUnits.value.length > 0) {
        form.value.purchaseUnit = purchaseUnits.value.includes('袋')
          ? '袋'
          : purchaseUnits.value[0];
      }
    }
  } catch {
    uni.showToast({ title: '加载可选项失败，请重试', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

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
  const filled: Record<string, boolean> = {};

  if (draft.name) {
    form.value.name = draft.name;
    filled.name = true;
  }
  if (draft.purchaseChannel) {
    form.value.purchaseChannel = draft.purchaseChannel;
    filled.purchaseChannel = true;
  }
  if (draft.purchaseUnit && purchaseUnits.value.includes(draft.purchaseUnit)) {
    form.value.purchaseUnit = draft.purchaseUnit;
  }
  if (typeof draft.packCount === 'number') {
    packCountText.value = String(draft.packCount);
    filled.packCount = true;
  }
  if (typeof draft.netContentPerPack === 'number') {
    netContentText.value = String(draft.netContentPerPack);
    filled.netContentPerPack = true;
  }
  if (typeof draft.unitPrice === 'number') {
    unitPriceText.value = String(draft.unitPrice);
    filled.currentPurchasePrice = true;
  }

  aiFilled.value = filled;
  confidence.value = draft.confidence || {};
  uploadedScreenshotUrl.value = screenshotUrl;
};

const goBack = () => {
  uni.navigateBack();
};

const handleSubmit = async () => {
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
  padding: 12px 12px 96px;
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
}
.anchor-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e3a2f;
}
.anchor-unit {
  margin-left: auto;
  font-size: 11px;
  color: #9a9384;
}

.upload-card {
  background: #fffdf6;
  border: 1px dashed #c9bd9a;
  border-radius: 14px;
  padding: 22px 12px;
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
.sample-mock {
  width: 132px;
  flex: none;
  border-radius: 8px;
  border: 1px solid #ddd3b6;
  background: #fff;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.mock-line {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: #5d5747;
}
.mock-title {
  font-weight: 600;
  color: #1e3a2f;
}
.mock-badge {
  font-size: 9px;
  color: #8a6b33;
}
.sample-points {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sample-point {
  font-size: 11px;
  color: #5d5747;
}

.divider {
  text-align: center;
  font-size: 11px;
  color: #a8a192;
  margin: 14px 0 12px;
  position: relative;
}

.form-card {
  background: #fff;
  border: 1px solid #eee7d6;
  border-radius: 12px;
  padding: 12px;
}

.field {
  margin-bottom: 14px;
}
.field-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.field-label {
  font-size: 12px;
  color: #6b6653;
}
.req {
  color: #b4553f;
  margin-left: 2px;
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
</style>
