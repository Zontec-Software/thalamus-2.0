import { APPROVER, currentPrice, hasRouting, requiredApprovals } from './catalog'
import { explodeKitLines } from './catalogExtensions'
import { hasFullAccess } from './access'
import * as budgetDomain from './budget'
import type { ErpState } from './engine'
import { addDays, addSyncLog, applyDueRevisions, assertUsable, availableQty, consumeStock, DomainError, getItem, getOp, log, nextId, now, receiveStock, today } from './engine'
import { assertClientOpen, assertPurchaseAllowed, assertSupplierOpen } from './partners'
import { fieldVisitService } from './services'
import { assertResourceChoice } from './resources'
import type {
  Asset, Budget, CrmActivity, Demand, Item, Opportunity, Project, Proposal, ProposalLine,
  PurchaseOrder, Role, TechnicalServiceOrder, User,
} from '../types/domain'

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const find = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const entry = list.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError(`${label} não encontrado(a)`)
  return entry
}

/* ---------- Orçamento ---------- */

export function budgetFor(state: ErpState, input: { projectId?: string; category?: string; budgetId?: string }) {
  if (input.budgetId) return state.budgets.find(entry => entry.id === input.budgetId)
  const project = input.projectId ? state.projects.find(entry => entry.id === input.projectId) : undefined
  if (project?.budgetId) return state.budgets.find(entry => entry.id === project.budgetId)
  return state.budgets.find(entry => entry.categoryId === 'BC-CMV' && entry.period === budgetDomain.monthOf().slice(0, 4))
}

function commit(state: ErpState, budget: Budget | undefined, amount: number, actor: string, reference: string, sourceIds: string[]) {
  if (budgetDomain.isHeld(state, sourceIds)) throw new DomainError('Previsão retida por falta de saldo. Aguarde a liberação do Gestor em Orçamentos.')
  if (!budget) return
  const summary = budgetDomain.budgetSummary(state, budget.categoryId, budget.period)
  if (budget.blockOnOverrun && summary.balance < 0) throw new DomainError(`Orçamento sem saldo: disponível ${money(summary.balance)}`)
  log(state, 'Orçamentos', actor, `${reference} formalizado sem duplicar a previsão de ${money(amount)}`, undefined, budget.id)
}

function realize(state: ErpState, budget: Budget | undefined, amount: number, actor: string, reference: string) {
  if (!budget) return
  log(state, 'Orçamentos', actor, `${reference} concluído; ${money(amount)} aguarda pagamento do Omie`, undefined, budget.id)
}

export function createBudget(state: ErpState, input: { categoryId: string; period: string; amount: number; reason?: string }, actor: string) {
  const tenantId = budgetDomain.categoryOf(state, input.categoryId).tenantId
  return budgetDomain.setBudget(state, tenantId, input.categoryId, input.period, input.amount, input.reason ?? 'Planejamento inicial', actor, 'Financeiro')
}

export function adjustBudget(state: ErpState, id: string, amount: number, reason: string, actor: string) {
  const budget = find(state.budgets, id, 'Orçamento')
  return budgetDomain.setBudget(state, budget.tenantId, budget.categoryId, budget.period, amount, reason, actor, 'Financeiro')
}

/* ---------- Demandas ---------- */

type DemandInput = Pick<Demand, 'kind' | 'itemId' | 'serviceId' | 'description' | 'quantity' | 'origin' | 'originId' | 'neededBy' | 'priority' | 'assigneeRole'>
  & Partial<Pick<Demand, 'requester' | 'projectId' | 'notes' | 'estimatedCost' | 'budgetCategoryId' | 'budgetPeriod'>>

export function createDemand(state: ErpState, input: DemandInput, actor: string) {
  if (!input.description.trim()) throw new DomainError('Descreva a necessidade')
  if (input.quantity <= 0) throw new DomainError('Informe uma quantidade válida')
  if (input.kind === 'Material' && !input.itemId) throw new DomainError('Escolha o material')
  if (input.itemId) assertUsable(getItem(state, input.itemId), 'consumo')
  if (input.kind === 'Serviço' && !input.serviceId) throw new DomainError('Escolha o serviço')
  const projectId = input.projectId ?? (input.origin === 'Projeto' ? input.originId : undefined)
  const estimate = input.estimatedCost
    ?? (input.itemId ? getItem(state, input.itemId).cost * input.quantity : undefined)
    ?? (input.serviceId ? (state.services.find(entry => entry.id === input.serviceId)?.cost ?? 0) * input.quantity : undefined)
  const categoryId = input.budgetCategoryId
    ?? (input.origin === 'Projeto' ? (input.kind === 'Material' ? 'BC-MAT-PD' : 'BC-PD')
      : input.origin === 'Oportunidade' ? (input.kind === 'Material' ? 'BC-CMV' : 'BC-PD')
        : input.origin === 'Manutenção' ? 'BC-OPER'
        : input.origin === 'Assistência' ? 'BC-GARANTIA'
          : input.kind === 'Material' ? 'BC-CMV' : 'BC-OPER')
  const period = input.budgetPeriod ?? input.neededBy.slice(0, 7)
  const demand: Demand = { id: nextId(state, 'DM'), status: 'Aberta', createdAt: now(), ...input, requester: input.requester ?? actor, projectId, estimatedCost: estimate, budgetCategoryId: categoryId, budgetPeriod: period }
  budgetDomain.upsertForecast(state, {
    categoryId, period, amount: estimate ?? 0, sourceModule: 'Demandas', sourceType: input.kind, sourceId: demand.id,
    description: demand.description, projectId,
  }, actor)
  state.demands.unshift(demand)
  log(state, 'Demandas', actor, `${demand.id} aberta: ${demand.description} (${demand.origin}${demand.originId ? ` ${demand.originId}` : ''})`, undefined, demand.id)
  if (demand.originId) log(state, 'Demandas', actor, `Necessidade ${demand.id} registrada`, undefined, demand.originId)
  return demand
}

export function attendDemandFromStock(state: ErpState, id: string, actor: string) {
  const demand = find(state.demands, id, 'Demanda')
  if (!demand.itemId) throw new DomainError('Somente demandas de material podem sair do estoque')
  if (demand.status !== 'Aberta') throw new DomainError('A demanda já está em atendimento')
  const item = getItem(state, demand.itemId)
  const free = availableQty(state, item.id)
  if (free < demand.quantity) throw new DomainError(`Saldo livre insuficiente: ${free} ${item.unit}. Gere uma compra.`)
  assertUsable(item, 'consumo')
  const lots = consumeStock(state, item, demand.quantity)
  state.movements.unshift({ id: nextId(state, 'MV'), itemId: item.id, type: 'Saída', quantity: -demand.quantity, reference: demand.id, at: now(), lots })
  demand.status = 'Atendida'
  demand.resolution = `Atendida pelo estoque (${item.location})`
  budgetDomain.cancelForecast(state, 'Demandas', demand.id, 'Atendida pelo estoque', actor)
  log(state, 'Almoxarifado', actor, `${demand.id} atendida pelo estoque: ${demand.quantity} ${item.unit} de ${item.name}`, undefined, demand.id)
  if (demand.originId) {
    log(state, 'Almoxarifado', actor, `${demand.id} entregue pelo almoxarifado`, undefined, demand.originId)
    const technical = state.technicalServiceOrders.find(entry => entry.id === demand.originId)
    const part = technical?.parts?.find(entry => entry.itemId === item.id && !entry.consumed)
    if (technical && part) {
      part.consumed = true
      if (technical.status === 'Aguardando peça' && technical.parts!.every(entry => entry.consumed)) technical.status = 'Agendada'
    }
  }
  return demand
}

