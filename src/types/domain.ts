export type SyncStatus = 'sincronizado' | 'pendente' | 'erro'

/** PA acabado, SE semiacabado injetado, MP matéria-prima, CP componente, EM embalagem, SV serviço, KF kit físico, KT kit virtual, IM imobilizado */
export type ItemType = 'PA' | 'SE' | 'MP' | 'CP' | 'EM' | 'SV' | 'KF' | 'KT' | 'IM'

export type ItemLifecycle = 'Rascunho' | 'Em homologação' | 'Ativo' | 'Bloqueado' | 'Obsoleto' | 'Inativo'
export type ItemNature = 'Bem' | 'Serviço' | 'Kit virtual' | 'Imobilizado'
export type UnitContext = 'Compra' | 'Produção' | 'Estoque' | 'Venda'
export type ApprovalRole = 'fiscal' | 'pcp' | 'comercial' | 'tecnica'
export type CatalogLayer = 'nucleo' | 'estoque' | 'unidades' | 'manufatura' | 'comercial' | 'fiscal' | 'midia' | 'projetos' | 'ciclo'

export type BarcodeKind = 'EAN-13' | 'EAN-8' | 'DUN-14' | 'UPC-A'

export interface Barcode {
  code: string
  kind: BarcodeKind
  unit: string
  main: boolean
}

export interface PriceTable {
  id: string
  name: string
  currency: 'BRL' | 'USD'
  channel: string
}

export interface ItemPrice {
  id: string
  tableId: string
  unit: string
  value: number
  validFrom: string
  validTo?: string
  createdBy: string
}

export interface StandardCost {
  value: number
  validFrom: string
  createdBy: string
  reason: string
}

export type MediaKind = 'Foto' | 'Desenho' | 'Ficha técnica'

export interface ItemMedia {
  id: string
  kind: MediaKind
  name: string
  dataUrl?: string
  size: number
  order: number
  main: boolean
  uploadedBy: string
  uploadedAt: string
}

export interface ProjectLink {
  projectId: string
  milestoneId?: string
  note: string
  linkedBy: string
  linkedAt: string
}

export interface FiscalBenefit {
  id: string
  uf: string
  kind: string
  legalBasis: string
  validTo?: string
}

/** Camada da reforma tributária com vigência própria; a entrada vigente alimenta cClassTrib. */
export interface ReformEntry {
  id: string
  cClassTrib: string
  ibsReduction: number
  cbsReduction: number
  validFrom: string
  createdBy: string
}

/** Grade: cada combinação de eixos é um item real com código próprio. */
export interface ItemModel {
  id: string
  name: string
  templateId: string
  axes: { name: string; values: string[] }[]
  createdBy: string
  createdAt: string
}

export type FiscalOperation = 'Venda' | 'Transferência' | 'Remessa para conserto'

/** Espelho da matriz fiscal do Omie: o item só sugere, quem decide a tributação é a operação. */
export interface FiscalRule {
  id: string
  operation: FiscalOperation
  originUf: string
  destUf: string
  ncmPrefix: string
  cfop: string
  cst: string
  icms: number
  ipi: number
  pis: number
  cofins: number
}

export interface UnitConversion {
  unit: string
  factor: number
  context: UnitContext
}

export interface CatalogAudit {
  at: string
  actor: string
  text: string
  version: number
  field?: string
  from?: string
  to?: string
  reason?: string
}

export interface KeyChangeRequest {
  id: string
  field: 'unit' | 'ncm'
  from: string
  to: string
  reason: string
  requestedBy: string
  requestedAt: string
  status: 'Pendente' | 'Aprovada' | 'Recusada'
  decidedBy?: string
  decidedAt?: string
  note?: string
}

export interface BranchStock {
  branch: string
  enabled: boolean
  location: string
  minimum: number
}

export interface StockLot {
  code: string
  quantity: number
  expiry?: string
  receivedAt: string
}

/** Nó da árvore de classificação; a profundidade não tem limite. */
export interface ItemClass {
  id: string
  name: string
  parentId?: string
}

