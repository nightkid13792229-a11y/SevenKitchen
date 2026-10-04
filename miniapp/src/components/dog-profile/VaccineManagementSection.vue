<template>
  <view class="health-section">
    <!-- 内嵌到健康管理页时不显示（书签已经写着「疫苗」）—— 老板 2026-10-01 要求 -->
    <view v-if="!embedded" class="health-section__header">
      <view class="health-section__heading">
        <text class="health-section__title">疫苗管理</text>
        <text class="health-section__desc">
          记录每次接种，接下来该打什么由免疫程序自动算。
        </text>
      </view>
      <text class="health-section__count">{{ records.length }} 条</text>
    </view>

    <!-- 上传疫苗本图片（2026-10-01，第六期）。
         一本疫苗本通常有**多条**记录，识别后一起填进来，顾客确认一次即可。
         2026-10-03 起常开（手填入口）；AI 识别由底部「新增记录」调起。 -->
    <HealthDocumentScan
      ref="scanRef"
      v-if="dogId"
      :dog-id="dogId"
      :hide-trigger="!showAddEntry || hideScanTrigger"
      document-type="VACCINE_BOOK"
      upload-type="vaccine"
      button-text="上传疫苗本图片"
      hint-text="一次能读出本子上的多条记录；也可以直接手填"
      @scanned="onVaccineBookScanned"
    />

    <view v-if="dueSummaryText" class="vaccine-due-banner">
      <text class="vaccine-due-text">{{ dueSummaryText }}</text>
    </view>

    <view v-if="loading" class="health-section__empty">
      <text class="health-section__empty-title">疫苗记录加载中</text>
    </view>

    <!-- 空态（2026-10-04 老板提问后改）。
         原来这里只有干巴巴一句"还没有记录"，而上面的疫苗计划板块还会单独弹一张
         "档案里还没有接种记录"—— **同一件事说了两遍**。
         现在合成一处：计划板块在零记录时整块不渲染，这句话由这里说。
         位置也更对：它就长在记录列表该在的地方。 -->
    <view v-else-if="records.length === 0" class="health-section__empty">
      <!-- 只有一句。
           2026-10-03 老板就定过："没有记录就写没有记录即可，不用下面那行小字"；
           2026-10-04 又问"为什么会提醒了一次……在下方又进行了一次提醒呢"——
           所以不是加话，而是**把重复的那处删掉、只留这里一句**。
           该做什么，底部那个常驻的「新增记录」已经写着了。 -->
      <text class="health-section__empty-title">档案里还没有接种记录</text>
    </view>

    <view
      v-for="(record, index) in records"
      :key="record.id || `draft-${index}`"
      class="vaccine-card health-card"
      :class="{ [`vaccine-card--focus-${index}`]: true }"
    >
      <view class="vaccine-card__header" @tap="toggleExpanded(record, index)">
        <view class="vaccine-card__summary">
          <view class="vaccine-card__title-row">
            <text class="vaccine-card__name">{{ draftOf(record, index).vaccineName || '未填疫苗名' }}</text>
            <text class="vaccine-card__status" :class="statusClass(draftOf(record, index))">
              {{ statusLabel(draftOf(record, index).status) }}
            </text>
          </view>
          <text class="vaccine-card__detail">
            接种 {{ draftOf(record, index).vaccinationDate || '未填日期' }}
          </text>
          <text v-if="dueHint(draftOf(record, index))" class="vaccine-card__due" :class="dueClass(draftOf(record, index))">
            {{ dueHint(draftOf(record, index)) }}
          </text>
        </view>
        <!-- 删除 + 展开（2026-10-04 老板提问后改）。
             原来"删除"藏在展开后的表单最底下 —— 老板的原话是
             "为什么不能像就诊记录一样，提供一个删除按钮和删除弹窗提醒呢？"
             其实弹窗一直都有（删除疫苗记录？/ 删除 / 保留），只是入口藏太深，
             没人找得到。现在挪到卡片脸上，跟就诊记录一致。
             @tap.stop 是必须的：不然点删除会顺带把卡片展开/收起。 -->
        <view class="vaccine-card__header-actions">
          <!-- 删除按钮**不再要求 record.id**（2026-10-05）。
               原来草稿（尤其是"拍疫苗本"识别出来、还没保存的那几条）看不到删除键，
               可 removeRecord 本来就支持删草稿（本地列表里摘掉）。
               结果就是：识别错了想删掉某一条，找不到入口。 -->
          <text
            class="vaccine-card__delete"
            :class="{ 'vaccine-card__delete--disabled': isBusy }"
            @tap.stop="removeRecord(record, index)"
          >删除</text>
          <text class="vaccine-card__toggle" @tap.stop="toggleExpanded(record, index)">
            {{ expandedIndex === index ? '收起' : '展开' }}
          </text>
        </view>
      </view>

      <view v-if="expandedIndex === index" class="vaccine-card__body">
        <view class="field-group">
          <text class="field-label">疫苗名称</text>
          <input
            class="field-input"
            type="text"
            placeholder="例如：狂犬疫苗"
            :value="draftOf(record, index).vaccineName"
            :focus="focusIndex === index"
            @input="updateDraft(index, 'vaccineName', $event.detail.value)"
            @blur="clearFocus(index)"
          />
          <view class="vaccine-name-tags">
            <text
              v-for="name in commonVaccineNames"
              :key="name"
              class="vaccine-name-tag"
              @tap="updateDraft(index, 'vaccineName', name)"
            >{{ name }}</text>
          </view>
        </view>

        <view class="field-group">
          <text class="field-label">接种日期</text>
          <picker
            mode="date"
            :value="draftOf(record, index).vaccinationDate"
            @change="updateDraft(index, 'vaccinationDate', $event.detail.value)"
          >
            <view class="field-picker">
              {{ draftOf(record, index).vaccinationDate || '请选择接种日期' }}
            </view>
          </picker>
        </view>

        <!-- 「下次接种」字段已删除（2026-10-05 老板："请把这个字段删掉"）。
             前一轮只是改了措辞、想说明白"核心疫苗和狂犬是自动算的"，
             但老板的判断更干脆：**这个字段本身就不该存在**。
             提醒本来就该由系统按免疫程序算出来，让顾客手填一个日期，
             等于把"该不该提醒"的责任推给他 —— 而且他多半不知道该填什么。

             ⚠️ 后端字段 nextDueDate **保留不动**（additive，老记录里可能存着值）：
               · 记录卡片上若老数据有值，仍然显示"还有 N 天到期"；
               · buildPayload 仍会把草稿里原有的值原样带上，不会被清掉。
             只是顾客端不再有输入口。 -->
        <view class="field-group">
          <text class="field-label">备注（可选）</text>
          <textarea
            class="field-textarea"
            placeholder="例如：接种机构、批号、接种后反应"
            :value="draftOf(record, index).notes"
            @input="updateDraft(index, 'notes', $event.detail.value)"
          />
        </view>

        <!-- 报告原件（2026-10-01 第九期）：上传疫苗本留下的原图。
             没有原件的记录（手工填写）不显示这一块，不留空位。 -->
        <view v-if="attachmentList(record).length > 0" class="field-group">
          <text class="field-label">报告原件</text>
          <view class="vaccine-attachment-list">
            <view
              v-for="(attachment, attachmentIndex) in attachmentList(record)"
              :key="`${record.id || index}-attachment-${attachmentIndex}`"
              class="vaccine-attachment"
              @tap="previewAttachment(attachment)"
            >
              <text class="vaccine-attachment__title">
                {{ attachmentDisplay(attachment, attachmentIndex).title }}
              </text>
              <text class="vaccine-attachment__action">预览</text>
            </view>
          </view>
          <text class="vaccine-attachment__hint">
            这是当初上传的疫苗本原图，换医院、出行要用时可以打开给对方看。
          </text>
        </view>

        <view class="vaccine-card__actions">
          <!-- 2026-10-03：手动保存按钮下线（底部保存键也一起下线了），改实时保存。
               正常时什么都不显示；只有"还差必填"和"保存中"要说话。
               2026-10-04：删除按钮已挪到卡片头部，这里只剩保存状态。 -->
          <text v-if="savingIndex === index" class="vaccine-card__autosave vaccine-card__autosave--quiet">
            保存中…
          </text>
          <text v-else-if="autoSaveNotice(index)" class="vaccine-card__autosave">
            {{ autoSaveNotice(index) }}
          </text>
          <text v-else-if="isJustSaved(index)" class="vaccine-card__autosave vaccine-card__autosave--quiet">
            已保存
          </text>
        </view>
      </view>
    </view>

    <!-- 板块内那个新增按钮已下线（2026-10-04 老板提问后改）。
         老板："在记录板块中有一个新增按钮，在最下方还有一个新增记录的
         按钮呢？不是重复了吗？" —— 是重复。底部那个是常驻的，而且功能更全
         （会先问"上传疫苗本图片 AI 识别"还是"手动加一条"）。
         板块内再放一个，等于同一件事两个入口，还长得不一样。
         `addRecord()` 仍然由底部那个按钮通过 ref 调起，功能没少。 -->
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { scrollPageToSelector } from '../../utils/page-scroll'
import { dogApi, type VaccineRecordCreatePayload } from '../../api/dogs'
import {
  buildHealthAttachmentDisplayMeta,
  normalizeHealthAttachmentList,
  previewHealthAttachment,
} from '../../utils/health-records'
import HealthDocumentScan from './HealthDocumentScan.vue'

