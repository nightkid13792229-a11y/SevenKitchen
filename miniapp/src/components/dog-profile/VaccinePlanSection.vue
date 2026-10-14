<template>
  <view v-if="!sectionHidden" class="health-section vaccine-plan">
    <view class="plan-head">
      <view class="plan-head__bar" />
      <text class="plan-head__title">接种计划</text>
      <!-- 右边那行小字（"每一类只提醒下一针；从近到远"）
           已按老板 2026-10-13 要求**删除** —— 那是内部说明，
           不该出现在顾客页面上（和接种记录板块那行小字同一个道理）。 -->
    </view>

    <template v-for="(card, cardIndex) in kindCards" :key="card.key">
    <view class="kind-card" :class="comboCardClass(card)">
      <view class="kind-card__head" @tap="toggleKind(card.key)">
        <!-- 老板 2026-10-12：状态角标放到卡片**左上角** ✓
             （原来跟在标题后面 ✗ → 标题被挤到换行、「待接种」也断成两行 ✗）-->
        <view class="kind-card__top">
          <text class="kind-card__badge" :class="`kind-card__badge--${card.steps[0].status}`">
            {{ statusLabel(card.steps[0]) }}
          </text>
          <text class="kind-card__toggle">{{ expandedKind === card.key ? '收起' : '展开' }}</text>
        </view>
        <text class="kind-card__kind">{{ card.title }}</text>
        <text class="kind-card__time">
          <template v-if="isWindowPassed(card.steps[0])">
            建议接种时间：尽快补种（原窗口 {{ card.windowStart }} ~ {{ card.windowEnd }} 已过）

    </template>
          <template v-else>
            建议接种时间 {{ card.windowStart }} ~ {{ card.windowEnd }}
          </template>
        </text>
      </view>

      <view v-if="expandedKind === card.key" class="kind-card__body">
        <!-- 老板 2026-10-12 的新方案：拆开成两张卡 ✓，但互相提示可以选联苗 ✓ -->
        <!-- 联苗提示（老板 2026-10-14）。
             ⚠️ 判据在后端：**重合那段窗口里有没有一支苗同时够龄顶两类** ✓。
             原来前端算的是"两张卡各自的推荐列表有没有交集" ✗ —— 会漏报：
             核心第 1 针在 6 周龄故意不推含钩端的苗，于是两边没交集，
             可等到 8 周龄两窗口重合时，那支联苗其实两边都够龄了。 -->
        <!-- 合并接种的提示**已经挪到两张卡中间**了（老板 2026-10-14）——
             不再在各自的卡里各说一遍（角度还不同，顾客要来回对照才能拼出意思）。 -->

        <!-- 老板 2026-10-12："合并后左侧的『免疫流程』字段为什么不见了？"
             —— 是我上一版把字段名换成了各自疫苗的名字 ✗（而且类别名太长 ✗，
                在窄窄的字段名列里折成四行 ✗）。
             现在：字段名固定「免疫流程」✓，疫苗类别放到**右边**的值里 ✓。 -->
        <view v-for="step in card.steps" :key="step.key" class="kv">
          <text class="kv__label">免疫流程</text>
          <view class="kv__value">
            <text>
              <template v-if="card.steps.length > 1">{{ step.kindLabel }} · </template>{{ step.label }}
            </text>
            <text v-if="card.steps.length > 1" class="kv__sub">
              建议接种时间 {{ step.windowStart }} ~ {{ step.windowEnd }}
            </text>
          </view>
        </view>
        <view v-if="card.steps[0].matchedRecordDate" class="kv">
          <text class="kv__label">接种时间</text>
          <text class="kv__value">{{ card.steps[0].matchedRecordDate }}</text>
        </view>
        <view v-if="card.products.length > 0" class="kv">
          <text class="kv__label">常见产品</text>
          <text class="kv__value">{{ card.products.join('、') }}</text>
        </view>
        <view class="kv">
          <text class="kv__label">依据</text>
          <view class="kv__value">
            <!--
              老板 2026-10-12 第 3 问："为什么这个建议板块能否直接做到依据说明文案的最后，
              而不是另起一行单独展开？并且展开之后会先重复依据的文案，这个能否也修改一下？"
              → 两处都改了 ✓：
                ① 「为什么这么建议？」紧跟在依据文字**末尾** ✓（不再另起一行 ✗）
                ② 展开后只显示**剩下的部分** ✓（`basisRestOf` 把开头那句已经显示过的去掉 ✓，
                   不再重复一遍 ✗）
              合并卡：两类各自的依据都显示 ✓（多行 ✓），按钮跟在最后一行末尾 ✓。
            -->
            <view class="basis__row">
              <!--
                ⚠️ 依据是**后端写的**，里面用 `**` 标出最关键的那句
                （如"一针核心疫苗即可"）。小程序的 <text> 不认 markdown，
                直接插值会把星号**原样显示**给顾客 ✗
                （老板 2026-10-14 截图里看出来的）。
                ⇒ 用 parseBold 切成几段、嵌套 <text> 渲染，关键的真的加粗 ✓。
              -->
              <text
                v-for="step in card.steps"
                :key="`basis-${step.key}`"
                class="basis__summary"
                :class="{ 'basis__summary--block': card.steps.length > 1 }"
              ><text
                  v-for="(seg, segIndex) in parseBold(basisSummaryOf(step))"
                  :key="`s-${segIndex}`"
                  :class="{ 'rich-bold': seg.bold }"
                >{{ seg.text }}</text></text>
              <!--
                ⚠️ 「更多 / 收起」的位置（老板 2026-10-14 第 4 条）。
                原来只有一个按钮、固定在短句后面 —— 展开之后它**夹在了段落中间** ✗：
                    依据  犬瘟、细小、腺病毒为必须接种的核心疫苗。
                          收起                    ← 夹在这儿
                          首次免疫从 6~8 周龄起，间隔 2~4 周…
                ⇒ 现在分两处放，各自都在**它该在的位置**：
                    · 收起状态 → 「更多」跟在短句后面 ✓（这时末尾就是短句）
                    · 展开状态 → 「收起」跟在**整段末尾** ✓
              -->
              <text
                v-if="hasMoreBasis(card.steps[0]) && !isBasisOpen(card.steps[0].key)"
                class="basis__more"
                @tap.stop="toggleBasis(card.steps[0].key)"
              >更多</text>
            </view>
            <text
              v-if="hasMoreBasis(card.steps[0]) && isBasisOpen(card.steps[0].key)"
              class="basis__full"
            ><text
                v-for="(seg, segIndex) in parseBold(basisRestOf(card.steps[0]))"
                :key="`f-${segIndex}`"
                :class="{ 'rich-bold': seg.bold }"
              >{{ seg.text }}</text></text>
            <text
              v-if="hasMoreBasis(card.steps[0]) && isBasisOpen(card.steps[0].key)"
              class="basis__more basis__more--end"
              @tap.stop="toggleBasis(card.steps[0].key)"
            >收起</text>
          </view>
        </view>

        <!--
          动作：① 去**现成的记录录入模块**记录这一针 ✓ ② 忽略 ✓
          ⚠️ 2026-10-12 老板指正 ✗：我一度在这里塞了一个"精简录入窗"✗ ——
             信息不够 ✓、不能从产品库选 ✓、名字也不会去产品库认分类 ✗，
             等于绕开了真正的那套录入 ✓。已撤掉 ✓，回到用现成的完整模块 ✓。
        -->
        <view class="step-actions">
          <text class="step-actions__primary" @tap.stop="recordCard(card)">记录接种信息</text>
          <text class="step-actions__ghost" @tap.stop="ignoreCard(card)">忽略</text>
        </view>

        <!--
          「新建卡」（2026-10-12 第三步）：就在**这张计划卡下面**展开录入窗口。

          ⚠️ 老板 2026-10-12 连着否掉/退回两次，这里把两次的教训都写下来：
            ① 我一度在这张卡里塞了个「精简录入窗」（只有名字+日期）—— 被否掉：
               信息不够、不能从产品库选、分类会按"点的是哪张卡"算错。
            ② 后来改成"收到下方记录板块去开"—— 老板截图退回：
               "它并未在核心疫苗这个窗口下方弹出，依然还是在接种记录板块的顶部弹出"。
          ⇒ 所以：**卡必须是同一张完整录入卡**（VaccineRecordCard），
            而且**必须画在这里**（计划卡内部），不是画到别的板块去。

          ⚠️ 数据与保存仍归**记录板块**（草稿只有一份）；这里只负责"画在哪"。
        -->
        <!--
          ⚠️⚠️ 两个坑都在这儿（老板连着两次截图报的"输入项不全"）：
            ① `expanded` 这个布尔 prop **不能写模板字面量** `:expanded="true"` ✗ ——
               小程序编译器会把**字面量 true 的属性整个丢掉**（编译后的属性表里没有它），
               卡片收不到值 → 布尔被强制成 false → **输入区整块不渲染**。
               必须绑**数据**（inline.expanded）。
            ② 卡片里 `expanded` 原来是 `type: Boolean` 且没有默认值 —— 同一个坑。
               已改成 `default: true`。
        -->
        <view v-if="inline && inline.open" class="plan-inline-editor">
          <!--
            ⚠️ 卡片**外面**再包一层做条件：不要把 v-if 写在组件上 ✗ ——
            在 v-for 里给组件加 v-if 时，小程序编译器会把 `wx:if` 和属性表
            `u-p` **共用同一个数据键**（都是 card.P），结果属性表整个传不进去 ✗
            （实测：渲染出来的 <vaccine-record-card> 一个属性都没有 ✓，
              卡片拿不到 record/draft → 输入区不渲染 ✗）。
          -->
          <view v-if="inline.open">
          <VaccineRecordCard
            :key="inline.cardKey"
            :record="inline.record"
            :index="-1"
            :draft="inline.draft"
            :toggle-label="inline.toggleLabel"
            :collapse-flag="inline.collapseFlag"
            :catalog-products="inline.catalogProducts"
            :component-options="inline.componentOptions"
            :saving="inline.saving"
            cancel-label="取消"
            :name-focused="inline.focused"
            :autofocus="false"
            :auto-save-text="''"
            :just-saved="false"
            :save-state-text="''"
            @update="(idx: number, field: any, value: string) => emit('inline-update', idx, field, value)"
            @save="emit('inline-save')"
            @name-blur="emit('inline-blur')"
            @toggle="emit('inline-toggle')"
            @remove="emit('inline-remove')"
            @cancel="emit('inline-close')"
          />
          </view>
        </view>
      </view>
    </view>
          <!-- ══ 合并接种：**窗口底部的说明**（老板 2026-10-14 选定方案 B）══════
         老板原话："我选方案B，但是需要把合并窗口顶部和底部的说明进行合并，
                   放在顶部，文案改为：……同时包含以上两类疫苗，
                   建议在'共同窗口期'期间完成接种。"

         ── 为什么不再用"中间一条提示"──────────────────────────────
         老板："用户很难通过中间这个板块联想到核心疫苗和钩端螺旋体这两个板块
                之间有什么关系。" —— 对：中间那条在视觉上自成一格，
         和上下两张卡是**并列**关系，不是**关联**关系。
         ⇒ 改成用**一个框把两张卡圈起来**：说明只在框顶一行，
           框底不再有任何东西。"关系"靠"同框"表达 ✓。

         ⚠️ 小程序模板没法跨 v-for 迭代真的套一个容器 ✗，
            所以框是**三段拼**的（见样式里的 combo-group__foot /
            kind-card--combo-first / kind-card--combo-second）✓。 -->
    <view v-if="card.comboRole === 'second'" class="combo-group__foot">
      <!-- 产品名后面**一律**补"等产品"（老板 2026-10-14 第二版）。
           ⚠️ 不再看"有没有截断" —— 老板的理由：
              "如果符合条件的恰好 3 只，也需要加，因为我们**不能假设产品库
               中的产品是完整的**。" ✓
           也就是说：这里的列表永远只是"举例"，产品库收没收全不重要 ✓。 -->
      <text class="combo-group__products"
        >{{ card.combo!.products.join('、') }}等产品</text
      >
      <text class="combo-group__desc">
        同时包含以上两类疫苗，建议在共同窗口期（{{ card.combo!.windowStart }} ~
        {{ card.combo!.windowEnd }}）期间完成接种。
      </text>
      <!--
        ⚠️ 老板 2026-10-14 第三问："用户在这种情况下，想要录入卫佳捌这种
           跨疫苗类型的产品的时候，应该从哪个入口进呢？"

        实情：从上面哪张卡进**都能正确记**（后端按病种推导分类，
        实测从核心卡录卫佳捌 → 记到 core + lepto ✓）。
        可顾客看到"这两类可以一起打"，本能就想**在这里**记录 ——
        这里没按钮的话，他得自己想到"退回上面某一张卡" ✗，认知上就断了 ✗。
        ⇒ 所以在说明下面给一个入口 ✓。
      -->
      <text class="combo-group__record" @tap.stop="recordCombo(card)">记录这一针</text>
    </view>

    </template>

    <!--
      ⚠️⚠️ 这里必须在**确认加载成功之后**才能说"都已完成" ✗（2026-10-12 老板截图为证）。
      原来只判断 kindCards 是否为空 ✗ —— 数据**还没到**时它也是空的 ✓，
      于是页面顶着「按现有记录，免疫程序里的项目都已完成」✗，
      而接口明明返回了 3 条待办 ✗（老板："怎么会在计划里面显示，
      所有的免疫程序都已经完成了呢？"）。
      现在三分支：
        · 还没加载出来 → 说"正在读取"（不替系统下结论 ✓）
        · 加载失败 → 由下面的 loadError 卡说话 ✓
        · 加载成功且确实没有待办 → 才说"都已完成"✓
    -->
    <text v-if="!loaded && !loadError" class="plan-steps__empty">正在读取接种计划…</text>
    <!--
      老板 2026-10-12："理论上来说，不可能会存在免疫程序已完成的这种状态吧。
      一只狗狗的免疫程序终身都需要进行吧？"
      —— 对 ✓：核心每 3 年一次加强、狂犬与钩端每年一次 ✓，
      免疫本来就是**终身**的事 ✓，不存在"全部完成"这个状态 ✗。
      所以这里不再下这种结论 ✓（真出现空列表时，那是数据显示异常 ✓，
      我们只如实说"暂时没有需要提醒的针"✓，由家长去记录板块核对 ✓）。
    -->
    <text v-else-if="loaded && kindCards.length === 0" class="plan-steps__empty">
      暂无待接种提醒。
    </text>
    <text v-if="ignoredCount > 0" class="plan-steps__restore" @tap="restoreIgnored">
      已忽略 {{ ignoredCount }} 项 · 点这里恢复
    </text>

    <!-- 记录与建议不一致：承载"这一针还没核对过""间隔不足一年"这类**安全提示** ✓ -->
    <view v-if="plan.conflicts.length > 0" class="health-card conflicts">
      <text class="conflicts__title">你的记录与建议不一致（{{ plan.conflicts.length }} 处）</text>
      <view v-for="item in plan.conflicts" :key="`${item.recordId}-${item.reason}`" class="conflict">
        <text class="conflict__head">{{ item.recordDate }} · {{ item.vaccineName }}</text>
        <text class="conflict__reason">{{ item.reason }}</text>
        <text class="conflict__suggestion">{{ item.suggestion }}</text>
      </view>
      <text class="conflicts__note">这只是提醒，不是结论。以你手上兽医给出的方案为准。</text>
    </view>

    <view v-if="loadError" class="health-card">
      <!-- 老板 2026-10-12："提示语是让我下拉刷新，但实际上小程序里好像并不支持这个功能吧。"
           —— 对 ✗：小程序页面没有下拉刷新 ✓，说了等于让顾客白试 ✓。
           现在只陈述事实 + 给一个真能用的动作 ✓（切走再回来会重新加载 ✓）。 -->
      <text class="plan-locked__title">接种计划没加载出来</text>
      <text class="plan-locked__desc">{{ loadError }}（切到别的书签再回来，会重新加载）</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { todayDateText } from '../../utils/date'
