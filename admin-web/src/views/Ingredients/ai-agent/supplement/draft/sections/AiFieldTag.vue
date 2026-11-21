<template>
  <span
    v-if="tag"
    class="draft-field__source"
    :class="{ 'draft-field__source--low': tag.low }"
  >
    {{ tag.text }}
  </span>
</template>

<script setup lang="ts">
import type { DraftAiFieldTag } from './aiFieldMeta'

defineProps<{
  tag: DraftAiFieldTag | null
}>()
</script>
