<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import BaseModal from '../components/BaseModal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { purchaseLot, purchaseLotRule } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { hasFullAccess } from '../domain/access'
import type { RequisitionStatus } from '../types/domain'
import { daysUntil, fmtCurrency, fmtDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const COLUMNS: { status: RequisitionStatus; hint: string; action?: string; owner: string }[] = [
  { status: 'Solicitada', hint: 'Gerada pelo MRP ou manualmente', action: 'Abrir cotação', owner: 'Compras' },
  { status: 'Em cotação', hint: 'Aguardando aprovação do gestor', action: 'Aprovar compra', owner: 'Gestor' },
  { status: 'Aprovada', hint: 'Pronta para emitir no Omie', action: 'Emitir pedido no Omie', owner: 'Compras' },
  { status: 'Pedido emitido', hint: 'Aguardando entrega do fornecedor', action: 'Registrar recebimento', owner: 'Almoxarifado' },
  { status: 'Recebida', hint: 'Material reservado para as OPs', owner: '' },
]
const showNew = ref(false)
const form = ref({ itemId: 'mp-abs', quantity: 25, origin: 'Reposição de estoque' })
const purchasable = computed(() => store.state.items.filter(item => ['MP', 'CP', 'EM'].includes(item.type)))

const byStatus = (status: RequisitionStatus) => store.state.requisitions.filter(req => req.status === status).slice(0, status === 'Recebida' ? 6 : 50)
const canAct = (owner: string) => hasFullAccess(ui.role) || ui.role === owner
const totalOpen = computed(() => store.state.requisitions.filter(req => req.status !== 'Recebida').reduce((sum, req) => sum + req.quantity * req.unitPrice, 0))

/** O cadastro do item arredonda a quantidade pedida; mostramos isso antes de criar a requisição. */
const lotPreview = computed(() => {
  const item = store.item(form.value.itemId)
  const lot = form.value.quantity > 0 ? purchaseLot(item, form.value.quantity) : 0
  return { lot, rule: purchaseLotRule(item, form.value.quantity), changed: lot > form.value.quantity }
})

function create() {
  if (form.value.quantity <= 0) return ui.notify('error', 'Informe uma quantidade válida')
  store.createRequisition(form.value.itemId, form.value.quantity, form.value.origin || 'Solicitação manual')
  showNew.value = false
}
</script>

<template>
  <div class="toolbar">
    <p>Compras em aberto: <strong>{{ fmtCurrency(totalOpen) }}</strong> · demandas, cotações, pedidos e recebimentos separados</p>
    <div class="action-row"><button class="button secondary" @click="ui.openRecord('demand', 'new')"><Plus :size="15" /> Nova demanda</button><button class="button" @click="showNew = true"><Plus :size="15" /> Nova requisição</button></div>
  </div>

  <article v-if="store.state.purchaseOrders.length" class="card flush" data-tour="purchase-orders" style="margin-bottom:16px">
    <div class="section-head"><div><h2>Pedidos de compra</h2><p>Compromissos aprovados e recebimento parcial. O contas a pagar fica no Omie</p></div></div>
    <table><thead><tr><th>Pedido</th><th>Fornecedor</th><th>Item</th><th>Quantidade</th><th>Entrega</th><th>Valor</th><th>Status</th><th></th></tr></thead>
      <tbody><tr v-for="order in store.state.purchaseOrders" :key="order.id" class="clickable" @click="ui.openRecord('purchase', order.id)"><td><b>{{ order.id }}</b><small class="cell-sub">{{ order.demandIds.join(', ') }}</small></td><td>{{ store.partnerName(order.supplierId) }}</td><td>{{ store.itemLabel(order.itemId) }}</td><td>{{ order.received }}/{{ order.quantity }} {{ store.item(order.itemId).unit }}</td><td>{{ fmtDate(order.promisedDate) }}</td><td>{{ fmtCurrency(order.quantity * order.unitPrice) }}</td><td><StatusBadge :value="order.status" /></td><td @click.stop><div class="action-row"><button v-if="order.status === 'Aguardando aprovação'" class="button small" @click="store.advancePurchaseOrder(order.id)">Aprovar</button><button v-else-if="order.status === 'Aprovado'" class="button secondary small" @click="store.advancePurchaseOrder(order.id, true)">Receber parcial</button><button v-if="order.status === 'Aprovado' || order.status === 'Recebido parcial'" class="button small" @click="store.advancePurchaseOrder(order.id)">Receber saldo</button></div></td></tr></tbody>
    </table>
  </article>

  <div class="section-head"><div><h2>Requisições em transição</h2><p>O novo fluxo passa por Demandas e Pedido de compra; estas requisições preservam o cenário atual.</p></div></div>
  <section class="pipeline" data-tour="purchase-pipeline">
    <div v-for="column in COLUMNS" :key="column.status" class="pipeline-col">
      <header><div>{{ column.status }}<small>{{ column.hint }}</small></div><span>{{ store.state.requisitions.filter(req => req.status === column.status).length }}</span></header>
      <div v-for="req in byStatus(column.status)" :key="req.id" class="pipe-card">
        <strong>{{ req.id }}<template v-if="req.omiePo"> · {{ req.omiePo }}</template></strong>
        <p>{{ store.item(req.itemId).name }} · {{ req.quantity }} {{ store.item(req.itemId).unit }}<br>{{ req.supplier }} · {{ fmtCurrency(req.quantity * req.unitPrice) }}<br>Origem: {{ req.origin }}</p>
        <div class="kv"><span>Necessário até</span><b :class="{ 'risk-text': column.status !== 'Recebida' && daysUntil(req.neededBy) < 0 }">{{ fmtDate(req.neededBy) }}</b></div>
        <button v-if="column.action" class="button small block" style="margin-top:8px" :disabled="!canAct(column.owner)" :title="canAct(column.owner) ? '' : `Ação do perfil ${column.owner}`" @click="store.advanceRequisition(req.id)">{{ column.action }}</button>
        <small v-if="column.action && !canAct(column.owner)" class="cell-sub">Responsável: {{ column.owner }}</small>
      </div>
    </div>
  </section>

  <BaseModal :open="showNew" title="Nova requisição de compra" subtitle="Para reposição ou necessidades fora do planejamento" @close="showNew = false">
    <div class="field"><label>Item</label><select v-model="form.itemId"><option v-for="item in purchasable" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select><small>Disponível: {{ store.available(form.itemId) }} {{ store.item(form.itemId).unit }} · fornecedor {{ store.item(form.itemId).supplier }} · lead time {{ store.item(form.itemId).leadTimeDays }} dias</small></div>
    <div class="form-grid">
      <div class="field"><label>Quantidade ({{ store.item(form.itemId).unit }})</label><input v-model.number="form.quantity" type="number" min="1" /><small v-if="lotPreview.changed">A requisição será de <b>{{ lotPreview.lot }} {{ store.item(form.itemId).unit }}</b>: o cadastro exige {{ lotPreview.rule }}.</small></div>
      <div class="field"><label>Motivo / origem</label><input v-model="form.origin" /></div>
    </div>
    <template #footer><button class="button secondary" @click="showNew = false">Cancelar</button><button class="button" @click="create">Criar requisição</button></template>
  </BaseModal>
</template>
