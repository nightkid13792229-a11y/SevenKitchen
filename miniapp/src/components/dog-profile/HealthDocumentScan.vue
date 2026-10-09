<template>
  <!-- 拍照录入（2026-10-01，第六期）。
       老板第 4 条：拍照识别从过敏报告扩到体检报告、疫苗本、病历。
       老板第 5 条：识别之后**不需要顾客一条一条确认** ——
                   确认一次，就把识别出来的内容自动填进表单。
       老板第 6 条：愿意手填的顾客不受影响，这条路是可选的。 -->
  <!-- ⚠️ 根节点必须带条件（2026-10-04 老板提问后改）。
       原来它是无条件渲染的，于是"隐藏触发按钮、又没有识别结果"时，
       页面上留着一个**空的 <view class="scan">**，光占着
       `.scan { margin-bottom: 20rpx }` 这条外边距。
       疫苗标签下它正好夹在两张卡中间，就是老板看到的那块淡紫色空白：
         计划板块 margin-bottom 24 + 板块 gap 24 + .scan margin 20 + 板块 gap 24 ≈ 92rpx。
       组件实例还在（ref 照样能调 startScan），只是没东西可显示时不占位。 -->
  <view class="scan" v-if="!hideTrigger || failureNotice || showConfirm">
    <!-- 触发按钮（2026-10-01）：病历/检查板块把入口并进了底部那一个「新增记录」，
         所以它这里只保留"识别结果确认"这一块，按钮由上层调 startScan() 触发的。
         其它板块（疫苗本、过敏报告）仍用自带按钮。 -->
    <view v-if="!hideTrigger" class="scan__row">
      <text class="scan__button" :class="{ 'scan__button--busy': isBusy }" @tap="pickAndScan">
        {{ isBusy ? '识别中…' : buttonText }}
      </text>
      <text class="scan__hint">{{ hintText }}</text>
    </view>

    <!-- 没识别到内容 / 根本不是宠物医疗资料（2026-10-02 老板提的）：
         原来只弹一句 toast，顾客很容易觉得"点了没反应"。
         现在留一块看得见的提示，并把这次传上去、又没用的图片从 COS 删掉。 -->
    <view v-if="failureNotice" class="failure">
      <text class="failure__title">这次没有识别到内容</text>
      <text class="failure__message">{{ failureNotice }}</text>
      <view class="failure__actions">
        <text class="confirm__discard" @tap="discard">重新上传</text>
        <text class="confirm__accept" @tap="dismissFailure">知道了</text>
      </view>
    </view>

    <!-- 识别结果：一次性确认，确认完就填表 -->
    <view v-if="showConfirm" class="confirm">
      <text class="confirm__title">
        {{
          isVaccineBook
            ? '识别到以下内容 · 逐条确认后保存'
            : '识别到以下内容，确认后就存进档案'
        }}
      </text>
      <!-- 风险提示（2026-10-09 老板实测后定）：模型会**编细节** ——
           实测同一张疫苗本，它把没遮挡的贴纸说成"被手指遮挡"、
           把"2023 年 8 月"补成"2023-08-09"、把"宠必威锐必威"读成"英特威优免康"。
           这类错无法根除，所以明确告诉家长：这是机器读的，要照本子核一遍。
           一句话，不啰嗦（老板口径：提示文案要精炼）。 -->

      <!-- 2026-10-02 老板："记到就诊记录 / 识别为病历 / 本次共 5 张图片合成 1 条 /
           5 张原图会一起存进这条记录 / 报告上的动物名 seven 这些内部信息就不要放了"。
           全部下线：识别对了就是对的，家长要核对的是内容本身，不是我们的中间状态。
           只剩两种情况还需要说话：**名字真的对不上**（见下）与**有页没能用上**（疫苗本/过敏）。 -->
      <view v-if="ignoredPagesNote" class="confirm__note">
        <text class="confirm__note-text">{{ ignoredPagesNote }}</text>
      </view>

      <!-- 逐张状态（2026-10-03 老板问"能搞清楚是哪一张没被识别吗"）：
           一眼看到每张的结果 —— ✓ 已读出（标出读成什么）、✗ 没读到内容、！失败了。
           点缩略图可以放大看原图。 -->
      <!-- 上传的照片全部显示出来（2026-10-06 老板："把上传的所有的照片的预览图
           全部显示出来"）。

           原来这里卡了 `length > 1` —— 只传 1 张时这一排**整个不出现**，
           顾客看不到自己刚拍的那张，也就没法和识别出来的字对照。
           现在只要传了图就显示，一张都不少（识别成功/没读到/失败都会列出来，
           点缩略图能放大看原图）。 -->
      <view v-if="pageOutcomes.length > 0" class="pages">
        <text class="pages__title">
          {{ pageOutcomes.length > 1 ? '这几张的结果' : '上传的照片' }}
        </text>
        <view class="pages__row">
          <view
            v-for="page in pageOutcomes"
            :key="page.index"
            class="pages__item"
            :class="[
              `pages__item--${page.status}`,
              pageOutcomes.length === 1 ? 'pages__item--single' : '',
            ]"
            @tap="previewPage(page.path)"
          >
            <image v-if="page.path" class="pages__thumb" :src="page.path" mode="aspectFill" />
            <view v-else class="pages__thumb pages__thumb--file">
              <text class="pages__thumb-file">📄</text>
            </view>
            <text class="pages__index">{{ page.index }}</text>
            <text class="pages__status">
              {{ page.status === 'ok' ? `✓ ${page.label}` : page.status === 'empty' ? '✗ 没读到内容' : '！没识别成功' }}
            </text>
            <text
              v-if="page.path"
              class="pages__reupload"
              @tap.stop="rescanPage(page.index - 1)"
            >重传这一张</text>
          </view>
        </view>
        <!-- 每张自己的提示紧跟在这一排缩略图下面（老板 2026-10-04：
             "红字的提醒放在报告的缩略图下方更合理，更方便观看和对比"）。
             点这一行就能放大对应的那张原图 —— 一边看图一边核这句话。
             缩略图只有 150rpx 宽，把整句提示塞进格子里会挤成一团，所以放在这一排的正下方。 -->
        <view v-if="pageWarnings.length > 0" class="pages__warnings">
          <text
            v-for="item in pageWarnings"
            :key="`w-${item.index}-${item.text}`"
            class="pages__warning"
            @tap="previewPage(item.path)"
          >第 {{ item.index }} 张：{{ item.text }}</text>
        </view>
      </view>
      <view v-if="patientNameMismatch" class="confirm__name-warning">
        <text class="confirm__name-warning-title">⚠️ 名字对不上</text>
        <text class="confirm__name-warning-text">{{ patientNameMismatch }}</text>
      </view>

      <!-- 疫苗本：**一条一行、逐条确认**（2026-10-08 老板定）─────────────────
           老板："只有当用户一个记录一个记录的确认了之后，他才应该入库" +
                 "不要一条一屏，要优化一屏多条的信息量和交互"。
           → 一行就把要核对的三样给全（名字 · 日期 · 含哪些病种），
             点一行就地改，右侧点「确认」；
             系统拿不准的排最前面并标红（判据只用我们自己算得出来的信号）。 -->
      <template v-if="isVaccineBook">
        <view class="rows__head">
          <text class="rows__hint">
            AI识别，为防止模型的幻觉，请您务必人工确认一次！
          </text>
          <text class="rows__progress">已确认 {{ confirmedCount }} / 共 {{ drafts.length }} 条</text>
        </view>

        <view
          v-for="index in rowOrder"
          :key="`row-${index}`"
          class="row"
          :class="{ 'row--care': rowCare(index).care, 'row--confirmed': rowConfirmed[index] }"
        >
          <view class="row__main" @tap="toggleRowEdit(index)">
            <text class="row__no">{{ index + 1 }}</text>
            <view class="row__body">
              <text class="row__name">{{ rowName(drafts[index]) }}</text>
              <text class="row__meta">
                {{ drafts[index].vaccinationDate || '日期没读出' }} · {{ rowComponentsText(drafts[index]) }}
              </text>
              <text v-if="rowCare(index).care" class="row__care">⚠️ {{ rowCare(index).reason }}</text>
            </view>
            <text
              class="row__confirm"
              :class="{ 'row__confirm--done': rowConfirmed[index] }"
              @tap.stop="toggleRowConfirm(index)"
            >{{ rowConfirmed[index] ? '✓ 已确认' : '确认' }}</text>
          </view>

          <view v-if="isRowOpen(index)" class="row__edit">
            <view class="row__field">
              <text class="row__label">疫苗名</text>
              <input
                class="row__input"
                :value="drafts[index].productName || drafts[index].vaccineName || ''"
                placeholder="填或选这一支苗"
                @input="onRowNameInput(index, $event)"
              />
            </view>
            <!-- 复核（2026-10-09）：模型重新看图后的意见。
                 只在"不一致"时出现 —— 正确的不打扰（避免狼来了）。 -->
            <!-- 品牌对不上（2026-10-09 纯代码判定，零成本）：最容易被忽略的一类错 ——
                 「英特威®瑞比克」实测就是这种，模型再审也抓不住，代码一眼看得出来。 -->
            <view v-if="drafts[index].brandCheck && drafts[index].brandCheck.conflict" class="row__review">
              <text class="row__review-title">
                ⚠️ 品牌对不上：文字里写的是「{{ drafts[index].brandCheck.textBrand }}」，
                而「{{ drafts[index].productName || drafts[index].vaccineName }}」是
                {{ drafts[index].brandCheck.productBrand }}的 —— 可能读错了，请照本子核一下
              </text>
            </view>
            <view v-if="rowReviewCandidates(index).length > 0 || rowReviewText(index)" class="row__review">
              <text class="row__review-title">
                复核：本子上写的是「{{ rowReviewText(index) || '看不清' }}」
                <template v-if="drafts[index].productName">
                  ，和我们认定的「{{ drafts[index].productName }}」不是同一支
                </template>
              </text>
              <view v-if="rowReviewCandidates(index).length > 0" class="row__chips">
                <text class="row__chip-hint">复核建议这几支：</text>
                <text
                  v-for="item in rowReviewCandidates(index)"
                  :key="`review-${item}`"
                  class="row__chip row__chip--strong"
                  @tap="pickRowName(index, item)"
                >{{ item }}</text>
              </view>
            </view>
            <view v-if="rowSameBrandAlternatives(index).length > 0" class="row__chips">
              <text class="row__chip-hint">同一个牌子的其他几支：</text>
              <text
                v-for="item in rowSameBrandAlternatives(index)"
                :key="`same-${item}`"
                class="row__chip"
                @tap="pickRowName(index, item)"
              >{{ item }}</text>
            </view>
            <view v-if="rowNameSuggestions(index).length > 0" class="row__chips">
              <text class="row__chip-hint">从产品库选一支：</text>
              <text
                v-for="item in rowNameSuggestions(index)"
                :key="item"
                class="row__chip"
                @tap="pickRowName(index, item)"
              >{{ item }}</text>
            </view>
            <view class="row__field">
              <text class="row__label">接种日期</text>
              <picker
                mode="date"
                :value="drafts[index].vaccinationDate || ''"
                @change="onRowDateChange(index, $event)"
              >
                <text class="row__input">{{ drafts[index].vaccinationDate || '点这里选' }}</text>
              </picker>
            </view>
            <view class="row__field">
              <text class="row__label">含哪些病种</text>
              <view class="row__chips">
                <text
                  v-for="option in componentChoices"
                  :key="option.value"
                  class="row__chip"
                  :class="{ 'row__chip--active': (drafts[index].components || []).includes(option.value) }"
                  @tap="toggleRowComponent(index, option.value)"
                >{{ option.label }}</text>
              </view>
            </view>
          </view>
        </view>
      </template>

      <!-- 其余四类文档：仍然是一屏预览 + 一次确认（那几类只合成一条记录） -->
      <template v-if="!isVaccineBook">
        <view v-for="(draft, index) in drafts" :key="`draft-${index}`" class="confirm__card">
        <template v-for="row in describeDraft(draft)" :key="row.label">
          <view class="confirm__row">
            <text class="confirm__label">{{ row.label }}</text>
            <!-- 化验数据分块排版：报告名单独一行、项目名与数值左右分栏 -->
            <LabValuesView v-if="row.rich === 'lab'" :text="row.value" />
            <text v-else class="confirm__value">{{ row.value }}</text>
          </view>
        </template>
        </view>
      </template>

      <!-- 最下方那段红字提醒已下线（2026-10-06 老板）：
           "既然在上传照片预览图下方已经有提醒了，那么在识别后的表单最下方的
            红字提醒是否就可以不要了呢？"
           确实重复了 —— 照片预览那一排下面已经逐张写着「第 N 张：…」，
           而且同样**按合并结果筛过**（见 pageOutcomes 的 warnings），
           家长一边看原图一边核那句话，比在这儿再看一遍更清楚。
           唯一只在这里出现过的是一句"共 N 张没能识别"的汇总，
           而每张缩略图上的 ✗ / ！和下面那句提示已经把它说完了。 -->

      <!-- 识别把握**连字段都不要了**（2026-10-08）：老板指出"AI 也有可能乱说自己
           没把握的是哪几条" —— 这个自评分既不可信、界面又不显示，让它别再返回，
           省 token、也少一个会误导人的信号。
           （历史：2026-10-02 先去掉"中/高"，2026-10-04 老板拍板
           连"低"的那句也不要）：模型自评分，顾客据此做不了任何事，
           只会让整份结果都不敢信。真正要提醒的地方已经**点名到具体行**了。 -->

      <view class="confirm__actions">
        <!-- 这里原来有一个「重新上传」（整批丢掉重来）——
             老板 2026-10-09 指出它和每一张下面的「重传这一张」功能重叠，已删除。
             ⚠️ 但**选了文档（PDF/Word）时必须留着**：文档那一格没有「重传这一张」
                （`v-if="page.path"`），删了它就没有退路了。
             整批都失败的情况在失败面板里另有「重新上传」。 -->
        <text v-if="hasDocumentPage" class="confirm__discard" @tap="discard">重新上传</text>
        <text v-if="isVaccineBook" class="confirm__accept" @tap="acceptConfirmed">
          保存我确认的 {{ confirmedCount }} 条
        </text>
        <text v-else class="confirm__accept" @tap="accept">确认</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dogApi } from '../../api/dogs'
