<template>
  <el-dialog
    v-model="dialogVisible"
    title="确认收款"
    width="500px"
    :close-on-click-modal="false"
  >
    <div v-if="order" class="confirm-payment-content">
      <!-- 订单基本信息 -->
      <el-descriptions :column="2" border class="order-info">
        <el-descriptions-item label="订单号" :span="2">
          {{ order.id }}
        </el-descriptions-item>
        <el-descriptions-item label="客户">
          {{ order.customerName || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="狗狗">
          {{ order.dogName || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="订单金额" :span="2">
          <span class="amount-highlight">¥{{ Number(order.amountTotal).toFixed(2) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="下单时间" :span="2">
          {{ formatTime(order.createdAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 确认收款表单 -->
      <el-form
        ref="formRef"
        :model="formData"
        label-width="120px"
        class="payment-form"
      >
        <el-form-item label="支付方式">
          <el-tag type="success">线下微信支付</el-tag>
        </el-form-item>

        <el-form-item label="实际收款金额">
          <el-input-number
            v-model="formData.actualAmount"
            :precision="2"
            :min="0"
            :max="999999"
            controls-position="right"
            style="width: 100%"
          />
          <div class="form-tip">
            如果与订单金额不一致，请填写实际收款金额
          </div>
        </el-form-item>

        <el-alert
          v-if="amountDiff !== 0"
          :title="`金额差异: ¥${amountDiff.toFixed(2)}`"
          :type="amountDiff > 0 ? 'success' : 'warning'"
          :closable="false"
          show-icon
          style="margin-top: 10px"
        />
      </el-form>
    </div>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button
        type="primary"
        @click="handleSubmit"
      >
        确认收款
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FormInstance } from 'element-plus'

interface Order {
  id: string
  customerName?: string
  dogName?: string
  amountTotal: number
  createdAt: string
}

interface Props {
  modelValue: boolean
  order: Order | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', data: { actualAmount?: number }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const formRef = ref<FormInstance>()

const formData = ref({
  actualAmount: undefined as number | undefined
})

// 计算金额差异
const amountDiff = computed(() => {
  if (!props.order || formData.value.actualAmount === undefined) {
    return 0
  }
  return formData.value.actualAmount - Number(props.order.amountTotal)
})

// 监听订单变化，初始化表单
watch(() => props.order, (newOrder) => {
  if (newOrder) {
    formData.value.actualAmount = Number(newOrder.amountTotal)
  }
}, { immediate: true })

function handleCancel() {
  dialogVisible.value = false
  formRef.value?.resetFields()
}

function handleSubmit() {
  const submitData = {
    actualAmount: formData.value.actualAmount
  }
  emit('submit', submitData)
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}
</script>

<style scoped>
.confirm-payment-content {
  padding: 10px 0;
}

.order-info {
  margin-bottom: 24px;
}

.amount-highlight {
  font-size: 20px;
  font-weight: bold;
  color: #ff4d4f;
}

.payment-form {
  margin-top: 20px;
}

.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>
