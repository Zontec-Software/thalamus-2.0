import type { ErpState } from './engine'
import { DomainError, lineNeed, log, nextId, now, today } from './engine'
import { assertGtin, canApprove, canEdit, catalogOf, commit, editable, editorsLabel, findItem, hasRouting, openBomVersion, track, type Change } from './catalog'
import { releaseRevision } from './enterprise'
import { assertResourceChoice, keptCompatibleResources } from './resources'
import type {
  ChangeDisposition, ChangeStage, EngineeringChange, FiscalSnapshot, Item, PackagingLevel, PackagingLevelName, ProductRevision, Role, RouteStep, Tooling,
} from '../types/domain'

const round2 = (value: number) => Math.round(value * 100) / 100
const round4 = (value: number) => Math.round(value * 10000) / 10000
const brNumber = (value: number, digits = 2) => value.toFixed(digits).replace('.', ',')

/** Custo-hora da mão de obra direta na demonstração; na vida real vem da folha por centro de custo. */
export const LABOR_RATE = 38
/** Lote usado para ratear a preparação quando o item não define lote mínimo. */
export const STANDARD_LOT = 200

/* ---------- Ferramental ---------- */

export type ToolingInput = Omit<Tooling, 'assetId'> & { assetId?: string }

export function toolOf(state: ErpState, toolId: string | undefined) {
  if (!toolId) return undefined
  const tool = state.items.find(entry => entry.id === toolId)
  return tool?.type === 'FE' ? tool : undefined
}

/** Minutos por peça de um molde: ciclo ÷ cavidades ativas. */
export function moldMinutesPerPiece(tooling: Tooling) {
  return round4(tooling.cycleSeconds / Math.max(1, tooling.activeCavities) / 60)
}

/** Golpes já dados (contador da manutenção) contra a vida útil prevista. */
export function toolLife(state: ErpState, tool: Item) {
  const tooling = catalogOf(tool).tooling
  const shots = state.assets.find(asset => asset.id === tooling?.assetId)?.shots ?? 0
  const life = tooling?.lifeShots ?? 0
  return { shots, life, used: life ? Math.min(1, shots / life) : 0 }
}

export function toolUsers(state: ErpState, toolId: string) {
  return state.items.filter(item => !item.catalog?.deletedAt && (item.routing ?? []).some(step => step.toolId === toolId))
}

