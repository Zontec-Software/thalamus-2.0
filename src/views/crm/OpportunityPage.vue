<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarPlus, ChevronRight, FilePlus2, Mic, ThumbsDown } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import CrumbBack from '../../components/CrumbBack.vue'
import RecordTimeline from '../../components/records/RecordTimeline.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { SIMULATED_BRIEFS } from '../../domain/crmBrief'
import { addDays, today } from '../../domain/engine'
import { CRM_STAGES, opportunityIsOpen, proposalTotal } from '../../domain/enterprise'
import { roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { CrmActivity, Opportunity } from '../../types/domain'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format'
import { CRM_SOURCES, CRM_VERTICALS, DEAL_TYPES, LOSS_REASONS, attentionOf, proposalSituation, useCrmScope } from './shared'

type Tab = 'dados' | 'historico'
type ActionKind = 'Tarefa' | 'Reunião' | 'E-mail' | 'Ligação' | 'Demanda' | 'PAP' | 'Produto'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const { sellers, tenantName } = useCrmScope()

const opportunity = computed(() => store.state.opportunities.find(entry => entry.id === route.params.id))
const closed = computed(() => !!opportunity.value && !opportunityIsOpen(opportunity.value))
const partner = computed(() => store.state.partners.find(entry => entry.id === opportunity.value?.partnerId))
const clients = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Cliente') || entry.id === opportunity.value?.partnerId))
const materials = computed(() => store.state.items.filter(entry => entry.type === '01' || entry.type === '02' || entry.type === '07'))
const proposals = computed(() => store.state.proposals.filter(entry => entry.opportunityId === opportunity.value?.id))
const changes = computed(() => store.state.engineeringChanges.filter(entry => entry.opportunityId === opportunity.value?.id))
const demands = computed(() => store.state.demands.filter(entry => entry.origin === 'Oportunidade' && entry.originId === opportunity.value?.id))
const demandCost = computed(() => demands.value.reduce((sum, entry) => sum + (entry.estimatedCost ?? 0), 0))
const projects = computed(() => store.state.projects.filter(entry => entry.opportunityId === opportunity.value?.id))
const activities = computed(() => [...(opportunity.value?.activities ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at)))
const sectors = computed(() => store.state.sectors.filter(entry => !opportunity.value?.tenantId || entry.tenantId === opportunity.value.tenantId))
const signals = computed(() => opportunity.value ? attentionOf(opportunity.value, today()) : [])
const initials = computed(() => store.partnerName(opportunity.value?.partnerId ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase())

const tabs = computed(() => [
  { id: 'dados' as const, label: 'Dados' },
  { id: 'historico' as const, label: 'Histórico' },
])
const tab = computed<Tab>(() => tabs.value.some(entry => entry.id === route.query.aba) ? route.query.aba as Tab : 'dados')
const openTab = (aba: Tab) => router.replace({ query: { aba } })

const editable = () => {
  const entry = opportunity.value
  return {
    partnerId: entry?.partnerId ?? '', title: entry?.title ?? '', contact: entry?.contact ?? '', phone: entry?.phone ?? '', email: entry?.email ?? '',
    ownerId: entry?.ownerId ?? '', source: entry?.source ?? '', dealType: entry?.dealType ?? 'Venda' as Opportunity['dealType'],
    vertical: store.state.partners.find(item => item.id === entry?.partnerId)?.vertical ?? '',
    expectedClose: entry?.expectedClose ?? today(), value: entry?.value ?? 0, mrr: entry?.mrr ?? 0, quantity: entry?.quantity ?? 1,
    itemIds: [...(entry?.itemIds ?? [])], statusNote: entry?.statusNote ?? '', nextAction: entry?.nextAction ?? '', notes: entry?.notes ?? '',
  }
}
const form = reactive(editable())
const formPartner = computed(() => store.state.partners.find(entry => entry.id === form.partnerId))
const knownContact = computed(() => formPartner.value?.contacts.some(entry => entry.name === form.contact) ?? false)
function pickContact() {
  const entry = formPartner.value?.contacts.find(item => item.name === form.contact)
  if (!entry) return
  form.phone = entry.phone ?? ''
  form.email = entry.email ?? ''
}
watch(() => form.contact, pickContact)
watch(() => form.partnerId, (id, previous) => {
  if (!previous || id === previous) return
  const first = store.state.partners.find(entry => entry.id === id)?.contacts[0]
  form.contact = first?.name ?? ''
  form.phone = first?.phone ?? ''
  form.email = first?.email ?? ''
})
const reset = () => Object.assign(form, editable())
watch(() => opportunity.value?.id, reset, { immediate: true })
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(editable()))
function save() {
  if (!opportunity.value) return
  const { vertical, ...patch } = form
  const saved = store.updateOpportunity(opportunity.value.id, { ...patch, segment: vertical || formPartner.value?.vertical, contact: form.contact || partner.value?.contact })
  if (saved && form.partnerId && vertical !== (formPartner.value?.vertical ?? '')) store.setPartnerVertical(form.partnerId, vertical)
  if (saved) reset()
}
function saveMetric(patch: Partial<Pick<Opportunity, 'value' | 'mrr' | 'expectedClose' | 'temperature' | 'statusNote'>>) {
  if (opportunity.value && !closed.value) store.updateOpportunity(opportunity.value.id, patch)
}
const hearing = ref<'status' | 'notes' | 'action' | ''>('')
function hear(target: 'status' | 'notes' | 'action') {
  hearing.value = target
  window.setTimeout(() => {
    if (target === 'status') form.statusNote = SIMULATED_BRIEFS.status
    else if (target === 'notes') form.notes = SIMULATED_BRIEFS.product
    else action.text = action.kind === 'Reunião' ? SIMULATED_BRIEFS.meeting : action.kind === 'E-mail' ? SIMULATED_BRIEFS.email : action.kind === 'Demanda' ? SIMULATED_BRIEFS.demand : action.kind === 'Produto' || action.kind === 'PAP' ? SIMULATED_BRIEFS.product : SIMULATED_BRIEFS.call
    hearing.value = ''
  }, 700)
}

function move(stage: Opportunity['stage']) {
  if (opportunity.value && !closed.value && stage !== opportunity.value.stage) store.moveOpportunity(opportunity.value.id, stage)
}

const losing = ref(false)
const loss = reactive({ reason: LOSS_REASONS[0], detail: '' })
function lose() {
  if (opportunity.value && store.loseOpportunity(opportunity.value.id, loss.detail ? `${loss.reason}: ${loss.detail}` : loss.reason)) losing.value = false
}

const action = reactive({ kind: 'Ligação' as ActionKind, text: '', details: '', date: addDays(today(), 1), time: '09:00', sector: '', updateStatus: false, product: 'PAP' as 'PAP' | 'Projeto', itemId: '', quantity: 1, cost: 0 })
const activityPlaceholder = computed(() => action.kind === 'Reunião' ? 'Título da reunião' : action.kind === 'Produto' ? 'Descreva o produto' : 'O que foi feito ou o que precisa ser feito')
const detailsPlaceholder = computed(() => action.kind === 'Reunião' ? 'Ata ou pauta. Pode atualizar o status da oportunidade.' : 'Texto que pode virar o status')
function applyStatus(text: string) {
  const entry = opportunity.value
  if (entry && action.updateStatus && text.trim()) store.updateOpportunity(entry.id, { statusNote: text.trim() })
}
function schedule() {
  const entry = opportunity.value
  const kind = action.kind
  if (!entry) return
  if (kind === 'Demanda') {
    const description = action.text.trim()
    if (!description) return
    const created = action.itemId
      ? store.createDemand({ kind: 'Material', itemId: action.itemId, description, quantity: action.quantity, estimatedCost: action.cost || undefined, origin: 'Oportunidade', originId: entry.id, neededBy: action.date, priority: 'Normal', assigneeRole: 'Compras' })
      : store.createDemand({ kind: 'Serviço', serviceId: store.state.services[0]?.id ?? '', description, quantity: 1, estimatedCost: action.cost || undefined, origin: 'Oportunidade', originId: entry.id, neededBy: action.date, priority: 'Normal', assigneeRole: 'Compras' })
    if (created) action.text = ''
    return
  }
  if (kind === 'PAP' || (kind === 'Produto' && action.product === 'PAP')) {
    if (action.text.trim()) store.updateOpportunity(entry.id, { notes: action.text.trim() })
    if (store.requestOpportunityChange(entry.id)) action.text = ''
    return
  }
  if (kind === 'Produto') {
    const created = store.createProject({
      name: action.text.trim() || entry.title, kind: 'Produto novo', ownerId: entry.ownerId, startDate: today(), endDate: addDays(today(), 90),
      partnerId: entry.partnerId, opportunityId: entry.id, description: action.text.trim() || entry.notes,
    })
    if (created) action.text = ''
    return
  }
  const created = store.addActivity(entry.id, {
    type: kind, text: action.text, at: `${action.date}T${kind === 'Reunião' ? action.time : '09:00'}:00.000Z`,
    details: action.details, sector: kind === 'Tarefa' ? action.sector : undefined,
  })
  if (created) {
    applyStatus(action.details || action.text)
    action.text = ''
    action.details = ''
    action.updateStatus = false
  }
}
function guestLine(entry: CrmActivity) {
  if (!entry.calendar) return ''
  return entry.calendar.guests.map(guest => `${guest.name}${guest.email ? ` · ${guest.email}` : ''}`).join(', ')
}

function newProposal() {
  if (!opportunity.value) return
  const created = store.createProposal(opportunity.value.id)
  if (created && created !== true) ui.openRecord('proposal', created.id)
}

</script>

<template>
  <nav class="crumb-bar" aria-label="Caminho">
    <CrumbBack fallback="/crm/oportunidades" title="Voltar para Oportunidades" />
    <RouterLink to="/crm/oportunidades" class="crumb">Oportunidades</RouterLink>
    <ChevronRight :size="14" class="sep" />
    <span class="crumb here">{{ opportunity ? `${opportunity.id} · ${opportunity.title}` : 'Oportunidade não encontrada' }}</span>
  </nav>

  <div v-if="!opportunity" class="card empty-note">Oportunidade não encontrada. <RouterLink to="/crm/oportunidades">Voltar à lista</RouterLink></div>

  <template v-else>
    <article class="card item-hero opp-hero" data-tour="opp-header">
      <div class="item-head">
        <div class="item-photo placeholder">{{ initials }}</div>
        <div class="item-head-main">
          <span class="eyebrow">{{ opportunity.id }} · {{ opportunity.dealType ?? 'Venda' }} · {{ partner?.vertical ?? 'Sem vertical' }} · {{ opportunity.source }}</span>
          <h2>{{ store.partnerName(opportunity.partnerId) }}</h2>
          <p class="cell-sub">{{ opportunity.title }}</p>
          <div class="meta">
            <RouterLink :to="`/parceiros/${opportunity.partnerId}`">{{ store.partnerName(opportunity.partnerId) }}</RouterLink>
            <span>{{ partner?.document }}</span>
            <span>Vendedor <b>{{ store.userName(opportunity.ownerId) }}</b></span>
            <span>{{ tenantName(opportunity.tenantId) }}</span>
            <span v-if="opportunity.createdAt">Criada em {{ fmtDate(opportunity.createdAt) }}</span>
          </div>
          <div v-if="signals.length" class="flag-list" style="margin-top:8px"><span v-for="signal in signals" :key="signal" class="status warning">{{ signal }}</span></div>
        </div>
        <div class="actions" data-tour="opp-actions">
          <StatusBadge :value="opportunity.stage" />
          <template v-if="!closed">
            <button class="button small" @click="newProposal"><FilePlus2 :size="13" /> Criar proposta</button>
            <button class="button secondary small" @click="losing = true"><ThumbsDown :size="13" /> Marcar como perdida</button>
          </template>
        </div>
      </div>

      <div v-if="opportunity.stage === 'Perdida'" class="notice danger">Perdida: {{ opportunity.lossReason }}</div>
      <div v-else class="stage-stepper" data-tour="opp-stages">
        <button v-for="(stage, index) in CRM_STAGES" :key="stage" class="stage-step as-button" :class="{ done: index < CRM_STAGES.indexOf(opportunity.stage), current: stage === opportunity.stage }" :disabled="closed || stage === 'Conquista'" :title="stage === 'Conquista' ? 'Conquistada ao aceitar a proposta' : `Mover para ${stage}`" @click="move(stage)">
          <i></i><span>{{ stage }}</span>
        </button>
      </div>

      <div class="temp-cards" data-tour="opp-kpis">
        <button v-for="value in (['Quente', 'Morno', 'Frio'] as const)" :key="value" type="button" class="temp-card" :data-temp="value" :class="{ on: (opportunity.temperature ?? 'Frio') === value }" :disabled="closed" @click="saveMetric({ temperature: value })">{{ value }}</button>
      </div>
      <div class="kpi-strip">
        <label class="kpi"><span>Ticket</span><input :value="opportunity.value" type="number" min="0" :disabled="closed" @change="saveMetric({ value: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label class="kpi"><span>MRR</span><input :value="opportunity.mrr ?? 0" type="number" min="0" :disabled="closed" @change="saveMetric({ mrr: Number(($event.target as HTMLInputElement).value) })" /></label>
        <div class="kpi"><span>CAC</span><strong>{{ fmtCurrency(demandCost) }}</strong><small>{{ demands.length }} demanda(s)</small></div>
        <label class="kpi" :class="{ danger: !closed && opportunity.expectedClose < today() }"><span>Previsão de fechamento</span><input :value="opportunity.expectedClose" type="date" :disabled="closed" @change="saveMetric({ expectedClose: ($event.target as HTMLInputElement).value })" /></label>
      </div>
      <div class="field">
        <label>Status</label>
        <textarea v-model="form.statusNote" rows="2" :disabled="closed" placeholder="Situação atual, escrita ou falada"></textarea>
        <div class="filter-row">
          <button type="button" class="button secondary small" :disabled="closed || hearing === 'status'" @click="hear('status')"><Mic :size="13" /> {{ hearing === 'status' ? 'Ouvindo…' : 'Gravar áudio' }}</button>
          <button type="button" class="button small" :disabled="closed || form.statusNote === (opportunity.statusNote ?? '')" @click="saveMetric({ statusNote: form.statusNote })">Salvar status</button>
          <span class="cell-sub">A gravação é simulada.</span>
        </div>
      </div>
    </article>

    <article class="card">
      <div class="tabs" data-tour="opp-tabs">
        <button v-for="entry in tabs" :key="entry.id" type="button" :class="{ active: tab === entry.id }" @click="openTab(entry.id)">{{ entry.label }}</button>
      </div>

      <div v-if="tab === 'dados'">
        <p v-if="closed" class="hint">Oportunidade encerrada. Os dados ficam só para consulta.</p>
        <section class="person-section">
          <h3>Cliente e negócio</h3>
          <div class="form-grid">
            <div class="field"><label>Cliente</label><select v-model="form.partnerId" :disabled="closed"><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select><small v-if="!closed"><button type="button" class="link" @click="router.push({ path: '/parceiros', query: { novo: 'cliente', origem: 'comercial' } })">Cadastrar cliente</button></small></div>
            <div class="field"><label>Contato</label><select v-model="form.contact" :disabled="closed || !formPartner?.contacts.length"><option v-if="form.contact && !knownContact" :value="form.contact">{{ form.contact }}</option><option v-for="entry in formPartner?.contacts ?? []" :key="entry.name" :value="entry.name">{{ entry.name }}</option></select></div>
            <div class="field"><label>Telefone</label><input :value="form.phone || '—'" disabled /></div>
            <div class="field"><label>E-mail</label><input :value="form.email || '—'" disabled /></div>
            <div class="field"><label>Vendedor</label><select v-model="form.ownerId" :disabled="closed"><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select></div>
            <div class="field"><label>Tipo</label><select v-model="form.dealType" :disabled="closed"><option v-for="type in DEAL_TYPES" :key="type">{{ type }}</option></select></div>
            <div class="field"><label>Origem</label><select v-model="form.source" :disabled="closed"><option v-for="source in CRM_SOURCES" :key="source">{{ source }}</option></select></div>
            <div class="field"><label>Vertical</label><select v-model="form.vertical" :disabled="closed"><option value="">Não informada</option><option v-for="vertical in CRM_VERTICALS" :key="vertical">{{ vertical }}</option></select><small>Grava no cadastro do cliente.</small></div>
          </div>
        </section>
        <section class="person-section">
          <h3>Motivação</h3>
          <div class="field"><textarea v-model="form.notes" rows="3" :disabled="closed" placeholder="Contexto do negócio, escrito ou falado"></textarea></div>
          <button type="button" class="button secondary small" :disabled="closed || hearing === 'notes'" @click="hear('notes')"><Mic :size="13" /> {{ hearing === 'notes' ? 'Ouvindo…' : 'Gravar áudio' }}</button>
        </section>
        <div v-if="!closed" class="save-bar">
          <button class="button secondary" :disabled="!dirty" @click="reset">Descartar</button>
          <button class="button" :disabled="!dirty" @click="save">Salvar</button>
        </div>

        <section class="person-section">
          <h3>Propostas</h3>
          <div v-if="!closed" class="action-row" style="margin-bottom:10px"><button class="button small" @click="newProposal"><FilePlus2 :size="13" /> Criar proposta</button></div>
          <table class="dense">
            <thead><tr><th>Número</th><th>Valor</th><th>Situação</th></tr></thead>
            <tbody>
              <tr v-for="proposal in proposals" :key="proposal.id" class="clickable" @click="ui.openRecord('proposal', proposal.id)">
                <td><span class="cell-main code">{{ proposal.id }}</span></td>
                <td>{{ fmtCurrency(proposalTotal(proposal)) }}</td>
                <td><StatusBadge :value="proposalSituation(proposal.status)" /></td>
              </tr>
            </tbody>
          </table>
          <p v-if="!proposals.length" class="empty-note">Nenhuma proposta. A proposta abre no módulo de vendas.</p>
        </section>

        <section class="person-section" data-tour="opp-activities">
          <h3>Ações</h3>
          <div v-if="!closed" class="inline-form">
            <div class="inline-form row" style="margin:0; border:0; padding:0; background:transparent">
              <select v-model="action.kind" class="filter" aria-label="Tipo de ação">
                <option>Tarefa</option><option>Reunião</option><option>Demanda</option><option>E-mail</option><option>Ligação</option><option>PAP</option><option>Produto</option>
              </select>
              <input v-model="action.text" class="filter grow" :placeholder="activityPlaceholder" />
              <input v-model="action.date" class="filter" type="date" />
              <input v-if="action.kind === 'Reunião'" v-model="action.time" class="filter" type="time" aria-label="Horário" />
              <button class="button small" @click="schedule"><CalendarPlus :size="14" /> Registrar</button>
            </div>
            <div class="filter-row">
              <button type="button" class="button secondary small" :disabled="hearing === 'action'" @click="hear('action')"><Mic :size="13" /> {{ hearing === 'action' ? 'Ouvindo…' : 'Gravar áudio' }}</button>
              <span class="cell-sub">Nesta demonstração a gravação vira um texto pronto. O Google Agenda não é chamado.</span>
            </div>
            <div v-if="action.kind === 'Tarefa'" class="field"><label>Setor</label><select v-model="action.sector"><option value="">Escolher setor</option><option v-for="sector in sectors" :key="sector.id" :value="sector.name">{{ sector.name }}</option></select><small>A tarefa liga esta oportunidade a outro setor.</small></div>
            <div v-if="action.kind === 'Demanda'" class="form-grid">
              <div class="field"><label>Material, se houver</label><select v-model="action.itemId"><option value="">Só o custo informado</option><option v-for="item in materials" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></div>
              <div class="field"><label>Quantidade</label><input v-model.number="action.quantity" type="number" min="1" /></div>
              <div class="field"><label>Custo estimado</label><input v-model.number="action.cost" type="number" min="0" /><small>Entra no CAC da oportunidade.</small></div>
            </div>
            <div v-if="action.kind === 'Produto'" class="field"><label>O que criar</label><select v-model="action.product"><option>PAP</option><option>Projeto</option></select></div>
            <div v-if="action.kind === 'Reunião' || action.kind === 'E-mail' || action.kind === 'Ligação'" class="field">
              <label>{{ action.kind === 'Reunião' ? 'Ata' : 'Texto' }}</label>
              <textarea v-model="action.details" rows="3" :placeholder="detailsPlaceholder"></textarea>
              <label class="check-option"><input v-model="action.updateStatus" type="checkbox" /> Atualizar o status da oportunidade com este texto</label>
              <p v-if="action.kind === 'Reunião'" class="cell-sub">A reunião entra na agenda Google de quem está logado, com o contato. Simulado.</p>
            </div>
          </div>
          <article v-for="entry in activities" :key="entry.id" class="list-row check-line" :class="{ muted: entry.done }">
            <input type="checkbox" :checked="entry.done" :aria-label="entry.done ? 'Reabrir ação' : 'Concluir ação'" @change="store.toggleActivity(opportunity.id, entry.id)" />
            <div>
              <strong>{{ entry.text }}</strong>
              <span>{{ entry.type }} · {{ fmtDateTime(entry.at) }}<template v-if="entry.sector"> · {{ entry.sector }}</template><template v-if="entry.createdBy"> · {{ entry.createdBy }}</template></span>
              <p v-if="entry.details" class="cell-sub">{{ entry.details }}</p>
              <p v-if="entry.calendar" class="cell-sub">Agenda Google de {{ entry.calendar.ownerName }} (simulado). Convidados: {{ guestLine(entry) }}.</p>
            </div>
            <StatusBadge :value="entry.done ? 'Concluída' : entry.at.slice(0, 10) < today() ? 'Vencido' : 'Agendada'" />
          </article>
          <button v-for="entry in demands" :key="entry.id" class="list-row" @click="ui.openRecord('demand', entry.id)">
            <div><strong>{{ entry.id }} · demanda</strong><span>{{ entry.description }} · {{ fmtCurrency(entry.estimatedCost ?? 0) }}</span></div>
            <StatusBadge :value="entry.status" />
          </button>
          <RouterLink v-for="change in changes" :key="change.id" to="/produtos/acoes" class="list-row">
            <div><strong>{{ change.id }} · PAP</strong><span>{{ change.title }}</span></div>
            <StatusBadge :value="change.stage" />
          </RouterLink>
          <button v-for="project in projects" :key="project.id" class="list-row" @click="ui.openRecord('project', project.id)">
            <div><strong>{{ project.id }} · projeto</strong><span>{{ project.name }}</span></div>
            <StatusBadge :value="project.status" />
          </button>
        </section>
      </div>

      <div v-else>
        <RecordTimeline :ref-id="opportunity.id" :created-at="opportunity.createdAt" created-text="Oportunidade registrada" />
      </div>
    </article>

    <BaseModal :open="losing" title="Marcar como perdida" :subtitle="`${opportunity.id} · as propostas em aberto serão recusadas`" width="460px" @close="losing = false">
      <div class="field"><label>Motivo</label><select v-model="loss.reason"><option v-for="reason in LOSS_REASONS" :key="reason">{{ reason }}</option></select></div>
      <div class="field"><label>Detalhe</label><input v-model="loss.detail" placeholder="Opcional" /></div>
      <template #footer>
        <button class="button secondary" @click="losing = false">Cancelar</button>
        <button class="button danger" @click="lose">Confirmar perda</button>
      </template>
    </BaseModal>
  </template>
</template>
