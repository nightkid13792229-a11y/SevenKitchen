<template>
  <button
    v-if="visible"
    class="customer-service-inline-button"
    @tap="handleCustomerServiceTap"
  >
    <image
      class="customer-service-inline-icon"
      src="/static/ui-icons/service-chat.png"
      mode="aspectFit"
    />
    <text class="customer-service-inline-text">咨询客服</text>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  buildCustomerServiceCard,
  defaultCustomerServiceConfig,
  getCustomerServiceConfig,
  openCustomerServiceChat,
  type CustomerServiceConfig,
  type CustomerServiceSourceType,
} from '../utils/customer-service'

const props = withDefaults(
  defineProps<{
    sourceType?: CustomerServiceSourceType
    orderId?: string
    orderNo?: string
    productId?: string
    productName?: string
    title?: string
    path?: string
    imageUrl?: string
  }>(),
  {
    sourceType: 'GENERAL',
    orderId: '',
    orderNo: '',
    productId: '',
    productName: '',
    title: '',
    path: '',
    imageUrl: '',
  },
)

const config = ref<CustomerServiceConfig>({ ...defaultCustomerServiceConfig })
const loading = ref(true)

const visible = computed(() => {
  return !loading.value && Boolean(config.value.floatingButtonEnabled)
})

const messageCard = computed(() => {
  return buildCustomerServiceCard(config.value, {
    sourceType: props.sourceType,
    orderId: props.orderId,
    orderNo: props.orderNo,
    productId: props.productId,
    productName: props.productName,
    title: props.title,
    path: props.path,
    imageUrl: props.imageUrl,
  })
})

function handleCustomerServiceTap() {
  openCustomerServiceChat(config.value, {
    sourceType: props.sourceType,
    orderId: props.orderId,
    orderNo: props.orderNo,
    productId: props.productId,
    productName: props.productName,
    title: props.title || messageCard.value.title,
    path: props.path || messageCard.value.path,
    imageUrl: props.imageUrl,
  })
}

onMounted(async () => {
  try {
    config.value = await getCustomerServiceConfig()
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
/* 客服入口：金色次级样式 —— 醒目但不与主按钮（墨绿实心「确认订单」）抢主次 */
.customer-service-inline-button {
  height: 80rpx;
  min-width: 192rpx;
  padding: 0 30rpx;
  margin: 0;
  border-radius: 40rpx;
  border: 1rpx solid rgba(176, 141, 79, 0.55);
  background: #f6efe0;
  color: #8a6b33;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 1;
  box-shadow: 0 6rpx 16rpx rgba(176, 141, 79, 0.18);
}

.customer-service-inline-button:active {
  transform: scale(0.98);
  opacity: 0.92;
}

.customer-service-inline-button::after {
  border: none;
}

.customer-service-inline-icon {
  width: 34rpx;
  height: 34rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
}

.customer-service-inline-text {
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}
</style>
