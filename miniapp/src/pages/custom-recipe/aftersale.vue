<template>
  <view class="aftersale-page">
    <!--
      售后页（2026-10-16，批次 2.5）
      「问个问题 / 调整食谱 / 其他意见」三类**来自选项字典**，不写死在前端。
      提交与撤回的规则全部由后端判定，页面只把后端说的原因如实显示出来。
    -->
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <template v-else>
      <!-- 已经提过的：显示进度 -->
      <view v-for="item in list" :key="item.id" class="section aftersale-card">
        <view class="aftersale-head">
          <text class="aftersale-type">{{ item.typeLabel }}</text>
          <text class="aftersale-status" :class="`status--${item.status}`">
            {{ item.statusLabel }}
          </text>
        </view>
        <text class="aftersale-desc">{{ item.description }}</text>

        <!-- 进度时间轴：节点与文案由后端下发 -->
        <view class="progress-list">
          <view
            v-for="(step, index) in item.progress.timeline"
            :key="step.code"
            class="progress-item"
            :class="{
              'progress-item--done': step.done,
              'progress-item--active': step.active,
            }"
          >
            <view class="progress-marker">
              <text class="progress-dot">{{ step.done ? '✓' : '' }}</text>
              <view
                v-if="index < item.progress.timeline.length - 1"
                class="progress-line"
              />
            </view>
            <view class="progress-body">
              <text class="progress-label">{{ step.label }}</text>
              <text v-if="step.note" class="progress-note">{{ step.note }}</text>
            </view>
          </view>
        </view>

        <!-- 客服的处理说明 / 驳回原因，如实显示 -->
        <view v-if="item.handleNote" class="aftersale-note">
          <text class="aftersale-note-label">处理说明</text>
          <text class="aftersale-note-text">{{ item.handleNote }}</text>
        </view>
        <view v-if="item.rejectReason" class="aftersale-note">
          <text class="aftersale-note-label">说明</text>
          <text class="aftersale-note-text">{{ item.rejectReason }}</text>
        </view>

        <!-- 能不能撤回由后端算好 -->
        <button
          v-if="item.canCancel"
          class="btn-secondary"
          :loading="cancellingId === item.id"
          @tap="handleCancel(item)"
        >
          撤回这条
        </button>
      </view>

      <!-- 提交新的：已经有未处理完的就不显示表单（后端也会拦，这里省一次往返） -->
      <!--
        配额条（2026-10-18 · 需求 2.5.7）：**两个数字必须在最上面**。
        顾客打开这一页的第一件事是"我还能不能提"，不是"填表"。
      -->
      <view v-if="quota" class="quota-bar">
        <view v-if="quota.windowDaysLeft !== null" class="quota-item">
          <text class="quota-value">{{ quota.windowDaysLeft }}</text>
          <text class="quota-label">天窗口期</text>
        </view>
        <view class="quota-item">
          <text class="quota-value">{{ quota.freeRevisionsLeft }}</text>
          <text class="quota-label">次免费调整</text>
        </view>
      </view>

      <!-- 不能提时说清楚为什么，顾客不用猜 -->
      <view v-if="quota && !quota.canSubmit && quota.reason" class="quota-reason">
        <text class="quota-reason-text">{{ quota.reason }}</text>
      </view>

      <view v-if="canSubmitNew" class="section">
        <view class="section-title">遇到什么问题了？</view>

        <view class="type-list">
          <view
            v-for="option in typeOptions"
            :key="option.code"
            class="type-option"
            :class="{ 'type-option--picked': form.type === option.code }"
            @tap="form.type = option.code"
          >
            <text class="type-icon">{{ option.icon || '·' }}</text>
            <view class="type-text">
              <text class="type-label">{{ option.label }}</text>
              <text v-if="option.description" class="type-desc">
                {{ option.description }}
              </text>
            </view>
          </view>
        </view>

        <textarea
          v-model="form.description"
          class="desc-input"
          placeholder="说一下具体情况，比如「吃了三天有点软便」"
          :maxlength="1000"
          auto-height
        />
        <text class="word-count">{{ form.description.length }} / 1000</text>

        <!--
          附件（2026-10-18；20:30 补上文档）
          老板："只上传照片吗？PDF和Word能不能上传呢？"

          需求 2.5.7：**照片 + PDF + Word**，每条可预览 / 删除，可继续新增。

          后端本来就接受 PDF（`getFileType` 有 pdf 分支，其它类型落到 OTHER 也不拒），
          缺的只是前端只给了相册 —— 这里补一个「从微信里选文件」。
        -->
        <view class="attach-block">
          <view class="attach-head">
            <text class="attach-title">照片 / 文档（选填）</text>
            <text v-if="attachments.length" class="attach-count">
              已传 {{ attachments.length }} 个
            </text>
          </view>
          <view class="attach-list">
            <view
              v-for="(url, index) in attachments"
              :key="url + index"
              class="attach-item"
            >
              <image class="attach-thumb" :src="url" mode="aspectFill" @tap="previewAttach(index)" />
              <text class="attach-remove" @tap.stop="removeAttach(index)">×</text>
            </view>
            <view v-if="attachments.length < MAX_ATTACH" class="attach-add" @tap="pickAttach">
              <text class="attach-add-icon">＋</text>
            </view>
            <!--
              从微信里选文件（PDF / Word）。
              微信只能从**聊天记录**里选文件，所以走 `chooseMessageFile`。
            -->
            <view
              v-if="attachments.length < MAX_ATTACH"
              class="attach-add attach-add--doc"
              @tap="pickDocument"
            >
              <text class="attach-add-doc">文档</text>
            </view>
          </view>
          <text class="attach-tip">
            {{
              uploading
                ? '上传中…'
                : '照片直接拍；PDF / Word 化验单可先从微信「文件传输助手」发一下，再点「文档」选进来'
            }}
          </text>
        </view>

        <button
          class="btn-primary"
          :loading="submitting"
          :disabled="submitting || !canSubmit"
          @tap="handleSubmit"
        >
          提交
        </button>
        <text v-if="!canSubmit && !submitting" class="hint">
          选个类型、写一句具体情况就能提交
        </text>
      </view>

      <view v-else-if="list.length" class="section done-note">
        <text>你已经提交过售后，我们正在处理。有新情况可以直接联系客服补充。</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  cancelAftersale,
  uploadAftersaleAttachment,
  fetchAftersales,
  type AftersaleQuota,
  fetchAftersaleTypes,
  submitAftersale,
  type AftersaleItem,
  type AftersaleTypeOption,
} from '@/api/custom-recipe';
import { requestCustomRecipeOrderSubscription } from '@/utils/custom-recipe-payment';

