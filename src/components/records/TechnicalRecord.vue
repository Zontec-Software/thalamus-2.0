<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Ban, CalendarCheck, Play, Plus, Save, CheckCircle2 } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { TechnicalServiceOrder } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const isNew = computed(() => props.id === 'new')
const technical = computed(() => store.state.technicalServiceOrders.find(entry => entry.id === props.id))
const orders = computed(() => store.state.salesOrders.filter(entry => entry.shipment || entry.planned))
const technicians = computed(() => store.state.users.filter(entry => entry.role === 'Assistência' || entry.role === 'Manutenção'))
const parts = computed(() => store.state.items.filter(entry => entry.type === 'CP' || entry.type === 'SE'))
const STEPS = ['Aberta', 'Agendada', 'Em execução', 'Concluída'] as const
const stepIndex = computed(() => {
  const status = technical.value?.status === 'Aguardando peça' ? 'Agendada' : technical.value?.status
  return STEPS.indexOf(status as typeof STEPS[number])
})
const open = computed(() => !!technical.value && !['Concluída', 'Cancelada'].includes(technical.value.status))

const form = reactive({ salesOrderId: props.context.salesOrderId ?? orders.value[0]?.id ?? '', description: '', assetSerial: '', channel: 'Telefone' as TechnicalServiceOrder['channel'], contact: '' })
const formOrder = computed(() => store.state.salesOrders.find(entry => entry.id === form.salesOrderId))
const formWarranty = computed(() => {
  const reference = formOrder.value?.shipment?.shippedAt ?? formOrder.value?.receivedAt
  return !!reference && addDays(reference.slice(0, 10), 365) >= today()
})

function create() {
  const created = store.createTechnicalOrder({ ...form, assetSerial: form.assetSerial || undefined, contact: form.contact || undefined })
  if (created && created !== true) ui.openRecord('technical', created.id)
}

const schedule = reactive({ technicianId: '', date: addDays(today(), 1) })
const record = reactive({ diagnosis: '', report: '', laborHours: 0, chargeable: false })
const part = reactive({ itemId: '', quantity: 1 })
const cancelling = ref(false)
const cancelReason = ref('')
watch(technical, value => {
  if (!value) return
  schedule.technicianId = value.technicianId ?? technicians.value[0]?.id ?? ''
  schedule.date = value.scheduledFor ?? addDays(today(), 1)
  Object.assign(record, { diagnosis: value.diagnosis ?? '', report: value.report ?? '', laborHours: value.laborHours ?? 0, chargeable: value.chargeable })
  part.itemId ||= parts.value[0]?.id ?? ''
}, { immediate: true })

const order = computed(() => store.state.salesOrders.find(entry => entry.id === technical.value?.salesOrderId))
const op = computed(() => store.state.productionOrders.find(entry => entry.id === technical.value?.productionOrderId))
const nc = computed(() => store.state.nonConformities.find(entry => entry.id === technical.value?.nonConformityId))
const demands = computed(() => store.state.demands.filter(entry => entry.originId === props.id))
const titles = computed(() => store.state.financialTitles.filter(entry => entry.reference === props.id))
const estimate = computed(() => {
  if (!technical.value || !record.chargeable) return 0
  const visit = store.state.services.find(entry => entry.category === 'Assistência')?.price ?? 480
  const material = (technical.value.parts ?? []).reduce((sum, entry) => sum + store.item(entry.itemId).cost * entry.quantity * 1.3, 0)
  return Math.round(visit + material + record.laborHours * 120)
})

function cancel() {
  if (store.cancelTechnicalOrder(props.id, cancelReason.value)) cancelling.value = false
}

function openOrder(id: string) {
  ui.closeRecord()
  ui.orderDrawer = id
}

