<template>
  <view class="login-container">
    <!-- Logo区域 -->
    <view class="logo-section">
      <image class="logo" src="/static/logo.png" mode="aspectFit"></image>
      <text class="app-name">Seven的厨房</text>
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
    </view>

    <!-- 用户协议（已隐藏） -->
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
import { request, setToken, markTokenReady } from '../../utils/api';

const loading = ref(false);

onLoad(() => {
  // 检查是否已登录
  const token = uni.getStorageSync('token');
  if (token) {
    uni.switchTab({ url: '/pages/home/index' });
  }
});

// 微信授权登录
const handleWechatLogin = async (e: any) => {
  if (e.detail.errMsg !== 'getUserInfo:ok' && e.detail.errMsg !== 'getUserInfo:ok') {
    uni.showToast({
      title: '需要授权才能登录',
      icon: 'none',
    });
    return;
  }

  loading.value = true;

  try {
    // 1. 获取微信code（使用 Promise 包装以兼容微信小程序）
    const res = await new Promise((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      });
    });

    if (!res?.code) {
      console.error('uni.login 返回数据格式错误:', res);
      throw new Error('获取微信code失败');
    }

    const code = res.code;

    // 2. 调用后端微信登录接口
    const response = await request({
      url: '/auth/wechat-login',
      method: 'POST',
      data: {
        code,
        userInfo: e.detail.userInfo
      }
    });

    console.log('[Login] Backend response:', response);

    if (response.code === 0) {
      const { token, user, isNewUser, role } = response.data;

      console.log('[Login] Extracted data:', { token, user, isNewUser, role });

      if (!token) {
        throw new Error('后端未返回token');
      }

      // 3. 保存token和用户信息（使用统一的token管理函数）
      setToken(token);
      uni.setStorageSync('user', user);
      markTokenReady(); // 标记token已就绪
      console.log('[Login] Token and user saved to storage, token marked as ready');

      // 3.5. 设置触发器，让TabBar的轮询监听能够检测到变化
      uni.setStorageSync('userLoginTrigger', Date.now());
      console.log('[Login] Set userLoginTrigger for TabBar polling');

      // 3.6. 尝试直接刷新TabBar
      setTimeout(() => {
        try {
          const pages = getCurrentPages()
          const currentPage = pages[pages.length - 1]
          if (currentPage && currentPage.$scope) {
            const tabBar = currentPage.$scope.getTabBar()
            if (tabBar && typeof tabBar.refresh === 'function') {
              console.log('[Login] Triggering TabBar refresh immediately via scope')
              tabBar.refresh()
            } else {
              console.log('[Login] TabBar not found in scope, relying on polling')
            }
          } else {
            console.log('[Login] Current page scope not available, relying on polling')
          }
        } catch (error) {
          console.log('[Login] Failed to refresh TabBar:', error.message)
        }
      }, 200);

      // 4. 新用户提示
      if (isNewUser) {
        uni.showToast({
          title: '欢迎加入Seven的厨房！',
          icon: 'success',
          duration: 2000
        });
      } else if (role === 'STAFF' || role === 'ADMIN') {
        uni.showToast({
          title: '欢迎回来，' + (role === 'ADMIN' ? '管理员' : '员工'),
          icon: 'success',
          duration: 2000
        });
      }

      // 5. 跳转到首页
      setTimeout(() => {
        uni.switchTab({ url: '/pages/home/index' });
      }, 500);
    } else {
      throw new Error(response.message || '登录失败');
    }
  } catch (error: any) {
    console.error('登录失败:', error);
    uni.showToast({
      title: error.message || '登录失败，请重试',
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
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

<style scoped>
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
}

.wechat-login-btn:disabled {
  opacity: 0.7;
}

.agreement-section {
  width: 100%;
  padding-bottom: 40rpx;
  display: none;
}

.agreement-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  line-height: 1.6;
}

.agreement-text .link {
  color: #fff;
  text-decoration: underline;
}
</style>
