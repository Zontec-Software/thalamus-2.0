<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Target } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { billingForMonth, conquestsIn, partnersWithoutOwner } from '../../domain/crmRoutine'
import { recentWeeks, sellerLinkOf } from '../../domain/crmEffort'
import { today } from '../../domain/engine'
import { CRM_TEMPERATURES, opportunityIsOpen, opportunityIsWon, splitSalesGoal, stagesOf } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Opportunity, OpportunityTemperature } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'
import EffortWeekCard from './EffortWeekCard.vue'
import { attentionOf, crmScope, useCrmScope } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { opportunities, tenantIds, tenantName, grouped, canTeam } = useCrmScope()
const period = ref<'month' | 'year'>('month')
const goalOpen = ref(false)
const goalMonths = ref<number[]>(splitSalesGoal(0))
const temperature = ref<OpportunityTemperature | ''>('')
const stageFocus = ref<Opportunity['stage'] | ''>('')

const year = Number(today().slice(0, 4))
const month = today().slice(0, 7)
const monthIndex = Number(month.slice(5, 7)) - 1
const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const stageColors = ['#a8521b', '#c47a3a', '#5b47b0', '#2c7368', '#36703e', '#2a5f9e', '#6b3d8f']
const ownerFilter = computed(() => canTeam.value ? (crmScope.owner ? [crmScope.owner] : undefined) : [ui.sessionUserId])

/** As fases do quadro seguem a trilha escolhida; sem escolha, Produtos Roboflex. */
const funnel = computed(() => crmScope.funnel || 'Produtos')
const stages = computed(() => stagesOf(funnel.value))

const scoped = computed(() => opportunities.value.filter(entry => {
  if (temperature.value && (entry.temperature ?? 'Morno') !== temperature.value) return false
  if (stageFocus.value && entry.stage !== stageFocus.value) return false
  return true
}))
const open = computed(() => scoped.value.filter(opportunityIsOpen))
const won = computed(() => scoped.value.filter(opportunityIsWon))
const lost = computed(() => scoped.value.filter(entry => entry.stage === 'Perdido'))
const goals = computed(() => store.state.salesGoals.filter(entry => tenantIds.value.includes(entry.tenantId) && entry.year === year))
const companyGoal = computed(() => goals.value.find(entry => entry.tenantId === ui.activeTenantId))

