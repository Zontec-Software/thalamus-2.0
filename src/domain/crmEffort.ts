import type { ErpState } from './engine'
import { DomainError, addDays, log, nextId, now, today } from './engine'
import type {
  CommercialClass, CrmActivity, EffortIndicatorRule, EffortKind, EffortProfile, EffortRecord, EffortReview, EffortRule, Opportunity, PartnerOwnership, Proposal, SellerLink,
} from '../types/domain'

/* Rotina comercial por perfil: a régua do Book, as evidências de esforço e a conferência da supervisão.
 * Este arquivo só conhece o motor. O CRM (enterprise.ts) chama daqui para registrar o esforço. */

export const EFFORT_PROFILES: Record<EffortProfile, string> = { carteira: 'Carteira', abertura: 'Abertura de contas', canais: 'Canais' }
export const EFFORT_KINDS: Record<EffortKind, string> = { contact: 'Contato', meeting: 'Reunião', visit: 'Visita', proposal: 'Proposta enviada', repurchase: 'Recompra tratada' }
export const EFFORT_REVIEWS: Record<EffortReview, string> = { recorded: 'Registrada', pending: 'Em conferência', approved: 'Validada', returned: 'Devolvida' }

/** A semana é verde com 3 dos 4 indicadores cumpridos. A régua do Book pode mudar isto por perfil e vigência. */
export const DEFAULT_GREEN_AT = 3
/** Prazo, em dias corridos, para tratar uma recompra depois da data combinada. */
export const REPURCHASE_GRACE_DAYS = 7

const indicator = (id: string, label: string, description: string, target: number, unit: EffortIndicatorRule['unit'] = 'quantidade'): EffortIndicatorRule => ({ id, label, description, target, unit })

/**
 * Régua de partida de cada perfil. Os números são de demonstração: o Book entra pelo ambiente interno,
 * na versão aprovada, e a régua muda por perfil e vigência em `saveEffortRule`.
 */
export function defaultEffortRules(tenantId: string, since: string): EffortRule[] {
  const id = (profile: EffortProfile) => `ER-${tenantId}-${profile}-${since}`
  return [
    {
      id: id('carteira'), tenantId, profile: 'carteira', since, greenAt: DEFAULT_GREEN_AT,
      coverageDays: { A1: 14, A2: 30, B: 42 },
      indicators: [
        indicator('cobertura', 'Cobertura da carteira', 'Cada conta com contato dentro da cadência da sua classe: A1 em 14 dias, A2 em 30 e B em 42.', 1, 'percentual'),
        indicator('reunioes', 'Reuniões ou visitas', 'Conta depois de registrar participantes e resultado.', 2),
        indicator('propostas', 'Propostas enviadas', 'Conta por versão enviada com item e valor.', 12),
        indicator('recompras', 'Recompras atrasadas tratadas', 'Contato e próximo passo em até 7 dias corridos da data combinada.', 1, 'percentual'),
      ],
    },
    {
      id: id('abertura'), tenantId, profile: 'abertura', since, greenAt: DEFAULT_GREEN_AT, coverageDays: {},
      indicators: [
        indicator('contatos', 'Contatos com não clientes', 'Contatos com contas que ainda não compraram.', 40),
        indicator('reunioes', 'Reuniões de apresentação', 'Conta depois de registrar participantes e resultado.', 3),
        indicator('propostas', 'Propostas a não clientes', 'Envios da trilha de abertura.', 8),
        indicator('contas', 'Contas-alvo trabalhadas', 'Cada conta conta uma vez por semana.', 5),
      ],
    },
    {
      id: id('canais'), tenantId, profile: 'canais', since, greenAt: DEFAULT_GREEN_AT, coverageDays: {},
      indicators: [
        indicator('entregas', 'Entregas no prazo', 'Entrega até a data prometida.', 0.9, 'percentual'),
        indicator('respostas', 'Respostas ao marketplace', 'Resposta dentro do prazo do atendimento.', 0.95, 'percentual'),
        indicator('parceiros', 'Parceiros ativos tratados', 'A régua depende da classificação acordada e fica sem meta até lá.', 0),
        indicator('faturamento', 'Faturamento de canal no prazo', 'Nota autorizada até a data prometida para entrega.', 0.95, 'percentual'),
      ],
    },
  ]
}

/* ---------- Semana ---------- */

export interface EffortWeek { start: string; end: string; label: string }

