import type {
  AccessProfile, Asset, Budget, BudgetAlert, BudgetCategory, BudgetEntry, BudgetException, BusinessPartner, Customer, Demand, Downtime, EconomicGroup, FinancialTitle, FiscalRule, FlowEvent, FlowStage, Functionality, Item, ItemClass, ItemModel, JobPosition, OmieConnection,
  MachineState, MaintenanceOrder, NonConformity, Opportunity, OpMaterial, Operation, PriceTable, ProductRevision, ProductionOrder, Project,
  OmieCategory, OmiePayment, Proposal, PurchaseOrder, Requisition, RequisitionStatus, Resource, SalesOrder, Sector, ServiceCatalogItem,
  ShopAlert, StockMovement, SyncLog, TechnicalServiceOrder, Tenant, User, UserProfileAssignment,
} from '../types/domain'

export interface ErpState {
  customers: Customer[]
  items: Item[]
  itemClasses: ItemClass[]
  resources: Resource[]
  assets: Asset[]
  users: User[]
  sectors: Sector[]
  positions: JobPosition[]
  partners: BusinessPartner[]
  salesOrders: SalesOrder[]
  omieQueue: SalesOrder[]
  productionOrders: ProductionOrder[]
  requisitions: Requisition[]
  movements: StockMovement[]
  downtimes: Downtime[]
  nonConformities: NonConformity[]
  maintenanceOrders: MaintenanceOrder[]
  alerts: ShopAlert[]
  events: FlowEvent[]
  syncLogs: SyncLog[]
  productRevisions: ProductRevision[]
  services: ServiceCatalogItem[]
  demands: Demand[]
  purchaseOrders: PurchaseOrder[]
  opportunities: Opportunity[]
  proposals: Proposal[]
  technicalServiceOrders: TechnicalServiceOrder[]
  projects: Project[]
  budgetCategories: BudgetCategory[]
  budgets: Budget[]
  budgetEntries: BudgetEntry[]
  budgetExceptions: BudgetException[]
  budgetAlerts: BudgetAlert[]
  omiePayments: OmiePayment[]
  omieCategoryInbox: OmieCategory[]
  financialTitles: FinancialTitle[]
  priceTables: PriceTable[]
  itemModels: ItemModel[]
  fiscalRules: FiscalRule[]
  /** Catálogo de ações protegidas, empresas, perfis e vínculos no mockup. */
  functionalities: Functionality[]
  tenants: Tenant[]
  economicGroups: EconomicGroup[]
  omieConnections: OmieConnection[]
  accessProfiles: AccessProfile[]
  userProfileAssignments: UserProfileAssignment[]
  counters: Record<string, number>
}

export class DomainError extends Error {}

export const FLOW_STAGES: FlowStage[] = ['Entrada', 'Materiais', 'Injeção', 'Montagem', 'Qualidade', 'Expedição', 'Faturado']

export const PAUSE_REASONS = [
  'Setup / troca de molde', 'Falta de material', 'Ajuste de processo', 'Quebra de máquina',
  'Aguardando qualidade', 'Intervalo / refeição', 'Falta de operador',
]

export const SCRAP_REASONS = ['Rebarba excessiva', 'Bolha / chupagem', 'Peça incompleta', 'Risco / mancha', 'Montagem incorreta']

const MAINTENANCE_REASONS = ['Quebra de máquina']
const REQUISITION_FLOW: RequisitionStatus[] = ['Solicitada', 'Em cotação', 'Aprovada', 'Pedido emitido', 'Recebida']

let clockOverride: Date | null = null

export function setClock(date: Date | null) {
  clockOverride = date
}

export function now(): string {
  return (clockOverride ?? new Date()).toISOString()
}

export function today(): string {
  const date = clockOverride ?? new Date()
  return localDate(date)
}

function localDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return localDate(value)
}

const round = (value: number) => Math.round(value * 1000) / 1000

export function nextId(state: ErpState, prefix: string): string {
  state.counters[prefix] = (state.counters[prefix] ?? 0) + 1
  return `${prefix}-${state.counters[prefix]}`
}

export function getItem(state: ErpState, id: string): Item {
  const item = state.items.find(entry => entry.id === id)
  if (!item) throw new DomainError(`Item ${id} não encontrado`)
  return item
}

export function getOrder(state: ErpState, id: string): SalesOrder {
  const order = state.salesOrders.find(entry => entry.id === id)
  if (!order) throw new DomainError(`Pedido ${id} não encontrado`)
  return order
}

export function getOp(state: ErpState, id: string): ProductionOrder {
  const op = state.productionOrders.find(entry => entry.id === id)
  if (!op) throw new DomainError(`OP ${id} não encontrada`)
  return op
}

export function getResource(state: ErpState, id: string): Resource {
  const resource = state.resources.find(entry => entry.id === id)
  if (!resource) throw new DomainError(`Recurso ${id} não encontrado`)
  return resource
}

export function log(state: ErpState, module: string, actor: string, text: string, orderId?: string, ref?: string) {
  state.events.unshift({ id: nextId(state, 'EV'), at: now(), orderId, ref, module, actor, text })
  if (state.events.length > 400) state.events.length = 400
}

export function addSyncLog(state: ErpState, entry: Omit<SyncLog, 'id' | 'at'>): SyncLog {
  const record: SyncLog = { id: nextId(state, 'SY'), at: now(), ...entry }
  state.syncLogs.unshift(record)
  return record
}

