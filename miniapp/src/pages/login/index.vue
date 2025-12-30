<template>
  <view class="login-container">
    <!-- Logo区域 -->
    <view class="logo-section">
      <image class="logo" src="/static/logo.png" mode="aspectFit"></image>
      <text class="app-name">七号厨房</text>
      <text class="app-slogan">新鲜健康，为爱定制</text>
    </view>

    <!-- 微信授权登录 -->
    <view class="login-section">
      <button
        class="wechat-login-btn"
        open-type="getUserInfo"
        @getuserinfo="handleWechatLogin"
        :disabled="loading"
      >
        <text v-if="!loading">微信一键登录</text>
        <text v-else>登录中...</text>
      </button>

      <!-- 员工登录入口 -->
      <view class="staff-login-link" @click="goToStaffLogin">
        <text class="link-text">员工登录</text>
      </view>
    </view>

    <!-- 用户协议 -->
    <view class="agreement-section">
      <view class="agreement-text">
        登录即表示同意
        <text class="link" @click="showUserAgreement">《用户协议》</text>
        和
        <text class="link" @click="showPrivacyPolicy">《隐私政策》</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { authApi } from '../../utils/api';

const loading = ref(false);

onLoad(() => {
  // 检查是否已登录
  const token = uni.getStorageSync('token');
  if (token) {
    uni.redirectTo({ url: '/pages/home/index' });
  }
});

// 微信授权登录
const handleWechatLogin = async (e: any) => {
  if (e.detail.errMsg !== 'getUserInfo:ok') {
    uni.showToast({
      title: '需要授权才能登录',
      icon: 'none',
    });
    return;
  }

  loading.value = true;

  try {
    // 1. 获取微信code
    const loginRes = await uni.login({
      provider: 'weixin',
    });

    if (!loginRes[1].code) {
      throw new Error('获取微信code失败');
    }

    const code = loginRes[1].code;

    // 2. 调用后端微信登录接口
    const response = await authApi.wechatLogin(code, e.detail.userInfo);

    if (response.code === 0) {
      const { token, user, isNewUser } = response.data;

      // 3. 保存token和用户信息
      uni.setStorageSync('token', token);
      uni.setStorageSync('user', user);

      // 4. 新用户提示
      if (isNewUser) {
        uni.showToast({
          title: '欢迎加入七号厨房！',
          icon: 'success',
        });
      }

      // 5. 跳转到首页
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

// 跳转到员工登录页
const goToStaffLogin = () => {
  uni.navigateTo({ url: '/pages/login/staff' });
};

// 显示用户协议
const showUserAgreement = () => {
  uni.showModal({
    title: '用户协议',
    content: '这里是用户协议内容...',
    showCancel: false,
  });
};

// 显示隐私政策
const showPrivacyPolicy = () => {
  uni.showModal({
    title: '隐私政策',
    content: '这里是隐私政策内容...',
    showCancel: false,
  });
};
</script>

<style scoped lang="scss">
.login-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40rpx;
}

.logo-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  width: 160rpx;
  height: 160rpx;
  border-radius: 24rpx;
  margin-bottom: 32rpx;
  background-color: #fff;
}

.app-name {
  font-size: 48rpx;
  font-weight: bold;
  color: #fff;
  margin-bottom: 16rpx;
}

.app-slogan {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.8);
}

.login-section {
  width: 100%;
  margin-bottom: 80rpx;
}

.wechat-login-btn {
  width: 100%;
  height: 96rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 500;
  border: none;
  margin-bottom: 32rpx;

  &:disabled {
    opacity: 0.7;
  }
}

.staff-login-link {
  text-align: center;
  margin-top: 24rpx;

  .link-text {
    color: #fff;
    font-size: 28rpx;
    text-decoration: underline;
  }
}

.agreement-section {
  width: 100%;
  padding-bottom: 40rpx;
}

.agreement-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  line-height: 1.6;

  .link {
    color: #fff;
    text-decoration: underline;
  }
}
</style>
