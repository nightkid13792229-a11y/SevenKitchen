<template>
  <!-- 疫苗计划（2026-10-01，第四期）。
       老板第 15–18 条：按免疫程序提醒还需要打哪些、什么时候打；
       引导顾客自己决策；顾客计划与我们不一致时提醒；提醒只在小程序内。

       2026-10-04 老板定：**计划没开的时候整块不出现**。
       原来会显示一张写着"待开放"的卡片 —— 顾客看到的是一个还不存在、
       也没说什么时候会有的功能，只会以为是坏的。开了才出现，才讲得通。 -->
  <view v-if="!sectionHidden" class="health-section vaccine-plan">
    <template v-if="loaded">
      <!-- 一条接种记录都没有时：**这一块整个不渲染**（2026-10-04 老板第二次提问后改）。

           前一轮我在计划板块里放了一张"还没有接种记录"的说明卡，
           结果下面记录板块的空态又写了一遍"还没有疫苗记录"——
           老板："为什么会提醒了一次，没有接种记录。在下方又进行了一次
           没有疫苗记录的提醒呢。" 同一件事说了两遍。
           （另外，零记录时显示"下一步：狂犬疫苗 第 3 次 / 建议时间 2025-11-16"
             也不成立：那个"第 3 次"是程序表里的序号，顾客会读成"我家狗打过两次"，
             而我们一条记录都没有；窗口还是过去的。
             计划是"接下来怎么打"，没有记录就没有"接下来"可言。）

           所以这句提醒交给**记录板块的空态**去说 —— 它就长在记录列表该在的地方，
           而且计划开关关掉时也照样说得到（那边不依赖计划接口）。 -->
      <template v-if="!noRecordAtAll">
      <!-- ══ 2026-10-06 老板改版 ══════════════════════════════════════
           · 「步骤提醒」和「接种计划」**合并成一个板块**，默认收起；
           · 收起时只显示**下一针的疫苗分类 + 接种窗口期**；
           · 展开后分两部分：
               ① 下一针的进一步说明 —— 分类、窗口期、依据、推荐疫苗；
               ② 接种计划 —— 按接种窗口期**由近到远**排序，
                  每一步只显示：状态、疫苗种类、接种窗口期、接种时间、
                  推荐疫苗（已记录/已接种就不再推荐）、依据；
           · 每一步的三个按钮（按建议/推迟/不做）换成两个：
               「记录疫苗接种信息」→ 直接走新增记录流程（并带上这一步的分类）
               「忽略」→ 弹窗确认后，这一步从这只狗狗的计划里去点。 -->
      <view class="health-card plan-card">
        <!-- ① 头部：收起时**只剩这一行** -->
        <view class="plan-card__head" @tap="toggleExpanded">
          <view class="plan-card__summary">
            <text class="plan-card__eyebrow">下一针</text>
            <text class="plan-card__kind">
              {{ nextStep ? nextStep.kindLabel : '当前没有待接种的针' }}
            </text>
            <text v-if="nextStep" class="plan-card__window">
              接种窗口期 {{ nextStep.windowStart }} ~ {{ nextStep.windowEnd }}
            </text>
            <text v-else class="plan-card__window">
              按现有记录，免疫程序里的项目都已完成
            </text>
          </view>
          <text class="plan-card__toggle">{{ expanded ? '收起' : '展开' }}</text>
        </view>

        <template v-if="expanded">
          <!-- ②-A 下一针的进一步说明。
               老板："除了疫苗分类和接种窗口期，还需要展示依据和推荐的疫苗。
                     该部分其他的信息不用展示。" -->
          <view v-if="nextStep" class="next-detail">
            <text class="next-detail__title">下一针说明</text>
            <view class="kv">
              <text class="kv__label">疫苗分类</text>
              <text class="kv__value">{{ nextStep.kindLabel }}</text>
            </view>
            <view class="kv">
              <text class="kv__label">接种窗口期</text>
              <text class="kv__value">{{ nextStep.windowStart }} ~ {{ nextStep.windowEnd }}</text>
            </view>
            <view v-if="(nextStep.commonProducts || []).length > 0" class="kv">
              <text class="kv__label">推荐疫苗</text>
              <text class="kv__value">{{ (nextStep.commonProducts || []).join('、') }}</text>
            </view>
            <view class="kv">
              <text class="kv__label">依据</text>
              <text class="kv__value">{{ nextStep.basis }}</text>
            </view>
            <!-- 「这一针别和别的针同一天打」—— 老板 2026-10-05 亲口要的安全提醒（spacing-note__text）。
                 2026-10-06 的字段清单里没有它，但它是"两针别同一天打"这条安全提醒，
                 先留着；不要的话说一声，删一行的事。 -->
            <text v-if="nextStep.spacingNote" class="spacing-note__text">
              {{ nextStep.spacingNote }}
            </text>
          </view>

          <!-- ②-B 接种计划：按接种窗口期由近到远 -->
          <view class="plan-steps">
            <text class="plan-steps__title">接种计划</text>

            <view
              v-for="step in orderedSteps"
              :key="step.key"
              class="step"
              :class="`step--${step.status}`"
            >
              <view class="step__head">
                <text class="step__status">{{ statusLabel(step) }}</text>
                <text class="step__kind">{{ step.kindLabel }}</text>
              </view>
              <text class="step__label">{{ step.label }}</text>
              <!-- 已完成的不显示接种窗口期（2026-10-06 老板："已完成的疫苗为什么
                   还要显示接种窗口期呢？"）—— 那扇窗早就过了，留着只是噪音。
                   已完成看的是"什么时候打的"，在下面那一行。 -->
              <view v-if="step.status !== 'DONE'" class="kv">
                <text class="kv__label">接种窗口期</text>
                <text class="kv__value">{{ step.windowStart }} ~ {{ step.windowEnd }}</text>
              </view>
              <!-- 接种时间 = 这条记录的时间；没打过就没有这一行 -->
              <view v-if="step.matchedRecordDate" class="kv">
                <text class="kv__label">接种时间</text>
                <text class="kv__value">{{ step.matchedRecordDate }}</text>
              </view>
              <!-- 已经记录过/接种过的，不再推荐产品（老板 2026-10-06） -->
              <view v-if="stepProducts(step).length > 0" class="kv">
                <text class="kv__label">推荐疫苗</text>
                <text class="kv__value">{{ stepProducts(step).join('、') }}</text>
              </view>
              <view class="kv">
                <text class="kv__label">依据</text>
                <text class="kv__value">{{ step.basis }}</text>
              </view>

              <!-- 已完成的步骤不再给动作按钮（2026-10-06 老板："已完成状态的疫苗，
                   为什么还是会给出这两个按钮呢？"）——
                   那一针已经打完了，没什么可记、也没什么可忽略的。 -->
              <view v-if="step.status !== 'DONE'" class="step-actions">
                <text class="step-actions__primary" @tap.stop="recordStep(step)">
                  记录接种信息
                </text>
                <text class="step-actions__ghost" @tap.stop="ignoreStep(step)">忽略</text>
              </view>
            </view>

            <text v-if="orderedSteps.length === 0" class="plan-steps__empty">
              计划里的项目都已完成或已忽略。
            </text>
            <!-- 忽略不是"删除得找不回来"：给一条回头的路 -->
            <text v-if="ignoredCount > 0" class="plan-steps__restore" @tap="restoreIgnored">
              已忽略 {{ ignoredCount }} 项 · 点这里恢复
            </text>
          </view>
        </template>
      </view>

      <!-- ③ 不一致提醒：老板第 17 条。它本身就是提醒，不折进展开区 -->
      <view v-if="plan.conflicts.length > 0" class="health-card conflicts">
        <text class="conflicts__title">你的记录与建议不一致（{{ plan.conflicts.length }} 处）</text>
        <view v-for="item in plan.conflicts" :key="`${item.recordId}-${item.reason}`" class="conflict">
          <text class="conflict__head">{{ item.recordDate }} · {{ item.vaccineName }}</text>
          <text class="conflict__reason">{{ item.reason }}</text>
          <text class="conflict__suggestion">{{ item.suggestion }}</text>
        </view>
        <text class="conflicts__note">
          这只是提醒，不是结论。以你手上兽医给出的方案为准。
        </text>
      </view>
      </template>
    </template>

    <view v-else-if="loadError" class="health-card">
      <text class="plan-locked__title">疫苗计划加载失败</text>
      <text class="plan-locked__desc">{{ loadError }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 疫苗计划板块。
 *
 * 挂在「疫苗」书签下、紧挨着疫苗记录上方 —— 记录是"打过什么"，
 * 计划是"接下来怎么打"，两者放一起才读得通。
 *
 * ✅ 顾客侧已开放（2026-10-02 老板指示）：生产环境开了 VACCINE_PLAN=customer，
 *    免疫程序来自 WSAVA 2024，与已审核的免疫类知识条目同源。
 *    接口返回 available: false 时这一块显示原因，而不是空白（开关关掉就回到那个状态）。
 */
interface PlanStep {
  key: string
  kind: string
  /**
   * 疫苗种类的中文名（狂犬疫苗 / 核心疫苗 / 早期核心疫苗 / 钩端螺旋体 / 其他）。
   *
   * 2026-10-06 由后端下发 —— 前端不再自己维护一份 kind→中文 的映射，
   * 免得两边不一致（这个项目已经吃过两次这种亏）。
   */
  kindLabel: string
  label: string
  windowStart: string
  windowEnd: string
  status: 'DONE' | 'DUE' | 'UPCOMING' | 'OVERDUE' | 'SKIPPED'
  /**
   * 状态的中文说法，**后端下发**（2026-10-07 老板审计第 5 块）。
   *
   * 口径跟"每一类只显示下一针"绑在一起：窗口过去的那一针，作为
   * "这一类的下一针"时叫「该补了」而不是「已逾期」；没有证据时软成「还没记录」。
   * 老后端不带这个字段时，退回下面 statusLabel() 里那套映射。
   */
  statusLabel?: string
  matchedRecordId: string | null
  matchedRecordDate: string | null
  /**
   * **这一步所属的那一类**有没有任何一条对得上的记录（2026-10-07 后端新增）。
   *
   * 决定状态标签的口气：true → 说"还没记录"，不说"已逾期"。
   * 老后端不带这个字段时，退回用整只狗的 noEvidence（见 statusLabel）。
   */
  noEvidence?: boolean
  basis: string
  reminder: string
  /**
   * 这一步常见的产品（2026-10-04 兽医审核通过）。
   *
   * ⚠️ 只列进口苗（老板审核意见第 5 条："所有国产疫苗都不推荐"），
   *    每个种类最多 3 个（第 6 条）。
   * ⚠️ 措辞是「常见的有」，**不是「建议打」** ——
   *    各医院进的货不一样，推荐了顾客也未必买得到；
   *    而且"打哪个商品"已经挨着诊疗，不是我们该拍板的。
   */
  commonProducts?: string[]
  /**
   * 「这一针别和别的针同一天打」（2026-10-05 老板的规则二）。
   *
   * 不同分类的疫苗不可以同一天接种，前后错开 2~3 天。
   * 空字符串 = 这段时间没有别的针要打。
   */
  spacingNote?: string
}

interface PlanConflict {
  recordId: string
  recordDate: string
  vaccineName: string
  reason: string
  suggestion: string
}

const props = defineProps<{
  dogId: string
  /**
   * 已保存记录变化时由页面递增（2026-10-05）。
   *
   * 计划板块原来只在"换狗"时加载一次，顾客在原地录完几条它也不知道，
   * 于是停在"还没有记录"的状态、整块不显示。
   */
  dataVersion?: number
}>()

/**
 * 点某一步的「记录疫苗接种信息」时告诉页面：去开新增记录，并带上这一步的分类。
 *
 * 为什么交给页面：新增记录那块在另一个组件（VaccineManagementSection），
 * 页面同时握着两边的 ref，由它牵线最直接 —— 计划这边不越权去动记录列表。
 */
const emit = defineEmits<{
  (event: 'record-step', payload: { kinds: string[]; stepLabel: string }): void
}>()

/** 下一针（后端算好；忽略掉的步骤后端已经排除在 nextStep 之外） */
const nextStep = computed(() => plan.value.nextStep)

/**
 * ⚠️ 这里原来放的是三个决定按钮（按建议 / 推迟 / 不做）的选项表。
 *
 * 2026-10-06 老板："目前这 3 个按钮，我选中之后没有任何反应，
 * 不知道后端是怎么安排的。"（后端其实是好的 —— 生产实测 PUT 200 落库成功，
 * 只是界面上只变了一个很不明显的样式，列表里那几项连一句说明都没有。）
 *
 * 老板的方案是重构：每一步只留两个按钮 ——
 *   「记录疫苗接种信息」→ 直接走新增记录流程
 *   「忽略」→ 弹窗确认后把这一步从这只狗狗的计划里去掉（存 SKIP）
 * 两个按钮都是"做了就有看得见的结果"，不会再有"点了像没点"。
 */

const STATUS_LABELS: Record<PlanStep['status'], string> = {
  DONE: '已完成',
  DUE: '该打了',
  UPCOMING: '待安排',
  OVERDUE: '已逾期',
  SKIPPED: '不做',
}

const loaded = ref(false)
/**
 * 上一次加载的是哪条狗（2026-10-06）。
 *
 * 用来区分"同一条狗刷新"和"换了一条狗"：前者不要抹掉 loaded（会闪一下），
 * 后者必须抹掉（否则新狗会顶着上一条狗的计划）。
 */
const loadedDogId = ref('')
const loadError = ref('')
const unavailable = ref<{ message: string } | null>(null)

/** 计划没开（接口说 available:false）→ 整块不出现，不是显示一张"待开放"的卡 */
const planHidden = computed(() => unavailable.value !== null)

/**
 * 整块要不要渲染（2026-10-05）。
 *
 * ⚠️ 零记录时**连根节点都不能留**。上一轮我只把里面的内容藏了，
 * 根 `<view class="health-section vaccine-plan">` 还在 ——
 * 它带着 `.vaccine-plan { margin-bottom: 24rpx }`，于是在书签和
 * 记录板块那张空态卡之间留了一条 24rpx 的紫色空白。
 * 老板看出来了："疫苗板块为什么还是有紫色的空白区域呢？"
 */
const sectionHidden = computed(
  () => planHidden.value || (loaded.value && noRecordAtAll.value),
)
const plan = ref<{
  nextStep: PlanStep | null
  steps: PlanStep[]
  conflicts: PlanConflict[]
  decisions: Record<string, string>
  summary?: { done?: number }
  /**
   * 这套免疫程序表是否已经过专业审核（2026-10-04）。
   *
   * 后端一直在传这个字段，注释也写着"顾客侧即便开放，也要如实标记"，
   * 但界面**从来没有读过它** —— 于是卡片底部永远写着
   * "……还在做专业审核、暂不对顾客开放"那句话，
   * 而线上开关是开着的：文案在说反话。
   *
   * 现在按它决定底部那句话。等兽医审完、后端把 reviewed 打开，
   * 文案会自己跟着变，不用再改一次前端。
   */
  reviewed?: boolean
  /**
   * 一条接种记录都没有（后端下发）。
   *
   * ⚠️ 2026-10-04 修正口径：它现在**真的**表示"一条记录都没有"
   * （`records.length === 0`）。原来后端算的是"没有任何一步被匹配上"，
   * 于是只录了一条"钩端螺旋体"（非核心苗，程序表里没有对应步骤）的人，
   * 会被误判成"一条记录都没有"。
   */
  noRecordAtAll?: boolean
  /**
   * 有没有任何一条能对上号的证据（后端下发）。
   *
   * **只用来决定措辞软硬** —— 为假时不出现"已过期""尽快安排"这种口气。
   * 不用它决定显不显示计划，那件事归 noRecordAtAll。
   */
  noEvidence?: boolean
}>({ nextStep: null, steps: [], conflicts: [], decisions: {} })

/**
 * 一条接种记录都没有（后端下发，优先用）。
 *
 * 决定：**整块藏掉计划与"下一步"**（零记录时计划本来也无从谈起）。
 * 那句空态提醒由记录板块去说，这里不重复。
 *
 * ⚠️ 2026-10-04 口径修正：它以前兼着"没有任何一步对上号"的意思，
 * 现在两个概念分开了 —— 见 noEvidence。
 */
const noRecordAtAll = computed(() => {
  if (typeof plan.value.noRecordAtAll === 'boolean') {
    return plan.value.noRecordAtAll
  }
  // 兜底（后端没下发时）：没有已完成、也没有任何一步被匹配上
  const done = Number(plan.value.summary?.done ?? 0)
  const hasMatched = plan.value.steps.some((step) => step.matchedRecordId)
  return done === 0 && !hasMatched
})

/**
 * 有没有任何一条能对上号的证据（2026-10-02 的原始意图）。
 *
 * 为什么需要这个：顾客侧开放当天实测一只 8 个月、没记过疫苗的狗，
 * 页面直接顶着 5 个「已逾期」—— 家长明明打过、只是没记，会以为系统算错了。
 * 一条都对不上时，措辞要软：不说"已逾期"，改说"还没记录"—— 这是陈述事实，不是指责。
 */
const noEvidence = computed(() => {
  if (typeof plan.value.noEvidence === 'boolean') {
    return plan.value.noEvidence
  }
  return noRecordAtAll.value
})

/**
 * 状态标签（2026-10-04 老板定，2026-10-07 改成**按类**判断）。
 *
 * **没有任何证据**时不出现"已逾期" —— 我们没有任何证据说他没打，
 * 家长明明年年带狗去打、只是没在小程序里记，看到"已逾期"会以为系统算错了。
 * 改成"还没记录"，这是一个事实陈述，不是指责。
 *
 * ⚠️ 2026-10-07 老板审计时发现判据太粗：原来是**整只狗**一把尺，
 *    于是"只记过狂犬的狗"打开页面会看到钩端那两针写着"已逾期"，
 *    而"什么记录都没有的狗"同样两针却写"还没记录" —— 同一件事两种口气。
 *    现在按**类**判断（后端下发每步的 noEvidence）：
 *    这一类一针记录都没有 → 这一类一律说"还没记录"。
 */
function statusLabel(step: PlanStep) {
  // 后端下发的口径优先（它才知道"这一针是不是这一类的下一针"）
  if (step.statusLabel) {
    return step.statusLabel
  }
  const kindNoEvidence =
    typeof step.noEvidence === 'boolean' ? step.noEvidence : noEvidence.value
  if (kindNoEvidence && (step.status === 'OVERDUE' || step.status === 'DUE')) {
    return '还没记录'
  }
  return STATUS_LABELS[step.status] || step.status
}

/**
 * 整个板块默认收起（2026-10-06 老板改版）。
 *
 * 收起时只有一行：**下一针是什么分类、什么时候打** —— 顾客来这一页
 * 要的就是这一句。要看细节、要动手，再展开。
 */
const expanded = ref(false)

function toggleExpanded() {
  expanded.value = !expanded.value
}

/**
 * 计划列表：按接种窗口期**由近到远**（老板 2026-10-06 的明确要求），
 * 并且把顾客忽略掉的步骤去掉。
 *
 * 忽略 = 存一个 SKIP 决定（后端一直支持，只是原来只影响"下一步"的选择，
 * 步骤本身还留在列表里）。老板要的是"从计划里去掉"，所以在展示层过滤掉；
 * 库里那条决定留着，所以随时能恢复（见 restoreIgnored）。
 */
const orderedSteps = computed(() => {
  const visible = plan.value.steps.filter(
    (step) => plan.value.decisions[step.key] !== 'SKIP',
  )

  /*
   * 同一类里，前面还有没做完的，就**不显示后面那些**（2026-10-06 老板提问）。
   *
   * 老板："狂犬疫苗第 4 次显示已逾期，但为什么待安排的狂犬疫苗却显示是第 5 次呢？
   * 如果第 4 次已经逾期了，那不是第 4 次就是应该是待安排的吗？"
   * —— 对。年度系列会一年生成一步，第 4 次没做完就不该把第 5 次摆出来，
   * 那会让人以为可以直接跳到明年那一针。
   */
  const ordered = visible
    .slice()
    .sort((a, b) => String(a.windowStart).localeCompare(String(b.windowStart)))

  const blocked = new Set<string>()
  const seenPending = new Set<string>()
  for (const step of ordered) {
    if (seenPending.has(step.kind)) {
      blocked.add(step.key)
      continue
    }
    if (step.status !== 'DONE') {
      seenPending.add(step.kind)
    }
  }

  /*
   * 排序（2026-10-06 老板："最早的已经完成的疫苗记录反而排在最上面"）。
   *
   * 原来是纯按窗口期从早到晚 —— 而**已完成**的窗口都在过去，于是一堆历史
   * 记录占着最上面。计划是"接下来怎么打"，所以：**未完成的在前、已完成沉底**，
   * 各自内部仍按窗口期由近到远。
   */
  const pendingRank = (step: PlanStep) => (step.status === 'DONE' ? 1 : 0)

  return ordered
    .filter((step) => !blocked.has(step.key))
    .sort(
      (a, b) =>
        pendingRank(a) - pendingRank(b) ||
        String(a.windowStart).localeCompare(String(b.windowStart)),
    )
})

/** 被忽略了几项 —— 给"恢复"那条路用 */
const ignoredCount = computed(
  () => plan.value.steps.filter((step) => plan.value.decisions[step.key] === 'SKIP').length,
)

/**
 * 这一步要不要推产品。
 *
 * 老板："推荐疫苗（如果已记录或者已接种，就不需要推荐了。）"
 * 已经打过这一步的，再列一串产品只会让人以为"还得再打一次"。
 */
function stepProducts(step: PlanStep): string[] {
  if (step.matchedRecordId) return []
  return step.commonProducts || []
}

/**
 * 点「记录疫苗接种信息」→ 直接走新增记录流程。
 *
 * 把这一步的分类一起带过去：顾客是在"狂犬疫苗 第 3 次"这一行点的，
 * 新增出来的那条记录本来就该归到狂犬疫苗 —— 让他再选一次是白费事，
 * 也容易选错（选错就把免疫计划带偏了）。
 */
function recordStep(step: PlanStep) {
  emit('record-step', { kinds: [step.kind], stepLabel: step.label })
}

/** 点「忽略」→ 先确认，再从这只狗狗的计划里去掉这一步 */
function ignoreStep(step: PlanStep) {
  uni.showModal({
    title: '忽略这一步？',
    content: `忽略后「${step.label}」会从这只狗狗的接种计划里去掉，不再提醒。计划底部随时可以恢复。`,
    confirmText: '忽略',
    cancelText: '保留',
    success: (result) => {
      if (result.confirm) {
        void decide(step.key, 'SKIP')
      }
    },
  })
}

/** 把忽略掉的步骤恢复回来（清掉那些 SKIP 决定） */
async function restoreIgnored() {
  const ignored = plan.value.steps
    .filter((step) => plan.value.decisions[step.key] === 'SKIP')
    .map((step) => step.key)

  for (const key of ignored) {
    await decide(key, 'SKIP')
  }
}

async function load() {
  if (!props.dogId) {
    return
  }

  /*
   * ⚠️ 刷新时**不要**先把 loaded 抹掉（2026-10-06）。
   *
   * `sectionHidden` 是靠 `loaded && noRecordAtAll` 算出来的 ——
   * 刷新一开始 loaded=false，整块会先消失、数据回来再出现，闪一下。
   * 但**换狗**时必须重置：否则会拿上一条狗的计划顶上几秒，
   * 那比闪一下更糟（顾客以为新狗已经有计划了）。
   */
  if (loadedDogId.value !== props.dogId) {
    loaded.value = false
  }
  loadedDogId.value = props.dogId
  loadError.value = ''
  unavailable.value = null

  try {
    const res: any = await dogApi.vaccinePlan(props.dogId)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '加载疫苗计划失败')
    }

    if (res.data.available === false) {
      unavailable.value = { message: String(res.data.message || '') }
      loaded.value = false
      return
    }

    plan.value = {
      // 后端已经把 commonProducts 放在每一步里了，整条透传
      nextStep: res.data.nextStep || null,
      steps: Array.isArray(res.data.steps) ? res.data.steps : [],
      conflicts: Array.isArray(res.data.conflicts) ? res.data.conflicts : [],
      decisions: res.data.decisions || {},
      summary: res.data.summary || {},
      reviewed: res.data.reviewed === true,
      noRecordAtAll: res.data.noRecordAtAll === true,
      noEvidence: res.data.noEvidence === true,
    }
    loaded.value = true
  } catch (error: any) {
    loadError.value = error?.message || '加载疫苗计划失败'
  }
}

