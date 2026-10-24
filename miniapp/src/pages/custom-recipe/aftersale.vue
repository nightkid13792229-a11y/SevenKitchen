<template>
  <view class="adjust-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <template v-else>
      <!-- 退款入口暂未做独立页：先给一个明确的占位，不把顾客带到调整表单 -->
      <view v-if="isRefundScene" class="refund-wrap">
        <view class="refund-card">
          <text class="refund-title">退款申请</text>
          <text class="refund-text">
            退款申请页正在制作中。需要退款，请直接找 Seven爸爸，我们会尽快处理。
          </text>
        </view>
        <CustomerServiceInlineButton
          source-type="ORDER"
          :order-id="orderId"
          :order-no="orderId"
          :title="`定制订单 ${orderId}`"
          path="/pages/custom-recipe/aftersale"
          label="找 Seven爸爸"
        />
      </view>

      <template v-else>
        <!-- 额度：两个数字必须在最上面 -->
        <view class="quota-card">
          <view class="quota-cell">
            <text class="quota-label">售后窗口期还剩</text>
            <view class="quota-value-row">
              <text class="quota-value">{{ quota?.windowDaysLeft ?? '—' }}</text>
              <text class="quota-unit">天</text>
            </view>
          </view>
          <view class="quota-divider" />
          <view class="quota-cell">
            <text class="quota-label">调整次数还剩</text>
            <view class="quota-value-row">
              <text class="quota-value">{{ quota?.freeRevisionsLeft ?? '—' }}</text>
              <text class="quota-unit">次</text>
            </view>
          </view>
        </view>

        <view v-if="quota && !quota.canSubmit && quota.reason" class="quota-reason">
          <text class="quota-reason-text">{{ quota.reason }}</text>
        </view>

        <!-- 历史：只看提交时间、内容、状态；不展开时间轴 -->
        <view class="history-section">
          <view class="section-head">
            <text class="section-title">食谱调整记录</text>
          </view>

          <view v-if="!list.length" class="empty-record">
            <text class="empty-record-text">还没有提交过调整需求</text>
          </view>

          <view v-for="item in list" :key="item.id" class="record-card">
            <view class="record-top">
              <text class="record-time">提交时间 {{ formatTime(item.createdAt) }}</text>
              <text class="status-pill" :class="statusClass(item)">
                {{ statusText(item) }}
              </text>
            </view>

            <text v-if="scopeText(item)" class="record-scope">{{ scopeText(item) }}</text>

            <text
              class="record-content"
              :class="{ 'record-content--open': isExpanded(item.id) }"
            >{{ historyContent(item) }}</text>
            <text
              v-if="isLongRecord(item)"
              class="record-toggle"
              @tap="toggleExpanded(item.id)"
            >{{ isExpanded(item.id) ? '收起' : '展开' }}</text>

            <view v-if="item.status === 'RESOLVED' && item.handleNote" class="record-result">
              <text class="record-result-label">调整总结</text>
              <text class="record-result-text">{{ item.handleNote }}</text>
            </view>
            <view v-if="item.status === 'REJECTED' && item.rejectReason" class="record-result">
              <text class="record-result-label">说明</text>
              <text class="record-result-text">{{ item.rejectReason }}</text>
            </view>

            <view
              v-if="item.status === 'RESOLVED'"
              class="record-latest"
              @tap="openLatestRecipe(item)"
            >
              <text class="record-latest-text">最新的食谱可以在你的定制订单中查看</text>
              <text class="record-latest-link">查看最新食谱 ›</text>
            </view>
          </view>
        </view>

        <!-- 一个大容器：调整哪个食谱？→ Tab → 摘要 → 当前这份的表单 -->
        <view v-if="items.length" class="adjust-container">
          <view class="container-head">
            <text class="container-title">
              {{ items.length > 1 ? '调整哪个食谱？' : '本次要调整的食谱' }}
            </text>
            <text class="container-sub">
              {{ items.length > 1 ? '写哪几份，就提交哪几份' : activeItem?.name }}
            </text>
          </view>

          <scroll-view
            v-if="items.length > 1"
            class="recipe-tabs"
            scroll-x
            :show-scrollbar="false"
          >
            <view
              v-for="item in items"
              :key="item.key"
              class="recipe-tab"
              :class="{ 'recipe-tab--active': item.key === activeKey }"
              @tap="selectRecipe(item.key)"
            >
              <text class="recipe-tab-name">{{ item.name }}</text>
              <view v-if="isDraftFilled(item.key)" class="tab-dot" />
            </view>
          </scroll-view>

          <view v-if="activeItem" class="container-section">
            <text class="container-section-title">食谱摘要</text>
            <text class="summary-name">{{ activeItem.name }}</text>

            <template v-if="activeItem.content">
              <view v-if="foodRowsOf(activeItem.content).length" class="food-list">
                <view
                  v-for="row in foodRowsOf(activeItem.content)"
                  :key="row.name"
                  class="food-row"
                >
                  <text class="food-name">{{ row.name }}</text>
                  <text class="food-ratio">{{ formatRatio(row.ratioPercent) }}</text>
                </view>
              </view>

              <view
                v-if="supplementRowsOf(activeItem.content).length"
                class="supplement-line"
              >
                <text class="supplement-label">须额外添加：</text>
                <text
                  v-for="(row, index) in supplementRowsOf(activeItem.content)"
                  :key="row.label + row.unit"
                  class="supplement-item"
                >{{ row.label }} 每公斤食材添加 {{ row.value }}{{ row.unit }}<text v-if="index < supplementRowsOf(activeItem.content).length - 1">，</text></text>
              </view>

              <text class="macro-caption">干物质（DM）占比</text>
              <view class="macro-grid">
                <view
                  v-for="row in dmRowsOf(activeItem.content)"
                  :key="row.label"
                  class="macro-cell"
                >
                  <text class="macro-label">{{ row.label }}</text>
                  <text class="macro-value">{{ row.value }}</text>
                </view>
              </view>
            </template>
            <text v-else class="summary-empty">暂时读不到这份食谱的摘要</text>
          </view>

          <view v-if="canSubmitNew && activeDraft" class="container-section">
            <text class="container-section-title">想怎么调整</text>
            <textarea
              v-model="activeDraft.description"
              class="adjust-input"
              placeholder="比如：鸡肉想换成鸭肉、某样食材减少一点、份量想调整……"
              :maxlength="1000"
              auto-height
            />

            <view class="attachment-area">
              <view
                v-for="att in activeDraft.attachments"
                :key="att.id || att.url"
                class="attachment-item"
              >
                <image
                  v-if="isImageAttachment(att)"
                  class="attachment-thumb"
                  :src="att.url"
                  mode="aspectFill"
                  @tap="previewAttachment(att)"
                />
                <view v-else class="attachment-doc" @tap="previewAttachment(att)">
                  <text class="attachment-doc-badge">{{ docBadge(att) }}</text>
                  <text class="attachment-doc-name">{{ att.fileName || '文档' }}</text>
                </view>
                <text class="attachment-remove" @tap.stop="removeAttachment(att)">×</text>
              </view>

              <view
                v-if="activeDraft.attachments.length < MAX_ATTACH"
                class="add-attachment"
                @tap="pickAttachment"
              >
                <text class="add-attachment-icon">＋</text>
                <text class="add-attachment-text">添加附件</text>
              </view>
            </view>

            <text
              v-if="activeDraft.attachments.length && !activeDraft.description.trim()"
              class="attachment-hint"
            >写一句这份想怎么调，附件才会随这份提交</text>
          </view>

          <view v-else class="container-section">
            <view class="locked-note">
              <text class="locked-note-text">{{ lockedText }}</text>
            </view>
          </view>
        </view>

        <view v-else class="empty-recipe">
          <text class="empty-recipe-text">暂时读不到这次的食谱摘要，请稍后重试或联系 Seven爸爸</text>
        </view>
      </template>
    </template>

    <view v-if="!isRefundScene" class="bottom-bar">
      <view class="service-slot">
        <CustomerServiceInlineButton
          source-type="ORDER"
          :order-id="orderId"
          :order-no="orderId"
          :title="`定制订单 ${orderId}`"
          path="/pages/custom-recipe/aftersale"
          compact
          label="Seven爸爸"
        />
      </view>
      <button
        v-if="canSubmitNew"
        class="submit-btn"
        :disabled="!canSubmit || submitting"
        :loading="submitting"
        @tap="handleSubmit"
      >{{ submitLabel }}</button>
      <button
        v-else-if="canWithdraw"
        class="withdraw-btn"
        :loading="cancelling"
        @tap="handleCancel"
      >撤销本次提交</button>
      <button v-else-if="openItem" class="processing-btn" disabled>处理中</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import CustomerServiceInlineButton from '@/components/CustomerServiceInlineButton.vue';
