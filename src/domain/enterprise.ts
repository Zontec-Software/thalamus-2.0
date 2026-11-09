import { APPROVER, currentPrice, hasRouting, requiredApprovals } from './catalog'
import { explodeKitLines } from './catalogExtensions'
import { hasFullAccess } from './access'
import * as budgetDomain from './budget'
import type { ErpState } from './engine'
import { addDays, addSyncLog, applyDueRevisions, assertUsable, availableQty, consumeStock, DEFAULT_TENANT, DomainError, getItem, getOp, log, nextId, now, omieBlock, receiveStock, salesOrderStatus, today } from './engine'
import { assertClientOpen, assertPurchaseAllowed, assertSupplierOpen } from './partners'
import { fieldVisitService } from './services'
import { assertResourceChoice } from './resources'
import { warrantyCoverage } from './aftersales'
import type {
  ActivityAttachment, ActivityGuest, Asset, Budget, CrmActivity, Demand, Item, NewActivityFile, NewActivityInput, Opportunity, Project, Proposal, ProposalLine,
  PurchaseOrder, Receipt, ReceiptCheck, Role, TechnicalServiceOrder, User,
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
    const remaining = openToReceive(state, order)
    const received = partial && remaining > 1 ? Math.max(1, Math.floor(remaining / 2)) : remaining
    receivePurchase(state, order.id, { received, accepted: received, check: 'Conforme' }, actor)
    return order
  } else throw new DomainError('Este pedido não pode avançar')
  log(state, 'Compras', actor, `${order.id}: ${order.status}`, undefined, order.id)
  return order
}

/* ---------- Recebimento ---------- */

export const RECEIPT_CHECKS: ReceiptCheck[] = ['Conforme', 'Divergência', 'Avaria', 'Incompleto']

/** Quantidade do pedido que ainda pode entrar: o aceito já entrou e o bloqueado espera decisão. */
export function openToReceive(state: ErpState, order: PurchaseOrder) {
  const blocked = state.receipts.filter(entry => entry.purchaseOrderId === order.id && entry.status === 'Bloqueado').reduce((sum, entry) => sum + entry.received - entry.accepted, 0)
  return Math.max(0, order.quantity - order.received - blocked)
}

/** Entrada no saldo pela quantidade aceita. É o único caminho do recebimento até o estoque. */
function acceptIntoStock(state: ErpState, order: PurchaseOrder, quantity: number, actor: string, reference: string) {
  if (quantity <= 0) return
  order.received += quantity
  const lot = receiveStock(state, getItem(state, order.itemId), quantity, order.id)
  state.movements.unshift({ id: nextId(state, 'MV'), itemId: order.itemId, type: 'Entrada', quantity, reference, at: now(), lots: lot })
  order.status = order.received < order.quantity ? 'Recebido parcial' : 'Recebido'
  if (order.status !== 'Recebido') return
  for (const demandId of order.demandIds) {
    const demand = state.demands.find(entry => entry.id === demandId)
    if (!demand) continue
    demand.status = 'Atendida'
    demand.resolution = `Recebido pelo ${order.id}`
    log(state, 'Almoxarifado', actor, `${demand.id} atendida pelo recebimento de ${order.id}`, undefined, demand.id)
  }
  realize(state, budgetFor(state, { budgetId: order.budgetId, projectId: order.projectId, category: 'Material' }), order.quantity * order.unitPrice, actor, order.id)
}

/**
 * Conferência do que chegou. Só o aceito entra no saldo.
 * Divergência, avaria ou falta deixam o restante bloqueado até alguém decidir.
 */
