<template>
  <el-dialog v-model="dialogVisible" title="新建费用单" width="720px">
    <el-form :model="form" label-width="110px">
      <el-form-item label="费用名称">
        <el-input v-model="form.title" placeholder="例如：2026年4月房租" />
      </el-form-item>
      <el-form-item label="费用类别">
        <el-select v-model="form.category" style="width: 100%">
          <el-option
            v-for="option in categoryOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="收款方">
        <el-input v-model="form.payeeName" placeholder="例如：房东 / 阿里云 / 员工姓名" />
      </el-form-item>
      <el-form-item label="金额">
        <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
      </el-form-item>
      <el-form-item label="归属开始">
        <el-date-picker
          v-model="form.recognitionStart"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="归属结束">
        <el-date-picker
          v-model="form.recognitionEnd"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="应付时间">
        <el-date-picker
          v-model="form.dueAt"
          type="datetime"
          format="YYYY-MM-DD HH:mm:ss"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="3" placeholder="可选" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="state.submitting" @click="submit">保存费用单</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { financeApi } from '@/api/finance'
import type { CreateExpenseBillPayload } from '@/types/finance'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const categoryOptions = [
  { label: '原料采购', value: 'RAW_MATERIAL' },
  { label: '包材耗材', value: 'PACKAGING_SUPPLIES' },
  { label: '工资', value: 'PAYROLL' },
  { label: '房租', value: 'RENT' },
  { label: '水电燃气', value: 'UTILITIES' },
  { label: '宽带通信', value: 'NETWORK_COMMUNICATION' },
  { label: '服务器/域名/证书/备案', value: 'TECHNICAL_SERVICES' },
  { label: '物流配送费', value: 'LOGISTICS_DELIVERY' },
  { label: '行政费用', value: 'ADMINISTRATIVE' },
  { label: '售后退款/经营损失', value: 'AFTERSALE_LOSS' },
  { label: '其他杂项', value: 'OTHER' }
]

type ExpenseBillFormModel = Omit<CreateExpenseBillPayload, 'dueAt'> & {
  dueAt: Date | null
}

const createEmptyForm = (): ExpenseBillFormModel => ({
  title: '',
  category: 'RENT',
  amount: 0,
  payeeName: '',
  recognitionStart: '',
  recognitionEnd: '',
  dueAt: null,
  note: ''
})

const form = reactive<ExpenseBillFormModel>(createEmptyForm())
const state = reactive({ submitting: false })

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const resetForm = () => {
  Object.assign(form, createEmptyForm())
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      resetForm()
    }
  }
)

const submit = async () => {
  if (!form.title || !form.payeeName || !form.recognitionStart || !form.recognitionEnd || !form.dueAt) {
    ElMessage.warning('请把费用单的关键信息填写完整')
    return
  }

  state.submitting = true
  try {
    await financeApi.createExpenseBill({
      ...form,
      dueAt: form.dueAt.toISOString()
    })
    ElMessage.success('费用单已创建')
    emit('saved')
    dialogVisible.value = false
  } finally {
    state.submitting = false
  }
}
</script>
