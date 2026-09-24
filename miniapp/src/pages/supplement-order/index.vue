<template>
  <view class="page">
    <!--
      空态：2026-09-22 补上出口。
      原先只有两行文字，用户直接打开这页会卡住（比如从订单页返回、或收藏/转发进来）。
    -->
    <view v-if="!draft" class="empty-state">
      <text class="empty-title">没有待购买的补剂</text>
      <text class="empty-desc">补剂是从 DIY 制作单带过来的。先在「我的制作单」里打开一份，再点「购买预分装补剂」。</text>
      <button class="empty-action" @tap="goToDiySheetList">去我的制作单</button>
    </view>

    <!-- 首次报价期间：给一个明确的加载态，避免页面看起来是"空的/坏了" -->
    <view v-else-if="initializing" class="empty-state">
      <text class="empty-title">正在核对补剂</text>
      <text class="empty-desc">正在按制作单上的用量计算价格，请稍候…</text>
    </view>

    <!--
      制作单上的补剂全都没开放购买时，原先会呈现"一片灰 + 底部 ¥0.00 + 灰按钮"，
      没有任何解释。这里给一个明确的说明与出口。
    -->
    <view v-else-if="lines.length > 0 && selectableLines.length === 0" class="empty-state">
      <text class="empty-title">这些补剂暂时无法购买</text>
      <text class="empty-desc">制作单上的补剂目前都没有开放购买，或还没有定好价格。可以稍后再试，或联系客服。</text>
      <button class="empty-action" @tap="goToDiySheetList">返回我的制作单</button>
    </view>

    <template v-else>
      <!--
        来源制作单（2026-09-24 加了「改用量」入口）

        补剂用量是按制作单那批食物的营养目标算出来的，所以它**不应该在这一页改**：
        改少了补剂跟食物配不上；改天数还会改变单袋分装量、可能撑爆袋子
        （碳酸钙粉 114g 已经是 10x15 袋的极限）。
        想多买用下面的「加量」；想改基准用量，回制作单配置页改 —— 那里食物和补剂一起调。
        这个入口就是让人知道该去哪，而不是在这一页干着急。
      -->
      <view class="section source-card">
        <view class="source-main">
          <text class="source-title">{{ draft.recipeName || 'DIY 制作单' }}</text>
          <text class="source-sub">
            <text v-if="draft.dogName">{{ draft.dogName }} · </text>
            <text v-if="draft.cycleDays">{{ draft.cycleDays }} 天用量</text>
          </text>
        </view>
        <text v-if="canEditUsage" class="source-action" @tap="goToRecipeDiy">改用量</text>
      </view>

      <!--
        预分装说明（2026-09-23 新增）

        这一页是"选要买哪些补剂"，但第一次来的用户多半不知道"预分装"是什么，
        直接丢给他一张补剂清单会懵。所以在清单前先把这个概念讲清楚。

        画面本身已经带了主文案「无需囤多种补剂，做多少买多少。」，
        所以这里不再重复写一遍 —— 图和字说同一件事会显得啰嗦。

        图是 700×466 的实拍级海报，跟仓库里 delivery/making.jpg 同规格。
      -->
      <view class="section prepack-card">
        <image class="prepack-image" src="/static/mall/prepack-explainer.jpg" mode="widthFix" />
      </view>

      <!-- 补剂清单 -->
      <view class="section">
        <view class="section-title">
          <text class="title-text">选择要买的补剂</text>
          <!-- 多种补剂时逐个点太累，给一个全选/全不选（不可购买的自动跳过） -->
          <text
            v-if="selectableLines.length > 1"
            class="title-action"
            @tap="toggleSelectAll"
          >
            {{ allSelectableSelected ? '全不选' : '全选' }}
          </text>
        </view>
        <text class="section-subtip">按品种单独分装，一袋一种</text>

        <view
          v-for="line in displayLines"
          :key="line.ingredientId"
          class="line-row"
          :class="{ 'line-row-disabled': !!line.unavailableReason }"
          @tap="toggleLine(line)"
        >
          <view class="line-check">
            <view
              class="checkbox"
              :class="{
                'checkbox-checked': isSelected(line.ingredientId),
                'checkbox-disabled': !!line.unavailableReason
              }"
            >
              <text v-if="isSelected(line.ingredientId)" class="checkbox-tick">✓</text>
            </view>
          </view>

          <view class="line-main">
            <text class="line-name">{{ line.name }}</text>
            <!-- 小字只展示品牌和规格 -->
            <text v-if="line.specText" class="line-extra">{{ line.specText }}</text>
            <text v-if="line.unavailableReason" class="line-warn">
              暂不可购买：{{ line.unavailableReason }}
            </text>
          </view>

          <!-- 右侧展示分装用量（不再展示价格） -->
          <text
            class="line-packed"
            :class="{ 'line-packed-disabled': !!line.unavailableReason }"
          >
            {{
              line.unavailableReason
                ? '—'
                : `${formatAmount(line.packedAmount)}${line.unit}`
            }}
          </text>
        </view>
      </view>

      <!-- 收货地址 -->
      <view class="section">
        <view class="section-title">
          <text class="title-text">收货地址</text>
        </view>
        <view v-if="selectedAddress" class="address-card" @tap="chooseAddress">
          <view class="address-main">
            <text class="address-name">{{ selectedAddress.recipientName }} {{ selectedAddress.phone }}</text>
            <text class="address-detail">{{ formatRegion(selectedAddress.region) }}{{ selectedAddress.detail }}</text>
          </view>
          <text class="address-action">更换</text>
        </view>
        <view v-else class="address-card address-empty" @tap="chooseAddress">
          <text class="address-placeholder">请选择收货地址</text>
          <text class="address-action">去选择</text>
        </view>
      </view>

      <!-- 费用板块整体不再展示，只在最下方保留合计 -->

      <!--
        提交说明：2026-09-22 改成对「在线支付可用/不可用」两种情况都成立的说法。
        原文只说"提交订单后我们会尽快与你确认收款"，如果在线支付是通的，
        用户其实是直接付掉了，这句话就是错的；而两种情况的差别在提交前无法预知。
      -->
      <!--
        加量（2026-09-24，v2：选项直接带总价与包邮标记）

        分装服务费是按单收的，跟买多少无关；分装 8 袋和 2 袋的实际耗时也差不多。
        一次多买几份能把固定成本摊薄。

        v1 只在选项上写"1 份 / 2 份 / 3 份"，顾客要来回点才知道多少钱、哪档包邮。
        v2 把服务端算好的【金额 + 是否包邮】印在每个选项上，
        "再加一份就免 8 块运费"变成零点击可见。
        金额全部来自服务端（portionOptions），前端不做乘法。

        ⚠️ 这里**故意不显示"多少天量"**（2026-09-24 撤掉）。
        天数算不准：狗狗档案里的"每天两顿"是吃饭频率，不等于"会吃几袋这个"。
        真实场景：鲜食+干粮混吃的人，明明做了 30 袋、每天却只喂 1 袋 ——
        系统无从知道。**给一个可能错的数字，比不给更糟。**
        天数仍然在服务端算（用于"总天数 ≤ 效期安全线"的校验），只是不给用户看。
      -->
      <view v-if="showPortionPicker" class="section portion-card">
        <view class="section-title">
          <text class="title-text">选择份数</text>
        </view>
        <!-- 包邮门槛来自服务端配置，后台改了这里跟着变 -->
        <text v-if="freeShippingThresholdText" class="portion-subtip portion-subtip-gold">
          {{ freeShippingThresholdText }}
        </text>

        <view class="portion-options">
          <view
            v-for="opt in portionOptionCards"
            :key="opt.multiplier"
            class="portion-option"
            :class="{ 'portion-option-active': opt.multiplier === portionMultiplier }"
            @tap="selectPortion(opt.multiplier)"
          >
            <!--
              包邮做成右上角标：不占选项正文的位置，又能一眼看出哪档开始包邮。
              正文只留「几份 / 多少钱」两件事。
            -->
            <text v-if="opt.freeShipping" class="portion-badge">已包邮</text>
            <text class="portion-option-num">{{ opt.multiplier }} 份</text>
            <text class="portion-option-price">{{ opt.priceLabel }}</text>
          </view>
        </view>
      </view>

      <!--
        费用明细（2026-09-24）

        2026-09-22 曾经把费用明细整块撤掉，只留一个「包邮价」，理由是
        小额单上「服务费 + 运费 比货本身还贵」，用户看着不划算。
        2026-09-24 改回逐项展示（服务费、运费都列出来）：
        费用摆出来，用户才能亲眼看到"服务费和运费不随份数变"，
        从而自己算出加量更划算 —— 明细本身成了加量的说服力。
      -->
      <view v-if="summary && !quoteFailed" class="section fee-card">
        <view class="section-title">
          <text class="title-text">费用明细</text>
        </view>

        <view class="fee-row">
          <text class="fee-label">补剂费</text>
          <text class="fee-value">¥{{ summary.supplementPrice.toFixed(2) }}</text>
        </view>

        <view class="fee-row">
          <text class="fee-label">分装服务费</text>
          <text class="fee-value">¥{{ summary.serviceFee.toFixed(2) }}</text>
        </view>

        <!--
          商品金额小计：把「补剂费 + 服务费」与「运费」分开。
          份数选择器上显示的就是这个数（也是包邮门槛比的数），
          不加这一行，用户对不上"选项上的价格"和"明细里的三项"。
        -->
        <view class="fee-row fee-row-subtotal">
          <text class="fee-label">商品金额小计</text>
          <text class="fee-value">¥{{ summary.goodsSubtotal.toFixed(2) }}</text>
        </view>

        <view class="fee-row">
          <text class="fee-label">运费</text>
          <text v-if="summary.freeShipping" class="fee-value fee-value-free">包邮</text>
          <text v-else class="fee-value">¥{{ summary.shippingFee.toFixed(2) }}</text>
        </view>

        <view class="fee-row fee-row-total">
          <text class="fee-label">合计</text>
          <text class="fee-value fee-value-total">¥{{ summary.total.toFixed(2) }}</text>
        </view>

      </view>

      <view class="notice">
        <text class="notice-text">
          补剂按品种分装成小样，独立发货。提交订单后可在线支付；若在线支付暂不可用，我们会尽快与你确认收款后发货。
        </text>
        <!--
          效期说明（2026-09-24）
          原先靠"总天数 ≤ 90 天"硬卡一手，但那个天数本身是按
          「总袋数 ÷ 每天餐数」估的 —— 一天吃几袋我们无从知道（鲜食+干粮混吃的人
          可能一天只喂一袋）。拿一个不可靠的估算去硬拦用户会误伤正常订单，
          所以改为**在页面上说清楚**：分装小样有保质期，袋上印有效期至。
          顾客在包装上直接看得到，比一句拦截提示更有效。
        -->
        <text class="notice-text notice-expiry">
          分装小样有保质期，每袋标签上都印有「有效期至」，建议按需购买。
        </text>
      </view>

      <view class="footer-space"></view>

      <view class="footer">
        <view class="footer-total">
          <text class="footer-amount">¥{{ summary ? summary.total.toFixed(2) : '0.00' }}</text>
          <!--
            金额下方**不再放说明小字**（2026-09-24 撤掉「包邮 / 含运费 ¥X」）：
            费用明细里已经有独立的运费行，这里再写一遍是冗余，而且底部空间紧张。
            但「价格获取失败，点击重试」必须留着 —— 那是取价失败时唯一的出口，
            删了按钮会永久灰死。它是**功能**，不是说明。
          -->
          <text
            v-if="quoteFailed"
            class="footer-ship footer-ship-retry"
            @tap="handleRetryQuote"
          >
            价格获取失败，点击重试
          </text>
        </view>
        <button
          class="footer-btn"
          :class="{ 'footer-btn-disabled': !canSubmit || submitting }"
          :disabled="!canSubmit || submitting"
          @tap="handleSubmit"
        >
          <text class="footer-btn-text">{{ submitting ? '提交中…' : '提交订单' }}</text>
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onUnload, onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import {
  clearSupplementPurchaseDraft,
  createSupplementOrder,
  quoteSupplements,
  readSupplementPurchaseDraft,
  type SupplementOrder,
  type SupplementPurchaseDraft,
  type SupplementQuote
} from '../../api/supplements'
import { runSupplementPayment } from '../../utils/supplement-payment'

