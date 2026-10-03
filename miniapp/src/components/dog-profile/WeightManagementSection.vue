<template>
  <view v-if="dogId" class="health-section">
    <!-- 体重记录（新增块）。
         2026-10-03：内嵌且新增块关闭时**整张卡片不渲染** —— 否则 card 容器还在，
         里面什么都没有，页面上就多出一块白框（老板实测截图提的）。 -->
    <view v-if="!embedded || showAddEntry" class="health-card weight-record-card">
      <!-- 内嵌到健康管理页时不显示这一行（书签已经写着「体重」）—— 老板 2026-10-01 要求 -->
      <template v-if="!embedded">
        <text class="health-section__title">体重记录</text>
        <text class="health-section__desc">记录每次称重，观察体重趋势，及时调整饭量。</text>
      </template>

      <view v-if="showAddEntry" class="input-card">
        <view class="input-item">
          <text class="input-label">记录日期</text>
          <picker mode="date" :value="formData.recordDate" @change="onDateChange">
            <view class="picker-button">
              {{ formData.recordDate || '请选择日期' }} ▼
            </view>
          </picker>
        </view>

        <view class="input-item">
          <!-- 单位必须显式可见并可切换（与建档页、档案总览页保持一致）。
               2026-09-27 老板要求三处体重输入统一。
               注意：内部仍**始终存公斤**，斤只存在于输入框这一层。 -->
          <text class="input-label">体重（{{ weightUnitLabel }}）</text>
          <view class="weight-input-row">
            <input
              class="input-field weight-input"
              type="digit"
              :focus="weightInputFocused"
              :value="weightInputText"
              @input="onWeightInput"
              @blur="onWeightInputBlur"
            />
            <view class="weight-unit-toggle">
              <text
                v-for="option in weightUnitOptions"
                :key="option.value"
                class="weight-unit-option"
                :class="{ active: weightUnit === option.value }"
                @tap="onWeightUnitChange(option.value)"
              >{{ option.label }}</text>
            </view>
          </view>
          <!-- 只显示单位换算回显（= 86 斤）。不做任何合理性判断，
               避免给出错误提醒（2026-09-28 老板决定）。 -->
          <text v-if="weightEcho" class="weight-echo">{{ weightEcho }}</text>

          <!-- 刚记下的那一条：输入框会被清空，这行告诉顾客数值去哪儿了
               （2026-10-03 老板实测："提示成功，但体重栏里的数值消失了"） -->
          <text v-if="lastSavedText" class="weight-saved">
            已记下 {{ lastSavedText }}，见下方「历史记录」
          </text>
        </view>

        <view class="input-item">
          <text class="input-label">备注（可选）</text>
          <input
            class="input-field"
            type="text"
            v-model="formData.note"
            placeholder="如：饭后测量、运动后等"
            @blur="onWeightInputBlur"
          />
        </view>
      </view>

      <view v-if="showAddEntry" class="sync-option">
        <view class="sync-option__copy">
          <text class="sync-option__title">同时更新档案当前体重</text>
          <text class="sync-option__desc">{{ syncOptionDescription }}</text>
        </view>
        <switch
          class="sync-option__switch"
          color="#0d6b43"
          :checked="syncToProfile"
          @change="onSyncToggle"
        />
      </view>

      <!-- 内嵌到健康管理页时隐藏（改由底部那个自适应按钮统一保存） -->
      <button
        v-if="!externalSave"
        class="health-section__action"
        :loading="isSavingRecord"
        :disabled="isSavingRecord"
        @tap="saveRecord"
      >
        {{ isSavingRecord ? '保存中...' : '保存记录' }}
      </button>
    </view>

    <!-- ==================== 体重管理计划（阶段 B2-3 / B2-6） ====================
         老板原话：不只是给用户一个记录体重的工具，而是真真正正能指导用户
         通过饮食增减重的可执行方案。这张卡片就是那个「方案」的落点。

         没有计划时只给一个入口，不主动推销 —— BCS 4-5 的狗本来就不该建计划。 -->
    <view v-if="plan" class="health-card plan-card" :class="`plan-card--${plan.status.toLowerCase()}`">
      <view class="plan-card__head">
        <text class="health-section__title">
          {{ plan.direction === 'LOSS' ? '减重计划' : '增重计划' }}
        </text>
        <text class="plan-card__badge" :class="`plan-card__badge--${plan.status.toLowerCase()}`">
          {{ planStatusLabel }}
        </text>
      </view>

      <!-- 进度 -->
      <view class="plan-progress">
        <view class="plan-progress__numbers">
          <text class="plan-progress__done">
            {{ plan.direction === 'LOSS' ? '已减' : '已增' }} {{ Math.abs(plan.changedKg) }} kg
          </text>
          <text class="plan-progress__target">目标 {{ plan.targetWeightKg }} kg</text>
        </view>
        <view class="plan-progress__bar">
          <view class="plan-progress__fill" :style="{ width: `${plan.progressPercent}%` }"></view>
        </view>
        <text class="plan-progress__hint">
          当前 {{ plan.currentWeightKg }} kg<template v-if="plan.remainingKg > 0">，还差 {{ plan.remainingKg }} kg</template>
        </text>
      </view>

      <view class="plan-facts">
        <view class="plan-fact">
          <text class="plan-fact__label">每天能量</text>
          <text class="plan-fact__value">{{ plan.currentKcal }} kcal</text>
        </view>
        <view class="plan-fact">
          <text class="plan-fact__label">最近速率</text>
          <text class="plan-fact__value" :class="`plan-fact__value--${rateTone}`">{{ rateText }}</text>
        </view>
        <view class="plan-fact">
          <text class="plan-fact__label">下次称重</text>
          <text class="plan-fact__value">{{ nextReviewText }}</text>
        </view>
      </view>

      <!-- 状态说明：暂停 / 维持期各有各的话要说 -->
      <view v-if="plan.status === 'PAUSED'" class="plan-note plan-note--paused">
        <text class="plan-note__text">
          计划已暂停{{ plan.pausedReason ? `（${plan.pausedReason}）` : '' }}，期间按正常维持量喂。
          补记一次体重就能恢复。
        </text>
      </view>

      <view v-else-if="plan.status === 'MAINTENANCE'" class="plan-note plan-note--maintenance">
        <text class="plan-note__text">
          已达标，现在进入维持期 —— **这不是结束**。前 2 周每 2 周复查一次，之后每月一次；
          维持满 3 个月计划会自动结束。
        </text>
      </view>

      <view v-if="plan.notes.length > 0" class="plan-note">
        <text v-for="(note, i) in plan.notes" :key="i" class="plan-note__text">· {{ note }}</text>
      </view>

      <view class="plan-actions">
        <button
          v-if="plan.status === 'PAUSED'"
          class="plan-btn plan-btn--primary"
          @tap="resumePlan"
        >恢复计划</button>
        <button
          v-else
          class="plan-btn plan-btn--primary"
          @tap="goToAdjustPlan"
        >调整计划</button>
        <button class="plan-btn" @tap="goToAdjustPlan">查看调整记录</button>
        <button class="plan-btn plan-btn--danger" @tap="confirmEndPlan">结束计划</button>
      </view>
    </view>

    <!-- 没有计划时：给入口，但不推销 -->
    <view v-else-if="canOfferPlan" class="health-card plan-entry-card">
      <text class="health-section__title">设定体重目标</text>
      <text class="health-section__desc">
        根据当前体重和体况，帮你算出每天该喂多少、多久能到位，并按实际减重速度自动调整。
      </text>
      <button class="plan-btn plan-btn--primary" @tap="goToCreatePlan">制定计划</button>
    </view>

    <!-- 缺数据时的引导（B2-7）：没有体重或体况分就算不了，先说清楚缺什么 -->
    <view v-else-if="planBlockedReason" class="health-card plan-entry-card">
      <text class="health-section__title">设定体重目标</text>
      <text class="health-section__desc">{{ planBlockedReason }}</text>
    </view>

    <!-- 体重趋势图 -->
    <view v-if="records.length > 0" class="health-card weight-chart-card">
      <text class="health-section__title">体重趋势（最近10次）</text>
      <view class="chart-container">
        <canvas
          canvas-id="weightChart"
          id="weightChart"
          class="chart-canvas"
          :style="{ width: '100%', height: '200px' }"
        ></canvas>
      </view>
    </view>

    <!-- 一条记录都没有：只写一句"还没有体重记录"（2026-10-03 老板：各板块空态统一成这一句）
         原来这里什么都没有，体重标签下空着也不知道是没记录还是没加载出来。 -->
    <view v-if="recordsLoaded && records.length === 0" class="health-section__empty">
      <text class="health-section__empty-title">还没有体重记录</text>
    </view>

    <!-- 历史记录 -->
    <view v-if="records.length > 0" class="health-card weight-history-card">
      <text class="health-section__title">历史记录</text>

      <view class="record-list">
        <view
          v-for="(record, index) in records"
          :key="record.id"
          class="record-item"
        >
          <view class="record-main">
            <view class="record-date">{{ record.recordDate }}</view>
            <view class="record-weight">{{ record.weightKg }} kg</view>
            <view class="record-change" :class="getChangeClass(record, index)">
              {{ getChangeText(record, index) }}
            </view>
          </view>
          <view v-if="record.note" class="record-note">{{ record.note }}</view>
          <view class="record-actions">
            <text
              v-if="lastSyncedRecordId === record.id"
              class="sync-badge"
            >✓ 已同步到档案</text>
            <text
              class="delete-btn"
              @tap="deleteRecord(record.id)"
            >删除</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref, computed, watch, onMounted, nextTick } from 'vue'
