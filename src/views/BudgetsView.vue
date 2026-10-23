<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CalendarDays, ChevronDown, ChevronRight, ListTree, PieChart, Plus, Sparkles, TrendingUp, X } from 'lucide-vue-next'
import MoneyInput from '../components/MoneyInput.vue'
import PeriodScopeBar from '../components/PeriodScopeBar.vue'
import CostCentersPanel from '../components/budget/CostCentersPanel.vue'
import { usePeriodScope } from '../composables/usePeriodScope'
import { profileCan } from '../domain/access'
import {
  BUDGET_GROUPS, CAPEX_GROUP, RECEITA_GROUP, budgetSummary, childrenOf, costCenterAmounts, groupPriorYearRealized, growthForTarget, inMonthRange, viewerCenterScope,
  isBudgetLeaf, isDepreciationCategory, isSpendCategory, leavesInGroup, linkableDocuments, nextCategoryCode, rangeSummary, realizedOfYear, sectorCostCenter, suggestCategoryCenters,
} from '../domain/budget'
import { assetDepreciation, periodLabel } from '../domain/dre'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { BudgetCategory, BudgetCategoryStatus, BudgetEntry, FunctionalityId, InvoiceLinkModule } from '../types/domain'
import { fmtCurrency } from '../utils/format'

type Screen = 'visao' | 'acoes' | 'categorias' | 'centros' | 'anual' | 'mensal' | 'capex'
interface Part { id: string; sign: 1 | -1 }
interface StatementLine {
  kind: 'secao' | 'conta' | 'calculo'
  key: string
  label: string
  code: string
  depth: number
  parts: Part[]
  path: string[]
  editableId?: string
}

const store = useErpStore()
const ui = useUiStore()
const screen = ref<Screen>('visao')
const onlyOverrun = ref(false)
const metaValue = ref(0)
const { year, fromMonth, toMonth, scope, members: groupMemberTenants, groupView, tenantIds: scopeTenants, viewingTenantId, scopeLabel } = usePeriodScope()

/** O guia explica uma aba por vez: cada alvo abre a aba em que ele mora. */
const TOUR_SCREEN: [string, Screen][] = [
  ['budget-seasonality', 'mensal'],
  ['budget-plan', 'anual'],
  ['budget-summary', 'anual'],
  ['budget-tab-planejamento', 'anual'],
  ['budget-sector', 'centros'],
  ['budget-centers', 'centros'],
  ['budget-tab-centros', 'centros'],
  ['budget-split', 'categorias'],
  ['budget-categories', 'categorias'],
  ['budget-tab-categorias', 'categorias'],
  ['budget-actions', 'acoes'],
  ['budget-tab-acoes', 'acoes'],
  ['record-list', 'visao'],
  ['period-scope', 'visao'],
  ['budget-tabs', 'visao'],
]
watch(() => ui.tourSteps[ui.tourIndex]?.target, target => {
  const match = target ? TOUR_SCREEN.find(([key]) => target.includes(key)) : undefined
  if (match) screen.value = match[1]
})
watch(() => ui.budgetTab, value => {
  const map: Record<string, Screen> = { excecoes: 'acoes', acoes: 'acoes', categorias: 'categorias', configuracao: 'categorias', centros: 'centros', planejamento: 'anual', visao: 'visao' }
  if (map[value]) {
    screen.value = map[value]
    ui.budgetTab = ''
  }
}, { immediate: true })

const shortMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const canManage = computed(() => store.can('orcamentos.gerir'))
const priorYear = computed(() => String(Number(year.value) - 1))
const economicGroup = computed(() => store.state.economicGroups.find(entry => entry.id === groupMemberTenants.value[0]?.groupId))
const canEditHere = computed(() => canManage.value && !groupView.value && viewingTenantId.value === ui.activeTenantId)
const planning = computed(() => screen.value === 'anual' || screen.value === 'mensal' || screen.value === 'capex')
const round2 = (value: number) => Math.round(value * 100) / 100

const categories = computed(() => store.state.budgetCategories.filter(entry => scopeTenants.value.includes(entry.tenantId)))
const category = (id: string) => store.state.budgetCategories.find(entry => entry.id === id)
const topLevel = computed(() => categories.value.filter(entry => !entry.parentId).sort((a, b) => a.code.localeCompare(b.code)))

function depreciationId(id: string) {
  const item = category(id)
  return Boolean(item && isDepreciationCategory(item))
}
function sectionTitle(group: { code: string; name: string }) {
  if (group.code === '09') return group.name
  const name = group.name.replace(/^\d+\.\s*/, '')
  return `${group.code}. ${group.code === '01' ? '(+)' : '(−)'} ${name}`
}

const statement = computed(() => {
  const control = screen.value === 'visao'
  const hideDepreciation = control || screen.value === 'mensal'
  const groups = BUDGET_GROUPS.filter(entry => {
    if (screen.value === 'capex') return entry.code === '09'
    if (control) return entry.code === '03' || entry.code === '04' || entry.code === '05' || entry.code === '09'
    return entry.code !== '09'
  })
  const lines: StatementLine[] = []
  for (const group of groups) {
    const sign: 1 | -1 = control || screen.value === 'capex' || group.name === RECEITA_GROUP ? 1 : -1
    const heads = groupView.value
      ? [...new Map(topLevel.value.filter(item => item.group === group.name).map(item => [item.code, item])).values()]
      : topLevel.value.filter(item => item.group === group.name)
    const leafIds = (head: BudgetCategory) => {
      const same = categories.value.filter(entry => entry.code === head.code && !entry.parentId)
      const kids = same.flatMap(entry => childrenOf(store.state, entry.id))
      return (kids.length ? kids : same).map(entry => entry.id).filter(id => !(hideDepreciation && depreciationId(id)))
    }
    lines.push({ kind: 'secao', key: group.code, label: sectionTitle(group), code: group.code, depth: 0, path: [], parts: heads.flatMap(leafIds).map(id => ({ id, sign })) })
    for (const head of heads) {
      const same = categories.value.filter(entry => entry.code === head.code && !entry.parentId)
      const children = [...new Map(same.flatMap(entry => childrenOf(store.state, entry.id)).map(entry => [entry.code, entry])).values()]
        .filter(child => !(hideDepreciation && isDepreciationCategory(child)))
      if (children.length) {
        const parentKey = `m-${head.code}`
        lines.push({ kind: 'conta', key: parentKey, label: head.name, code: head.code, depth: 1, path: [group.code], parts: same.flatMap(entry => childrenOf(store.state, entry.id)).filter(entry => !(hideDepreciation && isDepreciationCategory(entry))).map(entry => ({ id: entry.id, sign })) })
        for (const child of children) {
          const twins = categories.value.filter(entry => entry.code === child.code && entry.parentId)
          const only = twins.length === 1 ? twins[0] : undefined
          lines.push({ kind: 'conta', key: child.id, label: child.name, code: child.code, depth: 2, path: [group.code, parentKey], parts: twins.map(entry => ({ id: entry.id, sign })), editableId: only?.tenantId === ui.activeTenantId ? only.id : undefined })
        }
      } else if (!(hideDepreciation && same.length > 0 && same.every(isDepreciationCategory))) {
        const only = same.length === 1 ? same[0] : undefined
        lines.push({ kind: 'conta', key: head.id, label: head.name, code: head.code, depth: 1, path: [group.code], parts: same.map(entry => ({ id: entry.id, sign })), editableId: only?.tenantId === ui.activeTenantId ? only.id : undefined })
      }
    }
    if (group.code === '02') {
      const receita = lines.find(entry => entry.key === '01')
      const deducoes = lines.find(entry => entry.key === '02')
      lines.push({
        kind: 'calculo', key: 'rol', label: 'Receita Operacional Líquida', code: '', depth: 0, path: [],
        parts: [
          ...(receita?.parts ?? []).map(part => ({ id: part.id, sign: 1 as const })),
          ...(deducoes?.parts ?? []).map(part => ({ id: part.id, sign: -1 as const })),
        ],
      })
    }
  }
  return lines
})
const collapsed = reactive<Record<string, boolean>>({})
function foldable(line: StatementLine) {
  return statement.value.some(entry => entry.path.includes(line.key))
}
function toggleFold(key: string) {
  collapsed[key] = !collapsed[key]
}
const visibleStatement = computed(() => statement.value.filter(line => line.path.every(key => !collapsed[key])))
function rowClass(line: StatementLine) {
  if (line.kind === 'secao') return 'secao'
  if (line.kind === 'calculo') return 'calculo'
  return `depth-${line.depth}${line.depth === 1 && !line.editableId ? ' sub' : ''}`
}

