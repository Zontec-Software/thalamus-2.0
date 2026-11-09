import type { ErpState } from './engine'
import { addDays, DEFAULT_TENANT, DomainError, log, nextId, now, today } from './engine'
import type { AssetCondition, RentalBilling, RentalContract, RentalStatus, SalesOrder, Warranty, WarrantyStatus } from '../types/domain'

const find = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const entry = list.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError(`${label} não encontrado`)
  return entry
}

/* ---------- Garantia ---------- */

export const DEFAULT_WARRANTY_MONTHS = 12

export function warrantyPolicy(state: ErpState, tenantId = DEFAULT_TENANT) {
  return state.warrantyPolicies.find(entry => entry.tenantId === tenantId)
}

export function warrantyStatus(warranty: Warranty, on = today()): WarrantyStatus {
  if (warranty.status === 'Ativa' && warranty.endsOn < on) return 'Vencida'
  return warranty.status
}

function monthsLater(date: string, months: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setMonth(value.getMonth() + months)
  return value.toISOString().slice(0, 10)
}

/** A garantia nasce da entrega confirmada. Sem regra aprovada, nasce Pendente e a cobertura só é sugerida. */
export function openWarranty(state: ErpState, order: SalesOrder, actor: string) {
  if (state.warranties.some(entry => entry.salesOrderId === order.id)) return undefined
  const policy = warrantyPolicy(state)
  const startsOn = (order.shipment?.deliveredAt ?? order.shipment?.shippedAt ?? now()).slice(0, 10)
  const months = policy?.months ?? DEFAULT_WARRANTY_MONTHS
  const warranty: Warranty = {
    id: nextId(state, 'GT'), tenantId: DEFAULT_TENANT, partnerId: order.customerId, salesOrderId: order.id, itemId: order.itemId,
    startsOn, endsOn: monthsLater(startsOn, months), terms: policy?.terms ?? 'Regra de garantia ainda não aprovada',
    status: policy?.approvedBy ? 'Ativa' : 'Pendente', createdAt: now(),
  }
  state.warranties.unshift(warranty)
  log(state, 'Assistência', actor, `${warranty.id}: garantia ${warranty.status === 'Ativa' ? 'ativa' : 'pendente de regra'} até ${warranty.endsOn} para ${order.id}`, order.id, warranty.id)
  return warranty
}

/** Cobertura proposta para o chamado. A decisão final continua do técnico. */
export function warrantyCoverage(state: ErpState, order: SalesOrder): { covered: boolean; reason: string; warranty?: Warranty } {
  const warranty = state.warranties.find(entry => entry.salesOrderId === order.id)
  if (warranty) {
    const status = warrantyStatus(warranty)
    if (status === 'Ativa') return { covered: true, reason: `garantia ${warranty.id} até ${warranty.endsOn}`, warranty }
    if (status === 'Pendente') return { covered: warranty.endsOn >= today(), reason: `garantia ${warranty.id} pendente de regra aprovada`, warranty }
    return { covered: false, reason: `garantia ${warranty.id} ${status.toLowerCase()}`, warranty }
  }
  const reference = order.shipment?.shippedAt ?? order.receivedAt
  const months = warrantyPolicy(state)?.months ?? DEFAULT_WARRANTY_MONTHS
  const covered = !!reference && monthsLater(reference.slice(0, 10), months) >= today()
  return { covered, reason: covered ? `sem registro, dentro de ${months} meses da expedição` : 'sem garantia registrada' }
}

/** A regra é da empresa. Aprovar ativa as garantias que nasceram pendentes. */
export function setWarrantyPolicy(state: ErpState, input: { months: number; terms: string }, actor: string) {
  if (!(input.months > 0) || input.months > 120) throw new DomainError('Prazo de garantia entre 1 e 120 meses')
  if (!input.terms.trim()) throw new DomainError('Descreva o que a garantia cobre e o que fica fora')
  let policy = warrantyPolicy(state)
  if (!policy) {
    policy = { tenantId: DEFAULT_TENANT, months: input.months, terms: input.terms.trim() }
    state.warrantyPolicies.push(policy)
  } else {
    policy.months = input.months
    policy.terms = input.terms.trim()
    policy.approvedBy = undefined
    policy.approvedAt = undefined
  }
  log(state, 'Assistência', actor, `Regra de garantia: ${input.months} meses, aguardando aprovação`)
  return policy
}