export function contractService(state: ErpState, id: string, supplierId: string, actor: string) {
  const demand = find(state.demands, id, 'Demanda')
  if (demand.kind !== 'Serviço' || !demand.serviceId) throw new DomainError('Esta demanda não é de serviço')
  if (demand.status !== 'Aberta') throw new DomainError('A demanda já está em atendimento')
  assertSupplierOpen(state, supplierId)
  const service = find(state.services, demand.serviceId, 'Serviço')
  const amount = service.cost * demand.quantity
  const budget = budgetFor(state, { projectId: demand.projectId, category: 'Serviço' }) ?? budgetFor(state, { category: 'Material' })
  commit(state, budget, amount, actor, demand.id, [demand.id])
  demand.status = 'Em atendimento'
  demand.supplierId = supplierId
  demand.resolution = `Contratado com ${state.partners.find(entry => entry.id === supplierId)?.name ?? supplierId}`
  log(state, 'Compras', actor, `${demand.id}: ${service.name} contratado (${money(amount)})`, undefined, demand.id)
  return demand
}

export function completeDemand(state: ErpState, id: string, actor: string) {
  const demand = find(state.demands, id, 'Demanda')
  if (demand.status !== 'Em atendimento') throw new DomainError('A demanda precisa estar em atendimento')
  if (demand.purchaseOrderId) throw new DomainError('Esta demanda será concluída pelo recebimento do pedido de compra')
  demand.status = 'Atendida'
  if (demand.kind === 'Serviço' && demand.serviceId) {
    const service = find(state.services, demand.serviceId, 'Serviço')
    const amount = service.cost * demand.quantity
    const budget = budgetFor(state, { projectId: demand.projectId, category: 'Serviço' }) ?? budgetFor(state, { category: 'Material' })
    realize(state, budget, amount, actor, demand.id)
  }
  log(state, 'Demandas', actor, `${demand.id} concluída`, undefined, demand.id)
  return demand
}

export function cancelDemand(state: ErpState, id: string, reason: string, actor: string) {
  const demand = find(state.demands, id, 'Demanda')
  if (!reason.trim()) throw new DomainError('Informe o motivo do cancelamento')
  if (demand.status === 'Atendida' || demand.status === 'Cancelada') throw new DomainError('A demanda já foi encerrada')
  if (demand.purchaseOrderId) {
    const order = state.purchaseOrders.find(entry => entry.id === demand.purchaseOrderId)
    if (order && order.status !== 'Cancelado' && order.status !== 'Aguardando aprovação') throw new DomainError(`Cancele antes o pedido ${order.id}`)
    if (order) order.status = 'Cancelado'
  }
  demand.status = 'Cancelada'
  demand.resolution = reason
  budgetDomain.cancelForecast(state, 'Demandas', demand.id, reason, actor)
  log(state, 'Demandas', actor, `${demand.id} cancelada: ${reason}`, undefined, demand.id)
  return demand
}

/** Mantido para compatibilidade: abre ou conclui a demanda conforme o estado. */
export function attendDemand(state: ErpState, id: string, actor: string) {
  const demand = find(state.demands, id, 'Demanda')
  if (demand.status === 'Atendida' || demand.status === 'Cancelada') throw new DomainError('Esta demanda já foi encerrada')
  if (demand.status === 'Aberta') {
    demand.status = 'Em atendimento'
    log(state, 'Demandas', actor, `${demand.id}: em atendimento`, undefined, demand.id)
    return demand
  }
  return completeDemand(state, id, actor)
}

/* ---------- Compras ---------- */

export function createPurchaseOrder(state: ErpState, demandId: string, supplierId: string, actor: string) {
  const demand = find(state.demands, demandId, 'Demanda')
  if (!demand.itemId) throw new DomainError('A demanda precisa ter um material')
  if (demand.status !== 'Aberta') throw new DomainError('A demanda já está em atendimento')
  const item = getItem(state, demand.itemId)
  assertUsable(item, 'compra')
  assertPurchaseAllowed(state, supplierId, item.id)
  const lead = item.leadTimeDays ?? 7
  const other = state.partners.find(entry => entry.roles.includes('Fornecedor') && entry.id !== supplierId)
  const budget = demand.budgetCategoryId && demand.budgetPeriod ? budgetDomain.allocationOf(state, demand.budgetCategoryId, demand.budgetPeriod) : undefined
  const order: PurchaseOrder = {
    id: nextId(state, 'PC'), supplierId, demandIds: [demand.id], itemId: item.id, quantity: demand.quantity, received: 0,
    unitPrice: item.cost, promisedDate: addDays(today(), lead), status: 'Aguardando aprovação', projectId: demand.projectId, budgetId: budget?.id,
    quotes: [
      { supplierId, unitPrice: item.cost, leadDays: lead, selected: true },
      ...(other ? [{ supplierId: other.id, unitPrice: Math.round(item.cost * 1.08 * 100) / 100, leadDays: Math.max(2, lead - 2), selected: false }] : []),
    ],
    createdAt: now(),
  }
  state.purchaseOrders.unshift(order)
  demand.status = 'Em atendimento'
  demand.purchaseOrderId = order.id
  demand.supplierId = supplierId
  log(state, 'Compras', actor, `${order.id} criado para atender ${demand.id}`, undefined, order.id)
  log(state, 'Compras', actor, `Pedido de compra ${order.id} emitido (${money(order.quantity * order.unitPrice)})`, undefined, demand.id)
  if (demand.projectId) log(state, 'Compras', actor, `${order.id} vinculado ao projeto`, undefined, demand.projectId)
  return order
}

export function selectQuote(state: ErpState, orderId: string, supplierId: string, actor: string) {
  const order = find(state.purchaseOrders, orderId, 'Pedido de compra')
  if (order.status !== 'Aguardando aprovação') throw new DomainError('A cotação só pode mudar antes da aprovação')
  const quote = order.quotes.find(entry => entry.supplierId === supplierId)
  if (!quote) throw new DomainError('Cotação não encontrada')
  assertPurchaseAllowed(state, supplierId, order.itemId)
  order.quotes.forEach(entry => { entry.selected = entry === quote })
  order.supplierId = supplierId
  order.unitPrice = quote.unitPrice
  order.promisedDate = addDays(today(), quote.leadDays)
  for (const demandId of order.demandIds) {
    const demand = state.demands.find(entry => entry.id === demandId)
    if (!demand?.budgetCategoryId || !demand.budgetPeriod) continue
    demand.estimatedCost = order.quantity * order.unitPrice
    budgetDomain.upsertForecast(state, {
      categoryId: demand.budgetCategoryId, period: demand.budgetPeriod, amount: demand.estimatedCost,
      sourceModule: 'Demandas', sourceType: demand.kind, sourceId: demand.id, description: demand.description,
      projectId: demand.projectId,
    }, actor)
  }
  log(state, 'Compras', actor, `${order.id}: cotação de ${state.partners.find(entry => entry.id === supplierId)?.name} escolhida`, undefined, order.id)
  return order
}

