<template>
  <!-- ══ 疫苗板块 · 编排（需求 7.1 / 技术方案 3.4）══════════════════════════
       从上到下：狗狗摘要由页面 Banner 负责 → 下一针 → 免疫计划 → 接种记录。

       ⚠️ 前端**不做任何计划推算**：这一页只有一个数据来源（主接口），
          任何写操作成功后**重新拉一次**，用后端返回的结果整屏重绘
          （不在本地改状态、不重排、不算窗口）。
       ⚠️ 页面只说顾客语言：没有"系统会怎么记 / 会算进计划"这类内部说明。 -->
  <view class="vaccine-tab">
    <!-- 加载失败 ≠ 没有记录（需求 R13）：给一块看得见的提示 + 一个重试键 -->
    <view v-if="loadError" class="vk-state">
      <text class="vk-state__title">免疫计划没加载出来</text>
      <text class="vk-state__desc">{{ loadError }}</text>
      <text class="vk-state__btn" @tap="reload">重新加载</text>
    </view>

    <view v-else-if="loading && !planData" class="vk-state">
      <text class="vk-state__title">正在读取免疫计划…</text>
      <text class="vk-state__desc">马上就好。</text>
    </view>

    <template v-else>
      <!-- 档案里没有生日 → 后端算不出计划（返回空）。这时**不能**说"都打完了"，
           那是假话：真实原因是缺一个必要的输入。 -->
      <view v-if="planData && !planData.birthday" class="vk-state">
        <text class="vk-state__title">档案里还缺一个生日</text>
        <text class="vk-state__desc">免疫计划是按生日算的 —— 填上生日，这里就知道该什么时候打了。</text>
        <text class="vk-state__btn" @tap="goFillBirthday">去填生日</text>
      </view>

      <template v-else>
      <NextCard
        :next="nextStep"
        :later-steps="laterSteps"
        :ignored-items="ignoredItems"
        :ignored-count="ignoredCount"
        @record="onRecordStep"
        @record-combo="onRecordCombo"
        @scan="startScan"
        @antibody="onAntibody"
        @ignore="onIgnore"
        @restore="onRestore"
      />

      <!-- 唯一录入器：三个入口共用它（底部记一条 / 记录这一针 / 识别后的补录） -->
      <view v-if="editorVisible" id="vk-anchor-editor">
      <RecordEditor
        v-if="editorVisible"
        :visible="editorVisible"
        :heading="editorHeading"
        :mode="editorMode"
        :record="editorRecord"
        :test="editorTest"
        :products="catalogProducts"
        :component-options="componentOptions"
        :preset-name="editorPresetName"
        :preset-components="editorPresetComponents"
        :saving="saving"
        @save-record="onSaveRecord"
        @save-test="onSaveTest"
        @remove="onRemoveFromEditor"
        @cancel="closeEditor"
      />
      </view>

      <!-- 识别结果逐条确认（只有名称 + 日期两列，需求 R12） -->
      <ScanConfirm
        v-if="scanRows.length > 0"
        id="vk-anchor-scan"
        :drafts="scanRows"
        :saving="saving"
        @save="onScanSave"
        @discard="onScanDiscard"
      />

      <PlanTimeline :plan="planSteps" :rhythm="rhythm" :next-key="nextKey" />

      <RecordList
        :records="records"
        :tests="tests"
        :loading="loading"
        :pending-review-count="pendingReviewCount"
        @edit-record="onEditRecord"
        @edit-test="onEditTest"
        @verify-record="onVerifyRecord"
        @add-test="onAntibody(null)"
        @preview="previewAttachments"
      />
      </template>
    </template>

    <!-- 忽略时问一句原因（这次先不打 / 不再接种了）-->
    <IgnoreSheet
      :visible="Boolean(ignoreStep)"
      :saving="saving"
      @confirm="onIgnoreConfirm"
      @cancel="ignoreStep = null"
    />

    <!-- 识别服务（四类记录共用）。疫苗侧只取结果里的**名称 + 日期**；
         `defer-confirm`：确认这一步由上面的 ScanConfirm 承担。 -->
    <HealthDocumentScan
      ref="scanRef"
      v-if="dogId"
      :dog-id="dogId"
      :dog-name="dogName"
      document-type="VACCINE_BOOK"
      upload-type="vaccine"
      hide-trigger
      defer-confirm
      @scanned="onScanned"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import NextCard from './NextCard.vue'