import { request } from '../../utils/api'
import {
  formatWeightForInput,
  getWeightUnitLabel,
  parseWeightInputToKg,
  type WeightUnit,
  formatWeightEcho,
} from '../../utils/weight-unit'
import {
  weightGoalPlanApi,
  getPlanStatusLabel,
  formatRate,
  describeRate,
  daysUntil,
  type WeightGoalPlanView,
} from '../../api/weight-goal-plan'
import {
  formatWeightChangeText,
  formatWeightRecordDateTick,
  getWeightChartDateTickIndexes,
  getWeightSyncSignalKey,
  getWeightSyncValueKey,
  shouldDefaultSyncCurrentWeightRecord,
} from '../../utils/weight-management'

interface WeightRecord {
  id: string
  recordDate: string
  weightKg: number
  note?: string
  syncedToProfile: boolean
}

interface FormData {
  recordDate: string
  weightKg: string
  note: string
}

const props = defineProps<{
  dogId: string
  /**
   * 内嵌到健康管理页：隐藏板块内的「保存记录」，改由底部那个自适应按钮统一保存。
   */
  externalSave?: boolean
  /**
   * 内嵌到健康管理页：同时隐藏首卡那行「体重记录 + 说明」——
   * 上面书签已经写着「体重」。
   */
  embedded?: boolean
  /** 是否显示"新增一条体重"那块（引导入口选到体重时才显示，2026-10-02） */
  showAddEntry?: boolean
  dogProfile?: {
    currentWeightKg?: number | null
    /** 体况分：决定要不要给「制定计划」入口（BCS 4-5 是理想区间，不该建计划） */
    bcsScore?: number | null
  }
}>()

