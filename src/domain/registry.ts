import type { ErpState } from './engine'
import { DEFAULT_TENANT, DomainError, log, nextId, now } from './engine'
import type { OmieEntity, OmieEntitySource, RegistryEntry, RegistryKind } from '../types/domain'

export const REGISTRY_KINDS: RegistryKind[] = ['Unidade', 'Moeda', 'Condição de pagamento', 'Origem de oportunidade', 'Motivo de perda', 'Motivo de recusa']

export const OMIE_ENTITIES: OmieEntity[] = ['Cliente', 'Fornecedor', 'Pedido de venda', 'Pedido de compra', 'Produto', 'Categoria financeira', 'Centro de custo', 'Faturamento']

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/** Opções ativas de uma lista, na ordem do cadastro. */
export function registryOptions(state: ErpState, kind: RegistryKind, tenantId = DEFAULT_TENANT) {
  return state.registry.filter(entry => entry.tenantId === tenantId && entry.kind === kind && entry.status === 'Ativo').map(entry => entry.description)
}

/** Código e descrição são únicos por empresa e tipo, sem diferenciar acento e maiúscula. */
export function saveRegistryEntry(state: ErpState, input: Pick<RegistryEntry, 'kind' | 'code' | 'description'> & { id?: string; status?: RegistryEntry['status'] }, actor: string) {
  const code = input.code.trim()
  const description = input.description.trim()
  if (!code || !description) throw new DomainError('Informe código e descrição')
  const siblings = state.registry.filter(entry => entry.tenantId === DEFAULT_TENANT && entry.kind === input.kind && entry.id !== input.id)
  if (siblings.some(entry => normalize(entry.code) === normalize(code))) throw new DomainError(`Já existe o código ${code} em ${input.kind}`)
  const same = siblings.find(entry => normalize(entry.description) === normalize(description))
  if (same) throw new DomainError(`${same.description} já está cadastrado em ${input.kind}${same.status === 'Inativo' ? ' (inativo; reative em vez de duplicar)' : ''}`)
  if (input.id) {
    const entry = state.registry.find(candidate => candidate.id === input.id)
    if (!entry) throw new DomainError('Opção não encontrada')
    if (entry.kind !== input.kind) throw new DomainError('O tipo da opção não muda')
    Object.assign(entry, { code, description, status: input.status ?? entry.status })
    log(state, 'Administração', actor, `${input.kind}: ${code} atualizado`)
    return entry
  }
  const entry: RegistryEntry = { id: nextId(state, 'CG'), tenantId: DEFAULT_TENANT, kind: input.kind, code, description, status: input.status ?? 'Ativo' }
  state.registry.push(entry)
  log(state, 'Administração', actor, `${input.kind}: ${code} · ${description} cadastrado`)
  return entry
}

export function setRegistryStatus(state: ErpState, id: string, status: RegistryEntry['status'], actor: string) {
  const entry = state.registry.find(candidate => candidate.id === id)
  if (!entry) throw new DomainError('Opção não encontrada')
  if (status === 'Inativo' && state.registry.filter(item => item.kind === entry.kind && item.tenantId === entry.tenantId && item.status === 'Ativo').length === 1) {
    throw new DomainError(`${entry.kind} precisa de ao menos uma opção ativa`)
  }
  entry.status = status
  log(state, 'Administração', actor, `${entry.kind}: ${entry.code} ${status === 'Ativo' ? 'reativado' : 'inativado'}`)
  return entry
}

/** Fonte oficial por entidade. Enquanto Pendente, nada daquela entidade sincroniza. */
export function setOmieSource(state: ErpState, entity: OmieEntity, source: OmieEntitySource['source'], direction: OmieEntitySource['direction'], actor: string, tenantId = DEFAULT_TENANT) {
  if (!OMIE_ENTITIES.includes(entity)) throw new DomainError('Entidade desconhecida')
  if (source === 'Thalamus' && direction === 'Receber') throw new DomainError('Se o Thalamus é a fonte, ele envia ao Omie')
  if (source === 'Omie' && direction === 'Enviar') throw new DomainError('Se o Omie é a fonte, o Thalamus recebe')
  let entry = state.omieSources.find(item => item.tenantId === tenantId && item.entity === entity)
  if (!entry) {
    entry = { tenantId, entity, source, direction }
    state.omieSources.push(entry)
  }
  Object.assign(entry, { source, direction, decidedBy: source === 'Pendente' ? undefined : actor, decidedAt: source === 'Pendente' ? undefined : now() })
  log(state, 'Integração', actor, `${entity}: fonte oficial ${source === 'Pendente' ? 'pendente (sincronização desligada)' : `${source}, ${direction.toLowerCase()}`}`)
  return entry
}
