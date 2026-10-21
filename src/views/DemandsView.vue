<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarClock, ListChecks, PackageCheck, Plus, Search, ShoppingCart, Workflow } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Demand } from '../types/domain'
import { daysUntil, fmtCurrency, fmtDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const STATUSES: Demand['status'][] = ['Aberta', 'Em atendimento', 'Atendida', 'Cancelada']
const status = ref<Demand['status'] | 'Ativas'>('Ativas')
const origin = ref('')
const kind = ref('')
const query = ref('')

const demands = computed(() => store.state.demands.filter(entry =>
  (status.value === 'Ativas' ? entry.status === 'Aberta' || entry.status === 'Em atendimento' : entry.status === status.value)
  && (!origin.value || entry.origin === origin.value) && (!kind.value || entry.kind === kind.value)
  && (!query.value || `${entry.id} ${entry.description} ${entry.originId ?? ''}`.toLowerCase().includes(query.value.toLowerCase()))))
const active = computed(() => store.state.demands.filter(entry => entry.status === 'Aberta' || entry.status === 'Em atendimento'))
const late = computed(() => active.value.filter(entry => daysUntil(entry.neededBy) < 0))
const fromStock = computed(() => store.state.demands.filter(entry => entry.status === 'Aberta' && entry.itemId && store.available(entry.itemId) >= entry.quantity))
const count = (value: string) => value === 'Ativas' ? active.value.length : store.state.demands.filter(entry => entry.status === value).length
const free = (entry: Demand) => entry.itemId ? store.available(entry.itemId) : undefined
const supplierFor = (entry: Demand) => {
  const name = entry.itemId ? store.item(entry.itemId).supplier : undefined
  const suppliers = store.state.partners.filter(partner => partner.roles.includes('Fornecedor'))
  return (suppliers.find(partner => partner.name === name) ?? suppliers[0])?.id ?? ''
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar demanda ou vínculo" /></label>
      <select v-model="kind" class="filter"><option value="">Todos os tipos</option><option>Material</option><option>Serviço</option><option>Ativo</option></select>
      <select v-model="origin" class="filter"><option value="">Todas as origens</option><option>OP</option><option>Estoque mínimo</option><option>Manutenção</option><option>Assistência</option><option>Projeto</option><option>Manual</option></select>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('demand', 'new')"><Plus :size="15" /> Nova demanda</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Ativas <ListChecks :size="17" /></div><strong>{{ active.length }}</strong><small>{{ fmtCurrency(active.reduce((sum, entry) => sum + (entry.estimatedCost ?? 0), 0)) }} estimados</small></article>
    <article class="metric"><div class="metric-head">Atrasadas <CalendarClock :size="17" /></div><strong :class="{ 'risk-text': late.length }">{{ late.length }}</strong><small>Data necessária já passou</small></article>
    <article class="metric"><div class="metric-head">Atendíveis pelo estoque <PackageCheck :size="17" /></div><strong>{{ fromStock.length }}</strong><small>Sem necessidade de compra</small></article>
    <article class="metric"><div class="metric-head">Origens <Workflow :size="17" /></div><strong>{{ new Set(active.map(entry => entry.origin)).size }}</strong><small>Uma fila para toda a empresa</small></article>
  </section>

  <div class="filter-row chips-line">
    <button v-for="entry in ['Ativas', ...STATUSES]" :key="entry" class="chip" :class="{ active: status === entry }" @click="status = entry as typeof status">{{ entry }} <b>{{ count(entry) }}</b></button>
  </div>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Demanda</th><th>Necessidade</th><th>Origem</th><th>Saldo livre</th><th>Necessária em</th><th>Prioridade</th><th>Status</th><th></th></tr></thead>
      <tbody>
        <tr v-for="demand in demands" :key="demand.id" class="clickable" @click="ui.openRecord('demand', demand.id)">
          <td><b>{{ demand.id }}</b><small class="cell-sub">{{ demand.kind }} · {{ demand.assigneeRole }}</small></td>
          <td><b>{{ demand.description }}</b><small class="cell-sub">{{ demand.quantity }} {{ demand.itemId ? store.item(demand.itemId).unit : 'un' }} · {{ fmtCurrency(demand.estimatedCost ?? 0) }}</small></td>
          <td>{{ demand.origin }}<small class="cell-sub">{{ demand.originId ?? '—' }}</small></td>
          <td><template v-if="free(demand) !== undefined"><span :class="free(demand)! >= demand.quantity ? 'ok-text' : 'risk-text'">{{ free(demand) }}</span></template><template v-else>—</template></td>
          <td :class="{ 'risk-text': demand.status !== 'Atendida' && demand.status !== 'Cancelada' && daysUntil(demand.neededBy) < 0 }">{{ fmtDate(demand.neededBy) }}</td>
          <td><StatusBadge :value="demand.priority" /></td>
          <td><StatusBadge :value="demand.status" /><small v-if="demand.purchaseOrderId" class="cell-sub">{{ demand.purchaseOrderId }}</small></td>
          <td @click.stop>
            <button v-if="demand.status === 'Aberta' && demand.itemId && free(demand)! >= demand.quantity" class="button small" @click="store.attendDemandFromStock(demand.id)">Atender</button>
            <button v-else-if="demand.status === 'Aberta' && demand.itemId" class="button secondary small" @click="store.createPurchaseOrder(demand.id, supplierFor(demand))"><ShoppingCart :size="13" /> Comprar</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!demands.length" class="empty-note">Nenhuma demanda neste filtro.</p>
  </article>
</template>
