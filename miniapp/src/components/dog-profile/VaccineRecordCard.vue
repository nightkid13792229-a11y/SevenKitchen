<template>
  <!--
    ══ 一条接种记录的**编辑卡**（2026-10-12 第一步：从 VaccineManagementSection 抽出来）══

    ⚠️ 这一步**只搬家、不改行为** ✓ —— 模板与样式逐行照抄 ✓，
    连"为什么是这样"的注释都原样带过来 ✓（丢了下一次改的人要再走一遍弯路 ✗）。

    搬过来的：
      · 卡片脸（名字 / 状态 / 「待核对」徽标 / 删除 / 展开收起）
      · 展开后的表单（疫苗名称 + 产品库 / 接种日期 / 含哪些疫苗 / 备注）
      · 只管这一张卡的临时状态（正在匹配 / 确认结果 / 病种选择器开没开 ✓）

    留在 VaccineManagementSection.vue 的（第一步不动 ✗）：
      · 记录列表本身（v-for / 排序 / 空态 / 加载失败 ✓）
      · 扫描入口与整批识别回执 ✓
      · **整表自动保存**（草稿 + 定时器 + 校验 + 保存状态 ✓）——
        卡片改 `props.draft` ✓、再通过 `emits.update` 让父组件排保存 ✓
      · 附件上传 / 疫苗本原件 / 核对状态 ✓
  -->
  <view
