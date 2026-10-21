import { describe, expect, it } from 'vitest'
import {
  addDays, advanceRequisition, applyDueRevisions, approveInspection, assertUsable, availableQty, consumeStock, finishOperation, lineNeed, machineState, orderStage,
  pauseOperation, pickOp, planOrder, purchaseLot, receiveOmieOrders, rejectInspection, reportProduction, shipOrder, startOperation, today, type ErpState,
} from '../domain/engine'
import {
  DEFAULT_PRICE_TABLE, addConversion, approvalIssues, approveItem, blockItem, convertQuantity, createItem, currentPrice, decideKeyChange, deleteItem,
  inactivateItem, itemFlags, obsoleteItem, openBomVersion, openPendencies, requestKeyChange, restoreItem, setBomLine, similarItems, submitItem,
  updateCommercial, updateCore, withCheckDigit,
} from '../domain/catalog'
import {
  abcAnalysis, addBarcode, addMedia, addReformEntry, createModel, generateVariants, linkProject, nextBarcode, removeBarcode, saveRoutingStep,
  setMainBarcode, setPrice, setStandardCost, spedRegisters, suggestTaxes,
} from '../domain/catalogExtensions'
import {
  addTechnicalPart, advanceProposal, advancePurchaseOrder, advanceTechnicalOrder, attendDemandFromStock, cancelPurchaseOrder, completeDemand,
  contractService, createDemand, createOpportunity, createProject, createProposal, createPurchaseOrder, createTechnicalOrder, deliveryLead, loseOpportunity,
  moveOpportunity, releaseRevision, settleTitle, toggleMilestone, undoPick, updateProposal,
} from '../domain/enterprise'
import { absorbOmieCategories, acknowledgeAlert, applyOmiePayment, applyRemoteCategories, budgetSummary, createBudgetCategory, decideBudgetException, linkBudgetInvoice, setBudget, setGroupBudget, updateBudgetCategory, upsertForecast } from '../domain/budget'
import { createSeedState } from '../mocks/seed'
import { MockOmieGateway } from '../services/omie/mockOmieGateway'
import { FUNCTIONALITIES, profileCan } from '../domain/access'
import { provisionCompany, saveEconomicGroup, saveOmieConnection } from '../domain/platform'

const stageOf = (state: ErpState, id: string) => orderStage(state, state.salesOrders.find(order => order.id === id)!)
const opsOf = (state: ErpState, id: string) => state.productionOrders.filter(op => op.salesOrderId === id)

describe('cenário de demonstração', () => {
  it('semeia perfis por funcionalidade e mantém Administrador com todo o catálogo', () => {
    const state = createSeedState()
    const administrator = state.accessProfiles.find(entry => entry.system)!
    expect(administrator.name).toBe('Administrador')
    expect(administrator.functionalityIds).toEqual(FUNCTIONALITIES.map(entry => entry.id))
    expect(profileCan(administrator, 'organizacao.acessos.gerir')).toBe(true)
    const financeiro = state.accessProfiles.find(entry => entry.name === 'Financeiro')!
    expect(profileCan(financeiro, 'orcamentos.gerir')).toBe(true)
    expect(profileCan(financeiro, 'orcamentos.liberar_saldo')).toBe(false)
    expect(state.users.some(user => user.platformMaster && !state.userProfileAssignments.some(entry => entry.userId === user.id))).toBe(true)
  })

  it('abre uma empresa zerada só com o Administrador e o catálogo do código', () => {
    const state = createSeedState()
    const created = provisionCompany(state, { legalName: 'Nova Indústria Ltda.', tradeName: 'Nova', document: '11.111.111/0001-11', city: 'Campinas', adminName: 'Ana Admin', adminEmail: 'ana@nova.example' })
    const profiles = state.accessProfiles.filter(entry => entry.tenantId === created.tenantId)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({ system: true, name: 'Administrador' })
    expect(profiles[0].functionalityIds).toEqual(FUNCTIONALITIES.map(entry => entry.id))
    expect(state.omieConnections.find(entry => entry.tenantId === created.tenantId)?.status).toBe('Não configurada')
    const groupId = saveEconomicGroup(state, { id: '', name: 'Grupo Norte', description: '', tenantIds: ['tenant-roboflex', created.tenantId] })
    expect(state.tenants.filter(entry => entry.groupId === groupId)).toHaveLength(2)
    saveOmieConnection(state, created.tenantId, 'chave-demo', 'Conta nova', true)
    expect(state.omieConnections.find(entry => entry.tenantId === created.tenantId)).toMatchObject({ status: 'Simulada', secretDefined: true, appKey: 'chave-demo' })
  })

  it('posiciona cada pedido em uma etapa coerente do fluxo', () => {
    const state = createSeedState()
    expect(stageOf(state, 'PV-2026-1033')).toBe('Faturado')
    expect(stageOf(state, 'PV-2026-1036')).toBe('Expedição')
    expect(stageOf(state, 'PV-2026-1039')).toBe('Qualidade')
    expect(stageOf(state, 'PV-2026-1041')).toBe('Montagem')
    expect(stageOf(state, 'PV-2026-1048')).toBe('Injeção')
    expect(stageOf(state, 'PV-2026-1051')).toBe('Materiais')
    expect(stageOf(state, 'PV-2026-1054')).toBe('Entrada')
  })

  it('deriva o estado das máquinas dos apontamentos e da manutenção', () => {
    const state = createSeedState()
    expect(machineState(state, 'inj2')).toBe('Produzindo')
    expect(machineState(state, 'inj1')).toBe('Parada')
    expect(machineState(state, 'inj3')).toBe('Manutenção')
  })
})

describe('planejamento', () => {
  it('explode a estrutura, cria OPs e requisições e não planeja duas vezes', () => {
    const state = createSeedState()
    const result = planOrder(state, 'PV-2026-1054', 'Teste')
    expect(result.ops.length).toBeGreaterThanOrEqual(1)
    const assembly = opsOf(state, 'PV-2026-1054').find(op => op.kind === 'Montagem')!
    expect(assembly.operations.length).toBeGreaterThan(0)
    expect(stageOf(state, 'PV-2026-1054')).not.toBe('Entrada')
    expect(() => planOrder(state, 'PV-2026-1054', 'Teste')).toThrow('já foi planejado')
  })

  it('reserva estoque sem deixar saldo disponível negativo', () => {
    const state = createSeedState()
    planOrder(state, 'PV-2026-1054', 'Teste')
    planOrder(state, 'PV-2026-1056', 'Teste')
    for (const item of state.items) expect(availableQty(state, item.id)).toBeGreaterThanOrEqual(0)
  })

  it('libera a OP quando a compra é recebida', () => {
    const state = createSeedState()
    const tpu = state.requisitions.find(req => req.itemId === 'mp-tpu' && req.status !== 'Recebida')!
    while (tpu.status !== 'Recebida') advanceRequisition(state, tpu.id, 'Teste')
    expect(tpu.omiePo).toMatch(/^PC-/)
    expect(state.items.find(item => item.id === 'mp-tpu')!.stock).toBeGreaterThan(2)
  })

  it('importa pedidos do Omie sem duplicar', () => {
    const state = createSeedState()
    const queued = state.omieQueue.map(order => ({ ...order }))
    expect(receiveOmieOrders(state, queued)).toBe(2)
    const before = state.salesOrders.length
    receiveOmieOrders(state, queued.map(order => ({ ...order })))
    expect(state.salesOrders.length).toBe(before)
  })
})

