<template>
  <view v-if="visible" class="modal-mask" @tap="handleClose">
    <view class="modal-panel" @tap.stop>
      <view class="modal-header">
        <text class="modal-title">填写发货信息</text>
        <text class="modal-close" @tap="handleClose">×</text>
      </view>

      <!-- 填单号之前先看清寄给谁、哪只狗、寄到哪（2026-11-10）：
           以前要关掉弹窗回详情页翻地址，再手抄到顺丰下单 -->
      <view class="ship-recipient">
        <view class="ship-recipient-row">
          <text class="ship-recipient-label">顾客</text>
          <text class="ship-recipient-value">
            {{ customerName || '未记录顾客' }}
            <text v-if="customerPhone" class="ship-recipient-sub">{{ customerPhone }}</text>
          </text>
        </view>
        <view class="ship-recipient-row">
          <text class="ship-recipient-label">狗狗</text>
          <text class="ship-recipient-value" :class="{ 'ship-recipient-missing': !dogSummary }">
            {{ dogSummary || '未绑定狗狗' }}
          </text>
        </view>
        <view class="ship-recipient-row">
          <text class="ship-recipient-label">收货</text>
          <view class="ship-recipient-address">
            <block v-if="address">
              <text class="ship-recipient-value">
                {{ address.recipientName }}
                <text class="ship-recipient-sub">{{ addressPhone }}</text>
              </text>
              <text class="ship-recipient-detail">{{ addressLine }}</text>
            </block>
            <text v-else class="ship-recipient-value ship-recipient-missing">未录入收货地址</text>
          </view>
          <text v-if="address" class="ship-copy-pill" @tap.stop="copyAddress">复制地址</text>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">发货类型</text>
        <view class="ship-type-row">
          <text
            class="ship-type-option"
            :class="{ active: shippingType === 'NORMAL' }"
            @tap="shippingType = 'NORMAL'"
          >正常发货</text>
          <text
            class="ship-type-option"
            :class="{ active: shippingType === 'NOT_REQUIRED' }"
            @tap="shippingType = 'NOT_REQUIRED'"
          >无需发货</text>
        </view>
      </view>

      <block v-if="shippingType === 'NORMAL'">
        <!-- 快递存根识别（2026-11-10）：拍一张就填好承运商/单号/运费。
             结论由后端给：绿 = 核对通过；黄 = 没能核对（要手动确认）；红 = 对不上（不许发）。 -->
        <WaybillReceiptBlock
          :view="receiptView"
          :busy="receipt.state === 'recognizing'"
          :has-image="receipt.hasImage"
          @pick="pickReceipt"
          @manual="onManualReceipt"
        />
        <!-- 地址不对时唯一的正路：先把地址改对，再回来传存根 -->
        <view v-if="allowAddressFix" class="addr-link-row">
          <text class="addr-link" @tap="emit('fix-address')">收件人对不上？改收货地址</text>
        </view>
        <view class="form-item">
          <text class="form-label">物流公司</text>
          <picker
            mode="selector"
            :range="carriers"
            range-key="name"
            :value="selectedCarrierIndex"
            @change="onCarrierChange"
          >
            <view class="form-picker">
              <text>{{ carriers[selectedCarrierIndex].name }}</text>
              <text class="picker-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">物流单号</text>
          <input v-model="trackingNumber" class="form-input" placeholder="请输入物流单号" :maxlength="50" />
        </view>
        <view class="form-item">
          <text class="form-label">实际运费（元）</text>
          <input
            v-model="actualShippingFeeDraft"
            class="form-input"
            type="digit"
            placeholder="必填，例如 12.50（用于财务统计）"
            :maxlength="8"
          />
        </view>
      </block>

      <text v-else class="address-lock-hint">
        自用单不寄快递：确认后这单直接结案，不产生物流单号，也不会给顾客发发货通知。
      </text>
      <button class="address-save-btn" :disabled="isShipping" @tap="confirmShipping">
        {{ isShipping ? '发货中...' : '确认发货' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 发货抽屉（2026-11-11）。
 *
 * 从订单详情里整块搬出来的，目的只有一个：列表页点「发货」也能直接在这里发，
 * 不用先跳到详情页再退回来（一天多单时那样要多点两下）。
 *
 * 谁在把关：**服务端**。这里只负责把表单填清楚；
 * 「这个运单号是不是对着这单收货人核过的」由后端在提交时再验一次。
 */
import { computed, reactive, ref, watch } from 'vue'
import { CARRIERS, carrierIndexOf } from '../../constants/carriers'
import WaybillReceiptBlock from './WaybillReceiptBlock.vue'
import {
  createManualWaybill,
  recognizeReceipt,
  uploadReceiptImage,
} from '../../api/waybillReceipt'
import {
  applyRecognizeResult,
  createReceiptState,
  markReceiptFailed,
  markReceiptManualConfirmed,
  markReceiptPicked,
  markReceiptRecognizing,
  receiptViewOf,
  resetReceiptState,
} from '../../utils/waybill-receipt-machine'
import {
  buildOrderAddressCopyText,
  getOrderAddressDetail,
  getOrderAddressPhone,
  getOrderAddressRegionText,
  type OrderAddressLike,
} from '../../utils/order-address'
import { submitStaffShipment } from '../../api/ship-submit'

const props = withDefaults(
  defineProps<{
    visible: boolean
    orderId: string
    customerName?: string | null
    customerPhone?: string | null
    /** 已经拼好的「名字 · 品种 · 体重」；一单多狗时由宿主拼成一句 */
    dogSummary?: string | null
    address?: OrderAddressLike | null
    /** 打开时带进来的当前值（重发/改单号时用） */
    initialTrackingNumber?: string | null
    initialActualShippingFee?: number | null
    initialCarrierCode?: string | null
    coverImageUrl?: string | null
    /** 列表页没有地址编辑能力：点「改收货地址」时交给宿主跳转 */
    allowAddressFix?: boolean
    /** 鲜食单 / 补剂单：只影响提交走哪个后台接口，表单本身完全一样 */
    kind?: 'food' | 'supplement'
    /**
     * 地址改过一次就 +1。地址变了，之前那张存根的核对结论就作废，
     * 抽屉要清空重来（补剂详情页改完地址会传这个）。
     */
    addressRevision?: number
  }>(),
  {
    customerName: '',
    customerPhone: '',
    dogSummary: '',
    address: null,
    initialTrackingNumber: '',
    initialActualShippingFee: null,
    initialCarrierCode: '',
    coverImageUrl: '',
    allowAddressFix: false,
    kind: 'food',
    addressRevision: 0,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'shipped',
    payload: {
      orderId: string
      noShipping: boolean
      carrierName: string
      trackingNumber: string
      coverImageUrl: string
    },
  ): void
  (e: 'fix-address'): void
}>()

const carriers = CARRIERS
const selectedCarrierIndex = ref(0)
const trackingNumber = ref('')
/** 实际运费草稿（元，最多两位小数）；必填 */
const actualShippingFeeDraft = ref('')
const shippingType = ref<'NORMAL' | 'NOT_REQUIRED'>('NORMAL')
const isShipping = ref(false)

const addressPhone = computed(() => getOrderAddressPhone(props.address))
const addressLine = computed(
  () =>
    `${getOrderAddressRegionText(props.address)} ${getOrderAddressDetail(props.address)}`.trim(),
)

/**
 * 快递存根识别：状态、结论、手动确认都在这一块。
 * 四项值时一定要和下面对得上（recognizedTrackingNumber / manualConfirmedTracking），
 * 否则「确认完再改号」就绕过了核对。
 */
const receipt = reactive(createReceiptState())

/** 存根块该显示什么，文案统一走 utils/waybill-receipt-view */
const receiptView = computed(() => receiptViewOf(receipt, trackingNumber.value))

function resetForOrder() {
  shippingType.value = 'NORMAL'
  selectedCarrierIndex.value = carrierIndexOf(props.initialCarrierCode || '')
  trackingNumber.value = props.initialTrackingNumber || ''
  actualShippingFeeDraft.value =
    typeof props.initialActualShippingFee === 'number'
      ? props.initialActualShippingFee.toFixed(2)
      : ''
  resetReceiptState(receipt)
}

watch(
  () => props.visible,
  (open) => {
    if (open) resetForOrder()
  },
  { immediate: true },
)

// 地址改过：核对的是旧地址，结论作废，必须重新传存根
watch(
  () => props.addressRevision,
  () => {
    if (props.visible) resetReceiptState(receipt)
  },
)

function handleClose() {
  if (isShipping.value) return
  emit('close')
}

function onCarrierChange(event: any) {
  selectedCarrierIndex.value = Number(event.detail.value || 0)
}

function copyAddress() {
  const content = buildOrderAddressCopyText(props.address)
  if (!content) return
  uni.setClipboardData({
    data: content,
    success: () => {
      uni.showToast({ title: '地址已复制', icon: 'success' })
    },
  })
}

/** 存根识别结果 → 表单三项。对不上时一个都不填。 */
function applyReceipt(summary: {
  carrierName?: string | null
  carrierCode?: string | null
  trackingNumber?: string | null
  shippingFee?: number | null
}) {
  if (summary.carrierCode) {
    selectedCarrierIndex.value = carrierIndexOf(summary.carrierCode)
  }
  if (summary.trackingNumber) {
    trackingNumber.value = summary.trackingNumber
  }
  if (typeof summary.shippingFee === 'number') {
    actualShippingFeeDraft.value = summary.shippingFee.toFixed(2)
  }
}

async function recognizeByUrl(imageUrl: string) {
  if (!props.orderId) return

  markReceiptRecognizing(receipt)

  try {
    const result = await recognizeReceipt({
      imageUrl,
      orderIds: [props.orderId],
    })
    applyRecognizeResult(receipt, result, applyReceipt)
  } catch (error: any) {
    markReceiptFailed(receipt, error?.message || '识别失败，可以手动填写')
  }
}

async function pickReceipt() {
  if (receipt.state === 'recognizing') return

  const chosen: any = await new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: resolve,
      fail: () => resolve(null),
    })
  })

  const filePath = chosen?.tempFilePaths?.[0]
  if (!filePath) return

  // 换了图就是重新来过：上一张的「手动确认」不能带过来
  markReceiptPicked(receipt)

  try {
    const uploaded = await uploadReceiptImage(filePath)
    await recognizeByUrl(uploaded.url)
  } catch (error: any) {
    markReceiptFailed(receipt, error?.message || '上传失败，可以手动填写')
  }
}