export function advancePurchaseOrder(state: ErpState, id: string, actor: string, partial = false) {
  const order = find(state.purchaseOrders, id, 'Pedido de compra')
  const budget = budgetFor(state, { budgetId: order.budgetId, projectId: order.projectId, category: 'Material' })
  if (order.status === 'Aguardando aprovação') {
    commit(state, budget, order.quantity * order.unitPrice, actor, order.id, [order.id, ...order.demandIds])
    order.status = 'Aprovado'
    order.budgetId = budget?.id
    addSyncLog(state, { entity: 'Pedido de compra', reference: order.id, direction: 'Thalamus → Omie', status: 'sincronizado', message: `Pedido aprovado e enviado a ${state.partners.find(entry => entry.id === order.supplierId)?.name}` })
  } else if (order.status === 'Aprovado' || order.status === 'Recebido parcial') {
    const remaining = order.quantity - order.received
    const received = partial && remaining > 1 ? Math.max(1, Math.floor(remaining / 2)) : remaining
    order.received += received
    const lot = receiveStock(state, getItem(state, order.itemId), received, order.id)
    state.movements.unshift({ id: nextId(state, 'MV'), itemId: order.itemId, type: 'Entrada', quantity: received, reference: order.id, at: now(), lots: lot })
    order.status = order.received < order.quantity ? 'Recebido parcial' : 'Recebido'
    if (order.status === 'Recebido') {
      for (const demandId of order.demandIds) {
        const demand = state.demands.find(entry => entry.id === demandId)
        if (!demand) continue
        demand.status = 'Atendida'
        demand.resolution = `Recebido pelo ${order.id}`
        log(state, 'Almoxarifado', actor, `${demand.id} atendida pelo recebimento de ${order.id}`, undefined, demand.id)
      }
      const amount = order.quantity * order.unitPrice
      realize(state, budget, amount, actor, order.id)
    }
  } else throw new DomainError('Este pedido não pode avançar')
  log(state, 'Compras', actor, `${order.id}: ${order.status}`, undefined, order.id)
  return order
}

export function cancelPurchaseOrder(state: ErpState, id: string, actor: string) {
  const order = find(state.purchaseOrders, id, 'Pedido de compra')
  if (order.received > 0 || order.status === 'Recebido') throw new DomainError('Pedido com recebimento não pode ser cancelado')
  order.status = 'Cancelado'
  for (const demandId of order.demandIds) {
    const demand = state.demands.find(entry => entry.id === demandId)
    if (demand && demand.status === 'Em atendimento') {
      demand.status = 'Aberta'
      demand.purchaseOrderId = undefined
      log(state, 'Compras', actor, `${order.id} cancelado; demanda voltou para a fila`, undefined, demand.id)
    }
  }
  log(state, 'Compras', actor, `${order.id} cancelado`, undefined, order.id)
  return order
}

/* ---------- Almoxarifado ---------- */

export function undoPick(state: ErpState, opId: string, actor: string) {
  const op = getOp(state, opId)
  if (op.status !== 'Liberada' || op.operations.some(operation => operation.status !== 'Aguardando' && operation.status !== 'Disponível')) {
    throw new DomainError('Só é possível desfazer antes do início da primeira operação')
  }
  for (const line of op.materials) {
    if (!line.picked) continue
    const lot = receiveStock(state, getItem(state, line.itemId), line.reserved, `Estorno ${op.id}`)
    line.picked = false
    line.lots = undefined
    state.movements.unshift({ id: nextId(state, 'MV'), itemId: line.itemId, type: 'Entrada', quantity: line.reserved, reference: `Estorno ${op.id}`, at: now(), lots: lot })
  }
  op.status = 'Planejada'
  op.operations[0].status = 'Aguardando'
  log(state, 'Almoxarifado', actor, `${op.id}: separação desfeita`, op.salesOrderId)
  return op
}

/* ---------- CRM ---------- */

export const CRM_STAGES: Opportunity['stage'][] = ['Prospecção', 'Desenvolvimento', 'Elaboração', 'Proposta', 'Conquista']
export const CRM_TEMPERATURES: NonNullable<Opportunity['temperature']>[] = ['Quente', 'Morno', 'Frio']
const STAGE_PROBABILITY: Record<Opportunity['stage'], number> = { Prospecção: 10, Desenvolvimento: 25, Elaboração: 40, Proposta: 55, Conquista: 100, Perdida: 0 }

export const opportunityIsOpen = (entry: Pick<Opportunity, 'stage'>) => entry.stage !== 'Conquista' && entry.stage !== 'Perdida'

type OpportunityInput = Pick<Opportunity, 'partnerId' | 'title' | 'ownerId' | 'value' | 'expectedClose' | 'source' | 'nextAction'>
  & Partial<Pick<Opportunity, 'contact' | 'segment' | 'itemIds' | 'quantity' | 'notes' | 'observation' | 'tenantId' | 'mrr' | 'temperature' | 'statusNote' | 'phone' | 'email' | 'dealType'>>

export function createOpportunity(state: ErpState, input: OpportunityInput, actor: string) {
  if (!input.title.trim()) throw new DomainError('Dê um título à oportunidade')
  if (!input.partnerId) throw new DomainError('Escolha o cliente')
  assertClientOpen(state, input.partnerId)
  const opportunity: Opportunity = {
    id: `OPP-${String(state.counters.OPP = (state.counters.OPP ?? 26043) + 1)}`, stage: 'Prospecção', probability: 10, temperature: 'Morno', mrr: 0, dealType: 'Venda', activities: [], createdAt: now(), ...input,
  }
  state.opportunities.unshift(opportunity)
  log(state, 'CRM', actor, `Oportunidade criada: ${opportunity.title} (${money(opportunity.value)})`, undefined, opportunity.id)
  return opportunity
}

export function updateOpportunity(state: ErpState, id: string, patch: Partial<OpportunityInput>, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  if (!opportunityIsOpen(opportunity)) throw new DomainError('Oportunidade encerrada não pode ser editada')
  Object.assign(opportunity, patch)
  log(state, 'CRM', actor, 'Dados da oportunidade atualizados', undefined, id)
  return opportunity
}

export function moveOpportunity(state: ErpState, id: string, stage: Opportunity['stage'], actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  if (!opportunityIsOpen(opportunity)) throw new DomainError('Oportunidade já encerrada')
  if (stage === 'Conquista') throw new DomainError('A oportunidade é conquistada ao aceitar uma proposta')
  if (stage === 'Perdida') throw new DomainError('Use "Marcar como perdida" e informe o motivo')
  opportunity.stage = stage
  opportunity.probability = STAGE_PROBABILITY[stage]
  log(state, 'CRM', actor, `Etapa alterada para ${stage}`, undefined, id)
  return opportunity
}

export function advanceOpportunity(state: ErpState, id: string, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  const next = CRM_STAGES[CRM_STAGES.indexOf(opportunity.stage) + 1]
  if (!next || next === 'Conquista') throw new DomainError('Para conquistar, aceite a proposta do cliente')
  return moveOpportunity(state, id, next, actor)
}

