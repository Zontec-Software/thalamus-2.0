<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Ban, PackageCheck, Truck } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { openToReceive, RECEIPT_CHECKS } from '../domain/enterprise'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { PurchaseOrder, Receipt, ReceiptCheck } from '../types/domain'
import { daysUntil, fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const openId = ref('')
const form = reactive({ received: 0, accepted: 0, check: 'Conforme' as ReceiptCheck, note: '' })
const decisionNotes = ref<Record<string, string>>({})

const toReceive = computed(() => store.state.purchaseOrders
  .filter(order => (order.status === 'Aprovado' || order.status === 'Recebido parcial') && openToReceive(store.state, order) > 0)
  .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate)))
const blocked = computed(() => store.state.receipts.filter(entry => entry.status === 'Bloqueado'))
const recent = computed(() => store.state.receipts.filter(entry => entry.status === 'Concluído').slice(0, 8))
const canDecide = computed(() => store.can('recebimento.bloqueio.decidir'))

function start(order: PurchaseOrder) {
  const open = openToReceive(store.state, order)
  openId.value = order.id
  Object.assign(form, { received: open, accepted: open, check: 'Conforme', note: '' })
}
function onCheck() {
  if (form.check === 'Conforme') form.accepted = form.received
}
function confirm(order: PurchaseOrder) {
  if (store.receivePurchase(order.id, { ...form, accepted: form.check === 'Conforme' ? form.received : form.accepted })) openId.value = ''
}
function decide(receipt: Receipt, decision: 'Aceitar' | 'Devolver') {
  if (store.decideReceipt(receipt.id, decision, decisionNotes.value[receipt.id] ?? '')) decisionNotes.value[receipt.id] = ''
}
</script>

<template>
  <div class="toolbar">
    <p>Conferência do que chegou. Só a quantidade aceita entra no saldo; o restante fica bloqueado até outra pessoa decidir.</p>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">A receber <Truck :size="17" /></div><strong>{{ toReceive.length }}</strong><small>{{ toReceive.filter(order => daysUntil(order.promisedDate) < 0).length }} com entrega atrasada</small></article>
    <article class="metric"><div class="metric-head">Bloqueados <Ban :size="17" /></div><strong :class="{ 'risk-text': blocked.length }">{{ blocked.length }}</strong><small>Aguardam aceitar ou devolver</small></article>
    <article class="metric"><div class="metric-head">Conferidos <PackageCheck :size="17" /></div><strong>{{ store.state.receipts.length }}</strong><small>Recebimentos registrados</small></article>
  </section>

  <article v-if="blocked.length" class="card flush" data-tour="receiving-blocked">
    <div class="section-head"><div><h2>Bloqueados</h2><p>Quem recebeu não decide. A decisão exige observação.</p></div></div>
    <table>
      <thead><tr><th>Recebimento</th><th>Item</th><th>Recebido</th><th>Conferência</th><th>Decisão</th></tr></thead>
      <tbody>
        <tr v-for="receipt in blocked" :key="receipt.id">
          <td><span class="cell-main">{{ receipt.id }} · {{ receipt.purchaseOrderId }}</span><span class="cell-sub">{{ store.partnerName(receipt.supplierId) }} · {{ receipt.receivedBy }}, {{ fmtDateTime(receipt.receivedAt) }}</span></td>
          <td>{{ store.itemLabel(receipt.itemId) }}</td>
          <td>{{ receipt.accepted }} aceito(s) · <b class="risk-text">{{ receipt.received - receipt.accepted }} bloqueado(s)</b></td>
          <td><StatusBadge :value="receipt.check" /><span class="cell-sub">{{ receipt.note }}</span></td>
          <td>
            <p v-if="receipt.receivedBy === ui.userName" class="cell-sub">Você recebeu: a decisão é de outra pessoa.</p>
            <p v-else-if="!canDecide" class="cell-sub">Decide quem tem "Decidir bloqueio de recebimento".</p>
            <div v-else class="filter-row">
              <input v-model="decisionNotes[receipt.id]" class="filter" placeholder="Observação" />
              <button class="button small" :disabled="!decisionNotes[receipt.id]?.trim()" @click="decide(receipt, 'Aceitar')">Aceitar</button>
              <button class="button secondary small" :disabled="!decisionNotes[receipt.id]?.trim()" @click="decide(receipt, 'Devolver')">Devolver</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </article>

  <article class="card flush" data-tour="record-list">
    <div class="section-head"><div><h2>Pedidos de compra a receber</h2><p>O sistema propõe a quantidade em aberto; confirme o que chegou.</p></div></div>
    <table>
      <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Item</th><th>Em aberto</th><th>Previsto</th><th></th></tr></thead>
      <tbody>
        <template v-for="order in toReceive" :key="order.id">
          <tr>
            <td><span class="cell-main">{{ order.id }}</span><StatusBadge :value="order.status" /></td>
            <td>{{ store.partnerName(order.supplierId) }}</td>
            <td>{{ store.itemLabel(order.itemId) }}</td>
            <td>{{ openToReceive(store.state, order) }} de {{ order.quantity }} {{ store.item(order.itemId).unit }}</td>
            <td :class="{ 'risk-text': daysUntil(order.promisedDate) < 0 }">{{ fmtDate(order.promisedDate) }}</td>
            <td><button v-if="openId !== order.id" class="button small" @click="start(order)">Conferir</button></td>
          </tr>
          <tr v-if="openId === order.id">
            <td colspan="6">
              <div class="inline-form">
                <div class="form-grid">
                  <div class="field"><label>Quantidade recebida</label><input v-model.number="form.received" type="number" min="1" @input="onCheck" /></div>
                  <div class="field"><label>Conferência</label><select v-model="form.check" @change="onCheck"><option v-for="check in RECEIPT_CHECKS" :key="check">{{ check }}</option></select></div>
                  <div v-if="form.check !== 'Conforme'" class="field"><label>Aceita no saldo</label><input v-model.number="form.accepted" type="number" min="0" :max="form.received" /><small>O restante fica bloqueado.</small></div>
                  <div v-if="form.check !== 'Conforme'" class="field"><label>Observação</label><input v-model="form.note" placeholder="O que foi encontrado" /></div>
                </div>
                <div class="filter-row">
                  <button class="button" @click="confirm(order)">Confirmar recebimento</button>
                  <button class="button secondary" @click="openId = ''">Cancelar</button>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <p v-if="!toReceive.length" class="empty-note">Nada a receber agora.</p>
  </article>

  <article v-if="recent.length" class="card flush">
    <div class="section-head"><div><h2>Últimos recebimentos</h2></div></div>
    <table>
      <thead><tr><th>Recebimento</th><th>Item</th><th>Aceito</th><th>Conferência</th><th>Decisão</th></tr></thead>
      <tbody>
        <tr v-for="receipt in recent" :key="receipt.id">
          <td><span class="cell-main">{{ receipt.id }} · {{ receipt.purchaseOrderId }}</span><span class="cell-sub">{{ receipt.receivedBy }}, {{ fmtDateTime(receipt.receivedAt) }}</span></td>
          <td>{{ store.itemLabel(receipt.itemId) }}</td>
          <td>{{ receipt.accepted }} de {{ receipt.received }}</td>
          <td><StatusBadge :value="receipt.check" /></td>
          <td>{{ receipt.decision ? `${receipt.decision} · ${receipt.decidedBy}` : '—' }}<span class="cell-sub">{{ receipt.decisionNote }}</span></td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