export function saveTooling(state: ErpState, itemId: string, input: ToolingInput, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  if (item.type !== 'FE') throw new DomainError('Dados de ferramental só existem em item do tipo ferramental')
  const catalog = editable(item, role, 'ferramental')
  const numbers = [input.cavities, input.activeCavities, input.cycleSeconds, input.shotWeightG, input.lifeShots, input.value]
  if (numbers.some(value => !(value >= 0))) throw new DomainError('Valores do ferramental não podem ser negativos')
  if (input.kind === 'Molde') {
    if (!(input.cavities >= 1) || !Number.isInteger(input.cavities)) throw new DomainError('Cavidades nominais é um número inteiro a partir de 1')
    if (!(input.activeCavities >= 1 && input.activeCavities <= input.cavities) || !Number.isInteger(input.activeCavities)) throw new DomainError('Cavidades ativas ficam entre 1 e as nominais')
    if (!(input.cycleSeconds > 0)) throw new DomainError('O ciclo do molde tem de ser maior que zero')
  }
  const resources = keptCompatibleResources(state, input.compatibleResourceIds, catalog.tooling?.compatibleResourceIds ?? [])
  if (input.kind === 'Molde' && resources.some(id => state.resources.find(entry => entry.id === id)?.kind !== 'Injetora')) throw new DomainError('Molde só é compatível com injetora')
  if (input.assetId && !state.assets.some(asset => asset.id === input.assetId)) throw new DomainError('Ativo da manutenção não encontrado')
  if (input.assetId && state.items.some(other => other.id !== item.id && other.catalog?.tooling?.assetId === input.assetId)) throw new DomainError('Esse ativo já está ligado a outro ferramental')
  const before = catalog.tooling
  const next: Tooling = { ...input, compatibleResourceIds: resources, ownerName: input.owner === 'Cliente' ? input.ownerName?.trim() : undefined }
  const resourceNames = (ids: string[] = []) => ids.map(id => state.resources.find(entry => entry.id === id)?.name ?? id).join(', ')
  const changes: Change[] = []
  track(changes, 'Ferramental · tipo', before?.kind ?? '', next.kind)
  track(changes, 'Ferramental · cavidades', before ? `${before.activeCavities}/${before.cavities}` : '', `${next.activeCavities}/${next.cavities}`)
  track(changes, 'Ferramental · ciclo (s)', before ? brNumber(before.cycleSeconds, 1) : '', brNumber(next.cycleSeconds, 1))
  track(changes, 'Ferramental · peso do golpe (g)', before ? brNumber(before.shotWeightG, 1) : '', brNumber(next.shotWeightG, 1))
  track(changes, 'Ferramental · máquinas compatíveis', resourceNames(before?.compatibleResourceIds), resourceNames(next.compatibleResourceIds))
  track(changes, 'Ferramental · dono', before ? `${before.owner}${before.ownerName ? ` (${before.ownerName})` : ''}` : '', `${next.owner}${next.ownerName ? ` (${next.ownerName})` : ''}`)
  track(changes, 'Ferramental · vida útil (golpes)', before ? String(before.lifeShots) : '', String(next.lifeShots))
  track(changes, 'Ferramental · valor', before ? brNumber(before.value) : '', brNumber(next.value))
  track(changes, 'Ferramental · ativo da manutenção', before?.assetId ?? '', next.assetId ?? '')
  if (!changes.length) throw new DomainError('Nada mudou')
  catalog.tooling = next
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.pcp
  if (next.kind === 'Molde') {
    const drafts = state.productRevisions.filter(entry => entry.status === 'Rascunho').flatMap(entry => entry.routing ?? [])
    for (const step of [...toolUsers(state, item.id).flatMap(user => user.routing ?? []), ...drafts]) {
      if (step.toolId === item.id) step.minutesPerUnit = moldMinutesPerPiece(next)
    }
  }
  commit(catalog, actor, changes)
  return next
}

/* ---------- Roteiro da versão ---------- */

export interface RevisionStepInput {
  id?: string
  name: string
  resourceId: string
  minutesPerUnit: number
  setupMinutes: number
  crew: number
  toolId?: string
  firstPiece: boolean
  instructions: string[]
}

function draftWithRouting(state: ErpState, revisionId: string, role: Role) {
  const revision = state.productRevisions.find(entry => entry.id === revisionId)
  if (!revision) throw new DomainError('Versão não encontrada')
  if (revision.status !== 'Rascunho') throw new DomainError('Só versão em rascunho pode ser alterada. A liberada fica preservada')
  const item = findItem(state, revision.itemId)
  editable(item, role, 'manufatura')
  if (!hasRouting(item)) throw new DomainError('Só produto acabado, kit físico e peça injetada têm roteiro')
  revision.routing ??= []
  return { revision, item, routing: revision.routing }
}

const uncheck = (revision: ProductRevision) => revision.checklist.forEach(entry => { entry.done = false })

