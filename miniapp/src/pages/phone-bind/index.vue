<template>
  <view class="phone-bind-page">
    <view class="panel">
      <view class="icon-shell">手机</view>
      <text class="title">绑定手机号</text>
      <text class="desc">
        手机号仅用于账号识别、历史资料同步、订单履约和售后服务。绑定后可同步旧小程序资料，并继续使用下单、支付、订单和售后功能。
      </text>

      <view v-if="pendingMerge" class="history-card">
        <text class="history-title">发现历史资料</text>
        <text class="history-line">手机号：{{ pendingMerge.phone }}</text>
        <text class="history-line"
          >历史订单：{{ pendingMerge.targetUser.orderCount || 0 }} 个</text
        >
        <text class="history-line"
          >狗狗资料：{{ pendingMerge.targetUser.dogCount || 0 }} 只</text
        >
        <text class="history-line"
          >收货地址：{{ pendingMerge.targetUser.addressCount || 0 }} 个</text
        >
        <text class="history-tip"
          >确认后会把当前登录身份绑定到这份历史资料上。</text
        >
      </view>

      <button
        v-if="!pendingMerge"
        class="primary-btn"
        open-type="getPhoneNumber"
        :disabled="loading"
        @getphonenumber="handleGetPhoneNumber"
      >
        {{ loading ? "绑定中..." : "微信授权手机号" }}
      </button>

      <button
        v-if="pendingMerge"
        class="primary-btn"
        :disabled="loading"
        @tap="confirmMerge"
      >
        {{ loading ? "同步中..." : "确认同步历史资料" }}
      </button>

      <button
        v-if="pendingMerge"
        class="ghost-btn"
        :disabled="loading"
        @tap="cancelMerge"
      >
        暂不合并，重新选择
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
const redirectUrl = ref("/pages/home/index");
const pendingMerge = ref<any | null>(null);

onLoad((options: any) => {
  if (options?.redirect) {
    redirectUrl.value = decodeURIComponent(options.redirect);
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

function goAfterBound() {
  const target = redirectUrl.value || "/pages/home/index";
  const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
  const tabPages = [
    "/pages/home/index",
    "/pages/staff-workbench/index",
    "/pages/me/index",
  ];
  const matchedTab = tabPages.find((page) => normalizedTarget.startsWith(page));
  if (matchedTab) {
    uni.switchTab({ url: matchedTab });
    return;
  }

  uni.redirectTo({
    url: normalizedTarget,
    fail: () => uni.switchTab({ url: "/pages/home/index" }),
  });
}

async function handleGetPhoneNumber(event: any) {
  const code = event?.detail?.code;
  if (!code) {
    uni.showToast({ title: "需要授权手机号后才能绑定", icon: "none" });
    return;
  }

  loading.value = true;
  try {
    const response = await request({
      url: "/auth/bind-phone",
      method: "POST",
      data: {
        code,
        appId: getCurrentMiniProgramAppId(),
      },
    });

    if (response.data?.status === "NEEDS_CONFIRMATION") {
      pendingMerge.value = response.data;
      uni.showToast({ title: "发现历史资料，请确认", icon: "none" });
      return;
    }

    saveLoginState(response.data);
    uni.showToast({ title: "绑定成功", icon: "success" });
    setTimeout(goAfterBound, 500);
  } catch (error: any) {
    uni.showToast({ title: error?.message || "绑定失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

async function confirmMerge() {
  if (!pendingMerge.value?.mergeToken) return;

  loading.value = true;
  try {
    const response = await request({
      url: "/auth/confirm-phone-merge",
      method: "POST",
      data: {
        mergeToken: pendingMerge.value.mergeToken,
      },
    });

    saveLoginState(response.data);
    pendingMerge.value = null;
    uni.showToast({ title: "历史资料已同步", icon: "success" });
    setTimeout(goAfterBound, 600);
  } catch (error: any) {
    uni.showToast({ title: error?.message || "同步失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

function cancelMerge() {
  pendingMerge.value = null;
}
</script>

<style scoped>
.phone-bind-page {
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
  font-size: 28rpx;
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

.history-card {
  background: #fff7e6;
  border: 1rpx solid #ffd591;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 32rpx;
}

.history-title,
.history-line,
.history-tip {
  display: block;
}

.history-title {
  color: #ad6800;
  font-weight: 700;
  font-size: 30rpx;
  margin-bottom: 12rpx;
}

.history-line {
  color: #5f370e;
  font-size: 26rpx;
  line-height: 1.7;
}

.history-tip {
  color: #8c5a18;
  font-size: 24rpx;
  line-height: 1.6;
  margin-top: 12rpx;
}

.primary-btn,
.ghost-btn,
.text-btn {
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

.text-btn {
  background: transparent;
  color: #667085;
}
</style>
