<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { IconSeta } from '../icons/ds'
import { showOnFloor } from '../domain/resources'
import { AREAS, type Area, areaDestination, moduleFeature, navTarget } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const CLOSE_MS = 340
const openId = ref('')
const closing = ref(false)
const grown = ref(false)
const floatEl = ref<HTMLElement | null>(null)
let closeTimer = 0

const allowed = (module?: string) => !module || store.can(moduleFeature(module))

const hour = new Date().getHours()
const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const firstName = computed(() => ui.userName.split(' ')[0])
const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
const heroImage = `url('${asset('roboflex/pecas-prensa.jpg')}')`

const counted = (value: number, one: string, many: string) => value ? { value, label: value === 1 ? one : many } : undefined

const badge = (id: string) => {
  const s = store.state
  if (id === 'comercial') return counted(s.opportunities.filter(entry => entry.stage !== 'Ganho' && entry.stage !== 'Perdido').length, 'oportunidade', 'oportunidades')
  if (id === 'engenharia') return counted(s.productRevisions.filter(entry => entry.status === 'Rascunho').length, 'revisão aberta', 'revisões abertas')
  if (id === 'suprimentos') return counted(s.requisitions.filter(req => req.status !== 'Recebida').length, 'compra aberta', 'compras abertas')
  if (id === 'operacoes') return counted(s.productionOrders.filter(op => op.status === 'Em produção').length, 'OP rodando', 'OPs rodando')
  if (id === 'servicos') return counted(s.technicalServiceOrders.filter(entry => !['Concluída', 'Cancelada'].includes(entry.status)).length, 'OS aberta', 'OS abertas')
  if (id === 'financas') return counted(s.budgetAlerts.filter(entry => entry.status === 'Aberto').length, 'alerta', 'alertas')
  if (id === 'gestao') return counted(s.projects.filter(entry => entry.status === 'Em andamento').length, 'projeto ativo', 'projetos ativos')
  return undefined
}

const band = (name: Area['band']) => AREAS.filter(area => area.band === name).map(area => ({
  ...area,
  badge: badge(area.id),
  links: area.groups.flatMap(group => group.items).filter(item => item.home && (item.pending || allowed(item.module))),
})).filter(area => area.links.length || areaDestination(area, allowed))

const chain = computed(() => band('cadeia'))
const support = computed(() => band('apoio'))
const openEntry = computed(() => {
  const chainIndex = chain.value.findIndex(area => area.id === openId.value)
  if (chainIndex >= 0) return { area: chain.value[chainIndex], index: chainIndex, kind: 'chain' as const, total: chain.value.length }
  const supportIndex = support.value.findIndex(area => area.id === openId.value)
  if (supportIndex >= 0) return { area: support.value[supportIndex], index: supportIndex, kind: 'support' as const, total: support.value.length }
  return null
})

const machines = computed(() => store.state.resources.filter(resource => resource.tenantId === ui.activeTenantId && (resource.kind === 'Injetora' || resource.kind === 'Montagem') && showOnFloor(store.state, resource))
  .map(resource => ({ name: resource.name.replace('Montagem · Célula ', 'Célula ').replace(/ · .*$/, ''), state: store.machineState(resource.id) })))
const producing = computed(() => machines.value.filter(machine => machine.state === 'Produzindo').length)
const alerts = computed(() => store.state.alerts.filter(alert => !alert.resolved))
const taskCount = computed(() => store.tasks().length)

