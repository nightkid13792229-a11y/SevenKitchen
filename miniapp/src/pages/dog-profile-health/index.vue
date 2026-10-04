<template>
  <view class="page">
    <!-- 顶部 Banner（2026-10-01 老板调整）：
         左侧头像 + 名字（多只狗时可点切换），右侧是这个孩子的基本信息。
         原来的「健康管理」小标题与那句说明文字已删 —— Banner 是门面，
         一眼看到"这是谁、多大、什么品种、多重"就够了。 -->
    <view class="hero-card">
      <view class="hero-card__row">
        <picker
          v-if="dogs.length > 1"
          class="hero-card__identity"
          mode="selector"
          :range="dogs"
          range-key="name"
          :value="selectedDogIndex"
          @change="onDogPickerChange"
        >
          <view class="hero-card__identity-inner">
            <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
            <view class="hero-card__name-block">
              <view class="hero-card__name-row">
                <text class="hero-card__title">{{ form.name || '请选择狗狗' }}</text>
                <text class="hero-card__switch">切换 ▼</text>
              </view>
            </view>
          </view>
        </picker>
        <view v-else class="hero-card__identity">
          <view class="hero-card__identity-inner">
            <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
            <view class="hero-card__name-block">
              <text class="hero-card__title">{{ form.name || '健康档案' }}</text>
            </view>
          </view>
        </view>

        <view v-if="heroFacts.length" class="hero-card__facts">
          <view
            v-for="fact in heroFacts"
            :key="fact.label"
            class="hero-card__fact"
          >
            <text class="hero-card__fact-label">{{ fact.label }}</text>
            <text class="hero-card__fact-value">{{ fact.value }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadErrorRetry">重试</button>
    </view>

    <view v-else-if="isLoading && !dogId" class="state-card">
      <text class="state-card__title">正在加载狗狗档案</text>
      <text class="state-card__desc">正在获取可维护健康记录的狗狗列表，请稍候。</text>
    </view>

    <view v-else-if="hasNoDogs" class="state-card">
      <text class="state-card__title">还没有狗狗档案</text>
      <text class="state-card__desc">创建档案后，即可维护过敏、检查报告、疫苗、体重和饮食偏好。</text>
      <button class="state-card__button" @tap="goToDogCreate">创建狗狗档案</button>
    </view>

    <view v-else class="content">
      <view v-if="isProfileLoading" class="state-card">
        <text class="state-card__title">正在加载健康记录</text>
        <text class="state-card__desc">正在切换到所选狗狗，请稍候。</text>
      </view>

      <template v-else-if="dogId">
        <!-- 书签 + 板块拼成**一张卡**（老板要求：两者要有融合感，不能割裂）。
             书签是这张卡的头部，板块是它的内容区；每个板块一套主题色，
             高亮的下划线把当前书签和它下面的内容连起来。 -->
        <!-- 两个独立入口（2026-10-01 老板要求）。

             放在狗狗信息 Banner 下方、五个板块那张卡**之外**：
             「健康记录」与「健康分析」不是记录类型，跟病例/过敏/疫苗/饮食/体重
             五个书签不是一类东西，混在一起会让功能区看着像七个板块。
             两个入口用颜色区分（记录=品牌绿、分析=品牌金），
             说明小字**换行显示在标题下方**。 -->
        <!-- 健康记录：**通栏 Banner**（2026-10-03 老板定）。
             原来两个入口并排、各自左边一道色条；现在只留「健康记录」一条，
             整块上色（不是只在左边一条边），点它进时间线。
             「健康分析」入口暂时隐藏（页面与接口都还在，只是不在健康管理页露出）。 -->
        <view class="health-entry health-entry--records" @tap="goHealthTimeline">
          <view class="health-entry__copy">
            <text class="health-entry__title">健康记录</text>
            <text class="health-entry__hint">{{ visitShortcutHint }} · 就诊、体检、过敏、疫苗、体重都在这里</text>
          </view>
          <text class="health-entry__arrow">›</text>
        </view>

        <view class="health-panel" :class="`health-theme--${activeHealthTab}`">
          <view class="health-tabs">
            <text
              v-for="tab in HEALTH_TABS"
              :key="tab.key"
              class="health-tabs__item"
              :class="{ 'health-tabs__item--active': activeHealthTab === tab.key }"
              @tap="selectHealthTab(tab.key)"
            >{{ tab.label }}</text>
          </view>

          <view class="health-panel__body">
        <!-- 过敏「结论」区（2026-10-04，过敏重构第二期）。
             老板确认：过敏页改成「结论 / 依据」两段式。

             为什么结论要排在记录列表**上面**：
               改造前这个页面是一堆原始记录，顾客要自己读完十几条
               才能回答"我的狗到底不能吃什么"。而"不能吃什么"
               才是他每次来真正要的那一个答案。 -->
        <AllergyConclusionSection
          v-if="activeHealthTab === 'allergy'"
          :dog-id="dogId"
          :records="recordsByType.allergy"
          @changed="onAllergenSaved"
        />


        <HealthRecordsSection
          v-if="isRecordTab"
          ref="recordsSectionRef"
          :dog-id="dogId"
          :dog-name="form.name"
          :visit-kind="activeVisitKind"
          :tab-kind="activeHealthTab"
          embedded
          :active-type="activeRecordType"
          :records="activeRecordList"
          :loading="activeRecordLoading"
          :saving-record-key="savingRecordKey"
          :last-save-result="lastSaveResult"
          :preferred-expanded-record-identity="preferredExpandedRecordIdentity"
          :show-type-extra="activeRecordType === 'allergy'"
          :hide-empty-state="activeRecordType === 'allergy'"
          @change-type="activeRecordType = $event"
          @save-record="saveHealthRecord"
          @delete-record="deleteHealthRecord"
          @dirty-change="hasUnsavedRecordDraft = $event"
        >
          <!-- 过敏是最要紧的一类：一点即选 + 上传检测报告自动识别。
               建档流程从 2026-09-27 起完全不收集健康信息，这里是它的唯一入口。 -->
          <template #type-extra>
            <AllergyQuickAddSection
              v-if="activeRecordType === 'allergy'"
              ref="allergySectionRef"
              :show-add-entry="true"
              :dog-id="dogId"
              :recorded-allergens="recordedAllergens"
              @saved="onAllergenSaved"
            />
          </template>
        </HealthRecordsSection>

        <!-- 过敏「排查计划」（2026-10-04，过敏重构第三期）。
             老板第 2 条要求。定位是"帮你执行、帮你记录"，
             不替兽医开方案 —— 试验必须由兽医设计与监督。 -->
        <AllergyTrialSection
          v-if="activeHealthTab === 'allergy'"
          :dog-id="dogId"
          :recorded-allergens="recordedAllergens"
          @changed="onAllergenSaved"
        />

        <!-- 过敏「依据」区：报告原件与来源。
             改造前顾客上传的报告**传完就丢**，再也看不到。 -->
        <AllergyReportSection
          v-if="activeHealthTab === 'allergy'"
          :dog-id="dogId"
          :reports="allergyReports"
          @changed="onAllergenSaved"
        />

        <!-- 疫苗管理（2026-09-27 新增）：后端接口早就有，顾客端一直没有入口 -->
        <template v-else-if="activeHealthTab === 'vaccine'">
          <!-- 疫苗计划（2026-10-01，第四期）：记录是"打过什么"，
               计划是"接下来怎么打"，计划放上面先看到。 -->
          <VaccinePlanSection :dog-id="dogId" />
          <VaccineManagementSection
            ref="vaccineSectionRef"
            external-save
            embedded
            :show-add-entry="vaccineAddEntryVisible"
            hide-scan-trigger
            :dog-id="dogId"
            @dirty-change="hasUnsavedSectionDraft = $event"
          />
        </template>

        <WeightManagementSection
          v-else-if="activeHealthTab === 'weight'"
          ref="weightSectionRef"
          external-save
          embedded
          :show-add-entry="weightAddEntryVisible"
          :dog-id="dogId"
          :dog-profile="weightSectionDogProfile"
          @dirty-change="hasUnsavedSectionDraft = $event"
        />
          </view>
        </view>
      </template>

      <view v-else class="section-card">
        <text class="section-card__title">先选择狗狗</text>
        <text class="state-card__desc">选择一只狗狗后，即可维护过敏、检查报告、疫苗、体重和饮食偏好。</text>
        <button class="state-card__button" @tap="goToDogCreate">创建狗狗档案</button>
      </view>
    </view>

    <!-- 底部按钮按当前板块自适应（老板要求）：
         · 饮食偏好是**页面自己持有数据**的板块，所以由底部按钮保存；
         · 其余五个板块（病史/体检/过敏/疫苗/体重管理）各自在板块内有保存按钮
           （每条记录单独保存），底部再放一个"保存"没有意义，只会让人不知道
           它到底在存什么 —— 所以那些书签下不显示保存按钮。
         · 返回按钮的文案跟着入口走。 -->
    <!-- 2026-10-03 老板定：**删掉底部保存按钮**，六个板块全部改成实时保存。
         底部只留一个「新增记录」—— 点它按当前标签直接走那个通道（不弹面板）。
         原来那个可点/可灰的保存键从此不存在 —— 也就不再有"忘了点保存"。 -->
    <StickyActionBar
      :primary-text="stickySecondaryText"
      :primary-theme="stickyAddTheme"
      :primary-disabled="isSecondaryActionDisabled"
      @primary="onStickySecondary"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import AllergyQuickAddSection from '../../components/dog-profile/AllergyQuickAddSection.vue'
import AllergyConclusionSection from '../../components/dog-profile/AllergyConclusionSection.vue'
import AllergyReportSection from '../../components/dog-profile/AllergyReportSection.vue'
import AllergyTrialSection from '../../components/dog-profile/AllergyTrialSection.vue'
import VaccineManagementSection from '../../components/dog-profile/VaccineManagementSection.vue'
import VaccinePlanSection from '../../components/dog-profile/VaccinePlanSection.vue'
import WeightManagementSection from '../../components/dog-profile/WeightManagementSection.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { buildHealthHeroFacts } from '../../utils/health-hero'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
  buildHealthVisitPayload,
  normalizeHealthVisitRecord,
  buildCrudHealthRecordPayload,
  buildHealthRecordFocusIdentity,
  mergeHealthRecordListWithCachedAttachments,
  normalizeHealthRecordListResponse,
  normalizeSavedHealthRecordResponse,
  removeHealthRecordAttachmentCache,
  removeHealthRecordFromList,
  replaceHealthRecordInList,
  resolveDogHealthSelectionState,
  resolveHealthTabRecordType,
  shouldDiscardDogHealthProfileResponse,
  writeHealthRecordAttachmentCache,
} from '../../utils/health-records'
import { navigateToDogCreate } from '../../utils/dog-profile-entry'
import { scrollPageToTop } from '../../utils/page-scroll'