class="vaccine-card"
:class="{ [`vaccine-card--focus-${index}`]: true }"
  >
  <view class="vaccine-card__header" @tap="emit('toggle', index)">
    <view class="vaccine-card__summary">
      <view class="vaccine-card__title-row">
        <text class="vaccine-card__name">{{ draft.vaccineName || '未填疫苗名' }}</text>
        <text class="vaccine-card__status" :class="statusClass(draft)">
          {{ statusLabel(draft.status) }}
        </text>
        <!-- 待核对（2026-10-09 安全默认值）：识别出来、但我们不敢打包票的那一针 -->
        <text v-if="draft.productVerified === false" class="vaccine-card__pending">
          待核对
        </text>
      </view>
      <text class="vaccine-card__detail">
        接种 {{ draft.vaccinationDate || '未填日期' }}
      </text>
      <!-- 到期提示**不在卡片脸上显示**（2026-10-08 老板定）。
           疫苗本上写的"下次时间"仍然在展开后能看能改，
           但不必让每条记录都挂一句 —— 顶部那条提醒已经按接种计划算好了。 -->
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
        @tap.stop="emit('remove', index)"
      >删除</text>
      <text class="vaccine-card__toggle" @tap.stop="emit('toggle', index)">
        {{ expanded ? '收起' : '展开' }}
      </text>
    </view>
  </view>

  <view v-if="expanded" class="vaccine-card__body">
    <!-- 疫苗名称（2026-10-05 改成"先选、选不到再写"）。
         老板："怎么保障用户填写正确的、可以被识别并归类的产品名称？"
         三条路，越靠前越不会错：
           ① 一点即选的名字（每个都带已知归类）
           ② 产品库（进口 + 国产都能选，选完归类自动带出来）
           ③ 手填兜底（库里确实没有的），但归类必须自己指定
         不管走哪条，**归类一定有值** —— 系统再也不猜。 -->
    <!-- 疫苗名称：这个字段是**这条记录的主体** —— 打了什么。
         它同时决定归类，归类决定这一针算哪一步、隔多久再打。

         ⚠️ 2026-10-05 简化：原来这里有**三个**控件（12 个预设标签 +
         产品库选择器 + 输入框），老板问"为什么还会显示狂犬疫苗、犬二联
         这种选择器？这个字段的作用是什么？" —— 三个入口做同一件事，
         确实说不清。现在只留两条，各自职责清楚：
           ① 产品库选择 —— 知道品牌的走这条，归类自动带出来
           ② 直接写名字 —— 库里的没有的（犬四联、国产苗、老本子写法）
         ②一旦开打就**自动判归类**（问后端），所以原来那排预设标签
         就多余了 —— 它们的唯一价值就是"带着归类"，而现在打字也带。 -->
    <view class="field-group">
      <text class="field-label">疫苗名称</text>

      <!-- 疫苗名称那一行（2026-10-06 三轮修完）。三种状态各司其职：

           · 还没写   → 给产品库选择器（**新建记录的主入口**）+ 手填框
           · 库里有   → 这一行就是**库里的规范名**，点它可以换一支；
                        不再出现手填框（名字只出现一次）
           · 库里没有 → **不给产品库选择器**（老板 2026-10-06：
                        "对于宠派纯这类产品库中没有的产品……也不让用户可以
                         点击从产品库中挑选产品的弹窗呢？因为这没有意义嘛"），
                        改成一句说明 + 手填框，名字只出现一次

           前两轮走过的弯路记在这里：第一轮"名称行显示占位、名字只在输入框"
           → 老板说名称没加载出来；第二轮"名称行显示原文" → 和输入框重复。
           根因都是**两个控件在做同一件事**，现在按上面三种状态分开。 -->
      <picker
        v-if="catalogProducts.length > 0 && nameFieldMode(draft.vaccineName) !== 'unknown'"
        mode="selector"
        :range="catalogProducts"
        range-key="name"
        :value="productIndex(draft.vaccineName)"
        @change="applyCatalogProduct($event.detail.value)"
      >
        <view
          class="field-picker"
          :class="{ 'field-picker--placeholder': !isNameRecognized(draft.vaccineName) }"
        >
          {{ nameFieldLabel(draft.vaccineName) }}
        </view>
      </picker>

      <!-- 库里没有这支苗：说明白，并且不再给"从产品库挑一支"的入口 -->
      <template v-if="nameFieldMode(draft.vaccineName) === 'unknown'">
        <text class="field-hint field-hint--unknown">
          产品库里没有这支苗 —— 已按你写的名字记录，点下面的「确认」，我们按它的成分归类。
        </text>
        <!-- 认不准就诚实说（2026-10-06 老板）：
             "并不完全保证能识别出卫佳8，有可能它还是识别出卫佳，
              并没有识别出8这个字。如果不能完全有把握的识别出来，
              能不能诚实的告诉用户呢？" -->
        <template v-if="(record.nameSuggestions || []).length > 0">
          <text class="field-hint field-hint--unknown">
            这行字可能没读全 —— 对照疫苗本上的写法核一下，是不是下面这几支？点一下就用它：
          </text>
          <view class="vaccine-name-tags">
            <text
              v-for="suggestion in record.nameSuggestions || []"
              :key="`suggest-${suggestion}`"
              class="vaccine-name-tag"
              @tap="applySuggestedProduct(suggestion)"
            >{{ suggestion }}</text>
          </view>
        </template>
      </template>

      <!-- 手填入口：名字还空着、或者库里没有时出现。
           库里有这只苗时换名字走上面的选择器 —— 手打会绕开产品库，
           厂商、批准文号、归类全都带不出来。
           正在打字的那一行（nameFocused）不抽走，否则顾客打到一半
           名字刚好命中产品库，输入框会当场消失。 -->
      <template v-if="showManualNameInput()">
        <text
          v-if="nameFieldMode(draft.vaccineName) === 'empty'"
          class="field-hint"
        >产品库里没有？也可以直接在下面写名字，写完整点。</text>
        <input
          class="field-input"
          type="text"
          placeholder="例如：犬四联"
          :value="draft.vaccineName"
          :focus="autofocus"
          @input="updateField('vaccineName', $event.detail.value)"
          @blur="notifyNameBlur()"
        />
      </template>

      <!-- 「确认」只在**还需要判一次**的时候出现（2026-10-06 老板提问：
           "是需要点点击确认按钮才会归类吗？还是说不需要点其实已经归类了？"）。

           答案是：**分类早就有了**（从产品库选、或者识别带出来的都已经落库），
           卡片上「分类」那一行就是结果。所以库里认得出、分类也已经有的记录
           不再摆一个按钮让人以为"必须点一下"。
           只有这两种情况才需要确认：
             · 分类还是空的（名字是手打的，系统还没判过）
             · 名字库里没有（让后端再认一次，认出来还能把名字规范过来） -->
      <text
        v-if="showConfirmButton()"
        class="vaccine-confirm"
        :class="{ 'vaccine-confirm--busy': matchingBusy }"
        @tap="confirmVaccineName()"
      >{{ matchingBusy ? '正在查这是哪一支苗…' : '确认' }}</text>
      <text v-else-if="draft.kinds.length > 0" class="field-hint">
        分类已按产品库自动判定，不用再确认。
      </text>

      <!-- 确认的结果**留在卡片上**（2026-10-06 老板："点击下方的确认按钮，
           也没有任何反应，只是屏幕闪烁了一下"）。
           原来只有一闪而过的 toast：命中产品库时分类本来就已经是对的，
           画面上什么都没变，看起来就像按钮坏了。
           现在无论成功失败都留一行字在这里，一眼能看到刚才发生了什么。 -->
      <text
        v-if="confirmResults[index]"
        class="vaccine-confirm-result"
        :class="confirmResults[index].ok
          ? 'vaccine-confirm-result--ok'
          : 'vaccine-confirm-result--warn'"
      >{{ confirmResults[index].text }}</text>
    </view>

    <!-- 这一针**含哪些病种**（2026-10-06 老板定的模型）。
         原来是"分类"（核心疫苗/狂犬疫苗/钩端螺旋体/其他）—— 老板否掉了：
           "在用户需要确认和手动修改的分类中，我们不应该把分类呈现给用户看，
            因为很多用户他并不清楚核心疫苗是什么意思？
            我们需要把它拆开，拆成每一个疫苗种类让顾客选择，
            至于分类的判定则交由后台来完成。"
         所以给顾客看、让他勾的，都是**病种**（犬瘟热/细小/腺病毒/狂犬…），
         类别由后端按病种推导，只用来排期。

         默认仍然只有一行**只读**结果 —— 从产品库选的、识别出来的，
         病种都已经带好了，不用顾客操心。两种情况才展开：
           · 认不出来（没勾过病种）→ 请他照疫苗本勾
           · 顾客自己想改 → 点那行就展开 -->
    <view class="field-group">
      <text class="field-label">接种日期</text>
      <!-- :end 直接不让选未来（2026-10-07 老板审计时定）：
           接种日填成未来会被算成已打过，提醒随之消失。
           后端也会拒（此处只是别让顾客白填一遍）。
           扫疫苗本识别出来的日期不受这里限制，保存时后端会把关。 -->
      <picker
        mode="date"
        :value="draft.vaccinationDate"
        :end="getTodayDateString()"
        @change="updateField('vaccinationDate', $event.detail.value)"
      >
        <view class="field-picker">
          {{ draft.vaccinationDate || '请选择接种日期' }}
        </view>
      </picker>
    </view>
    <view class="field-group">
      <!-- 老板 2026-10-12："含哪些病种的文案可否改成含哪些疫苗？
           并且……『可多选』移到含哪些病种文案板块，以括弧中的注释形式存在。" -->
      <text class="field-label">含哪些疫苗（可多选）</text>

      <!-- 判定结果：只读一行，点它可以改 -->
      <view
        v-if="hasComponentSelection() && !kindPickerOpen.value"
        class="vaccine-kind"
        @tap="openKindPicker()"
      >
        <text
          v-for="component in draft.components"
          :key="component"
          class="vaccine-kind__tag"
        >{{ componentLabel(component) }}</text>
        <!-- 勾不上任何病种时（驱虫药、看不懂的本子）走这条 -->
        <text
          v-if="draft.components.length === 0"
          class="vaccine-kind__tag"
        >都不是 / 不确定</text>
        <text class="vaccine-kind__edit">修改</text>
      </view>

      <!-- 还没勾：说清楚要做什么，并让顾客照本子勾 -->
      <template v-else>
        <view v-if="matchingBusy" class="vaccine-kind__unknown">
          <text class="vaccine-kind__unknown-title">正在匹配产品…</text>
          <text class="vaccine-kind__unknown-desc">
            先从产品库里找，找不到再让 AI 认一次写法。
          </text>
        </view>
        <!-- 说明 Banner 已按老板 2026-10-12 的要求删除 ✗
             （"这一针含哪些病种的相关说明 Banner 直接删除"）-->
        <view class="vaccine-name-tags">
          <text
            v-for="option in componentOptions"
            :key="option.value"
            class="vaccine-name-tag"
            :class="{ 'vaccine-name-tag--active': draft.components.includes(option.value) }"
            @tap="toggleComponent(option.value)"
          >{{ option.label }}</text>
          <text
            class="vaccine-name-tag"
            :class="{ 'vaccine-name-tag--active': isNoneOfThem() }"
            @tap="toggleNoneOfThem()"
          >都不是 / 不确定</text>
        </view>
        <!-- 「可多选」已挪到字段名括弧里 ✓；"选好了"按钮也按老板要求删掉 ✗
             （点字段名那一行即可展开/收起 ✓）-->
      </template>
    </view>


    <!-- 「下次接种」字段已删除（2026-10-05 老板："请把这个字段删掉"）。
         前一轮只是改了措辞、想说明白"核心疫苗和狂犬是自动算的"，
         但老板的判断更干脆：**这个字段本身就不该存在**。
         提醒本来就该由系统按免疫程序算出来，让顾客手填一个日期，
         等于把"该不该提醒"的责任推给他 —— 而且他多半不知道该填什么。

         ⚠️ 后端字段 nextDueDate **保留不动**（additive，老记录里可能存着值）：
           · buildPayload 仍会把草稿里原有的值原样带上，不会被清掉；
           · 但**卡片上不再显示它**（2026-10-08 老板："每条卡片不显示到期提示"）——
             顶部那条提醒是按接种计划算出来的，比人工填的这个日期权威。
         只是顾客端不再有输入口。 -->
    <view class="field-group">
      <text class="field-label">备注（可选）</text>
      <textarea
        class="field-textarea"
        placeholder="例如：接种机构、批号、接种后反应"
        :value="draft.notes"
        @input="updateField('notes', $event.detail.value)"
      />
    </view>

    <!-- 报告原件**不再挂在每条记录上**（2026-10-08 老板定）：
         一本疫苗本就 1~2 张照片，上面却有十几条标签和记录 ——
         每条都挂一次，等于同一张图在列表里重复十几遍。
         现在挪到记录板块顶部**只展示一次**（见 records-card 里的原件缩略图）。 -->

    <!-- 待核对说明 + 一键核对（2026-10-09 安全默认值） -->
    <view v-if="draft.productVerified === false" class="verify-block">
      <text class="verify-block__title">这一针先没算进接种计划</text>
      <text class="verify-block__desc">
        {{ verifyReason(draft) }}
      </text>
      <text class="verify-block__action" @tap.stop="confirmVerified()">
        我已对照本子核对
      </text>
    </view>

    <view class="vaccine-card__actions">
      <!--
        2026-10-03：手动保存按钮下线，改实时保存 ✓。
        ⚠️ 2026-10-12 老板把**新记录**改回手动保存 ✓：
           "输入界面也不要自动保存，应该改成手动保存。"
        → 还没保存过的新记录（id 为空 ✓）显示一个「保存」按钮 ✓；
          已存在的记录照旧实时保存 ✓（改旧记录的体验不该变差 ✓）。
      -->
      <text
        v-if="!record.id"
        class="vaccine-card__save"
        :class="{ 'vaccine-card__save--busy': saving }"
        @tap.stop="emit('save', index)"
      >{{ saving ? '保存中…' : '保存' }}</text>
      <text v-if="saving" class="vaccine-card__autosave vaccine-card__autosave--quiet">
        保存中…
      </text>
      <text v-else-if="autoSaveText" class="vaccine-card__autosave">
        {{ autoSaveText }}
      </text>
      <text
        v-else
        class="vaccine-card__autosave vaccine-card__autosave--quiet"
        :class="{ 'vaccine-card__autosave--just': justSaved }"
      >
        {{ saveStateText }}
      </text>
    </view>
  </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { todayDateText } from '../../utils/date'