interface VaccineRecord {
  id: string
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  /**
   * 报告原件（2026-10-01 第九期）。
   * 拍疫苗本识别出来的记录会把顾客拍的原图存在这里，是接种凭证；
   * 手工填写的记录是空数组。
   */
  attachments?: string[]
}

interface VaccineDraft {
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
}

const props = defineProps<{
  dogId: string
  /**
   * 内嵌到健康管理页：隐藏每行的「保存」，改由底部那个自适应按钮统一保存。
   * （顾客不必在每一行里找保存键。）
   */
  externalSave?: boolean
  /**
   * 内嵌到健康管理页：同时隐藏板块头（「疫苗管理」+ N 条）——
   * 上面书签已经写着「疫苗」，重复一遍只会把正文往下推。
   */
  embedded?: boolean
  /**
   * 是否显示"新增"入口（拍疫苗本 + 手动加一条）。
   *
   * 2026-10-02 老板要求收敛新增入口：标签页只做结果呈现与手动编辑，
   * 2026-10-03 起常开：AI 拍疫苗本走底部「新增记录」，这里留给手填，
   * 顾客仍然是在这个板块里完成录入；平时不显示，避免出现第二个入口。
   */
  showAddEntry?: boolean
  /**
   * 隐藏板块自带的「拍疫苗本」触发行（2026-10-03）。
   * 底部「新增记录」已经按标签直接调起拍疫苗本了，这里再来一个就是重复。
   */
  hideScanTrigger?: boolean
}>()

