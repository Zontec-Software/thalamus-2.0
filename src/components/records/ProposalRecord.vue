<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CheckCircle2, Plus, Send, Trash2, XCircle } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import { DEFAULT_PRICE_TABLE, currentPrice, sellable } from '../../domain/catalog'
import { today } from '../../domain/engine'
import { deliveryLead, proposalTotal } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtCurrency, fmtDate } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()

const proposal = computed(() => store.state.proposals.find(entry => entry.id === props.id))
const draft = computed(() => proposal.value?.status === 'Rascunho')
const opportunity = computed(() => store.state.opportunities.find(entry => entry.id === proposal.value?.opportunityId))
const order = computed(() => store.state.salesOrders.find(entry => entry.id === proposal.value?.salesOrderId))
const STEPS = ['Rascunho', 'Enviada', 'Aceita'] as const
const stepIndex = computed(() => STEPS.indexOf(proposal.value?.status as typeof STEPS[number]))

const subtotal = computed(() => proposal.value?.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) ?? 0)
const cost = computed(() => proposal.value?.lines.reduce((sum, line) => {
  const unit = line.itemId ? store.item(line.itemId).cost : store.state.services.find(entry => entry.id === line.serviceId)?.cost ?? 0
  return sum + unit * line.quantity
}, 0) ?? 0)
const total = computed(() => proposal.value ? proposalTotal(proposal.value) : 0)
const margin = computed(() => total.value ? Math.round((1 - cost.value / total.value) * 100) : 0)
const lead = computed(() => Math.max(0, ...(proposal.value?.lines.filter(line => line.itemId).map(line => deliveryLead(store.state, store.item(line.itemId!))) ?? [])))
const table = computed(() => store.state.priceTables.find(entry => entry.id === DEFAULT_PRICE_TABLE))

/** Preço de tabela de cada linha, para mostrar quanto a negociação se afastou dele. */
function tablePrice(itemId?: string) {
  if (!itemId) return undefined
  return currentPrice(store.item(itemId))?.value
}

const newLine = reactive({ kind: 'item' as 'item' | 'service', id: '', quantity: 1 })
const products = computed(() => store.state.items.filter(entry => sellable(entry) && entry.type !== 'SV'))
const services = computed(() => store.state.services.filter(entry => entry.sellable && entry.status === 'Ativo'))
const rejecting = ref(false)
const rejection = ref('')

function addLine() {
  const id = newLine.id || (newLine.kind === 'item' ? products.value[0]?.id : services.value[0]?.id)
  if (!id) return
  store.addProposalLine(props.id, newLine.kind === 'item' ? { itemId: id, quantity: newLine.quantity } : { serviceId: id, quantity: newLine.quantity })
}

function editLine(index: number, field: 'quantity' | 'unitPrice', event: Event) {
  store.updateProposalLine(props.id, index, { [field]: Number((event.target as HTMLInputElement).value) })
}

function editCondition(field: 'discount' | 'validUntil' | 'suggestedDate' | 'paymentTerms', event: Event) {
  const value = (event.target as HTMLInputElement).value
  store.updateProposal(props.id, { [field]: field === 'discount' ? Number(value) : value })
}

function reject() {
  if (store.rejectProposal(props.id, rejection.value)) rejecting.value = false
}

function openOrder(id: string) {
  ui.closeRecord()
  ui.orderDrawer = id
}
</script>

