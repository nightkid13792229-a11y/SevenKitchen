<template>
  <view class="phone-bind-page">
    <view class="panel">
      <view class="icon-shell">迁移</view>
      <text class="title">填写迁移手机号</text>
      <text class="desc">
        旧版小程序只保留资料迁移入口。手机号仅用于身份核验和资料迁移确认，不用于营销或其他无关用途。确认前不会自动同步资料。
      </text>

      <view class="form-card">
        <view class="form-item">
          <text class="form-label">手机号</text>
          <input
            class="form-input"
            type="number"
            maxlength="11"
            v-model="phone"
            placeholder="请输入手机号"
          />
        </view>
        <view class="form-item">
          <text class="form-label">再次确认手机号</text>
          <input
            class="form-input"
            type="number"
            maxlength="11"
            v-model="phoneConfirm"
            placeholder="请再次输入手机号"
          />
        </view>
      </view>

      <view class="steps-card">
        <text class="steps-title">迁移流程</text>
        <text class="step-line">1. 在旧版填写手机号，作为历史资料匹配线索</text>
        <text class="step-line">2. 打开微信搜索新版小程序：赛文的食堂</text>
        <text class="step-line">3. 在新版授权同一个手机号并二次确认同步</text>
      </view>

      <button class="primary-btn" :disabled="loading" @tap="submitMigrationPhone">
        {{ loading ? "提交中..." : "提交手机号并查看下一步" }}
      </button>

      <button class="ghost-btn" :disabled="loading" @tap="goHome">
        稍后再说
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { request } from "../../utils/api";
import { getCurrentMiniProgramAppId } from "../../utils/account";
import {
  showNoLegacyDataPrompt,
  showMigrationCompletedPrompt,
} from "../../utils/legacy-migration";

const NEW_MINIAPP_NAME = "赛文的食堂";

const loading = ref(false);
const phone = ref("");
const phoneConfirm = ref("");

function goHome() {
  uni.switchTab({ url: "/pages/home/index" });
}

function normalizePhone(value: string) {
  return String(value || "").replace(/\s+/g, "");
}

function validatePhone() {
  const first = normalizePhone(phone.value);
  const second = normalizePhone(phoneConfirm.value);
  if (!/^1[3-9]\d{9}$/.test(first)) {
    uni.showToast({ title: "请输入正确的手机号", icon: "none" });
    return null;
  }
  if (first !== second) {
    uni.showToast({ title: "两次输入的手机号不一致", icon: "none" });
    return null;
  }
  return first;
}

function showNextStep(maskedPhone?: string) {
  uni.showModal({
    title: "手机号已提交",
    content: `已记录手机号${maskedPhone ? ` ${maskedPhone}` : ""}。请退出旧版小程序，在微信搜索“${NEW_MINIAPP_NAME}”，进入新版后授权同一个手机号并确认同步历史资料。`,
    confirmText: "复制名称",
    cancelText: "知道了",
    success: (res) => {
      if (res.confirm) {
        uni.setClipboardData({
          data: NEW_MINIAPP_NAME,
          success: () => {
            uni.showToast({ title: "已复制新版名称", icon: "success" });
          },
        });
      }
    },
  });
}

async function submitMigrationPhone() {
  const normalizedPhone = validatePhone();
  if (!normalizedPhone) return;

  if (!uni.getStorageSync("token")) {
    uni.showModal({
      title: "请先登录",
      content: "迁移旧版资料前，需要先完成旧版小程序登录。",
      confirmText: "去登录",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          uni.redirectTo({ url: "/pages/login/index" });
        }
      },
    });
    return;
  }

  loading.value = true;
  try {
    const response = await request({
      url: "/auth/migration/start",
      method: "POST",
      data: {
        appId: getCurrentMiniProgramAppId(),
        phone: normalizedPhone,
      },
      suppressErrorToast: true,
    });

    if (
      response.data?.alreadyMigrated ||
      response.data?.legacyMigrationCompleted ||
      response.data?.status === "CONFIRMED"
    ) {
      if (
        response.data?.noSyncableSourceData ||
        response.data?.legacyMigration?.noSyncableData
      ) {
        await showNoLegacyDataPrompt();
        return;
      }
      await showMigrationCompletedPrompt();
      return;
    }

    showNextStep(response.data?.phone);
  } catch (error: any) {
    uni.showModal({
      title: "暂时无法提交",
      content: error?.message || "手机号提交失败，请稍后重试。",
      showCancel: false,
      confirmText: "知道了",
    });
  } finally {
    loading.value = false;
  }
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
  margin-bottom: 32rpx;
}

.form-card,
.steps-card {
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 28rpx;
}

.form-card {
  background: #fff;
  border: 1rpx solid #e5e7eb;
}

.form-item + .form-item {
  margin-top: 24rpx;
}

.form-label {
  display: block;
  color: #344054;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}

.form-input {
  height: 84rpx;
  padding: 0 22rpx;
  border-radius: 10rpx;
  background: #f8fafc;
  border: 1rpx solid #d0d5dd;
  color: #111827;
  font-size: 30rpx;
  box-sizing: border-box;
}

.steps-card {
  background: #f0f7ff;
  border: 1rpx solid #b7d7ff;
}

.steps-title,
.step-line {
  display: block;
}

.steps-title {
  color: #155eef;
  font-weight: 700;
  font-size: 30rpx;
  margin-bottom: 12rpx;
}

.step-line {
  color: #344054;
  font-size: 26rpx;
  line-height: 1.8;
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
