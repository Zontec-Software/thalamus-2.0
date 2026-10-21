<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CalendarClock, CheckCircle2, CircleDollarSign, Plus, ReceiptText, Search } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { FinancialTitle } from '../types/domain'
import { daysUntil, fmtCurrency, fmtDate } from '../utils/format'

const route = useRoute()
const store = useErpStore()
const ui = useUiStore()
const kind = computed<FinancialTitle['kind']>(() => route.path === '/contas-pagar' ? 'Pagar' : 'Receber')
const filter = ref<'Abertos' | 'Vencidos' | 'Baixados' | 'Todos'>('Abertos')
const query = ref('')

const all = computed(() => store.state.financialTitles.filter(entry => entry.kind === kind.value))
const open = computed(() => all.value.filter(entry => entry.status === 'Aberto'))
const overdue = computed(() => open.value.filter(entry => daysUntil(entry.dueDate) < 0))
const titles = computed(() => all.value.filter(entry => {
  const passes = filter.value === 'Todos' || (filter.value === 'Abertos' && entry.status === 'Aberto') || (filter.value === 'Baixados' && entry.status === 'Baixado') || (filter.value === 'Vencidos' && entry.status === 'Aberto' && daysUntil(entry.dueDate) < 0)
  return passes && (!query.value || `${entry.id} ${entry.description} ${entry.reference} ${store.partnerName(entry.partnerId)}`.toLowerCase().includes(query.value.toLowerCase()))
}).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
const total = (list: FinancialTitle[]) => list.reduce((sum, entry) => sum + entry.amount, 0)
const buckets = computed(() => [
  { label: 'Vencidos', list: overdue.value, tone: 'danger' },
  { label: 'Próximos 7 dias', list: open.value.filter(entry => daysUntil(entry.dueDate) >= 0 && daysUntil(entry.dueDate) <= 7), tone: 'warning' },
  { label: '8 a 30 dias', list: open.value.filter(entry => daysUntil(entry.dueDate) > 7 && daysUntil(entry.dueDate) <= 30), tone: 'info' },
  { label: 'Acima de 30 dias', list: open.value.filter(entry => daysUntil(entry.dueDate) > 30), tone: 'neutral' },
])
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" :placeholder="`Buscar ${kind === 'Pagar' ? 'fornecedor' : 'cliente'}, título ou referência`" /></label>
      <button v-for="entry in ['Abertos', 'Vencidos', 'Baixados', 'Todos'] as const" :key="entry" class="chip" :class="{ active: filter === entry }" @click="filter = entry">{{ entry }}</button>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('title', 'new', { kind })"><Plus :size="15" /> Lançamento manual</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Em aberto <CircleDollarSign :size="17" /></div><strong>{{ fmtCurrency(total(open)) }}</strong><small>{{ open.length }} título(s)</small></article>
    <article class="metric"><div class="metric-head">Vencidos <CalendarClock :size="17" /></div><strong :class="{ 'risk-text': overdue.length }">{{ fmtCurrency(total(overdue)) }}</strong><small>{{ overdue.length }} título(s)</small></article>
    <article class="metric"><div class="metric-head">{{ kind === 'Pagar' ? 'Pagos' : 'Recebidos' }} <CheckCircle2 :size="17" /></div><strong>{{ fmtCurrency(total(all.filter(entry => entry.status === 'Baixado'))) }}</strong><small>Conferidos com o Omie</small></article>
    <article class="metric"><div class="metric-head">Origem automática <ReceiptText :size="17" /></div><strong>{{ Math.round(all.filter(entry => entry.origin && entry.origin !== 'Manual').length / Math.max(1, all.length) * 100) }}%</strong><small>{{ kind === 'Pagar' ? 'Compras e serviços' : 'Faturamento e assistência' }}</small></article>
  </section>

  <article class="card aging" data-tour="aging">
    <div class="section-head"><div><h2>Vencimentos</h2><p>Saldo em aberto por faixa de prazo</p></div></div>
    <div class="aging-grid">
      <div v-for="bucket in buckets" :key="bucket.label" class="aging-cell" :class="bucket.tone">
        <span>{{ bucket.label }}</span><strong>{{ fmtCurrency(total(bucket.list)) }}</strong><small>{{ bucket.list.length }} título(s)</small>
        <div class="progress"><span :style="{ width: `${total(open) ? total(bucket.list) / total(open) * 100 : 0}%` }"></span></div>
      </div>
    </div>
  </article>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Título</th><th>{{ kind === 'Pagar' ? 'Fornecedor' : 'Cliente' }}</th><th>Descrição</th><th>Origem</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
      <tbody>
        <tr v-for="title in titles" :key="title.id" class="clickable" @click="ui.openRecord('title', title.id)">
          <td><b>{{ title.id }}</b><small class="cell-sub">{{ title.reference }}</small></td>
          <td>{{ store.partnerName(title.partnerId) }}</td>
          <td>{{ title.description }}</td>
          <td>{{ title.origin ?? 'Manual' }}</td>
          <td :class="{ 'risk-text': title.status === 'Aberto' && daysUntil(title.dueDate) < 0 }">{{ fmtDate(title.dueDate) }}<small v-if="title.status === 'Aberto' && daysUntil(title.dueDate) < 0" class="cell-sub">{{ -daysUntil(title.dueDate) }} dia(s) em atraso</small></td>
          <td><b>{{ fmtCurrency(title.amount) }}</b></td>
          <td><StatusBadge :value="title.status === 'Aberto' && daysUntil(title.dueDate) < 0 ? 'Vencido' : title.status" /></td>
          <td @click.stop><button v-if="title.status === 'Aberto'" class="button small" @click="store.settleTitle(title.id)">Baixar</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!titles.length" class="empty-note">Nenhum título neste filtro.</p>
  </article>
</template>
