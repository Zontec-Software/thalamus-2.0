<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Columns3, Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import type { Opportunity } from '../../types/domain'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format'
import TablePager from '../products/TablePager.vue'
import { usePager } from '../products/shared'
import NewOpportunityModal from './NewOpportunityModal.vue'
import { OPPORTUNITY_COLUMNS, attentionOf, opportunityList, useCrmScope, type OpportunityColumn } from './shared'

const store = useErpStore()
const router = useRouter()
const { opportunities, tenantName } = useCrmScope()
const creating = ref(false)
const columnsOpen = ref(false)
const previewId = ref('')

const partner = (entry: Opportunity) => store.state.partners.find(item => item.id === entry.partnerId)
const cacOf = (entry: Opportunity) => store.state.demands.filter(demand => demand.origin === 'Oportunidade' && demand.originId === entry.id).reduce((sum, demand) => sum + (demand.estimatedCost ?? 0), 0)
function touched(entry: Opportunity) {
  const times = [entry.createdAt, ...entry.activities.map(activity => activity.at), ...store.state.events.filter(event => event.ref === entry.id).map(event => event.at)].filter((value): value is string => !!value)
  return times.sort().at(-1)
}
function haystack(entry: Opportunity) {
  const flags = attentionOf(entry, today())
  const life = entry.stage === 'Ganho' ? 'conquistada conquista' : entry.stage === 'Perdido' ? 'perdida' : 'em aberto aberta'
  return [
    entry.id, entry.title, entry.stage, entry.temperature, entry.source, entry.segment, entry.statusNote, entry.lossReason, entry.notes, entry.nextAction, entry.dealType,
    store.partnerName(entry.partnerId), partner(entry)?.document, partner(entry)?.vertical, store.userName(entry.ownerId), tenantName(entry.tenantId),
    fmtDate(entry.expectedClose), entry.createdAt ? fmtDate(entry.createdAt) : '', fmtCurrency(entry.value), String(entry.value), life, ...flags,
  ].join(' ').toLowerCase()
}
const filtered = computed(() => {
  const terms = opportunityList.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return opportunities.value.filter(entry => terms.every(term => haystack(entry).includes(term)))
})
const sorted = computed(() => {
  const key = opportunityList.sort
  const value = (entry: Opportunity): string | number => key === 'value' ? entry.value : key === 'created' ? entry.createdAt ?? '' : key === 'id' ? entry.id : entry.expectedClose
  return [...filtered.value].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return opportunityList.desc ? -order : order
  })
})
const { page, size, pages, slice, range } = usePager(sorted, 25, 'oportunidades')
const totals = computed(() => `${range.value} · ticket ${fmtCurrency(filtered.value.reduce((sum, entry) => sum + entry.value, 0))}`)
const shown = (column: OpportunityColumn) => opportunityList.columns.includes(column)
const preview = computed(() => opportunities.value.find(entry => entry.id === previewId.value))
function sortBy(key: typeof opportunityList.sort) {
  if (opportunityList.sort === key) opportunityList.desc = !opportunityList.desc
  else Object.assign(opportunityList, { sort: key, desc: false })
}
const arrow = (key: typeof opportunityList.sort) => opportunityList.sort === key ? (opportunityList.desc ? '▼' : '▲') : ''
</script>