import LabValuesView from './LabValuesView.vue'
import {
  buildSingleScannedRecord,
  extractHealthAttachmentKey,
  filterWarningsAgainstRecord,
  mergeScannedReportDrafts,
  resolveHealthScanErrorMessage,
  resolveScannedDocumentType,
} from '../../utils/health-records'
import {
  SCAN_IMAGE_SIZE_TYPE,
  confirmBlurryScanImages,
  findBlurryScanImages,
  prepareScanImages,
} from '../../utils/scan-image'

/**
 * 拍照 → 上传 → 识别 → **确认一次** → 把内容交给上层填表。
 *
 * 设计取舍：
 *   · 识别结果**不直接保存**，而是填进表单 —— 顾客还能改，也还能不存。
 *     （老板第 5 条说的是"自动的录入表单"，不是"自动保存"）
 *   · 任何一步失败都降级为手工填写，绝不挡住顾客。
 *   · 只把 OCR 读到的内容搬进表单，不做任何医学判断。
 */
type ExplicitDocumentType = 'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'
/**
 * `AUTO`（2026-10-01）：由后端判断这是哪一类文档。
 * 病历/检查板块两个入口合并成一个"从相册选择"就是靠它 ——
 * 顾客不用先回答"这是病历还是体检报告"，识别结果里会带上判定的类型。
 */
type DocumentType = ExplicitDocumentType | 'AUTO'

const props = withDefaults(defineProps<{
  dogId: string
  documentType: DocumentType
  buttonText?: string
  /** 隐藏自带按钮（由上层调用 startScan() 触发）—— 病历/检查板块合并入口后用它 */
  hideTrigger?: boolean
  hintText?: string
  /** 上传时后端需要的记录类别（medical / checkup / vaccine / allergy） */
  uploadType: 'medical' | 'checkup' | 'vaccine' | 'allergy'
  /** 当前这只狗的名字：只用来提醒"报告上的动物名对不上"，不做拦截（2026-10-02） */
  dogName?: string
  /**
   * 病种候选（2026-10-08）：疫苗本"逐条确认"时要在这一屏直接勾病种。
   * 由疫苗板块传进来（它已经有后端下发的那一份），**前端不再复制一份**。
   * 不传就用本地兜底（闭集，极少变）。
   */
  componentOptions?: { value: string; label: string }[]
  /**
   * 产品库（2026-10-09）。只用来干一件事：
   * 当识别的名字命中了某一支产品时，把**同一牌子的其他几支**也摆在旁边，
   * 家长对着贴纸一眼就能改对。
   *
   * 为什么需要它：实测这个错最典型 —— 贴纸写的是「宠必威锐必威」（狂犬苗），
   * 模型读成了「英特威优免康」（联苗）✗，两支都是真实存在的产品，
   * 提示词里已经明确写了"照抄品牌名"，它照样会串。所以给一条**一键改对**的路。
   */
  catalogProducts?: { name: string; brand?: string; manufacturer?: string }[]
  /**
   * 顾客是从哪个入口点进来的（2026-10-02 老板定稿）。
   *
   * 传 AUTO 时**记录类型由它决定**：从「就诊」进 = 这一批合成一条就诊记录，
   * 从「体检」进 = 合成一条体检记录。AI 判出来的文档类型只决定"字往哪个字段填"，
   * 不再决定记录落在哪张表 —— 原来化验单会被判成体检类，于是家长从就诊进去
   * 却凭空多出一条体检记录（老板实测提的）。
   */
  entryKind?: 'medical' | 'checkup'
}>(), {
  buttonText: '上传图片',
  hintText: '上传报告或疫苗本的照片，自动填表；也可以直接手填',
  hideTrigger: false,
  entryKind: 'medical',
})

const emit = defineEmits<{
  (event: 'scanned', payload: { drafts: Record<string, any>[]; documentType: DocumentType }): void
}>()

/**
 * 供上层外部触发（病历/检查板块把它并进了底部那个「新增记录」）。
 * 自带按钮隐藏时，就靠这个方法打开相机/相册。
 */
