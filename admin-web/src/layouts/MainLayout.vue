<template>
  <el-container class="main-layout">
    <el-aside width="224px" class="sidebar">
      <div class="logo">七号厨房后台</div>

      <div ref="searchWrapRef" class="sidebar-search">
        <el-input
          ref="searchInputRef"
          v-model="searchQuery"
          placeholder="搜索功能 / 订单 / 顾客"
          clearable
          @focus="searchOpen = true"
          @input="searchOpen = true"
          @keydown.enter.prevent="chooseFirstSearchResult"
          @keydown.esc="closeSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <div v-if="searchOpen && searchQuery.trim()" class="search-panel">
          <div v-if="searchResults.length === 0" class="search-empty">
            没找到。试试“订单”“退款”“档案”“FEDIAF”
          </div>
          <button
            v-for="item in searchResults"
            :key="item.key"
            type="button"
            class="search-item"
            :class="{ 'is-disabled': item.disabled }"
            @mousedown.prevent="chooseSearchItem(item)"
          >
            <el-icon class="search-item-icon">
              <component :is="item.icon" />
            </el-icon>
            <span class="search-item-label">{{ item.label }}</span>
            <span class="search-item-group">{{ item.groupLabel }}</span>
            <span v-if="item.disabled" class="search-item-soon">未启用</span>
          </button>
        </div>
      </div>

      <div class="sidebar-scroll">
        <div class="pinned-block">
          <div class="section-label">常用</div>
          <button
            v-for="item in pinnedMenuItems"
            :key="item.key"
            type="button"
            class="pin-item"
            :class="{ 'is-active': activeMenu === item.path }"
            @click="goTo(item)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </button>
        </div>

        <el-menu
          ref="menuRef"
          :default-active="activeMenu"
          :default-openeds="openedGroups"
          unique-opened
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409eff"
          class="sidebar-menu"
        >
          <el-menu-item :index="dashboardItem.path">
            <el-icon><component :is="dashboardItem.icon" /></el-icon>
            <span>{{ dashboardItem.label }}</span>
          </el-menu-item>

          <el-sub-menu
            v-for="group in adminMenuGroups"
            :key="group.key"
            :index="group.key"
          >
            <template #title>
              <el-icon><component :is="group.icon" /></el-icon>
              <span>{{ group.label }}</span>
              <span
                v-if="groupBadge(group)"
                class="menu-badge"
                :title="badgeTip(group.badgeKeys)"
              >
                {{ formatBadge(groupBadge(group)) }}
              </span>
            </template>

            <el-menu-item
              v-for="item in group.items"
              :key="item.key"
              :index="item.path"
              :disabled="item.disabled"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
              <span
                v-if="itemBadge(item)"
                class="menu-badge child-badge"
                :title="badgeTip(item.badgeKeys)"
              >
                {{ formatBadge(itemBadge(item)) }}
              </span>
              <el-tooltip
                v-if="item.disabled"
                :content="item.disabledTip || '功能还没上线'"
                placement="right"
              >
                <span class="soon-tag">未启用</span>
              </el-tooltip>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </div>

      <div class="sidebar-foot">
        <span>七号厨房 · 内部后台</span>
      </div>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-title">
          <el-breadcrumb v-if="breadcrumbs.length > 1" separator="/" class="breadcrumb">
            <el-breadcrumb-item
              v-for="(crumb, index) in breadcrumbs"
              :key="`${crumb.label}-${index}`"
              :to="crumb.to && index < breadcrumbs.length - 1 ? { path: crumb.to } : undefined"
            >
              {{ crumb.label }}
            </el-breadcrumb-item>
          </el-breadcrumb>
          <h2>{{ currentPageTitle }}</h2>
        </div>
        <div class="header-actions">
          <el-dropdown @command="handleCommand">
            <span class="user-dropdown">
              <el-icon><User /></el-icon>
              <span>管理员</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="changePassword">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog
      v-model="changePasswordVisible"
      title="修改密码"
      width="420px"
      :close-on-click-modal="false"
      @closed="resetChangePasswordForm"
    >
      <el-form
        ref="changePasswordFormRef"
        :model="changePasswordForm"
        :rules="changePasswordRules"
        label-width="90px"
        @keyup.enter="submitChangePassword"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input
            v-model="changePasswordForm.currentPassword"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="请输入当前密码"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="changePasswordForm.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="请输入新密码"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="changePasswordForm.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="请再次输入新密码"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="changePasswordVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="changePasswordLoading"
          @click="submitChangePassword"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api'