const shortDate = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7)

/** Segunda a domingo. A data da interação decide em que semana o registro cai. */
export function weekOf(date: string): EffortWeek {
  const weekday = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7
  const start = addDays(date, -weekday)
  const end = addDays(start, 6)
  return { start, end, label: `${shortDate(start)} a ${shortDate(end)}` }
}

export function recentWeeks(count = 6, on = today()): EffortWeek[] {
  const current = weekOf(on)
  return Array.from({ length: count }, (_, index) => weekOf(addDays(current.start, -7 * index)))
}

const inWeek = (date: string | undefined, week: EffortWeek) => !!date && date >= week.start && date <= week.end

/* ---------- Vínculo e régua ---------- */

export function sellerLinkOf(state: Pick<ErpState, 'sellerLinks'>, tenantId: string, userId: string) {
  return state.sellerLinks.find(entry => entry.tenantId === tenantId && entry.userId === userId)
}

/** A régua vigente na semana: a mais recente com início até o fim dela. */
export function effortRuleFor(state: Pick<ErpState, 'effortRules'>, tenantId: string, profile: EffortProfile, on: string) {
  return state.effortRules
    .filter(entry => entry.tenantId === tenantId && entry.profile === profile && entry.since <= on)
    .sort((a, b) => b.since.localeCompare(a.since))[0]
}

export interface CrmViewer { userId: string; team: boolean; all: boolean }

/**
 * Quem o usuário enxerga. Comercial vê a própria carteira; supervisão, a equipe;
 * gestão, todos os vendedores das empresas autorizadas.
 */
export function sellersInScope(state: Pick<ErpState, 'sellerLinks'>, tenantIds: string[], viewer: CrmViewer) {
  return state.sellerLinks.filter(entry => tenantIds.includes(entry.tenantId)
    && (viewer.all || (viewer.team && entry.team) || entry.userId === viewer.userId))
}

export function canSeeSeller(state: Pick<ErpState, 'sellerLinks'>, tenantIds: string[], viewer: CrmViewer, ownerId: string) {
  return viewer.userId === ownerId || sellersInScope(state, tenantIds, viewer).some(entry => entry.userId === ownerId)
}

export function saveSellerLink(state: ErpState, input: Omit<SellerLink, 'id'> & { id?: string }, actor: string) {
  if (!state.users.some(entry => entry.id === input.userId)) throw new DomainError('Escolha a conta do vendedor')
  if (!(input.profile in EFFORT_PROFILES)) throw new DomainError('Escolha o perfil de esforço')
  if (!input.since) throw new DomainError('Informe o início da vigência')
  const current = state.sellerLinks.find(entry => entry.id === input.id || (entry.tenantId === input.tenantId && entry.userId === input.userId))
  if (current) {
    Object.assign(current, { profile: input.profile, team: input.team, since: input.since })
    log(state, 'CRM', actor, `Vínculo comercial atualizado: ${state.users.find(entry => entry.id === input.userId)?.name}`)
    return current
  }
  const link: SellerLink = { id: nextId(state, 'VC'), ...input }
  state.sellerLinks.push(link)
  log(state, 'CRM', actor, `Vínculo comercial criado: ${state.users.find(entry => entry.id === input.userId)?.name}`)
  return link
}

/** Nova régua para o perfil, com vigência. A anterior continua valendo para as semanas antes do início. */
export function saveEffortRule(state: ErpState, input: Pick<EffortRule, 'tenantId' | 'profile' | 'since' | 'indicators' | 'greenAt'> & { coverageDays?: EffortRule['coverageDays'] }, actor: string) {
  if (!input.since) throw new DomainError('Informe o início da vigência')
  if (input.indicators.length !== 4) throw new DomainError('A régua tem quatro indicadores')
  if (input.indicators.some(entry => !(entry.target >= 0) || (entry.unit === 'percentual' && entry.target > 1))) throw new DomainError('Meta de indicador inválida')
  if (!(input.greenAt >= 1 && input.greenAt <= 4)) throw new DomainError('A semana verde exige de 1 a 4 indicadores')
  const previous = effortRuleFor(state, input.tenantId, input.profile, input.since)
  const same = state.effortRules.find(entry => entry.tenantId === input.tenantId && entry.profile === input.profile && entry.since === input.since)
  const rule: EffortRule = {
    id: same?.id ?? nextId(state, 'ER'), tenantId: input.tenantId, profile: input.profile, since: input.since, greenAt: input.greenAt,
    indicators: input.indicators.map(entry => ({ ...entry })), coverageDays: { ...(input.coverageDays ?? previous?.coverageDays ?? {}) },
  }
  if (same) Object.assign(same, rule)
  else state.effortRules.push(rule)
  log(state, 'CRM', actor, `Régua de ${EFFORT_PROFILES[input.profile]} com vigência de ${input.since.split('-').reverse().join('/')}`)
  return rule
}

