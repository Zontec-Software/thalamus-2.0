import { computed, reactive, watch } from 'vue'
import { opportunityIsOpen } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Opportunity } from '../../types/domain'
import type { HeaderFilterOp } from '../products/shared'

/** Ano e mês do relógio da demonstração (29/10/2026). */
export const CRM_YEAR = 2026
export const CRM_MONTH = '2026-10'

export const CRM_SOURCES = ['Feira e Eventos', 'Canais Digitais', 'Prospecção Passiva', 'Prospecção Ativa', 'Indicação', 'Carteira', 'Site']
export const CRM_VERTICALS = ['Mineração', 'Logística', 'Automotivo', 'Farmacêutico', 'Energia', 'Agro', 'Indústria', 'Varejo']
export const LOSS_REASONS = ['Preço', 'Prazo', 'Concorrente', 'Projeto cancelado', 'Sem retorno']

/** Vendedor e grupo valem para todas as abas do CRM. */
export const crmScope = reactive({ owner: '', groupId: '' })

export type OpportunityLife = 'open' | 'won' | 'lost'
export const OPPORTUNITY_LIFE_TABS: { id: OpportunityLife; label: string }[] = [
  { id: 'open', label: 'Em aberto' },
  { id: 'won', label: 'Conquistadas' },
  { id: 'lost', label: 'Perdidas' },
]
export const lifeOf = (entry: Opportunity): OpportunityLife => entry.stage === 'Conquista' ? 'won' : entry.stage === 'Perdida' ? 'lost' : 'open'

export type OpportunityQuick = '' | 'Quente' | 'Morno' | 'Frio' | 'sem-status' | 'sem-acao' | 'vencida'

export type OpportunityColumn = 'id' | 'client' | 'stage' | 'owner' | 'temperature' | 'source' | 'segment' | 'probability' | 'close' | 'created' | 'won' | 'next' | 'tenant' | 'value' | 'mrr'
export type OptionalColumn = Exclude<OpportunityColumn, 'id' | 'client' | 'stage' | 'value' | 'mrr'>
export const OPPORTUNITY_COLUMNS: { id: OptionalColumn; label: string }[] = [
  { id: 'owner', label: 'Vendedor' },
  { id: 'temperature', label: 'Temperatura' },
  { id: 'source', label: 'Origem' },
  { id: 'segment', label: 'Vertical' },
  { id: 'probability', label: 'Probabilidade' },
  { id: 'close', label: 'Previsão de fechamento' },
  { id: 'created', label: 'Criação' },
  { id: 'won', label: 'Conversão' },
  { id: 'next', label: 'Próxima ação' },
  { id: 'tenant', label: 'Empresa' },
]

const COLUMNS_KEY = 'thalamus-crm-colunas'
const savedColumns = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null')
    return Array.isArray(raw) ? raw as OptionalColumn[] : undefined
  } catch {
    return undefined
  }
})()

const FILTER_COLUMNS: OpportunityColumn[] = ['id', 'client', 'stage', 'owner', 'temperature', 'source', 'segment', 'probability', 'close', 'created', 'won', 'next', 'tenant', 'value', 'mrr']
export const opportunityList = reactive({
  life: 'open' as OpportunityLife,
  quick: '' as OpportunityQuick,
  sort: 'close' as 'id' | 'close' | 'created' | 'value' | 'mrr',
  desc: false,
  columns: savedColumns ?? ['owner', 'temperature', 'source', 'segment', 'close'] as OptionalColumn[],
  headerFilters: Object.fromEntries(FILTER_COLUMNS.map(id => [id, { value: '', op: 'contains' as HeaderFilterOp }])) as Record<OpportunityColumn, { value: string; op: HeaderFilterOp }>,
})
watch(() => [...opportunityList.columns], columns => localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns)))

/** Sinais de gestão à vista de uma oportunidade em aberto. */
export function attentionOf(entry: Opportunity, today: string) {
  if (!opportunityIsOpen(entry)) return []
  const signals: string[] = []
  if (!entry.statusNote?.trim()) signals.push('Sem status')
  if (!entry.activities.some(activity => !activity.done)) signals.push('Sem próxima ação')
  if (entry.expectedClose < today) signals.push('Fechamento vencido')
  return signals
}

/** Oportunidades e propostas dentro da empresa ativa ou do grupo autorizado, e do vendedor escolhido. */
export function useCrmScope() {
  const store = useErpStore()
  const ui = useUiStore()
  const canGroup = computed(() => store.can('crm.consultar_consolidado'))
  const tenantIds = computed(() => {
    if (!canGroup.value || !crmScope.groupId) return [ui.activeTenantId]
    return store.state.tenants.filter(entry => entry.groupId === crmScope.groupId && entry.status === 'Ativa').map(entry => entry.id)
  })
  const inScope = (tenantId?: string) => !tenantId || tenantIds.value.includes(tenantId)
  const opportunities = computed(() => store.state.opportunities.filter(entry => inScope(entry.tenantId) && (!crmScope.owner || entry.ownerId === crmScope.owner)))
  const opportunityIds = computed(() => new Set(opportunities.value.map(entry => entry.id)))
  const proposals = computed(() => store.state.proposals.filter(entry => opportunityIds.value.has(entry.opportunityId)))
  const sellers = computed(() => [...new Map(store.state.users
    .filter(entry => !entry.platformMaster && (entry.role === 'Comercial' || entry.role === 'Gestor' || entry.role === 'Administrador'))
    .map(entry => [entry.id, entry])).values()])
  const tenantName = (id?: string) => store.state.tenants.find(entry => entry.id === (id ?? ui.activeTenantId))?.tradeName ?? '—'
  return { canGroup, tenantIds, inScope, opportunities, proposals, sellers, tenantName, grouped: computed(() => tenantIds.value.length > 1) }
}
