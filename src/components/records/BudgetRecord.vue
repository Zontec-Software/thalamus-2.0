<script setup lang="ts">
import { computed, reactive } from 'vue'
import MoneyInput from '../MoneyInput.vue'
import ReasonField from '../ReasonField.vue'
import RecordHeader from './RecordHeader.vue'
import { budgetSummary, budgetWindow, childrenOf, costCenterAmounts, invoiceOrigin, linkableDocuments, subcategorySummary } from '../../domain/budget'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { BudgetEntry, InvoiceLinkModule } from '../../types/domain'
import { fmtCurrency, fmtDateTime } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()
const isNew = computed(() => props.id === 'new')
const allocation = computed(() => store.state.budgets.find(entry => entry.id === props.id))
const category = computed(() => store.state.budgetCategories.find(entry => entry.id === allocation.value?.categoryId))
const viewKey = computed(() => props.context.window || allocation.value?.period || yearDefault())
const viewLabel = computed(() => { try { return budgetWindow(viewKey.value).label } catch { return viewKey.value } })
const summary = computed(() => allocation.value ? budgetSummary(store.state, allocation.value.categoryId, viewKey.value) : undefined)
const entries = computed(() => summary.value?.entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [])
const subcategories = computed(() => allocation.value
  ? childrenOf(store.state, allocation.value.categoryId).map(entry => ({
    category: entry,
    allocation: store.state.budgets.find(item => item.categoryId === entry.id && item.period === allocation.value!.period),
    ...budgetSummary(store.state, entry.id, viewKey.value),
    ...subcategorySummary(store.state, entry.id, viewKey.value),
    annual: store.state.budgets.find(item => item.categoryId === entry.id && item.period === allocation.value!.period)?.amount ?? 0,
  }))
  : [])
function yearDefault() {
  return props.context.year || '2026'
}
const categoryName = (id: string) => store.state.budgetCategories.find(entry => entry.id === id)?.name ?? id
const canManage = computed(() => store.can('orcamentos.gerir'))
const shares = computed(() => {
  if (!summary.value) return { realized: 0, forecast: 0 }
  const base = Math.max(summary.value.amount, summary.value.realized + summary.value.forecast, 1)
  return { realized: summary.value.realized / base * 100, forecast: summary.value.forecast / base * 100 }
})
const usable = computed(() => store.state.budgetCategories.filter(entry => entry.tenantId === ui.activeTenantId && entry.status !== 'Inativa').sort((a, b) => a.code.localeCompare(b.code)))
const documents = computed(() => linkableDocuments(store.state))
const links = reactive<Record<string, string>>({})
function pendingLink(entry: BudgetEntry) {
  return store.state.budgetExceptions.find(item => item.kind === 'Sem vínculo' && item.status === 'Pendente' && item.sourceId === entry.externalId)
}
function saveLink(entry: BudgetEntry) {
  const exception = pendingLink(entry)
  const [module, documentId] = (links[entry.id] ?? '').split('|')
  if (exception && module && documentId) store.linkBudgetInvoice(exception.id, module as InvoiceLinkModule, documentId)
}
const form = reactive({ categoryId: props.context.categoryId ?? 'BC-CMV', period: props.context.year || '2026', amount: 0, reason: '' })