/**
 * 还有几条识别结果**没确认**（2026-10-08）。
 *
 * 为什么需要它：改成"逐条确认后才入库"之后，识别结果在确认之前**只在内存里** ——
 * 切标签会把这个板块整个销毁，那几条就静默没了 ✗
 * （以前是识别完立刻自动保存，所以不会有这个问题）。
 * 页面离开前拿这个数拦一下，跟"记录没填完"是同一个套路。
 */
function unconfirmedDraftCount(): number {
  return showConfirm.value ? drafts.value.length : 0
}

/**
 * 确认页开着的时候，拦住"点返回"这个动作（微信的离开确认弹窗）。
 *
 * ⚠️ 这个能力在部分端上不存在 —— 拿不到就静默跳过，
 * 真正兜底的是页面里那个切标签的守卫（那个一定在）。
 */
function syncLeaveGuard() {
  const api = uni as unknown as {
    enableAlertBeforeUnload?: (options: { message: string }) => void
    disableAlertBeforeUnload?: () => void
  }
  if (showConfirm.value && drafts.value.length > 0) {
    api.enableAlertBeforeUnload?.({
      message: '识别结果还没确认，现在离开就丢掉啦',
    })
    return
  }
  api.disableAlertBeforeUnload?.()
}

defineExpose({
  startScan: pickAndScan,
  startDocumentScan,
  unconfirmedDraftCount,
})

const isBusy = ref(false)
const showConfirm = ref(false)
const drafts = ref<Record<string, any>[]>([])

/*
 * ══ 按"页"存识别结果（2026-10-08，为了"单独重传某一页"）══════════════════
 *
 * 老板："界面写着可以单独重传一次，可是没这个功能。"
 * 重传一张之后必须把**这一页**的草稿换掉、再按新的页集合重新合并 ——
 * 不能把新结果叠加上去（那样同一页的记录会翻倍）。
 * 所以识别结果按页存两份：这一页的草稿（pageDraftCache）、
 * 这一页的状态与提示（pageResultsCache）。
 */
type ScanPageResult = {
  index: number
  path: string
  status: 'ok' | 'empty' | 'failed'
  label: string
  warnings: string[]
  /** 文档（PDF / Word）没有缩略图，就显示文件名（2026-10-08） */
  fileName?: string
}
let pageResultsCache: ScanPageResult[] = []
let pageDraftCache: { type: string; drafts: Record<string, any>[] }[] = []

/** 按"这张图被判成什么"把各页草稿分组（同一页的草稿共用它的附件地址） */
function collectDraftsByType(): Map<string, Record<string, any>[]> {
  const map = new Map<string, Record<string, any>[]>()
  for (const page of pageDraftCache) {
    if (!page || page.drafts.length === 0) continue
    const bucket = map.get(page.type) || []
    bucket.push(...page.drafts)
    map.set(page.type, bucket)
  }
  return map
}

/** 把"按页的草稿"合并成"给顾客确认的那一份"（纯函数，重传一页时要拿候选集合先算一遍） */
function mergePageDrafts(pages: { type: string; drafts: Record<string, any>[] }[]) {
  const draftsByType = new Map<string, Record<string, any>[]>()
  for (const page of pages) {
    if (!page || page.drafts.length === 0) continue
    const bucket = draftsByType.get(page.type) || []
    bucket.push(...page.drafts)
    draftsByType.set(page.type, bucket)
  }

  const resolvedType = resolveScannedDocumentType(
    [...draftsByType.keys()],
    props.documentType,
  ) as DocumentType

  let merged: Record<string, any>[] = []
  let ignoredNote = ''

  if (props.documentType === 'AUTO') {
    // 就诊 / 体检入口：入口决定记录类型，这一批纸合成一条记录
    const targetType = props.entryKind === 'checkup' ? 'CHECKUP_REPORT' : 'MEDICAL_RECORD'
    const groups = [...draftsByType.entries()].map(([type, list]) => ({ type, drafts: list }))
    const single = buildSingleScannedRecord(groups, targetType)
    if (single.draft) {
      merged = [single.draft]
    }
    ignoredNote = single.ignored.length
      ? `有 ${single.ignored.reduce((sum, item) => sum + item.count, 0)} 张看起来是` +
        `${single.ignored.some((item) => item.type === 'VACCINE_BOOK') ? '疫苗本' : ''}` +
        `${single.ignored.some((item) => item.type === 'VACCINE_BOOK') && single.ignored.some((item) => item.type === 'ALLERGY_REPORT') ? '、' : ''}` +
        `${single.ignored.some((item) => item.type === 'ALLERGY_REPORT') ? '过敏原检测报告' : ''}` +
        `，那些请到对应的板块上传`
      : ''
  } else {
    // 疫苗 / 过敏入口：同类型的页合并成一条，**疫苗本不合并**
    for (const [type, list] of draftsByType.entries()) {
      const groupDrafts = type === 'VACCINE_BOOK' ? list : mergeScannedReportDrafts(list)
      for (const draft of groupDrafts) {
        merged.push({ ...draft, __documentType: type })
      }
    }
  }

  return { merged, resolvedType, ignoredNote }
}

/** 把合并结果摆到界面上（逐条确认的初始状态都在这里重置） */
function renderMergedResult() {
  const { merged, resolvedType, ignoredNote } = mergePageDrafts(pageDraftCache)

  drafts.value = merged
  ignoredPagesNote.value = ignoredNote
  resolvedDocumentType.value = resolvedType
  pageOutcomes.value = pageResultsCache.map((page) => ({
    ...page,
    warnings: filterWarningsAgainstRecord(page.warnings, merged[0]),
  }))

  /*
   * 逐条确认的初始状态：全部"未确认"；顺序只在这里算一次 ——
   * 系统拿不准的排前面（判据见 rowCare），其余保持识别顺序。
   * 为什么不每次重算：顾客勾着勾着行会跳 ✗。
   */
  rowConfirmed.value = drafts.value.map(() => false)
  rowOrder.value = drafts.value
    .map((_, index) => index)
    .sort((a, b) => {
      const careA = rowCare(a).care ? 0 : 1
      const careB = rowCare(b).care ? 0 : 1
      return careA - careB || a - b
    })

  /*
   * 展开状态：**需要核的行默认展开**（老板 2026-10-09），其余收起。
   * 这里每次都按当前草稿重算，所以重传一页之后也仍然对。
   */
  const nextOpen: Record<number, boolean> = {}
  drafts.value.forEach((_, index) => {
    if (rowCare(index).care) {
      nextOpen[index] = true
    }
  })
  openRows.value = nextOpen
}

/*
 * ══ 疫苗本：**逐条确认**（2026-10-08 老板定）══════════════════════════════
 *
 * 老板："只有当用户一个记录一个记录的确认了之后，他才应该入库" +
 *       "确认页的字段那肯定要能直接修改" + "不要一条一屏，要优化一屏多条"。
 *
 * 所以疫苗本这一路：
 *   · 一条一行，每行自己点「确认」；
 *   · **没确认的不入库**（可以确认几条先存几条 —— 老板选了这个）；
 *   · 点一行就地改：疫苗名（产品库候选 + 手打）、接种日期、含哪些病种；
 *   · 系统"拿不准"的那几条**排在最前面并标红** —— 判据只用**我们自己算得出来**的
 *     可靠信号（名字没认出来 / 日期缺失或有涂改 / 病种空），
 *     **不用模型自评的 confidence**（老板指出：模型会自信地读错，那个信号不可信）。
 */
const rowConfirmed = ref<boolean[]>([])
const rowOrder = ref<number[]>([])
/**
 * 展开编辑中的行（2026-10-09 改成"多行可同时展开"）。
 *
 * 老板问："如果识别的信息有缺失或者没把握，会让用户先点确认、展开该条的窗口、
 * 手动录入后再点一次确认，对吗？那为何不对此类的记录直接在识别结果审核的窗口中
 * 直接展开呢？" —— 对，之前是"点一下才展开"，属于我漏了；
 * 现在**需要核的行默认就是展开的**（多个也可以同时展开）。
 */
const openRows = ref<Record<number, boolean>>({})

function isRowOpen(index: number): boolean {
  return Boolean(openRows.value[index])
}

const isVaccineBook = computed(
  () => (resolvedDocumentType.value || props.documentType) === 'VACCINE_BOOK',
)

/** 病种候选：后端下发优先，拿不到用这几项兜底（与疫苗板块同一份闭集） */
const FALLBACK_COMPONENT_CHOICES = [
  { value: 'cdv', label: '犬瘟热' },
  { value: 'cpv', label: '犬细小' },
  { value: 'cav', label: '犬腺病毒' },
  { value: 'cpi', label: '副流感' },
  { value: 'lepto', label: '钩端螺旋体' },
  { value: 'ccov', label: '冠状病毒' },
  { value: 'rabies', label: '狂犬病' },
]
const componentChoices = computed(() =>
  props.componentOptions && props.componentOptions.length > 0
    ? props.componentOptions
    : FALLBACK_COMPONENT_CHOICES,
)

/** 这一批里有没有"文档"页（PDF / Word 没有缩略图，也就没有「重传这一张」） */
const hasDocumentPage = computed(() =>
  pageOutcomes.value.some((page) => !page.path),
)

