<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { today } from '../../domain/engine'
import { opportunityIsOpen } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { attentionOf, crmScope, useCrmScope } from './shared'

const store = useErpStore()
const route = useRoute()
const { canGroup, opportunities, proposals, sellers } = useCrmScope()
const pageOpen = computed(() => route.path.startsWith('/crm/oportunidade/'))

const attention = computed(() => opportunities.value.filter(entry => attentionOf(entry, today()).length).length)
const overdue = computed(() => opportunities.value.filter(opportunityIsOpen).flatMap(entry => entry.activities).filter(activity => !activity.done && activity.at.slice(0, 10) < today()).length)
const links = computed(() => [
  { to: '/crm', label: 'Painel', exact: true, count: 0 },
  { to: '/crm/oportunidades', label: 'Oportunidades', count: attention.value },
  { to: '/crm/funil', label: 'Funil', count: 0 },
  { to: '/crm/propostas', label: 'Propostas', count: proposals.value.filter(entry => entry.status === 'Enviada' && entry.validUntil < today()).length },
  { to: '/crm/agenda', label: 'Agenda', count: overdue.value },
])
function current(link: { to: string; exact?: boolean }) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}
</script>

<template>
  <div v-if="!pageOpen" class="tab-row" data-tour="crm-areas">
    <nav class="orc-tabs">
      <RouterLink v-for="link in links" :key="link.to" :to="link.to" :class="{ on: current(link) }">
        {{ link.label }}<b v-if="link.count">{{ link.count }}</b>
      </RouterLink>
    </nav>
    <div class="filter-row">
      <select v-model="crmScope.owner" class="filter" aria-label="Vendedor"><option value="">Todos os vendedores</option><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select>
      <select v-if="canGroup" v-model="crmScope.groupId" class="filter" aria-label="Empresa ou grupo"><option value="">Esta empresa</option><option v-for="group in store.state.economicGroups" :key="group.id" :value="group.id">{{ group.name }}</option></select>
    </div>
  </div>
  <RouterView />
</template>
