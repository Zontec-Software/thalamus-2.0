<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import { addDays, today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import type { ActivityReference, CrmActivity } from '../../types/domain'

const props = defineProps<{ open: boolean; opportunityId: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useErpStore()

const opportunity = computed(() => store.state.opportunities.find(entry => entry.id === props.opportunityId))
const tasks = computed(() => (opportunity.value?.activities ?? []).filter(entry => !entry.done))
const blank = () => ({
  activityId: '', type: 'Reunião' as CrmActivity['type'], occurredOn: addDays(today(), -1), title: '', participants: '', summary: '',
  agenda: true, meet: true, nextTitle: '', nextDue: addDays(today(), 3), key: `mcp-${Date.now().toString(36)}`,
})
const form = reactive(blank())
watch(() => props.open, open => { if (open) Object.assign(form, blank()) })

const needsPeople = computed(() => form.type === 'Reunião' || form.type === 'Visita')
function references(): ActivityReference[] {
  const day = form.occurredOn
  const list: ActivityReference[] = []
  if (form.agenda && needsPeople.value) list.push({ provider: 'agenda', externalId: `gcal-${props.opportunityId}-${day}`, title: form.title || 'Evento da agenda', content: `Evento de ${day.split('-').reverse().join('/')} no Google Agenda (simulado).` })
  if (form.meet && form.type === 'Reunião') list.push({ provider: 'meet', externalId: `meet-${props.opportunityId}-${day}`, title: 'Transcrição da reunião', content: 'Transcrição do Google Meet (simulada).' })
  return list
}
function save() {
  const result = store.registerActivityViaMcp({
    opportunityId: props.opportunityId, activityId: form.activityId || undefined, type: form.type, occurredOn: form.occurredOn, title: form.title,
    participants: form.participants, summary: form.summary, references: references(), idempotencyKey: form.key,
    next: form.nextTitle.trim() ? { title: form.nextTitle, dueOn: form.nextDue } : undefined,
  })
  if (result) emit('close')
}
</script>

<template>
  <BaseModal :open="open" title="Registrar pelo ChatGPT" subtitle="Simulação: o ChatGPT chama o MCP do Thalamus com o que o vendedor ditou" width="600px" @close="emit('close')">
    <p class="hint">O registro entra no nome do vendedor logado, com origem “ChatGPT via MCP”. Repetir o comando não duplica: a mesma chave, ou a mesma fonte do mesmo vendedor, devolve o registro que já existe.</p>
    <div class="form-grid">
      <div class="field"><label>Tarefa a concluir</label><select v-model="form.activityId"><option value="">Nova interação já concluída</option><option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.type }} · {{ task.text }}</option></select><small>Concluir uma tarefa mantém o prazo e os anexos dela.</small></div>
      <div class="field"><label>Tipo</label><select v-model="form.type" :disabled="!!form.activityId"><option>Ligação</option><option>E-mail</option><option>Reunião</option><option>Visita</option><option>Tarefa</option></select></div>
      <div class="field"><label>Data efetiva</label><input v-model="form.occurredOn" type="date" :max="today()" /></div>
      <div class="field"><label>Título</label><input v-model="form.title" placeholder="Como aparece na ficha" /></div>
    </div>
    <div v-if="needsPeople" class="field"><label>Participantes (confirme antes de gravar)</label><input v-model="form.participants" placeholder="Quem esteve presente" /></div>
    <div class="field"><label>Resumo e resultado</label><textarea v-model="form.summary" rows="3" placeholder="O que o vendedor ditou ao ChatGPT"></textarea></div>
    <div class="filter-row">
      <label v-if="needsPeople" class="check-option"><input v-model="form.agenda" type="checkbox" /> Evento do Google Agenda</label>
      <label v-if="form.type === 'Reunião'" class="check-option"><input v-model="form.meet" type="checkbox" /> Transcrição do Google Meet</label>
    </div>
    <div class="form-grid">
      <div class="field"><label>Próxima ação (opcional)</label><input v-model="form.nextTitle" placeholder="Ex.: enviar o orçamento" /></div>
      <div class="field"><label>Prazo</label><input v-model="form.nextDue" type="date" /></div>
    </div>
    <template #footer>
      <button class="button secondary" @click="emit('close')">Cancelar</button>
      <button class="button" @click="save">Gravar registro</button>
    </template>
  </BaseModal>
</template>
