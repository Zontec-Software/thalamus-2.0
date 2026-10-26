import { hasFullAccess } from './access'
import type { ErpState } from './engine'
import { addDays, DomainError, log, nextId, now, today } from './engine'
import type {
  ApprovalRole, AttributeDef, AttributeKind, BranchStock, CatalogLayer, Item, ItemCatalog, ItemClass, ItemLifecycle, ItemNature, ItemType, KeyChangeRequest,
  ProductRevision, Role, UnitContext, UnitConversion,
} from '../types/domain'

export const LIFECYCLE: ItemLifecycle[] = ['Rascunho', 'Em homologação', 'Ativo', 'Alteração pendente', 'Inativação pendente', 'Bloqueado', 'Obsoleto', 'Inativo']

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  PA: 'Produto acabado', SE: 'Peça injetada', MP: 'Matéria-prima', CP: 'Componente', EM: 'Embalagem',
  SV: 'Serviço', KF: 'Kit físico', KT: 'Kit virtual', IM: 'Imobilizado', FE: 'Ferramental',
}

export const LAYER_LABEL: Record<CatalogLayer, string> = {
  nucleo: 'Núcleo', estoque: 'Estoque', unidades: 'Unidades', manufatura: 'Estrutura e roteiro', ferramental: 'Ferramental', comercial: 'Comercial', fiscal: 'Fiscal',
  midia: 'Mídia', projetos: 'Projetos', ciclo: 'Ciclo de vida',
}

/** Tabela padrão: base da proposta e da aprovação comercial. */
export const DEFAULT_PRICE_TABLE = 'TP-PADRAO'

/** Consulta simulada ao Cadastro Nacional de Produtos (GS1/CCG): GTIN → NCM declarado pelo dono da marca. */
export const GTIN_REGISTRY: Record<string, string> = {
  [withCheckDigit('789123450001')]: '39269090',
  [withCheckDigit('789123450002')]: '39269090',
  [withCheckDigit('789123450004')]: '94032090',
  [withCheckDigit('789123450006')]: '39269090',
}

export const APPROVAL_LABEL: Record<ApprovalRole, string> = { fiscal: 'Fiscal', pcp: 'PCP', comercial: 'Comercial', tecnica: 'Técnica' }

export const NCM_TABLE: { code: string; name: string; st: boolean; cest: string }[] = [
  { code: '39269090', name: 'Outras obras de plástico', st: true, cest: '28.061.00' },
  { code: '39033090', name: 'Polímeros de estireno (ABS)', st: false, cest: '' },
  { code: '39095019', name: 'Poliuretanos (TPU)', st: false, cest: '' },
  { code: '39074090', name: 'Policarbonatos', st: false, cest: '' },
  { code: '85444200', name: 'Cabos com conectores', st: true, cest: '12.001.00' },
  { code: '85423190', name: 'Circuitos eletrônicos', st: true, cest: '21.045.00' },
  { code: '70071900', name: 'Vidro temperado', st: false, cest: '' },
  { code: '73181500', name: 'Parafusos e pinos', st: false, cest: '' },
  { code: '63079090', name: 'Artefatos têxteis', st: false, cest: '' },
  { code: '83024200', name: 'Suportes e guarnições', st: false, cest: '' },
  { code: '48191000', name: 'Caixas de papelão', st: false, cest: '' },
  { code: '94032090', name: 'Móveis de metal', st: false, cest: '' },
  { code: '84807100', name: 'Moldes para injeção de plástico', st: false, cest: '' },
]

export const UNIT_CONTEXTS: UnitContext[] = ['Compra', 'Produção', 'Estoque', 'Venda']
export const BRANCHES = ['Filial · Itabira', 'Filial · Vitória']
export const MATRIZ = 'Matriz · Contagem'

/** Quem edita cada camada. Administrador e Gestor editam tudo. */
export const EDITORS: Record<CatalogLayer, Role[]> = {
  nucleo: ['Administrador', 'Gestor', 'Engenharia'],
  estoque: ['Administrador', 'Gestor', 'Almoxarifado', 'Engenharia', 'Compras'],
  unidades: ['Administrador', 'Gestor', 'Almoxarifado', 'Engenharia', 'Compras'],
  manufatura: ['Administrador', 'Gestor', 'Engenharia', 'PCP'],
  ferramental: ['Administrador', 'Gestor', 'Engenharia', 'PCP', 'Manutenção'],
  comercial: ['Administrador', 'Gestor', 'Comercial'],
  fiscal: ['Administrador', 'Gestor', 'Financeiro'],
  midia: ['Administrador', 'Gestor', 'Engenharia', 'Comercial'],
  projetos: ['Administrador', 'Gestor', 'Engenharia'],
  ciclo: ['Administrador', 'Gestor', 'Engenharia'],
}

/** A homologação é por papel, não por pessoa. */
export const APPROVER: Partial<Record<Role, ApprovalRole[]>> = {
  Administrador: ['fiscal', 'pcp', 'comercial', 'tecnica'],
  Gestor: ['fiscal', 'pcp', 'comercial', 'tecnica'],
  Financeiro: ['fiscal'],
  Engenharia: ['pcp', 'tecnica'],
  PCP: ['pcp'],
  Comercial: ['comercial'],
}

export function canEdit(role: Role, layer: CatalogLayer) {
  return EDITORS[layer].includes(role)
}

export function canApprove(role: Role, approval: ApprovalRole) {
  return (APPROVER[role] ?? []).includes(approval)
}

export function editorsLabel(layer: CatalogLayer) {
  return EDITORS[layer].join(', ')
}

export function catalogOf(item: Item): ItemCatalog {
  return item.catalog ?? defaultCatalog(item)
}

export function ncmInfo(code: string) {
  return NCM_TABLE.find(entry => entry.code === code.replace(/\D/g, ''))
}

export function natureOf(type: ItemType): ItemNature {
  if (type === 'SV') return 'Serviço'
  if (type === 'KT') return 'Kit virtual'
  if (type === 'IM' || type === 'FE') return 'Imobilizado'
  return 'Bem'
}

export function isLocked(item: Item) {
  const life = catalogOf(item).lifecycle
  return life !== 'Rascunho' && life !== 'Em homologação'
}

export function stockable(item: Item) {
  return catalogOf(item).nature === 'Bem' && !catalogOf(item).deletedAt
}

/** Ativo de fato: a alteração ou a inativação ainda não decididas não tiram o item de uso. */
export function inUse(life: string) {
  return life === 'Ativo' || life === 'Alteração pendente' || life === 'Inativação pendente'
}

/** Entra no planejamento de materiais. Obsoleto sai; bloqueado não gera transação nova. */
export function plansMaterial(item: Item) {
  const catalog = catalogOf(item)
  return ['SE', 'MP', 'CP', 'EM'].includes(item.type) && inUse(catalog.lifecycle) && catalog.nature === 'Bem' && !catalog.deletedAt
}

export function needsStructure(item: Item) {
  return ['PA', 'SE', 'KF', 'KT'].includes(item.type)
}

/** Produto acabado, kit físico e peça injetada têm roteiro; a peça injetada roda no molde. */
export function hasRouting(item: Item) {
  return ['PA', 'KF', 'SE'].includes(item.type)
}

export function sellable(item: Item) {
  return ['PA', 'KF', 'KT', 'SV'].includes(item.type)
}

export function layersOf(item: Item): CatalogLayer[] {
  const nature = catalogOf(item).nature
  if (item.type === 'FE') return ['ferramental', 'fiscal', 'midia', 'projetos']
  if (nature === 'Serviço') return ['comercial', 'fiscal', 'projetos']
  if (nature === 'Imobilizado') return ['fiscal', 'midia']
  if (nature === 'Kit virtual') return ['manufatura', 'comercial', 'fiscal', 'midia', 'projetos']
  const layers: CatalogLayer[] = ['estoque', 'unidades']
  if (needsStructure(item)) layers.push('manufatura')
  if (item.type === 'PA' || item.type === 'KF') layers.push('comercial')
  layers.push('fiscal', 'midia', 'projetos')
  return layers
}

export function requiredApprovals(item: Item): ApprovalRole[] {
  const catalog = catalogOf(item)
  const list: ApprovalRole[] = []
  if (catalog.nature === 'Serviço') list.push('fiscal', 'comercial')
  else if (item.type === 'FE') list.push('fiscal', 'pcp')
  else if (catalog.nature === 'Imobilizado') list.push('fiscal')
  else {
    list.push('fiscal')
    if (needsStructure(item)) list.push('pcp')
    if (item.type === 'PA' || item.type === 'KF' || item.type === 'KT') list.push('comercial')
  }
  if (catalog.projectLinks.length) list.push('tecnica')
  return list
}

