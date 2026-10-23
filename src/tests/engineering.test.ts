import { describe, expect, it } from 'vitest'
import { addDays, applyDueRevisions, approveFirstPiece, finishOperation, injectionSetup, reportProduction, today } from '../domain/engine'
import {
  activationIssues, catalogOf, classAttributes, createItem, ensureClassPath, itemFlags, missingAttributes, openBomVersion, removeClassAttribute, saveClassAttribute,
  setBomLine, setItemAttributes, submitItem, toggleRevisionCheck, updateFiscal,
} from '../domain/catalog'
import {
  changeImpact, copyRoutingFrom, costBreakdown, createChange, moldMinutesPerPiece, moveChange, openChangeRevision, pushFiscal, receiveOmieFiscal, resolveFiscalConflict,
  revisionDiff, savePackaging, saveRevisionStep, saveTooling, toolLife,
} from '../domain/engineering'
import { releaseRevision } from '../domain/enterprise'
import { createSeedState } from '../mocks/seed'

const item = (state: ReturnType<typeof createSeedState>, id: string) => state.items.find(entry => entry.id === id)!

describe('atributos por classe', () => {
  it('herda os atributos do nó pai e acrescenta os do próprio nó', () => {
    const state = createSeedState()
    const cases = catalogOf(item(state, 'pa-a11-ext')).classId
    const defs = classAttributes(state, cases)
    expect(defs.map(def => def.key)).toEqual(expect.arrayContaining(['Linha', 'Modelo de device', 'Cor', 'Grau de proteção']))
    expect(defs.find(def => def.key === 'Linha')!.inherited).toBe(true)
    expect(defs.find(def => def.key === 'Grau de proteção')!.inherited).toBe(false)
  })

  it('atributo obrigatório sem valor impede a homologação e aparece como pendência', () => {
    const state = createSeedState()
    const classId = ensureClassPath(state, ['Produtos acabados', 'Linha Hard', 'Cases'])
    const draft = createItem(state, { name: 'Case Rugged novo', type: 'PA', unit: 'un', classId }, 'Eduardo')
    expect(missingAttributes(state, draft).length).toBeGreaterThan(0)
    expect(itemFlags(state, draft)).toContain('Atributos pendentes')
    expect(() => submitItem(state, draft.id, 'Eduardo')).toThrow(/atributos obrigatórios/)
    setItemAttributes(state, draft.id, { Linha: 'Hard', 'Modelo de device': 'Tab X', Cor: 'Preto', 'Grau de proteção': 'IP67' }, 'Eduardo')
    expect(missingAttributes(state, draft)).toEqual([])
    submitItem(state, draft.id, 'Eduardo')
    expect(catalogOf(draft).lifecycle).toBe('Em homologação')
    expect(activationIssues(state, draft).some(issue => issue.startsWith('Atributo obrigatório'))).toBe(false)
  })

  it('valida lista e número e recusa chave fora da classe', () => {
    const state = createSeedState()
    expect(() => setItemAttributes(state, 'pa-a11-ext', { Cor: 'Verde' }, 'Eduardo')).toThrow(/opções/)
    expect(() => setItemAttributes(state, 'pa-a11-ext', { 'Altura de queda': 'alta' }, 'Eduardo')).toThrow(/número/)
    expect(() => setItemAttributes(state, 'pa-a11-ext', { Voltagem: '12' }, 'Eduardo')).toThrow(/não pertence/)
  })

  it('eixo de grade é fixo na variante e atributo em uso não é removido', () => {
    const state = createSeedState()
    expect(() => setItemAttributes(state, 'pa-a11-imp', { Cor: 'Azul petróleo' }, 'Eduardo')).toThrow(/eixo da grade/)
    const root = ensureClassPath(state, ['Produtos acabados'])
    expect(() => removeClassAttribute(state, root, 'Linha', 'Eduardo', 'Engenharia')).toThrow(/já têm valor/)
    expect(() => saveClassAttribute(state, root, { label: 'Material', kind: 'Lista', options: ['ABS'], unit: '', required: false, variantAxis: false }, 'Eduardo', 'Engenharia')).toThrow(/duas opções/)
    expect(() => saveClassAttribute(state, root, { label: 'Linha', kind: 'Texto', options: [], unit: '', required: false, variantAxis: false }, 'Eduardo', 'Engenharia')).toThrow(/Já existe/)
    expect(() => saveClassAttribute(state, root, { label: 'Lote piloto', kind: 'Texto', options: [], unit: '', required: false, variantAxis: false }, 'Ana', 'Comercial')).toThrow(/Engenharia e Gestor/)
  })
})

