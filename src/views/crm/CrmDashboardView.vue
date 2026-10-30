<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Target } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { today } from '../../domain/engine'
import { CRM_STAGES, CRM_TEMPERATURES, opportunityIsOpen } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Opportunity } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { CRM_MONTH, CRM_YEAR, attentionOf, opportunityList, useCrmScope, type OpportunityLife, type OpportunityQuick } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { opportunities, tenantIds, tenantName, grouped } = useCrmScope()
const period = ref<'month' | 'year'>('month')
const goalOpen = ref(false)
const goalDraft = ref(0)

const open = computed(() => opportunities.value.filter(opportunityIsOpen))
const won = computed(() => opportunities.value.filter(entry => entry.stage === 'Conquista'))
const lost = computed(() => opportunities.value.filter(entry => entry.stage === 'Perdida'))
const wonInPeriod = computed(() => won.value.filter(entry => (entry.wonAt ?? entry.expectedClose).startsWith(period.value === 'month' ? CRM_MONTH : String(CRM_YEAR))))
const goal = computed(() => store.state.salesGoals.filter(entry => tenantIds.value.includes(entry.tenantId) && entry.year === CRM_YEAR).reduce((sum, entry) => sum + entry.amount, 0))
const companyGoal = computed(() => store.state.salesGoals.find(entry => entry.tenantId === ui.activeTenantId && entry.year === CRM_YEAR)?.amount ?? 0)
const target = computed(() => period.value === 'month' ? goal.value / 12 : goal.value)
const conquered = computed(() => wonInPeriod.value.reduce((sum, entry) => sum + (entry.mrr ?? 0), 0))
const gap = computed(() => Math.max(0, target.value - conquered.value))
const pace = computed(() => target.value ? Math.round(conquered.value / target.value * 1000) / 10 : 0)
const winRate = computed(() => won.value.length + lost.value.length ? Math.round(won.value.length / (won.value.length + lost.value.length) * 100) : 0)
const sum = (list: Opportunity[], field: 'mrr' | 'value') => list.reduce((total, entry) => total + (entry[field] ?? 0), 0)
const weighted = computed(() => open.value.reduce((total, entry) => total + (entry.mrr ?? 0) * entry.probability / 100, 0))

const byStage = (stage: string) => opportunities.value.filter(entry => entry.stage === stage)
const funnelMax = computed(() => Math.max(1, ...CRM_STAGES.map(stage => sum(byStage(stage), 'mrr'))))
const byTemperature = (temperature: string) => open.value.filter(entry => (entry.temperature ?? 'Morno') === temperature)
const attention = computed(() => open.value
  .map(entry => ({ entry, signals: attentionOf(entry, today()) }))
  .filter(row => row.signals.length)
  .sort((a, b) => b.signals.length - a.signals.length || a.entry.expectedClose.localeCompare(b.entry.expectedClose)))

function openList(life: OpportunityLife, quick: OpportunityQuick = '', stage = '') {
  Object.assign(opportunityList, { life, quick })
  opportunityList.headerFilters.stage = { value: stage, op: 'equals' }
  router.push('/crm/oportunidades')
}
function editGoal() {
  goalDraft.value = companyGoal.value
  goalOpen.value = true
}
function saveGoal() {
  if (store.setSalesGoal(ui.activeTenantId, CRM_YEAR, goalDraft.value)) goalOpen.value = false
}
</script>