export function loseOpportunity(state: ErpState, id: string, reason: string, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  if (!reason.trim()) throw new DomainError('Informe o motivo da perda')
  if (opportunity.stage === 'Conquista') throw new DomainError('Oportunidade conquistada não pode ser perdida')
  opportunity.stage = 'Perdida'
  opportunity.probability = 0
  opportunity.lossReason = reason
  for (const proposal of state.proposals.filter(entry => entry.opportunityId === id && (entry.status === 'Rascunho' || entry.status === 'Enviada'))) {
    proposal.status = 'Recusada'
    proposal.rejectionReason = reason
  }
  log(state, 'CRM', actor, `Oportunidade perdida: ${reason}`, undefined, id)
  return opportunity
}

/** Meta anual da empresa. A consulta de grupo soma as metas; não grava um número no grupo. */
export function setSalesGoal(state: ErpState, tenantId: string, year: number, amount: number, actor: string) {
  if (!(amount > 0)) throw new DomainError('Informe a meta anual')
  const current = state.salesGoals.find(entry => entry.tenantId === tenantId && entry.year === year)
  if (current) current.amount = amount
  else state.salesGoals.push({ tenantId, year, amount })
  log(state, 'CRM', actor, `Meta ${year} de ${tenantId}: ${money(amount)}`)
  return state.salesGoals.find(entry => entry.tenantId === tenantId && entry.year === year)!
}

export function addActivity(state: ErpState, id: string, input: Pick<CrmActivity, 'type' | 'text' | 'at'>, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  if (!input.text.trim()) throw new DomainError('Descreva a atividade')
  const activity: CrmActivity = { id: nextId(state, 'ACT'), done: false, ...input }
  opportunity.activities.unshift(activity)
  if (activity.at >= now()) opportunity.nextAction = activity.text
  log(state, 'CRM', actor, `${activity.type} agendada: ${activity.text}`, undefined, id)
  return activity
}

export function toggleActivity(state: ErpState, id: string, activityId: string, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  const activity = find(opportunity.activities, activityId, 'Atividade')
  activity.done = !activity.done
  const pending = opportunity.activities.filter(entry => !entry.done).sort((a, b) => a.at.localeCompare(b.at))[0]
  opportunity.nextAction = pending?.text ?? 'Definir próxima ação'
  log(state, 'CRM', actor, `${activity.type} ${activity.done ? 'concluída' : 'reaberta'}: ${activity.text}`, undefined, id)
  return activity
}

/* ---------- Propostas ---------- */

export const proposalTotal = (proposal: Proposal) =>
  proposal.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * (1 - proposal.discount / 100)

/** Preço vigente da tabela padrão; sem ele, a margem de referência sobre o custo. */
function listPrice(item: Item) {
  return currentPrice(item)?.value ?? Math.round(item.cost * 2.4)
}

/** Prazo de fabricação do item mais o maior lead time de compra entre os componentes da estrutura vigente. */
export function deliveryLead(state: ErpState, item: Item): number {
  const production = item.catalog?.productionLeadDays ?? 0
  if (!production) return item.leadTimeDays ?? 14
  const components = (item.bom ?? []).map(line => getItem(state, line.itemId).leadTimeDays ?? 0)
  return production + Math.max(0, ...components)
}

export function createProposal(state: ErpState, opportunityId: string, actor: string) {
  const opportunity = find(state.opportunities, opportunityId, 'Oportunidade')
  if (!opportunityIsOpen(opportunity)) throw new DomainError('Oportunidade encerrada')
  const quantity = opportunity.quantity ?? 1
  const lines: ProposalLine[] = (opportunity.itemIds ?? []).map(itemId => {
    const item = getItem(state, itemId)
    assertUsable(item, 'venda')
    return { itemId, description: item.variant ? `${item.name} · ${item.variant}` : item.name, quantity, unitPrice: listPrice(item) }
  })
  const leadDays = Math.max(14, ...lines.map(line => deliveryLead(state, getItem(state, line.itemId!))))
  const proposal: Proposal = {
    id: `PROP-${String(state.counters.PROP = (state.counters.PROP ?? 26019) + 1)}`, opportunityId, partnerId: opportunity.partnerId, lines,
    discount: 0, validUntil: addDays(today(), 15), suggestedDate: addDays(today(), leadDays + 7), status: 'Rascunho', createdAt: now(), paymentTerms: '28 dias',
  }
  state.proposals.unshift(proposal)
  if (CRM_STAGES.indexOf(opportunity.stage) < CRM_STAGES.indexOf('Proposta')) {
    opportunity.stage = 'Proposta'
    opportunity.probability = STAGE_PROBABILITY.Proposta
  }
  log(state, 'Comercial', actor, `${proposal.id} criada em rascunho`, undefined, opportunityId)
  log(state, 'Comercial', actor, `Proposta criada a partir de ${opportunityId}`, undefined, proposal.id)
  return proposal
}

function editableProposal(state: ErpState, id: string) {
  const proposal = find(state.proposals, id, 'Proposta')
  if (proposal.status !== 'Rascunho') throw new DomainError('Somente propostas em rascunho podem ser editadas')
  return proposal
}

export function updateProposal(state: ErpState, id: string, patch: Partial<Pick<Proposal, 'discount' | 'validUntil' | 'suggestedDate' | 'paymentTerms'>>, actor: string) {
  const proposal = editableProposal(state, id)
  if (patch.discount !== undefined && (patch.discount < 0 || patch.discount > 15)) throw new DomainError('Desconto acima de 15% exige aprovação da diretoria')
  Object.assign(proposal, patch)
  syncOpportunityValue(state, proposal)
  log(state, 'Comercial', actor, 'Condições da proposta atualizadas', undefined, id)
  return proposal
}

export function addProposalLine(state: ErpState, id: string, input: { itemId?: string; serviceId?: string; quantity: number; unitPrice?: number }, actor: string) {
  const proposal = editableProposal(state, id)
  if (input.quantity <= 0) throw new DomainError('Quantidade inválida')
  let line: ProposalLine
  if (input.itemId) {
    const item = getItem(state, input.itemId)
    assertUsable(item, 'venda')
    line = { itemId: item.id, description: item.variant ? `${item.name} · ${item.variant}` : item.name, quantity: input.quantity, unitPrice: input.unitPrice ?? listPrice(item) }
  } else if (input.serviceId) {
    const service = find(state.services, input.serviceId, 'Serviço')
    line = { serviceId: service.id, description: service.name, quantity: input.quantity, unitPrice: input.unitPrice ?? service.price }
  } else throw new DomainError('Escolha um produto ou serviço')
  proposal.lines.push(line)
  syncOpportunityValue(state, proposal)
  log(state, 'Comercial', actor, `Linha adicionada: ${line.description}`, undefined, id)
  return proposal
}

export function updateProposalLine(state: ErpState, id: string, index: number, patch: Partial<Pick<ProposalLine, 'quantity' | 'unitPrice'>>, actor: string) {
  const proposal = editableProposal(state, id)
  const line = proposal.lines[index]
  if (!line) throw new DomainError('Linha não encontrada')
  if ((patch.quantity ?? 1) <= 0 || (patch.unitPrice ?? 1) < 0) throw new DomainError('Valores inválidos')
  Object.assign(line, patch)
  syncOpportunityValue(state, proposal)
  void actor
  return proposal
}