const confirmedCount = computed(
  () => rowConfirmed.value.filter(Boolean).length,
)

function rowName(draft: Record<string, any> | undefined): string {
  const value = String(draft?.productName || draft?.vaccineName || '').trim()
  return value || '（名字没认出来）'
}

/**
 * 复核（2026-10-09）：只有"不一致"的行才把它的意见摆出来。
 * 一致的行不留任何痕迹 —— 正确的不打扰（避免家长被训练成"提示不看"）。
 */
function rowReview(index: number): { textOnBook: string; candidates: string[] } | null {
  const review = drafts.value[index]?.productReview
  if (!review || review.consistent !== false) return null
  return {
    textOnBook: String(review.textOnBook || '').trim(),
    candidates: Array.isArray(review.candidates) ? review.candidates.map(String) : [],
  }
}

function rowReviewText(index: number): string {
  return rowReview(index)?.textOnBook || ''
}

function rowReviewCandidates(index: number): string[] {
  return rowReview(index)?.candidates || []
}

/** 识别出的名字命中了产品库里的哪一支（命中不了返回空） */
function rowMatchedProduct(index: number): { name: string; brand?: string; manufacturer?: string } | null {
  const draft = drafts.value[index]
  const current = String(draft?.productName || draft?.vaccineName || '').trim()
  if (!current) return null
  const list = props.catalogProducts || []
  return (
    list.find((item) => item.name === current) ||
    null
  )
}

/** 同一牌子的其他几支（一键换过去；识别串了牌子/产品时用） */
function rowSameBrandAlternatives(index: number): string[] {
  const matched = rowMatchedProduct(index)
  const brand = String(matched?.brand || matched?.manufacturer || '').trim()
  if (!matched || !brand) return []
  return (props.catalogProducts || [])
    .filter((item) => String(item.brand || item.manufacturer || '').trim() === brand)
    .map((item) => item.name)
    .filter((name) => name !== matched.name)
    .slice(0, 6)
}

function rowNameSuggestions(index: number): string[] {
  const list = drafts.value[index]?.nameSuggestions
  return Array.isArray(list) ? list.map(String).filter(Boolean) : []
}

/** 这一行有没有"系统拿不准"的地方（只用我们自己能算的信号） */
function rowCare(index: number): { care: boolean; reason: string } {
  const draft = drafts.value[index]
  if (!draft) return { care: false, reason: '' }

  if (!String(draft.productName || draft.vaccineName || '').trim()) {
    return { care: true, reason: '名字没认出来，请核对或从产品库选一支' }
  }
  const date = String(draft.vaccinationDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { care: true, reason: '接种日期没读出来，请补上' }
  }
  if (String(draft.notes || '').includes('涂改')) {
    return { care: true, reason: '日期有涂改，请核对' }
  }
  // 模型自己说"没看清/看不清"的（不管它编的是什么原因），也要家长核一遍
  if (/没看清|看不清|遮挡|反光|模糊/.test(String(draft.notes || ''))) {
    return { care: true, reason: '这行有一处没看清，请照本子核一下' }
  }
  /*
   * **复核说不一致**（2026-10-09 老板定）：模型重新看图之后，
   * 认为"本子上写的"和我们认定的不是同一支 —— 这是最该让家长核的一类，
   * 排最前面、默认展开。
   */
  // 品牌和产品对不上（纯代码判定，2026-10-09）：文字里的牌子 ≠ 这支苗的厂家
  if (draft.brandCheck && draft.brandCheck.conflict === true) {
    return {
      care: true,
      reason: `文字里写的是「${draft.brandCheck.textBrand}」，而这支苗是${draft.brandCheck.productBrand}的，请核对`,
    }
  }
  if (draft.productReview && draft.productReview.consistent === false) {
    const read = String(draft.productReview.textOnBook || '').trim()
    return {
      care: true,
      reason: read
        ? `本子上写的是「${read}」，和我们认定的不是同一支，请核对`
        : '这一行可能认错了，请照本子核一下',
    }
  }
  const components = Array.isArray(draft.components) ? draft.components : []
  if (components.length === 0) {
    return { care: true, reason: '没读出防哪些病，请勾一下' }
  }
  return { care: false, reason: '' }
}

/** 这一行缺什么就不能确认（缺了就不让它存进去） */
function rowBlockReason(index: number): string {
  const draft = drafts.value[index]
  if (!draft) return '这一条读不出来'
  if (!String(draft.productName || draft.vaccineName || '').trim()) {
    return '还差疫苗名'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.vaccinationDate || '').trim())) {
    return '还差接种日期'
  }
  const components = Array.isArray(draft.components) ? draft.components : []
  if (components.length === 0) {
    return '还差病种'
  }
  return ''
}

function rowComponentsText(draft: Record<string, any> | undefined): string {
  const list = Array.isArray(draft?.components) ? draft.components : []
  if (list.length === 0) return '病种未读出'
  const labels = list.map(
    (value: string) =>
      componentChoices.value.find((item) => item.value === value)?.label || value,
  )
  return `含 ${labels.length} 种（${labels.join('·')}）`
}

function toggleRowConfirm(index: number) {
  const reason = rowBlockReason(index)
  if (reason && !rowConfirmed.value[index]) {
    uni.showToast({ title: `${reason}，先把它补上`, icon: 'none' })
    openRows.value = { ...openRows.value, [index]: true }
    return
  }
  const next = [...rowConfirmed.value]
  next[index] = !next[index]
  rowConfirmed.value = next
}

function toggleRowEdit(index: number) {
  const next = { ...openRows.value }
  if (next[index]) delete next[index]
  else next[index] = true
  openRows.value = next
}

function onRowNameInput(index: number, event: any) {
  const value = String(event?.detail?.value || '')
  const draft = drafts.value[index]
  if (!draft) return
  // 手打的名字优先：清掉"规范产品名"，让顾客写的字生效
  draft.vaccineName = value
  draft.productName = ''
}

function pickRowName(index: number, name: string) {
  const draft = drafts.value[index]
  if (!draft) return
  draft.productName = name
  draft.vaccineName = name
  draft.nameSuggestions = []
}

function onRowDateChange(index: number, event: any) {
  const draft = drafts.value[index]
  if (!draft) return
  draft.vaccinationDate = String(event?.detail?.value || '')
  // 日期改过了，"涂改待核对"这句就不必再挂着
  if (draft.notes) {
    draft.notes = String(draft.notes).replace(/日期有涂改[，,]?请核对[。]?/g, '').trim()
  }
}

function toggleRowComponent(index: number, value: string) {
  const draft = drafts.value[index]
  if (!draft) return
  const list = Array.isArray(draft.components) ? [...draft.components] : []
  const at = list.indexOf(value)
  if (at >= 0) list.splice(at, 1)
  else list.push(value)
  draft.components = list
}

/**
 * 只把**确认过**的那些交上去（没确认的不入库）。
 *
 * ⚠️ 2026-10-09 修一个**会丢数据**的设计缺陷（老板实测出来的）：
 *    他的疫苗本识别出 7 条，其中"病种没读出来"的 3 条被排在最前面（那是我们
 *    特意做的"拿不准的排前面"），他确认了这 3 条就点了保存 ——
 *    于是**剩下 4 条被静默丢掉了** ✗，回执只说"存了 3 条"，
 *    他完全不知道另外 4 条去哪了（"其他的已经识别的接种记录去哪里了呢？"）。
 *
 * 现在：确认过的交上去，**没确认的留在这一页继续显示**（进度重置成"已确认 0 / 共 4 条"），
 *    并且把"还剩几条没确认"告诉上层，回执里也说一句。
 */
function acceptConfirmed() {
  const picked: Record<string, any>[] = []
  const keptPerPage: number[][] = []

  drafts.value.forEach((draft, index) => {
    if (rowConfirmed.value[index]) {
      picked.push(draft)
    }
  })

  if (picked.length === 0) {
    uni.showToast({ title: '还没有确认任何一条', icon: 'none' })
    return
  }

  /*
   * 没确认的那些要**留在页面上**：按页把它们重新组装 ——
   * 页里剩下的草稿为空，这一页就不再显示（它的原图已经跟着交上去的记录走了）。
   */
  pageDraftCache.forEach((page) => {
    const keepIndexes: number[] = []
    page.drafts.forEach((draft, pageIndex) => {
      const globalIndex = drafts.value.indexOf(draft)
      if (globalIndex >= 0 && !rowConfirmed.value[globalIndex]) {
        keepIndexes.push(pageIndex)
      }
    })
    keptPerPage.push(keepIndexes)
  })

  const nextPages: { type: string; drafts: Record<string, any>[] }[] = []
  pageDraftCache.forEach((page, pageIndex) => {
    const kept = page.drafts.filter((_, index) => keptPerPage[pageIndex].includes(index))
    if (kept.length > 0) {
      nextPages.push({ type: page.type, drafts: kept })
    }
  })

  const remaining = drafts.value.length - picked.length

  emit('scanned', {
    drafts: picked,
    documentType: resolvedDocumentType.value || props.documentType,
    // 上层（回执）要说清"还有几条没确认、留在识别结果里了"
    remaining,
  })

  // 交上去的那些，图片所有权跟着记录走了；留在页面上的那些还要用，不能删
  uploadedUrls.value = []

  if (remaining > 0) {
    pageDraftCache = nextPages
    pageResultsCache = pageResultsCache
      .map((page, pageIndex) => ({ page, kept: keptPerPage[pageIndex]?.length || 0 }))
      .filter((item) => item.kept > 0)
      .map((item) => item.page)
      .map((page, index) => ({ ...page, index: index + 1 }))
    renderMergedResult()
    syncLeaveGuard()
    uni.showToast({
      title: `已保存，还有 ${remaining} 条没确认`,
      icon: 'none',
    })
    return
  }

  showConfirm.value = false
  syncLeaveGuard()
  drafts.value = []
  rowConfirmed.value = []
  rowOrder.value = []
  openRows.value = {}
  failureNotice.value = ''
}
/**
 * 模型自评的识别把握。
 *
 * ⚠️ **一个字都不给顾客看**（2026-10-02 去掉"中/高"，2026-10-04 老板拍板连"低"也不要）。
 * 留着它只为排查问题时能对照，不参与任何界面逻辑。
 */
