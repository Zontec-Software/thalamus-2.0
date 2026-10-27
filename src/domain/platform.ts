import { FUNCTIONALITIES, profileCode } from './access'
import { DomainError, type ErpState } from './engine'
import { ensurePerson } from './organization'
import type { EconomicGroup, Tenant } from '../types/domain'

export interface NewCompanyInput {
  legalName: string
  tradeName: string
  document: string
  city: string
  adminName: string
  adminEmail: string
}

/** Empresa nova de um sistema sem cenário de demonstração: só o Administrador, com o catálogo inteiro. */
export function provisionCompany(state: ErpState, input: NewCompanyInput) {
  const legalName = input.legalName.trim()
  const tradeName = input.tradeName.trim() || legalName
  const document = input.document.trim()
  const adminName = input.adminName.trim()
  const adminEmail = input.adminEmail.trim()
  if (!legalName || !document || !adminName || !adminEmail) throw new DomainError('Informe a empresa, o documento e o primeiro administrador')
  if (state.tenants.some(entry => entry.document === document)) throw new DomainError('Já existe uma empresa com este documento')
  const tenantId = `tenant-${state.tenants.length + 1}`
  const tenant: Tenant = { id: tenantId, legalName, tradeName, document, city: input.city.trim() || 'Não informada', status: 'Ativa' }
  state.tenants.push(tenant)
  state.omieConnections.push({ tenantId, appKey: '', secretDefined: false, status: 'Não configurada', accountLabel: '' })
  const profileId = `profile-${tenantId}-administrador`
  state.accessProfiles.push({
    id: profileId,
    tenantId,
    code: profileCode('Administrador'),
    name: 'Administrador',
    description: 'Perfil do sistema desta empresa, com todas as funcionalidades.',
    system: true,
    functionalityIds: FUNCTIONALITIES.map(entry => entry.id),
    simulatedRole: 'Administrador',
  })
  const userId = `u-${tenantId}-admin`
  const admin = {
    id: userId,
    name: adminName,
    role: 'Administrador' as const,
    sector: 'Administração',
    shift: 'Administrativo' as const,
    pin: '0000',
    email: adminEmail,
    active: true,
  }
  state.users.push(admin)
  ensurePerson(state, admin, tenantId, adminName)
  state.userProfileAssignments.push({ id: `UP-${tenantId}-admin`, userId, tenantId, profileId })
  return { tenantId, userId, profileId }
}

export function saveEconomicGroup(state: ErpState, input: Pick<EconomicGroup, 'id' | 'name' | 'description'> & { tenantIds: string[] }) {
  const name = input.name.trim()
  if (!name) throw new DomainError('Informe o nome do grupo econômico')
  const tenantIds = [...new Set(input.tenantIds)]
  let group = input.id ? state.economicGroups.find(entry => entry.id === input.id) : undefined
  if (input.id && !group) throw new DomainError('Grupo econômico não encontrado')
  if (!group) {
    group = { id: `group-${state.economicGroups.length + 1}`, name, description: input.description.trim() }
    state.economicGroups.push(group)
  } else {
    group.name = name
    group.description = input.description.trim()
  }
  for (const tenant of state.tenants) {
    if (tenantIds.includes(tenant.id)) tenant.groupId = group.id
    else if (tenant.groupId === group.id) tenant.groupId = undefined
  }
  return group.id
}

export function saveOmieConnection(state: ErpState, tenantId: string, appKey: string, accountLabel: string, secretProvided: boolean) {
  const connection = state.omieConnections.find(entry => entry.tenantId === tenantId)
  if (!connection) throw new DomainError('Empresa não encontrada')
  connection.appKey = appKey.trim()
  connection.accountLabel = accountLabel.trim()
  if (secretProvided) connection.secretDefined = true
  connection.status = connection.appKey && connection.secretDefined ? 'Simulada' : 'Não configurada'
}