interface DogProfileSummary {
  id: string
  name: string
}

const dogId = ref('')
const dogs = ref<DogProfileSummary[]>([])
const selectedDogIndex = ref(-1)
const isLoading = ref(false)
const isProfileLoading = ref(false)
const isSaving = ref(false)
const hasNoDogs = ref(false)
const loadError = ref('')
const latestRequestedDogId = ref('')
/**
 * 板块书签（2026-09-30，老板要求）。
 *
 * 六个板块原先全部平铺在页面上，一屏里挤着病史、体检、过敏、疫苗、
 * 饮食偏好、体重管理六套内容，显得杂乱。改成书签：一次只显示一个。
 *
 * 病史/体检/过敏复用 HealthRecordsSection（三类记录本来就一次全加载，
 * 切书签不需要重新请求），疫苗/饮食偏好/体重管理各自是独立板块。
 */
/**
 * 板块书签（2026-10-01 改版）。
 *
 * 病史与体检合并成「病例」：在顾客眼里这就是一件事——"带狗去看了一次医生"。
 * 分成两个板块，家长要先判断"这算病史还是体检"才能动手记，是负担。
 *
 * ★ 合并只在界面层：两条记录仍然分别存在 medical_record / checkup_record
 *   两张表里，保存时按记录自己的类型走原接口。
 */
/**
 * 板块书签（2026-10-02 老板定）。
 *
 * 两个变化：
 *   · 「就诊」与「体检」拆成两个标签（原来合并成「病历/检查」）
 *   · **删掉「饮食」标签** —— 老板：饮食偏好跟健康管理关系不大，
 *     只在定制食谱时让顾客填写（定制流程里本来就有"饮食偏好"那一步）。
 *     数据与营养师侧用法完全不变，只是不再从健康管理页编辑。
 *
 * 背景：两类的字段、材料、录入流程差别很大（就诊有症状/诊断/医嘱/用药，
 * 体检有检查结论/化验数据/医生建议）；合在一个列表里既要在卡片上打类型徽标，
 * 又要在表单里放"类型"切换 —— 老板实测时切完以为数据丢了。
 * 拆开之后：每个标签只显示本类记录、只渲染本类字段，**表单里不再需要切换**；
 * 这次就诊里传的化验单，数字也直接落在这条就诊记录里，不再另开一条体检记录。
 */
type HealthTabKey = 'medical' | 'checkup' | 'allergy' | 'vaccine' | 'weight'

const HEALTH_TABS: { key: HealthTabKey; label: string }[] = [
  { key: 'medical', label: '就诊' },
  { key: 'checkup', label: '体检' },
  { key: 'allergy', label: '过敏' },
  { key: 'vaccine', label: '疫苗' },
  { key: 'weight', label: '体重' },
]