import { dogApi } from '../../api/dogs'
import {
  findCatalogProduct,
  normalizeProductName,
  type VaccineDraft,
  type VaccineRecord,
} from './vaccine-record-types'

/*
 * ── 接口约定（2026-10-12 第一步：先定义清楚再搬 ✓）────────────────────
 *
 * props   { record, index, draft, expanded } + 目录 / 显示状态
 * emits   { update, remove, toggle, save } + name-blur
 *
 * 分工只有一条：**这张卡自己的事归卡片，列表的事归父组件** ✓。
 */
const props = withDefaults(
  defineProps<{
    /** 这一条记录（服务器那份原样，卡片不直接改它）*/
    record: VaccineRecord
    /** 它在列表里的位置（展不展开、点删除、点保存都要带回去 ✓）*/
    index: number
    /**
     * 这一条的**编辑草稿** —— 父组件持有 ✓，卡片改它 ✓。
     *
     * 为什么草稿不放在卡片自己这儿 ✗：保存前的校验（"还差病种"）、
     * 自动保存的定时器、"有未保存内容"要亮底部按钮 ✓ 全是**列表级**的判断 ✓，
     * 它们必须看得见顾客正在打什么字 ✓。卡片自己存一份的话，
     * 父组件就只能等一个异步的 emit ✗ —— 那不是"行为完全不变" ✓。
     */
    draft: VaccineDraft
    /** 展开着没有（父组件记着，因为一次只展开一条 ✓）*/
    expanded: boolean
    /** 产品库（后端下发；拉不到就是空数组，卡片照旧能用 ✓）*/
    catalogProducts?: {
      name: string
      manufacturer?: string
      kinds: string[]
      components: string[]
    }[]
    /** 病种词表（后端下发，前端有一份小兜底 ✓）*/
    componentOptions?: { value: string; label: string }[]
    /** 正在查这是哪一支苗（父组件在请求，卡片只显示 ✓）*/
    matchingBusy?: boolean
    /** 正在存这一条（父组件在存，卡片只显示 ✓）*/
    saving?: boolean
    /** 父组件挂在卡片上的一句话（"还差病种" / 后端拒绝的原因 ✓）*/
    autoSaveText?: string
    /** 刚刚保存成功（2 秒高亮 ✓，按 id 记，重排也不会认错卡片 ✓）*/
    justSaved?: boolean
    /** 常驻的保存状态那行字（"已保存" / "还没保存 · 填完自动保存" ✓）*/
    saveStateText?: string
    /**
     * 顾客的注意力是不是正落在这张卡的名称框里（父组件的 focusIndex === index ✓）。
     *
     * ⚠️ 为什么要把它传下来 ✗：手填输入框原来有一条判断 ——
     * **正在打字的那一行不许把输入框抽走** ✓（打到一半刚好命中产品库，
     * 输入框当场消失，手会停在半空 ✗）。这个"正在哪一行"是**列表级**的 ✓
     * （一次只有一行 ✓），所以仍然由父组件记着、传进来 ✓。
     */
    nameFocused?: boolean
    /** 父组件要求把光标落进这一行的名称框（新增一条时）*/
    autofocus?: boolean
  }>(),
  {
    catalogProducts: () => [],
    componentOptions: () => [],
    matchingBusy: false,
    saving: false,
    autoSaveText: '',
    justSaved: false,
    saveStateText: '',
    nameFocused: false,
    autofocus: false,
  },
)

