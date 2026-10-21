<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { BRANCHES, MATRIZ, UNIT_CONTEXTS, catalogOf, convertQuantity, needsStructure } from '../../../domain/catalog'
import { abcAnalysis } from '../../../domain/catalogExtensions'
import { purchaseLot } from '../../../domain/engine'
import StandardCostSection from '../sections/StandardCostSection.vue'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, UnitContext } from '../../../types/domain'
import { fmtNumber } from '../../../utils/format'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()

const form = reactive({
  location: '', minimum: 0, leadTimeDays: 0, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0, minLot: 0, lotMultiple: 0,
  lot: false, expiry: false, serial: false, allowNegative: false,
})
const branches = reactive<Record<string, { enabled: boolean; location: string; minimum: number }>>({})
const conversion = reactive({ unit: '', factor: 1, context: 'Compra' as UnitContext })
const converter = reactive({ quantity: 1, from: '', to: '' })
const disabled = computed(() => readOnly(props.item, ui.role, 'estoque'))
const catalog = computed(() => catalogOf(props.item))

watch(() => [props.item.id, catalog.value.version], () => {
  Object.assign(form, {
    location: props.item.location, minimum: props.item.minimum, leadTimeDays: props.item.leadTimeDays ?? 0, weightKg: catalog.value.weightKg,
    lengthCm: catalog.value.lengthCm, widthCm: catalog.value.widthCm, heightCm: catalog.value.heightCm, minLot: catalog.value.minLot, lotMultiple: catalog.value.lotMultiple,
    lot: catalog.value.lot, expiry: catalog.value.expiry, serial: catalog.value.serial, allowNegative: catalog.value.allowNegative,
  })
  for (const branch of BRANCHES) {
    const current = catalog.value.branches.find(entry => entry.branch === branch)
    branches[branch] = { enabled: current?.enabled ?? false, location: current?.location ?? '', minimum: current?.minimum ?? 0 }
  }
  converter.from = catalog.value.conversions[0]?.unit ?? props.item.unit
  converter.to = props.item.unit
}, { immediate: true })

