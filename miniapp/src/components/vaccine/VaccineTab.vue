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
        :ignored-items="ignoredItems"
        :ignored-count="ignoredCount"
        @record="onRecordStep"
        @record-combo="onRecordCombo"
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
        :preset-date="editorDate"
        :preset="antibodyPreset"
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
        @add-manual="onAddManualRecord"
        @fix-row="onScanFixRow"
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

    <!-- 抗体检测报告：同一个识别服务、另一类文档（老板 2026-10-16：
         "抗体检测也需要接入 AI 识别，上传报告后自动录入表单，用户也可以手动纠正"）。
         识别出来直接开录入卡预填，家长照样能改（录入卡就是唯一录入器）。 -->
    <HealthDocumentScan
      ref="antibodyScanRef"
      v-if="dogId"
      :dog-id="dogId"
      :dog-name="dogName"
      document-type="ANTIBODY_REPORT"
      upload-type="vaccine"
      hide-trigger
      defer-confirm
      @scanned="onAntibodyScanned"
    />

      <PlanTimeline :plan="planSteps" :rhythm="rhythm" :next-key="nextKey" />

      <RecordList
        :records="records"
        :tests="tests"
        :loading="loading"
        :pending-review-count="pendingReviewCount"
        :conflicts="planConflicts"
        @edit-record="onEditRecord"
        @edit-test="onEditTest"
        @verify-record="onVerifyRecord"
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
/** 后端算好的"哪条记录为什么不作数"（给记录区显示） */
const planConflicts = computed(() => planData.value?.conflicts || [])
const catalogProducts = computed(() => readCatalogProducts(catalog.value))
const componentOptions = computed(() => readComponentOptions(catalog.value))

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
    // 自检 V15：后端原话可能是英文/JSON，不进界面（只进控制台）
    console.error('[VaccineTab] 免疫计划加载失败：', error?.message || error)
    loadError.value = '网络不太顺，点一下重新加载'
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
}

/* ══ 录入器 ═══════════════════════════════════════════════════════════════ */

const editorVisible = ref(false)
const editorMode = ref<'record' | 'antibody'>('record')
const editorRecord = ref<VaccineRecord | null>(null)
const editorTest = ref<AntibodyTest | null>(null)
const editorPresetName = ref('')
const editorPresetComponents = ref<string[]>([])
/** 预填日期（"补全这一条"用） */
const editorDate = ref('')
/**
 * 正在补全的是识别结果里的**哪一条**（空串 = 不是补全）。
 *
 * 存的是行的唯一标识 `key`，不是行号 —— 行号会因为家长中途删/加行而错位（见 V6）。
 * 补全并存好之后，把那一条从识别结果里**拿掉**：它已经作为一条真正的记录进去了，
 * 继续留着会让家长以为还没存。
 */
const editorFixKey = ref('')
/** 录入卡标题：新建一条 = 记一条接种记录；补记某一针 = 记录这一针（原型 D / H） */
const editorHeading = ref('记一条接种记录')

/** 底部「记一条」：一条空白记录 */
function addRecord() {
  editorFixKey.value = ''
  editorDate.value = ''
  editorMode.value = 'record'
  editorRecord.value = null
  editorTest.value = null
  editorPresetName.value = ''
  editorPresetComponents.value = []
  editorHeading.value = '记一条接种记录'
  editorVisible.value = true
  // 老板 2026-10-16 第 4 条：底部固定栏点「记一条」要**定位到输入窗**
  //（录入卡是内联的，不滚过去就等于"点了没反应"）。
  // 已经开着时再点也要滚（watch 不会触发）→ 所以这里直接滚一次。
  scrollToAnchor('vk-anchor-editor')
}

const antibodyScanRef = ref<{
  startScan?: () => void
  dismissFailure?: () => void
} | null>(null)

/**
 * 底部「上传疫苗本 / 报告」→ 抗体检测报告：**先识别**，识别出来再开卡预填。
 *
 * ⚠️ 自检 V33：这一页挂了**两个识别实例**（疫苗本 / 抗体报告），各自记着自己的
 * "没识别到内容"。开其中一个之前，先把另一个的提示收掉 —— 否则两块提示会同时挂在那。
 */