describe('chão de fábrica', () => {
  it('não permite apontar mais do que a etapa anterior produziu', () => {
    const state = createSeedState()
    const op = opsOf(state, 'PV-2026-1041')[0]
    const packing = op.operations[1]
    expect(() => reportProduction(state, op.id, packing.id, 50, 0, '', 'Teste')).toThrow('acima do disponível')
  })

  it('exige motivo para o refugo', () => {
    const state = createSeedState()
    const op = opsOf(state, 'PV-2026-1041')[0]
    expect(() => reportProduction(state, op.id, op.operations[1].id, 1, 1, '', 'Teste')).toThrow('motivo do refugo')
  })

  it('abre manutenção corretiva e bloqueia a máquina quando o operador informa quebra', () => {
    const state = createSeedState()
    const running = state.productionOrders.find(op => op.resourceId === 'inj2' && op.operations[0].status === 'Em execução')!
    pauseOperation(state, running.id, running.operations[0].id, 'Quebra de máquina', 'Teste')
    expect(state.maintenanceOrders[0].type).toBe('Corretiva')
    expect(machineState(state, 'inj2')).toBe('Manutenção')
    expect(() => startOperation(state, running.id, running.operations[0].id, 'Teste')).toThrow('manutenção')
  })

  it('só libera para a fábrica OPs com kit completo', () => {
    const state = createSeedState()
    const waiting = state.productionOrders.find(op => op.status === 'Aguardando material')!
    expect(() => pickOp(state, waiting.id, 'Teste')).toThrow()
  })

  it('leva a OP de montagem até a inspeção e trata reprovação com retrabalho', () => {
    const state = createSeedState()
    const op = opsOf(state, 'PV-2026-1041')[0]
    const packing = op.operations[1]
    reportProduction(state, op.id, packing.id, 12, 0, '', 'Teste')
    finishOperation(state, op.id, packing.id, 'Teste')
    expect(op.status).toBe('Inspeção')
    rejectInspection(state, op.id, 2, 'Risco / mancha', 'Teste')
    expect(op.status).toBe('Em produção')
    expect(op.operations.at(-1)!.name).toBe('Retrabalho')
    const rework = op.operations.at(-1)!
    startOperation(state, op.id, rework.id, 'Teste')
    reportProduction(state, op.id, rework.id, 2, 0, '', 'Teste')
    finishOperation(state, op.id, rework.id, 'Teste')
    approveInspection(state, op.id, 'Teste')
    expect(state.salesOrders.find(order => order.id === 'PV-2026-1041')!.shipment?.status).toBe('Aguardando conferência')
  })
})

describe('gateway Omie simulado', () => {
  it('entrega a fila de aprovados uma única vez', async () => {
    const queue = createSeedState().omieQueue
    const gateway = new MockOmieGateway(() => queue, 0)
    expect((await gateway.fetchApprovedOrders()).length).toBe(2)
    expect((await gateway.fetchApprovedOrders()).length).toBe(0)
  })
})

describe('ERP integrado', () => {
  it('permite desfazer a separação antes do início da OP', () => {
    const state = createSeedState()
    const op = state.productionOrders.find(entry => entry.status === 'Planejada')!
    const before = state.items.map(item => [item.id, item.stock] as const)
    pickOp(state, op.id, 'Almoxarifado')
    undoPick(state, op.id, 'Almoxarifado')
    expect(op.status).toBe('Planejada')
    for (const [id, stock] of before) expect(state.items.find(item => item.id === id)!.stock).toBe(stock)
  })

  it('recebe pedido parcialmente e gera conta a pagar no saldo final', () => {
    const state = createSeedState()
    const order = state.purchaseOrders[0]
    advancePurchaseOrder(state, order.id, 'Teste', true)
    expect(['Recebido parcial', 'Recebido']).toContain(order.status)
    if (order.status !== 'Recebido') advancePurchaseOrder(state, order.id, 'Teste')
    expect(state.financialTitles.some(title => title.kind === 'Pagar' && title.reference === order.id)).toBe(true)
    expect(state.demands.find(demand => demand.id === order.demandIds[0])!.status).toBe('Atendida')
  })

  it('aceita proposta e cria um pedido aprovado no fluxo', () => {
    const state = createSeedState()
    const proposal = state.proposals.find(entry => entry.status === 'Enviada')!
    const before = state.salesOrders.length
    advanceProposal(state, proposal.id, 'Comercial')
    expect(proposal.status).toBe('Aceita')
    expect(state.salesOrders).toHaveLength(before + 1)
    expect(state.salesOrders[0].lines!.length).toBeGreaterThan(1)
  })

  it('conclui assistência cobrável e abre conta a receber', () => {
    const state = createSeedState()
    const order = state.technicalServiceOrders.find(entry => entry.chargeable)!
    while (order.status !== 'Concluída') advanceTechnicalOrder(state, order.id, 'Técnico')
    expect(state.financialTitles.some(title => title.kind === 'Receber' && title.reference === order.id)).toBe(true)
  })

  it('libera revisão somente com checklist completo', () => {
    const state = createSeedState()
    const revision = state.productRevisions.find(entry => entry.status === 'Rascunho')!
    expect(() => releaseRevision(state, revision.id, 'Engenharia')).toThrow('checklist')
    revision.checklist.forEach(entry => { entry.done = true })
    releaseRevision(state, revision.id, 'Engenharia')
    expect(revision.status).toBe('Liberada')
    expect(state.items.find(item => item.id === revision.itemId)!.revision).toBe(revision.code)
  })

  it('conclui projeto pelos marcos e baixa um título operacional', () => {
    const state = createSeedState()
    const project = state.projects[1]
    project.milestones.forEach(milestone => toggleMilestone(state, project.id, milestone.id, 'Gestor'))
    expect(project.status).toBe('Concluído')
    const title = state.financialTitles.find(entry => entry.status === 'Aberto')!
    settleTitle(state, title.id, 'Financeiro')
    expect(title.status).toBe('Baixado')
    expect(title.paidAt).toBeTruthy()
  })
})

const materialDemand = (state: ErpState, itemId: string, quantity: number, extra: Partial<Parameters<typeof createDemand>[1]> = {}) => createDemand(state, {
  kind: 'Material', itemId, description: `Teste ${itemId}`, quantity, origin: 'Manual', neededBy: '2026-10-30', priority: 'Normal', assigneeRole: 'Compras', ...extra,
}, 'Teste')

