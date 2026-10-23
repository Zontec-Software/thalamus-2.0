<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarClock, Gauge, Plus, Wrench } from 'lucide-vue-next'
import BaseModal from '../components/BaseModal.vue'
import MetricCard from '../components/MetricCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { MaintenanceOrder } from '../types/domain'
import { daysUntil, fmtCurrency, fmtDate, fmtDateTime, fmtNumber } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const creating = ref(false)
const form = ref<{ assetId: string; type: MaintenanceOrder['type']; description: string; estimatedCost: number; budgetCategoryId: string; budgetPeriod: string }>({ assetId: '', type: 'Corretiva', description: '', estimatedCost: 1500, budgetCategoryId: 'BC-OPER', budgetPeriod: '2026-10' })

const assetName = (id: string) => store.state.assets.find(asset => asset.id === id)?.name ?? id
const open = computed(() => store.state.maintenanceOrders.filter(order => order.status !== 'Concluída'))
const canAct = computed(() => ['Administrador', 'Gestor', 'Manutenção', 'Líder de produção'].includes(ui.role))
const assets = computed(() => store.state.assets.map(asset => ({
  ...asset,
  days: daysUntil(asset.nextPreventive),
  openOrders: store.state.maintenanceOrders.filter(order => order.assetId === asset.id && order.status !== 'Concluída').length,
})))
const downtimeHours = computed(() => {
  const ms = store.state.downtimes.filter(entry => entry.reason === 'Quebra de máquina').reduce((sum, entry) => sum + ((entry.end ? new Date(entry.end).getTime() : ui.tick) - new Date(entry.start).getTime()), 0)
  return (ms / 3_600_000).toFixed(1)
})

function openNew() {
  form.value = { assetId: store.state.assets[0]?.id ?? '', type: 'Corretiva', description: '', estimatedCost: 1500, budgetCategoryId: 'BC-OPER', budgetPeriod: new Date().toISOString().slice(0, 7) }
  creating.value = true
}

function save() {
  if (!form.value.description.trim()) return ui.notify('error', 'Descreva o problema ou o serviço')
  if (store.createMaintenance(form.value.assetId, form.value.type, form.value.description, form.value.estimatedCost, form.value.budgetCategoryId, form.value.budgetPeriod)) creating.value = false
}

function requestPart(order: MaintenanceOrder) {
  store.createDemand({
    kind: 'Material', itemId: 'cp-paraf', description: `Kit de reparo para ${order.id}`, quantity: 12,
    origin: 'Manutenção', originId: order.id, neededBy: '2026-10-17', priority: order.type === 'Corretiva' ? 'Urgente' : 'Normal', assigneeRole: 'Compras',
  })
}
</script>

<template>
  <div class="toolbar">
    <p>Corretivas abertas pelo tablet do operador (parada por quebra) e preventivas por calendário ou contador de golpes do molde</p>
    <button class="button" @click="openNew"><Plus :size="15" /> Nova ordem de manutenção</button>
  </div>

  <section class="metrics">
    <MetricCard label="OS abertas" :value="open.length" :detail="`${open.filter(order => order.type === 'Corretiva').length} corretiva(s)`" :icon="Wrench" />
    <MetricCard label="Preventivas em 7 dias" :value="assets.filter(asset => asset.days <= 7).length" detail="Por calendário ou golpes" :icon="CalendarClock" />
    <MetricCard label="Horas paradas por quebra" :value="downtimeHours" detail="Registradas no tablet" :icon="Gauge" />
    <MetricCard label="Equipamentos" :value="store.state.assets.length" detail="Injetoras, moldes e bancadas" :icon="Wrench" />
  </section>

  <article class="card flush" data-tour="maintenance-list">
    <div class="section-head"><div><h2>Ordens de manutenção</h2><p>Enquanto a corretiva estiver aberta, o tablet bloqueia o início de produção na máquina</p></div></div>
    <table>
      <thead><tr><th>OS</th><th>Equipamento</th><th>Tipo</th><th>Descrição</th><th>Orçamento</th><th>Origem</th><th>Aberta em</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="order in store.state.maintenanceOrders" :key="order.id">
          <td><span class="cell-main">{{ order.id }}</span></td>
          <td>{{ assetName(order.assetId) }}</td>
          <td><StatusBadge :value="order.type" :tone="order.type === 'Corretiva' ? 'danger' : 'info'" /></td>
          <td>{{ order.description }}</td>
          <td>{{ fmtCurrency(order.estimatedCost ?? 0) }}<span class="cell-sub">{{ store.state.budgetCategories.find(entry => entry.id === order.budgetCategoryId)?.name }} · {{ order.budgetPeriod }}</span></td>
          <td>{{ order.origin }}</td>
          <td>{{ fmtDateTime(order.createdAt) }}</td>
          <td><StatusBadge :value="order.status" /></td>
          <td><div class="action-row">
            <button v-if="order.status === 'Aberta'" class="button ghost small" @click="requestPart(order)">Solicitar peça</button>
            <button v-if="order.status !== 'Concluída'" class="button secondary small" :disabled="!canAct" :title="canAct ? '' : 'Ação da manutenção'" @click="store.advanceMaintenance(order.id)">
              {{ order.status === 'Aberta' ? 'Iniciar' : 'Concluir e liberar' }}
            </button>
          </div></td>
        </tr>
      </tbody>
    </table>
  </article>

  <article class="card flush" data-tour="assets">
    <div class="section-head"><div><h2>Equipamentos e moldes</h2><p>Plano preventivo e contador de golpes</p></div></div>
    <table>
      <thead><tr><th>Equipamento</th><th>Tipo</th><th>Local</th><th>Golpes</th><th>Próxima preventiva</th><th>OS abertas</th></tr></thead>
      <tbody>
        <tr v-for="asset in assets" :key="asset.id">
          <td><span class="cell-main">{{ asset.name }}</span></td>
          <td>{{ asset.kind }}</td>
          <td>{{ asset.resourceId ? store.resourceName(asset.resourceId) : 'Ferramentaria' }}</td>
          <td>{{ asset.shots ? fmtNumber(asset.shots) : '—' }}</td>
          <td :class="{ 'risk-text': asset.days <= 3 }">{{ fmtDate(asset.nextPreventive) }}<span class="cell-sub">{{ asset.days < 0 ? `${-asset.days} dia(s) atrasada` : `em ${asset.days} dia(s)` }}</span></td>
          <td>{{ asset.openOrders || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </article>

  <BaseModal :open="creating" title="Nova ordem de manutenção" @close="creating = false">
    <div class="form-grid">
      <div class="field"><label>Equipamento</label><select v-model="form.assetId"><option v-for="asset in store.state.assets" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select></div>
      <div class="field"><label>Tipo</label><select v-model="form.type"><option>Corretiva</option><option>Preventiva</option></select></div>
      <div class="field"><label>Custo estimado</label><input v-model.number="form.estimatedCost" type="number" min="0" /></div>
      <div class="field"><label>Categoria</label><select v-model="form.budgetCategoryId"><option v-for="entry in store.state.budgetCategories.filter(category => category.tenantId === ui.activeTenantId && category.status !== 'Inativa')" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option></select></div>
      <div class="field"><label>Período</label><input v-model="form.budgetPeriod" type="month" /></div>
    </div>
    <div class="field"><label>Descrição</label><textarea v-model="form.description" rows="3" placeholder="Ex.: vazamento de óleo no cilindro de fechamento"></textarea></div>
    <template #footer><button class="button secondary" @click="creating = false">Cancelar</button><button class="button" @click="save">Abrir OS</button></template>
  </BaseModal>
</template>
