<template>
  <view class="me-container">
    <!-- 未登录状态 -->
    <view v-if="!isLoggedIn" class="not-logged-in">
      <view class="login-avatar">未登录</view>
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

      <!-- 用户头像区域 -->
      <view v-if="showLegacyMigrationEntry" class="legacy-migration-entry">
        <view class="legacy-migration-main">
          <text class="legacy-migration-title">旧版资料迁移</text>
          <text class="legacy-migration-desc"
            >已在旧版填写手机号后，可在这里授权同一手机号并同步历史资料。</text
          >
        </view>
        <view class="legacy-migration-actions">
          <button class="legacy-migration-action" @tap="goToLegacyMigration">
            去同步
          </button>
          <button
            class="legacy-migration-dismiss"
            @tap.stop="dismissLegacyMigrationPrompt"
          >
            不再提示
          </button>
        </view>
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
          <view class="mall-shortcut mall-shortcut-cart" @tap="goToCart">
            <text v-if="cartCount > 0" class="shortcut-badge">{{
              cartCount
            }}</text>
            <view class="shortcut-icon-shell">
              <image
                class="shortcut-icon-image"
                src="/static/mall/cart.png"
                mode="aspectFit"
              />
            </view>
            <text class="shortcut-text">购物车</text>
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

        <view class="info-row">
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
import { ref, computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getToken, clearToken, request } from "../../utils/api";
import { resolveUserAvatarSrc } from "../../utils/user-profile";
import { refreshCurrentTabBar } from "../../utils/tabbar";
import { getCartItems } from "../../utils/cart";
import { ensurePhoneBound } from "../../utils/account";

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
  waitReceive: 0,
  received: 0,
  aftersale: 0,
});
const cartCount = ref(0);
const legacyMigrationPromptHidden = ref(false);
const LEGACY_MIGRATION_PROMPT_VERSION = "20260523-2";

const getLegacyMigrationPromptStorageKey = () =>
  userInfo.value.id
    ? `legacy_migration_prompt_hidden:${LEGACY_MIGRATION_PROMPT_VERSION}:${userInfo.value.id}`
    : `legacy_migration_prompt_hidden:${LEGACY_MIGRATION_PROMPT_VERSION}`;

const showLegacyMigrationEntry = computed(
  () =>
    isLoggedIn.value &&
    Boolean(userInfo.value.phone) &&
    !legacyMigrationPromptHidden.value,
);

// 标志位：防止更新后立即重新加载
let isJustUpdated = false;
let updateTimer: NodeJS.Timeout | null = null;

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
      legacyMigrationPromptHidden.value =
        uni.getStorageSync(getLegacyMigrationPromptStorageKey()) === true;
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