export function removeProposalLine(state: ErpState, id: string, index: number, actor: string) {
  const proposal = editableProposal(state, id)
  const [line] = proposal.lines.splice(index, 1)
  syncOpportunityValue(state, proposal)
  if (line) log(state, 'Comercial', actor, `Linha removida: ${line.description}`, undefined, id)
  return proposal
}

function syncOpportunityValue(state: ErpState, proposal: Proposal) {
  const opportunity = state.opportunities.find(entry => entry.id === proposal.opportunityId)
  if (opportunity && opportunity.stage !== 'Conquista' && opportunity.stage !== 'Perdida') opportunity.value = Math.round(proposalTotal(proposal))
}

export function advanceProposal(state: ErpState, id: string, actor: string) {
  const proposal = find(state.proposals, id, 'Proposta')
  if (proposal.status === 'Rascunho') {
    if (!proposal.lines.length) throw new DomainError('Adicione ao menos uma linha antes de enviar')
    proposal.status = 'Enviada'
    const opportunity = state.opportunities.find(entry => entry.id === proposal.opportunityId)
    if (opportunity && CRM_STAGES.indexOf(opportunity.stage) < CRM_STAGES.indexOf('Proposta')) {
      opportunity.stage = 'Proposta'
      opportunity.probability = STAGE_PROBABILITY.Proposta
    }
    log(state, 'Comercial', actor, `${proposal.id} enviada ao cliente (${money(proposalTotal(proposal))})`, undefined, proposal.opportunityId)
  } else if (proposal.status === 'Enviada') acceptProposal(state, proposal, actor)
  else throw new DomainError('A proposta não pode avançar')
  log(state, 'Comercial', actor, `${proposal.id}: ${proposal.status}`, undefined, proposal.id)
  return proposal
}

export function rejectProposal(state: ErpState, id: string, reason: string, actor: string) {
  const proposal = find(state.proposals, id, 'Proposta')
  if (proposal.status !== 'Enviada') throw new DomainError('Somente propostas enviadas podem ser recusadas')
  if (!reason.trim()) throw new DomainError('Informe o motivo da recusa')
  proposal.status = 'Recusada'
  proposal.rejectionReason = reason
  log(state, 'Comercial', actor, `${proposal.id} recusada: ${reason}`, undefined, proposal.opportunityId)
  log(state, 'Comercial', actor, `Recusada pelo cliente: ${reason}`, undefined, proposal.id)
  return proposal
}

function ensureCustomer(state: ErpState, partnerId: string) {
  const existing = state.customers.find(entry => entry.id === partnerId)
  if (existing) return existing
  const partner = find(state.partners, partnerId, 'Parceiro')
  const customer = { id: partner.id, name: partner.name, city: partner.city, omieCode: `CL-${String(state.counters.CL = (state.counters.CL ?? 1400) + 1)}` }
  state.customers.push(customer)
  addSyncLog(state, { entity: 'Cliente', reference: customer.omieCode, direction: 'Thalamus → Omie', status: 'sincronizado', message: `${partner.name} cadastrado no Omie a partir do CRM` })
  return customer
}

function acceptProposal(state: ErpState, proposal: Proposal, actor: string) {
  const productLines = proposal.lines.filter(line => line.itemId)
  if (!productLines.length) throw new DomainError('A proposta precisa de ao menos um produto')
  for (const line of productLines) assertUsable(getItem(state, line.itemId!), 'venda')
  const orderLines = explodeKitLines(state, productLines.map(line => ({ itemId: line.itemId!, quantity: line.quantity, unitPrice: line.unitPrice })))
  for (const line of orderLines) assertUsable(getItem(state, line.itemId), 'venda')
  const customer = ensureCustomer(state, proposal.partnerId)
  proposal.status = 'Aceita'
  const opportunity = state.opportunities.find(entry => entry.id === proposal.opportunityId)
  const total = proposalTotal(proposal)
  if (opportunity) {
    opportunity.stage = 'Conquista'
    opportunity.probability = 100
    opportunity.value = Math.round(total)
    opportunity.wonAt = today()
  }
  const first = orderLines.find(line => ['03', '04', '06'].includes(getItem(state, line.itemId).type)) ?? orderLines[0]
  const orderId = `PV-2026-${String(state.counters.PV = (state.counters.PV ?? 1056) + 1)}`
  const omieId = `OM-${String(state.counters.OM = (state.counters.OM ?? 98510) + 1)}`
  state.salesOrders.unshift({
    id: orderId, omieId, customerId: customer.id, itemId: first.itemId, quantity: first.quantity,
    lines: orderLines,
    promisedDate: proposal.suggestedDate, priority: 'Normal', value: total, receivedAt: now(), planned: false,
  })
  proposal.salesOrderId = orderId
  addSyncLog(state, { entity: 'Pedido de venda', reference: orderId, direction: 'Thalamus → Omie', status: 'sincronizado', message: `${proposal.id} convertida em pedido ${omieId}` })
  log(state, 'Comercial', actor, `${proposal.id} aceita; pedido ${orderId} aprovado no Omie`, orderId)
  if (opportunity) log(state, 'CRM', actor, `Conquistada: pedido ${orderId} gerado (${money(total)})`, undefined, opportunity.id)
}

/* ---------- Assistência técnica ---------- */

export function createTechnicalOrder(
  state: ErpState,
  input: Pick<TechnicalServiceOrder, 'salesOrderId' | 'description'> & Partial<Pick<TechnicalServiceOrder, 'assetSerial' | 'channel' | 'contact'>>,
  actor: string,
) {
  if (!input.description.trim()) throw new DomainError('Descreva o problema relatado')
  const order = state.salesOrders.find(entry => entry.id === input.salesOrderId)
  if (!order) throw new DomainError('Escolha o pedido de origem')
  const reference = order.shipment?.shippedAt ?? order.receivedAt
  const warranty = !!reference && addDays(reference.slice(0, 10), 365) >= today()
  const op = state.productionOrders.find(entry => entry.salesOrderId === order.id && entry.kind === 'Montagem')
  const technical: TechnicalServiceOrder = {
    id: `AT-${String(state.counters.AT = (state.counters.AT ?? 26018) + 1)}`, partnerId: order.customerId, productionOrderId: op?.id,
    warranty, chargeable: !warranty, status: 'Aberta', usedItemIds: [], parts: [], createdAt: now(), ...input,
  }
  state.technicalServiceOrders.unshift(technical)
  if (warranty && op) {
    const nc = { id: nextId(state, 'NC'), opId: op.id, itemId: op.itemId, quantity: 1, reason: `Reclamação de campo ${technical.id}: ${input.description}`, status: 'Aberta' as const, createdAt: now() }
    state.nonConformities.unshift(nc)
    technical.nonConformityId = nc.id
    log(state, 'Qualidade', actor, `${nc.id} aberta por reclamação de campo (${technical.id})`, order.id)
  }
  log(state, 'Assistência', actor, `${technical.id} aberto${warranty ? ' em garantia' : ' cobrável'} para ${order.id}`, order.id, technical.id)
  return technical
}