describe('ferramental e roteiro da versão', () => {
  it('molde calcula o tempo por peça pelo ciclo e cavidades ativas e só roda em máquina compatível', () => {
    const state = createSeedState()
    const mold = catalogOf(item(state, 'fe-m114')).tooling!
    expect(moldMinutesPerPiece(mold)).toBeCloseTo(55 / 2 / 60, 4)
    const draft = openBomVersion(state, 'se-bump-a11', 'Teste', 'Eduardo')
    expect(() => saveRevisionStep(state, draft.id, { name: 'Injeção', resourceId: 'inj1', minutesPerUnit: 1, setupMinutes: 30, crew: 1, toolId: 'fe-m114', firstPiece: true, instructions: [] }, 'Eduardo')).toThrow(/não é compatível/)
    const step = saveRevisionStep(state, draft.id, { name: 'Injeção nova', resourceId: 'inj3', minutesPerUnit: 99, setupMinutes: 30, crew: 1, toolId: 'fe-m114', firstPiece: true, instructions: [] }, 'Eduardo')
    expect(step.minutesPerUnit).toBeCloseTo(moldMinutesPerPiece(mold), 4)
  })

  it('valida os dados do molde e propaga cavidades para os roteiros vigentes', () => {
    const state = createSeedState()
    const base = { ...catalogOf(item(state, 'fe-m114')).tooling! }
    expect(() => saveTooling(state, 'fe-m114', { ...base, activeCavities: 5 }, 'Diego', 'Manutenção')).toThrow(/Cavidades ativas/)
    expect(() => saveTooling(state, 'fe-m114', { ...base, compatibleResourceIds: ['mont1'] }, 'Diego', 'Manutenção')).toThrow(/injetora/)
    expect(() => saveTooling(state, 'fe-m114', { ...base, activeCavities: 4 }, 'Ana', 'Comercial')).toThrow(/não altera/)
    saveTooling(state, 'fe-m114', { ...base, activeCavities: 4 }, 'Diego', 'Manutenção')
    expect(item(state, 'se-bump-a11').routing!.find(step => step.toolId === 'fe-m114')!.minutesPerUnit).toBeCloseTo(55 / 4 / 60, 4)
    expect(toolLife(state, item(state, 'fe-m114')).shots).toBe(64200)
  })

  it('roteiro e estrutura mudam juntos na versão e só valem depois de liberados', () => {
    const state = createSeedState()
    const draft = openBomVersion(state, 'pa-lite-ipad', 'Nova embalagem', 'Eduardo')
    setBomLine(state, draft.id, 'cp-paraf', 6, 'Eduardo')
    saveRevisionStep(state, draft.id, { name: 'Inspeção final', resourceId: 'mont2', minutesPerUnit: 0.5, setupMinutes: 0, crew: 1, firstPiece: false, instructions: ['Conferir giro'] }, 'Eduardo')
    expect(item(state, 'pa-lite-ipad').routing!.some(step => step.name === 'Inspeção final')).toBe(false)
    const diff = revisionDiff(state, draft)
    expect(diff.bom).toEqual([expect.objectContaining({ itemId: 'cp-paraf', kind: 'alterado' })])
    expect(diff.routing).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Inspeção final', kind: 'novo' })]))
    for (const check of draft.checklist) toggleRevisionCheck(state, draft.id, check.label)
    releaseRevision(state, draft.id, 'Eduardo')
    expect(item(state, 'pa-lite-ipad').routing!.some(step => step.name === 'Inspeção final')).toBe(true)
  })

  it('copia o roteiro de outro item para o rascunho', () => {
    const state = createSeedState()
    const draft = openBomVersion(state, 'pa-a11-imp', 'Copiar', 'Eduardo')
    const steps = copyRoutingFrom(state, draft.id, 'pa-s9-min', 'Eduardo')
    expect(steps.map(step => step.name)).toContain('Vedação IP65')
    expect(() => copyRoutingFrom(state, draft.id, 'pa-a11-imp', 'Eduardo')).toThrow(/outro item/)
  })
})