/** Camadas de extensão do item. O núcleo (código, tipo, unidade, status) continua em Item. */
export interface ItemCatalog {
  nature: ItemNature
  classId: string
  lifecycle: ItemLifecycle
  version: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  ncm: string
  cest: string
  origin: string
  cClassTrib: string
  exTipi: string
  benefits: FiscalBenefit[]
  reform: ReformEntry[]
  /** Espelha o código de barras principal. */
  gtin: string
  gtinTax: string
  barcodes: Barcode[]
  commercialName: string
  brand: string
  productLine: string
  categories: string[]
  prices: ItemPrice[]
  lot: boolean
  expiry: boolean
  serial: boolean
  allowNegative: boolean
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  minLot: number
  lotMultiple: number
  productionLeadDays: number
  costs: StandardCost[]
  media: ItemMedia[]
  projectLinks: ProjectLink[]
  modelId?: string
  attributes: Record<string, string>
  branches: BranchStock[]
  conversions: UnitConversion[]
  approvals: Partial<Record<ApprovalRole, string>>
  keyChanges: KeyChangeRequest[]
  audit: CatalogAudit[]
  deletedAt?: string
  deletedBy?: string
}

export type Role = 'Administrador' | 'Gestor' | 'Comercial' | 'Engenharia' | 'PCP' | 'Compras' | 'Almoxarifado' | 'Líder de produção' | 'Operador' | 'Qualidade' | 'Expedição' | 'Manutenção' | 'Assistência' | 'Financeiro'

/** Identificador estável de uma ação de negócio autorizável, por exemplo `orcamentos.ler`. */
export type FunctionalityId = string

export interface Functionality {
  id: FunctionalityId
  module: string
  action: string
  label: string
  description: string
}

/** Empresa do produto. O dado operacional continua no tenant; o grupo só consolida. */
export interface Tenant {
  id: string
  legalName: string
  tradeName: string
  document: string
  city: string
  status: 'Ativa' | 'Inativa'
  groupId?: string
}

/** Relação entre empresas. Não mistura pedidos, estoque nem orçamento operacional. */
export interface EconomicGroup {
  id: string
  name: string
  description: string
}

/** Vínculo da empresa com uma conta Omie. O segredo não é persistido no navegador. */
export interface OmieConnection {
  tenantId: string
  appKey: string
  secretDefined: boolean
  status: 'Não configurada' | 'Simulada'
  accountLabel: string
}

/** Perfil reutilizável dentro de uma empresa. Apenas o Administrador é perfil de sistema imutável. */
export interface AccessProfile {
  id: string
  tenantId: string
  code: string
  name: string
  description: string
  system: boolean
  functionalityIds: FunctionalityId[]
  /** Mantém a demonstração e a transição do mockup baseado em papéis. Não existe como regra na API real. */
  simulatedRole?: Role
}

/** Um usuário pode receber mais de um perfil na mesma empresa; as permissões se somam. */
export interface UserProfileAssignment {
  id: string
  userId: string
  tenantId: string
  profileId: string
}

export type FlowStage = 'Entrada' | 'Materiais' | 'Injeção' | 'Montagem' | 'Qualidade' | 'Expedição' | 'Faturado'

export interface Customer {
  id: string
  name: string
  city: string
  omieCode: string
}

export interface BomLine {
  itemId: string
  quantity: number
  /** Perda prevista em %, somada à necessidade no planejamento. */
  loss?: number
}

export interface RouteStep {
  id: string
  name: string
  resourceId: string
  minutesPerUnit: number
  instructions: string[]
}

export interface Item {
  id: string
  code: string
  name: string
  type: ItemType
  unit: string
  stock: number
  minimum: number
  location: string
  cost: number
  status?: 'Rascunho' | 'Liberado' | 'Em revisão' | 'Obsoleto'
  behaviors?: {
    sellable: boolean
    purchasable: boolean
    stockable: boolean
    manufacturable: boolean
    assetizable: boolean
  }
  currentRevisionId?: string
  leadTimeDays?: number
  supplier?: string
  /** PA */
  family?: 'Lite' | 'Hard'
  variant?: string
  revision?: string
  bom?: BomLine[]
  routing?: RouteStep[]
  /** SE */
  moldId?: string
  cycleSeconds?: number
  cavities?: number
  catalog?: ItemCatalog
  lots?: StockLot[]
}

export interface Resource {
  id: string
  name: string
  kind: 'Injetora' | 'Montagem' | 'Almoxarifado' | 'Qualidade' | 'Expedição'
  dailyMinutes: number
}

export type MachineState = 'Produzindo' | 'Parada' | 'Livre' | 'Manutenção'

export interface Asset {
  id: string
  name: string
  kind: 'Injetora' | 'Molde' | 'Equipamento'
  resourceId?: string
  shots?: number
  serial?: string
  location?: string
  responsibleId?: string
  status?: 'Operando' | 'Parado' | 'Em manutenção'
  preventiveLimit?: number
  nextPreventive: string
  manufacturer?: string
  acquiredAt?: string
  value?: number
  criticality?: 'A' | 'B' | 'C'
}