interface Address {
  id: string
  recipientName: string
  phone: string
  region: { province?: string; city?: string; district?: string }
  detail: string
  isDefault?: boolean
}

interface DisplayLine {
  ingredientId: string
  name: string
  unit: string
  requestedAmount: number
  packedAmount: number
  price: number
  shelfLifeMonths: number
  /** 品牌 / 规格，来自制作单（报价接口不返回） */
  specText?: string
  unavailableReason?: string
}

const draft = ref<SupplementPurchaseDraft | null>(null)
const lines = ref<DisplayLine[]>([])
const selectedIds = ref<string[]>([])
const addresses = ref<Address[]>([])
const selectedAddressId = ref('')
const summary = ref<SupplementQuote | null>(null)
const initializing = ref(true)
const quoting = ref(false)
// 报价失败必须可见、可重试：否则费用整块消失、提交按钮永久灰，用户只能退出重进
const quoteFailed = ref(false)
const submitting = ref(false)

/**
 * 加量份数（1 = 不加量）。
 *
 * 为什么要有这个：分装服务费是按单收的，跟买多少无关；分装 8 袋和 2 袋的
 * 实际耗时也差不多。所以让用户一次多买几份，能把固定成本摊薄 ——
 * 用户每天成本下降，我们单笔利润反而上升。
 *
 * 上限由服务端算（份数上限 + 效期天数上限双重约束），通过报价响应回传，
 * 界面只负责照着渲染，不自己拍脑袋。
 */
