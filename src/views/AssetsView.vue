<script setup lang="ts">
import { computed, ref } from 'vue'
import { Boxes, CalendarClock, CheckCircle2, Factory, Plus, Wrench } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Asset } from '../types/domain'
import { daysUntil, fmtDate, fmtNumber } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const kind = ref('')

const statusOf = (asset: Asset) => store.state.maintenanceOrders.some(entry => entry.assetId === asset.id && entry.type === 'Corretiva' && entry.status !== 'Concluída') ? 'Em manutenção' : asset.status ?? 'Operando'
const assets = computed(() => store.state.assets.filter(entry => !kind.value || entry.kind === kind.value))
const cycleUse = (asset: Asset) => asset.preventiveLimit && asset.shots ? Math.round(asset.shots / asset.preventiveLimit * 100) : undefined
const openOrders = (asset: Asset) => store.state.maintenanceOrders.filter(entry => entry.assetId === asset.id && entry.status !== 'Concluída').length
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <button class="chip" :class="{ active: !kind }" @click="kind = ''">Todos <b>{{ store.state.assets.length }}</b></button>
      <button v-for="entry in ['Injetora', 'Molde', 'Equipamento']" :key="entry" class="chip" :class="{ active: kind === entry }" @click="kind = entry">{{ entry }} <b>{{ store.state.assets.filter(asset => asset.kind === entry).length }}</b></button>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('asset', 'new')"><Plus :size="15" /> Novo ativo</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Ativos <Factory :size="17" /></div><strong>{{ store.state.assets.length }}</strong><small>{{ store.state.assets.filter(entry => entry.kind === 'Molde').length }} moldes</small></article>
    <article class="metric"><div class="metric-head">Operando <CheckCircle2 :size="17" /></div><strong>{{ store.state.assets.filter(entry => statusOf(entry) === 'Operando').length }}</strong><small>Disponíveis para programação</small></article>
    <article class="metric"><div class="metric-head">Preventivas em 15 dias <CalendarClock :size="17" /></div><strong>{{ store.state.assets.filter(entry => daysUntil(entry.nextPreventive) <= 15).length }}</strong><small>Inclui vencidas</small></article>
    <article class="metric"><div class="metric-head">Em manutenção <Wrench :size="17" /></div><strong :class="{ 'risk-text': store.state.assets.some(entry => statusOf(entry) === 'Em manutenção') }">{{ store.state.assets.filter(entry => statusOf(entry) === 'Em manutenção').length }}</strong><small>Bloqueiam capacidade</small></article>
  </section>

  <section class="asset-grid" data-tour="record-list">
    <article v-for="asset in assets" :key="asset.id" class="card asset-card clickable" @click="ui.openRecord('asset', asset.id)">
      <header><span class="metric-icon"><Factory v-if="asset.kind === 'Injetora'" :size="17" /><Boxes v-else :size="17" /></span><StatusBadge :value="statusOf(asset)" /></header>
      <h3>{{ asset.name }}</h3>
      <p>{{ asset.kind }} · {{ asset.serial ?? asset.id }}{{ asset.criticality ? ` · criticidade ${asset.criticality}` : '' }}</p>
      <div v-if="cycleUse(asset) !== undefined" class="progress wide" :class="{ danger: cycleUse(asset)! >= 90 }"><span :style="{ width: `${Math.min(100, cycleUse(asset)!)}%` }"></span></div>
      <div class="mini-stats">
        <div class="mini-stat"><strong>{{ asset.shots ? fmtNumber(asset.shots) : '—' }}</strong><span>{{ cycleUse(asset) !== undefined ? `${cycleUse(asset)}% do limite` : 'ciclos' }}</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': daysUntil(asset.nextPreventive) < 0 }">{{ fmtDate(asset.nextPreventive) }}</strong><span>preventiva</span></div>
        <div class="mini-stat"><strong>{{ openOrders(asset) }}</strong><span>OS abertas</span></div>
      </div>
    </article>
  </section>
</template>
