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
      :component-options="componentOptions"
      @scanned="onVaccineBookScanned"
    />

    <view v-if="dueSummaryText" class="vaccine-due-banner">
      <text class="vaccine-due-text">{{ dueSummaryText }}</text>
    </view>

    <!-- ══ 接种记录板块（2026-10-06 老板第二次改）══════════════════════════
         这次一起解决两件事：

         ① **没有任何记录时，这一块不该出现**。
            老板："如果没有任何记录的话，它也会显示出来。"
            原来标题行（"接种记录 · N 条"）常显，0 条时就成了一个空壳标题
            悬在那儿。现在标题只在**真有记录**时才出。

         ② **太简陋**。原来是"一个标题 + 几张各自漂浮的小卡"，
            和上面「接种计划」那张完整的卡不是一套语言。现在整块收进一张卡：
            表头一行（标题 + 条数），下面是一条条**用分隔线排开的行**
            （不是孤立的卡片），一眼能看出"这是一个列表"。
           独立成页时也照样成立（那边本来还有一层页级标题）。 -->
    <view class="health-card records-card">
      <view v-if="records.length > 0" class="records-card__head">
        <text class="records-card__title">接种记录</text>
        <text class="records-card__count">{{ records.length }} 条</text>
      </view>
      <text v-if="records.length > 0" class="records-card__desc">
        最近接种的排在前面。点一条可以改，右边可以删。
      </text>
      <view v-if="scanNotice" class="records-card__notice">
        <text class="records-card__notice-text">{{ scanNotice }}</text>
        <text class="records-card__notice-close" @tap="scanNotice = ''">知道了</text>
      </view>

      <!-- 存完整批回执（2026-10-08 老板要的）：这一批进去几条、跳过几条、
           还差几条、以及"下一次该打什么"（用计划算出来的那一针，不是人工填的日期）。 -->
      <view v-if="scanReceipt" class="receipt">
        <text class="receipt__title">
          这批记好了：存了 {{ scanReceipt.saved }} 条{{ scanReceipt.skipped > 0 ? ` · 跳过 ${scanReceipt.skipped } 条已记过的` : '' }}
        </text>
        <text v-if="scanReceipt.needsFix.length > 0" class="receipt__warn">
          有 {{ scanReceipt.needsFix.length }} 条还差信息没存上：{{ scanReceipt.needsFix.join('；') }}
        </text>
        <text v-if="scanReceipt.nextLabel" class="receipt__next">
          按接种计划，下一次是 {{ scanReceipt.nextLabel }}
        </text>
        <text class="receipt__close" @tap="dismissScanReceipt">知道了</text>
      </view>

    <!-- 占位只在**手上一条记录都还没有**时出现。
         原来只要 loading 为真就把整个列表换成这一句 —— 而每一次自动保存
         （点分类、点"确认"、改日期）都会整表重载，于是已经显示出来的记录
         先被擦掉、再长回来。老板看到的就是"屏幕闪烁了一下"。
         刷新是后台动作，不该动已经显示出来的东西。 -->

      <view v-if="loading && records.length === 0" class="records-card__empty">
        <text class="records-card__empty-text">疫苗记录加载中</text>
      </view>

    <!-- 空态（2026-10-04 老板提问后改）。
         原来这里只有干巴巴一句"还没有记录"，而上面的疫苗计划板块还会单独弹一张
         "档案里还没有接种记录"—— **同一件事说了两遍**。
         现在合成一处：计划板块在零记录时整块不渲染，这句话由这里说。
         位置也更对：它就长在记录列表该在的地方。 -->
      <view v-else-if="records.length === 0" class="records-card__empty">
        <!-- 只有一句。
             2026-10-03 老板就定过："没有记录就写没有记录即可，不用下面那行小字"；
             2026-10-04 又问"为什么会提醒了一次……在下方又进行了一次提醒呢"——
             所以不是加话，而是**把重复的那处删掉、只留这里一句**。
             该做什么，底部那个常驻的「新增记录」已经写着了。 -->
        <text class="records-card__empty-title">档案里还没有接种记录</text>
      </view>

      <view class="records-list">

    <view
      v-for="(record, index) in records"
      :key="record.id || `draft-${index}`"
      class="vaccine-card"
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
            v-if="catalogProducts.length > 0 && nameFieldMode(draftOf(record, index).vaccineName) !== 'unknown'"
            mode="selector"
            :range="catalogProducts"
            range-key="name"
            :value="productIndex(draftOf(record, index).vaccineName)"
            @change="applyCatalogProduct(index, $event.detail.value)"
          >
            <view
              class="field-picker"
              :class="{ 'field-picker--placeholder': !isNameRecognized(draftOf(record, index).vaccineName) }"
            >
              {{ nameFieldLabel(draftOf(record, index).vaccineName, index) }}
            </view>
          </picker>

          <!-- 库里没有这支苗：说明白，并且不再给"从产品库挑一支"的入口 -->
          <template v-if="nameFieldMode(draftOf(record, index).vaccineName) === 'unknown'">
            <text class="field-hint field-hint--unknown">
              产品库里没有这支苗 —— 已按你写的名字记录，点下面的「确认」判定分类。
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
                  @tap="applySuggestedProduct(index, suggestion)"
                >{{ suggestion }}</text>
              </view>
            </template>
          </template>

          <!-- 手填入口：名字还空着、或者库里没有时出现。
               库里有这只苗时换名字走上面的选择器 —— 手打会绕开产品库，
               厂商、批准文号、归类全都带不出来。
               正在打字的那一行（focusIndex）不抽走，否则顾客打到一半
               名字刚好命中产品库，输入框会当场消失。 -->
          <template v-if="showManualNameInput(index)">
            <text
              v-if="nameFieldMode(draftOf(record, index).vaccineName) === 'empty'"
              class="field-hint"
            >产品库里没有？也可以直接在下面写名字，写完整点。</text>
            <input
              class="field-input"
              type="text"
              placeholder="例如：犬四联"
              :value="draftOf(record, index).vaccineName"
              :focus="focusIndex === index"
              @input="updateDraft(index, 'vaccineName', $event.detail.value)"
              @blur="clearFocus(index)"
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
            v-if="showConfirmButton(index)"
            class="vaccine-confirm"
            :class="{ 'vaccine-confirm--busy': matchingIndex === index }"
            @tap="confirmVaccineName(index)"
          >{{ matchingIndex === index ? '匹配中…' : '确认' }}</text>
          <text v-else-if="draftOf(record, index).kinds.length > 0" class="field-hint">
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
          <text class="field-label">含哪些病种</text>

          <!-- 判定结果：只读一行，点它可以改 -->
          <view
            v-if="hasComponentSelection(record, index) && !kindPickerOpen[index]"
            class="vaccine-kind"
            @tap="openKindPicker(index)"
          >
            <text
              v-for="component in draftOf(record, index).components"
              :key="component"
              class="vaccine-kind__tag"
            >{{ componentLabel(component) }}</text>
            <!-- 勾不上任何病种时（驱虫药、看不懂的本子）走这条 -->
            <text
              v-if="draftOf(record, index).components.length === 0"
              class="vaccine-kind__tag"
            >都不是 / 不确定</text>
            <text class="vaccine-kind__edit">修改</text>
          </view>

          <!-- 还没勾：说清楚要做什么，并让顾客照本子勾 -->
          <template v-else>
            <view v-if="matchingIndex === index" class="vaccine-kind__unknown">
              <text class="vaccine-kind__unknown-title">正在匹配产品…</text>
              <text class="vaccine-kind__unknown-desc">
                先从产品库里找，找不到再让 AI 认一次写法。
              </text>
            </view>
            <view v-else class="vaccine-kind__unknown">
              <text class="vaccine-kind__unknown-title">这一针含哪些病种？</text>
              <text class="vaccine-kind__unknown-desc">
                照疫苗本上的成分表勾（组合苗请把含的都点上）。
                勾不上就选「都不是 / 不确定」—— 那只记录、不影响提醒。
              </text>
            </view>
            <view class="vaccine-name-tags">
              <text
                v-for="option in componentOptions"
                :key="option.value"
                class="vaccine-name-tag"
                :class="{ 'vaccine-name-tag--active': draftOf(record, index).components.includes(option.value) }"
                @tap="toggleComponent(index, option.value)"
              >{{ option.label }}</text>
              <text
                class="vaccine-name-tag"
                :class="{ 'vaccine-name-tag--active': isNoneOfThem(record, index) }"
                @tap="toggleNoneOfThem(index)"
              >都不是 / 不确定</text>
            </view>
            <text class="field-hint">
              可多选 —— 点一下选中，再点一下取消。分类由我们按病种判定，你不用管。
            </text>
            <text class="vaccine-kind__done" @tap="closeKindPicker(index)">选好了</text>
          </template>
        </view>

        <view class="field-group">
          <text class="field-label">接种日期</text>
          <!-- :end 直接不让选未来（2026-10-07 老板审计时定）：
               接种日填成未来会被算成已打过，提醒随之消失。
               后端也会拒（此处只是别让顾客白填一遍）。
               扫疫苗本识别出来的日期不受这里限制，保存时后端会把关。 -->
          <picker
            mode="date"
            :value="draftOf(record, index).vaccinationDate"
            :end="getTodayDateString()"
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
          <text
            v-else
            class="vaccine-card__autosave vaccine-card__autosave--quiet"
            :class="{ 'vaccine-card__autosave--just': isJustSaved(record.id) }"
          >
            {{ saveStateLabel(record, index) }}
          </text>
        </view>
      </view>
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
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
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
  /**
   * 后端把这条归成了哪几类（2026-10-05）。
   *
   * 取值 core / rabies / lepto。一支组合苗可能同时属于好几类 ——
   * 卫佳捌既是核心疫苗又含钩端螺旋体。
   * 分类逻辑在后端 domain 层，前端只显示，不重写一套。
   */
  kinds?: string[]
  /** 归类的中文名（"核心疫苗""狂犬疫苗""钩端螺旋体"）—— 内部用，不给顾客看 */
  kindLabels?: string[]
  /**
   * 这一针含哪些病种（2026-10-06）—— **顾客看的就是它**。
   * 类别（kinds）由病种推导，只用来排期。
   */
  components: string[]
  /** 病种的中文名（犬瘟热 / 犬细小病毒 / 犬腺病毒 …） */
  componentLabels?: string[]
  /**
   * 名字**没读全**时的候选产品（2026-10-06 老板要求"认不准就诚实说"）。
   *
   * 识别出「卫佳」而漏了「捌」时，后端会把「卫佳伍 / 卫佳捌 / 卫佳细」
   * 一起给下来 —— 界面如实告诉顾客"这行字可能没读全，请看瓶子核对"，
   * 点一下就用那支（名字和分类一起带对）。
   */
  nameSuggestions?: string[]
}

