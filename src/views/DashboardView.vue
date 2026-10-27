<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, ClipboardList, Gauge, PackageSearch, Tablet } from 'lucide-vue-next'
import MetricCard from '../components/MetricCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { plansMaterial } from '../domain/catalog'
import { directoryFailures } from '../domain/directory'
import { FLOW_STAGES } from '../domain/engine'
import { showOnFloor } from '../domain/resources'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtDate, fmtTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const openOrders = computed(() => store.state.salesOrders.filter(order => store.stage(order) !== 'Faturado'))
const atRisk = computed(() => openOrders.value.filter(order => store.risks(order).length))
const shortages = computed(() => store.state.items.filter(item => plansMaterial(item) && store.available(item.id) < item.minimum))
const injectors = computed(() => store.state.resources.filter(resource => resource.tenantId === ui.activeTenantId && resource.kind === 'Injetora' && showOnFloor(store.state, resource)))
const running = computed(() => injectors.value.filter(resource => store.machineState(resource.id) === 'Produzindo').length)
const byStage = computed(() => FLOW_STAGES.map(stage => ({ stage, count: store.state.salesOrders.filter(order => store.stage(order) === stage).length })))

const attention = computed(() => {
  const list: { text: string; detail: string; red?: boolean; action: () => void }[] = []
  for (const order of atRisk.value) list.push({ text: `${order.id} · ${store.risks(order).join(', ')}`, detail: `${store.customerName(order.customerId)} · entrega ${fmtDate(order.promisedDate)}`, red: store.risks(order).some(risk => risk.startsWith('Atrasado')), action: () => { ui.orderDrawer = order.id } })
  for (const alert of store.state.alerts.filter(entry => !entry.resolved)) list.push({ text: `Chamado: ${alert.message}`, detail: `${store.resourceName(alert.resourceId)} · ${alert.operator} · ${fmtTime(alert.at)}`, action: () => store.resolveAlert(alert.id) })
  for (const maintenance of store.state.maintenanceOrders.filter(entry => entry.type === 'Corretiva' && entry.status !== 'Concluída')) list.push({ text: `${maintenance.id}: ${maintenance.description}`, detail: `Manutenção corretiva · ${maintenance.status}`, red: true, action: () => router.push('/manutencao') })
  for (const sync of store.state.syncLogs.filter(entry => entry.status === 'erro')) list.push({ text: `Falha Omie: ${sync.entity} ${sync.reference}`, detail: sync.message, red: true, action: () => router.push('/integracao') })
  for (const account of directoryFailures(store.state, ui.activeTenantId)) {
    const name = store.state.persons.find(entry => entry.id === account.personId)?.fullName ?? account.email
    list.push({ text: `Falha Google: ${name}`, detail: account.failure ?? account.email, red: true, action: () => router.push(`/pessoas/pessoa/${account.personId}?aba=acesso`) })
  }
  return list
})

const weekly = [
  { day: 'Qui', actual: 78, plan: 80 }, { day: 'Sex', actual: 92, plan: 86 }, { day: 'Seg', actual: 70, plan: 84 },
  { day: 'Ter', actual: 96, plan: 90 }, { day: 'Qua', actual: 88, plan: 88 }, { day: 'Hoje', actual: 46, plan: 90 },
]
</script>

