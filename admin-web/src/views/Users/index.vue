<template>
  <div class="users-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="handleCreate">
        <el-icon><Plus /></el-icon>
        新增员工
      </el-button>
    </div>

    <!-- Filters -->
    <el-card class="filter-card">
      <el-tabs v-model="activeRole" @tab-change="handleRoleChange">
        <el-tab-pane label="全部" name=""></el-tab-pane>
        <el-tab-pane label="客户" name="CUSTOMER"></el-tab-pane>
        <el-tab-pane label="员工" name="STAFF"></el-tab-pane>
        <el-tab-pane label="管理员" name="ADMIN"></el-tab-pane>
      </el-tabs>

      <div class="search-bar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索手机号或昵称"
          clearable
          style="width: 300px"
          @clear="loadUsers"
          @keyup.enter="loadUsers"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="loadUsers">搜索</el-button>
      </div>
    </el-card>

    <!-- Users Table -->
    <el-card class="table-card">
      <el-table
        v-loading="loading"
        :data="users"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="nickname" label="昵称" width="150" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="UserRoleTagTypes[row.role]">
              {{ UserRoleLabels[row.role] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.status === UserStatus.ACTIVE ? 'success' : 'danger'"
            >
              {{ UserStatusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最后登录" width="180">
          <template #default="{ row }">
            {{ formatDate(row.lastLoginAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              link
              :type="row.status === UserStatus.ACTIVE ? 'warning' : 'success'"
              size="small"
              @click="handleToggleStatus(row)"
            >
              {{ row.status === UserStatus.ACTIVE ? '禁用' : '启用' }}
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- User Form Dialog -->
    <UserForm
      v-model="formVisible"
      :user="currentUser"
      @success="handleFormSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import type { User } from '@/types/user'
import { UserRole, UserStatus, UserRoleLabels, UserStatusLabels, UserRoleTagTypes } from '@/types/user'
import { userApi } from '@/api'
import UserForm from './UserForm.vue'

const activeRole = ref<string>('')
const searchKeyword = ref('')
const users = ref<User[]>([])
const loading = ref(false)
const formVisible = ref(false)
const currentUser = ref<User | undefined>(undefined)

// Load users list
const loadUsers = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (activeRole.value) {
      params.role = activeRole.value
    }
    if (searchKeyword.value) {
      params.keyword = searchKeyword.value
    }
    users.value = await userApi.list(params)
  } catch (error: any) {
    ElMessage.error(error.message || '加载用户列表失败')
  } finally {
    loading.value = false
  }
}

// Handle role tab change
const handleRoleChange = () => {
  loadUsers()
}

// Handle create user
const handleCreate = () => {
  currentUser.value = undefined
  formVisible.value = true
}

// Handle edit user
const handleEdit = (user: User) => {
  currentUser.value = user
  formVisible.value = true
}

// Handle toggle user status
const handleToggleStatus = async (user: User) => {
  const action = user.status === UserStatus.ACTIVE ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(
      `确认要${action}用户 "${user.nickname}" 吗？`,
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.BANNED : UserStatus.ACTIVE
    await userApi.update(user.id, { status: newStatus })
    ElMessage.success(`${action}成功`)
    loadUsers()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || `${action}失败`)
    }
  }
}

// Handle delete user
const handleDelete = async (user: User) => {
  try {
    await ElMessageBox.confirm(
      `确认要删除用户 "${user.nickname}" 吗？此操作不可恢复！`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await userApi.delete(user.id)
    ElMessage.success('删除成功')
    loadUsers()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// Handle form success
const handleFormSuccess = () => {
  formVisible.value = false
  loadUsers()
}

// Format date
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Load users on mount
onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.users-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.filter-card {
  margin-bottom: 20px;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.table-card {
  margin-bottom: 20px;
}
</style>
