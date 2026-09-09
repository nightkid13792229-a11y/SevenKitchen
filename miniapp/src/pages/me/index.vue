<template>
  <view class="me-container">
    <!-- 未登录状态 -->
    <view v-if="!isLoggedIn" class="not-logged-in">
      <image
        class="login-avatar"
        src="/static/user-avatar-default.png"
        mode="aspectFill"
      ></image>
      <text class="login-title">未登录</text>
      <button class="login-btn" @tap="goToLogin">立即登录</button>

      <view class="benefits-section">
        <text class="benefits-title">登录后可享受：</text>
        <view class="benefit-item">创建狗狗档案</view>
        <view class="benefit-item">个性化定制食谱</view>
        <view class="benefit-item">在线下单购买</view>
        <view class="benefit-item">查看订单状态</view>
      </view>
    </view>

    <!-- 已登录状态 -->
    <view v-else class="logged-in">
      <view v-if="customerTestModeActive" class="customer-test-banner">
        <text class="customer-test-title">当前为普通用户测试模式</text>
        <text class="customer-test-action" @tap="exitCustomerTestMode">退出</text>
      </view>

      <view
        v-if="!userInfo.phone"
        class="phone-bind-alert"
        @tap="goToPhoneBind"
      >
        <view>
          <text class="phone-bind-title">请尽快绑定手机号</text>
          <text class="phone-bind-desc"
            >绑定后可同步历史订单、宠物资料和售后记录。</text
          >
        </view>
        <text class="phone-bind-action">去绑定</text>
      </view>

      <view class="user-profile-section" @tap="editProfile">
        <image
          class="user-avatar"
          :src="resolveUserAvatarSrc(userInfo.avatarUrl)"
          mode="aspectFill"
        ></image>
        <text class="user-nickname">{{ userInfo.nickname || "用户" }}</text>
        <text class="edit-hint">点击编辑资料</text>
      </view>

      <view class="mall-section">
        <view class="mall-section-header">
          <text class="mall-section-title">我的商城</text>
          <text class="mall-section-link" @tap="goToOrders('ALL')"
            >全部订单</text
          >
        </view>
        <view class="mall-shortcuts">
          <view
            class="mall-shortcut mall-shortcut-production"
            @tap="goToOrders('IN_PROGRESS')"
          >
            <text v-if="orderCounts.inProgress > 0" class="shortcut-badge">{{
              orderCounts.inProgress
            }}</text>
            <view class="shortcut-icon-shell">
              <image
                class="shortcut-icon-image"
                src="/static/ui-icons/production.png"
                mode="aspectFit"
              />
            </view>
            <text class="shortcut-text">制作中</text>
          </view>
          <view
            class="mall-shortcut mall-shortcut-payment"
            @tap="goToOrders('PENDING_PAYMENT')"
          >
            <text
              v-if="orderCounts.pendingPayment > 0"
              class="shortcut-badge"
              >{{ orderCounts.pendingPayment }}</text
            >
            <view class="shortcut-icon-shell">
              <image
                class="shortcut-icon-image"
                src="/static/mall/payment.png"
                mode="aspectFit"
              />
            </view>
            <text class="shortcut-text">待付款</text>
          </view>
          <view
            class="mall-shortcut mall-shortcut-shipping"
            @tap="goToOrders('WAIT_RECEIVE')"
          >
            <text v-if="orderCounts.waitReceive > 0" class="shortcut-badge">{{
              orderCounts.waitReceive
            }}</text>
            <view class="shortcut-icon-shell">
              <image
                class="shortcut-icon-image"
                src="/static/mall/shipping.png"
                mode="aspectFit"
              />
            </view>
            <text class="shortcut-text">待收货</text>
          </view>
          <view
            class="mall-shortcut mall-shortcut-received"
            @tap="goToOrders('RECEIVED')"
          >
            <text v-if="orderCounts.received > 0" class="shortcut-badge">{{
              orderCounts.received
            }}</text>
            <view class="shortcut-icon-shell">
              <image
                class="shortcut-icon-image"
                src="/static/mall/received.png"
                mode="aspectFit"
              />
            </view>
            <text class="shortcut-text">已收货</text>
          </view>
          <view
            class="mall-shortcut mall-shortcut-aftersale"
            @tap="goToOrders('AFTERSALE')"
          >
            <text v-if="orderCounts.aftersale > 0" class="shortcut-badge">{{
              orderCounts.aftersale
            }}</text>
            <view class="shortcut-icon-shell">
              <image
                class="shortcut-icon-image"
                src="/static/mall/aftersale.png"
                mode="aspectFit"
              />
            </view>
            <text class="shortcut-text">售后中</text>
          </view>
        </view>
      </view>

      <!-- 基本信息板块 -->
      <view class="info-section">
        <view class="section-header">基本信息</view>

        <view class="info-row" @tap="editNickname">
          <view class="info-label">用户昵称</view>
          <view class="info-value-wrapper">
            <text class="info-value">{{ userInfo.nickname || "未设置" }}</text>
            <text class="arrow">›</text>
          </view>
        </view>

        <view class="info-row" @tap="editPhone">
          <view class="info-label">手机号</view>
          <view class="info-value-wrapper">
            <text class="info-value">{{ userInfo.phone || "未设置" }}</text>
            <text class="arrow">›</text>
          </view>
        </view>

        <view class="info-row" @tap="handleTestIdentityHiddenTap">
          <view class="info-label">账户ID</view>
          <view class="info-value-wrapper">
            <text class="info-value info-id">{{ userInfo.id }}</text>
          </view>
        </view>
      </view>

      <!-- 功能列表 -->
      <view class="function-list">
        <view class="function-item" @tap="goToDogList">
          <text class="function-text">我的狗狗</text>
          <text class="function-count">({{ userInfo.dogCount || 0 }}只)</text>
        </view>

        <view class="function-item" @tap="goToOrderList">
          <text class="function-text">我的订单</text>
          <text class="function-count">({{ userInfo.orderCount || 0 }}笔)</text>
        </view>

        <view class="function-item" @tap="goToAddressList">
          <text class="function-text">收货地址</text>
          <text class="function-count">({{ userInfo.addressCount || 0 }}个)</text>
        </view>

        <view class="function-item" @tap="goToDiySheetList">
          <text class="function-text">我的制作单</text>
          <text class="function-count"
            >({{ userInfo.diySheetCount || 0 }}张)</text
          >
        </view>

        <view class="function-item" @tap="goToFavoriteRecipes">
          <text class="function-text">收藏的食谱</text>
          <text class="function-count"
            >({{ userInfo.favoriteRecipeCount || 0 }}个)</text
          >
        </view>

        <view class="function-item" @tap="goToRecipeDesigner">
          <text class="function-text">食谱设计</text>
        </view>

        <view class="function-item" @tap="goToFeedback">
          <text class="function-text">建议反馈</text>
        </view>

      </view>

      <view v-if="testIdentityPanelVisible" class="test-identity-panel">
        <view class="section-header">测试身份</view>
        <view class="test-identity-body">
          <text class="test-identity-status">
            {{ customerTestModeActive ? "当前为普通用户测试模式" : "当前为管理员模式" }}
          </text>
          <button
            v-if="!customerTestModeActive"
            class="test-identity-btn"
            @tap="enterCustomerTestMode"
          >
            进入普通用户测试模式
          </button>
          <button
            v-else
            class="test-identity-btn secondary"
            @tap="exitCustomerTestMode"
          >
            退出普通用户测试模式
          </button>
          <button
            v-if="!customerTestModeActive"
            class="test-identity-btn danger"
            @tap="resetCustomerTestModeData"
          >
            重置测试用户数据
          </button>
        </view>
      </view>

      <!-- 退出登录 -->
      <view class="logout-section">
        <button class="logout-btn" @tap="handleLogout">退出登录</button>
      </view>
    </view>

    <!-- Loading -->
    <view v-if="isLoading" class="loading-overlay">
      <text class="loading-text">加载中...</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getToken, clearToken, request } from "../../utils/api";