function addMovement(state: ErpState, itemId: string, type: StockMovement['type'], quantity: number, reference: string, lots?: string) {
  state.movements.unshift({ id: nextId(state, 'MV'), itemId, type, quantity: round(quantity), reference, at: now(), lots })
}

/* ---------- Uso do item em transações ---------- */

export type ItemUse = 'venda' | 'compra' | 'produção' | 'consumo'

/** Rascunho e homologação não entram em transação; bloqueado também não; obsoleto só consome o saldo que sobrou. */
export function assertUsable(item: Item, use: ItemUse) {
  const catalog = item.catalog
  if (!catalog) return
  if (catalog.deletedAt) throw new DomainError(`${item.code} foi excluído do cadastro`)
  const life = catalog.lifecycle
  if (life === 'Ativo') {
    if (use === 'venda' && catalog.nature === 'Imobilizado') throw new DomainError(`${item.code} é imobilizado e não é vendido`)
    if (use === 'compra' && (catalog.nature === 'Serviço' || catalog.nature === 'Kit virtual')) throw new DomainError(`${item.code} não é comprado como material`)
    return
  }
  if (life === 'Obsoleto' && use === 'consumo') return
  const reason: Record<string, string> = {
    Rascunho: 'ainda é rascunho', 'Em homologação': 'ainda está em homologação', Bloqueado: 'está bloqueado',
    Obsoleto: 'está obsoleto: só o saldo restante pode ser consumido', Inativo: 'está inativo',
  }
  throw new DomainError(`${item.code} ${reason[life]} e não entra em ${use}`)
}

/* ---------- Lotes, FEFO e saldo ---------- */

const sortLots = (item: Item) => (item.lots ?? []).sort((a, b) =>
  (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999') || a.receivedAt.localeCompare(b.receivedAt) || a.code.localeCompare(b.code))

/** Baixa o saldo; com validade sai primeiro o lote que vence antes (FEFO), sem validade o mais antigo. */
export function consumeStock(state: ErpState, item: Item, quantity: number) {
  const result = round(item.stock - quantity)
  if (result < 0 && !item.catalog?.allowNegative) {
    throw new DomainError(`${item.code} não permite estoque negativo: saldo ${item.stock} ${item.unit}, pedido ${quantity}`)
  }
  item.stock = result
  if (!item.lots?.length) return undefined
  const used: string[] = []
  let left = quantity
  for (const lot of sortLots(item)) {
    if (left <= 0) break
    const take = Math.min(lot.quantity, left)
    if (take <= 0) continue
    lot.quantity = round(lot.quantity - take)
    left = round(left - take)
    used.push(`${lot.code} (${take})`)
  }
  item.lots = item.lots.filter(lot => lot.quantity > 0)
  void state
  return used.join(', ')
}

export function receiveStock(state: ErpState, item: Item, quantity: number, reference: string) {
  item.stock = round(item.stock + quantity)
  if (!item.catalog?.lot && !item.catalog?.expiry) return undefined
  const code = `L${today().slice(2).replace(/-/g, '')}-${String((state.counters.LOT = (state.counters.LOT ?? 0) + 1)).padStart(3, '0')}`
  item.lots ??= []
  item.lots.push({ code, quantity: round(quantity), receivedAt: now(), expiry: item.catalog?.expiry ? addDays(today(), 180) : undefined })
  void reference
  return code
}

/* ---------- Estoque e reservas ---------- */

export function reservedQty(state: ErpState, itemId: string): number {
  return round(state.productionOrders
    .filter(op => op.status !== 'Concluída')
    .flatMap(op => op.materials)
    .filter(line => line.itemId === itemId && !line.picked)
    .reduce((sum, line) => sum + line.reserved, 0))
}

export function availableQty(state: ErpState, itemId: string): number {
  return round(getItem(state, itemId).stock - reservedQty(state, itemId))
}

export function incomingQty(state: ErpState, itemId: string): number {
  return state.requisitions
    .filter(req => req.itemId === itemId && req.status !== 'Recebida')
    .reduce((sum, req) => sum + req.quantity, 0)
}

export function missingLines(op: ProductionOrder): OpMaterial[] {
  return op.materials.filter(line => !line.picked && line.reserved < line.required)
}

/** Distribui o saldo livre entre as OPs por data de entrega; injeção antes de montagem. */
export function allocate(state: ErpState) {
  const candidates = state.productionOrders
    .filter(op => op.status === 'Aguardando material' || op.status === 'Planejada')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.kind === b.kind ? 0 : a.kind === 'Injeção' ? -1 : 1))

  for (const op of candidates) {
    for (const line of missingLines(op)) {
      const free = availableQty(state, line.itemId)
      const take = Math.min(free, round(line.required - line.reserved))
      if (take > 0) line.reserved = round(line.reserved + take)
    }
    if (op.status === 'Aguardando material' && missingLines(op).length === 0) {
      op.status = 'Planejada'
      log(state, 'Materiais', 'Sistema', `${op.id}: materiais reservados, pronta para separação`, op.salesOrderId)
    }
  }
}