describe('demandas, compras e orçamento', () => {
  it('atende pelo estoque com baixa e movimento de saída', () => {
    const state = createSeedState()
    const item = state.items.find(entry => entry.type === 'MP' && availableQty(state, entry.id) >= 2)!
    const before = item.stock
    const demand = materialDemand(state, item.id, 2)
    attendDemandFromStock(state, demand.id, 'Almoxarifado')
    expect(demand.status).toBe('Atendida')
    expect(item.stock).toBe(before - 2)
    expect(state.movements[0]).toMatchObject({ type: 'Saída', reference: demand.id })
    expect(state.budgetEntries.find(entry => entry.sourceId === demand.id)?.status).toBe('Cancelado')
  })

  it('mantém a previsão na compra e só realiza após pagamento confirmado', () => {
    const state = createSeedState()
    const demand = materialDemand(state, 'mp-abs', 10)
    const order = createPurchaseOrder(state, demand.id, 'f1', 'Compras')
    const budget = state.budgets.find(entry => entry.id === order.budgetId)!
    const forecast = state.budgetEntries.find(entry => entry.sourceId === demand.id && entry.kind === 'Previsão')!
    advancePurchaseOrder(state, order.id, 'Gestor')
    expect(forecast.openAmount).toBeGreaterThan(0)
    advancePurchaseOrder(state, order.id, 'Almoxarifado')
    expect(demand.status).toBe('Atendida')
    expect(state.financialTitles[0]).toMatchObject({ kind: 'Pagar', reference: order.id, origin: 'Compra', budgetId: budget.id })
    expect(state.budgetEntries.some(entry => entry.kind === 'Realizado pago' && entry.sourceId === order.id)).toBe(false)
    settleTitle(state, state.financialTitles[0].id, 'Financeiro')
    expect(state.budgetEntries.some(entry => entry.kind === 'Realizado pago' && entry.sourceId === order.id)).toBe(true)
    expect(state.events.some(event => event.ref === demand.id)).toBe(true)
  })

  it('devolve a demanda ao cancelar o pedido', () => {
    const state = createSeedState()
    const demand = materialDemand(state, 'mp-abs', 10)
    const order = createPurchaseOrder(state, demand.id, 'f1', 'Compras')
    cancelPurchaseOrder(state, order.id, 'Compras')
    expect(demand.status).toBe('Aberta')
  })

  it('contrata serviço de projeto e aguarda pagamento para realizar', () => {
    const state = createSeedState()
    const demand = createDemand(state, { kind: 'Serviço', serviceId: 'sv-lab', description: 'Ensaio', quantity: 1, origin: 'Projeto', originId: 'PRJ-26-014', neededBy: '2026-10-30', priority: 'Alta', assigneeRole: 'Compras' }, 'Engenharia')
    expect(demand.projectId).toBe('PRJ-26-014')
    contractService(state, demand.id, 'f3', 'Compras')
    completeDemand(state, demand.id, 'Compras')
    expect(state.financialTitles[0]).toMatchObject({ kind: 'Pagar', partnerId: 'f3', projectId: 'PRJ-26-014' })
    expect(state.budgetEntries.some(entry => entry.kind === 'Realizado pago' && entry.sourceId === demand.id)).toBe(false)
    settleTitle(state, state.financialTitles[0].id, 'Financeiro')
    expect(state.budgetEntries.some(entry => entry.kind === 'Realizado pago' && entry.sourceId === demand.id)).toBe(true)
  })
})