function cardBox(id: string) {
  const node = document.querySelector(`[data-area="${id}"] > .tile`)
  if (!(node instanceof HTMLElement)) return null
  const rect = node.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function place(el: HTMLElement, box: { left: number, top: number, width: number, height: number }) {
  el.style.left = `${box.left}px`
  el.style.top = `${box.top}px`
  el.style.width = `${box.width}px`
  el.style.height = `${box.height}px`
}

function targetBox(slot: { left: number, top: number, width: number, height: number }, height: number, index: number, total: number) {
  const width = Math.min(560, window.innerWidth - 32)
  let left = slot.left + (slot.width - width) / 2
  if (index === 0) left = slot.left
  if (index === total - 1) left = slot.left + slot.width - width
  left = Math.max(16, Math.min(left, window.innerWidth - width - 16))
  const top = Math.max(16, Math.min(slot.top + (slot.height - height) / 2, window.innerHeight - height - 16))
  return { left, top, width, height }
}

async function layoutFloat(id: string) {
  await nextTick()
  const el = floatEl.value
  const slot = cardBox(id)
  const entry = openEntry.value
  if (!el || !slot || !entry || entry.area.id !== id) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const width = Math.min(560, window.innerWidth - 32)
  el.style.transition = 'none'
  el.classList.add('is-expanded')
  el.style.width = `${width}px`
  el.style.height = 'auto'
  const grownHeight = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.78))
  el.classList.remove('is-expanded')
  place(el, slot)
  el.style.visibility = 'visible'
  const target = targetBox(slot, grownHeight, entry.index, entry.total)
  if (reduced) {
    place(el, target)
    grown.value = true
    return
  }
  void el.offsetWidth
  requestAnimationFrame(() => {
    if (floatEl.value !== el) return
    el.style.transition = ''
    place(el, target)
    grown.value = true
  })
}

function closeTile() {
  if (!openId.value || closing.value) return
  const el = floatEl.value
  const slot = cardBox(openId.value)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  closing.value = true
  if (el && slot && !reduced) {
    el.classList.add('is-closing')
    el.style.transition = ''
    void el.offsetWidth
    place(el, slot)
  }
  window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => {
    openId.value = ''
    closing.value = false
    grown.value = false
  }, reduced ? 0 : CLOSE_MS + 40)
}