function addAntibodyTest() {
  scanRef.value?.dismissFailure?.()
  antibodyScanRef.value?.startScan?.()
}

/**
 * 抗体检测报告识别回来了 → 开录入卡，把识别到的填进去，家长照样能改。
 *
 * 识别不出来的情况由识别组件自己提示（"没识别到内容"那块）；
 * 这里只负责把结果铺到表单上。
 */
function onAntibodyScanned(payload: {
  drafts?: Record<string, unknown>[]
}) {
  const list = payload?.drafts || []
  /**
   * 什么都没读出来时**不开卡**。
   *
   * 识别组件在那种情况下已经给了"没识别到内容"的提示（路径：草稿为空 → 抛错 → 提示块），
   * 这里再开一张卡就等于给家长一张默认填好的表（项目=核心、结果=合格），
   * 那是**替他下结论** —— 他没测过也会被"填"出一个结论。
   */
  if (list.length === 0) return
  /**
   * ⚠️ 2026-10-16 修（自检 V7）：一份报告可能有好几页（核心一页、狂犬一页），
   * 识别回来是多条。原来只取 `list[0]`，**其余静默丢弃** ✗。
   * 现在：第一条先录，剩下的排队；存好一条自动接上下一条。
   */
  antibodyQueue.value = list.slice(1)
  const draft = list[0]
  const targets = Array.isArray(draft.targets) ? draft.targets.map(String) : []
  onAntibodyPreset({
    pendingPages: antibodyQueue.value.length,
    testedAt: String(draft.testedAt || ''),
    target: targets[0] === 'RABIES' ? 'RABIES' : 'CORE',
    /**
     * ⚠️ 2026-10-16 修（自检 V2）：原来读不到结论时默认 `'PASS'`（合格）——
     * 那等于**我们替兽医判了合格**，违反"不设阈值、不替兽医判读"。
     * 现在只有明确读到 PASS 才是 PASS，其余（含读不到）一律 `UNKNOWN`（报告没写结论）。
     */
    result: draft.result === 'PASS' || draft.result === 'FAIL' ? draft.result : 'UNKNOWN',
    value: String(draft.value || ''),
    unit: String(draft.unit || ''),
    attachments: Array.isArray(draft.attachments) ? draft.attachments.map(String) : [],
  })
  scrollToAnchor('vk-anchor-editor')
}

/**
 * 「记录这一针」（下一针 / 计划 / 两针一起打三处都走它）。
 *
 * 预填常见产品的第一支 —— 家长不用判断"该记在核心那边还是钩端那边"，
 * 选一支同时含两类的苗，两个类别同时完成（需求 R11）。日期默认为今天。
 */