/** Preço da tabela vigente na data, na unidade pedida (padrão: a unidade base). */
export function currentPrice(item: Item, tableId = DEFAULT_PRICE_TABLE, unit = item.unit, date = today()) {
  return catalogOf(item).prices
    .filter(price => price.tableId === tableId && price.unit === unit && price.validFrom <= date && (!price.validTo || price.validTo >= date))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
}

/** NCM declarado no CCG para o GTIN principal, quando ele diverge do NCM do item. */
export function gtinNcmConflict(item: Item) {
  const catalog = catalogOf(item)
  const registered = catalog.gtin ? GTIN_REGISTRY[catalog.gtin] : undefined
  return registered && catalog.ncm && registered !== catalog.ncm ? registered : undefined
}

/** O que cada papel precisa encontrar certo antes de aprovar. */
export function approvalIssues(item: Item, approval: ApprovalRole): string[] {
  const catalog = catalogOf(item)
  const issues: string[] = []
  if (approval === 'fiscal' && (catalog.nature === 'Bem' || catalog.nature === 'Kit virtual')) {
    const ncm = ncmInfo(catalog.ncm)
    if (!ncm) issues.push('NCM ausente ou fora da tabela oficial')
    else if (ncm.st && !catalog.cest.trim()) issues.push('CEST obrigatório: o NCM está sujeito a substituição tributária')
    if (!catalog.origin) issues.push('Origem da mercadoria não informada')
    const conflict = gtinNcmConflict(item)
    if (conflict) issues.push(`GTIN registrado no CCG com NCM ${conflict}, diferente do NCM do item`)
  }
  if (approval === 'fiscal' && !catalog.cClassTrib.trim()) issues.push('cClassTrib não informado')
  if (approval === 'pcp' && needsStructure(item)) {
    if (!item.bom?.length) issues.push('Sem estrutura liberada')
    if ((item.type === 'PA' || item.type === 'KF') && !item.routing?.length) issues.push('Sem roteiro de produção')
  }
  if (approval === 'pcp' && item.type === 'FE') issues.push(...toolingIssues(catalog.tooling))
  if (approval === 'comercial') {
    if (!catalog.commercialName.trim()) issues.push('Descrição comercial vazia')
    if ((item.type === 'PA' || item.type === 'KF') && !catalog.gtin) issues.push('EAN/GTIN principal não informado')
    if (sellable(item) && !currentPrice(item)) issues.push('Sem preço vigente na tabela padrão')
  }
  if (approval === 'tecnica') {
    if (!catalog.projectLinks.length) issues.push('Item sem projeto vinculado')
    else if (catalog.projectLinks.some(link => !link.milestoneId)) issues.push('Vínculo de projeto sem atividade da EAP')
  }
  return issues
}

/** O ferramental só entra em roteiro com os dados que definem o tempo por peça e onde ele roda. */
export function toolingIssues(tooling: ItemCatalog['tooling']): string[] {
  const issues: string[] = []
  if (!tooling) return ['Ferramental sem dados técnicos']
  if (tooling.kind === 'Molde') {
    if (!(tooling.cavities >= 1)) issues.push('Informe as cavidades do molde')
    if (!(tooling.activeCavities >= 1 && tooling.activeCavities <= tooling.cavities)) issues.push('Cavidades ativas ficam entre 1 e as cavidades nominais')
    if (!(tooling.cycleSeconds > 0)) issues.push('Informe o ciclo padrão do molde')
  }
  if (!tooling.compatibleResourceIds.length) issues.push(tooling.kind === 'Molde' ? 'Informe ao menos uma injetora compatível' : 'Informe ao menos um posto compatível')
  if (tooling.owner === 'Cliente' && !tooling.ownerName?.trim()) issues.push('Ferramental de cliente precisa do nome do dono')
  return issues
}

export function activationIssues(state: ErpState, item: Item): string[] {
  const catalog = catalogOf(item)
  const issues: string[] = []
  for (const role of requiredApprovals(item)) {
    if (!catalog.approvals[role]) issues.push(`Falta a aprovação ${APPROVAL_LABEL[role].toLowerCase()}`)
    issues.push(...approvalIssues(item, role))
  }
  issues.push(...missingAttributes(state, item).map(def => `Atributo obrigatório sem valor: ${def.label}`))
  if (catalog.keyChanges.some(change => change.status === 'Pendente')) issues.push('Há exceção de campo-chave pendente')
  return [...new Set(issues)]
}

/** Pendências visíveis na lista e nas filas, inclusive de itens já ativos. */
export function itemFlags(state: ErpState, item: Item): string[] {
  const catalog = catalogOf(item)
  const flags: string[] = []
  if (catalog.deletedAt) return ['Excluído']
  if (catalog.nature === 'Bem' || catalog.nature === 'Kit virtual') {
    const ncm = ncmInfo(catalog.ncm)
    if (!ncm) flags.push('Sem NCM')
    else if (ncm.st && !catalog.cest) flags.push('Sem CEST')
  }
  if (needsStructure(item) && !item.bom?.length) flags.push('Sem estrutura')
  if ((item.type === 'PA' || item.type === 'KF') && !item.routing?.length) flags.push('Sem roteiro')
  if ((item.type === 'PA' || item.type === 'KF') && !catalog.gtin) flags.push('Sem EAN')
  if (gtinNcmConflict(item)) flags.push('GTIN × NCM divergente')
  if (sellable(item) && catalog.lifecycle === 'Ativo' && !currentPrice(item)) flags.push('Sem preço')
  if (catalog.keyChanges.some(change => change.status === 'Pendente')) flags.push('Exceção pendente')
  if (state.productRevisions.some(entry => entry.itemId === item.id && entry.status === 'Rascunho')) flags.push('Versão em rascunho')
  if (catalog.lifecycle === 'Obsoleto' && item.stock > 0) flags.push('Obsoleto com saldo')
  if (missingAttributes(state, item).length) flags.push('Atributos pendentes')
  if (catalog.fiscalSync?.status === 'Conflito') flags.push('Fiscal em conflito com o Omie')
  if (item.type === 'FE' && toolingIssues(catalog.tooling).length) flags.push('Ferramental incompleto')
  return flags
}

/* ---------- Atributos por classe ---------- */

/** Atributos que valem para a classe: do nó raiz até ela. O nó mais próximo redefine a mesma chave. */
export function classAttributes(state: ErpState, classId: string): (AttributeDef & { classId: string; inherited: boolean })[] {
  const merged = new Map<string, AttributeDef & { classId: string; inherited: boolean }>()
  for (const node of classPath(state, classId)) {
    for (const def of node.attributes ?? []) merged.set(def.key, { ...def, classId: node.id, inherited: node.id !== classId })
  }
  return [...merged.values()]
}

export function missingAttributes(state: ErpState, item: Item) {
  const values = catalogOf(item).attributes
  return classAttributes(state, catalogOf(item).classId).filter(def => def.required && !values[def.key]?.trim())
}

export interface AttributeInput {
  key?: string
  label: string
  kind: AttributeKind
  options: string[]
  unit: string
  required: boolean
  variantAxis: boolean
}

export function saveClassAttribute(state: ErpState, classId: string, input: AttributeInput, actor: string, role: Role) {
  if (!canEdit(role, 'nucleo')) throw new DomainError('Somente Engenharia e Gestor mantêm os atributos da classificação')
  const node = state.itemClasses.find(entry => entry.id === classId)
  if (!node) throw new DomainError('Nó não encontrado')
  const label = input.label.trim()
  if (label.length < 2) throw new DomainError('Dê um nome ao atributo')
  const options = [...new Set(input.options.map(entry => entry.trim()).filter(Boolean))]
  if (input.kind === 'Lista' && options.length < 2) throw new DomainError('Atributo de lista precisa de ao menos duas opções')
  if (input.variantAxis && input.kind !== 'Lista') throw new DomainError('Só atributo de lista vira eixo de grade')
  /** A chave é o próprio rótulo: é ela que a grade usa como nome do eixo. */
  const key = input.key ?? label
  node.attributes ??= []
  const existing = node.attributes.find(entry => entry.key === key)
  if (!input.key && classAttributes(state, classId).some(entry => entry.key === key || entry.label.toLowerCase() === label.toLowerCase())) {
    throw new DomainError('Já existe um atributo com esse nome nesta classe ou acima dela')
  }
  const def: AttributeDef = { key, label, kind: input.kind, options: input.kind === 'Lista' ? options : undefined, unit: input.unit.trim() || undefined, required: input.required, variantAxis: input.variantAxis || undefined }
  if (existing) Object.assign(existing, def)
  else node.attributes.push(def)
  log(state, 'Produtos', actor, `${classLabel(state, classId)}: atributo ${label} ${existing ? 'alterado' : 'criado'}${input.required ? ' (obrigatório)' : ''}`)
  return def
}