<template>
  <template v-if="proposal">
    <RecordHeader :eyebrow="`Proposta comercial · ${proposal.id}`" :title="store.partnerName(proposal.partnerId)" :subtitle="opportunity?.title" />
    <div class="drawer-body">
      <div v-if="proposal.status === 'Recusada'" class="notice danger">Recusada: {{ proposal.rejectionReason }}</div>
      <div v-else class="stage-stepper">
        <div v-for="(step, index) in STEPS" :key="step" class="stage-step" :class="{ done: index < stepIndex, current: index === stepIndex }"><i></i><span>{{ step }}</span></div>
      </div>

      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ fmtCurrency(total) }}</strong><span>total</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': margin < 35 }">{{ margin }}%</strong><span>margem bruta estimada</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': proposal.validUntil < today() && proposal.status === 'Enviada' }">{{ fmtDate(proposal.validUntil) }}</strong><span>validade</span></div>
        <div class="mini-stat"><strong>{{ fmtDate(proposal.suggestedDate) }}</strong><span>entrega sugerida</span></div>
      </div>
      <div v-if="margin < 35" class="notice warning">Margem abaixo de 35%. Revise preço ou desconto antes de enviar.</div>

      <div class="drawer-actions" data-tour="prop-actions">
        <button v-if="draft" class="button" @click="store.advanceProposal(proposal.id)"><Send :size="15" /> Enviar ao cliente</button>
        <template v-if="proposal.status === 'Enviada'">
          <button class="button" @click="store.advanceProposal(proposal.id)"><CheckCircle2 :size="15" /> Cliente aceitou</button>
          <button class="button secondary" @click="rejecting = !rejecting"><XCircle :size="15" /> Cliente recusou</button>
        </template>
        <button v-if="order" class="button" @click="openOrder(order.id)">Abrir pedido {{ order.id }}</button>
        <button v-if="opportunity" class="button secondary" @click="ui.openRecord('opportunity', opportunity.id)">Ver oportunidade</button>
      </div>
      <div v-if="rejecting" class="inline-form row">
        <input v-model="rejection" class="filter grow" placeholder="Motivo informado pelo cliente" />
        <button class="button danger small" @click="reject">Registrar recusa</button>
      </div>
      <p v-if="proposal.status === 'Enviada'" class="hint">Ao aceitar, o pedido é aprovado no Omie simulado e entra no fluxo de produção com todas as linhas de produto. Cada kit virtual é explodido nos componentes da estrutura vigente, com o preço rateado entre eles.</p>

      <div data-tour="prop-items">
      <h3 class="drawer-title">Itens</h3>
      <div class="card flush">
        <table class="compact">
          <thead><tr><th>Descrição</th><th>Qtd.</th><th>Preço un.</th><th>Total</th><th v-if="draft"></th></tr></thead>
          <tbody>
            <tr v-for="(line, index) in proposal.lines" :key="index">
              <td>
                <b>{{ line.description }}</b>
                <small class="cell-sub">
                  <template v-if="line.itemId">{{ store.item(line.itemId).type === 'KT' ? 'Kit virtual · explode em componentes no aceite' : `Produto · disponível ${store.available(line.itemId)} un.` }}</template>
                  <template v-else>Serviço</template>
                </small>
              </td>
              <td><input v-if="draft" class="cell-input" type="number" min="1" :value="line.quantity" @change="editLine(index, 'quantity', $event)" /><template v-else>{{ line.quantity }}</template></td>
              <td>
                <input v-if="draft" class="cell-input" type="number" min="0" :value="line.unitPrice" @change="editLine(index, 'unitPrice', $event)" /><template v-else>{{ fmtCurrency(line.unitPrice) }}</template>
                <small v-if="tablePrice(line.itemId) !== undefined" class="cell-sub">
                  {{ table?.name ?? 'Tabela padrão' }} {{ fmtCurrency(tablePrice(line.itemId)!) }}<template v-if="line.unitPrice !== tablePrice(line.itemId)"> · {{ line.unitPrice > tablePrice(line.itemId)! ? '+' : '' }}{{ Math.round((line.unitPrice / tablePrice(line.itemId)! - 1) * 100) }}%</template>
                </small>
                <small v-else-if="line.itemId" class="cell-sub risk-text">Sem preço de tabela</small>
              </td>
              <td>{{ fmtCurrency(line.quantity * line.unitPrice) }}</td>
              <td v-if="draft"><button class="icon-plain" title="Remover" @click="store.removeProposalLine(proposal.id, index)"><Trash2 :size="15" /></button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!proposal.lines.length" class="empty-note">Adicione produtos ou serviços.</p>
      </div>
      <div v-if="draft" class="inline-form row">
        <select v-model="newLine.kind" class="filter" @change="newLine.id = ''"><option value="item">Produto</option><option value="service">Serviço</option></select>
        <select v-model="newLine.id" class="filter grow">
          <option value="">Escolha…</option>
          <template v-if="newLine.kind === 'item'"><option v-for="item in products" :key="item.id" :value="item.id">{{ store.itemLabel(item.id) }}</option></template>
          <template v-else><option v-for="service in services" :key="service.id" :value="service.id">{{ service.name }} · {{ fmtCurrency(service.price) }}</option></template>
        </select>
        <input v-model.number="newLine.quantity" class="filter narrow" type="number" min="1" />
        <button class="button small" @click="addLine"><Plus :size="14" /> Adicionar</button>
      </div>

      <h3 class="drawer-title">Condições</h3>
      <div class="card kv-card">
        <div class="kv"><span>Subtotal</span><b>{{ fmtCurrency(subtotal) }}</b></div>
        <div class="kv"><span>Desconto (%)</span><input v-if="draft" class="cell-input" type="number" min="0" max="15" :value="proposal.discount" @change="editCondition('discount', $event)" /><b v-else>{{ proposal.discount }}%</b></div>
        <div class="kv"><span>Condição de pagamento</span><select v-if="draft" class="cell-input wide" :value="proposal.paymentTerms" @change="editCondition('paymentTerms', $event)"><option>À vista</option><option>28 dias</option><option>28/56 dias</option><option>30/60/90 dias</option></select><b v-else>{{ proposal.paymentTerms ?? '28 dias' }}</b></div>
        <div class="kv"><span>Validade</span><input v-if="draft" class="cell-input wide" type="date" :value="proposal.validUntil" @change="editCondition('validUntil', $event)" /><b v-else>{{ fmtDate(proposal.validUntil) }}</b></div>
        <div class="kv"><span>Entrega sugerida</span><input v-if="draft" class="cell-input wide" type="date" :value="proposal.suggestedDate" @change="editCondition('suggestedDate', $event)" /><b v-else>{{ fmtDate(proposal.suggestedDate) }}</b></div>
        <div class="kv"><span>Prazo dos produtos</span><b>{{ lead }} dias</b><small class="cell-sub">fabricação mais a compra dos componentes</small></div>
        <div class="kv"><span>Total</span><b>{{ fmtCurrency(total) }}</b></div>
      </div>
      </div>

      <RecordTimeline :ref-id="proposal.id" :created-at="proposal.createdAt" created-text="Proposta criada" />
    </div>
  </template>
  <p v-else class="empty-note">Proposta não encontrada.</p>
</template>
