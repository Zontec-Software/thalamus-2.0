import type { ErpState } from './engine'
import { DomainError, getItem, log, nextId, now } from './engine'
import type { AbcSuggestion, AddressPurpose, BusinessPartner, PartnerAddress, PartnerContact, PartnerRoleName, Role } from '../types/domain'

export interface NewPartnerInput {
  personType: 'Física' | 'Jurídica'
  legalName: string
  tradeName: string
  document: string
  roles: PartnerRoleName[]
  contacts: PartnerContact[]
  addresses: PartnerAddress[]
  /** O usuário viu o aviso de documento repetido e decidiu criar outro registro. */
  forceDuplicate?: boolean
}

const digits = (value: string) => value.replace(/\D/g, '')

export function roleStatus(partner: BusinessPartner, role: PartnerRoleName) {
  return partner.roleStatus[role] ?? (partner.roles.includes(role) ? 'Ativo' : undefined)
}

export function roleIsOpen(partner: BusinessPartner, role: PartnerRoleName) {
  return partner.roles.includes(role) && roleStatus(partner, role) === 'Ativo'
}

export function openPartners(state: ErpState, role: PartnerRoleName) {
  return state.partners.filter(partner => roleIsOpen(partner, role))
}

/** Em cadastro quando ainda não há papel; Inativo só quando todo papel atribuído está inativo. */
export function phaseOf(partner: BusinessPartner): 'Em cadastro' | 'Ativo' | 'Inativo' {
  if (!partner.roles.length) return 'Em cadastro'
  const statuses = partner.roles.map(role => roleStatus(partner, role))
  if (statuses.every(status => status === 'Inativo')) return 'Inativo'
  if (statuses.some(status => status === 'Ativo')) return 'Ativo'
  return 'Em cadastro'
}

export function duplicatePartner(state: ErpState, document: string, exceptId?: string) {
  const key = digits(document)
  if (key.length < 11) return undefined
  return state.partners.find(partner => partner.id !== exceptId && digits(partner.document) === key)
}

function mirror(partner: BusinessPartner) {
  const main = partner.contacts[0]
  const seat = partner.addresses.find(entry => entry.purpose === 'Sede') ?? partner.addresses[0]
  partner.name = partner.tradeName.trim() || partner.legalName.trim()
  partner.contact = main?.name ?? ''
  partner.email = main?.email ?? ''
  partner.city = seat ? [seat.city, seat.state].filter(Boolean).join(', ') : partner.city
  partner.status = partner.roles.some(role => roleStatus(partner, role) === 'Ativo') ? 'Ativo' : 'Inativo'
}

function audit(partner: BusinessPartner, actor: string, text: string, before?: string, after?: string) {
  partner.audit.unshift({ at: now(), actor, text, before, after })
}

export function createPartner(state: ErpState, input: NewPartnerInput, actor: string) {
  const legalName = input.legalName.trim()
  const tradeName = input.tradeName.trim()
  if (legalName.length < 2) throw new DomainError('Informe a razão social ou o nome')
  if (digits(input.document).length < 11) throw new DomainError('Informe o CPF ou o CNPJ')
  const existing = duplicatePartner(state, input.document)
  if (existing && !input.forceDuplicate) {
    throw new DomainError(`Já existe um parceiro com este documento: ${existing.name}. Abra esse cadastro ou confirme que quer outro registro.`)
  }
  const partner: BusinessPartner = {
    id: `bp${String(state.counters.BP = (state.counters.BP ?? 0) + 1)}`,
    personType: input.personType,
    legalName,
    tradeName: tradeName || legalName,
    name: '',
    document: input.document.trim(),
    roles: [...new Set(input.roles)],
    roleStatus: Object.fromEntries(input.roles.map(role => [role, 'Ativo'])) as BusinessPartner['roleStatus'],
    contacts: input.contacts.filter(entry => entry.name.trim()).map(entry => ({ ...entry, name: entry.name.trim() })),
    addresses: input.addresses.filter(entry => entry.city.trim() || entry.line.trim()),
    city: '',
    contact: '',
    email: '',
    status: 'Ativo',
    origin: 'Cadastro',
    createdAt: now(),
    createdBy: actor,
    audit: [],
    abcSuggestions: [],
  }
  mirror(partner)
  audit(partner, actor, partner.roles.length ? `Cadastro criado com papel ${partner.roles.join(' e ')}` : 'Cadastro criado sem papel, em cadastro')
  state.partners.unshift(partner)
  log(state, 'Cadastros', actor, `${partner.name} cadastrado${partner.roles.length ? ` (${partner.roles.join(', ')})` : ' sem papel'}`, undefined, partner.id)
  return partner
}