export function removeClassAttribute(state: ErpState, classId: string, key: string, actor: string, role: Role) {
  if (!canEdit(role, 'nucleo')) throw new DomainError('Somente Engenharia e Gestor mantêm os atributos da classificação')
  const node = state.itemClasses.find(entry => entry.id === classId)
  const def = node?.attributes?.find(entry => entry.key === key)
  if (!node || !def) throw new DomainError('Atributo não encontrado neste nó. Atributo herdado se remove no nó de origem')
  const users = state.items.filter(item => !item.catalog?.deletedAt && item.catalog?.attributes[key]?.trim() && classDescendants(state, classId).includes(item.catalog.classId))
  if (users.length) throw new DomainError(`${users.length} item(ns) já têm valor neste atributo. Limpe os valores antes de remover`)
  node.attributes = node.attributes!.filter(entry => entry.key !== key)
  log(state, 'Produtos', actor, `${classLabel(state, classId)}: atributo ${def.label} removido`)
}

/** Grava os valores do item contra as definições herdadas da classe. Chave fora da classe é recusada. */
export function setItemAttributes(state: ErpState, itemId: string, values: Record<string, string>, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'nucleo')
  const defs = classAttributes(state, catalog.classId)
  const changes: Change[] = []
  const next = { ...catalog.attributes }
  for (const [key, raw] of Object.entries(values)) {
    const def = defs.find(entry => entry.key === key)
    if (!def) throw new DomainError('Atributo não pertence à classificação do item')
    const value = raw.trim()
    if (value && def.kind === 'Número' && !Number.isFinite(Number(value.replace(',', '.')))) throw new DomainError(`${def.label} aceita apenas número`)
    if (value && def.kind === 'Lista' && !def.options?.includes(value)) throw new DomainError(`${def.label}: escolha uma das opções da lista`)
    if (catalog.modelId && def.variantAxis && (catalog.attributes[key] ?? '') !== value) throw new DomainError(`${def.label} é eixo da grade: a variante tem valor fixo`)
    track(changes, `Atributo · ${def.label}`, catalog.attributes[key] ?? '', value)
    if (value) next[key] = value
    else delete next[key]
  }
  if (!changes.length) throw new DomainError('Nada mudou')
  catalog.attributes = next
  commit(catalog, actor, changes)
}

/* ---------- Classificação ---------- */

export function classPath(state: ErpState, classId: string): ItemClass[] {
  const path: ItemClass[] = []
  let current = state.itemClasses.find(entry => entry.id === classId)
  let guard = 0
  while (current && guard++ < 50) {
    path.unshift(current)
    current = current.parentId ? state.itemClasses.find(entry => entry.id === current!.parentId) : undefined
  }
  return path
}

export function classLabel(state: ErpState, classId: string) {
  return classPath(state, classId).map(entry => entry.name).join(' › ') || 'Sem classificação'
}

export function classDescendants(state: ErpState, classId: string): string[] {
  const ids = [classId]
  for (let index = 0; index < ids.length; index++) {
    for (const child of state.itemClasses.filter(entry => entry.parentId === ids[index])) ids.push(child.id)
  }
  return ids
}

