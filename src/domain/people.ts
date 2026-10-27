import type { ErpState } from './engine'
import { addDays, DomainError, log, nextId, now, today } from './engine'
import { assertPositionRoom, endEmployment, ensurePerson, syncSectorManagers } from './organization'
import type {
  Application, ApplicationStage, Assignment, Candidate, JobOpening, JobOpeningStatus, PeopleChecklist, PeopleChecklistItem, PeopleChecklistKind, PeopleProcess, Role, User,
} from '../types/domain'

/** Versão fixa da leitura de demonstração. Não há modelo externo. */
export const BRIEFING_VERSION = 'pessoas-ia-demo-1'

const SECRET = /senha|password|pin|segredo|secret|credential/i

interface ChecklistSeed {
  label: string
  owner: string
  kind: PeopleChecklistKind
  required: boolean
}

/** Itens de demonstração. A lista oficial de documentos ainda não foi definida. */
export const ADMISSION_ITEMS: ChecklistSeed[] = [
  { label: 'Currículo organizado na candidatura', owner: 'Admissão', kind: 'geral', required: true },
  { label: 'Contato conferido', owner: 'Admissão', kind: 'geral', required: true },
]

export const HIRE_ITEMS: ChecklistSeed[] = [
  { label: 'Vínculo preparado', owner: 'Admissão', kind: 'geral', required: true },
]

/** Itens conceituais do desligamento. Responsável por item ainda não foi definido. */
export const OFFBOARD_ITEMS: ChecklistSeed[] = [
  { label: 'Comunicação aos responsáveis', owner: 'A definir', kind: 'geral', required: true },
  { label: 'Transferência de atividades', owner: 'A definir', kind: 'geral', required: true },
  { label: 'Devolução de equipamentos', owner: 'A definir', kind: 'ativo', required: true },
  { label: 'Encerramento de acessos', owner: 'A definir', kind: 'acesso', required: true },
  { label: 'Documentos e pendências', owner: 'A definir', kind: 'geral', required: false },
  { label: 'Confirmação final', owner: 'A definir', kind: 'confirmacao', required: true },
]

/** Tarefas de revisão. Não concedem acesso. */
export const MOVE_ITEMS: ChecklistSeed[] = [
  { label: 'Revisão de acesso', owner: 'A definir', kind: 'acesso', required: false },
  { label: 'Revisão de equipamento', owner: 'A definir', kind: 'ativo', required: false },
  { label: 'Revisão de treinamento', owner: 'A definir', kind: 'geral', required: false },
]

const find = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const entry = list.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError(`${label} não encontrado(a)`)
  return entry
}

function assertNoSecret(input: object) {
  for (const key of Object.keys(input)) {
    if (key !== 'vaultReference' && SECRET.test(key)) throw new DomainError('Credenciais não são registradas no cadastro de pessoas')
  }
}

function userOf(state: ErpState, id: string) {
  return find(state.users, id, 'Pessoa')
}

function checklistOf(state: ErpState, process: PeopleProcess, refId: string) {
  return state.peopleChecklists.find(entry => entry.process === process && entry.refId === refId)
}

function spawnChecklist(state: ErpState, tenantId: string, process: PeopleProcess, refId: string, seeds: ChecklistSeed[], dueOn?: string) {
  const existing = checklistOf(state, process, refId)
  if (existing) return existing
  const checklist: PeopleChecklist = {
    id: nextId(state, 'CHK'),
    tenantId,
    process,
    refId,
    items: seeds.map(seed => ({ id: nextId(state, 'CKI'), ...seed, status: 'Pendente' as const, dueOn })),
  }
  state.peopleChecklists.unshift(checklist)
  return checklist
}

function touch(application: Application, actor: string, text: string) {
  application.history.unshift({ at: now(), actor, text })
}

function wordsOf(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(word => word.length > 3)
}

