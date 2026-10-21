<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, BadgeDollarSign, ChevronRight, CircleDollarSign, ListTree, Plus, ReceiptText } from 'lucide-vue-next'
import MoneyInput from '../components/MoneyInput.vue'
import { profileCan } from '../domain/access'
import { BUDGET_GROUPS, BUDGET_ROLES, budgetSummary, budgetWindow, childrenOf, isBudgetLeaf, leavesInGroup, linkableDocuments, nextCategoryCode } from '../domain/budget'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { BudgetCategory, BudgetCategoryStatus, FunctionalityId, InvoiceLinkModule, Role } from '../types/domain'
import { fmtCurrency } from '../utils/format'

type Tab = 'visao' | 'acoes' | 'configuracao'
type Lens = 'month' | 'quarter' | 'semester' | 'year'
const store = useErpStore()
const ui = useUiStore()
const tab = ref<Tab>('visao')
watch(() => ui.tourSteps[ui.tourIndex]?.target, target => {
  if (target?.includes('budget-adjust') || target?.includes('budget-tab-configuracao')) tab.value = 'configuracao'
  else if (target?.includes('budget-tab-acoes')) tab.value = 'acoes'
  else if (target?.includes('budget-summary') || target?.includes('record-list') || target?.includes('budget-detail')) tab.value = 'visao'
  else if (target?.includes('budget-tab-')) tab.value = target.split('budget-tab-')[1].replace(/["\]]/g, '') as Tab
})
watch(() => ui.budgetTab, value => {
  const next = value === 'excecoes' ? 'acoes' : value === 'categorias' ? 'configuracao' : value
  if (next === 'visao' || next === 'acoes' || next === 'configuracao') {
    tab.value = next
    ui.budgetTab = ''
  }
}, { immediate: true })
const year = ref('2026')
const lens = ref<Lens>('month')
const month = ref(10)
const quarter = ref(4)
const semester = ref(2)
const group = ref('')
const canManage = computed(() => store.can('orcamentos.gerir'))
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const tabs: { id: Tab; label: string }[] = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'acoes', label: 'Ações' },
  { id: 'configuracao', label: 'Configurações' },
]
const windowKey = computed(() => {
  if (lens.value === 'year') return year.value
  if (lens.value === 'quarter') return `${year.value}-Q${quarter.value}`
  if (lens.value === 'semester') return `${year.value}-S${semester.value}`
  return `${year.value}-${String(month.value).padStart(2, '0')}`
})
const windowLabel = computed(() => budgetWindow(windowKey.value).label)

const categories = computed(() => store.state.budgetCategories)
const category = (id: string) => categories.value.find(entry => entry.id === id)
const topLevel = computed(() => categories.value.filter(entry => !entry.parentId).sort((a, b) => a.code.localeCompare(b.code)))
const tree = computed(() => BUDGET_GROUPS.map(entry => ({
  ...entry,
  rows: topLevel.value.filter(item => item.group === entry.name).flatMap(item => [
    { category: item, depth: 0 },
    ...categories.value.filter(child => child.parentId === item.id).sort((a, b) => a.code.localeCompare(b.code)).map(child => ({ category: child, depth: 1 })),
  ]),
})))
const expanded = ref<string[]>(['03. Custos'])
const openCategories = ref<string[]>([])
watch(group, value => {
  if (value) expanded.value = [value]
})
function toggleGroup(name: string) {
  expanded.value = expanded.value.includes(name) ? expanded.value.filter(entry => entry !== name) : [...expanded.value, name]
}
function toggleCategory(id: string) {
  openCategories.value = openCategories.value.includes(id) ? openCategories.value.filter(entry => entry !== id) : [...openCategories.value, id]
}
const vision = computed(() => BUDGET_GROUPS
  .filter(entry => !group.value || entry.name === group.value)
  .map(entry => {
    const lines = topLevel.value
      .filter(item => item.group === entry.name)
      .map(item => ({
        category: item,
        allocation: store.state.budgets.find(budget => budget.categoryId === item.id && budget.period === year.value),
        ...budgetSummary(store.state, item.id, windowKey.value),
        children: childrenOf(store.state, item.id).map(child => ({
          category: child,
          allocation: store.state.budgets.find(budget => budget.categoryId === child.id && budget.period === year.value),
          ...budgetSummary(store.state, child.id, windowKey.value),
        })),
      }))
    const totals = lines.reduce((sum, row) => ({
      amount: sum.amount + row.amount, forecast: sum.forecast + row.forecast, realized: sum.realized + row.realized, balance: sum.balance + row.balance, held: sum.held + row.held,
    }), { amount: 0, forecast: 0, realized: 0, balance: 0, held: 0 })
    const use = totals.amount ? Math.round((totals.forecast + totals.realized) / totals.amount * 10000) / 100 : 0
    const deviation = Math.round((totals.forecast + totals.realized - totals.amount) * 100) / 100
    return { ...entry, lines, totals: { ...totals, use, deviation } }
  }))