import { workbenchApi } from '@/api/workbench'
import {
  adminMenuGroups,
  dashboardItem,
  pinnedMenuItems,
  resolveActiveMenuPath,
  resolveMenuGroup,
  resolveMenuLocation,
  searchMenuItems,
  menuBadgeLabels,
  type AdminMenuGroup,
  type FlatMenuItem,
  type MenuBadgeKey,
} from '@/constants/adminMenu'
import { ArrowDown, Lock, Search, User } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const menuRef = ref<{ open: (index: string) => void }>()
const searchWrapRef = ref<HTMLElement>()
const searchInputRef = ref<{ focus: () => void }>()
const searchQuery = ref('')
const searchOpen = ref(false)
const openedGroups = ref<string[]>([])

const activeMenu = computed(() => resolveActiveMenuPath(route.path))
const currentLocation = computed(() => resolveMenuLocation(route.path))
const activeGroup = computed(() => resolveMenuGroup(currentLocation.value))

const currentPageTitle = computed(
  () => (route.meta.title as string) || currentLocation.value?.label || '后台管理',
)

interface BreadcrumbItem {
  label: string
  to?: string
}

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const item = currentLocation.value
  if (!item || item.groupKey === 'dashboard') {
    return [{ label: item?.label || currentPageTitle.value }]
  }

  const group = activeGroup.value
  const crumbs: BreadcrumbItem[] = [
    { label: group?.label || item.groupLabel, to: group?.items[0]?.path },
    { label: item.label, to: item.path },
  ]

  if (route.path !== item.path) {
    const title = String(route.meta.title || '')
    if (title && title !== item.label) crumbs.push({ label: title })
  } else if (item.key === 'dogs' && route.query.tab === 'breeds') {
    crumbs.push({ label: '品种' })
  }

  return crumbs
})

const searchResults = computed(() => searchMenuItems(searchQuery.value))

const badgeCounts = reactive<Record<MenuBadgeKey, number>>({
  orders: 0,
  supplementOrders: 0,
  production: 0,
  inventory: 0,
  purchasing: 0,
  reimbursement: 0,
})

let badgeTimer: ReturnType<typeof setInterval> | undefined

function sumBadge(keys?: MenuBadgeKey[]): number {
  if (!keys?.length) return 0
  return keys.reduce((sum, key) => sum + (badgeCounts[key] || 0), 0)
}

function groupBadge(group: AdminMenuGroup): number {
  return sumBadge(group.badgeKeys)
}

function itemBadge(item: { badgeKeys?: MenuBadgeKey[] }): number {
  return sumBadge(item.badgeKeys)
}

/** 悬停提示：说清这个数字由哪几件事组成，避免"只看到 1、不知道是哪一项" */
function badgeTip(keys?: MenuBadgeKey[]): string {
  if (!keys?.length) return ''
  return keys
    .map((key) => `${menuBadgeLabels[key]} ${badgeCounts[key] || 0}`)
    .join(' · ')
}

function formatBadge(count: number): string {
  return count > 99 ? '99+' : String(count)
}

async function loadBadges() {
  try {
    const data = await workbenchApi.summary()
    const badges = data?.badges
    badgeCounts.orders = badges?.orders || 0
    badgeCounts.supplementOrders = badges?.supplementOrders || 0
    badgeCounts.production = badges?.production || 0
    badgeCounts.inventory = badges?.inventory || 0
    badgeCounts.purchasing = badges?.purchasing || 0
    badgeCounts.reimbursement = badges?.reimbursement || 0
  } catch {
    // 角标只是锦上添花，接口不可用时不打扰用户
  }
}

function openGroupForCurrentRoute() {
  const key = activeGroup.value?.key
  openedGroups.value = key ? [key] : []
  if (!key) return
  nextTick(() => {
    menuRef.value?.open(key)
  })
}

watch(activeGroup, openGroupForCurrentRoute, { immediate: true })

function closeSearch() {
  searchOpen.value = false
}

function chooseSearchItem(item: FlatMenuItem) {
  if (item.disabled) {
    ElMessage.info(item.disabledTip || '功能还没上线')
    return
  }
  searchOpen.value = false
  searchQuery.value = ''
  router.push(item.path)
}

function chooseFirstSearchResult() {
  const first = searchResults.value.find((item) => !item.disabled)
  if (first) chooseSearchItem(first)
}

function goTo(item: FlatMenuItem) {
  if (item.disabled) {
    ElMessage.info(item.disabledTip || '功能还没上线')
    return
  }
  router.push(item.path)
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchOpen.value = true
    nextTick(() => searchInputRef.value?.focus())
  }
  if (event.key === 'Escape') closeSearch()
}

function onDocumentClick(event: MouseEvent) {
  if (!searchWrapRef.value) return
  if (!searchWrapRef.value.contains(event.target as Node)) closeSearch()
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('click', onDocumentClick)
  loadBadges()
  badgeTimer = setInterval(loadBadges, 60_000)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('click', onDocumentClick)
  if (badgeTimer) clearInterval(badgeTimer)
})

/* ---------- 修改密码 / 退出登录（保持原逻辑） ---------- */