export function classOptions(state: ErpState) {
  return state.itemClasses
    .map(entry => ({ id: entry.id, label: classLabel(state, entry.id), depth: classPath(state, entry.id).length }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function ensureClassPath(state: ErpState, names: string[]) {
  let parentId: string | undefined
  for (const name of names) {
    let node = state.itemClasses.find(entry => entry.name === name && entry.parentId === parentId)
    if (!node) {
      node = { id: nextId(state, 'CL'), name, parentId }
      state.itemClasses.push(node)
    }
    parentId = node.id
  }
  return parentId ?? ''
}

export function createClass(state: ErpState, name: string, parentId: string | undefined, actor: string, role: Role) {
  if (!canEdit(role, 'nucleo')) throw new DomainError('Somente Engenharia e Gestor mantêm a classificação')
  const clean = name.trim()
  if (clean.length < 2) throw new DomainError('Dê um nome ao nó')
  if (state.itemClasses.some(entry => entry.parentId === parentId && entry.name.toLowerCase() === clean.toLowerCase())) throw new DomainError('Já existe um nó com esse nome neste nível')
  const node: ItemClass = { id: nextId(state, 'CL'), name: clean, parentId }
  state.itemClasses.push(node)
  log(state, 'Produtos', actor, `Classificação criada: ${classLabel(state, node.id)}`)
  return node
}

export function renameClass(state: ErpState, classId: string, name: string, actor: string, role: Role) {
  if (!canEdit(role, 'nucleo')) throw new DomainError('Somente Engenharia e Gestor mantêm a classificação')
  const node = state.itemClasses.find(entry => entry.id === classId)
  if (!node) throw new DomainError('Nó não encontrado')
  if (name.trim().length < 2) throw new DomainError('Dê um nome ao nó')
  const before = classLabel(state, classId)
  node.name = name.trim()
  log(state, 'Produtos', actor, `Classificação renomeada: ${before} → ${classLabel(state, classId)}`)
}

export function removeClass(state: ErpState, classId: string, actor: string, role: Role) {
  if (!canEdit(role, 'nucleo')) throw new DomainError('Somente Engenharia e Gestor mantêm a classificação')
  if (state.itemClasses.some(entry => entry.parentId === classId)) throw new DomainError('O nó tem filhos. Remova ou mova os filhos antes')
  if (state.items.some(item => item.catalog?.classId === classId)) throw new DomainError('Há itens classificados neste nó')
  const label = classLabel(state, classId)
  state.itemClasses = state.itemClasses.filter(entry => entry.id !== classId)
  log(state, 'Produtos', actor, `Classificação removida: ${label}`)
}

/* ---------- Duplicidade ---------- */

export function similarItems(state: ErpState, name: string, exceptId?: string) {
  const tokens = normalize(name).split(/\s+/).filter(token => token.length > 2)
  if (!tokens.length) return []
  return state.items.filter(item => {
    if (item.id === exceptId || item.catalog?.deletedAt) return false
    const text = normalize(item.name)
    const hits = tokens.filter(token => text.includes(token)).length
    return tokens.length === 1 ? hits === 1 : hits >= Math.min(2, tokens.length)
  }).slice(0, 5)
}

export function validGtin(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export function withCheckDigit(base: string) {
  const sum = base.split('').map(Number).reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return `${base}${(10 - (sum % 10)) % 10}`
}

const usesCode = (catalog: ItemCatalog | undefined, code: string) =>
  !!catalog && (catalog.gtin === code || catalog.gtinTax === code || catalog.barcodes.some(entry => entry.code === code))

export function assertGtin(state: ErpState, item: Item, code: string, label: string) {
  if (!code) return
  if (!validGtin(code)) throw new DomainError(`${label} inválido: confira os dígitos e o dígito verificador`)
  const owner = state.items.find(entry => entry.id !== item.id && !entry.catalog?.deletedAt && usesCode(entry.catalog, code))
  if (owner) throw new DomainError(`${label} já usado por ${owner.code}. O EAN é único no cadastro`)
}

/* ---------- Criação e núcleo ---------- */

export interface NewItemInput {
  name: string
  type: ItemType
  unit: string
  classId: string
}

export function createItem(state: ErpState, input: NewItemInput, actor: string, role: Role = 'Gestor') {
  if (!canEdit(role, 'nucleo')) throw new DomainError('Somente Engenharia e Gestor criam itens')
  const name = input.name.trim()
  if (name.length < 3) throw new DomainError('Informe a descrição do item')
  if (!state.itemClasses.some(entry => entry.id === input.classId)) throw new DomainError('Classifique o item na árvore')
  if (!input.unit.trim()) throw new DomainError('Informe a unidade base')
  const serial = state.items.reduce((max, item) => Math.max(max, Number(item.code.match(/^RF-(\d{5})$/)?.[1] ?? 10000)), 10000) + 1
  const code = `RF-${serial}`
  const nature = natureOf(input.type)
  const at = now()
  const item: Item = {
    id: `it-${code.toLowerCase()}`, code, name, type: input.type, unit: input.unit.trim(),
    stock: 0, minimum: 0, location: nature === 'Bem' ? 'A definir' : '—', cost: 0,
    catalog: {
      ...blankCatalog(nature),
      classId: input.classId, lifecycle: 'Rascunho',
      createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor, version: 1,
      audit: [{ at, actor, version: 1, text: 'Item criado como rascunho. Não entra em pedido, compra ou produção até ser ativado.' }],
    },
  }
  state.items.unshift(item)
  log(state, 'Produtos', actor, `${code} criado como rascunho`, undefined, item.id)
  return item
}

export interface CorePatch {
  name: string
  type: ItemType
  unit: string
  classId: string
}

export function updateCore(state: ErpState, itemId: string, patch: CorePatch, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'nucleo')
  if (isLocked(item)) {
    if (patch.type !== item.type) throw new DomainError('O tipo não muda depois da ativação: ele define as camadas do item')
    if (patch.unit.trim() !== item.unit) throw new DomainError('Depois da ativação, a unidade base muda só por solicitação com origem externa')
    if (patch.name.trim() !== item.name || patch.classId !== catalog.classId) throw new DomainError('Depois da ativação, descrição e classificação mudam por solicitação com origem externa')
  }
  if (!patch.name.trim()) throw new DomainError('A descrição não pode ficar vazia')
  if (!state.itemClasses.some(entry => entry.id === patch.classId)) throw new DomainError('Escolha um nó da classificação')
  const changes: Change[] = []
  track(changes, 'Descrição', item.name, patch.name.trim())
  track(changes, 'Tipo', ITEM_TYPE_LABEL[item.type], ITEM_TYPE_LABEL[patch.type])
  track(changes, 'Unidade base', item.unit, patch.unit.trim())
  track(changes, 'Classificação', classLabel(state, catalog.classId), classLabel(state, patch.classId))
  if (!changes.length) throw new DomainError('Nada mudou')
  if (patch.type !== item.type) {
    catalog.nature = natureOf(patch.type)
    catalog.approvals = {}
  }
  item.name = patch.name.trim()
  item.type = patch.type
  item.unit = patch.unit.trim()
  catalog.classId = patch.classId
  commit(catalog, actor, changes)
  log(state, 'Produtos', actor, `${item.code}: núcleo atualizado`, undefined, item.id)
}

export interface CommercialPatch {
  commercialName: string
  brand: string
  productLine: string
  categories: string[]
}

export function updateCommercial(state: ErpState, itemId: string, patch: CommercialPatch, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'comercial')
  const categories = [...new Set(patch.categories.map(entry => entry.trim()).filter(Boolean))]
  const changes: Change[] = []
  track(changes, 'Descrição comercial', catalog.commercialName, patch.commercialName.trim())
  track(changes, 'Marca', catalog.brand, patch.brand.trim())
  track(changes, 'Linha comercial', catalog.productLine, patch.productLine.trim())
  track(changes, 'Categorias', catalog.categories.join(', '), categories.join(', '))
  if (!changes.length) throw new DomainError('Nada mudou')
  catalog.commercialName = patch.commercialName.trim()
  catalog.brand = patch.brand.trim()
  catalog.productLine = patch.productLine.trim()
  catalog.categories = categories
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.comercial
  commit(catalog, actor, changes)
}

export function updateFiscal(state: ErpState, itemId: string, patch: { ncm: string; cest: string; origin: string; gtinTax: string; exTipi: string }, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'fiscal')
  const ncm = patch.ncm.replace(/\D/g, '')
  if (ncm && !ncmInfo(ncm)) throw new DomainError('NCM não encontrado na tabela oficial')
  if (isLocked(item) && ncm !== catalog.ncm) throw new DomainError('Depois da ativação, o NCM muda só por solicitação de exceção')
  if (ncm && ncmInfo(ncm)!.st && !patch.cest.trim()) throw new DomainError('CEST obrigatório para NCM sujeito a substituição tributária')
  const gtinTax = patch.gtinTax.replace(/\D/g, '')
  if (gtinTax && !catalog.barcodes.some(entry => entry.code === gtinTax)) assertGtin(state, item, gtinTax, 'GTIN tributável')
  const exTipi = patch.exTipi.replace(/\D/g, '')
  if (exTipi && (!ncm || !/^\d{2,3}$/.test(exTipi))) throw new DomainError('Ex-TIPI tem 2 ou 3 dígitos e depende de um NCM')
  const changes: Change[] = []
  track(changes, 'NCM', catalog.ncm, ncm)
  track(changes, 'Ex-TIPI', catalog.exTipi, exTipi)
  track(changes, 'CEST', catalog.cest, patch.cest.trim())
  track(changes, 'Origem', catalog.origin, patch.origin)
  track(changes, 'GTIN tributável', catalog.gtinTax, gtinTax)
  if (!changes.length) throw new DomainError('Nada mudou')
  catalog.ncm = ncm
  catalog.exTipi = exTipi
  catalog.cest = patch.cest.trim()
  catalog.origin = patch.origin
  catalog.gtinTax = gtinTax
  if (catalog.lifecycle === 'Em homologação') delete catalog.approvals.fiscal
  const fiscalTouched = changes.some(change => change.field !== 'GTIN tributável')
  if (fiscalTouched && catalog.lifecycle !== 'Rascunho') {
    catalog.fiscalSync = { ...catalog.fiscalSync, status: catalog.fiscalSync?.status === 'Conflito' ? 'Conflito' : 'Enviar ao Omie', at: now(), by: actor }
  }
  commit(catalog, actor, changes)
}

export interface StockPatch {
  location: string
  minimum: number
  leadTimeDays: number
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  minLot: number
  lotMultiple: number
  lot: boolean
  expiry: boolean
  serial: boolean
  allowNegative: boolean
}

export function updateStockLayer(state: ErpState, itemId: string, patch: StockPatch, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  if (!layersOf(item).includes('estoque')) throw new DomainError('Este tipo de item não tem camada de estoque')
  const catalog = editable(item, role, 'estoque')
  const numbers = [patch.minimum, patch.leadTimeDays, patch.weightKg, patch.lengthCm, patch.widthCm, patch.heightCm, patch.minLot, patch.lotMultiple]
  if (numbers.some(value => !(value >= 0))) throw new DomainError('Valores não podem ser negativos')
  if (patch.minLot > 0 && patch.lotMultiple > 0 && patch.minLot < patch.lotMultiple) throw new DomainError('O lote mínimo não pode ser menor que o múltiplo de compra')
  const controlled = patch.lot || patch.expiry
  if (!controlled && item.lots?.some(lot => lot.quantity > 0)) throw new DomainError('Há lotes com saldo. Consuma ou ajuste antes de desligar o controle de lote')
  const changes: Change[] = []
  track(changes, 'Endereço', item.location, patch.location.trim())
  track(changes, 'Estoque mínimo', String(item.minimum), String(patch.minimum))
  track(changes, 'Lead time', String(item.leadTimeDays ?? 0), String(patch.leadTimeDays))
  track(changes, 'Peso', String(catalog.weightKg), String(patch.weightKg))
  track(changes, 'Dimensões (C × L × A)', `${catalog.lengthCm} × ${catalog.widthCm} × ${catalog.heightCm} cm`, `${patch.lengthCm} × ${patch.widthCm} × ${patch.heightCm} cm`)
  track(changes, 'Lote mínimo', String(catalog.minLot), String(patch.minLot))
  track(changes, 'Múltiplo de compra', String(catalog.lotMultiple), String(patch.lotMultiple))
  track(changes, 'Controla lote', yes(catalog.lot), yes(patch.lot))
  track(changes, 'Controla validade', yes(catalog.expiry), yes(patch.expiry))
  track(changes, 'Controla serial', yes(catalog.serial), yes(patch.serial))
  track(changes, 'Permite negativo', yes(catalog.allowNegative), yes(patch.allowNegative))
  if (!changes.length) throw new DomainError('Nada mudou')
  item.location = patch.location.trim() || item.location
  item.minimum = patch.minimum
  item.leadTimeDays = patch.leadTimeDays
  catalog.weightKg = patch.weightKg
  catalog.lengthCm = patch.lengthCm
  catalog.widthCm = patch.widthCm
  catalog.heightCm = patch.heightCm
  catalog.minLot = patch.minLot
  catalog.lotMultiple = patch.lotMultiple
  if (controlled && !item.lots?.length && item.stock > 0) {
    item.lots = [{ code: 'L-SALDO', quantity: item.stock, receivedAt: now(), expiry: patch.expiry ? addDays(today(), 90) : undefined }]
  }
  catalog.lot = patch.lot
  catalog.expiry = patch.expiry
  catalog.serial = patch.serial
  catalog.allowNegative = patch.allowNegative
  commit(catalog, actor, changes)
}

export function updateBranch(state: ErpState, itemId: string, branch: string, patch: Omit<BranchStock, 'branch'>, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'estoque')
  if (!BRANCHES.includes(branch)) throw new DomainError('Filial desconhecida')
  const current = catalog.branches.find(entry => entry.branch === branch) ?? { branch, enabled: false, location: '', minimum: 0 }
  if (patch.enabled && !patch.location.trim()) throw new DomainError('Informe o endereço na filial')
  const changes: Change[] = []
  track(changes, `${branch} · habilitado`, yes(current.enabled), yes(patch.enabled))
  track(changes, `${branch} · endereço`, current.location, patch.location.trim())
  track(changes, `${branch} · mínimo`, String(current.minimum), String(patch.minimum))
  if (!changes.length) throw new DomainError('Nada mudou')
  catalog.branches = [...catalog.branches.filter(entry => entry.branch !== branch), { branch, ...patch, location: patch.location.trim() }]
  commit(catalog, actor, changes)
}

