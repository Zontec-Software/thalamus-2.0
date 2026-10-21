<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Columns3, Plus, X } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import {
  ITEM_TYPE_LABEL, LIFECYCLE, canEdit, catalogOf, classDescendants, classLabel, classOptions, currentPrice, editorsLabel, itemFlags, similarItems,
} from '../../domain/catalog'
import { abcAnalysis, modelOf } from '../../domain/catalogExtensions'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Item, ItemType } from '../../types/domain'
import { fmtCurrency, fmtNumber } from '../../utils/format'
import ReasonModal from './ReasonModal.vue'
import TablePager from './TablePager.vue'
import { FLAG_TONE, LIFE_TONE, LIST_COLUMNS, listState, usePager, type ListColumn } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const FLAGS = ['Qualquer pendência', 'Sem NCM', 'Sem CEST', 'Sem estrutura', 'Sem roteiro', 'Sem EAN', 'Sem preço', 'GTIN × NCM divergente', 'Exceção pendente', 'Versão em rascunho', 'Obsoleto com saldo']
const classes = computed(() => classOptions(store.state))
const flagsOf = (item: Item) => itemFlags(store.state, item)
const abc = computed(() => abcAnalysis(store.state))
const brands = computed(() => [...new Set(store.state.items.map(item => catalogOf(item).brand).filter(Boolean))].sort())
const categories = computed(() => [...new Set(store.state.items.flatMap(item => catalogOf(item).categories))].sort())
const priceOf = (item: Item) => currentPrice(item)?.value
const modelName = (item: Item) => modelOf(store.state, item)?.name

function matches(item: Item, ignoreType = false) {
  const text = listState.query.trim().toLowerCase()
  const inClass = listState.classId ? new Set(classDescendants(store.state, listState.classId)) : undefined
  const catalog = catalogOf(item)
  if (!!catalog.deletedAt !== listState.showDeleted) return false
  if (!ignoreType && listState.type && item.type !== listState.type) return false
  if (listState.lifecycle && catalog.lifecycle !== listState.lifecycle) return false
  if (inClass && !inClass.has(catalog.classId)) return false
  if (listState.brand && catalog.brand !== listState.brand) return false
  if (listState.category && !catalog.categories.includes(listState.category)) return false
  if (listState.abc && (catalog.nature !== 'Bem' || (abc.value.get(item.id)?.cls ?? 'C') !== listState.abc)) return false
  if (listState.flag) {
    const flags = flagsOf(item)
    if (listState.flag === 'Qualquer pendência' ? !flags.length : !flags.includes(listState.flag)) return false
  }
  if (!text) return true
  return `${item.code} ${item.name} ${catalog.commercialName} ${catalog.barcodes.map(entry => entry.code).join(' ')} ${catalog.gtinTax} ${catalog.ncm} ${catalog.brand} ${catalog.productLine}`.toLowerCase().includes(text)
}
const filtered = computed(() => store.state.items.filter(item => matches(item)))
const typeCounts = computed(() => {
  const counts = new Map<ItemType, number>()
  let all = 0
  for (const item of store.state.items) {
    if (!matches(item, true)) continue
    all += 1
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
  }
  return { all, counts }
})

const sorted = computed(() => {
  const rows = [...filtered.value]
  const key = listState.sort
  const value = (item: Item): string | number => {
    if (key === 'name') return item.name.toLowerCase()
    if (key === 'lifecycle') return LIFECYCLE.indexOf(catalogOf(item).lifecycle)
    if (key === 'stock') return item.stock
    if (key === 'updated') return catalogOf(item).updatedAt
    return item.code
  }
  rows.sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return listState.desc ? -order : order
  })
  return rows
})

const { page, size, pages, slice, range } = usePager(sorted)
const shown = (column: ListColumn) => listState.columns.includes(column)
function sortBy(key: typeof listState.sort) {
  if (listState.sort === key) listState.desc = !listState.desc
  else Object.assign(listState, { sort: key, desc: false })
}
const arrow = (key: typeof listState.sort) => listState.sort === key ? (listState.desc ? '▼' : '▲') : ''
const activeFilters = computed(() => [listState.query, listState.type, listState.lifecycle, listState.classId, listState.flag, listState.brand, listState.category, listState.abc].filter(Boolean).length + (listState.showDeleted ? 1 : 0))
function clearFilters() {
  Object.assign(listState, { query: '', type: '', lifecycle: '', classId: '', flag: '', brand: '', category: '', abc: '', showDeleted: false })
}