const emit = defineEmits<{
  /**
   * 草稿改了 → 父组件同步它那一份 + 排自动保存 ✓。
   *
   * 第一个参数是**哪一条** ✓（父组件按它找回自己的草稿 ✓，不靠下标猜 ✓）。
   */
  (event: 'update', index: number, field: keyof VaccineDraft, value: string): void
  (event: 'remove', index: number): void
  (event: 'toggle', index: number): void
  /**
   * 请父组件立刻存这一条。
   *
   * 两个地方用它：① 点「保存」（新记录是手动保存 ✓）；
   * ② 点「我已对照本子核对」（要落库才算数 ✓）。
   * ③ 点「确认」匹配完之后 —— 匹配结果（归类/规范名/病种）得立刻落库 ✓，
   *    原来那条路是直接调 `scheduleAutoSave(immediate)` ✓，行为不变 ✓。
   */
  (event: 'save', index: number): void
  /** 名称框失焦 → 父组件把"注意力在这一行"的标记清掉 ✓ */
  (event: 'name-blur', index: number): void
}>()

/* ── 这一张卡自己的临时状态（跟着卡片走 ✓）────────────────────────── */

/**
 * 「确认」之后留在卡片上的那行结果（2026-10-06）。
 *
 * 老板："我点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
 * 原因是这个按钮原来只弹一个一闪而过的 toast，而且命中产品库时
 * 分类本来就已经是对的、画面上没有任何变化 —— 看起来就像按钮坏了。
 * 现在把结果写进卡片，留着不走：顾客按了就有东西可看。
 */
const confirmResult = ref<{ ok: boolean; text: string } | null>(null)

/** 这一张卡的"确认"请求正在飞（卡片自己发的，所以自己也留着 ✓）*/
const matchingHere = ref(false)

/**
 * 分类选择器是否展开（2026-10-05）。
 *
 * 默认收起 —— 分类是系统判的，不给顾客摆一排选项让他做我们的活。
 * 两种情况展开：① 系统没认出来（必须让顾客填，否则这条存不了）
 *              ② 顾客自己点了"修改"（他的记录，他想改就改）
 */
const kindPickerOpen = ref(false)

