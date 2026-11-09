import { describe, expect, it } from 'vitest'
import { createSeedState } from '../mocks/seed'
import { addSyncLog, confirmDelivery, planOrder, salesOrderStatus } from '../domain/engine'
import {
  addProposalLine, advanceProposal, cancelProposal, cancelSalesOrder, changeSalesOrderLine, confirmSalesOrder, createTechnicalOrder, decideReceipt,
  expireProposals, openToReceive, receivePurchase, rejectRevision, releaseRevision, reviseProposal, updateAsset,
} from '../domain/enterprise'
import { activateRental, approveWarrantyPolicy, cancelRental, openWarranty, rentalStatus, returnRental, warrantyCoverage, warrantyStatus } from '../domain/aftersales'
import { recordTraining, trainingAlerts, trainingStatus } from '../domain/training'
import { approveMovement, closeInventoryCount, completeMovement, countInventoryLine, openInventory, requestMovement, resolveInventoryLine, setDepreciation } from '../domain/patrimony'
import { registryOptions, saveRegistryEntry, setOmieSource, setRegistryStatus } from '../domain/registry'

const acceptCaseProposal = () => {
  const state = createSeedState()
  const proposal = state.proposals.find(entry => entry.id === 'PROP-26020')!
  advanceProposal(state, proposal.id, 'Lucas Lima')
  advanceProposal(state, proposal.id, 'Camila Nunes')
  return { state, proposal, order: state.salesOrders.find(entry => entry.id === proposal.salesOrderId)! }
}

describe('pedido nasce no Thalamus', () => {
  it('desconto acima do limite passa por outra pessoa antes de ir ao cliente', () => {
    const state = createSeedState()
    const proposal = state.proposals.find(entry => entry.id === 'PROP-26020')!
    expect(proposal.status).toBe('Em aprovação')
    expect(() => advanceProposal(state, proposal.id, 'Camila Nunes')).toThrow(/própria/)
    advanceProposal(state, proposal.id, 'Lucas Lima')
    expect(proposal).toMatchObject({ status: 'Enviada', approvedBy: 'Lucas Lima' })
  })

  it('o pedido aceito aguarda análise, só é planejado depois de confirmado e então segue ao Omie', () => {
    const { state, order } = acceptCaseProposal()
    expect(order).toMatchObject({ origin: 'Thalamus', paymentTerms: '28/56 dias' })
    expect(order.omieId).toBeUndefined()
    expect(order.lines!.find(line => line.itemId === 'cst040435')!.revision).toBe('A')
    expect(salesOrderStatus(state, order)).toBe('Aguardando análise')
    expect(() => planOrder(state, order.id, 'PCP')).toThrow(/Confirme/)
    confirmSalesOrder(state, order.id, 'Camila Nunes')
    expect(order.omieId).toMatch(/^OM-/)
    expect(salesOrderStatus(state, order)).toBe('Confirmado')
    expect(state.syncLogs[0]).toMatchObject({ entity: 'Pedido de venda', status: 'sincronizado' })
  })

  it('sem Omie configurado o pedido fica só no Thalamus e a sincronização é ignorada', () => {
    const { state, order } = acceptCaseProposal()
    state.omieConnections.find(entry => entry.tenantId === 'tenant-roboflex')!.status = 'Não configurada'
    confirmSalesOrder(state, order.id, 'Camila Nunes')
    expect(order.omieId).toBeUndefined()
    expect(state.syncLogs[0]).toMatchObject({ status: 'ignorado', message: expect.stringContaining('sem Omie') })
  })

  it('alterar linha do pedido exige motivo e fica registrado; cancelar também', () => {
    const { state, order } = acceptCaseProposal()
    expect(() => changeSalesOrderLine(state, order.id, 0, { quantity: 10 }, ' ', 'Camila Nunes')).toThrow(/motivo/)
    changeSalesOrderLine(state, order.id, 0, { quantity: 10 }, 'Cliente reduziu o lote piloto', 'Camila Nunes')
    expect(order.changes).toEqual([expect.objectContaining({ field: 'quantity', from: 12, to: 10, reason: 'Cliente reduziu o lote piloto' })])
    const gross = order.lines!.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
    expect(order.value).toBeLessThan(gross)
    expect(() => cancelSalesOrder(state, order.id, '', 'Camila Nunes')).toThrow(/motivo/)
    cancelSalesOrder(state, order.id, 'Cliente desistiu', 'Camila Nunes')
    expect(salesOrderStatus(state, order)).toBe('Cancelado')
    expect(() => planOrder(state, order.id, 'PCP')).toThrow()
  })

  it('proposta enviada vence pela validade e ganha nova versão; cancelar exige motivo', () => {
    const state = createSeedState()
    const sent = state.proposals.find(entry => entry.id === 'PROP-26018')!
    sent.validUntil = '2020-01-01'
    expireProposals(state)
    expect(sent.status).toBe('Vencida')
    const next = reviseProposal(state, sent.id, 'Camila Nunes')
    expect(next).toMatchObject({ id: 'PROP-26018-v2', version: 2, rootId: 'PROP-26018', status: 'Rascunho' })
    expect(() => cancelProposal(state, next.id, '', 'Camila Nunes')).toThrow(/motivo/)
    cancelProposal(state, next.id, 'Cliente pediu nova negociação', 'Camila Nunes')
    expect(next.status).toBe('Cancelada')
  })

  it('item provisório do P&D não entra em proposta', () => {
    const state = createSeedState()
    expect(state.items.find(entry => entry.id === 'mh-pd-001')!.catalog!.lifecycle).toBe('Em criação')
    expect(() => addProposalLine(state, 'PROP-26019', { itemId: 'mh-pd-001', quantity: 1 }, 'Camila Nunes')).toThrow()
  })
})

