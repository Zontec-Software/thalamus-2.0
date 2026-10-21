<script setup lang="ts">
import { computed, ref } from 'vue'
import { BriefcaseBusiness, Building2, CircleDollarSign, Factory, Plus, Search } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtCurrency } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const category = ref('')
const query = ref('')
const CATEGORIES = ['Produção', 'Manutenção', 'Assistência', 'Terceiro']

const services = computed(() => store.state.services.filter(entry =>
  (!category.value || entry.category === category.value)
  && (!query.value || `${entry.code} ${entry.name}`.toLowerCase().includes(query.value.toLowerCase()))))
const usage = (id: string) => store.state.proposals.filter(entry => entry.lines.some(line => line.serviceId === id)).length + store.state.demands.filter(entry => entry.serviceId === id).length
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar código ou serviço" /></label>
      <button class="chip" :class="{ active: !category }" @click="category = ''">Todos</button>
      <button v-for="entry in CATEGORIES" :key="entry" class="chip" :class="{ active: category === entry }" @click="category = entry">{{ entry }}</button>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('service', 'new')"><Plus :size="15" /> Novo serviço</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Serviços ativos <BriefcaseBusiness :size="17" /></div><strong>{{ store.state.services.filter(entry => entry.status === 'Ativo').length }}</strong><small>Um catálogo, vários usos</small></article>
    <article class="metric"><div class="metric-head">Internos <Factory :size="17" /></div><strong>{{ store.state.services.filter(entry => !entry.outsourced).length }}</strong><small>Custo por tempo padrão</small></article>
    <article class="metric"><div class="metric-head">Terceiros <Building2 :size="17" /></div><strong>{{ store.state.services.filter(entry => entry.outsourced).length }}</strong><small>Contratados via demanda</small></article>
    <article class="metric"><div class="metric-head">Vendáveis <CircleDollarSign :size="17" /></div><strong>{{ store.state.services.filter(entry => entry.price > 0).length }}</strong><small>Disponíveis em propostas</small></article>
  </section>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Código / serviço</th><th>Categoria</th><th>Execução</th><th>Tempo padrão</th><th>Custo</th><th>Preço</th><th>Usos</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="service in services" :key="service.id" class="clickable" @click="ui.openRecord('service', service.id)">
          <td><b>{{ service.code }}</b><small class="cell-sub">{{ service.name }}</small></td>
          <td><span class="status info">{{ service.category }}</span></td>
          <td>{{ service.outsourced ? `Terceiro${service.supplierId ? ` · ${store.partnerName(service.supplierId)}` : ''}` : 'Equipe interna' }}</td>
          <td>{{ service.standardMinutes ? `${service.standardMinutes} min` : '—' }}</td>
          <td>{{ fmtCurrency(service.cost) }} <small class="cell-sub">por {{ service.unit }}</small></td>
          <td>{{ service.price ? fmtCurrency(service.price) : 'Não vendido' }}</td>
          <td>{{ usage(service.id) }}</td>
          <td><StatusBadge :value="service.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!services.length" class="empty-note">Nenhum serviço neste filtro.</p>
  </article>
</template>
