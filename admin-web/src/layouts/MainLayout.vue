<template>
  <el-container class="main-layout">
    <el-aside width="200px" class="sidebar">
      <div class="logo">七号厨房后台</div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataBoard /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/dogs">
          <el-icon><PriceTag /></el-icon>
          <span>档案管理</span>
        </el-menu-item>
        <el-menu-item index="/breeds">
          <el-icon><Star /></el-icon>
          <span>品种管理</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/ingredients">
          <el-icon><Goods /></el-icon>
          <span>原料管理</span>
        </el-menu-item>
        <el-menu-item index="/search-governance">
          <el-icon><Search /></el-icon>
          <span>搜索治理</span>
        </el-menu-item>
        <el-menu-item index="/recipes">
          <el-icon><Food /></el-icon>
          <span>食谱管理</span>
        </el-menu-item>
        <el-sub-menu index="nutrition-standards">
          <template #title>
            <el-icon><DocumentChecked /></el-icon>
            <span>营养标准</span>
          </template>
          <el-menu-item index="/nutrition-standards/fediaf-2025-dog"
            >FEDIAF 2025 犬标准</el-menu-item
          >
          <el-menu-item index="/nutrition-standards/ingredient-readiness"
            >原料计算就绪度</el-menu-item
          >
          <el-menu-item index="/nutrition-standards/fediaf-target-preview"
            >FEDIAF 目标预览</el-menu-item
          >
        </el-sub-menu>
        <el-menu-item index="/reviews">
          <el-icon><Star /></el-icon>
          <span>评价管理</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><List /></el-icon>
          <span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/aftersale">
          <el-icon><List /></el-icon>
          <span>售后工单</span>
        </el-menu-item>
        <el-menu-item index="/refunds">
          <el-icon><Money /></el-icon>
          <span>退款管理</span>
        </el-menu-item>
        <el-menu-item index="/custom-recipes">
          <el-icon><EditPen /></el-icon>
          <span>定制食谱订单</span>
        </el-menu-item>
        <el-menu-item index="/analytics/dog-profile">
          <el-icon><DataBoard /></el-icon>
          <span>狗档案转化分析</span>
        </el-menu-item>
        <el-menu-item index="/inventory">
          <el-icon><Box /></el-icon>
          <span>库存管理</span>
        </el-menu-item>
        <el-menu-item index="/production">
          <el-icon><Operation /></el-icon>
          <span>生产管理</span>
        </el-menu-item>
        <el-menu-item index="/global-config">
          <el-icon><Setting /></el-icon>
          <span>全局配置</span>
        </el-menu-item>
        <el-menu-item index="/payment-config">
          <el-icon><Money /></el-icon>
          <span>支付配置</span>
        </el-menu-item>
        <el-menu-item index="/customer-service-config">
          <el-icon><User /></el-icon>
          <span>客服配置</span>
        </el-menu-item>
        <el-menu-item index="/customer-service">
          <el-icon><User /></el-icon>
          <span>客服会话</span>
        </el-menu-item>
        <el-sub-menu index="purchasing">
          <template #title>
            <el-icon><List /></el-icon>
            <span>采购管理</span>
          </template>
          <el-menu-item index="/purchasing/lists">采购单管理</el-menu-item>
          <el-menu-item index="/purchasing/reimbursements">报销管理</el-menu-item>
          <el-menu-item index="/purchasing/history">采购历史</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="finance">
          <template #title>
            <el-icon><Money /></el-icon>
            <span>财务中心</span>
          </template>
          <el-menu-item index="/finance/overview">财务总览</el-menu-item>
          <el-menu-item index="/finance/expense-bills"
            >费用与待支付</el-menu-item
          >
          <el-menu-item index="/finance/expense-analysis"
            >费用分析</el-menu-item
          >
          <el-menu-item index="/finance/contribution-analysis"
            >经营贡献分析</el-menu-item
          >
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-title">
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
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api'
import {
  DataBoard,
  Food,
  List,
  Box,
  Operation,
  User,
  ArrowDown,
  PriceTag,
  Goods,
  Star,
  Setting,
  EditPen,
  Money,
  DocumentChecked,
  Search,
  Lock
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const currentPageTitle = computed(() => route.meta.title as string || '后台管理')
const changePasswordVisible = ref(false)
const changePasswordLoading = ref(false)
const changePasswordFormRef = ref<FormInstance>()
const changePasswordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
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
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 64, message: '新密码长度需为8-64位', trigger: 'blur' }
  ],
  confirmPassword: [
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
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
      newPassword: changePasswordForm.newPassword
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
}

.logo {
  height: 50px;
  line-height: 50px;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  background-color: #2b3a4b;
}

.header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.header-title h2 {
  margin: 0;
  font-size: 18px;
  color: #333;
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
}
</style>
