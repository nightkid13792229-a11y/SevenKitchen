<script setup lang="ts">
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
</script>

<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';
}

/*
 * 合并入口后的「页中页」：容器已经有 tab 标题，内层页面原来的大标题就不要再重复一遍。
 * 只隐藏标题/描述，操作按钮（刷新、新建、日期切换、保存）都保留。
 * 约定：容器里包一层 .embedded-section，见 AftersaleCenter / Finance / Purchasing /
 * SupplementShop / TastingPack / NutritionStandards / Settings 等页面。
 */
.embedded-section .page-header > h1,
.embedded-section .page-header > h2,
.embedded-section .page-header > div:first-child,
.embedded-section .el-page-header {
  display: none !important;
}

.embedded-section .page-header {
  margin-bottom: 12px;
}
</style>