export function scheduleTechnicalOrder(state: ErpState, id: string, technicianId: string, date: string, actor: string) {
  const technical = find(state.technicalServiceOrders, id, 'Chamado')
  if (['Concluída', 'Cancelada'].includes(technical.status)) throw new DomainError('Chamado encerrado')
  if (!technicianId || !date) throw new DomainError('Escolha técnico e data')
  technical.technicianId = technicianId
  technical.scheduledFor = date
  if (technical.status === 'Aberta') technical.status = 'Agendada'
  log(state, 'Assistência', actor, `Agendado para ${date.split('-').reverse().join('/')} com ${state.users.find(entry => entry.id === technicianId)?.name}`, undefined, id)
  return technical
}

export function updateTechnicalOrder(state: ErpState, id: string, patch: Partial<Pick<TechnicalServiceOrder, 'diagnosis' | 'report' | 'laborHours' | 'chargeable'>>, actor: string) {
  const technical = find(state.technicalServiceOrders, id, 'Chamado')
  if (['Concluída', 'Cancelada'].includes(technical.status)) throw new DomainError('Chamado encerrado')
  Object.assign(technical, patch)
  log(state, 'Assistência', actor, 'Registro técnico atualizado', undefined, id)
  return technical
}

export function addTechnicalPart(state: ErpState, id: string, itemId: string, quantity: number, actor: string) {
  const technical = find(state.technicalServiceOrders, id, 'Chamado')
  if (['Concluída', 'Cancelada'].includes(technical.status)) throw new DomainError('Chamado encerrado')
  if (quantity <= 0) throw new DomainError('Quantidade inválida')
  const item = getItem(state, itemId)
  assertUsable(item, 'consumo')
  technical.parts ??= []
  if (availableQty(state, itemId) >= quantity) {
    const lots = consumeStock(state, item, quantity)
    state.movements.unshift({ id: nextId(state, 'MV'), itemId, type: 'Saída', quantity: -quantity, reference: technical.id, at: now(), lots })
    technical.parts.push({ itemId, quantity, consumed: true })
    technical.usedItemIds.push(itemId)
    log(state, 'Assistência', actor, `${quantity} ${item.unit} de ${item.name} baixado do estoque`, undefined, id)
  } else {
    technical.parts.push({ itemId, quantity, consumed: false })
    const demand = createDemand(state, {
      kind: 'Material', itemId, description: `${item.name} para ${technical.id}`, quantity, origin: 'Assistência', originId: technical.id,
      neededBy: addDays(today(), 3), priority: 'Alta', assigneeRole: 'Compras',
    }, actor)
    technical.demandIds = [...(technical.demandIds ?? []), demand.id]
    technical.status = 'Aguardando peça'
    log(state, 'Assistência', actor, `Sem saldo de ${item.name}: ${demand.id} aberta para Compras`, undefined, id)
  }
  return technical
}

export function advanceTechnicalOrder(state: ErpState, id: string, actor: string) {
  const technical = find(state.technicalServiceOrders, id, 'Chamado')
  if (technical.status === 'Aberta') {
    technical.technicianId ??= state.users.find(entry => entry.role === 'Assistência')?.id
    technical.scheduledFor ??= addDays(today(), 1)
    technical.status = 'Agendada'
  } else if (technical.status === 'Agendada') {
    technical.status = 'Em execução'
  } else if (technical.status === 'Aguardando peça') {
    if (technical.parts?.some(entry => !entry.consumed)) throw new DomainError('Ainda há peças pendentes. Aguarde o atendimento da demanda.')
    technical.status = 'Em execução'
  } else if (technical.status === 'Em execução') {
    if (technical.parts?.some(entry => !entry.consumed)) throw new DomainError('Há peças pendentes para este chamado')
    technical.report ||= 'Produto testado, reaperto realizado e funcionamento validado.'
    technical.status = 'Concluída'
    if (technical.chargeable) {
      const visit = fieldVisitService(state)
      const parts = (technical.parts ?? []).reduce((sum, part) => sum + getItem(state, part.itemId).cost * part.quantity * 1.3, 0)
      const labor = (technical.laborHours ?? 0) * 120
      technical.chargeAmount = Math.round((visit?.price ?? 480) + parts + labor)
      addSyncLog(state, { entity: 'Cobrança de assistência', reference: technical.id, direction: 'Thalamus → Omie', status: 'pendente', message: `Cobrança de ${money(technical.chargeAmount)} enviada ao Omie para faturar` })
    }
    if (technical.nonConformityId) {
      const nc = state.nonConformities.find(entry => entry.id === technical.nonConformityId)
      if (nc && nc.status === 'Aberta') nc.status = 'Em análise'
    }
  } else throw new DomainError('O chamado não pode avançar')
  log(state, 'Assistência', actor, `${technical.id}: ${technical.status}`, technical.salesOrderId, technical.id)
  return technical
}

export function cancelTechnicalOrder(state: ErpState, id: string, reason: string, actor: string) {
  const technical = find(state.technicalServiceOrders, id, 'Chamado')
  if (!reason.trim()) throw new DomainError('Informe o motivo')
  if (technical.status === 'Concluída') throw new DomainError('Chamado concluído não pode ser cancelado')
  technical.status = 'Cancelada'
  technical.report = reason
  log(state, 'Assistência', actor, `${technical.id} cancelado: ${reason}`, undefined, id)
  return technical
}

/* ---------- Projetos ---------- */

const MILESTONE_TEMPLATES: Record<Project['kind'], string[]> = {
  'Produto novo': ['Requisitos aprovados', 'Desenho e estrutura', 'Protótipo funcional', 'Validação em campo', 'Liberação da revisão'],
  Molde: ['Especificação do molde', 'Aprovação do ferramental', 'Try-out', 'Aprovação de amostras'],
  Melhoria: ['Medição atual', 'Plano de ação', 'Implantação', 'Verificação do resultado'],
  Cliente: ['Kick-off com cliente', 'Amostra aprovada', 'Primeiro lote entregue'],
}