/* ---------- Evidências ---------- */

type RecordInput = Pick<EffortRecord, 'tenantId' | 'ownerId' | 'kind' | 'date' | 'note'> & Partial<Pick<EffortRecord, 'partnerId' | 'opportunityId' | 'activityId' | 'proposalId' | 'prospect' | 'targetAccount' | 'source' | 'review'>>

/** Grava a evidência. A mesma origem (`source`) nunca entra duas vezes. */
export function recordEffort(state: ErpState, input: RecordInput) {
  if (input.source) {
    const existing = state.effortRecords.find(entry => entry.source === input.source)
    if (existing) return existing
  }
  const record: EffortRecord = { id: nextId(state, 'EF'), review: 'recorded', history: [], ...input }
  state.effortRecords.push(record)
  return record
}

const ACTIVITY_EFFORT: Partial<Record<CrmActivity['type'], EffortKind>> = {
  Ligação: 'contact', 'E-mail': 'contact', Reunião: 'meeting', Visita: 'visit', Recompra: 'repurchase',
}

const isProspect = (state: ErpState, partnerId: string) => !state.salesOrders.some(entry => entry.customerId === partnerId)

/**
 * Atividade concluída vira evidência de esforço. Reunião e visita sem participantes
 * ficam em conferência e fora do placar até alguém validar.
 */
export function effortFromActivity(state: ErpState, opportunity: Opportunity, activity: CrmActivity) {
  const kind = ACTIVITY_EFFORT[activity.type]
  const date = activity.completedAt ?? activity.at.slice(0, 10)
  const ownerId = activity.ownerId ?? opportunity.ownerId
  if (!kind || !activity.done || !ownerId) return undefined
  const needsParticipants = kind === 'meeting' || kind === 'visit'
  const prospect = isProspect(state, opportunity.partnerId)
  return recordEffort(state, {
    tenantId: opportunity.tenantId ?? 'tenant-roboflex', ownerId, kind, date,
    note: activity.summary?.trim() || activity.details?.trim() || activity.text,
    partnerId: opportunity.partnerId, opportunityId: opportunity.id, activityId: activity.id, prospect, targetAccount: prospect,
    review: needsParticipants && !activity.participants?.trim() ? 'pending' : 'recorded',
    source: `${opportunity.id}:${activity.id}:done`,
  })
}

/** Reabrir a ação retira a evidência que ainda não foi validada. */
export function withdrawActivityEffort(state: ErpState, opportunityId: string, activityId: string) {
  state.effortRecords = state.effortRecords.filter(entry => !(entry.source === `${opportunityId}:${activityId}:done` && entry.review !== 'approved'))
}

export function effortFromProposalSent(state: ErpState, opportunity: Opportunity, proposal: Proposal) {
  const prospect = isProspect(state, opportunity.partnerId)
  return recordEffort(state, {
    tenantId: opportunity.tenantId ?? 'tenant-roboflex', ownerId: opportunity.ownerId, kind: 'proposal', date: today(),
    note: `${proposal.id} · versão ${proposal.version ?? 1} · envio registrado.`,
    partnerId: opportunity.partnerId, opportunityId: opportunity.id, proposalId: proposal.id, prospect, targetAccount: prospect,
    source: `${proposal.id}:sent`,
  })
}

