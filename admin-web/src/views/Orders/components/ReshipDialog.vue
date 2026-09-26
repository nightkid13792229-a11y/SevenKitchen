<template>
  <el-dialog
    v-model="visible"
    title="免费补发（试吃装）"
    width="520px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-alert
      class="reship-alert"
      type="info"
      :closable="false"
      show-icon
      title="系统会新建一张 0 元补发单，并从试吃装成品库存扣掉对应套数。库存不足时会直接失败，请先到「试吃装库存」补货。"
    />

    <el-form ref="formRef" :model="formData" :rules="rules" label-width="100px">
      <el-form-item label="原单套数">
        <span>{{ originalSets }} 套</span>
      </el-form-item>

      <el-form-item label="补发套数" prop="sets">
        <el-input-number
          v-model="formData.sets"
          :min="1"
          :max="originalSets"
          :step="1"
          step-strictly
          style="width: 180px"
        />
        <span class="form-hint" style="margin-left: 12px">
          只坏了一部分就填 1，全额补发保持原单套数
        </span>
      </el-form-item>

      <el-form-item label="补发原因" prop="reason">
        <el-input
          v-model="formData.reason"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="例如：到货时已化冻；少发一袋；口味发错"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        确认补发
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

interface Props {
  modelValue: boolean
  orderId?: string
  /** 原单套数：补发上限，默认全额补发 */
  originalSets?: number
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', data: { sets: number; reason: string }): void
}

const props = withDefaults(defineProps<Props>(), {
  originalSets: 1
})
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const loading = ref(false)

const visible = ref(false)
const formData = reactive({
  sets: 1,
  reason: ''
})

const originalSets = computed(() => Math.max(1, Number(props.originalSets) || 1))

const rules: FormRules = {
  sets: [{ required: true, message: '请填写补发套数', trigger: 'change' }],
  reason: [
    { required: true, message: '请填写补发原因（客服与财务事后要能查）', trigger: 'blur' }
  ]
}

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) {
      // 默认全额补发，处理人只需要在"只坏了一部分"时改小
      formData.sets = originalSets.value
      formData.reason = ''
      formRef.value?.clearValidate()
    } else {
      resetForm()
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const resetForm = () => {
  formData.sets = 1
  formData.reason = ''
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
      sets: formData.sets,
      reason: formData.reason.trim()
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

.reship-alert {
  margin-bottom: 16px;
}

.form-hint {
  color: #909399;
  font-size: 12px;
}
</style>