// ==================== 体重管理计划（阶段 B2-3 / B2-6 / B2-7） ====================

const plan = ref<WeightGoalPlanView | null>(null)
const planLoading = ref(false)

const planStatusLabel = computed(() =>
  plan.value ? getPlanStatusLabel(plan.value.status) : '',
)

const rateText = computed(() =>
  plan.value ? formatRate(plan.value.lastRatePercentPerWeek) : '',
)

const rateTone = computed(() =>
  plan.value
    ? describeRate(plan.value.lastRatePercentPerWeek, plan.value.direction).tone
    : 'unknown',
)

const nextReviewText = computed(() => {
  if (!plan.value?.nextReviewDate) return '随时'
  const days = daysUntil(plan.value.nextReviewDate)
  if (days === null) return '随时'
  if (days < 0) return '已到期'
  if (days === 0) return '今天'
  return `${days} 天后`
})

/**
 * 是否显示「制定计划」入口（B2-7）。
 *
 * 三种情况分别处理，而不是一律显示入口再让后端报错：
 *   · 缺体重或体况分 → 说清楚缺什么，引导去补
 *   · BCS 4-5（理想区间）→ 不显示入口，本来就不需要计划
 *   · BCS ≥6 或 ≤3 → 显示入口
 */
const planBlockedReason = computed(() => {
  const weight = props.dogProfile?.currentWeightKg
  const bcs = props.dogProfile?.bcsScore
  if (!weight || weight <= 0) {
    return '档案里还没有当前体重，先补上体重才能算方案。'
  }
  if (bcs === null || bcs === undefined || bcs <= 0) {
    return '还没有确认体况评分，先建档页确认一下，才能判断是偏胖还是偏瘦。'
  }
  return ''
})

const canOfferPlan = computed(() => {
  const bcs = props.dogProfile?.bcsScore
  if (planBlockedReason.value) return false
  // BCS 4-5 是理想区间（FEDIAF：犬应维持 BCS 4-5）——不推销计划
  return typeof bcs === 'number' && (bcs >= 6 || bcs <= 3)
})

