<template>
  <el-dialog
    :title="isEditMode ? '编辑用户' : '新增员工'"
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="120px"
    >
      <!-- 创建模式：显示手机号 -->
      <template v-if="!isEditMode">
        <el-form-item label="手机号" prop="phone">
          <el-input
            v-model="formData.phone"
            placeholder="请输入手机号"
            maxlength="11"
          />
        </el-form-item>

        <el-form-item label="姓名" prop="nickname">
          <el-input
            v-model="formData.nickname"
            placeholder="请输入员工姓名"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="部门" prop="department">
          <el-select
            v-model="formData.department"
            placeholder="请选择部门"
            style="width: 100%"
          >
            <el-option label="厨房" value="KITCHEN" />
            <el-option label="采购" value="PURCHASING" />
            <el-option label="发货" value="SHIPPING" />
          </el-select>
        </el-form-item>
      </template>

      <!-- 编辑模式：显示昵称、状态、角色 -->
      <template v-else>
        <el-form-item label="手机号">
          <el-input :value="user?.phone" disabled />
        </el-form-item>

        <el-form-item label="姓名" prop="nickname">
          <el-input
            v-model="formData.nickname"
            placeholder="请输入姓名"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="状态" prop="status">
          <el-select
            v-model="formData.status"
            placeholder="请选择状态"
            style="width: 100%"
          >
            <el-option label="正常" :value="UserStatus.ACTIVE" />
            <el-option label="未激活" :value="UserStatus.INACTIVE" />
            <el-option label="已禁用" :value="UserStatus.BANNED" />
          </el-select>
        </el-form-item>

        <el-form-item label="角色" prop="role">
          <el-select
            v-model="formData.role"
            placeholder="请选择角色"
            style="width: 100%"
            :disabled="!canChangeRole"
          >
            <el-option label="客户" :value="UserRole.CUSTOMER" />
            <el-option label="员工" :value="UserRole.STAFF" />
            <el-option label="管理员" :value="UserRole.ADMIN" />
          </el-select>
          <div v-if="!canChangeRole" class="form-tip">
            💡 无法将管理员降级为其他角色
          </div>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ isEditMode ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { User, CreateUserForm, UpdateUserForm } from '@/types/user'
import { UserRole, UserStatus } from '@/types/user'
import { userApi } from '@/api'

interface Props {
  visible?: boolean
  user?: User
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}

const props = withDefaults(defineProps<Props>(), {
  visible: false
})
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const submitting = ref(false)

interface UserFormState {
  phone: string
  nickname: string
  department: 'KITCHEN' | 'PURCHASING' | 'SHIPPING'
  status: UserStatus
  role: UserRole
}

// 是否为编辑模式
const isEditMode = computed(() => !!props.user)

// 是否可以修改角色（管理员不能降级）
const canChangeRole = computed(() => {
  if (!props.user) return true
  return props.user.role !== UserRole.ADMIN
})

// 表单数据
const createDefaultFormData = (): UserFormState => ({
  phone: '',
  nickname: '',
  department: 'KITCHEN',
  status: UserStatus.ACTIVE,
  role: UserRole.STAFF,
})

const formData = ref<UserFormState>(createDefaultFormData())

// 表单验证规则
const formRules: FormRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: '请输入正确的手机号',
      trigger: 'blur',
    },
  ],
  nickname: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { min: 2, max: 20, message: '姓名长度在2到20个字符', trigger: 'blur' },
  ],
  department: [
    { required: true, message: '请选择部门', trigger: 'change' },
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'change' },
  ],
  role: [
    { required: true, message: '请选择角色', trigger: 'change' },
  ],
}

// 监听用户变化，初始化表单
watch(
  () => props.user,
  (user) => {
    if (user) {
      // 编辑模式：填充用户数据
      formData.value = {
        phone: user.phone,
        nickname: user.nickname,
        department: 'KITCHEN',
        status: user.status,
        role: user.role,
      }
    } else {
      // 创建模式：重置表单
      formData.value = createDefaultFormData()
    }
    formRef.value?.clearValidate()
  },
  { immediate: true }
)

// 监听visible变化，重置表单
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      formRef.value?.clearValidate()
    }
  }
)

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    submitting.value = true

    if (isEditMode.value) {
      // 编辑用户
      const updateData: UpdateUserForm = {
        nickname: formData.value.nickname,
        status: formData.value.status,
        role: formData.value.role,
      }
      await userApi.update(props.user!.id, updateData)
      ElMessage.success('更新成功')
    } else {
      // 创建员工
      const createData: CreateUserForm = {
        phone: formData.value.phone,
        nickname: formData.value.nickname,
        department: formData.value.department,
      }
      await userApi.create(createData)
      ElMessage.success('创建成功')
    }

    emit('success')
  } catch (error: any) {
    if (error !== false) {
      // 表单验证失败时error为false，不显示错误消息
      ElMessage.error(error.message || '操作失败')
    }
  } finally {
    submitting.value = false
  }
}

// 取消
const handleCancel = () => {
  emit('update:visible', false)
}
</script>

<style scoped>
.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
