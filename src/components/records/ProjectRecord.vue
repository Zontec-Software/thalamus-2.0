<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Flag, PackagePlus, Plus } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Project } from '../../types/domain'
import { daysUntil, fmtCurrency, fmtDate } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const isNew = computed(() => props.id === 'new')
const project = computed(() => store.state.projects.find(entry => entry.id === props.id))
const participations = computed(() => store.state.projectParticipations.filter(entry => entry.projectId === props.id))
const owners = computed(() => store.state.users.filter(entry => entry.role !== 'Operador'))
const clients = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Cliente')))
const products = computed(() => store.state.items.filter(entry => entry.type === 'PA'))

const form = reactive({
  name: props.context.name ?? '', kind: (props.context.opportunityId ? 'Cliente' : 'Produto novo') as Project['kind'],
  ownerId: owners.value.find(entry => entry.role === 'Engenharia')?.id ?? owners.value[0]?.id ?? '',
  partnerId: props.context.partnerId ?? '', opportunityId: props.context.opportunityId ?? '', itemId: '',
  startDate: today(), endDate: addDays(today(), 60), budget: 50000, description: '',
})

function create() {
  const created = store.createProject({
    ...form, partnerId: form.partnerId || undefined, opportunityId: form.opportunityId || undefined, itemId: form.itemId || undefined, description: form.description || undefined,
  })
  if (created && created !== true) ui.openRecord('project', created.id)
}

const milestone = reactive({ title: '', dueDate: addDays(today(), 14) })
const risk = ref('')
const done = computed(() => project.value?.milestones.filter(entry => entry.done).length ?? 0)
const progress = computed(() => project.value?.milestones.length ? Math.round(done.value / project.value.milestones.length * 100) : 0)
const elapsed = computed(() => {
  if (!project.value) return 0
  const span = new Date(project.value.endDate).getTime() - new Date(project.value.startDate).getTime()
  return Math.min(100, Math.max(0, Math.round((Date.now() - new Date(project.value.startDate).getTime()) / span * 100)))
})
const late = computed(() => project.value?.milestones.filter(entry => !entry.done && entry.dueDate < today()) ?? [])
const budget = computed(() => store.state.budgets.find(entry => entry.id === project.value?.budgetId))
const projectPlan = computed(() => store.state.budgetEntries.find(entry => entry.sourceModule === 'Projetos' && entry.sourceId === props.id && entry.kind === 'Previsão'))
const projectCosts = computed(() => store.state.budgetEntries.filter(entry => entry.projectId === props.id && entry.sourceId !== props.id && entry.status !== 'Cancelado').reduce((sum, entry) => sum + (entry.kind === 'Previsão' ? entry.openAmount : entry.amount), 0))
const projectRealized = computed(() => store.state.budgetEntries.filter(entry => entry.projectId === props.id && entry.kind === 'Realizado pago' && entry.status !== 'Cancelado').reduce((sum, entry) => sum + entry.amount, 0))
const budgetUse = computed(() => projectPlan.value?.amount ? Math.round(projectCosts.value / projectPlan.value.amount * 100) : 0)
const demands = computed(() => store.state.demands.filter(entry => entry.projectId === props.id || (entry.origin === 'Projeto' && entry.originId === props.id)))
const purchases = computed(() => store.state.purchaseOrders.filter(entry => entry.projectId === props.id))
const opportunity = computed(() => store.state.opportunities.find(entry => entry.id === project.value?.opportunityId))
const revision = computed(() => project.value?.itemId ? store.state.productRevisions.find(entry => entry.itemId === project.value!.itemId && entry.status === 'Rascunho') : undefined)
/** Itens que apontam para este projeto na aba Projetos do cadastro, com a atividade da EAP de cada vínculo. */
const linkedItems = computed(() => store.state.items.flatMap(item =>
  (item.catalog?.projectLinks ?? []).filter(link => link.projectId === props.id).map(link => ({
    item, link, milestone: project.value?.milestones.find(entry => entry.id === link.milestoneId),
  }))))
const health = computed(() => {
  if (!project.value || project.value.status === 'Concluído' || project.value.status === 'Cancelado') return { tone: 'neutral', label: project.value?.status ?? '' }
  if (late.value.length > 1 || budgetUse.value > 100) return { tone: 'danger', label: 'Crítico' }
  if (late.value.length || budgetUse.value > 85 || progress.value + 15 < elapsed.value) return { tone: 'warning', label: 'Atenção' }
  return { tone: 'success', label: 'No prazo' }
})

function addMilestone() {
  if (store.addMilestone(props.id, milestone.title, milestone.dueDate)) milestone.title = ''
}