/** Lote mínimo e múltiplo do cadastro mandam; sem eles vale o arredondamento padrão da compra. */
export function purchaseLot(item: Item, quantity: number) {
  const minLot = item.catalog?.minLot ?? 0
  const multiple = item.catalog?.lotMultiple ?? 0
  if (minLot > 0 || multiple > 0) {
    const base = Math.max(quantity, minLot)
    return multiple > 0 ? Math.ceil(round(base / multiple)) * multiple : base
  }
  const lot = item.unit === 'kg' ? 25 : quantity > 500 ? 100 : 10
  return Math.ceil(quantity / lot) * lot
}

/** Explica, em uma frase, por que a compra arredondou a quantidade pedida. */
export function purchaseLotRule(item: Item, quantity: number) {
  const minLot = item.catalog?.minLot ?? 0
  const multiple = item.catalog?.lotMultiple ?? 0
  if (minLot > 0 || multiple > 0) {
    return [minLot ? `lote mínimo ${minLot}` : '', multiple ? `múltiplo de ${multiple}` : ''].filter(Boolean).join(' · ')
  }
  return `embalagem padrão de ${item.unit === 'kg' ? 25 : quantity > 500 ? 100 : 10} ${item.unit}`
}

/** Necessidade bruta da linha de estrutura, já com a perda prevista. */
export function lineNeed(line: { quantity: number; loss?: number }, quantity: number) {
  return round(line.quantity * (1 + (line.loss ?? 0) / 100) * quantity)
}

export function createRequisition(state: ErpState, itemId: string, quantity: number, origin: string, neededBy: string, actor: string, orderId?: string) {
  const item = getItem(state, itemId)
  assertUsable(item, 'compra')
  const requisition: Requisition = {
    id: nextId(state, 'RC'), itemId, quantity: purchaseLot(item, quantity), origin, neededBy, status: 'Solicitada',
    supplier: item.supplier ?? 'A definir', unitPrice: item.cost, createdAt: now(),
  }
  state.requisitions.unshift(requisition)
  log(state, 'Compras', actor, `${requisition.id} gerada automaticamente: ${requisition.quantity} ${item.unit} de ${item.name}`, orderId)
  return requisition
}

/* ---------- Planejamento ---------- */

function toOperation(step: { id: string; name: string; resourceId: string; minutesPerUnit: number; instructions: string[] }): Operation {
  return { ...step, instructions: [...step.instructions], status: 'Aguardando', good: 0, scrap: 0, accumulatedMs: 0 }
}

function createInjectionOp(state: ErpState, order: SalesOrder, part: Item, quantity: number, due: string, actor: string) {
  const mold = state.assets.find(asset => asset.id === part.moldId)
  const resourceId = mold?.resourceId ?? 'inj1'
  const id = nextId(state, 'OP')
  const op: ProductionOrder = {
    id, kind: 'Injeção', salesOrderId: order.id, itemId: part.id, revisionId: part.currentRevisionId, quantity, dueDate: due, scheduledDate: addDays(due, -1),
    resourceId, status: 'Aguardando material', createdAt: now(), budgetCategoryId: 'BC-OPER', budgetPeriod: due.slice(0, 7), estimatedCost: round(part.cost * quantity),
    materials: (part.bom ?? []).map(line => ({ itemId: line.itemId, required: lineNeed(line, quantity), reserved: 0, picked: false })),
    operations: [toOperation({
      id: `${id}-inj`, name: 'Injeção', resourceId, minutesPerUnit: round((part.cycleSeconds ?? 45) / (part.cavities ?? 1) / 60),
      instructions: [`Montar molde ${mold?.name ?? part.moldId}`, `Ciclo padrão ${part.cycleSeconds}s · ${part.cavities} cavidade(s)`, 'Liberar primeira peça com a qualidade', 'Separar refugo por motivo'],
    })],
  }
  state.productionOrders.push(op)
  log(state, 'PCP', actor, `${id} de injeção criada: ${quantity} un. de ${part.name}`, order.id)
  allocate(state)
  for (const line of missingLines(op)) {
    createRequisition(state, line.itemId, line.required - line.reserved, `${order.id} · ${id}`, addDays(due, -3), actor, order.id)
  }
  return op
}

/** Versão liberada com vigência futura só entra na estrutura do item na data; até lá a anterior continua valendo. */
export function applyDueRevisions(state: ErpState, date = today()) {
  for (const item of state.items) {
    const due = state.productRevisions
      .filter(entry => entry.itemId === item.id && entry.status === 'Liberada' && (entry.validFrom ?? '') <= date)
      .sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))
    applyDueCatalog(item, date)
    const current = due[0]
    if (!current) continue
    for (const older of due.slice(1)) older.status = 'Substituída'
    if (item.currentRevisionId === current.id) continue
    if (current.lines) item.bom = current.lines.map(line => ({ ...line }))
    item.revision = current.code
    item.currentRevisionId = current.id
  }
}

const latestDue = <T extends { validFrom: string }>(entries: T[] | undefined, date: string) =>
  (entries ?? []).filter(entry => entry.validFrom <= date).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]

/** Custo-padrão e camada da reforma também têm vigência: a entrada mais recente já vigente é a que vale. */
function applyDueCatalog(item: Item, date: string) {
  const catalog = item.catalog
  if (!catalog) return
  const cost = latestDue(catalog.costs, date)
  if (cost) item.cost = cost.value
  const reform = latestDue(catalog.reform, date)
  if (reform) catalog.cClassTrib = reform.cClassTrib
}