async function loadPlan() {
  if (!props.dogId) {
    plan.value = null
    return
  }
  planLoading.value = true
  try {
    const res = await weightGoalPlanApi.current(props.dogId)
    plan.value = res.code === 0 ? (res.data ?? null) : null
  } catch {
    // 计划读不到不该影响体重记录功能本身
    plan.value = null
  } finally {
    planLoading.value = false
  }
}

function goToCreatePlan() {
  uni.navigateTo({
    url: `/pages/weight-goal-plan/index?dogId=${props.dogId}&mode=create`,
  })
}

function goToAdjustPlan() {
  uni.navigateTo({
    url: `/pages/weight-goal-plan/index?dogId=${props.dogId}&mode=adjust`,
  })
}

function confirmEndPlan() {
  uni.showModal({
    title: '结束计划',
    content: '结束后每日能量会立刻恢复成正常维持量。确定要结束吗？',
    confirmText: '结束',
    confirmColor: '#c0392b',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const result = await weightGoalPlanApi.end(props.dogId)
        if (result.code === 0) {
          uni.showToast({ title: '计划已结束', icon: 'none' })
          await loadPlan()
        } else {
          uni.showToast({ title: result.message || '操作失败', icon: 'none' })
        }
      } catch (error: any) {
        uni.showToast({ title: error?.message || '操作失败', icon: 'none' })
      }
    },
  })
}

async function resumePlan() {
  try {
    const result = await weightGoalPlanApi.resume(props.dogId)
    if (result.code === 0) {
      uni.showToast({ title: '计划已恢复', icon: 'none' })
      plan.value = result.data ?? null
    } else {
      uni.showToast({ title: result.message || '操作失败', icon: 'none' })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '操作失败', icon: 'none' })
  }
}
// ==================== 体重管理计划结束 ====================

/**
 * 体重单位（公斤 / 斤）。
 *
 * formData.weightKg 内部**始终是公斤** —— 这一点在三个体重输入处都一样：
 * 「斤」只存在于输入框那一层，输入事件立刻换算成公斤，下游（体重记录、
 * 档案当前体重、热量计算）永远只见到公斤。
 */
const weightUnit = ref<WeightUnit>('KG')
const weightUnitOptions: Array<{ value: WeightUnit; label: string }> = [
  { value: 'KG', label: '公斤' },
  { value: 'JIN', label: '斤' },
]
/** 输入框正在编辑的原始文本：单独存一份，避免换算打断顾客的按键序列 */
const weightInputText = ref('')
/** 刚记下的那一条（成功提示用；输入框会被清空，用这行文字告诉顾客数值去哪了） */
const lastSavedText = ref('')
/** 从引导入口进来时自动聚焦（顾客不用自己找输入框） */
/** 自定义组件实例：画布 API 需要它才能定位到组件内的 canvas */
const componentInstance = getCurrentInstance()?.proxy as any

const weightInputFocused = ref(false)
const weightUnitLabel = computed(() => getWeightUnitLabel(weightUnit.value))

const onWeightInput = (event: any) => {
  const raw = String(event?.detail?.value ?? '')
  weightInputText.value = raw
  formData.value.weightKg = parseWeightInputToKg(raw, weightUnit.value)
  // 又开始输了 → 收起"刚刚记下 xxx"那行（它只说明上一次保存）
  if (lastSavedText.value) {
    lastSavedText.value = ''
  }
}

const onWeightUnitChange = (unit: WeightUnit) => {
  if (unit === weightUnit.value) return
  // 先把当前输入按旧单位固化成公斤，再按新单位重新展示
  formData.value.weightKg = parseWeightInputToKg(
    weightInputText.value,
    weightUnit.value,
  )
  weightUnit.value = unit
  weightInputText.value = formatWeightForInput(
    formData.value.weightKg,
    weightUnit.value,
  )
}

/** 体重双向单位回显：只做客观换算，不做合理性判断 */
const weightEcho = computed(() =>
  formData.value.weightKg
    ? formatWeightEcho(formData.value.weightKg, weightUnit.value)
    : '',
)

const records = ref<WeightRecord[]>([])
/** 首次加载中：空态要等加载完再判断，否则会先闪一下"还没有体重记录" */
const recordsLoaded = ref(false)
const isSavingRecord = ref(false)
const syncToProfile = ref(false)
const syncToProfileTouched = ref(false)

const formData = ref<FormData>({
  recordDate: new Date().toISOString().split('T')[0],
  weightKg: '',
  note: '',
})

// 找到最近同步的记录ID
const lastSyncedRecordId = computed(() => {
  const syncedRecords = records.value.filter((r) => r.syncedToProfile)
  if (syncedRecords.length === 0) return null

  // 记录按日期降序排列，所以第一个就是最新的
  return syncedRecords[0].id
})

