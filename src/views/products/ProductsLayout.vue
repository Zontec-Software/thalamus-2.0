<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { canApprove, catalogOf, itemFlags, requiredApprovals } from '../../domain/catalog'
import { hasFullAccess } from '../../domain/access'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const itemOpen = computed(() => route.path.startsWith('/produtos/item/'))

const live = computed(() => store.state.items.filter(item => !catalogOf(item).deletedAt))
const awaitingMe = computed(() => live.value.filter(item => {
  const catalog = catalogOf(item)
  return catalog.lifecycle === 'Em homologação' && requiredApprovals(item).some(role => !catalog.approvals[role] && canApprove(ui.role, role))
}).length + (hasFullAccess(ui.role) ? live.value.reduce((sum, item) => sum + catalogOf(item).keyChanges.filter(change => change.status === 'Pendente').length, 0) : 0))
const fiscalPending = computed(() => live.value.filter(item => itemFlags(store.state, item).some(flag => flag === 'Sem NCM' || flag === 'Sem CEST') || (item.catalog?.fiscalSync && item.catalog.fiscalSync.status !== 'Sincronizado')).length)
const draftVersions = computed(() => store.state.productRevisions.filter(entry => entry.status === 'Rascunho').length)
const openChanges = computed(() => store.state.engineeringChanges.filter(change => change.stage !== 'Implementada' && change.stage !== 'Recusada').length)

const links = computed(() => [
  { to: '/produtos', label: 'Produtos', exact: true, count: 0 },
  { to: '/produtos/classificacao', label: 'Classificação', count: 0 },
  { to: '/produtos/estruturas', label: 'Estruturas e roteiros', count: draftVersions.value },
  { to: '/produtos/mudancas', label: 'Mudanças', count: openChanges.value },
  { to: '/produtos/fiscal', label: 'Fiscal', count: fiscalPending.value },
  { to: '/produtos/homologacao', label: 'Análise do cadastro', count: awaitingMe.value },
])
function current(link: { to: string; exact?: boolean }) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}
</script>

<template>
  <nav v-if="!itemOpen" class="orc-tabs" data-tour="product-side">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to" :class="{ on: current(link) }">
      {{ link.label }}<b v-if="link.count">{{ link.count }}</b>
    </RouterLink>
  </nav>
  <RouterView />
</template>