/** 走 HealthRecordsSection 的板块：就诊、体检（各一类）+ 过敏 */
const RECORD_TAB_KEYS: string[] = ['medical', 'checkup', 'allergy']

/**
 * 从哪个入口进来的。
 *
 * 首页和爱犬概览页都有健康管理入口，底部按钮不能一律写「返回概览」——
 * 从首页进来的顾客看到「返回概览」是说不通的（老板指出）。
 * 有页面栈时 navigateBack 本来就会回到入口页；这里的来源只用于
 * **按钮文案**，以及页面被 redirect 掉、栈里没有上一页时的兜底返回。
 */
type HealthEntrySource = 'home' | 'overview' | 'unknown'
const entrySource = ref<HealthEntrySource>('unknown')

const HEALTH_ENTRY_LABELS: Record<HealthEntrySource, string> = {
  home: '返回首页',
  overview: '返回概览',
  unknown: '返回',
}

const activeHealthTab = ref<HealthTabKey>('medical')

/** 当前书签是否是「记录类」（就诊/体检/过敏）—— 这三个共用同一个组件 */
const isRecordTab = computed(() => RECORD_TAB_KEYS.includes(activeHealthTab.value))

/**
 * 交给 HealthRecordsSection 的「这条记录属于哪一类」。
 * 就诊/体检各自成标签之后，它就是标签本身；过敏走原来的单一类型分支。
 */
const activeVisitKind = computed<'medical' | 'checkup'>(() =>
  activeHealthTab.value === 'checkup' ? 'checkup' : 'medical',
)

/**
 * 传给 HealthRecordsSection 的板块标识（2026-10-04 修正）。
 *
 * 就诊 / 体检：两类记录共用同一个列表，走 `'visit'`（合并）模式；
 * 过敏：**单一类型，走它自己的模板**（过敏原 + 过敏反应/说明）——
 * 老板实测："过敏标签分类下，现在用的也是就诊的模板"，
 * 就是这里原来把三个记录类书签一律当成 `'visit'` 传下去了。
 */
const activeRecordType = computed<HealthRecordType | 'visit'>(() =>
  resolveHealthTabRecordType(activeHealthTab.value),
)

/** 当前标签要展示的记录与加载态（拆标签后：就诊/体检各看各的） */
const activeRecordList = computed(() => {
  if (activeHealthTab.value === 'medical') {
    return recordsByType.medical
  }

  if (activeHealthTab.value === 'checkup') {
    return recordsByType.checkup
  }

  return recordsByType.allergy
})
const activeRecordLoading = computed(() => {
  if (activeHealthTab.value === 'medical') {
    return loadingByType.medical
  }

  if (activeHealthTab.value === 'checkup') {
    return loadingByType.checkup
  }

  return loadingByType.allergy
})

function selectHealthTab(key: HealthTabKey) {
  // 切走之前先把等待中的自动保存落库（2026-10-03：底部保存键已下线）
  if (key !== activeHealthTab.value) {
    flushActiveTabAutoSaves()
  }

  // 换标签就把"新增入口"开关复位：它只在引导选完那一刻打开
  resetAddEntryFlags()
  activeHealthTab.value = key
  // 各板块的未保存状态是各自汇报的，切换时要清掉上一个板块留下的值，
  // 否则新板块明明没改动，底部按钮却亮着
  hasUnsavedSectionDraft.value = false
  hasUnsavedRecordDraft.value = false
}


const recordsByType = reactive<Record<HealthRecordType, Record<string, any>[]>>({
  medical: [],
  checkup: [],
  allergy: [],
})
const loadingByType = reactive<Record<HealthRecordType, boolean>>({
  medical: false,
  checkup: false,
  allergy: false,
})
const savingRecordKey = ref('')
/**
 * 最近一次保存的结果，回传给记录板块（2026-10-03 自动保存）。
 * 自动保存没有按钮可以点，失败必须落在卡片上看得见、点一下能重试 ——
 * 光靠一句两秒就消失的 toast 等于没提示。
 */
const lastSaveResult = ref<{ key: string; ok: boolean; message: string; at: number } | null>(null)
const hasUnsavedRecordDraft = ref(false)
const healthRecordFocusIdentity = reactive<Record<HealthRecordType, string>>({
  medical: '',
  checkup: '',
  allergy: '',
})

/**
 * 「病例」合并页上一次真正保存/删除的是哪一类记录（就诊还是体检）。
 *
 * 合并页本身没有单一类型，但"保存完要把刚存的那条展开"这件事必须知道类型，
 * 否则展开标识取不到值、保存后列表不会定位到那条记录。
 */
const lastVisitRecordType = ref<HealthRecordType>('medical')

/** 传给记录组件的"优先展开标识"：合并页取上一次动过的那一类 */
const preferredExpandedRecordIdentity = computed(() => {
  const type = activeRecordType.value
  return healthRecordFocusIdentity[type === 'visit' ? lastVisitRecordType.value : type]
})
/**
 * 饮食偏好（喜欢吃的 / 不爱吃的）上一次保存的值。
 *
 * 两个字段一起记：上次只存了"不爱吃"，于是「喜欢吃的食材」改完
 * 会被判定成"没有未保存修改"，顾客一点返回就白填。
 */
/**
 * 档案里"已保存的"饮食偏好原值。
 *
 * 2026-10-02 起本页不再编辑饮食偏好（标签已下线），但这两个值仍随档案一起
 * 读取/复位：定制食谱那边还在写、营养师侧与分析还在读，页面只是不再改它。
 */
const savedDietPreferences = reactive({
  preferredFoods: '',
  pickyFoods: '',
})
const isHealthRecordSaving = computed(() => Boolean(savingRecordKey.value))
const isSecondaryActionDisabled = computed(() =>
  isLoading.value || isSaving.value || isHealthRecordSaving.value,
)
const selectedDog = computed(() => (
  selectedDogIndex.value >= 0 ? dogs.value[selectedDogIndex.value] || null : null
))

/** 档案里已经记过的过敏原：给「快速添加」做去重与"已记"标记 */
const recordedAllergens = computed(() => (recordsByType.allergy || [])
  .map(record => String(record?.allergen || '').trim())
  .filter(Boolean))

/**
 * 快速添加/报告识别写了一条过敏记录后，把过敏列表拉回来。
 *
 * 不在这里手动往数组里塞：接口返回的才是权威数据（含 id 与附件缓存），
 * 手动塞容易和「未保存草稿」的判定打架。
 */
async function onAllergenSaved() {
  if (!dogId.value) {
    return
  }

  await loadHealthRecordList('allergy', dogId.value)
  // 报告区也要跟着刷新：识别报告时会同时写入报告与结论，
  // 只刷其中一个会让两边对不上（"结论有了、依据没有"）。
  await loadAllergyReports()
}

/**
 * 过敏检测报告（2026-10-04，过敏重构第二期）。
 *
 * 报告是有独立实体的：检测日期 / 方式 / 机构 / 原件 / 识别原文，
 * 结论挂在报告下面。改造前没有这一层，顾客上传的原件传完就丢。
 */