// ⚠️ 2026-10-12：撤回"精简录入窗"时我把这一行**一起删掉了** ✗ ——
// 可 load() 取计划数据正需要它 ✓ → 计划直接报错 ✓（老板截图："接种计划没加载出来"✓）。
// 删东西之前必须先确认"这个导入还有没有别的用处" ✗。
import { dogApi } from '../../api/dogs'
// 依据文案里 `**...**` 的解析（老板 2026-10-14 选方案 B：关键那句真的加粗）
import { parseBold } from './rich-text'
// 计划卡下面那张「新建卡」用的就是**记录模块的同一张卡**（2026-10-12 第三步）
import VaccineRecordCard from './VaccineRecordCard'
import {
  DEFAULT_HISTORY_LIMIT,
  buildFishboneRows,
} from '../../utils/vaccine-fishbone'

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
  /** 一句话版依据（后端下发；老后端没有就退回全文） */
  basisSummary?: string
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
   * 不同分类的疫苗不可以同一天接种，前后要隔开两三天。
   * 空字符串 = 这段时间没有别的针要打。
   *
   * （这句话的**用户可见版本**已按老板要求全部删除，见下面那行说明。）
   *
   * ⚠️ 2026-10-13：老板要求**不再提示这段文案** —— 卡片里那行展示已删除。
   *    字段与后端计算都保留（别处可能还要用），只是不再画在计划卡上。
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
   * 狗狗生日（2026-10-09 鱼骨图要用）。
   *
   * 只用来算两件事：鱼头上那句「今天 · 2026-10-09（3 岁 7 个月）」、
   * 以及年份分隔。**不参与任何计划判定** —— 判定全在后端。
   * 不传也能用（只是不显示月龄）。
   */
  birthday?: string
  /**
   * 已保存记录变化时由页面递增（2026-10-05）。
   *
   * 计划板块原来只在"换狗"时加载一次，顾客在原地录完几条它也不知道，
   * 于是停在"还没有记录"的状态、整块不显示。
   */
  dataVersion?: number
  /**
   * 计划卡下面那张「新建卡」的内容（2026-10-12 第三步）。
   *
   * 为什么由**记录板块**持有、这里只负责画：
   * 卡片的草稿、产品库、病种词表、保存与校验，全都归记录板块（一份）；
   * 计划这边只决定「画在哪」——就在这张计划卡下面。
   * 存两份草稿迟早对不上，这个项目已经吃过一次同样的亏。
   */
  inline?: {
    open: boolean
    cardKey: string
    record: any
    draft: any
    saving: boolean
    focused: boolean
    /** 开关文案：'收起' = 展开着；'展开' = 收着（字符串，别用布尔）*/
    toggleLabel: string
    collapseFlag: string
    catalogProducts: any[]
    componentOptions: { value: string; label: string }[]
  } | null
}>()

