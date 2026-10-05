<template>
  <view class="custom-recipe-page">
    <!-- 顶部 Banner（2026-10-04 老板调整）：
         身份块参照健康管理页的 hero-card，并把原来独占一个版面的「选择狗狗」
         融进来 —— 顾客一进页面先看到"这是给谁定制"，而不是先答一道选择题。

         多只狗时整块用 <picker> 包住（连头像一起可点），只有一只时不包：
         点了也只会弹出同一个选项，白让顾客以为有得换（健康管理页同一套口径）。 -->
    <view class="hero-card">
      <picker
        v-if="dogOptions.length > 1"
        class="hero-card__identity"
        mode="selector"
        :range="dogOptions"
        range-key="name"
        :value="dogPickerIndex"
        @change="onDogChange"
      >
        <view class="hero-card__identity-inner">
          <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
          <view class="hero-card__name-block">
            <text class="hero-card__title">{{ selectedDog ? (selectedDog.name || '狗狗') : '请选择狗狗' }}</text>
            <text v-if="dogHeroLine" class="hero-card__line">{{ dogHeroLine }}</text>
            <text class="hero-card__switch">切换 ▼</text>
          </view>
        </view>
      </picker>

      <view v-else class="hero-card__identity">
        <view class="hero-card__identity-inner">
          <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
          <view class="hero-card__name-block">
            <text class="hero-card__title">{{ selectedDog ? (selectedDog.name || '狗狗') : '请选择狗狗' }}</text>
            <text v-if="dogHeroLine" class="hero-card__line">{{ dogHeroLine }}</text>
          </view>
        </view>
      </view>

      <!-- 生命阶段 / 体况评分 / 活动量（2026-10-05 老板要求挪进 Banner）：
           这三项直接决定这单食谱的用量，顾客要在一眼之内核对完，
           原先它们各占信息卡的一行，现在并进身份块下面。 -->
      <view v-if="selectedDog" class="hero-card__facts">
        <view class="hero-card__fact">
          <text class="hero-card__fact-label">生命阶段</text>
          <text class="hero-card__fact-value">{{ getDogLifeStageLabel(selectedDog) }}</text>
        </view>
        <view class="hero-card__fact">
          <text class="hero-card__fact-label">体况评分</text>
          <text class="hero-card__fact-value">{{ getBCSText(selectedDog.bcsScore) }}</text>
        </view>
        <view class="hero-card__fact">
          <text class="hero-card__fact-label">活动量</text>
          <text class="hero-card__fact-value">{{ getActivityLabel(selectedDog.activityLevel) }}</text>
        </view>
      </view>
    </view>

    <!-- 待付款单提醒（2026-10-04 新增）。
         口径是**不限制下单张数**（顾客养多只狗可以分别定制），所以这里只提醒
         "别忘了付这一单"，绝不做成"先付完才能再下单"的阻断。 -->
    <view v-if="pendingOrder" class="pending-banner">
      <view class="pending-banner__head">
        <text class="pending-banner__title">你有一张待付款的定制单</text>
        <text v-if="pendingOrderRemainingText" class="pending-banner__time">{{ pendingOrderRemainingText }}</text>
      </view>
      <text class="pending-banner__desc">
        超时未支付，订单会自动取消。定制张数不限，你也可以继续提交新的定制单。
      </text>
      <view class="pending-banner__actions">
        <button
          class="pending-banner__btn primary"
          :disabled="pendingPaying"
          @tap="continuePayPending"
        >{{ pendingPaying ? '处理中…' : '继续支付' }}</button>
        <button class="pending-banner__btn" @tap="viewPendingOrder">查看订单</button>
      </view>
    </view>

    <!-- 身份与档案状态。
         狗狗选择器已经并入上面的 Banner，这里只剩下"这一单能不能开始"的几件事。
         未登录 / 正在读取 / 没有档案这三种状态卡必须都留着（且互斥），
         它们各自对应完全不同的下一步动作。 -->
    <view class="section">
      <!-- 体重管理计划（阶段 D1）：进行中就带出目标与当前能量。
           计划才是顾客当下真正在执行的方案，定制时必须看得见 ——
           否则他定的减重计划在定制页完全没有体现，等于白定。 -->
      <view v-if="selectedPlan" class="plan-banner">
        <view class="plan-banner__head">
          <text class="plan-banner__title">
            {{ selectedPlan.direction === 'LOSS' ? '减重计划' : '增重计划' }}进行中
          </text>
          <text class="plan-banner__badge">{{ planStatusLabel }}</text>
        </view>
        <view class="plan-banner__rows">
          <text class="plan-banner__row">
            目标体重 {{ selectedPlan.targetWeightKg }}kg
            <template v-if="selectedPlan.remainingKg > 0">（还差 {{ selectedPlan.remainingKg }}kg）</template>
          </text>
          <text class="plan-banner__row">
            当前每日能量 {{ selectedPlan.currentKcal }} kcal
          </text>
        </view>
        <text class="plan-banner__hint">
          下面的每日能量已经按这个计划算好了。
        </text>
      </view>

      <!-- 定制门槛：这几项必须由顾客亲自确认过。
           老档案不追溯，因此在这里就地补确认 —— 只在"真的要用到"的时候问。 -->
      <view v-if="gateBlocked" class="gate-card">
        <text class="gate-card__title">开始定制前，请确认这几项</text>
        <text class="gate-card__desc">
          体况评分、活动量、每日餐数原先可能是系统按默认值填的，
          需要你确认一下 —— 它们决定食谱的用量与制作单。
        </text>

        <!-- 体况评分（阶段 C6）：已确认过就只读展示，未确认就地做 4 个动作题。
             不再让顾客估「几分」—— 与建档页保持同一套判据。 -->
        <view v-if="gateBcsAlreadyConfirmed" class="gate-row">
          <text class="gate-row__label">体况评分</text>
          <text class="gate-row__value gate-row__value--done">
            {{ getBCSText(selectedDog.bcsScore) }} · 已确认
          </text>
        </view>

        <view v-else class="gate-bcs">
          <view class="gate-row">
            <text class="gate-row__label">体况评分</text>
            <text
              class="gate-row__value"
              :class="{ 'gate-row__value--done': gateEffectiveBcs !== null }"
            >{{ gateEffectiveBcs === null ? '待确认' : `${gateEffectiveBcs} 分 · ${gateBcsResultLabel}` }}</text>
          </view>
          <text class="bcs-banner">回答以下问题，确认狗狗的体态健康！</text>

          <view
            v-for="question in gateBcsQuestions"
            :key="question.key"
            class="bcs-question"
          >
            <image
              v-if="question.image"
              class="bcs-question__image"
              :src="question.image"
              mode="widthFix"
            />
            <text class="bcs-question__title">{{ question.title }}</text>
            <view class="bcs-question__options">
              <view
                v-for="option in question.options"
                :key="option.label"
                class="bcs-question__option"
                :class="{ active: gateBcsAnswers[question.key] === option.bcs }"
                @tap="selectGateBcsAnswer(question.key, option.bcs)"
              >{{ option.label }}</view>
            </view>
          </view>
        </view>

        <view class="gate-row">
          <text class="gate-row__label">活动量</text>
          <picker
            mode="selector"
            :range="gateActivityOptions.map(item => item.label)"
            :value="gateActivityIndex"
            @change="onGateActivityChange"
          >
            <view class="gate-row__value">{{ gateActivityOptions[gateActivityIndex]?.label || '请选择' }}</view>
          </picker>
        </view>

        <view class="gate-row">
          <text class="gate-row__label">每日餐数</text>
          <picker
            mode="selector"
            :range="gateMealOptions.map(item => `${item} 餐/天`)"
            :value="gateMealIndex"
            @change="onGateMealChange"
          >
            <view class="gate-row__value">{{ gateDraft.mealsPerDay }} 餐/天</view>
          </picker>
        </view>
        <!-- 老板定稿文案（U4）：餐数说"影响制作单的生成"，不说价格 -->
        <text class="gate-row__hint">每日餐数影响制作单的生成，请确认</text>

        <button
          class="gate-confirm-btn"
          :disabled="gateSaving || gateBcsPending"
          @tap="confirmGate"
        >{{ gateBcsPending ? '请先做完上面的体况问题' : (gateSaving ? '保存中…' : '确认并继续') }}</button>
      </view>

      <!-- 未登录：这里要区分"没登录"和"没有狗狗档案"。
           原先未登录时读不到档案，页面直接落到下面的"还没有狗狗档案"空态，
           顾客会被引导去建档，建到一半才发现其实还得先登录。
           这两个状态要分开说，顾客才知道下一步该做什么。 -->
      <view v-if="needLogin" class="login-hint">
        <text class="login-hint-title">请先登录</text>
        <text class="login-hint-desc">登录后我们才能读取毛孩子的档案，按它的体重和身体状况来定制。</text>
        <button class="login-hint-btn" @tap="goToLogin">去登录</button>
      </view>

      <!-- 正在读取档案：档案是异步读的，请求还没回来就先说"还没有狗狗档案"是误报 ——
           一位明明有 3 只狗的顾客会被这句话引导去重复建档。加载态与空态必须分开。 -->
      <view v-else-if="dogsLoading" class="no-dog-hint">
        <text class="no-dog-hint-title">正在读取狗狗档案…</text>
        <text class="no-dog-hint-desc">马上就好，读完就能选要定制的狗狗了。</text>
      </view>

      <!-- 无档案时的引导：原先只弹一句 toast，页面上没有任何建档入口，提交按钮永久不可用 -->
      <view v-else-if="dogOptions.length === 0" class="no-dog-hint">
        <text class="no-dog-hint-title">还没有狗狗档案</text>
        <text class="no-dog-hint-desc">专属食谱需要先有狗狗档案，我们才能按它的体重和身体状况来定制。</text>
        <button class="no-dog-hint-btn" @tap="goToCreateDog">创建狗狗档案</button>
      </view>
    </view>

    <!-- 第一步：体重管理（2026-10-05 老板要求：标题由"定制目标"改为"体重管理"，
         并删掉标题下方重复的"体重管理"四个字） -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">1</text>
        <text class="title-text">体重管理</text>
      </view>

      <!-- 这一块**不再让顾客选方向**（老板 2026-10-04 拍板）。
           方向改由「体重管理计划」决定，没有计划就按体况给，
           所以这一块变成"看结论 + 去计划页"的引导入口。
           为什么不让顾客在这里选：同一只狗的方向在两个地方能选出相反值，
           而两个值都会交给营养师。

           2026-10-05 老板要求：**只保留最上方的提醒**（体况结论），
           下面那组"你的目标 / 每天需要约 X kcal"整块删掉。 -->
      <view class="goal-group">
        <view v-if="bcsAdviceText" class="advice-line">
          <text class="advice-line__text">{{ bcsAdviceText }}</text>
        </view>

        <button class="plan-entry-btn" @tap="goToWeightGoalPlan">{{ planEntryButtonText }}</button>
      </view>
    </view>

    <!-- 第二步：过敏信息
         这一块原来嵌在「需要健康管理」勾选里，现在常驻显示：
         过敏是定制食谱的硬信息（喂错可能出事），不该等顾客先勾一个框才出现。
         疾病史不再在定制页录入 —— 健康管理页才是它的入口。 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">2</text>
        <text class="title-text">过敏信息</text>
      </view>

      <view class="health-item">
        <!-- "这些是从档案带出来的"：不说明的话，顾客会以为是上次在这页填的 -->
        <text v-if="healthPrefillHint" class="health-prefill-hint">{{ healthPrefillHint }}</text>

        <view class="health-header">
          <!-- 2026-10-05 老板要求：删掉"它不能吃的东西"这个重复标题
               （板块标题已经是"过敏信息"），只留手动添加入口 -->
          <text class="add-btn" @tap="addAllergen">+ 添加</text>
        </view>

        <!-- 常见过敏原：点一下选中、再点一下取消（2026-10-04）。
             原先只能"加"，加错了得跑到下面的列表里找那条点「删除」，
             同一个标签要管两处。现在标签自己就是开关。

             2026-10-05 老板要求：选中态**不加 ✓**，靠高亮表示；
             并且选中的不再在下方重复列一遍 —— 标签自己就是状态的唯一展示。 -->
        <view class="allergen-quick-add">
          <view class="tag-list">
            <view
              v-for="name in commonAllergens"
              :key="name"
              class="tag-item allergen-quick-tag"
              :class="{ 'allergen-quick-tag--added': isAllergenAdded(name) }"
              @tap="toggleAllergenByName(name)"
            >{{ name }}</view>
          </view>
        </view>

        <!-- 下方只列**手动录入**的过敏原（快选里没有的那些）。
             它们没有对应的标签可以点掉，必须留一个能看到、能删的地方；
             快选项不在这里重复出现。 -->
        <view v-if="customAllergens.length > 0" class="tag-list">
          <view
            v-for="(allergen, index) in customAllergens"
            :key="allergen"
            class="tag-item editable"
          >
            <text>{{allergen}}</text>
            <text class="remove-btn" @tap.stop="removeCustomAllergen(allergen)">删除</text>
          </view>
        </view>

        <!-- 拍检测报告自动读（2026-10-04 从健康管理搬来）。
             老板："将过敏源的记录放到定制食谱流程中。"
             :key 绑狗 ID：换狗时必须整个重挂载，否则"上一只狗扫描出来的
             候选过敏原"会留在新狗的单子上等着被确认。 -->
        <AllergyScanBlock
          v-if="formData.dogId"
          :key="formData.dogId"
          :dog-id="formData.dogId"
          @scanned="onAllergensScanned"
        />

        <!-- 已传过的检测报告：家长随时翻得出来（原件不再"读完就丢"） -->
        <view v-if="allergyReports.length > 0" class="allergy-reports">
          <text class="allergy-reports__title">已上传的检测报告（{{ allergyReports.length }} 份）</text>
          <view
            v-for="report in allergyReports"
            :key="report.id"
            class="allergy-reports__item"
            @tap="previewAllergyReport(report)"
          >
            <text class="allergy-reports__name">
              {{ report.testDate || '未填日期' }} · {{ reportTestMethodLabel(report.testMethod) }}
            </text>
            <text class="allergy-reports__action">查看</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 第三步：饮食偏好（可选）
         老板口径：这里是口味，和健康信息无关；两项都可留空。 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">3</text>
        <text class="title-text">饮食偏好（可选）</text>
      </view>
      <text v-if="preferencePrefillHint" class="preference-prefill-hint">{{ preferencePrefillHint }}</text>

      <view class="preference-section">
        <text class="preference-title">爱吃的食材（可选）</text>
        <view class="tag-list">
          <view
            v-for="(ingredient, index) in formData.preferredIngredients"
            :key="index"
            class="tag-item editable"
          >
            <text>{{ingredient}}</text>
            <text class="remove-btn" @tap.stop="removePreferredIngredient(index)">删除</text>
          </view>
          <view class="add-btn" @tap="addPreferredIngredient">
            <text>+ 添加</text>
          </view>
        </view>
      </view>

      <view class="preference-section">
        <text class="preference-title">忌口的食材（可选）</text>
        <view class="tag-list">
          <view
            v-for="(ingredient, index) in formData.dislikedIngredients"
            :key="index"
            class="tag-item editable"
          >
            <text>{{ingredient}}</text>
            <text class="remove-btn" @tap.stop="removeDislikedIngredient(index)">删除</text>
          </view>
          <view class="add-btn" @tap="addDislikedIngredient">
            <text>+ 添加</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 第四步：备注（可选）
         老板口径：这是给营养师看的备注，不影响价格与热量计算，
         所以从"定制目标"里独立出来，放在饮食偏好之后。 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">4</text>
        <text class="title-text">备注（可选）</text>
      </view>
      <textarea
        v-model="formData.additionalNotes"
        class="notes-input"
        placeholder="例如：它最近在换粮、吃某种药、不爱嚼硬的，或你有其它想让营养师知道的"
        maxlength="500"
      />

      <!-- 附件（可选）：检测报告、化验单的照片 -->
      <view class="attachment-section">
        <view class="attachment-header">
          <text v-if="canAddAttachment" class="attachment-add" @tap="pickAttachment">
            {{ attachmentUploading ? '上传中…' : '上传资料（可选）' }}
          </text>
          <text v-else class="attachment-limit">已传满 {{ maxAttachmentCount }} 张</text>
        </view>
        <text class="attachment-hint">每次最多 {{ maxAttachmentCount }} 张</text>
        <view v-if="formData.attachmentUrls.length > 0" class="attachment-list">
          <view
            v-for="(url, index) in formData.attachmentUrls"
            :key="url"
            class="attachment-item"
          >
            <text class="attachment-name">资料 {{ index + 1 }}</text>
            <text class="attachment-preview" @tap="previewAttachment(url)">预览</text>
            <text class="attachment-remove" @tap.stop="removeAttachment(index)">删除</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 交付与抵扣这一整块**已删除**（老板 2026-10-05 拍板）。
         两个原因：
           ① 提交前这里显示的"预计交付"是前端按"今天 + N 个工作日"估的参考值，
              **不含节假日**，国庆期间必然偏早（实测页面显示 10/8，后端实际排到 10/10）
              —— 与确认页给的权威日期打架，不如不显示；
           ② 确认页（提交成功页）已经完整显示「预计交付」与「成品抵扣额度 + 说明」，
              这一块本来就是重复的。
         权威日期与抵扣，顾客提交后在确认页看到。 -->

    <!-- 提交按钮
         disabled 必须带上 submitting：按钮文案是"下一步：支付 ¥300"，
         点一次就进入订阅弹窗，这期间再点一次会生成第二张待付款单。 -->
    <view class="submit-section">
      <button
        class="submit-btn"
        @tap="submitOrder"
        :disabled="!canSubmit || submitting"
      >
        {{ submitting ? '提交中…' : submitButtonText }}
      </button>
      <text v-if="paymentHint" class="submit-note">{{ paymentHint }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getToken, request } from '@/utils/api';
