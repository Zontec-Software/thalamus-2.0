import type { ErpState } from './engine'
import { DomainError, log, nextId, now, today } from './engine'
import type { DirectoryAccount, WorkspaceConnection } from '../types/domain'

const find = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const entry = list.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError(`${label} não encontrado(a)`)
  return entry
}

function connectionOf(state: ErpState, tenantId: string): WorkspaceConnection {
  const connection = state.workspaceConnections.find(entry => entry.tenantId === tenantId && entry.provider === 'Google')
  if (!connection) throw new DomainError('Esta empresa não tem domínio Google configurado')
  return connection
}

function slug(name: string) {
  const parts = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
  if (!parts.length) return 'pessoa'
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`
}

function taken(state: ErpState, email: string) {
  const value = email.toLowerCase()
  return state.directoryAccounts.some(entry => entry.email.toLowerCase() === value) || state.users.some(entry => entry.email?.toLowerCase() === value)
}

/** Resultado simulado do Admin SDK. O e-mail `recusar@` falha de propósito. Nenhuma senha sai daqui. */
export function googleResult(action: 'Criar' | 'Suspender', email: string): { ok: true; externalId: string } | { ok: false; failure: string } {
  if (email.split('@')[0] === 'recusar') return { ok: false, failure: `O Google recusou ${action.toLowerCase()} ${email}. Nenhuma senha foi gerada.` }
  return { ok: true, externalId: `gws-${email.toLowerCase()}` }
}

export function suggestDirectoryEmail(state: ErpState, tenantId: string, name: string) {
  const domain = connectionOf(state, tenantId).domain
  const base = slug(name)
  let local = base
  let index = 2
  while (taken(state, `${local}@${domain}`)) local = `${base}${index++}`
  return `${local}@${domain}`
}

function assertEmail(state: ErpState, tenantId: string, personId: string, email: string) {
  const person = find(state.persons, personId, 'Pessoa')
  if (person.tenantId !== tenantId) throw new DomainError('A conta Google nasce no domínio da empresa da pessoa')
  const domain = connectionOf(state, tenantId).domain
  const normalized = email.trim().toLowerCase()
  if (!normalized.endsWith(`@${domain}`)) throw new DomainError(`O e-mail precisa ser do domínio ${domain}`)
  if (state.directoryAccounts.some(entry => entry.email.toLowerCase() === normalized && entry.personId !== personId)) throw new DomainError('Este e-mail já tem conta Google')
  return { person, normalized }
}

export function provisionDirectoryAccount(state: ErpState, tenantId: string, personId: string, email: string, actor: string) {
  const { person, normalized } = assertEmail(state, tenantId, personId, email)
  const existing = state.directoryAccounts.find(entry => entry.personId === personId && entry.tenantId === tenantId && entry.provider === 'Google')
  if (existing && existing.status !== 'Falha') throw new DomainError('Esta pessoa já tem conta Google nesta empresa')
  const result = googleResult('Criar', normalized)
  const account: DirectoryAccount = existing ?? {
    id: nextId(state, 'GDA'), tenantId, personId, provider: 'Google', email: normalized,
    status: 'Falha', requestedBy: actor, requestedAt: now(),
  }
  account.email = normalized
  account.requestedBy = actor
  account.requestedAt = now()
  if (result.ok) {
    account.status = 'Ativa'
    account.externalId = result.externalId
    account.pendingAction = undefined
    account.failure = undefined
    person.corporateEmail = normalized
    const user = state.users.find(entry => entry.personId === personId && entry.homeTenantId === tenantId)
    if (user && !user.email) user.email = normalized
    log(state, 'Pessoas', actor, `Conta Google ${normalized} criada. A senha não fica no Thalamus.`, undefined, personId)
  } else {
    account.status = 'Falha'
    account.pendingAction = 'Criar'
    account.failure = result.failure
    log(state, 'Pessoas', actor, result.failure, undefined, personId)
  }
  if (!existing) state.directoryAccounts.unshift(account)
  return account
}

export function suspendDirectoryAccount(state: ErpState, accountId: string, actor: string) {
  const account = find(state.directoryAccounts, accountId, 'Conta Google')
  if (account.status === 'Suspensa') throw new DomainError('A conta Google já está suspensa')
  if (!account.externalId) throw new DomainError('A conta Google ainda não existe para ser suspensa')
  const result = googleResult('Suspender', account.email)
  if (result.ok) {
    account.status = 'Suspensa'
    account.pendingAction = undefined
    account.failure = undefined
    account.suspendedAt = now()
    const user = state.users.find(entry => entry.personId === account.personId && entry.homeTenantId === account.tenantId)
    if (user) user.active = false
    log(state, 'Pessoas', actor, `Conta Google ${account.email} suspensa`, undefined, account.personId)
  } else {
    account.status = 'Falha'
    account.pendingAction = 'Suspender'
    account.failure = result.failure
    log(state, 'Pessoas', actor, result.failure, undefined, account.personId)
  }
  return account
}

export function retryDirectoryAccount(state: ErpState, accountId: string, actor: string) {
  const account = find(state.directoryAccounts, accountId, 'Conta Google')
  if (account.status !== 'Falha') throw new DomainError('Não há falha para tentar de novo')
  if (account.pendingAction === 'Suspender') return suspendDirectoryAccount(state, account.id, actor)
  return provisionDirectoryAccount(state, account.tenantId, account.personId, account.email, actor)
}

/** Na data efetiva, suspende a conta que ainda está ativa. Falha anterior não é refeita sozinha. */
export function applyDueSuspensions(state: ErpState, day = today(), actor = 'Sistema') {
  const suspended: DirectoryAccount[] = []
  for (const process of state.offboardings.filter(entry => entry.effectiveOn <= day)) {
    const user = state.users.find(entry => entry.id === process.userId)
    const account = state.directoryAccounts.find(entry => entry.personId === user?.personId && entry.tenantId === process.tenantId && entry.provider === 'Google' && entry.status === 'Ativa')
    if (account) suspended.push(suspendDirectoryAccount(state, account.id, actor))
  }
  return suspended
}

export function directoryFailures(state: ErpState, tenantId: string) {
  return state.directoryAccounts.filter(entry => entry.tenantId === tenantId && entry.status === 'Falha')
}