import { resolveUserAvatarSrc } from "../../utils/user-profile";
import { refreshCurrentTabBar } from '../../utils/tabbar';
import { ensurePhoneBound } from "../../utils/account";
import {
  applyCustomerTestModeSession,
  getCustomerTestModeState,
  restoreAdminSessionFromCustomerTestMode,
} from "../../utils/customer-test-mode";

interface UserInfo {
  id: string;
  phone?: string;
  nickname?: string;
  avatarUrl?: string;
  role: string;
  dogCount: number;
  orderCount: number;
  addressCount: number;
  diySheetCount: number;
  favoriteRecipeCount: number;
}

const isLoggedIn = ref(false);
const isLoading = ref(false);
const userInfo = ref<UserInfo>({
  id: "",
  role: "CUSTOMER",
  dogCount: 0,
  orderCount: 0,
  addressCount: 0,
  diySheetCount: 0,
  favoriteRecipeCount: 0,
});

const orderCounts = ref({
  pendingPayment: 0,
  inProgress: 0,
  waitReceive: 0,
  received: 0,
  aftersale: 0,
});
const testIdentityPanelVisible = ref(false);
const customerTestModeActive = ref(false);

// 标志位：防止更新后立即重新加载
let isJustUpdated = false;
let updateTimer: NodeJS.Timeout | null = null;
let testIdentityTapCount = 0;
let testIdentityTapTimer: ReturnType<typeof setTimeout> | null = null;