/**
 * 记录顾客的决定（老板第 16 条：引导顾客自己做决策）。
 *
 * 点同一个选项两次 = 取消这个决定，回到"按建议"。
 */
async function decide(stepKey: string, decision: string) {
  const current = plan.value.decisions[stepKey]
  const isCancel = current === decision

  // 先动界面，失败再回滚 —— 点一下要立刻有反应
  const previous = { ...plan.value.decisions }
  if (isCancel) {
    delete plan.value.decisions[stepKey]
  } else {
    plan.value.decisions[stepKey] = decision
  }

  try {
    const res: any = isCancel
      ? await dogApi.clearVaccineDecision(props.dogId, stepKey)
      : await dogApi.setVaccineDecision(props.dogId, stepKey, decision)

    if (res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }
    plan.value.decisions = res.data?.decisions || plan.value.decisions
  } catch (error: any) {
    plan.value.decisions = previous
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  }
}

// 换狗 or 记录变了都要重新算 —— 计划的每一步都依赖"有没有对上号的记录"
watch(() => [props.dogId, props.dataVersion], load, { immediate: true })

/**
 * 让页面**直接调这里**重算计划（2026-10-06）。
 *
 * ⚠️ 原来只靠上面那条 watch（页面把记录变化折成 data-version 传下来）。
 * 用微信官方自动化驱动模拟器实测，删光记录之后：
 *   · 书签红点**灭掉了** → 说明"记录变了"确实通知到了页面；
 *   · 计划板块**原地不动**，还挂着删掉的那条记录算出来的计划。
 * 也就是通知到了页面，却没让这个组件重算 —— 老板看到的
 * "删空了还显示计划和提醒，切走再切回才空"就是这个。
 *
 * 页面调组件方法这条路在本项目里是**已经验证过的**（疫苗板块的
 * countUnsaveableDrafts / startScan / addRecord 都靠它），所以加这一条。
 * watch 保留：换狗时它仍然管用，两条路不冲突（同一次加载幂等）。
 */
