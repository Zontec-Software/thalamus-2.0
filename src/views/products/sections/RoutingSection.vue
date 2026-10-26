<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-vue-next'
import BaseModal from '../../../components/BaseModal.vue'
import { catalogOf } from '../../../domain/catalog'
import { moldMinutesPerPiece } from '../../../domain/engineering'
import { resourceIsOpen, resourceOffered } from '../../../domain/resources'
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
const postos = computed(() => store.state.resources.filter(resource => resourceOffered(resource, ui.activeTenantId, [form.resourceId])))
const modalTitle = computed(() => editing.value === 'new' ? 'Nova operação' : form.name || 'Operação')

function edit(step?: RouteStep) {
  editing.value = step?.id ?? 'new'
  const fallback = store.state.resources.find(entry => entry.tenantId === ui.activeTenantId && resourceIsOpen(entry) && entry.kind === (props.item.type === 'SE' ? 'Injetora' : 'Montagem'))?.id ?? ''
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
  <div class="routing-head" data-tour="routing">
    <span class="cell-sub">{{ steps.length }} operação(ões) · <b>{{ fmtNumber(perUnit, 2) }} min</b> por unidade · <b>{{ fmtNumber(setup, 0) }} min</b> de preparação por lote</span>
    <button v-if="isDraft" class="button secondary small" :disabled="disabled" @click="edit()"><Plus :size="13" /> Operação</button>
  </div>
  <div class="table-scroll">
    <table class="dense">
      <thead><tr><th>#</th><th>Operação</th><th>Posto</th><th>Ferramental</th><th class="num">Tempo/un</th><th class="num">Preparação</th><th class="num">Equipe</th><th>Instruções</th><th v-if="isDraft && !disabled" /></tr></thead>
      <tbody>
        <tr v-for="(step, index) in steps" :key="step.id" class="clickable" :title="isDraft && !disabled ? 'Editar operação' : 'Ver operação'" @click="edit(step)">
          <td class="cell-sub">{{ (index + 1) * 10 }}</td>
          <td><b>{{ step.name }}</b><span v-if="step.firstPiece" class="status info" style="margin-left:6px">1ª peça</span></td>
          <td>{{ store.resourceName(step.resourceId) }}</td>
          <td @click.stop><RouterLink v-if="step.toolId" :to="`/produtos/item/${step.toolId}?aba=ferramental`" class="code">{{ toolCode(step.toolId) }}</RouterLink><span v-else class="cell-sub">—</span></td>
          <td class="num">{{ fmtNumber(step.minutesPerUnit, 3) }} min</td>
          <td class="num">{{ step.setupMinutes ? `${step.setupMinutes} min` : '—' }}</td>
          <td class="num">{{ step.crew ?? 1 }}</td>
          <td class="clip-cell" :title="step.instructions.join('\n')"><span class="cell-sub">{{ step.instructions.join(' · ') || '—' }}</span></td>
          <td v-if="isDraft && !disabled" @click.stop>
            <div class="row-actions">
              <button class="icon-plain" title="Subir" :disabled="index === 0" @click="store.moveRevisionStep(revision.id, step.id, -1)"><ArrowUp :size="14" /></button>
              <button class="icon-plain" title="Descer" :disabled="index === steps.length - 1" @click="store.moveRevisionStep(revision.id, step.id, 1)"><ArrowDown :size="14" /></button>
              <button class="icon-plain" title="Remover operação" @click="store.removeRevisionStep(revision.id, step.id)"><Trash2 :size="14" /></button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="!steps.length" class="empty-note">{{ item.type === 'SE' ? 'Sem roteiro: inclua a operação de injeção com o molde.' : 'Sem roteiro: o produto não pode ser planejado nem aprovado pelo PCP.' }}</p>

  <BaseModal :open="editing !== ''" :title="modalTitle" width="720px"
    :subtitle="isDraft ? 'A operação entra na versão em rascunho.' : 'Versão liberada: dá para ler, sem alterar. Para mudar o roteiro, abra uma nova versão.'"
    @close="editing = ''">
    <form id="route-step" @submit.prevent="save">
      <fieldset class="layer" :disabled="disabled">
        <div class="form-grid three">
          <div class="field"><label>Operação</label><input v-model="form.name" required /></div>
          <div class="field"><label>Posto de trabalho</label><select v-model="form.resourceId" required @change="form.toolId = ''"><option v-for="resource in postos" :key="resource.id" :value="resource.id">{{ resource.name }}{{ resource.status === 'Inativo' ? ' · inativo' : '' }}</option></select><small>A lista vem de Cadastros → Postos. Posto inativo não entra em operação nova.</small></div>
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
          <div class="field wide"><label>Instruções (uma por linha)</label><textarea v-model="form.instructions" rows="4" /></div>
        </div>
        <label class="check-line"><input v-model="form.firstPiece" type="checkbox" /> Exige liberação da primeira peça pela qualidade</label>
      </fieldset>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="editing = ''">{{ disabled ? 'Fechar' : 'Cancelar' }}</button>
      <button v-if="!disabled" class="button" type="submit" form="route-step">{{ editing === 'new' ? 'Incluir operação' : 'Salvar operação' }}</button>
    </template>
  </BaseModal>
  <form v-if="isDraft && !disabled" class="filter-row" style="margin-top:10px" @submit.prevent="copy">
    <fieldset class="layer filter-row" style="flex:1">
      <select v-model="copyFrom" class="filter grow"><option value="" disabled>Copiar roteiro de outro item…</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.code }} · {{ source.name }} ({{ source.routing!.length }} op.)</option></select>
      <button class="button secondary small" type="submit" :disabled="!copyFrom"><Copy :size="13" /> Copiar</button>
    </fieldset>
  </form>
  <p v-if="!isDraft" class="cell-sub" style="margin-top:6px">Versão liberada não muda. Para alterar o roteiro, abra uma nova versão: estrutura e roteiro são liberados juntos.</p>
</template>
