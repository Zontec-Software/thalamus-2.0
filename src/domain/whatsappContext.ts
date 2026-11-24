/**
 * Contexto de uma conversa do WhatsApp Web enviado pela extensão do Chrome ao chat de nova oportunidade.
 *
 * Protocolo (a extensão posta na janela do Thalamus; a página responde `ready` quando está pronta):
 *   extensão -> página: { source: 'thalamus-extension', type: 'whatsapp-context', version: 1, id, contact: { name, phone? }, messages: [{ from: 'client' | 'me', text, at? }] }
 *   página -> extensão: { source: 'thalamus-mockup', type: 'ready' }
 *
 * Aqui só há leitura e validação. Nada é gravado e a extensão é a única origem aceita.
 */

export const WHATSAPP_SOURCE = 'thalamus-extension'
export const WHATSAPP_READY = { source: 'thalamus-mockup', type: 'ready' } as const

const MAX_MESSAGES = 100
const MAX_TEXT = 1000

export interface WhatsappLine {
  from: 'client' | 'me'
  text: string
  at?: string
}

export interface WhatsappContext {
  id: string
  contact: { name: string; phone?: string }
  messages: WhatsappLine[]
}

const asText = (value: unknown, limit: number) => (typeof value === 'string' ? value.trim().slice(0, limit) : '')

/** Aceita só o que a extensão envia, no formato esperado. Devolve `undefined` para qualquer outra mensagem da janela. */
export function readWhatsappContext(data: unknown): WhatsappContext | undefined {
  if (!data || typeof data !== 'object') return undefined
  const raw = data as Record<string, unknown>
  if (raw.source !== WHATSAPP_SOURCE || raw.type !== 'whatsapp-context' || raw.version !== 1) return undefined
  const id = asText(raw.id, 80)
  const contact = raw.contact && typeof raw.contact === 'object' ? raw.contact as Record<string, unknown> : {}
  const name = asText(contact.name, 120)
  if (!id || !name || !Array.isArray(raw.messages)) return undefined
  const messages = raw.messages
    .map((entry): WhatsappLine | undefined => {
      if (!entry || typeof entry !== 'object') return undefined
      const line = entry as Record<string, unknown>
      const text = asText(line.text, MAX_TEXT)
      if (!text) return undefined
      return { from: line.from === 'me' ? 'me' : 'client', text, at: asText(line.at, 40) || undefined }
    })
    .filter((entry): entry is WhatsappLine => Boolean(entry))
    .slice(-MAX_MESSAGES)
  if (!messages.length) return undefined
  const phone = asText(contact.phone, 30).replace(/\D/g, '')
  return { id, contact: { name, phone: phone || undefined }, messages }
}

const digits = (value: string) => value.replace(/\D/g, '')

/** Telefone para exibir: +55 31 98800-1200. Fora do padrão brasileiro, devolve os dígitos com +. */
export function formatPhone(value: string) {
  const all = digits(value)
  const national = all.startsWith('55') && (all.length === 12 || all.length === 13) ? all.slice(2) : all
  if (national.length === 11) return `+55 ${national.slice(0, 2)} ${national.slice(2, 7)}-${national.slice(7)}`
  if (national.length === 10) return `+55 ${national.slice(0, 2)} ${national.slice(2, 6)}-${national.slice(6)}`
  return all ? `+${all}` : value
}

interface PhoneBook {
  id: string
  name: string
  contacts: { name: string; phone: string }[]
}

/**
 * Acha o cliente pelo telefone. Compara os 8 últimos dígitos, para não depender de +55, DDD ou do nono dígito.
 * Se mais de um cliente tem o mesmo número, não escolhe: o assistente pergunta.
 */
export function findPartnerByPhone<T extends PhoneBook>(partners: T[], phone: string | undefined) {
  const tail = digits(phone ?? '').slice(-8)
  if (tail.length < 8) return undefined
  const hits = partners.flatMap(partner => partner.contacts.filter(contact => digits(contact.phone).slice(-8) === tail).map(contact => ({ partner, contact })))
  const owners = new Set(hits.map(hit => hit.partner.id))
  return owners.size === 1 ? hits[0] : undefined
}

/** O que o cliente pediu por último: as mensagens finais dele, sem as nossas, para virar título e motivação. */
export function lastClientRequest(messages: WhatsappLine[]) {
  const mine = [...messages].reverse()
  const from = mine.findIndex(entry => entry.from === 'client')
  if (from < 0) return ''
  const run: string[] = []
  for (const entry of mine.slice(from)) {
    if (entry.from !== 'client') break
    run.unshift(entry.text)
    if (run.length === 3) break
  }
  return run.join(' ')
}