function addRisk() {
  if (store.addProjectRisk(props.id, risk.value)) risk.value = ''
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader eyebrow="Gestão · novo projeto" title="Novo projeto" subtitle="Os marcos são sugeridos pelo tipo e distribuídos no prazo. O orçamento cria um centro de controle próprio." />
    <div class="drawer-body">
      <div class="field"><label>Nome</label><input v-model="form.name" placeholder="Ex.: Case Mining Galaxy Tab S10" /></div>
      <div class="form-grid">
        <div class="field"><label>Tipo</label><select v-model="form.kind"><option>Produto novo</option><option>Molde</option><option>Melhoria</option><option>Cliente</option></select></div>
        <div class="field"><label>Responsável</label><select v-model="form.ownerId"><option v-for="user in owners" :key="user.id" :value="user.id">{{ user.name }} · {{ user.role }}</option></select></div>
        <div class="field"><label>Cliente</label><select v-model="form.partnerId"><option value="">Interno</option><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></div>
        <div class="field"><label>Produto relacionado</label><select v-model="form.itemId"><option value="">Nenhum</option><option v-for="item in products" :key="item.id" :value="item.id">{{ store.itemLabel(item.id) }}</option></select></div>
        <div class="field"><label>Início</label><input v-model="form.startDate" type="date" /></div>
        <div class="field"><label>Término previsto</label><input v-model="form.endDate" type="date" /></div>
        <div class="field"><label>Orçamento (R$)</label><input v-model.number="form.budget" type="number" min="0" step="1000" /><small>Zero para não controlar</small></div>
        <div v-if="form.opportunityId" class="field"><label>Oportunidade</label><input :value="form.opportunityId" disabled /></div>
      </div>
      <div class="field"><label>Objetivo</label><textarea v-model="form.description" rows="3" placeholder="Problema, escopo e critério de sucesso"></textarea></div>
      <div class="drawer-actions">
        <button class="button" @click="create">Criar projeto</button>
        <button class="button secondary" @click="ui.closeRecord">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="project">
    <RecordHeader :eyebrow="`${project.kind} · ${project.id}`" :title="project.name" :subtitle="`${store.userName(project.ownerId)}${project.partnerId ? ` · ${store.partnerName(project.partnerId)}` : ' · interno'} · ${fmtDate(project.startDate)} a ${fmtDate(project.endDate)}`">
      <template #actions>
        <select class="filter" :value="project.status" @change="store.setProjectStatus(project.id, ($event.target as HTMLSelectElement).value as Project['status'])">
          <option>Planejado</option><option>Em andamento</option><option>Concluído</option><option>Cancelado</option>
        </select>
      </template>
    </RecordHeader>
    <div class="drawer-body">
      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ progress }}%</strong><span>{{ done }}/{{ project.milestones.length }} marcos</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': daysUntil(project.endDate) < 0 && project.status !== 'Concluído' }">{{ daysUntil(project.endDate) < 0 ? `${-daysUntil(project.endDate)} d atraso` : `${daysUntil(project.endDate)} dias` }}</strong><span>para o término</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': budgetUse > 85 }">{{ budget ? `${budgetUse}%` : '—' }}</strong><span>orçamento consumido</span></div>
        <div class="mini-stat"><strong><StatusBadge :value="health.label" :tone="health.tone" /></strong><span>saúde</span></div>
      </div>
      <div class="dual-progress">
        <div><span>Avanço físico</span><div class="progress wide"><span :style="{ width: `${progress}%` }"></span></div></div>
        <div><span>Prazo decorrido</span><div class="progress wide time"><span :style="{ width: `${elapsed}%` }"></span></div></div>
      </div>
      <div v-if="late.length" class="notice warning">{{ late.length }} marco(s) atrasado(s): {{ late.map(entry => entry.title).join(', ') }}</div>
      <p v-if="project.description" class="hint">{{ project.description }}</p>

      <div class="drawer-actions" data-tour="project-actions">
        <button class="button" @click="ui.openRecord('demand', 'new', { origin: 'Projeto', originId: project.id, kind: 'Material' })"><PackagePlus :size="15" /> Solicitar material</button>
        <button class="button secondary" @click="ui.openRecord('demand', 'new', { origin: 'Projeto', originId: project.id, kind: 'Serviço' })"><PackagePlus :size="15" /> Contratar serviço</button>
      </div>

      <h3 class="drawer-title">Marcos</h3>
      <div class="milestone-track" data-tour="project-milestones">
        <label v-for="entry in project.milestones" :key="entry.id" class="milestone-row" :class="{ done: entry.done, late: !entry.done && entry.dueDate < today() }">
          <input type="checkbox" :checked="entry.done" @change="store.toggleMilestone(project.id, entry.id)" />
          <Flag :size="14" />
          <div><strong>{{ entry.title }}</strong><span>{{ fmtDate(entry.dueDate) }} · {{ store.userName(entry.ownerId ?? project.ownerId) }}<template v-if="entry.doneAt"> · concluído {{ fmtDate(entry.doneAt) }}</template></span></div>
          <StatusBadge :value="entry.done ? 'Concluído' : entry.dueDate < today() ? 'Atrasado' : daysUntil(entry.dueDate) <= 7 ? 'Esta semana' : 'Planejado'" :tone="entry.done ? 'success' : entry.dueDate < today() ? 'danger' : daysUntil(entry.dueDate) <= 7 ? 'warning' : 'neutral'" />
        </label>
      </div>
      <div class="inline-form row">
        <input v-model="milestone.title" class="filter grow" placeholder="Novo marco" @keyup.enter="addMilestone" />
        <input v-model="milestone.dueDate" class="filter" type="date" />
        <button class="button small" @click="addMilestone"><Plus :size="14" /> Marco</button>
      </div>

      <div data-tour="project-costs">
      <h3 class="drawer-title">Orçamento e custos</h3>
      <button v-if="budget" class="list-row" @click="ui.openRecord('budget', budget.id)">
        <div><strong>P&amp;D · {{ budget.period }}</strong><span>Previsão + realizado {{ fmtCurrency(projectCosts) }} · realizado pago {{ fmtCurrency(projectRealized) }} · orçamento do projeto {{ fmtCurrency(projectPlan?.amount ?? 0) }}</span></div>
        <div class="row-end"><div class="progress"><span :style="{ width: `${Math.min(100, budgetUse)}%` }"></span></div></div>
      </button>
      <button v-else class="list-row" @click="ui.openRecord('budget', 'new', { projectId: project.id, name: `Projeto ${project.name}` })">
        <div><strong>Sem orçamento</strong><span>Crie um orçamento para controlar compras e serviços do projeto</span></div><span class="link">Criar</span>
      </button>
      </div>

      <h3 class="drawer-title">Demandas e compras</h3>
      <button v-for="demand in demands" :key="demand.id" class="list-row" @click="ui.openRecord('demand', demand.id)">
        <div><strong>{{ demand.id }} · {{ demand.description }}</strong><span>{{ demand.quantity }} · necessário {{ fmtDate(demand.neededBy) }}</span></div><StatusBadge :value="demand.status" />
      </button>
      <button v-for="purchase in purchases" :key="purchase.id" class="list-row" @click="ui.openRecord('purchase', purchase.id)">
        <div><strong>{{ purchase.id }} · {{ store.partnerName(purchase.supplierId) }}</strong><span>{{ store.itemLabel(purchase.itemId) }} · {{ fmtCurrency(purchase.quantity * purchase.unitPrice) }}</span></div><StatusBadge :value="purchase.status" />
      </button>
      <p v-if="!demands.length && !purchases.length" class="empty-note">Nenhuma necessidade registrada para o projeto.</p>

      <template v-if="linkedItems.length">
        <h3 class="drawer-title">Itens do projeto</h3>
        <button v-for="entry in linkedItems" :key="`${entry.item.id}-${entry.link.milestoneId}`" class="list-row" @click="ui.closeRecord(); router.push(`/produtos/item/${entry.item.id}`)">
          <div>
            <strong>{{ store.itemLabel(entry.item.id) }}</strong>
            <span>{{ entry.milestone?.title ?? 'Sem atividade da EAP' }}<template v-if="entry.link.note"> · {{ entry.link.note }}</template> · vinculado por {{ entry.link.linkedBy }}</span>
          </div>
          <StatusBadge :value="entry.item.catalog?.lifecycle ?? '—'" :tone="entry.item.catalog?.lifecycle === 'Ativo' ? 'success' : 'warning'" />
        </button>
      </template>

      <template v-if="opportunity || project.itemId">
        <h3 class="drawer-title">Origem e resultado</h3>
        <button v-if="opportunity" class="list-row" @click="ui.openRecord('opportunity', opportunity.id)">
          <div><strong>{{ opportunity.id }} · {{ opportunity.title }}</strong><span>{{ fmtCurrency(opportunity.value) }}</span></div><StatusBadge :value="opportunity.stage" />
        </button>
        <button v-if="project.itemId" class="list-row" @click="ui.closeRecord(); router.push(`/produtos/item/${project.itemId}`)">
          <div><strong>{{ store.itemLabel(project.itemId) }}</strong><span>{{ revision ? `Revisão ${revision.code} em rascunho: ${revision.checklist.filter(entry => entry.done).length}/${revision.checklist.length} itens do checklist` : `Revisão vigente ${store.item(project.itemId).revision ?? '—'}` }}</span></div><span class="link">Produto</span>
        </button>
      </template>

      <h3 class="drawer-title">Equipe e riscos</h3>
      <div class="chip-row">
        <span v-for="memberId in project.memberIds ?? [project.ownerId]" :key="memberId" class="chip">{{ store.userName(memberId) }}</span>
        <span v-for="entry in participations" :key="entry.id" class="chip">{{ entry.displayName }} · {{ entry.role }}</span>
      </div>
      <p v-if="participations.length" class="hint">Quem vem de outra empresa aparece pelo nome, cargo e contato. Documento, salário e saúde não atravessam.</p>
      <div v-for="entry in project.risks ?? []" :key="entry" class="list-row static"><div><strong><AlertTriangle :size="13" /> {{ entry }}</strong></div></div>
      <div class="inline-form row">
        <input v-model="risk" class="filter grow" placeholder="Registrar risco ou impedimento" @keyup.enter="addRisk" />
        <button class="button secondary small" @click="addRisk">Registrar</button>
      </div>

      <RecordTimeline :ref-id="project.id" />
    </div>
  </template>
  <p v-else class="empty-note">Projeto não encontrado.</p>
</template>