export function approveWarrantyPolicy(state: ErpState, actor: string) {
  const policy = warrantyPolicy(state)
  if (!policy) throw new DomainError('Cadastre a regra de garantia antes de aprovar')
  if (policy.approvedBy) throw new DomainError('A regra já está aprovada')
  policy.approvedBy = actor
  policy.approvedAt = now()
  for (const warranty of state.warranties.filter(entry => entry.status === 'Pendente')) {
    warranty.status = 'Ativa'
    warranty.endsOn = monthsLater(warranty.startsOn, policy.months)
    warranty.terms = policy.terms
  }
  log(state, 'Assistência', actor, `Regra de garantia aprovada: ${policy.months} meses`)
  return policy
}

export function setWarrantyStatus(state: ErpState, id: string, status: 'Suspensa' | 'Encerrada' | 'Ativa', note: string, actor: string) {
  const warranty = find(state.warranties, id, 'Garantia')
  if (warranty.status === 'Encerrada') throw new DomainError('Garantia encerrada não muda')
  if (status === 'Ativa' && !warrantyPolicy(state)?.approvedBy) throw new DomainError('Sem regra aprovada a garantia fica pendente')
  if (status !== 'Ativa' && !note.trim()) throw new DomainError('Informe o motivo')
  warranty.status = status
  warranty.note = note.trim() || warranty.note
  log(state, 'Assistência', actor, `${warranty.id}: ${status.toLowerCase()}${note.trim() ? ` (${note.trim()})` : ''}`, warranty.salesOrderId, warranty.id)
  return warranty
}

/* ---------- Locação ---------- */

export const RENTAL_BILLINGS: RentalBilling[] = ['Mensal', 'Semanal', 'Diária', 'Valor fixo']

export function rentalStatus(contract: RentalContract, on = today()): RentalStatus {
  if (contract.status === 'Ativo' && !contract.returnedOn && contract.expectedReturnOn < on) return 'Atrasado'
  return contract.status
}

export function createRental(
  state: ErpState,
  input: Pick<RentalContract, 'partnerId' | 'startsOn' | 'endsOn'> & Partial<Pick<RentalContract, 'opportunityId' | 'assetId' | 'amount' | 'billing' | 'paymentTerms' | 'note'>>,
  actor: string,
) {
  const partner = state.partners.find(entry => entry.id === input.partnerId)
  if (!partner) throw new DomainError('Escolha o cliente')
  if (!input.startsOn || !input.endsOn || input.endsOn < input.startsOn) throw new DomainError('Informe início e fim, com o fim depois do início')
  const contract: RentalContract = {
    id: nextId(state, 'LC'), tenantId: DEFAULT_TENANT, ...input, expectedReturnOn: input.endsOn, status: 'Proposta', createdBy: actor, createdAt: now(),
  }
  state.rentalContracts.unshift(contract)
  log(state, 'Comercial', actor, `${contract.id}: proposta de locação para ${partner.name}`, undefined, contract.id)
  return contract
}

export function updateRental(state: ErpState, id: string, patch: Partial<Pick<RentalContract, 'assetId' | 'amount' | 'billing' | 'paymentTerms' | 'startsOn' | 'endsOn' | 'note'>>, actor: string) {
  const contract = find(state.rentalContracts, id, 'Contrato de locação')
  if (contract.status !== 'Proposta') throw new DomainError('Só a proposta de locação é editada; o contrato ativo muda por aditivo')
  Object.assign(contract, patch)
  if (patch.endsOn) contract.expectedReturnOn = patch.endsOn
  if (contract.endsOn < contract.startsOn) throw new DomainError('O fim precisa ser depois do início')
  log(state, 'Comercial', actor, `${contract.id}: proposta de locação atualizada`, undefined, contract.id)
  return contract
}

