<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { DEFAULT_PRICE_TABLE, catalogOf, currentPrice } from '../../../domain/catalog'
import { formatPrice, priceUnits } from '../../../domain/catalogExtensions'
import { today } from '../../../domain/engine'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, ItemPrice, PriceTable } from '../../../types/domain'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const todayIso = today()
const form = reactive({ tableId: DEFAULT_PRICE_TABLE, unit: '', value: 0, validFrom: todayIso })
const disabled = computed(() => readOnly(props.item, ui.role, 'comercial'))
const units = computed(() => priceUnits(props.item))
const showHistory = ref(false)
const newTable = reactive({ open: false, name: '', currency: 'BRL' as PriceTable['currency'], channel: '' })

const rows = computed(() => store.state.priceTables.flatMap(table => units.value.map(unit => {
  const prices = catalogOf(props.item).prices.filter(entry => entry.tableId === table.id && entry.unit === unit).sort((a, b) => b.validFrom.localeCompare(a.validFrom))
  return { table, unit, current: currentPrice(props.item, table.id, unit), next: prices.find(entry => entry.validFrom > todayIso), history: prices }
})).filter(row => row.history.length || (row.unit === props.item.unit)))
const tableOf = (price: ItemPrice) => store.state.priceTables.find(entry => entry.id === price.tableId)
const br = (date?: string) => date ? date.split('-').reverse().join('/') : 'em aberto'

function save() {
  if (store.setPrice(props.item.id, { ...form, unit: form.unit || props.item.unit }) !== undefined) form.value = 0
}
function createTable() {
  const table = store.createPriceTable({ name: newTable.name, currency: newTable.currency, channel: newTable.channel })
  if (table && typeof table === 'object') {
    form.tableId = table.id
    Object.assign(newTable, { open: false, name: '', channel: '' })
  }
}
</script>

<template>
  <h3 class="drawer-title">Preços por tabela</h3>
  <table class="dense">
    <thead><tr><th>Tabela</th><th>Unidade</th><th>Vigente</th><th>Desde</th><th>Próximo</th></tr></thead>
    <tbody>
      <tr v-for="row in rows" :key="row.table.id + row.unit">
        <td>{{ row.table.name }}<span class="cell-sub">{{ row.table.channel }} · {{ row.table.currency }}</span></td>
        <td>{{ row.unit }}</td>
        <td><b v-if="row.current">{{ formatPrice(row.table, row.current.value) }}</b><span v-else class="status neutral">Sem preço</span></td>
        <td><span class="cell-sub">{{ row.current ? br(row.current.validFrom) : '—' }}</span></td>
        <td>
          <template v-if="row.next">
            <span class="status info">{{ formatPrice(row.table, row.next.value) }} em {{ br(row.next.validFrom) }}</span>
            <button class="button ghost small" :disabled="disabled" @click="store.removePrice(item.id, row.next.id)">Cancelar</button>
          </template>
          <span v-else class="cell-sub">—</span>
        </td>
      </tr>
    </tbody>
  </table>
  <form class="filter-row" style="margin-top:8px" @submit.prevent="save">
    <fieldset class="layer filter-row" :disabled="disabled">
      <select v-model="form.tableId" class="filter"><option v-for="table in store.state.priceTables" :key="table.id" :value="table.id">{{ table.name }} ({{ table.currency }})</option></select>
      <select v-model="form.unit" class="filter"><option value="">{{ item.unit }}</option><option v-for="unit in units.filter(entry => entry !== item.unit)" :key="unit" :value="unit">{{ unit }}</option></select>
      <input v-model.number="form.value" class="filter narrow" type="number" min="0" step="0.01" placeholder="Preço" />
      <label class="cell-sub">desde <input v-model="form.validFrom" class="filter" type="date" :min="todayIso" /></label>
      <button class="button small" type="submit">Lançar preço</button>
      <button class="button ghost small" type="button" @click="newTable.open = !newTable.open">Nova tabela</button>
    </fieldset>
  </form>
  <form v-if="newTable.open" class="filter-row" style="margin-top:6px" @submit.prevent="createTable">
    <fieldset class="layer filter-row" :disabled="disabled">
      <input v-model="newTable.name" class="filter" placeholder="Nome (ex.: Distribuidores)" required />
      <select v-model="newTable.currency" class="filter"><option>BRL</option><option>USD</option></select>
      <input v-model="newTable.channel" class="filter" placeholder="Canal" />
      <button class="button secondary small" type="submit">Criar tabela</button>
    </fieldset>
  </form>
  <p class="cell-sub">O preço novo encerra o vigente na véspera. A proposta comercial puxa a tabela padrão; sem preço vigente nela, a aprovação comercial não passa. Outras unidades aparecem quando houver conversão de venda.</p>
  <button class="button ghost small" @click="showHistory = !showHistory">{{ showHistory ? 'Ocultar' : 'Ver' }} histórico de preços</button>
  <table v-if="showHistory" class="dense">
    <thead><tr><th>Tabela</th><th>Unidade</th><th>Preço</th><th>Vigência</th><th>Lançado por</th></tr></thead>
    <tbody>
      <tr v-for="price in [...catalogOf(item).prices].sort((a, b) => b.validFrom.localeCompare(a.validFrom))" :key="price.id">
        <td>{{ tableOf(price)?.name ?? price.tableId }}</td><td>{{ price.unit }}</td><td>{{ formatPrice(tableOf(price), price.value) }}</td>
        <td><span class="cell-sub">{{ br(price.validFrom) }} → {{ br(price.validTo) }}</span></td><td><span class="cell-sub">{{ price.createdBy }}</span></td>
      </tr>
    </tbody>
  </table>
</template>