import {
  cancelAftersale,
  deleteAftersaleAttachment,
  fetchAftersales,
  fetchDelivery,
  fetchOrderDetail,
  submitAftersale,
  uploadAftersaleAttachment,
  type AftersaleItem,
  type AftersaleQuota,
  type AftersaleRecipeRequest,
  type CustomRecipeOrderDetail,
  type DeliveryBatchContent,
  type DeliveryContent,
  type OrderDelivery,
} from '@/api/custom-recipe';
import { toDryMatterMacros } from '@/utils/nutrition-dm';
import { requestCustomRecipeOrderSubscription } from '@/utils/custom-recipe-payment';

interface Attachment {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface AdjustDraft {
  description: string;
  attachments: Attachment[];
}

interface AdjustItem {
  key: string;
  /** 批次交付明细 id；单份老交付为空 */
  deliveryItemId: string;
  recipeId: string;
  name: string;
  content: DeliveryContent | null;
}

const MAX_ATTACH = 9;

const orderId = ref('');
const recipeId = ref('');
const isRefundScene = ref(false);
const loading = ref(true);
const submitting = ref(false);
const cancelling = ref(false);
const uploading = ref(false);

const quota = ref<AftersaleQuota | null>(null);
const list = ref<AftersaleItem[]>([]);
const items = ref<AdjustItem[]>([]);
const drafts = reactive<Record<string, AdjustDraft>>({});
const activeKey = ref('');
const expandedIds = ref<string[]>([]);

const activeItem = computed(
  () => items.value.find((item) => item.key === activeKey.value) || null,
);
const activeDraft = computed(() =>
  activeKey.value ? drafts[activeKey.value] || null : null,
);

const filledCount = computed(
  () =>
    items.value.filter(
      (item) => (drafts[item.key]?.description || '').trim().length > 0,
    ).length,
);

/** 只传了附件没写说明的草稿：不把它当一份提交，提示补文字或删附件 */
const hasAttachmentOnlyDraft = computed(() =>
  items.value.some((item) => {
    const draft = drafts[item.key];
    return Boolean(draft && draft.attachments.length && !draft.description.trim());
  }),
);

const canSubmit = computed(
  () => filledCount.value > 0 && !hasAttachmentOnlyDraft.value,
);
const canSubmitNew = computed(
  () => Boolean(quota.value?.canSubmit) && items.value.length > 0,
);
const openItem = computed(
  () =>
    list.value.find((item) =>
      ['PENDING', 'ACCEPTED', 'PROCESSING'].includes(item.status),
    ) || null,
);
const canWithdraw = computed(() => Boolean(openItem.value?.canCancel));

const lockedText = computed(() => {
  if (quota.value?.reason) return quota.value.reason;
  if (openItem.value) {
    return '当前有一条调整正在处理，处理完之前不能再提交下一条。';
  }
  return '当前暂时不能提交调整需求，如需帮助请联系 Seven爸爸。';
});

const submitLabel = computed(() =>
  filledCount.value > 0
    ? `提交调整（${filledCount.value} 份）`
    : '提交调整',
);

function isDraftFilled(key: string): boolean {
  return Boolean((drafts[key]?.description || '').trim());
}

function selectRecipe(key: string) {
  activeKey.value = key;
}

function isBatchDelivery(value: unknown): value is DeliveryBatchContent {
  return Boolean(value && typeof value === 'object' && 'batchId' in value);
}

function isSingleDelivery(value: unknown): value is OrderDelivery {
  return Boolean(value && typeof value === 'object' && 'content' in value);
}

/**
 * 建立“这份食谱”的列表。
 *
 * 优先用订单详情的批次明细（id 才是售后要传的）；
 * 交付内容只用来补摘要；两者都可能失败，失败时仍显示名字、允许提交。
 */
function buildItems(
  detail: CustomRecipeOrderDetail | null,
  delivery: OrderDelivery | DeliveryBatchContent | null,
) {
  const next: AdjustItem[] = [];
  const contentById = new Map<string, DeliveryContent>();

  if (isBatchDelivery(delivery)) {
    for (const item of delivery.items || []) {
      contentById.set(item.id, item.content);
    }
  }

  const batch = detail?.deliveryBatch;
  if (batch?.items?.length) {
    for (const item of batch.items) {
      next.push({
        key: item.deliveryItemId,
        deliveryItemId: item.deliveryItemId,
        recipeId: item.recipeId || '',
        name: item.recipeName || '未命名食谱',
        content: contentById.get(item.deliveryItemId) || null,
      });
    }
  } else if (isBatchDelivery(delivery) && delivery.items?.length) {
    for (const item of delivery.items) {
      next.push({
        key: item.id,
        deliveryItemId: item.id,
        recipeId: item.recipeId || '',
        name: item.recipeName || '未命名食谱',
        content: item.content || null,
      });
    }
  } else {
    const content = isSingleDelivery(delivery) ? delivery.content : null;
    const name =
      content?.recipe?.name ||
      detail?.recipeName ||
      '这份食谱';
    next.push({
      key: 'single',
      deliveryItemId: '',
      recipeId:
        content?.recipe?.recipeId || detail?.recipeId || recipeId.value || '',
      name,
      content,
    });
  }

  items.value = next;

  for (const item of next) {
    if (!drafts[item.key]) {
      drafts[item.key] = { description: '', attachments: [] };
    }
  }
  for (const key of Object.keys(drafts)) {
    if (!next.some((item) => item.key === key)) {
      delete drafts[key];
    }
  }

  /**
   * 从某份食谱卡进入：默认就是那一份。
   * 从消息/订单列表/客服进入（没有 recipeId）：默认第一份。
   * 这条规则在“可提交”状态下尤其重要，不能让顾客自己再找。
   */
  const entry = next.find(
    (item) => recipeId.value && item.recipeId === recipeId.value,
  );
  const current = next.find((item) => item.key === activeKey.value);
  activeKey.value =
    current?.key || entry?.key || next[0]?.key || '';
}

async function load() {
  loading.value = true;
  try {
    if (isRefundScene.value) return;

    const [aftersaleResult, detail, delivery] = await Promise.all([
      fetchAftersales(orderId.value),
      fetchOrderDetail(orderId.value).catch((error) => {
        console.warn('[CustomRecipe] 读取订单详情失败:', error);
        return null;
      }),
      fetchDelivery(orderId.value).catch((error) => {
        console.warn('[CustomRecipe] 读取交付内容失败:', error);
        return null;
      }),
    ]);

    list.value = aftersaleResult.items;
    quota.value = aftersaleResult.quota;
    buildItems(detail, delivery as OrderDelivery | DeliveryBatchContent | null);
  } catch (error) {
    uni.showToast({
      title: (error as Error)?.message || '读取调整信息失败',
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
}

function resetDrafts() {
  for (const item of items.value) {
    drafts[item.key] = { description: '', attachments: [] };
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusText(item: AftersaleItem): string {
  if (item.customerStatusLabel) return item.customerStatusLabel;
  if (item.status === 'RESOLVED') return '已交付';
  if (
    item.status === 'REJECTED' &&
    (item.rejectReason || '').includes('撤回')
  ) {
    return '已撤销';
  }
  return item.statusLabel;
}

function statusClass(item: AftersaleItem): string {
  if (item.status === 'RESOLVED') return 'status-pill--delivered';
  if (item.status === 'REJECTED') {
    return (item.rejectReason || '').includes('撤回')
      ? 'status-pill--withdrawn'
      : 'status-pill--rejected';
  }
  if (item.status === 'PENDING') return 'status-pill--pending';
  return 'status-pill--processing';
}

function scopeText(item: AftersaleItem): string {
  const selected = item.items || [];
  if (selected.length) {
    return `涉及 ${selected.length} 份：${selected
      .map((row) => row.recipeName || '未命名食谱')
      .join('、')}`;
  }
  if (item.deliveryItemIds?.length) {
    return `涉及 ${item.deliveryItemIds.length} 份`;
  }
  return '';
}

function historyContent(item: AftersaleItem): string {
  const requests = item.recipeRequests || [];
  if (requests.length) {
    const names = new Map(
      (item.items || []).map((row) => [row.deliveryItemId, row.recipeName]),
    );
    return requests
      .map(
        (request) =>
          `${names.get(request.deliveryItemId) || '食谱'}：${request.description}`,
      )
      .join('\n');
  }
  return item.description;
}

function isLongRecord(item: AftersaleItem): boolean {
  return historyContent(item).length > 120;
}

function isExpanded(id: string): boolean {
  return expandedIds.value.includes(id);
}

function toggleExpanded(id: string) {
  expandedIds.value = isExpanded(id)
    ? expandedIds.value.filter((item) => item !== id)
    : [...expandedIds.value, id];
}

function foodRowsOf(content: DeliveryContent) {
  return (content.recipe?.items || [])
    .filter(
      (item) => !item.isSupplement && item.ingredientType !== 'SUPPLEMENT',
    )
    .map((item) => ({
      name: item.name,
      ratioPercent: item.ratioPercent ?? null,
    }));
}

function formatRatio(value: number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric > 0 && numeric < 0.01) return '<0.01%';
  return `${numeric.toFixed(2)}%`;
}

function supplementRowsOf(content: DeliveryContent) {
  const rows: Array<{ label: string; value: string; unit: string }> = [];
  const seen = new Set<string>();
  for (const supplement of content.supplements || []) {
    for (const target of supplement.targets || []) {
      const value = Number(target.targetValuePerKg);
      if (!target.label || !Number.isFinite(value)) continue;
      const unit = target.unit || '';
      const key = `${target.label}:${unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        label: target.label,
        value: Number.isInteger(value) ? String(value) : value.toFixed(1),
        unit,
      });
    }
  }
  return rows;
}

function dmRowsOf(content: DeliveryContent) {
  const macros = toDryMatterMacros(content.nutrition?.macros);
  return [
    { label: '蛋白质', value: macros.protein },
    { label: '脂肪', value: macros.fat },
    { label: '灰分', value: macros.ash },
    { label: '纤维', value: macros.fiber },
    { label: '碳水', value: macros.carbohydrate },
  ].map((row) => ({
    label: row.label,
    value: row.value === null ? '—' : `${row.value}%`,
  }));
}

function isImageAttachment(att: Attachment): boolean {
  if (att.fileType === 'IMAGE') return true;
  return /\.(jpe?g|png|gif|webp)(\?|$)/.test(att.url.toLowerCase());
}

function docBadge(att: Attachment): string {
  const match = /\.([a-z0-9]+)(\?|$)/.exec(
    (att.fileName || att.url).toLowerCase(),
  );
  return (match?.[1] || '文件').toUpperCase().slice(0, 4);
}

function previewAttachment(att: Attachment) {
  if (isImageAttachment(att)) {
    const draft = items.value
      .map((item) => drafts[item.key])
      .find((candidate) => candidate?.attachments.includes(att));
    const images = (draft?.attachments || [])
      .filter(isImageAttachment)
      .map((item) => item.url);
    uni.previewImage({ urls: images, current: att.url });
    return;
  }
  uni.showLoading({ title: '打开中…' });
  uni.downloadFile({
    url: att.url,
    success: (res) => {
      if (res.statusCode !== 200) {
        uni.showToast({ title: '文档打开失败', icon: 'none' });
        return;
      }
      uni.openDocument({
        filePath: res.tempFilePath,
        showMenu: true,
        fail: () => uni.showToast({ title: '文档打开失败', icon: 'none' }),
      });
    },
    fail: () => uni.showToast({ title: '文档下载失败', icon: 'none' }),
    complete: () => uni.hideLoading(),
  });
}

async function uploadSelected(
  filePath: string,
  fileName = '照片',
  draftKey = activeKey.value,
) {
  const draft = drafts[draftKey];
  if (!draft) return;
  if (draft.attachments.length >= MAX_ATTACH) {
    uni.showToast({ title: `最多 ${MAX_ATTACH} 个附件`, icon: 'none' });
    return;
  }
  uploading.value = true;
  uni.showLoading({ title: '上传中…' });
  try {
    const result = await uploadAftersaleAttachment(orderId.value, filePath);
    // 上传期间顾客可能切了 Tab：文件仍要挂到发起上传的那一份
    draft.attachments = [
      ...draft.attachments,
      {
        id: result.id,
        url: result.url,
        fileName: result.fileName || fileName,
        fileSize: result.fileSize,
        fileType: result.fileType,
      },
    ];
    uni.showToast({ title: '已上传', icon: 'none' });
  } catch (error) {
    uni.showToast({
      title: (error as Error)?.message || '上传失败，请重试',
      icon: 'none',
    });
  } finally {
    uploading.value = false;
    uni.hideLoading();
  }
}

async function pickPhoto(draftKey = activeKey.value) {
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album'],
        success: resolve,
        fail: reject,
      });
    });
    const filePath = chosen?.tempFilePaths?.[0] || '';
    if (!filePath) return;
    const fileName =
      chosen?.tempFiles?.[0]?.name ||
      chosen?.tempFilePaths?.[0]?.split('/').pop() ||
      '照片';
    await uploadSelected(filePath, fileName, draftKey);
  } catch {
    // 顾客取消，静默
  }
}

async function pickDocument(draftKey = activeKey.value) {
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['pdf', 'doc', 'docx'],
        success: resolve,
        fail: reject,
      });
    });
    const file = chosen?.tempFiles?.[0];
    if (!file?.path) return;
    await uploadSelected(file.path, file.name || '文档', draftKey);
  } catch {
    // 顾客取消，静默
  }
}

function pickAttachment() {
  if (uploading.value) return;
  const draftKey = activeKey.value;
  const draft = drafts[draftKey];
  if (!draft) return;
  if (draft.attachments.length >= MAX_ATTACH) {
    uni.showToast({ title: `最多 ${MAX_ATTACH} 个附件`, icon: 'none' });
    return;
  }
  uni.showActionSheet({
    itemList: ['照片', '文档'],
    success: (res) => {
      if (res.tapIndex === 0) pickPhoto(draftKey);
      if (res.tapIndex === 1) pickDocument(draftKey);
    },
  });
}

async function removeAttachment(att: Attachment) {
  const draft = items.value
    .map((item) => drafts[item.key])
    .find((candidate) => candidate?.attachments.includes(att));
  if (!draft) return;

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删除这个附件？',
      content: '删除后文件也会从服务器删掉。',
      confirmText: '删除',
      cancelText: '取消',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  if (att.id) {
    uni.showLoading({ title: '删除中…' });
    try {
      const result = await deleteAftersaleAttachment(att.id);
      if (!result.ok) {
        uni.showToast({ title: result.message || '删除失败', icon: 'none' });
        return;
      }
    } catch (error) {
      uni.showToast({
        title: (error as Error)?.message || '删除失败，请重试',
        icon: 'none',
      });
      return;
    } finally {
      uni.hideLoading();
    }
  }

  draft.attachments = draft.attachments.filter((item) => item !== att);
}

async function handleSubmit() {
  if (!canSubmit.value || submitting.value) return;

  submitting.value = true;
  try {
    await requestCustomRecipeOrderSubscription();

    const filledItems = items.value.filter(
      (item) => (drafts[item.key]?.description || '').trim().length > 0,
    );
    const isBatch = filledItems.some((item) => Boolean(item.deliveryItemId));

    const recipeRequests: AftersaleRecipeRequest[] | undefined = isBatch
      ? filledItems.map((item) => ({
          deliveryItemId: item.deliveryItemId,
          description: (drafts[item.key]?.description || '').trim(),
          photos: (drafts[item.key]?.attachments || []).map((att) => att.url),
        }))
      : undefined;

    const photos = Array.from(
      new Set(
        filledItems.flatMap((item) =>
          (drafts[item.key]?.attachments || []).map((att) => att.url),
        ),
      ),
    );

    const description = isBatch
      ? `共 ${filledItems.length} 份食谱调整需求`
      : (drafts[filledItems[0].key]?.description || '').trim();

    const result = await submitAftersale({
      orderId: orderId.value,
      type: 'ADJUST_RECIPE',
      description,
      photos,
      ...(isBatch
        ? {
            deliveryItemIds: filledItems.map((item) => item.deliveryItemId),
            recipeRequests,
          }
        : {}),
    });

    if (!result.ok) {
      uni.showModal({
        title: '没能提交',
        content: result.message || '请稍后重试，或直接联系 Seven爸爸',
        showCancel: false,
      });
      return;
    }

    uni.showToast({ title: '已提交，我们会尽快看', icon: 'none' });
    resetDrafts();
    await load();
  } catch (error) {
    uni.showToast({
      title: (error as Error)?.message || '提交失败，请重试',
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
}

async function handleCancel() {
  if (!openItem.value || cancelling.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '撤销本次提交？',
      content: '撤销后这次调整不再处理，次数会退回；重新提交即可。',
      confirmText: '撤销',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  cancelling.value = true;
  try {
    const result = await cancelAftersale(openItem.value.id);
    if (!result.ok) {
      uni.showToast({ title: result.message || '撤销失败', icon: 'none' });
      return;
    }
    uni.showToast({ title: '已撤销', icon: 'none' });
    await load();
  } finally {
    cancelling.value = false;
  }
}

function openLatestRecipe(item?: AftersaleItem) {
  const targetRecipeId =
    item?.items?.find((row) => row.recipeId)?.recipeId ||
    activeItem.value?.recipeId ||
    recipeId.value;
  const query = targetRecipeId
    ? `&recipeId=${encodeURIComponent(targetRecipeId)}`
    : '';
  uni.navigateTo({
    url: `/pages/custom-recipe/delivery?orderId=${encodeURIComponent(
      orderId.value,
    )}${query}`,
  });
}

onLoad((options) => {
  orderId.value = options?.orderId
    ? decodeURIComponent(options.orderId)
    : '';
  recipeId.value = options?.recipeId
    ? decodeURIComponent(options.recipeId)
    : '';
  isRefundScene.value = String(options?.scene || '') === 'refund';
  if (isRefundScene.value) {
    uni.setNavigationBarTitle({ title: '退款申请' });
  }
  load();
});
</script>

<style scoped>
.adjust-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 220rpx;
  background: #f4efe4;
  box-sizing: border-box;
}

.state-block {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 160rpx 0;
}

.state-text {
  font-size: 26rpx;
  color: #8a7a66;
}

/* 额度 */
.quota-card {
  display: flex;
  align-items: stretch;
  padding: 28rpx 24rpx;
  border-radius: 28rpx;
  background: linear-gradient(145deg, #24483a, #16261f 70%);
  box-shadow: 0 16rpx 36rpx rgba(30, 58, 47, 0.18);
}

.quota-cell {
  flex: 1;
  min-width: 0;
}

.quota-label {
  font-size: 21rpx;
  color: rgba(244, 236, 216, 0.68);
}

.quota-value-row {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
}

.quota-value {
  font-size: 42rpx;
  font-weight: 800;
  color: #d8bc85;
  line-height: 1.1;
}

.quota-unit {
  margin-left: 6rpx;
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.7);
}

.quota-divider {
  width: 1rpx;
  margin: 0 22rpx;
  background: rgba(216, 188, 133, 0.24);
}

.quota-reason {
  margin-top: 18rpx;
  padding: 18rpx 22rpx;
  border-radius: 16rpx;
  background: #f7f1e4;
  border: 1rpx solid #eadfcb;
}

.quota-reason-text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a6b33;
}

/* 历史 */
.history-section {
  margin-top: 32rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #3f3222;
}

.empty-record {
  padding: 30rpx 24rpx;
  border-radius: 20rpx;
  background: #fffdf7;
  border: 1rpx solid #e8decd;
}

.empty-record-text {
  font-size: 24rpx;
  color: #8a7a66;
}

.record-card {
  margin-bottom: 18rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #fffdf7;
  border: 1rpx solid #e8decd;
}

.record-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.record-time {
  font-size: 22rpx;
  color: #8a7a66;
}

.status-pill {
  flex: 0 0 auto;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 700;
}

.status-pill--pending {
  color: #b45309;
  background: #fff1e3;
}

.status-pill--processing {
  color: #1e5b35;
  background: #eaf4ec;
}

.status-pill--delivered {
  color: #2e7d32;
  background: #e8f5e9;
}

.status-pill--withdrawn {
  color: #777;
  background: #f1f1ee;
}

.status-pill--rejected {
  color: #b3261e;
  background: #fdecea;
}

.record-scope {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #8a9a8f;
}

.record-content {
  display: -webkit-box;
  margin-top: 12rpx;
  font-size: 26rpx;
  line-height: 1.65;
  color: #3f3222;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

.record-content--open {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}

.record-toggle {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #b08d4f;
}

.record-result {
  margin-top: 14rpx;
  padding: 16rpx 18rpx;
  border-radius: 12rpx;
  background: #f4f7f5;
}

.record-result-label {
  display: block;
  font-size: 21rpx;
  font-weight: 700;
  color: #1e5b35;
}

.record-result-text {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #3f3222;
}

.record-latest {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 16rpx;
  padding-top: 14rpx;
  border-top: 1rpx dashed #eadfcb;
}

.record-latest-text {
  font-size: 21rpx;
  color: #8a7a66;
}

.record-latest-link {
  flex: 0 0 auto;
  font-size: 22rpx;
  font-weight: 700;
  color: #b08d4f;
}

/* 大容器 */
.adjust-container {
  margin-top: 28rpx;
  padding: 28rpx 24rpx;
  border-radius: 28rpx;
  background: #fffdf7;
  border: 1rpx solid #e8decd;
}

.container-title {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #3f3222;
  letter-spacing: 0.5rpx;
}

.container-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a7a66;
}

.recipe-tabs {
  margin-top: 20rpx;
  white-space: nowrap;
}

.recipe-tab {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  margin-right: 12rpx;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  border: 1rpx solid #e0d3bf;
  background: #fffdf7;
  color: #6b5c45;
  font-size: 24rpx;
}

.recipe-tab--active {
  background: #1e3a2f;
  border-color: #1e3a2f;
  color: #f4ecd8;
  font-weight: 700;
}

.recipe-tab-name {
  max-width: 260rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #b08d4f;
}

.recipe-tab--active .tab-dot {
  background: #d8bc85;
}

.container-section {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx dashed #eadfcb;
}

.container-section-title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #3f3222;
}

.summary-name {
  display: block;
  margin-bottom: 8rpx;
  font-size: 27rpx;
  font-weight: 700;
  color: #3f3222;
}

.food-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx dashed #f0e6d8;
}

.food-row:last-child {
  border-bottom: none;
}

.food-name {
  font-size: 24rpx;
  color: #3f3222;
}

.food-ratio {
  font-size: 25rpx;
  font-weight: 700;
  color: #b45309;
}

.supplement-line {
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #4f4636;
}

.supplement-label {
  color: #6b5c45;
}

.supplement-item {
  color: #1e5b35;
  font-weight: 700;
}

.macro-caption {
  display: block;
  margin-top: 18rpx;
  margin-bottom: 10rpx;
  font-size: 21rpx;
  color: #8a9a8f;
}

.macro-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.macro-cell {
  padding: 14rpx 12rpx;
  border-radius: 12rpx;
  background: #f4f7f5;
}

.macro-label {
  display: block;
  font-size: 19rpx;
  color: #8a9a8f;
}

.macro-value {
  display: block;
  margin-top: 4rpx;
  font-size: 25rpx;
  font-weight: 700;
  color: #3f3222;
}

.summary-empty {
  display: block;
  padding: 20rpx 0;
  font-size: 23rpx;
  color: #a08c6d;
}

.adjust-input {
  width: 100%;
  min-height: 180rpx;
  padding: 20rpx;
  border-radius: 14rpx;
  border: 1rpx solid #e6dccb;
  background: #fffdf9;
  font-size: 26rpx;
  line-height: 1.65;
  color: #3f3222;
  box-sizing: border-box;
}

.attachment-area {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 18rpx;
}

.attachment-item {
  position: relative;
  width: 112rpx;
  height: 112rpx;
}

.attachment-thumb {
  width: 112rpx;
  height: 112rpx;
  border-radius: 12rpx;
  background: #eef2e4;
}

.attachment-doc {
  width: 112rpx;
  height: 112rpx;
  padding: 8rpx;
  border-radius: 12rpx;
  border: 1rpx solid #eadfcb;
  background: #fbf7ee;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}

.attachment-doc-badge {
  font-size: 19rpx;
  font-weight: 800;
  color: #b45309;
}

.attachment-doc-name {
  width: 92rpx;
  font-size: 17rpx;
  color: #6b5c45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  background: #4a4a42;
  color: #fff;
  font-size: 22rpx;
  line-height: 34rpx;
  text-align: center;
  z-index: 2;
}

.add-attachment {
  width: 112rpx;
  height: 112rpx;
  border-radius: 12rpx;
  border: 1rpx dashed #cdbfa8;
  background: #fbf7ee;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
}

.add-attachment-icon {
  font-size: 34rpx;
  line-height: 1;
  color: #a08c6d;
  font-weight: 300;
}

.add-attachment-text {
  font-size: 18rpx;
  color: #a08c6d;
}

.attachment-hint {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  line-height: 1.55;
  color: #b45309;
}

.locked-note {
  padding: 20rpx;
  border-radius: 14rpx;
  background: #f7f1e4;
  border: 1rpx solid #eadfcb;
}

.locked-note-text {
  font-size: 24rpx;
  line-height: 1.65;
  color: #6b5c45;
}

.empty-recipe {
  margin-top: 28rpx;
  padding: 28rpx 24rpx;
  border-radius: 20rpx;
  background: #fffdf7;
  border: 1rpx solid #e8decd;
}

.empty-recipe-text {
  font-size: 24rpx;
  line-height: 1.65;
  color: #8a7a66;
}

/* 退款占位 */
.refund-wrap {
  padding-top: 40rpx;
}

.refund-card {
  padding: 32rpx 28rpx;
  border-radius: 24rpx;
  background: #fffdf7;
  border: 1rpx solid #e8decd;
}

.refund-title {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
  color: #3f3222;
}

.refund-text {
  display: block;
  margin-top: 16rpx;
  font-size: 25rpx;
  line-height: 1.7;
  color: #6b5c45;
}

/* 固定栏 */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom));
  background: rgba(255, 253, 247, 0.98);
  border-top: 1rpx solid #e8decd;
  box-shadow: 0 -12rpx 30rpx rgba(30, 58, 47, 0.08);
}

.service-slot {
  flex: 0 0 auto;
}

.submit-btn {
  flex: 1;
  height: 84rpx;
  margin: 0;
  border: none;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  color: #1e3a2f;
  font-size: 27rpx;
  font-weight: 800;
  line-height: 84rpx;
}

.submit-btn[disabled] {
  background: #e9e4d8;
  color: #a59b89;
}

.withdraw-btn {
  flex: 1;
  height: 84rpx;
  margin: 0;
  border: 1rpx solid #e3c7c3;
  border-radius: 999rpx;
  background: #fff7f5;
  color: #b3261e;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 84rpx;
}

.processing-btn {
  flex: 1;
  height: 84rpx;
  margin: 0;
  border: none;
  border-radius: 999rpx;
  background: #e9e4d8;
  color: #a59b89;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 84rpx;
}
</style>
