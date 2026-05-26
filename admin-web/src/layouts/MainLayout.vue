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
        <el-menu-item index="/ingredient-tags">
          <el-icon><PriceTag /></el-icon>
          <span>原料标签管理</span>
        </el-menu-item>
        <el-menu-item index="/recipes">
          <el-icon><Food /></el-icon>
          <span>食谱管理</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><List /></el-icon>
          <span>订单管理</span>
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
        <el-menu-item v-if="isAdminUser" index="/agent-config">
          <el-icon><Connection /></el-icon>
          <span>Agent 配置</span>
        </el-menu-item>
        <el-sub-menu index="purchasing">
          <template #title>
            <el-icon><List /></el-icon>
            <span>采购管理</span>
          </template>
          <el-menu-item index="/purchasing/reimbursements">报销管理</el-menu-item>
          <el-menu-item index="/purchasing/history">采购历史</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="finance">
          <template #title>
            <el-icon><Money /></el-icon>
            <span>财务中心</span>
          </template>
          <el-menu-item index="/finance/overview">财务总览</el-menu-item>
          <el-menu-item index="/finance/expense-bills">费用与待支付</el-menu-item>
          <el-menu-item index="/finance/expense-analysis">费用分析</el-menu-item>
          <el-menu-item index="/finance/contribution-analysis">经营贡献分析</el-menu-item>
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
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
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
  Connection
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const currentPageTitle = computed(() => route.meta.title as string || '后台管理')
const isAdminUser = computed(() => userStore.userInfo?.role === 'ADMIN')

const handleCommand = async (command: string) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        type: 'warning'
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