const syncOptionDescription = computed(() => {
  const latestRecordDate = records.value[0]?.recordDate || ''
  if (latestRecordDate && formData.value.recordDate < latestRecordDate) {
    return '补录较早日期时，建议先只保存历史记录。'
  }

  return '开启后会把这次记录同步为档案里的当前体重。'
})

watch(
  () => props.dogId,
  (nextDogId, prevDogId) => {
    if (nextDogId && nextDogId !== prevDogId) {
      resetForDog()
      void loadRecords()
      void loadPlan()
    }
  },
)

onMounted(() => {
  if (props.dogId) {
    void loadRecords()
    void loadPlan()
  }
})

function resetForDog() {
  records.value = []
  plan.value = null
  formData.value.weightKg = ''
  weightInputText.value = ''
  formData.value.note = ''
  formData.value.recordDate = new Date().toISOString().split('T')[0]
  syncToProfileTouched.value = false
  syncToProfile.value = resolveDefaultSyncToProfile()
}

// 加载体重记录
async function loadRecords() {
  if (!props.dogId) return

  try {
    const res = await request({
      url: `/dogs/${props.dogId}/weight-records`,
      method: 'GET',
    })

    if (res.code === 0 && res.data) {
      records.value = res.data.records || []
      if (!syncToProfileTouched.value) {
        syncToProfile.value = resolveDefaultSyncToProfile()
      }

      // 绘制图表：等一次渲染让 canvas 节点真正存在，再补两次重试 ——
      // 小程序里 nextTick 之后节点偶尔还没就绪，早画一次等于没画（白框）
      if (records.value.length > 0) {
        await nextTick()
        drawChartWithRetry()
      }
    }
  } catch (err) {
    console.error('[WeightManagementSection] Failed to load records:', err)
  } finally {
    // 成功失败都算"加载过"：失败时空态照旧显示，不要卡在空白
    recordsLoaded.value = true
  }
}

// 日期改变
function onDateChange(e: any) {
  formData.value.recordDate = e.detail.value
}

function onSyncToggle(e: any) {
  syncToProfileTouched.value = true
  syncToProfile.value = !!e.detail.value
}

function resolveDefaultSyncToProfile() {
  const currentWeight = props.dogProfile?.currentWeightKg ?? null
  const newWeight = parseFloat(formData.value.weightKg || '')
  const latestRecordDate = records.value[0]?.recordDate || null

  return shouldDefaultSyncCurrentWeightRecord({
    currentWeightKg: currentWeight,
    newWeightKg: newWeight,
    recordDate: formData.value.recordDate,
    latestRecordDate,
  })
}

const emit = defineEmits<{
  (event: 'dirty-change', value: boolean): void
}>()

/** 有没有填了体重但还没保存 —— 决定底部按钮是否可点 */
const hasPendingWeightInput = computed(() =>
  Boolean(String(weightInputText.value || '').trim()),
)

watch(hasPendingWeightInput, (value) => emit('dirty-change', value), { immediate: true })

/**
 * 对外入口（2026-10-02 引导流程要用）：focusInput = 把光标送进"今天体重"输入框，
 * 顾客从引导入口点进来就能直接打字，不用自己找输入框。
 */
function focusWeightInput() {
  weightInputFocused.value = true
}

defineExpose({ saveRecord, focusInput: focusWeightInput, flushAutoSaves })

// 保存记录
/**
 * 体重输入失焦 → 立刻记下（2026-10-03 老板定：删掉底部保存按钮，改实时保存）。
 *
 * 为什么是"失焦"而不是"停顿 1 秒"：体重是数字，打到一半（"6"）停下来
 * 不该被当成 6kg 存进去 —— 打完点别处/切走才算一条。
 * 没有有效体重（空着、或 0）就什么都不做，绝不会存半截数据。
 */
function onWeightInputBlur() {
  void flushAutoSaves()
}

/** 把等待中的体重输入落库（失焦、切标签、离开页面时调用） */
async function flushAutoSaves() {
  if (!String(weightInputText.value || '').trim()) {
    return
  }

  if (isSavingRecord.value || !props.showAddEntry) {
    return
  }

  await saveRecord()
}

