<script setup lang="ts">
import { computed, ref } from 'vue'
import { BriefcaseBusiness, Building2, CircleDollarSign, Factory, Plus, Search } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { PLACE_LABEL } from '../domain/services'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { ServiceCatalogItem } from '../types/domain'
import { fmtCurrency } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const use = ref<'' | 'sellable' | 'os' | 'routing' | 'terceiro'>('')
const query = ref('')

const own = computed(() => store.state.services.filter(entry => entry.tenantId === ui.activeTenantId))
const services = computed(() => own.value.filter(entry => {
  const uses = !use.value
    || (use.value === 'sellable' && entry.sellable)
    || (use.value === 'os' && entry.usableInServiceOrder)
    || (use.value === 'routing' && entry.usableInRouting)
    || (use.value === 'terceiro' && entry.executor === 'Terceirizado')
  const text = !query.value || `${entry.code} ${entry.name}`.toLowerCase().includes(query.value.toLowerCase())
  return uses && text
}))

function useLabels(service: ServiceCatalogItem) {
  return [
    service.sellable ? 'Venda' : '',
    service.usableInServiceOrder ? 'OS' : '',
    service.usableInRouting ? 'Roteiro' : '',
  ].filter(Boolean)
}
const usageCount = (id: string) => store.state.proposals.filter(entry => entry.lines.some(line => line.serviceId === id)).length
  + store.state.demands.filter(entry => entry.serviceId === id).length
  + store.state.items.filter(entry => entry.routing?.some(step => step.serviceId === id)).length
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar código ou serviço" /></label>
      <button class="chip" :class="{ active: !use }" @click="use = ''">Todos</button>
      <button class="chip" :class="{ active: use === 'sellable' }" @click="use = 'sellable'">Venda</button>
      <button class="chip" :class="{ active: use === 'os' }" @click="use = 'os'">Ordem de serviço</button>
      <button class="chip" :class="{ active: use === 'routing' }" @click="use = 'routing'">Roteiro</button>
      <button class="chip" :class="{ active: use === 'terceiro' }" @click="use = 'terceiro'">Terceirizado</button>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('service', 'new')"><Plus :size="15" /> Novo serviço</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Serviços ativos <BriefcaseBusiness :size="17" /></div><strong>{{ own.filter(entry => entry.status === 'Ativo').length }}</strong><small>Um cadastro, vários usos</small></article>
    <article class="metric"><div class="metric-head">Equipe própria <Factory :size="17" /></div><strong>{{ own.filter(entry => entry.executor === 'Própria').length }}</strong><small>Local à parte de quem executa</small></article>
    <article class="metric"><div class="metric-head">Terceirizados <Building2 :size="17" /></div><strong>{{ own.filter(entry => entry.executor === 'Terceirizado').length }}</strong><small>Com datasheet anexado</small></article>
    <article class="metric"><div class="metric-head">Vendáveis <CircleDollarSign :size="17" /></div><strong>{{ own.filter(entry => entry.sellable).length }}</strong><small>Preço informado, sem lista</small></article>
  </section>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Código / serviço</th><th>Usos</th><th>Local</th><th>Executor</th><th>Tempo estimado</th><th>Preço</th><th>Onde aparece</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="service in services" :key="service.id" class="clickable" @click="ui.openRecord('service', service.id)">
          <td><b>{{ service.code }}</b><small class="cell-sub">{{ service.name }}</small></td>
          <td><span v-for="label in useLabels(service)" :key="label" class="status info" style="margin-right:4px">{{ label }}</span><span v-if="!useLabels(service).length" class="cell-sub">Nenhum</span></td>
          <td>{{ PLACE_LABEL[service.place] }}</td>
          <td>{{ service.executor === 'Terceirizado' ? `Terceirizado${service.supplierId ? ` · ${store.partnerName(service.supplierId)}` : ''}` : 'Equipe própria' }}</td>
          <td>{{ service.estimatedMinutes != null ? `${service.estimatedMinutes} min` : 'Não informado' }}</td>
          <td>{{ service.sellable || service.usableInServiceOrder ? (service.price ? fmtCurrency(service.price) : 'Sem preço') : '—' }}</td>
          <td>{{ usageCount(service.id) }}</td>
          <td><StatusBadge :value="service.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!services.length" class="empty-note">Nenhum serviço neste filtro.</p>
  </article>
</template>
