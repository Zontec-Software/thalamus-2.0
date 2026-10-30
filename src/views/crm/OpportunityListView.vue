<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Columns3, Plus } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import { today } from '../../domain/engine'
import { CRM_STAGES } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import type { Opportunity } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'
import HeaderFilter from '../products/HeaderFilter.vue'
import TablePager from '../products/TablePager.vue'
import { headerFilterMatches, usePager, type HeaderFilterOp } from '../products/shared'
import NewOpportunityModal from './NewOpportunityModal.vue'
import {
  CRM_SOURCES, CRM_VERTICALS, OPPORTUNITY_COLUMNS, OPPORTUNITY_LIFE_TABS, attentionOf, lifeOf, opportunityList, useCrmScope,
  type OpportunityColumn, type OpportunityLife, type OpportunityQuick, type OptionalColumn,
} from './shared'

const store = useErpStore()
const router = useRouter()
const { opportunities, tenantName, grouped } = useCrmScope()
const creating = ref(false)
const columnsOpen = ref(false)

const partner = (entry: Opportunity) => store.state.partners.find(item => item.id === entry.partnerId)
function cellText(entry: Opportunity, column: OpportunityColumn) {
  if (column === 'id') return `${entry.id} ${entry.title}`
  if (column === 'client') return `${store.partnerName(entry.partnerId)} ${partner(entry)?.document ?? ''}`
  if (column === 'stage') return entry.stage
  if (column === 'owner') return store.userName(entry.ownerId)
  if (column === 'temperature') return entry.temperature ?? 'Morno'
  if (column === 'source') return entry.source
  if (column === 'segment') return entry.segment ?? ''
  if (column === 'probability') return `${entry.probability}%`
  if (column === 'close') return fmtDate(entry.expectedClose)
  if (column === 'created') return entry.createdAt ? fmtDate(entry.createdAt) : ''
  if (column === 'won') return entry.wonAt ? fmtDate(entry.wonAt) : ''
  if (column === 'next') return entry.nextAction
  if (column === 'tenant') return tenantName(entry.tenantId)
  if (column === 'value') return `${entry.value} ${fmtCurrency(entry.value)}`
  return `${entry.mrr ?? 0} ${fmtCurrency(entry.mrr ?? 0)}`
}
const QUICK: Record<Exclude<OpportunityQuick, ''>, (entry: Opportunity) => boolean> = {
  Quente: entry => (entry.temperature ?? 'Morno') === 'Quente',
  Morno: entry => (entry.temperature ?? 'Morno') === 'Morno',
  Frio: entry => (entry.temperature ?? 'Morno') === 'Frio',
  'sem-status': entry => attentionOf(entry, today()).includes('Sem status'),
  'sem-acao': entry => attentionOf(entry, today()).includes('Sem próxima ação'),
  vencida: entry => attentionOf(entry, today()).includes('Fechamento vencido'),
}
function matches(entry: Opportunity, ignoreQuick = false, ignoreLife = false) {
  if (!ignoreLife && lifeOf(entry) !== opportunityList.life) return false
  if (!ignoreQuick && opportunityList.quick && !QUICK[opportunityList.quick](entry)) return false
  return (Object.entries(opportunityList.headerFilters) as [OpportunityColumn, { value: string; op: HeaderFilterOp }][])
    .every(([column, filter]) => headerFilterMatches(cellText(entry, column), filter.value, filter.op))
}
const filtered = computed(() => opportunities.value.filter(entry => matches(entry)))
const lifeCounts = computed(() => {
  const counts: Record<OpportunityLife, number> = { open: 0, won: 0, lost: 0 }
  for (const entry of opportunities.value) if (matches(entry, false, true)) counts[lifeOf(entry)] += 1
  return counts
})
const quickCount = (id: Exclude<OpportunityQuick, ''>) => opportunities.value.filter(entry => matches(entry, true) && QUICK[id](entry)).length
const QUICK_CHIPS: { id: Exclude<OpportunityQuick, ''>; label: string; alert?: boolean }[] = [
  { id: 'Quente', label: 'Quente' }, { id: 'Morno', label: 'Morno' }, { id: 'Frio', label: 'Frio' },
  { id: 'sem-status', label: 'Sem status', alert: true }, { id: 'sem-acao', label: 'Sem próxima ação', alert: true }, { id: 'vencida', label: 'Fechamento vencido', alert: true },
]