defineExpose({ reload: () => load() })
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.vaccine-plan {
  margin-bottom: 24rpx;
}

.plan-locked__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.plan-locked__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* 下一针：整个板块最醒目的一行 */
.next-step {
  border-left: 8rpx solid #8a968a;
}

.next-step--DUE {
  border-left-color: #0f7b49;
}

.next-step--OVERDUE {
  border-left-color: #c0392b;
}

.next-step--UPCOMING {
  border-left-color: #216d9b;
}

.next-step--DONE {
  border-left-color: #8a968a;
}

.next-step__eyebrow {
  font-size: 22rpx;
  letter-spacing: 0.1em;
  color: #8a968a;
}

.next-step__label {
  display: block;
  margin-top: 8rpx;
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.next-step__window {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #4a5a4a;
}

.next-step__reminder {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

/*
 * 「别同一天打」的提醒（2026-10-05）。
 * 用浅琥珀底 + 左边一道色条 —— 比正文显眼，但不是报错的红。
 * 这属于"容易做错但不紧急"的提示。
 */
.spacing-note {
  margin-top: 14rpx;
  padding: 14rpx 18rpx;
  border-radius: 12rpx;
  background: #fdf8ec;
  border-left: 6rpx solid #d8c98a;
}

.spacing-note__text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #7a6a2f;
}

.step__spacing {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #7a6a2f;
}

/* 常见产品（2026-10-04）：比"依据"显眼一点，比正文轻一点 */
.next-step__products {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #4a5a4a;
}

.step__products {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #4a5a4a;
}

.next-step__basis {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  line-height: 1.5;
  color: #a8b2a8;
}

/* 顾客的决定：三个选项 */
.decisions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.decisions--compact {
  margin-top: 14rpx;
}

.decisions__item {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  font-size: 24rpx;
  color: #4a5a4a;
  background: #f2f5ec;
  border: 2rpx solid transparent;
  border-radius: 12rpx;
}

.decisions__item--active {
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  border-color: var(--health-accent, #1e3a2f);
  font-weight: 600;
}

.decisions__hint {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: #8a968a;
}

/* 不一致提醒 */
.conflicts {
  border-left: 8rpx solid #c0392b;
}

.conflicts__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #a5311f;
}

.conflict {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #f0e2de;
}

.conflict__head {
  display: block;
  font-size: 23rpx;
  color: #6b6653;
}

.conflict__reason {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.conflict__suggestion {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.conflicts__note {
  display: block;
  margin-top: 18rpx;
  font-size: 21rpx;
  color: #8a968a;
}

/* ── 合并后的板块（2026-10-06）─────────────────────────────────────
   收起时只占一行：下一针的分类 + 窗口期。 */
.plan-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.plan-card__summary {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}

.plan-card__eyebrow {
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: #8a968a;
}

.plan-card__kind {
  font-size: 32rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.plan-card__window {
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.plan-card__toggle {
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  font-size: 23rpx;
  font-weight: 600;
  color: #1e3a2f;
  background: #eef2e6;
  border-radius: 999rpx;
}

/* 「标签 + 值」一行 —— 两部分的字段都用它，读起来整齐 */
.kv {
  display: flex;
  gap: 14rpx;
  margin-top: 10rpx;
}

.kv__label {
  flex-shrink: 0;
  width: 132rpx;
  font-size: 23rpx;
  line-height: 1.55;
  color: #8a968a;
}

.kv__value {
  flex: 1;
  min-width: 0;
  font-size: 23rpx;
  line-height: 1.55;
  color: #26261f;
}

/* ① 下一针的进一步说明 */
.next-detail {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #eef1e8;
}

.next-detail__title,
.plan-steps__title {
  display: block;
  font-size: 25rpx;
  font-weight: 700;
  color: #1e3a2f;
}

/* ② 接种计划 */
.plan-steps {
  margin-top: 26rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #eef1e8;
}

.plan-steps__empty {
  display: block;
  margin-top: 14rpx;
  font-size: 23rpx;
  color: #8a968a;
}

/* 忽略不是不可逆的：给一条回来的路 */
.plan-steps__restore {
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  color: #6b6653;
  text-decoration: underline;
}

/* 每一步的两个按钮（2026-10-06 老板改版：按建议/推迟/不做 三个按钮下线） */
.step-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}

.step-actions__primary {
  flex: 1;
  padding: 16rpx 0;
  font-size: 24rpx;
  font-weight: 600;
  text-align: center;
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  border-radius: 14rpx;
}

.step-actions__ghost {
  flex-shrink: 0;
  padding: 16rpx 26rpx;
  font-size: 24rpx;
  text-align: center;
  color: #6b6653;
  background: #f2f4ec;
  border-radius: 14rpx;
}

.step__kind {
  font-size: 21rpx;
  font-weight: 600;
  color: #4e6b52;
}

/* 计划列表 */
.step {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #eef1e8;
}

.step__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.step__status {
  flex-shrink: 0;
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #ffffff;
  background: #8a968a;
}

.step--DONE .step__status { background: #0f7b49; }
.step--DUE .step__status { background: #0f7b49; }
.step--OVERDUE .step__status { background: #c0392b; }
.step--UPCOMING .step__status { background: #216d9b; }
.step--SKIPPED .step__status { background: #a8b2a8; }

.step__label {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.step--SKIPPED .step__label {
  color: #8a968a;
  text-decoration: line-through;
}

.step__window {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #6b6653;
}

.step__matched {
  display: block;
  margin-top: 6rpx;
  font-size: 23rpx;
  color: #0f7b49;
}

.step__basis {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  line-height: 1.5;
  color: #a8b2a8;
}

/*
 * ⚠️ 这里原来有一条页面底部的说明文案（"…还在做专业审核，暂不对顾客开放…"）。
 * 2026-10-06 老板："这句话删除掉。同时看一下后端是否有什么卡点，也请取消，
 * 我们现在就按审核通过的标准部署。" —— 前端这句和后端那个
 * VACCINE_PLAN 开关一起取消了，样式也一并删干净。
 */
</style>