import { dogApi } from '@/api/dogs';
import AllergyScanBlock from '@/components/custom-recipe/AllergyScanBlock.vue';
import {
  requestCustomRecipeOrderSubscription,
  runCustomRecipePayment,
} from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  formatAmount,
  formatRemainingMinutes,
  resolvePaymentDeadlineAt,
} from '@/utils/custom-recipe-order';
import { navigateToDogCreate } from '@/utils/dog-profile-entry';
import { resolveDogAvatarSrc } from '@/utils/dog-avatar';
import {
  calculateDogAgeText,
  resolveDogBreedName,
} from '@/utils/dog-profile-overview';
import {
  weightGoalPlanApi,
  getPlanStatusLabel,
  type WeightGoalPlanView,
} from '@/api/weight-goal-plan';
import {
  getBcsLabel,
  BCS_QUESTIONS,
  applyBcsScoreMap,
  resolveBcsFromAnswers,
} from '@/utils/bcs-questionnaire';

// 状态定义
const dogOptions = ref<any[]>([]);
const selectedDog = ref<any>(null);

/**
 * 狗狗档案是否还在读。
 *
 * 初始为 true：请求还没回来之前页面必须先说"正在读取"，
 * 而不是先亮出"还没有狗狗档案"这个空态。
 */
const dogsLoading = ref(true);

