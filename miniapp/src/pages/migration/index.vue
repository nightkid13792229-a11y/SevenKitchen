<template>
  <view class="migration-page">
    <view class="panel">
      <view class="icon-shell">迁移</view>
      <text class="title">同步旧版资料</text>
      <text class="desc">
        请在新版小程序授权手机号。系统会根据旧版迁移凭证和手机号识别历史资料，确认前不会自动同步。
      </text>

      <view v-if="errorMessage" class="notice-card error">
        <text class="notice-title">暂时无法迁移</text>
        <text class="notice-copy">{{ errorMessage }}</text>
      </view>

      <view v-else-if="verifiedMigration" class="history-card">
        <text class="history-title">发现可同步资料</text>
        <text class="history-line">手机号：{{ verifiedMigration.phone }}</text>
        <text class="history-line">
          历史订单：{{ verifiedMigration.sourceUser?.orderCount || 0 }} 个
        </text>
        <text class="history-line">
          狗狗资料：{{ verifiedMigration.sourceUser?.dogCount || 0 }} 只
        </text>
        <text class="history-line">
          收货地址：{{ verifiedMigration.sourceUser?.addressCount || 0 }} 个
        </text>
        <text class="history-tip">
          点击确认后，旧版资料会同步到新版账号。该操作需要你主动确认，不会静默合并。
        </text>
      </view>

      <view v-else class="steps-card">
        <text class="steps-title">需要你完成</text>
        <text class="step-line">1. 新版小程序登录当前微信</text>
        <text class="step-line">2. 授权手机号用于账号识别</text>
        <text class="step-line">3. 查看历史资料摘要并确认同步</text>
      </view>

      <button
        v-if="!verifiedMigration && !errorMessage"
        class="primary-btn"
        open-type="getPhoneNumber"
        :disabled="loading || !migrationToken"
        @getphonenumber="handleGetPhoneNumber"
      >
        {{ loading ? "处理中..." : "授权手机号并查看资料" }}
      </button>

      <button
        v-if="verifiedMigration"
        class="primary-btn"
        :disabled="loading"
        @tap="confirmMigration"
      >
        {{ loading ? "同步中..." : "确认同步旧版资料" }}
      </button>

      <button class="ghost-btn" :disabled="loading" @tap="goHome">
        {{ verifiedMigration ? "暂不同步" : "返回首页" }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { markTokenReady, request, setToken } from "../../utils/api";
import { getCurrentMiniProgramAppId } from "../../utils/account";

const loading = ref(false);
const migrationToken = ref("");
const errorMessage = ref("");
const verifiedMigration = ref<any | null>(null);

onLoad((options: any) => {
  migrationToken.value = decodeURIComponent(options?.token || "");
  if (!migrationToken.value) {
    errorMessage.value = "缺少迁移凭证，请从旧版小程序重新进入。";
  }
});

function saveLoginState(data: any) {
  if (data?.token) {
    setToken(data.token);
  }
  if (data?.user) {
    uni.setStorageSync("user", data.user);
    uni.setStorageSync("userLoginTrigger", Date.now());
  }
  markTokenReady();
}

function goHome() {
  uni.switchTab({ url: "/pages/home/index" });
}

function getPhoneAuthFailMessage(detail: any): string {
  const errMsg = String(detail?.errMsg || "");
  if (errMsg.includes("deny") || errMsg.includes("cancel")) {
    return "你已取消手机号授权，请重新点击按钮并同意授权。";
  }
  if (errMsg.includes("not support") || errMsg.includes("unsupported")) {
    return "当前微信版本不支持手机号授权，请升级微信后重试。";
  }
  return "没有拿到微信返回的手机号授权码。请用真机预览或体验版测试。";
}

async function ensureNewMiniappLogin() {
  if (uni.getStorageSync("token")) {
    return;
  }

  const loginResult: any = await new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: resolve,
      fail: reject,
    });
  });

  if (!loginResult?.code) {
    throw new Error("新版小程序登录失败，请重新进入迁移页");
  }

  const response = await request({
    url: "/auth/wechat-login",
    method: "POST",
    data: {
      code: loginResult.code,
      appId: getCurrentMiniProgramAppId(),
      userInfo: {},
    },
    suppressErrorToast: true,
  });

  saveLoginState(response.data);
}

