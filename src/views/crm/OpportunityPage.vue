<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarPlus, ChevronRight, FilePlus2, FolderPlus, ThumbsDown } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import CrumbBack from '../../components/CrumbBack.vue'
import RichText from '../../components/RichText.vue'
import RecordTimeline from '../../components/records/RecordTimeline.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { CRM_STAGES, opportunityIsOpen, proposalTotal } from '../../domain/enterprise'
import { roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { CrmActivity, Opportunity } from '../../types/domain'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format'
import { CRM_SOURCES, LOSS_REASONS, attentionOf, useCrmScope } from './shared'

type Tab = 'dados' | 'acoes' | 'observacoes' | 'propostas' | 'desenvolvimento' | 'historico'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const { sellers, tenantName } = useCrmScope()

const opportunity = computed(() => store.state.opportunities.find(entry => entry.id === route.params.id))
const closed = computed(() => !!opportunity.value && !opportunityIsOpen(opportunity.value))
const partner = computed(() => store.state.partners.find(entry => entry.id === opportunity.value?.partnerId))
const clients = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Cliente') || entry.id === opportunity.value?.partnerId))
const products = computed(() => store.state.items.filter(entry => entry.type === '04'))
const materials = computed(() => store.state.items.filter(entry => entry.type === '01' || entry.type === '02' || entry.type === '07'))
const proposals = computed(() => store.state.proposals.filter(entry => entry.opportunityId === opportunity.value?.id))
const salesOrders = computed(() => proposals.value.map(entry => store.state.salesOrders.find(order => order.id === entry.salesOrderId)).filter(order => !!order))
const changes = computed(() => store.state.engineeringChanges.filter(entry => entry.opportunityId === opportunity.value?.id))
const demands = computed(() => store.state.demands.filter(entry => entry.origin === 'Oportunidade' && entry.originId === opportunity.value?.id))
const demandCost = computed(() => demands.value.reduce((sum, entry) => sum + (entry.estimatedCost ?? 0), 0))
const projects = computed(() => store.state.projects.filter(entry => entry.opportunityId === opportunity.value?.id))
const activities = computed(() => [...(opportunity.value?.activities ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at)))
const nextActivity = computed(() => activities.value.find(entry => !entry.done))
const clientOrders = computed(() => store.state.salesOrders.filter(entry => entry.customerId === opportunity.value?.partnerId).slice(0, 5))
const clientTechnical = computed(() => store.state.technicalServiceOrders.filter(entry => entry.partnerId === opportunity.value?.partnerId))
const signals = computed(() => opportunity.value ? attentionOf(opportunity.value, today()) : [])
const initials = computed(() => store.partnerName(opportunity.value?.partnerId ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase())

const tabs = computed(() => [
  { id: 'dados' as const, label: 'Dados' },
  { id: 'acoes' as const, label: 'Ações', count: activities.value.filter(entry => !entry.done).length },
  { id: 'observacoes' as const, label: 'Observações' },
  { id: 'propostas' as const, label: 'Propostas', count: proposals.value.length },
  { id: 'desenvolvimento' as const, label: 'Desenvolvimento', count: changes.value.length + demands.value.length },
  { id: 'historico' as const, label: 'Histórico' },
])
const tab = computed<Tab>(() => tabs.value.some(entry => entry.id === route.query.aba) ? route.query.aba as Tab : 'dados')
const openTab = (aba: Tab) => router.replace({ query: { aba } })

const editable = () => {
  const entry = opportunity.value
  return {
    partnerId: entry?.partnerId ?? '', title: entry?.title ?? '', contact: entry?.contact ?? '', phone: entry?.phone ?? '', email: entry?.email ?? '',
    ownerId: entry?.ownerId ?? '', source: entry?.source ?? '', temperature: entry?.temperature ?? 'Morno' as Opportunity['temperature'],
    expectedClose: entry?.expectedClose ?? today(), value: entry?.value ?? 0, mrr: entry?.mrr ?? 0, quantity: entry?.quantity ?? 1,
    itemIds: [...(entry?.itemIds ?? [])], statusNote: entry?.statusNote ?? '', nextAction: entry?.nextAction ?? '', notes: entry?.notes ?? '',
  }
}
const form = reactive(editable())
const formPartner = computed(() => store.state.partners.find(entry => entry.id === form.partnerId))
const knownContact = computed(() => formPartner.value?.contacts.some(entry => entry.name === form.contact) ?? false)
function pickContact() {
  const entry = formPartner.value?.contacts.find(item => item.name === form.contact)
  if (!entry) return
  form.phone = entry.phone ?? ''
  form.email = entry.email ?? ''
}
watch(() => form.contact, pickContact)
watch(() => form.partnerId, (id, previous) => {
  if (!previous || id === previous) return
  const first = store.state.partners.find(entry => entry.id === id)?.contacts[0]
  form.contact = first?.name ?? ''
  form.phone = first?.phone ?? ''
  form.email = first?.email ?? ''
})
const observation = ref('')
const resetObservation = () => { observation.value = opportunity.value?.observation ?? '' }
const observationDirty = computed(() => observation.value !== (opportunity.value?.observation ?? ''))
function saveObservation() {
  if (opportunity.value && store.updateOpportunity(opportunity.value.id, { observation: observation.value })) resetObservation()
}
const reset = () => Object.assign(form, editable())
watch(() => opportunity.value?.id, () => { reset(); resetObservation() }, { immediate: true })
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(editable()))
const estimate = computed(() => form.itemIds.reduce((sum, itemId) => sum + Math.round(store.item(itemId).cost * 2.4) * form.quantity, 0))
function save() {
  if (opportunity.value && store.updateOpportunity(opportunity.value.id, { ...form, segment: formPartner.value?.vertical, contact: form.contact || partner.value?.contact })) reset()
}

function move(stage: Opportunity['stage']) {
  if (opportunity.value && !closed.value && stage !== opportunity.value.stage) store.moveOpportunity(opportunity.value.id, stage)
}

const losing = ref(false)
const loss = reactive({ reason: LOSS_REASONS[0], detail: '' })
function lose() {
  if (opportunity.value && store.loseOpportunity(opportunity.value.id, loss.detail ? `${loss.reason}: ${loss.detail}` : loss.reason)) losing.value = false
}

const activity = reactive<{ type: CrmActivity['type']; text: string; date: string }>({ type: 'Ligação', text: '', date: addDays(today(), 1) })
function schedule() {
  if (opportunity.value && store.addActivity(opportunity.value.id, { type: activity.type, text: activity.text, at: `${activity.date}T09:00:00.000Z` })) activity.text = ''
}

function newProposal() {
  if (!opportunity.value) return
  const created = store.createProposal(opportunity.value.id)
  if (created && created !== true) ui.openRecord('proposal', created.id)
}

const demand = reactive({ itemId: '', quantity: 1, neededBy: addDays(today(), 15) })
function askDemand() {
  const entry = opportunity.value
  if (!entry || !demand.itemId) return
  const created = store.createDemand({
    kind: 'Material', itemId: demand.itemId, description: `${store.item(demand.itemId).name} para ${entry.id}`, quantity: demand.quantity,
    origin: 'Oportunidade', originId: entry.id, neededBy: demand.neededBy, priority: 'Normal', assigneeRole: 'Compras',
  })
  if (created) demand.itemId = ''
}
</script>

<template>
  <nav class="crumb-bar" aria-label="Caminho">
    <CrumbBack fallback="/crm/oportunidades" title="Voltar para Oportunidades" />
    <RouterLink to="/crm/oportunidades" class="crumb">Oportunidades</RouterLink>
    <ChevronRight :size="14" class="sep" />
    <span class="crumb here">{{ opportunity ? `${opportunity.id} · ${opportunity.title}` : 'Oportunidade não encontrada' }}</span>
  </nav>

  <div v-if="!opportunity" class="card empty-note">Oportunidade não encontrada. <RouterLink to="/crm/oportunidades">Voltar à lista</RouterLink></div>

  <template v-else>
    <article class="card item-hero opp-hero" data-tour="opp-header">
      <div class="item-head">
        <div class="item-photo placeholder">{{ initials }}</div>
        <div class="item-head-main">
          <span class="eyebrow">{{ opportunity.id }} · {{ opportunity.dealType ?? 'Venda' }} · {{ partner?.vertical ?? 'Sem vertical' }} · {{ opportunity.source }}</span>
          <h2>{{ opportunity.title }}</h2>
          <div class="meta">
            <RouterLink :to="`/parceiros/${opportunity.partnerId}`">{{ store.partnerName(opportunity.partnerId) }}</RouterLink>
            <span>{{ partner?.document }}</span>
            <span>Vendedor <b>{{ store.userName(opportunity.ownerId) }}</b></span>
            <span>{{ tenantName(opportunity.tenantId) }}</span>
            <span v-if="opportunity.createdAt">Criada em {{ fmtDate(opportunity.createdAt) }}</span>
          </div>
          <div v-if="signals.length" class="flag-list" style="margin-top:8px"><span v-for="signal in signals" :key="signal" class="status warning">{{ signal }}</span></div>
        </div>
        <div class="actions" data-tour="opp-actions">
          <StatusBadge :value="opportunity.stage" />
          <template v-if="!closed">
            <button class="button small" @click="newProposal"><FilePlus2 :size="13" /> Criar proposta</button>
            <button class="button secondary small" @click="losing = true"><ThumbsDown :size="13" /> Marcar como perdida</button>
          </template>
        </div>
      </div>

      <div v-if="opportunity.stage === 'Perdida'" class="notice danger">Perdida: {{ opportunity.lossReason }}</div>
      <div v-else class="stage-stepper" data-tour="opp-stages">
        <button v-for="(stage, index) in CRM_STAGES" :key="stage" class="stage-step as-button" :class="{ done: index < CRM_STAGES.indexOf(opportunity.stage), current: stage === opportunity.stage }" :disabled="closed || stage === 'Conquista'" :title="stage === 'Conquista' ? 'Conquistada ao aceitar a proposta' : `Mover para ${stage}`" @click="move(stage)">
          <i></i><span>{{ stage }}</span>
        </button>
      </div>

      <div class="kpi-strip" data-tour="opp-kpis">
        <button type="button" class="kpi link" @click="openTab('dados')"><span>Ticket</span><strong>{{ fmtCurrency(opportunity.value) }}</strong><small>{{ proposals.length ? 'pela última proposta' : 'estimado' }}</small></button>
        <button type="button" class="kpi link" @click="openTab('dados')"><span>MRR</span><strong>{{ fmtCurrency(opportunity.mrr ?? 0) }}</strong><small>entra na meta</small></button>
        <div class="kpi"><span>Temperatura · prob.</span><strong>{{ opportunity.temperature ?? 'Morno' }} · {{ opportunity.probability }}%</strong><small>a probabilidade vem da fase</small></div>
        <button type="button" class="kpi link" :class="{ danger: !closed && opportunity.expectedClose < today() }" @click="openTab('dados')"><span>Fechamento</span><strong>{{ fmtDate(opportunity.expectedClose) }}</strong><small>{{ opportunity.wonAt ? `conquistada em ${fmtDate(opportunity.wonAt)}` : 'previsão' }}</small></button>
        <button type="button" class="kpi link" :class="{ warning: !closed && !nextActivity }" @click="openTab('acoes')"><span>Próxima ação</span><strong>{{ nextActivity ? fmtDate(nextActivity.at) : '—' }}</strong><small>{{ nextActivity?.text ?? 'Nenhuma agendada' }}</small></button>
        <button type="button" class="kpi link" @click="openTab('desenvolvimento')"><span>Custo total</span><strong>{{ fmtCurrency(demandCost) }}</strong><small>{{ demands.length }} demanda(s) · {{ changes.length }} PAP</small></button>
      </div>
    </article>

    <article class="card">
      <div class="tabs" data-tour="opp-tabs">
        <button v-for="entry in tabs" :key="entry.id" type="button" :class="{ active: tab === entry.id }" @click="openTab(entry.id)">{{ entry.label }}<b v-if="entry.count">{{ entry.count }}</b></button>
      </div>

      <div v-if="tab === 'dados'">
        <p v-if="closed" class="hint">Oportunidade encerrada. Os dados ficam só para consulta.</p>
        <section class="person-section">
          <h3>Status</h3>
          <div class="field"><textarea v-model="form.statusNote" rows="2" :disabled="closed" placeholder="Situação atual, em uma frase. Ex.: cliente aguardando aprovação da diretoria."></textarea></div>
        </section>
        <section class="person-section">
          <h3>Cliente e contato</h3>
          <div class="form-grid">
            <div class="field"><label>Cliente</label><select v-model="form.partnerId" :disabled="closed"><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.document }} · {{ client.name }}</option></select><small v-if="!closed"><button type="button" class="link" @click="router.push({ path: '/parceiros', query: { novo: 'cliente' } })">Cadastrar cliente</button></small></div>
            <div class="field"><label>Contato</label><select v-model="form.contact" :disabled="closed || !formPartner?.contacts.length"><option v-if="form.contact && !knownContact" :value="form.contact">{{ form.contact }}</option><option v-for="entry in formPartner?.contacts ?? []" :key="entry.name" :value="entry.name">{{ entry.name }}<template v-if="entry.duty"> · {{ entry.duty }}</template></option></select><small v-if="!closed && form.partnerId"><button type="button" class="link" @click="router.push({ path: `/parceiros/${form.partnerId}`, query: { aba: 'contatos', novo: 'contato' } })">Cadastrar contato</button><template v-if="!formPartner?.contacts.length"> · este cliente ainda não tem contato</template></small></div>
            <div class="field"><label>Telefone</label><input :value="form.phone || '—'" disabled /><small>Vem do contato cadastrado.</small></div>
            <div class="field"><label>E-mail</label><input :value="form.email || '—'" disabled /></div>
          </div>
        </section>
        <section class="person-section">
          <h3>Negócio</h3>
          <div class="form-grid">
            <div class="field"><label>Título</label><input v-model="form.title" :disabled="closed" /></div>
            <div class="field"><label>Vendedor</label><select v-model="form.ownerId" :disabled="closed"><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select></div>
            <div class="field"><label>Tipo</label><select disabled><option>Venda</option></select></div>
            <div class="field"><label>Origem</label><select v-model="form.source" :disabled="closed"><option v-for="source in CRM_SOURCES" :key="source">{{ source }}</option></select></div>
            <div class="field"><label>Vertical</label><input :value="formPartner?.vertical || 'Não informada no cliente'" disabled /><small v-if="!closed && form.partnerId"><button type="button" class="link" @click="router.push({ path: `/parceiros/${form.partnerId}`, query: { aba: 'cliente' } })">Editar no cadastro do cliente</button></small></div>
            <div class="field"><label>Temperatura</label><select v-model="form.temperature" :disabled="closed"><option>Quente</option><option>Morno</option><option>Frio</option></select></div>
            <div class="field"><label>Previsão de fechamento</label><input v-model="form.expectedClose" type="date" :disabled="closed" /></div>
            <div class="field"><label>MRR</label><input v-model.number="form.mrr" type="number" min="0" :disabled="closed" /><small>Receita mensal. É o que conta para a meta.</small></div>
            <div class="field"><label>Ticket</label><input v-model.number="form.value" type="number" min="0" :disabled="closed" /><small v-if="estimate && !closed">Pelos produtos: {{ fmtCurrency(estimate) }} <button type="button" class="link" @click="form.value = estimate">usar</button></small></div>
          </div>
        </section>
        <section class="person-section">
          <h3>Produtos de interesse</h3>
          <div class="check-grid">
            <label v-for="product in products" :key="product.id" class="check-option"><input v-model="form.itemIds" type="checkbox" :value="product.id" :disabled="closed" /> {{ store.itemLabel(product.id) }}</label>
          </div>
          <div class="form-grid" style="margin-top:10px">
            <div class="field"><label>Quantidade estimada</label><input v-model.number="form.quantity" type="number" min="1" :disabled="closed" /><small>Os produtos marcados viram as linhas da proposta.</small></div>
          </div>
        </section>
        <section class="person-section">
          <h3>Motivação</h3>
          <div class="field"><textarea v-model="form.notes" rows="3" :disabled="closed" placeholder="Dores do cliente, concorrentes, condições especiais"></textarea></div>
        </section>
        <div v-if="!closed" class="save-bar">
          <button class="button secondary" :disabled="!dirty" @click="reset">Descartar</button>
          <button class="button" :disabled="!dirty" @click="save">Salvar</button>
        </div>
        <section class="person-section">
          <h3>Histórico do cliente</h3>
          <div class="kpi-strip" style="border-top:0; padding-top:0">
            <div class="kpi"><span>Pedidos recentes</span><strong>{{ clientOrders.length }}</strong></div>
            <div class="kpi"><span>Assistência</span><strong>{{ clientTechnical.length }}</strong><small>chamados</small></div>
          </div>
          <button v-for="order in clientOrders" :key="order.id" class="list-row" @click="ui.orderDrawer = order.id">
            <div><strong>{{ order.id }} · {{ store.itemLabel(order.itemId) }}</strong><span>{{ order.quantity }} un. · {{ fmtCurrency(order.value) }}</span></div>
            <StatusBadge :value="store.stage(order)" />
          </button>
          <button v-for="technical in clientTechnical" :key="technical.id" class="list-row" @click="ui.openRecord('technical', technical.id)">
            <div><strong>{{ technical.id }} · assistência</strong><span>{{ technical.description }}</span></div>
            <StatusBadge :value="technical.status" />
          </button>
        </section>
      </div>

      <div v-else-if="tab === 'acoes'" data-tour="opp-activities">
        <div v-if="!closed" class="inline-form row">
          <select v-model="activity.type" class="filter"><option>Ligação</option><option>E-mail</option><option>Reunião</option><option>Tarefa</option></select>
          <input v-model="activity.text" class="filter grow" placeholder="O que precisa ser feito?" @keyup.enter="schedule" />
          <input v-model="activity.date" class="filter" type="date" />
          <button class="button small" @click="schedule"><CalendarPlus :size="14" /> Agendar</button>
        </div>
        <label v-for="entry in activities" :key="entry.id" class="list-row check-line" :class="{ muted: entry.done }">
          <input type="checkbox" :checked="entry.done" @change="store.toggleActivity(opportunity.id, entry.id)" />
          <div><strong>{{ entry.text }}</strong><span>{{ entry.type }} · {{ fmtDateTime(entry.at) }}</span></div>
          <StatusBadge :value="entry.done ? 'Concluída' : entry.at.slice(0, 10) < today() ? 'Vencido' : 'Agendada'" />
        </label>
        <p v-if="!activities.length" class="empty-note">Nenhuma atividade. Toda oportunidade aberta precisa de uma próxima ação.</p>
      </div>

      <div v-else-if="tab === 'observacoes'">
        <RichText v-model="observation" :disabled="closed" />
        <div v-if="!closed" class="save-bar">
          <button class="button secondary" :disabled="!observationDirty" @click="resetObservation">Descartar</button>
          <button class="button" :disabled="!observationDirty" @click="saveObservation">Salvar</button>
        </div>
      </div>

      <div v-else-if="tab === 'propostas'" data-tour="opp-proposals">
        <div v-if="!closed" class="action-row" style="margin-bottom:10px"><button class="button small" @click="newProposal"><FilePlus2 :size="13" /> Criar proposta</button></div>
        <table class="dense">
          <thead><tr><th>Proposta</th><th>Itens</th><th>Total</th><th>Validade</th><th>Pedido</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="proposal in proposals" :key="proposal.id" class="clickable" @click="ui.openRecord('proposal', proposal.id)">
              <td><span class="cell-main code">{{ proposal.id }}</span><span class="cell-sub">{{ fmtDate(proposal.createdAt) }}</span></td>
              <td>{{ proposal.lines.length }} linha(s)</td>
              <td><b>{{ fmtCurrency(proposalTotal(proposal)) }}</b></td>
              <td :class="{ 'risk-text': proposal.status === 'Enviada' && proposal.validUntil < today() }">{{ fmtDate(proposal.validUntil) }}</td>
              <td @click.stop><button v-if="proposal.salesOrderId" class="link" @click="ui.orderDrawer = proposal.salesOrderId">{{ salesOrders.find(order => order.id === proposal.salesOrderId)?.omieId ?? proposal.salesOrderId }}</button><span v-else class="cell-sub">—</span></td>
              <td><StatusBadge :value="proposal.status" /></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!proposals.length" class="empty-note">Nenhuma proposta vinculada.</p>
      </div>

      <div v-else-if="tab === 'desenvolvimento'">
        <section class="person-section">
          <h3>Novo produto</h3>
          <div class="list-row static">
            <div><strong>Pedido de mudança (PAP)</strong><span>Abre a mudança de engenharia ligada a esta oportunidade. A engenharia segue com ela em Produtos.</span></div>
            <button class="button small" :disabled="closed" @click="store.requestOpportunityChange(opportunity.id)">Criação de PAP</button>
          </div>
          <RouterLink v-for="change in changes" :key="change.id" to="/produtos/acoes" class="list-row">
            <div><strong>{{ change.id }} · {{ change.title }}</strong><span>Pedido em {{ fmtDate(change.requestedAt) }} · {{ change.requestedBy }}</span></div>
            <StatusBadge :value="change.stage" />
          </RouterLink>
          <div class="list-row static">
            <div><strong>Projeto de desenvolvimento</strong><span>{{ projects.length ? `${projects.length} projeto(s) ligado(s)` : 'Para quando o desenvolvimento pede marcos e equipe.' }}</span></div>
            <button class="button secondary small" :disabled="closed" @click="ui.openRecord('project', 'new', { opportunityId: opportunity.id, partnerId: opportunity.partnerId, name: opportunity.title })"><FolderPlus :size="13" /> Abrir projeto</button>
          </div>
          <button v-for="project in projects" :key="project.id" class="list-row" @click="ui.openRecord('project', project.id)">
            <div><strong>{{ project.id }} · {{ project.name }}</strong><span>{{ project.milestones.filter(entry => entry.done).length }}/{{ project.milestones.length }} marcos</span></div>
            <StatusBadge :value="project.status" />
          </button>
        </section>
        <section class="person-section">
          <h3>Demandas</h3>
          <div v-if="!closed" class="inline-form row">
            <select v-model="demand.itemId" class="filter grow"><option value="">Material…</option><option v-for="item in materials" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select>
            <input v-model.number="demand.quantity" class="filter narrow" type="number" min="1" aria-label="Quantidade" />
            <input v-model="demand.neededBy" class="filter" type="date" aria-label="Necessário em" />
            <button class="button small" :disabled="!demand.itemId" @click="askDemand">Nova demanda</button>
          </div>
          <table class="dense">
            <thead><tr><th>Número</th><th>Item</th><th>Necessário em</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="entry in demands" :key="entry.id" class="clickable" @click="ui.openRecord('demand', entry.id)">
                <td><span class="cell-main code">{{ entry.id }}</span></td>
                <td>{{ entry.description }}<span class="cell-sub">{{ entry.quantity }} {{ entry.itemId ? store.item(entry.itemId).unit : '' }}</span></td>
                <td>{{ fmtDate(entry.neededBy) }}</td>
                <td>{{ fmtCurrency(entry.estimatedCost ?? 0) }}</td>
                <td><StatusBadge :value="entry.status" /></td>
              </tr>
            </tbody>
            <tfoot v-if="demands.length"><tr><td colspan="3"><b>Custo total</b></td><td><b>{{ fmtCurrency(demandCost) }}</b></td><td></td></tr></tfoot>
          </table>
          <p v-if="!demands.length" class="empty-note">Nenhuma demanda criada.</p>
        </section>
      </div>

      <div v-else>
        <RecordTimeline :ref-id="opportunity.id" :created-at="opportunity.createdAt" created-text="Oportunidade registrada" />
      </div>
    </article>

    <BaseModal :open="losing" title="Marcar como perdida" :subtitle="`${opportunity.id} · as propostas em aberto serão recusadas`" width="460px" @close="losing = false">
      <div class="field"><label>Motivo</label><select v-model="loss.reason"><option v-for="reason in LOSS_REASONS" :key="reason">{{ reason }}</option></select></div>
      <div class="field"><label>Detalhe</label><input v-model="loss.detail" placeholder="Opcional" /></div>
      <template #footer>
        <button class="button secondary" @click="losing = false">Cancelar</button>
        <button class="button danger" @click="lose">Confirmar perda</button>
      </template>
    </BaseModal>
  </template>
</template>
