<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '../../components/StatusBadge.vue'
import { ITEM_TYPE_LABEL, catalogOf, layersOf } from '../../domain/catalog'
import { useErpStore } from '../../stores/erp'
import TablePager from './TablePager.vue'
import { LIFE_TONE, usePager } from './shared'

const store = useErpStore()
const router = useRouter()
const query = ref('')
const type = ref('')
const onlyDraft = ref(false)

const rows = computed(() => store.state.items.filter(item => {
  if (catalogOf(item).deletedAt || !layersOf(item).includes('manufatura')) return false
  if (type.value && item.type !== type.value) return false
  if (onlyDraft.value && !store.state.productRevisions.some(entry => entry.itemId === item.id && entry.status === 'Rascunho')) return false
  return !query.value || `${item.code} ${item.name}`.toLowerCase().includes(query.value.toLowerCase())
}).map(item => {
  const versions = store.state.productRevisions.filter(entry => entry.itemId === item.id)
  return {
    item,
    current: versions.find(entry => entry.status === 'Liberada'),
    draft: versions.find(entry => entry.status === 'Rascunho'),
    count: versions.length,
    ops: store.state.productionOrders.filter(op => op.itemId === item.id && op.status !== 'Concluída').length,
  }
}))
const { page, size, pages, slice, range } = usePager(rows)
</script>

<template>
  <article class="card flush">
    <div class="section-head"><div><h2>Estruturas e versões</h2><p>Cada alteração nasce como versão nova, com vigência. A OP grava a versão com que foi aberta.</p></div></div>
    <div class="list-meta">
      <div class="filter-row">
        <input v-model="query" class="filter" placeholder="Código ou descrição" />
        <select v-model="type" class="filter"><option value="">Todos os tipos</option><option v-for="id in ['PA', 'SE', 'KF', 'KT']" :key="id" :value="id">{{ ITEM_TYPE_LABEL[id as 'PA'] }}</option></select>
        <label class="filter-row"><input v-model="onlyDraft" type="checkbox" /> Só com versão em rascunho</label>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Produto</th><th>Situação</th><th>Versão vigente</th><th>Vigência</th><th>Componentes</th><th>Rascunho</th><th>OPs abertas</th></tr></thead>
      <tbody>
        <tr v-for="row in slice" :key="row.item.id" class="clickable" @click="router.push({ path: `/produtos/item/${row.item.id}`, query: { aba: 'manufatura' } })">
          <td><span class="cell-main code">{{ row.item.code }}</span><span class="cell-sub">{{ row.item.name }}</span></td>
          <td><StatusBadge :value="catalogOf(row.item).lifecycle" :tone="LIFE_TONE[catalogOf(row.item).lifecycle]" /></td>
          <td>{{ row.current?.code ?? '—' }} <span class="cell-sub">{{ row.count }} versão(ões) no histórico</span></td>
          <td><span class="cell-sub">{{ row.current?.validFrom ? `desde ${row.current.validFrom}` : 'Sem versão liberada' }}</span></td>
          <td>{{ row.item.bom?.length ?? 0 }}</td>
          <td><span v-if="row.draft" class="status info">Versão {{ row.draft.code }}</span><span v-else class="cell-sub">—</span></td>
          <td>{{ row.ops }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Nenhuma estrutura com esse filtro.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>
</template>
