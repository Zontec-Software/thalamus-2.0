<script setup lang="ts">
import { computed, ref } from 'vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { INVOICE_UNITS, billingForMonth } from '../../domain/crmRoutine'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { crmScope, useCrmScope } from './shared'

const store = useErpStore()
const ui = useUiStore()
const { tenantIds, tenantName, grouped, canTeam } = useCrmScope()

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const label = (value: string) => `${monthNames[Number(value.slice(5, 7)) - 1]} de ${value.slice(0, 4)}`
const options = computed(() => {
  const [year, month] = today().slice(0, 7).split('-').map(Number)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
})
const month = ref(options.value[0])
const view = ref<'eligible' | 'excluded'>('eligible')
const ownerFilter = computed(() => canTeam.value ? (crmScope.owner ? [crmScope.owner] : undefined) : [ui.sessionUserId])
const result = computed(() => billingForMonth(store.state, tenantIds.value, month.value, ownerFilter.value))
const history = computed(() => options.value.map(value => billingForMonth(store.state, tenantIds.value, value, ownerFilter.value)))
const pct = (value: number | null) => value === null ? '—' : `${Math.round(value * 1000) / 10}%`
const money = (value: number | null) => value === null ? 'Sem conciliação' : fmtCurrency(value)
const unitTotal = computed(() => INVOICE_UNITS.reduce((sum, unit) => sum + result.value.units[unit], 0))
const rows = computed(() => view.value === 'eligible' ? result.value.eligible.map(note => ({ note, reason: '' })) : result.value.excluded.map(entry => ({ note: entry.note, reason: entry.reason as string })))
const reconciliationStatus = computed(() => result.value.reconciliation === 'conciliado' ? 'Conciliada' : result.value.reconciliation === 'parcial' ? 'Parcial' : 'Sem conciliação')
</script>

<template>
  <p class="notice">Simulação: as notas fiscais vêm do Omie, que é o dono da nota. Aqui só entram as autorizadas, conciliadas, sem intercompany e sem duplicata (empresa + chave fiscal), emitidas até a data de corte.</p>

  <article class="card item-hero" data-tour="crm-billing">
    <div class="section-head" style="margin-top:0">
      <div>
        <h2>{{ label(month) }}</h2>
        <p>{{ grouped ? 'Soma das empresas do grupo' : tenantName() }}. Meta da versão aprovada, faturado por competência.</p>
      </div>
      <div class="filter-row">
        <select v-model="month" class="filter" aria-label="Competência"><option v-for="value in options" :key="value" :value="value">{{ label(value) }}</option></select>
      </div>
    </div>
    <div class="kpi-strip">
      <div class="kpi" :class="result.ratio === null ? '' : result.ratio >= 1 ? 'success' : 'warning'"><span>Atingido</span><strong>{{ pct(result.ratio) }}</strong><small>{{ result.goal === null ? 'meta sem aprovação' : result.actual === null ? 'aguarda conciliação' : 'faturado sobre a meta' }}</small></div>
      <div class="kpi"><span>Meta aprovada</span><strong>{{ result.goal === null ? '—' : fmtCurrency(result.goal) }}</strong><small>{{ result.goalApproved ? 'versão aprovada' : result.goal === null ? 'nenhuma versão aprovada' : 'parte do grupo sem aprovação' }}</small></div>
      <div class="kpi"><span>Faturado</span><strong>{{ money(result.actual) }}</strong><small>{{ result.actual === null ? 'Sem conciliação não é zero' : `até ${fmtDate(result.asOf)}` }}</small></div>
      <div class="kpi" :class="{ danger: (result.gap ?? 0) > 0 }"><span>Faltante</span><strong>{{ result.gap === null ? '—' : fmtCurrency(result.gap) }}</strong><small>para bater a meta</small></div>
      <div class="kpi"><span>Conciliação</span><strong><StatusBadge :value="reconciliationStatus" /></strong><small>{{ result.eligible.length }} nota(s) elegível(is) · {{ result.excluded.length }} fora</small></div>
    </div>
    <table class="dense" style="margin-top:12px">
      <thead><tr><th>Unidade</th><th>Faturado elegível</th><th>Parte</th></tr></thead>
      <tbody>
        <tr v-for="unit in INVOICE_UNITS" :key="unit"><td>{{ unit }}</td><td>{{ fmtCurrency(result.units[unit]) }}</td><td>{{ unitTotal ? pct(result.units[unit] / unitTotal) : '—' }}</td></tr>
      </tbody>
    </table>
    <p class="cell-sub">MRR, implantação e venda avulsa ficam em unidades separadas; nunca se somam à conquista do CRM.</p>
  </article>

  <article class="card flush">
    <div class="section-head">
      <div><h2>Notas</h2><p>Ver o que entrou na soma e o que ficou de fora, com o motivo.</p></div>
      <div class="segmented">
        <button :class="{ active: view === 'eligible' }" @click="view = 'eligible'">Ver notas elegíveis ({{ result.eligible.length }})</button>
        <button :class="{ active: view === 'excluded' }" @click="view = 'excluded'">Fora da soma ({{ result.excluded.length }})</button>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Nota</th><th>Emissão</th><th>Cliente</th><th>Unidade</th><th>Vendedor</th><th>Valor</th><th v-if="view === 'excluded'">Motivo</th></tr></thead>
      <tbody>
        <tr v-for="{ note, reason } in rows" :key="note.id">
          <td><span class="cell-main code">{{ note.number }}</span><span class="cell-sub">{{ grouped ? tenantName(note.tenantId) : note.fiscalKey }}</span></td>
          <td>{{ fmtDate(note.issuedAt) }}</td>
          <td>{{ store.partnerName(note.partnerId) }}</td>
          <td>{{ note.unit }}</td>
          <td>{{ note.ownerId ? store.userName(note.ownerId) : '—' }}</td>
          <td>{{ fmtCurrency(note.amount) }}</td>
          <td v-if="view === 'excluded'"><span class="status warning">{{ reason }}</span></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">{{ view === 'eligible' ? 'Nenhuma nota elegível nesta competência.' : 'Nada ficou de fora.' }}</p>
  </article>

  <article class="card flush" data-tour="crm-billing-months">
    <div class="section-head"><div><h2>Competências</h2><p>Clique numa linha para abrir o mês.</p></div></div>
    <table class="dense">
      <thead><tr><th>Competência</th><th>Meta</th><th>Faturado</th><th>Atingido</th><th>Conciliação</th></tr></thead>
      <tbody>
        <tr v-for="entry in history" :key="entry.month" class="clickable" :class="{ active: entry.month === month }" @click="month = entry.month">
          <td>{{ label(entry.month) }}</td>
          <td>{{ entry.goal === null ? '—' : fmtCurrency(entry.goal) }}</td>
          <td>{{ money(entry.actual) }}</td>
          <td>{{ pct(entry.ratio) }}</td>
          <td><StatusBadge :value="entry.reconciliation === 'conciliado' ? 'Conciliada' : entry.reconciliation === 'parcial' ? 'Parcial' : 'Sem conciliação'" /></td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