export function updatePartnerMaster(state: ErpState, id: string, patch: { legalName: string; tradeName: string; document: string; personType: 'Física' | 'Jurídica' }, actor: string) {
  const partner = findPartner(state, id)
  const before = `${partner.legalName} · ${partner.document}`
  if (patch.legalName.trim().length < 2) throw new DomainError('Informe a razão social ou o nome')
  if (digits(patch.document).length < 11) throw new DomainError('Informe o CPF ou o CNPJ')
  const existing = duplicatePartner(state, patch.document, id)
  if (existing) throw new DomainError(`Este documento já é de ${existing.name}`)
  partner.legalName = patch.legalName.trim()
  partner.tradeName = patch.tradeName.trim() || partner.legalName
  partner.document = patch.document.trim()
  partner.personType = patch.personType
  mirror(partner)
  const after = `${partner.legalName} · ${partner.document}`
  if (before !== after) audit(partner, actor, 'Dados gerais alterados', before, after)
  return partner
}

export function addContact(state: ErpState, id: string, contact: PartnerContact, actor: string) {
  const partner = findPartner(state, id)
  if (!contact.name.trim()) throw new DomainError('Informe o nome do contato')
  partner.contacts.push({ ...contact, name: contact.name.trim() })
  mirror(partner)
  audit(partner, actor, `Contato incluído: ${contact.name.trim()}`)
  return partner
}

export function addAddress(state: ErpState, id: string, address: PartnerAddress, actor: string) {
  const partner = findPartner(state, id)
  if (!address.city.trim() && !address.line.trim()) throw new DomainError('Informe a cidade ou o logradouro')
  partner.addresses.push(address)
  mirror(partner)
  audit(partner, actor, `Endereço incluído (${address.purpose})`)
  return partner
}

export function addRole(state: ErpState, id: string, role: 'Cliente' | 'Fornecedor', actor: string) {
  const partner = findPartner(state, id)
  if (partner.roles.includes(role) && roleStatus(partner, role) !== 'Inativo') throw new DomainError(`O papel ${role} já está neste cadastro`)
  if (!partner.roles.includes(role)) partner.roles.push(role)
  partner.roleStatus[role] = 'Ativo'
  mirror(partner)
  audit(partner, actor, `Papel ${role} atribuído`, roleStatus(partner, role), 'Ativo')
  log(state, 'Cadastros', actor, `${partner.name}: papel ${role}`, undefined, partner.id)
  return partner
}

/** Inativa só o papel. O outro papel, o histórico e as operações já abertas ficam. */
export function inactivateRole(state: ErpState, id: string, role: 'Cliente' | 'Fornecedor', reason: string, actor: string) {
  const partner = findPartner(state, id)
  if (!partner.roles.includes(role)) throw new DomainError(`Este parceiro não tem o papel ${role}`)
  if (roleStatus(partner, role) === 'Inativo') throw new DomainError(`O papel ${role} já está inativo`)
  if (!reason.trim()) throw new DomainError('Informe o motivo')
  partner.roleStatus[role] = 'Inativo'
  mirror(partner)
  audit(partner, actor, `Papel ${role} inativado. ${reason.trim()}`, 'Ativo', 'Inativo')
  log(state, 'Cadastros', actor, `${partner.name}: ${role} inativado. Novas solicitações deste papel ficam bloqueadas.`, undefined, partner.id)
  return partner
}

export function assertClientOpen(state: ErpState, partnerId: string) {
  const partner = findPartner(state, partnerId)
  if (!partner.roles.includes('Cliente')) throw new DomainError('Este parceiro não é cliente')
  if (roleStatus(partner, 'Cliente') === 'Inativo') throw new DomainError('Cliente inativo: novas solicitações não são aceitas. O que já está em andamento segue até o fim.')
  if (roleStatus(partner, 'Cliente') !== 'Ativo') throw new DomainError('Cliente ainda em cadastro: o papel precisa estar ativo para uma solicitação nova.')
}

export function assertSupplierOpen(state: ErpState, partnerId: string) {
  const partner = findPartner(state, partnerId)
  if (!partner.roles.includes('Fornecedor')) throw new DomainError('Este parceiro não é fornecedor')
  if (roleStatus(partner, 'Fornecedor') === 'Inativo') throw new DomainError('Fornecedor inativo: novas compras e contratações não são aceitas. O que já está em andamento segue até o fim.')
  if (roleStatus(partner, 'Fornecedor') !== 'Ativo') throw new DomainError('Fornecedor ainda em cadastro: o papel precisa estar ativo para uma solicitação nova.')
}

/** Compra de matéria-prima C1 só com fornecedor homologado para aquele item. C2 e C3 não exigem registro. */
export function assertPurchaseAllowed(state: ErpState, supplierId: string, itemId: string) {
  assertSupplierOpen(state, supplierId)
  const item = getItem(state, itemId)
  if (item.type !== 'MP' || item.criticality !== 'C1') return
  const homologated = state.supplierHomologations.some(entry => entry.partnerId === supplierId && entry.itemId === itemId && entry.status === 'Homologado')
  if (!homologated) {
    const partner = findPartner(state, supplierId)
    throw new DomainError(`${partner.name} não está homologado para ${item.code} (${item.name}), matéria-prima C1. A compra fica bloqueada.`)
  }
}