describe('custo por nível', () => {
  it('soma material, máquina, mão de obra, preparação rateada e desgaste de molde próprio', () => {
    const state = createSeedState()
    const part = costBreakdown(state, item(state, 'se-tampa-a11'), 200)
    expect(part.material).toBeGreaterThan(0)
    expect(part.machine).toBeCloseTo(48 / 60 / 60 * 120, 2)
    expect(part.setup).toBeGreaterThan(0)
    expect(part.lines.find(line => line.kind === 'Ferramental')!.value).toBeCloseTo(132000 / 800000, 4)
    expect(part.total).toBeCloseTo(part.material + part.machine + part.labor + part.setup + part.tooling, 1)
    const client = costBreakdown(state, item(state, 'se-tampa-s9'))
    expect(client.tooling).toBe(0)
  })
})

describe('embalagem logística', () => {
  it('exige unidade com 1, níveis crescentes e múltiplos inteiros', () => {
    const state = createSeedState()
    const level = (name: 'Unidade' | 'Caixa' | 'Palete', units: number) => ({ level: name, units, weightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 })
    expect(() => savePackaging(state, 'pa-lite-ipad', [level('Unidade', 2)], 'Carlos')).toThrow(/exatamente 1/)
    expect(() => savePackaging(state, 'pa-lite-ipad', [level('Unidade', 1), level('Caixa', 8), level('Palete', 100)], 'Carlos')).toThrow(/número inteiro/)
    expect(() => savePackaging(state, 'pa-lite-ipad', [level('Caixa', 8), level('Palete', 8)], 'Carlos')).toThrow(/mais unidades/)
    savePackaging(state, 'pa-lite-ipad', [level('Unidade', 1), level('Caixa', 8), level('Palete', 320)], 'Carlos')
    expect(catalogOf(item(state, 'pa-lite-ipad')).packaging!.map(entry => entry.units)).toEqual([1, 8, 320])
  })
})

describe('mudança de engenharia', () => {
  it('mostra o impacto e libera as versões vinculadas na data de efetividade', () => {
    const state = createSeedState()
    const change = state.engineeringChanges.find(entry => entry.id === 'ECO-0001')!
    change.effectiveDate = addDays(today(), 10)
    const [impact] = changeImpact(state, change)
    expect(impact.draft?.changeId).toBe('ECO-0001')
    expect(() => moveChange(state, change.id, 'Aprovada', '', 'Paulo', 'PCP')).toThrow(/técnica/)
    moveChange(state, change.id, 'Aprovada', '', 'Eduardo', 'Engenharia')
    expect(() => moveChange(state, change.id, 'Implementada', '', 'Eduardo', 'Engenharia')).toThrow(/checklist/)
    for (const check of impact.draft!.checklist.filter(entry => !entry.done)) toggleRevisionCheck(state, impact.draft!.id, check.label)
    moveChange(state, change.id, 'Implementada', '', 'Eduardo', 'Engenharia')
    expect(impact.draft!.status).toBe('Liberada')
    expect(impact.draft!.validFrom).toBe(change.effectiveDate)
    expect(item(state, 'pa-a11-ext').routing!.some(step => step.name === 'Vedação portuária')).toBe(false)
    applyDueRevisions(state, change.effectiveDate)
    expect(item(state, 'pa-a11-ext').routing!.some(step => step.name === 'Vedação portuária')).toBe(true)
  })

  it('aprovação exige versão em rascunho de cada item e recusa precisa de motivo', () => {
    const state = createSeedState()
    const change = createChange(state, { title: 'Trocar parafuso da Mesa Lite', reason: 'Parafuso M2 espana na base de policarbonato', priority: 'Normal', itemIds: ['pa-lite-ipad'], disposition: 'Usar até acabar', effectiveDate: today() }, 'Camila')
    expect(change.id).toMatch(/^ECO-\d{4}$/)
    moveChange(state, change.id, 'Em análise', '', 'Eduardo', 'Engenharia')
    expect(() => moveChange(state, change.id, 'Aprovada', '', 'Eduardo', 'Engenharia')).toThrow(/Abra a versão/)
    const revision = openChangeRevision(state, change.id, 'pa-lite-ipad', 'Eduardo', 'Engenharia')
    expect(revision.changeId).toBe(change.id)
    expect(() => moveChange(state, change.id, 'Recusada', '', 'Eduardo', 'Engenharia')).toThrow(/por que/)
    moveChange(state, change.id, 'Aprovada', '', 'Eduardo', 'Engenharia')
    expect(change.approvedBy).toBe('Eduardo')
  })
})

