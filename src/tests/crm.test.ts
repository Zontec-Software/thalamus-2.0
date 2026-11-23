import { describe, expect, it } from 'vitest'
import { createSeedState } from '../mocks/seed'
import { addDays, today } from '../domain/engine'
import type { ErpState } from '../domain/engine'
import { profileCan, seededProfiles } from '../domain/access'
import {
  addActivity, addActivityAttachment, advanceProposal, approveSalesGoal, completeActivity, createOpportunity, createProposal, moveOpportunity,
  saveDiscovery, setSalesGoal, startImplementation, toggleActivity, updateProposal, addProposalLine, opportunityIsOpen,
} from '../domain/enterprise'
import {
  correctEffort, effortSnapshot, recentWeeks, recordEffort, reviewEffort, saveEffortRule, sellersInScope, countsForScore, weekOf, defaultEffortRules,
} from '../domain/crmEffort'
import {
  answerChannelCase, assignPartnerOwner, billingForMonth, conquestsIn, createChannelCase, linkChannelOrder, partnersWithoutOwner, registerActivityViaMcp,
} from '../domain/crmRoutine'
import { migrateLegacyOpportunity } from '../domain/crmMigration'
import { DomainError } from '../domain/engine'

const input = { value: 50000, expectedClose: '2027-03-30', source: 'Feira', nextAction: 'Ligar' }
const prevMonth = () => {
  const [year, month] = today().slice(0, 7).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
const zontecOpportunity = (state: ErpState, solutionIds = ['Laundry']) => createOpportunity(state, {
  ...input, tenantId: 'tenant-roboflex-sul', partnerId: 'c4', title: 'Laundry do hotel', ownerId: 'u23', funnel: 'Soluções', solutionIds,
}, 'Mateus Barros')

describe('acesso e supervisão', () => {
  it('só a supervisão e a gestão revisam, validam e aprovam; o vendedor não', () => {
    const profiles = seededProfiles()
    const by = (name: string) => profiles.find(entry => entry.name === name)
    for (const feature of ['crm.equipe.consultar', 'crm.evidencia.revisar', 'crm.regua.gerir', 'crm.meta.aprovar', 'crm.carteira.gerir'] as const) {
      expect(profileCan(by('Supervisão comercial'), feature)).toBe(true)
      expect(profileCan(by('Gestor'), feature)).toBe(true)
      expect(profileCan(by('Comercial'), feature)).toBe(false)
    }
  })

  it('o vendedor enxerga só a própria carteira; a supervisão, a equipe', () => {
    const state = createSeedState()
    const own = sellersInScope(state, ['tenant-roboflex'], { userId: 'u12', team: false, all: false })
    expect(own.map(entry => entry.userId)).toEqual(['u12'])
    const team = sellersInScope(state, ['tenant-roboflex'], { userId: 'u20', team: true, all: false })
    expect(team.map(entry => entry.userId).sort()).toEqual(['u12', 'u21', 'u22'])
    expect(team.some(entry => entry.tenantId === 'tenant-roboflex-sul')).toBe(false)
  })

  it('pendente e devolvida ficam fora do placar; validada entra; ninguém revisa o próprio registro', () => {
    const state = createSeedState()
    const week = weekOf(today())
    const link = state.sellerLinks.find(entry => entry.userId === 'u21')!
    state.effortRecords = []
    const make = (review: 'recorded' | 'pending', note = 'Contato com a gerência de compras.') => recordEffort(state, {
      tenantId: link.tenantId, ownerId: 'u21', kind: 'contact', date: today(), note, partnerId: 'c7', prospect: true, targetAccount: true, review, source: `t:${state.effortRecords.length}`,
    })
    const pending = make('pending')
    make('recorded')
    const reading = () => effortSnapshot(state, link, week).indicators.find(entry => entry.id === 'contatos')!.value
    expect(reading()).toBe('1')
    expect(countsForScore(pending)).toBe(false)

    expect(() => reviewEffort(state, pending.id, 'validate', '', 'u21', 'Tiago Rocha')).toThrow(/não o confere/)
    expect(() => reviewEffort(state, pending.id, 'return', '  ', 'u20', 'Roberto Pires')).toThrow(/motivo/)
    reviewEffort(state, pending.id, 'validate', '', 'u20', 'Roberto Pires')
    expect(reading()).toBe('2')

    const second = make('pending', 'Segundo contato.')
    reviewEffort(state, second.id, 'return', 'Faltou o resultado do contato.', 'u20', 'Roberto Pires')
    expect(second).toMatchObject({ review: 'returned', reason: 'Faltou o resultado do contato.' })
    expect(reading()).toBe('2')
    expect(() => correctEffort(state, second.id, 'Corrigido', 'u12', 'Camila Nunes')).toThrow(/Só o vendedor/)
    correctEffort(state, second.id, 'Cliente pediu orçamento para 20 unidades.', 'u21', 'Tiago Rocha')
    expect(second.review).toBe('pending')
    expect(second.history.map(step => step.to)).toEqual(['returned', 'pending'])
  })

  it('a data da interação, e não a do registro, define a semana', () => {
    const state = createSeedState()
    state.effortRecords = []
    const old = addDays(today(), -14)
    recordEffort(state, { tenantId: 'tenant-roboflex', ownerId: 'u21', kind: 'contact', date: old, note: 'Contato antigo registrado hoje.', partnerId: 'c7', prospect: true, targetAccount: true })
    const link = state.sellerLinks.find(entry => entry.userId === 'u21')!
    expect(effortSnapshot(state, link, weekOf(today())).records).toHaveLength(0)
    expect(effortSnapshot(state, link, weekOf(old)).records).toHaveLength(1)
  })

  it('semana verde exige 3 de 4 indicadores e a régua muda por vigência', () => {
    const state = createSeedState()
    const link = state.sellerLinks.find(entry => entry.userId === 'u21')!
    const [, lastWeek] = recentWeeks(2)
    const snapshot = effortSnapshot(state, link, lastWeek)
    expect(snapshot.indicators.filter(entry => entry.hit).map(entry => entry.id)).toEqual(['contatos', 'reunioes', 'propostas'])
    expect(snapshot).toMatchObject({ score: 3, green: true })

    const rule = defaultEffortRules(link.tenantId, today()).find(entry => entry.profile === 'abertura')!
    const stricter = rule.indicators.map(entry => entry.id === 'contatos' ? { ...entry, target: 60 } : entry)
    saveEffortRule(state, { tenantId: link.tenantId, profile: 'abertura', since: today(), indicators: stricter, greenAt: 3 }, 'Roberto Pires')
    expect(effortSnapshot(state, link, lastWeek).green).toBe(true)
    const nextWeek = weekOf(addDays(today(), 7))
    expect(effortSnapshot(state, link, nextWeek).indicators.find(entry => entry.id === 'contatos')!.target).toBe('60')
    expect(() => saveEffortRule(state, { tenantId: link.tenantId, profile: 'abertura', since: today(), indicators: stricter.slice(0, 3), greenAt: 3 }, 'Roberto Pires')).toThrow(/quatro/)
  })

  it('a carteira sem cobertura mostra as contas que faltam', () => {
    const state = createSeedState()
    const link = state.sellerLinks.find(entry => entry.userId === 'u12')!
    const coverage = effortSnapshot(state, link, weekOf(today())).indicators.find(entry => entry.id === 'cobertura')!
    expect(coverage.hit).toBe(false)
    expect(coverage.description).toContain('Agro Vale Verde')
  })
})

describe('duas trilhas', () => {
  it('Soluções começa em Prospecção e exige solução do catálogo', () => {
    const state = createSeedState()
    expect(() => createOpportunity(state, { ...input, tenantId: 'tenant-roboflex-sul', partnerId: 'c4', title: 'Sem solução', ownerId: 'u23', funnel: 'Soluções' }, 'Mateus')).toThrow(/solução/)
    expect(() => zontecOpportunity(state, ['Outra coisa'])).toThrow(/catálogo/)
    const opportunity = zontecOpportunity(state)
    expect(opportunity).toMatchObject({ stage: 'Prospecção', funnel: 'Soluções', dealType: 'Recorrente', solutionIds: ['Laundry'] })
    expect(() => moveOpportunity(state, opportunity.id, 'Levantamento', 'Mateus')).toThrow(/não é fase da trilha/)
  })

  it('o Discovery barra o avanço até ter dor, decisor, linha de base e sucesso', () => {
    const state = createSeedState()
    const opportunity = zontecOpportunity(state)
    moveOpportunity(state, opportunity.id, 'Discovery', 'Mateus')
    expect(() => moveOpportunity(state, opportunity.id, 'Cálculo de custo', 'Mateus')).toThrow(/Discovery/)
    saveDiscovery(state, opportunity.id, { pain: 'Perda de enxoval', decider: 'Gerência', baseline: '8% de perda', success: 'Perda abaixo de 3%' }, undefined, 'Mateus')
    expect(moveOpportunity(state, opportunity.id, 'Cálculo de custo', 'Mateus').stage).toBe('Cálculo de custo')
    expect(() => moveOpportunity(state, opportunity.id, 'Conquistado', 'Mateus')).toThrow()
    expect(() => moveOpportunity(state, opportunity.id, 'Implantação', 'Mateus')).toThrow()
  })

  it('aceitar a proposta da Zontec não gera pedido; habilita a implantação, uma só vez', () => {
    const state = createSeedState()
    const opportunity = zontecOpportunity(state)
    expect(() => createProposal(state, opportunity.id, 'Mateus')).toThrow(/Discovery/)
    saveDiscovery(state, opportunity.id, { pain: 'Perda de enxoval', decider: 'Gerência', baseline: '8%', success: 'Abaixo de 3%' }, undefined, 'Mateus')
    const proposal = createProposal(state, opportunity.id, 'Mateus')
    expect(proposal.lines).toHaveLength(1)
    updateProposal(state, proposal.id, { mrr: 4200 }, 'Mateus')
    const orders = state.salesOrders.length
    advanceProposal(state, proposal.id, 'Mateus')
    advanceProposal(state, proposal.id, 'Mateus')
    advanceProposal(state, proposal.id, 'Mateus')
    expect(state.salesOrders).toHaveLength(orders)
    expect(proposal.salesOrderId).toBeUndefined()
    expect(opportunity).toMatchObject({ stage: 'Conquistado', mrr: 4200, value: 50000 })
    expect(opportunityIsOpen(opportunity)).toBe(false)

    expect(() => startImplementation(state, opportunity.id, { responsibleId: '', milestone: 'Kickoff' }, 'Mateus')).toThrow()
    startImplementation(state, opportunity.id, { responsibleId: 'u19', milestone: 'Kickoff com a lavanderia' }, 'Mateus')
    expect(opportunity.stage).toBe('Implantação')
    expect(opportunity.implementation).toMatchObject({ responsibleId: 'u19', milestone: 'Kickoff com a lavanderia' })
    expect(() => startImplementation(state, opportunity.id, { responsibleId: 'u19', milestone: 'Outro' }, 'Mateus')).toThrow(/já começou/)
  })

  it('só fases abertas entram no pipeline e a Conquistada conta como MRR e implantação, não como venda avulsa', () => {
    const state = createSeedState()
    const win = state.opportunities.find(entry => entry.id === 'OPP-26052')!
    expect(opportunityIsOpen(win)).toBe(false)
    const period = win.wonAt!.slice(0, 7)
    const total = conquestsIn(state, ['tenant-roboflex-sul'], period)
    expect(total.mrr).toBeGreaterThanOrEqual(5400)
    expect(total.setup).toBeGreaterThanOrEqual(60000)
    expect(total.oneOff).toBe(0)
  })

  it('o produto aceito gera um único pedido, com canal e dono da conta', () => {
    const state = createSeedState()
    const opportunity = createOpportunity(state, { ...input, partnerId: 'c1', title: 'Cases', ownerId: 'u22', itemIds: ['pa-a11-ext'], quantity: 5, channel: 'Integrador' }, 'Larissa')
    const proposal = createProposal(state, opportunity.id, 'Larissa')
    advanceProposal(state, proposal.id, 'Larissa')
    advanceProposal(state, proposal.id, 'Larissa')
    const orders = state.salesOrders.length
    advanceProposal(state, proposal.id, 'Larissa')
    expect(state.salesOrders).toHaveLength(orders)
    const order = state.salesOrders.find(entry => entry.id === proposal.salesOrderId)!
    expect(order).toMatchObject({ channel: 'Integrador', accountOwnerId: 'u12' })
    expect(opportunity.stage).toBe('Ganho')
  })

  it('a locação aceita gera a proposta de locação, nunca um pedido de venda', () => {
    const state = createSeedState()
    const opportunity = createOpportunity(state, { ...input, partnerId: 'c1', title: 'Locação de tablets', ownerId: 'u12', dealType: 'Locação' }, 'Camila')
    const proposal = createProposal(state, opportunity.id, 'Camila')
    addProposalLine(state, proposal.id, { serviceId: 'sv-campo', quantity: 1, unitPrice: 900 }, 'Camila')
    const orders = state.salesOrders.length
    advanceProposal(state, proposal.id, 'Camila')
    advanceProposal(state, proposal.id, 'Camila')
    expect(state.salesOrders).toHaveLength(orders)
    const contract = state.rentalContracts.find(entry => entry.id === proposal.rentalContractId)!
    expect(contract).toMatchObject({ status: 'Proposta', opportunityId: opportunity.id, partnerId: 'c1' })
    advanceProposal(state, proposal.id, 'Camila')
    expect(state.rentalContracts.filter(entry => entry.opportunityId === opportunity.id)).toHaveLength(1)
  })
})

describe('atividade, anexos e registro pelo ChatGPT', () => {
  const mcp = (opportunityId: string, extra = {}) => ({
    opportunityId, type: 'Ligação' as const, occurredOn: addDays(today(), -1), summary: 'Cliente pediu o orçamento.', idempotencyKey: 'k-1', ...extra,
  })

  it('grava a origem, a data efetiva, a próxima ação e gera evidência de esforço', () => {
    const state = createSeedState()
    const next = { title: 'Enviar orçamento', dueOn: addDays(today(), 2) }
    const { activity, opportunity, reused } = registerActivityViaMcp(state, mcp('OPP-26044', {
      next, references: [{ provider: 'agenda', externalId: 'ev-1', title: 'Ligação', content: 'Evento de ontem' }],
    }), 'Camila Nunes')
    expect(reused).toBe(false)
    expect(activity).toMatchObject({ origin: 'mcp', done: true, completedAt: addDays(today(), -1), registeredAt: today(), idempotencyKey: 'k-1' })
    expect(activity.createdBy).toContain('ChatGPT via MCP')
    expect(opportunity.activities.find(entry => entry.id === activity.nextActivityId)).toMatchObject({ text: 'Enviar orçamento', done: false })
    expect(opportunity.nextAction).toBe('Enviar orçamento')
    expect(state.effortRecords.some(entry => entry.activityId === activity.id && entry.date === addDays(today(), -1))).toBe(true)
  })

  it('repetir o comando não duplica: mesma chave ou mesma fonte do mesmo vendedor', () => {
    const state = createSeedState()
    const first = registerActivityViaMcp(state, mcp('OPP-26044', { references: [{ provider: 'meet', externalId: 'tr-9', title: 'Meet', content: 'Texto' }] }), 'Camila Nunes')
    const count = state.opportunities.find(entry => entry.id === 'OPP-26044')!.activities.length
    const sameKey = registerActivityViaMcp(state, mcp('OPP-26044'), 'Camila Nunes')
    const sameSource = registerActivityViaMcp(state, mcp('OPP-26044', { idempotencyKey: 'k-2', references: [{ provider: 'meet', externalId: 'tr-9', title: 'Meet', content: 'Texto' }] }), 'Camila Nunes')
    expect(sameKey.reused && sameSource.reused).toBe(true)
    expect(sameKey.activity.id).toBe(first.activity.id)
    expect(state.opportunities.find(entry => entry.id === 'OPP-26044')!.activities).toHaveLength(count)
  })

  it('exige data que já passou, participantes em reunião e oportunidade aberta', () => {
    const state = createSeedState()
    expect(() => registerActivityViaMcp(state, mcp('OPP-26044', { occurredOn: addDays(today(), 1) }), 'Camila')).toThrow(/já aconteceu/)
    expect(() => registerActivityViaMcp(state, mcp('OPP-26044', { type: 'Reunião', idempotencyKey: 'r' }), 'Camila')).toThrow(/participantes/)
    expect(() => registerActivityViaMcp(state, mcp('OPP-26039', { idempotencyKey: 'x' }), 'Camila')).toThrow(/encerrada/)
    expect(() => registerActivityViaMcp(state, mcp('OPP-26044', { idempotencyKey: ' ' }), 'Camila')).toThrow(/idempotência/)
  })

  it('concluir uma tarefa pelo MCP preserva o prazo e os anexos', () => {
    const state = createSeedState()
    const opportunity = state.opportunities.find(entry => entry.id === 'OPP-26043')!
    const task = opportunity.activities.find(entry => entry.id === 'act-2')!
    addActivityAttachment(state, opportunity.id, task.id, { name: 'fixacao.pdf', mime: 'application/pdf', size: 1200, dataUrl: 'data:application/pdf;base64,AA==' }, 'Camila')
    const due = task.at
    const result = registerActivityViaMcp(state, mcp(opportunity.id, { activityId: task.id, idempotencyKey: 'k-task' }), 'Camila Nunes')
    expect(result.activity.id).toBe(task.id)
    expect(task).toMatchObject({ done: true, at: due, origin: 'mcp' })
    expect(task.attachments).toHaveLength(1)
  })

  it('aceita até 5 arquivos nos formatos da lista e recusa o resto', () => {
    const state = createSeedState()
    const file = (name: string, size = 1000) => ({ name, mime: 'application/octet-stream', size, dataUrl: 'data:text/plain;base64,AA==' })
    const base = { type: 'Tarefa' as const, text: 'Anexar', at: `${addDays(today(), 1)}T09:00:00.000Z` }
    expect(() => addActivity(state, 'OPP-26044', { ...base, attachments: ['a.pdf', 'b.png', 'c.jpg', 'd.csv', 'e.docx', 'f.xlsx'].map(name => file(name)) }, 'Camila')).toThrow(/5 arquivos/)
    expect(() => addActivity(state, 'OPP-26044', { ...base, attachments: [file('virus.exe')] }, 'Camila')).toThrow(/formato/i)
    expect(() => addActivity(state, 'OPP-26044', { ...base, attachments: [file('grande.pdf', 11 * 1024 * 1024)] }, 'Camila')).toThrow(/10 MB/)
    expect(addActivity(state, 'OPP-26044', { ...base, attachments: [file('ok.pptx'), file('audio.m4a')] }, 'Camila').attachments).toHaveLength(2)
  })

  it('concluir com evidência exige resultado, data passada e participantes na reunião; a recompra pede o próximo passo', () => {
    const state = createSeedState()
    const meeting = addActivity(state, 'OPP-26044', { type: 'Reunião', text: 'Apresentação', at: `${addDays(today(), 1)}T09:00:00.000Z` }, 'Camila', 'u12')
    expect(() => completeActivity(state, 'OPP-26044', meeting.id, { occurredOn: today(), summary: '' }, 'Camila')).toThrow(/resultado/)
    expect(() => completeActivity(state, 'OPP-26044', meeting.id, { occurredOn: addDays(today(), 2), summary: 'ok', participants: 'Ana' }, 'Camila')).toThrow(/já aconteceu/)
    expect(() => completeActivity(state, 'OPP-26044', meeting.id, { occurredOn: today(), summary: 'ok' }, 'Camila')).toThrow(/participantes/)
    completeActivity(state, 'OPP-26044', meeting.id, { occurredOn: today(), summary: 'Cliente gostou.', participants: 'Bianca Alves' }, 'Camila')
    expect(state.effortRecords.find(entry => entry.activityId === meeting.id)).toMatchObject({ kind: 'meeting', review: 'recorded' })

    const repurchase = state.opportunities.find(entry => entry.id === 'OPP-26040')!.activities.find(entry => entry.id === 'act-rec-1')!
    expect(() => completeActivity(state, 'OPP-26040', repurchase.id, { occurredOn: today(), summary: 'Cliente quer repetir.' }, 'Camila')).toThrow(/próximo passo/)
  })

  it('reunião marcada como feita sem participantes fica em conferência e reabrir retira a evidência', () => {
    const state = createSeedState()
    const task = addActivity(state, 'OPP-26044', { type: 'Reunião', text: 'Sem lista', at: `${addDays(today(), 1)}T09:00:00.000Z` }, 'Camila', 'u12')
    toggleActivity(state, 'OPP-26044', task.id, 'Camila')
    expect(state.effortRecords.find(entry => entry.activityId === task.id)?.review).toBe('pending')
    toggleActivity(state, 'OPP-26044', task.id, 'Camila')
    expect(state.effortRecords.some(entry => entry.activityId === task.id)).toBe(false)
  })
})

describe('faturamento e canais', () => {
  it('só entram notas autorizadas, conciliadas, sem intercompany e sem duplicata; mostra o que ficou de fora', () => {
    const state = createSeedState()
    const month = prevMonth()
    const result = billingForMonth(state, ['tenant-roboflex'], month)
    expect(result.actual).toBe(485_000)
    expect(result.excluded.map(entry => entry.reason).sort()).toEqual(['Cancelada', 'Devolvida', 'Duplicada', 'Intercompany'])
    expect(result.reconciliation).toBe('conciliado')
    expect(result.goal).toBeCloseTo(500_000)
    expect(result.ratio).toBeCloseTo(0.97)
    expect(result.gap).toBeCloseTo(15_000)
  })

  it('mês sem conciliação não é zero, e meta sem aprovação não mede atingimento', () => {
    const state = createSeedState()
    const year = Number(today().slice(0, 4))
    const empty = billingForMonth(state, ['tenant-roboflex'], `${year}-01`)
    expect(empty).toMatchObject({ actual: null, ratio: null, reconciliation: 'sem conciliação' })
    const zontec = billingForMonth(state, ['tenant-roboflex-sul'], prevMonth())
    expect(zontec).toMatchObject({ goal: null, ratio: null, actual: 128_000 })
    expect(zontec.units).toMatchObject({ MRR: 38_000, 'Implantação': 90_000, 'Venda avulsa': 0 })
  })

  it('nota ainda sem conciliação deixa a competência parcial e fora da soma', () => {
    const state = createSeedState()
    const current = billingForMonth(state, ['tenant-roboflex'], today().slice(0, 7))
    expect(current.reconciliation).toBe('parcial')
    expect(current.excluded.some(entry => entry.reason === 'Sem conciliação')).toBe(true)
    expect(current.eligible.every(note => note.reconciled)).toBe(true)
  })

  it('a data de corte tira da competência a nota emitida depois dela', () => {
    const state = createSeedState()
    const month = prevMonth()
    const goal = state.salesGoals.find(entry => entry.tenantId === 'tenant-roboflex')!
    goal.cutoffDay = 15
    const result = billingForMonth(state, ['tenant-roboflex'], month)
    expect(result.excluded.some(entry => entry.reason === 'Após a data de corte')).toBe(true)
    expect(result.actual).toBe(275_000)
  })

  it('quem gravou a meta não a aprova, e gravar de novo zera a aprovação', () => {
    const state = createSeedState()
    const year = Number(today().slice(0, 4))
    expect(() => approveSalesGoal(state, 'tenant-roboflex-sul', year, 'Lucas Lima')).toThrow(/gravou/)
    approveSalesGoal(state, 'tenant-roboflex-sul', year, 'Marina Souza')
    expect(billingForMonth(state, ['tenant-roboflex-sul'], prevMonth()).goal).toBeCloseTo(100_000)
    setSalesGoal(state, 'tenant-roboflex-sul', year, 2_400_000, undefined, 'Lucas Lima')
    expect(billingForMonth(state, ['tenant-roboflex-sul'], prevMonth()).goal).toBeNull()
  })

  it('o atendimento do marketplace liga canal, cliente e pedido sem trocar o dono da conta', () => {
    const state = createSeedState()
    const order = state.salesOrders.find(entry => entry.id === 'PV-ML-2203')!
    const owner = order.accountOwnerId
    const record = createChannelCase(state, {
      tenantId: 'tenant-roboflex', channel: 'Mercado Livre', partnerId: 'c6', externalId: 'ML-Q-9000', subject: 'Previsão de entrega', handlerId: 'u20', deadline: addDays(today(), 2), salesOrderId: order.id,
    }, 'Roberto Pires')
    expect(record.salesOrderId).toBe(order.id)
    expect(order.accountOwnerId).toBe(owner)
    expect(() => createChannelCase(state, { tenantId: 'tenant-roboflex', channel: 'Mercado Livre', partnerId: 'c6', externalId: 'ML-Q-9000', subject: 'Repetido', handlerId: 'u22', deadline: addDays(today(), 2) }, 'Larissa')).toThrow(/Já existe/)
    expect(() => linkChannelOrder(state, record.id, 'PV-2026-1056', 'Larissa')).toThrow(/outro cliente|canal/)
    expect(() => createChannelCase(state, { tenantId: 'tenant-roboflex', channel: 'Integrador', partnerId: 'c6', externalId: 'INT-1', subject: 'Canal errado', handlerId: 'u22', deadline: addDays(today(), 2), salesOrderId: order.id }, 'Larissa')).toThrow(/canal/)
    expect(() => answerChannelCase(state, record.id, ' ', 'Larissa')).toThrow(/resposta/)
    answerChannelCase(state, record.id, 'Entrega prevista para sexta.', 'Larissa')
    expect(() => answerChannelCase(state, record.id, 'De novo', 'Larissa')).toThrow(/já foi respondido/)
  })

  it('o indicador de respostas do canal mede o prazo do atendimento', () => {
    const state = createSeedState()
    const link = state.sellerLinks.find(entry => entry.userId === 'u22')!
    const week = weekOf(addDays(today(), -7))
    const reading = effortSnapshot(state, link, week).indicators.find(entry => entry.id === 'respostas')!
    expect(reading.scored).toBe(true)
    const parceiros = effortSnapshot(state, link, week).indicators.find(entry => entry.id === 'parceiros')!
    expect(parceiros).toMatchObject({ target: 'A calibrar', scored: false })
  })
})

describe('carteira', () => {
  it('lista os clientes sem responsável e troca o dono por vigência', () => {
    const state = createSeedState()
    expect(partnersWithoutOwner(state).map(entry => entry.id)).toEqual(expect.arrayContaining(['c4', 'c7']))
    expect(() => assignPartnerOwner(state, 'c7', 'u16', '2026-11-01', 'Roberto')).toThrow(/vínculo comercial/)
    assignPartnerOwner(state, 'c7', 'u21', '2026-11-01', 'Roberto Pires')
    expect(partnersWithoutOwner(state).map(entry => entry.id)).not.toContain('c7')
    expect(partnersWithoutOwner(state).map(entry => entry.id)).toContain('c4')
    assignPartnerOwner(state, 'c7', 'u12', '2026-12-01', 'Roberto Pires')
    const history = state.partners.find(entry => entry.id === 'c7')!.ownerHistory!
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ ownerId: 'u21', until: '2026-11-30' })
    expect(history[1].until).toBeUndefined()
    expect(() => assignPartnerOwner(state, 'c7', 'u12', '2027-01-01', 'Roberto')).toThrow(/já é o responsável/i)
    expect(() => assignPartnerOwner(state, 'c7', 'u21', '2026-11-15', 'Roberto')).toThrow(/depois da atual/)
  })
})