function refreshCustomerTestModeState() {
  customerTestModeActive.value = getCustomerTestModeState().active;
}

function canUseTestIdentityPanel() {
  return userInfo.value.role === "ADMIN" || customerTestModeActive.value;
}

function handleTestIdentityHiddenTap() {
  if (!canUseTestIdentityPanel()) return;

  testIdentityTapCount += 1;
  if (testIdentityTapTimer) {
    clearTimeout(testIdentityTapTimer);
  }
  testIdentityTapTimer = setTimeout(() => {
    testIdentityTapCount = 0;
    testIdentityTapTimer = null;
  }, 1500);

  if (testIdentityTapCount >= 5) {
    testIdentityPanelVisible.value = true;
    testIdentityTapCount = 0;
  }
}

// 加载用户信息
async function loadUserInfo() {
  // 如果刚刚更新过，跳过这次加载
  if (isJustUpdated) {
    return;
  }

  isLoading.value = true;
  try {
    const res = await request({
      url: "/users/me",
      method: "GET",
    });

    console.log("[Me Page] API Response:", res);
    console.log("[Me Page] res.data:", res.data);

    if (res.code === 0 && res.data) {
      userInfo.value = res.data;
      console.log("[Me Page] userInfo.value after update:", userInfo.value);
      console.log("[Me Page] nickname:", userInfo.value.nickname);
      console.log("[Me Page] avatarUrl:", userInfo.value.avatarUrl);
      isLoggedIn.value = true;
    } else {
      // 未登录或加载失败
      isLoggedIn.value = false;
    }
  } catch (error) {
    console.error("加载用户信息失败:", error);
    isLoggedIn.value = false;
  } finally {
    isLoading.value = false;
  }
}

async function loadOrderCounts() {
  try {
    const res = await request({
      url: "/orders",
      method: "GET",
      quiet: true,
      suppressErrorToast: true,
    } as any);

    const orders = Array.isArray(res.data) ? res.data : [];
    orderCounts.value = {
      pendingPayment: orders.filter(
        (order: any) => order.status === "PENDING_PAYMENT",
      ).length,
      inProgress: orders.filter((order: any) =>
        ["PAID", "PURCHASING", "IN_PRODUCTION", "FREEZING"].includes(
          order.status,
        ),
      ).length,
      waitReceive: orders.filter((order: any) => order.status === "SHIPPED")
        .length,
      received: orders.filter((order: any) => order.status === "COMPLETED")
        .length,
      aftersale: orders.filter((order: any) => order.status === "AFTERSALE")
        .length,
    };
  } catch (error) {
    console.warn("[Me Page] Load order counts failed:", error);
  }
}

// 跳转登录页
function goToLogin() {
  uni.navigateTo({
    url: "/pages/login/index",
  });
}