describe('orçamento integrado por categoria e período', () => {
  it('audita alteração e retém previsão acima do saldo até o Gestor liberar', () => {
    const state = createSeedState()
    const allocation = setBudget(state, 'BC-OPER', '2026', 100, 'Teste de limite', 'Financeiro', 'Financeiro')
    expect(allocation.audit[0]).toMatchObject({ field: 'Valor informado', reason: 'Teste de limite' })
    const input = { categoryId: 'BC-OPER', period: '2026-10', amount: 100000, sourceModule: 'Manutenção' as const, sourceType: 'OS', sourceId: 'OS-TESTE', description: 'Teste sem saldo' }
    const heldBefore = budgetSummary(state, 'BC-OPER', '2026-10').held
    const held = upsertForecast(state, input, 'Manutenção')
    expect(held).toMatchObject({ status: 'Retido', openAmount: 0, heldAmount: 100000 })
    expect(budgetSummary(state, 'BC-OPER', '2026-10').held).toBe(heldBefore + 100000)
    expect(state.budgetAlerts.some(entry => entry.kind === 'Bloqueio' && entry.sourceId === 'OS-TESTE')).toBe(true)
    const exception = state.budgetExceptions.find(entry => entry.sourceId === 'OS-TESTE')!
    expect(exception.status).toBe('Pendente')
    expect(() => decideBudgetException(state, exception.id, true, 'Eu mesmo planejei', 'Financeiro', 'Financeiro')).toThrow('Somente o Gestor')
    decideBudgetException(state, exception.id, true, 'Emergência operacional', 'Gestor', 'Gestor')
    expect(held).toMatchObject({ status: 'Ativo', openAmount: 100000, heldAmount: undefined })
  })

  it('administrador opera os dois lados do orçamento', () => {
    const state = createSeedState()
    expect(state.users.find(entry => entry.name === 'Lucas Lima')?.role).toBe('Administrador')
    const administrator = state.accessProfiles.find(entry => entry.system)!
    expect(administrator.functionalityIds).toContain('modulo.injecao.consultar')
    expect(state.userProfileAssignments.some(entry => entry.userId === 'u16' && entry.profileId === administrator.id)).toBe(true)
    expect(setBudget(state, 'BC-OPER', '2027', 1000, 'Planejamento inicial', 'Lucas Lima', 'Administrador').amount).toBe(1000)
    const exception = state.budgetExceptions.find(entry => entry.kind === 'Saldo excedido' && entry.status === 'Pendente')!
    decideBudgetException(state, exception.id, true, 'Acesso total', 'Lucas Lima', 'Administrador')
    expect(exception.status).toBe('Autorizada')
    expect(() => setBudget(state, 'BC-OPER', '2028', 1000, 'Planejamento inicial', 'Marina Souza', 'Gestor')).toThrow('Somente o Financeiro')
    expect(() => decideBudgetException(state, state.budgetExceptions.find(entry => entry.kind === 'Sem categoria' && entry.status === 'Pendente')!.id, false, 'Não', 'Marina Souza', 'Gestor')).toThrow('Somente o Financeiro')
  })

  it('separa quem define orçamento de quem libera exceção e exige valor no ano', () => {
    const state = createSeedState()
    expect(() => setBudget(state, 'BC-OPER', '2027', 5000, 'Planejamento inicial', 'Gestor', 'Gestor')).toThrow('Somente o Financeiro')
    expect(() => setBudget(state, 'BC-OPER', '2027', 0, 'Planejamento inicial', 'Financeiro', 'Financeiro')).toThrow('maior que zero')
    expect(setBudget(state, 'BC-OPER', '2027', 5000, '', 'Financeiro', 'Financeiro').amount).toBe(5000)
    expect(() => setBudget(state, 'BC-OPER', '2026-10', 5000, 'Planejamento inicial', 'Financeiro', 'Financeiro')).toThrow('AAAA')
  })

  it('conciliia categorias com o Omie nos dois sentidos sem duplicar', () => {
    const state = createSeedState()
    expect(state.budgetCategories.every(entry => entry.omieId)).toBe(true)
    expect(state.omieCategoryInbox).toHaveLength(1)
    const received = absorbOmieCategories(state)
    expect(received).toMatchObject({ created: 1, updated: 0 })
    expect(state.omieCategoryInbox).toHaveLength(0)
    expect(state.budgetCategories.find(entry => entry.code === '04.01')).toMatchObject({ name: 'Frete sobre vendas', omieId: 'OMIE-04.01' })
    const created = createBudgetCategory(state, { name: 'Energia da fábrica', group: '03. Custos', responsibleRole: 'PCP' }, 'Financeiro', 'Financeiro')
    expect(created.omieId).toBe('OMIE-03.10')
    expect(state.syncLogs.some(entry => entry.entity === 'Categoria' && entry.direction === 'Thalamus → Omie' && entry.reference === created.code && entry.status === 'sincronizado')).toBe(true)
    updateBudgetCategory(state, created.id, { name: created.name, responsibleRole: created.responsibleRole, status: 'Inativa' }, 'Situação enviada ao Omie', 'Financeiro', 'Financeiro')
    expect(state.syncLogs[0]?.message).toContain('conta_inativa')
    expect(applyRemoteCategories(state, [{ omieId: 'OMIE-04.01', code: '04.01', name: 'Fretes e carretos', group: '04. Despesas Variáveis' }])).toMatchObject({ created: 0, updated: 1 })
    expect(state.budgetCategories.filter(entry => entry.omieId === 'OMIE-04.01')).toHaveLength(1)
    expect(state.budgetCategories.find(entry => entry.code === '04.01')?.name).toBe('Fretes e carretos')
    expect(applyRemoteCategories(state, [{ omieId: 'OMIE-99', code: '99.01', name: 'Fora da árvore', group: '99. Inexistente' }])).toMatchObject({ created: 0, updated: 0 })
    expect(state.syncLogs.some(entry => entry.reference === '99.01' && entry.status === 'erro')).toBe(true)
  })

  it('cria subcategoria com código gerado e soma na categoria pai', () => {
    const state = createSeedState()
    expect(() => createBudgetCategory(state, { name: 'X', group: 'Livre', responsibleRole: 'Financeiro' }, 'Financeiro', 'Financeiro')).toThrow('grupo confirmado')
    const child = createBudgetCategory(state, { name: 'Resinas', group: '03. Custos', parentId: 'BC-CMV', responsibleRole: 'Compras' }, 'Financeiro', 'Financeiro')
    expect(child).toMatchObject({ code: '03.01.06', group: '03. Custos', parentId: 'BC-CMV', omieId: 'OMIE-03.01.06' })
    expect(createBudgetCategory(state, { name: 'Nova', group: '03. Custos', responsibleRole: 'PCP' }, 'Financeiro', 'Financeiro').code).toBe('03.10')
    setBudget(state, child.id, '2026', 1000, 'Planejamento inicial', 'Financeiro', 'Financeiro')
    expect(budgetSummary(state, child.id, '2026').amount).toBe(1000)
    expect(budgetSummary(state, 'BC-CMV', '2026').amount).toBe(2161000)
    const before = budgetSummary(state, 'BC-CMV', '2026-10').forecast
    upsertForecast(state, { categoryId: child.id, period: '2026-10', amount: 2000, sourceModule: 'Demandas', sourceType: 'Material', sourceId: 'DM-SUB', description: 'Resina' }, 'Compras')
    expect(budgetSummary(state, 'BC-CMV', '2026-10').forecast).toBe(before + 2000)
  })

  it('divide o total do grupo ou da categoria e deixa cada parte editável', () => {
    const state = createSeedState()
    const first = createBudgetCategory(state, { name: 'Energia', group: '03. Custos', parentId: 'BC-OPER', responsibleRole: 'PCP' }, 'Financeiro', 'Financeiro')
    expect(budgetSummary(state, 'BC-OPER', '2026').amount).toBe(384000)
    expect(budgetSummary(state, first.id, '2026').amount).toBe(384000)
    const second = createBudgetCategory(state, { name: 'Água', group: '03. Custos', parentId: 'BC-OPER', responsibleRole: 'PCP' }, 'Financeiro', 'Financeiro')
    setBudget(state, 'BC-OPER', '2026', 1000, 'Revisão da previsão', 'Financeiro', 'Financeiro')
    expect(budgetSummary(state, first.id, '2026').amount).toBe(500)
    expect(budgetSummary(state, second.id, '2026').amount).toBe(500)
    expect(budgetSummary(state, 'BC-OPER', '2026').amount).toBe(1000)
    setBudget(state, second.id, '2026', 200, 'Correção de valor informado', 'Financeiro', 'Financeiro')
    expect(budgetSummary(state, 'BC-OPER', '2026').amount).toBe(700)
    setGroupBudget(state, '02. Deduções da Receita', '2026', 1000, 'Planejamento inicial', 'Financeiro', 'Financeiro')
    expect(budgetSummary(state, 'BC-IMPOSTOS', '2026').amount).toBe(500)
    expect(budgetSummary(state, 'BC-DEVOL', '2026').amount).toBe(500)
    expect(() => setGroupBudget(state, '05. Despesas Fixas', '2026', 1000, 'Planejamento inicial', 'Financeiro', 'Financeiro')).toThrow('Não há categoria')
  })

  it('mostra a fatia do mês, do trimestre e do semestre sem mudar o ano', () => {
    const state = createSeedState()
    expect(budgetSummary(state, 'BC-CMV', '2026').amount).toBe(2160000)
    expect(budgetSummary(state, 'BC-CMV', '2026-10').amount).toBe(180000)
    expect(budgetSummary(state, 'BC-CMV', '2026-Q4').amount).toBe(540000)
    expect(budgetSummary(state, 'BC-CMV', '2026-S2').amount).toBe(1080000)
    expect(budgetSummary(state, 'BC-CMV', '2026-Q1').forecast).toBe(0)
    expect(budgetSummary(state, 'BC-CMV', '2026-10').forecast).toBe(budgetSummary(state, 'BC-CMV', '2026').forecast)
  })

  it('reclassifica pagamento retido e lança no realizado', () => {
    const state = createSeedState()
    applyOmiePayment(state, state.omiePayments.find(entry => entry.id === 'PG-SEM-CAT')!)
    const exception = state.budgetExceptions.find(entry => entry.sourceId === 'PG-SEM-CAT')!
    const before = budgetSummary(state, 'BC-OPER', '2026-10').realized
    expect(() => decideBudgetException(state, exception.id, true, 'NF de manutenção', 'Gestor', 'Gestor')).toThrow('Financeiro')
    decideBudgetException(state, exception.id, true, 'NF de manutenção', 'Financeiro', 'Financeiro', 'BC-OPER')
    expect(exception.status).toBe('Resolvida')
    expect(budgetSummary(state, 'BC-OPER', '2026-10').realized).toBe(before + 3250)
  })

  it('registra ocorrência de alerta para o responsável da categoria', () => {
    const state = createSeedState()
    upsertForecast(state, { categoryId: 'BC-OPER', period: '2026-10', amount: 3500, sourceModule: 'Manutenção', sourceType: 'OS', sourceId: 'OS-ALERTA', description: 'Reparo' }, 'Manutenção')
    const alert = state.budgetAlerts.find(entry => entry.categoryId === 'BC-OPER' && entry.kind === 'Alerta')!
    expect(alert.notifiedRoles).toEqual(expect.arrayContaining(['PCP', 'Financeiro']))
    expect(() => acknowledgeAlert(state, alert.id, 'Comercial', 'Comercial')).toThrow()
    expect(acknowledgeAlert(state, alert.id, 'PCP', 'PCP').status).toBe('Ciente')
  })

  it('concilia parcial, estorno e idempotência sem dupla contagem', () => {
    const state = createSeedState()
    setBudget(state, 'BC-OPER', '2026', 200000, 'Teste', 'Financeiro', 'Financeiro')
    upsertForecast(state, { categoryId: 'BC-OPER', period: '2026-10', amount: 1000, sourceModule: 'Manutenção', sourceType: 'OS', sourceId: 'OS-PAG', description: 'Reparo' }, 'Manutenção')
    const first = { id: 'PG-PARCIAL-1', sourceId: 'OS-PAG', amount: 400, paidAt: '2026-10-19T10:00:00.000Z', categoryIds: ['BC-OPER'], event: 'Pagamento' as const }
    applyOmiePayment(state, first)
    applyOmiePayment(state, first)
    expect(state.budgetEntries.filter(entry => entry.externalId === first.id)).toHaveLength(1)
    expect(state.budgetEntries.find(entry => entry.sourceId === 'OS-PAG' && entry.kind === 'Previsão')?.openAmount).toBe(600)
    applyOmiePayment(state, { ...first, id: 'PG-ESTORNO-1', amount: 100, event: 'Estorno' })
    expect(state.budgetEntries.find(entry => entry.sourceId === 'OS-PAG' && entry.kind === 'Previsão')?.openAmount).toBe(700)
    expect(budgetSummary(state, 'BC-OPER', '2026-10').realized).toBeGreaterThanOrEqual(300)
  })

  it('lança a nota do Omie no custo e deixa o vínculo manual quando ela chega solta', () => {
    const state = createSeedState()
    const before = budgetSummary(state, 'BC-GARANTIA', '2026-10').realized
    const posted = applyOmiePayment(state, { id: 'PG-NF-1', invoiceNumber: '9100', sourceId: 'NF-9100', amount: 500, paidAt: '2026-10-19T10:00:00.000Z', categoryIds: ['BC-GARANTIA'], event: 'Pagamento', description: 'Frete avulso' })
    expect(posted).toMatchObject({ kind: 'Realizado pago', invoiceNumber: '9100', amount: 500 })
    expect(posted?.linkId).toBeUndefined()
    expect(budgetSummary(state, 'BC-GARANTIA', '2026-10').realized).toBe(before + 500)
    const exception = state.budgetExceptions.find(entry => entry.sourceId === 'PG-NF-1' && entry.kind === 'Sem vínculo')!
    expect(exception.status).toBe('Pendente')
    expect(() => linkBudgetInvoice(state, exception.id, 'Compras', 'PC-7310', 'Gestor', 'Gestor')).toThrow('Somente o Financeiro')
    expect(() => linkBudgetInvoice(state, exception.id, 'Compras', 'PC-NAO-EXISTE', 'Financeiro', 'Financeiro')).toThrow('Documento não encontrado')
    linkBudgetInvoice(state, exception.id, 'Compras', 'PC-7310', 'Financeiro', 'Financeiro')
    expect(exception.status).toBe('Resolvida')
    expect(posted).toMatchObject({ linkModule: 'Compras', linkId: 'PC-7310', linkMode: 'manual' })
    expect(budgetSummary(state, 'BC-GARANTIA', '2026-10').realized).toBe(before + 500)
    applyOmiePayment(state, { id: 'PG-NF-2', invoiceNumber: '9101', sourceId: 'NF-9101', amount: 100, paidAt: '2026-10-19T11:00:00.000Z', categoryIds: ['BC-GARANTIA'], event: 'Pagamento', link: { module: 'Projetos', id: 'PRJ-26-014' } })
    expect(state.budgetExceptions.some(entry => entry.sourceId === 'PG-NF-2')).toBe(false)
    expect(state.budgetEntries.find(entry => entry.externalId === 'PG-NF-2')).toMatchObject({ linkModule: 'Projetos', linkId: 'PRJ-26-014' })
  })

  it('retém pagamentos inválidos na fila de exceção', () => {
    const state = createSeedState()
    applyOmiePayment(state, { id: 'PG-SEM-CAT', sourceId: 'NF-X', amount: 100, paidAt: '2026-10-19T10:00:00.000Z', categoryIds: [], event: 'Pagamento' })
    applyOmiePayment(state, { id: 'PG-ERRO', sourceId: 'NF-Y', amount: 100, paidAt: '2026-10-19T10:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Pagamento', error: 'NF não localizada' })
    expect(state.budgetExceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'PG-SEM-CAT', kind: 'Sem categoria' }),
      expect.objectContaining({ sourceId: 'PG-ERRO', kind: 'Erro de sincronização' }),
    ]))
  })
})