/**
 * 点某一步的「记录疫苗接种信息」时告诉页面：去开新增记录，并带上这一步的分类。
 *
 * 为什么交给页面：新增记录那块在另一个组件（VaccineManagementSection），
 * 页面同时握着两边的 ref，由它牵线最直接 —— 计划这边不越权去动记录列表。
 */
const emit = defineEmits<{
  (event: 'record-step', payload: { kinds: string[]; stepLabel: string }): void
  /** 把"每一类的下一针"报给页面 —— 顶部那条到期提醒用它（2026-10-07 老板定） */
  (event: 'pending-changed', pending: PlanPending[]): void
  /** 「新建卡」上的动作：转给**记录板块**执行（草稿与保存都归它）*/
  (event: 'inline-update', index: number, field: string, value: string): void
  (event: 'inline-save'): void
  (event: 'inline-close'): void
  /** 卡片上的「收起」（这张卡永远展开，收起 = 关掉它）*/
  (event: 'inline-toggle'): void
  /** 卡片上的「删除」（草稿还没存过，就是丢掉它）*/
  (event: 'inline-remove'): void
  (event: 'inline-blur'): void
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
  /*
   * 老板 2026-10-11：状态只留**两种** ✓（原来六个 ✗）——
   * "有多急"由**建议接种时间**那行字说 ✓（窗口过了会补一句"（窗口已过，建议尽快补）"✓）
   */
  DONE: '已完成',
  DUE: '待接种',
  UPCOMING: '待接种',
  OVERDUE: '待接种',
  SKIPPED: '不做',
}

/**
 * 把"每一类的下一针"报给页面（2026-10-07 老板拍板）。
 *
 * 背景：顶部那条"到期提醒"原来只看每条记录上**人工填的**「下次到期日」——
 * 顾客不填就没有提醒，填错了还会误导。老板定的是"**系统按程序自动算、
 * 与接种计划保持一致**"。计划在这一块里算，所以由它把结果报上去，
 * 记录板块那条提醒条就用这份数据，而不是各自去猜。
 */
interface PlanPending {
  key: string
  label: string
  kindLabel: string
  status: 'DUE' | 'OVERDUE' | 'UPCOMING'
  statusLabel: string
  windowStart: string
}

const loaded = ref(false)

/*
 * 依据的"一句话 + 展开全文"（2026-10-08 老板审计第 6 块）。
 * 摘要由后端下发（每一步都有），拿不到就退回全文（老后端兼容）。
 */
const openedBasisKeys = ref<Record<string, boolean>>({})

function basisSummaryOf(step: { key: string; basis: string; basisSummary?: string }): string {
  return String(step?.basisSummary || step?.basis || '')
}

/**
 * 展开后要显示的**剩下那段**（老板 2026-10-12 第 3 问）。
 *
 * 完整依据的开头就是界面上已经显示的那句"一句话依据" ✓ ——
 * 直接整段显示会**先说一遍同样的话** ✗。这里把那句去掉再显示 ✓。
 */
function basisRestOf(step: { basis: string; basisSummary?: string }): string {
  const summary = basisSummaryOf(step as never)
  const full = String(step.basis || '')
  return full.startsWith(summary) ? full.slice(summary.length) : full
}

function hasMoreBasis(step: { basis: string; basisSummary?: string }): boolean {
  const summary = String(step?.basisSummary || '')
  return Boolean(summary) && String(step?.basis || '') !== summary
}

function isBasisOpen(key: string): boolean {
  return Boolean(openedBasisKeys.value[String(key || '')])
}

function toggleBasis(key: string) {
  const id = String(key || '')
  if (!id) return
  const next = { ...openedBasisKeys.value }
  if (next[id]) delete next[id]
  else next[id] = true
  openedBasisKeys.value = next
}

/*
 * 「下一针」变了就轻轻闪一下（2026-10-08 老板审计第 4 块）。
 *
 * 家长改完一条记录（比如补上一个日期），计划会重算 —— 但界面上看不出来。
 * 闪一下是为了回答"我刚才那下改动，让计划前进了吗"，
 * 只在**这一针真的换了**的时候闪，第一次加载不闪（否则每次进页面都在闪）。
 */
const lastNextStepKey = ref('')
const flashNextStep = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null

function highlightNextStepIfChanged() {
  const key = String(nextStep.value?.key || '')
  if (lastNextStepKey.value && key && key !== lastNextStepKey.value) {
    flashNextStep.value = true
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      flashNextStep.value = false
    }, 3000)
  }
  lastNextStepKey.value = key
}
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
/*
 * ⚠️ 2026-10-11 老板定的口径变了：**零记录也要显示计划**。
 *
 * 老板拿 3 周龄、一条记录都没有的测试狗问：
 *   "为什么没有显示疫苗计划提醒，下一针应该接种的疫苗呢？"
 * —— 对。计划板块回答的就是"接下来该打什么、什么时候" ✓，
 * 它跟"有没有记录"本来就没关系 ✓（幼犬本来就该看到"6 周龄打第一针" ✓）。
 * 当初藏掉它是怕"什么记录都没有的狗，页面顶着 5 个已逾期" ✗ ——
 * 那个问题已经由 noEvidence 的**软措辞**解决了 ✓（说"还没记录"，不说"已逾期" ✓），
 * 不需要再整块藏 ✗。
 */
const sectionHidden = computed(() => planHidden.value)
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
/** 哪一类正展开着（一次只展开一张 ✓ —— 展开多张会把页面拉很长 ✗）*/
const expandedKind = ref('')
/** 「需要注意什么？」展开了哪一条合并提示（按卡片 key 记）*/
const comboNoteOpen = ref<Record<string, boolean>>({})
function toggleComboNote(key: string): void {
  comboNoteOpen.value = { ...comboNoteOpen.value, [key]: !comboNoteOpen.value[key] }
}

function toggleKind(kind: string) {
  expandedKind.value = expandedKind.value === kind ? '' : kind
}