/*
 * 今天的日期（本地时区）。
 * 2026-10-09 提到 utils/date.ts 共用 —— 鱼骨图也要算"今天"，
 * 两处各写一份迟早不一致（顺带把那个 UTC 差一天的坑写进了注释）。
 *
 * ⚠️⚠️ 2026-10-11 血泪：这个别名**必须定义在所有使用点之前** ✗✗
 * 上一版把 `const today = getTodayDateString()` 写在了别名**上面** ✗ ——
 * `const` 在初始化前取到的是 undefined ✓，于是整个板块的 setup 抛
 * "xxx is not a function" ✗ → 板块整块不渲染 ✓、**一次请求都不发** ✓。
 */
const getTodayDateString = todayDateText

/** 记录（草稿）里的值 —— 模板里读得最多 ✓ */
const draft = computed(() => props.draft)

/* ── 状态显示（**只用于显示**）────────────────────────────────────── */

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

function statusClass(draftValue: VaccineDraft) {
  return {
    'vaccine-card__status--done': draftValue.status === 'COMPLETED',
    'vaccine-card__status--scheduled': draftValue.status === 'SCHEDULED',
    'vaccine-card__status--overdue': draftValue.status === 'OVERDUE',
  }
}

function openKindPicker() {
  kindPickerOpen.value = true
}

/**
 * 「选好了」—— 手动收起分类选择器（多选模式下的出口）。
 *
 * ⚠️ 2026-10-12 老板把「选好了」按钮去掉了 ✗（"点字段名那一行即可展开/收起" ✓），
 * 所以模板里**现在没有调用点** ✗。留着它有两个用处 ✓：
 *   ① 那条回归测试继续盯着这个出口还在不在 ✓；
 *   ② 下一版要恢复按钮时不用重写 ✓ —— 不是"死代码忘了清" ✗。
 */
function closeKindPicker() {
  kindPickerOpen.value = false
}

function componentLabel(component: string): string {
  return props.componentOptions.find((item) => item.value === component)?.label || component
}

/** 已经勾过病种（或者明确选了"都不是"）—— 决定那一行是显示结果还是展开选择器 */
function hasComponentSelection(): boolean {
  return draft.value.components.length > 0 || draft.value.kinds.includes('other')
}

/** 明确选了"都不是 / 不确定" */
function isNoneOfThem(): boolean {
  return draft.value.components.length === 0 && draft.value.kinds.includes('other')
}


/**
 * 这个名字在产品库里认不认得出（归一化之后比）。
 *
 * 认得出 = 这一行显示规范名、并且**不出现**手填输入框。
 */
function isNameRecognized(name: string): boolean {
  return findCatalogProduct(props.catalogProducts, name) !== null
}

/**
 * 名称字段现在处于哪种状态（2026-10-06 第三轮）。
 *
 *   empty      —— 还没写名字：给产品库选择器（新建记录的主入口）+ 手填框
 *   recognized —— 库里有这一支：只显示库里的规范名，不出现手填框
 *   unknown    —— 库里没有：**不给产品库选择器**（老板："这没有意义嘛"），
 *                 改成一句说明 + 手填框
 */
function nameFieldMode(name: string): 'empty' | 'recognized' | 'unknown' {
  if (!String(name || '').trim()) return 'empty'
  return isNameRecognized(name) ? 'recognized' : 'unknown'
}

/**
 * 「确认」按钮要不要出现（2026-10-06 老板提问后加）。
 *
 * 老板问："是需要点点击确认按钮才会归类吗？还是说不需要点其实已经归类了？"
 * 答案是**早就归类了** —— 从产品库选、或识别带出来的分类都已经落库，
 * 卡片上「分类」那一行就是结果。所以别再摆一个按钮让人以为"必须点一下"。
 *
 * 只有这两种情况还需要确认：
 *   · 分类还是空的（名字是手打的，系统还没判过）
 *   · 名字库里没有（让后端再认一次；认出来还能把名字规范过来）
 */
function showConfirmButton(): boolean {
  if (!draft.value.vaccineName.trim()) return false
  if (draft.value.kinds.length === 0) return true
  return nameFieldMode(draft.value.vaccineName) === 'unknown'
}

/**
 * 名称那一行显示什么（2026-10-06 第二轮）。
 *
 * ⚠️ 老板报的交互问题："未识别的疫苗产品输入框出现的时候，对用户而言是否会
 *    感到疑惑？因为它的上方还有一个产品名的选择器，**二者都是一样的名字**。"
 *
 * 所以两个控件各司其职，同一个名字**只出现一次**：
 *   · 库里认得出 → 这一行显示**库里的规范名**（唯一一处，也没有手填框）
 *   · 认不出     → 这一行只说"去库里挑一支"（读起来是一个**动作**，
 *                  不是"这就是名字"），名字本身在下面的手填框里
 */
function nameFieldLabel(name: string): string {
  const matched = findCatalogProduct(props.catalogProducts, name)
  if (matched) return matched.name
  return showManualNameInput() ? '＋ 从产品库选一支' : '从产品库选择（进口 / 国产都有）'
}

function productIndex(name: string): number {
  const key = normalizeProductName(name)
  if (!key) return 0
  const found = props.catalogProducts.findIndex(
    (item) => normalizeProductName(item.name) === key,
  )
  return found >= 0 ? found : 0
}

/**
 * 手填输入框要不要出现（2026-10-06 老板的规格）。
 *
 * 只有**产品库里没有这只苗**时才给手填入口：
 *   · 名字还空着 → 要出现，否则顾客没法开始写；
 *   · 正在这一行打字 → 要留着，否则打到一半刚好命中产品库，
 *     输入框当场消失（手会停在半空）；
 *   · 库里有 → 不出现，换名字走上面的产品选择器 ——
 *     那才是"选产品"的正路，手打会绕开产品库、丢掉厂商与归类。
 */
