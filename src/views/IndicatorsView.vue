<script setup lang="ts">
import { computed } from 'vue'
import { Clock, PackageX, ShoppingCart, Target, Wrench } from 'lucide-vue-next'
import MetricCard from '../components/MetricCard.vue'
import { abcAnalysis } from '../domain/catalogExtensions'
import { FLOW_STAGES, today } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtCurrency, fmtNumber } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const DAY = 86_400_000

const invoiced = computed(() => store.state.salesOrders.filter(order => order.shipment?.shippedAt))
const otd = computed(() => {
  if (!invoiced.value.length) return '—'
  const onTime = invoiced.value.filter(order => order.shipment!.shippedAt!.slice(0, 10) <= order.promisedDate).length
  return `${Math.round(onTime / invoiced.value.length * 100)}%`
})
const leadTime = computed(() => {
  if (!invoiced.value.length) return '—'
  const total = invoiced.value.reduce((sum, order) => sum + (new Date(order.shipment!.shippedAt!).getTime() - new Date(order.receivedAt).getTime()), 0)
  return `${(total / invoiced.value.length / DAY).toFixed(1)} dias`
})
const operations = computed(() => store.state.productionOrders.flatMap(op => op.operations))
const scrapRate = computed(() => {
  const good = operations.value.reduce((sum, operation) => sum + operation.good, 0)
  const scrap = operations.value.reduce((sum, operation) => sum + operation.scrap, 0)
  return good + scrap ? `${(scrap / (good + scrap) * 100).toFixed(1)}%` : '0%'
})
const lateRequisitions = computed(() => store.state.requisitions.filter(req => req.status !== 'Recebida' && req.neededBy < today()).length)

const downtimeByReason = computed(() => {
  const totals: Record<string, number> = {}
  for (const entry of store.state.downtimes) {
    const end = entry.end ? new Date(entry.end).getTime() : ui.tick
    totals[entry.reason] = (totals[entry.reason] ?? 0) + (end - new Date(entry.start).getTime()) / 60000
  }
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...rows.map(row => row[1]))
  return rows.map(([reason, minutes]) => ({ reason, minutes: Math.round(minutes), width: minutes / max * 100 }))
})

const productionByResource = computed(() => {
  const rows = store.state.resources.filter(resource => ['Injetora', 'Montagem'].includes(resource.kind)).map(resource => {
    const list = operations.value.filter(operation => operation.resourceId === resource.id)
    const good = list.reduce((sum, operation) => sum + operation.good, 0)
    const scrap = list.reduce((sum, operation) => sum + operation.scrap, 0)
    return { name: resource.name, good, scrap }
  })
  const max = Math.max(1, ...rows.map(row => row.good))
  return rows.map(row => ({ ...row, width: row.good / max * 100 }))
})

const stages = computed(() => FLOW_STAGES.map(stage => ({ stage, count: store.state.salesOrders.filter(order => store.stage(order) === stage).length })))
const maxStage = computed(() => Math.max(1, ...stages.value.map(entry => entry.count)))

const ABC_DAYS = 90
const abc = computed(() => [...abcAnalysis(store.state, ABC_DAYS).values()])
/** Concentração do consumo: poucos itens de classe A respondem pela maior parte do valor. */
const abcClasses = computed(() => (['A', 'B', 'C'] as const).map(cls => {
  const rows = abc.value.filter(entry => entry.cls === cls)
  const value = rows.reduce((sum, entry) => sum + entry.value, 0)
  const total = abc.value.reduce((sum, entry) => sum + entry.value, 0)
  return { cls, count: rows.length, value, width: total ? value / total * 100 : 0 }
}))
const topAbc = computed(() => abc.value.filter(entry => entry.value > 0).slice(0, 8).map(entry => ({ ...entry, item: store.item(entry.itemId) })))
</script>

