<template>
  <view class="health-section" :class="activeTypeMeta.accentClass">
    <!-- 内嵌到健康管理页时不显示这一行（2026-10-01 老板要求）：
         上面那张卡的书签已经写着「病例 / 过敏」，这里再顶一个同名标题和「N 条」
         就是重复，还把正文往下推了一行。独立成页时（不内嵌）照旧显示。 -->
    <view v-if="!embedded" class="health-section__header">
      <view>
        <text class="health-section__title">健康记录</text>
        <text class="health-section__desc">
          按类别整理每一条记录，附件可在展开后上传和预览。
        </text>
      </view>
      <text class="health-section__count">{{ savedRecordCount }} 条</text>
    </view>

    <!-- 内嵌模式（健康管理页）：上级已经有「病史/体检/过敏」书签页，
         这里再放一套一模一样的标签就是重复。由 embedded 关掉。 -->
    <view v-if="!embedded" class="record-type-tabs">
      <button
        v-for="type in HEALTH_RECORD_TYPES"
        :key="type"
        class="record-type-tabs__item"
        :class="[
          getHealthRecordTypeMeta(type).accentClass,
          { 'record-type-tabs__item--active': type === currentType },
        ]"
        :disabled="loading || hasUploadingRecords || hasSavingRecord"
        @tap="requestTypeChange(type)"
      >
        {{ getHealthRecordTypeMeta(type).label }}
      </button>
    </view>

    <!-- 当前类别的额外入口（2026-09-27）：给「过敏」放"快速添加 + 上传报告自动识别"。
         放在标签页下方、记录列表上方 —— 顾客切到过敏时第一眼就能看到最省事的填法。 -->
    <!-- 只有「过敏」板块会用到这个插槽（快速添加过敏原）。
         其它板块传进来的是一个空容器：它会作为 flex 子元素占掉一个 gap，
         书签下方又多一条空白 —— 所以由调用方用 showTypeExtra 显式开关。 -->
    <slot v-if="showTypeExtra" name="type-extra" />

    <!-- 拍照录入（2026-10-01，第六期；同日按老板要求并入底部那一个「新增记录」）。
         原来这里是「拍病历 / 拍体检报告」两个选择器 + 一个「拍照录入」按钮 +
         下面再一个「新增记录」——三处入口做同一件事。现在统一成底部一个按钮：
         点它选「手动填写 / 拍病历 / 拍体检报告」，这里只保留识别结果的确认卡片。 -->
    <!-- 扫描组件**常驻挂载**、用 class 控制显隐（2026-10-02 修的一个真 bug）。
         原来写成 v-if="… && scanActive"：第一次点「从相册选择」时才挂载，
         紧接着 nextTick 就去调它的方法 —— 但小程序里组件挂载要等下一次 setData，
         那一刻 ref 还是空的，调用被 ?. 静默吞掉，**第一次点击没有任何反应**，
         第二次才弹出选择器；扫完又 unmount，于是每次都要点两下才灵。
         改成常驻 + display:none：空闲时不占高度（原来担心的空条不会回来），
         点一下就能立刻把选择器叫起来。 -->
    <view
      v-if="isVisitMode && dogId"
      class="scan-entry"
      :class="{ 'scan-entry--hidden': !scanActive }"
    >
      <HealthDocumentScan
        ref="scanRef"
        hide-trigger
        :dog-id="dogId"
        :dog-name="dogName"
        document-type="AUTO"
        upload-type="medical"
        @scanned="onScanned"
      />
    </view>

    <!-- 空态块（2026-10-01）：板块**自带引导卡**时不再显示 ——
         过敏板块上面那张「快速添加过敏原」卡已经写着"已记 0 项"并给了三种添加方式，
         再顶一块"还没有过敏记录"的空卡片纯属重复；它还会被底部按钮栏挡住，
         看着就是一块没内容的空白。 -->
    <view v-if="draftRecords.length === 0 && !hideEmptyState" class="health-section__empty">
      <text class="health-section__empty-title">
        {{ loading ? '记录加载中' : activeTypeMeta.emptyTitle }}
      </text>
      <text class="health-section__empty-desc">
        {{ isVisitMode ? getHealthVisitEmptyDescription() : '先补充一条基础记录，之后可以继续添加。' }}
      </text>
    </view>

    <view
      v-for="(record, index) in draftRecords"
      :key="recordKey(record, index)"
      :id="recordAnchorId(record, index)"
      class="record-card health-card"
      :class="{ 'record-card--dirty': isRecordDirty(record, index) }"
    >
      <view class="record-card__header">
        <view class="record-card__header-main" @tap="toggleRecordExpanded(index)">
          <view class="record-card__meta">
            <text class="record-card__index">{{ index + 1 }}</text>
            <text
              class="record-card__status"
              :class="{
                'record-card__status--saved': isSavedRecord(record, index) && !isRecordDirty(record, index),
                'record-card__status--dirty': isRecordDirty(record, index),
              }"
            >
              {{ recordStatusText(record, index) }}
            </text>
          </view>

          <view class="record-card__summary">
            <view class="record-card__summary-heading">
              <!-- 类型徽标：一个列表里混着就诊和体检，得让人一眼看出哪条是哪种 -->
              <text
                v-if="isVisitMode"
                class="record-card__kind-badge"
                :class="`record-card__kind-badge--${resolveHealthVisitKind(record)}`"
              >{{ HEALTH_VISIT_KIND_LABELS[resolveHealthVisitKind(record)] }}</text>
              <text class="record-card__summary-title">
                {{ recordSummary(record, index).title }}
              </text>
            </view>
            <text
              v-if="recordSummary(record, index).detail"
              class="record-card__summary-detail"
            >
              {{ recordSummary(record, index).detail }}
            </text>

            <view
              v-if="!isRecordExpanded(record, index) && attachmentList(record).length > 0"
              class="record-card__attachments-preview"
            >
              <view
                v-for="(attachment, attachmentIndex) in attachmentList(record).slice(0, 2)"
                :key="`${recordKey(record, index)}-preview-${attachment}-${attachmentIndex}`"
                class="record-card__attachment-preview"
                @tap.stop="previewAttachment(attachment)"
              >
                <text class="record-card__attachment-name">
                  {{ attachmentDisplay(attachment, attachmentIndex).detail }}
                </text>
                <text class="record-card__attachment-action">预览</text>
              </view>
              <text
                v-if="attachmentList(record).length > 2"
                class="record-card__attachment-more"
              >
                还有 {{ attachmentList(record).length - 2 }} 个附件
              </text>
            </view>
          </view>
        </view>

        <view class="record-card__header-actions">
          <button
            class="record-card__delete"
            :disabled="loading || hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"
            @tap.stop="removeRecord(index)"
          >
            删除
          </button>
          <text class="record-card__toggle" @tap.stop="toggleRecordExpanded(index)">
            {{ isRecordExpanded(record, index) ? '收起' : '展开' }}
          </text>
        </view>
      </view>

      <view v-if="isRecordExpanded(record, index)" class="record-card__body">
        <!-- 类型（仅「病例」模式）：就诊 / 体检。换类型等于换一张表，
             所以会清空重填，由 changeVisitKind 提示后再动。 -->
        <view v-if="isVisitMode" class="field-group">
          <text class="field-label">类型</text>
          <view class="kind-switch">
            <text
              v-for="kind in HEALTH_VISIT_KINDS"
              :key="`${recordKey(record, index)}-kind-${kind}`"
              class="kind-switch__item"
              :class="{ 'kind-switch__item--active': resolveHealthVisitKind(record) === kind }"
              @tap="changeVisitKind(index, kind)"
            >{{ HEALTH_VISIT_KIND_LABELS[kind] }}</text>
          </view>
          <!-- 切过来的草稿里，另一种类型独有的内容还在 —— 说一句，别让家长以为丢了 -->
          <text v-if="visitCarryOverHint(record)" class="field-label__hint">
            {{ visitCarryOverHint(record) }}
          </text>
        </view>

        <!-- ── 病历/检查：字段顺序＝家长填写顺序（2026-10-02 精简版）────────────
             必填只有两件：日期 +（主要问题 或 医生怎么说）。
             「状态」已从表单移除（家长不做系统选择题），改成存好后一键「已经好了」；
             「备注」改名「其它想说的」并提到明面（它已经接进 AI 分析）；
             只有复查日期、兽医这种少数情况才有的收进「选填」。 -->
        <template v-if="isVisitMode">
          <view class="field-group">
            <text class="field-label">{{ visitConfig(record).dateLabel }}</text>
            <picker
              mode="date"
              :disabled="hasSavingRecord"
              :value="readField(record, visitConfig(record).dateKey)"
              @change="updateTextField(index, visitConfig(record).dateKey, $event.detail.value)"
            >
              <view class="field-picker">
                {{ readField(record, visitConfig(record).dateKey) || `请选择${visitConfig(record).dateLabel}` }}
              </view>
            </picker>
          </view>

          <view v-if="visitConfig(record).complaintKey" class="field-group">
            <text class="field-label">{{ visitConfig(record).complaintLabel }}</text>
            <input
              class="field-input"
              type="text"
              :disabled="hasSavingRecord"
              :placeholder="visitConfig(record).complaintPlaceholder"
              :value="readField(record, visitComplaintKey(record))"
              @input="updateTextField(index, visitComplaintKey(record), $event.detail.value)"
            />
          </view>

          <view class="field-group">
            <text class="field-label">{{ visitConfig(record).primaryLabel }}</text>
            <input
              class="field-input"
              type="text"
              :disabled="hasSavingRecord"
              :placeholder="visitConfig(record).primaryPlaceholder"
              :value="readField(record, visitConfig(record).primaryKey)"
              @input="updateTextField(index, visitConfig(record).primaryKey, $event.detail.value)"
            />
          </view>

          <view v-if="visitConfig(record).labValuesKey" class="field-group">
            <text class="field-label">{{ visitConfig(record).labValuesLabel }}</text>
            <textarea
              class="field-textarea field-textarea--tall"
              :disabled="hasSavingRecord"
              placeholder="化验单上的数值，一行一项，例如：肌酐 72.2 umol/L"
              :value="readField(record, visitLabValuesKey(record))"
              @input="updateTextField(index, visitLabValuesKey(record), $event.detail.value)"
            />
          </view>

          <view class="field-group">
            <text class="field-label">{{ visitConfig(record).adviceLabel }}</text>
            <input
              class="field-input"
              type="text"
              :disabled="hasSavingRecord"
              :placeholder="visitConfig(record).advicePlaceholder"
              :value="readField(record, visitConfig(record).adviceKey)"
              @input="updateTextField(index, visitConfig(record).adviceKey, $event.detail.value)"
            />
          </view>

          <view v-if="visitConfig(record).medicationKey" class="field-group">
            <text class="field-label">{{ visitConfig(record).medicationLabel }}</text>
            <input
              class="field-input"
              type="text"
              :disabled="hasSavingRecord"
              placeholder="多个用顿号隔开，例如：速诺、胃复安"
              :value="readField(record, visitMedicationKey(record))"
              @input="updateTextField(index, visitMedicationKey(record), $event.detail.value)"
            />
          </view>

          <view class="field-group">
            <text class="field-label">{{ visitConfig(record).notesLabel }}</text>
            <textarea
              class="field-textarea"
              :disabled="hasSavingRecord"
              :placeholder="visitConfig(record).notesPlaceholder"
              :value="readField(record, visitConfig(record).notesKey)"
              @input="updateTextField(index, visitConfig(record).notesKey, $event.detail.value)"
            />
          </view>

          <!-- 已经好了：只给已保存的就诊记录。状态决定这条还算不算"还没结束的问题"，
               也就是会不会进 AI 健康分析 —— 但不该在填表时问家长。 -->
          <view
            v-if="visitConfig(record).complaintKey && isSavedRecord(record, index)"
            class="field-group"
          >
            <text class="field-label">这条现在的情况</text>
            <text class="status-switch" @tap="toggleVisitStatus(index)">
              {{ medicalStatusToggle(record).label }}
            </text>
            <text class="field-label__hint">{{ medicalStatusToggle(record).hint }}</text>
          </view>
        </template>

        <template v-else>
        <view class="field-group">
          <text class="field-label">{{ fieldConfigForRecord(record).primary.label }}</text>
          <picker
            v-if="fieldConfigForRecord(record).primary.options"
            mode="selector"
            :range="fieldOptionLabels(fieldConfigForRecord(record).primary.options)"
            :value="fieldOptionIndex(record, fieldConfigForRecord(record).primary.options, fieldConfigForRecord(record).primary.key)"
            :disabled="hasSavingRecord"
            @change="updateOptionField(index, fieldConfigForRecord(record).primary.key, fieldConfigForRecord(record).primary.options, $event.detail.value)"
          >
            <view class="field-picker">
              {{ readOptionFieldLabel(record, fieldConfigForRecord(record).primary.options, fieldConfigForRecord(record).primary.key) || `请选择${fieldConfigForRecord(record).primary.label}` }}
            </view>
          </picker>
          <input
            v-else
            class="field-input"
            type="text"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${fieldConfigForRecord(record).primary.label}`"
            :value="readField(record, fieldConfigForRecord(record).primary.key)"
            @input="updateTextField(index, fieldConfigForRecord(record).primary.key, $event.detail.value)"
          />
        </view>

        <view v-if="fieldConfigForRecord(record).date" class="field-group">
          <text class="field-label">{{ dateField(record).label }}</text>
          <picker
            mode="date"
            :disabled="hasSavingRecord"
            :value="readField(record, dateField(record).key)"
            @change="updateTextField(index, dateField(record).key, $event.detail.value)"
          >
            <view class="field-picker">
              {{ readField(record, dateField(record).key) || `请选择${dateField(record).label}` }}
            </view>
          </picker>
        </view>

        <view v-if="fieldConfigForRecord(record).secondary" class="field-group">
          <text class="field-label">{{ secondaryField(record).label }}</text>
          <input
            class="field-input"
            type="text"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${secondaryField(record).label}`"
            :value="readField(record, secondaryField(record).key)"
            @input="updateTextField(index, secondaryField(record).key, $event.detail.value)"
          />
        </view>

        <!-- 状态（目前只有病史用）：顾客自述来的记录默认「待确认」，
             由顾客在这里改成实际情况；系统不替兽医判断是不是慢性病 -->
        <view v-if="fieldConfigForRecord(record).status" class="field-group">
          <text class="field-label">{{ statusField(record).label }}</text>
          <picker
            mode="selector"
            :range="fieldOptionLabels(statusField(record).options)"
            :value="fieldOptionIndex(record, statusField(record).options, statusField(record).key)"
            :disabled="hasSavingRecord"
            @change="updateOptionField(index, statusField(record).key, statusField(record).options, $event.detail.value)"
          >
            <view class="field-picker">
              {{ readOptionFieldLabel(record, statusField(record).options, statusField(record).key) || `请选择${statusField(record).label}` }}
            </view>
          </picker>
        </view>

        <!-- 兽医（两张表都有这个字段，合并后才有入口） -->
        <view v-if="fieldConfigForRecord(record).veterinarian" class="field-group">
          <text class="field-label">{{ vetField(record).label }}</text>
          <input
            class="field-input"
            type="text"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${vetField(record).label}`"
            :value="readField(record, vetField(record).key)"
            @input="updateTextField(index, vetField(record).key, $event.detail.value)"
          />
        </view>

        <!-- 备注：体检表没有 notes 字段，所以体检记录这一栏是空的、不显示 -->
        <view v-if="fieldConfigForRecord(record).notes" class="field-group">
          <text class="field-label">{{ notesField(record).label }}</text>
          <textarea
            class="field-textarea"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${notesField(record).label}`"
            :value="readField(record, notesField(record).key)"
            @input="updateTextField(index, notesField(record).key, $event.detail.value)"
          />
        </view>

        </template>

        <view class="field-group">
          <view class="field-label field-label--row">
            <text>{{ attachmentList(record).length > 0 ? '附件（点击预览）' : '附件' }}</text>
          </view>

          <view v-if="attachmentList(record).length > 0" class="attachment-list">
            <view
              v-for="(attachment, attachmentIndex) in attachmentList(record)"
              :key="`${recordKey(record, index)}-${attachment}-${attachmentIndex}`"
              class="attachment-item"
            >
              <view class="attachment-item__preview" @tap="previewAttachment(attachment)">
                <view class="attachment-item__content">
                  <text class="attachment-item__title">
                    {{ attachmentDisplay(attachment, attachmentIndex).title }}
                  </text>
                  <text class="attachment-item__hint">
                    {{ attachmentDisplay(attachment, attachmentIndex).detail }}
                  </text>
                </view>
                <text class="attachment-item__action">预览</text>
              </view>
              <button
                class="attachment-item__remove"
                :disabled="hasSavingRecord || isRecordSaving(record, index)"
                @tap="removeAttachment(index, attachmentIndex)"
              >
                删除
              </button>
            </view>
          </view>

          <button
            class="attachment-button"
            :loading="isUploading(record, index)"
            :disabled="loading || hasSavingRecord || isUploading(record, index) || isRecordSaving(record, index)"
            @tap="chooseAttachment(index)"
          >
            上传附件（检查报告、化验单等）
          </button>
        </view>

        <view class="record-card__actions">
          <button
            v-if="secondaryActionText(record, index)"
            class="record-card__action record-card__action--ghost"
            :class="{ 'record-card__action--primary-only': embedded }"
            :disabled="hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"
            @tap="cancelRecord(index)"
          >
            {{ secondaryActionText(record, index) }}
          </button>
          <!-- 内嵌到健康管理页时隐藏逐条「保存」——改由底部那个自适应按钮统一保存。
               「取消」留着：草稿还是要能丢弃。 -->
          <button
            v-if="!embedded"
            class="record-card__action record-card__action--primary"
            :class="{
              'record-card__action--primary-only': !secondaryActionText(record, index),
              'record-card__action--disabled': saveButtonDisabled(record, index),
            }"
            :loading="isRecordSaving(record, index)"
            :disabled="saveButtonDisabled(record, index)"
            @tap="saveRecord(index)"
          >
            {{ saveButtonText(record, index) }}
          </button>
        </view>
      </view>
    </view>

    <!-- 「新增记录」（2026-10-01）：合并模式下这个入口搬到底部栏那一个按钮里
         （点它选手动填写或拍照），这里不再重复；过敏等单一类型板块照旧。 -->
    <button
      v-if="!isVisitMode"
      class="health-section__action"
      :class="{ 'health-section__action--disabled': loading || hasUploadingRecords || hasSavingRecord }"
      :disabled="loading || hasUploadingRecords || hasSavingRecord"
      @tap="addRecord"
    >
      {{ activeTypeMeta.addLabel }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'
import HealthDocumentScan from './HealthDocumentScan.vue'
import {
  HEALTH_RECORD_TYPES,
  HEALTH_VISIT_DEFAULT_CHECKUP_TYPE,
  HEALTH_VISIT_KIND_FIELD,
  HEALTH_VISIT_KIND_LABELS,
  HEALTH_VISIT_KINDS,
  type HealthCheckupTypeOption,
  type HealthRecordType,
  type HealthVisitKind,
  buildHealthAttachmentDisplayMeta,
  buildHealthAttachmentFieldHint,
  buildHealthRecordFocusIdentity,
  buildHealthRecordSummary,
  buildHealthVisitPayload,
  buildHealthVisitSummary,
  createHealthRecordDraft,
  createHealthVisitDraft,
  doHealthRecordsMatchPersistedPayload,
  extractHealthAttachmentKey,
  findHealthRecordFocusIndex,
  formatHealthCheckupTypeLabel,
  getHealthVisitEmptyDescription,
  getHealthVisitFieldConfig,
  resolveMedicalStatusToggle,
  getHealthVisitSectionMeta,
  getHealthVisitValidationError,
  getHealthCheckupTypeOptions,
  getMedicalStatusOptions,
  getHealthRecordTypeMeta,
  getHealthRecordValidationError,
  readHealthAttachmentFileSize,
  resolveHealthAttachmentFileSizeError,
  previewHealthAttachment,
  resolveHealthAttachmentSelectionError,
  resolveHealthAttachmentUploadErrorMessage,
  resolveHealthRecordSecondaryActionText,
  resolveHealthVisitDate,
  resolveHealthVisitKind,
  normalizeHealthVisitRecord,
} from '../../utils/health-records'

type FieldConfig = {
  primary: { key: string, label: string, options?: HealthCheckupTypeOption[] }
  date: { key: string, label: string } | null
  secondary: { key: string, label: string } | null
  /**
   * 下拉式状态字段（2026-09-28 加入）。
   *
   * 病史用它承载「待确认 / 治疗中 / 已康复 / 慢性」——
   * 顾客自述来的记录先记"待确认"，由顾客在这里改成实际情况，
   * 系统不替兽医断言是不是慢性病（老板拍板的决策 5）。
   */
  status?: { key: string, label: string, options: HealthCheckupTypeOption[] } | null
  /** 备注：体检表没有 notes 字段，所以「病例」模式下体检记录这里是 null */
  notes: { key: string, label: string } | null
  /** 接诊兽医（2026-10-01 加入，两张表都有这个字段） */
  veterinarian?: { key: string, label: string } | null
  /**
   * 「病例」模式下才为真：一张表单同时服务就诊与体检，
   * 顶部多一个「类型」选择，并按类型决定下面显示哪些字段。
   */
  kindSelect?: boolean
  /**
   * 收进「更多」的次要字段（2026-10-01）。
   * 老板要求"病史只保留一个诊断结果"，其余一律折叠，不挡着保存。
   */
  extras?: {
    complaint?: { key: string, label: string }
    checkupType?: { key: string, label: string, options: HealthCheckupTypeOption[] }
    medications?: { key: string, label: string }
    followUpDate?: { key: string, label: string }
  }
}

const props = withDefaults(defineProps<{
  dogId: string
  /**
   * 当前这只狗的名字（2026-10-02）。
   * 只用于核对：报告上写的动物名和它对不上时提醒家长，**不拦着保存** ——
   * 要不要存进这个档案由家长自己决定（老板定的）。
   */
  dogName?: string
  /**
   * 板块标识。`'visit'` 是「病例」合并模式（一个列表同时装就诊与体检），
   * 由组件内部逐条判断每条记录真正属于哪张表 —— 所以它是合法取值，
   * 上面的类型漏了它（2026-10-01 自查补）。
   */
  activeType?: HealthRecordType | 'visit'
  records?: Record<string, any>[]
  loading?: boolean
  savingRecordKey?: string
  preferredExpandedRecordIdentity?: string
  modelValue?: Record<string, any>[]
  recordType?: HealthRecordType
  /**
   * 内嵌到上级的标签页里（健康管理页）。
   * 为真时隐藏组件自带的「病史/体检/过敏」标签与那段说明 ——
   * 上级已经有同一套书签，留着就是重复。
   */
  embedded?: boolean
  /**
   * 是否渲染 type-extra 插槽（只有过敏板块会往里放"快速添加过敏原"）。
   *
   * 缺省 true 保持既有行为；「病历/检查」板块传 false —— 否则调用方那个空的
   * 插槽容器会作为 flex 子元素占掉一个 gap，书签下方就多一条空白。
   */
  showTypeExtra?: boolean
  /**
   * 是否隐藏空态块：板块自带引导卡时（过敏的「快速添加过敏原」）传 true，
   * 否则会在引导卡下面再显示一块内容重复、又容易被底部按钮栏挡住的空卡片。
   */
  hideEmptyState?: boolean
}>(), {
  activeType: undefined,
  showTypeExtra: true,
  hideEmptyState: false,
  records: () => [],
  loading: false,
  savingRecordKey: '',
  preferredExpandedRecordIdentity: '',
  modelValue: () => [],
  recordType: undefined,
  embedded: false,
})

const emit = defineEmits<{
  (event: 'change-type', value: HealthRecordType): void
  (event: 'save-record', value: {
    type: HealthRecordType
    record: Record<string, any>
    recordKey: string
  }): void
  (event: 'delete-record', value: { type: HealthRecordType, record: Record<string, any> }): void
  (event: 'dirty-change', value: boolean): void
  (event: 'record-saved', identity: string): void
}>()

const draftRecords = ref<Record<string, any>[]>([])
const savedSnapshots = ref<Record<string, Record<string, any>>>({})
const uploadingKeys = ref<Record<string, boolean>>({})
const expandedRecordKey = ref<string | null>(null)
const lastSyncedType = ref<HealthRecordType | null>(null)
const recentSavingRecordKey = ref('')
const attachmentHintText = buildHealthAttachmentFieldHint()

const currentType = computed<HealthRecordType | 'visit'>(
  () => props.activeType || props.recordType || 'medical',
)

/**
 * 「非合并模式下的当前类型」——只有它不是 'visit'。
 *
 * 合并模式没有单一类型，但本地 key、草稿比对、聚焦定位这些**非业务用途**
 * 仍需要一个稳定的类型前缀，统一取 `'medical'`（合并列表的主类型）。
 * 业务判断一律走 recordKindOf()，不要用这个。
 */
const baseType = computed<HealthRecordType>(() => (
  currentType.value === 'visit' ? 'medical' : currentType.value
))

/**
 * 「病例」模式（2026-10-01）：
 * 一个列表里同时装「就诊」和「体检」两类记录。
 *
 * ★ 合并只在界面层：每条记录身上带一个 __visitKind 标记它属于哪张表，
 *   保存/删除时按这个标记分别调原来的两个接口，数据库两张表原样不动。
 */
const isVisitMode = computed(() => (props.activeType as string) === 'visit')

/**
 * 附件上传/删除接口用的类型。
 *
 * 合并模式（`'visit'`）没有单一记录类型：历史上它落到通用上传口
 * （`/health/upload-image`）与通用删除口（`/health/attachments`）——
 * 与过敏同一支。这里把 `'visit'` 显式写成 `'allergy'`：**接口一字不变**，
 * 只是让类型能对上（2026-10-01 自查）。
 */
const attachmentApiType = computed<HealthRecordType>(() => (
  currentType.value === 'visit' ? 'allergy' : currentType.value
))

/** 某条记录真正对应哪张表：合并模式下逐条判断，其余模式就是当前类型 */
function recordKindOf(record: Record<string, any>): HealthRecordType {
  return isVisitMode.value ? resolveHealthVisitKind(record) : baseType.value
}

const activeTypeMeta = computed(() => (
  isVisitMode.value ? getHealthVisitSectionMeta() : getHealthRecordTypeMeta(baseType.value)
))
const sourceRecords = computed(() => (
  props.records.length > 0 || !props.modelValue.length ? props.records : props.modelValue
))
const savedRecordCount = computed(() => sourceRecords.value.length)
const hasDirtyRecords = computed(() =>
  draftRecords.value.some((record, index) => isRecordDirty(record, index)),
)
const hasUploadingRecords = computed(() => Object.values(uploadingKeys.value).some(Boolean))
const hasSavingRecord = computed(() => Boolean(props.savingRecordKey))

watch(
  () => props.savingRecordKey,
  (nextKey, previousKey) => {
    if (nextKey) {
      recentSavingRecordKey.value = nextKey
      return
    }

    if (previousKey) {
      nextTick(() => {
        if (recentSavingRecordKey.value === previousKey && !props.savingRecordKey) {
          recentSavingRecordKey.value = ''
        }
      })
    }
  },
  { immediate: true },
)

watch(
  () => [currentType.value, sourceRecords.value] as const,
  () => {
    syncDraftRecords(sourceRecords.value)
  },
  { immediate: true, deep: true },
)

watch(
  () => props.preferredExpandedRecordIdentity,
  (nextIdentity) => {
    if (!nextIdentity) {
      return
    }

    focusRecordByIdentity(nextIdentity)
  },
)

watch(
  hasDirtyRecords,
  (nextValue) => {
    emit('dirty-change', nextValue)
  },
  { immediate: true },
)

/**
 * 单一类型板块（现在只剩「过敏」）的字段配置。
 *
 * 病历/检查早已走 visitConfig（见上）；这里的 medical / checkup 两个分支
 * 是 2026-10-01 合并之前留下的，页面不会再传这两个值进来，
 * 保留只为"万一有别的入口传进来也别渲染成空白"。
 */
function getFieldConfig(type: HealthRecordType): FieldConfig {
  if (type === 'medical') {
    return {
      primary: { key: 'chiefComplaint', label: '症状或疾病' },
      date: { key: 'visitDate', label: '发病日期' },
      secondary: { key: 'diagnosis', label: '诊断结果' },
      status: { key: 'status', label: '状态', options: getMedicalStatusOptions() },
      notes: { key: 'notes', label: '补充说明' },
    }
  }

  if (type === 'checkup') {
    return {
      primary: { key: 'checkupType', label: '体检类型', options: getHealthCheckupTypeOptions() },
      date: { key: 'checkupDate', label: '体检日期' },
      secondary: null,
      status: null,
      notes: { key: 'notes', label: '体检说明' },
    }
  }

  return {
    primary: { key: 'allergen', label: '过敏原' },
    date: null,
    secondary: null,
    status: null,
    notes: { key: 'notes', label: '过敏反应/说明' },
  }
}

/**
 * 病历/检查的表单配置：直接用 utils 里那张字段对照表（2026-10-02 精简版）。
 *
 * 这里不再往 FieldConfig 那套通用形状里塞 —— 病历/检查的字段顺序、可见性、
 * 标签全都跟过敏那种单一记录不一样，硬套一层只会绕。
 */
function visitConfig(record: Record<string, any>) {
  return getHealthVisitFieldConfig(resolveHealthVisitKind(record))
}

/** 可选字段在 TS 类型上是 string | null，模板里取 key 时统一在这里收口 */
function visitComplaintKey(record: Record<string, any>) {
  return visitConfig(record).complaintKey || ''
}

function visitLabValuesKey(record: Record<string, any>) {
  return visitConfig(record).labValuesKey || ''
}

function visitMedicationKey(record: Record<string, any>) {
  return visitConfig(record).medicationKey || ''
}

/** 「还有 N 项选填（复查日期、兽医）」——把里面是什么写在按钮上，不藏字段 */
/**
 * 切换类型之后，另一种类型独有的内容还留在草稿里（2026-10-02 老板要求"保留已填内容"）。
 * 这一行把它说出来：家长切到体检时看得见"刚填的症状还在"，不会以为白填了。
 */
function visitCarryOverHint(record: Record<string, any>) {
  if (resolveHealthVisitKind(record) === 'medical') {
    const findings = String(record?.findings || '').trim()
    return findings ? `切回「体检」还能看到刚填的检查结论：${findings}` : ''
  }

  const parts = [
    String(record?.chiefComplaint || '').trim(),
    String(record?.medications || '').trim(),
  ].filter(Boolean)

  return parts.length > 0 ? `切回「就诊」还能看到刚填的：${parts.join('、')}` : ''
}

/** 一键「已经好了」的文案（状态不再进表单，但库里的 status 仍然决定进不进 AI 分析） */
function medicalStatusToggle(record: Record<string, any>) {
  return resolveMedicalStatusToggle(record)
}

function toggleVisitStatus(index: number) {
  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const next = resolveMedicalStatusToggle(record)
  record.status = next.status

  uni.showToast({
    title: next.status === 'RECOVERED'
      ? '已标记「已经好了」，记得点保存'
      : '已改回「还在治疗中」，记得点保存',
    icon: 'none',
  })
}

/** 其它板块（过敏）的字段配置（病历/检查不再走这里） */
function fieldConfigForRecord(_record: Record<string, any>): FieldConfig {
  return getFieldConfig(baseType.value)
}

/**
 * 模板取值器（2026-10-01 自查补）。
 *
 * 为什么需要它们：`date` / `secondary` / `status` / `veterinarian` / `notes`
 * 都是可空字段，而模板里是靠 `v-if="fieldConfigForRecord(record).date"` 先判断、
 * 再访问 `.date.key` —— **模板里这种"先判空再取属性"对函数调用不生效**，
 * 类型检查会一路报"对象可能为空"。给它一个兜底的空字段，
 * 运行时行为完全不变（v-if 为假时这段根本不会渲染）。
 */
const EMPTY_FIELD = { key: '', label: '' }

function dateField(record: Record<string, any>) {
  return fieldConfigForRecord(record).date ?? EMPTY_FIELD
}

function secondaryField(record: Record<string, any>) {
  return fieldConfigForRecord(record).secondary ?? EMPTY_FIELD
}

function statusField(record: Record<string, any>) {
  return fieldConfigForRecord(record).status ?? { ...EMPTY_FIELD, options: [] as HealthCheckupTypeOption[] }
}

function vetField(record: Record<string, any>) {
  return fieldConfigForRecord(record).veterinarian ?? EMPTY_FIELD
}

function notesField(record: Record<string, any>) {
  return fieldConfigForRecord(record).notes ?? EMPTY_FIELD
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function stripLocalFields(record: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(cloneRecord(record)).filter(([key]) => !key.startsWith('__')),
  )
}

function createLocalKey(record: Record<string, any>, index: number) {
  if (typeof record.__localId === 'string' && record.__localId) {
    return record.__localId
  }

  if (typeof record.id === 'string' && record.id) {
    return record.id
  }

  return `${baseType.value}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeDraftRecord(record: Record<string, any>, localId: string) {
  return {
    ...cloneRecord(record),
    __localId: localId,
    attachments: attachmentList(record),
  }
}

function hasMatchingIncomingRecord(
  record: Record<string, any>,
  recordIndex: number,
  incomingRecords: Record<string, any>[],
  usedIncomingIndexes: Set<number>,
) {
  const matchingIndex = incomingRecords.findIndex((incomingRecord, index) =>
    !usedIncomingIndexes.has(index) &&
    doHealthRecordsMatchPersistedPayload(recordKindOf(record), record, incomingRecord),
  )

  if (matchingIndex < 0) {
    return false
  }

  usedIncomingIndexes.add(matchingIndex)
  consumeRecentSavingRecordKey(record, recordIndex)
  return true
}

function preserveUnsavedDrafts(
  incomingRecords: Record<string, any>[],
  nextSnapshots: Record<string, Record<string, any>>,
) {
  const usedIncomingIndexes = new Set<number>()
  const preservedDrafts: Record<string, any>[] = []

  draftRecords.value.forEach((record, index) => {
    const key = recordKey(record, index)
    if (!isRecordDirty(record, index)) {
      return
    }

    if (replaceIncomingRecordWithDirtyDraft(record, index, key, incomingRecords, nextSnapshots)) {
      return
    }

    if (hasMatchingIncomingRecord(record, index, incomingRecords, usedIncomingIndexes)) {
      return
    }

    if (shouldSkipPreservingSavingRecord(record, index)) {
      consumeRecentSavingRecordKey(record, index)
      return
    }

    const snapshot = savedSnapshot(record, index)
    if (snapshot) {
      nextSnapshots[key] = snapshot
    }

    preservedDrafts.push(normalizeDraftRecord(record, key))
  })

  return [...incomingRecords, ...preservedDrafts]
}

function shouldSkipPreservingSavingRecord(record: Record<string, any>, index: number) {
  return recordMatchesSavingKey(record, index, props.savingRecordKey || recentSavingRecordKey.value)
}

function replaceIncomingRecordWithDirtyDraft(
  record: Record<string, any>,
  index: number,
  key: string,
  incomingRecords: Record<string, any>[],
  nextSnapshots: Record<string, Record<string, any>>,
) {
  const incomingIndex = incomingRecords.findIndex((incomingRecord, currentIndex) =>
    recordKey(incomingRecord, currentIndex) === key,
  )

  if (incomingIndex < 0) {
    return false
  }

  if (shouldUseIncomingSavingRecord(record, index, incomingRecords[incomingIndex])) {
    return true
  }

  const snapshot = savedSnapshot(record, index)
  if (snapshot) {
    nextSnapshots[key] = snapshot
  }

  incomingRecords[incomingIndex] = normalizeDraftRecord(record, key)
  return true
}

function shouldUseIncomingSavingRecord(
  record: Record<string, any>,
  index: number,
  incomingRecord: Record<string, any>,
) {
  if (!incomingRecord || !recordMatchesSavingKey(record, index, props.savingRecordKey || recentSavingRecordKey.value)) {
    return false
  }

  consumeRecentSavingRecordKey(record, index)
  return true
}

function consumeRecentSavingRecordKey(record: Record<string, any>, index: number) {
  if (recordMatchesSavingKey(record, index, recentSavingRecordKey.value)) {
    recentSavingRecordKey.value = ''
  }
}

function syncDraftRecords(records: Record<string, any>[]) {
  const nextSnapshots: Record<string, Record<string, any>> = {}
  const nextDraftRecords = records.map((record, index) => {
    const localId = createLocalKey(record, index)
    const draftRecord = normalizeDraftRecord(record, localId)
    nextSnapshots[localId] = stripLocalFields(draftRecord)
    return draftRecord
  })
  const shouldPreserveDrafts = lastSyncedType.value === baseType.value
  const recordsWithPreservedDrafts = shouldPreserveDrafts
    ? preserveUnsavedDrafts(nextDraftRecords, nextSnapshots)
    : nextDraftRecords

  draftRecords.value = recordsWithPreservedDrafts
  savedSnapshots.value = nextSnapshots
  lastSyncedType.value = baseType.value

  if (focusRecordByIdentity(props.preferredExpandedRecordIdentity, recordsWithPreservedDrafts)) {
    return
  }

  const nextKeys = recordsWithPreservedDrafts.map((record, index) => recordKey(record, index))
  expandedRecordKey.value = nextKeys.includes(expandedRecordKey.value || '')
    ? expandedRecordKey.value
    : null
}

function recordKey(record: Record<string, any>, index: number) {
  return record.__localId || record.id || `${baseType.value}-${index}`
}

function findRecordIndexByKey(key: string) {
  return draftRecords.value.findIndex((record, currentIndex) =>
    recordKey(record, currentIndex) === key,
  )
}

function recordAnchorId(record: Record<string, any>, index: number) {
  const safeKey = String(recordKey(record, index)).replace(/[^A-Za-z0-9_-]/g, '-')
  return `health-record-${baseType.value}-${safeKey}`
}

function savedSnapshot(record: Record<string, any>, index: number) {
  return savedSnapshots.value[recordKey(record, index)] || null
}

function isSavedRecord(record: Record<string, any>, index: number) {
  return Boolean(savedSnapshot(record, index))
}

function readField(record: Record<string, any>, key: string) {
  const value = key ? record?.[key] : ''
  return typeof value === 'string' ? value : (value ?? '')
}

function fieldOptionLabels(options?: HealthCheckupTypeOption[] | null) {
  return (options ?? []).map(option => option.label)
}

function fieldOptionIndex(
  record: Record<string, any>,
  options: HealthCheckupTypeOption[] | null | undefined,
  key: string,
) {
  const currentValue = readField(record, key)
  const matchedIndex = (options ?? []).findIndex(option =>
    option.value === currentValue || option.label === currentValue,
  )
  return matchedIndex >= 0 ? matchedIndex : 0
}

function readOptionFieldLabel(
  record: Record<string, any>,
  options: HealthCheckupTypeOption[] | null | undefined,
  key: string,
) {
  const currentValue = readField(record, key)
  const matchedOption = (options ?? []).find(option =>
    option.value === currentValue || option.label === currentValue,
  )
  return matchedOption?.label || formatHealthCheckupTypeLabel(currentValue)
}

function updateOptionField(
  index: number,
  key: string,
  options: HealthCheckupTypeOption[] | null | undefined,
  value: string | number,
) {
  const optionIndex = Number(value)
  const option = Number.isInteger(optionIndex) ? (options ?? [])[optionIndex] : null
  if (!option) {
    return
  }

  updateTextField(index, key, option.value)
}

function attachmentList(record: Record<string, any>) {
  const attachments = record?.attachments
  return Array.isArray(attachments)
    ? attachments
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (item && typeof item === 'object' && typeof item.url === 'string') {
          return item.url.trim()
        }

        return ''
      })
      .filter(Boolean)
    : []
}

function attachmentDisplay(url: string, index: number) {
  return buildHealthAttachmentDisplayMeta(url, index)
}

function scrollToRecord(index: number) {
  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const selector = `#${recordAnchorId(record, index)}`
  nextTick(() => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((node) => {
        if (!node) {
          return
        }

        uni.pageScrollTo({
          selector,
          duration: 240,
        })
      })
      .exec()
  })
}

