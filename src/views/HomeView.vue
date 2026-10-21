<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, BellRing, CircleAlert, Clock3, Factory, PackageCheck, Sparkles, Tablet, TriangleAlert } from 'lucide-vue-next'
import { FLOW_STAGES } from '../domain/engine'
import { AREAS, moduleFeature } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore, type RecordKind } from '../stores/ui'
import { fmtTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const allowed = (module?: string) => !module || store.can(moduleFeature(module))

const hour = new Date().getHours()
const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const firstName = computed(() => ui.userName.split(' ')[0])

const HERO_IMAGES = [
  // '/roboflex/montagem-cases.jpg',
  // '/roboflex/montagem-eletronicos.jpg',
  '/roboflex/pecas-prensa.jpg',
  // '/roboflex/pecas-bancada.jpg',
]
const dayNumber = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000)
const heroImage = `url('${HERO_IMAGES[dayNumber % HERO_IMAGES.length]}')`

const badge = (id: string) => {
  const s = store.state
  if (id === 'comercial') return { value: s.opportunities.filter(entry => !['Ganha', 'Perdida'].includes(entry.stage)).length, label: 'oportunidades' }
  if (id === 'cadastros') return { value: s.productRevisions.filter(entry => entry.status === 'Rascunho').length, label: 'revisões abertas' }
  if (id === 'suprimentos') return { value: s.requisitions.filter(req => req.status !== 'Recebida').length, label: 'compras abertas' }
  if (id === 'operacoes') return { value: s.productionOrders.filter(op => op.status === 'Em produção').length, label: 'OPs rodando' }
  if (id === 'servicos') return { value: s.maintenanceOrders.filter(entry => entry.status !== 'Concluída').length + s.technicalServiceOrders.filter(entry => !['Concluída', 'Cancelada'].includes(entry.status)).length, label: 'OS abertas' }
  if (id === 'financas') return { value: s.financialTitles.filter(entry => entry.status === 'Aberto' && entry.dueDate < '2026-10-15').length, label: 'títulos vencidos' }
  return { value: s.projects.filter(entry => entry.status === 'Em andamento').length, label: 'projetos ativos' }
}

const areas = computed(() => AREAS.map(area => ({
  ...area,
  badge: badge(area.id),
  items: area.groups.flatMap(group => group.items).filter(item => allowed(item.module) && item.to !== '/tablet'),
})).filter(area => area.items.length))

const stages = computed(() => FLOW_STAGES.map(stage => ({ stage, count: store.state.salesOrders.filter(order => store.stage(order) === stage).length })))
const machines = computed(() => store.state.resources.filter(resource => resource.kind === 'Injetora' || resource.kind === 'Montagem')
  .map(resource => ({ name: resource.name.replace('Montagem · Célula ', 'Célula ').replace(/ · .*$/, ''), state: store.machineState(resource.id) })))
const producing = computed(() => machines.value.filter(machine => machine.state === 'Produzindo').length)
const alerts = computed(() => store.state.alerts.filter(alert => !alert.resolved))

const todo = computed(() => {
  const s = store.state
  const list: { icon: typeof Factory; tone: string; title: string; detail: string; to: string; module?: string; record?: { kind: RecordKind; id: string } }[] = []
  for (const order of s.salesOrders.filter(entry => store.stage(entry) === 'Entrada')) list.push({ icon: Sparkles, tone: 'orange', title: `Planejar ${order.id}`, detail: `${store.customerName(order.customerId)} · ${order.quantity} un.`, to: '/pedidos', module: 'Pedidos' })
  for (const op of s.productionOrders.filter(entry => entry.status === 'Planejada')) list.push({ icon: PackageCheck, tone: 'teal', title: `Separar kit da ${op.id}`, detail: store.itemLabel(op.itemId), to: '/estoque', module: 'Estoque' })
  for (const op of s.productionOrders.filter(entry => entry.status === 'Inspeção')) list.push({ icon: PackageCheck, tone: 'blue', title: `Inspecionar ${op.id}`, detail: `${op.quantity} un. · ${store.itemLabel(op.itemId)}`, to: '/qualidade', module: 'Qualidade' })
  for (const order of s.salesOrders.filter(entry => entry.shipment?.status === 'Aguardando conferência')) list.push({ icon: Clock3, tone: 'blue', title: `Conferir carga ${order.id}`, detail: store.customerName(order.customerId), to: '/expedicao', module: 'Expedição' })
  for (const maintenance of s.maintenanceOrders.filter(entry => entry.type === 'Corretiva' && entry.status !== 'Concluída')) list.push({ icon: TriangleAlert, tone: 'red', title: `${maintenance.id} corretiva`, detail: maintenance.description, to: '/manutencao', module: 'Manutenção' })
  for (const req of s.requisitions.filter(entry => entry.status === 'Solicitada')) list.push({ icon: Clock3, tone: 'violet', title: `Cotar ${req.id}`, detail: store.itemLabel(req.itemId), to: '/compras', module: 'Compras' })
  for (const task of store.tasks()) list.push({ icon: CircleAlert, tone: 'blue', title: task.title, detail: task.detail, to: task.to, record: task.record as { kind: RecordKind; id: string } | undefined })
  return list.filter(entry => allowed(entry.module)).slice(0, 6)
})

const events = computed(() => store.state.events.slice(0, 6))