/**
 * 当前狗狗的体重管理计划（阶段 D1）。
 *
 * 进行中/in 维持期时才带出来 —— 计划才是顾客当下真正在执行的方案，
 * 定制页必须看得见，否则他定的减重计划在这里完全没有体现。
 */
const selectedPlan = ref<WeightGoalPlanView | null>(null);
const planStatusLabel = computed(() =>
  selectedPlan.value ? getPlanStatusLabel(selectedPlan.value.status) : '',
);

/**
 * 定制方向**由系统定，顾客不能选**（老板 2026-10-04 拍板）。
 *
 * 为什么把顾客那三个单选删掉：同一只狗的方向可以在这里被选成"增重"，
 * 而上面横幅还写着"减重计划进行中、还差 0.8kg"，两个值都会交给营养师。
 * 取值顺序固定为「计划 > 体况」：
 *   ① 计划进行中 → 减重计划给 LOSE_WEIGHT，增重计划给 GAIN_WEIGHT
 *   ② 维持期 → MAINTAIN
 *   ③ 没有计划 → 按体况给：偏胖减重、偏瘦增重、其余维持
 * 第 ③ 条与后端 resolveSuggestedPlan 同一套判据（BCS ≥ 6 减重、≤ 3 增重、
 * 4-5 不建议增减重），这样页面上写"建议减重"、后端算出来也是减重。
 */
const BCS_LOSS_THRESHOLD = 6;
const BCS_GAIN_THRESHOLD = 3;
/** BCS 4-5 是理想区间，按"维持"处理（后端在同样区间里不给增减重建议） */
const BCS_MAINTAIN_GOAL = 'MAINTAIN';

function resolveTargetGoal(): string {
  const plan = selectedPlan.value;
  if (plan) {
    if (plan.status === 'ACTIVE') {
      return plan.direction === 'LOSS' ? 'LOSE_WEIGHT' : 'GAIN_WEIGHT';
    }
    if (plan.status === 'MAINTENANCE') return BCS_MAINTAIN_GOAL;
  }

  const bcs = Number(selectedDog.value?.bcsScore);
  if (!Number.isFinite(bcs) || bcs <= 0) return BCS_MAINTAIN_GOAL;
  if (bcs >= BCS_LOSS_THRESHOLD) return 'LOSE_WEIGHT';
  if (bcs <= BCS_GAIN_THRESHOLD) return 'GAIN_WEIGHT';
  return BCS_MAINTAIN_GOAL;
}

/**
 * 把表单里的方向对齐到「计划 > 体况」。
 *
 * 每次会影响方向的输入变化（选狗、读到计划、补确认完体况）后都要调一次；
 * 顾客改不了方向，所以这里不需要任何"锁住不让点"的界面逻辑。
 */
function syncGoalWithPlan() {
  formData.value.targetGoal = resolveTargetGoal();
}

async function loadSelectedPlan(dogId: string) {
  selectedPlan.value = null;
  if (!dogId) return;
  try {
    const res = await weightGoalPlanApi.current(dogId);
    // 慢响应保护：连点切换狗狗时，上一只的响应可能后到，
    // 不能让它把当前这只狗的计划覆盖掉（医疗/用量信息串狗是安全事件）
    if (formData.value.dogId !== dogId) return;
    selectedPlan.value = res.code === 0 ? (res.data ?? null) : null;
    // 方向跟计划走，放在赋值之后、慢响应保护之内
    syncGoalWithPlan();
  } catch {
    // 读不到计划不该挡住定制流程：方向退回按体况给（resolveTargetGoal 里那一层）
    selectedPlan.value = null;
    syncGoalWithPlan();
  }
}

/**
 * Banner 里的头像。
 *
 * 与爱犬概览页、健康管理页共用同一个解析函数：没上传头像时给统一默认头像，
 * 不在这里各写一份兜底逻辑。
 */
const dogAvatarSrc = computed(() => resolveDogAvatarSrc(selectedDog.value?.avatarUrl));

/** 选择器要定位到当前这只狗；找不到就落回第一只（宁可少点一次，不猜） */
const dogPickerIndex = computed(() =>
  Math.max(0, dogOptions.value.findIndex((dog) => dog.value === formData.value.dogId)),
);

/** Banner 那一行小字里的体重：不是有效数字就不显示这一项，不写"未知"占位 */
function formatHeroWeight(value: unknown): string {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return '';
  return Number.isInteger(weight) ? `${weight}kg` : `${weight.toFixed(1)}kg`;
}

/**
 * Banner 里名字下面那行小字：品种 · 月龄 · 体重。
 *
 * 每次渲染都从 selectedDog 现算，**不用** dogOptions 里那份拼好的 label：
 * 2026-09-28 真实缺陷 —— 确认定制门槛后会把 PUT 响应合并进 selectedDog，
 * 那份响应当时漏了 breedName，于是品种显示成"未知品种"，
 * 而选择器用的是早先拼好的字符串、还显示着正确品种，同一屏自相矛盾。
 * 派生出来的文字不可能出现两份互相打架的品种。
 */
const dogHeroLine = computed(() => {
  const dog = selectedDog.value;
  if (!dog) return '';
  return [
    resolveDogBreedName(dog),
    calculateDogAgeText(dog.birthday),
    formatHeroWeight(dog.currentWeightKg),
  ]
    .filter(Boolean)
    .join(' · ');
});

/**
 * 计划入口按钮：有计划时说"查看"，没有时说"去制定"（顾客才知道点进去会看到什么）。
 *
 * 后端 getCurrentPlan 只回三种状态：ACTIVE / PAUSED / MAINTENANCE
 * （终态不会回），所以"有计划"就是这三个之一 —— 已暂停的计划也算，
 * 说"去制定"会让顾客以为自己的计划没了。
 */
const hasOpenPlan = computed(() => {
  const plan = selectedPlan.value;
  if (!plan) return false;
  return ['ACTIVE', 'PAUSED', 'MAINTENANCE'].includes(String(plan.status));
});

const planEntryButtonText = computed(() =>
  hasOpenPlan.value ? '查看体重管理计划' : '去制定体重管理计划',
);

/**
 * 体重管理计划页（已存在，参数名就是它 onLoad 里读的 dogId）。
 *
 * mode 必须跟着"有没有计划"走：
 *   · 有计划 → adjust（看进度 / 改目标 / 改力度 / 取消）
 *   · 没计划 → 不传，该页默认进 create（系统建议 → 顾客调整 → 确认）
 * 为什么不一律用 create：有计划的狗再进 create，后端 createPlan 会直接抛
 * 「这只狗狗已经有一个进行中的计划了」，顾客点了按钮只看到一句报错。
 * 读计划失败时按"没有计划"处理，与 resolveTargetGoal 的兜底保持一致。
 */
const goToWeightGoalPlan = () => {
  const dogId = formData.value.dogId;
  if (!dogId) {
    uni.showToast({ title: '请先选择要定制的狗狗', icon: 'none' });
    return;
  }
  const query = [`dogId=${encodeURIComponent(dogId)}`];
  if (hasOpenPlan.value) {
    query.push('mode=adjust');
  }
  uni.navigateTo({
    url: `/pages/weight-goal-plan/index?${query.join('&')}`,
  });
};

const submitting = ref(false);
/** 未登录标记：与"已登录但还没有狗狗档案"是两个不同的状态，提示语和下一步动作都不一样 */
const needLogin = ref(false);

/**
 * 排期口径（2026-10-04 拍板）：顾客**不选日期**，前端也不传日期。
 *
 * 排期由后端"从今天起找最近的可接单工作日"（当天约满或遇公众假期顺延）决定，
 * 下单响应与订单接口会带回 scheduledDate / estimatedDeliveryDate。
 * 这里原先有一个取"今天"的函数，把当天当作顾客选的预约日期塞进 scheduledDate ——
 * 后端的 CreateOrderDTO 已把它改为「可选且不再采信」，所以整块删掉：
 * 前端不猜日期，顾客看到的日期一律来自后端。
 */
const formData = ref({
  dogId: '',
  targetGoal: '',
  allergies: [] as string[],
  preferredIngredients: [] as string[],
  dislikedIngredients: [] as string[],
  additionalNotes: '',
  attachmentUrls: [] as string[],
  // 过敏信息一律写回狗狗档案（2026-10-04 老板要求"一定要存档"）。
  // 后端是**只增不删**：不会删掉档案里已有的记录。
  syncToHealthProfile: true,
});

/**
 * 档案已有信息（老板拍板的决策 3：定制页是档案的第二个填写入口）。
 *
 * 后端早就有一个汇总接口（过敏/疾病/最近体检/体重趋势），2026-09-28 又补上了
 * 疫苗与口味偏好 —— 但前端此前**从未调用过**，所以顾客每次都要从零手打。
 */
const healthSummary = ref<any>(null);
const healthSummaryLoading = ref(false);

/** 附件上传中 */
const attachmentUploading = ref(false);

/**
 * 附件最多张数。
 *
 * 后端一个订单能存多条 COS 地址，但顾客一次上传一堆照片也没人看得完，
 * 而且"最多几张"必须提前说清 —— 传满才知道传不进去是最差的体验。
 */
const maxAttachmentCount = 9;

const canAddAttachment = computed(
  () =>
    !attachmentUploading.value &&
    formData.value.attachmentUrls.length < maxAttachmentCount,
);

