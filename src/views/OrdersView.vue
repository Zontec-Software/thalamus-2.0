<script setup lang="ts">
import { computed, ref } from 'vue'
import { ClipboardList, Factory, RefreshCcw } from 'lucide-vue-next'
import BaseModal from '../components/BaseModal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { FLOW_STAGES } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtCurrency, fmtDate, fmtNumber } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const stage = ref('')
const query = ref('')
const planning = ref<string | null>(null)
const syncing = ref(false)

const orders = computed(() => store.state.salesOrders.filter(order => {
  const term = query.value.toLowerCase()
  return (!stage.value || store.stage(order) === stage.value) &&
    (!term || order.id.toLowerCase().includes(term) || store.customerName(order.customerId).toLowerCase().includes(term))
}))
const firstToPlan = computed(() => orders.value.find(order => store.stage(order) === 'Entrada')?.id)
const opSummary = (orderId: string) => {
  const list = store.opsOf(orderId)
  if (!list.length) return 'Ainda sem OPs'
  const injection = list.filter(op => op.kind === 'Injeção').length
  const assembly = list.filter(op => op.kind === 'Montagem').length
  return `${injection} OP de injeção · ${assembly} OP de montagem`
}
const productSummary = (order: typeof store.state.salesOrders[number]) => {
  if (!order.lines?.length || order.lines.length === 1) return store.itemLabel(order.itemId)
  return `${store.itemLabel(order.lines[0].itemId)} + ${order.lines.length - 1} item(ns)`
}

const preview = computed(() => {
  const order = store.state.salesOrders.find(entry => entry.id === planning.value)
  if (!order) return null
  const product = store.item(order.itemId)
  return {
    order,
    lines: (product.bom ?? []).map(line => {
      const component = store.item(line.itemId)
      const need = Math.round(line.quantity * order.quantity * 1000) / 1000
      const available = Math.max(0, store.available(component.id))
      const shortfall = Math.max(0, need - available)
      const action = shortfall === 0 ? 'Reservar do estoque' : component.moldId ? `OP de injeção (${Math.ceil(shortfall / 10) * 10} un.)` : 'Requisição de compra'
      return { component, need, available, shortfall, action }
    }),
    routing: product.routing ?? [],
  }
})

async function sync() {
  syncing.value = true
  await store.syncOmie()
  syncing.value = false
}

function confirmPlan() {
  if (!planning.value) return
  store.planOrder(planning.value)
  planning.value = null
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <input v-model="query" class="filter" placeholder="Buscar pedido ou cliente…" />
      <select v-model="stage" class="filter"><option value="">Todas as etapas</option><option v-for="entry in FLOW_STAGES" :key="entry">{{ entry }}</option></select>
    </div>
    <button class="button" :disabled="syncing" data-tour="sync-omie" @click="sync"><RefreshCcw :size="15" /> {{ syncing ? 'Consultando Omie…' : `Sincronizar com Omie${store.state.omieQueue.length ? ` (${store.state.omieQueue.length} novos)` : ''}` }}</button>
  </div>

  <div class="callout" data-tour="op-legend"><Factory :size="18" /><div><strong>Dois tipos de ordem de produção</strong>A OP de injeção fabrica a peça plástica na máquina. A OP de montagem junta essas peças no case do cliente. Clique no pedido para ver as duas separadas.</div></div>

  <article class="card flush" data-tour="orders-table">
    <table>
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Qtd.</th><th>Valor</th><th>Entrega</th><th>Prioridade</th><th>Etapa</th><th>Progresso</th><th></th></tr></thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id" class="clickable" @click="ui.orderDrawer = order.id">
          <td><span class="cell-main">{{ order.id }}</span><span class="cell-sub code">{{ order.omieId }}</span></td>
          <td>{{ store.customerName(order.customerId) }}</td>
          <td>{{ productSummary(order) }}<span class="cell-sub">{{ order.lines?.length ? `${order.lines.length} linha(s) · ` : '' }}{{ opSummary(order.id) }}</span></td>
          <td>{{ order.quantity }}</td>
          <td>{{ fmtCurrency(order.value) }}</td>
          <td>{{ fmtDate(order.promisedDate) }}<span v-if="store.risks(order).length" class="cell-sub risk-text">{{ store.risks(order)[0] }}</span></td>
          <td><StatusBadge :value="order.priority" /></td>
          <td><StatusBadge :value="store.stage(order)" tone="info" /></td>
          <td><div class="progress"><span :style="{ width: `${store.progress(order)}%` }"></span></div></td>
          <td @click.stop>
            <button v-if="store.stage(order) === 'Entrada'" class="button small" :data-tour="order.id === firstToPlan ? 'plan-btn' : undefined" @click="planning = order.id"><ClipboardList :size="13" /> Planejar</button>
            <button v-else class="button secondary small" @click="ui.orderDrawer = order.id">Detalhes</button>
          </td>
        </tr>
      </tbody>
    </table>
  </article>

  <BaseModal :open="!!preview" :title="`Planejar ${preview?.order.id}`" :subtitle="preview ? `${store.itemLabel(preview.order.itemId)} · ${preview.order.quantity} un. · entrega ${fmtDate(preview.order.promisedDate)}` : ''" width="760px" @close="planning = null">
    <template v-if="preview">
      <div class="callout"><div><strong>O que vai acontecer</strong>O sistema explode a estrutura do produto, reserva o que há em estoque, cria OPs de injeção para as peças plásticas em falta e gera requisições de compra para o restante. Tudo fica vinculado a este pedido.</div></div>
      <table>
        <thead><tr><th>Componente</th><th>Necessário</th><th>Disponível</th><th>Falta</th><th>Ação automática</th></tr></thead>
        <tbody>
          <tr v-for="line in preview.lines" :key="line.component.id">
            <td><span class="cell-main">{{ line.component.code }}</span><span class="cell-sub">{{ line.component.name }} · {{ line.component.type }}</span></td>
            <td>{{ fmtNumber(line.need, 2) }} {{ line.component.unit }}</td>
            <td>{{ fmtNumber(line.available, 2) }}</td>
            <td :class="{ 'risk-text': line.shortfall }">{{ fmtNumber(line.shortfall, 2) }}</td>
            <td><StatusBadge :value="line.action" :tone="line.shortfall === 0 ? 'success' : line.component.moldId ? 'info' : 'warning'" /></td>
          </tr>
        </tbody>
      </table>
      <p class="cell-sub" style="margin-top:12px">Roteiro de montagem: {{ preview.routing.map(step => step.name).join(' → ') }}</p>
    </template>
    <template #footer>
      <button class="button secondary" @click="planning = null">Cancelar</button>
      <button class="button" @click="confirmPlan">Confirmar planejamento</button>
    </template>
  </BaseModal>
</template>
