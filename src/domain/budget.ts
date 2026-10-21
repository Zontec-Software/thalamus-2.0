import { hasFullAccess } from './access'
import type { ErpState } from './engine'
import { addSyncLog, DomainError, log, nextId, now, today } from './engine'
import type {
  Budget, BudgetCategory, BudgetEntry, BudgetException, InvoiceLinkModule, OmieCategory, OmiePayment, Role,
} from '../types/domain'

export const DEFAULT_ALERT_THRESHOLD = 80
export const DEFAULT_BLOCK_THRESHOLD = 100

/** Grupos confirmados na especificação. 06 a 10 seguem pendentes de transcrição. */
export const BUDGET_GROUPS = [
  { code: '02', name: '02. Deduções da Receita' },
  { code: '03', name: '03. Custos' },
  { code: '04', name: '04. Despesas Variáveis' },
  { code: '05', name: '05. Despesas Fixas' },
] as const

export const BUDGET_REASONS = [
  'Planejamento inicial', 'Revisão da previsão', 'Remanejamento entre categorias', 'Novo projeto ou contrato',
  'Correção de valor informado', 'Corte de gastos', 'Outro',
] as const

export const BUDGET_ROLES: Role[] = ['Financeiro', 'Gestor', 'PCP', 'Compras', 'Engenharia', 'Comercial', 'Manutenção', 'Assistência', 'Qualidade']

/** Define orçamento, categorias, regras e trata pagamentos retidos. O Administrador também. */
export const PLANNER_ROLES: Role[] = ['Financeiro', 'Administrador']
/** Autoriza o lançamento acima do saldo. O Financeiro não entra; o Administrador entra. */
export const APPROVER_ROLES: Role[] = ['Gestor', 'Administrador']

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const round2 = (value: number) => Math.round(value * 100) / 100
export const monthOf = (date = today()) => date.slice(0, 7)

function assertPlanner(role: Role, action: string) {
  if (!PLANNER_ROLES.includes(role)) throw new DomainError(`Somente o Financeiro ou o Administrador ${action}`)
}

export function categoryOf(state: ErpState, id: string) {
  const category = state.budgetCategories.find(entry => entry.id === id)
  if (!category) throw new DomainError('Categoria orçamentária não encontrada')
  return category
}

/** A chave de controle é sempre a categoria; a subcategoria só detalha o custo. */
export function controlCategoryId(state: ErpState, id: string) {
  return categoryOf(state, id).parentId ?? id
}

export function childrenOf(state: ErpState, id: string) {
  return state.budgetCategories.filter(entry => entry.parentId === id)
}

export function allocationOf(state: ErpState, categoryId: string, period: string) {
  const exact = state.budgets.find(entry => entry.categoryId === categoryId && entry.period === period)
  if (exact) return exact
  const year = period.slice(0, 4)
  return year === period ? undefined : state.budgets.find(entry => entry.categoryId === categoryId && entry.period === year)
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Ano gravado, ou uma fatia de acompanhamento: AAAA-MM, AAAA-Q1..Q4, AAAA-S1..S2. */
export function budgetWindow(key: string) {
  if (/^\d{4}$/.test(key)) return { key, year: key, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], label: key }
  const month = key.match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  if (month) {
    const index = Number(month[2])
    return { key, year: month[1], months: [index], label: `${MONTH_NAMES[index - 1]} de ${month[1]}` }
  }
  const quarter = key.match(/^(\d{4})-Q([1-4])$/)
  if (quarter) {
    const start = (Number(quarter[2]) - 1) * 3 + 1
    return { key, year: quarter[1], months: [start, start + 1, start + 2], label: `${quarter[2]}º trimestre de ${quarter[1]}` }
  }
  const semester = key.match(/^(\d{4})-S([12])$/)
  if (semester) {
    const start = semester[2] === '1' ? 1 : 7
    return { key, year: semester[1], months: [start, start + 1, start + 2, start + 3, start + 4, start + 5], label: `${semester[2]}º semestre de ${semester[1]}` }
  }
  throw new DomainError('Período de acompanhamento inválido')
}

function sliceAmount(annual: number, months: number[]) {
  if (!annual || !months.length) return 0
  const shares = splitShares(annual, 12)
  return round2(months.reduce((sum, month) => sum + shares[month - 1], 0))
}

function entryInWindow(period: string, months: number[], year: string) {
  const match = period.match(/^(\d{4})-(\d{2})$/)
  if (!match) return period === year && months.length === 12
  return match[1] === year && months.includes(Number(match[2]))
}

function totals(entries: BudgetEntry[]) {
  const forecast = round2(entries.filter(entry => entry.kind === 'Previsão' && ['Ativo', 'Parcial'].includes(entry.status)).reduce((sum, entry) => sum + entry.openAmount, 0))
  const realized = round2(entries.filter(entry => entry.kind === 'Realizado pago' && entry.status !== 'Cancelado').reduce((sum, entry) => sum + entry.amount, 0))
  const held = round2(entries.filter(entry => entry.heldAmount !== undefined)
    .reduce((sum, entry) => sum + entry.heldAmount! - (entry.status === 'Retido' ? 0 : entry.amount), 0))
  return { forecast, realized, held }
}