/** AI 认不出来 / 没能核对时，员工手动确认一次（留原因，后端会拒掉真对不上的） */
function onManualReceipt() {
  if (!props.orderId) return
  const value = String(trackingNumber.value || '').trim()
  if (!value) {
    uni.showToast({ title: '先在上面填运单号', icon: 'none' })
    return
  }

  uni.showModal({
    title: '手动确认发货',
    editable: true,
    placeholderText: '为什么手动填（例如：存根太糊）',
    success: async (res) => {
      if (!res.confirm) return
      const reason = String(res.content || '').trim()
      if (!reason) {
        uni.showToast({ title: '必须写原因', icon: 'none' })
        return
      }
      try {
        await createManualWaybill({
          orderIds: [props.orderId],
          trackingNumber: value,
          reason,
        })
        markReceiptManualConfirmed(receipt, value)
        uni.showToast({ title: '已确认，可以发货', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '提交失败', icon: 'none' })
      }
    },
  })
}

async function confirmShipping() {
  // 存根没核对通过就不让点（后端还会再验一次，这里只是别让人白填一屏）
  if (shippingType.value === 'NORMAL' && !receiptView.value.canShip) {
    uni.showToast({ title: '先核对快递存根', icon: 'none' })
    return
  }
  if (!props.orderId || isShipping.value) return

  const isNoShipping = shippingType.value === 'NOT_REQUIRED'

  let tracking = ''
  let actualShippingFee: number | undefined

  if (!isNoShipping) {
    tracking = trackingNumber.value.trim()
    if (tracking.length < 5) {
      uni.showToast({ title: '请输入有效物流单号', icon: 'none' })
      return
    }

    // 实际运费：必填，最多两位小数（2026-10-31 起不再选填）
    const feeText = String(actualShippingFeeDraft.value || '').trim()
    if (!feeText) {
      uni.showToast({ title: '请填写实际运费', icon: 'none' })
      return
    }
    if (!/^\d+(\.\d{1,2})?$/.test(feeText)) {
      uni.showToast({ title: '运费最多两位小数，例如 12.50', icon: 'none' })
      return
    }
    actualShippingFee = Number(feeText)
  }

  const orderId = props.orderId
  const carrierName = carriers[selectedCarrierIndex.value].name
  isShipping.value = true
  try {
    // 鲜食 / 补剂走各自的发货接口；正常发货都会顺带把物流上报微信
    const result = await submitStaffShipment(props.kind, orderId, {
      shippingType: isNoShipping ? 'NOT_REQUIRED' : 'NORMAL',
      carrierCode: isNoShipping ? undefined : carriers[selectedCarrierIndex.value].code,
      trackingNumber: isNoShipping ? undefined : tracking,
      actualShippingFee: isNoShipping ? undefined : actualShippingFee,
    })

    if (isNoShipping) {
      emit('shipped', {
        orderId,
        noShipping: true,
        carrierName,
        trackingNumber: '',
        coverImageUrl: props.coverImageUrl || '',
      })
      uni.showToast({ title: '已结案（无需发货）', icon: 'success' })
      emit('close')
      return
    }

    if (result.wechat === 'ok') {
      uni.showToast({ title: '发货成功，已同步微信', icon: 'success' })
    } else if (result.wechat === 'failed') {
      console.error('[StaffShipDrawer] WeChat shipping sync error:', result.wechatMessage)
      // 后台给的是能直接照做的原因（缺电话 / 缺 openid / 微信报错），别只写"失败"
      const reason = String(result.wechatMessage || '').slice(0, 40)
      uni.showToast({
        title: reason ? `发货成功，微信未同步：${reason}` : '发货成功，微信发货同步失败',
        icon: 'none',
      })
    } else {
      uni.showToast({ title: '发货成功（无需同步微信）', icon: 'success' })
    }

    emit('shipped', {
      orderId,
      noShipping: false,
      carrierName,
      trackingNumber: tracking,
      coverImageUrl: props.coverImageUrl || '',
    })
    emit('close')
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '发货失败',
      icon: 'none',
    })
  } finally {
    isShipping.value = false
  }
}
</script>

