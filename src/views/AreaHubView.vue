<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { AREAS, areaDestination, moduleFeature } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const route = useRoute()
const router = useRouter()
const store = useErpStore()
const ui = useUiStore()
const can = (module?: string) => !module || store.can(moduleFeature(module))

const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
/** Fotos da fábrica, por baixo da cor do bloco da home. Gestão, serviços e finanças ficam só no grafismo. */
const AREA_PHOTO: Record<string, string> = {
  cadastros: 'roboflex/pecas-bancada.jpg',
  suprimentos: 'roboflex/pecas-prensa.jpg',
  comercial: 'roboflex/linha-cases.jpg',
  operacoes: 'roboflex/pecas-prensa.jpg',
}

const area = computed(() => AREAS.find(entry => entry.id === route.params.id))
const photo = computed(() => (area.value && AREA_PHOTO[area.value.id]) || '')
const groups = computed(() => (area.value?.groups ?? [])
  .map(group => ({ ...group, items: group.items.filter(item => can(item.module)) }))
  .filter(group => group.items.length))

watch(() => ui.role, () => {
  if (!area.value) return
  const destination = areaDestination(area.value, can)
  if (!destination) router.replace('/')
  else if (destination !== route.path) router.replace(destination)
})
</script>

<template>
  <div v-if="area" class="area-hub" :class="area.id" data-tour="area-modules">
    <header class="area-banner">
      <img v-if="photo" class="area-banner-photo" :src="asset(photo)" alt="" />
      <span class="area-banner-icon"><component :is="area.icon" :size="26" /></span>
      <p>{{ area.description }}</p>
    </header>
    <section v-for="group in groups" :key="group.label" class="area-group">
      <h2>{{ group.label }}</h2>
      <div class="area-cards">
        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="area-card">
          <span class="area-card-icon"><component :is="item.icon" :size="20" /></span>
          <span class="area-card-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
          <ArrowRight class="area-card-go" :size="16" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>