function focusArea(id: string) {
  if (closing.value) return
  if (openId.value === id) {
    closeTile()
    return
  }
  grown.value = false
  openId.value = id
  void layoutFloat(id)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closeTile()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(closeTimer)
})
</script>
<template>
  <div class="home">
    <div v-if="openId" class="tile-scrim" :class="{ 'is-closing': closing }" @click="closeTile()"></div>
    <div v-if="openEntry" ref="floatEl" class="tile tile-float" :class="[openEntry.area.id, openEntry.kind === 'chain' ? 'chain-tile' : 'support-tile', { 'is-expanded': grown, 'is-closing': closing }]" @click="closeTile()">
      <span v-if="openEntry.kind === 'chain'" class="tile-top">
        <span class="tile-index">{{ String(openEntry.index + 1).padStart(2, '0') }}</span>
        <span v-if="openEntry.area.badge" class="tile-badge"><b>{{ openEntry.area.badge.value }}</b> {{ openEntry.area.badge.label }}</span>
      </span>
      <span v-else class="tile-head">
        <span class="tile-icon"><component :is="openEntry.area.icon" :size="18" /></span>
        <strong>{{ openEntry.area.label }}</strong>
        <span v-if="openEntry.area.badge" class="tile-badge"><b>{{ openEntry.area.badge.value }}</b> {{ openEntry.area.badge.label }}</span>
      </span>
      <span v-if="openEntry.kind === 'chain'" class="tile-icon"><component :is="openEntry.area.icon" :size="20" /></span>
      <strong v-if="openEntry.kind === 'chain'">{{ openEntry.area.label }}</strong>
      <small>{{ openEntry.area.description }}</small>
      <span class="tile-links">
        <template v-for="item in openEntry.area.links" :key="item.label">
          <RouterLink v-if="item.to && !item.pending" :to="navTarget(item)" @click.stop>{{ item.label }}<small>{{ item.hint }}</small></RouterLink>
          <span v-else>{{ item.label }}<small>{{ item.hint }} Em breve.</small></span>
        </template>
      </span>
    </div>
    <section class="home-hero" :style="{ '--hero-image': heroImage }">
      <div class="hero-copy">
        <span class="hero-date">{{ today }}</span>
        <h1>{{ greeting }}, {{ firstName }}!</h1>
        <p>Escolha a área em que vai trabalhar. Cada módulo é uma área da empresa, com os processos que ela cuida.</p>
        <div class="hero-chips">
          <span><b>{{ store.state.salesOrders.filter(order => store.stage(order) !== 'Faturado').length }}</b> pedidos em aberto</span>
          <span><b>{{ producing }}</b> postos produzindo</span>
          <span><b>{{ alerts.length }}</b> {{ alerts.length === 1 ? 'chamado do chão' : 'chamados do chão' }}</span>
          <span><b>{{ taskCount }}</b> {{ taskCount === 1 ? 'tarefa minha' : 'tarefas minhas' }}</span>
        </div>
      </div>
      <div class="hero-panel">
        <header>Fábrica agora</header>
        <div class="hero-machines">
          <div v-for="machine in machines" :key="machine.name" :class="machine.state"><b>{{ machine.name }}</b><span>{{ machine.state }}</span></div>
        </div>
        <RouterLink to="/tablet" class="hero-tablet">
          Abrir tablet do chão de fábrica
          <IconSeta :size="16" />
        </RouterLink>
      </div>
    </section>

    <section class="home-band" data-tour="home-blocks">
      <header>
        <h2>Cadeia de valor</h2>
        <p>O caminho do pedido, do primeiro contato ao atendimento depois da entrega</p>
      </header>
      <div class="tiles five chain">
        <div v-for="(area, index) in chain" :key="area.id" class="chain-item" :data-area="area.id">
        <div class="tile chain-tile" :class="area.id" role="button" tabindex="0" :aria-expanded="openId === area.id" :data-tour="area.id === 'operacoes' ? 'home-producao' : area.id === 'engenharia' ? 'home-engenharia' : undefined" @click="focusArea(area.id)" @keydown.enter="focusArea(area.id)" @keydown.space.prevent="focusArea(area.id)">
          <span class="tile-top">
            <span class="tile-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span v-if="area.badge" class="tile-badge"><b>{{ area.badge.value }}</b> {{ area.badge.label }}</span>
          </span>
          <span class="tile-icon"><component :is="area.icon" :size="20" /></span>
          <strong>{{ area.label }}</strong>
          <small>{{ area.description }}</small>
          <span class="tile-links">
            <template v-for="item in area.links" :key="item.label">
              <RouterLink v-if="item.to && !item.pending" :to="navTarget(item)" @click.stop>{{ item.label }}</RouterLink>
              <span v-else>{{ item.label }}</span>
            </template>
          </span>
        </div>
        <ChevronRight v-if="index < chain.length - 1" class="chain-arrow" :size="18" aria-hidden="true" />
        </div>
      </div>
    </section>

    <section class="home-band">
      <header>
        <h2>Apoio</h2>
        <p>Áreas que sustentam todas as etapas da cadeia</p>
      </header>
      <div class="tiles five support">
        <div v-for="area in support" :key="area.id" class="tile-slot" :data-area="area.id">
        <div class="tile support-tile" :class="area.id" role="button" tabindex="0" :aria-expanded="openId === area.id" @click="focusArea(area.id)" @keydown.enter="focusArea(area.id)" @keydown.space.prevent="focusArea(area.id)">
          <span class="tile-head">
            <span class="tile-icon"><component :is="area.icon" :size="18" /></span>
            <strong>{{ area.label }}</strong>
            <span v-if="area.badge" class="tile-badge"><b>{{ area.badge.value }}</b> {{ area.badge.label }}</span>
          </span>
          <small>{{ area.description }}</small>
          <span class="tile-links">
            <template v-for="item in area.links" :key="item.label">
              <RouterLink v-if="item.to && !item.pending" :to="navTarget(item)" @click.stop>{{ item.label }}</RouterLink>
              <span v-else>{{ item.label }}</span>
            </template>
          </span>
        </div>
        </div>
      </div>
    </section>
  </div>
</template>
