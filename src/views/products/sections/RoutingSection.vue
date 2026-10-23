<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ArrowDown, ArrowUp, Copy, Pencil, Plus } from 'lucide-vue-next'
import { catalogOf } from '../../../domain/catalog'
import { moldMinutesPerPiece } from '../../../domain/engineering'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, ProductRevision, RouteStep } from '../../../types/domain'
import { fmtNumber } from '../../../utils/format'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item; revision: ProductRevision }>()
const store = useErpStore()
const ui = useUiStore()
const isDraft = computed(() => props.revision.status === 'Rascunho')
const disabled = computed(() => !isDraft.value || readOnly(props.item, ui.role, 'manufatura'))
const steps = computed(() => props.revision.routing ?? props.item.routing ?? [])
const perUnit = computed(() => steps.value.reduce((sum, step) => sum + step.minutesPerUnit, 0))
const setup = computed(() => steps.value.reduce((sum, step) => sum + (step.setupMinutes ?? 0), 0))
const editing = ref<string | 'new' | ''>('')
const form = reactive({ name: '', resourceId: '', minutesPerUnit: 1, setupMinutes: 0, crew: 1, toolId: '', firstPiece: false, instructions: '' })
const copyFrom = ref('')

const tools = computed(() => store.state.items.filter(entry => entry.type === 'FE' && !catalogOf(entry).deletedAt && catalogOf(entry).tooling))
const compatibleTools = computed(() => tools.value.filter(tool => catalogOf(tool).tooling!.compatibleResourceIds.includes(form.resourceId)))
const chosenTool = computed(() => tools.value.find(tool => tool.id === form.toolId))
const moldTime = computed(() => {
  const tooling = chosenTool.value ? catalogOf(chosenTool.value).tooling : undefined
  return tooling?.kind === 'Molde' ? moldMinutesPerPiece(tooling) : undefined
})
const sources = computed(() => store.state.items.filter(entry => entry.id !== props.item.id && entry.routing?.length && !catalogOf(entry).deletedAt).sort((a, b) => a.code.localeCompare(b.code)))
const toolCode = (id?: string) => id ? store.state.items.find(entry => entry.id === id)?.code ?? id : ''

function edit(step?: RouteStep) {
  editing.value = step?.id ?? 'new'
  const fallback = store.state.resources.find(entry => entry.kind === (props.item.type === 'SE' ? 'Injetora' : 'Montagem'))?.id ?? ''
  Object.assign(form, step
    ? { name: step.name, resourceId: step.resourceId, minutesPerUnit: step.minutesPerUnit, setupMinutes: step.setupMinutes ?? 0, crew: step.crew ?? 1, toolId: step.toolId ?? '', firstPiece: !!step.firstPiece, instructions: step.instructions.join('\n') }
    : { name: '', resourceId: fallback, minutesPerUnit: 1, setupMinutes: 0, crew: 1, toolId: '', firstPiece: false, instructions: '' })
}
function save() {
  const result = store.saveRevisionStep(props.revision.id, {
    id: editing.value === 'new' ? undefined : editing.value, name: form.name, resourceId: form.resourceId, minutesPerUnit: moldTime.value ?? form.minutesPerUnit,
    setupMinutes: form.setupMinutes, crew: form.crew, toolId: form.toolId || undefined, firstPiece: form.firstPiece, instructions: form.instructions.split('\n'),
  })
  if (result !== undefined) editing.value = ''
}
function copy() {
  if (copyFrom.value && store.copyRoutingFrom(props.revision.id, copyFrom.value) !== undefined) copyFrom.value = ''
}
</script>

