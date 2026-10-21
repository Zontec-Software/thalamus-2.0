import type { ErpState } from './engine'
import { addDays, DomainError, getItem, lineNeed, log, nextId, now, today } from './engine'
import {
  assertGtin, canEdit, catalogOf, commit, createItem, currentPrice, editable, editorsLabel, findItem, needsStructure, sellable, track,
  type Change,
} from './catalog'
import type {
  Barcode, BarcodeKind, FiscalOperation, FiscalRule, Item, ItemMedia, ItemModel, ItemType, MediaKind, PriceTable, Role,
} from '../types/domain'

const round2 = (value: number) => Math.round(value * 100) / 100
const round3 = (value: number) => Math.round(value * 1000) / 1000
const brDate = (date: string) => date.split('-').reverse().join('/')
const brNumber = (value: number, digits = 2) => value.toFixed(digits).replace('.', ',')

export const COMPANY_UF = 'MG'
export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

/* ---------- Códigos de barras ---------- */

export const BARCODE_KINDS: BarcodeKind[] = ['EAN-13', 'EAN-8', 'DUN-14', 'UPC-A']
const BARCODE_LENGTH: Record<BarcodeKind, number> = { 'EAN-13': 13, 'EAN-8': 8, 'DUN-14': 14, 'UPC-A': 12 }
/** Prefixo GS1 da empresa (7891234) + dígito de família; o sequencial ocupa os 4 dígitos seguintes. */
const COMPANY_PREFIX = '78912345'

export function barcodeUnits(item: Item) {
  return [...new Set([item.unit, ...catalogOf(item).conversions.map(entry => entry.unit)])]
}

function syncMainBarcode(item: Item, changes: Change[]) {
  const catalog = catalogOf(item)
  const main = catalog.barcodes.find(entry => entry.main)?.code ?? ''
  track(changes, 'EAN principal', catalog.gtin, main)
  catalog.gtin = main
}

function commercialEdit(item: Item) {
  const catalog = catalogOf(item)
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.comercial
}

/** Próximo EAN-13 livre dentro do prefixo da empresa. */
export function nextBarcode(state: ErpState) {
  const used = state.items.flatMap(item => item.catalog?.barcodes ?? []).map(entry => entry.code)
    .filter(code => code.length === 13 && code.startsWith(COMPANY_PREFIX))
    .map(code => Number(code.slice(COMPANY_PREFIX.length, 12)))
  const sequence = Math.max(0, ...used) + 1
  const base = `${COMPANY_PREFIX}${String(sequence).padStart(4, '0')}`
  const sum = base.split('').map(Number).reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return `${base}${(10 - (sum % 10)) % 10}`
}

export function addBarcode(state: ErpState, itemId: string, input: Barcode, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'comercial')
  const code = input.code.replace(/\D/g, '')
  if (code.length !== BARCODE_LENGTH[input.kind]) throw new DomainError(`${input.kind} tem ${BARCODE_LENGTH[input.kind]} dígitos`)
  if (catalog.barcodes.some(entry => entry.code === code)) throw new DomainError('Este código já está no item')
  assertGtin(state, item, code, input.kind)
  if (!barcodeUnits(item).includes(input.unit)) throw new DomainError(`A unidade ${input.unit} não tem conversão cadastrada no item`)
  const main = input.main || !catalog.barcodes.length
  if (main) catalog.barcodes.forEach(entry => { entry.main = false })
  catalog.barcodes.push({ code, kind: input.kind, unit: input.unit, main })
  const changes: Change[] = [{ field: 'Código de barras', from: '', to: `${input.kind} ${code} · ${input.unit}${main ? ' · principal' : ''}` }]
  syncMainBarcode(item, changes)
  commercialEdit(item)
  commit(catalog, actor, changes)
}

export function removeBarcode(state: ErpState, itemId: string, code: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'comercial')
  const target = catalog.barcodes.find(entry => entry.code === code)
  if (!target) throw new DomainError('Código não encontrado no item')
  if (target.main && catalog.barcodes.length === 1 && catalog.lifecycle === 'Ativo' && (item.type === 'PA' || item.type === 'KF')) {
    throw new DomainError('Produto ativo precisa de um EAN principal. Cadastre outro antes de remover este')
  }
  catalog.barcodes = catalog.barcodes.filter(entry => entry.code !== code)
  if (target.main && catalog.barcodes.length) catalog.barcodes[0].main = true
  const changes: Change[] = [{ field: 'Código de barras', from: `${target.kind} ${target.code} · ${target.unit}`, to: '' }]
  syncMainBarcode(item, changes)
  commercialEdit(item)
  commit(catalog, actor, changes)
}

export function setMainBarcode(state: ErpState, itemId: string, code: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'comercial')
  if (!catalog.barcodes.some(entry => entry.code === code)) throw new DomainError('Código não encontrado no item')
  catalog.barcodes.forEach(entry => { entry.main = entry.code === code })
  const changes: Change[] = []
  syncMainBarcode(item, changes)
  if (!changes.length) throw new DomainError('Este já é o código principal')
  commercialEdit(item)
  commit(catalog, actor, changes)
}