const allergyReports = ref<Array<Record<string, any>>>([])

async function loadAllergyReports() {
  if (!dogId.value) {
    allergyReports.value = []
    return
  }
  try {
    const res: any = await dogApi.allergyReports.list(dogId.value)
    if (res?.code !== 0) return
    const list = Array.isArray(res?.data?.reports) ? res.data.reports : []
    allergyReports.value = list
  } catch {
    // 报告读不到不能挡住整个健康页 —— 结论区与记录列表仍然可用
    allergyReports.value = []
  }
}

// 体重管理区块需要的档案信息
const weightSectionDogProfile = computed(() => ({
  currentWeightKg: form.currentWeightKg
    ? Number(form.currentWeightKg)
    : null,
  // 阶段 B2-7：体况分决定要不要给「制定计划」入口 ——
  // BCS 4-5 是理想区间，本来就不需要增减重计划，不该在页面上推销
  bcsScore: form.bcsScore ? Number(form.bcsScore) : null,
}))
/**
 * Banner 里的头像。
 *
 * 用与爱犬概览页同一个解析函数：没上传头像时给统一的默认头像，
 * 不在这里各写一份兜底逻辑。
 */
const dogAvatarSrc = computed(() => resolveDogAvatarSrc(form.avatarUrl))

/**
 * Banner 右侧的基本信息（年龄 / 性别 / 品种 / 体重）。
 *
 * 缺哪项不显示哪项 —— 规则在 utils/health-hero.ts 里，有单元测试。
 */
const heroFacts = computed(() => buildHealthHeroFacts(form))

const form = reactive<Record<string, any>>({
  id: '',
  name: '',
  avatarUrl: '',
  breedId: '',
  breedName: '',
  customBreedName: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'LOW',
  lifeStageOverride: 'NONE',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  preferredFoods: '',
  pickyFoods: '',
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  const from = Array.isArray(options?.from) ? options.from[0] : options?.from
  // 记住从哪进来的：底部按钮的文案与"兜底返回"都要跟着变（老板要求）
  entrySource.value = from === 'home' || from === 'overview' ? from : 'unknown'
  void loadDogs(typeof value === 'string' ? value : '')
})

/**
 * 从建档页返回时本页不会重新挂载：原先 onLoad 只跑一次，
 * 「还没有狗狗档案」的空态会一直留着，用户看不到刚建好的狗。
 */
onShow(() => {
  if (!dogs.value.length) {
    void loadDogs()
  }
})

// 离开这个页面（切后台、返回、跳走）之前，把等待中的自动保存立刻发出去。
// 自动保存有 1.2 秒延迟，不 flush 的话"改完马上返回"会丢掉最后几个字。
onHide(() => {
  flushActiveTabAutoSaves()
})

onUnload(() => {
  flushActiveTabAutoSaves()
})

async function loadDogs(preferredDogId = '') {
  isLoading.value = true
  hasNoDogs.value = false
  loadError.value = ''

  try {
    uni.showLoading({ title: '加载中...' })
    const res: any = await dogApi.list()
    if (res.code !== 0 || !Array.isArray(res.data)) {
      throw new Error(res.message || '加载狗狗列表失败')
    }

    dogs.value = res.data
    const selection = resolveDogHealthSelectionState(dogs.value, preferredDogId)

    if (selection.hasNoDogs) {
      dogId.value = ''
      selectedDogIndex.value = -1
      latestRequestedDogId.value = ''
      resetHealthForm()
      hasNoDogs.value = true
      return
    }

    await selectDogByIndex(selection.selectedIndex)
  } catch (error: any) {
    if (preferredDogId) {
      latestRequestedDogId.value = preferredDogId
      selectedDogIndex.value = -1
      resetHealthForm()
      await Promise.all([
        loadDogProfile(preferredDogId),
        loadAllHealthRecordLists(preferredDogId),
      ])
      return
    }

    loadError.value = error?.message || '加载狗狗列表失败，请稍后重试。'
  } finally {
    isLoading.value = false
    uni.hideLoading()
  }
}

function onDogPickerChange(event: any) {
  const index = Number(event?.detail?.value)
  if (!Number.isInteger(index)) {
    return
  }

  if (isSaving.value || isProfileLoading.value || isHealthRecordSaving.value) {
    selectedDogIndex.value = getCurrentDogIndex()
    return
  }

  // 饮食偏好已不在本页（2026-10-02）→ 只看向"记录草稿"
  if (hasUnsavedRecordDraft.value) {
    confirmSwitchDogWithUnsavedChanges(index)
    return
  }

  void selectDogByIndex(index)
}

async function selectDogByIndex(index: number) {
  const nextDog = dogs.value[index]
  if (!nextDog?.id) {
    return
  }

  const requestedDogId = nextDog.id
  selectedDogIndex.value = index
  dogId.value = ''
  latestRequestedDogId.value = requestedDogId
  isProfileLoading.value = true
  resetHealthForm()
  healthRecordFocusIdentity.medical = ''
  healthRecordFocusIdentity.checkup = ''
  healthRecordFocusIdentity.allergy = ''
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'edit',
    dogId: requestedDogId,
    moduleName: 'health',
  })
  await Promise.all([
    loadDogProfile(requestedDogId),
    loadAllHealthRecordLists(requestedDogId),
  ])
}

function loadErrorRetry() {
  if (dogId.value) {
    const requestedDogId = dogId.value
    void Promise.all([
      loadDogProfile(requestedDogId),
      loadAllHealthRecordLists(requestedDogId),
    ])
    return
  }

  void loadDogs()
}

function getCurrentDogIndex() {
  const index = dogs.value.findIndex(dog => dog.id === dogId.value)
  return index >= 0 ? index : selectedDogIndex.value
}

function confirmSwitchDogWithUnsavedChanges(index: number) {
  uni.showModal({
    title: '切换狗狗？',
    content: '当前页面有未保存的修改，切换后会放弃本次修改。',
    confirmText: '继续切换',
    cancelText: '继续编辑',
    success: (res) => {
      if (res.confirm) {
        void selectDogByIndex(index)
        return
      }

      selectedDogIndex.value = getCurrentDogIndex()
    },
    fail: () => {
      selectedDogIndex.value = getCurrentDogIndex()
    },
  })
}

function resetHealthForm() {
  form.id = ''
  form.name = ''
  form.breedId = ''
  form.breedName = ''
  form.customBreedName = ''
  form.birthday = ''
  form.gender = 'MALE'
  form.isNeutered = false
  form.currentWeightKg = ''
  form.bcsScore = 5
  form.activityLevel = 'LOW'
  form.lifeStageOverride = 'NONE'
  form.sizeClassOverride = null
  form.mealsPerDay = '2'
  form.treatInputMode = 'ESTIMATE_LEVEL'
  form.treatLevel = 'LOW'
  form.manualTreatKcal = ''
  form.preferredFoods = ''
  form.pickyFoods = ''
  savedDietPreferences.preferredFoods = ''
  savedDietPreferences.pickyFoods = ''
  savingRecordKey.value = ''
  hasUnsavedRecordDraft.value = false
  for (const type of HEALTH_RECORD_TYPES) {
    recordsByType[type] = []
    loadingByType[type] = false
  }
}

