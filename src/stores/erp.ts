import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import * as catalog from '../domain/catalog'
import * as extensions from '../domain/catalogExtensions'
import * as engine from '../domain/engine'
import * as enterprise from '../domain/enterprise'
import * as engineering from '../domain/engineering'
import * as budget from '../domain/budget'
import { profileCan } from '../domain/access'
import { provisionCompany, saveEconomicGroup, saveOmieConnection } from '../domain/platform'
import type { ErpState } from '../domain/engine'
import { createSeedState } from '../mocks/seed'
import type { OmieGateway } from '../services/omie/gateway'
import { MockOmieGateway } from '../services/omie/mockOmieGateway'
import type { AccessProfile, ApprovalRole, FiscalSnapshot, FunctionalityId, MaintenanceOrder, NonConformity, Role, SalesOrder, UnitConversion } from '../types/domain'
import { useUiStore } from './ui'

const STORAGE_KEY = 'thalamus-erp-v32'

function load(): ErpState {
  const seed = createSeedState()
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const state = JSON.parse(saved) as ErpState
      /** Recarga a quente pode gravar o estado antigo na chave nova; faltando coleção, o seed regenera. */
      if (Object.keys(seed).some(key => !(key in state))) throw new Error('Estado salvo de outra versão')
      engine.applyDueRevisions(state)
      return state
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
  return seed
}