// 跳转狗狗列表
async function goToDogList() {
  if (!(await ensurePhoneBound())) return;
  uni.navigateTo({
    url: "/pages/dog-profile-list/index",
  });
}

// 跳转订单列表
function goToOrderList() {
  uni.navigateTo({
    url: '/pages/orders-list/index'
  })
}

// 跳转地址列表
function goToAddressList() {
  uni.navigateTo({
    url: '/pages/address-list/index'
  })
}

// 跳转我的制作单列表
async function goToDiySheetList() {
  if (!(await ensurePhoneBound())) return;
  uni.navigateTo({
    url: "/pages/diy-sheet-list/index",
  });
}

// 跳转收藏的食谱列表
async function goToFavoriteRecipes() {
  if (!(await ensurePhoneBound())) return;
  uni.navigateTo({
    url: "/pages/favorite-recipes/index",
  });
}

async function goToRecipeDesigner() {
  if (!(await ensurePhoneBound())) return;
  uni.navigateTo({
    url: "/pages/recipe-designer/list",
  });
}

async function goToFeedback() {
  if (!(await ensurePhoneBound())) return;
  uni.navigateTo({
    url: "/pages/feedback-list/index",
  });
}

async function goToOrders(status = "ALL") {
  if (!(await ensurePhoneBound())) return;
  uni.navigateTo({
    url: `/pages/orders-list/index?status=${encodeURIComponent(status)}`,
  });
}

// 编辑资料（头像和昵称）
function editProfile() {
  uni.navigateTo({
    url: "/pages/profile-setup/index",
  });
}

// 编辑昵称
function editNickname() {
  uni.showModal({
    title: "修改昵称",
    editable: true,
    placeholderText: userInfo.value.nickname || "请输入昵称",
    success: async (res) => {
      if (res.confirm && res.content) {
        const nickname = res.content.trim();
        if (nickname.length < 1 || nickname.length > 20) {
          uni.showToast({
            title: "昵称长度必须在1-20个字符之间",
            icon: "none",
          });
          return;
        }

        await updateUserInfo({ nickname });
      }
    },
  });
}

// 编辑手机号
function editPhone() {
  goToPhoneBind();
}

function goToPhoneBind() {
  uni.navigateTo({
    url: "/pages/phone-bind/index?redirect=%2Fpages%2Fme%2Findex",
  });
}

async function enterCustomerTestMode() {
  isLoading.value = true;
  try {
    const res = await request({
      url: "/admin/test-identity/customer-mode",
      method: "POST",
    });
    if (res.code !== 0 || !res.data?.token || !res.data?.user) {
      throw new Error(res.message || "进入测试模式失败");
    }
    applyCustomerTestModeSession({
      token: res.data.token,
      user: res.data.user,
    });
    uni.showToast({ title: "已进入普通用户测试模式", icon: "success" });
    setTimeout(() => {
      uni.switchTab({ url: "/pages/home/index" });
    }, 500);
  } catch (error: any) {
    uni.showToast({
      title: error?.message || "进入测试模式失败",
      icon: "none",
    });
  } finally {
    isLoading.value = false;
  }
}

function exitCustomerTestMode() {
  const restored = restoreAdminSessionFromCustomerTestMode();
  if (!restored) {
    clearToken();
    uni.showToast({ title: "请重新登录管理员账号", icon: "none" });
    return;
  }
  uni.showToast({ title: "已恢复管理员身份", icon: "success" });
  setTimeout(() => {
    uni.switchTab({ url: "/pages/home/index" });
  }, 500);
}

async function resetCustomerTestModeData() {
  uni.showModal({
    title: "重置测试数据",
    content: "只会清理固定普通用户测试号的食谱设计数据，确定继续吗？",
    confirmText: "重置",
    confirmColor: "#d92d20",
    success: async (modalResult) => {
      if (!modalResult.confirm) return;
      isLoading.value = true;
      try {
        const res = await request({
          url: "/admin/test-identity/customer-mode/reset",
          method: "POST",
        });
        if (res.code !== 0) {
          throw new Error(res.message || "重置失败");
        }
        uni.showToast({ title: "已重置测试数据", icon: "success" });
      } catch (error: any) {
        uni.showToast({
          title: error?.message || "重置失败",
          icon: "none",
        });
      } finally {
        isLoading.value = false;
      }
    },
  });
}