async function loadDogProfile(requestedDogId: string) {
  if (!requestedDogId) {
    return
  }

  latestRequestedDogId.value = requestedDogId
  isProfileLoading.value = true
  loadError.value = ''

  try {
    uni.showLoading({ title: '加载中...' })
    const res: any = await dogApi.detail(requestedDogId)
    if (res.code !== 0 || !res.data?.profile) {
      throw new Error(res.message || '加载狗狗档案失败')
    }

    if (shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      return
    }

    dogId.value = requestedDogId
    populateForm(res.data.profile)
  } catch (error: any) {
    if (shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      return
    }

    dogId.value = ''
    loadError.value = error?.message || '加载狗狗档案失败，请稍后重试。'
  } finally {
    if (!shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      isProfileLoading.value = false
      uni.hideLoading()
    }
  }
}

function populateForm(profile: Record<string, any>) {
  form.id = profile.id || ''
  form.name = profile.name || ''
  form.avatarUrl = profile.avatarUrl || ''
  form.breedId = profile.breedId || ''
  form.breedName = profile.breedName || ''
  form.customBreedName = profile.customBreedName || ''
  form.birthday = profile.birthday ? new Date(profile.birthday).toISOString().split('T')[0] : ''
  form.gender = profile.gender || 'MALE'
  form.isNeutered = profile.isNeutered ?? false
  form.currentWeightKg = profile.currentWeightKg?.toString() || ''
  form.bcsScore = profile.bcsScore ?? 5
  form.activityLevel = profile.activityLevel || 'LOW'
  form.lifeStageOverride = profile.lifeStageOverride || 'NONE'
  form.sizeClassOverride = profile.sizeClassOverride || null
  form.mealsPerDay = (profile.mealsPerDay || 2).toString()
  form.treatInputMode = profile.treatInputMode || 'ESTIMATE_LEVEL'
  form.treatLevel = profile.treatLevel || 'LOW'
  form.manualTreatKcal = profile.manualTreatKcal?.toString() || ''
  form.preferredFoods = typeof profile.preferredFoods === 'string' ? profile.preferredFoods : ''
  form.pickyFoods = typeof profile.pickyFoods === 'string' ? profile.pickyFoods : ''
  savedDietPreferences.preferredFoods = form.preferredFoods
  savedDietPreferences.pickyFoods = form.pickyFoods
}

function recordApiForType(type: HealthRecordType) {
  if (type === 'medical') {
    return dogApi.healthRecords.medical
  }

  if (type === 'checkup') {
    return dogApi.healthRecords.checkup
  }

  return dogApi.healthRecords.allergy
}

/**
 * 按记录类型分派保存（2026-10-01 自查补）。
 *
 * 就诊与体检走两张表、两个接口、两套 payload，过敏又是第三套。
 * 逐个分支写，类型与接口才对得上；运行时行为与原来完全一致。
 */
async function saveByRecordType(
  type: HealthRecordType,
  targetDogId: string,
  recordId: string,
  record: Record<string, any>,
) {
  if (type === 'medical') {
    const payload = buildHealthVisitPayload('medical', record)
    return recordId
      ? dogApi.healthRecords.medical.update(targetDogId, recordId, payload)
      : dogApi.healthRecords.medical.create(targetDogId, payload)
  }

  if (type === 'checkup') {
    const payload = buildHealthVisitPayload('checkup', record)
    return recordId
      ? dogApi.healthRecords.checkup.update(targetDogId, recordId, payload)
      : dogApi.healthRecords.checkup.create(targetDogId, payload)
  }

  const payload = buildCrudHealthRecordPayload('allergy', record)
  return recordId
    ? dogApi.healthRecords.allergy.update(targetDogId, recordId, payload)
    : dogApi.healthRecords.allergy.create(targetDogId, payload)
}

function recordListApiForType(type: HealthRecordType) {
  if (type === 'medical') {
    return dogApi.healthRecords.medical.list
  }

  if (type === 'checkup') {
    return dogApi.healthRecords.checkup.list
  }

  return dogApi.healthRecords.allergy.list
}

function shouldDiscardHealthRecordListResponse(requestedDogId: string) {
  return shouldDiscardDogHealthProfileResponse({
    requestedDogId,
    latestRequestedDogId: latestRequestedDogId.value,
  })
}

async function loadHealthRecordList(type: HealthRecordType, targetDogId = dogId.value) {
  if (!targetDogId) {
    recordsByType[type] = []
    return
  }

  loadingByType[type] = true

  try {
    const res: any = await recordListApiForType(type)(targetDogId)
    if (shouldDiscardHealthRecordListResponse(targetDogId)) {
      return
    }

    if (res.code !== 0) {
      throw new Error(res.message || '加载健康记录失败')
    }

    recordsByType[type] = mergeHealthRecordListWithCachedAttachments(
      targetDogId,
      type,
      // 把"这张表"告诉每条记录：就诊/体检共用一个列表，
      // 没有这个章，体检记录会按就诊记录的样子渲染（2026-10-03 老板实测发现）
      normalizeHealthRecordListResponse(res, type),
    )
  } catch (error: any) {
    if (shouldDiscardHealthRecordListResponse(targetDogId)) {
      return
    }

    recordsByType[type] = []
    uni.showToast({ title: error?.message || '加载健康记录失败', icon: 'none' })
  } finally {
    if (!shouldDiscardHealthRecordListResponse(targetDogId)) {
      loadingByType[type] = false
    }
  }
}

async function loadAllHealthRecordLists(targetDogId: string) {
  await Promise.all([
    ...HEALTH_RECORD_TYPES.map(type => loadHealthRecordList(type, targetDogId)),
    // 过敏报告与过敏结论一起拉，避免出现"结论有了、依据没有"的错位
    loadAllergyReports(),
  ])
}

