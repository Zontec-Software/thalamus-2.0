<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { productActions } from './actions'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const itemOpen = computed(() => route.path.startsWith('/produtos/item/'))

const actionCount = computed(() => productActions(store.state, store.can, ui.userName).length)

const links = computed(() => [
  { to: '/produtos', label: 'Portfólio', exact: true, count: 0 },
  { to: '/produtos/classificacao', label: 'Classificação', count: 0 },
  { to: '/produtos/acoes', label: 'Ações', count: actionCount.value },
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
