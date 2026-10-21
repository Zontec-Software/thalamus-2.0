<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CalendarClock, CheckCircle2 } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { FinancialTitle } from '../../types/domain'
import { daysUntil, fmtCurrency, fmtDate } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()

const isNew = computed(() => props.id === 'new')
const title = computed(() => store.state.financialTitles.find(entry => entry.id === props.id))
const form = reactive({
  kind: (props.context.kind as FinancialTitle['kind']) ?? 'Pagar', partnerId: '', description: '', reference: '', amount: 0,
  dueDate: addDays(today(), 30), costCenter: store.state.sectors[0]?.costCenter ?? '', budgetId: '', notes: '',
})
const partners = computed(() => store.state.partners.filter(entry => entry.roles.includes(form.kind === 'Pagar' ? 'Fornecedor' : 'Cliente')))
form.partnerId = partners.value[0]?.id ?? ''

function create() {
  const created = store.createTitle({ ...form, reference: form.reference || 'Lançamento manual', budgetId: form.budgetId || undefined, notes: form.notes || undefined, origin: 'Manual' })
  if (created && created !== true) ui.openRecord('title', created.id)
}

const days = computed(() => title.value ? daysUntil(title.value.dueDate) : 0)
const partnerTitles = computed(() => title.value ? store.state.financialTitles.filter(entry => entry.partnerId === title.value!.partnerId && entry.id !== title.value!.id && entry.status === 'Aberto') : [])
const budget = computed(() => store.state.budgets.find(entry => entry.id === title.value?.budgetId))
const budgetCategory = computed(() => store.state.budgetCategories.find(entry => entry.id === (title.value?.budgetCategoryId ?? budget.value?.categoryId)))
const project = computed(() => store.state.projects.find(entry => entry.id === title.value?.projectId))
const partner = computed(() => store.state.partners.find(entry => entry.id === title.value?.partnerId))
const origin = computed(() => {
  const reference = title.value?.reference ?? ''
  if (store.state.purchaseOrders.some(entry => entry.id === reference)) return { label: `Pedido de compra ${reference}`, open: () => ui.openRecord('purchase', reference) }
  if (store.state.salesOrders.some(entry => entry.id === reference)) return { label: `Pedido de venda ${reference}`, open: () => { ui.closeRecord(); ui.orderDrawer = reference } }
  if (store.state.technicalServiceOrders.some(entry => entry.id === reference)) return { label: `Assistência ${reference}`, open: () => ui.openRecord('technical', reference) }
  if (store.state.demands.some(entry => entry.id === reference)) return { label: `Demanda ${reference}`, open: () => ui.openRecord('demand', reference) }
  return undefined
})
const rescheduling = ref(false)
const reschedule = reactive({ dueDate: addDays(today(), 15), reason: '' })

