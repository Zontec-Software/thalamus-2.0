<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { catalogOf, classAttributes, classLabel } from '../../../domain/catalog'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const catalog = computed(() => catalogOf(props.item))
const defs = computed(() => classAttributes(store.state, catalog.value.classId))
const disabled = computed(() => readOnly(props.item, ui.role, 'nucleo'))
const values = reactive<Record<string, string>>({})
const filled = computed(() => defs.value.filter(def => catalog.value.attributes[def.key]?.trim()).length)
const required = computed(() => defs.value.filter(def => def.required))
const missing = computed(() => required.value.filter(def => !catalog.value.attributes[def.key]?.trim()))
const lockedAxis = (key: string) => !!catalog.value.modelId && !!defs.value.find(def => def.key === key)?.variantAxis

function load() {
  for (const key of Object.keys(values)) delete values[key]
  for (const def of defs.value) values[def.key] = catalog.value.attributes[def.key] ?? ''
}
watch(() => [props.item.id, catalog.value.version, catalog.value.classId, defs.value.length], load, { immediate: true })

function save() {
  const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => (catalog.value.attributes[key] ?? '') !== value.trim()))
  store.setItemAttributes(props.item.id, changed)
}
</script>

<template>
  <div class="section-head" style="margin-top:18px" data-tour="product-attributes">
    <div>
      <h3 class="drawer-title" style="margin:0">Atributos da classe</h3>
      <p v-if="defs.length">{{ filled }} de {{ defs.length }} preenchidos<template v-if="required.length"> · {{ required.length - missing.length }}/{{ required.length }} obrigatórios</template>. Definidos em {{ classLabel(store.state, catalog.classId) }} e acima.</p>
      <p v-else>A classe {{ classLabel(store.state, catalog.classId) }} ainda não define atributos. Eles são mantidos em Classificação.</p>
    </div>
    <div v-if="required.length" class="progress" :title="`${required.length - missing.length} de ${required.length} obrigatórios`"><span :style="{ width: `${(required.length - missing.length) / required.length * 100}%` }" /></div>
  </div>
  <form v-if="defs.length" @submit.prevent="save">
    <fieldset class="layer" :disabled="disabled">
      <div class="form-grid three">
        <div v-for="def in defs" :key="def.key" class="field">
          <label>{{ def.label }}<span v-if="def.required" class="required-mark" title="Obrigatório para homologar">*</span><small v-if="def.unit" class="cell-sub"> ({{ def.unit }})</small></label>
          <select v-if="def.kind === 'Lista'" v-model="values[def.key]" :disabled="lockedAxis(def.key)" :class="{ missing: def.required && !values[def.key] }">
            <option value="">—</option>
            <option v-for="option in def.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input v-else v-model="values[def.key]" :inputmode="def.kind === 'Número' ? 'decimal' : 'text'" :class="{ missing: def.required && !values[def.key] }" />
          <small v-if="lockedAxis(def.key)">Eixo da grade: fixo nesta variante.</small>
          <small v-else-if="def.inherited">Herdado de {{ store.state.itemClasses.find(entry => entry.id === def.classId)?.name }}</small>
        </div>
      </div>
      <button class="button secondary" type="submit">Salvar atributos</button>
    </fieldset>
  </form>
</template>
