<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseModal from '../components/BaseModal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { addDays, resourceLoad, today } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { ProductionOrder } from '../types/domain'
import { fmtShortDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const base = today()
const days = Array.from({ length: 7 }, (_, index) => addDays(base, index))
const resources = computed(() => store.state.resources.filter(resource => ['Injetora', 'Montagem'].includes(resource.kind)))
const editing = ref<ProductionOrder | null>(null)
const target = ref({ resourceId: '', date: '' })

function blocks(resourceId: string, date: string) {
  return store.state.productionOrders.filter(op => {
    if (op.status === 'Concluída') return false
    const onResource = op.resourceId === resourceId || op.operations.some(operation => operation.resourceId === resourceId && operation.status !== 'Concluída')
    const scheduled = op.scheduledDate < base ? base : op.scheduledDate
    return onResource && scheduled === date
  })
}

function load(resourceId: string, date: string) {
  const overdue = date === base ? store.state.productionOrders.filter(op => op.status !== 'Concluída' && op.scheduledDate < base).map(op => op.scheduledDate) : []
  const total = [date, ...new Set(overdue)].reduce((sum, day) => sum + resourceLoad(store.state, resourceId, day).minutes, 0)
  const resource = store.state.resources.find(entry => entry.id === resourceId)!
  return Math.round(total / resource.dailyMinutes * 100)
}

const weekly = computed(() => resources.value.map(resource => {
  const percent = Math.round(days.reduce((sum, day) => sum + load(resource.id, day), 0) / days.length)
  return { resource, percent }
}))

function open(op: ProductionOrder) {
  editing.value = op
  target.value = { resourceId: op.resourceId, date: op.scheduledDate < base ? base : op.scheduledDate }
}

function save() {
  if (!editing.value) return
  store.scheduleOp(editing.value.id, target.value.resourceId, target.value.date)
  editing.value = null
}

const sameKind = computed(() => {
  if (!editing.value) return []
  const kind = store.state.resources.find(resource => resource.id === editing.value!.resourceId)?.kind
  return store.state.resources.filter(resource => resource.kind === kind)
})
const loadClass = (percent: number) => percent > 100 ? 'over' : percent > 80 ? 'high' : ''
</script>

<template>
  <div class="toolbar">
    <p>Sequência por recurso e dia. Clique em uma OP para reprogramar; o tablet do posto recebe a mudança na hora.</p>
    <div class="legend"><span><i class="dot" style="background:#143266"></i> Injeção</span><span><i class="dot" style="background:#00CCFF"></i> Montagem</span><span><i class="dot" style="background:#c4472c"></i> Aguardando material</span></div>
  </div>

  <section class="grid-3" data-tour="capacity" style="grid-template-columns: repeat(6, 1fr)">
    <div v-for="entry in weekly" :key="entry.resource.id" class="metric">
      <div class="metric-head"><span>{{ entry.resource.name }}</span></div>
      <strong>{{ entry.percent }}%</strong>
      <div class="load"><span :class="loadClass(entry.percent)" :style="{ width: `${Math.min(100, entry.percent)}%` }"></span></div>
      <small>ocupação média da semana</small>
    </div>
  </section>

  <div class="schedule" data-tour="schedule-grid">
    <div class="head">Recurso</div>
    <div v-for="day in days" :key="day" class="head" :class="{ today: day === base }">{{ day === base ? 'Hoje' : fmtShortDate(day) }}</div>
    <template v-for="resource in resources" :key="resource.id">
      <div class="res">{{ resource.name }}<small>{{ store.machineState(resource.id) }} · {{ resource.dailyMinutes / 60 }} h/dia</small></div>
      <div v-for="day in days" :key="day" :class="{ 'today-col': day === base }">
        <button v-for="op in blocks(resource.id, day)" :key="op.id" class="slot-block" :class="[op.kind, { warn: op.status === 'Aguardando material' }]" @click="open(op)">
          <strong>{{ op.id }}</strong>
          {{ store.itemLabel(op.itemId).split(' · ')[0] }} · {{ op.quantity }} un.
        </button>
        <div v-if="blocks(resource.id, day).length" class="load"><span :class="loadClass(load(resource.id, day))" :style="{ width: `${Math.min(100, load(resource.id, day))}%` }"></span></div>
      </div>
    </template>
  </div>

  <BaseModal :open="!!editing" :title="`Reprogramar ${editing?.id}`" :subtitle="editing ? `${store.itemLabel(editing.itemId)} · ${editing.quantity} un. · pedido ${editing.salesOrderId}` : ''" @close="editing = null">
    <template v-if="editing">
      <div style="display:flex; gap:8px; margin-bottom:14px"><StatusBadge :value="editing.status" /><span class="status neutral">Entrega {{ fmtShortDate(editing.dueDate) }}</span></div>
      <div class="field"><label>Recurso</label><select v-model="target.resourceId"><option v-for="resource in sameKind" :key="resource.id" :value="resource.id">{{ resource.name }} · {{ store.machineState(resource.id) }}</option></select></div>
      <div class="field"><label>Dia</label><select v-model="target.date"><option v-for="day in days" :key="day" :value="day">{{ day === base ? 'Hoje' : fmtShortDate(day) }} · carga {{ load(target.resourceId, day) }}%</option></select></div>
      <p v-if="target.date > editing.dueDate" class="callout warn">A nova data é posterior à data limite da OP. O pedido {{ editing.salesOrderId }} pode atrasar.</p>
    </template>
    <template #footer>
      <button class="button secondary" @click="ui.opDrawer = editing!.id; editing = null">Abrir OP</button>
      <button class="button" @click="save">Salvar programação</button>
    </template>
  </BaseModal>
</template>
