<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2 } from 'lucide-vue-next'
import { hasFullAccess } from '../domain/access'
import { allocationOf } from '../domain/budget'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Role } from '../types/domain'
import { fmtDate } from '../utils/format'

interface Task {
  id: string
  owner: Role
  title: string
  detail: string
  urgent?: boolean
  action: string
  run: () => void
  open?: () => void
}

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const area = ref<'Todas' | Role>('Todas')

const tasks = computed<Task[]>(() => {
  const list: Task[] = []
  const s = store.state
  for (const order of s.salesOrders.filter(entry => store.stage(entry) === 'Entrada')) {
    list.push({ id: `plan-${order.id}`, owner: 'PCP', title: `Planejar ${order.id}`, detail: `${store.customerName(order.customerId)} · ${order.quantity} ${store.itemLabel(order.itemId)} · entrega ${fmtDate(order.promisedDate)}`, urgent: order.priority !== 'Normal', action: 'Planejar', run: () => store.planOrder(order.id), open: () => { ui.orderDrawer = order.id } })
  }
  for (const req of s.requisitions.filter(entry => entry.status !== 'Recebida')) {
    const item = store.item(req.itemId)
    const base = `${req.quantity} ${item.unit} de ${item.name} · ${req.origin}`
    if (req.status === 'Solicitada') list.push({ id: req.id, owner: 'Compras', title: `Cotar ${req.id}`, detail: base, action: 'Abrir cotação', run: () => store.advanceRequisition(req.id) })
    if (req.status === 'Em cotação') list.push({ id: req.id, owner: 'Gestor', title: `Aprovar compra ${req.id}`, detail: `${base} · ${(req.quantity * req.unitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, action: 'Aprovar', run: () => store.advanceRequisition(req.id) })
    if (req.status === 'Aprovada') list.push({ id: req.id, owner: 'Compras', title: `Emitir pedido de ${req.id} no Omie`, detail: `${base} · ${req.supplier}`, action: 'Emitir pedido', run: () => store.advanceRequisition(req.id) })
    if (req.status === 'Pedido emitido') list.push({ id: req.id, owner: 'Almoxarifado', title: `Receber ${req.omiePo}`, detail: `${base} · previsto até ${fmtDate(req.neededBy)}`, action: 'Registrar recebimento', run: () => store.advanceRequisition(req.id) })
  }
  for (const op of s.productionOrders.filter(entry => entry.status === 'Planejada')) {
    list.push({ id: `pick-${op.id}`, owner: 'Almoxarifado', title: `Separar kit da ${op.id}`, detail: `${store.itemLabel(op.itemId)} · ${op.quantity} un. · ${store.resourceName(op.resourceId)}`, action: 'Separar', run: () => store.pickOp(op.id), open: () => { ui.opDrawer = op.id } })
  }
  for (const alert of s.alerts.filter(entry => !entry.resolved)) {
    list.push({ id: alert.id, owner: 'Líder de produção', title: alert.message, detail: `${store.resourceName(alert.resourceId)} · ${alert.operator}`, urgent: true, action: 'Atender', run: () => store.resolveAlert(alert.id) })
  }
  for (const op of s.productionOrders) {
    const paused = op.operations.find(operation => operation.status === 'Pausada')
    if (paused) list.push({ id: `pause-${op.id}`, owner: 'Líder de produção', title: `${op.id} parada: ${paused.pauseReason}`, detail: `${paused.name} · ${store.resourceName(paused.resourceId)}`, urgent: true, action: 'Ver OP', run: () => { ui.opDrawer = op.id } })
    if (op.status === 'Inspeção') list.push({ id: `insp-${op.id}`, owner: 'Qualidade', title: `Inspecionar ${op.id}`, detail: `${store.itemLabel(op.itemId)} · ${op.quantity} un.`, action: 'Inspecionar', run: () => router.push('/qualidade') })
  }
  for (const nc of s.nonConformities.filter(entry => entry.status === 'Aberta')) {
    list.push({ id: nc.id, owner: 'Qualidade', title: `Analisar ${nc.id}`, detail: `${nc.reason} · ${nc.quantity} un. · ${nc.opId}`, action: 'Analisar', run: () => router.push('/qualidade') })
  }
  for (const order of s.salesOrders.filter(entry => entry.shipment && ['Aguardando conferência', 'Conferido'].includes(entry.shipment.status))) {
    list.push({ id: `ship-${order.id}`, owner: 'Expedição', title: `${order.shipment!.status === 'Conferido' ? 'Expedir' : 'Conferir'} ${order.id}`, detail: `${store.customerName(order.customerId)} · ${order.quantity} un.`, action: 'Abrir expedição', run: () => router.push('/expedicao') })
  }
  for (const maintenance of s.maintenanceOrders.filter(entry => entry.status !== 'Concluída')) {
    list.push({ id: maintenance.id, owner: 'Manutenção', title: `${maintenance.id} · ${maintenance.description}`, detail: `${s.assets.find(asset => asset.id === maintenance.assetId)?.name} · ${maintenance.type}`, urgent: maintenance.type === 'Corretiva', action: maintenance.status === 'Aberta' ? 'Iniciar' : 'Concluir', run: () => store.advanceMaintenance(maintenance.id) })
  }
  for (const opportunity of s.opportunities.filter(entry => !['Ganha', 'Perdida'].includes(entry.stage))) {
    list.push({ id: opportunity.id, owner: 'Comercial', title: opportunity.nextAction, detail: `${store.partnerName(opportunity.partnerId)} · ${opportunity.title}`, action: 'Abrir oportunidade', run: () => ui.openRecord('opportunity', opportunity.id) })
  }
  for (const demand of s.demands.filter(entry => entry.status === 'Aberta')) {
    list.push({ id: demand.id, owner: demand.assigneeRole, title: `Atender ${demand.id}`, detail: `${demand.description} · origem ${demand.origin}`, urgent: demand.priority === 'Urgente', action: 'Ver demanda', run: () => ui.openRecord('demand', demand.id) })
  }
  for (const proposal of s.proposals.filter(entry => entry.status === 'Enviada')) {
    list.push({ id: proposal.id, owner: 'Comercial', title: `Cobrar retorno da ${proposal.id}`, detail: `${store.partnerName(proposal.partnerId)} · válida até ${fmtDate(proposal.validUntil)}`, action: 'Abrir proposta', run: () => ui.openRecord('proposal', proposal.id) })
  }
  for (const project of s.projects.filter(entry => entry.status !== 'Concluído')) {
    const late = project.milestones.find(entry => !entry.done && entry.dueDate < '2026-10-15')
    if (late) list.push({ id: `ms-${project.id}`, owner: 'Engenharia', title: `Marco atrasado: ${late.title}`, detail: `${project.id} · ${project.name} · previsto ${fmtDate(late.dueDate)}`, urgent: true, action: 'Abrir projeto', run: () => ui.openRecord('project', project.id) })
  }
  for (const order of s.purchaseOrders.filter(entry => entry.status === 'Aguardando aprovação')) {
    list.push({ id: order.id, owner: 'Gestor', title: `Aprovar ${order.id}`, detail: `${store.partnerName(order.supplierId)} · ${store.itemLabel(order.itemId)}`, action: 'Aprovar', run: () => store.advancePurchaseOrder(order.id), open: () => ui.openRecord('purchase', order.id) })
  }
  for (const service of s.technicalServiceOrders.filter(entry => !['Concluída', 'Cancelada'].includes(entry.status))) {
    list.push({ id: service.id, owner: 'Assistência', title: `${service.id} · ${service.description}`, detail: `${store.partnerName(service.partnerId)} · ${service.status}`, urgent: service.status === 'Aguardando peça', action: 'Abrir chamado', run: () => ui.openRecord('technical', service.id) })
  }
  for (const alert of s.budgetAlerts.filter(entry => entry.tenantId === ui.activeTenantId && entry.status === 'Aberto' && entry.kind === 'Alerta')) {
    const mine = (alert.notifiedUserIds ?? []).includes(ui.sessionUserId)
    const allocation = allocationOf(s, alert.categoryId, alert.period)
    list.push({
      id: alert.id, owner: mine ? ui.role : 'Financeiro', title: mine ? `Conta em alerta · ${alert.period}` : `Orçamento em alerta · ${alert.period}`, detail: alert.message, urgent: alert.use >= 100,
      action: 'Ciente', run: () => store.acknowledgeBudgetAlert(alert.id), open: allocation ? () => ui.openRecord('budget', allocation.id, { window: alert.period }) : undefined,
    })
  }
  return list
})

const visible = computed(() => {
  const owner = hasFullAccess(ui.role) ? area.value : ui.role
  return tasks.value.filter(task => owner === 'Todas' || task.owner === owner).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent))
})

const areas = computed(() => {
  const counts = new Map<Role, number>()
  for (const task of tasks.value) counts.set(task.owner, (counts.get(task.owner) ?? 0) + 1)
  return [...counts.entries()]
})
</script>

<template>
  <div class="toolbar">
    <p v-if="hasFullAccess(ui.role)">Visão consolidada: o que cada área precisa fazer agora para os pedidos avançarem</p>
    <p v-else>Tarefas de <strong>{{ ui.role }}</strong> · {{ ui.userName }}</p>
    <div v-if="hasFullAccess(ui.role)" class="filter-row">
      <button class="chip" :class="{ active: area === 'Todas' }" @click="area = 'Todas'">Todas <b>{{ tasks.length }}</b></button>
      <button v-for="[owner, count] in areas" :key="owner" class="chip" :class="{ active: area === owner }" @click="area = owner">{{ owner }} <b>{{ count }}</b></button>
    </div>
  </div>

  <article class="card" data-tour="task-list">
    <div v-if="!visible.length" class="empty-note"><CheckCircle2 :size="28" style="color: var(--green-600)" /><p>Nenhuma tarefa pendente para este perfil.</p></div>
    <div v-for="task in visible" :key="task.id + task.owner" class="list-row static">
      <div style="display:flex; gap:12px; align-items:flex-start">
        <i class="alert-dot" :class="{ red: task.urgent }"></i>
        <div><strong>{{ task.title }}</strong><span>{{ task.detail }}</span></div>
      </div>
      <div class="row-end">
        <span class="status neutral">{{ task.owner }}</span>
        <button v-if="task.open" class="button secondary small" @click="task.open()">Detalhes</button>
        <button class="button small" @click="task.run()">{{ task.action }}</button>
      </div>
    </div>
  </article>
</template>