const columnsOpen = ref(false)

const picked = ref<string[]>([])
watch(filtered, rows => {
  const visible = new Set(rows.map(item => item.id))
  picked.value = picked.value.filter(id => visible.has(id))
})
const allOnPage = computed(() => slice.value.length > 0 && slice.value.every(item => picked.value.includes(item.id)))
function togglePage() {
  const ids = slice.value.map(item => item.id)
  picked.value = allOnPage.value ? picked.value.filter(id => !ids.includes(id)) : [...new Set([...picked.value, ...ids])]
}
function toggle(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter(entry => entry !== id) : [...picked.value, id]
}

type Bulk = 'block' | 'obsolete'
const askReason = ref<Bulk | ''>('')
const reclassTo = ref('')
const result = ref<{ done: string[]; failed: { code: string; reason: string }[] } | null>(null)
function bulk(action: 'submit' | 'approve' | 'reclassify' | Bulk, reason?: string) {
  result.value = store.bulkItems(picked.value, action, { reason, classId: reclassTo.value })
  askReason.value = ''
  if (!result.value.failed.length) picked.value = []
}

const creating = ref(false)
const confirmSimilar = ref(false)
const draft = reactive({ name: '', type: 'MP' as ItemType, unit: 'un', classId: '' })
const similar = computed(() => similarItems(store.state, draft.name))
watch(() => draft.name, () => { confirmSimilar.value = false })
function openCreate() {
  Object.assign(draft, { name: '', type: listState.type || 'MP', unit: 'un', classId: listState.classId })
  creating.value = true
}
function create() {
  if (similar.value.length && !confirmSimilar.value) {
    confirmSimilar.value = true
    return
  }
  const created = store.createCatalogItem({ ...draft })
  if (created && typeof created === 'object') {
    creating.value = false
    router.push(`/produtos/item/${created.id}`)
  }
}
</script>

