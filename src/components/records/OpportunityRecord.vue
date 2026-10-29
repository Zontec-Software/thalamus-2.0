<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CalendarPlus, FilePlus2, FolderPlus, Pencil, ThumbsDown } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { CRM_STAGES, proposalTotal } from '../../domain/enterprise'
import { roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { CrmActivity, Opportunity } from '../../types/domain'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()

const isNew = computed(() => props.id === 'new')
const opportunity = computed(() => store.state.opportunities.find(entry => entry.id === props.id))
const clients = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Cliente')))
const sellers = computed(() => store.state.users.filter(entry => entry.role === 'Comercial' || entry.role === 'Gestor' || entry.role === 'Administrador'))
const products = computed(() => store.state.items.filter(entry => entry.type === '04'))
const closed = computed(() => opportunity.value?.stage === 'Ganha' || opportunity.value?.stage === 'Perdida')
const proposals = computed(() => store.state.proposals.filter(entry => entry.opportunityId === props.id))
const salesOrders = computed(() => proposals.value.filter(entry => entry.salesOrderId).map(entry => store.state.salesOrders.find(order => order.id === entry.salesOrderId)).filter(Boolean))
const projects = computed(() => store.state.projects.filter(entry => entry.opportunityId === props.id))
const clientOrders = computed(() => opportunity.value ? store.state.salesOrders.filter(entry => entry.customerId === opportunity.value!.partnerId).slice(0, 5) : [])
const clientTechnical = computed(() => opportunity.value ? store.state.technicalServiceOrders.filter(entry => entry.partnerId === opportunity.value!.partnerId) : [])
const sortedActivities = computed(() => [...(opportunity.value?.activities ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at)))

const blank = () => ({
  partnerId: clients.value[0]?.id ?? '', title: '', ownerId: sellers.value.find(entry => entry.name === ui.userName)?.id ?? sellers.value[0]?.id ?? '',
  value: 0, expectedClose: addDays(today(), 30), source: 'Prospecção', nextAction: 'Agendar reunião de descoberta',
  contact: '', segment: 'Mineração', itemIds: [] as string[], quantity: 50, notes: '',
})
const form = reactive(blank())
const editing = ref(false)
const losing = ref(false)
const lossReason = ref('Preço')
const lossDetail = ref('')
const activity = reactive<{ type: CrmActivity['type']; text: string; date: string }>({ type: 'Ligação', text: '', date: addDays(today(), 1) })

const contactOf = (partnerId: string) => store.state.partners.find(entry => entry.id === partnerId)?.contact ?? ''
const estimate = computed(() => form.itemIds.reduce((sum, itemId) => sum + Math.round(store.item(itemId).cost * 2.4) * form.quantity, 0))

function save() {
  const payload = { ...form, contact: form.contact || contactOf(form.partnerId), value: form.value || estimate.value }
  if (isNew.value) {
    const created = store.createOpportunity(payload)
    if (created && created !== true) ui.openRecord('opportunity', created.id)
  } else if (store.updateOpportunity(props.id, payload)) editing.value = false
}

function startEdit() {
  const entry = opportunity.value!
  Object.assign(form, {
    partnerId: entry.partnerId, title: entry.title, ownerId: entry.ownerId, value: entry.value, expectedClose: entry.expectedClose, source: entry.source,
    nextAction: entry.nextAction, contact: entry.contact ?? '', segment: entry.segment ?? '', itemIds: [...(entry.itemIds ?? [])], quantity: entry.quantity ?? 1, notes: entry.notes ?? '',
  })
  editing.value = true
}

function move(stage: Opportunity['stage']) {
  if (!closed.value && stage !== opportunity.value?.stage) store.moveOpportunity(props.id, stage)
}

function lose() {
  if (store.loseOpportunity(props.id, lossDetail.value ? `${lossReason.value}: ${lossDetail.value}` : lossReason.value)) losing.value = false
}

function schedule() {
  if (store.addActivity(props.id, { type: activity.type, text: activity.text, at: `${activity.date}T09:00:00.000Z` })) activity.text = ''
}

function newProposal() {
  const created = store.createProposal(props.id)
  if (created && created !== true) ui.openRecord('proposal', created.id)
}

function openOrder(id: string) {
  ui.closeRecord()
  ui.orderDrawer = id
}
</script>

<template>
  <template v-if="isNew || editing">
    <RecordHeader :eyebrow="isNew ? 'CRM · nova oportunidade' : `Editar ${props.id}`" :title="isNew ? 'Nova oportunidade' : form.title" subtitle="Cliente, interesse e próxima ação. O valor é estimado pelos produtos se ficar em branco." />
    <div class="drawer-body">
      <div class="field"><label>Título</label><input v-model="form.title" placeholder="Ex.: Renovação de cases da frota de coletores" /></div>
      <div class="form-grid">
        <div class="field"><label>Cliente</label><select v-model="form.partnerId"><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select><small>{{ store.state.partners.find(entry => entry.id === form.partnerId)?.city }}</small></div>
        <div class="field"><label>Contato</label><input v-model="form.contact" :placeholder="contactOf(form.partnerId)" /></div>
        <div class="field"><label>Responsável</label><select v-model="form.ownerId"><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select></div>
        <div class="field"><label>Origem</label><select v-model="form.source"><option>Prospecção</option><option>Site</option><option>Indicação</option><option>Carteira</option><option>Feira</option><option>Representante</option></select></div>
        <div class="field"><label>Segmento</label><select v-model="form.segment"><option>Mineração</option><option>Logística</option><option>Agro</option><option>Hotelaria</option><option>Indústria</option><option>Varejo</option></select></div>
        <div class="field"><label>Previsão de fechamento</label><input v-model="form.expectedClose" type="date" /></div>
      </div>
      <div class="field">
        <label>Produtos de interesse</label>
        <div class="check-grid">
          <label v-for="product in products" :key="product.id" class="check-option"><input v-model="form.itemIds" type="checkbox" :value="product.id" /> {{ store.itemLabel(product.id) }}</label>
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Quantidade estimada</label><input v-model.number="form.quantity" type="number" min="1" /></div>
        <div class="field"><label>Valor estimado</label><input v-model.number="form.value" type="number" min="0" :placeholder="String(estimate)" /><small>Sugerido: {{ fmtCurrency(estimate) }}</small></div>
      </div>
      <div class="field"><label>Próxima ação</label><input v-model="form.nextAction" /></div>
      <div class="field"><label>Observações</label><textarea v-model="form.notes" rows="3" placeholder="Dores do cliente, concorrentes, condições especiais"></textarea></div>
      <div class="drawer-actions">
        <button class="button" @click="save">{{ isNew ? 'Criar oportunidade' : 'Salvar alterações' }}</button>
        <button class="button secondary" @click="isNew ? ui.closeRecord() : editing = false">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="opportunity">
    <RecordHeader :eyebrow="`Oportunidade · ${opportunity.id}`" :title="opportunity.title" :subtitle="`${store.partnerName(opportunity.partnerId)} · ${store.userName(opportunity.ownerId)}`">
      <template #actions><button v-if="!closed" class="button secondary small" @click="startEdit"><Pencil :size="13" /> Editar</button></template>
    </RecordHeader>
    <div class="drawer-body">
      <div v-if="opportunity.stage === 'Perdida'" class="notice danger">Perdida: {{ opportunity.lossReason }}</div>
      <div v-else class="stage-stepper" data-tour="opp-stages">
        <button v-for="(stage, index) in CRM_STAGES" :key="stage" class="stage-step as-button" :class="{ done: index < CRM_STAGES.indexOf(opportunity.stage), current: stage === opportunity.stage }" :disabled="closed || stage === 'Ganha'" :title="stage === 'Ganha' ? 'Ganha ao aceitar a proposta' : `Mover para ${stage}`" @click="move(stage)">
          <i></i><span>{{ stage }}</span>
        </button>
      </div>

      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ fmtCurrency(opportunity.value) }}</strong><span>valor</span></div>
        <div class="mini-stat"><strong>{{ opportunity.probability }}%</strong><span>probabilidade</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(opportunity.value * opportunity.probability / 100) }}</strong><span>ponderado</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': !closed && opportunity.expectedClose < today() }">{{ fmtDate(opportunity.expectedClose) }}</strong><span>fechamento</span></div>
      </div>

      <div v-if="!closed" class="drawer-actions" data-tour="opp-actions">
        <button class="button" @click="newProposal"><FilePlus2 :size="15" /> Criar proposta</button>
        <button class="button secondary" @click="ui.openRecord('project', 'new', { opportunityId: opportunity.id, partnerId: opportunity.partnerId, name: opportunity.title })"><FolderPlus :size="15" /> Projeto de desenvolvimento</button>
        <button class="button ghost" @click="losing = !losing"><ThumbsDown :size="15" /> Marcar como perdida</button>
      </div>
      <div v-if="losing" class="inline-form">
        <div class="form-grid">
          <div class="field"><label>Motivo</label><select v-model="lossReason"><option>Preço</option><option>Prazo</option><option>Concorrente</option><option>Projeto cancelado</option><option>Sem retorno</option></select></div>
          <div class="field"><label>Detalhe</label><input v-model="lossDetail" placeholder="Opcional" /></div>
        </div>
        <button class="button danger small" @click="lose">Confirmar perda</button>
      </div>

      <h3 class="drawer-title">Dados da oportunidade</h3>
      <div class="card kv-card">
        <div class="kv"><span>Contato</span><b>{{ opportunity.contact || contactOf(opportunity.partnerId) }}</b></div>
        <div class="kv"><span>Segmento · origem</span><b>{{ opportunity.segment ?? '—' }} · {{ opportunity.source }}</b></div>
        <div class="kv"><span>Produtos de interesse</span><b>{{ opportunity.itemIds?.length ? opportunity.itemIds.map(store.itemLabel).join(', ') : 'Não informado' }}</b></div>
        <div class="kv"><span>Quantidade estimada</span><b>{{ opportunity.quantity ?? '—' }}</b></div>
        <div class="kv"><span>Próxima ação</span><b>{{ opportunity.nextAction }}</b></div>
        <p v-if="opportunity.notes" class="kv-note">{{ opportunity.notes }}</p>
      </div>

      <div data-tour="opp-activities">
      <h3 class="drawer-title">Atividades</h3>
      <div v-if="!closed" class="inline-form row">
        <select v-model="activity.type" class="filter"><option>Ligação</option><option>E-mail</option><option>Reunião</option><option>Tarefa</option></select>
        <input v-model="activity.text" class="filter grow" placeholder="O que precisa ser feito?" @keyup.enter="schedule" />
        <input v-model="activity.date" class="filter" type="date" />
        <button class="button small" @click="schedule"><CalendarPlus :size="14" /> Agendar</button>
      </div>
      <label v-for="entry in sortedActivities" :key="entry.id" class="list-row check-line" :class="{ muted: entry.done }">
        <input type="checkbox" :checked="entry.done" @change="store.toggleActivity(opportunity.id, entry.id)" />
        <div><strong>{{ entry.text }}</strong><span>{{ entry.type }} · {{ fmtDateTime(entry.at) }}</span></div>
        <StatusBadge :value="entry.done ? 'Concluída' : entry.at.slice(0, 10) < today() ? 'Vencido' : 'Agendada'" />
      </label>
      <p v-if="!opportunity.activities.length" class="empty-note">Nenhuma atividade. Toda oportunidade aberta deve ter uma próxima ação.</p>
      </div>

      <div data-tour="opp-proposals">
      <h3 class="drawer-title">Propostas</h3>
      <button v-for="proposal in proposals" :key="proposal.id" class="list-row" @click="ui.openRecord('proposal', proposal.id)">
        <div><strong>{{ proposal.id }} · {{ fmtCurrency(proposalTotal(proposal)) }}</strong><span>{{ proposal.lines.length }} linha(s) · válida até {{ fmtDate(proposal.validUntil) }}</span></div>
        <StatusBadge :value="proposal.status" />
      </button>
      <p v-if="!proposals.length" class="empty-note">Nenhuma proposta ainda.</p>
      </div>

      <template v-if="salesOrders.length">
        <h3 class="drawer-title">Pedido gerado</h3>
        <button v-for="order in salesOrders" :key="order!.id" class="list-row mont" @click="openOrder(order!.id)">
          <div><strong>{{ order!.id }} · {{ order!.omieId }}</strong><span>{{ fmtCurrency(order!.value) }} · entrega {{ fmtDate(order!.promisedDate) }}</span></div>
          <StatusBadge :value="store.stage(order!)" />
        </button>
      </template>

      <template v-if="projects.length">
        <h3 class="drawer-title">Projetos</h3>
        <button v-for="project in projects" :key="project.id" class="list-row" @click="ui.openRecord('project', project.id)">
          <div><strong>{{ project.id }} · {{ project.name }}</strong><span>{{ project.milestones.filter(entry => entry.done).length }}/{{ project.milestones.length }} marcos</span></div>
          <StatusBadge :value="project.status" />
        </button>
      </template>

      <h3 class="drawer-title">Histórico do cliente</h3>
      <div class="mini-stats">
        <div class="mini-stat"><strong>{{ clientOrders.length }}</strong><span>pedidos recentes</span></div>
        <div class="mini-stat"><strong>{{ clientTechnical.length }}</strong><span>chamados de assistência</span></div>
      </div>
      <button v-for="order in clientOrders" :key="order.id" class="list-row" @click="openOrder(order.id)">
        <div><strong>{{ order.id }} · {{ store.itemLabel(order.itemId) }}</strong><span>{{ order.quantity }} un. · {{ fmtCurrency(order.value) }}</span></div>
        <StatusBadge :value="store.stage(order)" />
      </button>
      <button v-for="technical in clientTechnical" :key="technical.id" class="list-row" @click="ui.openRecord('technical', technical.id)">
        <div><strong>{{ technical.id }} · assistência</strong><span>{{ technical.description }}</span></div>
        <StatusBadge :value="technical.status" />
      </button>

      <RecordTimeline :ref-id="opportunity.id" :created-at="opportunity.createdAt" created-text="Oportunidade registrada" />
    </div>
  </template>
  <p v-else class="empty-note">Oportunidade não encontrada.</p>
</template>