/* ---------- Planejamento: ano inteiro ---------- */
const priorOf = (id: string) => realizedOfYear(store.state, id, priorYear.value)
const yearRealized = (id: string) => realizedOfYear(store.state, id, year.value)
const annualAbs = (id: string) => store.state.budgets.find(entry => entry.categoryId === id && entry.period === year.value)?.amount ?? 0
function amountOf(id: string) {
  const item = category(id)
  if (item && isDepreciationCategory(item)) return assetDepreciation(store.state, item.tenantId).total
  return annualAbs(id)
}
const sumParts = (parts: Part[], pick: (id: string) => number) => round2(parts.reduce((sum, part) => sum + part.sign * pick(part.id), 0))
const linePrior = (line: StatementLine) => sumParts(line.parts, priorOf)
const lineBudget = (line: StatementLine) => sumParts(line.parts, amountOf)
const lineRealized = (line: StatementLine) => sumParts(line.parts, yearRealized)
function monthsOf(id: string) {
  const allocation = store.state.budgets.find(entry => entry.categoryId === id && entry.period === year.value)
  if (allocation?.monthlyAmounts?.length === 12) return allocation.monthlyAmounts
  const total = allocation?.amount ?? 0
  const each = round2(total / 12)
  const values = Array.from({ length: 12 }, () => each)
  values[11] = round2(total - each * 11)
  return values
}
function lineMonths(line: StatementLine) {
  const values = Array.from({ length: 12 }, () => 0)
  for (const part of line.parts) monthsOf(part.id).forEach((value, index) => { values[index] += part.sign * value })
  return values.map(round2)
}
function linePriorMonths(line: StatementLine) {
  const values = Array.from({ length: 12 }, () => 0)
  for (const part of line.parts) {
    for (let month = 0; month < 12; month++) {
      values[month] += part.sign * budgetSummary(store.state, part.id, `${priorYear.value}-${String(month + 1).padStart(2, '0')}`).realized
    }
  }
  return values.map(round2)
}
const emptyLine: StatementLine = { kind: 'calculo', key: '', label: '', code: '', depth: 0, path: [], parts: [] }
const robPrior = computed(() => Math.abs(linePrior(statement.value.find(entry => entry.key === '01') ?? emptyLine)))
const robBudget = computed(() => Math.abs(lineBudget(statement.value.find(entry => entry.key === '01') ?? emptyLine)))
const money = (value: number) => value === 0 ? '—' : fmtCurrency(value)
const avText = (value: number, base: number) => base ? `${(value / base * 100).toFixed(1)}%` : '—'
const avWidth = (value: number, base: number) => base ? Math.min(100, Math.abs(value / base * 100)) : 0
const growthOf = (line: StatementLine) => {
  const prior = linePrior(line)
  return prior ? Math.round((lineBudget(line) / prior - 1) * 1000) / 10 : undefined
}
const drafts = reactive<Record<string, number>>({})
function shownAnnual(categoryId: string) {
  return drafts[categoryId] ?? annualAbs(categoryId)
}
function saveAnnual(categoryId: string) {
  const amount = drafts[categoryId]
  if (amount === undefined || amount === annualAbs(categoryId)) return
  if (store.setAnnualBudget(categoryId, year.value, amount) !== undefined) delete drafts[categoryId]
}
function commitGrowth(categoryId: string, raw: string) {
  const pct = Number(raw.replace(',', '.'))
  if (Number.isFinite(pct)) store.applyBudgetGrowth([categoryId], year.value, pct)
}
const monthDrafts = reactive<Record<string, number>>({})
const monthKey = (categoryId: string, index: number) => `${categoryId}:${index}`
function shownMonth(categoryId: string, index: number) {
  return monthDrafts[monthKey(categoryId, index)] ?? monthsOf(categoryId)[index]
}
function saveMonth(categoryId: string, index: number) {
  const key = monthKey(categoryId, index)
  const value = monthDrafts[key]
  if (value === undefined) return
  const next = monthsOf(categoryId).slice()
  next[index] = round2(value)
  if (next[index] === monthsOf(categoryId)[index] || store.setMonthlyBudget(categoryId, year.value, next) !== undefined) delete monthDrafts[key]
}
function applySeasonality() {
  const ids = categories.value
    .filter(entry => entry.tenantId === ui.activeTenantId && entry.status !== 'Inativa' && entry.group !== CAPEX_GROUP && isBudgetLeaf(store.state, entry.id))
    .map(entry => entry.id)
  if (ids.length) store.applyPriorSeasonality(ids, year.value)
}
function depreciationLine(line: StatementLine) {
  return line.kind === 'conta' && line.parts.length > 0 && line.parts.every(part => depreciationId(part.id))
}
function spendLine(line: StatementLine) {
  const id = line.editableId
  const item = id ? category(id) : undefined
  return Boolean(item && isSpendCategory(item))
}
const savedSimulation = computed(() => store.state.budgetSimulations.find(entry => entry.tenantId === ui.activeTenantId && entry.year === year.value))
const readOnlyNote = computed(() => {
  if (!canManage.value || canEditHere.value) return ''
  if (groupView.value) return 'A visão do grupo soma as empresas e não edita linha. A meta do grupo vale para cada empresa.'
  return `Você está vendo ${scopeLabel.value} só para leitura. Para editar, entre nessa empresa.`
})
function applyMeta() {
  if (!(metaValue.value > 0)) return
  if (groupView.value) store.applyGroupRevenueTarget(economicGroup.value!.id, year.value, metaValue.value)
  else store.applyRevenueTarget(year.value, metaValue.value)
}
const metaBase = computed(() => groupView.value && economicGroup.value
  ? groupPriorYearRealized(store.state, economicGroup.value.id, year.value, 'Receita')
  : leavesInGroup(store.state, viewingTenantId.value || ui.activeTenantId, RECEITA_GROUP).reduce((sum, leaf) => sum + realizedOfYear(store.state, leaf.id, priorYear.value), 0))