const lots = computed(() => [...(props.item.lots ?? [])].filter(lot => lot.quantity > 0).sort((a, b) =>
  (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999') || a.receivedAt.localeCompare(b.receivedAt) || a.code.localeCompare(b.code)))
const units = computed(() => [props.item.unit, ...new Set(catalog.value.conversions.map(entry => entry.unit))])
const converted = computed(() => {
  try {
    return { value: convertQuantity(props.item, converter.quantity, converter.from, converter.to), error: '' }
  } catch (error) {
    return { value: 0, error: error instanceof Error ? error.message : String(error) }
  }
})
const movements = computed(() => store.state.movements.filter(entry => entry.itemId === props.item.id).slice(0, 8))
const abc = computed(() => abcAnalysis(store.state).get(props.item.id))
const volume = computed(() => form.lengthCm * form.widthCm * form.heightCm / 1000)
const lotExample = computed(() => form.minLot || form.lotMultiple ? purchaseLot({ ...props.item, catalog: { ...catalog.value, minLot: form.minLot, lotMultiple: form.lotMultiple } }, 1) : 0)
const soon = (date?: string) => !!date && date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

function addConversion() {
  if (store.addItemConversion(props.item.id, { ...conversion }) !== undefined) conversion.unit = ''
}
const editingBranch = ref('')
function saveBranch(branch: string) {
  if (store.updateItemBranch(props.item.id, branch, { ...branches[branch] }) !== undefined) editingBranch.value = ''
}
</script>

<template>
  <PermHint :item="item" layer="estoque" />
  <div class="mini-stats">
    <div class="mini-stat"><strong>{{ fmtNumber(item.stock, 2) }}</strong><span>saldo ({{ item.unit }})</span></div>
    <div class="mini-stat"><strong>{{ fmtNumber(store.reserved(item.id), 2) }}</strong><span>reservado</span></div>
    <div class="mini-stat"><strong>{{ fmtNumber(store.available(item.id), 2) }}</strong><span>disponível</span></div>
    <div class="mini-stat"><strong>{{ item.minimum }}</strong><span>mínimo na matriz</span></div>
    <div class="mini-stat"><strong>Classe {{ abc?.cls ?? 'C' }}</strong><span>ABC · giro {{ abc?.turnover !== undefined ? `${fmtNumber(abc.turnover, 1)}×/ano` : '—' }}</span></div>
  </div>

  <h3 class="drawer-title">Parâmetros · {{ MATRIZ }}</h3>
  <fieldset class="layer" :disabled="disabled">
    <div class="form-grid three">
      <div class="field"><label>Endereço</label><input v-model="form.location" /></div>
      <div class="field"><label>Estoque mínimo</label><input v-model.number="form.minimum" type="number" min="0" /></div>
      <div class="field"><label>Lead time de compra (dias)</label><input v-model.number="form.leadTimeDays" type="number" min="0" /></div>
      <div class="field"><label>Lote mínimo de compra ({{ item.unit }})</label><input v-model.number="form.minLot" type="number" min="0" step="0.001" /></div>
      <div class="field"><label>Múltiplo de compra ({{ item.unit }})</label><input v-model.number="form.lotMultiple" type="number" min="0" step="0.001" />
        <small v-if="lotExample">Necessidade de 1 {{ item.unit }} vira requisição de {{ fmtNumber(lotExample, 3) }} {{ item.unit }}.</small>
      </div>
      <div class="field"><label>Peso unitário (kg)</label><input v-model.number="form.weightKg" type="number" min="0" step="0.001" /></div>
      <div class="field"><label>Comprimento (cm)</label><input v-model.number="form.lengthCm" type="number" min="0" step="0.1" /></div>
      <div class="field"><label>Largura (cm)</label><input v-model.number="form.widthCm" type="number" min="0" step="0.1" /></div>
      <div class="field"><label>Altura (cm)</label><input v-model.number="form.heightCm" type="number" min="0" step="0.1" />
        <small v-if="volume">Volume {{ fmtNumber(volume, 2) }} L · cubagem para frete e armazenagem.</small>
      </div>
    </div>
    <div class="check-grid">
      <label class="check-option"><input v-model="form.lot" type="checkbox" /> Controla lote</label>
      <label class="check-option"><input v-model="form.expiry" type="checkbox" /> Controla validade (separação FEFO)</label>
      <label class="check-option"><input v-model="form.serial" type="checkbox" /> Controla número de série</label>
      <label class="check-option"><input v-model="form.allowNegative" type="checkbox" /> Permite saldo negativo</label>
    </div>
    <p class="cell-sub" style="margin:8px 0 12px">Sem "permite negativo", nenhuma baixa deixa o saldo abaixo de zero: a operação é recusada com o saldo disponível.</p>
    <button class="button" @click="store.updateItemStock(item.id, { ...form })">Salvar parâmetros</button>
  </fieldset>

  <h3 class="drawer-title">Filiais</h3>
  <table class="dense">
    <thead><tr><th>Filial</th><th>Habilitada</th><th>Endereço</th><th>Mínimo</th><th /></tr></thead>
    <tbody>
      <tr v-for="branch in BRANCHES" :key="branch">
        <td>{{ branch }}</td>
        <template v-if="editingBranch === branch">
          <td><input v-model="branches[branch].enabled" type="checkbox" /></td>
          <td><input v-model="branches[branch].location" class="filter" placeholder="Endereço na filial" /></td>
          <td><input v-model.number="branches[branch].minimum" class="filter narrow" type="number" min="0" /></td>
          <td><button class="button small" @click="saveBranch(branch)">Salvar</button></td>
        </template>
        <template v-else>
          <td><span class="status" :class="branches[branch].enabled ? 'success' : 'neutral'">{{ branches[branch].enabled ? 'Sim' : 'Não' }}</span></td>
          <td>{{ branches[branch].location || '—' }}</td>
          <td>{{ branches[branch].minimum }}</td>
          <td><button class="button secondary small" :disabled="disabled" @click="editingBranch = branch">Editar</button></td>
        </template>
      </tr>
    </tbody>
  </table>

  <template v-if="catalog.lot || catalog.expiry">
    <h3 class="drawer-title">Lotes com saldo · ordem de consumo</h3>
    <table class="dense">
      <thead><tr><th>#</th><th>Lote</th><th>Recebido</th><th>Validade</th><th>Saldo</th></tr></thead>
      <tbody>
        <tr v-for="(lot, index) in lots" :key="lot.code">
          <td>{{ index + 1 }}º</td>
          <td><span class="code">{{ lot.code }}</span></td>
          <td>{{ lot.receivedAt.slice(0, 10) }}</td>
          <td><span v-if="lot.expiry" class="status" :class="soon(lot.expiry) ? 'warning' : 'neutral'">{{ lot.expiry }}</span><span v-else>—</span></td>
          <td>{{ fmtNumber(lot.quantity, 2) }} {{ item.unit }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!lots.length" class="empty-note">Nenhum lote com saldo.</p>
    <p class="cell-sub">{{ catalog.expiry ? 'FEFO: a separação baixa primeiro o lote que vence antes.' : 'Sem validade: consome pelo recebimento mais antigo.' }} Cada baixa grava os lotes usados na movimentação.</p>
  </template>

  <h3 class="drawer-title">Unidades alternativas</h3>
  <p class="cell-sub">O fator aponta sempre para a unidade base ({{ item.unit }}). Não existe conversão de alternativa para alternativa.</p>
  <table class="dense">
    <thead><tr><th>Contexto</th><th>Unidade</th><th>Fator</th><th /></tr></thead>
    <tbody>
      <tr v-for="(entry, index) in catalog.conversions" :key="entry.unit + entry.context">
        <td>{{ entry.context }}</td><td>{{ entry.unit }}</td><td>1 {{ entry.unit }} = {{ entry.factor }} {{ item.unit }}</td>
        <td><button class="button secondary small" :disabled="readOnly(item, ui.role, 'unidades')" @click="store.removeItemConversion(item.id, index)">Remover</button></td>
      </tr>
    </tbody>
  </table>
  <p v-if="!catalog.conversions.length" class="empty-note">Sem conversões: a unidade base vale em todos os contextos.</p>
  <form class="inline-form row" style="margin-top:8px" @submit.prevent="addConversion">
    <fieldset class="layer filter-row" :disabled="readOnly(item, ui.role, 'unidades')">
      <select v-model="conversion.context" class="filter"><option v-for="context in UNIT_CONTEXTS" :key="context">{{ context }}</option></select>
      <input v-model="conversion.unit" class="filter" placeholder="Unidade (ex.: cx)" required />
      <input v-model.number="conversion.factor" class="filter narrow" type="number" min="0" step="0.001" title="Fator" />
      <button class="button small" type="submit">Adicionar</button>
    </fieldset>
  </form>
  <div class="card" style="margin-top:12px;background:#F8FAFC">
    <strong style="font-size:13px">Conversor</strong>
    <div class="filter-row" style="margin-top:8px">
      <input v-model.number="converter.quantity" class="filter narrow" type="number" min="0" />
      <select v-model="converter.from" class="filter"><option v-for="unit in units" :key="unit">{{ unit }}</option></select>
      <span>→</span>
      <select v-model="converter.to" class="filter"><option v-for="unit in units" :key="unit">{{ unit }}</option></select>
      <b v-if="!converted.error">{{ fmtNumber(converted.value, 3) }} {{ converter.to }}</b>
      <span v-else class="status danger">{{ converted.error }}</span>
    </div>
  </div>

  <StandardCostSection v-if="!needsStructure(item)" :item="item" />

  <h3 class="drawer-title">Últimas movimentações</h3>
  <div v-for="movement in movements" :key="movement.id" class="list-row static">
    <div><strong>{{ movement.type }} · {{ fmtNumber(movement.quantity, 2) }} {{ item.unit }}</strong><span>{{ movement.reference }}{{ movement.lots ? ` · lotes ${movement.lots}` : '' }}</span></div>
    <span class="cell-sub">{{ movement.at.slice(0, 10) }}</span>
  </div>
  <p v-if="!movements.length" class="empty-note">Sem movimentações.</p>
</template>