/** Roteiro dentro da versão: muda junto com a estrutura e só vale depois da liberação. */
export function saveRevisionStep(state: ErpState, revisionId: string, input: RevisionStepInput, actor: string, role: Role = 'Gestor') {
  const { revision, routing } = draftWithRouting(state, revisionId, role)
  const name = input.name.trim()
  if (name.length < 3) throw new DomainError('Dê um nome à operação')
  const currentResourceId = input.id ? routing.find(entry => entry.id === input.id)?.resourceId : undefined
  const resource = assertResourceChoice(state, input.resourceId, currentResourceId)
  if (!(input.setupMinutes >= 0)) throw new DomainError('A preparação não pode ser negativa')
  if (!(input.crew >= 0) || !Number.isInteger(input.crew)) throw new DomainError('Equipe é um número inteiro de pessoas (0 = máquina sem operador dedicado)')
  let minutesPerUnit = input.minutesPerUnit
  const tool = toolOf(state, input.toolId)
  if (input.toolId && !tool) throw new DomainError('Ferramental não encontrado')
  if (tool) {
    const tooling = catalogOf(tool).tooling
    if (!tooling) throw new DomainError(`${tool.code} não tem dados técnicos de ferramental`)
    if (catalogOf(tool).lifecycle === 'Bloqueado' || catalogOf(tool).lifecycle === 'Obsoleto' || catalogOf(tool).lifecycle === 'Inativo') throw new DomainError(`${tool.code} está ${catalogOf(tool).lifecycle.toLowerCase()}`)
    if (!tooling.compatibleResourceIds.includes(resource.id)) throw new DomainError(`${tool.code} não é compatível com ${resource.name}`)
    if (tooling.kind === 'Molde') minutesPerUnit = moldMinutesPerPiece(tooling)
  }
  if (!(minutesPerUnit > 0)) throw new DomainError('O tempo padrão tem de ser maior que zero')
  const step: RouteStep = {
    id: input.id ?? nextId(state, 'ST').toLowerCase(), name, resourceId: resource.id, minutesPerUnit,
    setupMinutes: input.setupMinutes || undefined, crew: input.crew, toolId: tool?.id, firstPiece: input.firstPiece || undefined,
    instructions: input.instructions.map(entry => entry.trim()).filter(Boolean),
  }
  if (input.id) {
    const index = routing.findIndex(entry => entry.id === input.id)
    if (index < 0) throw new DomainError('Operação não encontrada')
    routing[index] = step
  } else routing.push(step)
  uncheck(revision)
  void actor
  return step
}

export function removeRevisionStep(state: ErpState, revisionId: string, stepId: string, actor: string, role: Role = 'Gestor') {
  const { revision, routing } = draftWithRouting(state, revisionId, role)
  if (!routing.some(entry => entry.id === stepId)) throw new DomainError('Operação não encontrada')
  revision.routing = routing.filter(entry => entry.id !== stepId)
  uncheck(revision)
  void actor
}

export function moveRevisionStep(state: ErpState, revisionId: string, stepId: string, direction: -1 | 1, actor: string, role: Role = 'Gestor') {
  const { revision, routing } = draftWithRouting(state, revisionId, role)
  const index = routing.findIndex(entry => entry.id === stepId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= routing.length) throw new DomainError('A operação já está na ponta do roteiro')
  ;[routing[index], routing[target]] = [routing[target], routing[index]]
  uncheck(revision)
  void actor
}

/** Copia o roteiro de outro item para o rascunho: ponto de partida para produto parecido. */
export function copyRoutingFrom(state: ErpState, revisionId: string, sourceItemId: string, actor: string, role: Role = 'Gestor') {
  const { revision, item } = draftWithRouting(state, revisionId, role)
  const source = findItem(state, sourceItemId)
  if (source.id === item.id) throw new DomainError('Escolha outro item como origem')
  if (!source.routing?.length) throw new DomainError(`${source.code} não tem roteiro vigente`)
  for (const step of source.routing) assertResourceChoice(state, step.resourceId)
  revision.routing = source.routing.map(step => ({ ...step, id: nextId(state, 'ST').toLowerCase(), instructions: [...step.instructions] }))
  uncheck(revision)
  log(state, 'Engenharia', actor, `${item.code}: roteiro copiado de ${source.code} para a versão ${revision.code}`, undefined, item.id)
  return revision.routing
}

/* ---------- Comparação de versões ---------- */

export type DiffKind = 'novo' | 'alterado' | 'removido'

export interface RevisionDiff {
  bom: { itemId: string; kind: DiffKind; detail: string }[]
  routing: { name: string; kind: DiffKind; detail: string }[]
}

const stepSignature = (state: ErpState, step: RouteStep) => {
  const resource = state.resources.find(entry => entry.id === step.resourceId)?.name ?? step.resourceId
  const tool = step.toolId ? state.items.find(entry => entry.id === step.toolId)?.code : ''
  return [resource, `${brNumber(step.minutesPerUnit, 2)} min/un`, step.setupMinutes ? `setup ${step.setupMinutes} min` : '', step.crew !== undefined ? `${step.crew} pessoa(s)` : '', tool ? `ferramental ${tool}` : '', step.instructions.join(' | ')].filter(Boolean).join(' · ')
}