export function activeChildren(state: ErpState, id: string) {
  return childrenOf(state, id).filter(entry => entry.status !== 'Inativa')
}

/** O valor mora na folha. Categoria com subcategoria é só a soma delas. */
export function isBudgetLeaf(state: ErpState, id: string) {
  return activeChildren(state, id).length === 0
}

export function leavesInGroup(state: ErpState, group: string) {
  return state.budgetCategories.filter(entry => entry.group === group && entry.status !== 'Inativa' && isBudgetLeaf(state, entry.id))
}

export function budgetSummary(state: ErpState, categoryId: string, period: string) {
  const window = budgetWindow(period)
  const budget = allocationOf(state, categoryId, window.year)
  const children = childrenOf(state, categoryId)
  const ids = new Set([categoryId, ...children.map(entry => entry.id)])
  const entries = state.budgetEntries.filter(entry => ids.has(entry.categoryId) && entryInWindow(entry.period, window.months, window.year))
  const { forecast, realized, held } = totals(entries)
  const amount = children.length
    ? round2(children.reduce((sum, child) => sum + sliceAmount(allocationOf(state, child.id, window.year)?.amount ?? 0, window.months), 0))
    : sliceAmount(budget?.amount ?? 0, window.months)
  const balance = round2(amount - forecast - realized)
  return { budget, entries, amount, forecast, realized, held, balance, deviation: round2(forecast + realized - amount), use: amount ? round2((forecast + realized) / amount * 100) : 0, window }
}

/** Previsão e realizado de uma subcategoria, para detalhar a ficha da categoria. */
export function subcategorySummary(state: ErpState, id: string, period: string) {
  const window = budgetWindow(period)
  return totals(state.budgetEntries.filter(entry => entry.categoryId === id && entryInWindow(entry.period, window.months, window.year)))
}

function audit(state: ErpState, actor: string, field: string, from: string, to: string, reason: string) {
  return { id: nextId(state, 'BA'), at: now(), actor, field, from, to, reason }
}

export function nextCategoryCode(state: ErpState, group: string, parentId?: string) {
  const parent = parentId ? categoryOf(state, parentId) : undefined
  const prefix = parent ? parent.code : BUDGET_GROUPS.find(entry => entry.name === group)?.code
  if (!prefix) throw new DomainError('Escolha um grupo confirmado')
  const siblings = state.budgetCategories.filter(entry => parent ? entry.parentId === parent.id : !entry.parentId && entry.group === group)
  const last = siblings.reduce((max, entry) => Math.max(max, Number(entry.code.split('.').pop()) || 0), 0)
  return `${prefix}.${String(last + 1).padStart(2, '0')}`
}

export function createBudgetCategory(state: ErpState, input: Pick<BudgetCategory, 'name' | 'group' | 'parentId' | 'responsibleRole'>, actor: string, role: Role) {
  assertPlanner(role, 'configura categorias')
  if (!input.name.trim()) throw new DomainError('Informe o nome da categoria')
  if (!input.responsibleRole) throw new DomainError('Toda categoria precisa de um responsável funcional')
  const parent = input.parentId ? categoryOf(state, input.parentId) : undefined
  if (parent?.parentId) throw new DomainError('Subcategoria não pode ter outra subcategoria abaixo')
  if (parent?.status === 'Inativa') throw new DomainError('A categoria pai está inativa')
  const group = parent?.group ?? input.group
  if (!BUDGET_GROUPS.some(entry => entry.name === group)) throw new DomainError('Escolha um grupo confirmado')
  const siblings = state.budgetCategories.filter(entry => parent ? entry.parentId === parent.id : !entry.parentId && entry.group === group)
  if (siblings.some(entry => entry.name.toLowerCase() === input.name.trim().toLowerCase())) throw new DomainError('Já existe uma categoria com este nome neste nível')
  const category: BudgetCategory = {
    id: nextId(state, 'BC'), code: nextCategoryCode(state, group, parent?.id), name: input.name.trim(), group,
    parentId: parent?.id, responsibleRole: input.responsibleRole, status: 'Ativa', audit: [],
  }
  category.audit.unshift(audit(state, actor, 'Criação', '', category.name, parent ? `Subcategoria de ${parent.code}` : 'Cadastro inicial'))
  state.budgetCategories.push(category)
  log(state, 'Orçamentos', actor, `${parent ? 'Subcategoria' : 'Categoria'} ${category.code} · ${category.name} criada`, undefined, category.id)
  publishCategory(state, category)
  if (parent && childrenOf(state, parent.id).length === 1) inheritParentBudgets(state, category)
  return category
}

