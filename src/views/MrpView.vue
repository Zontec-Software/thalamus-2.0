<script setup lang="ts">
import { computed, ref } from 'vue'
import StatusBadge from '../components/StatusBadge.vue'
import { isInjected, plansMaterial } from '../domain/catalog'
import { purchaseLot, purchaseLotRule } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { fmtNumber } from '../utils/format'

const store = useErpStore()
const onlyCritical = ref(false)

const rows = computed(() => store.state.items.filter(plansMaterial).map(item => {
  const pending = store.state.productionOrders
    .filter(op => op.status !== 'Concluída')
    .flatMap(op => op.materials.filter(line => line.itemId === item.id && !line.picked).map(line => line.required - line.reserved))
    .reduce((sum, value) => sum + value, 0)
  const injecting = store.state.productionOrders.filter(op => op.kind === 'Injeção' && op.itemId === item.id && op.status !== 'Concluída').reduce((sum, op) => sum + op.quantity - op.operations[0].good, 0)
  const incoming = isInjected(item) ? injecting : store.incoming(item.id)
  const available = store.available(item.id)
  const projected = Math.round((available + incoming - pending) * 100) / 100
  const suggestion = Math.max(0, Math.ceil(item.minimum - projected))
  // O lote de compra do cadastro manda: é a quantidade que a requisição vai gravar.
  const lot = suggestion > 0 ? purchaseLot(item, suggestion) : 0
  const lotRule = suggestion > 0 ? purchaseLotRule(item, suggestion) : ''
  return { item, available, pending, incoming, projected, suggestion, lot, lotRule }
}).filter(row => !onlyCritical.value || row.suggestion > 0))

const status = (row: { projected: number; suggestion: number; pending: number }) =>
  row.pending > 0 && row.projected < 0 ? 'Falta para OPs' : row.suggestion > 0 ? 'Abaixo do mínimo' : 'Coberto'
</script>

<template>
  <div class="toolbar">
    <p>Saldo projetado = disponível + entradas previstas (compras ou injeção) − necessidades ainda não atendidas</p>
    <button class="chip" :class="{ active: onlyCritical }" @click="onlyCritical = !onlyCritical">Somente itens com ação</button>
  </div>

  <article class="card flush" data-tour="mrp-table">
    <table>
      <thead><tr><th>Item</th><th>Tipo</th><th>Disponível</th><th>Necessidade pendente</th><th>Entradas previstas</th><th>Projetado</th><th>Mínimo</th><th>Situação</th><th>Ação</th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.item.id">
          <td><span class="cell-main">{{ row.item.code }}</span><span class="cell-sub">{{ row.item.name }}</span></td>
          <td><span class="status neutral">{{ row.item.type }}</span></td>
          <td>{{ fmtNumber(row.available, 2) }} {{ row.item.unit }}</td>
          <td :class="{ 'risk-text': row.pending > 0 }">{{ fmtNumber(row.pending, 2) }}</td>
          <td>{{ fmtNumber(row.incoming, 2) }}<span class="cell-sub">{{ isInjected(row.item) ? 'em injeção' : 'em compra' }}</span></td>
          <td><strong :class="{ 'risk-text': row.projected < row.item.minimum }">{{ fmtNumber(row.projected, 2) }}</strong></td>
          <td>{{ row.item.minimum }}</td>
          <td><StatusBadge :value="status(row)" :tone="status(row) === 'Coberto' ? 'success' : status(row) === 'Falta para OPs' ? 'danger' : 'warning'" /></td>
          <td>
            <template v-if="row.suggestion > 0 && !isInjected(row.item)">
              <button class="button small" @click="store.createRequisition(row.item.id, row.suggestion, 'Reposição de estoque mínimo')">Comprar {{ fmtNumber(row.lot, 2) }} {{ row.item.unit }}</button>
              <span v-if="row.lot > row.suggestion" class="cell-sub">falta {{ fmtNumber(row.suggestion, 2) }} · {{ row.lotRule }}</span>
            </template>
            <span v-else-if="row.suggestion > 0" class="cell-sub">Programar injeção</span>
          </td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
