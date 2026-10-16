<template>
  <!-- ══ 唯一录入器（需求 R6 / 原型 D、H 屏）════════════════════════════════
       三个入口共用它：底部的「记一条」、计划里/下一针里的「记录这一针」、
       拍疫苗本识别后的补录。

       ⚠️ 必填只有两个：**名称 + 日期**。品牌、批号、备注都不问
          （需求 R12：AI 识别只要这两个信息；录入同理）。
       ⚠️ 名称认不出时**不硬存**（需求 R6）：引导家长勾"含哪些疫苗"，
          由后端按病种推类别；确实不知道就不保存并说明原因。
       ⚠️ 两个模式共用一个录入器：疫苗记录 / 抗体检测（日期 + 项目 + 结果）。 -->
  <view v-if="visible" class="vk-editor">
    <view class="vk-editor__card">
      <view class="vk-editor__head">
        <text class="vk-editor__title">{{ isRecordMode ? (heading || title) : title }}</text>
        <text class="vk-editor__close" @tap="onCancel">关闭</text>
      </view>


      <!-- ① 疫苗记录：名称 + 日期 -->
      <template v-if="isRecordMode">
        <view class="vk-editor__block">
          <text class="vk-editor__label">打了什么疫苗</text>
          <view class="vk-editor__field">
            <input
              class="vk-editor__input"
              :value="name"
              placeholder="写「六联」「狂犬」这样的叫法就行"
              placeholder-class="vk-editor__ph"
              @input="onNameInput"
            />
            <text class="vk-editor__pick" @tap="togglePicker">从产品库选</text>
          </view>
          <text v-if="productHint" class="vk-editor__hint">含 {{ productHint }}</text>

          <!-- 产品库（点「从产品库选」展开；只列对外字段，匹配与归类在后端） -->
          <view v-if="pickerOpen" class="vk-editor__picker">
            <input
              class="vk-editor__search"
              :value="keyword"
              placeholder="搜产品名"
              placeholder-class="vk-editor__ph"
              @input="onKeywordInput"
            />
            <scroll-view class="vk-editor__list" scroll-y>
              <view
                v-for="product in productList"
                :key="product.name"
                class="vk-editor__option"
                @tap="pickProduct(product.name)"
              >
                <text class="vk-editor__option-name">{{ product.name }}</text>
                <text class="vk-editor__option-sub">{{ productComponentsText(product) }}</text>
              </view>
              <text v-if="productList.length === 0" class="vk-editor__empty">产品库里没搜到，直接手写名字也行</text>
            </scroll-view>
          </view>

          <!-- 归不了类 → 勾"含哪些疫苗"（顾客看到的是病种，不是内部类别） -->
          <view v-if="showComponents" class="vk-editor__components">
            <text class="vk-editor__label">含哪些疫苗</text>
            <text class="vk-editor__hint">这个名字看不出含什么疫苗。勾一下它含哪些；确实不知道就问一下医生。</text>
            <view class="vk-editor__chips">
              <text
                v-for="option in componentChoices"
                :key="option.value"
                class="vk-editor__chip"
                :class="{ 'vk-editor__chip--on': components.indexOf(option.value) >= 0 }"
                @tap="toggleComponent(option.value)"
              >{{ option.label }}</text>
            </view>
          </view>
        </view>

        <view class="vk-editor__block">
          <text class="vk-editor__label">什么时候打的</text>
          <picker mode="date" :value="date" :end="maxDate" @change="onDateChange">
            <view class="vk-editor__field">
              <text :class="{ 'vk-editor__date--empty': !date }">{{ date || '点这里选日期' }}</text>
            </view>
          </picker>
        </view>
      </template>

      <!-- ② 抗体检测：日期 + 项目 + 结果 -->
      <template v-else>
        <!-- 这一份是**照报告识别填的** → 说一句"请核对"。
             抗体报告没有像疫苗本那样的独立确认页（一份报告只有一条记录，
             逐条确认那一页是给"一张本子读出多条"用的）；确认就落在这一张卡上，
             所以这句提示必须在这儿。 -->
        <text v-if="preset" class="vk-editor__hint vk-editor__hint--block">
          下面这些是照报告填好的，请核对一下；哪里不对直接改。
        </text>
        <view class="vk-editor__block">
          <text class="vk-editor__label">什么时候检的</text>
          <picker mode="date" :value="date" :end="maxDate" @change="onDateChange">
            <view class="vk-editor__field">
              <text :class="{ 'vk-editor__date--empty': !date }">{{ date || '点这里选日期' }}</text>
            </view>
          </picker>
        </view>

        <view class="vk-editor__block">
          <text class="vk-editor__label">检了什么</text>
          <view class="vk-editor__chips">
            <text
              v-for="option in targetOptions"
              :key="option.value"
              class="vk-editor__chip"
              :class="{ 'vk-editor__chip--on': target === option.value }"
              @tap="pickTarget(option.value)"
            >{{ option.label }}</text>
          </view>
        </view>

        <view class="vk-editor__block">
          <text class="vk-editor__label">数值（选填）</text>
          <view class="vk-editor__field">
            <input
              class="vk-editor__input"
              :value="valueText"
              placeholder="报告上写的数值，例：1:80"
              placeholder-class="vk-editor__ph"
              @input="onValueInput"
            />
          </view>
          <view class="vk-editor__field vk-editor__field--tight">
            <input
              class="vk-editor__input"
              :value="unitText"
              placeholder="单位，例：滴度 / IU/ml"
              placeholder-class="vk-editor__ph"
              @input="onUnitInput"
            />
          </view>
        </view>

        <view class="vk-editor__block">
          <text class="vk-editor__label">报告照片</text>
          <view class="vk-editor__field" @tap="pickReportPhoto">
            <text :class="{ 'vk-editor__date--empty': reportPhotos.length === 0 }">
              {{ reportPhotos.length > 0 ? `已上传 ${reportPhotos.length} 张，点一下看` : '点这里上传（选填）' }}
            </text>
          </view>
          <text v-if="uploadingPhoto" class="vk-editor__hint">正在上传…</text>
        </view>

        <view class="vk-editor__block">
          <text class="vk-editor__label">报告结果</text>
          <view class="vk-editor__options">
            <view
              v-for="option in resultOptions"
              :key="option.value"
              class="vk-editor__option-row"
              @tap="pickResult(option.value)"
            >
              <view class="vk-editor__radio" :class="{ 'vk-editor__radio--on': result === option.value }" />
              <text class="vk-editor__option-name">{{ option.label }}</text>
            </view>
          </view>
          <text v-if="antibodyHint" class="vk-editor__hint">{{ antibodyHint }}</text>
        </view>
      </template>

      <text v-if="errorText" class="vk-editor__error">{{ errorText }}</text>

      <view class="vk-editor__acts">
        <text v-if="canRemove" class="vk-editor__btn vk-editor__btn--danger" @tap="onRemove">删除</text>
        <text class="vk-editor__btn vk-editor__btn--ghost" @tap="onCancel">取消</text>
        <text
          class="vk-editor__btn vk-editor__btn--primary"
          :class="{ 'vk-editor__btn--disabled': saving }"
          @tap="onSave"
        >{{ saving ? '保存中…' : '保存' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  AntibodyResult,
  AntibodyTarget,
  AntibodyTest,
  AntibodyTestPayload,
  VaccineCatalogProduct,
  VaccineRecord,
  VaccineRecordPayload,
} from '../../domain/vaccine/types'
import {
  ANTIBODY_RESULT_OPTIONS,
  ANTIBODY_TARGET_OPTIONS,
  componentLabelOf,
  componentOptionsOf,
  filterCatalogProducts,
  findCatalogProduct,
  productComponentLabels,
  type VaccineComponentOption,
} from '../../domain/vaccine/catalog'
import { todayDateText } from '../../utils/date'
import { uploadHealthImage } from '../../utils/api'

const props = withDefaults(defineProps<{
  visible: boolean
  /**
   * 卡片标题。两种入口两个标题（原型 D 是"记一条接种记录"、H 是"记录这一针"）：
   * 从下面「记一条」进来是**新建一条记录**；从计划/下一针的「记录这一针」进来是
   * **补上刚打的这一针**，说的是同一件事的两面。
   */
  heading?: string
  /** `record` = 疫苗记录（名称 + 日期）；`antibody` = 抗体检测（日期 + 项目 + 结果） */
  mode?: 'record' | 'antibody'
  /** 编辑既有接种记录时传进来（新增传 null） */
  record?: VaccineRecord | null
  /** 编辑既有抗体检测时传进来 */
  test?: AntibodyTest | null
  /** 产品库（接口下发的对外字段） */
  products?: VaccineCatalogProduct[]
  /** 病种词表（接口下发优先，兜底在 domain 里） */
  componentOptions?: VaccineComponentOption[]
  /** 新增时预填的病种（从计划某一步点进来时带上） */
  presetComponents?: string[]
  /**
   * 新增时的预填名称。
   *
   * 「记录这一针」从计划某一步进来时会带上那一步的**常见产品第一支**
   * （原型 H：点进来时名字已经填好，家长不用判断"该记在核心那边还是钩端那边"）。
   */
  presetName?: string
  /** 预填日期（"补全这一条"时把识别到的日期带过来；空 = 用今天） */
  presetDate?: string
  /**
   * 抗体检测的**预填**（AI 识别报告之后铺进来的那一份）—— 家长照样能逐项改。
   * 传 null 就是空白卡（手填）。
   */
  preset?: {
    testedAt: string
    target: 'CORE' | 'RABIES'
    result: 'PASS' | 'FAIL' | 'UNKNOWN'
    value: string
    unit: string
    attachments: string[]
  } | null
  /** 正在保存 */
  saving?: boolean
}>(), {
  mode: 'record',
  record: null,
  test: null,
  products: () => [],
  componentOptions: () => [],
  presetComponents: () => [],
  presetName: '',
  presetDate: '',
  preset: null,
  saving: false,
})

const emit = defineEmits<{
  (event: 'save-record', payload: VaccineRecordPayload, recordId: string): void
  (event: 'save-test', payload: AntibodyTestPayload, testId: string): void
  (event: 'remove', id: string): void
  (event: 'cancel'): void
}>()

const name = ref('')
const date = ref('')
const components = ref<string[]>([])
const notes = ref('')
const pickerOpen = ref(false)
const keyword = ref('')
const errorText = ref('')
/**
 * 「检了什么」**单选**（老板 2026-10-16："检查项目为什么可以多选呢？"）。
 *
 * 一次抗体检测对应**一份报告**，报告上写的是哪一项就是哪一项：
 * 核心三项与狂犬是两张不同的报告（送检项目不同、出报告的机构也可能不同）。
 * 多选还会让计划那边说不清 —— 只有核心那一项会影响接种安排。
 */
const target = ref<AntibodyTarget>('CORE')
const result = ref<AntibodyResult>('PASS')

const isRecordMode = computed(() => props.mode !== 'antibody')
const title = computed(() => {
  if (!isRecordMode.value) return props.test ? '改这次抗体检测' : '记一次抗体检测'
  if (props.record) return '改一条接种记录'
  return '记一条接种记录'
})
/** 日期上限 = 今天：打过的针不可能发生在未来（需求 R13） */
const maxDate = computed(() => todayDateText())

const canRemove = computed(() => Boolean(props.record?.id || props.test?.id))


const componentChoices = computed(() => componentOptionsOf(props.componentOptions))
const targetOptions = computed(() => ANTIBODY_TARGET_OPTIONS)
const resultOptions = computed(() => ANTIBODY_RESULT_OPTIONS)

/** 目录里查到这支苗 → 把这支苗含的病种写出来（原型 D 屏那行小字） */
const productHint = computed(() => {
  const labels = productComponentLabels(props.products || [], name.value, props.componentOptions)
  return labels.join('、')
})

const productList = computed(() => filterCatalogProducts(props.products || [], keyword.value))

/**
 * 名字认不出、也没勾病种 → 请家长勾"含哪些疫苗"。
 *
 * 判据：名字非空 + 目录里查不到。**不猜**（猜错会让整份计划偏掉）。
 */
const showComponents = computed(() => {
  const text = name.value.trim()
  if (!text) return false
  return !findCatalogProduct(props.products || [], text)
})

/** 报告照片（选填）：抗体检测记录和疫苗本一样要能留原件（需求 R9） */
const valueText = ref('')
const unitText = ref('')
const reportPhotos = ref<string[]>([])
const uploadingPhoto = ref(false)

function onValueInput(event: any) {
  valueText.value = String(event?.detail?.value || '')
}

function onUnitInput(event: any) {
  unitText.value = String(event?.detail?.value || '')
}

async function pickReportPhoto() {
  if (reportPhotos.value.length > 0) {
    uni.previewImage({ urls: reportPhotos.value })
    return
  }
  if (uploadingPhoto.value) return
  try {
    const picked = await new Promise<string[]>((resolve, reject) => {
      uni.chooseMedia({
        count: 3,
        mediaType: ['image'],
        sourceType: ['album'],
        success: (res: any) =>
          resolve((res?.tempFiles || []).map((item: any) => String(item.tempFilePath))),
        fail: (error: any) => reject(error),
      })
    })
    if (picked.length === 0) return
    uploadingPhoto.value = true
    const urls: string[] = []
    for (const filePath of picked) {
      const uploaded = await uploadHealthImage(filePath)
      if (uploaded?.url) urls.push(uploaded.url)
    }
    reportPhotos.value = [...reportPhotos.value, ...urls]
  } catch (error: any) {
    // 家长取消选图不算错，不弹提示
    if (error?.errMsg && String(error.errMsg).indexOf('cancel') >= 0) return
    uni.showToast({ title: '照片没传上，再试一次', icon: 'none' })
  } finally {
    uploadingPhoto.value = false
  }
}

const antibodyHint = computed(() => {
  if (target.value === 'CORE') {
    return '核心疫苗合格时，这一针改由抗体检测替代（结果以兽医判读为准）。20 周龄之前、或打完上一针不满 4 周的报告，先不作数。'
  }
  if (target.value === 'RABIES') {
    return '狂犬的抗体检测只作记录（出行 / 出入境常用），不影响接种安排。'
  }
  return ''
})

/** 每次打开都按传进来的记录重铺一遍（切换编辑对象时不能留上一条的残留） */
watch(
  () =>
    [
      props.visible,
      props.record,
      props.test,
      props.mode,
      props.presetName,
      props.presetDate,
      props.preset,
    ] as const,
  () => {
    if (!props.visible) return
    errorText.value = ''
    pickerOpen.value = false
    keyword.value = ''
    if (props.mode === 'antibody') {
      const test = props.test
      const preset = props.preset
      date.value =
        String(test?.testedAt || '').slice(0, 10) ||
        String(preset?.testedAt || '').slice(0, 10) ||
        todayDateText()
      reportPhotos.value =
        test && Array.isArray(test.attachments)
          ? test.attachments.map(String)
          : (preset?.attachments || []).map(String)
      valueText.value = String(test?.value || preset?.value || '')
      unitText.value = String(test?.unit || preset?.unit || '')
      target.value =
        test && Array.isArray(test.targets) && test.targets.length > 0
          ? test.targets[0]
          : (preset?.target || 'CORE')
      result.value = test && test.result ? test.result : (preset?.result || 'PASS')
      result.value = (test?.result || 'PASS') as AntibodyResult
      return
    }
    const record = props.record
    name.value = String(record?.vaccineName || props.presetName || '')
    date.value =
      String(record?.vaccinationDate || '').slice(0, 10) ||
      String(props.presetDate || '').slice(0, 10) ||
      todayDateText()
    components.value = record && Array.isArray(record.components)
      ? [...record.components]
      : [...(props.presetComponents || [])]
    notes.value = String(record?.notes || '')
  },
  { immediate: true },
)

function onNameInput(event: any) {
  name.value = String(event?.detail?.value || '')
  errorText.value = ''
}

function onKeywordInput(event: any) {
  keyword.value = String(event?.detail?.value || '')
}

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

function pickProduct(productName: string) {
  name.value = productName
  pickerOpen.value = false
  keyword.value = ''
  errorText.value = ''
}

function productComponentsText(product: VaccineCatalogProduct): string {
  const labels = (product.components || []).map((item) => componentLabelOf(props.componentOptions, item))
  return labels.length > 0 ? `含 ${labels.join('、')}` : ''
}

function toggleComponent(value: string) {
  const list = [...components.value]
  const at = list.indexOf(value)
  if (at >= 0) list.splice(at, 1)
  else list.push(value)
  components.value = list
  errorText.value = ''
}

function onDateChange(event: any) {
  date.value = String(event?.detail?.value || '')
  errorText.value = ''
}

function pickTarget(value: AntibodyTarget) {
  target.value = value
  errorText.value = ''
}

function pickResult(value: AntibodyResult) {
  result.value = value
  errorText.value = ''
}

/** 日期不能填未来（需求 R13） */
function futureDate(dateText: string): boolean {
  return dateText > todayDateText()
}

function onSave() {
  if (props.saving) return
  if (!date.value) {
    errorText.value = isRecordMode.value ? '选一下接种日期' : '选一下检测日期'
    return
  }
  if (futureDate(date.value)) {
    errorText.value = '日期不能填将来的日子'
    return
  }

  if (!isRecordMode.value) {
    const payload: AntibodyTestPayload = {
      testedAt: date.value,
      targets: [target.value],
      result: result.value,
      ...(valueText.value.trim() ? { value: valueText.value.trim() } : {}),
      ...(unitText.value.trim() ? { unit: unitText.value.trim() } : {}),
      ...(reportPhotos.value.length > 0 ? { attachments: [...reportPhotos.value] } : {}),
    }
    emit('save-test', payload, String(props.test?.id || ''))
    return
  }

  const trimmed = name.value.trim()
  if (!trimmed) {
    errorText.value = '写一下打了什么疫苗，比如"六联"'
    return
  }
  /*
   * 认不出、又没勾病种 → **不硬存**（需求 R6）。
   * 如实告诉他这条没法算进计划，并给两条出路：勾病种，或者问医生。
   */
  if (showComponents.value && components.value.length === 0) {
    errorText.value = '这个名字看不出含什么疫苗，先勾一下它含哪些；确实不知道就问一下医生。'
    return
  }

  const payload: VaccineRecordPayload = {
    vaccineName: trimmed,
    vaccinationDate: date.value,
  }
  if (components.value.length > 0) payload.components = [...components.value]
  if (notes.value) payload.notes = notes.value
  // 手工录入 = 家长自己认过的名字（待核对只针对识别出来的那几条）
  payload.productVerified = true
  emit('save-record', payload, String(props.record?.id || ''))
}

function onRemove() {
  const id = String(props.record?.id || props.test?.id || '')
  if (!id) return
  emit('remove', id)
}

function onCancel() {
  emit('cancel')
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-editor {
  background: $vk-card-bg;
  border: 1px solid $vk-card-border;
  border-radius: $vk-card-radius;
  padding: 24rpx;
}

.vk-editor__head {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.vk-editor__title {
  font-size: 30rpx;
  font-weight: 700;
  color: $vk-text-strong;
}

.vk-editor__close {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-editor__types {
  display: flex;
  gap: 10rpx;
  margin-bottom: 18rpx;
}

.vk-editor__type {
  flex: 1;
  text-align: center;
  line-height: 64rpx;
  border-radius: 18rpx;
  background: $vk-ghost-bg;
  color: $vk-text-muted;
  font-size: $vk-font-body;
}

.vk-editor__type--on {
  background: $vk-due-bg;
  color: $vk-brand;
  font-weight: 600;
}

.vk-editor__block {
  margin-bottom: 22rpx;
}

.vk-editor__label {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
  margin-bottom: 10rpx;
}

.vk-editor__field {
  border: 1px solid $vk-field-border;
  border-radius: 18rpx;
  padding: 18rpx;
  font-size: 26rpx;
  color: $vk-text;
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: $vk-card-bg;
  box-sizing: border-box;
}

.vk-editor__input {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: $vk-text;
}

.vk-editor__ph {
  color: $vk-placeholder;
}

.vk-editor__pick {
  font-size: $vk-font-sub;
  color: $vk-brand;
  font-weight: 600;
}

.vk-editor__date--empty {
  color: $vk-placeholder;
}

.vk-editor__hint--block {
  display: block;
  margin-bottom: 14rpx;
  color: $vk-text-body;
}

.vk-editor__hint {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-text-muted;
  line-height: 1.55;
  margin-top: 10rpx;
}

.vk-editor__picker {
  margin-top: 12rpx;
  border: 1px solid $vk-card-border;
  border-radius: 18rpx;
  padding: 12rpx;
}

.vk-editor__search {
  border-bottom: 1px solid $vk-line;
  padding: 10rpx 6rpx;
  font-size: 25rpx;
  color: $vk-text;
}

.vk-editor__list {
  max-height: 360rpx;
}

.vk-editor__option {
  padding: 14rpx 6rpx;
  border-bottom: 1px solid $vk-line;
}

.vk-editor__option-name {
  font-size: 25rpx;
  color: $vk-text;
}

.vk-editor__option-sub {
  display: block;
  font-size: 21rpx;
  color: $vk-text-faint;
  margin-top: 4rpx;
}

.vk-editor__empty {
  display: block;
  padding: 20rpx 6rpx;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-editor__components {
  margin-top: 18rpx;
}

.vk-editor__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 10rpx;
}

.vk-editor__chip {
  padding: 10rpx 20rpx;
  border-radius: $vk-chip-radius;
  border: 1px solid $vk-field-border;
  font-size: $vk-font-sub;
  color: $vk-text-muted;
}

.vk-editor__chip--on {
  border-color: $vk-brand;
  background: $vk-must-bg;
  color: $vk-must-fg;
  font-weight: 600;
}

.vk-editor__options {
  margin-top: 6rpx;
}

.vk-editor__option-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 0;
  border-top: 1px solid $vk-line;
}

.vk-editor__radio {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  border: 3rpx solid $vk-radio-border;
  flex: 0 0 32rpx;
  box-sizing: border-box;
}

.vk-editor__radio--on {
  border-color: $vk-brand;
  background: $vk-brand;
  box-shadow: inset 0 0 0 7rpx $vk-card-bg;
}

.vk-editor__error {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-danger;
  line-height: 1.55;
  margin-bottom: 12rpx;
}

.vk-editor__acts {
  display: flex;
  gap: 16rpx;
}

.vk-editor__btn {
  flex: 1;
  text-align: center;
  line-height: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  font-weight: 600;
}

.vk-editor__btn--ghost {
  background: $vk-ghost-bg;
  color: $vk-ghost-fg;
}

.vk-editor__btn--primary {
  background: $vk-brand;
  color: $vk-white;
}

.vk-editor__btn--danger {
  flex: 0 0 160rpx;
  background: $vk-over-bg;
  color: $vk-over-fg;
}

.vk-editor__btn--disabled {
  opacity: 0.6;
}
</style>