const portionMultiplier = ref(1)

/** 制作单覆盖的天数：加量要靠它算总天数与每天成本 */
const cycleDays = computed(() => Number(draft.value?.cycleDays) || 0)

/** 服务端回传的最大可选份数；还没拿到报价时先按 1 处理，避免闪出非法选项 */
const maxPortionMultiplier = computed(() =>
  Math.max(1, summary.value?.maxPortionMultiplier ?? 1)
)

const showPortionPicker = computed(
  () => maxPortionMultiplier.value > 1 && selectedLines.value.length > 0
)

/**
 * 份数选项卡片。
 *
 * 每个选项上直接印出【商品金额 + 是否包邮】，金额全部来自服务端
 * 的 portionOptions —— 前端一个乘法都不做。
 *
 * 不显示"多少天量"：详见模板里那段注释，天数算不准，给了反而误导。
 *
 * 这样"再加一份就免 8 块运费"是零点击可见的，顾客不用来回点着试。
 * 服务端没返回选项时（老接口）自动退回"只有 1 份"，控件整体不展示。
 */
const portionOptionCards = computed(() => {
  const list = summary.value?.portionOptions
  if (!list || list.length === 0) {
    return [{ multiplier: 1, priceLabel: '', freeShipping: false }]
  }
  return list.map((opt) => ({
    multiplier: opt.multiplier,
    /**
     * ⚠️ 这里显示的是**商品金额**（补剂费 + 分装服务费），不是含运费的合计。
     *
     * 为什么：包邮门槛比的就是商品金额。之前显示 total（含运费）会出现
     * "选项上写着 ¥49.50、门槛 49，却没包邮" —— 因为那 ¥49.50 里含着 8 元运费，
     * 商品金额其实只有 ¥41.50。同一个数字里混着运费，门槛就没法读了。
     * 费用明细里加了「商品金额小计」一行，两处对得上。
     */
    priceLabel: `¥${opt.goodsSubtotal.toFixed(2)}`,
    freeShipping: opt.freeShipping
  }))
})