<template>
  <div class="section-head" style="margin-top:18px">
    <div>
      <h3 class="drawer-title" data-tour="routing" style="margin:0">Roteiro da versão {{ revision.code }}</h3>
      <p>{{ steps.length }} operação(ões) · {{ fmtNumber(perUnit, 2) }} min por unidade · {{ fmtNumber(setup, 0) }} min de preparação por lote.</p>
    </div>
    <button v-if="isDraft" class="button secondary small" :disabled="disabled" @click="edit()"><Plus :size="13" /> Operação</button>
  </div>
  <table class="dense">
    <thead><tr><th>#</th><th>Operação</th><th>Posto</th><th>Ferramental</th><th>Tempo/un</th><th>Preparação</th><th>Equipe</th><th>Instruções</th><th v-if="isDraft" /></tr></thead>
    <tbody>
      <tr v-for="(step, index) in steps" :key="step.id">
        <td>{{ (index + 1) * 10 }}</td>
        <td><b>{{ step.name }}</b><span v-if="step.firstPiece" class="status info" style="margin-left:6px">1ª peça</span></td>
        <td>{{ store.resourceName(step.resourceId) }}</td>
        <td><RouterLink v-if="step.toolId" :to="`/produtos/item/${step.toolId}?aba=ferramental`" class="code">{{ toolCode(step.toolId) }}</RouterLink><span v-else class="cell-sub">—</span></td>
        <td>{{ fmtNumber(step.minutesPerUnit, 3) }} min</td>
        <td>{{ step.setupMinutes ? `${step.setupMinutes} min` : '—' }}</td>
        <td>{{ step.crew ?? 1 }}</td>
        <td><span class="cell-sub">{{ step.instructions.join(' · ') || '—' }}</span></td>
        <td v-if="isDraft" class="row-actions">
          <button class="button ghost small" title="Subir" :disabled="disabled || index === 0" @click="store.moveRevisionStep(revision.id, step.id, -1)"><ArrowUp :size="12" /></button>
          <button class="button ghost small" title="Descer" :disabled="disabled || index === steps.length - 1" @click="store.moveRevisionStep(revision.id, step.id, 1)"><ArrowDown :size="12" /></button>
          <button class="button ghost small" title="Editar" :disabled="disabled" @click="edit(step)"><Pencil :size="12" /></button>
          <button class="button ghost small" :disabled="disabled" @click="store.removeRevisionStep(revision.id, step.id)">Remover</button>
        </td>
      </tr>
    </tbody>
  </table>
  <p v-if="!steps.length" class="empty-note">{{ item.type === 'SE' ? 'Sem roteiro: inclua a operação de injeção com o molde.' : 'Sem roteiro: o produto não pode ser planejado nem aprovado pelo PCP.' }}</p>

  <form v-if="editing && isDraft" class="card" style="margin-top:10px;background:#F8FAFC" @submit.prevent="save">
    <fieldset class="layer" :disabled="disabled">
      <div class="form-grid three">
        <div class="field"><label>Operação</label><input v-model="form.name" required /></div>
        <div class="field"><label>Posto de trabalho</label><select v-model="form.resourceId" required @change="form.toolId = ''"><option v-for="resource in store.state.resources" :key="resource.id" :value="resource.id">{{ resource.name }}</option></select></div>
        <div class="field"><label>Ferramental</label>
          <select v-model="form.toolId"><option value="">Nenhum</option><option v-for="tool in compatibleTools" :key="tool.id" :value="tool.id">{{ tool.code }} · {{ tool.name }}</option></select>
          <small>Só aparece o que é compatível com o posto.</small>
        </div>
        <div class="field"><label>Tempo por unidade (min)</label>
          <input v-if="moldTime === undefined" v-model.number="form.minutesPerUnit" type="number" min="0.001" step="0.001" />
          <input v-else :value="fmtNumber(moldTime, 4)" disabled />
          <small v-if="moldTime !== undefined">Calculado: ciclo ÷ cavidades ativas do molde.</small>
        </div>
        <div class="field"><label>Preparação por lote (min)</label><input v-model.number="form.setupMinutes" type="number" min="0" step="1" /></div>
        <div class="field"><label>Equipe (pessoas)</label><input v-model.number="form.crew" type="number" min="0" step="1" /><small>0 = máquina sem operador dedicado.</small></div>
        <div class="field wide"><label>Instruções (uma por linha)</label><textarea v-model="form.instructions" rows="3" /></div>
      </div>
      <label class="check-line"><input v-model="form.firstPiece" type="checkbox" /> Exige liberação da primeira peça pela qualidade</label>
      <div class="filter-row" style="margin-top:8px">
        <button class="button small" type="submit">{{ editing === 'new' ? 'Incluir operação' : 'Salvar operação' }}</button>
        <button class="button ghost small" type="button" @click="editing = ''">Cancelar</button>
      </div>
    </fieldset>
  </form>
  <form v-if="isDraft" class="filter-row" style="margin-top:10px" @submit.prevent="copy">
    <fieldset class="layer filter-row" :disabled="disabled">
      <select v-model="copyFrom" class="filter grow"><option value="" disabled>Copiar roteiro de outro item…</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.code }} · {{ source.name }} ({{ source.routing!.length }} op.)</option></select>
      <button class="button secondary small" type="submit" :disabled="!copyFrom"><Copy :size="13" /> Copiar</button>
    </fieldset>
  </form>
  <p v-if="!isDraft" class="cell-sub" style="margin-top:6px">Versão liberada não muda. Para alterar o roteiro, abra uma nova versão: estrutura e roteiro são liberados juntos.</p>
</template>
