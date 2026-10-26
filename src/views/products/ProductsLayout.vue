<script setup lang="ts">
import { computed } from 'vue'
import { Boxes, GitBranch, Receipt, ShieldCheck, Tags, Warehouse, Workflow, Wrench } from 'lucide-vue-next'
import { canApprove, catalogOf, itemFlags, requiredApprovals } from '../../domain/catalog'
import { hasFullAccess } from '../../domain/access'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

const store = useErpStore()
const ui = useUiStore()

const live = computed(() => store.state.items.filter(item => !catalogOf(item).deletedAt))
const awaitingMe = computed(() => live.value.filter(item => {
  const catalog = catalogOf(item)
  return catalog.lifecycle === 'Em homologação' && requiredApprovals(item).some(role => !catalog.approvals[role] && canApprove(ui.role, role))
}).length + (hasFullAccess(ui.role) ? live.value.reduce((sum, item) => sum + catalogOf(item).keyChanges.filter(change => change.status === 'Pendente').length, 0) : 0))
const fiscalPending = computed(() => live.value.filter(item => itemFlags(store.state, item).some(flag => flag === 'Sem NCM' || flag === 'Sem CEST') || (item.catalog?.fiscalSync && item.catalog.fiscalSync.status !== 'Sincronizado')).length)
const draftVersions = computed(() => store.state.productRevisions.filter(entry => entry.status === 'Rascunho').length)
const activeChanges = computed(() => store.state.engineeringChanges.filter(change => change.stage !== 'Implementada' && change.stage !== 'Recusada'))
const openChanges = computed(() => activeChanges.value.length)
const urgentChanges = computed(() => activeChanges.value.filter(change => change.priority === 'Urgente').length)
const tooling = computed(() => live.value.filter(item => item.type === 'FE').length)

interface MenuLink { to: string; label: string; icon: typeof Boxes; count: number; exact?: boolean; alert?: boolean }
const MENU = computed<{ group: string; links: MenuLink[] }[]>(() => [
  { group: 'Cadastro', links: [
    { to: '/produtos', label: 'Itens', icon: Boxes, count: live.value.length, exact: true },
    { to: '/produtos/classificacao', label: 'Classificação', icon: Tags, count: store.state.itemClasses.length },
  ] },
  { group: 'Engenharia', links: [
    { to: '/produtos/estruturas', label: 'Estruturas e roteiros', icon: GitBranch, count: draftVersions.value, alert: draftVersions.value > 0 },
    { to: '/produtos/mudancas', label: 'Mudanças', icon: Workflow, count: openChanges.value, alert: urgentChanges.value > 0 },
    { to: '/produtos/ferramental', label: 'Ferramental', icon: Wrench, count: tooling.value },
  ] },
  { group: 'Camadas', links: [
    { to: '/produtos/estoque', label: 'Estoque e unidades', icon: Warehouse, count: 0 },
    { to: '/produtos/fiscal', label: 'Fiscal', icon: Receipt, count: fiscalPending.value, alert: fiscalPending.value > 0 },
  ] },
  { group: 'Governança', links: [
    { to: '/produtos/homologacao', label: 'Análise do cadastro', icon: ShieldCheck, count: awaitingMe.value, alert: awaitingMe.value > 0 },
  ] },
])
</script>

<template>
  <div class="module-layout">
    <aside class="module-side" data-tour="product-side">
      <p class="module-side-title">Produtos</p>
      <template v-for="section in MENU" :key="section.group">
        <span class="nav-label">{{ section.group }}</span>
        <RouterLink v-for="link in section.links" :key="link.to" :to="link.to" :class="{ active: link.exact ? $route.path === link.to || $route.path.startsWith('/produtos/item/') : $route.path.startsWith(link.to) }">
          <component :is="link.icon" :size="15" /> {{ link.label }}
          <b v-if="link.count" :class="{ alert: link.alert }">{{ link.count }}</b>
        </RouterLink>
      </template>
      <p class="module-side-foot">Perfil atual: <b>{{ ui.role }}</b>. Cada camada mostra quem pode editar.</p>
    </aside>
    <div class="module-content"><RouterView /></div>
  </div>
</template>