/* ---------- Unidades ---------- */

export function addConversion(state: ErpState, itemId: string, conversion: UnitConversion, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  if (!layersOf(item).includes('unidades')) throw new DomainError('Este tipo de item não tem conversão de unidades')
  const catalog = editable(item, role, 'unidades')
  const problem = conversionIssue(item, conversion, catalog.conversions)
  if (problem) throw new DomainError(problem)
  catalog.conversions.push({ unit: conversion.unit.trim(), factor: conversion.factor, context: conversion.context })
  commit(catalog, actor, [{ field: 'Conversão', from: '', to: `${conversion.context}: 1 ${conversion.unit.trim()} = ${conversion.factor} ${item.unit}` }])
}

export function removeConversion(state: ErpState, itemId: string, index: number, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'unidades')
  const [removed] = catalog.conversions.splice(index, 1)
  if (!removed) throw new DomainError('Conversão não encontrada')
  commit(catalog, actor, [{ field: 'Conversão', from: `${removed.context}: 1 ${removed.unit} = ${removed.factor} ${item.unit}`, to: '' }])
}

/** Converte só entre a unidade base e uma alternativa. Alternativa → alternativa é cadeia e é recusada. */
export function convertQuantity(item: Item, quantity: number, from: string, to: string, context?: UnitContext) {
  if (from === to) return quantity
  const catalog = catalogOf(item)
  if (from !== item.unit && to !== item.unit) throw new DomainError('Conversão em cadeia não é permitida: converta pela unidade base')
  const alternative = from === item.unit ? to : from
  const conversion = catalog.conversions.find(entry => entry.unit === alternative && (!context || entry.context === context))
  if (!conversion) throw new DomainError(`Sem fator de ${alternative} para ${item.unit}${context ? ` no contexto ${context}` : ''}`)
  return from === item.unit ? quantity / conversion.factor : quantity * conversion.factor
}

/* ---------- Exceção de campo-chave ---------- */

const CHANGE_LABEL: Record<KeyChangeRequest['field'], string> = { ncm: 'NCM', unit: 'Unidade base', name: 'Descrição', class: 'Classificação' }

export function requestKeyChange(state: ErpState, itemId: string, field: KeyChangeRequest['field'], to: string, reason: string, actor: string, role: Role = 'Gestor', origin?: { module: string; id: string }) {
  const item = findItem(state, itemId)
  const catalog = ensure(item)
  if (catalog.lifecycle === 'Inativo') throw new DomainError('Item inativo: novas solicitações não são aceitas')
  if (catalog.lifecycle === 'Inativação pendente') throw new DomainError('A inativação está pendente. Novas alterações não são aceitas')
  editable(item, role, field === 'ncm' ? 'fiscal' : 'nucleo')
  if (!isLocked(item)) throw new DomainError('Item ainda não ativado: edite o campo direto')
  if (!origin?.module.trim() || !origin.id.trim()) throw new DomainError('A alteração precisa de uma origem externa: OS, OP, PAP, oportunidade ou outro documento')
  const value = field === 'ncm' ? to.replace(/\D/g, '') : to.trim()
  const from = field === 'ncm' ? catalog.ncm : field === 'unit' ? item.unit : field === 'name' ? item.name : catalog.classId
  if (!value) throw new DomainError('Informe o novo valor')
  if (value === from) throw new DomainError('O valor proposto é igual ao atual')
  if (field === 'ncm' && !ncmInfo(value)) throw new DomainError('NCM não encontrado na tabela oficial')
  if (field === 'class' && !state.itemClasses.some(entry => entry.id === value)) throw new DomainError('Classificação não encontrada')
  if (!reason.trim()) throw new DomainError('A justificativa é obrigatória')
  if (catalog.keyChanges.some(change => change.field === field && change.status === 'Pendente')) throw new DomainError('Já existe uma solicitação pendente para este campo')
  const request: KeyChangeRequest = {
    id: nextId(state, 'EXC'), field, from, to: value, reason: reason.trim(),
    originModule: origin.module.trim(), originId: origin.id.trim(),
    requestedBy: actor, requestedAt: now(), status: 'Pendente',
  }
  catalog.keyChanges.unshift(request)
  commit(catalog, actor, [{ field: `${CHANGE_LABEL[field]} (solicitado)`, from, to: value, reason: `${request.originModule} ${request.originId}: ${request.reason}` }])
  if (catalog.lifecycle === 'Ativo') transition(state, item, 'Alteração pendente', actor, 'Alteração solicitada. Os dados vigentes continuam até a aprovação')
  log(state, 'Produtos', actor, `${item.code}: ${CHANGE_LABEL[field]} aguardando aprovação, origem ${request.originModule} ${request.originId}`, undefined, item.id)
  return request
}

export function decideKeyChange(state: ErpState, itemId: string, requestId: string, approve: boolean, note: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = ensure(item)
  if (!hasFullAccess(role)) throw new DomainError('Exceção em campo-chave é decidida pela gestão do cadastro')
  const request = catalog.keyChanges.find(entry => entry.id === requestId)
  if (!request || request.status !== 'Pendente') throw new DomainError('Solicitação não encontrada ou já decidida')
  if (request.requestedBy === actor) throw new DomainError('Quem solicitou não aprova a própria exceção')
  if (!approve && !note.trim()) throw new DomainError('Informe o motivo da recusa')
  if (approve && request.field === 'ncm' && ncmInfo(request.to)!.st && !catalog.cest) throw new DomainError('O novo NCM exige CEST. Preencha o CEST antes de aprovar')
  request.status = approve ? 'Aprovada' : 'Recusada'
  request.decidedBy = actor
  request.decidedAt = now()
  request.note = note.trim() || undefined
  const label = CHANGE_LABEL[request.field]
  if (approve) {
    if (request.field === 'ncm') catalog.ncm = request.to
    else if (request.field === 'unit') item.unit = request.to
    else if (request.field === 'name') item.name = request.to
    else catalog.classId = request.to
  }
  commit(catalog, actor, [{ field: `${label} (${approve ? 'alteração aprovada' : 'alteração recusada'})`, from: request.from, to: approve ? request.to : request.from, reason: approve ? request.reason : request.note }])
  if (catalog.lifecycle === 'Alteração pendente' && !catalog.keyChanges.some(entry => entry.status === 'Pendente')) {
    transition(state, item, 'Ativo', actor, 'Alteração decidida. Os dados vigentes seguem')
  }
  log(state, 'Produtos', actor, `${item.code}: ${label} ${approve ? 'aprovada' : 'recusada'}`, undefined, item.id)
}

/* ---------- Ciclo de vida ---------- */

export function submitItem(state: ErpState, itemId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Rascunho') throw new DomainError('Só um rascunho segue para homologação')
  const missing = missingAttributes(state, item)
  if (missing.length) throw new DomainError(`Preencha os atributos obrigatórios da classe: ${missing.map(def => def.label).join(', ')}`)
  catalog.approvals = {}
  transition(state, item, 'Em homologação', actor, 'Cadastro completo, enviado aos aprovadores')
}

export function approveItem(state: ErpState, itemId: string, approval: ApprovalRole, actor: string, actorRole: Role) {
  const item = findItem(state, itemId)
  const catalog = ensure(item)
  if (catalog.lifecycle !== 'Em homologação') throw new DomainError('A aprovação acontece com o item em homologação')
  if (!requiredApprovals(item).includes(approval)) throw new DomainError('Este papel não homologa este tipo de item')
  if (!canApprove(actorRole, approval)) throw new DomainError(`A homologação é por papel. O perfil ${actorRole} não registra a aprovação ${APPROVAL_LABEL[approval].toLowerCase()}`)
  const issues = approvalIssues(item, approval)
  if (issues.length) throw new DomainError(`Antes de aprovar: ${issues.join('; ')}`)
  catalog.approvals[approval] = actor
  commit(catalog, actor, [{ field: `Aprovação ${APPROVAL_LABEL[approval].toLowerCase()}`, from: '', to: actor }])
  if (!activationIssues(state, item).length) {
    transition(state, item, 'Ativo', actor, 'Todas as aprovações registradas. Código, tipo, unidade base e NCM congelados')
    return 'Ativo' as const
  }
  return 'Em homologação' as const
}

export function finishActivation(state: ErpState, itemId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Em homologação') throw new DomainError('O item não está em homologação')
  const issues = activationIssues(state, item)
  if (issues.length) throw new DomainError(issues.join('. '))
  transition(state, item, 'Ativo', actor, 'Ativado. Código, tipo, unidade base e NCM congelados')
}