/**
 * 收起所有卡片 ✓（2026-10-12）。
 *
 * 为什么需要它：家长在计划卡里点「记录接种信息」之后 ✓，
 * 录入草稿是在**下方的记录板块**里开的 ✓ —— 而计划卡张张展开时
 * 那块被顶到屏幕外 ✗，看起来就像"没点上"✗。
 * 把卡片收起 ✓，录入窗口自然就上到眼前 ✓（不依赖页面滚动 ✓，
 * 实测小程序里 pageScrollTo 到元素这条路不稳 ✗）。
 */
function collapseAll() {
  expandedKind.value = ''
}

/**
 * 卡片的「记录接种信息」✓：把这一类的分类带过去 ✓，
 * 交给**现成的记录录入模块**开一条草稿 ✓
 * （那里才有产品库、病种勾选、名字自动认分类 ✓ ——
 *   我那个"精简录入窗"已被老板否掉 ✗，撤掉了 ✓）。
 */
function recordCard(card: PlanCard) {
  emit('record-step', {
    kinds: card.kinds,
    stepLabel: card.steps.map((step) => step.label).join(' / '),
  })
}

/**
 * 合并窗口里的「记录这一针」（老板 2026-10-14 第三问）。
 *
 * 和 `recordCard` 只差一处，但这一处是关键：
 * **把两类都带上** ✓（`card.kind` + `card.combo.withKind`）——
 * 顾客是从"这两类一起打"这句话点进来的，预填就该是两类 ✓。
 *
 * ⚠️ 还要**先把这张卡展开** ✗→✓：
 *    录入窗口画在 `kind-card__body` 里，而 body 只在卡片展开时才渲染
 *    （`v-if="expandedKind === card.key"`）。不展开的话，
 *    点了按钮什么也看不见 ✗。
 */
function recordCombo(card: PlanCard) {
  if (!card.combo) return
  expandedKind.value = card.key
  emit('record-step', {
    kinds: [card.kind, card.combo.withKind],
    stepLabel: card.steps.map((step) => step.label).join(' / '),
  })
}

/**
 * 计划卡（2026-10-12 老板最终定的方案：**拆开，但互相提示**）
 *
 * 走过的弯路 ✗：先按"窗口重合就合并"✗ → 老板指出两个问题：
 *   ① "我们合并核心疫苗和钩端螺旋体，是因为在同一个产品中覆盖这两类。
 *      你说的三类合并依据是什么呢？"（→ 改成"必须有共同产品才合并"✓）
 *   ② "但是合并的话，就意味着我们给用户推荐的常用疫苗，不能再用四联核心疫苗了，
 *      因为它就不符合核心疫苗加钩端螺旋体的合并属性了。"
 *      —— 对 ✓：合并卡上只能推"两边都有的那支（联苗）"✗，
 *      纯核心的四联苗（卫佳伍 / 优免康）就不好出现了 ✗。
 *
 * 最终方案（老板提的 ✓）：**一类一张卡拆开** ✓，
 * 但两张卡**互相告诉对方**："也可以打含两类的联苗，一针覆盖" ✓。
 * 好处：纯核心苗与联苗**都在推荐里** ✓（用户自己选 ✓），
 *      而且**后端不用改** ✓（后端本来就是按类下发的 ✓）。
 */
interface PlanCard {
  key: string
  kinds: string[]
  title: string
  steps: PlanStep[]
  windowStart: string
  windowEnd: string
  products: string[]
  /** 固定展示位次（后端下发；越早该打的越靠上）*/
  order: number
  /**
   * 在"合并框"里的位置（老板 2026-10-14 选定方案 B）。
   *
   *   'first'  —— 合并框的第一张卡（框顶那行说明挂在它前面）
   *   'second' —— 合并框的第二张卡（底边收口）
   *   null     —— 不参与合并，照旧单独一张卡
   */
  comboRole: 'first' | 'second' | null
  /** 能与哪一类合并接种（后端算好的，含重合窗口与联苗名）*/
  combo: {
    withKind: string
    withLabel: string
    /** 能一支顶两类的产品名（后端**只列前面几个**，一律当"举例"看）*/
    products: string[]
    windowStart: string
    windowEnd: string
  } | null
}

/**
 * 两类窗口的**重合区间**（没有重合就返回空串 ✓）。
 *
 * 老板 2026-10-12 修正："不应该把它们窗口期小于 45 天作为给出提示的条件。
 * 我们是否将它们窗口期有重合的时候，才给出提示作为条件是否更合理呢？
 * 不然的话……如果核心疫苗被推迟太长时间，或者被提前太长时间，就不太好了。"
 * —— 对 ✓✓。原来我用"窗口起点相差 ≤45 天"✗，会出错：
 *    核心 10-12 起、钩端 11-22 起，相差 41 天 ✗（小于 45 ✓）→ 会提示"可以一起打"✗，
 *    可这两针**根本没有共同的合适日期** ✗。
 * 现在：**只有两类的建议接种时间真的重叠** ✓，才提示可以合并 ✓，
 * 并且把那几天直接写出来 ✓（"两针都合适的日期：11-22 ~ 12-06" ✓）。
 */
/**
 * 这张卡后面要不要放"合并接种"的提示条（老板 2026-10-14）。
 *
 * ⚠️ 只在**这一张卡的下一张就是它的合并对象**时返回那张卡 ✓ ——
 * 否则两张卡（核心、钩端）各插一次，又变成说两遍 ✗。
 */
function comboNoteAfter(card: PlanCard, index: number): PlanCard | null {
  if (!card.combo) return null
  const next = kindCards.value[index + 1]
  return next && next.key === card.combo.withKind ? next : null
}

/**
 * 把"两类各自的窗口 + 重叠段"算成三条时间条（老板 2026-10-14 第 1 条）。
 *
 * 每条给 left/width 的**百分比**，由模板用 inline style 画 ——
 * 这样顾客一眼就能看出"哪两针、重叠在哪一段" ✓，不用自己在脑子里对齐日期 ✗。
 *
 * ⚠️ 百分比必须按**同一个时间轴**算（两类的 min 起点 ~ max 终点）✓，
 *    各算各的会把两条画成一样长 ✗，重叠也就看不出来了 ✗。
 */
function comboChartRows(card: PlanCard): Array<{
  key: string
  label: string
  left: number
  width: number
  isOverlap: boolean
}> {
  const next = card.combo ? kindCards.value.find((item) => item.key === card.combo!.withKind) : null
  if (!card.combo || !next) return []

  const toTime = (text: string) => new Date(`${text}T00:00:00`).getTime()
  const day = 86400000
  const starts = [toTime(card.windowStart), toTime(next.windowStart)].filter((n) => !Number.isNaN(n))
  const ends = [toTime(card.windowEnd), toTime(next.windowEnd)].filter((n) => !Number.isNaN(n))
  if (starts.length === 0 || ends.length === 0) return []

  const min = Math.min(...starts)
  const max = Math.max(...ends)
  const span = max - min
  if (span <= 0) return []

  const bar = (start: string, end: string) => {
    const from = ((toTime(start) - min) / span) * 100
    const to = ((toTime(end) - min) / span) * 100
    return { left: Math.max(0, from), width: Math.max(6, to - from) }
  }

  return [
    { key: 'a', label: shortKindName(card.title), ...bar(card.windowStart, card.windowEnd), isOverlap: false },
    { key: 'b', label: shortKindName(next.title), ...bar(next.windowStart, next.windowEnd), isOverlap: false },
    {
      key: 'overlap',
      label: '重叠',
      ...bar(card.combo.windowStart, card.combo.windowEnd),
      isOverlap: true,
    },
  ]
}

/** 示意图的标签要**短**：把"核心疫苗（犬瘟、细小、腺病毒）"里的括号说明去掉 */
function shortKindName(title: string): string {
  return String(title || '').split('（')[0] || String(title || '')
}

/** 重合了几天（提示条上那句"有 N 天是重叠的"）*/
function overlapDays(card: PlanCard): number {
  if (!card.combo) return 0
  const start = new Date(`${card.combo.windowStart}T00:00:00`).getTime()
  const end = new Date(`${card.combo.windowEnd}T00:00:00`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000) + 1)
}