describe('fonte oficial por entidade no Omie', () => {
  it('entidade pendente não sincroniza e o sentido precisa combinar com a fonte', () => {
    const state = createSeedState()
    expect(addSyncLog(state, { entity: 'Centro de custo', reference: 'CC-1', direction: 'Omie → Thalamus', status: 'sincronizado', message: 'Teste' }).status).toBe('ignorado')
    setOmieSource(state, 'Cliente', 'Pendente', 'Enviar', 'Lucas Lima')
    expect(addSyncLog(state, { entity: 'Cliente', reference: 'CL-1', direction: 'Thalamus → Omie', status: 'sincronizado', message: 'Teste' }).status).toBe('ignorado')
    expect(() => setOmieSource(state, 'Cliente', 'Thalamus', 'Receber', 'Lucas Lima')).toThrow(/envia/)
    setOmieSource(state, 'Cliente', 'Thalamus', 'Enviar', 'Lucas Lima')
    expect(addSyncLog(state, { entity: 'Cliente', reference: 'CL-1', direction: 'Thalamus → Omie', status: 'sincronizado', message: 'Teste' }).status).toBe('sincronizado')
  })
})

describe('revisão de estrutura', () => {
  it('quem elabora não libera nem rejeita; rejeitar exige motivo', () => {
    const state = createSeedState()
    const draft = state.productRevisions.find(entry => entry.status === 'Rascunho')!
    draft.checklist.forEach(entry => { entry.done = true })
    expect(() => releaseRevision(state, draft.id, draft.createdBy!)).toThrow(/outra pessoa/)
    expect(() => rejectRevision(state, draft.id, '', 'Paulo Mendes')).toThrow(/motivo/)
    expect(() => rejectRevision(state, draft.id, 'Sem ensaio', draft.createdBy!)).toThrow(/elaborou/)
    rejectRevision(state, draft.id, 'Falta o ensaio de vedação', 'Paulo Mendes')
    expect(draft).toMatchObject({ status: 'Rejeitada', rejectedBy: 'Paulo Mendes', rejectionReason: 'Falta o ensaio de vedação' })
    expect(() => releaseRevision(state, draft.id, 'Paulo Mendes')).toThrow(/rascunho/)
  })
})