export function returnItem(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = ensure(item)
  if (catalog.lifecycle !== 'Em homologação') throw new DomainError('A devolução vale para item em homologação')
  if (!(APPROVER[role] ?? []).some(approval => requiredApprovals(item).includes(approval)) && !canEdit(role, 'ciclo')) throw new DomainError('Só um aprovador do item pode devolver')
  if (!reason.trim()) throw new DomainError('Informe o motivo da devolução')
  catalog.approvals = {}
  transition(state, item, 'Rascunho', actor, `Devolvido: ${reason.trim()}`)
}

export function blockItem(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Ativo') throw new DomainError('Só um item ativo pode ser bloqueado')
  if (!reason.trim()) throw new DomainError('Informe o motivo do bloqueio')
  transition(state, item, 'Bloqueado', actor, `${reason.trim()}. Não entra em transação nova; saldo e histórico ficam`)
}

export function reactivateItem(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Bloqueado') throw new DomainError('Só um item bloqueado volta a ativo')
  if (!reason.trim()) throw new DomainError('Informe o motivo da reativação')
  transition(state, item, 'Ativo', actor, reason.trim())
}

export function obsoleteItem(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Ativo' && catalog.lifecycle !== 'Bloqueado') throw new DomainError('Obsoletar vale para item ativo ou bloqueado')
  if (!reason.trim()) throw new DomainError('Informe o motivo')
  transition(state, item, 'Obsoleto', actor, `${reason.trim()}. ${item.stock > 0 ? 'Sai do planejamento; o saldo restante continua sendo consumido' : 'Sai do planejamento'}`)
}

/** O que impede inativar: saldo e qualquer documento em aberto. */
export function openPendencies(state: ErpState, itemId: string): string[] {
  const item = findItem(state, itemId)
  const list: string[] = []
  if (item.stock > 0) list.push(`Saldo de ${item.stock} ${item.unit}`)
  const ops = state.productionOrders.filter(op => op.status !== 'Concluída' && (op.itemId === itemId || op.materials.some(line => line.itemId === itemId)))
  if (ops.length) list.push(`${ops.length} ordem(ns) de produção em aberto`)
  const requisitions = state.requisitions.filter(req => req.itemId === itemId && req.status !== 'Recebida')
  if (requisitions.length) list.push(`${requisitions.length} requisição(ões) de compra em aberto`)
  const orders = state.purchaseOrders.filter(order => order.itemId === itemId && order.status !== 'Recebido' && order.status !== 'Cancelado')
  if (orders.length) list.push(`${orders.length} pedido(s) de compra em aberto`)
  const demands = state.demands.filter(demand => demand.itemId === itemId && (demand.status === 'Aberta' || demand.status === 'Em atendimento'))
  if (demands.length) list.push(`${demands.length} demanda(s) em aberto`)
  const proposals = state.proposals.filter(proposal => (proposal.status === 'Rascunho' || proposal.status === 'Enviada') && proposal.lines.some(line => line.itemId === itemId))
  if (proposals.length) list.push(`${proposals.length} proposta(s) em aberto`)
  const sales = state.salesOrders.filter(order => order.shipment?.status !== 'Expedido' && order.shipment?.status !== 'Faturado' && (order.itemId === itemId || order.lines?.some(line => line.itemId === itemId)))
  if (sales.length) list.push(`${sales.length} pedido(s) de venda não expedidos`)
  const parents = state.items.filter(entry => entry.id !== itemId && inUse(entry.catalog?.lifecycle ?? '') && entry.bom?.some(line => line.itemId === itemId))
  if (parents.length) list.push(`Componente da estrutura vigente de ${parents.map(entry => entry.code).join(', ')}`)
  return list
}

export function requestInactivation(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (!['Ativo', 'Alteração pendente', 'Bloqueado', 'Obsoleto'].includes(catalog.lifecycle)) throw new DomainError('A inativação parte de um item em uso')
  if (!reason.trim()) throw new DomainError('Informe o motivo')
  transition(state, item, 'Inativação pendente', actor, reason.trim())
}

/** Aprova a inativação. Estoque, ordens e pedidos já abertos seguem. Solicitações pendentes são negadas. */
export function approveInactivation(state: ErpState, itemId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Inativação pendente') throw new DomainError('Não há inativação pendente para aprovar')
  for (const change of catalog.keyChanges.filter(entry => entry.status === 'Pendente')) {
    change.status = 'Recusada'
    change.decidedBy = actor
    change.decidedAt = now()
    change.note = 'Item inativado. A solicitação foi negada.'
  }
  transition(state, item, 'Inativo', actor, 'Inativado. Estoque, ordens e pedidos já abertos seguem. Novas solicitações ficam bloqueadas.')
}

export function rejectInactivation(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Inativação pendente') throw new DomainError('Não há inativação pendente')
  if (!reason.trim()) throw new DomainError('Informe o motivo da recusa')
  const back = catalog.keyChanges.some(entry => entry.status === 'Pendente') ? 'Alteração pendente' : 'Ativo'
  transition(state, item, back, actor, `Inativação recusada: ${reason.trim()}`)
}

export function inactivateItem(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  if (ensure(item).lifecycle !== 'Inativação pendente') {
    requestInactivation(state, itemId, reason, actor, role)
  }
  return approveInactivation(state, itemId, actor, role)
}

export type ItemUsage = { sellable: boolean; purchasable: boolean; stockable: boolean; manufacturable: boolean; assetizable: boolean }

/** Indicadores de uso. Sem cadastro próprio, saem do tipo. */
export function usageOf(item: Item): ItemUsage {
  const saved = item.behaviors
  if (saved) return { sellable: saved.sellable, purchasable: saved.purchasable, stockable: saved.stockable, manufacturable: saved.manufacturable, assetizable: saved.assetizable }
  const type = item.type
  return {
    sellable: ['PA', 'KF', 'KT', 'SV'].includes(type),
    purchasable: ['MP', 'CP', 'EM', 'IM', 'FE'].includes(type),
    stockable: !['SV', 'KT'].includes(type),
    manufacturable: ['PA', 'SE', 'KF'].includes(type),
    assetizable: type === 'IM' || type === 'FE',
  }
}

export function setItemUsage(state: ErpState, itemId: string, usage: ItemUsage, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'nucleo')
  if (isLocked(item)) throw new DomainError('Depois da ativação, os indicadores de uso mudam por solicitação com origem externa')
  item.behaviors = { ...usage }
  commit(catalog, actor, [{ field: 'Indicadores de uso', from: '', to: Object.entries(usage).filter(([, on]) => on).map(([key]) => key).join(', ') }])
}

/** Onde o item já foi usado. Item nunca referenciado pode ser apagado de verdade. */
export function references(state: ErpState, itemId: string): string[] {
  const list: string[] = []
  const add = (count: number, label: string) => { if (count) list.push(`${count} ${label}`) }
  add(state.items.filter(entry => entry.bom?.some(line => line.itemId === itemId)).length, 'estrutura(s) vigente(s)')
  add(state.productRevisions.filter(entry => entry.itemId !== itemId && entry.lines?.some(line => line.itemId === itemId)).length, 'versão(ões) de estrutura')
  add(state.productionOrders.filter(op => op.itemId === itemId || op.materials.some(line => line.itemId === itemId)).length, 'ordem(ns) de produção')
  add(state.requisitions.filter(req => req.itemId === itemId).length, 'requisição(ões)')
  add(state.purchaseOrders.filter(order => order.itemId === itemId).length, 'pedido(s) de compra')
  add(state.demands.filter(demand => demand.itemId === itemId).length, 'demanda(s)')
  add(state.movements.filter(movement => movement.itemId === itemId).length, 'movimentação(ões) de estoque')
  add(state.salesOrders.filter(order => order.itemId === itemId || order.lines?.some(line => line.itemId === itemId)).length, 'pedido(s) de venda')
  add(state.proposals.filter(proposal => proposal.lines.some(line => line.itemId === itemId)).length, 'proposta(s)')
  add(state.opportunities.filter(entry => entry.itemIds?.includes(itemId)).length, 'oportunidade(s)')
  add(state.technicalServiceOrders.filter(entry => entry.parts?.some(part => part.itemId === itemId) || entry.usedItemIds.includes(itemId)).length, 'chamado(s) de assistência')
  add(state.projects.filter(project => project.itemId === itemId).length, 'projeto(s)')
  return list
}

