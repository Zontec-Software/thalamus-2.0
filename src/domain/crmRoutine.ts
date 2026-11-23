import { currentOwnerOf, effortFromActivity } from './crmEffort'
import type { ErpState } from './engine'
import { DomainError, addDays, log, nextId, today } from './engine'
import { funnelOf, opportunityIsOpen, opportunityIsWon } from './enterprise'
import type {
  ActivityProvider, ActivityReference, ChannelCase, CommercialClass, CrmActivity, InvoiceUnit, Opportunity, SaleInvoice, SalesChannel, SalesGoal,
} from '../types/domain'

/* Faturamento por competência, carteira, canais e registro via ChatGPT (MCP).
 * Notas fiscais são simuladas: o Omie é dono da nota. Aqui só se lê e se apura. */

/* ---------- Faturamento por competência ---------- */

export const INVOICE_UNITS: InvoiceUnit[] = ['MRR', 'Implantação', 'Venda avulsa']

export type ExclusionReason = 'Duplicada' | 'Cancelada' | 'Devolvida' | 'Intercompany' | 'Sem conciliação' | 'Após a data de corte'

const monthEnd = (month: string) => {
  const [year, number] = month.split('-').map(Number)
  return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, '0')}`
}

/** Mês de 0 a 11 da meta. Sem os doze valores, o ano vale um doze avos por mês. */
export const goalForMonth = (goal: Pick<SalesGoal, 'amount' | 'monthlyAmounts'>, monthIndex: number) =>
  goal.monthlyAmounts?.length === 12 ? goal.monthlyAmounts[monthIndex] ?? 0 : goal.amount / 12

export interface BillingMonth {
  month: string
  /** Meta da versão aprovada. Nula enquanto nenhuma meta do recorte foi aprovada. */
  goal: number | null
  goalApproved: boolean
  /** Soma das notas elegíveis. Nula quando falta conciliação: isso não é zero. */
  actual: number | null
  ratio: number | null
  gap: number | null
  /** Até quando a competência recebe nota. */
  asOf: string
  reconciliation: 'conciliado' | 'parcial' | 'sem conciliação'
  units: Record<InvoiceUnit, number>
  eligible: SaleInvoice[]
  excluded: { note: SaleInvoice; reason: ExclusionReason }[]
}

/**
 * Nota que sustenta o faturado: autorizada, conciliada, sem intercompany, uma vez por identidade fiscal
 * (empresa + chave) e emitida até a data de corte. Cancelada, devolvida e duplicada ficam de fora.
 */
export function classifyInvoices(state: Pick<ErpState, 'saleInvoices'>, tenantIds: string[], month: string, asOf: string, ownerIds?: string[]) {
  const seen = new Set<string>()
  const eligible: SaleInvoice[] = []
  const excluded: BillingMonth['excluded'] = []
  const notes = state.saleInvoices
    .filter(note => tenantIds.includes(note.tenantId) && note.issuedAt.startsWith(month) && (!ownerIds || (!!note.ownerId && ownerIds.includes(note.ownerId))))
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id))
  for (const note of notes) {
    const identity = `${note.tenantId}:${note.fiscalKey}`
    const reason: ExclusionReason | undefined = note.status === 'Cancelada' ? 'Cancelada' : note.status === 'Devolvida' ? 'Devolvida'
      : note.intercompany ? 'Intercompany' : !note.reconciled ? 'Sem conciliação' : note.issuedAt > asOf ? 'Após a data de corte' : seen.has(identity) ? 'Duplicada' : undefined
    if (reason) excluded.push({ note, reason })
    else {
      seen.add(identity)
      eligible.push(note)
    }
  }
  return { eligible, excluded }
}

export function billingForMonth(state: ErpState, tenantIds: string[], month: string, ownerIds?: string[], on = today()): BillingMonth {
  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5, 7)) - 1
  const goals = state.salesGoals.filter(entry => tenantIds.includes(entry.tenantId) && entry.year === year)
  const approved = goals.filter(entry => !!entry.approvedBy)
  const cutoffDay = Math.min(...approved.map(entry => entry.cutoffDay ?? 31), 31)
  const end = monthEnd(month)
  const cutoff = `${month}-${String(Math.min(cutoffDay, Number(end.slice(8, 10)))).padStart(2, '0')}`
  const asOf = cutoff < on ? cutoff : on
  const { eligible, excluded } = classifyInvoices(state, tenantIds, month, asOf, ownerIds)
  const everything = state.saleInvoices.filter(note => tenantIds.includes(note.tenantId) && note.issuedAt.startsWith(month) && (!ownerIds || (!!note.ownerId && ownerIds.includes(note.ownerId))))
  const reconciled = everything.filter(note => note.reconciled)
  const reconciliation: BillingMonth['reconciliation'] = !everything.length || !reconciled.length ? 'sem conciliação'
    : reconciled.length < everything.length ? 'parcial' : 'conciliado'
  const goal = approved.length ? approved.reduce((sum, entry) => sum + goalForMonth(entry, monthIndex), 0) : null
  const actual = reconciliation === 'sem conciliação' ? null : eligible.reduce((sum, note) => sum + note.amount, 0)
  const units = Object.fromEntries(INVOICE_UNITS.map(unit => [unit, eligible.filter(note => note.unit === unit).reduce((sum, note) => sum + note.amount, 0)])) as Record<InvoiceUnit, number>
  return {
    month, goal, goalApproved: approved.length > 0 && approved.length === goals.length, actual,
    ratio: goal && actual !== null ? actual / goal : null, gap: goal !== null && actual !== null ? Math.max(0, goal - actual) : null,
    asOf, reconciliation, units, eligible, excluded,
  }
}

export interface Conquests { count: number; mrr: number; setup: number; oneOff: number }

/** Conquista é o aceite, não a nota. Implantação, mensalidade e venda avulsa têm unidade própria. */
export function conquestsIn(state: Pick<ErpState, 'opportunities'>, tenantIds: string[], period: string, ownerIds?: string[]): Conquests {
  const won = state.opportunities.filter(entry => opportunityIsWon(entry) && !!entry.wonAt?.startsWith(period)
    && (!entry.tenantId || tenantIds.includes(entry.tenantId)) && (!ownerIds || ownerIds.includes(entry.ownerId)))
  return won.reduce<Conquests>((total, entry) => {
    if (funnelOf(entry) === 'Soluções') return { ...total, count: total.count + 1, mrr: total.mrr + (entry.mrr ?? 0), setup: total.setup + entry.value }
    return { ...total, count: total.count + 1, oneOff: total.oneOff + entry.value }
  }, { count: 0, mrr: 0, setup: 0, oneOff: 0 })
}

/* ---------- Carteira e triagem ---------- */

export const COMMERCIAL_CLASSES: CommercialClass[] = ['A1', 'A2', 'B', 'C1', 'C2', 'A classificar']

/** Cliente ativo sem responsável vigente. A supervisão faz a triagem. */
export function partnersWithoutOwner(state: Pick<ErpState, 'partners'>) {
  return state.partners.filter(entry => entry.status === 'Ativo' && entry.roles.includes('Cliente') && !currentOwnerOf(entry))
}

/** O responsável muda por vigência: a anterior termina na véspera e a história fica. */
export function assignPartnerOwner(state: ErpState, partnerId: string, ownerId: string, since: string, actor: string) {
  const partner = state.partners.find(entry => entry.id === partnerId)
  if (!partner) throw new DomainError('Parceiro não encontrado')
  if (!state.sellerLinks.some(entry => entry.userId === ownerId)) throw new DomainError('O responsável precisa ter vínculo comercial')
  if (!since) throw new DomainError('Informe o início da vigência')
  const history = partner.ownerHistory ??= []
  const current = history.find(entry => !entry.until)
  if (current?.ownerId === ownerId) throw new DomainError('Este já é o responsável vigente')
  if (current && since <= current.since) throw new DomainError('A nova vigência começa depois da atual')
  if (current) current.until = addDays(since, -1)
  history.push({ ownerId, since, by: actor })
  log(state, 'CRM', actor, `${partner.name}: responsável ${state.users.find(entry => entry.id === ownerId)?.name} desde ${since.split('-').reverse().join('/')}`, undefined, partner.id)
  return partner
}

export function setCommercialClass(state: ErpState, partnerId: string, commercialClass: CommercialClass, actor: string) {
  const partner = state.partners.find(entry => entry.id === partnerId)
  if (!partner) throw new DomainError('Parceiro não encontrado')
  if (!COMMERCIAL_CLASSES.includes(commercialClass)) throw new DomainError('Classe comercial inválida')
  partner.commercialClass = commercialClass
  log(state, 'CRM', actor, `${partner.name}: classe comercial ${commercialClass}`, undefined, partner.id)
  return partner
}

/* ---------- Canais ---------- */

export const CHANNEL_CASE_CHANNELS: ChannelCase['channel'][] = ['Mercado Livre', 'Integrador', 'Revenda']

export const channelOf = (order: { channel?: SalesChannel }): SalesChannel => order.channel ?? 'Direto'

/** Atendimento de canal. Liga cliente, canal e pedido sem trocar o dono da conta. */
export function createChannelCase(
  state: ErpState,
  input: Pick<ChannelCase, 'tenantId' | 'channel' | 'partnerId' | 'externalId' | 'subject' | 'handlerId' | 'deadline'> & { salesOrderId?: string },
  actor: string,
) {
  const partner = state.partners.find(entry => entry.id === input.partnerId)
  if (!partner) throw new DomainError('Escolha o cliente ou parceiro')
  if (!CHANNEL_CASE_CHANNELS.includes(input.channel)) throw new DomainError('Escolha o canal')
  if (!input.externalId.trim() || !input.subject.trim()) throw new DomainError('Informe o identificador do canal e o assunto')
  if (!input.deadline || input.deadline < today()) throw new DomainError('O prazo de resposta não pode estar no passado')
  if (state.channelCases.some(entry => entry.tenantId === input.tenantId && entry.channel === input.channel && entry.externalId === input.externalId.trim())) {
    throw new DomainError('Já existe atendimento para este identificador neste canal')
  }
  const record: ChannelCase = {
    id: nextId(state, 'AT-CAN'), tenantId: input.tenantId, channel: input.channel, partnerId: partner.id, externalId: input.externalId.trim(),
    subject: input.subject.trim(), handlerId: input.handlerId, arrivedAt: today(), deadline: input.deadline,
  }
  state.channelCases.unshift(record)
  if (input.salesOrderId) linkChannelOrder(state, record.id, input.salesOrderId, actor)
  log(state, 'CRM', actor, `Atendimento ${record.id} em ${record.channel}: ${record.subject}`, input.salesOrderId, partner.id)
  return record
}

/** O pedido precisa ser do mesmo cliente e do mesmo canal. O dono da conta é preservado. */
export function linkChannelOrder(state: ErpState, caseId: string, orderId: string, actor: string) {
  const record = state.channelCases.find(entry => entry.id === caseId)
  if (!record) throw new DomainError('Atendimento não encontrado')
  const order = state.salesOrders.find(entry => entry.id === orderId)
  if (!order) throw new DomainError('Pedido não encontrado')
  if (order.customerId !== record.partnerId) throw new DomainError('O pedido é de outro cliente')
  if (channelOf(order) !== record.channel) throw new DomainError(`O pedido é do canal ${channelOf(order)}, não de ${record.channel}`)
  const partner = state.partners.find(entry => entry.id === record.partnerId)
  record.salesOrderId = order.id
  order.externalKey ??= record.externalId
  order.accountOwnerId ??= partner ? currentOwnerOf(partner) : undefined
  log(state, 'CRM', actor, `Atendimento ${record.id} ligado ao pedido ${order.id}`, order.id)
  return record
}

export function answerChannelCase(state: ErpState, id: string, answer: string, actor: string) {
  const record = state.channelCases.find(entry => entry.id === id)
  if (!record) throw new DomainError('Atendimento não encontrado')
  if (record.answeredAt) throw new DomainError('Este atendimento já foi respondido')
  if (!answer.trim()) throw new DomainError('Registre a resposta para concluir o atendimento')
  record.answer = answer.trim()
  record.answeredAt = today()
  log(state, 'CRM', actor, `Atendimento ${record.id} respondido`, record.salesOrderId, record.partnerId)
  return record
}

export const channelCaseStatus = (record: ChannelCase, on = today()) => record.answeredAt ? 'Respondido' : record.deadline < on ? 'Vencido' : 'Aberto'

/* ---------- Registro via ChatGPT (MCP) ---------- */

export interface McpActivityInput {
  opportunityId: string
  /** Tarefa a concluir. Sem ela, nasce um registro novo já concluído. */
  activityId?: string
  type: CrmActivity['type']
  /** Dia efetivo da interação. */
  occurredOn: string
  occurredTime?: string
  title?: string
  participants?: string
  summary: string
  references?: ActivityReference[]
  next?: { title: string; dueOn: string }
  /** Repetir o comando com a mesma chave devolve o mesmo registro. */
  idempotencyKey: string
}

export const MCP_ACTOR = 'ChatGPT via MCP'
export const PROVIDER_NAMES: Record<ActivityProvider, string> = { agenda: 'Google Agenda', meet: 'Google Meet' }

const isoOf = (day: string, time?: string) => `${day}T${time ?? '09:00'}:00.000Z`

/**
 * Grava a interação que o vendedor ditou ao ChatGPT. Aplica as regras da ficha: oportunidade aberta, data que já
 * aconteceu, participantes em reunião e visita. Repetir a gravação reaproveita o registro (mesma chave, ou mesma
 * fonte do mesmo vendedor). Concluir uma tarefa preserva o prazo e os anexos.
 */
export function registerActivityViaMcp(state: ErpState, input: McpActivityInput, actor: string) {
  const opportunity = state.opportunities.find(entry => entry.id === input.opportunityId)
  if (!opportunity) throw new DomainError('Oportunidade não encontrada')
  if (!input.idempotencyKey.trim()) throw new DomainError('A gravação precisa de uma chave de idempotência')
  const known = findMcpRecord(state, opportunity.ownerId, input)
  if (known) return { activity: known.activity, opportunity: known.opportunity, reused: true }
  if (!opportunityIsOpen(opportunity)) throw new DomainError('Oportunidade encerrada não recebe registro')
  if (!input.occurredOn || input.occurredOn > today()) throw new DomainError('Informe a data efetiva, que já aconteceu')
  if (!input.summary.trim()) throw new DomainError('Informe o resumo e o resultado')
  if ((input.type === 'Reunião' || input.type === 'Visita') && !input.participants?.trim()) throw new DomainError('Confirme os participantes antes de gravar')
  if (input.next && (!input.next.title.trim() || !input.next.dueOn)) throw new DomainError('A próxima ação precisa de título e prazo')

  let activity: CrmActivity
  if (input.activityId) {
    const task = opportunity.activities.find(entry => entry.id === input.activityId)
    if (!task) throw new DomainError('Tarefa não encontrada na oportunidade')
    if (task.done) throw new DomainError('A tarefa já foi concluída')
    activity = task
  } else {
    activity = {
      id: nextId(state, 'ACT'), at: isoOf(input.occurredOn, input.occurredTime), type: input.type, text: input.title?.trim() || `${input.type} registrada`,
      done: false, createdBy: `${MCP_ACTOR} · ${actor}`, ownerId: opportunity.ownerId,
    }
    opportunity.activities.unshift(activity)
  }
  Object.assign(activity, {
    done: true, completedAt: input.occurredOn, registeredAt: today(), summary: input.summary.trim(), origin: 'mcp', idempotencyKey: input.idempotencyKey.trim(),
    participants: input.participants?.trim() || undefined, references: [...(activity.references ?? []), ...(input.references ?? [])],
  } satisfies Partial<CrmActivity>)
  if (input.next) {
    const next: CrmActivity = {
      id: nextId(state, 'ACT'), at: isoOf(input.next.dueOn), type: 'Tarefa', text: input.next.title.trim(), done: false,
      createdBy: `${MCP_ACTOR} · ${actor}`, origin: 'mcp', registeredAt: today(), ownerId: opportunity.ownerId,
    }
    opportunity.activities.unshift(next)
    activity.nextActivityId = next.id
  }
  const pending = opportunity.activities.filter(entry => !entry.done).sort((a, b) => a.at.localeCompare(b.at))[0]
  opportunity.nextAction = pending?.text ?? 'Definir próxima ação'
  effortFromActivity(state, opportunity, activity)
  const sources = (input.references ?? []).map(entry => PROVIDER_NAMES[entry.provider]).join(' e ')
  log(state, 'CRM', `${MCP_ACTOR} · ${actor}`, `${activity.type} registrada${sources ? ` com fontes do ${sources}` : ''}: ${activity.text}`, undefined, opportunity.id)
  return { activity, opportunity, reused: false }
}

/** Mesma chave de idempotência, ou mesma fonte (provedor e identificador) do mesmo vendedor. */
function findMcpRecord(state: ErpState, ownerId: string, input: McpActivityInput) {
  for (const opportunity of state.opportunities) {
    for (const activity of opportunity.activities) {
      if (activity.origin !== 'mcp') continue
      const sameKey = activity.idempotencyKey === input.idempotencyKey.trim()
      const sameSource = (activity.ownerId ?? opportunity.ownerId) === ownerId
        && (input.references ?? []).some(wanted => activity.references?.some(entry => entry.provider === wanted.provider && entry.externalId === wanted.externalId))
      if (sameKey || sameSource) return { activity, opportunity }
    }
  }
  return undefined
}

/** Para a tela: a oportunidade e a data do registro de origem MCP, mais recentes primeiro. */
export const mcpRecords = (opportunities: Opportunity[]) => opportunities.flatMap(entry => entry.activities.filter(activity => activity.origin === 'mcp' && activity.done).map(activity => ({ opportunity: entry, activity })))
