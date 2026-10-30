<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '../../components/BaseModal.vue'
import { addDays, today } from '../../domain/engine'
import { roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Opportunity } from '../../types/domain'
import { CRM_SOURCES, CRM_VERTICALS, useCrmScope } from './shared'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { sellers, tenantName } = useCrmScope()
const clients = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Cliente')))

const blank = () => ({
  partnerId: clients.value[0]?.id ?? '', title: '', ownerId: sellers.value.find(entry => entry.name === ui.userName)?.id ?? sellers.value[0]?.id ?? '',
  source: 'Prospecção Ativa', segment: 'Mineração', temperature: 'Morno' as Opportunity['temperature'], expectedClose: addDays(today(), 30), nextAction: 'Agendar reunião de descoberta',
})
const form = reactive(blank())
const nextDate = ref(addDays(today(), 1))
watch(() => props.open, open => {
  if (!open) return
  Object.assign(form, blank())
  nextDate.value = addDays(today(), 1)
})

function create() {
  const contact = store.state.partners.find(entry => entry.id === form.partnerId)?.contact
  const created = store.createOpportunity({ ...form, value: 0, mrr: 0, contact, tenantId: ui.activeTenantId })
  if (created && created !== true) {
    if (form.nextAction.trim()) store.addActivity(created.id, { type: 'Tarefa', text: form.nextAction, at: `${nextDate.value}T09:00:00.000Z` })
    emit('close')
    router.push(`/crm/oportunidade/${created.id}`)
  }
}
</script>

<template>
  <BaseModal :open="open" title="Nova oportunidade" :subtitle="`Nasce em Prospecção, em ${tenantName()}. O resto se completa na ficha.`" width="620px" @close="emit('close')">
    <div class="field"><label>Título</label><input v-model="form.title" placeholder="Ex.: Renovação de cases da frota de coletores" /></div>
    <div class="form-grid">
      <div class="field"><label>Cliente</label><select v-model="form.partnerId"><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select><small>{{ store.state.partners.find(entry => entry.id === form.partnerId)?.document }}</small></div>
      <div class="field"><label>Vendedor</label><select v-model="form.ownerId"><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select></div>
      <div class="field"><label>Origem</label><select v-model="form.source"><option v-for="source in CRM_SOURCES" :key="source">{{ source }}</option></select></div>
      <div class="field"><label>Vertical</label><select v-model="form.segment"><option v-for="vertical in CRM_VERTICALS" :key="vertical">{{ vertical }}</option></select></div>
      <div class="field"><label>Temperatura</label><select v-model="form.temperature"><option>Quente</option><option>Morno</option><option>Frio</option></select></div>
      <div class="field"><label>Previsão de fechamento</label><input v-model="form.expectedClose" type="date" /></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Próxima ação</label><input v-model="form.nextAction" /><small>Entra na agenda do vendedor.</small></div>
      <div class="field"><label>Quando</label><input v-model="nextDate" type="date" /></div>
    </div>
    <template #footer>
      <button class="button secondary" @click="emit('close')">Cancelar</button>
      <button class="button" :disabled="!form.title.trim() || !form.partnerId" @click="create">Criar e abrir a ficha</button>
    </template>
  </BaseModal>
</template>