describe('CRM e propostas', () => {
  it('leva oportunidade nova até pedido aprovado com cliente sincronizado', () => {
    const state = createSeedState()
    const partner = state.partners.find(entry => entry.roles.includes('Cliente') && !state.customers.some(customer => customer.id === entry.id))
      ?? state.partners.find(entry => entry.roles.includes('Cliente'))!
    const opportunity = createOpportunity(state, { partnerId: partner.id, title: 'Teste', ownerId: 'u12', value: 0, expectedClose: '2026-11-30', source: 'Site', nextAction: 'Ligar', itemIds: ['pa-a11-ext'], quantity: 30 }, 'Comercial')
    expect(() => moveOpportunity(state, opportunity.id, 'Ganha', 'Comercial')).toThrow()
    const proposal = createProposal(state, opportunity.id, 'Comercial')
    expect(opportunity.stage).toBe('Proposta')
    expect(proposal.lines[0]).toMatchObject({ itemId: 'pa-a11-ext', quantity: 30 })
    expect(() => updateProposal(state, proposal.id, { discount: 20 }, 'Comercial')).toThrow('15%')
    advanceProposal(state, proposal.id, 'Comercial')
    expect(opportunity.stage).toBe('Negociação')
    advanceProposal(state, proposal.id, 'Comercial')
    expect(opportunity.stage).toBe('Ganha')
    expect(proposal.salesOrderId).toBe(state.salesOrders[0].id)
    expect(state.customers.some(customer => customer.id === partner.id)).toBe(true)
  })

  it('perder a oportunidade recusa as propostas em aberto', () => {
    const state = createSeedState()
    loseOpportunity(state, 'OPP-26042', 'Preço', 'Comercial')
    expect(state.opportunities.find(entry => entry.id === 'OPP-26042')!.stage).toBe('Perdida')
    expect(state.proposals.find(entry => entry.id === 'PROP-26018')!.status).toBe('Recusada')
  })
})

describe('assistência e projetos', () => {
  it('chamado em garantia abre NC e peça sem saldo vira demanda', () => {
    const state = createSeedState()
    const shipped = state.salesOrders.find(order => order.shipment?.shippedAt && state.productionOrders.some(op => op.salesOrderId === order.id && op.kind === 'Montagem'))!
    const technical = createTechnicalOrder(state, { salesOrderId: shipped.id, description: 'Trava quebrada' }, 'Assistência')
    expect(technical.warranty).toBe(true)
    expect(state.nonConformities.some(nc => nc.id === technical.nonConformityId)).toBe(true)
    const part = state.items.find(entry => entry.type === 'CP')!
    addTechnicalPart(state, technical.id, part.id, availableQty(state, part.id) + 5, 'Assistência')
    expect(technical.status).toBe('Aguardando peça')
    const demand = state.demands.find(entry => entry.id === technical.demandIds![0])!
    expect(demand).toMatchObject({ origin: 'Assistência', originId: technical.id })
  })

  it('cria projeto com marcos e previsão na categoria de P&D', () => {
    const state = createSeedState()
    const project = createProject(state, { name: 'Novo molde', kind: 'Molde', ownerId: 'u13', startDate: '2026-10-20', endDate: '2027-01-20', budget: 50000 }, 'Engenharia')
    expect(project.milestones).toHaveLength(4)
    const budget = state.budgets.find(entry => entry.id === project.budgetId)!
    expect(budget).toMatchObject({ categoryId: 'BC-PD', period: '2026' })
    expect(state.budgetEntries.find(entry => entry.sourceId === project.id)).toMatchObject({ amount: 50000, projectId: project.id, kind: 'Previsão' })
  })
})

