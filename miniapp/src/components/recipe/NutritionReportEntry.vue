<template>
  <!--
    营养报告入口（2026-11-07 改版）

    样式对齐同页的「全营养标准」卡：米金渐变底 + 金色描边。
    老板明确不要那个"营养"方块标识 —— 它不携带信息，只是把标题挤窄；
    副标题改说清报告里到底有什么（氨基酸/脂肪酸/维生素/矿物质），
    顾客才知道点进去值得。

    标题与「查看报告」同一行，副标题单独占满一行：
    26 个字的副标题如果跟按钮抢宽度，会被挤成"…在内的详细 / 营养评估"
    两行，末行只剩 4 个字（2026-11-07 在 375 宽上实测）。

    两个页面共用（食谱详情页 / 我的定制食谱交付页）：
      · 详情页：有结构化报告时才显示；
      · 交付页：交付那一刻就把报告整份冻结进快照（2026-11-08 起），
        入口只看快照里有没有报告 —— 报告页读的也是那一份，不是活行。
  -->
  <view class="nutrition-report-entry" @tap="emit('open')">
    <view class="nutrition-report-entry__head">
      <text class="nutrition-report-entry__title">营养报告</text>
      <text class="nutrition-report-entry__action">查看报告</text>
    </view>
    <text class="nutrition-report-entry__sub">包含氨基酸、脂肪酸、维生素、矿物质在内的详细营养评估</text>
  </view>
</template>

<script setup lang="ts">
const emit = defineEmits<{ (event: 'open'): void }>()
</script>

<style scoped lang="scss">
.nutrition-report-entry {
  padding: 24rpx 26rpx;
  background: linear-gradient(150deg, #fdf8ee 0%, #f6efe0 100%);
  border: 1rpx solid rgba(176, 141, 79, 0.5);
  border-radius: 20rpx;
  box-shadow: 0 10rpx 26rpx rgba(176, 141, 79, 0.14);
}

.nutrition-report-entry__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nutrition-report-entry__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.nutrition-report-entry__action {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #b08d4f;
}

.nutrition-report-entry__sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #968f6d;
}
</style>