export const useErpStore = defineStore('erp', () => {
  const state = reactive<ErpState>(load())
  const ui = useUiStore()
  const omieGateway = new MockOmieGateway(() => state.omieQueue, () => state.omiePayments)
  omieGateway.categoryInbox = () => state.omieCategoryInbox
  const omie: OmieGateway = omieGateway
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  watch(state, () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), 300)
  }, { deep: true })
  budget.absorbOmieCategories(state, ui.activeTenantId)

  /** Executa uma regra de negócio; retorna o resultado (ou true) em caso de sucesso e undefined em caso de erro. */
  function run<T>(action: () => T, success?: string | ((result: T) => string)): Exclude<T, void | undefined> | true | undefined {
    try {
      const result = action()
      if (success) ui.notify('success', typeof success === 'function' ? success(result) : success)
      return (result === undefined ? true : result) as Exclude<T, void | undefined> | true
    } catch (error) {
      ui.notify('error', 'Ação não concluída', error instanceof Error ? error.message : String(error))
      return undefined
    }
  }

  const actor = () => ui.userName
  const activeUser = () => state.users.find(user => user.id === ui.sessionUserId) ?? state.users[0]
  const tenantId = () => ui.activeTenantId
  const actualProfileIds = () => state.userProfileAssignments.filter(entry => entry.userId === activeUser()?.id && entry.tenantId === tenantId()).map(entry => entry.profileId)
  const effectiveProfileIds = () => ui.previewProfileId ? [ui.previewProfileId] : actualProfileIds()
  const effectiveProfiles = () => effectiveProfileIds().map(id => state.accessProfiles.find(profile => profile.id === id)).filter((entry): entry is AccessProfile => !!entry)
  const can = (functionality: FunctionalityId) => effectiveProfiles().some(profile => profileCan(profile, functionality))
  const isAccessAdministrator = () => actualProfileIds().some(id => state.accessProfiles.find(profile => profile.id === id)?.system)
  const isPlatformMaster = () => activeUser()?.platformMaster === true

  function enterPlatform() {
    const master = state.users.find(user => user.platformMaster)
    if (!master) throw new Error('Usuário mestre não encontrado')
    ui.previewProfileId = null
    ui.sessionUserId = master.id
    ui.activeTenantId = ''
    ui.role = 'Administrador'
    ui.userName = master.name
  }

  function enterCompany(nextTenantId: string) {
    if (!isPlatformMaster()) throw new Error('Somente o usuário mestre entra numa empresa por esta tela')
    const profile = state.accessProfiles.find(entry => entry.tenantId === nextTenantId && entry.system)
    const assignment = state.userProfileAssignments.find(entry => entry.tenantId === nextTenantId && entry.profileId === profile?.id)
    const user = state.users.find(entry => entry.id === assignment?.userId)
    if (!profile || !user) throw new Error('Esta empresa ainda não tem administrador')
    ui.previewProfileId = null
    ui.sessionUserId = user.id
    ui.activeTenantId = nextTenantId
    ui.role = 'Administrador'
    ui.userName = user.name
  }

  function previewProfile(profileId: string | null) {
    if (!isAccessAdministrator()) throw new Error('Somente o Administrador pode visualizar outro perfil')
    const profile = profileId ? state.accessProfiles.find(entry => entry.id === profileId) : undefined
    ui.previewProfileId = profileId
    ui.role = profile ? profile.simulatedRole ?? 'Operador' : 'Administrador'
    ui.userName = profile ? `Lucas Lima · visualizando ${profile.name}` : activeUser()?.name ?? 'Lucas Lima'
  }

  function saveAccessProfile(input: Pick<AccessProfile, 'id' | 'name' | 'description' | 'functionalityIds'>) {
    if (!can('organizacao.acessos.gerir')) throw new Error('Sem permissão para gerir acessos')
    const existing = state.accessProfiles.find(entry => entry.id === input.id)
    if (!existing) throw new Error('Perfil não encontrado')
    if (existing.system) throw new Error('O perfil Administrador é mantido pelo sistema e sempre possui todas as funcionalidades')
    existing.name = input.name.trim() || existing.name
    existing.description = input.description.trim()
    existing.functionalityIds = [...new Set(input.functionalityIds)]
    engine.log(state, 'Organização', actor(), `Perfil ${existing.name} atualizado`)
  }

  function createAccessProfile(name: string, description: string, functionalityIds: FunctionalityId[]) {
    if (!can('organizacao.acessos.gerir')) throw new Error('Sem permissão para gerir acessos')
    const normalized = name.trim()
    if (!normalized) throw new Error('Informe o nome do perfil')
    if (!tenantId()) throw new Error('Selecione a empresa antes de criar um perfil')
    if (state.accessProfiles.some(entry => entry.tenantId === tenantId() && entry.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) throw new Error('Já existe um perfil com este nome nesta empresa')
    const id = `profile-custom-${state.accessProfiles.length + 1}`
    state.accessProfiles.push({ id, tenantId: tenantId(), code: id, name: normalized, description: description.trim() || 'Perfil personalizado', system: false, functionalityIds: [...new Set(functionalityIds)] })
    engine.log(state, 'Organização', actor(), `Perfil ${normalized} criado`)
    return id
  }

  function assignProfile(userId: string, profileId: string, assigned: boolean) {
    if (!can('organizacao.acessos.gerir')) throw new Error('Sem permissão para gerir acessos')
    const profile = state.accessProfiles.find(entry => entry.id === profileId)
    const user = state.users.find(entry => entry.id === userId)
    if (!profile || !user) throw new Error('Usuário ou perfil não encontrado')
    if (profile.tenantId !== tenantId()) throw new Error('O perfil não pertence à empresa ativa')
    const current = state.userProfileAssignments.find(entry => entry.userId === userId && entry.profileId === profileId && entry.tenantId === tenantId())
    if (assigned && !current) state.userProfileAssignments.push({ id: `UP-${state.userProfileAssignments.length + 1}`, userId, tenantId: tenantId(), profileId })
    if (!assigned && current) state.userProfileAssignments = state.userProfileAssignments.filter(entry => entry !== current)
    engine.log(state, 'Organização', actor(), `Perfil ${profile.name} ${assigned ? 'atribuído a' : 'removido de'} ${user.name}`)
  }

  /* Leituras */
  const customerName = (id: string) => state.customers.find(entry => entry.id === id)?.name ?? id
  const item = (id: string) => engine.getItem(state, id)
  const itemLabel = (id: string) => {
    const entry = state.items.find(candidate => candidate.id === id)
    if (!entry) return id
    return entry.variant ? `${entry.name} · ${entry.variant}` : entry.name
  }
  const resourceName = (id: string) => state.resources.find(entry => entry.id === id)?.name ?? id
  const stage = (order: SalesOrder) => engine.orderStage(state, order)
  const progress = (order: SalesOrder) => engine.orderProgress(state, order)
  const risks = (order: SalesOrder) => engine.orderRisks(state, order)
  const opsOf = (orderId: string) => engine.opsOf(state, orderId)
  const available = (itemId: string) => engine.availableQty(state, itemId)
  const reserved = (itemId: string) => engine.reservedQty(state, itemId)
  const incoming = (itemId: string) => engine.incomingQty(state, itemId)
  const machineState = (resourceId: string) => engine.machineState(state, resourceId)
  const eventsOf = (orderId: string) => state.events.filter(event => event.orderId === orderId)
  const partnerName = (id: string) => state.partners.find(entry => entry.id === id)?.name ?? customerName(id)
  const serviceName = (id: string) => state.services.find(entry => entry.id === id)?.name ?? id
  const tasks = () => enterprise.tasksForRole(state, ui.role, ui.sessionUserId)

  /* Ações */
  function planOrder(orderId: string) {
    return run(() => {
      const result = engine.planOrder(state, orderId, actor())
      for (const id of result.ops) {
        const op = state.productionOrders.find(entry => entry.id === id)
        if (!op?.budgetCategoryId || !op.budgetPeriod) continue
        budget.upsertForecast(state, {
          categoryId: op.budgetCategoryId, period: op.budgetPeriod, amount: op.estimatedCost ?? 0,
          sourceModule: 'Produção', sourceType: `OP ${op.kind}`, sourceId: op.id,
          description: `${op.id} · ${itemLabel(op.itemId)}`,
        }, actor())
      }
      return result
    }, result => `Pedido planejado: ${result.ops.length} OP(s), ${result.requisitions.length} compra(s)`)
  }

  async function syncOmie() {
    ui.notify('info', 'Consultando o Omie…', 'Buscando pedidos aprovados desde a última sincronização')
    const orders = await omie.fetchApprovedOrders()
    run(() => engine.receiveOmieOrders(state, orders), count => count ? `${count} pedido(s) novo(s) importado(s) do Omie` : 'Nenhum pedido novo no Omie')
    const payments = await omie.fetchPaidInvoices()
    const applied = payments.map(payment => budget.applyOmiePayment(state, tenantId(), payment)).filter(Boolean).length
    if (payments.length) ui.notify(applied ? 'success' : 'info', `${applied} pagamento(s) conciliado(s)`, `${payments.length - applied} retido(s) na fila de exceção`)
    const categories = await omie.fetchCategories()
    const received = budget.applyRemoteCategories(state, tenantId(), categories)
    if (received.created || received.updated) ui.notify('success', 'Categorias conciliadas com o Omie', `${received.created} nova(s), ${received.updated} atualizada(s)`)
  }

  const createRequisition = (itemId: string, quantity: number, origin: string) =>
    run(() => engine.createRequisition(state, itemId, quantity, origin, engine.addDays(engine.today(), item(itemId).leadTimeDays ?? 7), actor()), req => `${req.id} criada: ${req.quantity} ${item(itemId).unit}`)
  const advanceRequisition = (id: string, who = actor()) => run(() => engine.advanceRequisition(state, id, who), req => `${req.id}: ${req.status}`)
  const pickOp = (id: string, operator = actor()) => run(() => engine.pickOp(state, id, operator), `${id} separada e liberada para a fábrica`)
  const scheduleOp = (id: string, resourceId: string, date: string) => run(() => engine.scheduleOp(state, id, resourceId, date, actor()), `${id} reprogramada`)
  const adjustStock = (itemId: string, counted: number, reason: string) => run(() => engine.adjustStock(state, itemId, counted, reason, actor()), 'Inventário ajustado e enviado ao Omie')

  const startOperation = (opId: string, operationId: string, operator: string) => run(() => engine.startOperation(state, opId, operationId, operator), 'Operação em andamento')
  const pauseOperation = (opId: string, operationId: string, reason: string, operator: string) => run(() => {
    const before = new Set(state.maintenanceOrders.map(entry => entry.id))
    const result = engine.pauseOperation(state, opId, operationId, reason, operator)
    for (const order of state.maintenanceOrders.filter(entry => !before.has(entry.id) && entry.budgetCategoryId && entry.budgetPeriod)) {
      budget.upsertForecast(state, {
        categoryId: order.budgetCategoryId!, period: order.budgetPeriod!, amount: order.estimatedCost ?? 0,
        sourceModule: 'Manutenção', sourceType: `OS ${order.type}`, sourceId: order.id, description: order.description,
      }, operator)
    }
    return result
  }, reason === 'Quebra de máquina' ? 'Parada registrada e manutenção acionada' : 'Parada registrada')
  const reportProduction = (opId: string, operationId: string, good: number, scrap: number, reason: string, operator: string) => run(() => engine.reportProduction(state, opId, operationId, good, scrap, reason, operator), 'Apontamento registrado')
  const finishOperation = (opId: string, operationId: string, operator: string) => run(() => engine.finishOperation(state, opId, operationId, operator), 'Operação concluída')
  const approveFirstPiece = (opId: string, operationId: string, inspector: string) => run(() => engine.approveFirstPiece(state, opId, operationId, inspector), 'Primeira peça liberada')
  const raiseAlert = (resourceId: string, operator: string, message: string) => run(() => engine.raiseAlert(state, resourceId, operator, message), 'Líder de produção avisado')
  const resolveAlert = (id: string) => run(() => engine.resolveAlert(state, id, actor()), 'Chamado atendido')

  const approveInspection = (opId: string, inspector = actor()) => run(() => engine.approveInspection(state, opId, inspector), `${opId} aprovada`)
  const rejectInspection = (opId: string, quantity: number, reason: string, inspector = actor()) => run(() => engine.rejectInspection(state, opId, quantity, reason, inspector), 'Não conformidade aberta e retrabalho enviado')
  const updateNc = (id: string, status: NonConformity['status'], action: string) => run(() => engine.updateNonConformity(state, id, status, action, actor()), `${id} atualizada`)

  const confirmShipment = (orderId: string, volumes: number, carrier: string, operator = actor()) => run(() => engine.confirmShipment(state, orderId, volumes, carrier, operator), 'Conferência registrada')

  async function shipOrder(orderId: string, operator = actor()) {
    const pending = run(() => engine.shipOrder(state, orderId, operator), 'Carga expedida. Aguardando NF-e do Omie…')
    if (!pending || pending === true) return
    const { invoice } = await omie.requestInvoice(engine.getOrder(state, orderId))
    engine.invoiceOrder(state, orderId, pending.id, invoice)
    ui.notify('success', `${invoice} emitida no Omie`, `Pedido ${orderId} faturado`)
  }

  const createMaintenance = (assetId: string, type: MaintenanceOrder['type'], description: string, estimatedCost = 1500, categoryId = 'BC-OPER', period = engine.today().slice(0, 7)) => run(() => {
    const order = engine.createMaintenance(state, assetId, type, description, 'Abertura manual', actor(), estimatedCost, categoryId, period)
    budget.upsertForecast(state, {
      categoryId, period, amount: estimatedCost, sourceModule: 'Manutenção', sourceType: `OS ${type}`,
      sourceId: order.id, description: order.description,
    }, actor())
    return order
  }, 'Ordem de manutenção aberta')
  const advanceMaintenance = (id: string, who = actor()) => run(() => engine.advanceMaintenance(state, id, who), 'Ordem de manutenção atualizada')
  const retrySync = (id: string) => run(() => engine.retrySync(state, id, actor()), 'Integração reprocessada')
  type Args<F> = F extends (state: ErpState, ...args: infer A) => unknown ? A extends [...infer Rest, string] ? Rest : never : never
  /** Liga uma regra de `enterprise` à store, injetando estado e usuário. */
  function bind<F extends (state: ErpState, ...args: never[]) => unknown>(rule: F, success?: string | ((result: ReturnType<F>) => string)) {
    return (...args: Args<F>) => run(() => (rule as unknown as (...all: unknown[]) => ReturnType<F>)(state, ...(args as unknown[]), actor()), success)
  }

  const createDemand = bind(enterprise.createDemand, demand => `${demand.id} criada`)
  const attendDemand = bind(enterprise.attendDemand, demand => `${demand.id}: ${demand.status}`)
  const attendDemandFromStock = bind(enterprise.attendDemandFromStock, demand => `${demand.id} atendida pelo estoque`)
  const contractService = bind(enterprise.contractService, demand => `${demand.id}: serviço contratado`)
  const completeDemand = bind(enterprise.completeDemand, demand => `${demand.id} concluída`)
  const cancelDemand = bind(enterprise.cancelDemand, demand => `${demand.id} cancelada`)
  const createPurchaseOrder = bind(enterprise.createPurchaseOrder, order => `${order.id} criado`)
  const selectQuote = bind(enterprise.selectQuote, 'Cotação escolhida')
  const cancelPurchaseOrder = bind(enterprise.cancelPurchaseOrder, order => `${order.id} cancelado`)
  const advancePurchaseOrder = (id: string, partial = false) =>
    run(() => enterprise.advancePurchaseOrder(state, id, actor(), partial), order => `${order.id}: ${order.status}`)
  const undoPick = bind(enterprise.undoPick, op => `${op.id}: separação desfeita`)
  const createOpportunity = bind(enterprise.createOpportunity, opportunity => `${opportunity.id} criada`)
  const updateOpportunity = bind(enterprise.updateOpportunity, 'Oportunidade atualizada')
  const moveOpportunity = bind(enterprise.moveOpportunity, opportunity => `${opportunity.id}: ${opportunity.stage}`)
  const advanceOpportunity = bind(enterprise.advanceOpportunity, opportunity => `${opportunity.id}: ${opportunity.stage}`)
  const loseOpportunity = bind(enterprise.loseOpportunity, 'Oportunidade marcada como perdida')
  const addActivity = bind(enterprise.addActivity, 'Atividade registrada')
  const toggleActivity = bind(enterprise.toggleActivity)
  const createProposal = bind(enterprise.createProposal, proposal => `${proposal.id} criada`)
  const updateProposal = bind(enterprise.updateProposal)
  const addProposalLine = bind(enterprise.addProposalLine, 'Linha adicionada')
  const updateProposalLine = bind(enterprise.updateProposalLine)
  const removeProposalLine = bind(enterprise.removeProposalLine, 'Linha removida')
  const advanceProposal = bind(enterprise.advanceProposal, proposal => proposal.status === 'Aceita' ? `${proposal.id} aceita: pedido ${proposal.salesOrderId} criado` : `${proposal.id}: ${proposal.status}`)
  const rejectProposal = bind(enterprise.rejectProposal, 'Proposta recusada')
  const createTechnicalOrder = bind(enterprise.createTechnicalOrder, order => `${order.id} aberto${order.warranty ? ' em garantia' : ''}`)
  const scheduleTechnicalOrder = bind(enterprise.scheduleTechnicalOrder, 'Atendimento agendado')
  const updateTechnicalOrder = bind(enterprise.updateTechnicalOrder, 'Registro técnico salvo')
  const addTechnicalPart = bind(enterprise.addTechnicalPart, order => order.status === 'Aguardando peça' ? 'Sem saldo: demanda aberta para Compras' : 'Peça baixada do estoque')
  const advanceTechnicalOrder = bind(enterprise.advanceTechnicalOrder, order => `${order.id}: ${order.status}`)
  const cancelTechnicalOrder = bind(enterprise.cancelTechnicalOrder, 'Chamado cancelado')
  const createProject = bind(enterprise.createProject, project => `${project.id} criado`)
  const addMilestone = bind(enterprise.addMilestone, 'Marco adicionado')
  const toggleMilestone = bind(enterprise.toggleMilestone, 'Marco atualizado')
  const setProjectStatus = bind(enterprise.setProjectStatus, project => `${project.id}: ${project.status}`)
  const addProjectRisk = bind(enterprise.addProjectRisk, 'Risco registrado')
  const createBudget = (input: { categoryId: string; period: string; amount: number; reason?: string }) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.setBudget(state, tenantId(), input.categoryId, input.period, input.amount, input.reason ?? 'Planejamento inicial', actor(), ui.role) }, 'Orçamento anual informado')
  const distributeGroupBudget = (group: string, period: string, amount: number, reason: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.setGroupBudget(state, tenantId(), group, period, amount, reason, actor(), ui.role) }, 'Orçamento anual dividido entre as categorias')
  const setAnnualBudget = (categoryId: string, period: string, amount: number) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.setBudget(state, tenantId(), categoryId, period, amount, 'Ajuste direto', actor(), ui.role) }, 'Orçamento anual informado')
  const adjustBudget = (id: string, amount: number, reason: string) => {
    const entry = state.budgets.find(item => item.id === id)
    return entry ? run(() => { requireFeature('orcamentos.gerir'); return budget.setBudget(state, tenantId(), entry.categoryId, entry.period, amount, reason, actor(), ui.role) }, 'Orçamento ajustado') : undefined
  }
  const createBudgetCategory = (input: Parameters<typeof budget.createBudgetCategory>[2]) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.createBudgetCategory(state, tenantId(), input, actor(), ui.role) }, 'Categoria criada')
  const updateBudgetCategory = (id: string, patch: Parameters<typeof budget.updateBudgetCategory>[3], reason: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.updateBudgetCategory(state, tenantId(), id, patch, reason, actor(), ui.role) }, 'Categoria atualizada')
  const configureBudget = (id: string, threshold: number, block: boolean) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.configureBudget(state, tenantId(), id, threshold, block, actor(), ui.role) }, 'Regra atualizada')
  const decideBudgetException = (id: string, approve: boolean, note: string, categoryId?: string) =>
    run(() => {
      const exception = state.budgetExceptions.find(entry => entry.id === id)
      requireFeature(exception?.kind === 'Saldo excedido' ? 'orcamentos.liberar_saldo' : 'orcamentos.gerir')
      return budget.decideBudgetException(state, tenantId(), id, approve, note, actor(), ui.role, categoryId)
    }, entry => entry.status === 'Resolvida'
      ? 'Pagamento reclassificado e lançado no realizado' : entry.status === 'Autorizada' ? 'Previsão liberada acima do saldo' : 'Exceção rejeitada')
  const acknowledgeBudgetAlert = (id: string) => run(() => budget.acknowledgeAlert(state, id, ui.sessionUserId, actor(), ui.role), 'Alerta marcado como ciente')
  const linkBudgetInvoice = (exceptionId: string, module: Parameters<typeof budget.linkBudgetInvoice>[3], documentId: string) =>
    run(() => budget.linkBudgetInvoice(state, tenantId(), exceptionId, module, documentId, actor(), ui.role), 'Nota vinculada ao documento')
  const applyBudgetGrowth = (categoryIds: string[], year: string, growthPct: number, reason = '') =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.applyGrowthToCategories(state, tenantId(), categoryIds, year, growthPct, reason, actor(), ui.role) }, applied => `${applied.length} categoria(s) atualizada(s) com ${growthPct}% sobre o realizado`)
  const applyRevenueTarget = (year: string, targetRevenue: number, reason = '') =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.applyRevenueTarget(state, tenantId(), year, targetRevenue, reason, actor(), ui.role) }, result => `Meta aplicada: ${result.growthPct >= 0 ? '+' : ''}${result.growthPct}% sobre ${year === '' ? '' : Number(year) - 1}`)
  const applyPriorSeasonality = (categoryIds: string[], year: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.applyPriorSeasonality(state, tenantId(), categoryIds, year, actor(), ui.role) }, applied => `Sazonalidade de ${Number(year) - 1} aplicada a ${applied.length} conta(s)`)
  const setMonthlyBudget = (categoryId: string, year: string, monthlyAmounts: number[], reason = '') =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.setMonthlyBudget(state, tenantId(), categoryId, year, monthlyAmounts, reason, actor(), ui.role) }, 'Distribuição mensal salva')
  const setCostCenterSplit = (categoryId: string, year: string, mode: 'percent' | 'amount', lines: { costCenterId: string; value: number }[]) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.setCostCenterSplit(state, tenantId(), categoryId, year, mode, lines, actor(), ui.role) }, 'Distribuição por centro de custo salva')
  const applyCategorySuggestion = (categoryId: string, year: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.applyCategorySuggestion(state, tenantId(), categoryId, year, actor(), ui.role) }, 'Centros sugeridos pelo realizado anterior')
  const saveBudgetSimulation = (year: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.saveBudgetSimulation(state, tenantId(), year, actor(), ui.role) }, 'Simulação salva')
  const applyBudgetSimulation = (year: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.applyBudgetSimulation(state, tenantId(), year, actor(), ui.role) }, 'Simulação aplicada ao orçamento')
  const createCostCenter = (code: string, name: string, responsibleUserId: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.createCostCenter(state, tenantId(), { code, name, responsibleUserId }, actor(), ui.role) }, 'Centro de custo criado')
  const updateCostCenter = (id: string, name: string, status: 'Ativo' | 'Inativo', responsibleUserId: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.updateCostCenter(state, tenantId(), id, { name, status, responsibleUserId }, actor(), ui.role) }, 'Centro de custo atualizado')
  const setSectorDefaultCostCenter = (sectorId: string, code: string) =>
    run(() => { requireFeature('orcamentos.gerir'); return budget.setSectorDefaultCostCenter(state, tenantId(), sectorId, code, actor(), ui.role) }, 'Centro padrão do setor atualizado')
  const requireGroupPlanning = () => { requireFeature('orcamentos.consultar_consolidado'); requireFeature('orcamentos.gerir') }
  const applyGroupGrowth = (groupId: string, year: string, growthPct: number, reason = '') =>
    run(() => { requireGroupPlanning(); return budget.applyGroupGrowth(state, groupId, year, growthPct, reason, actor(), ui.role) }, perTenant => `Planejamento aplicado a ${perTenant.length} empresa(s) do grupo`)
  const applyGroupRevenueTarget = (groupId: string, year: string, targetRevenue: number, reason = '') =>
    run(() => { requireGroupPlanning(); return budget.applyGroupRevenueTarget(state, groupId, year, targetRevenue, reason, actor(), ui.role) }, result => `Meta do grupo aplicada: ${result.growthPct >= 0 ? '+' : ''}${result.growthPct}% a cada empresa`)
  const createUser = bind(enterprise.createUser, user => `${user.name} cadastrado · PIN ${user.pin}`)
  const updateUser = bind(enterprise.updateUser, 'Cadastro atualizado')
  const createPartner = bind(enterprise.createPartner, partner => `${partner.name} cadastrado`)
  const createService = bind(enterprise.createService, service => `${service.code} criado`)
  const updateService = bind(enterprise.updateService, 'Serviço atualizado')
  const createAsset = bind(enterprise.createAsset, asset => `${asset.name} cadastrado`)
  const updateAsset = bind(enterprise.updateAsset, 'Ativo atualizado')
  const eventsFor = (ref: string) => state.events.filter(event => event.ref === ref)
  const userName = (id?: string) => state.users.find(entry => entry.id === id)?.name ?? '—'

  /** Ações do cadastro levam o papel atual: a permissão é conferida na regra, não só na tela. */
  const requireFeature = (feature: FunctionalityId) => {
    if (!can(feature)) throw new Error('Seu perfil não possui esta funcionalidade')
  }
  const as = <T>(action: (actorName: string, role: Role) => T, success?: string | ((result: T) => string), feature?: FunctionalityId) =>
    run(() => { if (feature) requireFeature(feature); return action(actor(), ui.role) }, success)
  const releaseRevision = (revisionId: string, validFrom?: string) => as((name, role) => {
    const revision = state.productRevisions.find(entry => entry.id === revisionId)
    if (revision && !catalog.canEdit(role, 'manufatura')) throw new Error(`O perfil ${role} não libera estrutura. Quem libera: ${catalog.editorsLabel('manufatura')}`)
    return enterprise.releaseRevision(state, revisionId, name, validFrom)
  }, revision => `Versão ${revision.code} liberada`)
  const newRevision = (itemId: string, notes = '') => as((name, role) => catalog.openBomVersion(state, itemId, notes, name, role), revision => `Versão ${revision.code} aberta em rascunho`)
  const toggleRevisionCheck = (revisionId: string, label: string) => as((_name, role) => catalog.toggleRevisionCheck(state, revisionId, label, role))
  const setBomLine = (revisionId: string, componentId: string, quantity: number, loss?: number) => as((name, role) => catalog.setBomLine(state, revisionId, componentId, quantity, name, role, loss))
  const removeBomLine = (revisionId: string, componentId: string) => as((name, role) => catalog.removeBomLine(state, revisionId, componentId, name, role))
  const discardBomVersion = (revisionId: string) => as((name, role) => catalog.discardBomVersion(state, revisionId, name, role), 'Versão descartada')

  const createCatalogItem = (input: catalog.NewItemInput) => as((name, role) => catalog.createItem(state, input, name, role), item => `${item.code} salvo como rascunho`, 'produtos.editar')
  const updateItemCore = (itemId: string, patch: catalog.CorePatch) => as((name, role) => catalog.updateCore(state, itemId, patch, name, role), 'Núcleo salvo', 'produtos.editar')
  const updateItemCommercial = (itemId: string, patch: Parameters<typeof catalog.updateCommercial>[2]) => as((name, role) => catalog.updateCommercial(state, itemId, patch, name, role), 'Camada comercial salva', 'produtos.editar')
  const updateItemFiscal = (itemId: string, patch: Parameters<typeof catalog.updateFiscal>[2]) => as((name, role) => catalog.updateFiscal(state, itemId, patch, name, role), 'Camada fiscal salva', 'produtos.editar')
  const updateItemStock = (itemId: string, patch: catalog.StockPatch) => as((name, role) => catalog.updateStockLayer(state, itemId, patch, name, role), 'Estoque salvo', 'produtos.editar')
  const updateItemBranch = (itemId: string, branch: string, patch: Parameters<typeof catalog.updateBranch>[3]) => as((name, role) => catalog.updateBranch(state, itemId, branch, patch, name, role), 'Filial salva')
  const addItemConversion = (itemId: string, conversion: UnitConversion) => as((name, role) => catalog.addConversion(state, itemId, conversion, name, role), 'Conversão adicionada')
  const removeItemConversion = (itemId: string, index: number) => as((name, role) => catalog.removeConversion(state, itemId, index, name, role), 'Conversão removida')
  const requestKeyChange = (itemId: string, field: 'unit' | 'ncm', to: string, reason: string) => as((name, role) => catalog.requestKeyChange(state, itemId, field, to, reason, name, role), 'Exceção enviada para aprovação')
  const decideKeyChange = (itemId: string, requestId: string, approve: boolean, note: string) => as((name, role) => catalog.decideKeyChange(state, itemId, requestId, approve, note, name, role), approve ? 'Exceção aprovada e aplicada' : 'Exceção recusada')
  const submitItem = (itemId: string) => as((name, role) => catalog.submitItem(state, itemId, name, role), 'Item enviado para homologação')
  const approveItem = (itemId: string, approval: ApprovalRole) => as((name, role) => catalog.approveItem(state, itemId, approval, name, role), result => result === 'Ativo' ? 'Aprovação registrada: item ativado' : 'Aprovação registrada')
  const finishActivation = (itemId: string) => as((name, role) => catalog.finishActivation(state, itemId, name, role), 'Item ativado')
  const returnItem = (itemId: string, reason: string) => as((name, role) => catalog.returnItem(state, itemId, reason, name, role), 'Item devolvido a rascunho')
  const blockItem = (itemId: string, reason: string) => as((name, role) => catalog.blockItem(state, itemId, reason, name, role), 'Item bloqueado')
  const reactivateItem = (itemId: string, reason: string) => as((name, role) => catalog.reactivateItem(state, itemId, reason, name, role), 'Item reativado')
  const obsoleteItem = (itemId: string, reason: string) => as((name, role) => catalog.obsoleteItem(state, itemId, reason, name, role), 'Item obsoletado')
  const inactivateItem = (itemId: string, reason: string) => as((name, role) => catalog.inactivateItem(state, itemId, reason, name, role), 'Item inativado')
  const deleteItem = (itemId: string, reason: string) => as((name, role) => catalog.deleteItem(state, itemId, reason, name, role), kind => kind === 'física' ? 'Item apagado: nunca tinha sido usado' : 'Item excluído logicamente: o histórico fica preservado')
  const restoreItem = (itemId: string) => as((name, role) => catalog.restoreItem(state, itemId, name, role), 'Item restaurado')
  const createClass = (nameValue: string, parentId?: string) => as((name, role) => catalog.createClass(state, nameValue, parentId, name, role), node => `${node.name} criado`)
  const renameClass = (classId: string, nameValue: string) => as((name, role) => catalog.renameClass(state, classId, nameValue, name, role), 'Nó renomeado')
  const removeClass = (classId: string) => as((name, role) => catalog.removeClass(state, classId, name, role), 'Nó removido')

  type ExtArgs<F> = F extends (state: ErpState, ...args: infer A) => unknown ? Required<A> extends [...infer Rest, string, Role] ? Rest : never : never
  /** Liga uma regra das camadas estendidas: estado, usuário e papel entram sozinhos. */
  function ext<F extends (state: ErpState, ...args: never[]) => unknown>(rule: F, success?: string | ((result: ReturnType<F>) => string)) {
    return (...args: ExtArgs<F>) => as((name, role) => (rule as unknown as (...all: unknown[]) => ReturnType<F>)(state, ...(args as unknown[]), name, role), success)
  }
  const addBarcode = ext(extensions.addBarcode, 'Código de barras incluído')
  const removeBarcode = ext(extensions.removeBarcode, 'Código de barras removido')
  const setMainBarcode = ext(extensions.setMainBarcode, 'EAN principal alterado')
  const createPriceTable = ext(extensions.createPriceTable, table => `Tabela ${table.name} criada`)
  const setPrice = ext(extensions.setPrice, 'Preço lançado')
  const removePrice = ext(extensions.removePrice, 'Preço programado removido')
  const setStandardCost = ext(extensions.setStandardCost, 'Custo-padrão lançado')
  const updateProductionLead = ext(extensions.updateProductionLead, 'Lead time de produção salvo')
  const saveRoutingStep = ext(extensions.saveRoutingStep, 'Roteiro salvo')
  const removeRoutingStep = ext(extensions.removeRoutingStep, 'Operação removida do roteiro')
  const moveRoutingStep = ext(extensions.moveRoutingStep)
  const addMedia = ext(extensions.addMedia, media => `${media.kind} anexada`)
  const removeMedia = ext(extensions.removeMedia, 'Arquivo removido')
  const moveMedia = ext(extensions.moveMedia)
  const setMainMedia = ext(extensions.setMainMedia, 'Foto principal definida')
  const linkProject = ext(extensions.linkProject, 'Projeto vinculado')
  const unlinkProject = ext(extensions.unlinkProject, 'Vínculo removido')
  const addBenefit = ext(extensions.addBenefit, 'Benefício fiscal incluído')
  const removeBenefit = ext(extensions.removeBenefit, 'Benefício removido')
  const addReformEntry = ext(extensions.addReformEntry, 'Camada da reforma atualizada')
  const removeReformEntry = ext(extensions.removeReformEntry, 'Programação removida')
  const addFiscalRule = ext(extensions.addFiscalRule, 'Regra incluída na matriz fiscal')
  const removeFiscalRule = ext(extensions.removeFiscalRule, 'Regra removida da matriz')
  const createModel = ext(extensions.createModel, model => `Grade ${model.name} criada`)
  const generateVariants = ext(extensions.generateVariants, items => `${items.length} variante(s) criada(s) em rascunho`)
  const setMediaUsage = ext(extensions.setMediaUsage, 'Uso do documento salvo')
  const saveClassAttribute = ext(catalog.saveClassAttribute, def => `Atributo ${def.label} salvo`)
  const removeClassAttribute = ext(catalog.removeClassAttribute, 'Atributo removido')
  const setItemAttributes = ext(catalog.setItemAttributes, 'Atributos salvos')
  const saveTooling = ext(engineering.saveTooling, 'Ferramental salvo')
  const saveRevisionStep = ext(engineering.saveRevisionStep, 'Operação salva na versão')
  const removeRevisionStep = ext(engineering.removeRevisionStep, 'Operação removida da versão')
  const moveRevisionStep = ext(engineering.moveRevisionStep)
  const copyRoutingFrom = ext(engineering.copyRoutingFrom, steps => `${steps.length} operação(ões) copiada(s)`)
  const savePackaging = ext(engineering.savePackaging, 'Embalagem salva')
  const createChange = ext(engineering.createChange, change => `${change.id} solicitada`)
  const updateChange = ext(engineering.updateChange, 'Mudança atualizada')
  const openChangeRevision = ext(engineering.openChangeRevision, revision => `Versão ${revision.code} vinculada à mudança`)
  const moveChange = ext(engineering.moveChange, change => `${change.id} · ${change.stage}`)
  const resolveFiscalConflict = ext(engineering.resolveFiscalConflict, 'Conflito fiscal resolvido')

  function pushFiscal(itemId: string) {
    const entry = item(itemId)
    return as((name, role) => {
      engineering.pushFiscal(state, itemId, name, role)
      engine.addSyncLog(state, { entity: 'Produto', reference: entry.code, direction: 'Thalamus → Omie', status: 'sincronizado', message: 'Camada fiscal enviada ao Omie' })
    }, 'Fiscal enviado ao Omie')
  }

  /** Simula o webhook do Omie avisando que alguém alterou o fiscal do produto lá. */
  function simulateOmieFiscal(itemId: string, remote: Partial<FiscalSnapshot>) {
    const entry = item(itemId)
    return run(() => {
      const result = engineering.receiveOmieFiscal(state, itemId, remote)
      engine.addSyncLog(state, { entity: 'Produto', reference: entry.code, direction: 'Omie → Thalamus', status: result === 'conflito' ? 'erro' : 'sincronizado', message: result === 'conflito' ? 'Fiscal alterado no Omie com alteração local pendente: conflito' : result === 'aplicado' ? 'Fiscal atualizado a partir do Omie' : 'Sem diferença' })
      return result
    }, result => result === 'conflito' ? 'O Omie mudou o fiscal e há alteração local pendente: conflito aberto' : result === 'aplicado' ? 'Alteração fiscal recebida do Omie' : 'O Omie já estava igual')
  }

  type BulkAction = 'submit' | 'approve' | 'block' | 'obsolete' | 'reclassify'
  /** Executa a mesma ação em vários itens; cada item passa pelas mesmas regras e as recusas voltam com o motivo. */
  function bulkItems(ids: string[], action: BulkAction, payload: { reason?: string; classId?: string } = {}) {
    const done: string[] = []
    const failed: { code: string; reason: string }[] = []
    for (const id of ids) {
      const target = state.items.find(entry => entry.id === id)
      if (!target) continue
      try {
        if (action === 'submit') catalog.submitItem(state, id, actor(), ui.role)
        if (action === 'block') catalog.blockItem(state, id, payload.reason ?? '', actor(), ui.role)
        if (action === 'obsolete') catalog.obsoleteItem(state, id, payload.reason ?? '', actor(), ui.role)
        if (action === 'approve') {
          const pending = catalog.requiredApprovals(target).filter(role => !target.catalog?.approvals[role] && catalog.canApprove(ui.role, role))
          if (!pending.length) throw new Error('Nenhuma aprovação pendente para o seu papel')
          for (const role of pending) catalog.approveItem(state, id, role, actor(), ui.role)
        }
        if (action === 'reclassify') {
          const current = catalog.catalogOf(target)
          catalog.updateCore(state, id, { name: target.name, type: target.type, unit: target.unit, classId: payload.classId ?? current.classId }, actor(), ui.role)
        }
        done.push(target.code)
      } catch (error) {
        failed.push({ code: target.code, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    if (done.length) ui.notify('success', `${done.length} item(ns) atualizados`, failed.length ? `${failed.length} recusado(s): veja o motivo na lista` : undefined)
    else if (failed.length) ui.notify('error', 'Nenhum item atualizado', failed[0].reason)
    return { done, failed }
  }

  function publishItem(itemId: string) {
    const entry = item(itemId)
    const { id } = engine.addSyncLog(state, { entity: 'Produto', reference: entry.code, direction: 'Thalamus → Omie', status: 'pendente', message: 'Enviando cadastro…' })
    ui.notify('info', 'Enviando cadastro ao Omie…')
    setTimeout(() => {
      const sync = state.syncLogs.find(log => log.id === id)
      if (!sync) return
      sync.status = 'sincronizado'
      sync.message = `Cadastro${entry.revision ? ` revisão ${entry.revision}` : ''} atualizado no Omie`
      ui.notify('success', `${entry.code} sincronizado com o Omie`)
    }, 1500)
  }

  function createCompany(input: Parameters<typeof provisionCompany>[1]) {
    return run(() => {
      if (!isPlatformMaster()) throw new Error('Somente o usuário mestre cadastra empresas')
      const created = provisionCompany(state, input)
      engine.log(state, 'Plataforma', actor(), `Empresa ${input.tradeName || input.legalName} cadastrada`)
      return created.tenantId
    })
  }

  function saveGroup(input: Parameters<typeof saveEconomicGroup>[1]) {
    return run(() => {
      if (!isPlatformMaster()) throw new Error('Somente o usuário mestre cadastra grupos econômicos')
      saveEconomicGroup(state, input)
      engine.log(state, 'Plataforma', actor(), `Grupo econômico ${input.name} atualizado`)
    }, 'Grupo econômico salvo')
  }

  function configureOmie(tenant: string, appKey: string, accountLabel: string, secretProvided: boolean) {
    return run(() => {
      if (!isPlatformMaster()) throw new Error('Somente o usuário mestre configura o Omie')
      saveOmieConnection(state, tenant, appKey, accountLabel, secretProvided)
      engine.log(state, 'Plataforma', actor(), `Vínculo Omie da empresa ${tenant} atualizado`)
    }, 'Vínculo Omie registrado. A conexão real ainda é simulação.')
  }

  function resetDemo() {
    Object.assign(state, createSeedState())
    localStorage.removeItem(STORAGE_KEY)
    ui.notify('success', 'Demonstração restaurada', 'Todos os dados voltaram ao cenário inicial')
  }

  return {
    state, customerName, partnerName, serviceName, item, itemLabel, resourceName, stage, progress, risks, opsOf, available, reserved, incoming, tasks,
    machineState, eventsOf, can, isAccessAdministrator, isPlatformMaster, effectiveProfiles, previewProfile, enterPlatform, enterCompany, saveAccessProfile, createAccessProfile, assignProfile,
    createCompany, saveGroup, configureOmie,
    planOrder, syncOmie, advanceRequisition, pickOp, scheduleOp, adjustStock, startOperation,
    pauseOperation, reportProduction, finishOperation, approveFirstPiece, raiseAlert, resolveAlert, approveInspection, rejectInspection,
    updateNc, confirmShipment, shipOrder, createMaintenance, advanceMaintenance, retrySync, resetDemo,
    newRevision, toggleRevisionCheck, publishItem, createRequisition, releaseRevision, undoPick, eventsFor, userName,
    createCatalogItem, updateItemCore, updateItemCommercial, updateItemFiscal, updateItemStock, updateItemBranch, addItemConversion, removeItemConversion,
    requestKeyChange, decideKeyChange, submitItem, approveItem, finishActivation, returnItem, blockItem, reactivateItem, obsoleteItem, inactivateItem,
    deleteItem, restoreItem, createClass, renameClass, removeClass, bulkItems, setBomLine, removeBomLine, discardBomVersion,
    addBarcode, removeBarcode, setMainBarcode, createPriceTable, setPrice, removePrice, setStandardCost, updateProductionLead,
    saveRoutingStep, removeRoutingStep, moveRoutingStep, addMedia, removeMedia, moveMedia, setMainMedia, linkProject, unlinkProject,
    addBenefit, removeBenefit, addReformEntry, removeReformEntry, addFiscalRule, removeFiscalRule, createModel, generateVariants,
    setMediaUsage, saveClassAttribute, removeClassAttribute, setItemAttributes, saveTooling, saveRevisionStep, removeRevisionStep, moveRevisionStep, copyRoutingFrom,
    savePackaging, createChange, updateChange, openChangeRevision, moveChange, resolveFiscalConflict, pushFiscal, simulateOmieFiscal,
    createDemand, attendDemand, attendDemandFromStock, contractService, completeDemand, cancelDemand,
    createPurchaseOrder, selectQuote, cancelPurchaseOrder, advancePurchaseOrder,
    createOpportunity, updateOpportunity, moveOpportunity, advanceOpportunity, loseOpportunity, addActivity, toggleActivity,
    createProposal, updateProposal, addProposalLine, updateProposalLine, removeProposalLine, advanceProposal, rejectProposal,
    createTechnicalOrder, scheduleTechnicalOrder, updateTechnicalOrder, addTechnicalPart, advanceTechnicalOrder, cancelTechnicalOrder,
    createProject, addMilestone, toggleMilestone, setProjectStatus, addProjectRisk,
    createBudget, distributeGroupBudget, setAnnualBudget, adjustBudget, createBudgetCategory, updateBudgetCategory, configureBudget, decideBudgetException, acknowledgeBudgetAlert, linkBudgetInvoice,
    applyBudgetGrowth, applyRevenueTarget, applyPriorSeasonality, setMonthlyBudget, setCostCenterSplit, applyCategorySuggestion, saveBudgetSimulation, applyBudgetSimulation, createCostCenter, updateCostCenter, setSectorDefaultCostCenter, applyGroupGrowth, applyGroupRevenueTarget,
    createUser, updateUser, createPartner, createService, updateService, createAsset, updateAsset,
  }
})
