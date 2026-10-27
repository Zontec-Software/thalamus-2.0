import type { ErpState } from './engine'
import { DomainError, log, nextId, now, today } from './engine'
import { sectorOf } from './enterprise'
import type { Employment, IdentityLink, JobCatalog, JobPosition, Person, ProjectParticipation, Role, Sector, User } from '../types/domain'

/** Campos que não saem da empresa, nem no projeto nem no diretório. */
export const SENSITIVE_PERSON_KEYS = ['cpf', 'rg', 'cnh', 'birthDate', 'race', 'pcd', 'drugAllergy', 'foodAllergy', 'controlledMedicine', 'address', 'banks', 'family', 'salary'] as const

export const ACCOUNT_ROLES: Role[] = ['Administrador', 'Gestor', 'Comercial', 'Engenharia', 'PCP', 'Compras', 'Almoxarifado', 'Líder de produção', 'Operador', 'Qualidade', 'Expedição', 'Manutenção', 'Assistência', 'Financeiro']

export type PersonView = 'completa' | 'financeira' | 'profissional'
export type PersonBlock = 'documentos' | 'saude' | 'endereco' | 'familia' | 'salario' | 'banco' | 'profissional'

const find = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const entry = list.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError(`${label} não encontrado(a)`)
  return entry
}

export function blankPerson(id: string, tenantId: string, fullName: string, corporateEmail?: string): Person {
  return {
    id, tenantId, fullName, corporateEmail,
    education: [], family: [], emergencies: [], banks: [],
  }
}

/** Toda conta comum nasce ligada a uma pessoa da empresa. O mestre da plataforma fica de fora. */
export function ensurePerson(state: ErpState, user: User, tenantId: string, actor: string) {
  if (user.platformMaster) return undefined
  if (user.personId) return find(state.persons, user.personId, 'Pessoa')
  const person = blankPerson(nextId(state, 'PES'), tenantId, user.name, user.email)
  state.persons.push(person)
  user.personId = person.id
  user.homeTenantId = tenantId
  const employment: Employment = {
    id: nextId(state, 'EMP'), tenantId, personId: person.id, contractType: 'CLT', startedOn: today(), status: 'Ativo',
  }
  state.employments.push(employment)
  log(state, 'Pessoas', actor, `Pessoa ${person.fullName} aberta na empresa`, undefined, person.id)
  return person
}

const PHOTO_LIMIT_BYTES = 450_000

/** A foto é da pessoa nesta empresa. O outro vínculo nasce sem ela. */
export function setPersonPhoto(state: ErpState, personId: string, photo: string | undefined, actor: string) {
  const person = find(state.persons, personId, 'Pessoa')
  if (!photo) {
    person.photo = undefined
    log(state, 'Pessoas', actor, `Foto de ${person.fullName} removida`, undefined, person.id)
    return person
  }
  if (!photo.startsWith('data:image/')) throw new DomainError('A foto precisa ser uma imagem')
  const payload = photo.slice(photo.indexOf(',') + 1)
  const bytes = Math.floor((payload.length * 3) / 4)
  if (bytes > PHOTO_LIMIT_BYTES) throw new DomainError(`Foto de ${Math.round(bytes / 1024)} KB: na demonstração o limite é ${Math.round(PHOTO_LIMIT_BYTES / 1024)} KB`)
  person.photo = photo
  log(state, 'Pessoas', actor, `Foto de ${person.fullName} atualizada`, undefined, person.id)
  return person
}

export function updatePerson(state: ErpState, personId: string, patch: Partial<Omit<Person, 'id' | 'tenantId' | 'education' | 'family' | 'emergencies' | 'banks' | 'photo'>>, actor: string) {
  const person = find(state.persons, personId, 'Pessoa')
  Object.assign(person, patch)
  const account = state.users.find(entry => entry.personId === person.id && entry.homeTenantId === person.tenantId)
  if (account && patch.fullName) account.name = patch.fullName
  if (account && patch.corporateEmail) account.email = patch.corporateEmail
  log(state, 'Pessoas', actor, `Ficha de ${person.fullName} atualizada`, undefined, person.id)
  return person
}