const emit = defineEmits<{
  (event: 'dirty-change', value: boolean): void
}>()

/**
 * 这一行的草稿是否与原值不同。
 *
 * ensureDrafts 会给**每一行**都建草稿，所以"脏"不能只看有没有草稿，
 * 要逐字段和原值比。
 */
function isDirty(record: VaccineRecord, index: number) {
  const draft = drafts[draftKey(record, index)]
  if (!draft) return false

  const base = toDraft(record)
  return (Object.keys(base) as (keyof VaccineDraft)[]).some(
    (field) => draft[field] !== base[field],
  )
}

/**
 * 对外的两个入口（2026-10-02 引导流程要用）：
 *   · startScan   → 直接调起"拍疫苗本"（AI 读出多条接种记录）
 *   · addRecord   → 手动加一条空白疫苗记录
 */
defineExpose({
  startScan: () => scanRef.value?.startScan?.(),
  addRecord,
  /** 切标签/离开页面时把等待中的自动保存立刻执行（2026-10-03） */
  flushAutoSaves,
})

/**
 * 常见疫苗名：一点即选，避免顾客手打（与过敏原标签同一思路）。
 *
 * ⚠️ 2026-10-04 改：**原来 8 个全是"病名"**（犬瘟热、犬细小病毒…），
 * 但顾客疫苗本上印的是**产品名/联数**（犬四联、卫佳伍、英特威）。
 * 两边对不上 —— 顾客拿着本子找不到自己那个词，只能手打或随便点一个。
 *
 * 现在按"本子上真会写的写法"排：
 *   · 联数名（犬二联/四联/八联）—— 国产进口都这么叫
 *   · 疫苗种类（狂犬疫苗）
 *   · 病名（有些本子确实按病名写）
 *
 * 品牌名（卫佳伍、英特威…）等产品清单核实完再加进来 —— 那份清单要对着
 * 国家兽药基础数据库和说明书核，不能凭印象写。
 */
const commonVaccineNames = [
  // 本子上最常出现的联数写法
  '狂犬疫苗',
  '犬二联',
  '犬四联',
  '犬八联',
  // 按病名写的本子
  '犬瘟热',
  '犬细小病毒',
  '犬传染性肝炎',
  '犬副流感',
  '犬窝咳',
  '钩端螺旋体',
]

/**
 * 状态取值（**选项已下线，只留显示**，2026-10-04 老板提问后改）。
 *
 * 顾客端不再让用户选状态 —— 一条接种记录记的就是"已经打过"，
 * 没有第二种可能。这里保留常量只为一件事：老记录里可能存着别的值，
 * 卡片上要照旧显示，不能变成空白。
 */
const STATUS_LABELS: Record<string, string> = {
  COMPLETED: '已接种',
  SCHEDULED: '已预约',
  OVERDUE: '已逾期',
}

const scanRef = ref<{ startScan?: () => void } | null>(null)
const records = ref<VaccineRecord[]>([])
const drafts = reactive<Record<string, VaccineDraft>>({})
const loading = ref(false)
const expandedIndex = ref(-1)
const savingIndex = ref(-1)
const deletingKey = ref('')
const isBusy = computed(() => savingIndex.value >= 0 || Boolean(deletingKey.value))

