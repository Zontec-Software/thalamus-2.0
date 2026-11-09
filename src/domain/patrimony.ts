import type { ErpState } from './engine'
import { DEFAULT_TENANT, DomainError, log, nextId, now, today } from './engine'
import type { AssetCondition, AssetInventory, AssetMovement, AssetMovementReason, Facility } from '../types/domain'

const find = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const entry = list.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError(`${label} não encontrado`)
  return entry
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

export const MOVEMENT_REASONS: AssetMovementReason[] = ['Transferência', 'Manutenção', 'Locação', 'Devolução', 'Baixa', 'Outro']
export const ASSET_CONDITIONS: AssetCondition[] = ['Bom', 'Com avaria', 'Indisponível para uso']

/* ---------- Instalações ---------- */

export function saveFacility(state: ErpState, input: Omit<Facility, 'id' | 'tenantId'> & { id?: string }, actor: string) {
  if (!input.code.trim() || !input.name.trim()) throw new DomainError('Informe código e nome da instalação')
  const clash = state.facilities.find(entry => entry.id !== input.id && (normalize(entry.code) === normalize(input.code) || normalize(entry.name) === normalize(input.name)))
  if (clash) throw new DomainError(`Já existe a instalação ${clash.code} · ${clash.name}`)
  if (input.id) {
    const facility = find(state.facilities, input.id, 'Instalação')
    if (input.status === 'Inativo' && state.assets.some(entry => entry.facilityId === facility.id && entry.status !== 'Baixado')) {
      throw new DomainError('Há bens nesta instalação. Movimente-os antes de inativar')
    }
    Object.assign(facility, { ...input, code: input.code.trim(), name: input.name.trim() })
    log(state, 'Ativos', actor, `Instalação ${facility.code} atualizada`, undefined, facility.id)
    return facility
  }
  const facility: Facility = { ...input, id: nextId(state, 'IN'), tenantId: DEFAULT_TENANT, code: input.code.trim(), name: input.name.trim() }
  state.facilities.push(facility)
  log(state, 'Ativos', actor, `Instalação ${facility.code} cadastrada`, undefined, facility.id)
  return facility
}

/* ---------- Movimentações ---------- */

export function requestMovement(
  state: ErpState,
  input: Pick<AssetMovement, 'assetId' | 'reason'> & Partial<Pick<AssetMovement, 'toFacilityId' | 'note' | 'rentalId'>>,
  actor: string,
) {
  const asset = find(state.assets, input.assetId, 'Bem')
  if (asset.status === 'Baixado') throw new DomainError('Bem baixado não se movimenta')
  if (state.assetMovements.some(entry => entry.assetId === asset.id && (entry.status === 'Solicitada' || entry.status === 'Aprovada'))) {
    throw new DomainError('Já há uma movimentação em aberto para este bem')
  }
  if (input.reason !== 'Baixa' && input.reason !== 'Locação') {
    if (!input.toFacilityId) throw new DomainError('Escolha o destino')
    const target = find(state.facilities, input.toFacilityId, 'Instalação')
    if (target.status !== 'Ativo') throw new DomainError(`${target.name} está ${target.status.toLowerCase()}`)
    if (target.id === asset.facilityId) throw new DomainError('O bem já está nesta instalação')
  }
  if ((input.reason === 'Baixa' || input.reason === 'Outro') && !input.note?.trim()) throw new DomainError('Explique o motivo')
  const movement: AssetMovement = {
    id: nextId(state, 'MP'), tenantId: DEFAULT_TENANT, assetId: asset.id, fromFacilityId: asset.facilityId, toFacilityId: input.toFacilityId,
    reason: input.reason, status: 'Solicitada', requestedBy: actor, requestedAt: now(), note: input.note?.trim() || undefined, rentalId: input.rentalId,
  }
  state.assetMovements.unshift(movement)
  log(state, 'Ativos', actor, `${movement.id}: ${input.reason.toLowerCase()} de ${asset.name} solicitada`, undefined, asset.id)
  return movement
}

/** Aprovação de outra pessoa. Baixa sempre precisa dela. */
export function approveMovement(state: ErpState, id: string, actor: string) {
  const movement = find(state.assetMovements, id, 'Movimentação')
  if (movement.status !== 'Solicitada') throw new DomainError('Só movimentação solicitada é aprovada')
  if (movement.requestedBy === actor) throw new DomainError('Quem solicitou não aprova a própria movimentação')
  movement.status = 'Aprovada'
  movement.approvedBy = actor
  movement.approvedAt = now()
  log(state, 'Ativos', actor, `${movement.id} aprovada`, undefined, movement.assetId)
  return movement
}

/** Só aqui a localização do bem muda. */
export function completeMovement(state: ErpState, id: string, actor: string) {
  const movement = find(state.assetMovements, id, 'Movimentação')
  if (movement.status !== 'Aprovada') throw new DomainError('Aprove a movimentação antes de concluir')
  const asset = find(state.assets, movement.assetId, 'Bem')
  movement.status = 'Concluída'
  movement.completedAt = now()
  if (movement.reason === 'Baixa') {
    asset.status = 'Baixado'
    asset.facilityId = undefined
  } else if (movement.toFacilityId) {
    asset.facilityId = movement.toFacilityId
    asset.location = state.facilities.find(entry => entry.id === movement.toFacilityId)?.name ?? asset.location
    if (movement.reason === 'Manutenção') asset.status = 'Em manutenção'
  }
  log(state, 'Ativos', actor, `${movement.id} concluída: ${asset.name} ${movement.reason === 'Baixa' ? 'baixado' : `em ${asset.location ?? '—'}`}`, undefined, asset.id)
  return movement
}

