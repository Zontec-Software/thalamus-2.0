<script setup lang="ts">
import { computed, reactive } from 'vue'
import { catalogOf, needsStructure } from '../../../domain/catalog'
import { costLayer, rolledUpCost } from '../../../domain/catalogExtensions'
import { today } from '../../../domain/engine'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import { fmtCurrency } from '../../../utils/format'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const todayIso = today()
const form = reactive({ value: 0, validFrom: todayIso, reason: '' })
const disabled = computed(() => readOnly(props.item, ui.role, costLayer(props.item)))
const history = computed(() => [...catalogOf(props.item).costs].sort((a, b) => b.validFrom.localeCompare(a.validFrom)))
const rolled = computed(() => needsStructure(props.item) && props.item.bom?.length ? rolledUpCost(store.state, props.item) : undefined)
const tag = (validFrom: string, index: number) => validFrom > todayIso ? 'Programado' : history.value.findIndex(entry => entry.validFrom <= todayIso) === index ? 'Vigente' : 'Histórico'

function save() {
  if (store.setStandardCost(props.item.id, form.value, form.validFrom, form.reason) !== undefined) Object.assign(form, { value: 0, reason: '' })
}
</script>

<template>
  <h3 class="drawer-title">Custo-padrão com vigência</h3>
  <div class="mini-stats">
    <div class="mini-stat"><strong>{{ fmtCurrency(item.cost) }}</strong><span>custo-padrão vigente</span></div>
    <template v-if="rolled">
      <div class="mini-stat"><strong>{{ fmtCurrency(rolled.material) }}</strong><span>material pela estrutura (com perdas)</span></div>
      <div class="mini-stat"><strong :style="rolled.variance < 0 ? 'color:#B42318' : ''">{{ fmtCurrency(rolled.variance) }}</strong><span>diferença: processo e margem de custo</span></div>
    </template>
  </div>
  <table v-if="history.length" class="dense">
    <thead><tr><th>Vigência</th><th>Custo</th><th>Motivo</th><th>Lançado por</th><th /></tr></thead>
    <tbody>
      <tr v-for="(entry, index) in history" :key="entry.validFrom">
        <td>{{ entry.validFrom.split('-').reverse().join('/') }}</td>
        <td>{{ fmtCurrency(entry.value) }}</td>
        <td><span class="cell-sub">{{ entry.reason }}</span></td>
        <td><span class="cell-sub">{{ entry.createdBy }}</span></td>
        <td><span class="status" :class="tag(entry.validFrom, index) === 'Vigente' ? 'success' : tag(entry.validFrom, index) === 'Programado' ? 'info' : 'neutral'">{{ tag(entry.validFrom, index) }}</span></td>
      </tr>
    </tbody>
  </table>
  <p v-else class="empty-note">Sem histórico: o custo atual veio da carga inicial. O primeiro lançamento guarda ele como ponto de partida.</p>
  <form class="filter-row" style="margin-top:8px" @submit.prevent="save">
    <fieldset class="layer filter-row" :disabled="disabled">
      <input v-model.number="form.value" class="filter narrow" type="number" min="0" step="0.01" title="Novo custo (R$)" placeholder="R$" />
      <label class="cell-sub">desde <input v-model="form.validFrom" class="filter" type="date" :min="todayIso" /></label>
      <input v-model="form.reason" class="filter grow" placeholder="Motivo (ex.: reajuste do fornecedor)" />
      <button class="button small" type="submit">Lançar custo</button>
    </fieldset>
  </form>
  <p class="cell-sub">Custo com data futura fica programado e entra sozinho no dia. O histórico não se edita: corrige-se com um lançamento novo.</p>
</template>