export function matchingCandidate(state: ErpState, tenantId: string, input: { email?: string; phone?: string }, exceptId?: string) {
  const email = input.email?.trim().toLowerCase()
  const phone = input.phone?.replace(/\D/g, '')
  return state.candidates.find(entry => entry.tenantId === tenantId && entry.id !== exceptId && (
    (email && entry.email?.toLowerCase() === email) || (Boolean(phone && phone.length >= 8) && entry.phone?.replace(/\D/g, '') === phone)
  ))
}

export function assignmentAt(state: ErpState, userId: string, day = today()) {
  return state.assignments
    .filter(entry => entry.userId === userId && entry.validFrom <= day && (!entry.validTo || entry.validTo >= day))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
}

export function reviewsShareScale(reviews: { scale: string }[]) {
  return new Set(reviews.map(entry => entry.scale.trim().toLowerCase())).size <= 1
}

export function ensureOpeningAssignment(state: ErpState, userId: string, validFrom: string, actor: string) {
  if (state.assignments.some(entry => entry.userId === userId)) return
  const user = userOf(state, userId)
  const assignment: Assignment = { id: nextId(state, 'VG'), userId, sector: user.sector, positionId: user.positionId, validFrom, actor }
  state.assignments.push(assignment)
  return assignment
}

export function createJobOpening(state: ErpState, tenantId: string, input: {
  title: string
  sectorId?: string
  requesterId?: string
  description: string
  requirements: string[]
  ownerId?: string
  openedOn: string
  targetOn?: string
}, actor: string) {
  if (!input.title.trim()) throw new DomainError('Informe o cargo ou a posição')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.openedOn)) throw new DomainError('Informe a data de abertura')
  if (input.targetOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetOn)) throw new DomainError('A data alvo é inválida')
  const job: JobOpening = {
    id: nextId(state, 'VAG'),
    tenantId,
    title: input.title.trim(),
    sectorId: input.sectorId || undefined,
    requesterId: input.requesterId || undefined,
    description: input.description.trim(),
    requirements: input.requirements.map(entry => entry.trim()).filter(Boolean),
    ownerId: input.ownerId || undefined,
    status: 'Aberta',
    openedOn: input.openedOn,
    targetOn: input.targetOn || undefined,
  }
  state.jobOpenings.unshift(job)
  spawnChecklist(state, tenantId, 'admissao', job.id, ADMISSION_ITEMS)
  log(state, 'Pessoas', actor, `Vaga aberta: ${job.title}`, undefined, job.id)
  return job
}

export function updateJobOpening(state: ErpState, id: string, patch: Partial<Pick<JobOpening, 'title' | 'sectorId' | 'requesterId' | 'description' | 'requirements' | 'ownerId' | 'targetOn' | 'status'>>, actor: string) {
  const job = find(state.jobOpenings, id, 'Vaga')
  if (patch.title !== undefined && !patch.title.trim()) throw new DomainError('Informe o cargo ou a posição')
  if (patch.status) job.status = patch.status
  if (patch.title !== undefined) job.title = patch.title.trim()
  if (patch.description !== undefined) job.description = patch.description.trim()
  if (patch.requirements) job.requirements = patch.requirements.map(entry => entry.trim()).filter(Boolean)
  if ('sectorId' in patch) job.sectorId = patch.sectorId || undefined
  if ('requesterId' in patch) job.requesterId = patch.requesterId || undefined
  if ('ownerId' in patch) job.ownerId = patch.ownerId || undefined
  if ('targetOn' in patch) job.targetOn = patch.targetOn || undefined
  log(state, 'Pessoas', actor, `Vaga atualizada: ${job.title}`, undefined, job.id)
  return job
}

export function setJobStatus(state: ErpState, id: string, status: JobOpeningStatus, actor: string) {
  return updateJobOpening(state, id, { status }, actor)
}