import PlanTimeline from './PlanTimeline.vue'
import RecordList from './RecordList.vue'
import RecordEditor from './RecordEditor.vue'
import ScanConfirm from './ScanConfirm.vue'
import IgnoreSheet from './IgnoreSheet.vue'
import HealthDocumentScan from '../dog-profile/HealthDocumentScan.vue'
import { vaccineApi } from '../../api/vaccines'
import { todayDateText } from '../../utils/date'
import {
  readCatalogProducts,
  readComponentOptions,
  scanRowReview,
} from '../../domain/vaccine/catalog'
import type {
  AntibodyTest,
  AntibodyTestPayload,
  VaccineCatalogResponse,
  VaccinePlanResponse,
  VaccineRecord,
  VaccineRecordPayload,
  VaccineScanRow,
  VaccineStep,
} from '../../domain/vaccine/types'

const props = withDefaults(defineProps<{
  dogId: string
  /** 这只狗的名字（识别疫苗本时用来提醒"报告上的动物名对不上"） */
  dogName?: string
}>(), {
  dogName: '',
})

const emit = defineEmits<{
  (event: 'records-changed'): void
}>()

const loading = ref(false)
const saving = ref(false)
const loadError = ref('')

const planData = ref<VaccinePlanResponse | null>(null)
const records = ref<VaccineRecord[]>([])
const tests = ref<AntibodyTest[]>([])
const catalog = ref<VaccineCatalogResponse | null>(null)

const planSteps = computed<VaccineStep[]>(() => planData.value?.plan || [])
const nextStep = computed<VaccineStep | null>(() => planData.value?.next || null)
const nextKey = computed(() => nextStep.value?.key || '')
const rhythm = computed(() => planData.value?.rhythm || '')
const ignoredItems = computed(() => planData.value?.ignored?.items || [])
const ignoredCount = computed(() => planData.value?.ignored?.count || 0)
const pendingReviewCount = computed(() => planData.value?.pendingReview || 0)
const catalogProducts = computed(() => readCatalogProducts(catalog.value))
const componentOptions = computed(() => readComponentOptions(catalog.value))

/** 排在"下一针"之后的项（只用来写"还有：…"，不做任何推算） */
const laterSteps = computed(() => {
  const key = nextKey.value
  const list = planSteps.value
  if (!key) return list
  const at = list.findIndex((item) => item.key === key)
  return at >= 0 ? list.slice(at + 1) : list
})

/* ══ 取数 ═════════════════════════════════════════════════════════════════
 *
 * 一次把四份取回来：计划（含下一针 / 忽略 / 节奏 / 待核对）、接种记录、
 * 抗体检测、产品与病种词表。
 *
 * ⚠️ 计划失败**整块报错**，不半屏渲染 —— "加载失败"和"没有记录"是两件事（R13）。
 * ⚠️ 词表失败不算失败：病种有兜底，产品库空着只是少一个选择入口。
 */
async function loadAll() {
  const dogId = props.dogId
  if (!dogId) return
  loading.value = true
  loadError.value = ''
  try {
    // ⚠️ 逐个 const 取出来（不用数组解构）：小程序打包后调试时变量名还能对上，
    //    排查"哪一份没回来"比一行解构好认。
    const responses = await Promise.all([
      vaccineApi.plan(dogId),
      vaccineApi.records.list(dogId),
      vaccineApi.antibodyTests.list(dogId),
      vaccineApi.catalog().catch(() => null),
    ])
    const planResponse = responses[0]
    const recordList = responses[1]
    const testList = responses[2]
    const catalogResponse = responses[3]

    planData.value = planResponse.data
    records.value = recordList || []
    tests.value = testList || []
    catalog.value = catalogResponse ? catalogResponse.data : null
  } catch (error: any) {
    loadError.value = error?.message || '网络不太顺，点一下重新加载'
  } finally {
    loading.value = false
  }
}

/** 缺生日时，把家长送到档案编辑页（就这一条路） */
function goFillBirthday() {
  uni.navigateTo({ url: `/pages/dog-create/index?dogId=${props.dogId}` })
}

