/** Leitura simulada de um relato livre. No sistema real, o texto viria da fala. */
export function readOpportunityBrief(
  text: string,
  input: { clients: { id: string; name: string }[]; sources: readonly string[]; verticals: readonly string[] },
) {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  const partner = [...input.clients].sort((a, b) => b.name.length - a.name.length).find(client => client.name.length > 2 && lower.includes(client.name.toLowerCase()))
  const source = input.sources.find(entry => lower.includes(entry.toLowerCase()))
  const vertical = input.verticals.find(entry => lower.includes(entry.toLowerCase()))
  const dealType = lower.includes('locaç') ? 'Locação' as const : lower.includes('venda') ? 'Venda' as const : undefined
  const tenantId = lower.includes('zontec') ? 'tenant-roboflex-sul' : lower.includes('locaç') ? 'tenant-locacoes' : lower.includes('roboflex') ? 'tenant-roboflex' : undefined
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const expectedClose = iso ?? (br ? `${br[3]}-${br[2]}-${br[1]}` : undefined)
  const title = raw.split(/[.\n]/).map(part => part.trim()).find(part => part.length > 8)
  return {
    partnerId: partner?.id,
    source,
    vertical,
    dealType,
    tenantId,
    expectedClose,
    title: title?.slice(0, 80),
    notes: raw,
  }
}

export const SIMULATED_BRIEFS = {
  brief: 'Renovação de cases para a mina. Cliente Vale Log, origem Indicação, vertical Mineração, venda pela Roboflex, previsão 2026-12-15. Querem IP68 antes da parada.',
  status: 'Cliente pediu uma semana para validar a entrega com a operação.',
  email: 'Enviei o desenho da fixação e pedi retorno até sexta.',
  call: 'Liguei para o contato. Ele confirmou o volume e ficou de falar com a diretoria.',
  meeting: 'Pauta: confirmar lote, data da parada e quem assina a proposta.',
  product: 'Case novo com vedação diferente da linha atual. A engenharia precisa abrir a estrutura.',
  demand: 'Cabo e conector para o protótipo, custo estimado de 800 reais, necessário em novembro.',
} as const
