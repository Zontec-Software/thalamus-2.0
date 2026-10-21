<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()

const parts = computed(() => props.text.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
  .map(part => part.startsWith('**') ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"><b v-if="part.bold">{{ part.text }}</b><template v-else>{{ part.text }}</template></template>
</template>