const metaPreview = computed(() => growthForTarget(metaBase.value, metaValue.value))
const canPlanGroup = computed(() => store.can('orcamentos.consultar_consolidado') && store.can('orcamentos.gerir'))
const capexLines = computed(() => visibleStatement.value.filter(entry => entry.kind === 'conta'))
const capexTotals = computed(() => capexLines.value.reduce((sum, line) => ({ budget: sum.budget + lineBudget(line), realized: sum.realized + lineRealized(line) }), { budget: 0, realized: 0 }))

/* ---------- Visão geral: intervalo de meses ---------- */
const periodText = computed(() => periodLabel({ year: year.value, fromMonth: fromMonth.value, toMonth: toMonth.value }))
const figures = computed(() => new Map(categories.value.map(item => [item.id, rangeSummary(store.state, item.id, year.value, fromMonth.value, toMonth.value)])))
const figure = (id: string) => figures.value.get(id) ?? { amount: 0, forecast: 0, realized: 0 }
const viewBudget = (line: StatementLine) => sumParts(line.parts, id => figure(id).amount)
const viewRealized = (line: StatementLine) => sumParts(line.parts, id => figure(id).realized)
const viewForecast = (line: StatementLine) => sumParts(line.parts, id => figure(id).forecast)
const consumed = (line: StatementLine) => round2(viewRealized(line) + viewForecast(line))
function lineUse(line: StatementLine) {
  const budget = viewBudget(line)
  return budget ? Math.round(consumed(line) / budget * 1000) / 10 : 0
}
const lineGap = (line: StatementLine) => round2(consumed(line) - viewBudget(line))
function toneOf(line: StatementLine) {
  if (!viewBudget(line)) return consumed(line) > 0 ? 'bad' : ''
  const use = lineUse(line)
  return use > 100 ? 'bad' : use >= 80 ? 'warn' : 'ok'
}
const centerScope = computed(() => viewerCenterScope(store.state, ui.activeTenantId, ui.sessionUserId, ui.role))
const scopedCenters = computed(() => store.state.costCenters.filter(entry => centerScope.value.centerIds.includes(entry.id)))
const scopedCategoryIds = computed(() => new Set(store.state.budgets
  .filter(entry => entry.period === year.value && entry.costCenterSplit?.lines.some(line => centerScope.value.centerIds.includes(line.costCenterId)))
  .map(entry => entry.categoryId)))
const overrunLines = computed(() => statement.value.filter(line => line.kind === 'conta' && line.editableId !== undefined && consumed(line) > 0 && lineUse(line) > 100))
const overviewLines = computed(() => {
  const alive = new Set<string>()
  for (const line of statement.value) {
    if (line.kind !== 'conta') continue
    if (viewBudget(line) === 0 && viewRealized(line) === 0 && viewForecast(line) === 0) continue
    if (centerScope.value.limited && !line.parts.some(part => scopedCategoryIds.value.has(part.id))) continue
    alive.add(line.key)
    for (const key of line.path) alive.add(key)
  }
  if (onlyOverrun.value) return overrunLines.value.filter(line => alive.has(line.key))
  return visibleStatement.value.filter(line => alive.has(line.key))
})
const overviewTotals = computed(() => {
  const sections = statement.value.filter(line => line.kind === 'secao')
  const budget = round2(sections.reduce((sum, line) => sum + viewBudget(line), 0))
  const realized = round2(sections.reduce((sum, line) => sum + viewRealized(line), 0))
  const forecast = round2(sections.reduce((sum, line) => sum + viewForecast(line), 0))
  return { budget, realized, forecast, free: round2(budget - realized - forecast), use: budget ? Math.round((realized + forecast) / budget * 1000) / 10 : 0 }
})

/* ---------- Origem do desvio ---------- */
const focusKey = ref('')
const centerFilter = ref('')
const focusLine = computed(() => statement.value.find(line => line.key === focusKey.value))
function toggleFocus(line: StatementLine) {
  focusKey.value = focusKey.value === line.key ? '' : line.key
  centerFilter.value = ''
}
watch(screen, () => { focusKey.value = '' })
function centerIdOf(entry: BudgetEntry) {
  return entry.costCenter ? store.state.costCenters.find(center => center.tenantId === entry.tenantId && center.code === entry.costCenter)?.id ?? '' : ''
}
const isUsage = (entry: BudgetEntry) => entry.kind === 'Previsão'
  ? entry.status === 'Ativo' || entry.status === 'Parcial'
  : (entry.kind === 'Realizado pago' || entry.kind === 'Realizado recebido') && entry.status !== 'Cancelado'
const focusEntries = computed(() => {
  const line = focusLine.value
  if (!line) return []
  const ids = new Set(line.parts.map(part => part.id))
  for (const part of line.parts) {
    const parentId = category(part.id)?.parentId
    if (parentId && line.key.startsWith('m-')) ids.add(parentId)
  }
  return store.state.budgetEntries
    .filter(entry => ids.has(entry.categoryId) && scopeTenants.value.includes(entry.tenantId) && isUsage(entry) && inMonthRange(entry.period, year.value, fromMonth.value, toMonth.value))
    .map(entry => ({ entry, value: entry.kind === 'Previsão' ? entry.openAmount : entry.amount, centerId: centerIdOf(entry) }))
})
interface CenterUse { id: string; label: string; owner: string; budget: number; used: number }
const focusCenters = computed(() => {
  const line = focusLine.value
  if (!line) return [] as CenterUse[]
  const rows = new Map<string, CenterUse>()
  const row = (id: string) => {
    if (!rows.has(id)) {
      const center = store.state.costCenters.find(entry => entry.id === id)
      rows.set(id, { id, label: center ? `${center.code} ${center.name}` : id, owner: userName(center?.responsibleUserId), budget: 0, used: 0 })
    }
    return rows.get(id)!
  }
  let total = 0
  let covered = 0
  for (const part of line.parts) {
    const amount = figure(part.id).amount
    total += amount
    const allocation = store.state.budgets.find(entry => entry.categoryId === part.id && entry.period === year.value)
    for (const slice of costCenterAmounts(allocation?.amount ?? 0, allocation?.costCenterSplit)) {
      const share = round2(amount * slice.percent / 100)
      covered += share
      row(slice.costCenterId).budget += share
    }
  }
  let unassigned = 0
  for (const item of focusEntries.value) {
    if (item.centerId) row(item.centerId).used += item.value
    else unassigned += item.value
  }
  const visible = [...rows.values()]
    .filter(entry => !centerScope.value.limited || centerScope.value.centerIds.includes(entry.id))
    .map(entry => ({ ...entry, budget: round2(entry.budget), used: round2(entry.used) }))
    .sort((a, b) => b.used - a.used || b.budget - a.budget)
  const free = round2(total - covered)
  if (!centerScope.value.limited && (free > 0.009 || unassigned > 0)) visible.push({ id: 'none', label: 'Sem centro', owner: 'Financeiro', budget: free, used: round2(unassigned) })
  return visible
})
const usePct = (row: CenterUse) => row.budget ? Math.round(row.used / row.budget * 1000) / 10 : (row.used ? 100 : 0)
const useTone = (row: CenterUse) => {
  if (!row.budget) return row.used ? 'bad' : 'ok'
  const pct = usePct(row)
  return pct > 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok'
}
const focusOrigins = computed(() => focusEntries.value
  .filter(item => !centerScope.value.limited || centerScope.value.centerIds.includes(item.centerId))
  .filter(item => !centerFilter.value || (centerFilter.value === 'none' ? !item.centerId : item.centerId === centerFilter.value))
  .slice()
  .sort((a, b) => b.value - a.value))