export function planOrder(state: ErpState, orderId: string, actor: string) {
  applyDueRevisions(state)
  const order = getOrder(state, orderId)
  if (order.planned) throw new DomainError('Este pedido já foi planejado')
  const product = getItem(state, order.itemId)
  assertUsable(product, 'produção')
  if (!product.bom?.length || !product.routing?.length) throw new DomainError('Produto sem estrutura ou roteiro oficial')
  for (const line of product.bom) {
    const component = getItem(state, line.itemId)
    assertUsable(component, 'consumo')
    const short = round(lineNeed(line, order.quantity) - availableQty(state, component.id)) > 0
    if (short) assertUsable(component, component.type === 'SE' ? 'produção' : 'compra')
  }

  const due = addDays(order.promisedDate, -1)
  const montId = nextId(state, 'OP')
  const created: string[] = []
  const requisitions: string[] = []
  const materials: OpMaterial[] = []

  for (const line of product.bom) {
    const component = getItem(state, line.itemId)
    const need = lineNeed(line, order.quantity)
    materials.push({ itemId: component.id, required: need, reserved: 0, picked: false })
    const shortfall = round(need - availableQty(state, component.id))
    if (shortfall <= 0) continue
    if (component.type === 'SE') {
      created.push(createInjectionOp(state, order, component, Math.ceil(shortfall / 10) * 10, addDays(due, -2), actor).id)
    } else {
      requisitions.push(createRequisition(state, component.id, shortfall, `${order.id} · ${montId}`, addDays(due, -3), actor, order.id).id)
    }
  }

  const resourceId = product.routing[0].resourceId
  state.productionOrders.push({
    id: montId, kind: 'Montagem', salesOrderId: order.id, itemId: product.id, revisionId: product.currentRevisionId, quantity: order.quantity, dueDate: due,
    scheduledDate: addDays(due, -1), resourceId, status: 'Aguardando material', materials, createdAt: now(),
    budgetCategoryId: 'BC-OPER', budgetPeriod: due.slice(0, 7), estimatedCost: round(product.cost * order.quantity),
    operations: product.routing.map(step => toOperation({ ...step, id: `${montId}-${step.id}` })),
  })
  created.push(montId)
  order.planned = true
  log(state, 'PCP', actor, `Pedido planejado: ${created.length} OP(s) e ${requisitions.length} requisição(ões) de compra`, order.id)
  allocate(state)
  return { ops: created, requisitions }
}

export function receiveOmieOrders(state: ErpState, imported: SalesOrder[]) {
  for (const order of imported) {
    if (state.salesOrders.some(existing => existing.omieId === order.omieId)) continue
    order.receivedAt = now()
    state.salesOrders.unshift(order)
    addSyncLog(state, { entity: 'Pedido de venda', reference: order.id, direction: 'Omie → Thalamus', status: 'sincronizado', message: `Pedido ${order.omieId} importado e validado` })
    log(state, 'Comercial', 'Integração Omie', `Pedido aprovado recebido do Omie (${order.omieId})`, order.id)
  }
  if (!imported.length) {
    addSyncLog(state, { entity: 'Pedido de venda', reference: 'Consulta incremental', direction: 'Omie → Thalamus', status: 'sincronizado', message: 'Nenhum pedido novo desde a última sincronização' })
  }
  return imported.length
}

export function scheduleOp(state: ErpState, opId: string, resourceId: string, date: string, actor: string) {
  const op = getOp(state, opId)
  if (op.status === 'Concluída') throw new DomainError('OP concluída não pode ser reprogramada')
  const target = getResource(state, resourceId)
  const previousKind = getResource(state, op.resourceId).kind
  if (target.kind !== previousKind) throw new DomainError(`Esta OP só pode ir para recursos do tipo ${previousKind}`)
  for (const operation of op.operations) {
    if (operation.resourceId === op.resourceId && operation.status !== 'Concluída') operation.resourceId = resourceId
  }
  op.resourceId = resourceId
  op.scheduledDate = date
  log(state, 'PCP', actor, `${op.id} programada para ${target.name} em ${date.split('-').reverse().join('/')}`, op.salesOrderId)
}

/* ---------- Compras ---------- */