export type SalesOrderPriority = 'Normal' | 'Alta' | 'Urgente'

export interface SalesOrder {
  id: string
  omieId: string
  customerId: string
  itemId: string
  quantity: number
  /** kitId marca a linha que veio da explosão de um kit virtual. */
  lines?: { itemId: string; quantity: number; unitPrice: number; kitId?: string }[]
  promisedDate: string
  priority: SalesOrderPriority
  value: number
  receivedAt: string
  planned: boolean
  shipment?: Shipment
}

export interface Shipment {
  status: 'Aguardando conferência' | 'Conferido' | 'Expedido' | 'Faturado'
  volumes: number
  carrier: string
  invoice?: string
  shippedAt?: string
}

export interface OpMaterial {
  itemId: string
  required: number
  reserved: number
  picked: boolean
  lots?: string
}

export type OperationStatus = 'Aguardando' | 'Disponível' | 'Em execução' | 'Pausada' | 'Concluída'

export interface Operation {
  id: string
  name: string
  resourceId: string
  minutesPerUnit: number
  instructions: string[]
  status: OperationStatus
  good: number
  scrap: number
  startedAt?: string
  accumulatedMs: number
  operator?: string
  pauseReason?: string
}

export type OpStatus = 'Aguardando material' | 'Planejada' | 'Liberada' | 'Em produção' | 'Inspeção' | 'Concluída'

export interface ProductionOrder {
  id: string
  kind: 'Injeção' | 'Montagem'
  salesOrderId: string
  itemId: string
  revisionId?: string
  quantity: number
  dueDate: string
  scheduledDate: string
  resourceId: string
  status: OpStatus
  materials: OpMaterial[]
  operations: Operation[]
  createdAt: string
  budgetCategoryId?: string
  budgetPeriod?: string
  estimatedCost?: number
}

export type RequisitionStatus = 'Solicitada' | 'Em cotação' | 'Aprovada' | 'Pedido emitido' | 'Recebida'

export interface Requisition {
  id: string
  itemId: string
  quantity: number
  origin: string
  neededBy: string
  status: RequisitionStatus
  supplier: string
  unitPrice: number
  omiePo?: string
  createdAt: string
}

export interface StockMovement {
  id: string
  itemId: string
  type: 'Entrada' | 'Saída' | 'Produção' | 'Ajuste'
  quantity: number
  reference: string
  at: string
  lots?: string
}

export interface Downtime {
  id: string
  resourceId: string
  opId: string
  reason: string
  start: string
  end?: string
}

export interface NonConformity {
  id: string
  opId: string
  itemId: string
  quantity: number
  reason: string
  status: 'Aberta' | 'Em análise' | 'Encerrada'
  action?: string
  createdAt: string
}

export interface MaintenanceOrder {
  id: string
  assetId: string
  type: 'Corretiva' | 'Preventiva'
  description: string
  status: 'Aberta' | 'Em execução' | 'Concluída'
  createdAt: string
  origin: string
  budgetCategoryId?: string
  budgetPeriod?: string
  estimatedCost?: number
}

export interface FlowEvent {
  id: string
  at: string
  orderId?: string
  /** Registro a que o evento pertence (oportunidade, demanda, projeto...) */
  ref?: string
  module: string
  actor: string
  text: string
}

export interface SyncLog {
  id: string
  entity: string
  reference: string
  direction: 'Omie → Thalamus' | 'Thalamus → Omie'
  status: SyncStatus
  at: string
  message: string
}

export interface User {
  id: string
  name: string
  role: Role
  sector: string
  shift: 'Manhã' | 'Tarde' | 'Administrativo'
  pin: string
  email?: string
  positionId?: string
  active?: boolean
  /** Identidade da plataforma, fora de qualquer empresa. Cadastra tenants, grupos e o vínculo Omie. */
  platformMaster?: boolean
}

export interface ShopAlert {
  id: string
  resourceId: string
  operator: string
  message: string
  at: string
  resolved: boolean
}

export type EntityStatus = 'Ativo' | 'Inativo'
export type Priority = 'Baixa' | 'Normal' | 'Alta' | 'Urgente'

export interface Sector {
  id: string
  name: string
  managerId?: string
  parentId?: string
  costCenter: string
}

export interface JobPosition {
  id: string
  name: string
  sectorId: string
  description: string
}

export interface BusinessPartner {
  id: string
  name: string
  document: string
  roles: ('Cliente' | 'Fornecedor' | 'Transportadora')[]
  city: string
  contact: string
  email: string
  status: EntityStatus
}

