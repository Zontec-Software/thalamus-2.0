<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { PAGE_SIZES } from './shared'

defineProps<{ pages: number; range: string }>()
const page = defineModel<number>('page', { required: true })
const size = defineModel<number>('size', { required: true })
</script>

<template>
  <div class="pager">
    <span>{{ range }}</span>
    <label>Por página
      <select v-model.number="size" class="filter narrow"><option v-for="entry in PAGE_SIZES" :key="entry" :value="entry">{{ entry }}</option></select>
    </label>
    <button class="button secondary small" :disabled="page <= 1" title="Página anterior" @click="page--"><ChevronLeft :size="14" /></button>
    <b>{{ page }} / {{ pages }}</b>
    <button class="button secondary small" :disabled="page >= pages" title="Próxima página" @click="page++"><ChevronRight :size="14" /></button>
  </div>
</template>