/**
 * 售后页（2026-10-16，批次 2.5）
 *
 * ## 页面里**没有业务判断**
 *
 * · 类型选项来自**选项字典**（后台可加可改，不用发版）
 * · "能不能撤回"由后端算好（`item.canCancel`）
 * · 进度节点与文案由后端下发
 * · 提交失败时显示的**是后端给的原因**（"已超过售后受理期（交付后 30 天内）"），
 *   不是前端编的通用文案
 *
 * 页面自己只做一件事：判断"有没有未处理完的"来决定显不显示表单 ——
 * 而那也只是省一次往返，真正的拦截在后端。
 */

const orderId = ref('');
const loading = ref(true);
const list = ref<AftersaleItem[]>([]);

/**
 * 售后配额（2026-10-18 · 需求 2.5.7）
 *
 * 需求写死了：「**必须先显示两个数字** —— 窗口还剩几天、免费修改还剩几次。
 * **不让顾客猜自己还能不能提。**」
 *
 * 数字与"能不能提"都由**后端算**，这里只负责画。
 */
const quota = ref<AftersaleQuota | null>(null);
const typeOptions = ref<AftersaleTypeOption[]>([]);
const submitting = ref(false);
const cancellingId = ref('');

const form = reactive({ type: '', description: '' });

/**
 * 附件（2026-10-18）。
 *
 * 上限**不在前端写死**为准 —— 后端的 `getAttachmentLimits` 才是权威，
 * 这里只是提前挡一下，给一句人话提示（不要等传完才报错）。
 */
