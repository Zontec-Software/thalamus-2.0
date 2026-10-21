<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarClock, CheckCircle2, CircleDollarSign, Headset, Plus, Search } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { today } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { TechnicalServiceOrder } from '../types/domain'
import { fmtCurrency, fmtDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const STATUSES: TechnicalServiceOrder['status'][] = ['Aberta', 'Agendada', 'Em execução', 'Aguardando peça', 'Concluída', 'Cancelada']
const status = ref<'Ativos' | TechnicalServiceOrder['status']>('Ativos')
const query = ref('')

const isActive = (entry: TechnicalServiceOrder) => !['Concluída', 'Cancelada'].includes(entry.status)
const orders = computed(() => store.state.technicalServiceOrders.filter(entry =>
  (status.value === 'Ativos' ? isActive(entry) : entry.status === status.value)
  && (!query.value || `${entry.id} ${entry.description} ${entry.salesOrderId} ${entry.assetSerial ?? ''} ${store.partnerName(entry.partnerId)}`.toLowerCase().includes(query.value.toLowerCase()))))
const active = computed(() => store.state.technicalServiceOrders.filter(isActive))
const count = (value: string) => value === 'Ativos' ? active.value.length : store.state.technicalServiceOrders.filter(entry => entry.status === value).length
const billed = computed(() => store.state.technicalServiceOrders.reduce((sum, entry) => sum + (entry.chargeAmount ?? 0), 0))
</script>

<template>
  <div class="toolbar">
    <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar cliente, pedido, série ou problema" /></label>
    <button data-tour="new-record" class="button" @click="ui.openRecord('technical', 'new')"><Plus :size="15" /> Novo chamado</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Chamados ativos <Headset :size="17" /></div><strong>{{ active.length }}</strong><small>{{ active.filter(entry => entry.status === 'Aguardando peça').length }} aguardando peça</small></article>
    <article class="metric"><div class="metric-head">Em garantia <CheckCircle2 :size="17" /></div><strong>{{ active.filter(entry => entry.warranty).length }}</strong><small>Geram NC para a Qualidade</small></article>
    <article class="metric"><div class="metric-head">Agenda de hoje e amanhã <CalendarClock :size="17" /></div><strong>{{ active.filter(entry => entry.scheduledFor && entry.scheduledFor <= new Date(Date.now() + 86400000).toISOString().slice(0, 10)).length }}</strong><small>Visitas e bancadas</small></article>
    <article class="metric"><div class="metric-head">Cobrado <CircleDollarSign :size="17" /></div><strong>{{ fmtCurrency(billed) }}</strong><small>Gera contas a receber</small></article>
  </section>

  <div class="filter-row chips-line">
    <button v-for="entry in ['Ativos', ...STATUSES]" :key="entry" class="chip" :class="{ active: status === entry }" @click="status = entry as typeof status">{{ entry }} <b>{{ count(entry) }}</b></button>
  </div>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Chamado</th><th>Cliente / pedido</th><th>Problema</th><th>Cobertura</th><th>Técnico</th><th>Agenda</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id" class="clickable" @click="ui.openRecord('technical', order.id)">
          <td><b>{{ order.id }}</b><small class="cell-sub">{{ order.assetSerial ?? 'Lote do pedido' }}</small></td>
          <td><b>{{ store.partnerName(order.partnerId) }}</b><small class="cell-sub">{{ order.salesOrderId }}{{ order.productionOrderId ? ` · ${order.productionOrderId}` : '' }}</small></td>
          <td>{{ order.description }}<small v-if="order.parts?.length" class="cell-sub">{{ order.parts.length }} peça(s)</small></td>
          <td><StatusBadge :value="order.warranty ? 'Garantia' : 'Cobrável'" :tone="order.warranty ? 'success' : 'warning'" /></td>
          <td>{{ store.userName(order.technicianId) }}</td>
          <td :class="{ 'risk-text': isActive(order) && order.scheduledFor && order.scheduledFor < today() }">{{ order.scheduledFor ? fmtDate(order.scheduledFor) : 'A definir' }}</td>
          <td><StatusBadge :value="order.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!orders.length" class="empty-note">Nenhum chamado neste filtro.</p>
  </article>
</template>