interface VaccineDraft {
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  /**
   * 归类（2026-10-05）：core / rabies / lepto / other。
   *
   * 来源：选产品库 / 系统按名字自动判 / 顾客自己点。**必须有值**才能存 ——
   * 系统再也不猜（以前认不出来默认当核心苗，一针驱虫药也能把
   * 核心苗的某一针标记成已完成，我们从此不再提醒）。
   */
  kinds: string[]
  /**
   * 这一针含哪些病种（2026-10-06）—— 顾客勾的、产品库带的都写在这里。
   * 类别由后端按它推导。
   */
  components: string[]
  /**
   * 归类是**顾客自己点的**（不是系统判的）。
   *
   * 为真时不再用自动判定覆盖他的选择；改了疫苗名称会重置成 false ——
   * 名字变了就该重新判一次，这是符合直觉的。
   */
  kindsManual: boolean
}

const props = defineProps<{
  dogId: string
  /**
   * 计划里"每一类的下一针"（由 VaccinePlanSection 通过页面转过来）。
   *
   * 2026-10-07 老板定：顶部那条"到期提醒"要**系统按程序自动算**，
   * 不能只看每条记录上人工填的「下次到期日」—— 顾客不填就没提醒，
   * 填错了还会误导。人工填的那个仍然保留，但标明是"疫苗本上写的"。
   */
  planPending?: {
    key: string
    label: string
    kindLabel: string
    status: string
    statusLabel: string
    windowStart: string
  }[]
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
  /**
   * 已保存的接种记录变了（2026-10-05）。
   *
   * 为什么需要：疫苗计划板块只在"换狗"时加载一次。顾客在原地录完几条，
   * 计划那边**没人告诉它**，于是还停在"一条记录都没有"的状态、整块不显示 ——
   * 老板遇到的就是这个："自动识别并录入 3 条之后，并没有弹出疫苗提醒或者计划"。
   * 顺带页面顶部那个"有 N 针该打了"角标也是同样的毛病。
   */
  (event: 'records-changed'): void
}>()

/**
 * 这一行的草稿是否与原值不同。
 *
 * ensureDrafts 会给**每一行**都建草稿，所以"脏"不能只看有没有草稿，
 * 要逐字段和原值比。
 */