function reload() {
  void loadAll()
}

watch(() => props.dogId, () => {
  planData.value = null
  records.value = []
  tests.value = []
  void loadAll()
}, { immediate: true })

/** 任何写操作成功之后都走它：重新拉一次，整屏重绘（技术方案 3.4） */
async function refreshAfterWrite() {
  await loadAll()
  emit('records-changed')
}

/* ══ 录入器 ═══════════════════════════════════════════════════════════════ */

const editorVisible = ref(false)
const editorMode = ref<'record' | 'antibody'>('record')
const editorRecord = ref<VaccineRecord | null>(null)
const editorTest = ref<AntibodyTest | null>(null)
const editorPresetName = ref('')
const editorPresetComponents = ref<string[]>([])
/** 录入卡标题：新建一条 = 记一条接种记录；补记某一针 = 记录这一针（原型 D / H） */
const editorHeading = ref('记一条接种记录')

/** 底部「记一条」：一条空白记录 */
function addRecord() {
  editorMode.value = 'record'
  editorRecord.value = null
  editorTest.value = null
  editorPresetName.value = ''
  editorPresetComponents.value = []
  editorHeading.value = '记一条接种记录'
  editorVisible.value = true
}

/**
 * 「记录这一针」（下一针 / 计划 / 两针一起打三处都走它）。
 *
 * 预填常见产品的第一支 —— 家长不用判断"该记在核心那边还是钩端那边"，
 * 选一支同时含两类的苗，两个类别同时完成（需求 R11）。日期默认为今天。
 */
function onRecordStep(step: VaccineStep | null) {
  editorMode.value = 'record'
  editorRecord.value = null
  editorTest.value = null
  editorPresetName.value = (step?.products || [])[0] || ''
  editorPresetComponents.value = []
  editorHeading.value = '记录这一针'
  editorVisible.value = true
}

/**
 * 组合那一针（「这一针可以和钩端螺旋体一起打」下面那个按钮）。
 *
 * ⚠️ 预填的必须是**组合产品**（同时含两类的联苗），不能沿用主按钮那一支 ——
 * 否则点"两针一起打"记下来的还是只有核心那一针，家长以为钩端也记上了。
 */
function onRecordCombo(products: string[]) {
  editorMode.value = 'record'
  editorRecord.value = null
  editorTest.value = null
  editorPresetName.value = (products || [])[0] || ''
  editorPresetComponents.value = []
  editorHeading.value = '记录这一针'
  editorVisible.value = true
}

/** 「先做抗体检测」：同一个录入器的抗体模式 */
function onAntibody(_step: VaccineStep | null) {
  editorMode.value = 'antibody'
  editorRecord.value = null
  editorTest.value = null
  editorPresetName.value = ''
  editorPresetComponents.value = []
  editorVisible.value = true
}

function onEditRecord(record: VaccineRecord) {
  editorMode.value = 'record'
  editorRecord.value = record
  editorTest.value = null
  editorHeading.value = '修改这条记录'
  editorVisible.value = true
}

function onEditTest(test: AntibodyTest) {
  editorMode.value = 'antibody'
  editorTest.value = test
  editorRecord.value = null
  editorHeading.value = '修改这次抗体检测'
  editorVisible.value = true
}

/**
 * 内联卡片打开后**滚到它那里**。
 *
 * 为什么要这一步：录入卡不是弹窗，是插在页面里的一个块。家长在页面底部点
 * 「记一条」（或拍完疫苗本回到页面），卡片出现在**上方**，屏幕上什么都不会变 ——
 * 看起来就像"点了没反应"。
 */
function scrollToAnchor(id: string) {
  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.select(`#${id}`).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      const rect = res && res[0]
      const viewport = res && res[1]
      if (!rect || !viewport) return
      const top = Math.max(0, rect.top + viewport.scrollTop - 16)
      uni.pageScrollTo({ scrollTop: top, duration: 200 })
    })
  })
}

watch(editorVisible, (open) => {
  if (open) scrollToAnchor('vk-anchor-editor')
})

watch(
  () => scanRows.value.length,
  (count) => {
    if (count > 0) scrollToAnchor('vk-anchor-scan')
  },
)