export function advanceRequisition(state: ErpState, id: string, actor: string) {
  const requisition = state.requisitions.find(entry => entry.id === id)
  if (!requisition) throw new DomainError('Requisição não encontrada')
  const index = REQUISITION_FLOW.indexOf(requisition.status)
  if (index === REQUISITION_FLOW.length - 1) throw new DomainError('Requisição já recebida')
  const nextStatus = REQUISITION_FLOW[index + 1]
  const item = getItem(state, requisition.itemId)
  const orderId = requisition.origin.split(' · ')[0]

  if (nextStatus === 'Recebida') {
    const lot = receiveStock(state, item, requisition.quantity, requisition.omiePo ?? requisition.id)
    addMovement(state, item.id, 'Entrada', requisition.quantity, requisition.omiePo ?? requisition.id, lot)
    addSyncLog(state, { entity: 'Recebimento', reference: requisition.omiePo ?? requisition.id, direction: 'Omie → Thalamus', status: 'sincronizado', message: `NF-e de entrada conferida: ${requisition.quantity} ${item.unit}` })
    log(state, 'Almoxarifado', actor, `${requisition.id} recebida: ${requisition.quantity} ${item.unit} de ${item.name}`, orderId)
  } else if (nextStatus === 'Pedido emitido') {
    requisition.omiePo = `PC-${String(state.counters.PC = (state.counters.PC ?? 7300) + 1)}`
    addSyncLog(state, { entity: 'Pedido de compra', reference: requisition.omiePo, direction: 'Thalamus → Omie', status: 'sincronizado', message: `Pedido incluído para ${requisition.supplier}` })
    log(state, 'Compras', actor, `${requisition.id}: pedido ${requisition.omiePo} emitido no Omie`, orderId)
  } else {
    const text = nextStatus === 'Em cotação' ? 'cotação aberta com fornecedores' : `aprovada (${(requisition.quantity * requisition.unitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
    log(state, 'Compras', actor, `${requisition.id}: ${text}`, orderId)
  }
  requisition.status = nextStatus
  if (nextStatus === 'Recebida') allocate(state)
  return requisition
}

/* ---------- Almoxarifado ---------- */

export function adjustStock(state: ErpState, itemId: string, countedQty: number, reason: string, actor: string) {
  const item = getItem(state, itemId)
  if (countedQty < 0) throw new DomainError('A contagem não pode ser negativa')
  if (countedQty < reservedQty(state, itemId)) throw new DomainError('Contagem menor que o volume já reservado para OPs. Revise as reservas antes do ajuste.')
  const difference = round(countedQty - item.stock)
  if (difference === 0) throw new DomainError('Contagem igual ao saldo atual')
  const lots = difference < 0 ? consumeStock(state, item, -difference) : receiveStock(state, item, difference, reason)
  addMovement(state, item.id, 'Ajuste', difference, reason, lots)
  addSyncLog(state, { entity: 'Ajuste de estoque', reference: item.code, direction: 'Thalamus → Omie', status: 'sincronizado', message: `${difference > 0 ? '+' : ''}${difference} ${item.unit} · ${reason}` })
  log(state, 'Almoxarifado', actor, `Inventário de ${item.name}: ${difference > 0 ? '+' : ''}${difference} ${item.unit} (${reason})`)
  allocate(state)
  return difference
}

export function pickOp(state: ErpState, opId: string, actor: string) {
  const op = getOp(state, opId)
  if (op.status !== 'Planejada') throw new DomainError('Só é possível separar OPs com todos os materiais reservados')
  for (const line of op.materials) {
    const item = getItem(state, line.itemId)
    const lots = consumeStock(state, item, line.reserved)
    line.picked = true
    line.lots = lots
    addMovement(state, item.id, 'Saída', line.reserved, op.id, lots)
  }
  op.status = 'Liberada'
  op.operations[0].status = 'Disponível'
  log(state, 'Almoxarifado', actor, `${op.id}: kit separado e entregue em ${getResource(state, op.resourceId).name}`, op.salesOrderId)
}

/* ---------- Chão de fábrica ---------- */

export function findOperation(state: ErpState, opId: string, operationId: string) {
  const op = getOp(state, opId)
  const operation = op.operations.find(entry => entry.id === operationId)
  if (!operation) throw new DomainError('Operação não encontrada')
  return { op, operation }
}

export function machineAsset(state: ErpState, resourceId: string) {
  return state.assets.find(asset => asset.kind === 'Injetora' && asset.resourceId === resourceId)
}

export function openCorrective(state: ErpState, resourceId: string) {
  const asset = machineAsset(state, resourceId)
  return asset ? state.maintenanceOrders.find(order => order.assetId === asset.id && order.type === 'Corretiva' && order.status !== 'Concluída') : undefined
}

export function machineState(state: ErpState, resourceId: string): MachineState {
  if (openCorrective(state, resourceId)) return 'Manutenção'
  const operations = state.productionOrders.filter(op => op.status !== 'Concluída').flatMap(op => op.operations).filter(op => op.resourceId === resourceId)
  if (operations.some(op => op.status === 'Em execução')) return 'Produzindo'
  if (operations.some(op => op.status === 'Pausada')) return 'Parada'
  return 'Livre'
}

export function elapsedMs(operation: Operation, reference = Date.now()) {
  return operation.accumulatedMs + (operation.startedAt ? reference - new Date(operation.startedAt).getTime() : 0)
}

function closeDowntime(state: ErpState, opId: string) {
  const open = state.downtimes.find(entry => entry.opId === opId && !entry.end)
  if (open) open.end = now()
}

export function startOperation(state: ErpState, opId: string, operationId: string, operator: string) {
  const { op, operation } = findOperation(state, opId, operationId)
  if (!['Disponível', 'Pausada'].includes(operation.status)) throw new DomainError('Operação não está liberada para início')
  if (openCorrective(state, operation.resourceId)) throw new DomainError('Máquina em manutenção corretiva. Aguarde a liberação.')
  const resource = getResource(state, operation.resourceId)
  if (resource.kind === 'Injetora') {
    const busy = state.productionOrders.some(other => other.id !== op.id && other.operations.some(entry => entry.resourceId === resource.id && entry.status === 'Em execução'))
    if (busy) throw new DomainError(`${resource.name} já está produzindo outra OP`)
  }
  const resumed = operation.status === 'Pausada'
  if (resumed) closeDowntime(state, op.id)
  operation.status = 'Em execução'
  operation.startedAt = now()
  operation.operator = operator
  operation.pauseReason = undefined
  if (op.status === 'Liberada') op.status = 'Em produção'
  log(state, 'Produção', operator, `${op.id} · ${operation.name} ${resumed ? 'retomada' : 'iniciada'} em ${resource.name}`, op.salesOrderId)
}

export function createMaintenance(state: ErpState, assetId: string, type: MaintenanceOrder['type'], description: string, origin: string, actor: string, estimatedCost = 1500, budgetCategoryId = 'BC-OPER', budgetPeriod = today().slice(0, 7)) {
  const order: MaintenanceOrder = { id: nextId(state, 'OS'), assetId, type, description, status: 'Aberta', createdAt: now(), origin, estimatedCost, budgetCategoryId, budgetPeriod }
  state.maintenanceOrders.unshift(order)
  const asset = state.assets.find(entry => entry.id === assetId)
  log(state, 'Manutenção', actor, `${order.id} ${type.toLowerCase()} aberta para ${asset?.name ?? assetId}`, undefined, assetId)
  return order
}

export function pauseOperation(state: ErpState, opId: string, operationId: string, reason: string, operator: string) {
  const { op, operation } = findOperation(state, opId, operationId)
  if (operation.status !== 'Em execução') throw new DomainError('Só é possível pausar uma operação em execução')
  operation.accumulatedMs = elapsedMs(operation)
  operation.startedAt = undefined
  operation.status = 'Pausada'
  operation.pauseReason = reason
  state.downtimes.unshift({ id: nextId(state, 'DT'), resourceId: operation.resourceId, opId: op.id, reason, start: now() })
  log(state, 'Produção', operator, `${op.id} · ${operation.name} pausada: ${reason}`, op.salesOrderId)
  if (MAINTENANCE_REASONS.includes(reason)) {
    const asset = machineAsset(state, operation.resourceId)
    if (asset) createMaintenance(state, asset.id, 'Corretiva', `Parada informada pelo operador ${operator} durante ${op.id}`, 'Tablet do operador', operator)
  }
}

export function reportProduction(state: ErpState, opId: string, operationId: string, good: number, scrap: number, scrapReason: string, operator: string) {
  const { op, operation } = findOperation(state, opId, operationId)
  if (!['Em execução', 'Pausada'].includes(operation.status)) throw new DomainError('Inicie a operação antes de apontar')
  if (good < 0 || scrap < 0 || good + scrap === 0) throw new DomainError('Informe uma quantidade válida')
  if (scrap > 0 && !scrapReason) throw new DomainError('Informe o motivo do refugo')
  const index = op.operations.indexOf(operation)
  const previous = index > 0 ? op.operations[index - 1] : undefined
  const limit = operation.name === 'Retrabalho' ? op.quantity : previous ? previous.good : Math.ceil(op.quantity * 1.05)
  if (operation.good + good > limit) throw new DomainError(`Quantidade acima do disponível para esta etapa (máximo ${limit - operation.good})`)
  operation.good += good
  operation.scrap += scrap
  const scrapText = scrap ? ` e ${scrap} refugo (${scrapReason})` : ''
  log(state, 'Produção', operator, `${op.id} · ${operation.name}: +${good} boas${scrapText}`, op.salesOrderId)
}

export function finishOperation(state: ErpState, opId: string, operationId: string, operator: string) {
  const { op, operation } = findOperation(state, opId, operationId)
  if (!['Em execução', 'Pausada'].includes(operation.status)) throw new DomainError('Operação não está em andamento')
  if (operation.good <= 0) throw new DomainError('Aponte as peças boas antes de concluir')
  operation.accumulatedMs = elapsedMs(operation)
  operation.startedAt = undefined
  operation.status = 'Concluída'
  closeDowntime(state, op.id)
  log(state, 'Produção', operator, `${op.id} · ${operation.name} concluída com ${operation.good} boas`, op.salesOrderId)

  const next = op.operations[op.operations.indexOf(operation) + 1]
  if (next) {
    next.status = 'Disponível'
    return
  }
  if (op.kind === 'Injeção') {
    const part = getItem(state, op.itemId)
    const mold = state.assets.find(asset => asset.id === part.moldId)
    if (mold) {
      mold.shots = (mold.shots ?? 0) + Math.ceil(operation.good / (part.cavities ?? 1))
      const limit = mold.preventiveLimit ?? 250000
      if (mold.shots >= limit && !state.maintenanceOrders.some(order => order.assetId === mold.id && order.type === 'Preventiva' && order.status !== 'Concluída')) {
        createMaintenance(state, mold.id, 'Preventiva', `Preventiva por contador: ${mold.shots} ciclos`, 'Contador do apontamento', 'Sistema')
      }
    }
    const lot = receiveStock(state, part, operation.good, op.id)
    op.status = 'Concluída'
    addMovement(state, part.id, 'Produção', operation.good, op.id, lot)
    log(state, 'Produção', operator, `${op.id} encerrada: ${operation.good} ${part.name} no estoque`, op.salesOrderId)
    allocate(state)
  } else {
    op.status = 'Inspeção'
    log(state, 'Qualidade', 'Sistema', `${op.id} aguardando inspeção final`, op.salesOrderId)
  }
}

export function raiseAlert(state: ErpState, resourceId: string, operator: string, message: string) {
  state.alerts.unshift({ id: nextId(state, 'AL'), resourceId, operator, message, at: now(), resolved: false })
  log(state, 'Produção', operator, `Chamado ao líder em ${getResource(state, resourceId).name}: ${message}`)
}

export function resolveAlert(state: ErpState, id: string, actor: string) {
  const alert = state.alerts.find(entry => entry.id === id)
  if (!alert) return
  alert.resolved = true
  log(state, 'Produção', actor, `Chamado de ${alert.operator} atendido`)
}

/* ---------- Qualidade ---------- */

export function approveInspection(state: ErpState, opId: string, actor: string) {
  const op = getOp(state, opId)
  if (op.status !== 'Inspeção') throw new DomainError('OP não está aguardando inspeção')
  const product = getItem(state, op.itemId)
  op.status = 'Concluída'
  const lot = receiveStock(state, product, op.quantity, op.id)
  addMovement(state, product.id, 'Produção', op.quantity, op.id, lot)
  log(state, 'Qualidade', actor, `${op.id} aprovada: ${op.quantity} ${product.name} liberados`, op.salesOrderId)

  const order = getOrder(state, op.salesOrderId)
  const assembly = state.productionOrders.filter(entry => entry.salesOrderId === order.id && entry.kind === 'Montagem')
  if (assembly.every(entry => entry.status === 'Concluída') && !order.shipment) {
    order.shipment = { status: 'Aguardando conferência', volumes: Math.ceil(order.quantity / 12), carrier: 'A definir' }
    log(state, 'Expedição', 'Sistema', 'Pedido liberado para conferência e expedição', order.id)
  }
}

export function rejectInspection(state: ErpState, opId: string, quantity: number, reason: string, actor: string) {
  const op = getOp(state, opId)
  if (op.status !== 'Inspeção') throw new DomainError('OP não está aguardando inspeção')
  if (quantity <= 0 || quantity > op.quantity) throw new DomainError('Quantidade reprovada inválida')
  const nc: NonConformity = { id: nextId(state, 'NC'), opId, itemId: op.itemId, quantity, reason, status: 'Aberta', createdAt: now() }
  state.nonConformities.unshift(nc)
  op.operations.push({
    id: `${op.id}-ret-${op.operations.length}`, name: 'Retrabalho', resourceId: op.resourceId, minutesPerUnit: 5,
    instructions: [`Corrigir: ${reason}`, `${quantity} unidade(s) identificadas com etiqueta vermelha`, 'Devolver à inspeção final'],
    status: 'Disponível', good: 0, scrap: 0, accumulatedMs: 0,
  })
  op.status = 'Em produção'
  log(state, 'Qualidade', actor, `${op.id} reprovada parcialmente (${quantity} un.): ${reason}. ${nc.id} aberta e retrabalho enviado à montagem`, op.salesOrderId)
}

export function updateNonConformity(state: ErpState, id: string, status: NonConformity['status'], action: string, actor: string) {
  const nc = state.nonConformities.find(entry => entry.id === id)
  if (!nc) throw new DomainError('Não conformidade não encontrada')
  nc.status = status
  if (action) nc.action = action
  log(state, 'Qualidade', actor, `${nc.id} ${status === 'Encerrada' ? 'encerrada' : 'em análise'}${action ? `: ${action}` : ''}`)
}

/* ---------- Expedição ---------- */

export function confirmShipment(state: ErpState, orderId: string, volumes: number, carrier: string, actor: string) {
  const order = getOrder(state, orderId)
  if (order.shipment?.status !== 'Aguardando conferência') throw new DomainError('Pedido não está aguardando conferência')
  if (volumes <= 0 || !carrier) throw new DomainError('Informe volumes e transportadora')
  order.shipment.status = 'Conferido'
  order.shipment.volumes = volumes
  order.shipment.carrier = carrier
  log(state, 'Expedição', actor, `Conferência concluída: ${volumes} volume(s) · ${carrier}`, order.id)
}

export function shipOrder(state: ErpState, orderId: string, actor: string) {
  const order = getOrder(state, orderId)
  if (order.shipment?.status !== 'Conferido') throw new DomainError('Confira os volumes antes de expedir')
  const product = getItem(state, order.itemId)
  const lots = consumeStock(state, product, order.quantity)
  addMovement(state, product.id, 'Saída', order.quantity, order.id, lots)
  for (const line of order.lines ?? []) {
    if (!line.kitId || line.itemId === product.id) continue
    const component = getItem(state, line.itemId)
    if (component.catalog && component.catalog.nature !== 'Bem') continue
    addMovement(state, component.id, 'Saída', line.quantity, order.id, consumeStock(state, component, line.quantity))
  }
  order.shipment.status = 'Expedido'
  order.shipment.shippedAt = now()
  log(state, 'Expedição', actor, 'Carga expedida. Solicitação de faturamento enviada ao Omie', order.id)
  return addSyncLog(state, { entity: 'Faturamento', reference: order.id, direction: 'Thalamus → Omie', status: 'pendente', message: 'Aguardando emissão da NF-e no Omie' })
}

export function invoiceOrder(state: ErpState, orderId: string, syncLogId?: string, invoice?: string) {
  const order = getOrder(state, orderId)
  if (order.shipment?.status !== 'Expedido') return
  state.counters.NF = (state.counters.NF ?? 18420) + 1
  order.shipment.status = 'Faturado'
  order.shipment.invoice = invoice ?? `NF-e ${state.counters.NF}`
  const pending = state.syncLogs.find(entry => entry.id === syncLogId)
  if (pending) {
    pending.status = 'sincronizado'
    pending.message = `${order.shipment.invoice} emitida e autorizada`
  }
  if (!state.financialTitles.some(entry => entry.kind === 'Receber' && entry.reference === order.id)) {
    state.financialTitles.unshift({
      id: nextId(state, 'AR'), kind: 'Receber', partnerId: order.customerId, description: `${order.shipment.invoice} · ${getItem(state, order.itemId).name}`,
      reference: order.id, amount: order.value, dueDate: addDays(today(), 28), status: 'Aberto', createdAt: now(), origin: 'Venda', costCenter: 'CC-210',
    })
  }
  log(state, 'Faturamento', 'Integração Omie', `${order.shipment.invoice} emitida no Omie`, order.id)
}

/* ---------- Manutenção e integração ---------- */

export function advanceMaintenance(state: ErpState, id: string, actor: string) {
  const order = state.maintenanceOrders.find(entry => entry.id === id)
  if (!order) throw new DomainError('OS não encontrada')
  if (order.status === 'Concluída') throw new DomainError('OS já concluída')
  order.status = order.status === 'Aberta' ? 'Em execução' : 'Concluída'
  const asset = state.assets.find(entry => entry.id === order.assetId)
  log(state, 'Manutenção', actor, `${order.id} ${order.status === 'Concluída' ? 'concluída, equipamento liberado' : 'em execução'} (${asset?.name})`)
}

export function retrySync(state: ErpState, id: string, actor: string) {
  const entry = state.syncLogs.find(logEntry => logEntry.id === id)
  if (!entry || entry.status !== 'erro') return
  entry.status = 'sincronizado'
  entry.message = 'Reprocessado após correção do cadastro'
  entry.at = now()
  log(state, 'Integração', actor, `Integração ${entry.entity} ${entry.reference} reprocessada`)
}

/* ---------- Leituras do fluxo ---------- */

export function opsOf(state: ErpState, orderId: string) {
  return state.productionOrders.filter(op => op.salesOrderId === orderId)
}

export function orderStage(state: ErpState, order: SalesOrder): FlowStage {
  if (order.shipment?.status === 'Faturado') return 'Faturado'
  if (order.shipment) return 'Expedição'
  const ops = opsOf(state, order.id)
  if (!order.planned || !ops.length) return 'Entrada'
  const assembly = ops.filter(op => op.kind === 'Montagem')
  if (assembly.some(op => op.status === 'Inspeção')) return 'Qualidade'
  if (assembly.some(op => op.status === 'Em produção')) return 'Montagem'
  const injection = ops.filter(op => op.kind === 'Injeção' && op.status !== 'Concluída')
  if (injection.some(op => op.status === 'Liberada' || op.status === 'Em produção')) return 'Injeção'
  if (ops.some(op => op.status === 'Aguardando material' || op.status === 'Planejada')) return 'Materiais'
  return 'Montagem'
}

export function opProgress(op: ProductionOrder) {
  if (op.status === 'Concluída') return 100
  const main = op.operations.filter(operation => operation.name !== 'Retrabalho')
  const done = main.reduce((sum, operation) => sum + Math.min(1, operation.good / op.quantity), 0)
  return Math.round(done / main.length * 100)
}

export function orderProgress(state: ErpState, order: SalesOrder) {
  if (order.shipment?.status === 'Faturado') return 100
  if (order.shipment) return order.shipment.status === 'Expedido' ? 97 : 92
  const ops = opsOf(state, order.id)
  if (!ops.length) return 0
  return Math.round(ops.reduce((sum, op) => sum + opProgress(op), 0) / ops.length * 0.9)
}

export function orderRisks(state: ErpState, order: SalesOrder): string[] {
  const stage = orderStage(state, order)
  if (stage === 'Faturado') return []
  const risks: string[] = []
  const ops = opsOf(state, order.id)
  const daysLeft = Math.round((new Date(`${order.promisedDate}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000)
  if (daysLeft < 0 && stage !== 'Expedição') risks.push(`Atrasado ${-daysLeft} dia(s)`)
  else if (daysLeft <= 3 && ['Entrada', 'Materiais', 'Injeção'].includes(stage)) risks.push('Prazo crítico')
  if (ops.some(op => op.status === 'Aguardando material')) risks.push('Material em falta')
  if (ops.some(op => op.operations.some(operation => operation.status === 'Pausada'))) risks.push('Operação parada')
  if (ops.some(op => op.operations.some(operation => operation.name === 'Retrabalho' && operation.status !== 'Concluída'))) risks.push('Retrabalho em andamento')
  if (stage === 'Entrada' && daysLeft <= 10) risks.push('Aguardando planejamento')
  return risks
}

export function resourceLoad(state: ErpState, resourceId: string, date: string) {
  const resource = getResource(state, resourceId)
  const minutes = state.productionOrders
    .filter(op => op.status !== 'Concluída' && op.scheduledDate === date)
    .flatMap(op => op.operations.filter(operation => operation.resourceId === resourceId && operation.status !== 'Concluída').map(operation => Math.max(0, op.quantity - operation.good) * operation.minutesPerUnit))
    .reduce((sum, value) => sum + value, 0)
  return { minutes: Math.round(minutes), percent: Math.round(minutes / resource.dailyMinutes * 100) }
}
