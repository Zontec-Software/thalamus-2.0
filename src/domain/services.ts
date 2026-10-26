import { openBomVersion } from './catalog'
import type { ErpState } from './engine'
import { DomainError, getItem, log, now } from './engine'
import type { Role, ServiceCatalogItem, ServiceExecutor, ServiceInstruction, ServicePlace } from '../types/domain'

export const SERVICE_PLACES: ServicePlace[] = ['Roboflex', 'Cliente', 'Outro']
export const SERVICE_EXECUTORS: ServiceExecutor[] = ['Própria', 'Terceirizado']
export const SERVICE_UNITS = ['hora', 'un', 'visita'] as const

export const PLACE_LABEL: Record<ServicePlace, string> = {
  Roboflex: 'Instalações da Roboflex',
  Cliente: 'Instalações do cliente',
  Outro: 'Outro local',
}

export interface ServiceInput {
  tenantId: string
  name: string
  description?: string
  unit: ServiceCatalogItem['unit']
  place: ServicePlace
  executor: ServiceExecutor
  sellable: boolean
  usableInServiceOrder: boolean
  usableInRouting: boolean
  sectorId?: string
  teamLabel?: string
  instruction?: string
  estimatedMinutes?: number
  datasheetName?: string
  supplierId?: string
  cost: number
  price: number
  fiscalNote?: string
}

export interface ServiceRoutingUse {
  itemId: string
  itemCode: string
  itemName: string
  revisionId?: string
  revisionCode: string
  revisionStatus: string
  stepId: string
  stepName: string
  instructionVersion?: number
}

const findService = (state: ErpState, id: string) => {
  const service = state.services.find(entry => entry.id === id)
  if (!service) throw new DomainError('Serviço não encontrado')
  return service
}

export function currentInstruction(service: ServiceCatalogItem): ServiceInstruction | undefined {
  return service.instructions.at(-1)
}

export function fieldVisitService(state: ErpState) {
  return state.services.find(entry => entry.status === 'Ativo' && entry.sellable && entry.usableInServiceOrder && entry.place === 'Cliente' && entry.executor === 'Própria')
}

function moneyField(value: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new DomainError(`${label} não pode ser negativo`)
  return Math.round(value * 100) / 100
}

function minutesOf(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new DomainError('O tempo estimado não pode ser negativo')
  return value
}

function checked(input: ServiceInput, state: ErpState) {
  const name = input.name.trim()
  if (!name) throw new DomainError('Informe o nome do serviço')
  if (!input.tenantId) throw new DomainError('Informe a empresa do serviço')
  if (!SERVICE_UNITS.includes(input.unit)) throw new DomainError('Escolha a unidade')
  if (!SERVICE_PLACES.includes(input.place)) throw new DomainError('Escolha o local habitual')
  if (!SERVICE_EXECUTORS.includes(input.executor)) throw new DomainError('Escolha quem executa')
  if (input.executor === 'Terceirizado' && !input.datasheetName?.trim()) throw new DomainError('Serviço terceirizado exige o datasheet anexado')
  if (input.sectorId && !state.sectors.some(entry => entry.id === input.sectorId)) throw new DomainError('Setor não encontrado')
  if (input.supplierId && !state.partners.some(entry => entry.id === input.supplierId && entry.roles.includes('Fornecedor'))) throw new DomainError('Fornecedor não encontrado')
  return name
}

function appendInstruction(service: ServiceCatalogItem, text: string | undefined, actor: string, origin: string) {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return
  const latest = currentInstruction(service)
  if (latest?.text === trimmed) return
  service.instructions.push({
    version: (latest?.version ?? 0) + 1,
    text: trimmed,
    author: actor,
    createdAt: now(),
    origin,
  })
}

function applyFields(service: ServiceCatalogItem, input: ServiceInput, name: string) {
  service.name = name
  service.description = input.description?.trim() || undefined
  service.unit = input.unit
  service.place = input.place
  service.executor = input.executor
  service.sellable = input.sellable
  service.usableInServiceOrder = input.usableInServiceOrder
  service.usableInRouting = input.usableInRouting
  service.sectorId = input.executor === 'Própria' ? input.sectorId || undefined : undefined
  service.teamLabel = input.executor === 'Própria' ? input.teamLabel?.trim() || undefined : undefined
  service.estimatedMinutes = minutesOf(input.estimatedMinutes)
  service.datasheetName = input.executor === 'Terceirizado' ? input.datasheetName?.trim() : undefined
  service.supplierId = input.executor === 'Terceirizado' ? input.supplierId || undefined : undefined
  service.cost = moneyField(input.cost, 'O custo')
  service.price = moneyField(input.price, 'O preço')
  service.fiscalNote = (input.sellable || input.usableInServiceOrder) ? input.fiscalNote?.trim() || undefined : undefined
}

export function createService(state: ErpState, input: ServiceInput, actor: string) {
  const name = checked(input, state)
  const number = state.counters.SV = (state.counters.SV ?? 4) + 1
  const service: ServiceCatalogItem = {
    id: `sv-${number}`,
    tenantId: input.tenantId,
    code: `SV-${String(number).padStart(3, '0')}`,
    name,
    unit: input.unit,
    status: 'Ativo',
    sellable: false,
    usableInServiceOrder: false,
    usableInRouting: false,
    place: input.place,
    executor: input.executor,
    instructions: [],
    cost: 0,
    price: 0,
  }
  applyFields(service, input, name)
  appendInstruction(service, input.instruction, actor, 'Cadastro')
  state.services.push(service)
  log(state, 'Serviços', actor, `${service.code} criado: ${service.name}`, undefined, service.id)
  return service
}