/**
 * 包邮门槛文案（「满49元包邮」）。
 *
 * 门槛取自服务端配置，后台改了这里跟着变 —— 不写死 49。
 * 整数就不显示小数，49 比 49.00 好看。
 */
const freeShippingThresholdText = computed(() => {
  const threshold = summary.value?.freeShippingThreshold
  if (!threshold || threshold <= 0) return ''
  const label = Number.isInteger(threshold) ? String(threshold) : threshold.toFixed(2)
  return `满${label}元包邮`
})

const displayLines = computed(() => lines.value)

const selectedLines = computed(() =>
  lines.value.filter(
    (line) => !line.unavailableReason && selectedIds.value.includes(line.ingredientId)
  )
)

/** 可勾选的补剂（排除不可购买的） */
const selectableLines = computed(() =>
  lines.value.filter((line) => !line.unavailableReason)
)

const allSelectableSelected = computed(
  () =>
    selectableLines.value.length > 0 &&
    selectableLines.value.every((line) => selectedIds.value.includes(line.ingredientId))
)

/** 全选 / 全不选（不可购买的自动跳过，不会污染报价） */
async function toggleSelectAll() {
  selectedIds.value = allSelectableSelected.value
    ? []
    : selectableLines.value.map((line) => line.ingredientId)

  try {
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 全选重算合计失败:', error)
  }
}