export function createProject(
  state: ErpState,
  input: Pick<Project, 'name' | 'kind' | 'ownerId' | 'startDate' | 'endDate'> & Partial<Pick<Project, 'partnerId' | 'description' | 'itemId' | 'opportunityId'>> & { budget?: number },
  actor: string,
) {
  if (!input.name.trim()) throw new DomainError('Dê um nome ao projeto')
  if (input.endDate < input.startDate) throw new DomainError('A data final deve ser após o início')
  const { budget, ...data } = input
  const titles = MILESTONE_TEMPLATES[input.kind]
  const span = Math.max(1, (new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86400000)
  const project: Project = {
    id: `PRJ-26-${String(state.counters.PRJ = (state.counters.PRJ ?? 14) + 1).padStart(3, '0')}`, status: 'Planejado', memberIds: [input.ownerId], risks: [], ...data,
    milestones: titles.map((title, index) => ({ id: nextId(state, 'MS'), title, dueDate: addDays(input.startDate, Math.round(span * (index + 1) / titles.length)), done: false, ownerId: input.ownerId })),
  }
  state.projects.unshift(project)
  log(state, 'Projetos', actor, `Projeto criado com ${project.milestones.length} marcos`, undefined, project.id)
  if (budget && budget > 0) {
    const owner = state.users.find(entry => entry.id === input.ownerId)
    const sector = state.sectors.find(entry => owner?.sector.includes(entry.name.split(' ')[0]))
    const year = input.startDate.slice(0, 4)
    const period = input.startDate.slice(0, 7)
    const current = budgetDomain.allocationOf(state, 'BC-PD', year)
    const tenantId = budgetDomain.categoryOf(state, 'BC-PD').tenantId
    const allocation = budgetDomain.setBudget(state, tenantId, 'BC-PD', year, (current?.amount ?? 0) + budget, `Projeto ${project.id}`, actor, 'Financeiro')
    project.budgetId = allocation.id
    budgetDomain.upsertForecast(state, {
      categoryId: 'BC-PD', period, amount: budget, sourceModule: 'Projetos', sourceType: project.kind,
      sourceId: project.id, description: project.name, projectId: project.id, sectorId: sector?.id,
    }, actor)
  }
  return project
}

export function addMilestone(state: ErpState, projectId: string, title: string, dueDate: string, actor: string) {
  const project = find(state.projects, projectId, 'Projeto')
  if (!title.trim() || !dueDate) throw new DomainError('Informe título e data do marco')
  project.milestones.push({ id: nextId(state, 'MS'), title, dueDate, done: false, ownerId: project.ownerId })
  project.milestones.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  if (project.status === 'Concluído') project.status = 'Em andamento'
  log(state, 'Projetos', actor, `Marco adicionado: ${title}`, undefined, projectId)
  return project
}

export function toggleMilestone(state: ErpState, projectId: string, milestoneId: string, actor: string) {
  const project = find(state.projects, projectId, 'Projeto')
  const milestone = find(project.milestones, milestoneId, 'Marco')
  if (project.status === 'Cancelado') throw new DomainError('Projeto cancelado')
  milestone.done = !milestone.done
  milestone.doneAt = milestone.done ? now() : undefined
  if (project.milestones.every(entry => entry.done)) project.status = 'Concluído'
  else project.status = 'Em andamento'
  log(state, 'Projetos', actor, `${milestone.title} ${milestone.done ? 'concluído' : 'reaberto'}`, undefined, project.id)
  if (project.status === 'Concluído' && project.itemId) {
    const draft = state.productRevisions.find(entry => entry.itemId === project.itemId && entry.status === 'Rascunho')
    if (draft) log(state, 'Projetos', actor, `Projeto concluído: revisão ${draft.code} pronta para liberação`, undefined, project.itemId)
  }
  return project
}

export function setProjectStatus(state: ErpState, id: string, status: Project['status'], actor: string) {
  const project = find(state.projects, id, 'Projeto')
  if (status === 'Concluído' && project.milestones.some(entry => !entry.done)) throw new DomainError('Conclua todos os marcos antes de encerrar')
  project.status = status
  log(state, 'Projetos', actor, `Status alterado para ${status}`, undefined, id)
  return project
}

export function addProjectRisk(state: ErpState, id: string, risk: string, actor: string) {
  const project = find(state.projects, id, 'Projeto')
  if (!risk.trim()) throw new DomainError('Descreva o risco')
  project.risks = [...(project.risks ?? []), risk]
  log(state, 'Projetos', actor, `Risco registrado: ${risk}`, undefined, id)
  return project
}

/* ---------- Cadastros ---------- */

const AREA_SECTOR: Record<string, string> = {
  Almoxarifado: 'Suprimentos', Planejamento: 'Operações', Produção: 'Operações', Injeção: 'Operações', Montagem: 'Operações',
  Qualidade: 'Operações', Logística: 'Operações', Manutenção: 'Serviços', 'Assistência técnica': 'Serviços',
}

/** Setor do organograma ao qual a área de trabalho da pessoa pertence. */
export function sectorOf(state: ErpState, user: Pick<User, 'sector'>) {
  const name = AREA_SECTOR[user.sector] ?? user.sector
  return state.sectors.find(entry => entry.name === name)
}

export function createUser(state: ErpState, input: Pick<User, 'name' | 'role' | 'sector' | 'shift'> & Partial<Pick<User, 'email' | 'positionId'>>, actor: string) {
  if (!input.name.trim()) throw new DomainError('Informe o nome')
  if (input.email && state.users.some(entry => entry.email === input.email)) throw new DomainError('E-mail já utilizado')
  const user: User = { id: `u${String(state.counters.U = (state.counters.U ?? 15) + 1)}`, pin: String(1000 + (state.counters.U * 37) % 9000), active: true, ...input }
  state.users.push(user)
  log(state, 'Pessoas', actor, `${user.name} cadastrado como ${user.role}`, undefined, user.id)
  return user
}

export function updateUser(state: ErpState, id: string, patch: Partial<Pick<User, 'role' | 'sector' | 'shift' | 'positionId' | 'email' | 'active'>>, actor: string) {
  const user = find(state.users, id, 'Pessoa')
  const changes = Object.entries(patch).filter(([key, value]) => user[key as keyof User] !== value).map(([key]) => key)
  Object.assign(user, patch)
  if (changes.length) log(state, 'Pessoas', actor, `Cadastro atualizado (${changes.join(', ')})`, undefined, id)
  return user
}

export function createAsset(state: ErpState, input: Omit<Asset, 'id' | 'shots'>, actor: string) {
  if (!input.name.trim()) throw new DomainError('Informe o nome do ativo')
  if (input.resourceId) assertResourceChoice(state, input.resourceId)
  const asset: Asset = { id: `at-${String(state.counters.ATV = (state.counters.ATV ?? 0) + 1)}`, shots: input.kind === 'Molde' ? 0 : undefined, status: 'Operando', ...input }
  state.assets.push(asset)
  log(state, 'Ativos', actor, `${asset.name} cadastrado`, undefined, asset.id)
  return asset
}

export function updateAsset(state: ErpState, id: string, patch: Partial<Omit<Asset, 'id'>>, actor: string) {
  const asset = find(state.assets, id, 'Ativo')
  if (patch.resourceId && patch.resourceId !== asset.resourceId) assertResourceChoice(state, patch.resourceId)
  Object.assign(asset, patch)
  log(state, 'Ativos', actor, 'Cadastro do ativo atualizado', undefined, id)
  return asset
}

/* ---------- Engenharia ---------- */

/** Libera a versão: a anterior ganha fim de vigência e fica guardada; OPs novas passam a usar esta. */
export function releaseRevision(state: ErpState, revisionId: string, actor: string, validFrom = today()) {
  const revision = find(state.productRevisions, revisionId, 'Revisão')
  if (revision.status !== 'Rascunho') throw new DomainError('Só uma versão em rascunho pode ser liberada')
  if (revision.checklist.some(entry => !entry.done)) throw new DomainError('Complete o checklist antes de liberar')
  if (revision.lines && !revision.lines.length) throw new DomainError('A versão precisa ter ao menos um componente')
  const owner = state.items.find(entry => entry.id === revision.itemId)
  if (revision.routing && !revision.routing.length && owner && hasRouting(owner) && owner.type === '04') throw new DomainError('A versão precisa de ao menos uma operação no roteiro')
  if (validFrom < today()) throw new DomainError('A vigência não pode começar no passado')
  if (state.productRevisions.some(entry => entry.itemId === revision.itemId && entry.status === 'Liberada' && (entry.validFrom ?? '') > today())) {
    throw new DomainError('Já existe uma versão programada para vigorar. Aguarde a vigência ou ajuste aquela versão')
  }
  for (const entry of state.productRevisions.filter(entry => entry.itemId === revision.itemId && entry.status === 'Liberada')) entry.validTo = addDays(validFrom, -1)
  revision.status = 'Liberada'
  revision.releasedAt = now()
  revision.releasedBy = actor
  revision.validFrom = validFrom
  const item = getItem(state, revision.itemId)
  applyDueRevisions(state)
  item.status = 'Liberado'
  if (item.catalog) {
    item.catalog.version += 1
    item.catalog.updatedAt = now()
    item.catalog.updatedBy = actor
    item.catalog.audit.unshift({ at: now(), actor, text: `Estrutura versão ${revision.code} liberada, vigente a partir de ${validFrom.split('-').reverse().join('/')}`, version: item.catalog.version, field: 'Estrutura', from: '', to: `Versão ${revision.code} desde ${validFrom}` })
  }
  log(state, 'Engenharia', actor, `${item.code}: revisão ${revision.code} liberada`, undefined, item.id)
  return revision
}

/* ---------- Tarefas ---------- */

export interface DerivedTask { id: string; title: string; detail: string; to: string; record?: { kind: string; id: string } }

export function tasksForRole(state: ErpState, role: Role, userId = '') {
  const tasks: DerivedTask[] = []
  const is = (...roles: Role[]) => hasFullAccess(role) || roles.includes(role)
  if (is('Comercial')) {
    for (const entry of state.opportunities.filter(item => opportunityIsOpen(item))) {
      tasks.push({ id: entry.id, title: entry.nextAction, detail: `${entry.title} · ${entry.stage}`, to: `/crm/oportunidade/${entry.id}` })
    }
    for (const entry of state.proposals.filter(item => item.status === 'Enviada' && item.validUntil <= addDays(today(), 3))) {
      tasks.push({ id: entry.id, title: `${entry.id} vence em breve`, detail: 'Cobrar retorno do cliente', to: '/crm/propostas', record: { kind: 'proposal', id: entry.id } })
    }
  }
  if (is('Compras')) {
    for (const entry of state.demands.filter(item => item.status === 'Aberta' && item.assigneeRole === 'Compras')) tasks.push({ id: entry.id, title: `Atender ${entry.id}`, detail: entry.description, to: '/demandas', record: { kind: 'demand', id: entry.id } })
    for (const entry of state.purchaseOrders.filter(item => item.status === 'Aguardando aprovação')) tasks.push({ id: entry.id, title: `Aprovar ${entry.id}`, detail: 'Pedido aguardando alçada', to: '/compras', record: { kind: 'purchase', id: entry.id } })
  }
  if (is('Almoxarifado')) {
    for (const entry of state.demands.filter(item => item.status === 'Aberta' && item.assigneeRole === 'Almoxarifado')) tasks.push({ id: entry.id, title: `Separar ${entry.id}`, detail: entry.description, to: '/demandas', record: { kind: 'demand', id: entry.id } })
    for (const entry of state.purchaseOrders.filter(item => item.status === 'Aprovado' || item.status === 'Recebido parcial')) tasks.push({ id: `${entry.id}-rec`, title: `Receber ${entry.id}`, detail: `${entry.quantity - entry.received} ${getItem(state, entry.itemId).unit} de ${getItem(state, entry.itemId).name}`, to: '/compras', record: { kind: 'purchase', id: entry.id } })
  }
  if (is('Assistência')) {
    for (const entry of state.technicalServiceOrders.filter(item => !['Concluída', 'Cancelada'].includes(item.status))) tasks.push({ id: entry.id, title: `${entry.id} · ${entry.status}`, detail: entry.description, to: '/assistencia', record: { kind: 'technical', id: entry.id } })
  }
  if (is('Engenharia')) {
    for (const entry of state.productRevisions.filter(item => item.status === 'Rascunho')) tasks.push({ id: entry.id, title: `Liberar revisão ${entry.code}`, detail: getItem(state, entry.itemId).name, to: `/produtos/item/${entry.itemId}` })
  }
  const approvalRoles = APPROVER[role] ?? []
  for (const item of state.items.filter(entry => entry.catalog?.lifecycle === 'Em homologação' && !entry.catalog.deletedAt)) {
    for (const approval of approvalRoles) {
      if (requiredApprovals(item).includes(approval) && !item.catalog!.approvals[approval]) {
        tasks.push({ id: `${item.id}-${approval}`, title: `Homologar ${item.code}`, detail: `${item.name} · aprovação ${approval === 'pcp' ? 'de PCP' : approval === 'tecnica' ? 'técnica' : approval}`, to: `/produtos/item/${item.id}` })
      }
    }
  }
  if (hasFullAccess(role)) {
    for (const item of state.items.filter(entry => entry.catalog?.keyChanges.some(change => change.status === 'Pendente'))) {
      tasks.push({ id: `${item.id}-key`, title: `Exceção em campo-chave de ${item.code}`, detail: item.name, to: `/produtos/item/${item.id}` })
    }
  }
  for (const project of state.projects.filter(item => item.status === 'Em andamento' || item.status === 'Planejado')) {
    const owner = state.users.find(entry => entry.id === project.ownerId)
    if (!hasFullAccess(role) && owner?.role !== role) continue
    for (const milestone of project.milestones.filter(item => !item.done && item.dueDate <= addDays(today(), 7))) {
      tasks.push({ id: `${project.id}-${milestone.id}`, title: milestone.title, detail: `${project.name} · ${milestone.dueDate < today() ? 'atrasado' : 'esta semana'}`, to: '/projetos', record: { kind: 'project', id: project.id } })
    }
  }
  for (const alert of state.budgetAlerts.filter(item => item.status === 'Aberto' && (is('Financeiro') || (Boolean(userId) && (item.notifiedUserIds ?? []).includes(userId))))) {
    const allocation = budgetDomain.allocationOf(state, alert.categoryId, alert.period)
    tasks.push({ id: alert.id, title: alert.kind === 'Bloqueio' ? 'Lançamento retido por saldo' : `Orçamento em alerta · ${alert.period}`, detail: `${alert.message} O ciente fica em Minhas tarefas e no sino.`, to: '/tarefas', record: allocation ? { kind: 'budget', id: allocation.id } : undefined })
  }
  for (const entry of state.budgetExceptions.filter(item => item.status === 'Pendente' && budgetDomain.canDecide(item, role))) {
    const title = entry.kind === 'Saldo excedido' ? `Liberar ${entry.sourceId} acima do saldo` : entry.kind === 'Sem vínculo' ? 'Vincular nota sem origem' : `Pagamento retido · ${entry.kind}`
    const detail = entry.kind === 'Saldo excedido' ? `${entry.description} A decisão fica no sino.` : entry.kind === 'Sem vínculo' ? `${entry.description} O vínculo é feito em Ações.` : entry.description
    tasks.push({ id: entry.id, title, detail, to: '/orcamentos' })
  }
  return tasks
}
