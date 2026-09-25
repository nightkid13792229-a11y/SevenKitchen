<template>
  <view class="supplement-labels">
    <!-- 顶部：返回 + 标题 + 订单号。订单号钉在头上，分装时抬眼就能核对是不是这一单 -->
    <view class="header">
      <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
      <view class="nav-bar">
        <view class="back-btn" @tap="goBack">
          <text class="back-icon">←</text>
        </view>
        <text class="header-title">补剂标签</text>
        <view class="header-actions"></view>
      </view>
      <view class="order-strip">
        <text class="order-strip-label">订单</text>
        <text class="order-strip-no">{{ orderNo || '—' }}</text>
      </view>
    </view>

    <!-- 状态栏只占 px，导航和订单条是 rpx，分开撑开才不会在真机上错位 -->
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="header-spacer"></view>

    <!-- 加载中 -->
    <view v-if="loading" class="state-block">
      <text class="state-title">加载中…</text>
      <text class="state-hint">后端正在按分装结果生成标签图，标签多时要等几秒。</text>
    </view>

    <!-- 加载失败：一定要有出口，且后端文案原样显示 -->
    <view v-else-if="loadError" class="state-block">
      <text class="state-title">标签没取到</text>
      <text class="state-error">{{ loadError }}</text>
      <text v-if="packRequired" class="state-hint">请先回订单详情填分装结果，填完再回来打印。</text>
      <view class="state-actions">
        <button class="primary-btn" @tap="fetchLabels">重试</button>
        <button v-if="packRequired" class="secondary-btn" @tap="goToOrderDetail">回订单详情</button>
      </view>
    </view>

    <!-- 加载成功但一张都没有：也算一种"没东西可打"，给重试出口 -->
    <view v-else-if="labels.length === 0" class="state-block">
      <text class="state-title">这张单还没有标签</text>
      <text class="state-hint">正常要等补剂分装完才有标签；如果刚填过分装结果，点重试。</text>
      <view class="state-actions">
        <button class="primary-btn" @tap="fetchLabels">重试</button>
      </view>
    </view>

    <template v-else>
      <!-- 概要：一共几张，已经打了几张 -->
      <view class="card summary-card">
        <view class="summary-main">
          <text class="summary-title">共 {{ labels.length }} 张标签</text>
          <text class="summary-sub">{{ summarySubText }}</text>
        </view>
        <text class="summary-printed">已打印 {{ printedCount }}/{{ labels.length }}</text>
      </view>

      <!-- 打印机 + 打印入口 -->
      <view class="card">
        <view class="printer-row">
          <text class="printer-label">打印机</text>
          <text class="printer-name" :class="{ 'printer-name--off': !printerName }">
            {{ printerName || '未连接' }}
          </text>
          <button class="link-btn" @tap="connectPrinter">连接打印机</button>
        </view>

        <!-- 搜到多台就在这里选；只有一台时 connectPrinter 会直接连，不弹这个列表 -->
        <view v-if="showPrinterList" class="printer-list-inline">
          <view class="printer-list-header">
            <text class="close-btn" @tap="closePrinterList">×</text>
          </view>
          <scroll-view scroll-y class="printer-list">
            <view
              v-for="(printer, index) in availablePrinters"
              :key="index"
              class="printer-item"
              @tap="selectPrinter(printer)"
            >
              <view class="printer-info">
                <text class="printer-item-name">{{ printer.name || '未命名设备' }}</text>
                <text class="printer-item-id">设备ID: {{ printer.deviceId || '未知' }}</text>
              </view>
              <text class="select-icon">→</text>
            </view>
          </scroll-view>
        </view>

        <button class="primary-btn" :disabled="printing" @tap="handlePrintAll">
          {{ printing ? '打印中…' : printAllButtonText }}
        </button>
        <text class="action-hint">
          一张标签一次出纸；打坏某一张，用下面那张的「补打这一张」。
        </text>
      </view>

      <!-- 预览：顺序就是打印顺序，一张一张列出来，跟着后端返回的袋子顺序走 -->
      <view class="label-list">
        <view
          v-for="(label, index) in labels"
          :key="label.labelId || index"
          class="label-card"
        >
          <image
            v-if="previewSrcs[index]"
            class="label-image"
            :src="previewSrcs[index]"
            mode="widthFix"
          />
          <view v-else class="label-image-missing">
            <text class="label-image-missing-text">这张的图片没生成出来</text>
          </view>

          <!-- 第几张标在图下面：刚打完一张时，眼神落在纸和这张图之间，核对有没有漏打最顺 -->
          <view class="label-foot">
            <text class="label-index">{{ index + 1 }} / {{ labels.length }}</text>
            <text class="label-state" :class="stateClass(index)">{{ stateText(index) }}</text>
            <button
              class="secondary-btn label-reprint"
              :disabled="printing"
              @tap="handleReprint(index)"
            >
              补打这一张
            </button>
          </view>
        </view>
      </view>
    </template>

    <!-- 隐藏画布：精臣 SDK 靠它把图片画到标签纸上，页面里必须有 -->
    <canvas
      canvas-id="labelCanvas"
      :style="{ width: CANVAS_WIDTH + 'px', height: CANVAS_HEIGHT + 'px', position: 'fixed', left: '-9999px', top: '0' }"
    ></canvas>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