/** 能不能跳回去改用量：要有 recipeId 才进得去配置页 */
const canEditUsage = computed(() => !!draft.value?.recipeId)

/**
 * 回制作单配置页改用量（天数）。
 * 参数与 recipe-detail 页的 buildDiyRoute 保持一致。
 */
function goToRecipeDiy() {
  const recipeId = draft.value?.recipeId
  if (!recipeId) return
  const query = [`recipeId=${encodeURIComponent(recipeId)}`]
  if (draft.value?.dogId) {
    query.push(`dogId=${encodeURIComponent(draft.value.dogId)}`)
  }
  uni.navigateTo({ url: `/pages/recipe-diy/index?${query.join('&')}` })
}

function goToDiySheetList() {
  uni.navigateTo({ url: '/pages/diy-sheet-list/index' })
}

const selectedAddress = computed(
  () => addresses.value.find((item) => item.id === selectedAddressId.value) || null
)

const canSubmit = computed(
  () => selectedLines.value.length > 0 && !!selectedAddressId.value && !!summary.value
)

onLoad(() => {
  draft.value = readSupplementPurchaseDraft()

  // 地址列表页选择后通过全局事件回传
  uni.$on('address-selected', onAddressSelected)

  if (draft.value) {
    lines.value = draft.value.lines.map((line) => ({
      ingredientId: line.ingredientId,
      name: line.name || '补剂',
      unit: line.unit || '',
      requestedAmount: line.amount,
      packedAmount: 0,
      price: 0,
      shelfLifeMonths: 0,
      specText: line.specText || ''
    }))
    selectedIds.value = draft.value.lines.map((line) => line.ingredientId)
    void initialize()
  } else {
    initializing.value = false
  }
})

onShow(() => {
  if (draft.value && addresses.value.length === 0) {
    void loadAddresses()
  }
})

onUnload(() => {
  uni.$off('address-selected', onAddressSelected)
})

async function initialize() {
  initializing.value = true
  try {
    await Promise.all([loadAddresses(), refreshQuote()])
  } finally {
    initializing.value = false
  }
}

async function loadAddresses() {
  try {
    const res: any = await request({ url: '/addresses', method: 'GET', quiet: true } as any)
    if (res.code === 0 && Array.isArray(res.data)) {
      addresses.value = res.data
      if (!selectedAddressId.value) {
        const preferred = res.data.find((item: Address) => item.isDefault) || res.data[0]
        if (preferred) selectedAddressId.value = preferred.id
      }
    }
  } catch (error) {
    console.warn('[SupplementOrder] 加载地址失败:', error)
  }
}

function onAddressSelected(payload: { addressId?: string }) {
  if (payload && payload.addressId) {
    selectedAddressId.value = payload.addressId
  }
}

function chooseAddress() {
  uni.navigateTo({ url: '/pages/address-list/index?mode=select&from=supplement-order' })
}

/** 用「全部补剂」取单价与不可购买原因，用「已勾选」算金额合计 */
async function refreshQuote() {
  if (!draft.value || quoting.value) return
  quoting.value = true
  try {
    const allRes = await quoteSupplements(
      draft.value.lines.map((line) => ({
        ingredientId: line.ingredientId,
        amount: line.amount
      })),
      { portionMultiplier: portionMultiplier.value, cycleDays: cycleDays.value || undefined }
    )

    if (allRes.code !== 0) {
      quoteFailed.value = true
      uni.showToast({ title: allRes.message || '报价失败', icon: 'none' })
      return
    }

    const { quote, unavailable } = allRes.data
    const unavailableMap = new Map(unavailable.map((item) => [item.ingredientId, item.reason]))
    const quoteMap = new Map(quote.lines.map((item) => [item.ingredientId, item]))

    lines.value = draft.value.lines.map((line) => {
      const quoted = quoteMap.get(line.ingredientId)
      const reason = unavailableMap.get(line.ingredientId)
      return {
        ingredientId: line.ingredientId,
        name: quoted?.name || line.name || '补剂',
        unit: quoted?.unit || line.unit || '',
        requestedAmount: quoted?.requestedAmount ?? line.amount,
        packedAmount: quoted?.packedAmount ?? 0,
        price: quoted?.price ?? 0,
        shelfLifeMonths: quoted?.shelfLifeMonths ?? 0,
        specText: line.specText || '',
        unavailableReason: reason
      }
    })

    summary.value = quote
    quoteFailed.value = false
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 报价失败:', error)
    quoteFailed.value = true
    uni.showToast({ title: '报价失败，请稍后重试', icon: 'none' })
  } finally {
    quoting.value = false
  }
}