const changePasswordVisible = ref(false)
const changePasswordLoading = ref(false)
const changePasswordFormRef = ref<FormInstance>()
const changePasswordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const validateConfirmPassword = (
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void,
) => {
  if (!value) {
    callback(new Error('请再次输入新密码'))
    return
  }
  if (value !== changePasswordForm.newPassword) {
    callback(new Error('两次输入的新密码不一致'))
    return
  }
  callback()
}

const changePasswordRules: FormRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 64, message: '新密码长度需为8-64位', trigger: 'blur' },
  ],
  confirmPassword: [
    { validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

const resetChangePasswordForm = () => {
  changePasswordForm.currentPassword = ''
  changePasswordForm.newPassword = ''
  changePasswordForm.confirmPassword = ''
  changePasswordFormRef.value?.clearValidate()
}

const openChangePasswordDialog = () => {
  changePasswordVisible.value = true
}

const submitChangePassword = async () => {
  if (!changePasswordFormRef.value) return

  try {
    await changePasswordFormRef.value.validate()
    changePasswordLoading.value = true
    await authApi.changePassword({
      currentPassword: changePasswordForm.currentPassword,
      newPassword: changePasswordForm.newPassword,
    })
    ElMessage.success('密码修改成功')
    changePasswordVisible.value = false
  } catch {
    // Form validation and API interceptor handle user-facing messages.
  } finally {
    changePasswordLoading.value = false
  }
}

const handleCommand = async (command: string) => {
  if (command === 'changePassword') {
    openChangePasswordDialog()
    return
  }

  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        type: 'warning',
      })
      userStore.clearToken()
      ElMessage.success('已退出登录')
      router.push('/login')
    } catch {
      // User cancelled
    }
  }
}
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

.sidebar {
  background-color: #304156;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 50px;
  line-height: 50px;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  background-color: #2b3a4b;
  flex: none;
}

.sidebar-search {
  position: relative;
  flex: none;
  padding: 10px 10px 6px;
  background: #304156;
  z-index: 20;
}

.sidebar-search :deep(.el-input__wrapper) {
  background: #1b2836;
  box-shadow: 0 0 0 1px #33475c inset;
  border-radius: 7px;
}

.sidebar-search :deep(.el-input__inner) {
  color: #dbe4ee;
  font-size: 12px;
}

.sidebar-search :deep(.el-input__inner::placeholder) {
  color: #8fa3b8;
}

.sidebar-search :deep(.el-input__prefix) {
  color: #8fa3b8;
}

.search-panel {
  position: absolute;
  top: 42px;
  left: 10px;
  right: 10px;
  max-height: 320px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  padding: 4px;
  z-index: 3000;
}

.search-empty {
  padding: 12px 10px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #303133;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.search-item:hover {
  background: #f2f6fc;
}

.search-item.is-disabled {
  color: #a8abb2;
  cursor: not-allowed;
}

.search-item-icon {
  color: #909399;
  flex: none;
}

.search-item-label {
  font-weight: 600;
}

.search-item-group {
  margin-left: auto;
  color: #b1b3b8;
  font-size: 11px;
}

.search-item-soon {
  color: #b1b3b8;
  font-size: 11px;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  padding: 0 4px;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
  scrollbar-width: thin;
}

.sidebar-scroll::-webkit-scrollbar {
  width: 5px;
}

.sidebar-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 3px;
}

.pinned-block {
  padding: 4px 8px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  margin-bottom: 4px;
}

.section-label {
  color: #7f8fa3;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 6px 8px;
}

.pin-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #c0c4cc;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.pin-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.pin-item.is-active {
  background: #1b4f86;
  color: #fff;
}

.sidebar-menu {
  border-right: none;
  background: transparent;
}

.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  height: 42px;
  line-height: 42px;
  font-size: 13px;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  background: #1b4f86;
  color: #fff;
}

.sidebar-menu :deep(.el-sub-menu .el-menu-item) {
  min-width: 0;
  padding-left: 44px !important;
}

.menu-badge {
  margin-left: auto;
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.child-badge {
  margin-left: auto;
  margin-right: 2px;
}

.soon-tag {
  margin-left: auto;
  padding: 0 4px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 3px;
  color: #8fa3b8;
  font-size: 10px;
  line-height: 16px;
}

.sidebar-foot {
  flex: none;
  height: 30px;
  line-height: 30px;
  padding: 0 12px;
  color: #6f8096;
  font-size: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 64px;
}

.header-title {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.breadcrumb {
  font-size: 12px;
  line-height: 18px;
}

.breadcrumb :deep(.el-breadcrumb__inner),
.breadcrumb :deep(.el-breadcrumb__inner a) {
  color: #909399;
  font-weight: 400;
}

.breadcrumb :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: #606266;
}

.header-title h2 {
  margin: 1px 0 0;
  font-size: 18px;
  line-height: 24px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-dropdown {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}

.main-content {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}
</style>