function onRecordStep(step: VaccineStep | null) {
  editorFixKey.value = ''
  editorDate.value = ''
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

/** 抗体录入卡的预填（识别结果铺进来的那一份） */
/** 这份报告剩下还没录的几页（见 V7） */
const antibodyQueue = ref<Record<string, unknown>[]>([])

const antibodyPreset = ref<{
  testedAt: string
  target: 'CORE' | 'RABIES'
  result: 'PASS' | 'FAIL' | 'UNKNOWN'
  value: string
  unit: string
  attachments: string[]
  /** 这份报告还有几页没录（0 = 没有了） */
  pendingPages?: number
} | null>(null)

/** 把识别结果铺到抗体录入卡（家长随后可以逐项改） */
/** 存完一条抗体检测后，如果这份报告还有页没录，自动接上下一条 */
function openNextAntibodyInQueue() {
  const next = antibodyQueue.value[0]
  if (!next) return false
  antibodyQueue.value = antibodyQueue.value.slice(1)
  const targets = Array.isArray(next.targets) ? next.targets.map(String) : []
  onAntibodyPreset({
    pendingPages: antibodyQueue.value.length,
    testedAt: String(next.testedAt || ''),
    target: targets[0] === 'RABIES' ? 'RABIES' : 'CORE',
    result:
      next.result === 'PASS' || next.result === 'FAIL' ? next.result : 'UNKNOWN',
    value: String(next.value || ''),
    unit: String(next.unit || ''),
    attachments: Array.isArray(next.attachments) ? next.attachments.map(String) : [],
  })
  return true
}

function onAntibodyPreset(preset: {
  testedAt: string
  target: 'CORE' | 'RABIES'
  result: 'PASS' | 'FAIL' | 'UNKNOWN'
  value: string
  unit: string
  attachments: string[]
}) {
  editorMode.value = 'antibody'
  editorRecord.value = null
  editorTest.value = null
  editorFixKey.value = ''
  editorDate.value = ''
  antibodyPreset.value = preset
  editorHeading.value = ''
  editorVisible.value = true
}

/** 「先做抗体检测」：同一个录入器的抗体模式 */
function onAntibody(_step: VaccineStep | null) {
  editorFixKey.value = ''
  editorDate.value = ''
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
  editorFixKey.value = ''
  editorDate.value = ''
  editorHeading.value = '修改这条记录'
  editorVisible.value = true
  // 老板 2026-10-16 第 1 条：点记录区的「编辑」也要**定位到弹出窗口**
  //（录入卡是内联的，不滚过去就等于"点了没反应"）
  scrollToAnchor('vk-anchor-editor')
}

function onEditTest(test: AntibodyTest) {
  antibodyPreset.value = null
  antibodyQueue.value = []
  editorMode.value = 'antibody'
  editorTest.value = test
  editorRecord.value = null
  editorFixKey.value = ''
  editorDate.value = ''
  editorHeading.value = '修改这次抗体检测'
  editorVisible.value = true
  // 同上：抗体检测那一行点开也要定位过去
  scrollToAnchor('vk-anchor-editor')
}

/**
 * 内联卡片打开后**滚到它那里**。
 *
 * 为什么要这一步：录入卡不是弹窗，是插在页面里的一个块。家长在页面底部点
 * 「记一条」（或拍完疫苗本回到页面），卡片出现在**上方**，屏幕上什么都不会变 ——
 * 看起来就像"点了没反应"。
 */
function scrollToAnchor(id: string, attempt = 0) {
  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.select(`#${id}`).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      const rect = res && res[0]
      const viewport = res && res[1]
      if (!rect || !viewport) {
        /**
         * ⚠️ 2026-10-16 修（老板："有提醒弹窗时，点弹窗里的『去修改』之后定位不过去"）。
         *
         * 根因：小程序的 `nextTick` 只保证**数据已设**，不保证新子树已经在视图层**布局完成**。
         * 弹窗（`uni.showModal`）关掉之后紧接着查，节点常常还查不到 →
         * 老代码 `if (!rect) return` 就**静默放弃**了，于是"有时能滚、有时不能"。
         *
         * 现在：查不到就**隔一帧再试**（最多 6 次 ≈ 400ms），查到才滚。
         * 这样"弹窗关闭后布局稍慢"的情况也能滚到位。
         */
        if (attempt < 6) {
          setTimeout(() => scrollToAnchor(id, attempt + 1), 60)
        }
        return
      }
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
    /**
     * 这一条是"补全识别结果里的某一条" → 把它从待确认列表里拿掉。
     * 它已经作为一条真正的记录进去了；留着会让家长以为还没存。
     */
    /**
     * ⚠️ 2026-10-16 修（自检 V6）：原来按**行号**删，而行号会因为家长在下面
     * 删掉/新增某一行而错位 —— 补完存好，被拿掉的可能是**另一条** ✗。
     * 现在按行的**唯一标识**（`key`）删，怎么动都不会认错。
     */
    if (editorFixKey.value) {
      scanRows.value = scanRows.value.filter((row) => row.key !== editorFixKey.value)
      editorFixKey.value = ''
    }
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
    await refreshAfterWrite()
    // 这份报告还有页没录 → 直接接上下一条（别让家长自己想起来）
    if (!testId && openNextAntibodyInQueue()) {
      uni.showToast({ title: '已保存，接着录下一页', icon: 'none' })
      return
    }
    uni.showToast({ title: '已保存', icon: 'success' })
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
  dismissFailure?: () => void
  unconfirmedDraftCount?: () => number
} | null>(null)

const scanRows = ref<VaccineScanRow[]>([])

function startScan() {
  // 对称处理：开疫苗本识别前，先收掉抗体报告那边的失败提示（自检 V33）
  antibodyScanRef.value?.dismissFailure?.()
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

/**
 * 保存识别结果（逐条存）。
 *
 * ⚠️ 2026-10-16 老板："一次识别出多条记录时，现在的报错机制很难让用户第一时间
 *    定位到哪一条记错了。" —— 老写法是**遇到第一条失败就整批中断**，只弹一句 toast，
 *    家长既不知道是哪条、也不知道剩下的几条到底存没存 ✗。
 *
 * 现在：
 *   · 逐条存，**一条失败不影响后面的**（能存的先存进去）；
 *   · 失败的那条**把原因挂回它自己那一行**（标红 + 说清 + 给「去补全这一条」）；
 *   · 提示改成"存了几条、还剩几条要处理"，而不是一句笼统的报错；
 *   · 只要还有要处理的，这一页就不关 —— 家长能立刻看到是哪一条。
 */
async function onScanSave(rows: VaccineScanRow[], kept: VaccineScanRow[] = []) {
  if (!props.dogId || saving.value) return
  saving.value = true
  const failedRows: VaccineScanRow[] = []
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
      try {
        await vaccineApi.records.create(props.dogId, payload)
        saved += 1
      } catch (error: any) {
        // 这一条没存上：原因写在它自己身上，其余的继续存
        failedRows.push({
          ...row,
          error: String(error?.message || '这一条没存上，再试一次'),
        })
      }
    }

    if (failedRows.length === 0) {
      /**
       * ⚠️ 自检 V4 的最后一米：不能一律清空。
       * 识别结果页里可能有"没填全、没交上来"的几条（`kept`）——
       * 清空会让卡片卸载，那几条跟着消失 ✗。有 kept 就留着它们，卡片继续在。
       */
      scanRows.value = kept
      uni.showToast({
        title: kept.length > 0
          ? `已保存 ${saved} 条，还有 ${kept.length} 条没填全`
          : `已保存 ${saved} 条`,
        icon: kept.length > 0 ? 'none' : 'success',
      })
    } else {
      // 只留下要处理的那几条（已存进去的不再重复出现）
      scanRows.value = failedRows
      uni.showToast({
        title: saved > 0
          ? `已保存 ${saved} 条，还有 ${failedRows.length} 条要处理`
          : `有 ${failedRows.length} 条要处理`,
        icon: 'none',
      })
    }
    await refreshAfterWrite()
  } finally {
    saving.value = false
  }
}

