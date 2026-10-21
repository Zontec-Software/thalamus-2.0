<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ClipboardCheck, PackageCheck, Truck } from 'lucide-vue-next'
import BaseModal from '../components/BaseModal.vue'
import { stockable } from '../domain/catalog'
import { useErpStore } from '../stores/erp'
import type { Item, ItemType } from '../types/domain'
import { fmtDateTime, fmtNumber } from '../utils/format'

const store = useErpStore()
const route = useRoute()
const type = ref<ItemType | ''>('')
const query = ref('')
const counting = ref<Item | null>(null)
const counted = ref(0)
const reason = ref('Inventário rotativo')

watch(() => route.query.item, value => {
  const item = store.state.items.find(entry => entry.id === value)
  if (item) query.value = item.code
}, { immediate: true })

const items = computed(() => store.state.items.filter(item =>
  stockable(item) &&
  (!type.value || item.type === type.value) &&
  (!query.value || `${item.code} ${item.name}`.toLowerCase().includes(query.value.toLowerCase()))))
const picking = computed(() => store.state.productionOrders.filter(op => op.status === 'Planejada'))
const released = computed(() => store.state.productionOrders.filter(op => op.status === 'Liberada' && op.operations.every(operation => operation.status === 'Aguardando' || operation.status === 'Disponível')))
const receiving = computed(() => store.state.requisitions.filter(req => req.status === 'Pedido emitido'))

function openCount(item: Item) {
  counting.value = item
  counted.value = item.stock
}

function saveCount() {
  if (!counting.value) return
  const result = store.adjustStock(counting.value.id, counted.value, reason.value)
  if (result !== undefined) counting.value = null
}
</script>

<template>
  <section class="grid-equal">
    <article class="card" data-tour="picking">
      <div class="section-head"><div><h2>Separação de kits para OPs</h2><p>Materiais já reservados; ao separar, a OP é liberada no tablet do posto</p></div><PackageCheck :size="20" /></div>
      <p v-if="!picking.length" class="empty-note">Nenhuma OP aguardando separação.</p>
      <div v-for="op in picking" :key="op.id" class="list-row static" style="align-items:flex-start">
        <div>
          <strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }} · {{ op.quantity }} un.</strong>
          <span>Destino: {{ store.resourceName(op.resourceId) }} · pedido {{ op.salesOrderId }}</span>
          <span v-for="line in op.materials" :key="line.itemId">• {{ fmtNumber(line.required, 2) }} {{ store.item(line.itemId).unit }} {{ store.item(line.itemId).name }} <em class="cell-sub" style="display:inline">({{ store.item(line.itemId).location }})</em></span>
        </div>
        <button class="button small" @click="store.pickOp(op.id)">Confirmar separação</button>
      </div>
      <h3 v-if="released.length" class="drawer-title">Kits liberados, ainda não iniciados</h3>
      <div v-for="op in released" :key="op.id" class="list-row static">
        <div><strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }}</strong><span>É possível devolver o kit enquanto nenhuma operação começou.</span></div>
        <button class="button secondary small" @click="store.undoPick(op.id)">Desfazer separação</button>
      </div>
    </article>

    <article class="card">
      <div class="section-head"><div><h2>Recebimentos previstos</h2><p>Pedidos de compra emitidos no Omie</p></div><Truck :size="20" /></div>
      <p v-if="!receiving.length" class="empty-note">Nenhum recebimento previsto.</p>
      <div v-for="req in receiving" :key="req.id" class="list-row static">
        <div><strong>{{ req.omiePo }} · {{ store.item(req.itemId).name }}</strong><span>{{ req.quantity }} {{ store.item(req.itemId).unit }} · {{ req.supplier }} · {{ req.origin }}</span></div>
        <button class="button small" @click="store.advanceRequisition(req.id)">Receber</button>
      </div>
      <h3 class="drawer-title">Últimas movimentações</h3>
      <div v-for="movement in store.state.movements.slice(0, 6)" :key="movement.id" class="kv">
        <span>{{ fmtDateTime(movement.at) }} · {{ movement.type }} · {{ movement.reference }}</span>
        <b :class="{ 'risk-text': movement.type === 'Saída' || movement.quantity < 0 }">{{ movement.type === 'Saída' ? '−' : '+' }}{{ fmtNumber(Math.abs(movement.quantity), 2) }} {{ store.item(movement.itemId).code }}</b>
      </div>
    </article>
  </section>

  <article class="card flush" data-tour="stock-table">
    <div class="section-head">
      <div><h2>Saldos de estoque</h2><p>Físico, reservado para OPs e disponível para novos pedidos</p></div>
      <div class="filter-row">
        <input v-model="query" class="filter" placeholder="Buscar item…" />
        <select v-model="type" class="filter"><option value="">Todos os tipos</option><option value="PA">Acabados</option><option value="SE">Injetados</option><option value="MP">Matérias-primas</option><option value="CP">Componentes</option><option value="EM">Embalagens</option></select>
      </div>
    </div>
    <table style="margin-top:12px">
      <thead><tr><th>Item</th><th>Local</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Em compra</th><th>Mínimo</th><th></th></tr></thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td><span class="cell-main code">{{ item.code }}</span><span class="cell-sub">{{ store.itemLabel(item.id) }}</span></td>
          <td>{{ item.location }}</td>
          <td>{{ fmtNumber(item.stock, 2) }} {{ item.unit }}</td>
          <td>{{ fmtNumber(store.reserved(item.id), 2) }}</td>
          <td><strong :class="{ 'risk-text': store.available(item.id) < item.minimum }">{{ fmtNumber(store.available(item.id), 2) }}</strong></td>
          <td>{{ store.incoming(item.id) || '—' }}</td>
          <td>{{ item.minimum || '—' }}</td>
          <td><button class="button secondary small" @click="openCount(item)"><ClipboardCheck :size="13" /> Inventariar</button></td>
        </tr>
      </tbody>
    </table>
  </article>

  <BaseModal :open="!!counting" :title="`Inventário · ${counting?.code}`" :subtitle="counting?.name" @close="counting = null">
    <template v-if="counting">
      <div class="mini-stats" style="margin-bottom:14px">
        <div class="mini-stat"><strong>{{ fmtNumber(counting.stock, 2) }}</strong><span>saldo no sistema</span></div>
        <div class="mini-stat"><strong>{{ fmtNumber(store.reserved(counting.id), 2) }}</strong><span>reservado</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': counted - counting.stock < 0 }">{{ counted - counting.stock > 0 ? '+' : '' }}{{ fmtNumber(counted - counting.stock, 2) }}</strong><span>diferença</span></div>
      </div>
      <div class="field"><label>Quantidade contada ({{ counting.unit }})</label><input v-model.number="counted" type="number" min="0" step="0.01" /></div>
      <div class="field"><label>Motivo</label><select v-model="reason"><option>Inventário rotativo</option><option>Avaria</option><option>Erro de apontamento</option><option>Devolução ao fornecedor</option></select><small>O ajuste é enviado ao Omie com o motivo e fica no histórico do item.</small></div>
    </template>
    <template #footer><button class="button secondary" @click="counting = null">Cancelar</button><button class="button" @click="saveCount">Confirmar ajuste</button></template>
  </BaseModal>
</template>
