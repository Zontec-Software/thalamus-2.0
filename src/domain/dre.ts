import type { ErpState } from './engine'
import { isDepreciationCategory, leavesInGroup, monthRange, rangeSummary } from './budget'
import type { Asset } from '../types/domain'

/**
 * DRE de leitura. A árvore segue as seções do modelo usado na referência
 * (receita, deduções, custos, variáveis, fixas, EBITDA, premiação, depreciação,
 * não operacionais, lucro e CAPEX fora do resultado). Os valores saem do
 * orçamento da empresa. Depreciação vem dos ativos. A premiação é estimada
 * com a nota dos mesmos fatos de Indicadores. As contas ainda sem módulo
 * ficam zeradas de propósito.
 */

export interface DreLine {
  id: string
  kind: 'secao' | 'conta' | 'calculo'
  /** + soma, − reduz, = é subtotal. Vazio quando a linha fica fora do resultado. */
  sign: '+' | '−' | '=' | ''
  label: string
  budget: number
  realized: number
  /** true quando a linha entra no resultado. CAPEX fica de fora. */
  inResult: boolean
}

const round2 = (value: number) => Math.round(value * 100) / 100

export interface DrePeriod {
  year: string
  fromMonth: number
  toMonth: number
}

function groupAmount(state: ErpState, tenantIds: string[], group: string, period: DrePeriod, skip: (id: string) => boolean = () => false) {
  let budget = 0
  let realized = 0
  for (const tenantId of tenantIds) {
    for (const leaf of leavesInGroup(state, tenantId, group).filter(entry => !skip(entry.id))) {
      const summary = rangeSummary(state, leaf.id, period.year, period.fromMonth, period.toMonth)
      budget += Math.abs(summary.amount)
      realized += Math.abs(summary.realized)
    }
  }
  return { budget: round2(budget), realized: round2(realized) }
}

export function usefulLifeOf(asset: Pick<Asset, 'kind' | 'usefulLifeYears'>) {
  if (asset.usefulLifeYears && asset.usefulLifeYears > 0) return asset.usefulLifeYears
  return asset.kind === 'Molde' ? 5 : 10
}

/** Depreciação linear anual dos ativos da empresa. Na demonstração o cadastro de ativos é o da Roboflex. */
export function assetDepreciation(state: ErpState, tenantId: string) {
  if (tenantId !== 'tenant-roboflex') return { total: 0, rows: [] as { id: string; name: string; annual: number }[] }
  const rows = state.assets.flatMap(asset => {
    const value = asset.acquisitionValue ?? 0
    const life = usefulLifeOf(asset)
    if (!(value > 0)) return []
    return [{ id: asset.id, name: asset.name, annual: round2(value / life) }]
  })
  return { total: round2(rows.reduce((sum, row) => sum + row.annual, 0)), rows }
}

/** Nota 0–100 a partir dos mesmos fatos da tela de Indicadores: entrega no prazo e refugo. */
export function indicatorScore(state: ErpState) {
  const invoiced = state.salesOrders.filter(order => order.shipment?.shippedAt)
  const onTime = invoiced.length
    ? invoiced.filter(order => order.shipment!.shippedAt!.slice(0, 10) <= order.promisedDate).length / invoiced.length * 100
    : 0
  const operations = state.productionOrders.flatMap(order => order.operations)
  const good = operations.reduce((sum, operation) => sum + operation.good, 0)
  const scrap = operations.reduce((sum, operation) => sum + operation.scrap, 0)
  const quality = good + scrap ? 100 - scrap / (good + scrap) * 100 : 0
  const parts = [invoiced.length ? onTime : undefined, good + scrap ? quality : undefined].filter((value): value is number => value !== undefined)
  const score = parts.length ? round2(parts.reduce((sum, value) => sum + value, 0) / parts.length) : 0
  const people = state.users.filter(user => user.active !== false && !user.platformMaster).length
  return { score: Math.min(100, score), onTime: round2(onTime), quality: round2(quality), people }
}

/**
 * Estimativa da premiação SUPERA. A política de referência paga o benefício
 * quando o gatilho de resultado é atingido. Aqui o gatilho é nota a partir de
 * 80 e EBITDA positivo; o valor é 1% do EBITDA vezes a nota. Sem salário em
 * Pessoas, o percentual substitui a folha.
 */
export function superaEstimate(ebitda: number, score: number) {
  if (!(ebitda > 0) || score < 80) return 0
  return round2(ebitda * 0.01 * score / 100)
}

/**
 * Resultado de uma empresa ou da soma das empresas autorizadas, entre dois meses do ano.
 * A depreciação do intervalo é a fração dos meses sobre o valor anual dos ativos.
 */