async function saveRecord() {
  if (!props.dogId) {
    uni.showToast({
      title: '请先选择狗狗',
      icon: 'none',
    })
    return
  }

  // 验证输入
  if (!formData.value.weightKg || parseFloat(formData.value.weightKg) <= 0) {
    uni.showToast({
      title: '请输入有效的体重',
      icon: 'none',
    })
    return
  }

  const newWeight = parseFloat(formData.value.weightKg)
  isSavingRecord.value = true
  try {
    // 创建体重记录
    const res = await request({
      url: `/dogs/${props.dogId}/weight-records`,
      method: 'POST',
      data: {
        recordDate: formData.value.recordDate,
        weightKg: newWeight,
        note: formData.value.note || undefined,
      },
    })

    if (res.code === 0) {
      const syncRequested = syncToProfile.value
      let syncedToProfile = false
      if (syncRequested) {
        syncedToProfile = await updateDogWeight(newWeight)
        if (syncedToProfile) {
          await markRecordAsSynced(res.data.id)
        }
      }

      await loadRecords()
      // 阶段 B2-3：记完体重顺带刷新计划卡片 ——
      // 后端会在这一步按实测速率自动校正力度，卡片上的能量与速率都会变。
      await loadPlan()
      formData.value.weightKg = ''
      weightInputText.value = ''
      formData.value.note = ''
      formData.value.recordDate = new Date().toISOString().split('T')[0]
      syncToProfileTouched.value = false
      syncToProfile.value = resolveDefaultSyncToProfile()

      // 2026-10-03 老板实测："填完提示成功，但体重栏里的数值消失了"。
      // 数值确实没丢（它进了下面的「历史记录」），但输入框一清空就看不出所以然 ——
      // 所以这一行留在卡片上，直到下次输入：写清记了多少、去哪儿看。
      lastSavedText.value = `${newWeight} kg · ${formData.value.recordDate}`
      uni.showToast({
        title: syncRequested
          ? syncedToProfile
            ? '已保存并同步到档案'
            : '已保存记录，同步失败'
          : '已保存记录',
        icon: 'success',
      })
    }
  } catch (err) {
    console.error('[WeightManagementSection] Failed to save record:', err)
    uni.showToast({
      title: '保存失败',
      icon: 'none',
    })
  } finally {
    isSavingRecord.value = false
  }
}

// 更新狗狗档案体重
async function updateDogWeight(weightKg: number) {
  if (!props.dogId) return false

  try {
    await request({
      url: `/dogs/${props.dogId}`,
      method: 'PUT',
      data: {
        currentWeightKg: weightKg,
      },
    })

    uni.setStorageSync(getWeightSyncSignalKey(props.dogId), Date.now())
    uni.setStorageSync(getWeightSyncValueKey(props.dogId), weightKg)
    return true
  } catch (err) {
    console.error('[WeightManagementSection] Failed to update dog weight:', err)
    return false
  }
}

// 标记记录为已同步
async function markRecordAsSynced(recordId: string) {
  try {
    await request({
      url: `/dogs/weight-records/${recordId}/sync`,
      method: 'PUT',
      data: { synced: true },
    })
  } catch (err) {
    console.error('[WeightManagementSection] Failed to mark record as synced:', err)
  }
}

// 删除记录
async function deleteRecord(recordId: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: `/dogs/weight-records/${recordId}`,
            method: 'DELETE',
          })

          await loadRecords()

          uni.showToast({
            title: '删除成功',
            icon: 'success',
          })
        } catch (err) {
          console.error('[WeightManagementSection] Failed to delete record:', err)
          uni.showToast({
            title: '删除失败',
            icon: 'none',
          })
        }
      }
    },
  })
}

// 获取体重变化文字
function getChangeText(record: WeightRecord, index: number): string {
  if (index === records.value.length - 1) {
    return ''
  }

  const prevRecord = records.value[index + 1]
  return formatWeightChangeText(record.weightKg, prevRecord.weightKg)
}

// 获取变化样式类
function getChangeClass(record: WeightRecord, index: number): string {
  if (index === records.value.length - 1) {
    return ''
  }

  const prevRecord = records.value[index + 1]
  const diff = record.weightKg - prevRecord.weightKg

  if (diff > 0) {
    return 'increase'
  } else if (diff < 0) {
    return 'decrease'
  } else {
    return 'stable'
  }
}

/** 画一次 + 两次重试（间隔递增），确保画布节点就绪 */
function drawChartWithRetry() {
  const delays = [0, 220, 600]
  delays.forEach((delay) => {
    setTimeout(() => {
      try {
        drawChart()
      } catch (error) {
        console.error('[WeightManagementSection] 趋势图绘制失败:', error)
      }
    }, delay)
  })
}

