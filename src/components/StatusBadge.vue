<script setup lang="ts">
import { computed } from 'vue'
import { statusTone } from '../utils/format'

const props = defineProps<{ value: string; tone?: string }>()
const toneClass = computed(() => props.tone ?? statusTone(props.value))
</script>

<template>
  <span class="status" :class="toneClass">{{ value }}</span>
</template>
