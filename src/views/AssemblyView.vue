<script setup lang="ts">
import { computed } from 'vue'
import { Tablet } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { opProgress } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const STEPS = ['Montagem mecânica', 'Montagem do suporte', 'Vedação IP65', 'Instalação elétrica', 'Teste funcional', 'Teste de estanqueidade', 'Embalagem', 'Retrabalho']

const ops = computed(() => store.state.productionOrders.filter(op => op.kind === 'Montagem' && op.status !== 'Concluída').sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
const cells = computed(() => store.state.resources.filter(resource => resource.kind === 'Montagem').map(resource => {
  const operations = store.state.productionOrders.flatMap(op => op.operations.map(operation => ({ op, operation }))).filter(entry => entry.operation.resourceId === resource.id && entry.op.status !== 'Concluída')
  return {
    resource,
    running: operations.filter(entry => entry.operation.status === 'Em execução'),
    waiting: operations.filter(entry => ['Disponível', 'Pausada'].includes(entry.operation.status)).length,
    upcoming: operations.filter(entry => entry.operation.status === 'Aguardando').length,
  }
}))
const cell = (opId: string, step: string) => store.state.productionOrders.find(op => op.id === opId)?.operations.find(operation => operation.name === step)
</script>

<template>
  <div class="toolbar">
    <p>Acompanhamento das células de montagem, eletrônica e testes. Uma única forma de apontar, pelo tablet do posto.</p>
    <RouterLink class="button" to="/tablet"><Tablet :size="15" /> Apontar pelo tablet</RouterLink>
  </div>

  <section class="grid-3">
    <article v-for="entry in cells" :key="entry.resource.id" class="card">
      <div class="section-head" style="margin-bottom:8px"><h2>{{ entry.resource.name }}</h2><StatusBadge :value="store.machineState(entry.resource.id)" /></div>
      <div class="mini-stats">
        <div class="mini-stat"><strong>{{ entry.running.length }}</strong><span>em execução</span></div>
        <div class="mini-stat"><strong>{{ entry.waiting }}</strong><span>na fila</span></div>
        <div class="mini-stat"><strong>{{ entry.upcoming }}</strong><span>previstas</span></div>
      </div>
      <p v-for="run in entry.running" :key="run.operation.id" class="cell-sub" style="margin-top:10px">▶ {{ run.op.id }} · {{ run.operation.name }} · {{ run.operation.good }}/{{ run.op.quantity }} · {{ run.operation.operator }}</p>
    </article>
  </section>

  <article class="card flush" data-tour="assembly-matrix">
    <div class="section-head">
      <div><h2>Matriz OP × etapa</h2><p>Clique na OP para ver detalhes e apontamentos</p></div>
      <div class="legend"><span><i class="dot Concluída"></i>Concluída</span><span><i class="dot Em execução"></i>Em execução</span><span><i class="dot Pausada"></i>Parada</span><span><i class="dot Disponível"></i>Liberada</span><span><i class="dot"></i>Aguardando</span></div>
    </div>
    <table class="matrix" style="margin-top:12px">
      <thead><tr><th>OP / pedido</th><th>Produto</th><th>Limite</th><th v-for="step in STEPS" :key="step" style="text-align:center">{{ step }}</th><th>Progresso</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="op in ops" :key="op.id" class="clickable" @click="ui.opDrawer = op.id">
          <td><span class="cell-main">{{ op.id }}</span><span class="cell-sub">{{ op.salesOrderId }}</span></td>
          <td>{{ store.itemLabel(op.itemId) }}<span class="cell-sub">{{ op.quantity }} un.</span></td>
          <td>{{ fmtDate(op.dueDate) }}</td>
          <td v-for="step in STEPS" :key="step" class="cell">
            <i v-if="cell(op.id, step)" class="dot" :class="cell(op.id, step)!.status" :title="`${cell(op.id, step)!.status} · ${cell(op.id, step)!.good} boas`"></i>
            <span v-else class="cell-sub">—</span>
          </td>
          <td><div class="progress"><span :style="{ width: `${opProgress(op)}%` }"></span></div></td>
          <td><StatusBadge :value="op.status" /></td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
