<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Target } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { today } from '../../domain/engine'
import { CRM_STAGES, CRM_TEMPERATURES, opportunityIsOpen, splitSalesGoal } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Opportunity, OpportunityTemperature } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { CRM_MONTH, CRM_YEAR, attentionOf, monthSlice, useCrmScope } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { opportunities, tenantIds, tenantName, grouped } = useCrmScope()
const period = ref<'month' | 'year'>('month')
const goalOpen = ref(false)
const goalMonths = ref<number[]>(splitSalesGoal(0))
const temperature = ref<OpportunityTemperature | ''>('')
const stageFocus = ref<Opportunity['stage'] | ''>('')

const monthIndex = Number(CRM_MONTH.slice(5, 7)) - 1
const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const stageColors = ['#a8521b', '#c47a3a', '#5b47b0', '#2c7368', '#36703e']

const scoped = computed(() => opportunities.value.filter(entry => {
  if (temperature.value && (entry.temperature ?? 'Morno') !== temperature.value) return false
  if (stageFocus.value && entry.stage !== stageFocus.value) return false
  return true
}))
const open = computed(() => scoped.value.filter(opportunityIsOpen))
const won = computed(() => scoped.value.filter(entry => entry.stage === 'Ganho'))
const lost = computed(() => scoped.value.filter(entry => entry.stage === 'Perdido'))
const wonInPeriod = computed(() => won.value.filter(entry => (entry.wonAt ?? entry.expectedClose).startsWith(period.value === 'month' ? CRM_MONTH : String(CRM_YEAR))))
const goals = computed(() => store.state.salesGoals.filter(entry => tenantIds.value.includes(entry.tenantId) && entry.year === CRM_YEAR))
const goal = computed(() => goals.value.reduce((sum, entry) => sum + entry.amount, 0))
const monthGoal = computed(() => goals.value.reduce((sum, entry) => sum + monthSlice(entry.amount, entry.monthlyAmounts, monthIndex), 0))
const companyGoal = computed(() => goals.value.find(entry => entry.tenantId === ui.activeTenantId))
const target = computed(() => period.value === 'month' ? monthGoal.value : goal.value)
const conquered = computed(() => wonInPeriod.value.reduce((sum, entry) => sum + (entry.mrr ?? 0), 0))
const gap = computed(() => Math.max(0, target.value - conquered.value))
const pace = computed(() => target.value ? Math.round(conquered.value / target.value * 1000) / 10 : 0)
const winRate = computed(() => won.value.length + lost.value.length ? Math.round(won.value.length / (won.value.length + lost.value.length) * 100) : 0)
const sum = (list: Opportunity[], field: 'mrr' | 'value') => list.reduce((total, entry) => total + (entry[field] ?? 0), 0)
const weighted = computed(() => open.value.reduce((total, entry) => total + (entry.mrr ?? 0) * entry.probability / 100, 0))

const byStage = (stage: string) => scoped.value.filter(entry => entry.stage === stage)
const funnelBands = computed(() => {
  const counts = CRM_STAGES.map(stage => byStage(stage).length)
  const peak = Math.max(1, ...counts)
  const last = counts.length - 1
  const half = counts.map((count, index) => {
    const volume = count === 0 ? 0.18 : 0.42 + 0.58 * (count / peak)
    const silhouette = 1 - (index / last) * 0.52
    return volume * silhouette * 48
  })
  return CRM_STAGES.map((stage, index) => {
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
const pieStages = computed(() => CRM_STAGES.map((stage, index) => ({ stage, count: byStage(stage).length, color: stageColors[index] })).filter(entry => entry.count > 0))
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
  if (store.setSalesGoal(ui.activeTenantId, CRM_YEAR, goalSum.value, goalMonths.value.map(value => Number(value) || 0))) goalOpen.value = false
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
        <h2>Meta {{ period === 'month' ? 'de outubro' : `de ${CRM_YEAR}` }}</h2>
        <p>{{ fmtCurrency(goal) }} no ano{{ grouped ? ', somando as empresas do grupo' : '' }}. Cada mês tem a própria meta. Conta o MRR das oportunidades conquistadas.</p>
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
      <div class="kpi"><span>Valor alvo</span><strong>{{ fmtCurrency(target) }}</strong><small>{{ period === 'month' ? 'meta deste mês' : 'soma dos meses' }}</small></div>
      <div class="kpi"><span>MRR conquistado</span><strong>{{ fmtCurrency(conquered) }}</strong><small>{{ wonInPeriod.length }} conquista(s) no período</small></div>
      <div class="kpi" :class="{ danger: gap > 0 }"><span>Faltante</span><strong>{{ fmtCurrency(gap) }}</strong><small>para bater a meta</small></div>
      <div class="kpi"><span>Em aberto</span><strong>{{ open.length }}</strong><small>{{ fmtCurrency(sum(open, 'mrr')) }} MRR · ponderado {{ fmtCurrency(weighted) }}</small></div>
      <div class="kpi"><span>Win rate</span><strong>{{ winRate }}%</strong><small>{{ won.length }} conquistada(s) · {{ lost.length }} perdida(s)</small></div>
    </div>
  </article>

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

  <BaseModal :open="goalOpen" :title="`Meta de ${CRM_YEAR}`" :subtitle="`Vale para ${tenantName()}. O ano começa rateado por igual e cada mês pode mudar.`" width="640px" @close="goalOpen = false">
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
