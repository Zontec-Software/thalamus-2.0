<script setup lang="ts">
import type { Component } from 'vue'
defineProps<{ label: string; value: string | number; detail: string; icon: Component; trend?: 'positive' | 'negative' }>()
</script>

<template>
  <article class="metric">
    <div class="metric-head"><span>{{ label }}</span><span class="metric-icon"><component :is="icon" :size="16" /></span></div>
    <strong>{{ value }}</strong>
    <small :class="trend">{{ detail }}</small>
  </article>
</template>