function isDirty(record: VaccineRecord, index: number) {
  /*
   * ⚠️ **没有 id = 从来没保存过**，只要填了名字就是"待保存"（2026-10-05 修）。
   *
   * 这条是识别那条路的救命稻草。原来只比"草稿 vs 记录"：
   * 而识别出来的记录，值**本来就在记录里**（扫描结果直接建成记录），
   * 草稿只是它的副本 —— 两边一模一样，于是判定"没有改动"，
   * 自动保存**直接返回、什么都不做**。
   *
   * 表现就是老板反复遇到的：识别完看着加上了，切个标签记录就没了，
   * 而且**一句报错都没有**。
   *
   * 判据用"填了名字"而不是"填了日期"：新增一条空白记录时日期默认是今天，
   * 用日期会把空白记录也当成待保存。
   */
  if (!record.id) {
    return Boolean(draftOf(record, index).vaccineName.trim())
  }

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
  /** 「选文档（PDF / Word）」（2026-10-08 老板要的） */
  startDocumentScan: () => scanRef.value?.startDocumentScan?.(),
  addRecord,
  /** 切标签/离开页面时把等待中的自动保存立刻执行（2026-10-03） */
  flushAutoSaves,
  /**
   * 有几条**填不完、存不了**的记录（2026-10-05）。
   *
   * 切标签会把组件销毁，这些草稿就没了 —— 页面拿这个数拦一下，
   * 别让顾客在毫无提示的情况下丢掉刚填的内容。
   */
  countUnsaveableDrafts: () =>
    records.value.filter((record, index) => !record.id && autoSaveBlockReason(record, index))
      .length,
})

/* ── 疫苗目录（2026-10-05）────────────────────────────────────────────
 * 名称库、归类闭集、产品库都由后端下发 —— 分类与产品是后端的 domain 知识，
 * 前端复制一份迟早对不上（这个项目以前就吃过亏）。
 * 拉不到时页面照旧能用（只是少了产品库），点标签仍然带得出归类。
 */
/* 预设标签已下线（2026-10-05）：它们的唯一价值是"带着归类"，
   而现在**打字就自动判归类**，所以多余了。产品库 + 手填两条路就够。 */
/**
 * 归类选项。
 *
 * ⚠️ **必须有本地兜底**（2026-10-05 踩过）：归类是必填项，
 * 万一目录接口拉不到（比如路由被吃掉那次），选项就是空的 ——
 * 顾客**一个字都存不进去**，还只看到"还差归类，选一个自动保存"，
 * 却没有任何东西可选。必填项依赖的选项不能只靠网络。
 *
 * 这四类是**闭集**，极少变；后端下发优先，拿不到就用这份。
 */
const FALLBACK_COMPONENT_OPTIONS = [
  { value: 'cdv', label: '犬瘟热' },
  { value: 'cpv', label: '犬细小病毒' },
  { value: 'cav', label: '犬腺病毒' },
  { value: 'rabies', label: '狂犬病' },
  { value: 'lepto', label: '钩端螺旋体' },
]
const componentOptions = ref<{ value: string; label: string }[]>([
  ...FALLBACK_COMPONENT_OPTIONS,
])
const catalogProducts = ref<{
  name: string
  manufacturer: string
  kinds: string[]
  components: string[]
}[]>([])

async function loadVaccineCatalog() {
  try {
    const res: any = await dogApi.vaccineCatalog()
    if (res?.code !== 0 || !res?.data) return
    // 只在下发的内容非空时才覆盖本地兜底 —— 后端万一返回空数组，
    // 也不能把顾客选归类的路堵死
    if (Array.isArray(res.data.components) && res.data.components.length > 0) {
      componentOptions.value = res.data.components
    }
    catalogProducts.value = Array.isArray(res.data.products) ? res.data.products : []
  } catch {
    // 目录是加分项：拉不到就退回"点标签 + 自己选归类"，不挡主流程
  }
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
const matchingIndex = ref(-1)

/**
 * 「确认」之后留在卡片上的那行结果（2026-10-06）。
 *
 * 老板："我点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
 * 原因是这个按钮原来只弹一个一闪而过的 toast，而且命中产品库时
 * 分类本来就已经是对的、画面上没有任何变化 —— 看起来就像按钮坏了。
 * 现在把结果写进卡片，留着不走：顾客按了就有东西可看。
 */
const confirmResults = reactive<
  Record<number, { ok: boolean; text: string }>
>({})

function setConfirmResult(index: number, ok: boolean, text: string) {
  confirmResults[index] = { ok, text }
}

function clearConfirmResult(index: number) {
  if (confirmResults[index]) {
    delete confirmResults[index]
  }
}

async function confirmVaccineName(index: number) {
  const record = records.value[index]
  if (!record) return
  const draft = draftOf(record, index)
  const name = draft.vaccineName.trim()

  if (!name) {
    // 不再只用一闪而过的 toast —— 结果留在卡片上，顾客回头还看得到
    setConfirmResult(index, false, '还没写疫苗名称。先在上面写清楚，再点确认。')
    return
  }

  matchingIndex.value = index
  clearConfirmResult(index)
  try {
    const res: any = await dogApi.classifyVaccineName(name)
    // 等回来时名字可能又变了 —— 只认当前这个名字的结果
    if (draftOf(record, index).vaccineName.trim() !== name) return
    if (res?.code !== 0 || !res?.data) {
      setConfirmResult(index, false, '匹配失败，请再点一次确认。')
      return
    }

    draft.kinds = Array.isArray(res.data.kinds) ? res.data.kinds.map(String) : []
    draft.kindsManual = false
    // 匹配上了就收起选择器（顾客不用做我们的活）；
    // 没匹配上就**如实承认**并展开，让他自己填
    kindPickerOpen[index] = draft.kinds.length === 0

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
      record.nameSuggestions = res.data.nameSuggestions.map(String)
    }
    const canonicalName = String(res.data.productName || '')
    const matched = canonicalName ? { name: canonicalName } : findCatalogProduct(name)

    // 后端认出来的病种回填到界面（顾客看到的是病种）
    if (Array.isArray(res.data.components)) {
      const components = res.data.components.map(String)
      if (components.length > 0) {
        draft.components = components
      }
    }

    if (draft.kinds.length === 0) {
      setConfirmResult(
        index,
        false,
        '产品库和 AI 都没认出这支苗。照本子上的写法再核一遍，或者在下面手动勾一下病种。',
      )
    } else {
      if (canonicalName) {
        // 名字跟着一起对齐，界面上那一行才显示得出"系统认为这是哪一支"
        draft.vaccineName = canonicalName
      }
      // 结果行里说的是**病种**（顾客看得懂的东西），不是内部类别
      const labels = draft.components.map((component) => componentLabel(component)).join(' + ')
      setConfirmResult(
        index,
        true,
        matched
          ? `已确认：${matched.name}${labels ? ` · 含「${labels}」` : ''}`
          : `已确认：${name}${labels ? ` · 含「${labels}」` : ''}`,
      )
    }
    scheduleAutoSave(record, index, { immediate: true })
  } catch (error: any) {
    setConfirmResult(index, false, error?.message || '匹配失败，请再点一次确认。')
  } finally {
    if (matchingIndex.value === index) {
      matchingIndex.value = -1
    }
  }
}

