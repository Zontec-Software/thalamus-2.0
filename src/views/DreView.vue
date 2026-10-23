<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import PeriodScopeBar from '../components/PeriodScopeBar.vue'
import { usePeriodScope } from '../composables/usePeriodScope'
import { financeSnapshot } from '../domain/budget'
import { assetDepreciation, dreReading, dreStatement, periodLabel, type DreLine } from '../domain/dre'
import { useErpStore } from '../stores/erp'
import { fmtCurrency } from '../utils/format'

const store = useErpStore()
const { year, fromMonth, toMonth, scope, groupView, tenantIds, scopeLabel } = usePeriodScope()
const period = computed(() => ({ year: year.value, fromMonth: fromMonth.value, toMonth: toMonth.value }))
const statement = computed(() => dreStatement(store.state, tenantIds.value, period.value))
const snapshot = computed(() => financeSnapshot(store.state, tenantIds.value, year.value, fromMonth.value, toMonth.value))
const assets = computed(() => tenantIds.value.reduce((sum, id) => {
  const entry = assetDepreciation(store.state, id)
  return { total: sum.total + entry.total, count: sum.count + entry.rows.length }
}, { total: 0, count: 0 }))
const line = (id: string) => statement.value.lines.find(entry => entry.id === id)!
const resultLines = computed(() => statement.value.lines.filter(entry => entry.inResult))
const investment = computed(() => line('capex'))
const reading = computed(() => {
  const top = snapshot.value.centers[0]
  return dreReading(statement.value.lines, period.value, top ? { ...top, company: groupView.value ? top.company : undefined } : undefined)
})
const waitingRevenue = computed(() => line('rob').realized === 0 && line('custos').realized > 0)
const money = (value: number) => value === 0 ? '—' : fmtCurrency(value)
const when = computed(() => periodLabel(period.value))

function reach(entry: DreLine) {
  return entry.budget ? Math.round(entry.realized / entry.budget * 1000) / 10 : undefined
}
/** Receita e resultado: acima do orçado é bom. Custo e despesa: acima do orçado é ruim. */
function tone(entry: DreLine) {
  const value = reach(entry)
  if (value === undefined || !entry.inResult) return ''
  const higherIsBetter = entry.sign !== '−'
  if (higherIsBetter) return value >= 100 ? 'ok' : value >= 80 ? 'warn' : 'bad'
  return value > 100 ? 'bad' : value >= 80 ? 'warn' : 'ok'
}
const cards = computed(() => [
  { id: 'rob', label: 'Receita' },
  { id: 'ebitda', label: 'EBITDA' },
  { id: 'liquido', label: 'Lucro líquido' },
].map(card => ({ ...card, line: line(card.id) })))
function rowClass(entry: DreLine) {
  if (entry.id === 'liquido') return 'liquido'
  if (entry.kind === 'calculo') return 'calculo'
  return ''
}
</script>

<template>
  <div class="budget-top">
    <div>
      <h2>DRE · {{ when }}</h2>
      <p class="cell-sub">{{ scopeLabel }}. O investimento fica separado e não entra no lucro.</p>
    </div>
    <PeriodScopeBar v-model:year="year" v-model:from="fromMonth" v-model:to="toMonth" v-model:scope="scope" />
  </div>

  <section class="metrics cols-3 dre-metrics" data-tour="dre-cards">
    <div v-for="card in cards" :key="card.id" class="metric">
      <span class="metric-head">{{ card.label }}</span>
      <span class="dre-budget">Orçado {{ money(card.line.budget) }}</span>
      <strong class="dre-real" :class="tone(card.line)">{{ money(card.line.realized) }}</strong>
      <small>Realizado<template v-if="reach(card.line) !== undefined"> · {{ reach(card.line) }}% do orçado</template></small>
    </div>
  </section>

  <article class="card flush" data-tour="dre-statement">
    <p v-if="waitingRevenue" class="notice info">Neste período a receita realizada ainda não entrou. O valor negativo é custo já lançado.</p>
    <table class="statement dre-table">
      <thead><tr><th>Conta</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Atingido</th></tr></thead>
      <tbody>
        <tr v-for="entry in resultLines" :key="entry.id" :class="rowClass(entry)">
          <td><span class="dre-sign">{{ entry.sign }}</span>{{ entry.label }}</td>
          <td class="num">{{ money(entry.budget) }}</td>
          <td class="num"><strong :class="{ deduct: entry.realized < 0 }">{{ money(entry.realized) }}</strong></td>
          <td class="num"><span v-if="reach(entry) !== undefined" class="tone" :class="tone(entry)">{{ reach(entry) }}%</span><template v-else>—</template></td>
        </tr>
      </tbody>
    </table>
  </article>

  <section class="grid-2">
    <article class="card" data-tour="dre-reading">
      <h2><Sparkles :size="18" /> Leitura do período</h2>
      <ul class="dre-reading">
        <li v-for="text in reading" :key="text">{{ text }}</li>
      </ul>
    </article>
    <article class="card flush" data-tour="dre-centers">
      <div class="orc-card-head">
        <div>
          <h2>Onde o dinheiro foi pago</h2>
          <p>Os cinco centros com mais realizado pago no período.</p>
        </div>
      </div>
      <table class="dense">
        <thead><tr><th>Centro</th><th class="num">Pago</th><th class="num">Parte</th></tr></thead>
        <tbody>
          <tr v-for="center in snapshot.centers" :key="`${center.tenantId}-${center.code}`">
            <td>{{ center.code }} {{ center.name }}<span v-if="groupView" class="cell-sub">{{ center.company }}</span></td>
            <td class="num">{{ fmtCurrency(center.amount) }}</td>
            <td class="num">{{ center.share.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) }}%</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!snapshot.centers.length" class="empty-note">Nenhum pagamento deste período tem centro de custo.</p>
    </article>
  </section>

  <article class="card flush">
    <div class="orc-card-head">
      <div>
        <h2>Investimentos</h2>
        <p>Não altera o EBITDA nem o lucro.</p>
      </div>
    </div>
    <table class="statement dre-table">
      <thead><tr><th>Conta</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Atingido</th></tr></thead>
      <tbody>
        <tr>
          <td>{{ investment.label }}</td>
          <td class="num">{{ money(investment.budget) }}</td>
          <td class="num"><strong>{{ money(investment.realized) }}</strong></td>
          <td class="num">{{ reach(investment) !== undefined ? `${reach(investment)}%` : '—' }}</td>
        </tr>
      </tbody>
    </table>
  </article>

  <article class="card dre-sources">
    <h2>De onde saem depreciação e premiação</h2>
    <p>Depreciação orçada de {{ assets.count }} ativos: <strong>{{ fmtCurrency(assets.total) }}</strong> por ano, linear, proporcional aos meses escolhidos. <RouterLink class="link" to="/ativos">Ativos</RouterLink></p>
    <p>Premiação orçada com nota {{ statement.score.score.toFixed(0) }} (entrega {{ statement.score.onTime.toFixed(0) }}, qualidade {{ statement.score.quality.toFixed(0) }}) sobre {{ statement.score.people }} pessoas. É 1% do EBITDA quando a nota passa de 80. <RouterLink class="link" to="/indicadores">Indicadores</RouterLink> · <RouterLink class="link" to="/pessoas">Pessoas</RouterLink></p>
    <p class="cell-sub">Estimativa de demonstração. O salário não está em Pessoas e o valor de aquisição do ativo é de exemplo. IRPJ e o não operacional ainda não têm conta.</p>
  </article>
</template>