describe('cadastro de itens', () => {
  const classOf = (state: ErpState) => state.itemClasses[0].id
  const novo = (state: ErpState, extra: Partial<{ name: string; type: 'MP' | 'PA'; unit: string }> = {}) =>
    createItem(state, { name: 'Resina experimental azul', type: 'MP', unit: 'kg', classId: classOf(state), ...extra }, 'Eduardo', 'Engenharia')

  it('cria rascunho com código sequencial, exige classificação e respeita o papel', () => {
    const state = createSeedState()
    const item = novo(state)
    expect(item.code).toMatch(/^RF-\d{5}$/)
    expect(Number(item.code.slice(3))).toBeGreaterThan(10006)
    expect(item.catalog?.lifecycle).toBe('Rascunho')
    expect(() => createItem(state, { name: 'Sem nó', type: 'MP', unit: 'kg', classId: '' }, 'Eduardo', 'Engenharia')).toThrow(/Classifique/)
    expect(() => createItem(state, { name: 'Pelo comercial', type: 'MP', unit: 'kg', classId: classOf(state) }, 'Camila', 'Comercial')).toThrow(/Engenharia/)
    expect(similarItems(state, 'ABS cinza especial', item.id).some(entry => entry.id === 'mp-abs-cinza')).toBe(true)
  })

  it('homologa por papel e só ativa com fiscal, estrutura e comercial completos', () => {
    const state = createSeedState()
    const item = novo(state, { name: 'Case de teste', type: 'PA', unit: 'un' })
    submitItem(state, item.id, 'Eduardo', 'Engenharia')
    expect(() => approveItem(state, item.id, 'fiscal', 'Camila', 'Comercial')).toThrow(/papel|perfil/)
    expect(() => approveItem(state, item.id, 'fiscal', 'Patrícia', 'Financeiro')).toThrow(/NCM/)
    item.catalog!.ncm = '39269090'
    item.catalog!.cClassTrib = '000001'
    expect(() => approveItem(state, item.id, 'fiscal', 'Patrícia', 'Financeiro')).toThrow(/CEST/)
    item.catalog!.cest = '28.061.00'
    expect(approveItem(state, item.id, 'fiscal', 'Patrícia', 'Financeiro')).toBe('Em homologação')
    expect(() => approveItem(state, item.id, 'pcp', 'Paulo', 'PCP')).toThrow(/estrutura/)
    item.bom = [{ itemId: 'se-mold-a11', quantity: 1 }]
    item.routing = [{ id: 'r1', name: 'Montar', resourceId: 'mont1', minutesPerUnit: 1, instructions: [] }]
    approveItem(state, item.id, 'pcp', 'Paulo', 'PCP')
    expect(() => approveItem(state, item.id, 'comercial', 'Camila', 'Comercial')).toThrow(/comercial|EAN/)
    updateCommercial(state, item.id, { commercialName: 'Case teste', brand: 'Roboflex Hard', productLine: 'Teste', categories: ['Cases robustos'] }, 'Camila', 'Comercial')
    addBarcode(state, item.id, { code: withCheckDigit('789100000099'), kind: 'EAN-13', unit: 'un', main: true }, 'Camila', 'Comercial')
    expect(() => approveItem(state, item.id, 'comercial', 'Camila', 'Comercial')).toThrow(/preço/)
    setPrice(state, item.id, { tableId: DEFAULT_PRICE_TABLE, unit: 'un', value: 300, validFrom: today() }, 'Camila', 'Comercial')
    expect(approveItem(state, item.id, 'comercial', 'Camila', 'Comercial')).toBe('Ativo')
    expect(item.catalog!.audit.some(entry => entry.field === 'Situação' && entry.to === 'Ativo')).toBe(true)
  })

  it('recusa EAN inválido ou repetido e grava auditoria por campo', () => {
    const state = createSeedState()
    const owner = state.items.find(entry => entry.catalog?.gtin)!
    const item = novo(state)
    expect(() => addBarcode(state, item.id, { code: '7891000000001', kind: 'EAN-13', unit: 'kg', main: true }, 'Marina', 'Gestor')).toThrow(/verificador/)
    expect(() => addBarcode(state, item.id, { code: owner.catalog!.gtin, kind: 'EAN-13', unit: 'kg', main: true }, 'Marina', 'Gestor')).toThrow(owner.code)
    const before = item.catalog!.version
    updateCore(state, item.id, { name: 'Resina azul', type: 'MP', unit: 'kg', classId: classOf(state) }, 'Eduardo', 'Engenharia')
    expect(item.catalog!.version).toBe(before + 1)
    expect(item.catalog!.audit[0]).toMatchObject({ field: 'Descrição', from: 'Resina experimental azul', to: 'Resina azul', actor: 'Eduardo' })
  })

  it('congela tipo e unidade do ativo e muda campo-chave só por exceção aprovada por outra pessoa', () => {
    const state = createSeedState()
    const item = state.items.find(entry => entry.id === 'cp-paraf')!
    const core = { name: item.name, type: item.type, unit: item.unit, classId: item.catalog!.classId }
    expect(() => updateCore(state, item.id, { ...core, type: 'MP' }, 'Eduardo', 'Engenharia')).toThrow(/tipo/)
    expect(() => updateCore(state, item.id, { ...core, unit: 'cento' }, 'Eduardo', 'Engenharia')).toThrow(/exceção/)
    const request = requestKeyChange(state, item.id, 'unit', 'pç', 'Padronizar com o Omie', 'Eduardo', 'Engenharia')
    expect(() => decideKeyChange(state, item.id, request.id, true, '', 'Eduardo', 'Gestor')).toThrow(/própria/)
    expect(() => decideKeyChange(state, item.id, request.id, true, '', 'Paulo', 'PCP')).toThrow(/gestão/)
    decideKeyChange(state, item.id, request.id, true, '', 'Marina', 'Gestor')
    expect(item.unit).toBe('pç')
    expect(request).toMatchObject({ status: 'Aprovada', decidedBy: 'Marina' })
  })

  it('bloqueado não entra em compra nem proposta, e obsoleto ainda é consumido', () => {
    const state = createSeedState()
    blockItem(state, 'mp-abs', 'Fornecedor reprovado na auditoria', 'Marina', 'Gestor')
    expect(() => materialDemand(state, 'mp-abs', 10)).toThrow(/bloqueado/)
    blockItem(state, 'pa-a11-ext', 'Recall em análise', 'Marina', 'Gestor')
    const opportunity = createOpportunity(state, { partnerId: 'c1', title: 'Teste', ownerId: 'u12', value: 0, expectedClose: '2026-11-30', source: 'Site', nextAction: 'Ligar', itemIds: ['pa-a11-ext'], quantity: 5 }, 'Comercial')
    expect(() => createProposal(state, opportunity.id, 'Comercial')).toThrow(/bloqueado/)
    obsoleteItem(state, 'mp-abs', 'Substituído pelo ABS UV', 'Marina', 'Gestor')
    const demand = materialDemand(state, 'mp-abs', 1)
    attendDemandFromStock(state, demand.id, 'Almoxarifado')
    expect(demand.status).toBe('Atendida')
  })

  it('baixa lotes por FEFO e recusa saldo negativo', () => {
    const state = createSeedState()
    const tpu = state.items.find(entry => entry.id === 'mp-tpu')!
    const used = consumeStock(state, tpu, 1.5)
    expect(used).toMatch(/^L260815-007 \(1\.2\), L260930-022 \(0\.3\)$/)
    expect(() => consumeStock(state, tpu, 5)).toThrow(/negativo/)
    tpu.catalog!.allowNegative = true
    consumeStock(state, tpu, 5)
    expect(tpu.stock).toBeLessThan(0)
  })

  it('versiona a estrutura com vigência e a OP grava a versão usada', () => {
    const state = createSeedState()
    const item = state.items.find(entry => entry.id === 'pa-a11-imp')!
    const previous = item.currentRevisionId!
    const revision = openBomVersion(state, item.id, 'Trocar parafusos', 'Eduardo', 'Engenharia')
    expect(() => setBomLine(state, revision.id, item.id, 1, 'Eduardo', 'Engenharia')).toThrow(/si mesmo/)
    expect(() => setBomLine(state, revision.id, 'mp-abs-cinza', 1, 'Eduardo', 'Engenharia')).toThrow(/rascunho/)
    expect(() => setBomLine(state, revision.id, 'cp-paraf', 0, 'Eduardo', 'Engenharia')).toThrow(/maior/)
    setBomLine(state, revision.id, 'cp-paraf', 12, 'Eduardo', 'Engenharia')
    revision.checklist.forEach(entry => { entry.done = true })
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    releaseRevision(state, revision.id, 'Eduardo', future)
    expect(item.currentRevisionId).toBe(previous)
    expect(state.productRevisions.find(entry => entry.id === previous)!.validTo).toBeTruthy()
    applyDueRevisions(state, future)
    expect(item.currentRevisionId).toBe(revision.id)
    expect(item.bom!.find(line => line.itemId === 'cp-paraf')!.quantity).toBe(12)
    expect(state.productRevisions.find(entry => entry.id === previous)!.status).toBe('Substituída')
  })

  it('recusa conversão inválida e cadeia, e só inativa sem pendências', () => {
    const state = createSeedState()
    const item = state.items.find(entry => entry.id === 'mp-abs')!
    expect(() => addConversion(state, item.id, { unit: 'kg', factor: 25, context: 'Compra' }, 'Carlos', 'Compras')).toThrow(/base/)
    expect(() => addConversion(state, item.id, { unit: 'big-bag', factor: 0, context: 'Compra' }, 'Carlos', 'Compras')).toThrow(/maior/)
    addConversion(state, item.id, { unit: 'big-bag', factor: 500, context: 'Compra' }, 'Carlos', 'Compras')
    expect(convertQuantity(item, 2, 'big-bag', 'kg')).toBe(1000)
    expect(() => convertQuantity(item, 1, 'saco', 'big-bag')).toThrow(/cadeia/)
    expect(() => inactivateItem(state, item.id, 'Fim de linha', 'Marina', 'Gestor')).toThrow(/obsoletar/)
    obsoleteItem(state, item.id, 'Fim de linha', 'Marina', 'Gestor')
    expect(() => inactivateItem(state, item.id, 'Fim de linha', 'Marina', 'Gestor')).toThrow(/Saldo/)
    expect(openPendencies(state, item.id).length).toBeGreaterThan(0)
  })

  it('apaga de verdade o rascunho nunca usado e exclui logicamente o que já foi usado', () => {
    const state = createSeedState()
    const fresh = novo(state)
    expect(deleteItem(state, fresh.id, 'Criado por engano', 'Eduardo', 'Engenharia')).toBe('física')
    expect(state.items.some(entry => entry.id === fresh.id)).toBe(false)
    const used = novo(state, { name: 'Resina usada em demanda' })
    state.demands.unshift({ ...state.demands[0], id: 'DM-X', itemId: used.id })
    expect(deleteItem(state, used.id, 'Duplicado', 'Eduardo', 'Engenharia')).toBe('lógica')
    expect(used.catalog!.deletedAt).toBeTruthy()
    expect(() => assertUsable(used, 'consumo')).toThrow(/excluído/)
    expect(() => restoreItem(state, used.id, 'Eduardo', 'Engenharia')).toThrow(/gestão/)
    restoreItem(state, used.id, 'Marina', 'Gestor')
    expect(used.catalog!.deletedAt).toBeUndefined()
  })
})