// 绘制图表
//
// ⚠️ 2026-10-03 修（老板实测：体重趋势只有一块空白）：
//   画布在**自定义组件**里时，uni.createCanvasContext 必须带上组件实例，
//   否则找不到这张画布、draw() 静默什么都不画 —— 页面上就只剩一块白框。
//   项目里另一处画布（头像裁剪）一直是这么传的，这里漏了。
function drawChart() {
  const ctx = uni.createCanvasContext('weightChart', componentInstance)

  // 获取系统信息来计算正确的 canvas 尺寸
  // @ts-ignore - getWindowInfo may not exist in all platforms
  const windowInfo = uni.getWindowInfo?.() || uni.getSystemInfoSync?.()
  const screenWidth = windowInfo?.windowWidth || 375

  // 计算实际可用宽度（页面宽度 - padding 48rpx - section padding 60rpx）
  const canvasWidth = Math.floor(screenWidth * 0.86)
  const canvasHeight = 200 // 对应 CSS 的 400rpx (2rpx ≈ 1px)

  // 优化后的边距：让坐标轴贴近容器边缘
  const padding = {
    left: 20, // Y轴贴近左边
    right: 30, // 右边留更多空间（给数值标注，防止超出）
    top: 20, // 上边留白（给数值标注）
    bottom: 15, // X轴贴近下边
  }

  // 获取最近10条记录（反转顺序，从旧到新）
  const chartData = records.value.slice(0, 10).reverse()

  if (chartData.length === 0) return

  // 计算最大最小值
  const weights = chartData.map((r) => r.weightKg)
  const maxWeight = Math.max(...weights) + 1
  const minWeight = Math.min(...weights) - 1
  const weightRange = maxWeight - minWeight

  // 绘制坐标轴
  ctx.setStrokeStyle('#ddd')
  ctx.setLineWidth(1)

  // Y轴（贴近左边）
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, canvasHeight - padding.bottom)
  ctx.stroke()

  // X轴（贴近下边）
  ctx.beginPath()
  ctx.moveTo(padding.left, canvasHeight - padding.bottom)
  ctx.lineTo(canvasWidth - padding.right, canvasHeight - padding.bottom)
  ctx.stroke()

  // 绘制数据点和连线
  ctx.setStrokeStyle('#0d6b43')
  ctx.setFillStyle('#0d6b43')
  ctx.setLineWidth(2)

  // 计算可用绘图区域
  const chartWidth = canvasWidth - padding.left - padding.right
  const chartHeight = canvasHeight - padding.top - padding.bottom

  const points = chartData.map((record, index) => {
    const x = padding.left + (index / (chartData.length - 1 || 1)) * chartWidth
    const y =
      canvasHeight -
      padding.bottom -
      ((record.weightKg - minWeight) / weightRange) * chartHeight
    return { x, y, weight: record.weightKg, recordDate: record.recordDate }
  })

  // 绘制连线
  ctx.beginPath()
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y)
    } else {
      ctx.lineTo(point.x, point.y)
    }
  })
  ctx.stroke()

  // 绘制数据点和数值
  points.forEach((point) => {
    // 点
    ctx.beginPath()
    ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI)
    ctx.fill()

    // 数值（智能调整位置，防止超出容器）
    ctx.setFontSize(11)
    const text = point.weight.toFixed(1)
    const textWidth = text.length * 6 // 估算文字宽度

    let textX = point.x - textWidth / 2
    // 确保文字不超出边界
    if (textX < padding.left) {
      textX = padding.left
    }
    if (textX + textWidth > canvasWidth - padding.right) {
      textX = canvasWidth - padding.right - textWidth
    }

    ctx.fillText(text, textX, point.y - 10)
  })

  ctx.setFillStyle('#8b97a8')
  ctx.setFontSize(10)
  const tickIndexes = new Set(getWeightChartDateTickIndexes(points.length))
  points.forEach((point, index) => {
    if (!tickIndexes.has(index)) {
      return
    }

    const text = formatWeightRecordDateTick(point.recordDate)
    const textWidth = text.length * 5
    let textX = point.x - textWidth / 2
    if (textX < padding.left) {
      textX = padding.left
    }
    if (textX + textWidth > canvasWidth - padding.right) {
      textX = canvasWidth - padding.right - textWidth
    }
    ctx.fillText(text, textX, canvasHeight - 2)
  })

  ctx.draw()
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';





/* 输入卡片 */
.input-card {
  margin-top: 20rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  border-radius: 22rpx;
  padding: 20rpx;
}