export function updateService(state: ErpState, id: string, input: Omit<ServiceInput, 'tenantId'>, actor: string) {
  const service = findService(state, id)
  const name = checked({ ...input, tenantId: service.tenantId }, state)
  applyFields(service, { ...input, tenantId: service.tenantId }, name)
  appendInstruction(service, input.instruction, actor, 'Alteração do cadastro')
  log(state, 'Serviços', actor, `${service.code} atualizado`, undefined, service.id)
  return service
}

export function setServiceStatus(state: ErpState, id: string, status: ServiceCatalogItem['status'], actor: string) {
  const service = findService(state, id)
  if (service.status === status) return service
  service.status = status
  log(state, 'Serviços', actor, `${service.code} ${status === 'Ativo' ? 'reativado' : 'inativado'}`, undefined, service.id)
  return service
}

/** Serviço de roteiro. Manter o já gravado na operação continua válido, mesmo inativo. */
export function assertRoutingService(state: ErpState, serviceId: string | undefined, currentId?: string) {
  if (!serviceId) return undefined
  const service = findService(state, serviceId)
  if (!service.usableInRouting) throw new DomainError('Este serviço não está marcado para uso em roteiro')
  if (service.status !== 'Ativo' && service.id !== currentId) throw new DomainError(`${service.name} está inativo. Escolha um serviço ativo.`)
  return service
}

export function serviceRoutingUses(state: ErpState, serviceId: string): ServiceRoutingUse[] {
  const rows: ServiceRoutingUse[] = []
  const seen = new Set<string>()
  for (const revision of state.productRevisions) {
    const item = state.items.find(entry => entry.id === revision.itemId)
    if (!item) continue
    for (const step of revision.routing ?? []) {
      if (step.serviceId !== serviceId) continue
      const key = `${revision.id}:${step.id}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        itemId: item.id, itemCode: item.code, itemName: item.name, revisionId: revision.id, revisionCode: revision.code,
        revisionStatus: revision.status, stepId: step.id, stepName: step.name, instructionVersion: step.serviceInstructionVersion,
      })
    }
  }
  for (const item of state.items) {
    if (state.productRevisions.some(entry => entry.itemId === item.id && (entry.routing ?? []).some(step => step.serviceId === serviceId))) continue
    for (const step of item.routing ?? []) {
      if (step.serviceId !== serviceId) continue
      rows.push({
        itemId: item.id, itemCode: item.code, itemName: item.name, revisionCode: item.revision ?? 'vigente',
        revisionStatus: 'Vigente no item', stepId: step.id, stepName: step.name, instructionVersion: step.serviceInstructionVersion,
      })
    }
  }
  return rows
}

function itemsUsing(state: ErpState, serviceId: string, itemIds: string[]) {
  if (!itemIds.length) throw new DomainError('Escolha ao menos um produto')
  const uses = serviceRoutingUses(state, serviceId)
  return itemIds.map(itemId => {
    if (!uses.some(entry => entry.itemId === itemId)) throw new DomainError('O produto escolhido não usa este serviço')
    const item = getItem(state, itemId)
    if (!(item.routing ?? []).some(step => step.serviceId === serviceId)) {
      throw new DomainError(`${item.code} não usa este serviço no roteiro vigente. A revisão antiga permanece como está.`)
    }
    if (state.productRevisions.some(entry => entry.itemId === itemId && entry.status === 'Rascunho')) {
      throw new DomainError(`Já existe uma versão em rascunho de ${item.code}. Conclua ou descarte antes`)
    }
    return item
  })
}

/**
 * Abre rascunho de versão nos produtos escolhidos. Não publica e não troca ordem já criada:
 * o mapa de situações "em andamento" e "criada sem início" ainda não foi definido.
 */
export function openServiceRoutingChange(state: ErpState, serviceId: string, itemIds: string[], mode: 'mesmos' | 'novo', actor: string, role: Role = 'Gestor') {
  const service = findService(state, serviceId)
  itemsUsing(state, serviceId, itemIds)
  let target = service
  if (mode === 'novo') {
    const latest = currentInstruction(service)
    target = createService(state, {
      tenantId: service.tenantId,
      name: service.name,
      description: service.description,
      unit: service.unit,
      place: service.place,
      executor: service.executor,
      sellable: service.sellable,
      usableInServiceOrder: service.usableInServiceOrder,
      usableInRouting: service.usableInRouting,
      sectorId: service.sectorId,
      teamLabel: service.teamLabel,
      instruction: latest?.text,
      estimatedMinutes: service.estimatedMinutes,
      datasheetName: service.datasheetName,
      supplierId: service.supplierId,
      cost: service.cost,
      price: service.price,
      fiscalNote: service.fiscalNote,
    }, actor)
    log(state, 'Serviços', actor, `${target.code} criado a partir de ${service.code} para parte dos produtos`, undefined, service.id)
  }
  const version = currentInstruction(target)?.version
  const revisionIds: string[] = []
  for (const itemId of itemIds) {
    const revision = openBomVersion(state, itemId, mode === 'novo'
      ? `Serviço ${target.code} no lugar de ${service.code}. Origem: cadastro de serviços.`
      : `Alteração do serviço ${service.code}. Origem: cadastro de serviços. A revisão anterior permanece.`, actor, role)
    for (const step of revision.routing ?? []) {
      if (step.serviceId !== serviceId) continue
      if (mode === 'novo') step.serviceId = target.id
      step.serviceInstructionVersion = version
    }
    revisionIds.push(revision.id)
  }
  log(state, 'Serviços', actor, `${target.code}: rascunho de versão aberto em ${itemIds.length} produto(s). Ordens já criadas não foram trocadas.`, undefined, target.id)
  return { serviceId: target.id, revisionIds }
}