function openOp(id: string) {
  ui.closeRecord()
  ui.opDrawer = id
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader eyebrow="Serviços · novo chamado" title="Novo chamado de assistência" subtitle="O chamado nasce do pedido entregue: cliente, lote, OP e garantia vêm junto." />
    <div class="drawer-body">
      <div class="field">
        <label>Pedido de origem</label>
        <select v-model="form.salesOrderId"><option v-for="entry in orders" :key="entry.id" :value="entry.id">{{ entry.id }} · {{ store.customerName(entry.customerId) }} · {{ store.itemLabel(entry.itemId) }}</option></select>
        <small v-if="formOrder">{{ formOrder.quantity }} un. · {{ formOrder.shipment?.invoice ?? 'ainda não faturado' }} · <b>{{ formWarranty ? 'Dentro da garantia de 12 meses' : 'Fora da garantia: chamado cobrável' }}</b></small>
      </div>
      <div class="field"><label>Problema relatado</label><textarea v-model="form.description" rows="3" placeholder="Ex.: trava do suporte quebrando após queda"></textarea></div>
      <div class="form-grid">
        <div class="field"><label>Número de série / lote</label><input v-model="form.assetSerial" placeholder="Opcional" /></div>
        <div class="field"><label>Canal</label><select v-model="form.channel"><option>Telefone</option><option>E-mail</option><option>Portal</option><option>Comercial</option></select></div>
        <div class="field"><label>Contato no cliente</label><input v-model="form.contact" /></div>
      </div>
      <p v-if="formWarranty" class="hint">Em garantia, uma não conformidade é aberta automaticamente para a Qualidade investigar a OP de origem.</p>
      <div class="drawer-actions">
        <button class="button" @click="create">Abrir chamado</button>
        <button class="button secondary" @click="ui.closeRecord">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="technical">
    <RecordHeader :eyebrow="`Assistência técnica · ${technical.id}`" :title="store.partnerName(technical.partnerId)" :subtitle="technical.description" />
    <div class="drawer-body">
      <div v-if="technical.status === 'Cancelada'" class="notice danger">Cancelado: {{ technical.report }}</div>
      <template v-else>
        <div class="stage-stepper">
          <div v-for="(step, index) in STEPS" :key="step" class="stage-step" :class="{ done: index < stepIndex, current: index === stepIndex }"><i></i><span>{{ step }}</span></div>
        </div>
        <div v-if="technical.status === 'Aguardando peça'" class="notice warning">Aguardando peça: o chamado volta a andar quando Compras/Almoxarifado atenderem a demanda.</div>
      </template>

      <div class="mini-stats four">
        <div class="mini-stat"><strong><StatusBadge :value="technical.warranty ? 'Garantia' : 'Cobrável'" :tone="technical.warranty ? 'success' : 'warning'" /></strong><span>cobertura</span></div>
        <div class="mini-stat"><strong>{{ store.userName(technical.technicianId) }}</strong><span>técnico</span></div>
        <div class="mini-stat"><strong>{{ technical.scheduledFor ? fmtDate(technical.scheduledFor) : 'A definir' }}</strong><span>agenda</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(technical.chargeAmount ?? estimate) }}</strong><span>{{ technical.chargeAmount ? 'cobrado' : 'cobrança estimada' }}</span></div>
      </div>

      <div v-if="open" class="drawer-actions" data-tour="tech-actions">
        <button v-if="technical.status === 'Agendada'" class="button" @click="store.advanceTechnicalOrder(technical.id)"><Play :size="15" /> Iniciar atendimento</button>
        <button v-if="technical.status === 'Aguardando peça'" class="button" @click="store.advanceTechnicalOrder(technical.id)"><Play :size="15" /> Retomar</button>
        <button v-if="technical.status === 'Em execução'" class="button" @click="store.advanceTechnicalOrder(technical.id)"><CheckCircle2 :size="15" /> Concluir com laudo</button>
        <button class="button ghost" @click="cancelling = !cancelling"><Ban :size="15" /> Cancelar</button>
      </div>
      <div v-if="cancelling" class="inline-form row">
        <input v-model="cancelReason" class="filter grow" placeholder="Motivo" />
        <button class="button danger small" @click="cancel">Confirmar</button>
      </div>

      <template v-if="open">
        <h3 class="drawer-title">Agendamento</h3>
        <div class="inline-form row">
          <select v-model="schedule.technicianId" class="filter grow"><option v-for="user in technicians" :key="user.id" :value="user.id">{{ user.name }} · {{ user.role }}</option></select>
          <input v-model="schedule.date" class="filter" type="date" />
          <button class="button small" @click="store.scheduleTechnicalOrder(technical.id, schedule.technicianId, schedule.date)"><CalendarCheck :size="14" /> {{ technical.scheduledFor ? 'Reagendar' : 'Agendar' }}</button>
        </div>
      </template>

      <h3 class="drawer-title">Registro técnico</h3>
      <template v-if="open">
        <div class="field"><label>Diagnóstico</label><textarea v-model="record.diagnosis" rows="2" placeholder="Causa encontrada"></textarea></div>
        <div class="field"><label>Laudo / solução</label><textarea v-model="record.report" rows="2" placeholder="O que foi feito"></textarea></div>
        <div class="form-grid">
          <div class="field"><label>Horas de mão de obra</label><input v-model.number="record.laborHours" type="number" min="0" step="0.5" /></div>
          <div class="field"><label>Cobrança</label><label class="check-option"><input v-model="record.chargeable" type="checkbox" /> Cobrar do cliente</label><small>{{ technical.warranty ? 'Em garantia: cobrar só se houver mau uso' : 'Fora da garantia' }}</small></div>
        </div>
        <button class="button secondary small" @click="store.updateTechnicalOrder(technical.id, { ...record })"><Save :size="14" /> Salvar registro</button>
      </template>
      <div v-else class="card kv-card">
        <div class="kv"><span>Diagnóstico</span><b>{{ technical.diagnosis || '—' }}</b></div>
        <div class="kv"><span>Laudo</span><b>{{ technical.report || '—' }}</b></div>
        <div class="kv"><span>Mão de obra</span><b>{{ technical.laborHours ?? 0 }} h</b></div>
      </div>

      <div data-tour="tech-parts">
      <h3 class="drawer-title">Peças utilizadas</h3>
      <div v-for="(entry, index) in technical.parts ?? []" :key="index" class="list-row static">
        <div><strong>{{ store.itemLabel(entry.itemId) }}</strong><span>{{ entry.quantity }} {{ store.item(entry.itemId).unit }} · {{ fmtCurrency(store.item(entry.itemId).cost * entry.quantity) }}</span></div>
        <StatusBadge :value="entry.consumed ? 'Baixada do estoque' : 'Aguardando peça'" :tone="entry.consumed ? 'success' : 'warning'" />
      </div>
      <p v-if="!technical.parts?.length" class="empty-note">Nenhuma peça utilizada.</p>
      <div v-if="open" class="inline-form row">
        <select v-model="part.itemId" class="filter grow"><option v-for="item in parts" :key="item.id" :value="item.id">{{ item.name }} · livre {{ store.available(item.id) }}</option></select>
        <input v-model.number="part.quantity" class="filter narrow" type="number" min="1" />
        <button class="button small" @click="store.addTechnicalPart(technical.id, part.itemId, part.quantity)"><Plus :size="14" /> Usar peça</button>
      </div>
      <p v-if="open" class="hint">Com saldo, a peça é baixada do estoque. Sem saldo, abre uma demanda para Compras e o chamado fica aguardando peça.</p>
      </div>

      <div data-tour="tech-trace">
      <h3 class="drawer-title">Rastreabilidade</h3>
      <button v-if="order" class="list-row mont" @click="openOrder(order.id)">
        <div><strong>Pedido {{ order.id }}</strong><span>{{ store.itemLabel(order.itemId) }} · {{ order.quantity }} un. · {{ order.shipment?.invoice ?? 'sem NF-e' }}</span></div><StatusBadge :value="store.stage(order)" />
      </button>
      <button v-if="op" class="list-row inj" @click="openOp(op.id)">
        <div><strong>{{ op.id }} · lote de produção</strong><span>Revisão {{ store.state.productRevisions.find(entry => entry.id === op!.revisionId)?.code ?? store.item(op.itemId).revision ?? '—' }} · {{ op.quantity }} un.</span></div><StatusBadge :value="op.status" />
      </button>
      <div v-if="technical.assetSerial" class="list-row static"><div><strong>Série {{ technical.assetSerial }}</strong><span>Identificação informada pelo cliente</span></div></div>
      <button v-if="nc" class="list-row" @click="ui.closeRecord(); router.push('/qualidade')">
        <div><strong>{{ nc.id }} · não conformidade</strong><span>{{ nc.reason }}</span></div><StatusBadge :value="nc.status" />
      </button>
      <button v-for="demand in demands" :key="demand.id" class="list-row" @click="ui.openRecord('demand', demand.id)">
        <div><strong>{{ demand.id }} · {{ demand.description }}</strong><span>{{ demand.quantity }} · {{ demand.assigneeRole }}</span></div><StatusBadge :value="demand.status" />
      </button>
      <button v-for="title in titles" :key="title.id" class="list-row" @click="ui.openRecord('title', title.id)">
        <div><strong>{{ title.id }} · contas a receber</strong><span>{{ fmtCurrency(title.amount) }} · vence {{ fmtDate(title.dueDate) }}</span></div><StatusBadge :value="title.status" />
      </button>
      </div>

      <RecordTimeline :ref-id="technical.id" :created-at="technical.createdAt" :created-text="`Chamado aberto${technical.channel ? ` por ${technical.channel.toLowerCase()}` : ''}`" />
    </div>
  </template>
  <p v-else class="empty-note">Chamado não encontrado.</p>
</template>
