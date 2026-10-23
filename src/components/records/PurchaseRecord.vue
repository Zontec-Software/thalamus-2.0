<script setup lang="ts">
import { computed } from 'vue'
import { Ban, CheckCircle2, PackageCheck, PackagePlus } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { budgetSummary } from '../../domain/budget'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()

const order = computed(() => store.state.purchaseOrders.find(entry => entry.id === props.id))
const STEPS = ['Aguardando aprovação', 'Aprovado', 'Recebido parcial', 'Recebido'] as const
const stepIndex = computed(() => STEPS.indexOf(order.value?.status as typeof STEPS[number]))
const demands = computed(() => store.state.demands.filter(entry => order.value?.demandIds.includes(entry.id)))
const budget = computed(() => store.state.budgets.find(entry => entry.id === order.value?.budgetId))
const budgetCategory = computed(() => store.state.budgetCategories.find(entry => entry.id === budget.value?.categoryId))
const budgetStatus = computed(() => budget.value ? budgetSummary(store.state, budget.value.categoryId, budget.value.period) : undefined)
const movements = computed(() => store.state.movements.filter(entry => entry.reference === props.id))
const project = computed(() => store.state.projects.find(entry => entry.id === order.value?.projectId))
const bestPrice = computed(() => Math.min(...(order.value?.quotes.map(entry => entry.unitPrice) ?? [0])))
</script>

<template>
  <template v-if="order">
    <RecordHeader :eyebrow="`Pedido de compra · ${order.id}`" :title="store.partnerName(order.supplierId)" :subtitle="`${store.itemLabel(order.itemId)} · ${order.quantity} ${store.item(order.itemId).unit}`" />
    <div class="drawer-body">
      <div data-tour="po-flow">
      <div v-if="order.status === 'Cancelado'" class="notice danger">Pedido cancelado.</div>
      <div v-else class="stage-stepper">
        <div v-for="(step, index) in STEPS" :key="step" class="stage-step" :class="{ done: index < stepIndex, current: index === stepIndex }"><i></i><span>{{ step }}</span></div>
      </div>
      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ order.received }}/{{ order.quantity }}</strong><span>recebido</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(order.unitPrice) }}</strong><span>preço unitário</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(order.quantity * order.unitPrice) }}</strong><span>valor total</span></div>
        <div class="mini-stat"><strong>{{ fmtDate(order.promisedDate) }}</strong><span>entrega prometida</span></div>
      </div>
      <div class="progress wide"><span :style="{ width: `${order.received / order.quantity * 100}%` }"></span></div>

      <div class="drawer-actions">
        <button v-if="order.status === 'Aguardando aprovação'" class="button" @click="store.advancePurchaseOrder(order.id)"><CheckCircle2 :size="15" /> Aprovar e enviar ao Omie</button>
        <button v-if="order.status === 'Aprovado'" class="button secondary" @click="store.advancePurchaseOrder(order.id, true)"><PackagePlus :size="15" /> Receber parcial</button>
        <button v-if="order.status === 'Aprovado' || order.status === 'Recebido parcial'" class="button" @click="store.advancePurchaseOrder(order.id)"><PackageCheck :size="15" /> Receber saldo</button>
        <button v-if="order.received === 0 && order.status !== 'Cancelado'" class="button ghost" @click="store.cancelPurchaseOrder(order.id)"><Ban :size="15" /> Cancelar</button>
      </div>
      <p v-if="order.status === 'Aguardando aprovação'" class="hint">A demanda já gera previsão. O recebimento conclui o fluxo físico; o contas a pagar fica no Omie e somente o pagamento confirmado por ele vira realizado.</p>
      </div>

      <h3 class="drawer-title">Cotações</h3>
      <div class="card flush" data-tour="po-quotes">
        <table class="compact">
          <thead><tr><th>Fornecedor</th><th>Preço</th><th>Prazo</th><th></th></tr></thead>
          <tbody>
            <tr v-for="quote in order.quotes" :key="quote.supplierId" :class="{ selected: quote.selected }">
              <td><b>{{ store.partnerName(quote.supplierId) }}</b><small v-if="quote.unitPrice === bestPrice" class="cell-sub">Menor preço</small></td>
              <td>{{ fmtCurrency(quote.unitPrice) }}</td>
              <td>{{ quote.leadDays }} dias</td>
              <td><StatusBadge v-if="quote.selected" value="Escolhida" tone="success" /><button v-else-if="order.status === 'Aguardando aprovação'" class="button secondary small" @click="store.selectQuote(order.id, quote.supplierId)">Escolher</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div data-tour="po-links">
      <h3 class="drawer-title">Vínculos</h3>
      <button v-for="demand in demands" :key="demand.id" class="list-row" @click="ui.openRecord('demand', demand.id)">
        <div><strong>{{ demand.id }} · {{ demand.description }}</strong><span>{{ demand.origin }} {{ demand.originId }}</span></div>
        <StatusBadge :value="demand.status" />
      </button>
      <button v-if="project" class="list-row" @click="ui.openRecord('project', project.id)">
        <div><strong>Projeto {{ project.id }}</strong><span>{{ project.name }}</span></div><StatusBadge :value="project.status" />
      </button>
      <button v-if="budget" class="list-row" @click="ui.openRecord('budget', budget.id)">
        <div><strong>{{ budgetCategory?.name }} · {{ budget.period }}</strong><span>Saldo {{ fmtCurrency(budgetStatus?.balance ?? 0) }}</span></div><span class="link">Abrir</span>
      </button>
      </div>

      <template v-if="movements.length">
        <h3 class="drawer-title">Entradas no estoque</h3>
        <div v-for="movement in movements" :key="movement.id" class="list-row static">
          <div><strong>+{{ movement.quantity }} {{ store.item(movement.itemId).unit }}</strong><span>{{ fmtDateTime(movement.at) }} · {{ store.item(movement.itemId).location }}</span></div>
        </div>
      </template>

      <RecordTimeline :ref-id="order.id" :created-at="order.createdAt" created-text="Pedido criado" />
    </div>
  </template>
  <p v-else class="empty-note">Pedido não encontrado.</p>
</template>
