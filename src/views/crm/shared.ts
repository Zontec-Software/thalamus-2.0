import { computed, reactive, watch } from 'vue'
import { opportunityIsOpen } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Opportunity, Proposal } from '../../types/domain'

/** Ano e mês do relógio da demonstração (29/10/2026). */
export const CRM_YEAR = 2026
export const CRM_MONTH = '2026-10'

export const CRM_SOURCES = ['Feira e Eventos', 'Canais Digitais', 'Prospecção Passiva', 'Prospecção Ativa', 'Indicação', 'Carteira', 'Site']
export { CLIENT_VERTICALS as CRM_VERTICALS } from '../../domain/partners'
export const LOSS_REASONS = ['Preço', 'Prazo', 'Concorrente', 'Projeto cancelado', 'Sem retorno']

/** Vendedor e grupo valem para todas as abas do CRM. */
export const crmScope = reactive({ owner: '', groupId: '' })

export const lifeOf = (entry: Opportunity) => entry.stage === 'Conquista' ? 'won' as const : entry.stage === 'Perdida' ? 'lost' as const : 'open' as const

export const CRM_COMPANIES = [
  { id: 'tenant-roboflex', label: 'Roboflex' },
  { id: 'tenant-roboflex-sul', label: 'Zontec' },
  { id: 'tenant-locacoes', label: 'Locações' },
] as const
export const DEAL_TYPES = ['Venda', 'Locação'] as const

export type OpportunityColumn = 'id' | 'client' | 'stage' | 'owner' | 'temperature' | 'source' | 'segment' | 'close' | 'created' | 'tenant'
export const OPPORTUNITY_COLUMNS: { id: OpportunityColumn; label: string }[] = [
  { id: 'id', label: 'Código da oportunidade' },
  { id: 'client', label: 'Cliente' },
  { id: 'stage', label: 'Fase' },
  { id: 'owner', label: 'Vendedor' },
  { id: 'temperature', label: 'Temperatura' },
  { id: 'source', label: 'Origem' },
  { id: 'segment', label: 'Vertical' },
  { id: 'close', label: 'Previsão' },
  { id: 'created', label: 'Criação' },
  { id: 'tenant', label: 'Empresa' },
]

const COLUMNS_KEY = 'thalamus-crm-colunas-v2'
const savedColumns = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null')
    return Array.isArray(raw) ? raw.filter((id): id is OpportunityColumn => OPPORTUNITY_COLUMNS.some(column => column.id === id)) : undefined
  } catch {
    return undefined
  }
})()

export const ATTENTION_SIGNALS = ['Sem status', 'Sem próxima ação', 'Fechamento vencido'] as const
export const opportunityList = reactive({
  query: '',
  sort: 'close' as 'id' | 'close' | 'created' | 'value',
  desc: false,
  columns: savedColumns ?? OPPORTUNITY_COLUMNS.map(column => column.id),
})
watch(() => [...opportunityList.columns], columns => localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns)))

export function proposalSituation(status: Proposal['status']) {
  if (status === 'Aceita') return 'Aprovada'
  if (status === 'Recusada' || status === 'Expirada') return 'Cancelada'
  return 'Em análise'
}

export function monthSlice(amount: number, monthly: number[] | undefined, monthIndex: number) {
  if (monthly && monthly.length === 12) return monthly[monthIndex] ?? 0
  return amount / 12
}

/** Sinais de gestão à vista de uma oportunidade em aberto. */
export function attentionOf(entry: Opportunity, today: string) {
  if (!opportunityIsOpen(entry)) return []
  const signals: string[] = []
  if (!entry.statusNote?.trim()) signals.push(ATTENTION_SIGNALS[0])
  if (!entry.activities.some(activity => !activity.done)) signals.push(ATTENTION_SIGNALS[1])
  if (entry.expectedClose < today) signals.push(ATTENTION_SIGNALS[2])
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
