import type { ErpState } from './engine'
import { DomainError, log, nextId } from './engine'
import type { Resource } from '../types/domain'

export const RESOURCE_KINDS: Resource['kind'][] = ['Injetora', 'Montagem', 'Almoxarifado', 'Qualidade', 'Expedição']

export interface ResourceInput {
  tenantId: string
  name: string
  kind: Resource['kind']
  dailyMinutes: number
  hourlyRate?: number
}

export function resourceIsOpen(resource: Resource) {
  return resource.status !== 'Inativo'
}

/** Posto inativo some das escolhas novas, mas continua visível enquanto houver ordem aberta nele. */
export function showOnFloor(state: ErpState, resource: Resource) {
  return resourceIsOpen(resource) || resourceHasOpenWork(state, resource.id)
}

export function resourceHasOpenWork(state: ErpState, resourceId: string) {
  return state.productionOrders.some(op => op.status !== 'Concluída' && (
    op.resourceId === resourceId || op.operations.some(operation => operation.resourceId === resourceId && operation.status !== 'Concluída')
  ))
}

/** Lista de escolha: ativos da empresa, mais o posto que o registro já usa. */
export function resourceOffered(resource: Resource, tenantId: string, keepIds: string[] = []) {
  if (resource.tenantId !== tenantId) return false
  return resourceIsOpen(resource) || keepIds.includes(resource.id)
}

export function assertResourceChoice(state: ErpState, resourceId: string, currentId?: string) {
  const resource = state.resources.find(entry => entry.id === resourceId)
  if (!resource) throw new DomainError('Escolha o posto de trabalho da operação')
  if (!resourceIsOpen(resource) && resource.id !== currentId) throw new DomainError(`${resource.name} está inativo. Escolha um posto ativo.`)
  return resource
}

/** Compatibilidade nova só com posto ativo. O posto inativo que já estava gravado permanece. */
export function keptCompatibleResources(state: ErpState, ids: string[], previous: string[] = []) {
  const known = ids.filter(id => state.resources.some(entry => entry.id === id))
  for (const id of known) {
    if (!previous.includes(id)) assertResourceChoice(state, id)
  }
  return known
}

function normalize(name: string) {
  const trimmed = name.trim()
  if (trimmed.length < 3) throw new DomainError('Dê um nome ao posto')
  return trimmed
}

function minutesOf(value: number) {
  if (!Number.isInteger(value) || value < 1) throw new DomainError('Informe os minutos disponíveis por dia')
  return value
}

function rateOf(value: number | undefined) {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value < 0) throw new DomainError('O custo-hora não pode ser negativo')
  return value
}

function sameName(state: ErpState, tenantId: string, name: string, exceptId?: string) {
  const key = name.toLocaleLowerCase()
  if (state.resources.some(entry => entry.tenantId === tenantId && entry.id !== exceptId && entry.name.toLocaleLowerCase() === key)) {
    throw new DomainError('Já existe um posto com este nome nesta empresa')
  }
}

export function resourceIsReferenced(state: ErpState, id: string) {
  if (state.assets.some(asset => asset.resourceId === id)) return true
  if (state.productionOrders.some(op => op.resourceId === id || op.operations.some(operation => operation.resourceId === id))) return true
  if (state.items.some(item => (item.routing ?? []).some(step => step.resourceId === id) || item.catalog?.tooling?.compatibleResourceIds.includes(id))) return true
  return state.productRevisions.some(revision => (revision.routing ?? []).some(step => step.resourceId === id))
}

function findResource(state: ErpState, id: string) {
  const resource = state.resources.find(entry => entry.id === id)
  if (!resource) throw new DomainError('Posto não encontrado')
  return resource
}

export function createResource(state: ErpState, input: ResourceInput, actor: string) {
  if (!input.tenantId) throw new DomainError('O posto pertence a uma empresa')
  if (!RESOURCE_KINDS.includes(input.kind)) throw new DomainError('Escolha o tipo do posto')
  const name = normalize(input.name)
  sameName(state, input.tenantId, name)
  const resource: Resource = {
    id: nextId(state, 'PST').toLowerCase(),
    tenantId: input.tenantId,
    name,
    kind: input.kind,
    status: 'Ativo',
    dailyMinutes: minutesOf(input.dailyMinutes),
    hourlyRate: rateOf(input.hourlyRate),
  }
  state.resources.push(resource)
  log(state, 'Postos', actor, `${resource.name} cadastrado (${resource.kind})`, undefined, resource.id)
  return resource
}

export function updateResource(state: ErpState, id: string, input: Omit<ResourceInput, 'tenantId'>, actor: string) {
  const resource = findResource(state, id)
  if (!RESOURCE_KINDS.includes(input.kind)) throw new DomainError('Escolha o tipo do posto')
  const name = normalize(input.name)
  sameName(state, resource.tenantId, name, resource.id)
  if (input.kind !== resource.kind && resourceIsReferenced(state, resource.id)) {
    throw new DomainError('O tipo não muda enquanto o posto estiver em roteiro, ordem, ferramental ou ativo')
  }
  resource.name = name
  resource.kind = input.kind
  resource.dailyMinutes = minutesOf(input.dailyMinutes)
  resource.hourlyRate = rateOf(input.hourlyRate)
  log(state, 'Postos', actor, `${resource.name} atualizado`, undefined, resource.id)
  return resource
}

export function inactivateResource(state: ErpState, id: string, actor: string) {
  const resource = findResource(state, id)
  if (resource.status === 'Inativo') throw new DomainError('O posto já está inativo')
  resource.status = 'Inativo'
  log(state, 'Postos', actor, `${resource.name} inativado. Ordens e roteiros já gravados continuam nele`, undefined, resource.id)
  return resource
}

export function reactivateResource(state: ErpState, id: string, actor: string) {
  const resource = findResource(state, id)
  if (resource.status === 'Ativo') throw new DomainError('O posto já está ativo')
  resource.status = 'Ativo'
  log(state, 'Postos', actor, `${resource.name} reativado`, undefined, resource.id)
  return resource
}

export function removeResource(state: ErpState, id: string, actor: string) {
  const resource = findResource(state, id)
  if (resourceIsReferenced(state, resource.id)) {
    throw new DomainError('Este posto já é usado em roteiro, ordem, ferramental ou ativo. Inative para tirar das escolhas novas')
  }
  state.resources = state.resources.filter(entry => entry.id !== resource.id)
  log(state, 'Postos', actor, `${resource.name} excluído`, undefined, resource.id)
  return resource
}
