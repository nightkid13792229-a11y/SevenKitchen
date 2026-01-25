<template>
  <view class="custom-recipe-page">
    <!-- 顶部标题 -->
    <view class="page-header">
      <text class="page-title">专属食谱定制</text>
    </view>

    <!-- 第一步：选择狗狗 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">1</text>
        <text class="title-text">选择狗狗</text>
      </view>
      <picker mode="selector" :range="dogOptions" range-key="label" @change="onDogChange">
        <view class="picker-input">
          <text v-if="selectedDog" class="selected-text">{{selectedDog.label}}</text>
          <text v-else class="placeholder">请选择要定制的狗狗</text>
          <text class="arrow">›</text>
        </view>
      </picker>

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
        </view>
      </view>

      <textarea
        v-model="formData.additionalNotes"
        class="notes-input"
        placeholder="其它需求（可选）"
        maxlength="500"
      />
    </view>

    <!-- 第三步：饮食偏好 -->
    <view class="section">
      <view class="section-title">
        <text class="step-number">3</text>
        <text class="title-text">饮食偏好</text>
      </view>
      <view class="preference-section">
        <text class="preference-title">喜欢的食材</text>
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
        <text class="preference-title">不吃的食材</text>
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

    <!-- 交付日期显示 -->
    <view class="section delivery-section">
      <view class="delivery-info">
        <text class="delivery-label">预计交付日期：</text>
        <text class="delivery-date">{{estimatedDeliveryDate}}</text>
      </view>
      <text class="delivery-note">我们会根据排期计算并告知您具体的交付时间</text>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-section">
      <button class="submit-btn" @tap="submitOrder" :disabled="!canSubmit">
        提交定制订单 ¥299
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getBaseUrl } from '@/utils/config';

// 状态定义
const dogOptions = ref<any[]>([]);
const selectedDog = ref<any>(null);

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
  scheduledDate: new Date().toISOString().split('T')[0],
  syncToHealthProfile: true,
});

const weightManagementOptions = [
  { value: 'LOSE_WEIGHT', label: '减重' },
  { value: 'MAINTAIN', label: '维持' },
  { value: 'GAIN_WEIGHT', label: '增重' },
];

// 计算属性
const canSubmit = computed(() => {
  return formData.value.dogId && formData.value.targetGoal;
});

const estimatedDeliveryDate = computed(() => {
  const date = new Date();
  date.setDate(date.getDate() + 5);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
});

// 生命周期
onLoad(() => {
  loadDogs();
});

// 方法
const loadDogs = async () => {
  console.log('=== 开始加载狗狗列表 ===');
  console.log('API URL:', `${getBaseUrl()}/dogs`);

  try {
    const res = await uni.request({
      url: `${getBaseUrl()}/dogs`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`,
      },
    });

    console.log('狗狗列表响应状态码:', res.statusCode);
    console.log('完整响应数据:', res.data);

    if (res.data.code === 0 && res.data.data) {
      const dogs = res.data.data;
      console.log('获取到狗狗数量:', dogs.length);

      dogOptions.value = dogs.map((dog: any) => ({
        value: dog.id,
        label: `${dog.name} - ${dog.breedName || '未知品种'}`,
        ...dog,
      }));

      if (dogs.length === 0) {
        uni.showToast({
          title: '暂无狗狗档案，请先创建',
          icon: 'none',
          duration: 2000,
        });
      }
    }
  } catch (error) {
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
};

const selectWeightGoal = (goal: string) => {
  formData.value.targetGoal = goal;
};

const toggleHealthManagement = () => {
  formData.value.enableHealthManagement = !formData.value.enableHealthManagement;
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

const submitOrder = async () => {
  if (!canSubmit.value) {
    uni.showToast({
      title: '请选择狗狗和定制目标',
      icon: 'none',
    });
    return;
  }

  try {
    uni.showLoading({ title: '提交中...' });

    const submitData = {
      ...formData.value,
      targetGoal: formData.value.enableHealthManagement ? 'HEALTH_SUPPORT' : formData.value.targetGoal,
    };

    const res = await uni.request({
      url: `${getBaseUrl()}/custom-recipe/orders`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`,
        'Content-Type': 'application/json',
      },
      data: submitData,
    });

    uni.hideLoading();

    if (res.data.code === 200 || res.data.code === 0) {
      uni.navigateTo({
        url: '/pages/custom-recipe/success?orderId=' + res.data.data.orderId,
      });
    } else {
      uni.showToast({
        title: res.data.message || '提交失败',
        icon: 'none',
      });
    }
  } catch (error) {
    uni.hideLoading();
    uni.showToast({
      title: '网络错误',
      icon: 'none',
    });
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
  const map: Record<string, string> = {
    LOW: '低活动量',
    NORMAL: '正常活动',
    HIGH: '高活动量',
  };
  return map[level] || level;
};
</script>