async function handleGetPhoneNumber(event: any) {
  if (!migrationToken.value) {
    errorMessage.value = "缺少迁移凭证，请从旧版小程序重新进入。";
    return;
  }

  const detail = event?.detail || {};
  const code = detail.code;
  if (!code) {
    uni.showModal({
      title: "未获取到手机号",
      content: getPhoneAuthFailMessage(detail),
      showCancel: false,
      confirmText: "知道了",
    });
    return;
  }

  loading.value = true;
  try {
    await ensureNewMiniappLogin();
    const response = await request({
      url: "/auth/migration/verify-phone",
      method: "POST",
      data: {
        migrationToken: migrationToken.value,
        code,
        appId: getCurrentMiniProgramAppId(),
      },
      suppressErrorToast: true,
    });

    verifiedMigration.value = response.data;
    uni.showToast({ title: "请确认同步资料", icon: "none" });
  } catch (error: any) {
    errorMessage.value =
      error?.message || "迁移凭证已失效，请从旧版小程序重新进入。";
  } finally {
    loading.value = false;
  }
}

async function confirmMigration() {
  if (!migrationToken.value) return;

  loading.value = true;
  try {
    const response = await request({
      url: "/auth/migration/confirm",
      method: "POST",
      data: {
        migrationToken: migrationToken.value,
      },
      suppressErrorToast: true,
    });

    saveLoginState(response.data);
    uni.showModal({
      title: "同步完成",
      content: "旧版资料已同步到新版小程序，你可以继续查看订单、资料和售后。",
      showCancel: false,
      confirmText: "去首页",
      success: goHome,
    });
  } catch (error: any) {
    errorMessage.value = error?.message || "同步失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.migration-page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  background: #f6f7fb;
  box-sizing: border-box;
}

.panel {
  background: #fff;
  border-radius: 16rpx;
  padding: 44rpx 36rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.08);
}

.icon-shell {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #1677ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
  margin: 0 auto 28rpx;
}

.title {
  display: block;
  text-align: center;
  color: #1f2937;
  font-size: 40rpx;
  font-weight: 700;
  margin-bottom: 18rpx;
}

.desc {
  display: block;
  color: #667085;
  font-size: 28rpx;
  line-height: 1.7;
  margin-bottom: 36rpx;
}

.steps-card,
.history-card,
.notice-card {
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 32rpx;
}

.steps-card {
  background: #f0f7ff;
  border: 1rpx solid #b7d7ff;
}

.history-card {
  background: #fff7e6;
  border: 1rpx solid #ffd591;
}

.notice-card.error {
  background: #fff1f0;
  border: 1rpx solid #ffa39e;
}

.steps-title,
.step-line,
.history-title,
.history-line,
.history-tip,
.notice-title,
.notice-copy {
  display: block;
}

.steps-title {
  color: #155eef;
  font-weight: 700;
  font-size: 30rpx;
  margin-bottom: 12rpx;
}

.step-line,
.history-line,
.notice-copy {
  color: #344054;
  font-size: 26rpx;
  line-height: 1.8;
}

.history-title {
  color: #ad6800;
  font-weight: 700;
  font-size: 30rpx;
  margin-bottom: 12rpx;
}

.history-tip {
  color: #8c5a18;
  font-size: 24rpx;
  line-height: 1.6;
  margin-top: 12rpx;
}

.notice-title {
  color: #a8071a;
  font-weight: 700;
  font-size: 30rpx;
  margin-bottom: 12rpx;
}

.primary-btn,
.ghost-btn {
  width: 100%;
  height: 88rpx;
  border-radius: 10rpx;
  font-size: 30rpx;
  margin-top: 20rpx;
}

.primary-btn {
  background: #1677ff;
  color: #fff;
}

.ghost-btn {
  background: #fff;
  color: #1677ff;
  border: 2rpx solid #1677ff;
}
</style>