export function updateBudgetCategory(state: ErpState, id: string, patch: Pick<BudgetCategory, 'name' | 'responsibleRole' | 'status'>, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'altera categorias')
  const category = categoryOf(state, id)
  if (!patch.responsibleRole && patch.status !== 'Inativa') throw new DomainError('Categoria sem responsável não pode ser ativada ou usada')
  if (!reason.trim()) throw new DomainError('Informe a justificativa')
  if (patch.status !== 'Inativa' && category.parentId && categoryOf(state, category.parentId).status === 'Inativa') throw new DomainError('Ative primeiro a categoria pai')
  for (const field of ['name', 'responsibleRole', 'status'] as const) {
    if (category[field] !== patch[field]) category.audit.unshift(audit(state, actor, field === 'responsibleRole' ? 'Responsável' : field === 'status' ? 'Situação' : 'Nome', String(category[field]), String(patch[field]), reason))
  }
  Object.assign(category, patch)
  if (patch.status === 'Inativa') {
    for (const child of childrenOf(state, id).filter(entry => entry.status !== 'Inativa')) {
      child.audit.unshift(audit(state, actor, 'Situação', child.status, 'Inativa', `Categoria pai ${category.code} inativada`))
      child.status = 'Inativa'
      publishCategory(state, child)
    }
  }
  log(state, 'Orçamentos', actor, `Categoria ${category.code} revisada: ${reason}`, undefined, category.id)
  publishCategory(state, category)
  return category
}

/** Envia a categoria ao Omie na hora. O identificador externo é o código. */
function publishCategory(state: ErpState, category: BudgetCategory) {
  category.omieId = category.omieId ?? `OMIE-${category.code}`
  addSyncLog(state, {
    entity: 'Categoria', reference: category.code, direction: 'Thalamus → Omie', status: 'sincronizado',
    message: `${category.code} · ${category.name} enviada ao Omie (${category.omieId})${category.status === 'Inativa' ? ' · conta_inativa' : ''}`,
  })
}

/**
 * Aplica o que o Omie mandou. Categoria nova entra com o código de lá;
 * categoria já conciliada atualiza nome e situação. A mesma chave não duplica.
 */
export function applyRemoteCategories(state: ErpState, incoming: OmieCategory[]) {
  let created = 0
  let updated = 0
  for (const item of incoming) {
    const parent = item.parentCode ? state.budgetCategories.find(entry => entry.code === item.parentCode) : undefined
    if (item.parentCode && !parent) {
      addSyncLog(state, { entity: 'Categoria', reference: item.code, direction: 'Omie → Thalamus', status: 'erro', message: `${item.code} recusada: categoria pai ${item.parentCode} não existe aqui` })
      continue
    }
    const group = parent?.group ?? item.group
    if (!BUDGET_GROUPS.some(entry => entry.name === group)) {
      addSyncLog(state, { entity: 'Categoria', reference: item.code, direction: 'Omie → Thalamus', status: 'erro', message: `${item.code} recusada: grupo ${item.group} não está na árvore` })
      continue
    }
    const status = item.inactive ? 'Inativa' : 'Ativa'
    const existing = state.budgetCategories.find(entry => entry.omieId === item.omieId || entry.code === item.code)
    if (!existing) {
      const category: BudgetCategory = {
        id: nextId(state, 'BC'), code: item.code, name: item.name, group, parentId: parent?.id,
        responsibleRole: parent?.responsibleRole ?? 'Financeiro', status, omieId: item.omieId,
        audit: [audit(state, 'Omie', 'Criação', '', item.name, 'Recebida do Omie')],
      }
      state.budgetCategories.push(category)
      addSyncLog(state, { entity: 'Categoria', reference: item.code, direction: 'Omie → Thalamus', status: 'sincronizado', message: `${item.code} · ${item.name} recebida do Omie` })
      if (parent && childrenOf(state, parent.id).length === 1) inheritParentBudgets(state, category)
      created += 1
      continue
    }
    existing.omieId = existing.omieId ?? item.omieId
    const changes: string[] = []
    if (existing.name !== item.name) {
      existing.audit.unshift(audit(state, 'Omie', 'Nome', existing.name, item.name, 'Sincronizado do Omie'))
      existing.name = item.name
      changes.push('nome')
    }
    if (existing.status !== status) {
      existing.audit.unshift(audit(state, 'Omie', 'Situação', existing.status, status, 'Sincronizado do Omie'))
      existing.status = status
      changes.push('situação')
    }
    if (changes.length) {
      addSyncLog(state, { entity: 'Categoria', reference: item.code, direction: 'Omie → Thalamus', status: 'sincronizado', message: `${item.code} atualizada pelo Omie: ${changes.join(' e ')}` })
      updated += 1
    }
  }
  return { created, updated }
}

/** Garante o vínculo das categorias locais e consome a fila que o Omie ainda não entregou. */
export function absorbOmieCategories(state: ErpState) {
  for (const category of state.budgetCategories) {
    if (!category.omieId) category.omieId = `OMIE-${category.code}`
  }
  return applyRemoteCategories(state, state.omieCategoryInbox.splice(0))
}

function splitShares(amount: number, parts: number) {
  const cents = Math.round(round2(amount) * 100)
  const base = Math.floor(cents / parts)
  const extra = cents - base * parts
  return Array.from({ length: parts }, (_, index) => (base + (index === parts - 1 ? extra : 0)) / 100)
}

