<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ITEM_TYPE_LABEL, catalogOf, classOptions, isLocked } from '../../../domain/catalog'
import { abcAnalysis, modelOf } from '../../../domain/catalogExtensions'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, ItemType } from '../../../types/domain'
import { fmtCurrency } from '../../../utils/format'
import PermHint from '../PermHint.vue'
import KeyChangeModal from '../KeyChangeModal.vue'
import AttributesSection from '../sections/AttributesSection.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()

const form = reactive({ name: '', type: 'PA' as ItemType, unit: '', classId: '' })
const locked = computed(() => isLocked(props.item))
const disabled = computed(() => readOnly(props.item, ui.role, 'nucleo'))
const classes = computed(() => classOptions(store.state))
const askUnit = ref(false)
const catalog = computed(() => catalogOf(props.item))
const abc = computed(() => abcAnalysis(store.state).get(props.item.id))
const model = computed(() => modelOf(store.state, props.item))

function load() {
  Object.assign(form, { name: props.item.name, type: props.item.type, unit: props.item.unit, classId: catalog.value.classId })
}
watch(() => [props.item.id, catalog.value.version], load, { immediate: true })
</script>

<template>
  <PermHint :item="item" layer="nucleo" />
  <fieldset class="layer" :disabled="disabled">
    <div class="form-grid">
      <div class="field"><label>Código (SKU)</label><input :value="item.code" disabled /><small>Sequencial, sem significado e imutável.</small></div>
      <div class="field"><label>Tipo</label>
        <select v-model="form.type" :disabled="locked"><option v-for="(label, id) in ITEM_TYPE_LABEL" :key="id" :value="id">{{ label }}</option></select>
        <small>{{ locked ? 'Congelado: o tipo define as camadas do item.' : 'Mudar o tipo zera as aprovações já registradas.' }}</small>
      </div>
      <div class="field wide"><label>Descrição</label><input v-model="form.name" required /></div>
      <div class="field"><label>Unidade base</label>
        <input v-model="form.unit" :disabled="locked" />
        <small v-if="locked">Congelada. <button class="button ghost small" type="button" @click="askUnit = true">Solicitar exceção</button></small>
      </div>
      <div class="field wide"><label>Classificação</label>
        <select v-model="form.classId"><option v-for="entry in classes" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
      </div>
    </div>
    <button class="button" @click="store.updateItemCore(item.id, { ...form })">Salvar núcleo</button>
  </fieldset>

  <AttributesSection :item="item" />

  <h3 class="drawer-title">Dimensões de análise</h3>
  <div class="mini-stats">
    <div v-if="catalog.nature === 'Bem'" class="mini-stat">
      <strong>Classe {{ abc?.cls ?? 'C' }}</strong>
      <span>curva ABC · {{ abc?.value ? `${fmtCurrency(abc.value)} consumidos em 90 dias` : 'sem consumo em 90 dias' }}</span>
    </div>
    <div class="mini-stat"><strong>{{ catalog.brand || '—' }}</strong><span>marca{{ catalog.productLine ? ` · linha ${catalog.productLine}` : '' }}</span></div>
    <div class="mini-stat"><strong>{{ catalog.categories.length }}</strong><span>{{ catalog.categories.join(', ') || 'sem categoria de e-commerce' }}</span></div>
    <div v-if="model" class="mini-stat"><strong>{{ model.axes.map(axis => catalog.attributes[axis.name]).filter(Boolean).join(' · ') }}</strong><span>grade {{ model.name }}</span></div>
  </div>
  <p class="cell-sub">A classe ABC é calculada pelo valor consumido (saídas × custo-padrão) e não se digita. Marca, linha e categorias são mantidas na aba Comercial.</p>
  <KeyChangeModal :open="askUnit" :item="item" field="unit" @close="askUnit = false" />
</template>
