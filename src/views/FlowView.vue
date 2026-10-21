<script setup lang="ts">
import { computed, ref } from 'vue'
import { FLOW_STAGES } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { FlowStage } from '../types/domain'
import { daysUntil, fmtShortDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const customer = ref('')
const onlyRisk = ref(false)

const descriptions: Record<FlowStage, string> = {
  Entrada: 'Pedidos aprovados no Omie aguardando planejamento',
  Materiais: 'Aguardando compra, reserva ou separação de materiais',
  Injeção: 'Peças plásticas sendo injetadas',
  Montagem: 'Em montagem, testes e embalagem',
  Qualidade: 'Lote em inspeção final',
  Expedição: 'Conferência, carga e faturamento',
  Faturado: 'NF-e emitida pelo Omie',
}

const orders = computed(() => store.state.salesOrders.filter(order =>
  (!customer.value || order.customerId === customer.value) && (!onlyRisk.value || store.risks(order).length)))

const columns = computed(() => FLOW_STAGES.map(stage => ({
  stage,
  orders: orders.value.filter(order => store.stage(order) === stage).sort((a, b) => a.promisedDate.localeCompare(b.promisedDate)),
})))

const firstId = computed(() => columns.value.find(column => column.orders.length)?.orders[0].id)

function due(date: string) {
  const days = daysUntil(date)
  if (days < 0) return `${-days}d atrasado`
  if (days === 0) return 'vence hoje'
  return `em ${days}d`
}
</script>

<template>
  <div class="toolbar" data-tour="flow-filter">
    <p>Cada pedido avança automaticamente conforme as áreas registram o trabalho no sistema e nos tablets</p>
    <div class="filter-row">
      <select v-model="customer" class="filter">
        <option value="">Todos os clientes</option>
        <option v-for="entry in store.state.customers" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
      </select>
      <button class="chip" :class="{ active: onlyRisk }" @click="onlyRisk = !onlyRisk">Somente com risco</button>
    </div>
  </div>

  <div class="callout">
    <div><strong>Como ler este quadro</strong>Os cartões não são movidos à mão. A etapa é calculada a partir das OPs, compras, apontamentos, inspeções e faturamento. Assim o quadro sempre reflete a realidade e nenhum status fica desatualizado.</div>
  </div>

  <section class="flow-board" data-tour="flow-board">
    <div v-for="(column, columnIndex) in columns" :key="column.stage" class="flow-column">
      <header><strong>{{ columnIndex + 1 }}. {{ column.stage }}</strong><span>{{ column.orders.length }}</span></header>
      <p>{{ descriptions[column.stage] }}</p>
      <button v-for="order in column.orders" :key="order.id" class="flow-card" :data-tour="order.id === firstId ? 'flow-card' : undefined" @click="ui.orderDrawer = order.id">
        <div class="priority-line" :class="order.priority"></div>
        <strong>{{ order.id }}</strong>
        <p>{{ store.customerName(order.customerId) }}<br>{{ store.itemLabel(order.itemId) }}</p>
        <div class="progress wide"><span :style="{ width: `${store.progress(order)}%` }"></span></div>
        <div class="meta"><span>{{ order.quantity }} un.</span><span>{{ fmtShortDate(order.promisedDate) }} · {{ due(order.promisedDate) }}</span></div>
        <div v-if="store.risks(order).length" class="risk-row"><span v-for="risk in store.risks(order)" :key="risk" class="status danger">{{ risk }}</span></div>
      </button>
    </div>
  </section>
</template>
