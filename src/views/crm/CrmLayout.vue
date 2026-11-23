<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { today } from '../../domain/engine'
import { CRM_FUNNELS, FUNNEL_LABEL, solutionOptions } from '../../domain/enterprise'
import { channelCaseStatus } from '../../domain/crmRoutine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { attentionOf, crmScope, useCrmScope } from './shared'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const { canGroup, canTeam, opportunities, sellers } = useCrmScope()
const pageOpen = computed(() => route.path.startsWith('/crm/oportunidade/'))
const solutions = computed(() => solutionOptions(store.state, ui.activeTenantId))
watch(() => crmScope.funnel, funnel => { if (funnel !== 'Soluções') crmScope.solution = '' })

const attention = computed(() => opportunities.value.filter(entry => attentionOf(entry, today()).length).length)
const myTasks = computed(() => store.state.opportunities.reduce((sum, entry) => sum + (entry.ownerId === ui.sessionUserId ? entry.activities.filter(activity => !activity.done && activity.at.slice(0, 10) <= today()).length : 0), 0))
const evidenceToReview = computed(() => canTeam.value ? store.crmSellers([ui.activeTenantId]).reduce((sum, link) => sum + store.state.effortRecords.filter(entry => entry.ownerId === link.userId && entry.tenantId === link.tenantId && entry.review === 'pending').length, 0) : 0)
const overdueCases = computed(() => store.state.channelCases.filter(entry => entry.tenantId === ui.activeTenantId && channelCaseStatus(entry) === 'Vencido').length)
const links = computed(() => [
  { to: '/crm', label: 'Painel', exact: true, count: 0 },
  { to: '/crm/oportunidades', label: 'Oportunidades', count: attention.value },
  { to: '/crm/tarefas', label: 'Minhas tarefas', count: myTasks.value },
  { to: '/crm/faturamento', label: 'Faturamento', count: 0 },
  { to: '/crm/canais', label: 'Canais', count: overdueCases.value },
  ...(canTeam.value ? [{ to: '/crm/equipe', label: 'Equipe', count: evidenceToReview.value }] : []),
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
      <select v-model="crmScope.funnel" class="filter" aria-label="Trilha"><option value="">Todas as trilhas</option><option v-for="funnel in CRM_FUNNELS" :key="funnel" :value="funnel">{{ FUNNEL_LABEL[funnel] }}</option></select>
      <select v-if="crmScope.funnel === 'Soluções'" v-model="crmScope.solution" class="filter" aria-label="Solução"><option value="">Todas as soluções</option><option v-for="solution in solutions" :key="solution" :value="solution">{{ solution }}</option></select>
      <select v-if="canTeam" v-model="crmScope.owner" class="filter" aria-label="Vendedor"><option value="">Todos os vendedores</option><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select>
      <select v-if="canGroup" v-model="crmScope.groupId" class="filter" aria-label="Empresa ou grupo"><option value="">Esta empresa</option><option v-for="group in store.state.economicGroups" :key="group.id" :value="group.id">{{ group.name }}</option></select>
    </div>
  </div>
  <RouterView />
</template>