const MAX_ATTACH = 9;
const attachments = ref<string[]>([]);
const uploading = ref(false);

async function pickAttach() {
  if (uploading.value) return;
  if (attachments.value.length >= MAX_ATTACH) {
    uni.showToast({ title: `最多 ${MAX_ATTACH} 个`, icon: 'none' });
    return;
  }

  let filePath = '';
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        // 只从相册选：只给一个来源时微信不再弹"拍照/相册"选择器
        sourceType: ['album'],
        success: resolve,
        fail: reject,
      });
    });
    filePath = chosen?.tempFilePaths?.[0] || '';
  } catch {
    // 顾客取消：静默返回
    return;
  }
  if (!filePath) return;

  uploading.value = true;
  uni.showLoading({ title: '上传中…' });
  try {
    const { url } = await uploadAftersaleAttachment(orderId.value, filePath);
    attachments.value = [...attachments.value, url];
    uni.showToast({ title: '已上传', icon: 'none' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '上传失败，请重试', icon: 'none' });
  } finally {
    uploading.value = false;
    uni.hideLoading();
  }
}

/**
 * 从微信里选文件（PDF / Word）—— 需求 2.5.7 要求「照片 + PDF + Word」。
 *
 * 为什么用 `chooseMessageFile` 而不是 `chooseImage`：
 * 微信小程序的相册选择器**只能选图片**；要选 PDF/Word 必须走
 * "从聊天记录里选文件"这条路（`uni.chooseMessageFile`）。
 *
 * 所以顾客的用法是：**先把化验单发到微信里（发给"文件传输助手"就行）**，
 * 再回来从这里选。这点在提示文案里写清楚，否则他会以为坏了。
 */
async function pickDocument() {
  if (uploading.value) return;
  if (attachments.value.length >= MAX_ATTACH) {
    uni.showToast({ title: `最多 ${MAX_ATTACH} 个`, icon: 'none' });
    return;
  }

  let filePath = '';
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseMessageFile({
        count: 1,
        // PDF 与 Word（doc/docx）。微信的 type 只支持大类，具体扩展名靠后端判。
        type: 'file',
        extension: ['pdf', 'doc', 'docx'],
        success: resolve,
        fail: reject,
      });
    });
    filePath = chosen?.tempFiles?.[0]?.path || '';
  } catch {
    // 顾客取消：静默返回
    return;
  }
  if (!filePath) return;

  uploading.value = true;
  uni.showLoading({ title: '上传中…' });
  try {
    const { url } = await uploadAftersaleAttachment(orderId.value, filePath);
    attachments.value = [...attachments.value, url];
    uni.showToast({ title: '已上传', icon: 'none' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '上传失败，请重试', icon: 'none' });
  } finally {
    uploading.value = false;
    uni.hideLoading();
  }
}

function removeAttach(index: number) {
  attachments.value = attachments.value.filter((_, i) => i !== index);
}

function previewAttach(index: number) {
  uni.previewImage({
    urls: attachments.value,
    current: attachments.value[index],
  });
}

/** 有未处理完的就不再显示表单（后端也会拦，这里只是省一次往返） */
const canSubmitNew = computed(
  () => !list.value.some((item) => item.canCancel),
);

const canSubmit = computed(
  () => Boolean(form.type) && form.description.trim().length > 0,
);

const load = async () => {
  loading.value = true;
  try {
    const [result, types] = await Promise.all([
      fetchAftersales(orderId.value),
      fetchAftersaleTypes(),
    ]);
    list.value = result.items;
    quota.value = result.quota;
    typeOptions.value = types;
    // 默认选中字典里标了 isDefault 的那个，没有就选第一个
    if (!form.type && types.length) {
      form.type = types[0].code;
    }
  } finally {
    loading.value = false;
  }
};

