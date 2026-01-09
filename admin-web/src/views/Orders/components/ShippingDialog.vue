<template>
  <el-dialog
    v-model="visible"
    title="发货信息"
    width="500px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-width="100px"
    >
      <el-form-item label="快递公司" prop="carrierCode">
        <el-select
          v-model="formData.carrierCode"
          placeholder="请选择快递公司"
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="carrier in carriers"
            :key="carrier.code"
            :label="carrier.name"
            :value="carrier.code"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="物流单号" prop="trackingNumber">
        <el-input
          v-model="formData.trackingNumber"
          placeholder="请输入物流单号"
          clearable
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        确认发货
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
  (e: 'submit', data: { carrierCode: string; trackingNumber: string }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const loading = ref(false)

const visible = ref(false)
const formData = reactive({
  carrierCode: '',
  trackingNumber: ''
})

// 常用快递公司列表
const carriers = [
  { code: 'SF', name: '顺丰速运' },
  { code: 'YTO', name: '圆通速递' },
  { code: 'STO', name: '申通快递' },
  { code: 'ZTO', name: '中通快递' },
  { code: 'YD', name: '韵达速递' },
  { code: 'EMS', name: 'EMS' },
  { code: 'JD', name: '京东快递' },
  { code: 'POSTB', name: '邮政包裹' }
]

const rules: FormRules = {
  carrierCode: [
    { required: true, message: '请选择快递公司', trigger: 'change' }
  ],
  trackingNumber: [
    { required: true, message: '请输入物流单号', trigger: 'blur' },
    { min: 5, message: '物流单号长度不能少于5位', trigger: 'blur' }
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
  formData.carrierCode = ''
  formData.trackingNumber = ''
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

    emit('submit', {
      carrierCode: formData.carrierCode,
      trackingNumber: formData.trackingNumber
    })

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
