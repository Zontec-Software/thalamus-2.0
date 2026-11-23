import { defaultEffortRules } from '../domain/crmEffort'
import type { ErpState } from '../domain/engine'
import { addDays, today } from '../domain/engine'
import { FUNCTIONALITIES, moduleFeature, profileCode } from '../domain/access'
import type {
  ChannelCase, CrmActivity, EffortKind, EffortRecord, EffortReview, Opportunity, PartnerOwnership, SaleInvoice, SalesOrder,
} from '../types/domain'

/**
 * Cenário do CRM por perfil: equipe com régua, evidências nas últimas semanas, carteira com triagem,
 * trilha Soluções Zontec, faturamento por competência e canais. As datas seguem o relógio, então a
 * semana corrente e as anteriores sempre têm movimento. Nota fiscal e marketplace são simulação.
 */

const ROBOFLEX = 'tenant-roboflex'
const ZONTEC = 'tenant-roboflex-sul'

const monthOf = (offset: number) => {
  const [year, month] = today().slice(0, 7).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function seedCrmRoutine(s: ErpState) {
  const ago = (days: number) => addDays(today(), -days)

  /* Equipe e acesso */
  const seller = (id: string, name: string, role: 'Comercial' | 'Supervisão comercial', email: string, home?: string) =>
    ({ id, name, role, sector: 'Comercial', shift: 'Administrativo' as const, pin: id.slice(1).repeat(2).slice(0, 4), email, positionId: 'pos-com', active: true, ...(home ? { homeTenantId: home } : {}) })
  s.users.push(
    seller('u20', 'Roberto Pires', 'Supervisão comercial', 'roberto.pires@roboflex.com.br'),
    seller('u21', 'Tiago Rocha', 'Comercial', 'tiago.rocha@roboflex.com.br'),
    seller('u22', 'Larissa Prado', 'Comercial', 'larissa.prado@roboflex.com.br'),
    seller('u23', 'Mateus Barros', 'Comercial', 'mateus.barros@zontec.com.br', ZONTEC),
  )
  for (const id of ['u20', 'u21', 'u22']) {
    const user = s.users.find(entry => entry.id === id)!
    s.userProfileAssignments.push({ id: `UP-${id.toUpperCase()}`, userId: id, tenantId: ROBOFLEX, profileId: `profile-${profileCode(user.role)}` })
  }
  s.accessProfiles.push({
    id: 'profile-zontec-comercial', tenantId: ZONTEC, code: 'comercial', name: 'Comercial',
    description: 'Vendedor das soluções Zontec.', system: false, simulatedRole: 'Comercial',
    functionalityIds: ['CRM', 'Parceiros', 'Vendas', 'Produtos'].map(moduleFeature).filter(id => FUNCTIONALITIES.some(entry => entry.id === id)),
  })
  s.userProfileAssignments.push({ id: 'UP-MATEUS-ZONTEC', userId: 'u23', tenantId: ZONTEC, profileId: 'profile-zontec-comercial' })
  const base = '2026-01-01'
  s.sellerLinks = [
    { id: 'VC-1', tenantId: ROBOFLEX, userId: 'u12', profile: 'carteira', team: true, since: base },
    { id: 'VC-2', tenantId: ROBOFLEX, userId: 'u21', profile: 'abertura', team: true, since: base },
    { id: 'VC-3', tenantId: ROBOFLEX, userId: 'u22', profile: 'canais', team: true, since: base },
    { id: 'VC-4', tenantId: ZONTEC, userId: 'u23', profile: 'abertura', team: true, since: base },
  ]
  s.effortRules = [...defaultEffortRules(ROBOFLEX, base), ...defaultEffortRules(ZONTEC, base)]
  s.counters.VC = 4
  s.counters.EF = 1000
  s.counters.U = Math.max(s.counters.U ?? 0, 23)

  /* Carteira: classe e responsável por vigência. Dois clientes ativos ficam para a triagem. */
  const owned = (ownerId: string): PartnerOwnership[] => [{ ownerId, since: '2026-01-01', by: 'Roberto Pires' }]
  const portfolio: Record<string, { commercialClass: 'A1' | 'A2' | 'B' | 'A classificar'; ownerId?: string }> = {
    c1: { commercialClass: 'A1', ownerId: 'u12' }, c2: { commercialClass: 'A2', ownerId: 'u12' }, c3: { commercialClass: 'B', ownerId: 'u12' },
    c5: { commercialClass: 'A1', ownerId: 'u12' }, c6: { commercialClass: 'A2', ownerId: 'u22' }, c4: { commercialClass: 'A classificar' }, c7: { commercialClass: 'A classificar' },
  }
  for (const [id, entry] of Object.entries(portfolio)) {
    const partner = s.partners.find(candidate => candidate.id === id)
    if (!partner) continue
    partner.commercialClass = entry.commercialClass
    if (entry.ownerId) partner.ownerHistory = owned(entry.ownerId)
  }

  /* Evidências de esforço */
  let serial = 0
  const effort = (ownerId: string, tenantId: string, kind: EffortKind, daysAgo: number, partnerId: string, note: string, extra: Partial<EffortRecord> = {}) => {
    serial += 1
    s.effortRecords.push({
      id: `EF-${serial}`, tenantId, ownerId, kind, date: ago(daysAgo), note, review: 'recorded' as EffortReview, partnerId, history: [], source: `seed:${serial}`, ...extra,
    })
  }
  const lastWeekStart = addDays(ago((new Date(today() + 'T12:00:00Z').getUTCDay() + 6) % 7), -7)
  const lastWeekDay = (offset: number) => Math.round((new Date(today() + 'T12:00:00Z').getTime() - new Date(addDays(lastWeekStart, offset) + 'T12:00:00Z').getTime()) / 86_400_000)

  // Camila (carteira): semana passada boa; semana corrente com uma evidência em conferência e outra devolvida.
  effort('u12', ROBOFLEX, 'meeting', lastWeekDay(1), 'c1', 'Validação técnica com a operação da mina Norte.', { review: 'approved', history: [{ at: ago(5) + 'T12:00:00.000Z', actor: 'Roberto Pires', from: 'recorded', to: 'approved' }] })
  effort('u12', ROBOFLEX, 'visit', lastWeekDay(3), 'c5', 'Visita ao pátio do porto para medir a fixação.')
  for (let index = 0; index < 12; index++) effort('u12', ROBOFLEX, 'proposal', lastWeekDay(index % 5), ['c1', 'c2', 'c3', 'c5'][index % 4], `Proposta enviada ${index + 1} da semana.`)
  effort('u12', ROBOFLEX, 'contact', 2, 'c2', 'Ligação de acompanhamento da frota 2027.')
  effort('u12', ROBOFLEX, 'contact', 3, 'c5', 'E-mail com o desenho da fixação.')
  effort('u12', ROBOFLEX, 'contact', 50, 'c3', 'Último contato com o cliente.')
  effort('u12', ROBOFLEX, 'meeting', 1, 'c1', 'Reunião sobre a parada de dezembro, participantes a confirmar.', { review: 'pending', activityId: 'act-seed-pend' })
  effort('u12', ROBOFLEX, 'contact', 0, 'c3', 'Contato sem resumo suficiente.', {
    review: 'returned', reason: 'Descreva o assunto e o resultado do contato.',
    history: [{ at: today() + 'T11:00:00.000Z', actor: 'Roberto Pires', from: 'recorded', to: 'returned', reason: 'Descreva o assunto e o resultado do contato.' }],
  })

  // Tiago (abertura): semana passada verde por 3 dos 4 indicadores.
  const prospects = ['c4', 'c7']
  for (let index = 0; index < 41; index++) effort('u21', ROBOFLEX, 'contact', lastWeekDay(index % 5), prospects[index % 2], `Contato de abertura ${index + 1}.`, { prospect: true, targetAccount: true })
  for (let index = 0; index < 3; index++) effort('u21', ROBOFLEX, 'meeting', lastWeekDay(index + 1), prospects[index % 2], `Apresentação ${index + 1} com resultado registrado.`, { prospect: true, targetAccount: true })
  for (let index = 0; index < 8; index++) effort('u21', ROBOFLEX, 'proposal', lastWeekDay(index % 5), prospects[index % 2], `Proposta de abertura ${index + 1}.`, { prospect: true, targetAccount: true })
  for (let index = 0; index < 9; index++) effort('u21', ROBOFLEX, 'contact', index % 3, prospects[index % 2], `Contato de abertura da semana ${index + 1}.`, { prospect: true, targetAccount: true })

  // Larissa (canais): conta da tarefa de canal e uma reunião com marketplace.
  effort('u22', ROBOFLEX, 'meeting', 1, 'c6', 'Alinhamento do prazo de entrega com o marketplace.')
  effort('u22', ROBOFLEX, 'contact', 2, 'c6', 'Resposta sobre a nota de devolução.')

  // Mateus (Zontec, abertura)
  effort('u23', ZONTEC, 'contact', 1, 'c4', 'Contato com a gerência do hotel sobre o enxoval.', { prospect: false, targetAccount: true })
  effort('u23', ZONTEC, 'meeting', 2, 'c1', 'Demonstração do LifeGuard com a segurança do trabalho.', { prospect: false, targetAccount: true })

  /* Oportunidades: trilha Soluções, recompra e registro via ChatGPT */
  const solution = (input: Partial<Opportunity> & Pick<Opportunity, 'id' | 'partnerId' | 'title' | 'stage' | 'value' | 'mrr' | 'solutionIds'>): Opportunity => ({
    tenantId: ZONTEC, ownerId: 'u23', funnel: 'Soluções', temperature: 'Morno', probability: 20, nextAction: 'Agendar diagnóstico', expectedClose: addDays(today(), 45),
    source: 'Prospecção', contact: 'Responsável', segment: 'Indústria', dealType: 'Recorrente', createdAt: addDays(today(), -20) + 'T10:00:00.000Z', activities: [], ...input,
  })
  const probability: Record<string, number> = { Prospecção: 10, Discovery: 25, 'Cálculo de custo': 40, Demonstração: 55, Proposta: 70, Conquistado: 100, Implantação: 100 }
  const zontec: Opportunity[] = [
    solution({
      id: 'OPP-26050', partnerId: 'c4', title: 'Laundry · Hotel Serra Azul', stage: 'Discovery', value: 85000, mrr: 7200, solutionIds: ['Laundry'], segment: 'Hotelaria', contact: 'Sônia Berger',
      discovery: { pain: 'Perda de enxoval e retrabalho na lavanderia', decider: 'Gerência geral', fit: 'Tier 1', scope: 'Duas unidades, 6 mil peças' },
      nextAction: 'Levantar a perda atual de enxoval',
    }),
    solution({
      id: 'OPP-26051', partnerId: 'c1', title: 'LifeGuard · Mineradora Horizonte', stage: 'Cálculo de custo', value: 140000, mrr: 11500, solutionIds: ['LifeGuard'], segment: 'Mineração', contact: 'Marcelo Dias',
      discovery: { pain: 'Pessoas isoladas em área sem sinal', decider: 'Diretoria de segurança', fit: 'Tier 1', baseline: '3 incidentes por trimestre', success: 'Zero incidente sem alerta em 90 dias', scope: '120 colaboradores' },
      nextAction: 'Fechar o cálculo de custo e marcar a demonstração', temperature: 'Quente',
    }),
    solution({
      id: 'OPP-26052', partnerId: 'c5', title: 'Asset Control · Porto Leste', stage: 'Conquistado', value: 60000, mrr: 5400, solutionIds: ['Asset Control'], segment: 'Logística', contact: 'Fábio Luz',
      probability: 100, wonAt: ago(3), temperature: 'Quente', nextAction: 'Definir responsável e marco da implantação',
      discovery: { pain: 'Ativos sem localização no pátio', decider: 'Operações', fit: 'Tier 2', baseline: '12% de ativos sem localização', success: 'Localização acima de 98%', pilot: 'Piloto de 30 dias aprovado' },
    }),
    solution({
      id: 'OPP-26053', partnerId: 'c2', title: 'Guard Enterprise · Translog', stage: 'Implantação', value: 98000, mrr: 8800, solutionIds: ['Guard Enterprise'], segment: 'Logística', contact: 'Bianca Alves',
      probability: 100, wonAt: ago(40), temperature: 'Quente', nextAction: 'Acompanhar o marco de implantação',
      discovery: { pain: 'Frota sem rastreio de rota', decider: 'Diretoria', fit: 'Tier 1', baseline: '9% de desvio de rota', success: 'Desvio abaixo de 3%' },
      implementation: { startedAt: ago(30), responsibleId: 'u19', responsibleName: 'Diego Martins', milestone: 'Instalação nos 40 veículos da primeira unidade' },
    }),
  ]
  for (const entry of zontec) entry.probability = probability[entry.stage] ?? entry.probability
  const legacyZontec = s.opportunities.find(entry => entry.id === 'OPP-26046')
  if (legacyZontec) legacyZontec.ownerId = 'u23'
  s.opportunities.push(...zontec)

  const recompra = (id: string, daysAgo: number, done: boolean, completedAgo?: number): CrmActivity => ({
    id, at: ago(daysAgo) + 'T12:00:00.000Z', type: 'Recompra', text: 'Tratar a recompra do lote de tablets', done, createdBy: 'Sistema', ownerId: 'u12',
    ...(done ? { completedAt: ago(completedAgo ?? daysAgo), registeredAt: ago(completedAgo ?? daysAgo), summary: 'Cliente confirmou o novo lote para o mês seguinte.' } : {}),
  })
  const fleet = s.opportunities.find(entry => entry.id === 'OPP-26040')
  if (fleet) fleet.activities.unshift(recompra('act-rec-1', 1, false), recompra('act-rec-2', 9, true, 7), recompra('act-rec-3', 10, false))

  const yard = s.opportunities.find(entry => entry.id === 'OPP-26043')
  if (yard) {
    yard.activities.unshift({
      id: 'act-mcp-1', at: ago(1) + 'T14:00:00.000Z', type: 'Reunião', text: 'Demonstração do protótipo ao pátio', done: true, completedAt: ago(1), registeredAt: today(),
      origin: 'mcp', createdBy: 'ChatGPT via MCP · Camila Nunes', ownerId: 'u12', participants: 'Fábio Luz (Porto Leste), Camila Nunes',
      summary: 'O pátio aprovou o encaixe do coletor e pediu orçamento para 60 unidades até o fim do mês.', idempotencyKey: 'seed-mcp-1',
      references: [
        { provider: 'agenda', externalId: 'gcal-evt-4471', title: 'Demonstração do protótipo', content: 'Evento de ontem, 14h, com Fábio Luz.' },
        { provider: 'meet', externalId: 'meet-tr-9021', title: 'Transcrição da reunião', content: 'Fábio confirmou o encaixe e pediu o orçamento de 60 unidades.' },
      ],
      nextActivityId: 'act-mcp-2',
    }, { id: 'act-mcp-2', at: addDays(today(), 3) + 'T10:00:00.000Z', type: 'Tarefa', text: 'Enviar o orçamento das 60 unidades', done: false, origin: 'mcp', createdBy: 'ChatGPT via MCP · Camila Nunes', ownerId: 'u12', registeredAt: today() })
    yard.nextAction = 'Enviar o orçamento das 60 unidades'
    effort('u12', ROBOFLEX, 'meeting', 1, 'c5', 'O pátio aprovou o encaixe do coletor e pediu orçamento para 60 unidades.', { activityId: 'act-mcp-1', opportunityId: 'OPP-26043', source: 'OPP-26043:act-mcp-1:done' })
  }

  /* Metas: Roboflex aprovada; Zontec aguarda aprovação, então não mede atingimento. */
  const year = Number(today().slice(0, 4))
  const monthly = (total: number) => Array.from({ length: 12 }, () => total / 12)
  s.salesGoals = [
    { tenantId: ROBOFLEX, year, amount: 6_000_000, monthlyAmounts: monthly(6_000_000), savedBy: 'Lucas Lima', approvedBy: 'Marina Souza', approvedAt: `${year}-01-10T12:00:00.000Z`, cutoffDay: 28 },
    { tenantId: ZONTEC, year, amount: 1_200_000, monthlyAmounts: monthly(1_200_000), savedBy: 'Lucas Lima' },
    { tenantId: 'tenant-locacoes', year, amount: 360_000, monthlyAmounts: monthly(360_000), savedBy: 'Lucas Lima', approvedBy: 'Marina Souza', approvedAt: `${year}-01-10T12:00:00.000Z` },
  ]

  /* Canais: pedidos de marketplace do dono Larissa, atendimentos e notas ligadas ao pedido. */
  const channelOrder = (id: string, externalKey: string, promised: string, value: number, deliveredOn?: string): SalesOrder => ({
    id, customerId: 'c6', itemId: 'pa-lite-ipad', quantity: 20, promisedDate: promised, priority: 'Normal', value, receivedAt: addDays(promised, -9) + 'T12:00:00.000Z',
    planned: true, origin: 'Thalamus', confirmedAt: addDays(promised, -8) + 'T12:00:00.000Z', confirmedBy: 'Larissa Prado', channel: 'Mercado Livre', externalKey, accountOwnerId: 'u22',
    ...(deliveredOn ? { shipment: { status: 'Entregue', volumes: 2, carrier: 'Correios', shippedAt: addDays(deliveredOn, -2) + 'T12:00:00.000Z', deliveredAt: deliveredOn + 'T15:00:00.000Z', deliveredTo: 'Portaria', invoice: `NF-${externalKey}`, tracking: `BR${externalKey}` } } : {}),
  })
  const weekStart = ago((new Date(today() + 'T12:00:00Z').getUTCDay() + 6) % 7)
  const prevDay = (offset: number) => addDays(weekStart, -7 + offset)
  s.salesOrders.push(
    channelOrder('PV-ML-2201', 'ML-2000771', prevDay(1), 9800, prevDay(1)),
    channelOrder('PV-ML-2202', 'ML-2000772', prevDay(3), 11400, prevDay(5)),
    channelOrder('PV-ML-2203', 'ML-2000790', addDays(weekStart, 4), 8200),
  )
  const cases: ChannelCase[] = [
    { id: 'AT-CAN-1', tenantId: ROBOFLEX, channel: 'Mercado Livre', partnerId: 'c6', externalId: 'ML-Q-5501', subject: 'Compatibilidade da case com o modelo do tablet', handlerId: 'u22', arrivedAt: prevDay(0), deadline: prevDay(2), answer: 'Compatível com o modelo informado; enviamos o guia de encaixe.', answeredAt: prevDay(1), salesOrderId: 'PV-ML-2201' },
    { id: 'AT-CAN-2', tenantId: ROBOFLEX, channel: 'Mercado Livre', partnerId: 'c6', externalId: 'ML-Q-5502', subject: 'Atraso na entrega do pedido 2000772', handlerId: 'u22', arrivedAt: prevDay(3), deadline: prevDay(4), answer: 'Pedido entregue no sábado, com pedido de desculpas e cupom.', answeredAt: prevDay(5), salesOrderId: 'PV-ML-2202' },
    { id: 'AT-CAN-3', tenantId: ROBOFLEX, channel: 'Mercado Livre', partnerId: 'c6', externalId: 'ML-Q-5588', subject: 'Prazo do pedido 2000790', handlerId: 'u22', arrivedAt: ago(1), deadline: addDays(today(), 1), salesOrderId: 'PV-ML-2203' },
    { id: 'AT-CAN-4', tenantId: ROBOFLEX, channel: 'Integrador', partnerId: 'c2', externalId: 'INT-0042', subject: 'Condição especial para 200 unidades', handlerId: 'u22', arrivedAt: ago(4), deadline: ago(1) },
  ]
  s.channelCases.push(...cases)
  s.counters['AT-CAN'] = cases.length

  /* Faturamento por competência: nota duplicada, cancelada, devolvida, intercompany e sem conciliação ficam de fora. */
  const note = (id: string, tenantId: string, month: string, day: string, amount: number, extra: Partial<SaleInvoice> = {}): SaleInvoice => ({
    id, tenantId, fiscalKey: `3126${id.replace(/\D/g, '').padStart(8, '0')}`, number: id.replace(/\D/g, ''), partnerId: 'c1', issuedAt: `${month}-${day}`, amount,
    status: 'Autorizada', intercompany: false, reconciled: true, unit: 'Venda avulsa', ownerId: 'u12', ...extra,
  })
  const last = monthOf(-1)
  const current = monthOf(0)
  const early = (month: string) => (month === current && today() < `${month}-05` ? today().slice(8) : '05')
  s.saleInvoices = [
    note('NF4101', ROBOFLEX, last, '05', 180_000),
    note('NF4102', ROBOFLEX, last, '09', 95_000, { partnerId: 'c2' }),
    note('NF4102B', ROBOFLEX, last, '10', 95_000, { partnerId: 'c2', fiscalKey: note('NF4102', ROBOFLEX, last, '09', 0).fiscalKey }),
    note('NF4104', ROBOFLEX, last, '12', 40_000, { status: 'Cancelada', partnerId: 'c3' }),
    note('NF4105', ROBOFLEX, last, '14', 25_000, { status: 'Devolvida', partnerId: 'c3' }),
    note('NF4106', ROBOFLEX, last, '16', 60_000, { intercompany: true, partnerId: 'c5' }),
    note('NF4107', ROBOFLEX, last, '20', 210_000, { partnerId: 'c6', ownerId: 'u22', salesOrderId: 'PV-ML-2201' }),
    note('NF4201', ROBOFLEX, current, early(current), 150_000),
    note('NF4202', ROBOFLEX, current, early(current), 80_000, { partnerId: 'c2', reconciled: false }),
    note('NF4203', ROBOFLEX, current, early(current), 31_000, { partnerId: 'c6', ownerId: 'u22', salesOrderId: 'PV-ML-2202' }),
    note('NF5301', ZONTEC, last, '06', 38_000, { partnerId: 'c2', unit: 'MRR', ownerId: 'u23' }),
    note('NF5302', ZONTEC, last, '08', 90_000, { partnerId: 'c5', unit: 'Implantação', ownerId: 'u23' }),
  ]
}