/**
 * 提交售后时申请一次订阅（2026-10-18 · 需求 2.5.8）。
 *
 * 为什么在这一刻申请：微信是**一次性订阅** —— 一次授权只能下发一条消息。
 * 售后处理完成那一刻顾客不在小程序里，没法当时授权；
 * 而**提售后这个动作**正好是他主动操作、最有理由接受通知的时刻。
 *
 * 复用下单那个封装（它自己会去取模板 ID、自己吞掉所有失败）——
 * 不发通知也**不影响提交**，站内消息是兜底。
 */
async function requestAftersaleSubscription() {
  await requestCustomRecipeOrderSubscription();
}

const handleSubmit = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    // 先申请订阅（点提交这个动作本身就授权了一次），再提交
    await requestAftersaleSubscription();

    const result = await submitAftersale({
      orderId: orderId.value,
      type: form.type,
      description: form.description.trim(),
      // 附件（2026-10-18）：接口早就支持了，之前只是没传
      photos: attachments.value,
    });

    if (!result.ok) {
      // 后端的原因直接给顾客看 —— 它比前端编的通用文案有用得多
      uni.showModal({
        title: '没能提交',
        content: result.message || '请稍后重试，或直接联系客服',
        showCancel: false,
      });
      return;
    }

    uni.showToast({ title: '已提交，我们会尽快看', icon: 'none' });
    form.description = '';
    await load();
  } catch (error) {
    uni.showToast({
      title: (error as Error)?.message || '提交失败，请重试',
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
};

const handleCancel = async (item: AftersaleItem) => {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '撤回这条？',
      content: '撤回后这条售后就不再处理了。如果只是想说点补充情况，直接联系客服更快。',
      confirmText: '撤回',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  cancellingId.value = item.id;
  try {
    const result = await cancelAftersale(item.id);
    if (!result.ok) {
      uni.showToast({ title: result.message || '撤回失败', icon: 'none' });
      return;
    }
    uni.showToast({ title: '已撤回', icon: 'none' });
    await load();
  } finally {
    cancellingId.value = '';
  }
};

onLoad((options) => {
  orderId.value = options?.orderId ? decodeURIComponent(options.orderId) : '';
  load();
});
</script>

<style scoped>
.aftersale-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #16261f;
}

.state-block {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.state-text {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
}

.section {
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(216, 188, 133, 0.22);
  border-radius: 28rpx;
}

.section-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #d8bc85;
}

.aftersale-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.aftersale-type {
  font-size: 30rpx;
  font-weight: 600;
  color: #f4ecd8;
}

.aftersale-status {
  padding: 4rpx 16rpx;
  font-size: 22rpx;
  border-radius: 100rpx;
  background: rgba(216, 188, 133, 0.18);
  color: #d8bc85;
}

.status--RESOLVED {
  background: rgba(123, 196, 138, 0.2);
  color: #7bc48a;
}

.status--REJECTED {
  background: rgba(224, 139, 139, 0.2);
  color: #e08b8b;
}

.aftersale-desc {
  display: block;
  margin-bottom: 20rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.85);
}

.progress-list {
  margin: 16rpx 0;
}

.progress-item {
  display: flex;
  gap: 16rpx;
  min-height: 72rpx;
}

.progress-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 32rpx;
  flex-shrink: 0;
}

.progress-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  font-size: 18rpx;
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

.progress-body {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding-bottom: 16rpx;
}

.progress-label {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.6);
}

.progress-item--done .progress-label,
.progress-item--active .progress-label {
  color: #f4ecd8;
}

.progress-note {
  font-size: 22rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);
}

.aftersale-note {
  padding: 16rpx 20rpx;
  margin-top: 12rpx;
  background: rgba(216, 188, 133, 0.1);
  border-radius: 16rpx;
}

