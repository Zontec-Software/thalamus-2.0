import { hasFullAccess } from './access'
import type { ErpState } from './engine'
import { addSyncLog, DomainError, log, nextId, now, today } from './engine'
import type {
  Budget, BudgetCategory, BudgetCategoryNature, BudgetEntry, BudgetException, InvoiceLinkModule, OmieCategory, OmiePayment, Role,
} from '../types/domain'

export const DEFAULT_ALERT_THRESHOLD = 80
export const DEFAULT_BLOCK_THRESHOLD = 100

/**
 * Grupos confirmados na especificação: 02 a 05. 06 a 10 seguem pendentes de transcrição.
 * 01 (Receita) e 09 (CAPEX) são ampliação feita no mockup, inspirada numa referência externa,
 * fora do documento formal ainda — precisam ser levadas ao documento de Orçamentos para registro.
 */
export const BUDGET_GROUPS = [
  { code: '01', name: '01. Receita Operacional Bruta' },
  { code: '02', name: '02. Deduções da Receita' },
  { code: '03', name: '03. Custos' },
  { code: '04', name: '04. Despesas Variáveis' },
  { code: '05', name: '05. Despesas Fixas' },
  { code: '09', name: '09. Investimentos (CAPEX)' },
] as const

export const RECEITA_GROUP = '01. Receita Operacional Bruta'
export const CAPEX_GROUP = '09. Investimentos (CAPEX)'
export const natureOf = (category: Pick<BudgetCategory, 'nature'>): BudgetCategoryNature => category.nature ?? 'Despesa'

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