export function deleteItem(state: ErpState, itemId: string, reason: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = editable(item, role, 'ciclo')
  if (catalog.lifecycle !== 'Rascunho' && catalog.lifecycle !== 'Inativo') throw new DomainError('Só rascunho ou item inativo pode ser excluído')
  if (!reason.trim()) throw new DomainError('Informe o motivo da exclusão')
  if (item.stock > 0) throw new DomainError('Item com saldo não pode ser excluído')
  const refs = references(state, itemId)
  if (!refs.length) {
    state.items = state.items.filter(entry => entry.id !== itemId)
    state.productRevisions = state.productRevisions.filter(entry => entry.itemId !== itemId)
    log(state, 'Produtos', actor, `${item.code} apagado (nunca foi usado): ${reason.trim()}`)
    return 'física' as const
  }
  catalog.deletedAt = now()
  catalog.deletedBy = actor
  commit(catalog, actor, [{ field: 'Exclusão lógica', from: '', to: refs.join(', '), reason: reason.trim() }])
  log(state, 'Produtos', actor, `${item.code} excluído logicamente: ${reason.trim()}`, undefined, item.id)
  return 'lógica' as const
}

export function restoreItem(state: ErpState, itemId: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  const catalog = ensure(item)
  if (!hasFullAccess(role)) throw new DomainError('Só a gestão do cadastro restaura itens excluídos')
  if (!catalog.deletedAt) throw new DomainError('O item não está excluído')
  catalog.deletedAt = undefined
  catalog.deletedBy = undefined
  commit(catalog, actor, [{ field: 'Exclusão lógica', from: 'Excluído', to: 'Restaurado' }])
}

/* ---------- Versões de estrutura ---------- */

export function openBomVersion(state: ErpState, itemId: string, notes: string, actor: string, role: Role = 'Gestor') {
  const item = findItem(state, itemId)
  if (!layersOf(item).includes('manufatura')) throw new DomainError('Este tipo de item não tem estrutura')
  editable(item, role, 'manufatura')
  if (state.productRevisions.some(entry => entry.itemId === itemId && entry.status === 'Rascunho')) throw new DomainError('Já existe uma versão em rascunho. Conclua ou descarte antes')
  const codes = state.productRevisions.filter(entry => entry.itemId === itemId).map(entry => entry.code)
  const last = [...codes, item.revision ?? ''].filter(Boolean).sort().pop()
  const code = last ? String.fromCharCode(last.charCodeAt(0) + 1) : 'A'
  const revision: ProductRevision = {
    id: `rev-${itemId}-${code.toLowerCase()}-${nextId(state, 'RV').split('-')[1]}`, itemId, code, status: 'Rascunho', createdAt: now(), createdBy: actor,
    checklist: [{ label: 'Estrutura conferida', done: false }, ...(hasRouting(item) ? [{ label: 'Roteiro conferido', done: false }] : [])],
    notes: notes.trim() || 'Alteração controlada da estrutura', lines: (item.bom ?? []).map(line => ({ ...line })),
    routing: hasRouting(item) ? (item.routing ?? []).map(step => ({ ...step, instructions: [...step.instructions] })) : undefined,
  }
  state.productRevisions.unshift(revision)
  log(state, 'Engenharia', actor, `${item.code}: versão ${code} aberta`, undefined, item.id)
  return revision
}

export function setBomLine(state: ErpState, revisionId: string, componentId: string, quantity: number, actor: string, role: Role = 'Gestor', loss?: number) {
  const revision = draftRevision(state, revisionId)
  const item = findItem(state, revision.itemId)
  editable(item, role, 'manufatura')
  if (!(quantity > 0)) throw new DomainError('A quantidade tem de ser maior que zero')
  if (loss !== undefined && !(loss >= 0 && loss < 100)) throw new DomainError('A perda prevista fica entre 0 e 99%')
  const component = findItem(state, componentId)
  if (component.id === item.id) throw new DomainError('O item não pode ser componente de si mesmo')
  if (containsInTree(state, component.id, item.id)) throw new DomainError(`${component.code} já usa ${item.code} na estrutura: isso criaria um ciclo`)
  if (!inUse(catalogOf(component).lifecycle)) throw new DomainError(`${component.code} está ${catalogOf(component).lifecycle.toLowerCase()}: só componente em uso entra em versão nova`)
  if (catalogOf(component).nature === 'Serviço' || catalogOf(component).nature === 'Imobilizado') throw new DomainError('Serviço e imobilizado não entram em estrutura')
  revision.lines ??= []
  const line = revision.lines.find(entry => entry.itemId === componentId)
  if (line) {
    line.quantity = quantity
    if (loss !== undefined) line.loss = loss || undefined
  } else revision.lines.push({ itemId: componentId, quantity, loss: loss || undefined })
  revision.checklist.forEach(entry => { entry.done = false })
  void actor
}

export function removeBomLine(state: ErpState, revisionId: string, componentId: string, actor: string, role: Role = 'Gestor') {
  const revision = draftRevision(state, revisionId)
  editable(findItem(state, revision.itemId), role, 'manufatura')
  revision.lines = (revision.lines ?? []).filter(entry => entry.itemId !== componentId)
  revision.checklist.forEach(entry => { entry.done = false })
  void actor
}

export function toggleRevisionCheck(state: ErpState, revisionId: string, label: string, role: Role = 'Gestor') {
  const revision = draftRevision(state, revisionId)
  editable(findItem(state, revision.itemId), role, 'manufatura')
  const check = revision.checklist.find(entry => entry.label === label)
  if (check) check.done = !check.done
}

export function discardBomVersion(state: ErpState, revisionId: string, actor: string, role: Role = 'Gestor') {
  const revision = draftRevision(state, revisionId)
  const item = findItem(state, revision.itemId)
  editable(item, role, 'manufatura')
  state.productRevisions = state.productRevisions.filter(entry => entry.id !== revisionId)
  log(state, 'Engenharia', actor, `${item.code}: versão ${revision.code} descartada`, undefined, item.id)
}

/* ---------- Carga inicial ---------- */

export function defaultCatalog(item: Pick<Item, 'id' | 'name' | 'type' | 'family'> & { unit?: string }): ItemCatalog {
  const nature = natureOf(item.type)
  const preset = PRESET[item.id] ?? {}
  const typed = typedDefaults(item.type)
  const at = '2026-08-01T12:00:00.000Z'
  const gtin = preset.gtin ?? ''
  return {
    ...blankCatalog(nature),
    ...typed,
    ...preset,
    barcodes: preset.barcodes ?? (gtin ? [{ code: gtin, kind: 'EAN-13', unit: item.unit ?? 'un', main: true }] : []),
    createdAt: at, createdBy: 'Carga inicial', updatedAt: at, updatedBy: 'Carga inicial', version: 1,
    conversions: preset.conversions ?? typed.conversions ?? [],
    branches: preset.branches ?? [],
    approvals: preset.approvals ?? (preset.lifecycle && preset.lifecycle !== 'Ativo' ? {} : Object.fromEntries(requiredFor(item.type, nature).map(role => [role, 'Carga inicial']))),
    keyChanges: preset.keyChanges ?? [],
    audit: preset.audit ?? [{ at, actor: 'Carga inicial', version: 1, text: 'Item incorporado ao cadastro único' }],
  }
}

/** Caminho na árvore para os itens da carga inicial. */
export function seedPath(item: Pick<Item, 'id' | 'type' | 'family'>): string[] {
  const custom = SEED_PATH[item.id]
  if (custom) return custom
  if (item.type === 'PA') return ['Produtos acabados', item.family === 'Lite' ? 'Linha Lite' : 'Linha Hard', item.family === 'Lite' ? 'Mesas' : 'Cases']
  if (item.type === 'SE') return ['Peças injetadas', 'Gabinete']
  if (item.type === 'MP') return ['Matérias-primas', 'Resinas', 'Termoplásticos']
  if (item.type === 'EM') return ['Embalagens', 'Expedição', 'Caixas']
  if (item.type === 'SV') return ['Serviços', 'Campo']
  if (item.type === 'KT' || item.type === 'KF') return ['Kits', 'Venda']
  if (item.type === 'IM') return ['Patrimônio', 'Logística']
  if (item.type === 'FE') return ['Ferramental', 'Moldes de injeção']
  return ['Componentes', 'Diversos']
}

const SEED_PATH: Record<string, string[]> = {
  'mp-abs': ['Matérias-primas', 'Resinas', 'Termoplásticos', 'ABS'],
  'mp-abs-cinza': ['Matérias-primas', 'Resinas', 'Termoplásticos', 'ABS'],
  'mp-tpu': ['Matérias-primas', 'Resinas', 'Elastômeros', 'TPU'],
  'mp-pc': ['Matérias-primas', 'Resinas', 'Termoplásticos', 'Policarbonato'],
  'cp-cabo': ['Componentes', 'Elétricos', 'Cabos'],
  'cp-placa': ['Componentes', 'Elétricos', 'Placas'],
  'cp-pelic': ['Componentes', 'Proteção', 'Vidros'],
  'cp-pelic-11': ['Componentes', 'Proteção', 'Vidros'],
  'cp-paraf': ['Componentes', 'Fixação', 'Parafusos'],
  'cp-alca': ['Componentes', 'Acessórios', 'Têxtil'],
  'cp-suporte': ['Componentes', 'Acessórios', 'Suportes'],
  'se-mold-a11': ['Peças injetadas', 'Gabinete', 'Molduras'],
  'se-mold-s9': ['Peças injetadas', 'Gabinete', 'Molduras'],
  'se-tampa-a11': ['Peças injetadas', 'Gabinete', 'Tampas'],
  'se-tampa-s9': ['Peças injetadas', 'Gabinete', 'Tampas'],
  'se-bump-a11': ['Peças injetadas', 'Proteção', 'Bumpers'],
  'se-base-lite': ['Peças injetadas', 'Estruturas', 'Bases'],
}