/* ---------- Tabelas de preço ---------- */

export function priceUnits(item: Item) {
  return [...new Set([item.unit, ...catalogOf(item).conversions.filter(entry => entry.context === 'Venda').map(entry => entry.unit)])]
}

export function formatPrice(table: PriceTable | undefined, value: number) {
  return `${table?.currency === 'USD' ? 'US$' : 'R$'} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function createPriceTable(state: ErpState, input: Omit<PriceTable, 'id'>, actor: string, role: Role = 'Gestor') {
  if (!canEdit(role, 'comercial')) throw new DomainError(`Quem mantém tabelas de preço: ${editorsLabel('comercial')}`)
  const name = input.name.trim()
  if (name.length < 3) throw new DomainError('Dê um nome à tabela')
  if (state.priceTables.some(entry => entry.name.toLowerCase() === name.toLowerCase())) throw new DomainError('Já existe uma tabela com esse nome')
  const table: PriceTable = { id: nextId(state, 'TP'), name, currency: input.currency, channel: input.channel.trim() || 'Geral' }
  state.priceTables.push(table)
  log(state, 'Produtos', actor, `Tabela de preço criada: ${name} (${table.currency})`)
  return table
}

/** Preço novo encerra o vigente na véspera. Vigência no passado não é aceita: o histórico não se reescreve. */
export function setPrice(state: ErpState, itemId: string, input: { tableId: string; unit: string; value: number; validFrom: string }, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'comercial')
  if (!sellable(item)) throw new DomainError('Só item vendável tem preço de venda')
  const table = state.priceTables.find(entry => entry.id === input.tableId)
  if (!table) throw new DomainError('Tabela de preço não encontrada')
  if (!(input.value > 0)) throw new DomainError('O preço tem de ser maior que zero')
  if (!input.validFrom || input.validFrom < today()) throw new DomainError('A vigência começa hoje ou depois')
  if (!priceUnits(item).includes(input.unit)) throw new DomainError(`A unidade ${input.unit} não tem conversão de venda no item`)
  const same = catalog.prices.filter(entry => entry.tableId === table.id && entry.unit === input.unit)
  if (same.some(entry => entry.validFrom >= input.validFrom)) throw new DomainError('Já existe preço com vigência igual ou posterior nesta tabela e unidade. Remova o programado antes')
  const current = currentPrice(item, table.id, input.unit, input.validFrom)
  for (const entry of same) if (!entry.validTo || entry.validTo >= input.validFrom) entry.validTo = addDays(input.validFrom, -1)
  catalog.prices.push({ id: nextId(state, 'PR'), tableId: table.id, unit: input.unit, value: round2(input.value), validFrom: input.validFrom, createdBy: actor })
  commercialEdit(item)
  commit(catalog, actor, [{ field: `Preço · ${table.name} (${input.unit})`, from: current ? formatPrice(table, current.value) : '', to: `${formatPrice(table, input.value)} desde ${brDate(input.validFrom)}` }])
}

export function removePrice(state: ErpState, itemId: string, priceId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'comercial')
  const price = catalog.prices.find(entry => entry.id === priceId)
  if (!price) throw new DomainError('Preço não encontrado')
  if (price.validFrom <= today()) throw new DomainError('Preço que já vigorou fica no histórico. Lance um preço novo para substituí-lo')
  catalog.prices = catalog.prices.filter(entry => entry.id !== priceId)
  const previous = catalog.prices.find(entry => entry.tableId === price.tableId && entry.unit === price.unit && entry.validTo === addDays(price.validFrom, -1))
  if (previous) previous.validTo = undefined
  const table = state.priceTables.find(entry => entry.id === price.tableId)
  commit(catalog, actor, [{ field: `Preço · ${table?.name ?? price.tableId} (${price.unit})`, from: `${formatPrice(table, price.value)} desde ${brDate(price.validFrom)}`, to: 'programação removida' }])
}

/* ---------- Custo-padrão, prazos e roteiro ---------- */

export function costLayer(item: Item) {
  return needsStructure(item) ? 'manufatura' as const : 'estoque' as const
}

/** Custo-padrão com vigência. A data futura entra sozinha quando chega. */
export function setStandardCost(state: ErpState, itemId: string, value: number, validFrom: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, costLayer(item))
  if (catalog.nature === 'Serviço') throw new DomainError('Custo de serviço fica no catálogo de serviços')
  if (!(value > 0)) throw new DomainError('O custo tem de ser maior que zero')
  if (!validFrom || validFrom < today()) throw new DomainError('A vigência começa hoje ou depois')
  if (!reason.trim()) throw new DomainError('Informe o motivo do novo custo')
  if (!catalog.costs.length && item.cost > 0) {
    catalog.costs.push({ value: item.cost, validFrom: catalog.createdAt.slice(0, 10) || today(), createdBy: catalog.createdBy || 'Cadastro', reason: 'Custo de partida do cadastro' })
  }
  if (catalog.costs.some(entry => entry.validFrom === validFrom)) throw new DomainError('Já existe custo com essa vigência')
  catalog.costs.push({ value: round2(value), validFrom, createdBy: actor, reason: reason.trim() })
  catalog.costs.sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  const before = item.cost
  if (validFrom <= today()) item.cost = round2(value)
  commit(catalog, actor, [{ field: 'Custo-padrão', from: brNumber(before), to: `${brNumber(value)} desde ${brDate(validFrom)}`, reason: reason.trim() }])
}

/** Custo de material pela estrutura vigente, já com a perda prevista de cada linha. */
export function rolledUpCost(state: ErpState, item: Item) {
  const lines = (item.bom ?? []).map(line => {
    const component = state.items.find(entry => entry.id === line.itemId)
    const quantity = lineNeed(line, 1)
    const unitCost = component?.cost ?? 0
    return { itemId: line.itemId, quantity, unitCost, total: round2(quantity * unitCost) }
  })
  const material = round2(lines.reduce((sum, line) => sum + line.total, 0))
  return { lines, material, variance: round2(item.cost - material) }
}

export function updateProductionLead(state: ErpState, itemId: string, days: number, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'manufatura')
  if (!(days >= 0)) throw new DomainError('O prazo não pode ser negativo')
  const changes: Change[] = []
  track(changes, 'Lead time de produção', String(catalog.productionLeadDays), String(days))
  if (!changes.length) throw new DomainError('Nada mudou')
  catalog.productionLeadDays = days
  commit(catalog, actor, changes)
}

export interface RouteStepInput {
  id?: string
  name: string
  resourceId: string
  minutesPerUnit: number
  instructions: string[]
}

function routingEditable(state: ErpState, itemId: string, role: Role) {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'manufatura')
  if (item.type !== 'PA' && item.type !== 'KF') throw new DomainError('Só produto acabado e kit físico têm roteiro de montagem')
  item.routing ??= []
  return { item, catalog, routing: item.routing }
}

/** Roteiro padrão do item. OPs já abertas guardam a cópia delas; a mudança vale para as próximas. */
export function saveRoutingStep(state: ErpState, itemId: string, input: RouteStepInput, actor: string, role: Role = 'Gestor') {
  const { item, catalog, routing } = routingEditable(state, itemId, role)
  const name = input.name.trim()
  if (name.length < 3) throw new DomainError('Dê um nome à operação')
  if (!state.resources.some(entry => entry.id === input.resourceId)) throw new DomainError('Escolha o recurso da operação')
  if (!(input.minutesPerUnit > 0)) throw new DomainError('O tempo padrão tem de ser maior que zero')
  const instructions = input.instructions.map(entry => entry.trim()).filter(Boolean)
  const resource = (id: string) => state.resources.find(entry => entry.id === id)?.name ?? id
  const changes: Change[] = []
  if (input.id) {
    const step = routing.find(entry => entry.id === input.id)
    if (!step) throw new DomainError('Operação não encontrada')
    track(changes, `Roteiro · ${step.name} · nome`, step.name, name)
    track(changes, `Roteiro · ${step.name} · recurso`, resource(step.resourceId), resource(input.resourceId))
    track(changes, `Roteiro · ${step.name} · tempo (min/un)`, brNumber(step.minutesPerUnit), brNumber(input.minutesPerUnit))
    track(changes, `Roteiro · ${step.name} · instruções`, step.instructions.join(' | '), instructions.join(' | '))
    if (!changes.length) throw new DomainError('Nada mudou')
    Object.assign(step, { name, resourceId: input.resourceId, minutesPerUnit: input.minutesPerUnit, instructions })
  } else {
    routing.push({ id: nextId(state, 'ST').toLowerCase(), name, resourceId: input.resourceId, minutesPerUnit: input.minutesPerUnit, instructions })
    changes.push({ field: 'Roteiro · operação incluída', from: '', to: `${name} · ${resource(input.resourceId)} · ${brNumber(input.minutesPerUnit)} min/un` })
  }
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.pcp
  commit(catalog, actor, changes)
  void item
}

export function removeRoutingStep(state: ErpState, itemId: string, stepId: string, actor: string, role: Role = 'Gestor') {
  const { item, catalog, routing } = routingEditable(state, itemId, role)
  const step = routing.find(entry => entry.id === stepId)
  if (!step) throw new DomainError('Operação não encontrada')
  if (routing.length === 1 && catalog.lifecycle === 'Ativo') throw new DomainError('Produto ativo precisa de ao menos uma operação no roteiro')
  item.routing = routing.filter(entry => entry.id !== stepId)
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.pcp
  commit(catalog, actor, [{ field: 'Roteiro · operação removida', from: step.name, to: '' }])
}

export function moveRoutingStep(state: ErpState, itemId: string, stepId: string, direction: -1 | 1, actor: string, role: Role = 'Gestor') {
  const { catalog, routing } = routingEditable(state, itemId, role)
  const index = routing.findIndex(entry => entry.id === stepId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= routing.length) throw new DomainError('A operação já está na ponta do roteiro')
  const before = routing.map(entry => entry.name).join(' → ')
  ;[routing[index], routing[target]] = [routing[target], routing[index]]
  commit(catalog, actor, [{ field: 'Roteiro · sequência', from: before, to: routing.map(entry => entry.name).join(' → ') }])
}

/* ---------- Mídia ---------- */

export const MEDIA_KINDS: MediaKind[] = ['Foto', 'Desenho', 'Ficha técnica']
/** Na demonstração o arquivo fica no navegador; o limite protege o armazenamento local. */
export const MEDIA_LIMIT_BYTES = 450_000

export function sortedMedia(item: Item) {
  return [...catalogOf(item).media].sort((a, b) => a.order - b.order)
}

export function mainPhoto(item: Item) {
  return catalogOf(item).media.find(entry => entry.main && entry.kind === 'Foto')
}

export function addMedia(state: ErpState, itemId: string, input: { kind: MediaKind; name: string; dataUrl?: string; size: number }, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'midia')
  const name = input.name.trim()
  if (!name) throw new DomainError('Informe o nome do arquivo')
  if (input.size > MEDIA_LIMIT_BYTES) throw new DomainError(`Arquivo de ${Math.round(input.size / 1024)} KB: na demonstração o limite é ${Math.round(MEDIA_LIMIT_BYTES / 1024)} KB por arquivo`)
  if (input.kind === 'Foto' && input.dataUrl && !input.dataUrl.startsWith('data:image/')) throw new DomainError('Foto precisa ser uma imagem (JPG, PNG ou WebP)')
  const media: ItemMedia = {
    id: nextId(state, 'MD'), kind: input.kind, name, dataUrl: input.dataUrl, size: input.size,
    order: Math.max(0, ...catalog.media.map(entry => entry.order)) + 1,
    main: input.kind === 'Foto' && !catalog.media.some(entry => entry.main), uploadedBy: actor, uploadedAt: now(),
  }
  catalog.media.push(media)
  commit(catalog, actor, [{ field: 'Mídia', from: '', to: `${input.kind}: ${name}${media.main ? ' (principal)' : ''}` }])
  return media
}

export function removeMedia(state: ErpState, itemId: string, mediaId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'midia')
  const media = catalog.media.find(entry => entry.id === mediaId)
  if (!media) throw new DomainError('Arquivo não encontrado')
  catalog.media = catalog.media.filter(entry => entry.id !== mediaId)
  if (media.main) {
    const next = sortedMedia(item).find(entry => entry.kind === 'Foto')
    if (next) next.main = true
  }
  commit(catalog, actor, [{ field: 'Mídia', from: `${media.kind}: ${media.name}`, to: '' }])
}

export function moveMedia(state: ErpState, itemId: string, mediaId: string, direction: -1 | 1, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'midia')
  const list = sortedMedia(item)
  const index = list.findIndex(entry => entry.id === mediaId)
  const target = list[index + direction]
  if (index < 0 || !target) throw new DomainError('O arquivo já está na ponta da lista')
  const current = list[index]
  ;[current.order, target.order] = [target.order, current.order]
  commit(catalog, actor, [{ field: 'Mídia · ordem', from: `${index + 1}º ${current.name}`, to: `${index + 1 + direction}º ${current.name}` }])
}

export function setMainMedia(state: ErpState, itemId: string, mediaId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'midia')
  const media = catalog.media.find(entry => entry.id === mediaId)
  if (!media) throw new DomainError('Arquivo não encontrado')
  if (media.kind !== 'Foto') throw new DomainError('Só foto pode ser a imagem principal')
  if (media.main) throw new DomainError('Esta já é a foto principal')
  const before = mainPhoto(item)?.name ?? ''
  catalog.media.forEach(entry => { entry.main = entry.id === mediaId })
  commit(catalog, actor, [{ field: 'Foto principal', from: before, to: media.name }])
}

/* ---------- Projetos e EAP ---------- */

export function linkProject(state: ErpState, itemId: string, input: { projectId: string; milestoneId?: string; note: string }, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'projetos')
  const project = state.projects.find(entry => entry.id === input.projectId)
  if (!project) throw new DomainError('Projeto não encontrado')
  if (project.status === 'Cancelado' || project.status === 'Concluído') throw new DomainError(`Projeto ${project.status.toLowerCase()} não recebe vínculo novo`)
  const milestone = input.milestoneId ? project.milestones.find(entry => entry.id === input.milestoneId) : undefined
  if (input.milestoneId && !milestone) throw new DomainError('Atividade da EAP não encontrada no projeto')
  if (catalog.projectLinks.some(link => link.projectId === project.id && (link.milestoneId ?? '') === (input.milestoneId ?? ''))) throw new DomainError('Este vínculo já existe')
  catalog.projectLinks.push({ projectId: project.id, milestoneId: milestone?.id, note: input.note.trim(), linkedBy: actor, linkedAt: now() })
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.tecnica
  commit(catalog, actor, [{ field: 'Projeto vinculado', from: '', to: `${project.id} · ${milestone?.title ?? 'sem atividade da EAP'}` }])
  log(state, 'Projetos', actor, `${item.code} vinculado${milestone ? ` à atividade "${milestone.title}"` : ''}`, undefined, project.id)
}

export function unlinkProject(state: ErpState, itemId: string, index: number, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'projetos')
  const [link] = catalog.projectLinks.splice(index, 1)
  if (!link) throw new DomainError('Vínculo não encontrado')
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.tecnica
  commit(catalog, actor, [{ field: 'Projeto vinculado', from: link.projectId, to: '' }])
}

/** Custo do item rastreado por projeto: pedidos de compra e demandas abertas com o projeto. */
export function projectTrace(state: ErpState, itemId: string) {
  const item = findItem(state, itemId)
  return catalogOf(item).projectLinks.map(link => {
    const project = state.projects.find(entry => entry.id === link.projectId)
    const milestone = project?.milestones.find(entry => entry.id === link.milestoneId)
    const purchases = state.purchaseOrders.filter(order => order.projectId === link.projectId && order.itemId === itemId && order.status !== 'Cancelado')
    const demands = state.demands.filter(demand => demand.projectId === link.projectId && demand.itemId === itemId && demand.status !== 'Cancelada')
    const committed = round2(purchases.reduce((sum, order) => sum + order.quantity * order.unitPrice, 0))
    const realized = round2(purchases.reduce((sum, order) => sum + order.received * order.unitPrice, 0))
    const pipeline = round2(demands.filter(demand => !demand.purchaseOrderId).reduce((sum, demand) => sum + (demand.estimatedCost ?? demand.quantity * item.cost), 0))
    return { link, project, milestone, purchases, demands, committed, realized, pipeline }
  })
}

/* ---------- Fiscal: benefícios, reforma, matriz e SPED ---------- */

function fiscalEdit(item: Item) {
  const catalog = catalogOf(item)
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.fiscal
}

export function addBenefit(state: ErpState, itemId: string, input: { uf: string; kind: string; legalBasis: string; validTo?: string }, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  if (!UFS.includes(input.uf)) throw new DomainError('Escolha a UF do benefício')
  if (!input.kind.trim()) throw new DomainError('Informe o tipo de benefício')
  if (!input.legalBasis.trim()) throw new DomainError('Benefício sem base legal não entra no cadastro')
  if (input.validTo && input.validTo < today()) throw new DomainError('A validade já passou')
  if (catalog.benefits.some(entry => entry.uf === input.uf && entry.kind.toLowerCase() === input.kind.trim().toLowerCase())) throw new DomainError('Este benefício já está cadastrado para a UF')
  catalog.benefits.push({ id: nextId(state, 'BF'), uf: input.uf, kind: input.kind.trim(), legalBasis: input.legalBasis.trim(), validTo: input.validTo || undefined })
  fiscalEdit(item)
  commit(catalog, actor, [{ field: `Benefício fiscal · ${input.uf}`, from: '', to: `${input.kind.trim()} (${input.legalBasis.trim()})${input.validTo ? ` até ${brDate(input.validTo)}` : ''}` }])
}

export function removeBenefit(state: ErpState, itemId: string, benefitId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  const benefit = catalog.benefits.find(entry => entry.id === benefitId)
  if (!benefit) throw new DomainError('Benefício não encontrado')
  catalog.benefits = catalog.benefits.filter(entry => entry.id !== benefitId)
  fiscalEdit(item)
  commit(catalog, actor, [{ field: `Benefício fiscal · ${benefit.uf}`, from: benefit.kind, to: '' }])
}

export function activeBenefits(item: Item, uf?: string, date = today()) {
  return catalogOf(item).benefits.filter(entry => (!uf || entry.uf === uf) && (!entry.validTo || entry.validTo >= date))
}

export function currentReform(item: Item, date = today()) {
  return [...catalogOf(item).reform].filter(entry => entry.validFrom <= date).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
}

/** Camada da reforma (IBS/CBS) com vigência própria, separada do ICMS/IPI de hoje. */
export function addReformEntry(state: ErpState, itemId: string, input: { cClassTrib: string; ibsReduction: number; cbsReduction: number; validFrom: string }, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  const code = input.cClassTrib.replace(/\D/g, '')
  if (!/^\d{6}$/.test(code)) throw new DomainError('cClassTrib tem 6 dígitos')
  if ([input.ibsReduction, input.cbsReduction].some(value => !(value >= 0 && value <= 100))) throw new DomainError('Redução de base fica entre 0 e 100%')
  if (!input.validFrom || input.validFrom < today()) throw new DomainError('A vigência começa hoje ou depois')
  if (catalog.reform.some(entry => entry.validFrom === input.validFrom)) throw new DomainError('Já existe entrada com essa vigência')
  catalog.reform.push({ id: nextId(state, 'RT'), cClassTrib: code, ibsReduction: input.ibsReduction, cbsReduction: input.cbsReduction, validFrom: input.validFrom, createdBy: actor })
  const before = catalog.cClassTrib
  if (input.validFrom <= today()) catalog.cClassTrib = code
  fiscalEdit(item)
  commit(catalog, actor, [{ field: 'Reforma tributária', from: before, to: `cClassTrib ${code} · redução IBS ${input.ibsReduction}% / CBS ${input.cbsReduction}% desde ${brDate(input.validFrom)}` }])
}

export function removeReformEntry(state: ErpState, itemId: string, entryId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  const entry = catalog.reform.find(candidate => candidate.id === entryId)
  if (!entry) throw new DomainError('Entrada não encontrada')
  if (entry.validFrom <= today()) throw new DomainError('Entrada que já vigorou fica no histórico')
  catalog.reform = catalog.reform.filter(candidate => candidate.id !== entryId)
  commit(catalog, actor, [{ field: 'Reforma tributária', from: `cClassTrib ${entry.cClassTrib} desde ${brDate(entry.validFrom)}`, to: 'programação removida' }])
}

export const FISCAL_OPERATIONS: FiscalOperation[] = ['Venda', 'Transferência', 'Remessa para conserto']

export function addFiscalRule(state: ErpState, input: Omit<FiscalRule, 'id'>, actor: string, role: Role = 'Gestor') {
  if (!canEdit(role, 'fiscal')) throw new DomainError(`Quem mantém a matriz fiscal: ${editorsLabel('fiscal')}`)
  const ncmPrefix = input.ncmPrefix.replace(/\D/g, '')
  if (ncmPrefix.length > 8) throw new DomainError('O prefixo de NCM tem até 8 dígitos')
  if (![input.originUf, input.destUf].every(uf => uf === '*' || UFS.includes(uf))) throw new DomainError('UF inválida')
  if (!/^\d{4}$/.test(input.cfop)) throw new DomainError('CFOP tem 4 dígitos')
  if (!/^\d{2}$/.test(input.cst)) throw new DomainError('CST do ICMS tem 2 dígitos (a origem vem do item)')
  if ([input.icms, input.ipi, input.pis, input.cofins].some(value => !(value >= 0 && value <= 100))) throw new DomainError('Alíquota fica entre 0 e 100%')
  if (state.fiscalRules.some(rule => rule.operation === input.operation && rule.originUf === input.originUf && rule.destUf === input.destUf && rule.ncmPrefix === ncmPrefix)) {
    throw new DomainError('Já existe regra para essa operação, UFs e NCM')
  }
  const rule: FiscalRule = { ...input, ncmPrefix, id: nextId(state, 'MF') }
  state.fiscalRules.push(rule)
  log(state, 'Produtos', actor, `Matriz fiscal: regra ${rule.operation} ${rule.originUf}→${rule.destUf} NCM ${ncmPrefix || 'qualquer'} incluída`)
  return rule
}

export function removeFiscalRule(state: ErpState, ruleId: string, actor: string, role: Role = 'Gestor') {
  if (!canEdit(role, 'fiscal')) throw new DomainError(`Quem mantém a matriz fiscal: ${editorsLabel('fiscal')}`)
  const rule = state.fiscalRules.find(entry => entry.id === ruleId)
  if (!rule) throw new DomainError('Regra não encontrada')
  state.fiscalRules = state.fiscalRules.filter(entry => entry.id !== ruleId)
  log(state, 'Produtos', actor, `Matriz fiscal: regra ${rule.operation} ${rule.originUf}→${rule.destUf} removida`)
}

/** O item só sugere: a regra mais específica da matriz para a operação decide CFOP, CST e alíquotas. */
export function suggestTaxes(state: ErpState, item: Item, operation: FiscalOperation, destUf: string, originUf = COMPANY_UF) {
  const catalog = catalogOf(item)
  const ncm = catalog.ncm
  const candidates = state.fiscalRules.filter(rule => rule.operation === operation
    && (rule.originUf === '*' || rule.originUf === originUf) && (rule.destUf === '*' || rule.destUf === destUf) && ncm.startsWith(rule.ncmPrefix))
  const score = (rule: FiscalRule) => rule.ncmPrefix.length * 4 + (rule.destUf === destUf ? 2 : 0) + (rule.originUf === originUf ? 1 : 0)
  const rule = candidates.sort((a, b) => score(b) - score(a))[0]
  if (!rule) return undefined
  const benefits = activeBenefits(item, originUf)
  return { rule, cst: `${catalog.origin}${rule.cst}`, benefits }
}

const SPED_TYPE: Partial<Record<ItemType, string>> = { MP: '01', EM: '02', SE: '03', PA: '04', KF: '04', CP: '10', IM: '08', SV: '09' }
const UNIT_NAME: Record<string, string> = { un: 'Unidade', kg: 'Quilograma', h: 'Hora', kit: 'Kit', saco: 'Saco', cento: 'Cento', milheiro: 'Milheiro', fardo: 'Fardo', cx: 'Caixa' }

export function spedEligible(item: Item) {
  const catalog = catalogOf(item)
  return !catalog.deletedAt && catalog.nature !== 'Kit virtual' && catalog.lifecycle !== 'Rascunho' && catalog.lifecycle !== 'Em homologação'
}

/** Registros 0190, 0200 e 0220 do Bloco 0 da EFD ICMS/IPI para os itens ativos. */
export function spedRegisters(state: ErpState, items = state.items) {
  const eligible = items.filter(spedEligible).sort((a, b) => a.code.localeCompare(b.code))
  const issues: string[] = []
  const units = new Set<string>()
  const body: string[] = []
  for (const item of eligible) {
    const catalog = catalogOf(item)
    const type = SPED_TYPE[item.type] ?? '99'
    const goods = catalog.nature === 'Bem'
    if (goods && !catalog.ncm) issues.push(`${item.code}: sem NCM, o 0200 sai incompleto`)
    const icms = suggestTaxes(state, item, 'Venda', COMPANY_UF)?.rule.icms
    units.add(item.unit)
    body.push(['', '0200', item.code, item.name.slice(0, 120), catalog.gtin, '', item.unit, type, goods ? catalog.ncm : '', catalog.exTipi,
      goods && catalog.ncm ? catalog.ncm.slice(0, 2) : '', type === '09' ? '14.02' : '', icms !== undefined ? brNumber(icms) : '', catalog.cest.replace(/\D/g, ''), ''].join('|'))
    for (const conversion of catalog.conversions) {
      units.add(conversion.unit)
      const barcode = catalog.barcodes.find(entry => entry.unit === conversion.unit)?.code ?? ''
      body.push(['', '0220', conversion.unit, brNumber(conversion.factor, 6), barcode, ''].join('|'))
    }
  }
  const header = [...units].sort().map(unit => ['', '0190', unit, UNIT_NAME[unit] ?? `Unidade ${unit}`, ''].join('|'))
  return { lines: [...header, ...body], issues, count: eligible.length }
}

/* ---------- Curva ABC ---------- */

export type AbcClass = 'A' | 'B' | 'C'
export interface AbcEntry { itemId: string; quantity: number; value: number; share: number; cumulative: number; cls: AbcClass; turnover?: number }

/** Calculada pelo valor consumido no período; ninguém digita a classe. */
export function abcAnalysis(state: ErpState, days = 90, date = today()) {
  const since = addDays(date, -days)
  const consumed = new Map<string, number>()
  for (const movement of state.movements) {
    if (movement.type !== 'Saída' || movement.at.slice(0, 10) < since || movement.at.slice(0, 10) > date) continue
    consumed.set(movement.itemId, (consumed.get(movement.itemId) ?? 0) + Math.abs(movement.quantity))
  }
  const rows = state.items.filter(item => catalogOf(item).nature === 'Bem' && !catalogOf(item).deletedAt).map(item => {
    const quantity = round3(consumed.get(item.id) ?? 0)
    return { item, quantity, value: round2(quantity * item.cost) }
  }).sort((a, b) => b.value - a.value)
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const result = new Map<string, AbcEntry>()
  let running = 0
  for (const row of rows) {
    const previous = total ? running / total : 1
    running += row.value
    const share = total ? row.value / total : 0
    const cls: AbcClass = !row.value ? 'C' : previous < 0.8 ? 'A' : previous < 0.95 ? 'B' : 'C'
    const turnover = row.item.stock > 0 && row.quantity ? round2((row.quantity * 365 / days) / row.item.stock) : undefined
    result.set(row.item.id, { itemId: row.item.id, quantity: row.quantity, value: row.value, share: round3(share), cumulative: round3(total ? running / total : 0), cls, turnover })
  }
  return result
}

/* ---------- Grade ---------- */

export function modelOf(state: ErpState, item: Item) {
  const id = catalogOf(item).modelId
  return id ? state.itemModels.find(entry => entry.id === id) : undefined
}

export function variantsOf(state: ErpState, modelId: string) {
  return state.items.filter(item => item.catalog?.modelId === modelId && !item.catalog.deletedAt)
}

export function combinations(model: ItemModel): Record<string, string>[] {
  return model.axes.reduce<Record<string, string>[]>((list, axis) => list.flatMap(combo => axis.values.map(value => ({ ...combo, [axis.name]: value }))), [{}])
}

const sameCombo = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value)

export function missingCombinations(state: ErpState, model: ItemModel) {
  const taken = variantsOf(state, model.id).map(item => catalogOf(item).attributes)
  return combinations(model).filter(combo => !taken.some(attributes => sameCombo(attributes, combo)))
}

export function createModel(state: ErpState, input: { templateId: string; name: string; axes: { name: string; values: string[] }[]; templateAttributes: Record<string, string> }, actor: string, role: Role = 'Gestor') {
  if (!canEdit(role, 'nucleo')) throw new DomainError(`Quem cria grade: ${editorsLabel('nucleo')}`)
  const template = findItem(state, input.templateId)
  const catalog = editable(template, role, 'nucleo')
  if (template.type !== 'PA' && template.type !== 'KF') throw new DomainError('Grade vale para produto acabado e kit físico')
  if (catalog.modelId) throw new DomainError('O item já pertence a uma grade')
  const name = input.name.trim()
  if (name.length < 3) throw new DomainError('Dê um nome ao modelo')
  const axes = input.axes.map(axis => ({ name: axis.name.trim(), values: [...new Set(axis.values.map(value => value.trim()).filter(Boolean))] })).filter(axis => axis.name)
  if (!axes.length || axes.length > 3) throw new DomainError('A grade tem de 1 a 3 eixos (ex.: cor, tamanho, modelo de tablet)')
  if (new Set(axes.map(axis => axis.name.toLowerCase())).size !== axes.length) throw new DomainError('Eixos com nomes repetidos')
  if (axes.some(axis => !axis.values.length)) throw new DomainError('Cada eixo precisa de ao menos um valor')
  const attributes: Record<string, string> = {}
  for (const axis of axes) {
    const value = input.templateAttributes[axis.name]?.trim()
    if (!value || !axis.values.includes(value)) throw new DomainError(`Informe o valor de ${axis.name} do item-modelo`)
    attributes[axis.name] = value
  }
  const model: ItemModel = { id: nextId(state, 'GR'), name, templateId: template.id, axes, createdBy: actor, createdAt: now() }
  state.itemModels.push(model)
  catalog.modelId = model.id
  catalog.attributes = attributes
  commit(catalog, actor, [{ field: 'Grade', from: '', to: `${name} · ${Object.values(attributes).join(' · ')} (item-modelo)` }])
  log(state, 'Produtos', actor, `Grade ${name} criada a partir de ${template.code}`, undefined, template.id)
  return model
}

/** Cada combinação vira item real em rascunho, herdando fiscal, comercial e logística do item-modelo. EAN, preço, estrutura e mídia são de cada variante. */
export function generateVariants(state: ErpState, modelId: string, combos: Record<string, string>[], actor: string, role: Role = 'Gestor') {
  const model = state.itemModels.find(entry => entry.id === modelId)
  if (!model) throw new DomainError('Grade não encontrada')
  const template = getItem(state, model.templateId)
  const base = catalogOf(template)
  const missing = missingCombinations(state, model)
  const wanted = combos.filter(combo => missing.some(candidate => sameCombo(candidate, combo)))
  if (!wanted.length) throw new DomainError('Nenhuma combinação nova para gerar')
  const created: Item[] = []
  for (const combo of wanted) {
    const values = model.axes.map(axis => combo[axis.name])
    const item = createItem(state, { name: `${model.name} ${values.join(' ')}`, type: template.type, unit: template.unit, classId: base.classId }, actor, role)
    Object.assign(item, { family: template.family, variant: values.join(' · '), cost: template.cost, leadTimeDays: template.leadTimeDays, supplier: template.supplier })
    const catalog = item.catalog!
    Object.assign(catalog, {
      ncm: base.ncm, cest: base.cest, origin: base.origin, exTipi: base.exTipi, cClassTrib: base.cClassTrib,
      reform: base.reform.map(entry => ({ ...entry })), benefits: base.benefits.map(entry => ({ ...entry, id: nextId(state, 'BF') })),
      commercialName: `${base.commercialName || model.name} ${values.join(' ')}`.trim(), brand: base.brand, productLine: base.productLine, categories: [...base.categories],
      weightKg: base.weightKg, lengthCm: base.lengthCm, widthCm: base.widthCm, heightCm: base.heightCm, minLot: base.minLot, lotMultiple: base.lotMultiple,
      productionLeadDays: base.productionLeadDays, lot: base.lot, expiry: base.expiry, serial: base.serial,
      conversions: base.conversions.map(entry => ({ ...entry })), modelId: model.id, attributes: { ...combo },
    })
    commit(catalog, actor, [{ field: 'Grade', from: '', to: `${model.name} · ${values.join(' · ')} (gerado de ${template.code})` }])
    created.push(item)
  }
  log(state, 'Produtos', actor, `Grade ${model.name}: ${created.length} variante(s) gerada(s) em rascunho`, undefined, template.id)
  return created
}

/* ---------- Kit virtual ---------- */

/** O kit virtual não tem estoque: no pedido ele vira as linhas dos componentes, com o preço do kit rateado. */
export function explodeKitLines(state: ErpState, lines: { itemId: string; quantity: number; unitPrice: number }[]) {
  return lines.flatMap(line => {
    const item = getItem(state, line.itemId)
    if (item.type !== 'KT') return [line]
    if (!item.bom?.length) throw new DomainError(`${item.code} é kit virtual sem composição liberada`)
    const weights = item.bom.map(component => {
      const part = getItem(state, component.itemId)
      return currentPrice(part)?.value ?? (part.cost * 2.4 || 1)
    })
    const base = item.bom.reduce((sum, component, index) => sum + component.quantity * weights[index], 0)
    return item.bom.map((component, index) => ({
      itemId: component.itemId, quantity: round3(component.quantity * line.quantity), unitPrice: round2(line.unitPrice * weights[index] / base), kitId: item.id,
    }))
  })
}
