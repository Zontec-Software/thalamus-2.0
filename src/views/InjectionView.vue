<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Tablet, Wrench } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { elapsedMs, openCorrective } from '../domain/engine'
import { showOnFloor } from '../domain/resources'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtDateTime, fmtDuration } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const machines = computed(() => store.state.resources.filter(resource => resource.tenantId === ui.activeTenantId && resource.kind === 'Injetora' && showOnFloor(store.state, resource)).map(resource => {
  const active = store.state.productionOrders.find(op => op.kind === 'Injeção' && op.resourceId === resource.id && ['Em produção', 'Liberada'].includes(op.status))
  const operation = active?.operations[0]
  const part = active ? store.item(active.itemId) : undefined
  const queue = store.state.productionOrders.filter(op => op.kind === 'Injeção' && op.resourceId === resource.id && op.id !== active?.id && op.status !== 'Concluída')
  const maintenance = openCorrective(store.state, resource.id)
  const scrapRate = operation && operation.good + operation.scrap > 0 ? operation.scrap / (operation.good + operation.scrap) * 100 : 0
  return { resource, state: store.machineState(resource.id), active, operation, part, queue, maintenance, scrapRate }
}))

const downtimes = computed(() => store.state.downtimes.filter(entry => store.state.resources.find(resource => resource.id === entry.resourceId)?.kind === 'Injetora').slice(0, 8))
const duration = (start: string, end?: string) => fmtDuration((end ? new Date(end).getTime() : ui.tick) - new Date(start).getTime())
</script>

<template>
  <div class="toolbar">
    <p>Painel em tempo real alimentado pelos tablets das injetoras. Pode ser exibido em TV no setor.</p>
    <RouterLink class="button" to="/tablet"><Tablet :size="15" /> Apontar pelo tablet</RouterLink>
  </div>

  <section class="machine-cards" data-tour="machine-cards">
    <article v-for="machine in machines" :key="machine.resource.id" class="machine-card" :class="machine.state">
      <header><div><strong>{{ machine.resource.name }}</strong><small>{{ machine.part ? store.state.assets.find(asset => asset.id === machine.part!.moldId)?.name : 'Sem molde montado' }}</small></div><StatusBadge :value="machine.state" /></header>
      <div class="body">
        <template v-if="machine.maintenance">
          <div class="callout warn"><Wrench :size="18" /><div><strong>{{ machine.maintenance.id }} · {{ machine.maintenance.status }}</strong>{{ machine.maintenance.description }}</div></div>
        </template>
        <template v-if="machine.active && machine.operation">
          <div class="kv"><span>OP / pedido</span><button class="link" @click="ui.opDrawer = machine.active.id">{{ machine.active.id }} · {{ machine.active.salesOrderId }}</button></div>
          <div class="kv"><span>Peça</span><b>{{ machine.part?.name }}</b></div>
          <div style="display:flex; align-items:baseline; gap:6px; margin:10px 0 4px"><span class="big-number">{{ machine.operation.good }}</span><span class="cell-sub">de {{ machine.active.quantity }} peças boas</span></div>
          <div class="progress wide"><span :style="{ width: `${Math.min(100, machine.operation.good / machine.active.quantity * 100)}%` }"></span></div>
          <div class="kv" style="margin-top:8px"><span>Refugo</span><b :class="{ 'risk-text': machine.scrapRate > 3 }">{{ machine.operation.scrap }} ({{ machine.scrapRate.toFixed(1) }}%)</b></div>
          <div class="kv"><span>Ciclo padrão</span><b>{{ machine.part?.cycleSeconds }} s · {{ machine.part?.cavities }} cav.</b></div>
          <div class="kv"><span>Tempo na OP</span><b>{{ fmtDuration(elapsedMs(machine.operation, ui.tick)) }}</b></div>
          <div class="kv"><span>Operador</span><b>{{ machine.operation.operator ?? '—' }}</b></div>
          <div v-if="machine.operation.pauseReason" class="callout warn" style="margin:10px 0 0">Parada: {{ machine.operation.pauseReason }}</div>
        </template>
        <p v-else-if="!machine.maintenance" class="empty-note">Sem OP liberada nesta máquina.</p>
        <h3 class="drawer-title" style="margin-top:14px">Fila da máquina</h3>
        <p v-if="!machine.queue.length" class="cell-sub">Nenhuma OP na fila.</p>
        <div v-for="op in machine.queue" :key="op.id" class="kv"><span>{{ op.id }} · {{ store.item(op.itemId).name }} · {{ op.quantity }} un.</span><StatusBadge :value="op.status" /></div>
      </div>
    </article>
  </section>

  <article class="card flush">
    <div class="section-head"><div><h2>Paradas registradas</h2><p>Informadas pelo operador no tablet, com motivo padronizado</p></div><button class="button secondary small" @click="router.push('/indicadores')">Ver indicadores</button></div>
    <table>
      <thead><tr><th>Máquina</th><th>Motivo</th><th>OP</th><th>Início</th><th>Duração</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="entry in downtimes" :key="entry.id">
          <td>{{ store.resourceName(entry.resourceId) }}</td><td>{{ entry.reason }}</td><td>{{ entry.opId }}</td><td>{{ fmtDateTime(entry.start) }}</td>
          <td>{{ duration(entry.start, entry.end) }}</td><td><StatusBadge :value="entry.end ? 'Encerrada' : 'Em aberto'" :tone="entry.end ? 'success' : 'warning'" /></td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
