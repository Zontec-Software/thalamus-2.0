<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { catalogOf } from '../../../domain/catalog'
import { LABOR_RATE, costBreakdown, type CostLine } from '../../../domain/engineering'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import { fmtCurrency, fmtNumber } from '../../../utils/format'
import StandardCostSection from '../sections/StandardCostSection.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const lot = ref(0)
watch(() => props.item.id, () => { lot.value = catalogOf(props.item).minLot || 200 }, { immediate: true })
const breakdown = computed(() => costBreakdown(store.state, props.item, Math.max(1, lot.value || 1)))
const KINDS: CostLine['kind'][] = ['Material', 'Máquina', 'Mão de obra', 'Preparação', 'Ferramental']
const byKind = computed(() => KINDS.map(kind => ({ kind, value: breakdown.value.lines.filter(line => line.kind === kind).reduce((sum, line) => sum + line.value, 0) })).filter(entry => entry.value > 0))
const manufactured = (itemId?: string) => {
  const component = itemId ? store.state.items.find(entry => entry.id === itemId) : undefined
  return component && (component.bom?.length || component.routing?.length) ? costBreakdown(store.state, component).total : undefined
}
const leadDays = ref(0)
watch(() => [props.item.id, catalogOf(props.item).version], () => { leadDays.value = catalogOf(props.item).productionLeadDays }, { immediate: true })
const disabled = computed(() => readOnly(props.item, ui.role, 'manufatura'))
</script>

<template>
  <div class="section-head" style="margin-top:0" data-tour="product-cost">
    <div>
      <h3 class="drawer-title" style="margin:0">Custo calculado pela engenharia</h3>
      <p>Material da estrutura vigente + conversão do roteiro. Mão de obra a {{ fmtCurrency(LABOR_RATE) }}/h; preparação rateada no lote.</p>
    </div>
    <label class="cell-sub">Lote <input v-model.number="lot" class="filter narrow" type="number" min="1" step="1" /> {{ item.unit }}</label>
  </div>
  <div class="cost-stack">
    <div class="stack-bar">
      <span v-for="entry in byKind" :key="entry.kind" :class="`cost-${KINDS.indexOf(entry.kind)}`" :style="{ width: `${breakdown.total ? entry.value / breakdown.total * 100 : 0}%` }" :title="`${entry.kind}: ${fmtCurrency(entry.value)}`" />
    </div>
    <div class="cost-legend">
      <span v-for="entry in byKind" :key="entry.kind"><i :class="`cost-${KINDS.indexOf(entry.kind)}`" />{{ entry.kind }} <b>{{ fmtCurrency(entry.value) }}</b></span>
    </div>
  </div>
  <div class="mini-stats four">
    <div class="mini-stat"><strong>{{ fmtCurrency(breakdown.total) }}</strong><span>custo calculado por {{ item.unit }}</span></div>
    <div class="mini-stat"><strong>{{ fmtCurrency(item.cost) }}</strong><span>custo-padrão vigente</span></div>
    <div class="mini-stat"><strong :class="{ negative: breakdown.variance < 0 }">{{ fmtCurrency(breakdown.variance) }}</strong><span>padrão − calculado</span></div>
    <div class="mini-stat"><strong>{{ breakdown.total ? fmtNumber(breakdown.material / breakdown.total * 100, 0) : 0 }}%</strong><span>do custo é material</span></div>
  </div>
  <table class="dense" style="margin-top:12px">
    <thead><tr><th>Natureza</th><th>Origem</th><th>Cálculo</th><th>Valor</th></tr></thead>
    <tbody>
      <tr v-for="(line, index) in breakdown.lines" :key="index">
        <td><span class="cost-dot" :class="`cost-${KINDS.indexOf(line.kind)}`" />{{ line.kind }}</td>
        <td>
          <RouterLink v-if="line.itemId" :to="`/produtos/item/${line.itemId}?aba=custos`">{{ line.label }}</RouterLink>
          <span v-else>{{ line.label }}</span>
          <span v-if="manufactured(line.itemId) !== undefined" class="cell-sub">fabricado · calculado {{ fmtCurrency(manufactured(line.itemId)!) }} por unidade</span>
        </td>
        <td><span class="cell-sub">{{ line.detail }}</span></td>
        <td>{{ fmtCurrency(line.value) }}</td>
      </tr>
    </tbody>
  </table>
  <p v-if="!breakdown.lines.length" class="empty-note">Sem estrutura nem roteiro vigentes: não há o que calcular.</p>
  <p class="cell-sub" style="margin-top:6px">O material usa o custo-padrão de cada componente. Para peça fabricada, o custo calculado dela aparece ao lado para conferência. Desgaste só conta para molde da Roboflex.</p>

  <h3 class="drawer-title">Prazo de fabricação</h3>
  <form class="filter-row" @submit.prevent="store.updateProductionLead(item.id, leadDays)">
    <fieldset class="layer filter-row" :disabled="disabled">
      <label class="cell-sub">Lead time de produção <input v-model.number="leadDays" class="filter narrow" type="number" min="0" /> dia(s)</label>
      <button class="button secondary small" type="submit">Salvar prazo</button>
    </fieldset>
  </form>
  <p class="cell-sub">Soma ao lead time de compra dos componentes para estimar a data de entrega na proposta.</p>

  <StandardCostSection :item="item" />
</template>