/** A primeira subcategoria recebe os anos que já estavam na categoria, para a soma não mudar. */
function inheritParentBudgets(state: ErpState, child: BudgetCategory) {
  if (!child.parentId) return
  const periods = state.budgets.filter(entry => entry.categoryId === child.parentId).map(entry => entry.period)
  for (const period of periods) {
    const parent = allocationOf(state, child.parentId, period)
    if (!parent) continue
    writeAllocation(state, child.id, period, parent.amount, 'Valor herdado da categoria ao abrir a primeira subcategoria', 'Sistema', true)
    syncParentAmount(state, child.parentId, period)
  }
}

/** Guarda na categoria pai a soma das subcategorias, para o limiar continuar valendo no macro. */
function syncParentAmount(state: ErpState, parentId: string, period: string) {
  const children = childrenOf(state, parentId)
  if (!children.length) return allocationOf(state, parentId, period)
  const sum = round2(children.reduce((total, child) => total + (allocationOf(state, child.id, period)?.amount ?? 0), 0))
  const existing = allocationOf(state, parentId, period)
  if (!existing) {
    if (sum <= 0) return undefined
    const budget: Budget = {
      id: nextId(state, 'ORC'), categoryId: parentId, period, amount: sum, alertThreshold: DEFAULT_ALERT_THRESHOLD,
      blockOnOverrun: true, audit: [audit(state, 'Sistema', 'Soma das subcategorias', '', String(sum), 'Soma das subcategorias')],
    }
    state.budgets.unshift(budget)
    evaluateAlerts(state, parentId, period)
    return budget
  }
  if (existing.amount !== sum) {
    existing.audit.unshift(audit(state, 'Sistema', 'Soma das subcategorias', String(existing.amount), String(sum), 'Soma das subcategorias'))
    existing.amount = sum
    evaluateAlerts(state, parentId, period)
  }
  return existing
}

function writeAllocation(state: ErpState, categoryId: string, period: string, amount: number, reason: string, actor: string, silentEqual = false) {
  const category = categoryOf(state, categoryId)
  const rounded = round2(amount)
  const existing = allocationOf(state, categoryId, period)
  if (existing) {
    if (existing.amount === rounded) {
      if (silentEqual) return existing
      throw new DomainError('O valor informado é igual ao atual')
    }
    const before = existing.amount
    existing.amount = rounded
    existing.audit.unshift(audit(state, actor, 'Valor informado', String(before), String(rounded), reason))
    log(state, 'Orçamentos', actor, `${category.name} ${period}: ${money(before)} → ${money(rounded)} (${reason})`, undefined, existing.id)
    evaluateAlerts(state, categoryId, period)
    return existing
  }
  if (rounded <= 0) throw new DomainError('Informe um valor maior que zero para abrir o ano')
  const budget: Budget = {
    id: nextId(state, 'ORC'), categoryId, period, amount: rounded, alertThreshold: DEFAULT_ALERT_THRESHOLD,
    blockOnOverrun: true, audit: [audit(state, actor, 'Criação', '', String(rounded), reason)],
  }
  state.budgets.unshift(budget)
  log(state, 'Orçamentos', actor, `${category.name} ${period} criado com ${money(rounded)}`, undefined, budget.id)
  evaluateAlerts(state, categoryId, period)
  return budget
}

function divideAmount(state: ErpState, categories: BudgetCategory[], period: string, amount: number, reason: string, actor: string) {
  if (!categories.length) throw new DomainError('Não há categoria ativa para receber o valor')
  const shares = splitShares(amount, categories.length)
  const same = categories.every((category, index) => allocationOf(state, category.id, period)?.amount === shares[index])
  if (same) throw new DomainError('O valor informado é igual ao atual')
  categories.forEach((category, index) => writeAllocation(state, category.id, period, shares[index], reason, actor, true))
  const parents = [...new Set(categories.map(category => category.parentId).filter((id): id is string => Boolean(id)))]
  for (const parentId of parents) syncParentAmount(state, parentId, period)
  return shares
}

export function setBudget(state: ErpState, categoryId: string, period: string, amount: number, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'informa orçamento')
  const category = categoryOf(state, categoryId)
  if (category.status === 'Inativa' || !category.responsibleRole) throw new DomainError('Categoria inativa ou sem responsável')
  if (!/^\d{4}$/.test(period)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  if (!(amount >= 0)) throw new DomainError('O orçamento não pode ser negativo')
  const note = reason.trim() || 'Ajuste direto'
  const children = activeChildren(state, categoryId)
  if (children.length) {
    divideAmount(state, children, period, amount, `${note} · divisão entre as subcategorias`, actor)
    const parent = syncParentAmount(state, categoryId, period)
    if (!parent) throw new DomainError('Informe um valor maior que zero para abrir o ano')
    return parent
  }
  const saved = writeAllocation(state, categoryId, period, amount, note, actor)
  if (category.parentId) syncParentAmount(state, category.parentId, period)
  return saved
}

/** Informa o total do grupo e divide em partes iguais entre as categorias que recebem valor. */
export function setGroupBudget(state: ErpState, group: string, period: string, amount: number, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'informa orçamento')
  if (!BUDGET_GROUPS.some(entry => entry.name === group)) throw new DomainError('Escolha um grupo confirmado')
  if (!/^\d{4}$/.test(period)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  if (!(amount > 0)) throw new DomainError('Informe um valor maior que zero para abrir o ano')
  if (!reason.trim()) throw new DomainError('Escolha o motivo')
  divideAmount(state, leavesInGroup(state, group), period, amount, `${reason} · divisão de ${group}`, actor)
  return leavesInGroup(state, group)
}