<template>
  <article class="card flush" data-tour="product-list">
    <div class="section-head">
      <div><h2>Itens</h2><p>Um código por item. Filtre, ordene e abra a página do item para editar as camadas.</p></div>
      <div class="filter-row">
        <div class="column-menu">
          <button class="button secondary" @click="columnsOpen = !columnsOpen"><Columns3 :size="14" /> Colunas</button>
          <div v-if="columnsOpen" class="menu" @mouseleave="columnsOpen = false">
            <label v-for="column in LIST_COLUMNS" :key="column.id"><input v-model="listState.columns" type="checkbox" :value="column.id" /> {{ column.label }}</label>
          </div>
        </div>
        <button class="button" data-tour="new-record" :disabled="!canEdit(ui.role, 'nucleo')" :title="canEdit(ui.role, 'nucleo') ? '' : `Quem cadastra: ${editorsLabel('nucleo')}`" @click="openCreate"><Plus :size="14" /> Novo item</button>
      </div>
    </div>

    <div class="list-filters">
      <input v-model="listState.query" class="filter" placeholder="Código, descrição, EAN ou NCM" />
      <select v-model="listState.lifecycle" class="filter"><option value="">Todas as situações</option><option v-for="step in LIFECYCLE" :key="step">{{ step }}</option></select>
      <select v-model="listState.classId" class="filter"><option value="">Toda a classificação</option><option v-for="entry in classes" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
      <select v-model="listState.flag" class="filter"><option value="">Com ou sem pendência</option><option v-for="flag in FLAGS" :key="flag">{{ flag }}</option></select>
      <select v-model="listState.brand" class="filter"><option value="">Todas as marcas</option><option v-for="brand in brands" :key="brand">{{ brand }}</option></select>
      <select v-model="listState.category" class="filter"><option value="">Todas as categorias</option><option v-for="category in categories" :key="category">{{ category }}</option></select>
      <select v-model="listState.abc" class="filter"><option value="">Curva ABC</option><option value="A">Classe A</option><option value="B">Classe B</option><option value="C">Classe C</option></select>
    </div>
    <div class="list-meta">
      <span>{{ filtered.length }} item(ns) encontrados<template v-if="activeFilters"> · {{ activeFilters }} filtro(s) <button class="button ghost small" @click="clearFilters"><X :size="12" /> limpar</button></template></span>
      <label class="filter-row"><input v-model="listState.showDeleted" type="checkbox" /> Mostrar só excluídos logicamente</label>
    </div>

    <div class="type-bar">
      <button type="button" class="chip" :class="{ active: !listState.type }" @click="listState.type = ''">Todos <b>{{ typeCounts.all }}</b></button>
      <button v-for="(label, id) in ITEM_TYPE_LABEL" :key="id" type="button" class="chip" :class="{ active: listState.type === id }" @click="listState.type = id">{{ label }} <b>{{ typeCounts.counts.get(id) ?? 0 }}</b></button>
    </div>

    <div v-if="picked.length" class="bulk-bar">
      <b>{{ picked.length }} selecionado(s)</b>
      <button class="button secondary small" @click="bulk('submit')">Enviar para homologação</button>
      <button class="button secondary small" @click="bulk('approve')">Aprovar no meu papel</button>
      <button class="button secondary small" @click="askReason = 'block'">Bloquear</button>
      <button class="button secondary small" @click="askReason = 'obsolete'">Obsoletar</button>
      <select v-model="reclassTo" class="filter"><option value="">Reclassificar em…</option><option v-for="entry in classes" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
      <button class="button secondary small" :disabled="!reclassTo" @click="bulk('reclassify')">Aplicar</button>
      <button class="button ghost small" style="color:#C5D4E8" @click="picked = []">Limpar seleção</button>
    </div>
    <div v-if="result" class="notice bulk-result" :class="result.failed.length ? 'warning' : 'success'">
      <b>{{ result.done.length }} atualizado(s), {{ result.failed.length }} recusado(s).</b>
      <ul v-if="result.failed.length"><li v-for="entry in result.failed" :key="entry.code"><b>{{ entry.code }}</b>: {{ entry.reason }}</li></ul>
      <button class="button ghost small" @click="result = null">Fechar</button>
    </div>

    <table class="dense">
      <thead>
        <tr>
          <th class="check"><input type="checkbox" :checked="allOnPage" title="Selecionar a página" @change="togglePage" /></th>
          <th class="sortable" @click="sortBy('code')">Código<span class="arrow">{{ arrow('code') }}</span></th>
          <th class="sortable" @click="sortBy('name')">Descrição<span class="arrow">{{ arrow('name') }}</span></th>
          <th v-if="shown('type')">Tipo</th>
          <th v-if="shown('class')">Classificação</th>
          <th v-if="shown('brand')">Marca</th>
          <th v-if="shown('abc')">ABC</th>
          <th v-if="shown('price')">Preço</th>
          <th v-if="shown('model')">Grade</th>
          <th v-if="shown('unit')">Un.</th>
          <th v-if="shown('stock')" class="sortable" @click="sortBy('stock')">Saldo<span class="arrow">{{ arrow('stock') }}</span></th>
          <th v-if="shown('ncm')">NCM</th>
          <th v-if="shown('gtin')">EAN</th>
          <th v-if="shown('version')">Versão</th>
          <th v-if="shown('updated')" class="sortable" @click="sortBy('updated')">Alterado<span class="arrow">{{ arrow('updated') }}</span></th>
          <th class="sortable" @click="sortBy('lifecycle')">Situação<span class="arrow">{{ arrow('lifecycle') }}</span></th>
          <th v-if="shown('flags')">Pendências</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in slice" :key="item.id" class="clickable" :class="{ picked: picked.includes(item.id) }" @click="router.push(`/produtos/item/${item.id}`)">
          <td class="check" @click.stop><input type="checkbox" :checked="picked.includes(item.id)" @change="toggle(item.id)" /></td>
          <td><span class="cell-main code">{{ item.code }}</span></td>
          <td>{{ item.name }}<span v-if="item.variant" class="cell-sub">{{ item.variant }}</span></td>
          <td v-if="shown('type')"><span class="cell-sub">{{ ITEM_TYPE_LABEL[item.type] }}</span></td>
          <td v-if="shown('class')"><span class="cell-sub">{{ classLabel(store.state, catalogOf(item).classId) }}</span></td>
          <td v-if="shown('brand')"><span class="cell-sub">{{ catalogOf(item).brand || '—' }}{{ catalogOf(item).productLine ? ` · ${catalogOf(item).productLine}` : '' }}</span></td>
          <td v-if="shown('abc')"><span v-if="catalogOf(item).nature === 'Bem'" class="status" :class="{ A: 'success', B: 'info', C: 'neutral' }[abc.get(item.id)?.cls ?? 'C']">{{ abc.get(item.id)?.cls ?? 'C' }}</span><span v-else class="cell-sub">—</span></td>
          <td v-if="shown('price')"><span class="cell-sub">{{ priceOf(item) !== undefined ? fmtCurrency(priceOf(item)!) : '—' }}</span></td>
          <td v-if="shown('model')"><span class="cell-sub">{{ modelName(item) ? `${modelName(item)} · ${Object.values(catalogOf(item).attributes).join(' · ')}` : '—' }}</span></td>
          <td v-if="shown('unit')">{{ item.unit }}</td>
          <td v-if="shown('stock')">{{ catalogOf(item).nature === 'Bem' ? fmtNumber(item.stock, 2) : '—' }}</td>
          <td v-if="shown('ncm')"><span class="cell-sub">{{ catalogOf(item).ncm || '—' }}</span></td>
          <td v-if="shown('gtin')"><span class="cell-sub">{{ catalogOf(item).gtin || '—' }}</span></td>
          <td v-if="shown('version')">v{{ catalogOf(item).version }}</td>
          <td v-if="shown('updated')"><span class="cell-sub">{{ catalogOf(item).updatedBy }} · {{ catalogOf(item).updatedAt.slice(0, 10) }}</span></td>
          <td><StatusBadge :value="catalogOf(item).deletedAt ? 'Excluído' : catalogOf(item).lifecycle" :tone="catalogOf(item).deletedAt ? 'neutral' : LIFE_TONE[catalogOf(item).lifecycle]" /></td>
          <td v-if="shown('flags')"><div class="flag-list"><span v-for="flag in flagsOf(item)" :key="flag" class="status" :class="FLAG_TONE[flag] ?? 'warning'">{{ flag }}</span></div></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!filtered.length" class="empty-note">Nenhum item com esses filtros.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>

  <ReasonModal :open="askReason !== ''" :title="askReason === 'block' ? `Bloquear ${picked.length} item(ns)` : `Obsoletar ${picked.length} item(ns)`"
    subtitle="Cada item passa pelas mesmas regras da tela individual. Os que não puderem mudar voltam com o motivo." :tone="askReason === 'block' ? 'danger' : 'warning'"
    :confirm="askReason === 'block' ? 'Bloquear' : 'Obsoletar'" @close="askReason = ''" @confirm="reason => askReason && bulk(askReason, reason)" />

  <BaseModal :open="creating" title="Novo item" subtitle="Nasce em rascunho. Rascunho não entra em pedido, compra nem produção." @close="creating = false">
    <form id="new-item" @submit.prevent="create">
      <div class="field"><label>Descrição</label><input v-model="draft.name" required minlength="3" placeholder="Ex.: ABS cinza UV" /></div>
      <div class="form-grid">
        <div class="field"><label>Tipo</label><select v-model="draft.type"><option v-for="(label, id) in ITEM_TYPE_LABEL" :key="id" :value="id">{{ label }}</option></select></div>
        <div class="field"><label>Unidade base</label><input v-model="draft.unit" required /></div>
      </div>
      <div class="field"><label>Classificação</label>
        <select v-model="draft.classId" required><option value="" disabled>Escolha um nó</option><option v-for="entry in classes" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
        <small>O código sai sequencial e sem significado. A classificação é que organiza.</small>
      </div>
      <div v-if="similar.length" class="notice warning">
        <b>Itens parecidos já cadastrados:</b>
        <div v-for="entry in similar" :key="entry.id">{{ entry.code }} · {{ entry.name }} ({{ catalogOf(entry).lifecycle }})</div>
        <span v-if="confirmSimilar">Confirme que é outro item para continuar.</span>
      </div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="creating = false">Cancelar</button>
      <button class="button" type="submit" form="new-item">{{ confirmSimilar ? 'É outro item, criar' : 'Criar rascunho' }}</button>
    </template>
  </BaseModal>
</template>