<style scoped>
.custom-recipe-page {
  padding: 20rpx;
  padding-bottom: 180rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.page-header {
  text-align: center;
  padding: 40rpx 0;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
  border-radius: 20rpx;
  margin-bottom: 20rpx;
}

.page-title {
  display: block;
  font-size: 48rpx;
  font-weight: bold;
  color: #fff;
}

.section {
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.step-number {
  width: 50rpx;
  height: 50rpx;
  line-height: 50rpx;
  text-align: center;
  background: #FF6B6B;
  color: #fff;
  border-radius: 50%;
  font-size: 28rpx;
  font-weight: bold;
  margin-right: 15rpx;
}

.title-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.picker-input {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 25rpx;
  background: #f8f8f8;
  border-radius: 12rpx;
}

.selected-text {
  color: #333;
  font-size: 28rpx;
}

.placeholder {
  color: #999;
  font-size: 28rpx;
}

.arrow {
  color: #999;
  font-size: 32rpx;
}

.dog-info-card {
  margin-top: 20rpx;
  padding: 20rpx;
  background: #f8f8f8;
  border-radius: 12rpx;
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
  color: #666;
  width: 150rpx;
}

.value {
  color: #333;
  flex: 1;
}

.goal-group {
  margin-bottom: 30rpx;
}

.group-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 15rpx;
}

.radio-group {
  display: flex;
  gap: 10rpx;
}

.radio-item {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 20rpx;
  border: 2rpx solid #e0e0e0;
  border-radius: 12rpx;
  justify-content: center;
}

.radio-item.active {
  border-color: #FF6B6B;
  background: #fff5f5;
}

.radio-icon {
  margin-right: 10rpx;
  font-size: 32rpx;
  color: #999;
}

.radio-item.active .radio-icon {
  color: #FF6B6B;
}

.radio-label {
  font-size: 28rpx;
  color: #333;
}

.checkbox-wrapper {
  margin-bottom: 15rpx;
}

.checkbox-item {
  display: flex;
  align-items: center;
  padding: 20rpx;
}

.checkbox-icon {
  width: 40rpx;
  height: 40rpx;
  border: 2rpx solid #e0e0e0;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15rpx;
}

.checkbox-icon.checked {
  background: #FF6B6B;
  border-color: #FF6B6B;
  color: #fff;
}

.checkbox-label {
  font-size: 28rpx;
  color: #333;
}

.health-management-section {
  margin-top: 20rpx;
  padding: 20rpx;
  background: #f8f8f8;
  border-radius: 12rpx;
}

.health-item {
  margin-bottom: 20rpx;
}

.health-item:last-child {
  margin-bottom: 0;
}

.health-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

.health-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.add-btn,
.action-btn {
  font-size: 24rpx;
  color: #FF6B6B;
  padding: 8rpx 16rpx;
  border: 1rpx solid #FF6B6B;
  border-radius: 8rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
}

.tag-item {
  display: flex;
  align-items: center;
  padding: 12rpx 20rpx;
  background: #fff;
  border: 1rpx solid #e0e0e0;
  border-radius: 20rpx;
  font-size: 26rpx;
  color: #333;
}

.tag-item.editable {
  background: #f0f0f0;
}

.remove-btn {
  margin-left: 10rpx;
  color: #999;
  font-size: 24rpx;
}

.empty-text {
  font-size: 26rpx;
  color: #999;
}

.add-btn {
  display: inline-block;
  padding: 12rpx 20rpx;
  background: #f0f0f0;
  border-radius: 20rpx;
  font-size: 26rpx;
  color: #666;
  border: none;
}

.notes-input {
  width: 100%;
  min-height: 150rpx;
  padding: 20rpx;
  background: #f8f8f8;
  border-radius: 12rpx;
  font-size: 28rpx;
  margin-top: 20rpx;
}

.preference-section {
  margin-bottom: 20rpx;
}

.preference-title {
  display: block;
  font-size: 28rpx;
  color: #666;
  margin-bottom: 15rpx;
}

.delivery-section {
  background: linear-gradient(135deg, #FFE5E5 0%, #FFF0E5 100%);
  border: 2rpx solid #FF6B6B;
}

.delivery-info {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10rpx;
}

.delivery-label {
  font-size: 28rpx;
  color: #666;
}

.delivery-date {
  font-size: 32rpx;
  font-weight: bold;
  color: #FF6B6B;
  margin-left: 10rpx;
}

.delivery-note {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: #999;
}

.submit-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx;
  background: #fff;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.1);
}

.submit-btn {
  width: 100%;
  height: 90rpx;
  line-height: 90rpx;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
  color: #fff;
  font-size: 32rpx;
  font-weight: bold;
  border-radius: 45rpx;
  border: none;
}

.submit-btn[disabled] {
  background: #ccc;
}
</style>