function openRecord(line: StatementLine) {
  const id = line.editableId ?? (line.parts.length === 1 ? line.parts[0].id : undefined)
  if (!id) return
  const allocation = store.state.budgets.find(entry => entry.categoryId === id && entry.period === year.value)
  if (allocation) ui.openRecord('budget', allocation.id, { window: year.value })
}

/* ---------- Ações ---------- */
const canResolve = (kind: string) => store.can(kind === 'Saldo excedido' ? 'orcamentos.liberar_saldo' : 'orcamentos.gerir')
const tenantExceptions = computed(() => store.state.budgetExceptions.filter(entry => entry.tenantId === ui.activeTenantId))
const pendingExceptions = computed(() => tenantExceptions.value.filter(entry => entry.status === 'Pendente' && canResolve(entry.kind)).length)
const missingCenter = computed(() => store.state.budgetEntries.filter(entry => entry.tenantId === ui.activeTenantId && entry.period.startsWith(year.value) && (entry.kind === 'Realizado pago' || entry.kind === 'Previsão') && entry.status !== 'Cancelado' && !entry.costCenter))
const usableCategories = computed(() => store.state.budgetCategories.filter(entry => entry.tenantId === ui.activeTenantId && entry.status !== 'Inativa').sort((a, b) => a.code.localeCompare(b.code)))
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

/* ---------- Categorias e distribuição por centro ---------- */
const userName = (id?: string) => store.state.users.find(entry => entry.id === id)?.name ?? '—'
const categoryForm = reactive({ name: '', group: '03. Custos' as string, parentId: '' })
const parentCategory = computed(() => categoryForm.parentId ? category(categoryForm.parentId) : undefined)
watch(() => categoryForm.group, groupName => {
  const parent = category(categoryForm.parentId)
  if (parent && parent.group !== groupName) categoryForm.parentId = ''
})
const codePreview = computed(() => {
  try { return nextCategoryCode(store.state, ui.activeTenantId, parentCategory.value?.group ?? categoryForm.group, parentCategory.value?.id) } catch { return '—' }
})
function createCategory() {
  const created = store.createBudgetCategory({ name: categoryForm.name, group: parentCategory.value?.group ?? categoryForm.group, parentId: categoryForm.parentId || undefined })
  if (created) Object.assign(categoryForm, { name: '', parentId: '' })
}
function changeStatus(entry: BudgetCategory, status: BudgetCategoryStatus) {
  store.updateBudgetCategory(entry.id, { name: entry.name, status }, 'Situação enviada ao Omie')
}
function allocationFor(categoryId: string) {
  return store.state.budgets.find(entry => entry.categoryId === categoryId && entry.period === year.value)
}
function groupAnnual(name: string) {
  return leavesInGroup(store.state, ui.activeTenantId, name).reduce((sum, entry) => sum + amountOf(entry.id), 0)
}
const tree = computed(() => BUDGET_GROUPS.map(entry => ({
  ...entry,
  rows: store.state.budgetCategories.filter(item => item.tenantId === ui.activeTenantId && !item.parentId && item.group === entry.name).sort((a, b) => a.code.localeCompare(b.code)).flatMap(item => {
    const kids = store.state.budgetCategories.filter(child => child.parentId === item.id).sort((a, b) => a.code.localeCompare(b.code))
    return [{ category: item, depth: 0, head: kids.length > 0 }, ...kids.map(child => ({ category: child, depth: 1, head: false }))]
  }),
})))
const splittable = (item: BudgetCategory) => isSpendCategory(item) && isBudgetLeaf(store.state, item.id)
function centersSummary(categoryId: string) {
  const allocation = allocationFor(categoryId)
  const lines = costCenterAmounts(allocation?.amount ?? 0, allocation?.costCenterSplit)
  if (!lines.length) return { text: 'Sem centro', covered: 0 }
  const covered = round2(lines.reduce((sum, line) => sum + line.percent, 0))
  const names = lines.map(line => store.state.costCenters.find(entry => entry.id === line.costCenterId)?.code ?? '').filter(Boolean)
  return { text: `${names.join(', ')} · ${covered}%`, covered }
}

const splitCategoryId = ref('')
const splitMode = ref<'percent' | 'amount'>('percent')
const splitRows = ref<{ costCenterId: string; value: number }[]>([])
const addCenterId = ref('')
const splitAmount = computed(() => splitCategoryId.value ? annualAbs(splitCategoryId.value) : 0)
const suggestions = computed(() => {
  if (!splitCategoryId.value) return []
  try { return suggestCategoryCenters(store.state, ui.activeTenantId, splitCategoryId.value, year.value) } catch { return [] }
})
const activeCenters = computed(() => store.state.costCenters.filter(entry => entry.tenantId === ui.activeTenantId && entry.status === 'Ativo').sort((a, b) => a.code.localeCompare(b.code)))
const freeCenters = computed(() => activeCenters.value.filter(entry => !splitRows.value.some(row => row.costCenterId === entry.id)))
const splitSum = computed(() => round2(splitRows.value.reduce((sum, row) => sum + (Number(row.value) || 0), 0)))
const splitTarget = computed(() => splitMode.value === 'percent' ? 100 : splitAmount.value)
const splitGap = computed(() => round2(splitTarget.value - splitSum.value))
const splitTolerance = computed(() => splitMode.value === 'percent' ? 0.05 : 0.01)
const splitValid = computed(() => splitAmount.value > 0 && splitGap.value >= -splitTolerance.value)
const centerOf = (id: string) => store.state.costCenters.find(entry => entry.id === id)
function centerHint(code: string) {
  const names = store.state.sectors.filter(entry => sectorCostCenter(entry, ui.activeTenantId) === code).map(entry => entry.name)
  return names.length ? `padrão de ${names.join(', ')}` : ''
}
function suggestionRows() {
  const rows = suggestions.value.map(entry => ({ costCenterId: entry.costCenterId, value: entry.percent }))
  const sum = round2(rows.reduce((total, row) => total + row.value, 0))
  if (rows.length && sum > 100) rows[0].value = round2(rows[0].value - (sum - 100))
  return rows
}
function openSplit(categoryId: string) {
  if (splitCategoryId.value === categoryId) {
    splitCategoryId.value = ''
    return
  }
  splitCategoryId.value = categoryId
  addCenterId.value = ''
  const existing = allocationFor(categoryId)?.costCenterSplit
  splitMode.value = existing?.mode ?? 'percent'
  splitRows.value = existing ? existing.lines.map(line => ({ ...line })) : suggestionRows()
}
function goToSplit(categoryId: string) {
  screen.value = 'categorias'
  splitCategoryId.value = ''
  openSplit(categoryId)
}
function useSuggestion() {
  splitMode.value = 'percent'
  splitRows.value = suggestionRows()
}
function addCenter() {
  if (!addCenterId.value) return
  splitRows.value.push({ costCenterId: addCenterId.value, value: 0 })
  addCenterId.value = ''
}
function removeRow(id: string) {
  splitRows.value = splitRows.value.filter(row => row.costCenterId !== id)
}
function setSplitMode(mode: 'percent' | 'amount') {
  if (mode === splitMode.value) return
  const total = splitAmount.value
  if (total > 0) {
    for (const row of splitRows.value) {
      const value = Number(row.value) || 0
      row.value = mode === 'amount' ? Math.round(total * value) / 100 : Math.round(value / total * 10000) / 100
    }
  }
  splitMode.value = mode
}
function shareOf(value: number) {
  if (!splitAmount.value) return 0
  return splitMode.value === 'percent' ? Math.round(splitAmount.value * (Number(value) || 0)) / 100 : Math.round((Number(value) || 0) / splitAmount.value * 10000) / 100
}
const suggestionFor = (centerId: string) => suggestions.value.find(entry => entry.costCenterId === centerId)
function saveSplit() {
  if (!splitValid.value || !splitCategoryId.value) return
  if (store.setCostCenterSplit(splitCategoryId.value, year.value, splitMode.value, splitRows.value)) splitCategoryId.value = ''
}
</script>

