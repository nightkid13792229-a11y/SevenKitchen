<template>
  <section class="creation-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">④</span>
      <div>
        <h2 class="creation-step__title">终检</h2>
        <p class="creation-step__summary">处理拦死项、登记例外</p>
      </div>
    </header>

    <div class="creation-step__placeholder">
      <p>这一站的内容将在后续任务中接入。</p>
    </div>

    <div class="creation-step__actions">
      <el-button type="primary" @click="emit('next')">下一步</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  next: []
}>()
</script>