/**
 * 某一条认不出含什么疫苗 → 交给**唯一录入器**补全。
 *
 * 为什么不在这一页解决：判断"这一针顶哪一类"要靠病种，而病种要么查产品库、
 * 要么由家长勾 —— 这一页只有名称 + 日期两列（需求 R12），勾不了。
 *
 * 补全并存好之后，把这一条从识别结果里拿掉（它已经作为一条记录进去了）。
 */
function onScanFixRow(row: VaccineScanRow, index: number) {
  editorMode.value = 'record'
  editorRecord.value = null
  editorTest.value = null
  editorPresetName.value = String(row.name || '')
  editorPresetComponents.value = []
  editorDate.value = String(row.date || '')
  editorHeading.value = '补全这一条'
  editorFixKey.value = String(row.key || '')
  editorVisible.value = true
  scrollToAnchor('vk-anchor-editor')
}

/**
 * 识别结果页里"补一条（识别漏掉的）"。
 *
 * 走**唯一录入器**而不是在结果页硬填一个名字：录入器里有产品库、有"含哪些疫苗"
 * 可勾 —— 手写的名字一旦认不出类别，在后端会被拦下来（记录必须能影响计划，需求 R6），
 * 只有录入器能当场把病种勾上，不至于卡住。
 *
 * ⚠️ 不关掉识别结果：补完这一条，那几条待确认的还在原地等着。
 */
function onAddManualRecord() {
  addRecord()
  editorHeading.value = '补一条接种记录'
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
  /** 底部「上传疫苗本 / 报告」选到"抗体检测报告"时 → 开抗体录入卡 */
  addAntibodyTest,
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
  /* 与上面那排书签之间留一点呼吸（老板 2026-10-16：
     "下一针的窗口与 4 个标签中间能否留点空？这样排版更好看一点"）。
     书签下沿是紧贴内容区的，不留这一下，"下一针"那张卡会像粘在标签上。 */
  padding-top: 18rpx;
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
