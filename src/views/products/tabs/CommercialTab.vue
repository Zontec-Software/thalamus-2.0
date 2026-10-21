<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { catalogOf } from '../../../domain/catalog'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import PermHint from '../PermHint.vue'
import BarcodeSection from '../sections/BarcodeSection.vue'
import GradeSection from '../sections/GradeSection.vue'
import PriceSection from '../sections/PriceSection.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const form = reactive({ commercialName: '', brand: '', productLine: '', categories: '' })
const disabled = computed(() => readOnly(props.item, ui.role, 'comercial'))
const known = computed(() => {
  const all = store.state.items.map(entry => catalogOf(entry))
  return {
    brands: [...new Set(all.map(entry => entry.brand).filter(Boolean))].sort(),
    lines: [...new Set(all.map(entry => entry.productLine).filter(Boolean))].sort(),
    categories: [...new Set(all.flatMap(entry => entry.categories))].sort(),
  }
})
const service = computed(() => catalogOf(props.item).nature === 'Serviço')

watch(() => [props.item.id, catalogOf(props.item).version], () => {
  const catalog = catalogOf(props.item)
  Object.assign(form, { commercialName: catalog.commercialName, brand: catalog.brand, productLine: catalog.productLine, categories: catalog.categories.join(', ') })
}, { immediate: true })

function save() {
  store.updateItemCommercial(props.item.id, { ...form, categories: form.categories.split(',') })
}
function addCategory(category: string) {
  const list = form.categories.split(',').map(entry => entry.trim()).filter(Boolean)
  if (!list.includes(category)) form.categories = [...list, category].join(', ')
}
</script>

<template>
  <PermHint :item="item" layer="comercial" />
  <fieldset class="layer" :disabled="disabled">
    <div class="form-grid">
      <div class="field wide"><label>Descrição comercial</label><input v-model="form.commercialName" placeholder="Como o cliente enxerga o item" /></div>
      <div class="field"><label>Marca</label><input v-model="form.brand" list="known-brands" /><datalist id="known-brands"><option v-for="entry in known.brands" :key="entry" :value="entry" /></datalist></div>
      <div class="field"><label>Linha comercial</label><input v-model="form.productLine" list="known-lines" /><datalist id="known-lines"><option v-for="entry in known.lines" :key="entry" :value="entry" /></datalist></div>
      <div class="field wide"><label>Categorias de e-commerce</label><input v-model="form.categories" placeholder="Separe por vírgula" />
        <small>Um item pode estar em várias categorias. Já usadas:
          <button v-for="entry in known.categories" :key="entry" class="button ghost small" type="button" @click="addCategory(entry)">{{ entry }}</button>
        </small>
      </div>
    </div>
    <p class="cell-sub">Marca, linha e categorias são dimensões transversais: não mexem no código nem na classificação e servem de filtro na lista e nos relatórios.</p>
    <button class="button" @click="save">Salvar comercial</button>
  </fieldset>

  <BarcodeSection v-if="!service" :item="item" />
  <PriceSection :item="item" />
  <GradeSection v-if="item.type === 'PA' || item.type === 'KF'" :item="item" />
</template>