// 用分包内的本地副本，不用主包那份：精臣 SDK 有 180KB+，
// 它是员工打标签才用得到的能力，不该让每个顾客在首次打开时下载。
// 鲜食那边（staff-production）也是同样的做法。
import jcPrinter from './utils/jcing-printer'
import {
  staffSupplementOrderApi,
  type StaffSupplementLabelImage,
} from '../../api/staff-supplement-orders'
import {
  PRINT_GAP_MS,
  buildPrintProgressTitle,
  classifyLabelPrintError,
  describeLabelLoadError,
  describeLabelPrintFailure,
  isSupplementPackRequiredError,
  type LabelPrintFailure,
} from '../../utils/supplement-label-print'

const CANVAS_ID = 'labelCanvas'
// 尺寸只影响离屏画布，实际纸张 70×100mm 由 jcing-printer 传给 SDK
const CANVAS_WIDTH = 560
const CANVAS_HEIGHT = 800

/**
 * getCurrentInstance() 只在 setup 的同步阶段有效，异步回调里再取就是 null。
 * 打印时要把组件实例交给精臣 SDK 去定位 canvas，所以这里立刻存下来
 * （跟鲜食打印页同一套做法）。
 */
const componentProxy = ref<any>(null)
const instance = getCurrentInstance()
if (instance) {
  componentProxy.value = instance.proxy
}

const statusBarHeight = ref(0)
const orderId = ref('')
const orderNo = ref('')
const brandName = ref('')
const receiverName = ref('')
const labels = ref<StaffSupplementLabelImage[]>([])
const loading = ref(false)
/** 加载失败的展示文案：后端说什么就显示什么，只有网络层失败才由前端组织 */
const loadError = ref('')
/** 预览用的图片地址（临时文件路径，或兜底的 data URI） */
const previewSrcs = ref<string[]>([])

type LabelPrintState = 'idle' | 'printing' | 'done' | 'failed'
const printStates = ref<LabelPrintState[]>([])
const printing = ref(false)

const printerName = ref('')
const availablePrinters = ref<any[]>([])
const showPrinterList = ref(false)

const packRequired = computed(() => isSupplementPackRequiredError(loadError.value))

const printedCount = computed(
  () => printStates.value.filter((state) => state === 'done').length,
)

const summarySubText = computed(() => {
  const who = [brandName.value, receiverName.value].filter(Boolean).join(' · ')
  return who ? `${who} · 每个补剂几袋就打几张` : '每个补剂几袋就打几张'
})

/** 还没打的（含上次打失败的）剩几张 */
const pendingIndexes = computed(() =>
  labels.value
    .map((_, index) => index)
    .filter((index) => printStates.value[index] !== 'done'),
)

const printAllButtonText = computed(() => {
  if (labels.value.length === 0) return '全部打印'
  if (printedCount.value === 0) return '全部打印'
  if (pendingIndexes.value.length === 0) return '重新全部打印'
  return `继续打印剩下的 ${pendingIndexes.value.length} 张`
})

