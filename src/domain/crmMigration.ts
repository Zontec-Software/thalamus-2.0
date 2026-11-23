import { DomainError } from './engine'
import type { OpportunityStage } from '../types/domain'

/**
 * Migração das oportunidades do CRM anterior. Função pura: não grava nada, só diz o que cada registro vira.
 * O uso (ganho, perda, suspensão, cancelamento) decide o desfecho; a fase só vale para o que segue em andamento.
 * Identificador, versões de proposta e anexos são preservados. Simulação: a carga real depende do arquivo de origem.
 */

export type LegacyPhase = 'Novo contato' | 'Qualificação' | 'Desenvolvimento' | 'Elaboração' | 'Proposta' | 'Negociação'
export type LegacyUse = 'Em andamento' | 'Ganho' | 'Perda' | 'Suspensão' | 'Cancelamento'

export interface LegacyOpportunity {
  id: string
  tenantId: string
  partnerId: string
  title: string
  ownerId: string
  phase: LegacyPhase
  use: LegacyUse
  value: number
  /** Números das versões de proposta que já existiam. */
  proposalVersions?: number[]
  attachments?: string[]
  lossReason?: string
}

export interface MigratedOpportunity {
  id: string
  stage: OpportunityStage
  lossReason?: string
  /** Desenvolvimento no CRM anterior vira Levantamento, e a demanda técnica acompanha. */
  demand?: { origin: 'Oportunidade'; originId: string; description: string }
  /** Elaboração no CRM anterior vira proposta em rascunho. */
  proposalDraft: boolean
  proposalVersions: number[]
  attachments: string[]
  notes: string[]
}

const OPEN_PHASE: Record<LegacyPhase, OpportunityStage> = {
  'Novo contato': 'Novo contato',
  Qualificação: 'Qualificação',
  Desenvolvimento: 'Levantamento',
  Elaboração: 'Proposta',
  Proposta: 'Proposta',
  Negociação: 'Proposta',
}

export function migrateLegacyOpportunity(legacy: LegacyOpportunity): MigratedOpportunity {
  if (!legacy.id || !legacy.tenantId || !legacy.partnerId) throw new DomainError('Oportunidade sem identificador, empresa ou cliente não migra')
  const base = { id: legacy.id, proposalVersions: [...(legacy.proposalVersions ?? [])], attachments: [...(legacy.attachments ?? [])], proposalDraft: false, notes: [] as string[] }
  if (legacy.use === 'Ganho') return { ...base, stage: 'Ganho' }
  if (legacy.use === 'Perda') return { ...base, stage: 'Perdido', lossReason: legacy.lossReason?.trim() || 'Outro' }
  if (legacy.use === 'Cancelamento') return { ...base, stage: 'Perdido', lossReason: 'Cancelamento', notes: ['Cancelada no CRM anterior.'] }
  if (legacy.use === 'Suspensão') return { ...base, stage: 'Perdido', lossReason: 'Outro', notes: ['Suspensa no CRM anterior: reabra uma nova oportunidade quando retomar.'] }
  const stage = OPEN_PHASE[legacy.phase]
  const result: MigratedOpportunity = { ...base, stage }
  if (legacy.phase === 'Desenvolvimento') result.demand = { origin: 'Oportunidade', originId: legacy.id, description: `Levantamento técnico de ${legacy.title}` }
  if (legacy.phase === 'Elaboração') result.proposalDraft = true
  return result
}

export const migrateLegacyOpportunities = (list: LegacyOpportunity[]) => list.map(migrateLegacyOpportunity)