// 后台「食谱定制设置」的公开部分（定制费 / 可抵扣金额 / 交付工作日数）
const recipeConfig = ref<{
  feeAmount: number;
  creditAmount: number;
  deliveryWorkDays: number;
  /**
   * 支付超时分钟数（0 = 不自动关单）。
   *
   * 口径来自后台「食谱定制设置」，公开配置接口下发；
   * 接口还没下发这个字段时按 0 处理 —— 此时页面不显示任何时限文案，
   * 绝不自己编一个默认超时。
   */
  paymentTimeoutMinutes: number;
  /** 订阅消息模板 ID；后台未配置时为 null（小程序据此跳过订阅申请） */
  orderNotifyTemplateId: string | null;
} | null>(null);

// 计算属性
/**
 * 定制门槛（老板决策 1 + U3）。
 *
 * 这四项在表单里都有兜底值，所以"有值"不代表顾客选过：
 *   · 体况评分、活动量 —— 原先建档案时被系统预填（生产 76% 等于默认值 5）
 *   · 每日餐数 —— 直接决定制作单的每包克重与包数
 * 因此门槛按**顾客是否亲自确认过**判定，而不是"有没有值"。
 * 未确认的在这里就地补确认（老板决定：老档案不追溯，进定制页时才要求补）。
 */
const gateUnconfirmed = computed(() => {
  const dog = selectedDog.value;
  if (!dog) return [] as string[];

  const missing: string[] = [];
  if (!dog.bcsScoreConfirmed) missing.push('体况评分');
  if (!dog.activityLevelConfirmed) missing.push('活动量');
  if (!dog.mealsPerDayConfirmed) missing.push('每日餐数');
  return missing;
});

const gateBlocked = computed(
  () => Boolean(selectedDog.value) && gateUnconfirmed.value.length > 0,
);

/** 补确认用的草稿值：默认沿用档案里的现值，顾客可以直接确认或改动 */
const gateDraft = ref({ activityLevel: 'LOW', mealsPerDay: '2' });
const gateSaving = ref(false);

// ========== 体况引导（阶段 C6）：与建档页共用同一套 4 动作问卷 ==========
//
// 2026-09-29 修正：这里原来是一个「1-9 分」选择器 —— 正是阶段 C1 废掉的做法。
// C1 改问卷的全部理由是「顾客看不懂 9 选 1，所以生产库 99.98% 从未确认过」，
// 而定制页恰恰是顾客**第一次真正被问到体况**的地方（老档案不追溯，
// 进定制页才要求补确认）。两处不一致，等于把废掉的老问题又端了上来。
const gateBcsAnswers = ref<Record<string, number>>({});

/** 档案里已确认过体况 → 只读展示，不重复问 */
const gateBcsAlreadyConfirmed = computed(() =>
  Boolean(selectedDog.value?.bcsScoreConfirmed),
);

const gateBcsQuestions = BCS_QUESTIONS;

const gateBcsResult = computed(() =>
  resolveBcsFromAnswers({
    answers: gateBcsAnswers.value,
    questions: gateBcsQuestions,
  }),
);

/**
 * 该犬种的体况分下限（深胸细腰型犬，如灵缇）。
 * 名单与数值来自数据库犬种表，随狗的档案接口下发。
 */
const gateBcsScoreMap = computed(
  () => selectedDog.value?.bcsScoreMap ?? null,
);

/** 最终生效的体况分 = 算出的分与犬种下限取较大者 */
const gateEffectiveBcs = computed(() =>
  applyBcsScoreMap(
    gateBcsResult.value.bcs,
    gateBcsScoreMap.value,
    gateBcsQuestions[0].options,
  ),
);

const gateBcsResultLabel = computed(() =>
  gateEffectiveBcs.value === null ? '' : getBcsLabel(gateEffectiveBcs.value),
);

/** 必答题还没答完 → 按钮不可用（与建档页同一套判据） */
const gateBcsPending = computed(
  () => !gateBcsAlreadyConfirmed.value && gateBcsResult.value.bcs === null,
);

function selectGateBcsAnswer(questionKey: string, bcs: number) {
  gateBcsAnswers.value = { ...gateBcsAnswers.value, [questionKey]: bcs };
}
// ========== 体况引导结束 ==========

const gateActivityOptions = [
  { value: 'RESTING', label: '休息静养' },
  { value: 'LOW', label: '城市日常（多数城市犬）' },
  { value: 'NORMAL', label: '规律运动' },
  { value: 'HIGH', label: '高活动' },
  { value: 'WORKING', label: '工作犬' },
];
const gateMealOptions = ['1', '2', '3', '4', '5'];

const gateActivityIndex = computed(() =>
  Math.max(0, gateActivityOptions.findIndex((item) => item.value === gateDraft.value.activityLevel)),
);
const gateMealIndex = computed(() =>
  Math.max(0, gateMealOptions.indexOf(gateDraft.value.mealsPerDay)),
);

function syncGateDraftFromDog(dog: any) {
  gateDraft.value = {
    activityLevel: String(dog?.activityLevel || 'LOW'),
    mealsPerDay: String(dog?.mealsPerDay || '2'),
  };
  // 换了一只狗就要重答，不能把上一只的答案带过来
  gateBcsAnswers.value = {};
}

function onGateActivityChange(event: any) {
  gateDraft.value.activityLevel = gateActivityOptions[event.detail.value]?.value || 'LOW';
}

function onGateMealChange(event: any) {
  gateDraft.value.mealsPerDay = gateMealOptions[event.detail.value] || '2';
}

/**
 * 提交补确认。
 *
 * 只有顾客在这里点了按钮，才会带上 *Confirmed: true —— 这正是门槛的判据。
 * 只提交这几项，不动档案的其它内容。
 */
const confirmGate = async () => {
  if (!selectedDog.value || gateSaving.value) return;

  // 体况分来自 4 个动作题（与建档页同一套换算），不再让顾客自己估分数。
  // 已确认过的狗沿用档案里的值，不重复问。
  const bcsScore = gateBcsAlreadyConfirmed.value
    ? Number(selectedDog.value.bcsScore) || 5
    : gateBcsResult.value.bcs;

  if (bcsScore === null || bcsScore === undefined) {
    uni.showToast({ title: '请先做完体况的动作题', icon: 'none' });
    return;
  }

  gateSaving.value = true;

  try {
    uni.showLoading({ title: '保存中...' });
    const res: any = await request({
      url: `/dogs/${selectedDog.value.value}`,
      method: 'PUT',
      data: {
        bcsScore,
        activityLevel: gateDraft.value.activityLevel,
        mealsPerDay: Number(gateDraft.value.mealsPerDay) || 2,
        bcsScoreConfirmed: true,
        activityLevelConfirmed: true,
        mealsPerDayConfirmed: true,
      },
    });
    uni.hideLoading();

    const updated = res?.data?.profile;
    if (updated) {
      // 只合并这一颗按钮真的改过的东西（体况评分 / 活动量 / 每日餐数 + 三项确认）。
      //
      // 2026-09-28 真实缺陷：这里原先写的是 `{...selectedDog, ...updated}`，
      // 整体覆盖。服务端 PUT 响应当时漏回 breedName（null），
      // 于是确认完门槛，品种就从"柯基"变成"未知品种"。
      // 门槛只碰这三个字段，就不该让响应里其它字段顺手改写页面上的信息。
      selectedDog.value = {
        ...selectedDog.value,
        bcsScore: updated.bcsScore ?? selectedDog.value.bcsScore,
        activityLevel: updated.activityLevel ?? selectedDog.value.activityLevel,
        mealsPerDay: updated.mealsPerDay ?? selectedDog.value.mealsPerDay,
        bcsScoreConfirmed: true,
        activityLevelConfirmed: true,
        mealsPerDayConfirmed: true,
      };
      syncGateDraftFromDog(selectedDog.value);
      // 体况刚被顾客改过：没有计划时方向就是按体况定的，这里必须跟着变，
      // 否则页面上还写着按上一个体况算出来的方向
      syncGoalWithPlan();
    }
    uni.showToast({ title: '已确认，可以继续定制', icon: 'none' });
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({ title: error?.message || '保存失败，请重试', icon: 'none' });
  } finally {
    gateSaving.value = false;
  }
};

const canSubmit = computed(() => {
  if (!formData.value.dogId || !formData.value.targetGoal) return false;
  if (gateBlocked.value) return false;
  return true;
});

/**
 * 体况评分 → 建议。
 *
 * 2026-10-04 起这句话不只是"建议"：顾客那一组单选删掉之后，
 * 没有体重管理计划时方向就按这里同一套判据定（见 resolveTargetGoal），
 * 所以话里说的"建议减重/增重/维持"就是系统真正会提交的方向，不会自相矛盾。
 *
 * 2026-10-05 老板要求：体重管理卡片只保留这句提醒（下方热量块整块删掉）。
 */
const bcsAdviceText = computed(() => {
  const bcs = Number(selectedDog.value?.bcsScore);
  if (!Number.isFinite(bcs) || bcs <= 0) return '';

  if (bcs >= 6) {
    return `按它目前的体况评分 ${bcs}/9（偏胖），我们建议：减重。`;
  }
  if (bcs <= 3) {
    return `按它目前的体况评分 ${bcs}/9（偏瘦），我们建议：增重。`;
  }
  return `按它目前的体况评分 ${bcs}/9（理想），我们建议：维持。`;
});

const preferencePrefillHint = computed(() => {
  const preferred = formData.value.preferredIngredients.length;
  const disliked = formData.value.dislikedIngredients.length;
  if (preferred === 0 && disliked === 0) return '';
  return '已从档案带出你上次填过的口味，可以直接修改。两项都可以留空。';
});


/**
 * 按钮只讲"下一步要付多少钱"。
 *
 * 原来写「提交定制订单 ¥300」：金额出现在"提交"这个词后面，顾客很容易理解成
 * "点下去就是付 300"。改成「下一步：支付 ¥300」，把"提交"和"付款"分成两步说清。
 */
