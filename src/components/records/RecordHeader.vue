<script setup lang="ts">
import { ArrowLeft, X } from 'lucide-vue-next'
import { useUiStore } from '../../stores/ui'

defineProps<{ eyebrow: string; title: string; subtitle?: string }>()
const ui = useUiStore()
</script>

<template>
  <header class="drawer-header">
    <div class="record-heading">
      <button v-if="ui.recordHistory.length" class="icon-plain" title="Voltar ao registro anterior" @click="ui.backRecord"><ArrowLeft :size="18" /></button>
      <div>
        <span class="eyebrow">{{ eyebrow }}</span>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
    </div>
    <div class="filter-row">
      <slot name="actions" />
      <button class="icon-plain" title="Fechar" @click="ui.closeRecord"><X :size="18" /></button>
    </div>
  </header>
</template>
