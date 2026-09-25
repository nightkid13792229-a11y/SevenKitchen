<template>
  <!--
    独立页面入口保持不变：真正的实现搬到了 components/SupplementOrdersPanel.vue，
    这样「订单管理 → 补剂订单」标签页能复用同一份组件，不必维护两套补剂订单逻辑。
  -->
  <supplement-orders-panel />
</template>

<script setup lang="ts">
import SupplementOrdersPanel from './components/SupplementOrdersPanel.vue';
</script>