/** Supervisão valida ou devolve. Devolver exige motivo. Ninguém confere o próprio registro. */
export function reviewEffort(state: ErpState, id: string, decision: 'validate' | 'return', reason: string, reviewerUserId: string, actor: string) {
  const record = state.effortRecords.find(entry => entry.id === id)
  if (!record) throw new DomainError('Registro de esforço não encontrado')
  if (record.ownerId === reviewerUserId) throw new DomainError('Quem fez o registro não o confere')
  if (record.review === 'returned') throw new DomainError('O registro devolvido aguarda a correção do vendedor')
  const to: EffortReview = decision === 'validate' ? 'approved' : 'returned'
  if (decision === 'validate' && record.review === 'approved') throw new DomainError('O registro já está validado')
  if (decision === 'return' && !reason.trim()) throw new DomainError('Informe o motivo da devolução')
  record.history.push({ at: now(), actor, from: record.review, to, reason: reason.trim() || undefined })
  record.review = to
  record.reason = decision === 'return' ? reason.trim() : undefined
  log(state, 'CRM', actor, `Esforço ${record.id} ${decision === 'validate' ? 'validado' : `devolvido: ${reason.trim()}`}`, undefined, record.opportunityId)
  return record
}

/** O vendedor corrige o que foi devolvido; o registro volta para conferência. */
export function correctEffort(state: ErpState, id: string, note: string, userId: string, actor: string) {
  const record = state.effortRecords.find(entry => entry.id === id)
  if (!record) throw new DomainError('Registro de esforço não encontrado')
  if (record.ownerId !== userId) throw new DomainError('Só o vendedor do registro o corrige')
  if (record.review !== 'returned') throw new DomainError('Só o registro devolvido é corrigido')
  if (!note.trim()) throw new DomainError('Informe o registro corrigido')
  record.history.push({ at: now(), actor, from: 'returned', to: 'pending' })
  record.review = 'pending'
  record.note = note.trim()
  log(state, 'CRM', actor, `Esforço ${record.id} corrigido e reenviado para conferência`, undefined, record.opportunityId)
  return record
}

/** Só entra no placar o que está registrado ou validado, e com texto. */
export const countsForScore = (entry: EffortRecord) => (entry.review === 'recorded' || entry.review === 'approved') && !!entry.note.trim()

/* ---------- Placar ---------- */

export interface EffortReading {
  id: string
  label: string
  description: string
  target: string
  value: string
  basis?: string
  hit: boolean
  /** Falso quando não há base para aferir (sem casos, ou meta ainda não calibrada). */
  scored: boolean
}

