<template>
  <view class="batch-ship">
    <view v-if="loading" class="loading">加载中...</view>

    <block v-else>
      <!-- 汇总 -->
      <view class="summary">
        <text class="summary-title">{{ orders.length }} 单 · {{ packages.length }} 个包裹</text>
        <view class="metrics">
          <view class="metric">
            <text class="m-v">{{ totalBags }}</text>
            <text class="m-l">总袋数</text>
          </view>
          <view class="metric">
            <text class="m-v">{{ formatKg(totalWeightG) }}</text>
            <text class="m-l">总净重</text>
          </view>
          <view class="metric">
            <text class="m-v">{{ formatAmount(totalFee) }}</text>
            <text class="m-l">运费合计 ¥</text>
          </view>
        </view>
      </view>

      <!-- 每个包裹 -->
      <view v-for="(pkg, pIndex) in packages" :key="pIndex" class="pkg-card">
        <view class="pkg-head">
          <text class="pkg-title">包裹 {{ pIndex + 1 }}</text>
          <view class="pkg-head-right">
            <text class="pkg-fee">¥{{ formatAmount(pkg.fee) }}</text>
            <text v-if="packages.length > 1" class="pkg-remove" @tap="removePackage(pIndex)">删除</text>
          </view>
        </view>

        <view v-for="row in rows" :key="row.key" class="row">
          <view class="row-main">
            <text class="row-name">{{ row.orderLabel }}</text>
            <text class="row-spec">{{ row.specLabel }} · 共 {{ row.totalBags }} 袋 · 剩 {{ remainingOf(row) }} 袋</text>
          </view>
          <view class="stepper">
            <text class="step-btn" @tap="step(pIndex, row, -1)">−</text>
            <text class="step-val">{{ bagsOf(pIndex, row) }}</text>
            <text class="step-btn" @tap="step(pIndex, row, 1)">＋</text>
            <text class="step-unit">袋</text>
          </view>
        </view>

        <WaybillReceiptBlock
          :view="receiptViewOf(pkg)"
          :busy="pkg.receipt.state === 'recognizing'"
          :has-image="pkg.receipt.hasImage"
          @pick="pickReceiptFor(pIndex)"
          @manual="onManualReceipt(pIndex)"
        />

        <view class="fields">
          <view class="field">
            <text class="k">快递公司</text>
            <picker
              mode="selector"
              :range="carriers"
              range-key="name"
              :value="pkg.carrierIndex"
              @change="onCarrierChange(pIndex, $event)"
            >
              <text class="v">{{ carriers[pkg.carrierIndex].name }} ▾</text>
            </picker>
          </view>
          <view class="field">
            <text class="k">运单号</text>
            <input class="v-input" v-model="pkg.tracking" placeholder="请输入运单号" :maxlength="64" />
          </view>
          <view class="field">
            <text class="k">箱型</text>
            <picker
              mode="selector"
              :range="boxOptions"
              range-key="name"
              :value="pkg.boxIndex"
              @change="onBoxChange(pIndex, $event)"
            >
              <text class="v">{{ boxOptions[pkg.boxIndex]?.name || '按重量推荐' }} ▾</text>
            </picker>
          </view>
          <view class="field">
            <text class="k">包裹运费</text>
            <input class="v-input price" v-model="pkg.fee" type="digit" placeholder="实付多少" :maxlength="8" />
          </view>
        </view>
      </view>

      <view class="add-pkg" @tap="addPackage">＋ 再拆一个包裹</view>
      <view class="hint">
        系统不判断该不该拆：装几包、哪几袋进哪包，由你决定。
        运费按每包里各单的净重占比分摊。
      </view>
    </block>

    <view class="bottom">
      <view class="bottom-info">
        <text class="bottom-count">{{ packages.length }} 个包裹 · 运费 {{ formatAmount(totalFee) }}</text>
        <text class="bottom-hint" :class="{ warn: unassignedBags > 0 }">
          {{ unassignedBags > 0 ? `还有 ${unassignedBags} 袋没装` : '袋数已分配完' }}
        </text>
      </view>
      <button class="bottom-btn" :class="{ 'is-disabled': submitting || loading }" :disabled="submitting || loading" @tap="submit">
        {{ submitting ? '提交中...' : '确认发货' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { CARRIERS, carrierIndexOf } from '../../constants/carriers'
import WaybillReceiptBlock from '../../components/shipping/WaybillReceiptBlock.vue'
import { buildReceiptView, type ReceiptView } from '../../utils/waybill-receipt-view'
import {
  createManualWaybill,
  recognizeReceipt,
  uploadReceiptImage,
  type ReceiptConflict,
} from '../../api/waybillReceipt'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

interface PlanRow {
  specG: number
  bags: number
}

interface PackageReceiptState {
  state: 'idle' | 'recognizing' | 'match' | 'unknown' | 'mismatch' | 'duplicate' | 'failed'
  carrierName: string
  trackingNumber: string
  fee: number | null
  conflicts: ReceiptConflict[]
  duplicateLabel: string
  message: string
  hasImage: boolean
  manualConfirmed: boolean
}

interface PackageState {
  carrierIndex: number
  /** 0 = 按重量推荐；1..n = boxOptions 里的箱型 */
  boxIndex: number
  tracking: string
  fee: string
  /** rowKey → 这包里装了几袋 */
  bags: Record<string, number>
  /** 这包的快递存根识别状态（2026-11-10）：一包一张存根，互不影响 */
  receipt: PackageReceiptState
}

function emptyReceipt(): PackageReceiptState {
  return {
    state: 'idle',
    carrierName: '',
    trackingNumber: '',
    fee: null,
    conflicts: [],
    duplicateLabel: '',
    message: '',
    hasImage: false,
    manualConfirmed: false,
  }
}

// 承运商清单统一到 constants/carriers.ts（2026-11-10）
const carriers = CARRIERS

const loading = ref(true)
const submitting = ref(false)
const orders = ref<any[]>([])
const rows = ref<
  Array<{
    key: string
    orderId: string
    orderLabel: string
    specG: number
    totalBags: number
    specLabel: string
  }>
>([])
const packages = ref<PackageState[]>([])
const boxOptions = ref<Array<{ id: string; name: string; productModel?: string }>>([
  { id: '', name: '按重量推荐' },
])

onLoad(async (options: any) => {
  try {
    const res: any = await request({ url: '/staff/shipping/box-options', method: 'GET' })
    boxOptions.value = [
      { id: '', name: '按重量推荐' },
      ...(Array.isArray(res) ? res : []),
    ]
  } catch {
    boxOptions.value = [{ id: '', name: '按重量推荐' }]
  }
  const ids = String(options?.orderIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    uni.showToast({ title: '没有选中订单', icon: 'none' })
    loading.value = false
    return
  }

  try {
    const details = await Promise.all(
      ids.map((id) => request({ url: `/admin/orders/${id}`, method: 'GET' })),
    )
    orders.value = details.map((item: any) => item?.data ?? item)
    buildRows()
    resetPackages()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '订单加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
})

/** 把每张订单的分装方案拍平成「订单 × 规格」的行 */
function buildRows() {
  const built: typeof rows.value = []
  for (const order of orders.value) {
    const items = Array.isArray(order?.items) ? order.items : []
    const label =
      items[0]?.dog?.name ||
      order?.dog?.name ||
      items[0]?.recipeSnapshot?.name ||
      order?.orderNo ||
      order?.id

    for (const item of items) {
      const plan: PlanRow[] = Array.isArray(item?.packagePlan) && item.packagePlan.length > 0
        ? item.packagePlan.map((row: any) => ({
            specG: Math.floor(Number(row.packageSpecG)),
            bags: Math.floor(Number(row.packageCount)),
          }))
        : [
            {
              specG: Math.floor(Number(item?.packageSpecG) || 0),
              bags: Math.floor(Number(item?.packageCount) || 0),
            },
          ]

      for (const row of plan) {
        if (row.specG < 1 || row.bags < 1) continue
        const key = `${order.id}::${row.specG}`
        const existing = built.find((item) => item.key === key)
        if (existing) {
          // 多道菜同一个规格：合成一行，别让两行共用一个 key 互相覆盖
          existing.totalBags += row.bags
          continue
        }
        built.push({
          key,
          orderId: order.id,
          orderLabel: label,
          specG: row.specG,
          totalBags: row.bags,
          specLabel: `${row.specG}g`,
        })
      }
    }
  }
  rows.value = built
}

/** 默认只有 1 个包裹，装着全部货 */
function resetPackages() {
  const bags: Record<string, number> = {}
  for (const row of rows.value) {
    bags[row.key] = row.totalBags
  }
  packages.value = [
    {
      carrierIndex: 0,
      boxIndex: 0,
      tracking: '',
      fee: '',
      bags,
      receipt: emptyReceipt(),
    },
  ]
}

function addPackage() {
  if (packages.value.length >= 6) {
    uni.showToast({ title: '一票最多 6 个包裹', icon: 'none' })
    return
  }
  packages.value.push({
    carrierIndex: 0,
    boxIndex: 0,
    tracking: '',
    fee: '',
    bags: {},
    receipt: emptyReceipt(),
  })
}

function removePackage(index: number) {
  if (packages.value.length <= 1) return
  const [removed] = packages.value.splice(index, 1)
  // 删掉的包裹里的袋退回到第 1 个包裹，免得凭空少货
  const target = packages.value[0]
  for (const key of Object.keys(removed.bags)) {
    target.bags[key] = (target.bags[key] || 0) + removed.bags[key]
  }
}

function bagsOf(index: number, row: { key: string }) {
  return packages.value[index]?.bags[row.key] || 0
}

function assignedTotal(row: { key: string }) {
  return packages.value.reduce((sum, pkg) => sum + (pkg.bags[row.key] || 0), 0)
}

function remainingOf(row: { key: string; totalBags: number }) {
  return row.totalBags - assignedTotal(row)
}

function step(index: number, row: { key: string; totalBags: number }, delta: number) {
  const pkg = packages.value[index]
  if (!pkg) return
  const current = pkg.bags[row.key] || 0

  if (delta > 0) {
    if (assignedTotal(row) >= row.totalBags) {
      uni.showToast({ title: '这单的袋已经装完了', icon: 'none' })
      return
    }
    pkg.bags[row.key] = current + 1
    return
  }

  if (current <= 0) return
  pkg.bags[row.key] = current - 1
}

function onBoxChange(index: number, event: any) {
  packages.value[index].boxIndex = Number(event.detail.value || 0)
}

function onCarrierChange(index: number, event: any) {
  packages.value[index].carrierIndex = Number(event.detail.value || 0)
}

const totalBags = computed(() =>
  rows.value.reduce((sum, row) => sum + row.totalBags, 0),
)
const totalWeightG = computed(() =>
  rows.value.reduce((sum, row) => sum + row.specG * row.totalBags, 0),
)
const unassignedBags = computed(() =>
  rows.value.reduce((sum, row) => sum + remainingOf(row), 0),
)
const totalFee = computed(() =>
  packages.value.reduce((sum, pkg) => {
    const value = Number(pkg.fee)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0),
)

function formatAmount(value: number) {
  return Number(value || 0).toFixed(2)
}

function formatKg(grams: number) {
  return (Number(grams || 0) / 1000).toFixed(2)
}

/** 这包的存根块该显示什么（文案统一走 utils/waybill-receipt-view） */
function receiptViewOf(pkg: PackageState): ReceiptView {
  return buildReceiptView({
    state: pkg.receipt.state,
    carrierName: pkg.receipt.carrierName || null,
    trackingNumber: pkg.tracking || pkg.receipt.trackingNumber || null,
    recognizedTrackingNumber: pkg.receipt.trackingNumber || null,
    shippingFee: pkg.receipt.fee,
    conflicts: pkg.receipt.conflicts,
    duplicateLabel: pkg.receipt.duplicateLabel || null,
    manualConfirmed: pkg.receipt.manualConfirmed,
    message: pkg.receipt.message || null,
  })
}

/** 一票里所有订单：识别时一起传，落库的核对记录能覆盖这一票的每张单 */
function shipmentOrderIds(): string[] {
  return Array.from(new Set(rows.value.map((row) => row.orderId)))
}

async function recognizeFor(index: number, imageUrl: string) {
  const pkg = packages.value[index]
  if (!pkg) return

  pkg.receipt.state = 'recognizing'
  pkg.receipt.message = ''

  try {
    const result = await recognizeReceipt({
      imageUrl,
      orderIds: shipmentOrderIds(),
    })

    pkg.receipt.carrierName = result.receipt?.carrierName || ''
    pkg.receipt.trackingNumber = result.receipt?.trackingNumber || ''
    pkg.receipt.fee = result.receipt?.shippingFee ?? null
    pkg.receipt.conflicts = result.match.conflicts || []
    pkg.receipt.duplicateLabel = result.match.duplicate?.label || ''

    const status = result.match.status
    if (status === 'match' || status === 'unknown') {
      pkg.receipt.state = status
      if (result.receipt?.carrierCode) {
        pkg.carrierIndex = carrierIndexOf(result.receipt.carrierCode)
      }
      if (result.receipt?.trackingNumber) {
        pkg.tracking = result.receipt.trackingNumber
      }
      if (typeof result.receipt?.shippingFee === 'number') {
        pkg.fee = result.receipt.shippingFee.toFixed(2)
      }
      return
    }

    if (status === 'mismatch' || status === 'duplicate') {
      pkg.receipt.state = status
      return
    }

    pkg.receipt.state = 'failed'
    pkg.receipt.message = status === 'not_waybill' ? '这张图里没找到运单号' : ''
  } catch (error: any) {
    pkg.receipt.state = 'failed'
    pkg.receipt.message = error?.message || '识别失败，可以手动填写'
  }
}

async function pickReceiptFor(index: number) {
  const pkg = packages.value[index]
  if (!pkg || pkg.receipt.state === 'recognizing') return

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

  pkg.receipt.hasImage = true
  pkg.receipt.state = 'recognizing'

  try {
    const uploaded = await uploadReceiptImage(filePath)
    await recognizeFor(index, uploaded.url)
  } catch (error: any) {
    pkg.receipt.state = 'failed'
    pkg.receipt.message = error?.message || '上传失败，可以手动填写'
  }
}

function onManualReceipt(index: number) {
  const pkg = packages.value[index]
  if (!pkg) return

  const value = String(pkg.tracking || '').trim()
  if (!value) {
    uni.showToast({ title: `先填包裹 ${index + 1} 的单号`, icon: 'none' })
    return
  }

  uni.showModal({
    title: `手动确认包裹 ${index + 1}`,
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
          orderIds: shipmentOrderIds(),
          trackingNumber: value,
          reason,
        })
        pkg.receipt.manualConfirmed = true
        pkg.receipt.state = pkg.receipt.hasImage ? 'unknown' : 'failed'
        uni.showToast({ title: '已确认，可以发货', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '提交失败', icon: 'none' })
      }
    },
  })
}

