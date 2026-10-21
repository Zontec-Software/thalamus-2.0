<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-vue-next'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, RouteStep } from '../../../types/domain'
import { fmtNumber } from '../../../utils/format'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const disabled = computed(() => readOnly(props.item, ui.role, 'manufatura'))
const editing = ref<string | 'new' | ''>('')
const form = reactive({ name: '', resourceId: '', minutesPerUnit: 1, instructions: '' })
const total = computed(() => (props.item.routing ?? []).reduce((sum, step) => sum + step.minutesPerUnit, 0))

function edit(step?: RouteStep) {
  editing.value = step?.id ?? 'new'
  Object.assign(form, step
    ? { name: step.name, resourceId: step.resourceId, minutesPerUnit: step.minutesPerUnit, instructions: step.instructions.join('\n') }
    : { name: '', resourceId: store.state.resources.find(entry => entry.kind === 'Montagem')?.id ?? '', minutesPerUnit: 1, instructions: '' })
}
function save() {
  const result = store.saveRoutingStep(props.item.id, {
    id: editing.value === 'new' ? undefined : editing.value, name: form.name, resourceId: form.resourceId, minutesPerUnit: form.minutesPerUnit, instructions: form.instructions.split('\n'),
  })
  if (result !== undefined) editing.value = ''
}
</script>

<template>
  <div class="section-head" style="margin-top:18px">
    <div><h3 class="drawer-title" data-tour="routing" style="margin:0">Roteiro padrão</h3><p>{{ item.routing?.length ?? 0 }} operação(ões) · {{ fmtNumber(total, 1) }} min por unidade. OPs abertas guardam a cópia delas; a mudança vale para as próximas.</p></div>
    <button class="button secondary small" :disabled="disabled" @click="edit()"><Plus :size="13" /> Operação</button>
  </div>
  <table class="dense">
    <thead><tr><th>#</th><th>Operação</th><th>Recurso</th><th>Tempo</th><th>Instruções</th><th /></tr></thead>
    <tbody>
      <tr v-for="(step, index) in item.routing ?? []" :key="step.id">
        <td>{{ index + 1 }}</td>
        <td><b>{{ step.name }}</b></td>
        <td>{{ store.resourceName(step.resourceId) }}</td>
        <td>{{ fmtNumber(step.minutesPerUnit, 2) }} min/un</td>
        <td><span class="cell-sub">{{ step.instructions.join(' · ') || '—' }}</span></td>
        <td class="row-actions">
          <button class="button ghost small" title="Subir" :disabled="disabled || index === 0" @click="store.moveRoutingStep(item.id, step.id, -1)"><ArrowUp :size="12" /></button>
          <button class="button ghost small" title="Descer" :disabled="disabled || index === (item.routing?.length ?? 0) - 1" @click="store.moveRoutingStep(item.id, step.id, 1)"><ArrowDown :size="12" /></button>
          <button class="button ghost small" title="Editar" :disabled="disabled" @click="edit(step)"><Pencil :size="12" /></button>
          <button class="button ghost small" :disabled="disabled" @click="store.removeRoutingStep(item.id, step.id)">Remover</button>
        </td>
      </tr>
    </tbody>
  </table>
  <p v-if="!item.routing?.length" class="empty-note">Sem roteiro: o produto não pode ser planejado nem aprovado pelo PCP.</p>
  <form v-if="editing" class="card" style="margin-top:10px;background:#F8FAFC" @submit.prevent="save">
    <fieldset class="layer" :disabled="disabled">
      <div class="form-grid three">
        <div class="field"><label>Operação</label><input v-model="form.name" required /></div>
        <div class="field"><label>Recurso</label><select v-model="form.resourceId" required><option v-for="resource in store.state.resources" :key="resource.id" :value="resource.id">{{ resource.name }}</option></select></div>
        <div class="field"><label>Tempo padrão (min/un)</label><input v-model.number="form.minutesPerUnit" type="number" min="0.01" step="0.01" /></div>
        <div class="field wide"><label>Instruções (uma por linha)</label><textarea v-model="form.instructions" rows="3" /></div>
      </div>
      <div class="filter-row">
        <button class="button small" type="submit">{{ editing === 'new' ? 'Incluir operação' : 'Salvar operação' }}</button>
        <button class="button ghost small" type="button" @click="editing = ''">Cancelar</button>
      </div>
    </fieldset>
  </form>
</template>