function saveReschedule() {
  if (store.rescheduleTitle(props.id, reschedule.dueDate, reschedule.reason)) rescheduling.value = false
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader :eyebrow="`Finanças · novo título a ${form.kind.toLowerCase()}`" title="Lançamento manual" subtitle="Use para compromissos fora dos fluxos automáticos (aluguel, contratos, adiantamentos)." />
    <div class="drawer-body">
      <div class="segmented">
        <button v-for="kind in ['Pagar', 'Receber'] as const" :key="kind" :class="{ active: form.kind === kind }" @click="form.kind = kind; form.partnerId = partners[0]?.id ?? ''">A {{ kind.toLowerCase() }}</button>
      </div>
      <div class="form-grid">
        <div class="field"><label>{{ form.kind === 'Pagar' ? 'Fornecedor' : 'Cliente' }}</label><select v-model="form.partnerId"><option v-for="entry in partners" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
        <div class="field"><label>Valor (R$)</label><input v-model.number="form.amount" type="number" min="0" step="0.01" /></div>
        <div class="field"><label>Vencimento</label><input v-model="form.dueDate" type="date" /></div>
        <div class="field"><label>Referência</label><input v-model="form.reference" placeholder="Contrato, NF, etc." /></div>
        <div class="field"><label>Centro de custo</label><select v-model="form.costCenter"><option v-for="entry in store.state.sectors" :key="entry.id" :value="entry.costCenter">{{ entry.costCenter }} · {{ entry.name }}</option></select></div>
        <div v-if="form.kind === 'Pagar'" class="field"><label>Orçamento</label><select v-model="form.budgetId"><option value="">Nenhum</option><option v-for="entry in store.state.budgets" :key="entry.id" :value="entry.id">{{ store.state.budgetCategories.find(category => category.id === entry.categoryId)?.name }} · {{ entry.period }}</option></select></div>
      </div>
      <div class="field"><label>Descrição</label><input v-model="form.description" /></div>
      <div class="field"><label>Observações</label><textarea v-model="form.notes" rows="2"></textarea></div>
      <div class="drawer-actions">
        <button class="button" @click="create">Lançar título</button>
        <button class="button secondary" @click="ui.closeRecord">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="title">
    <RecordHeader :eyebrow="`Contas a ${title.kind.toLowerCase()} · ${title.id}`" :title="fmtCurrency(title.amount)" :subtitle="`${store.partnerName(title.partnerId)} · ${title.description}`" />
    <div class="drawer-body">
      <div class="mini-stats four">
        <div class="mini-stat"><strong><StatusBadge :value="title.status === 'Aberto' && days < 0 ? 'Vencido' : title.status" /></strong><span>situação</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': title.status === 'Aberto' && days < 0 }">{{ fmtDate(title.dueDate) }}</strong><span>{{ title.status === 'Baixado' ? `baixado ${fmtDate(title.paidAt!)}` : days < 0 ? `${-days} dia(s) em atraso` : `vence em ${days} dia(s)` }}</span></div>
        <div class="mini-stat"><strong>{{ title.origin ?? 'Manual' }}</strong><span>origem</span></div>
        <div class="mini-stat"><strong>{{ title.costCenter ?? '—' }}</strong><span>centro de custo</span></div>
      </div>

      <div v-if="title.status === 'Aberto'" class="drawer-actions" data-tour="title-actions">
        <button class="button" @click="store.settleTitle(title.id)"><CheckCircle2 :size="15" /> {{ title.kind === 'Pagar' ? 'Registrar pagamento' : 'Registrar recebimento' }}</button>
        <button class="button secondary" @click="rescheduling = !rescheduling"><CalendarClock :size="15" /> Renegociar vencimento</button>
      </div>
      <div v-if="rescheduling" class="inline-form row">
        <input v-model="reschedule.dueDate" class="filter" type="date" />
        <input v-model="reschedule.reason" class="filter grow" placeholder="Motivo (obrigatório)" />
        <button class="button small" @click="saveReschedule">Salvar</button>
      </div>
      <p class="hint">A baixa aqui é operacional e é conferida com o Omie, que continua responsável pelo financeiro fiscal e bancário.</p>

      <div data-tour="title-origin">
      <h3 class="drawer-title">Origem</h3>
      <button v-if="origin" class="list-row" @click="origin.open"><div><strong>{{ origin.label }}</strong><span>Documento que gerou o título</span></div><span class="link">Abrir</span></button>
      <div v-else class="list-row static"><div><strong>{{ title.reference }}</strong><span>Lançamento manual</span></div></div>
      <button v-if="project" class="list-row" @click="ui.openRecord('project', project.id)"><div><strong>Projeto {{ project.id }}</strong><span>{{ project.name }}</span></div><StatusBadge :value="project.status" /></button>
      <button v-if="budget" class="list-row" @click="ui.openRecord('budget', budget.id)"><div><strong>{{ budgetCategory?.name }} · {{ budget.period }}</strong><span>Realizado somente após confirmação de pagamento do Omie</span></div><span class="link">Abrir</span></button>
      <p v-if="title.notes" class="hint">{{ title.notes }}</p>
      </div>

      <h3 class="drawer-title">{{ title.kind === 'Pagar' ? 'Fornecedor' : 'Cliente' }}</h3>
      <div v-if="partner" class="card kv-card">
        <div class="kv"><span>Razão social</span><b>{{ partner.name }}</b></div>
        <div class="kv"><span>CNPJ</span><b>{{ partner.document }}</b></div>
        <div class="kv"><span>Contato</span><b>{{ partner.contact }} · {{ partner.email }}</b></div>
        <div class="kv"><span>Outros títulos em aberto</span><b>{{ partnerTitles.length }} · {{ fmtCurrency(partnerTitles.reduce((sum, entry) => sum + entry.amount, 0)) }}</b></div>
      </div>
      <button v-for="entry in partnerTitles" :key="entry.id" class="list-row" @click="ui.openRecord('title', entry.id)">
        <div><strong>{{ entry.id }} · {{ fmtCurrency(entry.amount) }}</strong><span>{{ entry.description }} · vence {{ fmtDate(entry.dueDate) }}</span></div><StatusBadge :value="entry.dueDate < today() ? 'Vencido' : entry.status" />
      </button>

      <RecordTimeline :ref-id="title.id" :created-at="title.createdAt" created-text="Título gerado" />
    </div>
  </template>
  <p v-else class="empty-note">Título não encontrado.</p>
</template>