async function submit() {
  if (submitting.value) return

  if (unassignedBags.value > 0) {
    uni.showToast({ title: `还有 ${unassignedBags.value} 袋没装`, icon: 'none' })
    return
  }
  if (unassignedBags.value < 0) {
    uni.showToast({ title: '袋数分多了，检查一下', icon: 'none' })
    return
  }

  for (let i = 0; i < packages.value.length; i += 1) {
    const pkg = packages.value[i]
    if (pkg.tracking.trim().length < 5) {
      uni.showToast({ title: `包裹 ${i + 1} 的运单号太短`, icon: 'none' })
      return
    }
    const feeText = String(pkg.fee || '').trim()
    if (!/^\d+(\.\d{1,2})?$/.test(feeText)) {
      uni.showToast({ title: `包裹 ${i + 1} 的运费填一下（两位小数）`, icon: 'none' })
      return
    }
    const used = Object.values(pkg.bags).some((value) => value > 0)
    if (!used) {
      uni.showToast({ title: `包裹 ${i + 1} 是空的`, icon: 'none' })
      return
    }
    // 存根硬锁（2026-11-10）：这一包的号必须是对着这单收货人核过的
    if (!receiptViewOf(pkg).canShip) {
      uni.showToast({ title: `包裹 ${i + 1} 的存根还没核对通过`, icon: 'none' })
      return
    }
  }

  const payload = {
    // 硬锁：服务端要能查到每个包裹每个号都核过
    enforceWaybillCheck: true,
    packages: packages.value.map((pkg, index) => ({
      carrierCode: carriers[pkg.carrierIndex].code,
      trackingNumber: pkg.tracking.trim(),
      actualShippingFee: Number(pkg.fee),
      boxIngredientId: boxOptions.value[pkg.boxIndex]?.id || undefined,
      items: rows.value
        .filter((row) => (pkg.bags[row.key] || 0) > 0)
        .map((row) => ({
          orderId: row.orderId,
          specG: row.specG,
          bags: pkg.bags[row.key],
        })),
    })),
  }

  submitting.value = true
  try {
    await request({ url: '/admin/order-shipments', method: 'POST', data: payload })
    uni.showToast({ title: '已发货', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 600)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '发货失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.batch-ship {
  min-height: 100vh;
  padding: 20rpx 24rpx 200rpx;
  background: #f4f5f3;
  box-sizing: border-box;
}
.loading { padding-top: 200rpx; text-align: center; font-size: 26rpx; color: #909399; }

.summary { padding: 26rpx; border-radius: 20rpx; background: #23483c; margin-bottom: 20rpx; }
.summary-title { display: block; font-size: 34rpx; font-weight: 700; color: #fff; }
.metrics { display: flex; gap: 12rpx; margin-top: 20rpx; }
.metric { flex: 1; padding: 12rpx 8rpx; border-radius: 14rpx; background: rgba(255, 255, 255, 0.12); text-align: center; }
.m-v { display: block; font-size: 30rpx; font-weight: 700; color: #fff; }
.m-l { display: block; margin-top: 4rpx; font-size: 20rpx; color: rgba(255, 255, 255, 0.68); }

.pkg-card { padding: 22rpx; border-radius: 20rpx; background: #fff; margin-bottom: 20rpx; }
.pkg-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.pkg-title { font-size: 28rpx; font-weight: 700; color: #1f2d27; }
.pkg-head-right { display: flex; align-items: center; gap: 16rpx; }
.pkg-fee { font-size: 24rpx; color: #2b5040; font-weight: 700; }
.pkg-remove { font-size: 22rpx; color: #c0392b; }

.row { display: flex; align-items: center; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx dashed #f0f2f0; }
.row:last-of-type { border-bottom: none; }
.row-main { flex: 1; }
.row-name { display: block; font-size: 26rpx; color: #1f2d27; }
.row-spec { display: block; margin-top: 4rpx; font-size: 22rpx; color: #909399; }

.stepper { display: flex; align-items: center; gap: 14rpx; }
.step-btn {
  width: 52rpx; height: 52rpx; border-radius: 50%;
  background: #f4f6f4; border: 1rpx solid #e2e7e3; color: #2b5040;
  font-size: 30rpx; text-align: center; line-height: 50rpx;
}
.step-val { min-width: 56rpx; text-align: center; font-size: 28rpx; font-weight: 700; }
.step-unit { font-size: 22rpx; color: #909399; }

.fields { margin-top: 16rpx; padding-top: 8rpx; border-top: 1rpx solid #f1f3f1; }
.field { display: flex; align-items: center; justify-content: space-between; padding: 14rpx 0; font-size: 26rpx; }
.field .k { color: #909399; }
.field .v { color: #1f2d27; font-weight: 600; }
.v-input { text-align: right; font-size: 26rpx; color: #1f2d27; width: 360rpx; }
.v-input.price { color: #b06a1f; font-weight: 700; }

.add-pkg {
  padding: 26rpx; border-radius: 20rpx; border: 1rpx dashed #c6d0c9;
  background: #fbfcfb; text-align: center; font-size: 26rpx; color: #2b5040; font-weight: 600;
}
.hint { margin-top: 16rpx; padding: 0 8rpx; font-size: 22rpx; line-height: 1.6; color: #909399; }

.bottom {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18rpx 24rpx 34rpx; background: #fff; border-top: 1rpx solid #eef0ee;
}
.bottom-info { display: flex; flex-direction: column; }
.bottom-count { font-size: 24rpx; color: #1f2d27; font-weight: 600; }
.bottom-hint { margin-top: 4rpx; font-size: 20rpx; color: #909399; }
.bottom-hint.warn { color: #b06a1f; }
.bottom-btn {
  margin: 0; padding: 0 44rpx; height: 76rpx; line-height: 76rpx;
  border-radius: 38rpx; background: #23483c; color: #fff; font-size: 28rpx;
}
.bottom-btn.is-disabled { background: #c9d2cc; }
</style>