describe('fiscal em mão dupla com o Omie', () => {
  it('edição local fica pendente de envio e o envio sincroniza', () => {
    const state = createSeedState()
    const cable = catalogOf(item(state, 'cp-cabo'))
    updateFiscal(state, 'cp-cabo', { ncm: cable.ncm, cest: cable.cest, origin: '2', gtinTax: cable.gtinTax, exTipi: cable.exTipi }, 'Patrícia', 'Financeiro')
    expect(cable.fiscalSync?.status).toBe('Enviar ao Omie')
    pushFiscal(state, 'cp-cabo', 'Patrícia', 'Financeiro')
    expect(cable.fiscalSync?.status).toBe('Sincronizado')
  })

  it('mudança no Omie sem pendência local é aplicada com auditoria', () => {
    const state = createSeedState()
    expect(receiveOmieFiscal(state, 'cp-cabo', { origin: '1' })).toBe('aplicado')
    const cable = catalogOf(item(state, 'cp-cabo'))
    expect(cable.origin).toBe('1')
    expect(cable.audit[0].reason).toBe('Alterado no Omie')
  })

  it('mudança dos dois lados abre conflito e alguém decide qual vale', () => {
    const state = createSeedState()
    expect(receiveOmieFiscal(state, 'pa-a11-imp', { origin: '2' })).toBe('conflito')
    const impact = catalogOf(item(state, 'pa-a11-imp'))
    expect(itemFlags(state, item(state, 'pa-a11-imp'))).toContain('Fiscal em conflito com o Omie')
    expect(() => pushFiscal(state, 'pa-a11-imp', 'Patrícia', 'Financeiro')).toThrow(/conflito/)
    resolveFiscalConflict(state, 'pa-a11-imp', 'Omie', 'Patrícia', 'Financeiro')
    expect(impact.origin).toBe('2')
    expect(impact.fiscalSync?.status).toBe('Sincronizado')
  })
})

describe('ferramental e primeira peça na produção', () => {
  const coverOp = (state: ReturnType<typeof createSeedState>) => state.productionOrders.find(op => op.itemId === 'se-tampa-s9' && op.salesOrderId === 'PV-2026-1048')!

  it('a OP de injeção nasce do roteiro com o molde, as cavidades ativas e a primeira peça', () => {
    const state = createSeedState()
    const operation = coverOp(state).operations[0]
    expect(operation.toolId).toBe('fe-m122')
    expect(operation.firstPiece).toBe(true)
    expect(operation.resourceId).toBe('inj1')
    const bumper = injectionSetup(state, item(state, 'se-bump-a11'))
    expect(bumper.cavities).toBe(2)
    expect(bumper.mold?.id).toBe('mold-a11b')
    expect(bumper.resourceId).toBe('inj3')
  })

  it('só segue além da primeira peça depois da liberação por outra pessoa', () => {
    const state = createSeedState()
    const op = coverOp(state)
    const operation = op.operations[0]
    expect(operation.good).toBe(1)
    expect(() => reportProduction(state, op.id, operation.id, 5, 0, '', 'Lucas Ferreira')).toThrow(/aguarda liberação/)
    expect(() => finishOperation(state, op.id, operation.id, 'Lucas Ferreira')).toThrow(/aguarda liberação/)
    expect(() => approveFirstPiece(state, op.id, operation.id, 'Lucas Ferreira')).toThrow(/própria primeira peça/)
    approveFirstPiece(state, op.id, operation.id, 'Fernanda Rocha')
    expect(operation.firstPieceBy).toBe('Fernanda Rocha')
    reportProduction(state, op.id, operation.id, 5, 0, '', 'Lucas Ferreira')
    expect(operation.good).toBe(6)
  })

  it('ferramental acima de 85% da vida útil abre a preventiva de reforma', () => {
    const state = createSeedState()
    catalogOf(item(state, 'fe-m122')).tooling!.lifeShots = 46_000
    const op = coverOp(state)
    const operation = op.operations[0]
    approveFirstPiece(state, op.id, operation.id, 'Fernanda Rocha')
    reportProduction(state, op.id, operation.id, op.quantity - 1, 0, '', 'Lucas Ferreira')
    finishOperation(state, op.id, operation.id, 'Lucas Ferreira')
    const preventive = state.maintenanceOrders.find(order => order.assetId === 'mold-s9t' && order.type === 'Preventiva')
    expect(preventive?.origin).toBe('Vida útil do ferramental')
  })
})