/**
 * 后端最终判定的文档类型。
 *
 * 传 AUTO 时它会与 props.documentType 不同 —— 确认卡片按它显示字段标签，
 * 填表时也按它决定这条记录进"病历"还是"体检"。
 */
const resolvedDocumentType = ref<DocumentType>('MEDICAL_RECORD')
/** 被排除在外的页（疫苗本/过敏报告）—— 各自板块有更合适的表单 */
const ignoredPagesNote = ref('')
/** 逐张识别结果（确认卡片上那排缩略图 + 状态） */
const pageOutcomes = ref<{
  index: number
  path: string
  status: 'ok' | 'empty' | 'failed'
  label: string
  warnings: string[]
}[]>([])
/** 本次识别成功了几张原图（用于在确认卡片上说明"几张 → 几条记录"） */
const scannedImageCount = ref(0)
/**
 * 识别失败的提示语（空 = 没失败）。
 * 用一块看得见的卡片而不是一句 toast —— 2026-10-02 老板传了张不相关的图，
 * 因为只弹了一句很快就消失的提示，他的感受是"点了根本没有任何反应"。
 */
const failureNotice = ref('')
/**
 * 这一轮传上去、还没被确认使用的图片地址。
 * 失败或"重新上传"时把它们从 COS 删掉，别白占空间（老板专门问过这件事）。
 */
const uploadedUrls = ref<string[]>([])
/** 顾客这次一共选了几张（含没识别成功的，用于如实说明"本次共 N 张"） */
const requestedImageCount = ref(0)

const TYPE_LABELS: Record<ExplicitDocumentType, string> = {
  MEDICAL_RECORD: '病历',
  CHECKUP_REPORT: '体检报告',
  VACCINE_BOOK: '疫苗本',
  ALLERGY_REPORT: '过敏原检测报告',
}

/** 有没有没识别成功的张（决定要不要多写一句引导） */
const hasFailedPages = computed(() => (
  pageOutcomes.value.some((page) => page.status !== 'ok')
))

/**
 * 逐张的提示，摊平成一行一条（2026-10-04）。
 *
 * 摆在缩略图那一排的正下方，每条都带"第 N 张"并能点开对应的原图 ——
 * 家长一边看那张图一边核这句话，不用来回找。
 */
const pageWarnings = computed(() => (
  pageOutcomes.value.flatMap((page) => (
    (page.warnings || []).map((text) => ({
      index: page.index,
      path: page.path,
      text,
    }))
  ))
))

/** 点缩略图放大看原图（本地临时文件，直接给微信预览） */
function previewPage(path: string) {
  const urls = pageOutcomes.value.map((page) => page.path).filter(Boolean)
  if (urls.length === 0) {
    return
  }
  uni.previewImage({ urls, current: path })
}

/** 当前应当按哪一类渲染/填表：优先用后端判定出来的类型 */
const activeDocumentType = computed<DocumentType>(() => (
  resolvedDocumentType.value || props.documentType
))

/**
 * 这一条草稿属于哪一类（一次传多张时可能混着化验单和门诊病历，
 * 每条草稿都贴了自己的类型，见 scanAll 里的 __documentType）。
 */
function draftDocumentType(draft: Record<string, any>): DocumentType {
  const own = String(draft?.__documentType || '').toUpperCase()
  if (own === 'IMAGING') {
    // 影像片按体检那套字段渲染（日期 + 原件），只是名字不同
    return 'CHECKUP_REPORT'
  }

  if (own && own !== 'AUTO' && own !== 'NOT_MEDICAL') {
    return own as DocumentType
  }

  return (resolvedDocumentType.value || props.documentType) as DocumentType
}

/**
 * 报告上写的动物名（可能有好几个：一次传了不同狗的报告）。
 * 只用于核对，不参与保存 —— 报告原件里本来就有，存进字段反而多余。
 */
const reportedPatientNames = computed(() => {
  const names = drafts.value
    .map((draft) => String(draft?.patientName || '').trim())
    .filter(Boolean)

  return [...new Set(names)]
})

/**
 * 报告上的动物名和当前记录的狗狗对不上 → 提醒一句。
 *
 * 老板 2026-10-02 定的口径：**只提醒，不拦截** ——
 * 要不要把这份报告存进这只狗的档案，由家长自己决定。
 * （实测踩过：报告上写的是「熊海苔」「葡萄」，而家长存进了「面包」的档案。）
 */
const patientNameMismatch = computed(() => {
  const current = String(props.dogName || '').trim()
  if (!current || reportedPatientNames.value.length === 0) {
    return ''
  }

  // 2026-10-02 老板实测：报告写「seven」、档案里叫「Seven」也会被提醒 —— 太严了。
  // 比较前把大小写、空格、中英文标点都抹掉，只剩真正的名字差异才提醒。
  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s·.。,，、'"“”‘’()（）\-—_]/g, '')

  const normalizedCurrent = normalize(current)
  const others = reportedPatientNames.value.filter(
    (name) => normalize(name) !== normalizedCurrent,
  )
  if (others.length === 0) {
    return ''
  }

  return `报告上写的动物名是「${others.join('」「')}」，和你正在记录的「${current}」不一样。确认没传错再保存；存不存进这份档案由你决定。`
})

/** 把一条草稿翻译成"标签 + 值"给顾客核对 */
function describeDraft(
  draft: Record<string, any>,
): { label: string; value: string; rich?: 'lab' }[] {
  const rows: { label: string; value: string; rich?: 'lab' }[] = []
  const push = (label: string, value: unknown, rich?: 'lab') => {
    const text = String(value ?? '').trim()
    if (text) {
      rows.push({ label, value: text, rich })
    }
  }

  const documentType = draftDocumentType(draft)

  if (documentType === 'VACCINE_BOOK') {
    push('疫苗', draft.vaccineName)
    /*
     * 匹配到产品库哪一支，要**如实说出来**（2026-10-06 老板提问）。
     *
     * 老板："AI 识别的结果中，产品标签名称还是没有识别完整。但是我点击确认
     * 按钮之后，发现记录中识别的是准确的匹配到了卫佳捌。这是什么问题呢？"
     *
     * 不是问题，是**两步**：这一步显示的是"本子上怎么写的"（原文），
     * 落库用的是"我们认成了哪一支"（规范名）。但两者不一样的时候
     * 不解释一句，顾客会以为是错的 —— 所以匹配上了就补一行说明。
     */
    const matched = String(draft.productName || '').trim()
    if (matched && matched !== String(draft.vaccineName || '').trim()) {
      push('匹配产品库', matched)
    }
    push('接种日期', draft.vaccinationDate)
    push('下次到期', draft.nextDueDate)
    push('补充说明', draft.notes)
    return rows
  }

  // 这一块**必须和表单里那套字段、那套叫法一一对应**（2026-10-02 老板提的）：
  // 顾客核对时看到的，就是他接下来在表单里能改的那些 ——
  // 表单里已经删掉的字段（兽医 / 处理与提醒）不该再出现在这里，
  // 表单里叫「医生诊断」的，这里也不能写成「诊断结果」。
  if (documentType === 'CHECKUP_REPORT') {
    push('体检日期', draft.checkupDate)
    push('检查结论', draft.findings)
    push('医生建议', draft.recommendations)
    push('化验数据', draft.labValues, 'lab')
    push('补充说明', draft.notes)
    return rows
  }

  if (documentType === 'MEDICAL_RECORD') {
    push('就诊日期', draft.visitDate)
    push('症状', draft.chiefComplaint)
    push('医生诊断', draft.diagnosis)
    push('医嘱', draft.treatment)
    push('用药', Array.isArray(draft.medications) ? draft.medications.join('、') : draft.medications)
    push('这次做的检查', draft.exams)
    push('化验数据', draft.labValues, 'lab')
    push('体征', draft.vitals)
    push('补充说明', draft.notes)
    return rows
  }

  push('过敏原', draft.allergen)
  push('备注', draft.notes)
  return rows
}

