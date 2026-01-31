<template>
  <view class="staff-login-container">
    <!-- 头部 -->
    <view class="header">
      <view class="back-btn" @click="goBack">
        <text class="icon">‹</text>
      </view>
      <text class="title">员工登录</text>
    </view>

    <!-- 表单区域 -->
    <view class="form-section">
      <view class="form-item">
        <text class="label">手机号</text>
        <input
          class="input"
          type="number"
          v-model="phone"
          placeholder="请输入手机号"
          maxlength="11"
        />
      </view>

      <view class="form-item">
        <text class="label">验证码</text>
        <view class="code-input-row">
          <input
            class="input code-input"
            type="number"
            v-model="smsCode"
            placeholder="请输入验证码"
            maxlength="6"
          />
          <button
            class="send-code-btn"
            @click="sendCode"
            :disabled="countdown > 0 || !isValidPhone"
          >
            {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>

      <button
        class="login-btn"
        @click="handleLogin"
        :disabled="!canLogin || loading"
      >
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </view>

    <!-- 底部说明 -->
    <view class="footer">
      <text class="tips">未注册的手机号验证通过后将自动创建员工账号</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { authApi } from '../../utils/api';

const phone = ref('');
const smsCode = ref('');
const countdown = ref(0);
const loading = ref(false);

// 手机号验证
const isValidPhone = computed(() => {
  return /^1[3-9]\d{9}$/.test(phone.value);
});

// 是否可以登录
const canLogin = computed(() => {
  return isValidPhone.value && smsCode.value.length === 6;
});

// 发送验证码
const sendCode = async () => {
  if (!isValidPhone.value) {
    uni.showToast({
      title: '请输入正确的手机号',
      icon: 'none',
    });
    return;
  }

  try {
    const response = await authApi.sendSmsCode(phone.value);

    if (response.code === 0) {
      uni.showToast({
        title: '验证码已发送',
        icon: 'success',
      });

      // 开始倒计时
      countdown.value = 60;
      const timer = setInterval(() => {
        countdown.value--;
        if (countdown.value === 0) {
          clearInterval(timer);
        }
      }, 1000);
    } else {
      throw new Error(response.message || '发送失败');
    }
  } catch (error: any) {
    uni.showToast({
      title: error.message || '发送失败，请重试',
      icon: 'none',
    });
  }
};

// 登录
const handleLogin = async () => {
  if (!canLogin.value) {
    return;
  }

  loading.value = true;

  try {
    const response = await authApi.phoneLogin(phone.value, smsCode.value);

    if (response.code === 0) {
      const { token, user } = response.data;

      // 保存token和用户信息
      uni.setStorageSync('token', token);
      uni.setStorageSync('user', user);

      // 触发登录状态变化通知（让TabBar知道用户已登录）
      const currentTrigger = uni.getStorageSync('userLoginTrigger') || 0;
      uni.setStorageSync('userLoginTrigger', currentTrigger + 1);

      uni.showToast({
        title: '登录成功',
        icon: 'success',
      });

      // 跳转到首页（员工首页）
      setTimeout(() => {
        uni.redirectTo({ url: '/pages/home/index' });
      }, 500);
    } else {
      throw new Error(response.message || '登录失败');
    }
  } catch (error: any) {
    uni.showToast({
      title: error.message || '登录失败，请重试',
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped lang="scss">
.staff-login-container {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.header {
  position: relative;
  height: 88rpx;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1rpx solid #e5e5e5;
}

.back-btn {
  position: absolute;
  left: 24rpx;
  padding: 10rpx;

  .icon {
    font-size: 48rpx;
    color: #333;
  }
}

.title {
  font-size: 32rpx;
  font-weight: 500;
  color: #333;
}

.form-section {
  padding: 40rpx 32rpx;
}

.form-item {
  margin-bottom: 32rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  color: #666;
  margin-bottom: 16rpx;
}

.input {
  width: 100%;
  height: 88rpx;
  background-color: #fff;
  border-radius: 8rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #e5e5e5;
  box-sizing: border-box;
}

.code-input-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.code-input {
  flex: 1;
}

.send-code-btn {
  width: 200rpx;
  height: 88rpx;
  background-color: #667eea;
  color: #fff;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  border: none;

  &:disabled {
    background-color: #ccc;
  }
}

.login-btn {
  width: 100%;
  height: 96rpx;
  background-color: #667eea;
  color: #fff;
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 500;
  border: none;
  margin-top: 48rpx;

  &:disabled {
    background-color: #ccc;
  }
}

.footer {
  padding: 0 32rpx;
  text-align: center;
}

.tips {
  font-size: 24rpx;
  color: #999;
}
</style>
