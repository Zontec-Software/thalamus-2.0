<script setup lang="ts">
import { computed } from 'vue'
import { Filter, X } from 'lucide-vue-next'
import { activeFilterOp, filterOps, type HeaderFilterKind, type HeaderFilterOp } from './shared'

const props = defineProps<{
  label: string
  value: string
  op: HeaderFilterOp
  open: boolean
  sortable?: boolean
  arrow?: string
  /** Lista fechada: o select troca a opção e a primeira linha limpa. */
  options?: string[]
  kind?: HeaderFilterKind
}>()

const kind = computed(() => props.kind ?? 'text')
const ops = computed(() => filterOps(kind.value))
const selectedOp = computed(() => activeFilterOp(props.op, kind.value))

const choices = computed(() => {
  const list = props.options ?? []
  return props.value && !list.includes(props.value) ? [props.value, ...list] : list
})

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

function pick(value: string) {
  emit('update:value', value)
  emit('close')
}
</script>

<template>
  <button v-if="sortable" type="button" class="col-sort" @click="emit('sort')">{{ label }}<span v-if="arrow" class="arrow">{{ arrow }}</span></button>
  <span v-else class="col-sort">{{ label }}</span>
  <div class="col-filter" @click.stop>
    <select v-if="options" :value="value" :aria-label="`Filtrar ${label}`" @change="pick(($event.target as HTMLSelectElement).value)">
      <option value=""></option>
      <option v-for="option in choices" :key="option" :value="option">{{ option }}</option>
    </select>
    <input v-else :value="value" :type="kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'" :step="kind === 'number' ? 'any' : undefined" :aria-label="`Filtrar ${label}`" @focus="emit('close')" @input="emit('update:value', ($event.target as HTMLInputElement).value)" />
    <button type="button" class="filter-funnel" :aria-label="`Condição do filtro de ${label}`" :aria-expanded="open" @click="emit('toggle')">
      <Filter :size="13" />
    </button>
    <div v-if="open" class="filter-menu">
      <button type="button" @click="emit('clear')"><X :size="13" /> Limpar filtro</button>
      <button v-for="entry in ops" :key="entry.id" type="button" :class="{ on: selectedOp === entry.id }" @click="choose(entry.id)">
        <span class="mark" aria-hidden="true" />{{ entry.label }}
      </button>
    </div>
  </div>
</template>