export function receivePurchase(state: ErpState, purchaseOrderId: string, input: { received: number; accepted: number; check: ReceiptCheck; note?: string }, actor: string) {
  const order = find(state.purchaseOrders, purchaseOrderId, 'Pedido de compra')
  if (order.status !== 'Aprovado' && order.status !== 'Recebido parcial') throw new DomainError('Só pedido de compra aprovado recebe mercadoria')
  const open = openToReceive(state, order)
  const received = Number(input.received)
  const accepted = Number(input.accepted)
  if (!(received > 0)) throw new DomainError('Informe a quantidade que chegou')
  if (!(accepted >= 0) || accepted > received) throw new DomainError('A quantidade aceita vai de zero ao que chegou')
  if (accepted > open) throw new DomainError(`Aceito acima do pedido em aberto (${open}). O excedente é divergência`)
  if (input.check === 'Conforme' && (accepted !== received || received > open)) throw new DomainError('Conferência conforme aceita tudo o que chegou, dentro do pedido')
  if (input.check !== 'Conforme' && !input.note?.trim()) throw new DomainError('Descreva o que foi encontrado na conferência')
  const blocked = received - accepted
  const receipt: Receipt = {
    id: nextId(state, 'RB'), tenantId: DEFAULT_TENANT, purchaseOrderId: order.id, supplierId: order.supplierId, itemId: order.itemId,
    expected: open, received, accepted, check: input.check, note: input.note?.trim() || undefined, receivedBy: actor, receivedAt: now(),
    status: blocked > 0 ? 'Bloqueado' : 'Concluído',
  }
  state.receipts.unshift(receipt)
  acceptIntoStock(state, order, accepted, actor, receipt.id)
  const unit = getItem(state, order.itemId).unit
  log(state, 'Almoxarifado', actor, `${receipt.id}: ${input.check.toLowerCase()} · ${accepted} ${unit} aceitos${blocked ? `, ${blocked} bloqueados` : ''}`, undefined, order.id)
  addSyncLog(state, { entity: 'Recebimento', reference: order.id, direction: 'Omie → Thalamus', status: 'sincronizado', message: `NF-e de entrada conferida: ${accepted} ${unit} aceitos` })
  return receipt
}

