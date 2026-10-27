import { describe, expect, it } from 'vitest'
import { applyDueSuspensions, googleResult, provisionDirectoryAccount, retryDirectoryAccount, suggestDirectoryEmail } from '../domain/directory'
import { createUser } from '../domain/enterprise'
import { ensurePerson, grantCompanyAccess } from '../domain/organization'
import { startOffboarding } from '../domain/people'
import { createSeedState } from '../mocks/seed'
import { MockGoogleGateway } from '../services/google/mockGoogleGateway'

const TENANT = 'tenant-roboflex'

function admit(name: string) {
  const state = createSeedState()
  const user = createUser(state, { name, role: 'Operador', sector: 'Operações', shift: 'Manhã' }, 'Marina')
  const person = ensurePerson(state, user, TENANT, 'Marina')!
  return { state, user, person }
}

describe('conta Google', () => {
  it('sugere um e-mail livre no domínio da empresa e cria a conta sem senha', () => {
    const { state, user, person } = admit('Nova Pessoa Teste')
    expect(suggestDirectoryEmail(state, TENANT, 'Nova Pessoa Teste')).toBe('nova.teste@roboflex.com.br')
    const account = provisionDirectoryAccount(state, TENANT, person.id, 'nova.teste@roboflex.com.br', 'Marina')
    expect(account.status).toBe('Ativa')
    expect(account.externalId).toBe('gws-nova.teste@roboflex.com.br')
    expect(account).not.toHaveProperty('password')
    expect(account).not.toHaveProperty('pin')
    expect(JSON.stringify(account)).not.toMatch(/senha|password|secret/i)
    expect(person.corporateEmail).toBe('nova.teste@roboflex.com.br')
    expect(user.email).toBe('nova.teste@roboflex.com.br')
    expect(() => provisionDirectoryAccount(state, TENANT, person.id, 'outra@gmail.com', 'Marina')).toThrow(/domínio/)
  })

  it('guarda a falha de criação e não grava e-mail corporativo', () => {
    const { state, person } = admit('Conta Recusada')
    const before = person.corporateEmail
    const account = provisionDirectoryAccount(state, TENANT, person.id, 'recusar@roboflex.com.br', 'Marina')
    expect(account.status).toBe('Falha')
    expect(account.pendingAction).toBe('Criar')
    expect(account.externalId).toBeUndefined()
    expect(person.corporateEmail).toBe(before)
    expect(googleResult('Criar', 'recusar@roboflex.com.br').ok).toBe(false)
  })

  it('suspende na data efetiva e não refaz sozinho uma falha já registrada', () => {
    const state = createSeedState()
    const sergio = state.directoryAccounts.find(entry => entry.personId === 'p-u17')!
    expect(sergio.status).toBe('Falha')
    applyDueSuspensions(state, '2026-10-27')
    expect(state.directoryAccounts.find(entry => entry.id === sergio.id)!.status).toBe('Falha')
    expect(state.users.find(entry => entry.id === 'u17')!.active).not.toBe(false)

    const retried = retryDirectoryAccount(state, sergio.id, 'Marina')
    expect(retried.status).toBe('Suspensa')
    expect(state.users.find(entry => entry.id === 'u17')!.active).toBe(false)

    const { state: fresh, user, person } = admit('Suspensa No Prazo')
    provisionDirectoryAccount(fresh, TENANT, person.id, 'suspensa.prazo@roboflex.com.br', 'Marina')
    startOffboarding(fresh, TENANT, user.id, { effectiveOn: '2026-10-01', reason: 'Saída' }, 'Marina')
    const [done] = applyDueSuspensions(fresh, '2026-10-27')
    expect(done.status).toBe('Suspensa')
    expect(user.active).toBe(false)
  })

  it('não cria conta Google ao conceder acesso em outra empresa', () => {
    const state = createSeedState()
    const before = state.directoryAccounts.length
    const profile = state.accessProfiles.find(entry => entry.tenantId === TENANT && entry.system)!
    grantCompanyAccess(state, 'u18', TENANT, profile.id, 'Marina')
    expect(state.directoryAccounts).toHaveLength(before)
    expect(state.directoryAccounts.some(entry => entry.personId === 'p-u18' && entry.tenantId === TENANT)).toBe(false)
  })

  it('o adaptador simulado recusa sem devolver senha', async () => {
    const gateway = new MockGoogleGateway()
    await expect(gateway.createUser({ email: 'recusar@roboflex.com.br', name: 'Recusa' })).rejects.toThrow(/senha foi gerada/i)
    await expect(gateway.createUser({ email: 'nova.pessoa@roboflex.com.br', name: 'Nova' })).resolves.toEqual({ externalId: 'gws-nova.pessoa@roboflex.com.br' })
  })
})