export function updateEmployment(state: ErpState, employmentId: string, patch: Partial<Pick<Employment, 'contractType' | 'workplace' | 'salary' | 'cbo' | 'startedOn'>>, actor: string) {
  const employment = find(state.employments, employmentId, 'Vínculo')
  if (employment.status !== 'Ativo') throw new DomainError('O vínculo encerrado permanece como histórico')
  Object.assign(employment, patch)
  log(state, 'Pessoas', actor, 'Vínculo atualizado', undefined, employment.personId)
  return employment
}

export function endEmployment(state: ErpState, personId: string, tenantId: string, day: string) {
  const employment = state.employments.find(entry => entry.personId === personId && entry.tenantId === tenantId && entry.status === 'Ativo')
  if (!employment) return undefined
  employment.status = 'Encerrado'
  employment.endedOn = day
  return employment
}

export function createSector(state: ErpState, tenantId: string, input: { name: string; parentId?: string; managerPositionId?: string }, actor: string) {
  if (!input.name.trim()) throw new DomainError('Informe o nome do setor')
  if (state.sectors.some(entry => entry.tenantId === tenantId && entry.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new DomainError('Já existe setor com este nome na empresa')
  if (input.parentId) find(state.sectors, input.parentId, 'Setor superior')
  const sector: Sector = {
    id: nextId(state, 'SEC'), tenantId, name: input.name.trim(), parentId: input.parentId, managerPositionId: input.managerPositionId, costCenters: {},
  }
  state.sectors.push(sector)
  syncSectorManagers(state)
  log(state, 'Pessoas', actor, `Setor ${sector.name} criado`, undefined, sector.id)
  return sector
}

export function createJob(state: ErpState, tenantId: string, input: { name: string; level: string; cbo: string; mission: string; requirements: string[] }, actor: string) {
  if (!input.name.trim() || !input.mission.trim()) throw new DomainError('Informe o nome e a missão do cargo')
  const job: JobCatalog = {
    id: nextId(state, 'CRG'), tenantId, name: input.name.trim(), level: input.level.trim(), cbo: input.cbo.trim(),
    mission: input.mission.trim(), requirements: input.requirements.map(entry => entry.trim()).filter(Boolean), status: 'Ativo',
  }
  state.jobs.push(job)
  log(state, 'Pessoas', actor, `Cargo ${job.name} no catálogo`, undefined, job.id)
  return job
}

export function createPosition(state: ErpState, tenantId: string, input: { sectorId: string; jobId: string; parentPositionId?: string; headcount: number }, actor: string) {
  const sector = find(state.sectors, input.sectorId, 'Setor')
  if (sector.tenantId !== tenantId) throw new DomainError('A posição fica no setor da mesma empresa')
  const job = find(state.jobs, input.jobId, 'Cargo')
  if (job.tenantId !== tenantId) throw new DomainError('O cargo é do catálogo desta empresa')
  if (input.parentPositionId) {
    const parent = find(state.positions, input.parentPositionId, 'Posição superior')
    if (parent.tenantId !== tenantId) throw new DomainError('A posição superior é da mesma empresa')
  }
  if (!Number.isInteger(input.headcount) || input.headcount < 1) throw new DomainError('O número de vagas é um inteiro maior que zero')
  const position: JobPosition = {
    id: nextId(state, 'POS'), tenantId, name: job.name, sectorId: sector.id, jobId: job.id, description: job.mission,
    parentPositionId: input.parentPositionId, headcount: input.headcount, status: 'Ativo',
  }
  state.positions.push(position)
  log(state, 'Pessoas', actor, `Posição ${position.name} com ${position.headcount} vaga(s)`, undefined, position.id)
  return position
}

export function occupantsAt(state: ErpState, positionId: string, day = today()) {
  return state.assignments.filter(entry => entry.positionId === positionId && entry.validFrom <= day && (!entry.validTo || entry.validTo >= day))
}

/** A posição superior manda primeiro. Sem ela, vale quem lidera o setor; o líder responde ao líder do setor de cima. */
export function directManager(state: ErpState, user: User, day = today()): User | undefined {
  const others = (ids: string[]) => state.users.find(entry => ids.includes(entry.id) && entry.id !== user.id)
  const position = state.positions.find(entry => entry.id === user.positionId)
  if (position?.parentPositionId) {
    const boss = others(occupantsAt(state, position.parentPositionId, day).map(entry => entry.userId))
    if (boss) return boss
  }
  const name = sectorOf(state, user)?.name ?? user.sector
  let sector = state.sectors.find(entry => entry.tenantId === user.homeTenantId && entry.name === name)
  while (sector) {
    if (sector.managerId && sector.managerId !== user.id) return others([sector.managerId])
    sector = state.sectors.find(entry => entry.id === sector!.parentId)
  }
  return undefined
}

export function positionRoom(state: ErpState, positionId: string, exceptUserId?: string, day = today()) {
  const position = find(state.positions, positionId, 'Posição')
  const used = occupantsAt(state, positionId, day).filter(entry => entry.userId !== exceptUserId).length
  return { position, used, free: position.headcount - used }
}

export function assertPositionRoom(state: ErpState, positionId: string, exceptUserId?: string, day = today()) {
  const room = positionRoom(state, positionId, exceptUserId, day)
  if (room.free < 1) throw new DomainError('Todas as vagas desta posição estão ocupadas')
  return room
}

export function syncSectorManagers(state: ErpState, day = today()) {
  for (const sector of state.sectors) {
    if (!sector.managerPositionId) continue
    const occupant = occupantsAt(state, sector.managerPositionId, day)[0]
    sector.managerId = occupant?.userId
  }
}

export function placeSector(state: ErpState, sectorId: string, parentId: string | undefined, actor: string) {
  const sector = find(state.sectors, sectorId, 'Setor')
  if (parentId) {
    if (parentId === sector.id) throw new DomainError('Um setor não fica abaixo de si')
    const parent = find(state.sectors, parentId, 'Setor superior')
    if (parent.tenantId !== sector.tenantId) throw new DomainError('O setor superior é da mesma empresa')
    let cursor: Sector | undefined = parent
    while (cursor) {
      if (cursor.id === sector.id) throw new DomainError('Um setor não fica abaixo de um setor que já está abaixo dele')
      cursor = cursor.parentId ? state.sectors.find(entry => entry.id === cursor!.parentId) : undefined
    }
  }
  sector.parentId = parentId
  log(state, 'Pessoas', actor, parentId ? `${sector.name} ficou abaixo de ${find(state.sectors, parentId, 'Setor superior').name}` : `${sector.name} ficou no topo`, undefined, sector.id)
  return sector
}

export function setSectorLeadership(state: ErpState, sectorId: string, positionId: string, actor: string) {
  const sector = find(state.sectors, sectorId, 'Setor')
  const position = find(state.positions, positionId, 'Posição')
  if (position.tenantId !== sector.tenantId || position.sectorId !== sector.id) throw new DomainError('A liderança é uma posição deste setor')
  sector.managerPositionId = position.id
  syncSectorManagers(state)
  log(state, 'Pessoas', actor, `${sector.name} liderado pela posição ${position.name}`, undefined, sector.id)
  return sector
}

export function canSeePersonBlock(view: PersonView, block: PersonBlock) {
  if (view === 'completa') return true
  if (view === 'financeira') return block === 'salario' || block === 'banco' || block === 'profissional'
  return block === 'profissional'
}

/** RH vê a ficha; financeiro vê salário e banco; gestor e as demais pessoas veem o profissional. A própria pessoa vê a sua ficha. */
export function personView(role: Role, sessionUserId: string, person: Person, accountId?: string, managesTeam = false): PersonView {
  if (accountId === sessionUserId && person.id) return 'completa'
  if (role === 'Administrador' || role === 'Gestor') return 'completa'
  if (role === 'Financeiro') return 'financeira'
  if (managesTeam) return 'profissional'
  return 'profissional'
}

export function suggestIdentity(state: ErpState, personId: string, actor: string) {
  const person = find(state.persons, personId, 'Pessoa')
  const email = (person.corporateEmail || person.personalEmail || '').trim().toLowerCase()
  const match = state.persons.find(other => other.id !== person.id && other.tenantId !== person.tenantId && (
    (person.cpf && other.cpf === person.cpf) || (email && (other.corporateEmail || other.personalEmail || '').trim().toLowerCase() === email)
  ))
  if (!match) return undefined
  const existing = state.identityLinks.find(entry => entry.status !== 'Recusado' && ((entry.leftPersonId === person.id && entry.rightPersonId === match.id) || (entry.leftPersonId === match.id && entry.rightPersonId === person.id)))
  if (existing) return existing
  const link: IdentityLink = {
    id: nextId(state, 'IDN'), leftPersonId: person.id, rightPersonId: match.id, status: 'Sugerido',
    basis: person.cpf && match.cpf === person.cpf ? 'CPF' : 'E-mail', at: now(),
  }
  state.identityLinks.unshift(link)
  log(state, 'Pessoas', actor, `Possível mesma pessoa: ${person.fullName}. Nada foi unido.`, undefined, person.id)
  return link
}

export function confirmIdentity(state: ErpState, linkId: string, actor: string) {
  const link = find(state.identityLinks, linkId, 'Ligação')
  if (link.status === 'Recusado') throw new DomainError('A sugestão recusada não se confirma sozinha')
  link.status = 'Confirmado'
  link.actor = actor
  link.at = now()
  log(state, 'Pessoas', actor, 'Ligação de identidade confirmada por uma pessoa', undefined, link.id)
  return link
}

export function refuseIdentity(state: ErpState, linkId: string, actor: string) {
  const link = find(state.identityLinks, linkId, 'Ligação')
  link.status = 'Recusado'
  link.actor = actor
  link.at = now()
  log(state, 'Pessoas', actor, 'Sugestão de identidade recusada. Os cadastros continuam separados.', undefined, link.id)
  return link
}

function jobTitleOf(state: ErpState, person: Person) {
  const account = state.users.find(entry => entry.personId === person.id && entry.homeTenantId === person.tenantId)
  const position = account?.positionId ? state.positions.find(entry => entry.id === account.positionId) : undefined
  const job = position ? state.jobs.find(entry => entry.id === position.jobId) : undefined
  return job?.name ?? position?.name ?? 'Colaborador'
}

/** Cartão do diretório. Não carrega documento, saúde, salário, banco nem endereço. */
export function directoryCard(state: ErpState, person: Person) {
  const tenant = state.tenants.find(entry => entry.id === person.tenantId)
  const link = state.identityLinks.find(entry => entry.leftPersonId === person.id || entry.rightPersonId === person.id)
  return {
    personId: person.id,
    tenantId: person.tenantId,
    tenantName: tenant?.tradeName ?? person.tenantId,
    name: person.fullName,
    photo: person.photo,
    jobTitle: jobTitleOf(state, person),
    contact: person.corporateEmail || '',
    linkStatus: link?.status,
  }
}

export function groupDirectory(state: ErpState, tenantId: string) {
  const tenant = state.tenants.find(entry => entry.id === tenantId)
  const peers = new Set(state.tenants.filter(entry => entry.groupId && entry.groupId === tenant?.groupId).map(entry => entry.id))
  return state.persons.filter(entry => entry.tenantId !== tenantId && peers.has(entry.tenantId)).map(entry => directoryCard(state, entry))
}

export function addProjectParticipation(state: ErpState, hostTenantId: string, projectId: string, personId: string, role: string, actor: string) {
  const project = find(state.projects, projectId, 'Projeto')
  const person = find(state.persons, personId, 'Pessoa')
  if (person.tenantId === hostTenantId) throw new DomainError('Quem já é da empresa entra na equipe do projeto, sem participação cruzada')
  if (!role.trim()) throw new DomainError('Informe o papel no projeto')
  if (state.projectParticipations.some(entry => entry.projectId === projectId && entry.personId === personId)) throw new DomainError('Esta pessoa já participa do projeto')
  const card: ProjectParticipation = {
    id: nextId(state, 'PRT'), projectId, hostTenantId, personId, sourceTenantId: person.tenantId,
    displayName: person.fullName, jobTitle: jobTitleOf(state, person), contact: person.corporateEmail || '', role: role.trim(),
  }
  if (SENSITIVE_PERSON_KEYS.some(key => key in card)) throw new DomainError('A participação não leva dado sensível')
  state.projectParticipations.unshift(card)
  log(state, 'Projetos', actor, `${card.displayName} participa de ${project.name} sem mudar de empresa`, undefined, project.id)
  return card
}

/** Perfil manual na outra empresa. Não cria pessoa, vínculo nem headcount. */
export function grantCompanyAccess(state: ErpState, userId: string, tenantId: string, profileId: string, actor: string) {
  const user = find(state.users, userId, 'Conta')
  if (user.platformMaster) throw new DomainError('O mestre da plataforma não recebe perfil de empresa')
  const profile = find(state.accessProfiles, profileId, 'Perfil')
  if (profile.tenantId !== tenantId) throw new DomainError('O perfil é da empresa que recebe o acesso')
  if (state.userProfileAssignments.some(entry => entry.userId === userId && entry.tenantId === tenantId && entry.profileId === profileId)) throw new DomainError('Este perfil já está atribuído')
  const persons = state.persons.length
  const positions = state.positions.length
  const employments = state.employments.length
  state.userProfileAssignments.push({ id: nextId(state, 'UP'), userId, tenantId, profileId })
  if (state.persons.length !== persons || state.positions.length !== positions || state.employments.length !== employments) throw new DomainError('Acesso não cria cadastro de pessoa')
  log(state, 'Organização', actor, `${user.name} recebeu o perfil ${profile.name} sem novo vínculo`, undefined, user.id)
  return user
}

/** Segundo vínculo formal. Nasce outro cadastro, só com nome e contato, ligado por confirmação humana. */
export function openLinkedEmployment(state: ErpState, sourcePersonId: string, tenantId: string, input: { sector: string; positionId?: string; contractType: string; startedOn: string; profileId: string; shift: User['shift'] }, actor: string) {
  const source = find(state.persons, sourcePersonId, 'Pessoa')
  if (source.tenantId === tenantId) throw new DomainError('Esta pessoa já pertence à empresa')
  if (!input.sector.trim() || !input.contractType.trim()) throw new DomainError('Informe setor e tipo de contrato')
  const profile = find(state.accessProfiles, input.profileId, 'Perfil')
  if (profile.tenantId !== tenantId) throw new DomainError('O perfil é da empresa do novo vínculo')
  if (input.positionId) assertPositionRoom(state, input.positionId)
  const person = blankPerson(nextId(state, 'PES'), tenantId, source.fullName, source.corporateEmail)
  state.persons.push(person)
  const employment: Employment = {
    id: nextId(state, 'EMP'), tenantId, personId: person.id, contractType: input.contractType.trim(), startedOn: input.startedOn, status: 'Ativo',
  }
  state.employments.push(employment)
  const user: User = {
    id: `u${String(state.counters.U = (state.counters.U ?? 15) + 1)}`,
    name: person.fullName, role: profile.simulatedRole ?? 'Operador', sector: input.sector.trim(), shift: input.shift, pin: String(1000 + (state.counters.U * 37) % 9000),
    email: undefined, positionId: input.positionId, personId: person.id, homeTenantId: tenantId, active: true,
  }
  state.users.push(user)
  grantCompanyAccess(state, user.id, tenantId, profile.id, actor)
  const link: IdentityLink = {
    id: nextId(state, 'IDN'), leftPersonId: source.id, rightPersonId: person.id, status: 'Confirmado', basis: 'Confirmação humana', actor, at: now(),
  }
  state.identityLinks.unshift(link)
  if (person.cpf || person.banks.length || person.address) throw new DomainError('O novo vínculo não copia dado sensível')
  log(state, 'Pessoas', actor, `${person.fullName} ganhou vínculo em outra empresa, sem unir os cadastros`, undefined, person.id)
  return { person, user, employment, link }
}

/** Redefine o PIN e não o devolve. A tela mostra só os dois últimos dígitos. */
export function resetPin(state: ErpState, userId: string, actor: string) {
  const user = find(state.users, userId, 'Conta')
  if (user.platformMaster) throw new DomainError('A identidade da plataforma não usa o PIN do tablet')
  state.counters.PIN = (state.counters.PIN ?? 2000) + 1
  user.pin = String(1000 + (state.counters.PIN % 9000)).padStart(4, '0')
  log(state, 'Organização', actor, `PIN de ${user.name} redefinido. O valor não entra no histórico.`, undefined, user.id)
  return { userId: user.id, reset: true as const }
}
