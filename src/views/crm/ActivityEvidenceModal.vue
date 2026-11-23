<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import { today } from '../../domain/engine'
import { ACTIVITY_FILE_FORMATS, ACTIVITY_FILE_BYTES, ACTIVITY_MAX_FILES } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import type { NewActivityFile } from '../../types/domain'

const props = defineProps<{ open: boolean; opportunityId: string; activityId: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useErpStore()

const activity = computed(() => store.state.opportunities.find(entry => entry.id === props.opportunityId)?.activities.find(entry => entry.id === props.activityId))
const needsPeople = computed(() => activity.value?.type === 'Reunião' || activity.value?.type === 'Visita')
const needsNext = computed(() => activity.value?.type === 'Recompra')
const form = reactive({ occurredOn: today(), participants: '', summary: '', nextStep: '' })
const files = reactive<{ list: NewActivityFile[]; error: string }>({ list: [], error: '' })

watch(() => [props.open, props.activityId], () => {
  Object.assign(form, { occurredOn: today(), participants: '', summary: '', nextStep: '' })
  files.list = []
  files.error = ''
})

function pick(event: Event) {
  const chosen = [...((event.target as HTMLInputElement).files ?? [])]
  files.error = ''
  if (chosen.length + files.list.length > ACTIVITY_MAX_FILES) { files.error = `Até ${ACTIVITY_MAX_FILES} arquivos por registro.`; return }
  for (const file of chosen) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACTIVITY_FILE_FORMATS.includes(extension)) { files.error = `${file.name}: formato não aceito. Use ${ACTIVITY_FILE_FORMATS.join(', ')}.`; continue }
    if (file.size > ACTIVITY_FILE_BYTES) { files.error = `${file.name} passa de 10 MB.`; continue }
    const reader = new FileReader()
    reader.onload = () => files.list.push({ name: file.name, mime: file.type, size: file.size, dataUrl: file.size < 400_000 ? String(reader.result) : undefined })
    reader.readAsDataURL(file)
  }
  ;(event.target as HTMLInputElement).value = ''
}

function save() {
  if (!activity.value) return
  const done = store.completeActivity(props.opportunityId, props.activityId, {
    occurredOn: form.occurredOn, participants: form.participants, summary: form.summary, nextStep: form.nextStep || undefined, attachments: files.list,
  })
  if (done) emit('close')
}
</script>

<template>
  <BaseModal :open="open" title="Concluir com evidência" :subtitle="activity ? `${activity.type} · ${activity.text}` : ''" width="560px" @close="emit('close')">
    <p class="hint">O dia em que a ação aconteceu define a semana do placar. Reunião e visita precisam dos participantes; sem eles, ficam em conferência com a supervisão.</p>
    <div class="form-grid">
      <div class="field"><label>Quando aconteceu</label><input v-model="form.occurredOn" type="date" :max="today()" /></div>
      <div v-if="needsPeople" class="field"><label>Participantes</label><input v-model="form.participants" placeholder="Quem esteve presente" /></div>
    </div>
    <div class="field"><label>Resumo e resultado</label><textarea v-model="form.summary" rows="3" placeholder="O que foi tratado e o que ficou combinado"></textarea></div>
    <div class="field"><label>Próximo passo{{ needsNext ? '' : ' (opcional)' }}</label><input v-model="form.nextStep" placeholder="Vira uma tarefa de 3 dias" /></div>
    <div class="field">
      <label>Anexos (até {{ ACTIVITY_MAX_FILES }}, 10 MB cada)</label>
      <input type="file" multiple :accept="ACTIVITY_FILE_FORMATS.map(item => `.${item}`).join(',')" @change="pick" />
      <small v-if="files.error" class="risk-text">{{ files.error }}</small>
      <small v-else>{{ ACTIVITY_FILE_FORMATS.join(', ') }}. O armazenamento de arquivos é simulado.</small>
      <ul v-if="files.list.length" class="plain-list"><li v-for="(file, index) in files.list" :key="file.name + index">{{ file.name }} <button type="button" class="link" @click="files.list.splice(index, 1)">remover</button></li></ul>
    </div>
    <template #footer>
      <button class="button secondary" @click="emit('close')">Cancelar</button>
      <button class="button" @click="save">Concluir</button>
    </template>
  </BaseModal>
</template>