/**
 * 点"没读全"的候选 → 等同于从产品库里选了那一支。
 *
 * 老板 2026-10-06："如果不能完全有把握的识别出来，能不能诚实的告诉用户呢？"
 * 告诉他之后还得让他一键改对 —— 不然知道了还得自己去找产品库。
 */
function applySuggestedProduct(index: number, name: string) {
  const at = catalogProducts.value.findIndex((item) => item.name === name)
  if (at >= 0) {
    applyCatalogProduct(index, at)
  }
  // 用掉了就不再提示
  const record = records.value[index]
  if (record) record.nameSuggestions = []
}

/** 从产品库选 → 名字、归类一起带出来（厂商/批准文号后端有，界面只显示名） */
function applyCatalogProduct(index: number, value: string | number) {
  const record = records.value[index]
  const product = catalogProducts.value[Number(value)]
  if (!record || !product) return
  const draft = draftOf(record, index)
  draft.vaccineName = product.name
  // 病种由产品库带出来（2026-10-06）；类别由后端按病种推导
  draft.components = Array.isArray(product.components) ? [...product.components] : []
  draft.kinds = [...product.kinds]
  // 产品库里选的：归类是确定的，直接在卡片上说明白（和点「确认」同样的交代）
  setConfirmResult(
    index,
    true,
    `已选择：${product.name} · 含「${(product.components || [])
      .map((component) => componentLabel(component))
      .join(' + ')}」`,
  )
  // 产品的归类是**确定**的（数据库里核过成分），不需要再问后端
  draft.kindsManual = false
  scheduleAutoSave(record, index, { immediate: true })
}

/**
 * 分类选择器是否展开（2026-10-05）。
 *
 * 默认收起 —— 分类是系统判的，不给顾客摆一排选项让他做我们的活。
 * 两种情况展开：① 系统没认出来（必须让顾客填，否则这条存不了）
 *              ② 顾客自己点了"修改"（他的记录，他想改就改）
 */
const kindPickerOpen = reactive<Record<number, boolean>>({})

function openKindPicker(index: number) {
  kindPickerOpen[index] = true
}

function componentLabel(component: string): string {
  return componentOptions.value.find((item) => item.value === component)?.label || component
}

/** 已经勾过病种（或者明确选了"都不是"）—— 决定那一行是显示结果还是展开选择器 */
function hasComponentSelection(record: VaccineRecord, index: number): boolean {
  const draft = draftOf(record, index)
  return draft.components.length > 0 || draft.kinds.includes('other')
}

/** 明确选了"都不是 / 不确定" */
function isNoneOfThem(record: VaccineRecord, index: number): boolean {
  const draft = draftOf(record, index)
  return draft.components.length === 0 && draft.kinds.includes('other')
}

/**
 * 勾/取消一个**病种**（2026-10-06 老板定的模型）。
 *
 * 顾客勾的是病种，类别由后端推导 —— 所以这里只动 components，
 * kinds 留给后端算（本地那份只用于"能不能存"的判断）。
 * 点"都不是"时会把病种清空、标一个 other，见 toggleNoneOfThem。
 */
function toggleComponent(index: number, component: string) {
  const record = records.value[index]
  if (!record) return
  const draft = draftOf(record, index)

  draft.components = draft.components.includes(component)
    ? draft.components.filter((item) => item !== component)
    : [...draft.components, component]

  // 勾了真病种就不再是"都不是"
  if (draft.components.length > 0) {
    draft.kinds = draft.kinds.filter((kind) => kind !== 'other')
  }
  draft.kindsManual = true
  // client 侧先把 kinds 清空：真正的类别由后端按病种推导后回填
  scheduleAutoSave(record, index, { immediate: true })
}

/**
 * 「都不是 / 不确定」—— 驱虫药、看不懂的本子这类。
 *
 * 勾不上任何病种时给一条出路：记下来，但**不参与计划**
 * （对应 kinds 里的 other）。不然顾客会被"必须勾一个病种"卡住。
 */
function toggleNoneOfThem(index: number) {
  const record = records.value[index]
  if (!record) return
  const draft = draftOf(record, index)
  const already = draft.components.length === 0 && draft.kinds.includes('other')

  draft.components = []
  draft.kinds = already ? [] : ['other']
  draft.kindsManual = true
  scheduleAutoSave(record, index, { immediate: true })
}

/**
 * 产品名归一化 —— 规则与后端 `normalizeProductText` **逐条一致**。
 *
 * ⚠️ 2026-10-06 老板报的 bug 就出在这里：产品库下发的规范名是
 * 「宠必威幼犬保」，而疫苗本识别出来的是「宠必威® 幼犬保」。
 * 前端原来拿 `===` 比，比不中 → 名称那一行退回显示"从产品库选择"，
 * 识别出来的名字只能留在下面的手填输入框里 ——
 * 老板看到的就是"疫苗名称并未正确加载出来"。
 *
 * 后端判定归类时本来就会去掉 ® / 空格 / 分隔符（所以分类一直是对的），
 * 前端显示也得用同一套规则，否则"库里有这只苗"这件事两边说法不一致。
 * 后端改了这里也要跟着改 —— 两边不一致会直接表现为"名字显示不出来"。
 */
function normalizeProductName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[·・\-_/\\、,，.。．()（）【】\[\]]/g, '')
}

/** 在目录里找这个名字对应的产品（归一化之后比），找不到回 null */
function findCatalogProduct(name: string) {
  const key = normalizeProductName(name)
  if (!key) return null
  return (
    catalogProducts.value.find((item) => normalizeProductName(item.name) === key) ||
    null
  )
}

/**
 * 这个名字在产品库里认不认得出（归一化之后比）。
 *
 * 认得出 = 这一行显示规范名、并且**不出现**手填输入框。
 */