function create() {
  const created = store.createBudget(form)
  if (created && created !== true) ui.openRecord('budget', created.id)
}
const userName = (id?: string) => store.state.users.find(entry => entry.id === id)?.name ?? '—'
const sectorLines = computed(() => allocation.value?.costCenterSplit ? costCenterAmounts(allocation.value.amount, allocation.value.costCenterSplit) : [])
const uncovered = computed(() => sectorLines.value.length ? Math.round((100 - sectorLines.value.reduce((sum, line) => sum + line.percent, 0)) * 100) / 100 : 0)
const costCenterLabel = (id: string) => {
  const center = store.state.costCenters.find(entry => entry.id === id)
  return center ? `${center.code} ${center.name}` : id
}
const centerOwner = (id: string) => userName(store.state.costCenters.find(entry => entry.id === id)?.responsibleUserId)
function centersOf(categoryId: string) {
  const budget = store.state.budgets.find(entry => entry.categoryId === categoryId && entry.period === allocation.value?.period)
  const codes = (budget?.costCenterSplit?.lines ?? []).map(line => store.state.costCenters.find(entry => entry.id === line.costCenterId)?.code).filter(Boolean)
  return codes.length ? codes.join(', ') : 'sem centro'
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader eyebrow="Finanças · orçamento anual" title="Informar orçamento" subtitle="O valor é do ano inteiro. Não há aprovação; toda alteração fica auditada." />
    <div class="drawer-body">
      <div class="field"><label>Categoria</label><select v-model="form.categoryId"><option v-for="entry in usable" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option></select><small>Na subcategoria o valor fica nela. Numa categoria com filhas, o total do ano é dividido em partes iguais.</small></div>
      <div class="form-grid"><div class="field"><label>Ano</label><input v-model="form.period" inputmode="numeric" maxlength="4" /></div><div class="field"><label>Valor do ano</label><MoneyInput v-model="form.amount" /></div></div>
      <div class="field"><label>Motivo</label><ReasonField v-model="form.reason" /></div>
      <div class="drawer-actions"><button class="button" :disabled="!form.reason || !form.amount" @click="create">Salvar orçamento</button><button class="button secondary" @click="ui.closeRecord">Cancelar</button></div>
    </div>
  </template>

  <template v-else-if="allocation && category && summary">
    <RecordHeader :eyebrow="`Orçamento ${allocation.period} · ${viewLabel}`" :title="`${category.code} · ${category.name}`" :subtitle="`${category.group} · ${category.status}`" />
    <div class="drawer-body">
      <div class="mini-stats four" data-tour="budget-detail">
        <div class="mini-stat"><strong>{{ fmtCurrency(summary.amount) }}</strong><span>fatia do período</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(summary.forecast) }}</strong><span>previsão aberta</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(summary.realized) }}</strong><span>realizado pago</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': summary.balance < 0 }">{{ fmtCurrency(summary.balance) }}</strong><span>saldo</span></div>
      </div>
      <div class="stack-bar" role="img" :aria-label="`Realizado ${shares.realized.toFixed(1)}%. Previsão ${shares.forecast.toFixed(1)}%.`"><span class="realized" :style="{ width: `${shares.realized}%` }"></span><span class="forecast" :style="{ width: `${shares.forecast}%` }"></span></div>
      <div class="legend"><span class="realized">Realizado pago · {{ shares.realized.toFixed(1) }}%</span><span class="forecast">Previsão aberta · {{ shares.forecast.toFixed(1) }}%</span></div>
      <div v-if="summary.held" class="notice warning">{{ fmtCurrency(summary.held) }} em previsões retidas por falta de saldo do ano, fora do cálculo até o Gestor liberar em Ações.</div>
      <div v-if="summary.use >= allocation.alertThreshold" class="notice" :class="summary.balance < 0 ? 'danger' : 'warning'">{{ summary.use }}% consumido. Limiar desta categoria: {{ allocation.alertThreshold }}%. {{ allocation.blockOnOverrun ? 'Lançamento que deixar o saldo negativo fica retido.' : 'Somente alerta.' }}</div>
      <p v-if="viewKey !== allocation.period" class="cell-sub">Orçamento do ano {{ allocation.period }}: {{ fmtCurrency(allocation.amount) }}. Os números acima são a fatia de {{ viewLabel }}.</p>
      <div class="field">
        <label>Quem responde</label>
        <div v-if="sectorLines.length" class="cell-sub">
          <template v-for="(line, index) in sectorLines" :key="line.costCenterId">{{ index ? ' · ' : '' }}{{ costCenterLabel(line.costCenterId) }} ({{ centerOwner(line.costCenterId) }}) {{ fmtCurrency(line.amount) }}, {{ line.percent }}%</template>
          <template v-if="uncovered > 0"> · sem centro {{ uncovered }}%, com o Financeiro</template>
        </div>
        <div v-else class="cell-sub">{{ subcategories.length ? 'Os centros ficam em cada subcategoria.' : 'Nenhum centro escolhido. O Financeiro responde pela conta.' }}</div>
        <small>Os responsáveis dos centros recebem os alertas. Os centros se escolhem em Orçamentos, aba Categorias.</small>
      </div>

      <div v-if="subcategories.length" class="notice info">O valor do ano desta categoria é a soma das subcategorias. O ano de cada uma é editado na aba Categorias.</div>

      <template v-if="subcategories.length">
        <h3 class="drawer-title">Subcategorias</h3>
        <div v-for="entry in subcategories" :key="entry.category.id" class="list-row" @click="entry.allocation && ui.openRecord('budget', entry.allocation.id)">
          <div><strong>{{ entry.category.code }} · {{ entry.category.name }}</strong><span>{{ centersOf(entry.category.id) }} · ano {{ fmtCurrency(entry.annual) }} · neste período {{ fmtCurrency(entry.amount) }} · previsão {{ fmtCurrency(entry.forecast) }} · realizado {{ fmtCurrency(entry.realized) }}</span></div><b>{{ fmtCurrency(entry.annual) }}</b>
        </div>
      </template>

      <h3 class="drawer-title">Lançamentos</h3>
      <div v-for="entry in entries" :key="entry.id" class="list-row static">
        <div><strong>{{ entry.kind === 'Realizado pago' ? (entry.invoiceNumber ? `NF ${entry.invoiceNumber}` : 'Nota do Omie') : entry.sourceId }} · {{ entry.description }}</strong><span>{{ entry.kind }} · {{ entry.sourceModule }} · {{ entry.status }}<template v-if="entry.kind === 'Realizado pago'"> · {{ invoiceOrigin(entry) }}</template><template v-if="entry.categoryId !== category.id"> · {{ categoryName(entry.categoryId) }}</template><template v-if="entry.projectId"> · projeto {{ entry.projectId }}</template><template v-if="entry.costCenter"> · {{ entry.costCenter }}</template></span>
          <div v-if="pendingLink(entry) && canManage" class="row-actions"><select v-model="links[entry.id]" class="filter"><option value="" disabled>Documento do Thalamus</option><option v-for="item in documents" :key="item.module + item.id" :value="`${item.module}|${item.id}`">{{ item.label }}</option></select><button class="button small" @click="saveLink(entry)">Vincular</button></div>
        </div><b>{{ fmtCurrency(entry.status === 'Retido' ? entry.heldAmount ?? 0 : entry.kind === 'Previsão' ? entry.openAmount : entry.amount) }}</b>
      </div>
      <p v-if="!entries.length" class="empty-note">Nenhuma previsão ou pagamento neste período.</p>

      <h3 class="drawer-title">Histórico do valor anual</h3>
      <div v-for="entry in allocation.audit" :key="entry.id" class="list-row static"><div><strong>{{ entry.field }} · {{ entry.actor }}</strong><span>{{ fmtDateTime(entry.at) }} · {{ entry.reason }} · <template v-if="entry.field === 'Regra'">{{ entry.from }} → {{ entry.to }}</template><template v-else>{{ entry.from ? fmtCurrency(Number(entry.from)) : '—' }} → {{ fmtCurrency(Number(entry.to)) }}</template></span></div></div>
      <p v-if="!allocation.audit.length" class="empty-note">Valor carregado no cenário inicial; sem alterações posteriores.</p>

      <h3 class="drawer-title">Histórico da categoria</h3>
      <div v-for="entry in category.audit" :key="entry.id" class="list-row static"><div><strong>{{ entry.field }} · {{ entry.actor }}</strong><span>{{ fmtDateTime(entry.at) }} · {{ entry.reason }} · {{ entry.from || '—' }} → {{ entry.to }}</span></div></div>
      <p v-if="!category.audit.length" class="empty-note">Categoria do cenário inicial; sem alterações de nome ou situação.</p>
    </div>
  </template>
  <p v-else class="empty-note">Orçamento não encontrado.</p>
</template>