const PRINT_STATE_TEXT: Record<LabelPrintState, string> = {
  idle: '未打印',
  printing: '打印中…',
  done: '已打印',
  failed: '打印失败',
}

function stateText(index: number) {
  return PRINT_STATE_TEXT[printStates.value[index] || 'idle']
}

function stateClass(index: number) {
  return `label-state--${printStates.value[index] || 'idle'}`
}

function setPrintState(index: number, state: LabelPrintState) {
  const next = printStates.value.slice()
  next[index] = state
  printStates.value = next
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractDetail(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: unknown })?.errMsg
  if (typeof errMsg === 'string' && errMsg) return errMsg
  return ''
}

/* ============================ 加载 ============================ */

async function fetchLabels() {
  if (!orderId.value) {
    loadError.value = '缺少订单参数，请从补剂订单详情页进入'
    return
  }

  loading.value = true
  loadError.value = ''
  clearPreviewFiles()

  try {
    const res = await staffSupplementOrderApi.labelImages(orderId.value)
    if (res.code === 0 && res.data) {
      orderNo.value = res.data.orderNo || ''
      brandName.value = res.data.brandName || ''
      receiverName.value = res.data.receiverName || ''
      labels.value = res.data.labels || []
      printStates.value = labels.value.map(() => 'idle' as LabelPrintState)
      buildPreviewSrcs()

      // 单张图缺了不阻断整页（能打的先打），但要说清楚是哪几张缺了
      const missing = labels.value.filter((label) => !label.imageBase64).length
      if (missing > 0) {
        uni.showToast({ title: `有 ${missing} 张图片没生成出来`, icon: 'none' })
      }
    } else {
      loadError.value = res.message || '标签图片加载失败，请重试'
    }
  } catch (error) {
    console.error('[SupplementLabels] 标签图片加载失败:', error)
    loadError.value = describeLabelLoadError(error)
  } finally {
    loading.value = false
  }
}

/**
 * base64 先落成临时文件再交给 <image>：跟鲜食打印页一个做法。
 * 长列表里直接塞几十 KB 的 data URI 会被反复解码，落成文件只解一次；
 * 离开页面还能按路径统一删掉，不占小程序用户目录。
 * 真机上写文件极少失败，失败了退回 data URI，至少保证还能看。
 */
function buildPreviewSrcs() {
  const dir = previewDir()
  // 拿不到可写目录或文件系统就用 data URI 兜底，预览不能因为环境差异变空白
  let fs: any = null
  if (dir) {
    try {
      fs = uni.getFileSystemManager()
    } catch (error) {
      fs = null
    }
  }

  const srcs: string[] = []
  for (let index = 0; index < labels.value.length; index++) {
    const base64 = labels.value[index].imageBase64 || ''
    if (!base64) {
      srcs.push('')
      continue
    }
    if (!dir || !fs) {
      srcs.push(`data:image/png;base64,${base64}`)
      continue
    }

    const filePath = `${dir}/supplement_label_${index}.png`
    try {
      fs.writeFileSync(filePath, base64, 'base64')
      srcs.push(filePath)
    } catch (error) {
      console.error('[SupplementLabels] 预览临时文件写入失败，改用 base64 预览:', error)
      srcs.push(`data:image/png;base64,${base64}`)
    }
  }

  previewSrcs.value = srcs
}

function previewDir(): string {
  // 非微信端（比如 H5 里调试）没有 wx.env，返回空串让调用方走 base64 兜底
  try {
    const env = typeof wx !== 'undefined' ? (wx as any).env : undefined
    return typeof env?.USER_DATA_PATH === 'string' ? env.USER_DATA_PATH : ''
  } catch (error) {
    return ''
  }
}

function clearPreviewFiles() {
  const files = previewSrcs.value
  previewSrcs.value = []
  if (files.length === 0) return

  let fs: any = null
  try {
    fs = uni.getFileSystemManager()
  } catch (error) {
    return
  }

  for (const src of files) {
    if (!src || src.startsWith('data:')) continue
    try {
      fs.unlinkSync(src)
    } catch (error) {
      // 文件可能已被系统清掉，删不掉不影响使用
    }
  }
}

/* ============================ 打印机 ============================ */

