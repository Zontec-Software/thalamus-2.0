<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, BadgeDollarSign, CalendarClock, HandCoins, Plus, Search, Trophy } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { today } from '../domain/engine'
import { CRM_STAGES, proposalTotal } from '../domain/enterprise'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtCurrency, fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const tab = ref<'funil' | 'propostas' | 'agenda'>('funil')
const query = ref('')
const owner = ref('')

const sellers = computed(() => store.state.users.filter(entry => entry.role === 'Comercial' || entry.role === 'Gestor' || entry.role === 'Administrador'))
const matches = (text: string) => !query.value || text.toLowerCase().includes(query.value.toLowerCase())
const opportunities = computed(() => store.state.opportunities.filter(entry =>
  (!owner.value || entry.ownerId === owner.value) && matches(`${entry.id} ${entry.title} ${store.partnerName(entry.partnerId)}`)))
const open = computed(() => opportunities.value.filter(entry => entry.stage !== 'Ganha' && entry.stage !== 'Perdida'))
const won = computed(() => opportunities.value.filter(entry => entry.stage === 'Ganha'))
const lost = computed(() => opportunities.value.filter(entry => entry.stage === 'Perdida'))
const conversion = computed(() => won.value.length + lost.value.length ? Math.round(won.value.length / (won.value.length + lost.value.length) * 100) : 0)
const proposals = computed(() => store.state.proposals.filter(entry => matches(`${entry.id} ${store.partnerName(entry.partnerId)}`)))
const agenda = computed(() => opportunities.value
  .flatMap(opportunity => opportunity.activities.filter(activity => !activity.done).map(activity => ({ opportunity, activity })))
  .sort((a, b) => a.activity.at.localeCompare(b.activity.at)))