const submitButtonText = '确认定制';

/**
 * 支付时限提示。
 *
 * 金额与分钟数都来自后台配置（GET /custom-recipe-config）；
 * 配置里没有支付超时（0 = 不自动关单）时返回空串，页面不显示时限。
 */
const paymentHint = computed(() =>
  buildPaymentTimeoutHint({
    paymentTimeoutMinutes: recipeConfig.value?.paymentTimeoutMinutes ?? 0,
  }),
);

// ==================== 待付款单提醒 ====================

/**
 * 已有的待付款单（只用于提醒，不阻断下单）。
 *
 * 口径：不限制下单张数 —— 顾客养多只狗可以分别定制，所以这里**不能**做成
 * "先付完这一单才能再下单"。只提示"别忘了付"并给两个入口。
 */
const pendingOrder = ref<{ orderId: string; deadlineAt: number | null } | null>(
  null,
);
const pendingPaying = ref(false);

/** 剩余时间文案；拿不到截止时间就整段不显示，不猜 */
const pendingOrderRemainingText = computed(() => {
  const deadlineAt = pendingOrder.value?.deadlineAt;
  if (!deadlineAt) return '';
  const remaining = formatRemainingMinutes(deadlineAt, Date.now());
  return remaining ? `还剩 ${remaining}` : '已超过支付时限';
});

/**
 * 配置只读一次：待付款提醒要用配置里的支付超时估算剩余时间，
 * 用同一个 promise 兜住，避免 onLoad 与 onShow 各打一次请求。
 */
let recipeConfigPromise: Promise<void> | null = null;
function ensureRecipeConfig(): Promise<void> {
  if (!recipeConfigPromise) {
    recipeConfigPromise = loadRecipeConfig();
  }
  return recipeConfigPromise;
}

const loadPendingOrder = async () => {
  // 未登录时 /my-orders 必然 401，静默跳过即可
  if (!getToken()) {
    pendingOrder.value = null;
    return;
  }

  await ensureRecipeConfig();

  try {
    const res: any = await request({
      url: '/custom-recipe/my-orders',
      method: 'GET',
      data: { status: 'PENDING_PAYMENT', page: 1, pageSize: 1 },
      quiet: true,
      suppressErrorToast: true,
    });

    const first = Array.isArray(res?.data?.orders) ? res.data.orders[0] : null;
    if (res?.code !== 0 || !first?.orderId) {
      pendingOrder.value = null;
      return;
    }

    pendingOrder.value = {
      orderId: String(first.orderId),
      // 优先用后端下发的 paymentDeadlineAt，没有才用下单时间 + 配置超时估算
      deadlineAt: resolvePaymentDeadlineAt({
        paymentDeadlineAt: first.paymentDeadlineAt ?? null,
        createdAt: first.createdAt ?? null,
        paymentTimeoutMinutes: recipeConfig.value?.paymentTimeoutMinutes ?? 0,
      }),
    };
  } catch (error) {
    // 提醒读不到不影响下单：不打扰顾客，也不弹错
    console.warn('[CustomRecipe] 读取待付款订单失败:', error);
    pendingOrder.value = null;
  }
};

/** 继续支付：与订单列表页保持同一条路径（在线支付优先，通道不可用再转人工） */
const continuePayPending = async () => {
  const orderId = pendingOrder.value?.orderId;
  if (!orderId || pendingPaying.value) return;

  pendingPaying.value = true;
  try {
    const outcome = await runCustomRecipePayment(orderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
      await loadPendingOrder();
      return;
    }
    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可稍后再付', icon: 'none' });
      return;
    }
    if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新提交定制', icon: 'none' });
      await loadPendingOrder();
      return;
    }
    if (outcome === 'MANUAL') {
      // 支付通道不可用：去提交成功页看客服收款方式，保证这单能被付掉
      uni.navigateTo({
        url: `/pages/custom-recipe/success?orderId=${encodeURIComponent(orderId)}`,
      });
      return;
    }
    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    pendingPaying.value = false;
  }
};