/** Faturado por competência: meta da versão aprovada contra notas elegíveis e conciliadas. */
const months = computed(() => period.value === 'month' ? [month] : Array.from({ length: monthIndex + 1 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`))
const billing = computed(() => months.value.map(value => billingForMonth(store.state, tenantIds.value, value, ownerFilter.value)))
const goalValue = computed(() => billing.value.some(entry => entry.goal === null) && billing.value.every(entry => entry.goal === null) ? null : billing.value.reduce((sum, entry) => sum + (entry.goal ?? 0), 0))
const actual = computed(() => billing.value.every(entry => entry.actual === null) ? null : billing.value.reduce((sum, entry) => sum + (entry.actual ?? 0), 0))
const ratio = computed(() => goalValue.value && actual.value !== null ? actual.value / goalValue.value : null)
const gap = computed(() => goalValue.value !== null && actual.value !== null ? Math.max(0, goalValue.value - actual.value) : null)
const awaitingApproval = computed(() => goals.value.some(entry => !entry.approvedBy))
const conquered = computed(() => conquestsIn(store.state, tenantIds.value, period.value === 'month' ? month : String(year), ownerFilter.value))
const winRate = computed(() => won.value.length + lost.value.length ? Math.round(won.value.length / (won.value.length + lost.value.length) * 100) : 0)
const sum = (list: Opportunity[], field: 'mrr' | 'value') => list.reduce((total, entry) => total + (entry[field] ?? 0), 0)
const weighted = computed(() => open.value.reduce((total, entry) => total + (entry.mrr ?? 0) * entry.probability / 100, 0))
const canApprove = computed(() => store.can('crm.meta.aprovar') && !!companyGoal.value && !companyGoal.value.approvedBy && companyGoal.value.savedBy !== ui.userName)
const pct = (value: number | null) => value === null ? '—' : `${Math.round(value * 1000) / 10}%`

const byStage = (stage: string) => scoped.value.filter(entry => entry.stage === stage && (entry.funnel ?? 'Produtos') === funnel.value)
const funnelBands = computed(() => {
  const list = stages.value
  const counts = list.map(stage => byStage(stage).length)
  const peak = Math.max(1, ...counts)
  const last = list.length - 1
  const half = counts.map((count, index) => {
    const volume = count === 0 ? 0.18 : 0.42 + 0.58 * (count / peak)
    const silhouette = 1 - (index / last) * 0.52
    return volume * silhouette * 48
  })
  return list.map((stage, index) => {
    const top = half[index]
    const next = half[index + 1]
    const bottom = next === undefined ? top * 0.62 : next > top ? top * 0.9 : Math.max(next, top * 0.72)
    const cx = 50
    return {
      stage,
      count: counts[index],
      color: stageColors[index],
      points: `${cx - top},0.6 ${cx + top},0.6 ${cx + bottom},19.4 ${cx - bottom},19.4`,
    }
  })
})
const byTemperature = (value: string) => opportunities.value.filter(opportunityIsOpen).filter(entry => (entry.temperature ?? 'Morno') === value && (!stageFocus.value || entry.stage === stageFocus.value))
const pieStages = computed(() => stages.value.map((stage, index) => ({ stage, count: byStage(stage).length, color: stageColors[index] })).filter(entry => entry.count > 0))
const pieTotal = computed(() => pieStages.value.reduce((total, entry) => total + entry.count, 0) || 1)
const pieGradient = computed(() => {
  if (!pieStages.value.length) return 'conic-gradient(#d5dbe6 0 100%)'
  let cursor = 0
  const stops = pieStages.value.map(entry => {
    const start = cursor
    cursor += entry.count / pieTotal.value * 100
    return `${entry.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})
const attention = computed(() => open.value
  .map(entry => ({ entry, signals: attentionOf(entry, today()) }))
  .filter(row => row.signals.length)
  .sort((a, b) => b.signals.length - a.signals.length || a.entry.expectedClose.localeCompare(b.entry.expectedClose)))

const myLink = computed(() => sellerLinkOf(store.state, ui.activeTenantId, ui.sessionUserId))
const [thisWeek] = recentWeeks(1)
const untriaged = computed(() => canTeam.value && store.can('crm.carteira.gerir') ? partnersWithoutOwner(store.state).length : 0)

function pickTemperature(value: OpportunityTemperature) {
  temperature.value = temperature.value === value ? '' : value
}
function pickStage(stage: Opportunity['stage']) {
  stageFocus.value = stageFocus.value === stage ? '' : stage
}
const goalSum = computed(() => goalMonths.value.reduce((total, value) => total + (Number(value) || 0), 0))
function editGoal() {
  const current = companyGoal.value
  goalMonths.value = current?.monthlyAmounts?.length === 12 ? [...current.monthlyAmounts] : splitSalesGoal(current?.amount ?? 0)
  goalOpen.value = true
}
function ratear() {
  const total = Math.round(goalSum.value)
  goalMonths.value = splitSalesGoal(total > 0 ? total : goalMonths.value.reduce((sum, value) => sum + (Number(value) || 0), 0))
}
function saveGoal() {
  if (store.setSalesGoal(ui.activeTenantId, year, goalSum.value, goalMonths.value.map(value => Number(value) || 0))) goalOpen.value = false
}
function approveGoal() {
  store.approveSalesGoal(ui.activeTenantId, year)
}
</script>

<template>
  <p v-if="temperature || stageFocus" class="notice">
    Painel filtrado<template v-if="temperature"> por temperatura {{ temperature }}</template><template v-if="stageFocus"> na fase {{ stageFocus }}</template>.
    <button type="button" class="link" @click="temperature = ''; stageFocus = ''">Limpar</button>
  </p>

  <article class="card item-hero" data-tour="crm-goal">
    <div class="section-head" style="margin-top:0">
      <div>
        <h2>Faturamento {{ period === 'month' ? `de ${monthNames[monthIndex].toLowerCase()}` : `de ${year}` }}</h2>
        <p>Meta da versão aprovada contra as notas elegíveis e conciliadas, por competência{{ grouped ? ', somando as empresas do grupo' : '' }}. Conquista (aceite) é outra medida e aparece à parte.</p>
      </div>
      <div class="filter-row">
        <div class="segmented">
          <button :class="{ active: period === 'month' }" @click="period = 'month'">Mensal</button>
          <button :class="{ active: period === 'year' }" @click="period = 'year'">Anual</button>
        </div>
        <button class="button secondary small" @click="router.push('/crm/faturamento')">Ver competências e notas</button>
        <button v-if="canApprove" class="button small" @click="approveGoal">Aprovar meta</button>
        <button class="button secondary small" @click="editGoal"><Target :size="14" /> Definir meta</button>
      </div>
    </div>
    <p v-if="awaitingApproval" class="notice">Há meta gravada que ainda não foi aprovada por outra pessoa. Sem aprovação ela não mede o atingimento.</p>
    <div class="kpi-strip">
      <div class="kpi" :class="ratio === null ? '' : ratio >= 1 ? 'success' : 'warning'"><span>Atingido</span><strong>{{ pct(ratio) }}</strong><small>{{ goalValue === null ? 'meta sem aprovação' : actual === null ? 'sem conciliação' : 'do faturado sobre a meta' }}</small></div>
      <div class="kpi"><span>Meta aprovada</span><strong>{{ goalValue === null ? '—' : fmtCurrency(goalValue) }}</strong><small>{{ period === 'month' ? 'meta deste mês' : 'soma dos meses até agora' }}</small></div>
      <div class="kpi"><span>Faturado</span><strong>{{ actual === null ? 'Sem conciliação' : fmtCurrency(actual) }}</strong><small>{{ actual === null ? 'não é o mesmo que zero' : `até ${fmtDate(billing[billing.length - 1].asOf)}` }}</small></div>
      <div class="kpi" :class="{ danger: (gap ?? 0) > 0 }"><span>Faltante</span><strong>{{ gap === null ? '—' : fmtCurrency(gap) }}</strong><small>para bater a meta</small></div>
      <div class="kpi"><span>Conquistado</span><strong>{{ fmtCurrency(conquered.mrr) }}</strong><small>MRR · implantação {{ fmtCurrency(conquered.setup) }} · avulsa {{ fmtCurrency(conquered.oneOff) }} · {{ conquered.count }} conquista(s)</small></div>
      <div class="kpi"><span>Em aberto</span><strong>{{ open.length }}</strong><small>{{ fmtCurrency(sum(open, 'mrr')) }} MRR · ponderado {{ fmtCurrency(weighted) }}</small></div>
      <div class="kpi"><span>Win rate</span><strong>{{ winRate }}%</strong><small>{{ won.length }} conquistada(s) · {{ lost.length }} perdida(s)</small></div>
    </div>
  </article>

  <EffortWeekCard v-if="myLink" :link="myLink" :week="thisWeek" title="Minha semana" data-tour="crm-week" />
  <p v-if="untriaged" class="notice">{{ untriaged }} cliente(s) ativo(s) sem responsável na carteira. <RouterLink to="/crm/equipe" class="link">Fazer a triagem</RouterLink></p>

  <div class="grid-equal">
    <article class="card">
      <div class="section-head" style="margin-top:0"><div><h2>Funil de vendas</h2><p>Afunila de cima para baixo. A fase com mais oportunidades fica mais larga. Clique para filtrar.</p></div></div>
      <div class="sales-funnel">
        <button v-for="band in funnelBands" :key="band.stage" type="button" class="sales-funnel-row" :class="{ on: stageFocus === band.stage }" :aria-pressed="stageFocus === band.stage" @click="pickStage(band.stage)">
          <span>{{ band.stage }}</span>
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polygon :points="band.points" :fill="band.color" /></svg>
          <b>{{ band.count }}</b>
        </button>
      </div>
    </article>
    <article class="card">
      <div class="section-head" style="margin-top:0"><div><h2>Distribuição</h2><p>Quantidade por fase, no mesmo recorte do funil.</p></div></div>
      <div class="pie-row">
        <i class="pie" :style="{ background: pieGradient }" role="img" aria-label="Gráfico de pizza por fase"></i>
        <ul class="pie-legend">
          <li v-for="entry in pieStages" :key="entry.stage"><i :style="{ background: entry.color }"></i>{{ entry.stage }} <b>{{ entry.count }}</b></li>
          <li v-if="!pieStages.length">Nenhuma oportunidade neste recorte.</li>
        </ul>
      </div>
    </article>
  </div>

  <article class="card">
    <div class="section-head" style="margin-top:0"><div><h2>Temperatura</h2><p>Clique para filtrar o painel. Clique de novo para soltar.</p></div></div>
    <div class="kpi-strip" style="border-top:0; padding-top:0">
      <button v-for="value in CRM_TEMPERATURES" :key="value" type="button" class="kpi link" :class="{ active: temperature === value }" :aria-pressed="temperature === value" @click="pickTemperature(value)">
        <span><StatusBadge :value="value" /></span>
        <strong>{{ byTemperature(value).length }}</strong>
        <small>{{ fmtCurrency(sum(byTemperature(value), 'mrr')) }} MRR</small>
      </button>
    </div>
  </article>

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
    <p v-if="!attention.length" class="empty-note">Nada pendente neste recorte.</p>
  </article>

  <BaseModal :open="goalOpen" :title="`Meta de ${year}`" :subtitle="`Vale para ${tenantName()}. Depois de gravada, outra pessoa precisa aprovar. O ano começa rateado por igual e cada mês pode mudar.`" width="640px" @close="goalOpen = false">
    <div class="field">
      <label>Soma do ano</label>
      <strong>{{ fmtCurrency(goalSum) }}</strong>
      <button type="button" class="button secondary small" @click="ratear">Ratear igualmente</button>
    </div>
    <div class="form-grid">
      <div v-for="(name, index) in monthNames" :key="name" class="field">
        <label>{{ name }}</label>
        <input v-model.number="goalMonths[index]" type="number" min="0" />
      </div>
    </div>
    <template #footer>
      <button class="button secondary" @click="goalOpen = false">Cancelar</button>
      <button class="button" :disabled="!(goalSum > 0)" @click="saveGoal">Gravar meta</button>
    </template>
  </BaseModal>
</template>