export function addChecklistItem(state: ErpState, checklistId: string, input: { label: string; owner: string; kind: PeopleChecklistKind; required: boolean }, actor: string) {
  const checklist = find(state.peopleChecklists, checklistId, 'Checklist')
  if (!input.label.trim()) throw new DomainError('Informe o item')
  const item: PeopleChecklistItem = {
    id: nextId(state, 'CKI'),
    label: input.label.trim(),
    owner: input.owner.trim() || 'A definir',
    kind: input.kind,
    required: input.required,
    status: 'Pendente',
  }
  checklist.items.push(item)
  log(state, 'Pessoas', actor, `Item de checklist: ${item.label}`, undefined, checklist.refId)
  return item
}

export function registerCandidate(state: ErpState, tenantId: string, input: {
  jobId: string
  name: string
  email?: string
  phone?: string
  resumeName?: string
  resumeText: string
  force?: boolean
  existingCandidateId?: string
}, actor: string) {
  const job = find(state.jobOpenings, input.jobId, 'Vaga')
  if (job.tenantId !== tenantId) throw new DomainError('A vaga é de outra empresa')
  if (job.status !== 'Aberta') throw new DomainError('A vaga não está aberta')
  if (!input.name.trim()) throw new DomainError('Informe o nome do candidato')
  const duplicate = input.existingCandidateId ? undefined : matchingCandidate(state, tenantId, input)
  if (duplicate && !input.force) throw new DomainError(`Possível duplicata: ${duplicate.name}. Confirme se é a mesma pessoa ou outro cadastro.`)
  const candidate: Candidate = input.existingCandidateId
    ? find(state.candidates, input.existingCandidateId, 'Candidato')
    : {
    id: nextId(state, 'CD'),
    tenantId,
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    resumeName: input.resumeName?.trim() || undefined,
    resumeText: input.resumeText.trim(),
  }
  if (candidate.tenantId !== tenantId) throw new DomainError('O candidato é de outra empresa')
  if (!input.existingCandidateId) state.candidates.unshift(candidate)
  if (state.applications.some(entry => entry.candidateId === candidate.id && entry.jobId === job.id && entry.stage !== 'Encerrado')) {
    throw new DomainError('Este candidato já está nesta vaga')
  }
  const jobChecklist = checklistOf(state, 'admissao', job.id)
  const application: Application = {
    id: nextId(state, 'CA'),
    tenantId,
    candidateId: candidate.id,
    jobId: job.id,
    stage: 'Triagem',
    history: [{ at: now(), actor, text: input.force && duplicate ? 'Candidatura aberta após duplicidade mantida por decisão humana' : 'Candidatura aberta em triagem' }],
  }
  state.applications.unshift(application)
  spawnChecklist(state, tenantId, 'admissao', application.id, jobChecklist?.items.map(item => ({ label: item.label, owner: item.owner, kind: item.kind, required: item.required })) ?? ADMISSION_ITEMS)
  log(state, 'Pessoas', actor, `Candidato ${candidate.name} na vaga ${job.title}`, undefined, application.id)
  return { candidate, application }
}

export function noteCandidateView(state: ErpState, candidateId: string, actor: string) {
  const candidate = find(state.candidates, candidateId, 'Candidato')
  log(state, 'Pessoas', actor, `Consulta ao currículo de ${candidate.name}`, undefined, candidate.id)
  return candidate
}