export function setItemCriticality(state: ErpState, itemId: string, value: '' | 'C1' | 'C2' | 'C3', actor: string) {
  const item = getItem(state, itemId)
  if (item.type !== 'MP') throw new DomainError('C1, C2 e C3 valem só para matéria-prima')
  const before = item.criticality ?? 'sem classe'
  item.criticality = value || undefined
  log(state, 'Produtos', actor, `${item.code}: criticidade ${before} → ${value || 'sem classe'}. Os critérios objetivos ainda não foram definidos.`, undefined, item.id)
  return item
}

export function clientSalesBase(state: ErpState, partnerId: string) {
  const orders = state.salesOrders.filter(order => order.customerId === partnerId).slice().sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  const total = orders.reduce((sum, order) => sum + order.value, 0)
  return {
    orders,
    count: orders.length,
    total,
    from: orders[0]?.receivedAt.slice(0, 10),
    to: orders.at(-1)?.receivedAt.slice(0, 10),
  }
}

export function supplierReceiptBase(state: ErpState, partnerId: string) {
  const orders = state.purchaseOrders.filter(order => order.supplierId === partnerId)
  const received = orders.filter(order => order.received > 0)
  const open = orders.filter(order => order.status !== 'Recebido' && order.status !== 'Cancelado')
  return {
    received,
    open,
    volume: received.reduce((sum, order) => sum + order.received, 0),
    from: received.map(order => order.createdAt).sort()[0]?.slice(0, 10),
    to: received.map(order => order.createdAt).sort().at(-1)?.slice(0, 10),
  }
}

export function homologationsOf(state: ErpState, partnerId: string) {
  return state.supplierHomologations.filter(entry => entry.partnerId === partnerId)
}

/** Atualização anual do faturamento. Sem os limites A/B/C, nenhuma classe é sugerida. */
export function registerAnnualBilling(state: ErpState, partnerId: string, year: string, actor: string) {
  const partner = findPartner(state, partnerId)
  if (!partner.roles.includes('Cliente')) throw new DomainError('A classificação ABC é do papel Cliente')
  if (partner.abcSuggestions.some(entry => entry.year === year && entry.status === 'Pendente')) throw new DomainError(`O faturamento de ${year} já está aguardando decisão`)
  const billing = clientSalesBase(state, partnerId).orders.filter(order => order.receivedAt.startsWith(year)).reduce((sum, order) => sum + order.value, 0)
  const suggestion: AbcSuggestion = {
    id: nextId(state, 'ABC'),
    year,
    billing,
    status: 'Pendente',
    createdAt: now(),
    note: 'Limites A, B e C ainda não definidos. Nenhuma classe foi sugerida e a classe vigente não muda.',
  }
  partner.abcSuggestions.unshift(suggestion)
  audit(partner, actor, `Faturamento de ${year} registrado para reclassificação`, undefined, String(billing))
  log(state, 'Cadastros', actor, `${partner.name}: alerta de reclassificação ABC de ${year}. Sem limites, nenhuma classe foi sugerida.`, undefined, partner.id)
  return suggestion
}

export function decideAbcSuggestion(state: ErpState, partnerId: string, suggestionId: string, approve: boolean, role: Role, actor: string) {
  if (role !== 'Comercial' && role !== 'Administrador') throw new DomainError('A reclassificação ABC é do Coordenador Comercial')
  const partner = findPartner(state, partnerId)
  const suggestion = partner.abcSuggestions.find(entry => entry.id === suggestionId)
  if (!suggestion || suggestion.status !== 'Pendente') throw new DomainError('Sugestão não encontrada ou já decidida')
  if (approve && !suggestion.suggestedClass) throw new DomainError('Não há classe sugerida. Os limites A, B e C ainda não foram definidos, então a classe vigente permanece.')
  suggestion.status = approve ? 'Aprovada' : 'Recusada'
  suggestion.decidedBy = actor
  suggestion.decidedAt = now()
  if (approve && suggestion.suggestedClass) {
    const before = partner.abcClass ?? 'sem classe'
    partner.abcClass = suggestion.suggestedClass
    partner.abcDecidedBy = actor
    partner.abcDecidedAt = suggestion.decidedAt
    audit(partner, actor, `Classe ABC aprovada para ${suggestion.suggestedClass}`, before, suggestion.suggestedClass)
  } else {
    audit(partner, actor, `Sugestão ABC de ${suggestion.year} recusada. A classe vigente permanece.`)
  }
  return partner
}

export function findPartner(state: ErpState, id: string) {
  const partner = state.partners.find(entry => entry.id === id)
  if (!partner) throw new DomainError('Parceiro não encontrado')
  return partner
}

export const ADDRESS_PURPOSES: AddressPurpose[] = ['Sede', 'Cobrança', 'Entrega', 'Correspondência', 'Pedido', 'Recebimento', 'Faturamento']
