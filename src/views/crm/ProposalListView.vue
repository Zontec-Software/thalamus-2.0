<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '../../components/StatusBadge.vue'
import { today } from '../../domain/engine'
import { proposalTotal } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Proposal } from '../../types/domain'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { useCrmScope } from './shared'

type Tab = 'andamento' | 'aceitas' | 'recusadas'
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { proposals } = useCrmScope()
const tab = ref<Tab>('andamento')
const query = ref('')

const TABS: { id: Tab; label: string; match: (entry: Proposal) => boolean }[] = [
  { id: 'andamento', label: 'Em andamento', match: entry => entry.status === 'Rascunho' || entry.status === 'Enviada' },
  { id: 'aceitas', label: 'Aceitas', match: entry => entry.status === 'Aceita' },
  { id: 'recusadas', label: 'Recusadas', match: entry => entry.status === 'Recusada' },
]
const opportunityOf = (entry: Proposal) => store.state.opportunities.find(item => item.id === entry.opportunityId)
const text = (entry: Proposal) => `${entry.id} ${store.partnerName(entry.partnerId)} ${opportunityOf(entry)?.title ?? ''}`.toLowerCase()
const searched = computed(() => proposals.value.filter(entry => !query.value || text(entry).includes(query.value.toLowerCase())))
const rows = computed(() => searched.value.filter(TABS.find(entry => entry.id === tab.value)!.match).sort((a, b) => a.validUntil.localeCompare(b.validUntil)))
const expired = (entry: Proposal) => entry.status === 'Enviada' && entry.validUntil < today()
</script>

<template>
  <article class="card flush" data-tour="crm-proposals">
    <div class="file-tabs" role="tablist">
      <button v-for="entry in TABS" :key="entry.id" type="button" role="tab" :class="{ active: tab === entry.id }" @click="tab = entry.id">{{ entry.label }} <b>{{ searched.filter(entry.match).length }}</b></button>
    </div>
    <div class="partner-filters">
      <input v-model="query" class="filter grow" placeholder="Proposta, cliente ou oportunidade" />
      <span class="cell-sub">Propostas nascem na ficha da oportunidade.</span>
    </div>
    <table class="dense">
      <thead><tr><th>Proposta</th><th>Cliente</th><th>Oportunidade</th><th>Itens</th><th>Total</th><th>Validade</th><th>Pedido</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="proposal in rows" :key="proposal.id" class="clickable" @click="ui.openRecord('proposal', proposal.id)">
          <td><span class="cell-main code">{{ proposal.id }}</span><span class="cell-sub">{{ fmtDate(proposal.createdAt) }}</span></td>
          <td>{{ store.partnerName(proposal.partnerId) }}</td>
          <td @click.stop><button v-if="opportunityOf(proposal)" class="link" @click="router.push(`/crm/oportunidade/${proposal.opportunityId}`)">{{ opportunityOf(proposal)!.title }}</button></td>
          <td>{{ proposal.lines.length }} linha(s)</td>
          <td><b>{{ fmtCurrency(proposalTotal(proposal)) }}</b><span v-if="proposal.discount" class="cell-sub">{{ proposal.discount }}% desc.</span></td>
          <td :class="{ 'risk-text': expired(proposal) }">{{ fmtDate(proposal.validUntil) }}<span v-if="expired(proposal)" class="cell-sub">vencida, cobrar retorno</span></td>
          <td><span class="cell-sub">{{ proposal.salesOrderId ?? '—' }}</span></td>
          <td><StatusBadge :value="proposal.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Nenhuma proposta nesta guia.</p>
  </article>
</template>