/**
 * 从相册选图（2026-10-01 按老板要求简化）。
 *
 *   · **只开相册**：不再写"呼出相机"那条路 —— 少一次微信自己的
 *     「拍照 / 从相册选择」弹窗（相册里本来就有拍摄入口）。
 *   · **支持多选**：一次最多 9 张（微信上限）。一本病历或一份体检报告常有好几页，
 *     逐张识别后**合成一条记录**（2026-10-01 第九期老板定的），原图都留作附件；
 *     疫苗本不合并 —— 一张本子读出的是多条各自的接种记录。
 */
function pickAndScan() {
  if (isBusy.value) {
    return
  }

  uni.chooseImage({
    count: 9,
    // 拿原图：识别准不准取决于给模型多少像素（见 utils/scan-image.ts）
    sizeType: SCAN_IMAGE_SIZE_TYPE,
    sourceType: ['album'],
    success: (res: any) => {
      const paths: string[] = Array.isArray(res?.tempFilePaths) ? res.tempFilePaths : []
      // 同一张图选两次没必要识别两次
      const unique = [...new Set(paths.filter(Boolean))]
      if (unique.length > 0) {
        void scanAll(unique)
      }
    },
  })
}


/** 多张一起识别：逐张上传 + 识别，最后合并成一份待确认结果 */
async function scanAll(filePaths: string[]) {
  isBusy.value = true
  showConfirm.value = false
  scannedImageCount.value = 0
  requestedImageCount.value = filePaths.length
  failureNotice.value = ''
  uploadedUrls.value = []
  ignoredPagesNote.value = ''
  pageOutcomes.value = []
  // 这一轮的按页缓存（重传一页时要在它上面替换）
  pageResultsCache = []
  pageDraftCache = []

  /**
   * 先把原图压成"识别用"的尺寸（2026-10-03）。
   *
   * 微信选图给的原图动辄 4000 像素宽，直传太慢；但用微信的 compressed
   * 又只有 1280 宽，化验单上的小数字会读错。这里统一压到 2000 宽 ——
   * 比 1280 多一倍细节，体积还是几百 KB。
   */
  uni.showLoading({ title: '处理中…', mask: true })
  let preparedPaths: string[] = []
  try {
    preparedPaths = await prepareScanImages(filePaths)
  } finally {
    uni.hideLoading()
  }
  if (preparedPaths.length > 0) {
    filePaths = preparedPaths
  }

  /**
   * 图太小就先拦一下（2026-10-03）。
   *
   * 图糊的时候模型不会说"看不清"，它会**编一个看起来合理的数字**
   * （实测 540 像素宽的化验单被读出根本不存在的参考范围）。
   * 与其让家长把编出来的数值当成真的，不如先问一句。
   */
  const blurry = await findBlurryScanImages(filePaths)
  if (blurry.length > 0) {
    const goOn = await confirmBlurryScanImages(blurry)
    if (!goOn) {
      isBusy.value = false
      return
    }
  }

  /**
   * **不属于某一页**的提示（例如"第 1、3 张没能识别"这种总结）。
   *
   * 某一张自己的提示不放这里 —— 它贴在那一张的缩略图下面
   * （老板 2026-10-04："红字的提醒放在报告的缩略图下方更合理，更方便观看和对比"），
   * 放到卡片底部会让人来回找"这是说哪一张"。只有单张上传时才回到底部。
   */
  const collectedWarnings: string[] = []
  /** 一张都没读出来时报错要用：第一句能说清原因的话 */
  let firstReadableWarning = ''
  /**
   * 逐张的识别结果（2026-10-03 老板问"能搞清楚具体是哪一张没被识别吗"）。
   * 每张记：第几张、本地缩略图（可点开看原图）、结果、判定类型、这页自己的提示。
   * 结果 = ok（读出内容）/ empty（读了但没内容）/ failed（这一步就失败了）。
   */
  const pageResults = pageResultsCache
  /**
   * 按"这张图被判成什么"分组收草稿（2026-10-02 修的一个**数据丢失** bug）。
   *
   * 原来所有页的草稿都堆在一起、按多数票算成一种类型再合并成一条：
   * 顾客一次传了「化验单 ×4 + 门诊病历 ×2」，多数票算成体检 →
   * 保存时只提交体检字段，**病历里的诊断、医嘱、用药被整段丢掉**
   * （实测：面包那次的"膀胱结石、膀胱炎 + 泌尿系统处方粮"就是这么丢的）。
   * 现在按类型分组、各组各自合并 → 化验单成一条体检记录，
   * 门诊病历成一条病历记录，谁也不吃掉谁。
   */
  let failed = 0

  try {
    for (let index = 0; index < filePaths.length; index += 1) {
      uni.showLoading({
        title: filePaths.length > 1
          ? `识别中 ${index + 1}/${filePaths.length}…`
          : '识别中…',
        mask: true,
      })

      // 这一张传上去的地址：失败时要把它删掉（见下面的 catch）
      let uploadedUrl = ''

      try {
        // ① 先传到 COS（与手工上传附件同一条路）
        const uploaded = await dogApi.uploadHealthAttachment(props.uploadType, filePaths[index])
        if (!uploaded?.url) {
          throw new Error('图片上传失败')
        }
        uploadedUrl = String(uploaded.url)
        uploadedUrls.value.push(uploadedUrl)

        // ② 再交给 AI 识别（传 AUTO 时由后端判定这是哪一类文档）
        const res: any = await dogApi.extractHealthReport({
          imageUrl: uploaded.url,
          documentType: props.documentType,
        })
        if (res.code !== 0 || !res.data) {
          throw new Error(res.message || '识别失败')
        }

        const list = Array.isArray(res.data.drafts) ? res.data.drafts : []
        const type = String(res.data.documentType || '').toUpperCase()
        // NOT_MEDICAL / AUTO 都不算一种表单类型
        const imageType = type && type !== 'AUTO' && type !== 'NOT_MEDICAL'
          ? type
          : String(props.documentType || 'MEDICAL_RECORD').toUpperCase()

        if (list.length > 0) {
          // 2026-10-01：把顾客拍的这张原图挂到"这张图识别出来的草稿"上。
          // 识别结果只是从报告上抄下来的字，报告原件才是凭证（顾客要回看、医生要看原件）。
          // 后端返回的 drafts 里 attachments 是空数组，图片地址只有这里知道。
          // 2026-10-08：按**页**存（重传一页时要整页替换，不能叠加）
          pageDraftCache[index] = {
            type: imageType,
            drafts: list.map((draft: Record<string, any>) => ({
              ...draft,
              attachments: [uploaded.url],
            })),
          }
          scannedImageCount.value += 1
          pageResults.push({
            index: index + 1,
            path: filePaths[index],
            status: 'ok',
            label: TYPE_LABELS[imageType as ExplicitDocumentType] || '资料',
            warnings: [],
          })
        } else {
          // 这张啥也没读出来 → 传上去的图没用了，立刻删掉，别占 COS 空间
          pageDraftCache[index] = { type: imageType, drafts: [] }
          await dropUploadedFile(uploadedUrl)
          failed += 1
          pageResults.push({
            index: index + 1,
            path: filePaths[index],
            status: 'empty',
            label: '',
            warnings: [],
          })
        }

        // 这页自己的提示带上"第几张"，家长才知道该去核对哪一张
        if (Array.isArray(res.data.warnings) && res.data.warnings.length > 0) {
          const pageWarnings = res.data.warnings.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          const last = pageResults[pageResults.length - 1]
          if (last && last.index === index + 1) {
            last.warnings = pageWarnings
          }
          if (!firstReadableWarning && pageWarnings.length > 0) {
            firstReadableWarning = pageWarnings[0]
          }
        }

      } catch (error: any) {
        // 多张里有一张失败不推翻其它的：先记下来，最后一起告诉顾客
        pageDraftCache[index] = {
          type: String(props.documentType || 'MEDICAL_RECORD').toUpperCase(),
          drafts: [],
        }
        await dropUploadedFile(uploadedUrl)
        failed += 1
        const reason = error?.message || '没能识别'
        pageResults.push({
          index: index + 1,
          path: filePaths[index],
          status: 'failed',
          label: '',
          warnings: [reason],
        })
        if (!firstReadableWarning) {
          firstReadableWarning = reason
        }
      }
    }

    const draftsByType = collectDraftsByType()
    const collectedCount = [...draftsByType.values()]
      .reduce((sum, list) => sum + list.length, 0)
    if (collectedCount === 0) {
      throw new Error(
        firstReadableWarning || collectedWarnings[0] || '没识别到内容，请换一张更清晰的图片',
      )
    }

    if (failed > 0) {
      const failedIndexes = pageResults
        .filter((item) => item.status !== 'ok')
        .map((item) => `第 ${item.index} 张`)
        .join('、')
      collectedWarnings.push(
        `${failedIndexes} 没能识别（共 ${failed} 张），可以单独再试或手工补充`,
      )
    }

    /*
     * 合并 + 摆界面（2026-10-08 抽成函数）——
     * "单独重传某一页"要用同一套合并逻辑重算，所以不能再内联在这里。
     * ⚠️ 抽的时候保持行为完全一致：AUTO 入口合成一条、疫苗本不合并、
     *    逐张提示按合并结果筛一遍（那一步必须在 merged 之后，2026-10-04 的线上事故）。
     */
    renderMergedResult()

    showConfirm.value = true
    syncLeaveGuard()
  } catch (error: any) {
    // 一块看得见的提示，而不是一闪而过的 toast；
    // 基础设施类报错（腾讯云"服务未开通"之类）也不直接甩给顾客，换成能懂的话
    failureNotice.value = resolveHealthScanErrorMessage(error?.message)

    /**
     * 这一批图已经没用了，别把它们留在 COS 里当垃圾（2026-10-04）。
     *
     * 走到这里说明整批没合成任何记录 —— 家长要么重传、要么手填，这些图永远不会
     * 被任何记录引用。从前只有点「重新上传」才删，点了「知道了」就留在云上占空间。
     */
    const leftovers = [...uploadedUrls.value]
    uploadedUrls.value = []
    leftovers.forEach((url) => {
      void dropUploadedFile(url)
    })
  } finally {
    isBusy.value = false
    uni.hideLoading()
  }
}

