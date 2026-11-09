import type { ErpState } from './engine'
import { addDays, DEFAULT_TENANT, DomainError, log, nextId, now, today } from './engine'
import type { Training, TrainingKind, TrainingResult, TrainingStatus } from '../types/domain'

export const TRAINING_KINDS: TrainingKind[] = ['Segurança', 'Operação', 'Qualidade', 'Sistema', 'Outro']

/** Situação calculada. Treinamento não bloqueia operação: só aparece como alerta. */
export function trainingStatus(training: Training, on = today()): TrainingStatus {
  if (training.result !== 'Aprovado' || !training.completedOn) return 'Pendente'
  if (training.validUntil && training.validUntil < on) return 'Vencido'
  return 'Válido'
}

export function trainingExpiresSoon(training: Training, on = today(), days = 30) {
  return trainingStatus(training, on) === 'Válido' && !!training.validUntil && training.validUntil <= addDays(on, days)
}

export function recordTraining(
  state: ErpState,
  input: Pick<Training, 'personId' | 'name' | 'kind'> & Partial<Pick<Training, 'completedOn' | 'validUntil' | 'evidence'>> & { result?: TrainingResult },
  actor: string,
) {
  const person = state.persons.find(entry => entry.id === input.personId)
  if (!person) throw new DomainError('Escolha a pessoa')
  if (!input.name.trim()) throw new DomainError('Informe o treinamento')
  const result = input.result ?? (input.completedOn ? 'Aprovado' : 'Pendente')
  if (result !== 'Pendente' && !input.completedOn) throw new DomainError('Informe a data de realização')
  if (input.completedOn && input.completedOn > today()) throw new DomainError('A realização não pode estar no futuro')
  if (input.validUntil && input.completedOn && input.validUntil < input.completedOn) throw new DomainError('A validade termina depois da realização')
  const training: Training = {
    id: nextId(state, 'TR'), tenantId: DEFAULT_TENANT, personId: person.id, name: input.name.trim(), kind: input.kind,
    completedOn: input.completedOn || undefined, validUntil: input.validUntil || undefined, result,
    evidence: input.evidence?.trim() || undefined, createdBy: actor, createdAt: now(),
  }
  state.trainings.unshift(training)
  log(state, 'Pessoas', actor, `${person.fullName}: treinamento ${training.name} registrado (${result.toLowerCase()})`, undefined, person.id)
  return training
}

export function updateTraining(state: ErpState, id: string, patch: Partial<Pick<Training, 'completedOn' | 'validUntil' | 'result' | 'evidence'>>, actor: string) {
  const training = state.trainings.find(entry => entry.id === id)
  if (!training) throw new DomainError('Treinamento não encontrado')
  const next = { ...training, ...patch }
  if (next.result !== 'Pendente' && !next.completedOn) throw new DomainError('Informe a data de realização')
  if (next.validUntil && next.completedOn && next.validUntil < next.completedOn) throw new DomainError('A validade termina depois da realização')
  Object.assign(training, patch)
  log(state, 'Pessoas', actor, `Treinamento ${training.name} atualizado`, undefined, training.personId)
  return training
}

export function trainingAlerts(state: ErpState, on = today()) {
  return state.trainings.filter(entry => trainingStatus(entry, on) === 'Vencido' || trainingExpiresSoon(entry, on))
}
