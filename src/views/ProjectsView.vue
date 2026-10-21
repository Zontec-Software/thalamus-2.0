<script setup lang="ts">
import { computed, ref } from 'vue'
import { BadgeDollarSign, CalendarClock, Flag, FolderKanban, Plus } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { today } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Project } from '../types/domain'
import { fmtCurrency, fmtDate, fmtShortDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const status = ref<'Ativos' | Project['status']>('Ativos')

const projects = computed(() => store.state.projects.filter(entry => status.value === 'Ativos' ? entry.status === 'Planejado' || entry.status === 'Em andamento' : entry.status === status.value))
const active = computed(() => store.state.projects.filter(entry => entry.status === 'Planejado' || entry.status === 'Em andamento'))
const progress = (project: Project) => project.milestones.length ? Math.round(project.milestones.filter(entry => entry.done).length / project.milestones.length * 100) : 0
const late = (project: Project) => project.milestones.filter(entry => !entry.done && entry.dueDate < today())
const next = (project: Project) => project.milestones.find(entry => !entry.done)
const budget = (project: Project) => store.state.budgets.find(entry => entry.id === project.budgetId)
const projectPlan = (project: Project) => store.state.budgetEntries.find(entry => entry.sourceModule === 'Projetos' && entry.sourceId === project.id && entry.kind === 'Previsão')
const projectCosts = (project: Project) => store.state.budgetEntries.filter(entry => entry.projectId === project.id && entry.sourceId !== project.id && entry.status !== 'Cancelado').reduce((sum, entry) => sum + (entry.kind === 'Previsão' ? entry.openAmount : entry.amount), 0)
const projectRealized = (project: Project) => store.state.budgetEntries.filter(entry => entry.projectId === project.id && entry.kind === 'Realizado pago' && entry.status !== 'Cancelado').reduce((sum, entry) => sum + entry.amount, 0)
const budgetUse = (project: Project) => {
  const amount = projectPlan(project)?.amount
  return amount ? Math.round(projectCosts(project) / amount * 100) : 0
}
const openDemands = (project: Project) => store.state.demands.filter(entry => entry.projectId === project.id && (entry.status === 'Aberta' || entry.status === 'Em atendimento')).length
const health = (project: Project) => {
  if (project.status === 'Concluído' || project.status === 'Cancelado') return { tone: 'neutral', label: project.status }
  if (late(project).length > 1 || budgetUse(project) > 100) return { tone: 'danger', label: 'Crítico' }
  if (late(project).length || budgetUse(project) > 85) return { tone: 'warning', label: 'Atenção' }
  return { tone: 'success', label: 'No prazo' }
}

const range = computed(() => {
  const list = projects.value.length ? projects.value : store.state.projects
  const start = list.reduce((min, entry) => entry.startDate < min ? entry.startDate : min, today())
  const end = list.reduce((max, entry) => entry.endDate > max ? entry.endDate : max, today())
  return { start: new Date(`${start}T12:00:00`).getTime(), end: new Date(`${end}T12:00:00`).getTime() }
})
const position = (date: string) => (new Date(`${date}T12:00:00`).getTime() - range.value.start) / Math.max(1, range.value.end - range.value.start) * 100
const months = computed(() => {
  const list: { label: string; left: number }[] = []
  const cursor = new Date(range.value.start)
  cursor.setDate(1)
  while (cursor.getTime() <= range.value.end) {
    const iso = cursor.toISOString().slice(0, 10)
    const label = cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    if (cursor.getTime() >= range.value.start) list.push({ label: label[0].toUpperCase() + label.slice(1), left: position(iso) })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return list
})
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <button v-for="entry in ['Ativos', 'Planejado', 'Em andamento', 'Concluído', 'Cancelado']" :key="entry" class="chip" :class="{ active: status === entry }" @click="status = entry as typeof status">{{ entry }}</button>
    </div>
    <button data-tour="new-record" class="button" @click="ui.openRecord('project', 'new')"><Plus :size="15" /> Novo projeto</button>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Projetos ativos <FolderKanban :size="17" /></div><strong>{{ active.length }}</strong><small>{{ store.state.projects.filter(entry => entry.status === 'Concluído').length }} concluído(s)</small></article>
    <article class="metric"><div class="metric-head">Marcos atrasados <Flag :size="17" /></div><strong :class="{ 'risk-text': active.some(entry => late(entry).length) }">{{ active.reduce((sum, entry) => sum + late(entry).length, 0) }}</strong><small>Precisam de replanejamento</small></article>
    <article class="metric"><div class="metric-head">Orçamento dos projetos <BadgeDollarSign :size="17" /></div><strong>{{ fmtCurrency(active.reduce((sum, entry) => sum + (projectPlan(entry)?.amount ?? 0), 0)) }}</strong><small>{{ fmtCurrency(active.reduce((sum, entry) => sum + projectRealized(entry), 0)) }} realizados pagos</small></article>
    <article class="metric"><div class="metric-head">Próximos 7 dias <CalendarClock :size="17" /></div><strong>{{ active.flatMap(entry => entry.milestones).filter(entry => !entry.done && entry.dueDate >= today() && entry.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length }}</strong><small>Marcos a entregar</small></article>
  </section>

  <article v-if="projects.length" class="card gantt" data-tour="project-gantt">
    <div class="section-head"><div><h2>Cronograma do portfólio</h2><p>Barra = prazo do projeto · preenchimento = avanço físico · bandeira = marco</p></div></div>
    <div class="gantt-scale"><span v-for="month in months" :key="month.label + month.left" :style="{ left: `${month.left}%` }">{{ month.label }}</span><i class="today" :style="{ left: `${position(today())}%` }"></i></div>
    <button v-for="project in projects" :key="project.id" class="gantt-row" @click="ui.openRecord('project', project.id)">
      <span class="gantt-label"><b>{{ project.name }}</b><small>{{ store.userName(project.ownerId) }}</small></span>
      <span class="gantt-track">
        <span class="gantt-bar" :class="health(project).tone" :style="{ left: `${position(project.startDate)}%`, width: `${Math.max(2, position(project.endDate) - position(project.startDate))}%` }"><span :style="{ width: `${progress(project)}%` }"></span></span>
        <Flag v-for="milestone in project.milestones" :key="milestone.id" :size="11" class="gantt-flag" :class="{ done: milestone.done, late: !milestone.done && milestone.dueDate < today() }" :style="{ left: `${position(milestone.dueDate)}%` }" />
        <i class="today" :style="{ left: `${position(today())}%` }"></i>
      </span>
    </button>
  </article>

  <section class="project-grid" data-tour="record-list">
    <article v-for="project in projects" :key="project.id" class="card project-card clickable" @click="ui.openRecord('project', project.id)">
      <header><span class="metric-icon"><FolderKanban :size="17" /></span><StatusBadge :value="health(project).label" :tone="health(project).tone" /></header>
      <span class="eyebrow">{{ project.kind }} · {{ project.id }}</span>
      <h2>{{ project.name }}</h2>
      <p>{{ store.userName(project.ownerId) }}{{ project.partnerId ? ` · ${store.partnerName(project.partnerId)}` : '' }} · até {{ fmtDate(project.endDate) }}</p>
      <div class="progress wide"><span :style="{ width: `${progress(project)}%` }"></span></div>
      <div class="mini-stats">
        <div class="mini-stat"><strong>{{ progress(project) }}%</strong><span>avanço</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': budgetUse(project) > 85 }">{{ budget(project) ? `${budgetUse(project)}%` : '—' }}</strong><span>orçamento</span></div>
        <div class="mini-stat"><strong>{{ openDemands(project) }}</strong><span>demandas abertas</span></div>
      </div>
      <p v-if="next(project)" class="next-line" :class="{ 'risk-text': next(project)!.dueDate < today() }"><Flag :size="13" /> Próximo: {{ next(project)!.title }} · {{ fmtShortDate(next(project)!.dueDate) }}</p>
    </article>
  </section>
  <p v-if="!projects.length" class="empty-note">Nenhum projeto neste filtro.</p>
</template>
