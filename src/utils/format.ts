export const fmtDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR')

export const fmtShortDate = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')

export const fmtTime = (value: string) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function fmtDateTime(value: string) {
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay ? `Hoje, ${fmtTime(value)}` : `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${fmtTime(value)}`
}

export const fmtCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtNumber = (value: number, digits = 0) => value.toLocaleString('pt-BR', { maximumFractionDigits: digits })

export function fmtDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = String(Math.floor(total / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function daysUntil(date: string) {
  const target = new Date(`${date}T12:00:00`).getTime()
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()
  return Math.round((target - base) / 86400000)
}

const TONES: Record<string, string> = {
  sincronizado: 'success', Concluída: 'success', Disponível: 'success', Recebida: 'success', Faturado: 'success', Produzindo: 'success', Encerrada: 'success', Planejada: 'success', Aprovada: 'success', Conferido: 'success',
  pendente: 'warning', Pausada: 'warning', Parada: 'warning', Inspeção: 'warning', 'Em cotação': 'warning', 'Aguardando conferência': 'warning', 'Em análise': 'warning', 'Em execução': 'info', Aberta: 'danger',
  erro: 'danger', 'Aguardando material': 'danger', Manutenção: 'danger', Urgente: 'danger',
  Liberada: 'info', 'Em produção': 'info', 'Pedido emitido': 'info', Expedido: 'info', Alta: 'warning', Solicitada: 'neutral',
  Atendida: 'success', Recebido: 'success', Concluído: 'success', Baixado: 'success', Ganha: 'success', Aceita: 'success', Ativo: 'success', Operando: 'success', Aprovado: 'success',
  'Em atendimento': 'info', 'Recebido parcial': 'info', 'Em andamento': 'info', Negociação: 'info', Agendada: 'info', Enviada: 'info', Proposta: 'info', Qualificação: 'neutral', Lead: 'neutral',
  'Aguardando aprovação': 'warning', 'Aguardando peça': 'warning', Rascunho: 'warning', Planejado: 'warning', Aberto: 'warning', Parado: 'warning', 'Em manutenção': 'danger',
  Cancelada: 'neutral', Cancelado: 'neutral', Perdida: 'danger', Recusada: 'danger', Vencido: 'danger', Inativo: 'neutral', Expirada: 'neutral',
}

export const statusTone = (value: string) => TONES[value] ?? 'neutral'