.input-item {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.input-item:last-child {
  margin-bottom: 0;
}

/* 体重：输入框 + 单位切换（与建档页、档案总览页同一套样式） */
.weight-input-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.weight-input {
  flex: 1 1 auto;
  min-width: 0;
}

.weight-unit-toggle {
  display: flex;
  flex: 0 0 auto;
  padding: 3rpx;
  background: #eef3ea;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.weight-unit-option {
  padding: 0 14rpx;
  height: 52rpx;
  line-height: 52rpx;
  font-size: 23rpx;
  color: #6b6653;
  border-radius: 999rpx;
}

.weight-unit-option.active {
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
}

.input-label {
  font-size: 26rpx;
  color: #415b65;
  width: 200rpx;
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
}

.picker-button {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
}

.sync-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 20rpx;
}

.sync-option__copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.sync-option__title {
  font-size: 26rpx;
  color: #17313f;
  font-weight: 600;
}

.sync-option__desc {
  font-size: 22rpx;
  color: #7a8699;
  line-height: 1.5;
}

.sync-option__switch {
  transform: scale(0.9);
  transform-origin: right center;
}

/* 保存按钮 */



/* 图表 */
.chart-container {
  margin-top: 20rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  border-radius: 22rpx;
  padding: 20rpx;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
}

.chart-canvas {
  width: 100%;
  height: 400rpx;
  display: block;
}

/* 记录列表 */
.record-list {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.record-item {
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  border-radius: 16rpx;
  padding: 20rpx;
}

.record-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.record-date {
  font-size: 26rpx;
  color: #6b7d86;
  flex: 1;
}

.record-weight {
  font-size: 32rpx;
  font-weight: bold;
  color: #17313f;
  margin-right: 20rpx;
}

.record-change {
  font-size: 24rpx;
  font-weight: bold;
  min-width: 80rpx;
  text-align: right;
}

.record-change.increase {
  color: #e74c3c;
}

.record-change.decrease {
  color: #27ae60;
}

.record-change.stable {
  color: #999;
}

.record-note {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.record-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1px solid #e0e0e0;
}

.sync-badge {
  font-size: 22rpx;
  color: #27ae60;
  background: #e8f5e9;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.delete-btn {
  font-size: 24rpx;
  color: #e74c3c;
  margin-left: auto;
}

.weight-saved {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #0e6f78;
}

.weight-echo {
  display: block;
  margin-top: 8rpx;
  color: #6b7a70;
  font-size: 24rpx;
}

/* ==================== 体重管理计划卡片（阶段 B2-3） ==================== */

.plan-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.plan-card__badge {
  flex: 0 0 auto;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
}

.plan-card__badge--active {
  background: #eef4ea;
  color: #1e3a2f;
}

.plan-card__badge--maintenance {
  background: #e8f2ff;
  color: #1f6feb;
}

.plan-card__badge--paused {
  background: #fdf3e3;
  color: #b8730b;
}

.plan-progress {
  margin-top: 20rpx;
}

.plan-progress__numbers {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.plan-progress__done {
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.plan-progress__target {
  font-size: 24rpx;
  color: #6b7a70;
}

.plan-progress__bar {
  margin-top: 12rpx;
  height: 14rpx;
  border-radius: 999rpx;
  background: #edf0e8;
  overflow: hidden;
}

.plan-progress__fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #1e3a2f 0%, #3d7a5f 100%);
  transition: width 0.3s ease;
}

.plan-progress__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  color: #6b7a70;
}

.plan-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.plan-fact {
  flex: 1 1 30%;
  min-width: 180rpx;
  padding: 16rpx 18rpx;
  border-radius: 14rpx;
  background: #f8faf5;
}

.plan-fact__label {
  display: block;
  font-size: 22rpx;
  color: #8a8375;
}

.plan-fact__value {
  display: block;
  margin-top: 6rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.plan-fact__value--normal {
  color: #1a7f37;
}

.plan-fact__value--slow {
  color: #b8730b;
}

.plan-fact__value--fast {
  color: #c05621;
}

.plan-note {
  margin-top: 16rpx;
  padding: 14rpx 18rpx;
  border-radius: 12rpx;
  background: #f8faf5;
}

.plan-note--paused {
  background: #fdf3e3;
}

.plan-note--maintenance {
  background: #e8f2ff;
}

.plan-note__text {
  display: block;
  font-size: 23rpx;
  line-height: 1.6;
  color: #46564d;
}

.plan-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 22rpx;
}

.plan-btn {
  flex: 1 1 auto;
  margin: 0;
  padding: 0 26rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
  background: #f2f5ee;
  border-radius: 999rpx;
}

.plan-btn::after {
  border: none;
}

.plan-btn--primary {
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
}

.plan-btn--danger {
  color: #c0392b;
  background: #fdeceb;
}

.plan-entry-card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

</style>