<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sectorOf } from '../../domain/enterprise'
import { peopleBoard } from '../../domain/people'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const openedForTour = ref(false)
const openedStructure = ref(false)

const lists = new Set(['/pessoas', '/pessoas/admissao', '/pessoas/desligamento', '/pessoas/organograma', '/pessoas/cargos'])
const showNav = computed(() => lists.has(route.path))
const board = computed(() => peopleBoard(store.state, ui.activeTenantId))
const vacant = computed(() => store.state.sectors.filter(entry => entry.tenantId === ui.activeTenantId && !entry.managerPositionId).length)
const links = computed(() => [
  { to: '/pessoas', label: 'Colaboradores', exact: true, count: 0 },
  { to: '/pessoas/admissao', label: 'Admissão', count: board.value.pendingApplications },
  { to: '/pessoas/desligamento', label: 'Desligamento', count: board.value.offboardingOpen },
  { to: '/pessoas/organograma', label: 'Organograma', count: vacant.value },
  { to: '/pessoas/cargos', label: 'Cargos', count: 0 },
])

function current(link: { to: string; exact?: boolean }) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}

function tourPerson() {
  const manager = store.state.users.find(user => store.state.sectors.some(sector => sector.managerId === user.id && store.state.users.some(member => member.id !== user.id && sectorOf(store.state, member)?.id === sector.id)))
  return manager?.id ?? store.state.users.find(user => !user.platformMaster)?.id
}

watch(() => ui.tourSteps[ui.tourIndex]?.target, target => {
  const aba = target?.includes('person-access') ? 'acesso' : target?.includes('person-file') ? 'dados' : target?.includes('person-role') ? 'vinculo' : ''
  if (aba) {
    openedStructure.value = false
    const id = tourPerson()
    if (!id) return
    openedForTour.value = true
    router.push({ path: `/pessoas/pessoa/${id}`, query: { aba } })
    return
  }
  if (target?.includes('org-chart')) {
    openedStructure.value = true
    if (route.path !== '/pessoas/organograma') router.push('/pessoas/organograma')
    return
  }
  if (openedStructure.value && route.path === '/pessoas/organograma') {
    openedStructure.value = false
    router.push('/pessoas')
  }
  const needsList = !!target && ['people-areas', 'record-list', 'new-record'].some(id => target.includes(id))
  if (needsList) openedStructure.value = false
  if (needsList && route.path !== '/pessoas') {
    router.push('/pessoas')
    return
  }
  if (openedForTour.value) {
    openedForTour.value = false
    if (route.path.startsWith('/pessoas/pessoa/')) router.push('/pessoas')
  }
})
</script>

<template>
  <nav v-if="showNav" class="orc-tabs" data-tour="people-areas">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to" :class="{ on: current(link) }">
      {{ link.label }}<b v-if="link.count">{{ link.count }}</b>
    </RouterLink>
  </nav>
  <RouterView />
</template>
