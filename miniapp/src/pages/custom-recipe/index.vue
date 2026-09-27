<template>
  <view class="custom-recipe-page">
    <!-- 顶部标题 -->
    <view class="page-header">
      <text class="page-title">专属食谱定制</text>
      <text class="page-subtitle">告诉我们它的情况，我们来单独设计一道</text>
    </view>

    <!-- 第一步：选择狗狗 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">1</text>
        <text class="title-text">选择狗狗</text>
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

      <picker v-else-if="dogOptions.length > 0" mode="selector" :range="dogOptions" range-key="label" @change="onDogChange">
        <view class="picker-input">
          <text v-if="selectedDog" class="selected-text">{{selectedDogLabel}}</text>
          <text v-else class="placeholder">请选择要定制的狗狗</text>
          <text class="arrow">›</text>
        </view>
      </picker>

      <!-- 无档案时的引导：原先只弹一句 toast，页面上没有任何建档入口，提交按钮永久不可用 -->
      <view v-else class="no-dog-hint">
        <text class="no-dog-hint-title">还没有狗狗档案</text>
        <text class="no-dog-hint-desc">专属食谱需要先有狗狗档案，我们才能按它的体重和身体状况来定制。</text>
        <button class="no-dog-hint-btn" @tap="goToCreateDog">创建狗狗档案</button>
      </view>

      <!-- 定制门槛：这几项必须由顾客亲自确认过。
           老档案不追溯，因此在这里就地补确认 —— 只在"真的要用到"的时候问。 -->
      <view v-if="gateBlocked" class="gate-card">
        <text class="gate-card__title">开始定制前，请确认这几项</text>
        <text class="gate-card__desc">
          体况评分、活动量、每日餐数原先可能是系统按默认值填的，
          需要你确认一下 —— 它们决定食谱的用量与制作单。
        </text>

        <view class="gate-row">
          <text class="gate-row__label">体况评分</text>
          <picker
            mode="selector"
            :range="gateBcsOptions.map(item => item.label)"
            :value="gateBcsIndex"
            @change="onGateBcsChange"
          >
            <view class="gate-row__value">{{ gateBcsOptions[gateBcsIndex]?.label || '请选择' }}</view>
          </picker>
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
          :disabled="gateSaving"
          @tap="confirmGate"
        >{{ gateSaving ? '保存中…' : '确认并继续' }}</button>
      </view>

      <!-- 狗狗基本信息 -->
      <view v-if="selectedDog" class="dog-info-card">
        <view class="info-row">
          <text class="label">品种：</text>
          <text class="value">{{selectedDog.breedName || '未知品种'}}</text>
        </view>
        <view class="info-row">
          <text class="label">生命阶段：</text>
          <text class="value">{{getDogLifeStageLabel(selectedDog)}}</text>
        </view>
        <view class="info-row">
          <text class="label">当前体重：</text>
          <text class="value">{{selectedDog.currentWeightKg}}kg</text>
        </view>
        <view class="info-row">
          <text class="label">体况评分：</text>
          <text class="value">{{getBCSText(selectedDog.bcsScore)}}</text>
        </view>
        <view class="info-row">
          <text class="label">活动量：</text>
          <text class="value">{{getActivityLabel(selectedDog.activityLevel)}}</text>
        </view>
      </view>
    </view>

    <!-- 第二步：定制目标 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">2</text>
        <text class="title-text">定制目标</text>
      </view>

      <!-- 体重管理 -->
      <view class="goal-group">
        <text class="group-title">体重管理</text>

        <!-- 体况只作为**建议**：老板口径是"减重/维持/增重由顾客自己选，系统不替他决定" -->
        <view v-if="bcsAdviceText" class="advice-line">
          <text class="advice-line__text">{{ bcsAdviceText }}</text>
        </view>

        <view class="radio-group">
          <view
            v-for="option in weightManagementOptions"
            :key="option.value"
            class="radio-item"
            :class="{ active: formData.targetGoal === option.value }"
            @tap="selectWeightGoal(option.value)"
          >
            <view class="radio-icon">
              <text v-if="formData.targetGoal === option.value">●</text>
              <text v-else>○</text>
            </view>
            <text class="radio-label">{{option.label}}</text>
          </view>
        </view>

        <!-- 选中目标后立刻把"具体是多少"讲出来（老板问题 1） -->
        <view v-if="goalTargetSummary" class="target-line">
          <text class="target-line__title">{{ goalTargetSummary.title }}</text>
          <text class="target-line__detail">{{ goalTargetSummary.detail }}</text>
          <text v-if="goalTargetSummary.note" class="target-line__note">{{ goalTargetSummary.note }}</text>
        </view>
      </view>

      <!-- 健康管理 -->
      <view class="goal-group">
        <text class="group-title">健康管理</text>
        <view class="checkbox-wrapper">
          <view class="checkbox-item" @tap="toggleHealthManagement">
            <view class="checkbox-icon" :class="{ checked: formData.enableHealthManagement }">
              <text v-if="formData.enableHealthManagement">✓</text>
            </view>
            <text class="checkbox-label">需要健康管理</text>
          </view>
        </view>

        <!-- 健康档案编辑区域 -->
        <view v-if="formData.enableHealthManagement" class="health-management-section">
          <text v-if="healthPrefillHint" class="health-prefill-hint">{{ healthPrefillHint }}</text>

          <!-- 疾病史 -->
          <view class="health-item">
            <view class="health-header">
              <text class="health-title">疾病史</text>
              <text class="add-btn" @tap="addCondition">+ 添加</text>
            </view>
            <view class="tag-list">
              <view
                v-for="(condition, index) in formData.medicalConditions"
                :key="index"
                class="tag-item editable"
              >
                <text>{{condition}}</text>
                <text class="remove-btn" @tap.stop="removeCondition(index)">删除</text>
              </view>
              <text v-if="formData.medicalConditions.length === 0" class="empty-text">暂无疾病史</text>
            </view>
          </view>

          <!-- 过敏信息 -->
          <view class="health-item">
            <view class="health-header">
              <text class="health-title">过敏信息</text>
              <text class="add-btn" @tap="addAllergen">+ 添加</text>
            </view>
            <view class="tag-list">
              <view
                v-for="(allergen, index) in formData.allergies"
                :key="index"
                class="tag-item editable"
              >
                <text>{{allergen}}</text>
                <text class="remove-btn" @tap.stop="removeAllergen(index)">删除</text>
              </view>
              <text v-if="formData.allergies.length === 0" class="empty-text">暂无过敏信息</text>
            </view>
          </view>

          <!-- 只读参考：档案里的体检 / 体重 / 疫苗，营养师也会看这些 -->
          <view v-if="healthReferenceRows.length > 0" class="health-reference">
            <text class="health-reference__title">档案里已有的记录（供参考，不会改动）</text>
            <view
              v-for="row in healthReferenceRows"
              :key="row.label"
              class="health-reference__row"
            >
              <text class="health-reference__label">{{ row.label }}</text>
              <text class="health-reference__value">{{ row.value }}</text>
            </view>
          </view>

          <!-- 决策 6：顾客在定制页删掉某项时只影响本单，不删档案 -->
          <text class="health-keep-note">
            这里的增删只影响**本次定制**，不会删除你档案里已有的记录。
          </text>
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
        <text class="preference-title">喜欢的食材（可选）</text>
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
        <text class="preference-title">不吃的食材（可选）</text>
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
      <text class="notes-hint">营养师会看到这段说明，但它不会改变价格或热量计算。</text>
      <textarea
        v-model="formData.additionalNotes"
        class="notes-input"
        placeholder="例如：它最近在换粮、吃某种药、不爱嚼硬的，或你有其它想让营养师知道的"
        maxlength="500"
      />

      <!-- 附件（可选）：检测报告、化验单、照片等 -->
      <view class="attachment-section">
        <view class="attachment-header">
          <text class="attachment-title">上传资料（可选）</text>
          <text class="attachment-add" @tap="pickAttachment">
            {{ attachmentUploading ? '上传中…' : '+ 上传图片或 PDF' }}
          </text>
        </view>
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
        <text v-else class="attachment-empty">还没有上传资料</text>
      </view>
    </view>

    <!-- 交付与费用说明
         改造点：原来这里显示的是一个**本地硬算的假日期**（提交前并不知道真实交付日），
         现在改为按后台配置的"交付工作日数"说明口径，真实交付日以订单为准。 -->
    <view class="section delivery-section">
      <view class="delivery-info">
        <text class="delivery-label">预计交付：</text>
        <text class="delivery-date">{{ deliveryHint }}</text>
      </view>
      <text class="delivery-note">我们会根据排期计算并告知您具体的交付时间</text>
      <view v-if="creditHint" class="credit-info">
        <text class="credit-label">成品抵扣</text>
        <text class="credit-value">{{ creditHint }}</text>
      </view>
    </view>

    <!-- 知情同意（老板拍板的决策 9：提交前必须明确同意把信息记入健康档案） -->
    <view v-if="willWriteBackToProfile" class="consent-section">
      <view class="consent-item" @tap="toggleConsent">
        <view class="consent-icon" :class="{ checked: formData.healthInfoConsent }">
          <text v-if="formData.healthInfoConsent">✓</text>
        </view>
        <text class="consent-text">
          我同意把本次填写的过敏、疾病信息记入狗狗的健康档案
        </text>
      </view>
      <text class="consent-note">
        同意后我们才会写入。写入是**只增不删**的：不会删除你档案里已有的记录。
      </text>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-section">
      <button class="submit-btn" @tap="submitOrder" :disabled="!canSubmit">
        提交定制订单 {{ feeLabel }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getToken, request } from '@/utils/api';
