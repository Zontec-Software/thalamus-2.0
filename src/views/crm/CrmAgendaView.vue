<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { addDays, today } from '../../domain/engine'
import { opportunityIsOpen } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { fmtDateTime } from '../../utils/format'
import { useCrmScope } from './shared'

type Tab = 'atrasadas' | 'hoje' | 'semana' | 'todas'
const store = useErpStore()
const router = useRouter()
const { opportunities } = useCrmScope()
const tab = ref<Tab>('atrasadas')

const pending = computed(() => opportunities.value
  .filter(opportunityIsOpen)
  .flatMap(opportunity => opportunity.activities.filter(activity => !activity.done).map(activity => ({ opportunity, activity, day: activity.at.slice(0, 10) })))
  .sort((a, b) => a.activity.at.localeCompare(b.activity.at)))
const TABS: { id: Tab; label: string; match: (day: string) => boolean }[] = [
  { id: 'atrasadas', label: 'Atrasadas', match: day => day < today() },
  { id: 'hoje', label: 'Hoje', match: day => day === today() },
  { id: 'semana', label: 'Próximos 7 dias', match: day => day > today() && day <= addDays(today(), 7) },
  { id: 'todas', label: 'Todas pendentes', match: () => true },
]
const rows = computed(() => pending.value.filter(entry => TABS.find(item => item.id === tab.value)!.match(entry.day)))
</script>

<template>
  <article class="card flush" data-tour="crm-agenda">
    <div class="file-tabs" role="tablist">
      <button v-for="entry in TABS" :key="entry.id" type="button" role="tab" :class="{ active: tab === entry.id }" @click="tab = entry.id">{{ entry.label }} <b>{{ pending.filter(row => entry.match(row.day)).length }}</b></button>
    </div>
    <table class="dense">
      <thead><tr><th>Quando</th><th>Atividade</th><th>Oportunidade</th><th>Vendedor</th><th></th></tr></thead>
      <tbody>
        <tr v-for="{ opportunity, activity, day } in rows" :key="activity.id" class="clickable" @click="router.push({ path: `/crm/oportunidade/${opportunity.id}`, query: { aba: 'acoes' } })">
          <td :class="{ 'risk-text': day < today() }">{{ fmtDateTime(activity.at) }}</td>
          <td><span class="cell-main">{{ activity.text }}</span><span class="cell-sub">{{ activity.type }}</span></td>
          <td>{{ opportunity.title }}<span class="cell-sub">{{ store.partnerName(opportunity.partnerId) }}</span></td>
          <td>{{ store.userName(opportunity.ownerId) }}</td>
          <td style="text-align:right" @click.stop><button class="button secondary small" @click="store.toggleActivity(opportunity.id, activity.id)">Concluir</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Nada nesta guia.</p>
  </article>
</template>