export function prepareBriefing(state: ErpState, applicationId: string, actor: string) {
  const application = find(state.applications, applicationId, 'Candidatura')
  const candidate = find(state.candidates, application.candidateId, 'Candidato')
  const job = find(state.jobOpenings, application.jobId, 'Vaga')
  const resume = wordsOf(candidate.resumeText)
  const evidence: string[] = []
  const gaps: string[] = []
  for (const requirement of job.requirements) {
    const words = wordsOf(requirement)
    if (words.some(word => resume.includes(word))) evidence.push(requirement)
    else gaps.push(requirement)
  }
  const suggested = evidence.length > 0 && gaps.length === 0
  const summary = job.requirements.length
    ? `${candidate.name}: ${evidence.length} requisito(s) com evidência no texto e ${gaps.length} lacuna(s). A decisão continua humana.`
    : `${candidate.name}: a vaga não lista requisitos, então não há sugestão.`
  const briefing = {
    id: nextId(state, 'IA'),
    applicationId,
    version: BRIEFING_VERSION,
    criteria: [...job.requirements],
    evidence,
    gaps,
    questions: gaps.map(gap => `Conte uma experiência relacionada a: ${gap}`),
    summary,
    suggested,
    at: now(),
  }
  state.candidateBriefings.unshift(briefing)
  touch(application, actor, 'Leitura assistida registrada para revisão humana')
  log(state, 'Pessoas', actor, `Leitura assistida de ${candidate.name} (${BRIEFING_VERSION})`, undefined, application.id)
  return briefing
}

export function reviewBriefing(state: ErpState, briefingId: string, decision: 'Seguir' | 'Não seguir', note: string, actor: string) {
  const briefing = find(state.candidateBriefings, briefingId, 'Leitura')
  if (!note.trim()) throw new DomainError('Registre a observação da revisão humana')
  const application = find(state.applications, briefing.applicationId, 'Candidatura')
  briefing.humanDecision = decision
  briefing.humanNote = note.trim()
  briefing.decidedBy = actor
  briefing.decidedAt = now()
  touch(application, actor, `Revisão humana: ${decision}`)
  log(state, 'Pessoas', actor, `Revisão humana da leitura: ${decision}`, undefined, application.id)
  return briefing
}

export function scheduleInterview(state: ErpState, applicationId: string, input: { at: string; place: string; interviewerIds: string[] }, actor: string) {
  const application = find(state.applications, applicationId, 'Candidatura')
  if (application.stage === 'Efetivado' || application.stage === 'Encerrado') throw new DomainError('Esta candidatura não recebe nova entrevista')
  if (!input.at || !input.place.trim()) throw new DomainError('Informe data, hora e local')
  if (!input.interviewerIds.length) throw new DomainError('Informe ao menos um entrevistador')
  const interview = {
    id: nextId(state, 'ENT'),
    applicationId,
    at: input.at,
    place: input.place.trim(),
    interviewerIds: [...input.interviewerIds],
    confirmed: false,
    notes: '',
  }
  state.interviews.unshift(interview)
  if (application.stage === 'Triagem') application.stage = 'Entrevista'
  touch(application, actor, `Entrevista presencial em ${input.place.trim()}`)
  log(state, 'Pessoas', actor, 'Entrevista presencial registrada. Convite externo não é enviado.', undefined, application.id)
  return interview
}

export function setInterviewConfirmation(state: ErpState, interviewId: string, confirmed: boolean, actor: string) {
  const interview = find(state.interviews, interviewId, 'Entrevista')
  interview.confirmed = confirmed
  const application = find(state.applications, interview.applicationId, 'Candidatura')
  touch(application, actor, confirmed ? 'Entrevista confirmada' : 'Entrevista sem confirmação')
  log(state, 'Pessoas', actor, confirmed ? 'Entrevista confirmada' : 'Falta de confirmação registrada', undefined, application.id)
  return interview
}

export function recordSelectionResult(state: ErpState, applicationId: string, input: { origin: string; notes: string }, actor: string) {
  const application = find(state.applications, applicationId, 'Candidatura')
  if (application.stage === 'Efetivado') throw new DomainError('A candidatura efetivada permanece como histórico')
  if (!input.notes.trim()) throw new DomainError('Registre o resultado da etapa')
  const review = {
    id: nextId(state, 'SEL'),
    applicationId,
    origin: input.origin.trim() || 'Entrevista presencial',
    notes: input.notes.trim(),
    actor,
    at: now(),
  }
  state.selectionReviews.unshift(review)
  touch(application, actor, `Resultado da etapa: ${review.origin}`)
  log(state, 'Pessoas', actor, 'Resultado de etapa registrado', undefined, application.id)
  return review
}

