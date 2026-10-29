<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Package, Plus, Trash2 } from 'lucide-vue-next'
import { catalogOf } from '../../../domain/catalog'
import { PACKAGING_LEVELS } from '../../../domain/engineering'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, PackagingLevel, PackagingLevelName } from '../../../types/domain'
import { fmtNumber } from '../../../utils/format'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const catalog = computed(() => catalogOf(props.item))
const disabled = computed(() => readOnly(props.item, ui.role, 'estoque'))
const rows = reactive<PackagingLevel[]>([])
const packages = computed(() => store.state.items.filter(entry => entry.type === '02' && !catalogOf(entry).deletedAt))
const missingLevels = computed(() => PACKAGING_LEVELS.filter(level => !rows.some(row => row.level === level)))

function load() {
  rows.splice(0, rows.length, ...(catalog.value.packaging ?? []).map(entry => ({ ...entry, gtin: entry.gtin ?? '', packageItemId: entry.packageItemId ?? '' })))
}
watch(() => [props.item.id, catalog.value.version], load, { immediate: true })

function add(level: PackagingLevelName) {
  const previous = rows[rows.length - 1]
  const units = level === 'Unidade' ? 1 : (previous?.units ?? 1) * (level === 'Caixa' ? 10 : 40)
  rows.push({ level, units, gtin: '', packageItemId: '', weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0 })
  rows.sort((a, b) => PACKAGING_LEVELS.indexOf(a.level) - PACKAGING_LEVELS.indexOf(b.level))
}
const contains = (index: number) => index === 0 ? '' : `${fmtNumber(rows[index].units / rows[index - 1].units, 2)} × ${rows[index - 1].level.toLowerCase()}`
const volume = (row: PackagingLevel) => row.lengthCm * row.widthCm * row.heightCm / 1_000_000
</script>

<template>
  <PermHint :item="item" layer="estoque" />
  <p class="cell-sub" style="margin-top:0">Hierarquia logística: quantas unidades vão em cada caixa e em cada palete, com GTIN, peso e medidas de cada nível. A expedição e a etiqueta usam estes dados.</p>
  <div class="pack-flow" data-tour="product-packaging">
    <div v-for="(row, index) in rows" :key="row.level" class="pack-level">
      <header><Package :size="15" /> <b>{{ row.level }}</b><span class="cell-sub">{{ row.units }} {{ item.unit }}<template v-if="contains(index)"> · {{ contains(index) }}</template></span></header>
      <fieldset class="layer" :disabled="disabled">
        <div class="form-grid">
          <div class="field"><label>Unidades base</label><input v-model.number="row.units" type="number" min="1" step="1" :disabled="row.level === 'Unidade'" /></div>
          <div class="field"><label>GTIN do nível</label><input v-model="row.gtin" inputmode="numeric" placeholder="EAN-13 ou DUN-14" /></div>
          <div class="field wide"><label>Material de embalagem</label>
            <select v-model="row.packageItemId"><option value="">—</option><option v-for="entry in packages" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option></select>
          </div>
          <div class="field"><label>Peso bruto (kg)</label><input v-model.number="row.weightKg" type="number" min="0" step="0.01" /></div>
          <div class="field"><label>C × L × A (cm)</label>
            <div class="dims"><input v-model.number="row.lengthCm" type="number" min="0" /><input v-model.number="row.widthCm" type="number" min="0" /><input v-model.number="row.heightCm" type="number" min="0" /></div>
            <small v-if="volume(row)">{{ fmtNumber(volume(row), 3) }} m³</small>
          </div>
        </div>
        <button class="button ghost small" type="button" @click="rows.splice(index, 1)"><Trash2 :size="12" /> Remover nível</button>
      </fieldset>
    </div>
    <div v-if="missingLevels.length && !disabled" class="pack-level add">
      <button v-for="level in missingLevels" :key="level" class="button secondary small" type="button" @click="add(level)"><Plus :size="13" /> {{ level }}</button>
    </div>
  </div>
  <div class="filter-row" style="margin-top:12px">
    <button class="button" :disabled="disabled" @click="store.savePackaging(item.id, rows.map(row => ({ ...row })))">Salvar embalagem</button>
    <button class="button ghost" :disabled="disabled" @click="load">Desfazer</button>
  </div>
  <p class="cell-sub">Cada nível contém um número inteiro do nível anterior. O GTIN de cada nível é único no cadastro.</p>
</template>