function showManualNameInput(): boolean {
  const name = draft.value.vaccineName.trim()
  if (!name) return true
  if (props.nameFocused) return true
  return findCatalogProduct(props.catalogProducts, name) === null
}

function setConfirmResult(ok: boolean, text: string) {
  confirmResult.value = { ok, text }
}

function clearConfirmResult() {
  confirmResult.value = null
}

/** 改草稿里的某个字段 → 往外报（父组件同步它那份 + 排自动保存 ✓）*/
function updateField(field: keyof VaccineDraft, value: string) {
  emit('update', props.index, field, value)
}

/**
 * 「确认」之后再匹配产品（2026-10-05 按老板的规格改）。
 *
 * 老板原话：
 *   "顾客手动的输入产品名称。**点击确认之后**，再来完成 AI 的匹配。
 *    包括产品匹配和分类匹配。如果用户手动输入的产品名称，
 *    也没有办法完成产品匹配和分类匹配，那就需要**弹出分类的选择器**，
 *    让顾客手动的录入。"
 *
 * 所以不再是"边打字边判"——**顾客点确认才开始匹配**：
 *   ① 后端先查表（确定、瞬间）
 *   ② 查不到再让 AI 认到具体产品
 *   ③ 都认不出 → 老实承认 + 展开分类选择器让顾客填
 *
 * 匹配期间卡片上显示"匹配中…"，匹配完把结果显示出来。
 */
async function confirmVaccineName() {
  const name = draft.value.vaccineName.trim()

  if (!name) {
    // 不再只用一闪而过的 toast —— 结果留在卡片上，顾客回头还看得到
    setConfirmResult(false, '还没写疫苗名称。先在上面写清楚，再点确认。')
    return
  }

  matchingHere.value = true
  clearConfirmResult()
  try {
    const res: any = await dogApi.classifyVaccineName(name)
    // 等回来时名字可能又变了 —— 只认当前这个名字的结果
    if (draft.value.vaccineName.trim() !== name) return
    if (res?.code !== 0 || !res?.data) {
      setConfirmResult(false, '匹配失败，请再点一次确认。')
      return
    }

    draft.value.kinds = Array.isArray(res.data.kinds) ? res.data.kinds.map(String) : []
    draft.value.kindsManual = false
    // 匹配上了就收起选择器（顾客不用做我们的活）；
    // 没匹配上就**如实承认**并展开，让他自己填
    kindPickerOpen.value = draft.value.kinds.length === 0

    /*
     * 规范产品名以后端为准（2026-10-06）。
     *
     * 后端那套匹配能认出瓶签写法（「卫佳® Vanguard® Plus 5/CV-L」→ 卫佳捌），
     * 前端这份只做"名字一模一样"的比对，认不出这种。所以：
     *   · 后端给了规范名 → 直接采用（连名字一起改过来，和分类对齐）；
     *   · 没给 → 退回前端这份，至少能显示"已确认：xxx"。
     */
    // 顺带刷新"没读全"的候选（认出来了就是空数组）
    if (Array.isArray(res.data.nameSuggestions)) {
      props.record.nameSuggestions = res.data.nameSuggestions.map(String)
    }
    const canonicalName = String(res.data.productName || '')
    const matched = canonicalName ? { name: canonicalName } : findCatalogProduct(props.catalogProducts, name)

    // 后端认出来的病种回填到界面（顾客看到的是病种）
    if (Array.isArray(res.data.components)) {
      const components = res.data.components.map(String)
      if (components.length > 0) {
        draft.value.components = components
      }
    }

    if (draft.value.kinds.length === 0) {
      setConfirmResult(
        false,
        '产品库和 AI 都没认出这支苗。照本子上的写法再核一遍，或者在下面手动勾一下病种。',
      )
    } else {
      if (canonicalName) {
        // 名字跟着一起对齐，界面上那一行才显示得出"系统认为这是哪一支"
        draft.value.vaccineName = canonicalName
      }
      // 结果行里说的是**病种**（顾客看得懂的东西），不是内部类别
      const labels = draft.value.components
        .map((component) => componentLabel(component))
        .join(' + ')
      setConfirmResult(
        true,
        matched
          ? `已确认：${matched.name}${labels ? ` · 含「${labels}」` : ''}`
          : `已确认：${name}${labels ? ` · 含「${labels}」` : ''}`,
      )
    }

    /*
     * ⚠️ 名字**真的变了**才报名字，没变就只请父组件存一次 ✓ ——
     *
     * 父组件的 `updateDraft` 有一条规矩：名字变了 → 之前判出来的 kinds 作废 ✓
     * （名字都换了一支苗，旧归类不该留着 ✓）。而这里刚刚才把后端判出来的
     * kinds 填进草稿 ✓ —— 哪怕名字其实没变，只要照实报一次"名字"，
     * 父组件也会把这份刚拿到的 kinds 清掉 ✗（"确认完还是没有归类" ✗）。
     * 所以：变了才报名字 ✓；没变就走 `save` ✓（原来那条路也是立刻存一次 ✓）。
     */
    if (canonicalName && canonicalName !== name) {
      updateField('vaccineName', canonicalName)
    } else {
      emit('save', props.index)
    }
  } catch (error: any) {
    setConfirmResult(false, error?.message || '匹配失败，请再点一次确认。')
  } finally {
    matchingHere.value = false
  }
}