function typedDefaults(type: ItemType): Partial<ItemCatalog> {
  if (type === 'PA') return { ncm: '39269090', cest: '28.061.00', weightKg: 0.8 }
  if (type === 'SE') return { ncm: '39269090', cest: '28.061.00', lot: true, weightKg: 0.12 }
  if (type === 'MP') return { ncm: '39033090', lot: true, conversions: [{ unit: 'saco', factor: 25, context: 'Compra' }] }
  if (type === 'CP') return { ncm: '83024200' }
  if (type === 'EM') return { ncm: '48191000', conversions: [{ unit: 'fardo', factor: 20, context: 'Compra' }] }
  if (type === 'KT' || type === 'KF') return { ncm: '39269090', cest: '28.061.00' }
  if (type === 'IM') return { ncm: '94032090' }
  if (type === 'FE') return { ncm: '84807100' }
  return {}
}

const PRESET: Record<string, Partial<ItemCatalog>> = {
  'mp-abs': {
    ncm: '39033090', branches: [{ branch: 'Filial · Itabira', enabled: true, location: 'Galpão 2 / R-04', minimum: 50 }],
    homologation: { supplier: 'Resinas do Vale', status: 'Homologado', reference: 'HOM-MP-ABS', validUntil: '2027-03-31', tests: 'Tração e fluidez, laudo P&D PD-118' },
  },
  'mp-tpu': { ncm: '39095019', expiry: true },
  'mp-pc': { ncm: '39074090' },
  'cp-cabo': { ncm: '85444200', cest: '12.001.00' },
  'cp-placa': { ncm: '85423190', cest: '21.045.00', serial: true },
  'cp-pelic': { ncm: '70071900' },
  'cp-paraf': { ncm: '73181500', conversions: [{ unit: 'cento', factor: 100, context: 'Compra' }, { unit: 'milheiro', factor: 1000, context: 'Compra' }, { unit: 'kit8', factor: 8, context: 'Produção' }] },
  'cp-alca': { ncm: '63079090' },
  'cp-suporte': { ncm: '83024200' },
  'pa-a11-ext': { commercialName: 'Case Extreme para Samsung Tab A11', gtin: withCheckDigit('789123450001'), weightKg: 0.86, branches: [{ branch: 'Filial · Vitória', enabled: true, location: 'Showroom', minimum: 10 }] },
  'pa-a11-imp': { commercialName: 'Case Impact para Samsung Tab A11', gtin: withCheckDigit('789123450002'), weightKg: 0.62 },
  'pa-s9-min': { commercialName: 'Case Mining para Galaxy Tab S9 FE', ncm: '', cest: '', gtin: '' },
  'pa-lite-ipad': { commercialName: 'Mesa Lite para iPad 10ª geração', gtin: withCheckDigit('789123450004'), weightKg: 1.4 },
  'mp-abs-cinza': {
    lifecycle: 'Rascunho', ncm: '', approvals: {}, conversions: [],
    audit: [{ at: '2026-10-16T11:00:00.000Z', actor: 'Eduardo Freitas', version: 1, text: 'Rascunho aberto para a resina cinza. Ainda não entra em compra nem em produção.' }],
  },
  'cp-pelic-11': {
    lifecycle: 'Em homologação', ncm: '70071900', approvals: { fiscal: 'Patrícia Melo' },
    audit: [{ at: '2026-10-17T15:00:00.000Z', actor: 'Eduardo Freitas', version: 2, text: 'Enviado para homologação. Fiscal já validou o NCM.' }],
  },
  'sv-campo': { commercialName: 'Visita técnica Roboflex' },
  'kt-vitrine': { lifecycle: 'Em homologação', commercialName: 'Kit vitrine Impact + película', approvals: { fiscal: 'Patrícia Melo', pcp: 'Paulo Mendes' } },
  'kf-frota': { commercialName: 'Kit frota Impact (5 cases)', gtin: withCheckDigit('789123450006') },
  'im-rack': {},
}

function requiredFor(type: ItemType, nature: ItemNature): ApprovalRole[] {
  return requiredApprovals({ id: '', code: '', name: '', type, unit: '', stock: 0, minimum: 0, location: '', cost: 0, catalog: { ...blankCatalog(nature) } })
}

export function blankCatalog(nature: ItemNature): ItemCatalog {
  return {
    nature, classId: '', lifecycle: 'Ativo', version: 1, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
    ncm: '', cest: '', origin: '0', cClassTrib: '000001', exTipi: '', benefits: [], reform: [],
    gtin: '', gtinTax: '', barcodes: [], commercialName: '', brand: '', productLine: '', categories: [], prices: [],
    lot: false, expiry: false, serial: false, allowNegative: false, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0,
    minLot: 0, lotMultiple: 0, productionLeadDays: 0, costs: [], media: [], projectLinks: [], attributes: {},
    branches: [], conversions: [], approvals: {}, keyChanges: [], audit: [],
  }
}

/* ---------- Apoio ---------- */

export interface Change { field: string; from: string; to: string; reason?: string }

export function track(changes: Change[], field: string, from: string, to: string) {
  if (from !== to) changes.push({ field, from, to })
}

const yes = (value: boolean) => (value ? 'Sim' : 'Não')

/** Toda gravação sobe a versão do registro e deixa uma linha por campo alterado. */
export function commit(catalog: ItemCatalog, actor: string, changes: Change[]) {
  const at = now()
  catalog.version += 1
  catalog.updatedAt = at
  catalog.updatedBy = actor
  for (const change of changes.reverse()) {
    catalog.audit.unshift({
      at, actor, version: catalog.version, field: change.field, from: change.from, to: change.to, reason: change.reason,
      text: `${change.field}: ${change.from || 'vazio'} → ${change.to || 'vazio'}`,
    })
  }
}

function transition(state: ErpState, item: Item, to: ItemLifecycle, actor: string, reason: string) {
  const catalog = ensure(item)
  const from = catalog.lifecycle
  catalog.lifecycle = to
  commit(catalog, actor, [{ field: 'Situação', from, to, reason }])
  log(state, 'Produtos', actor, `${item.code}: ${from} → ${to}`, undefined, item.id)
}

export function editable(item: Item, role: Role, layer: CatalogLayer) {
  const catalog = ensure(item)
  if (catalog.deletedAt) throw new DomainError('Item excluído não pode ser alterado')
  if (!canEdit(role, layer)) throw new DomainError(`O perfil ${role} não altera ${LAYER_LABEL[layer].toLowerCase()}. Quem altera: ${editorsLabel(layer)}`)
  if (catalog.lifecycle === 'Inativo' && layer !== 'ciclo') throw new DomainError('Item inativo não pode ser alterado')
  return catalog
}

function draftRevision(state: ErpState, revisionId: string) {
  const revision = state.productRevisions.find(entry => entry.id === revisionId)
  if (!revision) throw new DomainError('Versão não encontrada')
  if (revision.status !== 'Rascunho') throw new DomainError('Só versão em rascunho pode ser alterada. A liberada fica preservada')
  return revision
}

function containsInTree(state: ErpState, rootId: string, targetId: string, guard = 0): boolean {
  if (guard > 20) return false
  const root = state.items.find(entry => entry.id === rootId)
  return (root?.bom ?? []).some(line => line.itemId === targetId || containsInTree(state, line.itemId, targetId, guard + 1))
}

function conversionIssue(item: Item, conversion: UnitConversion, others: UnitConversion[]) {
  const unit = conversion.unit.trim()
  if (!unit) return 'Informe a unidade alternativa'
  if (unit.toLowerCase() === item.unit.toLowerCase()) return 'A unidade alternativa tem de ser diferente da unidade base'
  if (!(conversion.factor > 0)) return 'O fator de conversão tem de ser maior que zero'
  if (others.some(entry => entry.unit.toLowerCase() === unit.toLowerCase() && entry.context === conversion.context)) return 'Já existe essa unidade neste contexto'
  return ''
}

function ensure(item: Item) {
  item.catalog ??= defaultCatalog(item)
  return item.catalog
}

export function findItem(state: ErpState, itemId: string) {
  const item = state.items.find(entry => entry.id === itemId)
  if (!item) throw new DomainError('Item não encontrado')
  return item
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}
