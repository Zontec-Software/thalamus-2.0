<script setup lang="ts">
import { computed } from 'vue'
import { useErpStore } from '../../stores/erp'
import { fmtDateTime } from '../../utils/format'

const props = defineProps<{ refId: string; createdAt?: string; createdText?: string }>()
const store = useErpStore()
const events = computed(() => store.eventsFor(props.refId))
</script>

<template>
  <h3 class="drawer-title">Linha do tempo</h3>
  <ol class="timeline">
    <li v-for="event in events" :key="event.id">
      <i></i>
      <div><strong>{{ event.text }}</strong><span>{{ fmtDateTime(event.at) }} · {{ event.module }} · {{ event.actor }}</span></div>
    </li>
    <li v-if="createdAt"><i></i><div><strong>{{ createdText ?? 'Registro criado' }}</strong><span>{{ fmtDateTime(createdAt) }}</span></div></li>
  </ol>
  <p v-if="!events.length && !createdAt" class="empty-note">Sem eventos registrados.</p>
</template>