async function saveHealthRecord({
  type,
  record,
  recordKey,
  auto = false,
}: {
  type: HealthRecordType
  record: Record<string, any>
  recordKey: string
  /** 自动保存：成功不弹提示（否则每改一格都弹一次） */
  auto?: boolean
}) {
  if (!dogId.value) {
    return
  }

  const targetDogId = dogId.value
  const recordId = typeof record.id === 'string' ? record.id : ''
  const nextSavingKey = recordId || recordKey || buildHealthRecordFocusIdentity(type, record)
  savingRecordKey.value = nextSavingKey

  try {
    // 「病例」合并后，一条记录可能是就诊也可能是体检 —— 组件已经把它的
    // 真实类型放在 type 里传上来，按类型分别走原来那两个接口。
    //
    // 这里按类型逐个分支（而不是先算出 payload 再统一调用）：
    // 三个接口的 payload 类型各不相同，写成联合类型会被类型检查拦下，
    // 而"先算 payload 再分派"恰恰丢掉了类型与接口的对应关系。
    const res: any = await saveByRecordType(type, targetDogId, recordId, record)

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '保存失败')
    }

    if (targetDogId !== dogId.value) {
      return
    }

    const nextRecord = type === 'allergy'
      ? normalizeSavedHealthRecordResponse(res.data, record)
      : normalizeHealthVisitRecord(type, res.data)
    writeHealthRecordAttachmentCache(targetDogId, type, nextRecord)
    recordsByType[type] = replaceHealthRecordInList(recordsByType[type], nextRecord)
    healthRecordFocusIdentity[type] = buildHealthRecordFocusIdentity(type, nextRecord)
    lastVisitRecordType.value = type
    lastSaveResult.value = { key: nextSavingKey, ok: true, message: '', at: Date.now() }
    // 自动保存成功不打扰（卡片上的"保存中…"消失就是反馈）
    if (!auto) {
      uni.showToast({ title: '已保存', icon: 'success' })
    }
  } catch (error: any) {
    const message = error?.message || '保存失败'
    lastSaveResult.value = { key: nextSavingKey, ok: false, message, at: Date.now() }
    uni.showToast({ title: message, icon: 'none' })
  } finally {
    if (savingRecordKey.value === nextSavingKey) {
      savingRecordKey.value = ''
    }
  }
}

