<template>
  <el-dialog
    v-model="visible"
    title="取消订单"
    width="500px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-alert
      title="警告"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 20px"
    >
      取消订单后无法恢复，请谨慎操作
    </el-alert>

    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-width="100px"
    >
      <el-form-item label="取消原因" prop="reason">
        <el-select
          v-model="formData.reason"
          placeholder="请选择取消原因"
          filterable
          allow-create
          style="width: 100%"
        >
          <el-option
            v-for="item in commonReasons"
            :key="item"
            :label="item"
            :value="item"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="详细说明" prop="remark">
        <el-input
          v-model="formData.remark"
          type="textarea"
          :rows="4"
          placeholder="请输入详细说明（可选）"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="danger" :loading="loading" @click="handleSubmit">
        确认取消
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

interface Props {
  modelValue: boolean
  orderId?: string
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', reason: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const loading = ref(false)

const visible = ref(false)
const formData = reactive({
  reason: '',
  remark: ''
})

// 常见取消原因
const commonReasons = [
  '客户主动取消',
  '库存不足',
  '生产问题',
  '配送问题',
  '价格错误',
  '信息有误',
  '其他原因'
]

const rules: FormRules = {
  reason: [
    { required: true, message: '请选择或输入取消原因', trigger: 'change' }
  ]
}

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (!val) {
      resetForm()
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const resetForm = () => {
  formData.reason = ''
  formData.remark = ''
  formRef.value?.clearValidate()
}

const handleClose = () => {
  visible.value = false
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    loading.value = true

    // 组合原因和备注
    const fullReason = formData.remark
      ? `${formData.reason}：${formData.remark}`
      : formData.reason

    emit('submit', fullReason)

    loading.value = false
    visible.value = false
  } catch (error) {
    loading.value = false
    console.error('表单验证失败:', error)
  }
}
</script>

<style scoped>
:deep(.el-dialog__body) {
  padding-top: 20px;
}
</style>