/** 首次报价失败后的重试：原来没有这个出口，用户只能退出重进 */
async function handleRetryQuote() {
  if (quoting.value) return
  quoteFailed.value = false
  await refreshQuote()
}

/**
 * 勾选变化时只重算合计（单价与单项无关，无需重算明细）
 *
 * 2026-09-22：重算失败时原来只是静默保留旧 summary，
 * 用户会看到一个与当前勾选不符的合计。现在明确提示，避免被误导下单。
 */
async function refreshSummaryOnly() {
  const ids = selectedLines.value.map((line) => line.ingredientId)
  if (ids.length === 0) {
    summary.value = null
    return
  }

  const payload = ids.map((id) => {
    const line = lines.value.find((item) => item.ingredientId === id)!
    return { ingredientId: id, amount: line.requestedAmount }
  })

  try {
    const res = await quoteSupplements(payload, {
      portionMultiplier: portionMultiplier.value,
      cycleDays: cycleDays.value || undefined
    })
    if (res.code === 0) {
      summary.value = res.data.quote
      // 服务端可能因为效期上限把份数收敛下来（比如换了更长的制作单），
      // 界面要跟着回到合法值，不能停在一个后端不认的档位上。
      const allowed = Math.max(1, res.data.quote.maxPortionMultiplier ?? 1)
      if (portionMultiplier.value > allowed) portionMultiplier.value = allowed
      return
    }

    uni.showToast({ title: res.message || '价格重算失败，请重试', icon: 'none' })
  } catch (error) {
    console.error('[SupplementOrder] 价格重算失败:', error)
    uni.showToast({ title: '价格重算失败，请稍后重试', icon: 'none' })
  }
}

function isSelected(ingredientId: string): boolean {
  return selectedIds.value.includes(ingredientId)
}

/**
 * 切换加量份数。
 * 先本地改状态让按钮立刻响应，再由 refreshSummaryOnly 向服务端重算金额 ——
 * 金额永远以服务端为准，本地不做乘法。
 */
async function selectPortion(next: number) {
  if (next === portionMultiplier.value) return
  if (next < 1 || next > maxPortionMultiplier.value) return
  portionMultiplier.value = next
  try {
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 切换加量份数失败:', error)
  }
}

async function toggleLine(line: DisplayLine) {
  if (line.unavailableReason) return

  if (isSelected(line.ingredientId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== line.ingredientId)
  } else {
    selectedIds.value = [...selectedIds.value, line.ingredientId]
  }

  try {
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 重算合计失败:', error)
  }
}

/** 提交后的支付处理：能支付就支付，不能支付就降级为待人工确认收款 */
async function settlePayment(order: SupplementOrder) {
  const outcome = await runSupplementPayment(order.id)

  if (outcome === 'PAID') {
    showPaidModal(order)
    return
  }

  const prefix = outcome === 'CANCELLED' ? '支付未完成，订单已为你保留。' : ''
  showManualConfirmModal(order, prefix)
}

function showPaidModal(order: SupplementOrder) {
  uni.showModal({
    title: '支付成功',
    content: `订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n\n我们会尽快分装发货。`,
    showCancel: false,
    confirmText: '查看订单',
    success: () => {
      uni.redirectTo({ url: '/pages/supplement-orders/index' })
    }
  })
}

