<script setup lang="ts">
import { computed } from 'vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const year = defineModel<string>('year', { required: true })
const fromMonth = defineModel<number>('from', { required: true })
const toMonth = defineModel<number>('to', { required: true })
/** Id da empresa vista ou `grupo` para a soma das empresas autorizadas. */
const scope = defineModel<string>('scope', { required: true })
withDefaults(defineProps<{ years?: string[]; months?: boolean; companies?: boolean }>(), { years: () => ['2025', '2026', '2027'], months: true, companies: true })

const store = useErpStore()
const ui = useUiStore()
const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const canGroup = computed(() => store.can('orcamentos.consultar_consolidado'))
const members = computed(() => {
  const groupId = store.state.tenants.find(entry => entry.id === ui.activeTenantId)?.groupId
  return groupId ? store.state.tenants.filter(entry => entry.groupId === groupId && entry.status === 'Ativa') : []
})

function setFrom(value: number) {
  fromMonth.value = value
  if (toMonth.value < value) toMonth.value = value
}
function setTo(value: number) {
  toMonth.value = value
  if (fromMonth.value > value) fromMonth.value = value
}
</script>

<template>
  <div class="period-bar" data-tour="period-scope">
    <div class="period-pick">
      <select v-model="year" class="filter" aria-label="Ano"><option v-for="entry in years" :key="entry">{{ entry }}</option></select>
      <template v-if="months">
        <select class="filter" aria-label="Mês inicial" :value="fromMonth" @change="setFrom(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="(label, index) in labels" :key="label" :value="index + 1">{{ label }}</option>
        </select>
        <span class="cell-sub">até</span>
        <select class="filter" aria-label="Mês final" :value="toMonth" @change="setTo(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="(label, index) in labels" :key="label" :value="index + 1">{{ label }}</option>
        </select>
      </template>
    </div>
    <div v-if="companies && canGroup && members.length > 1" class="seg">
      <button v-for="tenant in members" :key="tenant.id" type="button" :class="{ on: scope === tenant.id }" @click="scope = tenant.id">{{ tenant.tradeName }}</button>
      <button type="button" :class="{ on: scope === 'grupo' }" @click="scope = 'grupo'">Grupo</button>
    </div>
  </div>
</template>