/** Ativação: bem disponível e locável, valor, cobrança, condição de pagamento e aprovação de outra pessoa. */
export function activateRental(state: ErpState, id: string, actor: string) {
  const contract = find(state.rentalContracts, id, 'Contrato de locação')
  if (contract.status !== 'Proposta') throw new DomainError('Só a proposta de locação é ativada')
  if (contract.createdBy === actor) throw new DomainError('Quem propôs a locação não aprova o próprio contrato')
  if (!contract.assetId) throw new DomainError('Escolha o bem que vai ao cliente')
  const asset = find(state.assets, contract.assetId, 'Bem')
  if (!asset.rentable) throw new DomainError(`${asset.name} não está marcado como locável`)
  if (asset.status && asset.status !== 'Operando') throw new DomainError(`${asset.name} está ${asset.status.toLowerCase()}: não pode sair em locação`)
  if (state.rentalContracts.some(entry => entry.id !== contract.id && entry.assetId === asset.id && entry.status === 'Ativo')) throw new DomainError(`${asset.name} já está em outro contrato ativo`)
  if (!(Number(contract.amount) > 0)) throw new DomainError('Informe o valor da locação')
  if (!contract.billing) throw new DomainError('Informe a forma de cobrança')
  if (!contract.paymentTerms?.trim()) throw new DomainError('Informe a condição de pagamento')
  contract.status = 'Ativo'
  contract.approvedBy = actor
  contract.approvedAt = now()
  contract.departureOn = today()
  contract.conditionOut = asset.condition ?? 'Bom'
  asset.status = 'Locado'
  log(state, 'Comercial', actor, `${contract.id} ativo: ${asset.name} locado até ${contract.expectedReturnOn}`, undefined, contract.id)
  log(state, 'Ativos', actor, `${asset.name} saiu em locação (${contract.id})`, undefined, asset.id)
  return contract
}

/** Retorno registra a condição. Com avaria, o bem fica parado até a manutenção. */
export function returnRental(state: ErpState, id: string, condition: AssetCondition, note: string, actor: string) {
  const contract = find(state.rentalContracts, id, 'Contrato de locação')
  if (contract.status !== 'Ativo') throw new DomainError('Só contrato ativo registra retorno')
  if (condition !== 'Bom' && !note.trim()) throw new DomainError('Descreva a avaria encontrada no retorno')
  contract.status = 'Encerrado'
  contract.returnedOn = today()
  contract.conditionIn = condition
  if (note.trim()) contract.note = note.trim()
  const asset = contract.assetId ? state.assets.find(entry => entry.id === contract.assetId) : undefined
  if (asset) {
    asset.condition = condition
    asset.status = condition === 'Bom' ? 'Operando' : 'Parado'
    log(state, 'Ativos', actor, `${asset.name} voltou da locação ${condition === 'Bom' ? 'em bom estado' : `com avaria: ${note.trim()}`}`, undefined, asset.id)
  }
  log(state, 'Comercial', actor, `${contract.id} encerrado: retorno em ${contract.returnedOn}`, undefined, contract.id)
  return contract
}

export function cancelRental(state: ErpState, id: string, reason: string, actor: string) {
  const contract = find(state.rentalContracts, id, 'Contrato de locação')
  if (contract.status !== 'Proposta') throw new DomainError('Contrato ativo encerra pelo retorno do bem')
  if (!reason.trim()) throw new DomainError('Informe o motivo do cancelamento')
  contract.status = 'Cancelado'
  contract.cancelReason = reason.trim()
  log(state, 'Comercial', actor, `${contract.id} cancelado: ${reason.trim()}`, undefined, contract.id)
  return contract
}

export function rentalAlerts(state: ErpState, on = today()) {
  return state.rentalContracts.filter(entry => {
    const status = rentalStatus(entry, on)
    return status === 'Atrasado' || (status === 'Ativo' && entry.expectedReturnOn <= addDays(on, 7))
  })
}