const totals = computed(() => vision.value.flatMap(entry => entry.lines).reduce((sum, row) => ({
  amount: sum.amount + row.amount, forecast: sum.forecast + row.forecast, realized: sum.realized + row.realized, balance: sum.balance + row.balance, held: sum.held + row.held,
}), { amount: 0, forecast: 0, realized: 0, balance: 0, held: 0 }))
const alerts = computed(() => vision.value.flatMap(entry => entry.lines).filter(row => row.budget && row.use >= row.budget.alertThreshold))
const canResolve = (kind: string) => store.can(kind === 'Saldo excedido' ? 'orcamentos.liberar_saldo' : 'orcamentos.gerir')
const pendingExceptions = computed(() => store.state.budgetExceptions.filter(entry => entry.status === 'Pendente' && canResolve(entry.kind)).length)

const categoryForm = reactive({ name: '', group: '03. Custos' as string, parentId: '', responsibleRole: 'Financeiro' as Role })
const parentCategory = computed(() => categoryForm.parentId ? category(categoryForm.parentId) : undefined)
watch(parentCategory, parent => { if (parent) categoryForm.responsibleRole = parent.responsibleRole })
watch(() => categoryForm.group, groupName => {
  const parent = category(categoryForm.parentId)
  if (parent && parent.group !== groupName) categoryForm.parentId = ''
})
const codePreview = computed(() => {
  try { return nextCategoryCode(store.state, parentCategory.value?.group ?? categoryForm.group, parentCategory.value?.id) } catch { return '—' }
})
function createCategory() {
  const created = store.createBudgetCategory({ name: categoryForm.name, group: parentCategory.value?.group ?? categoryForm.group, parentId: categoryForm.parentId || undefined, responsibleRole: categoryForm.responsibleRole })
  if (created) Object.assign(categoryForm, { name: '', parentId: '' })
}
function changeCategory(entry: BudgetCategory, patch: Partial<Pick<BudgetCategory, 'responsibleRole' | 'status'>>, reason: string) {
  store.updateBudgetCategory(entry.id, { name: entry.name, responsibleRole: entry.responsibleRole, status: entry.status, ...patch }, reason)
}

function annualOf(categoryId: string) {
  return store.state.budgets.find(entry => entry.categoryId === categoryId && entry.period === year.value)?.amount ?? 0
}
function groupAnnual(name: string) {
  return leavesInGroup(store.state, name).reduce((sum, entry) => sum + annualOf(entry.id), 0)
}
function allocationFor(categoryId: string) {
  return store.state.budgets.find(entry => entry.categoryId === categoryId && entry.period === year.value)
}
const drafts = reactive<Record<string, number>>({})
function shownAnnual(categoryId: string) {
  return drafts[categoryId] ?? annualOf(categoryId)
}
function saveAnnual(categoryId: string) {
  const amount = drafts[categoryId]
  if (amount === undefined || amount === annualOf(categoryId)) return
  if (store.setAnnualBudget(categoryId, year.value, amount) !== undefined) delete drafts[categoryId]
}
function toneOf(use: number, deviation: number, threshold = 80) {
  if (use >= 100 || deviation > 0) return 'bad'
  if (use >= threshold) return 'warn'
  return 'ok'
}
function openBudget(categoryId: string) {
  const allocation = allocationFor(categoryId)
  if (allocation) ui.openRecord('budget', allocation.id, { window: windowKey.value })
}