const kindCards = computed<PlanCard[]>(() => {
  return visibleSteps.value
    .filter((step) => step.status !== 'DONE')
    .slice()
    /*
     * 固定顺序（老板 2026-10-14）：按后端下发的 `order` 排 ✓ ——
     * 越早该打的越靠上（核心 6 周 → 钩端 8 周 → 狂犬 12 周）✓。
     * ⚠️ 原来按 `windowStart` 排 ✗：10 周龄的幼犬会变成"钩端→核心"✗、
     *    只打过核心的成年犬会变成"钩端→狂犬→核心"✗ ——
     *    于是"把合并提示放在核心与钩端中间"就没法稳定实现 ✗。
     */
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((step) => ({
      key: step.kind,
      kinds: [step.kind],
      title: step.kindLabel,
      steps: [step],
      windowStart: String(step.windowStart || ''),
      windowEnd: String(step.windowEnd || ''),
      products: stepProducts(step),
      combo: (step as never as { combo?: PlanCard['combo'] }).combo ?? null,
      order: Number((step as never as { order?: number }).order ?? 0),
      comboRole: null as PlanCard['comboRole'],
    }))
    .map((card, index, list) => {
      /*
       * 算出每张卡在"合并框"里的位置（老板 2026-10-14 方案 B）。
       *
       * ⚠️ 只在**下一张恰好是它的合并对象**时把两张标成一组 ✓ ——
       *    产品库里唯一的多联苗组合是「核心 + 钩端」✓，而卡片按固定顺序排 ✓，
       *    所以这一对永远相邻 ✓（"核心+狂犬""钩端+狂犬"都没有产品 ✓，
       *    不存在被夹开的情况 ✓）。
       */
      const next = list[index + 1]
      const role: PlanCard['comboRole'] =
        card.combo && next && card.combo.withKind === next.key ? 'first' : null
      return { ...card, comboRole: role }
    })
    .map((card, index, list) => {
      // 上一张是"框顶"的话，这一张就是"框底"（收口）
      const prev = list[index - 1]
      const isSecond = Boolean(prev && prev.comboRole === 'first')
      return isSecond ? { ...card, comboRole: 'second' as const } : card
    })
})

/** 卡片要挂的"合并框"样式类（框顶/框底各自对接，三段拼成一个连续的框）*/
function comboCardClass(card: PlanCard): Record<string, boolean> {
  return {
    'kind-card--combo-first': card.comboRole === 'first',
    'kind-card--combo-second': card.comboRole === 'second',
  }
}

/*
 * ── 卡内录入（老板 2026-10-12）────────────────────────────────────────
 *
 * 老板："不要提示，能不能做到在该条任务计划下展开录入窗口？
 *        保存后关闭并提示可在疫苗接种记录板块中查看。"
 *
 * 所以：点击 → **就在这张卡下面**展开录入 ✓（疫苗名 + 日期 ✓，
 * 类别按这张卡带过去 ✓，不用顾客再选一次 ✓）；
 * 保存 → 调同一套记录接口 ✓ → 收起 ✓ → 提示去下方记录板块查看 ✓。
 */
const editorKind = ref('')
const editorName = ref('')
const editorDate = ref('')
const editorSaving = ref(false)

/** 这一类的默认成分（后端按成分推导类别 ✓，缺了它记录进不了计划 ✗）*/
const KIND_COMPONENTS: Record<string, string[]> = {
  core_early: ['cdv', 'cpv'],
  core: ['cdv', 'cpv', 'cav'],
  lepto: ['lepto'],
  rabies: ['rabies'],
}

function openEditor(card: PlanCard) {
  editorKind.value = card.key
  editorName.value = ''
  editorDate.value = todayDateText()
  expandedKind.value = card.key
}

function closeEditor() {
  editorKind.value = ''
  editorName.value = ''
  editorSaving.value = false
}

/** 保存这一针 ✓（成功后收起 + 让页面刷新计划与记录 ✓）*/
async function saveInlineRecord(card: PlanCard) {
  if (editorSaving.value) return
  const name = editorName.value.trim()
  if (!name) {
    uni.showToast({ title: '请填写疫苗名称', icon: 'none' })
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(editorDate.value)) {
    uni.showToast({ title: '请选择接种日期', icon: 'none' })
    return
  }

  editorSaving.value = true
  try {
    const components = card.kinds.flatMap((kind) => KIND_COMPONENTS[kind] || [])
    const res: any = await dogApi.healthRecords.vaccine.create(props.dogId, {
      vaccineName: name,
      vaccinationDate: editorDate.value,
      status: 'COMPLETED',
      notes: null,
      components,
      kinds: card.kinds,
      productVerified: true,
    } as never)
    if (res && res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }
    closeEditor()
    uni.showToast({ title: '已保存，可在下方接种记录中查看', icon: 'none', duration: 2200 })
    await load()
    emit('record-saved')
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('[疫苗计划] 保存记录失败：', error?.message || error)
    uni.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
  } finally {
    editorSaving.value = false
  }
}

/** 合并卡的「忽略」：这一类一类地忽略 ✓（每一类各自存一条决定 ✓）*/
function ignoreCard(card: PlanCard) {
  const labels = card.steps.map((step) => step.label).join('、')
  uni.showModal({
    title: card.kinds.length > 1 ? '忽略这几步？' : '忽略这一步？',
    content: `忽略后「${labels}」会从这只狗狗的接种计划里去掉，不再提醒。计划底部随时可以恢复。`,
    confirmText: '忽略',
    cancelText: '保留',
    success: (result) => {
      if (!result.confirm) return
      for (const step of card.steps) {
        void decide(step.key, 'SKIP')
      }
    },
  })
}

/**
 * 计划列表：按建议接种时间**由近到远**（老板 2026-10-06 的明确要求），
 * 并且把顾客忽略掉的步骤去掉。
 *
 * 忽略 = 存一个 SKIP 决定（后端一直支持，只是原来只影响"下一步"的选择，
 * 步骤本身还留在列表里）。老板要的是"从计划里去掉"，所以在展示层过滤掉；
 * 库里那条决定留着，所以随时能恢复（见 restoreIgnored）。
 */
/**
 * 鱼骨图的节点（2026-10-09）。
 *
 * 排序规则全在 utils/vaccine-fishbone.ts 里（纯函数）：历史按**实际接种日**、
 * 待做的按窗口起点但不早于今天（逾期的"该补了"落在"今天"这一格）、
 * 长历史默认折叠最近 3 条。
 */
const todayText = computed(() => todayDateText())

const showAllHistory = ref(false)

const fishboneLayout = computed(() =>
  buildFishboneRows(visibleSteps.value, {
    today: todayText.value,
    historyLimit: showAllHistory.value ? 0 : DEFAULT_HISTORY_LIMIT,
  }),
)

const fishboneNodes = computed(() => fishboneLayout.value.nodes)
const todayIndex = computed(() => fishboneLayout.value.todayIndex)
/**
 * 历史折叠的入口**不再需要**（2026-10-10 老板定）：鱼骨图里已经没有已完成的步骤 ✓，
 * 所以这里恒为 0，那块"展开全部历史"自然不显示 ✓（留着这个 computed 只是因为
 * 布局函数还会回它一个值，删掉反而要动布局的返回结构）。
 */
const hiddenHistoryCount = computed(() => fishboneLayout.value.hiddenHistoryCount)

/** 日期只显示"月-日"（年份由分隔标签负责，背骨那一列要窄） */
function shortDate(dateText: string): string {
  return String(dateText || '').slice(5)
}

/**
 * 「今天 · …（3 岁 7 个月）」里那段月龄。
 *
 * 生日没传、或者日期不合法时返回空 —— 宁可不显示，也不要显示错的月份。
 */
const ageText = computed(() => {
  const birthday = String(props.birthday || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return ''
  const today = todayText.value
  const [by, bm, bd] = birthday.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (!by || !bm || !ty || !tm) return ''

  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months -= 1
  if (months < 0) return ''

  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years <= 0) return `${Math.max(1, rest)} 个月`
  return rest > 0 ? `${years} 岁 ${rest} 个月` : `${years} 岁`
})

/**
 * 这一类用哪个颜色（只用于背骨圆点和分类名）。
 *
 * ⚠️ 与**状态色**分工不同：状态色（该打了/该补了/已完成）还是原来那套徽标色，
 *    这里只回答"这是哪一类"。两套颜色不要混用。
 */