function loadCartCount() {
  cartCount.value = getCartItems().length;
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

function goToCart() {
  uni.navigateTo({
    url: "/pages/cart/index",
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

function goToLegacyMigration() {
  uni.navigateTo({
    url: "/pages/migration/index",
  });
}

function dismissLegacyMigrationPrompt() {
  uni.showModal({
    title: "请慎重选择",
    content:
      "您正在关闭旧版资料同步迁移提示。这意味着本账号以后不会再主动提醒您同步旧版资料；如果后续发现历史资料没有同步，可以在客服协助下处理。若您已经知晓，请轻点“不再提示”永久关闭该提示。",
    confirmText: "不再提示",
    cancelText: "先保留",
    confirmColor: "#d92d20",
    success: (res) => {
      if (!res.confirm) return;
      legacyMigrationPromptHidden.value = true;
      uni.setStorageSync(getLegacyMigrationPromptStorageKey(), true);
      uni.showToast({
        title: "已关闭提示",
        icon: "success",
      });
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

  // 检查登录状态（每次显示页面时都会执行）
  const token = getToken();
  if (token) {
    loadUserInfo();
    loadOrderCounts();
    loadCartCount();
  } else {
    isLoggedIn.value = false;
    cartCount.value = 0;
  }
});
</script>

<style scoped>
.me-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx; /* 避开底部导航栏 */
}

.phone-bind-alert {
  margin: 24rpx;
  padding: 24rpx;
  border-radius: 12rpx;
  background: #fff7e6;
  border: 1rpx solid #ffd591;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.phone-bind-title,
.phone-bind-desc {
  display: block;
}

.phone-bind-title {
  color: #ad6800;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.phone-bind-desc {
  color: #8c5a18;
  font-size: 24rpx;
  line-height: 1.5;
}

.phone-bind-action {
  flex-shrink: 0;
  color: #1677ff;
  font-size: 26rpx;
  font-weight: 700;
}

.legacy-migration-entry {
  margin: 0 24rpx 24rpx;
  padding: 24rpx 26rpx;
  border-radius: 12rpx;
  background: #f7fbff;
  border: 1rpx solid #b7d7ff;
}

.legacy-migration-main {
  margin-bottom: 22rpx;
}

.legacy-migration-title,
.legacy-migration-desc {
  display: block;
}

.legacy-migration-title {
  color: #155eef;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.legacy-migration-desc {
  color: #344054;
  font-size: 24rpx;
  line-height: 1.5;
}

.legacy-migration-actions {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.legacy-migration-action,
.legacy-migration-dismiss {
  height: 58rpx;
  min-width: 144rpx;
  padding: 0 24rpx;
  border-radius: 29rpx;
  font-size: 25rpx;
  font-weight: 700;
  line-height: 58rpx;
}

.legacy-migration-action {
  background: #1677ff;
  color: #fff;
}

.legacy-migration-dismiss {
  background: #fff;
  color: #667085;
  border: 1rpx solid #d0d5dd;
}

/* 未登录状态 */
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
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #999;
  margin-bottom: 32rpx;
}

.login-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 48rpx;
}

.login-btn {
  width: 600rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  border: none;
  margin-bottom: 80rpx;
}

.benefits-section {
  width: 600rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
}

.benefits-title {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 24rpx;
  display: block;
}

.benefit-item {
  font-size: 28rpx;
  color: #333;
  line-height: 48rpx;
}

/* 已登录状态 */
.user-profile-section {
  background: #fff;
  padding: 40rpx 32rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.user-avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 80rpx;
  margin-bottom: 24rpx;
  background-color: #f5f5f5;
}

.user-nickname {
  font-size: 32rpx;
  font-weight: 500;
  color: #333;
  margin-bottom: 8rpx;
}

.edit-hint {
  font-size: 24rpx;
  color: #999;
}

.info-section {
  background: #fff;
  margin-top: 20rpx;
}

.mall-section {
  background: #fff;
  margin-top: 20rpx;
  padding: 34rpx 24rpx 38rpx;
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
  color: #333;
}

.mall-section-link {
  font-size: 24rpx;
  color: #1890ff;
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
  border-radius: 32rpx;
  background: #f6f7f9;
  box-shadow: 0 10rpx 22rpx rgba(31, 41, 51, 0.07);
}

.mall-shortcut-cart .shortcut-icon-shell {
  background: #fff3e8;
}

.mall-shortcut-payment .shortcut-icon-shell {
  background: #eaf4ff;
}

.mall-shortcut-shipping .shortcut-icon-shell {
  background: #f1efff;
}

.mall-shortcut-received .shortcut-icon-shell {
  background: #e9fff4;
}

.mall-shortcut-aftersale .shortcut-icon-shell {
  background: #fff1e8;
}

.shortcut-icon-image {
  width: 88rpx;
  height: 88rpx;
  display: block;
}

.shortcut-text {
  font-size: 25rpx;
  font-weight: 600;
  color: #2f3640;
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
  background: #ff4d4f;
  color: #fff;
  font-size: 20rpx;
  line-height: 30rpx;
  text-align: center;
}

.section-header {
  padding: 24rpx 32rpx;
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 28rpx;
  color: #666;
}

.info-value-wrapper {
  display: flex;
  align-items: center;
}

.info-value {
  font-size: 28rpx;
  color: #333;
  margin-right: 8rpx;
}

.info-id {
  font-size: 24rpx;
  color: #999;
}

.arrow {
  font-size: 32rpx;
  color: #999;
}

.function-list {
  background: #fff;
  margin-top: 20rpx;
}

.function-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.function-item:last-child {
  border-bottom: none;
}

.function-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.function-count {
  font-size: 24rpx;
  color: #999;
}

.logout-section {
  padding: 40rpx 32rpx;
}

.logout-btn {
  width: 100%;
  height: 88rpx;
  background: #fff;
  color: #ff4d4f;
  border: 1rpx solid #ff4d4f;
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