const usableCategories = computed(() => categories.value.filter(entry => entry.status !== 'Inativa').sort((a, b) => a.code.localeCompare(b.code)))
const decisionNotes = reactive<Record<string, string>>({})
const decisionCategory = reactive<Record<string, string>>({})
const decisionLink = reactive<Record<string, string>>({})
const documents = computed(() => linkableDocuments(store.state))
function linkInvoice(id: string) {
  const [module, documentId] = (decisionLink[id] ?? '').split('|')
  if (module && documentId && store.linkBudgetInvoice(id, module as InvoiceLinkModule, documentId)) delete decisionLink[id]
}
const waitingFor = (kind: string) => {
  const feature: FunctionalityId = kind === 'Saldo excedido' ? 'orcamentos.liberar_saldo' : 'orcamentos.gerir'
  const names = store.state.accessProfiles.filter(profile => profile.tenantId === ui.activeTenantId && !profile.system && profileCan(profile, feature)).map(profile => profile.name)
  return names.length ? `Aguardando ${names.join(' ou ')}` : 'Aguardando o Administrador da empresa'
}
</script>

<template>
  <div class="toolbar">
    <p>Orçamento informado, previsão operacional e realizado pago pelo Omie permanecem separados e rastreáveis.</p>
    <div class="filter-row">
      <select v-model="year" class="filter"><option v-for="entry in ['2025', '2026', '2027']" :key="entry">{{ entry }}</option></select>
      <select v-model="lens" class="filter"><option value="month">Mês</option><option value="quarter">Trimestre</option><option value="semester">Semestre</option><option value="year">Ano</option></select>
      <select v-if="lens === 'month'" v-model="month" class="filter"><option v-for="(label, index) in months" :key="label" :value="index + 1">{{ label }}</option></select>
      <select v-else-if="lens === 'quarter'" v-model="quarter" class="filter"><option v-for="entry in 4" :key="entry" :value="entry">{{ entry }}º trimestre</option></select>
      <select v-else-if="lens === 'semester'" v-model="semester" class="filter"><option :value="1">1º semestre</option><option :value="2">2º semestre</option></select>
      <select v-model="group" class="filter"><option value="">Todos os grupos</option><option v-for="entry in BUDGET_GROUPS" :key="entry.code" :value="entry.name">{{ entry.name }}</option></select>
    </div>
  </div>

  <div class="tabs" data-tour="budget-tabs">
    <button v-for="entry in tabs" :key="entry.id" :class="{ active: tab === entry.id }" :data-tour="`budget-tab-${entry.id}`" @click="tab = entry.id">{{ entry.label }}<b v-if="entry.id === 'acoes' && pendingExceptions" :title="`${pendingExceptions} pendente(s) para decidir`">{{ pendingExceptions }}</b></button>
  </div>

  <template v-if="tab === 'visao'">
    <section class="metrics" data-tour="budget-summary">
      <article class="metric"><div class="metric-head">Orçamento informado <BadgeDollarSign :size="17" /></div><strong>{{ fmtCurrency(totals.amount) }}</strong><small>{{ windowLabel }} · {{ vision.reduce((sum, entry) => sum + entry.lines.length, 0) }} categoria(s){{ group ? ` de ${group}` : '' }}</small></article>
      <article class="metric"><div class="metric-head">Realizado pago <CircleDollarSign :size="17" /></div><strong>{{ fmtCurrency(totals.realized) }}</strong><small>Notas do Omie neste período</small></article>
      <article class="metric"><div class="metric-head">Previsão aberta <ReceiptText :size="17" /></div><strong>{{ fmtCurrency(totals.forecast) }}</strong><small>{{ totals.held ? `${fmtCurrency(totals.held)} retido aguardando liberação de saldo` : 'Demandas, OPs e OSs ainda abertas' }}</small></article>
      <article class="metric"><div class="metric-head">Saldo <AlertTriangle :size="17" /></div><strong :class="{ 'risk-text': totals.balance < 0 }">{{ fmtCurrency(totals.balance) }}</strong><small>{{ alerts.length }} categoria(s) em alerta</small></article>
    </section>
    <p v-if="!group" class="cell-sub">O total junta todos os grupos. Deduções e custos continuam em linhas separadas.</p>
    <article class="card flush" data-tour="record-list">
      <table><thead><tr><th>Categoria</th><th>Responsável</th><th>Orçamento</th><th>Realizado pago</th><th>Previsão</th><th>Saldo</th><th title="Previsão aberta mais realizado pago, comparado ao orçamento informado. Verde ainda cabe, amarelo cruzou o limiar e vermelho passou de 100%.">Desvio</th><th>Uso</th></tr></thead>
        <tbody v-for="entry in vision" :key="entry.code">
          <tr class="group-row clickable" @click="toggleGroup(entry.name)">
            <td colspan="2"><span class="group-toggle" :class="{ open: expanded.includes(entry.name) }"><ChevronRight :size="14" /> {{ entry.name }}</span></td>
            <td>{{ fmtCurrency(entry.totals.amount) }}</td><td>{{ fmtCurrency(entry.totals.realized) }}</td><td>{{ fmtCurrency(entry.totals.forecast) }}<span v-if="entry.totals.held" class="tone warn">{{ fmtCurrency(entry.totals.held) }} retido</span></td>
            <td :class="{ 'risk-text': entry.totals.balance < 0 }">{{ fmtCurrency(entry.totals.balance) }}</td>
            <td><span v-if="entry.totals.amount" class="tone" :class="toneOf(entry.totals.use, entry.totals.deviation)">{{ entry.totals.deviation ? fmtCurrency(Math.abs(entry.totals.deviation)) : 'No orçamento' }}</span></td>
            <td><span v-if="entry.totals.amount" class="tone" :class="toneOf(entry.totals.use, entry.totals.deviation)">{{ entry.totals.use }}%</span></td>
          </tr>
          <template v-if="expanded.includes(entry.name)">
            <template v-for="row in entry.lines" :key="row.category.id">
              <tr class="budget-macro" :class="{ clickable: row.allocation, open: openCategories.includes(row.category.id) }" @click="openBudget(row.category.id)">
                <td>
                  <div class="category-line">
                    <button v-if="row.children.length" class="expand-toggle" :class="{ open: openCategories.includes(row.category.id) }" :title="openCategories.includes(row.category.id) ? 'Recolher subcategorias' : 'Expandir subcategorias'" @click.stop="toggleCategory(row.category.id)"><ChevronRight :size="14" /></button>
                    <span v-else class="category-slot" />
                    <span class="category-copy"><span class="cell-main">{{ row.category.code }}</span><span class="cell-sub">{{ row.category.name }}<template v-if="row.children.length"> · soma das subcategorias</template></span></span>
                  </div>
                </td><td>{{ row.category.responsibleRole }}</td>
                <td>{{ row.amount ? fmtCurrency(row.amount) : '—' }}</td><td>{{ fmtCurrency(row.realized) }}</td><td>{{ fmtCurrency(row.forecast) }}<span v-if="row.held" class="tone warn">{{ fmtCurrency(row.held) }} retido</span></td>
                <td :class="{ 'risk-text': row.balance < 0 }">{{ row.amount ? fmtCurrency(row.balance) : '—' }}</td>
                <td><span v-if="row.amount" class="tone" :class="toneOf(row.use, row.deviation, row.budget?.alertThreshold)">{{ row.deviation ? fmtCurrency(Math.abs(row.deviation)) : 'No orçamento' }}</span><span v-else>—</span></td>
                <td><span v-if="row.amount" class="tone" :class="toneOf(row.use, row.deviation, row.budget?.alertThreshold)">{{ row.use }}%</span><span v-else class="cell-sub">Sem orçamento</span></td>
              </tr>
              <tr v-for="child in openCategories.includes(row.category.id) ? row.children : []" :key="child.category.id" class="budget-child" :class="{ clickable: !!child.allocation }" @click="openBudget(child.category.id)">
                <td><div class="category-line category-child"><span class="category-copy"><span class="cell-main">{{ child.category.code }}</span><span class="cell-sub">{{ child.category.name }}</span></span></div></td>
                <td>{{ child.category.responsibleRole }}</td>
                <td>{{ child.amount ? fmtCurrency(child.amount) : '—' }}</td>
                <td>{{ fmtCurrency(child.realized) }}</td>
                <td>{{ fmtCurrency(child.forecast) }}<span v-if="child.held" class="tone warn">{{ fmtCurrency(child.held) }} retido</span></td>
                <td :class="{ 'risk-text': child.balance < 0 }">{{ child.amount ? fmtCurrency(child.balance) : '—' }}</td>
                <td><span v-if="child.amount" class="tone" :class="toneOf(child.use, child.deviation, child.budget?.alertThreshold)">{{ child.deviation ? fmtCurrency(Math.abs(child.deviation)) : 'No orçamento' }}</span><span v-else>—</span></td>
                <td><span v-if="child.amount" class="tone" :class="toneOf(child.use, child.deviation, child.budget?.alertThreshold)">{{ child.use }}%</span><span v-else class="cell-sub">Sem orçamento</span></td>
              </tr>
            </template>
            <tr v-if="!entry.lines.length"><td colspan="8" class="cell-sub">Nenhuma categoria neste grupo. As que existirem no Omie entram na sincronização.</td></tr>
          </template>
        </tbody>
      </table>
      <p class="empty-note">Esta tela só acompanha. O ano é informado em Configurações. A fatia de {{ windowLabel }} é 1/12 no mês, 3/12 no trimestre e 6/12 no semestre. Verde ainda cabe, amarelo cruzou o limiar e vermelho passou de 100%. O bloqueio de um lançamento novo usa o saldo do ano inteiro.</p>
    </article>
  </template>

  <template v-else-if="tab === 'acoes'">
    <div class="notice info">A nota do Omie entra no custo. Se ela não aponta para compra, projeto ou ordem, quem tem Gerir orçamento faz o vínculo aqui. Nota sem categoria continua fora do realizado até a reclassificação. Saldo excedido segue com quem tem Liberar saldo excedido.</div>
    <article class="card flush"><table><thead><tr><th>Ação</th><th>Origem</th><th>Descrição</th><th>Valor</th><th>Período</th><th>Situação</th><th>Decisão</th></tr></thead>
      <tbody><tr v-for="entry in store.state.budgetExceptions" :key="entry.id">
        <td><span class="cell-main">{{ entry.kind }}</span></td><td>{{ entry.sourceModule }} · {{ entry.sourceId }}</td><td>{{ entry.description }}</td><td>{{ fmtCurrency(entry.amount) }}</td><td>{{ entry.period }}</td>
        <td><span class="status" :class="entry.status === 'Pendente' ? 'warning' : entry.status === 'Autorizada' || entry.status === 'Resolvida' ? 'success' : 'danger'">{{ entry.status }}</span></td>
        <td>
          <div v-if="entry.status === 'Pendente' && canResolve(entry.kind)" class="row-actions">
            <select v-if="entry.kind === 'Sem vínculo'" v-model="decisionLink[entry.id]" class="filter"><option value="" disabled>Documento do Thalamus</option><option v-for="item in documents" :key="item.module + item.id" :value="`${item.module}|${item.id}`">{{ item.label }}</option></select>
            <select v-else-if="entry.kind !== 'Saldo excedido'" v-model="decisionCategory[entry.id]" class="filter"><option :value="undefined" disabled>Categoria correta</option><option v-for="item in usableCategories" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select>
            <input v-if="entry.kind !== 'Sem vínculo'" v-model="decisionNotes[entry.id]" class="filter" placeholder="Justificativa" />
            <button class="button small" @click="entry.kind === 'Sem vínculo' ? linkInvoice(entry.id) : store.decideBudgetException(entry.id, true, decisionNotes[entry.id] || '', decisionCategory[entry.id])">{{ entry.kind === 'Saldo excedido' ? 'Liberar' : entry.kind === 'Sem vínculo' ? 'Vincular' : 'Reclassificar e lançar' }}</button>
            <button v-if="entry.kind !== 'Sem vínculo'" class="button danger small" @click="store.decideBudgetException(entry.id, false, decisionNotes[entry.id] || '')">Rejeitar</button>
          </div>
          <span v-else class="cell-sub">{{ entry.status === 'Pendente' ? waitingFor(entry.kind) : entry.decidedBy }}<template v-if="entry.decisionNote"> · {{ entry.decisionNote }}</template></span>
        </td>
      </tr></tbody>
    </table></article>
  </template>

  <template v-else>
    <article class="card">
      <div class="section-head"><div><h2><ListTree :size="18" /> Categorias de {{ year }}</h2><p>O valor do ano é editado na linha, sem motivo. Grupo e categoria macro mostram a soma. Inativar também inativa a categoria no Omie. O limiar e o saldo negativo valem para o ano.</p></div></div>
      <table class="dense"><thead><tr><th>Código</th><th>Categoria</th><th data-tour="budget-adjust">Orçamento {{ year }}</th><th>Limiar</th><th>Saldo negativo</th><th>Responsável</th><th>Situação</th></tr></thead>
        <tbody v-for="entry in tree" :key="entry.code">
          <tr class="group-row"><td colspan="2"><strong>{{ entry.name }}</strong><span v-if="!entry.rows.length" class="cell-sub">Categorias ainda pendentes na especificação</span></td><td>{{ fmtCurrency(groupAnnual(entry.name)) }}</td><td colspan="4"></td></tr>
          <tr v-for="row in entry.rows" :key="row.category.id">
            <td class="code">{{ row.category.code }}</td>
            <td :style="{ paddingLeft: row.depth ? '28px' : undefined }"><span v-if="row.depth" class="cell-sub">subcategoria</span><span v-else-if="childrenOf(store.state, row.category.id).length" class="cell-sub">soma das subcategorias</span>{{ row.category.name }}<span v-if="row.category.omieId" class="cell-sub">Omie {{ row.category.omieId }}</span></td>
            <td>
              <MoneyInput v-if="canManage && isBudgetLeaf(store.state, row.category.id)" :model-value="shownAnnual(row.category.id)" @update:model-value="drafts[row.category.id] = $event" @blur="saveAnnual(row.category.id)" />
              <template v-else>{{ fmtCurrency(annualOf(row.category.id)) }}</template>
            </td>
            <td><input v-if="allocationFor(row.category.id)" :value="allocationFor(row.category.id)!.alertThreshold" class="cell-input" type="number" min="1" max="100" :disabled="!canManage" @change="store.configureBudget(allocationFor(row.category.id)!.id, Number(($event.target as HTMLInputElement).value), allocationFor(row.category.id)!.blockOnOverrun)" /><span v-else class="cell-sub">—</span></td>
            <td><button v-if="allocationFor(row.category.id) && canManage" class="button ghost small" @click="store.configureBudget(allocationFor(row.category.id)!.id, allocationFor(row.category.id)!.alertThreshold, !allocationFor(row.category.id)!.blockOnOverrun)">{{ allocationFor(row.category.id)!.blockOnOverrun ? 'Retém até a liberação de saldo' : 'Somente alerta' }}</button><span v-else-if="allocationFor(row.category.id)" class="cell-sub">{{ allocationFor(row.category.id)!.blockOnOverrun ? 'Retém até a liberação de saldo' : 'Somente alerta' }}</span><span v-else class="cell-sub">—</span></td>
            <td><select class="filter" :value="row.category.responsibleRole" :disabled="!canManage" @change="changeCategory(row.category, { responsibleRole: ($event.target as HTMLSelectElement).value as Role }, 'Troca de responsável')"><option v-for="role in BUDGET_ROLES" :key="role">{{ role }}</option></select></td>
            <td><select class="filter" :value="row.category.status" :disabled="!canManage" @change="changeCategory(row.category, { status: ($event.target as HTMLSelectElement).value as BudgetCategoryStatus }, 'Situação enviada ao Omie')"><option>Ativa</option><option>Inativa</option></select></td>
          </tr>
        </tbody>
      </table>
      <fieldset v-if="canManage" class="layer" data-tour="budget-category-form"><legend>Nova categoria ou subcategoria</legend><div class="filter-row">
        <select v-model="categoryForm.group" class="filter"><option v-for="entry in BUDGET_GROUPS" :key="entry.code" :value="entry.name">{{ entry.name }}</option></select>
        <select v-model="categoryForm.parentId" class="filter"><option value="">Nova categoria neste grupo</option><option v-for="entry in topLevel.filter(item => item.group === categoryForm.group && item.status !== 'Inativa')" :key="entry.id" :value="entry.id">Subcategoria de {{ entry.code }} · {{ entry.name }}</option></select>
        <input v-model="categoryForm.name" class="filter grow" placeholder="Nome" />
        <select v-model="categoryForm.responsibleRole" class="filter"><option v-for="role in BUDGET_ROLES" :key="role">{{ role }}</option></select>
        <span class="cell-sub">Código {{ codePreview }}</span>
        <button class="button small" @click="createCategory"><Plus :size="14" /> Criar</button>
      </div><p class="cell-sub">O grupo vem primeiro e limita as categorias em que a nova linha pode entrar. O código segue a sequência desse grupo ou da categoria pai. Criar, alterar ou inativar envia a categoria ao Omie na hora.</p></fieldset>
      <div v-else class="notice info">Consulta liberada. Categorias são mantidas por quem tem a funcionalidade Gerir orçamento e conciliadas com o Omie.</div>
    </article>
  </template>
</template>