describe('recebimento com conferência', () => {
  it('só o aceito entra no saldo; o bloqueado espera decisão de outra pessoa', () => {
    const state = createSeedState()
    const board = state.items.find(entry => entry.id === 'cp-placa')!
    const stock = board.stock
    const order = state.purchaseOrders.find(entry => entry.id === 'PC-7311')!
    expect(openToReceive(state, order)).toBe(0)
    expect(() => decideReceipt(state, 'RB-2', 'Aceitar', 'ok', 'Carlos Lima')).toThrow(/outra pessoa/)
    expect(() => decideReceipt(state, 'RB-2', 'Aceitar', '', 'Juliana Reis')).toThrow(/motivo/)
    decideReceipt(state, 'RB-2', 'Devolver', 'Fornecedor repõe na próxima remessa', 'Juliana Reis')
    expect(board.stock).toBe(stock)
    expect(openToReceive(state, order)).toBe(20)
    expect(() => receivePurchase(state, order.id, { received: 20, accepted: 18, check: 'Conforme' }, 'Carlos Lima')).toThrow(/conforme/)
    expect(() => receivePurchase(state, order.id, { received: 20, accepted: 18, check: 'Divergência' }, 'Carlos Lima')).toThrow(/Descreva/)
    const receipt = receivePurchase(state, order.id, { received: 20, accepted: 18, check: 'Divergência', note: 'Duas sem etiqueta' }, 'Carlos Lima')
    expect(receipt.status).toBe('Bloqueado')
    expect(board.stock).toBe(stock + 18)
    expect(order.status).toBe('Recebido parcial')
    decideReceipt(state, receipt.id, 'Aceitar', 'Etiqueta reimpressa aqui', 'Juliana Reis')
    expect(board.stock).toBe(stock + 20)
    expect(order.status).toBe('Recebido')
  })
})

describe('garantia', () => {
  it('nasce da entrega; sem regra aprovada fica pendente e a aprovação ativa', () => {
    const state = createSeedState()
    const order = state.salesOrders.find(entry => entry.id === 'PV-2026-1033')!
    state.warranties = []
    order.shipment!.status = 'Faturado'
    confirmDelivery(state, order.id, 'Bianca Alves', 'Rafael Souza')
    const warranty = openWarranty(state, order, 'Rafael Souza')!
    expect(warranty.status).toBe('Pendente')
    expect(warrantyCoverage(state, order).reason).toMatch(/pendente/)
    approveWarrantyPolicy(state, 'Lucas Lima')
    expect(warranty.status).toBe('Ativa')
    expect(warrantyStatus(warranty, '2099-01-01')).toBe('Vencida')
    const call = createTechnicalOrder(state, { salesOrderId: order.id, description: 'Conector solto' }, 'Assistência')
    expect(call.warranty).toBe(true)
  })
})

describe('locação', () => {
  it('ativa só com aprovação de outra pessoa, marca o bem como locado e registra o retorno', () => {
    const state = createSeedState()
    const asset = state.assets.find(entry => entry.id === 'a-demo-a11')!
    expect(() => activateRental(state, 'LC-1', 'Camila Nunes')).toThrow(/propôs/)
    const contract = activateRental(state, 'LC-1', 'Lucas Lima')
    expect(contract.status).toBe('Ativo')
    expect(asset.status).toBe('Locado')
    expect(() => updateAsset(state, asset.id, { status: 'Operando' }, 'Lucas Lima')).toThrow(/locação/)
    expect(rentalStatus(contract, '2099-01-01')).toBe('Atrasado')
    expect(() => cancelRental(state, 'LC-1', 'Desistiu', 'Camila Nunes')).toThrow(/retorno/)
    expect(() => returnRental(state, 'LC-1', 'Com avaria', '', 'Camila Nunes')).toThrow(/avaria/)
    returnRental(state, 'LC-1', 'Com avaria', 'Tela trincada', 'Camila Nunes')
    expect(asset).toMatchObject({ status: 'Parado', condition: 'Com avaria' })
  })
})