function focusRecordByIdentity(
  identity: string | null | undefined,
  records: Record<string, any>[] = draftRecords.value,
) {
  const index = findHealthRecordFocusIndex(baseType.value, records, identity)
  if (index < 0) {
    return false
  }

  expandedRecordKey.value = recordKey(records[index], index)
  scrollToRecord(index)
  return true
}

async function requestTypeChange(type: HealthRecordType) {
  if (type === currentType.value) {
    return
  }

  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  if (hasDirtyRecords.value) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '切换分类',
        content: '当前分类有未保存的记录，切换后将放弃这些修改，确认继续吗？',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      })
    })

    if (!confirmed) {
      return
    }
  }

  emit('change-type', type)
}

function updateTextField(index: number, key: string, value: string) {
  if (hasSavingRecord.value) {
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  draftRecords.value[index] = {
    ...record,
    [key]: value,
  }
}

/**
 * 拍照录入（2026-10-01，第六期）。
 *
 * 识别结果**只填表不保存** —— 老板第 5 条说的是"自动的录入表单"，
 * 不是"自动保存"。顾客填完还能改、还能不存。
 */
/** 识别组件：空闲时不挂载（避免留白条），点「从相册选择」时再挂上并触发 */
const scanRef = ref<{ startScan?: () => void } | null>(null)
const scanActive = ref(false)

/**
 * 底部那一个「新增记录」按钮点开后的选择（2026-10-01 老板要求合并入口）。
 *
 * 一次覆盖三条路：
 *   ① 手动填写        → 新增一条空白表单
 *   ② 拍病历          → 相机/相册 → AI 识别 → 确认一次自动填表
 *   ③ 拍体检报告      → 同上，按体检报告的字段识别
 *
 * 为什么把入口收到这里：原来顶部有「拍病历 / 拍体检报告」两个选择器 +
 * 一个「拍照录入」按钮，列表底部还有一个「新增记录」，三处做同一件事。
 */
function openAddRecordChooser() {
  if (hasSavingRecord.value || hasUploadingRecords.value) {
    return
  }

  uni.showActionSheet({
    itemList: ['手动填写', '从相册选择（自动识别检查报告）'],
    success: (res) => {
      if (res.tapIndex === 0) {
        addRecord()
        return
      }

      startScan()
    },
  })
}

/**
 * 打开相册开始识别（识别组件自带按钮已隐藏，由这里触发）。
 *
 * 不再传文档类型：统一传 `AUTO`，由后端判断这是病历还是体检报告，
 * 判定结果随识别结果一起回来（老板 2026-10-01：两个选项合并成一个）。
 */
function startScan() {
  // 先把容器亮出来（识别结果的确认卡片要显示在这块里）
  scanActive.value = true

  // 组件是常驻挂载的，正常情况下这里一步到位。
  // 只有首次渲染还没走完、ref 暂时为空时，才补一次下一 tick 兜底。
  if (scanRef.value) {
    scanRef.value.startScan?.()
    return
  }

  nextTick(() => scanRef.value?.startScan?.())
}

function onScanned(payload: { drafts: Record<string, any>[]; documentType: string }) {
  // 这个入口在「病历/检查」板块下。AI 有时会判成别的资料（过敏报告、疫苗本）——
  // 那些有各自更合适的板块，硬填成病历只会把档案弄乱，所以如实提示并停手。
  if (payload.documentType === 'ALLERGY_REPORT') {
    scanActive.value = false
    uni.showToast({ title: '这看起来是过敏原检测报告，请到「过敏」板块上传', icon: 'none', duration: 3000 })
    return
  }

  if (payload.documentType === 'VACCINE_BOOK') {
    scanActive.value = false
    uni.showToast({ title: '这看起来是疫苗本，请到「疫苗」板块上传', icon: 'none', duration: 3000 })
    return
  }

  // 每条草稿可能自带类型（一次传了化验单 + 门诊病历时，两类各自成条，
  // 见 HealthDocumentScan 里的 __documentType）—— 有就按它走，
  // 否则退回整批的类型。**不能一律用整批类型**：那会把病历的诊断与用药丢掉。
  for (const draft of payload.drafts) {
    const draftType = String(draft?.__documentType || '').toUpperCase()
    const kind: HealthVisitKind = draftType
      ? (draftType === 'CHECKUP_REPORT' ? 'checkup' : 'medical')
      : (payload.documentType === 'CHECKUP_REPORT' ? 'checkup' : 'medical')
    const record = normalizeHealthVisitRecord(kind, draft)
    // 重新给一个本地 key，避免和已有草稿撞
    record.__localId = `visit-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    draftRecords.value.push(record)
  }

  // 内容已经填进表单，识别结果那块可以收掉了（空闲的容器不占高度）
  scanActive.value = false

  const lastIndex = draftRecords.value.length - 1
  if (lastIndex >= 0) {
    expandedRecordKey.value = recordKey(draftRecords.value[lastIndex], lastIndex)
  }
  uni.showToast({
    title: `已填入 ${payload.drafts.length} 条，核对后保存`,
    icon: 'none',
  })
}

function addRecord() {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  // 「病例」模式下新增的记录默认是「就诊」——带狗看病是最常见的场景，
  // 想记体检的人再在表单顶部把类型切过去。
  const nextRecord = isVisitMode.value
    ? createHealthVisitDraft('medical')
    : createHealthRecordDraft(baseType.value)
  draftRecords.value.push(nextRecord)
  expandedRecordKey.value = nextRecord.__localId || null
}

/**
 * 「更多」的展开状态（2026-10-01）。
 *
 * 老板要求"病史只保留一个诊断结果"，所以症状描述、用药、复查日期这些
 * 次要字段一律折叠起来，默认不占位置、也不拦着保存。
 */
/** 还要不要显示「更多」这一栏：有次要字段才有必要 */
/**
 * 切换这条记录的类型（就诊 ↔ 体检）。
 *
 * 2026-10-02 老板两条要求：
 *   ① 切换时**不再弹"内容会清空"的提醒**
 *   ② 切换时**保留已经填好的内容**
 *
 * 做法：不重开草稿，直接把这条草稿的归属标记改成目标类型，字段原地留着 ——
 *   · 两张表共用的（日期、其它想说的、附件、兽医）本来就同名，原样带过去；
 *     日期在两个类型下叫不同字段名（visitDate / checkupDate），这里显式搬一次
 *   · 只在某一张表里存在的（症状 / 检查结论 / 体检类型 / 用药 / 处理），
 *     留在草稿里不显示：**切回去还在**；保存时按记录自己的类型提交，
 *     不属于这张表的字段不会被写进去（见 buildHealthVisitPayload）
 *
 * 已保存的记录不允许切换：换个类型就是换一张表，硬换会在库里留下两条，
 * 这是 2026-10-02 审计时发现的坑（切完卡片变空、刷新后旧记录又冒出来）。
 */
function changeVisitKind(index: number, kind: HealthVisitKind) {
  const record = draftRecords.value[index]
  if (!record || resolveHealthVisitKind(record) === kind) {
    return
  }

  if (isSavedRecord(record, index)) {
    uni.showToast({
      title: '已保存的记录不能改类型，要改请先删掉这条',
      icon: 'none',
      duration: 2500,
    })
    return
  }

  const next: Record<string, any> = {
    ...cloneRecord(record),
    [HEALTH_VISIT_KIND_FIELD]: kind,
  }

  // 日期：两个类型下字段名不同，搬一次，别让家长重选
  const date = resolveHealthVisitDate(record)
  const targetConfig = getHealthVisitFieldConfig(kind)
  if (date) {
    next[targetConfig.dateKey] = date
  }

  // 切到体检时给个默认类型（后端这一栏必填）
  if (kind === 'checkup' && !String(next.checkupType || '').trim()) {
    next.checkupType = HEALTH_VISIT_DEFAULT_CHECKUP_TYPE
  }

  draftRecords.value.splice(index, 1, next)
  // 卡片保持展开，接着填就行
  expandedRecordKey.value = recordKey(next, index)
}

function isRecordExpanded(record: Record<string, any>, index: number) {
  return expandedRecordKey.value === recordKey(record, index)
}

function toggleRecordExpanded(index: number) {
  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  expandedRecordKey.value = expandedRecordKey.value === key ? null : key
}

function recordSummary(record: Record<string, any>, index: number) {
  const summary = isVisitMode.value
    ? buildHealthVisitSummary(resolveHealthVisitKind(record), record)
    : buildHealthRecordSummary(baseType.value, record)
  if (!isSavedRecord(record, index) && summary.title.startsWith('未填写')) {
    return {
      title: '新记录',
      detail: '点击展开后补充本条记录内容',
    }
  }

  return summary
}

function saveButtonText(record: Record<string, any>, index: number) {
  return isSavedRecord(record, index) && !isRecordDirty(record, index)
    ? '已保存'
    : '保存这一条'
}

function saveButtonDisabled(record: Record<string, any>, index: number) {
  return props.loading ||
    hasSavingRecord.value ||
    hasUploadingRecords.value ||
    isUploading(record, index) ||
    isRecordSaving(record, index) ||
    (isSavedRecord(record, index) && !isRecordDirty(record, index))
}

function secondaryActionText(record: Record<string, any>, index: number) {
  return resolveHealthRecordSecondaryActionText(
    isSavedRecord(record, index),
    isRecordDirty(record, index),
  )
}

function recordStatusText(record: Record<string, any>, index: number) {
  if (!isSavedRecord(record, index)) {
    return '未保存'
  }

  return isRecordDirty(record, index) ? '待保存' : '已保存'
}

function isRecordDirty(record: Record<string, any>, index: number) {
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    return true
  }

  return JSON.stringify(stripLocalFields(record)) !== JSON.stringify(snapshot)
}

function isRecordSaving(record: Record<string, any>, index: number) {
  return recordMatchesSavingKey(record, index, props.savingRecordKey)
}

function recordMatchesSavingKey(record: Record<string, any>, index: number, savingKey: string) {
  if (!savingKey) {
    return false
  }

  return [
    recordKey(record, index),
    record.id,
    buildHealthRecordFocusIdentity(recordKindOf(record), record),
  ].some((value) => value === savingKey)
}

/**
 * 保存当前类型下**所有待保存的记录**（供健康管理页的底部按钮调用）。
 *
 * 内嵌模式下逐条的「保存」按钮被隐藏，改由底部那个自适应按钮统一保存 ——
 * 顾客不必在每条记录里找保存键。
 *
 * 逐条保存是顺序执行的：并发写同一个列表会让后写的覆盖先写的。
 */
async function saveAllDirty() {
  if (hasSavingRecord.value || hasUploadingRecords.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  const dirtyIndexes = draftRecords.value
    .map((record, index) => (isRecordDirty(record, index) ? index : -1))
    .filter((index) => index >= 0)

  if (dirtyIndexes.length === 0) {
    uni.showToast({ title: '没有需要保存的内容', icon: 'none' })
    return
  }

  for (const [position, index] of dirtyIndexes.entries()) {
    const submitted = saveRecord(index)

    // 有一条没通过校验（缺必填）就停：已经滚到它跟前了，
    // 顾客补完再点一次保存，剩下的接着存 —— 不能装作全存好了
    if (!submitted) {
      const remaining = dirtyIndexes.length - position - 1
      if (remaining > 0) {
        uni.showToast({
          title: `这条还缺信息，补完再点一次保存（还有 ${remaining} 条待保存）`,
          icon: 'none',
          duration: 3000,
        })
      }
      return
    }

    // 等这条存完再存下一条（顺序执行，避免并发写同一份列表互相覆盖）
    await waitForPendingSave()
  }
}

defineExpose({ saveAllDirty, openAddRecordChooser, startScan })

/**
 * 保存单条记录。
 *
 * 返回值＝"这条是否已经交给父组件去存"（校验没过、或有别的记录正在存 → false）。
 * 真正的接口调用在页面里（`@save-record`），所以这里只负责校验与派发。
 */
function saveRecord(index: number): boolean {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return false
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return false
  }

  const record = draftRecords.value[index]
  if (!record) {
    return false
  }

  const type = recordKindOf(record)
  const validationError = isVisitMode.value
    ? getHealthVisitValidationError(resolveHealthVisitKind(record), record)
    : getHealthRecordValidationError(baseType.value, record)
  if (validationError) {
    // 缺信息时不能只弹一句话就完了（2026-10-02 老板问的"缺信息会不会让顾客接着补"）：
    // 把这条展开、滚到眼前，顾客抬头就看见要补的那个字段。
    // AI 识别填进来的草稿走的也是这条路 —— 识别结果从来不直接入库。
    expandedRecordKey.value = recordKey(record, index)
    scrollToRecord(index)
    uni.showToast({ title: validationError, icon: 'none', duration: 2500 })
    return false
  }

  const key = recordKey(record, index)
  emit('save-record', { type, record: stripLocalFields(record), recordKey: key })
  return true
}

/**
 * 等这一条真的存完（父组件把 savingRecordKey 清掉）再存下一条。
 *
 * 2026-10-02 修：原来批量保存只是 `await saveRecord()`，而 saveRecord 是同步的 ——
 * 第一条刚派发出去、父组件就把 savingRecordKey 置上了，第二轮直接被
 * "记录保存中，请稍候" 挡回来，**两条以上未保存记录只会存下第一条**。
 * 这里改成等空闲再继续；15 秒兜底，免得父组件万一没清 key 把顾客卡住。
 */
function waitForPendingSave(): Promise<void> {
  if (!hasSavingRecord.value) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const stop = watch(hasSavingRecord, (value) => {
      if (!value) {
        stop()
        resolve()
      }
    })

    setTimeout(() => {
      stop()
      resolve()
    }, 15000)
  })
}

function cancelRecord(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    draftRecords.value.splice(index, 1)
    if (expandedRecordKey.value === key) {
      expandedRecordKey.value = null
    }
    return
  }

  draftRecords.value[index] = normalizeDraftRecord(snapshot, key)
  expandedRecordKey.value = null
}

async function removeRecord(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  if (!isSavedRecord(record, index)) {
    draftRecords.value.splice(index, 1)
    if (expandedRecordKey.value === key) {
      expandedRecordKey.value = null
    }
    return
  }

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删除记录',
      content: '删除后将无法恢复，确认继续吗？',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })

  if (!confirmed) {
    return
  }

  emit('delete-record', { type: recordKindOf(record), record: stripLocalFields(record) })
}

function isUploading(record: Record<string, any>, index: number) {
  return Boolean(uploadingKeys.value[recordKey(record, index)])
}

async function chooseAttachment(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  const uploadType = attachmentApiType.value
  const uploadKey = key
  if (uploadingKeys.value[uploadKey]) {
    return
  }

  // 2026-10-02 老板要求：格式与大小提示搬进这个弹窗，表单里不再占一行
  const tapIndex = await new Promise<number | null>((resolve) => {
    uni.showActionSheet({
      itemList: ['上传图片', '上传 PDF'],
      alertText: attachmentHintText,
      success: (res: any) => resolve(res.tapIndex),
      fail: () => resolve(null),
    } as any)
  })

  if (tapIndex == null) {
    return
  }

  const selectedFile = tapIndex === 0 ? await chooseImageFile() : await choosePdfFile()
  if (!selectedFile) {
    return
  }

  const selectionError = resolveHealthAttachmentSelectionError(
    tapIndex === 0 ? 'image' : 'pdf',
    selectedFile.name,
  )
  if (selectionError) {
    uni.showToast({ title: selectionError, icon: 'none' })
    return
  }

  const fileSizeError = resolveHealthAttachmentFileSizeError(selectedFile.size)
  if (fileSizeError) {
    uni.showToast({ title: fileSizeError, icon: 'none' })
    return
  }

  uploadingKeys.value[uploadKey] = true

  try {
    uni.showLoading({ title: '上传中...' })
    const uploaded = await dogApi.uploadHealthAttachment(uploadType, selectedFile.path)
    if (attachmentApiType.value !== uploadType) {
      uni.hideLoading()
      return
    }

    const targetIndex = findRecordIndexByKey(uploadKey)
    if (targetIndex < 0) {
      uni.hideLoading()
      return
    }

    const targetRecord = draftRecords.value[targetIndex]
    const attachments = attachmentList(targetRecord)
    draftRecords.value[targetIndex] = {
      ...targetRecord,
      attachments: [...attachments, uploaded.url],
    }
    uni.hideLoading()
    uni.showToast({ title: '附件已添加，请保存记录', icon: 'none' })
  } catch (error: any) {
    uni.hideLoading()
    uni.showToast({ title: resolveHealthAttachmentUploadErrorMessage(error), icon: 'none' })
  } finally {
    delete uploadingKeys.value[uploadKey]
  }
}

function chooseImageFile() {
  return new Promise<{ path: string, name: string, size: number | null } | null>((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res: any) => {
        const filePath = res.tempFilePaths?.[0]
        if (!filePath) {
          resolve(null)
          return
        }

        const reportedFileSize =
          typeof res.tempFiles?.[0]?.size === 'number' ? res.tempFiles[0].size : null
        const fileSize = reportedFileSize ?? await readHealthAttachmentFileSize(filePath)

        resolve({
          path: filePath,
          name: filePath.split('/').pop() || 'image.jpg',
          size: fileSize,
        })
      },
      fail: () => resolve(null),
    })
  })
}

function choosePdfFile() {
  return new Promise<{ path: string, name: string, size: number | null } | null>((resolve) => {
    uni.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: async (res: any) => {
        const file = res.tempFiles?.[0]
        if (!file?.path) {
          resolve(null)
          return
        }

        const reportedFileSize = typeof file.size === 'number' ? file.size : null
        const fileSize = reportedFileSize ?? await readHealthAttachmentFileSize(file.path)

        resolve({
          path: file.path,
          name: file.name || file.path.split('/').pop() || 'document.pdf',
          size: fileSize,
        })
      },
      fail: () => resolve(null),
    })
  })
}

/**
 * 打开附件。
 *
 * 2026-10-01 第九期：实现搬到 utils/health-records.ts 的 previewHealthAttachment，
 * 疫苗记录的卡片也要用同一份（图片走大图预览、PDF 先下载再交给微信文档查看器）。
 */
async function previewAttachment(url: string) {
  await previewHealthAttachment(url)
}

function removeAttachment(index: number, attachmentIndex: number) {
  if (hasSavingRecord.value) {
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const attachments = attachmentList(record)
  if (attachments.length <= attachmentIndex) {
    return
  }

  const removedUrl = attachments[attachmentIndex]
  const nextAttachments = attachments.filter((_, currentIndex) => currentIndex !== attachmentIndex)
  draftRecords.value[index] = {
    ...record,
    attachments: nextAttachments,
  }

  const savedAttachments = new Set(attachmentList(savedSnapshot(record, index) || {}))
  const removedKey = extractHealthAttachmentKey(removedUrl)
  if (removedKey && !savedAttachments.has(removedUrl)) {
    void dogApi.deleteHealthAttachment(attachmentApiType.value, removedKey).catch(() => {})
  }
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

/* 拍照录入（第六期） */
.scan-entry {
  /* 不留 margin：这个容器只在识别时出现，间距交给板块的 gap */
}

/* 空闲态：组件还挂着（这样 ref 随时可用），但不占任何高度 */
.scan-entry--hidden {
  display: none;
}

.scan-entry__kinds {
  display: flex;
  gap: 12rpx;
  margin-bottom: 14rpx;
}

.scan-entry__kind {
  font-size: 23rpx;
  color: #6b6653;
  background: #f2f5ec;
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
}

.scan-entry__kind--active {
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  font-weight: 600;
}

/* ===== 「病例」合并模式（2026-10-01）===== */

/* 类型切换：就诊 / 体检，两个等宽按钮 */
.kind-switch {
  display: flex;
  gap: 16rpx;
}

.kind-switch__item {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  font-size: 28rpx;
  color: #4a5a4a;
  background: #f2f5ec;
  border: 2rpx solid transparent;
  border-radius: 12rpx;
}

.kind-switch__item--active {
  color: var(--health-accent, #1e3a2f);
  background: var(--health-accent-soft, #eef2e4);
  border-color: var(--health-accent, #1e3a2f);
  font-weight: 600;
}

/* 「更多」折叠开关 */
.more-toggle {
  font-size: 26rpx;
  color: var(--health-accent, #1e3a2f);
  padding: 8rpx 0;
}

/* 「已经好了」一键切换（2026-10-02）：状态不进表单，但好了要能一键标掉 */
.status-switch {
  display: inline-block;
  margin-top: 10rpx;
  padding: 12rpx 22rpx;
  font-size: 26rpx;
  color: var(--health-accent, #1e3a2f);
  background: rgba(15, 107, 67, 0.08);
  border-radius: 999rpx;
}

.more-fields {
  margin-top: 16rpx;
  padding-left: 16rpx;
  border-left: 4rpx solid var(--health-accent-soft, #eef2e4);
}

/* 列表行的类型徽标 */
.record-card__summary-heading {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.record-card__kind-badge {
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #fff;
}

.record-card__kind-badge--medical {
  background: var(--health-accent, #1e3a2f);
}

.record-card__kind-badge--checkup {
  background: #4a7c59;
}




.record-type-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
  padding: 8rpx;
  border-radius: 24rpx;
  background: rgba(32, 52, 63, 0.06);
}

.record-type-tabs__item {
  margin: 0;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #526872;
  background: transparent;
}

.record-type-tabs__item::after,
.record-card__delete::after,
.attachment-item__remove::after,
.record-card__action::after,
.attachment-button::after,

.record-type-tabs__item--active {
  color: #fff;
}

.record-type-tabs__item--active.health-records--medical {
  background: #0f7b49;
}

.record-type-tabs__item--active.health-records--checkup {
  background: #216d9b;
}

.record-type-tabs__item--active.health-records--allergy {
  background: #ad5b2a;
}


.health-records--checkup .health-section__empty {
  background: rgba(33, 109, 155, 0.08);
}

.health-records--allergy .health-section__empty {
  background: rgba(173, 91, 42, 0.08);
}

.record-card {
  /*
   * 这里**不要**写 margin-top（2026-10-01）：
   * 外层 `.health-section` 是 flex + gap: 24rpx，卡片再自带 24rpx 上边距，
   * 两者叠加就在书签下方多出一条 48rpx 的空白（老板截图指出）。
   * 间距统一交给 gap。
   */
  padding: 24rpx;
  border-radius: 24rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(15, 107, 67, 0.08);
}

.health-records--checkup .record-card {
  background: #f7fbfd;
  border-color: rgba(33, 109, 155, 0.1);
}

.health-records--allergy .record-card {
  background: #fffaf6;
  border-color: rgba(173, 91, 42, 0.1);
}

.record-card--dirty {
  border-color: rgba(15, 107, 67, 0.22);
  box-shadow: inset 0 0 0 1rpx rgba(15, 107, 67, 0.05);
}

.record-card__header,
.field-label--row,
.record-card__actions,
.attachment-item {
  display: flex;
}

.field-label--row,
.record-card__actions,
.attachment-item {
  justify-content: space-between;
}

.record-card__header {
  align-items: flex-start;
  gap: 18rpx;
}

.record-card__header-main {
  flex: 1;
  min-width: 0;
}

.record-card__header-actions,
.record-card__meta {
  display: flex;
  align-items: center;
}

.record-card__header-actions {
  flex-shrink: 0;
  gap: 12rpx;
  flex-direction: column;
  align-items: flex-end;
}

.record-card__meta {
  gap: 12rpx;
}

.record-card__summary {
  margin-top: 14rpx;
}

.record-card__summary-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #17313f;
  /* 标题现在可能是一段检查结论，最多两行，别把卡片撑成一大块 */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.record-card__summary-detail {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6d808a;
}

.record-card__attachments-preview {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 12rpx;
}

.record-card__attachment-preview {
  min-width: 0;
  padding: 10rpx 12rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  background: rgba(15, 107, 67, 0.07);
}

.health-records--checkup .record-card__attachment-preview {
  background: rgba(33, 109, 155, 0.08);
}

.health-records--allergy .record-card__attachment-preview {
  background: rgba(173, 91, 42, 0.08);
}

.record-card__attachment-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22rpx;
  font-weight: 600;
  color: #265060;
}

.record-card__attachment-action {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 700;
  color: #0f7b49;
}

.health-records--checkup .record-card__attachment-action {
  color: #216d9b;
}

.health-records--allergy .record-card__attachment-action {
  color: #ad5b2a;
}

.record-card__attachment-more {
  display: block;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6d808a;
}

.record-card__toggle {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #5d767f;
  background: rgba(76, 100, 109, 0.08);
}

.record-card__index {
  width: 40rpx;
  height: 40rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  font-weight: 700;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
}

.health-records--checkup .record-card__index {
  color: #216d9b;
  background: rgba(33, 109, 155, 0.12);
}

.health-records--allergy .record-card__index {
  color: #ad5b2a;
  background: rgba(173, 91, 42, 0.12);
}

.record-card__status {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #a66d1d;
  background: rgba(224, 162, 63, 0.12);
}

.record-card__status--saved {
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.record-card__status--dirty {
  color: #a66d1d;
  background: rgba(224, 162, 63, 0.12);
}

.record-card__delete,
.attachment-item__remove,
.record-card__action,
.attachment-button,

.record-card__delete,
.attachment-item__remove {
  padding: 0 18rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  color: #a63f3f;
  background: rgba(218, 82, 82, 0.08);
}

.field-group {
  margin-top: 18rpx;
}

.record-card__body {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(15, 107, 67, 0.08);
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415a65;
}

.field-label__hint {
  display: block;
  max-width: 420rpx;
  text-align: right;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.6;
  color: #6c7d86;
}

.field-input,
.field-picker,
/* 化验数据那栏要更高：一行一项，十几项起步 */
.field-textarea--tall {
  min-height: 320rpx;
}

.field-textarea {
  display: block;
  margin-top: 10rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  color: #17313f;
  background: #fff;
  border: 1rpx solid rgba(28, 48, 59, 0.08);
}

.field-input {
  height: 92rpx;
  line-height: 92rpx;
  padding: 0 24rpx;
}

.field-picker {
  min-height: 92rpx;
  display: flex;
  align-items: center;
  padding: 18rpx 24rpx;
  line-height: 1.6;
  color: #4e6771;
}

.field-textarea {
  min-height: 180rpx;
  padding: 20rpx 24rpx;
  line-height: 1.7;
}

.attachment-list {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.attachment-item {
  gap: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: rgba(15, 107, 67, 0.06);
}

.health-records--checkup .attachment-item {
  background: rgba(33, 109, 155, 0.07);
}

.health-records--allergy .attachment-item {
  background: rgba(173, 91, 42, 0.07);
}

.attachment-item__preview {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.attachment-item__content {
  min-width: 0;
  flex: 1;
}

.attachment-item__title,
.attachment-item__hint {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-item__title {
  font-size: 25rpx;
  font-weight: 700;
  color: #17313f;
}

.attachment-item__hint {
  margin-top: 4rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #6d808a;
}

.attachment-item__action {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
}

.health-records--checkup .attachment-item__action {
  color: #216d9b;
  background: rgba(33, 109, 155, 0.12);
}

.health-records--allergy .attachment-item__action {
  color: #ad5b2a;
  background: rgba(173, 91, 42, 0.12);
}

.attachment-button {
  margin-top: 14rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.record-card__actions {
  gap: 18rpx;
  margin-top: 24rpx;
}

.record-card__action {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 22rpx;
  font-size: 26rpx;
  font-weight: 700;
}

.record-card__action--ghost {
  color: #4c646d;
  background: rgba(76, 100, 109, 0.1);
}

.record-card__action--primary {
  color: #fff;
  background: linear-gradient(135deg, #15aa67 0%, #0f7b49 100%);
}

.health-records--checkup .record-card__action--primary {
  background: linear-gradient(135deg, #2a87bd 0%, #216d9b 100%);
}

.health-records--allergy .record-card__action--primary {
  background: linear-gradient(135deg, #c87439 0%, #ad5b2a 100%);
}

.record-card__action--primary-only {
  width: 100%;
}

.record-card__action--disabled {
  color: #7c9188;
  background: rgba(15, 107, 67, 0.12);
}


.health-records--checkup .health-section__action,
.health-records--checkup .attachment-button {
  color: #216d9b;
  background: rgba(33, 109, 155, 0.1);
}

.health-records--allergy .health-section__action,
.health-records--allergy .attachment-button {
  color: #ad5b2a;
  background: rgba(173, 91, 42, 0.1);
}
</style>
