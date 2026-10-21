<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ShieldCheck, ShieldX } from 'lucide-vue-next'
import BaseModal from '../components/BaseModal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { SCRAP_REASONS } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { NonConformity, ProductionOrder } from '../types/domain'
import { fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const checks = reactive<Record<string, boolean[]>>({})
const rejecting = ref<ProductionOrder | null>(null)
const reject = ref({ quantity: 1, reason: SCRAP_REASONS[3] })
const analyzing = ref<NonConformity | null>(null)
const action = ref('')

const inspections = computed(() => store.state.productionOrders.filter(op => op.status === 'Inspeção'))
const checklist = (op: ProductionOrder) => {
  const product = store.item(op.itemId)
  const list = ['Dimensional e encaixe do tablet', 'Acabamento visual sem riscos ou rebarbas', 'Fixação de parafusos e película', 'Etiqueta de lote e embalagem']
  if (product.routing?.some(step => step.name.includes('elétrica'))) list.push('Teste de carregamento (amostra de 5 un.)')
  if (product.routing?.some(step => step.name.includes('Vedação'))) list.push('Teste de estanqueidade IP65 (amostra)')
  return list
}
const stateOf = (op: ProductionOrder) => (checks[op.id] ??= checklist(op).map(() => false))
const ready = (op: ProductionOrder) => stateOf(op).every(Boolean)

function approve(op: ProductionOrder) {
  if (!ready(op)) return ui.notify('error', 'Checklist incompleto', 'Marque todos os itens antes de aprovar')
  store.approveInspection(op.id)
}

function confirmReject() {
  if (!rejecting.value) return
  if (store.rejectInspection(rejecting.value.id, reject.value.quantity, reject.value.reason)) rejecting.value = null
}

function saveAnalysis(close: boolean) {
  if (!analyzing.value) return
  if (!action.value.trim()) return ui.notify('error', 'Descreva a ação corretiva')
  store.updateNc(analyzing.value.id, close ? 'Encerrada' : 'Em análise', action.value)
  analyzing.value = null
}
</script>

<template>
  <div class="toolbar"><p>Inspeção final por lote com checklist do produto; reprovação gera não conformidade e retrabalho automaticamente</p></div>

  <section class="grid-3" data-tour="inspections">
    <article v-for="op in inspections" :key="op.id" class="inspection-card">
      <StatusBadge value="Inspeção" />
      <h3>{{ op.id }} · {{ op.quantity }} un.</h3>
      <p>{{ store.itemLabel(op.itemId) }} · pedido {{ op.salesOrderId }}</p>
      <ul class="checklist">
        <li v-for="(item, index) in checklist(op)" :key="item"><input v-model="stateOf(op)[index]" type="checkbox" /> {{ item }}</li>
      </ul>
      <div class="filter-row">
        <button class="button" :disabled="!ready(op)" @click="approve(op)"><ShieldCheck :size="14" /> Aprovar lote</button>
        <button class="button danger" @click="rejecting = op; reject = { quantity: 1, reason: SCRAP_REASONS[3] }"><ShieldX :size="14" /> Reprovar</button>
      </div>
    </article>
    <article v-if="!inspections.length" class="card" style="grid-column: 1 / -1"><p class="empty-note">Nenhum lote aguardando inspeção. Lotes aparecem aqui quando a última etapa de montagem é concluída no tablet.</p></article>
  </section>

  <article class="card flush" data-tour="nc-table">
    <div class="section-head"><div><h2>Não conformidades</h2><p>Registro, análise de causa e ação corretiva</p></div></div>
    <table>
      <thead><tr><th>NC</th><th>OP / item</th><th>Qtd.</th><th>Problema</th><th>Ação corretiva</th><th>Aberta em</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="nc in store.state.nonConformities" :key="nc.id">
          <td><span class="cell-main">{{ nc.id }}</span></td>
          <td>{{ nc.opId }}<span class="cell-sub">{{ store.itemLabel(nc.itemId) }}</span></td>
          <td>{{ nc.quantity }}</td>
          <td>{{ nc.reason }}</td>
          <td>{{ nc.action ?? '—' }}</td>
          <td>{{ fmtDateTime(nc.createdAt) }}</td>
          <td><StatusBadge :value="nc.status" /></td>
          <td><button v-if="nc.status !== 'Encerrada'" class="button secondary small" @click="analyzing = nc; action = nc.action ?? ''">Tratar</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!store.state.nonConformities.length" class="empty-note">Nenhuma não conformidade registrada.</p>
  </article>

  <BaseModal :open="!!rejecting" :title="`Reprovar ${rejecting?.id}`" subtitle="As unidades reprovadas voltam para a montagem como retrabalho" @close="rejecting = null">
    <div class="form-grid">
      <div class="field"><label>Unidades reprovadas</label><input v-model.number="reject.quantity" type="number" min="1" :max="rejecting?.quantity" /></div>
      <div class="field"><label>Defeito</label><select v-model="reject.reason"><option v-for="reason in SCRAP_REASONS" :key="reason">{{ reason }}</option></select></div>
    </div>
    <template #footer><button class="button secondary" @click="rejecting = null">Cancelar</button><button class="button danger" @click="confirmReject">Reprovar e abrir NC</button></template>
  </BaseModal>

  <BaseModal :open="!!analyzing" :title="`Tratar ${analyzing?.id}`" :subtitle="analyzing ? `${analyzing.reason} · ${analyzing.quantity} un. · ${analyzing.opId}` : ''" @close="analyzing = null">
    <div class="field"><label>Causa e ação corretiva</label><textarea v-model="action" rows="4" placeholder="Ex.: ajustar pressão de recalque da injetora 02 e reforçar inspeção da primeira peça"></textarea></div>
    <template #footer>
      <button class="button secondary" @click="saveAnalysis(false)">Salvar em análise</button>
      <button class="button" @click="saveAnalysis(true)">Encerrar NC</button>
    </template>
  </BaseModal>
</template>