import { dogApi } from '@/api/dogs';
import { navigateToDogCreate } from '@/utils/dog-profile-entry';

// 状态定义
const dogOptions = ref<any[]>([]);
const selectedDog = ref<any>(null);

/**
 * 选择器里显示的「狗名 - 品种」。
 *
 * 必须**每次渲染都重新拼**，不能用 dogOptions 里那份拼好的 label：
 * 2026-09-28 真实缺陷 —— 确认定制门槛后会把 PUT 响应合并进 selectedDog，
 * 那份响应当时漏了 breedName，于是品种行变成"未知品种"，
 * 而选择器用的是早先拼好的字符串、还显示着正确品种，同一屏自相矛盾。
 * 派生出来的文字不可能和品种行不一致。
 */
const selectedDogLabel = computed(() => {
  if (!selectedDog.value) return '';
  return `${selectedDog.value.name || ''} - ${selectedDog.value.breedName || '未知品种'}`;
});
const submitting = ref(false);
/** 未登录标记：与"已登录但还没有狗狗档案"是两个不同的状态，提示语和下一步动作都不一样 */
const needLogin = ref(false);

/**
 * 今天的日期（本地时区，YYYY-MM-DD）。
 *
 * 2026-09-28 修复：这里原先用 `new Date().toISOString().split('T')[0]`，
 * 那是**UTC 日期**。北京时间凌晨 0 点到 8 点之间，UTC 还停在前一天，
 * 于是这个时段下的单，预约日期会写成昨天（交付日期也跟着早一天）。
 */
function getTodayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const formData = ref({
  dogId: '',
  targetGoal: '',
  enableHealthManagement: false,
  allergies: [] as string[],
  medicalConditions: [] as string[],
  preferredIngredients: [] as string[],
  dislikedIngredients: [] as string[],
  additionalNotes: '',
  attachmentUrls: [] as string[],
  scheduledDate: getTodayDateString(),
  // 写回健康档案：默认开，但必须顾客明确同意才提交（决策 9）
  syncToHealthProfile: true,
  healthInfoConsent: false,
});

/**
 * 档案已有信息（老板拍板的决策 3：定制页是档案的第二个填写入口）。
 *
 * 后端早就有一个汇总接口（过敏/疾病/最近体检/体重趋势），2026-09-28 又补上了
 * 疫苗与口味偏好 —— 但前端此前**从未调用过**，所以顾客每次都要从零手打。
 */
const healthSummary = ref<any>(null);
const healthSummaryLoading = ref(false);

/** 是否真的会写回档案：只有勾了健康管理才有东西可写 */
const willWriteBackToProfile = computed(
  () => formData.value.enableHealthManagement,
);

/** 附件上传中 */
const attachmentUploading = ref(false);

const weightManagementOptions = [
  { value: 'LOSE_WEIGHT', label: '减重' },
  { value: 'MAINTAIN', label: '维持' },
  { value: 'GAIN_WEIGHT', label: '增重' },
];

