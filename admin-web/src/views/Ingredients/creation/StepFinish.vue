<template>
  <section class="creation-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">⑥</span>
      <div>
        <h2 class="creation-step__title">收尾</h2>
        <p class="creation-step__summary">核对摘要并一次性提交</p>
      </div>
    </header>

    <div class="creation-step__placeholder">
      <p>这一站的内容将在后续任务中接入。</p>
    </div>

    <div class="creation-step__actions">
      <el-button type="primary" disabled @click="emit('next')">下一步</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  next: []
}>()
</script>