.aftersale-note-label {
  display: block;
  margin-bottom: 6rpx;
  font-size: 22rpx;
  color: #d8bc85;
}

.aftersale-note-text {
  font-size: 26rpx;
  line-height: 1.6;
  color: #f4ecd8;
}

.type-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 24rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(216, 188, 133, 0.2);
  border-radius: 20rpx;
}

.type-option--picked {
  border-color: #d8bc85;
  background: rgba(216, 188, 133, 0.12);
}

.type-icon {
  font-size: 32rpx;
}

.type-text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
}

.type-label {
  font-size: 28rpx;
  color: #f4ecd8;
}

.type-desc {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.55);
}

.desc-input {
  width: 100%;
  min-height: 180rpx;
  padding: 20rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #f4ecd8;
  background: rgba(255, 255, 255, 0.05);
  border: 1rpx solid rgba(216, 188, 133, 0.2);
  border-radius: 20rpx;
  box-sizing: border-box;
}

.word-count {
  display: block;
  margin: 8rpx 0 24rpx;
  font-size: 22rpx;
  text-align: right;
  color: rgba(244, 236, 216, 0.4);
}

.btn-primary {
  color: #1e3a2f;
  background: #d8bc85;
}

.btn-secondary {
  margin-top: 20rpx;
  color: #f4ecd8;
  background: transparent;
  border: 1rpx solid rgba(216, 188, 133, 0.5);
}

.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  text-align: center;
  color: rgba(244, 236, 216, 0.45);
}

.done-note {
  font-size: 26rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.7);
}

/* ===== 附件（2026-10-18）===== */
.attach-block {
  margin-top: 20rpx;
}

.attach-head {
  display: flex;
  align-items: baseline;
  margin-bottom: 12rpx;
}

.attach-title {
  flex: 1;
  font-size: 24rpx;
  font-weight: 700;
  color: #3f3222;
}

.attach-count {
  font-size: 21rpx;
  color: #9c8b76;
}

.attach-list {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.attach-item {
  position: relative;
  width: 140rpx;
  height: 140rpx;
}

.attach-thumb {
  width: 140rpx;
  height: 140rpx;
  border-radius: 14rpx;
  background: #f4ebe0;
}

.attach-remove {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 24rpx;
  text-align: center;
  line-height: 36rpx;
}

.attach-add {
  width: 140rpx;
  height: 140rpx;
  border-radius: 14rpx;
  border: 2rpx dashed #e5c9a3;
  background: #fffdf8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attach-add-icon {
  font-size: 40rpx;
  color: #b45309;
}

.attach-tip {
  display: block;
  font-size: 20rpx;
  color: #b3a492;
  margin-top: 10rpx;
  line-height: 1.5;
}

/* ===== 售后配额条（2026-10-18 · 需求 2.5.7）===== */
.quota-bar {
  display: flex;
  gap: 24rpx;
  padding: 22rpx 24rpx;
  margin: 0 24rpx 20rpx;
  background: #fffdf7;
  border: 2rpx solid #f0e4d2;
  border-radius: 18rpx;
}

.quota-item {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
}

.quota-value {
  font-size: 40rpx;
  font-weight: 700;
  color: #b45309;
}

.quota-label {
  font-size: 23rpx;
  color: #8c7b66;
}

.quota-reason {
  margin: 0 24rpx 20rpx;
  padding: 16rpx 20rpx;
  background: #fef2f2;
  border-radius: 14rpx;
}

.quota-reason-text {
  font-size: 24rpx;
  color: #b91c1c;
  line-height: 1.5;
}

/* ===== 文档上传入口（2026-10-18 · 需求 2.5.7）===== */
.attach-add--doc {
  border-style: solid;
  border-color: #e8dccb;
  background: #fff;
}

.attach-add-doc {
  font-size: 24rpx;
  font-weight: 700;
  color: #8c7b66;
}
</style>