export function configureBudget(state: ErpState, id: string, alertThreshold: number, blockOnOverrun: boolean, actor: string, role: Role) {
  assertPlanner(role, 'configura limiar e bloqueio')
  const budget = state.budgets.find(entry => entry.id === id)
  if (!budget) throw new DomainError('Orçamento não encontrado')
  if (alertThreshold < 1 || alertThreshold > 100) throw new DomainError('O limiar precisa estar entre 1% e 100%')
  budget.audit.unshift(audit(state, actor, 'Regra', `${budget.alertThreshold}% / ${budget.blockOnOverrun ? 'bloqueia' : 'alerta'}`, `${alertThreshold}% / ${blockOnOverrun ? 'bloqueia' : 'alerta'}`, 'Parametrização'))
  budget.alertThreshold = alertThreshold
  budget.blockOnOverrun = blockOnOverrun
  evaluateAlerts(state, budget.categoryId, budget.period)
  return budget
}

/* ---------- Alertas ---------- */

function notified(state: ErpState, categoryId: string) {
  return [...new Set<Role>([categoryOf(state, categoryId).responsibleRole, 'Financeiro'])]
}

/** Registra a ocorrência quando o uso cruza o limiar e encerra quando volta abaixo dele. */
export function evaluateAlerts(state: ErpState, categoryId: string, period: string) {
  const control = controlCategoryId(state, categoryId)
  const summary = budgetSummary(state, control, period)
  if (!summary.budget) return
  const open = state.budgetAlerts.filter(entry => entry.kind === 'Alerta' && entry.categoryId === control && entry.period === period && entry.status !== 'Encerrado')
  for (const entry of open.filter(item => item.threshold !== summary.budget!.alertThreshold)) entry.status = 'Encerrado'
  if (summary.use >= summary.budget.alertThreshold) {
    if (open.some(entry => entry.threshold === summary.budget!.alertThreshold)) return
    const category = categoryOf(state, control)
    state.budgetAlerts.unshift({
      id: nextId(state, 'BAL'), categoryId: control, period, kind: 'Alerta', threshold: summary.budget.alertThreshold, use: summary.use,
      message: `${category.name} ${period} atingiu ${summary.use}% (limiar ${summary.budget.alertThreshold}%)`,
      notifiedRoles: notified(state, control), status: 'Aberto', at: now(),
    })
  } else {
    for (const entry of open) entry.status = 'Encerrado'
  }
}

export function acknowledgeAlert(state: ErpState, id: string, actor: string, role: Role) {
  const alert = state.budgetAlerts.find(entry => entry.id === id)
  if (!alert || alert.status !== 'Aberto') throw new DomainError('Alerta aberto não encontrado')
  if (!hasFullAccess(role) && !alert.notifiedRoles.includes(role)) throw new DomainError('Este alerta foi enviado a outro responsável')
  alert.status = 'Ciente'
  alert.acknowledgedBy = actor
  alert.acknowledgedAt = now()
  return alert
}

/* ---------- Previsão ---------- */

export interface ForecastInput {
  categoryId: string
  period: string
  amount: number
  sourceModule: BudgetEntry['sourceModule']
  sourceType: string
  sourceId: string
  description: string
  projectId?: string
  costCenter?: string
}

function event(state: ErpState, actor: string, type: BudgetEntry['events'][number]['type'], amount: number, note: string) {
  return { id: nextId(state, 'BE'), at: now(), actor, type, amount, note }
}

function applyAmount(entry: BudgetEntry, amount: number) {
  const consumed = entry.status === 'Retido' ? 0 : entry.amount - entry.openAmount
  entry.amount = round2(amount)
  entry.openAmount = round2(Math.max(0, amount - consumed))
  entry.status = entry.openAmount ? (entry.openAmount < entry.amount ? 'Parcial' : 'Ativo') : 'Liquidado'
}