const KIND_COLORS: Record<string, string> = {
  core: '#0f7b49',
  core_early: '#e6a23c',
  rabies: '#c0392b',
  lepto: '#216d9b',
  other: '#9a9a9a',
}

function kindColor(kind: string): string {
  return KIND_COLORS[String(kind || '')] || KIND_COLORS.other
}

/**
 * 计划里**要显示**的那些步骤：去掉顾客忽略的，以及"同一类前面还有没做完的"那些。
 *
 * 老板 2026-10-06："狂犬疫苗第 4 次显示已逾期，但为什么待安排的狂犬疫苗却显示是
 * 第 5 次呢？" —— 第 4 次没做完就不该把第 5 次摆出来，那会让人以为可以跳到明年。
 * （后端已经把"每一类只留一条下一针"，这里是第二道保险。）
 */
const visibleSteps = computed(() => {
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
   * ⚠️ 这里**不再排序**（2026-10-09 改成鱼骨图）。
   *    老列表的口径是"未完成在前、已完成沉底"，那是**列表**的读法；
   *    鱼骨图的背骨本身就是时间轴，顺序由 utils/vaccine-fishbone.ts 按日期算，
   *    这里只负责"哪些该出现"。
   */

  /*
   * ⚠️ **已经打过的一律不在这里出现**（2026-10-10 老板定）。
   *
   * 老板："疫苗接种计划这个板块目的是为了让用户知道接下来该打哪些疫苗、
   *        该什么时候打。我怎么感觉鱼骨图也把过去的记录一并展示了呢？
   *        这个难道不应该是鱼骨图下方的疫苗记录板块该做的事情吗？"
   * —— 对。"计划"只回答"接下来打什么 ✓"，"打过什么"交给下方的接种记录板块 ✓。
   * 计划本身也已经保证"每一类只出一针待办" ✓（见上面 blocked 那段），
   * 所以这里把 DONE 滤掉之后，结果就是**每一类最多一条** ✓。
   */
  return ordered.filter(
    (step) => !blocked.has(step.key) && step.status !== 'DONE',
  )
})

/**
 * 窗口**早就过去了**的话，在窗口后面补一句（2026-10-10 老板问的）。
 *
 * 老板："在计划的鱼头，为什么还会出现过去的时间窗口期呢？"
 * —— 那一步是"首年程序里没记录"的欠账（例如 26 周龄补强，窗口 2023-08 ✓），
 * 计划里保留它是**诚实**的 ✓，但只甩一个 2023 的日期会让人以为系统坏了 ✗。
 * 所以补一句「（窗口已过，建议尽快补）」✓ —— 不改数据，只把话说全 ✓。
 * 阈值取 90 天：还在窗口内、或刚过一点点，都不算"早就过去" ✓。
 */
/**
 * 这一针的窗口是不是已经过去了（老板 2026-10-12 第 1、2 问）。
 *
 * 老板："并没有『窗口已过，建议尽快补』的提示" ✗
 *      "我记得我们之前说过，疫苗计划中不应该有过去时间窗口的计划。为什么会出现这个问题呢？"
 * —— 对 ✓。原来那句话只在**窗口结束超过 90 天**时才显示 ✗
 *    （测49 的核心窗口 9-13 结束，到 10-12 才 29 天 ✗ → 什么都没说 ✓，
 *     而卡片上却明晃晃摆着一个已经过去的日期区间 ✗）。
 * 现在：**只要窗口结束日已过** ✓，就改说「尽快补种」✓，
 * 过去的日期只作为括号里的出处保留 ✓（不再当"计划"摆着 ✓）。
 */