// 更新用户信息
async function updateUserInfo(data: { nickname?: string; phone?: string }) {
  isLoading.value = true;
  try {
    const res = await request({
      url: "/users/me",
      method: "PUT",
      data,
    });

    if (res.code === 0) {
      // 使用后端返回的完整用户信息更新本地状态
      userInfo.value = res.data;

      // 设置标志位，防止 onShow 触发的 loadUserInfo 覆盖刚更新的数据
      isJustUpdated = true;

      // 清除之前的定时器
      if (updateTimer) {
        clearTimeout(updateTimer);
      }

      // 2秒后重置标志位，允许正常加载
      updateTimer = setTimeout(() => {
        isJustUpdated = false;
        updateTimer = null;
      }, 2000);

      uni.showToast({
        title: "更新成功",
        icon: "success",
      });
    } else {
      uni.showToast({
        title: res.message || "更新失败",
        icon: "none",
      });
    }
  } catch (error) {
    console.error("更新用户信息失败:", error);
    uni.showToast({
      title: "网络错误",
      icon: "none",
    });
  } finally {
    isLoading.value = false;
  }
}

// 退出登录
function handleLogout() {
  uni.showModal({
    title: "提示",
    content: "确定要退出登录吗？",
    success: (res) => {
      if (res.confirm) {
        clearToken();
        isLoggedIn.value = false;
        userInfo.value = {
          id: "",
          role: "CUSTOMER",
          dogCount: 0,
          orderCount: 0,
          addressCount: 0,
          diySheetCount: 0,
          favoriteRecipeCount: 0,
        };
        uni.showToast({
          title: "已退出登录",
          icon: "success",
        });

        // 退出登录后切换到首页tab
        setTimeout(() => {
          uni.switchTab({
            url: "/pages/home/index",
          });
        }, 500);
      }
    },
  });
}

onShow(() => {
  refreshCurrentTabBar();
  refreshCustomerTestModeState();

  // 检查登录状态（每次显示页面时都会执行）
  const token = getToken();
  if (token) {
    loadUserInfo();
    loadOrderCounts();
  } else {
    isLoggedIn.value = false;
  }
});
</script>

<style scoped>
.me-container {
  min-height: 100vh;
  background: #f0f3e9;
  padding-bottom: 120rpx; /* 避开底部导航栏 */
}

/* ===== 提示条（12rpx 徽章圆角档） ===== */
.phone-bind-alert {
  margin: 24rpx;
  padding: 24rpx;
  border-radius: 12rpx;
  background: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.customer-test-banner {
  margin: 24rpx;
  padding: 22rpx 24rpx;
  border-radius: 12rpx;
  background: #f8e8e2;
  border: 1rpx solid rgba(180, 85, 63, 0.35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.customer-test-title {
  color: #a04a35;
  font-size: 28rpx;
  font-weight: 700;
}

.customer-test-action {
  flex-shrink: 0;
  color: #b4553f;
  font-size: 26rpx;
  font-weight: 700;
}

.phone-bind-title,
.phone-bind-desc {
  display: block;
}

.phone-bind-title {
  color: #8a6b33;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.phone-bind-desc {
  color: #8d7547;
  font-size: 24rpx;
  line-height: 1.5;
}

.phone-bind-action {
  flex-shrink: 0;
  color: #b08d4f;
  font-size: 26rpx;
  font-weight: 700;
}

/* ===== 未登录状态 ===== */
.not-logged-in {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 120rpx;
}

.login-avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  display: block;
  margin-bottom: 32rpx;
  box-shadow: 0 12rpx 28rpx rgba(30, 58, 47, 0.18);
}

.login-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #26261f;
  margin-bottom: 48rpx;
}

.login-btn {
  width: 600rpx;
  height: 88rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.6);
  color: #f3eddd;
  border-radius: 44rpx;
  font-size: 32rpx;
  margin-bottom: 80rpx;
}

.benefits-section {
  width: 600rpx;
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  border-radius: 28rpx;
  padding: 40rpx;
}