/** Previsões acima do saldo ficam retidas (sem entrar no saldo) até o Gestor liberar. */
export function upsertForecast(state: ErpState, input: ForecastInput, actor: string) {
  const category = categoryOf(state, input.categoryId)
  if (category.status === 'Inativa' || !category.responsibleRole) throw new DomainError('A categoria não está disponível para novos fluxos')
  if (category.parentId && categoryOf(state, category.parentId).status === 'Inativa') throw new DomainError('A categoria pai está inativa')
  if (!(input.amount >= 0)) throw new DomainError('Valor estipulado inválido')
  const control = controlCategoryId(state, input.categoryId)
  let current = state.budgetEntries.find(entry => entry.kind === 'Previsão' && entry.sourceModule === input.sourceModule && entry.sourceId === input.sourceId)
  const summary = budgetSummary(state, control, input.period.slice(0, 4))
  const previousOpen = current && current.categoryId === input.categoryId && current.period === input.period ? current.openAmount : 0
  const projected = summary.balance + previousOpen - input.amount
  const authorized = state.budgetExceptions.some(entry => entry.kind === 'Saldo excedido' && entry.sourceId === input.sourceId && entry.status === 'Autorizada' && entry.amount >= input.amount)
  const overrun = Boolean(summary.budget?.blockOnOverrun) && projected < 0 && !authorized

  if (!current) {
    current = {
      id: nextId(state, 'BL'), kind: 'Previsão', categoryId: input.categoryId, period: input.period,
      amount: round2(input.amount), openAmount: overrun ? 0 : round2(input.amount), status: overrun ? 'Retido' : input.amount ? 'Ativo' : 'Liquidado',
      sourceModule: input.sourceModule, sourceType: input.sourceType, sourceId: input.sourceId,
      projectId: input.projectId, costCenter: input.costCenter, description: input.description, createdAt: now(),
      heldAmount: overrun ? round2(input.amount) : undefined,
      events: [event(state, actor, 'Criação', round2(input.amount), overrun ? 'Retida: sem saldo' : 'Previsão operacional criada')],
    }
    state.budgetEntries.unshift(current)
  } else {
    current.description = input.description
    current.projectId = input.projectId
    current.costCenter = input.costCenter
    if (!overrun) {
      current.categoryId = input.categoryId
      current.period = input.period
    }
    if (overrun) {
      current.heldAmount = round2(input.amount)
      current.events.unshift(event(state, actor, 'Alteração', round2(input.amount), `Retida: ${money(input.amount)} acima do saldo`))
    } else {
      const before = current.amount
      applyAmount(current, input.amount)
      current.heldAmount = undefined
      current.events.unshift(event(state, actor, 'Alteração', current.amount, `${money(before)} → ${money(current.amount)}`))
    }
  }

  if (overrun) {
    const pending = state.budgetExceptions.find(entry => entry.kind === 'Saldo excedido' && entry.sourceId === input.sourceId && entry.status === 'Pendente')
    const description = `${input.description}: excede o saldo de ${categoryOf(state, control).name} em ${money(Math.abs(projected))}`
    if (pending) Object.assign(pending, { amount: round2(input.amount), description })
    else state.budgetExceptions.unshift({
      id: nextId(state, 'BX'), kind: 'Saldo excedido', status: 'Pendente', sourceModule: input.sourceModule,
      sourceId: input.sourceId, description, amount: round2(input.amount), categoryIds: [input.categoryId], period: input.period, createdAt: now(),
    })
    state.budgetAlerts.unshift({
      id: nextId(state, 'BAL'), categoryId: control, period: input.period, kind: 'Bloqueio', threshold: DEFAULT_BLOCK_THRESHOLD, use: summary.use,
      message: `${input.sourceId} retido: ${description}`, notifiedRoles: [...new Set<Role>([...notified(state, control), 'Gestor'])], status: 'Aberto', at: now(), sourceId: input.sourceId,
    })
    log(state, 'Orçamentos', actor, `${input.sourceId} retido aguardando liberação do Gestor`, undefined, input.sourceId)
  }
  evaluateAlerts(state, input.categoryId, input.period)
  return current
}

export function isHeld(state: ErpState, sourceIds: string[]) {
  return state.budgetEntries.some(entry => entry.kind === 'Previsão' && sourceIds.includes(entry.sourceId) && entry.heldAmount !== undefined)
}

export function cancelForecast(state: ErpState, sourceModule: string, sourceId: string, reason: string, actor: string) {
  const entry = state.budgetEntries.find(item => item.kind === 'Previsão' && item.sourceModule === sourceModule && item.sourceId === sourceId)
  if (!entry || entry.status === 'Cancelado') return entry
  entry.openAmount = 0
  entry.heldAmount = undefined
  entry.status = 'Cancelado'
  entry.events.unshift(event(state, actor, 'Cancelamento', 0, reason))
  for (const exception of state.budgetExceptions.filter(item => item.kind === 'Saldo excedido' && item.sourceId === sourceId && item.status === 'Pendente')) {
    exception.status = 'Resolvida'
    exception.decisionNote = `Origem cancelada: ${reason}`
    exception.decidedAt = now()
    exception.decidedBy = actor
  }
  evaluateAlerts(state, entry.categoryId, entry.period)
  return entry
}

/* ---------- Pagamentos do Omie ---------- */

function retainPayment(state: ErpState, payment: OmiePayment, kind: BudgetException['kind'], description: string) {
  if (!state.budgetExceptions.some(entry => entry.sourceId === payment.id && entry.kind === kind)) state.budgetExceptions.unshift({
    id: nextId(state, 'BX'), kind, status: 'Pendente', sourceModule: 'Omie', sourceId: payment.id,
    description, amount: payment.amount, categoryIds: [...payment.categoryIds], period: monthOf(payment.paidAt), createdAt: now(),
  })
}

