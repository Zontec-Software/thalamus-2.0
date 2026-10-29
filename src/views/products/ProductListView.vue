<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Columns3, Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import {
  ITEM_TYPE_LABEL, LIFECYCLE, PRODUCT_LIFE_TABS, catalogOf, classDescendants, classLabel, classOptions, currentPrice, itemFlags, productLifeTabs, similarItems,
} from '../../domain/catalog'
import { abcAnalysis, modelOf } from '../../domain/catalogExtensions'
import { useErpStore } from '../../stores/erp'
import type { Item, ItemType } from '../../types/domain'
import { fmtCurrency, fmtNumber } from '../../utils/format'
import HeaderFilter from './HeaderFilter.vue'
import ReasonModal from './ReasonModal.vue'
import TablePager from './TablePager.vue'
import { FLAG_TONE, LIFE_TONE, LIST_COLUMNS, headerFilterMatches, listState, usePager, type HeaderFilterColumn, type HeaderFilterOp, type ListColumn } from './shared'

const store = useErpStore()
const router = useRouter()

const FLAGS = ['Qualquer pendência', 'Sem NCM', 'Sem CEST', 'Sem estrutura', 'Sem roteiro', 'Sem EAN', 'Sem preço', 'GTIN × NCM divergente', 'Exceção pendente', 'Versão em rascunho', 'Obsoleto com saldo']
const classes = computed(() => classOptions(store.state))
const flagsOf = (item: Item) => itemFlags(store.state, item)
const abc = computed(() => abcAnalysis(store.state))
const brands = computed(() => [...new Set(store.state.items.map(item => catalogOf(item).brand).filter(Boolean))].sort())
const categories = computed(() => [...new Set(store.state.items.flatMap(item => catalogOf(item).categories))].sort())
const priceOf = (item: Item) => currentPrice(item)?.value
const modelName = (item: Item) => modelOf(store.state, item)?.name

