<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { catalogOf, layersOf } from '../../domain/catalog'
import { useErpStore } from '../../stores/erp'
import { fmtNumber } from '../../utils/format'
import TablePager from './TablePager.vue'
import { usePager } from './shared'

const store = useErpStore()
const router = useRouter()
const query = ref('')
const control = ref<'' | 'lot' | 'expiry' | 'serial' | 'allowNegative'>('')
const belowMinimum = ref(false)

const rows = computed(() => store.state.items.filter(item => {
  const catalog = catalogOf(item)
  if (catalog.deletedAt || !layersOf(item).includes('estoque')) return false
  if (control.value && !catalog[control.value]) return false
  if (belowMinimum.value && store.available(item.id) >= item.minimum) return false
  return !query.value || `${item.code} ${item.name} ${item.location}`.toLowerCase().includes(query.value.toLowerCase())
}))
const { page, size, pages, slice, range } = usePager(rows)
const nextExpiry = (id: string) => store.state.items.find(item => item.id === id)?.lots?.filter(lot => lot.quantity > 0 && lot.expiry).map(lot => lot.expiry!).sort()[0]
</script>

<template>
  <article class="card flush">
    <div class="section-head"><div><h2>Estoque, unidades e lotes</h2><p>Serviço, kit virtual e imobilizado não aparecem. Validade ligada aplica FEFO na separação.</p></div></div>
    <div class="list-meta">
      <div class="filter-row">
        <input v-model="query" class="filter" placeholder="Código, descrição ou endereço" />
        <select v-model="control" class="filter">
          <option value="">Qualquer controle</option><option value="lot">Controla lote</option><option value="expiry">Controla validade</option>
          <option value="serial">Controla serial</option><option value="allowNegative">Permite negativo</option>
        </select>
        <label class="filter-row"><input v-model="belowMinimum" type="checkbox" /> Disponível abaixo do mínimo</label>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Produto</th><th>Endereço</th><th>Saldo</th><th>Disponível</th><th>Mínimo</th><th>Controles</th><th>Próx. validade</th><th>Conversões</th><th>Filiais</th></tr></thead>
      <tbody>
        <tr v-for="item in slice" :key="item.id" class="clickable" @click="router.push({ path: `/produtos/item/${item.id}`, query: { aba: 'estoque' } })">
          <td><span class="cell-main code">{{ item.code }}</span><span class="cell-sub">{{ item.name }}</span></td>
          <td>{{ item.location }}</td>
          <td>{{ fmtNumber(item.stock, 2) }} {{ item.unit }}</td>
          <td :style="store.available(item.id) < item.minimum ? 'color:#a4442d;font-weight:700' : ''">{{ fmtNumber(store.available(item.id), 2) }}</td>
          <td>{{ item.minimum }}</td>
          <td><div class="flag-list">
            <span v-if="catalogOf(item).lot" class="status info">Lote</span>
            <span v-if="catalogOf(item).expiry" class="status warning">Validade</span>
            <span v-if="catalogOf(item).serial" class="status neutral">Serial</span>
            <span v-if="catalogOf(item).allowNegative" class="status danger">Negativo</span>
          </div></td>
          <td><span class="cell-sub">{{ nextExpiry(item.id) ?? '—' }}</span></td>
          <td><span class="cell-sub">{{ catalogOf(item).conversions.map(entry => `${entry.unit} (${entry.context})`).join(', ') || '—' }}</span></td>
          <td>{{ catalogOf(item).branches.filter(entry => entry.enabled).length }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Nenhum item com esse filtro.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>
</template>