const sorted = computed(() => {
  const key = opportunityList.sort
  const value = (entry: Opportunity): string | number => key === 'value' ? entry.value : key === 'mrr' ? entry.mrr ?? 0 : key === 'created' ? entry.createdAt ?? '' : key === 'id' ? entry.id : entry.expectedClose
  return [...filtered.value].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return opportunityList.desc ? -order : order
  })
})
const { page, size, pages, slice, range } = usePager(sorted, 25, 'oportunidades')
const totals = computed(() => `${range.value} · ticket ${fmtCurrency(filtered.value.reduce((sum, entry) => sum + entry.value, 0))} · MRR ${fmtCurrency(filtered.value.reduce((sum, entry) => sum + (entry.mrr ?? 0), 0))}`)

const shown = (column: OptionalColumn) => opportunityList.columns.includes(column) && (column !== 'tenant' || grouped.value)
function sortBy(key: typeof opportunityList.sort) {
  if (opportunityList.sort === key) opportunityList.desc = !opportunityList.desc
  else Object.assign(opportunityList, { sort: key, desc: false })
}
const arrow = (key: typeof opportunityList.sort) => opportunityList.sort === key ? (opportunityList.desc ? '▼' : '▲') : ''
const menu = ref<OpportunityColumn | ''>('')
const filled = (column: OpportunityColumn) => !!opportunityList.headerFilters[column].value.trim()
function filterBindings(column: OpportunityColumn) {
  const filter = opportunityList.headerFilters[column]
  return {
    value: filter.value,
    op: filter.op,
    open: menu.value === column,
    onToggle: () => { menu.value = menu.value === column ? '' : column },
    onClose: () => { menu.value = '' },
    onClear: () => { Object.assign(filter, { value: '', op: 'contains' }); menu.value = '' },
    'onUpdate:value': (value: string) => { filter.value = value },
    'onUpdate:op': (op: HeaderFilterOp) => { filter.op = op },
  }
}
function closeMenu() { menu.value = '' }
onMounted(() => document.addEventListener('click', closeMenu))
onUnmounted(() => document.removeEventListener('click', closeMenu))
</script>