/** Categorias da empresa ativa. Uma empresa nunca lê a árvore orçamentária de outra. */
export function categoriesOfTenant(state: ErpState, tenantId: string) {
  return state.budgetCategories.filter(entry => entry.tenantId === tenantId)
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

/** A fatia do período usa a distribuição mensal planejada; sem ela, cada mês vale 1/12 igual. */
function sliceAmount(budget: Pick<Budget, 'amount' | 'monthlyAmounts'> | undefined, months: number[]) {
  const annual = budget?.amount ?? 0
  if (!annual || !months.length) return 0
  const shares = budget?.monthlyAmounts?.length === 12 ? budget.monthlyAmounts : splitShares(annual, 12)
  return round2(months.reduce((sum, month) => sum + shares[month - 1], 0))
}

function entryInWindow(period: string, months: number[], year: string) {
  const match = period.match(/^(\d{4})-(\d{2})$/)
  if (!match) return period === year && months.length === 12
  return match[1] === year && months.includes(Number(match[2]))
}

function totals(entries: BudgetEntry[]) {
  const forecast = round2(entries.filter(entry => entry.kind === 'Previsão' && ['Ativo', 'Parcial'].includes(entry.status)).reduce((sum, entry) => sum + entry.openAmount, 0))
  const realized = round2(entries.filter(entry => (entry.kind === 'Realizado pago' || entry.kind === 'Realizado recebido') && entry.status !== 'Cancelado').reduce((sum, entry) => sum + entry.amount, 0))
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

/** A depreciação orçada sai dos ativos. A categoria só classifica o lançamento. */
export function isDepreciationCategory(category: { name: string }) {
  return /deprecia/i.test(category.name)
}

/** Custo, despesa e investimento, e qualquer categoria mãe nova. Receita e dedução não recebem utilizador. */
export function isCenterCategory(category: { group: string }) {
  const code = category.group.slice(0, 2)
  return code !== '01' && code !== '02'
}

/** Conta que recebe teto e pode ser repartida entre centros. A depreciação fica de fora. */
export function isSpendCategory(category: { group: string; name: string }) {
  return isCenterCategory(category) && !isDepreciationCategory(category)
}

/** Nunca soma categorias de outra empresa: o grupo é sempre dentro de um tenant. */
export function leavesInGroup(state: ErpState, tenantId: string, group: string) {
  return state.budgetCategories.filter(entry => entry.tenantId === tenantId && entry.group === group && entry.status !== 'Inativa' && isBudgetLeaf(state, entry.id))
}

function assertCategoryTenant(category: BudgetCategory, tenantId: string) {
  if (category.tenantId !== tenantId) throw new DomainError('A categoria não pertence à empresa ativa')
}

export function budgetSummary(state: ErpState, categoryId: string, period: string) {
  const window = budgetWindow(period)
  const budget = allocationOf(state, categoryId, window.year)
  const children = childrenOf(state, categoryId)
  const ids = new Set([categoryId, ...children.map(entry => entry.id)])
  const entries = state.budgetEntries.filter(entry => ids.has(entry.categoryId) && entryInWindow(entry.period, window.months, window.year))
  const { forecast, realized, held } = totals(entries)
  const amount = children.length
    ? round2(children.reduce((sum, child) => sum + sliceAmount(allocationOf(state, child.id, window.year), window.months), 0))
    : sliceAmount(budget, window.months)
  const balance = round2(amount - forecast - realized)
  const nature = natureOf(categoryOf(state, categoryId))
  // Receita não tem "saldo que falta cumprir": o que falta é o que ainda não vendeu da meta.
  const toTarget = nature === 'Receita' ? round2(amount - realized) : balance
  return {
    budget, entries, amount, forecast, realized, held, balance, nature, toTarget,
    deviation: round2(forecast + realized - amount), use: amount ? round2((forecast + realized) / amount * 100) : 0, window,
  }
}

export function monthRange(fromMonth: number, toMonth: number) {
  if (!(fromMonth >= 1 && toMonth <= 12 && fromMonth <= toMonth)) throw new DomainError('O período precisa ir de um mês até outro mês do mesmo ano')
  return Array.from({ length: toMonth - fromMonth + 1 }, (_, index) => fromMonth + index)
}

/** Orçado, previsão e realizado de uma categoria entre dois meses do mesmo ano. */
export function rangeSummary(state: ErpState, categoryId: string, year: string, fromMonth: number, toMonth: number) {
  const months = monthRange(fromMonth, toMonth)
  const children = childrenOf(state, categoryId)
  const ids = new Set([categoryId, ...children.map(entry => entry.id)])
  const { forecast, realized } = totals(state.budgetEntries.filter(entry => ids.has(entry.categoryId) && entryInWindow(entry.period, months, year)))
  const amount = children.length
    ? round2(children.reduce((sum, child) => sum + sliceAmount(allocationOf(state, child.id, year), months), 0))
    : sliceAmount(allocationOf(state, categoryId, year), months)
  return { amount, forecast, realized }
}

export function inMonthRange(period: string, year: string, fromMonth: number, toMonth: number) {
  return entryInWindow(period, monthRange(fromMonth, toMonth), year)
}

/** Previsão e realizado de uma subcategoria, para detalhar a ficha da categoria. */
export function subcategorySummary(state: ErpState, id: string, period: string) {
  const window = budgetWindow(period)
  return totals(state.budgetEntries.filter(entry => entry.categoryId === id && entryInWindow(entry.period, window.months, window.year)))
}

function audit(state: ErpState, actor: string, field: string, from: string, to: string, reason: string) {
  return { id: nextId(state, 'BA'), at: now(), actor, field, from, to, reason }
}

/** Grupos fixos mais as categorias mãe criadas nesta empresa. */
export function groupsFor(state: ErpState, tenantId: string) {
  const custom = (state.budgetGroups ?? []).filter(entry => entry.tenantId === tenantId)
  return [...BUDGET_GROUPS.map(entry => ({ code: entry.code, name: entry.name })), ...custom.map(entry => ({ code: entry.code, name: entry.name }))]
}

export function nextCategoryCode(state: ErpState, tenantId: string, group: string, parentId?: string) {
  const parent = parentId ? categoryOf(state, parentId) : undefined
  const prefix = parent ? parent.code : groupsFor(state, tenantId).find(entry => entry.name === group)?.code
  if (!prefix) throw new DomainError('Escolha um grupo confirmado')
  const siblings = state.budgetCategories.filter(entry => entry.tenantId === tenantId && (parent ? entry.parentId === parent.id : !entry.parentId && entry.group === group))
  const last = siblings.reduce((max, entry) => Math.max(max, Number(entry.code.split('.').pop()) || 0), 0)
  return `${prefix}.${String(last + 1).padStart(2, '0')}`
}

function assertResponsible(state: ErpState, userId: string, place = 'da categoria') {
  const user = state.users.find(entry => entry.id === userId && entry.active !== false && !entry.platformMaster)
  if (!user) throw new DomainError(`Escolha um usuário ativo como responsável ${place}`)
  return user
}

function userLabel(state: ErpState, userId: string) {
  return state.users.find(entry => entry.id === userId)?.name ?? userId
}

export function createBudgetCategory(state: ErpState, tenantId: string, input: Pick<BudgetCategory, 'name' | 'group' | 'parentId'> & { nature?: BudgetCategoryNature; isCapex?: boolean }, actor: string, role: Role) {
  assertPlanner(role, 'configura categorias')
  if (!input.name.trim()) throw new DomainError('Informe o nome da categoria')
  const parent = input.parentId ? categoryOf(state, input.parentId) : undefined
  if (parent) assertCategoryTenant(parent, tenantId)
  if (parent?.parentId) throw new DomainError('Subcategoria não pode ter outra subcategoria abaixo')
  if (parent?.status === 'Inativa') throw new DomainError('A categoria pai está inativa')
  const group = parent?.group ?? input.group
  if (!groupsFor(state, tenantId).some(entry => entry.name === group)) throw new DomainError('Escolha um grupo confirmado')
  const siblings = state.budgetCategories.filter(entry => entry.tenantId === tenantId && (parent ? entry.parentId === parent.id : !entry.parentId && entry.group === group))
  if (siblings.some(entry => entry.name.toLowerCase() === input.name.trim().toLowerCase())) throw new DomainError('Já existe uma categoria com este nome neste nível')
  const category: BudgetCategory = {
    id: nextId(state, 'BC'), tenantId, code: nextCategoryCode(state, tenantId, group, parent?.id), name: input.name.trim(), group,
    parentId: parent?.id, status: 'Ativa', audit: [],
    nature: parent?.nature ?? input.nature ?? (group === RECEITA_GROUP ? 'Receita' : 'Despesa'),
    isCapex: parent?.isCapex ?? input.isCapex ?? group === CAPEX_GROUP,
  }
  category.audit.unshift(audit(state, actor, 'Criação', '', category.name, parent ? `Subcategoria de ${parent.code}` : 'Cadastro inicial'))
  state.budgetCategories.push(category)
  log(state, 'Orçamentos', actor, `${parent ? 'Subcategoria' : 'Categoria'} ${category.code} · ${category.name} criada`, undefined, category.id)
  publishCategory(state, category)
  if (parent && childrenOf(state, parent.id).length === 1) inheritParentBudgets(state, category)
  return category
}

export function updateBudgetCategory(state: ErpState, tenantId: string, id: string, patch: Pick<BudgetCategory, 'name' | 'status'>, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'altera categorias')
  const category = categoryOf(state, id)
  assertCategoryTenant(category, tenantId)
  if (!reason.trim()) throw new DomainError('Informe a justificativa')
  if (patch.status !== 'Inativa' && category.parentId && categoryOf(state, category.parentId).status === 'Inativa') throw new DomainError('Ative primeiro a categoria pai')
  for (const field of ['name', 'status'] as const) {
    if (category[field] !== patch[field]) {
      category.audit.unshift(audit(state, actor, field === 'status' ? 'Situação' : 'Nome', String(category[field]), String(patch[field]), reason))
    }
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

/** Categoria mãe nova, no formato 06. Nome, só desta empresa. */
export function createBudgetGroup(state: ErpState, tenantId: string, input: { code: string; name: string }, actor: string, role: Role) {
  assertPlanner(role, 'cria categoria mãe')
  const code = input.code.trim()
  const label = input.name.trim()
  if (!/^\d{2}$/.test(code)) throw new DomainError('O código da categoria mãe tem dois dígitos, como 06')
  if (!label) throw new DomainError('Informe o nome da categoria mãe')
  if (groupsFor(state, tenantId).some(entry => entry.code === code)) throw new DomainError('Já existe uma categoria mãe com este código')
  const name = label.startsWith(`${code}.`) ? label : `${code}. ${label}`
  const group = { id: nextId(state, 'BG'), tenantId, code, name }
  state.budgetGroups.push(group)
  log(state, 'Orçamentos', actor, `Categoria mãe ${name} criada`, undefined, group.id)
  return group
}

/** Responsável da conta e setor que recebe a demanda. */
export function setCategoryAssignment(state: ErpState, tenantId: string, id: string, patch: { responsibleUserId?: string; executorSectorId?: string }, actor: string, role: Role) {
  assertPlanner(role, 'define responsável e executor')
  const category = categoryOf(state, id)
  assertCategoryTenant(category, tenantId)
  if (patch.responsibleUserId) assertResponsible(state, patch.responsibleUserId, 'da categoria')
  if (patch.executorSectorId && !state.sectors.some(entry => entry.id === patch.executorSectorId)) throw new DomainError('Setor executor não encontrado')
  category.responsibleUserId = patch.responsibleUserId || undefined
  category.executorSectorId = patch.executorSectorId || undefined
  log(state, 'Orçamentos', actor, `${category.code}: responsável ${category.responsibleUserId ? userLabel(state, category.responsibleUserId) : 'sem pessoa'}`, undefined, category.id)
  return category
}

/**
 * Destina o valor da categoria a setores. Linha sem valor não entra.
 * A soma pode ficar abaixo do valor; o que falta não libera demanda. Não pode passar.
 */
export function setSectorAllocations(state: ErpState, tenantId: string, categoryId: string, year: string, lines: { sectorId: string; amount: number }[], actor: string, role: Role) {
  assertPlanner(role, 'destina o valor aos setores')
  const category = categoryOf(state, categoryId)
  assertCategoryTenant(category, tenantId)
  if (!isSpendCategory(category)) throw new DomainError('Só custo, despesa e investimento recebem utilizador')
  if (!isBudgetLeaf(state, categoryId)) throw new DomainError('O valor destinado é da categoria que recebe o valor')
  const budget = allocationOf(state, categoryId, year)
  if (!budget || !(budget.amount > 0)) throw new DomainError('Informe o valor da categoria antes de destinar aos setores')
  if (lines.some(line => !(Number(line.amount) > 0))) throw new DomainError('Informe o valor destinado antes de liberar o setor')
  const cleaned = lines.map(line => ({ sectorId: line.sectorId, amount: round2(Number(line.amount) || 0) }))
  const seen = new Set<string>()
  let sum = 0
  for (const line of cleaned) {
    if (seen.has(line.sectorId)) throw new DomainError('O mesmo setor não pode aparecer duas vezes')
    seen.add(line.sectorId)
    if (!state.sectors.some(entry => entry.id === line.sectorId)) throw new DomainError('Setor não encontrado')
    sum += line.amount
  }
  if (round2(sum) > budget.amount + 0.001) throw new DomainError('A soma destinada não pode passar do valor da categoria')
  budget.sectorAllocations = cleaned.length ? cleaned : undefined
  log(state, 'Orçamentos', actor, `${category.code}: ${cleaned.length ? cleaned.map(line => `${state.sectors.find(entry => entry.id === line.sectorId)?.name ?? line.sectorId} ${money(line.amount)}`).join(', ') : 'sem utilizador'}`, undefined, category.id)
  return budget
}

/**
 * Aplica o que o Omie mandou. Categoria nova entra com o código de lá;
 * categoria já conciliada atualiza nome e situação. A mesma chave não duplica.
 */
export function applyRemoteCategories(state: ErpState, tenantId: string, incoming: OmieCategory[]) {
  let created = 0
  let updated = 0
  for (const item of incoming) {
    const parent = item.parentCode ? state.budgetCategories.find(entry => entry.tenantId === tenantId && entry.code === item.parentCode) : undefined
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
    const existing = state.budgetCategories.find(entry => entry.tenantId === tenantId && (entry.omieId === item.omieId || entry.code === item.code))
    if (!existing) {
      const category: BudgetCategory = {
        id: nextId(state, 'BC'), tenantId, code: item.code, name: item.name, group, parentId: parent?.id,
        status, omieId: item.omieId,
        nature: parent?.nature ?? (group === RECEITA_GROUP ? 'Receita' : 'Despesa'),
        isCapex: parent?.isCapex ?? (group === CAPEX_GROUP),
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
export function absorbOmieCategories(state: ErpState, tenantId: string) {
  for (const category of state.budgetCategories.filter(entry => entry.tenantId === tenantId)) {
    if (!category.omieId) category.omieId = `OMIE-${category.code}`
  }
  return applyRemoteCategories(state, tenantId, state.omieCategoryInbox.splice(0))
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
    const saved = writeAllocation(state, child.id, period, parent.amount, 'Valor herdado da categoria ao abrir a primeira subcategoria', 'Sistema', true)
    if (parent.costCenterSplit && saved) {
      saved.costCenterSplit = parent.costCenterSplit
      delete parent.costCenterSplit
    }
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
      id: nextId(state, 'ORC'), tenantId: categoryOf(state, parentId).tenantId, categoryId: parentId, period, amount: sum, alertThreshold: DEFAULT_ALERT_THRESHOLD,
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
  if (isDepreciationCategory(category)) throw new DomainError('A depreciação orçada sai dos ativos. Esta conta classifica o lançamento e não recebe um segundo valor')
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
    id: nextId(state, 'ORC'), tenantId: category.tenantId, categoryId, period, amount: rounded, alertThreshold: DEFAULT_ALERT_THRESHOLD,
    blockOnOverrun: true, audit: [audit(state, actor, 'Criação', '', String(rounded), reason)],
  }
  state.budgets.unshift(budget)
  log(state, 'Orçamentos', actor, `${category.name} ${period} criado com ${money(rounded)}`, undefined, budget.id)
  evaluateAlerts(state, categoryId, period)
  return budget
}

function divideAmount(state: ErpState, categories: BudgetCategory[], period: string, amount: number, reason: string, actor: string) {
  const targets = categories.filter(category => !isDepreciationCategory(category))
  if (!targets.length) throw new DomainError('Não há categoria ativa para receber o valor')
  const shares = splitShares(amount, targets.length)
  const same = targets.every((category, index) => allocationOf(state, category.id, period)?.amount === shares[index])
  if (same) throw new DomainError('O valor informado é igual ao atual')
  targets.forEach((category, index) => writeAllocation(state, category.id, period, shares[index], reason, actor, true))
  const parents = [...new Set(targets.map(category => category.parentId).filter((id): id is string => Boolean(id)))]
  for (const parentId of parents) syncParentAmount(state, parentId, period)
  return shares
}

export function setBudget(state: ErpState, tenantId: string, categoryId: string, period: string, amount: number, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'informa orçamento')
  const category = categoryOf(state, categoryId)
  assertCategoryTenant(category, tenantId)
  if (category.status === 'Inativa') throw new DomainError('Categoria inativa')
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
export function setGroupBudget(state: ErpState, tenantId: string, group: string, period: string, amount: number, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'informa orçamento')
  if (!groupsFor(state, tenantId).some(entry => entry.name === group)) throw new DomainError('Escolha um grupo confirmado')
  if (!/^\d{4}$/.test(period)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  if (!(amount > 0)) throw new DomainError('Informe um valor maior que zero para abrir o ano')
  if (!reason.trim()) throw new DomainError('Escolha o motivo')
  divideAmount(state, leavesInGroup(state, tenantId, group), period, amount, `${reason} · divisão de ${group}`, actor)
  return leavesInGroup(state, tenantId, group)
}

export function configureBudget(state: ErpState, tenantId: string, id: string, alertThreshold: number, blockOnOverrun: boolean, actor: string, role: Role) {
  assertPlanner(role, 'configura limiar e bloqueio')
  const budget = state.budgets.find(entry => entry.id === id)
  if (!budget) throw new DomainError('Orçamento não encontrado')
  if (budget.tenantId !== tenantId) throw new DomainError('O orçamento não pertence à empresa ativa')
  if (alertThreshold < 1 || alertThreshold > 100) throw new DomainError('O limiar precisa estar entre 1% e 100%')
  budget.audit.unshift(audit(state, actor, 'Regra', `${budget.alertThreshold}% / ${budget.blockOnOverrun ? 'bloqueia' : 'alerta'}`, `${alertThreshold}% / ${blockOnOverrun ? 'bloqueia' : 'alerta'}`, 'Parametrização'))
  budget.alertThreshold = alertThreshold
  budget.blockOnOverrun = blockOnOverrun
  evaluateAlerts(state, budget.categoryId, budget.period)
  return budget
}

/* ---------- Planejamento: crescimento sobre o realizado, meta e distribuição mensal ---------- */

/** Realizado (pago ou recebido) de uma categoria-folha no ano, soma de todos os meses. */
export function realizedOfYear(state: ErpState, categoryId: string, year: string) {
  return round2(state.budgetEntries
    .filter(entry => entry.categoryId === categoryId && entryInWindow(entry.period, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], year)
      && (entry.kind === 'Realizado pago' || entry.kind === 'Realizado recebido') && entry.status !== 'Cancelado')
    .reduce((sum, entry) => sum + entry.amount, 0))
}

/**
 * Aplica o mesmo % de crescimento a cada categoria-folha, cada uma sobre o próprio realizado do ano
 * anterior — não sobre o orçado atual. Categoria sem realizado no ano anterior não recebe valor (seria
 * arbitrário); continua editável à mão. Esta é a extensão de planejamento ainda fora do documento formal.
 */
export function applyGrowthToCategories(state: ErpState, tenantId: string, categoryIds: string[], year: string, growthPct: number, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'aplica crescimento sobre o realizado')
  if (!/^\d{4}$/.test(year)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  const priorYear = String(Number(year) - 1)
  const leaves = [...new Set(categoryIds)].map(id => categoryOf(state, id)).filter(category => {
    assertCategoryTenant(category, tenantId)
    return category.status !== 'Inativa' && isBudgetLeaf(state, category.id) && !isDepreciationCategory(category)
  })
  if (!leaves.length) throw new DomainError('Nenhuma categoria ativa para aplicar o crescimento')
  const note = reason.trim() || `Crescimento de ${growthPct}% sobre ${priorYear}`
  const applied: { categoryId: string; base: number; amount: number }[] = []
  for (const category of leaves) {
    const base = realizedOfYear(state, category.id, priorYear)
    const amount = round2(Math.max(0, base * (1 + growthPct / 100)))
    if (amount <= 0) continue
    writeAllocation(state, category.id, year, amount, note, actor, true)
    applied.push({ categoryId: category.id, base, amount })
  }
  const parents = [...new Set(leaves.map(category => category.parentId).filter((id): id is string => Boolean(id)))]
  for (const parentId of parents) syncParentAmount(state, parentId, year)
  return applied
}

/** % de crescimento necessário para ir do realizado-base até a meta de faturamento. */
export function growthForTarget(baseRealized: number, target: number) {
  if (!(baseRealized > 0) || !(target > 0)) return null
  return round2(((target / baseRealized) - 1) * 100)
}

/** Meta de faturamento da empresa: calcula o % sobre a Receita realizada no ano anterior e o aplica a todas as contas (Receita e despesa). */
export function applyRevenueTarget(state: ErpState, tenantId: string, year: string, targetRevenue: number, reason: string, actor: string, role: Role) {
  const priorYear = String(Number(year) - 1)
  const revenueLeaves = state.budgetCategories.filter(category => category.tenantId === tenantId && natureOf(category) === 'Receita' && isBudgetLeaf(state, category.id))
  const base = round2(revenueLeaves.reduce((sum, leaf) => sum + realizedOfYear(state, leaf.id, priorYear), 0))
  const growthPct = growthForTarget(base, targetRevenue)
  if (growthPct === null) throw new DomainError('Sem realizado de Receita no ano anterior ou meta inválida para calcular o crescimento')
  const categoryIds = state.budgetCategories
    .filter(category => category.tenantId === tenantId && category.status !== 'Inativa' && isBudgetLeaf(state, category.id))
    .map(category => category.id)
  const applied = applyGrowthToCategories(state, tenantId, categoryIds, year, growthPct, reason || `Meta de faturamento ${year}: ${money(targetRevenue)}`, actor, role)
  return { growthPct, base, applied }
}

/** Define a distribuição mês a mês; a soma dos 12 meses passa a ser o orçado anual da categoria-folha. */
export function setMonthlyBudget(state: ErpState, tenantId: string, categoryId: string, year: string, monthlyAmounts: number[], reason: string, actor: string, role: Role) {
  assertPlanner(role, 'distribui o orçamento mês a mês')
  const category = categoryOf(state, categoryId)
  assertCategoryTenant(category, tenantId)
  if (!isBudgetLeaf(state, categoryId)) throw new DomainError('A distribuição mensal é feita na folha; a categoria com subcategoria mostra a soma')
  if (isDepreciationCategory(category)) throw new DomainError('A depreciação orçada sai dos ativos. Esta conta classifica o lançamento e não recebe um segundo valor')
  if (monthlyAmounts.length !== 12 || monthlyAmounts.some(value => !(value >= 0))) throw new DomainError('Informe os 12 meses, sem valor negativo')
  const rounded = monthlyAmounts.map(round2)
  const amount = round2(rounded.reduce((sum, value) => sum + value, 0))
  if (amount <= 0) throw new DomainError('A soma dos meses precisa ser maior que zero')
  const note = reason.trim() || 'Distribuição mensal ajustada'
  const existing = allocationOf(state, categoryId, year)
  if (existing) {
    const before = existing.amount
    existing.amount = amount
    existing.monthlyAmounts = rounded
    existing.audit.unshift(audit(state, actor, 'Distribuição mensal', String(before), String(amount), note))
    log(state, 'Orçamentos', actor, `${category.name} ${year}: distribuição mensal ajustada (${money(amount)})`, undefined, existing.id)
  } else {
    const budget: Budget = {
      id: nextId(state, 'ORC'), tenantId, categoryId, period: year, amount, alertThreshold: DEFAULT_ALERT_THRESHOLD,
      blockOnOverrun: true, monthlyAmounts: rounded, audit: [audit(state, actor, 'Criação', '', String(amount), note)],
    }
    state.budgets.unshift(budget)
    log(state, 'Orçamentos', actor, `${category.name} ${year} criado com ${money(amount)} (distribuição mensal)`, undefined, budget.id)
  }
  if (category.parentId) syncParentAmount(state, category.parentId, year)
  evaluateAlerts(state, categoryId, year)
  return allocationOf(state, categoryId, year)!
}

/**
 * Reparte o ano de cada categoria-folha pelo peso que cada mês teve no realizado do ano anterior.
 * Categoria sem orçamento no ano ou sem realizado no ano anterior fica como está.
 */
export function applyPriorSeasonality(state: ErpState, tenantId: string, categoryIds: string[], year: string, actor: string, role: Role) {
  assertPlanner(role, 'repete a sazonalidade do ano anterior')
  if (!/^\d{4}$/.test(year)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  const priorYear = String(Number(year) - 1)
  const applied: string[] = []
  for (const id of [...new Set(categoryIds)]) {
    const category = categoryOf(state, id)
    assertCategoryTenant(category, tenantId)
    if (category.status === 'Inativa' || !isBudgetLeaf(state, id) || isDepreciationCategory(category)) continue
    const total = allocationOf(state, id, year)?.amount ?? 0
    const prior = Array.from({ length: 12 }, (_, month) => budgetSummary(state, id, `${priorYear}-${String(month + 1).padStart(2, '0')}`).realized)
    const base = prior.reduce((sum, value) => sum + value, 0)
    if (!(total > 0) || !(base > 0)) continue
    const months = prior.map(value => round2(total * value / base))
    months[11] = round2(total - months.slice(0, 11).reduce((sum, value) => sum + value, 0))
    setMonthlyBudget(state, tenantId, id, year, months, `Sazonalidade de ${priorYear}`, actor, role)
    applied.push(id)
  }
  if (!applied.length) throw new DomainError(`Nenhuma conta com orçamento em ${year} e realizado em ${priorYear} para repetir a sazonalidade`)
  return applied
}

export interface CostCenterSplitLine { costCenterId: string; value: number }
export type CostCenterSplitMode = 'percent' | 'amount'

function splitText(state: ErpState, split: { mode: CostCenterSplitMode; lines: CostCenterSplitLine[] }) {
  return split.lines.map(line => {
    const center = state.costCenters.find(entry => entry.id === line.costCenterId)
    const name = center ? `${center.code} ${center.name}` : line.costCenterId
    return split.mode === 'percent' ? `${name} ${line.value}%` : `${name} ${money(line.value)}`
  }).join(' · ')
}

/** Converte a distribuição gravada em valor e percentual de cada centro de custo. */
export function costCenterAmounts(amount: number, split?: { mode: CostCenterSplitMode; lines: CostCenterSplitLine[] }) {
  if (!split) return []
  return split.lines.map(line => ({
    costCenterId: line.costCenterId,
    percent: split.mode === 'percent' ? line.value : (amount > 0 ? round2(line.value / amount * 100) : 0),
    amount: split.mode === 'amount' ? line.value : round2(amount * line.value / 100),
  }))
}

/**
 * Distribui o orçamento anual da categoria entre centros de custo da mesma empresa.
 * A soma pode ficar abaixo do ano: o que falta fica sem centro e o Financeiro responde por ela.
 * A soma não pode passar do ano. Linhas zeradas são ignoradas; nenhuma linha remove a distribuição.
 * Um centro sem setor pode receber fatia: o plano não depende do organograma.
 */
export function setCostCenterSplit(state: ErpState, tenantId: string, categoryId: string, year: string, mode: CostCenterSplitMode, lines: CostCenterSplitLine[], actor: string, role: Role) {
  assertPlanner(role, 'distribui o orçamento entre centros de custo')
  const category = categoryOf(state, categoryId)
  assertCategoryTenant(category, tenantId)
  if (!isBudgetLeaf(state, categoryId)) throw new DomainError('A distribuição por centro de custo é da categoria que recebe o valor')
  if (!isSpendCategory(category)) throw new DomainError('A distribuição por centro vale para custo, despesa e investimento')
  const budget = allocationOf(state, categoryId, year)
  if (!budget || !(budget.amount > 0)) throw new DomainError('Informe o orçamento do ano antes de distribuir entre os centros de custo')
  const cleaned = lines.map(line => ({ costCenterId: line.costCenterId, value: round2(Number(line.value) || 0) })).filter(line => line.value > 0)
  if (!cleaned.length) {
    if (budget.costCenterSplit) {
      budget.audit.unshift(audit(state, actor, 'Centros de custo', splitText(state, budget.costCenterSplit), 'Sem distribuição', 'Distribuição removida'))
      delete budget.costCenterSplit
    }
    return budget
  }
  const seen = new Set<string>()
  for (const line of cleaned) {
    if (seen.has(line.costCenterId)) throw new DomainError('O mesmo centro de custo não pode aparecer duas vezes')
    seen.add(line.costCenterId)
    const center = state.costCenters.find(entry => entry.id === line.costCenterId)
    if (!center || center.tenantId !== tenantId) throw new DomainError('Centro de custo não encontrado nesta empresa')
    if (center.status !== 'Ativo') throw new DomainError('Centro de custo inativo não entra na distribuição')
  }
  const sum = round2(cleaned.reduce((total, line) => total + line.value, 0))
  if (mode === 'percent' && sum > 100.05) throw new DomainError(`A porcentagem não pode passar de 100%. A soma está em ${sum}%`)
  if (mode === 'amount' && sum > budget.amount + 0.01) throw new DomainError(`A soma dos centros de custo não pode passar do orçamento do ano (${money(budget.amount)})`)
  const next = { mode, lines: cleaned }
  budget.audit.unshift(audit(state, actor, 'Centros de custo', budget.costCenterSplit ? splitText(state, budget.costCenterSplit) : 'Sem distribuição', splitText(state, next), mode === 'percent' ? 'Distribuição por porcentagem' : 'Distribuição por valor'))
  budget.costCenterSplit = next
  return budget
}

function realizedEntriesOfYear(state: ErpState, categoryId: string, year: string) {
  return state.budgetEntries.filter(entry => entry.categoryId === categoryId
    && (entry.kind === 'Realizado pago' || entry.kind === 'Realizado recebido')
    && entry.status !== 'Cancelado'
    && entryInWindow(entry.period, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], year))
}

/** Sugestão da fatia do centro: a parte dele no realizado da categoria no ano anterior. */
export function suggestCostCenterShare(state: ErpState, tenantId: string, categoryId: string, year: string, costCenterId: string) {
  const category = categoryOf(state, categoryId)
  assertCategoryTenant(category, tenantId)
  const center = state.costCenters.find(entry => entry.id === costCenterId)
  if (!center || center.tenantId !== tenantId) throw new DomainError('Centro de custo não encontrado nesta empresa')
  if (!/^\d{4}$/.test(year)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  const prior = realizedEntriesOfYear(state, categoryId, String(Number(year) - 1))
  const priorTotal = round2(prior.reduce((sum, entry) => sum + entry.amount, 0))
  const priorRealized = round2(prior.filter(entry => entry.costCenter === center.code).reduce((sum, entry) => sum + entry.amount, 0))
  const percent = priorTotal > 0 ? round2(priorRealized / priorTotal * 100) : 0
  const budget = allocationOf(state, categoryId, year)?.amount ?? 0
  return { percent, amount: round2(budget * percent / 100), priorRealized, priorTotal }
}

/** Centros ativos que tiveram realizado na categoria no ano anterior, com a fatia de cada um. */
export function suggestCategoryCenters(state: ErpState, tenantId: string, categoryId: string, year: string) {
  return state.costCenters
    .filter(center => center.tenantId === tenantId && center.status === 'Ativo')
    .map(center => ({ costCenterId: center.id, ...suggestCostCenterShare(state, tenantId, categoryId, year, center.id) }))
    .filter(entry => entry.percent > 0)
    .sort((a, b) => b.percent - a.percent)
}

/** Troca a distribuição da categoria pela participação de cada centro no realizado do ano anterior. */
export function applyCategorySuggestion(state: ErpState, tenantId: string, categoryId: string, year: string, actor: string, role: Role) {
  assertPlanner(role, 'aplica a sugestão de centros de custo')
  const suggestions = suggestCategoryCenters(state, tenantId, categoryId, year)
  if (!suggestions.length) throw new DomainError('Esta conta não teve realizado com centro de custo no ano anterior')
  const lines = suggestions.map(entry => ({ costCenterId: entry.costCenterId, value: entry.percent }))
  const sum = round2(lines.reduce((total, line) => total + line.value, 0))
  if (sum > 100) lines[0].value = round2(lines[0].value - (sum - 100))
  return setCostCenterSplit(state, tenantId, categoryId, year, 'percent', lines, actor, role)
}

/** Guarda o plano do ano como simulação. O orçamento oficial não muda. */
export function saveBudgetSimulation(state: ErpState, tenantId: string, year: string, actor: string, role: Role) {
  assertPlanner(role, 'salva a simulação do orçamento')
  if (!/^\d{4}$/.test(year)) throw new DomainError('Informe o ano do orçamento, no formato AAAA')
  const priorYear = String(Number(year) - 1)
  const lines = state.budgetCategories.filter(category => category.tenantId === tenantId && category.status !== 'Inativa' && isBudgetLeaf(state, category.id)).flatMap(category => {
    const amount = allocationOf(state, category.id, year)?.amount ?? 0
    if (!(amount > 0)) return []
    const prior = Math.abs(realizedOfYear(state, category.id, priorYear))
    return [{ categoryId: category.id, growthPct: prior ? round2((amount / prior - 1) * 100) : 0, amount }]
  })
  if (!lines.length) throw new DomainError('Não há valor no ano para salvar a simulação')
  const existing = state.budgetSimulations.find(entry => entry.tenantId === tenantId && entry.year === year)
  if (existing) {
    existing.lines = lines
    existing.savedAt = now()
    existing.savedBy = actor
    log(state, 'Orçamentos', actor, `Simulação de ${year} atualizada (${lines.length} contas)`, undefined, existing.id)
    return existing
  }
  const simulation = { id: nextId(state, 'SIM'), tenantId, year, lines, savedAt: now(), savedBy: actor }
  state.budgetSimulations.unshift(simulation)
  log(state, 'Orçamentos', actor, `Simulação de ${year} salva (${lines.length} contas)`, undefined, simulation.id)
  return simulation
}

/** Copia a simulação salva para o orçamento oficial do mesmo ano. */
export function applyBudgetSimulation(state: ErpState, tenantId: string, year: string, actor: string, role: Role) {
  assertPlanner(role, 'aplica a simulação do orçamento')
  const simulation = state.budgetSimulations.find(entry => entry.tenantId === tenantId && entry.year === year)
  if (!simulation) throw new DomainError('Não há simulação salva para este ano')
  for (const line of simulation.lines) {
    if (allocationOf(state, line.categoryId, year)?.amount === line.amount) continue
    writeAllocation(state, line.categoryId, year, line.amount, `Simulação salva por ${simulation.savedBy}`, actor, true)
  }
  log(state, 'Orçamentos', actor, `Simulação de ${year} aplicada ao orçamento`, undefined, simulation.id)
  return simulation
}

/** Financeiro e Administrador veem todas as categorias. Os demais veem só as contas em que são o responsável. */
export function viewerCategoryScope(state: ErpState, tenantId: string, userId: string, role: Role) {
  if (role === 'Administrador' || role === 'Financeiro') return { limited: false, categoryIds: [] as string[] }
  const categoryIds = state.budgetCategories.filter(entry => entry.tenantId === tenantId && entry.responsibleUserId === userId).map(entry => entry.id)
  return { limited: true, categoryIds }
}

/** Financeiro, Gestor e Administrador veem a empresa. Os demais veem os centros do seu nome, ou do papel em demonstração. */
export function viewerCenterScope(state: ErpState, tenantId: string, userId: string, role: Role) {
  if (hasFullAccess(role) || role === 'Financeiro') return { limited: false, centerIds: [] as string[] }
  const active = state.costCenters.filter(entry => entry.tenantId === tenantId && entry.status !== 'Inativo')
  const owned = active.filter(entry => entry.responsibleUserId === userId)
  const centers = owned.length ? owned : active.filter(entry => state.users.find(user => user.id === entry.responsibleUserId)?.role === role)
  return { limited: true, centerIds: centers.map(entry => entry.id) }
}

function normalizeCostCenterCode(code: string) {
  return code.trim().toUpperCase()
}

/** Cadastra um centro de custo da empresa. O código fica estável para o mesmo código no Omie. */
export function createCostCenter(state: ErpState, tenantId: string, input: { code: string; name: string; responsibleUserId: string }, actor: string, role: Role) {
  assertPlanner(role, 'cadastra centro de custo')
  const code = normalizeCostCenterCode(input.code)
  const name = input.name.trim()
  if (!name) throw new DomainError('Informe o nome do centro de custo')
  if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code)) throw new DomainError('O código usa letras, números e hífen')
  assertResponsible(state, input.responsibleUserId, 'do centro de custo')
  if (state.costCenters.some(entry => entry.tenantId === tenantId && entry.code === code)) throw new DomainError('Já existe um centro de custo com este código nesta empresa')
  const center = { id: nextId(state, 'CDC'), tenantId, code, name, responsibleUserId: input.responsibleUserId, status: 'Ativo' as const }
  state.costCenters.push(center)
  log(state, 'Orçamentos', actor, `Centro de custo ${code} · ${name} criado, responsável ${userLabel(state, input.responsibleUserId)}`, undefined, center.id)
  return center
}

/** Altera nome, responsável ou situação. O código não muda: é o vínculo com o Omie e com o padrão do setor. */
export function updateCostCenter(state: ErpState, tenantId: string, id: string, patch: { name: string; status: 'Ativo' | 'Inativo'; responsibleUserId: string }, actor: string, role: Role) {
  assertPlanner(role, 'altera centro de custo')
  const center = state.costCenters.find(entry => entry.id === id && entry.tenantId === tenantId)
  if (!center) throw new DomainError('Centro de custo não encontrado nesta empresa')
  const name = patch.name.trim()
  if (!name) throw new DomainError('Informe o nome do centro de custo')
  assertResponsible(state, patch.responsibleUserId, 'do centro de custo')
  const changes: string[] = []
  if (center.name !== name) changes.push(`${center.name} → ${name}`)
  if (center.responsibleUserId !== patch.responsibleUserId) changes.push(`responsável ${userLabel(state, center.responsibleUserId)} → ${userLabel(state, patch.responsibleUserId)}`)
  if (center.status !== patch.status) changes.push(`${center.status} → ${patch.status}`)
  if (changes.length) log(state, 'Orçamentos', actor, `Centro de custo ${center.code}: ${changes.join('; ')}`, undefined, center.id)
  center.name = name
  center.responsibleUserId = patch.responsibleUserId
  center.status = patch.status
  return center
}

/** Código do centro padrão do setor na empresa. Cada empresa escolhe o seu. */
export function sectorCostCenter(sector: { costCenters?: Record<string, string> | null }, tenantId: string) {
  const map = sector.costCenters
  if (!map || typeof map !== 'object') return ''
  return map[tenantId] ?? ''
}

/** O setor guarda um código padrão por empresa. O código precisa existir e estar ativo na empresa em que a escolha é feita. */
export function setSectorDefaultCostCenter(state: ErpState, tenantId: string, sectorId: string, code: string, actor: string, role: Role) {
  assertPlanner(role, 'define o centro padrão do setor')
  const sector = state.sectors.find(entry => entry.id === sectorId)
  if (!sector) throw new DomainError('Setor não encontrado')
  const normalized = normalizeCostCenterCode(code)
  const center = state.costCenters.find(entry => entry.tenantId === tenantId && entry.code === normalized && entry.status === 'Ativo')
  if (!center) throw new DomainError('Centro de custo ativo não encontrado nesta empresa')
  if (!sector.costCenters || typeof sector.costCenters !== 'object') sector.costCenters = {}
  sector.costCenters[tenantId] = normalized
  log(state, 'Orçamentos', actor, `${sector.name} passa a usar ${normalized} · ${center.name} como centro padrão`, undefined, center.id)
  return sector
}

/* ---------- Planejamento de grupo: a meta é combinada, mas cada empresa grava o próprio orçamento ---------- */

/** Empresas ativas do grupo. O orçamento nunca é gravado no grupo — cada empresa grava o seu. */
export function groupTenants(state: ErpState, groupId: string) {
  return state.tenants.filter(entry => entry.groupId === groupId && entry.status === 'Ativa')
}

export interface FinanceSlice { budget: number; realized: number; forecast: number }

export interface FinanceCenterUse {
  tenantId: string
  company: string
  code: string
  name: string
  amount: number
  share: number
}

export interface FinanceSnapshot {
  year: string
  fromMonth: number
  toMonth: number
  receita: FinanceSlice
  deducoes: FinanceSlice
  liquida: { budget: number; realized: number }
  custos: FinanceSlice
  despesas: FinanceSlice
  resultado: { budget: number; realized: number }
  /** Resultado realizado dividido pela receita realizada. Sem receita no período, fica vazio. */
  margem: number | null
  /** Realizado de custos e despesas dividido pelo orçado desses grupos. */
  usoGasto: number | null
  realizedPaid: number
  centers: FinanceCenterUse[]
  lines: string[]
}

const GROUP_BY_CODE = Object.fromEntries(BUDGET_GROUPS.map(entry => [entry.code, entry.name]))

function sliceOf(state: ErpState, tenantIds: string[], group: string, year: string, fromMonth: number, toMonth: number): FinanceSlice {
  let budget = 0
  let realized = 0
  let forecast = 0
  for (const tenantId of tenantIds) {
    for (const leaf of leavesInGroup(state, tenantId, group)) {
      for (let month = fromMonth; month <= toMonth; month += 1) {
        const summary = budgetSummary(state, leaf.id, `${year}-${String(month).padStart(2, '0')}`)
        budget += summary.amount
        realized += summary.realized
        forecast += summary.forecast
      }
    }
  }
  return { budget: round2(budget), realized: round2(realized), forecast: round2(forecast) }
}

function periodPhrase(year: string, fromMonth: number, toMonth: number) {
  if (fromMonth === toMonth) return `Em ${MONTH_NAMES[fromMonth - 1]} de ${year}`
  if (fromMonth === 1 && toMonth === 12) return `Em ${year}`
  return `De ${MONTH_NAMES[fromMonth - 1]} a ${MONTH_NAMES[toMonth - 1]} de ${year}`
}

/**
 * Leitura do orçamento no período, no lugar do painel de inteligência.
 * Soma empresas sem misturar centros de custo de código igual.
 * CAPEX fica fora do resultado operacional.
 */
export function financeSnapshot(state: ErpState, tenantIds: string[], year: string, fromMonth: number, toMonth: number): FinanceSnapshot {
  if (!/^\d{4}$/.test(year)) throw new DomainError('Informe o ano, no formato AAAA')
  if (fromMonth < 1 || toMonth > 12 || fromMonth > toMonth) throw new DomainError('O período precisa ir de um mês até outro mês do mesmo ano')
  const uniqueTenants = [...new Set(tenantIds)].filter(id => state.tenants.some(entry => entry.id === id))
  const receita = sliceOf(state, uniqueTenants, GROUP_BY_CODE['01'], year, fromMonth, toMonth)
  const deducoes = sliceOf(state, uniqueTenants, GROUP_BY_CODE['02'], year, fromMonth, toMonth)
  const custos = sliceOf(state, uniqueTenants, GROUP_BY_CODE['03'], year, fromMonth, toMonth)
  const variaveis = sliceOf(state, uniqueTenants, GROUP_BY_CODE['04'], year, fromMonth, toMonth)
  const fixas = sliceOf(state, uniqueTenants, GROUP_BY_CODE['05'], year, fromMonth, toMonth)
  const despesas: FinanceSlice = {
    budget: round2(variaveis.budget + fixas.budget),
    realized: round2(variaveis.realized + fixas.realized),
    forecast: round2(variaveis.forecast + fixas.forecast),
  }
  const liquida = { budget: round2(receita.budget - deducoes.budget), realized: round2(receita.realized - deducoes.realized) }
  const resultado = {
    budget: round2(liquida.budget - custos.budget - despesas.budget),
    realized: round2(liquida.realized - custos.realized - despesas.realized),
  }
  const margem = receita.realized > 0 ? round2(resultado.realized / receita.realized * 100) : null
  const gastoOrcado = round2(custos.budget + despesas.budget)
  const gastoRealizado = round2(custos.realized + despesas.realized)
  const usoGasto = gastoOrcado > 0 ? round2(gastoRealizado / gastoOrcado * 100) : null
  const months = Array.from({ length: toMonth - fromMonth + 1 }, (_, index) => fromMonth + index)
  const paid = state.budgetEntries.filter(entry => uniqueTenants.includes(entry.tenantId) && entry.kind === 'Realizado pago' && entry.status !== 'Cancelado' && entryInWindow(entry.period, months, year))
  const realizedPaid = round2(paid.reduce((sum, entry) => sum + entry.amount, 0))
  const bySector = new Map<string, FinanceCenterUse>()
  for (const entry of paid) {
    const sector = entry.costCenter ? state.sectors.find(item => item.costCenters?.[entry.tenantId] === entry.costCenter) : undefined
    if (!sector) continue
    const key = `${entry.tenantId}:${sector.id}`
    const current = bySector.get(key)
    if (current) current.amount = round2(current.amount + entry.amount)
    else {
      bySector.set(key, {
        tenantId: entry.tenantId,
        company: state.tenants.find(item => item.id === entry.tenantId)?.tradeName ?? entry.tenantId,
        code: sector.id,
        name: sector.name,
        amount: entry.amount,
        share: 0,
      })
    }
  }
  const centers = [...bySector.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, 5)
  for (const center of centers) center.share = realizedPaid > 0 ? round2(center.amount / realizedPaid * 100) : 0
  const when = periodPhrase(year, fromMonth, toMonth)
  const lines = [
    `${when}, a receita orçada é ${money(receita.budget)} e a realizada é ${money(receita.realized)}. A líquida orçada, já sem deduções, fica em ${money(liquida.budget)}.`,
    `O resultado operacional orçado do período é ${money(resultado.budget)}. O realizado fecha em ${money(resultado.realized)}. O investimento (CAPEX) fica fora dessa conta.`,
  ]
  const pct = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  if (usoGasto !== null) lines.push(`Custos e despesas consumiram ${pct(usoGasto)} do orçado neste intervalo.`)
  const top = centers[0]
  if (top) {
    const where = uniqueTenants.length > 1 ? ` (${top.company})` : ''
    lines.push(`O maior gasto pago está em ${top.name}${where}: ${money(top.amount)}, ${pct(top.share)} do realizado pago.`)
  } else lines.push('Nenhum pagamento do período está num setor utilizador.')
  return { year, fromMonth, toMonth, receita, deducoes, liquida, custos, despesas, resultado, margem, usoGasto, realizedPaid, centers, lines }
}

/** Realizado do ano anterior somado das empresas do grupo, só para calcular o % — nunca a fonte do dado. */
export function groupPriorYearRealized(state: ErpState, groupId: string, year: string, nature: BudgetCategoryNature = 'Receita') {
  const priorYear = String(Number(year) - 1)
  return round2(groupTenants(state, groupId).reduce((sum, tenant) => {
    const leaves = state.budgetCategories.filter(category => category.tenantId === tenant.id && natureOf(category) === nature && isBudgetLeaf(state, category.id))
    return sum + leaves.reduce((total, leaf) => total + realizedOfYear(state, leaf.id, priorYear), 0)
  }, 0))
}

/** O % combinado no grupo é levado a cada empresa, que aplica sobre a própria base e grava o próprio orçamento. */
export function applyGroupGrowth(state: ErpState, groupId: string, year: string, growthPct: number, reason: string, actor: string, role: Role) {
  assertPlanner(role, 'planeja o orçamento do grupo')
  const tenants = groupTenants(state, groupId)
  if (!tenants.length) throw new DomainError('O grupo não tem empresas ativas')
  const note = reason.trim() || `Planejamento de grupo: ${growthPct}% sobre o realizado do ano anterior`
  const perTenant = tenants.map(tenant => {
    const categoryIds = state.budgetCategories
      .filter(category => category.tenantId === tenant.id && category.status !== 'Inativa' && isBudgetLeaf(state, category.id))
      .map(category => category.id)
    return { tenantId: tenant.id, applied: categoryIds.length ? applyGrowthToCategories(state, tenant.id, categoryIds, year, growthPct, note, actor, role) : [] }
  })
  log(state, 'Orçamentos', actor, `Planejamento de grupo aplicado a ${tenants.length} empresa(s): ${growthPct}%`, undefined, groupId)
  return perTenant
}

/** Meta de faturamento do grupo: % sobre a Receita consolidada do ano anterior, aplicado a cada empresa sobre a própria base. */
export function applyGroupRevenueTarget(state: ErpState, groupId: string, year: string, targetRevenue: number, reason: string, actor: string, role: Role) {
  const base = groupPriorYearRealized(state, groupId, year, 'Receita')
  const growthPct = growthForTarget(base, targetRevenue)
  if (growthPct === null) throw new DomainError('Sem realizado de Receita do grupo no ano anterior ou meta inválida')
  const perTenant = applyGroupGrowth(state, groupId, year, growthPct, reason || `Meta de faturamento do grupo ${year}: ${money(targetRevenue)}`, actor, role)
  return { growthPct, base, perTenant }
}

/* ---------- Alertas ---------- */

/** Quem responde pela conta: a pessoa responsável da categoria, ou das filhas quando a conta é pai. */
export function notifiedUsers(state: ErpState, categoryId: string, period: string) {
  void period
  const leaves = isBudgetLeaf(state, categoryId) ? [categoryId] : activeChildren(state, categoryId).map(entry => entry.id)
  return [...new Set(leaves.map(id => categoryOf(state, id).responsibleUserId).filter((id): id is string => Boolean(id)))]
}

function notified(state: ErpState, categoryId: string, period: string) {
  const roles = notifiedUsers(state, categoryId, period).map(id => state.users.find(user => user.id === id)?.role).filter((entry): entry is Role => Boolean(entry))
  return [...new Set<Role>([...roles, 'Financeiro'])]
}

/** Registra a ocorrência quando o uso cruza o limiar e encerra quando volta abaixo dele. */
export function evaluateAlerts(state: ErpState, categoryId: string, period: string) {
  const control = controlCategoryId(state, categoryId)
  // Receita não bloqueia nem alerta por excesso: vender além da meta é bom, não um risco de saldo.
  if (natureOf(categoryOf(state, control)) === 'Receita') return
  const summary = budgetSummary(state, control, period)
  if (!summary.budget) return
  const open = state.budgetAlerts.filter(entry => entry.kind === 'Alerta' && entry.categoryId === control && entry.period === period && entry.status !== 'Encerrado')
  for (const entry of open.filter(item => item.threshold !== summary.budget!.alertThreshold)) entry.status = 'Encerrado'
  if (summary.use >= summary.budget.alertThreshold) {
    if (open.some(entry => entry.threshold === summary.budget!.alertThreshold)) return
    const category = categoryOf(state, control)
    state.budgetAlerts.unshift({
      id: nextId(state, 'BAL'), tenantId: category.tenantId, categoryId: control, period, kind: 'Alerta', threshold: summary.budget.alertThreshold, use: summary.use,
      message: `${category.name} ${period} atingiu ${summary.use}% (limiar ${summary.budget.alertThreshold}%)`,
      notifiedRoles: notified(state, control, period), notifiedUserIds: notifiedUsers(state, control, period), status: 'Aberto', at: now(),
    })
  } else {
    for (const entry of open) entry.status = 'Encerrado'
  }
}

/** Ciente é do responsável de um centro com fatia, do Financeiro ou de quem tem acesso total. */
export function acknowledgeAlert(state: ErpState, id: string, userId: string, actor: string, role: Role) {
  const alert = state.budgetAlerts.find(entry => entry.id === id)
  if (!alert || alert.status !== 'Aberto') throw new DomainError('Alerta aberto não encontrado')
  const isResponsible = Boolean(userId) && (alert.notifiedUserIds ?? []).includes(userId)
  if (!hasFullAccess(role) && role !== 'Financeiro' && !isResponsible) throw new DomainError('Este alerta foi enviado a outro responsável')
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
  /** Setor utilizador da demanda. Sem valor destinado para ele, a demanda não segue. */
  sectorId?: string
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
  if (category.status === 'Inativa') throw new DomainError('A categoria não está disponível para novos fluxos')
  if (category.parentId && categoryOf(state, category.parentId).status === 'Inativa') throw new DomainError('A categoria pai está inativa')
  if (!(input.amount >= 0)) throw new DomainError('Valor estipulado inválido')
  if (input.sectorId) {
    const destined = allocationOf(state, input.categoryId, input.period.slice(0, 4))?.sectorAllocations?.find(line => line.sectorId === input.sectorId)
    if (!destined || !(destined.amount > 0)) throw new DomainError('Este setor não tem valor destinado nesta categoria')
  }
  const control = controlCategoryId(state, input.categoryId)
  let current = state.budgetEntries.find(entry => entry.kind === 'Previsão' && entry.sourceModule === input.sourceModule && entry.sourceId === input.sourceId)
  const summary = budgetSummary(state, control, input.period.slice(0, 4))
  const previousOpen = current && current.categoryId === input.categoryId && current.period === input.period ? current.openAmount : 0
  const projected = summary.balance + previousOpen - input.amount
  const authorized = state.budgetExceptions.some(entry => entry.kind === 'Saldo excedido' && entry.sourceId === input.sourceId && entry.status === 'Autorizada' && entry.amount >= input.amount)
  const overrun = Boolean(summary.budget?.blockOnOverrun) && projected < 0 && !authorized

  if (!current) {
    current = {
      id: nextId(state, 'BL'), tenantId: category.tenantId, kind: 'Previsão', categoryId: input.categoryId, period: input.period,
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
      id: nextId(state, 'BX'), tenantId: category.tenantId, kind: 'Saldo excedido', status: 'Pendente', sourceModule: input.sourceModule,
      sourceId: input.sourceId, description, amount: round2(input.amount), categoryIds: [input.categoryId], period: input.period, createdAt: now(),
    })
    state.budgetAlerts.unshift({
      id: nextId(state, 'BAL'), tenantId: category.tenantId, categoryId: control, period: input.period, kind: 'Bloqueio', threshold: DEFAULT_BLOCK_THRESHOLD, use: summary.use,
      message: `${input.sourceId} retido: ${description}`, notifiedRoles: [...new Set<Role>([...notified(state, control, input.period), 'Gestor'])], notifiedUserIds: notifiedUsers(state, control, input.period), status: 'Aberto', at: now(), sourceId: input.sourceId,
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

function retainPayment(state: ErpState, tenantId: string, payment: OmiePayment, kind: BudgetException['kind'], description: string) {
  if (!state.budgetExceptions.some(entry => entry.sourceId === payment.id && entry.kind === kind)) state.budgetExceptions.unshift({
    id: nextId(state, 'BX'), tenantId, kind, status: 'Pendente', sourceModule: 'Omie', sourceId: payment.id,
    description, amount: payment.amount, categoryIds: [...payment.categoryIds], period: monthOf(payment.paidAt), createdAt: now(),
  })
}

/**
 * Pagamento (custo) ou recebimento (receita) do Omie. A natureza da categoria decide qual dos dois é —
 * uma categoria de Receita nunca gera "Realizado pago" e vice-versa. Recebimento não tem previsão nem
 * bloqueio de saldo: vender é sempre bom, não existe "acima do saldo" para receita.
 */
export function applyOmiePayment(state: ErpState, tenantId: string, payment: OmiePayment, actor = 'Integração Omie') {
  const prior = state.budgetEntries.find(entry => entry.externalId === payment.id && (entry.kind === 'Realizado pago' || entry.kind === 'Realizado recebido'))
  if (prior) return prior
  if (payment.error) {
    retainPayment(state, tenantId, payment, 'Erro de sincronização', payment.error)
    return undefined
  }
  if (!payment.categoryIds.length) {
    retainPayment(state, tenantId, payment, 'Sem categoria', `Pagamento ${payment.id} sem categoria`)
    return undefined
  }
  if (payment.categoryIds.length > 1) {
    retainPayment(state, tenantId, payment, 'Múltiplas categorias', `Pagamento ${payment.id} tem ${payment.categoryIds.length} categorias`)
    return undefined
  }
  const categoryId = payment.categoryIds[0]
  const category = categoryOf(state, categoryId)
  assertCategoryTenant(category, tenantId)
  const isReceita = natureOf(category) === 'Receita'
  const control = controlCategoryId(state, categoryId)
  const purchase = state.purchaseOrders.find(entry => entry.id === payment.sourceId)
  const forecast = isReceita ? undefined : state.budgetEntries.find(entry => entry.kind === 'Previsão' && controlCategoryId(state, entry.categoryId) === control
    && (entry.sourceId === payment.sourceId || purchase?.demandIds.includes(entry.sourceId)))
  const signed = payment.event === 'Estorno' ? -Math.abs(payment.amount) : Math.abs(payment.amount)
  const invoiceNumber = payment.invoiceNumber ?? (payment.sourceId.startsWith('NF-') ? payment.sourceId.slice(3) : undefined)
  const entry: BudgetEntry = {
    id: nextId(state, 'BL'), tenantId, kind: isReceita ? 'Realizado recebido' : 'Realizado pago', categoryId, period: monthOf(payment.paidAt), amount: signed, openAmount: 0,
    status: payment.event === 'Estorno' ? 'Estornado' : 'Liquidado', sourceModule: 'Omie', sourceType: payment.event,
    sourceId: payment.sourceId, externalId: payment.id, invoiceNumber, linkModule: payment.link?.module, linkId: payment.link?.id,
    projectId: forecast?.projectId, costCenter: forecast?.costCenter,
    description: payment.description ?? `${payment.event} da nota ${invoiceNumber ?? payment.id}`, createdAt: now(),
    events: [event(state, actor, payment.event, signed, `Nota ${invoiceNumber ?? payment.id}`)],
  }
  state.budgetEntries.unshift(entry)
  if (!payment.link && !isReceita) retainPayment(state, tenantId, payment, 'Sem vínculo', `NF ${invoiceNumber ?? payment.id} entrou no custo sem documento do Thalamus`)
  if (forecast && forecast.status !== 'Retido' && forecast.status !== 'Cancelado') {
    forecast.openAmount = round2(Math.max(0, forecast.openAmount - signed))
    if (payment.event === 'Estorno') forecast.openAmount = round2(Math.min(forecast.amount, forecast.openAmount))
    forecast.status = forecast.openAmount <= 0 ? 'Liquidado' : forecast.openAmount < forecast.amount ? 'Parcial' : 'Ativo'
    forecast.events.unshift(event(state, actor, payment.event, signed, `Conciliado com ${payment.id}`))
  }
  log(state, 'Orçamentos', actor, `${payment.event} ${payment.id}: ${money(signed)}`, undefined, payment.sourceId)
  evaluateAlerts(state, categoryId, entry.period)
  return entry
}

/* ---------- Exceções ---------- */

export const canDecide = (exception: BudgetException, role: Role) =>
  exception.kind === 'Saldo excedido' ? APPROVER_ROLES.includes(role) : PLANNER_ROLES.includes(role)

/** Sem categoria fica com o Financeiro. Sem vínculo fica com o setor executor. Saldo excedido fica com o responsável da conta. */
export function seesBudgetException(state: ErpState, exception: BudgetException, userId: string, role: Role) {
  if (role === 'Administrador') return true
  const category = exception.categoryIds[0] ? state.budgetCategories.find(entry => entry.id === exception.categoryIds[0]) : undefined
  if (exception.kind === 'Sem categoria' || exception.kind === 'Múltiplas categorias' || exception.kind === 'Duplicidade' || exception.kind === 'Erro de sincronização') return role === 'Financeiro'
  if (exception.kind === 'Sem vínculo') {
    const sector = state.sectors.find(entry => entry.id === category?.executorSectorId)
    return Boolean(sector && state.users.find(entry => entry.id === userId)?.sector === sector.name)
  }
  if (exception.kind === 'Saldo excedido') return category?.responsibleUserId === userId
  return false
}

/**
 * Saldo excedido: o Gestor libera ou recusa a previsão retida.
 * Pagamento retido: o Financeiro reclassifica numa categoria e o realizado é lançado, ou rejeita.
 */
export function decideBudgetException(state: ErpState, tenantId: string, id: string, approve: boolean, note: string, actor: string, role: Role, categoryId?: string) {
  const entry = state.budgetExceptions.find(item => item.id === id)
  if (!entry || entry.status !== 'Pendente') throw new DomainError('Exceção pendente não encontrada')
  if (entry.tenantId !== tenantId) throw new DomainError('A exceção não pertence à empresa ativa')
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
    assertCategoryTenant(category, tenantId)
    if (category.status === 'Inativa') throw new DomainError('A categoria escolhida está inativa')
    const original = state.omiePayments.find(item => item.id === entry.sourceId)
    if (!original) throw new DomainError('Pagamento do Omie não encontrado para reprocessar')
    const posted = applyOmiePayment(state, tenantId, { ...original, categoryIds: [categoryId], error: undefined }, actor)
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
  if (entry.kind !== 'Realizado pago' && entry.kind !== 'Realizado recebido') return ''
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
export function linkBudgetInvoice(state: ErpState, tenantId: string, exceptionId: string, module: InvoiceLinkModule, documentId: string, actor: string, role: Role) {
  assertPlanner(role, 'vincula a nota ao documento')
  const exception = state.budgetExceptions.find(entry => entry.id === exceptionId)
  if (!exception || exception.status !== 'Pendente' || exception.kind !== 'Sem vínculo') throw new DomainError('Nota sem vínculo não encontrada')
  if (exception.tenantId !== tenantId) throw new DomainError('A exceção não pertence à empresa ativa')
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