export function applyOmiePayment(state: ErpState, payment: OmiePayment, actor = 'Integração Omie') {
  const prior = state.budgetEntries.find(entry => entry.kind === 'Realizado pago' && entry.externalId === payment.id)
  if (prior) return prior
  if (payment.error) {
    retainPayment(state, payment, 'Erro de sincronização', payment.error)
    return undefined
  }
  if (!payment.categoryIds.length) {
    retainPayment(state, payment, 'Sem categoria', `Pagamento ${payment.id} sem categoria`)
    return undefined
  }
  if (payment.categoryIds.length > 1) {
    retainPayment(state, payment, 'Múltiplas categorias', `Pagamento ${payment.id} tem ${payment.categoryIds.length} categorias`)
    return undefined
  }
  const categoryId = payment.categoryIds[0]
  categoryOf(state, categoryId)
  const control = controlCategoryId(state, categoryId)
  const purchase = state.purchaseOrders.find(entry => entry.id === payment.sourceId)
  const forecast = state.budgetEntries.find(entry => entry.kind === 'Previsão' && controlCategoryId(state, entry.categoryId) === control
    && (entry.sourceId === payment.sourceId || purchase?.demandIds.includes(entry.sourceId)))
  const signed = payment.event === 'Estorno' ? -Math.abs(payment.amount) : Math.abs(payment.amount)
  const invoiceNumber = payment.invoiceNumber ?? (payment.sourceId.startsWith('NF-') ? payment.sourceId.slice(3) : undefined)
  const entry: BudgetEntry = {
    id: nextId(state, 'BL'), kind: 'Realizado pago', categoryId, period: monthOf(payment.paidAt), amount: signed, openAmount: 0,
    status: payment.event === 'Estorno' ? 'Estornado' : 'Liquidado', sourceModule: 'Omie', sourceType: payment.event,
    sourceId: payment.sourceId, externalId: payment.id, invoiceNumber, linkModule: payment.link?.module, linkId: payment.link?.id,
    projectId: forecast?.projectId, costCenter: forecast?.costCenter,
    description: payment.description ?? `${payment.event} da nota ${invoiceNumber ?? payment.id}`, createdAt: now(),
    events: [event(state, actor, payment.event, signed, `Nota ${invoiceNumber ?? payment.id}`)],
  }
  state.budgetEntries.unshift(entry)
  if (!payment.link) retainPayment(state, payment, 'Sem vínculo', `NF ${invoiceNumber ?? payment.id} entrou no custo sem documento do Thalamus`)
  if (forecast && forecast.status !== 'Retido' && forecast.status !== 'Cancelado') {
    forecast.openAmount = round2(Math.max(0, forecast.openAmount - signed))
    if (payment.event === 'Estorno') forecast.openAmount = round2(Math.min(forecast.amount, forecast.openAmount))
    forecast.status = forecast.openAmount <= 0 ? 'Liquidado' : forecast.openAmount < forecast.amount ? 'Parcial' : 'Ativo'
    forecast.events.unshift(event(state, actor, payment.event, signed, `Conciliado com ${payment.id}`))
  }
  const title = payment.titleId ? state.financialTitles.find(item => item.id === payment.titleId) : state.financialTitles.find(item => item.reference === payment.sourceId)
  if (title) {
    const paid = state.budgetEntries.filter(item => item.kind === 'Realizado pago' && item.sourceId === payment.sourceId && item.status !== 'Cancelado').reduce((sum, item) => sum + item.amount, 0)
    if (paid >= title.amount) {
      title.status = 'Baixado'
      title.paidAt = payment.paidAt
    } else {
      title.status = 'Aberto'
      title.paidAt = undefined
    }
  }
  log(state, 'Orçamentos', actor, `${payment.event} ${payment.id}: ${money(signed)}`, undefined, payment.sourceId)
  evaluateAlerts(state, categoryId, entry.period)
  return entry
}

/* ---------- Exceções ---------- */

export const canDecide = (exception: BudgetException, role: Role) =>
  exception.kind === 'Saldo excedido' ? APPROVER_ROLES.includes(role) : PLANNER_ROLES.includes(role)

/**
 * Saldo excedido: o Gestor libera ou recusa a previsão retida.
 * Pagamento retido: o Financeiro reclassifica numa categoria e o realizado é lançado, ou rejeita.
 */
