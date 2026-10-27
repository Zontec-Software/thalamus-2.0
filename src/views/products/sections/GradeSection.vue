<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { canEdit, catalogOf, classAttributes, editorsLabel } from '../../../domain/catalog'
import { combinations, missingCombinations, modelOf, variantsOf } from '../../../domain/catalogExtensions'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import { LIFE_TONE } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const allowed = computed(() => canEdit(ui.role, 'nucleo'))
const model = computed(() => modelOf(store.state, props.item))
const variants = computed(() => model.value ? variantsOf(store.state, model.value.id) : [])
const missing = computed(() => model.value ? missingCombinations(store.state, model.value) : [])
const comboKey = (combo: Record<string, string>) => Object.values(combo).join(' · ')
const matrix = computed(() => model.value ? combinations(model.value).map(combo => ({
  combo, item: variants.value.find(entry => Object.entries(combo).every(([key, value]) => catalogOf(entry).attributes[key] === value)),
})) : [])
const picked = ref<string[]>([])

const classAxes = computed(() => classAttributes(store.state, catalogOf(props.item).classId).filter(def => def.variantAxis && def.options?.length))
const draft = reactive({ name: '', axes: '' })
watch(classAxes, axes => {
  draft.axes = axes.length ? axes.map(def => `${def.label}: ${def.options!.join(', ')}`).join('\n') : 'Cor: Preto, Laranja, Azul'
}, { immediate: true })
const parsedAxes = computed(() => draft.axes.split('\n').map(row => {
  const [name, values = ''] = row.split(':')
  return { name: name.trim(), values: values.split(',').map(value => value.trim()).filter(Boolean) }
}).filter(axis => axis.name))
const templateValues = reactive<Record<string, string>>({})

function create() {
  const attributes = Object.fromEntries(parsedAxes.value.map(axis => [axis.name, templateValues[axis.name] || axis.values[0] || '']))
  store.createModel({ templateId: props.item.id, name: draft.name || props.item.name, axes: parsedAxes.value, templateAttributes: attributes })
}
function generate() {
  const combos = missing.value.filter(combo => picked.value.includes(comboKey(combo)))
  if (store.generateVariants(model.value!.id, combos.length ? combos : missing.value) !== undefined) picked.value = []
}
</script>

<template>
  <h3 class="drawer-title">Grade (variações)</h3>
  <template v-if="model">
    <p class="cell-sub">Modelo <b>{{ model.name }}</b> · eixos {{ model.axes.map(axis => `${axis.name} (${axis.values.length})`).join(' × ') }}. Cada combinação é um produto real, com código, EAN, estoque e estrutura próprios.
      <template v-if="model.templateId !== item.id"> Produto-modelo: <RouterLink :to="`/produtos/item/${model.templateId}`">{{ store.item(model.templateId).code }}</RouterLink>.</template>
    </p>
    <table class="dense">
      <thead><tr><th v-if="missing.length" /><th v-for="axis in model.axes" :key="axis.name">{{ axis.name }}</th><th>Produto</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="row in matrix" :key="comboKey(row.combo)">
          <td v-if="missing.length"><input v-if="!row.item" v-model="picked" type="checkbox" :value="comboKey(row.combo)" :disabled="!allowed" /></td>
          <td v-for="axis in model.axes" :key="axis.name">{{ row.combo[axis.name] }}</td>
          <td><RouterLink v-if="row.item" :to="`/produtos/item/${row.item.id}`" class="cell-main code">{{ row.item.code }}</RouterLink><span v-else class="cell-sub">não gerado</span></td>
          <td><span v-if="row.item" class="status" :class="LIFE_TONE[catalogOf(row.item).lifecycle]">{{ catalogOf(row.item).lifecycle }}</span></td>
        </tr>
      </tbody>
    </table>
    <div v-if="missing.length" class="filter-row" style="margin-top:8px">
      <button class="button small" :disabled="!allowed" :title="allowed ? '' : `Quem gera variantes: ${editorsLabel('nucleo')}`" @click="generate">
        {{ picked.length ? `Gerar ${picked.length} selecionada(s)` : `Gerar todas as ${missing.length} faltantes` }} em rascunho
      </button>
      <span class="cell-sub">Herdam fiscal, marca, categorias, dimensões e unidades do produto-modelo. EAN, preço, estrutura e foto ficam por variante.</span>
    </div>
  </template>
  <template v-else-if="item.type === 'PA' || item.type === 'KF'">
    <p class="cell-sub">Este produto não faz parte de grade. Transforme-o em produto-modelo para gerar variações (cor, modelo de tablet, tamanho) como produtos reais.</p>
    <fieldset class="layer" :disabled="!allowed">
      <div class="form-grid">
        <div class="field"><label>Nome do modelo</label><input v-model="draft.name" :placeholder="item.name" /></div>
        <div class="field"><label>Eixos e valores (um eixo por linha)</label><textarea v-model="draft.axes" rows="2" /><small>{{ classAxes.length ? 'Sugerido pelos atributos de lista marcados como eixo na classe. ' : '' }}Formato "Eixo: valor, valor". Até 3 eixos.</small></div>
      </div>
      <div class="filter-row" style="margin:6px 0">
        <span class="cell-sub">Este produto é:</span>
        <select v-for="axis in parsedAxes" :key="axis.name" v-model="templateValues[axis.name]" class="filter">
          <option value="">{{ axis.name }}: {{ axis.values[0] ?? '—' }}</option>
          <option v-for="value in axis.values.slice(1)" :key="value" :value="value">{{ axis.name }}: {{ value }}</option>
        </select>
        <button class="button secondary small" @click="create">Criar grade</button>
      </div>
    </fieldset>
    <p v-if="!allowed" class="cell-sub">Quem cria grade: {{ editorsLabel('nucleo') }}.</p>
  </template>
</template>
