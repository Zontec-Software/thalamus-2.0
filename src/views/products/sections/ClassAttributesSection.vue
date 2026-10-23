<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { canEdit, classAttributes, type AttributeInput } from '../../../domain/catalog'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { AttributeDef, AttributeKind } from '../../../types/domain'

const props = defineProps<{ classId: string }>()
const store = useErpStore()
const ui = useUiStore()
const editable = computed(() => canEdit(ui.role, 'nucleo'))
const defs = computed(() => classAttributes(store.state, props.classId))
const editing = ref<string | 'new' | ''>('')
const form = reactive({ label: '', kind: 'Texto' as AttributeKind, options: '', unit: '', required: false, variantAxis: false })
watch(() => props.classId, () => { editing.value = '' })
const nodeName = (id: string) => store.state.itemClasses.find(entry => entry.id === id)?.name ?? ''

function edit(def?: AttributeDef) {
  editing.value = def?.key ?? 'new'
  Object.assign(form, def
    ? { label: def.label, kind: def.kind, options: (def.options ?? []).join(', '), unit: def.unit ?? '', required: def.required, variantAxis: !!def.variantAxis }
    : { label: '', kind: 'Texto', options: '', unit: '', required: false, variantAxis: false })
}
function save() {
  const input: AttributeInput = { key: editing.value === 'new' ? undefined : editing.value, label: form.label, kind: form.kind, options: form.options.split(','), unit: form.unit, required: form.required, variantAxis: form.variantAxis }
  if (store.saveClassAttribute(props.classId, input) !== undefined) editing.value = ''
}
</script>

<template>
  <div class="section-head" style="margin-top:18px" data-tour="class-attributes">
    <div><h3 class="drawer-title" style="margin:0">Atributos</h3><p>Valem para os itens deste nó e de todos os filhos.</p></div>
    <button class="button secondary small" :disabled="!editable" @click="edit()"><Plus :size="13" /> Atributo</button>
  </div>
  <div v-for="def in defs" :key="def.key" class="attr-row">
    <div>
      <strong>{{ def.label }}<span v-if="def.required" class="required-mark">*</span></strong>
      <span class="cell-sub">{{ def.kind }}{{ def.unit ? ` em ${def.unit}` : '' }}{{ def.options?.length ? ` · ${def.options.join(', ')}` : '' }}{{ def.variantAxis ? ' · eixo de grade' : '' }}</span>
      <span v-if="def.inherited" class="cell-sub">herdado de {{ nodeName(def.classId) }}</span>
    </div>
    <div v-if="!def.inherited" class="row-actions">
      <button class="button ghost small" title="Editar" :disabled="!editable" @click="edit(def)"><Pencil :size="12" /></button>
      <button class="button ghost small" title="Remover" :disabled="!editable" @click="store.removeClassAttribute(classId, def.key)"><Trash2 :size="12" /></button>
    </div>
  </div>
  <p v-if="!defs.length" class="empty-note">Sem atributos. Crie os que a engenharia e o comercial precisam filtrar e comparar (ex.: modelo de device, cor, grau de proteção).</p>
  <form v-if="editing" class="card" style="margin-top:10px;background:#F8FAFC" @submit.prevent="save">
    <fieldset class="layer" :disabled="!editable">
      <div class="form-grid">
        <div class="field"><label>Nome</label><input v-model="form.label" required :disabled="editing !== 'new'" /></div>
        <div class="field"><label>Tipo</label><select v-model="form.kind"><option>Texto</option><option>Número</option><option>Lista</option></select></div>
        <div v-if="form.kind === 'Lista'" class="field wide"><label>Opções (separadas por vírgula)</label><input v-model="form.options" /></div>
        <div v-if="form.kind === 'Número'" class="field"><label>Unidade</label><input v-model="form.unit" placeholder="g, mm, m…" /></div>
      </div>
      <label class="check-line"><input v-model="form.required" type="checkbox" /> Obrigatório para homologar o item</label>
      <label v-if="form.kind === 'Lista'" class="check-line"><input v-model="form.variantAxis" type="checkbox" /> Pode ser eixo da grade de variantes</label>
      <div class="filter-row" style="margin-top:8px">
        <button class="button small" type="submit">Salvar atributo</button>
        <button class="button ghost small" type="button" @click="editing = ''">Cancelar</button>
      </div>
    </fieldset>
  </form>
</template>