function isWindowPassed(step: { windowEnd?: string } | null | undefined): boolean {
  const end = String(step?.windowEnd || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false
  // ⚠️ 用**这个组件里真有**的日期函数 ✗→✓
  // （2026-10-12：我在这里写了 getTodayDateString() ✗ —— 那是**记录板块**里的别名 ✓，
  //   计划板块没有它 ✗ → 渲染时抛 "getTodayDateString is not defined" ✗ →
  //   计划永远停在"正在读取"✗，而这个错误只躺在控制台里 ✓，界面上完全看不出来 ✗。）
  return end < todayDateText()
}

function windowPassedSuffix(step: { windowEnd?: string } | null | undefined): string {
  const end = String(step?.windowEnd || '').slice(0, 10)
  if (!end) return ''
  const endMs = Date.parse(`${end}T00:00:00`)
  if (Number.isNaN(endMs)) return ''
  const passedDays = Math.floor((Date.now() - endMs) / 86400000)
  return passedDays > 90 ? '（窗口已过，建议尽快补）' : ''
}

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

/**
 * 正在为哪只狗加载计划（2026-10-12）。
 *
 * 为什么要有它 ✗→✓：老板实测计划板块一直"正在读取"✗，
 * 生产日志里同一个请求每 1~2 秒重发一次 ✓。原因之一是**重复触发**：
 * 每次重发都会把 loaded 置回 false ✓，于是界面永远落不了定 ✗。
 * 现在：同一条狗的请求在飞的时候，后来的触发直接跳过 ✓。
 */
let loadingDogId = ''

/**
 * 最近一次**成功**的计划响应（按狗狗缓存 ✓，带很短的保鲜期 ✓）。
 *
 * 为什么需要它 ✗→✓：生产日志显示计划请求是**同一秒内一次发 5 条** ✗ ——
 * 说明页面里同时活着好几个计划板块实例 ✓（每个实例都会自己发一次 ✓），
 * 单实例里的"在飞守卫"挡不住它们 ✗。
 * 这里把响应按狗缓存 20 秒 ✓：第二个及以后的实例直接用缓存 ✓，
 * 不再重复请求 ✓，界面也不会再停在"正在读取"✓。
 * （20 秒是刻意的短保鲜期 ✓：家长刚记完一针要立刻看到计划变化 ✓，
 *   所以不能长 ✓；而同一屏渲染出来的那几条并发请求会被它吃干净 ✓。）
 */
const planCache = new Map<string, { at: number; data: any }>()
const PLAN_CACHE_TTL_MS = 20 * 1000

/** 把后端下发的计划装进本地状态 ✓（正常请求与缓存命中共用同一段装配 ✓）*/
function applyPlanResponse(data: any) {
  plan.value = {
    // 后端已经把 commonProducts 放在每一步里了，整条透传
    nextStep: data.nextStep || null,
    steps: Array.isArray(data.steps) ? data.steps : [],
    conflicts: Array.isArray(data.conflicts) ? data.conflicts : [],
    decisions: data.decisions || {},
    summary: data.summary || {},
    reviewed: data.reviewed === true,
    noRecordAtAll: data.noRecordAtAll === true,
    noEvidence: data.noEvidence === true,
  }
}

async function load() {
  if (!props.dogId) {
    return
  }

  // 同一条狗、上一次还没回来 → 不重复发 ✗（换狗不受影响 ✓）
  if (loadingDogId === props.dogId) {
    return
  }
  loadingDogId = props.dogId

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

  // 短缓存命中 → 直接用 ✓（同一屏里的并发实例全靠它兜住 ✓）
  const cached = planCache.get(props.dogId)
  if (cached && Date.now() - cached.at < PLAN_CACHE_TTL_MS) {
    applyPlanResponse(cached.data)
    loadingDogId = ''
    return
  }

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

    applyPlanResponse(res.data)
    planCache.set(props.dogId, { at: Date.now(), data: res.data })
    loaded.value = true
    highlightNextStepIfChanged()
    // 把"每一类的下一针"报给页面 —— 顶部那条到期提醒要用它（2026-10-07）
    emit(
      'pending-changed',
      (plan.value.steps || [])
        .filter((step) => step.status !== 'DONE' && step.status !== 'SKIPPED')
        .map((step) => ({
          key: step.key,
          label: step.label,
          kindLabel: step.kindLabel,
          status: step.status as PlanPending['status'],
          statusLabel: step.statusLabel || '',
          windowStart: step.windowStart,
        })),
    )
  } catch (error: any) {
    /*
     * ⚠️ 2026-10-12 老板截图：卡片上出现了「applyPlanResponse is not defined」✗ ——
     * 把技术报错原文甩给顾客 ✗，而且那句话对他毫无意义 ✓。
     * 现在：界面只说人话 ✓，技术原文打到控制台 ✓（我们排查用 ✓）。
     */
    loadError.value = '请稍后重试'
    // eslint-disable-next-line no-console
    console.error('[疫苗计划] 加载失败：', error?.message || error)
  } finally {
    // 无论成败都要放开守卫 ✓，否则这只狗再也不会重新加载 ✗
    if (loadingDogId === props.dogId) {
      loadingDogId = ''
    }
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
/*
 * ⚠️⚠️ 2026-10-12：这里原来 watch 的是一个**数组** `[props.dogId, props.dataVersion]` ✗。
 * 老板实测：计划板块一直停在"正在读取接种计划…"✗ ——
 * 生产日志显示计划请求**每 1~2 秒重发一次**（每次都 200 ✓，但界面永远没落定 ✗）。
 * 现在：只监听**狗狗本身** ✓，并且**同一条狗正在加载时不重复发** ✓
 * （见 load() 里的 loadingDogId 守卫 ✓）—— 不管是谁在反复触发，都不会再打转 ✓。
 */
watch(() => props.dogId, load, { immediate: true })

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
defineExpose({
  collapseAll, reload: () => load() })
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

/* 常见产品（2026-10-04）：比"依据"显眼一点，比正文轻一点 */
.next-step__products {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
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
/* ── 计划卡内部的「新建卡」外框（2026-10-12 第三步）──────────────────
   老板要的：点「记录接种信息」→ 就在**这张计划卡下面**展开录入窗口 ✓。
   所以它长在这里 ✓（不是长到下面记录板块的顶部去 ✗）。
   ⚠️ 小程序组件的 wxss 不允许标签选择器 ✓，只用类名 ✓。 */
.plan-inline-editor {
  margin-top: 16rpx;
  padding: 16rpx 18rpx 8rpx;
  border-radius: 16rpx;
  background: #f7faf8;
  border: 1rpx solid #dfe9e2;
}

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

/* 计划列表 */
.step {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #eef1e8;
}

/*
 * ⚠️ 这里原来有一条页面底部的说明文案（"…还在做专业审核，暂不对顾客开放…"）。
 * 2026-10-06 老板："这句话删除掉。同时看一下后端是否有什么卡点，也请取消，
 * 我们现在就按审核通过的标准部署。" —— 前端这句和后端那个
 * VACCINE_PLAN 开关一起取消了，样式也一并删干净。
 */

/* 记录改了、计划跟着变了 —— 轻轻闪一下（2026-10-08） */
.plan-card__head--flash {
  animation: plan-flash 1.2s ease-in-out 2;
}
@keyframes plan-flash {
  0% { background-color: transparent; }
  50% { background-color: #eef8f2; }
  100% { background-color: transparent; }
}

/* 依据：一句话 + 「为什么这么建议？」展开（2026-10-08） */
.basis__row {
  display: block;
}
.basis__summary {
  display: inline;
  display: block;
  font-size: 24rpx;
  color: #333333;
}
.basis__summary--block {
  display: block;
}
.basis__more {
  display: inline-block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #0f7b49;
}

/* 展开后的「收起」：跟在整段末尾（不再是段落中间）*/
.basis__more--end {
  display: block;
  margin-top: 4rpx;
}
/* `**...**` 里那一句 —— 真的加粗（老板 2026-10-14 选方案 B）*/
.rich-bold {
  font-weight: 700;
  color: #1e3a2f;
}

.basis__full {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #7a7a7a;
  line-height: 1.6;
}

/* ── 竖版鱼骨图（2026-10-09 老板定）────────────────────────────────────
   背骨自上而下是时间；每一针一个节点，从背骨斜着长出一张分支卡片；
   今天是一条贯穿虚线；下一针那一条高亮。布局算在 utils/vaccine-fishbone.ts。 */
.fishbone {
  margin-top: 12rpx;
}

/* 鱼头：今天 + 要打哪一类 */
/* 鱼骨图相关样式已随 2026-10-11 改版删除 ✓（纯函数 utils/vaccine-fishbone.ts 保留，仍有自己的单测 ✓） */

/* ══════════════════════════════════════════════════════════════════════
   疫苗接种计划 · 视觉（2026-10-12 老板："UI 太简陋了"）

   口径：**计划 = 绿色系** ✓、**记录 = 紫色系** ✓（那个板块在另一个文件里）
   —— 两个板块放在同一页，颜色就是最省事的区分 ✓。
   ⚠️ 上一版我把卡片样式跟鱼骨图样式一起删掉了 ✗，所以页面上是一堆裸文字 ✓
      （老板截图看出来的 ✓）—— 这次连注释一起留下，别再被顺手删掉 ✓。
   ══════════════════════════════════════════════════════════════════════ */
.vaccine-plan {
  margin: 20rpx 0 0;
  padding: 24rpx 22rpx 18rpx;
  border-radius: 18rpx;
  background: linear-gradient(180deg, #f2faf5 0%, #ffffff 46%);
  border: 1rpx solid #d5e9dd;
}

.plan-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 0 2rpx 4rpx;
}
.plan-head__bar {
  width: 8rpx;
  height: 30rpx;
  border-radius: 4rpx;
  background: #0f7b49;
}
.plan-head__title {
  font-size: 32rpx;
  font-weight: 700;
  color: #12503a;
}
.kind-card {
  margin-top: 16rpx;
  border-radius: 14rpx;
  background: #ffffff;
  border: 1rpx solid #e2efe7;
  box-shadow: 0 2rpx 10rpx rgba(15, 123, 73, 0.06);
  overflow: hidden;
}

/* ══ 合并接种：分组框（老板 2026-10-14 选定方案 B）════════════════════════
   用**一个框**把"能一起打的两针"圈起来 —— 关系靠"同框"表达，
   不再靠在两张卡中间插一段解释（那样它自成一格，顾客不会往两边联想）。

   ⚠️ 小程序模板没法跨 v-for 迭代真的套一个容器，
      所以框是**三段拼**的，边框与圆角逐段对接：
        ① .combo-group__head       框顶（说明）+ 上圆角
        ② .kind-card--combo-first  第一张卡：去掉上边框与圆角
        ③ .kind-card--combo-second 第二张卡：去掉上边框，收下圆角
      三段同色、边框连续，看起来就是**一个框**。 */
/* 说明块现在在窗口**最下方**（老板 2026-10-14 第二轮要求）——
   圆角与边框方向跟着反过来：上边开口、下边收口。 */
.combo-group__foot {
  /*
   * ⚠️⚠️ **不要**给这里写 `width`（踩过）。
   *
   * 实测（扫截图像素）：说明块**只有左边框、右边框被裁在屏幕外** ✗。
   * 原因是加过 `width: 100%` —— 宽度按容器的 100% 算，**再加上**左右
   * padding 与边框，整块就比容器宽 ✗（`box-sizing: border-box` 也没压住）。
   *
   * 正确做法：**什么都不写** —— 父容器是 flex column、
   * `align-items` 默认 stretch，说明块会像卡片一样自动撑满 ✓。
   */
  margin-top: 16rpx;
  padding: 16rpx 18rpx 14rpx;
  /* 明显的绿边（2rpx 在手机上细得几乎看不见，那就还是"没封口" ✗）*/
  border: 4rpx solid #7fb08f;
  /* 上边开口：和它上面那张卡接上 */
  border-top: none;
  border-radius: 0 0 16rpx 16rpx;
  /* 比上面两行深一档 —— 读起来像"这个窗口的说明区" */
  background: #dcefe4;
  /* ⚠️ 它上面是第二张卡，被父容器 gap 撑开 —— 必须用负 margin 拉回来，
     否则窗口又在这里裂开（2026-10-14 踩过一次）。数值要和
     `.health-section` 的 gap 保持一致（有测试钉着）。 */
  margin-top: -24rpx !important;
}

/* 产品名：顾客真正要去认的那一行，给足分量（老板要"放在顶部"的那段）*/
.combo-group__products {
  display: block;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 1.55;
  color: #17603f;
}

/* 说明：紧跟在产品名下面（老板的文案，一字未改）*/
.combo-group__desc {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  line-height: 1.65;
  color: #3f5a4a;
}


.kind-card__head {
  position: relative;
  padding: 22rpx 24rpx 22rpx 28rpx;
}
/* 左边那道绿色竖条：一眼看出"这是计划里的哪一类" ✓ */
.kind-card__head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20rpx;
  bottom: 20rpx;
  width: 8rpx;
  border-radius: 0 6rpx 6rpx 0;
  background: #0f7b49;
}
.kind-card__line {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.kind-card__kind {
  font-size: 31rpx;
  font-weight: 600;
  color: #14352a;
}
.kind-card__badge {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #0f7b49;
  background: #e7f5ec;
  border: 1rpx solid #c9e7d5;
}
.kind-card__badge--DONE {
  color: #6b7a70;
  background: #f0f3f1;
  border-color: #e0e6e2;
}
.kind-card__toggle {
  margin-left: auto;
  font-size: 24rpx;
  color: #0f7b49;
}
.kind-card__time {
  display: block;
  margin-top: 10rpx;
  font-size: 25rpx;
  color: #5c6b62;
}
.kind-card__body {
  padding: 6rpx 24rpx 22rpx;
  border-top: 1rpx solid #eef4f0;
  background: #fbfdfc;
}

/* ══ 每类一张简卡（2026-10-11 改版；2026-10-12 加合并说明）══
   ⚠️ 上一版这些样式跟鱼骨图样式一起被删掉过 ✗（页面变成一堆裸文字 ✓）——
      这次连注释留着，别再顺手删掉 ✓。 */
.vaccine-plan {
  margin: 20rpx 0 0;
  padding: 24rpx 22rpx 18rpx;
  border-radius: 18rpx;
  background: linear-gradient(180deg, #f2faf5 0%, #ffffff 46%);
  border: 1rpx solid #d5e9dd;
}
.plan-head { display: flex; align-items: center; gap: 12rpx; padding: 0 2rpx 4rpx; }
.plan-head__bar { width: 8rpx; height: 30rpx; border-radius: 4rpx; background: #0f7b49; }
.kind-card {
  margin-top: 16rpx;
  border-radius: 14rpx;
  background: #ffffff;
  border: 1rpx solid #e2efe7;
  box-shadow: 0 2rpx 10rpx rgba(15, 123, 73, 0.06);
  overflow: hidden;
}
.kind-card__head { position: relative; padding: 22rpx 24rpx 22rpx 28rpx; }
.kind-card__head::before {
  content: '';
  position: absolute;
  left: 0; top: 20rpx; bottom: 20rpx;
  width: 8rpx;
  border-radius: 0 6rpx 6rpx 0;
  background: #0f7b49;
}
.kind-card__top { display: flex; align-items: center; margin-bottom: 10rpx; }
.kind-card__kind { display: block; font-size: 31rpx; font-weight: 600; color: #14352a; line-height: 1.4; }
.kind-card__badge {
  padding: 3rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #0f7b49;
  background: #e7f5ec;
  border: 1rpx solid #c9e7d5;
}
.kind-card__badge--DONE { color: #6b7a70; background: #f0f3f1; border-color: #e0e6e2; }
.kind-card__toggle { margin-left: auto; font-size: 24rpx; color: #0f7b49; }
.kind-card__time { display: block; margin-top: 10rpx; font-size: 25rpx; color: #5c6b62; }
.kind-card__body { padding: 6rpx 24rpx 22rpx; border-top: 1rpx solid #eef4f0; background: #fbfdfc; }
.kv__sub {
  display: block;
  margin-top: 4rpx;
  font-size: 23rpx;
  color: #8a9a92;
}

.merge-note {
  display: block;
  margin: 10rpx 0 16rpx;
  padding: 14rpx 16rpx;
  border-radius: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #12603f;
  background: #eef9f2;
  border: 1rpx solid #d2ecdc;
}

/*
 * ⚠️⚠️ 选择器必须写成 `.kind-card.kind-card--combo-*`（两个类）✗→✓。
 *
 * 只写一个类时**被 .kind-card 覆盖了** —— 两者权重相同（都是"一个自己的类
 * + scoped 的 data-v 属性"），而 `.kind-card` 在样式表里定义得更靠后 ✗：
 * 界面上仍是白卡 + 淡边，只有一条浅边在连，肉眼看不出是一个窗口 ✗
 * （老板 2026-10-14 一眼看出来的就是这个问题）。
 *
 * ── 老板的第二轮意见（"要么有 bug，要么太保守"）之后又改了三处 ────────
 * 原来组内的卡和外面那张狂犬卡**用了同一套样式**（白底 + 淡边 + 圆角 + 阴影）✗，
 * 那它们当然看着一模一样。现在：
 *   ① 组内**不再是"卡片"**，而是这个窗口里的**两行** ——
 *      去白底、去阴影、去圆角，只留左右边框（露出窗口的绿底）
 *   ② 边框用**明显的绿** #7fb08f（不是原来那条淡淡的 #b9dbc8）
 *   ③ 两行之间用一条分隔线（窗口内部的层次，不是两个独立块）
 *   ④ 狂犬卡照旧是白卡 ✓ —— 于是"成组"和"单条"一眼分得开
 */
.kind-card.kind-card--combo-first,
.kind-card.kind-card--combo-second {
  /*
   * ⚠️⚠️ 这里必须用**负 margin 抵消父容器的 gap** ✗→✓。
   *
   * 踩坑记录（老板 2026-10-14："这3个部分的边框进行封口"）：
   * 头部与两行之间**一直有一条白缝**，窗口左右两条边在那里断开 ✗。
   * 我先后试过 `margin-top: 0`、`margin: 0 !important`、给头部 `margin-bottom: 0`
   * —— **全都没用** ✗，因为那条缝根本不是 margin：
   *
   *     `.health-section { display: flex; flex-direction: column; gap: 24rpx; }`
   *
   * 头部和两张卡都是它的**子元素**，被 **gap: 24rpx** 撑开 ✗。
   * gap 不是 margin，归零 margin 动不了它 ✓。
   *
   * ⇒ 只能把 gap **拉回来**：`margin-top: -24rpx`。
   * ⚠️ 这个数字**必须和 .health-section 的 gap 保持一致** ——
   *    哪天 gap 改了，这里也要跟着改（有条测试钉着这个 24rpx）。
   */
  margin-top: -24rpx !important;
  margin-bottom: 0;
  border-radius: 0;
  box-shadow: none;
  border-top: none;
  border-bottom: none;
  /*
   * ⚠️⚠️ 绿底必须**显式写出来** ✗→✓。
   *
   * 我第一版写的是 `background: transparent`（想"露出窗口的绿底"）——
   * 可**窗口的绿底根本没画在任何元素上** ✗：透明的结果是露出
   * 板块自己的白底（`.health-section` 的渐变），看起来还是两张白卡 ✗
   * （老板说的"没封口"就包含这一条）。
   */
  background: #e9f5ee;
  /* 窗口的左右两条边（三段拼里的中间段 / 收口段）*/
  border-left: 4rpx solid #7fb08f;
  border-right: 4rpx solid #7fb08f;
}

/* 合并窗口里的"记录这一针"：和卡片里的主按钮同款，
   因为**动作确实是同一个**（只是预填了两类）——样式不同反而让人以为是两回事 ✗。 */
.combo-group__record {
  display: block;
  margin-top: 14rpx;
  padding: 16rpx 0;
  font-size: 24rpx;
  font-weight: 600;
  text-align: center;
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  border-radius: 14rpx;
}

/* 第一行：窗口的**顶部**（上边框 + 上圆角），下边留给分隔线 */
.kind-card.kind-card--combo-first {
  border-top: 4rpx solid #7fb08f;
  border-radius: 16rpx 16rpx 0 0;
  /* ⚠️ 它上面是**别的卡**（之间有 gap 是对的），所以这里不抵消 ✓ */
  margin-top: 0 !important;
}

/* 第二行：窗口的**中间段** —— 下边是分隔线（说明块接在它下面），不收口 */
.kind-card.kind-card--combo-second {
  border-bottom: 2rpx solid #c3e2d0;
  border-radius: 0;
}

/*
 * 展开后的内容也跟着走绿底 —— 否则会在窗口里露出一块白 ✗。
 * （卡片组件本身是共用的，这里只覆盖"在窗口里"的那两张。）
 */
.kind-card.kind-card--combo-first .kind-card__body,
.kind-card.kind-card--combo-second .kind-card__body {
  background: #e9f5ee;
  border-top-color: #c3e2d0;
}
</style>