function cellText(item: Item, column: HeaderFilterColumn) {
  const catalog = catalogOf(item)
  if (column === 'code') return item.code
  if (column === 'name') return `${item.name} ${item.variant ?? ''} ${catalog.commercialName}`
  if (column === 'type') return `${ITEM_TYPE_LABEL[item.type]} ${item.type}`
  if (column === 'class') return classLabel(store.state, catalog.classId)
  if (column === 'brand') return `${catalog.brand} ${catalog.productLine} ${catalog.categories.join(' ')}`
  if (column === 'abc') return catalog.nature === 'Bem' ? (abc.value.get(item.id)?.cls ?? 'C') : ''
  if (column === 'price') {
    const price = priceOf(item)
    return price === undefined ? '' : `${price} ${fmtCurrency(price)}`
  }
  if (column === 'model') return modelName(item) ? `${modelName(item)} ${Object.values(catalog.attributes).join(' ')}` : ''
  if (column === 'unit') return item.unit
  if (column === 'stock') return catalog.nature === 'Bem' ? `${item.stock} ${fmtNumber(item.stock, 2)}` : ''
  if (column === 'ncm') return catalog.ncm
  if (column === 'gtin') return `${catalog.gtin} ${catalog.gtinTax} ${catalog.barcodes.map(entry => entry.code).join(' ')}`
  if (column === 'version') return `v${catalog.version}`
  if (column === 'updated') return `${catalog.updatedBy} ${catalog.updatedAt.slice(0, 10)}`
  if (column === 'lifecycle') return catalog.deletedAt ? 'Excluído' : catalog.lifecycle
  return flagsOf(item).join(' ')
}
function columnMatches(item: Item, column: HeaderFilterColumn, value: string, op: HeaderFilterOp) {
  const needle = value.trim().toLowerCase()
  if (column === 'flags' && needle === 'qualquer pendência') {
    const hasFlag = flagsOf(item).length > 0
    return op === 'not-contains' || op === 'not-equals' ? !hasFlag : hasFlag
  }
  if (column === 'class') {
    const hit = store.state.itemClasses.find(entry => entry.name.toLowerCase() === needle || classLabel(store.state, entry.id).toLowerCase() === needle)
    if (hit && (op === 'contains' || op === 'equals' || op === 'not-contains' || op === 'not-equals')) {
      const inside = classDescendants(store.state, hit.id).includes(catalogOf(item).classId)
      return op === 'not-contains' || op === 'not-equals' ? !inside : inside
    }
  }
  return headerFilterMatches(cellText(item, column), value, op)
}
function matches(item: Item, ignoreType = false, ignoreLife = false) {
  const catalog = catalogOf(item)
  if (!!catalog.deletedAt !== listState.showDeleted) return false
  if (!ignoreLife && !productLifeTabs(store.state, item).includes(listState.life)) return false
  if (!ignoreType && listState.type && item.type !== listState.type) return false
  return (Object.entries(listState.headerFilters) as [HeaderFilterColumn, { value: string; op: HeaderFilterOp }][])
    .every(([column, filter]) => !filter.value.trim() || columnMatches(item, column, filter.value, filter.op))
}
function versionNote(item: Item) {
  const revisions = store.state.productRevisions.filter(entry => entry.itemId === item.id)
  if (listState.life === 'review') {
    const draft = revisions.find(entry => entry.status === 'Rascunho')
    return draft ? `Versão ${draft.code} em desenvolvimento` : ''
  }
  if (listState.life === 'active') {
    const draft = revisions.find(entry => entry.status === 'Rascunho')
    const current = revisions.find(entry => entry.status === 'Liberada')
    if (draft && current) return `Versão ${current.code} vigente`
  }
  return ''
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
const lifeCounts = computed(() => {
  const counts = { draft: 0, active: 0, review: 0, inactive: 0 }
  for (const item of store.state.items) {
    if (!matches(item, false, true)) continue
    for (const tab of productLifeTabs(store.state, item)) counts[tab] += 1
  }
  return counts
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
const menu = ref<HeaderFilterColumn | ''>('')
const filled = (column: HeaderFilterColumn) => !!listState.headerFilters[column].value.trim()
function clearColumn(column: HeaderFilterColumn) {
  listState.headerFilters[column].value = ''
  listState.headerFilters[column].op = 'contains'
  menu.value = ''
}
function filterBindings(column: HeaderFilterColumn) {
  const filter = listState.headerFilters[column]
  return {
    value: filter.value,
    op: filter.op,
    open: menu.value === column,
    onToggle: () => { menu.value = menu.value === column ? '' : column },
    onClose: () => { menu.value = '' },
    onClear: () => clearColumn(column),
    'onUpdate:value': (value: string) => { filter.value = value },
    'onUpdate:op': (op: HeaderFilterOp) => { filter.op = op },
  }
}
function classIdFromFilter() {
  const filter = listState.headerFilters.class
  const value = filter.value.trim().toLowerCase()
  if (!value || (filter.op !== 'contains' && filter.op !== 'equals')) return ''
  return store.state.itemClasses.find(entry => entry.name.toLowerCase() === value || classLabel(store.state, entry.id).toLowerCase() === value)?.id ?? ''
}
const units = computed(() => [...new Set(store.state.items.map(item => item.unit))].sort())
function closeMenu() { menu.value = '' }
onMounted(() => document.addEventListener('click', closeMenu))
onUnmounted(() => document.removeEventListener('click', closeMenu))

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
const draft = reactive({ name: '', type: '04' as ItemType, unit: 'un', classId: '' })
const similar = computed(() => similarItems(store.state, draft.name))
watch(() => draft.name, () => { confirmSimilar.value = false })
function openCreate() {
  Object.assign(draft, { name: '', type: listState.type || '04', unit: 'un', classId: classIdFromFilter() })
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
    <div class="file-tabs" role="tablist">
      <button v-for="tab in PRODUCT_LIFE_TABS" :key="tab.id" type="button" role="tab" :aria-selected="listState.life === tab.id" :class="{ active: listState.life === tab.id }" @click="listState.life = tab.id">{{ tab.label }} <b>{{ lifeCounts[tab.id] }}</b></button>
    </div>
    <div class="list-tools">
      <div class="column-menu">
        <button class="button secondary" @click="columnsOpen = !columnsOpen"><Columns3 :size="14" /> Colunas</button>
        <div v-if="columnsOpen" class="menu" @mouseleave="columnsOpen = false">
          <label v-for="column in LIST_COLUMNS" :key="column.id"><input v-model="listState.columns" type="checkbox" :value="column.id" /> {{ column.label }}</label>
        </div>
      </div>
      <button class="button" data-tour="new-record" :disabled="!store.can('produtos.nucleo.gerir')" :title="store.can('produtos.nucleo.gerir') ? '' : 'Seu perfil não permite cadastrar produtos.'" @click="openCreate"><Plus :size="14" /> Novo produto</button>
    </div>

    <div class="type-bar">
      <button type="button" class="chip" :class="{ active: !listState.type }" @click="listState.type = ''">Todos <b>{{ typeCounts.all }}</b></button>
      <button v-for="(label, id) in ITEM_TYPE_LABEL" :key="id" type="button" class="chip" :class="{ active: listState.type === id }" @click="listState.type = id">{{ id }} · {{ label }} <b>{{ typeCounts.counts.get(id) ?? 0 }}</b></button>
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
          <th :class="{ filtering: filled('code') }"><HeaderFilter label="Código" sortable :arrow="arrow('code')" v-bind="filterBindings('code')" @sort="sortBy('code')" /></th>
          <th :class="{ filtering: filled('name') }"><HeaderFilter label="Descrição" sortable :arrow="arrow('name')" v-bind="filterBindings('name')" @sort="sortBy('name')" /></th>
          <th v-if="shown('type')" :class="{ filtering: filled('type') }"><HeaderFilter label="Tipo" list-id="product-type-options" v-bind="filterBindings('type')" /></th>
          <th v-if="shown('class')" :class="{ filtering: filled('class') }"><HeaderFilter label="Classificação" list-id="product-class-options" v-bind="filterBindings('class')" /></th>
          <th v-if="shown('brand')" :class="{ filtering: filled('brand') }"><HeaderFilter label="Marca" list-id="product-brand-options" v-bind="filterBindings('brand')" /></th>
          <th v-if="shown('abc')" :class="{ filtering: filled('abc') }"><HeaderFilter label="ABC" list-id="product-abc-options" v-bind="filterBindings('abc')" /></th>
          <th v-if="shown('price')" :class="{ filtering: filled('price') }"><HeaderFilter label="Preço" v-bind="filterBindings('price')" /></th>
          <th v-if="shown('model')" :class="{ filtering: filled('model') }"><HeaderFilter label="Grade" v-bind="filterBindings('model')" /></th>
          <th v-if="shown('unit')" :class="{ filtering: filled('unit') }"><HeaderFilter label="Un." list-id="product-unit-options" v-bind="filterBindings('unit')" /></th>
          <th v-if="shown('stock')" :class="{ filtering: filled('stock') }"><HeaderFilter label="Saldo" sortable :arrow="arrow('stock')" v-bind="filterBindings('stock')" @sort="sortBy('stock')" /></th>
          <th v-if="shown('ncm')" :class="{ filtering: filled('ncm') }"><HeaderFilter label="NCM" v-bind="filterBindings('ncm')" /></th>
          <th v-if="shown('gtin')" :class="{ filtering: filled('gtin') }"><HeaderFilter label="EAN" v-bind="filterBindings('gtin')" /></th>
          <th v-if="shown('version')" :class="{ filtering: filled('version') }"><HeaderFilter label="Versão" v-bind="filterBindings('version')" /></th>
          <th v-if="shown('updated')" :class="{ filtering: filled('updated') }"><HeaderFilter label="Alterado" sortable :arrow="arrow('updated')" v-bind="filterBindings('updated')" @sort="sortBy('updated')" /></th>
          <th :class="{ filtering: filled('lifecycle') }"><HeaderFilter label="Situação" sortable list-id="product-life-options" :arrow="arrow('lifecycle')" v-bind="filterBindings('lifecycle')" @sort="sortBy('lifecycle')" /></th>
          <th v-if="shown('flags')" :class="{ filtering: filled('flags') }"><HeaderFilter label="Pendências" list-id="product-flag-options" v-bind="filterBindings('flags')" /></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in slice" :key="item.id" class="clickable" :class="{ picked: picked.includes(item.id) }" @click="router.push(`/produtos/item/${item.id}`)">
          <td class="check" @click.stop><input type="checkbox" :checked="picked.includes(item.id)" @change="toggle(item.id)" /></td>
          <td><span class="cell-main code">{{ item.code }}</span></td>
          <td>{{ item.name }}<span v-if="item.variant" class="cell-sub">{{ item.variant }}</span><span v-if="versionNote(item)" class="cell-sub">{{ versionNote(item) }}</span></td>
          <td v-if="shown('type')"><span class="cell-sub">{{ item.type }} · {{ ITEM_TYPE_LABEL[item.type] }}</span></td>
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
    <datalist id="product-type-options"><option v-for="(label, id) in ITEM_TYPE_LABEL" :key="id" :value="label" /></datalist>
    <datalist id="product-class-options"><option v-for="entry in classes" :key="entry.id" :value="entry.label" /></datalist>
    <datalist id="product-brand-options"><option v-for="brand in brands" :key="brand" :value="brand" /><option v-for="category in categories" :key="category" :value="category" /></datalist>
    <datalist id="product-abc-options"><option value="A" /><option value="B" /><option value="C" /></datalist>
    <datalist id="product-unit-options"><option v-for="unit in units" :key="unit" :value="unit" /></datalist>
    <datalist id="product-life-options"><option v-for="step in LIFECYCLE" :key="step" :value="step" /></datalist>
    <datalist id="product-flag-options"><option v-for="flag in FLAGS" :key="flag" :value="flag" /></datalist>
    <p v-if="!filtered.length" class="empty-note">Nenhum produto com esses filtros.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>

  <ReasonModal :open="askReason !== ''" :title="askReason === 'block' ? `Bloquear ${picked.length === 1 ? '1 produto' : `${picked.length} produtos`}` : `Obsoletar ${picked.length === 1 ? '1 produto' : `${picked.length} produtos`}`"
    subtitle="Cada produto passa pelas mesmas regras da tela individual. Os que não puderem mudar voltam com o motivo." :tone="askReason === 'block' ? 'danger' : 'warning'"
    :confirm="askReason === 'block' ? 'Bloquear' : 'Obsoletar'" @close="askReason = ''" @confirm="reason => askReason && bulk(askReason, reason)" />

  <BaseModal :open="creating" title="Novo produto" subtitle="Nasce em rascunho. Rascunho não entra em pedido, compra nem produção." @close="creating = false">
    <form id="new-item" @submit.prevent="create">
      <div class="field"><label>Descrição</label><input v-model="draft.name" required minlength="3" placeholder="Ex.: ABS cinza UV" /></div>
      <div class="form-grid">
        <div class="field"><label>Tipo</label><select v-model="draft.type"><option v-for="(label, id) in ITEM_TYPE_LABEL" :key="id" :value="id">{{ id }} · {{ label }}</option></select></div>
        <div class="field"><label>Unidade base</label><input v-model="draft.unit" required /></div>
      </div>
      <div class="field"><label>Classificação</label>
        <select v-model="draft.classId" required><option value="" disabled>Escolha um nó</option><option v-for="entry in classes" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
        <small>O código sai sequencial e sem significado. A classificação é que organiza.</small>
      </div>
      <div v-if="similar.length" class="notice warning">
        <b>Produtos parecidos já cadastrados:</b>
        <div v-for="entry in similar" :key="entry.id">{{ entry.code }} · {{ entry.name }} ({{ catalogOf(entry).lifecycle }})</div>
        <span v-if="confirmSimilar">Confirme que é outro produto para continuar.</span>
      </div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="creating = false">Cancelar</button>
      <button class="button" type="submit" form="new-item">{{ confirmSimilar ? 'É outro produto, criar' : 'Criar rascunho' }}</button>
    </template>
  </BaseModal>
</template>