function isNameRecognized(name: string): boolean {
  return findCatalogProduct(name) !== null
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
function showConfirmButton(index: number): boolean {
  const record = records.value[index]
  if (!record) return false
  const draft = draftOf(record, index)
  if (!draft.vaccineName.trim()) return false
  if (draft.kinds.length === 0) return true
  return nameFieldMode(draft.vaccineName) === 'unknown'
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
function nameFieldLabel(name: string, index: number): string {
  const matched = findCatalogProduct(name)
  if (matched) return matched.name
  return showManualNameInput(index)
    ? '＋ 从产品库选一支'
    : '从产品库选择（进口 / 国产都有）'
}

function productIndex(name: string): number {
  const key = normalizeProductName(name)
  if (!key) return 0
  const found = catalogProducts.value.findIndex(
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
function showManualNameInput(index: number): boolean {
  const record = records.value[index]
  if (!record) return true
  const name = draftOf(record, index).vaccineName.trim()
  if (!name) return true
  if (focusIndex.value === index) return true
  return findCatalogProduct(name) === null
}

/**
 * 顾客手动指定分类 —— **多选开关**（2026-10-06 第二轮）。
 *
 * 中间走过一段弯路，记在这里免得再走回去：
 *
 *   老板第一次说"不管点哪一个分类，都改不动，还是原来的这个分类"，
 *   真正的原因是**后端更新记录时漏写了 kinds**（已修）。我当时代价最小地
 *   把手动选择改成了单选，顺手把组合苗的多选能力也改没了。
 *
 *   老板第二次就把这个洞看出来了："卫佳捌这种多分类的产品……
 *   手动是没有办法多选标签的，对吗？" —— 对。
 *   少勾一类的后果很实际：免疫计划会以为钩端那一步还没打。
 *
 * 所以恢复多选。上次那个"改不动"的观感不会回来 —— 后端现在真的存得进去，
 * 点一下标签立刻高亮、也立刻落库。为了让"多选"这件事本身看得懂：
 *   · 标签下面写明"可多选"，并举卫佳捌这个例子；
 *   · 点一下不再自动收起选择器（不然多选根本没法操作），
 *     旁边给一个「选好了」手动收起。
 */
function toggleKind(index: number, kind: string) {
  const record = records.value[index]
  if (!record) return
  const draft = draftOf(record, index)

  // 点已选中的 = 取消这一类；点没选中的 = 加上这一类（组合苗可以同时好几类）
  draft.kinds = draft.kinds.includes(kind)
    ? draft.kinds.filter((item) => item !== kind)
    : [...draft.kinds, kind]

  // 顾客自己点过就不再用自动判定覆盖他
  draft.kindsManual = true
  // ⚠️ 这里**不收起**选择器：收起就没法再点第二类了
  scheduleAutoSave(record, index, { immediate: true })
}

/** 「选好了」—— 手动收起分类选择器（多选模式下的出口） */
function closeKindPicker(index: number) {
  kindPickerOpen[index] = false
}

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
    // 记录自己存的归类；老记录是空的，由界面提示顾客补选。
    // 已保存的记录一律算"人工指定过" —— 别因为我们自动判一次就改掉库里存的。
    kinds: Array.isArray(record.kinds) ? record.kinds.map(String) : [],
    // 病种（2026-10-06）：顾客看的就是它。老记录可能是空的，
    // 界面会按名字/产品库补一次（后端映射时已经兜过）。
    components: Array.isArray(record.components) ? record.components.map(String) : [],
    kindsManual: Array.isArray(record.kinds) && record.kinds.length > 0,
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

  // 又改了 —— "刚刚保存 ✓"那个高亮先撤掉，免得它跟"保存中…"打架
  // （常驻的「已保存」不动：它说的是"这条在库里"，跟这次编辑无关）
  const editingId = String(record.id || '')
  if (editingId && justSavedIds.value[editingId]) {
    const next = { ...justSavedIds.value }
    delete next[editingId]
    justSavedIds.value = next
  }

  // 名字变了 → 重新自动判一次归类（顾客之前手点的作废：名字都换了）
  // 名字改了 → 之前的匹配结果作废，等顾客点「确认」重新匹配
  if (field === 'vaccineName') {
    draft.kindsManual = false
    draft.kinds = []
    kindPickerOpen[index] = false
    // "已确认：xxx"那行也跟着撤掉 —— 名字都换了，再留着就是在说假话
    clearConfirmResult(index)
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
  /*
   * 接种日期不能晚于今天（2026-10-07 老板审计时定）。
   *
   * 为什么放在这里：**手填和 AI 识别两条路都走这个函数**。
   * 日期选择器加了 :end 只能管住手点的那种；AI 把年份读错（2024 → 2042）
   * 时不走选择器，必须在保存前统一拦一道 —— 否则那一针会被当成
   * "已经打过"，本来该提醒的步骤直接消失。
   *
   * 拦下来时**不去撞后端**：卡片上挂着这句话，顾客一眼知道是哪一行要改。
   * 日期早于狗狗生日**不在这里拦**（生日本身可能是估的）。
   */
  if (draft.vaccinationDate > getTodayDateString()) return '接种日期不能晚于今天'
  // 归类必填（2026-10-05 老板：手填时"类型还是必填项"）。
  // 没有归类这一条记录就不该进计划 —— 认不出来当核心苗是以前最坏的那个 bug。
  // 病种必填（2026-10-06）：勾不上就选「都不是 / 不确定」。
  // 没有病种这一条就不该参与计划 —— 认不出来当核心苗是以前最坏的那个 bug。
  if (draft.components.length === 0 && !draft.kinds.includes('other')) {
    return '还差病种，勾一个（或选"都不是"）自动保存'
  }
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

/** 疫苗名跟已保存的不一样了（改过名字） */
function vaccineNameChanged(record: VaccineRecord, index: number): boolean {
  return (
    draftOf(record, index).vaccineName.trim() !==
    String(record.vaccineName || '').trim()
  )
}

/**
 * 这条记录当前的归类标签（**只对这种已保存的名字权威**）。
 *
 * 分类逻辑只有后端一份（靠已审核的产品目录判成分），前端不重写一套 ——
 * 否则两边迟早对不上。所以名字一改，旧标签就作废，宁可显示
 * "保存后会自动更新归类"，也不拿过期的结果糊弄顾客。
 * 自动保存 1.2 秒后落库，标签随即刷新。
 */
function kindLabelsOf(record: VaccineRecord, index: number): string[] {
  return vaccineNameChanged(record, index) ? [] : record.kindLabels || []
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

  /*
   * ⚠️ 这里是**疫苗本上写的**到期日（人工/AI 抄下来的），不是系统推算的 ——
   * 2026-10-07 老板定：两种日期不能混着说，所以这里明确标出"疫苗本上"。
   * 系统按程序算出来的那一份在顶部提醒条和接种计划里。
   */
  if (days < 0) {
    return `疫苗本上写的到期日 ${draft.nextDueDate}（已过期 ${Math.abs(days)} 天）`
  }

  if (days === 0) {
    return `疫苗本上写的到期日就是今天（${draft.nextDueDate}）`
  }

  return `疫苗本上写的到期日 ${draft.nextDueDate}（还有 ${days} 天）`
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
  /*
   * 先看**计划算出来的**"每一类的下一针"（2026-10-07 老板定的口径）。
   *
   * 计划没加载出来时（或老后端不带这个数据），才退回"记录里人工填的
   * 下次到期日"那套 —— 有数据就一定用系统算的。
   */
  const pending = props.planPending || []
  if (pending.length > 0) {
    const actionable = pending.filter(
      (step) => step.status === 'DUE' || step.status === 'OVERDUE',
    )
    const nearest = [...pending].sort((a, b) =>
      a.windowStart.localeCompare(b.windowStart),
    )[0]
    if (actionable.length > 0) {
      return `按接种计划：${actionable.map((step) => step.label).join('、')} 该打了`
    }
    if (nearest) {
      return `按接种计划：下一针是 ${nearest.label}（${nearest.windowStart} 起）`
    }
  }

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

// 疫苗目录只在进页面时拉一次（静态数据，不随狗变）
onMounted(() => {
  void loadVaccineCatalog()
})

/**
 * 已保存记录的"指纹"（只用有 id 的，草稿不算）。
 *
 * 用它挡掉重复通知：加载会触发通知，但只有**真正变了**才需要往上喊，
 * 否则每次进页面都会让计划板块白重载一次。
 */
const savedRecordsSignature = ref('')

function notifyRecordsChanged() {
  const signature = records.value
    .filter((record) => record.id)
    .map((record) => record.id)
    .join('|')

  if (signature === savedRecordsSignature.value) {
    return
  }
  savedRecordsSignature.value = signature
  emit('records-changed')
}

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
    const fromServer: VaccineRecord[] = (Array.isArray(list) ? list : [])
      .map((item: any) => ({
        id: String(item?.id || ''),
        vaccineName: String(item?.vaccineName || ''),
        vaccinationDate: String(item?.vaccinationDate || '').slice(0, 10),
        nextDueDate: String(item?.nextDueDate || '').slice(0, 10),
        notes: String(item?.notes || ''),
        status: toDraft(item).status,
        kinds: Array.isArray(item?.kinds) ? item.kinds.map(String) : [],
        kindLabels: Array.isArray(item?.kindLabels)
          ? item.kindLabels.map(String)
          : [],
        components: Array.isArray(item?.components) ? item.components.map(String) : [],
        componentLabels: Array.isArray(item?.componentLabels)
          ? item.componentLabels.map(String)
          : [],
      }))

    /*
     * ⚠️ **保住还没保存的本地记录**（2026-10-06 修的）。
     *
     * 这一句是"识别 3 条只存进去 1 条"的根因：
     * `saveScannedRecords` 逐条存，而每存一条 `saveRecord` 都会走到这里
     * 整表重载 —— 重载原来是**拿服务器返回的列表直接替换**，
     * 于是同一批里还没保存的那几条（id 还是空的）当场被冲掉，
     * 后面的循环再也找不到它们，只能跳过。
     *
     * 服务器上有的以服务器为准；本地还没保存的原样留着。
     */
    const unsavedLocal = records.value.filter((record) => !record.id)

    records.value = [...fromServer, ...unsavedLocal]
      // 最近接种的排在最前：接口按写入顺序返回，那个顺序对顾客没有意义
      .sort((a: VaccineRecord, b: VaccineRecord) =>
        b.vaccinationDate.localeCompare(a.vaccinationDate))

    // 记录刷新后重建草稿，避免留下已被删除记录的编辑态
    ensureDrafts()
    if (expandedIndex.value >= records.value.length) {
      expandedIndex.value = -1
    }
    // 存/删/识别都会经过这里 —— 一处通知，疫苗计划与角标跟着更新
    notifyRecordsChanged()
  } catch (error: any) {
    records.value = []
    ensureDrafts()
    // 拉失败也要通知一声（2026-10-06）：否则计划板块还停在上一次的结果上。
    // 具体场景：把记录删空之后这一拉失败，计划和提醒会一直挂着旧的，
    // 顾客以为"删了也没用"。
    notifyRecordsChanged()
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
/**
 * 这条是不是**已经记过了**（同一天、同一支苗）。
 *
 * 2026-10-06 老板问："如果我疫苗本上多贴了一个最新接种的疫苗的标签，
 * 但是我拍照拍的还是整本疫苗本，那 AI 会把这单独的一个新增的接种记录
 * 识别出来，而不会重复记录吗？"
 *
 * 查下来**当时是会的**：AI 把整本读出来（这是对的），但保存那一步
 * 一条不落地全存 —— 已经记过的会被再存一遍。
 * 所以这里加去重：同一天 + 同一支苗（名字归一化后相等）就算记过了。
 *
 * 只跟**已保存的记录**（有 id 的）比：本地还没保存的草稿不算数，
 * 否则同一批里刚识别出来的会被自己挡掉。
 */
function isAlreadyRecorded(name: string, date: string): boolean {
  const day = String(date || '').trim()
  const key = normalizeProductName(name)
  if (!day || !key) return false

  return records.value.some((record) => {
    if (!record.id) return false
    if (String(record.vaccinationDate || '').slice(0, 10) !== day) return false
    const existing = normalizeProductName(record.vaccineName || '')
    return existing.length > 0 && existing === key
  })
}

function onVaccineBookScanned(payload: { drafts: Record<string, any>[] }) {
  let skipped = 0

  for (const draft of payload.drafts) {
    // 已经记过的跳过（整本重拍时不会重复记）
    const scannedName = String(draft.productName || draft.vaccineName || '')
    const scannedDate = String(draft.vaccinationDate || '').slice(0, 10)
    if (isAlreadyRecorded(scannedName, scannedDate)) {
      skipped += 1
      continue
    }

    records.value.push({
      id: '',
      __localId: `vaccine-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      /*
       * 名字优先用**后端认出来的规范产品名**（2026-10-06 老板实测）。
       *
       * 瓶签上写的是「卫佳® Vanguard® Plus 5/CV-L」，库里叫「卫佳捌」
       * （别名 vanguard plus 5-cvl）。分类早就是按卫佳捌的成分算的
       * （核心 + 钩端），名字却还是瓶签原文 —— 顾客看到的是一个
       * "系统好像没认出来"的名字，手填框也会跟着冒出来。
       * 认不出来时后端给空串，这里就照旧用顾客本子上那串字。
       */
      vaccineName: String(draft.productName || draft.vaccineName || ''),
      nameSuggestions: Array.isArray(draft.nameSuggestions)
        ? draft.nameSuggestions.map(String)
        : [],
      vaccinationDate: String(draft.vaccinationDate || ''),
      nextDueDate: String(draft.nextDueDate || ''),
      notes: String(draft.notes || ''),
      status: 'COMPLETED',
      // AI 判的归类（2026-10-05）。后端已经过了一遍闭集校验：
      // 认不出来的会是空数组，界面会请顾客自己选一下 —— 不让它悄悄变成核心苗。
      kinds: Array.isArray(draft.kinds) ? draft.kinds.map(String) : [],
      components: Array.isArray(draft.components) ? draft.components.map(String) : [],
      // AI 判的也算"已指定"，但标成自动 —— 顾客仍可改
      kindsManual: false,
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
  // 回执要用（存完之后一起告诉顾客"跳过几条"）
  lastScanSkipped.value = skipped
  /*
   * 去重的结果**要说出来**（2026-10-06）：
   * 不吭声地跳过，顾客会以为"怎么少了一条"；
   * 一次都没跳过的正常情况就还是原来那句话，不啰嗦。
   */
  scanNotice.value =
    skipped > 0
      ? `这次识别出 ${scanned} 条，其中 ${skipped} 条已经记过（同一天、同一支苗），已跳过，只新增 ${scanned - skipped} 条。`
      : ''
  uni.showToast({
    title:
      skipped > 0
        ? `识别 ${scanned} 条，跳过 ${skipped} 条已记过的`
        : `已确认 ${scanned} 条，正在保存…`,
    icon: 'none',
  })

  // ⚠️ **必须重建草稿**：不重建的话 drafts 里没有这几条，
  // isDirty 取不到草稿、后面编辑也会写进一个临时对象里丢掉。
  ensureDrafts()

  void saveScannedRecords()
}

/**
 * 把识别出来的记录一条条存下去（2026-10-05）。
 *
 * 两个坑都踩过，写在这里免得再犯：
 *
 * 1. **不能并发**。`saveRecord` 里有 `if (isBusy.value) return`，
 *    同时发起只会存第一条、其余静默丢掉（以前就是"存了一条"）。
 * 2. **不能按下标循环**。`saveRecord` 存完会 `loadRecords()` 整表重载，
 *    排序也变了，下标全作废 —— 所以每次都按"名称 + 日期"重新找那一条。
 */
/**
 * 存完的**整批回执**（2026-10-08 老板要的"存完整批回执小结"）。
 *
 * 为什么要它：这一批是逐条存的 —— 存成功只在卡片上闪 2 秒「已保存」，
 * 存不下只在卡片上挂一句话。家长**不知道"8 条里到底进去了几条"** ✗
 * （实测他自己就会问："我刚才那 8 条都进去了吗？"）
 */
const lastScanSkipped = ref(0)

const scanReceipt = ref<{
  saved: number
  skipped: number
  needsFix: string[]
  nextLabel: string
} | null>(null)

function dismissScanReceipt() {
  scanReceipt.value = null
}

async function saveScannedRecords() {
  const pending = records.value
    .filter((record) => !record.id)
    .map((record) => ({
      name: record.vaccineName,
      date: record.vaccinationDate,
    }))

  for (const want of pending) {
    const index = records.value.findIndex(
      (record) =>
        !record.id &&
        record.vaccineName === want.name &&
        record.vaccinationDate === want.date,
    )
    // 找不到了 = 那一条已经存好（重载后拿到 id 了）
    if (index < 0) continue

    const record = records.value[index]
    const reason = autoSaveBlockReason(record, index)
    if (reason) {
      // 缺什么就把话说出来（以前是静默 return，顾客以为存好了）
      autoSaveNotices.value = { ...autoSaveNotices.value, [index]: reason }
      continue
    }

    await saveRecord(record, index)
  }

  // 存完重刷一遍提示：重载之后下标变了，把还没存上的重新标出来
  const stillUnsaveable: Record<number, string> = {}
  records.value.forEach((record, index) => {
    if (record.id) return
    const reason = autoSaveBlockReason(record, index)
    if (reason) stillUnsaveable[index] = reason
  })
  autoSaveNotices.value = stillUnsaveable

  /*
   * 整批回执：进去几条、跳过几条、还差几条、以及"下一次该打什么"。
   * 「下一次」用的是计划算出来的那一针（不是人工填的到期日）。
   */
  const savedCount = pending.length - Object.keys(stillUnsaveable).length
  const nextPending = (props.planPending || [])
    .filter((step) => step.status === 'DUE' || step.status === 'OVERDUE' || step.status === 'UPCOMING')
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart))[0]

  scanReceipt.value = {
    saved: Math.max(0, savedCount),
    skipped: lastScanSkipped.value,
    needsFix: Object.values(stillUnsaveable),
    nextLabel: nextPending ? `${nextPending.label}（${nextPending.windowStart} 起）` : '',
  }
  lastScanSkipped.value = 0
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
/**
 * 新增一条空白记录。
 *
 * @param prefill 预填（2026-10-06）：从接种计划的某一步点「记录疫苗接种信息」
 *   进来时，把那一步的分类带上 —— 顾客点的就是"狂犬疫苗 第 3 次"，
 *   这条记录本来就该归到狂犬疫苗，让他再选一次既白费事又容易选错。
 */
function addRecord(prefill?: { kinds?: string[] }) {
  const draft: VaccineRecord = {
    id: '',
    vaccineName: '',
    vaccinationDate: today,
    nextDueDate: '',
    notes: '',
    status: 'COMPLETED',
    kinds: Array.isArray(prefill?.kinds) ? [...prefill.kinds] : [],
    // 计划带来的分类是"系统给的"，不是顾客手点的 —— 名字一改就该重判
    kindsManual: false,
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
    /*
     * 病种（2026-10-06）：顾客勾的就是它，**类别由后端按病种推导**。
     * 两个都带上：kinds 只在"都不是/不确定"时用到（那时病种是空的，
     * 后端会退回按 kinds 记成 other）。
     */
    components: draft.components,
    kinds: draft.kinds,
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

    /*
     * ⚠️ **必须先把 id 写回本地这一条，再重载**（2026-10-06 修）。
     *
     * 老板报的"上传的疫苗本上只有 3 次接种记录，确认之后却有 6 条"就是这个：
     * 创建成功之后本地这条记录的 id 还是空的，紧接着 loadRecords() 里
     *   `unsavedLocal = records.value.filter((record) => !record.id)`
     * 把它当成"还没保存的草稿"原样留了下来 —— 于是**服务端刚建的那条
     * 和本地这条幽灵同时显示**。识别 3 条就变成 3 真 + 3 幽灵 = 6 条。
     * （数据库里其实一直是 3 条，是界面在重复显示。）
     *
     * 危险的不止是显示：这条幽灵仍然是"待保存"状态，
     * 顾客后来只要碰它一下，就会真的再创建一条 —— 变成脏数据。
     */
    if (!record.id && newId) {
      record.id = newId
    }

    await loadRecords()

    if (newId) {
      const relocated = records.value.findIndex((item) => item.id === newId)
      if (relocated >= 0) {
        expandedIndex.value = relocated
        // 按**id**高亮（不是下标）：loadRecords 会重排，下标会认错卡片
        markSaved(String(newId))
      }
    }
  } catch (error: any) {
    const message = String(error?.message || '保存失败，请重试')
    /*
     * 后端拒绝的原因要**留在卡片上**（2026-10-07 老板要求）。
     *
     * 只弹 2 秒的 toast 不够：一次识别出好几条、逐条自动保存时，
     * 顾客根本不知道是哪一行出的问题，而那行卡片看起来还跟"存好了"一样。
     * 挂成卡片内的提示（跟"还差病种"同一种），他才知道该改哪一条。
     * 下一次改动会重新走保存，存成功了这行字自动消失。
     */
    autoSaveNotices.value = { ...autoSaveNotices.value, [index]: message }
    uni.showToast({ title: message, icon: 'none' })
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
/**
 * 上次扫描的"去重结果"提示（2026-10-06）。
 *
 * 整本重拍时，已经记过的会被跳过 —— 这件事必须说出来，
 * 否则顾客看到"识别 4 条却只多了 1 条"会以为丢了。
 */
const scanNotice = ref('')

/*
 * ══ 保存状态（2026-10-08 改）══════════════════════════════════════════════
 *
 * 老板 2026-10-05 踩过的坑："草稿卡片看起来跟已保存的一模一样，其实没入库" ——
 * 家长以为存好了，删不掉也改不了，计划那边还认为"没有接种记录"。
 *
 * 之前的做法是**保存成功后闪 2 秒「已保存」**，两个毛病：
 *   ① 2 秒之后什么都不显示 → 又分不清哪条真的进档案了；
 *   ② 那行字按**下标**记，而保存完会整表重载、记录会重排 →
 *      那句「已保存」可能闪在**别的卡片**上 ✗（同类的下标 bug 这个组件踩过好几次）。
 *
 * 现在改成分两层：
 *   · **常驻**：有 id 就是「已保存」，没有就是「还没保存 · 填完自动保存」——
 *     这件事本来就写在数据里，不需要额外状态，也不会消失；
 *   · **刚刚保存**：按**记录 id** 记的一次高亮（2 秒），只为回答
 *     "我刚改的那一下存上了吗"，重排也不会认错卡片。
 */
const justSavedIds = ref<Record<string, boolean>>({})
const justSavedTimers = new Map<string, ReturnType<typeof setTimeout>>()

function markSaved(recordId: string) {
  const id = String(recordId || '')
  if (!id) return
  justSavedIds.value = { ...justSavedIds.value, [id]: true }

  const pending = justSavedTimers.get(id)
  if (pending) clearTimeout(pending)
  justSavedTimers.set(
    id,
    setTimeout(() => {
      justSavedTimers.delete(id)
      if (!justSavedIds.value[id]) return
      const next = { ...justSavedIds.value }
      delete next[id]
      justSavedIds.value = next
    }, 2000),
  )
}

function isJustSaved(recordId: string | undefined): boolean {
  const id = String(recordId || '')
  return Boolean(id) && Boolean(justSavedIds.value[id])
}

/** 这一条现在是什么保存状态（卡片上常驻显示） */
function saveStateLabel(record: VaccineRecord, index: number): string {
  if (record.id) {
    return isJustSaved(record.id) ? '已保存 ✓' : '已保存'
  }
  return '还没保存 · 填完自动保存'
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

/* ── 接种记录板块（2026-10-06 老板第二次改）──────────────────────────
   原来这块是"一个漂浮的标题 + 几张各自独立的小卡"，跟上面「接种计划」
   那张完整的卡不是一套语言。现在整块收进一张卡：
   表头一行（标题 + 条数 + 一句说明），下面是用分隔线排开的记录行。 */
.records-card {
  margin-top: 20rpx;
  padding: 24rpx 24rpx 10rpx;
}

.records-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.records-card__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.records-card__count {
  flex-shrink: 0;
  padding: 4rpx 16rpx;
  font-size: 21rpx;
  color: #4e6b52;
  background: #eef2e6;
  border-radius: 999rpx;
}

.records-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a968a;
}

/* 扫描去重的结果提示（2026-10-06）—— 不吭声跳过会被当成丢数据 */
.records-card__notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 14rpx;
  padding: 14rpx 18rpx;
  border-radius: 14rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.records-card__notice-text {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a6f3d;
}

.records-card__notice-close {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 600;
  color: #6b6653;
}

.records-card__empty {
  padding: 22rpx 0 24rpx;
}

.records-card__empty-title {
  font-size: 26rpx;
  color: #6b6653;
}

.records-card__empty-text {
  font-size: 24rpx;
  color: #8a968a;
}

.records-list {
  margin-top: 8rpx;
}

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

/* 一条记录 = 板块里的一行。
   原来它自带底色、边框、圆角和外边距（各自独立的卡），几张摞在一起看着散、
   也看不出这是一个列表。现在只留一条分隔线，靠"行"来讲清楚它是一组。 */
.vaccine-card {
  padding: 22rpx 0;
  border-top: 1rpx solid #eef1e8;
}

.records-list .vaccine-card:first-child {
  border-top: none;
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

/* 库里没有这支苗时的说明（2026-10-06）：比普通提示更醒目一点，
   因为它要顶替原来那个"从产品库选一支"的入口 */
.field-hint--unknown {
  color: #8a6f3d;
}

.vaccine-confirm-result--ok {
  color: #3d6b4a;
}

.vaccine-confirm-result--warn {
  color: #b26a2f;
}

/* 「选好了」—— 多选模式下收起分类选择器的出口（2026-10-06） */
.vaccine-kind__done {
  display: inline-block;
  margin-top: 14rpx;
  padding: 10rpx 24rpx;
  font-size: 23rpx;
  font-weight: 600;
  color: #1e3a2f;
  background: #eef2e6;
  border-radius: 999rpx;
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

/* 判定结果右侧的"修改"：不抢眼，但找得到 */
.vaccine-kind__edit {
  align-self: center;
  margin-left: 6rpx;
  font-size: 22rpx;
  color: #8a968a;
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


/* 存完整批回执（2026-10-08） */
.receipt {
  margin: 12rpx 0;
  padding: 20rpx;
  border-radius: 12rpx;
  background: #eef8f2;
  border: 1rpx solid #0f7b49;
  display: flex;
  flex-direction: column;
}
.receipt__title {
  font-size: 28rpx;
  color: #0f7b49;
  font-weight: 600;
}
.receipt__warn {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #c0392b;
}
.receipt__next {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #333333;
}
.receipt__close {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #0f7b49;
  text-align: right;
}

/* 刚刚保存成功的高亮（2 秒，之后回到常驻的「已保存」）*/
.vaccine-card__autosave--just {
  color: #0f7b49;
  font-weight: 600;
}
</style>
