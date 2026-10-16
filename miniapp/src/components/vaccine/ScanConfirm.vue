<template>
  <!-- 识别结果 · 逐条核对（需求 R12 / 原型 E 屏）。
       ⚠️ 只有**两列**：名称 + 日期。品牌、批号、下次到期日一律不要。
       ⚠️ "待核对"的行也会先记下来（后端按 productVerified=false 处理，先不排进免疫计划），
          并给一个能走出去的动作：「我已对照疫苗本核对」。
       ⚠️ 名称或日期缺一个的那几条**不保存、也不从页面上消失**（2026-10-16 自检 V4）：
          家长补完还能再点一次「核对好了，保存」。 -->
  <view v-if="rows.length > 0" class="vk-scan">
    <view class="vk-scan__head">
      <text class="vk-scan__title">识别结果</text>
      <text class="vk-scan__count">{{ rows.length }} 条</text>
    </view>
    <!-- 条数只在上面那一处说（2026-10-16 自检 V21：原来"3 条"和"读出 3 条"紧挨着说两遍） -->
    <text class="vk-scan__hint">请逐条核对。点任意一条可以改名称、日期，或者删掉。</text>
    <!-- "哪几条需要核对、为什么"要说在明面上（老板 2026-10-16 问的正是这个）——
         判据在 domain/vaccine/catalog.ts 的 scanRowReview，这里只是把同一套话讲给家长。 -->
    <!-- 2026-10-16 自检 V9/V20：只说该做什么（不再解释"记下来但暂时不参与提醒"这类系统话）；
         而且狂犬不是"没把握"、是"必须核"，单拎一句说。 -->
    <text v-if="hasCareRow" class="vk-scan__hint">带「待核对」的几条，请对着疫苗本核一下：名字没读出来、名字不在常见疫苗里、日期看着可疑的，是我们没十足把握的。狂犬这一针不是没把握，是必须核 —— 不管读得多准，都请对着疫苗本看一眼。</text>

    <view
      v-for="(row, index) in rows"
      :key="row.key"
      class="vk-scan__row"
      :class="{
        'vk-scan__row--care': isCare(row),
        'vk-scan__row--error': row.error,
      }"
    >
      <view class="vk-scan__line">
        <!-- ⚠️ 2026-10-16 老板："名字可以修改是可以修改，但用户可能并不知道
             当前 UI 下名字是可以修改的。" —— 原来它是个**没有边框的输入框**，
             看着和静态文字一模一样。现在按录入卡的写法给它一个框（有框 = 能改）。
             后来又按老板要求去掉了右侧那个「改」字：有框本身就够了，不必再说一遍。 -->
        <view class="vk-scan__field">
          <input
            class="vk-scan__name"
            :value="row.name"
            placeholder="疫苗名称"
            placeholder-class="vk-scan__ph"
            @input="onNameInput(index, $event)"
          />
        </view>
        <text v-if="isCare(row)" class="vk-scan__badge">待核对</text>
        <text class="vk-scan__del" @tap="onRemoveRow(index)">删掉</text>
      </view>

      <picker mode="date" :value="row.date" @change="onDateChange(index, $event)">
        <view class="vk-scan__field vk-scan__field--date">
          <!-- 显示成 `2026/11/20`，跟记录区、免疫计划一个写法（2026-10-16 自检 V30；
               交给 picker 的 `row.date` 仍然是 `2026-11-20`，只是显示换一种） -->
          <text
            class="vk-scan__date"
            :class="{ 'vk-scan__date--empty': !row.date }"
          >{{ formatFullDate(row.date) || '点这里选日期' }}</text>
        </view>
      </picker>

      <template v-if="isCare(row)">
        <text class="vk-scan__why">{{ row.reason }}</text>
        <view class="vk-scan__acts">
          <text class="vk-scan__act" @tap="verifyRow(index)">我已对照疫苗本核对</text>
        </view>
      </template>

      <!-- 这一条没存上：**错误就挂在这一行上**（老板 2026-10-16：
           一次识别多条时，只弹一句 toast，家长根本不知道是哪一条）。
           给两件事：说清原因 + 一条能走出去的路（去补全 / 删掉）。 -->
      <view v-if="row.error" class="vk-scan__error">
        <text class="vk-scan__error-text">{{ row.error }}</text>
        <view class="vk-scan__acts">
          <text class="vk-scan__act vk-scan__act--fix" @tap="onFixRow(index)">去补全这一条</text>
        </view>
      </view>
    </view>

    <!-- 识别漏掉的那条，家长可以在这一页直接补上（老板 2026-10-16 问）——
         走的是**同一个录入器**：那里有产品库、有"含哪些疫苗"可勾，
         比在这一页硬填一个名字更不容易卡住。 -->
    <view class="vk-scan__add" @tap="onAddManual">
      <text class="vk-scan__add-text">＋ 补一条（识别漏掉的）</text>
    </view>

    <view class="vk-scan__footer">
      <text class="vk-scan__btn vk-scan__btn--ghost" @tap="onDiscard">全部不要</text>
      <text
        class="vk-scan__btn vk-scan__btn--primary"
        :class="{ 'vk-scan__btn--disabled': saving }"
        @tap="onSave"
      >{{ saving ? '正在保存…' : '核对好了，保存' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { VaccineScanRow } from '../../domain/vaccine/types'
import { formatFullDate } from '../../domain/vaccine/status'

const props = withDefaults(defineProps<{
  /** 识别出来的行（名称 + 日期；`needsReview` 决定要不要核对） */
  drafts: VaccineScanRow[]
  /** 正在保存 */
  saving?: boolean
}>(), {
  saving: false,
})

/** 有没有"待核对"的行（决定要不要说那句"请对着疫苗本核一下"） */
const hasCareRow = computed(() => (props.drafts || []).some((row) => isCare(row)))

const emit = defineEmits<{
  /** 第二个参数：没填全、留在页面上的那几条（父组件要接住，别让卡片卸载） */
  (event: 'save', rows: VaccineScanRow[], kept?: VaccineScanRow[]): void
  (event: 'discard'): void
  /** 识别漏掉的那条，家长自己补 —— 交给唯一录入器 */
  (event: 'add-manual'): void
  /** 这一条认不出类别 → 交给录入器补全（那里能勾"含哪些疫苗"） */
  (event: 'fix-row', row: VaccineScanRow, index: number): void
}>()

/**
 * 页面上的行是本组件的**本地副本**。
 *
 * 为什么不直接改 props：小程序里父组件传下来的 props 不该被子组件改写
 * （改了这一页的数据就同时属于两边，重渲染时谁说了算说不清）。
 * 所以父组件一给新的一批，就重新拷一份。
 */
const rows = ref<VaccineScanRow[]>([])

/**
 * 上一次保存时**没填全、因此没交上去**的那几行（按 `key` 记）。
 *
 * ⚠️ 2026-10-16 自检 V4：这几行只活在本组件里 —— 父组件那批识别结果里**没有**它们
 *    （我们没把没填全的交上去）。所以父组件回写 props 时不能被顺手抹掉，
 *    否则家长刚填了一半的名称/日期会凭空消失，只能重新识别一次 ✗。
 *    交上去的那些仍以 props 为准（存成功的行父组件不会再发下来，页面就该少一行）。
 */
const keptKeys = ref<string[]>([])

watch(
  () => props.drafts,
  (next) => {
    /*
     * 父组件给的这一批：整批换新（存成功的行就是这样从页面上消失的）。
     *
     * 唯一的例外是"没填全、没交上去"的那几条（keptKeys）：父组件手上那一份是**旧的**
     * —— 它从来没收到过家长在这一页上改的 name / date，所以那几条以本地这一份为准。
     * 其余的行（含"没存上的"：父组件会把原因挂回来）一律以 props 为准。
     */
    const kept = rows.value.filter((row) => keptKeys.value.indexOf(row.key) >= 0)
    const keptOnPage = kept.map((row) => row.key)
    const incoming = (next || [])
      .filter((row) => keptOnPage.indexOf(row.key) < 0)
      .map((row) => ({ ...row }))
    /* 留在页面上的那几条接在这批**后面**：正好是还需要处理的那几条 */
    rows.value = [...incoming, ...kept.map((row) => ({ ...row }))]
  },
  { immediate: true, deep: true },
)

/** 这一行还要不要核对（已经点过"我已对照疫苗本核对"的就不再挡） */
function isCare(row: VaccineScanRow): boolean {
  return Boolean(row.needsReview) && !row.verified
}

function onNameInput(index: number, event: any) {
  const row = rows.value[index]
  if (!row) return
  row.name = String(event?.detail?.value || '')
}

function onDateChange(index: number, event: any) {
  const row = rows.value[index]
  if (!row) return
  row.date = String(event?.detail?.value || '')
}

function verifyRow(index: number) {
  const row = rows.value[index]
  if (!row) return
  row.verified = true
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

/**
 * 删一条要**先问一句**（老板 2026-10-16）。
 *
 * 这些行是识别出来的、家长正要用的；「删掉」两个字紧挨着输入框，
 * 手一滑就少一条 —— 而少的那条他未必马上发现（保存之后才发现没存进去）。
 */
async function onRemoveRow(index: number) {
  const row = rows.value[index]
  const name = String(row?.name || '').trim()
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删掉这一条？',
      content: name ? `「${name}」不会保存。` : '这一条不会保存。',
      confirmText: '删除',
      cancelText: '先留着',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })
  if (!confirmed) return
  removeRow(index)
}

function onFixRow(index: number) {
  const row = rows.value[index]
  if (row) emit('fix-row', row, index)
}

function onAddManual() {
  emit('add-manual')
}

function onDiscard() {
  emit('discard')
}

/** 这一行还缺什么（空串 = 名称和日期都齐了，可以交上去） */
function missingOf(row: VaccineScanRow): string {
  const hasName = Boolean(String(row.name || '').trim())
  const hasDate = Boolean(String(row.date || '').trim())
  if (hasName && hasDate) return ''
  if (!hasName && !hasDate) return '名称和日期'
  return hasName ? '接种日期' : '疫苗名称'
}

/** 说给家长听：是**哪一条**还没填全（有名字就用名字，否则说第几条） */
function rowRef(row: VaccineScanRow): string {
  const name = String(row.name || '').trim()
  if (name) return `「${name}」`
  const at = rows.value.indexOf(row)
  return at >= 0 ? `第 ${at + 1} 条` : '有一条'
}

/**
 * 一条都没填全时的那句提示：缺哪几条、缺什么、下一步。
 *
 * ⚠️ 2026-10-16 自检 V22：原来是"还没有填好名称和日期" —— 没说缺哪条、也没说下一步，
 *    家长只能自己一行一行猜。
 */
function missingHint(list: VaccineScanRow[]): string {
  if (list.length === 1) return `${rowRef(list[0])}还缺${missingOf(list[0])}，补齐再保存`
  const kinds = list.map((row) => missingOf(row))
  const same = kinds.every((kind) => kind === kinds[0])
  return `还有 ${list.length} 条缺${same ? kinds[0] : '名称或日期'}，补齐再保存`
}

function onSave() {
  if (props.saving) return
  /*
   * 名称 + 日期都齐了才交上去（跟录入器同一套必填要求）。
   *
   * ⚠️ 2026-10-16 自检 V4：缺的那几条**留在页面上** —— 原来这里写 `rows.value = ready`，
   *    等于把它们从页面上删掉：家长填漏一行，那行**既没保存、也从界面上消失**，
   *    只能重新识别一次 ✗。现在只把填全的交上去，缺的原地不动（见 keptKeys）；
   *    提示也照实说"没有保存"，不写"先留着"这种含糊话。
   */
  const ready: VaccineScanRow[] = []
  const notReady: VaccineScanRow[] = []
  for (const row of rows.value) {
    if (missingOf(row)) notReady.push(row)
    else ready.push(row)
  }

  /*
   * 没填全的这几条留在页面上（V4）：把 key 记下来，父组件回写识别结果时不抹掉它们，
   * 也不拿它手上那份旧的覆盖（见上面的 watch）。顺手清掉它上一轮"没存上"的红色提示 ——
   * 现在最要紧的是"还没填全"，两个提示叠在一行上反而说不清。
   */
  for (const row of notReady) {
    row.error = ''
  }
  keptKeys.value = notReady.map((row) => row.key)

  if (ready.length === 0) {
    // 一条都交不上去：说清缺哪几条、缺什么、下一步（自检 V22）
    uni.showToast({ title: missingHint(notReady), icon: 'none' })
    return
  }

  if (notReady.length > 0) {
    uni.showToast({ title: `这 ${notReady.length} 条还没填全，没有保存`, icon: 'none' })
  }

  /*
   * ⚠️ 把"留在页面上的那几条"一并交给父组件（自检 V4 最后一米）。
   *
   * 只 emit 填全的那几条是不够的：父组件在"全部存成功"那一支会把识别结果清空
   * （`scanRows.value = []`），本组件是 `v-if="scanRows.length > 0"` 挂着的 →
   * 卡片一卸载，留在本地的那几条**又没了** ✗。
   * 所以在这里把 kept 一起交出去，父组件用它接住。
   */
  emit(
    'save',
    ready.map((row) => ({ ...row })),
    notReady.map((row) => ({ ...row })),
  )
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-scan {
  background: $vk-card-bg;
  border: 1px solid $vk-card-border;
  border-radius: $vk-card-radius;
  padding: 24rpx;
}

.vk-scan__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 10rpx;
}

.vk-scan__title {
  font-size: $vk-font-card-title;
  font-weight: 700;
  color: $vk-text-strong;
}

.vk-scan__count {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-scan__hint {
  display: block;
  font-size: $vk-font-sub;
  line-height: 1.55;
  color: $vk-text-muted;
  margin-bottom: 16rpx;
}

.vk-scan__row {
  border: 1px solid $vk-card-border;
  border-radius: 22rpx;
  padding: 18rpx;
  margin-bottom: 14rpx;
}

.vk-scan__row--care {
  border-color: $vk-care-border;
  background: $vk-care-bg;
}

.vk-scan__line {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/* 有框 = 能改（与录入卡同一种视觉语言） */
.vk-scan__field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  border: 1px solid $vk-field-border;
  border-radius: 14rpx;
  background: $vk-white;
  padding: 8rpx 14rpx;
}

.vk-scan__field--date {
  margin-top: 8rpx;
}

.vk-scan__row--error {
  border-color: $vk-danger;
  background: $vk-over-bg;
}

.vk-scan__error {
  margin-top: 8rpx;
}

.vk-scan__error-text {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-danger;
  line-height: 1.5;
}

.vk-scan__act--fix {
  border-color: $vk-danger;
  color: $vk-danger;
}

.vk-scan__add {
  margin: 12rpx 0 4rpx;
  text-align: center;
  line-height: 72rpx;
  border: 1px dashed $vk-field-border;
  border-radius: 16rpx;
  color: $vk-brand;
  font-size: $vk-font-body;
}

.vk-scan__add-text {
  font-size: $vk-font-body;
}

.vk-scan__name {
  flex: 1;
  min-width: 0;
  font-size: $vk-font-title;
  font-weight: 700;
  color: $vk-text;
}

.vk-scan__ph {
  color: $vk-placeholder;
  font-weight: 400;
}

.vk-scan__badge {
  @include vk-badge($vk-check-bg, $vk-check-fg);
}

.vk-scan__del {
  font-size: $vk-font-sub;
  color: $vk-text-faint;
  padding-left: 12rpx;
}

.vk-scan__date {
  margin-top: 12rpx;
  border: 1px solid $vk-field-border;
  border-radius: 18rpx;
  padding: 16rpx 18rpx;
  font-size: $vk-font-body;
  color: $vk-text;
}

.vk-scan__date--empty {
  color: $vk-placeholder;
}

.vk-scan__why {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-warning;
  line-height: 1.5;
  margin-top: 12rpx;
}

.vk-scan__acts {
  display: flex;
  margin-top: 14rpx;
}

.vk-scan__act {
  flex: 1;
  text-align: center;
  line-height: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  border: 1px solid $vk-brand;
  color: $vk-brand;
  font-size: $vk-font-button;
  font-weight: 600;
}

.vk-scan__footer {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.vk-scan__btn {
  flex: 1;
  text-align: center;
  line-height: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  font-size: $vk-font-button;
  font-weight: 600;
}

.vk-scan__btn--ghost {
  background: $vk-ghost-bg;
  color: $vk-ghost-fg;
}

.vk-scan__btn--primary {
  background: $vk-brand;
  color: $vk-white;
}

.vk-scan__btn--disabled {
  opacity: 0.6;
}
</style>