export interface ProductRevision {
  id: string
  itemId: string
  code: string
  status: 'Rascunho' | 'Liberada' | 'Substituída'
  createdAt: string
  createdBy?: string
  releasedAt?: string
  releasedBy?: string
  checklist: { label: string; done: boolean }[]
  notes: string
  /** Estrutura desta versão; a liberada copia para o item. */
  lines?: BomLine[]
  validFrom?: string
  validTo?: string
}

export interface ServiceCatalogItem {
  id: string
  code: string
  name: string
  category: 'Produção' | 'Manutenção' | 'Terceiro' | 'Assistência'
  unit: 'hora' | 'un' | 'visita'
  standardMinutes: number
  cost: number
  price: number
  outsourced: boolean
  status: EntityStatus
  description?: string
  supplierId?: string
}

export interface Demand {
  id: string
  kind: 'Material' | 'Serviço' | 'Ativo'
  itemId?: string
  serviceId?: string
  description: string
  quantity: number
  origin: 'OP' | 'Estoque mínimo' | 'Manutenção' | 'Assistência' | 'Projeto' | 'Manual'
  originId?: string
  neededBy: string
  priority: Priority
  status: 'Aberta' | 'Em atendimento' | 'Atendida' | 'Cancelada'
  assigneeRole: Role
  createdAt: string
  requester?: string
  projectId?: string
  purchaseOrderId?: string
  supplierId?: string
  estimatedCost?: number
  budgetCategoryId?: string
  budgetPeriod?: string
  costCenter?: string
  notes?: string
  resolution?: string
}

export interface SupplierQuote {
  supplierId: string
  unitPrice: number
  leadDays: number
  selected: boolean
}

export interface PurchaseOrder {
  id: string
  supplierId: string
  demandIds: string[]
  itemId: string
  quantity: number
  received: number
  unitPrice: number
  promisedDate: string
  status: 'Rascunho' | 'Aguardando aprovação' | 'Aprovado' | 'Recebido parcial' | 'Recebido' | 'Cancelado'
  quotes: SupplierQuote[]
  projectId?: string
  budgetId?: string
  createdAt: string
}

export interface CrmActivity {
  id: string
  at: string
  type: 'Ligação' | 'E-mail' | 'Reunião' | 'Tarefa'
  text: string
  done: boolean
}

export interface Opportunity {
  id: string
  partnerId: string
  title: string
  ownerId: string
  stage: 'Lead' | 'Qualificação' | 'Proposta' | 'Negociação' | 'Ganha' | 'Perdida'
  value: number
  probability: number
  nextAction: string
  expectedClose: string
  source: string
  activities: CrmActivity[]
  contact?: string
  segment?: string
  itemIds?: string[]
  quantity?: number
  notes?: string
  lossReason?: string
  createdAt?: string
}

export interface ProposalLine {
  itemId?: string
  serviceId?: string
  description: string
  quantity: number
  unitPrice: number
}

export interface Proposal {
  id: string
  opportunityId: string
  partnerId: string
  lines: ProposalLine[]
  discount: number
  validUntil: string
  suggestedDate: string
  status: 'Rascunho' | 'Enviada' | 'Aceita' | 'Recusada' | 'Expirada'
  createdAt: string
  paymentTerms?: string
  salesOrderId?: string
  rejectionReason?: string
}

export interface TechnicalServiceOrder {
  id: string
  partnerId: string
  salesOrderId: string
  productionOrderId?: string
  assetSerial?: string
  description: string
  warranty: boolean
  chargeable: boolean
  technicianId?: string
  scheduledFor?: string
  status: 'Aberta' | 'Agendada' | 'Em execução' | 'Aguardando peça' | 'Concluída' | 'Cancelada'
  usedItemIds: string[]
  report?: string
  createdAt: string
  channel?: 'Telefone' | 'E-mail' | 'Portal' | 'Comercial'
  contact?: string
  diagnosis?: string
  parts?: { itemId: string; quantity: number; consumed: boolean }[]
  laborHours?: number
  chargeAmount?: number
  nonConformityId?: string
  demandIds?: string[]
}

export interface ProjectMilestone {
  id: string
  title: string
  dueDate: string
  done: boolean
  ownerId?: string
  doneAt?: string
}

export interface Project {
  id: string
  name: string
  kind: 'Produto novo' | 'Molde' | 'Melhoria' | 'Cliente'
  ownerId: string
  partnerId?: string
  status: 'Planejado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  startDate: string
  endDate: string
  budgetId?: string
  milestones: ProjectMilestone[]
  description?: string
  itemId?: string
  opportunityId?: string
  memberIds?: string[]
  risks?: string[]
}