function closeEditor() {
  editorVisible.value = false
  editorRecord.value = null
  editorTest.value = null
}

async function onSaveRecord(payload: VaccineRecordPayload, recordId: string) {
  if (!props.dogId || saving.value) return
  saving.value = true
  try {
    if (recordId) await vaccineApi.records.update(props.dogId, recordId, payload)
    else await vaccineApi.records.create(props.dogId, payload)
    closeEditor()
    uni.showToast({ title: '已保存', icon: 'success' })
    await refreshAfterWrite()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '没保存成功，再试一次', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function onSaveTest(payload: AntibodyTestPayload, testId: string) {
  if (!props.dogId || saving.value) return
  saving.value = true
  try {
    if (testId) await vaccineApi.antibodyTests.update(props.dogId, testId, payload)
    else await vaccineApi.antibodyTests.create(props.dogId, payload)
    closeEditor()
    uni.showToast({ title: '已保存', icon: 'success' })
    await refreshAfterWrite()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '没保存成功，再试一次', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function onRemoveFromEditor(id: string) {
  if (!props.dogId || !id) return
  const isTest = Boolean(editorTest.value)
  const confirmed = await confirmModal({
    title: isTest ? '删掉这次抗体检测？' : '删掉这条接种记录？',
    // 原件属于"疫苗本"，删记录不删原件（需求 R8）
    content: '记录删掉后，疫苗本原件还在。',
    confirmText: '删除',
  })
  if (!confirmed) return

  saving.value = true
  try {
    if (isTest) await vaccineApi.antibodyTests.remove(props.dogId, id)
    else await vaccineApi.records.remove(props.dogId, id)
    closeEditor()
    uni.showToast({ title: '已删除', icon: 'success' })
    await refreshAfterWrite()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '没删掉，再试一次', icon: 'none' })
  } finally {
    saving.value = false
  }
}

/** 待核对的那一条：核对 = 把 productVerified 置真（R7：核对通过才算数） */
async function onVerifyRecord(record: VaccineRecord) {
  if (!props.dogId || !record?.id) return
  const confirmed = await confirmModal({
    title: '这条记录还没核对',
    content: '对着疫苗本看一眼名称和日期，没问题就确认一下 —— 读错了会影响后面的提醒。',
    // ⚠️ 小程序的 showModal 按钮**最多 4 个字**，超了弹窗既不显示也不报错
    confirmText: '核对无误',
  })
  if (!confirmed) return

  saving.value = true
  try {
    await vaccineApi.records.update(props.dogId, record.id, { productVerified: true })
    uni.showToast({ title: '已核对', icon: 'success' })
    await refreshAfterWrite()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '没核对成功，再试一次', icon: 'none' })
  } finally {
    saving.value = false
  }
}

/* ══ 识别疫苗本 ═══════════════════════════════════════════════════════════ */

const scanRef = ref<{
  startScan?: () => void
  unconfirmedDraftCount?: () => number
} | null>(null)

const scanRows = ref<VaccineScanRow[]>([])

function startScan() {
  scanRef.value?.startScan?.()
}

/**
 * 拿到识别结果：**只取名称 + 日期**（需求 R12），外加照片原件（R10 要留档）。
 *
 * 哪几行要核对由 `scanRowReview` 按三条判据算（狂犬 / 名字认不出 / 日期可疑）；
 * 待核对的先不算进安排（后端按 productVerified=false 处理）。
 */
function onScanned(payload: { drafts: Record<string, any>[]; documentType?: string }) {
  const today = todayDateText()
  const drafts = payload?.drafts || []
  scanRows.value = drafts.map((draft, index) => {
    const row = {
      name: String(draft?.productName || draft?.vaccineName || '').trim(),
      date: String(draft?.vaccinationDate || '').slice(0, 10),
    }
    const review = scanRowReview(row, catalogProducts.value, today)
    const attachments = Array.isArray(draft?.attachments) ? draft.attachments.map(String) : []
    return {
      key: `scan-${index}-${row.name}-${row.date}`,
      name: row.name,
      date: row.date,
      needsReview: review.needsReview,
      reason: review.reason,
      verified: false,
      attachments,
    }
  })
}