function openTodo(event: MouseEvent, record?: { kind: RecordKind; id: string }) {
  if (!record) return
  event.preventDefault()
  ui.openRecord(record.kind, record.id)
}
</script>
<template>
  <div class="home">
    <section class="home-hero" :style="{ '--hero-image': heroImage }">
      <div class="hero-copy">
        <img src="/roboflex/logo.png" alt="Roboflex" class="hero-logo" />
        <span class="hero-date">{{ today }}</span>
        <h1>{{ greeting }}, {{ firstName }}!</h1>
        <p>Em que vamos trabalhar hoje? Escolha uma área abaixo. Cada uma tem só as telas daquele trabalho.</p>
        <div class="hero-chips">
          <span><b>{{store.state.salesOrders.filter(order => store.stage(order) !== 'Faturado').length}}</b> pedidos em aberto</span>
          <span><b>{{ producing }}</b> postos produzindo</span>
          <span :class="{ warn: alerts.length }"><b>{{ alerts.length }}</b> chamados do chão</span>
        </div>
      </div>
      <div class="hero-panel">
        <header>
          <Factory :size="16" /> Fábrica agora <i class="live-dot"></i>
        </header>
        <div class="hero-machines">
          <div v-for="machine in machines" :key="machine.name" :class="machine.state"><b>{{ machine.name }}</b><span>{{ machine.state }}</span></div>
        </div>
        <div v-if="alerts.length" class="hero-alert">
          <BellRing :size="15" /><span>{{ alerts[0].message }} · {{ alerts[0].operator }}</span>
        </div>
        <RouterLink to="/tablet" class="hero-tablet">
          <Tablet :size="16" /> Abrir tablet do chão de fábrica
          <ArrowRight :size="14" />
        </RouterLink>
      </div>
    </section>
    <section class="tiles" data-tour="home-blocks">
      <div v-for="area in areas" :key="area.id" class="tile" :class="area.id" role="link" tabindex="0" :data-tour="area.id === 'operacoes' ? 'home-producao' : area.id === 'cadastros' ? 'home-cadastros' : undefined" @click="router.push(area.items[0].to)" @keydown.enter="router.push(area.items[0].to)">
        <span class="tile-badge"><b>{{ area.badge.value }}</b> {{ area.badge.label }}</span>
        <span class="tile-icon">
          <component :is="area.icon" :size="22" />
        </span>
        <strong>{{ area.label }}</strong>
        <small>{{ area.description }}</small>
        <span class="tile-links">
          <RouterLink v-for="item in area.items.slice(0, 4)" :key="item.to" :to="item.to" @click.stop>{{ item.label }}</RouterLink>
        </span>
      </div>
    </section>
    <section class="flow-ribbon">
      <div class="ribbon-title"><strong>Caminho do pedido</strong><span>Do Omie à nota fiscal</span></div>
      <RouterLink v-for="(entry, index) in stages" :key="entry.stage" to="/fluxo" class="ribbon-step" :class="{ hot: entry.count && index > 0 && index < 6 }">
        <i>{{ index + 1 }}</i><b>{{ entry.count }}</b><span>{{ entry.stage }}</span>
      </RouterLink>
    </section>
    <section class="home-grid">
      <article class="home-card">
        <header>
          <div>
            <h2>Para você agora</h2>
            <p>Pendências do perfil {{ ui.role }}</p>
          </div>
          <RouterLink to="/tarefas" class="mini-link">Ver todas</RouterLink>
        </header>
        <p v-if="!todo.length" class="empty-note">Nada pendente para este perfil.</p>
        <RouterLink v-for="entry in todo" :key="entry.title" :to="entry.to" class="todo-row" @click="openTodo($event, entry.record)">
          <span class="todo-icon" :class="entry.tone">
            <component :is="entry.icon" :size="16" />
          </span>
          <div><strong>{{ entry.title }}</strong><small>{{ entry.detail }}</small></div>
          <ArrowRight :size="15" />
        </RouterLink>
      </article>
      <article class="home-card">
        <header>
          <div>
            <h2>Acontecendo agora</h2>
            <p>Registros do sistema e dos tablets</p>
          </div><i class="live-dot"></i>
        </header>
        <ol class="home-feed">
          <li v-for="event in events" :key="event.id"><i></i>
            <div><strong>{{ event.text }}</strong><small>{{ fmtTime(event.at) }} · {{ event.actor }} · {{ event.module }}</small></div>
          </li>
        </ol>
      </article>
      <article class="home-card product-card">
        <img src="/roboflex/linha-cases.jpg" alt="Cases, suportes e ventosas da Roboflex" />
        <div class="product-copy">
          <span>Roboflex</span>
          <h2>Cases robustos para tablets</h2>
          <p>Linhas Hard e Lite para mineração, logística, agro, hotelaria e indústria. Cada case nasce de peças injetadas aqui e é montado nas nossas células.</p>
          <RouterLink to="/produtos" class="mini-link light">Ver produtos e estruturas
            <ArrowRight :size="13" />
          </RouterLink>
        </div>
      </article>
    </section>
    <p v-if="store.state.syncLogs.some(log => log.status === 'erro')" class="home-foot">
      <CircleAlert :size="14" /> Há falhas na integração com o Omie. <RouterLink to="/integracao">Revisar</RouterLink>
    </p>
  </div>
</template>