<template>
  <article class="card item-hero" data-tour="crm-goal">
    <div class="section-head" style="margin-top:0">
      <div>
        <h2>Meta {{ period === 'month' ? 'de outubro' : `de ${CRM_YEAR}` }}</h2>
        <p>{{ fmtCurrency(goal) }} no ano{{ grouped ? ', somando as empresas do grupo' : '' }}. O mês é um doze avos. Conta o MRR das oportunidades conquistadas.</p>
      </div>
      <div class="filter-row">
        <div class="segmented">
          <button :class="{ active: period === 'month' }" @click="period = 'month'">Mensal</button>
          <button :class="{ active: period === 'year' }" @click="period = 'year'">Anual</button>
        </div>
        <button class="button secondary small" @click="editGoal"><Target :size="14" /> Definir meta</button>
      </div>
    </div>
    <div class="kpi-strip">
      <div class="kpi" :class="pace >= 100 ? 'success' : 'warning'"><span>Atingido</span><strong>{{ pace }}%</strong><small>do valor alvo</small></div>
      <div class="kpi"><span>Valor alvo</span><strong>{{ fmtCurrency(target) }}</strong><small>{{ period === 'month' ? 'meta do mês' : 'meta do ano' }}</small></div>
      <button type="button" class="kpi link" @click="openList('won')"><span>MRR conquistado</span><strong>{{ fmtCurrency(conquered) }}</strong><small>{{ wonInPeriod.length }} conquista(s) no período</small></button>
      <div class="kpi" :class="{ danger: gap > 0 }"><span>Faltante</span><strong>{{ fmtCurrency(gap) }}</strong><small>para bater a meta</small></div>
      <button type="button" class="kpi link" @click="openList('open')"><span>Em aberto</span><strong>{{ open.length }}</strong><small>{{ fmtCurrency(sum(open, 'mrr')) }} MRR · ponderado {{ fmtCurrency(weighted) }}</small></button>
      <button type="button" class="kpi link" @click="openList('lost')"><span>Win rate</span><strong>{{ winRate }}%</strong><small>{{ won.length }} conquistada(s) · {{ lost.length }} perdida(s)</small></button>
    </div>
  </article>

  <div class="grid-equal">
    <article class="card">
      <div class="section-head" style="margin-top:0"><div><h2>Funil de vendas</h2><p>Quantidade e MRR por fase. Clique para ver a lista.</p></div></div>
      <button v-for="stage in CRM_STAGES" :key="stage" type="button" class="funnel-row" @click="openList(stage === 'Conquista' ? 'won' : 'open', '', stage)">
        <span>{{ stage }}</span>
        <i :style="{ width: `${Math.max(8, sum(byStage(stage), 'mrr') / funnelMax * 100)}%` }"></i>
        <b>{{ byStage(stage).length }} · {{ fmtCurrency(sum(byStage(stage), 'mrr')) }}</b>
      </button>
    </article>
    <article class="card">
      <div class="section-head" style="margin-top:0"><div><h2>Temperatura</h2><p>Oportunidades em aberto e o MRR de cada faixa.</p></div></div>
      <div class="kpi-strip" style="border-top:0; padding-top:0">
        <button v-for="temperature in CRM_TEMPERATURES" :key="temperature" type="button" class="kpi link" @click="openList('open', temperature)">
          <span><StatusBadge :value="temperature" /></span>
          <strong>{{ byTemperature(temperature).length }}</strong>
          <small>{{ fmtCurrency(sum(byTemperature(temperature), 'mrr')) }} MRR</small>
        </button>
      </div>
      <button v-if="open.some(entry => !entry.statusNote?.trim())" type="button" class="notice warning link-notice" @click="openList('open', 'sem-status')">
        {{ open.filter(entry => !entry.statusNote?.trim()).length }} em aberto sem status escrito. Ver quais.
      </button>
    </article>
  </div>

  <article class="card flush" data-tour="crm-attention">
    <div class="section-head"><div><h2>Precisa de atenção</h2><p>Em aberto sem status, sem próxima ação ou com o fechamento vencido.</p></div></div>
    <table class="dense">
      <thead><tr><th>Oportunidade</th><th>Vendedor</th><th>Fase</th><th>Previsão</th><th>MRR</th><th>O que falta</th></tr></thead>
      <tbody>
        <tr v-for="{ entry, signals } in attention" :key="entry.id" class="clickable" @click="router.push(`/crm/oportunidade/${entry.id}`)">
          <td><span class="cell-main">{{ entry.title }}</span><span class="cell-sub">{{ entry.id }} · {{ store.partnerName(entry.partnerId) }}<template v-if="grouped"> · {{ tenantName(entry.tenantId) }}</template></span></td>
          <td>{{ store.userName(entry.ownerId) }}</td>
          <td><StatusBadge :value="entry.stage" /></td>
          <td :class="{ 'risk-text': entry.expectedClose < today() }">{{ fmtDate(entry.expectedClose) }}</td>
          <td>{{ fmtCurrency(entry.mrr ?? 0) }}</td>
          <td><div class="flag-list"><span v-for="signal in signals" :key="signal" class="status warning">{{ signal }}</span></div></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!attention.length" class="empty-note">Nada pendente. Toda oportunidade aberta tem status, próxima ação e previsão em dia.</p>
  </article>

  <BaseModal :open="goalOpen" :title="`Meta de ${CRM_YEAR}`" :subtitle="`Vale para ${tenantName()}. O grupo soma as metas das empresas.`" width="440px" @close="goalOpen = false">
    <div class="field"><label>Meta anual de MRR</label><input v-model.number="goalDraft" type="number" min="1" /><small>{{ fmtCurrency(goalDraft || 0) }} no ano · {{ fmtCurrency((goalDraft || 0) / 12) }} por mês</small></div>
    <template #footer>
      <button class="button secondary" @click="goalOpen = false">Cancelar</button>
      <button class="button" :disabled="!(goalDraft > 0)" @click="saveGoal">Gravar meta</button>
    </template>
  </BaseModal>
</template>