/** Diferença entre duas versões (ou entre uma versão e o que está vigente no item). */
export function revisionDiff(state: ErpState, target: ProductRevision, base?: ProductRevision): RevisionDiff {
  const item = findItem(state, target.itemId)
  const baseLines = base ? base.lines ?? [] : item.bom ?? []
  const baseRouting = base ? base.routing ?? item.routing ?? [] : item.routing ?? []
  const bom: RevisionDiff['bom'] = []
  for (const line of target.lines ?? []) {
    const before = baseLines.find(entry => entry.itemId === line.itemId)
    if (!before) bom.push({ itemId: line.itemId, kind: 'novo', detail: `${line.quantity}${line.loss ? ` + ${line.loss}% perda` : ''}` })
    else if (before.quantity !== line.quantity || (before.loss ?? 0) !== (line.loss ?? 0)) {
      bom.push({ itemId: line.itemId, kind: 'alterado', detail: `${before.quantity}${before.loss ? ` + ${before.loss}%` : ''} → ${line.quantity}${line.loss ? ` + ${line.loss}%` : ''}` })
    }
  }
  for (const line of baseLines) if (!(target.lines ?? []).some(entry => entry.itemId === line.itemId)) bom.push({ itemId: line.itemId, kind: 'removido', detail: String(line.quantity) })
  const routing: RevisionDiff['routing'] = []
  const targetRouting = target.routing ?? []
  for (const step of targetRouting) {
    const before = baseRouting.find(entry => entry.name.toLowerCase() === step.name.toLowerCase())
    if (!before) routing.push({ name: step.name, kind: 'novo', detail: stepSignature(state, step) })
    else if (stepSignature(state, before) !== stepSignature(state, step)) routing.push({ name: step.name, kind: 'alterado', detail: `${stepSignature(state, before)} → ${stepSignature(state, step)}` })
  }
  if (target.routing) {
    for (const step of baseRouting) if (!targetRouting.some(entry => entry.name.toLowerCase() === step.name.toLowerCase())) routing.push({ name: step.name, kind: 'removido', detail: stepSignature(state, step) })
    const order = (list: RouteStep[]) => list.map(entry => entry.name.toLowerCase()).filter(name => targetRouting.some(entry => entry.name.toLowerCase() === name) && baseRouting.some(entry => entry.name.toLowerCase() === name)).join('>')
    if (order(baseRouting) !== order(targetRouting)) routing.push({ name: 'Sequência', kind: 'alterado', detail: `${baseRouting.map(entry => entry.name).join(' → ')} ⇒ ${targetRouting.map(entry => entry.name).join(' → ')}` })
  }
  return { bom, routing }
}

/* ---------- Custo por nível ---------- */

export interface CostLine {
  label: string
  kind: 'Material' | 'Máquina' | 'Mão de obra' | 'Preparação' | 'Ferramental'
  value: number
  detail: string
  itemId?: string
}