/** Decisão sobre o bloqueado. Quem recebeu não decide; aceitar leva ao saldo, devolver mantém o pedido em aberto. */
export function decideReceipt(state: ErpState, receiptId: string, decision: 'Aceitar' | 'Devolver', note: string, actor: string) {
  const receipt = find(state.receipts, receiptId, 'Recebimento')
  if (receipt.status !== 'Bloqueado') throw new DomainError('Este recebimento não está bloqueado')
  if (receipt.receivedBy === actor) throw new DomainError('Quem conferiu não decide o bloqueio: a decisão é de outra pessoa')
  if (!note.trim()) throw new DomainError('Registre o motivo da decisão')
  const order = find(state.purchaseOrders, receipt.purchaseOrderId, 'Pedido de compra')
  const blocked = receipt.received - receipt.accepted
  receipt.status = 'Concluído'
  receipt.decision = decision
  receipt.decidedBy = actor
  receipt.decidedAt = now()
  receipt.decisionNote = note.trim()
  if (decision === 'Aceitar') {
    const quantity = Math.min(blocked, openToReceive(state, order))
    receipt.accepted += quantity
    acceptIntoStock(state, order, quantity, actor, receipt.id)
  }
  log(state, 'Compras', actor, `${receipt.id}: bloqueio ${decision === 'Aceitar' ? 'aceito com ressalva' : 'devolvido ao fornecedor'} (${note.trim()})`, undefined, order.id)
  return receipt
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

export const CRM_STAGES: Opportunity['stage'][] = ['Novo contato', 'Qualificação', 'Levantamento', 'Proposta', 'Negociação', 'Ganho']
export const CRM_TEMPERATURES: NonNullable<Opportunity['temperature']>[] = ['Quente', 'Morno', 'Frio']
const STAGE_PROBABILITY: Record<Opportunity['stage'], number> = { 'Novo contato': 10, Qualificação: 20, Levantamento: 35, Proposta: 55, Negociação: 75, Ganho: 100, Perdido: 0 }

export const opportunityIsOpen = (entry: Pick<Opportunity, 'stage'>) => entry.stage !== 'Ganho' && entry.stage !== 'Perdido'

type OpportunityInput = Pick<Opportunity, 'partnerId' | 'title' | 'ownerId' | 'value' | 'expectedClose' | 'source' | 'nextAction'>
  & Partial<Pick<Opportunity, 'contact' | 'segment' | 'itemIds' | 'quantity' | 'notes' | 'observation' | 'tenantId' | 'mrr' | 'temperature' | 'statusNote' | 'phone' | 'email' | 'dealType'>>

export function createOpportunity(state: ErpState, input: OpportunityInput, actor: string) {
  if (!input.title.trim()) throw new DomainError('Dê um título à oportunidade')
  if (!input.partnerId) throw new DomainError('Escolha o cliente')
  assertClientOpen(state, input.partnerId)
  const opportunity: Opportunity = {
    id: `OPP-${String(state.counters.OPP = (state.counters.OPP ?? 26043) + 1)}`, stage: 'Novo contato', probability: 10, temperature: 'Frio', mrr: 0, dealType: 'Venda', activities: [], createdAt: now(), ...input,
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
  if (stage === 'Ganho') throw new DomainError('A oportunidade é ganha ao aceitar uma proposta')
  if (stage === 'Perdido') throw new DomainError('Use "Marcar como perdida" e informe o motivo')
  opportunity.stage = stage
  opportunity.probability = STAGE_PROBABILITY[stage]
  log(state, 'CRM', actor, `Etapa alterada para ${stage}`, undefined, id)
  return opportunity
}

export function advanceOpportunity(state: ErpState, id: string, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  const next = CRM_STAGES[CRM_STAGES.indexOf(opportunity.stage) + 1]
  if (!next || next === 'Ganho') throw new DomainError('Para ganhar, aceite a proposta do cliente')
  return moveOpportunity(state, id, next, actor)
}

export function loseOpportunity(state: ErpState, id: string, reason: string, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  if (!reason.trim()) throw new DomainError('Informe o motivo da perda')
  if (opportunity.stage === 'Ganho') throw new DomainError('Oportunidade ganha não pode ser perdida')
  if (opportunity.stage === 'Perdido') throw new DomainError('Oportunidade já perdida')
  opportunity.stage = 'Perdido'
  opportunity.probability = 0
  opportunity.lossReason = reason
  for (const proposal of state.proposals.filter(entry => entry.opportunityId === id && proposalIsLive(entry))) {
    proposal.status = 'Cancelada'
    proposal.cancelReason = `Oportunidade perdida: ${reason}`
  }
  log(state, 'CRM', actor, `Oportunidade perdida: ${reason}`, undefined, id)
  return opportunity
}

/** Doze fatias. O último mês absorve o resto da divisão. */
export function splitSalesGoal(amount: number) {
  const total = Math.round(amount)
  const base = Math.floor(total / 12)
  const months = Array.from({ length: 12 }, () => base)
  months[11] = total - base * 11
  return months
}

/** Meta da empresa, com os doze meses. Sem meses informados, o ano é rateado por igual. O grupo só soma. */
export function setSalesGoal(state: ErpState, tenantId: string, year: number, amount: number, monthly: number[] | undefined, actor: string) {
  const months = monthly ?? splitSalesGoal(amount)
  if (months.length !== 12 || months.some(value => !(value >= 0) || !Number.isFinite(value))) throw new DomainError('Informe a meta dos doze meses')
  const total = months.reduce((sum, value) => sum + value, 0)
  if (!(total > 0)) throw new DomainError('Informe a meta anual')
  const current = state.salesGoals.find(entry => entry.tenantId === tenantId && entry.year === year)
  if (current) Object.assign(current, { amount: total, monthlyAmounts: [...months] })
  else state.salesGoals.push({ tenantId, year, amount: total, monthlyAmounts: [...months] })
  log(state, 'CRM', actor, `Meta ${year} de ${tenantId}: ${money(total)}`)
  return state.salesGoals.find(entry => entry.tenantId === tenantId && entry.year === year)!
}

const ACTIVITY_FILE_LIMIT = 450_000

function storedFile(state: ErpState, file: NewActivityFile, at: string): ActivityAttachment {
  const name = file.name.trim()
  if (!name) throw new DomainError('O anexo precisa de um nome')
  if (file.size > ACTIVITY_FILE_LIMIT) throw new DomainError(`Arquivo de ${Math.round(file.size / 1024)} KB: na demonstração o limite é ${Math.round(ACTIVITY_FILE_LIMIT / 1024)} KB por arquivo`)
  return { id: nextId(state, 'ANX'), name, kind: 'arquivo', source: 'usuário', mime: file.mime, size: file.size, at, dataUrl: file.dataUrl }
}

/** Transcrição e gravação que o Google Meet devolveria ao encerrar a reunião. Sem chamada externa. */
function googleMeetArtifacts(state: ErpState, at: string): ActivityAttachment[] {
  const transcript = 'Transcrição simulada do Google Meet.\n\nNesta demonstração o Thalamus não acessa o Google. No sistema real, a transcrição gerada na reunião entra neste anexo.'
  return [
    {
      id: nextId(state, 'ANX'), name: 'Transcrição do Google Meet.txt', kind: 'transcrição', source: 'google',
      mime: 'text/plain', size: transcript.length, at, dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(transcript)}`,
    },
    {
      id: nextId(state, 'ANX'), name: 'Gravação do Google Meet.mp4', kind: 'gravação', source: 'google',
      mime: 'video/mp4', size: 0, at,
    },
  ]
}

function meetingCalendar(state: ErpState, opportunity: Opportunity, actorUserId: string) {
  const creator = state.users.find(user => user.id === actorUserId)
  if (!creator) throw new DomainError('Usuário da agenda não encontrado')
  const contactName = opportunity.contact?.trim()
  if (!contactName) throw new DomainError('A reunião precisa do contato da oportunidade')
  const partner = state.partners.find(entry => entry.id === opportunity.partnerId)
  const contact = partner?.contacts.find(entry => entry.name === contactName)
  const guests: ActivityGuest[] = [{
    name: contactName,
    email: contact?.email || opportunity.email || partner?.email || undefined,
    role: 'contato',
  }]
  const seller = state.users.find(user => user.id === opportunity.ownerId)
  if (seller && seller.id !== creator.id) guests.push({ name: seller.name, email: seller.email, role: 'vendedor' })
  return { creator, guests }
}

export function addActivity(state: ErpState, id: string, input: NewActivityInput, actor: string, actorUserId = '') {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  if (!input.text.trim()) throw new DomainError(input.type === 'Reunião' ? 'Informe o título da reunião' : 'Descreva a atividade')
  const at = input.at
  const activity: CrmActivity = {
    id: nextId(state, 'ACT'), at, type: input.type, text: input.text.trim(), done: false, createdBy: actor,
    details: input.details?.trim() || undefined,
    sector: input.sector?.trim() || undefined,
    attachments: (input.attachments ?? []).map(file => storedFile(state, file, at)),
  }
  if (input.type === 'Reunião') {
    const { creator, guests } = meetingCalendar(state, opportunity, actorUserId)
    activity.calendar = { ownerUserId: creator.id, ownerName: creator.name, externalId: `gcal-sim-${activity.id}`, guests }
  }
  opportunity.activities.unshift(activity)
  if (activity.at >= now()) opportunity.nextAction = activity.text
  const invited = activity.calendar ? ` na agenda de ${activity.calendar.ownerName}` : ''
  log(state, 'CRM', actor, `${activity.type} agendada${invited}: ${activity.text}`, undefined, id)
  return activity
}

export function addActivityAttachment(state: ErpState, id: string, activityId: string, file: NewActivityFile, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  const activity = find(opportunity.activities, activityId, 'Atividade')
  const attachment = storedFile(state, file, now())
  activity.attachments = [...(activity.attachments ?? []), attachment]
  log(state, 'CRM', actor, `Anexo em ${activity.text}: ${attachment.name}`, undefined, id)
  return activity
}

export function toggleActivity(state: ErpState, id: string, activityId: string, actor: string) {
  const opportunity = find(state.opportunities, id, 'Oportunidade')
  const activity = find(opportunity.activities, activityId, 'Atividade')
  activity.done = !activity.done
  if (activity.done && activity.type === 'Reunião') {
    const hasGoogle = activity.attachments?.some(file => file.source === 'google')
    if (!hasGoogle) activity.attachments = [...(activity.attachments ?? []), ...googleMeetArtifacts(state, now())]
  }
  const pending = opportunity.activities.filter(entry => !entry.done).sort((a, b) => a.at.localeCompare(b.at))[0]
  opportunity.nextAction = pending?.text ?? 'Definir próxima ação'
  log(state, 'CRM', actor, `${activity.type} ${activity.done ? 'concluída' : 'reaberta'}: ${activity.text}`, undefined, id)
  return activity
}

/* ---------- Propostas ---------- */

export const proposalTotal = (proposal: Proposal) =>
  proposal.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * (1 - proposal.discount / 100)

/** Acima disto o desconto passa por aprovação de outra pessoa. A política de descontos ainda não foi aprovada. */
export const DISCOUNT_APPROVAL_LIMIT = 15

/** Proposta que ainda pode virar pedido ou ser trabalhada. */
export const proposalIsLive = (proposal: Pick<Proposal, 'status'>) => proposal.status === 'Rascunho' || proposal.status === 'Em aprovação' || proposal.status === 'Enviada'

/** Enviada com validade passada vira Vencida. Roda ao abrir o sistema e antes de aceitar. */
export function expireProposals(state: ErpState) {
  for (const proposal of state.proposals.filter(entry => entry.status === 'Enviada' && entry.validUntil < today())) {
    proposal.status = 'Vencida'
    log(state, 'Comercial', 'Sistema', `${proposal.id} vencida em ${proposal.validUntil.split('-').reverse().join('/')}`, undefined, proposal.id)
  }
}

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
    version: 1, createdBy: actor,
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
  if (patch.discount !== undefined && (patch.discount < 0 || patch.discount >= 100)) throw new DomainError('Desconto inválido')
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
  if (opportunity && opportunityIsOpen(opportunity)) opportunity.value = Math.round(proposalTotal(proposal))
}

function sendProposal(state: ErpState, proposal: Proposal, actor: string) {
  proposal.status = 'Enviada'
  const opportunity = state.opportunities.find(entry => entry.id === proposal.opportunityId)
  if (opportunity && CRM_STAGES.indexOf(opportunity.stage) < CRM_STAGES.indexOf('Proposta')) {
    opportunity.stage = 'Proposta'
    opportunity.probability = STAGE_PROBABILITY.Proposta
  }
  log(state, 'Comercial', actor, `${proposal.id} enviada ao cliente (${money(proposalTotal(proposal))})`, undefined, proposal.opportunityId)
}

/**
 * Rascunho segue para o cliente; com desconto acima do limite, passa antes por aprovação de outra pessoa.
 * Enviada e aceita pelo cliente vira pedido no Thalamus.
 */
export function advanceProposal(state: ErpState, id: string, actor: string) {
  const proposal = find(state.proposals, id, 'Proposta')
  if (proposal.status === 'Rascunho') {
    if (!proposal.lines.length) throw new DomainError('Adicione ao menos uma linha antes de enviar')
    if (proposal.discount > DISCOUNT_APPROVAL_LIMIT) {
      proposal.status = 'Em aprovação'
      proposal.approvalRequestedBy = actor
      log(state, 'Comercial', actor, `${proposal.id} com ${proposal.discount}% de desconto: aguardando aprovação`, undefined, proposal.opportunityId)
    } else sendProposal(state, proposal, actor)
  } else if (proposal.status === 'Em aprovação') {
    if (proposal.approvalRequestedBy === actor) throw new DomainError('Quem pediu o desconto não aprova a própria proposta')
    proposal.approvedBy = actor
    proposal.approvedAt = now()
    sendProposal(state, proposal, actor)
  } else if (proposal.status === 'Enviada') {
    expireProposals(state)
    if (proposal.status !== 'Enviada') throw new DomainError('A proposta venceu. Gere uma nova versão com a validade atualizada')
    acceptProposal(state, proposal, actor)
  } else throw new DomainError('A proposta não pode avançar')
  log(state, 'Comercial', actor, `${proposal.id}: ${proposal.status}`, undefined, proposal.id)
  return proposal
}

/** Recusa do cliente (proposta enviada) ou do aprovador (desconto devolvido ao rascunho). */
export function rejectProposal(state: ErpState, id: string, reason: string, actor: string) {
  const proposal = find(state.proposals, id, 'Proposta')
  if (!reason.trim()) throw new DomainError('Informe o motivo da recusa')
  if (proposal.status === 'Em aprovação') {
    proposal.status = 'Rascunho'
    log(state, 'Comercial', actor, `Desconto não aprovado: ${reason}`, undefined, proposal.id)
    return proposal
  }
  if (proposal.status !== 'Enviada') throw new DomainError('Somente propostas enviadas podem ser recusadas')
  proposal.status = 'Recusada'
  proposal.rejectionReason = reason
  log(state, 'Comercial', actor, `${proposal.id} recusada: ${reason}`, undefined, proposal.opportunityId)
  log(state, 'Comercial', actor, `Recusada pelo cliente: ${reason}`, undefined, proposal.id)
  return proposal
}

export function cancelProposal(state: ErpState, id: string, reason: string, actor: string) {
  const proposal = find(state.proposals, id, 'Proposta')
  if (!proposalIsLive(proposal)) throw new DomainError('Só proposta em andamento pode ser cancelada')
  if (!reason.trim()) throw new DomainError('Informe o motivo do cancelamento')
  proposal.status = 'Cancelada'
  proposal.cancelReason = reason
  log(state, 'Comercial', actor, `${proposal.id} cancelada: ${reason}`, undefined, proposal.opportunityId)
  return proposal
}

/** Nova versão em rascunho, com as mesmas linhas e condições. A enviada anterior é cancelada. */
export function reviseProposal(state: ErpState, id: string, actor: string) {
  const previous = find(state.proposals, id, 'Proposta')
  if (!['Enviada', 'Recusada', 'Vencida'].includes(previous.status)) throw new DomainError('Nova versão sai de proposta enviada, recusada ou vencida')
  const opportunity = find(state.opportunities, previous.opportunityId, 'Oportunidade')
  if (!opportunityIsOpen(opportunity)) throw new DomainError('Oportunidade encerrada')
  const rootId = previous.rootId ?? previous.id
  const version = Math.max(...state.proposals.filter(entry => (entry.rootId ?? entry.id) === rootId).map(entry => entry.version ?? 1)) + 1
  const proposal: Proposal = {
    ...previous, id: `${rootId}-v${version}`, rootId, version, status: 'Rascunho', createdAt: now(), createdBy: actor,
    lines: previous.lines.map(line => ({ ...line })), validUntil: addDays(today(), 15),
    salesOrderId: undefined, rejectionReason: undefined, approvalRequestedBy: undefined, approvedBy: undefined, approvedAt: undefined, cancelReason: undefined,
  }
  if (previous.status === 'Enviada') {
    previous.status = 'Cancelada'
    previous.cancelReason = `Substituída pela versão ${version}`
  }
  state.proposals.unshift(proposal)
  log(state, 'Comercial', actor, `${proposal.id}: versão ${version} aberta a partir de ${previous.id}`, undefined, opportunity.id)
  return proposal
}

function ensureCustomer(state: ErpState, partnerId: string) {
  const existing = state.customers.find(entry => entry.id === partnerId)
  if (existing) return existing
  const partner = find(state.partners, partnerId, 'Parceiro')
  const sends = !omieBlock(state, 'Cliente')
  const customer = { id: partner.id, name: partner.name, city: partner.city, omieCode: sends ? `CL-${String(state.counters.CL = (state.counters.CL ?? 1400) + 1)}` : '' }
  state.customers.push(customer)
  addSyncLog(state, { entity: 'Cliente', reference: customer.omieCode || partner.name, direction: 'Thalamus → Omie', status: 'sincronizado', message: `${partner.name} cadastrado no Omie a partir do CRM` })
  return customer
}

function releasedRevision(state: ErpState, itemId: string) {
  const item = getItem(state, itemId)
  return state.productRevisions.find(entry => entry.id === item.currentRevisionId)?.code ?? item.revision
}

/** O pedido nasce no Thalamus aguardando análise. Com o Omie ligado e a fonte decidida, segue também para lá. */
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
    opportunity.stage = 'Ganho'
    opportunity.probability = 100
    opportunity.value = Math.round(total)
    opportunity.wonAt = today()
  }
  const first = orderLines.find(line => ['03', '04', '06'].includes(getItem(state, line.itemId).type)) ?? orderLines[0]
  const orderId = `PV-2026-${String(state.counters.PV = (state.counters.PV ?? 1056) + 1)}`
  state.salesOrders.unshift({
    id: orderId, customerId: customer.id, itemId: first.itemId, quantity: first.quantity,
    lines: orderLines.map(line => ({ ...line, revision: releasedRevision(state, line.itemId) })),
    promisedDate: proposal.suggestedDate, priority: 'Normal', value: total, receivedAt: now(), planned: false,
    origin: 'Thalamus', proposalId: proposal.id, opportunityId: proposal.opportunityId, paymentTerms: proposal.paymentTerms,
  })
  proposal.salesOrderId = orderId
  log(state, 'Comercial', actor, `${proposal.id} aceita; pedido ${orderId} criado aguardando análise`, orderId)
  if (opportunity) log(state, 'CRM', actor, `Ganha: pedido ${orderId} gerado (${money(total)})`, undefined, opportunity.id)
}

/* ---------- Pedidos de venda ---------- */

/**
 * Fecha a análise técnica e comercial. Só o pedido confirmado é planejado.
 * Com o Omie ligado e a fonte decidida, o pedido segue para lá; sem Omie, fica só no Thalamus.
 */
export function confirmSalesOrder(state: ErpState, id: string, actor: string) {
  const order = find(state.salesOrders, id, 'Pedido')
  if (salesOrderStatus(state, order) !== 'Aguardando análise') throw new DomainError('O pedido não está aguardando análise')
  for (const line of order.lines ?? []) assertUsable(getItem(state, line.itemId), 'venda')
  order.confirmedAt = now()
  order.confirmedBy = actor
  if (!omieBlock(state, 'Pedido de venda')) order.omieId ??= `OM-${String(state.counters.OM = (state.counters.OM ?? 98510) + 1)}`
  addSyncLog(state, { entity: 'Pedido de venda', reference: order.id, direction: 'Thalamus → Omie', status: 'sincronizado', message: `Pedido confirmado enviado ao Omie${order.omieId ? ` como ${order.omieId}` : ''}` })
  log(state, 'Comercial', actor, `${order.id} confirmado para atendimento`, order.id)
  return order
}

/** Quantidade e preço derivam da proposta; mudar exige motivo e fica registrado. Só antes do planejamento. */
export function changeSalesOrderLine(state: ErpState, id: string, index: number, patch: { quantity?: number; unitPrice?: number }, reason: string, actor: string) {
  const order = find(state.salesOrders, id, 'Pedido')
  if (order.planned || order.cancelledAt || order.shipment) throw new DomainError('Pedido planejado, expedido ou cancelado não muda por aqui')
  if (!reason.trim()) throw new DomainError('Informe o motivo da alteração')
  const line = order.lines?.[index]
  if (!line) throw new DomainError('Linha não encontrada')
  order.changes ??= []
  const gross = (order.lines ?? []).reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0)
  const net = gross ? order.value / gross : 1
  for (const field of ['quantity', 'unitPrice'] as const) {
    const value = patch[field]
    if (value === undefined || value === line[field]) continue
    if (field === 'quantity' ? !(value > 0) : !(value >= 0)) throw new DomainError('Valor inválido')
    order.changes.push({ at: now(), actor, line: index, field, from: line[field], to: value, reason: reason.trim() })
    line[field] = value
  }
  const lines = order.lines ?? []
  order.value = Math.round(lines.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0) * net * 100) / 100
  const main = lines.find(entry => entry.itemId === order.itemId)
  if (main) order.quantity = main.quantity
  log(state, 'Comercial', actor, `${order.id}: linha ${index + 1} alterada (${reason.trim()})`, order.id)
  return order
}

export function cancelSalesOrder(state: ErpState, id: string, reason: string, actor: string) {
  const order = find(state.salesOrders, id, 'Pedido')
  if (order.cancelledAt) throw new DomainError('Pedido já cancelado')
  if (order.planned || order.shipment) throw new DomainError('Pedido já planejado: o cancelamento passa pelo PCP')
  if (!reason.trim()) throw new DomainError('Informe o motivo do cancelamento')
  order.cancelledAt = now()
  order.cancelReason = reason.trim()
  log(state, 'Comercial', actor, `${order.id} cancelado: ${reason.trim()}`, order.id)
  return order
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
  const coverage = warrantyCoverage(state, order)
  const warranty = coverage.covered
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
  log(state, 'Assistência', actor, `${technical.id} aberto${warranty ? ' em garantia' : ' cobrável'} para ${order.id} (${coverage.reason})`, order.id, technical.id)
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
  input: Pick<Project, 'name' | 'kind' | 'ownerId' | 'startDate' | 'endDate'> & Partial<Pick<Project, 'partnerId' | 'description' | 'itemId' | 'opportunityId' | 'scope' | 'priority'>> & { budget?: number },
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

/** Resultado e entregáveis do projeto. No P&D, é o que a Engenharia decidiu sobre o item avaliado. */
export function recordProjectResult(state: ErpState, id: string, result: string, actor: string) {
  const project = find(state.projects, id, 'Projeto')
  if (!result.trim()) throw new DomainError('Descreva o resultado')
  project.result = result.trim()
  log(state, 'Projetos', actor, `Resultado registrado: ${result.trim()}`, undefined, id)
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

function knownShift(state: ErpState, name: string) {
  if (!name.trim()) return ''
  const found = state.shifts.find(entry => entry.name.trim().toLocaleLowerCase('pt-BR') === name.trim().toLocaleLowerCase('pt-BR'))
  if (!found) throw new DomainError('Cadastre o turno antes de usar')
  return found.name
}

export function createUser(state: ErpState, input: Pick<User, 'name' | 'role' | 'sector' | 'shift'> & Partial<Pick<User, 'email' | 'positionId'>>, actor: string) {
  if (!input.name.trim()) throw new DomainError('Informe o nome')
  if (input.email && state.users.some(entry => entry.email === input.email)) throw new DomainError('E-mail já utilizado')
  const user: User = { id: `u${String(state.counters.U = (state.counters.U ?? 15) + 1)}`, pin: String(1000 + (state.counters.U * 37) % 9000), active: true, ...input, shift: knownShift(state, input.shift) }
  state.users.push(user)
  log(state, 'Pessoas', actor, `${user.name} cadastrado como ${user.role}`, undefined, user.id)
  return user
}

export function updateUser(state: ErpState, id: string, patch: Partial<Pick<User, 'role' | 'sector' | 'shift' | 'positionId' | 'email' | 'active'>>, actor: string) {
  const user = find(state.users, id, 'Pessoa')
  if (patch.shift !== undefined) patch = { ...patch, shift: knownShift(state, patch.shift) }
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
  if (patch.facilityId !== undefined && patch.facilityId !== asset.facilityId) throw new DomainError('A localização muda só por movimentação concluída')
  if (patch.status && patch.status !== asset.status && (['Locado', 'Baixado'].includes(patch.status) || ['Locado', 'Baixado'].includes(asset.status ?? ''))) {
    throw new DomainError('Locado e Baixado mudam pelo contrato de locação ou pela movimentação de baixa')
  }
  Object.assign(asset, patch)
  log(state, 'Ativos', actor, 'Cadastro do ativo atualizado', undefined, id)
  return asset
}

/* ---------- Engenharia ---------- */

/** Libera a versão: a anterior ganha fim de vigência e fica guardada; OPs novas passam a usar esta. */
export function releaseRevision(state: ErpState, revisionId: string, actor: string, validFrom = today()) {
  const revision = find(state.productRevisions, revisionId, 'Revisão')
  if (revision.status !== 'Rascunho') throw new DomainError('Só uma versão em rascunho pode ser liberada')
  if (revision.createdBy && revision.createdBy === actor) throw new DomainError('Quem elaborou a revisão não aprova: a liberação é de outra pessoa')
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

/** Rejeição é decisão registrada: a revisão sai de circulação e a vigente continua valendo. */
export function rejectRevision(state: ErpState, revisionId: string, reason: string, actor: string) {
  const revision = find(state.productRevisions, revisionId, 'Revisão')
  if (revision.status !== 'Rascunho') throw new DomainError('Só uma versão em rascunho pode ser rejeitada')
  if (!reason.trim()) throw new DomainError('Informe o motivo da rejeição')
  if (revision.createdBy && revision.createdBy === actor) throw new DomainError('Quem elaborou a revisão não decide sobre ela. Descarte o rascunho se quiser desistir')
  revision.status = 'Rejeitada'
  revision.rejectedAt = now()
  revision.rejectedBy = actor
  revision.rejectionReason = reason.trim()
  const item = getItem(state, revision.itemId)
  item.catalog?.audit.unshift({ at: now(), actor, text: `Revisão ${revision.code} rejeitada: ${reason.trim()}`, version: item.catalog.version, field: 'Estrutura', from: `Versão ${revision.code} em rascunho`, to: 'Rejeitada' })
  log(state, 'Engenharia', actor, `${item.code}: revisão ${revision.code} rejeitada (${reason.trim()})`, undefined, item.id)
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
    for (const entry of state.salesOrders.filter(item => salesOrderStatus(state, item) === 'Aguardando análise')) {
      tasks.push({ id: `${entry.id}-analise`, title: `Confirmar ${entry.id}`, detail: 'Pedido do Thalamus aguardando análise técnica e comercial', to: '/pedidos' })
    }
  }
  if (hasFullAccess(role)) {
    for (const entry of state.proposals.filter(item => item.status === 'Em aprovação')) {
      tasks.push({ id: `${entry.id}-desconto`, title: `Aprovar desconto de ${entry.id}`, detail: `${entry.discount}% pedido por ${entry.approvalRequestedBy ?? '—'}`, to: '/crm/propostas', record: { kind: 'proposal', id: entry.id } })
    }
  }
  if (is('Compras')) {
    for (const entry of state.demands.filter(item => item.status === 'Aberta' && item.assigneeRole === 'Compras')) tasks.push({ id: entry.id, title: `Atender ${entry.id}`, detail: entry.description, to: '/demandas', record: { kind: 'demand', id: entry.id } })
    for (const entry of state.purchaseOrders.filter(item => item.status === 'Aguardando aprovação')) tasks.push({ id: entry.id, title: `Aprovar ${entry.id}`, detail: 'Pedido aguardando alçada', to: '/compras', record: { kind: 'purchase', id: entry.id } })
    for (const entry of state.receipts.filter(item => item.status === 'Bloqueado')) tasks.push({ id: entry.id, title: `Decidir ${entry.id} bloqueado`, detail: `${entry.check}: ${entry.received - entry.accepted} ${getItem(state, entry.itemId).unit} de ${getItem(state, entry.itemId).name} · ${entry.purchaseOrderId}`, to: '/recebimento' })
  }
  if (is('Almoxarifado')) {
    for (const entry of state.demands.filter(item => item.status === 'Aberta' && item.assigneeRole === 'Almoxarifado')) tasks.push({ id: entry.id, title: `Separar ${entry.id}`, detail: entry.description, to: '/demandas', record: { kind: 'demand', id: entry.id } })
    for (const entry of state.purchaseOrders.filter(item => (item.status === 'Aprovado' || item.status === 'Recebido parcial') && openToReceive(state, item) > 0)) tasks.push({ id: `${entry.id}-rec`, title: `Receber ${entry.id}`, detail: `${openToReceive(state, entry)} ${getItem(state, entry.itemId).unit} de ${getItem(state, entry.itemId).name}`, to: '/recebimento' })
  }
  if (is('Assistência')) {
    for (const entry of state.technicalServiceOrders.filter(item => !['Concluída', 'Cancelada'].includes(item.status))) tasks.push({ id: entry.id, title: `${entry.id} · ${entry.status}`, detail: entry.description, to: '/assistencia', record: { kind: 'technical', id: entry.id } })
  }
  if (is('Engenharia')) {
    for (const entry of state.productRevisions.filter(item => item.status === 'Rascunho')) tasks.push({ id: entry.id, title: `Decidir revisão ${entry.code}`, detail: `${getItem(state, entry.itemId).name} · elaborada por ${entry.createdBy ?? '—'}`, to: '/revisoes' })
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