describe('cadastro completo: camadas estendidas', () => {
  const find = (state: ErpState, id: string) => state.items.find(entry => entry.id === id)!

  it('compra respeita lote mínimo e múltiplo, e a perda prevista aumenta a necessidade', () => {
    const state = createSeedState()
    const abs = find(state, 'mp-abs')
    expect(purchaseLot(abs, 30)).toBe(100)
    expect(purchaseLot(abs, 110)).toBe(125)
    expect(lineNeed({ quantity: 0.11, loss: 3 }, 100)).toBeCloseTo(11.33, 2)
    const frame = find(state, 'se-mold-a11')
    expect(frame.bom![0].loss).toBe(3)
  })

  it('custo-padrão e preço têm vigência: o futuro entra sozinho no dia e o vigente fecha na véspera', () => {
    const state = createSeedState()
    const imp = find(state, 'pa-a11-imp')
    const start = addDays(today(), 5)
    setStandardCost(state, imp.id, 120, start, 'Reajuste do bumper', 'Paulo', 'PCP')
    expect(imp.cost).toBe(112)
    applyDueRevisions(state, start)
    expect(imp.cost).toBe(120)
    expect(() => setStandardCost(state, imp.id, 130, addDays(today(), -1), 'Retroativo', 'Paulo', 'PCP')).toThrow(/vigência/)

    const before = currentPrice(imp)!
    const next = addDays(today(), 40)
    setPrice(state, imp.id, { tableId: 'TP-ECOM', unit: 'un', value: 479, validFrom: next }, 'Camila', 'Comercial')
    const ecom = imp.catalog!.prices.filter(entry => entry.tableId === 'TP-ECOM').sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    expect(ecom[0].validTo).toBe(addDays(next, -1))
    expect(currentPrice(imp)!.value).toBe(before.value)
    expect(currentPrice(imp, 'TP-ECOM', 'un', next)!.value).toBe(479)
    expect(() => setPrice(state, imp.id, { tableId: 'TP-ECOM', unit: 'cx', value: 1, validFrom: next }, 'Camila', 'Comercial')).toThrow(/conversão/)
  })

  it('kit virtual explode em componentes no pedido e a expedição baixa cada componente', () => {
    const state = createSeedState()
    expect(approveItem(state, 'kt-vitrine', 'comercial', 'Camila', 'Comercial')).toBe('Ativo')
    const opportunity = createOpportunity(state, { partnerId: 'c4', title: 'Vitrine', ownerId: 'u12', value: 0, expectedClose: '2026-11-30', source: 'Site', nextAction: 'Ligar', itemIds: ['kt-vitrine'], quantity: 2 }, 'Comercial')
    const proposal = createProposal(state, opportunity.id, 'Comercial')
    expect(proposal.lines[0].unitPrice).toBe(470)
    advanceProposal(state, proposal.id, 'Comercial')
    advanceProposal(state, proposal.id, 'Comercial')
    const order = state.salesOrders.find(entry => entry.id === proposal.salesOrderId)!
    expect(order.itemId).toBe('pa-a11-imp')
    expect(order.lines!.map(line => [line.itemId, line.quantity, line.kitId])).toEqual([['pa-a11-imp', 2, 'kt-vitrine'], ['cp-pelic', 4, 'kt-vitrine']])
    expect(order.lines!.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)).toBeCloseTo(940, 0)

    const imp = find(state, 'pa-a11-imp')
    const film = find(state, 'cp-pelic')
    imp.stock = 10
    const filmBefore = film.stock
    order.shipment = { status: 'Conferido' } as never
    shipOrder(state, order.id, 'Rafael')
    expect(imp.stock).toBe(8)
    expect(film.stock).toBe(filmBefore - 4)
  })

  it('EAN múltiplo com principal sincronizado, único no cadastro e com sequência gerada', () => {
    const state = createSeedState()
    const ext = find(state, 'pa-a11-ext')
    const code = nextBarcode(state)
    expect(code).toHaveLength(13)
    expect(state.items.some(item => item.catalog?.barcodes.some(entry => entry.code === code))).toBe(false)
    addBarcode(state, ext.id, { code, kind: 'EAN-13', unit: 'un', main: false }, 'Camila', 'Comercial')
    setMainBarcode(state, ext.id, code, 'Camila', 'Comercial')
    expect(ext.catalog!.gtin).toBe(code)
    expect(() => addBarcode(state, 'pa-a11-imp', { code, kind: 'EAN-13', unit: 'un', main: false }, 'Camila', 'Comercial')).toThrow(ext.code)
    expect(() => addBarcode(state, ext.id, { code: '123', kind: 'DUN-14', unit: 'cx10', main: false }, 'Camila', 'Comercial')).toThrow(/14 dígitos/)
    const imp = find(state, 'pa-a11-imp')
    expect(() => removeBarcode(state, imp.id, imp.catalog!.gtin, 'Camila', 'Comercial')).toThrow(/principal/)
  })

  it('GTIN × NCM divergente vira pendência e trava a aprovação fiscal', () => {
    const state = createSeedState()
    const lite = find(state, 'pa-lite-ipad')
    expect(itemFlags(state, lite)).toContain('GTIN × NCM divergente')
    expect(approvalIssues(lite, 'fiscal').join(' ')).toMatch(/CCG/)
    expect(itemFlags(state, find(state, 'pa-a11-ext'))).not.toContain('GTIN × NCM divergente')
  })

  it('matriz fiscal sugere pela regra mais específica e o SPED lista só itens ativos', () => {
    const state = createSeedState()
    const ext = find(state, 'pa-a11-ext')
    expect(suggestTaxes(state, ext, 'Venda', 'MG')).toMatchObject({ cst: '010', rule: { id: 'MF-2', cfop: '5401' } })
    expect(suggestTaxes(state, ext, 'Venda', 'SP')!.rule).toMatchObject({ id: 'MF-4', icms: 12 })
    expect(suggestTaxes(state, ext, 'Venda', 'GO')!.rule).toMatchObject({ id: 'MF-3', icms: 7 })
    expect(suggestTaxes(state, find(state, 'cp-paraf'), 'Venda', 'MG')!.rule.id).toBe('MF-1')
    const sped = spedRegisters(state)
    expect(sped.lines.some(line => line.startsWith(`|0200|${ext.code}|`))).toBe(true)
    expect(sped.lines.some(line => line.includes('|0200|RF-10001|'))).toBe(false)
    expect(sped.lines.some(line => line.startsWith('|0220|cx10|'))).toBe(true)
    expect(sped.lines.some(line => line.startsWith('|0190|un|'))).toBe(true)
  })

  it('curva ABC é calculada pelo consumo e a reforma programada entra pela vigência', () => {
    const state = createSeedState()
    const abc = abcAnalysis(state)
    const classes = [...abc.values()].map(entry => entry.cls)
    expect(classes).toContain('A')
    expect(classes).toContain('C')
    const top = [...abc.values()].sort((a, b) => b.value - a.value)[0]
    expect(top.cls).toBe('A')
    const ext = find(state, 'pa-a11-ext')
    expect(ext.catalog!.cClassTrib).toBe('000001')
    const start = addDays(today(), 3)
    addReformEntry(state, ext.id, { cClassTrib: '000002', ibsReduction: 30, cbsReduction: 30, validFrom: start }, 'Patrícia', 'Financeiro')
    applyDueRevisions(state, start)
    expect(ext.catalog!.cClassTrib).toBe('000002')
  })

  it('grade gera itens reais em rascunho, herdando o fiscal e sem repetir combinação', () => {
    const state = createSeedState()
    const created = generateVariants(state, 'GR-1', [{ Cor: 'Laranja segurança' }], 'Eduardo', 'Engenharia')
    expect(created).toHaveLength(1)
    const variant = created[0]
    expect(variant.code).toMatch(/^RF-\d{5}$/)
    expect(variant.catalog).toMatchObject({ lifecycle: 'Rascunho', ncm: '39269090', modelId: 'GR-1', attributes: { Cor: 'Laranja segurança' }, barcodes: [] })
    expect(() => generateVariants(state, 'GR-1', [{ Cor: 'Laranja segurança' }], 'Eduardo', 'Engenharia')).toThrow(/combinação/)
    expect(() => createModel(state, { templateId: 'pa-a11-imp', name: 'Outra', axes: [{ name: 'Cor', values: ['Preto'] }], templateAttributes: { Cor: 'Preto' } }, 'Eduardo', 'Engenharia')).toThrow(/grade/)
    expect(() => generateVariants(state, 'GR-1', [{ Cor: 'Azul petróleo' }], 'Camila', 'Comercial')).toThrow(/Engenharia/)
  })

  it('vínculo de projeto exige atividade da EAP para a aprovação técnica; mídia e roteiro ficam auditados', () => {
    const state = createSeedState()
    const item = createItem(state, { name: 'Case S10 protótipo', type: 'PA', unit: 'un', classId: state.itemClasses[0].id }, 'Eduardo', 'Engenharia')
    linkProject(state, item.id, { projectId: 'PRJ-26-014', note: 'Protótipo' }, 'Eduardo', 'Engenharia')
    expect(approvalIssues(item, 'tecnica')).toContain('Vínculo de projeto sem atividade da EAP')
    linkProject(state, item.id, { projectId: 'PRJ-26-014', milestoneId: 'm2', note: 'Protótipo' }, 'Eduardo', 'Engenharia')
    expect(() => linkProject(state, item.id, { projectId: 'PRJ-26-014', milestoneId: 'm2', note: '' }, 'Eduardo', 'Engenharia')).toThrow(/existe/)
    expect(() => linkProject(state, item.id, { projectId: 'PRJ-26-014', milestoneId: 'm9', note: '' }, 'Eduardo', 'Engenharia')).toThrow(/EAP/)

    const photo = addMedia(state, item.id, { kind: 'Foto', name: 'frente.png', dataUrl: 'data:image/png;base64,AAAA', size: 10 }, 'Camila', 'Comercial')
    expect(photo.main).toBe(true)
    expect(() => addMedia(state, item.id, { kind: 'Desenho', name: 'grande.pdf', size: 5_000_000 }, 'Camila', 'Comercial')).toThrow(/limite/)
    expect(() => addMedia(state, item.id, { kind: 'Foto', name: 'x', size: 1 }, 'Paulo', 'PCP')).toThrow(/PCP/)

    saveRoutingStep(state, item.id, { name: 'Montagem', resourceId: 'mont1', minutesPerUnit: 4, instructions: ['Fixar moldura'] }, 'Eduardo', 'Engenharia')
    expect(item.routing).toHaveLength(1)
    expect(item.catalog!.audit[0].field).toMatch(/Roteiro/)
    expect(() => saveRoutingStep(state, item.id, { name: 'Sem recurso', resourceId: 'x', minutesPerUnit: 1, instructions: [] }, 'Eduardo', 'Engenharia')).toThrow(/recurso/)
  })

  it('prazo de entrega soma a fabricação ao maior lead time de compra dos componentes', () => {
    const state = createSeedState()
    const item = find(state, 'pa-a11-ext')
    const slowest = Math.max(0, ...(item.bom ?? []).map(line => find(state, line.itemId).leadTimeDays ?? 0))
    item.catalog!.productionLeadDays = 5
    expect(deliveryLead(state, item)).toBe(5 + slowest)
    item.catalog!.productionLeadDays = 0
    expect(deliveryLead(state, item)).toBe(item.leadTimeDays ?? 14)
  })
})