export function setApplicationStage(state: ErpState, applicationId: string, stage: Exclude<ApplicationStage, 'Efetivado'>, actor: string) {
  const application = find(state.applications, applicationId, 'Candidatura')
  if (application.stage === 'Efetivado') throw new DomainError('A candidatura efetivada permanece como histórico')
  application.stage = stage
  if (stage === 'Selecionado') spawnChecklist(state, application.tenantId, 'efetivacao', application.id, HIRE_ITEMS)
  touch(application, actor, `Etapa: ${stage}`)
  log(state, 'Pessoas', actor, `Candidatura em ${stage}`, undefined, application.id)
  return application
}

export function setChecklistItem(state: ErpState, checklistId: string, itemId: string, input: { status: PeopleChecklistItem['status']; evidence?: string }, actor: string) {
  const checklist = find(state.peopleChecklists, checklistId, 'Checklist')
  const item = find(checklist.items, itemId, 'Item')
  if (item.kind === 'acesso' && input.status === 'Concluído') throw new DomainError('O encerramento de acessos é registrado pela execução, sem senha')
  if (item.kind === 'confirmacao' && input.status === 'Concluído' && checklist.items.some(entry => entry.required && entry.id !== item.id && entry.status !== 'Concluído')) {
    throw new DomainError('Conclua os demais itens antes da confirmação final')
  }
  item.status = input.status
  item.evidence = input.evidence?.trim() || undefined
  log(state, 'Pessoas', actor, `${item.label}: ${item.status}`, undefined, checklist.refId)
  return item
}

export function hireCandidate(state: ErpState, applicationId: string, input: {
  role: Role
  sector: string
  shift: User['shift']
  positionId?: string
  linkUserId?: string
}, actor: string, createUser: (input: Pick<User, 'name' | 'role' | 'sector' | 'shift'> & Partial<Pick<User, 'email' | 'positionId'>>) => User) {
  const application = find(state.applications, applicationId, 'Candidatura')
  if (application.stage !== 'Selecionado') throw new DomainError('Marque o candidato como selecionado antes de efetivar')
  const checklist = checklistOf(state, 'efetivacao', application.id)
  if (!checklist || checklist.items.some(item => item.required && item.status !== 'Concluído')) throw new DomainError('O checklist de efetivação ainda tem pendência')
  const candidate = find(state.candidates, application.candidateId, 'Candidato')
  if (candidate.personId) throw new DomainError('Este candidato já está ligado a uma pessoa')
  const sameEmail = candidate.email ? state.users.find(entry => entry.email?.toLowerCase() === candidate.email?.toLowerCase()) : undefined
  let person: User
  if (sameEmail) {
    if (input.linkUserId !== sameEmail.id) throw new DomainError('Este e-mail já é de uma pessoa. Una os cadastros para não duplicar a identidade.')
    person = sameEmail
  } else if (input.linkUserId) {
    person = userOf(state, input.linkUserId)
  } else {
    person = createUser({ name: candidate.name, email: candidate.email, role: input.role, sector: input.sector, shift: input.shift, positionId: input.positionId })
    ensureOpeningAssignment(state, person.id, today(), actor)
  }
  const record = ensurePerson(state, person, application.tenantId, actor)
  candidate.personId = record?.id ?? person.personId
  application.stage = 'Efetivado'
  touch(application, actor, `Efetivado no cadastro ${person.name}`)
  log(state, 'Pessoas', actor, `${candidate.name} efetivado sem duplicar a identidade`, undefined, person.id)
  return person
}