/**
 * 有没有填了但还没保存的行 —— 决定底部按钮是否可点。
 *
 * ⚠️ 这段**必须留在 records / drafts 声明之后**（2026-10-02 修的一个真 bug）：
 * 它原来写在文件靠前的位置，而 `records` 声明在后面 ——
 * `{ immediate: true }` 会在 setup 期间立刻求值，那一刻 `records` 还是 undefined，
 * 抛 `TypeError: Cannot read properties of undefined (reading 'value')`，
 * 整个「疫苗」板块的 setup 直接失败（开发者工具控制台刷满同一条报错），
 * 底部保存按钮的"有未保存内容"状态也从来没被算出来过。
 */
const hasPendingDraft = computed(() =>
  records.value.some((record, index) =>
    Boolean(String(draftOf(record, index).vaccineName || '').trim()) && isDirty(record, index),
  ),
)

watch(hasPendingDraft, (value) => emit('dirty-change', value), { immediate: true })

const today = getTodayDateString()

function getTodayDateString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function toDraft(record: Partial<VaccineRecord>): VaccineDraft {
  const status = String(record.status || '')
  return {
    vaccineName: String(record.vaccineName || ''),
    vaccinationDate: String(record.vaccinationDate || '').slice(0, 10),
    nextDueDate: String(record.nextDueDate || '').slice(0, 10),
    notes: String(record.notes || ''),
    // 认的是"显示名表"（含退休的 OVERDUE），不是"可选项表" ——
    // 老记录是 OVERDUE 就原样带着，别因为选项里没有了就悄悄改成已接种。
    status: (STATUS_LABELS[status] ? status : 'COMPLETED') as VaccineDraft['status'],
  }
}

function draftKey(record: VaccineRecord, index: number) {
  return record.id || `draft-${index}`
}

/**
 * 记录变化后统一重建草稿（新增 / 载入 / 删除都走这里）。
 *
 * 草稿绝不能"边渲染边创建"：那等于在渲染期间改响应式状态，
 * 索引一旦错位（删了中间一条）就会把 A 的编辑内容写到 B 身上。
 */
function ensureDrafts() {
  for (const key of Object.keys(drafts)) {
    delete drafts[key]
  }

  records.value.forEach((record, index) => {
    drafts[draftKey(record, index)] = toDraft(record)
  })
}

function draftOf(record: VaccineRecord, index: number): VaccineDraft {
  return drafts[draftKey(record, index)] || toDraft(record)
}

function updateDraft(index: number, field: keyof VaccineDraft, value: string) {
  const record = records.value[index]
  if (!record) return
  const draft = draftOf(record, index)
  // status 是受限联合类型（下拉框保证取值合法），其余字段都是普通字符串
  if (field === 'status') {
    draft.status = value as VaccineDraft['status']
  } else {
    draft[field] = value
  }

  // 又改了 —— "已保存"那行小字先撤掉，免得它跟"保存中…"打架
  if (savedNotices.value[index]) {
    const next = { ...savedNotices.value }
    delete next[index]
    savedNotices.value = next
  }

  // 实时保存（2026-10-03 老板定：底部保存键下线）。
  // 日期这类"点一下就有值"的改动立刻存；文本输入停顿 1.2 秒再存。
  const immediate = field !== 'vaccineName' && field !== 'notes'
  scheduleAutoSave(record, index, { immediate })
}

/* ── 自动保存（2026-10-03）────────────────────────────────────────────
 * 一条疫苗记录＝疫苗名 + 接种日期（后端必填）。所以：
 *   · 两样都齐了才存，缺任何一样只在卡片上提示「填完自动保存」；
 *   · 文本输入停顿 1.2 秒存，日期/状态一改就存；
 *   · 切标签/离开页面时由 flushAutoSaves 立刻落库。
 */
const AUTO_SAVE_DELAY_MS = 1200
const autoSaveTimers = new Map<number, ReturnType<typeof setTimeout>>()
const autoSaveNotices = ref<Record<number, string>>({})

/** 这条能不能存（与 saveRecord 的校验同一套规则） */
function autoSaveBlockReason(record: VaccineRecord, index: number): string {
  const draft = draftOf(record, index)
  if (!draft.vaccineName.trim()) return '还差疫苗名称，填完自动保存'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.vaccinationDate)) return '还差接种日期，填完自动保存'
  return ''
}

function scheduleAutoSave(
  record: VaccineRecord,
  index: number,
  options: { immediate?: boolean } = {},
) {
  const pending = autoSaveTimers.get(index)
  if (pending) {
    clearTimeout(pending)
    autoSaveTimers.delete(index)
  }

  if (options.immediate) {
    void runAutoSave(record, index)
    return
  }

  autoSaveTimers.set(
    index,
    setTimeout(() => {
      autoSaveTimers.delete(index)
      void runAutoSave(record, index)
    }, AUTO_SAVE_DELAY_MS),
  )
}