// 后台「食谱定制设置」的公开部分（定制费 / 可抵扣金额 / 交付工作日数）
const recipeConfig = ref<{
  feeAmount: number;
  creditAmount: number;
  deliveryWorkDays: number;
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
const gateDraft = ref({ bcsScore: 5, activityLevel: 'LOW', mealsPerDay: '2' });
const gateSaving = ref(false);

const gateBcsOptions = [
  { value: 1, label: '1 分 · 很瘦' },
  { value: 2, label: '2 分 · 偏瘦' },
  { value: 3, label: '3 分 · 略瘦' },
  { value: 4, label: '4 分 · 理想偏瘦' },
  { value: 5, label: '5 分 · 理想' },
  { value: 6, label: '6 分 · 略胖' },
  { value: 7, label: '7 分 · 偏胖' },
  { value: 8, label: '8 分 · 肥胖' },
  { value: 9, label: '9 分 · 严重肥胖' },
];
const gateActivityOptions = [
  { value: 'RESTING', label: '休息静养' },
  { value: 'LOW', label: '城市日常（多数城市犬）' },
  { value: 'NORMAL', label: '规律运动' },
  { value: 'HIGH', label: '高活动' },
  { value: 'WORKING', label: '工作犬' },
];
const gateMealOptions = ['1', '2', '3', '4', '5'];

const gateBcsIndex = computed(() =>
  Math.max(0, gateBcsOptions.findIndex((item) => item.value === gateDraft.value.bcsScore)),
);
const gateActivityIndex = computed(() =>
  Math.max(0, gateActivityOptions.findIndex((item) => item.value === gateDraft.value.activityLevel)),
);
const gateMealIndex = computed(() =>
  Math.max(0, gateMealOptions.indexOf(gateDraft.value.mealsPerDay)),
);

function syncGateDraftFromDog(dog: any) {
  gateDraft.value = {
    bcsScore: Number(dog?.bcsScore) || 5,
    activityLevel: String(dog?.activityLevel || 'LOW'),
    mealsPerDay: String(dog?.mealsPerDay || '2'),
  };
}

function onGateBcsChange(event: any) {
  gateDraft.value.bcsScore = gateBcsOptions[event.detail.value]?.value ?? 5;
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
  gateSaving.value = true;

  try {
    uni.showLoading({ title: '保存中...' });
    const res: any = await request({
      url: `/dogs/${selectedDog.value.value}`,
      method: 'PUT',
      data: {
        bcsScore: gateDraft.value.bcsScore,
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
  // 决策 9：要写回健康档案就必须先明确同意
  if (willWriteBackToProfile.value && !formData.value.healthInfoConsent) return false;
  return true;
});

/** 体况评分 → 建议（**仅供参考**，老板口径：由顾客自己决定目标） */
const bcsAdviceText = computed(() => {
  const bcs = Number(selectedDog.value?.bcsScore);
  if (!Number.isFinite(bcs) || bcs <= 0) return '';

  if (bcs >= 6) {
    return `按它目前的体况评分 ${bcs}/9（偏胖），我们建议：减重。这只是建议，最终由你决定。`;
  }
  if (bcs <= 3) {
    return `按它目前的体况评分 ${bcs}/9（偏瘦），我们建议：增重。这只是建议，最终由你决定。`;
  }
  return `按它目前的体况评分 ${bcs}/9（理想），我们建议：维持。这只是建议，最终由你决定。`;
});

const GOAL_LABELS: Record<string, string> = {
  LOSE_WEIGHT: '减重',
  MAINTAIN: '维持',
  GAIN_WEIGHT: '增重',
};

/**
 * 选中目标后给出**具体的热量与克数**（老板问题 1）。
 *
 * 口径说明：这里显示的是系统当前的实际数值（已经包含按体况评分的自动调整），
 * 顾客选的目标作为"设计方向"交给营养师与 AI 去落实 —— 我们没有自己发明
 * "减重就乘 0.8"这类临床系数，那需要兽医营养口径来定。
 */
const goalTargetSummary = computed(() => {
  const goal = formData.value.targetGoal;
  if (!goal) return null;

  const label = GOAL_LABELS[goal] || '定制';
  const kcal = Number(selectedDog.value?.targetFoodKcal);
  const grams = Number(selectedDog.value?.dailyIntakeG);

  if (!Number.isFinite(kcal) || kcal <= 0) {
    return {
      title: `你的目标：${label}`,
      detail: '营养师会在设计时按这个方向调整配比与喂食量。',
      note: '',
    };
  }

  return {
    title: `你的目标：${label}`,
    detail: `按它目前的体况，每天需要约 ${Math.round(kcal)} kcal（约 ${Math.round(grams || 0)} 克）`,
    note: `营养师会按「${label}」方向调整配方与喂食量，最终以交付的定制食谱为准。`,
  };
});

/** 档案里已有的体检 / 体重 / 疫苗：只读参考，让顾客知道营养师看得到 */
const healthReferenceRows = computed(() => {
  const data = healthSummary.value;
  if (!data) return [] as Array<{ label: string; value: string }>;

  const rows: Array<{ label: string; value: string }> = [];

  const weightTrend = Array.isArray(data.weightTrend) ? data.weightTrend : [];
  if (weightTrend.length > 0) {
    const latest = weightTrend[0];
    rows.push({
      label: '最近体重',
      value: `${latest.weightKg}kg（${String(latest.recordDate || '').slice(0, 10)}）`,
    });
  }

  const checkups = Array.isArray(data.recentCheckups) ? data.recentCheckups : [];
  if (checkups.length > 0) {
    rows.push({
      label: '最近体检',
      value: `${String(checkups[0].checkupDate || '').slice(0, 10)}${
        checkups[0].findings ? ` · ${checkups[0].findings}` : ''
      }`,
    });
  }

  const vaccines = Array.isArray(data.vaccines) ? data.vaccines : [];
  if (vaccines.length > 0) {
    const latest = vaccines[0];
    rows.push({
      label: '最近疫苗',
      value: `${latest.vaccineName}（${String(latest.vaccinationDate || '').slice(0, 10)}）`,
    });
  }

  return rows;
});

/** 告诉顾客"这些是从档案带出来的"，而不是他们上次填的 */
const healthPrefillHint = computed(() => {
  if (healthSummaryLoading.value) return '正在读取档案里已有的过敏与疾病记录…';
  const data = healthSummary.value;
  if (!data) return '';

  const allergyCount = Array.isArray(data.allergies) ? data.allergies.length : 0;
  const conditionCount = Array.isArray(data.medicalConditions)
    ? data.medicalConditions.length
    : 0;

  if (allergyCount === 0 && conditionCount === 0) {
    return '档案里还没有过敏或疾病记录，可以在这里补充。';
  }

  return `已从档案带出 ${allergyCount} 项过敏、${conditionCount} 项疾病记录，你可以增删。`;
});

const preferencePrefillHint = computed(() => {
  const preferred = formData.value.preferredIngredients.length;
  const disliked = formData.value.dislikedIngredients.length;
  if (preferred === 0 && disliked === 0) return '';
  return '已从档案带出你上次填过的口味，可以直接修改。两项都可以留空。';
});

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const feeLabel = computed(() => {
  const fee = recipeConfig.value?.feeAmount;
  return fee && fee > 0 ? `¥${formatAmount(fee)}` : '';
});

/** 交付口径用"工作日"，真实交付日以订单为准（后端按排期与公众假期算） */
const deliveryHint = computed(() => {
  const days = recipeConfig.value?.deliveryWorkDays;
  return days && days > 0 ? `约 ${days} 个工作日内` : '按排期确认';
});

const creditHint = computed(() => {
  const config = recipeConfig.value;
  if (!config || config.creditAmount <= 0) return '';
  if (config.creditAmount >= config.feeAmount) {
    return `定制费可全额抵扣成品货款（¥${formatAmount(config.creditAmount)}）`;
  }
  return `其中 ¥${formatAmount(config.creditAmount)} 可抵扣成品货款`;
});

// 生命周期
onLoad(() => {
  loadDogs();
  loadRecipeConfig();
});

/**
 * 从建档页返回时本页不会重新挂载，之前 onLoad 只跑一次，
 * 导致用户自己建好档再回到本页，狗狗列表仍然是空的、提交按钮仍然点不动。
 */
onShow(() => {
  if (!dogOptions.value.length) {
    void loadDogs();
  }
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
    return;
  }

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
  }
};

const onDogChange = (e: any) => {
  const index = e.detail.value;
  selectedDog.value = dogOptions.value[index];
  formData.value.dogId = selectedDog.value.value;
  // 补确认的草稿值默认沿用档案现值，顾客可以直接确认或改动
  syncGateDraftFromDog(selectedDog.value);
  void loadDogArchiveInfo(selectedDog.value.value);
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
 */
const loadDogArchiveInfo = async (dogId: string) => {
  if (!dogId) return;

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

    const calc = detailRes?.data?.calcResult;
    if (calc) {
      selectedDog.value = {
        ...selectedDog.value,
        targetFoodKcal: calc.finalFoodKcal,
        dailyIntakeG: calc.dailyIntakeG,
      };
    }

    const data = res.data;
    healthSummary.value = data;

    formData.value.allergies = Array.isArray(data.allergies)
      ? [...data.allergies]
      : [];
    formData.value.medicalConditions = Array.isArray(data.medicalConditions)
      ? [...data.medicalConditions]
      : [];
    // 口味偏好：档案里的两个字段（2026-09-27 才在「健康管理」页有了入口）
    formData.value.preferredIngredients = splitFoodText(data.preferredFoods);
    formData.value.dislikedIngredients = splitFoodText(data.pickyFoods);
  } catch (error) {
    // 读不到档案不能挡住定制：留空让顾客自己填
    console.warn('[CustomRecipe] 读取档案信息失败:', error);
    healthSummary.value = null;
  } finally {
    healthSummaryLoading.value = false;
  }
};

/**
 * 上传资料（可选）。
 *
 * 复用健康附件的上传通道（图片/PDF 都能传），拿回来的是 COS 地址，
 * 直接放进订单的 attachmentUrls —— 营养师在后台订单详情里能看到。
 */
const pickAttachment = async () => {
  if (attachmentUploading.value) return;

  let filePath = '';
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
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

const previewAttachment = (url: string) => {
  if (!url) return;
  uni.previewImage({ urls: [url] });
};

const selectWeightGoal = (goal: string) => {
  formData.value.targetGoal = goal;
};

const toggleHealthManagement = () => {
  formData.value.enableHealthManagement = !formData.value.enableHealthManagement;
};

const toggleConsent = () => {
  formData.value.healthInfoConsent = !formData.value.healthInfoConsent;
};

const addCondition = () => {
  uni.showModal({
    title: '添加疾病',
    editable: true,
    placeholderText: '请输入疾病名称',
    success: (res) => {
      if (res.confirm && res.content) {
        formData.value.medicalConditions.push(res.content);
      }
    },
  });
};

const removeCondition = (index: number) => {
  formData.value.medicalConditions.splice(index, 1);
};

const addAllergen = () => {
  uni.showModal({
    title: '添加过敏原',
    editable: true,
    placeholderText: '请输入过敏原',
    success: (res) => {
      if (res.confirm && res.content) {
        formData.value.allergies.push(res.content);
      }
    },
  });
};

const removeAllergen = (index: number) => {
  formData.value.allergies.splice(index, 1);
};

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

/**
 * 申请"定制订单状态通知"的订阅授权。
 *
 * 失败不阻断下单：顾客拒收通知只影响收不收得到提醒，不影响订单本身。
 */
const requestOrderNotification = async () => {
  const templateId = String(recipeConfig.value?.orderNotifyTemplateId || '').trim();
  if (!templateId) return;

  try {
    await new Promise<void>((resolve) => {
      uni.requestSubscribeMessage({
        tmplIds: [templateId],
        success: () => resolve(),
        fail: () => resolve(),
        complete: () => resolve(),
      });
    });
  } catch {
    // 忽略：拿不到订阅授权不影响下单
  }
};

const submitOrder = async () => {
  if (!canSubmit.value) {
    // 提示要说清"还差什么"，不然按钮灰着顾客不知道原因
    let title = '请选择狗狗和定制目标';
    if (needLogin.value) {
      // 未登录时提示"请选择狗狗和定制目标"是误导：顾客根本没得选
      title = '请先登录';
    } else if (gateBlocked.value) {
      title = '请先确认上面的体况评分、活动量与每日餐数';
    } else if (
      willWriteBackToProfile.value &&
      !formData.value.healthInfoConsent
    ) {
      title = '请先勾选同意，我们才能把信息记入健康档案';
    }

    uni.showToast({ title, icon: 'none' });
    return;
  }

  // 防重复提交：这单是付费单，重复提交会生成两张待付款订单
  if (submitting.value) return;

  /**
   * 申请订阅消息（2026-09-28）。
   *
   * 微信的一次性订阅消息必须由用户点击触发申请，否则云端发不出去 ——
   * 所以放在"点提交"这一刻。模板 ID 由后台环境变量配置，
   * 未配置时（orderNotifyTemplateId 为空）跳过申请，不做无意义的失败调用。
   */
  await requestOrderNotification();

  submitting.value = true;

  try {
    uni.showLoading({ title: '提交中...' });

    /**
     * 提交载荷。
     *
     * 2026-09-28 修复：原先勾了「需要健康管理」会把 targetGoal **改写成
     * HEALTH_SUPPORT**，于是「减重 + 需要健康管理」这种组合会把减重目标丢掉。
     * 老板口径是"减重/维持/增重以顾客选的为准"，所以两者分开传：
     *   · targetGoal          —— 顾客选的体重目标，原样保留
     *   · needsHealthManagement —— 是否勾了健康管理
     *
     * syncToHealthProfile 与知情同意绑定：不同意就不写回档案（决策 9）。
     * 没勾健康管理时本来就没有东西要写回。
     */
    const submitData = {
      ...formData.value,
      syncToHealthProfile:
        formData.value.enableHealthManagement && formData.value.healthInfoConsent,
      needsHealthManagement: formData.value.enableHealthManagement,
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
      `wechatId=${encodeURIComponent(String(res.data.wechatId ?? ''))}`,
    ];
    uni.navigateTo({
      url: `/pages/custom-recipe/success?${query.join('&')}`,
    });
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({
      title: error?.message || '提交失败，请稍后重试',
      icon: 'none',
    });
  } finally {
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

/* ---------- 顶部标题 ---------- */
.page-header {
  position: relative;
  overflow: hidden;
  padding: 44rpx 34rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 16rpx 44rpx rgba(20, 41, 31, 0.28);
}

.page-title {
  display: block;
  font-size: 42rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
  letter-spacing: 2rpx;
}

.page-subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #cfe0d5;
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

/* ---------- 选择狗狗 ---------- */
.picker-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.selected-text {
  font-size: 28rpx;
  color: var(--sk-ink, #26261f);
}

.placeholder {
  font-size: 28rpx;
  color: var(--sk-ink-3, #968f6d);
}

.arrow {
  font-size: 32rpx;
  color: var(--sk-ink-3, #968f6d);
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

.group-title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--sk-ink-2, #6b6653);
}

.radio-group {
  display: flex;
  gap: 12rpx;
}

.radio-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22rpx 10rpx;
  background: #ffffff;
  border: 2rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.radio-item.active {
  background: var(--sk-gold-soft, #f6efe0);
  border-color: var(--sk-gold, #b08d4f);
}

.radio-icon {
  margin-right: 10rpx;
  font-size: 30rpx;
  color: var(--sk-ink-3, #968f6d);
}

.radio-item.active .radio-icon {
  color: var(--sk-gold, #b08d4f);
}

.radio-label {
  font-size: 28rpx;
  color: var(--sk-ink, #26261f);
}

.radio-item.active .radio-label {
  font-weight: 600;
  color: var(--sk-primary, #1e3a2f);
}

.checkbox-wrapper {
  margin-bottom: 16rpx;
}

.checkbox-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
}

.checkbox-icon {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  border: 2rpx solid var(--sk-line, #e3e6d4);
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #ffffff;
}

.checkbox-icon.checked {
  background: var(--sk-primary, #1e3a2f);
  border-color: var(--sk-primary, #1e3a2f);
}

.checkbox-label {
  font-size: 28rpx;
  color: var(--sk-ink, #26261f);
}

.health-management-section {
  margin-top: 20rpx;
  padding: 22rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border-radius: var(--sk-radius-badge, 12rpx);
}

/* ===== 体况建议（只给建议，由顾客决定） ===== */
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
.target-line {
  margin-top: 20rpx;
  padding: 20rpx 22rpx;
  border-radius: 16rpx;
  background: #eef2e4;
  border: 1rpx solid #dde3cd;
}

.target-line__title {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.target-line__detail {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #26261f;
}

.target-line__note {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* ===== 从档案带出的说明 ===== */
.health-prefill-hint,
.preference-prefill-hint {
  display: block;
  margin-bottom: 16rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

.health-reference {
  margin-top: 20rpx;
  padding: 20rpx 22rpx;
  border-radius: 16rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.health-reference__title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.health-reference__row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-top: 8rpx;
}

.health-reference__label {
  flex: 0 0 auto;
  font-size: 23rpx;
  color: #968f6d;
}

.health-reference__value {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 23rpx;
  color: #26261f;
}

/* 决策 6：只增不删 */
.health-keep-note,
.consent-note {
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

/* ===== 备注（可选） ===== */
.notes-hint {
  display: block;
  margin-bottom: 12rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

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

.attachment-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.attachment-add {
  font-size: 25rpx;
  color: #b08d4f;
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

/* ===== 知情同意（决策 9） ===== */
.consent-section {
  margin: 24rpx 24rpx 0;
  padding: 24rpx;
  border-radius: 20rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.consent-item {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.consent-icon {
  flex: 0 0 auto;
  width: 36rpx;
  height: 36rpx;
  margin-top: 2rpx;
  border-radius: 8rpx;
  border: 2rpx solid #cdb98a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #f6efe0;
}

.consent-icon.checked {
  background: #1e3a2f;
  border-color: #1e3a2f;
}

.consent-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 25rpx;
  line-height: 1.6;
  color: #26261f;
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

.add-btn,
.action-btn {
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
.delivery-section {
  background: var(--sk-gold-soft, #f6efe0);
  border-color: rgba(176, 141, 79, 0.45);
}

.delivery-info {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10rpx;
}

.delivery-label {
  font-size: 28rpx;
  color: var(--sk-ink-2, #6b6653);
}

.delivery-date {
  margin-left: 10rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-gold, #b08d4f);
}

.delivery-note {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: var(--sk-ink-3, #968f6d);
}

.credit-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-top: 16rpx;
}

.credit-label {
  padding: 4rpx 16rpx;
  font-size: 22rpx;
  color: #1e3a2f;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  border-radius: 999rpx;
}

.credit-value {
  font-size: 24rpx;
  color: var(--sk-ink-2, #6b6653);
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
</style>