export function cancelMovement(state: ErpState, id: string, reason: string, actor: string) {
  const movement = find(state.assetMovements, id, 'Movimentação')
  if (movement.status === 'Concluída' || movement.status === 'Cancelada') throw new DomainError('Movimentação encerrada')
  if (!reason.trim()) throw new DomainError('Informe o motivo')
  movement.status = 'Cancelada'
  movement.note = [movement.note, `Cancelada: ${reason.trim()}`].filter(Boolean).join(' · ')
  log(state, 'Ativos', actor, `${movement.id} cancelada (${reason.trim()})`, undefined, movement.assetId)
  return movement
}

/* ---------- Inventário ---------- */

export function openInventory(state: ErpState, facilityId: string, actor: string) {
  const facility = find(state.facilities, facilityId, 'Instalação')
  if (state.assetInventories.some(entry => entry.facilityId === facility.id && entry.status !== 'Conciliado')) throw new DomainError('Já há inventário em aberto nesta instalação')
  const assets = state.assets.filter(entry => entry.facilityId === facility.id && entry.status !== 'Baixado')
  if (!assets.length) throw new DomainError('Nenhum bem registrado nesta instalação')
  const inventory: AssetInventory = {
    id: nextId(state, 'IV'), tenantId: DEFAULT_TENANT, facilityId: facility.id, date: today(), responsible: actor, status: 'Em contagem',
    lines: assets.map(asset => ({ assetId: asset.id, expectedFacilityId: facility.id, expectedCondition: asset.condition ?? 'Bom' })),
  }
  state.assetInventories.unshift(inventory)
  log(state, 'Ativos', actor, `${inventory.id}: inventário de ${facility.name} aberto com ${assets.length} bens`, undefined, facility.id)
  return inventory
}

export function inventoryDivergent(line: AssetInventory['lines'][number]) {
  return line.found === false || (line.found === true && !!line.condition && line.condition !== line.expectedCondition)
}

export function countInventoryLine(state: ErpState, inventoryId: string, assetId: string, found: boolean, condition: AssetCondition | undefined, actor: string) {
  const inventory = find(state.assetInventories, inventoryId, 'Inventário')
  if (inventory.status !== 'Em contagem') throw new DomainError('A contagem deste inventário está fechada')
  const line = inventory.lines.find(entry => entry.assetId === assetId)
  if (!line) throw new DomainError('Bem fora deste inventário')
  line.found = found
  line.condition = found ? condition ?? line.expectedCondition : undefined
  line.resolution = undefined
  log(state, 'Ativos', actor, `${inventory.id}: ${state.assets.find(entry => entry.id === assetId)?.name ?? assetId} ${found ? 'encontrado' : 'não encontrado'}`, undefined, inventory.facilityId)
  return inventory
}

/** Fechar a contagem: sem divergência concilia; com divergência fica Pendente até cada uma ter tratamento. */
export function closeInventoryCount(state: ErpState, inventoryId: string, actor: string) {
  const inventory = find(state.assetInventories, inventoryId, 'Inventário')
  if (inventory.status !== 'Em contagem') throw new DomainError('A contagem já foi fechada')
  if (inventory.lines.some(entry => entry.found === undefined)) throw new DomainError('Conte todos os bens antes de fechar')
  const divergent = inventory.lines.filter(inventoryDivergent)
  inventory.status = divergent.length ? 'Pendente' : 'Conciliado'
  log(state, 'Ativos', actor, `${inventory.id}: contagem fechada${divergent.length ? ` com ${divergent.length} divergência(s)` : ', conciliado'}`, undefined, inventory.facilityId)
  return inventory
}

export function resolveInventoryLine(state: ErpState, inventoryId: string, assetId: string, resolution: string, actor: string) {
  const inventory = find(state.assetInventories, inventoryId, 'Inventário')
  if (inventory.status !== 'Pendente') throw new DomainError('Só inventário pendente recebe tratamento de divergência')
  const line = inventory.lines.find(entry => entry.assetId === assetId)
  if (!line || !inventoryDivergent(line)) throw new DomainError('Este bem não está divergente')
  if (!resolution.trim()) throw new DomainError('Descreva o tratamento')
  line.resolution = resolution.trim()
  const asset = state.assets.find(entry => entry.id === assetId)
  if (asset && line.found && line.condition) asset.condition = line.condition
  if (inventory.lines.filter(inventoryDivergent).every(entry => entry.resolution)) inventory.status = 'Conciliado'
  log(state, 'Ativos', actor, `${inventory.id}: divergência de ${asset?.name ?? assetId} tratada (${resolution.trim()})`, undefined, inventory.facilityId)
  return inventory
}

/* ---------- Depreciação (cadastro) ---------- */

/** Só os parâmetros. O cálculo contábil fica fora do Thalamus. */
export function setDepreciation(state: ErpState, assetId: string, input: { acquisitionValue?: number; usefulLifeYears?: number; residualValue?: number; acquiredAt?: string }, actor: string) {
  const asset = find(state.assets, assetId, 'Bem')
  if (input.acquisitionValue !== undefined && input.acquisitionValue < 0) throw new DomainError('Valor de aquisição não pode ser negativo')
  if (input.usefulLifeYears !== undefined && !(input.usefulLifeYears > 0)) throw new DomainError('Vida útil em anos, maior que zero')
  const acquisition = input.acquisitionValue ?? asset.acquisitionValue ?? 0
  if (input.residualValue !== undefined && (input.residualValue < 0 || input.residualValue > acquisition)) throw new DomainError('O residual vai de zero ao valor de aquisição')
  Object.assign(asset, input, { depreciationMethod: 'Linear' as const })
  log(state, 'Ativos', actor, `${asset.name}: parâmetros de depreciação atualizados`, undefined, asset.id)
  return asset
}