async function runAutoSave(record: VaccineRecord, index: number) {
  if (!isDirty(record, index)) {
    clearNotice(index)
    return
  }

  const reason = autoSaveBlockReason(record, index)
  if (reason) {
    autoSaveNotices.value = { ...autoSaveNotices.value, [index]: reason }
    return
  }

  if (isBusy.value) {
    // 上一次还在存：稍后再来（不排队也安全，改完这次还会再排一次）
    scheduleAutoSave(record, index)
    return
  }

  clearNotice(index)
  await saveRecord(record, index)
}

function clearNotice(index: number) {
  if (autoSaveNotices.value[index]) {
    const next = { ...autoSaveNotices.value }
    delete next[index]
    autoSaveNotices.value = next
  }
}

/** 把等待中的自动保存立刻执行（切标签、离开页面、收起卡片时用） */
function flushAutoSaves() {
  for (const [index, timer] of Array.from(autoSaveTimers.entries())) {
    clearTimeout(timer)
    autoSaveTimers.delete(index)
    const record = records.value[index]
    if (record) void runAutoSave(record, index)
  }
}

function autoSaveNotice(index: number): string {
  return autoSaveNotices.value[index] || ''
}

/** 失焦之后把自动聚焦标记清掉 —— 否则这一行会一直被"要求聚焦" */
function clearFocus(index: number) {
  if (focusIndex.value === index) {
    focusIndex.value = -1
  }
}

function toggleExpanded(record: VaccineRecord, index: number) {
  expandedIndex.value = expandedIndex.value === index ? -1 : index
}

/**
 * 状态的中文名（**只用于显示**）。
 *
 * 顾客端已经没有状态选择器了（见上面 STATUS_LABELS 的注释）——
 * 这个函数存在的唯一理由是：老记录里可能存着「已预约」「已逾期」，
 * 卡片上要照旧显示出来，不能变成空白或错显示成"已接种"。
 */
function statusLabel(status: string) {
  return STATUS_LABELS[status] || '已接种'
}

/**
 * 这条疫苗记录的报告原件（2026-10-01 第九期）。
 *
 * 拍疫苗本识别出来的记录带着原图；手工填写的没有 —— 空数组，
 * 卡片上就不显示「报告原件」这一块，不留空位。
 *
 * ⚠️ 2026-10-04 补回：上一轮"去掉状态选择器"时，我用脚本按位置删函数，
 * 结果把这三个跟状态无关的函数一起删掉了（脚本找到的是**别的函数的注释**，
 * 于是从那里一路删到这里）。后果很隐蔽 —— 构建不报错、源码 grep 测试也照过，
 * 但**一有新记录卡片要渲染就抛 `attachmentList is not a function`**，
 * 整个组件重渲染失败，表现就是老板看到的"点手动加一条没有任何反应"。
 * 教训：源码手术要用精确替换，不能按位置找。
 */
function attachmentList(record?: VaccineRecord | Record<string, any> | null): string[] {
  return normalizeHealthAttachmentList((record as any)?.attachments)
}

function attachmentDisplay(url: string, index: number) {
  return buildHealthAttachmentDisplayMeta(url, index)
}

async function previewAttachment(url: string) {
  await previewHealthAttachment(url)
}

function statusClass(draft: VaccineDraft) {
  return {
    'vaccine-card__status--done': draft.status === 'COMPLETED',
    'vaccine-card__status--scheduled': draft.status === 'SCHEDULED',
    'vaccine-card__status--overdue': draft.status === 'OVERDUE',
  }
}

/** 距下次到期还有几天（负数 = 已过期） */
function daysUntil(dateText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null
  }

  const target = new Date(`${dateText}T00:00:00`)
  const base = new Date(`${getTodayDateString()}T00:00:00`)
  if (Number.isNaN(target.getTime())) {
    return null
  }

  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

function dueHint(draft: VaccineDraft) {
  if (!draft.nextDueDate) {
    return ''
  }

  const days = daysUntil(draft.nextDueDate)
  if (days === null) {
    return ''
  }

  if (days < 0) {
    return `已过期 ${Math.abs(days)} 天（到期日 ${draft.nextDueDate}）`
  }

  if (days === 0) {
    return `今天到期（${draft.nextDueDate}）`
  }

  return `还有 ${days} 天到期（${draft.nextDueDate}）`
}

function dueClass(draft: VaccineDraft) {
  const days = draft.nextDueDate ? daysUntil(draft.nextDueDate) : null
  return {
    'vaccine-card__due--soon': days !== null && days >= 0 && days <= 30,
    'vaccine-card__due--overdue': days !== null && days < 0,
  }
}

/**
 * 顶部提醒条：只统计"未来 30 天内到期"和"已经过期"的，
 * 不做推送通知 —— 微信订阅消息需要顾客逐次授权，这里先给页面内的提醒。
 */