<template>
  <div class="toolbar">
    <p>Situação da fábrica, carteira e exceções que precisam de decisão</p>
    <div class="filter-row">
      <RouterLink class="button secondary" to="/fluxo"><ClipboardList :size="15" /> Ver fluxo completo</RouterLink>
      <RouterLink class="button" to="/tablet"><Tablet :size="15" /> Abrir tablet do operador</RouterLink>
    </div>
  </div>

  <section class="metrics" data-tour="kpis">
    <MetricCard label="Pedidos em carteira" :value="openOrders.length" :detail="`${store.state.salesOrders.filter(order => store.stage(order) === 'Entrada').length} aguardando planejamento`" :icon="ClipboardList" />
    <MetricCard label="Pedidos com risco" :value="atRisk.length" detail="Prazo, material, parada ou retrabalho" :icon="AlertTriangle" :trend="atRisk.length ? 'negative' : 'positive'" />
    <MetricCard label="Injetoras produzindo" :value="`${running}/${injectors.length}`" detail="Atualizado pelos tablets" :icon="Gauge" :trend="running === injectors.length ? 'positive' : 'negative'" />
    <MetricCard label="Materiais abaixo do mínimo" :value="shortages.length" :detail="`${store.state.requisitions.filter(req => req.status !== 'Recebida').length} compras em andamento`" :icon="PackageSearch" :trend="shortages.length ? 'negative' : 'positive'" />
  </section>

  <article class="card" style="margin-bottom:16px" data-tour="stage-strip">
    <div class="section-head"><div><h2>Pedidos por etapa do processo</h2><p>Do pedido aprovado no Omie à nota fiscal emitida</p></div><RouterLink class="link" to="/fluxo">Abrir fluxo</RouterLink></div>
    <div class="stage-strip">
      <button v-for="entry in byStage" :key="entry.stage" class="stage-tile" @click="router.push('/fluxo')"><strong>{{ entry.count }}</strong><span>{{ entry.stage }}</span></button>
    </div>
  </article>

  <section class="grid-2">
    <div class="stack">
      <article class="card" data-tour="machines">
        <div class="section-head"><div><h2>Injetoras agora</h2><p>Estado vindo dos apontamentos do tablet</p></div><RouterLink class="link" to="/injecao">Painel de injeção</RouterLink></div>
        <div class="machine-grid">
          <div v-for="resource in injectors" :key="resource.id" class="machine-tile" :class="store.machineState(resource.id)">
            <strong>{{ resource.name }}</strong>
            <StatusBadge :value="store.machineState(resource.id)" />
            <small>{{ store.state.productionOrders.find(op => op.resourceId === resource.id && ['Em produção', 'Liberada'].includes(op.status))?.id ?? 'Sem OP em andamento' }}</small>
          </div>
        </div>
      </article>
      <article class="card">
        <div class="section-head"><div><h2>Produção da semana</h2><p>Horas produtivas realizadas x planejadas (%)</p></div><span class="status success">Meta 85%</span></div>
        <div class="bars">
          <div v-for="bar in weekly" :key="bar.day" class="bar-group">
            <div class="bar plan" :style="{ height: `${bar.plan}%` }"></div>
            <div class="bar" :style="{ height: `${bar.actual}%` }"></div>
            <label>{{ bar.day }}</label>
          </div>
        </div>
        <div class="chart-legend"><span><i></i>Realizado</span><span><i></i>Planejado</span></div>
      </article>
    </div>

    <article class="card" data-tour="attention">
      <div class="section-head"><div><h2>Pontos de atenção</h2><p>{{ attention.length }} item(ns) exigem ação</p></div></div>
      <p v-if="!attention.length" class="empty-note">Nenhuma exceção no momento.</p>
      <ul class="alert-list">
        <li v-for="(entry, index) in attention" :key="index">
          <i class="alert-dot" :class="{ red: entry.red }"></i>
          <div class="grow"><strong>{{ entry.text }}</strong><span>{{ entry.detail }}</span></div>
          <button class="button secondary small" @click="entry.action()">Abrir</button>
        </li>
      </ul>
    </article>
  </section>

  <article class="card flush">
    <div class="section-head"><div><h2>Carteira em andamento</h2><p>Clique em um pedido para ver a trilha completa</p></div><RouterLink class="link" to="/pedidos">Todos os pedidos</RouterLink></div>
    <table>
      <thead><tr><th>Pedido / cliente</th><th>Produto</th><th>Entrega</th><th>Etapa</th><th>Progresso</th><th>Riscos</th></tr></thead>
      <tbody>
        <tr v-for="order in openOrders" :key="order.id" class="clickable" @click="ui.orderDrawer = order.id">
          <td><span class="cell-main">{{ order.id }}</span><span class="cell-sub">{{ store.customerName(order.customerId) }}</span></td>
          <td>{{ store.itemLabel(order.itemId) }}<span class="cell-sub">{{ order.quantity }} un.</span></td>
          <td>{{ fmtDate(order.promisedDate) }}</td>
          <td><StatusBadge :value="store.stage(order)" tone="info" /></td>
          <td><div class="progress"><span :style="{ width: `${store.progress(order)}%` }"></span></div><div class="progress-label">{{ store.progress(order) }}%</div></td>
          <td><span v-if="!store.risks(order).length" class="cell-sub">Sem riscos</span><span v-else class="risk-text">{{ store.risks(order).join(' · ') }}</span></td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