function accept() {
  emit('scanned', {
    drafts: drafts.value,
    documentType: resolvedDocumentType.value || props.documentType,
  })
  showConfirm.value = false
  drafts.value = []
  failureNotice.value = ''
  // 图片交给上层了（跟着记录一起保存），这里不再算"没用上"
  uploadedUrls.value = []
}

/**
 * 「选文档（PDF / Word）」（2026-10-08 老板定）。
 *
 * 老板："就诊报告、体检报告、过敏检测报告，有时是 PDF 或者 Word 文档，
 *        需要支持进入微信、选择文档上传。"
 *
 * 微信只允许从**聊天记录**里选文件（`chooseMessageFile`）——
 * 所以引导语要说清"先把文件发到微信里（发给文件传输助手也行），再从聊天里选"。
 */
function pickOneDocument(): Promise<{ path: string; name: string }> {
  return new Promise((resolve) => {
    const choose = (uni as unknown as { chooseMessageFile?: (options: any) => void })
      .chooseMessageFile
    if (typeof choose !== 'function') {
      uni.showToast({ title: '当前环境不支持选文档，请在手机微信里打开', icon: 'none' })
      resolve({ path: '', name: '' })
      return
    }
    choose({
      count: 1,
      type: 'file',
      extension: ['pdf', 'docx'],
      success: (res: any) => {
        const file = (res?.tempFiles || [])[0] || {}
        resolve({ path: String(file.path || ''), name: String(file.name || '文档') })
      },
      fail: () => resolve({ path: '', name: '' }),
    })
  })
}

/** 选一份文档 → 上传 → 识别 → 进确认页（文档一次一份，不走多页累加） */
async function startDocumentScan() {
  if (isBusy.value) {
    return
  }

  const picked = await pickOneDocument()
  if (!picked.path) {
    return
  }

  isBusy.value = true
  showConfirm.value = false
  uni.showLoading({ title: '识别文档中…', mask: true })
  try {
    const uploaded = await dogApi.uploadHealthAttachment(props.uploadType, picked.path)
    if (!uploaded?.url) {
      throw new Error('文件上传失败')
    }
    const url = String(uploaded.url)

    const res: any = await dogApi.extractHealthReport({
      imageUrl: url,
      originalFilename: picked.name,
      documentType: props.documentType,
    })
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '识别失败')
    }

    const list = Array.isArray(res.data.drafts) ? res.data.drafts : []
    if (list.length === 0) {
      throw new Error('这份文档里没读到内容，可以试试拍照上传')
    }

    const type = String(res.data.documentType || '').toUpperCase()
    const imageType = type && type !== 'AUTO' && type !== 'NOT_MEDICAL'
      ? type
      : String(props.documentType || 'MEDICAL_RECORD').toUpperCase()

    pageResultsCache = [
      {
        index: 1,
        path: '',
        status: 'ok',
        label: picked.name,
        warnings: [],
        fileName: picked.name,
      },
    ]
    pageDraftCache = [
      {
        type: imageType,
        drafts: list.map((draft: Record<string, any>) => ({
          ...draft,
          attachments: [url],
        })),
      },
    ]
    uploadedUrls.value = [url]
    requestedImageCount.value = 1
    scannedImageCount.value = 1
    ignoredPagesNote.value = ''
    failureNotice.value = ''

    renderMergedResult()
    showConfirm.value = true
  } catch (error: any) {
    failureNotice.value = resolveHealthScanErrorMessage(error?.message)
  } finally {
    isBusy.value = false
    uni.hideLoading()
  }
}

/** 只选一张图（重传某一页用） */
function pickOneImage(): Promise<string> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: SCAN_IMAGE_SIZE_TYPE,
      sourceType: ['album'],
      success: (res: any) => resolve(String((res?.tempFilePaths || [])[0] || '')),
      fail: () => resolve(''),
    })
  })
}

/**
 * 「重传这一张」（2026-10-08 老板要求做的）。
 *
 * 界面一直写着"可以单独重传一次"，但那个功能**从来不存在** ✗ ——
 * 7 张里第 3 张糊了，顾客只能整批丢掉重拍。
 *
 * 做法：重选一张 → 上传 + 识别 → **只替换这一页**的草稿 → 按新的页集合重新合并。
 * ⚠️ 先拿"候选页集合"算一遍合并结果：如果换上来这张什么都没读出来，
 *    就**保留原来的结果**（不能因为重传一次把顾客已经有的东西弄丢）。
 */
async function rescanPage(pageIndex: number) {
  if (isBusy.value) {
    return
  }

  const picked = await pickOneImage()
  if (!picked) {
    return
  }

  isBusy.value = true
  uni.showLoading({ title: '重新识别这一张…', mask: true })
  try {
    let prepared = picked
    try {
      const list = await prepareScanImages([picked])
      if (list.length > 0) prepared = list[0]
    } catch {
      // 压缩失败就用原图，别挡着顾客
    }

    const blurry = await findBlurryScanImages([prepared])
    if (blurry.length > 0) {
      const goOn = await confirmBlurryScanImages(blurry)
      if (!goOn) {
        return
      }
    }

    const uploaded = await dogApi.uploadHealthAttachment(props.uploadType, prepared)
    if (!uploaded?.url) {
      throw new Error('图片上传失败')
    }
    const newUrl = String(uploaded.url)

    const res: any = await dogApi.extractHealthReport({
      imageUrl: newUrl,
      documentType: props.documentType,
    })
    if (res.code !== 0 || !res.data) {
      await dropUploadedFile(newUrl)
      throw new Error(res.message || '识别失败')
    }

    const list = Array.isArray(res.data.drafts) ? res.data.drafts : []
    const type = String(res.data.documentType || '').toUpperCase()
    const imageType = type && type !== 'AUTO' && type !== 'NOT_MEDICAL'
      ? type
      : String(props.documentType || 'MEDICAL_RECORD').toUpperCase()

    const nextPages = [...pageDraftCache]
    nextPages[pageIndex] = {
      type: imageType,
      drafts: list.map((draft: Record<string, any>) => ({
        ...draft,
        attachments: [newUrl],
      })),
    }

    // 候选集合先算一遍：换上来这张要是什么都没读到，就保留原来的结果
    if (mergePageDrafts(nextPages).merged.length === 0) {
      await dropUploadedFile(newUrl)
      uni.showToast({ title: '这一张还是没读出内容，原来的结果先留着', icon: 'none' })
      return
    }

    // 提交：换掉这一页，并把这一页原来那张图从 COS 删掉
    const oldUrl = String(pageDraftCache[pageIndex]?.drafts?.[0]?.attachments?.[0] || '')
    pageDraftCache = nextPages
    pageResultsCache[pageIndex] = {
      index: pageIndex + 1,
      path: prepared,
      status: list.length > 0 ? 'ok' : 'empty',
      label: TYPE_LABELS[imageType as ExplicitDocumentType] || '资料',
      warnings: (Array.isArray(res.data.warnings) ? res.data.warnings : [])
        .map((item: unknown) => String(item || '').trim())
        .filter(Boolean),
    }
    uploadedUrls.value.push(newUrl)
    if (oldUrl) {
      void dropUploadedFile(oldUrl)
    }

    renderMergedResult()
    uni.showToast({ title: '这一张换好了', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: resolveHealthScanErrorMessage(error?.message), icon: 'none' })
  } finally {
    isBusy.value = false
    uni.hideLoading()
  }
}

/**
 * 把一张没用上的图片从 COS 删掉（失败就算了，服务端还有定期清理兜底）。
 *
 * 老板问过"识别了但没保存的附件会不会白占 COS 空间" —— 会，所以这里主动删：
 *   · 这张图没读出来 / 读挂了
 *   · 顾客点了「重新上传」把整轮结果丢掉
 */
async function dropUploadedFile(url: string) {
  const key = extractHealthAttachmentKey(String(url || ''))
  if (!key) {
    return
  }

  uploadedUrls.value = uploadedUrls.value.filter((item) => item !== url)

  try {
    await dogApi.deleteHealthAttachment(props.uploadType, key)
  } catch {
    // 静默：删不掉不该影响顾客继续操作
  }
}

/** 顾客看清提示后收起这块面板（图已经删了） */
function dismissFailure() {
  failureNotice.value = ''
}