async function deleteHealthRecord({
  type,
  record,
}: {
  type: HealthRecordType
  record: Record<string, any>
}) {
  if (!dogId.value || !record.id) {
    return
  }

  const targetDogId = dogId.value
  const recordId = String(record.id)
  const nextSavingKey = recordId || buildHealthRecordFocusIdentity(type, record)
  savingRecordKey.value = nextSavingKey

  try {
    const res: any = await recordApiForType(type).delete(targetDogId, recordId)
    if (res.code !== 0) {
      throw new Error(res.message || '删除失败')
    }

    if (targetDogId !== dogId.value) {
      return
    }

    removeHealthRecordAttachmentCache(targetDogId, type, record)
    recordsByType[type] = removeHealthRecordFromList(recordsByType[type], recordId)
    uni.showToast({ title: '已删除', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
  } finally {
    if (savingRecordKey.value === nextSavingKey) {
      savingRecordKey.value = ''
    }
  }
}

/**
 * 底部主按钮：**每个书签都保存它自己的那一块**（老板要求）。
 *
 * 文案是「保存 + 当前书签名」，动作调对应板块暴露出来的保存方法 ——
 * 各板块内部的保存按钮在内嵌模式下已隐藏，顾客只需要认底部这一个位置。
 */
const recordsSectionRef = ref<{
  /** 旧的二选一选择器（引导面板上线后不再由底部按钮调用） */
  openAddRecordChooser?: () => void
  /** 直接调起相册 + AI 识别（按当前标签那一类） */
  startScan?: () => void
  /** 新建一条本类空白记录 */
  addRecord?: () => void
} | null>(null)
const vaccineSectionRef = ref<{
  startScan?: () => void
  addRecord?: () => void
} | null>(null)
const weightSectionRef = ref<{
  saveRecord?: () => Promise<void>
  focusInput?: () => void
} | null>(null)
const allergySectionRef = ref<{ pickHealthReport?: () => void } | null>(null)

/** 疫苗/体重板块自己的未保存状态（病史/体检/过敏复用 hasUnsavedRecordDraft） */
const hasUnsavedSectionDraft = ref(false)


/**
 * 各板块的"新增块"开关（2026-10-03）。
 *
 * 底部「新增记录」会先问一句"传照片还是自己填"，选完再把对应的录入块打开：
 *   · 就诊 / 体检 / 疫苗 / 过敏 → 两个选项（上传图片 AI 识别 / 手动填写）
 *   · 体重                       → 没有 AI 识别这回事，直接打开输入块落光标
 * 所以这些开关只在"选了手动填写"之后才打开 —— 标签页本身仍是"看结果 + 改已有"。
 */
const vaccineAddEntryVisible = ref(false)
const weightAddEntryVisible = ref(false)

function resetAddEntryFlags() {
  vaccineAddEntryVisible.value = false
  weightAddEntryVisible.value = false
}

/**
 * 底部「新增记录」：先让顾客选"上传图片让 AI 识别"还是"自己手动填写"，
 * 再走当前标签对应的通道（2026-10-03 老板定）。
 *
 * 老板原话："板块内的手动填写确实是多余的，应该还是点击新增记录之后，
 * 让用户自己选择，是上传图片让 AI 识别，还是自己手动填写表单。"
 * 所以：**不再有 5 个分类的引导面板**（那个多余），只保留这一次二选一。
 * 体重没有 AI 识别这条路，就直接落光标，不弹选择。
 */
function onAddRecordTap() {
  if (activeHealthTab.value === 'weight') {
    weightAddEntryVisible.value = true
    nextTick(() => weightSectionRef.value?.focusInput?.())
    return
  }

  /**
   * 过敏不走"新建一张空记录卡"这条路（2026-10-04）。
   *
   * 过敏板块上面那张「快速添加过敏原」卡本身就是最省事的填法
   * （点选 / 手输 + 拍检测报告自动识别）；而且过敏改回自己的模板之后，
   * 记录组件里那套"拍照录入"只在就诊/体检模式下挂载，
   * 再走记录那条分支会**点了没反应**。
   */
  if (activeHealthTab.value === 'allergy') {
    uni.showActionSheet({
      itemList: ['拍检测报告，AI 识别', '手动点选 / 手输'],
      success: ({ tapIndex }) => {
        // 那张「添加过敏原」卡就在本标签最上面、一直是展开的
        // （2026-10-04：从前它默认是收起的，点「手动点选」只弹一句"在上面点"，
        //   家长看到的是一片空白 —— 这就是"看不懂怎么加过敏原"的原因）
        scrollPageToTop(200)
        if (tapIndex === 0) {
          nextTick(() => allergySectionRef.value?.pickHealthReport?.())
        }
      },
    })
    return
  }

  const isRecord = isRecordTab.value
  const options = isRecord
    ? ['上传图片，AI 识别', '手动填写']
    : ['拍疫苗本，AI 识别', '手动加一条']

  uni.showActionSheet({
    itemList: options,
    success: ({ tapIndex }) => {
      if (isRecord) {
        if (tapIndex === 0) {
          recordsSectionRef.value?.startScan?.()
        } else {
          recordsSectionRef.value?.addRecord?.()
        }
        return
      }

      if (activeHealthTab.value === 'vaccine') {
        vaccineAddEntryVisible.value = true
        if (tapIndex === 0) {
          nextTick(() => vaccineSectionRef.value?.startScan?.())
        } else {
          vaccineSectionRef.value?.addRecord?.()
        }
      }
    },
  })
}

/**
 * 次按钮就是「返回」。六个板块现在都能从底部保存，主按钮位被占满了，
 * 所以返回统一放在次按钮上，不再随书签变来变去。
 */
/**
 * 底部左侧那个按钮的文案。
 *
 * 2026-10-03 起**文案就是「新增记录」**，点它按当前标签直接走那个通道
 * （就诊/体检/疫苗/过敏 → 调起相册让 AI 识别；体重 → 打开输入块落光标），
 * 不再先弹"你要记什么"。没有选狗狗时这个位置退化成返回。
 */
/**
 * 底部「新增记录」的颜色＝当前标签的颜色（2026-10-03 老板："每个标签页下方的
 * 新增记录，都应该是该标签页对应的色块"）—— 与书签、内容区底色同一套色，
 * 顾客一眼能对上"我在哪一块、点下去会记到哪一类"。
 */
const stickyAddTheme = computed<'visit' | 'checkup' | 'allergy' | 'vaccine' | 'weight'>(() => {
  if (activeHealthTab.value === 'checkup') return 'checkup'
  if (activeHealthTab.value === 'allergy') return 'allergy'
  if (activeHealthTab.value === 'vaccine') return 'vaccine'
  if (activeHealthTab.value === 'weight') return 'weight'
  return 'visit'
})

const stickySecondaryText = computed(() => (
  // 2026-10-02：新增统一走引导入口，所以任何标签下都是同一个动作
  selectedDog.value ? '新增记录' : HEALTH_ENTRY_LABELS[entrySource.value]
))

/**
 * 底部左侧按钮：病历/检查板块 → 打开"新增记录"选择（手动填写 / 拍照）；其它板块 → 返回。
 */
/**
 * 把当前板块里等待中的自动保存立刻执行（2026-10-03）。
 *
 * 触发点：切标签、页面隐藏/卸载。自动保存本身有 1.2 秒延迟，
 * 这些边界必须立刻落库，否则"改完马上切走"会丢掉最后几个字。
 */
function flushActiveTabAutoSaves() {
  if (isRecordTab.value) {
    recordsSectionRef.value?.flushAutoSaves?.()
    return
  }
  if (activeHealthTab.value === 'vaccine') {
    vaccineSectionRef.value?.flushAutoSaves?.()
    return
  }
  if (activeHealthTab.value === 'weight') {
    weightSectionRef.value?.flushAutoSaves?.()
  }
}

function onStickySecondary() {
  // 2026-10-03：不再弹"你要记什么"，直接按当前标签走那个通道
  if (selectedDog.value) {
    onAddRecordTap()
    return
  }

  goBack()
}

function goBack() {
  if (isHealthRecordSaving.value) {
    return
  }

  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }

  // 栈里没有上一页时的兜底：按入口来源回，而不是一律回概览
  if (entrySource.value === 'home') {
    uni.redirectTo({ url: '/pages/home/index' })
    return
  }

  if (!dogId.value) {
    uni.redirectTo({ url: '/pages/home/index' })
    return
  }

  uni.redirectTo({
    url: `/pages/dog-profile-overview/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

/**
 * 「健康记录」入口（2026-10-01，第二期；原名"健康时间线"）。
 *
 * 页面在分包 pages/dog-health 里（重页面不进主包）。
 */
function goHealthTimeline() {
  if (!dogId.value) {
    return
  }
  uni.navigateTo({
    url: `/pages/dog-health/timeline?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

/** 时间线入口上的小字：让顾客知道里面有多少条，不然不会点 */
const visitShortcutHint = computed(() => {
  const count =
    (recordsByType.medical?.length || 0) +
    (recordsByType.checkup?.length || 0) +
    (recordsByType.allergy?.length || 0)
  return count > 0 ? `已记 ${count} 条` : '还没有记录'
})

/**
 * AI 健康分析（2026-10-01，第七期）。
 *
 * 顾客侧已开放（2026-10-02：知识库 189 条兽医全数通过，生产开了 HEALTH_ANALYSIS=customer）。
 * 若后端开关关闭，页面会如实说明原因，不做假入口。
 */
/**
 * 健康分析（第七期）。
 *
 * ⚠️ 入口暂时隐藏（2026-10-03 老板定）：页面、接口、知识库门禁都还在，
 *    只是健康管理页不再露出入口。要恢复就在 Banner 那块再加一个入口。
 */
function goHealthAnalysis() {
  if (!dogId.value) {
    return
  }
  uni.navigateTo({
    url: `/pages/dog-health/analysis?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

function goToDogCreate() {
  // 2026-09-21：由 redirectTo 改为 navigateTo。
  // 原先 redirectTo 会把健康管理页从页面栈里替换掉，建档完成后无法回到这里；
  // 现在保留本页，建档成功 navigateBack 回来即可直接维护健康记录。
  navigateToDogCreate({ source: 'health' })
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(132rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top right, rgba(176, 141, 79, 0.12), transparent 26%),
    linear-gradient(180deg, #f0f3e9 0%, #f2f4ea 100%);
}

.hero-card {
  padding: 32rpx;
  border-radius: 28rpx;
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

/* 一行装下：左边头像+名字，右边基本信息 */
.hero-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.hero-card__identity {
  flex: 1;
  min-width: 0;
}

.hero-card__identity-inner {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.hero-card__avatar {
  flex: none;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: rgba(243, 237, 221, 0.14);
  border: 2rpx solid rgba(216, 188, 133, 0.55);
}

.hero-card__name-block {
  min-width: 0;
}

.hero-card__title {
  display: block;
  font-size: 42rpx;
  font-weight: 800;
  /* 名字过长时省略，不要把右边的信息挤没了 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 右侧基本信息：**一行两个**（年龄 性别 / 品种 体重），两行排完 */
.hero-card__facts {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  width: 356rpx;
  row-gap: 10rpx;
}

/*
 * 两列的宽度不一样：
 *   第一列放 年龄 / 品种（品种名可能很长，多给一点），
 *   第二列放 性别 / 体重（都很短）。
 * 用 flex + 固定百分比而不是 grid —— 小程序的 WXSS 对 grid 支持不齐，
 * flex 到处都能跑。
 */
.hero-card__fact {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  width: 56%;
  min-width: 0;
}

.hero-card__fact:nth-child(2n) {
  width: 44%;
}

.hero-card__fact-label {
  flex: none;
  font-size: 22rpx;
  color: rgba(243, 237, 221, 0.62);
}

.hero-card__fact-value {
  min-width: 0;
  font-size: 24rpx;
  font-weight: 700;
  color: #f3eddd;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.content,
.state-card {
  margin-top: 24rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section-card,
.state-card {
  padding: 30rpx;
  border-radius: 30rpx;
  background: #fbfcf7;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
}

.section-card__title,
.state-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.section-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

/*
 * 名称与「切换」**上下排**（2026-10-01）。
 * 并排的话，多只狗时"名字 + 切换 ▼"要抢同一行的宽度，
 * 名字稍长就被压成省略号；上下排之后名字独占一行，切换是一行小字提示。
 */
.hero-card__name-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6rpx;
}

.hero-card__switch {
  flex: none;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.5);
}

/*
 * 书签 + 板块 = **一张卡**。
 *
 * 之前书签是一张独立的胶囊，板块又是一张独立的卡，中间还留着间距 ——
 * 两者看着是两件事（老板说"有割裂感"）。现在书签是这张卡的头部，
 * 板块是它的内容区，内部各板块不再自己画卡。
 */
/*
 * 主题色的**单一来源**：板块内所有按钮都取这个变量。
 *
 * 子组件（记录/疫苗/过敏/体重）与父页面之间是**样式隔离**的 ——
 * 父页面的选择器进不去，但 CSS 自定义属性是**继承**的，能穿过组件边界。
 * 所以这里定义变量、子组件用 var(--health-accent, 原色) 兜底，
 * 两边都不用互相知道对方的存在。
 */
.health-panel { --health-accent: #0f6b43; }
.health-theme--medical { --health-accent: #0f7b49;  --health-accent-soft: #e6f2ea; }
/* 体检单独一套蓝：和「就诊」的绿区分开，五个书签各有各的色（2026-10-03 老板提的） */
.health-theme--checkup { --health-accent: #216d9b;  --health-accent-soft: #e6eff6; }
.health-theme--allergy { --health-accent: #ad5b2a;  --health-accent-soft: #f7e9e0; }
.health-theme--vaccine { --health-accent: #6b5b9b;  --health-accent-soft: #ece9f5; }
.health-theme--weight { --health-accent: #0e6f78;  --health-accent-soft: #e4f1f2; }
/*
 * 书签条：模仿 Chrome 的标签页（老板要求）。
 *
 * Chrome 的关键特征，这里逐条对应：
 *   1. 标签栏底色比内容区**略深**，像浏览器窗口顶部那条
 *   2. 每个标签是**上圆角**的片，未选中的是浅底 + 彼此之间有细分隔线
 *   3. **选中的标签与下方内容同色、且没有底边** —— 看着像"长"在内容上
 *   4. 选中标签顶部一条主题色，起高亮作用
 *
 * 第 3 条靠"负外边距 + 用内容底色盖住标签栏的底边"实现：
 * 这是纯 CSS 里让标签与内容连成一体的经典做法。
 */
.health-tabs {
  display: flex;
  align-items: flex-end;
  padding: 10rpx 10rpx 0;
  background: rgba(30, 46, 36, 0.055);
  border-bottom: 1rpx solid rgba(30, 46, 36, 0.08);
}

/* 六个书签等宽（老板要求） */
.health-tabs__item {
  flex: 1 1 0;
  min-width: 0;
  padding: 16rpx 0 18rpx;
  text-align: center;
  font-size: 24rpx;
  color: #6b7566;
  background: rgba(30, 46, 36, 0.045);
  border-radius: 14rpx 14rpx 0 0;
  /* 未选中标签之间的分隔线（Chrome 也有） */
  border-right: 1rpx solid rgba(30, 46, 36, 0.07);
}

.health-tabs__item:last-child {
  border-right: none;
}

.health-tabs__item--active {
  font-weight: 700;
  /* 与内容区同色 → 连成一体 */
  background: #fbfcf7;
  /* 顶部主题色高亮条 */
  border-top: 5rpx solid transparent;
  /* 左右分隔线让开，避免把"长在内容上"的观感切断 */
  border-right-color: transparent;
  border-left: 1rpx solid rgba(30, 46, 36, 0.07);
  /* 盖住标签栏的底边 —— 这一步才真正让它和内容连起来 */
  margin-bottom: -1rpx;
  padding-bottom: 19rpx;
}

/*
 * 每个板块一套主题色。下划线取主题色，选中文字也用主题色。
 * 六个颜色都取低饱和，和整站的米绿底色放一起不刺眼。
 */
.health-theme--medical .health-tabs__item--active { color: #0f7b49; border-top-color: #0f7b49; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--medical .health-panel__body,
.health-theme--medical .health-tabs__item--active { background: #edf6f1; }
.health-theme--checkup .health-tabs__item--active { color: #216d9b; border-top-color: #216d9b; }
.health-theme--checkup .health-panel__body,
.health-theme--checkup .health-tabs__item--active { background: #eaf2f8; }
.health-theme--allergy .health-tabs__item--active { color: #ad5b2a; border-top-color: #ad5b2a; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--allergy .health-panel__body,
.health-theme--allergy .health-tabs__item--active { background: #fbf1ea; }
.health-theme--vaccine .health-tabs__item--active { color: #6b5b9b; border-top-color: #6b5b9b; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--vaccine .health-panel__body,
.health-theme--vaccine .health-tabs__item--active { background: #f2f0f8; }
.health-theme--weight .health-tabs__item--active { color: #0e6f78; border-top-color: #0e6f78; }
/* 内容区一层极浅的主题底色 —— 让色系看得出来，又不盖过内容。
   选中书签用同一个底色，Chrome 那种「标签长在内容上」的观感才不会被破坏。 */
.health-theme--weight .health-panel__body,
.health-theme--weight .health-tabs__item--active { background: #ebf4f5; }

/*
 * 两个独立入口（健康记录 / 健康分析）。
 *
 * 与五个板块分开：它们在板块卡**外面**，各自一张小卡、各自一个颜色，
 * 左侧一道粗色条，一眼能区分"这是入口"而不是"这是记录类型"。
 */
/* 「健康记录」通栏 Banner：整块上色、白字，右边一个箭头表示可点进去 */
.health-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #2f6b52 0%, #3d8464 100%);
  box-shadow: 0 12rpx 28rpx rgba(30, 46, 36, 0.16);
}

.health-entry__copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}

.health-entry__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #f3eddd;
}

.health-entry__hint {
  font-size: 22rpx;
  color: rgba(243, 237, 221, 0.78);
}

.health-entry__arrow {
  flex: none;
  font-size: 40rpx;
  line-height: 1;
  color: rgba(243, 237, 221, 0.7);
}

/*
 * 内容区里的板块现在自己是扁平的（见 src/styles/health-section.scss），
 * 不再需要在这里用 :deep() 去掉它们的卡片外观 ——
 * 而且微信小程序的自定义组件有样式隔离，:deep() 本来也穿不进去。
 */

.state-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.state-card__button {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  color: #f3eddd;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
}

.state-card__button::after {
  border: none;
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

.field-help {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
}

.field-textarea {
  margin-top: 10rpx;
  width: 100%;
  min-height: 180rpx;
  box-sizing: border-box;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 46, 36, 0.08);
}
</style>
