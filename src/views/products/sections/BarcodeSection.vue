<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Star } from 'lucide-vue-next'
import { catalogOf, gtinNcmConflict, needsGtin, validGtin } from '../../../domain/catalog'
import { BARCODE_KINDS, barcodeUnits, nextBarcode } from '../../../domain/catalogExtensions'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { BarcodeKind, Item } from '../../../types/domain'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const form = reactive({ code: '', kind: 'EAN-13' as BarcodeKind, unit: '', main: false })
const disabled = computed(() => readOnly(props.item, ui.role, 'comercial'))
const units = computed(() => barcodeUnits(props.item))
const barcodes = computed(() => catalogOf(props.item).barcodes)
const check = computed(() => !form.code ? '' : validGtin(form.code.replace(/\D/g, '')) ? 'Dígito verificador confere.' : 'Dígito verificador não confere.')
const conflict = computed(() => gtinNcmConflict(props.item))

function generate() {
  Object.assign(form, { code: nextBarcode(store.state), kind: 'EAN-13' })
}
function add() {
  if (store.addBarcode(props.item.id, { ...form, unit: form.unit || props.item.unit }) !== undefined) Object.assign(form, { code: '', main: false })
}
</script>

<template>
  <h3 class="drawer-title">Códigos de barras</h3>
  <p v-if="conflict" class="notice warning">O CCG (cadastro nacional GS1) registra o EAN principal com NCM {{ conflict }}, mas o produto usa {{ catalogOf(item).ncm }}. A Receita cruza os dois na NF-e: alinhe com o fiscal antes de faturar.</p>
  <table v-if="barcodes.length" class="dense">
    <thead><tr><th>Código</th><th>Tipo</th><th>Unidade</th><th>Principal</th><th /></tr></thead>
    <tbody>
      <tr v-for="entry in barcodes" :key="entry.code">
        <td><span class="code">{{ entry.code }}</span></td>
        <td>{{ entry.kind }}</td>
        <td>{{ entry.unit }}</td>
        <td>
          <span v-if="entry.main" class="status success"><Star :size="11" /> Principal</span>
          <button v-else class="button ghost small" :disabled="disabled" @click="store.setMainBarcode(item.id, entry.code)">Tornar principal</button>
        </td>
        <td><button class="button ghost small" :disabled="disabled" @click="store.removeBarcode(item.id, entry.code)">Remover</button></td>
      </tr>
    </tbody>
  </table>
  <p v-else class="empty-note">Nenhum código de barras.{{ needsGtin(item) ? ' Produto acabado precisa de EAN principal para a aprovação comercial.' : '' }}</p>
  <form class="filter-row" style="margin-top:8px" @submit.prevent="add">
    <fieldset class="layer filter-row" :disabled="disabled">
      <select v-model="form.kind" class="filter"><option v-for="kind in BARCODE_KINDS" :key="kind">{{ kind }}</option></select>
      <input v-model="form.code" class="filter grow" inputmode="numeric" placeholder="Código com dígito verificador" required />
      <button class="button secondary small" type="button" @click="generate">Gerar próximo EAN</button>
      <select v-model="form.unit" class="filter" title="Unidade da embalagem"><option value="">{{ item.unit }} (base)</option><option v-for="unit in units.filter(entry => entry !== item.unit)" :key="unit" :value="unit">{{ unit }}</option></select>
      <label class="cell-sub"><input v-model="form.main" type="checkbox" /> principal</label>
      <button class="button small" type="submit">Incluir</button>
    </fieldset>
  </form>
  <p class="cell-sub">{{ check || 'Cada código é único no cadastro inteiro. DUN-14 identifica a caixa de embarque; use a unidade de venda correspondente.' }}</p>
</template>