const viewPendingOrder = () => {
  const orderId = pendingOrder.value?.orderId;
  if (!orderId) return;
  uni.navigateTo({
    url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId)}`,
  });
};

// 生命周期
onLoad(() => {
  loadDogs();
  void ensureRecipeConfig();
});

/**
 * 从建档页返回时本页不会重新挂载，之前 onLoad 只跑一次，
 * 导致用户自己建好档再回到本页，狗狗列表仍然是空的、提交按钮仍然点不动。
 *
 * 待付款提醒也在这里重查：付完款或取消订单后返回本页，提示要立刻消失。
 */
onShow(() => {
  if (!dogOptions.value.length) {
    void loadDogs();
  }
  void loadPendingOrder();
});

// 统一的建档入口（带来源埋点，建档成功后回到本页）
const goToCreateDog = () => {
  navigateToDogCreate({ source: 'custom_recipe' });
};

/**
 * 去登录。登录成功后由登录页跳回本页（沿用全站统一的 redirect 约定），
 * 本页会重新 onLoad，拿到 token 后再读档案，顾客不用自己找回来。
 */
const goToLogin = () => {
  const redirect = '/pages/custom-recipe/index';
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
  });
};

/**
 * 判断是不是"未登录/登录过期"导致的失败。
 * request() 对 401 统一 reject 一个 message 为 'Authentication required' 的错误，
 * 并会顺手清掉本地 token。
 */
const isAuthError = (error: any) => {
  const message = String(error?.message || error || '');
  return message.includes('Authentication required') || message.includes('401');
};

// 方法

/**
 * 读取后台「食谱定制设置」的公开部分。
 * 读不到不影响下单：价格由后端在下单时按同一份配置落库，
 * 前端这里只负责把顾客看到的价格与服务端保持一致。
 */
const loadRecipeConfig = async () => {
  try {
    const res: any = await request({
      url: '/custom-recipe-config',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
    if (res.code === 0 && res.data) {
      recipeConfig.value = {
        feeAmount: Number(res.data.feeAmount) || 0,
        creditAmount: Number(res.data.creditAmount) || 0,
        deliveryWorkDays: Number(res.data.deliveryWorkDays) || 0,
        // 支付超时（0 = 不自动关单）。接口还没下发时按 0 处理：
        // 页面会跳过时限文案，而不是自己编一个默认超时出来。
        paymentTimeoutMinutes: Number(res.data.paymentTimeoutMinutes) || 0,
        orderNotifyTemplateId: res.data.orderNotifyTemplateId
          ? String(res.data.orderNotifyTemplateId)
          : null,
      };
    }
  } catch (error) {
    console.warn('[CustomRecipe] 读取定制配置失败，按默认口径展示:', error);
  }
};

const loadDogs = async () => {
  // 未登录时不发这次请求：
  // 1) /dogs 必然 401，页面会同时弹"请先登录"和"网络错误"两条互相打架的提示；
  // 2) 请求失败会让页面误落到"还没有狗狗档案"空态，把顾客引向建档这条错路。
  if (!getToken()) {
    needLogin.value = true;
    dogOptions.value = [];
    selectedDog.value = null;
    dogsLoading.value = false;
    return;
  }

  // 每次读档案都先回到加载态：否则从建档页返回重新拉取时，
  // 列表还没回来又会先闪一下"还没有狗狗档案"
  dogsLoading.value = true;

  try {
    // 统一走 utils/api 的 request：它按全站统一响应结构 {code,message,data} 解包，
    // 不再自己判断 code，避免"接口返回结构一变就静默失效"。
    // suppressErrorToast：错误提示由本页按失败原因自己给，避免出现两条重复/矛盾的 toast。
    const res: any = await request({
      url: '/dogs',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });

    if (res.code === 0 && res.data) {
      needLogin.value = false;
      const dogs = Array.isArray(res.data) ? res.data : [];

      dogOptions.value = dogs.map((dog: any) => ({
        // 先铺开接口数据，再覆盖 value/label —— 顺序反了的话，
        // 接口哪天回了同名字段就会把选择器的 value/label 覆盖掉
        ...dog,
        value: dog.id,
        label: `${dog.name} - ${dog.breedName || '未知品种'}`,
      }));

      /**
       * 只有一只狗就直接选中它。
       *
       * 选择器搬进 Banner 之后，顾客在这一页看不到"请选择要定制的狗狗"这种提示了，
       * 只养一只狗的人不该为了一个没有第二种选择的选项多操作一次 ——
       * 之前漏掉这一步会让提交按钮一直灰着，而页面上找不到原因。
       * 多只狗时不自动选：那才是真的需要顾客挑，替他挑错了就是给错狗定制。
       */
      if (!formData.value.dogId && dogOptions.value.length === 1) {
        onDogChange({ detail: { value: 0 } });
      }

      // 无档案时不再弹 toast：页面上已有明确的空态与建档入口，避免重复打扰
    }
  } catch (error) {
    // 登录过期：request() 已清掉本地 token，这里把页面切到"请先登录"，
    // 不能报"网络错误"——那会让顾客以为是自己网络的问题，排查方向完全错了。
    if (isAuthError(error)) {
      needLogin.value = true;
      dogOptions.value = [];
      selectedDog.value = null;
      uni.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      return;
    }

    console.error('加载狗狗列表异常:', error);
    uni.showToast({
      title: '网络错误，请检查后端服务',
      icon: 'none',
      duration: 2000,
    });
  } finally {
    // 无论成功失败都要退出加载态：卡在"正在读取"上，顾客没有任何重试入口
    dogsLoading.value = false;
  }
};

const onDogChange = (e: any) => {
  const index = e.detail.value;
  selectedDog.value = dogOptions.value[index];
  formData.value.dogId = selectedDog.value.value;
  // 换狗先按新狗的体况定一次方向：后面计划读回来了会再对齐一次（计划优先），
  // 这样在计划返回之前，页面上写的方向也不会是上一只狗的
  syncGoalWithPlan();
  // 补确认的草稿值默认沿用档案现值，顾客可以直接确认或改动
  syncGateDraftFromDog(selectedDog.value);
  void loadDogArchiveInfo(selectedDog.value.value);
  void loadSelectedPlan(selectedDog.value.value);
  // 过敏信息块要显示"已上传的检测报告"（2026-10-04 从健康管理搬来）
  void loadAllergyReports(selectedDog.value.value);
};

/** 顿号/逗号分隔的口味文本 → 标签数组 */
function splitFoodText(raw: unknown): string[] {
  return String(raw || '')
    .split(/[,，、;；\n\r]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 带出档案已有信息（决策 3）。
 *
 * 只**预填**，不覆盖顾客已经改过的东西：
 * 重复进入或换狗时以最新一次档案内容为准（顾客此时通常还没开始填）。
 *
 * 2026-10-04 数据安全修复（换狗隔离）：
 * 原先这几项只在读取**成功后**才赋值，读取失败时只清了 healthSummary ——
 * 于是上一只狗的过敏会留在新狗的单子上，还会被"一定要存档"写回
 * **新狗的档案**。过敏是医疗信息，串狗可能直接导致喂错东西。
 * 现在改成"先清空，再按新狗档案填充"：读失败就保持为空，宁可让顾客重填一遍。
 */
const loadDogArchiveInfo = async (dogId: string) => {
  if (!dogId) return;

  // ① 先清空上一只狗带出来的一切（含扫描出来的候选过敏原所在的报告列表）
  formData.value.allergies = [];
  // 口味同理：它也会写进新狗的单子，留着上一只狗的口味没有意义
  formData.value.preferredIngredients = [];
  formData.value.dislikedIngredients = [];
  healthSummary.value = null;
  allergyReports.value = [];

  healthSummaryLoading.value = true;
  try {
    /** 同时取狗狗详情：它带回 calcResult（每日热量与克数），
     *  列表接口里没有这两个数，而"选了目标要给具体数字"需要它们。 */
    const [res, detailRes] = await Promise.all([
      request({
        url: `/custom-recipe/dogs/${dogId}/health-summary`,
        method: 'GET',
        quiet: true,
        suppressErrorToast: true,
      }) as any,
      dogApi.detail(dogId).catch(() => null) as any,
    ]);

    if (res?.code !== 0 || !res.data) {
      throw new Error(res?.message || '读取档案失败');
    }

    // ② 慢响应保护：等待期间顾客又换了狗，这份档案就不再是当前这只的，
    //    直接丢弃 —— 否则 A 狗的过敏会被填到 B 狗的单子上
    if (formData.value.dogId !== dogId) return;

    const calc = detailRes?.data?.calcResult;
    if (calc) {
      selectedDog.value = {
        ...selectedDog.value,
        targetFoodKcal: calc.finalFoodKcal,
        // 有计划时后端已按计划能量算好（阶段 D2）；
        // 没有食谱时还会给一个按已上架食谱中位数估算的克数
        estimatedDailyIntakeG: calc.estimatedDailyIntakeG,
        dailyIntakeG: calc.dailyIntakeG,
        energySource: calc.energySource,
      };
    }

    const data = res.data;
    healthSummary.value = data;

    formData.value.allergies = Array.isArray(data.allergies)
      ? [...data.allergies]
      : [];
    // 过敏可能刚从档案带出来，方向要跟着它算的体况对齐一次
    syncGoalWithPlan();
    // 口味偏好：档案里的两个字段（2026-09-27 才在「健康管理」页有了入口）
    formData.value.preferredIngredients = splitFoodText(data.preferredFoods);
    formData.value.dislikedIngredients = splitFoodText(data.pickyFoods);
  } catch (error) {
    // 读不到档案不能挡住定制：保持上面清空后的空状态，让顾客自己填
    console.warn('[CustomRecipe] 读取档案信息失败:', error);
    healthSummary.value = null;
  } finally {
    healthSummaryLoading.value = false;
  }
};

/**
 * 上传资料（可选）。
 *
 * 能力边界要说实话：这里走的是**相册/拍照**通道（uni.chooseImage），
 * 拿回来的 COS 地址放进订单的 attachmentUrls，营养师在后台订单详情里能看到。
 * 上传用的后端通道本身也收 PDF，但小程序端只能选图片、预览也只认图片
 * （uni.previewImage 打不开 PDF），所以页面上**只承诺照片** ——
 * 原来那句文案是在承诺一个这里做不到的能力。
 */
const pickAttachment = async () => {
  if (attachmentUploading.value) return;

  if (formData.value.attachmentUrls.length >= maxAttachmentCount) {
    uni.showToast({
      title: `最多上传 ${maxAttachmentCount} 张照片`,
      icon: 'none',
    });
    return;
  }

  let filePath = '';
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        /**
         * 只从相册选（2026-10-05 老板要求：与过敏报告上传一致）。
         * 只给一个来源时微信不再弹"拍照 / 从相册选择"的选择器。
         */
        sourceType: ['album'],
        success: resolve,
        fail: reject,
      });
    });
    filePath = chosen?.tempFilePaths?.[0] || '';
  } catch {
    // 顾客取消选择：静默返回
    return;
  }

  if (!filePath) return;

  attachmentUploading.value = true;
  uni.showLoading({ title: '上传中…' });

  try {
    const uploaded = await dogApi.uploadHealthAttachment('allergy', filePath);
    const url = String(uploaded?.url || '').trim();
    if (!url) {
      throw new Error('上传失败，请重试');
    }

    formData.value.attachmentUrls = [...formData.value.attachmentUrls, url];
    uni.showToast({ title: '已上传', icon: 'none' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '上传失败，请重试', icon: 'none' });
  } finally {
    attachmentUploading.value = false;
    uni.hideLoading();
  }
};

const removeAttachment = (index: number) => {
  formData.value.attachmentUrls.splice(index, 1);
};

/** 预览：只可能是图片（选择通道就是相册/拍照），所以直接用 previewImage */
const previewAttachment = (url: string) => {
  if (!url) return;
  uni.previewImage({ urls: [url] });
};

const addAllergen = () => {
  uni.showModal({
    title: '添加过敏原',
    editable: true,
    placeholderText: '请输入过敏原',
    success: (res) => {
      if (res.confirm && res.content) {
        // 手输的这一条档案里还没有，直接选中它；已有则不动（不能点一下就删掉）
        addAllergenByName(res.content);
      }
    },
  });
};

/**
 * 常见过敏原标签（2026-10-04 第六期统一）。
 *
 * 与「健康管理 → 过敏」的「一点即选」同一份清单、同一个口径。
 * 改造前定制页只能手打 —— 顾客在档案里点过的过敏原，
 * 到这里得重新回忆、重新拼写一遍。
 */
const commonAllergens = ref<string[]>([
  '鸡肉', '牛肉', '羊肉', '猪肉', '鸭肉', '鱼肉',
  '鸡蛋', '牛奶', '小麦', '玉米', '大豆', '虾',
]);

/** 标签清单优先用后端词表（后台可维护、按循证常见度排），失败就用上面的兜底 */
onMounted(async () => {
  try {
    const res: any = await dogApi.commonAllergens();
    if (res?.code !== 0) return;
    const list = Array.isArray(res?.data?.allergens) ? res.data.allergens : [];
    const names = list
      .map((item: any) => String(item?.name || '').trim())
      .filter(Boolean);
    if (names.length > 0) {
      commonAllergens.value = names;
    }
  } catch {
    // 读不到词表不是错误 —— 用兜底清单继续
  }
});

/** 记一条过敏原（去重，不制造重复项） */
const addAllergenByName = (name: string) => {
  const value = String(name || '').trim();
  if (!value) return;
  if (formData.value.allergies.includes(value)) {
    uni.showToast({ title: '已经加过这一条了', icon: 'none' });
    return;
  }
  formData.value.allergies.push(value);
};

/**
 * 点一下标签 = 选中，再点一下 = 取消（2026-10-04 老板要求）。
 *
 * 改前只能"加"：点错了得跑到下面的过敏列表里找到那一条再点「删除」，
 * 同一个标签要管两处。现在标签自己就是开关，判定与显示用同一个
 * isAllergenAdded，不会出现"看着是选中、实际没选中"。
 */
const toggleAllergenByName = (name: string) => {
  const value = String(name || '').trim();
  if (!value) return;

  const index = formData.value.allergies.indexOf(value);
  if (index >= 0) {
    formData.value.allergies.splice(index, 1);
    return;
  }
  formData.value.allergies.push(value);
};

const isAllergenAdded = (name: string) =>
  formData.value.allergies.includes(String(name || '').trim());

/**
 * 下方列表只列**手动录入**的过敏原（快选标签里没有的那些）。
 *
 * 2026-10-05 老板要求：快选选中的不在下方重复展示（标签自己就是状态）。
 * 但手动录入的（特别是 AI 从报告里读出来的）没有标签可点，
 * 必须留一个能看到、能删的地方，否则加错了没法撤销。
 */
const customAllergens = computed(() =>
  formData.value.allergies.filter(
    (item) => !commonAllergens.value.includes(String(item || '').trim()),
  ),
);

/** 删掉一条手动录入的过敏原（按值删，位置由 customAllergens 决定） */
const removeCustomAllergen = (allergen: string) => {
  const index = formData.value.allergies.indexOf(allergen);
  if (index >= 0) formData.value.allergies.splice(index, 1);
};

/**
 * 过敏原检测报告（2026-10-04 从健康管理搬来）。
 *
 * 报告是独立实体：检测日期 / 方式 / 原件 / 识别原文。
 * 这里只做"翻得出来" —— 原件挂在报告上，家长随时点开看。
 */
const allergyReports = ref<Array<Record<string, any>>>([]);

async function loadAllergyReports(dogId: string) {
  if (!dogId) {
    allergyReports.value = [];
    return;
  }
  try {
    const res: any = await dogApi.allergyReports.list(dogId);
    if (res?.code !== 0) return;
    allergyReports.value = Array.isArray(res?.data?.reports) ? res.data.reports : [];
  } catch {
    // 报告读不到不能挡住下单 —— 过敏信息与其余步骤都还能用
    allergyReports.value = [];
  }
}

/** 扫描确认后的过敏原并进这一单（去重，已记的跳过） */
function onAllergensScanned(payload: { allergens?: string[] }) {
  const list = Array.isArray(payload?.allergens) ? payload.allergens : [];
  let added = 0;
  for (const name of list) {
    const value = String(name || '').trim();
    if (!value || formData.value.allergies.includes(value)) continue;
    formData.value.allergies.push(value);
    added += 1;
  }
  uni.showToast({
    title: added > 0 ? `已加入 ${added} 项过敏原` : '这几项档案里已经有了',
    icon: 'none',
  });
  // 报告存好了，列表刷新一下（"已上传的检测报告"要立刻看得到）
  void loadAllergyReports(formData.value.dogId);
}

const ALLERGY_TEST_METHOD_LABELS: Record<string, string> = {
  SERUM: '血清检测',
  INTRADERMAL: '皮内试验',
  ELIMINATION: '排除性饮食',
  OTHER: '其它方式',
  UNKNOWN: '检测方式未记录',
};

function reportTestMethodLabel(value: unknown) {
  return ALLERGY_TEST_METHOD_LABELS[String(value || 'UNKNOWN').toUpperCase()] || '检测方式未记录';
}

/** 点开报告：预览原件（多页时一起给，可左右翻） */
function previewAllergyReport(report: Record<string, any>) {
  const urls = (Array.isArray(report?.attachments) ? report.attachments : [])
    .map((item: unknown) => String(item || '').trim())
    .filter(Boolean);
  if (urls.length === 0) {
    uni.showToast({ title: '这份报告没有留存原件', icon: 'none' });
    return;
  }
  uni.previewImage({ urls, current: urls[0] });
}


const addPreferredIngredient = () => {
  uni.showModal({
    title: '添加喜欢的食材',
    editable: true,
    placeholderText: '请输入食材名称',
    success: (res) => {
      if (res.confirm && res.content) {
        formData.value.preferredIngredients.push(res.content);
      }
    },
  });
};

const removePreferredIngredient = (index: number) => {
  formData.value.preferredIngredients.splice(index, 1);
};

const addDislikedIngredient = () => {
  uni.showModal({
    title: '添加不吃的食材',
    editable: true,
    placeholderText: '请输入食材名称',
    success: (res) => {
      if (res.confirm && res.content) {
        formData.value.dislikedIngredients.push(res.content);
      }
    },
  });
};

const removeDislikedIngredient = (index: number) => {
  formData.value.dislikedIngredients.splice(index, 1);
};

const submitOrder = async () => {
  if (!canSubmit.value) {
    // 提示要说清"还差什么"，不然按钮灰着顾客不知道原因
    let title = '请选择要定制的狗狗';
    if (needLogin.value) {
      // 未登录时提示"请选择狗狗和定制目标"是误导：顾客根本没得选
      title = '请先登录';
    } else if (gateBlocked.value) {
      title = '请先确认上面的体况评分、活动量与每日餐数';
    }

    uni.showToast({ title, icon: 'none' });
    return;
  }

  /**
   * 防重复提交（2026-10-04 修复）。
   *
   * 这单是付费单，重复提交会生成两张待付款订单。
   * 关键点是 submitting **必须在任何 await 之前置位**：原先它放在
   * `await requestCustomRecipeOrderSubscription()` **之后**，而订阅授权会弹微信
   * 系统弹窗，顾客等得不耐烦时再点一次，两次都会越过那道判断各下一单。
   * 按钮的 :disabled 也一起带上 submitting，双击在界面层就被挡住。
   */
  if (submitting.value) return;
  submitting.value = true;

  try {
    /**
     * 申请订阅消息（2026-09-28）。
     *
     * 微信的一次性订阅消息必须由用户点击触发申请，所以放在"点提交"这一刻；
     * 这次订阅用于「已交付」那条通知（付款那条在点「立即付款」时另申请一次，
     * 因为订阅一次只能下发一条）。
     * 它自己吞掉所有失败，不会挡住下单。
     */
    await requestCustomRecipeOrderSubscription();

    uni.showLoading({ title: '提交中...' });

    /**
     * 提交载荷。
     *
     * 2026-09-28 修复：原先勾了「需要健康管理」会把 targetGoal **改写成
     * HEALTH_SUPPORT**，于是「减重 + 需要健康管理」这种组合会把减重目标丢掉。
     * 现在定制页上已经没有这个勾选框，两者彻底分开传：
     *   · targetGoal            —— 系统按「计划 > 体况」定的方向（顾客不选）
     *   · needsHealthManagement —— 按"这一单有没有填过敏"推导
     *   · syncToHealthProfile   —— 恒为 true（老板 2026-10-04：过敏一定要存档；
     *                              后端只增不删，不会动档案里已有的记录）
     *
     * 载荷里**不含 scheduledDate**：排期由后端自动定，前端不传日期（2026-10-04）。
     */
    const submitData = {
      ...formData.value,
      syncToHealthProfile: true,
      needsHealthManagement: formData.value.allergies.length > 0,
    };

    // 统一走 request()：只有 code === 0 才会 resolve，
    // 非 0 会 reject 并带上服务端 message，不会再出现"下单成功却提示网络错误"。
    const res: any = await request({
      url: '/custom-recipe/orders',
      method: 'POST',
      data: submitData,
    });

    uni.hideLoading();

    const orderId = res?.data?.orderId;
    if (!orderId) {
      throw new Error('服务端未返回订单号');
    }

    const query = [
      `orderId=${encodeURIComponent(orderId)}`,
      `amount=${encodeURIComponent(String(res.data.amount ?? ''))}`,
      `creditAmount=${encodeURIComponent(String(res.data.creditAmount ?? ''))}`,
    ];
    /**
     * 用 redirectTo 而不是 navigateTo（2026-10-04）。
     *
     * 下单已经成功，这一页的表单就必须作废：navigateTo 会把定制页留在栈里，
     * 顾客返回一次就又能点一次提交，等于白白多出一张待付款单。
     * redirectTo 用成功页替换掉本页，返回键回到首页，表单不可能被重复提交。
     */
    uni.redirectTo({
      url: `/pages/custom-recipe/success?${query.join('&')}`,
    });
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({
      title: error?.message || '提交失败，请稍后重试',
      icon: 'none',
    });
  } finally {
    // 失败要复位，否则顾客改完内容再也提交不了
    submitting.value = false;
  }
};

// 辅助函数
const getDogLifeStageLabel = (dog: any) => {
  if (!dog.birthday) return '未知';

  const birthday = new Date(dog.birthday);
  const now = new Date();
  const months = (now.getFullYear() - birthday.getFullYear()) * 12 +
                 (now.getMonth() - birthday.getMonth());

  if (months < 12) {
    return '幼犬期';
  } else if (months < 84) { // 7年
    return '成犬期';
  } else {
    return '老年期';
  }
};

const getBCSText = (bcsScore: number) => {
  if (!bcsScore) return '未评估';

  if (bcsScore <= 3) {
    return `${bcsScore}/9 偏瘦`;
  } else if (bcsScore >= 6) {
    return `${bcsScore}/9 偏胖`;
  } else {
    return `${bcsScore}/9 标准`;
  }
};

const getActivityLabel = (level: string) => {
  // 2026-09-27 修复：原先只映射了 LOW/NORMAL/HIGH，
  // 而生产里还有 RESTING（静养，245 只）与 WORKING（工作犬，4 只）——
  // 这两档的顾客会在这里看到英文 "RESTING" / "WORKING"，完全看不懂。
  // 文案与建档页保持一致，避免同一个概念两个页面两种说法。
  const map: Record<string, string> = {
    RESTING: '休息静养',
    LOW: '城市日常',
    NORMAL: '规律运动',
    HIGH: '高活动',
    WORKING: '工作犬',
  };
  return map[level] || '未评估';
};
</script>

<style scoped>
/* ==========================================================
   食谱定制 · 提交需求
   视觉规范对齐新版设计（深墨绿 + 金 + 米绿底），
   色值统一取 App.vue 的 --sk-* 变量，不再使用旧版橙红。
   ========================================================== */

.custom-recipe-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 200rpx;
  background: var(--sk-bg, #f0f3e9);
}

/* ---------- 顶部 Banner（身份块 + 选狗） ---------- */
/* 与健康管理页 hero-card 同一套视觉，但名字下面只放一行「品种 · 月龄 · 体重」 */
.hero-card {
  padding: 32rpx;
  margin-bottom: 24rpx;
  border-radius: var(--sk-radius-card, 28rpx);
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

.hero-card__identity {
  display: block;
}

/* 生命阶段 / 体况评分 / 活动量：深色 Banner 里横排三格（2026-10-05 从信息卡挪来） */
.hero-card__facts {
  display: flex;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(243, 237, 221, 0.18);
}

.hero-card__fact {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.hero-card__fact-label {
  font-size: 22rpx;
  color: rgba(243, 237, 221, 0.62);
}

.hero-card__fact-value {
  font-size: 26rpx;
  color: #f3eddd;
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
  /* 名字过长时省略，不要把右边的"切换"挤没了 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-card__line {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: rgba(243, 237, 221, 0.78);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-card__switch {
  display: inline-block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.5);
}


/* ---------- 区块 ---------- */
.section {
  padding: 28rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 24rpx;
}

.step-number {
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  background: linear-gradient(135deg, #d8bc85 0%, #b08d4f 100%);
  color: #1e3a2f;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 700;
  flex-shrink: 0;
}

.title-text {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
  letter-spacing: 2rpx;
}

/* "未登录"与"无档案"是两种空态，共用一套视觉，避免两处样式各自漂移 */
/* 定制门槛补确认卡片 */
.gate-card {
  margin-top: 20rpx;
  padding: 26rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
  border-radius: var(--sk-radius-card, 28rpx);
}

.gate-card__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.gate-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: #8a6f3d;
}

.gate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 12rpx;
}

.gate-row__label {
  flex: 0 0 auto;
  font-size: 26rpx;
  color: #6b6653;
}

.gate-row__value {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.gate-row__hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #8a6f3d;
}
/* 体况评分（阶段 C6）：未确认时就地做 4 个动作题，不再让顾客估分数 */
.gate-bcs {
  margin-top: 20rpx;
  padding: 2rpx 20rpx 20rpx;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 12rpx;
}
.gate-bcs .gate-row {
  margin-top: 16rpx;
  padding: 16rpx 0 0;
  background: transparent;
  border: none;
}
.gate-row__value--done {
  color: #1a7f37;
}
/* 长毛犬 / 特殊犬种提示 —— 与建档页同一套文案 */
/* 4 个动作题 —— 与建档页同一套交互，配色贴合定制页的暖色调 */
.bcs-question {
  margin-top: 22rpx;
}
.bcs-banner {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #46564d;
  line-height: 1.6;
}

.bcs-question__image {
  display: block;
  width: 100%;
  margin-bottom: 16rpx;
  border-radius: 16rpx;
}

.bcs-question__title {
  display: block;
  font-size: 27rpx;
  color: #26261f;
  font-weight: 700;
  line-height: 1.5;
}

.bcs-question__options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}
.bcs-question__option {
  padding: 14rpx 22rpx;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
  font-size: 25rpx;
  color: #46564d;
  background: #ffffff;
}
.bcs-question__option.active {
  border-color: #1e3a2f;
  background-color: #eef4ea;
  color: #1e3a2f;
  font-weight: 700;
}

.gate-confirm-btn {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border-radius: 999rpx;
}

.gate-confirm-btn::after {
  border: none;
}

.gate-confirm-btn[disabled] {
  opacity: 0.6;
}

.no-dog-hint,
.login-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 40rpx 26rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.no-dog-hint-title,
.login-hint-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.no-dog-hint-desc,
.login-hint-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
  text-align: center;
}

.no-dog-hint-btn,
.login-hint-btn {
  margin-top: 10rpx;
  padding: 0 44rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.no-dog-hint-btn::after,
.login-hint-btn::after {
  border: none;
}

.dog-info-card {
  margin-top: 20rpx;
  padding: 22rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.info-row {
  display: flex;
  margin-bottom: 12rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  width: 160rpx;
  color: var(--sk-ink-2, #6b6653);
}

.value {
  flex: 1;
  color: var(--sk-ink, #26261f);
}

/* ---------- 定制目标 ---------- */
.goal-group {
  margin-bottom: 30rpx;
}


/* 方向由系统定，页面上只展示结论 + 一个去计划页的按钮 */
.plan-entry-btn {
  margin-top: 20rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border-radius: 999rpx;
}

.plan-entry-btn::after {
  border: none;
}

/* ===== 体况建议 ===== */
.advice-line {
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.advice-line__text {
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

/* ===== 选中目标后的具体数字（老板问题 1） ===== */




/* ===== 从档案带出的说明 ===== */
.health-prefill-hint,
.preference-prefill-hint {
  display: block;
  margin-bottom: 16rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* ===== 备注（可选） ===== */

/* ===== 附件（可选） ===== */
.attachment-section {
  margin-top: 24rpx;
}

.attachment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}


.attachment-add {
  font-size: 25rpx;
  color: #b08d4f;
}

/* 传满时的占位文案：比让按钮消失更好，顾客知道"是满了"而不是"坏了" */
.attachment-limit {
  flex: 0 0 auto;
  font-size: 24rpx;
  color: var(--sk-ink-3, #968f6d);
}

.attachment-hint {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: var(--sk-ink-3, #968f6d);
}

.attachment-list {
  margin-top: 14rpx;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 20rpx;
  margin-top: 10rpx;
  border-radius: 14rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.attachment-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 25rpx;
  color: #26261f;
}

.attachment-preview,
.attachment-remove {
  flex: 0 0 auto;
  font-size: 24rpx;
}

.attachment-preview {
  color: #1e3a2f;
}

.attachment-remove {
  color: #b08d4f;
}

.attachment-empty {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: #968f6d;
}

.health-item {
  margin-bottom: 22rpx;
}

.health-item:last-child {
  margin-bottom: 0;
}

.health-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.health-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--sk-ink, #26261f);
}

.add-btn {
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: var(--sk-gold, #b08d4f);
  background: transparent;
  border: 1rpx solid var(--sk-gold, #b08d4f);
  border-radius: 999rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.tag-item {
  display: flex;
  align-items: center;
  padding: 12rpx 22rpx;
  font-size: 26rpx;
  color: var(--sk-primary, #1e3a2f);
  background: #ffffff;
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: 999rpx;
}

/* 常见过敏原一点即选（2026-10-04 第六期统一） */
/* 已上传的检测报告（2026-10-04 从健康管理搬来） */
.allergy-reports {
  margin-top: 16rpx;
  padding-top: 14rpx;
  border-top: 1rpx dashed #e6e1d7;
}

.allergy-reports__title {
  display: block;
  font-size: 24rpx;
  color: #8a7a63;
}

.allergy-reports__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
  padding: 16rpx 18rpx;
  border-radius: 14rpx;
  background: #faf8f4;
}

.allergy-reports__name {
  font-size: 24rpx;
  color: #4a4235;
}

.allergy-reports__action {
  flex: none;
  font-size: 24rpx;
  color: #8a6b3f;
}

.allergen-quick-add {
  margin-bottom: 16rpx;
}
.allergen-quick-tag {
  background: var(--sk-primary-tint, #eef3ea);
}
.allergen-quick-tag--added {
  color: #ffffff;
  background: var(--sk-primary, #1e3a2f);
  border-color: var(--sk-primary, #1e3a2f);
}
.tag-item.editable {
  background: var(--sk-gold-soft, #f6efe0);
  border-color: rgba(176, 141, 79, 0.35);
}

.remove-btn {
  margin-left: 12rpx;
  font-size: 24rpx;
  color: var(--sk-ink-3, #968f6d);
}

.empty-text {
  font-size: 26rpx;
  color: var(--sk-ink-3, #968f6d);
}

.add-btn {
  display: inline-block;
}

.notes-input {
  width: 100%;
  min-height: 150rpx;
  margin-top: 20rpx;
  padding: 22rpx;
  font-size: 28rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
  box-sizing: border-box;
}

/* ---------- 饮食偏好 ---------- */
.preference-section {
  margin-bottom: 24rpx;
}

.preference-title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  color: var(--sk-ink-2, #6b6653);
}

/* ---------- 交付与抵扣 ---------- */








/* ---------- 待付款单提醒（首页顶部） ---------- */
.pending-banner {
  padding: 26rpx 28rpx;
  margin-bottom: 24rpx;
  background: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.55);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(176, 141, 79, 0.16);
}

.pending-banner__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.pending-banner__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #8a6d2f;
}

.pending-banner__time {
  flex: 0 0 auto;
  font-size: 26rpx;
  font-weight: 700;
  color: #b03a2e;
}

.pending-banner__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
}

.pending-banner__actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.pending-banner__btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: var(--sk-ink-2, #6b6653);
  background: transparent;
  border: 1rpx solid rgba(176, 141, 79, 0.6);
  border-radius: 999rpx;
}

.pending-banner__btn.primary {
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
}

/* ---------- 底部提交 ---------- */
.submit-section {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--sk-surface, #fbfcf7);
  border-top: 1rpx solid var(--sk-line, #e3e6d4);
  box-shadow: 0 -2rpx 16rpx rgba(30, 46, 36, 0.06);
}

.submit-btn {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
  letter-spacing: 1rpx;
}

.submit-btn[disabled] {
  color: #cfd4c8;
  background: #d8dccf;
  border-color: #d8dccf;
}

/* 时限说明放在按钮下方：顾客读完"下一步要付钱"立刻知道还剩多久 */
.submit-note {
  display: block;
  margin-top: 12rpx;
  text-align: center;
  font-size: 23rpx;
  line-height: 1.5;
  color: var(--sk-ink-3, #968f6d);
}

/* ===== 体重管理计划横幅（阶段 D1）===== */
.plan-banner {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #eef4ea;
  border: 1rpx solid #d8e3cf;
}

.plan-banner__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.plan-banner__title {
  font-size: 27rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.plan-banner__badge {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 600;
  background: #ffffff;
  color: #1e3a2f;
}

.plan-banner__rows {
  margin-top: 12rpx;
}

.plan-banner__row {
  display: block;
  font-size: 24rpx;
  line-height: 1.7;
  color: #46564d;
}

.plan-banner__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #6b7a70;
}
</style>
