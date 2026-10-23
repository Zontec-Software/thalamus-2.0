<script setup lang="ts">
import { computed, ref } from 'vue'
import { GitBranch, Pencil } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import { changeImpact } from '../../domain/engineering'
import { useErpStore } from '../../stores/erp'
import type { ChangeStage, EngineeringChange } from '../../types/domain'
import { fmtCurrency, fmtDateTime, fmtNumber } from '../../utils/format'
import ChangeFormModal from './ChangeFormModal.vue'
import ReasonModal from './ReasonModal.vue'

const props = defineProps<{ change: EngineeringChange }>()
const store = useErpStore()
const impact = computed(() => changeImpact(store.state, props.change))
const closed = computed(() => props.change.stage === 'Implementada' || props.change.stage === 'Recusada')
const editing = ref(false)
const refusing = ref(false)

interface StageAction { to: ChangeStage; label: string; secondary?: boolean }
const actions = computed<StageAction[]>(() => {
  switch (props.change.stage) {
    case 'Solicitada': return [{ to: 'Em análise', label: 'Iniciar análise' }]
    case 'Em análise': return [{ to: 'Aprovada', label: 'Aprovar' }, { to: 'Solicitada', label: 'Devolver', secondary: true }]
    case 'Aprovada': return [{ to: 'Implementada', label: 'Implementar e liberar versões' }, { to: 'Em análise', label: 'Voltar para análise', secondary: true }]
    default: return []
  }
})
const draftOf = (itemId: string) => store.state.productRevisions.find(entry => entry.itemId === itemId && entry.status === 'Rascunho')
const releasedOf = (itemId: string) => store.state.productRevisions.find(entry => entry.itemId === itemId && entry.changeId === props.change.id && entry.status !== 'Rascunho')
const STAGE_TONE: Record<ChangeStage, string> = { Solicitada: 'neutral', 'Em análise': 'info', Aprovada: 'warning', Implementada: 'success', Recusada: 'danger' }
</script>

<template>
  <div class="change-detail">
    <div class="section-head" style="margin-top:0">
      <div>
        <span class="eyebrow">{{ change.id }} · {{ change.priority }}</span>
        <h3 style="margin:2px 0 4px">{{ change.title }}</h3>
        <p>{{ change.reason }}</p>
      </div>
      <StatusBadge :value="change.stage" :tone="STAGE_TONE[change.stage]" />
    </div>
    <div class="meta-line">
      <span>Pedida por <b>{{ change.requestedBy }}</b> em {{ fmtDateTime(change.requestedAt) }}</span>
      <span>Estoque atual: <b>{{ change.disposition }}</b></span>
      <span>Efetiva em <b>{{ change.effectiveDate.split('-').reverse().join('/') }}</b></span>
      <span v-if="change.approvedBy">Aprovada por <b>{{ change.approvedBy }}</b></span>
    </div>

    <h4 class="drawer-title">Impacto hoje</h4>
    <table class="dense">
      <thead><tr><th>Item</th><th>Saldo</th><th>OPs abertas</th><th>Pedidos</th><th>Compras</th><th>Usado em</th><th>Versão</th></tr></thead>
      <tbody>
        <tr v-for="row in impact" :key="row.item.id">
          <td><RouterLink :to="`/produtos/item/${row.item.id}?aba=manufatura`" class="cell-main code">{{ row.item.code }}</RouterLink><span class="cell-sub">{{ row.item.name }}</span></td>
          <td>{{ fmtNumber(row.stock, 2) }} {{ row.item.unit }}<span v-if="row.stockValue" class="cell-sub">{{ fmtCurrency(row.stockValue) }}</span></td>
          <td :class="{ warn: row.openOps.length }">{{ row.openOps.length }}<span v-if="row.openOps.length" class="cell-sub">{{ row.openOps.slice(0, 3).map(op => op.id).join(', ') }}</span></td>
          <td :class="{ warn: row.openOrders.length }">{{ row.openOrders.length }}</td>
          <td>{{ row.openPurchases.length }}</td>
          <td>{{ row.parents.length }}<span v-if="row.parents.length" class="cell-sub">{{ row.parents.slice(0, 3).map(parent => parent.code).join(', ') }}</span></td>
          <td>
            <template v-if="releasedOf(row.item.id)"><span class="status success">{{ releasedOf(row.item.id)!.code }} liberada</span></template>
            <template v-else-if="row.item.type === 'FE'"><RouterLink :to="`/produtos/item/${row.item.id}?aba=ferramental`" class="cell-sub">ajustar no ferramental</RouterLink></template>
            <template v-else-if="draftOf(row.item.id)?.changeId === change.id"><RouterLink :to="`/produtos/item/${row.item.id}?aba=manufatura`" class="status warning">{{ draftOf(row.item.id)!.code }} em rascunho</RouterLink></template>
            <template v-else-if="draftOf(row.item.id)"><span class="cell-sub">rascunho {{ draftOf(row.item.id)!.code }} de {{ draftOf(row.item.id)!.changeId ?? 'outra alteração' }}</span><button v-if="!draftOf(row.item.id)!.changeId && !closed" class="button ghost small" @click="store.openChangeRevision(change.id, row.item.id)">Vincular</button></template>
            <button v-else-if="!closed && change.stage !== 'Solicitada'" class="button secondary small" @click="store.openChangeRevision(change.id, row.item.id)"><GitBranch :size="12" /> Abrir versão</button>
            <span v-else class="cell-sub">—</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="cell-sub">Na aprovação, cada item com estrutura precisa da sua versão em rascunho. Ao implementar, todas são liberadas juntas na data de efetividade.</p>

    <div v-if="!closed" class="filter-row" style="margin-top:10px">
      <button v-for="action in actions" :key="action.to" class="button small" :class="{ secondary: action.secondary }" @click="store.moveChange(change.id, action.to, '')">{{ action.label }}</button>
      <button class="button ghost small" @click="editing = true"><Pencil :size="12" /> Editar</button>
      <button class="button ghost small danger-text" @click="refusing = true">Recusar</button>
    </div>

    <h4 class="drawer-title">Histórico</h4>
    <div v-for="(entry, index) in change.history" :key="index" class="list-row static">
      <div><strong>{{ entry.text }}</strong><span>{{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div>
    </div>

    <ChangeFormModal :open="editing" :change="change" @close="editing = false" />
    <ReasonModal :open="refusing" :title="`Recusar ${change.id}`" tone="danger" confirm="Recusar" @close="refusing = false" @confirm="reason => { if (store.moveChange(change.id, 'Recusada', reason) !== undefined) refusing = false }" />
  </div>
</template>
