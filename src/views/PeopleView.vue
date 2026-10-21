<script setup lang="ts">
import { computed, ref } from 'vue'
import { BriefcaseBusiness, Building2, CheckCircle2, Plus, Search, Users } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { sectorOf } from '../domain/enterprise'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const sector = ref('')
const query = ref('')

const root = computed(() => store.state.sectors.find(entry => !entry.parentId))
const children = computed(() => store.state.sectors.filter(entry => entry.parentId === root.value?.id))
const members = (name: string) => store.state.users.filter(entry => sectorOf(store.state, entry)?.name === name)
const people = computed(() => store.state.users.filter(entry =>
  (!sector.value || members(sector.value).includes(entry))
  && (!query.value || `${entry.name} ${entry.role} ${entry.email ?? ''}`.toLowerCase().includes(query.value.toLowerCase()))))
const positionName = (id?: string) => store.state.positions.find(entry => entry.id === id)?.name
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar pessoa, papel ou e-mail" /></label>
      <button v-if="sector" class="chip active" @click="sector = ''">{{ sector }} ✕</button>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('person', 'new', sector ? { sector } : undefined)"><Plus :size="15" /> Nova pessoa</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Pessoas <Users :size="17" /></div><strong>{{ store.state.users.length }}</strong><small>{{ store.state.users.filter(entry => entry.role === 'Operador').length }} operadores no tablet</small></article>
    <article class="metric"><div class="metric-head">Acessos ativos <CheckCircle2 :size="17" /></div><strong>{{ store.state.users.filter(entry => entry.active !== false).length }}</strong><small>{{ store.state.users.filter(entry => entry.active === false).length }} desativado(s)</small></article>
    <article class="metric"><div class="metric-head">Cargos <BriefcaseBusiness :size="17" /></div><strong>{{ store.state.positions.length }}</strong><small>Com responsabilidades descritas</small></article>
    <article class="metric"><div class="metric-head">Setores <Building2 :size="17" /></div><strong>{{ store.state.sectors.length }}</strong><small>Cada um com centro de custo</small></article>
  </section>

  <article class="card org-chart" data-tour="org-chart">
    <div class="section-head"><div><h2>Organograma</h2><p>Clique em um setor para filtrar as pessoas.</p></div></div>
    <div v-if="root" class="org-root">
      <button class="org-node root" :class="{ active: sector === root.name }" @click="sector = sector === root.name ? '' : root.name">
        <b>{{ root.name }}</b><span>{{ store.userName(root.managerId) !== '—' ? store.userName(root.managerId) : 'Marina Souza' }}</span><small>{{ root.costCenter }}</small>
      </button>
      <div class="org-children">
        <button v-for="entry in children" :key="entry.id" class="org-node" :class="{ active: sector === entry.name }" @click="sector = sector === entry.name ? '' : entry.name">
          <b>{{ entry.name }}</b><span>{{ store.userName(entry.managerId) }}</span><small>{{ entry.costCenter }} · {{ members(entry.name).length }} pessoa(s)</small>
        </button>
      </div>
    </div>
  </article>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Pessoa</th><th>Setor / cargo</th><th>Papel de acesso</th><th>Turno</th><th>Acesso</th></tr></thead>
      <tbody>
        <tr v-for="user in people" :key="user.id" class="clickable" @click="ui.openRecord('person', user.id)">
          <td><b>{{ user.name }}</b><small class="cell-sub">{{ user.email ?? (user.role === 'Operador' ? 'Acesso pelo tablet (PIN)' : 'Sem e-mail cadastrado') }}</small></td>
          <td>{{ user.sector }}<small class="cell-sub">{{ positionName(user.positionId) ?? '—' }}</small></td>
          <td><span class="status info">{{ user.role }}</span></td>
          <td>{{ user.shift }}</td>
          <td><StatusBadge :value="user.active === false ? 'Inativo' : 'Ativo'" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!people.length" class="empty-note">Ninguém neste filtro.</p>
  </article>
</template>