async function onScanSave(rows: VaccineScanRow[]) {
  if (!props.dogId || saving.value) return
  saving.value = true
  let saved = 0
  try {
    for (const row of rows) {
      const payload: VaccineRecordPayload = {
        vaccineName: row.name,
        vaccinationDate: row.date,
        // 没核对的先不算数（R7）—— 后端按它把这一条排除在排期之外
        productVerified: !row.needsReview || row.verified,
      }
      if (row.attachments && row.attachments.length > 0) payload.attachments = row.attachments
      await vaccineApi.records.create(props.dogId, payload)
      saved += 1
    }
    scanRows.value = []
    uni.showToast({ title: `已保存 ${saved} 条`, icon: 'success' })
    await refreshAfterWrite()
  } catch (error: any) {
    // 存进去的那几条不重复存：把剩下的留在这一页（与老流程同一条纪律）
    scanRows.value = rows.slice(saved)
    uni.showToast({ title: error?.message || '有记录没存上，剩下的还在这', icon: 'none' })
    await refreshAfterWrite()
  } finally {
    saving.value = false
  }
}

function onScanDiscard() {
  scanRows.value = []
}

/* ══ 忽略 / 恢复（需求 R5）════════════════════════════════════════════════ */

const ignoreStep = ref<VaccineStep | null>(null)

function onIgnore(step: VaccineStep) {
  ignoreStep.value = step
}

async function onIgnoreConfirm(reason: 'NOT_NOW' | 'STOPPED') {
  const step = ignoreStep.value
  if (!step || !props.dogId || saving.value) return
  saving.value = true
  try {
    await vaccineApi.setDecision(props.dogId, step.key, { decision: 'SKIP', reason })
    ignoreStep.value = null
    await refreshAfterWrite()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '没设成功，再试一次', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function onRestore(key: string) {
  if (!props.dogId || !key) return
  saving.value = true
  try {
    await vaccineApi.clearDecision(props.dogId, key)
    await refreshAfterWrite()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '没恢复成功，再试一次', icon: 'none' })
  } finally {
    saving.value = false
  }
}

/* ══ 原件预览（R10：整本只展示一次、可预览）═════════════════════════════ */

function previewAttachments(urls: string[]) {
  if (!urls || urls.length === 0) return
  uni.previewImage({ urls, current: urls[0] })
}

/* ══ 小工具 ═══════════════════════════════════════════════════════════════ */

/** 一句确认（小程序原生弹窗包成 Promise；取消返回 false） */
function confirmModal(options: { title: string; content?: string; confirmText?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: options.title,
      content: options.content || '',
      confirmText: options.confirmText || '确定',
      cancelText: '先不',
      success: ({ confirm }: { confirm: boolean }) => resolve(Boolean(confirm)),
      fail: () => resolve(false),
    })
  })
}

/* ══ 给页面（底部常驻栏 / 切书签守卫）用的入口 ═══════════════════════════ */

defineExpose({
  reload,
  startScan,
  /** 底部「记一条」→ 打开录入器 */
  addRecord,
  /** 录入器开着（有内容还没保存）→ 切书签前拦一下 */
  countUnsaveableDrafts: () => (editorVisible.value ? 1 : 0),
  /** 识别结果还没逐条确认 → 切书签前拦一下 */
  unconfirmedDraftCount: () => scanRows.value.length,
})
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vaccine-tab {
  display: flex;
  flex-direction: column;
  gap: $vk-gap-block;
}

.vk-state {
  background: $vk-card-bg;
  border: 1px solid $vk-card-border;
  border-radius: $vk-card-radius;
  padding: 28rpx 24rpx;
}

.vk-state__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: $vk-text-strong;
}

.vk-state__desc {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-text-muted;
  line-height: 1.55;
  margin-top: 8rpx;
}

.vk-state__btn {
  display: block;
  margin-top: 20rpx;
  text-align: center;
  line-height: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  background: $vk-brand;
  color: $vk-white;
  font-size: 26rpx;
  font-weight: 600;
}

.vk-notice {
  background: $vk-check-bg;
  border-radius: 22rpx;
  padding: 18rpx 22rpx;
}

.vk-notice__text {
  font-size: $vk-font-sub;
  color: $vk-check-fg;
  line-height: 1.55;
}
</style>