/** Custo calculado do item: material da estrutura + conversão do roteiro (máquina, mão de obra, preparação rateada e desgaste do ferramental). */
export function costBreakdown(state: ErpState, item: Item, lot = catalogOf(item).minLot || STANDARD_LOT) {
  const lines: CostLine[] = []
  for (const line of item.bom ?? []) {
    const component = state.items.find(entry => entry.id === line.itemId)
    const quantity = lineNeed(line, 1)
    lines.push({ label: component ? `${component.code} · ${component.name}` : line.itemId, kind: 'Material', value: round4(quantity * (component?.cost ?? 0)), detail: `${quantity} ${component?.unit ?? ''} × ${brNumber(component?.cost ?? 0)}`, itemId: line.itemId })
  }
  for (const step of item.routing ?? []) {
    const resource = state.resources.find(entry => entry.id === step.resourceId)
    const rate = resource?.hourlyRate ?? 0
    const crew = step.crew ?? 1
    if (rate) lines.push({ label: `${step.name} · ${resource?.name}`, kind: 'Máquina', value: round4(step.minutesPerUnit / 60 * rate), detail: `${brNumber(step.minutesPerUnit, 2)} min × ${brNumber(rate)}/h` })
    if (crew) lines.push({ label: step.name, kind: 'Mão de obra', value: round4(step.minutesPerUnit / 60 * crew * LABOR_RATE), detail: `${brNumber(step.minutesPerUnit, 2)} min × ${crew} pessoa(s) × ${brNumber(LABOR_RATE)}/h` })
    if (step.setupMinutes) lines.push({ label: step.name, kind: 'Preparação', value: round4(step.setupMinutes / 60 * (rate + Math.max(1, crew) * LABOR_RATE) / lot), detail: `${step.setupMinutes} min rateados em lote de ${lot}` })
    const tooling = toolOf(state, step.toolId) ? catalogOf(toolOf(state, step.toolId)!).tooling : undefined
    if (tooling?.kind === 'Molde' && tooling.lifeShots && tooling.value && tooling.owner === 'Roboflex') {
      lines.push({ label: `Desgaste ${toolOf(state, step.toolId)!.code}`, kind: 'Ferramental', value: round4(tooling.value / tooling.lifeShots / Math.max(1, tooling.activeCavities)), detail: `${brNumber(tooling.value)} ÷ ${tooling.lifeShots} golpes ÷ ${tooling.activeCavities} cavidade(s)` })
    }
  }
  const sum = (kind: CostLine['kind']) => round2(lines.filter(line => line.kind === kind).reduce((total, line) => total + line.value, 0))
  const totals = { material: sum('Material'), machine: sum('Máquina'), labor: sum('Mão de obra'), setup: sum('Preparação'), tooling: sum('Ferramental') }
  const total = round2(Object.values(totals).reduce((a, b) => a + b, 0))
  return { lines, ...totals, total, lot, variance: round2(item.cost - total) }
}

/* ---------- Embalagem ---------- */

export const PACKAGING_LEVELS: PackagingLevelName[] = ['Unidade', 'Caixa', 'Palete']

export function savePackaging(state: ErpState, itemId: string, levels: PackagingLevel[], actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'estoque')
  if (catalog.nature !== 'Bem') throw new DomainError('Embalagem logística vale para item estocável')
  const list = PACKAGING_LEVELS.map(level => levels.find(entry => entry.level === level)).filter((entry): entry is PackagingLevel => !!entry)
  if (list.length !== levels.length) throw new DomainError('Cada nível de embalagem aparece uma vez')
  const unit = list.find(entry => entry.level === 'Unidade')
  if (unit && unit.units !== 1) throw new DomainError('O nível Unidade contém exatamente 1 unidade base')
  for (const entry of list) {
    if (!(entry.units >= 1) || !Number.isInteger(entry.units)) throw new DomainError(`${entry.level}: a quantidade é inteira e a partir de 1`)
    if ([entry.weightKg, entry.lengthCm, entry.widthCm, entry.heightCm].some(value => !(value >= 0))) throw new DomainError(`${entry.level}: peso e medidas não podem ser negativos`)
    if (entry.packageItemId && findItem(state, entry.packageItemId).type !== 'EM') throw new DomainError(`${entry.level}: o material de embalagem tem de ser item do tipo embalagem`)
    if (entry.gtin) assertGtin(state, item, entry.gtin, `GTIN do nível ${entry.level}`)
  }
  for (let index = 1; index < list.length; index++) {
    if (list[index].units <= list[index - 1].units) throw new DomainError(`${list[index].level} precisa conter mais unidades que ${list[index - 1].level}`)
    if (list[index].units % list[index - 1].units) throw new DomainError(`${list[index].level} tem de conter um número inteiro de ${list[index - 1].level.toLowerCase()}s`)
  }
  const gtins = list.map(entry => entry.gtin).filter(Boolean)
  if (new Set(gtins).size !== gtins.length) throw new DomainError('Cada nível tem GTIN próprio')
  const describe = (entries: PackagingLevel[] = []) => entries.map(entry => `${entry.level} ${entry.units}`).join(' › ')
  const changes: Change[] = []
  track(changes, 'Embalagem logística', describe(catalog.packaging), describe(list))
  if (!changes.length && JSON.stringify(catalog.packaging ?? []) === JSON.stringify(list)) throw new DomainError('Nada mudou')
  if (!changes.length) changes.push({ field: 'Embalagem logística', from: 'medidas anteriores', to: 'medidas atualizadas' })
  catalog.packaging = list.map(entry => ({ ...entry, gtin: entry.gtin || undefined, packageItemId: entry.packageItemId || undefined }))
  commit(catalog, actor, changes)
  return catalog.packaging
}