async function autoConnectPrinter() {
  // 仓库基本固定用同一台打印机，连过一次后进页面自动接上，省一步
  try {
    const connected = await jcPrinter.autoConnect()
    if (connected) printerName.value = jcPrinter.getConnName()
  } catch (error) {
    console.error('[SupplementLabels] 自动连接打印机失败:', error)
  }
}

async function connectPrinter() {
  try {
    // 直接搜索：蓝牙初始化交给 SDK，提前调蓝牙接口反而报 not init
    const printers = await jcPrinter.scanPrinter()

    if (printers.length === 0) {
      showPairingGuide()
      return
    }

    availablePrinters.value = printers

    if (printers.length === 1) {
      if (await jcPrinter.connect(printers[0].name)) {
        printerName.value = printers[0].name
      }
      return
    }

    showPrinterList.value = true
  } catch (error) {
    console.error('[SupplementLabels] 连接打印机失败:', error)
    const message = extractDetail(error)
    if (/bluetooth|蓝牙|permission|auth/i.test(message)) {
      uni.showModal({
        title: '蓝牙权限未开启',
        content: '请确保：\n1. 手机蓝牙已开启\n2. 微信有蓝牙使用权限\n\n设置路径：\n微信 → 我 → 设置 → 通用 → 蓝牙',
        showCancel: false,
      })
    } else {
      uni.showToast({ title: '连接失败，请重试', icon: 'none' })
    }
  }
}

function closePrinterList() {
  showPrinterList.value = false
}

async function selectPrinter(printer: any) {
  closePrinterList()
  const success = await jcPrinter.connect(printer.name)
  if (success) {
    printerName.value = printer.name
  } else {
    uni.showToast({ title: '连接失败，请重试', icon: 'none' })
  }
}

function showPairingGuide() {
  uni.showModal({
    title: '没搜到打印机',
    content: '按顺序检查：\n1. 打印机已开机（绿灯常亮）\n2. 打印机在配对状态（绿灯快闪）\n3. 手机蓝牙已打开，距离 2 米以内\n4. 打印机没被别的手机/电脑连着',
    confirmText: '重新搜索',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) void connectPrinter()
    },
  })
}

/* ============================ 打印 ============================ */

function ensurePrinter(): boolean {
  if (jcPrinter.isConnectedPrinter()) return true
  uni.showModal({
    title: '打印机未连接',
    content: '先点「连接打印机」把打印机连上，再打印。',
    showCancel: false,
    confirmText: '知道了',
  })
  return false
}

function handlePrintAll() {
  if (printing.value || labels.value.length === 0) return
  if (!ensurePrinter()) return

  const pending = pendingIndexes.value

  // 全打过了就明说，别让人以为按钮坏了；要整批重打也留一个出口
  if (pending.length === 0) {
    uni.showModal({
      title: '已经都打印过了',
      content: `这 ${labels.value.length} 张都打过一遍了。要整批再打一次吗？（只是贴坏单张的话，用那张的「补打这一张」更省纸）`,
      confirmText: '整批重打',
      success: (res) => {
        if (res.confirm) {
          void runPrintQueue(labels.value.map((_, index) => index))
        }
      },
    })
    return
  }

  uni.showModal({
    title: '全部打印',
    content: `本次按顺序打印 ${pending.length} 张${pending.length < labels.value.length ? '（已打印过的会跳过）' : ''}。\n每张内容不同，会一张一张出纸，中途别退页面。`,
    confirmText: '开始打印',
    success: (res) => {
      if (res.confirm) void runPrintQueue(pending)
    },
  })
}

async function runPrintQueue(indexes: number[]) {
  if (printing.value || indexes.length === 0) return
  printing.value = true

  try {
    for (let cursor = 0; cursor < indexes.length; cursor++) {
      const index = indexes[cursor]
      // 进度用第几张/共几张（绝对位置），现场核对到第几张了一眼能对上
      const failure = await printOne(index, buildPrintProgressTitle(index, labels.value.length))

      if (failure) {
        // 中断：后面的先不打，把原因说清楚，处理完再点「全部打印」会从没打的接着打
        showPrintFailure(failure, indexes.length - cursor - 1)
        return
      }

      // 两张之间停一下：上一个任务没吐完就发下一个，精臣 SDK 会报"SDK忙"
      if (cursor < indexes.length - 1) await sleep(PRINT_GAP_MS)
    }

    uni.hideLoading()
    uni.showToast({ title: `已打印 ${indexes.length} 张`, icon: 'success' })
  } finally {
    printing.value = false
    uni.hideLoading()
  }
}