/**
 * 点"没读全"的候选 → 等同于从产品库里选了那一支。
 *
 * 老板 2026-10-06："如果不能完全有把握的识别出来，能不能诚实的告诉用户呢？"
 * 告诉他之后还得让他一键改对 —— 不然知道了还得自己去找产品库。
 */
function applySuggestedProduct(name: string) {
  const at = props.catalogProducts.findIndex((item) => item.name === name)
  if (at >= 0) {
    applyCatalogProduct(at)
  }
  // 用掉了就不再提示
  props.record.nameSuggestions = []
}

/** 从产品库选 → 名字、归类一起带出来（厂商/批准文号后端有，界面只显示名） */
function applyCatalogProduct(value: string | number) {
  const product = props.catalogProducts[Number(value)]
  if (!product) return
  draft.value.vaccineName = product.name
  // 病种由产品库带出来（2026-10-06）；类别由后端按病种推导
  draft.value.components = Array.isArray(product.components) ? [...product.components] : []
  draft.value.kinds = [...product.kinds]
  // 产品库里选的：归类是确定的，直接在卡片上说明白（和点「确认」同样的交代）
  setConfirmResult(
    true,
    `已选择：${product.name} · 含「${(product.components || [])
      .map((component) => componentLabel(component))
      .join(' + ')}」`,
  )
  // 产品的归类是**确定**的（数据库里核过成分），不需要再问后端
  draft.value.kindsManual = false
  updateField('vaccineName', product.name)
}

/**
 * 勾/取消一个**病种**（2026-10-06 老板定的模型）。
 *
 * 顾客勾的是病种，类别由后端推导 —— 所以这里只动 components，
 * kinds 留给后端算（本地那份只用于"能不能存"的判断）。
 * 点"都不是"时会把病种清空、标一个 other，见 toggleNoneOfThem。
 */
function toggleComponent(component: string) {
  draft.value.components = draft.value.components.includes(component)
    ? draft.value.components.filter((item) => item !== component)
    : [...draft.value.components, component]

  // 勾了真病种就不再是"都不是"
  if (draft.value.components.length > 0) {
    draft.value.kinds = draft.value.kinds.filter((kind) => kind !== 'other')
  }
  draft.value.kindsManual = true
  /*
   * ⚠️ 报的是 `components` 这个**字段名** ✓（值只是个占位 ✓）。
   * 报 `vaccineName` 会让父组件把刚勾好的归类清掉 ✗（见 confirmVaccineName 的说明 ✓）。
   */
  updateField('components', '')
}

/**
 * 「都不是 / 不确定」—— 驱虫药、看不懂的本子这类。
 *
 * 勾不上任何病种时给一条出路：记下来，但**不参与计划**
 * （对应 kinds 里的 other）。不然顾客会被"必须勾一个病种"卡住。
 */
function toggleNoneOfThem() {
  const already = draft.value.components.length === 0 && draft.value.kinds.includes('other')

  draft.value.components = []
  draft.value.kinds = already ? [] : ['other']
  draft.value.kindsManual = true
  updateField('components', '')
}

/**
 * 「待核对」的原因（2026-10-09）：不同原因给不同的话 ——
 * 日期可疑时说日期 ✓（老板实测：02/04 号本子根本没填注射日期，
 * 模型却把生产日期填了进去 ✗），别的说名字 ✓。
 */
function verifyReason(draftValue: any): string {
  const dateReview = draftValue?.productReview?.dateReview
  if (dateReview === 'missing') {
    return '这一针本子上好像没写注射日期（我们可能认成了别的日期）。照本子核一下，对得上就点下面 —— 点完它才算数。'
  }
  if (dateReview === 'differs') {
    return '这一针的日期我们和复核读得不一样（可能本子上有涂改）。照本子核对后点下面 —— 点完它才算数。'
  }
  return '它是识别出来的，我们不敢打包票（可能把贴纸认成了另一支苗）。照疫苗本核对一下名字和日期，对得上就点下面 —— 点完它才算数。'
}

/**
 * 「我已对照本子核对」—— 把这一针从"待核对"变成算数（2026-10-09 安全默认值）。
 *
 * 为什么要有这一步：识别可能把贴纸认成另一支真苗（实测：狂犬苗被读成联苗），
 * 那样系统会以为"狂犬打过了"、从此不再提醒 ✗。所以默认倒向安全：
 * **没核对过的先不算数** ✓，顾客核完点一下才算 ✓。
 *
 * ⚠️ 这一步**要落库** ✓ —— 存是列表级的事（要 dogId、存完要整表重载 ✓），
 * 所以把标记写好之后请父组件存一次 ✓（原来那条路是直接调 saveRecord ✓）。
 */
function confirmVerified() {
  draft.value.productVerified = true
  if (props.record.id) {
    emit('save', props.index)
  }
}

/** 名称框失焦 → 把"注意力在这一行"的标记交给父组件清掉 ✓ */
function notifyNameBlur() {
  emit('name-blur', props.index)
}
</script>

<style scoped lang="scss">
/* ══ 一条接种记录的编辑卡（2026-10-12 第一步：样式从 VaccineManagementSection 搬来）══
 这一段是**这一张卡自己的观感** ✓（卡片脸 + 展开后的表单控件）✓；
 板块外壳（records-card / 列表分隔 / 疫苗本原件 / 识别回执）仍留在原处 ✓。
 样式逐条照抄 ✓ —— 只挪位置、不改数值 ✓。 */