<template>
  <div class="budget-top">
    <div>
      <h2>Orçamento {{ screen === 'visao' ? periodText : year }}</h2>
      <p class="cell-sub">{{ screen === 'acoes' || screen === 'categorias' || screen === 'centros' ? store.state.tenants.find(entry => entry.id === ui.activeTenantId)?.tradeName : scopeLabel }}<template v-if="planning"> · base no realizado de {{ priorYear }}</template></p>
    </div>
    <PeriodScopeBar v-model:year="year" v-model:from="fromMonth" v-model:to="toMonth" v-model:scope="scope" :months="screen === 'visao'" :companies="screen === 'visao' || planning" />
  </div>

  <nav class="orc-tabs" data-tour="budget-tabs">
    <button type="button" :class="{ on: screen === 'visao' }" data-tour="budget-tab-visao" @click="screen = 'visao'">Visão geral</button>
    <button type="button" :class="{ on: screen === 'acoes' }" data-tour="budget-tab-acoes" @click="screen = 'acoes'">Ações <b v-if="pendingExceptions">{{ pendingExceptions }}</b></button>
    <button type="button" :class="{ on: screen === 'categorias' }" data-tour="budget-tab-categorias" @click="screen = 'categorias'">Categorias</button>
    <button type="button" :class="{ on: screen === 'centros' }" data-tour="budget-tab-centros" @click="screen = 'centros'">Centros de custo</button>
    <button type="button" :class="{ on: planning }" data-tour="budget-tab-planejamento" @click="screen = planning ? screen : 'anual'">Planejamento</button>
  </nav>

  <p v-if="readOnlyNote && (screen === 'visao' || planning)" class="notice">{{ readOnlyNote }}</p>

  <!-- Visão geral -->
  <template v-if="screen === 'visao'">
    <section class="metrics cols-4 dre-metrics">
      <div class="metric"><span class="metric-head">Orçado</span><strong>{{ money(overviewTotals.budget) }}</strong><small>Custo, despesa e investimento</small></div>
      <div class="metric"><span class="metric-head">Realizado</span><strong :class="overviewTotals.use > 100 ? 'num-bad' : ''">{{ money(overviewTotals.realized) }}</strong><small>Pago no período</small></div>
      <div class="metric"><span class="metric-head">Previsão</span><strong class="num-forecast">{{ money(overviewTotals.forecast) }}</strong><small>Compromissos ainda não pagos</small></div>
      <div class="metric"><span class="metric-head">Saldo</span><strong :class="overviewTotals.free < 0 ? 'num-bad' : 'num-ok'">{{ fmtCurrency(overviewTotals.free) }}</strong><small>{{ overviewTotals.use }}% usado</small></div>
    </section>
    <article class="card flush" data-tour="record-list">
      <div class="orc-card-head">
        <div>
          <h2>Custo, despesa e investimento</h2>
          <p>Clique numa conta para ver a origem do desvio por centro de custo. Receita e lucro ficam no DRE.</p>
        </div>
        <button type="button" class="button ghost small" :class="{ on: onlyOverrun }" @click="onlyOverrun = !onlyOverrun">Só o que estourou <b v-if="overrunLines.length">{{ overrunLines.length }}</b></button>
      </div>
      <p v-if="centerScope.limited" class="notice info">Você vê só a parte {{ scopedCenters.map(entry => `${entry.code} ${entry.name}`).join(', ') || 'dos centros do seu papel' }}. O total da empresa fica com o Financeiro.</p>
      <p v-if="onlyOverrun && !overviewLines.length" class="empty-note">Nenhuma conta passou do orçamento neste período.</p>
      <div class="orc-scroll">
        <table class="statement orc-table">
          <thead>
            <tr>
              <th>Conta</th>
              <th class="num">Orçado</th>
              <th class="num">Realizado</th>
              <th class="num">Previsão</th>
              <th class="num">Desvio</th>
              <th class="num">Uso</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="line in overviewLines" :key="line.key">
              <tr :class="[rowClass(line), { 'is-focus': focusKey === line.key }]">
                <td :style="{ paddingLeft: `${12 + (onlyOverrun ? 0 : line.depth * 18)}px` }">
                  <button v-if="!onlyOverrun && foldable(line)" type="button" class="fold" :title="collapsed[line.key] ? 'Expandir' : 'Recolher'" @click="toggleFold(line.key)"><ChevronDown v-if="!collapsed[line.key]" :size="14" /><ChevronRight v-else :size="14" /></button>
                  <button v-if="line.kind === 'conta'" type="button" class="linkish" @click="toggleFocus(line)">{{ line.code ? `${line.code} ` : '' }}{{ line.label }}</button>
                  <template v-else>{{ line.label }}</template>
                </td>
                <td class="num">{{ money(viewBudget(line)) }}</td>
                <td class="num" :class="`num-${toneOf(line) || 'none'}`">{{ money(viewRealized(line)) }}</td>
                <td class="num num-forecast">{{ money(viewForecast(line)) }}</td>
                <td class="num" :class="lineGap(line) > 0 ? 'num-bad' : lineGap(line) < 0 ? 'num-ok' : ''">{{ lineGap(line) > 0 ? `+${fmtCurrency(lineGap(line))}` : money(lineGap(line)) }}</td>
                <td class="num"><span v-if="viewBudget(line) || consumed(line)" class="tone" :class="toneOf(line)">{{ viewBudget(line) ? `${lineUse(line).toFixed(0)}%` : 'sem teto' }}</span><template v-else>—</template></td>
              </tr>
              <tr v-if="focusKey === line.key">
                <td colspan="6" class="focus-cell">
                  <div class="origin-panel">
                    <div class="focus-head">
                      <strong>Origem do desvio · {{ line.label }}</strong>
                      <button v-if="line.editableId || line.parts.length === 1" type="button" class="button ghost small" @click="openRecord(line)">Abrir ficha</button>
                    </div>
                    <p v-if="!focusCenters.length" class="cell-sub">Sem orçado nem lançamento por centro neste período.</p>
                    <div v-else class="center-cards">
                      <button v-for="row in focusCenters" :key="row.id" type="button" class="center-card" :class="{ on: centerFilter === row.id, none: row.id === 'none' }" :title="centerFilter === row.id ? 'Mostrar todas as origens' : 'Filtrar as origens deste centro'" @click="centerFilter = centerFilter === row.id ? '' : row.id">
                        <strong>{{ row.label }}</strong>
                        <span class="cell-sub">{{ row.owner }}</span>
                        <i class="bar"><b :class="useTone(row)" :style="{ width: `${Math.min(100, usePct(row))}%` }" /></i>
                        <span class="figures"><span>{{ fmtCurrency(row.used) }} de {{ fmtCurrency(row.budget) }}</span><span class="tone" :class="useTone(row)">{{ row.budget ? `${usePct(row)}%` : 'sem fatia' }}</span></span>
                      </button>
                    </div>
                    <table v-if="focusOrigins.length" class="dense">
                      <thead><tr><th class="num">Valor</th><th>Origem</th><th>Descrição</th><th>Centro</th><th>Tipo</th><th>Mês</th></tr></thead>
                      <tbody>
                        <tr v-for="item in focusOrigins" :key="item.entry.id">
                          <td class="num"><strong>{{ fmtCurrency(item.value) }}</strong></td>
                          <td>{{ item.entry.sourceModule }} · {{ item.entry.sourceId }}</td>
                          <td>{{ item.entry.description }}</td>
                          <td>{{ item.entry.costCenter || 'sem centro' }}</td>
                          <td><span :class="item.entry.kind === 'Previsão' ? 'num-forecast' : ''">{{ item.entry.kind === 'Previsão' ? 'Previsão' : 'Realizado' }}</span></td>
                          <td>{{ item.entry.period }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-else class="cell-sub">Nenhum lançamento {{ centerFilter ? 'deste centro ' : '' }}neste período.</p>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </article>
  </template>

  <!-- Ações -->
  <template v-else-if="screen === 'acoes'">
    <article class="card flush" data-tour="budget-actions">
      <div class="orc-card-head"><div><h2>Decisões pendentes</h2><p>Saldo excedido, pagamento sem categoria e nota sem vínculo. Cada linha mostra quem decide.</p></div></div>
      <table><thead><tr><th>Ação</th><th>Origem</th><th>Descrição</th><th>Valor</th><th>Período</th><th>Situação</th><th>Decisão</th></tr></thead>
        <tbody><tr v-for="entry in tenantExceptions" :key="entry.id">
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
      </table>
    </article>
    <article v-if="missingCenter.length" class="card flush">
      <div class="orc-card-head"><div><h2>Lançamentos sem centro de custo</h2><p>O gasto entrou na conta e ainda não diz o lugar. Esta parte fica com o Financeiro.</p></div></div>
      <table class="dense"><thead><tr><th>Origem</th><th>Descrição</th><th class="num">Valor</th><th>Período</th></tr></thead>
        <tbody><tr v-for="entry in missingCenter" :key="entry.id"><td>{{ entry.sourceModule }} · {{ entry.sourceId }}</td><td>{{ entry.description }}</td><td class="num">{{ fmtCurrency(entry.amount) }}</td><td>{{ entry.period }}</td></tr></tbody>
      </table>
    </article>
  </template>

  <!-- Categorias -->
  <article v-else-if="screen === 'categorias'" class="card flush" data-tour="budget-categories">
    <div class="orc-card-head">
      <div>
        <h2><ListTree :size="16" /> Categorias de {{ year }}</h2>
        <p>Informe o valor do ano e, na mesma linha, os centros de custo que respondem por ele.</p>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Código</th><th>Categoria</th><th class="num">Orçamento {{ year }}</th><th data-tour="budget-split">Centros de custo</th><th>Limiar</th><th>Saldo negativo</th><th>Situação</th></tr></thead>
      <tbody v-for="entry in tree" :key="entry.code">
        <tr class="group-row"><td colspan="2"><strong>{{ entry.name }}</strong></td><td class="num"><strong>{{ fmtCurrency(groupAnnual(entry.name)) }}</strong></td><td colspan="4"></td></tr>
        <template v-for="row in entry.rows" :key="row.category.id">
          <tr class="cat-row" :class="[`depth-${row.depth}`, { head: row.head }]">
            <td class="code">{{ row.category.code }}</td>
            <td>{{ row.category.name }}</td>
            <td class="num">
              <MoneyInput v-if="canManage && isBudgetLeaf(store.state, row.category.id) && !isDepreciationCategory(row.category)" :model-value="shownAnnual(row.category.id)" @update:model-value="drafts[row.category.id] = $event" @blur="saveAnnual(row.category.id)" />
              <template v-else>{{ fmtCurrency(amountOf(row.category.id)) }}<span v-if="isDepreciationCategory(row.category)" class="cell-sub">Vem dos ativos</span></template>
            </td>
            <td>
              <button v-if="splittable(row.category)" type="button" class="button ghost small split-btn" :class="{ on: centersSummary(row.category.id).covered > 0 }" :disabled="!canManage && !centersSummary(row.category.id).covered" @click="openSplit(row.category.id)">
                <PieChart :size="13" /> {{ centersSummary(row.category.id).text }}
              </button>
              <span v-else class="cell-sub">{{ row.head ? 'Nas subcategorias' : '—' }}</span>
            </td>
            <td><input v-if="allocationFor(row.category.id) && !isDepreciationCategory(row.category)" :value="allocationFor(row.category.id)!.alertThreshold" class="cell-input" type="number" min="1" max="100" :disabled="!canManage" @change="store.configureBudget(allocationFor(row.category.id)!.id, Number(($event.target as HTMLInputElement).value), allocationFor(row.category.id)!.blockOnOverrun)" /><span v-else class="cell-sub">—</span></td>
            <td><button v-if="allocationFor(row.category.id) && canManage && !isDepreciationCategory(row.category)" class="button ghost small" @click="store.configureBudget(allocationFor(row.category.id)!.id, allocationFor(row.category.id)!.alertThreshold, !allocationFor(row.category.id)!.blockOnOverrun)">{{ allocationFor(row.category.id)!.blockOnOverrun ? 'Retém até a liberação' : 'Somente alerta' }}</button><span v-else class="cell-sub">—</span></td>
            <td><select class="filter" :value="row.category.status" :disabled="!canManage" @change="changeStatus(row.category, ($event.target as HTMLSelectElement).value as BudgetCategoryStatus)"><option>Ativa</option><option>Inativa</option></select></td>
          </tr>
          <tr v-if="splitCategoryId === row.category.id">
            <td colspan="7" class="split-inline">
              <p v-if="!(splitAmount > 0)" class="notice warning">Informe o orçamento do ano nesta linha antes de escolher os centros.</p>
              <template v-else>
                <div class="split-head">
                  <div class="seg">
                    <button type="button" :class="{ on: splitMode === 'percent' }" @click="setSplitMode('percent')">Porcentagem</button>
                    <button type="button" :class="{ on: splitMode === 'amount' }" @click="setSplitMode('amount')">Valor</button>
                  </div>
                  <button v-if="canManage && suggestions.length" type="button" class="button ghost small" @click="useSuggestion"><Sparkles :size="13" /> Usar o realizado de {{ priorYear }}</button>
                </div>
                <table class="dense split-table">
                  <thead><tr><th>Centro de custo</th><th>Responsável</th><th class="num">{{ splitMode === 'percent' ? '%' : 'Valor' }}</th><th class="num">{{ splitMode === 'percent' ? 'Valor' : '%' }}</th><th class="num">Realizado {{ priorYear }}</th><th></th></tr></thead>
                  <tbody>
                    <tr v-if="!splitRows.length"><td colspan="6" class="empty-note">Nenhum centro escolhido. Todo o valor fica com o Financeiro.</td></tr>
                    <tr v-for="item in splitRows" :key="item.costCenterId">
                      <td>{{ centerOf(item.costCenterId)?.code }} {{ centerOf(item.costCenterId)?.name }}<span v-if="centerHint(centerOf(item.costCenterId)?.code ?? '')" class="cell-sub">{{ centerHint(centerOf(item.costCenterId)?.code ?? '') }}</span></td>
                      <td>{{ userName(centerOf(item.costCenterId)?.responsibleUserId) }}</td>
                      <td class="num">
                        <MoneyInput v-if="splitMode === 'amount'" compact :model-value="item.value" :disabled="!canManage" @update:model-value="item.value = $event" />
                        <input v-else class="cell-input mini" type="number" min="0" step="0.01" :value="item.value" :disabled="!canManage" @input="item.value = Number(($event.target as HTMLInputElement).value)" />
                      </td>
                      <td class="num"><span class="muted">{{ splitMode === 'percent' ? fmtCurrency(shareOf(item.value)) : `${shareOf(item.value)}%` }}</span></td>
                      <td class="num"><span class="muted">{{ suggestionFor(item.costCenterId) ? `${suggestionFor(item.costCenterId)!.percent}%` : '—' }}</span></td>
                      <td><button v-if="canManage" type="button" class="icon-button tiny" title="Tirar este centro" @click="removeRow(item.costCenterId)"><X :size="13" /></button></td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="canManage && freeCenters.length" class="filter-row center-add">
                  <select v-model="addCenterId" class="filter">
                    <option value="">Adicionar centro</option>
                    <option v-for="center in freeCenters" :key="center.id" :value="center.id">{{ center.code }} · {{ center.name }}<template v-if="suggestionFor(center.id)"> · {{ suggestionFor(center.id)!.percent }}% em {{ priorYear }}</template></option>
                  </select>
                  <button type="button" class="button secondary small" :disabled="!addCenterId" @click="addCenter"><Plus :size="13" /> Adicionar</button>
                </div>
                <p class="split-sum" :class="{ ok: splitValid && splitGap <= splitTolerance, bad: !splitValid }">
                  Soma {{ splitMode === 'percent' ? `${splitSum}%` : fmtCurrency(splitSum) }}
                  <template v-if="splitGap < -splitTolerance"> · passa {{ splitMode === 'percent' ? `${Math.abs(splitGap)}%` : fmtCurrency(Math.abs(splitGap)) }} do orçamento</template>
                  <template v-else-if="splitGap > splitTolerance"> · {{ splitMode === 'percent' ? `${splitGap}%` : fmtCurrency(splitGap) }} sem centro, com o Financeiro</template>
                  <template v-else> · todo o valor tem centro responsável</template>
                </p>
                <div v-if="canManage" class="row-actions">
                  <button type="button" class="button secondary small" @click="splitCategoryId = ''">Cancelar</button>
                  <button type="button" class="button small" :disabled="!splitValid" @click="saveSplit">Salvar centros</button>
                </div>
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <fieldset v-if="canManage" class="layer"><legend>Nova categoria ou subcategoria</legend><div class="filter-row">
      <select v-model="categoryForm.group" class="filter"><option v-for="entry in BUDGET_GROUPS" :key="entry.code" :value="entry.name">{{ entry.name }}</option></select>
      <select v-model="categoryForm.parentId" class="filter"><option value="">Nova categoria neste grupo</option><option v-for="entry in usableCategories.filter(item => item.group === categoryForm.group && !item.parentId)" :key="entry.id" :value="entry.id">Subcategoria de {{ entry.code }} · {{ entry.name }}</option></select>
      <input v-model="categoryForm.name" class="filter grow" placeholder="Nome" />
      <span class="cell-sub">Código {{ codePreview }}</span>
      <button class="button small" @click="createCategory"><Plus :size="14" /> Criar</button>
    </div></fieldset>
  </article>

  <!-- Centros de custo -->
  <CostCentersPanel v-else-if="screen === 'centros'" :year="year" @open-category="goToSplit" />

  <!-- Planejamento -->
  <template v-else>
    <div class="plan-modes" data-tour="budget-plan-modes">
      <div class="seg">
        <button type="button" :class="{ on: screen === 'anual' }" @click="screen = 'anual'">Anual</button>
        <button type="button" :class="{ on: screen === 'mensal' }" @click="screen = 'mensal'">Mensal</button>
        <button type="button" :class="{ on: screen === 'capex' }" @click="screen = 'capex'">CAPEX</button>
      </div>
    </div>

    <article v-if="screen === 'anual'" class="card meta-bar" data-tour="budget-summary">
      <div data-tour="budget-plan-target">
        <span class="cell-sub">Meta de faturamento {{ year }}</span>
        <MoneyInput v-model="metaValue" />
      </div>
      <p class="cell-sub">
        Realizado {{ priorYear }}: <strong>{{ fmtCurrency(metaBase) }}</strong>
        <template v-if="metaPreview !== null"> · <strong>{{ metaPreview >= 0 ? '+' : '' }}{{ metaPreview }}%</strong></template>
      </p>
      <button class="button small" :disabled="(groupView ? !canPlanGroup : !canEditHere) || !(metaValue > 0)" @click="applyMeta"><TrendingUp :size="14" /> Definir meta e aplicar %</button>
    </article>

    <article v-if="screen === 'anual'" class="card flush">
      <div class="orc-card-head">
        <div>
          <h2>Orçamento {{ year }}</h2>
          <p>Realizado de {{ priorYear }} e participação sobre a receita bruta. A simulação guarda este plano sem precisar redigitar.</p>
        </div>
        <div v-if="canEditHere" class="row-actions">
          <button type="button" class="button ghost small" @click="store.saveBudgetSimulation(year)">Salvar simulação</button>
          <button v-if="savedSimulation" type="button" class="button small" @click="store.applyBudgetSimulation(year)">Aplicar simulação de {{ savedSimulation.savedBy }}</button>
        </div>
      </div>
      <div class="orc-scroll">
        <table class="statement orc-table">
          <thead>
            <tr>
              <th>Conta</th>
              <th class="num">Real. {{ priorYear }}</th>
              <th class="num">AV% Real.</th>
              <th class="num">Cresc. %</th>
              <th class="num">Orç. {{ year }}</th>
              <th class="num">AV% {{ year }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in visibleStatement" :key="line.key" :class="rowClass(line)">
              <td :style="{ paddingLeft: `${12 + line.depth * 18}px` }">
                <div class="conta-line">
                  <button v-if="foldable(line)" type="button" class="fold" :title="collapsed[line.key] ? 'Expandir' : 'Recolher'" @click="toggleFold(line.key)"><ChevronDown v-if="!collapsed[line.key]" :size="14" /><ChevronRight v-else :size="14" /></button>
                  <button v-if="line.kind === 'conta'" type="button" class="linkish" @click="openRecord(line)">{{ line.code ? `${line.code} ` : '' }}{{ line.label }}</button>
                  <template v-else>{{ line.label }}</template>
                  <span v-if="line.editableId && canEditHere && spendLine(line)" class="conta-tools">
                    <button type="button" class="button ghost small split-btn" :class="{ on: centersSummary(line.editableId).covered > 0 }" title="Escolher os centros de custo desta conta" @click.stop="goToSplit(line.editableId)"><PieChart :size="13" /> Centros</button>
                  </span>
                </div>
              </td>
              <td class="num">{{ money(linePrior(line)) }}</td>
              <td class="num"><span class="av-cell">{{ avText(linePrior(line), robPrior) }}<i class="bar"><b :class="{ neg: linePrior(line) < 0 }" :style="{ width: `${avWidth(linePrior(line), robPrior)}%` }" /></i></span></td>
              <td class="num">
                <input v-if="line.editableId && canEditHere && !depreciationLine(line)" class="cell-input mini" type="number" step="0.1" :value="growthOf(line) ?? 0" @change="commitGrowth(line.editableId!, ($event.target as HTMLInputElement).value)" />
                <template v-else>{{ depreciationLine(line) || growthOf(line) === undefined ? '—' : `${growthOf(line)}%` }}</template>
              </td>
              <td class="num">
                <MoneyInput v-if="line.editableId && canEditHere && !depreciationLine(line)" :model-value="shownAnnual(line.editableId)" @update:model-value="drafts[line.editableId!] = $event" @blur="saveAnnual(line.editableId!)" />
                <template v-else>{{ money(lineBudget(line)) }}<span v-if="depreciationLine(line)" class="cell-sub">Ativos</span></template>
              </td>
              <td class="num"><span class="av-cell">{{ avText(lineBudget(line), robBudget) }}<i class="bar"><b :class="{ neg: lineBudget(line) < 0 }" :style="{ width: `${avWidth(lineBudget(line), robBudget)}%` }" /></i></span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article v-else-if="screen === 'mensal'" class="card flush">
      <div class="orc-card-head">
        <div>
          <h2>Orçamento {{ year }} · meses</h2>
          <p>O realizado de {{ priorYear }} aparece embaixo do mês quando houve movimento.</p>
        </div>
        <button v-if="canEditHere" class="button secondary small" data-tour="budget-seasonality" @click="applySeasonality"><CalendarDays :size="14" /> Repetir sazonalidade de {{ priorYear }}</button>
      </div>
      <div class="orc-scroll month-scroll">
        <table class="statement orc-table month-table">
          <thead>
            <tr>
              <th>Conta</th>
              <th v-for="label in shortMonths" :key="label" class="num">{{ label }}</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in visibleStatement" :key="line.key" :class="rowClass(line)">
              <td :style="{ paddingLeft: `${12 + line.depth * 18}px` }">
                <button v-if="foldable(line)" type="button" class="fold" :title="collapsed[line.key] ? 'Expandir' : 'Recolher'" @click="toggleFold(line.key)"><ChevronDown v-if="!collapsed[line.key]" :size="14" /><ChevronRight v-else :size="14" /></button>
                {{ line.code && line.kind === 'conta' ? `${line.code} ` : '' }}{{ line.label }}
              </td>
              <td v-for="(value, index) in lineMonths(line)" :key="index" class="num">
                <MoneyInput v-if="line.editableId && canEditHere && !depreciationLine(line)" compact :model-value="shownMonth(line.editableId, index)" @update:model-value="monthDrafts[monthKey(line.editableId, index)] = $event" @blur="saveMonth(line.editableId, index)" />
                <template v-else>{{ money(value) }}</template>
                <small v-if="linePriorMonths(line)[index]" class="month-ref">{{ fmtCurrency(linePriorMonths(line)[index]) }}</small>
              </td>
              <td class="num">{{ money(lineBudget(line)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article v-else class="card flush">
      <div class="orc-card-head">
        <div>
          <h2>Investimentos (CAPEX) · {{ year }}</h2>
          <p>Fora da receita líquida. O realizado é o do próprio ano.</p>
        </div>
      </div>
      <div class="orc-scroll">
        <table class="statement orc-table">
          <thead><tr><th>Conta</th><th class="num">Orçado (R$)</th><th class="num">Realizado (R$)</th><th class="num">Saldo (R$)</th><th class="num">Execução</th></tr></thead>
          <tbody>
            <tr v-for="line in capexLines" :key="line.key" :class="rowClass(line)">
              <td :style="{ paddingLeft: `${12 + line.depth * 18}px` }">
                <div class="conta-line">
                  <button v-if="foldable(line)" type="button" class="fold" :title="collapsed[line.key] ? 'Expandir' : 'Recolher'" @click="toggleFold(line.key)"><ChevronDown v-if="!collapsed[line.key]" :size="14" /><ChevronRight v-else :size="14" /></button>
                  <span>{{ line.code }} {{ line.label }}</span>
                  <button v-if="line.editableId && canEditHere && spendLine(line)" type="button" class="button ghost small split-btn" :class="{ on: centersSummary(line.editableId).covered > 0 }" title="Escolher os centros de custo desta conta" @click.stop="goToSplit(line.editableId)"><PieChart :size="13" /> Centros</button>
                </div>
              </td>
              <td class="num">
                <MoneyInput v-if="line.editableId && canEditHere" :model-value="shownAnnual(line.editableId)" @update:model-value="drafts[line.editableId!] = $event" @blur="saveAnnual(line.editableId!)" />
                <template v-else>{{ money(lineBudget(line)) }}</template>
              </td>
              <td class="num">{{ money(lineRealized(line)) }}</td>
              <td class="num" :class="{ deduct: lineBudget(line) - lineRealized(line) < 0 }">{{ money(lineBudget(line) - lineRealized(line)) }}</td>
              <td class="num"><span class="av-cell">{{ lineBudget(line) ? `${(lineRealized(line) / lineBudget(line) * 100).toFixed(1)}%` : '—' }}<i class="bar"><b :style="{ width: `${lineBudget(line) ? Math.min(100, lineRealized(line) / lineBudget(line) * 100) : 0}%` }" /></i></span></td>
            </tr>
            <tr class="calculo">
              <td>Total de investimentos</td>
              <td class="num">{{ money(capexTotals.budget) }}</td>
              <td class="num">{{ money(capexTotals.realized) }}</td>
              <td class="num">{{ money(capexTotals.budget - capexTotals.realized) }}</td>
              <td class="num">{{ capexTotals.budget ? `${(capexTotals.realized / capexTotals.budget * 100).toFixed(1)}%` : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </template>
</template>