export function changeAssignment(state: ErpState, tenantId: string, userId: string, input: { sector: string; positionId?: string; validFrom: string }, actor: string) {
  const user = userOf(state, userId)
  if (user.platformMaster) throw new DomainError('A identidade da plataforma não recebe vigência de cargo')
  if (!input.sector.trim()) throw new DomainError('Informe o setor')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom)) throw new DomainError('Informe a data de vigência')
  if (input.positionId) assertPositionRoom(state, input.positionId, userId, input.validFrom)
  const current = state.assignments.filter(entry => entry.userId === userId && !entry.validTo).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
  if (current && input.validFrom <= current.validFrom) throw new DomainError('A vigência nova precisa começar depois da atual')
  if (current && current.sector === input.sector && (current.positionId ?? '') === (input.positionId ?? '')) throw new DomainError('O cargo e o setor informados já estão vigentes')
  if (current) current.validTo = addDays(input.validFrom, -1)
  const assignment: Assignment = {
    id: nextId(state, 'VG'),
    userId,
    sector: input.sector.trim(),
    positionId: input.positionId || undefined,
    validFrom: input.validFrom,
    actor,
  }
  state.assignments.push(assignment)
  if (input.validFrom <= today()) {
    user.sector = assignment.sector
    user.positionId = assignment.positionId
  }
  spawnChecklist(state, tenantId, 'movimentacao', assignment.id, MOVE_ITEMS)
  syncSectorManagers(state)
  log(state, 'Pessoas', actor, `${user.name}: ${assignment.sector} a partir de ${input.validFrom}. O acesso não muda.`, undefined, user.id)
  return assignment
}

export function recordReview(state: ErpState, userId: string, input: { scoreLabel: string; scale: string; period: string; origin: string }, actor: string) {
  userOf(state, userId)
  if (!input.scoreLabel.trim() || !input.scale.trim() || !input.period.trim() || !input.origin.trim()) throw new DomainError('Informe nota, escala, período e origem')
  const review = {
    id: nextId(state, 'AV'),
    userId,
    scoreLabel: input.scoreLabel.trim(),
    scale: input.scale.trim(),
    period: input.period.trim(),
    origin: input.origin.trim(),
    at: now(),
    actor,
  }
  state.performanceReviews.unshift(review)
  log(state, 'Pessoas', actor, `Avaliação ${review.scoreLabel} (${review.scale}) em ${review.period}`, undefined, userId)
  return review
}

export function startOffboarding(state: ErpState, tenantId: string, userId: string, input: { effectiveOn: string; reason: string }, actor: string) {
  const user = userOf(state, userId)
  if (user.platformMaster) throw new DomainError('A identidade da plataforma não entra no desligamento da empresa')
  if (state.offboardings.some(entry => entry.userId === userId && entry.status === 'Em andamento')) throw new DomainError('Já existe um desligamento em andamento')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveOn)) throw new DomainError('Informe a data efetiva')
  if (!input.reason.trim()) throw new DomainError('Informe o motivo. A lista oficial de motivos ainda não foi definida.')
  const process = {
    id: nextId(state, 'DES'),
    tenantId,
    userId,
    effectiveOn: input.effectiveOn,
    reason: input.reason.trim(),
    status: 'Em andamento' as const,
    startedAt: now(),
    startedBy: actor,
  }
  state.offboardings.unshift(process)
  spawnChecklist(state, tenantId, 'desligamento', process.id, OFFBOARD_ITEMS, input.effectiveOn)
  log(state, 'Pessoas', actor, `Desligamento iniciado: ${user.name}`, undefined, process.id)
  return process
}