export function dreStatement(state: ErpState, tenantIds: string[], period: DrePeriod): { lines: DreLine[]; score: ReturnType<typeof indicatorScore> } {
  const tenants = [...new Set(tenantIds)].filter(id => state.tenants.some(entry => entry.id === id))
  const skipDepreciation = (id: string) => {
    const category = state.budgetCategories.find(entry => entry.id === id)
    return category ? isDepreciationCategory(category) : false
  }
  const rob = groupAmount(state, tenants, '01. Receita Operacional Bruta', period)
  const ded = groupAmount(state, tenants, '02. Deduções da Receita', period)
  const custos = groupAmount(state, tenants, '03. Custos', period, skipDepreciation)
  const variaveis = groupAmount(state, tenants, '04. Despesas Variáveis', period)
  const fixas = groupAmount(state, tenants, '05. Despesas Fixas', period)
  const capex = groupAmount(state, tenants, '09. Investimentos (CAPEX)', period)
  const share = monthRange(period.fromMonth, period.toMonth).length / 12
  const depreciation = { budget: round2(tenants.reduce((sum, id) => sum + assetDepreciation(state, id).total, 0) * share), realized: 0 }
  const rol = { budget: round2(rob.budget - ded.budget), realized: round2(rob.realized - ded.realized) }
  const margem = { budget: round2(rol.budget - custos.budget - variaveis.budget), realized: round2(rol.realized - custos.realized - variaveis.realized) }
  const ebitda = { budget: round2(margem.budget - fixas.budget), realized: round2(margem.realized - fixas.realized) }
  const score = indicatorScore(state)
  const premiacao = { budget: superaEstimate(ebitda.budget, score.score), realized: superaEstimate(ebitda.realized, score.score) }
  const lair = { budget: round2(ebitda.budget - premiacao.budget - depreciation.budget), realized: round2(ebitda.realized - premiacao.realized - depreciation.realized) }
  const line = (id: string, kind: DreLine['kind'], sign: DreLine['sign'], label: string, budget: number, realized: number, inResult = true): DreLine =>
    ({ id, kind, sign, label, budget, realized, inResult })
  return {
    score,
    lines: [
      line('rob', 'secao', '+', 'Receita operacional bruta', rob.budget, rob.realized),
      line('ded', 'secao', '−', 'Deduções da receita', ded.budget, ded.realized),
      line('rol', 'calculo', '=', 'Receita operacional líquida', rol.budget, rol.realized),
      line('custos', 'secao', '−', 'Custos', custos.budget, custos.realized),
      line('var', 'secao', '−', 'Despesas variáveis', variaveis.budget, variaveis.realized),
      line('margem', 'calculo', '=', 'Margem de contribuição', margem.budget, margem.realized),
      line('fixas', 'secao', '−', 'Despesas fixas', fixas.budget, fixas.realized),
      line('ebitda', 'calculo', '=', 'EBITDA', ebitda.budget, ebitda.realized),
      line('supera', 'conta', '−', 'Premiação SUPERA', premiacao.budget, premiacao.realized),
      line('dep', 'secao', '−', 'Depreciação', depreciation.budget, depreciation.realized),
      line('nao', 'secao', '', 'Receitas e despesas não operacionais', 0, 0),
      line('lair', 'calculo', '=', 'Lucro antes do IR e CSLL', lair.budget, lair.realized),
      line('ir', 'secao', '−', 'Impostos sobre o lucro', 0, 0),
      line('liquido', 'calculo', '=', 'Lucro líquido', lair.budget, lair.realized),
      line('capex', 'secao', '', 'Investimentos', capex.budget, capex.realized, false),
    ],
  }
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function periodLabel(period: DrePeriod) {
  if (period.fromMonth === 1 && period.toMonth === 12) return period.year
  if (period.fromMonth === period.toMonth) return `${MONTHS[period.fromMonth - 1]} de ${period.year}`
  return `${MONTHS[period.fromMonth - 1]} a ${MONTHS[period.toMonth - 1]} de ${period.year}`
}

/** Frases de leitura do resultado. Saem dos mesmos números da tabela; nada é digitado. */
export function dreReading(lines: DreLine[], period: DrePeriod, topCenter?: { code: string; name: string; amount: number; share: number; company?: string }) {
  const value = (id: string) => lines.find(entry => entry.id === id) ?? { budget: 0, realized: 0 }
  const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const pct = (amount: number) => `${amount.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  const rob = value('rob')
  const ebitda = value('ebitda')
  const spend = ['custos', 'var', 'fixas'].reduce((sum, id) => ({ budget: sum.budget + value(id).budget, realized: sum.realized + value(id).realized }), { budget: 0, realized: 0 })
  const when = periodLabel(period)
  const result: string[] = []
  if (rob.budget > 0) {
    const reach = rob.realized / rob.budget * 100
    result.push(rob.realized > 0
      ? `Em ${when}, a receita realizada é ${money(rob.realized)}, ${pct(reach)} da meta de ${money(rob.budget)}.`
      : `Em ${when}, a meta de receita é ${money(rob.budget)} e nenhuma receita foi recebida ainda.`)
  }
  if (spend.budget > 0) result.push(`Custos e despesas consumiram ${pct(spend.realized / spend.budget * 100)} do orçado: ${money(spend.realized)} de ${money(spend.budget)}.`)
  result.push(ebitda.realized >= ebitda.budget
    ? `O EBITDA realizado (${money(ebitda.realized)}) está acima do orçado (${money(ebitda.budget)}).`
    : `O EBITDA realizado (${money(ebitda.realized)}) está ${money(ebitda.budget - ebitda.realized)} abaixo do orçado.`)
  if (topCenter) result.push(`O maior gasto pago está em ${topCenter.name}${topCenter.company ? ` (${topCenter.company})` : ''}: ${money(topCenter.amount)}, ${pct(topCenter.share)} do pago.`)
  return result
}