const withoutAction = computed(() => open.value.filter(entry => !entry.activities.some(activity => !activity.done)))
const byStage = (stage: string) => opportunities.value.filter(entry => entry.stage === stage)
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar cliente, oportunidade ou proposta" /></label>
      <select v-model="owner" class="filter"><option value="">Todos os vendedores</option><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('opportunity', 'new')"><Plus :size="15" /> Nova oportunidade</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Pipeline aberto <HandCoins :size="17" /></div><strong>{{ fmtCurrency(open.reduce((sum, entry) => sum + entry.value, 0)) }}</strong><small>{{ open.length }} oportunidade(s)</small></article>
    <article class="metric"><div class="metric-head">Previsão ponderada <BadgeDollarSign :size="17" /></div><strong>{{ fmtCurrency(open.reduce((sum, entry) => sum + entry.value * entry.probability / 100, 0)) }}</strong><small>Valor × probabilidade da etapa</small></article>
    <article class="metric"><div class="metric-head">Conversão <Trophy :size="17" /></div><strong>{{ conversion }}%</strong><small>{{ won.length }} ganha(s) · {{ lost.length }} perdida(s)</small></article>
    <article class="metric"><div class="metric-head">Sem próxima ação <CalendarClock :size="17" /></div><strong :class="{ 'risk-text': withoutAction.length }">{{ withoutAction.length }}</strong><small>{{ agenda.length }} atividade(s) agendada(s)</small></article>
  </section>

  <div class="tabs">
    <button :class="{ active: tab === 'funil' }" @click="tab = 'funil'">Funil</button>
    <button :class="{ active: tab === 'propostas' }" @click="tab = 'propostas'">Propostas <b>{{ proposals.length }}</b></button>
    <button :class="{ active: tab === 'agenda' }" @click="tab = 'agenda'">Agenda <b>{{ agenda.length }}</b></button>
  </div>

  <section v-if="tab === 'funil'" class="pipeline crm-pipeline" data-tour="crm-funnel">
    <div v-for="stage in CRM_STAGES" :key="stage" class="pipeline-col">
      <header><div>{{ stage }}<small>{{ byStage(stage).length }} · {{ fmtCurrency(byStage(stage).reduce((sum, entry) => sum + entry.value, 0)) }}</small></div></header>
      <article v-for="entry in byStage(stage)" :key="entry.id" class="flow-card clickable" @click="ui.openRecord('opportunity', entry.id)">
        <b>{{ entry.title }}</b>
        <small>{{ store.partnerName(entry.partnerId) }} · {{ store.userName(entry.ownerId) }}</small>
        <strong>{{ fmtCurrency(entry.value) }}</strong>
        <p :class="{ 'risk-text': !entry.activities.some(activity => !activity.done) && stage !== 'Ganha' }">{{ stage === 'Ganha' ? 'Pedido gerado' : entry.nextAction }}</p>
        <div class="meta"><span>{{ entry.probability }}%</span><span :class="{ 'risk-text': stage !== 'Ganha' && entry.expectedClose < today() }">{{ fmtDate(entry.expectedClose) }}</span></div>
        <button v-if="stage !== 'Ganha' && stage !== 'Negociação'" class="link" @click.stop="store.advanceOpportunity(entry.id)">Avançar <ArrowRight :size="12" /></button>
      </article>
    </div>
  </section>
  <details v-if="tab === 'funil' && lost.length" class="card lost-box">
    <summary>{{ lost.length }} oportunidade(s) perdida(s)</summary>
    <button v-for="entry in lost" :key="entry.id" class="list-row" @click="ui.openRecord('opportunity', entry.id)">
      <div><strong>{{ entry.title }}</strong><span>{{ store.partnerName(entry.partnerId) }} · {{ entry.lossReason }}</span></div><span>{{ fmtCurrency(entry.value) }}</span>
    </button>
  </details>

  <article v-if="tab === 'propostas'" class="card flush">
    <table>
      <thead><tr><th>Proposta</th><th>Cliente / oportunidade</th><th>Itens</th><th>Total</th><th>Validade</th><th>Pedido</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="proposal in proposals" :key="proposal.id" class="clickable" @click="ui.openRecord('proposal', proposal.id)">
          <td><b>{{ proposal.id }}</b><small class="cell-sub">{{ fmtDate(proposal.createdAt) }}</small></td>
          <td>{{ store.partnerName(proposal.partnerId) }}<small class="cell-sub">{{ store.state.opportunities.find(entry => entry.id === proposal.opportunityId)?.title }}</small></td>
          <td>{{ proposal.lines.length }} linha(s)</td>
          <td><b>{{ fmtCurrency(proposalTotal(proposal)) }}</b><small v-if="proposal.discount" class="cell-sub">{{ proposal.discount }}% desc.</small></td>
          <td :class="{ 'risk-text': proposal.status === 'Enviada' && proposal.validUntil < today() }">{{ fmtDate(proposal.validUntil) }}</td>
          <td>{{ proposal.salesOrderId ?? '—' }}</td>
          <td><StatusBadge :value="proposal.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!proposals.length" class="empty-note">Nenhuma proposta. Crie a partir de uma oportunidade.</p>
  </article>

  <article v-if="tab === 'agenda'" class="card flush">
    <table>
      <thead><tr><th>Quando</th><th>Atividade</th><th>Oportunidade</th><th>Responsável</th><th></th></tr></thead>
      <tbody>
        <tr v-for="{ opportunity, activity } in agenda" :key="activity.id" class="clickable" @click="ui.openRecord('opportunity', opportunity.id)">
          <td :class="{ 'risk-text': activity.at.slice(0, 10) < today() }">{{ fmtDateTime(activity.at) }}</td>
          <td><b>{{ activity.text }}</b><small class="cell-sub">{{ activity.type }}</small></td>
          <td>{{ opportunity.title }}<small class="cell-sub">{{ store.partnerName(opportunity.partnerId) }}</small></td>
          <td>{{ store.userName(opportunity.ownerId) }}</td>
          <td @click.stop><button class="button secondary small" @click="store.toggleActivity(opportunity.id, activity.id)">Concluir</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!agenda.length" class="empty-note">Nenhuma atividade pendente.</p>
  </article>
</template>