/* ---------- Mudança de engenharia (ECO) ---------- */

export const CHANGE_STAGES: ChangeStage[] = ['Solicitada', 'Em análise', 'Aprovada', 'Implementada']
export const DISPOSITIONS: ChangeDisposition[] = ['Usar até acabar', 'Retrabalhar', 'Sucatear', 'Sem estoque']

export interface ChangeInput {
  title: string
  reason: string
  priority: EngineeringChange['priority']
  itemIds: string[]
  disposition: ChangeDisposition
  effectiveDate: string
}

function findChange(state: ErpState, changeId: string) {
  const change = state.engineeringChanges.find(entry => entry.id === changeId)
  if (!change) throw new DomainError('Mudança não encontrada')
  return change
}

/** Itens que usam o item na estrutura, em qualquer nível acima. */
export function parentsOf(state: ErpState, itemId: string, guard = 0): Item[] {
  if (guard > 20) return []
  const direct = state.items.filter(entry => !entry.catalog?.deletedAt && (entry.bom ?? []).some(line => line.itemId === itemId))
  return [...new Map([...direct, ...direct.flatMap(parent => parentsOf(state, parent.id, guard + 1))].map(entry => [entry.id, entry])).values()]
}

/** O que a mudança atinge hoje: saldo, OPs abertas, pedidos e compras em andamento, produtos acima na estrutura. */
export function changeImpact(state: ErpState, change: Pick<EngineeringChange, 'itemIds'>) {
  return change.itemIds.map(itemId => {
    const item = findItem(state, itemId)
    const parents = parentsOf(state, itemId)
    const touched = new Set([itemId, ...parents.map(entry => entry.id)])
    const openOps = state.productionOrders.filter(op => op.status !== 'Concluída' && (touched.has(op.itemId) || op.materials.some(material => material.itemId === itemId)))
    const openOrders = state.salesOrders.filter(order => order.shipment?.status !== 'Faturado' && order.shipment?.status !== 'Expedido' && (touched.has(order.itemId) || (order.lines ?? []).some(line => touched.has(line.itemId))))
    const openPurchases = state.requisitions.filter(requisition => requisition.itemId === itemId && requisition.status !== 'Recebida')
    const draft = state.productRevisions.find(entry => entry.itemId === itemId && entry.status === 'Rascunho')
    return { item, parents, openOps, openOrders, openPurchases, stock: item.stock, stockValue: round2(item.stock * item.cost), draft }
  })
}

export function createChange(state: ErpState, input: ChangeInput, actor: string, role: Role = 'Gestor') {
  void role
  const title = input.title.trim()
  if (title.length < 5) throw new DomainError('Dê um título que explique a mudança')
  if (input.reason.trim().length < 10) throw new DomainError('Descreva o motivo da mudança')
  const itemIds = [...new Set(input.itemIds)]
  for (const id of itemIds) {
    const item = findItem(state, id)
    if (!hasRouting(item) && !['KT'].includes(item.type) && item.type !== 'FE') throw new DomainError(`${item.code} não tem estrutura nem roteiro para mudar`)
  }
  if (input.effectiveDate && input.effectiveDate < today()) throw new DomainError('A data de efetividade não pode estar no passado')
  const at = now()
  const change: EngineeringChange = {
    id: `ECO-${nextId(state, 'ECO').split('-')[1].padStart(4, '0')}`, title, reason: input.reason.trim(), priority: input.priority, stage: 'Solicitada', itemIds,
    disposition: input.disposition, effectiveDate: input.effectiveDate || today(), requestedBy: actor, requestedAt: at,
    history: [{ at, actor, text: 'Mudança solicitada' }],
  }
  state.engineeringChanges.unshift(change)
  log(state, 'Engenharia', actor, `${change.id} solicitada: ${title}`)
  return change
}