function handleReprint(index: number) {
  if (printing.value) return
  if (!ensurePrinter()) return
  void runSingleReprint(index)
}

async function runSingleReprint(index: number) {
  printing.value = true
  try {
    const failure = await printOne(index, `补打中 ${index + 1}/${labels.value.length}`)
    if (failure) {
      showPrintFailure(failure, 0)
      return
    }
    uni.hideLoading()
    uni.showToast({ title: `第 ${index + 1} 张已补打`, icon: 'success' })
  } finally {
    printing.value = false
    uni.hideLoading()
  }
}

/**
 * 打一张，失败时返回"哪种失败"。
 *
 * count 固定传 1：每张标签内容不同（第几袋/共几袋），
 * count 是"同一张打几份"的意思，合并传只会打出重复内容的纸。
 */
async function printOne(index: number, progressTitle: string): Promise<LabelPrintFailure | null> {
  const label = labels.value[index]

  // 后端没给这张出图属于"图片生成失败"，跟打印机无关，别让人去折腾打印机
  if (!label?.imageBase64) {
    setPrintState(index, 'failed')
    return describeLabelPrintFailure('image-missing', index, labels.value.length)
  }

  if (!jcPrinter.isConnectedPrinter()) {
    return describeLabelPrintFailure('not-connected', index, labels.value.length)
  }

  setPrintState(index, 'printing')
  // 先 hide 再 show：微信的 showLoading 重复调用不保证刷新文案，
  // 不这么做进度就会一直停在「打印中 1/12」
  uni.hideLoading()
  uni.showLoading({ title: progressTitle, mask: true })

  const startedAt = Date.now()
  try {
    await jcPrinter.printLabelFromImage(label.imageBase64, 1, CANVAS_ID, componentProxy.value)

    // jcing-printer 的 20 秒兜底超时是 resolve 而不是 reject（不让人卡在转圈里），
    // 所以超时只能靠耗时认出来
    const kind = classifyLabelPrintError(null, Date.now() - startedAt)
    if (kind === 'timeout') {
      setPrintState(index, 'failed')
      return describeLabelPrintFailure('timeout', index, labels.value.length)
    }

    setPrintState(index, 'done')
    return null
  } catch (error) {
    console.error('[SupplementLabels] 打印失败:', error)
    setPrintState(index, 'failed')
    const kind = classifyLabelPrintError(error, Date.now() - startedAt)
    return describeLabelPrintFailure(kind, index, labels.value.length, extractDetail(error))
  }
}

function showPrintFailure(failure: LabelPrintFailure, remaining: number) {
  uni.hideLoading()
  const blocks = [
    failure.hint,
    remaining > 0 ? `后面还有 ${remaining} 张没打，处理完点「全部打印」会接着打。` : '',
    failure.detail ? `技术信息：${failure.detail}` : '',
  ].filter(Boolean)

  uni.showModal({
    title: failure.title,
    content: blocks.join('\n\n'),
    showCancel: false,
    confirmText: '知道了',
  })
}

/* ============================ 导航 ============================ */

function goToOrderDetail() {
  // 正常是从订单详情进来的，退回去就行；扫码/分享直接进来的没有上一页，改用重定向
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  uni.redirectTo({ url: `/pages/staff-supplement-orders/detail?id=${orderId.value}` })
}

function goBack() {
  uni.navigateBack()
}

onLoad((options) => {
  const info = uni.getSystemInfoSync()
  statusBarHeight.value = info.statusBarHeight || 0
  orderId.value = (options?.id as string) || ''
  void fetchLabels()
})

onReady(() => {
  // 页面渲染完再自动连：打印前组件代理和 canvas 都已就位
  void autoConnectPrinter()
})

onUnload(() => {
  clearPreviewFiles()
})
</script>