/* 一条记录 = 板块里的一行。
 原来它自带底色、边框、圆角和外边距（各自独立的卡），几张摞在一起看着散、
 也看不出这是一个列表。现在只留一条分隔线，靠"行"来讲清楚它是一组。 */
.vaccine-card {
padding: 22rpx 0;
border-top: 1rpx solid #eef1e8;
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

.vaccine-card__toggle {
flex-shrink: 0;
font-size: 24rpx;
color: #b08d4f;
}

.vaccine-card__body {
margin-top: 22rpx;
}

/* 待核对（2026-10-09 安全默认值） */
.vaccine-card__pending {
margin-left: 10rpx;
padding: 2rpx 12rpx;
border-radius: 999rpx;
font-size: 22rpx;
color: #a15c00;
background: #fdf3e4;
border: 1rpx solid #e6a23c;
}

.vaccine-card__actions {
display: flex;
align-items: center;
gap: 16rpx;
margin-top: 26rpx;
}

.vaccine-card__save {
display: inline-block;
padding: 10rpx 40rpx;
border-radius: 999rpx;
font-size: 26rpx;
font-weight: 600;
color: #ffffff;
background: #7c6bd6;
}
.vaccine-card__save--busy {
opacity: 0.6;
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

/* 刚刚保存成功的高亮（2 秒，之后回到常驻的「已保存」）*/
.vaccine-card__autosave--just {
color: #0f7b49;
font-weight: 600;
}

/* 名称输入框下面的「确认」：匹配产品与分类的起点 */
.vaccine-confirm {
display: block;
margin-top: 16rpx;
padding: 16rpx 0;
text-align: center;
border-radius: 14rpx;
font-size: 26rpx;
font-weight: 600;
color: #ffffff;
background: var(--health-accent, #1e3a2f);
}

.vaccine-confirm--busy {
opacity: 0.6;
}

/*
 * 「确认」之后留在卡片上的结果（2026-10-06）。
 *
 * 老板："点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
 * 原来只有一闪而过的 toast；命中产品库时分类本来就已经是对的，
 * 画面上什么都没变，看起来就像按钮坏了。这行字留着不走。
 */
.vaccine-confirm-result {
display: block;
margin-top: 12rpx;
font-size: 24rpx;
line-height: 1.55;
}

.vaccine-confirm-result--ok {
color: #3d6b4a;
}

.vaccine-confirm-result--warn {
color: #b26a2f;
}

/* 归类标签（2026-10-05） */
.vaccine-kind {
display: flex;
flex-wrap: wrap;
gap: 12rpx;
}

.vaccine-kind__tag {
font-size: 24rpx;
line-height: 1;
padding: 10rpx 18rpx;
border-radius: 999rpx;
color: #1e3a2f;
background: #e8f0e4;
}

/* 判定结果右侧的"修改"：不抢眼，但找得到 */
.vaccine-kind__edit {
align-self: center;
margin-left: 6rpx;
font-size: 22rpx;
color: #8a968a;
}

/* 认不出来时的说明（2026-10-05）：不装懂，把话说清楚再让顾客填 */
.vaccine-kind__unknown {
display: flex;
flex-direction: column;
gap: 8rpx;
margin-bottom: 16rpx;
padding: 16rpx 18rpx;
border-radius: 14rpx;
background: #fdf8ec;
border-left: 6rpx solid #d8c98a;
}

.vaccine-kind__unknown-title {
font-size: 25rpx;
font-weight: 600;
color: #7a6a2f;
}

.vaccine-kind__unknown-desc {
font-size: 22rpx;
line-height: 1.55;
color: #6b6653;
}

/* 字段下面的一句说明（例如"核心疫苗和狂犬的时间系统会自动算"） */
.field-hint {
display: block;
margin-top: 10rpx;
font-size: 21rpx;
line-height: 1.5;
color: #8a968a;
}

/* 库里没有这支苗时的说明（2026-10-06）：比普通提示更醒目一点，
 因为它要顶替原来那个"从产品库选一支"的入口 */
.field-hint--unknown {
color: #8a6f3d;
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

/* 还没选到任何东西时才用浅色 —— 有名字的时候要看起来是"填好了" */
.field-picker--placeholder {
color: #9aa39a;
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

/*
 * ⚠️ 选中态**必须写在基础态之后**（2026-10-06 老板实测报的 bug）。
 *
 * 原来这两条是反过来的：--active 写在前面、基础类写在后面。
 * 两个选择器优先级一样（都是一个类），后写的赢 —— 于是基础类的
 * 白底/深字把选中态的绿底/白字**整个盖掉**：点标签"没有反应"，
 * 但状态一直是正确的（点「选好了」收起后就看得到刚点的那几类）。
 * 样式顺序引起的问题，只有把顺序调回来才修得掉。
 */
.vaccine-name-tag--active {
color: #ffffff;
background: var(--health-accent, #1e3a2f);
border-color: var(--health-accent, #1e3a2f);
}

.verify-block {
margin-top: 14rpx;
padding: 16rpx;
border-radius: 12rpx;
background: #fdf6ea;
border: 1rpx solid #e6a23c;
}
.verify-block__title {
font-size: 26rpx;
font-weight: 600;
color: #a15c00;
}
.verify-block__desc {
display: block;
margin-top: 8rpx;
font-size: 24rpx;
color: #7a6a4f;
line-height: 1.6;
}
.verify-block__action {
display: inline-block;
margin-top: 12rpx;
padding: 10rpx 22rpx;
border-radius: 999rpx;
background: #0f7b49;
color: #ffffff;
font-size: 26rpx;
}
</style>
