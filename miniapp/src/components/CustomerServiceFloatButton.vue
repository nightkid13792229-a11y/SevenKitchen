<template>
  <view
    v-if="visible"
    :class="floatClass"
    :style="floatStyle"
  >
    <button
      v-if="config.enabled"
      class="customer-service-float-button"
      open-type="contact"
      show-message-card="true"
      :send-message-title="messageCard.title"
      :send-message-path="messageCard.path"
    >
      <image
        v-if="config.floatingButtonIconUrl"
        class="customer-service-float-icon"
        :src="config.floatingButtonIconUrl"
        mode="aspectFit"
      />
      <text v-else class="customer-service-float-symbol">CS</text>
      <text class="customer-service-float-text">{{ config.floatingButtonText }}</text>
    </button>
    <button
      v-else
      class="customer-service-float-button"
      @tap="handleFallbackTap"
    >
      <image
        v-if="config.floatingButtonIconUrl"
        class="customer-service-float-icon"
        :src="config.floatingButtonIconUrl"
        mode="aspectFit"
      />
      <text v-else class="customer-service-float-symbol">CS</text>
      <text class="customer-service-float-text">{{ config.floatingButtonText }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  buildCustomerServiceCard,
  defaultCustomerServiceConfig,
  getCustomerServiceConfig,
  getFloatingButtonClass,
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
  }>(),
  {
    sourceType: 'GENERAL',
    orderId: '',
    orderNo: '',
    productId: '',
    productName: '',
    title: '',
    path: '',
  },
)

const config = ref<CustomerServiceConfig>({ ...defaultCustomerServiceConfig })

const visible = computed(() => {
  return Boolean(config.value.floatingButtonEnabled)
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
  })
})

const floatClass = computed(() => getFloatingButtonClass(config.value))

const floatStyle = computed(() => {
  const size = Math.max(44, Math.min(Number(config.value.floatingButtonSize || 56), 88))
  const bottom = Math.max(0, Number(config.value.floatingButtonBottom || 128))
  const right = Math.max(0, Number(config.value.floatingButtonRight || 18))
  const side = config.value.floatingButtonPosition === 'LEFT_BOTTOM' ? 'left' : 'right'

  return {
    width: `${size}px`,
    height: `${size}px`,
    bottom: `${bottom}px`,
    [side]: `${right}px`,
  }
})

function handleFallbackTap() {
  if (config.value.customerServiceUrl) {
    uni.navigateTo({
      url: `/pages/common/webview?url=${encodeURIComponent(config.value.customerServiceUrl)}`,
    })
    return
  }

  uni.showModal({
    title: '联系客服',
    content: '客服暂未启用，请稍后再试',
    showCancel: false,
  })
}

onMounted(async () => {
  config.value = await getCustomerServiceConfig()
})
</script>

<style scoped>
.customer-service-float {
  position: fixed;
  z-index: 900;
  box-sizing: border-box;
}

.customer-service-float-button {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 999px;
  box-shadow: 0 8px 22px rgba(31, 41, 55, 0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  line-height: 1;
  overflow: hidden;
}

.customer-service-float-button::after {
  border: 0;
}

.customer-service-float.light .customer-service-float-button {
  background: linear-gradient(180deg, #fff8ef 0%, #ffffff 100%);
  color: #9a4f12;
}

.customer-service-float.dark .customer-service-float-button {
  background: linear-gradient(180deg, #2f3a45 0%, #111827 100%);
  color: #ffffff;
}

.customer-service-float-icon {
  width: 46%;
  height: 46%;
}

.customer-service-float-symbol {
  font-size: 18px;
  font-weight: 800;
}

.customer-service-float-text {
  max-width: 86%;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