/** 「重新上传」：直接再开一次相册（原来文案叫"重新拍"，但走的是相册，2026-10-02 改） */
function discard() {
  showConfirm.value = false
  syncLeaveGuard()
  drafts.value = []
  failureNotice.value = ''

  // 「重新上传」＝这一轮的结果都不要了：把传上去的图一起删掉，别留在 COS 里
  const leftovers = [...uploadedUrls.value]
  uploadedUrls.value = []
  leftovers.forEach((url) => {
    void dropUploadedFile(url)
  })

  pickAndScan()
}
</script>

<style scoped lang="scss">
/* ── 疫苗本：逐条确认的行列表（2026-10-08）────────────────────────────
   一行给全"要核对的三样"：名字 · 日期 · 含哪些病种；
   点一行就地改，右侧点「确认」；系统拿不准的排最前面并标红。 */
.pages__thumb--file {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f5f4;
}
.pages__thumb-file {
  font-size: 44rpx;
}
.pages__reupload {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #0f7b49;
  text-align: center;
}
.rows__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 8rpx 0 12rpx;
}
.rows__hint {
  flex: 1;
  font-size: 24rpx;
  color: #c0392b;
  font-weight: 600;
  line-height: 1.5;
}
.rows__progress {
  font-size: 24rpx;
  color: #0f7b49;
  font-weight: 600;
}
.row {
  border: 1rpx solid #e6e6e6;
  border-radius: 12rpx;
  margin-bottom: 12rpx;
  background: #ffffff;
  overflow: hidden;
}
.row--care {
  border-color: #e6a23c;
  background: #fffaf0;
}
.row--confirmed {
  border-color: #0f7b49;
}
.row__main {
  display: flex;
  align-items: center;
  padding: 18rpx 20rpx;
}
.row__no {
  width: 40rpx;
  font-size: 24rpx;
  color: #9a9a9a;
}
.row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.row__name {
  font-size: 30rpx;
  color: #222222;
  font-weight: 600;
}
.row__meta {
  font-size: 24rpx;
  color: #666666;
  margin-top: 6rpx;
}
.row__care {
  font-size: 24rpx;
  color: #c0392b;
  margin-top: 6rpx;
}
.row__confirm {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid #0f7b49;
  color: #0f7b49;
  font-size: 26rpx;
}
.row__confirm--done {
  background: #0f7b49;
  color: #ffffff;
}
.row__edit {
  border-top: 1rpx dashed #e6e6e6;
  padding: 16rpx 20rpx 20rpx;
}
.row__field {
  margin-bottom: 14rpx;
}
.row__label {
  font-size: 24rpx;
  color: #7a7a7a;
}
.row__input {
  display: block;
  margin-top: 6rpx;
  padding: 12rpx 16rpx;
  border: 1rpx solid #e6e6e6;
  border-radius: 10rpx;
  font-size: 28rpx;
  color: #222222;
  background: #fafafa;
}
.row__chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
}
.row__chip-hint {
  font-size: 24rpx;
  color: #7a7a7a;
  margin-right: 10rpx;
}
.row__chip {
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  border: 1rpx solid #e6e6e6;
  color: #555555;
  font-size: 24rpx;
  margin: 0 10rpx 10rpx 0;
}
.row__chip--active {
  border-color: #0f7b49;
  color: #0f7b49;
  background: #eef8f2;
}

@import '../../styles/health-section.scss';

.scan {
  margin-bottom: 20rpx;
}

.scan__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.scan__button {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  padding: 16rpx 26rpx;
  border-radius: 999rpx;
}

.scan__button--busy {
  opacity: 0.6;
}

.scan__hint {
  flex: 1;
  min-width: 0;
  font-size: 21rpx;
  line-height: 1.5;
  color: #8a968a;
}

/* 一次性确认 */
.confirm {
  margin-top: 20rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: var(--health-accent-soft, #eef2e4);
  border: 2rpx solid var(--health-accent, #1e3a2f);
}

/* 这几行都是 <text>（inline），不加 block 会全部挤在一行里 ——
   2026-10-02 老板截图里"识别为：病历 + 体检报告本次共 8 张图片…"就是这么来的 */
.confirm__type {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #4e6b52;
}

.confirm__title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

/* 名字对不上时的提醒（只提醒不拦截）*/
.confirm__name-warning {
  margin-top: 12rpx;
  padding: 18rpx 20rpx;
  border-radius: 16rpx;
  background: #fef3f2;
  border: 1rpx solid #f5c6c2;
}

.confirm__name-warning-title {
  display: block;
  font-size: 25rpx;
  font-weight: 700;
  color: #b42318;
}

.confirm__name-warning-text {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #7a3b36;
}

.confirm__card-kind {
  display: block;
  margin-bottom: 8rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #6b7a52;
}

.confirm__card {
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.75);
}

/* 每条：标签独占一行（小号灰字）+ 内容另起一段（深色正文）+ 细分隔线。
   2026-10-02 老板提的：原来标签和内容是同一行紧挨着的两段文字，
   值一长就糊成一片，分不清哪个是标题、哪个是内容。 */
.confirm__row {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 16rpx 0;
  border-top: 1rpx solid #eef1e8;
}

.confirm__row:first-child {
  padding-top: 0;
  border-top: none;
}

.confirm__label {
  font-size: 22rpx;
  line-height: 1.4;
  color: #8a968a;
}

.confirm__value {
  font-size: 26rpx;
  line-height: 1.65;
  color: #26261f;
  font-weight: 500;
  /* 长文本（医嘱、化验数据）保留换行，别挤成一坨 */
  white-space: pre-wrap;
  word-break: break-all;
}

/* 类型/记录说明（"记到：就诊记录"这类） */
/* 逐张状态：横排小缩略图 + 结果 */
.pages {
  margin-top: 14rpx;
}

.pages__title {
  display: block;
  font-size: 22rpx;
  color: #8a968a;
}

.pages__row {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 10rpx;
}

.pages__item {
  position: relative;
  width: 150rpx;
  padding: 8rpx;
  border-radius: 14rpx;
  background: #f7f9f2;
  border: 1rpx solid #e4e9dc;
}

.pages__item--empty,
.pages__item--failed {
  background: #fdf6ec;
  border-color: #f0d9b5;
}

.pages__thumb {
  width: 134rpx;
  height: 134rpx;
  border-radius: 10rpx;
  background: #eef1e8;
}

/* 只传了一张时给它一个大一点的预览：那是顾客唯一能对照的原图，
   150rpx 的缩略图看不清本子上的字。 */
.pages__item--single {
  width: 320rpx;
}

.pages__item--single .pages__thumb {
  width: 304rpx;
  height: 304rpx;
}

.pages__index {
  position: absolute;
  top: 14rpx;
  left: 14rpx;
  min-width: 32rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  line-height: 30rpx;
  text-align: center;
  color: #fff;
  background: rgba(30, 46, 36, 0.6);
}

.pages__status {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  line-height: 1.35;
  color: #4e6b52;
}

.pages__item--empty .pages__status,
.pages__item--failed .pages__status {
  color: #b26a2f;
}

/* 逐张的提示：紧跟在缩略图那一排下面（老板 2026-10-04 要求挪到这里） */
.pages__warnings {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  margin-top: 10rpx;
  padding: 10rpx 14rpx;
  border-radius: 12rpx;
  background: #fdf6ec;
  border-left: 6rpx solid #e0b070;
}

.pages__warning {
  font-size: 22rpx;
  line-height: 1.5;
  color: #a8622a;
}

.pages__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  line-height: 1.6;
  color: #8a968a;
}

.confirm__note {
  margin-top: 10rpx;
  padding: 16rpx 18rpx;
  border-radius: 14rpx;
  background: #f4f7ef;
  border: 1rpx solid #dde6d4;
}

.confirm__note-text {
  display: block;
  font-size: 23rpx;
  line-height: 1.6;
  color: #4e6b52;
}

/* 没识别到内容时的提示块（2026-10-02）：要看得见，不能一闪而过 */
.failure {
  margin-bottom: 20rpx;
  padding: 26rpx 24rpx;
  border-radius: 20rpx;
  background: #fdf6ec;
  border: 1rpx solid #f0d9b5;
}

.failure__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #8a5a1b;
}

.failure__message {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #6b5a3e;
}

.failure__actions {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20rpx;
}

.confirm__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22rpx;
}

.confirm__discard {
  font-size: 26rpx;
  color: #6b6653;
  padding: 14rpx 22rpx;
}

.confirm__accept {
  font-size: 26rpx;
  font-weight: 600;
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  padding: 16rpx 30rpx;
  border-radius: 999rpx;
}

.confirm__risk {
  display: block;
  margin: 6rpx 0 14rpx;
  font-size: 22rpx;
  color: #7a7a7a;
}

/* 复核意见（2026-10-09）：只在"不一致"时出现 */
.row__review {
  margin: 4rpx 0 10rpx;
  padding: 12rpx 14rpx;
  border-radius: 10rpx;
  background: #fff6f5;
  border: 1rpx solid #e8b4ae;
}
.row__review-title {
  font-size: 24rpx;
  color: #c0392b;
  line-height: 1.5;
}
.row__chip--strong {
  border-color: #c0392b;
  color: #c0392b;
  background: #fdeeed;
}
</style>
