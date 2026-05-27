<template>
  <view
    v-if="visible"
    :class="floatClass"
    :style="floatStyle"
  >
    <button
      class="customer-service-float-button"
      @tap="handleCustomerServiceTap"
    >
      <template v-if="config.floatingButtonIconUrl">
        <image
          class="customer-service-float-avatar"
          :src="config.floatingButtonIconUrl"
          mode="aspectFit"
        />
      </template>
      <template v-else>
        <text class="customer-service-float-symbol">CS</text>
        <text class="customer-service-float-text">{{ config.floatingButtonText }}</text>
      </template>
    </button>
    <text
      v-if="config.floatingButtonIconUrl"
      class="customer-service-float-label"
    >
      {{ config.floatingButtonText }}
    </text>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  buildCustomerServiceCard,
  defaultCustomerServiceConfig,
  getCustomerServiceConfig,
  getFloatingButtonClass,
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

const floatClass = computed(() => getFloatingButtonClass(config.value))

const floatStyle = computed(() => {
  const size = Math.max(44, Math.min(Number(config.value.floatingButtonSize || 56), 88))
  const bottom = Math.max(0, Number(config.value.floatingButtonBottom || 128))
  const right = Math.max(0, Number(config.value.floatingButtonRight || 18))
  const side = config.value.floatingButtonPosition === 'LEFT_BOTTOM' ? 'left' : 'right'

  return {
    width: `${size + 10}px`,
    '--customer-service-size': `${size}px`,
    bottom: `${bottom}px`,
    [side]: `${right}px`,
  }
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
.customer-service-float {
  position: fixed;
  z-index: 900;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.customer-service-float-button {
  width: var(--customer-service-size);
  height: var(--customer-service-size);
  padding: 0;
  border: 3px solid rgba(255, 255, 255, 0.96);
  border-radius: 999px;
  box-shadow: 0 8px 22px rgba(31, 41, 55, 0.22);
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

.customer-service-float-label {
  display: block;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #9a4f12;
  font-size: 11px;
  font-weight: 800;
  line-height: 15px;
  text-align: center;
  box-shadow: 0 3px 10px rgba(31, 41, 55, 0.12);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.customer-service-float.dark .customer-service-float-label {
  background: rgba(17, 24, 39, 0.9);
  color: #ffffff;
}

.customer-service-float-avatar {
  position: absolute;
  left: 7%;
  top: 7%;
  width: 86%;
  height: 86%;
  display: block;
  border-radius: 999px;
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