export function updateChange(state: ErpState, changeId: string, input: ChangeInput, actor: string, role: Role = 'Gestor') {
  const change = findChange(state, changeId)
  if (change.stage === 'Implementada' || change.stage === 'Recusada') throw new DomainError('Mudança encerrada não é alterada')
  if (change.stage === 'Aprovada') throw new DomainError('Mudança aprovada não muda o escopo. Volte para análise antes')
  if (change.stage !== 'Solicitada' && !canEdit(role, 'manufatura')) throw new DomainError(`Em análise, quem altera: ${editorsLabel('manufatura')}`)
  if (input.effectiveDate < today()) throw new DomainError('A data de efetividade não pode estar no passado')
  Object.assign(change, { title: input.title.trim(), reason: input.reason.trim(), priority: input.priority, itemIds: [...new Set(input.itemIds)], disposition: input.disposition, effectiveDate: input.effectiveDate })
  change.history.unshift({ at: now(), actor, text: 'Escopo da mudança atualizado' })
}

/** Abre (ou aproveita) a versão em rascunho do item para esta mudança. */
export function openChangeRevision(state: ErpState, changeId: string, itemId: string, actor: string, role: Role = 'Gestor') {
  const change = findChange(state, changeId)
  if (!change.itemIds.includes(itemId)) throw new DomainError('O item não está no escopo da mudança')
  if (change.stage !== 'Em análise' && change.stage !== 'Aprovada') throw new DomainError('A versão é aberta com a mudança em análise')
  const existing = state.productRevisions.find(entry => entry.itemId === itemId && entry.status === 'Rascunho')
  if (existing?.changeId && existing.changeId !== changeId) throw new DomainError(`O rascunho de ${findItem(state, itemId).code} já pertence a ${existing.changeId}`)
  const revision = existing ?? openBomVersion(state, itemId, `${change.id} · ${change.title}`, actor, role)
  revision.changeId = changeId
  change.history.unshift({ at: now(), actor, text: `Versão ${revision.code} de ${findItem(state, itemId).code} vinculada` })
  return revision
}

export function moveChange(state: ErpState, changeId: string, stage: ChangeStage, note: string, actor: string, role: Role = 'Gestor') {
  const change = findChange(state, changeId)
  if (change.stage === 'Implementada' || change.stage === 'Recusada') throw new DomainError('Mudança encerrada')
  if (stage === change.stage) throw new DomainError('A mudança já está nessa etapa')
  if (stage !== 'Recusada' && stage !== 'Solicitada' && !canEdit(role, 'manufatura')) throw new DomainError(`Quem conduz a mudança: ${editorsLabel('manufatura')}`)
  const drafts = change.itemIds.map(id => state.productRevisions.find(entry => entry.itemId === id && entry.status === 'Rascunho' && entry.changeId === change.id))
  if (stage === 'Em análise' && !change.itemIds.length) throw new DomainError('Inclua ao menos um item afetado antes da análise')
  if (stage === 'Aprovada') {
    if (!canApprove(role, 'tecnica')) throw new DomainError('A aprovação da mudança é técnica: Engenharia ou Gestor')
    const missing = change.itemIds.filter((id, index) => {
      const item = findItem(state, id)
      return item.type !== 'FE' && !drafts[index]
    })
    if (missing.length) throw new DomainError(`Abra a versão em rascunho de: ${missing.map(id => findItem(state, id).code).join(', ')}`)
    change.approvedBy = actor
    change.approvedAt = now()
  }
  if (stage === 'Implementada') {
    if (change.stage !== 'Aprovada') throw new DomainError('Só mudança aprovada é implementada')
    const pending = drafts.filter((draft): draft is ProductRevision => !!draft && draft.checklist.some(entry => !entry.done))
    if (pending.length) throw new DomainError(`Complete o checklist da versão de: ${pending.map(draft => findItem(state, draft.itemId).code).join(', ')}`)
    const validFrom = change.effectiveDate < today() ? today() : change.effectiveDate
    for (const draft of drafts) if (draft) releaseRevision(state, draft.id, actor, validFrom)
    change.implementedAt = now()
  }
  if (stage === 'Recusada' && note.trim().length < 5) throw new DomainError('Diga por que a mudança foi recusada')
  if (stage === 'Solicitada' && change.stage === 'Aprovada') {
    change.approvedBy = undefined
    change.approvedAt = undefined
  }
  const from = change.stage
  change.stage = stage
  change.history.unshift({ at: now(), actor, text: `${from} → ${stage}${note.trim() ? `: ${note.trim()}` : ''}` })
  log(state, 'Engenharia', actor, `${change.id}: ${from} → ${stage}`)
  return change
}