function showManualConfirmModal(order: SupplementOrder, prefix = '') {
  uni.showModal({
    title: '订单已提交',
    content: `${prefix}订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n\n我们会尽快与你确认收款，随后分装发货。`,
    showCancel: false,
    confirmText: '查看订单',
    success: () => {
      uni.redirectTo({ url: '/pages/supplement-orders/index' })
    }
  })
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatRegion(region?: { province?: string; city?: string; district?: string }): string {
  if (!region) return ''
  return [region.province, region.city, region.district].filter(Boolean).join(' ')
}

async function handleSubmit() {
  if (!canSubmit.value || !draft.value) return

  submitting.value = true
  try {
    const res = await createSupplementOrder({
      addressId: selectedAddressId.value,
      lines: selectedLines.value.map((line) => ({
        ingredientId: line.ingredientId,
        amount: line.requestedAmount
      })),
      recipeId: draft.value.recipeId,
      recipeName: draft.value.recipeName,
      dogId: draft.value.dogId,
      dogName: draft.value.dogName,
      cycleDays: draft.value.cycleDays,
      // 加量份数：服务端会自己校验上限，越界会拒绝（前端算的只是展示用）
      portionMultiplier: portionMultiplier.value
    })

    if (res.code !== 0) {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' })
      return
    }

    const order = res.data as SupplementOrder
    clearSupplementPurchaseDraft()
    await settlePayment(order)
  } catch (error) {
    console.error('[SupplementOrder] 提交失败:', error)
    uni.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
}

.empty-state {
  padding: 200rpx 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: 32rpx;
  color: #303133;
  font-weight: 600;
}

.empty-desc {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #909399;
  text-align: center;
  line-height: 1.6;
}

/* 空态出口：给用户一条明确的下一步 */
.empty-action {
  margin-top: 40rpx;
  padding: 0 56rpx;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
  background-color: #1e3a2f;
  border-radius: 12rpx;
}

.empty-action::after {
  border: none;
}

.section {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.source-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.source-main {
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* 「改用量」是个次要入口，用金色小字，不要抢主流程的注意力 */
.source-action {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: #a97c33;
  border: 2rpx solid #e8dcc0;
  border-radius: 999rpx;
}

/*
  预分装说明图：整幅贴满卡片、不留内边距。
  图本身自带米白背景，若再套一层白卡的 24rpx 内边距，会变成"白框里嵌一块米色"，
  看着像没对齐。取消内边距 + 裁圆角后，它读起来就是一张干净的横幅。
*/
.prepack-card {
  padding: 0;
  overflow: hidden;
}

.prepack-image {
  display: block;
  width: 100%;
  /* 不写死高度：mode="widthFix" 会按原图 700×466 的比例自己算高度。
     写死高度反而可能和 widthFix 打架，把图压变形。 */
}

/* ---- 加量 ---- */
.portion-subtip {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #968f6d;
  line-height: 1.5;
}

.portion-options {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.portion-option {
  flex: 1;
  /* 选项里是两行字（份数 / 金额），不用固定高度，留出角标的位置 */
  padding: 18rpx 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  border: 2rpx solid #e5e0d0;
  background-color: #fbfcf7;
  /* 角标要相对它定位；overflow 让角标被圆角裁掉，不会溢出成直角 */
  position: relative;
  overflow: hidden;
}

.portion-option-price {
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

/* 「已包邮」用墨绿：这是选项上最有说服力的一个词 */
/* 包邮角标：贴在选项右上角，不占正文位置 */
.portion-badge {
  position: absolute;
  top: 0;
  right: 0;
  /* 原来 padding 2/12 + 20rpx 字号会压到「3 份」上，收小一档 */
  padding: 0 8rpx;
  font-size: 17rpx;
  line-height: 1.5;
  color: #fbfcf7;
  background-color: #b08d4f;
  border-top-right-radius: 12rpx;
  border-bottom-left-radius: 8rpx;
}

.portion-subtip-gold {
  color: #a97c33;
  font-weight: 600;
}

/* 选中态用墨绿，跟品牌主色一致（不要用旧蓝紫） */
.portion-option-active {
  border-color: #1e3a2f;
  background-color: #1e3a2f;
}

.portion-option-num {
  font-size: 28rpx;
  color: #26261f;
}

.portion-option-active .portion-option-num,
.portion-option-active .portion-option-price {
  color: #fbfcf7;
  font-weight: 600;
}


.portion-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 2rpx solid #f2f4ea;
}

.portion-days {
  font-size: 26rpx;
  color: #26261f;
}

/* 每天成本是加量说服力的核心数字，用金色强调 */
.portion-perday {
  font-size: 28rpx;
  color: #a97c33;
  font-weight: 600;
}

.portion-hint {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #a97c33;
}

/* ---- 费用明细 ---- */
.fee-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 14rpx 0;
}

.fee-label {
  font-size: 26rpx;
  color: #968f6d;
}

.fee-value {
  font-size: 26rpx;
  color: #26261f;
}

/* 包邮用墨绿，跟"已获得好处"的语义一致 */
.fee-value-free {
  color: #2b5040;
}

/*
  费用明细要读出**三层**，否则五个数字平铺在一起、用户不知道哪个是哪个：
    ① 明细项（补剂费 / 分装服务费 / 运费）—— 灰标签 + 常规值，最弱
    ② 商品金额小计 —— 浅绿色带 + 墨绿加粗，中等强调
    ③ 合计 —— 最大最粗的墨绿，最强
  小计那一行用负边距铺满卡片（卡片本身有 24rpx 内边距），形成一条完整色带。
*/
.fee-row-subtotal {
  margin: 12rpx -24rpx 0;
  padding: 16rpx 24rpx;
  background-color: #f7f8f2;
}

.fee-row-subtotal .fee-label {
  color: #2b5040;
  font-weight: 600;
}

.fee-row-subtotal .fee-value {
  color: #2b5040;
  font-size: 28rpx;
  font-weight: 600;
}

.fee-row-total {
  margin-top: 12rpx;
  padding-top: 18rpx;
  border-top: 2rpx solid #e5e0d0;
}

.fee-row-total .fee-label {
  color: #26261f;
  font-weight: 600;
}

.fee-value-total {
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}


.source-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #303133;
}

.source-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #909399;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.title-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

/* 全选 / 全不选 */
.title-action {
  font-size: 24rpx;
  font-weight: 600;
  color: #0f6b43;
}

.section-subtip {
  display: block;
  margin-bottom: 14rpx;
  font-size: 22rpx;
  color: #c0c4cc;
  line-height: 1.4;
}

.line-row {
  display: flex;
  align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f2f3f5;
}

.line-row:last-child {
  border-bottom: none;
}

.line-row-disabled {
  opacity: 0.5;
}

.line-check {
  width: 56rpx;
  padding-top: 4rpx;
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-checked {
  background-color: #4a90d9;
  border-color: #4a90d9;
}

.checkbox-disabled {
  background-color: #f2f3f5;
  border-color: #e4e7ed;
}

.checkbox-tick {
  color: #ffffff;
  font-size: 24rpx;
  line-height: 1;
}

.line-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.line-name {
  font-size: 28rpx;
  color: #303133;
  font-weight: 500;
}

.line-extra {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #909399;
}

.line-warn {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #e6a23c;
}

/* 右侧展示分装用量（原来这里是价格） */
.line-packed {
  font-size: 26rpx;
  color: #303133;
  font-weight: 600;
  padding-top: 4rpx;
}

.line-packed-disabled {
  color: #c0c4cc;
}

.address-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
}

.address-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.address-name {
  font-size: 28rpx;
  color: #303133;
}

.address-detail {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #909399;
}

.address-placeholder {
  font-size: 28rpx;
  color: #909399;
}

.address-action {
  font-size: 26rpx;
  color: #4a90d9;
  padding-left: 20rpx;
}

.notice {
  padding: 0 8rpx 20rpx;
}

.notice-text {
  font-size: 22rpx;
  color: #909399;
  line-height: 1.6;
}

/* 效期说明：与主说明拉开一点，读起来是两条独立信息 */
.notice-expiry {
  margin-top: 8rpx;
  color: #a97c33;
}

.footer-space {
  height: 180rpx;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ffffff;
  border-top: 1rpx solid #f2f3f5;
  display: flex;
  align-items: center;
  /* 合计靠右，紧挨提交按钮 */
  justify-content: flex-end;
  gap: 20rpx;
  padding: 14rpx 24rpx calc(14rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(14rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* 合计：金额在上，说明在金额下方，整体右对齐 */
.footer-total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2rpx;
}

.footer-amount {
  font-size: 36rpx;
  color: #e6641e;
  font-weight: 700;
  line-height: 1.1;
}

.footer-ship {
  font-size: 20rpx;
  color: #909399;
  line-height: 1.2;
}

.footer-ship-retry {
  color: #e6641e;
  text-decoration: underline;
}

.footer-btn {
  width: 260rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background-color: #4a90d9;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  flex: none;
}

.footer-btn::after {
  border: none;
}

.footer-btn-disabled {
  background-color: #c0c4cc;
}

.footer-btn-text {
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 500;
}
</style>
