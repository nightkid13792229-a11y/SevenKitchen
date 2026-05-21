<template>
  <view class="login-container">
    <!-- Logo区域 -->
    <view class="logo-section">
      <image class="logo" src="../../static/logo.png" mode="aspectFit"></image>
      <text class="app-name">Seven的厨房</text>
      <text class="app-slogan">新鲜健康，为爱定制</text>
    </view>

    <!-- 登录 -->
    <view class="login-section">
      <!-- 隐私协议勾选 -->
      <view class="agreement-section">
        <view class="checkbox-wrapper" @tap="toggleAgreement">
          <view :class="['checkbox', { checked: isAgreed }]">
            <text v-if="isAgreed" class="check-icon">✓</text>
          </view>
        </view>
        <text class="agreement-text">
          我已阅读并同意
          <text class="link" @tap.stop="navigateToPrivacy">《隐私政策》</text>
          和
          <text class="link" @tap.stop="navigateToTerms">《用户协议》</text>
        </text>
      </view>

      <button
        class="wechat-login-btn"
        :class="{ 'btn-disabled': !isAgreed }"
        @tap="handleWechatLogin"
        :disabled="loading || !isAgreed"
        @agreeprivacyauthorization="handlePrivacyAgree"
      >
        <text v-if="!loading">立即登录</text>
        <text v-else>登录中...</text>
      </button>

      <!-- 游客模式入口 -->
      <view class="guest-entry" @tap="skipLogin">
        <text class="guest-text">暂不登录，先逛逛</text>
      </view>

      <view class="dev-api-info">
        <text>当前API：{{ currentApiBaseUrl }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { request, setToken, markTokenReady } from "../../utils/api";
import { getBaseUrl } from "../../utils/config";
import { getCurrentMiniProgramAppId } from "../../utils/account";

const loading = ref(false);
const isAgreed = ref(false);
const currentApiBaseUrl = ref("");

onLoad(() => {
  currentApiBaseUrl.value = getBaseUrl();

  // 检查是否已登录
  const token = uni.getStorageSync("token");
  if (token) {
    uni.switchTab({ url: "/pages/home/index" });
  }
});

// 切换协议同意状态
const toggleAgreement = () => {
  isAgreed.value = !isAgreed.value;
};

// 跳转到隐私政策页面
const navigateToPrivacy = () => {
  uni.navigateTo({ url: "/pages/privacy/index" });
};

// 跳转到用户协议页面
const navigateToTerms = () => {
  uni.navigateTo({ url: "/pages/terms/index" });
};

// 跳过登录，以游客模式进入首页
const skipLogin = () => {
  uni.switchTab({ url: "/pages/home/index" });
};

// 处理隐私协议同意回调（空实现，用于触发微信隐私协议弹窗）
const handlePrivacyAgree = () => {
  // 微信小程序框架会自动处理隐私协议
};

const getLoginErrorMessage = (error: any) => {
  const message = error?.message || "";

  if (message.includes("Failed to authenticate with WeChat")) {
    return "登录失败，请稍后重试";
  }

  if (message.includes("request:fail") || message.includes("timeout")) {
    return "无法连接后端服务，请检查 API 地址";
  }

  return message || "登录失败，请重试";
};

// 登录
const handleWechatLogin = async () => {
  loading.value = true;
  currentApiBaseUrl.value = getBaseUrl();
  console.log("[Login] Current API base URL:", currentApiBaseUrl.value);

  try {
    // 1. 获取微信code（使用 Promise 包装以兼容微信小程序）
    const res = await new Promise((resolve, reject) => {
      uni.login({
        provider: "weixin",
        success: (res) => resolve(res),
        fail: (err) => reject(err),
      });
    });

    if (!res?.code) {
      console.error("uni.login 返回数据格式错误:", res);
      throw new Error("获取微信code失败");
    }

    const code = res.code;

    // 2. 调用后端登录接口（不再发送userInfo）
    const response = await request({
      url: "/auth/wechat-login",
      method: "POST",
      data: {
        code,
        appId: getCurrentMiniProgramAppId(),
        userInfo: {}, // 空对象，不再尝试获取用户信息
      },
    });

    console.log("[Login] Backend response:", response);

    if (response.code === 0) {
      const { token, user, isNewUser, role } = response.data;

      console.log("[Login] Extracted data:", { token, user, isNewUser, role });

      if (!token) {
        throw new Error("后端未返回token");
      }

      // 3. 保存token和用户信息（使用统一的token管理函数）
      setToken(token);
      try {
        uni.setStorageSync("user", user);
      } catch (storageErr) {
        console.error("[Login] Failed to save user to storage:", storageErr);
        // 继续执行，不阻塞登录流程
      }
      markTokenReady(); // 标记token已就绪
      console.log(
        "[Login] Token and user saved to storage, token marked as ready",
      );

      // 3.5. 设置触发器，让TabBar的轮询监听能够检测到变化
      try {
        uni.setStorageSync("userLoginTrigger", Date.now());
        console.log("[Login] Set userLoginTrigger for TabBar polling");
      } catch (storageErr) {
        console.error("[Login] Failed to set userLoginTrigger:", storageErr);
      }

      // 3.6. 尝试直接刷新TabBar
      setTimeout(() => {
        try {
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          if (currentPage && currentPage.$scope) {
            const tabBar = currentPage.$scope.getTabBar();
            if (tabBar && typeof tabBar.refresh === "function") {
              console.log(
                "[Login] Triggering TabBar refresh immediately via scope",
              );
              tabBar.refresh();
            } else {
              console.log(
                "[Login] TabBar not found in scope, relying on polling",
              );
            }
          } else {
            console.log(
              "[Login] Current page scope not available, relying on polling",
            );
          }
        } catch (error) {
          console.log("[Login] Failed to refresh TabBar:", error.message);
        }
      }, 200);

      // 4. 检查是否需要设置头像昵称
      const needsProfileSetup =
        !user.avatarUrl ||
        user.avatarUrl === "" ||
        !user.nickname ||
        user.nickname === "" ||
        user.nickname === "微信用户";

      console.log("[Login] Needs profile setup:", needsProfileSetup);

      if (!user.phone && !user.phoneBound) {
        const phoneBindRedirect =
          role === "STAFF" || role === "ADMIN"
            ? "%2Fpages%2Fstaff-workbench%2Findex"
            : "%2Fpages%2Fhome%2Findex";
        setTimeout(() => {
          uni.redirectTo({
            url: `/pages/phone-bind/index?redirect=${phoneBindRedirect}`,
          });
        }, 500);
        return;
      }

      if (needsProfileSetup) {
        // 新用户或未设置头像昵称，跳转到完善资料页面
        setTimeout(() => {
          uni.redirectTo({
            url: "/pages/profile-setup/index",
          });
        }, 500);
      } else {
        // 已设置过头像昵称，直接进入首页
        if (isNewUser) {
          uni.showToast({
            title: "欢迎加入Seven的厨房！",
            icon: "success",
            duration: 2000,
          });
        } else if (role === "STAFF" || role === "ADMIN") {
          uni.showToast({
            title: "欢迎回来，" + (role === "ADMIN" ? "管理员" : "员工"),
            icon: "success",
            duration: 2000,
          });
        }

        setTimeout(() => {
          uni.switchTab({ url: "/pages/home/index" });
        }, 500);
      }
    } else {
      throw new Error(response.message || "登录失败");
    }
  } catch (error: any) {
    console.error("登录失败:", error);
    uni.showToast({
      title: getLoginErrorMessage(error),
      icon: "none",
    });
  } finally {
    loading.value = false;
  }
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

.agreement-section {
  display: flex;
  align-items: flex-start;
  margin-bottom: 30rpx;
  padding: 0 20rpx;
}

.checkbox-wrapper {
  margin-right: 12rpx;
  padding-top: 4rpx;
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid #ccc;
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
}

.checkbox.checked {
  background-color: #07c160;
  border-color: #07c160;
}

.check-icon {
  color: #fff;
  font-size: 24rpx;
  font-weight: bold;
}

.agreement-text {
  flex: 1;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.5;
}

.link {
  color: #fff;
  text-decoration: underline;
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

.btn-disabled {
  opacity: 0.5;
  background-color: #ccc !important;
}

/* 游客模式入口 */
.guest-entry {
  margin-top: 32rpx;
  text-align: center;
  padding: 24rpx 0;
}

.guest-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: underline;
}

.dev-api-info {
  margin-top: 18rpx;
  padding: 12rpx 16rpx;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 8rpx;
  text-align: center;
}

.dev-api-info text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 22rpx;
  word-break: break-all;
}
</style>