.benefits-title {
  font-size: 28rpx;
  color: #968f6d;
  margin-bottom: 24rpx;
  display: block;
}

.benefit-item {
  font-size: 28rpx;
  color: #26261f;
  line-height: 48rpx;
}

/* ===== 已登录状态 ===== */
.user-profile-section {
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: 28rpx;
  margin: 24rpx;
  padding: 44rpx 32rpx 38rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 14rpx 36rpx rgba(20, 41, 31, 0.24);
}

.user-avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 80rpx;
  margin-bottom: 24rpx;
  background-color: #24493a;
  border: 3rpx solid rgba(216, 188, 133, 0.85);
}

.user-nickname {
  font-size: 32rpx;
  font-weight: 500;
  color: #f3eddd;
  margin-bottom: 8rpx;
}

.edit-hint {
  font-size: 24rpx;
  color: rgba(243, 237, 221, 0.62);
}

/* ===== 卡片通用（微绿白 + 暖绿边，28rpx 圆角） ===== */
.info-section,
.function-list,
.test-identity-panel {
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  border-radius: 28rpx;
  margin: 0 24rpx 24rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.mall-section {
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  border-radius: 28rpx;
  margin: 0 24rpx 24rpx;
  padding: 34rpx 24rpx 38rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.mall-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 34rpx;
}

.mall-section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.mall-section-link {
  font-size: 24rpx;
  color: #b08d4f;
}

.mall-shortcuts {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8rpx;
}

.mall-shortcut {
  position: relative;
  min-height: 172rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
}

.shortcut-icon-shell {
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 28rpx;
  background: linear-gradient(160deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  box-shadow: 0 10rpx 22rpx rgba(30, 58, 47, 0.2);
}

.shortcut-icon-image {
  width: 88rpx;
  height: 88rpx;
  display: block;
}

.shortcut-text {
  font-size: 25rpx;
  font-weight: 600;
  color: #26261f;
  white-space: nowrap;
}

.shortcut-badge {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  min-width: 30rpx;
  height: 30rpx;
  padding: 0 8rpx;
  border-radius: 18rpx;
  background: #b4553f;
  color: #fff;
  font-size: 20rpx;
  line-height: 30rpx;
  text-align: center;
}

.section-header {
  padding: 24rpx 32rpx;
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
  border-bottom: 1rpx solid #ecefe0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #ecefe0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 28rpx;
  color: #6b6653;
}

.info-value-wrapper {
  display: flex;
  align-items: center;
}

.info-value {
  font-size: 28rpx;
  color: #26261f;
  margin-right: 8rpx;
}

.info-id {
  font-size: 24rpx;
  color: #968f6d;
}

.arrow {
  font-size: 32rpx;
  color: #b08d4f;
}

.test-identity-body {
  padding: 28rpx 32rpx 34rpx;
}

.test-identity-status {
  display: block;
  margin-bottom: 22rpx;
  color: #6b6653;
  font-size: 26rpx;
}

.test-identity-btn {
  width: 100%;
  height: 76rpx;
  margin-top: 18rpx;
  border-radius: 12rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  color: #f3eddd;
  font-size: 28rpx;
  font-weight: 700;
}

.test-identity-btn.secondary {
  background: #6b6653;
  border: 1rpx solid #dde3cd;
}

.test-identity-btn.danger {
  background: #fbfcf7;
  color: #b4553f;
  border: 1rpx solid rgba(180, 85, 63, 0.4);
}

.function-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  border-bottom: 1rpx solid #ecefe0;
}

.function-item:last-child {
  border-bottom: none;
}

.function-text {
  flex: 1;
  font-size: 28rpx;
  color: #26261f;
}

.function-count {
  font-size: 24rpx;
  color: #968f6d;
}

.logout-section {
  padding: 8rpx 32rpx 40rpx;
}

.logout-btn {
  width: 100%;
  height: 88rpx;
  background: #fbfcf7;
  color: #b4553f;
  border: 1rpx solid rgba(180, 85, 63, 0.5);
  border-radius: 44rpx;
  font-size: 32rpx;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.loading-text {
  color: #fff;
  font-size: 28rpx;
}
</style>