export interface EffortSnapshot {
  link: SellerLink
  week: EffortWeek
  indicators: EffortReading[]
  records: EffortRecord[]
  /** Indicadores cumpridos. Nulo enquanto não há base nenhuma na semana. */
  score: number | null
  measured: number
  green: boolean
  greenAt: number
  pending: number
  returned: number
}

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`
const dateOf = (iso: string | undefined) => iso?.slice(0, 10)

export const currentOwnerOf = (partner: { ownerHistory?: PartnerOwnership[] }) => partner.ownerHistory?.find(entry => !entry.until)?.ownerId

export function effortSnapshot(state: ErpState, link: SellerLink, week: EffortWeek): EffortSnapshot {
  const rule = effortRuleFor(state, link.tenantId, link.profile, week.end) ?? defaultEffortRules(link.tenantId, week.start).find(entry => entry.profile === link.profile)!
  const mine = state.effortRecords.filter(entry => entry.ownerId === link.userId && entry.tenantId === link.tenantId)
  const records = mine.filter(entry => inWeek(entry.date, week))
  const valid = records.filter(countsForScore)
  const count = (kind: EffortKind, list = valid) => list.filter(entry => entry.kind === kind).length
  const rules = new Map(rule.indicators.map(entry => [entry.id, entry]))
  const readings: EffortReading[] = []

  const threshold = (id: string, value: number, basis = '', description?: string) => {
    const base = rules.get(id)!
    readings.push({ id, label: base.label, description: description ?? base.description, target: String(base.target), value: String(value), basis, hit: value >= base.target, scored: true })
  }
  const level = (id: string, covered: number, eligible: number, basis: string, description?: string) => {
    const base = rules.get(id)!
    const ratio = eligible ? covered / eligible : null
    readings.push({
      id, label: base.label, description: description ?? base.description, target: pct(base.target), value: ratio === null ? 'Sem casos' : pct(ratio),
      basis: eligible ? basis : '', hit: ratio !== null && ratio >= base.target, scored: eligible > 0,
    })
  }

  if (link.profile === 'carteira') {
    const days = rule.coverageDays
    const accounts = state.partners.filter(entry => entry.roles.includes('Cliente') && entry.status === 'Ativo' && currentOwnerOf(entry) === link.userId && !!entry.commercialClass && days[entry.commercialClass as CommercialClass] !== undefined)
    const touches = mine.filter(entry => countsForScore(entry) && ['contact', 'meeting', 'visit', 'repurchase'].includes(entry.kind) && entry.date <= week.end)
    const gaps = accounts.filter(account => !touches.some(entry => entry.partnerId === account.id && entry.date >= addDays(week.end, -days[account.commercialClass as CommercialClass]!)))
    level('cobertura', accounts.length - gaps.length, accounts.length, `${accounts.length - gaps.length} de ${accounts.length} contas cobertas`,
      gaps.length ? `${rules.get('cobertura')!.description} Faltam: ${gaps.map(entry => entry.name).join(', ')}.` : undefined)
    threshold('reunioes', count('meeting') + count('visit'))
    threshold('propostas', count('proposal'))
    const due = state.opportunities.flatMap(opportunity => opportunity.activities
      .filter(activity => activity.type === 'Recompra' && (activity.ownerId ?? opportunity.ownerId) === link.userId && inWeek(dateOf(activity.at), week))
      .map(activity => ({ opportunity, activity })))
    const treated = due.filter(({ activity }) => activity.done && !!activity.completedAt && activity.completedAt <= addDays(dateOf(activity.at)!, REPURCHASE_GRACE_DAYS)).length
    level('recompras', treated, due.length, `${treated} de ${due.length} tratadas no prazo`)
  } else if (link.profile === 'abertura') {
    const target = valid.filter(entry => entry.prospect && entry.targetAccount)
    const touched = new Set(target.filter(entry => ['contact', 'meeting', 'visit'].includes(entry.kind)).map(entry => entry.partnerId).filter(Boolean))
    threshold('contatos', count('contact', target))
    threshold('reunioes', count('meeting', target))
    threshold('propostas', count('proposal', target))
    threshold('contas', touched.size)
  } else {
    const cases = state.channelCases.filter(entry => entry.tenantId === link.tenantId && entry.handlerId === link.userId)
    const orders = state.salesOrders.filter(order => (order.channel ?? 'Direto') !== 'Direto' && !order.cancelledAt
      && (cases.some(entry => entry.salesOrderId === order.id) || order.accountOwnerId === link.userId))
    const dueOrders = orders.filter(order => inWeek(order.promisedDate, week))
    const delivered = dueOrders.filter(order => dateOf(order.shipment?.deliveredAt) && dateOf(order.shipment?.deliveredAt)! <= order.promisedDate).length
    level('entregas', delivered, dueOrders.length, `${delivered} de ${dueOrders.length} no prazo`)
    const dueCases = cases.filter(entry => entry.channel === 'Mercado Livre' && inWeek(entry.deadline, week))
    const answered = dueCases.filter(entry => entry.answeredAt && entry.answeredAt <= entry.deadline).length
    level('respostas', answered, dueCases.length, `${answered} de ${dueCases.length} no prazo`)
    const partners = new Set(valid.filter(entry => ['contact', 'meeting', 'visit', 'repurchase'].includes(entry.kind)).map(entry => entry.partnerId).filter(Boolean))
    const partnersRule = rules.get('parceiros')!
    readings.push({
      id: 'parceiros', label: partnersRule.label, description: partnersRule.description, target: partnersRule.target > 0 ? String(partnersRule.target) : 'A calibrar',
      value: String(partners.size), hit: partnersRule.target > 0 && partners.size >= partnersRule.target, scored: partnersRule.target > 0,
    })
    const billable = dueOrders
    const onTimeBills = billable.filter(order => state.saleInvoices.some(note => note.salesOrderId === order.id && note.status === 'Autorizada' && note.issuedAt <= order.promisedDate)).length
    level('faturamento', onTimeBills, billable.length, `${onTimeBills} de ${billable.length} faturados no prazo`)
  }

  const ordered = rule.indicators.map(entry => readings.find(reading => reading.id === entry.id)!)
  const hits = ordered.filter(entry => entry.hit).length
  const measured = ordered.filter(entry => entry.scored).length
  const hasBase = records.length > 0 || ordered.some(entry => entry.basis)
  return {
    link, week, indicators: ordered, records, score: hasBase ? hits : null, measured, green: hasBase && hits >= rule.greenAt, greenAt: rule.greenAt,
    pending: records.filter(entry => entry.review === 'pending').length, returned: records.filter(entry => entry.review === 'returned').length,
  }
}