<style scoped lang="scss">
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}

.modal-panel {
  width: 100%;
  max-height: 82vh;
  overflow-y: auto;
  background-color: #fbfcf7;
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx;
  box-sizing: border-box;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28rpx;
}

.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #26261f;
}

.modal-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  color: #6b6653;
}

// 顶部：寄给谁、哪只狗、寄到哪（2026-11-10）
.ship-recipient {
  margin-bottom: 24rpx;
  padding: 20rpx 22rpx;
  border-radius: 14rpx;
  border: 2rpx solid #e6ecd8;
  background-color: #f2f5ea;
}

.ship-recipient-row {
  display: flex;
  align-items: flex-start;

  & + .ship-recipient-row {
    margin-top: 12rpx;
  }
}

.ship-recipient-label {
  flex: 0 0 68rpx;
  font-size: 24rpx;
  line-height: 38rpx;
  color: #6b6653;
}

.ship-recipient-value {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  line-height: 38rpx;
  color: #26261f;
  word-break: break-all;
}

.ship-recipient-sub {
  margin-left: 10rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.ship-recipient-address {
  flex: 1;
  min-width: 0;
}

.ship-recipient-detail {
  display: block;
  margin-top: 2rpx;
  font-size: 25rpx;
  line-height: 36rpx;
  color: #464b3c;
  word-break: break-all;
}

.ship-recipient-missing {
  color: #b0b4bb;
}

.ship-copy-pill {
  flex: none;
  margin-left: 16rpx;
  padding: 4rpx 18rpx;
  border: 2rpx solid #1e3a2f;
  border-radius: 999rpx;
  background-color: #ffffff;
  font-size: 22rpx;
  line-height: 34rpx;
  color: #1e3a2f;
}

.form-item {
  margin-bottom: 24rpx;
}

.form-label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: #26261f;
  font-weight: 500;
}

.form-input,
.form-picker {
  width: 100%;
  box-sizing: border-box;
  border: 2rpx solid #eef1e2;
  border-radius: 10rpx;
  background-color: #fbfcf7;
  font-size: 28rpx;
  color: #26261f;
}

.form-input,
.form-picker {
  height: 76rpx;
  padding: 0 20rpx;
}

.form-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-arrow {
  color: #6b6653;
}

.ship-type-row { display: flex; gap: 16rpx; }
.ship-type-option {
  flex: 1; height: 72rpx; border-radius: 12rpx; line-height: 72rpx; text-align: center;
  background: #f5f6f8; color: #606266; font-size: 26rpx; border: 2rpx solid transparent;
}
.ship-type-option.active { background: #e8f1ec; color: #1e3a2f; border-color: #1e3a2f; font-weight: 600; }

.address-lock-hint {
  font-size: 26rpx;
  color: #6b6653;
}

.addr-link-row { display: flex; justify-content: flex-end; margin: -8rpx 0 12rpx; }
.addr-link { font-size: 23rpx; color: #2b5040; }

.address-save-btn {
  width: 100%;
  height: 82rpx;
  border-radius: 12rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  font-size: 30rpx;

  &::after {
    border: none;
  }
}
</style>
