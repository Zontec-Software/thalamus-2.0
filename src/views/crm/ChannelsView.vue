<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { CHANNEL_CASE_CHANNELS, channelCaseStatus, channelOf } from '../../domain/crmRoutine'
import { currentOwnerOf } from '../../domain/crmEffort'
import { addDays, today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { ChannelCase } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { useCrmScope } from './shared'

const store = useErpStore()
const ui = useUiStore()
const { canTeam } = useCrmScope()
const tab = ref<'cases' | 'orders' | 'partners'>('cases')
const canManage = computed(() => store.can('modulo.crm.gerir'))

const cases = computed(() => store.state.channelCases.filter(entry => entry.tenantId === ui.activeTenantId && (canTeam.value || entry.handlerId === ui.sessionUserId))
  .sort((a, b) => Number(!!a.answeredAt) - Number(!!b.answeredAt) || a.deadline.localeCompare(b.deadline)))
const orders = computed(() => store.state.salesOrders.filter(entry => channelOf(entry) !== 'Direto' && (canTeam.value || entry.accountOwnerId === ui.sessionUserId)))
const partnerRows = computed(() => {
  const ids = new Set([...orders.value.map(entry => entry.customerId), ...cases.value.map(entry => entry.partnerId)])
  return [...ids].map(id => {
    const partner = store.state.partners.find(entry => entry.id === id)
    return {
      id, name: store.partnerName(id), commercialClass: partner?.commercialClass ?? 'A classificar', owner: partner ? currentOwnerOf(partner) : undefined,
      channels: [...new Set([...orders.value.filter(entry => entry.customerId === id).map(channelOf), ...cases.value.filter(entry => entry.partnerId === id).map(entry => entry.channel)])].join(', '),
      orders: orders.value.filter(entry => entry.customerId === id).length, cases: cases.value.filter(entry => entry.partnerId === id).length,
    }
  })
})
const overdue = computed(() => cases.value.filter(entry => channelCaseStatus(entry) === 'Vencido').length)
const delivery = (order: { shipment?: { deliveredAt?: string } }) => order.shipment?.deliveredAt ? fmtDate(order.shipment.deliveredAt) : '—'
const invoiceOf = (orderId: string) => store.state.saleInvoices.find(entry => entry.salesOrderId === orderId && entry.status === 'Autorizada')
const handlers = computed(() => store.state.sellerLinks.filter(entry => entry.tenantId === ui.activeTenantId))

const creating = ref(false)
const form = reactive({ channel: 'Mercado Livre' as ChannelCase['channel'], partnerId: '', externalId: '', subject: '', handlerId: '', deadline: addDays(today(), 2), salesOrderId: '' })
const customerOrders = computed(() => store.state.salesOrders.filter(entry => entry.customerId === form.partnerId && channelOf(entry) === form.channel))
function start() {
  Object.assign(form, { channel: 'Mercado Livre', partnerId: '', externalId: '', subject: '', handlerId: ui.sessionUserId, deadline: addDays(today(), 2), salesOrderId: '' })
  creating.value = true
}
function create() {
  if (store.createChannelCase({ tenantId: ui.activeTenantId, channel: form.channel, partnerId: form.partnerId, externalId: form.externalId, subject: form.subject, handlerId: form.handlerId, deadline: form.deadline, salesOrderId: form.salesOrderId || undefined })) creating.value = false
}
const answering = reactive({ id: '', text: '' })
function answer() {
  if (store.answerChannelCase(answering.id, answering.text)) Object.assign(answering, { id: '', text: '' })
}
const linking = reactive({ id: '', orderId: '' })
const linkable = computed(() => {
  const record = store.state.channelCases.find(entry => entry.id === linking.id)
  return record ? store.state.salesOrders.filter(entry => entry.customerId === record.partnerId && channelOf(entry) === record.channel) : []
})
function link() {
  if (store.linkChannelOrder(linking.id, linking.orderId)) Object.assign(linking, { id: '', orderId: '' })
}
</script>

<template>
  <p class="notice">Simulação: os atendimentos e pedidos do marketplace chegam por integração que ainda não existe. O pedido de canal mantém o dono da conta; quem atende o canal não vira dono do cliente.</p>

  <div class="tab-row">
    <div class="tabs" data-tour="crm-channels">
      <button type="button" :class="{ active: tab === 'cases' }" @click="tab = 'cases'">Atendimentos<b v-if="overdue">{{ overdue }}</b></button>
      <button type="button" :class="{ active: tab === 'orders' }" @click="tab = 'orders'">Pedidos de canal</button>
      <button type="button" :class="{ active: tab === 'partners' }" @click="tab = 'partners'">Parceiros</button>
    </div>
    <button v-if="canManage && tab === 'cases'" class="button" @click="start"><Plus :size="14" /> Novo atendimento</button>
  </div>

  <article v-if="tab === 'cases'" class="card flush">
    <table class="dense">
      <thead><tr><th>Atendimento</th><th>Canal</th><th>Cliente</th><th>Responsável</th><th>Prazo de resposta</th><th>Situação</th><th>Pedido</th><th></th></tr></thead>
      <tbody>
        <tr v-for="entry in cases" :key="entry.id">
          <td><span class="cell-main">{{ entry.subject }}</span><span class="cell-sub">{{ entry.id }} · {{ entry.externalId }}</span></td>
          <td>{{ entry.channel }}</td>
          <td>{{ store.partnerName(entry.partnerId) }}</td>
          <td>{{ store.userName(entry.handlerId) }}</td>
          <td :class="{ 'risk-text': channelCaseStatus(entry) === 'Vencido' }">{{ fmtDate(entry.deadline) }}<span v-if="entry.answeredAt" class="cell-sub">respondido em {{ fmtDate(entry.answeredAt) }}</span></td>
          <td><StatusBadge :value="channelCaseStatus(entry)" /></td>
          <td>{{ entry.salesOrderId ?? '—' }}<button v-if="!entry.salesOrderId && canManage" type="button" class="link" style="margin-left:6px" @click="linking.id = entry.id">ligar pedido</button></td>
          <td><button v-if="!entry.answeredAt && canManage" class="button small" @click="answering.id = entry.id">Responder</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!cases.length" class="empty-note">Nenhum atendimento de canal.</p>
  </article>

  <article v-else-if="tab === 'orders'" class="card flush">
    <table class="dense">
      <thead><tr><th>Pedido</th><th>Canal</th><th>Identificador</th><th>Cliente</th><th>Dono da conta</th><th>Prometido</th><th>Entrega</th><th>Nota</th><th>Valor</th></tr></thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td><span class="cell-main code">{{ order.id }}</span></td>
          <td>{{ channelOf(order) }}</td>
          <td>{{ order.externalKey ?? '—' }}</td>
          <td>{{ store.partnerName(order.customerId) }}</td>
          <td>{{ order.accountOwnerId ? store.userName(order.accountOwnerId) : 'Sem dono' }}</td>
          <td>{{ fmtDate(order.promisedDate) }}</td>
          <td :class="{ 'risk-text': order.shipment?.deliveredAt && order.shipment.deliveredAt.slice(0, 10) > order.promisedDate }">{{ delivery(order) }}</td>
          <td>{{ invoiceOf(order.id)?.number ?? '—' }}</td>
          <td>{{ fmtCurrency(order.value) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!orders.length" class="empty-note">Nenhum pedido de canal.</p>
  </article>

  <article v-else class="card flush">
    <table class="dense">
      <thead><tr><th>Parceiro</th><th>Canais</th><th>Classe comercial</th><th>Dono da conta</th><th>Pedidos</th><th>Atendimentos</th></tr></thead>
      <tbody>
        <tr v-for="row in partnerRows" :key="row.id" class="clickable" @click="$router.push(`/parceiros/${row.id}`)">
          <td><span class="cell-main">{{ row.name }}</span></td>
          <td>{{ row.channels || '—' }}</td>
          <td><StatusBadge :value="row.commercialClass" tone="neutral" /></td>
          <td>{{ row.owner ? store.userName(row.owner) : 'Sem responsável' }}</td>
          <td>{{ row.orders }}</td>
          <td>{{ row.cases }}</td>
        </tr>
      </tbody>
    </table>
    <p class="cell-sub" style="padding:10px 14px">A régua de parceiros ativos tratados depende da classificação acordada e fica como “A calibrar” até lá.</p>
  </article>

  <BaseModal :open="creating" title="Novo atendimento de canal" subtitle="Liga cliente, canal e pedido sem trocar o dono da conta" width="560px" @close="creating = false">
    <div class="form-grid">
      <div class="field"><label>Canal</label><select v-model="form.channel"><option v-for="channel in CHANNEL_CASE_CHANNELS" :key="channel">{{ channel }}</option></select></div>
      <div class="field"><label>Identificador no canal</label><input v-model="form.externalId" placeholder="Ex.: ML-Q-5501" /></div>
      <div class="field"><label>Cliente ou parceiro</label><select v-model="form.partnerId"><option value="">Escolha</option><option v-for="partner in store.state.partners.filter(entry => entry.status === 'Ativo')" :key="partner.id" :value="partner.id">{{ partner.name }}</option></select></div>
      <div class="field"><label>Responsável</label><select v-model="form.handlerId"><option v-for="entry in handlers" :key="entry.userId" :value="entry.userId">{{ store.userName(entry.userId) }}</option></select></div>
      <div class="field"><label>Prazo de resposta</label><input v-model="form.deadline" type="date" :min="today()" /></div>
      <div class="field"><label>Pedido (opcional)</label><select v-model="form.salesOrderId"><option value="">Sem pedido</option><option v-for="order in customerOrders" :key="order.id" :value="order.id">{{ order.id }} · {{ order.externalKey ?? channelOf(order) }}</option></select><small>Só pedidos do mesmo cliente e do mesmo canal.</small></div>
    </div>
    <div class="field"><label>Assunto</label><input v-model="form.subject" /></div>
    <template #footer><button class="button secondary" @click="creating = false">Cancelar</button><button class="button" @click="create">Registrar</button></template>
  </BaseModal>

  <BaseModal :open="!!answering.id" title="Responder atendimento" width="500px" @close="answering.id = ''">
    <div class="field"><label>Resposta enviada ao canal</label><textarea v-model="answering.text" rows="4"></textarea></div>
    <template #footer><button class="button secondary" @click="answering.id = ''">Cancelar</button><button class="button" @click="answer">Concluir atendimento</button></template>
  </BaseModal>

  <BaseModal :open="!!linking.id" title="Ligar pedido ao atendimento" width="460px" @close="linking.id = ''">
    <div class="field"><label>Pedido</label><select v-model="linking.orderId"><option value="">Escolha</option><option v-for="order in linkable" :key="order.id" :value="order.id">{{ order.id }} · {{ order.externalKey ?? channelOf(order) }}</option></select><small>Só aparecem pedidos do mesmo cliente e do mesmo canal.</small></div>
    <template #footer><button class="button secondary" @click="linking.id = ''">Cancelar</button><button class="button" :disabled="!linking.orderId" @click="link">Ligar</button></template>
  </BaseModal>
</template>