<template>
  <div class="toolbar"><p>Indicadores calculados a partir dos apontamentos do tablet e dos eventos do fluxo. Nenhum dado é digitado à parte.</p></div>

  <section class="metrics" data-tour="kpi-grid">
    <MetricCard label="Entrega no prazo (OTD)" :value="otd" :detail="`${invoiced.length} pedido(s) expedido(s)`" :icon="Target" trend="positive" />
    <MetricCard label="Lead time médio" :value="leadTime" detail="Da aprovação no Omie à expedição" :icon="Clock" />
    <MetricCard label="Refugo geral" :value="scrapRate" detail="Peças refugadas / produzidas" :icon="PackageX" trend="negative" />
    <MetricCard label="Compras atrasadas" :value="lateRequisitions" detail="Necessidade já vencida" :icon="ShoppingCart" :trend="lateRequisitions ? 'negative' : 'positive'" />
  </section>

  <section class="metrics">
    <MetricCard label="Pipeline comercial" :value="fmtCurrency(store.state.opportunities.filter(entry => !['Ganha', 'Perdida'].includes(entry.stage)).reduce((sum, entry) => sum + entry.value, 0))" detail="Oportunidades abertas" :icon="Target" />
    <MetricCard label="Demandas abertas" :value="store.state.demands.filter(entry => entry.status === 'Aberta').length" detail="Todas as origens" :icon="ShoppingCart" />
    <MetricCard label="Assistências em curso" :value="store.state.technicalServiceOrders.filter(entry => !['Concluída', 'Cancelada'].includes(entry.status)).length" detail="Garantia e cobráveis" :icon="Wrench" />
    <MetricCard label="Orçamento consumido" :value="fmtCurrency(store.state.budgetEntries.filter(entry => entry.tenantId === ui.activeTenantId && entry.kind === 'Realizado pago' && entry.status !== 'Cancelado').reduce((sum, entry) => sum + entry.amount, 0))" detail="Realizado pago confirmado pelo Omie" :icon="Clock" />
  </section>

  <section class="grid-2">
    <article class="card">
      <div class="section-head"><div><h2>Paradas por motivo</h2><p>Minutos acumulados, informados no tablet</p></div></div>
      <div v-for="row in downtimeByReason" :key="row.reason" class="hbar"><span>{{ row.reason }}</span><div class="track"><span :style="{ width: `${row.width}%` }"></span></div><b>{{ row.minutes }} min</b></div>
      <p v-if="!downtimeByReason.length" class="empty-note">Sem paradas registradas.</p>
    </article>
    <article class="card">
      <div class="section-head"><div><h2>Produção por recurso</h2><p>Peças boas apontadas (refugo entre parênteses)</p></div></div>
      <div v-for="row in productionByResource" :key="row.name" class="hbar green"><span>{{ row.name }}</span><div class="track"><span :style="{ width: `${row.width}%` }"></span></div><b>{{ fmtNumber(row.good) }} <small class="cell-sub" style="display:inline">({{ row.scrap }})</small></b></div>
    </article>
  </section>

  <section class="grid-2">
    <article class="card">
      <div class="section-head"><div><h2>Curva ABC do consumo</h2><p>Valor consumido nos últimos {{ ABC_DAYS }} dias, por classe</p></div></div>
      <div v-for="row in abcClasses" :key="row.cls" class="hbar"><span>Classe {{ row.cls }} · {{ row.count }} item(ns)</span><div class="track"><span :style="{ width: `${row.width}%` }"></span></div><b>{{ fmtCurrency(row.value) }}</b></div>
      <p class="cell-sub">A classe é calculada da saída de estoque multiplicada pelo custo: A até 80% do valor, B até 95%, C o restante.</p>
    </article>
    <article class="card flush">
      <div class="section-head"><div><h2>Itens que mais consomem valor</h2><p>Giro anualizado a partir do mesmo período</p></div><RouterLink class="button secondary small" to="/produtos">Abrir produtos</RouterLink></div>
      <table class="compact">
        <thead><tr><th>Item</th><th>Classe</th><th>Valor consumido</th><th>Giro</th></tr></thead>
        <tbody>
          <tr v-for="row in topAbc" :key="row.itemId">
            <td><span class="cell-main">{{ row.item.code }}</span><span class="cell-sub">{{ row.item.name }}</span></td>
            <td><span class="status" :class="row.cls === 'A' ? 'danger' : row.cls === 'B' ? 'warning' : 'neutral'">{{ row.cls }}</span></td>
            <td>{{ fmtCurrency(row.value) }}<span class="cell-sub">{{ Math.round(row.share * 100) }}% do total</span></td>
            <td>{{ row.turnover ? `${fmtNumber(row.turnover, 1)}×/ano` : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!topAbc.length" class="empty-note">Sem saídas de estoque no período.</p>
    </article>
  </section>

  <article class="card">
    <div class="section-head"><div><h2>Pedidos por etapa</h2><p>Onde a carteira está parada agora</p></div><RouterLink class="button secondary small" to="/fluxo">Abrir fluxo</RouterLink></div>
    <div v-for="entry in stages" :key="entry.stage" class="hbar green"><span>{{ entry.stage }}</span><div class="track"><span :style="{ width: `${entry.count / maxStage * 100}%` }"></span></div><b>{{ entry.count }}</b></div>
  </article>
</template>