export function revokeAccess(state: ErpState, offboardingId: string, input: { systems: string[]; result: 'Concluído' | 'Falha'; failure?: string; vaultReference?: string }, actor: string) {
  assertNoSecret(input)
  const process = find(state.offboardings, offboardingId, 'Desligamento')
  if (process.status !== 'Em andamento') throw new DomainError('O desligamento já foi concluído')
  const systems = input.systems.map(entry => entry.trim()).filter(Boolean)
  if (!systems.length) throw new DomainError('Informe ao menos um sistema')
  if (input.result === 'Falha' && !input.failure?.trim()) throw new DomainError('Descreva a falha da revogação')
  const record = {
    id: nextId(state, 'REV'),
    offboardingId,
    systems,
    at: now(),
    result: input.result,
    actor,
    failure: input.failure?.trim() || undefined,
    vaultReference: input.vaultReference?.trim() || undefined,
  }
  state.accessRevocations.unshift(record)
  const checklist = checklistOf(state, 'desligamento', process.id)
  const access = checklist?.items.find(item => item.kind === 'acesso')
  if (access) {
    access.status = input.result === 'Concluído' ? 'Concluído' : 'Falha'
    access.evidence = input.result === 'Concluído' ? systems.join(', ') : input.failure?.trim()
  }
  if (input.result === 'Concluído') {
    const user = userOf(state, process.userId)
    user.active = false
  }
  log(state, 'Pessoas', actor, `Revogação de acesso: ${input.result}. Sistemas: ${systems.join(', ')}`, undefined, process.id)
  return record
}

export function closeOffboarding(state: ErpState, offboardingId: string, actor: string) {
  const process = find(state.offboardings, offboardingId, 'Desligamento')
  if (process.status === 'Concluído') throw new DomainError('O desligamento já foi concluído')
  const checklist = checklistOf(state, 'desligamento', process.id)
  if (!checklist || checklist.items.some(item => item.required && item.status !== 'Concluído')) throw new DomainError('Ainda há item obrigatório pendente ou com falha')
  process.status = 'Concluído'
  process.closedAt = now()
  process.closedBy = actor
  const account = state.users.find(entry => entry.id === process.userId)
  if (account?.personId) endEmployment(state, account.personId, process.tenantId, process.effectiveOn)
  log(state, 'Pessoas', actor, 'Desligamento concluído. O vínculo encerra e o histórico permanece.', undefined, process.userId)
  return process
}

export function isChecklistLate(item: PeopleChecklistItem, day = today()) {
  return item.status === 'Pendente' && Boolean(item.dueOn && item.dueOn < day)
}

export function peopleBoard(state: ErpState, tenantId: string, day = today()) {
  const jobs = state.jobOpenings.filter(entry => entry.tenantId === tenantId)
  const applications = state.applications.filter(entry => entry.tenantId === tenantId)
  const interviews = state.interviews.filter(entry => applications.some(application => application.id === entry.applicationId))
  const hireLists = state.peopleChecklists.filter(entry => entry.tenantId === tenantId && entry.process === 'efetivacao')
  const offs = state.offboardings.filter(entry => entry.tenantId === tenantId)
  const offLists = state.peopleChecklists.filter(entry => entry.tenantId === tenantId && entry.process === 'desligamento')
  const latestBriefing = (applicationId: string) => state.candidateBriefings.find(entry => entry.applicationId === applicationId)
  return {
    openJobs: jobs.filter(entry => entry.status === 'Aberta').length,
    pendingApplications: applications.filter(entry => entry.stage !== 'Efetivado' && entry.stage !== 'Encerrado').length,
    unconfirmedInterviews: interviews.filter(entry => !entry.confirmed && entry.at.slice(0, 10) >= day).length,
    incompleteHires: hireLists.filter(entry => entry.items.some(item => item.required && item.status !== 'Concluído')).length,
    suggested: applications.filter(entry => latestBriefing(entry.id)?.suggested && latestBriefing(entry.id)?.humanDecision !== 'Não seguir' && entry.stage !== 'Efetivado' && entry.stage !== 'Encerrado').length,
    offboardingOpen: offs.filter(entry => entry.status === 'Em andamento').length,
    lateItems: offLists.reduce((sum, entry) => sum + entry.items.filter(item => isChecklistLate(item, day)).length, 0),
    accessFailed: state.accessRevocations.filter(entry => offs.some(process => process.id === entry.offboardingId) && entry.result === 'Falha').length,
    assetsPending: offLists.reduce((sum, entry) => sum + entry.items.filter(item => item.kind === 'ativo' && item.status !== 'Concluído').length, 0),
  }
}
