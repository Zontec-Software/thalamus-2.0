<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AREAS, areaDestination, moduleFeature } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const route = useRoute()
const router = useRouter()
const store = useErpStore()
const ui = useUiStore()
const can = (module?: string) => !module || store.can(moduleFeature(module))

const area = computed(() => AREAS.find(entry => entry.id === route.params.id))
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
  <div v-if="area" class="area-hub" data-tour="area-modules">
    <p>{{ area.description }}</p>
    <section v-for="group in groups" :key="group.label" class="area-group">
      <h2>{{ group.label }}</h2>
      <div class="area-cards">
        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="area-card">
          <span><component :is="item.icon" :size="18" /></span>
          <strong>{{ item.label }}</strong>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