<template>
  <article class="card flush" data-tour="record-list">
    <div class="list-tools">
      <input v-model="opportunityList.query" class="filter grow" placeholder="Buscar por cliente, fase, vendedor, temperatura, origem, vertical, empresa, código ou situação" aria-label="Pesquisar oportunidades" />
      <div class="column-menu">
        <button class="button secondary" @click="columnsOpen = !columnsOpen"><Columns3 :size="14" /> Colunas</button>
        <div v-if="columnsOpen" class="menu" @mouseleave="columnsOpen = false">
          <label v-for="column in OPPORTUNITY_COLUMNS" :key="column.id"><input v-model="opportunityList.columns" type="checkbox" :value="column.id" /> {{ column.label }}</label>
        </div>
      </div>
      <button class="button" data-tour="new-record" @click="creating = true"><Plus :size="14" /> Nova oportunidade</button>
    </div>

    <table class="dense">
      <thead>
        <tr>
          <th>Descrição</th>
          <th v-if="shown('id')">Código</th>
          <th v-if="shown('client')">Cliente</th>
          <th v-if="shown('stage')">Fase</th>
          <th v-if="shown('owner')">Vendedor</th>
          <th v-if="shown('temperature')">Temperatura</th>
          <th v-if="shown('source')">Origem</th>
          <th v-if="shown('segment')">Vertical</th>
          <th v-if="shown('close')"><button type="button" class="link" @click="sortBy('close')">Previsão {{ arrow('close') }}</button></th>
          <th v-if="shown('created')"><button type="button" class="link" @click="sortBy('created')">Criação {{ arrow('created') }}</button></th>
          <th v-if="shown('tenant')">Empresa</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in slice" :key="entry.id" class="clickable" @click="previewId = entry.id">
          <td>
            <span class="opp-lead">
              <i class="temp-mark" :data-temp="entry.temperature ?? 'Morno'" :title="entry.temperature ?? 'Morno'"></i>
              <span>
                <span class="cell-main">{{ store.partnerName(entry.partnerId) }}</span>
                <span class="cell-sub">{{ fmtCurrency(entry.value) }} · {{ entry.stage }}</span>
              </span>
            </span>
          </td>
          <td v-if="shown('id')"><span class="code">{{ entry.id }}</span></td>
          <td v-if="shown('client')">{{ store.partnerName(entry.partnerId) }}</td>
          <td v-if="shown('stage')"><StatusBadge :value="entry.stage" /></td>
          <td v-if="shown('owner')">{{ store.userName(entry.ownerId) }}</td>
          <td v-if="shown('temperature')"><StatusBadge :value="entry.temperature ?? 'Morno'" /></td>
          <td v-if="shown('source')">{{ entry.source }}</td>
          <td v-if="shown('segment')">{{ partner(entry)?.vertical ?? entry.segment ?? '—' }}</td>
          <td v-if="shown('close')" :class="{ 'risk-text': entry.stage !== 'Ganho' && entry.stage !== 'Perdido' && entry.expectedClose < today() }">{{ fmtDate(entry.expectedClose) }}</td>
          <td v-if="shown('created')">{{ entry.createdAt ? fmtDate(entry.createdAt) : '—' }}</td>
          <td v-if="shown('tenant')">{{ tenantName(entry.tenantId) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!filtered.length" class="empty-note">Nenhuma oportunidade para essa pesquisa.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="totals" />
  </article>

  <BaseModal :open="!!preview" :title="preview ? store.partnerName(preview.partnerId) : ''" :subtitle="preview?.id" width="460px" @close="previewId = ''">
    <template v-if="preview">
      <div class="kpi-strip" style="border-top:0; padding-top:0">
        <div class="kpi"><span>Ticket</span><strong>{{ fmtCurrency(preview.value) }}</strong></div>
        <div class="kpi"><span>CAC</span><strong>{{ fmtCurrency(cacOf(preview)) }}</strong><small>custo das demandas</small></div>
        <div class="kpi"><span>Última atualização</span><strong>{{ touched(preview) ? fmtDateTime(touched(preview)!) : '—' }}</strong></div>
      </div>
      <div class="flag-list">
        <span v-for="signal in attentionOf(preview, today())" :key="signal" class="status warning">{{ signal }}</span>
        <span v-if="preview.statusNote" class="status">{{ preview.statusNote }}</span>
        <span v-if="!attentionOf(preview, today()).length && !preview.statusNote" class="cell-sub">Nenhuma flag cadastrada.</span>
      </div>
    </template>
    <template #footer>
      <button class="button secondary" @click="previewId = ''">Fechar</button>
      <button class="button" @click="router.push(`/crm/oportunidade/${previewId}`)">Abrir oportunidade</button>
    </template>
  </BaseModal>

  <NewOpportunityModal :open="creating" @close="creating = false" />
</template>
