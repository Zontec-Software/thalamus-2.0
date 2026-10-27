import { describe, expect, it } from 'vitest'
import { today } from '../domain/engine'
import { createUser } from '../domain/enterprise'
import {
  addProjectParticipation, canSeePersonBlock, directManager, directoryCard, grantCompanyAccess, openLinkedEmployment, personView, placeSector, resetPin, setPersonPhoto, suggestIdentity,
} from '../domain/organization'
import {
  BRIEFING_VERSION, changeAssignment, closeOffboarding, createJobOpening, hireCandidate, prepareBriefing, recordReview, registerCandidate, revokeAccess, reviewsShareScale, setApplicationStage, setChecklistItem, startOffboarding,
} from '../domain/people'
import { createSeedState } from '../mocks/seed'

const TENANT = 'tenant-roboflex'

describe('pessoas', () => {
  it('efetiva o candidato no cadastro único e guarda a candidatura', () => {
    const state = createSeedState()
    const job = createJobOpening(state, TENANT, { title: 'Técnico', description: 'Apoio', requirements: ['solda'], openedOn: '2026-10-01' }, 'Marina')
    expect(state.jobOpenings.find(entry => entry.id === job.id)?.status).toBe('Aberta')
    expect(state.peopleChecklists.some(entry => entry.process === 'admissao' && entry.refId === job.id)).toBe(true)
    expect(() => registerCandidate(state, TENANT, { jobId: job.id, name: 'Helena Dias', email: 'helena.dias@email.com', resumeText: 'solda' }, 'Marina')).toThrow(/duplicata/i)
    const kept = registerCandidate(state, TENANT, { jobId: job.id, name: 'Helena Dias', email: 'helena.outra@email.com', phone: '31977776666', resumeText: 'experiência com solda', force: true }, 'Marina')
    expect(kept.candidate.id).not.toBe('CD-HELENA')
    expect(kept.application.history[0].text).toMatch(/decisão humana/)
    setApplicationStage(state, kept.application.id, 'Selecionado', 'Marina')
    expect(() => hireCandidate(state, kept.application.id, { role: 'Operador', sector: 'Operações', shift: 'Manhã' }, 'Marina', input => createUser(state, input, 'Marina'))).toThrow(/checklist/i)
    const checklist = state.peopleChecklists.find(entry => entry.process === 'efetivacao' && entry.refId === kept.application.id)!
    for (const item of checklist.items) setChecklistItem(state, checklist.id, item.id, { status: 'Concluído' }, 'Marina')
    const before = state.users.length
    const person = hireCandidate(state, kept.application.id, { role: 'Operador', sector: 'Operações', shift: 'Manhã' }, 'Marina', input => createUser(state, input, 'Marina'))
    expect(state.users.filter(entry => entry.email === 'helena.outra@email.com')).toHaveLength(1)
    expect(state.users.length).toBe(before + 1)
    expect(person.id).not.toBe(kept.candidate.id)
    expect(person.personId).toBeTruthy()
    expect(kept.candidate.personId).toBe(person.personId)
    expect(kept.application.stage).toBe('Efetivado')
  })

  it('une e-mail já cadastrado e não cria outra pessoa', () => {
    const state = createSeedState()
    const registered = registerCandidate(state, TENANT, { jobId: 'VAGA-COM', name: 'Camila Nunes', email: 'camila@roboflex.com.br', resumeText: 'cotação' }, 'Marina')
    setApplicationStage(state, registered.application.id, 'Selecionado', 'Marina')
    const checklist = state.peopleChecklists.find(entry => entry.process === 'efetivacao' && entry.refId === registered.application.id)!
    for (const item of checklist.items) setChecklistItem(state, checklist.id, item.id, { status: 'Concluído' }, 'Marina')
    const before = state.users.length
    expect(() => hireCandidate(state, registered.application.id, { role: 'Comercial', sector: 'Comercial', shift: 'Administrativo' }, 'Marina', input => createUser(state, input, 'Marina'))).toThrow(/Una os cadastros/)
    const person = hireCandidate(state, registered.application.id, { role: 'Comercial', sector: 'Comercial', shift: 'Administrativo', linkUserId: 'u12' }, 'Marina', input => createUser(state, input, 'Marina'))
    expect(person.id).toBe('u12')
    expect(registered.candidate.personId).toBe(person.personId)
    expect(state.users.length).toBe(before)
    expect(registered.application.stage).toBe('Efetivado')
  })

  it('prepara a leitura sem decidir pela pessoa', () => {
    const state = createSeedState()
    const before = state.applications.find(entry => entry.id === 'CA-HELENA')!.stage
    const briefing = prepareBriefing(state, 'CA-HELENA', 'Marina')
    expect(briefing.version).toBe(BRIEFING_VERSION)
    expect(briefing.criteria).toContain('Disponibilidade de turno')
    expect(briefing.gaps).toContain('Disponibilidade de turno')
    expect(briefing.suggested).toBe(false)
    expect(state.applications.find(entry => entry.id === 'CA-HELENA')!.stage).toBe(before)
  })

  it('guarda a vigência anterior e não compara escalas diferentes', () => {
    const state = createSeedState()
    const role = state.users.find(entry => entry.id === 'u6')!.role
    changeAssignment(state, TENANT, 'u6', { sector: 'Qualidade', positionId: 'pos-op', validFrom: '2099-01-01' }, 'Marina')
    expect(state.assignments.find(entry => entry.id === 'ASG-JOAO-2')!.validTo).toBe('2098-12-31')
    expect(state.assignments.some(entry => entry.userId === 'u6' && entry.sector === 'Montagem')).toBe(true)
    expect(state.users.find(entry => entry.id === 'u6')!.role).toBe(role)
    if ('2099-01-01' <= today()) expect(state.users.find(entry => entry.id === 'u6')!.sector).toBe('Qualidade')
    else expect(state.users.find(entry => entry.id === 'u6')!.sector).toBe('Injeção')
    const tasks = state.peopleChecklists.find(entry => entry.process === 'movimentacao')
    expect(tasks?.items.map(item => item.label)).toEqual(['Revisão de acesso', 'Revisão de equipamento', 'Revisão de treinamento'])
    expect(reviewsShareScale(state.performanceReviews.filter(entry => entry.userId === 'u6'))).toBe(false)
    recordReview(state, 'u6', { scoreLabel: '3', scale: '0 a 5', period: '2026', origin: 'Gestor direto' }, 'Marina')
    expect(state.performanceReviews.filter(entry => entry.userId === 'u6' && entry.scale === 'A a E')).toHaveLength(1)
  })

  it('revoga acesso sem guardar credencial e só encerra o checklist completo', () => {
    const state = createSeedState()
    expect(() => startOffboarding(state, TENANT, 'u17', { effectiveOn: '2026-11-01', reason: 'Repetido' }, 'Marina')).toThrow(/em andamento/)
    expect(() => closeOffboarding(state, 'DES-1', 'Marina')).toThrow(/pendente/)
    expect(() => revokeAccess(state, 'DES-1', { systems: ['Thalamus'], result: 'Concluído', senha: '1234' } as { systems: string[]; result: 'Concluído'; senha: string }, 'Marina')).toThrow(/Credenciais/)
    const failed = revokeAccess(state, 'DES-1', { systems: ['Thalamus'], result: 'Falha', failure: 'Diretório indisponível' }, 'Marina')
    expect(failed.result).toBe('Falha')
    expect(state.users.find(entry => entry.id === 'u17')!.active).not.toBe(false)
    const done = revokeAccess(state, 'DES-1', { systems: ['Thalamus'], result: 'Concluído', vaultReference: 'cofre-demo-1' }, 'Marina')
    expect(Object.keys(done).some(key => /senha|password|pin|secret/i.test(key))).toBe(false)
    expect(done.vaultReference).toBe('cofre-demo-1')
    expect(state.users.find(entry => entry.id === 'u17')!.active).toBe(false)
    expect(state.users.find(entry => entry.id === 'u17')!.pin).toBe('1717')
    const checklist = state.peopleChecklists.find(entry => entry.id === 'CHK-DES-1')!
    expect(checklist.items.find(item => item.kind === 'acesso')!.status).toBe('Concluído')
    expect(() => setChecklistItem(state, checklist.id, checklist.items.find(item => item.kind === 'acesso')!.id, { status: 'Concluído' }, 'Marina')).toThrow(/sem senha/)
    for (const item of checklist.items.filter(item => item.required && item.kind !== 'confirmacao' && item.status !== 'Concluído')) {
      setChecklistItem(state, checklist.id, item.id, { status: 'Concluído', evidence: item.kind === 'ativo' ? 'Devolvido' : undefined }, 'Marina')
    }
    const confirmation = checklist.items.find(item => item.kind === 'confirmacao')!
    setChecklistItem(state, checklist.id, confirmation.id, { status: 'Concluído' }, 'Marina')
    closeOffboarding(state, 'DES-1', 'Marina')
    expect(state.offboardings.find(entry => entry.id === 'DES-1')!.status).toBe('Concluído')
    expect(state.assignments.some(entry => entry.userId === 'u17')).toBe(true)
    expect(state.employments.find(entry => entry.personId === 'p-u17' && entry.tenantId === TENANT)!.status).toBe('Encerrado')
  })

  it('separa empresa, acesso e dado sensível nos três cenários do grupo', () => {
    const state = createSeedState()
    const sul = 'tenant-roboflex-sul'
    const participation = state.projectParticipations.find(entry => entry.id === 'PRT-HELENA')!
    expect(participation.displayName).toBe('Helena Duarte')
    expect(participation.sourceTenantId).toBe(sul)
    expect(state.persons.some(entry => entry.tenantId === TENANT && entry.fullName === 'Helena Duarte')).toBe(false)
    expect(JSON.stringify(participation)).not.toMatch(/cpf|salary|banks|address/i)
    const diego = state.identityLinks.find(entry => entry.id === 'IDN-DIEGO')!
    expect(diego.status).toBe('Confirmado')
    expect(state.persons.find(entry => entry.id === 'p-u11')!.cpf).toBe('111.222.333-44')
    expect(state.persons.find(entry => entry.id === 'p-z-diego')!.tenantId).toBe(sul)
    const suggestion = suggestIdentity(state, 'p-u12', 'Marina')
    expect(suggestion?.status).toBe('Sugerido')
    expect(state.persons.filter(entry => entry.fullName === 'Camila Nunes').length).toBeGreaterThan(1)
    const beforePersons = state.persons.length
    const beforePositions = state.positions.length
    grantCompanyAccess(state, 'u14', sul, 'profile-zontec-admin', 'Marina')
    expect(state.persons.length).toBe(beforePersons)
    expect(state.positions.length).toBe(beforePositions)
    expect(state.employments.some(entry => entry.tenantId === sul && entry.personId === 'p-u14')).toBe(false)
    const opened = openLinkedEmployment(state, 'p-u6', sul, { sector: 'Engenharia Zontec', contractType: 'CLT', startedOn: '2026-10-27', profileId: 'profile-zontec-eng', shift: 'Manhã' }, 'Marina')
    expect(opened.link.status).toBe('Confirmado')
    expect(opened.user.role).toBe('Engenharia')
    expect(state.userProfileAssignments.some(entry => entry.userId === opened.user.id && entry.profileId === 'profile-zontec-eng')).toBe(true)
    expect(opened.person.cpf).toBeUndefined()
    expect(opened.person.banks).toEqual([])
    expect(() => openLinkedEmployment(state, 'p-u11', sul, { sector: 'Engenharia Zontec', positionId: 'pos-z-eng', contractType: 'CLT', startedOn: '2026-10-27', profileId: 'profile-zontec-eng', shift: 'Manhã' }, 'Marina')).toThrow(/vagas/i)
    const profiles = state.userProfileAssignments.length
    changeAssignment(state, TENANT, 'u6', { sector: 'Qualidade', positionId: 'pos-op', validFrom: '2099-01-01' }, 'Marina')
    expect(state.userProfileAssignments.length).toBe(profiles)
    const card = directoryCard(state, state.persons.find(entry => entry.id === 'p-u11')!)
    expect(JSON.stringify(card)).not.toContain('111.222')
    const joao = state.persons.find(entry => entry.id === 'p-u6')!
    expect(canSeePersonBlock(personView('Operador', 'u16', joao, 'u6'), 'banco')).toBe(false)
    expect(canSeePersonBlock(personView('Gestor', 'u1', joao, 'u6'), 'banco')).toBe(true)
    expect(canSeePersonBlock(personView('Operador', 'u6', joao, 'u6'), 'banco')).toBe(true)
    const pin = state.users.find(entry => entry.id === 'u6')!.pin
    const reset = resetPin(state, 'u6', 'Marina')
    expect(reset).toEqual({ userId: 'u6', reset: true })
    expect(state.users.find(entry => entry.id === 'u6')!.pin).not.toBe(pin)
    expect(state.projectParticipations.some(entry => entry.personId === 'p-u18' && entry.projectId === 'PRJ-26-014')).toBe(true)
    expect(() => addProjectParticipation(state, TENANT, 'PRJ-26-014', 'p-u18', 'De novo', 'Marina')).toThrow(/já participa/i)
  })

  it('guarda a foto na pessoa e não copia para o outro vínculo', () => {
    const state = createSeedState()
    const photo = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'
    setPersonPhoto(state, 'p-u6', photo, 'Marina')
    expect(state.persons.find(entry => entry.id === 'p-u6')!.photo).toBe(photo)
    expect(directoryCard(state, state.persons.find(entry => entry.id === 'p-u6')!).photo).toBe(photo)
    expect(() => setPersonPhoto(state, 'p-u6', 'https://exemplo.test/foto.jpg', 'Marina')).toThrow(/imagem/)
    expect(() => setPersonPhoto(state, 'p-u6', `data:image/png;base64,${'A'.repeat(700_000)}`, 'Marina')).toThrow(/KB/)
    const opened = openLinkedEmployment(state, 'p-u6', 'tenant-roboflex-sul', { sector: 'Engenharia Zontec', contractType: 'CLT', startedOn: '2026-10-27', profileId: 'profile-zontec-eng', shift: 'Manhã' }, 'Marina')
    expect(opened.person.photo).toBeUndefined()
    setPersonPhoto(state, 'p-u6', undefined, 'Marina')
    expect(state.persons.find(entry => entry.id === 'p-u6')!.photo).toBeUndefined()
  })

  it('não deixa um setor ficar abaixo de si nem de um descendente', () => {
    const state = createSeedState()
    expect(() => placeSector(state, 'sec-dir', 'sec-dir', 'Marina')).toThrow(/abaixo de si/)
    expect(() => placeSector(state, 'sec-dir', 'sec-com', 'Marina')).toThrow(/abaixo dele/)
    placeSector(state, 'sec-fin', 'sec-com', 'Marina')
    expect(state.sectors.find(entry => entry.id === 'sec-fin')!.parentId).toBe('sec-com')
  })

  it('acha o gestor direto pela posição superior e, sem ela, pelo líder do setor', () => {
    const state = createSeedState()
    const leader = state.users.find(entry => entry.positionId === 'pos-lider')!
    const operator = state.users.find(entry => entry.positionId === 'pos-op')!
    expect(directManager(state, operator)?.id).toBe(leader.id)
    const sales = state.sectors.find(entry => entry.id === 'sec-com')!
    const loose = { ...state.users.find(entry => entry.id === sales.managerId)!, id: 'u-temp', positionId: undefined }
    expect(directManager(state, loose)?.id).toBe(sales.managerId)
    expect(directManager(state, state.users.find(entry => entry.id === sales.managerId)!)?.id).toBe('u16')
    expect(directManager(state, state.users.find(entry => entry.id === 'u16')!)).toBeUndefined()
  })
})