export type BudgetCategoryStatus = 'Ativa' | 'Inativa'
export type BudgetEntryKind = 'Previsão' | 'Realizado pago'
export type BudgetEntryStatus = 'Ativo' | 'Parcial' | 'Liquidado' | 'Cancelado' | 'Estornado' | 'Retido'
export type BudgetExceptionStatus = 'Pendente' | 'Autorizada' | 'Rejeitada' | 'Resolvida'

export interface BudgetAlert {
  id: string
  categoryId: string
  period: string
  kind: 'Alerta' | 'Bloqueio'
  threshold: number
  use: number
  message: string
  notifiedRoles: Role[]
  status: 'Aberto' | 'Ciente' | 'Encerrado'
  at: string
  sourceId?: string
  acknowledgedBy?: string
  acknowledgedAt?: string
}

export interface BudgetAudit {
  id: string
  at: string
  actor: string
  field: string
  from: string
  to: string
  reason: string
}

export interface BudgetCategory {
  id: string
  code: string
  name: string
  group: string
  parentId?: string
  responsibleRole: Role
  status: BudgetCategoryStatus
  audit: BudgetAudit[]
  /** Identificador da mesma categoria no Omie. A conciliação é dos dois lados. */
  omieId?: string
}

/** Valor informado, sem workflow, para a chave obrigatória categoria + mês. */
export interface Budget {
  id: string
  categoryId: string
  period: string
  amount: number
  alertThreshold: number
  blockOnOverrun: boolean
  audit: BudgetAudit[]
}

export interface BudgetEntryEvent {
  id: string
  at: string
  actor: string
  type: 'Criação' | 'Alteração' | 'Cancelamento' | 'Pagamento' | 'Estorno' | 'Conciliação'
  amount: number
  note: string
}

/** Documento do Thalamus ao qual uma nota do Omie pode apontar. */
export type InvoiceLinkModule = 'Compras' | 'Projetos' | 'Manutenção' | 'Demandas' | 'Assistência' | 'Produção'

export interface BudgetEntry {
  id: string
  kind: BudgetEntryKind
  categoryId: string
  period: string
  amount: number
  openAmount: number
  status: BudgetEntryStatus
  sourceModule: 'Demandas' | 'Produção' | 'Manutenção' | 'Assistência' | 'Projetos' | 'Compras' | 'Omie' | 'Financeiro'
  sourceType: string
  sourceId: string
  externalId?: string
  /** Número da nota que originou o custo. A nota do Omie é a fonte do realizado. */
  invoiceNumber?: string
  linkModule?: InvoiceLinkModule
  linkId?: string
  /** Preenchido quando alguém liga a nota na mão. O automático chega com os módulos de origem. */
  linkMode?: 'manual'
  projectId?: string
  costCenter?: string
  description: string
  createdAt: string
  events: BudgetEntryEvent[]
  /** Valor solicitado acima do saldo, aguardando liberação do Gestor. */
  heldAmount?: number
}

export interface BudgetException {
  id: string
  kind: 'Sem categoria' | 'Múltiplas categorias' | 'Duplicidade' | 'Erro de sincronização' | 'Saldo excedido' | 'Sem vínculo'
  status: BudgetExceptionStatus
  sourceModule: string
  sourceId: string
  description: string
  amount: number
  categoryIds: string[]
  period: string
  createdAt: string
  decidedAt?: string
  decidedBy?: string
  decisionNote?: string
}

/** Categoria financeira como o Omie a enxerga. O código do Omie é a chave da conciliação. */
export interface OmieCategory {
  omieId: string
  code: string
  name: string
  group: string
  parentCode?: string
  inactive?: boolean
}

export interface OmiePayment {
  id: string
  titleId?: string
  sourceId: string
  /** Número da NF. Quando falta, a nota entra no custo e fica sem vínculo até alguém apontar o documento. */
  invoiceNumber?: string
  description?: string
  link?: { module: InvoiceLinkModule; id: string }
  amount: number
  paidAt: string
  categoryIds: string[]
  event: 'Pagamento' | 'Estorno'
  error?: string
}

export interface FinancialTitle {
  id: string
  kind: 'Pagar' | 'Receber'
  partnerId: string
  description: string
  reference: string
  amount: number
  dueDate: string
  status: 'Aberto' | 'Baixado'
  paidAt?: string
  projectId?: string
  createdAt: string
  origin?: 'Compra' | 'Venda' | 'Assistência' | 'Serviço' | 'Manual'
  budgetId?: string
  costCenter?: string
  notes?: string
  budgetCategoryId?: string
  budgetPeriod?: string
}