<template>
  <article class="card flush" data-tour="record-list">
    <div class="file-tabs" role="tablist">
      <button v-for="tab in OPPORTUNITY_LIFE_TABS" :key="tab.id" type="button" role="tab" :aria-selected="opportunityList.life === tab.id" :class="{ active: opportunityList.life === tab.id }" @click="opportunityList.life = tab.id">{{ tab.label }} <b>{{ lifeCounts[tab.id] }}</b></button>
    </div>
    <div class="list-tools">
      <div class="column-menu">
        <button class="button secondary" @click="columnsOpen = !columnsOpen"><Columns3 :size="14" /> Colunas</button>
        <div v-if="columnsOpen" class="menu" @mouseleave="columnsOpen = false">
          <label v-for="column in OPPORTUNITY_COLUMNS" :key="column.id"><input v-model="opportunityList.columns" type="checkbox" :value="column.id" /> {{ column.label }}</label>
        </div>
      </div>
      <button class="button" data-tour="new-record" @click="creating = true"><Plus :size="14" /> Nova oportunidade</button>
    </div>

    <div class="type-bar">
      <button type="button" class="chip" :class="{ active: !opportunityList.quick }" @click="opportunityList.quick = ''">Todas <b>{{ lifeCounts[opportunityList.life] }}</b></button>
      <button v-for="chip in QUICK_CHIPS" :key="chip.id" type="button" class="chip" :class="{ active: opportunityList.quick === chip.id, alert: chip.alert && quickCount(chip.id) }" @click="opportunityList.quick = chip.id">{{ chip.label }} <b>{{ quickCount(chip.id) }}</b></button>
    </div>

    <table class="dense">
      <thead>
        <tr>
          <th :class="{ filtering: filled('id') }"><HeaderFilter label="Oportunidade" sortable :arrow="arrow('id')" v-bind="filterBindings('id')" @sort="sortBy('id')" /></th>
          <th :class="{ filtering: filled('client') }"><HeaderFilter label="Cliente · CNPJ" v-bind="filterBindings('client')" /></th>
          <th :class="{ filtering: filled('stage') }"><HeaderFilter label="Fase" list-id="crm-stage-options" v-bind="filterBindings('stage')" /></th>
          <th v-if="shown('owner')" :class="{ filtering: filled('owner') }"><HeaderFilter label="Vendedor" v-bind="filterBindings('owner')" /></th>
          <th v-if="shown('temperature')" :class="{ filtering: filled('temperature') }"><HeaderFilter label="Temperatura" list-id="crm-temperature-options" v-bind="filterBindings('temperature')" /></th>
          <th v-if="shown('source')" :class="{ filtering: filled('source') }"><HeaderFilter label="Origem" list-id="crm-source-options" v-bind="filterBindings('source')" /></th>
          <th v-if="shown('segment')" :class="{ filtering: filled('segment') }"><HeaderFilter label="Vertical" list-id="crm-vertical-options" v-bind="filterBindings('segment')" /></th>
          <th v-if="shown('probability')" :class="{ filtering: filled('probability') }"><HeaderFilter label="Prob." v-bind="filterBindings('probability')" /></th>
          <th v-if="shown('close')" :class="{ filtering: filled('close') }"><HeaderFilter label="Previsão" sortable :arrow="arrow('close')" v-bind="filterBindings('close')" @sort="sortBy('close')" /></th>
          <th v-if="shown('created')" :class="{ filtering: filled('created') }"><HeaderFilter label="Criação" sortable :arrow="arrow('created')" v-bind="filterBindings('created')" @sort="sortBy('created')" /></th>
          <th v-if="shown('won')" :class="{ filtering: filled('won') }"><HeaderFilter label="Conversão" v-bind="filterBindings('won')" /></th>
          <th v-if="shown('next')" :class="{ filtering: filled('next') }"><HeaderFilter label="Próxima ação" v-bind="filterBindings('next')" /></th>
          <th v-if="shown('tenant')" :class="{ filtering: filled('tenant') }"><HeaderFilter label="Empresa" v-bind="filterBindings('tenant')" /></th>
          <th :class="{ filtering: filled('value') }"><HeaderFilter label="Ticket" sortable :arrow="arrow('value')" v-bind="filterBindings('value')" @sort="sortBy('value')" /></th>
          <th :class="{ filtering: filled('mrr') }"><HeaderFilter label="MRR" sortable :arrow="arrow('mrr')" v-bind="filterBindings('mrr')" @sort="sortBy('mrr')" /></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in slice" :key="entry.id" class="clickable" @click="router.push(`/crm/oportunidade/${entry.id}`)">
          <td><span class="cell-main">{{ entry.title }}</span><span class="cell-sub code">{{ entry.id }}</span><div v-if="attentionOf(entry, today()).length" class="flag-list"><span v-for="signal in attentionOf(entry, today())" :key="signal" class="status warning">{{ signal }}</span></div></td>
          <td>{{ store.partnerName(entry.partnerId) }}<span class="cell-sub">{{ partner(entry)?.document ?? '—' }}</span></td>
          <td><StatusBadge :value="entry.stage" /><span v-if="entry.lossReason" class="cell-sub">{{ entry.lossReason }}</span></td>
          <td v-if="shown('owner')">{{ store.userName(entry.ownerId) }}</td>
          <td v-if="shown('temperature')"><StatusBadge :value="entry.temperature ?? 'Morno'" /></td>
          <td v-if="shown('source')"><span class="cell-sub">{{ entry.source }}</span></td>
          <td v-if="shown('segment')"><span class="cell-sub">{{ entry.segment ?? '—' }}</span></td>
          <td v-if="shown('probability')">{{ entry.probability }}%</td>
          <td v-if="shown('close')" :class="{ 'risk-text': lifeOf(entry) === 'open' && entry.expectedClose < today() }">{{ fmtDate(entry.expectedClose) }}</td>
          <td v-if="shown('created')"><span class="cell-sub">{{ entry.createdAt ? fmtDate(entry.createdAt) : '—' }}</span></td>
          <td v-if="shown('won')"><span class="cell-sub">{{ entry.wonAt ? fmtDate(entry.wonAt) : '—' }}</span></td>
          <td v-if="shown('next')"><span class="cell-sub">{{ entry.nextAction }}</span></td>
          <td v-if="shown('tenant')"><span class="cell-sub">{{ tenantName(entry.tenantId) }}</span></td>
          <td>{{ fmtCurrency(entry.value) }}</td>
          <td><b>{{ fmtCurrency(entry.mrr ?? 0) }}</b></td>
        </tr>
      </tbody>
    </table>
    <datalist id="crm-stage-options"><option v-for="stage in [...CRM_STAGES, 'Perdida']" :key="stage" :value="stage" /></datalist>
    <datalist id="crm-temperature-options"><option value="Quente" /><option value="Morno" /><option value="Frio" /></datalist>
    <datalist id="crm-source-options"><option v-for="source in CRM_SOURCES" :key="source" :value="source" /></datalist>
    <datalist id="crm-vertical-options"><option v-for="vertical in CRM_VERTICALS" :key="vertical" :value="vertical" /></datalist>
    <p v-if="!filtered.length" class="empty-note">Nenhuma oportunidade com esses filtros.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="totals" />
  </article>

  <NewOpportunityModal :open="creating" @close="creating = false" />
</template>