describe('migração do CRM anterior', () => {
  const legacy = { id: 'OPP-OLD-1', tenantId: 'tenant-roboflex', partnerId: 'c1', title: 'Troca de tablets', ownerId: 'u12', value: 1000, proposalVersions: [1, 2], attachments: ['laudo.pdf'] }

  it('Desenvolvimento vira Levantamento com demanda, e Elaboração vira proposta em rascunho', () => {
    const dev = migrateLegacyOpportunity({ ...legacy, phase: 'Desenvolvimento', use: 'Em andamento' })
    expect(dev).toMatchObject({ id: 'OPP-OLD-1', stage: 'Levantamento', proposalDraft: false, proposalVersions: [1, 2], attachments: ['laudo.pdf'] })
    expect(dev.demand).toMatchObject({ origin: 'Oportunidade', originId: 'OPP-OLD-1' })
    const draft = migrateLegacyOpportunity({ ...legacy, phase: 'Elaboração', use: 'Em andamento' })
    expect(draft).toMatchObject({ stage: 'Proposta', proposalDraft: true })
    expect(draft.demand).toBeUndefined()
  })

  it('o uso decide o desfecho, com motivo para perda, suspensão e cancelamento', () => {
    expect(migrateLegacyOpportunity({ ...legacy, phase: 'Proposta', use: 'Ganho' }).stage).toBe('Ganho')
    expect(migrateLegacyOpportunity({ ...legacy, phase: 'Proposta', use: 'Perda', lossReason: 'Preço' })).toMatchObject({ stage: 'Perdido', lossReason: 'Preço' })
    expect(migrateLegacyOpportunity({ ...legacy, phase: 'Negociação', use: 'Cancelamento' })).toMatchObject({ stage: 'Perdido', lossReason: 'Cancelamento' })
    const suspended = migrateLegacyOpportunity({ ...legacy, phase: 'Qualificação', use: 'Suspensão' })
    expect(suspended).toMatchObject({ stage: 'Perdido', lossReason: 'Outro' })
    expect(suspended.notes[0]).toMatch(/Suspensa/)
    expect(() => migrateLegacyOpportunity({ ...legacy, id: '', phase: 'Proposta', use: 'Ganho' })).toThrow(DomainError)
  })
})
