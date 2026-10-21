<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, X } from 'lucide-vue-next'
import { sectorOf } from '../domain/enterprise'
import { useErpStore } from '../stores/erp'
import { useUiStore, type RecordKind } from '../stores/ui'
import type { TourPanel } from '../tour/steps'

const ui = useUiStore()
const store = useErpStore()
const route = useRoute()
let openedPanel = false
const rect = ref<DOMRect | null>(null)
const step = computed(() => ui.tourSteps[ui.tourIndex])
const isLast = computed(() => ui.tourIndex === ui.tourSteps.length - 1)
const POPOVER_WIDTH = 360
const PAD = 6

function measure() {
  if (!step.value?.target) {
    rect.value = null
    return
  }
  const element = document.querySelector<HTMLElement>(step.value.target)
  rect.value = element ? element.getBoundingClientRect() : null
}

function focusStep() {
  const element = step.value?.target ? document.querySelector<HTMLElement>(step.value.target) : null
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  setTimeout(measure, 60)
  setTimeout(measure, 350)
  setTimeout(measure, 700)
}

/** Escolhe um registro que tenha as ações do passo visíveis. */
function recordId(panel: Exclude<TourPanel, 'close'>): string | null {
  const state = store.state
  const pick = <T extends { id: string }>(list: T[], preferred?: T) => preferred?.id ?? list[0]?.id ?? null
  if (panel === 'opportunity') {
    const open = state.opportunities.filter(entry => entry.stage !== 'Ganha' && entry.stage !== 'Perdida')
    return pick(state.opportunities, open.find(entry => state.proposals.some(proposal => proposal.opportunityId === entry.id)) ?? open[0])
  }
  if (panel === 'proposal') return pick(state.proposals, state.proposals.find(entry => entry.status === 'Enviada') ?? state.proposals.find(entry => entry.status === 'Rascunho'))
  if (panel === 'demand') return pick(state.demands, state.demands.find(entry => entry.status === 'Aberta' && entry.kind === 'Material') ?? state.demands.find(entry => entry.status === 'Aberta') ?? state.demands.find(entry => entry.status === 'Em atendimento'))
  if (panel === 'purchase') return pick(state.purchaseOrders, state.purchaseOrders.find(entry => entry.status === 'Aguardando aprovação') ?? state.purchaseOrders.find(entry => entry.status === 'Aprovado' || entry.status === 'Recebido parcial'))
  if (panel === 'technical') return pick(state.technicalServiceOrders, state.technicalServiceOrders.find(entry => entry.status === 'Agendada') ?? state.technicalServiceOrders.find(entry => entry.status !== 'Concluída' && entry.status !== 'Cancelada'))
  if (panel === 'project') return pick(state.projects, state.projects.find(entry => entry.status === 'Em andamento'))
  if (panel === 'budget') return pick(state.budgets, state.budgets.find(entry => state.purchaseOrders.some(order => order.budgetId === entry.id)))
  if (panel === 'title') {
    const kind = route.path === '/contas-pagar' ? 'Pagar' : route.path === '/contas-receber' ? 'Receber' : undefined
    const list = state.financialTitles.filter(entry => !kind || entry.kind === kind)
    return pick(list, list.find(entry => entry.status === 'Aberto'))
  }
  if (panel === 'person') {
    const manager = state.users.find(user => state.sectors.some(sector => sector.managerId === user.id && state.users.some(member => member.id !== user.id && sectorOf(state, member)?.id === sector.id)))
    return manager?.id ?? state.users[0]?.id ?? null
  }
  if (panel === 'service') return pick(state.services, state.services.find(service => state.proposals.some(proposal => proposal.lines.some(line => line.serviceId === service.id)) || state.demands.some(demand => demand.serviceId === service.id)))
  const asset = state.assets.find(entry => state.maintenanceOrders.some(order => order.assetId === entry.id && order.status !== 'Concluída'))
  return asset?.id ?? state.assets[0]?.id ?? null
}

function syncPanel() {
  const panel = step.value?.panel
  if (!panel) return
  openedPanel = true
  if (panel === 'close') {
    ui.closeRecord()
    return
  }
  const id = recordId(panel)
  if (id) ui.openRecord(panel as RecordKind, id, undefined, true)
}

async function showStep() {
  if (!ui.tourSteps.length) return
  syncPanel()
  await nextTick()
  focusStep()
}

watch(() => ui.tourIndex, showStep)
watch(() => ui.tourSteps, showStep)
watch(() => ui.tourSteps.length, (length, previous) => {
  if (previous && !length && openedPanel) {
    openedPanel = false
    ui.closeRecord()
  }
})

const highlightStyle = computed(() => rect.value && {
  top: `${rect.value.top - PAD}px`,
  left: `${rect.value.left - PAD}px`,
  width: `${rect.value.width + PAD * 2}px`,
  height: `${rect.value.height + PAD * 2}px`,
})

const popoverStyle = computed(() => {
  const box = rect.value
  if (!box) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  if (box.left > viewportWidth * 0.52) {
    const top = Math.min(Math.max(16, box.top - 12), viewportHeight - 300)
    return { top: `${top}px`, left: `${Math.max(16, box.left - POPOVER_WIDTH - 22)}px` }
  }
  if (box.width < 320 && box.right + POPOVER_WIDTH + 30 < viewportWidth) {
    const top = Math.min(Math.max(16, box.top), viewportHeight - 260)
    return { top: `${top}px`, left: `${box.right + 18}px` }
  }
  const left = Math.min(Math.max(16, box.left), viewportWidth - POPOVER_WIDTH - 16)
  if (box.bottom + 250 < viewportHeight) return { top: `${box.bottom + 16}px`, left: `${left}px` }
  if (box.top > 260) return { top: `${box.top - 16}px`, left: `${left}px`, transform: 'translateY(-100%)' }
  return { top: `${Math.max(16, viewportHeight - 280)}px`, left: `${left}px` }
})

function next() {
  if (isLast.value) ui.endTour()
  else ui.tourIndex++
}

function previous() {
  if (ui.tourIndex > 0) ui.tourIndex--
}

function onKey(event: KeyboardEvent) {
  if (!ui.tourSteps.length) return
  if (event.key === 'Escape') ui.endTour()
  if (event.key === 'ArrowRight') next()
  if (event.key === 'ArrowLeft') previous()
}

onMounted(() => {
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="step" class="tour-layer">
      <div v-if="highlightStyle" class="tour-highlight" :style="highlightStyle"></div>
      <div v-else class="tour-backdrop"></div>
      <section class="tour-popover" :style="popoverStyle" role="dialog" aria-live="polite">
        <header>
          <span class="eyebrow">Guia · {{ ui.tourIndex + 1 }} de {{ ui.tourSteps.length }}</span>
          <button class="icon-plain" title="Fechar guia" @click="ui.endTour()"><X :size="16" /></button>
        </header>
        <h3>{{ step.title }}</h3>
        <p>{{ step.body }}</p>
        <div class="tour-dots"><i v-for="(_, index) in ui.tourSteps" :key="index" :class="{ active: index === ui.tourIndex }"></i></div>
        <footer>
          <button class="button ghost" @click="ui.endTour()">Pular guia</button>
          <div class="filter-row">
            <button v-if="ui.tourIndex > 0" class="button secondary" @click="previous"><ArrowLeft :size="14" /> Voltar</button>
            <button class="button" @click="next">{{ isLast ? 'Concluir' : 'Próximo' }} <ArrowRight v-if="!isLast" :size="14" /></button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