const dueSummaryText = computed(() => {
  const overdue: string[] = []
  const upcoming: string[] = []

  for (const record of records.value) {
    const draft = toDraft(record)
    if (!draft.nextDueDate) continue
    const days = daysUntil(draft.nextDueDate)
    if (days === null) continue

    if (days < 0) {
      overdue.push(draft.vaccineName || '未填疫苗名')
    } else if (days <= 30) {
      upcoming.push(draft.vaccineName || '未填疫苗名')
    }
  }

  const parts: string[] = []
  if (overdue.length > 0) {
    parts.push(`${overdue.join('、')} 已过期`)
  }
  if (upcoming.length > 0) {
    parts.push(`${upcoming.join('、')} 30 天内到期`)
  }

  return parts.join('；')
})

watch(
  () => props.dogId,
  (dogId) => {
    void loadRecords(dogId)
  },
  { immediate: true },
)

async function loadRecords(dogId = props.dogId) {
  if (!dogId) {
    records.value = []
    return
  }

  loading.value = true

  try {
    const res: any = await dogApi.healthRecords.vaccine.list(dogId)
    if (res?.code !== 0) {
      throw new Error(res?.message || '加载疫苗记录失败')
    }

    const list = res?.data?.records
    records.value = (Array.isArray(list) ? list : [])
      .map((item: any) => ({
        id: String(item?.id || ''),
        vaccineName: String(item?.vaccineName || ''),
        vaccinationDate: String(item?.vaccinationDate || '').slice(0, 10),
        nextDueDate: String(item?.nextDueDate || '').slice(0, 10),
        notes: String(item?.notes || ''),
        status: toDraft(item).status,
      }))
      // 最近接种的排在最前：接口按写入顺序返回，那个顺序对顾客没有意义
      .sort((a: VaccineRecord, b: VaccineRecord) =>
        b.vaccinationDate.localeCompare(a.vaccinationDate))

    // 记录刷新后重建草稿，避免留下已被删除记录的编辑态
    ensureDrafts()
    if (expandedIndex.value >= records.value.length) {
      expandedIndex.value = -1
    }
  } catch (error: any) {
    records.value = []
    ensureDrafts()
    uni.showToast({ title: error?.message || '加载疫苗记录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/**
 * 疫苗本识别结果 → 填进草稿列表（老板第 5 条：确认一次就自动填表）。
 *
 * 只填表、不保存 —— 顾客核对后自己按保存。
 */
function onVaccineBookScanned(payload: { drafts: Record<string, any>[] }) {
  for (const draft of payload.drafts) {
    records.value.push({
      id: '',
      __localId: `vaccine-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      vaccineName: String(draft.vaccineName || ''),
      vaccinationDate: String(draft.vaccinationDate || ''),
      nextDueDate: String(draft.nextDueDate || ''),
      notes: String(draft.notes || ''),
      status: 'COMPLETED',
      // 2026-10-01 第九期：顾客拍的疫苗本原图跟着草稿一起过来，存进这条记录 ——
      // 疫苗本是接种凭证，出行/寄养/换医院都可能要看原件。
      // 一张本子上的多条接种记录共用同一张原图（照片就是那一页）。
      attachments: attachmentList(draft),
    } as any)
  }
  /*
   * 识别完**直接存**（2026-10-05 修的一个洞）。
   *
   * 原来这里只"填表"，提示"核对后保存"—— 可是手动保存键在 2026-10-03
   * 就随着"改实时保存"一起下线了，**根本没有保存键可按**。
   * 后果：识别出来的记录看着像已经存好的（卡片长得一模一样），
   * 实际 `id` 是空的，于是：
   *   · 删除键不显示（那时它是 v-if="record.id"）；
   *   · 后端一条都没有 → 疫苗计划那边认为"还没有接种记录"，整块不显示。
   * 老板这两个疑问（"为什么没有删除按钮""计划在哪"）根子都是它。
   *
   * 现在跟全站一致：**实时保存**。存完顾客照样能改、能删。
   */
  const scanned = payload.drafts.length
  uni.showToast({ title: `已识别 ${scanned} 条，正在保存…`, icon: 'none' })

  records.value.forEach((record, index) => {
    if (record.id) return
    if (autoSaveBlockReason(record, index)) return
    void runAutoSave(record, index)
  })
}

/**
 * 新增一条空白记录（底部「新增记录」→「手动加一条」调这里）。
 *
 * ⚠️ 2026-10-05 补了两件事（老板："在选择手动加一条之后，为什么没有定位到
 * 编辑窗口呢？"）：
 *
 *   1. **滚到新卡片**。新记录是**追加在列表末尾**的，前面已经有几条时
 *      它落在屏幕外 —— 顾客点完"手动加一条"看到的还是原来那一屏，
 *      自然觉得"没反应"。
 *   2. **把光标落进"疫苗名称"**。这是第一个要填的字段，直接给键盘，
 *      顾客不用再点一次。
 *
 * 两件事都必须在 DOM 更新之后做，所以放在 nextTick 里。
 */
function addRecord() {
  const draft: VaccineRecord = {
    id: '',
    vaccineName: '',
    vaccinationDate: today,
    nextDueDate: '',
    notes: '',
    status: 'COMPLETED',
  }

  records.value = [...records.value, draft]
  ensureDrafts()
  const target = records.value.length - 1
  expandedIndex.value = target
  focusIndex.value = target

  // 等这一屏渲染出来再滚、再落光标；拿不到元素就静默跳过，不挡主流程
  nextTick(() => {
    scrollToRecordCard(target)
  })
}

/** "疫苗名称"输入框是否要自动聚焦（新增一条时打开，避免一直弹键盘） */
const focusIndex = ref(-1)

/** 把某一条记录滚进可视区。用小程序的 pageScrollTo + 唯一 class。 */
function scrollToRecordCard(index: number) {
  scrollPageToSelector(`.vaccine-card--focus-${index}`, 260)
}

function buildPayload(
  draft: VaccineDraft,
  record?: VaccineRecord,
): VaccineRecordCreatePayload {
  const payload: VaccineRecordCreatePayload = {
    vaccineName: draft.vaccineName.trim(),
    vaccinationDate: draft.vaccinationDate,
    status: draft.status,
    notes: draft.notes.trim() || null,
    // 报告原件（2026-10-01 第九期）：拍疫苗本留下的原图跟着记录一起存；
    // 手工填写时是空数组，明确传空数组才算"这条没有原件"。
    attachments: attachmentList(record),
  }

  // 空到期日不能传空字符串（后端按日期校验），直接不带这个字段
  if (draft.nextDueDate) {
    payload.nextDueDate = draft.nextDueDate
  }

  return payload
}

/**
 * 保存一条疫苗记录。
 *
 * ⚠️ 2026-10-04 两处改动（老板提问："为什么在我选择了疫苗名称之后，
 * 它就会提醒已保存，并帮我收起了疫苗记录呢？"）：
 *
 *   1. **不再收起卡片。** 原来存完一律 `expandedIndex = -1`。
 *      而新增一条时接种日期默认是今天，所以顾客一点"犬瘟热"这个标签，
 *      两个必填就齐了 → 立刻自动保存 → 卡片当场收起来，
 *      后面想补"下次接种""备注"都没得填，得再点一次展开。
 *   2. **不再弹"已保存"toast。** 实时保存是**每一次改动**都会发生的，
 *      每改一下弹一次，既吵又会盖住页面。改成卡片上一行小字"已保存"，
 *      下一次改动就消失。
 *
 * 顺带修了一个原来被"收起"掩盖掉的问题：**展开的是哪一条不能按下标记**。
 * 存完 `loadRecords()` 会按接种日期重排，新增的那条会从末尾挪到前面，
 * 同一个下标就指到别的记录身上了。所以这里存完按**id 重新定位**。
 */
async function saveRecord(record: VaccineRecord, index: number) {
  if (isBusy.value) return

  const draft = draftOf(record, index)
  if (!draft.vaccineName.trim()) {
    uni.showToast({ title: '请填写疫苗名称', icon: 'none' })
    return
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.vaccinationDate)) {
    uni.showToast({ title: '请选择接种日期', icon: 'none' })
    return
  }

  savingIndex.value = index

  try {
    const payload = buildPayload(draft, record)
    const savedId = String(record.id || '')
    const res: any = record.id
      ? await dogApi.healthRecords.vaccine.update(props.dogId, record.id, payload)
      : await dogApi.healthRecords.vaccine.create(props.dogId, payload)

    if (res?.code !== 0) {
      throw new Error(res?.message || '保存失败')
    }

    // 新增时后端才给 id —— 拿到它，重排之后才能把展开状态跟回同一条
    const newId = String(res?.data?.id || savedId || '')
    await loadRecords()

    if (newId) {
      const relocated = records.value.findIndex((item) => item.id === newId)
      if (relocated >= 0) {
        expandedIndex.value = relocated
        markSaved(relocated)
      }
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败，请重试', icon: 'none' })
  } finally {
    savingIndex.value = -1
  }
}

/**
 * 卡片上的"已保存"小字。
 *
 * 自动保存不弹 toast（太吵、会盖住页面），改成卡片内一行字，
 * 下一次改动就清掉 —— 顾客要的只是"知道它存进去了"。
 */
const savedNotices = ref<Record<number, boolean>>({})
const savedNoticeTimers = new Map<number, ReturnType<typeof setTimeout>>()

function markSaved(index: number) {
  savedNotices.value = { ...savedNotices.value, [index]: true }

  const pending = savedNoticeTimers.get(index)
  if (pending) clearTimeout(pending)
  savedNoticeTimers.set(
    index,
    setTimeout(() => {
      savedNoticeTimers.delete(index)
      if (!savedNotices.value[index]) return
      const next = { ...savedNotices.value }
      delete next[index]
      savedNotices.value = next
    }, 2000),
  )
}

function isJustSaved(index: number): boolean {
  return Boolean(savedNotices.value[index])
}

function removeRecord(record: VaccineRecord, index: number) {
  if (isBusy.value) return

  const draft = draftOf(record, index)
  const name = draft.vaccineName || '这条疫苗记录'

  uni.showModal({
    title: '删除疫苗记录？',
    content: `删除后「${name}」的接种与到期信息都会消失，不能恢复。`,
    confirmText: '删除',
    cancelText: '保留',
    success: (result) => {
      if (result.confirm) {
        void doRemove(record)
      }
    },
  })
}

async function doRemove(record: VaccineRecord) {
  if (!record.id) {
    records.value = records.value.filter(item => item !== record)
    ensureDrafts()
    expandedIndex.value = -1
    return
  }

  deletingKey.value = record.id

  try {
    const res: any = await dogApi.healthRecords.vaccine.delete(props.dogId, record.id)
    if (res?.code !== 0) {
      throw new Error(res?.message || '删除失败')
    }

    uni.showToast({ title: '已删除', icon: 'success' })
    expandedIndex.value = -1
    await loadRecords()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '删除失败，请重试', icon: 'none' })
  } finally {
    deletingKey.value = ''
  }
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.vaccine-due-banner {
  margin-top: 18rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.vaccine-due-text {
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

.vaccine-card {
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: 22rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.vaccine-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.vaccine-card__summary {
  flex: 1 1 auto;
  min-width: 0;
}

.vaccine-card__title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}

.vaccine-card__name {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.vaccine-card__status {
  padding: 4rpx 16rpx;
  font-size: 21rpx;
  border-radius: 999rpx;
}

.vaccine-card__status--done {
  color: #1e3a2f;
  background: #e6efe1;
}

.vaccine-card__status--scheduled {
  color: #8a6f3d;
  background: #f6efe0;
}

.vaccine-card__status--overdue {
  color: #8c4a3a;
  background: #f7e6e0;
}

.vaccine-card__detail {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.vaccine-card__due {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #6b6653;
}

.vaccine-card__due--soon {
  color: #8a6f3d;
  font-weight: 600;
}

.vaccine-card__due--overdue {
  color: #8c4a3a;
  font-weight: 600;
}

/* 卡片头部右侧：删除 + 展开（2026-10-04 从展开区挪上来的） */
.vaccine-card__header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/*
 * 删除按钮：与就诊记录同一套观感（淡红底、红字、圆角），
 * 免得两个板块的删除长得不一样，顾客以为是两回事。
 */
.vaccine-card__delete {
  padding: 0 18rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  color: #a63f3f;
  background: rgba(218, 82, 82, 0.08);
}

.vaccine-card__delete--disabled {
  opacity: 0.5;
}

/* 字段下面的一句说明（例如"核心疫苗和狂犬的时间系统会自动算"） */
.field-hint {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  line-height: 1.5;
  color: #8a968a;
}

.vaccine-card__toggle {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #b08d4f;
}

.vaccine-card__body {
  margin-top: 22rpx;
}

.field-group + .field-group {
  margin-top: 24rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b6653;
}

.vaccine-attachment-list {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.vaccine-attachment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: rgba(15, 107, 67, 0.06);
}

.vaccine-attachment__title {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: #26261f;
}

.vaccine-attachment__action {
  margin-left: 16rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #0f6b43;
}

.vaccine-attachment__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8c8574;
}

.field-input {
  margin-top: 10rpx;
  width: 100%;
  height: 84rpx;
  box-sizing: border-box;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
}

.field-picker {
  margin-top: 10rpx;
  min-height: 84rpx;
  line-height: 84rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
}

.field-textarea {
  margin-top: 10rpx;
  width: 100%;
  min-height: 150rpx;
  box-sizing: border-box;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
}

.field-inline-action {
  display: inline-block;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: #b08d4f;
}

.vaccine-name-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.vaccine-name-tag {
  padding: 10rpx 22rpx;
  font-size: 23rpx;
  color: #4a4638;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.vaccine-card__actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 26rpx;
}

.vaccine-card__autosave {
  align-self: center;
  margin-left: auto;
  font-size: 21rpx;
  color: #b26a2f;
}

.vaccine-card__autosave--quiet {
  color: #8a968a;
}

.vaccine-card__action {
  margin: 0;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 26rpx;
  border-radius: 999rpx;
}

.vaccine-card__action::after {
  border: none;
}

.vaccine-card__action--ghost {
  flex: 0 0 auto;
  padding: 0 36rpx;
  color: #6b6653;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
}

.vaccine-card__action--primary {
  flex: 1 1 auto;
  font-weight: 600;
  color: #f6efe0;
  background: var(--health-accent, #1e3a2f);
}

.vaccine-card__action--disabled {
  opacity: 0.5;
}

</style>
