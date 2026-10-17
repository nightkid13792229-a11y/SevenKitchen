<template>
  <!--
    订单状态标签 · 顾客端订单详情 + 订单列表 + 售后页共用（2026-10-18 抽出）

    ## 它只做一件事：把后端给的 { code, label, tone } 画成一个标签

    **前端不判断"该显示什么"。** 这一点是硬边界：
    「已交付」还是「售后中」，由后端看"有没有未完成售后"决定；
    前端如果自己看 `aftersaleCount > 0` 再改文案，
    就出现了第二个判断点 —— 两处不一致时没人能说清哪个对。

    ## 6 档颜色

    老板 2026-10-18 定：
      待付款 黄 · 已付款 橙 · 已交付 绿 · 售后中 红 · 已完成 灰 · 已取消 浅灰
    后端给 `tone`（warning / progress / success / danger / info / muted），
    组件只负责把 tone 映射成颜色 —— **不认状态码**。
  -->
  <text class="order-status-badge" :class="`order-status-badge--${toneClass}`">{{ label }}</text>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { toneToClass } from '@/api/custom-recipe'

const props = withDefaults(
  defineProps<{
    /** 后端 `renderable.status.label`（「已交付」「售后中」…） */
    label?: string | null
    /** 后端 `renderable.status.tone` */
    tone?: string | null
  }>(),
  { label: '', tone: 'info' },
)

/** 没给 label 就整块不显示 —— 给一个空标签比不给更糟 */
const toneClass = computed(() => toneToClass(props.tone ?? undefined))
</script>

<style scoped lang="scss">
.order-status-badge {
  display: inline-block;
  font-size: 19rpx;
  font-weight: 700;
  border-radius: 999rpx;
  padding: 4rpx 16rpx;
  /* 默认灰：后端给了没见过的 tone 时也不会变成透明 */
  background: #efeae3;
  color: #6e5f4b;
}

/* 待付款 · 黄 */
.order-status-badge--warning {
  background: #fef3c7;
  color: #92400e;
}

/* 已付款 · 橙 */
.order-status-badge--progress {
  background: #fff1e3;
  color: #b45309;
}

/* 已交付 · 绿 */
.order-status-badge--success {
  background: #dcfce7;
  color: #166534;
}

/* 售后中 · 红 */
.order-status-badge--danger {
  background: #fee2e2;
  color: #991b1b;
}

/* 已完成 · 灰 */
.order-status-badge--info {
  background: #efeae3;
  color: #6e5f4b;
}

/* 已取消 · 浅灰 */
.order-status-badge--muted {
  background: #f4f1ec;
  color: #9c8b76;
}
</style>