export interface PlannedEntry {
  from: 'assistant' | 'user'
  kind: 'text'
  text: string
  card?: { title: string; rows: { label: string; value: string }[] }
  whatsapp?: { contact: WhatsappContext['contact']; messages: WhatsappLine[] }
}
export interface PlannedReply {
  text: string
  link?: { label: string; to: string }
}

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text)

/**
 * Monta a abertura do chat a partir da conversa: a mensagem da pessoa com o anexo, a leitura do assistente
 * (cliente achado pelo telefone, pedido mais recente, previsão se a data estiver escrita) e a resposta à confirmação.
 * Só o telefone e a última fala do cliente são lidos; o resto do texto não é interpretado.
 */
export function planWhatsappChat(
  context: WhatsappContext,
  partners: (PhoneBook & { document: string; vertical?: string })[],
  opportunities: { id: string; partnerId: string }[],
) {
  const { contact, messages } = context
  const phone = contact.phone ? formatPhone(contact.phone) : ''
  const hit = findPartnerByPhone(partners, contact.phone)
  const request = lastClientRequest(messages)
  const br = request.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const closing = br ? `${br[1]}/${br[2]}/${br[3]}` : undefined
  const title = clip(request.split(/[.!?\n]/).map(part => part.trim()).find(part => part.length > 8) ?? request, 70) || contact.name

  const opening: PlannedEntry[] = [
    { from: 'user', kind: 'text', text: 'Crie uma oportunidade a partir desta conversa do WhatsApp.', whatsapp: { contact, messages } },
  ]
  const reply: PlannedReply = { text: '' }

  if (hit) {
    const known = opportunities.filter(entry => entry.partnerId === hit.partner.id)
    opening.push({
      from: 'assistant', kind: 'text',
      text: `Li as ${messages.length} mensagens da conversa com ${contact.name}. O número ${phone} é de ${hit.contact.name}, contato de ${hit.partner.name}: selecionei o cliente.`,
      card: {
        title: 'Cliente selecionado',
        rows: [
          { label: 'Cliente', value: hit.partner.name },
          { label: 'CNPJ', value: hit.partner.document },
          ...(hit.partner.vertical ? [{ label: 'Vertical', value: hit.partner.vertical }] : []),
          { label: 'Contato', value: `${hit.contact.name} · ${phone}` },
        ],
      },
    })
    const parts = [request ? `O pedido mais recente dele: "${clip(request, 220)}"` : 'Só há mensagens suas na conversa, então não identifiquei o pedido do cliente. O que ele quer?']
    if (request) parts.push(closing ? `Previsão de fechamento: ${closing}.` : 'Falta a previsão de fechamento. Quando ele pretende decidir?')
    if (known.length) parts.push(`${hit.partner.name} já tem ${known.length === 1 ? '1 oportunidade registrada' : `${known.length} oportunidades registradas`}; esta será uma nova, a menos que prefira continuar uma delas.`)
    opening.push({ from: 'assistant', kind: 'text', text: parts.join(' ') })
    reply.text = `Pronto, criei a oportunidade "${title}" para ${hit.partner.name}, na fase Novo contato. Se quiser ajustar algo, peça por aqui ou abra a ficha e edite direto.`
    const latest = known[known.length - 1]
    reply.link = latest ? { label: 'Ver oportunidade', to: `/crm/oportunidade/${latest.id}` } : { label: 'Ver oportunidades', to: '/crm/oportunidades' }
  } else {
    opening.push({
      from: 'assistant', kind: 'text',
      text: `Li as ${messages.length} mensagens da conversa com ${contact.name}. ${phone ? `Não encontrei o número ${phone} entre os contatos dos seus clientes.` : 'A conversa não traz o número do contato.'} Qual é o cliente? Se ainda não estiver cadastrado, eu cadastro com o nome e o telefone desta conversa.`,
    })
    reply.text = `Pronto, cadastrei ${contact.name} como cliente${phone ? `, com o telefone ${phone}` : ''}, e criei a oportunidade "${title}", na fase Novo contato. Se quiser ajustar algo, peça por aqui ou abra a ficha e edite direto.`
    reply.link = { label: 'Ver oportunidades', to: '/crm/oportunidades' }
  }
  return { opening, then: [reply] }
}
