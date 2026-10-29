<script setup lang="ts">
import { Filter, X } from 'lucide-vue-next'
import { HEADER_FILTER_OPS, type HeaderFilterOp } from './shared'

defineProps<{
  label: string
  value: string
  op: HeaderFilterOp
  open: boolean
  sortable?: boolean
  arrow?: string
  listId?: string
}>()

const emit = defineEmits<{
  sort: []
  toggle: []
  close: []
  clear: []
  'update:value': [value: string]
  'update:op': [op: HeaderFilterOp]
}>()

function choose(op: HeaderFilterOp) {
  emit('update:op', op)
  emit('close')
}
</script>

<template>
  <button v-if="sortable" type="button" class="col-sort" @click="emit('sort')">{{ label }}<span v-if="arrow" class="arrow">{{ arrow }}</span></button>
  <span v-else class="col-sort">{{ label }}</span>
  <div class="col-filter" @click.stop>
    <input :value="value" :list="listId" :aria-label="`Filtrar ${label}`" @focus="emit('close')" @input="emit('update:value', ($event.target as HTMLInputElement).value)" />
    <button type="button" class="filter-funnel" :aria-label="`Condição do filtro de ${label}`" :aria-expanded="open" @click="emit('toggle')">
      <Filter :size="13" />
    </button>
    <div v-if="open" class="filter-menu">
      <button type="button" @click="emit('clear')"><X :size="13" /> Limpar filtro</button>
      <button v-for="entry in HEADER_FILTER_OPS" :key="entry.id" type="button" :class="{ on: op === entry.id }" @click="choose(entry.id)">
        <span class="mark" aria-hidden="true" />{{ entry.label }}
      </button>
    </div>
  </div>
</template>