export function decideBudgetException(state: ErpState, id: string, approve: boolean, note: string, actor: string, role: Role, categoryId?: string) {
  const entry = state.budgetExceptions.find(item => item.id === id)
  if (!entry || entry.status !== 'Pendente') throw new DomainError('Exceção pendente não encontrada')
  if (!canDecide(entry, role)) throw new DomainError(entry.kind === 'Saldo excedido'
    ? 'Somente o Gestor ou o Administrador libera lançamento acima do saldo. Quem define o orçamento não autoriza a exceção.'
    : 'Somente o Financeiro ou o Administrador trata pagamentos retidos')
  if (!note.trim()) throw new DomainError('Informe a justificativa')

  if (entry.kind === 'Saldo excedido') {
    const forecast = state.budgetEntries.find(item => item.kind === 'Previsão' && item.sourceId === entry.sourceId && item.heldAmount !== undefined)
    if (forecast) {
      if (approve) {
        applyAmount(forecast, forecast.heldAmount!)
        forecast.events.unshift(event(state, actor, 'Alteração', forecast.amount, `Liberada acima do saldo: ${note}`))
      } else {
        if (forecast.status === 'Retido') { forecast.status = 'Cancelado'; forecast.openAmount = 0 }
        forecast.events.unshift(event(state, actor, 'Cancelamento', forecast.heldAmount!, `Liberação recusada: ${note}`))
      }
      forecast.heldAmount = undefined
      evaluateAlerts(state, forecast.categoryId, forecast.period)
    }
    entry.status = approve ? 'Autorizada' : 'Rejeitada'
  } else if (approve) {
    if (!categoryId) throw new DomainError('Escolha a categoria correta do pagamento')
    const category = categoryOf(state, categoryId)
    if (category.status === 'Inativa') throw new DomainError('A categoria escolhida está inativa')
    const original = state.omiePayments.find(item => item.id === entry.sourceId)
    if (!original) throw new DomainError('Pagamento do Omie não encontrado para reprocessar')
    const posted = applyOmiePayment(state, { ...original, categoryIds: [categoryId], error: undefined }, actor)
    if (!posted) throw new DomainError('O pagamento continua sem conciliação')
    entry.categoryIds = [categoryId]
    entry.status = 'Resolvida'
  } else {
    entry.status = 'Rejeitada'
  }
  entry.decidedAt = now()
  entry.decidedBy = actor
  entry.decisionNote = note
  for (const alert of state.budgetAlerts.filter(item => item.kind === 'Bloqueio' && item.sourceId === entry.sourceId && item.status === 'Aberto')) alert.status = 'Encerrado'
  log(state, 'Orçamentos', actor, `${entry.id} ${approve ? (entry.kind === 'Saldo excedido' ? 'liberada' : 'reclassificada') : 'rejeitada'}: ${note}`, undefined, entry.sourceId)
  return entry
}

const LINK_LISTS: Record<InvoiceLinkModule, (state: ErpState) => { id: string }[]> = {
  Compras: state => state.purchaseOrders,
  Projetos: state => state.projects,
  Manutenção: state => state.maintenanceOrders,
  Demandas: state => state.demands,
  Assistência: state => state.technicalServiceOrders,
  Produção: state => state.productionOrders,
}

/** Origem da nota para a ficha. Sem linkId, a nota já custou e ainda espera o documento. */
export function invoiceOrigin(entry: Pick<BudgetEntry, 'kind' | 'invoiceNumber' | 'linkModule' | 'linkId' | 'linkMode'>) {
  if (entry.kind !== 'Realizado pago') return ''
  const note = entry.invoiceNumber ? `NF ${entry.invoiceNumber}` : 'Nota do Omie'
  if (entry.linkModule && entry.linkId) return `${note} · ${entry.linkModule} ${entry.linkId}${entry.linkMode === 'manual' ? ' · vínculo manual' : ''}`
  return `${note} · sem vínculo`
}

export function linkableDocuments(state: ErpState) {
  const named = (module: InvoiceLinkModule, id: string, label: string) => ({ module, id, label })
  return [
    ...state.purchaseOrders.map(entry => named('Compras', entry.id, `Compra ${entry.id}`)),
    ...state.projects.map(entry => named('Projetos', entry.id, `Projeto ${entry.id} · ${entry.name}`)),
    ...state.maintenanceOrders.map(entry => named('Manutenção', entry.id, `OS ${entry.id} · ${entry.description}`)),
    ...state.demands.map(entry => named('Demandas', entry.id, `Demanda ${entry.id} · ${entry.description}`)),
    ...state.technicalServiceOrders.map(entry => named('Assistência', entry.id, `Chamado ${entry.id}`)),
    ...state.productionOrders.map(entry => named('Produção', entry.id, `OP ${entry.id}`)),
  ]
}

/** Liga uma nota que já está no custo a um documento do Thalamus. Não muda o valor. */
export function linkBudgetInvoice(state: ErpState, exceptionId: string, module: InvoiceLinkModule, documentId: string, actor: string, role: Role) {
  assertPlanner(role, 'vincula a nota ao documento')
  const exception = state.budgetExceptions.find(entry => entry.id === exceptionId)
  if (!exception || exception.status !== 'Pendente' || exception.kind !== 'Sem vínculo') throw new DomainError('Nota sem vínculo não encontrada')
  if (!documentId) throw new DomainError('Escolha o documento do Thalamus')
  if (!LINK_LISTS[module](state).some(entry => entry.id === documentId)) throw new DomainError('Documento não encontrado')
  const posted = state.budgetEntries.find(entry => entry.kind === 'Realizado pago' && entry.externalId === exception.sourceId)
  if (!posted) throw new DomainError('A nota ainda não entrou no custo')
  posted.linkModule = module
  posted.linkId = documentId
  posted.linkMode = 'manual'
  posted.events.unshift(event(state, actor, 'Conciliação', posted.amount, `Vínculo manual com ${module} ${documentId}`))
  const payment = state.omiePayments.find(entry => entry.id === exception.sourceId)
  if (payment) payment.link = { module, id: documentId }
  exception.status = 'Resolvida'
  exception.decidedAt = now()
  exception.decidedBy = actor
  exception.decisionNote = `${module} ${documentId}`
  log(state, 'Orçamentos', actor, `NF ${posted.invoiceNumber ?? posted.id} vinculada a ${module} ${documentId}`, undefined, documentId)
  return posted
}