<style lang="scss" scoped>
.supplement-labels {
  min-height: 100vh;
  background-color: #f7f8f2;
  padding-bottom: 60rpx;
}

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: #1e3a2f;
}

.nav-bar {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 24rpx;
}

.back-btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  font-size: 40rpx;
  color: #fbfcf7;
}

.header-title {
  flex: 1;
  text-align: center;
  font-size: 34rpx;
  font-weight: 600;
  color: #fbfcf7;
}

.header-actions {
  width: 60rpx;
}

.order-strip {
  display: flex;
  align-items: center;
  padding: 0 32rpx 16rpx;
}

.order-strip-label {
  margin-right: 12rpx;
  font-size: 24rpx;
  color: #b08d4f;
}

.order-strip-no {
  font-size: 26rpx;
  color: #fbfcf7;
}

.header-spacer {
  height: 144rpx;
}

.state-block {
  padding: 120rpx 48rpx;
  text-align: center;
}

.state-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.state-error {
  display: block;
  margin-top: 20rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: #a97c33;
}

.state-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 25rpx;
  line-height: 1.6;
  color: #968f6d;
}

.state-actions {
  margin-top: 32rpx;
}

.card {
  margin: 24rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background-color: #ffffff;
}

.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-main {
  flex: 1;
}

.summary-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.summary-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #968f6d;
}

.summary-printed {
  font-size: 24rpx;
  color: #a97c33;
}

.printer-row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.printer-label {
  width: 120rpx;
  font-size: 26rpx;
  color: #968f6d;
}

.printer-name {
  flex: 1;
  font-size: 26rpx;
  color: #26261f;
}

.printer-name--off {
  color: #a97c33;
}

.link-btn {
  padding: 0 20rpx;
  height: 60rpx;
  line-height: 60rpx;
  border: none;
  border-radius: 10rpx;
  background-color: #f2f4ea;
  color: #2b5040;
  font-size: 24rpx;
  margin: 0;
}

.printer-list-inline {
  margin-bottom: 20rpx;
  border-radius: 12rpx;
  background-color: #f7f8f2;
  overflow: hidden;
}

.printer-list-header {
  display: flex;
  justify-content: flex-end;
  padding: 8rpx 20rpx;
}

.close-btn {
  font-size: 40rpx;
  line-height: 1;
  color: #6b6653;
}

.printer-list {
  max-height: 300px;
}

.printer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  border-top: 1rpx solid #e5e8d4;
}

.printer-info {
  flex: 1;
}

.printer-item-name {
  font-size: 28rpx;
  color: #26261f;
}

.printer-item-id {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #968f6d;
}

.select-icon {
  font-size: 32rpx;
  color: #2b5040;
}

.primary-btn {
  margin-top: 24rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 12rpx;
  background-color: #1e3a2f;
  color: #fbfcf7;
  font-size: 30rpx;
}

.primary-btn[disabled] {
  opacity: 0.6;
}

.secondary-btn {
  margin-top: 20rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 12rpx;
  background-color: #f2f4ea;
  color: #2b5040;
  font-size: 28rpx;
}

.secondary-btn[disabled] {
  opacity: 0.6;
}

.state-actions .secondary-btn {
  margin-top: 16rpx;
}

.action-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #968f6d;
}

.label-list {
  padding: 0 24rpx;
}

.label-card {
  margin-bottom: 24rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background-color: #ffffff;
}

.label-foot {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
}

.label-index {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.label-reprint {
  margin: 0 0 0 16rpx;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 24rpx;
  font-size: 24rpx;
}

.label-state {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.label-state--idle {
  background-color: #f2f4ea;
  color: #968f6d;
}

.label-state--printing {
  background-color: #eef3ea;
  color: #2b5040;
}

.label-state--done {
  background-color: #eef3ea;
  color: #2b5040;
}

.label-state--failed {
  background-color: #fdf4e3;
  color: #a97c33;
}

.label-image {
  width: 100%;
  border-radius: 12rpx;
  background-color: #f7f8f2;
}

.label-image-missing {
  padding: 80rpx 24rpx;
  border-radius: 12rpx;
  border: 1rpx dashed #d8bc85;
  text-align: center;
}

.label-image-missing-text {
  font-size: 26rpx;
  color: #a97c33;
}
</style>