describe('treinamentos', () => {
  it('validade calculada e alerta de vencimento, sem bloquear operação', () => {
    const state = createSeedState()
    const expired = state.trainings.find(entry => entry.validUntil && entry.validUntil < '2026-01-01')!
    expect(trainingStatus(expired)).toBe('Vencido')
    expect(trainingAlerts(state).map(entry => entry.id)).toContain(expired.id)
    expect(() => recordTraining(state, { personId: expired.personId, name: 'Teste', kind: 'Outro', result: 'Aprovado' }, 'RH')).toThrow(/realização/)
    const pending = recordTraining(state, { personId: expired.personId, name: 'Brigada de incêndio', kind: 'Segurança' }, 'RH')
    expect(trainingStatus(pending)).toBe('Pendente')
  })
})

describe('patrimônio', () => {
  it('localização muda só pela movimentação concluída, aprovada por outra pessoa', () => {
    const state = createSeedState()
    const asset = state.assets.find(entry => entry.id === 'a-teste')!
    expect(() => updateAsset(state, asset.id, { facilityId: 'IN-1' }, 'Diego Martins')).toThrow(/movimentação/)
    const movement = requestMovement(state, { assetId: asset.id, reason: 'Transferência', toFacilityId: 'IN-1' }, 'Diego Martins')
    expect(() => requestMovement(state, { assetId: asset.id, reason: 'Transferência', toFacilityId: 'IN-3' }, 'Diego Martins')).toThrow(/aberto/)
    expect(() => approveMovement(state, movement.id, 'Diego Martins')).toThrow(/solicitou/)
    expect(() => completeMovement(state, movement.id, 'Diego Martins')).toThrow(/Aprove/)
    approveMovement(state, movement.id, 'Lucas Lima')
    completeMovement(state, movement.id, 'Diego Martins')
    expect(asset.facilityId).toBe('IN-1')
  })

  it('inventário com divergência fica pendente até cada uma ser tratada', () => {
    const state = createSeedState()
    const pending = state.assetInventories.find(entry => entry.id === 'IV-1')!
    expect(pending.status).toBe('Pendente')
    resolveInventoryLine(state, pending.id, 'mold-s9t', 'Molde estava no fornecedor para ajuste', 'Diego Martins')
    expect(pending.status).toBe('Conciliado')

    const inventory = openInventory(state, 'IN-2', 'Diego Martins')
    expect(() => closeInventoryCount(state, inventory.id, 'Diego Martins')).toThrow(/todos/)
    for (const line of inventory.lines) countInventoryLine(state, inventory.id, line.assetId, true, 'Bom', 'Diego Martins')
    expect(closeInventoryCount(state, inventory.id, 'Diego Martins').status).toBe('Conciliado')
  })

  it('depreciação é cadastro: residual não passa do valor de aquisição', () => {
    const state = createSeedState()
    expect(() => setDepreciation(state, 'a-inj1', { residualValue: 900000 }, 'Lucas Lima')).toThrow(/residual/)
    expect(setDepreciation(state, 'a-inj1', { residualValue: 80000, usefulLifeYears: 12 }, 'Lucas Lima')).toMatchObject({ usefulLifeYears: 12, depreciationMethod: 'Linear' })
  })
})

describe('cadastros gerais', () => {
  it('não duplica opção por tipo, ignorando acento, e mantém ao menos uma ativa', () => {
    const state = createSeedState()
    expect(registryOptions(state, 'Origem de oportunidade')).toEqual(['Indicação', 'Site', 'Prospecção', 'Cliente existente', 'Outro'])
    expect(() => saveRegistryEntry(state, { kind: 'Origem de oportunidade', code: '99', description: 'indicacao' }, 'Lucas Lima')).toThrow(/já está cadastrado/)
    saveRegistryEntry(state, { kind: 'Origem de oportunidade', code: '06', description: 'Feira' }, 'Lucas Lima')
    expect(registryOptions(state, 'Origem de oportunidade')).toContain('Feira')
    const coins = state.registry.filter(entry => entry.kind === 'Moeda')
    setRegistryStatus(state, coins[1].id, 'Inativo', 'Lucas Lima')
    expect(() => setRegistryStatus(state, coins[0].id, 'Inativo', 'Lucas Lima')).toThrow(/ao menos uma/)
  })
})