/* ---------- Fiscal em mão dupla com o Omie ---------- */

export const snapshotOf = (item: Item): FiscalSnapshot => {
  const catalog = catalogOf(item)
  return { ncm: catalog.ncm, cest: catalog.cest, origin: catalog.origin, exTipi: catalog.exTipi, cClassTrib: catalog.cClassTrib }
}

const FISCAL_LABEL: Record<keyof FiscalSnapshot, string> = { ncm: 'NCM', cest: 'CEST', origin: 'Origem', exTipi: 'Ex-TIPI', cClassTrib: 'cClassTrib' }

export function fiscalDifferences(local: FiscalSnapshot, remote: FiscalSnapshot) {
  return (Object.keys(FISCAL_LABEL) as (keyof FiscalSnapshot)[]).filter(key => local[key] !== remote[key]).map(key => ({ field: FISCAL_LABEL[key], local: local[key], remote: remote[key] }))
}

/** Envia a camada fiscal ao Omie. Com conflito aberto, alguém decide antes. */
export function pushFiscal(state: ErpState, itemId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  if (catalog.fiscalSync?.status === 'Conflito') throw new DomainError('Há conflito com o Omie. Escolha qual versão fica antes de enviar')
  if (catalog.fiscalSync?.status !== 'Enviar ao Omie') throw new DomainError('Nada pendente para enviar')
  catalog.fiscalSync = { status: 'Sincronizado', at: now(), by: actor, remote: snapshotOf(item) }
  log(state, 'Integração', actor, `${item.code}: fiscal enviado ao Omie`, undefined, item.id)
}

/** Alteração feita direto no Omie (webhook). Sem pendência local, aplica; com pendência, abre conflito. */
export function receiveOmieFiscal(state: ErpState, itemId: string, remote: Partial<FiscalSnapshot>, actor = 'Omie') {
  const item = findItem(state, itemId)
  const catalog = catalogOf(item)
  const merged: FiscalSnapshot = { ...snapshotOf(item), ...remote }
  const differences = fiscalDifferences(snapshotOf(item), merged)
  if (!differences.length) return 'igual' as const
  item.catalog ??= catalog
  if (catalog.fiscalSync?.status === 'Enviar ao Omie' || catalog.fiscalSync?.status === 'Conflito') {
    catalog.fiscalSync = { status: 'Conflito', at: now(), by: actor, remote: merged }
    log(state, 'Integração', actor, `${item.code}: fiscal alterado no Omie com alteração local pendente · conflito aberto`, undefined, item.id)
    return 'conflito' as const
  }
  Object.assign(catalog, merged)
  commit(catalog, actor, differences.map(entry => ({ field: entry.field, from: entry.local, to: entry.remote, reason: 'Alterado no Omie' })))
  catalog.fiscalSync = { status: 'Sincronizado', at: now(), by: actor, remote: merged }
  log(state, 'Integração', actor, `${item.code}: fiscal atualizado a partir do Omie (${differences.map(entry => entry.field).join(', ')})`, undefined, item.id)
  return 'aplicado' as const
}

export function resolveFiscalConflict(state: ErpState, itemId: string, keep: 'Thalamus' | 'Omie', actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  const remote = catalog.fiscalSync?.remote
  if (catalog.fiscalSync?.status !== 'Conflito' || !remote) throw new DomainError('Não há conflito aberto')
  if (keep === 'Omie') {
    const differences = fiscalDifferences(snapshotOf(item), remote)
    Object.assign(catalog, remote)
    commit(catalog, actor, differences.map(entry => ({ field: entry.field, from: entry.local, to: entry.remote, reason: 'Conflito resolvido: vale o Omie' })))
  } else {
    commit(catalog, actor, [{ field: 'Fiscal', from: 'Omie', to: 'Thalamus', reason: 'Conflito resolvido: vale o Thalamus, reenviado ao Omie' }])
  }
  catalog.fiscalSync = { status: 'Sincronizado', at: now(), by: actor, remote: snapshotOf(item) }
  log(state, 'Integração', actor, `${item.code}: conflito fiscal resolvido, vale o ${keep}`, undefined, item.id)
}